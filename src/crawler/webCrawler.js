/**
 * Web Crawler Service for RAG Spider
 * 
 * This module provides a Crawlee-based web crawler with URL filtering,
 * depth limiting, and content extraction capabilities for documentation sites.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { PlaywrightCrawler, Dataset } from 'crawlee';
import { minimatch } from 'minimatch';
import { 
    createErrorHandler, 
    CrawlerError, 
    ErrorCategory, 
    ErrorSeverity,
    categorizeError 
} from '../utils/errorHandler.js';

/**
 * Default configuration for web crawling
 */
const DEFAULT_CRAWLER_OPTIONS = {
    maxRequestsPerCrawl: 1000,
    maxConcurrency: 5,
    requestHandlerTimeoutSecs: 60,
    navigationTimeoutSecs: 30,
    headless: true,
    useSessionPool: true,
    persistCookiesPerSession: false,
    maxRequestRetries: 3,
    requestDelaySecs: 1,
    maxCrawlDepth: 3,
    includeUrlGlobs: ['**'],
    excludeUrlGlobs: [],
    waitForDynamicContent: true,
    dynamicContentWaitSecs: 2,
    // Error handling configuration
    errorHandling: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        jitter: true
    },
    // Proxy configuration for rate limiting avoidance
    proxyConfiguration: null
};

/**
 * Error class for web crawling failures
 */
export class WebCrawlerError extends Error {
    constructor(message, url = '', originalError = null) {
        super(message);
        this.name = 'WebCrawlerError';
        this.url = url;
        this.originalError = originalError;
    }
}

/**
 * Crawling statistics and metrics
 */
export class CrawlingStats {
    constructor() {
        this.startTime = new Date();
        this.endTime = null;
        this.totalRequests = 0;
        this.successfulRequests = 0;
        this.failedRequests = 0;
        this.filteredUrls = 0;
        this.depthExceededUrls = 0;
        this.processedPages = 0;
        this.extractedChunks = 0;
        this.totalTokens = 0;
        this.errors = [];
        this.warnings = [];
    }
    
    /**
     * Marks crawling as completed
     */
    complete() {
        this.endTime = new Date();
    }
    
    /**
     * Gets crawling duration in seconds
     */
    getDuration() {
        const end = this.endTime || new Date();
        return Math.round((end - this.startTime) / 1000);
    }
    
    /**
     * Gets success rate as percentage
     */
    getSuccessRate() {
        if (this.totalRequests === 0) return 0;
        return Math.round((this.successfulRequests / this.totalRequests) * 100);
    }
    
