---
name: data-pipeline
description: Orchestrate backend data processing scripts for the Jay Rosen archive. Use when running data imports, entity extraction, or archive maintenance tasks.
---

# Data Pipeline Orchestration

The backend contains 25+ Python scripts for data processing, entity extraction, and archive maintenance. This skill provides the correct execution order and usage patterns.

## When to Activate

- Running data import or export workflows
- Processing new content into the archive
- Extracting entities from archive records
- Fixing data quality issues
- Regenerating JSON files from CSV sources

## Environment Setup

```bash
cd /home/user/rosen-frontend/backend

# Install the Poetry-managed dependencies
poetry install

# Install Playwright browsers (for web scraping)
poetry run playwright install
```

### Required Configuration

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

The main local workflow requires:
```
GEMINI_API_KEY="your_gemini_api_key"
```

`SPREADSHEET_NAME` and `backend/google_credentials.json` are for the separate
Google Sheets maintenance tools. They do not create the main workflow's local
CSV inputs.

## Script Categories

### Core Workflow Scripts

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `src/rosen_scraper/workflow.py` | Main processing pipeline | Local `csv/urls_to_scrape.csv` | Local dated output CSVs |
| `src/rosen_scraper/dispatcher.py` | Routes URLs to processors | URL | Processor selection |
| `src/rosen_scraper/categorizer.py` | AI analysis via Gemini | Text content | Categories, concepts |

### Entity Processing

| Script | Purpose | When to Run |
|--------|---------|-------------|
| `scripts/extract_entities_csv_batch.py` | Fixed-batch entity extraction | After new content import |
| `src/rosen_scraper/entity_extractor.py` | Single record extraction | Testing/debugging |
| `src/rosen_scraper/entity_deduplicator.py` | Merge duplicate entities | After extraction batch |
| `src/rosen_scraper/entity_registry.py` | Manage entity IDs | Automatic |

### Data Quality Scripts

| Script | Purpose | When to Run |
|--------|---------|-------------|
| `scripts/diagnostics/data_deduper.py` | Remove duplicate records | Periodically |
| `scripts/diagnostics/smart_corrector/` | Fix common errors | After quality audit |
| `scripts/backfill/backfill_worker.py` | Fill missing fields | After imports |

### Import Scripts

| Script | Purpose | Source |
|--------|---------|--------|
| `scripts/reconstruct_bluesky_threads.py` | Build thread hierarchies | social_posts.csv |
| `scripts/generate_thread_records.py` | Create THREAD-* records | Thread data |

The Tumblr posts and newspaper clippings were imported once by the now-archived
`merge_new_records.py` (see `archived/scripts/backend-oneoffs/`), not by standing
`import_*` scripts — the earlier `scripts/import_tumblr.py` and
`scripts/import_clippings.py` rows named scripts that never existed at those paths.

### Export Scripts

| Script | Purpose | Output |
|--------|---------|--------|
| `../data/export-archive-data.js` | Generate JSON from CSV | archive-*.json files |

## Common Workflows

### Workflow 1: Process New URLs

The workflow defaults to repository-root `csv/`. Before a live run, manually
export the current Google Sheets `urls_to_scrape` tab as
`csv/urls_to_scrape.csv` and the `final` tab as
`csv/archive_records-public.csv`. The first file uses
`id,url,processed_on,Notes`; `url` selects runnable rows and a nonempty
`processed_on` value is skipped by default. Lowercase `notes` is also accepted.
The archive export supplies the output header. Credentials alone do not create
either file.

For a checkout-only test with the committed snapshots:

```bash
cd /home/user/rosen-frontend
mkdir -p csv
cp data/urls_to_scrape.csv csv/urls_to_scrape.csv
cp data/archive_records-public.csv csv/archive_records-public.csv
# Optional: include social IDs and URLs in duplicate checks.
cp data/social_posts.csv csv/social_posts.csv

cd backend

# 1. Run the local CSV workflow
poetry run python src/rosen_scraper/workflow.py

# 2. Extract entities from new records
poetry run python scripts/extract_entities_csv_batch.py

# 3. Deduplicate entities
poetry run python src/rosen_scraper/entity_deduplicator.py

# 4. Regenerate JSON files
cd ../data
node export-archive-data.js
```

The workflow writes `csv/output/processed_records_YYYYMMDD.csv` and
`processing_log_YYYYMMDD.csv`. Review and reconcile approved output back to the
Google Sheet separately; this command does not write to Sheets.

### Workflow 2: Data Quality Audit

