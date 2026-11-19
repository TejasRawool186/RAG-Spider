/**
 * Plain Text and Structured File Extraction Service for RAG Spider
 * 
 * Supports:
 * - Plain text (.txt)
 * - Markdown (.md, .markdown)
 * - CSV (.csv) -> Formatted Markdown tables
 * - JSON (.json) -> Structured Markdown
 * - XML (.xml) -> Clean tag and content hierarchy
 */

export class TextFileExtractionResult {
    constructor({
        success = false,
        title = '',
        markdown = '',
        textContent = '',
        format = 'text',
        metadata = {},
        error = null,
        warnings = []
    } = {}) {
        this.success = success;
        this.title = title;
        this.markdown = markdown;
        this.textContent = textContent;
        this.format = format;
        this.metadata = metadata;
        this.error = error;
        this.warnings = warnings;
        this.extractionMethod = `${format}-extractor`;
    }
}

/**
 * Extracts content from raw text or Markdown string/buffer
 * @param {string|Buffer} content 
 * @param {string} format 'txt' | 'md'
 * @param {Object} options 
 * @returns {TextFileExtractionResult}
 */
export function extractTextOrMarkdown(content, format = 'txt', options = {}) {
    const rawStr = Buffer.isBuffer(content) ? content.toString('utf8') : String(content || '');
    if (!rawStr.trim()) {
        return new TextFileExtractionResult({
            success: false,
            error: 'Empty text file content'
        });
    }

    let title = options.title || '';
    let markdown = rawStr;

    // Check for YAML frontmatter
    let metadata = {};
    if (rawStr.startsWith('---')) {
        const endFrontmatter = rawStr.indexOf('\n---', 3);
        if (endFrontmatter !== -1) {
            const yamlStr = rawStr.slice(3, endFrontmatter).trim();
            markdown = rawStr.slice(endFrontmatter + 4).trim();
            
            // Simple key-value parser for frontmatter
            yamlStr.split('\n').forEach(line => {
                const colonIdx = line.indexOf(':');
                if (colonIdx > 0) {
                    const key = line.slice(0, colonIdx).trim();
                    const val = line.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
                    metadata[key] = val;
                    if (key.toLowerCase() === 'title' && !title) {
                        title = val;
                    }
                }
            });
        }
    }

    // Try finding title from first H1 or first non-empty line
    if (!title) {
        const h1Match = markdown.match(/^#\s+(.+)$/m);
        if (h1Match) {
            title = h1Match[1].trim();
        } else {
            const firstLine = markdown.split('\n').map(l => l.trim()).find(Boolean) || '';
            title = firstLine.slice(0, 60);
        }
    }

    if (format === 'txt' && !markdown.startsWith('#')) {
        markdown = `# ${title || 'Document'}\n\n${markdown}`;
    }

    const textContent = markdown.replace(/[#*`_|-]/g, '').replace(/\s+/g, ' ').trim();

    return new TextFileExtractionResult({
        success: true,
        title: title || 'Document',
        markdown,
        textContent,
        format,
        metadata
    });
}

/**
 * Parses RFC 4180 CSV content into clean Markdown tables
 * @param {string|Buffer} content 
 * @param {Object} options 
 * @returns {TextFileExtractionResult}
 */
export function extractCsv(content, options = {}) {
    const rawStr = Buffer.isBuffer(content) ? content.toString('utf8') : String(content || '');
    if (!rawStr.trim()) {
        return new TextFileExtractionResult({
            success: false,
            error: 'Empty CSV content'
        });
    }

    const rows = parseCsvRows(rawStr);
    if (rows.length === 0) {
        return new TextFileExtractionResult({
            success: false,
            error: 'Could not parse any rows from CSV'
        });
    }

    const title = options.title || 'CSV Data Table';
    const maxCols = Math.max(...rows.map(r => r.length));
    const headerRow = rows[0].map(c => c.trim() || 'Column');
    while (headerRow.length < maxCols) headerRow.push('-');

    const separatorRow = new Array(maxCols).fill('---');
    const mdLines = [
        `# ${title}\n`,
        `*Total rows: ${rows.length - 1} | Total columns: ${maxCols}*\n`,
        '| ' + headerRow.join(' | ') + ' |',
        '| ' + separatorRow.join(' | ') + ' |'
    ];

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        while (row.length < maxCols) row.push('');
        mdLines.push('| ' + row.map(c => c.replace(/\|/g, '\\|').trim()).join(' | ') + ' |');
    }

    const markdown = mdLines.join('\n');
    const textContent = rows.map(r => r.join(' ')).join('\n');

    return new TextFileExtractionResult({
        success: true,
        title,
        markdown,
        textContent,
        format: 'csv',
        metadata: {
            rowCount: rows.length,
            columnCount: maxCols,
            headers: headerRow
        }
    });
}

/**
 * Lightweight RFC 4180 CSV line parser
 * @param {string} text 
 * @returns {string[][]}
 */
function parseCsvRows(text) {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentCell += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            currentRow.push(currentCell);
            currentCell = '';
        } else if ((char === '\r' || char === '\n') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') i++;
            currentRow.push(currentCell);
            currentCell = '';
            if (currentRow.some(c => c.trim().length > 0)) {
                rows.push(currentRow);
            }
            currentRow = [];
        } else {
            currentCell += char;
        }
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
        currentRow.push(currentCell);
        if (currentRow.some(c => c.trim().length > 0)) {
            rows.push(currentRow);
        }
    }

    return rows;
}

