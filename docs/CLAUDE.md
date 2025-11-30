# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 🚨 THREE-SYSTEM INTEGRATION PROJECT (2025-10-28)

**IMPORTANT - READ BEFORE ANY WORK:**

A major integration project is underway to combine:
1. **DeepSeek-OCR** (84 newspaper articles, 1989-2023) - SQLite database
2. **Rosen Scraper Backend** (765+ records) - This system
3. **Windows 95 Frontend** (web interface) - Knowledge graph visualization

**You MUST read these files before doing ANY work:**
- **`C:\Users\amdit\OneDrive\Desktop\Crimes\playground\INTEGRATION_PLAN.md`** (60-page plan)
- **`narrative/PROJECT_LOG.md`** - Entry [2.14.0] (integration session)
- **`narrative/QUICK_START.md`** - Complete todo list

**Current Status:**
- Planning complete
- Phase 1 ready for execution (newspaper AI enrichment)
- Script created: `DeepSeek-OCR/newspaper_ai_enrichment.py`
- Next step: Test on 5 articles first (CRITICAL)

**Integration Goal:** 849 unified records spanning 36 years (1989-2025)

---

## Project Overview

This is the Jay Rosen Digital Archive Project - a Python-based data pipeline that automatically fetches, processes, and archives digital content related to Jay Rosen's work. The system processes web articles, YouTube videos, and audio content, enriching them with AI-powered analysis and storing results in Google Sheets.

## Development Setup

### Environment Configuration
1. **Virtual Environment:**
   ```bash
   python -m venv venv
   venv\Scripts\activate  # Windows
   ```

2. **Install Dependencies:**
   ```bash
   pip install -r requirements.txt
   playwright install  # Install browser binaries for web scraping
   ```

3. **Required Configuration Files:**
   - `google_credentials.json` - Google Cloud service account credentials (root directory)
   - `.env` file with required environment variables:
     ```
     SPREADSHEET_NAME="Your Google Sheet Name"
     GEMINI_API_KEY="your_gemini_api_key"
     ```

### Core Commands

**Run Main Pipeline:**
```bash
python src/workflow.py
```

**Data Quality & Maintenance:**
```bash
python tools/diagnostics/data_deduper.py    # Clean and deduplicate data, track entity mentions
python tools/diagnostics/data_improver.py   # Re-analyze existing data to improve quality
python tools/backfill/backfill_worker.py    # Fill missing data fields
python tools/backfill/simple_date_backfill.py      # Backfill publication dates from URL patterns
python tools/backfill/enhanced_date_backfill.py    # Comprehensive date extraction from metadata/OpenGraph
```

**Bulk Processing & Production Deployment:**
```bash
python tools/backfill/bulk_reprocessor.py    # Complete production processing of all URLs (765 URLs processed)
```

**CRITICAL: AI Categorization System Repair (2025-10-11 Issue):**
```bash
# IMMEDIATE DIAGNOSTIC STEPS (Run these first to identify the root cause)
python test_gemini_connection.py                    # Test API connectivity and quota
python src/categorizer.py --test-sample-content     # Test AI categorization independently
python backup_final_sheet.py --sheet="final"       # Backup current data before repair

# AI CATEGORIZATION REPAIR WORKFLOW
python src/ai_categorization_repair.py --diagnostic # Run full diagnostic of AI system
python src/ai_categorization_repair.py --test-mode --limit=10  # Test on 10 records
python src/ai_categorization_repair.py --batch-size=25 --all   # Repair all 725 records

# VALIDATION & MONITORING
python src/validate_categorization_diversity.py     # Check for categorization diversity
python src/monitor_ai_quality.py                   # Generate AI analysis quality report
```

**Enhanced PDF Generation:**
```bash
python src/enhanced_pdf_generator/batch_pdf_generator.py sample 5  # Generate 5 sample PDFs
python src/enhanced_pdf_generator/batch_pdf_generator.py all       # Generate all PDFs
```

**Text Cleaning & Quality Improvement:**
```bash
python src/text_cleaner.py analyze 50          # Analyze text quality in 50 records
python src/text_cleaner.py clean 0 20         # Clean first 20 records
python src/text_cleaner.py clean 20 20 aggressive  # Aggressive cleaning
```

