/**
 * Deterministic Content Classification Service for RAG Spider
 * 
 * Classifies web and document content into specialized technical taxonomy without external AI APIs:
 * - technical_documentation
 * - api_reference
 * - tutorial
 * - installation_guide
 * - troubleshooting_guide
 * - faq
 * - blog_article
 * - release_notes
 * - changelog
 * - product_documentation
 * - code_example
 * - general_webpage
 * - unknown
 */

export const ContentType = {
    TECHNICAL_DOCUMENTATION: 'technical_documentation',
    API_REFERENCE: 'api_reference',
    TUTORIAL: 'tutorial',
    INSTALLATION_GUIDE: 'installation_guide',
    TROUBLESHOOTING_GUIDE: 'troubleshooting_guide',
    FAQ: 'faq',
    BLOG_ARTICLE: 'blog_article',
    RELEASE_NOTES: 'release_notes',
    CHANGELOG: 'changelog',
    PRODUCT_DOCUMENTATION: 'product_documentation',
    CODE_EXAMPLE: 'code_example',
    GENERAL_WEBPAGE: 'general_webpage',
    UNKNOWN: 'unknown'
};

export class ClassificationResult {
    constructor({
        contentType = ContentType.GENERAL_WEBPAGE,
        classificationConfidence = 0.5,
        classificationEvidence = []
    } = {}) {
        this.contentType = contentType;
        this.classificationConfidence = classificationConfidence;
        this.classificationEvidence = classificationEvidence;
    }
}

/**
 * Classifies document content based on URL, title, headings, code blocks, and text signals
 * @param {Object} input 
 * @param {string} input.url 
 * @param {string} input.title 
 * @param {string} input.markdown 
 * @param {string[]} input.headings 
 * @param {Object} input.metadata 
 * @returns {ClassificationResult}
 */
