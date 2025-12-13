/**
 * Crawler Integration Service for RAG Spider
 * 
 * This module integrates the web crawler with the content processing pipeline,
 * orchestrating the complete flow from page crawling to chunk extraction.
 * 
 * Requirements: 1.1, 1.4, 2.4
 */

import { WebCrawler, createWebCrawler } from './webCrawler.js';
import { ContentExtractor } from '../extraction/contentExtractor.js';
import { TextProcessor } from '../processing/textProcessor.js';
import { 
    createErrorHandler, 
    CrawlerError, 
    ErrorCategory, 
    ErrorSeverity 
} from '../utils/errorHandler.js';

/**
 * Default configuration for crawler integration
 */
const DEFAULT_INTEGRATION_OPTIONS = {
    // Crawler options
    maxRequestsPerCrawl: 1000,
    maxConcurrency: 3,
    maxCrawlDepth: 3,
    includeUrlGlobs: ['**'],
    excludeUrlGlobs: ['**/*.pdf', '**/*.jpg', '**/*.png', '**/*.gif', '**/*.zip'],
    waitForDynamicContent: true,
    dynamicContentWaitSecs: 2,
    
    // Content extraction options
    extractionOptions: {
        fallbackSelectors: ['main', 'article', '.content', '#content'],
        removeSelectors: ['nav', 'header', 'footer', '.sidebar', '.advertisement'],
        minContentLength: 100
    },
    
    // Text processing options
    processingOptions: {
        chunkSize: 1000,
        chunkOverlap: 100,
        enableTokenEstimation: true,
        tokenModel: 'gpt-3.5-turbo',
        // Text chunker options
        chunkingOptions: {
            chunkSize: 1000,
            chunkOverlap: 100,
            separators: ['\n\n', '\n', ' ', ''],
            keepSeparator: false
        },
        // Token estimator options
        tokenOptions: {
            model: 'gpt-3.5-turbo',
            cacheResults: true
        }
    }
};

/**
 * Error class for integration failures
 */
export class CrawlerIntegrationError extends Error {
    constructor(message, originalError = null) {
        super(message);
        this.name = 'CrawlerIntegrationError';
        this.originalError = originalError;
    }
}

/**
 * Integration result with comprehensive statistics
 */
export class IntegrationResult {
    constructor({
        success = false,
        crawlingStats = null,
        processingStats = null,
        totalPages = 0,
        totalChunks = 0,
        totalTokens = 0,
        averageChunksPerPage = 0,
        averageTokensPerChunk = 0,
        errors = [],
        warnings = [],
        duration = 0
    } = {}) {
        this.success = success;
        this.crawlingStats = crawlingStats;
        this.processingStats = processingStats;
        this.totalPages = totalPages;
        this.totalChunks = totalChunks;
        this.totalTokens = totalTokens;
        this.averageChunksPerPage = averageChunksPerPage;
        this.averageTokensPerChunk = averageTokensPerChunk;
        this.errors = errors;
        this.warnings = warnings;
        this.duration = duration;
        this.completedAt = new Date().toISOString();
    }
}

/**
 * Integrated crawler that orchestrates the complete processing pipeline
 */
export class IntegratedCrawler {
    constructor(options = {}) {
        this.options = {
            ...DEFAULT_INTEGRATION_OPTIONS,
            ...options
        };
        
        this.crawler = null;
        this.contentExtractor = null;
        this.textProcessor = null;
        this.startTime = null;
        this.processingStats = {
            totalPages: 0,
            totalChunks: 0,
            totalTokens: 0,
            successfulExtractions: 0,
            failedExtractions: 0,
            errors: [],
            warnings: []
        };
        
        // Initialize error handler for integration-level errors
        this.errorHandler = createErrorHandler({
            retry: {
                maxRetries: 2,
                baseDelay: 500,
                maxDelay: 5000
            }
        });
    }
    
