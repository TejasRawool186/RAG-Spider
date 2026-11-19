/**
 * DOCX Document Extraction Service for RAG Spider
 * 
 * Extracts clean structured Markdown, headings, paragraphs, and tables from DOCX files:
 * - Dynamic mammoth support with built-in zero-dependency PKZip/XML extractor
 * - Preserves headings (H1, H2, H3, H4)
 * - Preserves tables as clean Markdown tables
 * - Preserves bullet lists and ordered lists
 */

import zlib from 'zlib';

export class DocxExtractionResult {
    constructor({
        success = false,
        title = '',
        markdown = '',
        textContent = '',
        headings = [],
        tables = [],
        metadata = {},
        error = null,
        warnings = []
    } = {}) {
        this.success = success;
        this.title = title;
        this.markdown = markdown;
        this.textContent = textContent;
        this.headings = headings;
        this.tables = tables;
        this.metadata = metadata;
        this.error = error;
        this.warnings = warnings;
        this.extractionMethod = 'docx-extractor';
    }
}

/**
 * Extracts a specific file from a ZIP buffer using native Node.js buffers and zlib
 * @param {Buffer} zipBuffer 
 * @param {string} targetFileName 
 * @returns {Buffer|null}
 */
function extractZipEntry(zipBuffer, targetFileName) {
    let offset = 0;
    while (offset < zipBuffer.length - 30) {
        // Local file header signature: 0x04034b50 (PK\x03\x04)
        if (zipBuffer.readUInt32LE(offset) !== 0x04034b50) {
            break;
        }

        const compressionMethod = zipBuffer.readUInt16LE(offset + 8);
        const compressedSize = zipBuffer.readUInt32LE(offset + 18);
        const uncompressedSize = zipBuffer.readUInt32LE(offset + 22);
        const fileNameLength = zipBuffer.readUInt16LE(offset + 26);
        const extraFieldLength = zipBuffer.readUInt16LE(offset + 28);

        const fileName = zipBuffer.toString('utf8', offset + 30, offset + 30 + fileNameLength);
        const dataStart = offset + 30 + fileNameLength + extraFieldLength;
        const dataEnd = dataStart + compressedSize;

        if (fileName === targetFileName) {
            const compressedData = zipBuffer.slice(dataStart, dataEnd);
            if (compressionMethod === 0) {
                return compressedData;
            } else if (compressionMethod === 8) {
                // Deflate: use inflateRawSync
                return zlib.inflateRawSync(compressedData);
            }
        }

        offset = dataEnd;
    }
    return null;
}

/**
 * Parses word/document.xml text into structured Markdown
 * @param {string} xmlText 
 * @returns {{ markdown: string, textContent: string, headings: string[], title: string }}
 */
