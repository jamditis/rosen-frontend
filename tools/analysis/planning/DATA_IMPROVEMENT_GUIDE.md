# Data Improvement & Correction Guide
**Rosen Archive Project - Using Existing Raw Text to Update Sheet Data**

## Executive Summary

✅ **Good News:** A script already exists that does exactly what you need!

**Script:** `tools/diagnostics/data_improver.py`

**What it does:** Uses existing `raw_text` from the "test_runs" tab to populate/correct all other columns using AI analysis, while minimizing token costs.

---

## Option 1: Use Existing `data_improver.py` (RECOMMENDED ✓)

### Cost Profile: **LOW** 💰
- **No scraping costs** (uses cached `raw_text`)
- **1 AI call per row** (only Gemini categorization)
- **Skips already-processed rows** (checks `notes` column)

### Features:
- ✅ Uses existing `raw_text` (no re-scraping)
- ✅ Updates only changed fields
- ✅ Writes detailed notes about changes
- ✅ Skips rows already processed (has notes)
- ✅ Compares before updating (no redundant writes)
- ✅ Handles both simple fields and list fields intelligently

### Fields Updated:
**Simple Fields:**
- `title`
- `author`
- `publication_date`
- `summary`

**List Fields (merged intelligently):**
- `thematic_categories`
- `key_concepts`
- `tags`

### How to Run:
```bash
# From project root:
./venv_production/Scripts/python.exe run_improver.py
```

### Example Output:
```
--- Analyzing Row 42: https://example.com/article ---
  [INFO] Raw text found. Reprocessing based on existing content.
  [SUCCESS] Finished processing row 42. Notes: Improved on 2025-10-22 18:15:30:
    Updated author: from 'Unknown' to 'Jay Rosen';
    Added key_concepts: View from Nowhere;
    Updated summary: from '...' to '...'
```

### Cost Estimate (629 rows):
| Component | Cost per Row | Total Cost (629 rows) |
|-----------|--------------|----------------------|
| Gemini API calls | ~1,000 tokens | ~629,000 tokens (~$0.31)* |
| Google Sheets API | Free (under quota) | $0 |
| **TOTAL** | | **~$0.31** |

*Based on Gemini 2.0 Flash pricing (~$0.00050 per 1K tokens)

---

## Option 2: Use `bulk_reprocessor.py` (NOT RECOMMENDED for this use case)

### Cost Profile: **HIGH** 💰💰💰
- **Re-scrapes every URL** (wasteful if `raw_text` exists)
- **Multiple AI calls per row** (URL Context + categorization)
- **No deduplication** (processes all rows)

### When to Use:
- When `raw_text` is missing or corrupted
- When you need to refresh content from source
- For initial bulk processing

### Cost Estimate (629 rows):
| Component | Cost per Row | Total Cost (629 rows) |
|-----------|--------------|----------------------|
| URL Context API calls | ~2,000 tokens | ~1,258,000 tokens |
| Gemini categorization | ~1,000 tokens | ~629,000 tokens |
| Playwright scraping | Time + resources | Significant |
| **TOTAL** | | **~$0.94 + infrastructure** |

**3x more expensive** than Option 1

---

## Option 3: Create New Optimized Script (PRD Below)

If the existing `data_improver.py` doesn't meet your needs, here's a PRD for an enhanced version:

### Product Requirements Document
**Script Name:** `smart_data_corrector.py`

#### Requirements:
1. **Batch Processing**
   - Process rows in configurable batches (default: 50)
   - Progress tracking and resume capability
   - Dry-run mode to preview changes

2. **Smart Field Detection**
   - Detect which fields are empty/incorrect
   - Only run AI analysis if needed
   - Skip rows where all fields are already populated correctly

3. **Cost Optimization**
   - Cache AI responses to avoid duplicate calls
   - Use cheaper AI models for simple extractions
   - Batch Google Sheets updates (reduce API calls)

4. **Validation & Quality Control**
   - Validate AI outputs against schema
   - Flag suspicious changes for manual review
   - Report quality metrics (accuracy, completeness)

5. **Selective Processing**
   - Command-line flags to select which fields to update
   - Date range filtering (process only recent rows)
   - URL pattern filtering (e.g., only PressThink URLs)

#### Cost Target:
- **< $0.20 for 629 rows** (using Gemini 2.0 Flash Lite where possible)
- **< 1,000 Sheets API calls** (batch updates)

#### Implementation Estimate:
- **Development time:** 4-6 hours
- **Complexity:** Medium

---

## Recommendation

**Use Option 1 (`data_improver.py`)** for now because:

1. ✅ It already exists and works
2. ✅ Very low cost (~$0.31)
3. ✅ Uses cached `raw_text` (no re-scraping)
4. ✅ Smart deduplication (skips processed rows)
5. ✅ Detailed change tracking

**Only create Option 3** if you need:
- Batch processing with resume capability
- More granular control over which fields to update
- Better reporting and validation

---

## Next Steps

### Immediate Action:
```bash
# Test on a small batch first (modify script to limit rows)
./venv_production/Scripts/python.exe run_improver.py
```

### Monitor:
- Check the `notes` column in "test_runs" for processing results
- Review updated fields for accuracy
- Track API usage in Google Cloud Console

### If Issues Arise:
Create Option 3 (smart_data_corrector.py) with the PRD above.

---

## Script Comparison Matrix

| Feature | data_improver.py | bulk_reprocessor.py | smart_data_corrector.py (PRD) |
|---------|------------------|---------------------|-------------------------------|
| Uses cached raw_text | ✅ Yes | ❌ No (re-scrapes) | ✅ Yes |
| Cost per 629 rows | ~$0.31 | ~$0.94+ | ~$0.20 |
| Deduplication | ✅ Yes | ❌ No | ✅ Advanced |
| Batch processing | ❌ No | ✅ Yes | ✅ Yes |
| Resume capability | ❌ No | ❌ No | ✅ Yes |
| Dry-run mode | ❌ No | ❌ No | ✅ Yes |
| Field selection | ❌ No | ❌ No | ✅ Yes |
| Change tracking | ✅ Good | ⚠️ Basic | ✅ Excellent |
| **Recommendation** | **✅ Use now** | ❌ Wrong tool | 🔨 Build if needed |

---

**Last Updated:** 2025-10-22
**Author:** Analysis by Claude Code
**Project:** Jay Rosen Internet Archive