    /**
     * Initializes all components of the integrated crawler
     */
    async initialize() {
        const operationId = 'crawler-initialization';
        
        return await this.errorHandler.executeWithErrorHandling(
            async () => {
                console.log('🔧 Initializing integrated crawler components...');
                
                // Initialize content extractor
                this.contentExtractor = new ContentExtractor(this.options.extractionOptions);
                
                // Initialize text processor
                this.textProcessor = new TextProcessor({
                    ...this.options.processingOptions,
                    separators: ['\n\n', '\n', ' ', '']  // Add required separators
                });
                
                // Initialize web crawler with error handling configuration
                this.crawler = createWebCrawler({
                    maxRequestsPerCrawl: this.options.maxRequestsPerCrawl,
                    maxConcurrency: this.options.maxConcurrency,
                    maxCrawlDepth: this.options.maxCrawlDepth,
                    includeUrlGlobs: this.options.includeUrlGlobs,
                    excludeUrlGlobs: this.options.excludeUrlGlobs,
                    waitForDynamicContent: this.options.waitForDynamicContent,
                    dynamicContentWaitSecs: this.options.dynamicContentWaitSecs,
                    // Pass through proxy configuration for rate limiting avoidance
                    proxyConfiguration: this.options.proxyConfiguration,
                    // Enhanced error handling configuration
                    errorHandling: {
                        maxRetries: 3,
                        baseDelay: 1000,
                        maxDelay: 30000,
                        backoffMultiplier: 2,
                        jitter: true
                    }
                });
                
                // Set up the integration
                this.crawler.setContentExtractor(this.contentExtractor);
                this.crawler.setTextProcessor(this.textProcessor);
                
                // Initialize crawler
                await this.crawler.initialize();
                
                console.log('✅ Integrated crawler initialized successfully');
            },
            operationId,
            { 
                clearCache: async () => {
                    // Clear any initialization caches
                    this.contentExtractor = null;
                    this.textProcessor = null;
                    this.crawler = null;
                }
            }
        );
    }
    
    /**
     * Starts the integrated crawling and processing pipeline
     */
    async crawlAndProcess(startUrls) {
        if (!this.crawler) {
            throw new CrawlerIntegrationError('Crawler not initialized. Call initialize() first.');
        }
        
        if (!Array.isArray(startUrls) || startUrls.length === 0) {
            throw new CrawlerIntegrationError('Start URLs must be a non-empty array');
        }
        
        this.startTime = new Date();
        const operationId = `crawl-and-process-${startUrls.length}-urls`;
        
        const result = await this.errorHandler.executeWithErrorHandling(
            async () => {
                console.log(`🚀 Starting integrated crawl and processing for ${startUrls.length} URLs...`);
                
                // Start crawling with integrated processing
                const crawlingStats = await this.crawler.crawl(startUrls);
                
                // Calculate final statistics
                const duration = Math.round((new Date() - this.startTime) / 1000);
                const result = this.buildIntegrationResult(crawlingStats, duration);
                
                console.log(`✅ Integrated crawling completed in ${duration}s`);
                console.log(`📊 Processed ${result.totalPages} pages, extracted ${result.totalChunks} chunks`);
                
                return result;
            },
            operationId,
            { 
                startUrls: startUrls.slice(0, 3), // Log first few URLs for context
                urlCount: startUrls.length
            }
        );
        
        // Handle error recovery results
        if (result && result.skipped) {
            const duration = Math.round((new Date() - this.startTime) / 1000);
            console.error(`❌ Integrated crawling skipped due to: ${result.reason}`);
            
            return new IntegrationResult({
                success: false,
                errors: [{ 
                    message: `Crawling skipped: ${result.reason}`, 
                    timestamp: new Date().toISOString() 
                }],
                duration
            });
        }
        
        return result;
    }
    
    /**
     * Processes a single page through the complete pipeline
     */
    async processPage(url, htmlContent) {
        try {
            console.log(`🔄 Processing page through pipeline: ${url}`);
            
            // Extract content
            const extractionResult = await this.contentExtractor.extract(htmlContent, { url });
            
            if (!extractionResult.success) {
                this.processingStats.failedExtractions++;
                this.processingStats.warnings.push({
                    message: 'Content extraction failed',
                    url,
                    timestamp: new Date().toISOString()
                });
                return null;
            }
            
            // Process text (chunk and estimate tokens)
            const processingResult = await this.textProcessor.process(extractionResult.markdown, {
                sourceUrl: url,
                title: extractionResult.title || '',
                extractedAt: new Date().toISOString()
            });
            
            if (!processingResult.success) {
                this.processingStats.failedExtractions++;
                this.processingStats.warnings.push({
                    message: 'Text processing failed',
                    url,
                    timestamp: new Date().toISOString()
                });
                return null;
            }
            
            // Update statistics
            this.processingStats.totalPages++;
            this.processingStats.successfulExtractions++;
            this.processingStats.totalChunks += processingResult.chunks.length;
            this.processingStats.totalTokens += processingResult.tokenEstimation?.totalTokens || 0;
            
            console.log(`✅ Page processed: ${processingResult.chunks.length} chunks, ${processingResult.tokenEstimation?.totalTokens || 0} tokens`);
            
            return {
                url,
                extractionResult,
                processingResult,
                chunks: processingResult.chunks,
                metadata: {
                    processedAt: new Date().toISOString(),
                    chunkCount: processingResult.chunks.length,
                    tokenCount: processingResult.tokenEstimation?.totalTokens || 0,
                    title: extractionResult.title || ''
                }
            };
            
        } catch (error) {
            this.processingStats.failedExtractions++;
            this.processingStats.errors.push({
                message: error.message,
                url,
                timestamp: new Date().toISOString()
            });
            
            console.error(`❌ Failed to process page ${url}:`, error.message);
            return null;
        }
    }
    
