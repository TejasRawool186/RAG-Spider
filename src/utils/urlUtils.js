/**
 * URL Utilities and Security Validation for RAG Spider
 * 
 * Provides canonical URL normalization, domain extraction,
 * pattern matching, and SSRF security protections.
 */

import { URL } from 'url';

/**
 * List of private/internal IP ranges and hostnames to block for SSRF prevention
 */
const PRIVATE_HOST_PATTERNS = [
    /^localhost$/i,
    /^127\.\d+\.\d+\.\d+$/,
    /^10\.\d+\.\d+\.\d+$/,
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
    /^192\.168\.\d+\.\d+$/,
    /^169\.254\.\d+\.\d+$/, // Link-local / AWS metadata
    /^0\.0\.0\.0$/,
    /^::1$/,
    /^fc00:/i,
    /^fe80:/i,
    /\.local$/i,
    /\.internal$/i
];

/**
 * Normalizes a URL to a canonical format
 * Removes tracking parameters, hashes, trailing slashes, and sorts query parameters
 * @param {string} rawUrl 
 * @returns {string}
 */
export function normalizeCanonicalUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    try {
        const parsed = new URL(rawUrl.trim());
        
        // Lowercase protocol and hostname
        parsed.protocol = parsed.protocol.toLowerCase();
        parsed.hostname = parsed.hostname.toLowerCase();
        
        // Remove standard tracking query params
        const trackingParams = [
            'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
            'fbclid', 'gclid', 'ref', 'source', 'mc_cid', 'mc_eid', '_ga'
        ];
        trackingParams.forEach(param => parsed.searchParams.delete(param));
        
        // Sort remaining query params for consistency
        parsed.searchParams.sort();
        
        // Remove hash / fragment
        parsed.hash = '';
        
        // Normalize path (remove trailing slash except for root)
        if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
            parsed.pathname = parsed.pathname.slice(0, -1);
        }
        
        return parsed.toString();
    } catch {
        return rawUrl.trim();
    }
}

/**
 * Checks if a URL is safe to crawl (not pointing to internal/private infrastructure)
 * @param {string} rawUrl 
 * @returns {{ safe: boolean, reason?: string }}
 */
export function isSafeUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
        return { safe: false, reason: 'Empty or non-string URL' };
    }
    
    try {
        const parsed = new URL(rawUrl.trim());
        
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { safe: false, reason: `Unsupported protocol: ${parsed.protocol}` };
        }
        
        const hostname = parsed.hostname.toLowerCase();
        
        for (const pattern of PRIVATE_HOST_PATTERNS) {
            if (pattern.test(hostname)) {
                return { safe: false, reason: `Blocked internal/private address: ${hostname}` };
            }
        }
        
        return { safe: true };
    } catch (err) {
        return { safe: false, reason: `Malformed URL: ${err.message}` };
    }
}

/**
 * Extracts clean domain name from URL
 * @param {string} rawUrl 
 * @returns {string}
 */
export function extractDomain(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        return parsed.hostname.toLowerCase();
    } catch {
        return 'unknown';
    }
}

/**
 * Extracts file extension from URL pathname
 * @param {string} rawUrl 
 * @returns {string} e.g. "pdf", "docx", "html", or ""
 */
export function extractFileExtension(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        const pathname = parsed.pathname;
        const lastSlash = pathname.lastIndexOf('/');
        const filename = lastSlash >= 0 ? pathname.substring(lastSlash + 1) : pathname;
        const dotIndex = filename.lastIndexOf('.');
        if (dotIndex > 0 && dotIndex < filename.length - 1) {
            return filename.substring(dotIndex + 1).toLowerCase();
        }
        return '';
    } catch {
        return '';
    }
}

