/**
 * Documentation-Aware Crawling Intelligence for RAG Spider
 * 
 * Analyzes and extracts structural documentation semantics:
 * - Documentation framework detection (Docusaurus, MkDocs, Sphinx, GitBook)
 * - Navigation hierarchy (sidebars, previous/next links, tutorial index)
 * - Documentation breadcrumbs and section hierarchies
 * - Version selector identification (e.g. v1, v2, latest)
 */

export class DocStructureAnalysis {
    constructor({
        isDocumentation = false,
        framework = 'unknown',
        frameworkConfidence = 0.0,
        frameworkEvidence = [],
        version = null,
        section = null,
        breadcrumbs = [],
        previousUrl = null,
        nextUrl = null,
        sidebarLinks = []
    } = {}) {
        this.isDocumentation = isDocumentation;
        this.framework = framework;
        this.frameworkConfidence = frameworkConfidence;
        this.frameworkEvidence = frameworkEvidence;
        this.version = version;
        this.section = section;
        this.breadcrumbs = breadcrumbs;
        this.previousUrl = previousUrl;
        this.nextUrl = nextUrl;
        this.sidebarLinks = sidebarLinks;
    }
}

/**
 * Analyzes DOM document for technical documentation patterns
 * @param {Document} document 
 * @param {string} pageUrl 
 * @returns {DocStructureAnalysis}
 */
