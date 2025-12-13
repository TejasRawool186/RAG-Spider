/**
 * Readability Engine Integration for RAG Spider
 * 
 * This module integrates Mozilla's Readability engine to extract clean article
 * content from web pages, removing navigation, advertisements, and other noise.
 * It provides fallback mechanisms when Readability fails.
 * 
 * Requirements: 1.2, 1.3
 */

import { Readability } from '@mozilla/readability';

/**
 * Default configuration for Readability engine
 */
const DEFAULT_READABILITY_OPTIONS = {
    debug: false,
    maxElemsToParse: 0, // No limit
    nbTopCandidates: 5,
    charThreshold: 100,
    classesToPreserve: ['highlight', 'code', 'pre', 'syntax', 'language-']
};

/**
 * Fallback selectors to try when Readability fails
 */
const FALLBACK_SELECTORS = [
    'main',
    'article', 
    '.content',
    '#content',
    '.main-content',
    '.post-content',
    '.entry-content',
    '.article-content',
    '.page-content',
    '.post',
    '.entry',
    '.article',
    'body'
];

/**
 * Error class for content extraction failures
 */
export class ContentExtractionError extends Error {
    constructor(message, url = '', fallbackUsed = false) {
        super(message);
        this.name = 'ContentExtractionError';
        this.url = url;
        this.fallbackUsed = fallbackUsed;
    }
}

/**
 * Content extraction result interface
 */
export class ExtractionResult {
    constructor({
        success = false,
        title = '',
        content = '',
        textContent = '',
        byline = '',
        excerpt = '',
        readTime = 0,
        fallbackUsed = false,
        url = '',
        method = 'unknown',
        stats = {}
    } = {}) {
        this.success = success;
        this.title = title;
        this.content = content;
        this.textContent = textContent;
        this.byline = byline;
        this.excerpt = excerpt;
        this.readTime = readTime;
        this.fallbackUsed = fallbackUsed;
        this.url = url;
        this.method = method;
        this.stats = stats;
    }
}

/**
 * Readability-based content extractor
 */
export class ReadabilityExtractor {
    constructor(options = {}) {
        this.options = {
            ...DEFAULT_READABILITY_OPTIONS,
            ...options
        };
        this.fallbackSelectors = [...FALLBACK_SELECTORS];
    }
    
    /**
     * Extracts content from a JSDOM document using Readability
     * @param {Object} parsedDocument - JSDOM parsed document object
     * @returns {ExtractionResult} - Extraction result
     */
    extract(parsedDocument) {
        const { document, url = '', htmlLength = 0 } = parsedDocument;
        
        if (!document) {
            throw new ContentExtractionError('No document provided for extraction', url);
        }
        
        // First try Readability extraction
        try {
            const readabilityResult = this.extractWithReadability(document, url);
            if (readabilityResult.success) {
                return readabilityResult;
            }
        } catch (error) {
            console.warn(`Readability extraction failed for ${url}:`, error.message);
        }
        
        // Fall back to selector-based extraction
        console.log(`Falling back to selector-based extraction for ${url}`);
        return this.extractWithFallback(document, url, htmlLength);
    }
    
    /**
     * Extracts content using Mozilla Readability
     * @param {Document} document - JSDOM document
     * @param {string} url - Source URL
     * @returns {ExtractionResult} - Extraction result
     */
    extractWithReadability(document, url) {
        // Clone the document to avoid modifying the original
        const documentClone = document.cloneNode(true);
        
        // Create Readability instance
        const reader = new Readability(documentClone, this.options);
        
        // Parse the document
        const article = reader.parse();
        
        if (!article) {
            return new ExtractionResult({
                success: false,
                url,
                method: 'readability',
                stats: { reason: 'Readability returned null' }
            });
        }
        
        // Validate extracted content
        const textContent = this.extractTextContent(article.content);
        
        if (textContent.length < this.options.charThreshold) {
            return new ExtractionResult({
                success: false,
                url,
                method: 'readability',
                stats: { 
                    reason: 'Content too short',
                    textLength: textContent.length,
                    threshold: this.options.charThreshold
                }
            });
        }
        
        return new ExtractionResult({
            success: true,
            title: article.title || document.title || '',
            content: article.content || '',
            textContent: textContent,
            byline: article.byline || '',
            excerpt: article.excerpt || '',
            readTime: article.length || 0,
            fallbackUsed: false,
            url,
            method: 'readability',
            stats: {
                contentLength: article.content ? article.content.length : 0,
                textLength: textContent.length,
                readTime: article.length || 0
            }
        });
    }
    
