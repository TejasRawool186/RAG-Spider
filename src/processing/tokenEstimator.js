/**
 * Token Estimation Service for RAG Spider
 * 
 * This module provides token count estimation functionality using
 * gpt-tokenizer to help with cost planning and chunk size optimization
 * for vector database ingestion and LLM processing.
 * 
 * Requirements: 2.5
 */

import { encode, decode } from 'gpt-tokenizer';

/**
 * Default configuration for token estimation
 */
const DEFAULT_TOKEN_OPTIONS = {
    model: 'gpt-3.5-turbo', // Default model for tokenization
    includeSpecialTokens: false,
    cacheResults: true,
    maxCacheSize: 1000
};

/**
 * Error class for token estimation failures
 */
export class TokenEstimationError extends Error {
    constructor(message, textLength = 0, originalError = null) {
        super(message);
        this.name = 'TokenEstimationError';
        this.textLength = textLength;
        this.originalError = originalError;
    }
}

/**
 * Token estimation result for a single text
 */
export class TokenEstimationResult {
    constructor({
        text = '',
        tokenCount = 0,
        characterCount = 0,
        wordCount = 0,
        tokensPerCharacter = 0,
        tokensPerWord = 0,
        model = 'unknown',
        estimatedCost = 0,
        warnings = []
    } = {}) {
        this.text = text.substring(0, 100) + (text.length > 100 ? '...' : ''); // Store preview
        this.tokenCount = tokenCount;
        this.characterCount = characterCount;
        this.wordCount = wordCount;
        this.tokensPerCharacter = tokensPerCharacter;
        this.tokensPerWord = tokensPerWord;
        this.model = model;
        this.estimatedCost = estimatedCost;
        this.warnings = warnings;
        this.estimatedAt = new Date().toISOString();
    }
}

/**
 * Batch token estimation result
 */
export class BatchTokenEstimationResult {
    constructor({
        success = false,
        results = [],
        totalTokens = 0,
        totalCharacters = 0,
        totalWords = 0,
        averageTokensPerChunk = 0,
        estimatedTotalCost = 0,
        stats = {},
        warnings = []
    } = {}) {
        this.success = success;
        this.results = results;
        this.totalTokens = totalTokens;
        this.totalCharacters = totalCharacters;
        this.totalWords = totalWords;
        this.averageTokensPerChunk = averageTokensPerChunk;
        this.estimatedTotalCost = estimatedTotalCost;
        this.stats = stats;
        this.warnings = warnings;
    }
}

/**
 * Token estimation service using gpt-tokenizer
 */
export class TokenEstimator {
    constructor(options = {}) {
        this.options = {
            ...DEFAULT_TOKEN_OPTIONS,
            ...options
        };
        
        // Token cache for performance
        this.cache = this.options.cacheResults ? new Map() : null;
        
        // Cost per token for different models (in USD per 1K tokens)
        this.costPerToken = {
            'gpt-3.5-turbo': 0.0015, // Input tokens
            'gpt-4': 0.03,
            'gpt-4-turbo': 0.01,
            'text-embedding-ada-002': 0.0001,
            'text-embedding-3-small': 0.00002,
            'text-embedding-3-large': 0.00013,
            ...options.costPerToken
        };
    }
    
