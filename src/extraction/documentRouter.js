/**
 * Multi-Format Document Router for RAG Spider
 * 
 * Automatically detects content type and routes resources to the appropriate parser:
 * - HTML / Dynamic JS Webpages
 * - PDF documents
 * - Word documents (.docx)
 * - Plain text (.txt) and Markdown (.md)
 * - CSV data tables (.csv)
 * - Structured JSON (.json)
 * - XML documents (.xml)
 * 
 * Features:
 * - Content-Type header analysis
 * - File extension detection
 * - File signature / magic byte inspection
 * - Safe download size limits
 * - Explicit unsupported format reporting
 */

import { extractPdf } from './pdfExtractor.js';
import { extractDocx } from './docxExtractor.js';
import { extractTextOrMarkdown, extractCsv, extractJson, extractXml } from './textFileExtractor.js';
import { extractFileExtension } from '../utils/urlUtils.js';

export const SupportedFormats = {
    HTML: 'html',
    PDF: 'pdf',
    DOCX: 'docx',
    TXT: 'txt',
    MD: 'md',
    CSV: 'csv',
    JSON: 'json',
    XML: 'xml',
    UNKNOWN: 'unknown'
};

/**
 * Result of document routing and extraction
 */
export class DocumentRouterResult {
    constructor({
        success = false,
        format = SupportedFormats.UNKNOWN,
        title = '',
        markdown = '',
        textContent = '',
        totalPages = null,
        metadata = {},
        headings = [],
        tables = [],
        error = null,
        warnings = [],
        extractionMethod = ''
    } = {}) {
        this.success = success;
        this.format = format;
        this.title = title;
        this.markdown = markdown;
        this.textContent = textContent;
        this.totalPages = totalPages;
        this.metadata = metadata;
        this.headings = headings;
        this.tables = tables;
        this.error = error;
        this.warnings = warnings;
        this.extractionMethod = extractionMethod || `${format}-router`;
    }
}

/**
 * Detects the document format from MIME type, URL extension, and buffer signature
 * @param {string} mimeType 
 * @param {string} url 
 * @param {Buffer|string} bufferOrString 
 * @returns {string} One of SupportedFormats
 */
export function detectDocumentFormat(mimeType = '', url = '', bufferOrString = null) {
    const cleanMime = (mimeType || '').toLowerCase().split(';')[0].trim();
    const ext = extractFileExtension(url);

    // 1. Check Magic bytes if buffer is available
    if (Buffer.isBuffer(bufferOrString) && bufferOrString.length >= 4) {
        // PDF signature: %PDF-
        if (bufferOrString.slice(0, 5).toString('ascii').startsWith('%PDF-')) {
            return SupportedFormats.PDF;
        }
        // ZIP/DOCX signature: PK\x03\x04
        if (bufferOrString.readUInt32LE(0) === 0x04034b50) {
            if (ext === 'docx' || cleanMime.includes('wordprocessingml') || cleanMime.includes('msword')) {
                return SupportedFormats.DOCX;
            }
        }
    }

    // 2. Check MIME type
    if (cleanMime.includes('pdf')) return SupportedFormats.PDF;
    if (cleanMime.includes('wordprocessingml') || cleanMime.includes('msword') || cleanMime.includes('docx')) return SupportedFormats.DOCX;
    if (cleanMime.includes('html')) return SupportedFormats.HTML;
    if (cleanMime.includes('csv')) return SupportedFormats.CSV;
    if (cleanMime.includes('json')) return SupportedFormats.JSON;
    if (cleanMime.includes('xml')) return SupportedFormats.XML;
    if (cleanMime.includes('markdown')) return SupportedFormats.MD;
    if (cleanMime.includes('text/plain')) {
        if (ext === 'md' || ext === 'markdown') return SupportedFormats.MD;
        if (ext === 'csv') return SupportedFormats.CSV;
        if (ext === 'json') return SupportedFormats.JSON;
        if (ext === 'xml') return SupportedFormats.XML;
        return SupportedFormats.TXT;
    }

    // 3. Check URL extension
    switch (ext) {
        case 'pdf': return SupportedFormats.PDF;
        case 'docx': return SupportedFormats.DOCX;
        case 'html':
        case 'htm': return SupportedFormats.HTML;
        case 'md':
        case 'markdown': return SupportedFormats.MD;
        case 'csv': return SupportedFormats.CSV;
        case 'json': return SupportedFormats.JSON;
        case 'xml': return SupportedFormats.XML;
        case 'txt': return SupportedFormats.TXT;
    }

    // Default to HTML for web crawlers if text
    if (typeof bufferOrString === 'string' && (bufferOrString.includes('<html') || bufferOrString.includes('<!DOCTYPE'))) {
        return SupportedFormats.HTML;
    }

    return SupportedFormats.UNKNOWN;
}

