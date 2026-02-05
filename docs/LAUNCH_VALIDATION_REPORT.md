# Jay Rosen Internet Archive - Launch Validation Report

**Generated:** January 31, 2026
**Target Launch:** February 20, 2026 (~20 days)
**Status:** Action Required

---

## Executive Summary

A comprehensive audit of the Jay Rosen Internet Archive identified **12 critical issues** and **18 medium-priority improvements** that should be addressed before the February 20th launch. The archive contains 29,828 records with an overall data quality score of **71%**.

### Quick Stats
| Metric | Value | Status |
|--------|-------|--------|
| Archive Records | 869 | ✅ |
| Social Posts | 29,187 | ✅ |
| Entities | 5,736 | ⚠️ Needs fixes |
| Relationships | 7,489 | ⚠️ Needs fixes |
| External URLs | 78 | ⚠️ Needs verification |
| Frontend JS Files | 33 | ✅ No syntax errors |

---

## Critical Issues (Must Fix Before Launch)

### 1. CRITICAL: Frontend Path Mismatch
**Impact:** All feature tool links will be broken in production

**Problem:** Frontend code points to `/wp-content/rosen-archive/features/` but tools actually exist in `/dissertation/` directory.

**Affected Files:**
- `frontend/components/ToolsModal.js` (7 hardcoded paths)
- `frontend/App.js` (path definitions)
- `frontend/constants.js`

**Broken Links:**
```
✗ /features/comparison-tool/     → Actually: /dissertation/comparison/
✗ /features/glossary/             → Actually: /dissertation/glossary/
✗ /features/timeline/             → Actually: /dissertation/timeline/
✗ /features/annotated-excerpts/   → Actually: /dissertation/excerpts/
✗ /features/context-1986/         → Actually: /dissertation/context/
✗ /features/faq/                  → Actually: /dissertation/faq/
✗ /features/dissertation-reader/  → Actually: /dissertation/reader/
```

**Solution:** Either restructure directories OR update hardcoded paths. See recommended fix in Section below.

---

### 2. CRITICAL: 79 Duplicate URLs in Archive
**Impact:** Data confusion, broken deduplication, inflated record counts

**Examples:**
- `https://x.com/jayrosen_nyu/status/1975933807455875187` appears 4 times
- `https://bsky.app/profile/jayrosen.bsky.social/post/3lrbmko44y22x` appears 3 times

**Solution:** Run deduplication script and consolidate records.

---

### 3. CRITICAL: 14 Invalid Entity References
**Impact:** Broken relationships, network visualization errors

**Issues:** Invalid `target_entity_id` values like `'O000'`, `'N/A'`, organization names as IDs

**Solution:** Run `python backend/scripts/fix_entity_relationships.py`

---

### 4. CRITICAL: 3,519 Incorrect Entity Mention Counts
**Impact:** Wrong prominence scores, misleading network visualization

**Problem:** All entities show `total_mentions = 1` but actual counts are much higher (e.g., Jay Rosen has 1,427 mentions).

**Solution:** Create and run mention count recalculation script.

---

### 5. CRITICAL: 76 Records Missing Categories (8.7%)
**Impact:** Records don't appear in category filters, poor discoverability

**Solution:** Run `python backend/scripts/auto_categorize_records.py`

---

### 6. CRITICAL: 335 Records Missing Key Concepts (38.6%)
**Impact:** Incomplete concept network, reduced searchability

**Breakdown:**
- Tumblr records: 138 missing (99.3% of Tumblr)
- Main archive: 197 missing (27%)
- Social media threads: 10 missing (100%)

**Solution:** Run key concept extraction using Gemini AI or keyword patterns.

---

### 7. CRITICAL: THREAD ID Format Not Recognized
**Impact:** 6 validation errors for THREAD-00001 through THREAD-00010

**Solution:** Update `validate_archive_data.py` to recognize THREAD prefix.

---

## High Priority Issues (Should Fix Before Launch)

### 8. Entity Extraction Coverage Low (2.1%)
- Only 622 of 30,056 records have entity extraction
- Most social posts lack entity data

### 9. Missing Permissions/License Info
- `permissions` field: 98.7% empty
- `license` field: 66.5% empty

### 10. Missing Publisher Information
- `publisher` field: 67.0% empty

### 11. Missing Pull Quotes
- `pull_quote` field: 24.6% empty in archive records
- 85% empty in social posts

### 12. HTTP URL for archive.pressthink.org
- Uses `http://` instead of `https://`
- Location: `frontend/constants.js` line 82

---

## Medium Priority Issues (Nice to Have)

### 13. Cache Busting Inconsistency
- `AnalyticsDashboard.js` missing version suffix on QueryBuilder import

### 14. Generic Thread Titles
- Threads have placeholder titles like "[Bluesky Thread]"
- Should extract meaningful titles from content

### 15. Missing Twitter Thread Reconstruction Script
- Script documented in CLAUDE.md but doesn't exist
- Template available: `reconstruct_bluesky_threads.py`

### 16. 573 Stub Entities with Poor Names
- Auto-generated entities include names like "so many other bloggers"
- Need manual review

### 17. Missing `influence` Field (100% empty)
- Citation tracking unavailable

### 18. Missing `responds_to` Field (58.8% empty)
- Reply chains incomplete

