# Jay Rosen's Internet Archive - Backend Pipeline

The backend is a Python-based data pipeline that automatically fetches, processes, archives, and analyzes digital content from Jay Rosen's work across the web. It uses AI-powered analysis (Google Gemini) to categorize, summarize, and extract key concepts from articles, videos, and other media.

**You don't need any of this to browse the archive or run the website.** The site is a static frontend that reads pre-generated data files (see the [root README](../README.md) and [`data/README.md`](../data/README.md)). The backend is the tooling maintainers use to add and process new content, and it requires its own credentials (Google Cloud, Gemini) to run.

---

## What the backend does

The pipeline performs these core functions:

1. **Content Scraping** - Fetches articles, videos, and multimedia content from URLs
2. **AI Analysis** - Uses Google Gemini to categorize, summarize, and extract concepts
3. **PDF Archiving** - Generates formatted PDF archives of content
4. **Data Management** - Reads from and writes to Google Sheets for tracking
5. **Entity Resolution** - Identifies and resolves entities (people, organizations, publications)
6. **Batch Processing** - Handles backfills and bulk reprocessing operations

---

## Architecture overview

### Pipeline flow

```mermaid
graph LR
    A[Google Sheets] -->|URLs to Process| B(Workflow Orchestrator)
    B --> C{Dispatcher}
    C -->|Article URL| D[Article Processor]
    C -->|Video URL| E[Video Processor]
    D --> F[Scraper & Content Extractor]
    E --> G[YouTube DL & Speech-to-Text]
    F --> H[Gemini AI Analysis]
    G --> H
    H --> I[PDF Generator]
    I --> J[Results → Google Sheets]
```

### Core components

| Component | File | Purpose |
|-----------|------|---------|
| **Workflow Orchestrator** | `src/rosen_scraper/workflow.py` | Main entry point, orchestrates the entire pipeline |
| **Dispatcher** | `src/rosen_scraper/dispatcher.py` | Routes URLs to appropriate processors |
| **Article Processor** | `src/rosen_scraper/processors/article_processor.py` | Handles web article processing |
| **Video Processor** | `src/rosen_scraper/processors/video_processor.py` | Handles YouTube video processing |
| **Scraper** | `src/rosen_scraper/scraper.py` | Extracts content using Trafilatura & Playwright |
| **Categorizer** | `src/rosen_scraper/categorizer.py` | AI-powered classification using Google Gemini |
| **PDF Generator** | `src/rosen_scraper/pdf_generator.py` | Creates formatted PDF archives |
| **Entity Resolver** | `src/rosen_scraper/entity_resolver.py` | Identifies and resolves entities |
| **Logger** | `src/rosen_scraper/logger.py` | Centralized logging with poison pill detection |

### Directory structure

```
backend/
├── src/
│   └── rosen_scraper/          # Main package
│       ├── workflow.py          # Pipeline orchestrator
│       ├── dispatcher.py        # URL routing
│       ├── categorizer.py       # AI analysis
│       ├── scraper.py           # Content extraction
│       ├── pdf_generator.py     # PDF creation
│       ├── entity_resolver.py   # Entity management
│       ├── logger.py            # Logging system
│       └── processors/          # Content processors
│           ├── article_processor.py
│           ├── video_processor.py
│           └── audio_processor.py
├── scripts/                     # Utility scripts
│   ├── backfill/               # Historical data processing
│   ├── diagnostics/            # Analysis and debugging tools
│   ├── pdf/                    # PDF utilities
│   └── README.md               # Scripts documentation
├── tests/                       # Test suite
├── pyproject.toml              # Poetry dependencies
├── poetry.lock                 # Locked dependency versions
├── schema.json                 # Taxonomy and data schema
└── entity_extraction_schema.json  # Entity extraction rules
```

---

## Quick start

### Prerequisites

- **Python 3.13+** (specified in `pyproject.toml`)
- **Poetry** for dependency management
- **Google Cloud Platform Account** with:
  - Google Sheets API enabled
  - Gemini API access
  - Service account credentials
- **Playwright browsers** (installed via setup)

### Installation

```bash
# 1. Navigate to backend directory
cd backend

# 2. Install Poetry (if not already installed)
#    See https://python-poetry.org/docs/#installation

# 3. Install dependencies (Poetry manages the virtual environment)
poetry install

# 4. Install Playwright browsers
poetry run playwright install
```

### Configuration

#### 1. Environment variables

Create a `.env` file in the `backend/` directory:

```bash
# Google Sheets Configuration
SPREADSHEET_NAME="Your Google Sheet Name"

# AI Configuration
GEMINI_API_KEY="your_gemini_api_key_here"

# Optional: Logging Configuration
LOG_LEVEL="INFO"  # DEBUG, INFO, WARNING, ERROR, CRITICAL
```

