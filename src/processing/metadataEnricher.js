/**
 * Metadata Enrichment Service for RAG Spider
 * 
 * This module provides metadata enrichment functionality to attach
 * source URLs, processing information, and other contextual data
 * to text chunks for better RAG system performance.
 * 
 * Requirements: 2.3, 2.4
 */

/**
 * Error class for metadata enrichment failures
 */
export class MetadataEnrichmentError extends Error {
    constructor(message, chunkIndex = -1, originalError = null) {
        super(message);
        this.name = 'MetadataEnrichmentError';
        this.chunkIndex = chunkIndex;
        this.originalError = originalError;
    }
}

/**
 * Enriched chunk with comprehensive metadata
 */
export class EnrichedChunk {
    constructor({
        content = '',
        index = 0,
        metadata = {},
        sourceMetadata = {},
        processingMetadata = {},
        contentMetadata = {},
        customMetadata = {}
    } = {}) {
        this.content = content;
        this.index = index;
        this.metadata = {
            ...metadata,
            source: sourceMetadata,
            processing: processingMetadata,
            content: contentMetadata,
            custom: customMetadata,
            enrichedAt: new Date().toISOString()
        };
        this.id = this.generateChunkId();
    }
    
    /**
     * Generates a unique ID for the chunk
     * @returns {string} - Unique chunk ID
     */
    generateChunkId() {
        const sourceUrl = this.metadata.source?.url || 'unknown';
        const urlHash = this.hashString(sourceUrl);
        const contentHash = this.hashString(this.content.substring(0, 100));
        return `chunk_${urlHash}_${this.index}_${contentHash}`;
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
}

/**
 * Metadata enrichment result
 */
export class EnrichmentResult {
    constructor({
        success = false,
        enrichedChunks = [],
        originalChunkCount = 0,
        enrichedChunkCount = 0,
        stats = {},
        warnings = []
    } = {}) {
        this.success = success;
        this.enrichedChunks = enrichedChunks;
        this.originalChunkCount = originalChunkCount;
        this.enrichedChunkCount = enrichedChunkCount;
        this.stats = stats;
        this.warnings = warnings;
    }
}

/**
 * Metadata enrichment service
 */
export class MetadataEnricher {
    constructor(options = {}) {
        this.options = {
            includeContentAnalysis: options.includeContentAnalysis !== false,
            includeProcessingStats: options.includeProcessingStats !== false,
            includeSourceInfo: options.includeSourceInfo !== false,
            customEnrichers: options.customEnrichers || [],
            maxMetadataSize: options.maxMetadataSize || 10000, // 10KB limit
            ...options
        };
    }
    
    /**
     * Enriches chunks with comprehensive metadata
     * @param {Array} chunks - Array of text chunks to enrich
     * @param {Object} sourceInfo - Source information (URL, title, etc.)
     * @param {Object} processingInfo - Processing information
     * @param {Object} customMetadata - Custom metadata to attach
     * @returns {Promise<EnrichmentResult>} - Enrichment result
     */
    async enrich(chunks, sourceInfo = {}, processingInfo = {}, customMetadata = {}) {
        if (!Array.isArray(chunks)) {
            throw new MetadataEnrichmentError('Chunks must be an array');
        }
        
        if (chunks.length === 0) {
            return new EnrichmentResult({
                success: true,
                enrichedChunks: [],
                originalChunkCount: 0,
                enrichedChunkCount: 0,
                warnings: ['No chunks provided for enrichment']
            });
        }
        
        const warnings = [];
        const enrichedChunks = [];
        
        try {
            console.log(`🔍 Enriching ${chunks.length} chunks with metadata`);
            
            // Validate source info
            const validatedSourceInfo = this.validateSourceInfo(sourceInfo, warnings);
            
            // Process each chunk
            for (let i = 0; i < chunks.length; i++) {
                try {
                    const enrichedChunk = await this.enrichChunk(
                        chunks[i],
                        i,
                        validatedSourceInfo,
                        processingInfo,
                        customMetadata,
                        chunks.length
                    );
                    enrichedChunks.push(enrichedChunk);
                } catch (error) {
                    console.warn(`Warning: Failed to enrich chunk ${i}:`, error.message);
                    warnings.push(`Failed to enrich chunk ${i}: ${error.message}`);
                    
                    // Create minimal enriched chunk
                    enrichedChunks.push(new EnrichedChunk({
                        content: chunks[i].content || chunks[i],
                        index: i,
                        metadata: chunks[i].metadata || {},
                        sourceMetadata: validatedSourceInfo,
                        processingMetadata: { error: error.message }
                    }));
                }
            }
            
            // Calculate statistics
            const stats = this.calculateEnrichmentStats(enrichedChunks, chunks);
            
            console.log(`✅ Metadata enrichment completed: ${enrichedChunks.length} chunks enriched`);
            
            return new EnrichmentResult({
                success: true,
                enrichedChunks,
                originalChunkCount: chunks.length,
                enrichedChunkCount: enrichedChunks.length,
                stats,
                warnings
            });
            
        } catch (error) {
            console.error(`❌ Metadata enrichment failed:`, error.message);
            throw new MetadataEnrichmentError(
                `Failed to enrich metadata: ${error.message}`,
                -1,
                error
            );
        }
    }
    
