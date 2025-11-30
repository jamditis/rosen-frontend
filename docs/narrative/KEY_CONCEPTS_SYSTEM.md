# Key Concepts System Documentation

## Overview
The key concepts system uses AI (Gemini 2.0 Flash Lite) to analyze raw text and assign Jay Rosen's journalism concepts to each article in the archive.

## Current Schema (13 Concepts)

### Original Jay Rosen Concepts (8)
1. **View from Nowhere** - Objectivity ideology in journalism
2. **Church of the Savvy** - Political journalists focused on strategy over substance
3. **The People Formerly Known as the Audience** - Empowered media consumers
4. **Parity Product** - When news becomes commoditized/undifferentiated
5. **Verification in reverse** - Starting with conclusion, finding supporting facts
6. **He said/she said journalism** - False balance in reporting
7. **Audience atomization overcome** - Connected audiences via social media
8. **The Production of Innocence** - Press avoiding accountability

### Added from Data Analysis (2)
9. **Horse-race journalism** - Campaign coverage focused on polls/strategy
10. **False balance** - Giving equal weight to unequal claims

### Added from Jay's Notes (3) - HIGH AUTHORITY
11. **The Citizens' Agenda** - Election coverage prioritizing voter concerns
12. **Not the odds but the stakes** - Focusing on election consequences vs polling
13. **Mindcasting** - Broadcasting one's thought process and knowledge-gathering

## Files

### Core Files
- `schema.json` - Contains taxonomy including 13 key concepts
- `src/rosen_scraper/key_concepts_updater.py` - AI-powered analysis script
- `src/rosen_scraper/analyze_key_concepts.py` - Analysis tool for existing data

### Documentation
- `key_concepts_analysis.txt` - Detailed analysis of 601 rows
- `schema_improvements_summary.txt` - Changes from data analysis
- `jay_rosen_schema_update.txt` - Changes from Jay's notes
- `narrative/KEY_CONCEPTS_SYSTEM.md` - This file

## How It Works

### Script Behavior
1. **Empty colQ (key_concepts)**: Fills with AI-identified concepts
2. **Existing colQ data**: Reviews and provides recommendations in colAK
3. **No raw text**: Adds note to colAJ explaining why skipped

### Rate Limiting
- 5 seconds between each row update
- Processes 100 rows per batch
- Progress automatically saved and resumed

### Validation
- Only schema concepts allowed (strict enforcement)
- Case-insensitive normalization
- Comma-separated format

## Usage

```bash
# Process next 100 rows (auto-resumes)
poetry run python src/rosen_scraper/key_concepts_updater.py

# Process specific number
poetry run python src/rosen_scraper/key_concepts_updater.py --limit 50

# Start fresh from beginning
poetry run python src/rosen_scraper/key_concepts_updater.py --reset-progress

# Force reprocess existing data
poetry run python src/rosen_scraper/key_concepts_updater.py --force-reprocess
```

## Results from 601 Row Analysis

**Before improvements:**
- 90 unique concepts found (inconsistent!)
- Many capitalization variations
- Non-schema concepts appearing

**After improvements:**
- Only 13 schema concepts enforced
- Case-insensitive normalization
- Strict validation with warnings

## Authority Weighting
Jay Rosen's identified concepts > Data analysis patterns

This ensures the schema reflects Jay's actual body of work, not just what AI might infer.

## Processing History

### Session: 2025-10-12 (Initial Production Run)

**Objective:** Process all rows in test_runs sheet with updated 13-concept schema and concise recommendation format.

**Configuration:**
- Model: Gemini 2.0 Flash Lite
- Format: Comma-separated values in colQ
- Recommendations format: "N/A" or exact copy-paste ready concept list in colAK
- Rate limiting: 5 sec/row, 10 sec/batch
- Batch size: 100 rows

**Progress Completed:**
- **Batch 1 (rows 2-101):** ✓ Complete - 97 updates made
- **Batch 2 (rows 102-201):** ✓ Complete - 99 updates made
- **Batch 3 (rows 202-301):** ⏸ Started but timed out - will resume from row 202

**Total Progress:** 200 rows fully processed out of ~601 total rows
**Last Saved Position:** Row 201 (auto-saved in key_concepts_progress.json)

**Key Observations:**
- Jay's HIGH AUTHORITY concepts appearing frequently:
  - "The Citizens' Agenda" - Found in election coverage
  - "Not the odds but the stakes" - Found in recent election posts
  - "Mindcasting" - Found in blogging/transparency posts
- "False balance" and "Horse-race journalism" proving very relevant
- Concise N/A format working well for human review in colAK
- Zero errors across 280+ rows processed

**Next Steps (When Resuming):**
1. Run: `poetry run python src/rosen_scraper/key_concepts_updater.py --limit 100` (will auto-resume from row 202)
2. Complete remaining ~400 rows in batches of 100 (approximately 4 more batches)
3. After completion, run analysis: `poetry run python src/rosen_scraper/analyze_key_concepts.py` to measure final concept distribution
4. Review colAK recommendations in Google Sheets for patterns requiring manual review
5. Document final statistics and concept usage in this file

**Files Modified:**
- colQ (key_concepts) - Filled for empty rows
- colAK (changes/recommendations) - Concise recommendations for review
- colAJ (notes) - Notes for rows without raw text
- key_concepts_progress.json - Auto-saved progress tracker

---

### Session: 2025-10-13 (Stability Follow-Up)

**Objective:** Recover tooling reliability after the key concepts analyzer failure and add guardrails that prevent uniform Gemini outputs from reaching production data.

**Key Actions:**
- Repaired `src/rosen_scraper/analyze_key_concepts.py` default spreadsheet fallback so the reporting utility works without manual environment overrides.
- Added a pytest compilation check (`tests/test_analyze_key_concepts_syntax.py`) to catch malformed edits to the analyzer.
- Implemented schema-aware validation in `src/rosen_scraper/categorizer.py` that rejects Gemini responses lacking taxonomy diversity, logs reasons, and stores raw payloads in `logs/ai_responses/` for audit.
- Enabled `playwright_stealth` during the Playwright fallback stage, reducing the risk of CAPTCHA/anti-bot failures when reprocessing stubborn URLs.
- Locked dependency versions in `pyproject.toml` (notably both Gemini SDKs) and documented the `playwright install` requirement in `narrative/README.md`.

**Impact:**
- Analyzer tool is operational again for measuring concept distribution.
- Enrichment pipeline now blocks the uniform-classification pattern observed on 2025-10-11, providing visibility into problematic Gemini responses.
- Dependency pinning and documentation updates create a reproducible environment for future runs.