/**
 * Parses JSON documents into readable Markdown for RAG
 * @param {string|Buffer} content 
 * @param {Object} options 
 * @returns {TextFileExtractionResult}
 */
export function extractJson(content, options = {}) {
    const rawStr = Buffer.isBuffer(content) ? content.toString('utf8') : String(content || '');
    if (!rawStr.trim()) {
        return new TextFileExtractionResult({
            success: false,
            error: 'Empty JSON content'
        });
    }

    try {
        const parsed = JSON.parse(rawStr);
        const title = options.title || parsed.title || parsed.name || 'JSON Dataset';
        
        let md = `# ${title}\n\n`;

        if (Array.isArray(parsed)) {
            md += `*Array containing ${parsed.length} records:*\n\n`;
            if (parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
                // Render as table if uniform objects
                const keys = Object.keys(parsed[0]);
                if (keys.length > 0 && keys.length <= 10) {
                    md += '| ' + keys.join(' | ') + ' |\n';
                    md += '| ' + keys.map(() => '---').join(' | ') + ' |\n';
                    for (const item of parsed.slice(0, 500)) {
                        md += '| ' + keys.map(k => String(item[k] ?? '').replace(/\|/g, '\\|')).join(' | ') + ' |\n';
                    }
                } else {
                    md += '```json\n' + JSON.stringify(parsed, null, 2) + '\n```\n';
                }
            } else {
                md += '```json\n' + JSON.stringify(parsed, null, 2) + '\n```\n';
            }
        } else if (typeof parsed === 'object' && parsed !== null) {
            md += '## Properties\n\n';
            for (const [k, v] of Object.entries(parsed)) {
                if (typeof v === 'object' && v !== null) {
                    md += `### ${k}\n\n\`\`\`json\n${JSON.stringify(v, null, 2)}\n\`\`\`\n\n`;
                } else {
                    md += `- **${k}**: ${v}\n`;
                }
            }
        } else {
            md += String(parsed);
        }

        return new TextFileExtractionResult({
            success: true,
            title,
            markdown: md.trim(),
            textContent: rawStr,
            format: 'json',
            metadata: {
                isJson: true,
                keys: typeof parsed === 'object' && parsed !== null ? Object.keys(parsed) : []
            }
        });
    } catch (err) {
        return new TextFileExtractionResult({
            success: false,
            error: `JSON parse error: ${err.message}`
        });
    }
}

/**
 * Parses XML documents into structured Markdown
 * @param {string|Buffer} content 
 * @param {Object} options 
 * @returns {TextFileExtractionResult}
 */
export function extractXml(content, options = {}) {
    const rawStr = Buffer.isBuffer(content) ? content.toString('utf8') : String(content || '');
    if (!rawStr.trim()) {
        return new TextFileExtractionResult({
            success: false,
            error: 'Empty XML content'
        });
    }

    const title = options.title || 'XML Document';
    
    // Clean and extract elements
    const tagRegex = /<([a-zA-Z0-9_\-:]+)(?:\s+[^>]*?)?>([\s\S]*?)<\/\1>/g;
    let match;
    const lines = [`# ${title}\n`];
    let tagCount = 0;

    while ((match = tagRegex.exec(rawStr)) !== null && tagCount < 1000) {
        const tag = match[1];
        const inner = match[2].trim();
        // If inner text does not contain nested tags
        if (inner && !inner.includes('<')) {
            lines.push(`- **${tag}**: ${inner}`);
            tagCount++;
        }
    }

    if (lines.length === 1) {
        // Fallback: wrap raw XML in fenced code block
        lines.push('```xml\n' + rawStr + '\n```');
    }

    const markdown = lines.join('\n');
    const textContent = rawStr.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    return new TextFileExtractionResult({
        success: true,
        title,
        markdown,
        textContent,
        format: 'xml',
        metadata: {
            isXml: true
        }
    });
}

