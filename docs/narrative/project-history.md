# Project history

Jay Rosen's Internet Archive is a public collection of the works, critiques, and teachings of Jay Rosen, professor of journalism at NYU since 1986. It covers four decades of journalism criticism, media theory, and public life. The project was built and is maintained by Joe Amditis.

This document is the primary historical record of the project, covering its development from inception in June 2025 through its current state. For an internet archive, maintaining its own historical record is both appropriate and necessary.

---

## The goal: creating a central archive

Jay Rosen's work on journalism and media has been published across dozens of websites, blogs, and platforms over several decades. PressThink posts, academic papers, newspaper op-eds, YouTube appearances, tweets, Bluesky threads, Tumblr posts from his time at Studio 20 NYU -- the body of work is scattered. As websites change and links break, pieces of it disappear.

The goal of the project is to create a single, stable, searchable archive. Not just a list of links, but a structured dataset with AI-powered analysis, entity extraction, and relationship mapping that turns a flat collection into a research tool. The archive is live at `pressthink.org/j/rosen-archive/`.

Rosen is known for several concepts that have shaped how people think about journalism: "the view from nowhere," "audience atomization overcome," "the people formerly known as the audience," and "the church of the savvy," among others. The archive aims to preserve not just the individual works but the intellectual network connecting them.

---

## Building the data pipeline

### Initial architecture (June-July 2025)

Development began in late June 2025 with the core Python data pipeline: `workflow.py`, `scraper.py`, and `categorizer.py`. The first version could scrape a URL, run it through Gemini for AI analysis, generate a PDF, and write the results to a Google Sheet.

The earliest challenges were foundational. A `ModuleNotFoundError` for the `audioop` module traced to Python 3.12+ incompatibility, forcing a migration to Python 3.11. Audio processing failed until FFmpeg was installed and added to PATH. A silent execution failure in the workflow script turned out to be a `NameError` from a bad refactor, and an "API key not valid" error was caused by curly quotes in the `.env` file instead of straight quotes.

By early July, the pipeline had grown to handle multiple content types. A content-type dispatcher (`dispatcher.py`) examined each URL and routed it to a dedicated processor: articles, YouTube videos, or audio files. YouTube processing used `yt-dlp` for metadata and audio extraction, with Google Speech-to-Text for transcription. Audio processing was re-architected to use Google Cloud Storage for asynchronous transcription of large files, with memory-efficient chunking to prevent errors on long recordings. Transcribed text was sent through the same Gemini analysis pipeline as articles.

A Flask API backed by a Google Cloud Function provided a REST interface between the frontend and the data, with mandatory API key authentication and CORS headers. Error handling was hardened to return generic messages for unexpected exceptions while logging specifics server-side.

A meaningful ID generation system was introduced early, creating publication-based prefixes from URLs: `pressthink.org` became `PRESSTH-00001`, `cjr.org` became `CJR-00001`. This made the archive navigable and gave each record a stable identity. The initial generation was inefficient -- reading the entire ID column from Google Sheets for every URL -- but was later refactored to read all existing IDs into an in-memory set at startup.

A bulk URL discovery script (`discover_urls.py`) crawled `archive.pressthink.org` to populate the processing queue, and the workflow checked for official transcripts from sources like C-SPAN to bypass expensive API transcription calls when free alternatives existed.

### PDF generation

Each processed record received a formatted PDF. The initial generator evolved through several iterations: first a basic ReportLab output, then a professional layout with centered headers, 24pt titles, 14pt metadata, 12pt body text, and proper spacing. Pull quotes were styled as 14pt paragraphs. A specialized audio transcript formatter preserved timestamps ([HH:MM:SS]) and speaker identification.

A PDF accessibility system was built alongside the generator: a checker implementing WCAG 2.1 AA, PDF/UA, and Section 508 standards with a 0-100 scoring system, an accessible generator with semantic markup and screen reader optimization, and an integration tool combining generation with real-time compliance evaluation. Batch generation of 49/50 test PDFs achieved a 98% success rate.

### The scraping cascade

The biggest ongoing challenge was web scraping. Major news sites use anti-bot detection that blocked even Playwright. The result was frequent `net::ERR_HTTP2_PROTOCOL_ERROR` and timeout errors.

The solution evolved into what became known as the "scraping cascade" -- a multi-stage approach where the system tries progressively heavier tools:

1. **Stage 1 (August 2025):** Google's URL Context tool via the Gemini API, which uses Google's infrastructure to retrieve content and bypass many anti-bot measures. This was a significant breakthrough when it was integrated.
2. **Stage 2:** A fast HTTP request with `requests` and text extraction via `trafilatura`.
3. **Stage 3:** Playwright with `playwright-stealth`, rendering the page in a full headless browser to extract content from JavaScript-heavy sites.

The cascade maintained backward compatibility -- if the fastest method failed, the system automatically fell back to progressively more capable (and slower) approaches.

### Multi-stage AI processing

In late July 2025, the monolithic `categorizer.py` was replaced with a multi-stage AI pipeline. `ai_analyzer.py` handled summarization and metadata extraction (title, author, publication date -- things scraping often missed), while `ai_classifier.py` handled thematic classification using a predefined `schema.json`. This separation allowed more specialized prompts and better error handling.

The AI processing used the Gemini API throughout. Each record received a summary, thematic categories, key concepts, era classification, scope analysis, and contextual tags. The 30-column schema in the Google Sheet captured everything from the raw text to the AI-generated analysis.

### The full production run (October 2025)

Processing all 765 URLs from the "urls_to_scrape" tab required solving several problems that only emerge at scale. Publication dates were 100% empty after the initial run, requiring two extraction systems: `simple_date_backfill.py` extracted 680 dates (93.8% success) from URL patterns, particularly PressThink URLs with embedded `/YYYY/MM/DD/` structures. An enhanced date backfill then extracted 144 additional dates from OpenGraph tags, RSS feeds, JSON-LD structured data, and video platform APIs.

Unicode encoding issues and Google Sheets' 50,000-character cell limit caused silent failures on long transcripts. The solution truncated content at 49,000 characters for the sheet while uploading full versions to Google Drive. An incremental processing architecture wrote each batch of 10 URLs immediately, eliminating the risk of data loss from interrupted runs.

Quality metrics: 100% processing completion rate, 97% publication date coverage (824 successful extractions), and proper publication-based ID generation across all domains.

### The Smart Data Corrector

A separate system was built to improve existing data without re-scraping. The Smart Data Corrector evaluated each record's `raw_text` quality score, re-analyzed content through AI only when the score was below 0.7, and used cached content when quality was acceptable.

Testing on 42 real records revealed the system's strengths and limits. Article processing (rows 1-25) performed well: all 25 records had quality scores above 0.7, triggering the caching strategy. Average cost was $0.0045 per row -- far below the $0.50-$1.00 baseline for full reprocessing.