**PDF Accessibility Evaluation:**
```bash
python src/enhanced_pdf_generator/pdf_accessibility_checker.py "file.pdf"  # Single PDF
python src/enhanced_pdf_generator/pdf_accessibility_checker.py batch processed_pdf_library  # Batch
python src/enhanced_pdf_generator/accessibility_integration.py compare 5  # Compare generators
```

**Entity Extraction & Knowledge Graph:**
```bash
python src/entity_extraction_batch_processor.py --batch-size 25 --limit 100  # Incremental batch processing
python src/entity_extraction_batch_processor.py --batch-size 50              # Full-scale processing
python tools/verify_extraction_sheets.py                                     # Verify extraction data quality
```

**RStudio Analysis & Visualization (NEW - 2025-11-07):**
```r
# Set working directory in RStudio
setwd("C:/Users/amdit/OneDrive/Desktop/Crimes/playground/rosen-scraper/RStudio/scripts")

# Load data from Google Sheets (first time: browser authentication required)
source("load_data.R")

# Run example analyses (14 different queries)
source("example_queries_fixed.R")

# Generate all visualizations (7 PNG charts)
source("analyze_entities_fixed.R")

# Jay Rosen network deep dive (15 analyses)
source("jay_rosen_analysis.R")

# Interactive entity explorer (7 customizable sections)
source("explore_entities.R")
```

**RStudio Documentation:**
- See `RStudio/README.md` for complete guide
- `RStudio/docs/QUICK_START_R.md` - 5-minute quick start
- `RStudio/docs/RSTUDIO_BEGINNER_GUIDE.md` - Comprehensive tutorial
- `RStudio/docs/COPY_PASTE_COMMANDS.md` - 60+ ready commands
- `RStudio/docs/R_ANALYSIS_GUIDE.md` - Advanced techniques
- `RStudio/docs/SPECIALIZED_ANALYSES.md` - 🆕 Deep-dive analyses guide (NEW!)
- `RStudio/WHATS_NEW.md` - Latest features and discoveries
- `RStudio/OUTPUT_REVIEW.md` - Comprehensive findings from analyses

**🆕 Specialized Analyses Available (NEW - 2025-11-07):**
Four advanced analysis scripts that reveal deep insights:

1. **Jay Rosen's Concept Map** - Maps 8 pioneered concepts, 147 references across 108 entities
   - "The people formerly known as the audience" is #1 concept (prominence: 10/10)
   - 59% individual adoption vs 23% organizational (grassroots movement)
   - Concept co-occurrence patterns identified

2. **Media Industry Analysis** - Rosen's relationship with journalism organizations
   - Analysis of organizations founded and engagement patterns
   - Mainstream vs alternative media comparison
   - Reveals builder-critic profile

3. **Public Journalism Movement** - Network of 15 key figures
   - Jay Rosen: 33 concept references (leader)
   - Dan Gillmor, Jeff Jarvis, Craig Newmark (collaborators)
   - Interdisciplinary: journalism + philosophy + technology

4. **Journalism Paradigm Comparison** - Alternative vs Traditional vs Digital
   - Rosen's 6 concepts outperform 17 traditional concepts (4x references)
   - Alternative: 8.33 prominence, 150 references
   - Traditional: 6.06 prominence, 39 references
   - Quality > Quantity paradigm demonstrated

**What RStudio Analysis Provides:**
- Statistical analysis of 5,160 entities and 7,499 relationships
- Network analysis (degree centrality, ego networks, co-occurrence)
- Entity type distribution and prominence scoring
- Jay Rosen intellectual network visualization
- Relationship pattern analysis
- Interactive data exploration with R
- Export to CSV for external analysis
- 🆕 21 publication-quality visualizations (300 DPI)
- 🆕 Paradigm comparison data (CSV export)
- 🆕 Research insights and pattern identification

**Testing:**
```bash
pytest                      # Run test suite (basic test coverage exists)
python test_url_context.py  # Test URL Context integration specifically
```

## Architecture Overview

### Pipeline Flow
```
Google Sheets (Data Store) → Backend Pipeline → Processed Results → Google Sheets
```

### Core Components

**Main Orchestration:**
- `src/workflow.py` - Main pipeline orchestrator that reads URLs from Google Sheets and coordinates processing
- `src/dispatcher.py` - Routes URLs to appropriate processors based on content type