```bash
cd backend

# 1. Check for duplicates
poetry run python scripts/diagnostics/data_deduper.py --dry-run

# 2. Review and apply deduplication
poetry run python scripts/diagnostics/data_deduper.py

# 3. Backfill missing pull quotes and raw text (takes no arguments; re-scrapes
#    any un-noted row missing pull_quote or raw_text and writes back only the
#    field that is missing. Updates the Google Sheet's test_runs tab, not the
#    repo CSV.)
poetry run python -m scripts.backfill.backfill_worker

# 4. Validate archive data and relationships
poetry run python scripts/validate_archive_data.py
```

### Workflow 3: Regenerate Frontend Data

```bash
# After any CSV changes
cd /home/user/rosen-frontend/data
node export-archive-data.js

# Output files:
# - archive-core.json (8.6MB) - lightweight records
# - archive-details.json (11.4MB) - full summaries
# - archive-entities.json (1.1MB) - entity objects
# - archive-data.json (26MB) - full dataset fallback
```

## Data Flow Diagram

```
Google Sheet exports
         │
         ▼
csv/urls_to_scrape.csv + csv/archive_records-public.csv
         │
         ▼
    workflow.py
         │
    ┌────┴────┐
    ▼         ▼
dispatcher  categorizer
    │         │ (Gemini AI)
    ▼         │
processors ◄──┘
    │
    ▼
csv/output/processed_records_YYYYMMDD.csv
         │
         ▼
manual review and Google Sheets reconciliation
```

## Content Type Processors

| Processor | Handles | Special Features |
|-----------|---------|------------------|
| `article_processor.py` | Blog posts, articles | Trafilatura extraction |
| `video_processor.py` | YouTube, Vimeo | yt-dlp + transcription |
| `audio_processor.py` | Podcasts | Speech-to-text |
| `tumblr_processor.py` | Tumblr posts | Image + text extraction |
| `bluesky_processor.py` | Bluesky posts | Thread reconstruction |
| `clipping_processor.py` | Newspaper PDFs | OCR processing |

## Error Handling

### Poison Pill Detection
The `logger.py` module detects problematic URLs that fail processing:
```python
# Check poison pill log
cat backend/logs/poison_pills.log
```

### Manual Error Review
```bash
# Analyze extraction errors
poetry run python scripts/analyze_extraction_errors.py

# Output: categorized errors with suggested fixes
```

### Bounded and repeat runs

`workflow.py` takes no command-line options. Set its documented environment
variables to choose a row range and whether to skip URLs already processed.

```bash
PROCESS_START_ROW=10 PROCESS_END_ROW=20 SKIP_PROCESSED=true \
  poetry run python src/rosen_scraper/workflow.py
```

## CSV Schema Reference

### archive_records-public.csv
```csv
id,title,author,date,year,pub,url,summary,categories,concepts,era,verified
PRESSTH-00001,"Article Title","Jay Rosen",2023-11-15,2023,"PressThink","https://...","Summary text","['Category']","['Concept']","Trump II Era",true
```

### extracted_entities.csv
```csv
entity_id,name,type,source_record_id,context
ENT-00001,"Neil Postman","PERSON","PRESSTH-00001","Referenced as dissertation advisor"
```

### extracted_relationships.csv
```csv
source_entity_id,target_entity_id,relationship_type,source_record_id
ENT-00001,ENT-00002,COLLABORATED_WITH,PRESSTH-00001
```

## Performance Tips

### Entity extraction

The extractor uses fixed batch and rate-limit settings in the script. Its only
command-line option is `--yes` (`-y`) to confirm the run without a prompt.

```bash
poetry run python scripts/extract_entities_csv_batch.py --yes
```

### Incremental Processing
```bash
# Skip URLs already recorded as processed (the workflow default)
SKIP_PROCESSED=true poetry run python src/rosen_scraper/workflow.py
```

### Rate Limiting
Gemini API calls use the configured environment limits. For a slower workflow
run, reduce the allowed calls per period:
```bash
GEMINI_API_RATE_LIMIT_CALLS=30 GEMINI_API_RATE_LIMIT_PERIOD=60 \
  poetry run python src/rosen_scraper/workflow.py
```

## Integration

- **archive-validation** - Validates output of pipeline steps
- **zero-build-frontend** - Consumes JSON output files
- **deployment-manager** - Coordinates data updates with deployments

---

## Skill Metadata
**Created**: 2025-12-25
**Author**: Claude Code
**Version**: 1.0.0
