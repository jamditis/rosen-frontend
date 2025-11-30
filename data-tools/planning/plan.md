# Consolidated Rosen Archive Workflow Plan

## **CONSOLIDATED ROSEN ARCHIVE WORKFLOW**

### **Phase 1: URL Input & Validation**
1. **Add URL to Google Sheets**: Insert new URL in `urls_to_scrape` tab (column B, rows as needed)
2. **Paywall Detection**: System checks URL domain against `PAYWALLED_DOMAINS` list
   - If paywalled → Move to `access` tab for manual handling
   - If not paywalled → Continue to processing

### **Phase 2: Content Processing Pipeline**
**Orchestrated by:** `src/workflow.py` → `src/dispatcher.py`

#### **2.1 Content Type Routing**
- **YouTube/Video URLs** → `video_processor.py` (yt-dlp + Google Speech-to-Text)
- **All Other URLs** → `article_processor.py` (3-tier scraping cascade)

#### **2.2 Enhanced Scraping Cascade** (`src/scraper.py`)
**Tier 1:** Google URL Context (Gemini API)
- Fastest method using structured extraction
- Returns JSON with title, author, text, date, publication
- If successful → Skip to AI analysis

**Tier 2:** Fast HTTP Request
- Standard requests library with rotating User-Agents
- If content < 1500 chars or contains "javascript" → Fallback to Tier 3

**Tier 3:** Playwright Browser Rendering
- Full browser with JavaScript execution
- Wait for `networkidle` state
- Stealth mode with rotating User-Agents

#### **2.3 Content Extraction & Validation**
- **HTML Processing**: Trafilatura extraction (excludes comments/tables, outputs JSON)
- **Quality Check**: Ensure `text` field exists and has substantial content
- **Data Structure**: Create `raw_text` field if missing

### **Phase 3: AI Analysis & Categorization**
**Module:** `src/categorizer.py` (Google Gemini API)

#### **Analysis Against Schema** (`schema.json`)
- **Thematic Categories**: Press & Media Criticism, Journalism Theory, etc.
- **Key Concepts**: "View from Nowhere", "Church of the Savvy", etc.
- **Era Classification**: Early Career (1989-1999) through Present (2022+)
- **Content Format**: Blog Post, Article, Interview, etc.
- **Scope**: Theoretical, Commentary, Case Study, etc.

#### **Metadata Extraction & Validation**
- Compare AI-extracted metadata against scraped data
- Prioritize scraped data for factual fields (date, author, publication)
- Use AI analysis for interpretive fields (summary, categories, concepts)

### **Phase 4: Data Enrichment & ID Generation**
**Module:** `src/workflow.py` `enrich_data()`

#### **4.1 Unique ID Creation**
- **Format**: `[PUBLICATION-PREFIX]-[5-digit-number]`
- **Prefix Logic**: 5-8 chars from publication name (uppercase, alphanumeric only)
- **Number Logic**: Increment from highest existing ID for same prefix
- **Default**: "MISC-00001" if publication unknown

#### **4.2 Entity Resolution** (`src/entity_resolver.py`)
- **Publication Standardization**: Against `known_entities.json` mappings
- **Platform Detection**: From URL domain with fallback logic
- **Publisher Field**: Original publication OR platform name

#### **4.3 Calculated Fields**
- `date_processed`: Current timestamp
- `word_count`: Split text length if not already calculated
- `content_type`: Default "Article" unless video/audio
- `format`: "text", "video", or "audio" based on processing path

### **Phase 5: Google Sheets Integration**
**Target:** `test_runs` tab with batch API operations

#### **5.1 Row Creation**
- **Column Order**: Per `schema.json` `output_headers` (81 fields)
- **Data Mapping**: Structured data → ordered row values
- **Batch Writing**: Single API call per record with error handling
- **ID Tracking**: Add new ID to in-memory `processed_ids` set

### **Phase 6: PDF Generation & File Management**

#### **6.1 Content-Type Routing**
**Video/Audio Content:**
- Create transcript file via `src/transcript_saver.py`
- Save to `src/processed_transcripts/`
- Add `transcript_filepath` to record

