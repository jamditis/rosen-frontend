# Archive data verification log

Started: 2026-03-01. 25-iteration review of all records, social posts, entities, and relationships.

---

## Iteration 1 — Baseline audit (2026-03-01)

**Tests:** 54/54 pass before any changes.

### Findings

| Issue | Scope | Count | Severity | Status |
|-------|-------|-------|----------|--------|
| THREAD dates have timestamps instead of YYYY-MM-DD | archive_records-public.csv | 10 | Medium | Fixed iter 2 |
| Missing URL | archive_records-public.csv | 16 | High | Investigating |
| Missing original_publication | archive_records-public.csv | 35 | Medium | Investigating |
| Confirmed dead URLs (sample check) | archive records | 2 | High | Fixed iter 2 |
| Era values inconsistent in CSV | archive_records-public.csv | varies | Low | Harmless — export script overrides |
| Twitter/X posts missing thematic_categories | social_posts.csv | 8,941 (34%) | Medium | Planned iter 6-10 |
| Bluesky posts missing thematic_categories | social_posts.csv | 4 | Low | Planned iter 6 |
| social_posts verified field empty | social_posts.csv | 29,132 (100%) | Low | By design — social posts not individually verified |
| Orphaned relationships (point to non-public records) | extracted_relationships.csv | 374 | Low | Expected — filtered from public export |
| Duplicate entity names | extracted_entities.csv | 2 ("Encyclopedia Britannica", "Malcolm Gladwell") | Low | Investigating |
| 385 non-Jay-Rosen author records | archive_records-public.csv | 385 | Info | Intentional — archive includes related works |

### Dead URLs confirmed

- **RECORD-00657** — publicnotebook.wordpress.com/2009/12/07/... — 404, deleted WordPress post
- **RECORD-00671** — archive.pressthink.org/2003/11/06/reagans_cbs.html — 404, missing from server

### Missing URL records

RECORD-00663, 00664, 00665, 00666, 00667, 00673, 00681, 00685, 00692, 00693, 00694, 00695, 00696, 00699, 00700, 00701

Note: CLAUDE.md already documents 6 records with no recoverable URL: RECORD-00663, 00667, 00673, 00693, 00694, 00700.

### Entity quality

- 5,055 entities — all required fields populated
- 5,048 relationships — entity cross-references 100% valid
- Top entity: Jay Rosen (377 mentions), PressThink (251), NYT (190)

---

## Iteration 2 — Fix THREAD dates + dead URLs (2026-03-01) ✓

- Fixed 10 THREAD records: stripped HH:MM:SS timestamps → YYYY-MM-DD
- Dead URL RECORD-00657 and RECORD-00671: No Wayback snapshots available; notes updated
- 16 no-URL records remain unfixable (6 already documented in CLAUDE.md as unrecoverable)
- 35 missing original_publication records: all filled from URL domain inference

---

## Iteration 3 — Duplicate removal + column fixes (2026-03-01) ✓

- TUMBLR-00062 removed (confirmed duplicate of RECORD-00662, same post two URL formats)
- RECORD-00080 gdrive_raw_file_link cleared (had filename instead of URL)
- RECORD-00040 gdrive_transcript_link cleared (had title text instead of URL)
- RECORD-00683, RECORD-00719 already removed in a prior session
- THREAD categories verified correct — all 10 have specific appropriate categories
- Non-Rosen social posts (1,489): confirmed intentional, export script already filters them
- 4 Bluesky posts with empty raw_text: no actionable fix (BSKY-00262, 00719, 00873, 01381)

---

## Iteration 4 — Quality report review + pre-export verification (2026-03-01) ✓

- Content accuracy report false positives: RECORD-00029 date already correct, author
  fields already clean — these were fixed in a prior session
- Era values in CSV: left as-is (export script overrides from date ranges, CSV value irrelevant)
- quality-reports/ directory retained as reference

---

## Iteration 5 — CHECKPOINT: re-export JSON, sync ftp-upload, commit (2026-03-01) ✓

- Re-exported all JSON: 26,013 total records (931 archive + filtered social posts)
- 54/54 data tests pass
- ftp-upload/data/ synced with fresh JSON files
- All changes committed to git

---

## Iterations 6-10 — Social posts categorization + entity dedup (2026-03-01) ✓

