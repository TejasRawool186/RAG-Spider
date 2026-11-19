/**
 * Dashboard Data Aggregator for RAG Spider
 * 
 * Compiles and aggregates all runtime metrics, pages, chunks, quality scores,
 * validation results, and export statuses into a clean structured payload
 * for the standalone HTML report.
 */

export function aggregateDashboardData({
    crawledPages = [],
    allChunks = [],
    processingStats = {},
    validationReport = {},
    duplicateReport = {},
    crawlMode = 'full',
    exportSummary = {},
    startTime = Date.now(),
    endTime = Date.now()
} = {}) {
    const totalPages = crawledPages.length;
    const successfulPages = crawledPages.filter(p => p.status === 'success');
    const failedPages = crawledPages.filter(p => p.status !== 'success');
    const totalChunks = allChunks.length;

    // Token statistics
    const chunkTokens = allChunks.map(c => c.tokens || 0);
    const totalTokens = chunkTokens.reduce((a, b) => a + b, 0);
    const avgTokensPerChunk = totalChunks > 0 ? Math.round(totalTokens / totalChunks) : 0;

    const sortedTokens = [...chunkTokens].sort((a, b) => a - b);
    const p50 = sortedTokens.length > 0 ? sortedTokens[Math.floor(sortedTokens.length * 0.5)] : 0;
    const p90 = sortedTokens.length > 0 ? sortedTokens[Math.floor(sortedTokens.length * 0.9)] : 0;
    const p99 = sortedTokens.length > 0 ? sortedTokens[Math.floor(sortedTokens.length * 0.99)] : 0;

    // Quality score aggregation
    const qualityScores = successfulPages.map(p => p.qualityScore || 0);
    const avgQualityScore = qualityScores.length > 0
        ? Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length)
        : 0;

    let overallGrade = 'F';
    if (avgQualityScore >= 90) overallGrade = 'A+';
    else if (avgQualityScore >= 80) overallGrade = 'A';
    else if (avgQualityScore >= 70) overallGrade = 'B';
    else if (avgQualityScore >= 60) overallGrade = 'C';
    else if (avgQualityScore >= 50) overallGrade = 'D';

    const qualityGrades = { 'A+': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };
    for (const p of successfulPages) {
        const g = p.qualityGrade || 'C';
        if (qualityGrades[g] !== undefined) qualityGrades[g]++;
    }

    // Document types aggregation
    const docTypes = {};
    for (const p of crawledPages) {
        const type = p.contentType || p.format || 'general_webpage';
        docTypes[type] = (docTypes[type] || 0) + 1;
    }

    // Languages aggregation
    const languages = {};
    for (const p of successfulPages) {
        const lang = p.language || 'en';
        languages[lang] = (languages[lang] || 0) + 1;
    }

    // Technical content aggregation
    const technicalStats = {
        totalCodeBlocks: 0,
        languages: {},
        shellCommandCount: 0,
        apiExampleCount: 0,
        tableCount: 0
    };

    for (const p of successfulPages) {
        if (p.technicalContent) {
            technicalStats.totalCodeBlocks += p.technicalContent.codeBlockCount || 0;
            technicalStats.tableCount += p.technicalContent.tableCount || 0;
            technicalStats.shellCommandCount += (p.technicalContent.shellCommands || []).length;
            technicalStats.apiExampleCount += (p.technicalContent.apiExamples || []).length;

            for (const l of (p.technicalContent.languages || [])) {
                technicalStats.languages[l] = (technicalStats.languages[l] || 0) + 1;
            }
        }
    }

    // Asset inventory
    let totalAssets = 0;
    let diagramCount = 0;
    for (const p of successfulPages) {
        if (Array.isArray(p.assets)) {
            totalAssets += p.assets.length;
            diagramCount += p.assets.filter(a => a.isDiagram).length;
        }
    }

    const durationSec = Math.max(1, Math.round((endTime - startTime) / 1000));
    const throughputPerMinute = Math.round((totalPages / durationSec) * 60);

    return {
        summary: {
            totalPages,
            successfulPagesCount: successfulPages.length,
            failedPagesCount: failedPages.length,
            totalChunks,
            totalTokens,
            avgTokensPerChunk,
            avgQualityScore,
            overallGrade,
            durationSeconds: durationSec,
            throughputPerMinute,
            successRate: totalPages > 0 ? Math.round((successfulPages.length / totalPages) * 100) : 100
        },
        tokenAnalytics: {
            totalTokens,
            avgTokensPerChunk,
            p50,
            p90,
            p99,
            minTokens: sortedTokens.length > 0 ? sortedTokens[0] : 0,
            maxTokens: sortedTokens.length > 0 ? sortedTokens[sortedTokens.length - 1] : 0
        },
        documentTypes: docTypes,
        qualityDistribution: qualityGrades,
        languages,
        technicalStats,
        assetStats: {
            totalAssets,
            diagramCount
        },
        validationReport: validationReport || {},
        duplicateReport: duplicateReport || {},
        exportSummary: exportSummary || {},
        crawledPages: crawledPages.map(p => ({
            url: p.url,
            title: p.title || 'Untitled',
            status: p.status,
            contentType: p.contentType || 'general_webpage',
            language: p.language || 'en',
            totalChunks: p.totalChunks || 0,
            totalTokens: p.totalTokens || 0,
            qualityScore: p.qualityScore || 0,
            qualityGrade: p.qualityGrade || 'N/A',
            extractionMethod: p.extractionMethod || 'html-pipeline',
            timestamp: p.timestamp || new Date().toISOString()
        })),
        chunksSample: allChunks.slice(0, 25).map(c => ({
            chunkId: c.chunkId,
            documentId: c.documentId,
            chunkIndex: c.chunkIndex,
            totalChunks: c.totalChunks,
            tokens: c.tokens,
            content: (c.content || '').slice(0, 300),
            sourceUrl: c.metadata?.sourceUrl || c.source?.url || ''
        })),
        errors: processingStats.errors || failedPages.map(p => ({
            url: p.url,
            error: p.error || 'Failed request',
            timestamp: p.timestamp
        })),
        performance: {
            uptime: `${durationSec}s`,
            memoryPeakMb: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10,
            throughput: `${throughputPerMinute} pages/min`
        }
    };
}