export function analyzeDocumentationStructure(document, pageUrl = '') {
    if (!document) {
        return new DocStructureAnalysis();
    }

    const evidence = [];
    let framework = 'generic';
    let confidence = 0.0;

    // 1. Detect Docusaurus
    let docusaurusSignals = 0;
    if (document.querySelector('#__docusaurus')) {
        docusaurusSignals += 2;
        evidence.push('Element #__docusaurus present');
    }
    if (document.querySelector('nav[class*="theme-doc-sidebar"]') || document.querySelector('[class*="docSidebarContainer"]')) {
        docusaurusSignals += 2;
        evidence.push('Docusaurus theme doc sidebar classes');
    }
    if (document.querySelector('meta[name="docusaurus_version"]') || document.querySelector('meta[name="docsearch:version"]')) {
        docusaurusSignals += 2;
        evidence.push('Docusaurus version meta tags');
    }
    if (docusaurusSignals >= 2) {
        framework = 'docusaurus';
        confidence = Math.min(1.0, 0.5 + docusaurusSignals * 0.15);
    }

    // 2. Detect MkDocs
    if (framework === 'generic') {
        let mkdocsSignals = 0;
        if (document.querySelector('[data-md-component="sidebar"]') || document.querySelector('.md-nav')) {
            mkdocsSignals += 2;
            evidence.push('MkDocs Material component attributes (.md-nav)');
        }
        if (document.querySelector('header.md-header') || document.querySelector('.md-content')) {
            mkdocsSignals += 1;
            evidence.push('MkDocs header/content structure');
        }
        if (mkdocsSignals >= 2) {
            framework = 'mkdocs';
            confidence = Math.min(1.0, 0.6 + mkdocsSignals * 0.15);
        }
    }

    // 3. Detect Sphinx
    if (framework === 'generic') {
        let sphinxSignals = 0;
        if (document.querySelector('.sphinxsidebar') || document.querySelector('div.sphinxsidebarwrapper')) {
            sphinxSignals += 2;
            evidence.push('Sphinx sidebar elements');
        }
        if (document.querySelector('div.bodywrapper') || document.querySelector('div.documentwrapper')) {
            sphinxSignals += 1;
            evidence.push('Sphinx body/document wrapper structure');
        }
        if (sphinxSignals >= 2) {
            framework = 'sphinx';
            confidence = Math.min(1.0, 0.6 + sphinxSignals * 0.15);
        }
    }

    // 4. Detect GitBook
    if (framework === 'generic') {
        let gitbookSignals = 0;
        if (document.querySelector('#gitbook-root') || document.querySelector('div.gitbook-style')) {
            gitbookSignals += 2;
            evidence.push('GitBook root elements');
        }
        if (gitbookSignals >= 2) {
            framework = 'gitbook';
            confidence = 0.85;
        }
    }

    // Extract Breadcrumbs
    const breadcrumbs = [];
    const breadcrumbSelectors = [
        'nav[aria-label="breadcrumbs"]',
        'nav[aria-label="breadcrumb"]',
        '.breadcrumbs',
        '.breadcrumb',
        '.theme-doc-breadcrumbs'
    ];
    for (const sel of breadcrumbSelectors) {
        const bcEl = document.querySelector(sel);
        if (bcEl) {
            const items = bcEl.querySelectorAll('li, a, span');
            for (const item of items) {
                const text = item.textContent.replace(/[\n\r/›»]/g, '').trim();
                if (text && !breadcrumbs.includes(text) && text.length < 50) {
                    breadcrumbs.push(text);
                }
            }
            if (breadcrumbs.length > 0) break;
        }
    }

    // Extract Previous and Next navigation links
    let previousUrl = null;
    let nextUrl = null;

    const prevEl = document.querySelector('a[rel="prev"], a.pagination-nav__link--prev, .pagination-nav__link[data-direction="prev"]');
    if (prevEl) previousUrl = prevEl.getAttribute('href') || null;

    const nextEl = document.querySelector('a[rel="next"], a.pagination-nav__link--next, .pagination-nav__link[data-direction="next"]');
    if (nextEl) nextUrl = nextEl.getAttribute('href') || null;

    // Detect documentation version
    let detectedVersion = null;
    const versionMeta = document.querySelector('meta[name="docsearch:version"]') || document.querySelector('meta[name="docusaurus_version"]');
    if (versionMeta) {
        detectedVersion = versionMeta.getAttribute('content');
    } else {
        const versionSelect = document.querySelector('select[class*="version"], div[class*="versionSelector"]');
        if (versionSelect) {
            detectedVersion = versionSelect.textContent.trim().slice(0, 20);
        } else {
            // URL version pattern like /v1.2/, /v2/, /docs/1.0/
            const urlVersionMatch = pageUrl.match(/\/(v\d+(?:\.\d+)*|\d+\.\d+(?:\.\d+)*|latest|next)\//i);
            if (urlVersionMatch) {
                detectedVersion = urlVersionMatch[1];
            }
        }
    }

    // Detect documentation section
    let detectedSection = null;
    if (breadcrumbs.length > 1) {
        detectedSection = breadcrumbs[breadcrumbs.length - 2];
    } else {
        const sidebarActive = document.querySelector('.theme-doc-sidebar-item-link-active, .md-nav__link--active, li.active');
        if (sidebarActive) {
            detectedSection = sidebarActive.textContent.trim();
        }
    }

    // Extract sidebar navigation links
    const sidebarLinks = [];
    const sidebarEl = document.querySelector('nav[class*="sidebar"], .sidebar, .md-sidebar, .sphinxsidebar');
    if (sidebarEl) {
        const links = sidebarEl.querySelectorAll('a[href]');
        for (const l of links) {
            if (sidebarLinks.length >= 50) break;
            const href = l.getAttribute('href');
            const title = l.textContent.trim();
            if (href && title && !href.startsWith('#')) {
                sidebarLinks.push({ title, href });
            }
        }
    }

    const isDocumentation = framework !== 'generic' || breadcrumbs.length > 0 || sidebarLinks.length > 0 || pageUrl.includes('/docs/');

    return new DocStructureAnalysis({
        isDocumentation,
        framework,
        frameworkConfidence: confidence,
        frameworkEvidence: evidence,
        version: detectedVersion,
        section: detectedSection,
        breadcrumbs,
        previousUrl,
        nextUrl,
        sidebarLinks
    });
}

