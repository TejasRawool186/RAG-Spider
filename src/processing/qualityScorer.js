/**
 * Content Quality Scoring Engine for RAG Spider
 * 
 * Evaluates extracted dataset quality using 100% deterministic rules:
 * - Readability and sentence structure
 * - Content-to-boilerplate / noise ratio
 * - Heading hierarchy completeness
 * - Code and table preservation
 * - Metadata completeness
 * - Deduplication integrity
 * 
 * Produces: qualityScore (0-100), qualityGrade (A+, A, B, C, D, F), qualitySignals, qualityWarnings
 * Requirements: 6.8
 */

export class QualityEvaluation {
    constructor({
        qualityScore = 0,
        qualityGrade = 'F',
        isAcceptable = false,
        qualitySignals = [],
        qualityWarnings = [],
        breakdown = {}
    } = {}) {
        this.qualityScore = qualityScore;
        this.qualityGrade = qualityGrade;
        this.isAcceptable = isAcceptable;
        this.qualitySignals = qualitySignals;
        this.qualityWarnings = qualityWarnings;
        this.breakdown = breakdown;
    }
}

/**
 * Calculates deterministic quality score for an extracted page / document
 * @param {Object} input 
 * @param {string} input.markdown 
 * @param {string} input.title 
 * @param {string[]} input.headings 
 * @param {Object} input.metadata 
 * @param {number} input.chunkCount 
 * @param {Object} options 
 * @returns {QualityEvaluation}
 */
export function evaluateContentQuality({ markdown = '', title = '', headings = [], metadata = {}, chunkCount = 1 } = {}, options = {}) {
    const threshold = options.qualityThreshold || 50;
    const signals = [];
    const warnings = [];

    let score = 50; // Base score
    const breakdown = {
        readability: 0,
        structure: 0,
        completeness: 0,
        metadata: 0,
        codePreservation: 0
    };

    const textLen = (markdown || '').length;

    // 1. Text Completeness
    if (textLen < 150) {
        score -= 30;
        breakdown.completeness -= 30;
        warnings.push('Sparse content: extracted text is under 150 characters');
    } else if (textLen >= 800) {
        score += 15;
        breakdown.completeness += 15;
        signals.push('Substantial content body (>800 characters)');
    } else {
        score += 5;
        breakdown.completeness += 5;
    }

    // 2. Heading Structure
    if (headings.length === 0) {
        score -= 15;
        breakdown.structure -= 15;
        warnings.push('No headings found: document lacks hierarchical outline');
    } else if (headings.length >= 2) {
        score += 15;
        breakdown.structure += 15;
        signals.push(`Structured heading outline (${headings.length} headings detected)`);
    }

    // Check for H1 presence
    const hasH1 = /^#\s+[^\n]+/m.test(markdown);
    if (hasH1) {
        score += 5;
        breakdown.structure += 5;
    } else {
        warnings.push('Missing top-level H1 header');
    }

    // 3. Navigation / Boilerplate Noise Penalty
    const boilerplatePhrases = [
        'all rights reserved', 'cookie policy', 'privacy policy', 'terms of service',
        'subscribe to our newsletter', 'follow us on twitter', 'sign in', 'log in'
    ];
    let boilerplateCount = 0;
    const lowerText = markdown.toLowerCase();
    for (const phrase of boilerplatePhrases) {
        if (lowerText.includes(phrase)) boilerplateCount++;
    }
    if (boilerplateCount >= 3) {
        score -= 15;
        warnings.push('High concentration of boilerplate/navigation phrases detected');
    } else if (boilerplateCount === 0) {
        score += 5;
        signals.push('Clean content: zero detected navigation/cookie boilerplate');
    }

    // 4. Code and Technical Content Preservation
    const codeBlocks = (markdown.match(/```[a-zA-Z0-9_\-+]*\n[\s\S]*?```/g) || []).length;
    const tables = (markdown.match(/\|[^\n]+\|\n\|[\s\-:|]+\|/g) || []).length;
    if (codeBlocks > 0 || tables > 0) {
        score += 10;
        breakdown.codePreservation += 10;
        signals.push(`Technical content preserved: ${codeBlocks} code blocks, ${tables} tables`);
    }

    // 5. Metadata Completeness
    let metaPoints = 0;
    if (title && title !== 'Document' && title !== 'Unknown') {
        metaPoints += 5;
        signals.push(`Document title identified: "${title.slice(0, 40)}"`);
    }
    if (metadata.breadcrumbs && metadata.breadcrumbs.length > 0) {
        metaPoints += 5;
        signals.push(`Breadcrumb hierarchy available (${metadata.breadcrumbs.length} levels)`);
    }
    if (metadata.language) {
        metaPoints += 2;
    }
    if (metadata.author || metadata.publishedTime) {
        metaPoints += 3;
    }
    score += metaPoints;
    breakdown.metadata = metaPoints;

    // 6. Readability: Word Length and Paragraph Balance
    const paragraphs = markdown.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    if (paragraphs.length >= 3) {
        const avgParaLen = textLen / paragraphs.length;
        if (avgParaLen >= 40 && avgParaLen <= 800) {
            score += 8;
            breakdown.readability += 8;
            signals.push('Balanced paragraph distribution for chunking');
        } else if (avgParaLen > 1500) {
            warnings.push('Very long dense paragraphs may affect chunk coherence');
        }
    }

    // Bound final score between 0 and 100
    const finalScore = Math.max(0, Math.min(100, Math.round(score)));

    // Assign letter grade
    let grade = 'F';
    if (finalScore >= 90) grade = 'A+';
    else if (finalScore >= 80) grade = 'A';
    else if (finalScore >= 70) grade = 'B';
    else if (finalScore >= 60) grade = 'C';
    else if (finalScore >= 50) grade = 'D';

    return new QualityEvaluation({
        qualityScore: finalScore,
        qualityGrade: grade,
        isAcceptable: finalScore >= threshold,
        qualitySignals: signals,
        qualityWarnings: warnings,
        breakdown
    });
}

