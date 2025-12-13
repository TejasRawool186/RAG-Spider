/**
 * Input validation and configuration management for RAG Spider
 * 
 * This module validates all input parameters according to the defined schema
 * and provides clear error messages for validation failures.
 * 
 * Requirements: 5.1, 5.5
 */

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
    crawlDepth: 2,
    includeUrlGlobs: [],
    chunkSize: 1000,
    chunkOverlap: 100,
    maxRequestsPerCrawl: 1000,
    requestDelay: 1000,
    proxyConfiguration: {
        useApifyProxy: true
    }
};

/**
 * Validation error class for input validation failures
 */
export class ValidationError extends Error {
    constructor(message, field = null, value = null) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
        this.value = value;
    }
}

/**
 * Validates a URL string
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid URL
 */
function isValidUrl(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Validates start URLs array
 * @param {Array} startUrls - Array of URL objects or strings
 * @throws {ValidationError} - If validation fails
 */
function validateStartUrls(startUrls) {
    if (!Array.isArray(startUrls)) {
        throw new ValidationError('startUrls must be an array', 'startUrls', startUrls);
    }
    
    if (startUrls.length === 0) {
        throw new ValidationError('startUrls cannot be empty - at least one URL is required', 'startUrls', startUrls);
    }
    
    startUrls.forEach((urlItem, index) => {
        let url;
        
        // Handle both string URLs and Apify requestListSources format
        if (typeof urlItem === 'string') {
            url = urlItem;
        } else if (typeof urlItem === 'object' && urlItem.url) {
            url = urlItem.url;
        } else {
            throw new ValidationError(
                `startUrls[${index}] must be a string URL or object with 'url' property`,
                `startUrls[${index}]`,
                urlItem
            );
        }
        
        if (!isValidUrl(url)) {
            throw new ValidationError(
                `startUrls[${index}] contains invalid URL: ${url}`,
                `startUrls[${index}]`,
                url
            );
        }
    });
}

/**
 * Validates crawl depth parameter
 * @param {number} crawlDepth - Maximum crawl depth
 * @throws {ValidationError} - If validation fails
 */
function validateCrawlDepth(crawlDepth) {
    if (typeof crawlDepth !== 'number' || !Number.isInteger(crawlDepth)) {
        throw new ValidationError('crawlDepth must be an integer', 'crawlDepth', crawlDepth);
    }
    
    if (crawlDepth < 1 || crawlDepth > 10) {
        throw new ValidationError('crawlDepth must be between 1 and 10', 'crawlDepth', crawlDepth);
    }
}

/**
 * Validates URL glob patterns
 * @param {Array} includeUrlGlobs - Array of glob pattern strings
 * @throws {ValidationError} - If validation fails
 */
function validateIncludeUrlGlobs(includeUrlGlobs) {
    if (!Array.isArray(includeUrlGlobs)) {
        throw new ValidationError('includeUrlGlobs must be an array', 'includeUrlGlobs', includeUrlGlobs);
    }
    
    includeUrlGlobs.forEach((pattern, index) => {
        if (typeof pattern !== 'string') {
            throw new ValidationError(
                `includeUrlGlobs[${index}] must be a string`,
                `includeUrlGlobs[${index}]`,
                pattern
            );
        }
        
        if (pattern.trim().length === 0) {
            throw new ValidationError(
                `includeUrlGlobs[${index}] cannot be empty`,
                `includeUrlGlobs[${index}]`,
                pattern
            );
        }
        
        // Basic validation for glob patterns - should contain valid URL-like structure
        if (!pattern.includes('://') && !pattern.startsWith('*')) {
            throw new ValidationError(
                `includeUrlGlobs[${index}] should be a valid URL pattern (e.g., 'https://example.com/**')`,
                `includeUrlGlobs[${index}]`,
                pattern
            );
        }
    });
}

/**
 * Validates chunk size parameter
 * @param {number} chunkSize - Maximum characters per chunk
 * @throws {ValidationError} - If validation fails
 */
function validateChunkSize(chunkSize) {
    if (typeof chunkSize !== 'number' || !Number.isInteger(chunkSize)) {
        throw new ValidationError('chunkSize must be an integer', 'chunkSize', chunkSize);
    }
    
    if (chunkSize < 100 || chunkSize > 8000) {
        throw new ValidationError('chunkSize must be between 100 and 8000 characters', 'chunkSize', chunkSize);
    }
}

/**
 * Validates chunk overlap parameter
 * @param {number} chunkOverlap - Characters to overlap between chunks
 * @param {number} chunkSize - Chunk size for validation context
 * @throws {ValidationError} - If validation fails
 */
function validateChunkOverlap(chunkOverlap, chunkSize) {
    if (typeof chunkOverlap !== 'number' || !Number.isInteger(chunkOverlap)) {
        throw new ValidationError('chunkOverlap must be an integer', 'chunkOverlap', chunkOverlap);
    }
    
    if (chunkOverlap < 0 || chunkOverlap > 500) {
        throw new ValidationError('chunkOverlap must be between 0 and 500 characters', 'chunkOverlap', chunkOverlap);
    }
    
    if (chunkOverlap >= chunkSize) {
        throw new ValidationError(
            `chunkOverlap (${chunkOverlap}) must be less than chunkSize (${chunkSize})`,
            'chunkOverlap',
            chunkOverlap
        );
    }
}

/**
 * Validates max requests per crawl parameter
 * @param {number} maxRequestsPerCrawl - Maximum pages to process
 * @throws {ValidationError} - If validation fails
 */
function validateMaxRequestsPerCrawl(maxRequestsPerCrawl) {
    if (typeof maxRequestsPerCrawl !== 'number' || !Number.isInteger(maxRequestsPerCrawl)) {
        throw new ValidationError('maxRequestsPerCrawl must be an integer', 'maxRequestsPerCrawl', maxRequestsPerCrawl);
    }
    
    if (maxRequestsPerCrawl < 1 || maxRequestsPerCrawl > 10000) {
        throw new ValidationError('maxRequestsPerCrawl must be between 1 and 10000', 'maxRequestsPerCrawl', maxRequestsPerCrawl);
    }
}

/**
 * Validates request delay parameter
 * @param {number} requestDelay - Delay between requests in milliseconds
 * @throws {ValidationError} - If validation fails
 */
function validateRequestDelay(requestDelay) {
    if (typeof requestDelay !== 'number' || !Number.isInteger(requestDelay)) {
        throw new ValidationError('requestDelay must be an integer', 'requestDelay', requestDelay);
    }
    
    if (requestDelay < 0 || requestDelay > 10000) {
        throw new ValidationError('requestDelay must be between 0 and 10000 milliseconds', 'requestDelay', requestDelay);
    }
}

/**
 * Validates proxy configuration
 * @param {Object} proxyConfiguration - Proxy settings
 * @throws {ValidationError} - If validation fails
 */
function validateProxyConfiguration(proxyConfiguration) {
    if (proxyConfiguration !== null && typeof proxyConfiguration !== 'object') {
        throw new ValidationError('proxyConfiguration must be an object or null', 'proxyConfiguration', proxyConfiguration);
    }
    
    if (proxyConfiguration && typeof proxyConfiguration.useApifyProxy !== 'undefined') {
        if (typeof proxyConfiguration.useApifyProxy !== 'boolean') {
            throw new ValidationError(
                'proxyConfiguration.useApifyProxy must be a boolean',
                'proxyConfiguration.useApifyProxy',
                proxyConfiguration.useApifyProxy
            );
        }
    }
}

/**
 * Validates and normalizes input configuration
 * @param {Object} input - Raw input configuration
 * @returns {Object} - Validated and normalized configuration
 * @throws {ValidationError} - If validation fails
 */
export function validateInput(input) {
    if (!input || typeof input !== 'object') {
        throw new ValidationError('Input must be a valid object', 'input', input);
    }
    
    // Create normalized config with defaults
    const config = {
        ...DEFAULT_CONFIG,
        ...input
    };
    
    try {
        // Validate all required and optional parameters
        validateStartUrls(config.startUrls);
        validateCrawlDepth(config.crawlDepth);
        validateIncludeUrlGlobs(config.includeUrlGlobs);
        validateChunkSize(config.chunkSize);
        validateChunkOverlap(config.chunkOverlap, config.chunkSize);
        validateMaxRequestsPerCrawl(config.maxRequestsPerCrawl);
        validateRequestDelay(config.requestDelay);
        validateProxyConfiguration(config.proxyConfiguration);
        
        return config;
        
    } catch (error) {
        if (error instanceof ValidationError) {
            // Re-throw validation errors with enhanced context
            throw new ValidationError(
                `Configuration validation failed: ${error.message}`,
                error.field,
                error.value
            );
        }
        
        // Handle unexpected errors
        throw new ValidationError(
            `Unexpected validation error: ${error.message}`,
            'unknown',
            input
        );
    }
}

/**
 * Creates a detailed error report for validation failures
 * @param {ValidationError} error - Validation error
 * @returns {Object} - Structured error report
 */
export function createErrorReport(error) {
    return {
        error: true,
        message: error.message,
        field: error.field,
        value: error.value,
        timestamp: new Date().toISOString(),
        suggestions: generateSuggestions(error.field, error.value)
    };
}

/**
 * Generates helpful suggestions for common validation errors
 * @param {string} field - Field that failed validation
 * @param {any} value - Invalid value
 * @returns {Array} - Array of suggestion strings
 */
function generateSuggestions(field, value) {
    const suggestions = [];
    
    switch (field) {
        case 'startUrls':
            suggestions.push('Ensure startUrls is an array with at least one valid HTTP/HTTPS URL');
            suggestions.push('Example: [{"url": "https://docs.example.com"}]');
            break;
            
        case 'crawlDepth':
            suggestions.push('Set crawlDepth to an integer between 1 and 10');
            suggestions.push('Use 1 to crawl only start URLs, 2 to include one level of links');
            break;
            
        case 'includeUrlGlobs':
            suggestions.push('Use glob patterns to limit crawling scope');
            suggestions.push('Example: ["https://docs.example.com/**", "https://api.example.com/docs/**"]');
            break;
            
        case 'chunkSize':
            suggestions.push('Set chunkSize between 100 and 8000 characters');
            suggestions.push('Recommended: 1000 for most RAG applications');
            break;
            
        case 'chunkOverlap':
            suggestions.push('Set chunkOverlap between 0 and 500 characters');
            suggestions.push('Recommended: 10-20% of chunk size for good context preservation');
            break;
            
        default:
            suggestions.push('Check the input schema documentation for valid values');
    }
    
    return suggestions;
}