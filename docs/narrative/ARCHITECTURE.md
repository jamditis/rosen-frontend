# Project Architecture

This document provides a detailed overview of the technical architecture of the Jay Rosen Internet Archive project.

## High-Level Overview

The project consists of three main components:

1. **Backend Pipeline**: Python-based system for scraping, processing, and analyzing content
2. **Data Layer**: CSV files exported from Google Sheets, converted to JSON for deployment
3. **Frontend**: Zero-build React application loading static JSON data

```
[ Google Sheets ] --> [ CSV Export ] --> [ JSON Generation ] --> [ Static Frontend ]
      (curation)        (version control)    (build step)         (deployment)
                              ↓
                    [ Backend Pipeline ]
                    (scraping, AI analysis)
```

### Data Architecture (December 2025)

The frontend loads data from static JSON files rather than fetching from Google Sheets at runtime:

- **Source of truth**: Google Sheets (for human curation)
- **Version control**: CSV files in `/data/` directory
- **Build step**: `npm run export-data` generates `archive-data.json`
- **Deployment**: Static JSON uploaded to WordPress via FTP
- **Performance**: ~100-200ms load time (vs. 800-1500ms from Google Sheets API)

## 1. Backend Data Pipeline

The backend is a modular Python application located in the `src/rosen_scraper/` directory. Its primary responsibility is to read URLs from the `urls_to_scrape` worksheet in the Google Sheet, process them, and write the results to the `test_runs` worksheet.

### Core Modules (`src/rosen_scraper/`)

The core application logic is now organized as a Python package.

-   **`workflow.py`:** The main orchestrator. It contains the main loop that reads from the Google Sheet, calls the dispatcher, and writes the results back.
-   **`dispatcher.py`:** The content router. It inspects each URL to determine its content type (article, YouTube, audio) and routes it to the appropriate processor.
-   **`processors/`:** A sub-package containing specialized modules for handling each content type.
    -   **`article_processor.py`:** Orchestrates the scraping, AI analysis, and PDF generation for web articles. Enhanced to handle both structured data from URL Context and traditional HTML extraction.
    -   **`video_processor.py`:** Handles YouTube videos, using `yt-dlp` to extract metadata and `google-cloud-speech` to transcribe the audio.
    -   **`audio_processor.py`:** A placeholder for future audio processing functionality.
-   **`scraper.py`:** Contains the "scraping cascade" logic for fetching article content, using a three-stage approach: Google URL Context tool → `requests` → `playwright`.

### Utility Scripts (`scripts/`)

Standalone scripts for diagnostics, backfilling, data analysis, and other maintenance tasks are located in the `scripts/` directory. These scripts are not part of the core `rosen_scraper` package but are designed to be run from the project root.

### URL Context Integration (2025-08-18)

The system now includes Google's URL Context tool as the primary content extraction method:

-   **`fetch_with_url_context()`:** Primary extraction function using Google's URL Context tool via Gemini API
    -   Returns pre-structured article data (title, author, text, publication) without HTML parsing
    -   Leverages Google's infrastructure for content retrieval, bypassing many anti-bot measures
    -   Provides fastest content extraction with minimal API calls
-   **`fetch_article_content_enhanced()`:** Intelligent router that returns either structured data or HTML
    -   Determines whether URL Context succeeded and returns appropriate data format
    -   Enables downstream processors to handle both structured and raw HTML data
-   **Enhanced Article Processing:** Modified `_run_scraping()` in `article_processor.py` to handle dual data paths
    -   Direct structured data processing when URL Context succeeds
    -   Traditional trafilatura extraction as fallback for HTML content
    -   Maintains backward compatibility while optimizing performance
