# RAG Spider — Web to Markdown for AI

[![Apify Actor](https://img.shields.io/badge/Apify-Actor-brightgreen?logo=apify)](https://apify.com/store)
[![Specification](https://img.shields.io/badge/Actor%20Spec-v1-blue)](https://docs.apify.com/actors/development)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green?logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![Crawlee](https://img.shields.io/badge/Powered%20by-Crawlee-orange)](https://crawlee.dev)

**Enterprise-grade Web-to-RAG Data Intelligence Platform that crawls documentation websites, ingests multi-format documents (HTML, PDF, DOCX, CSV, JSON, XML), extracts clean content using Mozilla's Readability engine, performs deterministic content classification, semantic chunking, and produces instant Vector DB payloads with a Dark Fintech analytics dashboard.**

---

## What does RAG Spider do?

**RAG Spider** bridges the gap between raw web documentation and production Retrieval-Augmented Generation (RAG) pipelines. It extracts clean, structured, and chunked Markdown from technical documentation websites, knowledge bases, and document files without requiring external LLM API keys.

It strips away clutter (navigation bars, ads, cookie banners, tracking widgets) using Mozilla's battle-tested Readability algorithm, evaluates content quality (0–100 score with A+ through F grades), classifies content into a deterministic 12-type technical taxonomy, enriches each chunk with ancestral context and stable IDs, and exports ready-to-ingest payloads for **Qdrant, Chroma, Pinecone, Weaviate, Milvus, JSONL, and CSV**.

---

## Why use RAG Spider?

### The Problem
Building production RAG pipelines on raw web scrapes causes retrieval pollution:
- **Noise & Boilerplate**: Scrapers capture menus, copyright footers, sidebars, and ads that waste embedding vectors and confuse semantic search.
- **Fragmented Context**: Arbitrary character splitting severs code blocks, breaks tables, and detaches paragraphs from their section headings.
- **Data Inconsistency**: Web documentation mixes tutorials, API references, changelogs, and release notes without categorization.
- **Costly Recrawls**: Crawlers re-download unchanged documentation on every run, wasting compute and proxy bandwidth.

### The Solution: RAG Spider
- **Mozilla Readability & AST Cleaning**: Extracts only the article core while preserving code syntax fences, LaTeX math, and Markdown tables.
- **8 Semantic Chunking Strategies**: Configurable recursive character, paragraph, sentence, heading-aware, code-block-aware, table-aware, and doc-section splitting.
- **Contextual Chunk Enrichment**: Every chunk carries document title, source URL, heading hierarchy, section title, breadcrumbs, language, and stable sequential chunk IDs (`doc_abc#chunk-0`).
- **Multi-Level Deduplication**: Identifies exact page duplicates via SHA-256 and detects near-duplicate chunks via perceptual 64-bit SimHash.
- **Incremental Crawling**: Utilizes ETags, Last-Modified headers, and Key-Value Store snapshots to skip unchanged pages and compute line diffs.
- **Zero Mandatory External AI**: All intelligence—classification, quality scoring, language detection, and chunking—runs locally and deterministically.
- **Standalone Dark Fintech Dashboard**: Comprehensive visual analytics report stored in the Key-Value Store under the `OUTPUT` key (`#090A07` dark theme, neon-lime accents, Lucide SVG line icons, zero emojis).

---

## Core Capabilities & Architecture

```
[Start URLs / Sitemaps]
         │
         ▼
[Sitemap Discovery & Robots.txt]
         │
         ▼
[Crawl Policy & SSRF Guard] ──► [Playwright / Crawlee]
                                          │
    ┌─────────────────────────────────────┴─────────────────────────────────────┐
    ▼                                                                           ▼
[HTML Web Pages]                                                     [Multi-Format Documents]
(Readability, AST, Metadata)                                          (PDF, DOCX, CSV, JSON, XML)
    │                                                                           │
    └─────────────────────────────────────┬─────────────────────────────────────┘
                                          ▼
                         [Deterministic Classification]
                         [Language Detection (50+ langs)]
                         [Deterministic Quality Scoring (0-100)]
                         [Line-by-Line Content Diffing]
                                          │
                                          ▼
                         [8-Strategy Semantic Chunking]
                         [Contextual Metadata Enrichment]
                         [Page & Chunk Deduplication (SimHash)]
                                          │
                                          ▼
                      ┌───────────────────┴───────────────────┐
                      ▼                                       ▼
            [Apify Default Dataset]                 [Apify Key-Value Store]
            - Versioned RAG records                 - OUTPUT (Dark Fintech HTML)
            - Enriched chunks array                 - EXPORT_QDRANT, EXPORT_CHROMA
            - Token statistics                      - EXPORT_PINECONE, EXPORT_WEAVIATE
            - Quality grades & signals              - EXPORT_MILVUS, EXPORT_JSONL, CSV
                                                    - VALIDATION_REPORT, CRAWL_STATE
```

---

## What data does RAG Spider extract?

Each processed page produces a structured record in the default Apify Dataset adhering to `schemaVersion: "1.0.0"`:

| Field Name | Type | Description | Example |
|------------|------|-------------|---------|
| `documentId` | `string` | Deterministic, collision-resistant document ID | `doc_4f9a2b1c` |
| `url` | `string` | Normalized source URL of the page or document | `https://docs.example.com/api` |
| `canonicalUrl` | `string` | Canonical URL resolved from HTML `<link>` or headers | `https://docs.example.com/api` |
| `title` | `string` | Extracted title of the document or page | `API Reference Documentation` |
| `format` | `string` | Ingested format (`html`, `pdf`, `docx`, `csv`, `json`, `xml`) | `html` |
| `contentType` | `string` | Deterministic taxonomy classification | `api_reference` |
| `classificationConfidence` | `number` | Confidence score of classification (0.0 to 1.0) | `0.92` |
| `qualityScore` | `integer` | Deterministic content quality score (0 to 100) | `88` |
| `qualityGrade` | `string` | Quality letter grade (`A+`, `A`, `B`, `C`, `D`, `F`) | `A` |
| `language` | `string` | Detected ISO 639-1 language code | `en` |
| `markdown` | `string` | Cleaned full Markdown content with preserved code & tables | `# Overview\n\nContent...` |
| `totalChunks` | `integer` | Total number of semantic chunks produced | `6` |
| `totalTokens` | `integer` | Total estimated tokens across all chunks | `2140` |
| `totalWords` | `integer` | Total word count across all chunks | `1450` |
| `docStructure` | `object` | Detected framework, version, section, and breadcrumbs | `{ "framework": "docusaurus", ... }` |
| `assets` | `object` | Metadata of extracted images, diagrams, and figures | `{ "imagesCount": 3, ... }` |
| `structuredData` | `object` | Extracted OpenGraph, Twitter Cards, and JSON-LD types | `{ "jsonLdTypes": ["TechArticle"] }` |
| `chunks` | `array` | Enriched chunk objects with tokens, sequential IDs, and parent info | `[{ "chunkId": "...", "content": "..." }]` |
| `extractedAt` | `string` | ISO 8601 timestamp of extraction | `2026-11-19T14:30:00.000Z` |

---

## How to crawl documentation and build a RAG knowledge base

1. **Create a Run**: Click **Try Actor** or open RAG Spider in the Apify Console.
2. **Enter Start URLs**: Provide documentation base URLs (e.g., `https://docs.docker.com/`).
3. **Configure Chunking Strategy**: Choose from 8 semantic chunking strategies (e.g., `heading_markdown` or `recursive`).
4. **Select Output Formats**: Choose your vector database format (`qdrant`, `chroma`, `pinecone`, `weaviate`, `milvus`, or `jsonl`).
5. **Run the Actor**: RAG Spider navigates, parses, cleans, scores, and chunks pages in parallel.
6. **Download Results & Visual Report**:
   - Access clean JSON/CSV records in the **Storage -> Dataset** tab.
   - Download vector database payloads from the **Storage -> Key-Value Store** tab.
   - Open the **OUTPUT** key in the Key-Value Store to view the interactive dark fintech dashboard.

---

## Runtime & Pricing Estimates

RAG Spider is engineered for high performance using Crawlee and headless browser pooling:

| Target Volume | Crawl Depth | Estimated Duration | Memory | Estimated Compute Units |
|---------------|-------------|--------------------|--------|-------------------------|
| 5–10 pages | Depth 1–2 | 15–30 seconds | 2048 MB | ~0.01 – 0.02 CU |
| 50–100 pages | Depth 2–3 | 2–4 minutes | 2048 MB | ~0.08 – 0.15 CU |
| 500+ pages | Depth 3+ | 10–20 minutes | 4096 MB | ~0.50 – 1.00 CU |

*Note: Runtime depends on target site responsiveness and configured request delay. Using `crawlMode: "incremental"` on repeat runs skips unchanged pages, cutting runtime and compute cost significantly.*

---

## Input Parameters

### 1. Crawling Configuration
- `startUrls` (*array*, required): Starting URLs. Supports standard strings or Apify request list format.
- `crawlDepth` (*integer*, default: `1`): Maximum crawl distance from starting URLs (1 to 10).
- `includeUrlGlobs` (*array*, default: `[]`): Glob patterns to limit crawl boundaries (e.g., `["https://docs.example.com/**"]`).
- `excludeUrlGlobs` (*array*, default: `[]`): Glob patterns for URLs to exclude (e.g., `["**/changelog/**", "**/tag/**"]`).
- `sitemapDiscovery` (*boolean*, default: `true`): Auto-discover URLs from `robots.txt` and `sitemap.xml`.
- `respectRobotsTxt` (*boolean*, default: `true`): Enforce target site crawl rules and delays.
- `maxRequestsPerCrawl` (*integer*, default: `5`): Maximum pages to process.
- `requestDelay` (*integer*, default: `500`): Politeness delay between requests in milliseconds.
- `maxConcurrency` (*integer*, default: `5`): Maximum parallel browser tabs.
- `proxyConfiguration` (*object*, default: `{ useApifyProxy: true }`): Proxy settings to prevent IP bans.

### 2. Extraction & Ingestion
- `enabledFormats` (*array*, default: `["html", "pdf", "docx", "txt", "md", "csv", "json", "xml"]`): Active file formats.
- `enableReadability` (*boolean*, default: `true`): Strip boilerplate navigation and headers.
- `enableImageMetadata` (*boolean*, default: `true`): Extract figure and diagram metadata.
- `enableStructuredData` (*boolean*, default: `true`): Extract JSON-LD and OpenGraph tags.
- `preserveCodeBlocks` (*boolean*, default: `true`): Protect code syntax and language annotations.
- `preserveTables` (*boolean*, default: `true`): Convert HTML tables to Markdown tables.

### 3. Semantic Chunking
- `chunkingStrategy` (*select*, default: `"recursive"`): Chunking algorithm (`recursive`, `fixed`, `paragraph`, `sentence`, `heading_markdown`, `code_block_aware`, `table_aware`, `doc_section`).
- `chunkSize` (*integer*, default: `1000`): Maximum chunk size in characters.
- `chunkOverlap` (*integer*, default: `100`): Character overlap between consecutive chunks.
- `maxChunkTokens` (*integer*, default: `1000`): Maximum token limit per chunk.
- `preserveHeadings` (*boolean*, default: `true`): Embed ancestral heading paths into each chunk.

### 4. Quality & Incremental Options
- `enableQualityScoring` (*boolean*, default: `true`): Deterministic 0-100 scoring.
- `qualityThreshold` (*integer*, default: `50`): Minimum acceptable quality score.
- `enableDeduplication` (*boolean*, default: `true`): Page and chunk SimHash deduplication.
- `crawlMode` (*select*, default: `"full"`): Crawl mode (`full`, `incremental`, `refresh_urls`, `refresh_domain`).
- `exportFormat` (*select*, default: `"jsonl"`): Target vector DB export format.
- `generateDashboard` (*boolean*, default: `true`): Generate standalone HTML analytics report.

---

## Output Examples

### Sample Dataset Item (JSON)

```json
{
  "schemaVersion": "1.0.0",
  "documentId": "doc_b8f41e0a",
  "url": "https://docs.example.com/api/v2/authentication",
  "canonicalUrl": "https://docs.example.com/api/v2/authentication",
  "title": "API Authentication Guide",
  "format": "html",
  "extractionMethod": "readability",
  "status": "success",
  "isDuplicate": false,
  "contentType": "api_reference",
  "classificationConfidence": 0.94,
  "qualityScore": 89,
  "qualityGrade": "A",
  "language": "en",
  "totalChunks": 2,
  "totalTokens": 620,
  "totalWords": 415,
  "docStructure": {
    "isDocumentation": true,
    "framework": "docusaurus",
    "version": "v2",
    "section": "Authentication",
    "breadcrumbs": ["Docs", "API", "Authentication"]
  },
  "chunks": [
    {
      "chunkId": "chunk_b8f41e0a_0_a4c7e2b1",
      "documentId": "doc_b8f41e0a",
      "content": "# API Authentication Guide\n\nAll requests to the API must include an `Authorization: Bearer <token>` header.",
      "chunkIndex": 0,
      "totalChunks": 2,
      "tokens": 280,
      "wordCount": 185,
      "charCount": 1240,
      "previousChunkId": null,
      "nextChunkId": "chunk_b8f41e0a_1_f8e2d4c0",
      "metadata": {
        "sourceUrl": "https://docs.example.com/api/v2/authentication",
        "documentTitle": "API Authentication Guide",
        "sectionTitle": "API Authentication Guide",
        "contentType": "api_reference",
        "language": "en"
      }
    }
  ],
  "extractedAt": "2026-11-19T14:30:00.000Z"
}
```

---

## Vector Database & Framework Integrations

### Python / Apify Client

```python
from apify_client import ApifyClient

client = ApifyClient("YOUR_APIFY_TOKEN")

run_input = {
    "startUrls": [{"url": "https://docs.python.org/3/tutorial/"}],
    "chunkingStrategy": "heading_markdown",
    "chunkSize": 1000,
    "maxRequestsPerCrawl": 20,
    "exportFormat": "qdrant"
}

run = client.actor("YOUR_USERNAME/rag-spider").call(run_input=run_input)

# Fetch structured records
dataset_items = client.dataset(run["defaultDatasetId"]).list_items().items
print(f"Extracted {len(dataset_items)} documents")

# Fetch Qdrant-formatted points payload directly from Key-Value Store
qdrant_payload = client.key_value_store(run["defaultKeyValueStoreId"]).get_record("EXPORT_QDRANT")["value"]
```

### LangChain Integration

```python
from langchain_community.document_loaders import ApifyDatasetLoader
from langchain_core.documents import Document

loader = ApifyDatasetLoader(
    dataset_id="YOUR_DATASET_ID",
    dataset_mapping_function=lambda item: [
        Document(
            page_content=chunk["content"],
            metadata={
                "chunk_id": chunk["chunkId"],
                "source": item["url"],
                "title": item["title"],
                "content_type": item["contentType"],
                "quality_grade": item["qualityGrade"]
            }
        )
        for chunk in item.get("chunks", [])
    ]
)

documents = loader.load()
```

### LlamaIndex Integration

```python
from llama_index.core.schema import TextNode
from apify_client import ApifyClient

client = ApifyClient("YOUR_APIFY_TOKEN")
items = client.dataset("YOUR_DATASET_ID").list_items().items

nodes = []
for item in items:
    for chunk in item.get("chunks", []):
        node = TextNode(
            text=chunk["content"],
            id_=chunk["chunkId"],
            metadata={
                "url": item["url"],
                "title": item["title"],
                "quality_score": item["qualityScore"]
            }
        )
        nodes.append(node)
```

### Make & Zapier Automations
1. Add an **Apify** trigger: **Watch Actor Runs** (select `RAG Spider`).
2. Add a **Filter**: `status EQUALS SUCCEEDED`.
3. Add a destination action: **Qdrant**, **Pinecone**, or **Webhook** to ingest chunks directly into your production vector index.

---

## Key-Value Store Artifacts

In addition to dataset records, RAG Spider writes specialized operational artifacts to the default Key-Value Store:

- `OUTPUT`: Standalone Dark Fintech visual analytics dashboard (viewable in browser).
- `PROCESSING_STATISTICS`: Runtime performance metrics, requests per second, and memory usage.
- `CRAWL_SUMMARY`: High-level summary of total pages, chunks, and token counts.
- `VALIDATION_REPORT`: Automated 13-criteria data integrity audit with severity ratings.
- `DUPLICATE_REPORT`: Page-level and chunk-level deduplication statistics.
- `CHANGE_REPORT`: Content change summaries and line diffs.
- `EXPORT_SUMMARY`: Manifest of generated vector database payloads.
- `EXPORT_JSONL`: Standard newline-delimited JSON of all chunks.
- `EXPORT_QDRANT`: Qdrant points batch payload with UUID formatting.
- `EXPORT_CHROMA`: Chroma collection dictionaries (`ids`, `documents`, `metadatas`).
- `EXPORT_PINECONE`: Pinecone vector upsert records.
- `EXPORT_WEAVIATE`: Weaviate `DocumentChunk` object representations.
- `EXPORT_MILVUS`: Milvus entity collection records.
- `EXPORT_CSV`: Tabular CSV export of all chunks.
- `CRAWL_STATE`: State hashes for incremental recrawling.

---

## FAQ & Troubleshooting

### Why is a page skipped or reporting low quality?
Pages with fewer than 100 characters of meaningful content or pages dominated by login forms receive low quality scores (`Grade D` or `Grade F`). Check `qualityWarnings` in the dataset item to see specific detected signals.

### How do I crawl single-page JavaScript apps (SPAs)?
RAG Spider is powered by Playwright and automatically waits for network requests and DOM rendering before capturing page content. Adjust `requestDelay` if the target application takes several seconds to load content dynamically.

### How do I limit compute costs?
Set `maxRequestsPerCrawl` to a conservative ceiling (e.g., `20` or `50`), set `crawlDepth: 2`, and use `crawlMode: "incremental"` on repeat scheduled runs.

---

## Legal & Compliance Disclaimer

> **Ethical Web Scraping Notice**: RAG Spider is designed for ethical web scraping and knowledge extraction from publicly accessible documentation, open-source projects, and technical websites. It does not bypass paywalls, crack CAPTCHAs, or extract private, password-protected personal data. You are responsible for ensuring that your use of this Actor complies with the target website's Terms of Service, robots.txt directives, and applicable data privacy regulations, including the General Data Protection Regulation (GDPR) and the California Consumer Privacy Act (CCPA).
