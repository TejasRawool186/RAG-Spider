/**
 * Vector Database and RAG Export Adapters for RAG Spider
 * 
 * Generates ingestion-ready payloads for modern vector databases and RAG frameworks:
 * 1. Qdrant: { points: [{ id, vector, payload: { content, metadata } }] }
 * 2. Chroma: { ids: [], documents: [], metadatas: [] }
 * 3. Pinecone: { vectors: [{ id, values: [], metadata: { text, ... } }] }
 * 4. Weaviate: { objects: [{ class: "DocumentChunk", properties: { ... } }] }
 * 5. Milvus: [{ id, vector, content, metadata }]
 * 6. Generic JSONL: newline-delimited JSON objects
 * 7. Generic CSV: tabular export of chunks and metadata
 * 
 * Requirements: 6.17
 */

import { Actor } from 'apify';
import { md5 } from '../utils/contentFingerprint.js';

export const ExportFormat = {
    QDRANT: 'qdrant',
    CHROMA: 'chroma',
    PINECONE: 'pinecone',
    WEAVIATE: 'weaviate',
    MILVUS: 'milvus',
    JSONL: 'jsonl',
    CSV: 'csv'
};

/**
 * Transforms chunks into a Qdrant-compatible points batch
 * @param {Array} chunks 
 * @returns {Object}
 */
export function formatForQdrant(chunks = []) {
    return {
        points: chunks.map((chunk, i) => {
            // Qdrant supports UUID or unsigned integer
            // Format MD5 into a valid UUID v4 shape: 8-4-4-4-12
            const hash = md5(chunk.chunkId || `${chunk.documentId}-${i}`);
            const uuid = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;

            return {
                id: uuid,
                vector: null, // Placeholder for embedding pipeline
                payload: {
                    content: chunk.content,
                    chunkId: chunk.chunkId,
                    documentId: chunk.documentId,
                    chunkIndex: chunk.chunkIndex,
                    totalChunks: chunk.totalChunks,
                    tokens: chunk.tokens,
                    wordCount: chunk.wordCount,
                    sourceUrl: chunk.metadata?.sourceUrl || chunk.source?.url || '',
                    documentTitle: chunk.metadata?.documentTitle || chunk.source?.title || '',
                    sectionTitle: chunk.metadata?.sectionTitle || '',
                    contentType: chunk.metadata?.contentType || '',
                    language: chunk.metadata?.language || 'en',
                    timestamp: chunk.metadata?.timestamp || new Date().toISOString()
                }
            };
        })
    };
}

/**
 * Transforms chunks into Chroma collection format (ids, documents, metadatas)
 * @param {Array} chunks 
 * @returns {Object}
 */
export function formatForChroma(chunks = []) {
    return {
        ids: chunks.map((c, i) => c.chunkId || `chunk-${i}`),
        documents: chunks.map(c => c.content || ''),
        metadatas: chunks.map(c => ({
            documentId: c.documentId || '',
            chunkIndex: c.chunkIndex || 0,
            totalChunks: c.totalChunks || 1,
            tokens: c.tokens || 0,
            sourceUrl: c.metadata?.sourceUrl || c.source?.url || '',
            documentTitle: c.metadata?.documentTitle || c.source?.title || '',
            contentType: c.metadata?.contentType || '',
            language: c.metadata?.language || 'en'
        }))
    };
}

/**
 * Transforms chunks into Pinecone vector upsert format
 * @param {Array} chunks 
 * @returns {Object}
 */
export function formatForPinecone(chunks = []) {
    return {
        vectors: chunks.map((c, i) => ({
            id: c.chunkId || `chunk-${i}`,
            values: [], // To be populated with embedding vector
            metadata: {
                text: c.content || '',
                documentId: c.documentId || '',
                chunkIndex: c.chunkIndex || 0,
                totalChunks: c.totalChunks || 1,
                tokens: c.tokens || 0,
                url: c.metadata?.sourceUrl || c.source?.url || '',
                title: c.metadata?.documentTitle || c.source?.title || '',
                contentType: c.metadata?.contentType || '',
                language: c.metadata?.language || 'en'
            }
        }))
    };
}

/**
 * Transforms chunks into Weaviate batch object format
 * @param {Array} chunks 
 * @param {string} className 
 * @returns {Object}
 */
export function formatForWeaviate(chunks = [], className = 'DocumentChunk') {
    return {
        objects: chunks.map((c, i) => {
            const hash = md5(c.chunkId || `chunk-${i}`);
            const uuid = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;

            return {
                class: className,
                id: uuid,
                properties: {
                    content: c.content || '',
                    chunkId: c.chunkId || `chunk-${i}`,
                    documentId: c.documentId || '',
                    chunkIndex: c.chunkIndex || 0,
                    totalChunks: c.totalChunks || 1,
                    tokens: c.tokens || 0,
                    sourceUrl: c.metadata?.sourceUrl || c.source?.url || '',
                    title: c.metadata?.documentTitle || c.source?.title || '',
                    contentType: c.metadata?.contentType || '',
                    language: c.metadata?.language || 'en'
                }
            };
        })
    };
}

