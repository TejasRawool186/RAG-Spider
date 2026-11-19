/**
 * Sitemap Intelligence Service for RAG Spider
 * 
 * Automatically discovers, parses, and filters sitemaps:
 * - Discovers sitemaps via /robots.txt
 * - Standard /sitemap.xml discovery
 * - Handles nested sitemap index files (<sitemapindex>)
 * - Extracts URLs and <lastmod> metadata
 * - Filters URLs against include/exclude glob patterns and domain restrictions
 * - Prevents duplicate URL processing and enforces crawl budgets
 */

import { URL } from 'url';
import { minimatch } from 'minimatch';
import { normalizeCanonicalUrl, isSafeUrl } from '../utils/urlUtils.js';

/**
 * Discovered sitemap URL entry
 */
export class SitemapEntry {
    constructor({ url = '', lastMod = null, changeFreq = null, priority = null } = {}) {
        this.url = url;
        this.lastMod = lastMod;
        this.changeFreq = changeFreq;
        this.priority = priority;
    }
}

/**
 * Sitemap Discovery and Parser
 */
export class SitemapDiscovery {
    constructor(options = {}) {
        this.options = {
            enabled: options.sitemapDiscovery !== false,
            includeUrlGlobs: options.includeUrlGlobs || ['**'],
            excludeUrlGlobs: options.excludeUrlGlobs || [],
            maxSitemapUrls: options.maxSitemapUrls || 1000,
            requestTimeoutMs: options.requestTimeoutMs || 15000,
            ...options
        };
        this.discoveredUrls = new Map(); // canonicalUrl -> SitemapEntry
        this.sitemapsParsed = new Set();
    }

    /**
     * Discovers and parses sitemaps starting from one or more root/start URLs
     * @param {string[]} startUrls 
     * @returns {Promise<SitemapEntry[]>}
     */
    async discoverSitemaps(startUrls = []) {
        if (!this.options.enabled || !startUrls || startUrls.length === 0) {
            return [];
        }

        const baseDomains = new Set();
        for (const rawUrl of startUrls) {
            try {
                const parsed = new URL(typeof rawUrl === 'object' ? rawUrl.url : rawUrl);
                baseDomains.add(`${parsed.protocol}//${parsed.host}`);
            } catch {
                // Ignore invalid start URLs
            }
        }

        for (const origin of baseDomains) {
            // 1. Check robots.txt for Sitemap directives
            const sitemapUrlsFromRobots = await this.findSitemapsFromRobotsTxt(origin);

            // 2. Default fallback to /sitemap.xml if none found in robots.txt
            if (sitemapUrlsFromRobots.length === 0) {
                sitemapUrlsFromRobots.push(`${origin}/sitemap.xml`);
            }

            // 3. Parse discovered sitemaps
            for (const sitemapUrl of sitemapUrlsFromRobots) {
                await this.parseSitemap(sitemapUrl, origin);
                if (this.discoveredUrls.size >= this.options.maxSitemapUrls) {
                    break;
                }
            }
        }

        return Array.from(this.discoveredUrls.values());
    }