Multimedia content (rows 27-42) told a different story. Six distinct edge case types were discovered:

1. **Silent videos:** YouTube creators who disabled captions, requiring deferred audio transcription at ~$0.48 per video
2. **Repetition pollution:** Auto-generated captions arriving with every phrase repeated 3 times, caused by a `youtube-transcript-api` library update that changed from class methods to instance methods
3. **Cell limit barriers:** YouTube transcripts for 1+ hour videos exceeding Google Sheets' 50,000-character hard limit
4. **Empty SoundCloud descriptions:** Tracks with no description, leaving the processor nothing to analyze
5. **Parameter mismatches:** Code bugs in cost tracking that unit tests hadn't caught
6. **False positive quality scores:** The validator returning 0.82 for completely empty text because it didn't check for empty strings

Rather than treating these as isolated bugs, they were documented as an edge case library (`EDGE_CASES_AND_SOLUTIONS.md`, 490+ lines) with root cause analysis, multiple solution approaches, and a priority matrix for future development.

### Architectural pivot: Google Sheets as single source of truth

An early architectural tension existed between the backend (which wrote to Google Sheets) and the frontend (which was initially planned to use Supabase as a separate database). The decision was made to eliminate Supabase entirely and use Google Sheets as the single source of truth, with a Google Cloud Function as the API layer. This reduced vendor dependencies, simplified deployment, and lowered costs.

This decision held until December 2025, when the architecture shifted again to static files (described in the data architecture section below).

---

## The public frontend

### From simple list to interactive archive

The public frontend began in August 2025 as a standalone HTML/CSS/JS page that pulled data from the published Google Sheet CSV. The first version had live search, pagination, a "Clear Search" button, and a dropdown for users to select page sizes (15, 21, 36, or 45 records). A user-selectable page size seems like a small thing, but it was part of a broader design principle: give users control over how they browse a large dataset.

The project adopted a "journalistic" and "typewriter" aesthetic from the start, using Special Elite for display headings and Roboto Mono for body text, with a muted, paper-like color palette. This gave the archive a distinct character that set it apart from generic data browser interfaces. Color-coding was introduced so that each unique tag was consistently assigned a specific color, making it easier to visually identify related concepts across different records. Up to three "Key Concept" tags appeared directly on each record card for at-a-glance content understanding.

A significant challenge emerged from the data itself. The raw data from Google Sheets contained inconsistent formatting -- some fields held JSON arrays, others semicolon-separated strings, and some were a mix (e.g., `Value 1; ['Value 2', 'Value 3']`). A client-side data cleaning pipeline was built to parse these mixed formats, standardize dates to YYYY-MM-DD, clean up titles by removing redundant publication names after delimiters, and filter out records missing an ID, title, or valid publication date.

### The "manila folder" metaphor

The record cards were redesigned to resemble manila file folders, with a protruding tab showing the publication date. Clicking a card triggered a subtle expansion animation before opening a detailed modal. The modal used a two-column layout resembling an open folder: textual information on one side, color-coded clickable tags on the other.

This metaphor -- the archive as a physical filing system -- became a recurring design theme that influenced later decisions about the visual system.

### Frontend analytics and query tools

An analytics dashboard was added in December 2025, integrating sql.js (SQLite compiled to WebAssembly) for in-browser database queries. Users could run pre-built visualizations (records by year, category, era) or write custom SQL against the archive data.

To make this accessible to non-technical users, a "mad-libs" style query builder was created. Thirteen pre-built query templates presented sentence-based interfaces with color-coded inputs (amber for dropdowns, sky for numbers, green for text). Users could find records by year, compare eras, discover top categories, or find records mentioning specific people -- all without knowing SQL. An optional "Show SQL" button revealed the underlying query for learning.

### Zero-build architecture

A foundational technical decision was to build the frontend with zero build tools. No npm, no webpack, no Vite for the production site. React 18 loads via CDN (`esm.sh`), template syntax uses HTM (a JSX alternative that works in vanilla JS), and all modules are native ES imports. The only Node.js usage is for data generation (`export-archive-data.js`) and testing (`npm test`).

This constraint simplified deployment -- the site is hosted on WordPress via FTP upload -- and kept the frontend accessible to non-frontend developers. It also meant the frontend could run from a simple `python3 -m http.server 8000` for local development.

### Frontend evolution in October 2025

The frontend went through significant evolution during October 2025. The internal relationship explorer was rebuilt with a sticky header, collapsible color key, and responsive control chips. PNG exports were improved to clone the canvas and add a caption band with the record's title and ID. An "Influence" route was added to present concept narratives and archived provenance.

The main explorer was modularized from a single-file build into ES modules with design tokens. Rich record modals were restored to surface publication metadata, pull quotes, YouTube embeds, related/responds chips, resource links, and notes. A bundled `sample-data.csv` fallback was added so the archive could run offline for demos.

### The dissertation launch (December 2025)

In December 2025, the archive expanded to include Jay Rosen's 1986 NYU dissertation, "The Impossible Press: American Journalism and the Decline of Public Life," advised by Neil Postman. Nine interactive tools were built for the dissertation:

1. **Interactive mind map** -- Dissertation structure visualization in the main archive
2. **Network explorer** -- Canvas-based entity relationship visualization
3. **Then and now comparison tool** -- Seven 1986-vs-2025 comparisons
4. **Glossary** -- Sixteen key concepts with filtering
5. **1986 in journalism** -- Historical media landscape context
6. **Timeline** -- Fourteen entries from dissertation to present
7. **Annotated excerpts** -- Twelve key passages with 2025 commentary
8. **FAQ / "ask the dissertation"** -- Forty-six Q&A pairs with search
9. **Dissertation reader** -- Full text reader with selection sharing and citation tools

The reader included a text selection context menu with share, cite, and copy functions. The share button generated a 1200x630 canvas-based PNG for social media, and the cite button produced APA-format citations with chapter detection. A Google NotebookLM integration allowed users to explore the dissertation conversationally.

Each tool was built as a standalone HTML page in the `/dissertation/` or `/features/` directory, following the zero-build architecture. The dissertation content in `dissertationData.js` -- 70+ nodes, notable quotations, and key themes -- was verified against the original and treated as sacred data that should not be modified.

The soft launch was December 2, 2025, after a UX polish pass across all eight dissertation-related tools. This pass implemented 11 major improvements: mobile-first responsive design with `flex-col md:flex-row` patterns, visual hierarchy standardization (consistent heading sizes across all tools), smooth scroll animations with viewport-triggered fade-ins, skip navigation for accessibility (WCAG 2.1 AA compliance), an improved card design system, enhanced interactive states with hover and focus effects, a consistent stone color palette, typography refinement with proper line heights and letter spacing, NotebookLM integration (fixing placeholder links that had persisted through multiple update attempts), enhanced sticky navigation with backdrop blur, and print-friendly styling.