    /**
     * Enriches a single chunk with metadata
     * @param {Object} chunk - Chunk to enrich
     * @param {number} index - Chunk index
     * @param {Object} sourceInfo - Source information
     * @param {Object} processingInfo - Processing information
     * @param {Object} customMetadata - Custom metadata
     * @param {number} totalChunks - Total number of chunks
     * @returns {Promise<EnrichedChunk>} - Enriched chunk
     */
    async enrichChunk(chunk, index, sourceInfo, processingInfo, customMetadata, totalChunks) {
        const content = chunk.content || chunk;
        const existingMetadata = chunk.metadata || {};
        
        // Build source metadata
        const sourceMetadata = this.options.includeSourceInfo ? {
            url: sourceInfo.url || '',
            title: sourceInfo.title || '',
            description: sourceInfo.description || '',
            domain: sourceInfo.domain || this.extractDomain(sourceInfo.url),
            crawledAt: sourceInfo.crawledAt || new Date().toISOString(),
            contentType: sourceInfo.contentType || 'text/markdown'
        } : {};
        
        // Build processing metadata
        const processingMetadata = this.options.includeProcessingStats ? {
            chunkIndex: index,
            totalChunks,
            chunkSize: content.length,
            processingMethod: processingInfo.method || 'langchain-recursive',
            extractionMethod: processingInfo.extractionMethod || 'unknown',
            processingTime: processingInfo.processingTime || 0,
            chunkingOptions: processingInfo.chunkingOptions || {},
            ...processingInfo
        } : {};
        
        // Build content metadata
        const contentMetadata = this.options.includeContentAnalysis ? 
            await this.analyzeContent(content) : {};
        
        // Apply custom enrichers
        let enrichedCustomMetadata = { ...customMetadata };
        for (const enricher of this.options.customEnrichers) {
            try {
                enrichedCustomMetadata = await enricher(content, enrichedCustomMetadata, index);
            } catch (error) {
                console.warn(`Custom enricher failed for chunk ${index}:`, error.message);
            }
        }
        
        // Create enriched chunk
        const enrichedChunk = new EnrichedChunk({
            content,
            index,
            metadata: existingMetadata,
            sourceMetadata,
            processingMetadata,
            contentMetadata,
            customMetadata: enrichedCustomMetadata
        });
        
        // Validate metadata size
        this.validateMetadataSize(enrichedChunk);
        
        return enrichedChunk;
    }
    
    /**
     * Validates source information
     * @param {Object} sourceInfo - Source information to validate
     * @param {Array} warnings - Array to collect warnings
     * @returns {Object} - Validated source info
     */
    validateSourceInfo(sourceInfo, warnings) {
        const validated = { ...sourceInfo };
        
        // Validate URL
        if (validated.url) {
            try {
                const url = new URL(validated.url);
                validated.domain = url.hostname;
                validated.protocol = url.protocol;
                validated.pathname = url.pathname;
            } catch (error) {
                warnings.push(`Invalid source URL: ${validated.url}`);
                validated.url = '';
            }
        } else {
            warnings.push('No source URL provided');
        }
        
        // Validate title
        if (!validated.title || validated.title.trim().length === 0) {
            warnings.push('No source title provided');
            validated.title = validated.domain || 'Unknown';
        }
        
        // Ensure crawledAt timestamp
        if (!validated.crawledAt) {
            validated.crawledAt = new Date().toISOString();
        }
        
        return validated;
    }
    
    /**
     * Analyzes content to extract metadata
     * @param {string} content - Content to analyze
     * @returns {Promise<Object>} - Content analysis metadata
     */
    async analyzeContent(content) {
        const analysis = {
            length: content.length,
            wordCount: this.countWords(content),
            lineCount: content.split('\n').length,
            paragraphCount: content.split('\n\n').filter(p => p.trim().length > 0).length
        };
        
        // Analyze structure
        analysis.structure = this.analyzeStructure(content);
        
        // Analyze content type
        analysis.contentType = this.detectContentType(content);
        
        // Calculate readability metrics
        analysis.readability = this.calculateReadabilityMetrics(content);
        
        return analysis;
    }
    
    /**
     * Counts words in content
     * @param {string} content - Content to analyze
     * @returns {number} - Word count
     */
    countWords(content) {
        return content
            .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
            .split(/\s+/)
            .filter(word => word.length > 0)
            .length;
    }
    
