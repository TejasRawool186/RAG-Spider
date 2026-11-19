/**
 * Error Handling and Retry Mechanisms for RAG Spider
 * 
 * This module provides comprehensive error handling, retry policies,
 * and recovery mechanisms for robust web crawling operations.
 * 
 * Requirements: 4.1, 4.2, 4.4
 */

/**
 * Error categories for different types of failures
 */
export const ErrorCategory = {
    NETWORK: 'network',
    PARSING: 'parsing',
    EXTRACTION: 'extraction',
    PROCESSING: 'processing',
    VALIDATION: 'validation',
    TIMEOUT: 'timeout',
    RATE_LIMIT: 'rate_limit',
    MEMORY: 'memory',
    UNKNOWN: 'unknown'
};

/**
 * Error severity levels
 */
export const ErrorSeverity = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical'
};

/**
 * Enhanced error class with categorization and context
 */
export class CrawlerError extends Error {
    constructor(message, category = ErrorCategory.UNKNOWN, severity = ErrorSeverity.MEDIUM, context = {}) {
        super(message);
        this.name = 'CrawlerError';
        this.category = category;
        this.severity = severity;
        this.context = context;
        this.timestamp = new Date().toISOString();
        this.retryable = this.isRetryable();
    }
    
    /**
     * Determines if this error is retryable based on category
     */
    isRetryable() {
        const retryableCategories = [
            ErrorCategory.NETWORK,
            ErrorCategory.TIMEOUT,
            ErrorCategory.RATE_LIMIT
        ];
        return retryableCategories.includes(this.category);
    }
    
    /**
     * Creates a CrawlerError from a standard Error
     */
    static fromError(error, category = ErrorCategory.UNKNOWN, context = {}) {
        const severity = category === ErrorCategory.CRITICAL ? ErrorSeverity.CRITICAL : ErrorSeverity.MEDIUM;
        const crawlerError = new CrawlerError(error.message, category, severity, context);
        crawlerError.stack = error.stack;
        return crawlerError;
    }
}

/**
 * Retry policy configuration and execution
 */
export class RetryPolicy {
    constructor(config = {}) {
        this.config = { 
            maxRetries: 3, 
            baseDelay: 1000, 
            maxDelay: 30000,
            backoffMultiplier: 2,
            strategy: 'exponential_backoff',
            jitter: false,
            ...config 
        };
        this.attempts = new Map();
    }
    
    calculateDelay(attempt) {
        const multiplier = this.config.backoffMultiplier || 2;
        const delay = this.config.baseDelay * Math.pow(multiplier, attempt - 1);
        const max = this.config.maxDelay || 30000;
        return Math.min(max, delay);
    }
    
    shouldRetry(error, operationId) {
        const attempt = this.attempts.get(operationId) || 0;
        return attempt < this.config.maxRetries && 
               error instanceof CrawlerError && 
               error.isRetryable();
    }
    
    async executeWithRetry(operation, operationId) {
        let attempts = 0;
        while (true) {
            try {
                const result = await operation();
                this.attempts.delete(operationId);
                return result;
            } catch (error) {
                if (!this.shouldRetry(error, operationId)) {
                    this.attempts.delete(operationId);
                    throw error;
                }
                attempts++;
                this.attempts.set(operationId, attempts);
                
                const delay = this.calculateDelay(attempts);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
}

/**
 * Comprehensive error handler
 */
export class ErrorHandler {
    constructor(config = {}) {
        this.retryPolicy = new RetryPolicy(config.retry);
        this.errorStats = {
            totalErrors: 0,
            errorsByCategory: new Map(),
            errorsBySeverity: new Map(),
            recoveredErrors: 0,
            unrecoverableErrors: 0
        };
    }
    
    async executeWithErrorHandling(operation, operationId, context = {}) {
        try {
            return await this.retryPolicy.executeWithRetry(operation, operationId);
        } catch (error) {
            this.updateErrorStats(error);
            console.warn(`Error in ${operationId}:`, error.message);
            throw error;
        }
    }
    
    updateErrorStats(error) {
        this.errorStats.totalErrors++;
        if (error instanceof CrawlerError) {
            const categoryCount = this.errorStats.errorsByCategory.get(error.category) || 0;
            this.errorStats.errorsByCategory.set(error.category, categoryCount + 1);
            const severityCount = this.errorStats.errorsBySeverity.get(error.severity) || 0;
            this.errorStats.errorsBySeverity.set(error.severity, severityCount + 1);
        }
    }
    
    getErrorStats() {
        return {
            ...this.errorStats,
            errorsByCategory: Object.fromEntries(this.errorStats.errorsByCategory),
            errorsBySeverity: Object.fromEntries(this.errorStats.errorsBySeverity),
            successRate: 100
        };
    }
    
    resetStats() {
        this.errorStats = {
            totalErrors: 0,
            errorsByCategory: new Map(),
            errorsBySeverity: new Map(),
            recoveredErrors: 0,
            unrecoverableErrors: 0
        };
    }
}

/**
 * Creates a new error handler instance
 */
export function createErrorHandler(config = {}) {
    return new ErrorHandler(config);
}

/**
 * Utility function to categorize common errors
 */
export function categorizeError(error) {
    const message = (error.message || '').toLowerCase();
    
    if (message.includes('network') || message.includes('econnreset') || message.includes('enotfound') || message.includes('socket hang up')) {
        return ErrorCategory.NETWORK;
    }
    
    if (message.includes('timeout') || message.includes('etimedout') || message.includes('timed out')) {
        return ErrorCategory.TIMEOUT;
    }
    
    if (message.includes('rate limit') || message.includes('too many requests') || message.includes('429')) {
        return ErrorCategory.RATE_LIMIT;
    }
    
    return ErrorCategory.UNKNOWN;
}