Lighthouse scores improved by 4-5 points on desktop (to 92-96), 5-7 points on mobile (to 82-88), and 8-10 points on accessibility (to 95-98).

---

## Data architecture evolution

### Google Sheets era

For the first several months, Google Sheets was the runtime data source. The frontend fetched data via the Google Sheets API on every page load. This worked but had problems:

- 800-1500ms latency per page load depending on Google's servers
- CORS overhead requiring preflight requests
- Archive availability tied to Google's uptime
- Three separate network calls (records, entities, relationships)
- Risk of 429 errors during traffic spikes

### CSV as intermediate format

Before the full JSON migration, data format modernization converted CSV strings into structured JSON arrays for frontend compatibility. A format converter transformed comma-separated strings in thematic_categories, key_concepts, and tags into proper JSON arrays. Relationship fields (related_to, responds_to) were upgraded from simple strings to structured objects with confidence scoring and relationship types. Entity tracking was improved with structured objects containing names, types, and confidence levels.

The schema was also enhanced with 5 new fields: platform (auto-detected from URL domains), collection_id, permissions, transcript_filepath, and verified. An automated population system handled domain-based platform detection and permission classification.

### Migration to static JSON (December 2025)

The solution was a build-time export system. CSV files exported from Google Sheets were stored in the repository's `/data/` directory (enabling version control for data changes), then processed by a Node.js script into optimized JSON:

```
Google Sheets (source of truth for curation)
    -> CSV exports (version-controlled in /data/)
    -> Node.js export script (export-archive-data.js)
    -> Static JSON files
    -> WordPress deployment via FTP
    -> Frontend loads JSON directly (~100-200ms)
```

This reduced load time from 800-1500ms to 100-200ms, eliminated external dependencies, enabled offline development, and gave the data proper version control.

The JSON generation script processed the CSV files and generated a single optimized file containing all archive records (~30,000 including social posts), named entities (~5,000), facets for filtering (categories, eras, publications, entity types), and a pre-computed autocomplete index (~35,000 terms).

### Split loading optimization

Even after the static JSON migration, the combined `archive-data.json` was 25MB -- too large for initial page load. The data was split into three files:

| File | Size | Purpose | Loads |
|------|------|---------|-------|
| `archive-core.json` | ~11 MB | Lightweight record cards | On page load |
| `archive-details.json` | ~12 MB | Full summaries, quotes, concepts | On demand |
| `archive-entities.json` | ~1 MB | Entity graph for explorer | On demand |

A service worker handled caching and offline support. The result was a 67% reduction in initial load size. The full combined JSON remained as a fallback if the split files failed.

### Workflow for data updates

The new workflow separated curation from deployment:

1. Curate in Google Sheets (add/edit records)
2. Export CSVs from Google Sheets
3. Replace CSV files in `/data/` directory
4. Generate JSON: `node data/export-archive-data.js`
5. Deploy JSON files to WordPress via FTP

Google Sheets remained the curator-friendly editing interface while the static architecture eliminated runtime dependencies.

---

## Entity extraction and knowledge graph

### The challenge: from records to relationships

By October 2025, the archive contained 480+ processed records with detailed content and AI analysis, but the data structure was flat. Each record existed in isolation. There was no systematic way to answer questions like: What are all the articles where Jay Rosen discusses The New York Times? Which people and organizations appear together most frequently? How do concepts like "view from nowhere" connect to specific journalists and institutions?

The goal was to extract every significant person, organization, concept, work, event, and location mentioned across all records, normalize their names to prevent duplicates, and map the relationships between them.

### The Entity Registry

The critical technical breakthrough was the Entity Registry, an in-memory deduplication system. Without it, "The New York Times," "NY Times," and "NYT" would be treated as three separate entities, fragmenting the knowledge graph.

The registry worked by loading all existing entities from Google Sheets at the start of processing, normalizing names (removing "The," converting to lowercase, stripping punctuation), maintaining a mapping of normalized names to canonical IDs, and only generating new IDs for genuinely new entities. This ensured that across all records, each unique real-world entity received exactly one canonical ID -- P-00001 for Jay Rosen, O-00001 for The New York Times, and so on.

### Production run

The full-scale extraction ran over approximately 8 hours, processing 480 records (rows 19-498 in Google Sheets) with careful rate limiting (6-second delays between API calls, 30-second cooldowns between batches of 50). Progress tracking via JSON state files saved state every 5 records, enabling graceful resumption after interruption. Built-in validation detected invalid relationship types and logged them for review.

Initial results: 4,724 unique entities extracted and 5,455 relationships identified.

Entity type distribution:
- 52% People (journalists, media figures, politicians)
- 32% Organizations (news outlets, institutions, companies)
- 9% Works (books, articles, studies)
- 6% Concepts (journalism theory concepts)
- 5% Events (conferences, media events)
- 4% Locations (cities, countries)

A verification script confirmed data population but found a minor discrepancy between sheet row counts (4,477 entities, 5,082 relationships) and progress file totals (4,724 entities, 5,455 relationships) -- likely due to the Entity Registry's deduplication preventing some writes, or batch write timing.

The data was organized into two complementary Google Sheets tabs. The `extracted_entities` tab gave each entity a profile: canonical ID, display name, normalized name, role, affiliation, prominence score, first mention, total mentions, and related entities. The `extracted_relationships` tab captured how entities interact: source record, both entity endpoints, relationship type, a context snippet showing the relationship in the text, confidence score, and extraction date.

### Schema expansion

A subsequent 100-record incremental run (RECORD-00510 through RECORD-00609) revealed that the AI was generating relationship types not present in the schema. Analysis of validation debug logs showed these were legitimate: "Owns" for media company ownership (e.g., "Community News Company owns Watertown TAB"), "Founded By" for organizational founding, "Pioneered" for intellectual innovation (e.g., "Dave Winer pioneered blogging"), "Inspired By" for influence relationships. Without these types, approximately 10-15% of extracted relationships were being discarded.

Five new types were added to the schema (v2.0 to v2.1). Rather than reprocessing the full archive ($0.12), a targeted augmentation system was built to extract only the new relationship types from high-value records. Records were scored as high-value if they mentioned Jay Rosen, contained key concepts, used founding/creation language, referenced major media organizations, or contained influence language. Of 657 records scanned, 558 (85%) qualified as high value. The augmentation added 856 new relationships at a cost of approximately $0.04 -- about $0.00005 per relationship.

After augmentation, the knowledge graph contained 5,482 entities and 7,016 relationships across 15 relationship types -- a 13.9% increase in relationships and 50% increase in relationship type diversity.

### Entity extraction schema v3.0

