/**
 * JSDOM Parser Wrapper for RAG Spider
 * 
 * This module provides a wrapper around JSDOM for converting raw HTML strings
 * into manipulable DOM objects. It handles memory management and provides
 * a clean interface for content extraction.
 * 
 * Requirements: 1.2, 1.3
 */

import { JSDOM } from 'jsdom';

/**
 * Configuration options for JSDOM parser
 */
const DEFAULT_JSDOM_OPTIONS = {
    // Don't load external resources
    resources: 'usable',
    runScripts: 'outside-only',
    
    // Optimize for content extraction
    pretendToBeVisual: false,
    storageQuota: 10000000, // 10MB storage quota
    
    // Security settings
    beforeParse: (window) => {
        // Disable potentially dangerous APIs
        delete window.alert;
        delete window.confirm;
        delete window.prompt;
    }
};

/**
 * Error class for JSDOM parsing failures
 */
export class JSDOMParseError extends Error {
    constructor(message, originalError = null, htmlLength = 0) {
        super(message);
        this.name = 'JSDOMParseError';
        this.originalError = originalError;
        this.htmlLength = htmlLength;
    }
}

/**
 * JSDOM Parser class that handles HTML to DOM conversion
 */
export class JSDOMParser {
    constructor(options = {}) {
        this.options = {
            ...DEFAULT_JSDOM_OPTIONS,
            ...options
        };
        this.activeInstances = new Set();
    }
    
    /**
     * Parses HTML string into a JSDOM Document
     * @param {string} html - Raw HTML content
     * @param {string} url - Source URL for the HTML (optional)
     * @returns {Object} - Parsed document with cleanup method
     * @throws {JSDOMParseError} - If parsing fails
     */
    parse(html, url = 'about:blank') {
        if (typeof html !== 'string') {
            throw new JSDOMParseError('HTML content must be a string', null, 0);
        }
        
        if (html.trim().length === 0) {
            throw new JSDOMParseError('HTML content cannot be empty', null, 0);
        }
        
        // Validate HTML length to prevent memory issues
        if (html.length > 50 * 1024 * 1024) { // 50MB limit
            throw new JSDOMParseError(
                `HTML content too large: ${html.length} bytes (max 50MB)`,
                null,
                html.length
            );
        }
        
        let dom;
        let document;
        
        try {
            // Create JSDOM instance with the provided HTML
            dom = new JSDOM(html, {
                ...this.options,
                url: url
            });
            
            document = dom.window.document;
            
            // Track active instance for cleanup
            this.activeInstances.add(dom);
            
            // Return document with cleanup method
            return {
                document,
                window: dom.window,
                url: url,
                htmlLength: html.length,
                
                /**
                 * Cleanup method to free memory
                 */
                cleanup: () => {
                    try {
                        if (dom && dom.window) {
                            // Close the window to free resources
                            dom.window.close();
                            this.activeInstances.delete(dom);
                        }
                    } catch (error) {
                        console.warn('Warning: Error during JSDOM cleanup:', error.message);
                    }
                },
                
                /**
                 * Get basic document statistics
                 */
                getStats: () => ({
                    url: url,
                    htmlLength: html.length,
                    title: document.title || '',
                    elementCount: document.getElementsByTagName('*').length,
                    textLength: document.body ? document.body.textContent.length : 0
                })
            };
            
        } catch (error) {
            // Clean up on error
            if (dom) {
                try {
                    dom.window.close();
                    this.activeInstances.delete(dom);
                } catch (cleanupError) {
                    // Ignore cleanup errors
                }
            }
            
            throw new JSDOMParseError(
                `Failed to parse HTML: ${error.message}`,
                error,
                html.length
            );
        }
    }
    
    /**
     * Parses HTML with automatic cleanup after processing
     * @param {string} html - Raw HTML content
     * @param {string} url - Source URL for the HTML
     * @param {Function} processor - Function to process the document
     * @returns {any} - Result from processor function
     */
    async parseAndProcess(html, url, processor) {
        const parsed = this.parse(html, url);
        
        try {
            return await processor(parsed);
        } finally {
            parsed.cleanup();
        }
    }
    
    /**
     * Validates HTML content before parsing
     * @param {string} html - HTML content to validate
     * @returns {Object} - Validation result
     */
    validateHtml(html) {
        const result = {
            valid: true,
            errors: [],
            warnings: [],
            stats: {
                length: 0,
                hasDoctype: false,
                hasHtml: false,
                hasHead: false,
                hasBody: false
            }
        };
        
        if (typeof html !== 'string') {
            result.valid = false;
            result.errors.push('HTML content must be a string');
            return result;
        }
        
        result.stats.length = html.length;
        
        if (html.trim().length === 0) {
            result.valid = false;
            result.errors.push('HTML content cannot be empty');
            return result;
        }
        
        if (html.length > 50 * 1024 * 1024) {
            result.valid = false;
            result.errors.push(`HTML content too large: ${html.length} bytes (max 50MB)`);
            return result;
        }
        
        // Basic HTML structure checks
        result.stats.hasDoctype = /<!DOCTYPE\s+html/i.test(html);
        result.stats.hasHtml = /<html[\s>]/i.test(html);
        result.stats.hasHead = /<head[\s>]/i.test(html);
        result.stats.hasBody = /<body[\s>]/i.test(html);
        
        // Warnings for missing structure
        if (!result.stats.hasBody) {
            result.warnings.push('HTML content missing <body> tag');
        }
        
        if (!result.stats.hasHead) {
            result.warnings.push('HTML content missing <head> tag');
        }
        
        return result;
    }
    
    /**
     * Cleanup all active JSDOM instances
     */
    cleanup() {
        for (const dom of this.activeInstances) {
            try {
                dom.window.close();
            } catch (error) {
                console.warn('Warning: Error during bulk JSDOM cleanup:', error.message);
            }
        }
        this.activeInstances.clear();
    }
    
    /**
     * Get statistics about active instances
     */
    getStats() {
        return {
            activeInstances: this.activeInstances.size,
            memoryUsage: process.memoryUsage()
        };
    }
}

/**
 * Creates a new JSDOM parser instance
 * @param {Object} options - Configuration options
 * @returns {JSDOMParser} - New parser instance
 */
export function createJSDOMParser(options = {}) {
    return new JSDOMParser(options);
}

/**
 * Convenience function to parse HTML with automatic cleanup
 * @param {string} html - HTML content to parse
 * @param {string} url - Source URL
 * @param {Function} processor - Processing function
 * @returns {any} - Result from processor
 */
export async function parseHtml(html, url, processor) {
    const parser = createJSDOMParser();
    try {
        return await parser.parseAndProcess(html, url, processor);
    } finally {
        parser.cleanup();
    }
}