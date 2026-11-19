/**
 * Snapshot and Version History Manager for RAG Spider
 * 
 * Stores and retrieves historical content snapshots in Apify Key-Value Store
 * to enable change detection and content versioning.
 * 
 * Requirements: 6.10
 */

import { Actor } from 'apify';
import { shortHash } from '../utils/contentFingerprint.js';
import { normalizeCanonicalUrl } from '../utils/urlUtils.js';

export class SnapshotManager {
    constructor(options = {}) {
        this.options = {
            enabled: options.enableVersionHistory !== false,
            maxSnapshots: options.maxSnapshots || 500,
            ...options
        };
        this.cache = new Map();
    }

    /**
     * Gets previous snapshot text for a URL
     * @param {string} url 
     * @returns {Promise<string|null>}
     */
    async getSnapshot(url) {
        if (!this.options.enabled || !url) return null;
        const key = `SNAP_${shortHash(normalizeCanonicalUrl(url))}`;
        if (this.cache.has(key)) return this.cache.get(key);

        try {
            const data = await Actor.getValue(key);
            if (data && typeof data.markdown === 'string') {
                this.cache.set(key, data.markdown);
                return data.markdown;
            }
        } catch {
            // Ignore missing snapshots
        }
        return null;
    }

    /**
     * Saves snapshot text for a URL
     * @param {string} url 
     * @param {string} markdown 
     * @param {Object} metadata 
     */
    async saveSnapshot(url, markdown, metadata = {}) {
        if (!this.options.enabled || !url || !markdown) return;
        const key = `SNAP_${shortHash(normalizeCanonicalUrl(url))}`;
        this.cache.set(key, markdown);

        try {
            await Actor.setValue(key, {
                url,
                markdown,
                savedAt: new Date().toISOString(),
                metadata
            });
        } catch (err) {
            console.warn(`Failed to save snapshot for ${url}: ${err.message}`);
        }
    }
}