#### 2. Google Cloud credentials

Place your Google Cloud service account JSON file at:

```
backend/google_credentials.json
```

**Required permissions:**
- Google Sheets API read/write access
- Google Drive API access (for PDF storage)

#### 3. Google Sheets setup

The pipeline expects two Google Sheets:

1. **Input Sheet** - Contains URLs to process with columns:
   - URL
   - Status (empty for new, "Processed" for completed)
   
2. **Output Sheet** - Stores processed results (created automatically)

---

## Usage

### Running the main pipeline

Process new URLs from the input sheet:

```bash
cd backend
poetry run python src/rosen_scraper/workflow.py
```

This will:
1. Read unprocessed URLs from Google Sheets
2. Dispatch each URL to the appropriate processor
3. Scrape and analyze content
4. Generate PDF archives
5. Write results back to Google Sheets

### Common commands

```bash
# Run main pipeline
poetry run python src/rosen_scraper/workflow.py

# Clean duplicate data
poetry run python scripts/diagnostics/data_deduper.py

# Backfill missing metadata
poetry run python scripts/backfill/backfill_worker.py

# Backfill missing dates
poetry run python scripts/run_date_backfill.py

# Run entity extraction
poetry run python src/rosen_scraper/entity_extractor.py

# Preview smart-corrector changes for sheet rows 27 through 42
# Dry run is the default; this does not write to the worksheet.
poetry run python -m scripts.corrector --rows 27-42
```

The smart corrector accepts `--rows :N` for the first N data records,
`--rows N-M` for inclusive sheet rows, and `--rows N-` for an open-ended
range. `--limit` caps any selection. `--resume` skips leading selected rows
whose notes already contain a smart-corrector completion marker; failed and
incomplete rows are retried. `--max-cost` sets the hard estimated-cost stop;
its default is $35.

Use `--live` only for a supervised write. Live runs update recovered
`raw_text`, processing notes, and the canonical AI fields when analysis is
available: `summary`, `thematic_categories`, `key_concepts`, `tags`, and
`pull_quote`. `scripts.corrector` is the only supported smart-corrector entry point.
Historical row selections are expressed directly with `--rows` and `--limit`;
there are no range-specific wrapper scripts to drift from the canonical CLI.

### Running tests

```bash
# Install dev dependencies
poetry install --with dev

# Run all tests
poetry run pytest

# Run with coverage
poetry run pytest --cov=src/rosen_scraper

# Run specific test file
poetry run pytest tests/test_logging_system.py
```

---

## Configuration files

### `schema.json`

Defines the taxonomy used by the AI for classification:

- **Thematic Categories** - 6 categories (Press & Media Criticism, etc.)
- **Key Concepts** - Jay Rosen's signature concepts ("View from Nowhere", etc.)
- **Eras** - 6 time periods (1990-Present)
- **Content Formats** - Blog Post, Article, Academic Paper, etc.
- **Output Headers** - Column structure for Google Sheets

### `entity_extraction_schema.json`

Defines rules for entity extraction:

- Person entities (journalists, academics, politicians)
- Organization entities (news outlets, institutions)
- Publication entities (books, papers)

### `pyproject.toml`

Poetry configuration with dependencies:

- **Content Processing:** `trafilatura`, `playwright`, `beautifulsoup4`
- **Google Services:** `gspread`, `google-api-python-client`, `google-generativeai`
- **Media Processing:** `yt-dlp` (YouTube), `google-cloud-speech` (transcription)
- **PDF Generation:** `reportlab`
- **Testing:** `pytest`, `pytest-mock`

---

## Troubleshooting

### Common issues

#### 1. Import errors or module not found

**Problem:** `ModuleNotFoundError: No module named 'rosen_scraper'`

**Solution:**
```bash
# Ensure you're in the backend directory, dependencies are installed,
# and commands run inside Poetry's environment
cd backend
poetry install
poetry run python src/rosen_scraper/workflow.py
```

#### 2. Google Sheets authentication failures

**Problem:** `gspread.exceptions.APIError: [403] Forbidden`

**Solution:**
- Verify `google_credentials.json` is in the `backend/` directory
- Ensure service account has access to the target Google Sheet
- Share the sheet with the service account email (found in credentials JSON)

#### 3. Gemini API errors

**Problem:** `google.api_core.exceptions.PermissionDenied: 403`

**Solution:**
- Verify `GEMINI_API_KEY` in `.env` is correct
- Check API key has Gemini API access enabled in Google Cloud Console
- Verify billing is enabled for the Google Cloud project