The entity extraction schema went through a third revision to fix a critical pattern: the system was creating self-referential entities. A blog post by Jay Rosen would generate an entity "Jay Rosen Founded [this blog post]" when the correct relationship was authorship (already captured in metadata). The v3.0 schema added an "Authored By" relationship type, record context awareness (so the extractor knew not to create entities for the current record), and negative examples showing what not to extract. A test suite validated that the new schema produced no self-referential entities and reserved "Founded" for organizations only.

### Later extraction at scale

In December 2025, entity extraction was run on 10,000 prioritized social media posts (Twitter and Bluesky) using 5-worker parallel processing with a `ProcessPoolExecutor` using spawn method. Per-worker rate limiting (2 seconds between calls) achieved an effective throughput of ~2.5 posts per second across all workers, reducing processing time from an estimated 7 hours to 91 minutes. Cost: approximately $50, within budget.

Results: 25,972 entities and 16,197 relationships extracted. Error analysis showed a 9.88% nominal error rate (988 out of 10,000), but examination of all errors revealed that 99.8% were legitimate -- posts containing no extractable entities (single-line reactions, reposts without commentary, etc.). Only 2 out of 10,000 posts had actual processing failures (0.02%), caused by minor JSON formatting issues from Gemini.

The extraction pipeline had been modernized for this run. The original code had a hidden Google Sheets dependency; new CSV-native extraction scripts were created with proper field collection to handle the variable entity types that Gemini returned.

---

## New content types

### Three-system integration planning (October 2025)

Before the new content types could be imported, a planning phase mapped the integration of three separate systems:

1. **DeepSeek-OCR system** -- 84 newspaper articles (1989-2023) in a SQLite database with FTS5 full-text search, OCR'd with Tesseract at 100% success rate, but with no AI analysis or entity extraction
2. **Rosen Scraper backend** -- 613 processed records in Google Sheets with 5,482 entities and 6,672 relationships
3. **The public frontend** -- displaying 765 records

The integration goal was a unified archive of 849 records spanning 36 years with 6,000+ entities and 7,500+ relationships. A 60-page integration plan was created covering system state analysis, schema mapping between SQLite, Google Sheets, and the frontend, and a 5-phase implementation plan (17 tasks total) with an 8-12 week timeline.

The total AI processing cost for integration was estimated at $1.18: $1.01 for newspaper AI analysis (84 articles at ~$0.012 each) and $0.17 for newspaper entity extraction. Google Sheets was chosen as the consolidation target (single source of truth) over SQLite (which lacked collaboration features) or a hybrid approach (too complex).

### Tumblr import

In December 2025, 138 Tumblr posts from Jay Rosen's Studio 20 NYU blog were imported. The Tumblr export was processed by `tumblr_processor.py`, which parsed HTML export files and extracted dates from `<time datetime="">` tags and titles from `<h2>` tags. Posts received IDs from TUMBLR-00001 through TUMBLR-00138 and covered multiple post types: text, quote, link, photo, video, audio, answer, and chat.

### Newspaper clipping OCR

Eighty-four newspaper clipping PDFs with Jay Rosen mentions were hand-selected for import. Extracting text from these proved harder than expected.

Three approaches were tried:
1. **Gemini Vision OCR** -- Processed 84 PDFs, found content in 58, missed 26
2. **Claude Vision OCR** -- Also missed small text mentions even with a quadrant approach
3. **Traditional Tesseract OCR** -- Successfully found mentions the AI vision models missed

The root cause: AI vision models struggle with small text (8-10pt) in compressed full-page newspaper scans. The final solution used Tesseract with a multi-pass approach: full page scan at 300 DPI, then four overlapping quadrants for small text. Pattern matching caught variations like "Jay Rosen," "J. Rosen," and "Professor Rosen." Fair use compliance was maintained by storing excerpts only and linking to sources via newspapers.com URLs.

The clipping processor generated publication-specific IDs (`NYT-XXXXX`, `WSJ-XXXXX`, `CLIP-XXXXX`) and supported 12 major publications with confidence scoring for extracted metadata.

### Social media threads

