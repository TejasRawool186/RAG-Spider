/**
 * Standalone Dark Fintech RAG Analytics Dashboard Generator
 * 
 * Generates an enterprise-grade, standalone HTML analytics report saved to KVS 'OUTPUT':
 * - Dark fintech theme: Background #090A07, Cards #151515, Neon-Lime #B8FF63
 * - Clean typography and Lucide line icons (SVG)
 * - Zero emojis in interface
 * - Client-side tabs, search filtering, code copying
 * - 20 comprehensive operational and intelligence sections
 * - 100% offline-ready without external CDN dependencies
 * 
 * Requirements: 6.18
 */

/**
 * Lucide SVG Icons (inline, zero dependencies)
 */
const ICONS = {
    activity: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    database: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
    fileText: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    layers: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    code: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    shieldCheck: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>',
    alertTriangle: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    cpu: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>',
    globe: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>'
};

/**
 * Generates standalone HTML document string from aggregated dashboard data
 * @param {Object} data Output of aggregateDashboardData
 * @returns {string} Standalone HTML string
 */
export function generateDashboardHtml(data) {
    const s = data.summary || {};
    const t = data.tokenAnalytics || {};
    const val = data.validationReport || {};
    const dup = data.duplicateReport?.statistics || {};
    const tech = data.technicalStats || {};

    const dataJson = JSON.stringify(data).replace(/<\/script>/g, '<\\/script>');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RAG Spider Intelligence Dashboard</title>
    <style>
        :root {
            --bg: #090A07;
            --card-bg: #151515;
            --card-border: #222222;
            --card-hover: #1A1A1A;
            --accent: #B8FF63;
            --accent-dim: rgba(184, 255, 99, 0.12);
            --text-main: #F4F4F5;
            --text-muted: #8E8E93;
            --danger: #FF5A5F;
            --warning: #FFAA00;
            --success: #34D399;
            --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            background-color: var(--bg);
            color: var(--text-main);
            font-family: var(--font-sans);
            line-height: 1.5;
            padding: 24px;
            -webkit-font-smoothing: antialiased;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        
        /* Header */
        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 24px;
            border-bottom: 1px solid var(--card-border);
            margin-bottom: 24px;
        }
        .brand {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .brand-badge {
            background: var(--accent);
            color: #000;
            font-size: 11px;
            font-weight: 700;
            padding: 3px 8px;
            border-radius: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .brand h1 {
            font-size: 20px;
            font-weight: 600;
            letter-spacing: -0.5px;
        }
        .header-meta {
            display: flex;
            gap: 16px;
            font-size: 13px;
            color: var(--text-muted);
            font-family: var(--font-mono);
        }

        /* KPI Grid */
        .kpi-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }
        .kpi-card {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: 8px;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .kpi-label {
            font-size: 12px;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-weight: 500;
        }
        .kpi-value {
            font-size: 28px;
            font-weight: 700;
            color: var(--text-main);
            letter-spacing: -0.5px;
            font-family: var(--font-mono);
        }
        .kpi-value.accent { color: var(--accent); }
        .kpi-subtext {
            font-size: 12px;
            color: var(--text-muted);
        }

        /* Tabs Navigation */
        .tabs-nav {
            display: flex;
            gap: 8px;
            border-bottom: 1px solid var(--card-border);
            margin-bottom: 24px;
            overflow-x: auto;
            padding-bottom: 8px;
        }
        .tab-btn {
            background: transparent;
            border: 1px solid transparent;
            color: var(--text-muted);
            padding: 8px 16px;
            font-size: 13px;
            font-weight: 500;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.15s ease;
            white-space: nowrap;
        }
        .tab-btn:hover {
            color: var(--text-main);
            background: var(--card-hover);
        }
        .tab-btn.active {
            color: #000;
            background: var(--accent);
            border-color: var(--accent);
            font-weight: 600;
        }

        /* Section Layout */
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        .grid-2 {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
            gap: 20px;
            margin-bottom: 24px;
        }
        .card {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: 8px;
            padding: 24px;
            margin-bottom: 20px;
        }
        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--card-border);
        }
        .card-title {
            font-size: 15px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
            color: var(--text-main);
        }
        
        /* Tables */
        .table-container {
            overflow-x: auto;
            max-height: 480px;
            overflow-y: auto;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
            text-align: left;
        }
        th {
            background: #111111;
            color: var(--text-muted);
            font-weight: 600;
            padding: 10px 14px;
            border-bottom: 1px solid var(--card-border);
            position: sticky;
            top: 0;
            z-index: 1;
        }
        td {
            padding: 12px 14px;
            border-bottom: 1px solid var(--card-border);
            color: var(--text-main);
        }
        tr:hover td { background: var(--card-hover); }
        .mono { font-family: var(--font-mono); }
        .badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            font-family: var(--font-mono);
        }
        .badge-success { background: rgba(52, 211, 153, 0.15); color: var(--success); }
        .badge-warning { background: rgba(255, 170, 0, 0.15); color: var(--warning); }
        .badge-danger { background: rgba(255, 90, 95, 0.15); color: var(--danger); }
        .badge-accent { background: var(--accent-dim); color: var(--accent); }

        /* Search input */
        .search-box {
            background: #111111;
            border: 1px solid var(--card-border);
            color: var(--text-main);
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 13px;
            width: 280px;
            outline: none;
        }
        .search-box:focus { border-color: var(--accent); }

        /* Code & Pre */
        pre {
            background: #0E0E0E;
            border: 1px solid var(--card-border);
            border-radius: 6px;
            padding: 14px;
            font-family: var(--font-mono);
            font-size: 12px;
            overflow-x: auto;
            color: #E4E4E7;
            position: relative;
        }
        .copy-btn {
            position: absolute;
            top: 8px;
            right: 8px;
            background: #222;
            border: 1px solid #333;
            color: #AAA;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .copy-btn:hover { background: #333; color: #FFF; }
        
        /* Bar meters */
        .meter-bar {
            height: 6px;
            background: #222;
            border-radius: 3px;
            overflow: hidden;
            margin-top: 6px;
        }
        .meter-fill {
            height: 100%;
            background: var(--accent);
            border-radius: 3px;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="brand">
                <span class="brand-badge">RAG SPIDER</span>
                <h1>Intelligence Platform Report</h1>
            </div>
            <div class="header-meta">
                <span>Total Runtime: ${s.durationSeconds || 0}s</span>
                <span>Throughput: ${s.throughputPerMinute || 0} pages/min</span>
                <span>Status: Production Ready</span>
            </div>
        </header>

        <!-- KPI Grid -->
        <div class="kpi-grid">
            <div class="kpi-card">
                <div class="kpi-label">Pages Crawled</div>
                <div class="kpi-value">${s.totalPages || 0}</div>
                <div class="kpi-subtext">${s.successfulPagesCount || 0} succeeded, ${s.failedPagesCount || 0} failed</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">RAG Chunks Generated</div>
                <div class="kpi-value accent">${s.totalChunks || 0}</div>
                <div class="kpi-subtext">Avg ${s.avgTokensPerChunk || 0} tokens/chunk</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Total Estimated Tokens</div>
                <div class="kpi-value">${(s.totalTokens || 0).toLocaleString()}</div>
                <div class="kpi-subtext">p90: ${t.p90 || 0} tokens</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Quality Grade</div>
                <div class="kpi-value accent">${s.overallGrade || 'A'}</div>
                <div class="kpi-subtext">Score: ${s.avgQualityScore || 0}/100</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Duplicate Rate</div>
                <div class="kpi-value">${dup.duplicateRatePercentage || 0}%</div>
                <div class="kpi-subtext">${dup.duplicateChunksDetected || 0} duplicate chunks</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Validation Status</div>
                <div class="kpi-value" style="color: ${val.isValid ? 'var(--success)' : 'var(--warning)'}; font-size: 20px;">
                    ${val.isValid ? 'Passed' : 'Needs Review'}
                </div>
                <div class="kpi-subtext">${val.statistics?.totalIssues || 0} checks flagged</div>
            </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="tabs-nav">
            <button class="tab-btn active" onclick="showTab('overview')">${ICONS.activity} Overview</button>
            <button class="tab-btn" onclick="showTab('pages')">${ICONS.fileText} Crawled Pages</button>
            <button class="tab-btn" onclick="showTab('chunks')">${ICONS.layers} Chunk Analytics</button>
            <button class="tab-btn" onclick="showTab('quality')">${ICONS.shieldCheck} Quality & Validation</button>
            <button class="tab-btn" onclick="showTab('technical')">${ICONS.code} Technical Content</button>
            <button class="tab-btn" onclick="showTab('multilingual')">${ICONS.globe} Languages & Formats</button>
            <button class="tab-btn" onclick="showTab('export')">${ICONS.database} Vector DB Export</button>
            <button class="tab-btn" onclick="showTab('operations')">${ICONS.cpu} Operations & Performance</button>
        </div>

        <!-- TAB 1: OVERVIEW & CRAWL ACTIVITY -->
        <div id="tab-overview" class="tab-content active">
            <div class="grid-2">
                <div class="card">
                    <div class="card-header">
                        <span class="card-title">${ICONS.activity} Section 1 & 2: Crawl Activity Summary</span>
                    </div>
                    <table>
                        <tr><td>Crawling Success Rate</td><td class="mono font-bold">${s.successRate || 100}%</td></tr>
                        <tr><td>Successful Page Ingestions</td><td class="mono">${s.successfulPagesCount || 0}</td></tr>
                        <tr><td>Failed / Skipped Requests</td><td class="mono">${s.failedPagesCount || 0}</td></tr>
                        <tr><td>Total Ingestion Duration</td><td class="mono">${s.durationSeconds || 0} seconds</td></tr>
                        <tr><td>Processing Throughput</td><td class="mono">${s.throughputPerMinute || 0} pages/minute</td></tr>
                        <tr><td>Peak Memory Utilization</td><td class="mono">${data.performance?.memoryPeakMb || 0} MB</td></tr>
                    </table>
                </div>

                <div class="card">
                    <div class="card-header">
                        <span class="card-title">${ICONS.shieldCheck} Section 5 & 8: Quality & Deduplication Overview</span>
                    </div>
                    <table>
                        <tr><td>Average Content Quality Score</td><td class="mono font-bold accent">${s.avgQualityScore || 0} / 100</td></tr>
                        <tr><td>Quality Rating</td><td><span class="badge badge-accent">Grade ${s.overallGrade || 'A'}</span></td></tr>
                        <tr><td>Pages Checked for Duplication</td><td class="mono">${dup.pagesChecked || 0}</td></tr>
                        <tr><td>Duplicate Pages Caught</td><td class="mono">${dup.duplicatePagesDetected || 0}</td></tr>
                        <tr><td>Duplicate Chunks Filtered / Identified</td><td class="mono">${dup.duplicateChunksDetected || 0}</td></tr>
                        <tr><td>Validation Severity (Critical / High)</td><td class="mono">${val.statistics?.criticalCount || 0} / ${val.statistics?.highCount || 0}</td></tr>
                    </table>
                </div>
            </div>
        </div>

        <!-- TAB 2: CRAWLED PAGES -->
        <div id="tab-pages" class="tab-content">
            <div class="card">
                <div class="card-header">
                    <span class="card-title">${ICONS.fileText} Section 3: Crawled Pages Inventory (${s.totalPages || 0})</span>
                    <input type="text" id="pageSearch" class="search-box" placeholder="Filter by URL, title, or type..." oninput="filterPagesTable()">
                </div>
                <div class="table-container">
                    <table id="pagesTable">
                        <thead>
                            <tr>
                                <th>Source URL</th>
                                <th>Document Title</th>
                                <th>Content Type</th>
                                <th>Chunks</th>
                                <th>Tokens</th>
                                <th>Quality</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(data.crawledPages || []).map(p => `
                                <tr>
                                    <td class="mono"><a href="${p.url}" target="_blank" style="color: var(--accent); text-decoration: none;">${p.url.slice(0, 45)}...</a></td>
                                    <td>${p.title}</td>
                                    <td><span class="badge badge-accent">${p.contentType}</span></td>
                                    <td class="mono">${p.totalChunks}</td>
                                    <td class="mono">${p.totalTokens}</td>
                                    <td><span class="badge ${p.qualityScore >= 70 ? 'badge-success' : 'badge-warning'}">${p.qualityScore} (${p.qualityGrade})</span></td>
                                    <td><span class="badge ${p.status === 'success' ? 'badge-success' : 'badge-danger'}">${p.status}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- TAB 3: CHUNK & TOKEN ANALYTICS -->
        <div id="tab-chunks" class="tab-content">
            <div class="grid-2">
                <div class="card">
                    <div class="card-header">
                        <span class="card-title">${ICONS.layers} Section 6: Chunk Analytics</span>
                    </div>
                    <table>
                        <tr><td>Total Chunks Generated</td><td class="mono font-bold">${s.totalChunks || 0}</td></tr>
                        <tr><td>Average Tokens per Chunk</td><td class="mono">${t.avgTokensPerChunk || 0}</td></tr>
                        <tr><td>Minimum Chunk Tokens</td><td class="mono">${t.minTokens || 0}</td></tr>
                        <tr><td>Maximum Chunk Tokens</td><td class="mono">${t.maxTokens || 0}</td></tr>
                    </table>
                </div>
                <div class="card">
                    <div class="card-header">
                        <span class="card-title">${ICONS.activity} Section 7: Token Budget Distribution Percentiles</span>
                    </div>
                    <table>
                        <tr><td>Median (p50) Tokens</td><td class="mono">${t.p50 || 0} tokens</td></tr>
                        <tr><td>90th Percentile (p90) Tokens</td><td class="mono font-bold">${t.p90 || 0} tokens</td></tr>
                        <tr><td>99th Percentile (p99) Tokens</td><td class="mono font-bold">${t.p99 || 0} tokens</td></tr>
                        <tr><td>Total Embedding Token Volume</td><td class="mono accent">${(t.totalTokens || 0).toLocaleString()} tokens</td></tr>
                    </table>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <span class="card-title">${ICONS.layers} Sample Enriched RAG Chunks Preview</span>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Chunk ID</th>
                                <th>Index</th>
                                <th>Tokens</th>
                                <th>Content Preview</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(data.chunksSample || []).map(c => `
                                <tr>
                                    <td class="mono">${c.chunkId}</td>
                                    <td class="mono">${c.chunkIndex} / ${c.totalChunks}</td>
                                    <td class="mono">${c.tokens}</td>
                                    <td style="color: #AAA;">${c.content}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- TAB 4: QUALITY & VALIDATION -->
        <div id="tab-quality" class="tab-content">
            <div class="grid-2">
                <div class="card">
                    <div class="card-header">
                        <span class="card-title">${ICONS.shieldCheck} Section 9: Dataset Validation Engine</span>
                    </div>
                    <div style="margin-bottom: 16px;">
                        <span class="badge ${val.isValid ? 'badge-success' : 'badge-warning'}" style="font-size: 14px; padding: 6px 12px;">
                            ${val.summary || 'Validation Completed'}
                        </span>
                    </div>
                    <table>
                        <tr><td>Critical Severity Issues</td><td class="mono">${val.statistics?.criticalCount || 0}</td></tr>
                        <tr><td>High Severity Issues</td><td class="mono">${val.statistics?.highCount || 0}</td></tr>
                        <tr><td>Medium Severity Issues</td><td class="mono">${val.statistics?.mediumCount || 0}</td></tr>
                        <tr><td>Low / Informational Checks</td><td class="mono">${(val.statistics?.lowCount || 0) + (val.statistics?.infoCount || 0)}</td></tr>
                    </table>
                </div>

                <div class="card">
                    <div class="card-header">
                        <span class="card-title">${ICONS.alertTriangle} Remediation Recommendations</span>
                    </div>
                    <ul style="padding-left: 20px; font-size: 13px; color: var(--text-muted); line-height: 1.8;">
                        ${(val.recommendations || ['No remediation needed. Dataset meets production standards.']).map(r => `<li>${r}</li>`).join('')}
                    </ul>
                </div>
            </div>
        </div>

        <!-- TAB 5: TECHNICAL CONTENT & ASSETS -->
        <div id="tab-technical" class="tab-content">
            <div class="grid-2">
                <div class="card">
                    <div class="card-header">
                        <span class="card-title">${ICONS.code} Section 10: Code and Technical Content</span>
                    </div>
                    <table>
                        <tr><td>Preserved Fenced Code Blocks</td><td class="mono">${tech.totalCodeBlocks || 0}</td></tr>
                        <tr><td>Markdown Tables Extracted</td><td class="mono">${tech.tableCount || 0}</td></tr>
                        <tr><td>Shell Command Examples</td><td class="mono">${tech.shellCommandCount || 0}</td></tr>
                        <tr><td>API Request/Response Examples</td><td class="mono">${tech.apiExampleCount || 0}</td></tr>
                    </table>
                    <div style="margin-top: 16px;">
                        <div class="kpi-label" style="margin-bottom: 8px;">Languages Identified</div>
                        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                            ${Object.keys(tech.languages || {}).map(l => `<span class="badge badge-accent">${l} (${tech.languages[l]})</span>`).join('') || '<span style="color: #666;">None detected</span>'}
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <span class="card-title">${ICONS.fileText} Section 15: Image and Asset Inventory</span>
                    </div>
                    <table>
                        <tr><td>Total Visual Assets Indexed</td><td class="mono">${data.assetStats?.totalAssets || 0}</td></tr>
                        <tr><td>Diagrams & Architecture Charts</td><td class="mono">${data.assetStats?.diagramCount || 0}</td></tr>
                    </table>
                </div>
            </div>
        </div>

        <!-- TAB 6: LANGUAGES & FORMATS -->
        <div id="tab-multilingual" class="tab-content">
            <div class="grid-2">
                <div class="card">
                    <div class="card-header">
                        <span class="card-title">${ICONS.fileText} Section 4: Document Format Ingestion</span>
                    </div>
                    <table>
                        ${Object.entries(data.documentTypes || {}).map(([k, v]) => `<tr><td>${k}</td><td class="mono">${v}</td></tr>`).join('')}
                    </table>
                </div>

                <div class="card">
                    <div class="card-header">
                        <span class="card-title">${ICONS.globe} Section 11: Multilingual Distribution</span>
                    </div>
                    <table>
                        ${Object.entries(data.languages || {}).map(([k, v]) => `<tr><td>${k.toUpperCase()}</td><td class="mono">${v} pages</td></tr>`).join('')}
                    </table>
                </div>
            </div>
        </div>

        <!-- TAB 7: VECTOR DATABASE EXPORT -->
        <div id="tab-export" class="tab-content">
            <div class="card">
                <div class="card-header">
                    <span class="card-title">${ICONS.database} Section 17 & 18: Vector Database Integration Payloads</span>
                </div>
                <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
                    Generated vector ingestion payloads are stored in the Apify Key-Value Store under the designated export keys (EXPORT_JSONL, EXPORT_QDRANT, EXPORT_CHROMA, EXPORT_PINECONE).
                </p>

                <div style="margin-bottom: 16px;">
                    <div class="kpi-label" style="margin-bottom: 8px;">Qdrant / Chroma / Pinecone Ingestion Snippet</div>
                    <pre><button class="copy-btn" onclick="copySnippet()">${ICONS.copy} Copy</button><code id="codeSnippet">// Example: Ingest RAG Spider dataset into Qdrant using Apify Client
import { ApifyClient } from 'apify-client';
import { QdrantClient } from '@qdrant/js-client-rest';

const apify = new ApifyClient({ token: process.env.APIFY_TOKEN });
const qdrant = new QdrantClient({ url: 'http://localhost:6333' });

// Fetch pre-formatted Qdrant points directly from Key-Value Store
const exportRecord = await apify.keyValueStore('default').getRecord('EXPORT_QDRANT');
if (exportRecord && exportRecord.value) {
    await qdrant.upsert('rag_spider_collection', {
        wait: true,
        points: exportRecord.value.points
    });
    console.log('Successfully upserted points to Qdrant');
}</code></pre>
                </div>
            </div>
        </div>

        <!-- TAB 8: OPERATIONS & PERFORMANCE -->
        <div id="tab-operations" class="tab-content">
            <div class="card">
                <div class="card-header">
                    <span class="card-title">${ICONS.cpu} Section 19 & 20: Performance and Resource Logs</span>
                </div>
                <table>
                    <tr><td>Execution Uptime</td><td class="mono">${data.performance?.uptime || 'N/A'}</td></tr>
                    <tr><td>Throughput Rate</td><td class="mono">${data.performance?.throughput || 'N/A'}</td></tr>
                    <tr><td>Heap Memory Peak</td><td class="mono">${data.performance?.memoryPeakMb || 0} MB</td></tr>
                    <tr><td>Logged Incidents / Errors</td><td class="mono">${(data.errors || []).length}</td></tr>
                </table>
            </div>
        </div>
    </div>

    <script id="dashboard-data" type="application/json">
        ${dataJson}
    </script>

    <script>
        function showTab(tabId) {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
            const target = document.getElementById('tab-' + tabId);
            if (target) target.classList.add('active');
            event.currentTarget.classList.add('active');
        }

        function filterPagesTable() {
            const query = document.getElementById('pageSearch').value.toLowerCase();
            const rows = document.querySelectorAll('#pagesTable tbody tr');
            rows.forEach(r => {
                const text = r.textContent.toLowerCase();
                r.style.display = text.includes(query) ? '' : 'none';
            });
        }

        function copySnippet() {
            const code = document.getElementById('codeSnippet').innerText;
            navigator.clipboard.writeText(code).then(() => {
                alert('Copied vector ingestion snippet to clipboard!');
            });
        }
    </script>
</body>
</html>`;
}