    /**
     * Estimates token count for a single text
     * @param {string} text - Text to estimate tokens for
     * @param {Object} options - Estimation options
     * @returns {Promise<TokenEstimationResult>} - Token estimation result
     */
    async estimateTokens(text, options = {}) {
        if (typeof text !== 'string') {
            throw new TokenEstimationError('Text must be a string');
        }
        
        if (text.length === 0) {
            return new TokenEstimationResult({
                text: '',
                tokenCount: 0,
                characterCount: 0,
                wordCount: 0,
                model: this.options.model,
                warnings: ['Empty text provided']
            });
        }
        
        const warnings = [];
        const model = options.model || this.options.model;
        
        try {
            // Check cache first
            const cacheKey = this.generateCacheKey(text, model);
            if (this.cache && this.cache.has(cacheKey)) {
                const cached = this.cache.get(cacheKey);
                return new TokenEstimationResult({
                    ...cached,
                    warnings: [...cached.warnings, 'Result from cache']
                });
            }
            
            // Tokenize the text
            const tokens = encode(text);
            const tokenCount = tokens.length;
            
            // Calculate basic metrics
            const characterCount = text.length;
            const wordCount = this.countWords(text);
            const tokensPerCharacter = characterCount > 0 ? tokenCount / characterCount : 0;
            const tokensPerWord = wordCount > 0 ? tokenCount / wordCount : 0;
            
            // Estimate cost
            const costPerThousand = this.costPerToken[model] || 0;
            const estimatedCost = (tokenCount / 1000) * costPerThousand;
            
            // Check for potential issues
            if (tokenCount > 8000) {
                warnings.push(`High token count (${tokenCount}) may exceed model limits`);
            }
            
            if (tokensPerCharacter > 0.5) {
                warnings.push('High tokens-per-character ratio suggests complex text');
            }
            
            const result = new TokenEstimationResult({
                text,
                tokenCount,
                characterCount,
                wordCount,
                tokensPerCharacter: Math.round(tokensPerCharacter * 1000) / 1000,
                tokensPerWord: Math.round(tokensPerWord * 100) / 100,
                model,
                estimatedCost: Math.round(estimatedCost * 100000) / 100000, // Round to 5 decimal places
                warnings
            });
            
            // Cache the result
            if (this.cache) {
                this.addToCache(cacheKey, result);
            }
            
            return result;
            
        } catch (error) {
            throw new TokenEstimationError(
                `Failed to estimate tokens: ${error.message}`,
                text.length,
                error
            );
        }
    }
    
    /**
     * Estimates tokens for multiple texts (batch processing)
     * @param {Array} texts - Array of texts to estimate
     * @param {Object} options - Estimation options
     * @returns {Promise<BatchTokenEstimationResult>} - Batch estimation result
     */
    async estimateTokensBatch(texts, options = {}) {
        if (!Array.isArray(texts)) {
            throw new TokenEstimationError('Texts must be an array');
        }
        
        if (texts.length === 0) {
            return new BatchTokenEstimationResult({
                success: true,
                results: [],
                warnings: ['No texts provided for estimation']
            });
        }
        
        const warnings = [];
        const results = [];
        
        try {
            console.log(`🔢 Estimating tokens for ${texts.length} texts`);
            
            // Process each text
            for (let i = 0; i < texts.length; i++) {
                try {
                    let text = '';
                    if (typeof texts[i] === 'string') {
                        text = texts[i];
                    } else if (texts[i] && typeof texts[i] === 'object' && texts[i].content) {
                        text = texts[i].content;
                    } else {
                        throw new Error('Invalid text format');
                    }
                    
                    const result = await this.estimateTokens(text, options);
                    results.push(result);
                } catch (error) {
                    console.warn(`Warning: Failed to estimate tokens for text ${i}:`, error.message);
                    warnings.push(`Failed to estimate tokens for text ${i}: ${error.message}`);
                    
                    // Add placeholder result
                    results.push(new TokenEstimationResult({
                        text: String(texts[i] || ''),
                        tokenCount: 0,
                        warnings: [error.message]
                    }));
                }
            }
            
            // Calculate batch statistics
            const stats = this.calculateBatchStats(results);
            
            console.log(`✅ Token estimation completed: ${stats.totalTokens} total tokens`);
            
            return new BatchTokenEstimationResult({
                success: true,
                results,
                totalTokens: stats.totalTokens,
                totalCharacters: stats.totalCharacters,
                totalWords: stats.totalWords,
                averageTokensPerChunk: stats.averageTokensPerChunk,
                estimatedTotalCost: stats.estimatedTotalCost,
                stats,
                warnings
            });
            
        } catch (error) {
            console.error(`❌ Batch token estimation failed:`, error.message);
            throw new TokenEstimationError(
                `Failed to estimate tokens for batch: ${error.message}`,
                0,
                error
            );
        }
    }
    
