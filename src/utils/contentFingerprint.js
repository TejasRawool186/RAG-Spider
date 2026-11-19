/**
 * Content Fingerprinting and Hashing Utilities for RAG Spider
 * 
 * Provides cryptographic and perceptual hashing algorithms:
 * - SHA-256 for exact document and chunk fingerprints
 * - SimHash and 64-bit MinHash for local near-duplicate detection
 * - Deterministic identifier generators
 */

import crypto from 'crypto';

/**
 * Generates standard SHA-256 hex hash of any string or buffer
 * @param {string|Buffer} content 
 * @returns {string} 64-character hex string
 */
export function sha256(content) {
    if (!content) return '';
    return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Generates MD5 hex hash
 * @param {string|Buffer} content 
 * @returns {string} 32-character hex string
 */
export function md5(content) {
    if (!content) return '';
    return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Generates short 12-character alphanumeric hash for IDs
 * @param {string} content 
 * @returns {string}
 */
export function shortHash(content) {
    if (!content) return '000000000000';
    return sha256(content).substring(0, 12);
}

/**
 * Normalizes text for comparison (lowercasing, collapsing whitespace, stripping punctuation)
 * @param {string} text 
 * @returns {string}
 */
export function normalizeTextForComparison(text) {
    if (!text || typeof text !== 'string') return '';
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Generates word n-grams (shingles) from text
 * @param {string} text 
 * @param {number} n size of n-gram (default 3)
 * @returns {string[]}
 */
export function getWordShingles(text, n = 3) {
    const words = normalizeTextForComparison(text).split(' ').filter(w => w.length > 0);
    if (words.length < n) return words;
    const shingles = [];
    for (let i = 0; i <= words.length - n; i++) {
        shingles.push(words.slice(i, i + n).join(' '));
    }
    return shingles;
}

/**
 * 64-bit SimHash implementation for perceptual text similarity
 * @param {string} text 
 * @returns {string} 64-bit binary string
 */
export function calculateSimHash(text) {
    const tokens = getWordShingles(text, 3);
    if (tokens.length === 0) return '0'.repeat(64);

    const v = new Array(64).fill(0);

    for (const token of tokens) {
        // Generate 64-bit hash from token MD5
        const hashBuf = crypto.createHash('md5').update(token).digest();
        for (let i = 0; i < 64; i++) {
            const byteIndex = Math.floor(i / 8);
            const bitIndex = i % 8;
            const bit = (hashBuf[byteIndex] >> (7 - bitIndex)) & 1;
            if (bit === 1) {
                v[i] += 1;
            } else {
                v[i] -= 1;
            }
        }
    }

    let simhash = '';
    for (let i = 0; i < 64; i++) {
        simhash += v[i] > 0 ? '1' : '0';
    }
    return simhash;
}

/**
 * Calculates Hamming distance between two 64-bit SimHash strings
 * @param {string} hash1 
 * @param {string} hash2 
 * @returns {number} Hamming distance (0 to 64)
 */
export function simHashDistance(hash1, hash2) {
    if (!hash1 || !hash2 || hash1.length !== hash2.length) return 64;
    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
        if (hash1[i] !== hash2[i]) distance++;
    }
    return distance;
}

/**
 * Calculates estimated similarity (0.0 to 1.0) between two texts using SimHash
 * @param {string} text1 
 * @param {string} text2 
 * @returns {number} 0.0 (completely distinct) to 1.0 (identical)
 */
export function calculateTextSimilarity(text1, text2) {
    if (text1 === text2) return 1.0;
    if (!text1 || !text2) return 0.0;
    const h1 = calculateSimHash(text1);
    const h2 = calculateSimHash(text2);
    const dist = simHashDistance(h1, h2);
    return Math.max(0, 1 - (dist / 64));
}

/**
 * Calculates Jaccard similarity between two token sets
 * @param {Set<string>} setA 
 * @param {Set<string>} setB 
 * @returns {number} 0.0 to 1.0
 */
export function calculateJaccardSimilarity(setA, setB) {
    if (!setA || !setB || setA.size === 0 || setB.size === 0) return 0.0;
    let intersection = 0;
    for (const item of setA) {
        if (setB.has(item)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union > 0 ? intersection / union : 0.0;
}