    /**
     * Extracts content using fallback selectors
     * @param {Document} document - JSDOM document
     * @param {string} url - Source URL
     * @param {number} htmlLength - Original HTML length
     * @returns {ExtractionResult} - Extraction result
     */
    extractWithFallback(document, url, htmlLength = 0) {
        let bestContent = '';
        let bestTextContent = '';
        let bestSelector = '';
        let bestScore = 0;
        
        // Try each fallback selector
        for (const selector of this.fallbackSelectors) {
            try {
                const elements = document.querySelectorAll(selector);
                
                for (const element of elements) {
                    const content = element.innerHTML || '';
                    const textContent = this.extractTextContent(content);
                    
                    // Score based on text length and content quality
                    const score = this.scoreContent(textContent, content);
                    
                    if (score > bestScore && textContent.length >= this.options.charThreshold) {
                        bestContent = content;
                        bestTextContent = textContent;
                        bestSelector = selector;
                        bestScore = score;
                    }
                }
            } catch (error) {
                console.warn(`Error with fallback selector ${selector}:`, error.message);
            }
        }
        
        if (!bestContent) {
            throw new ContentExtractionError(
                'No suitable content found with any fallback method',
                url,
                true
            );
        }
        
        return new ExtractionResult({
            success: true,
            title: document.title || '',
            content: bestContent,
            textContent: bestTextContent,
            byline: '',
            excerpt: this.generateExcerpt(bestTextContent),
            readTime: Math.ceil(bestTextContent.length / 1000), // Rough estimate
            fallbackUsed: true,
            url,
            method: `fallback-${bestSelector}`,
            stats: {
                contentLength: bestContent.length,
                textLength: bestTextContent.length,
                selector: bestSelector,
                score: bestScore,
                htmlLength
            }
        });
    }
    
    /**
     * Extracts plain text content from HTML
     * @param {string} html - HTML content
     * @returns {string} - Plain text content
     */
    extractTextContent(html) {
        if (!html) return '';
        
        // Remove script and style elements
        const cleanHtml = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ') // Remove HTML tags
            .replace(/\s+/g, ' ') // Normalize whitespace
            .replace(/\s+([.!?])/g, '$1') // Fix punctuation spacing
            .trim();
        
        return cleanHtml;
    }
    
    /**
     * Scores content quality for fallback selection
     * @param {string} textContent - Plain text content
     * @param {string} htmlContent - HTML content
     * @returns {number} - Content quality score
     */
    scoreContent(textContent, htmlContent) {
        let score = 0;
        
        // Base score from text length
        score += Math.min(textContent.length / 100, 100);
        
        // Bonus for paragraphs
        const paragraphs = (htmlContent.match(/<p[^>]*>/gi) || []).length;
        score += paragraphs * 5;
        
        // Bonus for headings
        const headings = (htmlContent.match(/<h[1-6][^>]*>/gi) || []).length;
        score += headings * 3;
        
        // Bonus for lists
        const lists = (htmlContent.match(/<[uo]l[^>]*>/gi) || []).length;
        score += lists * 2;
        
        // Penalty for excessive links (might be navigation)
        const links = (htmlContent.match(/<a[^>]*>/gi) || []).length;
        const linkRatio = links / Math.max(textContent.length / 100, 1);
        if (linkRatio > 5) {
            score -= linkRatio * 2;
        }
        
        return Math.max(score, 0);
    }
    
    /**
     * Generates an excerpt from text content
     * @param {string} textContent - Full text content
     * @param {number} maxLength - Maximum excerpt length
     * @returns {string} - Generated excerpt
     */
    generateExcerpt(textContent, maxLength = 200) {
        if (!textContent || textContent.length <= maxLength) {
            return textContent;
        }
        
        // Find a good breaking point (sentence or word boundary)
        const truncated = textContent.substring(0, maxLength);
        const lastSentence = truncated.lastIndexOf('.');
        const lastSpace = truncated.lastIndexOf(' ');
        
        if (lastSentence > maxLength * 0.5) {
            return truncated.substring(0, lastSentence + 1);
        } else if (lastSpace > maxLength * 0.7) {
            return truncated.substring(0, lastSpace) + '...';
        } else {
            return truncated + '...';
        }
    }
    
    /**
     * Validates extraction result
     * @param {ExtractionResult} result - Extraction result to validate
     * @returns {boolean} - True if result is valid
     */
    validateResult(result) {
        if (!result || !result.success) {
            return false;
        }
        
        if (!result.content && !result.textContent) {
            return false;
        }
        
        if (result.textContent.length < this.options.charThreshold) {
            return false;
        }
        
        return true;
    }
}

/**
 * Creates a new Readability extractor instance
 * @param {Object} options - Configuration options
 * @returns {ReadabilityExtractor} - New extractor instance
 */
export function createReadabilityExtractor(options = {}) {
    return new ReadabilityExtractor(options);
}

/**
 * Convenience function to extract content from a parsed document
 * @param {Object} parsedDocument - JSDOM parsed document
 * @param {Object} options - Extraction options
 * @returns {ExtractionResult} - Extraction result
 */
export function extractContent(parsedDocument, options = {}) {
    const extractor = createReadabilityExtractor(options);
    return extractor.extract(parsedDocument);
}