    /**
     * Analyzes document structure
     * @param {string} content - Content to analyze
     * @returns {Object} - Structure analysis
     */
    analyzeStructure(content) {
        return {
            headings: {
                h1: (content.match(/^# /gm) || []).length,
                h2: (content.match(/^## /gm) || []).length,
                h3: (content.match(/^### /gm) || []).length,
                h4: (content.match(/^#### /gm) || []).length,
                h5: (content.match(/^##### /gm) || []).length,
                h6: (content.match(/^###### /gm) || []).length,
                total: (content.match(/^#{1,6} /gm) || []).length
            },
            lists: {
                unordered: (content.match(/^[\s]*[-*+] /gm) || []).length,
                ordered: (content.match(/^[\s]*\d+\. /gm) || []).length
            },
            codeBlocks: (content.match(/```/g) || []).length / 2,
            inlineCode: (content.match(/`[^`]+`/g) || []).length,
            links: (content.match(/\[[^\]]*\]\([^)]*\)/g) || []).length,
            images: (content.match(/!\[[^\]]*\]\([^)]*\)/g) || []).length,
            tables: (content.match(/\|.*\|/g) || []).length,
            blockquotes: (content.match(/^>/gm) || []).length
        };
    }
    
    /**
     * Detects content type based on structure
     * @param {string} content - Content to analyze
     * @returns {string} - Detected content type
     */
    detectContentType(content) {
        const structure = this.analyzeStructure(content);
        
        if (structure.codeBlocks > 3 || structure.inlineCode > 10) {
            return 'technical-documentation';
        }
        
        if (structure.headings.total > 3) {
            return 'structured-document';
        }
        
        if (structure.lists.unordered + structure.lists.ordered > 5) {
            return 'list-heavy';
        }
        
        if (structure.tables > 2) {
            return 'data-heavy';
        }
        
        return 'general-text';
    }
    
    /**
     * Calculates basic readability metrics
     * @param {string} content - Content to analyze
     * @returns {Object} - Readability metrics
     */
    calculateReadabilityMetrics(content) {
        const words = this.countWords(content);
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
        const characters = content.replace(/\s/g, '').length;
        
        return {
            averageWordsPerSentence: sentences > 0 ? Math.round(words / sentences * 10) / 10 : 0,
            averageCharactersPerWord: words > 0 ? Math.round(characters / words * 10) / 10 : 0,
            estimatedReadingTimeMinutes: Math.ceil(words / 200) // Assuming 200 WPM
        };
    }
    
    /**
     * Extracts domain from URL
     * @param {string} url - URL to extract domain from
     * @returns {string} - Domain or empty string
     */
    extractDomain(url) {
        try {
            return new URL(url).hostname;
        } catch {
            return '';
        }
    }
    
    /**
     * Validates metadata size to prevent excessive memory usage
     * @param {EnrichedChunk} chunk - Chunk to validate
     */
    validateMetadataSize(chunk) {
        const metadataSize = JSON.stringify(chunk.metadata).length;
        if (metadataSize > this.options.maxMetadataSize) {
            console.warn(`Chunk ${chunk.index} metadata size (${metadataSize} bytes) exceeds limit (${this.options.maxMetadataSize} bytes)`);
            
            // Trim metadata if too large
            if (chunk.metadata.content && chunk.metadata.content.structure) {
                delete chunk.metadata.content.structure;
            }
            if (chunk.metadata.custom) {
                chunk.metadata.custom = {};
            }
        }
    }
    
    /**
     * Calculates enrichment statistics
     * @param {EnrichedChunk[]} enrichedChunks - Enriched chunks
     * @param {Array} originalChunks - Original chunks
     * @returns {Object} - Statistics
     */
    calculateEnrichmentStats(enrichedChunks, originalChunks) {
        const totalMetadataSize = enrichedChunks.reduce((sum, chunk) => 
            sum + JSON.stringify(chunk.metadata).length, 0);
        
        const avgMetadataSize = enrichedChunks.length > 0 ? 
            Math.round(totalMetadataSize / enrichedChunks.length) : 0;
        
        const contentTypes = {};
        enrichedChunks.forEach(chunk => {
            const type = chunk.metadata.content?.contentType || 'unknown';
            contentTypes[type] = (contentTypes[type] || 0) + 1;
        });
        
        return {
            totalChunks: enrichedChunks.length,
            totalMetadataSize,
            averageMetadataSize: avgMetadataSize,
            contentTypeDistribution: contentTypes,
            enrichmentSuccess: enrichedChunks.length / originalChunks.length,
            averageContentLength: enrichedChunks.reduce((sum, chunk) => 
                sum + chunk.content.length, 0) / enrichedChunks.length
        };
    }
}

/**
 * Creates a new metadata enricher instance
 * @param {Object} options - Configuration options
 * @returns {MetadataEnricher} - New enricher instance
 */
export function createMetadataEnricher(options = {}) {
    return new MetadataEnricher(options);
}

/**
 * Convenience function to enrich chunks with metadata
 * @param {Array} chunks - Chunks to enrich
 * @param {Object} sourceInfo - Source information
 * @param {Object} processingInfo - Processing information
 * @param {Object} customMetadata - Custom metadata
 * @param {Object} options - Enricher options
 * @returns {Promise<EnrichmentResult>} - Enrichment result
 */
export async function enrichChunks(chunks, sourceInfo = {}, processingInfo = {}, customMetadata = {}, options = {}) {
    const enricher = createMetadataEnricher(options);
    return await enricher.enrich(chunks, sourceInfo, processingInfo, customMetadata);
}