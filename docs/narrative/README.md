# Jay Rosen Digital Archive Project

This project is a comprehensive, automated pipeline for archiving digital content related to the work of Jay Rosen. It processes web articles, YouTube videos, and audio links, generating clean, accessible archives and enriching them with AI-powered analysis.

## 🚀 **THREE-SYSTEM INTEGRATION PROJECT (2025-10-28)** 🚀

**Major Integration Underway:** Combining three interconnected systems into a unified archive spanning 36 years (1989-2025):
1. **Tesseract** (84 newspaper articles, 1989-2023)
2. **Rosen Scraper Backend** (765+ records, AI analysis, entity extraction)
3. **Windows 95 Frontend** (web interface with knowledge graph)

**Status:** Planning complete, Phase 1 ready for execution

**📖 MUST READ BEFORE ANY WORK:**
- **`C:\Users\amdit\OneDrive\Desktop\Crimes\playground\INTEGRATION_PLAN.md`** (60-page comprehensive plan)
- **`narrative/PROJECT_LOG.md`** - Entry [2.14.0] (integration planning session)
- **`narrative/QUICK_START.md`** - Complete phase-by-phase todo list

**Integration Goal:** 849 unified records, 6,000+ entities, 7,500+ relationships, historical timeline, unified search

---

## 🚨 **CRITICAL SYSTEM ALERT (2025-10-11)**

**AI Categorization System Failure:** The project's core AI categorization functionality has failed, affecting all 725 records in the production archive. All content currently has identical classification values instead of the rich, diverse categorization that makes the archive searchable and valuable for research.

**Immediate Action Required:** See `PROJECT_LOG.md` [2.9.0] and `CLAUDE.md` for comprehensive diagnostic and repair procedures.

## Project Overview

The system is a Python-based data pipeline that automatically fetches, processes, and archives content from a list of URLs stored in Google Sheets.

All processed data and metadata are stored in a central Google Sheet, while generated artifacts (like PDFs and transcripts) are saved to a local `processed_pdf_library/` directory.

## Architecture

The architecture is designed to be a modular Python pipeline with clear separation of concerns.

```
+---------------------------+
| Google Sheet (Data Store) |
| - urls_to_scrape          |
| - test_runs               |
+-------------+-------------+
              |
              v
+---------------------------------------------------------------------------------+
| Backend Pipeline (Python)                                                       |
|                                                                                 |
| [ Dispatcher ] -> [ Article Processor ] -> [ Scraper, AI, PDF Gen ] -> (writes) -+
|      |                                                                          |
|      +---------> [ Video Processor ] -> [ Downloader, Transcriber ] -> (writes) -+
|      |                                                                          |
|      +---------> [ Audio Processor ] -> [ Downloader, Transcriber ] -> (writes) -+
|                                                                                 |
+---------------------------------------------------------------------------------+
```

## Features

-   **Multi-Format Processing:** Handles web articles, YouTube videos, and audio content seamlessly.
-   **Intelligent Scraping:** Uses a three-stage "scraping cascade" for articles: URL Context → HTTP requests → Playwright fallback, ensuring high success rates on modern, JavaScript-heavy sites.
-   **AI-Powered Analysis & Enrichment:** Leverages the Google Gemini API for deep analysis to:
    -   Extract key metadata like **title, author, and publication date**.
    -   Generate concise **summaries** and compelling **excerpts**.
    -   **Classify** content with thematic categories, key concepts, and tags.