- Categorized all 8,941 uncategorized Twitter/X posts via keyword matching
  - Press & Media Criticism: 7,102 (79.4%) — Jay Rosen's dominant topic
  - Politics & Democracy: 1,370 (15.3%)
  - Journalism Theory & Practice: 937 (10.5%)
  - Technology & Digital Media: 619 (6.9%)
  - Audience & Public Engagement: 564 (6.3%)
  - Journalism Education: 256 (2.9%)
- 4 Bluesky posts remain uncategorized (empty raw_text, unrecoverable)
- Removed 2 duplicate entities: Malcolm Gladwell (P0052) and Encyclopedia Britannica (O0705)
- Relationship references updated to kept entity IDs
- Entities: 5,055 → 5,053 | Relationships: 5,048 (unchanged)
- Re-exported JSON, 54/54 data tests pass, ftp-upload synced

---

## Iterations 11-15 — Social posts URL + content audit (2026-03-01) ✓

- URL liveness: 154 URLs sampled (53 Twitter/X + 101 Bluesky) — 100% alive
- Social post datetime format: ALL posts store full datetime — intentional; export
  script strips to YYYY-MM-DD via .toISOString().split('T')[0]; no fix needed
- Removed TWTR-10010 (author="Name cannot be blank") and TWTR-08286 ("Quoted by Joe Amditis")
- Content completeness: 99.99% of posts have raw_text and excerpt; 4 unrecoverable (empty content)
- Era field: perfect — all 29,132 posts correctly set to "Post-Trump & Future of News (2022-Present)"
- Engagement data: 90.1% of posts have engagement data; top post: 294,295 likes (TWTR-06651)
- Social posts: 29,132 → 29,130 after cleanup; 54/54 data tests pass

---

## Iterations 16-20 — Entities deep audit (2026-03-01) ✓

- Merged 7 additional entity duplicates:
  - "Dan Gillmore" → "Dan Gillmor" (spelling fix)
  - "Fox News Channel" → "Fox News"
  - 4 NYT subsidiary variants → "The New York Times" (16 relationships redirected)
  - "The Washington Post Company" → "The Washington Post"
- 31 relationships redirected, entity count: 5,053 → 5,046
- 21 additional near-duplicates flagged for human review (conflicting type classifications,
  organizational variants, blog/domain disambiguation) — see data/ENTITY_AUDIT_REPORT.md

---

## Iterations 21-25 — Relationships + tags + final sweep (2026-03-01) ✓

**Relationships:**
- Removed 10 duplicate relationship entries + 2 self-references (Fox News/NYT)
- Relationships: 5,048 → 5,036 | Referential integrity: 100%
- Confidence scores: range 0.50-1.00, mean 0.878 (high quality)
- 15 relationship types all valid

**Archive records completeness (audit only, no AI backfill in this pass):**
- Summary: 100% ✓ (all 931 records)
- Excerpt: 92.3% ✓
- Pull quote: 67.1% — 306 missing, primarily articles (future pipeline work)
- Key concepts: 63.7% — 338 missing; social threads 0% (out of scope)
- Tags: 73% coverage

**Tags normalization:**
- Stripped quote characters from all tag values
- Unified case variants to title case (e.g., "citizen journalism" → "Citizen Journalism")
- Deduplicated within rows
- 670 records updated; 0 remaining quote issues
- Autocomplete terms: 57,334 → 57,806 (title-cased variants unified for facet search)

**Final state:**
- Archive records: 931 (started 932, removed 1 confirmed duplicate)
- Social posts: 29,130 (started 29,132, removed 2 bad entries)
- Entities: 5,046 (started 5,055, removed 9 duplicates)
- Relationships: 5,036 (started 5,048, removed 12 duplicates/self-refs)
- 54/54 data tests pass throughout
- ftp-upload/ fully synced with all JSON files

**Known remaining issues (require human or pipeline work):**
- 16 archive records with no URL (6 confirmed unrecoverable per CLAUDE.md)
- 306 records missing pull_quote (requires AI extraction pipeline)
- 338 records missing key_concepts (requires AI extraction pipeline)
- 4 Bluesky posts with empty raw_text (unrecoverable — failed imports)
- 21 entity near-duplicates flagged for editorial review (see ENTITY_AUDIT_REPORT.md)