---

## Recommended Fix Sequence

### Week 1 (Feb 1-7): Critical Data Fixes

```bash
# Day 1-2: Entity & Relationship Fixes
cd /home/user/rosen-frontend

# Step 1: Backup data
cp data/archive_records-public.csv data/archive_records-public.csv.backup
cp data/extracted_entities.csv data/extracted_entities.csv.backup
cp data/extracted_relationships.csv data/extracted_relationships.csv.backup

# Step 2: Fix entity issues
python3 backend/scripts/validate_and_repair_entities.py --dry-run
python3 backend/scripts/validate_and_repair_entities.py

# Step 3: Fix 14 relationship issues
python3 backend/scripts/fix_entity_relationships.py

# Step 4: Auto-categorize records
python3 backend/scripts/auto_categorize_records.py --dry-run
python3 backend/scripts/auto_categorize_records.py
```

### Week 1 (continued): Path Fix

**Option A (Recommended): Restructure directories**
```bash
# Move tools to /features/ to match hardcoded paths
mkdir -p features/comparison-tool features/glossary features/timeline
mkdir -p features/annotated-excerpts features/context-1986 features/faq
mkdir -p features/dissertation-reader

mv dissertation/comparison/* features/comparison-tool/
mv dissertation/reader/* features/dissertation-reader/
mv dissertation/glossary/* features/glossary/
mv dissertation/faq/* features/faq/
mv dissertation/timeline/* features/timeline/
mv dissertation/excerpts/* features/annotated-excerpts/
mv dissertation/context/* features/context-1986/
```

**Option B: Update frontend code**
Update all paths in ToolsModal.js and App.js to use `/dissertation/` paths.

### Week 2 (Feb 8-14): Key Concepts & Relationships

```bash
# Extract key concepts (requires Gemini API key)
# Create adapter script or use existing infrastructure

# Build record relationships
python3 backend/scripts/build_record_relationships.py --dry-run
python3 backend/scripts/build_record_relationships.py

# Regenerate frontend data
npm install
node data/export-archive-data.js
```

### Week 3 (Feb 15-19): Final Validation & Testing

```bash
# Run full validation
python3 backend/scripts/validate_archive_data.py

# Test URLs
python3 backend/scripts/check_url_accessibility.py

# Local testing
python3 -m http.server 8000
# Open http://localhost:8000 and test all features
```

---

## Validation Scripts Available

| Script | Purpose | Command |
|--------|---------|---------|
| `validate_archive_data.py` | Full data validation | `python scripts/validate_archive_data.py` |
| `validate_and_repair_entities.py` | Fix entity IDs | `python scripts/validate_and_repair_entities.py --dry-run` |
| `fix_entity_relationships.py` | Fix 14 relationship issues | `python scripts/fix_entity_relationships.py` |
| `auto_categorize_records.py` | Categorize 76 records | `python scripts/auto_categorize_records.py --dry-run` |
| `check_url_accessibility.py` | Verify external URLs | `python scripts/check_url_accessibility.py` |
| `build_record_relationships.py` | Build relationship network | `python scripts/build_record_relationships.py --dry-run` |
| `archive_record_reviewer.py` | Review archive records | `python scripts/archive_record_reviewer.py --report-only` |

---

## External URLs Requiring Verification

### CDN Dependencies (Critical)
- `https://esm.sh/react@18.2.0` ✅
- `https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js` ✅
- `https://fonts.googleapis.com/...` ✅

### PressThink URLs (Verify Before Launch)
- `https://pressthink.org/j/rosen-archive/rosen-dissertation-feat.png`
- `https://pressthink.org/2025/10/jay-rosen-1986-dissertation-launch-blog-post/`
- `http://archive.pressthink.org/2006/06/27/ppl_frmr.html` ⚠️ HTTP

### External Images
- Unsplash images (5 URLs) - verify persistence
- NYU faculty photo - verify availability

### NotebookLM
- `https://notebooklm.google.com/notebook/d26d326e-...` - verify public access

---

## Data Quality Scores

| Component | Completeness | Integrity | Consistency |
|-----------|--------------|-----------|-------------|
| Archive Records (CSV) | 68% | 95% | 92% |
| Social Posts (CSV) | 45% | 100% | 88% |
| Entities (CSV) | 76% | 85% | 78% |
| Relationships (CSV) | 95% | 100% | 92% |
| **Overall** | **71%** | **95%** | **87.5%** |

**Target for Launch:** 85% overall completeness

---

## Estimated Effort

| Task | Time | Priority |
|------|------|----------|
| Path restructuring | 2 hours | CRITICAL |
| Entity/relationship fixes | 2 hours | CRITICAL |
| Auto-categorization | 1 hour | CRITICAL |
| Key concept extraction | 4 hours | HIGH |
| Relationship building | 1 hour | HIGH |
| URL verification | 2 hours | MEDIUM |
| Data regeneration | 30 min | REQUIRED |
| Full testing | 4 hours | REQUIRED |

**Total Estimated:** 16-20 hours of work

---

## Next Steps

1. **Immediate:** Fix the critical path mismatch issue
2. **This Week:** Run all entity/relationship fix scripts
3. **Next Week:** Complete key concept extraction
4. **Before Launch:** Full validation and testing

---

*Report generated by Claude Code validation agents*