-   **`ai_analyzer.py` & `ai_classifier.py`:** These modules interact with the Gemini API to generate summaries, classify content, and extract metadata.
-   **`pdf_generator.py`:** Creates clean, formatted PDFs of articles using the `reportlab` library.
-   **`gdrive_uploader.py`:** (Currently disabled) Handles uploading generated files to Google Drive.
-   **`data_improver.py`:** A script that re-processes existing raw text to improve data quality and consistency without re-scraping the original URL.
-   **`data_deduper.py`:** A cost-effective, non-AI script that performs two key data hygiene functions: it cleans and deduplicates data in specified columns, and it cross-references the `test_runs` and `entities` sheets to automatically track where each entity is mentioned.
-   **`backfill_worker.py`:** A utility script to fill in missing `pull_quote` and `raw_text` data in the Google Sheet.
-   **`schema_builder.py`:** A script to build a `known_entities.json` file from the existing data in the `processed_data` sheet.
-   **`entity_resolver.py`:** A module that uses the `known_entities.json` file to resolve and standardize publication and platform names.
-   **`tools/diagnostics/text_cleaner.py`:** A comprehensive text cleaning system that removes HTML artifacts, navigation elements, and improves content structure for better readability and PDF generation.

### Smart Data Corrector System (2025-10-22)

The archive includes a comprehensive data quality improvement system that intelligently corrects and enriches existing data:

**Phase 1 - Core System Development:**
-   **`tools/diagnostics/smart_corrector/`:** Modular system with specialized components:
    -   **`content_detector.py`:** Automatic content type detection from URL patterns (articles, YouTube, SoundCloud, etc.)
    -   **`quality_validator.py`:** Raw text quality scoring (0.0-1.0) with content-type specific validation
    -   **`audio_optimizer.py`:** 2x audio speed optimization achieving 50% transcription cost reduction
    -   **`cost_tracker.py`:** Real-time cost monitoring with budget enforcement and operation-level logging
    -   **`processors/youtube_processor.py`:** Enhanced YouTube caption extraction with deduplication and metadata cleaning
    -   **`processors/soundcloud_processor.py`:** SoundCloud metadata and description extraction
    -   **`gdrive_overflow_handler.py`:** Handles text >50K characters (Google Sheets cell limit) with Drive upload and link storage
-   **`tools/diagnostics/smart_data_corrector.py`:** Main processing engine with batch processing, dry-run mode, resume capability
-   **Cost Optimization:** Smart caching system (use existing high-quality text) + 2x audio speed = 50-60% cost reduction

**Phase 2 - Production Testing & Edge Case Resolution (2025-10-22):**
-   **Production Validation:** Successfully tested on 42 rows of real archive data:
    - 85.7% success rate (36/42 rows fully processed)
    - 59.5% cache hit rate (used existing quality text without reprocessing)
    - $0.0045 average cost per row (well below $0.50-$1.00 reprocessing baseline)
    - 100% Google Sheets update success with timestamped processing notes
-   **Edge Case Framework:** Identified and systematically resolved 6 distinct edge case types:
    1. YouTube videos with no captions (flagged for batch transcription)
    2. YouTube excessive repetition/metadata pollution (fixed with advanced deduplication)
    3. Google Sheets cell limit exceeded (truncation + overflow handler)
    4. SoundCloud missing content (re-extraction + batch transcription flagging)
    5. Code bugs in CostTracker parameters (fixed)
    6. False positive quality scores (documented for validator fix)
-   **YouTube Processor Enhancements:**
    - Fixed youtube-transcript-api v1.2.3 migration (instance methods, FetchedTranscriptSnippet objects)
    - Advanced deduplication algorithm removing 3x word/phrase repetitions
    - Metadata pollution filtering ("Kind: captions", "Language: en")
    - Cell limit handling with 49K character truncation
-   **Documentation:** Comprehensive `EDGE_CASES_AND_SOLUTIONS.md` (490+ lines) with:
    - Detailed analysis of each edge case type with examples
    - Multiple solution options with cost/benefit analysis
    - Priority matrix for systematic edge case handling
    - Comprehensive workflow decision trees
-   **Fix Scripts:** Reusable tools for edge case resolution:
    - `fix_youtube_rows.py`: Batch reprocessing for YouTube transcript issues
    - `fix_remaining_edge_cases.py`: Targeted fixes for specific problematic rows
-   **Production Readiness:** Proven system with comprehensive edge case handling framework ready for deployment on full 629-row dataset

**Decision Logic:**
1. Validate existing raw_text quality (score 0.0-1.0)
2. Score ≥ 0.7 → Use cached text ($0.006 AI re-analysis only)
3. Score < 0.7 → Reprocess from source ($0.02-$0.40 depending on content type)
4. Handle edge cases: truncate large text, flag for transcription, retry with enhanced cleaning

