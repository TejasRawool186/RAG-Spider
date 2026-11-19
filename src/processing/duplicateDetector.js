/**
 * Duplicate Detection Engine for RAG Spider
 * 
 * Multi-level content deduplication:
 * - Page-level: Canonical URL matching and exact SHA-256 fingerprinting
 * - Chunk-level: Exact text hashing & perceptual SimHash near-duplicate detection
 * - Transparent duplicate reporting and statistics
 * - Safe filtering allowing users to retain or omit duplicate chunks
 * 
 * Requirements: 6.7
 */

import { sha256, calculateTextSimilarity, normalizeTextForComparison } from '../utils/contentFingerprint.js';
import { normalizeCanonicalUrl } from '../utils/urlUtils.js';

export class DuplicateDetector {
    constructor(options = {}) {
        this.options = {
            enabled: options.enableDeduplication !== false,
            nearDuplicateThreshold: options.duplicateThreshold || 0.85,
            filterDuplicates: options.filterDuplicates || false,
            ...options
        };

        this.seenCanonicalUrls = new Map(); // canonicalUrl -> { url, timestamp }
        this.seenPageHashes = new Map(); // sha256 -> { url, title }
        this.seenChunkHashes = new Map(); // sha256 -> { chunkId, url, index }
        this.sampleChunkSimhashes = []; // array of { simhash, chunkId, url, text }

        this.stats = {
            pagesChecked: 0,
            duplicatePagesDetected: 0,
            exactDuplicatePages: 0,
            canonicalDuplicatePages: 0,
            chunksChecked: 0,
            duplicateChunksDetected: 0,
            exactDuplicateChunks: 0,
            nearDuplicateChunks: 0
        };
    }

    /**
     * Checks if a page is a duplicate of a previously crawled page
     * @param {string} url 
     * @param {string} content 
     * @param {string} canonicalUrl 
     * @returns {{ isDuplicate: boolean, duplicateOf?: string, duplicateType?: 'canonical' | 'exact_content' }}
     */
    checkPageDuplicate(url, content, canonicalUrl = '') {
        if (!this.options.enabled) {
            return { isDuplicate: false };
        }

        this.stats.pagesChecked++;
        const normCanonical = normalizeCanonicalUrl(canonicalUrl || url);

        // 1. Check canonical URL duplication
        if (this.seenCanonicalUrls.has(normCanonical)) {
            const original = this.seenCanonicalUrls.get(normCanonical);
            if (original.url !== url) {
                this.stats.duplicatePagesDetected++;
                this.stats.canonicalDuplicatePages++;
                return {
                    isDuplicate: true,
                    duplicateOf: original.url,
                    duplicateType: 'canonical'
                };
            }
        } else {
            this.seenCanonicalUrls.set(normCanonical, { url, timestamp: new Date().toISOString() });
        }

        // 2. Check exact content hash duplication
        const pageHash = sha256(normalizeTextForComparison(content));
        if (this.seenPageHashes.has(pageHash)) {
            const original = this.seenPageHashes.get(pageHash);
            this.stats.duplicatePagesDetected++;
            this.stats.exactDuplicatePages++;
            return {
                isDuplicate: true,
                duplicateOf: original.url,
                duplicateType: 'exact_content'
            };
        } else {
            this.seenPageHashes.set(pageHash, { url });
        }

        return { isDuplicate: false };
    }

    /**
     * Analyzes an array of chunks for exact and near duplicates
     * @param {Array<{ content: string, chunkId: string, url?: string }>} chunks 
     * @returns {{ uniqueChunks: Array, duplicateChunks: Array, stats: Object }}
     */
    checkChunkDuplicates(chunks = []) {
        if (!this.options.enabled || !Array.isArray(chunks)) {
            return { uniqueChunks: chunks, duplicateChunks: [], stats: this.stats };
        }

        const uniqueChunks = [];
        const duplicateChunks = [];

        for (const chunk of chunks) {
            this.stats.chunksChecked++;
            const text = chunk.content || '';
            const normalized = normalizeTextForComparison(text);
            const chunkHash = sha256(normalized);

            // 1. Exact chunk duplicate check
            if (this.seenChunkHashes.has(chunkHash)) {
                const original = this.seenChunkHashes.get(chunkHash);
                this.stats.duplicateChunksDetected++;
                this.stats.exactDuplicateChunks++;

                const duplicateInfo = {
                    ...chunk,
                    isDuplicate: true,
                    duplicateType: 'exact',
                    duplicateOfChunkId: original.chunkId,
                    duplicateOfUrl: original.url,
                    similarityScore: 1.0
                };
                duplicateChunks.push(duplicateInfo);
                if (!this.options.filterDuplicates) {
                    uniqueChunks.push(duplicateInfo);
                }
                continue;
            }

            // 2. Near duplicate check using SimHash against indexed sample chunks (bounded to last 500)
            let isNearDuplicate = false;
            let nearMatch = null;

            if (text.length > 80 && this.sampleChunkSimhashes.length > 0) {
                for (let i = this.sampleChunkSimhashes.length - 1; i >= Math.max(0, this.sampleChunkSimhashes.length - 200); i--) {
                    const sample = this.sampleChunkSimhashes[i];
                    const sim = calculateTextSimilarity(text, sample.text);
                    if (sim >= this.options.nearDuplicateThreshold) {
                        isNearDuplicate = true;
                        nearMatch = { sample, similarity: sim };
                        break;
                    }
                }
            }

            if (isNearDuplicate && nearMatch) {
                this.stats.duplicateChunksDetected++;
                this.stats.nearDuplicateChunks++;

                const duplicateInfo = {
                    ...chunk,
                    isDuplicate: true,
                    duplicateType: 'near',
                    duplicateOfChunkId: nearMatch.sample.chunkId,
                    duplicateOfUrl: nearMatch.sample.url,
                    similarityScore: Math.round(nearMatch.similarity * 100) / 100
                };
                duplicateChunks.push(duplicateInfo);
                if (!this.options.filterDuplicates) {
                    uniqueChunks.push(duplicateInfo);
                }
            } else {
                // Register as unique
                this.seenChunkHashes.set(chunkHash, {
                    chunkId: chunk.chunkId,
                    url: chunk.source?.url || chunk.metadata?.sourceUrl || ''
                });

                if (this.sampleChunkSimhashes.length < 500 && text.length > 80) {
                    this.sampleChunkSimhashes.push({
                        text: text.slice(0, 300),
                        chunkId: chunk.chunkId,
                        url: chunk.source?.url || chunk.metadata?.sourceUrl || ''
                    });
                }

                uniqueChunks.push({
                    ...chunk,
                    isDuplicate: false
                });
            }
        }

        return {
            uniqueChunks,
            duplicateChunks,
            stats: { ...this.stats }
        };
    }

    /**
     * Generates a comprehensive duplicate audit report
     * @returns {Object}
     */
    getDuplicateReport() {
        const duplicateRate = this.stats.chunksChecked > 0
            ? Math.round((this.stats.duplicateChunksDetected / this.stats.chunksChecked) * 100)
            : 0;

        return {
            enabled: this.options.enabled,
            threshold: this.options.nearDuplicateThreshold,
            statistics: {
                ...this.stats,
                duplicateRatePercentage: duplicateRate
            },
            uniquePagesCount: this.seenCanonicalUrls.size,
            uniqueChunksCount: this.seenChunkHashes.size,
            generatedAt: new Date().toISOString()
        };
    }
}

