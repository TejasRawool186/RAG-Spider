/**
 * Advanced Semantic Text Chunking Service for RAG Spider
 * 
 * Provides 8 configurable chunking strategies:
 * 1. recursive: LangChain RecursiveCharacterTextSplitter (backward-compatible default)
 * 2. fixed: Fixed-size character window with configurable overlap
 * 3. paragraph: Paragraph-based chunking (\n\n) respecting paragraph integrity
 * 4. sentence: Sentence-boundary chunking ([.!?]\s+)
 * 5. heading_markdown: Heading-aware Markdown chunking (preserves heading hierarchies)
 * 6. code_block_aware: Code-block-aware chunking (keeps complete code blocks intact)
 * 7. table_aware: Table-aware chunking (preserves Markdown table structures)
 * 8. doc_section: Documentation section chunking
 * 
 * Requirements: 6.5
 */

import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

export const ChunkingStrategy = {
    RECURSIVE: 'recursive',
    FIXED: 'fixed',
    PARAGRAPH: 'paragraph',
    SENTENCE: 'sentence',
    HEADING_MARKDOWN: 'heading_markdown',
    CODE_BLOCK_AWARE: 'code_block_aware',
    TABLE_AWARE: 'table_aware',
    DOC_SECTION: 'doc_section'
};

const DEFAULT_CHUNKING_OPTIONS = {
    chunkSize: 1000,
    chunkOverlap: 100,
    strategy: ChunkingStrategy.RECURSIVE,
    separators: ['\n\n', '\n', ' ', ''],
    keepSeparator: false,
    preserveHeadings: true,
    preserveCodeBlocks: true,
    preserveTables: true,
    lengthFunction: (text) => text.length
};

export class TextChunkingError extends Error {
    constructor(message, textLength = 0, originalError = null) {
        super(message);
        this.name = 'TextChunkingError';
        this.textLength = textLength;
        this.originalError = originalError;
    }
}

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

export class TextChunker {
    constructor(options = {}) {
        this.options = {
            ...DEFAULT_CHUNKING_OPTIONS,
            ...options
        };

        this.validateOptions();

        this.splitter = new RecursiveCharacterTextSplitter({
            chunkSize: this.options.chunkSize,
            chunkOverlap: this.options.chunkOverlap,
            separators: this.options.separators,
            keepSeparator: this.options.keepSeparator,
            lengthFunction: this.options.lengthFunction
        });
    }

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
     * Chunks text content using configured strategy
     * @param {string} text 
     * @param {Object} metadata 
     * @returns {Promise<ChunkingResult>}
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
            console.log(`Chunking text content (${text.length} characters, strategy: ${this.options.strategy || 'recursive'})`);

            const processedText = this.preprocessText(text, warnings);
            let rawChunks = [];

            const strategy = (this.options.strategy || ChunkingStrategy.RECURSIVE).toLowerCase();

            switch (strategy) {
                case ChunkingStrategy.FIXED:
                    rawChunks = this.chunkFixed(processedText);
                    break;
                case ChunkingStrategy.PARAGRAPH:
                    rawChunks = this.chunkByParagraphs(processedText);
                    break;
                case ChunkingStrategy.SENTENCE:
                    rawChunks = this.chunkBySentences(processedText);
                    break;
                case ChunkingStrategy.HEADING_MARKDOWN:
                    rawChunks = this.chunkByHeadings(processedText);
                    break;
                case ChunkingStrategy.CODE_BLOCK_AWARE:
                    rawChunks = this.chunkCodeBlockAware(processedText);
                    break;
                case ChunkingStrategy.TABLE_AWARE:
                    rawChunks = this.chunkTableAware(processedText);
                    break;
                case ChunkingStrategy.DOC_SECTION:
                    rawChunks = this.chunkByDocSections(processedText);
                    break;
                case ChunkingStrategy.RECURSIVE:
                default:
                    rawChunks = await this.splitter.splitText(processedText);
                    break;
            }

            if (rawChunks.length === 0) {
                // Safe fallback to recursive splitter
                rawChunks = await this.splitter.splitText(processedText);
            }

            if (rawChunks.length === 0) {
                throw new TextChunkingError('Text splitter returned no chunks');
            }

            const chunks = this.createEnhancedChunks(rawChunks, processedText, metadata);
            const stats = this.calculateStats(chunks, text.length);

            console.log(`Text chunking completed: ${chunks.length} chunks created`);

