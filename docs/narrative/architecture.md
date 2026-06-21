# Architecture

Technical architecture reference for the Jay Rosen Internet Archive. Describes current state as of April 2026.


## High-level overview

The project has three components:

1. **Backend pipeline** -- Python (Poetry) system for scraping, processing, and AI analysis of content
2. **Data layer** -- CSV files exported from Google Sheets, converted to split JSON for deployment
3. **Frontend** -- Zero-build React application served as static files on WordPress

```
Google Sheets (curation)
    |
    v
CSV export (version-controlled in /data/)
    |
    v
export-archive-data.js (Node script)
    |
    v
Split JSON files (core, details, entities)
    |
    v
FTP upload to WordPress
    |
    v
Static frontend at pressthink.org/j/rosen-archive/
```

The backend pipeline runs separately. It reads URLs from Google Sheets, scrapes and analyzes content, and writes results back to Google Sheets. The frontend never calls the backend or any API at runtime -- it loads pre-generated JSON files.


## Data architecture

### Source of truth

Google Sheets holds the curated archive data. Human editors manage records there. CSV exports in `/data/` are the version-controlled snapshot.

### CSV files

| File | Records | Contents |
|------|---------|----------|
| `archive_records-public.csv` | 940 | Non-social archive records (709 RECORD, 138 TUMBLR, 83 CLIP, 10 THREAD) |
| `social_posts.csv` | ~29,100 | Twitter/X and Bluesky posts |
| `extracted_entities.csv` | ~5,061 | Named entities (people, orgs, concepts) |
| `extracted_relationships.csv` | ~5,084 | Entity-to-record relationships |

### JSON generation

`node data/export-archive-data.js` reads the CSV files and produces split JSON for the frontend:

| File | Size | Contents | Load behavior |
|------|------|----------|---------------|
| `archive-core.json` | 10.8 MB | Lightweight record fields for cards | On page load |
| `archive-details.json` | 11.6 MB | Full summaries, quotes, concepts | On demand |
| `archive-entities.json` | 1.0 MB | Entity graph for Explorer | On demand |
| `archive-data.json` | 25.9 MB | Full combined data | Fallback only |

Split loading keeps initial page load fast (~100-200ms) while deferring heavy content until needed.

### Deployment path

JSON files are uploaded via FTP to WordPress at `/wp-content/rosen-archive/data/`. Version query parameters (`?v=3.3.0`) on all JS/CSS imports bust the Cloudflare cache after updates.


## Backend data pipeline

Located in `backend/`. Uses Poetry for dependency management.

### Core modules (`src/rosen_scraper/`)

| Module | Purpose |
|--------|---------|
| `workflow.py` | Main orchestrator. Reads from Google Sheets, calls the dispatcher, writes results back. |
| `dispatcher.py` | Content router. Inspects URLs to determine content type and routes to the correct processor. |
| `scraper.py` | Scraping cascade: Google URL Context tool, then `requests`, then Playwright. |
| `categorizer.py` | Thematic categorization of archive records. |
| `csv_data_service.py` | CSV reading and writing for local data operations. |
| `logger.py` | Session logging with performance metrics. |
| `path_utils.py` | Shared path resolution for the package. |
| `rate_limiter.py` | API rate limiting across all external calls. |
| `poison_pill_handler.py` | Error detection and content quality validation. |
| `extraction_db.py` | Local database for tracking extraction state. |

### Content processors (`src/rosen_scraper/processors/`)

| Processor | Handles |
|-----------|---------|
| `article_processor.py` | Web articles. Handles both structured data from URL Context and traditional HTML extraction. |
| `video_processor.py` | YouTube videos. Uses `yt-dlp` for metadata, `google-cloud-speech` for transcription. |
| `audio_processor.py` | Audio content (podcast episodes, SoundCloud). |
| `twitter_processor.py` | Twitter/X posts and threads. |
| `bluesky_processor.py` | Bluesky posts and threads. |
| `tumblr_processor.py` | Tumblr post archives. |
| `clipping_processor.py` | Newspaper clippings via PDF OCR. |

### URL Context integration