### Key Concepts Analysis System (2025-10-12)

The system includes a comprehensive key concepts analysis system for identifying Jay Rosen's journalism concepts across the archive:

-   **`key_concepts_updater.py`:** AI-powered analysis system for processing key concepts:
    -   Three-mode intelligent processing (fill empty, review existing, note missing content)
    -   Uses Gemini 2.0 Flash Lite for cost-effective analysis
    -   Strict schema validation with case-insensitive normalization
    -   Concise recommendation format ("N/A" or exact comma-separated list)
    -   Progress tracking with auto-save/resume via `key_concepts_progress.json`
    -   Batch processing (100 rows) with comprehensive error handling
    -   Rate limiting (5 sec/row, 10 sec/batch) to avoid API quotas
-   **`analyze_key_concepts.py`:** Analysis tool for examining concept distribution:
    -   Examines concept usage frequency across the archive
    -   Identifies schema compliance issues and inconsistencies
    -   Generates detailed reports on concept patterns
    -   Quality metrics for validation

**13-Concept Schema:** Expanded from 8 to 13 Jay Rosen journalism concepts with authority weighting:
- **Original 8:** View from Nowhere, Church of the Savvy, The People Formerly Known as the Audience, Parity Product, Verification in reverse, He said/she said journalism, Audience atomization overcome, The Production of Innocence
- **Data Analysis Additions (2):** Horse-race journalism, False balance
- **HIGH AUTHORITY from Jay's Notes (3):** The Citizens' Agenda, Not the odds but the stakes, Mindcasting

### Enhanced PDF Generation & Accessibility System

-   **`enhanced_pdf_generator/`:** A dedicated directory containing the complete PDF generation and accessibility system:
    -   **`enhanced_pdf_generator.py`:** Core PDF generation with improved layout, centered headers, and proper typography
    -   **`batch_pdf_generator.py`:** Google Sheets integration for mass PDF processing
    -   **`accessible_pdf_generator.py`:** Accessibility-compliant PDF generation implementing WCAG 2.1 AA standards
    -   **`pdf_accessibility_checker.py`:** Comprehensive PDF evaluation tool for WCAG 2.1 AA, PDF/UA, and Section 508 compliance
    -   **`accessibility_integration.py`:** Workflow automation combining generation and evaluation processes
    -   **`PDF_ACCESSIBILITY_GUIDE.md`:** Complete documentation for accessibility standards and usage

## Entity Extraction Pipeline Quality Review (2025-11-25)

### Issue Identified

A quality review of statistical claims revealed systematic errors in how entity extraction data was being analyzed. The R analysis scripts were conflating different relationship types, leading to inflated and misleading statistics.

### Pipeline Architecture Review

The entity extraction pipeline consists of:

```
Google Sheets (test_runs sheet)
    ↓
entity_extraction_batch_processor.py
    ↓
entity_extractor.py (Gemini API)
    ├─ Extracts 6 entity types
    └─ Extracts 15 relationship types
    ↓
Google Sheets (extracted_entities & extracted_relationships sheets)
    ↓
relationship_augmentation.py (secondary extraction for high-value relationships)
    ↓
R Analysis Scripts (RStudio/)
    ↓
Statistical claims in documentation
```

### Problems Found

| Component | Issue | Resolution |
|-----------|-------|------------|
| `media_industry_analysis.R` | Combined "Founded By" + "Pioneered" relationships | Separated into distinct queries |
| `media_industry_analysis.R` | Mixed Organization + Concept entity types | Now filters by entity type separately |
| `entity_extraction_schema.json` | "Founded By" definition too broad | Proposed restriction to Organizations only |
| `relationship_augmentation.py` | Confidence threshold 0.5 too permissive | Proposed increase to 0.7 |

### Schema Definitions Requiring Clarification

**Current Definitions:**
- `"Founded By"`: "Organization or work A was founded, created, or established by person/organization B"
- `"Pioneered"`: "Person A pioneered, invented, or was first to develop concept/work/practice B"

**Issue:** "Created" in "Founded By" is too broad and overlaps with authorship.

