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
- 10 records missing pull_quote (unresolvable: 9 THREAD records with metadata-only summaries, 1 TV listings clipping)
- 0 records missing key_concepts (all 328 eligible records filled; 10 Social Media Threads out of scope)
- 4 Bluesky posts with empty raw_text (unrecoverable — failed imports)
- 21 entity near-duplicates flagged for editorial review (see ENTITY_AUDIT_REPORT.md)

---

## Post-verification enrichment (2026-03-01) ✓

- Category normalization committed (all variants mapped to 6 canonical names)
- Entity near-dedup: 5,046 → 5,036 (10 additional merges)
- Pull quotes: 296 of 306 missing records filled using claude -p pipeline
- Key concepts: 328 of 328 eligible records filled using claude -p pipeline
- ftp-upload/data/ synced, all changes pushed to remote

---

## Canonical-sheet diff and URL backfill pass (2026-05-24)

Compared `data/archive_records-public.csv` against the canonical maintainer-side Google Sheet (`1Q_Fik5KQXdkZ4dujEN8H_47K5oldLkv6-hxERuBAdpg`, tab `archive_records` gid=928818664). Diff produced 93 RECORD-* IDs in the sheet not in the repo. Classification:

| Bucket | Count | Disposition |
|---|---|---|
| URL also in repo under different ID (dedup re-ID) | 25 | already handled |
| `_p.html` print versions whose regular `.html` IS in repo | 62 | **correctly removed by `data/dedup_records.py`** — do not re-import |
| `_p.html` print-orphans (regular `.html` also missing) | 3 | recover via Wayback in a future pass |
| Real content gaps (5 sheet-only with non-_p URLs) | 5 | 2 are repo URL backfills, 1 is a net-new record, 2 are sheet-side curly/straight quote duplicates |

### Documenting the `_p.html` dedup pattern (so future audits don't re-discover it)

PressThink in the 2000s served every post in two URL variants: the regular `.html` and a print-friendly `_p.html`. The canonical sheet historically tracked both as separate records. `data/dedup_records.py::is_pressthink_print()` correctly identifies and removes the `_p.html` version whenever the regular `.html` exists. The 62 records visible only in the sheet (not the repo) ARE these intentional removals. **Future verification passes will hit the same 62-record discovery — they should match against this log and stop, not re-investigate.**

### Backfills applied this pass

- `RECORD-00699` "Audience Atomization Overcome" — URL backfilled to `https://pressthink.org/2009/01/audience-atomization-overcome-why-the-internet-weakens-the-authority-of-the-press/`; publication_date corrected from placeholder 2009-01-01 to canonical 2009-01-12; verified set to TRUE.
- `RECORD-00700` "He Said, She Said Journalism" — URL backfilled to `https://pressthink.org/2009/04/he-said-she-said-journalism-lame-formula-in-the-land-of-the-active-user/`; publication_date corrected from 2009-04-01 to canonical 2009-04-12; verified set to TRUE. (Note: sheet had pre-redirect URL; live site canonicalizes to the `-user`-suffix form. Final URL captured.)
- `RECORD-00803` (new) "The journalism that bloggers actually do" — LA Times op-ed (2007-08-22); previously sheet-only as RECORD-00105 (taken in repo) so reassigned. All fields populated from the sheet record.

### Still open

- 3 `_p.html` print-orphans (RECORD-00310, 00521, 00570 in sheet) need Wayback recovery — captured in task #13 / issue #199.
- Sheet-side duplicate entries (curly vs straight quotes in RECORD-00606/00616 and RECORD-00628) are sheet-cleanup, not repo work.
- Entities/relationships counts: sheet has 7,153 / 8,341 vs repo 5,036 / 4,666. Difference is largely the entities/relationships tied to the 62 removed `_p.html` records (which the sheet retains for historical reasons). A second-pass diff is queued to confirm there are no real entity/relationship gaps tied to records that ARE in both.

### Counts after this pass

- Archive records: 931 → **932** (+1 LA Times op-ed)
- Social posts: 29,130 (unchanged)
- Entities: 5,036 (unchanged)
- Relationships: 4,666 (unchanged)
- Test suite: 331/331 pass (verified)