/**
 * Routes and extracts content from a document buffer or string
 * @param {Buffer|string} content 
 * @param {Object} context 
 * @returns {Promise<DocumentRouterResult>}
 */
export async function routeAndExtractDocument(content, context = {}) {
    const { url = '', mimeType = '', title = '', maximumDownloadSize = 10 * 1024 * 1024 } = context;

    // Validate size limit
    const byteLength = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content || '', 'utf8');
    if (byteLength > maximumDownloadSize) {
        return new DocumentRouterResult({
            success: false,
            error: `Document size (${Math.round(byteLength / 1024)} KB) exceeds maximum allowed size (${Math.round(maximumDownloadSize / 1024)} KB)`
        });
    }

    const format = detectDocumentFormat(mimeType, url, content);

    switch (format) {
        case SupportedFormats.PDF: {
            const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
            const pdfRes = await extractPdf(buf, { title, url });
            return new DocumentRouterResult({
                success: pdfRes.success,
                format: SupportedFormats.PDF,
                title: pdfRes.title || title || 'PDF Document',
                markdown: pdfRes.markdown,
                textContent: pdfRes.textContent,
                totalPages: pdfRes.totalPages,
                metadata: pdfRes.metadata,
                error: pdfRes.error,
                warnings: pdfRes.warnings,
                extractionMethod: pdfRes.extractionMethod
            });
        }

        case SupportedFormats.DOCX: {
            const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
            const docxRes = await extractDocx(buf, { title, url });
            return new DocumentRouterResult({
                success: docxRes.success,
                format: SupportedFormats.DOCX,
                title: docxRes.title || title || 'Word Document',
                markdown: docxRes.markdown,
                textContent: docxRes.textContent,
                headings: docxRes.headings,
                metadata: docxRes.metadata,
                error: docxRes.error,
                warnings: docxRes.warnings,
                extractionMethod: docxRes.extractionMethod
            });
        }

        case SupportedFormats.CSV: {
            const csvRes = extractCsv(content, { title, url });
            return new DocumentRouterResult({
                success: csvRes.success,
                format: SupportedFormats.CSV,
                title: csvRes.title || title || 'CSV Table',
                markdown: csvRes.markdown,
                textContent: csvRes.textContent,
                metadata: csvRes.metadata,
                error: csvRes.error,
                extractionMethod: csvRes.extractionMethod
            });
        }

        case SupportedFormats.JSON: {
            const jsonRes = extractJson(content, { title, url });
            return new DocumentRouterResult({
                success: jsonRes.success,
                format: SupportedFormats.JSON,
                title: jsonRes.title || title || 'JSON Data',
                markdown: jsonRes.markdown,
                textContent: jsonRes.textContent,
                metadata: jsonRes.metadata,
                error: jsonRes.error,
                extractionMethod: jsonRes.extractionMethod
            });
        }

        case SupportedFormats.XML: {
            const xmlRes = extractXml(content, { title, url });
            return new DocumentRouterResult({
                success: xmlRes.success,
                format: SupportedFormats.XML,
                title: xmlRes.title || title || 'XML Document',
                markdown: xmlRes.markdown,
                textContent: xmlRes.textContent,
                metadata: xmlRes.metadata,
                error: xmlRes.error,
                extractionMethod: xmlRes.extractionMethod
            });
        }

        case SupportedFormats.MD:
        case SupportedFormats.TXT: {
            const txtRes = extractTextOrMarkdown(content, format, { title, url });
            return new DocumentRouterResult({
                success: txtRes.success,
                format,
                title: txtRes.title || title || 'Text Document',
                markdown: txtRes.markdown,
                textContent: txtRes.textContent,
                metadata: txtRes.metadata,
                error: txtRes.error,
                extractionMethod: txtRes.extractionMethod
            });
        }

        case SupportedFormats.HTML:
            // Routed through contentExtractor in the caller
            return new DocumentRouterResult({
                success: true,
                format: SupportedFormats.HTML,
                extractionMethod: 'html-pipeline'
            });

        default:
            return new DocumentRouterResult({
                success: false,
                format: SupportedFormats.UNKNOWN,
                error: `Unsupported content format (MIME: ${mimeType || 'unknown'}, URL: ${url})`
            });
    }
}