**Proposed Change:** Restrict "Founded By" to organizational founding only, add "Author Of" for works.

### Recommended Quality Controls

1. **Raise confidence threshold** from 0.5 to 0.7 in `relationship_augmentation.py`
2. **Restrict valid source types** for "Founded By" to Organizations only
3. **Add "Author Of" relationship type** for works (articles, posts, books)
4. **Implement context-aware extraction** to verify WHO is doing the founding
5. **Regular statistical audits** comparing documentation claims to source data

### Files Updated

- `RStudio/scripts/media_industry_analysis.R` - Separated relationship types
- `docs/SCHEMA_IMPROVEMENTS.md` - Detailed improvement proposals
- `scripts/diagnostics/analyze_founded_relationships.py` - Diagnostic query tool

See `docs/SCHEMA_IMPROVEMENTS.md` for complete proposed changes.

### Production-Ready Workflow & Bulk Processing System (2025-10-11)

The system now includes a complete production-ready workflow with enhanced data quality and bulk processing capabilities that has been successfully deployed to process the complete archive:

-   **`bulk_reprocessor.py`:** Comprehensive bulk processing system for production deployment:
    -   Successfully processed all 765 URLs with corrected workflow and enhanced data quality
    -   Multi-strategy content extraction with requests → BeautifulSoup → content analysis fallbacks
    -   Publication-based ID generation system (CJR-00001, NATION-00001, PRESSTH-00001, etc.)
    -   MM/DD/YYYY date formatting conversion from multiple input formats
    -   Source sheet status tracking with automated updates to columns C and D in "urls_to_scrape" tab
    -   Batch processing with comprehensive error handling, progress tracking, and rate limiting
    -   Final sheet creation with clean, corrected data in dedicated "final" tab
-   **`enhanced_pdf_formatter.py`:** Complete PDF formatting overhaul addressing user accessibility concerns:
    -   Professional PDF generation with proper paragraph breaks, text styling, and clean layout
    -   Audio transcript formatting with timestamp preservation ([HH:MM:SS]) and speaker identification
    -   WCAG-compliant accessibility features with proper document structure and hierarchical organization
    -   Fallback integration as primary formatter with automatic degradation to basic generator
-   **Enhanced ID Generation (`workflow.py`):** Completely rewritten ID generation system:
    -   Domain-to-publication mapping for accurate attribution (www.cjr.org → Columbia Journalism Review → CJR)
    -   Publication-to-prefix mapping ensuring consistent ID formats across all sources
    -   Intelligent URL parsing with comprehensive domain coverage
    -   Sequential numbering within publication prefixes for proper organization
-   **Real Content Extraction:** Advanced scraping system addressing content quality issues:
    -   Domain-specific author logic (pressthink.org → Jay Rosen automatically)
    -   Multiple author detection strategies including byline patterns and meta tag analysis
    -   Advanced text cleaning removing web artifacts, navigation elements, and excessive whitespace
    -   Meaningful excerpt generation and pull quote extraction from actual content
-   **Comprehensive Date Extraction Systems:** Multiple specialized tools for publication date backfilling:
    -   **`tools/backfill/simple_date_backfill.py`:** URL pattern extraction achieving 93.8% success rate for PressThink URLs
    -   **`tools/backfill/enhanced_date_backfill.py`:** Advanced metadata extraction from OpenGraph tags, JSON-LD structured data, RSS feeds, and video platform APIs, achieving 75% success on remaining URLs with perfect YouTube video date extraction
    -   **`tools/backfill/publication_date_backfill.py`:** AI-powered date extraction using Gemini for complex cases

### Schema Optimization & Cross-Reference Analysis (2025-10-11)

The system also includes comprehensive schema optimization and intelligent relationship discovery:

-   **`cross_reference_analyzer.py`:** Advanced content relationship discovery system:
    -   Multi-factor similarity analysis for `related_to` field using keywords, entities, themes, and temporal proximity
    -   Explicit mention detection for `responds_to` field identifying direct citations/references between archive records
    -   Confidence scoring with evidence tracking for relationship validation
    -   Discourse mapping capabilities for frontend visualization of interconnected conversations