export function classifyContent({ url = '', title = '', markdown = '', headings = [], metadata = {} } = {}) {
    const urlLower = (url || '').toLowerCase();
    const titleLower = (title || '').toLowerCase();
    const textLower = (markdown || '').slice(0, 5000).toLowerCase();
    const headingsLower = (headings || []).map(h => String(h).toLowerCase());

    const scores = new Map();
    const evidenceMap = new Map();

    function addScore(type, points, reason) {
        scores.set(type, (scores.get(type) || 0) + points);
        if (!evidenceMap.has(type)) evidenceMap.set(type, []);
        evidenceMap.get(type).push(reason);
    }

    // 1. API Reference Signals
    if (urlLower.includes('/api') || urlLower.includes('/reference') || urlLower.includes('/endpoint')) {
        addScore(ContentType.API_REFERENCE, 35, 'URL contains /api/ or /reference/');
    }
    if (/\b(get|post|put|delete|patch)\s+\/[a-z0-9_\-\/]+/i.test(markdown)) {
        addScore(ContentType.API_REFERENCE, 30, 'Contains HTTP request method patterns');
    }
    if (titleLower.includes('api reference') || titleLower.includes('rest api') || titleLower.includes('sdk reference')) {
        addScore(ContentType.API_REFERENCE, 25, 'Title indicates API reference');
    }
    if (textLower.includes('request parameters') || textLower.includes('response body') || textLower.includes('status code')) {
        addScore(ContentType.API_REFERENCE, 20, 'Contains API parameter/response tables');
    }

    // 2. Installation Guide Signals
    if (urlLower.includes('/install') || urlLower.includes('/setup') || urlLower.includes('/getting-started')) {
        addScore(ContentType.INSTALLATION_GUIDE, 35, 'URL contains install/setup/getting-started');
    }
    if (titleLower.includes('installation') || titleLower.includes('installing') || titleLower.includes('quick start') || titleLower.includes('setup guide')) {
        addScore(ContentType.INSTALLATION_GUIDE, 30, 'Title indicates installation or setup');
    }
    if (/\b(npm install|pip install|brew install|docker run|yarn add|cargo install)\b/i.test(markdown)) {
        addScore(ContentType.INSTALLATION_GUIDE, 25, 'Contains package manager install commands');
    }
    if (headingsLower.some(h => h.includes('prerequisites') || h.includes('requirements') || h.includes('verification'))) {
        addScore(ContentType.INSTALLATION_GUIDE, 20, 'Headings contain installation prerequisites');
    }

    // 3. Troubleshooting Guide Signals
    if (urlLower.includes('/troubleshoot') || urlLower.includes('/errors') || urlLower.includes('/debugging')) {
        addScore(ContentType.TROUBLESHOOTING_GUIDE, 40, 'URL contains troubleshooting/error terms');
    }
    if (titleLower.includes('troubleshooting') || titleLower.includes('common errors') || titleLower.includes('diagnosing')) {
        addScore(ContentType.TROUBLESHOOTING_GUIDE, 35, 'Title indicates troubleshooting guide');
    }
    if (textLower.includes('error code') || textLower.includes('how to resolve') || textLower.includes('known issues')) {
        addScore(ContentType.TROUBLESHOOTING_GUIDE, 25, 'Content mentions resolution and error codes');
    }

    // 4. FAQ Signals
    if (urlLower.includes('/faq') || urlLower.includes('/frequently-asked-questions')) {
        addScore(ContentType.FAQ, 45, 'URL contains /faq/');
    }
    if (titleLower.includes('faq') || titleLower.includes('frequently asked questions')) {
        addScore(ContentType.FAQ, 35, 'Title indicates FAQ');
    }
    const questionHeadingCount = headingsLower.filter(h => h.endsWith('?') || h.startsWith('how') || h.startsWith('why') || h.startsWith('what')).length;
    if (questionHeadingCount >= 3) {
        addScore(ContentType.FAQ, 30, `Multiple question-style headings (${questionHeadingCount})`);
    }

    // 5. Changelog & Release Notes Signals
    if (urlLower.includes('changelog') || urlLower.includes('history.md')) {
        addScore(ContentType.CHANGELOG, 45, 'URL indicates changelog');
    }
    if (urlLower.includes('release-notes') || urlLower.includes('/releases')) {
        addScore(ContentType.RELEASE_NOTES, 45, 'URL indicates release notes');
    }
    if (/^##?\s+\[?v?\d+\.\d+(?:\.\d+)?\]?/m.test(markdown)) {
        addScore(ContentType.CHANGELOG, 30, 'Contains version release section headers');
    }

    // 6. Tutorial Signals
    if (urlLower.includes('/tutorial') || urlLower.includes('/guides/') || urlLower.includes('/how-to/')) {
        addScore(ContentType.TUTORIAL, 35, 'URL indicates tutorial or guide');
    }
    if (titleLower.includes('tutorial') || titleLower.includes('step-by-step') || titleLower.startsWith('how to ')) {
        addScore(ContentType.TUTORIAL, 30, 'Title indicates step-by-step tutorial');
    }
    if (headingsLower.some(h => /step\s+\d+|part\s+\d+/i.test(h))) {
        addScore(ContentType.TUTORIAL, 25, 'Headings contain Step 1, Step 2 progression');
    }

    // 7. Blog Article Signals
    if (urlLower.includes('/blog/') || urlLower.includes('/posts/') || urlLower.includes('/articles/')) {
        addScore(ContentType.BLOG_ARTICLE, 35, 'URL contains /blog/ or /posts/');
    }
    if (metadata.author || metadata.publishedTime || /published on|min read|author:/i.test(textLower)) {
        addScore(ContentType.BLOG_ARTICLE, 20, 'Contains author or article publication date');
    }

    // 8. Code Example Signals
    const codeBlockCount = (markdown.match(/```[a-z]*\n[\s\S]*?```/g) || []).length;
    if (codeBlockCount >= 5 && markdown.length < 8000) {
        addScore(ContentType.CODE_EXAMPLE, 30, `High concentration of code blocks (${codeBlockCount})`);
    }

    // 9. Technical Documentation (General)
    if (urlLower.includes('/docs/') || urlLower.includes('/documentation/')) {
        addScore(ContentType.TECHNICAL_DOCUMENTATION, 25, 'URL contains /docs/');
    }
    if (codeBlockCount >= 1 && (headingsLower.length >= 2 || metadata.breadcrumbs?.length > 0)) {
        addScore(ContentType.TECHNICAL_DOCUMENTATION, 20, 'Structured sections with technical code blocks');
    }

    // Determine highest scoring category
    let topType = ContentType.GENERAL_WEBPAGE;
    let maxScore = 0;

    for (const [type, score] of scores.entries()) {
        if (score > maxScore) {
            maxScore = score;
            topType = type;
        }
    }

    if (maxScore < 20) {
        topType = markdown.length > 200 ? ContentType.GENERAL_WEBPAGE : ContentType.UNKNOWN;
        maxScore = 20;
    }

    const confidence = Math.min(0.98, Math.max(0.40, maxScore / 100));
    const evidence = evidenceMap.get(topType) || ['General web content characteristics'];

    return new ClassificationResult({
        contentType: topType,
        classificationConfidence: Math.round(confidence * 100) / 100,
        classificationEvidence: evidence
    });
}

