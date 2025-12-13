/**
 * HTML to Markdown Converter for RAG Spider
 * 
 * This module converts cleaned HTML content to GitHub Flavored Markdown,
 * preserving document structure, code blocks, tables, and links.
 * 
 * Requirements: 1.4, 1.5, 6.1, 6.2, 6.3, 6.4, 6.5
 */

import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

/**
 * Default configuration for Turndown service
 */
const DEFAULT_TURNDOWN_OPTIONS = {
    headingStyle: 'atx', // Use # for headings
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
    linkReferenceStyle: 'full'
};

/**
 * Error class for Markdown conversion failures
 */
export class MarkdownConversionError extends Error {
    constructor(message, htmlContent = '', originalError = null) {
        super(message);
        this.name = 'MarkdownConversionError';
        this.htmlContent = htmlContent ? htmlContent.substring(0, 500) + '...' : '';
        this.originalError = originalError;
    }
}

/**
 * Markdown conversion result
 */
export class ConversionResult {
    constructor({
        success = false,
        markdown = '',
        textContent = '',
        stats = {},
        warnings = []
    } = {}) {
        this.success = success;
        this.markdown = markdown;
        this.textContent = textContent;
        this.stats = stats;
        this.warnings = warnings;
    }
}

/**
 * HTML to Markdown converter using Turndown
 */
export class MarkdownConverter {
    constructor(options = {}) {
        this.options = {
            ...DEFAULT_TURNDOWN_OPTIONS,
            ...options
        };
        
        this.turndownService = this.createTurndownService();
    }
    
    /**
     * Creates and configures the Turndown service
     * @returns {TurndownService} - Configured Turndown service
     */
    createTurndownService() {
        const service = new TurndownService(this.options);
        
        // Add GitHub Flavored Markdown support
        service.use(gfm);
        
        // Custom rules for better content preservation
        this.addCustomRules(service);
        
        return service;
    }
    
    /**
     * Adds custom conversion rules to Turndown service
     * @param {TurndownService} service - Turndown service instance
     */
    addCustomRules(service) {
        // Preserve code blocks with language detection
        service.addRule('codeBlocks', {
            filter: ['pre'],
            replacement: (content, node) => {
                const codeElement = node.querySelector('code');
                if (codeElement) {
                    // Try to detect language from class names
                    const language = this.detectCodeLanguage(codeElement);
                    return `\n\n\`\`\`${language}\n${codeElement.textContent}\n\`\`\`\n\n`;
                }
                return `\n\n\`\`\`\n${content}\n\`\`\`\n\n`;
            }
        });
        
        // Preserve inline code
        service.addRule('inlineCode', {
            filter: ['code'],
            replacement: (content) => {
                // Don't double-process code inside pre blocks
                return `\`${content}\``;
            }
        });
        
        // Better handling of nested lists
        service.addRule('nestedLists', {
            filter: ['ul', 'ol'],
            replacement: (content, node) => {
                const isOrdered = node.tagName.toLowerCase() === 'ol';
                const items = content.split('\n').filter(line => line.trim());
                
                return items.map((item, index) => {
                    const marker = isOrdered ? `${index + 1}.` : '-';
                    return `${marker} ${item.replace(/^[-*+]\s*/, '')}`;
                }).join('\n') + '\n\n';
            }
        });
        
        // Preserve table structure
        service.addRule('tables', {
            filter: 'table',
            replacement: (content, node) => {
                // Let GFM plugin handle tables, but ensure proper spacing
                return '\n\n' + content + '\n\n';
            }
        });
        
        // Better link handling with title preservation
        service.addRule('links', {
            filter: 'a',
            replacement: (content, node) => {
                const href = node.getAttribute('href');
                const title = node.getAttribute('title');
                
                if (!href) return content;
                
                // Handle relative URLs
                const url = this.normalizeUrl(href);
                
                if (title) {
                    return `[${content}](${url} "${title}")`;
                } else {
                    return `[${content}](${url})`;
                }
            }
        });
        
        // Preserve image alt text and titles
        service.addRule('images', {
            filter: 'img',
            replacement: (content, node) => {
                const src = node.getAttribute('src');
                const alt = node.getAttribute('alt') || '';
                const title = node.getAttribute('title');
                
                if (!src) return '';
                
                const url = this.normalizeUrl(src);
                
                if (title) {
                    return `![${alt}](${url} "${title}")`;
                } else {
                    return `![${alt}](${url})`;
                }
            }
        });
        
        // Handle blockquotes better
        service.addRule('blockquotes', {
            filter: 'blockquote',
            replacement: (content) => {
                return content.split('\n').map(line => 
                    line.trim() ? `> ${line}` : '>'
                ).join('\n') + '\n\n';
            }
        });
        
        // Remove unwanted elements
        service.remove(['script', 'style', 'nav', 'header', 'footer', 'aside']);
    }
    
