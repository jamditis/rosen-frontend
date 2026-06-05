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

# Create virtual environment (first time only)
python -m venv venv

# Activate environment
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# Install dependencies
pip install poetry
poetry install

# Install Playwright browsers (for web scraping)
playwright install
```

### Required Configuration

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Required values:
```
SPREADSHEET_NAME="Jay Rosen Archive Master"
GEMINI_API_KEY="your_gemini_api_key"
```

Place Google Cloud credentials in `backend/google_credentials.json`.

## Script Categories

### Core Workflow Scripts

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `src/workflow.py` | Main processing pipeline | URLs from spreadsheet | Processed records |
| `src/dispatcher.py` | Routes URLs to processors | URL | Processor selection |
| `src/categorizer.py` | AI analysis via Gemini | Text content | Categories, concepts |

### Entity Processing

| Script | Purpose | When to Run |
|--------|---------|-------------|
| `scripts/extract_entities_csv_batch.py` | Parallel entity extraction | After new content import |
| `src/entity_extractor.py` | Single record extraction | Testing/debugging |
| `src/entity_deduplicator.py` | Merge duplicate entities | After extraction batch |
| `src/entity_registry.py` | Manage entity IDs | Automatic |

### Data Quality Scripts

| Script | Purpose | When to Run |
|--------|---------|-------------|
| `scripts/diagnostics/data_deduper.py` | Remove duplicate records | Periodically |
| `scripts/diagnostics/smart_corrector/` | Fix common errors | After quality audit |
| `scripts/backfill/backfill_worker.py` | Fill missing fields | After imports |

### Import Scripts

| Script | Purpose | Source |
|--------|---------|--------|
| `scripts/import_tumblr.py` | Import Tumblr posts | studio20nyu.tumblr.com |
| `scripts/import_clippings.py` | Import newspaper clippings | PDF scans with OCR |
| `scripts/reconstruct_bluesky_threads.py` | Build thread hierarchies | social_posts.csv |
| `scripts/generate_thread_records.py` | Create THREAD-* records | Thread data |

### Export Scripts

| Script | Purpose | Output |
|--------|---------|--------|
| `../data/export-archive-data.js` | Generate JSON from CSV | archive-*.json files |

## Common Workflows

### Workflow 1: Process New URLs

```bash
cd backend
source venv/bin/activate

# 1. Run main workflow (processes URLs from spreadsheet)
python src/workflow.py

# 2. Extract entities from new records
python scripts/extract_entities_csv_batch.py

# 3. Deduplicate entities
python src/entity_deduplicator.py

# 4. Regenerate JSON files
cd ../data
node export-archive-data.js
```

### Workflow 2: Data Quality Audit

```bash
cd backend
source venv/bin/activate

# 1. Check for duplicates
python scripts/diagnostics/data_deduper.py --dry-run

# 2. Review and apply deduplication
python scripts/diagnostics/data_deduper.py

# 3. Backfill missing summaries
python scripts/backfill/backfill_worker.py --field summary

# 4. Backfill missing concepts
python scripts/backfill/backfill_worker.py --field concepts

# 5. Validate against schema
python scripts/validate_schema.py
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
Google Spreadsheet (URLs)
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
archive_records-public.csv
         │
    ┌────┴────┐
    ▼         ▼
entity_   export-archive-
extractor    data.js
    │         │
    ▼         ▼
extracted_  archive-*.json
entities.csv
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
python scripts/analyze_extraction_errors.py

# Output: categorized errors with suggested fixes
```

### Retry Failed Records
```bash
# Retry specific records
python src/workflow.py --retry-failed

# Retry specific IDs
python src/workflow.py --ids "PRESSTH-00123,CJR-00456"
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

### Parallel Processing
```bash
# Entity extraction supports parallel workers
python scripts/extract_entities_csv_batch.py --workers 5
```

### Incremental Processing
```bash
# Only process new records (skip existing)
python src/workflow.py --incremental

# Only extract entities for records without them
python scripts/extract_entities_csv_batch.py --missing-only
```

### Rate Limiting
Gemini API calls are rate-limited. For large batches:
```bash
# Use batch mode with delays
python src/categorizer.py --batch-size 50 --delay 2
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