            return new ChunkingResult({
                success: true,
                chunks,
                originalLength: text.length,
                totalChunks: chunks.length,
                averageChunkSize: stats.averageChunkSize,
                overlapRatio: stats.overlapRatio,
                stats: {
                    ...stats,
                    strategy: this.options.strategy || ChunkingStrategy.RECURSIVE
                },
                warnings
            });
        } catch (error) {
            console.error('Text chunking failed:', error.message);
            throw new TextChunkingError(
                `Failed to chunk text: ${error.message}`,
                text.length,
                error
            );
        }
    }

    /**
     * Fixed-size window chunking with character overlap
     */
    chunkFixed(text) {
        const chunks = [];
        const size = this.options.chunkSize;
        const overlap = this.options.chunkOverlap;
        let start = 0;

        while (start < text.length) {
            let end = Math.min(start + size, text.length);
            const chunk = text.slice(start, end).trim();
            if (chunk) chunks.push(chunk);
            if (end >= text.length) break;
            start += (size - overlap);
        }
        return chunks;
    }

    /**
     * Paragraph-based chunking: groups paragraphs up to chunkSize
     */
    chunkByParagraphs(text) {
        const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
        const chunks = [];
        let currentChunk = '';

        for (const p of paragraphs) {
            if (!currentChunk) {
                currentChunk = p;
            } else if (currentChunk.length + p.length + 2 <= this.options.chunkSize) {
                currentChunk += '\n\n' + p;
            } else {
                chunks.push(currentChunk);
                currentChunk = p;
            }
        }
        if (currentChunk) chunks.push(currentChunk);
        return chunks;
    }

    /**
     * Sentence-based chunking: splits by sentence boundaries without breaking mid-sentence
     */
    chunkBySentences(text) {
        const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [text];
        const chunks = [];
        let currentChunk = '';

        for (const s of sentences) {
            const cleanS = s.trim();
            if (!cleanS) continue;

            if (!currentChunk) {
                currentChunk = cleanS;
            } else if (currentChunk.length + cleanS.length + 1 <= this.options.chunkSize) {
                currentChunk += ' ' + cleanS;
            } else {
                chunks.push(currentChunk);
                currentChunk = cleanS;
            }
        }
        if (currentChunk) chunks.push(currentChunk);
        return chunks;
    }

    /**
     * Heading-aware Markdown chunking: splits on Markdown headings (#, ##, ###)
     */
    chunkByHeadings(text) {
        const headingRegex = /^(#{1,6}\s+[^\n]+)/gm;
        const sections = [];
        let lastIndex = 0;
        let match;
        let currentHeading = '';

        while ((match = headingRegex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                const body = text.slice(lastIndex, match.index).trim();
                if (body) {
                    sections.push({ heading: currentHeading, body });
                }
            }
            currentHeading = match[1].trim();
            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < text.length) {
            const body = text.slice(lastIndex).trim();
            if (body) {
                sections.push({ heading: currentHeading, body });
            }
        }

        if (sections.length === 0) {
            return this.chunkByParagraphs(text);
        }

        const chunks = [];
        for (const sec of sections) {
            const fullSec = sec.heading ? `${sec.heading}\n\n${sec.body}` : sec.body;
            if (fullSec.length <= this.options.chunkSize) {
                chunks.push(fullSec);
            } else {
                const subChunks = this.chunkByParagraphs(sec.body);
                for (let i = 0; i < subChunks.length; i++) {
                    const prefix = sec.heading ? `${sec.heading} (Part ${i + 1})\n\n` : '';
                    chunks.push(`${prefix}${subChunks[i]}`);
                }
            }
        }
        return chunks;
    }

    /**
     * Code-block-aware chunking: guarantees code blocks are kept intact
     */
    chunkCodeBlockAware(text) {
        const parts = [];
        const codeBlockRegex = /```[a-zA-Z0-9_\-+]*\n[\s\S]*?```/g;
        let lastIdx = 0;
        let match;

        while ((match = codeBlockRegex.exec(text)) !== null) {
            if (match.index > lastIdx) {
                parts.push({ type: 'prose', content: text.slice(lastIdx, match.index) });
            }
            parts.push({ type: 'code', content: match[0] });
            lastIdx = match.index + match[0].length;
        }
        if (lastIdx < text.length) {
            parts.push({ type: 'prose', content: text.slice(lastIdx) });
        }

        const chunks = [];
        let currentChunk = '';

        for (const part of parts) {
            if (part.type === 'code') {
                if (currentChunk && (currentChunk.length + part.content.length > this.options.chunkSize)) {
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                }
                if (part.content.length > this.options.chunkSize) {
                    if (currentChunk) chunks.push(currentChunk.trim());
                    chunks.push(part.content.trim());
                    currentChunk = '';
                } else {
                    currentChunk += (currentChunk ? '\n\n' : '') + part.content;
                }
            } else {
                const proseParagraphs = part.content.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
                for (const p of proseParagraphs) {
                    if (currentChunk && (currentChunk.length + p.length + 2 > this.options.chunkSize)) {
                        chunks.push(currentChunk.trim());
                        currentChunk = p;
                    } else {
                        currentChunk += (currentChunk ? '\n\n' : '') + p;
                    }
                }
            }
        }
        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }
        return chunks;
    }

    /**
     * Table-aware chunking: keeps Markdown tables intact
     */
    chunkTableAware(text) {
        const tableRegex = /(\|[^\n]+\|\n\|[\s\-:|]+\|(?:\n\|[^\n]+\|)+)/g;
        const parts = [];
        let lastIdx = 0;
        let match;

        while ((match = tableRegex.exec(text)) !== null) {
            if (match.index > lastIdx) {
                parts.push({ type: 'prose', content: text.slice(lastIdx, match.index) });
            }
            parts.push({ type: 'table', content: match[0] });
            lastIdx = match.index + match[0].length;
        }
        if (lastIdx < text.length) {
            parts.push({ type: 'prose', content: text.slice(lastIdx) });
        }

        const chunks = [];
        let current = '';

        for (const p of parts) {
            if (p.type === 'table') {
                if (current && (current.length + p.content.length > this.options.chunkSize)) {
                    chunks.push(current.trim());
                    current = '';
                }
                if (p.content.length > this.options.chunkSize) {
                    if (current) chunks.push(current.trim());
                    chunks.push(p.content.trim());
                    current = '';
                } else {
                    current += (current ? '\n\n' : '') + p.content;
                }
            } else {
                const sub = this.chunkByParagraphs(p.content);
                for (const s of sub) {
                    if (current && (current.length + s.length + 2 > this.options.chunkSize)) {
                        chunks.push(current.trim());
                        current = s;
                    } else {
                        current += (current ? '\n\n' : '') + s;
                    }
                }
            }
        }
        if (current.trim()) chunks.push(current.trim());
        return chunks;
    }

    /**
     * Documentation section chunking
     */
    chunkByDocSections(text) {
        return this.chunkByHeadings(text);
    }

    preprocessText(text, warnings) {
        let processed = text;
        processed = processed.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        processed = processed.replace(/[ \t]+/g, ' ');
        processed = processed.replace(/\n{4,}/g, '\n\n\n');
        processed = processed.replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2');
        processed = processed.replace(/(#{1,6}[^\n]*)\n([^\n#])/g, '$1\n\n$2');
        processed = processed.replace(/([^\n])\n```/g, '$1\n\n```');
        processed = processed.replace(/```\n([^\n])/g, '```\n\n$1');

        if (processed.length < text.length * 0.8) {
            warnings.push('Significant text reduction during preprocessing');
        }

        const codeBlockCount = (processed.match(/```/g) || []).length / 2;
        if (codeBlockCount > 10) {
            warnings.push(`Many code blocks detected (${codeBlockCount}) - chunking may split code`);
        }

        return processed;
    }

    createEnhancedChunks(rawChunks, originalText, baseMetadata) {
        const chunks = [];
        let currentOffset = 0;

        for (let i = 0; i < rawChunks.length; i++) {
            const chunkContent = rawChunks[i];
            const chunkStart = originalText.indexOf(chunkContent, currentOffset);
            const chunkEnd = chunkStart >= 0 ? chunkStart + chunkContent.length : currentOffset + chunkContent.length;

            const estimatedOverlapStart = i > 0 ? Math.min(this.options.chunkOverlap, Math.floor(chunkContent.length * 0.1)) : 0;
            const estimatedOverlapEnd = i < rawChunks.length - 1 ? Math.min(this.options.chunkOverlap, Math.floor(chunkContent.length * 0.1)) : 0;

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
                    chunkOverlap: this.options.chunkOverlap,
                    strategy: this.options.strategy || ChunkingStrategy.RECURSIVE
                }
            });

            chunks.push(chunk);
            currentOffset = chunkEnd;
        }

        return chunks;
    }

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

        const variance = chunkSizes.reduce((sum, size) => sum + Math.pow(size - averageChunkSize, 2), 0) / chunks.length;

        return {
            averageChunkSize: Math.round(averageChunkSize),
            overlapRatio: Math.round(overlapRatio * 1000) / 1000,
            totalOverlapChars,
            minChunkSize,
            maxChunkSize,
            chunkSizeVariance: Math.round(variance),
            compressionRatio: originalLength > 0 ? totalChunkChars / originalLength : 1,
            chunksPerKB: originalLength > 0 ? (chunks.length / (originalLength / 1024)) : 0
        };
    }

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
            if (!chunk.content || typeof chunk.content !== 'string') {
                result.valid = false;
                result.errors.push(`Chunk ${i} has invalid or empty content`);
            }
            if (chunk.index !== i) {
                result.warnings.push(`Chunk ${i} has index mismatch: ${chunk.index}`);
            }
        }

        return result;
    }
}

export function createTextChunker(options = {}) {
    return new TextChunker(options);
}

export async function chunkText(text, options = {}, metadata = {}) {
    const chunker = createTextChunker(options);
    return await chunker.chunk(text, metadata);
}