    /**
     * Estimates tokens for chunks with metadata
     * @param {Array} chunks - Array of chunks to estimate
     * @param {Object} options - Estimation options
     * @returns {Promise<BatchTokenEstimationResult>} - Estimation result with enhanced metadata
     */
    async estimateTokensForChunks(chunks, options = {}) {
        if (!Array.isArray(chunks)) {
            throw new TokenEstimationError('Chunks must be an array');
        }
        
        const texts = chunks.map(chunk => {
            if (typeof chunk === 'string') return chunk;
            return chunk.content || chunk.text || '';
        });
        
        const batchResult = await this.estimateTokensBatch(texts, options);
        
        // Enhance results with chunk metadata
        batchResult.results = batchResult.results.map((result, index) => {
            const chunk = chunks[index];
            if (typeof chunk === 'object' && chunk.metadata) {
                result.chunkMetadata = {
                    index: chunk.index || index,
                    sourceUrl: chunk.metadata.source?.url || '',
                    chunkSize: chunk.content?.length || 0,
                    hasOverlap: chunk.metadata.hasOverlapStart || chunk.metadata.hasOverlapEnd || false
                };
            }
            return result;
        });
        
        return batchResult;
    }
    
    /**
     * Counts words in text
     * @param {string} text - Text to count words in
     * @returns {number} - Word count
     */
    countWords(text) {
        return text
            .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
            .split(/\s+/)
            .filter(word => word.length > 0)
            .length;
    }
    
    /**
     * Generates cache key for text and model
     * @param {string} text - Text content
     * @param {string} model - Model name
     * @returns {string} - Cache key
     */
    generateCacheKey(text, model) {
        // Use first and last 50 characters plus length and model for cache key
        const prefix = text.substring(0, 50);
        const suffix = text.length > 50 ? text.substring(text.length - 50) : '';
        return `${model}:${text.length}:${this.hashString(prefix + suffix)}`;
    }
    
