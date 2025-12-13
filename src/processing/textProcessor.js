/**
 * Text Processing Service for RAG Spider
 * 
 * This module provides a comprehensive text processing pipeline that
 * integrates chunking, metadata enrichment, and token estimation
 * for complete RAG-ready content preparation.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { createTextChunker } from './textChunker.js';
import { createMetadataEnricher } from './metadataEnricher.js';
import { createTokenEstimator } from './tokenEstimator.js';

/**
 * Error class for text processing failures
 */
export class TextProcessingError extends Error {
    constructor(message, stage = 'unknown', originalError = null) {
        super(message);
        this.name = 'TextProcessingError';
        this.stage = stage;
        this.originalError = originalError;
    }
}

/**
 * Complete text processing result
 */
export class TextProcessingResult {
    constructor({
        success = false,
        processedChunks = [],
        originalText = '',
        originalLength = 0,
        totalChunks = 0,
        totalTokens = 0,
        estimatedCost = 0,
        processingTime = 0,
        stats = {},
        warnings = [],
        errors = []
    } = {}) {
        this.success = success;
        this.processedChunks = processedChunks;
        this.originalText = originalText.substring(0, 200) + (originalText.length > 200 ? '...' : '');
        this.originalLength = originalLength;
        this.totalChunks = totalChunks;
        this.totalTokens = totalTokens;
        this.estimatedCost = estimatedCost;
        this.processingTime = processingTime;
        this.stats = stats;
        this.warnings = warnings;
        this.errors = errors;
        this.processedAt = new Date().toISOString();
    }
}

/**
 * Processed chunk with complete metadata and token information
 */
export class ProcessedChunk {
    constructor({
        content = '',
        index = 0,
        metadata = {},
        tokenEstimation = {},
        id = ''
    } = {}) {
        this.content = content;
        this.index = index;
        this.metadata = metadata;
        this.tokenEstimation = tokenEstimation;
        this.id = id;
        this.length = content.length;
        this.processedAt = new Date().toISOString();
    }
}

/**
 * Comprehensive text processing service
 */
export class TextProcessor {
    constructor(options = {}) {
        this.options = {
            // Chunking options
            chunkSize: options.chunkSize || 1000,
            chunkOverlap: options.chunkOverlap || 100,
            
            // Metadata options
            includeContentAnalysis: options.includeContentAnalysis !== false,
            includeProcessingStats: options.includeProcessingStats !== false,
            
            // Token estimation options
            tokenModel: options.tokenModel || 'gpt-3.5-turbo',
            estimateCosts: options.estimateCosts !== false,
            
            // Processing options
            enableParallelProcessing: options.enableParallelProcessing !== false,
            maxConcurrency: options.maxConcurrency || 5,
            
            ...options
        };
        
        // Initialize components
        this.textChunker = createTextChunker({
            chunkSize: this.options.chunkSize,
            chunkOverlap: this.options.chunkOverlap,
            separators: this.options.separators
        });
        
        this.metadataEnricher = createMetadataEnricher({
            includeContentAnalysis: this.options.includeContentAnalysis,
            includeProcessingStats: this.options.includeProcessingStats,
            customEnrichers: this.options.customEnrichers
        });
        
        this.tokenEstimator = createTokenEstimator({
            model: this.options.tokenModel,
            cacheResults: this.options.cacheTokenEstimation !== false
        });
    }
    