**Content Processors (src/processors/):**
- `article_processor.py` - Orchestrates web article scraping and AI analysis
- `video_processor.py` - Handles YouTube videos using yt-dlp and Google Speech-to-Text
- `audio_processor.py` - Placeholder for audio content processing

**Core Processing Modules:**
- `src/scraper.py` - Three-stage "scraping cascade": URL Context → requests → Playwright fallback for JavaScript-heavy sites
- `src/categorizer.py` - AI-powered content analysis using Google Gemini API
- `src/pdf_generator.py` - Creates formatted PDFs using reportlab
- `src/entity_resolver.py` - Standardizes publication and platform names using known_entities.json

**Data Quality Tools:**
- `tools/diagnostics/data_deduper.py` - Cleans/deduplicates columns and tracks entity mentions across records
- `tools/diagnostics/data_improver.py` - Re-processes existing raw text to improve metadata quality
- `tools/backfill/backfill_worker.py` - Fills missing pull_quote and raw_text data

**Enhanced PDF Generation & Accessibility:**
- `tools/pdf/enhanced_pdf_generator/enhanced_pdf_generator.py` - Clean PDF generation with improved layout
- `tools/pdf/enhanced_pdf_generator/batch_pdf_generator.py` - Batch PDF processing from Google Sheets
- `tools/pdf/enhanced_pdf_generator/accessible_pdf_generator.py` - Accessibility-compliant PDF generation
- `tools/pdf/enhanced_pdf_generator/pdf_accessibility_checker.py` - WCAG 2.1 AA compliance evaluation
- `tools/pdf/enhanced_pdf_generator/accessibility_integration.py` - Generation + evaluation workflows

**Text Quality & Cleaning:**
- `tools/diagnostics/text_cleaner.py` - Comprehensive text cleaning and quality improvement system

**RStudio Analysis & Visualization (RStudio/):**
- `RStudio/scripts/load_data.R` - Google Sheets data loader (5,160 entities, 7,499 relationships)
- `RStudio/scripts/analyze_entities_fixed.R` - Full analysis with 7 PNG visualizations
- `RStudio/scripts/jay_rosen_analysis.R` - Jay Rosen network deep dive (15 analyses)
- `RStudio/scripts/example_queries_fixed.R` - 14 example statistical queries
- `RStudio/scripts/explore_entities.R` - Interactive entity explorer (7 sections)
- `RStudio/docs/` - Complete documentation (4 guides, 60+ copy-paste commands)
- `RStudio/output/` - Generated visualizations and exports

### Key Data Files
- `schema.json` - Contains taxonomy definitions and AI analysis configuration
- `src/entity_extraction_schema.json` - Entity types and relationship types for knowledge graph extraction
- `src/known_entities.json` - Entity resolution mappings for publications/platforms
- `google_credentials.json` - Google Cloud service account credentials

## Content Processing Pipeline

### Article Processing Flow:
1. **Dispatcher** determines content type from URL
2. **Scraper** uses cascade approach: URL Context → HTTP request → Playwright fallback
3. **Trafilatura** extracts clean content from HTML (if needed)
4. **Gemini AI** analyzes content for metadata, summaries, and categorization
5. **PDF Generator** creates formatted archive document
6. **Results** written to Google Sheets with batch API calls

### Scraping Strategy:
- **Stage 1:** Google URL Context tool for fastest structured extraction via Gemini API
- **Stage 2:** Fast HTTP requests with rotating User-Agents
- **Stage 3:** Playwright with stealth mode for JavaScript-heavy sites
- **Content Extraction:** Trafilatura for intelligent text extraction

## Data Management

### Google Sheets Integration:
- **Primary Database:** Google Sheets serves as the main data store
- **Rate Limit Handling:** Sophisticated batching system to manage API quotas
- **Sheets Structure:**
  - `urls_to_scrape` - Input URLs for processing
  - `test_runs` - Main processing results and current working data
  - `entities` - Entity tracking and mentions
  - `access` - Paywalled URLs requiring manual access

### Data Quality Focus:
The project emphasizes data integrity and scalability. Key maintenance scripts ensure:
- Consistent entity mentions across records
- Deduplicated categorical data
- Enhanced metadata through AI re-analysis
- Cross-referenced entity tracking

## Known Limitations & Considerations

### Web Scraping Challenges:
- Modern news sites use sophisticated anti-bot detection
- Paywall domains require special handling (configured in PAYWALLED_DOMAINS)
- Some content requires full browser rendering (handled by Playwright fallback)

