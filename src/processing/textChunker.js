/**
 * Text Chunking Service for RAG Spider
 * 
 * This module provides text chunking functionality using LangChain's
 * RecursiveCharacterTextSplitter to split large Markdown content into
 * optimal-sized segments with configurable overlap for vector database ingestion.
 * 
 * Requirements: 2.1, 2.2, 2.3
 */

import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

/**
 * Default configuration for text chunking
 */
const DEFAULT_CHUNKING_OPTIONS = {
    chunkSize: 1000,
    chunkOverlap: 100,
    separators: ['\n\n', '\n', ' ', ''],
    keepSeparator: false,
    lengthFunction: (text) => text.length
};

/**
 * Error class for text chunking failures
 */
export class TextChunkingError extends Error {
    constructor(message, textLength = 0, originalError = null) {
        super(message);
        this.name = 'TextChunkingError';
        this.textLength = textLength;
        this.originalError = originalError;
    }
}

/**
 * Text chunk with metadata
 */
export class TextChunk {
    constructor({
        content = '',
        index = 0,
        startOffset = 0,
        endOffset = 0,
        overlapStart = 0,
        overlapEnd = 0,
        metadata = {}
    } = {}) {
        this.content = content;
        this.index = index;
        this.startOffset = startOffset;
        this.endOffset = endOffset;
        this.overlapStart = overlapStart;
        this.overlapEnd = overlapEnd;
        this.metadata = metadata;
        this.length = content.length;
        this.createdAt = new Date().toISOString();
    }
}

/**
 * Chunking result with statistics
 */
export class ChunkingResult {
    constructor({
        success = false,
        chunks = [],
        originalLength = 0,
        totalChunks = 0,
        averageChunkSize = 0,
        overlapRatio = 0,
        stats = {},
        warnings = []
    } = {}) {
        this.success = success;
        this.chunks = chunks;
        this.originalLength = originalLength;
        this.totalChunks = totalChunks;
        this.averageChunkSize = averageChunkSize;
        this.overlapRatio = overlapRatio;
        this.stats = stats;
        this.warnings = warnings;
    }
}

/**
 * Text chunking service using LangChain's RecursiveCharacterTextSplitter
 */
export class TextChunker {
    constructor(options = {}) {
        this.options = {
            ...DEFAULT_CHUNKING_OPTIONS,
            ...options
        };
        
        // Validate options
        this.validateOptions();
        
        // Create LangChain text splitter
        this.splitter = new RecursiveCharacterTextSplitter({
            chunkSize: this.options.chunkSize,
            chunkOverlap: this.options.chunkOverlap,
            separators: this.options.separators,
            keepSeparator: this.options.keepSeparator,
            lengthFunction: this.options.lengthFunction
        });
    }
    
    /**
     * Validates chunking options
     */
    validateOptions() {
        if (this.options.chunkSize <= 0) {
            throw new TextChunkingError('Chunk size must be greater than 0');
        }
        
        if (this.options.chunkOverlap < 0) {
            throw new TextChunkingError('Chunk overlap cannot be negative');
        }
        
        if (this.options.chunkOverlap >= this.options.chunkSize) {
            throw new TextChunkingError('Chunk overlap must be less than chunk size');
        }
        
        if (!Array.isArray(this.options.separators) || this.options.separators.length === 0) {
            throw new TextChunkingError('Separators must be a non-empty array');
        }
    }
    
    /**
     * Chunks text content into optimal-sized segments
     * @param {string} text - Text content to chunk
     * @param {Object} metadata - Additional metadata to attach to chunks
     * @returns {Promise<ChunkingResult>} - Chunking result
     */
    async chunk(text, metadata = {}) {
        if (typeof text !== 'string') {
            throw new TextChunkingError('Text content must be a string');
        }
        
        if (text.trim().length === 0) {
            return new ChunkingResult({
                success: true,
                chunks: [],
                originalLength: 0,
                totalChunks: 0,
                averageChunkSize: 0,
                overlapRatio: 0,
                warnings: ['Input text is empty']
            });
        }
        
        const warnings = [];
        
        try {
            console.log(`📄 Chunking text content (${text.length} characters)`);
            
            // Pre-process text for better chunking
            const processedText = this.preprocessText(text, warnings);
            
            // Split text using LangChain splitter
            const rawChunks = await this.splitter.splitText(processedText);
            
            if (rawChunks.length === 0) {
                throw new TextChunkingError('Text splitter returned no chunks');
            }
            
            // Create enhanced chunks with metadata and overlap information
            const chunks = this.createEnhancedChunks(rawChunks, processedText, metadata);
            
            // Calculate statistics
            const stats = this.calculateStats(chunks, text.length);
            
            console.log(`✅ Text chunking completed: ${chunks.length} chunks created`);
            
            return new ChunkingResult({
                success: true,
                chunks,
                originalLength: text.length,
                totalChunks: chunks.length,
                averageChunkSize: stats.averageChunkSize,
                overlapRatio: stats.overlapRatio,
                stats,
                warnings
            });
            
        } catch (error) {
            console.error(`❌ Text chunking failed:`, error.message);
            throw new TextChunkingError(
                `Failed to chunk text: ${error.message}`,
                text.length,
                error
            );
        }
    }
    