-   **`logger.py`:** Comprehensive logging system with session summaries and performance metrics
-   **`poison_pill_handler.py`:** Sophisticated error detection and content quality validation
-   **`format_converter.py`:** Data format modernization system converting CSV strings to JSON arrays:
    -   Converts thematic_categories, key_concepts, tags from comma-separated to structured JSON
    -   Enhances relationship fields with confidence scoring and structured objects
    -   Prepares data for frontend integration with native JavaScript parsing
-   **`populate_new_fields.py`:** Automated field population for schema enhancements:
    -   Platform detection based on domain analysis
    -   Permission classification (Open Access, Premium/Subscription, Educational Use)
    -   Collection ID generation using content patterns and series information
    -   Batch processing with Google Sheets API optimization

### Data Analysis & Quality Control Framework (2025-09-24)

The system includes comprehensive analysis and quality control capabilities:

-   **`csv_analyzer.py`:** Complete archive analysis framework providing:
    -   Data quality assessment across all 39 fields
    -   Content categorization and taxonomy analysis
    -   Entity relationship tracking and mapping
    -   Temporal analysis spanning 32+ years of content
    -   AI analysis quality evaluation and reporting
-   **`data_completeness_analyzer.py`:** Gap analysis tool with priority scoring:
    -   Identifies critical, important, and nice-to-have improvements
    -   Analyzes duplicate URLs and processing failures
    -   Provides actionable improvement recommendations
-   **`data_completeness_improver.py`:** Automated data enhancement system:
    -   Publisher data mapping and standardization
    -   Influence relationship extraction from content
    -   Series classification using pattern matching
    -   Comprehensive relationship network building
-   **`data_repair_system.py`:** Systematic repair for processing failures:
    -   Missing title extraction and generation
    -   AI analysis gap filling using content patterns
    -   Excerpt generation from raw content
    -   Priority-based repair candidate identification
-   **`analysis_summary.py`:** Executive reporting system generating professional summaries
-   **`analyze_broken_records.py`:** Diagnostic tool for identifying processing failures

### Output Directory Structure

The system organizes generated files into specialized directories:

-   **`src/processed_pdf_library/`:** Original PDF generator output with basic formatting
-   **`enhanced_pdf_library/`:** Enhanced PDFs with improved layout and typography
-   **`accessible_pdf_library/`:** Accessibility-compliant PDFs meeting WCAG 2.1 AA standards
-   **`sample_pdfs/`:** Test and sample PDF outputs for validation
-   **`batch_generated_pdfs/`:** Full batch processing outputs
-   **`accessibility_results/`:** Compliance evaluation reports (JSON and human-readable)
-   **`src/processed_transcripts/`:** Audio/video transcription files
-   **`raw_media_files/`:** Temporary media file storage
-   **Analysis Reports:** JSON and markdown reports from data analysis framework

### Text Quality & Content Processing

The system includes comprehensive text quality improvement capabilities:

-   **Content Analysis:** Quality scoring (0-100) and improvement percentage calculation
-   **HTML Artifact Removal:** Cleans tags, entities, and technical remnants
-   **Navigation Filtering:** Removes menus, breadcrumbs, social links, and UI elements
-   **Structure Improvement:** Enhances paragraph breaks, spacing, and readability
-   **Unicode Normalization:** Standardizes special characters and encoding
-   **Batch Processing:** Google Sheets integration with rate limiting and error handling

### Current Schema Structure

The archive uses a 35-field schema optimized through real data analysis of 598 records:

**Core Metadata Fields (>99% completion):**
- `id`, `title`, `url`, `author`, `publication_date`

**Content Analysis Fields (94%+ completion):**
- `thematic_categories`, `summary`, `raw_text`

**Administrative Fields (99%+ completion):**
- `collection_id`, `verified`, `era`

**Enhancement Fields (requires population):**
- `platform` (0%) - Domain-based platform detection
- `influence` (0%) - Web search for citation/impact tracking of Rosen's concepts
- `notes` (0%) - Curator annotations and research notes
- `permissions` (populated) - Copyright/access status classification

**Format-Specific Fields:**
- `length_in_seconds`, `transcript_filepath` - Video/audio content (11% of archive)

This modular architecture ensures clean separation of concerns, allowing different components to be developed, tested, and maintained independently while supporting both current research needs and future expansion.