    /**
     * Simple string hash function
     * @param {string} str - String to hash
     * @returns {string} - Hash string
     */
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }
    
    /**
     * Adds result to cache with size management
     * @param {string} key - Cache key
     * @param {TokenEstimationResult} result - Result to cache
     */
    addToCache(key, result) {
        if (!this.cache) return;
        
        // Remove oldest entries if cache is full
        if (this.cache.size >= this.options.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        // Store simplified version to save memory
        this.cache.set(key, {
            tokenCount: result.tokenCount,
            characterCount: result.characterCount,
            wordCount: result.wordCount,
            tokensPerCharacter: result.tokensPerCharacter,
            tokensPerWord: result.tokensPerWord,
            model: result.model,
            estimatedCost: result.estimatedCost,
            warnings: result.warnings
        });
    }
    
    /**
     * Calculates statistics for batch results
     * @param {TokenEstimationResult[]} results - Array of estimation results
     * @returns {Object} - Batch statistics
     */
    calculateBatchStats(results) {
        if (results.length === 0) {
            return {
                totalTokens: 0,
                totalCharacters: 0,
                totalWords: 0,
                averageTokensPerChunk: 0,
                estimatedTotalCost: 0,
                minTokens: 0,
                maxTokens: 0,
                tokenDistribution: {}
            };
        }
        
        const totalTokens = results.reduce((sum, r) => sum + r.tokenCount, 0);
        const totalCharacters = results.reduce((sum, r) => sum + r.characterCount, 0);
        const totalWords = results.reduce((sum, r) => sum + r.wordCount, 0);
        const estimatedTotalCost = results.reduce((sum, r) => sum + r.estimatedCost, 0);
        
        const tokenCounts = results.map(r => r.tokenCount);
        const minTokens = Math.min(...tokenCounts);
        const maxTokens = Math.max(...tokenCounts);
        const averageTokensPerChunk = Math.round(totalTokens / results.length);
        
        // Token distribution analysis
        const tokenDistribution = this.analyzeTokenDistribution(tokenCounts);
        
        return {
            totalTokens,
            totalCharacters,
            totalWords,
            averageTokensPerChunk,
            estimatedTotalCost: Math.round(estimatedTotalCost * 100000) / 100000,
            minTokens,
            maxTokens,
            tokenDistribution,
            averageTokensPerCharacter: totalCharacters > 0 ? totalTokens / totalCharacters : 0,
            averageTokensPerWord: totalWords > 0 ? totalTokens / totalWords : 0
        };
    }
    
    /**
     * Analyzes token count distribution
     * @param {number[]} tokenCounts - Array of token counts
     * @returns {Object} - Distribution analysis
     */
    analyzeTokenDistribution(tokenCounts) {
        const sorted = [...tokenCounts].sort((a, b) => a - b);
        const length = sorted.length;
        
        return {
            median: length % 2 === 0 
                ? (sorted[length / 2 - 1] + sorted[length / 2]) / 2
                : sorted[Math.floor(length / 2)],
            q1: sorted[Math.floor(length * 0.25)],
            q3: sorted[Math.floor(length * 0.75)],
            standardDeviation: this.calculateStandardDeviation(tokenCounts),
            variance: this.calculateVariance(tokenCounts)
        };
    }
    
    /**
     * Calculates standard deviation
     * @param {number[]} values - Array of values
     * @returns {number} - Standard deviation
     */
    calculateStandardDeviation(values) {
        const variance = this.calculateVariance(values);
        return Math.sqrt(variance);
    }
    
    /**
     * Calculates variance
     * @param {number[]} values - Array of values
     * @returns {number} - Variance
     */
    calculateVariance(values) {
        if (values.length === 0) return 0;
        
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
        return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    }
    
    /**
     * Clears the token estimation cache
     */
    clearCache() {
        if (this.cache) {
            this.cache.clear();
        }
    }
    
    /**
     * Gets cache statistics
     * @returns {Object} - Cache statistics
     */
    getCacheStats() {
        return {
            enabled: !!this.cache,
            size: this.cache ? this.cache.size : 0,
            maxSize: this.options.maxCacheSize,
            hitRate: this.cacheHits / Math.max(this.cacheRequests, 1) || 0
        };
    }
    
    /**
     * Gets estimator configuration and statistics
     * @returns {Object} - Configuration and stats
     */
    getInfo() {
        return {
            options: { ...this.options },
            supportedModels: Object.keys(this.costPerToken),
            cache: this.getCacheStats()
        };
    }
}

/**
 * Creates a new token estimator instance
 * @param {Object} options - Configuration options
 * @returns {TokenEstimator} - New estimator instance
 */
export function createTokenEstimator(options = {}) {
    return new TokenEstimator(options);
}

/**
 * Convenience function to estimate tokens for a single text
 * @param {string} text - Text to estimate
 * @param {Object} options - Estimation options
 * @returns {Promise<TokenEstimationResult>} - Estimation result
 */
export async function estimateTokens(text, options = {}) {
    const estimator = createTokenEstimator(options);
    return await estimator.estimateTokens(text, options);
}

/**
 * Convenience function to estimate tokens for multiple texts
 * @param {Array} texts - Texts to estimate
 * @param {Object} options - Estimation options
 * @returns {Promise<BatchTokenEstimationResult>} - Batch estimation result
 */
export async function estimateTokensBatch(texts, options = {}) {
    const estimator = createTokenEstimator(options);
    return await estimator.estimateTokensBatch(texts, options);
}