/**
 * Crawl Policy and Reliability Engine for RAG Spider
 * 
 * Manages crawl governance, security policies, and resource safety:
 * - Domain concurrency and rate limiting
 * - SSRF and private IP defense
 * - Robots.txt compliance check
 * - Backoff delay calculation with jitter
 * - Scope boundary enforcement
 */

import { URL } from 'url';
import { isSafeUrl } from '../utils/urlUtils.js';

export class CrawlPolicy {
    constructor(options = {}) {
        this.options = {
            maxConcurrency: options.maxConcurrency || 5,
            perDomainConcurrency: options.perDomainConcurrency || 2,
            requestDelayMs: options.requestDelay || 500,
            respectRobotsTxt: options.respectRobotsTxt !== false,
            maxRequestsPerCrawl: options.maxRequestsPerCrawl || 1000,
            requestTimeoutSecs: options.requestTimeoutSecs || 60,
            maxRequestRetries: options.maxRequestRetries || 3,
            ...options
        };

        this.domainActiveRequests = new Map(); // domain -> active count
        this.domainLastRequestTime = new Map(); // domain -> timestamp
        this.robotsDisallowedPaths = new Map(); // domain -> string[]
        this.failedUrls = new Map(); // url -> { error, attempts, timestamp }
    }

    /**
     * Checks if a URL is permitted to be crawled under active policies
     * @param {string} url 
     * @returns {{ allowed: boolean, reason?: string }}
     */
    canCrawlUrl(url) {
        if (!url || typeof url !== 'string') {
            return { allowed: false, reason: 'Invalid URL' };
        }

        // 1. SSRF & Security Check
        const safeCheck = isSafeUrl(url);
        if (!safeCheck.safe) {
            return { allowed: false, reason: safeCheck.reason };
        }

        try {
            const parsed = new URL(url);
            const domain = parsed.hostname.toLowerCase();

            // 2. Robots.txt Disallow Check
            if (this.options.respectRobotsTxt && this.robotsDisallowedPaths.has(domain)) {
                const disallowed = this.robotsDisallowedPaths.get(domain);
                for (const path of disallowed) {
                    if (parsed.pathname.startsWith(path)) {
                        return { allowed: false, reason: `Blocked by robots.txt rule: ${path}` };
                    }
                }
            }

            return { allowed: true };
        } catch (err) {
            return { allowed: false, reason: `Malformed URL: ${err.message}` };
        }
    }

    /**
     * Records a failed URL with error context
     * @param {string} url 
     * @param {Error|string} error 
     */
    recordFailure(url, error) {
        const existing = this.failedUrls.get(url) || { attempts: 0, errors: [] };
        existing.attempts++;
        existing.errors.push(typeof error === 'string' ? error : error.message);
        existing.lastAttempt = new Date().toISOString();
        this.failedUrls.set(url, existing);
    }

    /**
     * Calculates delay for a request to maintain rate limits with jitter
     * @param {string} domain 
     * @returns {number} Delay in milliseconds
     */
    calculateDelay(domain) {
        const lastTime = this.domainLastRequestTime.get(domain) || 0;
        const elapsed = Date.now() - lastTime;
        const baseDelay = this.options.requestDelayMs;

        if (elapsed < baseDelay) {
            const remaining = baseDelay - elapsed;
            // Add 10-20% jitter
            const jitter = Math.floor(Math.random() * (baseDelay * 0.2));
            return remaining + jitter;
        }

        return 0;
    }

    /**
     * Updates domain request timestamp
     * @param {string} domain 
     */
    markDomainRequest(domain) {
        this.domainLastRequestTime.set(domain, Date.now());
    }

    /**
     * Parses and registers robots.txt rules for a domain
     * @param {string} domain 
     * @param {string} robotsTxt 
     */
    registerRobotsTxt(domain, robotsTxt) {
        if (!robotsTxt) return;
        const disallowed = [];
        const lines = robotsTxt.split('\n');
        let forOurBot = false;

        for (const line of lines) {
            const trimmed = line.trim();
            if (/^User-agent:\s*\*/i.test(trimmed) || /^User-agent:\s*rag-spider/i.test(trimmed)) {
                forOurBot = true;
            } else if (/^User-agent:/i.test(trimmed)) {
                forOurBot = false;
            } else if (forOurBot && /^Disallow:\s*(.+)/i.test(trimmed)) {
                const match = trimmed.match(/^Disallow:\s*(.+)/i);
                if (match && match[1].trim()) {
                    disallowed.push(match[1].trim());
                }
            }
        }

        if (disallowed.length > 0) {
            this.robotsDisallowedPaths.set(domain, disallowed);
        }
    }
}

