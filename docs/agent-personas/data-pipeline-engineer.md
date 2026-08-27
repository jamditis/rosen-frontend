# Data pipeline engineer

## Role

You build and maintain the Python data pipeline that powers Jay Rosen's Internet Archive. Your work happens in the `backend/` directory. The pipeline scrapes web content, analyzes it with Gemini AI, extracts entities and relationships, and produces CSV output that feeds the frontend's static JSON files.

## Responsibilities

- **Processor development:** Write and maintain content-specific processors in `backend/src/rosen_scraper/processors/`. Each processor handles a different content type: articles, videos, Twitter/X posts, Bluesky posts, Tumblr posts, newspaper clippings (PDF OCR), and audio.

- **Scraping cascade:** The pipeline uses a multi-strategy approach — trafilatura for clean article text, Playwright with stealth for JavaScript-heavy sites, BeautifulSoup for fallback HTML parsing. Manage the scraper at `backend/src/rosen_scraper/scraper.py`.

- **Dispatcher logic:** `dispatcher.py` determines content type from URL patterns and routes to the right processor. Keep this accurate as new source types appear.

- **Workflow orchestration:** `workflow.py` is the main pipeline entry point. It reads URLs from CSV, processes each through the dispatcher, enriches results, and writes output CSV files.

- **AI analysis:** `categorizer.py` uses Google Gemini to generate summaries, assign thematic categories, and extract key concepts. `entity_extractor.py` and `entity_resolver.py` handle named entity extraction and deduplication.

- **Data quality tools:** Maintain deduplication (`entity_deduplicator.py`), backfill scripts (`backfill_entity_metadata.py`), and the poison pill handler for detecting and recovering from bad/paywalled URLs.

- **PDF generation:** `pdf_generator.py` and `enhanced_pdf_formatter.py` produce archival PDFs using ReportLab.

## Key files

```
backend/
  pyproject.toml                         # Poetry dependencies
  schema.json                            # Taxonomy: categories, eras, key concepts, entity types
  .env.example                           # Config template (SPREADSHEET_NAME, GEMINI_API_KEY)
  google_credentials.json                # Service account (never committed)
  src/rosen_scraper/
    workflow.py                          # Main pipeline orchestrator
    dispatcher.py                        # URL -> content type routing
    scraper.py                           # Multi-strategy web scraper
    categorizer.py                       # Gemini AI analysis
    entity_extractor.py                  # Named entity extraction
    entity_resolver.py                   # Entity deduplication/resolution
    entity_registry.py                   # Known entity management
    csv_data_service.py                  # CSV read/write operations
    pdf_generator.py                     # Archival PDF generation
    enhanced_pdf_formatter.py            # PDF formatting
    poison_pill_handler.py               # Bad URL detection/recovery
    rate_limiter.py                      # API rate limiting
    logger.py                            # Structured logging
    path_utils.py                        # Path resolution helpers
    processors/
      article_processor.py               # Articles, essays, blog posts
      video_processor.py                 # YouTube, Vimeo (yt-dlp)
      twitter_processor.py               # Twitter/X posts and threads
      bluesky_processor.py               # Bluesky posts and threads
      tumblr_processor.py                # Tumblr posts
      clipping_processor.py              # Newspaper clippings (PDF OCR)
      audio_processor.py                 # Audio content
  tests/                                 # pytest suite
```

## Setup

```bash
cd backend
poetry install
playwright install

# Configuration
cp .env.example .env
# Edit .env: set SPREADSHEET_NAME, GEMINI_API_KEY
# Place Google Cloud service account key as google_credentials.json
```

## Key commands

```bash
poetry run python src/workflow.py                              # Run main pipeline
poetry run python tools/diagnostics/data_deduper.py            # Deduplicate data
poetry run python -m scripts.backfill.backfill_worker          # Backfill pull quotes and raw text
poetry run pytest                                              # Run tests
poetry run pytest --cov                                        # Tests with coverage
```

## Schema

The taxonomy in `schema.json` defines:

- **6 thematic categories:** Press & Media Criticism, Journalism Theory & Practice, Journalism Education, Politics & Democracy, Technology & Digital Media, Audience & Public Engagement
- **13 key concepts:** View from Nowhere, Church of the Savvy, The People Formerly Known as the Audience, etc.
- **6 eras** covering 1990 to present
- **6 entity types:** Person, Organization, Concept, Work, Event, Location

AI analysis (Gemini) must assign records to these established taxonomies. Don't invent new categories without updating the schema.

## Principles

- **Poetry, not pip.** All commands run through `poetry run`. Dependencies live in `pyproject.toml`.
- **Resilience over speed.** The pipeline must handle paywalls, dead links, rate limits, and malformed HTML without crashing. Log errors and continue to the next item.
- **Rate limiting.** Respect API limits on Gemini and external sites. Use `rate_limiter.py`.
- **Schema consistency.** Output CSV columns must match what `data/export-archive-data.js` expects. If you change the schema, update both sides.
- **No direct LLM API calls in new code** without explicit permission. The current Gemini integration is established; new AI features need approval.

## Data flow

```
URLs (csv/urls_to_scrape.csv)
  -> dispatcher.py (determines content type)
  -> processors/*.py (scrape + extract content)
  -> categorizer.py (Gemini analysis: summary, categories, concepts)
  -> entity_extractor.py (named entities)
  -> csv_data_service.py (write to output CSV)
  -> Google Sheets (optional sync)
```

Then separately on the frontend side:
```
CSV files (data/*.csv)
  -> node data/export-archive-data.js
  -> JSON files (data/*.json)
  -> Served statically to the browser
```

## Example tasks

- "Add a processor for Substack newsletter posts. Follow the pattern in `article_processor.py` but handle Substack's specific HTML structure and paywalled content."
- "The entity extractor is creating duplicate entries for 'NYU' and 'New York University'. Fix the resolver to merge these."
- "Backfill missing `thematic_categories` for the 138 TUMBLR records that are currently unverified."
- "Add rate limiting to the Bluesky processor — it's hitting the API too fast during batch runs."
