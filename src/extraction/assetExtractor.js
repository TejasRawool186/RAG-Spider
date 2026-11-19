/**
 * Image and Asset Intelligence Extractor for RAG Spider
 * 
 * Extracts metadata, captions, and context for images, screenshots, and diagrams:
 * - Image URLs and source resolution
 * - Alt text and title attributes
 * - Figure captions and nearby heading context
 * - Image dimensions (width, height) from markup
 * - Diagram / architecture screenshot identification
 */

import { URL } from 'url';

/**
 * Extracts image and visual asset metadata from an HTML document or DOM
 * @param {Document|Element} documentOrElement 
 * @param {string} baseUrl 
 * @param {Object} options 
 * @returns {Array<Object>}
 */
export function extractAssets(documentOrElement, baseUrl = '', options = {}) {
    const assets = [];
    if (!documentOrElement || typeof documentOrElement.querySelectorAll !== 'function') {
        return assets;
    }

    const maxAssets = options.maxAssets || 100;
    const images = documentOrElement.querySelectorAll('img, picture source, svg[data-diagram]');

    for (const el of images) {
        if (assets.length >= maxAssets) break;

        const tagName = el.tagName.toLowerCase();
        let src = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('srcset') || '';
        
        // Clean up srcset if present (take first URL)
        if (src.includes(',')) {
            src = src.split(',')[0].trim().split(' ')[0];
        }

        if (!src && tagName !== 'svg') continue;

        // Resolve relative URLs safely
        let resolvedUrl = src;
        if (src && baseUrl) {
            try {
                resolvedUrl = new URL(src, baseUrl).toString();
            } catch {
                resolvedUrl = src;
            }
        }

        // Filter out tiny tracking pixels or spacers
        const width = parseInt(el.getAttribute('width') || '0', 10);
        const height = parseInt(el.getAttribute('height') || '0', 10);
        if ((width > 0 && width <= 2) || (height > 0 && height <= 2)) {
            continue;
        }

        const alt = (el.getAttribute('alt') || '').trim();
        const title = (el.getAttribute('title') || '').trim();

        // Check figure parent and figcaption
        let caption = '';
        const figure = el.closest('figure');
        if (figure) {
            const figcaption = figure.querySelector('figcaption');
            if (figcaption) {
                caption = figcaption.textContent.trim();
            }
        }

        // Find nearby preceding heading context
        let nearbyHeading = '';
        let prev = el.parentElement;
        while (prev && !nearbyHeading) {
            let sibling = prev.previousElementSibling;
            while (sibling) {
                if (/^h[1-6]$/i.test(sibling.tagName)) {
                    nearbyHeading = sibling.textContent.trim();
                    break;
                }
                sibling = sibling.previousElementSibling;
            }
            prev = prev.parentElement;
        }

        // Detect if this is likely a diagram, chart, or screenshot
        const isDiagram = /diagram|chart|architecture|flowchart|workflow|graph|screenshot/i.test(
            `${alt} ${title} ${caption} ${src}`
        );

        assets.push({
            url: resolvedUrl,
            alt,
            title,
            caption,
            width: width || null,
            height: height || null,
            nearbyHeading,
            isDiagram,
            type: tagName === 'svg' ? 'svg_diagram' : 'image'
        });
    }

    return assets;
}

