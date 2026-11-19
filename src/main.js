/**
 * RAG Spider — Web to Markdown for AI (Apify Actor)
 * 
 * Production-ready Web-to-RAG Data Intelligence Platform:
 * - Multi-format ingestion (HTML, PDF, DOCX, TXT, MD, CSV, JSON, XML)
 * - Sitemap intelligence and automatic URL discovery
 * - Technical documentation structure recognition (Docusaurus, MkDocs, Sphinx, GitBook)
 * - Deterministic content classification (12 technical taxonomy types)
 * - 8 configurable semantic chunking strategies
 * - Contextual chunk enrichment with stable collision-resistant identifiers
 * - Multi-level deduplication (Page & Chunk perceptual SimHash)
 * - 100% deterministic content quality scoring (0-100, Grades A+ to F)
 * - Incremental crawling & content change detection (KVS diff snapshots)
 * - 13+ production criteria RAG dataset validation
 * - Vector DB export payloads (Qdrant, Chroma, Pinecone, Weaviate, Milvus, JSONL, CSV)
 * - Standalone dark fintech HTML analytics dashboard (KVS 'OUTPUT')
 * - Safe crawling: SSRF protection, robots.txt, and proxy rotation
 */

import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import { createConfigManager } from './config/configManager.js';
import { createLogger, LogLevel, MetricCategory } from './utils/logger.js';
import { createContentExtractor } from './extraction/contentExtractor.js';
import { createTextChunker } from './processing/textChunker.js';
import { createTokenEstimator } from './processing/tokenEstimator.js';
import { routeAndExtractDocument, SupportedFormats } from './extraction/documentRouter.js';
import { discoverSitemaps } from './crawler/sitemapDiscovery.js';
import { analyzeDocumentationStructure } from './crawler/docCrawler.js';
import { classifyContent } from './processing/contentClassifier.js';
import { enrichChunksWithContext } from './processing/chunkEnricher.js';
import { DuplicateDetector } from './processing/duplicateDetector.js';
import { evaluateContentQuality } from './processing/qualityScorer.js';
import { CrawlStateManager, CrawlMode } from './storage/crawlStateManager.js';
import { SnapshotManager } from './storage/snapshotManager.js';
import { compareContentVersions } from './processing/changeDetector.js';
import { DatasetValidator } from './processing/datasetValidator.js';
import { detectLanguage } from './processing/languageDetector.js';
import { generateAndSaveExports } from './export/vectorExporter.js';
import { aggregateDashboardData } from './dashboard/dashboardData.js';
import { generateDashboardHtml } from './dashboard/dashboardGenerator.js';
import { extractAssets } from './extraction/assetExtractor.js';
import { extractStructuredData } from './extraction/structuredDataExtractor.js';
import { isSafeUrl, normalizeCanonicalUrl, extractFileExtension } from './utils/urlUtils.js';

await Actor.init();

const logger = createLogger({
    level: LogLevel.INFO,
    enableMetrics: true,
    enableMemoryMonitoring: true,
    metricsInterval: 30000
});

let crawlStateManager = null;
let dashboardSaved = false;
let config = null;
const startTime = Date.now();
const crawledRecords = [];
const allEnrichedChunks = [];
const changeReports = [];
const processingStats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    skippedRequests: 0,
    totalChunks: 0,
    totalTokens: 0,
    startTime
};

/**
 * Saves visual report dashboard to multiple compatible KVS keys:
 * - OUTPUT.html (default visual report view for Apify Console iframe)
 * - OUTPUT (standard Apify KVS output key)
 * - report.html (alternative standard file key)
 */