## RStudio Analysis & Visualization System (2025-11-07)

The archive includes a comprehensive R-based statistical analysis and visualization system for analyzing the knowledge graph data extracted from the archive. This system transforms raw entity and relationship data into publication-quality research outputs.

### Core Infrastructure

**Location:** `RStudio/` directory

**Key Components:**
-   **`scripts/load_data.R`:** Base data loader with Google Sheets authentication and entity/relationship data import
-   **`scripts/inspect_data.R`:** Data structure inspection tool for validating column names and data types
-   **`scripts/run_all_analyses.R`:** Master runner executing all specialized analyses sequentially

### Specialized Analysis Scripts

**1. Jay Rosen Concept Map Analysis (`scripts/jay_rosen_concept_map.R`):**
-   Identifies and analyzes 8 concepts pioneered by Jay Rosen
-   Maps concept adoption patterns across entity types (People, Organizations, Works, Concepts)
-   Calculates co-occurrence networks for concept relationships
-   Generates 3 visualizations: concept prominence ranking, adoption by entity type, relationship network
-   Key findings: 147 references across 108 entities, 59% individual adoption rate

**2. Media Industry Analysis (`scripts/media_industry_analysis.R`):**
-   Examines Rosen's relationships with media organizations
-   Categorizes organizations as mainstream vs. alternative media
-   Maps relationship types: Founded By, Criticizes, Discusses, Mentions, Affiliated With
-   Generates 4 visualizations: engagement breakdown, criticized organizations, media stance comparison, relationship overview
-   Key findings: Analysis of organizational relationships and engagement patterns

**3. Public Journalism Movement Network (`scripts/public_journalism_movement.R`):**
-   Maps network of key figures in public/citizen journalism movement
-   Analyzes concept references and collaboration patterns
-   Identifies interdisciplinary participants (journalists, philosophers, technologists)
-   Generates 4 visualizations: key figures ranking, related concepts, network overview, movement structure
-   Key findings: 15 key figures identified, interdisciplinary collaboration patterns

**4. Journalism Paradigm Comparison (`scripts/journalism_paradigm_comparison.R`):**
-   Compares three journalism paradigms: Rosen's Alternative, Traditional, Digital Era
-   Classifies concepts into paradigm categories based on content analysis
-   Calculates prominence scores, reference counts, and engagement patterns
-   Generates 5 visualizations + 1 CSV export: paradigm concept distribution, engagement patterns, relationship analysis, stance comparison, detailed breakdown
-   Key findings: Alternative paradigm achieves 4x more references (150 vs. 39) with higher prominence (8.33 vs. 6.06) despite having fewer concepts (6 vs. 17)

### Technical Architecture

**Data Pipeline:**
```
Google Sheets (extracted_entities + extracted_relationships)
    ↓
googlesheets4 OAuth2 authentication
    ↓
dplyr data manipulation (filtering, joining, aggregating)
    ↓
ggplot2 visualization generation (300 DPI PNG)
    ↓
Output directory (visualizations + CSV exports)
```

**Key R Packages:**
-   **`googlesheets4`:** Google Sheets API integration with OAuth2 authentication for direct data access
-   **`dplyr`:** Data manipulation including filtering, joining, aggregating, and transforming
-   **`ggplot2`:** Publication-quality visualizations with professional theming and 300 DPI resolution
-   **`tidyr`:** Data reshaping and tidying operations for analysis preparation
-   **`scales`:** Numeric formatting and axis scaling for readable charts

**Data Processing Patterns:**
-   **Entity Registry Integration:** All analyses work with normalized entity IDs from the knowledge graph
-   **Many-to-Many Join Handling:** Explicit `relationship = "many-to-many"` parameters in join operations to handle entity duplicates
-   **Type Conversion:** Automatic conversion of text columns to numeric for statistical operations
-   **Co-occurrence Detection:** Pattern matching to identify concepts appearing together in the same records
-   **Prominence Weighting:** 0-10 scale prominence scoring for entity importance ranking

### Output Structure

