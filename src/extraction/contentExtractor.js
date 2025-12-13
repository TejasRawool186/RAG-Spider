/**
 * Content Extractor Pipeline for RAG Spider
 * 
 * This module orchestrates the complete content extraction pipeline:
 * HTML parsing → Readability cleaning → Markdown conversion
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { createJSDOMParser } from './jsdomParser.js';
import { createReadabilityExtractor } from './readabilityExtractor.js';
import { createMarkdownConverter } from './markdownConverter.js';

/**
 * Complete content extraction result
 */
export class ContentExtractionResult {
    constructor({
        success = false,
        url = '',
        title = '',
        description = '',
        markdown = '',
        textContent = '',
        byline = '',
        readTime = 0,
        fallbackUsed = false,
        method = 'unknown',
        stats = {},
        warnings = [],
        errors = []
    } = {}) {
        this.success = success;
        this.url = url;
        this.title = title;
        this.description = description;
        this.markdown = markdown;
        this.textContent = textContent;
        this.byline = byline;
        this.readTime = readTime;
        this.fallbackUsed = fallbackUsed;
        this.method = method;
        this.stats = stats;
        this.warnings = warnings;
        this.errors = errors;
        this.extractedAt = new Date().toISOString();
    }
}

/**
 * Content extraction pipeline error
 */
export class ContentExtractionPipelineError extends Error {
    constructor(message, stage = 'unknown', originalError = null) {
        super(message);
        this.name = 'ContentExtractionPipelineError';
        this.stage = stage;
        this.originalError = originalError;
    }
}

/**
 * Complete content extraction pipeline
 */
export class ContentExtractor {
    constructor(config = {}) {
        this.config = {
            // JSDOM options
            jsdom: {
                resources: 'usable',
                runScripts: 'outside-only',
                pretendToBeVisual: false,
                ...config.jsdom
            },
            
            // Readability options
            readability: {
                debug: false,
                maxElemsToParse: 0,
                nbTopCandidates: 5,
                charThreshold: 500,
                classesToPreserve: ['highlight', 'code', 'pre', 'syntax'],
                ...config.readability
            },
            
            // Markdown conversion options
            markdown: {
                headingStyle: 'atx',
                codeBlockStyle: 'fenced',
                bulletListMarker: '-',
                ...config.markdown
            },
            
            // Pipeline options
            enableFallback: config.enableFallback !== false,
            minContentLength: config.minContentLength || 100,
            maxContentLength: config.maxContentLength || 1000000
        };
        
        // Initialize components
        this.jsdomParser = createJSDOMParser(this.config.jsdom);
        this.readabilityExtractor = createReadabilityExtractor(this.config.readability);
        this.markdownConverter = createMarkdownConverter(this.config.markdown);
    }
    
    /**
     * Extracts content from HTML using the complete pipeline
     * @param {string} html - Raw HTML content
     * @param {string} url - Source URL
     * @returns {Promise<ContentExtractionResult>} - Extraction result
     */
    async extract(html, url = '') {
        const errors = [];
        const warnings = [];
        let parsedDocument = null;
        
        try {
            // Stage 1: Parse HTML with JSDOM
            console.log(`🔍 Parsing HTML for ${url}`);
            parsedDocument = await this.parseHtml(html, url);
            
            // Stage 2: Extract content with Readability
            console.log(`📖 Extracting content for ${url}`);
            const extractionResult = await this.extractContent(parsedDocument);
            
            if (!extractionResult.success) {
                throw new ContentExtractionPipelineError(
                    'Content extraction failed',
                    'extraction',
                    new Error('No suitable content found')
                );
            }
            
            // Stage 3: Convert to Markdown
            console.log(`📝 Converting to Markdown for ${url}`);
            const conversionResult = await this.convertToMarkdown(extractionResult.content);
            
            if (!conversionResult.success) {
                throw new ContentExtractionPipelineError(
                    'Markdown conversion failed',
                    'conversion',
                    new Error('Failed to convert HTML to Markdown')
                );
            }
            
            // Combine results
            const result = new ContentExtractionResult({
                success: true,
                url,
                title: extractionResult.title,
                description: extractionResult.excerpt,
                markdown: conversionResult.markdown,
                textContent: conversionResult.textContent,
                byline: extractionResult.byline,
                readTime: extractionResult.readTime,
                fallbackUsed: extractionResult.fallbackUsed,
                method: extractionResult.method,
                stats: {
                    parsing: parsedDocument.getStats(),
                    extraction: extractionResult.stats,
                    conversion: conversionResult.stats
                },
                warnings: [...warnings, ...conversionResult.warnings],
                errors
            });
            
            // Validate final result
            this.validateResult(result);
            
            console.log(`✅ Content extraction completed for ${url}`);
            return result;
            
        } catch (error) {
            errors.push({
                stage: error.stage || 'unknown',
                message: error.message,
                timestamp: new Date().toISOString()
            });
            
            console.error(`❌ Content extraction failed for ${url}:`, error.message);
            
            return new ContentExtractionResult({
                success: false,
                url,
                errors,
                warnings
            });
            
        } finally {
            // Cleanup JSDOM resources
            if (parsedDocument && parsedDocument.cleanup) {
                parsedDocument.cleanup();
            }
        }
    }
    