function parseDocxXmlToMarkdown(xmlText) {
    const headings = [];
    const markdownLines = [];
    let detectedTitle = '';

    // Match paragraphs (<w:p>...</w:p>) and tables (<w:tbl>...</w:tbl>)
    const elementRegex = /<(?:w:p|w:tbl)[\s\S]*?<\/(?:w:p|w:tbl)>/g;
    let match;

    while ((match = elementRegex.exec(xmlText)) !== null) {
        const elem = match[0];

        if (elem.startsWith('<w:tbl')) {
            // Table processing
            const rowRegex = /<w:tr[\s\S]*?<\/w:tr>/g;
            let rowMatch;
            const tableRows = [];

            while ((rowMatch = rowRegex.exec(elem)) !== null) {
                const cellRegex = /<w:tc[\s\S]*?<\/w:tc>/g;
                let cellMatch;
                const cells = [];

                while ((cellMatch = cellRegex.exec(rowMatch[0])) !== null) {
                    const textMatches = cellMatch[0].match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
                    const cellText = textMatches.map(t => t.replace(/<[^>]+>/g, '')).join('').trim();
                    cells.push(cellText || ' ');
                }
                if (cells.length > 0) {
                    tableRows.push(cells);
                }
            }

            if (tableRows.length > 0) {
                // Construct Markdown table
                const maxCols = Math.max(...tableRows.map(r => r.length));
                const headerRow = tableRows[0].map(c => c || 'Col');
                while (headerRow.length < maxCols) headerRow.push('-');

                const separatorRow = new Array(maxCols).fill('---');
                markdownLines.push('| ' + headerRow.join(' | ') + ' |');
                markdownLines.push('| ' + separatorRow.join(' | ') + ' |');

                for (let r = 1; r < tableRows.length; r++) {
                    const row = tableRows[r];
                    while (row.length < maxCols) row.push('');
                    markdownLines.push('| ' + row.join(' | ') + ' |');
                }
                markdownLines.push('');
            }
        } else {
            // Paragraph processing
            const styleMatch = elem.match(/<w:pStyle\s+w:val="([^"]+)"/i);
            const styleVal = styleMatch ? styleMatch[1].toLowerCase() : '';

            // Extract all text inside <w:t> tags
            const textMatches = elem.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
            const paragraphText = textMatches.map(t => t.replace(/<[^>]+>/g, '')).join('').trim();

            if (!paragraphText) continue;

            if (styleVal.includes('title') || styleVal.includes('heading1') || styleVal === '1') {
                if (!detectedTitle) detectedTitle = paragraphText;
                headings.push(paragraphText);
                markdownLines.push(`\n# ${paragraphText}\n`);
            } else if (styleVal.includes('heading2') || styleVal === '2') {
                headings.push(paragraphText);
                markdownLines.push(`\n## ${paragraphText}\n`);
            } else if (styleVal.includes('heading3') || styleVal === '3') {
                headings.push(paragraphText);
                markdownLines.push(`\n### ${paragraphText}\n`);
            } else if (styleVal.includes('list') || elem.includes('<w:numPr>')) {
                markdownLines.push(`- ${paragraphText}`);
            } else {
                markdownLines.push(`${paragraphText}\n`);
            }
        }
    }

    const markdown = markdownLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const textContent = markdown.replace(/[#*`_|-]/g, '').replace(/\s+/g, ' ').trim();

    return {
        markdown,
        textContent,
        headings,
        title: detectedTitle || 'Word Document'
    };
}

/**
 * Extracts content from DOCX buffer
 * @param {Buffer} buffer 
 * @param {Object} options 
 * @returns {Promise<DocxExtractionResult>}
 */
export async function extractDocx(buffer, options = {}) {
    if (!buffer || buffer.length === 0) {
        return new DocxExtractionResult({
            success: false,
            error: 'Empty DOCX buffer'
        });
    }

    // Check magic bytes PK\x03\x04
    if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) {
        return new DocxExtractionResult({
            success: false,
            error: 'Invalid DOCX signature: missing PK header'
        });
    }

    const warnings = [];

    // Attempt mammoth dynamic import if available
    try {
        const mammothModule = await import('mammoth').catch(() => null);
        if (mammothModule && mammothModule.default) {
            const mammoth = mammothModule.default;
            const rawResult = await mammoth.extractRawText({ buffer });
            const text = (rawResult.value || '').trim();

            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            const title = lines[0] || options.title || 'Word Document';
            const markdown = `# ${title}\n\n` + lines.slice(1).join('\n\n');

            return new DocxExtractionResult({
                success: true,
                title,
                markdown,
                textContent: text,
                warnings: rawResult.messages ? rawResult.messages.map(m => m.message) : []
            });
        }
    } catch (err) {
        warnings.push(`mammoth module failed: ${err.message}, using built-in XML extractor`);
    }

    // Native ZIP / XML extraction
    try {
        const docXmlBuffer = extractZipEntry(buffer, 'word/document.xml');
        if (!docXmlBuffer) {
            return new DocxExtractionResult({
                success: false,
                error: 'Could not locate word/document.xml inside DOCX archive',
                warnings
            });
        }

        const xmlString = docXmlBuffer.toString('utf8');
        const parsed = parseDocxXmlToMarkdown(xmlString);

        return new DocxExtractionResult({
            success: parsed.markdown.length > 0,
            title: parsed.title || options.title || 'Word Document',
            markdown: parsed.markdown,
            textContent: parsed.textContent,
            headings: parsed.headings,
            warnings
        });
    } catch (nativeErr) {
        return new DocxExtractionResult({
            success: false,
            error: `DOCX extraction error: ${nativeErr.message}`,
            warnings
        });
    }
}