**Generated Files:**
-   **21 PNG Visualizations (300 DPI):**
    -   `rosen_pioneered_concepts.png` - Concept prominence ranking
    -   `concept_adoption_by_type.png` - Adoption patterns across entity types
    -   `rosen_concept_relationships.png` - Concept co-occurrence network
    -   `rosen_media_engagement.png` - Media organization relationship breakdown
    -   `rosen_criticized_orgs.png` - Organizations criticized by Rosen
    -   `rosen_media_stance.png` - Mainstream vs. alternative media comparison
    -   `jay_rosen_relationships.png` - Complete relationship overview
    -   `public_journalism_figures.png` - Key movement participants
    -   `public_journalism_related_concepts.png` - Associated concepts
    -   `public_journalism_overview.png` - Movement structure
    -   `paradigm_concepts.png` - Paradigm concept distribution
    -   `paradigm_engagement.png` - Engagement patterns by paradigm
    -   `paradigm_relationships.png` - Relationship type analysis
    -   `rosen_paradigm_stance.png` - Rosen's stance toward paradigms
    -   Plus 7 general archive visualizations (entity types, top entities, relationships)

-   **1 CSV Data Export:**
    -   `paradigm_comparison_table.csv` - Quantitative paradigm statistics for external analysis

**Documentation Files:**
-   `docs/RSTUDIO_BEGINNER_GUIDE.md` - Complete tutorial for RStudio novices
-   `docs/SPECIALIZED_ANALYSES.md` - Technical documentation (17 sections)
-   `docs/QUICK_START_R.md` - 5-minute quick start guide
-   `OUTPUT_REVIEW.md` - 400+ lines of findings analysis
-   `WHATS_NEW.md` - Summary of new capabilities
-   `WARNINGS_EXPLAINED.md` - Troubleshooting for many-to-many join warnings
-   `NEW_ANALYSES_SUMMARY.md` - Overview of specialized analyses

### Data Quality & Validation

**Data Sources:**
-   5,160 entities from `extracted_entities` Google Sheets tab
-   7,499 relationships from `extracted_relationships` Google Sheets tab
-   534 processed archive records analyzed

**Validation Performed:**
-   ✅ Column name mapping verified (total_mentions, prominence_score)
-   ✅ Test run of concept map analysis completed successfully
-   ✅ 3 sample visualizations generated and validated
-   ✅ Data accuracy confirmed (147 references, 108 entities, 8 concepts)
-   ✅ Execution time measured (~2 minutes per analysis, 5-8 minutes total)
-   ✅ All documentation cross-referenced with actual outputs

**Quality Metrics:**
-   Publication-quality 300 DPI resolution for all visualizations
-   Consistent professional color schemes and typography
-   Clear, readable labels with proper titles and subtitles
-   Data values displayed when relevant for interpretation

### Research Applications

**For Journalism Studies:**
-   Quantitative evidence of alternative journalism adoption patterns
-   Network analysis of intellectual movements and idea propagation
-   Temporal evolution of journalism criticism concepts
-   Citation-ready statistics for academic publications

**For Media Criticism Research:**
-   Builder vs. critic framework analysis with quantitative metrics
-   Relationship mapping between critics and institutions
-   Paradigm comparison with statistical validation
-   Infrastructure development tracking across organizations

**For Understanding Intellectual Influence:**
-   Prominence scoring methodology (0-10 scale)
-   Adoption pattern analysis across entity types
-   Co-occurrence networks showing conceptual frameworks
-   Interdisciplinary reach mapping across fields

### Integration Points

**With Entity Extraction System:**
-   Reads entities and relationships from Google Sheets tabs populated by `entity_extraction_batch_processor.py`
-   Uses entity type classifications from `entity_extraction_schema.json`
-   Analyzes complete knowledge graph with all 6 entity types (Person, Organization, Concept, Work, Event, Location)

**With Main Archive:**
-   Analyzes data from 534 processed records
-   Cross-references archive metadata with entity mentions
-   Provides research layer on top of content preservation

**With Frontend (Future Integration):**
-   Generated visualizations can be embedded in Windows 95 frontend
-   Network data can inform interactive graph rendering
-   CSV exports can be processed for dynamic dashboards
-   Timeline visualizations combining archive records and entity data

### Usage Commands