**Text Content:**
- Generate accessible PDF via `src/enhanced_pdf_generator/accessible_pdf_generator.py`
- **Features**: WCAG 2.1 AA compliance, tagged structure, screen reader compatibility
- **Output**: `accessible_pdf_library/` directory
- **Filename**: `[ID]_[sanitized-title].pdf`

#### **6.2 File Validation**
- Verify file creation success
- Log filepath in Google Sheets record
- Handle generation failures with error logging

### **Phase 7: Related Content Analysis & Cross-Referencing**
**Module:** Entity mention tracking via `src/data_deduper.py`

#### **7.1 Entity Mention Discovery**
- Scan text content for mentions of:
  - Other publications in archive
  - Key figures/authors
  - Referenced organizations
  - Geographic locations

#### **7.2 Cross-Reference Updates**
- Update `entities` tab with new mention records
- Map entity mentions to record IDs
- Batch update related records' `related_to` fields

### **Phase 8: Quality Assurance & Data Maintenance**

#### **8.1 Data Deduplication** (`src/data_deduper.py`)
- **Columns**: `thematic_categories`, `key_concepts`, `tags`, entity fields
- **Process**: Split on commas/semicolons, trim whitespace, deduplicate, sort
- **Frequency**: Run after bulk processing sessions

#### **8.2 Data Quality Improvement** (`src/data_improver.py`)
- **Purpose**: Re-analyze existing records with updated schema/prompts
- **Target**: Records with missing or low-quality metadata
- **Method**: Reprocess `raw_text` through current AI analysis pipeline

#### **8.3 Backfill Operations** (`src/backfill_worker.py`)
- **Target**: Missing `pull_quote` and `raw_text` fields
- **Method**: Re-scrape URLs or enhance existing data
- **Priority**: Critical fields for search and analysis

### **Phase 9: Error Handling & Logging**

#### **9.1 Comprehensive Error Tracking**
- **Scraping Failures**: Log URL, method attempted, error type
- **AI Analysis Failures**: Log input text length, API response status
- **PDF Generation Failures**: Log record ID, file path issues
- **API Quota Limits**: Implement exponential backoff and retry logic

#### **9.2 Poison Pill Detection**
- **Content Length**: Flag articles under minimum threshold
- **Scraping Quality**: Detect JavaScript-heavy pages requiring Playwright
- **Paywall Detection**: Auto-route premium content domains
- **Dead Links**: Handle 404s and redirect chains

#### **9.3 Changelog & Audit Trail**
- **Record Changes**: Track field updates with timestamps
- **Processing Stats**: Success/failure rates by domain and content type
- **Performance Metrics**: Processing time per phase
- **Data Quality Scores**: Completeness and accuracy metrics

## **EXECUTION COMMANDS**

### **Primary Workflow:**
```bash
python src/workflow.py
```

### **Data Maintenance (run periodically):**
```bash
python src/data_deduper.py      # Clean duplicates and update entity mentions
python src/data_improver.py     # Re-analyze records for quality improvement
python src/backfill_worker.py   # Fill missing data fields
```

### **Batch PDF Generation:**
```bash
python src/enhanced_pdf_generator/batch_pdf_generator.py sample 5  # Test with 5 records
python src/enhanced_pdf_generator/batch_pdf_generator.py all       # Generate all PDFs
```

## **KEY BENEFITS**

This consolidated workflow specification provides:

1. **Clear sequential phases** from URL input through final archiving
2. **Robust error handling** with multiple fallback mechanisms
3. **Efficient batch processing** to manage API quotas
4. **Quality assurance** through data validation and improvement cycles
5. **Comprehensive logging** for debugging and optimization
6. **Modular architecture** allowing easy extension and modification

The workflow leverages the most effective components: the 3-tier scraping cascade, Google URL Context integration, accessible PDF generation, and sophisticated entity resolution. It's designed to be both automated and maintainable, with clear intervention points for quality control.