Bluesky thread reconstruction parsed 3,071 posts using AT Protocol URIs, built thread hierarchies with 171 parent-child connections, and identified 1,907 orphaned replies (replies to other users' posts). The deepest thread was 32 levels; the largest contained 33 posts.

A `ThreadModal.js` component displayed threads with depth-based color coding (sky -> green -> amber -> pink) and nested indentation. Ten major threads were generated as THREAD-* archive records and integrated into the main archive.

### Twitter/X integration

A Twitter processor handled both `twitter.com` and `x.com` URLs using Nitter proxy instances (4 fallbacks) with Playwright as a final fallback. It supported full thread extraction with numbering, quote tweet handling, and media alt-text extraction. A separate thread reconstruction system for Twitter was built alongside the Bluesky thread system, ready for processing but not yet run at scale.

All three new content type processors (Twitter, Tumblr, newspaper clippings) were integrated into the main pipeline's dispatcher with URL-based routing and connected to the shared AI analysis pipeline via the article processor's analysis function. Schema updates added "Tumblr Post" and "Newspaper Clipping" to the content_format array; "Tweet/Thread" was already present.

---

## Data quality and taxonomy

### The categorization failure

In September 2025, a review of the production dataset revealed that AI categorization had failed silently across all 725 records. Every record had identical values: "Press & Media Criticism" for thematic categories, empty key concepts, "Digital Media & Platform Era (2017-Present)" for era, "Media Analysis" for scope, and "journalism, media" for tags. The uniqueness ratio was 0.1% -- it should have been 60-80% for proper categorization.

Investigation traced the problem to the bulk reprocessor's code pattern:

The AI analysis function `summarize_and_classify()` was called successfully. Results were stored in an `analysis` variable. But the only thing written to the sheet was a note column update saying "AI analyzed." The target columns (summary, thematic_categories, key_concepts, tags, pull_quote) were never touched. When the AI call failed, silent error handling caught the exception and fell back to hardcoded defaults -- the same defaults that appeared in every record.

This was the most significant data quality incident in the project's history. The fix required explicit `worksheet.update_cell()` calls for each analysis field, specific success messages ("Wrote 5 fields to sheet" instead of ambiguous "AI analyzed"), and field counters tracking actual writes. The incident led to the creation of `CRITICAL_WARNINGS.md`, a mandatory pre-flight checklist for any AI processing scripts, with four warning categories and a required testing workflow.

Key rules from that incident: never trust that a script is working because it doesn't crash -- verify output in the actual data store. Test on 5 rows, then 25, then 100. Never skip to a full dataset. If it costs money, verify the money bought something useful.

### A similar bug: analysis without writing

A later session discovered that the Smart Data Corrector had the same pattern -- AI analysis was performed and paid for ($0.53 across 80 rows) but results were stored in a variable and never written to Google Sheets. The old broken script was still running in the background when the fix was being tested. This reinforced the testing discipline: small batches, verify output, kill background processes before testing.

### Data completeness and quality tools (September 2025)

Before the entity extraction work, a data analysis and improvement system was built. A CSV analysis framework evaluated the entire 610-record archive across 39 fields, providing quality assessment, content categorization, temporal analysis spanning 32+ years, and AI analysis quality evaluation.

The data completeness work achieved measurable improvements:
- Publisher data: improved from 7.9% to 94.3% completeness by mapping original_publication to publisher fields
- Relationship tracking: built an influence tracking system achieving 21.6% coverage through content mining and pattern recognition
- Content relationships: enhanced responds_to relationships to 69.5% and related_to connections to 33.4% through automated content analysis
- Series classification: enhanced series identification with pattern matching for major works
- Overall data completeness: increased from 60.2% to 73.8% across all fields

A repair system addressed 27 problematic records (rows 575-610) with specific failure patterns including 54.3% title extraction failures and 60% PDF generation failures. The influence tracking system scanned 486 relationship indicators across summary, excerpt, raw_text, and title fields, using regex patterns to identify "responds to," "influenced by," and similar relationships.

### Key concepts: from 90 to 13

Analysis of the key concepts field revealed 90 unique concept values with inconsistent capitalization and many non-schema entries. The taxonomy was expanded from 8 to 13 concepts through two phases:

**Data analysis additions:** "Horse-race journalism" and "false balance," both appearing frequently in existing data.

**High authority additions from Jay Rosen's own notes:** "The Citizens' Agenda," "Not the odds but the stakes," and "Mindcasting" -- concepts Jay himself identified as important. The authority weighting principle was established: Jay Rosen's identified concepts take precedence over data analysis patterns.

A production processing system (`key_concepts_updater.py`) used Gemini 2.0 Flash Lite to process records in three modes: filling empty fields, recommending changes to existing assignments, or noting why a row was skipped. Processing 200 rows with zero errors achieved a 98% update rate. Strict schema validation with case-insensitive normalization replaced the previous chaos.

### Schema optimization and workflow consolidation (October 2025)

After months of iterative development, the project underwent a consolidation effort. The final two tasks (07 and 09) of a 9-task optimization plan were completed:

- A cross-reference analysis system built intelligent relationship discovery with dual functionality: multi-factor similarity analysis for thematic connections and explicit mention detection for discourse mapping
- An advanced error management system with session summaries and poison pill detection for content quality validation

The active codebase was reduced from 42 to ~25 files by moving 12 legacy scripts to an archive directory. Overlapping workflows were consolidated and redundant processor versions eliminated. Analysis of 598 records confirmed excellent data quality (96%+ completion for core fields) while identifying underutilized fields: platform (0% populated), notes (0% populated), and influence (0% populated, specifically designed for future web search operations to track citations of Rosen's concepts in other works).

### Taxonomy consolidation

After importing Tumblr posts and newspaper clippings in December 2025, the CSV data had accumulated significant inconsistencies:

- **14 overlapping era variations** with 13 overlap issues. For example, 2005-2009 was claimed by both "The Rise of the Web & Blogging (2000-2009)" and "Peak Blogging & Citizen Journalism (2005-2009)."
- **862 tags with case variations.** "New York Times" (50 records) and "new york times" (47 records) were treated as different tags. 2,992 tag instances needed normalization.
- **Schema violations.** 10 content_type values and 5 scope values not in the schema, plus an unexpected column.
- **Key concepts case issues.** "View from Nowhere" vs "View From Nowhere" vs "view from nowhere."

The consolidation reduced 14 overlapping eras to 8 clean, non-overlapping periods:

1. Early career & public journalism (1990-1999)
2. Blogging launch & digital disruption (2000-2004)
3. Peak blogging & citizen journalism (2005-2009)
4. Social media & financial crisis (2010-2015)
5. Trump era & democratic crisis (2016-2019)
6. COVID-19 & misinformation crisis (2020-2021)
7. Post-Trump transition (2022-2024)
8. Second Trump administration (2025-present)

A key decision was to split the original 2016-2020 and 2021-present eras to capture COVID-19 and the second Trump administration as distinct historical periods. These eight eras track major shifts in journalism history: from the civic journalism movement through PressThink's launch and post-9/11 critique, the newspaper collapse and pro-am experiments, the rise of Twitter/Facebook and "view from nowhere" critique, the 2016 election coverage failures and "not the odds but the stakes," the pandemic verification crisis, newsletter economics and AI emergence, and the return of democratic journalism questions in the second Trump administration.

Era assignments used publication dates rather than existing (potentially wrong) assignments, preventing propagation of old errors.

Tag normalization preserved the most common casing variant -- for example, "new york times" (97 occurrences) and "New York Times" (50 occurrences) were both normalized to "New York Times" since the title case variant existed. Content types were mapped to schema equivalents ("Video" -> "Interview (Audio/Video)", "Podcast" -> "Interview (Audio/Video)"). The unexpected `colQ_changes` column was removed from all 659 records.

All consolidation scripts created timestamped backups, generated preview files for review, and required manual approval before applying changes. This safety-first approach meant changes could always be rolled back.

Results: 650 of 659 records changed (98.6%), 623 eras reassigned, 2,992 tag instances normalized, 100% schema compliance achieved.

---

## The design system shift

### The problem with "AI slop"

By December 2025, the frontend used a generic aesthetic: bright Tailwind colors (sky-500, pink-500), pure white backgrounds, predictable stone palette. The feedback was direct: the design converged toward generic outputs and didn't feel like an archive of journalism history.

### The vintage archive aesthetic

The design system overhaul in version 2.26.0 replaced the generic corporate look with a vintage archive aesthetic inspired by walking into a 1980s university research library. Every design choice was mapped to a physical archival material:

- **Background:** Changed from `#fdfbf7` to `#f5f1e8` (aged newsprint with warm yellow undertone)
- **Cards:** Changed from pure white to `#fdfcf9` (cream card stock)
- **Accent sky:** Changed from `#0ea5e9` (bright Tailwind) to `#2c5f82` (faded blue ink from old newspapers)
- **Accent green:** Changed from `#22c55e` to `#3a5f3f` (library card catalog green)
- **Accent amber:** Changed from `#f59e0b` to `#d4a574` (classic manila folder tan)

Additional atmospheric details: paper grain via SVG fractal noise, subtle aged stains via radial gradients, 32px repeating horizontal lines mimicking ruled index cards, triangular dog-eared corners on card elements, filing tab notches on badges, and torn paper dividers using wavy SVG edges.

### Design system infrastructure

The implementation created 200+ CSS custom properties in `/frontend/design-system/tokens.css` covering colors, typography, spacing, shadows, transitions, and z-index scales. Six reusable components were built (Modal, Button, Header, Card, LoadingState, ErrorState), all following the zero-build architecture.

### Process lessons

The initial plan was to deploy subagents in five waves to systematically update all components. The automated edits broke layouts by mixing inline styles with Tailwind. All component changes were reverted, keeping only the foundation work. The final approach: subagents for inventory and foundation, manual review and refinement for actual design, testing on a demo page before applying to the main app. The lesson was that distinctive design requires human judgment, not automated mass edits.

---

## Dissertation tools

The nine dissertation tools (described in the frontend section above) were built between November and December 2025. The dissertation's central argument -- that the phrase "the press informs the public" obscures more than it reveals, and that journalism is a transaction rather than just an action -- resonated with four decades of subsequent work that the archive documents.

The content was verified against the original 1986 dissertation, and teaching materials were created alongside the interactive tools:

- **Discussion questions** (207 lines) covering all chapters with three levels per section (comprehension, analysis, application), plus five debate topics
- **Syllabus materials** (362 lines) with five course contexts, three reading assignment formats, four classroom activities, essay prompts, assessment rubrics, and instructor notes

The dissertation reader featured a 3D concept sphere visualization built with Three.js, showing 45+ concepts in six color-coded categories (core concepts, movements, thinkers, institutions, events, themes) with force-directed graph layout, interactive exploration, and category filtering. A dedicated landing page presented the dissertation with a hero section, "Why this dissertation matters" cards, and navigation to all tools.

The loading screen for dissertation tools rotated through nine actual quotes from the dissertation, making even wait times part of the experience.

---

## RStudio analysis

With the knowledge graph containing 5,160 entities and 7,499 relationships across 534 records, the question was how to make this data useful for researchers. Spreadsheet queries could answer individual questions, but there was no system for analyzing patterns, identifying trends, or visualizing the intellectual network Rosen's work represents.

The solution was a suite of R scripts using RStudio's data analysis and visualization capabilities. The system was designed for researchers with varying technical levels, from copy-paste commands to customizable analysis scripts. Core infrastructure included Google Sheets integration via `googlesheets4` with OAuth2, `dplyr` for data manipulation, `ggplot2` for publication-quality 300 DPI graphics, and `tidyr` for data reshaping.

A base analysis toolkit was built first: data loading from Google Sheets, structure inspection, 14 example queries, full analysis with 7 visualizations, a Jay Rosen network deep dive (15 analyses revealing 1,217 outgoing and 211 incoming relationships), and an interactive entity explorer with 7 customizable search sections.

Jay Rosen emerged as the central node with 1,428 total connections, followed by The New York Times (550), PressThink (343), The Washington Post (222), and CNN (122). The most common relationship types were "Affiliated With" (2,138 instances, 28.5%), "Discusses" (1,663, 22.2%), "Mentions" (1,128, 15.0%), "Founded By" (569, 7.6%), and "Criticizes" (514, 6.9%).

### Four specialized analyses

**Jay Rosen concept map analysis** mapped 8 concepts Rosen pioneered across 147 references and 108 unique entities. Key finding: "The people formerly known as the audience" ranked as his most influential concept with a prominence score of 10/10.

**Media industry analysis** examined engagement with mainstream versus alternative media organizations, mapping relationships including "Founded By," "Criticizes," "Discusses," and "Affiliated With."

**Public journalism movement network** mapped 15 key figures. The movement was interdisciplinary: journalists (Dan Gillmor, Jeff Jarvis), philosophers (Jurgen Habermas, John Dewey), and technologists (Craig Newmark). Jay Rosen was the central figure with 33 concept references.

**Journalism paradigm comparison** compared three paradigms. Rosen's 6 alternative concepts achieved 4x more references (150 vs. 39) and higher prominence (8.33 vs. 6.06) than 17 traditional concepts -- quality over quantity in conceptual frameworks.

### A data integrity lesson

A review of statistical claims revealed a systematic error. The widely-cited "4:1 building-to-criticizing ratio" and "120+ organizations founded" claims were traced to the R analysis scripts combining "Founded By" (institutional founding) with "Pioneered" (intellectual contribution) and mixing Organizations with Concepts in the same count. The fix separated these into distinct queries, and incorrect claims were removed from 20+ documentation files.

This incident highlighted principles for AI-assisted entity extraction: relationship types with similar surface meanings must be kept distinct in analysis, entity types must not be conflated in statistical claims, and downstream documentation amplifies upstream errors rapidly.

### Research outputs

The analyses generated 21 publication-quality PNG visualizations (300 DPI), a CSV data export for statistical software, and over 400 lines of findings documentation. All scripts read directly from Google Sheets entity extraction data and were designed with four-tier documentation: quick start, findings, technical guide, and summary.

Five key discoveries:
1. **Builder-critic profile** -- Rosen as a creator of alternative journalism infrastructure, not just a critic. This reframed the narrative from "academic critic" to "movement leader who builds solutions."
2. **Grassroots adoption** -- 59% individual adoption vs. 23% organizational, a bottom-up movement driven by practitioners rather than executives
3. **Alternative paradigm strength** -- 6 focused alternative concepts generating 150 references vs. 39 for 17 traditional concepts (4x impact with higher average prominence: 8.33 vs. 6.06)
4. **Interdisciplinary movement** -- 15 identified participants crossing journalism (Gillmor, Jarvis), philosophy (Habermas, Dewey), and technology (Newmark), with Rosen as central figure (33 concept references)
5. **Concept prominence hierarchy** -- "The people formerly known as the audience" (10/10) at the top, followed by "Rollback" (9/10), "Open Source Journalism" (9/10), "Audience Atomization Overcome" (9/10), and "Transparency" (8/10)

---

## Visualization planning

With the knowledge graph complete, research into modern archive explorer interfaces informed the creation of five product requirements documents for visualization systems:

1. **Interactive network graph explorer** -- D3.js force-directed visualization with Jay Rosen as gravitational center, color-coded entity types, and filtering by entity type, relationship type, and strength
2. **Entity-centric record explorer** -- Profile pages for every entity showing all mentions, temporal distribution charts, and export functionality (CSV, BibTeX, PDF)
3. **Timeline + entity visualization** -- Zoomable timeline spanning 1999-2025 with entity swim lanes and journalism history era overlays
4. **Knowledge graph navigation system** -- Unified search across records, entities, concepts, and topics with breadcrumb trails and saved research sessions
5. **Discourse mapping** -- Conversation thread visualization using responds_to relationships, tracking how ideas evolved through response and critique

The recommended implementation priority spanned three phases: entity explorer + timeline first (immediate research value), then network graph + navigator (discovery-oriented exploration), then discourse mapping (specialized scholarly tool). Research drew on D3.js implementations, Cytoscape.js for academic networks, and projects like Stanford's Six Degrees of Francis Bacon and ProPublica's network visualizations.

What was built: the archive's network explorer (Canvas-based entity visualization) and entity browser (search and browse extracted entities) implemented the core of options 1 and 2 in the zero-build architecture.

---

## Repository reorganization

### v2.20.0: the great restructuring (December 2025)

The largest structural change in the project's history reorganized 229 files in preparation for the public open-source release:

- Root-level JS files (`App.js`, `index.js`, `constants.js`, `html.js`) moved to `/frontend/`
- Standalone tools (comparison tool, glossary, context-1986, timeline, annotated excerpts, FAQ, dissertation reader) moved from root level to `/features/`
- The `/csv/` directory became `/data/`, with `.gitignore` updated to track it
- Legacy tools (archive-v1, the Win95-themed promotional site, BYOK chat) moved to `/archived/`
- Active development tools moved to `/tools/active/`

Standard open-source files were added: `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue templates, and a pull request template. Duplicate files were removed (saving ~800KB), including a duplicate dissertation transcription and debug screenshots.

All import paths required updating in `index.html`, `constants.js`, `archiveService.js`, and every feature tool's `index.html`. This was a breaking change -- bookmarked URLs needed `/features/` prefixes, scripts referencing `/csv/` needed to use `/data/`, and CI/CD paths needed updating.

### v3.0.0: backend modernization (November 2025)

The backend was refactored to follow standard Python conventions. All core logic was consolidated into a `src/rosen_scraper/` package. `requirements.txt` was replaced with `pyproject.toml` and Poetry. All `sys.path` manipulation hacks were removed in favor of absolute imports from the `rosen_scraper` package. Data files (processed PDFs, transcripts) were separated from source code into a top-level `/data/` directory.

### v4.0.0: pre-publication release (December 2025)

Twelve pending PRs were merged for the December 2025 launch:
- Dissertation PDFs migrated to Git LFS (~135 MB)
- GitHub Actions CI/CD pipelines added (frontend validation, backend tests, backend linting)
- Type hints added to backend Python code
- Gemini API rate limiting implemented
- Hardcoded row ranges removed from workflow scripts
- Integration tests added for the backend
- Python requirement relaxed to 3.10+
- Backend `.env.example` and README added
- Broken imports from monorepo merge fixed
- Path handling improved with `pathlib`
- All TODO/FIXME comments resolved

Validation confirmed all 28 JavaScript files passed syntax checks, all 17 HTML pages were valid, no TODO/FIXME comments remained in the frontend, and accessibility features were present on all pages.

---

## Major challenges

### The scraping arms race

Web scraping was the most persistent challenge. Major news sites actively blocked headless browsers, causing frequent protocol errors and timeouts. The solution evolved from a simple scraper to the three-stage scraping cascade (URL Context -> HTTP requests -> Playwright with stealth). Integration of `playwright-stealth` made the automated browser behave more like a human user. Google's URL Context tool, integrated in August 2025, provided a breakthrough by using Google's infrastructure to retrieve content.

### API rate limiting

During batch processing, the Google Sheets API returned 429 RESOURCE_EXHAUSTED errors. The initial approach of checking for duplicate IDs by reading from the sheet for every URL was the primary cause. Refactoring to read all existing IDs into an in-memory set at startup eliminated the problem. Later batch operations used intelligent chunking (100-record batches), per-operation rate limiting (6-second delays), and progress tracking with resume capability.

### Silent failures

Early in development, scripts would fail without error messages. Debugging required adding print statements, running with verbose flags, and ultimately tracing execution in interactive Python sessions. The most expensive silent failure was AI analysis running but never writing results -- discovered only when someone asked whether the re-analysis was actually doing anything with the results. The $0.53 wasted on that bug was small, but it led to the project's testing discipline: always verify output in the actual data store.

### The AI categorization system failure

All 725 records in the production sheet had identical AI-generated values -- a complete loss of content classification diversity. The bulk reprocessor's AI calls were succeeding but the results were caught in a variable and never written. Hardcoded fallbacks silently replaced what should have been unique analysis. This was traced to silent error handling that suppressed failures and fell back to static defaults. The fix required explicit write verification for every field and the establishment of mandatory testing workflows.

### Edge cases in multimedia processing

Production testing on 42 records exposed six distinct edge case types: YouTube videos with disabled captions, auto-generated captions with 3x word repetition and metadata pollution (from a `youtube-transcript-api` library update), Google Sheets 50,000-character cell limits exceeded by long transcripts, empty SoundCloud descriptions, code bugs in cost tracking parameters, and false positive quality scores on empty text. Each was systematically documented in an edge case library with multiple solution approaches, cost/benefit analysis, and decision workflows.

### Taxonomy drift

Manual data entry over months accumulated inconsistencies that went unnoticed until import of new content types forced a review. Fourteen overlapping era definitions, 862 tag case variations, and 16 schema violations had built up. The lesson: schema validation should be regular and automated, not deferred until a crisis.

### Entity extraction precision

The "Founded By" vs "Pioneered" conflation in R analysis scripts turned a data nuance into a documentation problem. One incorrect analysis propagated to dozens of files. AI extraction with low confidence thresholds (0.5) created false positives that compounded through downstream analysis. The fix raised thresholds, restricted relationship types to appropriate entity categories, and established regular audits of statistical claims against source data.

### PDF generation and text quality

PDF generation went through multiple iterations. The initial generator produced single blocks of text without paragraph breaks. A complete overhaul created professional layouts with proper paragraph breaks, text styling, section headers, and clean document structure. A specialized audio transcript formatter preserved timestamps and speaker identification. Accessibility compliance (WCAG 2.1 AA) was added with proper document structure, readable fonts, and hierarchical organization.

Text cleaning addressed the quality of scraped content. A text cleaner removed HTML artifacts, navigation elements, social media content, and structural web elements. Batch processing on the first 20 records achieved an 89% improvement rate with an average 30% increase in content quality scores. All updates were written directly to Google Sheets with proper Unicode handling.

### Environment instability

The initial development in June 2025 was plagued by environment issues beyond the Python 3.12 incompatibility. Dependencies were discovered one at a time -- `python-dotenv`, `lxml_html_clean`, `playwright`, `yt-dlp`, `google-cloud-speech`, `reportlab` -- each requiring troubleshooting. The `.env` file loading required rewriting `config.py` to manually parse environment variables. Playwright required separate browser binary installation. These issues were eventually resolved through dependency pinning and the migration to Poetry.

---

## Current state

As of 2026-07-07, the archive contains:

| Metric | Value |
|--------|-------|
| Archive records (articles, essays, etc.) | 1,029 (799 RECORD, 137 TUMBLR, 83 CLIP, 10 THREAD) |
| Social media posts (Twitter + Bluesky) | 29,747 |
| Named entities | 8,152 |
| Entity relationships | 12,560 |
| Dissertation tools (live) | 4 (reader, foreword, network-effect, faq) |
| Dissertation tools (retired to `archived/dissertation-tools/`) | 6 tools (comparison, concepts, context, excerpts, glossary, timeline) + a source bundle |
| CI/CD workflows | 9 |
| Era classifications | 8 (non-overlapping) |
| Key concept taxonomy | 13 concepts |

The archive is live at `pressthink.org/j/rosen-archive/`, hosted as static files on WordPress. The frontend uses zero-build React via CDN with hash-based SPA routing. The backend is a Poetry-managed Python package. Data flows from Google Sheets through CSV to static JSON. CI/CD runs on GitHub Actions with workflows for frontend validation, backend tests, backend linting, CodeQL security scanning, post-merge dashboard sync, two Pillar 3a record-submission workflows, and Claude code review.

The frontend provides seven routes: the main archive view with record cards and filters, a folder view for browsing by category, the network explorer for entity visualization, an entity browser for search, the dissertation mind map and detail panel, an about page, and an analytics dashboard. Record deep links (`?record=RECORD_ID`) open modals on any route.

The archive data spans 1986 through 2026 — 41 years total, anchored at the early end by the 1986 dissertation and at the late end by 2026 social posts. The bulk of the non-dissertation material runs from 1989 (the earliest record in `archive_records-public.csv`) onward, a 38-year window. The 8-era classification system maps the arc from early career and public journalism through the blogging era, social media transformation, Trump-era democratic crisis, COVID-19 misinformation challenges, and the current moment.

Known issues remain: social media records (29,747) have generic titles needing AI-based title generation; browser localStorage can fill up on the live site; thread records have placeholder titles; ~200 records have zero extracted relationships because their `raw_text` is empty (issues #207/#211); 79 records still carry `verified=false`, a handful of which (e.g. The Baffler issue 12 from 1999 and the defunct Pew Center for Civic Journalism monograph from ~2000) are genuinely print-only and unrecoverable without library microfilm; and the `archive.pressthink.org` subdomain has a TLS certificate issue.

The raw text content for each record was manually extracted by the project maintainer and is treated as sacred -- any data processing must preserve the `raw_text` field intact. CSV data must always be parsed with Python's `csv` module, not bash tools (grep, cut, awk), which cannot handle quoted fields with embedded commas. These are two rules learned through experience that apply to any future work on the archive.

The dissertation content in `dissertationData.js` is similarly protected -- all quotes and attributions were verified against the original 1986 text and must not be modified, paraphrased, or fabricated.

---

## After the launch: post-publication infrastructure (January-May 2026)

The December 2025 launch did not end the project. The five months that followed reshaped how the archive is maintained, expanded, and reasoned about.

### Three pillars

Post-launch work organized itself into three pillars that emerged from the actual gaps the December launch exposed.

**Pillar 1 -- data quality and verification.** The launch shipped with roughly 800 archive records. By late May 2026 that grew to 1,030, largely from systematic recovery work. Pillar 1 covered URL fixes (e.g. RECORD-00602 and RECORD-00613 were pointing at the wrong overlay), title-drift bugs, hedging-language guards to flag AI-guesswork summaries, atomization decisions for compound records, thread-deduplication, and an ongoing reduction of the `verified=false` set from 16 down through batched Wayback CDX recoveries (issues #199, #242, #244, #253). The "raw_text is sacred" rule was reinforced repeatedly -- any data edit that destroys raw_text on existing rows is treated as a defect.

**Pillar 2 -- archive sweep.** Discovery work in May 2026 inventoried what the archive was still missing: 146 PressThink posts (issue #208), 84 HuffPost posts (issue #209), additional candidates on podcast/YouTube and social/Substack surfaces (documented in `docs/research/2026-05-25-pillar2-*`). Roughly 200 records carry zero extracted relationships because their `raw_text` is empty (issues #207, #211); the entity extraction can be rerun once the raw_text gap-fill lands.

**Pillar 3 -- submission and authoring.** The goal is a Jay-operable record submission workflow that does not require him to touch a CSV or an FTP client. Pillar 3a is the infrastructure spine: a Flask submission server at `backend/submission_server/` plus two GitHub Actions workflows (`submit-record.yml` and `sweep-stuck-rows.yml`) that pick up submissions, push CSV updates back through SFTP, and reconcile stuck rows. Pillar 3b (in design) is the authoring surface itself.

### Workflow shifts

The post-launch period crystallized a set of workflow rules that govern how new code lands. Most are externalized in `CLAUDE.md` and the `.github/copilot-instructions.md` file so both human and agent contributors operate by the same standards:

- **PR workflow, no exceptions.** Every change goes through a branch, a PR, and Copilot review. Merges wait for an explicit human "merge" -- agents never self-merge. The Copilot PR-bot reviews once per PR; pushing fixes refreshes CI but does not re-trigger Copilot, which keeps GitHub Actions usage predictable.
- **Pre-PR Codex review.** Substantive multi-file PRs run `codex exec review --uncommitted` locally before `gh pr create`. Findings that would have cost an Actions burn become free fixes pre-open.
- **Bundle related PRs.** Five PRs that touch the same files become one PR. The phrase that captures it is "slow is smooth, smooth is fast."
- **Empirically verify documentation.** When a doc says "the system does X," check that the system actually does X before relying on the doc.

### Tooling around the editing

A local preview server (`scripts/preview-server.js`) and a companion accessibility audit (`scripts/preview-audit.js`, Playwright + axe-core) are in flight in PR #257 so the archive can be reviewed at production fidelity without an FTP round-trip. The audit walks the live routes at mobile and desktop viewports, screenshots each, and writes a per-route HTML report. Together they shorten the "did I just break the live site?" loop from minutes to seconds. This section will be updated to reflect shipped state once #257 merges.

### What the post-launch period revealed

The launch made the archive's structure visible to outside readers for the first time. That surfaced two categories of work that had been invisible: factual drift in claims about the archive (counts, tool inventories, devDep lists in docs) and structural drift in the data itself (records with empty raw_text, URL pairs pointing at the wrong overlay, threads with placeholder titles). Both categories had been growing in the background throughout 2025; the December launch exposed them and the May 2026 sweep made them quantifiable.

The post-launch infrastructure is, in that sense, the archive learning to look at itself.

---

The project represents an ongoing effort to preserve and make accessible four decades of journalism criticism. It serves as both a practical research tool and a model for digital archival projects that combine human curation with AI-powered analysis. The combination of entity extraction, relationship mapping, statistical analysis, and interactive tools positions it as a working example of digital humanities infrastructure -- one that moved from preserving individual works to mapping an intellectual landscape.