async function saveVisualDashboard(dashboardData) {
    if (dashboardSaved) return;
    try {
        const dashboardHtml = generateDashboardHtml(dashboardData);
        await Actor.setValue('OUTPUT.html', dashboardHtml, { contentType: 'text/html' });
        await Actor.setValue('OUTPUT', dashboardHtml, { contentType: 'text/html' });
        await Actor.setValue('report.html', dashboardHtml, { contentType: 'text/html' });
        dashboardSaved = true;

        try {
            const defaultKvs = await Actor.openKeyValueStore();
            const reportUrl = `https://api.apify.com/v2/key-value-stores/${defaultKvs.id}/records/OUTPUT.html`;
            logger.info('[RAG Spider] Visual dashboard successfully saved to Key-Value Store keys "OUTPUT.html" and "OUTPUT"');
            logger.info(`[RAG Spider] Visual report direct link: ${reportUrl}`);
        } catch {
            logger.info('[RAG Spider] Visual dashboard successfully saved to Key-Value Store keys "OUTPUT.html" and "OUTPUT"');
        }
    } catch (dashErr) {
        logger.warn('[RAG Spider] Failed to write visual dashboard to KVS:', { error: dashErr.message });
    }
}

try {
    logger.info('[RAG Spider] Initializing production actor...', { version: '2.0.0', pid: process.pid });

    // 1. Parse and validate input configuration
    const rawInput = await Actor.getInput() || {};
    logger.info('[RAG Spider] Raw input received', { inputKeys: Object.keys(rawInput) });

    const configManager = createConfigManager();
    try {
        config = configManager.parseAndValidate(rawInput);
        logger.info('[RAG Spider] Configuration validated successfully', configManager.getSummary());
    } catch (err) {
        logger.error('[RAG Spider] Input configuration validation failed', { error: err.message });
        await Actor.setValue('INPUT_VALIDATION_ERRORS', {
            error: err.message,
            field: err.field,
            timestamp: new Date().toISOString(),
            rawInput
        });
        throw err;
    }

    // 2. Register graceful abort signal handler
    crawlStateManager = new CrawlStateManager({
        crawlMode: config.crawlMode
    });
    await crawlStateManager.initialize();

    Actor.on('aborting', async () => {
        logger.warn('[RAG Spider] Abort signal received. Saving state and flushing KVS records...');
        if (crawlStateManager) {
            await crawlStateManager.saveState().catch(() => {});
        }
        if (!dashboardSaved) {
            try {
                const abortData = aggregateDashboardData({
                    crawledPages: crawledRecords,
                    allChunks: allEnrichedChunks,
                    processingStats: { ...processingStats, status: 'aborted' },
                    validationReport: {},
                    duplicateReport: {},
                    crawlMode: config?.crawlMode || 'full',
                    exportSummary: {},
                    startTime,
                    endTime: Date.now()
                });
                await saveVisualDashboard(abortData);
            } catch {}
        }
    });

    // 3. Initialize core services
    const snapshotManager = new SnapshotManager({ enabled: config.enableVersionHistory });
    const duplicateDetector = new DuplicateDetector({
        enabled: config.enableDeduplication,
        qualityThreshold: config.qualityThreshold
    });
    const datasetValidator = new DatasetValidator({
        maxChunkTokens: config.maxChunkTokens
    });
    const contentExtractor = createContentExtractor();
    const textChunker = createTextChunker({
        chunkSize: config.chunkSize,
        chunkOverlap: config.chunkOverlap,
        chunkingStrategy: config.chunkingStrategy,
        maxChunkTokens: config.maxChunkTokens,
        preserveHeadings: config.preserveHeadings
    });
    const tokenEstimator = createTokenEstimator();

    // 4. Discover Sitemaps if enabled
    const startUrlsList = config.startUrls.map(u => typeof u === 'object' ? u.url : u);
    let effectiveCrawlUrls = [...startUrlsList];

    if (config.sitemapDiscovery) {
        logger.info('[RAG Spider] Discovering sitemaps for start URLs...');
        try {
            const sitemapEntries = await discoverSitemaps(startUrlsList, {
                includeUrlGlobs: config.includeUrlGlobs,
                excludeUrlGlobs: config.excludeUrlGlobs,
                maxSitemapUrls: config.maxRequestsPerCrawl
            });
            if (sitemapEntries.length > 0) {
                logger.info(`[RAG Spider] Discovered ${sitemapEntries.length} URLs via sitemaps`);
                const sitemapUrls = sitemapEntries.map(e => e.url);
                effectiveCrawlUrls = Array.from(new Set([...effectiveCrawlUrls, ...sitemapUrls]));
            }
        } catch (sitemapErr) {
            logger.warn('[RAG Spider] Sitemap discovery warning:', { error: sitemapErr.message });
        }
    }

    // 5. Setup Proxy Configuration
    const proxyConfiguration = await Actor.createProxyConfiguration(config.proxyConfiguration);
    logger.info('[RAG Spider] Proxy configuration ready', {
        useApifyProxy: config.proxyConfiguration?.useApifyProxy || false
    });

    // 6. Configure PlaywrightCrawler
    const crawlerConfig = configManager.getCrawlerConfig();
    const {
        startUrls: _su,
        proxyConfiguration: _pc,
        requestDelay: _rd,
        _requestDelay: _drd,
        ...crawleeOptions
    } = crawlerConfig;

    const effectiveRequestDelay = _drd || _rd || config.requestDelay || 0;

    const crawler = new PlaywrightCrawler({
        ...crawleeOptions,
        launchContext: {
            launchOptions: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu'
                ]
            }
        },
        proxyConfiguration,
        maxConcurrency: config.maxConcurrency || crawlerConfig.maxConcurrency || 5,
        maxRequestsPerCrawl: config.maxRequestsPerCrawl,

        preNavigationHooks: [
            async ({ request }) => {
                if (!isSafeUrl(request.url)) {
                    request.skipNavigation = true;
                    logger.warn('[RAG Spider] Blocked unsafe / private IP URL (SSRF protection):', { url: request.url });
                    return;
                }

                if (effectiveRequestDelay > 0 && processingStats.totalRequests > 0) {
                    await new Promise(r => setTimeout(r, effectiveRequestDelay));
                }

                request.userData = {
                    startTime: Date.now(),
                    requestIndex: processingStats.totalRequests++
                };
            }
        ],

        requestHandler: async ({ request, page, enqueueLinks }) => {
            const requestUrl = request.url;
            logger.info(`[RAG Spider] Processing: ${requestUrl}`);

            try {
                let markdown = '';
                let title = '';
                let textContent = '';
                let headings = [];
                let assets = { images: [], diagrams: [], totalAssets: 0 };
                let structuredData = {};
                let docStructure = {};
                let extractionMethod = 'readability';
                let format = SupportedFormats.HTML;

                const fileExt = extractFileExtension(requestUrl);
                const isNonHtmlDoc = ['pdf', 'docx', 'csv', 'json', 'xml', 'txt', 'md'].includes(fileExt);

                if (isNonHtmlDoc) {
                    // Route multi-format documents via buffer fetch
                    logger.info(`[RAG Spider] Ingesting document file (${fileExt}): ${requestUrl}`);
                    const docResp = await page.request.get(requestUrl);
                    const docBuf = await docResp.body();
                    const mimeType = docResp.headers()['content-type'] || '';

                    const docResult = await routeAndExtractDocument(docBuf, {
                        url: requestUrl,
                        mimeType,
                        title: requestUrl.split('/').pop() || 'Document',
                        maximumDownloadSize: config.maximumDownloadSize
                    });

                    if (!docResult.success) {
                        throw new Error(docResult.error || `Failed to extract ${fileExt} document`);
                    }

                    markdown = docResult.markdown;
                    title = docResult.title || requestUrl;
                    textContent = docResult.textContent;
                    headings = docResult.headings || [];
                    format = docResult.format;
                    extractionMethod = docResult.extractionMethod;
                } else {
                    // Standard HTML & Dynamic JavaScript pages
                    const html = await page.content();
                    title = await page.title().catch(() => '');

                    // Extract asset metadata and structured data
                    assets = extractAssets(html, requestUrl);
                    structuredData = extractStructuredData(html, requestUrl);

                    // Documentation structure analysis
                    docStructure = analyzeDocumentationStructure(null, requestUrl);

                    // Extract content with readability fallback
                    const extraction = await contentExtractor.extract(html, requestUrl);
                    if (!extraction.success || !extraction.markdown) {
                        throw new Error(extraction.error || 'Content extraction yielded empty text');
                    }

                    markdown = extraction.markdown;
                    title = extraction.title || title || requestUrl;
                    textContent = extraction.textContent || '';
                    headings = extraction.headings || [];
                    extractionMethod = extraction.method || 'readability';

                    // Enqueue discovered child links if crawl depth permits
                    if (config.crawlDepth > 1 && enqueueLinks) {
                        await enqueueLinks({
                            globs: config.includeUrlGlobs.length > 0 ? config.includeUrlGlobs : undefined,
                            exclude: config.excludeUrlGlobs.length > 0 ? config.excludeUrlGlobs : undefined,
                            transformRequestFunction: (req) => {
                                if (!isSafeUrl(req.url)) return false;
                                return req;
                            }
                        }).catch(e => logger.debug(`[RAG Spider] enqueueLinks notice: ${e.message}`));
                    }
                }

                // 8. Incremental Crawling State Evaluation
                if (config.crawlMode === CrawlMode.INCREMENTAL) {
                    const stateEval = crawlStateManager.evaluateUrlState(requestUrl, markdown, {});
                    if (!stateEval.shouldProcess) {
                        logger.info(`[RAG Spider] Skipping unchanged URL (incremental mode): ${requestUrl}`);
                        processingStats.skippedRequests++;
                        return;
                    }
                }

                // 9. Page-level Duplicate Detection
                const pageDup = duplicateDetector.checkPageDuplicate(
                    requestUrl,
                    markdown,
                    structuredData.canonicalUrl
                );

                // 10. Content Classification & Language Detection
                const classification = classifyContent({
                    url: requestUrl,
                    title,
                    markdown,
                    headings,
                    metadata: structuredData
                });

                const langResult = detectLanguage(markdown);

                // 11. Change Detection and Diff Tracking
                let changeReport = null;
                if (config.enableChangeDetection) {
                    const prevSnapshot = await snapshotManager.getSnapshot(requestUrl);
                    changeReport = compareContentVersions(prevSnapshot, markdown, requestUrl);
                    changeReports.push(changeReport);

                    if (config.enableVersionHistory) {
                        await snapshotManager.saveSnapshot(requestUrl, markdown, { title });
                    }
                }

                // 12. Quality Scoring
                const quality = evaluateContentQuality({
                    markdown,
                    title,
                    headings,
                    metadata: structuredData,
                    chunkCount: 1
                }, { qualityThreshold: config.qualityThreshold });

                // 13. Semantic Chunking
                const chunkingResult = await textChunker.chunk(markdown, {
                    strategy: config.chunkingStrategy,
                    maxChunkTokens: config.maxChunkTokens,
                    preserveHeadings: config.preserveHeadings,
                    sourceUrl: requestUrl
                });

                const rawChunks = chunkingResult.success && chunkingResult.chunks.length > 0
                    ? chunkingResult.chunks
                    : [{ content: markdown, index: 0 }];

                // 14. Contextual Chunk Enrichment
                const enrichedChunks = enrichChunksWithContext(rawChunks, {
                    url: requestUrl,
                    canonicalUrl: structuredData.canonicalUrl || requestUrl,
                    title,
                    contentType: classification.contentType,
                    language: langResult.language,
                    version: docStructure.version,
                    section: docStructure.section,
                    breadcrumbs: docStructure.breadcrumbs,
                    extractionMethod,
                    timestamp: new Date().toISOString()
                });

                // Calculate token distribution for chunks
                let pageTokens = 0;
                for (const chunk of enrichedChunks) {
                    const est = await tokenEstimator.estimateTokens(chunk.content);
                    chunk.tokens = est.tokenCount;
                    chunk.wordCount = est.wordCount;
                    chunk.charCount = chunk.content.length;
                    pageTokens += est.tokenCount;

                    // 15. Chunk-level Duplicate Detection
                    duplicateDetector.checkChunkDuplicate(chunk.chunkId, chunk.content, requestUrl);
                    allEnrichedChunks.push(chunk);
                }

                // 16. Record Crawl State for Incremental Support
                crawlStateManager.recordPageState(requestUrl, markdown, {});

                // 17. Build Unified Versioned Output Model (Section 6.20)
                const record = {
                    schemaVersion: '1.0.0',
                    documentId: enrichedChunks[0]?.documentId || `doc_${requestUrl}`,
                    url: requestUrl,
                    canonicalUrl: structuredData.canonicalUrl || requestUrl,
                    title,
                    format,
                    extractionMethod,
                    status: 'success',
                    isDuplicate: pageDup.isDuplicate,
                    duplicateOf: pageDup.duplicateOf || null,
                    contentType: classification.contentType,
                    classificationConfidence: classification.classificationConfidence,
                    classificationEvidence: classification.classificationEvidence,
                    qualityScore: quality.qualityScore,
                    qualityGrade: quality.qualityGrade,
                    qualitySignals: quality.qualitySignals,
                    qualityWarnings: quality.qualityWarnings,
                    language: langResult.language,
                    languageConfidence: langResult.confidence,
                    markdown,
                    totalChunks: enrichedChunks.length,
                    totalTokens: pageTokens,
                    totalWords: enrichedChunks.reduce((sum, c) => sum + (c.wordCount || 0), 0),
                    docStructure: {
                        isDocumentation: docStructure.isDocumentation || false,
                        framework: docStructure.framework || 'unknown',
                        version: docStructure.version || null,
                        section: docStructure.section || null,
                        breadcrumbs: docStructure.breadcrumbs || []
                    },
                    assets: {
                        imagesCount: assets.images?.length || 0,
                        diagramsCount: assets.diagrams?.length || 0,
                        items: assets.images?.slice(0, 20) || []
                    },
                    structuredData: {
                        openGraph: structuredData.openGraph || {},
                        jsonLdTypes: structuredData.jsonLd?.map(j => j['@type']).filter(Boolean) || []
                    },
                    chunks: enrichedChunks,
                    extractedAt: new Date().toISOString()
                };

                // Push page record to default Apify Dataset
                await Actor.pushData(record);
                crawledRecords.push(record);

                processingStats.successfulRequests++;
                processingStats.totalChunks += enrichedChunks.length;
                processingStats.totalTokens += pageTokens;

                logger.info(`[RAG Spider] Done: ${requestUrl} (${enrichedChunks.length} chunks, ${pageTokens} tokens, Grade ${quality.qualityGrade})`);

            } catch (pageErr) {
                processingStats.failedRequests++;
                logger.error(`[RAG Spider] Failed processing ${requestUrl}:`, { error: pageErr.message });

                const failedRecord = {
                    schemaVersion: '1.0.0',
                    url: requestUrl,
                    status: 'error',
                    error: pageErr.message,
                    extractedAt: new Date().toISOString()
                };
                await Actor.pushData(failedRecord);
                crawledRecords.push(failedRecord);
            }
        },

        failedRequestHandler: async ({ request }) => {
            processingStats.failedRequests++;
            logger.error(`[RAG Spider] Request failed permanently: ${request.url}`);
            await Actor.pushData({
                schemaVersion: '1.0.0',
                url: request.url,
                status: 'request_failed',
                error: 'Maximum crawl retries exhausted',
                extractedAt: new Date().toISOString()
            });
        }
    });

    // 18. Add URLs to Crawler Queue and Execute
    await crawler.addRequests(effectiveCrawlUrls.map(u => ({ url: u })));
    logger.info(`[RAG Spider] Starting crawl operation with ${effectiveCrawlUrls.length} queued URLs...`);

    await crawler.run();

    // 19. Post-Crawl Processing: State, Reports, and Exports
    const endTime = Date.now();
    processingStats.endTime = endTime;
    processingStats.totalDurationMs = endTime - startTime;

    // Save incremental crawl state
    await crawlStateManager.saveState();

    // Deep RAG dataset validation (Section 6.11)
    logger.info('[RAG Spider] Running RAG dataset validation...');
    const validationReport = datasetValidator.validateDataset(crawledRecords);
    await Actor.setValue('VALIDATION_REPORT', validationReport);

    // Duplicate detection report (Section 6.7)
    const duplicateReport = duplicateDetector.getDuplicateReport();
    await Actor.setValue('DUPLICATE_REPORT', duplicateReport);

    // Change detection summary report (Section 6.10)
    const changeReportSummary = {
        totalAnalyzed: changeReports.length,
        changedPages: changeReports.filter(r => r.hasChanged).length,
        unchangedPages: changeReports.filter(r => !r.hasChanged).length,
        reports: changeReports.slice(0, 100),
        generatedAt: new Date().toISOString()
    };
    await Actor.setValue('CHANGE_REPORT', changeReportSummary);

    // Crawl summary and processing statistics
    const crawlSummary = {
        schemaVersion: '1.0.0',
        totalPagesCrawled: crawledRecords.length,
        successfulPages: processingStats.successfulRequests,
        failedPages: processingStats.failedRequests,
        skippedPages: processingStats.skippedRequests,
        totalChunksExtracted: allEnrichedChunks.length,
        totalTokensEstimated: processingStats.totalTokens,
        crawlDurationSecs: Math.round((endTime - startTime) / 1000),
        validationStatus: validationReport.isValid ? 'PASSED' : 'WARNINGS',
        criticalIssues: validationReport.criticalCount,
        completedAt: new Date().toISOString()
    };
    await Actor.setValue('CRAWL_SUMMARY', crawlSummary);

    const finalProcessingStats = {
        ...processingStats,
        performanceMetrics: logger.getPerformanceStats(),
        configSummary: configManager.getSummary(),
        timestamp: new Date().toISOString()
    };
    await Actor.setValue('PROCESSING_STATISTICS', finalProcessingStats);

    // 20. Multi-Format Vector DB Exports (Section 6.17)
    logger.info('[RAG Spider] Generating vector database export files...');
    const exportSummary = await generateAndSaveExports(allEnrichedChunks, {
        format: config.exportFormat,
        generateAllExports: true
    });

    // 21. Standalone Visual Analytics Dashboard (Section 6.18)
    if (config?.generateDashboard !== false) {
        logger.info('[RAG Spider] Rendering standalone Dark Fintech visual report for KVS "OUTPUT.html"...');
        try {
            const dashboardData = aggregateDashboardData({
                crawledPages: crawledRecords,
                allChunks: allEnrichedChunks,
                processingStats: finalProcessingStats,
                validationReport,
                duplicateReport,
                crawlMode: config.crawlMode,
                exportSummary,
                startTime,
                endTime
            });
            await saveVisualDashboard(dashboardData);
        } catch (dashErr) {
            logger.warn('[RAG Spider] Visual dashboard generation warning:', { error: dashErr.message });
        }
    }

    logger.info('[RAG Spider] Execution completed successfully', {
        pages: crawledRecords.length,
        chunks: allEnrichedChunks.length,
        tokens: processingStats.totalTokens,
        durationSecs: Math.round((endTime - startTime) / 1000)
    });

} catch (error) {
    logger.error('[RAG Spider] Fatal error during crawl execution:', {
        message: error.message,
        stack: error.stack
    });

    // Ensure a diagnostic dashboard is generated and saved even if crawl failed early
    if (!dashboardSaved) {
        try {
            const fallbackDashboardData = aggregateDashboardData({
                crawledPages: crawledRecords,
                allChunks: allEnrichedChunks,
                processingStats: {
                    ...processingStats,
                    error: error.message,
                    status: 'failed'
                },
                validationReport: {
                    isValid: false,
                    criticalCount: 1,
                    warningCount: 0,
                    errors: [{ message: error.message }]
                },
                duplicateReport: {},
                crawlMode: config?.crawlMode || 'full',
                exportSummary: {},
                startTime,
                endTime: Date.now()
            });
            await saveVisualDashboard(fallbackDashboardData);
        } catch (fbErr) {
            logger.warn('[RAG Spider] Failed to write fallback visual dashboard:', { error: fbErr.message });
        }
    }

    throw error;
} finally {
    logger.cleanup();
    await Actor.exit();
}