#### 4. Playwright browser errors

**Problem:** `playwright._impl._api_types.Error: Executable doesn't exist`

**Solution:**
```bash
poetry run playwright install
```

#### 5. PDF generation failures

**Problem:** PDFs not being created or saved

**Solution:**
- Check Google Drive API permissions
- Verify sufficient disk space
- Check logs for specific error messages

#### 6. Content extraction returns empty text

**Problem:** Scraped articles have no text content

**Solution:**
- Site may be JavaScript-heavy (Playwright should handle this)
- Site may require authentication (add to paywalled domains list)
- Site may be blocking automated access (check poison pill handler logs)

### Debug mode

Enable detailed logging:

```bash
# Set in .env
LOG_LEVEL="DEBUG"

# Or set environment variable
export LOG_LEVEL="DEBUG"
poetry run python src/rosen_scraper/workflow.py
```

Logs are written to:
- Console (stdout)
- `logs/` directory (if configured)

### Poison pill detection

The pipeline includes automatic detection of failed scrapes (paywalls, anti-bot blocks, CAPTCHAs, etc.):

- **Automatic Detection** - Identifies problematic content that will cause processing failures
- **Classification** - Categorizes issues by type and severity (low, medium, high, critical)
- **Routing Strategies** - Recommends appropriate handling for different failure types
- **Retry Logic** - Provides intelligent retry strategies for recoverable issues
- Check logs for "POISON PILL DETECTED" messages
- Review `src/rosen_scraper/poison_pill_handler.py` for complete detection logic
- Known paywalled domains tracked: Washington Post, NY Times, WSJ, FT, Atlantic, New Yorker, Medium

---

## Development workflow

### Making changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make code changes** in `src/rosen_scraper/`

3. **Run tests**
   ```bash
   poetry run pytest
   ```

4. **Test manually**
   ```bash
   poetry run python src/rosen_scraper/workflow.py
   ```

5. **Commit and push**
   ```bash
   git add .
   git commit -m "Description of changes"
   git push origin feature/my-feature
   ```

### Adding new dependencies

```bash
# Add runtime dependency
poetry add package-name

# Add dev dependency
poetry add --group dev package-name

# Update lock file
poetry lock

# Install updated dependencies
poetry install
```

### Adding new processors

To add a new content type processor:

1. Create processor in `src/rosen_scraper/processors/new_processor.py`
2. Implement `process_<type>(url, schema)` function
3. Add URL pattern detection in `dispatcher.py`
4. Add tests in `tests/test_new_processor.py`

### Modifying taxonomy

To add categories, concepts, or eras:

1. Edit `schema.json`
2. Update the `taxonomy` section
3. Test AI classification with new values
4. Update documentation if needed

---

## Data schema

The pipeline outputs structured data with these key fields:

| Field | Description |
|-------|-------------|
| `id` | Auto-generated unique identifier |
| `title` | Article/content title |
| `url` | Source URL |
| `author` | Author name (defaults to Jay Rosen) |
| `publication_date` | Publication date (YYYY-MM-DD) |
| `original_publication` | Publisher name |
| `summary` | AI-generated summary |
| `thematic_categories` | List of category tags |
| `key_concepts` | List of Rosen's signature concepts |
| `era` | Time period classification |
| `scope` | Type of analysis (Theoretical, Commentary, etc.) |
| `raw_text` | Full extracted text |
| `gdrive_pdf_link` | Link to archived PDF |
| `verified` | Manual verification status |

See `schema.json` for the complete list of output headers.

---

## Integration with the frontend

The backend populates data that the frontend consumes:

1. **Google Sheets** - The backend writes processed results to sheets
2. **CSV export** - Sheet data is exported into the CSV source files in `data/`
3. **JSON generation** - `node data/export-archive-data.js` turns the CSVs into the static JSON files the site reads (see [`data/README.md`](../data/README.md))
4. **Deploy** - The regenerated JSON is uploaded to the live site

The frontend never talks to Google Sheets or the backend at runtime — it only reads the pre-generated JSON.

---

## Additional resources

- **Root README** - See `/README.md` for project overview
- **Scripts Documentation** - See `scripts/README.md` for utility scripts
- **CLAUDE.md** - AI assistant context and development guidelines
- **Schema Definition** - See `schema.json` for full taxonomy

---

## Security notes

- **Never commit** `.env` or `google_credentials.json` to version control
- **Rotate API keys** periodically
- **Limit service account permissions** to only required scopes
- **Review logs** for sensitive data before sharing

---

## License

This project is licensed under the MIT License - see the root `/LICENSE` file for details.

---

**Maintained by Joe Amditis** | Part of Jay Rosen's Internet Archive Project