    /**
     * Converts HTML content to Markdown
     * @param {string} htmlContent - HTML content to convert
     * @param {Object} options - Conversion options
     * @returns {ConversionResult} - Conversion result
     */
    convert(htmlContent, options = {}) {
        if (!htmlContent || typeof htmlContent !== 'string') {
            throw new MarkdownConversionError('HTML content must be a non-empty string');
        }
        
        const warnings = [];
        let markdown = '';
        let textContent = '';
        
        try {
            // Pre-process HTML for better conversion
            const processedHtml = this.preprocessHtml(htmlContent, warnings);
            
            // Convert to Markdown
            markdown = this.turndownService.turndown(processedHtml);
            
            // Post-process Markdown
            markdown = this.postprocessMarkdown(markdown, warnings);
            
            // Extract plain text content
            textContent = this.extractTextFromMarkdown(markdown);
            
            // Generate statistics
            const stats = this.generateStats(htmlContent, markdown, textContent);
            
            return new ConversionResult({
                success: true,
                markdown,
                textContent,
                stats,
                warnings
            });
            
        } catch (error) {
            throw new MarkdownConversionError(
                `Failed to convert HTML to Markdown: ${error.message}`,
                htmlContent,
                error
            );
        }
    }
    
    /**
     * Pre-processes HTML for better Markdown conversion
     * @param {string} html - HTML content
     * @param {Array} warnings - Array to collect warnings
     * @returns {string} - Processed HTML
     */
    preprocessHtml(html, warnings) {
        let processed = html;
        
        // Fix common HTML issues
        processed = processed
            // Remove empty paragraphs
            .replace(/<p[^>]*>\s*<\/p>/gi, '')
            // Fix nested paragraphs (invalid HTML)
            .replace(/<p[^>]*>([^<]*)<p[^>]*>/gi, '<p>$1</p><p>')
            // Normalize whitespace in code blocks
            .replace(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, 
                (match, code) => `<pre><code>${code.trim()}</code></pre>`)
            // Remove excessive whitespace
            .replace(/\s{3,}/g, ' ')
            // Fix broken list structures
            .replace(/<\/li>\s*<li>/gi, '</li>\n<li>');
        
        // Check for potential issues
        if (processed.includes('<table') && !processed.includes('<th')) {
            warnings.push('Table found without header cells - may not convert properly');
        }
        
        if ((processed.match(/<code[^>]*>/gi) || []).length > 10) {
            warnings.push('Many code blocks detected - verify formatting in output');
        }
        
        return processed;
    }
    