    /**
     * Pre-processes text for better chunking results
     * @param {string} text - Original text
     * @param {Array} warnings - Array to collect warnings
     * @returns {string} - Processed text
     */
    preprocessText(text, warnings) {
        let processed = text;
        
        // Normalize line endings
        processed = processed.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        // Fix excessive whitespace but preserve intentional formatting
        processed = processed.replace(/[ \t]+/g, ' '); // Multiple spaces/tabs to single space
        processed = processed.replace(/\n{4,}/g, '\n\n\n'); // Limit consecutive newlines
        
        // Ensure proper spacing around headings for better splitting
        processed = processed.replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2');
        processed = processed.replace(/(#{1,6}[^\n]*)\n([^\n#])/g, '$1\n\n$2');
        
        // Ensure proper spacing around code blocks
        processed = processed.replace(/([^\n])\n```/g, '$1\n\n```');
        processed = processed.replace(/```\n([^\n])/g, '```\n\n$1');
        
        // Check for potential issues
        if (processed.length < text.length * 0.8) {
            warnings.push('Significant text reduction during preprocessing');
        }
        
        const codeBlockCount = (processed.match(/```/g) || []).length / 2;
        if (codeBlockCount > 10) {
            warnings.push(`Many code blocks detected (${codeBlockCount}) - chunking may split code`);
        }
        
        return processed;
    }
    
    /**
     * Creates enhanced chunks with metadata and overlap information
     * @param {string[]} rawChunks - Raw text chunks from splitter
     * @param {string} originalText - Original processed text
     * @param {Object} baseMetadata - Base metadata to attach
     * @returns {TextChunk[]} - Enhanced chunks
     */
    createEnhancedChunks(rawChunks, originalText, baseMetadata) {
        const chunks = [];
        let currentOffset = 0;
        
        for (let i = 0; i < rawChunks.length; i++) {
            const chunkContent = rawChunks[i];
            
            // Find the actual position of this chunk in the original text
            const chunkStart = originalText.indexOf(chunkContent, currentOffset);
            const chunkEnd = chunkStart >= 0 ? chunkStart + chunkContent.length : currentOffset + chunkContent.length;
            
            // Calculate overlap information more conservatively
            // For LangChain's RecursiveCharacterTextSplitter, overlap is built into the chunks
            // So we estimate based on the configured overlap, but don't exceed it
            const estimatedOverlapStart = i > 0 ? Math.min(this.options.chunkOverlap, Math.floor(chunkContent.length * 0.1)) : 0;
            const estimatedOverlapEnd = i < rawChunks.length - 1 ? Math.min(this.options.chunkOverlap, Math.floor(chunkContent.length * 0.1)) : 0;
            
            // Create enhanced chunk
            const chunk = new TextChunk({
                content: chunkContent,
                index: i,
                startOffset: chunkStart >= 0 ? chunkStart : currentOffset,
                endOffset: chunkEnd,
                overlapStart: estimatedOverlapStart,
                overlapEnd: estimatedOverlapEnd,
                metadata: {
                    ...baseMetadata,
                    chunkIndex: i,
                    totalChunks: rawChunks.length,
                    isFirst: i === 0,
                    isLast: i === rawChunks.length - 1,
                    hasOverlapStart: estimatedOverlapStart > 0,
                    hasOverlapEnd: estimatedOverlapEnd > 0,
                    chunkSize: this.options.chunkSize,
                    chunkOverlap: this.options.chunkOverlap
                }
            });
            
            chunks.push(chunk);
            currentOffset = chunkEnd;
        }
        
        return chunks;
    }
    
    /**
     * Calculates chunking statistics
     * @param {TextChunk[]} chunks - Array of chunks
     * @param {number} originalLength - Original text length
     * @returns {Object} - Statistics object
     */
    calculateStats(chunks, originalLength) {
        if (chunks.length === 0) {
            return {
                averageChunkSize: 0,
                overlapRatio: 0,
                totalOverlapChars: 0,
                minChunkSize: 0,
                maxChunkSize: 0,
                chunkSizeVariance: 0
            };
        }
        
        const chunkSizes = chunks.map(chunk => chunk.length);
        const totalChunkChars = chunkSizes.reduce((sum, size) => sum + size, 0);
        const totalOverlapChars = chunks.reduce((sum, chunk) => sum + chunk.overlapStart + chunk.overlapEnd, 0);
        
        const averageChunkSize = totalChunkChars / chunks.length;
        const overlapRatio = originalLength > 0 ? totalOverlapChars / originalLength : 0;
        
        const minChunkSize = Math.min(...chunkSizes);
        const maxChunkSize = Math.max(...chunkSizes);
        
        // Calculate variance
        const variance = chunkSizes.reduce((sum, size) => sum + Math.pow(size - averageChunkSize, 2), 0) / chunks.length;
        
        return {
            averageChunkSize: Math.round(averageChunkSize),
            overlapRatio: Math.round(overlapRatio * 1000) / 1000, // Round to 3 decimal places
            totalOverlapChars,
            minChunkSize,
            maxChunkSize,
            chunkSizeVariance: Math.round(variance),
            compressionRatio: originalLength > 0 ? totalChunkChars / originalLength : 1,
            chunksPerKB: originalLength > 0 ? (chunks.length / (originalLength / 1024)) : 0
        };
    }
    
    /**
     * Validates chunk consistency and overlap
     * @param {TextChunk[]} chunks - Array of chunks to validate
     * @returns {Object} - Validation result
     */
    validateChunks(chunks) {
        const result = {
            valid: true,
            errors: [],
            warnings: []
        };
        
        if (!Array.isArray(chunks) || chunks.length === 0) {
            result.valid = false;
            result.errors.push('Chunks array is empty or invalid');
            return result;
        }
        
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            
            // Check chunk structure
            if (!chunk.content || typeof chunk.content !== 'string') {
                result.valid = false;
                result.errors.push(`Chunk ${i} has invalid content`);
            }
            
            if (chunk.index !== i) {
                result.warnings.push(`Chunk ${i} has mismatched index: ${chunk.index}`);
            }
            
            // Check size constraints
            if (chunk.length > this.options.chunkSize * 1.5) {
                result.warnings.push(`Chunk ${i} exceeds expected size: ${chunk.length} chars`);
            }
            
            // Check overlap consistency
            if (i > 0) {
                const prevChunk = chunks[i - 1];
                const expectedOverlap = Math.min(this.options.chunkOverlap, prevChunk.length, chunk.length);
                
                if (chunk.overlapStart > expectedOverlap * 1.2) {
                    result.warnings.push(`Chunk ${i} has excessive overlap start: ${chunk.overlapStart}`);
                }
            }
        }
        
        return result;
    }
    
    /**
     * Gets chunker configuration and statistics
     * @returns {Object} - Configuration and stats
     */
    getInfo() {
        return {
            options: { ...this.options },
            splitterConfig: {
                chunkSize: this.splitter.chunkSize,
                chunkOverlap: this.splitter.chunkOverlap,
                separators: this.splitter.separators
            }
        };
    }
}

/**
 * Creates a new text chunker instance
 * @param {Object} options - Configuration options
 * @returns {TextChunker} - New chunker instance
 */
export function createTextChunker(options = {}) {
    return new TextChunker(options);
}

/**
 * Convenience function to chunk text with default settings
 * @param {string} text - Text to chunk
 * @param {Object} options - Chunking options
 * @param {Object} metadata - Metadata to attach
 * @returns {Promise<ChunkingResult>} - Chunking result
 */
export async function chunkText(text, options = {}, metadata = {}) {
    const chunker = createTextChunker(options);
    return await chunker.chunk(text, metadata);
}