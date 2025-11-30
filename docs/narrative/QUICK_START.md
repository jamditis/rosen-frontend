# Quick Start Guide - Three-System Integration
**Session Date:** October 28, 2025
**Status:** Planning Complete - Ready for Phase 1 Execution

---

## 🚨 READ FIRST

**Before doing ANY work, you MUST read:**
1. **`C:\Users\amdit\OneDrive\Desktop\Crimes\playground\INTEGRATION_PLAN.md`** (60-page comprehensive plan)
2. **`narrative/PROJECT_LOG.md`** - Entry [2.14.0] (this session's work)

---

## Current Status Summary

### Three Systems Being Integrated

**1. DeepSeek-OCR (Newspaper Archive)**
- 84 newspaper articles (1989-2023)
- ✅ Tesseract OCR complete (100% success)
- ❌ No AI analysis yet
- ❌ No entity extraction yet

**2. Rosen Scraper Backend (Main Archive)**
- 613 records processed (of 765+ total)
- ✅ 5,482 entities extracted
- ✅ 6,672 relationships mapped
- ✅ AI categorization operational

**3. Windows 95 Frontend**
- 765 records displayed
- ✅ Search, explorer, knowledge graph operational
- ❌ No newspaper integration yet

**Integration Goal:** 849 unified records spanning 36 years (1989-2025)

---

## Scripts Created This Session

### 1. `newspaper_ai_enrichment.py`
**Location:** `C:\Users\amdit\OneDrive\Desktop\Crimes\playground\DeepSeek-OCR\`

**Purpose:** Enrich 84 newspaper articles with AI analysis

**Features:**
- Progress tracking in `logs/newspaper_enrichment_progress.json`
- Rate limiting (6 sec between API calls)
- Resume capability
- Cost monitoring
- Batch processing (saves every 10 articles)

**Output:** 9 fields per article
- thematic_categories (6 categories)
- key_concepts (13 Rosen concepts)
- era (historical period)
- scope (content type)
- tags (keywords)
- summary (overview)
- pull_quote (excerpt)
- ai_analysis_date
- gemini_cost_estimate

**Status:** ✅ Created, ⏳ Testing required

---

## Complete Phase-by-Phase Todo List

### ⚡ PHASE 1: Newspaper Data Enrichment (Weeks 1-2) - CURRENT PHASE

#### Task 1.1: AI Analysis Testing & Execution
- [ ] **Test on 5 articles first** (CRITICAL - DO NOT SKIP)
  ```bash
  cd C:\Users\amdit\OneDrive\Desktop\Crimes\playground\DeepSeek-OCR
  python newspaper_ai_enrichment.py
  # Option 2: Enrich limited batch → Enter 5
  # Time: 55 seconds
  # Cost: $0.06
  ```

- [ ] **Validate test results in SQLite**
  ```bash
  sqlite3 newspaper_archive.db
  SELECT * FROM enriched_metadata LIMIT 5;
  ```
  - Check: All 9 fields populated
  - Check: Categories match schema (6 valid)
  - Check: Concepts are valid (13 Rosen concepts only)
  - Check: Era matches publication date
  - Check: Summary is concise and accurate
  - Check: Pull quote is relevant
  - Check: Cost estimate ~$0.012 per article

- [ ] **Review quality of 5 test articles**
  - If good → proceed to full batch
  - If poor → debug prompts, test again on 5

- [ ] **Run full batch** (only after validation passes)
  ```bash
  python newspaper_ai_enrichment.py
  # Option 1: Enrich all articles
  # Time: 15.4 minutes
  # Cost: $1.01
  ```

- [ ] **Verify completion**
  ```bash
  sqlite3 newspaper_archive.db
  SELECT COUNT(*) FROM enriched_metadata;
  # Should return: 84
  ```

#### Task 1.2: Entity Extraction from Newspapers
- [ ] **Create temp Google Sheets export script**
  - Script name: `export_newspapers_to_temp_sheet.py`
  - Export newspaper text to temp worksheet "newspaper_temp"
  - Include: id, filename, publication, date, full_text

- [ ] **Run entity extraction using existing processor**
  ```bash
  cd C:\Users\amdit\OneDrive\Desktop\Crimes\playground\rosen-scraper
  poetry run python src/rosen_scraper/entity_extraction_batch_processor.py --source=newspaper_temp --batch-size=25
  # Time: ~8.4 minutes
  # Cost: $0.17
  ```

- [ ] **Verify entity extraction results**
  - Check `extracted_entities` sheet for new entities (+500-1000 expected)
  - Check `extracted_relationships` sheet for new relationships (+800-1500 expected)
  - Verify deduplication with existing entities

- [ ] **Clean up temp worksheet**
  - Delete "newspaper_temp" worksheet from Google Sheets

#### Task 1.3: Schema Mapping & ID Generation
- [ ] **Create newspaper_schema_mapper.py script**
  - Location: `DeepSeek-OCR/`
  - Features:
    - Generate IDs: NEWSPAPER-00001 to NEWSPAPER-00084
    - Map SQLite 20 fields → Google Sheets 35 fields
    - Convert dates: YYYY-MM-DD → MM/DD/YYYY
    - Standardize publication names with entity_resolver.py
    - Handle missing fields (set defaults)

- [ ] **Run schema mapper**
  ```bash
  cd C:\Users\amdit\OneDrive\Desktop\Crimes\playground\DeepSeek-OCR
  python newspaper_schema_mapper.py
  ```

- [ ] **Verify output files created**
  - `newspaper_export_for_sheets.csv` (84 rows × 35 columns)
  - `newspaper_id_mapping.json` (ID mapping reference)

- [ ] **Validate CSV export**
  - Open CSV, check 5 random rows
  - Verify all required fields populated
  - Verify dates formatted correctly (MM/DD/YYYY)
  - Verify categories/concepts/era from enrichment

**Milestone:** Newspapers fully enriched, entities extracted, ready for Google Sheets

---

### 📤 PHASE 2: Google Drive & Sheets Integration (Weeks 3-4)

#### Task 2.1: PDF Upload to Google Drive
- [ ] **Create upload_newspapers_to_gdrive.py script**
  - Use `gdrive_uploader.py` pattern from rosen-scraper
  - Create folder: "Newspaper Clippings (1989-2023)"
  - Create decade subfolders: 1989-1995, 1996-2005, 2006-2023

- [ ] **Upload 84 PDFs**
  ```bash
  cd C:\Users\amdit\OneDrive\Desktop\Crimes\playground\DeepSeek-OCR
  python upload_newspapers_to_gdrive.py
  # Time: ~2.8 minutes (84 × 2 sec)
  ```

- [ ] **Generate shareable links**
  - Store links in SQLite: add `gdrive_pdf_link` column
  - Update `newspaper_export_for_sheets.csv` with links

- [ ] **Test 20 random PDF links**
  - Open in browser, verify accessibility
  - Check folder organization

#### Task 2.2: Google Sheets Migration
- [ ] **Create import_newspapers_to_sheets.py script**
  - Create worksheet "newspaper_articles" in main spreadsheet
  - Import from `newspaper_export_for_sheets.csv`
  - Handle full_text overflow (>50K chars):
    - Option: Truncate to 50K
    - Option: Store in Drive as TXT, link in cell
    - Option: Keep in SQLite only, summary in Sheets

- [ ] **Run import**
  ```bash
  cd C:\Users\amdit\OneDrive\Desktop\Crimes\playground\DeepSeek-OCR
  python import_newspapers_to_sheets.py
  ```

- [ ] **Validate import in Google Sheets**
  - Check: All 84 rows present
  - Check: All 35 columns populated (or intentionally blank)
  - Check: PDF links work (test 5 random)
  - Check: Dates formatted MM/DD/YYYY
  - Check: Categories/concepts/era match schema

- [ ] **Add source_type column**
  - Add column to both sheets
  - Set "Newspaper Archive" for newspapers
  - Set "Main Archive" for existing records

#### Task 2.3: Entity Data Consolidation
- [ ] **Create consolidate_newspaper_entities.py script**
  - Append newspaper entities to `extracted_entities`
  - Append newspaper relationships to `extracted_relationships`
  - Update entity mention counts across all records
  - Validate relationship integrity

- [ ] **Run consolidation**
  ```bash
  python consolidate_newspaper_entities.py
  ```

- [ ] **Verify final state**
  - `extracted_entities`: ~6,000 entities (5,482 + 500-1000)
  - `extracted_relationships`: ~7,500 relationships (6,672 + 800-1500)
  - Total records: 849 (765 + 84)

**Milestone:** All data consolidated in Google Sheets, PDFs in Drive

---

### 🎨 PHASE 3: Frontend Enhancement (Weeks 5-7)

#### Task 3.1: Archive Explorer Updates
- [ ] **Add newspaper folder structure**
  - Edit: `frontend/web/95/index.js`
  - Add root folder: "Newspaper Clippings (1989-2023)"
  - Add decade subfolders: 1989-1995, 1996-2005, 2006-2023
  - Style with sepia/gold theme

- [ ] **Create newspaper Record Viewer template**
  - Display: publication, page, OCR quality, Rosen quotes
  - Add "View PDF" button (Google Drive link)
  - Add "View in context" (related newspapers)

- [ ] **Test navigation**
  - Click through folder structure
  - Open 10 random newspaper records
  - Verify metadata displays correctly

#### Task 3.2: Data Explorer Visualization Scaling
- [ ] **Increase grid capacity**
  - Edit: `explorer.js`
  - Change MAX_RECORDS_TO_DISPLAY to 900 (30×30 grid)

- [ ] **Add filtering options**
  - "Show only newspapers" toggle
  - "Show only main archive" toggle
  - "Show only specific category" dropdown

- [ ] **Update node visualization**
  - Color-code newspaper nodes (sepia/gold)
  - Update tooltip to show source_type

- [ ] **Test performance**
  - Load all 849 records
  - Measure render time (<3 seconds target)
  - Test filtering performance

#### Task 3.3: Search Interface Enhancement
- [ ] **Add Content Type filter**
  - Edit: `index.js`
  - Dropdown: Article | Video | Audio | Newspaper | All

- [ ] **Add Date Range filter**
  - Slider: 1989-2025
  - Default: All years

- [ ] **Add Source filter**
  - Radio buttons: Main Archive | Newspaper Archive | All

- [ ] **Update search logic**
  - Handle newspaper-specific fields
  - Test with 20 different queries
  - Verify response time <2 seconds

#### Task 3.4: Record Viewer Updates
- [ ] **Implement newspaper template**
  - Edit: `index.js` render logic
  - Show all enriched metadata
  - Add vintage newspaper styling (serif fonts)

- [ ] **Test Record Viewer**
  - Open 20 random newspaper records
  - Verify all fields display correctly
  - Test PDF link functionality

**Milestone:** All 849 records searchable and browsable in frontend

---

### 🚀 PHASE 4: Advanced Features (Weeks 8-10)

#### Task 4.1: Historical Timeline Visualization
- [ ] **Create timeline window**
  - New files: `timeline.html`, `timeline.js`, `timeline.css`
  - Y-axis: Number of articles/records
  - X-axis: Year (1989-2025)
  - Color-coded: Main (blue), Newspapers (gold), Combined (green)

- [ ] **Add interactivity**
  - Click bar to filter by year
  - Show Jay Rosen mention frequency
  - Highlight peak periods

- [ ] **Export functionality**
  - Export as PNG

#### Task 4.2: Knowledge Graph Enhancement
- [ ] **Add temporal filtering**
  - Edit: `explorer.js`
  - Add slider: 1989-2025
  - Filter entities by decade

- [ ] **Visualize entity evolution**
  - Color-code by entity type AND decade
  - Show "Entity Timeline" view

- [ ] **Test with full dataset**
  - 6,000+ entities
  - Performance target: <5 seconds to render

#### Task 4.3: Unified REST API Development
- [ ] **Create Flask API**
  - New directory: `api/`
  - Files: `app.py`, `routes.py`, `auth.py`, `cache.py`

- [ ] **Implement endpoints**
  - GET /search
  - GET /articles/{id}
  - GET /entities
  - GET /entities/{id}/relationships
  - GET /timeline
  - GET /stats

- [ ] **Add authentication**
  - API key in header
  - Rate limiting: 100 requests/minute

- [ ] **Create OpenAPI spec**
  - File: `api/openapi.yaml`

- [ ] **Deploy API**
  - Option A: Google Cloud Run
  - Option B: Heroku
  - Option C: VPS

#### Task 4.4: Citation & Export Tools
- [ ] **Implement citation generator**
  - New file: `citation_generator.js`
  - Formats: BibTeX, MLA 9th, APA 7th, Chicago 17th

- [ ] **Add export functionality**
  - New file: `export_handler.js`
  - Export as: CSV, JSON, PDF
  - Bulk download PDFs (ZIP)

- [ ] **Create researcher toolkit**
  - Python package: `rosen-archive-client`
  - Example Jupyter notebooks
  - Data dictionary

**Milestone:** Advanced research tools operational

---

### ✅ PHASE 5: Testing & Documentation (Weeks 11-12)

#### Task 5.1: Quality Assurance Testing
- [ ] **Data Integrity Testing**
  - All 849 records display correctly
  - All PDF links work (test 50 random)
  - All entity IDs resolve
  - All relationships valid
  - Search accuracy (20 queries)
  - No duplicate records

- [ ] **Performance Testing**
  - Search <2 seconds
  - Visualization <3 seconds
  - Timeline <1 second
  - API <500ms average

- [ ] **Cross-Browser Testing**
  - Chrome, Firefox, Safari, Edge (latest)
  - Mobile: iOS Safari, Chrome Android

- [ ] **Accessibility Testing**
  - Keyboard navigation
  - Screen reader compatible
  - WCAG 2.1 AA compliance
  - High contrast mode

- [ ] **Edge Case Testing**
  - Missing fields
  - Very long text (>50K)
  - Special characters
  - API failures
  - Slow network

#### Task 5.2: Documentation Creation
- [ ] **USER_GUIDE.md**
  - How to search
  - How to explore knowledge graph
  - How to use timeline
  - How to cite records
  - How to export data

- [ ] **INTEGRATION_ARCHITECTURE.md**
  - System architecture diagrams
  - Data flow diagrams
  - Component interactions
  - Technology stack
  - Deployment architecture

- [ ] **API_DOCUMENTATION.md**
  - Endpoint reference
  - Authentication guide
  - Rate limiting
  - Examples
  - Error codes
  - Python client usage

- [ ] **DATA_DICTIONARY.md**
  - All 35 field descriptions
  - Entity types & examples
  - Relationship types & examples
  - Taxonomy definitions
  - Historical eras
  - Jay Rosen concepts

- [ ] **MAINTENANCE_GUIDE.md**
  - Add new records
  - Run enrichment scripts
  - Update entity extraction
  - Deploy updates
  - Troubleshooting
  - Cost monitoring

- [ ] **Video Walkthrough**
  - 5-10 minute overview
  - Key features demo
  - Real-world use cases
  - Publish on YouTube
  - Embed in frontend

#### Task 5.3: Deployment & Backups
- [ ] **Update CSV Export**
  - Include newspaper_articles in published CSV
  - Test loads correctly
  - Verify 849 records

- [ ] **Deploy Frontend**
  - Build: `npm run build`
  - Test locally: `npm run preview`
  - FTP upload to centerforcooperativemedia.org
  - Update cache: `index.js?v=4`
  - Test production
  - Clear CDN cache

- [ ] **Deploy API** (if implemented)
  - Test locally
  - Deploy to platform
  - Configure env variables
  - Set up SSL
  - Configure CORS
  - Test from frontend

- [ ] **Configure Google Drive**
  - Verify all PDFs publicly accessible
  - Test 20 random links
  - Set up folder sharing

- [ ] **Set Up Backups**
  - Create `backup_archive.py`
  - SQLite → SQL dump daily
  - Google Sheets → CSV daily
  - Upload to Drive backup folder
  - Keep 30 days of backups
  - Schedule: Daily at 2 AM
  - Test restore process

**Milestone:** Production-ready integrated system

---

## Cost Summary

**AI Processing (one-time):**
- Newspaper AI analysis: $1.01
- Newspaper entity extraction: $0.17
- **Total: $1.18**

**Optional Services (ongoing):**
- Google Cloud Storage: $0-5/month
- API Hosting: $0-10/month
- Domain: $12/year
- **Total: $0-15/month**

**Grand Total: <$50 for entire 8-12 week project**

---

## Timeline Summary

- **Weeks 1-2:** Phase 1 - Data Enrichment ⚡ **CURRENT**
- **Weeks 3-4:** Phase 2 - Google Integration
- **Weeks 5-7:** Phase 3 - Frontend Enhancement
- **Weeks 8-10:** Phase 4 - Advanced Features
- **Weeks 11-12:** Phase 5 - Testing & Deployment

---

## Success Criteria

**Quantitative:**
- ✅ 849 records accessible
- ✅ Search <2 seconds
- ✅ 100% PDF accessibility
- ✅ 6,000+ entities
- ✅ 7,500+ relationships
- ✅ 36-year timeline (1989-2025)

**Qualitative:**
- ✅ User-friendly Win95 interface
- ✅ Comprehensive documentation (5+ guides)
- ✅ Automated daily backups
- ✅ Maintainable codebase
- ✅ Cost-effective (<$50 total)

---

## Critical Warnings (DO NOT SKIP)

1. **ALWAYS write results immediately after AI calls**
   - Don't store in variables and forget
   - Write each field explicitly
   - Log specific counters

2. **ALWAYS test on 5 rows first**
   - Never skip to full batch
   - Validate results manually
   - Only proceed if quality is good

3. **ALWAYS check progress before resuming**
   - Read progress JSON files
   - Understand what's been done
   - Don't duplicate work

4. **ALWAYS respect rate limits**
   - 6 sec between AI calls
   - 2 sec between Sheets batches
   - Monitor API quotas

5. **ALWAYS track costs**
   - Log every AI call
   - Monitor spending
   - Set budget limits

---

## Key Files Reference

**Integration Planning:**
- `C:\Users\amdit\OneDrive\Desktop\Crimes\playground\INTEGRATION_PLAN.md` (60 pages)

**Scripts (DeepSeek-OCR):**
- `newspaper_ai_enrichment.py` (created)
- `newspaper_schema_mapper.py` (to create)
- `upload_newspapers_to_gdrive.py` (to create)
- `import_newspapers_to_sheets.py` (to create)
- `consolidate_newspaper_entities.py` (to create)

**Logs:**
- `logs/newspaper_enrichment_progress.json` (will be created)

**Rosen Scraper:**
- `src/entity_extraction_batch_processor.py` (existing)
- `src/categorizer.py` (existing)
- `schema.json` (existing)

**Frontend:**
- `frontend/web/95/index.html`, `index.js` (existing)
- `frontend/web/95/explorer.html`, `explorer.js` (existing)

---

## Contact

**Project Owner:** Joe Amditis
**Email:** jamditis@gmail.com

---

**Last Updated:** October 28, 2025
**Status:** Planning complete, Phase 1 ready for execution
**Next Action:** Test `newspaper_ai_enrichment.py` on 5 articles