    /**
     * Post-processes Markdown for better formatting
     * @param {string} markdown - Raw Markdown content
     * @param {Array} warnings - Array to collect warnings
     * @returns {string} - Processed Markdown
     */
    postprocessMarkdown(markdown, warnings) {
        let processed = markdown;
        
        // Clean up excessive newlines
        processed = processed
            .replace(/\n{4,}/g, '\n\n\n')
            .replace(/^\n+/, '')
            .replace(/\n+$/, '\n');
        
        // Fix list formatting
        processed = processed
            .replace(/^(\s*[-*+])\s+$/gm, '$1 ')
            .replace(/^(\s*\d+\.)\s+$/gm, '$1 ');
        
        // Ensure proper spacing around code blocks
        processed = processed
            .replace(/([^\n])\n```/g, '$1\n\n```')
            .replace(/```\n([^\n])/g, '```\n\n$1');
        
        // Fix heading spacing
        processed = processed
            .replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2')
            .replace(/(#{1,6}[^\n]*)\n([^\n#])/g, '$1\n\n$2');
        
        // Validate the result
        if (processed.length < markdown.length * 0.5) {
            warnings.push('Significant content loss during post-processing');
        }
        
        return processed;
    }
    
    /**
     * Extracts plain text from Markdown content
     * @param {string} markdown - Markdown content
     * @returns {string} - Plain text content
     */
    extractTextFromMarkdown(markdown) {
        return markdown
            // Remove code blocks
            .replace(/```[\s\S]*?```/g, ' ')
            // Remove inline code
            .replace(/`[^`]+`/g, ' ')
            // Remove links but keep text
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            // Remove images
            .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
            // Remove headings markers
            .replace(/^#{1,6}\s+/gm, '')
            // Remove list markers
            .replace(/^[\s]*[-*+]\s+/gm, '')
            .replace(/^[\s]*\d+\.\s+/gm, '')
            // Remove blockquote markers
            .replace(/^>\s*/gm, '')
            // Remove emphasis markers
            .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1')
            // Normalize whitespace
            .replace(/\s+/g, ' ')
            .trim();
    }
    
    /**
     * Detects programming language from code element classes
     * @param {Element} codeElement - Code element
     * @returns {string} - Detected language or empty string
     */
    detectCodeLanguage(codeElement) {
        const className = codeElement.className || '';
        
        // Common language class patterns
        const patterns = [
            /language-(\w+)/,
            /lang-(\w+)/,
            /highlight-(\w+)/,
            /(\w+)-code/,
            /^(\w+)$/
        ];
        
        for (const pattern of patterns) {
            const match = className.match(pattern);
            if (match) {
                return match[1].toLowerCase();
            }
        }
        
        // Try to detect from content
        const content = codeElement.textContent || '';
        if (content.includes('function ') || content.includes('const ') || content.includes('=>')) {
            return 'javascript';
        }
        if (content.includes('def ') || content.includes('import ')) {
            return 'python';
        }
        if (content.includes('<?php')) {
            return 'php';
        }
        
        return '';
    }
    
    /**
     * Normalizes URLs for Markdown links
     * @param {string} url - URL to normalize
     * @returns {string} - Normalized URL
     */
    normalizeUrl(url) {
        if (!url) return '';
        
        // Handle relative URLs (would need base URL in real implementation)
        if (url.startsWith('//')) {
            return 'https:' + url;
        }
        
        if (url.startsWith('/')) {
            // Would need base URL to resolve properly
            return url;
        }
        
        return url;
    }
    
    /**
     * Generates conversion statistics
     * @param {string} html - Original HTML
     * @param {string} markdown - Converted Markdown
     * @param {string} textContent - Plain text content
     * @returns {Object} - Statistics object
     */
    generateStats(html, markdown, textContent) {
        return {
            htmlLength: html.length,
            markdownLength: markdown.length,
            textLength: textContent.length,
            compressionRatio: markdown.length / html.length,
            codeBlocks: (markdown.match(/```/g) || []).length / 2,
            headings: (markdown.match(/^#{1,6}\s/gm) || []).length,
            links: (markdown.match(/\[[^\]]*\]\([^)]*\)/g) || []).length,
            images: (markdown.match(/!\[[^\]]*\]\([^)]*\)/g) || []).length,
            lists: (markdown.match(/^[\s]*[-*+]\s/gm) || []).length,
            tables: (markdown.match(/\|.*\|/g) || []).length
        };
    }
}

/**
 * Creates a new Markdown converter instance
 * @param {Object} options - Configuration options
 * @returns {MarkdownConverter} - New converter instance
 */
export function createMarkdownConverter(options = {}) {
    return new MarkdownConverter(options);
}

/**
 * Convenience function to convert HTML to Markdown
 * @param {string} htmlContent - HTML content to convert
 * @param {Object} options - Conversion options
 * @returns {ConversionResult} - Conversion result
 */
export function convertToMarkdown(htmlContent, options = {}) {
    const converter = createMarkdownConverter(options);
    return converter.convert(htmlContent, options);
}