    /**
     * Adds an error to the statistics
     */
    addError(error, url = '') {
        this.errors.push({
            message: error.message,
            url,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Adds a warning to the statistics
     */
    addWarning(message, url = '') {
        this.warnings.push({
            message,
            url,
            timestamp: new Date().toISOString()
        });
    }
}

/**
 * URL filter for pattern matching and depth control
 */
export class UrlFilter {
    constructor(options = {}) {
        this.includeGlobs = options.includeUrlGlobs || ['**'];
        this.excludeGlobs = options.excludeUrlGlobs || [];
        this.maxDepth = options.maxCrawlDepth || 3;
        this.baseUrls = new Set();
    }
    
    /**
     * Adds base URLs for depth calculation
     */
    addBaseUrls(urls) {
        urls.forEach(url => {
            try {
                const parsed = new URL(url);
                this.baseUrls.add(parsed.origin);
            } catch (error) {
                console.warn(`Invalid base URL: ${url}`);
            }
        });
    }
    
    /**
     * Checks if URL matches inclusion patterns
     */
    matchesIncludePatterns(url) {
        try {
            return this.includeGlobs.some(pattern => minimatch(url, pattern));
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Checks if URL matches exclusion patterns
     */
    matchesExcludePatterns(url) {
        try {
            return this.excludeGlobs.some(pattern => minimatch(url, pattern));
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Calculates URL depth from base URLs
     */
    calculateDepth(url) {
        try {
            const parsed = new URL(url);
            const pathSegments = parsed.pathname.split('/').filter(segment => segment.length > 0);
            return pathSegments.length;
        } catch (error) {
            return 0;
        }
    }
    
    /**
     * Checks if URL should be crawled based on patterns and depth
     */
    shouldCrawl(url, currentDepth = 0) {
        // Check depth limit
        if (currentDepth >= this.maxDepth) {
            return { allowed: false, reason: 'depth_exceeded' };
        }
        
        // Check exclusion patterns first
        if (this.matchesExcludePatterns(url)) {
            return { allowed: false, reason: 'excluded_pattern' };
        }
        
        // Check inclusion patterns
        if (!this.matchesIncludePatterns(url)) {
            return { allowed: false, reason: 'not_included' };
        }
        
        return { allowed: true, reason: 'allowed' };
    }
    
    /**
     * Normalizes URL for consistent filtering
     */
    normalizeUrl(url) {
        try {
            const parsed = new URL(url);
            // Remove fragment and normalize
            parsed.hash = '';
            return parsed.toString();
        } catch (error) {
            return url;
        }
    }
}

/**
 * Web crawler using Crawlee's PlaywrightCrawler
 */
export class WebCrawler {
    constructor(options = {}) {
        this.options = {
            ...DEFAULT_CRAWLER_OPTIONS,
            ...options
        };
        
        this.stats = new CrawlingStats();
        this.urlFilter = new UrlFilter(this.options);
        this.crawler = null;
        this.contentExtractor = null;
        this.textProcessor = null;
        this.dataset = null;
        
        // Initialize comprehensive error handler
        this.errorHandler = createErrorHandler({
            retry: this.options.errorHandling
        });
        
        // Track proxy rotation if configured
        this.currentProxyIndex = 0;
        this.proxyRotationEnabled = !!this.options.proxyConfiguration;
    }
    
    /**
     * Sets the content extractor for processing pages
     */
    setContentExtractor(extractor) {
        this.contentExtractor = extractor;
    }
    
    /**
     * Sets the text processor for chunking and metadata
     */
    setTextProcessor(processor) {
        this.textProcessor = processor;
    }
    
    /**
     * Initializes the crawler with configuration
     */
    async initialize() {
        try {
            console.log('🚀 Initializing web crawler...');
            
            // Initialize Apify Dataset for storing results
            this.dataset = await Dataset.open();
            
            // Create PlaywrightCrawler instance
            this.crawler = new PlaywrightCrawler({
                maxRequestsPerCrawl: this.options.maxRequestsPerCrawl,
                maxConcurrency: this.options.maxConcurrency,
                requestHandlerTimeoutSecs: this.options.requestHandlerTimeoutSecs,
                navigationTimeoutSecs: this.options.navigationTimeoutSecs,
                headless: this.options.headless,
                useSessionPool: this.options.useSessionPool,
                persistCookiesPerSession: this.options.persistCookiesPerSession,
                maxRequestRetries: this.options.maxRequestRetries,
                proxyConfiguration: this.options.proxyConfiguration,
                
                // Request handler for processing pages
                requestHandler: async ({ request, page, enqueueLinks, log }) => {
                    await this.handleRequestWithErrorHandling({ request, page, enqueueLinks, log });
                },
                
                // Failed request handler
                failedRequestHandler: async ({ request, error }) => {
                    await this.handleFailedRequestWithRecovery({ request, error });
                }
            });
            
            console.log('✅ Web crawler initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize web crawler:', error.message);
            throw new WebCrawlerError(`Failed to initialize crawler: ${error.message}`, '', error);
        }
    }
    
    /**
     * Starts crawling with the provided start URLs
     */
    async crawl(startUrls) {
        if (!this.crawler) {
            throw new WebCrawlerError('Crawler not initialized. Call initialize() first.');
        }
        
        if (!Array.isArray(startUrls) || startUrls.length === 0) {
            throw new WebCrawlerError('Start URLs must be a non-empty array');
        }
        
        try {
            console.log(`🕷️ Starting crawl with ${startUrls.length} URLs...`);
            
            // Add base URLs to filter for depth calculation
            this.urlFilter.addBaseUrls(startUrls);
            
            // Start crawling
            await this.crawler.run(startUrls);
            
            // Mark crawling as complete
            this.stats.complete();
            
            console.log(`✅ Crawling completed in ${this.stats.getDuration()}s`);
            console.log(`📊 Processed ${this.stats.processedPages} pages, extracted ${this.stats.extractedChunks} chunks`);
            
            return this.stats;
            
        } catch (error) {
            this.stats.complete();
            this.stats.addError(error);
            console.error('❌ Crawling failed:', error.message);
            throw new WebCrawlerError(`Crawling failed: ${error.message}`, '', error);
        }
    }
    
    /**
     * Handles individual page requests with comprehensive error handling
     */
    async handleRequestWithErrorHandling({ request, page, enqueueLinks, log }) {
        const url = request.url;
        const operationId = `page-request-${url}`;
        
        const result = await this.errorHandler.executeWithErrorHandling(
            async () => {
                return await this.handleRequest({ request, page, enqueueLinks, log });
            },
            operationId,
            { 
                url, 
                clearCache: async () => {
                    // Clear any page-specific caches
                    if (page && typeof page.evaluate === 'function') {
                        try {
                            await page.evaluate(() => {
                                // Clear browser caches
                                if (window.caches) {
                                    window.caches.keys().then(names => {
                                        names.forEach(name => window.caches.delete(name));
                                    });
                                }
                            });
                        } catch (e) {
                            // Ignore cache clearing errors
                        }
                    }
                }
            }
        );
        
        // Handle recovery results
        if (result && result.skipped) {
            this.stats.addWarning(`Page skipped due to: ${result.reason}`, url);
        } else if (result && result.recovered) {
            console.log(`✅ Recovered from error using: ${result.method}`);
        }
    }

    /**
     * Core request handling logic (wrapped by error handler)
     */
    async handleRequest({ request, page, enqueueLinks, log }) {
        const url = request.url;
        
        this.stats.totalRequests++;
        
        log.info(`Processing page: ${url}`);
        
        // Wait for dynamic content if enabled
        if (this.options.waitForDynamicContent) {
            await this.waitForDynamicContentWithRetry(page, url);
        }
        
        // Extract page content with error handling
        const content = await this.extractPageContentWithRetry(page, url);
        
        // Process content if extractors are available
        if (this.contentExtractor && this.textProcessor) {
            await this.processPageContentWithErrorHandling(url, content);
        } else {
            console.warn(`No content processors configured for ${url}`);
            this.stats.addWarning('No content processors configured', url);
        }
        
        // Discover and enqueue new links
        await this.discoverLinksWithErrorHandling({ page, enqueueLinks, currentUrl: url, currentDepth: request.userData?.depth || 0 });
        
        this.stats.successfulRequests++;
    }

    /**
     * Waits for dynamic content with retry logic
     */
    async waitForDynamicContentWithRetry(page, url) {
        const operationId = `dynamic-content-${url}`;
        
        return await this.errorHandler.executeWithErrorHandling(
            async () => {
                await page.waitForTimeout(this.options.dynamicContentWaitSecs * 1000);
                
                // Additional check for content readiness
                try {
                    await page.waitForFunction(
                        () => document.readyState === 'complete',
                        { timeout: 5000 }
                    );
                } catch (e) {
                    // Timeout is acceptable - content might still be usable
                    console.warn(`Dynamic content wait timeout for ${url}, proceeding anyway`);
                }
            },
            operationId,
            { url }
        );
    }

    /**
     * Extracts page content with retry logic
     */
    async extractPageContentWithRetry(page, url) {
        const operationId = `content-extraction-${url}`;
        
        return await this.errorHandler.executeWithErrorHandling(
            async () => {
                const content = await page.content();
                
                if (!content || content.length < 100) {
                    throw new CrawlerError(
                        'Page content is empty or too short',
                        ErrorCategory.EXTRACTION,
                        ErrorSeverity.MEDIUM,
                        { url, contentLength: content?.length || 0 }
                    );
                }
                
                return content;
            },
            operationId,
            { url }
        );
    }
    
    /**
     * Processes page content with comprehensive error handling
     */
    async processPageContentWithErrorHandling(url, htmlContent) {
        const operationId = `content-processing-${url}`;
        
        const result = await this.errorHandler.executeWithErrorHandling(
            async () => {
                return await this.processPageContent(url, htmlContent);
            },
            operationId,
            { url, contentLength: htmlContent?.length || 0 }
        );
        
        if (result && result.skipped) {
            this.stats.addWarning(`Content processing skipped: ${result.reason}`, url);
        }
    }

    /**
     * Core content processing logic (wrapped by error handler)
     */
    async processPageContent(url, htmlContent) {
        console.log(`📄 Processing content for ${url}`);
        
        // Extract clean content with fallback handling
        const extractionResult = await this.extractContentWithFallback(url, htmlContent);
        
        if (!extractionResult.success || !extractionResult.markdown) {
            throw new CrawlerError(
                'Content extraction failed completely',
                ErrorCategory.EXTRACTION,
                ErrorSeverity.MEDIUM,
                { url, fallbackUsed: extractionResult.fallbackUsed }
            );
        }
        
        // Process text (chunk and add metadata)
        const processingResult = await this.processTextWithRetry(url, extractionResult);
        
        if (!processingResult.success || processingResult.chunks.length === 0) {
            throw new CrawlerError(
                'Text processing failed',
                ErrorCategory.PROCESSING,
                ErrorSeverity.MEDIUM,
                { url, markdown: extractionResult.markdown?.substring(0, 200) }
            );
        }
        
        // Store results in dataset
        await this.storeResultsWithRetry(url, processingResult);
        
        this.stats.processedPages++;
        this.stats.extractedChunks += processingResult.chunks.length;
        this.stats.totalTokens += processingResult.tokenEstimation?.totalTokens || 0;
        
        return processingResult;
    }

    /**
     * Extracts content with fallback mechanisms
     */
    async extractContentWithFallback(url, htmlContent) {
        try {
            // Primary extraction attempt
            const result = await this.contentExtractor.extract(htmlContent, { url });
            if (result.success && result.markdown) {
                return result;
            }
        } catch (error) {
            console.warn(`Primary content extraction failed for ${url}, trying fallback`);
        }
        
        // Fallback: try with different extraction settings
        try {
            const fallbackResult = await this.contentExtractor.extract(htmlContent, { 
                url, 
                fallback: true,
                minContentLength: 50 // Lower threshold for fallback
            });
            
            if (fallbackResult.success && fallbackResult.markdown) {
                fallbackResult.fallbackUsed = true;
                return fallbackResult;
            }
        } catch (error) {
            console.warn(`Fallback content extraction also failed for ${url}`);
        }
        
        return { success: false, fallbackUsed: true };
    }

    /**
     * Processes text with retry logic
     */
    async processTextWithRetry(url, extractionResult) {
        const operationId = `text-processing-${url}`;
        
        return await this.errorHandler.executeWithErrorHandling(
            async () => {
                return await this.textProcessor.process(extractionResult.markdown, {
                    sourceUrl: url,
                    title: extractionResult.title || '',
                    extractedAt: new Date().toISOString()
                });
            },
            operationId,
            { url, markdownLength: extractionResult.markdown?.length || 0 }
        );
    }

    /**
     * Stores results with retry logic
     */
    async storeResultsWithRetry(url, processingResult) {
        const operationId = `result-storage-${url}`;
        
        return await this.errorHandler.executeWithErrorHandling(
            async () => {
                return await this.storeResults(url, processingResult);
            },
            operationId,
            { url, chunkCount: processingResult.chunks?.length || 0 }
        );
    }
    
    /**
     * Discovers and enqueues new links with error handling
     */
    async discoverLinksWithErrorHandling({ page, enqueueLinks, currentUrl, currentDepth }) {
        const operationId = `link-discovery-${currentUrl}`;
        
        const result = await this.errorHandler.executeWithErrorHandling(
            async () => {
                return await this.discoverLinks({ page, enqueueLinks, currentUrl, currentDepth });
            },
            operationId,
            { url: currentUrl, depth: currentDepth }
        );
        
        if (result && result.skipped) {
            this.stats.addWarning(`Link discovery skipped: ${result.reason}`, currentUrl);
        }
    }

    /**
     * Core link discovery logic (wrapped by error handler)
     */
    async discoverLinks({ page, enqueueLinks, currentUrl, currentDepth }) {
        const nextDepth = currentDepth + 1;
        
        // Use Crawlee's enqueueLinks with custom filtering
        await enqueueLinks({
            selector: 'a[href]',
            transformRequestFunction: (req) => {
                try {
                    const url = this.urlFilter.normalizeUrl(req.url);
                    const filterResult = this.urlFilter.shouldCrawl(url, nextDepth);
                    
                    if (!filterResult.allowed) {
                        // Track filtered URLs
                        if (filterResult.reason === 'depth_exceeded') {
                            this.stats.depthExceededUrls++;
                        } else {
                            this.stats.filteredUrls++;
                        }
                        return false; // Don't enqueue
                    }
                    
                    // Add depth information to request
                    req.userData = { depth: nextDepth };
                    return req;
                } catch (error) {
                    // Log URL filtering errors but don't fail the entire operation
                    console.warn(`Failed to filter URL ${req.url}:`, error.message);
                    return false;
                }
            }
        });
    }
    
    /**
     * Stores processing results in the dataset
     */
    async storeResults(url, processingResult) {
        try {
            const records = processingResult.chunks.map((chunk, index) => ({
                url,
                title: chunk.metadata.title || '',
                content: chunk.content,
                markdown: chunk.content, // Keep both for compatibility
                chunkIndex: index,
                totalChunks: processingResult.chunks.length,
                chunkSize: chunk.length,
                tokenCount: chunk.metadata.tokenCount || 0,
                extractedAt: chunk.metadata.extractedAt || new Date().toISOString(),
                metadata: {
                    sourceUrl: url,
                    chunkId: `${url}#chunk-${index}`,
                    hasOverlap: chunk.metadata.hasOverlapStart || chunk.metadata.hasOverlapEnd || false,
                    processingStats: {
                        originalLength: processingResult.originalLength || 0,
                        chunkingMethod: 'recursive-character-splitter',
                        tokenEstimation: chunk.metadata.tokenCount || 0
                    }
                }
            }));
            
            await this.dataset.pushData(records);
            
        } catch (error) {
            this.stats.addError(error, url);
            console.error(`Failed to store results for ${url}:`, error.message);
        }
    }
    
    /**
     * Handles failed requests with comprehensive recovery
     */
    async handleFailedRequestWithRecovery({ request, error }) {
        const url = request.url;
        const category = categorizeError(error);
        
        // Create a proper CrawlerError
        const crawlerError = new CrawlerError(
            error.message,
            category,
            this.getErrorSeverity(category),
            { url, retryCount: request.retryCount || 0 }
        );
        
        this.stats.failedRequests++;
        this.stats.addError(crawlerError, url);
        
        // Log with appropriate level based on error category
        this.logFailedRequest(crawlerError, url);
        
        // Handle rate limiting with proxy rotation
        if (category === ErrorCategory.RATE_LIMIT && this.proxyRotationEnabled) {
            await this.rotateProxy();
            console.log('🔄 Rotated proxy due to rate limiting');
        }
        
        // Handle memory issues
        if (category === ErrorCategory.MEMORY) {
            await this.performMemoryCleanup();
            console.log('🧹 Performed memory cleanup due to memory error');
        }
    }

    /**
     * Determines error severity based on category
     */
    getErrorSeverity(category) {
        switch (category) {
            case ErrorCategory.MEMORY:
                return ErrorSeverity.HIGH;
            case ErrorCategory.NETWORK:
            case ErrorCategory.TIMEOUT:
                return ErrorSeverity.MEDIUM;
            case ErrorCategory.RATE_LIMIT:
                return ErrorSeverity.LOW;
            default:
                return ErrorSeverity.MEDIUM;
        }
    }

    /**
     * Logs failed requests with appropriate detail
     */
    logFailedRequest(error, url) {
        const emoji = this.getErrorEmoji(error.category);
        const message = `${emoji} Request failed for ${url}: ${error.message}`;
        
        switch (error.severity) {
            case ErrorSeverity.HIGH:
            case ErrorSeverity.CRITICAL:
                console.error(message);
                break;
            case ErrorSeverity.MEDIUM:
                console.warn(message);
                break;
            case ErrorSeverity.LOW:
                console.log(message);
                break;
        }
    }

    /**
     * Gets appropriate emoji for error category
     */
    getErrorEmoji(category) {
        switch (category) {
            case ErrorCategory.NETWORK:
                return '🌐';
            case ErrorCategory.TIMEOUT:
                return '⏱️';
            case ErrorCategory.RATE_LIMIT:
                return '🚦';
            case ErrorCategory.MEMORY:
                return '💾';
            case ErrorCategory.PARSING:
                return '📝';
            case ErrorCategory.EXTRACTION:
                return '🔍';
            default:
                return '❌';
        }
    }

    /**
     * Rotates proxy configuration to avoid rate limiting
     */
    async rotateProxy() {
        if (!this.options.proxyConfiguration || !this.options.proxyConfiguration.proxyUrls) {
            return;
        }
        
        const proxyUrls = this.options.proxyConfiguration.proxyUrls;
        this.currentProxyIndex = (this.currentProxyIndex + 1) % proxyUrls.length;
        
        // Update crawler proxy configuration
        if (this.crawler && this.crawler.proxyConfiguration) {
            this.crawler.proxyConfiguration.proxyUrls = [proxyUrls[this.currentProxyIndex]];
        }
    }

    /**
     * Performs memory cleanup to recover from memory issues
     */
    async performMemoryCleanup() {
        try {
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }
            
            // Clear any internal caches
            if (this.dataset && typeof this.dataset.clearCache === 'function') {
                await this.dataset.clearCache();
            }
            
            // Wait for cleanup to complete
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.warn('Memory cleanup failed:', error.message);
        }
    }
    
    /**
     * Gets crawling statistics
     */
    getStats() {
        return {
            ...this.stats,
            duration: this.stats.getDuration(),
            successRate: this.stats.getSuccessRate(),
            pagesPerSecond: this.stats.getDuration() > 0 ? Math.round(this.stats.processedPages / this.stats.getDuration()) : 0,
            chunksPerPage: this.stats.processedPages > 0 ? Math.round(this.stats.extractedChunks / this.stats.processedPages) : 0
        };
    }
    
    /**
     * Cleans up crawler resources
     */
    async cleanup() {
        try {
            if (this.crawler && typeof this.crawler.teardown === 'function') {
                await this.crawler.teardown();
            }
            console.log('🧹 Crawler cleanup completed');
        } catch (error) {
            console.error('Failed to cleanup crawler:', error.message);
        }
    }
}

/**
 * Creates a new web crawler instance
 */
export function createWebCrawler(options = {}) {
    return new WebCrawler(options);
}

/**
 * Convenience function to crawl URLs with default settings
 */
export async function crawlUrls(startUrls, options = {}) {
    const crawler = createWebCrawler(options);
    await crawler.initialize();
    
    try {
        const stats = await crawler.crawl(startUrls);
        return { success: true, stats };
    } finally {
        await crawler.cleanup();
    }
}