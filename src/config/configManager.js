/**
 * Configuration management for RAG Spider
 * 
 * This module handles configuration parsing, validation, and provides
 * a centralized interface for accessing validated configuration throughout
 * the application.
 * 
 * Requirements: 5.1, 5.5
 */

import { validateInput, ValidationError, createErrorReport } from './inputValidator.js';

/**
 * Configuration manager class that handles all configuration-related operations
 */
export class ConfigManager {
    constructor() {
        this.config = null;
        this.isValid = false;
        this.errors = [];
    }
    
    /**
     * Parses and validates input configuration
     * @param {Object} rawInput - Raw input from Apify Actor
     * @returns {Object} - Validated configuration or throws error
     * @throws {ValidationError} - If validation fails
     */
    parseAndValidate(rawInput) {
        try {
            console.log('🔍 Validating input configuration...');
            
            // Validate the input
            this.config = validateInput(rawInput);
            this.isValid = true;
            this.errors = [];
            
            console.log('✅ Input validation successful');
            console.log(`📊 Configuration summary:
  - Start URLs: ${this.config.startUrls.length}
  - Crawl Depth: ${this.config.crawlDepth}
  - URL Patterns: ${this.config.includeUrlGlobs.length}
  - Chunk Size: ${this.config.chunkSize} chars
  - Chunk Overlap: ${this.config.chunkOverlap} chars
  - Max Requests: ${this.config.maxRequestsPerCrawl}
  - Request Delay: ${this.config.requestDelay}ms`);
            
            return this.config;
            
        } catch (error) {
            this.isValid = false;
            
            if (error instanceof ValidationError) {
                const errorReport = createErrorReport(error);
                this.errors.push(errorReport);
                
                console.error('❌ Input validation failed:', error.message);
                console.error('📋 Error details:', JSON.stringify(errorReport, null, 2));
                
                throw error;
            } else {
                // Handle unexpected errors
                const unexpectedError = new ValidationError(
                    `Unexpected configuration error: ${error.message}`,
                    'unknown',
                    rawInput
                );
                
                const errorReport = createErrorReport(unexpectedError);
                this.errors.push(errorReport);
                
                console.error('💥 Unexpected configuration error:', error);
                throw unexpectedError;
            }
        }
    }
    
    /**
     * Gets the validated configuration
     * @returns {Object} - Validated configuration
     * @throws {Error} - If configuration hasn't been validated yet
     */
    getConfig() {
        if (!this.isValid || !this.config) {
            throw new Error('Configuration has not been validated yet. Call parseAndValidate() first.');
        }
        
        return this.config;
    }
    
    /**
     * Gets configuration for the crawler
     * @returns {Object} - Crawler-specific configuration
     */
    getCrawlerConfig() {
        const config = this.getConfig();
        
        return {
            startUrls: config.startUrls,
            maxRequestsPerCrawl: config.maxRequestsPerCrawl,
            requestHandlerTimeoutSecs: 120,
            navigationTimeoutSecs: 30,
            proxyConfiguration: config.proxyConfiguration,
            
            // Crawler behavior settings - valid PlaywrightCrawler options
            maxConcurrency: Math.max(1, Math.min(10, Math.floor(10000 / Math.max(config.requestDelay, 100)))),
            maxRequestRetries: 3,
            
            // Memory management
            keepAlive: false,
            useSessionPool: true,
            persistCookiesPerSession: false,
            
            // Store request delay for manual implementation in request handler
            _requestDelay: config.requestDelay
        };
    }
    
    /**
     * Gets configuration for content extraction
     * @returns {Object} - Content extraction configuration
     */
    getExtractionConfig() {
        const config = this.getConfig();
        
        return {
            // Readability settings
            readabilityOptions: {
                debug: false,
                maxElemsToParse: 0, // No limit
                nbTopCandidates: 5,
                charThreshold: 500,
                classesToPreserve: ['highlight', 'code', 'pre']
            },
            
            // Fallback settings
            enableFallback: true,
            fallbackSelectors: ['main', 'article', '.content', '#content', '.post', '.entry'],
            
            // Content filtering
            minContentLength: 100,
            maxContentLength: 1000000 // 1MB
        };
    }
    
    /**
     * Gets configuration for text processing and chunking
     * @returns {Object} - Text processing configuration
     */
    getProcessingConfig() {
        const config = this.getConfig();
        
        return {
            chunkSize: config.chunkSize,
            chunkOverlap: config.chunkOverlap,
            
            // Chunking behavior
            separators: ['\n\n', '\n', ' ', ''],
            keepSeparator: false,
            
            // Token estimation
            enableTokenEstimation: true,
            tokenModel: 'gpt-3.5-turbo', // For estimation purposes
            
            // Metadata settings
            includeMetadata: true,
            metadataFields: ['url', 'title', 'description', 'crawled_at', 'chunk_index']
        };
    }
    
    /**
     * Gets configuration for URL filtering
     * @returns {Object} - URL filtering configuration
     */
    getUrlFilterConfig() {
        const config = this.getConfig();
        
        return {
            includeUrlGlobs: config.includeUrlGlobs,
            crawlDepth: config.crawlDepth,
            
            // Additional filtering rules
            excludePatterns: [
                '**/*.pdf',
                '**/*.doc',
                '**/*.docx',
                '**/*.xls',
                '**/*.xlsx',
                '**/*.ppt',
                '**/*.pptx',
                '**/*.zip',
                '**/*.tar.gz',
                '**/*.exe',
                '**/*.dmg'
            ],
            
            // URL normalization
            normalizeUrls: true,
            removeFragments: true,
            removeQueryParams: ['utm_*', 'ref', 'source']
        };
    }
    
    /**
     * Gets all validation errors
     * @returns {Array} - Array of error reports
     */
    getErrors() {
        return [...this.errors];
    }
    
    /**
     * Checks if configuration is valid
     * @returns {boolean} - True if configuration is valid
     */
    isConfigValid() {
        return this.isValid;
    }
    
    /**
     * Creates a summary of the current configuration
     * @returns {Object} - Configuration summary
     */
    getSummary() {
        if (!this.isValid) {
            return {
                valid: false,
                errors: this.errors.length,
                message: 'Configuration validation failed'
            };
        }
        
        const config = this.config;
        
        return {
            valid: true,
            startUrls: config.startUrls.length,
            crawlDepth: config.crawlDepth,
            urlPatterns: config.includeUrlGlobs.length,
            chunkSize: config.chunkSize,
            chunkOverlap: config.chunkOverlap,
            maxRequests: config.maxRequestsPerCrawl,
            requestDelay: config.requestDelay,
            proxyEnabled: config.proxyConfiguration?.useApifyProxy || false
        };
    }
}

/**
 * Creates and returns a new configuration manager instance
 * @returns {ConfigManager} - New configuration manager
 */
export function createConfigManager() {
    return new ConfigManager();
}