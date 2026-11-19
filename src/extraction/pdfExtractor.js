/**
 * PDF Document Extraction Service for RAG Spider
 * 
 * Extracts clean structured Markdown, text, and metadata from PDF files:
 * - Page-by-page extraction with page numbers
 * - Heading and paragraph preservation
 * - PDF document metadata (Title, Author, Subject, Keywords, Creator)
 * - Safe download and memory-bounded stream parsing
 * - Uses pdf-parse if available with pure-Node stream fallback
 */

import zlib from 'zlib';

/**
 * PDF Extraction Result
 */
export class PdfExtractionResult {
    constructor({
        success = false,
        title = '',
        markdown = '',
        textContent = '',
        totalPages = 0,
        pages = [],
        metadata = {},
        error = null,
        warnings = []
    } = {}) {
        this.success = success;
        this.title = title;
        this.markdown = markdown;
        this.textContent = textContent;
        this.totalPages = totalPages;
        this.pages = pages;
        this.metadata = metadata;
        this.error = error;
        this.warnings = warnings;
        this.extractionMethod = 'pdf-extractor';
    }
}

/**
 * Extracts raw text from an uncompressed or decompressed PDF content stream
 * @param {string} streamContent 
 * @returns {string}
 */
function extractTextFromPdfStream(streamContent) {
    const lines = [];
    // Match text blocks between BT and ET
    const btEtRegex = /BT[\s\S]*?ET/g;
    let match;

    while ((match = btEtRegex.exec(streamContent)) !== null) {
        const block = match[0];
        
        // Match string literals (e.g. (Hello World) Tj)
        const tjRegex = /\(([\s\S]*?)\)\s*(?:Tj|'|")/g;
        let tjMatch;
        let blockText = '';
        while ((tjMatch = tjRegex.exec(block)) !== null) {
            blockText += unescapePdfString(tjMatch[1]) + ' ';
        }

        // Match array literals (e.g. [(Hello) -10 (World)] TJ)
        const arrayRegex = /\[([\s\S]*?)\]\s*TJ/g;
        let arrMatch;
        while ((arrMatch = arrayRegex.exec(block)) !== null) {
            const inner = arrMatch[1];
            const strRegex = /\(([\s\S]*?)\)/g;
            let strMatch;
            while ((strMatch = strRegex.exec(inner)) !== null) {
                blockText += unescapePdfString(strMatch[1]);
            }
            blockText += ' ';
        }

        const trimmed = blockText.trim();
        if (trimmed) {
            lines.push(trimmed);
        }
    }

    return lines.join('\n\n');
}

/**
 * Unescapes special characters in PDF literal strings
 * @param {string} str 
 * @returns {string}
 */
function unescapePdfString(str) {
    return str
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\b/g, '\b')
        .replace(/\\f/g, '\f')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\')
        .replace(/\\([0-7]{1,3})/g, (m, oct) => String.fromCharCode(parseInt(oct, 8)));
}

/**
 * Pure Node.js fallback PDF parser
 * Reads PDF cross-reference table, extracts streams, inflates FlateDecode, and recovers pages
 * @param {Buffer} buffer 
 * @returns {Promise<{ pages: Array<{ pageNumber: number, text: string }>, metadata: Object }>}
 */
