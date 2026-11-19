/**
 * Structured Data Intelligence Extractor for RAG Spider
 * 
 * Safely extracts and normalizes structured metadata from HTML:
 * - JSON-LD scripts (<script type="application/ld+json">)
 * - Open Graph metadata (og:title, og:description, og:image, etc.)
 * - Twitter Card metadata (twitter:card, twitter:creator, etc.)
 * - Schema.org types (TechArticle, FAQPage, BreadcrumbList, SoftwareSourceCode)
 * - Canonical URLs and language tags
 * - Author and publication/modified timestamps
 */

/**
 * Extracts all structured data from a DOM document
 * @param {Document} document 
 * @param {string} pageUrl 
 * @returns {Object} Normalized structured metadata
 */
export function extractStructuredData(document, pageUrl = '') {
    if (!document) {
        return {
            jsonLd: [],
            openGraph: {},
            twitterCard: {},
            schemaOrg: [],
            canonicalUrl: '',
            author: '',
            publishedTime: null,
            modifiedTime: null,
            language: '',
            breadcrumbs: []
        };
    }

    const jsonLd = [];
    const schemaOrg = [];
    const breadcrumbs = [];

    // 1. Extract JSON-LD safely
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
        const raw = (script.textContent || '').trim();
        if (!raw) continue;
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                jsonLd.push(...parsed);
            } else {
                jsonLd.push(parsed);
            }
        } catch {
            // Ignore malformed JSON-LD gracefully
        }
    }

    // Process schema.org objects from JSON-LD
    let authorFromLd = '';
    let datePublishedFromLd = null;
    let dateModifiedFromLd = null;

    for (const item of jsonLd) {
        if (!item) continue;
        const type = item['@type'] || item.type;
        if (type) {
            schemaOrg.push({
                type,
                name: item.name || item.headline || '',
                description: item.description || ''
            });

            if (type === 'BreadcrumbList' && Array.isArray(item.itemListElement)) {
                for (const li of item.itemListElement) {
                    const name = li.name || li.item?.name || '';
                    if (name) breadcrumbs.push(name);
                }
            }

            if (!authorFromLd && item.author) {
                authorFromLd = typeof item.author === 'string' ? item.author : item.author.name || '';
            }
            if (!datePublishedFromLd && item.datePublished) {
                datePublishedFromLd = item.datePublished;
            }
            if (!dateModifiedFromLd && item.dateModified) {
                dateModifiedFromLd = item.dateModified;
            }
        }
    }

    // 2. Extract Open Graph
    const openGraph = {};
    const ogMetas = document.querySelectorAll('meta[property^="og:"]');
    for (const meta of ogMetas) {
        const prop = meta.getAttribute('property') || '';
        const key = prop.replace(/^og:/, '');
        const content = meta.getAttribute('content') || '';
        if (key && content) {
            openGraph[key] = content;
        }
    }

    // 3. Extract Twitter Card
    const twitterCard = {};
    const twitterMetas = document.querySelectorAll('meta[name^="twitter:"]');
    for (const meta of twitterMetas) {
        const name = meta.getAttribute('name') || '';
        const key = name.replace(/^twitter:/, '');
        const content = meta.getAttribute('content') || '';
        if (key && content) {
            twitterCard[key] = content;
        }
    }

    // 4. Canonical URL
    const canonicalEl = document.querySelector('link[rel="canonical"]');
    const canonicalUrl = canonicalEl ? (canonicalEl.getAttribute('href') || '').trim() : '';

    // 5. Author, Publication and Modification dates
    const authorMeta = document.querySelector('meta[name="author"]') || document.querySelector('meta[property="article:author"]');
    const author = authorFromLd || (authorMeta ? authorMeta.getAttribute('content') : '') || '';

    const pubMeta = document.querySelector('meta[property="article:published_time"]') || document.querySelector('meta[name="publish-date"]');
    const publishedTime = datePublishedFromLd || (pubMeta ? pubMeta.getAttribute('content') : null);

    const modMeta = document.querySelector('meta[property="article:modified_time"]') || document.querySelector('meta[name="revised"]');
    const modifiedTime = dateModifiedFromLd || (modMeta ? modMeta.getAttribute('content') : null);

    // 6. Language declarations
    const htmlLang = document.documentElement ? document.documentElement.getAttribute('lang') || '' : '';
    const metaLang = document.querySelector('meta[http-equiv="content-language"]');
    const language = (htmlLang || (metaLang ? metaLang.getAttribute('content') : '') || '').toLowerCase().trim();

    return {
        jsonLd,
        openGraph,
        twitterCard,
        schemaOrg,
        canonicalUrl,
        author,
        publishedTime,
        modifiedTime,
        language,
        breadcrumbs
    };
}

