/**
 * Technical Content Intelligence Extractor for RAG Spider
 * 
 * Preserves, identifies, and categorizes technical content in documentation:
 * - Code blocks with syntax languages
 * - Shell commands (bash, curl, npm, pip)
 * - API request / response examples
 * - Configuration files (YAML, JSON, TOML)
 * - Mathematical formulas (LaTeX expressions)
 * - Markdown tables and nested lists
 */

/**
 * Recognized programming and configuration languages
 */
const KNOWN_LANGUAGES = new Set([
    'javascript', 'js', 'typescript', 'ts', 'python', 'py', 'bash', 'sh', 'shell',
    'powershell', 'ps1', 'json', 'yaml', 'yml', 'xml', 'html', 'css', 'scss',
    'sql', 'c', 'cpp', 'csharp', 'cs', 'java', 'kotlin', 'swift', 'go', 'rust',
    'ruby', 'php', 'dockerfile', 'graphql', 'toml', 'ini', 'r', 'scala', 'dart'
]);

/**
 * Extracts and analyzes technical content from Markdown
 * @param {string} markdown 
 * @returns {Object} Technical content metadata and structure
 */
export function extractTechnicalContent(markdown) {
    if (!markdown || typeof markdown !== 'string') {
        return {
            hasCode: false,
            codeBlocks: [],
            languages: [],
            shellCommands: [],
            apiExamples: [],
            hasMath: false,
            mathExpressions: [],
            tableCount: 0
        };
    }

    const codeBlocks = [];
    const languages = new Set();
    const shellCommands = [];
    const apiExamples = [];

    // Fenced code blocks regex: ```[lang]\n[code]\n```
    const codeBlockRegex = /```([a-zA-Z0-9_\-+]*)\n([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(markdown)) !== null) {
        let lang = (match[1] || '').trim().toLowerCase();
        const code = match[2];

        // Language normalization
        if (!lang) {
            lang = inferCodeLanguage(code);
        }
        if (lang) {
            languages.add(lang);
        }

        const blockInfo = {
            language: lang || 'text',
            lines: code.split('\n').length,
            characterCount: code.length,
            isShell: isShellCommand(lang, code),
            isApi: isApiExample(code)
        };

        codeBlocks.push(blockInfo);

        if (blockInfo.isShell) {
            shellCommands.push(code.trim().slice(0, 300));
        }
        if (blockInfo.isApi) {
            apiExamples.push(code.trim().slice(0, 500));
        }
    }

    // Inline code count
    const inlineCodeMatches = markdown.match(/`[^`\n]+`/g) || [];

    // Math expressions: $$ ... $$ or $ ... $
    const mathExpressions = [];
    const mathBlockRegex = /\$\$([\s\S]*?)\$\$/g;
    let mathMatch;
    while ((mathMatch = mathBlockRegex.exec(markdown)) !== null) {
        mathExpressions.push(mathMatch[1].trim());
    }

    // Markdown tables count
    const tableMatches = markdown.match(/\|[^\n]+\|\n\|[\s\-:|]+\|/g) || [];

    return {
        hasCode: codeBlocks.length > 0 || inlineCodeMatches.length > 0,
        codeBlockCount: codeBlocks.length,
        inlineCodeCount: inlineCodeMatches.length,
        languages: Array.from(languages),
        codeBlocks: codeBlocks.slice(0, 50),
        shellCommands: shellCommands.slice(0, 20),
        apiExamples: apiExamples.slice(0, 20),
        hasMath: mathExpressions.length > 0,
        mathExpressionCount: mathExpressions.length,
        tableCount: tableMatches.length,
        density: {
            codeToTextRatio: calculateCodeRatio(markdown, codeBlocks)
        }
    };
}

/**
 * Infers code language from snippet contents if missing in fence
 * @param {string} code 
 * @returns {string}
 */
function inferCodeLanguage(code) {
    const trimmed = code.trim();
    if (/^(npm|pnpm|yarn|npx|pip|curl|git|docker|cargo|brew)\s+/m.test(trimmed)) return 'bash';
    if (/^(import\s+.*from|const\s+\w+\s*=|let\s+\w+\s*=|function\s+\w+\()/m.test(trimmed)) return 'javascript';
    if (/^(def\s+\w+\(|import\s+\w+|from\s+\w+\s+import)/m.test(trimmed)) return 'python';
    if (/^(\{|\s*"[\w\-]+":)/m.test(trimmed)) return 'json';
    if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE)\s+/im.test(trimmed)) return 'sql';
    if (/^<[a-zA-Z0-9_\-]+.*>$/m.test(trimmed)) return 'xml';
    return '';
}

/**
 * Checks if code block represents shell commands
 * @param {string} lang 
 * @param {string} code 
 * @returns {boolean}
 */
function isShellCommand(lang, code) {
    if (['bash', 'sh', 'shell', 'zsh', 'powershell'].includes(lang)) return true;
    return /^\s*(?:\$|#|>|curl|npm|git|docker|pip|kubectl)\s+/m.test(code);
}

/**
 * Checks if code block represents HTTP/REST API request or response
 * @param {string} code 
 * @returns {boolean}
 */
function isApiExample(code) {
    return /^(GET|POST|PUT|DELETE|PATCH)\s+\/|HTTP\/1\.[01]\s+\d{3}|"status":\s*\d+|"error":\s*\{/im.test(code);
}

/**
 * Calculates code to text ratio
 * @param {string} markdown 
 * @param {Array} codeBlocks 
 * @returns {number}
 */
function calculateCodeRatio(markdown, codeBlocks) {
    if (!markdown.length) return 0;
    const totalCodeChars = codeBlocks.reduce((sum, b) => sum + b.characterCount, 0);
    return Math.round((totalCodeChars / markdown.length) * 100) / 100;
}