    /**
     * Builds the final integration result with comprehensive statistics
     */
    buildIntegrationResult(crawlingStats, duration) {
        const totalPages = this.processingStats.totalPages;
        const totalChunks = this.processingStats.totalChunks;
        const totalTokens = this.processingStats.totalTokens;
        
        const averageChunksPerPage = totalPages > 0 ? Math.round(totalChunks / totalPages) : 0;
        const averageTokensPerChunk = totalChunks > 0 ? Math.round(totalTokens / totalChunks) : 0;
        
        // Combine errors and warnings from all components
        const allErrors = [
            ...this.processingStats.errors,
            ...crawlingStats.errors.map(e => ({
                message: e.message,
                url: e.url || '',
                timestamp: e.timestamp || new Date().toISOString(),
                source: 'crawler'
            }))
        ];
        
        const allWarnings = [
            ...this.processingStats.warnings,
            ...crawlingStats.warnings.map(w => ({
                message: w.message,
                url: w.url || '',
                timestamp: w.timestamp || new Date().toISOString(),
                source: 'crawler'
            }))
        ];
        
        return new IntegrationResult({
            success: true,
            crawlingStats,
            processingStats: { ...this.processingStats },
            totalPages,
            totalChunks,
            totalTokens,
            averageChunksPerPage,
            averageTokensPerChunk,
            errors: allErrors,
            warnings: allWarnings,
            duration
        });
    }
    
    /**
     * Gets current processing statistics
     */
    getProcessingStats() {
        return {
            ...this.processingStats,
            averageChunksPerPage: this.processingStats.totalPages > 0 
                ? Math.round(this.processingStats.totalChunks / this.processingStats.totalPages) 
                : 0,
            averageTokensPerChunk: this.processingStats.totalChunks > 0 
                ? Math.round(this.processingStats.totalTokens / this.processingStats.totalChunks) 
                : 0,
            successRate: this.processingStats.totalPages > 0 
                ? Math.round((this.processingStats.successfulExtractions / this.processingStats.totalPages) * 100) 
                : 0
        };
    }
    
    /**
     * Validates configuration before starting
     */
    validateConfiguration() {
        const errors = [];
        
        if (!Array.isArray(this.options.includeUrlGlobs) || this.options.includeUrlGlobs.length === 0) {
            errors.push('includeUrlGlobs must be a non-empty array');
        }
        
        if (this.options.maxCrawlDepth < 1) {
            errors.push('maxCrawlDepth must be at least 1');
        }
        
        if (this.options.maxConcurrency < 1) {
            errors.push('maxConcurrency must be at least 1');
        }
        
        if (this.options.processingOptions.chunkSize < 100) {
            errors.push('chunkSize must be at least 100');
        }
        
        if (this.options.processingOptions.chunkOverlap >= this.options.processingOptions.chunkSize) {
            errors.push('chunkOverlap must be less than chunkSize');
        }
        
        if (errors.length > 0) {
            throw new CrawlerIntegrationError(`Configuration validation failed: ${errors.join(', ')}`);
        }
        
        return true;
    }
    
    /**
     * Cleans up all resources
     */
    async cleanup() {
        try {
            if (this.crawler) {
                await this.crawler.cleanup();
            }
            console.log('🧹 Integrated crawler cleanup completed');
        } catch (error) {
            console.error('Failed to cleanup integrated crawler:', error.message);
        }
    }
}

/**
 * Creates a new integrated crawler instance
 */
export function createIntegratedCrawler(options = {}) {
    return new IntegratedCrawler(options);
}

/**
 * Convenience function to crawl and process URLs with default settings
 */
export async function crawlAndProcessUrls(startUrls, options = {}) {
    const crawler = createIntegratedCrawler(options);
    
    try {
        // Validate configuration
        crawler.validateConfiguration();
        
        // Initialize and run
        await crawler.initialize();
        const result = await crawler.crawlAndProcess(startUrls);
        
        return result;
        
    } finally {
        await crawler.cleanup();
    }
}

/**
 * Processes a single URL through the complete pipeline
 */
export async function processSingleUrl(url, options = {}) {
    const crawler = createIntegratedCrawler(options);
    
    try {
        await crawler.initialize();
        
        // Fetch the page content (simplified for single URL processing)
        // In a real implementation, this would use Playwright to fetch the page
        console.log(`📄 Processing single URL: ${url}`);
        
        // For now, return a placeholder result
        // This would be implemented with actual page fetching in a complete system
        throw new CrawlerIntegrationError('Single URL processing requires page fetching implementation');
        
    } finally {
        await crawler.cleanup();
    }
}