    /**
     * Fetches and parses robots.txt to discover Sitemap declarations
     * @param {string} origin 
     * @returns {Promise<string[]>}
     */
    async findSitemapsFromRobotsTxt(origin) {
        const robotsUrl = `${origin}/robots.txt`;
        const sitemaps = [];

        try {
            const safeCheck = isSafeUrl(robotsUrl);
            if (!safeCheck.safe) return sitemaps;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.options.requestTimeoutMs);

            const res = await fetch(robotsUrl, {
                signal: controller.signal,
                headers: { 'User-Agent': 'RAG-Spider/1.0' }
            });
            clearTimeout(timeoutId);

            if (!res.ok) return sitemaps;

            const text = await res.text();
            const lines = text.split('\n');

            for (const line of lines) {
                const match = line.match(/^\s*Sitemap:\s*(https?:\/\/[^\s#]+)/i);
                if (match) {
                    const smUrl = match[1].trim();
                    sitemaps.push(smUrl);
                }
            }
        } catch {
            // Ignore robots.txt errors
        }

        return sitemaps;
    }

    /**
     * Recursively parses XML sitemap or sitemap index
     * @param {string} sitemapUrl 
     * @param {string} origin 
     */
    async parseSitemap(sitemapUrl, origin) {
        if (this.sitemapsParsed.has(sitemapUrl)) return;
        this.sitemapsParsed.add(sitemapUrl);

        if (this.discoveredUrls.size >= this.options.maxSitemapUrls) return;

        try {
            const safeCheck = isSafeUrl(sitemapUrl);
            if (!safeCheck.safe) return;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.options.requestTimeoutMs);

            const res = await fetch(sitemapUrl, {
                signal: controller.signal,
                headers: { 'User-Agent': 'RAG-Spider/1.0' }
            });
            clearTimeout(timeoutId);

            if (!res.ok) return;

            const xml = await res.text();

            // Check if this is a sitemap index (<sitemapindex>)
            if (xml.includes('<sitemapindex')) {
                const sitemapLocRegex = /<sitemap>[\s\S]*?<loc>([\s\S]*?)<\/loc>[\s\S]*?<\/sitemap>/gi;
                let smMatch;
                const nestedSitemaps = [];

                while ((smMatch = sitemapLocRegex.exec(xml)) !== null) {
                    const nestedUrl = smMatch[1].trim();
                    nestedSitemaps.push(nestedUrl);
                }

                // Recursively fetch nested sitemaps
                for (const nestedUrl of nestedSitemaps) {
                    await this.parseSitemap(nestedUrl, origin);
                    if (this.discoveredUrls.size >= this.options.maxSitemapUrls) break;
                }
                return;
            }

            // Standard URL set (<urlset>)
            const urlBlockRegex = /<url>([\s\S]*?)<\/url>/gi;
            let urlMatch;

            while ((urlMatch = urlBlockRegex.exec(xml)) !== null) {
                if (this.discoveredUrls.size >= this.options.maxSitemapUrls) break;

                const block = urlMatch[1];
                const locMatch = block.match(/<loc>([\s\S]*?)<\/loc>/i);
                if (!locMatch) continue;

                const rawLoc = locMatch[1].trim();
                const canonicalUrl = normalizeCanonicalUrl(rawLoc);

                if (!canonicalUrl || this.discoveredUrls.has(canonicalUrl)) continue;

                // Match domain and glob patterns
                if (!this.matchesFilters(canonicalUrl, origin)) continue;

                const lastModMatch = block.match(/<lastmod>([\s\S]*?)<\/lastmod>/i);
                const changeFreqMatch = block.match(/<changefreq>([\s\S]*?)<\/changefreq>/i);
                const priorityMatch = block.match(/<priority>([\s\S]*?)<\/priority>/i);

                this.discoveredUrls.set(canonicalUrl, new SitemapEntry({
                    url: canonicalUrl,
                    lastMod: lastModMatch ? lastModMatch[1].trim() : null,
                    changeFreq: changeFreqMatch ? changeFreqMatch[1].trim() : null,
                    priority: priorityMatch ? parseFloat(priorityMatch[1].trim()) : null
                }));
            }
        } catch {
            // Ignore sitemap fetch errors
        }
    }

    /**
     * Checks if a URL matches inclusion and exclusion filters
     * @param {string} url 
     * @param {string} origin 
     * @returns {boolean}
     */
    matchesFilters(url, origin) {
        try {
            const parsed = new URL(url);
            const originParsed = new URL(origin);

            // Scope to same origin or subdomains
            if (parsed.hostname !== originParsed.hostname && !parsed.hostname.endsWith(`.${originParsed.hostname}`)) {
                return false;
            }

            // Exclude globs check
            for (const pattern of this.options.excludeUrlGlobs) {
                if (minimatch(url, pattern)) return false;
            }

            // Include globs check
            if (this.options.includeUrlGlobs.length > 0) {
                let matched = false;
                for (const pattern of this.options.includeUrlGlobs) {
                    if (pattern === '**' || minimatch(url, pattern)) {
                        matched = true;
                        break;
                    }
                }
                if (!matched) return false;
            }

            return true;
        } catch {
            return false;
        }
    }
}

/**
 * Convenience helper to discover sitemaps from start URLs
 * @param {string[]} startUrls 
 * @param {Object} options 
 * @returns {Promise<SitemapEntry[]>}
 */
export async function discoverSitemaps(startUrls, options = {}) {
    const discovery = new SitemapDiscovery(options);
    return await discovery.discoverSitemaps(startUrls);
}
