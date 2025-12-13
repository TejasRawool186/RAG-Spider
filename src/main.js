/**
 * RAG Spider - Web to Markdown Crawler for AI Training
 * 
 * This is the main entry point for the Apify Actor that crawls documentation
 * websites and converts them to clean, chunked Markdown for RAG systems.
 */

import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import { createConfigManager } from './config/configManager.js';

// Import implemented components
import { createContentExtractor } from './extraction/contentExtractor.js';
import { createTextChunker } from './processing/textChunker.js';
import { createMetadataEnricher } from './processing/metadataEnricher.js';
import { createTokenEstimator } from './processing/tokenEstimator.js';
import { createLogger, LogLevel, MetricCategory } from './utils/logger.js';

/**
 * Main Actor entry point
 */
await Actor.main(async () => {
    // Initialize logger with comprehensive monitoring
    const logger = createLogger({
        level: LogLevel.INFO,
        enableMetrics: true,
        enableMemoryMonitoring: true,
        metricsInterval: 30000 // 30 seconds
    });

    logger.info('RAG Spider starting...', { version: '1.0.0', pid: process.pid });

    // Get and validate input configuration
    const input = await Actor.getInput();
    logger.info('Raw input received', { inputKeys: Object.keys(input || {}) });

    // Initialize configuration manager and validate input
    const configManager = createConfigManager();
    let config;

    try {
        const configTimer = logger.startTimer('config_validation', MetricCategory.PROCESSING);
        config = configManager.parseAndValidate(input);
        logger.endTimer(configTimer);

        logger.info('Configuration validation successful', configManager.getSummary());
        logger.recordSuccess('config_validation', MetricCategory.PROCESSING);
    } catch (error) {
        logger.error('Configuration validation failed', {
            errors: configManager.getErrors(),
            rawInput: input
        });
        logger.recordError('config_validation', MetricCategory.PROCESSING, error);

        // Store error information for debugging
        await Actor.setValue('INPUT_VALIDATION_ERRORS', {
            errors: configManager.getErrors(),
            timestamp: new Date().toISOString(),
            rawInput: input
        });

        throw error;
    }

    // Initialize content extraction pipeline
    logger.info('Initializing content extraction pipeline...');
    const contentExtractor = createContentExtractor();

    // Initialize text processing services
    logger.info('Initializing text processing services...', {
        chunkSize: config.chunkSize,
        chunkOverlap: config.chunkOverlap
    });
    const textChunker = createTextChunker({
        chunkSize: config.chunkSize,
        chunkOverlap: config.chunkOverlap
    });
    const metadataEnricher = createMetadataEnricher();
    const tokenEstimator = createTokenEstimator();

    logger.info('All components initialized successfully');

    // Create proxy configuration instance
    const proxyConfiguration = await Actor.createProxyConfiguration(
        configManager.getConfig().proxyConfiguration
    );
    logger.info('Proxy configuration initialized', {
        proxyEnabled: configManager.getConfig().proxyConfiguration?.useApifyProxy || false
    });

    // Get crawler configuration
    const crawlerConfig = configManager.getCrawlerConfig();

    // Initialize processing statistics
    let processingStats = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalChunks: 0,
        totalTokens: 0,
        startTime: Date.now()
    };

    // Extract startUrls and custom options from crawler config (PlaywrightCrawler doesn't accept them in constructor)
    const { startUrls, proxyConfiguration: _, _requestDelay, ...crawlerOptions } = crawlerConfig;

    // Set up crawler with complete request handler pipeline
    const crawler = new PlaywrightCrawler({
        // Use validated configuration (excluding startUrls and proxyConfiguration)
        ...crawlerOptions,
        // Add the properly instantiated proxy configuration
        proxyConfiguration,

        // Add request preprocessing with delay implementation
        preNavigationHooks: [
            async ({ request }) => {
                // Implement request delay manually
                if (_requestDelay && _requestDelay > 0 && processingStats.totalRequests > 0) {
                    logger.info(`Applying request delay: ${_requestDelay}ms`);
                    await new Promise(resolve => setTimeout(resolve, _requestDelay));
                }

                request.userData = {
                    startTime: Date.now(),
                    requestIndex: processingStats.totalRequests++
                };
            }
        ],

        // Complete request handler pipeline
        requestHandler: async ({ request, page, log }) => {
            const requestTimer = logger.startTimer('request_processing', MetricCategory.PROCESSING);
            logger.info('Processing request', { url: request.url });

            try {
                // Step 1: Extract page content
                const contentTimer = logger.startTimer('page_content_extraction', MetricCategory.EXTRACTION);
                const html = await page.content();
                const title = await page.title();
                logger.endTimer(contentTimer);

                logger.info('Page content extracted', {
                    title,
                    htmlLength: html.length,
                    url: request.url
                });

                // Step 2: Extract and convert content to Markdown
                const extractionTimer = logger.startTimer('content_extraction', MetricCategory.EXTRACTION);
                const extractionResult = await contentExtractor.extract(html, request.url);
                logger.endTimer(extractionTimer);

                if (!extractionResult.success || !extractionResult.markdown) {
                    logger.warn('Content extraction failed', {
                        url: request.url,
                        error: extractionResult.error || 'Unknown extraction error'
                    });
                    logger.recordError('content_extraction', MetricCategory.EXTRACTION);

                    await Actor.pushData({
                        url: request.url,
                        title,
                        status: 'extraction_failed',
                        error: extractionResult.error || 'Unknown extraction error',
                        timestamp: new Date().toISOString()
                    });
                    return;
                }

                logger.info('Content extraction successful', {
                    url: request.url,
                    markdownLength: extractionResult.markdown.length,
                    method: extractionResult.method
                });
                logger.recordSuccess('content_extraction', MetricCategory.EXTRACTION);

                // Step 3: Chunk the content
                const chunkingTimer = logger.startTimer('text_chunking', MetricCategory.CHUNKING);
                const chunkingResult = textChunker.chunk(extractionResult.markdown, {
                    preserveStructure: true,
                    metadata: {
                        url: request.url,
                        title: title
                    }
                });
                logger.endTimer(chunkingTimer);

                if (!chunkingResult.success || chunkingResult.chunks.length === 0) {
                    logger.warn('Text chunking failed', {
                        url: request.url,
                        error: chunkingResult.error || 'No chunks generated'
                    });
                    logger.recordError('text_chunking', MetricCategory.CHUNKING);

                    await Actor.pushData({
                        url: request.url,
                        title,
                        status: 'chunking_failed',
                        error: chunkingResult.error || 'No chunks generated',
                        timestamp: new Date().toISOString()
                    });
                    return;
                }

                logger.info('Text chunking successful', {
                    url: request.url,
                    chunkCount: chunkingResult.chunks.length
                });
                logger.recordSuccess('text_chunking', MetricCategory.CHUNKING);

                // Step 4: Enrich metadata and estimate tokens
                const processingTimer = logger.startTimer('metadata_processing', MetricCategory.PROCESSING);

                // Prepare source info for metadata enrichment
                const sourceInfo = {
                    url: request.url,
                    title: title,
                    crawledAt: new Date().toISOString()
                };

                const processingInfo = {
                    method: 'langchain-recursive',
                    extractionMethod: extractionResult.method,
                    processingTime: Date.now()
                };

                // Enrich chunks with metadata
                const enrichmentResult = await metadataEnricher.enrich(
                    chunkingResult.chunks,
                    sourceInfo,
                    processingInfo
                );

                // Calculate token estimates
                const enrichedChunks = [];
                let totalTokens = 0;

                for (let i = 0; i < enrichmentResult.enrichedChunks.length; i++) {
                    const enrichedChunk = enrichmentResult.enrichedChunks[i];
                    const tokenEstimate = await tokenEstimator.estimateTokens(enrichedChunk.content);

                    const tokenCount = tokenEstimate.tokenCount || 0;
                    const wordCount = tokenEstimate.wordCount || 0;
                    totalTokens += tokenCount;

                    enrichedChunks.push({
                        content: enrichedChunk.content,
                        metadata: enrichedChunk.metadata,
                        tokens: tokenCount,
                        wordCount: wordCount,
                        chunkIndex: i,
                        chunkId: enrichedChunk.id || `${request.url}#chunk-${i}`
                    });
                }
                logger.endTimer(processingTimer);

                logger.info('Metadata processing completed', {
                    url: request.url,
                    totalTokens,
                    totalChunks: enrichedChunks.length
                });

                // Step 5: Store results in Apify Dataset
                const result = {
                    url: request.url,
                    title: title,
                    status: 'success',
                    extractionMethod: extractionResult.method,
                    totalChunks: enrichedChunks.length,
                    totalTokens: totalTokens,
                    totalWords: enrichedChunks.reduce((sum, chunk) => sum + chunk.wordCount, 0),
                    chunks: enrichedChunks,
                    processingStats: {
                        extractionTime: extractionResult.processingTime,
                        chunkingTime: chunkingResult.processingTime,
                        totalProcessingTime: Date.now() - request.userData?.startTime || 0
                    },
                    timestamp: new Date().toISOString(),
                    configSummary: configManager.getSummary()
                };

                await Actor.pushData(result);

                // Update statistics
                processingStats.successfulRequests++;
                processingStats.totalChunks += enrichedChunks.length;
                processingStats.totalTokens += totalTokens;

                // Update logger metrics
                logger.incrementCounter('pages_processed', MetricCategory.PROCESSING);
                logger.incrementCounter('chunks_generated', MetricCategory.PROCESSING, enrichedChunks.length);
                logger.incrementCounter('tokens_estimated', MetricCategory.PROCESSING, totalTokens);
                logger.setGauge('last_processing_time', MetricCategory.PROCESSING, logger.endTimer(requestTimer));

                logger.info('Request processing completed successfully', {
                    url: request.url,
                    chunks: enrichedChunks.length,
                    tokens: totalTokens,
                    processingTime: `${Date.now() - request.userData?.startTime || 0}ms`
                });
                logger.recordSuccess('request_processing', MetricCategory.PROCESSING);

            } catch (error) {
                logger.error('Request processing failed', {
                    url: request.url,
                    error: error.message,
                    stack: error.stack
                });
                logger.recordError('request_processing', MetricCategory.PROCESSING, error);
                logger.incrementCounter('processing_errors', MetricCategory.PROCESSING);

                // Clean up any running timers
                if (requestTimer) {
                    logger.endTimer(requestTimer);
                }

                // Store error information
                await Actor.pushData({
                    url: request.url,
                    title: await page.title().catch(() => 'Unknown'),
                    status: 'error',
                    error: error.message,
                    errorStack: error.stack,
                    timestamp: new Date().toISOString()
                });
            }
        },

        // Enhanced error handling with statistics tracking
        failedRequestHandler: async ({ request, log }) => {
            processingStats.failedRequests++;

            logger.error('Request failed during crawling', {
                url: request.url,
                retryCount: request.retryCount || 0
            });
            logger.recordError('request_crawling', MetricCategory.NETWORK);
            logger.incrementCounter('failed_requests', MetricCategory.NETWORK);

            // Store failure information
            await Actor.pushData({
                url: request.url,
                status: 'request_failed',
                error: 'Request failed during crawling',
                retryCount: request.retryCount || 0,
                timestamp: new Date().toISOString()
            });
        }
    });

    // Add start URLs to the crawler (now validated)
    await crawler.addRequests(startUrls);
    logger.info('Start URLs added to crawler', {
        count: startUrls.length,
        urls: startUrls
    });

    // Start crawling
    logger.info('Starting crawl operation...');
    const crawlTimer = logger.startTimer('total_crawl', MetricCategory.PROCESSING);

    await crawler.run();

    const totalCrawlTime = logger.endTimer(crawlTimer);
    logger.info('Crawl operation completed', {
        totalTime: `${totalCrawlTime}ms`
    });

    // Calculate final statistics
    processingStats.endTime = Date.now();
    processingStats.totalDuration = processingStats.endTime - processingStats.startTime;
    processingStats.successRate = processingStats.totalRequests > 0
        ? Math.round((processingStats.successfulRequests / processingStats.totalRequests) * 100)
        : 0;

    // Get comprehensive performance statistics from logger
    const performanceStats = logger.getPerformanceStats();

    // Store final processing statistics
    const finalStats = {
        ...processingStats,
        performanceMetrics: performanceStats,
        configSummary: configManager.getSummary(),
        timestamp: new Date().toISOString()
    };

    await Actor.setValue('PROCESSING_STATISTICS', finalStats);

    // Log comprehensive final statistics
    logger.info('Final processing statistics', {
        totalRequests: processingStats.totalRequests,
        successfulRequests: processingStats.successfulRequests,
        failedRequests: processingStats.failedRequests,
        successRate: `${processingStats.successRate}%`,
        totalDuration: `${Math.round(processingStats.totalDuration / 1000)}s`,
        totalChunks: processingStats.totalChunks,
        totalTokens: processingStats.totalTokens
    });

    // Log performance summary
    logger.logPerformanceSummary();

    logger.info('RAG Spider completed successfully', {
        uptime: performanceStats.uptimeFormatted,
        memoryUsage: performanceStats.memory.current
    });

    // Cleanup logger resources
    logger.cleanup();
});