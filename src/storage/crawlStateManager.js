/**
 * Crawl State and Incremental Crawling Manager for RAG Spider
 * 
 * Manages incremental crawl snapshots and conditional requests:
 * - Scoped state stored in Apify Key-Value Store (CRAWL_STATE)
 * - Tracks URL fingerprints, ETag, Last-Modified, and content hashes
 * - Detects page status: 'new', 'modified', 'unchanged'
 * - Modes: full, incremental, refresh_urls, refresh_domain
 * - Clean fallback to full crawl if no previous state exists
 * 
 * Requirements: 6.9
 */

import { Actor } from 'apify';
import { sha256 } from '../utils/contentFingerprint.js';
import { normalizeCanonicalUrl } from '../utils/urlUtils.js';

export const CrawlMode = {
    FULL: 'full',
    INCREMENTAL: 'incremental',
    REFRESH_URLS: 'refresh_urls',
    REFRESH_DOMAIN: 'refresh_domain'
};

export class CrawlStateManager {
    constructor(options = {}) {
        this.options = {
            mode: options.crawlMode || CrawlMode.FULL,
            stateStoreKey: 'CRAWL_STATE',
            ...options
        };

        this.previousState = new Map(); // canonicalUrl -> { hash, etag, lastModified, crawledAt }
        this.currentState = new Map(); // canonicalUrl -> { hash, etag, lastModified, crawledAt }
        this.changeStats = {
            totalChecked: 0,
            newPages: 0,
            modifiedPages: 0,
            unchangedPages: 0
        };
        this.isLoaded = false;
    }

    /**
     * Initializes and loads previous state from Key-Value Store
     */
    async initialize() {
        if (this.options.mode === CrawlMode.FULL) {
            this.isLoaded = true;
            return;
        }

        try {
            const savedState = await Actor.getValue(this.options.stateStoreKey);
            if (savedState && typeof savedState === 'object') {
                const urls = savedState.urls || {};
                for (const [url, entry] of Object.entries(urls)) {
                    this.previousState.set(url, entry);
                }
                console.log(`Loaded ${this.previousState.size} cached page fingerprints from previous crawl state`);
            } else {
                console.log('No previous crawl state found. Defaulting to full crawl.');
            }
        } catch (err) {
            console.warn(`Could not load crawl state: ${err.message}. Defaulting to full crawl.`);
        }

        this.isLoaded = true;
    }

    /**
     * Inspects a page to determine if it has changed since the previous crawl
     * @param {string} url 
     * @param {string} content 
     * @param {Object} headers HTTP response headers
     * @returns {{ status: 'new' | 'modified' | 'unchanged', shouldProcess: boolean }}
     */
    evaluatePageChange(url, content = '', headers = {}) {
        this.changeStats.totalChecked++;
        const canonical = normalizeCanonicalUrl(url);
        const contentHash = sha256(content);
        const etag = headers['etag'] || headers['ETag'] || null;
        const lastModified = headers['last-modified'] || headers['Last-Modified'] || null;

        const currentEntry = {
            hash: contentHash,
            etag,
            lastModified,
            crawledAt: new Date().toISOString()
        };
        this.currentState.set(canonical, currentEntry);

        if (this.options.mode === CrawlMode.FULL || this.previousState.size === 0) {
            this.changeStats.newPages++;
            return { status: 'new', shouldProcess: true };
        }

        if (!this.previousState.has(canonical)) {
            this.changeStats.newPages++;
            return { status: 'new', shouldProcess: true };
        }

        const prev = this.previousState.get(canonical);

        // Check if content hash matches exactly
        if (prev.hash === contentHash) {
            this.changeStats.unchangedPages++;
            return { status: 'unchanged', shouldProcess: false };
        }

        // Check ETag match
        if (etag && prev.etag && etag === prev.etag) {
            this.changeStats.unchangedPages++;
            return { status: 'unchanged', shouldProcess: false };
        }

        this.changeStats.modifiedPages++;
        return { status: 'modified', shouldProcess: true };
    }

    /**
     * Persists updated crawl state back to Key-Value Store
     */
    async persistState() {
        try {
            const urlsObj = {};
            for (const [url, entry] of this.currentState.entries()) {
                urlsObj[url] = entry;
            }

            // Carry over any unchanged URLs from previous state that were not recrawled
            for (const [url, entry] of this.previousState.entries()) {
                if (!urlsObj[url]) {
                    urlsObj[url] = entry;
                }
            }

            const statePayload = {
                version: 1,
                updatedAt: new Date().toISOString(),
                stats: this.changeStats,
                urls: urlsObj
            };

            await Actor.setValue(this.options.stateStoreKey, statePayload);
            console.log(`Persisted crawl state with ${Object.keys(urlsObj).length} URL fingerprints`);
        } catch (err) {
            console.warn(`Failed to persist crawl state: ${err.message}`);
        }
    }
}