-   **Jay Rosen Concept Analysis:** Identifies 13 core journalism concepts across the archive including "View from Nowhere," "The Citizens' Agenda," "Not the odds but the stakes," and others from Jay's body of work.
-   **Video & Audio Transcription:** Downloads video/audio, extracts the audio stream, and uses Google's Speech-to-Text API for accurate transcription.
-   **Enhanced PDF Generation:** Creates clean, accessible PDFs with professional layouts featuring centered headers and proper typography.
-   **Accessibility Compliance:** Comprehensive PDF accessibility system implementing WCAG 2.1 AA, PDF/UA, and Section 508 standards with detailed compliance reporting.
-   **Text Quality Improvement:** Advanced text cleaning system that removes HTML artifacts, navigation elements, and improves content structure for better readability.
-   **Data Improvement Workflows:** Includes scripts to analyze, clean, backfill, and deduplicate data in the Google Sheet, as well as track entity mentions.
-   **Quality Assessment:** Content quality scoring and accessibility evaluation with automated reporting and remediation recommendations.
-   **Robust API Rate Limit Handling:** Uses a sophisticated batching system to manage Google Sheets API rate limits during large-scale data updates.
-   **Comprehensive Test Suite:** `pytest` tests for all major backend components ensure reliability.

## Frontend Interfaces

-   **Modern Explorer (`frontend/main/`):** Rebuilt as a modular ES-module app with accessible filters, pagination, and a full-fidelity detail modal (metadata grid, pull quotes, YouTube embeds, related/responds chips, resource links, notes).
-   **Data Explorer (`frontend/dataexplorer/`):** Canvas-based relationship grid retained for large-screen investigations.
-   **Internal Explorer (`web/int/`):** 2025-10-15 refactor moves layout chrome, styling, and scripts into modular assets, adds a collapsible colour key, and captions PNG exports with the selected record title/ID (see `web/int/CHANGELOG-2025-10-15.md` for session notes).
-   **Fallback Support:** Both frontends fetch the published Google Sheet CSV first and automatically fall back to `frontend/main/sample-data.csv` (first 25 rows of the production dataset) when offline.
-   **Serving Requirements:** Launch via a static web server (e.g., `python -m http.server`) to avoid browser CORS blocks on ES modules.

## System Setup

### Backend Pipeline Setup

1.  **Clone the Repository:**
    ```bash
    git clone <repository_url>
    cd rosen-scraper
    ```

2.  **Install Poetry:**
    ```bash
    pip install poetry
    ```

3.  **Install Dependencies:** This will create a virtual environment and install all project dependencies, including Playwright browser binaries.
    ```bash
    poetry install
    playwright install
    ```
    > **Note:** `playwright install` must be executed after every dependency update or new environment bootstrap so the Chromium binaries used by the scraper are available.

### Gemini SDKs

-   `google-generativeai` powers the article classification pipeline in `src/rosen_scraper/categorizer.py` (Gemini 1.5 Flash).
-   `google-genai` is required for URL Context extraction in `src/rosen_scraper/scraper.py` (Gemini 2.5 Flash).

Both packages are managed by Poetry; keep them in sync with upstream API changes to avoid authentication mismatches.

4.  **Configure Credentials:**
    -   **Google Cloud:** Place your `google_credentials.json` service account file in the root of the project.
    -   **Environment Variables:** Create a `.env` file in the project root and add the following:
        ```
        SPREADSHEET_NAME="Your Google Sheet Name"
        GEMINI_API_KEY="your_gemini_api_key"
        ```

5.  **Run the Pipeline:**
    ```bash
    poetry run python src/rosen_scraper/workflow.py
    ```

## Key Workflows

### Enhanced PDF Generation
Generate clean, accessible PDFs from processed content:
```bash
# Generate sample PDFs
python tools/pdf/enhanced_pdf_generator/batch_pdf_generator.py sample 10

# Generate all PDFs
python tools/pdf/enhanced_pdf_generator/batch_pdf_generator.py all
```

### Text Quality Improvement
Clean and improve scraped content quality:
```bash
# Analyze text quality
python tools/diagnostics/text_cleaner.py analyze 50

# Clean content in batches
python tools/diagnostics/text_cleaner.py clean 0 20

# Aggressive cleaning for heavily corrupted content
python tools/diagnostics/text_cleaner.py clean 20 20 aggressive
```