    /**
     * Processes text through the complete pipeline
     * @param {string} text - Text content to process
     * @param {Object} sourceInfo - Source information (URL, title, etc.)
     * @param {Object} customMetadata - Custom metadata to attach
     * @returns {Promise<TextProcessingResult>} - Complete processing result
     */
    async process(text, sourceInfo = {}, customMetadata = {}) {
        const startTime = Date.now();
        const warnings = [];
        const errors = [];
        
        try {
            if (typeof text !== 'string' || text.trim().length === 0) {
                throw new TextProcessingError('Text content must be a non-empty string', 'validation');
            }
            
            console.log(`🔄 Starting text processing pipeline for ${text.length} characters`);
            
            // Stage 1: Text Chunking
            console.log(`📄 Stage 1: Chunking text content`);
            const chunkingResult = await this.textChunker.chunk(text, {
                sourceUrl: sourceInfo.url,
                processingOptions: this.options
            });
            
            if (!chunkingResult.success) {
                throw new TextProcessingError('Text chunking failed', 'chunking');
            }
            
            warnings.push(...chunkingResult.warnings);
            
            // Stage 2: Metadata Enrichment
            console.log(`🔍 Stage 2: Enriching ${chunkingResult.chunks.length} chunks with metadata`);
            const enrichmentResult = await this.metadataEnricher.enrich(
                chunkingResult.chunks,
                sourceInfo,
                {
                    method: 'langchain-recursive',
                    chunkingOptions: this.options,
                    processingTime: Date.now() - startTime
                },
                customMetadata
            );
            
            if (!enrichmentResult.success) {
                throw new TextProcessingError('Metadata enrichment failed', 'enrichment');
            }
            
            warnings.push(...enrichmentResult.warnings);
            
            // Stage 3: Token Estimation
            console.log(`🔢 Stage 3: Estimating tokens for ${enrichmentResult.enrichedChunks.length} chunks`);
            const tokenResult = await this.tokenEstimator.estimateTokensForChunks(
                enrichmentResult.enrichedChunks,
                { model: this.options.tokenModel }
            );
            
            if (!tokenResult.success) {
                throw new TextProcessingError('Token estimation failed', 'tokenization');
            }
            
            warnings.push(...tokenResult.warnings);
            
            // Stage 4: Combine Results
            console.log(`🔗 Stage 4: Combining results into final processed chunks`);
            const processedChunks = this.combineResults(
                enrichmentResult.enrichedChunks,
                tokenResult.results
            );
            
            // Calculate final statistics
            const processingTime = Date.now() - startTime;
            const stats = this.calculateProcessingStats(
                chunkingResult,
                enrichmentResult,
                tokenResult,
                processingTime
            );
            
            console.log(`✅ Text processing completed: ${processedChunks.length} chunks, ${tokenResult.totalTokens} tokens, ${processingTime}ms`);
            
            return new TextProcessingResult({
                success: true,
                processedChunks,
                originalText: text,
                originalLength: text.length,
                totalChunks: processedChunks.length,
                totalTokens: tokenResult.totalTokens,
                estimatedCost: tokenResult.estimatedTotalCost,
                processingTime,
                stats,
                warnings,
                errors
            });
            
        } catch (error) {
            const processingTime = Date.now() - startTime;
            
            errors.push({
                stage: error.stage || 'unknown',
                message: error.message,
                timestamp: new Date().toISOString()
            });
            
            console.error(`❌ Text processing failed at stage ${error.stage}:`, error.message);
            
            return new TextProcessingResult({
                success: false,
                originalText: text,
                originalLength: text.length,
                processingTime,
                warnings,
                errors
            });
        }
    }
    
    /**
     * Processes multiple texts in batch
     * @param {Array} texts - Array of texts to process
     * @param {Array} sourceInfos - Array of source information objects
     * @param {Object} customMetadata - Custom metadata to attach
     * @returns {Promise<Array<TextProcessingResult>>} - Array of processing results
     */
    async processBatch(texts, sourceInfos = [], customMetadata = {}) {
        if (!Array.isArray(texts)) {
            throw new TextProcessingError('Texts must be an array', 'validation');
        }
        
        console.log(`🔄 Starting batch text processing for ${texts.length} texts`);
        
        const results = [];
        const concurrency = Math.min(this.options.maxConcurrency, texts.length);
        
        if (this.options.enableParallelProcessing && texts.length > 1) {
            // Process in parallel with limited concurrency
            for (let i = 0; i < texts.length; i += concurrency) {
                const batch = texts.slice(i, i + concurrency);
                const batchSourceInfos = sourceInfos.slice(i, i + concurrency);
                
                const batchPromises = batch.map((text, index) => 
                    this.process(text, batchSourceInfos[index] || {}, customMetadata)
                );
                
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);
            }
        } else {
            // Process sequentially
            for (let i = 0; i < texts.length; i++) {
                const result = await this.process(texts[i], sourceInfos[i] || {}, customMetadata);
                results.push(result);
            }
        }
        