    /**
     * Parses HTML using JSDOM
     * @param {string} html - HTML content
     * @param {string} url - Source URL
     * @returns {Object} - Parsed document
     */
    async parseHtml(html, url) {
        try {
            // Validate HTML first
            const validation = this.jsdomParser.validateHtml(html);
            if (!validation.valid) {
                throw new ContentExtractionPipelineError(
                    `HTML validation failed: ${validation.errors.join(', ')}`,
                    'parsing'
                );
            }
            
            // Parse HTML
            const parsed = this.jsdomParser.parse(html, url);
            
            // Check if document has meaningful content
            const stats = parsed.getStats();
            if (stats.textLength < this.config.minContentLength) {
                throw new ContentExtractionPipelineError(
                    `Content too short: ${stats.textLength} characters (minimum: ${this.config.minContentLength})`,
                    'parsing'
                );
            }
            
            return parsed;
            
        } catch (error) {
            throw new ContentExtractionPipelineError(
                `HTML parsing failed: ${error.message}`,
                'parsing',
                error
            );
        }
    }
    
    /**
     * Extracts content using Readability
     * @param {Object} parsedDocument - Parsed JSDOM document
     * @returns {Object} - Extraction result
     */
    async extractContent(parsedDocument) {
        try {
            const result = this.readabilityExtractor.extract(parsedDocument);
            
            if (!result.success && !this.config.enableFallback) {
                throw new ContentExtractionPipelineError(
                    'Content extraction failed and fallback is disabled',
                    'extraction'
                );
            }
            
            return result;
            
        } catch (error) {
            throw new ContentExtractionPipelineError(
                `Content extraction failed: ${error.message}`,
                'extraction',
                error
            );
        }
    }
    
    /**
     * Converts HTML content to Markdown
     * @param {string} htmlContent - HTML content
     * @returns {Object} - Conversion result
     */
    async convertToMarkdown(htmlContent) {
        try {
            const result = this.markdownConverter.convert(htmlContent);
            
            if (!result.success) {
                throw new ContentExtractionPipelineError(
                    'Markdown conversion failed',
                    'conversion'
                );
            }
            
            return result;
            
        } catch (error) {
            throw new ContentExtractionPipelineError(
                `Markdown conversion failed: ${error.message}`,
                'conversion',
                error
            );
        }
    }
    
    /**
     * Validates the final extraction result
     * @param {ContentExtractionResult} result - Result to validate
     */
    validateResult(result) {
        if (!result.markdown || result.markdown.trim().length === 0) {
            throw new ContentExtractionPipelineError(
                'Final result has no Markdown content',
                'validation'
            );
        }
        
        if (!result.textContent || result.textContent.trim().length === 0) {
            throw new ContentExtractionPipelineError(
                'Final result has no text content',
                'validation'
            );
        }
        
        if (result.textContent.length < this.config.minContentLength) {
            throw new ContentExtractionPipelineError(
                `Final content too short: ${result.textContent.length} characters`,
                'validation'
            );
        }
        
        if (result.textContent.length > this.config.maxContentLength) {
            throw new ContentExtractionPipelineError(
                `Final content too long: ${result.textContent.length} characters`,
                'validation'
            );
        }
    }
    
    /**
     * Extracts content with automatic resource cleanup
     * @param {string} html - HTML content
     * @param {string} url - Source URL
     * @returns {Promise<ContentExtractionResult>} - Extraction result
     */
    async extractWithCleanup(html, url) {
        try {
            return await this.extract(html, url);
        } finally {
            // Ensure cleanup of all components
            this.cleanup();
        }
    }
    
    /**
     * Cleanup all resources
     */
    cleanup() {
        if (this.jsdomParser) {
            this.jsdomParser.cleanup();
        }
    }
    
    /**
     * Get pipeline statistics
     * @returns {Object} - Pipeline statistics
     */
    getStats() {
        return {
            jsdom: this.jsdomParser ? this.jsdomParser.getStats() : null,
            config: {
                enableFallback: this.config.enableFallback,
                minContentLength: this.config.minContentLength,
                maxContentLength: this.config.maxContentLength
            }
        };
    }
}

/**
 * Creates a new content extractor instance
 * @param {Object} config - Configuration options
 * @returns {ContentExtractor} - New extractor instance
 */
export function createContentExtractor(config = {}) {
    return new ContentExtractor(config);
}

/**
 * Convenience function to extract content from HTML
 * @param {string} html - HTML content
 * @param {string} url - Source URL
 * @param {Object} config - Configuration options
 * @returns {Promise<ContentExtractionResult>} - Extraction result
 */
export async function extractContent(html, url = '', config = {}) {
    const extractor = createContentExtractor(config);
    try {
        return await extractor.extract(html, url);
    } finally {
        extractor.cleanup();
    }
}