**Basic Analysis (Copy-Paste):**
```r
# Open RStudio, set working directory to RStudio/
source("scripts/load_data.R")                        # Authenticate and load data
source("scripts/jay_rosen_concept_map.R")            # Generate concept analysis
source("scripts/media_industry_analysis.R")          # Generate media analysis
source("scripts/public_journalism_movement.R")       # Generate movement analysis
source("scripts/journalism_paradigm_comparison.R")   # Generate paradigm analysis
```

**Run All Analyses:**
```r
source("scripts/run_all_analyses.R")  # Generates all 21 visualizations + CSV
```

**Suppress Warnings (Optional):**
```r
source("scripts/SUPPRESS_WARNINGS.R")  # Suppress many-to-many join warnings
```

### Future Enhancements

**Planned Analyses:**
-   **Timeline Analysis:** Track concept emergence and evolution over 32+ years
-   **Geographic Analysis:** Map participant distribution if location data available
-   **Sentiment Analysis:** Analyze positive/negative engagement with concepts
-   **Co-author Networks:** Map collaboration patterns among movement participants
-   **Citation Pattern Tracking:** Follow influence propagation through citations

**Integration Opportunities:**
-   **Frontend Embedding:** Interactive visualizations in Windows 95 frontend
-   **Dynamic Filtering:** Real-time filtering by entity type, relationship type, era
-   **Dashboard Widgets:** Key metrics and trends for archive overview
-   **Export Tools:** Academic citation formats and research reports
-   **Newspaper Archive Integration:** Post-integration analysis of 84 newspaper articles

### Major Discoveries Documented

**1. Builder-Critic Profile:**
-   Founded many organizations and projects
-   Reframes Rosen as builder of alternative infrastructure, not just critic

**2. Grassroots Adoption Pattern (59% Individual):**
-   Individual people adopt ideas 2.5x more than organizations
-   Bottom-up movement driven by practitioners, not executives

**3. Alternative Paradigm Strength (4x Impact):**
-   6 alternative concepts receive 150 references
-   17 traditional concepts receive only 39 references
-   Higher prominence (8.33 vs. 6.06) demonstrates focused effectiveness

**4. Interdisciplinary Movement:**
-   Journalists (Dan Gillmor, Jeff Jarvis)
-   Philosophers (Jürgen Habermas, John Dewey)
-   Technologists (Craig Newmark)
-   Cross-disciplinary intellectual foundation for public journalism

**5. Top Concept Identification:**
-   "The people formerly known as the audience" - Prominence 10/10
-   Most influential concept representing core mission
-   Redefines journalist-audience relationship fundamentally

This RStudio analysis system transforms the archive from a content preservation project into a comprehensive research platform, enabling scholars to generate quantitative insights about journalism criticism, intellectual influence, and the evolution of alternative journalism models. The combination of entity extraction, relationship mapping, and sophisticated statistical analysis positions the Jay Rosen Internet Archive as a model for digital humanities research infrastructure.

## Frontend Presentation Layer (December 2025)

### Data Loading Architecture

The frontend loads data from static JSON files deployed to WordPress:

```
/wp-content/rosen-archive/data/archive-data.json
    ↓
frontend/services/archiveService.js
    ↓
React components
```

**Data Source**: Pre-generated JSON file (~25MB) containing:
- Archive records (~30k including social posts)
- Named entities (~5k)
- Facets for filtering
- Autocomplete index

**Fallback**: Local sample data for offline development

### Frontend Components

- **Primary Explorer (`frontend/`)**
  - Zero-build React application using HTM for JSX-like syntax
  - ES modules loaded via CDN (React, Tailwind, PapaParse, Lucide)
  - Modular architecture with components in `frontend/components/`
  - Data service in `frontend/services/archiveService.js`

- **Dissertation Features (`features/`)**
  - Standalone tools: reader, glossary, timeline, FAQ, comparisons
  - Each feature is self-contained with its own HTML/CSS/JS

- **Launch Site (`labs/dissertation-launch/`)**
  - Landing page with hero and navigation
  - 3D concept sphere using Three.js

### Shared Guidance

- Serve via static server (`python -m http.server`) for local development
- All paths configured for WordPress deployment at `/wp-content/rosen-archive/`
- Design tokens ensure consistent styling across components