### API Dependencies:
- Google Sheets API rate limits require careful batch management
- Google Gemini API for AI analysis and categorization
- Google Cloud Speech-to-Text for video/audio transcription

### File Processing:
- **Original PDFs:** `src/processed_pdf_library/` (original generator output)
- **Enhanced PDFs:** `enhanced_pdf_library/`, `sample_pdfs/`, `batch_generated_pdfs/` (new generator)
- **Accessible PDFs:** `accessible_pdf_library/` (accessibility-compliant PDFs)
- **PDF Archive:** `pdf_library/` (project root)
- **Accessibility Reports:** `accessibility_results/` (compliance evaluations)
- **Transcripts:** `src/processed_transcripts/`
- **Raw Media:** `raw_media_files/` (temporary storage)

## Development Notes

### Code Style:
- Modular architecture with clear separation of concerns
- Comprehensive error handling and logging throughout pipeline
- UTF-8 encoding specified for all Python files
- JSON schema-driven configuration for AI analysis

### Testing:
- Basic pytest configuration exists in requirements.txt
- Test file found in `langextract_test/test_extractor.py`
- No dedicated test runner scripts - use `pytest` directly

### Documentation:
- Detailed project history in `narrative/PROJECT_LOG.md`
- Architecture details in `narrative/ARCHITECTURE.md`
- Agent personas for specialized AI assistance in `agent personas/`

## Troubleshooting

### Common Issues:
1. **Environment Dependencies:** Requires Python 3.11+ (3.12+ has compatibility issues)
2. **Browser Installation:** Playwright browsers must be installed via `playwright install`
3. **API Credentials:** Ensure Google Cloud credentials and API keys are properly configured
4. **Rate Limits:** Use data maintenance scripts' batching systems for large-scale operations

### Data Quality Issues:
Run the data maintenance scripts in this order for best results:
1. `data_deduper.py` - Most important for data hygiene
2. `data_improver.py` - Enhance existing metadata
3. `backfill_worker.py` - Fill missing fields

### CRITICAL: AI Categorization System Failure (2025-10-11 Issue):
**Symptoms:**
- All records in "final" sheet have identical values in columns P-U (thematic_categories, key_concepts, era, scope, tags)
- 100% of records show "Press & Media Criticism", empty key_concepts, and "Digital Media & Platform Era (2017-Present)"
- Loss of content diversity across 725 records

**Root Cause:** Bulk reprocessor bypassing AI categorization system, falling back to hardcoded defaults

**Immediate Diagnostic Steps:**
1. **Check API Configuration:**
   ```bash
   echo $GEMINI_API_KEY  # Verify API key exists
   python test_gemini_connection.py  # Test connectivity
   ```

2. **Test AI Categorization Independently:**
   ```bash
   python src/categorizer.py --test-sample  # Test with sample content
   python -c "from categorizer import summarize_and_classify; import json; print(json.dumps(summarize_and_classify('Test article content', {'taxonomy': {}})))"
   ```

3. **Validate Schema Configuration:**
   ```bash
   python -c "import json; print(json.dumps(json.load(open('schema.json')), indent=2))"  # Verify schema.json
   ```

**Repair Workflow:**
1. **Backup Current Data** (CRITICAL - do this first):
   ```bash
   python backup_final_sheet.py --sheet="final" --timestamp
   ```

2. **Run Diagnostic Analysis:**
   ```bash
   python src/ai_categorization_diagnostic.py  # Full system diagnostic
   ```

3. **Test Corrected System** (small scale first):
   ```bash
   python src/bulk_reprocessor.py --test-mode --limit=5  # Test on 5 records
   ```

4. **Full Repair** (only after successful testing):
   ```bash
   python src/bulk_reprocessor.py --repair-ai-categorization --batch-size=25
   ```

**Expected Results After Repair:**
- **thematic_categories:** 60-80% diversity across 6 categories from schema.json
- **key_concepts:** 40-60% records with Jay Rosen concepts ("View from Nowhere", "Church of the Savvy", etc.)
- **era:** Historical era distribution based on publication dates
- **scope & tags:** Rich, contextual variety based on actual content analysis

**Validation Commands:**
```bash
python src/validate_categorization_diversity.py  # Check categorization success
python src/generate_quality_report.py --focus=ai-analysis  # Full quality assessment
```