Google's URL Context tool (via Gemini API) is the primary extraction method. It returns pre-structured article data (title, author, text, publication) without HTML parsing, bypassing many anti-bot measures. The system falls back to `requests` + BeautifulSoup, then Playwright, if URL Context fails.

### AI analysis modules

| Module | Purpose |
|--------|---------|
| `categorizer.py` | Thematic category assignment using the 6-category taxonomy. |
| `key_concepts_updater.py` | Identifies Jay Rosen journalism concepts in content using Gemini 2.0 Flash Lite. |
| `entity_extractor.py` | Extracts named entities and relationships from content via Gemini API. |
| `entity_extraction_batch_processor.py` | Batch wrapper for entity extraction across the full archive. |
| `relationship_augmentation.py` | Secondary extraction pass for high-value relationships. Archived 2026-06-21 (#491) — never wired into the pipeline; see `archived/scripts/backend-oneoffs/`. |
| `entity_registry.py` | Maintains normalized entity registry for deduplication. |
| `entity_resolver.py` | Resolves and standardizes publication and platform names. |
| `entity_deduplicator.py` | Deduplicates entities across extraction batches. |
| `enhanced_pdf_formatter.py` | PDF generation with proper paragraph breaks, audio transcript formatting, and WCAG accessibility. |
| `pdf_generator.py` | Base PDF generation using ReportLab. |
| `transcript_saver.py` | Saves audio/video transcriptions to files. |

### Backfill tools (`scripts/backfill/`)

| Script | Purpose |
|--------|---------|
| `backfill_worker.py` | Fills missing `pull_quote` and `raw_text` data. |
| `bulk_reprocessor.py` | Full archive reprocessing with multi-strategy content extraction. |
| `simple_date_backfill.py` | URL pattern extraction for publication dates (93.8% success on PressThink URLs). |
| `enhanced_date_backfill.py` | OpenGraph, JSON-LD, RSS, and video API date extraction. |
| `publication_date_backfill.py` | AI-powered date extraction via Gemini for remaining gaps. |


## Entity extraction pipeline

The entity extraction system builds a knowledge graph from archive content.

### Pipeline flow

```
Archive records (Google Sheets)
    |
    v
entity_extraction_batch_processor.py
    |
    v
entity_extractor.py (Gemini API)
    |-- Extracts 6 entity types
    |-- Extracts 15 relationship types
    |
    v
Google Sheets (extracted_entities + extracted_relationships)
    |
    v
relationship_augmentation.py (secondary pass — archived 2026-06-21, #491; never wired in)
    |
    v
CSV export for frontend
```

### Entity types (6)

Person, Organization, Concept, Work, Event, Location.

### Relationship types (15)

Including: Founded By, Criticizes, Discusses, Mentions, Affiliated With, Pioneered, and others defined in `entity_extraction_schema.json`.

### Entity schema

Stored in `backend/entity_extraction_schema.json` (v3 also available). Defines valid entity types, relationship types, and extraction rules.

### Quality controls

- Confidence threshold on relationship extraction (currently 0.5, recommended increase to 0.7)
- Entity deduplication across batches via `entity_deduplicator.py`
- Normalized entity registry for consistent naming
- Diagnostic tool: `scripts/diagnostics/analyze_founded_relationships.py`


## Key concepts analysis system

Identifies 13 Jay Rosen journalism concepts across the archive.

### 13-concept schema

**Original 8:** View from Nowhere, Church of the Savvy, The People Formerly Known as the Audience, Parity Product, Verification in reverse, He said/she said journalism, Audience atomization overcome, The Production of Innocence

**Data analysis additions (2):** Horse-race journalism, False balance

**From Jay's notes (3):** The Citizens' Agenda, Not the odds but the stakes, Mindcasting

### Processing

`key_concepts_updater.py` runs three modes:
1. Fill empty concept fields
2. Review existing assignments
3. Flag records missing concept content

Uses Gemini 2.0 Flash Lite. Strict schema validation with case-insensitive normalization. Batch processing (100 rows) with rate limiting (5 sec/row, 10 sec/batch). Progress auto-saves to `key_concepts_progress.json`.

`analyze_key_concepts.py` generates distribution reports and identifies schema compliance issues.


## Smart data corrector

Located in `scripts/diagnostics/smart_corrector/`. Corrects and enriches existing data without re-scraping when possible.

### Modules

| Module | Purpose |
|--------|---------|
| `content_detector.py` | Auto-detects content type from URL patterns. |
| `quality_validator.py` | Scores raw text quality (0.0-1.0) with content-type-specific rules. |
| `audio_optimizer.py` | 2x audio speed for 50% transcription cost reduction. |
| `cost_tracker.py` | Real-time cost monitoring with budget enforcement. |
| `processors/youtube_processor.py` | YouTube caption extraction with deduplication and metadata cleaning. |
| `processors/soundcloud_processor.py` | SoundCloud metadata and description extraction. |
| `gdrive_overflow_handler.py` | Handles text >50K characters (Google Sheets cell limit). |

### Decision logic

1. Validate existing `raw_text` quality (score 0.0-1.0)
2. Score >= 0.7: use cached text, run AI re-analysis only ($0.006/row)
3. Score < 0.7: reprocess from source ($0.02-$0.40 depending on content type)
4. Handle edge cases: truncate large text, flag for transcription, retry with enhanced cleaning

### Production results

Tested on 42 rows: 85.7% success rate, 59.5% cache hit rate, $0.0045 average cost per row.


## Data quality tools

Analysis and repair scripts in `scripts/` and `scripts/diagnostics/`:

**Analysis:**
- `analyze_archive_patterns.py` -- pattern analysis across the archive
- `analyze_csv_schema.py` -- CSV structure validation
- `analyze_data_standardization.py` -- field standardization checks
- `analyze_extraction_errors.py` -- extraction failure analysis
- `analyze_taxonomy.py` -- taxonomy distribution and consistency
- `cross_reference_analyzer.py` -- content relationship discovery (related_to, responds_to fields)

**Repair and enrichment:**
- `data_deduper.py` -- deduplication and cross-referencing entities to records
- `data_improver.py` -- reprocesses existing raw text without re-scraping
- `text_cleaner.py` -- removes HTML artifacts, navigation elements, improves structure
- `format_converter.py` -- converts CSV strings to JSON arrays for structured fields
- `populate_new_fields.py` -- automated platform detection, permission classification, collection ID generation
- `smart_data_corrector.py` -- main processing engine with batch mode, dry-run, and resume

**Maintenance:**
- `auto_categorize_records.py` -- bulk thematic categorization
- `consolidate_taxonomy.py` -- taxonomy cleanup and consolidation
- `deduplicate_entities.py` -- entity deduplication across sheets
- `validate_and_repair_entities.py` -- entity data integrity checks
- `validate_archive_data.py` -- full archive validation


## Frontend

### Stack

Zero-build React application. No npm, Webpack, or Vite for production. Dependencies load via CDN:

- **React 18** via `esm.sh` CDN (import maps in `index.html`)
- **HTM** for JSX-like template syntax (`html` tagged template)
- **sql.js** for in-browser SQLite queries
- **Tailwind CSS** pre-built at `frontend/dist/tailwind.css`
- **Lucide React** for icons
- **ES modules** (native browser imports, no bundler)

All `.js` files use HTM's `html` tagged template instead of JSX. Every import includes a `?v=3.3.0` query parameter for cache busting.

### Component architecture

**App shell:**
- `App.js` -- main component, routing, state management
- `index.js` -- React root mount
- `constants.js` -- data URLs, colors, entity type config, era definitions
- `html.js` -- HTM/React binding

**Views:**
- `Sidebar.js` -- filters, search, autocomplete
- `FeaturedSection.js` -- curated works carousel
- `Timeline.js` -- year-based bar chart filter
- `RecordModal.js` -- record detail modal
- `ThreadModal.js` -- social media thread visualization
- `QueryBuilder.js` -- advanced search query builder
- `Explorer.js` -- canvas network visualization of entities
- `EntityBrowser.js` -- entity search and browse
- `DissertationPage.js` -- dissertation mind map + detail panel
- `MindMap.js` -- interactive dissertation tree
- `DetailPanel.js` -- dissertation node detail sidebar
- `AboutPage.js` -- about the archive
- `AnalyticsDashboard.js` -- archive statistics charts
- `RiverOfNews.js` -- river of news display
- `LoadingQuotes.js` -- loading screen with rotating quotes
- `WelcomeModal.js` -- first-visit intro overlay
- `ToolsModal.js` -- dissertation tools launcher
- `WorkInProgressBanner.js` -- WIP notice

**Services:**
- `archiveService.js` -- data loading, entity maps, search
- `router.js` -- hash-based SPA routing
- `sqliteService.js` -- sql.js SQLite queries

### Routing

Hash-based SPA routing via `router.js`:

| Route | Hash | Component |
|-------|------|-----------|
| Archive | (default) | `App.js` main view |
| Folders | `#folders` | `App.js` folder view |
| Entities | `#entities` | `EntityBrowser.js` |
| Dissertation | `#dissertation` | `DissertationPage.js` |
| About | `#about` | `AboutPage.js` |
| Analytics | `#analytics` | `AnalyticsDashboard.js` |

Record deep links: `?record=RECORD_ID` opens a record modal on any route.

### Standalone pages

- **Dissertation tools** (`/dissertation/`): reader, foreword, network-effect analysis
- **Features** (`/features/`): status report generator, shared feature assets

Each standalone page has its own subdirectory with an `index.html`.

### Path configuration

- Local dev: relative paths (`./data/`, `./frontend/`)
- Production: absolute paths (`/j/rosen-archive/`)
- Auto-detected via `window.location.hostname` in `App.js`


## Schema overview

### Record schema (35 fields)

Defined in `data/schema.json`. Record IDs follow the pattern `(RECORD|THREAD|SOCIAL|dissertation)-[0-9a-zA-Z-]+`.

**Core metadata** (>99% completion):
`id`, `title`, `author`, `date` (YYYY-MM-DD), `year`, `url`

**Classification:**
`era` (4 periods: Public Journalism 90s, Web & Blogging 00s, View from Nowhere 10s, Democracy in Crisis 20s), `pub` (original publication), `type` (article, social, Dissertation)

**Content analysis** (94%+ completion):
`summary`, `quote` (pull quote), `categories` (array from 6-category taxonomy), `concepts` (array from 13-concept schema), `tags` (array)

**Relationships:**
`relatedIds` (array of related record/entity IDs)

**Status:**
`verified` (boolean)

**Thread data** (THREAD records only):
`thread_data.platform` (bluesky, twitter), `thread_data.root_post_id`, `thread_data.post_count`, `thread_data.posts[]` (id, depth, content, created_at, reply_to)

### Entity schema

Six types: Person, Organization, Concept, Work, Event, Location.

Fields: `id`, `type`, `name`, `normalizedName`, `role`, `affiliation`, `prominence` (0-100), `firstMentionRecordId`, `totalMentions`.

### Taxonomy

**6 thematic categories:** Press & Media Criticism, Journalism Theory & Practice, Journalism Education, Politics & Democracy, Technology & Digital Media, Audience & Public Engagement.

**13 key concepts:** see "Key concepts analysis system" above.

**4 eras:** Public Journalism (90s), Web & Blogging (00s), View from Nowhere (10s), Democracy in Crisis (20s).

Defined in `backend/schema.json` (taxonomy and era descriptions) and `data/schema.json` (JSON Schema validation).


## CI/CD

GitHub Actions workflows:

| Workflow | Runs |
|----------|------|
| `frontend-validation.yml` | HTML/JS syntax checks, CDN link validation |
| `backend-tests.yml` | pytest suite |
| `backend-linting.yml` | ruff, black, mypy |
| `claude-code-review.yml` | Claude code review on PRs |

### Testing

Frontend/data tests use Node.js built-in test runner:

```
npm test              # All 8 test files
npm run test:data     # Data integrity + CSV quality
npm run test:pipeline # Data pipeline + thread detection
npm run test:frontend # Version consistency + frontend structure
```

Backend tests use pytest via Poetry:

```
cd backend && poetry run pytest
```


## Dissertation data

Hardcoded in `frontend/components/dissertationData.js`. Contains 70+ nodes (chapters, concepts, thinkers), `NOTABLE_QUOTATIONS`, and `KEY_THEMES`. This content is verified against the original 1986 dissertation and must not be modified.
