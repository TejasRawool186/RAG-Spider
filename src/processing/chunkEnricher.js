/**
 * Contextual Chunk Enrichment Service for RAG Spider
 * 
 * Enriches every text chunk with semantic document context:
 * - Document title, source URL, domain, canonical URL
 * - Breadcrumbs and heading hierarchy
 * - Content type and document version
 * - Language code
 * - Chunk sequence (chunkIndex, totalChunks, previousChunkId, nextChunkId)
 * - Deterministic, collision-resistant document and chunk IDs
 * - Page number or source location where applicable
 * - Sanitizes sensitive credentials and internal proxy details
 * 
 * Requirements: 6.6
 */

import { sha256, shortHash } from '../utils/contentFingerprint.js';
import { extractDomain, normalizeCanonicalUrl } from '../utils/urlUtils.js';

export class EnrichedRAGChunk {
    constructor({
        chunkId = '',
        documentId = '',
        content = '',
        chunkIndex = 0,
        totalChunks = 1,
        tokens = 0,
        wordCount = 0,
        charCount = 0,
        previousChunkId = null,
        nextChunkId = null,
        contentHash = '',
        source = {},
        metadata = {}
    } = {}) {
        this.chunkId = chunkId;
        this.documentId = documentId;
        this.content = content;
        this.chunkIndex = chunkIndex;
        this.totalChunks = totalChunks;
        this.tokens = tokens;
        this.wordCount = wordCount;
        this.charCount = charCount;
        this.previousChunkId = previousChunkId;
        this.nextChunkId = nextChunkId;
        this.contentHash = contentHash;
        this.source = source;
        this.metadata = metadata;
    }
}

/**
 * Enriches an array of raw text chunks with contextual RAG metadata
 * @param {Array<{ content: string, index?: number, metadata?: Object }>} rawChunks 
 * @param {Object} documentContext 
 * @returns {EnrichedRAGChunk[]}
 */
export function enrichChunksWithContext(rawChunks = [], documentContext = {}) {
    if (!Array.isArray(rawChunks) || rawChunks.length === 0) {
        return [];
    }

    const {
        url = '',
        canonicalUrl = '',
        title = '',
        contentType = 'general_webpage',
        version = null,
        section = null,
        language = 'en',
        breadcrumbs = [],
        extractionMethod = 'html-pipeline',
        pageNumber = null,
        timestamp = new Date().toISOString()
    } = documentContext;

    const cleanUrl = normalizeCanonicalUrl(url);
    const domain = extractDomain(url);
    const documentId = `doc_${shortHash(cleanUrl)}`;

    // Pre-extract headings from chunks if present
    const headingStack = [];

    // First pass: generate chunk IDs to link previous and next
    const chunkIds = [];
    for (let i = 0; i < rawChunks.length; i++) {
        const content = rawChunks[i].content || '';
        const cHash = sha256(content).substring(0, 8);
        const chunkId = `chunk_${shortHash(cleanUrl)}_${i}_${cHash}`;
        chunkIds.push(chunkId);
    }

    const enrichedChunks = [];

    for (let i = 0; i < rawChunks.length; i++) {
        const rawChunk = rawChunks[i];
        const content = rawChunk.content || '';
        const words = content.trim().split(/\s+/).filter(Boolean).length;

        // Detect any Markdown headings in this chunk to update current heading context
        const headingMatch = content.match(/^#{1,6}\s+([^\n]+)/m);
        let sectionTitle = section;
        if (headingMatch) {
            const hText = headingMatch[1].trim();
            if (!headingStack.includes(hText)) {
                headingStack.push(hText);
                if (headingStack.length > 5) headingStack.shift();
            }
            sectionTitle = hText;
        }

        const chunkMetadata = {
            documentTitle: title,
            sourceUrl: url,
            canonicalUrl: canonicalUrl || cleanUrl,
            domain,
            breadcrumbPath: breadcrumbs.length > 0 ? breadcrumbs.join(' > ') : '',
            headingHierarchy: [...headingStack],
            sectionTitle: sectionTitle || (headingStack.length > 0 ? headingStack[headingStack.length - 1] : title),
            contentType,
            documentVersion: version,
            language,
            extractionMethod,
            timestamp,
            pageNumber: pageNumber || rawChunk.metadata?.pageNumber || null,
            ...(rawChunk.metadata || {})
        };

        // Remove any internal proxy or credential fields
        delete chunkMetadata.proxy;
        delete chunkMetadata.proxyUrl;
        delete chunkMetadata.cookies;
        delete chunkMetadata.headers;

        const enriched = new EnrichedRAGChunk({
            chunkId: chunkIds[i],
            documentId,
            content,
            chunkIndex: i,
            totalChunks: rawChunks.length,
            tokens: rawChunk.tokens || 0,
            wordCount: words,
            charCount: content.length,
            previousChunkId: i > 0 ? chunkIds[i - 1] : null,
            nextChunkId: i < rawChunks.length - 1 ? chunkIds[i + 1] : null,
            contentHash: sha256(content),
            source: {
                url,
                title,
                domain,
                pageNumber: pageNumber || rawChunk.metadata?.pageNumber || null
            },
            metadata: chunkMetadata
        });

        enrichedChunks.push(enriched);
    }

    return enrichedChunks;
}