### Accessibility Evaluation
Ensure PDFs meet accessibility standards:
```bash
# Evaluate single PDF
python tools/pdf/enhanced_pdf_generator/pdf_accessibility_checker.py "file.pdf"

# Batch evaluate all PDFs
python tools/pdf/enhanced_pdf_generator/pdf_accessibility_checker.py batch processed_pdf_library

# Compare standard vs accessible generators
python tools/pdf/enhanced_pdf_generator/accessibility_integration.py compare 5
```

### Data Quality Maintenance
```bash
# Clean and deduplicate data
python tools/diagnostics/data_deduper.py

# Improve existing data quality
python tools/diagnostics/data_improver.py

# Fill missing data fields
python tools/backfill/backfill_worker.py
```

### Key Concepts Analysis (NEW: 2025-10-12)
AI-powered analysis of Jay Rosen's journalism concepts across the archive:
```bash
# Process next 100 rows (auto-resumes from saved progress)
python src/key_concepts_updater.py

# Process specific number of rows
python src/key_concepts_updater.py --limit 50

# Start fresh from beginning
python src/key_concepts_updater.py --reset-progress

# Force reprocess existing data
python src/key_concepts_updater.py --force-reprocess

# Analyze concept distribution across archive
python src/analyze_key_concepts.py
```

**System Features:**
- **13 Jay Rosen Concepts:** Identifies View from Nowhere, Church of the Savvy, The Citizens' Agenda, Not the odds but the stakes, and 9 others
- **Three Processing Modes:** Fill empty concepts, review existing assignments, note rows without content
- **Concise Recommendations:** Returns "N/A" or exact comma-separated list ready to copy/paste
- **Progress Tracking:** Auto-save and resume from last processed row
- **Quality Control:** Strict schema validation, case-insensitive normalization

See `narrative/KEY_CONCEPTS_SYSTEM.md` for complete documentation.

### RStudio Analysis & Visualization (NEW: 2025-11-07)
Comprehensive R-based statistical analysis and visualization system for the knowledge graph:
```r
# In RStudio, set working directory to RStudio/, then:
source("scripts/load_data.R")                        # Authenticate and load data
source("scripts/run_all_analyses.R")                 # Generate all 21 visualizations + CSV

# Or run individual analyses:
source("scripts/jay_rosen_concept_map.R")            # Concept adoption patterns
source("scripts/media_industry_analysis.R")          # Media relationships
source("scripts/public_journalism_movement.R")       # Movement network
source("scripts/journalism_paradigm_comparison.R")   # Paradigm comparison
```

**System Capabilities:**
- **21 PNG Visualizations (300 DPI):** Publication-quality charts and network graphs
- **1 CSV Data Export:** Quantitative paradigm analysis for statistical software
- **4 Specialized Analyses:** Concept mapping, media industry relationships, movement networks, paradigm comparison
- **Beginner-Friendly:** Complete documentation with copy-paste commands

**Major Discoveries:**
- Jay Rosen founded many organizations and projects, revealing his builder-critic profile
- 59% grassroots individual adoption vs. 23% organizational
- Alternative journalism concepts 4x more referenced than traditional (150 vs. 39)
- Interdisciplinary movement spanning journalists, philosophers, technologists
- "The people formerly known as the audience" identified as most influential concept (10/10 prominence)

**Documentation:**
- `RStudio/docs/SPECIALIZED_ANALYSES.md` - Complete technical guide (17 sections)
- `RStudio/docs/RSTUDIO_BEGINNER_GUIDE.md` - Step-by-step tutorials for new users
- `RStudio/OUTPUT_REVIEW.md` - 400+ lines of findings analysis
- `RStudio/WHATS_NEW.md` - Quick summary of capabilities

See `narrative/PROJECT_LOG.md` entry [2.16.0] and `narrative/ARCHITECTURE.md` for complete technical documentation.

## Testing the Backend

To run the test suite for the Python backend:
```bash
pytest                      # Run comprehensive test suite
python test_url_context.py  # Test URL Context integration specifically
```

## Project Log

For a detailed history of changes and architectural decisions, please see the `PROJECT_LOG.md` file.