        console.log(`✅ Batch text processing completed: ${results.length} texts processed`);
        return results;
    }
    
    /**
     * Combines enriched chunks with token estimation results
     * @param {Array} enrichedChunks - Enriched chunks
     * @param {Array} tokenResults - Token estimation results
     * @returns {ProcessedChunk[]} - Combined processed chunks
     */
    combineResults(enrichedChunks, tokenResults) {
        const processedChunks = [];
        
        for (let i = 0; i < enrichedChunks.length; i++) {
            const enrichedChunk = enrichedChunks[i];
            const tokenResult = tokenResults[i] || {};
            
            const processedChunk = new ProcessedChunk({
                content: enrichedChunk.content,
                index: enrichedChunk.index,
                metadata: {
                    ...enrichedChunk.metadata,
                    tokens: {
                        count: tokenResult.tokenCount || 0,
                        model: tokenResult.model || this.options.tokenModel,
                        estimatedCost: tokenResult.estimatedCost || 0,
                        tokensPerCharacter: tokenResult.tokensPerCharacter || 0,
                        tokensPerWord: tokenResult.tokensPerWord || 0
                    }
                },
                tokenEstimation: tokenResult,
                id: enrichedChunk.id
            });
            
            processedChunks.push(processedChunk);
        }
        
        return processedChunks;
    }
    
    /**
     * Calculates comprehensive processing statistics
     * @param {Object} chunkingResult - Chunking result
     * @param {Object} enrichmentResult - Enrichment result
     * @param {Object} tokenResult - Token estimation result
     * @param {number} processingTime - Total processing time
     * @returns {Object} - Processing statistics
     */
    calculateProcessingStats(chunkingResult, enrichmentResult, tokenResult, processingTime) {
        return {
            chunking: {
                totalChunks: chunkingResult.totalChunks,
                averageChunkSize: chunkingResult.averageChunkSize,
                overlapRatio: chunkingResult.overlapRatio,
                ...chunkingResult.stats
            },
            enrichment: {
                enrichedChunks: enrichmentResult.enrichedChunkCount,
                averageMetadataSize: enrichmentResult.stats.averageMetadataSize,
                contentTypeDistribution: enrichmentResult.stats.contentTypeDistribution,
                ...enrichmentResult.stats
            },
            tokenization: {
                totalTokens: tokenResult.totalTokens,
                averageTokensPerChunk: tokenResult.averageTokensPerChunk,
                estimatedTotalCost: tokenResult.estimatedTotalCost,
                tokenDistribution: tokenResult.stats.tokenDistribution,
                ...tokenResult.stats
            },
            performance: {
                totalProcessingTime: processingTime,
                chunksPerSecond: chunkingResult.totalChunks / (processingTime / 1000),
                tokensPerSecond: tokenResult.totalTokens / (processingTime / 1000),
                averageTimePerChunk: processingTime / chunkingResult.totalChunks
            }
        };
    }
    
    /**
     * Validates processing configuration
     * @returns {Object} - Validation result
     */
    validateConfiguration() {
        const result = {
            valid: true,
            errors: [],
            warnings: []
        };
        
        if (this.options.chunkSize <= 0) {
            result.valid = false;
            result.errors.push('Chunk size must be greater than 0');
        }
        
        if (this.options.chunkOverlap >= this.options.chunkSize) {
            result.valid = false;
            result.errors.push('Chunk overlap must be less than chunk size');
        }
        
        if (this.options.maxConcurrency <= 0) {
            result.warnings.push('Max concurrency should be greater than 0');
        }
        
        return result;
    }
    
    /**
     * Gets processor configuration and component information
     * @returns {Object} - Processor information
     */
    getInfo() {
        return {
            options: { ...this.options },
            components: {
                textChunker: this.textChunker.getInfo(),
                metadataEnricher: 'MetadataEnricher configured',
                tokenEstimator: this.tokenEstimator.getInfo()
            },
            validation: this.validateConfiguration()
        };
    }
}

/**
 * Creates a new text processor instance
 * @param {Object} options - Configuration options
 * @returns {TextProcessor} - New processor instance
 */
export function createTextProcessor(options = {}) {
    return new TextProcessor(options);
}

/**
 * Convenience function to process text with default settings
 * @param {string} text - Text to process
 * @param {Object} sourceInfo - Source information
 * @param {Object} customMetadata - Custom metadata
 * @param {Object} options - Processing options
 * @returns {Promise<TextProcessingResult>} - Processing result
 */
export async function processText(text, sourceInfo = {}, customMetadata = {}, options = {}) {
    const processor = createTextProcessor(options);
    return await processor.process(text, sourceInfo, customMetadata);
}