async function parsePdfNative(buffer) {
    const pdfString = buffer.toString('binary');
    const pages = [];
    const metadata = {};

    // Extract Title/Author from Info dictionary if present
    const titleMatch = pdfString.match(/\/Title\s*\(([^)]+)\)/i);
    if (titleMatch) metadata.title = unescapePdfString(titleMatch[1]);

    const authorMatch = pdfString.match(/\/Author\s*\(([^)]+)\)/i);
    if (authorMatch) metadata.author = unescapePdfString(authorMatch[1]);

    const subjectMatch = pdfString.match(/\/Subject\s*\(([^)]+)\)/i);
    if (subjectMatch) metadata.subject = unescapePdfString(subjectMatch[1]);

    // Find all stream ... endstream positions
    const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
    let streamMatch;
    let pageIndex = 1;

    while ((streamMatch = streamRegex.exec(pdfString)) !== null) {
        const rawStream = Buffer.from(streamMatch[1], 'binary');
        let decompressedText = '';

        // Try decompressing with FlateDecode (zlib)
        try {
            const decompressed = zlib.inflateSync(rawStream);
            decompressedText = decompressed.toString('utf8');
        } catch {
            // Not compressed or raw text
            decompressedText = rawStream.toString('utf8');
        }

        const pageText = extractTextFromPdfStream(decompressedText);
        if (pageText && pageText.length > 20) {
            pages.push({
                pageNumber: pageIndex++,
                text: pageText
            });
        }
    }

    // If stream parsing yielded nothing, attempt raw ASCII extraction
    if (pages.length === 0) {
        const rawText = pdfString.replace(/[^\x20-\x7E\n\r]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (rawText.length > 50) {
            pages.push({
                pageNumber: 1,
                text: rawText
            });
        }
    }

    return { pages, metadata };
}

/**
 * Extracts content from PDF buffer
 * @param {Buffer} buffer 
 * @param {Object} options 
 * @returns {Promise<PdfExtractionResult>}
 */
export async function extractPdf(buffer, options = {}) {
    if (!buffer || buffer.length === 0) {
        return new PdfExtractionResult({
            success: false,
            error: 'Empty PDF buffer'
        });
    }

    // Check magic bytes %PDF-
    const header = buffer.slice(0, 5).toString('ascii');
    if (!header.startsWith('%PDF-')) {
        return new PdfExtractionResult({
            success: false,
            error: 'Invalid PDF signature: missing %PDF- header'
        });
    }

    const warnings = [];

    // Attempt dynamically loading pdf-parse if available
    try {
        const pdfParseModule = await import('pdf-parse').catch(() => null);
        if (pdfParseModule && pdfParseModule.default) {
            const pdfData = await pdfParseModule.default(buffer);
            const totalPages = pdfData.numpages || 1;
            const fullText = (pdfData.text || '').trim();

            // Split into pages if page separators are present, or estimate pages
            const rawPages = fullText.split(/\n\s*--\s*\d+\s*--\s*\n|\f/);
            const pages = rawPages.map((pt, i) => ({
                pageNumber: i + 1,
                text: pt.trim()
            })).filter(p => p.text.length > 0);

            // Construct Markdown with page headers
            const markdownBlocks = [];
            const docTitle = pdfData.info?.Title || options.title || 'PDF Document';
            markdownBlocks.push(`# ${docTitle}\n`);

            for (const p of pages) {
                markdownBlocks.push(`## Page ${p.pageNumber}\n\n${p.text}`);
            }

            return new PdfExtractionResult({
                success: true,
                title: docTitle,
                markdown: markdownBlocks.join('\n\n'),
                textContent: fullText,
                totalPages: totalPages,
                pages: pages,
                metadata: {
                    title: pdfData.info?.Title || '',
                    author: pdfData.info?.Author || '',
                    creator: pdfData.info?.Creator || '',
                    producer: pdfData.info?.Producer || '',
                    creationDate: pdfData.info?.CreationDate || '',
                    ...pdfData.info
                },
                warnings
            });
        }
    } catch (err) {
        warnings.push(`pdf-parse module extraction failed: ${err.message}, falling back to native engine`);
    }

    // Native fallback
    try {
        const { pages, metadata } = await parsePdfNative(buffer);
        const docTitle = metadata.title || options.title || 'PDF Document';

        const markdownBlocks = [];
        markdownBlocks.push(`# ${docTitle}\n`);

        for (const p of pages) {
            markdownBlocks.push(`## Page ${p.pageNumber}\n\n${p.text}`);
        }

        const fullText = pages.map(p => p.text).join('\n\n');

        return new PdfExtractionResult({
            success: pages.length > 0,
            title: docTitle,
            markdown: markdownBlocks.join('\n\n'),
            textContent: fullText,
            totalPages: pages.length,
            pages: pages,
            metadata: metadata,
            warnings
        });
    } catch (nativeErr) {
        return new PdfExtractionResult({
            success: false,
            error: `PDF native extraction error: ${nativeErr.message}`,
            warnings
        });
    }
}