/**
 * Transforms chunks into Milvus collection rows
 * @param {Array} chunks 
 * @returns {Array}
 */
export function formatForMilvus(chunks = []) {
    return chunks.map((c, i) => ({
        chunk_id: c.chunkId || `chunk-${i}`,
        doc_id: c.documentId || '',
        chunk_index: c.chunkIndex || 0,
        content: c.content || '',
        vector: [], // vector placeholder
        source_url: c.metadata?.sourceUrl || c.source?.url || '',
        title: c.metadata?.documentTitle || c.source?.title || '',
        tokens: c.tokens || 0,
        language: c.metadata?.language || 'en'
    }));
}

/**
 * Transforms chunks into newline-delimited JSON (JSONL)
 * @param {Array} chunks 
 * @returns {string}
 */
export function formatForJsonl(chunks = []) {
    return chunks.map(c => JSON.stringify(c)).join('\n');
}

/**
 * Transforms chunks into tabular CSV
 * @param {Array} chunks 
 * @returns {string}
 */
export function formatForCsv(chunks = []) {
    const headers = ['chunkId', 'documentId', 'chunkIndex', 'totalChunks', 'tokens', 'sourceUrl', 'title', 'content'];
    const lines = [headers.join(',')];

    for (const c of chunks) {
        const row = [
            `"${(c.chunkId || '').replace(/"/g, '""')}"`,
            `"${(c.documentId || '').replace(/"/g, '""')}"`,
            c.chunkIndex || 0,
            c.totalChunks || 1,
            c.tokens || 0,
            `"${(c.metadata?.sourceUrl || c.source?.url || '').replace(/"/g, '""')}"`,
            `"${(c.metadata?.documentTitle || c.source?.title || '').replace(/"/g, '""')}"`,
            `"${(c.content || '').replace(/"/g, '""').replace(/\n/g, '\\n')}"`
        ];
        lines.push(row.join(','));
    }

    return lines.join('\n');
}

/**
 * Prepares and saves vector export datasets in Apify Key-Value Store
 * @param {Array} allChunks 
 * @param {Object} options 
 * @returns {Promise<Object>} Export summary
 */
export async function prepareVectorExports(allChunks = [], options = {}) {
    const selectedFormat = (options.exportFormat || ExportFormat.JSONL).toLowerCase();
    const summary = {
        totalChunksExported: allChunks.length,
        formatsGenerated: [],
        savedKeys: [],
        timestamp: new Date().toISOString()
    };

    if (!Array.isArray(allChunks) || allChunks.length === 0) {
        return summary;
    }

    try {
        // Always generate JSONL as base standard format
        const jsonlData = formatForJsonl(allChunks);
        await Actor.setValue('EXPORT_JSONL', jsonlData, { contentType: 'application/x-ndjson' });
        summary.formatsGenerated.push('jsonl');
        summary.savedKeys.push('EXPORT_JSONL');

        // Generate selected provider payload
        if (selectedFormat === ExportFormat.QDRANT || options.generateAllExports) {
            const qdrantPayload = formatForQdrant(allChunks);
            await Actor.setValue('EXPORT_QDRANT', qdrantPayload);
            summary.formatsGenerated.push('qdrant');
            summary.savedKeys.push('EXPORT_QDRANT');
        }

        if (selectedFormat === ExportFormat.CHROMA || options.generateAllExports) {
            const chromaPayload = formatForChroma(allChunks);
            await Actor.setValue('EXPORT_CHROMA', chromaPayload);
            summary.formatsGenerated.push('chroma');
            summary.savedKeys.push('EXPORT_CHROMA');
        }

        if (selectedFormat === ExportFormat.PINECONE || options.generateAllExports) {
            const pineconePayload = formatForPinecone(allChunks);
            await Actor.setValue('EXPORT_PINECONE', pineconePayload);
            summary.formatsGenerated.push('pinecone');
            summary.savedKeys.push('EXPORT_PINECONE');
        }

        if (selectedFormat === ExportFormat.WEAVIATE || options.generateAllExports) {
            const weaviatePayload = formatForWeaviate(allChunks);
            await Actor.setValue('EXPORT_WEAVIATE', weaviatePayload);
            summary.formatsGenerated.push('weaviate');
            summary.savedKeys.push('EXPORT_WEAVIATE');
        }

        if (selectedFormat === ExportFormat.MILVUS || options.generateAllExports) {
            const milvusPayload = formatForMilvus(allChunks);
            await Actor.setValue('EXPORT_MILVUS', milvusPayload);
            summary.formatsGenerated.push('milvus');
            summary.savedKeys.push('EXPORT_MILVUS');
        }

        if (selectedFormat === ExportFormat.CSV || options.generateAllExports) {
            const csvData = formatForCsv(allChunks);
            await Actor.setValue('EXPORT_CSV', csvData, { contentType: 'text/csv' });
            summary.formatsGenerated.push('csv');
            summary.savedKeys.push('EXPORT_CSV');
        }

        await Actor.setValue('EXPORT_SUMMARY', summary);
    } catch (err) {
        console.warn(`Export generation warning: ${err.message}`);
    }

    return summary;
}

export const generateAndSaveExports = prepareVectorExports;

