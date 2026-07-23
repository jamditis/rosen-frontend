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

---

## Curator deletion: phantom records 00665 and 00666 (2026-06-24)

Curator decision on issues #199 and #242 (Joe, 2026-06-24): delete both records. Removed from `data/archive_records-public.csv` and the `data/gap-fill-new-records.csv` staging file, then regenerated the published JSON and RSS/OPML feeds via `npm run export-data`.

- **RECORD-00665, "The digital revolution"** (CJR, 2003): phantom. A Wayback CDX query over cjr.org 2003 to 2004 returned zero matching paths, and cjr.org/author/jay-rosen lists only the 2013 "awayness problem" piece. The 557-character body was share-widget text captured by a stale-branch scrape, not article content.
- **RECORD-00666, "What are journalists for?"** (The American Prospect, 2001): the empty-URL duplicate of RECORD-00038. The matching prospect.org URL is Marty Linsky's book review, not a Rosen essay.

Record count: 800 to 798. Data tests: 87 of 87 pass.

Not part of this decision: RECORD-00038 carries the same Linsky book review attributed to Rosen with verified=TRUE. Re-attributing or removing it is a separate curator call.

---

## Full-integrity baseline and missing-URL review (2026-07-22)

The active project goal is to verify every record, complete every applicable
field, map every entity to a canonical identity, preserve provenance and
exceptions, and prove the result with repeatable validation.

### Baseline

The canonical CSVs were parsed with `csv-parse` rather than counted by line so
multiline text fields could not distort the totals.

| Dataset | Rows | Immediate findings |
|---|---:|---|
| `archive_records-public.csv` | 1,028 | 949 `verified=TRUE`; 79 `verified=FALSE`; 4 blank URLs |
| `social_posts.csv` | 29,747 | All 29,747 `verified` cells blank under the current social-record convention |
| `extracted_entities.csv` | 7,389 | 88 duplicate normalized-name groups; 1,879 entities unused by any relationship |
| `extracted_relationships.csv` | 10,647 | No blank fields and no missing record/entity foreign keys |

`npm run test:data` passed 87 of 87 tests. `npm run
test:data:extraction-coverage` passed its one invariant, but that invariant only
covers `RECORD-*` rows with at least 500 characters of `raw_text`.

The Python validator initially rejected the 10 documented `THREAD-*` IDs and
divided archive extraction coverage by the combined archive-plus-social
population. Regression tests in
`backend/tests/test_validate_archive_data.py` reproduced both defects. The
validator now accepts `THREAD-*` IDs and measures relationship coverage against
archive records only. Both regression tests pass, and the repaired validator
reports 784 of 1,028 archive records with entity relationships (76.3%) with no
validation errors.

### Missing-URL evidence

#### `RECORD-00602`

- Stored claim: “I have a new job: president of News Creator Corps,” dated
  2025-06-13.
- Primary Bluesky API response for
  `at://did:plc:3t37x6vfigdzzp2gjcfnzlz4/app.bsky.feed.post/3m2oukjxiic2i`
  returned the matching announcement with CID
  `bafyreidprldnor7aopjnyl7h2fdiqdlt2i7m5zupke27td3d26qggtawru` and creation
  time `2025-10-08T14:37:50.06Z`.
- Primary Bluesky API response for
  `at://did:plc:3t37x6vfigdzzp2gjcfnzlz4/app.bsky.feed.post/3m2wso76r7k2i`
  returned a follow-up with CID
  `bafyreidgqkao6vcikdl6lqwpb3b6kh4gkxalgeqnwwqj76gmvas63zx4pi` and creation
  time `2025-10-11T18:25:23.395Z`.
- The canonical social CSV already contains those posts as `BSKY-00119` and
  `BSKY-00086`, plus matching X imports `TWTR-15441` and `TWTR-15431`.
- Jay Rosen's article on the News Creator Corps site identifies him as its
  president and is dated 2025-10-08.
- Result: the June archive record is contradicted by primary evidence and
  duplicates canonical social content. Keep it unverified pending curator
  approval to delete or reclassify it.

Sources checked 2026-07-22:

- `https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts`
- `https://bsky.app/profile/jayrosen.bsky.social/post/3m2oukjxiic2i`
- `https://bsky.app/profile/jayrosen.bsky.social/post/3m2wso76r7k2i`
- `https://newscreatorcorps.org/2025/10/news-consumers-content-creators/`

#### `RECORD-00613`

- Stored claim: “The real work of journalism began after the initial news
  broke,” dated 2024-10-22.
- The full primary Bluesky author feed was paged through the target date. No
  post matched the stored text.
- A Wayback CDX query for Jay Rosen's Twitter status URLs from 2024-10-21
  through 2024-10-23 returned no captures.
- General and domain-restricted exact-phrase searches returned no source.
- Result: no reliable source found. Keep it unverified. The existing summary is
  generic AI guesswork and must not be published.

Sources checked 2026-07-22:

- `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed`
- `https://web.archive.org/cdx/search/cdx`

#### `RECORD-00663`

- Stored title: “Pistols for two: coffee with Jay Rosen.”
- The Baffler's primary issue index for issue 12, March 1999, lists “Pistols for
  Two: Jay Rosen vs Thomas Frank” by Jay Rosen.
- The linked primary article page publishes Rosen's response and Frank's reply,
  so the record is digitally recoverable.
- A University of California, Irvine bibliography describes it as an exchange
  about public journalism, the media industry, and democracy, on pages 116–119.
- Result: the record is real and its bibliographic metadata is recoverable. On
  2026-07-22, the row was corrected to the source title and URL, the summary was
  rewritten to describe the Rosen–Frank exchange, the concepts and tags were
  corrected, and the invented pull quote was replaced with a short source
  quote. The row is now verified. The issue supplies only March 1999, so the
  stored `1999-03-01` date is documented as a normalized first-of-month date.
  Full text is not stored because source rights do not grant republication.

Sources checked 2026-07-22:

- `https://thebaffler.com/issues/no-12`
- `https://thebaffler.com/odds-and-ends/pistols-for-two-jay-rosen-vs-thomas-frank`
- `https://www.lib.uci.edu/docs/cdfs/2005/frank.pdf`

#### `RECORD-00667`

- The earlier exact-title search failed because `Civic leadership and the
  press` was an unsupported placeholder title. A broader source-recovery search
  located the official University of Pennsylvania page, `Part of Our World:
  Journalism as Civic Leadership`, by Jay Rosen.
- At `2026-07-23T04:14:28.523-04:00`, the official page returned HTTP 200. The
  45,149-byte HTML has SHA-256
  `85f414d02dd4550dc3394d0696330534194afd14409c46009a568c99a1780ec7`;
  its response headers have SHA-256
  `c4f2bf98faf7345c4daf41c6d13ecf39c1f1819ad2ab5411eef009025ab1df77`.
- At `2026-07-23T04:16:38.013-04:00`, the official `Public Talk` issue index
  returned HTTP 200. Its 2,768-byte HTML has SHA-256
  `28c4d32c8eaea253234bcd40923dc961db3189a710e454cbcc6459b9b48a0007`
  and identifies the issue as Fall 1998 through `ptfall98.gif`.
- The article page identifies Jay Rosen and New York University, supplies the
  full body, and carries an explicit 1998 University of Pennsylvania rights
  notice. It says the material may not be duplicated or redistributed without
  the Penn National Commission's express written permission. The prior Pew
  Center attribution, 2000 date, 8,094-word estimate, and print-monograph theory
  are rejected.
- A deterministic extraction kept the first article blockquote through the
  point before the rights footer, decoded HTML entities, normalized whitespace,
  and joined 94 paragraphs. The saved 43,025-byte text has SHA-256
  `849ff191ebb65395594bc23b776dfe241c1b7b93a18bac17055840041d836b33`.
  The stored text omits only its final LF, contains 43,024 characters and 7,161
  whitespace-delimited words, and has SHA-256
  `d10991f16f048b4aabc97890c3147d4402f8d1f13a1315b452c3c7f363b9c5af`.
- A failing source regression was added before repair. The repaired row now has
  the official title, URL, outlet, publisher, year, body, count, excerpt, pull
  quote, summary, tags, era, and explicit rights fields. `1998-01-01` is the
  repository's documented year-only placeholder for the Fall 1998 issue. The
  row is verified and no longer needs review.

Independent verification confirms the focused regression passes, the stored
body and word count match the captured source, the archive validator reports no
errors, and the CRLF-aware diff check passes. The archive CSV SHA-256 at this
checkpoint is
`67e8b1b617126f687a1b0283d93bacf88e3663ecd475db6a77a88518650aa7bc`.

### Entity and relationship baseline

- All 88 repeated normalized names span different entity types. There are no
  same-type exact normalized-name duplicates. These groups require semantic
  disambiguation because pairs such as a concept and a book can share a valid
  name.
- One invalid self-reference existed:
  `RECORD-00866_REL_001` connected `E0448` (Netroots Nation 2008) to itself with
  `Discusses`. It was deleted in the current uncommitted proposal on 2026-07-22;
  `RECORD-00866_REL_002` retains the event's valid association with the source
  record.
- 1,879 entities have a positive stored `total_mentions` value but do not appear
  as either endpoint of any relationship. By type: 715 Person, 461
  Organization, 264 Work, 243 Concept, 113 Location, and 83 Event.
- 152 entities have no `first_mention_record_id`. Of the detached entities, 125
  are missing that field; every nonblank first-mention ID resolves to a current
  archive record.
- Every one of the 10,647 relationship rows uses a `RECORD-*` source. No
  relationship row uses a `TUMBLR-*`, `CLIP-*`, or `THREAD-*` source.
- The existing `RECORD-*` extraction gate still passes at 784 of 798 records;
  the 14 uncovered `RECORD-*` rows fall below its 500-character text threshold.
- Across every archive prefix, 74 records with at least 500 characters of
  `raw_text` have no relationship row. This wider gate now fails in
  `tests/extraction-coverage.test.js`.

The current targeted audit has 36 checks: 27 pass and 9 fail by design. The
failing checks cover:

- seven blank archive core fields across seven records;
- 75 archive records without summaries;
- 78 archive records that are not verified;
- 10 HuffPost `#NN08` records using capture years instead of 2008 source years;
- 29,746 social records without an explicit verified value;
- three social records without source text or a documented non-text exception;
- every entity has a first-mention record;
- every entity has at least one relationship edge;
- every archive record with at least 500 characters of text has extracted
  relationships.

### Draft completion gates

These gates define a measurable end state without treating a blank conditional
field as evidence of an error. They are the working contract until the pending
storage decisions below are approved.

1. Every source CSV parses without loss, has the documented header in the
   documented order, and has unique stable primary keys.
2. Every required or applicable field has a value. A conditional field may be
   blank only when its applicability rule evaluates false and the verification
   evidence records that result as not applicable.
3. Every archive record has an explicit verification outcome backed by a
   primary source, an authoritative archive capture, or a documented secondary
   source when no primary source survives. A record that cannot be supported is
   repaired, reclassified, quarantined, or removed through curator review; it
   is not silently marked verified.
4. Every social record has an explicit verification outcome tied to its
   platform identifier or import evidence. The exporter's current behavior of
   treating every social row as verified does not count as row-level evidence.
5. Titles, authors, dates, publications, URLs, excerpts, summaries, pull quotes,
   and raw text agree with the cited evidence. Derived counts agree with the
   stored text. Copyright or source-availability limits are explicit exceptions,
   not guessed content.
6. Every entity resolves to one stable canonical identity for its meaning and
   type, has a normalized name, a first-mention record, and at least one direct
   record association. Same-name cross-type entities are disambiguated rather
   than automatically merged.
7. Every relationship resolves to an existing source record and two existing
   canonical entities, has evidence in its context snippet, uses an allowed
   relationship type, and is not self-referential.
8. Every generated JSON artifact is reproduced from the canonical CSVs, matches
   the active schema, and passes the full data, pipeline, and frontend test
   commands.
9. The final audit reports zero unexplained failures, zero unverified records,
   zero missing applicable fields, zero unmapped entities, zero invalid
   relationships, and zero schema drift.

### Current field-completeness profile

The live CSV profile establishes the denominator for later batches:

- Archive records: 3 blank URLs, 4 blank publishers, 68 blank excerpts, 75
  blank summaries, 85 blank key-concept cells, 36 blank pull quotes, 48 blank
  raw-text cells, and 78 explicit `verified=FALSE` rows.
- Social records: 1 verification cell is explicit and 29,746 are blank even
  though the exporter treats social rows as verified by record type. Three rows
  lack both excerpt and raw text or a documented non-text exception.
- Entities: 2,253 blank role or description cells, 4,866 blank affiliation
  cells, 152 blank first-mention cells, and no values in `related_entities`.
- Relationships: all 10,647 rows have values in every current column.

Duration, series, licensing, permissions, Google Drive, transcript, reply,
influence, affiliation, and similar fields are conditional. Their blank totals
cannot be labeled defects until their applicability rules are encoded.

### Pending storage decisions

Three choices would shape future data and are therefore paused for curator
approval:

1. Store field-level verification and not-applicable reasons in a separate
   machine-readable ledger, or add provenance columns to the large source CSVs.
2. Add a direct record-to-entity association table, or continue deriving record
   mappings from semantic entity-to-entity relationships. The current derived
   map cannot represent the 1,879 detached entity rows without inventing
   semantic edges.
3. Make the CSV contract or `schema.json` authoritative. The checked-in schema
   currently omits many live CSV fields and contains a stale four-era enum while
   the documented and live taxonomy has eight values.

### Stewardship program linkage (2026-07-22 correction)

This session began its local audit before checking the repository's new
stewardship roadmap. Joe corrected that omission. All further work must connect
to the existing program rather than create a parallel integrity project.

- Program and sequencing: #693 is the parent stewardship program. Research may
  overlap across milestones, but production rollout remains gated in order.
- Baseline: #696 and milestone 8 own the baseline and pilot. The field census,
  source counts, graph coverage, and deterministic gap checks in this log are
  inputs to #703, not a replacement for its required machine-readable JSON and
  Markdown outputs.
- Record rules: #695 and milestone 11 own record quality. The draft completion
  gates map to #723; curated-record findings and `RECORD-00663` map to #724;
  social verification and `BSKY-00262` map to #725; accepted-versus-proposed
  state maps to #727; and before/after counts map to #730.
- Recovery: #538 must be updated because it still calls `RECORD-00663`
  unrecoverable and print-only. The primary Baffler article is now live and was
  used for the uncommitted repair proposal.
- Graph work: #698 and milestone 12 own entity and relationship integrity. The
  validator gates map to #731, canonical identity and merge decisions to #732,
  first-mention repairs to #733, relationship provenance to #734, and coverage
  and orphan reporting to #738.
- Preservation evidence: #697 and #726 own capture evidence and the sidecar
  preservation index. A separate provenance format must be coordinated with
  those contracts and #727/#734 rather than invented here.

The current branch is based on `f4a3d24`, while remote `main` is
`5d3d535`. The branch source data has 1,028 archive records, 7,389 entities, and
10,647 relationships before this session's one relationship deletion. Current
remote `main` has 1,029 archive records, 8,150 entities, and 12,556
relationships, matching the stewardship baseline. Because the branch predates
that corpus, the current CSV edits remain uncommitted review proposals. No
additional canonical batch should run here; accepted changes must be replayed
against the current stewardship baseline through the review path.

### Current-main census draft for #703

This read-only census was calculated directly from remote commit `5d3d535` so
the dirty design worktree could not affect the measurements.

| Surface | Current-main result |
|---|---:|
| Curated source rows | 1,029 |
| Social source rows | 29,747 |
| Source entities | 8,150 |
| Source relationship assertions | 12,556 |
| Published runtime records | 26,616 |
| Published runtime entities | 8,150 |
| Records with a `recordEntityMap` entry | 1,404 |

Current curated-record findings:

- 950 rows are verified and 79 are unverified. The 79 unverified source rows are
  absent from the published runtime data.
- Eight core-field cells are blank: four publishers and four URLs.
- 75 summaries, 68 excerpts, 85 key-concept cells, 323 tag cells, 36 pull
  quotes, and 50 raw-text cells are blank before record-class applicability is
  evaluated.
- Seventy-four records with at least 500 characters of raw text have no
  relationship assertion. The uncovered set is concentrated outside the
  `RECORD-*` prefix.

Current social findings:

- All 29,747 verification cells are blank under the current exporter convention.
- Four Bluesky rows have no text: `BSKY-00262`, `BSKY-00719`, `BSKY-00873`, and
  `BSKY-01381`. The public API proves `BSKY-00262` is an image-only post with an
  empty text field and blank alt text, so a documented non-text outcome is more
  accurate than invented raw text.

Current graph findings:

- 152 entities have no first-mention source record.
- Every nonblank first-mention ID resolves in the source CSVs, but 465 point to
  filtered records absent from the published runtime. This is the exact source
  versus runtime distinction tracked by #733.
- 1,821 entities do not appear as either endpoint of a relationship assertion.
- No same-type normalized-name duplicate groups exist.
- All relationship record and entity foreign keys resolve in the source files.
- Two invalid self-references exist: `RECORD-00866_REL_001` and
  `TWTR-03015_REL_002`. In both cases the same entity is the source and target,
  and the source text does not support a reflexive assertion. Their removal must
  remain a curator-reviewed graph proposal under #698/#734.
- Relationship source coverage now includes 10,643 curated `RECORD-*`
  assertions, 1,614 Twitter assertions, 236 Bluesky assertions, and 63 Mastodon
  assertions. The older design-branch audit predates that social graph slice.

This is a measured draft, not yet the #703 deliverable. That issue still
requires one deterministic command, machine-readable JSON, a generated Markdown
summary, input and rule versions, fixtures, and count-drift tests.

#### #703 contract refresh

On 2026-07-22, `gh issue view 703 --repo jamditis/rosen-frontend --json ...`
exited 0 and returned the open milestone-8 issue, updated
2026-07-23 00:08:50 UTC. Its acceptance criteria still require byte-repeatable
JSON and Markdown outputs, source/runtime reconciliation, explicit filtered-row
counts, curated/social graph coverage, input commit and schema version, fixture
tests, drift detection, and an explanation for any difference from this
2026-07-22 baseline.

The deterministic contract should not write a wall-clock generation time into
tracked output. The same inputs must produce the same bytes. Stamp the input
commit, tool schema version, input file SHA-256 values, Node version, and dirty
worktree state instead. A dirty run must either refuse tracked output or mark
it with file hashes so the commit stamp is not misleading.

Before creating the report schema, curator/maintainer review is required for
three one-way choices:

- the versioned JSON field hierarchy and compatibility policy;
- the ordered taxonomy of filtered-source reasons, because exporter filters can
  overlap and first-match ordering changes counts;
- the accepted host and field patterns for Wayback and other preservation
  references.

The implementation can reuse pure internal-reference and URL checks from
`scripts/verify-links.js`, whose main guard already permits imports in tests.
Keep network liveness out of #703 so the census stays deterministic.

### Bluesky non-text evidence packets

These packets are findings for the #725 worker and #727 review path. They do not
authorize direct changes to the canonical rows.

#### `BSKY-00719`

- The source is Jay Rosen's image-only reply at
  `at://did:plc:3t37x6vfigdzzp2gjcfnzlz4/app.bsky.feed.post/3lt3di4ysbc2m`,
  CID `bafyreicj355p77q7lccdm6tpzyp3f3gxeeq2znj42djbjya62tpgcpvpjy`.
- The record text and image alt text are blank. The image blob is
  `bafkreifcxfmzjive6pg6x6jrajlrtuhl4awgo3jbvg2ascspwjl7bqjrfq`.
- The image quotes a passage about artificial intelligence, competition for
  attention, trust in news, and demand for verified human reporting. The reply
  belongs to the thread rooted at `BSKY-00730`, which cites Julia Alexander's
  reporting at Puck.
- Proposed title: “AI, trust, and the future of digital publishing.” Proposed
  categories: Technology & Digital Media, Press & Media Criticism, and
  Journalism Theory & Practice. Keep `raw_text` blank and document the image
  exception instead of storing the quoted passage.

#### `BSKY-00873`

- The source is Jay Rosen's image-only reply at
  `at://did:plc:3t37x6vfigdzzp2gjcfnzlz4/app.bsky.feed.post/3lrqwe3succ26`,
  CID `bafyreig66lkvlociczmn7ybj4nwqrwscnzug7myat5sijpkluthkz3byqy`.
- The record text and image alt text are blank. The image blob is
  `bafkreieoseskosjhirplhbu76dxy3dppc5quuk5kom3o5jkle76a6lkppa`.
- The image reproduces Rosen's “The cult of savviness” passage. The exact
  primary source is
  `https://pressthink.org/2011/08/why-political-coverage-is-broken/`.
- Proposed title: “The cult of savviness.” Proposed categories: Press & Media
  Criticism, Politics & Democracy, and Journalism Theory & Practice. Keep
  `raw_text` blank; use the primary-source URL in `related_to` and a descriptive
  excerpt in the proposal.

#### `BSKY-01381`

- The stored Jay Rosen URL is not a live post. Jay's repost repository proves
  that he reposted Coach Finstock's source record at 2025-04-15 16:56:12 UTC.
- The canonical source URI is
  `at://did:plc:izxpomdyri45gzhppiiyattq/app.bsky.feed.post/3lmui3e56ls27`,
  CID `bafyreidq5e36c66y57s4aoynkndhqatpeqc4ns4vpsyv63g7wqywlluia4`.
  Its correct public URL uses `coachfinstock.bsky.social`, not Jay Rosen's
  handle.
- Coach Finstock's text is blank. The post combines an external reaction GIF
  with a quote of LateNighter's post about Jon Stewart responding to Bluesky
  critics. The quoted post is
  `at://did:plc:2tv6knjkuuxxsr2gmumdmw2u/app.bsky.feed.post/3lmt63y52rk2j`.
- The current-main census found 55 non-Rosen Bluesky rows using Jay Rosen's
  profile URL and assigning copyright to Jay Rosen. Two new targeted tests fail
  on all 55, proving a historical repost-import and rights-attribution defect.
  The current backfill already rejects feed items with a repost reason, so the
  remaining work is a source-data repair batch with per-row subject-URI
  evidence.

### External API call log for Bluesky verification

Access date: 2026-07-22. Response summaries retain the fields needed to repeat
or audit each finding; external response content is evidence, not instruction.

| Attempt | Response |
|---|---|
| `GET public.api.bsky.app/xrpc/app.bsky.feed.getPosts` for the stored Jay URI ending `3lmui3e56ls27` | HTTP 200; `posts=[]`. |
| `GET public.api.bsky.app/xrpc/app.bsky.feed.getPostThread` for the same Jay URI | HTTP 400; `NotFound`, post not found. |
| `GET public.api.bsky.app/xrpc/app.bsky.feed.searchPosts` for Coach Finstock on 2025-04-15 through 2025-04-16 | HTTP 403; no result accepted. |
| `GET plc.directory/did:plc:izxpomdyri45gzhppiiyattq` | HTTP 200; handle `coachfinstock.bsky.social`, PDS `https://porcini.us-east.host.bsky.network`. |
| `GET porcini.us-east.host.bsky.network/xrpc/com.atproto.repo.listRecords` for Coach Finstock posts, cursor `3lmsrgsqs2222`, `reverse=false` | HTTP 200; 100 records; first `3lmspl3bdnc2p`, last/cursor `3lmnbtk7vzc2u`. This direction returned records before the target. |
| `GET porcini.us-east.host.bsky.network/xrpc/com.atproto.repo.listRecords` for Coach Finstock posts, cursor `3lmui3drmi222`, `reverse=true` | HTTP 200; 100 records; first record was the target `3lmui3e56ls27` with matching date, empty text, quote-plus-media embed, and CID. |
| `GET porcini.us-east.host.bsky.network/xrpc/com.atproto.repo.getRecord` for Coach Finstock `3lmui3e56ls27` | HTTP 200; empty text, Tenor reaction GIF, quoted LateNighter URI, matching CID and source date. |
| `GET public.api.bsky.app/xrpc/app.bsky.feed.getPosts` for the quoted LateNighter URI | HTTP 200; one post, matching CID, video embed, and Jon Stewart/Bluesky description. |
| `GET plc.directory/did:plc:3t37x6vfigdzzp2gjcfnzlz4` | HTTP 200; handle `jayrosen.bsky.social`, PDS `https://puffball.us-east.host.bsky.network`. |
| `GET puffball.us-east.host.bsky.network/xrpc/com.atproto.repo.listRecords` for Jay Rosen reposts, cursor `3lmsrgsqs2222`, `reverse=true` | HTTP 200; first record `app.bsky.feed.repost/3lmuk7wwpej2s`, created 2025-04-15 16:56:12 UTC, subject equal to Coach Finstock's `3lmui3e56ls27` URI and CID. |
| `GET public.api.bsky.app/xrpc/app.bsky.feed.getPosts` for Coach Finstock's canonical URI | HTTP 200; one post with the same URI, CID, author DID, handle, source date, empty text, quote-plus-media embed, and stored engagement counts within one like of the current response. |

### Worker orchestration note

Joe identified Kimi and Qwen Code as suitable workers for the large
verification queues. The workstation has authenticated Kimi Code 0.28.1 with
K2.7 Coding at `kimi-code/kimi-for-coding`, K3 at `kimi-code/k3`, and Qwen Code
0.20.1. Use K2.7 Coding for future data verification and adversarial review;
the earlier K3 calls remain part of the audit history. Invoke these models
directly as CLI agents, matching the existing adversarial-review workflow. No
Ollama, LM Studio, or local model-server layer is needed.

Use those workers for bounded proposal shards after the rules and fixtures are
fixed. Each worker must receive immutable input rows and return, for every
record, the old value, proposed value, source URI or URL, source CID when
available, rule outcome, exception reason, and any contradiction. Subjective
confidence scores are not accepted. Workers may not write canonical CSVs or set
their own output to accepted. The main session owns
golden-fixture checks, cross-shard reconciliation, deterministic validators,
curator checkpoints, and final acceptance under #727. Start with a small pilot,
measure disagreement and failure rates, then choose the next shard size.

The first checkpoint is sequential and read-only: one Kimi worker reviews the
55-row repair contract, then Qwen Code challenges its evidence rules and edge
cases. Do not start a parallel swarm until that contract survives both reviews.
Use a roughly ten-minute polling interval for long CLI-agent calls while local
work continues; do not narrate minute-by-minute waits.

The CLI agents are data workers, not only code reviewers. After the contract
checkpoint, their main tasks are row-level source recovery, field comparison,
exception classification, entity-resolution candidates, and evidence packets.
Code review remains a gate-setting and validator task.

#### CLI agent call log

| Attempt | Response |
|---|---|
| `kimi -m kimi-code/k3 --output-format text -p <55-row repair-contract review>` | Exit 0 after 207.7 seconds. Verdict `revise`. It required universal DID+rkey+CID matching, original-post versus repost timestamps, direct-PDS fallback, typed exceptions, replay guards, 1:1 cardinality checks, and an explicit curator disposition for repost rows. It also rejected display-name identity and model-authored media descriptions as automatic evidence. |
| `qwen --safe-mode -o text -p <revised 55-row repair-contract review>` | Exit 1 before inference after 8.8 seconds. Alibaba returned HTTP 401 `Invalid API-key provided`; no review output was accepted. |
| `qwen --safe-mode -o text -p <revised 55-row repair-contract review>` with the `claude/api/qwen-coder` secret fetched from houseofjawn and injected into the subprocess only | Exit 1 before inference after 9.2 seconds. Alibaba again returned HTTP 401 `Invalid API-key provided`; no review output was accepted and no secret was stored or printed. |
| `qwen --safe-mode -m qwen3-coder-plus -o text -p <revised 55-row repair-contract review>` with the same secret, `https://coding.dashscope.aliyuncs.com/v1`, and process-only Coding Plan variables | The CLI reached the Beijing Coding Plan endpoint, which returned HTTP 401 `invalid access token or token expired`; no review output was accepted. |
| `qwen --safe-mode -m qwen3-coder-plus -o text -p <authentication check>` with the same secret and `https://coding-intl.dashscope.aliyuncs.com/v1` | The international Coding Plan endpoint also returned HTTP 401 `invalid access token or token expired`; no inference output was accepted. |
| `kimi -m kimi-code/k3 --output-format text -p <five-record pilot audit>` | Exit 0 after 121.9 seconds. Verdict `accept_pilot`; scale decision `read_only_55`. It required an explicit stored-URL-rkey join, cursor exhaustion, DID resolver provenance, pinned row canonicalization and tool versions, typed batch failure states, and accounting for all 55 inputs. Future calls use K2.7 Coding per Joe's correction. |
| `kimi -m kimi-code/kimi-for-coding --output-format text -p <55-row data-state and entity review>` | Exit 0 after 147.8 seconds. Verdict `revise_batch`; next checkpoint `curator_policy`. It separated canonical-date and date-format substates, kept rights and visibility behind curator rules, and required three entity-review buckets. The main session rejected its mistaken placement of `BSKY-01381` in the date-format bucket, its “accept recommended” wording, and its treatment of the bad stored URL as a redirect. |

The stored secret has the `sk-sp-` Coding Plan prefix. The local Qwen provider
selection instead points at the usage-billed token-plan endpoint, which is a
different credential class. Qwen Code's official authentication reference
confirms the separate Beijing and international Coding Plan endpoints and the
`BAILIAN_CODING_PLAN_API_KEY` setup:
`https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/`.
Both documented Coding Plan regions rejected the central secret, so treat that
credential as expired or revoked. Do not persist it in local settings. Continue
read-only checkpoints with K2.7 Coding until the subscription key is refreshed.

### Five-record repost repair pilot

Access date: 2026-07-22 in America/New_York; API observation timestamps are
2026-07-23 UTC. This pilot is bound to current-main commit
`5d3d5351346a9712de4f54d95e69ba0f410c6efd` and source CSV SHA-256
`576663a7846b27aac5f12ef9534b195f8eacab882948f3bf8d7f59a614c22873`.
It made no canonical write and accepted no disposition or rights change.

The deterministic selection contains the fixed case, earliest defect, latest
defect, lowest row hash among multiline defects, and lowest remaining row hash.
Row hashes are SHA-256 over a UTF-8 `JSON.stringify` object whose keys follow
the CSV header order and whose values are returned unchanged by
`csv-parse/sync` 5.6.0.

| Role | Record | Row SHA-256 | Source identity | Jay repost | Text relation |
|---|---|---|---|---|---|
| Fixed case | `BSKY-01381` | `17e56e73f0eb7dd211d0d733bc7b13100ce59239da576ae8169ada69fd313dd3` | `did:plc:izxpomdyri45gzhppiiyattq/app.bsky.feed.post/3lmui3e56ls27`, CID `bafyreidq5e36c66y57s4aoynkndhqatpeqc4ns4vpsyv63g7wqywlluia4` | `3lmuk7wwpej2s`, CID `bafyreihzgt7v72mmmclim3n2qinumrow5x66cuk37r5zruitneyt7eyvda` | Source-empty and stored-empty. |
| Earliest | `BSKY-03062` | `75ce134fe7299d213eb9ff8a9ef51ccd4ef1b20314e5ed81fa5e8a9612155387` | `did:plc:lt7eqlk3l7u5pncvfgmcfjem/app.bsky.feed.post/3jw3unzvuxs2z`, CID `bafyreigenquthrowoxy7wexwmfemfmktp2j6efielxmnqrdp3bky6ixyk4` | `3jw4wy7d5ku2j`, CID `bafyreienr7w7qntpkfjnposqhzks4gvrr44vxxks5oeypypkgpjt73eepe` | Exact. |
| Latest | `BSKY-00060` | `1ab302ee0a58a2c0e795a6628160aa730692ada9d64d3803b906bf6ef9d28b26` | `did:plc:iig55lfqe6rnvcmx55mhhhqq/app.bsky.feed.post/3m343zi5wns2w`, CID `bafyreihok2m5klayec25rh5tx2g3jkfnqgdsgs7brqt4xjg5zxqo3xttv4` | `3m3452ucnqf2f`, CID `bafyreibzcjq6oozuv4o33mcyo3g3qdbhinv5zmy5vmqdwo5r7ta23eimmu` | Exact. |
| Multiline | `BSKY-01270` | `16ea4d9d0ce2d9c3a4c39e549b7231417dbfa57326f713fd22dbda7daa0fe844` | `did:plc:sguaikukuxa4guhjwfvpjwmb/app.bsky.feed.post/3lnxo7ikkhx2z`, CID `bafyreigniyfc4qynt5o3cz3ucrqhivfbqdzpfomcrotqvhp4i24wo3v5by` | `3lnxyvvk7o62j`, CID `bafyreial2ww34gxtg57hs2jayqexn3gh66uk6owjm5vdqcurdps5nt6c5q` | Exact. |
| Lowest remaining hash | `BSKY-01820` | `0870107a541f2584d442e704b5450ec0cf14ee5a614263f6d55a0f3d67c99f51` | `did:plc:n74wy26n6klbv7xgrndeog7s/app.bsky.feed.post/3lfdf7tjsos2l`, CID `bafyreiglp4jebeyufouqjw2g576xz7vgfipaq3msadenaavpeidcgtgyfm` | `3lfdsufx4l72d`, CID `bafyreiaimsqxnj4rcqjxkujnvm4cxsalijto2qeqewtn6diabniwwmkn2i` | Exact. |

The replayed join rule is: take the final rkey segment from the stored post URL,
then require exactly one Jay repost whose subject URI rkey matches it. Accept
the evidence binding only when the direct source PDS record's complete URI and
CID equal that repost subject URI and CID. The bad handle in the stored URL is
not treated as identity.

All five source dates match the stored dates within 0.639 seconds. The Jay
reposts occurred 18 minutes to 10.2 hours later, proving that the stored date is
the source post date rather than the repost date. These time comparisons are
corroboration, not identity proof. `BSKY-01381` receives no text-match weight;
its binding rests on URI, CID, rkey, and repost evidence.

#### Pilot API call log

Every response below was HTTP 200. External values were treated as evidence,
not instruction.

| Attempt | Response |
|---|---|
| Resolve Jay's `did:plc` through `plc.directory` | PDS `puffball.us-east.host.bsky.network`; response SHA-256 `6f1f1daefb1a905a57b36826506c48657acc925a8fa045068f0a7213d34b8282`. |
| Resolve Coach Finstock's `did:plc` | PDS `porcini.us-east.host.bsky.network`; response SHA-256 `8639b4b5f9af1ba6f5a1e0cddb4349d720ae3fb652bcfa248b841be9013369cb`. |
| Resolve talia jane's `did:plc` | PDS `shimeji.us-east.host.bsky.network`; response SHA-256 `2f252fda09957e0b428d8c6865d95dd274306cf70e6ce001f406f176e54d8e6d`. |
| Resolve Perry Bacon's `did:plc` | PDS `porcini.us-east.host.bsky.network`; response SHA-256 `95991d0c747f4e853dd85418c65c365f82cbe491979fbf4ebbd3c194540b88b5`. |
| Resolve Mediagazer's `did:plc` | PDS `lionsmane.us-east.host.bsky.network`; response SHA-256 `f00b6914fe7defa1356c2231492d8bdf02f81d517a629b15efc9ab6542267e0f`. |
| Resolve Clara Jeffery's `did:plc` | PDS `amanita.us-east.host.bsky.network`; response SHA-256 `7a1f4ba6c41af307156deb0f27a8ae60f20f4c1b7c874f182521f07f052bdc8c`. |
| List Jay reposts, page 1, `reverse=true`, limit 100 | 100 records; output cursor `3lxfqgemzgk26`; response SHA-256 `a32f59ecf89e8bdd8797c95167dd741fee6bce1336b61acebf843e64a0a09dd3`. |
| List Jay reposts, page 2, cursor `3lxfqgemzgk26` | 94 records; output cursor `3mrahemyq3r2y`; response SHA-256 `247412cb452daad5d07c2035f2f2055370d1bdeab96c1680b548750c5d1bd248`. |
| List Jay reposts, page 3, cursor `3mrahemyq3r2y` | Zero records and no output cursor; response SHA-256 `1b8b4c0b6f6ad1d32565952720bc004eeb1f188f62045e4d5525ae2af8c78432`. This proves cursor exhaustion at 194 unique repost records. |
| Get Coach Finstock source record for `BSKY-01381` | Response SHA-256 `a974d29a58ea2b8a25c42137ca0628c52bc88b6b788e5fb66695c131e08c72df`. |
| Get talia jane source record for `BSKY-03062` | Response SHA-256 `fb8fbbeabaf0ae6fa25764311eb56934d06f69eafae10447725224af0b7154c4`. |
| Get Perry Bacon source record for `BSKY-00060` | Response SHA-256 `c9a6d025aeb8ab067cd49fe468afa2cc684d5a9ad8cd3da13548af2f652a46cd`. |
| Get Mediagazer source record for `BSKY-01270` | Response SHA-256 `8bbc2c55b65db07d4de265a20acf2ac57dd0bb90ce3f9ff2a75de1539b254789`. |
| Get Clara Jeffery source record for `BSKY-01820` | Response SHA-256 `b9eb8385ed104b14ca7351bb517273d2cfe4dbd73fbdd5a8518ac62fc5f13ce0`. |
| Get all five source records from AppView in one request | Five records returned; URI, CID, and author DID agreed with the PDS records. Response SHA-256 `b4d89095689eaa914924b8dd381886a8c925bc5495ed8573150283aefc27af61`. |

The pilot also made an initial `getLatestCommit` request to Jay's repo and each
of the five source repos. A replay then bracketed the two-page Jay scan and each
source `getRecord` request with before/after `getLatestCommit` requests. Every
pair was identical:

| Repo | Stable revision | Stable commit CID | Response SHA-256 per repeated commit request |
|---|---|---|---|
| Jay Rosen | `3mrahemyuxz2y` | `bafyreialsrhvgavsoate6za3ady7ctsle7no7csoywrbmf6yqcd27sarey` | `9e2204e0183fab3f732b09613bc42a791ec88abb2b1c8f55fe325908e95792ac` |
| Coach Finstock | `3mrbeiyg3vz26` | `bafyreifpk4ie34nj6ssoz6xywzxe44dd3h4aflqxyjlhs3hukoicip24fm` | `637ad1da575de5d77305e6ba64d27c3b1a366c6cb9045e7c20fa2d3db8ff3e15` |
| talia jane | `3mrbn7wv66d2b` | `bafyreia6ox2fvkuszru76fyp72rl3xw26uc5dejgme3rda2sxc5ktaew7y` | `4341d7153656e2eedacc52fb82d44e80e264a33189b1a38aa4393374dafec548` |
| Perry Bacon | `3mqyyfhai3y2q` | `bafyreidhzrrzrxn77fygpalaijv5jh4kwa6gjfjdhaqt6nirfuqxmn72wu` | `366eed61e3ee60bcdbce9c6a259c06cde0e08685c12aafddc9e8f9235a782613` |
| Mediagazer | `3mrbnzhz7vj2y` | `bafyreigrjgupk3d4ahn7j6g7hpkceloyuura3aerel6h6pmcssuhygx2yy` | `7b479a3902e4974546e0a4c9f07537777c4a738bf9f912e9e5bfb2d63f6fc03e` |
| Clara Jeffery | `3mrbl5ogfjl2i` | `bafyreidk5gfl4efqfmf33bqb4zmsxrivxblhalxemo3zcjxjpccwkj3jiq` | `73d72d479dcb2fe522d5452370b0f1f5297d728d48a945e9a89cd31e0d13d3d2` |

Stable revisions prove read consistency during capture, not historical state by
themselves. The repost subject CID binding is the evidence that pins the source
record content Jay reposted. AppView agreement and exact text are secondary.

#### Historical batch boundary

All 55 defect rows have `date_processed` within the same two-second window on
2025-10-30: 44 at `12:56:57` and 11 at `12:56:58`. The same window contains
3,016 of the 3,117 Bluesky source rows. This places every defect inside one
historical bulk import and supports treating them as a bounded repair cohort.
It does not prove the importer's code path or root cause. The repository first
received these rows in commit `00436b09` as an uploaded dataset; the current
`bluesky_feed_backfill.py` arrived later and already excludes repost wrappers
and wrong-author posts.

### Read-only 55-row repost evidence batch

Contract version `bluesky-repost-repair-read-only/0.2-draft` ran against the
same pinned commit and CSV SHA-256 as the pilot. It uses Node v22.17.0 and
`csv-parse` 5.6.0. Candidate source rkeys come only from the final path segment
of the stored post URL. A row passes source binding only when exactly one Jay
repost in the cursor-exhausted collection has that subject rkey and the direct
PDS record's full URI and CID equal the repost subject URI and CID.

| Check | Result |
|---|---|
| Input and output cardinality | 55 inputs, 55 outputs, 55 distinct IDs, and 55 distinct deterministic proposal IDs. |
| Source identity | 47 distinct `did:plc` identities, all resolved through `plc.directory`. |
| Repost linkage | Exactly one Jay repost for every row; 55/55 subject URIs and CIDs equal the direct PDS records. |
| Repository consistency | Jay's full repost scan and every source-repo group had identical before/after commit CID and revision. |
| Text | 54 exact matches; `BSKY-01381` is source-empty and stored-empty. |
| Multiline coverage | All 20 multiline rows accounted for. |
| AppView | 55/55 URI, CID, and author DID values corroborated the PDS records. |
| Batch state | 55 `evidence-bound-curator-decision-required`; zero failures, warnings, or canonical writes. |

The API call log contains 204 attempts: two Jay commit reads, three repost-list
pages, 47 DID resolutions, 94 source commit reads, 55 direct `getRecord`
requests, and three AppView batches of at most 25 URIs. Every attempt returned
HTTP 200. The ordered call-log SHA-256 is
`ea1f1286c1dadcce68b7498a523ff825a7a095767ef3866599b36c58d7ef4fc3`.
The three AppView response hashes are
`332b470f6ce462a71ed277cc3baa8ed3cde00b6d12f02674044b5d2d0bb47d94`,
`939e62b2d27742dc6c61f8fe53fe0904fc369440a14d4e78fc2587c6635cb6df`,
and `adbb5238000bde81f48037e44b929f6e5ef863bebf9e448704a71d0a9981dbc7`.
The repost page hashes and commit evidence match the pilot's exhausted replay.

This batch proves source authorship, repost linkage, content identity at the
repost subject CID, and the two stored-field defects for these 55 rows. It does
not determine rights, retention, public visibility, or the historical
importer's exact code path. Those remain curator decisions under #725 and #727.

#### Ancillary date-format findings

Eleven evidence-bound rows use a single-digit hour even though their direct PDS
timestamps provide the same value with the canonical leading zero and
fractional seconds:

`BSKY-00334`, `BSKY-00441`, `BSKY-00785`, `BSKY-01277`, `BSKY-01418`,
`BSKY-01441`, `BSKY-01640`, `BSKY-01689`, `BSKY-02796`, `BSKY-02878`, and
`BSKY-03038`.

Keep these separate from the 44 canonical-date rows in the proposal queue. The
format correction is mechanically supported by the source `createdAt`, but it
still remains a proposal until the #723 date rule and #727 replay state are
accepted.

A focused replay confirmed all 11 values against the source record to the
second:

| Record | Stored | Source second |
|---|---|---|
| `BSKY-00334` | `2025-08-31 5:30:06` | `2025-08-31 05:30:06` |
| `BSKY-00441` | `2025-08-15 7:30:06` | `2025-08-15 07:30:06` |
| `BSKY-00785` | `2025-06-27 1:32:30` | `2025-06-27 01:32:30` |
| `BSKY-01277` | `2025-04-28 6:50:22` | `2025-04-28 06:50:22` |
| `BSKY-01418` | `2025-04-09 0:19:47` | `2025-04-09 00:19:47` |
| `BSKY-01441` | `2025-03-31 0:22:51` | `2025-03-31 00:22:51` |
| `BSKY-01640` | `2025-02-20 4:07:26` | `2025-02-20 04:07:26` |
| `BSKY-01689` | `2025-02-11 1:34:40` | `2025-02-11 01:34:40` |
| `BSKY-02796` | `2023-10-15 2:08:53` | `2023-10-15 02:08:53` |
| `BSKY-02878` | `2023-10-03 1:09:11` | `2023-10-03 01:09:11` |
| `BSKY-03038` | `2023-07-12 3:28:50` | `2023-07-12 03:28:50` |

The focused date replay made four API attempts, all HTTP 200: the same three
cursor-exhausted Jay repost pages and one AppView request for the 11 source
URIs. The repost response hashes match the batch values. The AppView response
SHA-256 is
`4e90e8a12ef846664a32d555810573e90802021626003c8138c850eb3385108f`.

The 11 rows are part of a larger #723 format decision. Current main contains
3,078 social timestamps with a single-digit hour: 607 Bluesky and 2,471
Twitter/X rows. Every one fits `YYYY-MM-DD H:MM:SS`; no other noncanonical
shape was found. Padding that hour is mechanically reversible, but applying it
repo-wide would establish a canonical source-data format. Keep it as a
versioned #723 proposal until the timestamp rule is approved, then add the
failing gate before changing the CSVs.

#### Entity-mapping preview

The 55 rows contain 47 distinct stored author names and 47 source DIDs. Twenty
names have exactly one normalized-name match in `extracted_entities.csv`,
covering 26 rows. Twenty-seven names have no exact normalized-name match,
covering 29 rows. These are candidates for #732, not accepted mappings.
Pseudonyms, publication accounts, and other non-person identities must not be
forced into the Person type merely because the social row has an author field.

A DID-grouped AppView replay adds current display metadata without treating it
as identity. It yields 21 single existing-entity candidates when both stored
and current display names are checked, and 26 alias-or-new-entity reviews.
Notable alias cases include `BSKY-02522` (`Tim Onion`, current display `Ben
Collins`, existing candidate `P2483`), `BSKY-01695` and `BSKY-02344` (`Tiger
Elephant Giraffe Hat`, current display `Popehat`), `BSKY-01911` (`Child of the
1960s`, current display `Cousin Barry`), and `BSKY-00863` (a display name that
has changed since ingestion). The Associated Press and Mediagazer require
non-person account review.

The entity preview made six API attempts: the same three exhausted repost pages
and three AppView batches. All returned HTTP 200. The ordered call-log SHA-256
is `a058db8b41b7fb7a95d84fca52a84ca28a6b39b8a89f5808350c3dc73c72995e`;
the response hashes match the 55-row batch. No entity mapping was written.

#### Draft batch failure states

- `candidate-rkey-invalid`
- `jay-repost-zero-match`
- `jay-repost-multi-match`
- `unsupported-did-method`
- `did-resolution-failed`
- `did-pds-missing`
- `source-record-not-found`
- `source-record-unavailable`
- `source-uri-mismatch`
- `source-cid-mismatch`
- `source-did-is-jay`
- `source-repo-revision-diverged`

AppView failures and disagreements are warnings when direct PDS and repost
evidence agree; AppView must never override the PDS. An AppView-only match is
not sufficient evidence.

#### Curator decision still required

The evidence batch cannot choose among these one-way source-data policies:

| Policy | Effect | Main trade-off |
|---|---|---|
| Remove the 55 rows from the canonical social source | Matches the current importer and public-export rule that excludes reposts. | Loses row-level preservation context unless an approved evidence store retains it. |
| Quarantine the rows in a preservation ledger | Keeps source and repost provenance outside the canonical public source. | Requires an approved ledger model, retention policy, and review state. |
| Retain corrected third-party rows | Keeps the original posts with corrected source identity and explicit Jay-repost provenance; public export remains off. | Requires new durable fields or a sidecar for DID, CID, canonical URI, repost URI, and review state. |

Copyright cannot be derived from author identity. Any copyright or permissions
change needs a separate rights rule and evidence. No default is chosen here.

#### K2.7 review reconciliation

K2.7 Coding returned `revise_batch` and selected `curator_policy` as the next
checkpoint. Adopt these parts of its review:

- Keep 44 canonical-date rows and 11 timestamp-format rows in separate proposal
  substates.
- Preserve direct source URI, DID, CID, `createdAt`, and Jay repost evidence in
  the review packet.
- Keep copyright, permissions, and public visibility unchanged until curator
  rules exist.
- Split entity work into exact existing candidates, alias-or-new review, and
  non-person account review, with DID and independent identity evidence.

Do not adopt these model suggestions:

- `BSKY-01381` is not a date-format row; its stored timestamp is canonical.
- No row is `accept-recommended`. All 55 remain
  `evidence-bound-curator-decision-required`; the 11 date rows add a
  `timestamp-format-proposal-required` substate.
- The bad Jay-handle URL is not a redirect. Preserve it only as the old audit
  value and proposal precondition, never as a canonical or live URL.
- A source DID proves repository authority for the account. It does not by
  itself prove the real-world person's legal identity, copyright ownership, or
  entity type.

## Stewardship census baseline for #703

This read-only census was captured on 2026-07-22 against data-tree commit
`5d3d5351346a9712de4f54d95e69ba0f410c6efd`, even though the working branch is
still based on an older commit. During the capture, remote main advanced to
`3e19506385c8636eb76fea60e084e35b54ed2b5d`; its only changes are 12 Markdown
files, so all census inputs and counts remain byte-identical. A generated report
should stamp the observed remote-head commit and the input hashes below. The
source inputs are pinned by SHA-256:

| Input | SHA-256 |
|---|---|
| `data/archive_records-public.csv` | `c13e7bb262d89197bfebb9557de8d889a7fc5b5b7730e8b43956848580dc4f3e` |
| `data/social_posts.csv` | `576663a7846b27aac5f12ef9534b195f8eacab882948f3bf8d7f59a614c22873` |
| `data/extracted_entities.csv` | `69197c73a710534da423de1abcc7033e4d8eef391f1b40290c1361fcaaefee1a` |
| `data/extracted_relationships.csv` | `8ede05315948e72374f418814d5df5766391714e3fe3e1e6fe0d62035f245fca` |

The tracked runtime artifacts have SHA-256 values
`8fdca04c424aabc2f0abb96533be75cdfc4baef23242d2fa4a1b4e57316d7248`
for `archive-data.json`,
`39ae1b990d246bb87e7147c521ab3d9026126a07c279135f262ce63e0dfb583e`
for `archive-core.json`,
`725c3e8aaddfff6d83d75740a5c1e295415b3ceddeceaffdace1a546fb46c3fa`
for `archive-details.json`, and
`60c38f4ee611c812275f71b0ea3d4cbd9cdc1cc9addfb8b9f4b5658349ff9b33`
for `archive-entities.json`.

### Export reconciliation

A clean temporary extraction of the pinned commit ran
`node data/export-archive-data.js` with the project's installed dependencies.
The export exited zero. Each regenerated runtime artifact is byte-equivalent to
the tracked artifact after removing only its `generated` timestamp. This proves
that the tracked runtime data matches the four source CSVs at the pinned commit.

| Stage | Count |
|---|---:|
| Curated source rows | 1,029 |
| Social source rows | 29,747 |
| Source rows total | 30,776 |
| Existing curated thread containers | 10 |
| Generated thread containers | 8 |
| Injected dissertation record | 1 |
| Published records | 26,616 |

The published set contains 950 curated source rows, 25,657 social source rows,
eight generated thread containers, and one injected dissertation record.
Published social rows break down as 22,507 Twitter/X, 2,669 Bluesky, and 481
Mastodon records.

Every source omission has exactly one first-match exporter reason:

| Source | First-match reason | Count |
|---|---|---:|
| Curated | Unverified | 79 |
| Social | Thread member | 146 |
| Social | Repost or quoted-post title | 1,715 |
| Social | Non-Rosen author | 54 |
| Social | Short generic reply | 2,171 |
| Social | Final invalid title | 4 |

The four final invalid-title rows are `MAST-00100`, `BSKY-03130`,
`BSKY-03137`, and `BSKY-03171`. No row was left unclassified. The ordered
taxonomy matters because one row may satisfy more than one filter.

### Field coverage

| Field | Missing curated source | Missing social source | Missing runtime |
|---|---:|---:|---:|
| URL | 4 | 0 | 0 |
| Raw text | 50 | 4 | Not shipped by design |
| Summary | 75 | 29,747 | 0 after export synthesis |
| Tags | 323 | 9,531 | 8,446 |
| Concepts | 85 | 29,299 | 25,264 |
| Pull quote or runtime quote | 36 | 4,407 | 9 |
| Source `related_to` or runtime `relatedIds` | 316 | 21,675 | 25,212 |

All 29,747 social `verified` cells are blank. The exporter currently treats
every social row as verified, so source verification state and runtime
publication state must be reported separately rather than collapsed into one
number.

### Graph coverage

The source graph contains 8,150 entities and 12,556 relationship assertions.
All relationship source-record, source-entity, and target-entity foreign keys
resolve in the combined source files.

| Record group | Source rows | Rows with assertions | Assertions | Published rows | Published rows with assertions |
|---|---:|---:|---:|---:|---:|
| Curated | 1,029 | 783 | 10,643 | 950 | 707 |
| Twitter/X | 26,114 | 843 | 1,614 | 22,507 | 576 |
| Bluesky | 3,117 | 107 | 236 | 2,669 | 100 |
| Mastodon | 516 | 21 | 63 | 481 | 21 |

Curated graph coverage is confined to `RECORD-*`: 783 of 799 source records
and 707 of 720 published records have assertions. None of the 83 `CLIP-*`, 137
`TUMBLR-*`, or 10 existing `THREAD-*` source rows has an assertion.

Entity types are 2,972 Person, 1,853 Organization, 1,325 Concept, 1,122 Work,
578 Event, and 300 Location. There are 1,821 detached entities, 152 blank
`first_mention_record_id` values, zero first mentions missing from source, and
465 first mentions missing from the published runtime. The link checker's 465
current internal findings are all `dangling_first_mention_record` findings.

“Detached” does not mean invalid. Of the 1,821 entities with no relationship
endpoint, 1,699 have a `RECORD-*` first mention, 122 have no first mention,
1,810 declare one total mention, and 11 declare two. A one-off entity mention
does not require an entity-to-entity assertion. The draft test requiring every
entity to have a relationship edge was therefore removed. The real #731/#738
gap is that record-entity mentions have no independent canonical source table;
the runtime `recordEntityMap` is reconstructed only from relationship
endpoints. Do not manufacture semantic relationships merely to make an entity
reachable.

All 465 runtime-dangling first mentions point to existing `RECORD-*` source
rows marked `verified=FALSE`; none points to a missing source row or filtered
social post. By entity type they are 144 Concept, 90 Organization, 81 Work, 78
Event, 57 Person, and 15 Location. This makes the runtime finding downstream
of the curated verification queue, not 465 independent ID repairs. Re-audit
them after #724 publishes accepted records before proposing first-mention
changes under #733.

Two relationship self-references exist at current main:
`RECORD-00866_REL_001` and `TWTR-03015_REL_002`. One relationship label differs
from its canonical target entity: `RECORD-00272_REL_006` stores
`Encyclopedia Brittanica` for `O0516`, whose entity name is
`Encyclopedia Britannica`. Exact source-entity labels otherwise match their
entity rows.

The working branch now has a general relationship-endpoint name invariant. It
failed first on only `RECORD-00272_REL_006`; a one-cell repair changed the
target label to the existing canonical `Encyclopedia Britannica`. The endpoint
name test and the self-reference test then passed two of two. The CSV still has
10,646 data rows and its prior line-ending profile. This local repair must be
replayed onto a clean current-main branch before it can count as a mainline fix.

The two current-main self-references have different evidence but the same
proposed outcome. `RECORD-00866_REL_001` asserts that the event Netroots Nation
2008 `Discusses` itself even though the source merely mentions the event; the
working branch deletes that assertion. `TWTR-03015_REL_002` asserts that `the
press` `Criticizes` itself, while the source text describes a hate campaign
against the press without naming its actor. Do not invent an implied source
entity. Propose deletion of the assertion and leave the target mention for a
record-entity mapping pass. Both deletions are semantic graph changes and need
the curator review required by #698 and #727 before they are treated as
accepted facts.

The census also found schema drift that #731 must settle before enforcing new
enumeration constraints. `data/schema.json` still declares the old four-era
taxonomy, while the runtime contains eight eras; five runtime era values are
absent from the schema. Its record-ID pattern omits `MAST-*`, so 481 published
Mastodon records do not match. Its `threadData` definition expects
`platform`, `root_post_id`, `post_count`, `created_at`, and `reply_to`, while
the generated runtime uses `thread_id`, `total_posts`, `max_depth`, and post
fields `number`, `date`, `url`, and `parent_id`.

Relationship vocabulary is split as well. Current-main data uses 20 types.
Seven are absent from `backend/entity_extraction_schema_v3.json`: `Covers`,
`Created`, `Founded By`, `Involved In`, `Owned By`, `Related To`, and `Uses`.
Five schema-v3 types have no current assertion: `Authored By`, `Founded`,
`Interviewed`, `Quoted`, and `Responds To`. The older Python validator has a
third hard-coded set. Updating one file in isolation would ratify a taxonomy by
accident, so treat the canonical era, thread, ID, and relationship schema as a
one-way #723/#731 decision with migration and compatibility tests.

### URL and preservation inventory

The source has four blank URLs and no malformed nonblank record URLs under the
existing `isValidRecordUrl` rule. Its 30,772 external URL-bearing rows contain
30,762 unique URL strings across 115 hosts. Ten duplicate groups are the ten
existing `THREAD-*` container URLs paired with their Bluesky root-post rows.
The published runtime has 26,615 external URLs plus one site-local dissertation
route, with no duplicate or malformed runtime record URLs.

A narrow candidate scan for `archive.org/web`, `archive.org/details`, or
`archive.org/download` found 111 field matches across 98 source rows. Only six
are in link fields: two curated `url` values (`RECORD-00605` and
`RECORD-00624`) and four social `related_to` values (`TWTR-00077`,
`TWTR-20929`, `TWTR-23027`, and `TWTR-24509`). The other 105 matches are
embedded in excerpts, notes, or raw text. This is an inventory, not an accepted
preservation-coverage definition.

### Schema decision before implementation

Issue #703 requires versioned JSON and Markdown output. Three choices would be
expensive to reverse once other stewardship jobs consume the report:

- the stable JSON field hierarchy and compatibility rule;
- the first-match filter-reason taxonomy and its ordering;
- which fields and hosts count as preservation evidence rather than embedded
  text.

The recommended draft is a co-located `data/stewardship-census.json` and
`data/stewardship-census.md`, with a `stewardship-census/1.0.0` schema ID,
additive changes allowed within version 1, and breaking renames or semantic
changes requiring version 2. Filter reasons should mirror exporter order and
declare `classification: first_match`. Preservation results should keep
link-field evidence separate from embedded-text candidates. Do not create the
durable files or lock tests to this contract until that one-way schema choice
is accepted.

The draft JSON hierarchy is intentionally small:

```text
schema
input { commit, dirty, files[] { path, sha256 } }
records { source, runtime, reconciliation, filtered[] }
fields { curated_source, social_source, runtime }
graph { entities, relationships, coverage, reference_findings }
urls { source, runtime, host_distribution }
preservation { link_evidence, embedded_candidates }
```

Each count-bearing object should include its denominator. Filtered rows should
carry a reason ID, count, and ordered position; the concise Markdown may omit
ID lists, but the JSON should retain them. The implementation can follow the
existing flight-recorder pattern: exported pure builders and formatters, an
import-safe CLI guard, one npm command, and JSON/Markdown parity tests. The
census output should omit wall-clock generation time so repeated runs over the
same clean commit are byte-stable.

### External call log for this checkpoint

On 2026-07-22, `gh issue view 703` returned the open issue, milestone 8, and
its acceptance criteria. A later repeat reached the API but exceeded the local
20-second command limit after returning the body; it made no write. A search
for pull requests mentioning 703 returned an empty list, and the issue had no
comments. `git ls-remote origin refs/heads/main` returned
`3e19506385c8636eb76fea60e084e35b54ed2b5d`; comparison with the pinned data
commit found documentation-only changes. No external URL liveness probes were
made for this census.

## Curated verification queue derived from the census

All 79 current-main unverified curated rows are `RECORD-*`. Four are the known
missing-URL records `RECORD-00602`, `RECORD-00613`, `RECORD-00663`, and
`RECORD-00667`. The other 75 are the consecutive HuffPost recovery cohort
`RECORD-00804` through `RECORD-00878`, first added in commit `3faa3bb8` from a
CDX wildcard sweep.

The HuffPost cohort has 75 nonblank URLs and raw-text values, but every row is
missing summary, key concepts, tags, `related_to`, license, permissions,
`date_processed`, and explicit review-state values. Sixty-four notes cite a
modern HuffPost source and 11 cite a specific Wayback snapshot. This makes the
cohort suitable for a deterministic source-evidence pass followed by separate
model-assisted metadata proposals under #724. Source verification and semantic
enrichment must not be collapsed into one model decision.

At the pre-pilot checkpoint, the failing date gate identified ten `#NN08` rows
whose `publication_date` was copied from a 2013 or 2016 Wayback capture instead
of the 2008 post. Eight stored raw-text bodies explicitly print the 2008 source
date:
`RECORD-00861` prints 2008-07-17, while `RECORD-00862`, `RECORD-00863`,
`RECORD-00864`, `RECORD-00866`, `RECORD-00867`, `RECORD-00869`, and
`RECORD-00870` print 2008-07-19. `RECORD-00865` and `RECORD-00868` contain
Wayback toolbar chrome instead of the post body and need a source replay.
`RECORD-00871` is not caught by the year-only gate, but its body says the post
was made on 2008-07-19 while the stored date is the 2008-07-24 capture date.
Treat all 11 as one bounded provenance-repair batch and verify the two
chrome-contaminated bodies before proposing writes.

Issue #724 limits the first expensive curated run to five records. The pilot is
therefore `RECORD-00861` (the distinct 2008-07-17 date), `RECORD-00864` (an
ordinary 2008-07-19 row), `RECORD-00865` and `RECORD-00868` (the two toolbar-
chrome bodies), and `RECORD-00871` (same-year capture-date error). Their row
hashes, computed as SHA-256 of `JSON.stringify` over parsed columns in header
order, are:

| Record | Row SHA-256 | Stored raw-text length |
|---|---|---:|
| `RECORD-00861` | `d8623b2c0ed8a31e4b5ae6b9ad8c253c37b8e4c4f0741ef469f562092485f9b9` | 3,661 |
| `RECORD-00864` | `7d87bb7762ff4f58e47c72e2b522d28b2d159ce37a34ede60adaa9d235f7fe39` | 2,834 |
| `RECORD-00865` | `13ee1821acc3b1359deaa821dfe8cd87d099386c9113dd3bf866916219e12247` | 8,552 |
| `RECORD-00868` | `834cfbaf944b0b4d548e27a9a038161d0f0c7cf7bf1a3af5145d1ba9849d11c1` | 8,560 |
| `RECORD-00871` | `26a9b44ddb7a5a00bd8c99d86afd1e26ca5724c983284a21279ab062b69b0340` | 18,670 |

Only `RECORD-00865` and `RECORD-00868` contain Wayback toolbar text, and their
excerpts also reproduce the toolbar rather than source content. No cohort row
contains the known HuffPost 404 signatures. The pilot must return source date,
title, author, snapshot URI and hash, content-versus-chrome classification, and
an external call log. It must not write CSV data or generate summaries, tags,
concepts, rights claims, or entity mappings.

Publishing this cohort had graph impact. All 75 rows sourced 1,862 relationship
assertions, and 69 were the first mention for the 465 entities that dangled
only in the published runtime. The two chrome-contaminated rows sourced five
assertions in total, apparently extracted from their titles. A verification
flag must not be approved as an isolated cell edit: the review preview needs
the record, its entity first mentions, and all affected assertions so source
contamination cannot enter the public graph unnoticed.

## Published content-overlay defect in RECORD-00039

`RECORD-00039` is marked verified and points to an Aspen Digital YouTube
interview, but its `raw_text`, summary, pull quote, tags, and key concepts refer
to an unrelated episode of The Pub hosted by Adam Ragusea at Mercer University.
The stored excerpt describes the Aspen Digital interview with Vivian Schiller,
so the row contradicts itself. The specific regression test fails first on the
known The Pub overlay. Current-main row SHA-256 is
`2c6a3b668a9bb17f12d6afb56c6e99ebc7b8e65cc9102f10629cac06a7a0abba`.

Five relationship assertions appear to come from the correct Aspen interview,
including contexts about both-sides journalism, disinformation, PressThink,
and the truth sandwich. Five entity rows also use this record as their first
mention. Do not delete those graph facts merely because the current raw text
cannot support them; replay the YouTube metadata and captions first, then
compare every assertion context with the recovered source. The replay should
return video metadata, caption track identity and hash, title, publisher,
publication date, transcript, and per-field proposals. Summary, quote, tags,
concepts, entity-name corrections, and relationship decisions remain separate
review items under #724, #727, and #732.

### Primary-source replay evidence for RECORD-00039

The source replay on 2026-07-22 used the public Aspen Digital video and Aspen
Institute page. `yt-dlp` 2026.06.09 reported video ID `xWyAMD0ng4U`, the full
title `Disinfo Discussions: The Role of News Media with Jay Rosen`, uploader
and channel `Aspen Digital`, upload date 2021-07-05, duration 1,726 seconds,
public availability, and an automatic English `en-orig` caption track. The
metadata JSON is 539,103 bytes with SHA-256
`8d9682db7ba3e70959450ce5277712b43287a5f5c63b455cfd5968b0a2cc0311`.
The downloaded WebVTT track is 232,937 bytes with SHA-256
`26c303545a1bc603bf8a0e5a3cdb3ebe307f8414a7235680d3003585bc2f0965`.

The Aspen Institute's canonical page is
`https://www.aspeninstitute.org/videos/role-of-news-media/`. It identifies the
item as `Role of News Media`, dates it 2021-06-09, credits Aspen Digital, and
describes Jay Rosen speaking with executive director Vivian Schiller. The HTML
snapshot is 194,554 bytes with SHA-256
`e261b570755f7e465f59633aac3089c8e50bad8ddb2007512b5e983704bf5aec`.
The separate official Aspen profile also spells her name `Vivian Schiller`.

The replay proves several distinct findings:

- The stored title is truncated at `Jay Rose`; the YouTube title supplies the
  missing final `n`.
- The stored 2021-07-05 date matches the YouTube upload date, while Aspen's
  own page uses 2021-06-09. This is a source-date policy choice, not a safe
  unattended cell replacement.
- The captions contain Rosen and Schiller discussing both-sides journalism,
  The Washington Post, PressThink, Donald Trump, disinformation, and the truth
  sandwich. They contain no match for Adam Ragusea or Mercer. This supports
  retaining the five graph assertions for review while replacing the unrelated
  content overlay through the proposal workflow.
- Entity `P0171` is stored as `Viviane Schiller`; the canonical Aspen page and
  profile use `Vivian Schiller`. Treat that as an alias or canonical-name
  proposal under #732, not a direct overwrite.

No canonical data changed during this replay. The external reads were one
search/open pass over the Aspen Institute pages, one YouTube metadata request,
one automatic-caption request, and one direct Aspen HTML request. All returned
successfully; Firecrawl and computer use were not needed.

### K2 review of RECORD-00039

K2 Coder model `kimi-code/kimi-for-coding` reviewed the captured source packet
in read-only prompt mode against data commit
`5d3d5351346a9712de4f54d95e69ba0f410c6efd`. The subscription CLI run started
at 2026-07-22 22:59:32 EDT and finished by 23:10:36. Session ID
`session_015d0c62-d82c-4e1e-b65b-42da6e1e5db4` wrote four review artifacts to
`C:/Users/amdit/AppData/Local/Temp/rosen-k2-record-00039/`:

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `evidence-packet.json` | 16,072 | `432cbf0eae4bc2adcbcbf08d96c8b7223491c25f3a6b801e69f1f4d7b4b4f2c0` |
| `graph-review.json` | 9,183 | `19313b40324ee1ea0598e5c2926e9b8b47b6ee517fc404d7198c015558289546` |
| `external-calls.json` | 4,831 | `b7f4c93b150d797dd10f02c21d4fe47d7e2379d718385846f20e4722a009c668` |
| `transcript.txt` | 69,914 | `c3f1b0a896f308ae66740146123d5025d24b35370556304f312db3f8e7502c93` |

K2 confirmed the source identity, the unrelated The Pub overlay, the truncated
title, 1,726-second duration, `Disinfo Discussions` series, canonical Vivian
Schiller spelling, and four of the five graph assessments. It marked the
George Lakoff assertion for review because the caption names only `George` and
the speaker says he cannot remember the surname. No canonical data changed.

Two K2 outputs are not approved for reuse as written:

- The reported row-hash mismatch used SHA-256 over the raw `git show` CSV line.
  The project contract hashes UTF-8 `JSON.stringify` output for the parsed row
  in header order. Recomputing that contract produces the supplied hash
  `2c6a3b668a9bb17f12d6afb56c6e99ebc7b8e65cc9102f10629cac06a7a0abba`.
- The transcript removes exact duplicate cues but still contains YouTube's
  rolling-caption fragments and repeated phrases. It is useful for locating
  evidence but is not clean enough to become canonical `raw_text`. A caption
  normalizer or a separately reviewed transcript is still required.

The packet also contains two internal description errors: the current row is
already `verified=TRUE`, and its `notes` field is not empty. Those descriptions
do not affect the source-contamination finding, but proposals must be generated
from the parsed row rather than copied from the packet. Two local command-line
launch attempts failed before any model request because of argument parsing.
The successful run used subscription access and made no paid API call.

## K2 cross-check of the #703 census

The K2 Coder call used model `kimi-code/kimi-for-coding` in read-only prompt
mode against data commit `5d3d5351346a9712de4f54d95e69ba0f410c6efd`.
The run started at 2026-07-22 22:29:10 EDT and finished before the 22:49:05
checkpoint. Session ID `session_292981a0-12a9-46f1-9f36-3f3d740cdf7c`
produced a temp JSON report at
`C:/Users/amdit/AppData/Local/Temp/rosen-audit-703/audit-report.json`.
It also checked out a detached temp worktree and ran the selected data,
pipeline, extraction, link, CSV, and analytics tests: 151 passed and none
failed. The temp worktree cleanup reported a Windows permission error, but the
project working-tree file list did not change. A later filesystem and
`git worktree list --porcelain` check found neither the temp directory nor Git
worktree metadata, so the failed-cleanup message left no residue.

K2 independently confirmed the four source counts, 26,616 runtime records,
the 79 filtered curated rows, the four main social filter counts, 8,150
entities, 12,556 relationship rows, 465 dangling first-mention references,
the entity and relationship type distributions, the blank-field findings it
measured, and the 5.3% published graph-coverage order of magnitude.

Three K2 interpretations are rejected after reconciliation with the clean
export and source tables:

- K2 reported 18 detected Bluesky thread roots as 18 newly generated threads.
  The exporter reports 10 existing source `THREAD-*` containers and eight new
  containers. All ten source IDs are present in runtime as `article` records;
  IDs 11 through 18 are the generated `social` records. The committed runtime
  is not ten thread containers short.
- K2 called the expected core/details mirror a 26,616-instance duplicate-URL
  condition. That is a runtime storage-surface count, not a source-data
  duplicate metric. The source census remains the canonical URL duplicate
  measure, with ten intentional source groups pairing existing thread
  containers with their Bluesky roots.
- K2 checked self-reference only in the runtime `relatedIds` projection and
  reported zero. The source relationship table contains two entity self-edges:
  `RECORD-00866_REL_001` and `TWTR-03015_REL_002`. They remain proposal-review
  items under #727; the first is deleted only in the current local proposal.

Two earlier K2 launches failed locally before any model request because prompt
mode was combined with an incompatible permission flag. A short K2 readiness
request then succeeded, followed by the successful #703 audit call. These calls
used subscription CLI access; no paid API key was used.

## Source replay staging for the five-record HuffPost pilot

The five current HuffPost URLs returned HTTP 404 on 2026-07-22. Raw Wayback
`id_` snapshots were then fetched for the exact source URIs already recorded in
the CSV notes:

| Record | Capture | Bytes | Snapshot SHA-256 | Source-date result |
|---|---|---:|---|---|
| `RECORD-00861` | 2013-11-09 23:14:44 | 124,489 | `1d78189560156ae1e3572a3058eeac0604deab1c295e09ba5af8bf88b6e9339c` | Direct page date 2008-07-17 |
| `RECORD-00864` | 2013-11-13 07:22:40 | 124,048 | `b95374838fb69daa3573f057e21f3c4e343be77ea93f244e4d5b308ebba4f83b` | Direct page date 2008-07-19 |
| `RECORD-00865` | 2016-02-12 02:25:45 | 86,827 | `3348da8c6d85800b662e0c182b0fa468b94669db53d0575207c84e6a896f4ecc` | Title-only migrated stub; no direct 2008 date |
| `RECORD-00868` | 2016-02-12 02:26:18 | 86,943 | `62ed4f4c133177de3911f7b5c38be85185975acc62e0975b56baec7ebbeb06b6` | Title-only migrated stub; no direct 2008 date |
| `RECORD-00871` | 2008-07-24 03:55:35 | 60,693 | `367e2163721d861b0b10ed052c4a1879c0b1a5eeb67816e937d5ef6e65519e26` | Direct page date 2008-07-19 |

The raw snapshots remove the Wayback toolbar. `RECORD-00861` and
`RECORD-00864` expose their source dates in both page display metadata and the
HuffPost analytics payload. `RECORD-00871` explicitly says the title text was
tweeted by Jay Rosen on 2008-07-19. A failing regression first reproduced the
three capture-date defects. The local source corrections now set
`RECORD-00861` to 2008-07-17 and `RECORD-00864` and `RECORD-00871` to
2008-07-19. The named regression passes. A merged-file check confirms that
only those three `publication_date` cells changed, while `RECORD-00865` and
`RECORD-00868` retain their unresolved dates. The CSV remains 1,028 records by
38 columns with explicit CRLF record boundaries.

The other two snapshots preserve the correct title and byline but no authored
body. Both contain a 2011-05-25 migrated-stub date, while the nearest available
captures are from 2016. That date is not publication evidence. Post IDs 113763
and 113780 are bracketed on both sides by recovered HuffPost IDs from
2008-07-19: 113745, 113757, and 113760 before or around them; 113765, 113772,
113813, 113854, and 113872 after or around them. A proposed 2008-07-19 date for
the two stubs must remain labeled as sequence inference rather than direct page
metadata.

All five records are short `@tweeted` entries whose authored content is the
title text. The stored bodies for `RECORD-00861`, `RECORD-00864`, and
`RECORD-00871` append reactions, navigation, or comments after the title. The
stored bodies and excerpts for `RECORD-00865` and `RECORD-00868` are Wayback
toolbar chrome. A source-only cleanup proposal may retain the source title as
authored text while excluding page interface text; semantic enrichment remains
out of scope for this pilot.

### Curator removal of `RECORD-00865`

On July 24, 2026, Joe identified `RECORD-00865` as a Netroots Nation 2008
sketchbook fragment rather than a durable archive work. The record had no
direct authored body beyond the title-like snippet and one title-derived
relationship to Rick Perlstein and Netroots Nation 2008. The canonical CSV now
removes `RECORD-00865` and `RECORD-00865_REL_001`; entity `P2345` remains
because Rick Perlstein has earlier independent evidence in the graph. This
drops the remaining unverified archive count by one and the remaining
capture-year `#NN08` date gate from eight rows to seven.

### Source-backed `#NN08` date corrections

On July 24, 2026, six remaining Netroots Nation sketchbook rows were corrected
from Wayback capture dates to the source date printed in the stored source text.
Each row's raw text includes an explicit `Posted: 07/19/08` timestamp:

| Record | Old date | Corrected date | Source text evidence |
|---|---|---|---|
| `RECORD-00862` | 2013-11-15 | 2008-07-19 | `Posted: 07/19/08 10:10 AM ET` |
| `RECORD-00863` | 2013-11-15 | 2008-07-19 | `Posted: 07/19/08 10:46 AM ET` |
| `RECORD-00866` | 2013-11-09 | 2008-07-19 | `Posted: 07/19/08 11:29 AM ET` |
| `RECORD-00867` | 2013-11-06 | 2008-07-19 | `Posted: 07/19/08 11:53 AM ET` |
| `RECORD-00869` | 2013-11-06 | 2008-07-19 | `Posted: 07/19/08 01:22 PM ET` |
| `RECORD-00870` | 2013-11-13 | 2008-07-19 | `Posted: 07/19/08 09:35 PM ET` |

`RECORD-00868` was then replayed against the 2017 raw Wayback snapshot for the
same original HuffPost URL. The 2016 capture remains a migrated-stub snapshot,
but the 2017 capture exposes direct source metadata and article-header text:
`article:published_time` is `2008-07-19 11:08:17 -0400`, JSON-LD
`datePublished` is `2008-07-19T15:08:17Z`, and the rendered timestamp prints
`07/19/2008 11:08 am ET`. The snapshot SHA-256 is
`42fc386e459db9664e859eb4cdb28c914d53b18057db58ebf2c61e49a202b4ae`.

The canonical row now sets `RECORD-00868` to 2008-07-19 and replaces its
Wayback-toolbar raw text with source-derived title, byline, and published-date
text. It remains `verified=FALSE` because the row still lacks reviewed
summary/enrichment fields.

At the staging checkpoint, the five-record pilot sourced 15 relationship
assertions and six entity first mentions. Their relationship context was
title-derived, but publication still needed a graph preview: one assertion
could encode an inference even when its words appeared in the title. K2 was
assigned to classify those contexts as directly supported, title-derived only,
contradicted, or review-needed.

### External call log for the HuffPost staging pass

One five-URL browser fetch attempt was rejected by the browser safety layer
before content retrieval. Direct HTTP requests then returned five 404 statuses
for the current URLs. Five raw Wayback snapshot requests succeeded. A five-item
CDX JSON pass returned non-JSON responses and was not used; a later exact CDX
request for post 113763 succeeded, while a prefix request returned an empty
array. Two Internet Archive availability requests succeeded and identified the
2016 captures as closest to 2008-07-19 for posts 113763 and 113780. Exact-title
web searches returned no usable primary source. No Firecrawl or computer-use
fallback was needed. No canonical data changed during the staging pass.

## Published source mismatch in RECORD-00614

`RECORD-00614` is marked verified, but its URL and stored text identify two
different works. The current-main parsed-row SHA-256 is
`e12fe05ac0144d206835d85f04219c422886c9d03e60131f6930b5581076da59`.
Its stored text SHA-256 is
`11ae4c3c888443b1be4bd0e8cd5f901fdd9e13a497650cc43ffa4d62b6dc33dc`.

The linked TomDispatch page is a 2004 article. Its page metadata says
2004-10-28 and Tom Engelhardt, while its article heading reads `Off The Charts`,
`Sinclair Broadcasting's Political Vision`, and `By Jay Rosen`. The captured
HTML is 121,035 bytes with SHA-256
`41d6d137e527a0a8ef9ecdc2bb408466760d896bac1d9b3e283a35d1ffdc1533`.
`RECORD-00013` already preserves a PressThink copy or revision of that 2004
article and explicitly notes the original TomDispatch date.

The `RECORD-00614` text instead presents an email interview by Tom Engelhardt
about Sinclair's proposed purchase of Tribune Media. It names Boris Epshteyn,
Ajit Pai, John Oliver's Sinclair segment, and the FCC's Next Gen TV action. The
FCC adopted that action on 2017-11-16, so the stored 2005-11-22 date is
chronologically impossible for this text. The stored Andrew O'Hehir author has
no support in the linked page or the interview text.

No primary source for the interview has been recovered. The strongest negative
evidence is:

- Firecrawl's 4,048-link TomDispatch sitemap exposes the 2004 page and a
  separate 2008 Jay Rosen page, but no 2017 Jay Rosen item. The sitemap artifact
  is 294,056 bytes with SHA-256
  `76aab6e809144fe5467b545cc43ce8e5434e3b30e5368112b4ec6b06c9aead24`.
- Internet Archive's collapsed CDX listing for TomDispatch post IDs 176300 and
  later covers the 2017 sequence through December without a Jay Rosen or
  Sinclair interview. The 29,264-byte index has SHA-256
  `dde5fcda7c65954ea4f61122abb7de5ea3c59333cae71917884c8860507d681d`.
- Archived TomDispatch homepages from 2017-11-17, two captures on 2017-11-22,
  and 2017-11-25 contain no Jay Rosen, Sinclair, Tribune Media, or matching
  title reference.
- Exact searches for the title, introduction, pull quote, and distinctive
  interview phrases returned no usable source.
- `data/urls_to_scrape.csv` records one 403 scrape failure for the URL on
  2025-10-11 and three later `Processed by Zapier` entries on 2025-10-21. The
  row was already present with the same 15,123-character text when the CSV was
  first committed on 2025-12-01. Git history contains no earlier source packet.

These findings do not yet prove how the overlay was created. They make a
migration collision, misattached text, or generated text the live hypotheses;
none is approved as fact. Until a source is recovered, do not mark the interview
as verified, infer a 2017 publication URL, or replace it with the 2004 article.
The record currently sources 27 relationship assertions and is the first
mention for 17 entities, so a quarantine or deletion proposal requires a graph
impact preview under #727 and #731-#734.

The graph preview classifies the 27 assertions as three with both endpoints
first introduced by this record, 16 with one such endpoint, and eight whose
endpoints predate it. None of the 17 first-mentioned entities participates in a
relationship sourced by another record. Exact archive-text checks found
possible alternate mention records for seven of them: Baltimore, Cable News
Network, Tribune Media, Department of Justice, the 2016 presidential campaign,
Jared Kushner, and WBFF. The other ten had no exact alternate mention. Those
matches are reassignment candidates, not proof of a valid first mention; each
needs contextual review before graph state changes.

The first regression test assumed the row should be rewritten to the 2004
article. Source inspection disproved that as a safe conclusion. The replacement
test now enforces the narrower invariant: a row cannot remain verified while
its URL resolves to the 2004 work and its text describes the 2017-era interview.
The targeted test fails on the current row as intended.

### External call log for RECORD-00614 source recovery

Two Firecrawl searches returned no exact result and one irrelevant broad result.
Two focused Firecrawl maps also returned irrelevant matches; a sitemap-only map
returned 4,048 current URLs. One direct WordPress API request returned a
Cloudflare challenge. Computer use could not initialize its native control
pipe, and the browser fallback was blocked by network policy before page
retrieval. No bypass was attempted. Internet Archive calls returned the current
URL capture list, the 2017 homepage capture list, ten selected homepage
snapshots, and the 1763xx post index. One broader CDX request returned 503 and
one wildcard request returned an empty array. Seven Common Crawl index queries
returned only robots captures or no useful page captures. Four exact web-search
passes and one official FCC search completed. No canonical data changed.

## Coverage dips and newspaper clipping recovery queue

The source CSV has 1,028 dated archive rows. It has no rows for 1986-1988 or
2002. Rows whose author field names Jay Rosen are also absent in 1989-1992,
1994, 1997-1998, and 2002. The pre-2003 set contains only nine authored or
co-authored items, followed by 67 in 2003. This is a recovery signal rather
than evidence that publication stopped. Later low authored counts also need
source-aware review: 10 in 2014, five in 2015, nine in 2016, five in 2017, and
between six and 13 in each complete year from 2018 through 2025.

Newspaper clippings account for much of the apparent early coverage. There are
83 current rows with newspapers.com URLs and 83 distinct source PDF filenames.
All 83 are marked verified, but every stored `raw_text` value is under 500
characters and 26 are blank. The original 62-record clipping JSON and all 77
records in the six later batch files are marked `verified=false`; the later
integration code also emits an empty `raw_text` and `verified=false`. The
current verified state therefore needs source replay, not trust in the merged
row.

Eight verified rows explicitly retain unresolved or contradictory relevance
language: `CLIP-00001`, `CLIP-00023`, `CLIP-00027`, `CLIP-00028`,
`CLIP-00037`, `CLIP-00055`, `CLIP-00063`, and `CLIP-00073`. The notes include
no Jay Rosen mention, inferred relevance, a Robert Rosen assumption, a Jay
Rosenstein reference, or unidentified OCR. A targeted test rejects a verified
newspapers.com row when its own notes contain those unresolved signals. It
fails on exactly those eight rows.

The 83 named source PDFs are not present in the user profile, the project Git
objects, or any PDF indexed on `D:`. Their newspapers.com image URLs, source
publication, date, page, and intended filename remain in the CSV. Recovery
will use an authenticated, one-record pilot before batch download. Each packet
must preserve the downloaded PDF, image and page identity, source hash, raw
OCR, cleaned text, layout review, relevance verdict, and proposed row changes.

### Staging ID provenance

The clipping staging files contain 139 entries representing 83 distinct
newspapers.com URLs and 105 distinct `CLIP-*` IDs. Twenty IDs were reused for
different URLs during separate processing batches. A URL-based comparison
shows that the current CSV preserves all 83 distinct staged URLs exactly once;
the reused staging IDs therefore require a provenance crosswalk, but they do
not by themselves prove source loss. For example, the batch-2 source labeled
`CLIP-00023` is preserved as current `CLIP-00020`, while current
`CLIP-00023` is the unrelated Jay Rosenstein clipping from the original
staging file. The batch-4 source labeled `CLIP-00073` is preserved as current
`CLIP-00054`, while current `CLIP-00073` is the unsupported Globe and Mail
documentary review.

### Early-career source recovery

An OpenAlex author record returned 47 works but is demonstrably conflated with
other people named Jay Rosen, including a CUNY mathematician, a rehabilitation
researcher, and a scholar of Thomas Gray. OpenAlex is therefore a discovery
index only, never identity proof. Exact normalized-title and DOI checks against
the source CSV found the following source-backed journalism candidates absent
from the current archive:

| Year | Candidate | Registry or institutional evidence | Queue state |
|---:|---|---|---|
| 1989 | `Phantom public haunts nuclear age` | Crossref DOI `10.1080/00963402.1989.11459688`; Jay Rosen; *Bulletin of the Atomic Scientists* 45(5), 16-19 | Source-text recovery |
| 1991 | `News and the Search for the Present` | Crossref DOI `10.1080/08821127.1991.10731317`; Jay Rosen; *American Journalism* 8(1), 4-6 | Source-text recovery |
| 1991 | `The recovery of the public world` | NYU Scholars landing record exposed through OpenAlex | Bibliographic replay |
| 1994 | `Making Things More Public: On the Political Responsibility of the Media Intellectual` | ERIC record `EJ496101`; Jay Rosen; *Critical Studies in Mass Communication* | Source-text recovery and version check |
| 1994 | `Scholars in the public sphere` | Crossref DOI `10.1080/15295039409366911`; Linda Steiner and Jay Rosen; 11(4), 362-388 | Contribution-role review |
| 1996 | `Public journalism is a challenge to you (yes, you)` | Crossref DOI `10.1002/ncr.4100850103`; Jay Rosen; *National Civic Review* 85(1), 3-6 | Source-text recovery |
| 1997 | `In quest of journalism` | Crossref DOI `10.1177/030642209702600315`; Jay Rosen; *Index on Censorship* 26(3), 81-89 | Source-text recovery |
| 1997 | `The Media and Democracy: A Dialogue` | Crossref DOI `10.1353/jod.1997.0062`; Adam Michnik and Jay Rosen; *Journal of Democracy* 8(4), 85-93 | Source-text recovery |
| 2000 | `Questions and Answers About Public Journalism` | Crossref DOI `10.1080/146167000441376`; Jay Rosen; *Journalism Studies* 1(4), 679-683 | Source-text recovery |
| 2002 | `When the networks ran in reverse: reflections on the terror in New York` | Crossref DOI `10.1177/146488490200300113`; Jay Rosen; *Journalism* 3(1), 30-36 | Source-text recovery |

`Public Journalism: A Case for Public Scholarship` and *What Are Journalists
For?* matched existing records and are not new candidates. Several books,
edited volumes, and later reprints remain in a role-resolution queue because
the discovery index did not reliably distinguish author, editor, chapter, or
edition.

### Cornell false-homonym exclusion

Cornell eCommons exposes a public item titled `Jay Rosen Interview January
1987` at handle `1813/17294`. Repository metadata identifies an interview by
Eugene Dynkin, dated 1987-01, with a 10,929,689-byte MP3 named `Rosen.mp3` in
the source metadata; the downloaded content is 10,929,689 bytes and has
SHA-256 `1b99c765b45a98cd7470160af86abf17bec18e5cdc9ee59845dc04f4713544c6`.
`ffprobe` reports 683.102 seconds and 128 kbps.

Whisper `turbo` transcribed the file on CUDA in 37 seconds. The 1,559-word
plain-text transcript has SHA-256
`157bb879cf1559d3f7f0591d254cc85422e7a1d48c6ed98e7ddeac0c01bbb653`;
the word-timestamp JSON has SHA-256
`891d9c79dd5c8d40f85d15ea7bebe3f5f3f273cb9d4ae5f04cff951abd66f58b`.
The speaker discusses Harvard mathematics, Princeton doctoral work under
Barry Simon, Rockefeller University, and constructive quantum field theory.
Barry Simon's Caltech list identifies this Jay Rosen as his 1974 Princeton
student and a CUNY mathematics professor; the CUNY faculty page confirms the
same research identity. This source is excluded as a resolved namesake, not
added as an archive record.

### K2 reconciliation for RECORD-00614

K2 session `session_de851158-11fc-4e77-95e8-1490a1645f9c` completed with four
valid required JSON artifacts and a report. Their SHA-256 values are:

- `evidence-packet.json`: `42b48ca3c484770c6711b47d9eb09514ca9cffe990be4077b47c4fb4baf6eef5`
- `source-candidates.json`: `ae018a2f36976dc630458c43e0f08f1b8e28c17a98d5537820e53cb806e6392e`
- `graph-review.json`: `6bfdfce28d4ff7b888d1b49f50ac0e41389850cbb47674c16dc4c2a2499e6b9b`
- `external-calls.json`: `50546e3531ecd032b759d9654f6f71ecfe7057086f064ee936f2e55bc094df4b`
- `report.txt`: `dafbf128315f01821c4010dfdea3d3d53e7fdebc1eec900035102786c071ad78`

Accepted findings are the pinned-row hash, the 2004 linked-source identity,
the 2017-era internal chronology, the absence of a recovered primary source,
and the 27-relationship/17-first-mention graph impact. The review-needed
classification for all 27 relationship assertions is also accepted.

Rejected as unproved are K2's claim that TomDispatch published the stored
interview, its 2017-11-23 exact-date proposal, its proposed Tom Engelhardt
canonical author update, and its numerical hypothesis probabilities. The text
presents itself as a Tom Engelhardt interview for TomDispatch, but no primary
source authenticates that presentation. The enterprise-policy block remains
final; no Cloudflare or WordPress bypass will be attempted.

The smallest evidence-backed row correction is now applied locally:
`verified=FALSE`, `low_confidence=TRUE`, and `needs_review=TRUE`, with a note
recording the mismatch. No title, author, date, URL, text, entity, or
relationship was rewritten. The targeted regression
`RECORD-00614 cannot verify mismatched TomDispatch works` passes after the
change.

### External call log for the gap and clipping checkpoint

- GitHub CLI listed open issues while excluding `do-not-automate`, then read
  issues #538, #703, and #724. The recovery queue is tied to #538, census
  metrics to #703, and row proposals to #724.
- The primary agent ran exact-title web searches across publisher,
  institutional, catalog, and scholarly indexes. Crossref returned verified
  metadata for eight journalism DOIs. OpenAlex returned 47 works for author
  `A5083797098`, including clear namesake contamination; no OpenAlex-only item
  was accepted as canonical evidence.
- Direct requests to Cornell's handle page and DSpace API returned the item,
  bundle, bitstream metadata, and public MP3. One transcript identity check
  used Caltech's Barry Simon student list and the CUNY mathematics faculty
  page.
- Four direct DOI opens were rejected by the browser safety layer. Crossref's
  public API supplied the registry metadata instead. Two NYU Scholars direct
  requests failed during TLS negotiation and remain unverified leads.
- An agent-browser session opened newspapers.com image `442484302`, passed the
  ordinary Cloudflare checkbox, and reached the Albany page plus subscription
  prompt. The remote LastPass session contained no newspapers.com or Ancestry
  entry. Computer use still lacked its app-owned native pipe, and workstation
  policy rejected a visible Chrome launch. No account state changed and no
  source PDF was downloaded.
- K2 logged 38 RECORD-00614 evidence operations and requests in its hashed
  external-call artifact. No credential, paid API, or live-site write was used.

## PressThink source-gap recovery

For the density check, an authored row is one whose `author` field contains
`Jay Rosen`; this includes values such as `Jay Rosen / Studio 20`. A local dip
is a complete calendar year below 60 percent of the median for the two years on
each side. The source boundary matters: 2003 is the first PressThink capture
year, so its low count is a partial-start boundary rather than an ordinary
within-series anomaly. The later source-aware dips are 2011, with 24 authored
rows against a neighbor median of 43, and 2015, with five against 9.5.

The public PressThink WordPress API returned 20 posts for 2011 and 22 for 2015.
The full response captures are:

- `2011-posts.json`: 540,663 bytes; SHA-256
  `8f2bf9803658f32e1cc0dc8f4a60fdeb23a05602db4a38f00584504b48e2457e`
- `2015-posts.json`: 640,515 bytes; SHA-256
  `b5719f40c0f392e3f4e651849acb168fe1ce950e7953f7428c948aef0a2074c5`

All 42 source posts name WordPress author ID 2. The user endpoint for that ID
returned 403, so the numeric ID alone is not accepted as identity evidence. A
captured post page contains `<meta name="author" content="Jay Rosen" />`, which
supplies page-level authorship evidence for the source. Exact current-URL and
normalized-title reconciliation found no exact 2011 URLs, two 2011 title
matches, one exact 2015 URL, and 21 initially unmatched 2015 URLs. One 2011
title match is `RECORD-00609`, whose stored URL uses the older dated permalink.
The other, `The Politics of the New Huffington Post at AOL`, is already
preserved through HuffPost and an unverified duplicate, so a new PressThink row
would require version review rather than automatic insertion.

A deterministic proposal-only queue now classifies all 42 source posts as one
exact-URL match, two title-level version reviews, and 39 source candidates. The
21,130-byte queue has SHA-256
`104cc1678cc5cdcda9da9e0016c4d1e1bd5e1426402f532ff8473a79668bab3d`.
It assigns source keys such as `pressthink-wp-1139`, not permanent archive IDs.

The first five direct-source recovery candidates are `What I Think I Know
About Journalism`, `If 'he said, she said' journalism is irretrievably lame,
what's better?`, `The Citizens Agenda: A Plan to Make Election Coverage More
Useful to People`, `Full stack credibility`, and `A (brief) banking theory of
newsroom trust.` Their source packets can be prepared from the captured API
content, but no permanent IDs have been assigned. ID allocation and duplicate
policy remain one-way decisions that need curator approval.

If those five source-backed proposals are approved, the authored-row counts
would rise from 24 to 27 in 2011 and from five to seven in 2015. Both would
clear the same local-dip threshold that selected the years: 25.8 for 2011 and
5.7 for 2015. This is a projected effect, not an insertion or a claim that the
39-candidate queue has been exhausted.

The five-candidate full-content packet is 138,387 bytes with SHA-256
`47781d45b6a0995f5b7e35186b68c5c83604187f990491f00c445e5507dcc651`.
It preserves the rendered source HTML, deterministic cleaned text, source
dates, URLs, author IDs, capture hashes, and zero current archive matches.

The same replay found a source-date defect in `RECORD-00097`. WordPress post
7938 reports `2015-11-29T20:05:58`, while the row stored `2015-11-30`. A failing
regression was added first; the row date is now `2015-11-29`, and the targeted
test passes. The 11,384 stored word count remains unresolved: stored text has
about 3,190 regex words and omits source material visible in the API content.
No word-count or text rewrite is proposed until the full source replay is
reviewed.

### External call ledger for early-career and PressThink recovery

| Service | Request or query | Result and use |
|---|---|---|
| OpenAlex | Author search for `Jay Rosen`, author `A5083797098`, that author's works, and one batched locations lookup | 47 works returned; namesake contamination proved the index unsafe for identity evidence. Used only to find leads. |
| Crossref | `10.1080/00963402.1989.11459688` | Metadata accepted for the 1989 *Bulletin of the Atomic Scientists* lead. |
| Crossref | `10.1080/08821127.1991.10731317` | Metadata accepted for the 1991 *American Journalism* lead. |
| Crossref | `10.1080/15295039409366911` | Metadata accepted for the 1994 co-authored lead. |
| Crossref | `10.1002/ncr.4100850103` | Metadata accepted for the 1996 *National Civic Review* lead. |
| Crossref | `10.1177/030642209702600315` | Metadata accepted for the 1997 *Index on Censorship* lead. |
| Crossref | `10.1353/jod.1997.0062` | Metadata accepted for the 1997 dialogue lead. |
| Crossref | `10.1080/146167000441376` | Metadata accepted for the 2000 *Journalism Studies* lead. |
| Crossref | `10.1177/146488490200300113` | Metadata accepted for the 2002 *Journalism* lead. |
| Cornell eCommons | Handle `1813/17294`; DSpace item `538b5125-5018-4bcc-bf56-3c23196fc948`; bundle and bitstream metadata; bitstream `626797a9-cc7b-4db2-9577-83af2a07f618`; content download | Public metadata and MP3 returned. GPU transcription plus Caltech and CUNY identity checks resolved the subject as a mathematician and excluded the item. |
| PressThink WordPress API | Year-bounded post queries for 2003, 2011, and 2015; full 100-item captures for 2011 and 2015 | 2003 count query returned zero under the tested boundary; 2011 returned 20 and 2015 returned 22. The two full captures are hashed above. |
| PressThink WordPress API | `GET /wp-json/wp/v2/users/2` | 403; not used as identity evidence. |
| PressThink WordPress API | Post 8225 with `_embed=author` | 200, but embedded author fields were empty; not used as identity evidence. |
| PressThink HTML | Source permalink for post 8225 | 200; page author metadata identified Jay Rosen. |
| PressThink HTML | Current and stored permalinks for `Why Political Coverage is Broken` | The current `/2011/08/` page returned 200 with the title, 2011-08-26 date, and PressThink authorship statement. The browser safety layer rejected the stored `/2011/08/26/` form before retrieval, so redirect equivalence remains a title-backed review rather than an asserted exact URL match. |
| SAGE and Internet Archive | Issue-page search for DOI `10.1177/146488490200300113`, direct PDF request, and three CDX attempts | Issue page confirmed 2002 date and pages 30-36. PDF returned 403; three CDX calls timed out. No source text recovered. |
| NYU Scholars | Two direct landing-page requests for the 1991 lead | TLS negotiation failed both times; the item remains a bibliographic lead. |
| Browser search | Exact-title and identity searches across publisher, catalog, institutional, Caltech, CUNY, ERIC, and scholarly pages | Used to route evidence only. Four direct DOI opens were blocked before retrieval; no blocked result was treated as evidence. |

All requests above were read-only. No credential, paid API, account change,
production write, or live archive operation occurred.

## K2 newspaper clipping pilot reconciliation

K2 session `session_88bf48b4-c9d3-447a-b273-92c65a319890` reviewed five
current newspapers.com rows against the pinned data commit, all clipping
staging files, the integration code, the repository PDF inventory, and a small
set of public identity searches. The validated artifact hashes are:

- `pilot-review.json`: `3eaae914a3fd1a41c79636ccba0c301d33c831e5085ace7c210e30ae1796bda3`
- `staging-id-crosswalk.json`: `d947fdcc4f96fcebbf098262989cccbccb99a8c472020ea70fc96dcff223a80c`
- `proposed-changes.json`: `9f48430f71faff859858b50dff451074be92c16843f0915404d8e9513d41a71b`
- `external-calls.json`: `e49b977ff7f01af1514194a23f37be2571d385d0485ddc8c862db93969de80f9`
- `report.txt`: `c7b1f2506a60adf1eb75932f2eb95867d6319af40a8296ddbce39c7a8dcca326`

The accepted verdicts are `no_evidence` for `CLIP-00001`, `false_identity`
for `CLIP-00023`, and `unresolved_missing_source` for `CLIP-00037`,
`CLIP-00063`, and `CLIP-00073`. The false identity is visible in the stored
record itself: it names Illinois filmmaker Jay Rosenstein, not Jay Rosen. The
three unresolved records rely on `Robert Rosen`, an unnamed NYU professor, or
hand selection without a Rosen reference. The source scans are needed to settle
them.

K2 proposed `verified=FALSE`, `needs_review=TRUE`, and an audit-note append.
The reconciled edit also sets `low_confidence=TRUE`, matching the existing
unresolved-source pattern. All five rows now carry those three flags. No title,
date, URL, raw text, summary, concept, tag, entity, or relationship was
rewritten. A strict parse confirms 1,028 rows, 38 columns, and zero width
errors. The relevance regression now reports only the three rows outside this
pilot: `CLIP-00027`, `CLIP-00028`, and `CLIP-00055`.

K2 logged five public searches and one newspapers.com request. The searches
covered Jay Rosenstein and *In Whose Honor?*, Robert Rosen and involved
journalism, the Globe and Mail documentary review, Jay Rosen's NYU biography,
and Gulf War press-restriction context. The newspapers.com request for image
`442484302` returned 403; the other four image pages were not retried. No
credential, login, bypass, paid API, or account change was used.

## Google Drive clipping source correction

The earlier PDF inventory was accurate only for the repository, the local user
profile, and `D:`. It was not a final source-availability verdict. A later
Google Drive search found the `DeepSeek-OCR` corpus, including
`output_tesseract_full`, `output`, full-page PNG files, OCR text files, and
`newspaper_archive.db`. The database has SHA-256
`e4fd35e5b0f82f8721503d1b394ce44004736a2c21ead66b1e00077768ebf568`,
contains 84 `newspaper_articles` rows, and maps by source filename to all 83
current clipping rows. The one unused database row is a second
`News_and_Record_1995_10_15_82` capture. All 83 CSV publication dates match
their database source dates.

This discovery supersedes K2's source-missing premise for the seven rows below.
The full-page OCR supplies explicit identity evidence:

| Record | Source evidence | Disposition |
|---|---|---|
| `CLIP-00001` | `New York University Journalism Professor Jay Rosen` | Verification restored; excerpt, summary, quotation, and provenance corrected. |
| `CLIP-00027` | `New York University journalism professor Jay Rosen` followed by Rosen's criticism of Leonard Downie's refusal to vote | Existing verification retained; topical-only staging text replaced with source evidence. |
| `CLIP-00028` | `professor Jay Rosen of New York University` and a reference to his July *Tikkun* article | Existing verification retained; the unsupported Syracuse identity inference was removed. |
| `CLIP-00037` | `Professor Jay Rosen of New York University` in a public-journalism column | Verification restored; the unsupported `Robert Rosen` inference was removed. |
| `CLIP-00055` | `Jay Rosen, director of the Project on Public Life and the Press` | Existing verification retained; the unrelated Ron Clark inference was removed. |
| `CLIP-00063` | `Guest: NYU journalism professor Jay Rosen` in the *Tony Brown's Journal* listing | Verification restored and the missing text fields filled. |
| `CLIP-00073` | `Jay Rosen of New York University` and Todd Gitlin as the documentary's two academic analysts | Verification restored and the missing text fields filled. |

The source replay added each Drive OCR file link, retained the newspapers.com
page URL, recorded the Drive page-scan folder in notes, and cleared review
flags only where the page explicitly identifies Rosen. The relevant Drive OCR
file IDs are `1nslarSwOSlhduSL7ml3UEXb5-pJz8ZFd`,
`1-59SQsAcH19ulrsO8hNbWL7rUso2GN98`,
`14OhV6pYfZ-xDi974fEG15L0VG3z0yzmC`,
`1MrhmwiAphfM1vyFtVXQVDsc37vg-cHId`,
`1RWZHI8cJUGybh9jw-B73OzLP5uQgCKZX`,
`1dJiuQqiW0NhpQwXWUqOzugRk7xkVeSwL`, and
`1P7BnOYCnTysJu4PesxghC9luf23nVu08`.

`CLIP-00023` remains excluded from verified Rosen material. Visual inspection
of its page image shows the center-column line ending `Jay Rosen-` continuing
at the top of the right column as `stein`. The subject is Illinois filmmaker
Jay Rosenstein. Its `verified=FALSE`, `low_confidence=TRUE`, and
`needs_review=TRUE` flags remain.

A failing regression was added before the source-backed edits. It requires all
seven valid rows to preserve the explicit source identification in
`raw_text`, requires their verification and review flags to agree, and keeps
the Jay Rosenstein exclusion. The targeted source-replay and relevance tests
now pass. A strict parse still returns 1,028 records, 38 columns, 1,029 CRLF
record boundaries, and 80,894 LF-only embedded text breaks.

K2 session `session_07524f98-9d0f-4f70-bf2f-6458b34f8b06` reviewed
`CLIP-00027`, `CLIP-00028`, and `CLIP-00055` before the Drive corpus was
available to the agent. Its artifacts parsed and passed its three-ID scope
check:

- `followup-review.json`: `1d8a6f8abbeb63b17e788ad2fe3a47202ddeb661daef97026b6b7aa2aa4fba01`
- `staging-id-crosswalk.json`: `19c2e34f0fb4e41252a7145c43737ca86e1816d46214b4b5b8dd2b4e7dd32d75`
- `proposed-changes.json`: `5a4b293287603092d8f2146b3c6a5f7cbea673ffe68dd5a5a951e5f39d3340fa`
- `external-calls.json`: `a9bb90bb3258c9748e4bded1c012d098d4717b6a3543d881c5840a248c7f2d83`
- `report.txt`: `f0db1cdf9b878773b6555be295029091ecbc42818da74e35514623f77e496059`

Its source-missing verdicts and proposed unverifications are rejected because
the recovered pages explicitly name Rosen. Its staging-ID crosswalk and the
finding that the original integration marked rows verified without source
checks remain useful provenance findings. A new K2 pass is reviewing the
captured Drive evidence rather than trying to access Drive itself.

### Google Drive external call ledger

All calls on 2026-07-23 were read-only and returned successfully unless stated
otherwise.

| Operation | Request | Result and use |
|---|---|---|
| Drive search | `newspapers`, `newspaper clippings`, `Albany Democrat Herald 1991`, and `The Day 1995 Rosen` | Located the OCR corpus and routed exact-source searches. |
| Drive folder reads | `DeepSeek-OCR`, `output`, `output_tesseract_full`, and selected source `pages` folders | Established the corpus hierarchy and confirmed OCR plus page-image artifacts. |
| Drive file fetch | OCR text for the Albany, Southern Champaign County, The Day, Daily Journal, and Globe and Mail sources | Supplied identity contexts for the pilot and namesake decision. |
| Drive raw file fetch | `newspaper_archive.db`, file `1wbBgmn2nq7u99FCzCtJjqqKvD3J8vGKe` | Downloaded 1,818,624 bytes; the database hash is recorded above. |
| Drive raw image fetch | `Southern_Champaign_County_Today_2001_02_14_1/page_001.png` | Visual column-flow review resolved `Jay Rosen-` plus `stein` as Jay Rosenstein. |
| Drive exact-source search | The seven source basenames in the table above | Returned each OCR text file and page-scan folder; those IDs now supply row provenance. |
| Drive exact-source search and folder read | `Daily_Hampshire_Gazette_2000_10_30_9` and its alternate OCR folder | Returned Tesseract and alternate OCR artifacts. The alternate OCR repeated unrelated text and was rejected as verification evidence. |

A second exact-source pass searched all 83 clipping basenames and returned one
distinct `output_tesseract_full` OCR text file for every current clipping row.
The resulting 83-record map is 17,614 bytes with SHA-256
`95fd869d00c005e1a8277703563ce3e9e990b7c7b73dd816a3860a07d0fbc127`.
The 83-call JSON ledger is 16,744 bytes with SHA-256
`10f7fc19cfcd4241d23eeae401b77d392f006fad9767308c9d8be2f7e9f56fd3`.
All 76 previously blank `gdrive_raw_file_link` fields now point to their exact
OCR files; the seven existing links matched the map. A failing test identified
the 76 gaps before the edit, and the same test passes after the mapping.

No Drive file, account state, credential, paid API, production service, or live
archive content was changed.

### Source-aware K2 replay and page-scan resolution

K2 session `session_99648b4c-908e-4dbd-8351-d406154ccb74` reviewed the seven
records above from a captured evidence packet rather than attempting Drive
access. The packet has SHA-256
`59d5f0f560e7e148545cb1608afbd4372152d721073fd137f883c754172dbca`.
The validated output hashes are:

- `source-replay-review.json`: `f7183807e8f593e282bfbbb40c1b875525b46478bd5bfc9aff3b72a5c1a3a254`
- `proposed-corrections.json`: `7ccca809632d0ac56127564df26d368f5c12697368397d9bb540610f9be44cac`
- `external-calls.json`: `16e393ddf4fae1f65a85c48ad657df0d54e83ef4b0779d41d6e3fd6d53c1d3fe`
- `report.txt`: `63d470f30b178d290316ac94c20897cab43d92626414a1468e513ddc7553643b`

The accepted finding is that all seven source pages explicitly identify Jay
Rosen, so their `verified=TRUE` disposition is source-backed. K2 also found
that the cleaned text for `CLIP-00037` and `CLIP-00063` needed comparison with
the scans, and that `CLIP-00073` used a paraphrase in `pull_quote` despite a
direct Todd Gitlin quotation being present in the source excerpt. The first
two text findings were resolved independently against the page images before
editing the records; K2's proposed review flags are therefore rejected.

For `CLIP-00037`, Drive image `1EZdlm4ATyWMg_jc144p1CNvkHAeR86QZ`
was downloaded as 4,550,537 bytes with SHA-256
`905539e451c17b62a55959b9d3bc16f7e452c5dfc980ac76509f857cb48c4fb0`.
The visible passage says Rosen described separations between journalists and
the political community, news and editorial, facts and values, and information
and beliefs. It then quotes his challenge to get the connections right because
the connections are faltering. This scan corrects the prior cleaned text's
unsupported substitutions of citizens for the political community and news
and values for the source's two distinct pairs.

For `CLIP-00063`, Drive image `1zgjAazB8JwJ-VCBH-9Hj6kZa8Lg4Pw-9`
was downloaded as 4,585,525 bytes with SHA-256
`e3bcacc9f89c59277e2403ea669de0ecf12c3d417ae491bd746f5786f40105d9`.
The visible listing reads: `Scheduled topics: the portrayal of blacks on TV
and black viewing habits. Guest: NYU journalism professor Jay Rosen. 30 min.`
This resolves the OCR ambiguity without retaining a low-confidence or review
flag.

The first two signed-image download attempts failed because the destination
was passed as a literal `$env:TEMP` path. Both requests were retried with
resolved absolute paths and returned the byte counts and hashes above. No
Drive content or account state changed.

### Batch 01 page-image call ledger

On 2026-07-23, the primary review made five exact Google Drive searches for
the source basenames of `CLIP-00064` through `CLIP-00068`. Each returned its
previously mapped OCR file and source folder. The reviewer then read each
source folder and its `pages` subfolder, fetched the single page image as a raw
file, and downloaded the returned signed attachment. All 20 Drive operations
and five signed-file GET requests succeeded; none changed Drive or account
state.

| Record | Drive page image | Bytes | SHA-256 |
|---|---|---:|---|
| `CLIP-00064` | `1xoVpdHD2NjLqBGQC_hki4TNDBvMNKV_5` | 4,454,572 | `82ca4262632892703ca5b229791c63df23f9d525e4fcc1909b6bee752aa4f0e1` |
| `CLIP-00065` | `1qo08wJ3V5SRVa53pJbiSvWqosq1F6W66` | 5,044,525 | `182f714c57dc4142a56f675cf8c362bf03fd2f8c6ecf311b2cf5de0f3544ad76` |
| `CLIP-00066` | `1ICVwdih2BZjm8dhiCFXTXFGp8HJsjzCP` | 4,399,967 | `56bea91c3634f3628e6b30b3eebe7cc151cc6272c9aa573e34932d932a049fb7` |
| `CLIP-00067` | `12oIGbeYWxIGLvQj1NiiiYNjM0eqGCEbm` | 4,100,110 | `fa7ec9675bd566cd75b73ee3d29e3b48bcf3741370606d9440567ccbdb10823c` |
| `CLIP-00068` | `1WhUE12MGab02KgFYeTEIb0YkUbP_kA96` | 4,977,784 | `c77744c3ef62fac95dada96b3fd5f0e5bbd266831bef29e33a47f481d02cd15e` |

The `CLIP-00064` scan confirms all three Jay Rosen quotations and resolves the
OCR sentence boundary after `affairs of the community.` The
`CLIP-00065`, `CLIP-00066`, and `CLIP-00067` scans explicitly identify New
York University professor Jay Rosen and print `problems with schools, kids,
cars, homes, bills.` This proves that the current `cops` transcription is
wrong.
The `CLIP-00068` scan explicitly attributes the statement that the
government's bond with the audience was stronger than the media's to New York
University Journalism Professor Jay Rosen. These findings were reconciled
with the source-aware K2 batch before the rows were edited.

K2 session `session_c9a2161d-e723-48ef-b5a2-2a613d0aaca9` reviewed the five
records from evidence packet SHA-256
`e14d1c951a927660a1cd95d47bc052332b9ebb385751368450dcb294423525fc`.
The process exited zero at the first ten-minute checkpoint, made no external
calls, and did not change the repository. Its validated artifact hashes are:

- `source-review.json`: `856323898ccaf03696ee323c2abb9403763e69dd81a031d6dbcfc86cfc36b2be`
- `proposed-corrections.json`: `b4da0acc89dce94cf09c9f304c8a4e40dd6020cc00062a68e8a024fd350c57c6`
- `external-calls.json`: `16e393ddf4fae1f65a85c48ad657df0d54e83ef4b0779d41d6e3fd6d53c1d3fe`
- `report.txt`: `f597dffbe2c0ecea5079368101245231f7d50bc2b54a5248e884a7ad4cc7773e`

K2's `CLIP-00064` and `CLIP-00066` identity findings and its `cars` reading
are accepted. Its 210-word `CLIP-00064` proposal is shortened to the Rosen
passages to avoid unrelated editorial text. Its proposed review flags for
`CLIP-00065` and `CLIP-00067`, and its proposed unverification of
`CLIP-00068`, are rejected because K2 had OCR but not the page images. The
scans above explicitly resolve all three records.

### Batch 02 page-image call ledger

The same review made four exact Google Drive searches for
`The_Coeur_d_Alene_Press_1991_09_15_7`,
`The_Boston_Globe_1992_11_02_13`, `Rio_Grande_Sun_1992_11_05_4`, and
`Daily_Press_1994_06_05_Page_59`.
Each returned the mapped OCR file and source folder. The reviewer read each
source folder and its `pages` subfolder, fetched the single page image as a raw
file, and downloaded the returned signed attachment. All 16 Drive operations
and four signed-file GET requests succeeded; none changed Drive or account
state.

| Record | Drive page image | Bytes | SHA-256 |
|---|---|---:|---|
| `CLIP-00069` | `11KaVW9Em22hZ51YfkUXDMgcihfBcGfkq` | 3,809,130 | `18da014d015b512ed2725b35dcfc894556f7a3efb2e949b6d4f138438ac53361` |
| `CLIP-00071` | `1KeEGDmoD7GUbvFjQjTQDjc_xIFTXx4ju` | 4,916,985 | `8508ad464e9e1768ace6280b3c1fc44b7156b5dc2b9b070a1014a2c66a9f9715` |
| `CLIP-00072` | `1mP8n5CzjVsi4RaWB71kWZKiUC8GBWDbX` | 4,740,860 | `f7a68e03031f70a19c29be1bdddd91bb23dc510af1b6e69838f1b4518ff003ed` |
| `CLIP-00074` | `1sob60_KGQRebR7U6fXlgXLlmeFWB7p9h` | 5,114,750 | `e9a55fc8d410e20cde71b986552fb1c659b8389004df072bdb0c7b0f8fe405cb` |

The `CLIP-00069` scan prints the same Jay Rosen attribution found in
`CLIP-00068`, disproving the current `government's issue` transcription. The
`CLIP-00071` scan explicitly identifies Professor Jay Rosen of New York
University and references his 20th Century Fund study on the 1992 election.
The `CLIP-00072` scan explicitly identifies New York University journalism
professor Jay Rosen; his description continues onto page A-5, which is not in
the recovered source. The row must preserve only the visible fragment unless a
continuation page is recovered. The `CLIP-00074` scan confirms Rosen's name,
NYU affiliation, and the quotation about newspaper readers feeling part of a
world in which politics and public affairs matter.

### Batch 03 page-image call ledger

The review made five exact Google Drive searches for the source basenames of
`CLIP-00075` through `CLIP-00079`. Each returned the mapped OCR file and source
folder. The reviewer read all five source folders and their `pages` folders,
then fetched the five page images as raw files. The raw fetch was repeated once
to extract only the signed download metadata after the first responses included
the full base64 image bodies. All 25 Drive operations and five signed-file GET
requests succeeded; none changed Drive or account state.

| Record | Drive page image | Bytes | SHA-256 |
|---|---|---:|---|
| `CLIP-00075` | `14IETOK13j3xxi-1MMBVantUKmwY3zI5d` | 3,952,068 | `41a1e2e184526fa1d57812cf1da27ac98caf44a7608cfd3ada62780158f41d57` |
| `CLIP-00076` | `1eOAltCorTfTxrvn2wPLICRSToO4YLoaH` | 4,426,934 | `efe7b4e92f580a1372bdc4c6aaf5b8a6e393035fc7756a4a5ae4c020ac8862e8` |
| `CLIP-00077` | `1dnPwbfvVxWnzN0Jqgv1uZI5wvjYHK1ug` | 4,410,597 | `d0915cebafe3cb13b8e106d6d23f5fd3c5cc681145c122c2fd85d8c817d1cc0d` |
| `CLIP-00078` | `1X3VRFp7w3uyEkZUCj0yu2keP-dtb3yOR` | 4,376,379 | `0755b2d6ba07f3ec6ad2b3822cc8299417d59caf77c8feb50d02927c6c485a0c` |
| `CLIP-00079` | `1wAAhK9Xh4090DUKgAAFyC5dHIR2baXVV` | 5,055,033 | `50a51e1a24b78e41df4fd52e48155d3b49c24944ffb38ec2329afd1141255a66` |

The scans explicitly identify the relevant Jay Rosen in all five records.
They resolve `CLIP-00075`'s closing sentence as `It's inevitable`,
`CLIP-00076`'s invited listener as Wendy Orange, and `CLIP-00077`'s speaker
list as David Broder, Jay Rosen, Bill Maxwell, and Jay Black. The
`CLIP-00078` scan supplies Rosen's statement about the moral values inherent
in news judgments. The `CLIP-00079` scan identifies Rosen by his New York
University Graduate School of Journalism affiliation and preserves his quoted
assessment of the Kennedy crash coverage.

The five-record scan packet is 2,560 bytes with SHA-256
`e5445d0fb6d76f23891bf577a974a571572f9e28f7779300fdab398a64200557`.

The primary reviewer also transcribed the shortest source-backed passages from
the scans and independently recounted 34, 116, 41, 39, and 64 words. The
3,085-byte reconciliation artifact has SHA-256
`68d1d160d1201d4110fc9d32f07223f7b03dcba1e5d3a37e320787a0c6f0f135`.
It is separate from the scan packet supplied to the active K2 review.

### Batch 02 K2 reconciliation

K2 session `session_ded5e2b0-cf13-4370-8ff5-abbaab597d47` reviewed only
`CLIP-00069`, `CLIP-00070`, `CLIP-00071`, `CLIP-00072`, and
`CLIP-00074`. It validated evidence-packet SHA-256
`30684e5bbb1a12da2b7c5e693c03585cdd70c2f260ade862659e74ae3532cdd2`
and page-scan packet SHA-256
`b26e30a412d075b1a3bed1f553cde48fc57948f2257f0522b0b75e4263e1c254`.
The process exited zero at the first scheduled ten-minute check and did not
change the repository. Its validated artifact hashes are:

- `source-review.json`: `0b02d2cfec97f3f2d7f7fcf0b1304f2e4663950dacff334099a18b1072943ead`
- `proposed-corrections.json`: `a4e957f3172154f77c6984ff6ba50a3c26d1a66f2a0eca801977a444110c629f`
- `external-calls.json`: `b60943aa37c6507fd05bf7976ffdd8dced43897c1d884ff2ed6068da546e407a`
- `report.txt`: `b23bc0145d6117a24f460ace6e1266a55e479eda476ec1a5526881130b849f6a`

K2 made the following nine public WebSearch calls at
`2026-07-23T05:34:25.197589Z`. Every call completed without finding a direct
source match, and no returned content was adopted:

1. `"The government's bond with the audience was stronger than the media's" "Jay Rosen"`
2. `"Dems hope to shine with glitzy convention" "Leslie Phillips" "Jay Rosen"`
3. `"Should newspapers print the time of a candidate's TV ad" "Gordon McKibben"`
4. `"Closing days: Bash the media" "Hal Rhodes" "Jay Rosen"`
5. `"Public access, not excess, is media problem" "Richard Harwood" "Jay Rosen"`
6. `"sculpt a well-crafted show isn't going to go over with the voters very well" "Jay Rosen"`
7. `"well-crafted show" "voters" "Jay Rosen" convention`
8. `"To pick up a newspaper and scan the front page is to feel yourself a member of a world" "Jay Rosen"`
9. `"substitute universe" "Entertainment Tonight" "Jay Rosen"`

The source passages and direct pull quotes were accepted. The proposed
low-confidence flags for `CLIP-00071` and `CLIP-00072` were rejected because
the page images make the preserved fragments exact; both retain
`needs_review=TRUE` because their continuations have not been recovered. The
proposed review flag for `CLIP-00070` was rejected because the recovered OCR
is clear. Its opening quotation mark was restored during reconciliation. The
focused four-test run passed, token recounts matched 19, 24, 17, 15, and 103,
and the CSV retained 1,028 records, 38 columns, and its CRLF profile.

### Batch 03 K2 reconciliation

K2 session `session_cb681383-5729-46e4-9d4d-ed7ba5b1aac0` reviewed only
`CLIP-00075` through `CLIP-00079`. It validated evidence-packet SHA-256
`d85d9d6470015f974bec57422f19ea85e8e31c6e118235cab156d599553238ef`
and page-scan packet SHA-256
`e5445d0fb6d76f23891bf577a974a571572f9e28f7779300fdab398a64200557`.
The process exited zero, did not change the repository, and recorded no
external calls. Its artifact hashes are:

- `source-review.json`: `9688bd6af45534de388d2b24ad947c08d64b14b0e9e72c69199860ef837c333f`
- `proposed-corrections.json`: `ada80877f64b3d78f6dc2cc8032fe6a20aeaf3c9603c5ac4cc5c66c18eab2b9b`
- `external-calls.json`: `16e393ddf4fae1f65a85c48ad657df0d54e83ef4b0779d41d6e3fd6d53c1d3fe`
- `report.txt`: `ac786b00bca459a424226e23dbf966f3b90815df8696f8673350bf86c284fe67`
- `stdout.log`: `34f07f48a1e51f12de92dcd9827b23d193878d26c7a0850e5baa6f907c2b64f1`
- `stderr.log`: `9e6c2192bd11902cb2d75d01047514b36e68e6cdc44a9a309077b9cac3722751`

The report body contains its pre-write report hash, so the ledger uses the
post-write file hash above. K2 correctly identified Jay Rosen in all five
scans and supplied the source-backed corrections to Lee Krenis More, Wendy
Orange, Bill Maxwell, the direct news-judgment wording, and Michael Vaikys.
It also correctly removed the unsupported `New Big Village Renaissance`
description.

Three proposals were rejected during primary page-image reconciliation. K2
expanded three passages past the shortest excerpt needed to establish
relevance, read `public life to go better` as `get better`, and marked
`CLIP-00079` for review after missing the later full-page quotation `It's going
to get worse`. The accepted values instead use the independent primary
transcription artifact, SHA-256
`68d1d160d1201d4110fc9d32f07223f7b03dcba1e5d3a37e320787a0c6f0f135`,
with exact word counts 34, 116, 41, 39, and 64. `CLIP-00079` remains verified
without a review flag.

The batch-03 regression first failed on the blank `CLIP-00075` source text and
then passed after the CSV-only repair. An independent rerun passed all three
missing-text batch tests. The newspaper completeness gate now fails only on
`CLIP-00080` through `CLIP-00088`, as expected. The CSV remains 1,028 records
by 38 columns, all five accepted passages match the primary transcription,
unrelated bytes are unchanged, CRLF record boundaries are preserved, and the
CRLF-aware diff check passes.

### Batch 04 page-image call ledger

The review made five exact Google Drive searches for the source basenames of
`CLIP-00080` through `CLIP-00084`. Each returned the mapped OCR file and source
folder. The reviewer read all five source folders and their `pages` folders,
fetched the page images as raw files, and downloaded the returned signed
attachments. All 20 Drive operations and five signed-file GET requests
succeeded; none changed Drive or account state.

| Record | Drive page image | Bytes | SHA-256 |
|---|---|---:|---|
| `CLIP-00080` | `19YjaSi-IAa8qbpSLi-1ZcaDAUGdPefv1` | 3,568,175 | `f1eb54869f873bf702ea63a0c92dea0538fb63324b7b5caac801b1e374043208` |
| `CLIP-00081` | `1zWi9r1bNhr-4b9ZrVa7F6Yyu-AgZng5N` | 4,262,495 | `b20482a1f227f7e90200a551504bad2feb0a7ef5b5b285060d81ea30b9f16857` |
| `CLIP-00082` | `1yciNLgpTf6QMk1IEGi8yB0JyRo1YJJGG` | 3,655,397 | `97d36d60c87a8f7f5dd051eb579321364851edcaeed21ca323a53b4648db4a22` |
| `CLIP-00083` | `1TOTNl5vzKhixfal7Bn4g141v7DdAVY03` | 3,903,215 | `e1bde48666ae377ff64984cc401cbc67dd09055d47cf7dc6cefde2e5de2ceece` |
| `CLIP-00084` | `1kr7iVCq9Ds4r5RSa55BpcvL-x7gVxBV2` | 3,824,741 | `ed988effa6fc76817b360356a52f6b00c3e2c4388a1a5e840593bd4cd48fd92e` |

The `CLIP-00080` and `CLIP-00081` scans explicitly identify professor Jay
Rosen of the New York University journalism department and print his warning
that the attempted leak itself may carry more news value than the offered
information. The `CLIP-00082`, `CLIP-00083`, and `CLIP-00084` scans identify
NYU journalism professor Jay Rosen as someone who studied under Neil Postman
and print Rosen's recollection of Postman's response to proposed solutions.
This evidence corrects the current unsupported descriptions of Rosen as a
media ecology professor, colleague, or doctoral student.

The five-record batch 04 scan packet is 4,173 bytes with SHA-256
`fb83041a8aede7afa311a808de30b938b2db12d278531fcd66af6124b057f802`.
It also preserves the exact 49-, 49-, 50-, 50-, and 51-word source
passages transcribed from the page scans; independent token recounts match.

### Batch 04 K2 and source reconciliation

K2 session `session_a3cdbc11-0a92-4ef4-b628-ba9bdef4be68` reviewed only
`CLIP-00080` through `CLIP-00084`. It validated evidence-packet SHA-256
`d2291aad1bf46b0c75fc273cd2710ea3e4741e056251b652e06e72ce082aea53`
and the page-scan hash above, exited zero, and made no external calls. Its
final artifact hashes are:

- `source-review.json`: `001ade79e4e11c5ca12297f2d3beeb91214abfaff5c9c4bc42c5cf963de9bf51`
- `proposed-corrections.json`: `c126edd24abf9d48cd4c5b7af053f8c689e70e906e215cc320275e3f356c39d3`
- `external-calls.json`: `4f91b9c1126a05115483764ee238a176ebb467ea48425c66e7ea83d533eb9175`
- `report.txt`: `76ae41233373de59bafd36d07b8cb57618bc649102bf900ef983dc9ddc456fcf`
- `stdout.log`: `bd8e924dc04c7c0c8973aad6eae14c3a4c72dc19d98f9b79dd505e835f12821a`
- `stderr.log`: `448458dba8fc7a0b4cbb4c9fe86a4076bffb9c3f23f05bf66a5616f2afeece76`

K2 accepted all five identity matches, the 49/49/50/50/51 token counts, the
direct leak-value and Postman passages, and the `CLIP-00081` cross-reference
correction. It also flagged the unsupported dissertation, adviser, media
ecology professor, and colleague descriptions in the three Postman rows.
The source repair uses the exact page-scan punctuation, shorter direct-source
pull quotes, and page-backed summary and note replacements rather than leaving
K2's flagged claims in place.

The batch-04 regression failed first on the blank `CLIP-00080` source text and
then passed after the CSV-only repair. Independent comparison confirms that
all five `raw_text` and `excerpt` values exactly equal their page-scan
passages, all counts match, each pull quote is an exact source substring, all
five rows remain verified without confidence or review flags, and the
`CLIP-00081` note points to `CLIP-00080`. The merged five-test run covering the
three prior newspaper batches plus the directly observed HuffPost dates also
passes. The newspaper completeness gate now fails only on `CLIP-00085`
through `CLIP-00088`. The CSV remains 1,028 records by 38 columns with its
CRLF record boundaries intact.

### Batch 05 page-image call ledger

The review made four exact Google Drive searches for
`The_Griffin_Daily_News_2008_05_31_A4`,
`Sarasota_Herald_Tribune_2008_06_03_49`,
`Connecticut_Post_2008_06_05_11`, and
`Sarasota_Herald_Tribune_2011_02_08_25`. Each returned the mapped OCR file
and source folder. The reviewer read each source folder and its `pages`
folder, fetched the four page images as raw files, and downloaded the returned
signed attachments. All 16 Drive operations and four signed-file GET requests
succeeded; none changed Drive or account state.

| Record | Drive page image | Bytes | SHA-256 |
|---|---|---:|---|
| `CLIP-00085` | `1L0lVnLn7agEjiyQ33V_m10-Nw_EUm8GG` | 3,937,023 | `7f65ac25aaa4d23752aa1e1cbc58c5047a9d9d0055cf0d38d23abbadcf13faca` |
| `CLIP-00086` | `1Ba8pvkRP3LQhj51eoojdOknnERjXAR8g` | 3,666,701 | `01afd76043283fb376af18eb02f1b2b02ef08d7941d9af5637b2bfe50be42cab` |
| `CLIP-00087` | `198jGDRpAdYrnS-xMkhzQI0iBB72nMupk` | 4,481,772 | `5dcfae6cfa492870955f8cf7792ed095c605dfe8dbc80096c093f32800f17a4c` |
| `CLIP-00088` | `17qX1YCwrXbjUdgFolypikXJAM0DgUWdJ` | 3,853,211 | `d146d494cea69c6b56cfe7ed00029049254ad048d82c21757559b431f7760d57` |

The `CLIP-00085`, `CLIP-00086`, and `CLIP-00087` scans are syndicated
versions of Kathleen Parker's column. Each identifies New York University
journalism professor Jay Rosen and prints his rollback-theory description of
the Bush administration's effort to make the press less important inside the
executive branch. The `CLIP-00088` scan is a separate AOL–HuffPost article.
It identifies Rosen as an early HuffPost critic, prints his Barry Diller
prediction, and states that his take turned out to be wildly wrong.

The four-record batch 05 scan packet is 4,119 bytes with SHA-256
`d100ef8a595466d56efbffd6711fb82fc3e685d611545bfbaa75e7477b5eb6d9`.
It also preserves the exact 67-, 67-, 67-, and 56-word source passages
transcribed from the page scans; independent token recounts match.

### Batch 05 K2 and source reconciliation

K2 session `session_0067576b-05d0-41aa-b73c-2f1233c072a7` reviewed only
`CLIP-00085` through `CLIP-00088`. It validated the page-scan packet hash
above, exited zero, changed no repository files, and recorded no external
calls. Its final artifact hashes are:

- `source-review.json`: `53d80409f6734c18e8331f68cc72ce32136cdc1f85abac689aef41b8715a4450`
- `proposed-corrections.json`: `3fae1ff926b51438553e49df1ee9f45bb3e873c0a0d91ad16aeaf848e20bfbcb`
- `external-calls.json`: `0568ab55d01c45cfc1a76b4b8e64f4e7239e23fcab86c9d06c3ef55745de5612`
- `report.txt`: `f9403385be124c1191be96d4d1069508023c0f6650458f5283a080db8876f655`
- `stdout.log`: `5d3f87fa75efc3612581e198752bba09b79acd2e16c737cd6ec8651744e9075a`
- `stderr.log`: `b0fde62ce766357a2818b86bc563b4f9a07905c0fd3912d3e7522d5692d7ed85`

K2 correctly matched the three syndicated Kathleen Parker passages, found
the `CLIP-00085` summary's grammar problem, identified the unrelated
`CLIP-00086` cross-reference, and flagged the `CLIP-00088` summary for
reversing the source's conclusion. Its proposed 36-word `CLIP-00088`
fragment and review disposition were rejected because the page image visibly
continues through the full 56-word paragraph and states that Rosen's take was
wildly wrong. Its proposed low-confidence flags for the Parker rows were also
rejected because all three full scans print the exact 67-word passage.

The CSV-only repair uses those exact 67/67/67/56-word source passages in both
`raw_text` and `excerpt`, with direct-substring pull quotes and source-backed
summaries and notes. `CLIP-00086` now points to matching `CLIP-00085` and
`CLIP-00087`; `CLIP-00088` retains `author=Unknown` and no unsupported
valuation claim. All four remain verified without confidence or review flags.
The focused six-test run covering all five newspaper batches and the observed
HuffPost dates passes, as does the archive-wide newspaper excerpt and word
count gate. The CSV remains 1,028 records by 38 columns with its CRLF record
boundaries intact, and the CRLF-aware diff check passes.

### PBS and YouTube transcript recovery call ledger

The primary reviewer made read-only source calls on 2026-07-23 for
`RECORD-00728`, `RECORD-00778`, `RECORD-00779`, and `RECORD-00780`. A normal
fetch of PBS's exact transcript URL failed with a Unicode-decoding response;
the related profile URL was blocked by the browsing safety filter and was not
bypassed. A Firecrawl scrape of the exact transcript URL then succeeded. The
30,986-byte official PBS markdown capture has SHA-256
`06f55b3d3c38f8fa73f30c888c8e0974e30bd185507220c8073937464a65a1ce`.
A deterministic extractor produced a 4,383-word transcript with 26 Bill
Moyers, 20 Jay Rosen, and 13 Glenn Greenwald speaker turns:

- PBS transcript JSON: `6da9fe294b63fc141f76783df6dc413d50e2cae31af18d17f7277672053177c0`
- PBS transcript text: `26382e532d927d60e8d87aa279c8aebcb5df77d6b36d2d5d58de878c4a9dc704`
- PBS extractor: `887f68a927ae8f5c9e2588f81b76ca10d29ec9ccef605781a2d269f06b980da7`

Three `yt-dlp --list-subs` calls found no manual subtitles and did find
English original automatic captions. Three caption-and-metadata downloads and
three audio-only downloads then succeeded. The captured source artifacts are:

| Record | Video | Source caption JSON SHA-256 | Metadata SHA-256 | Audio bytes | Audio SHA-256 |
|---|---|---|---|---:|---|
| `RECORD-00778` | `fGHw9GyoUXs` | `4ff89515f0ebbec34eef105f202ba75d80de61dc07b23c7b36496aca9883af84` | `8c2470466a2371e85b100ef695523d5b2c753789083cefeee9a6da5e8b48cc66` | 14,709,203 | `29c401808bd31845443d3a1f6495ba1d99de7bcf97cbcafb6778acd609c77429` |
| `RECORD-00779` | `EqcaBhlPs9k` | `c842395b8f8272621a8fc21c5de7a81649a7bc92d8246b5971a6134169821d0d` | `7a4f492a0eca946ee9486fafd654b3e9a1a865f2976b58866da6c45e8a18508e` | 7,586,570 | `1dd90ffb1c79cc565389b4a2b8da8a1847b4793ce357055a1590ccc7f8ce1d94` |
| `RECORD-00780` | `WlaElJ6a-1s` | `6d7c1fe1226ed2d2c288260c9f419cc644501d57851ebab51ca7482f1e16cda3` | `6560d13c1d0d97a118304e8ee540ad6750330e111b23b8764e68d5c136b20794` | 13,460,250 | `ff484e420a228a1dcc2a23d2fca0e02d262f2490d8522189a7afeac449384f4b` |

The source-caption extractor, SHA-256
`05d380b05f78616ff0929521c3945db04d83d8ff4d52af4d5eb784350283d66b`,
preserved timestamps and produced the following deterministic artifacts:

| Record | Events | Words | Transcript JSON SHA-256 | Transcript text SHA-256 |
|---|---:|---:|---|---|
| `RECORD-00778` | 420 | 2,644 | `a998232ecca29bbe745d7e0611393e12e9ca45c29f425c36232a4c6e0b996f14` | `fa3b16de2e6caa28526818691000ae5319d09c119a3f870d2a3bf4f15d4c34bd` |
| `RECORD-00779` | 180 | 988 | `079f20923daa4866cce63034b4a559efb6058654936768cc13dda3c76474d330` | `8e2ffa8f445ae7c74e6f537649352c6d0b3558b9916585fcaa29e338a7fae9df` |
| `RECORD-00780` | 354 | 2,491 | `15543564b418584ebd3f1015759de6cdfda955a11d76cf9c291a34f296221eb3` | `229847e4a7b169e98dcb7a72ccf2ab93010391e8d6de9cb60c07a06baa4be25f` |

OpenAI Whisper `turbo` was run locally on CUDA against all three captured
audio files. The RTX 4080 Super completed the sequential run in about one
minute; no external model or API call was made. The transcription script has
SHA-256
`ce0e5c2181aab76af176a7993572ff38c12545fcf56453a4e9400929a727f477`.
Its stdout and stderr ledgers have hashes
`c152bcc1d5723f553691fb1701d6aa4a2160e02a5bc9b3bd0b8c17e65084e2be`
and
`c11212bbc16126ff4f1c915e7bc0b028e055d0ac63f11a6c8c60ed7c535bc6d9`.

| Record | Whisper words | Whisper JSON SHA-256 | Whisper text SHA-256 |
|---|---:|---|---|
| `RECORD-00778` | 2,604 | `c7da6cfbd6dbc3385a6105d3313f4151061624ae07d7a4f17a4867f9a3452147` | `43fcacf2660fd2ee09738eb034a7d6f2e025095a98b939356e724e69cd1ad6a9` |
| `RECORD-00779` | 1,078 | `f02aa14021f7c5e44d709e98bd4a15774b8a5ca0ebd99562e8665f3bcba07de0` | `590c3ee20f80366ee27c63db3d3a017b82a915a5952b21bd22a3641f721eb5b0` |
| `RECORD-00780` | 2,428 | `6871751520fb4b658939e686e08fbec4692d5a2c2a00b3120289eed3ae0fa8f1` | `d27e78c0e36e42e1e5b62a6c0b50cb26b5bacf3c8b6c1b5f95e2c07e78a7bb57` |

Independent comparison found strong source-caption and Whisper agreement for
the TEDx and ABC videos. Both ABC transcripts end with `improve the way` at
the 852-second media boundary, proving the source video itself ends mid-thought
rather than a caption download being truncated. The World Bank Whisper output
becomes a high-compression repetition after 479 seconds and is rejected for
that tail; the source captions continue coherently through Rosen's closing
thanks at 523.9 seconds. The captured automatic captions remain source
evidence rather than silently corrected text. No transcript, copyright,
permissions, or archive field has been changed pending source reconciliation
and a rights/field-placement decision.

### 2003 PressThink source retries

The primary reviewer retried the three unresolved archive.pressthink.org URLs
for `RECORD-00669`, `RECORD-00670`, and `RECORD-00671` through Firecrawl on
2026-07-23. Each read-only call returned a short Not Found page. The captured
files have SHA-256 hashes
`b413501d37e252e40a063b6641292cb439b99ab48ad0705bc0406d60457aabcf`,
`53f31351561beb487f8d34e0edaf6ef421bdd87440c6610623f8aaa14798d93b`,
and
`9cdc004622ad24b5f2df21dd5fb14142e0aaaaea6dc1a02208c7acab72d6b98b`.

Exact-title web searches for `Introduction to PressThink (Ghost Version)`,
`Solidarity and Ashcroft`, and `The Reagans and CBS` found no direct primary
copy. Two current PressThink WordPress API searches also returned no missing
post. A read-only fetch of the current PressThink FAQ did, however, find an
official link to the missing Introduction and its quoted statement: `I try to
discover the consequences in the world that result from having the kind of
press we do.` This corroborates `RECORD-00669`'s identity and relevance but
does not recover the full post. No search result or secondary discussion was
adopted as full-text evidence.

### 2011 and 2015 gap-recovery K2 review

K2 session `session_ec6fed4d-e206-4399-9503-d635fd162fd3` reviewed five
source-backed PressThink candidates from packet SHA-256
`47781d00084a2a2add8d08b181e05864797f96cedca1e7bd3451128613540206`.
The prompt and runner hashes are
`3b90c46946dd21f7902c6e54ed009df9c0e1375234c40ffa7d531dba616d62b7`
and
`4a8f4420a6a00eec3b65b5b879f014cc60bc5c493e2084094e6ddf3efa37bd3d`.
The process exited zero at the scheduled checkpoint, allocated no archive IDs,
changed no repository files, and left every proposal unverified and in review.
Its final artifact hashes are:

- `source-verification.json`: `2718abfac7b4d12fe7a07c9bfe49c15e7a3c6a705f8997546fc6f86430d16d40`
- `field-provenance.json`: `f45f0c1a3b133c45a4f85808cca4deace8fba5bc2b38ba731b47f06f8bb8bf41`
- `proposed-rows.json`: `e3260fad1a52f5b323dc88aafffee05490a2ed021a8183083c08564ed1967fd4`
- `duplicate-review.json`: `471012744de5653a5114131428f55f641a044f8664653055aec6864191730686`
- `external-calls.json`: `a35699bdbcdd7421471ae011eba76229664cb298246518bb3690ca7866287b08`
- `report.txt`: `f832a1f0e1f6436a1cdfcb6e3a38a4f79d331964bed1d1b1ef0e61a22a6d27f7`
- `stdout.log`: `9059a7d6c1c0811c86cd08a2f290701773b64700831f15f586555737534c2c4d`
- `stderr.log`: `f8541c1f7d5a56f2ef9e2567547c2eb71e15bb351e72eec097497cb06476992e`

The worker recorded five external GET requests, one to each official
permalink. All returned HTTP 200 between `2026-07-23T07:02:51Z` and
`2026-07-23T07:02:54Z`:

1. `https://pressthink.org/2011/04/what-i-think-i-know-about-journalism/`
2. `https://pressthink.org/2011/09/if-he-said-she-said-journalism-is-irretrievably-lame-whats-better/`
3. `https://pressthink.org/2011/12/the-citizens-agenda-a-plan-to-make-election-coverage-more-useful-to-people/`
4. `https://pressthink.org/2015/01/a-brief-banking-theory-of-newsroom-trust/`
5. `https://pressthink.org/2015/03/full-stack-credibility/`

The accepted finding is that all five candidates exist at their official
PressThink URLs and that the packet titles and local publication dates match
the official pages. No current archive row has an exact URL or normalized
title match. The source packet also directly supports the Amanda Michel and
Jay Rosen co-byline for the Citizens Agenda post. If approved and assigned
IDs, the three 2011 posts and two 2015 posts would lift those authored-row
counts from 24 to 27 and from 5 to 7, clearing the current neighbor-median dip
thresholds.

Primary reconciliation rejects four parts of the generated proposal packet:

- The worker script hard-codes a claim that a WordPress user endpoint returned
  403, but the external-call ledger contains no such request. That claim is
  unsupported and is not accepted as provenance.
- It labels `Jay Rosen` as a source-observed copyright holder based on
  authorship and site practice. Authorship does not establish legal ownership,
  so copyright, license, and permission values remain pending rights review.
- Its proposed word counts of 1,229, 3,085, 2,541, 1,487, and 1,384 were
  computed from a different HTML cleanup than the proposed `raw_text`. Direct
  Unicode-regex recounts of that proposed text are 1,205, 2,995, 2,494, 1,461,
  and 1,327. The larger values are rejected.
- Four source confirmations compare only a 500-character normalized prefix;
  the fifth prefix diverges while total length differs by 28 characters. This
  is enough to corroborate candidate identity, not enough to approve every
  byte of the proposed full text without a final source-text comparison.

The five candidates therefore remain proposal-only. Permanent ID allocation
and the canonical rules for rights, not-applicable fields, and source-text
normalization are one-way stewardship decisions; no rows were inserted while
those decisions remain open.

### Bluesky blank-source reconciliation

An existing regression identified three social rows with neither `raw_text`
nor a documented non-text exception: `BSKY-00719`, `BSKY-00873`, and
`BSKY-01381`. A source-recovery subagent checked their primary ATProto records
on 2026-07-23 and changed only `data/social_posts.csv`.

`BSKY-00719` and `BSKY-00873` are Jay Rosen posts whose source records have
empty text, one image each, and blank alt text. Their rows now retain blank
`raw_text`, carry the source URI, record CID, image-blob CID, and blank-alt
fact in `notes`, and use `verified=TRUE`.

`BSKY-01381` was already titled and attributed to Coach Finstock, but its URL
and copyright cell incorrectly named Jay Rosen. The Jay-DID record lookup
returned 400 and the Jay-URI post lookup returned no post. The same rkey under
Coach Finstock's resolved DID returned the source record: empty top-level text,
an external thumbnail, and a quoted-record embed. The quoted record has text,
but that text is not Coach Finstock's top-level text and was not copied into
`raw_text`. The row now uses Coach Finstock's source URL, aligns its copyright
cell with the source author under the existing social-row convention, records
the source and quoted-record URIs, and uses `verified=TRUE`. This correction
does not make a separate license or permission claim.

The read-only external call ledger is:

| Time, America/New_York | Request | Result and verdict effect |
|---|---|---|
| `2026-07-23T03:03:11.636-04:00` | `public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=jayrosen.bsky.social` | HTTP 200; confirmed Jay Rosen's DID. |
| `2026-07-23T03:03:24.455-04:00` | `com.atproto.repo.getRecord`, Jay DID, rkey `3lt3di4ysbc2m` | HTTP 200; confirmed empty text, one image, and blank alt. Response SHA-256 `9c4fc8e64afc5150b1bb367e6f501eb59a311e07f9785ca6e201fe0e81809071`. |
| `2026-07-23T03:03:24.634-04:00` | `com.atproto.repo.getRecord`, Jay DID, rkey `3lrqwe3succ26` | HTTP 200; confirmed empty text, one image, and blank alt. Response SHA-256 `82d6094c16574ddf323f5a2b921402de1dda764717f0dedd26b29bf573a05719`. |
| `2026-07-23T03:03:24.752-04:00` | `com.atproto.repo.getRecord`, Jay DID, rkey `3lmui3e56ls27` | HTTP 400; disproved the stored Jay-profile identity. |
| `2026-07-23T03:03:35.854-04:00` | `app.bsky.feed.getPosts` for the proposed Jay URI | HTTP 200 with no post; response SHA-256 `a14592560126042a799e0da2b44a5dc4c6aafbfb5d350ae9e44bea99d5fd8e5b`. |
| `2026-07-23T03:04:06.621-04:00` | `app.bsky.actor.searchActors?q=Coach Finstock` | HTTP 200; discovery only, with no decisive exact result. Response SHA-256 `6bed92ec230ccaa310c3799ab4ccef11e90c9ccece652ecf987ad722f10ce61b`. |
| `2026-07-23T03:04:07-04:00` to `03:04:22-04:00` | Four web searches for the Coach Finstock Bluesky profile, Jay-profile variant, exact rkey, and name plus platform | Located a candidate profile for primary-source checking; no search result was accepted by itself. |
| `2026-07-23T03:04:23.646-04:00` | `com.atproto.repo.getRecord`, Coach Finstock DID, rkey `3lmui3e56ls27` | HTTP 200; confirmed the empty-text GIF/quote record. Response SHA-256 `a346d57e7954f81aa4908c7f9ea82d5f95c19a8c83655b9474c88da193254470`. |
| `2026-07-23T03:04:54.350-04:00` | Same record with `repo=coachfinstock.bsky.social` | HTTP 200 with the same response hash; confirmed the handle. |
| `2026-07-23T03:04:54.535-04:00` | `com.atproto.repo.getRecord`, quoted URI `did:plc:2tv6knjkuuxxsr2gmumdmw2u/3lmt63y52rk2j` | HTTP 200; proved that the quoted text belongs to the embedded source. Response SHA-256 `29f03f747de2ff28d03442aef6062f059d94f33fd378c7ad1317f294d65f3646`. |
| `2026-07-23T03:05:47.130-04:00` | `com.atproto.identity.resolveHandle?handle=coachfinstock.bsky.social` | HTTP 200; confirmed DID `did:plc:izxpomdyri45gzhppiiyattq`. Response SHA-256 `d3e9de77e0b1f813df1b21b339ca43560bd5a16bc2868db8dd4f5b6fef92858e`. |

Independent comparison confirms that only `verified` and `notes` changed for
the first two rows; only `url`, `copyright`, `verified`, and `notes` changed
for `BSKY-01381`. The source-content exception test and the existing
`BSKY-00262` replay test pass, the main validator reports no errors, and the
CRLF-aware diff check passes. The final social CSV is 25,800,402 bytes with
SHA-256
`9ddf9b27744e238b5b04a474e52581f4272548531b38ecb64dc0835c0fb44ae0`.
All social rows now retain source text or a documented image-only exception;
explicit per-row verification remains a separate 29,743-row stewardship
queue.

### Thread-container source-text repair

The ten `THREAD-00001` through `THREAD-00010` archive containers referenced
122 canonical Bluesky rows in `data/social_posts.csv`, but every member
`content` value in `thread_data`, every container `raw_text`, and every
container `excerpt` was blank. A regression was added before the repair and
failed on `THREAD-00001` as expected. A data-repair subagent then copied each
member's exact local `raw_text` in stored order, joined the member texts with
two LF characters for the container `raw_text`, used the first member text as
the `excerpt`, and set `word_count` to the sum of the member-row counts. No
external request was needed because the canonical member rows are the direct
source for these derived containers.

Independent comparison with `HEAD` confirms that only `word_count`,
`excerpt`, `raw_text`, and `notes` changed in each of the ten thread rows. In
`notes`, only `thread_data.posts[].content` changed; post order and all other
JSON values were preserved. The resulting member and word counts are:

| Thread | Members | First member | Word count | Raw-text SHA-256 |
|---|---:|---|---:|---|
| `THREAD-00001` | 33 | `BSKY-00993` | 1,330 | `2c09e5ad0f0a8551948d6ce3141a319c12714482e1040badac6296afdd01de08` |
| `THREAD-00002` | 26 | `BSKY-01325` | 1,234 | `b3a895241f1234a21ab48d53cc6909265d4a0f670191461271a111af771e65a9` |
| `THREAD-00003` | 14 | `BSKY-02571` | 566 | `da527169d3d20be018f023e78ef3a0807c3be02677a7f5b6f020e99688fa3b87` |
| `THREAD-00004` | 10 | `BSKY-02467` | 491 | `f0713a4701f140757d17c457a4ed5abdea01af2895ce1c2d7bab7fac5547a61b` |
| `THREAD-00005` | 9 | `BSKY-02844` | 407 | `c6043a8823ddac7b583036793d50d22ac7883b266daeea30ec13cd4511d4b220` |
| `THREAD-00006` | 9 | `BSKY-02905` | 464 | `c6e11024f0f45f2d9176444ed2947237f0a13472b1d0e7c67d428b3d670d23fd` |
| `THREAD-00007` | 7 | `BSKY-02797` | 345 | `6f9dc5e1f30e31b8f2c367bf2b6b38d7c16ab80333192c2b250200b94d9be7f6` |
| `THREAD-00008` | 6 | `BSKY-02198` | 224 | `4cedc144f869b55ae83f2891edff686a72e1aad149847304f749bdb4a84b4ad6` |
| `THREAD-00009` | 4 | `BSKY-00585` | 169 | `7f13de0868e566793ed49bfd9b32b33207a5ba0862558310e439a2dfe93f9526` |
| `THREAD-00010` | 4 | `BSKY-02377` | 174 | `292fe74e0f7eb18eed2d60539096784cf8fa814367c94a9e51e0113df8bf4383` |

The named regression passes, the main validator reports no errors, the CSV
remains 1,028 rows by 38 columns with its CRLF record boundaries intact, and
the source-preserving diff check passes when intentional trailing spaces in
the Bluesky source text are excluded from whitespace diagnostics. The final
archive CSV SHA-256 at this checkpoint is
`9a93e82f4ab9863432495316579e5d82e671918495969004ab6842b6cc83b53a`.

### Published social-sheet source recovery

Repository history shows that the first public release read from a published
Google Sheets workbook. A read-only recovery on 2026-07-23 established the
correct social tab and proved that the locally retained import is an exact
copy of the published sheet:

| Time, America/New_York | Request | Result |
|---|---|---|
| `2026-07-23T03:20:07.550-04:00` | Published workbook CSV with `gid=0` | HTTP 200, 128,599 bytes, SHA-256 `5391297f3056432ac385fa96c41475b7eb5ed3b20520e429afac15c13ab4f7c1`; header `id,url,processed_on,Notes` proved this is `urls_to_scrape`, not the social source. |
| `2026-07-23T03:20:24.970-04:00` | Published workbook HTML index | HTTP 200, 54,073 bytes, SHA-256 `18fa5130c48003595e8793028a421f6dd82ceb921c3b3d9c7d09b2578df5d839`; embedded tab metadata mapped `social_posts` to `gid=668455624`. |
| `2026-07-23T03:21:06.722-04:00` | Published `social_posts` CSV with `gid=668455624` | HTTP 200, 24,234,899 bytes, 29,187 rows, SHA-256 `0f3f041b6901b5ac8a9bb69a49131df57ee850cb13a19fdd1e357169115ac851`. This hash exactly matches `data/social_import/rosen_social_posts.csv`. |
| `2026-07-23T03:21:38.271-04:00` | Published workbook `log` CSV with `gid=667142328` | HTTP 200, 46,217 bytes, 501 lines, SHA-256 `32e94b71a7031aea1f85a8b561bc279ff94156a7b1fc423977f89722d9809da3`; the log concerns article URL processing and supplies no additional social-import provenance. |

Of the 29,187 published-sheet rows, 29,130 IDs remain in the canonical social
CSV. Their `author`, `url`, `publication_date`, `publisher`, `platform`,
`raw_text`, `word_count`, and `pull_quote` fields are exact matches. The only
expected source-field differences are the corrected `BSKY-01381` URL and the
source-backed `BSKY-00262` excerpt. Fifty-seven published rows are absent from
the canonical file: 55 duplicate Bluesky posts removed during deduplication
and two Twitter rows authored by accounts other than Jay Rosen. The current
file also contains 617 later backfill rows.

This recovery establishes chain of custody for the historical import but does
not, by itself, prove that every sheet row matches its platform source. Direct
ATProto and Mastodon replays remain the preferred verification path; the
Twitter rows still require a platform or preserved-export evidence strategy.

### PBS and YouTube transcript K2 reconciliation

K2 session `session_18716490-5692-4e45-9633-ca44c0436eb0` reconciled the
captured PBS and YouTube evidence for `RECORD-00728`, `RECORD-00778`,
`RECORD-00779`, and `RECORD-00780`. The prompt and runner SHA-256 values are
`e3e3e847df9d862200e2eab9915da23e8905c304dba960de76fa43b296d7c1fc`
and
`4a8f4420a6a00eec3b65b5b879f014cc60bc5c493e2084094e6ddf3efa37bd3d`.
The process exited zero, made no repository writes, and used only the already
captured evidence. Its final output hashes are:

- `source-verification.json`: `6136ca742385773806093f2940cc08df2995c4ab76b88364ac3b3081f5f74945`
- `transcript-reconciliation.json`: `cf0e01152bf13a9020d3a992fdafa52251a062232a7cc27f51d5134eee916c23`
- `field-provenance.json`: `879462087e934556c3e72185ea89a9030edb04440bf47b4612d5cd1ee7013778`
- `proposed-field-updates.json`: `8f8ce0405a9fb6d36f1008f785b198142ad3e176d053a688c0ad0578ad5dbbd7`
- `external-calls.json`: `fdbbe2dfdee1a9097abcdda85fdf63f4c348fc6620b07c21cdb975acd74e13ad`
- `report.txt`: `5e29c2c051bef81f9f9898b739ea0e74d78b08eec9cc3880c81776e18079d453`
- `stdout.log`: `ef1b51e9140d19385a444c65c3b95f1d14d9fe367ce4e5ee8a6eba45dbeabb6e`
- `stderr.log`: `e90b91a69339c744a67351a9792498b408e481a264a8ec6436ce46f1800a40a4`

Independent review accepts these source-backed facts:

- The official PBS transcript for `RECORD-00728` preserves its speaker labels
  and contains 4,389 whitespace-tokenized words.
- `RECORD-00778` has 2,641 caption words and a source duration of 1,114
  seconds. Its automatic captions and local Whisper transcript agree across
  the talk.
- `RECORD-00779` has 987 caption words and a source duration of 528 seconds.
  The Whisper output becomes repetitive after 479.16 seconds, so its tail is
  rejected; the source captions remain coherent through 523.919 seconds.
- `RECORD-00780` has 2,489 caption words and a source duration of 852 seconds.
  Both evidence paths end mid-thought at the media boundary, so the final
  phrase is retained as an explicitly incomplete ending.

The reconciled YouTube transcripts are exact copies of the deterministic
caption text except for one source-preserving paragraph break in
`RECORD-00778`; the PBS text differs from its deterministic extraction only
by one terminal newline. Full transcript placement, transcript links,
copyright, license, and permission values remain pending curator or legal
rights review. No full transcript was copied into the canonical CSV.

A failing regression was then used to apply only the accepted metadata.
`word_count` is now 4,389, 2,641, 987, and 2,489 for the four records in ID
order. The three YouTube durations are 1,114, 528, and 852 seconds. All four
rows use `needs_review=TRUE` and state that transcript placement and rights
fields remain pending review; `raw_text`, `verified`, and the rights fields
were not changed. The named regression and main validator pass. The archive
CSV SHA-256 after this repair is
`27b4d706d203518f694a0aea25d3784a2f7f722b9a68c828b67509f0e722d6b1`.

### Twitter source-replay pilot

A two-record pilot tested official Twitter/X embed surfaces as a possible
scalable source replay:

| Time, America/New_York | Request | Result and verdict effect |
|---|---|---|
| `2026-07-23T03:24:51.743-04:00` | `publish.twitter.com/oembed` for `TWTR-00001` | HTTP 200, 604 bytes, SHA-256 `ce6b0b333cf7fb5807ca3e304723df35befe192a8cc59050d7068dc30a8d7ee6`; confirmed Jay Rosen and the visible body `Thanks, John.`, but the embed omits the two leading reply mentions stored in `raw_text`. |
| `2026-07-23T03:24:52.182-04:00` | `publish.twitter.com/oembed` for `TWTR-26116` | HTTP 200, 1,010 bytes, SHA-256 `0654eedc54d5817333a9a03cd60db00ffd9146b8590311b10ae114413ab7f627`; confirmed Jay Rosen and all visible prose. The embed retains a `t.co` link while the sheet stores its expanded New York Times target. |
| `2026-07-23T03:25:13.201-04:00` | `cdn.syndication.twimg.com/tweet-result` for `TWTR-00001` | HTTP 200 with `{}` only, two bytes, SHA-256 `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`; supplied no evidence. |
| `2026-07-23T03:25:13.667-04:00` | `cdn.syndication.twimg.com/tweet-result` for `TWTR-26116` | HTTP 200 with `{}` only and the same hash; supplied no evidence. |

The official oEmbed route is useful for author and visible-body checks, but it
cannot alone prove byte-exact `raw_text` because reply mentions may be hidden
and expanded links are rendered as `t.co`. Any batch verifier must classify
those differences explicitly instead of treating them as failures or silently
normalizing them away.

The same pilot exposed one deterministic date defect. Twitter snowflake IDs
encode their creation time; converting each of the 26,114 IDs to
America/New_York reproduced 26,113 stored timestamps to the second after
allowing the sheet's unpadded hour format. `TWTR-26116` alone stored
`2024-10-31 10:39:00`, while source ID `1984269020305240436` encodes
`2025-10-31 10:39:35`. Its text also links to a New York Times page dated
2025-10-31, and the official oEmbed call above succeeded for that source ID.
A failing regression was added first; only `publication_date` was corrected.
The invariant now passes for all Twitter rows, the main validator reports no
errors, and the social CSV SHA-256 is
`28cca07bdf83e18a542e4cf27651d10628003f4a62861b2ce6941ad533a1c837`.

### `RECORD-00039` source recovery

The existing row pointed to YouTube video `xWyAMD0ng4U`, but its summary,
tags, pull quote, and `raw_text` described an unrelated episode of *The Pub*
with Adam Ragusea. A failing regression was strengthened before any data
repair so the row must match the named source and must not retain the
unrelated podcast text.

At `2026-07-23T03:33:22.988-04:00`, a read-only `yt-dlp` request captured the
public YouTube metadata and English automatic-caption JSON. The request
exited zero. The saved evidence is:

- `xWyAMD0ng4U.info.json`: 492,774 bytes, SHA-256
  `7bd281a09a1ba95ac1bf67deba7a904547727ee5ba993d65b6b20c0c3f082d32`
- `xWyAMD0ng4U.en.json3`: 501,556 bytes, SHA-256
  `a78e7329bdf1675ac6d99da17f13082b718bca3324e6bbd74b22ac3926003d18`

The official metadata identifies the exact title as `Disinfo Discussions: The
Role of News Media with Jay Rosen`, the channel and uploader as Aspen Digital,
the upload date as 2021-07-05, and the duration as 1,726 seconds. Its source
description matches the row's existing excerpt and says Aspen Digital
executive director Vivian Schiller spoke with Jay Rosen.

A deterministic local extractor, SHA-256
`05d380b05f78616ff0929521c3945db04d83d8ff4d52af4d5eb784350283d66b`,
processed 791 caption events into 4,325 words. Its JSON output has SHA-256
`da47ad66362b22561f67acb0a5302ee2090cdd8aab1f758787d53ba5e3391974`;
the plain-text transcript has SHA-256
`b1f1d63f6d73f8d8d5922a478520b5b1735b368acb9392a461c4d8fff57cffa4`.
The captions cover the view from nowhere, both-sides reporting, Donald
Trump's use of traditional newsworthiness, the truth-sandwich approach, and
the need for a more aggressively pro-democracy press. The exact caption
substring `we need a much more aggressively pro-democracy press than we have
now` is suitable as a source-backed pull quote. Transcript placement and
rights remain pending review, so the full transcript must not enter the
canonical CSV during this repair.

The failing regression was then satisfied by changing only `RECORD-00039`.
The title now matches the source; publisher is `Aspen Digital`; platform is
`YouTube`; word count is 4,325; duration is 1,726 seconds; and the summary,
tags, and pull quote reflect the captured interview. The unrelated *The Pub*,
Adam Ragusea, and Mercer University material was removed from those fields.
`raw_text` remains blank, `needs_review` is `TRUE`, and the note records that
transcript placement and rights fields still await review. `verified=TRUE`
and all blank rights fields were preserved. Independent verification confirms
1,028 rows by 38 columns, the named regression passes, the main validator
reports no errors, and the CRLF-aware diff check passes. The archive CSV
SHA-256 after this repair is
`75f577d93af55025c6a7631aad1593ceb0cc79f0beec13f6c340e9802de2f60e`.

### `RECORD-00613` source search

At about `2026-07-23T03:35:30-04:00`, three read-only web searches attempted
to recover the missing source for the record whose text begins `In this case,
the "real work of journalism" began`:

1. Exact-phrase search for `"In this case, the \"real work of journalism\"
   began" Jay Rosen`.
2. X-domain search for `site:x.com/jayrosen_nyu/status "real work of
   journalism" "What's next?"`.
3. Twitter-domain search for `site:twitter.com/jayrosen_nyu/status "real work
   of journalism"`.

The responses returned unrelated PressThink and book references, with no
primary tweet or source URL. This is a negative result only. The canonical URL
remains blank, and the record remains in the unresolved-source queue rather
than receiving a guessed URL.

### Bluesky attribution source audit

A read-only ATProto audit checked the 54 rows whose current author is not Jay
Rosen but whose URL points to a post under Jay Rosen's profile. The audit ran
from `2026-07-23T03:37:13.747-04:00` through
`2026-07-23T03:37:20.641-04:00`. It resolved `jayrosen.bsky.social` to
`did:plc:3t37x6vfigdzzp2gjcfnzlz4`, made three
`app.bsky.feed.getPosts` requests in batches of 25, 25, and 4, and then made
54 `com.atproto.repo.getRecord` fallbacks for the missing requested URIs.

The handle request and three batch requests returned HTTP 200. Every batch
contained zero requested post views. All 54 fallbacks returned HTTP 400
`RecordNotFound`. No direct source survives at the requested Jay-DID URIs, so
all 54 rows remain classified `unresolved_source_absent`; the audit proposes
no author, text, URL, copyright, or verification change. In particular,
copyright is not inferred from the stored author value.

Independent review confirmed that the packet enumerates the same 54 IDs as
the canonical CSV, all three ID lists agree, every proposed-update object is
empty, all timestamps retain their America/New_York offset, and the call
ledger contains the expected four HTTP 200 and 54 HTTP 400 responses. The
source CSV remained at SHA-256
`28cca07bdf83e18a542e4cf27651d10628003f4a62861b2ce6941ad533a1c837`.
The evidence packet under `%TEMP%\rosen-bsky-attribution-audit` has these
SHA-256 values:

- `audit.py`: `f24020712f1f9b3dd59c581817f58570f7da0e4888b8463c7bc53c7eee35b5fa`
- `source-records.json`: `91dbb200eb784871c2059eada3d2801494d044d114e2c6091c667372bd5db29c`
- `comparison.json`: `a48be5500ae4708a691ac1773f8848da3cc5de848fb20dda856b8221388afc3c`
- `proposed-field-updates.json`: `182fa4cdec30520c5d35965ef88a15e1d680a8710e2413dc16e4f2815ca7dabe`
- `external-calls.json`: `6dc314b65f444a9b9e0fd9b04e4c41d052fdd0f02c76afbbb8015b2f28ce78f3`
- `report.txt`: `be675f3d0f195c4bcae0e7046c2ef72dcd6f21231fe49b87d7164491f3bbefb8`

### Yale and MIT core-field recovery

At `2026-07-23T03:39:35.698-04:00`, a read-only `yt-dlp` request captured the
official YouTube metadata and English automatic captions for
`RECORD-00043`. The request exited zero. The evidence files are:

- `UFONrSIbB-k.info.json`: 493,545 bytes, SHA-256
  `64c02b61f39d725a16e2b29bf9e02eb24d57140f18035a474d090b5fea67ddd1`
- `UFONrSIbB-k.en.json3`: 888,824 bytes, SHA-256
  `fe9cca6704f2fa06861de9808e4497cd913c79cbe25fe93b44bbd3bdee714e64`

The metadata confirms the existing title, channel and uploader `Yale ISP`,
public availability, upload date 2020-08-02, and duration 3,137 seconds. A
deterministic extraction produced 1,412 text-bearing events and 7,626 words:
`UFONrSIbB-k.transcript.json` has SHA-256
`9047676f47c70f941cbd06217943e88d86076168a71a8f4f5f46f4192ea9a171`,
and the text file has SHA-256
`c429edcce5492db0b22b48210735a0dbc6e6def011bc711a6fa0f8b4e364b89d`.
The stored transcript contains 7,603 words and is not an exact normalized
match to this source capture, so transcript reconciliation remains pending.
A failing metadata regression was added before any row repair.

The source-backed metadata repair then changed only `RECORD-00043`:
publication date is now 2020-08-02, publisher is `Yale Information Society
Project`, platform is `YouTube`, duration is 3,137 seconds, era is `Trump Era
& Democratic Crisis (2016-2020)`, and `needs_review` is `TRUE`. The stored
transcript, blank word count, and every other content and rights field were
preserved pending caption reconciliation. Independent verification confirms
the named regression passes, the main validator reports no errors, and the
stored transcript's SHA-256 remains
`ffa79a29b55ebf6a92774d5ea8e4881ea700349a3de6597979f41d7a3fb82fbf`.
The archive CSV SHA-256 at this checkpoint is
`1f615205af5574b5cc0dd3ed0dedf0825427b57daf3b986f8f2ae9e083250d9e`.

At `2026-07-23T03:39:35.669-04:00`, a read-only request fetched the official
MIT Communications Forum page for `RECORD-00075` with HTTP 200. The HTML is
25,877 bytes with SHA-256
`3dd2fcbd5e8bdc883cb2628ba4dbc8299281729bd6e2c5d3dda224d14c59effb`;
the saved response headers are 510 bytes with SHA-256
`031be0c0b8c63155b257c8d19bc74a857896992e981083a27e06eb90552ceb0c`.
The page confirms the displayed title `Adapting Journalism to the Web`, the
date Thursday, April 5, 2012, Jay Rosen and Ethan Zuckerman as speakers, and
Katie Edgerton as the summary author. It labels its body as an edited summary,
not a verbatim transcript. A failing source-identity regression was added
before filling the missing publisher and platform.

The repair then changed only `RECORD-00075`: publisher is now `MIT
Communications Forum`, platform is `Web`, and the note cites the HTTP 200
capture, edited-summary status, and evidence hash. The source text remains
byte-equivalent at SHA-256
`c8d77c8e084e2536038455c53388c60348cd7942d72400e5edcbce6e7b58d330`.
Independent verification confirms the named regression passes, the main
validator reports no errors, and the CRLF-aware diff check passes. The archive
CSV SHA-256 after this repair is
`f9692b81538e3683c103a4a4b2eef5a2c34c5dbd896d425a2abc505dd6ca4e8d`.

### HuffPost K2 source-verification pilot

A read-only K2 worker using `kimi-code/kimi-for-coding` checked
`RECORD-00804` through `RECORD-00808` against their official HuffPost pages.
The prompt and runner SHA-256 values are
`175f43cc301e8d9398da53d78808fb8466b5e00243b639bd9c5a0b4510700953`
and
`4a8f4420a6a00eec3b65b5b879f014cc60bc5c493e2084094e6ddf3efa37bd3d`.
The source requests were:

| Actual request time, UTC | Record | Result and saved evidence |
|---|---|---|
| `2026-07-23T07:31:13.401454+00:00` | `RECORD-00804` | HTTP 200, 428,941 bytes, SHA-256 `beacb9d906cb83dd59aebed6cdc432633dac2cc1595fc16b1db6ca6766deaf6e`. |
| `2026-07-23T07:31:14.645999+00:00` | `RECORD-00805` | HTTP 200, 426,526 bytes, SHA-256 `9fc14f0eebbc9cf50542e71df11d163f0d334535dbe0506b42e19a30ab60d21a`. |
| `2026-07-23T07:31:16.005618+00:00` | `RECORD-00806` | HTTP 200, 412,196 bytes, SHA-256 `90c9d9b5644dbda23c28e1819c8a142e57b33a95add668e59ebf837f51d468ae`. |
| `2026-07-23T07:31:17.509502+00:00` | `RECORD-00807` | HTTP 200, 442,508 bytes, SHA-256 `ce4632458a00d525a5c92f407a146f0a30bd50320c6157b02f6026d8189446cf`. |
| `2026-07-23T07:31:19.006872+00:00` | `RECORD-00808` | HTTP 200, 430,817 bytes, SHA-256 `48758fac3372599a701b7054808a2f3b30c9179736ee143f1796f1fe54bf8302`. |

The actual request ledger is `fetch_log.json`, SHA-256
`5a50d61a15fb4ce47eaff192c72dce9c249f00335664ebe959625e0793e6c667`.
K2's required `external-calls.json` has a provenance defect: it records the
later output-generation time instead of each actual request time and omits
response hashes. The table above combines the actual ledger timestamps with
independently computed evidence hashes; `external-calls.json` must not be used
as the sole request ledger for this pilot.

The six requested packet outputs parse, cover exactly the five requested IDs,
and include all 38 CSV fields in header order for every record. Their SHA-256
values are:

- `source-verification.json`: `a6d7105514552a9058dbe81a22015a3820a155f4b4ffaaa5812372bbf3995330`
- `field-provenance.json`: `30af9ba2b45c5e4573b97716a19f9a56acb6b02b7078f0d9cfe69b3352c53afc`
- `proposed-field-updates.json`: `428e3dcaac8a6c4c3371e8768dd8024976b67bdd9d7d54af288452c3145e8d6d`
- `body-comparison.json`: `b782d0eaeb5ab7a7f49ce81f55225dddc016f5ef90d827cb2ff9ef7b8bf500d7`
- `external-calls.json`: `658f49c55cf839c2316df6011e2e42123a7be3c74156d08184b2eabe109ab3d8`
- `report.txt`: `83fb7a751eb126c3ca790ecb18c055b2a2a2011635aaf0e041eec22f6d38fd1c`

Independent comparison confirms exact agreement on title, author, canonical
URL, publication date, and the material article body for all five rows. After
markdown-link and emphasis removal, every current body token appears in source
order; the remaining source-only spans are HuffPost topic and correction-tip
page chrome. Current whitespace word counts remain correct at 1,315, 1,710,
831, 2,914, and 1,968. All five existing pull quotes are source-backed after
deterministic normalization.

The proposed summaries accurately describe the captured bodies and are
accepted for a failing-test-backed repair. The source correction from `In an
presidential election` to `In a presidential election` in `RECORD-00805` is
accepted. Truncating `RECORD-00808` to its first two source sentences is also
accepted. K2's proposed `RECORD-00807` excerpt is rejected because it still
joins the opening paragraph to a later `Press rollback` paragraph across a
long intervening blockquote. The repair will instead retain only the first
three contiguous source sentences, ending at `briefings prior:`. Once those
source conflicts are corrected and the summaries are reviewed, no material
source conflict remains, so the local repair will use `verified=TRUE` and
`needs_review=FALSE` for all five.

The failing source regression was then repaired by changing only the five
target rows. All five summaries now match the reviewed source descriptions;
the three excerpt corrections above are exact contiguous source text; and all
five rows now use `verified=TRUE` and `needs_review=FALSE`. Each note records
the verification date and its saved HTML SHA-256. All five `raw_text` values
and their word counts were preserved. The non-target-row byte hash remained
`c871174b74a998fae30bc2f9304b433951f16be56adbd3a97e6d2c990bbf3f1f`.
Independent verification confirms the named regression passes, the archive
validator reports no errors, the file remains 1,028 rows by 38 columns, and
the CRLF-aware diff check passes. The archive CSV SHA-256 at this checkpoint
is `f8b0dcbcc3d0ada15ccd740737601589fe79c0c0481e386085abd83901959e4c`.

K2 printed its final report at `2026-07-23T03:53:53-04:00`, but its wrapper
and CLI process remained open after the required artifacts had been stable
for more than twenty minutes. At the scheduled `2026-07-23T04:10` checkpoint,
the idle wrapper and K2 process were terminated, followed by a stale `find`
pipeline they had left scanning the local filesystem. This was not a clean
worker exit. The preserved standard-output log is 2,918 bytes with SHA-256
`14086bcb6ae4a455ffeca537f6824799bbcee2d2c4066c53ae3c5c7a85008bc8`;
the standard-error log is 238,328 bytes with SHA-256
`ab1c867bfe4fd69ea4a1f2237df928dbe5f1aa3538aa79d8a1f964bda81f59e0`.

### Bluesky thread relationship recovery

A proposal-only packet mapped all ten `THREAD-*` archive containers to
existing canonical entities. Its 83 relationships use exact source excerpts,
the registered Jay Rosen entity `P0005` as source, and only existing target
IDs. The packet SHA-256 is
`962a07eb5cf50d2d9ae7f3d5d36a2af897ff62c6c58068fdf328680f5cad5495`.
Independent pre-import review confirmed the 83 source and target identities,
relationship meanings, allowed types, exact excerpts, provisional IDs,
confidence values, and absence of ID or semantic-key collisions. A focused
failing regression was added before import.

The 83 rows were appended without changing the prior 2,031,518-byte prefix.
Per-thread counts are 26, 16, 7, 5, 4, 11, 2, 8, 1, and 3. Independent
post-import verification confirms all 83 entity IDs still exist, every excerpt
is still an exact substring of its thread source, and the focused regression,
archive validator, and CRLF-aware diff check pass. Relationship count rose
from 10,646 to 10,729 and archive records with entity coverage rose from
784/1,028 (76.3%) to 794/1,028 (77.2%). The relationship CSV is 10,729 rows
by 10 columns with SHA-256
`bf5c5c9d694ab9182f6d58b68b30243b2defd8c0b2d359ee3407bd5a17ef232e`.

The whole-file audit also found an older semantic duplicate outside this
packet: `RECORD-00854`, source `P0600`, relationship `Criticizes`, target
`C1235`, appeared as both `REL_024` and `REL_042`. A focused failing regression
confirmed it was the only duplicate semantic key. `REL_024`, which paraphrased
the same edge, was removed; `REL_042`, which contains Walter Pincus's direct
source quotation, was retained unchanged. Independent verification confirms
zero remaining semantic-key duplicates, the focused regression and validator
pass, and all unrelated bytes and row order remain unchanged. The relationship
CSV now contains 10,728 rows with SHA-256
`7e419c8f80784e2a4a3db41b477e2634fb0f93673c3d7b0e4ada5da88a52eb6d`.

### `RECORD-00614` composite-source audit

Read-only exact-phrase and domain searches between about
`2026-07-23T03:54-04:00` tested the stored 2017-era interview text, its title,
its opening Rosen answer, the Sinclair/Tribune station counts, the claimed
Tom Engelhardt framing, and the stored Andrew O'Hehir attribution. Searches
returned the official 2004 Jay Rosen article and independent 2017 Sinclair
coverage, but no primary or secondary copy of the stored interview and no
support for the Andrew O'Hehir/date combination.

At `2026-07-23T03:54:59.283-04:00`, a Wayback CDX request for the current
TomDispatch slug returned eleven distinct HTTP-200 HTML captures from 2022
through 2026. The 1,732-byte response has SHA-256
`29a9e4723cc190599fe98e4a8f4cb6d26bbb90739480fe1fc54b53d25ebe4a96`.
At `2026-07-23T03:56:21.302-04:00`, the earliest listed capture was fetched:
95,861 bytes, SHA-256
`98aec2cb414007c2e38721f6a04df85fcba717a85926b92b3ff14bdd06b99ede`.
It identifies Tom Engelhardt as page author, publishes the article at
2004-10-28, and contains Rosen's `Off The Charts`, not the stored 2017-era
interview. This agrees with the current live page.

A local provenance search found the same unsupported row and text in
`scrapefruit/tests/Rosen Archive URL List - test_runs.csv`, 9,847,049 bytes,
SHA-256
`ec787aeca927d75bfb168d04d65fe5ce59f1bc115a2383674d83ea00815b9b12`.
That file supplies no capture path, source hash, Drive link, transcript link,
or note; its row was already marked `verified=TRUE` without evidence. The
canonical record remains `verified=FALSE` and `needs_review=TRUE`. No title,
date, author, URL, body, publisher, or platform value can be accepted for this
composite without a curator identity decision or a recovered primary source.

### Relationship-backed entity first mentions

A failing regression identified 26 entities with canonical relationship edges
but no `first_mention_record_id`. Each blank was filled with the earliest
non-quarantined relationship source, ordered by archive publication date and
then record ID. `RECORD-00614` was excluded because its source identity remains
quarantined. No entity ID, name, type, count, relationship, or archive record
was changed.

Independent comparison with `HEAD:data/extracted_entities.csv` confirms that
exactly 26 rows changed and that `first_mention_record_id` is the only changed
field on each row. The focused regression passes, the archive validator reports
no errors, and the CRLF-aware diff check passes. Blank first mentions fell from
152 to 126. None of the remaining blanks has a non-quarantined relationship
edge: 125 are currently orphaned from the relationship table and `O0734` is
linked only through quarantined `RECORD-00614`. The entity CSV remains 7,389
rows by 11 columns with SHA-256
`e5bd5c768f49ea7d19c831ea29fd9f004f6692c77ddc9d19549c33b13146ca0a`.

### HuffPost source verification pilot 02

K2 reviewed `RECORD-00809` through `RECORD-00813` against five saved official
HuffPost pages and exited with code 0. The saved HTML SHA-256 values are:

- `RECORD-00809`: `d0020b48e8780773102658e047fbc65014605b2a8f44d85bef530e658cfe00cb`
- `RECORD-00810`: `fe4a923ffc4b96ca83f48069c81557a4ba66c89f8b484faf78728ce47de684da`
- `RECORD-00811`: `5ca19a4f2a9763c1d61f1ad680da2ab0b38d5ae5b071bd7e8460fe94962435ad`
- `RECORD-00812`: `6b25262b0280e8c5798f292fd5004c8b2689989bebbdb48f7ee2a74d7e25c701`
- `RECORD-00813`: `aaf781128c4dddcafa9d08265d646f94244fae4d767a2c3cd34f950165fdb6be`

The packet was not applied as written. Its provenance file retained the first
four HTTP 406 attempts and empty-file hashes instead of the later successful
captures; its word-count proposals did not count the stored `raw_text`; its
summary proposals repeated opening sentences; and four excerpts were either
truncated or were not contiguous article-body text. Independent review used
the successful request log and saved HTML files as evidence, retained every
stored body and word count, replaced the four defective excerpts with exact
source passages, and wrote article-level summaries. Official canonical URLs
corrected the slugs on `RECORD-00812` and `RECORD-00813`.

A focused failing regression was added before the repair. The five target rows
then changed only the authorized field masks: four fields on `RECORD-00809`,
five each on `RECORD-00810` and `RECORD-00811`, and six each on
`RECORD-00812` and `RECORD-00813`. Every note now includes its official source
hash. Independent comparison with K2's pre-edit row snapshot confirms no other
target field changed. The focused regression passes, the archive validator
reports no errors, the CSV remains 1,028 rows by 38 columns with 1,029 CRLF
record boundaries, and the CRLF-aware diff check passes. The archive CSV
SHA-256 at this checkpoint is
`9964fd94df727d31878a589a8e3d187b8b3286b0da346b31f52728187fcac872`.

This pilot reduced explicit archive `verified=FALSE` rows to 69. Sixty-five
are remaining HuffPost records with blank summaries; they stay queued for the
same source-backed review instead of being marked verified in bulk.

### Low-count-year missing-work proposal

A K2 recovery run reviewed nine source-backed works from years with sparse or
zero archive coverage. The worker exited with code 0. Its output packet at
`%TEMP%/rosen-k2-low-count-recovery-01` contains nine candidate verdicts and
nine proposal-only rows with the repository's 38-column header. Every proposed
ID and `raw_text` field is blank; no closed text or permanent ID was added.

The nine exact titles are absent from the current archive. The packet identifies
distinct works from 1988, 1989, 1990, 1991, 1992, 1993, two from 1997, and one
from 2002. The 1989-1991, 1997, and 2002 articles are supported by DOI and
Crossref metadata; the books and occasional papers are supported by Library of
Congress, Open Library, and Internet Archive catalog records. All nine remain
access-restricted: four journal works are behind publisher access, three
cataloged works have no located digital copy, one cataloged work has no ebook,
and the 1992 book is borrow-only with no public full text. No access control or
challenge was bypassed.

The packet is not safe to import as written. All nine rows use the stale
`Pre-Digital & Public Journalism (1988-1999)` era, while the current schema
requires `Public Journalism (90s)` for the 1988-1997 works and
`Blogging Launch & Digital Disruption (2000-2004)` for the 2002 work. All nine
also propose `copyright=Jay Rosen` without rights evidence and use
`verified=PROPOSED`, which is outside the canonical boolean field domain. The
duplicate analyzer labels unrelated archive rows as identifier matches, so its
ranked match lists cannot serve as duplicate proof. Candidate 3, the generic
1990 title `Reviews`, also needs a curator decision about the Crossref author
list and whether the item is one joint work or a grouped review section.

No proposal was imported. Curator approval is still required for inclusion,
permanent IDs, date-precision representation, authorship on candidates 1 and 3,
and the source-backed field mask. The core packet hashes are:

- `candidate-verification.json`: `04f58af578d1a0c07877b705d490287b7cdbc188f9e44a0e528be1cc6b0032d9`
- `proposed-records.csv`: `9df9f324791ad19503ae926123d22cfdcee3bc6deaea2499442fb2363d4c55b0`
- `field-provenance.json`: `0da7fa96a8493366e2ce2aa84d2bf1f131dec3470473de30216c874461fcf235`
- `duplicate-analysis.json`: `82ec0af2a320460da7b65f3ac462686e2a94d4725cb41c9de01ac5891250f86a`
- `external-calls.json`: `d4d01e4faf595557f4641ba99feb0150a30fc91c6d195f11d9711a9511dbb1c0`
- `report.txt`: `30934157dc00cbf60421063b338277dcf9d78e31a926390a43a968cfdff8c6a5`
- `stdout.log`: `ccbdefa2bb20eddd3c4f3233c1cdb7f799bafecb9f2fc02e08ace44a837edea4`
- `stderr.log`: `8d04a19a917321c5e83711f124cda2ac5f6733a1b9856e249492df058a231b74`

### Bluesky source verification pilot 01 capture

The pilot contract follows the official AT Protocol read path: resolve the
stored handle to a DID, construct durable DID-authority AT URIs from each
stored post record key, and request at most 25 URIs from
`app.bsky.feed.getPosts`. The contract was checked against the official
AT Protocol reading-data guide, AT URI specification, and current Bluesky
`getPosts` and `resolveHandle` lexicons before capture.

Two logged public API calls ran at `2026-07-23T05:21:42.154072-04:00`:

| Attempt | Response |
| --- | --- |
| `GET public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=jayrosen.bsky.social` | HTTP 200; DID `did:plc:3t37x6vfigdzzp2gjcfnzlz4`; response SHA-256 `038d9e2ed36c7889e1e2af31b8bd8d3c7f1b1de8d780dbb9075c43e5cec33e44`. |
| `GET public.api.bsky.app/xrpc/app.bsky.feed.getPosts` with 25 repeated `uris` parameters for `BSKY-00001` through `BSKY-00025` | HTTP 200; 25 requested and 25 returned; response SHA-256 `3729ee61e0400fb44af226279271fea674e2fb2946fd85ec5ca4ef997adbe77d`. |

All 25 returned URI record keys, author DIDs, author handles, stored texts, and
stored word counts match. Twenty-three stored timestamps match the source
second exactly. `BSKY-00012` and `BSKY-00019` represent the correct instants
but omit the leading zero from the hour; the source values normalize to
`2025-10-25 01:41:34` and `2025-10-23 00:27:02`. A focused regression was
added and fails on the still-blank verification status before any pilot row is
changed. The source-backed repair remains pending its delegated implementation
and independent audit.

### Source-backed orphan entity mappings

The 76 mappings from `%TEMP%/rosen-orphan-entity-reconciliation-01` were
applied after the focused evidence-mapping regression failed on the first
blank target. Exactly 76 entity rows changed, and `first_mention_record_id` was
the only changed field on every row. Exactly 76 relationship rows were
appended. Their packet fields are byte-for-byte equivalent after CSV parsing;
only the previously blank `relationship_id` values were assigned. IDs use the
existing `{source_record_id}_REL_{NNN}` form and equal the prior maximum suffix
plus one for each source record, including sequential allocation where a
record received more than one relationship.

Independent comparison against the saved pre-edit files confirms:

- entity dimensions remain 7,389 rows by 11 columns;
- blank entity first mentions fell from 126 to 50;
- relationship dimensions rose from 10,728 to 10,804 rows with the canonical
  10-column header unchanged;
- all prior relationship bytes remain an exact prefix of the current file;
- all 76 relationship IDs are unique and follow the deterministic allocation;
- all record and entity endpoints resolve;
- every context snippet is an exact substring of the cited archive
  `raw_text`;
- no relationship-backed entity has a blank first mention;
- the 28 probable duplicate identities, eight ambiguous entities, 13
  no-evidence entities, and quarantine-only `O0734` remain unresolved rather
  than being guessed or merged.

The focused mapping and relationship-backed tests pass. Tests for endpoint
resolution, self-reference, duplicate semantic keys, and canonical endpoint
names pass. The archive validator reports no errors, the CRLF-aware diff check
passes, and archive entity coverage is now 795 of 1,028 records, or 77.3%.
Current SHA-256 values are:

- `data/extracted_entities.csv`:
  `5833f0fec30553c1a1ee6fd5fe8663bbe396a32efd0ef3638ad59dcd8063d1a9`
- `data/extracted_relationships.csv`:
  `181b5acf3d3d3dd0f5f123885e542f8ff56ad7d9fd736f1eae281818918f4c72`

The assigned-ID audit has SHA-256
`6331f6892175a44e505130c333f5b6d3fc8d7c757873d627bbbd1436dfe96171`;
the delegated apply audit has SHA-256
`7a2a873b76f6778f4e49d735cd418262cc7c05e3792a33a71c60bc7713d63998`.

### Newspapers.com PDF collection reconciliation

Read-only Google Drive discovery traced the source collection through
`playground/ARCHIVED/DeepSeek-OCR`. The project README reports 84
newspapers.com PDFs, 150,486 OCR words, and 59 files containing a Jay Rosen
mention. The matching local read-only database is
`../ARCHIVED/DeepSeek-OCR/newspaper_archive.db`, 1,818,624 bytes, with SHA-256
`e4fd35e5b0f82f8721503d1b394ce44004736a2c21ead66b1e00077768ebf568`.

External Drive connector calls were logged as follows:

| Attempt | Response |
| --- | --- |
| PDF searches for `newspapers`, `Rosen`, `Jay Rosen`, and `clipping` | All four completed; broad result sets identified the archived generated-PDF library and the newspaper scan naming pattern. |
| PDF search for `newspapers.com` | Completed; returned the three `The_News_and_Observer` scan titles among broader newspaper results. |
| PDF search for `The_News_and_Observer` | Completed; 11 results returned, including two stored copies of each of three scan titles. |
| Direct-child searches for folder IDs `1RP1Gz8HLnvhh36CbxsQncOOH0Or-jwo4` and `1iwdW3GjGgNaHBZHPS2HOQ89ZDkuUmnfk` | Completed; three and eight children returned, respectively. |
| PDF search for files created from 2024-11-01 through 2024-12-14 | Completed; 51 results returned and six matched the newspaper-scan filename pattern. |
| Metadata reads for four source/OCR folders cited by `CLIP-00001`, `CLIP-00027`, `CLIP-00028`, and `CLIP-00073` | All four completed; each resolved to `output_tesseract_full` parent `1A-vmHuKtqVyDF48uHvN0WqBaIF3f3tun`. |
| Metadata reads walking parents `output_tesseract_full` -> `DeepSeek-OCR` -> `ARCHIVED` -> `playground` | All four completed and established the folder lineage without changing Drive. |
| Direct-child search of `DeepSeek-OCR` | Completed; 26 children returned, including the OCR outputs, database documentation, and `newspaper_clippings` source folder. |
| Direct-child search and folder-name search for `newspaper_clippings` | Completed; the archived folder metadata resolved, while its current direct-child listing was empty. |
| Two fetch attempts for `DATABASE_README.md` | Both completed; the second returned the README content and the 84-file/150,486-word source census. |

An independent local reconciliation matched every one of the database's 84
source rows to the current 83 `CLIP-*` archive records. No database source row
and no archive clipping row is unmatched. The one-count difference is an exact
source duplicate: `News_and_Record_1995_10_15_82.pdf` and
`News_and_Record_1995_10_15_82 (1).pdf` both map to `CLIP-00016`. Thus the PDF
collection is already parsed and represented in the archive rather than being
an unprocessed queue. All 83 archive rows retain source notes and extracted
Rosen passages. Eighty-two are verified; `CLIP-00023` remains correctly
quarantined because its source names filmmaker Jay Rosenstein, not Jay Rosen.

### Bluesky source verification pilot 01 apply

The 25-post capture documented above was applied after its focused regression
failed on the still-blank verification status. `BSKY-00001` through
`BSKY-00025` now have explicit source-verification notes containing their
durable DID-authority AT URI, content CID, the saved API response hash, and the
2026-07-23 check date. All 25 source texts, author identities, record keys,
dates, and word counts matched. Dynamic engagement counts were not treated as
canonical evidence and were not changed.

Independent comparison against the saved pre-edit snapshot confirms exactly
25 changed rows and no non-target change. Twenty-three target rows changed
only `verified` and `notes`. `BSKY-00012` and `BSKY-00019` changed only
`publication_date`, `verified`, and `notes`; their source-backed timestamps are
now zero-padded as `2025-10-25 01:41:34` and `2025-10-23 00:27:02`. The file
remains 29,747 rows by 37 columns, UTF-8 without a BOM, with 29,748 CRLF record
boundaries. Explicitly verified social rows rose from 4 to 29.

The focused source-evidence regression passes, the archive validator reports
no errors, and the CRLF-aware diff check passes. The current
`data/social_posts.csv` SHA-256 is
`08cca1874306468c342b0771b9cafbf62266a14b49de044e352bc5c4c0f98b37`;
the pre-edit hash was
`28cca07bdf83e18a542e4cf27651d10628003f4a62861b2ce6941ad533a1c837`.

### HuffPost source verification pilot 03

K2 reviewed `RECORD-00814` through `RECORD-00818` against five saved official
HuffPost pages and exited with code 0. This work advances the record-quality
track under #695, the completion-gate work in #723, and the before/after
reporting required by #730. The logged source calls were:

| Attempt | Response |
| --- | --- |
| `2026-07-23T09:12:51Z` — `RECORD-00814` | HTTP 200; 431,759 bytes; HTML SHA-256 `617467a0db2be3d02a958b831becf211150b5977eba518ba79c5a72dd65e5f3f`. |
| `2026-07-23T09:12:51Z` — `RECORD-00815` | HTTP 200; 434,276 bytes; canonical slug corrected; HTML SHA-256 `053dc7e03f1b369dc759185a6b5e348f48cef77c69112ce49203c7c51556c925`. |
| `2026-07-23T09:12:52Z` — `RECORD-00816` | HTTP 200; 459,160 bytes; canonical slug corrected; HTML SHA-256 `b8d1ae1a54c51a42684975067fc3f6761067cb752734e528e171ff4a7d7ad7ca`. |
| `2026-07-23T09:12:52Z` — `RECORD-00817` | HTTP 200; 405,441 bytes; HTML SHA-256 `7774370df5aaef64e26d76b30fc67cf4899ef7bcb0cb1b9a1794cb09ed499ae8`. |
| `2026-07-23T09:12:53Z` — `RECORD-00818` | HTTP 200; 424,692 bytes; canonical slug corrected; HTML SHA-256 `2c40d62c2edd1b992220d625fbc1af0ea67eb728d8f3bcb5536695ace6d4af2f`. |

Independent review accepted the source titles, dates, authors, canonical URLs,
article-level summaries, and four proposed excerpt repairs. It rejected K2's
`RECORD-00818` excerpt because the proposed passage ended with an unmatched
opening quotation mark. The applied excerpt is the complete opening sentence
from the saved article body. The stored `raw_text` and archive-convention word
count were retained for all five records.

A focused failing regression was added before the repair. Independent
comparison with the hashed pre-edit snapshot confirms that exactly five rows
and 29 fields changed: five fields on `RECORD-00814`, six on
`RECORD-00815`, seven on `RECORD-00816`, five on `RECORD-00817`, and six on
`RECORD-00818`. The field masks contain only the approved title, URL, excerpt,
summary, verification, review, and provenance-note changes. No other row,
header, record ID, stored body, word count, or record boundary changed.

The focused regression passes, the archive validator reports no errors, and
the CRLF-aware diff check passes. The CSV remains 1,028 rows by 38 columns,
UTF-8 without a BOM, with 1,029 CRLF record boundaries. Explicit archive
`verified=FALSE` rows fell from 69 to 64; 60 HuffPost rows remain false with
blank summaries. The pre-edit archive SHA-256 was
`9964fd94df727d31878a589a8e3d187b8b3286b0da346b31f52728187fcac872`;
the current SHA-256 is
`e4f813112eebe6e61c2fb1ba915cfb9a6c7cd1a8463d76be6d79554fcbd1e58d`.
The pre-edit snapshot is under
`%TEMP%/rosen-huffpost-03-before-20260723-053953`.

The core K2 packet hashes are:

- `source-verification.json`: `b812bcd95e4650013c8e60b54faba10f863d45ebaf26f800dd181ac226030679`
- `body-comparison.json`: `b311521568072b1ae111b0215b4522fbc80f2bf7cab0a652b0a68bc537409bb1`
- `proposed-field-updates.json`: `ee75305abae12945c95279443b6fad709a3acfa87acd02e1e20ee113645f4b84`
- `field-provenance.json`: `e076e3412b0859fb2b3ce376a8b689d78d3bd37217404007fea3af2d5604c5ec`
- `external-calls.json`: `afd1077af11a1e1abdfab76f44214669c95484bf759999fb10850b4fca39d163`
- `report.txt`: `1a42a45d3ea7e5603d7257756396d73accac27d587158906bd8e55d334db6dac`
- `stdout.log`: `6b5abd23f337d0896553b4d60ddb3b5b098ccce6e6a6751b0b290a3355c3f314`
- `stderr.log`: `f5795428f83e5508a40458a8e4159db91416b06170f6f7c2632be2c0ad5fc2a1`

### PressThink live-sitemap recovery census

This recovery pass advances issue #208 and the recovery sequence recorded in
the stewardship program. The existing deterministic matcher's 14 offline
tests passed before the live source was captured. A single logged request at
`2026-07-23T09:46:07.4929338+00:00` fetched
`https://pressthink.org/post-sitemap.xml`: HTTP 200, 53,097 bytes, saved
SHA-256
`99858c12fe53d3d7ff918dbbe98729d0581d5149d5fc518a3991b4cd7b5ef4dc`.
The matcher then ran offline against that saved XML and the current archive
CSV.

The sitemap contains 227 dated posts plus one non-post entry. The current
branch confirms 27 by exact modern URL and 17 by strong same-month title
matching. One 2008 URL is a weak title match to `RECORD-00329` and remains a
review item. The remaining 182 URLs are source-backed recovery candidates,
distributed as follows:

| Year | Candidate gaps |
| ---: | ---: |
| 2009 | 2 |
| 2010 | 15 |
| 2011 | 18 |
| 2012 | 13 |
| 2013 | 27 |
| 2014 | 31 |
| 2015 | 21 |
| 2016 | 12 |
| 2017 | 10 |
| 2018 | 12 |
| 2019 | 6 |
| 2020 | 12 |
| 2021 | 1 |
| 2025 | 1 |
| 2026 | 1 |

The distribution confirms that low archive counts in 2014 and 2015 are not a
publication lull. The current archive has 11 records dated 2014 and seven
dated 2015, while the live sitemap exposes 31 and 21 additional candidates.
The full offline report is under `%TEMP%/rosen-pressthink-gap-20260723` with
SHA-256
`7b503d34d5da2c0793590ed6ef5e69f61496dcb01600fae2caa959877db61ec5`.

Five missing 2015 pages were then captured from the official site as the first
recovery packet. Each request returned HTTP 200 and retained its raw HTML:

| Candidate | Bytes | HTML SHA-256 |
| --- | ---: | --- |
| A (brief) banking theory of newsroom trust. | 77,158 | `1368b784d860d2e0219ca69cbcbcb25131f58e6b0ebc2843589563299f56d009` |
| A brief sketch of the "full stack" (intellectually speaking...) news and information company. | 75,359 | `1b5c27a89bab421b4f794c85400b946a5d620484aeded78d52dc8c27b3042f84` |
| Brian Williams has not led. What's an anchor for? | 176,177 | `1027ca6f23a323da042717512b108628842b9a141fb00ad2ca18b2b3b60780b5` |
| The "conflation" that Brian Williams confessed to began in 2003 | 73,265 | `43aaf3edd74d226b44eeb46df8f45db07c63ab6c46d2ed309e083cb72d9ac298` |
| Bill O'Reilly is a performance artist, and his genre is "resentment news." | 93,119 | `6043b718bb514716654f12c73383d3a1d6f23c31f09c21bb242c951a552e81fa` |

The saved pages expose canonical URLs, Jay Rosen authorship, exact titles,
publication timestamps, and article bodies. They remain evidence-only while
duplicate review, body extraction, rights fields, permanent IDs, and the
source-backed import mask are checked. No archive row was inserted. The call
manifest is under `%TEMP%/rosen-pressthink-recovery-2015-01` with SHA-256
`5c856a54531a03848b6b7b833e9b9011d29ee0120055cb10ec75f054df77d752`.

#### PressThink 2015 recovery batch 01 audit

Offline comparison against all 1,028 archive rows and all 37 staged gap-fill
rows found no exact URL, normalized URL, normalized title, or WordPress post-ID
match for any of the five candidates. Candidates 3 and 4 cross-link as separate
posts. Candidate 5 quotes part of 2003 `RECORD-00149`, but its distinct title,
URL, 2015 date, WordPress ID, and mostly new body establish a separate work.

The visible PressThink dates agree with the source timestamps after conversion
to America/New_York. This matters for candidate 1 (`2015-01-17T00:11:01Z` is
displayed as `16 Jan 2015 7:11 pm`) and candidate 4
(`2015-02-09T03:35:09Z` is displayed as `8 Feb 2015 10:35 pm`). The proposed
archive dates retain those displayed local dates.

Body extraction was restricted to the single direct-child
`article.postFull > div.postContent.styles.stylesDefault` node. The comments
container is a following sibling, and no page navigation, header, footer,
comments, script, or iframe payload entered the extracted text. Independent
recalculation confirmed every character count, whitespace word count, and
UTF-8 body hash:

| Candidate | Local publication date | Characters | Words | Body SHA-256 |
| --- | --- | ---: | ---: | --- |
| A (brief) banking theory of newsroom trust. | 2015-01-16 | 8,291 | 1,467 | `5f9ed4dd3e1edf3eee3a2c1e89c885e5df7578c842210418431ef87d97f898f4` |
| A brief sketch of the "full stack" (intellectually speaking...) news and information company. | 2015-01-21 | 5,694 | 964 | `f29ac78174fdd447a692071b323522d21106c2fdbff2005c35a4e5e67b7e46f3` |
| Brian Williams has not led. What's an anchor for? | 2015-02-06 | 10,479 | 1,810 | `57ce997a6ebcebc2cc760211d84b4938c61c1d6e0de266c6e84b62aa25d1af91` |
| The "conflation" that Brian Williams confessed to began in 2003 | 2015-02-08 | 3,804 | 675 | `dde70d4b00f6088589d8b1ce2845331b33bdadc2aaa8e871dfdf69cf6315e502` |
| Bill O'Reilly is a performance artist, and his genre is "resentment news." | 2015-03-02 | 7,480 | 1,291 | `fcd6bb9c92f462e82e48beee05ea061c66c12e35700acbbcce92e0ff2e608ba0` |

The packet supplies unique contiguous excerpt and article-summary proposals,
but no import was made. Permanent IDs and insertion order, the right to publish
full extracted text, rights fields, taxonomy, entities, and relationships are
one-way curator decisions. The audit output hashes are:

- `duplicate-analysis.json`: `8801d200cb40531c9261db3ed2782306ed398275e894a9cc391d7282f236e740`
- `source-metadata.json`: `9352865d484e7c0dddc829559d178b7e7e8177d0f619d453956d37653aac9b94`
- `body-extraction.json`: `90e24e1775fa3bf0bbfa50723e4fe0732fceac2c1fb5954264c7428e6a179127`
- `proposed-fields.json`: `83fbc563c48f8de72da1e3e351db27a2b2fdba43e0f0027ea0d013ebcef0820c`
- `audit-report.txt`: `c3f2778011b9276e8824784cafbc8d257fdb32799a42e528c9e448421aa815e0`

### HuffPost source verification pilot 04

K2 reviewed `RECORD-00819` through `RECORD-00823` against five saved official
HuffPost pages and exited with code 0. The final successful captures were:

| Attempt | Response |
| --- | --- |
| `2026-07-23T09:53:03Z` — `RECORD-00819` | HTTP 200; 419,394 bytes; HTML SHA-256 `8bcbf31474426f4974dbaa90fa25601dd2b2bca721a0ccd2ad7a137ae49f66b3`. |
| `2026-07-23T09:53:04Z` — `RECORD-00820` | HTTP 200; 414,055 bytes; HTML SHA-256 `31cebab96b229a70f02a005fa316afe319f193af58ad1aa44e5185f9410db1cc`. |
| `2026-07-23T09:53:04Z` — `RECORD-00821` | HTTP 200; 415,671 bytes; requested slug redirected while the page retained the stored canonical slug; HTML SHA-256 `cd621bdf7562a72b19e265a429368dc94387ef5b9cbd2f447d3c3f52a59e7dda`. |
| `2026-07-23T09:53:04Z` — `RECORD-00822` | HTTP 200; 425,640 bytes; HTML SHA-256 `0110fd3d96185a8aefeec255761244444148a8454405a758171883318a59ad59`. |
| `2026-07-23T09:53:05Z` — `RECORD-00823` | HTTP 200; 433,469 bytes; canonical slug corrected; HTML SHA-256 `5d9a659c916258d8c4450572f55977320195e21c3b354e43557d9004084385d6`. |

The packet's structured request log is not complete. K2 stderr records an
earlier exploratory curl pass, one malformed `RECORD-00820` curl command, a
later successful `RECORD-00820` fetch, and a failed five-page `requests` pass
before the final curl run. Those attempts lack the required structured
timestamps, statuses, byte counts, and hashes, so they are retained only as a
process exception in `stderr.log` and were not used as source evidence. The
five final captures above were independently rehashed and their byte counts
match. Future K2 prompts must write attempts append-only rather than replacing
the call history during retries.

All five source titles, authors, and local publication dates match the stored
values. Independent body review accepted the five article-level summary
proposals and the three already-contiguous excerpts. K2 correctly rejected the
stored excerpts on `RECORD-00821` and `RECORD-00823`; they were replaced with
complete contiguous source sentences. `RECORD-00823` also received the
official canonical URL. Every stored body and archive-convention word count
was retained.

A focused failing regression was added before the repair. Independent
comparison with the hashed pre-edit snapshot confirms that exactly five rows
and 23 fields changed: four fields each on `RECORD-00819`, `RECORD-00820`, and
`RECORD-00822`; five on `RECORD-00821`; and six on `RECORD-00823`. No other
row, header, ID, body, word count, or record boundary changed.

The focused regression passes, the archive validator reports no errors, and
the CRLF-aware diff check passes. The CSV remains 1,028 rows by 38 columns,
UTF-8 without a BOM, with 1,029 CRLF record boundaries. Explicit archive
`verified=FALSE` rows fell from 64 to 59; 55 HuffPost rows remain false with
blank summaries. The pre-edit archive SHA-256 was
`e4f813112eebe6e61c2fb1ba915cfb9a6c7cd1a8463d76be6d79554fcbd1e58d`;
the current SHA-256 is
`034b9625ee1513f81dfe0899bc12d3d298499b3dc62b324720e4c3a306a0872b`.
The pre-edit snapshot is under
`%TEMP%/rosen-huffpost-pilot-04-before-20260723-060410`.

The core K2 packet hashes are:

- `source-verification.json`: `f9c8e2578a9347a8b475629834c19676e4dd206b81d3fcaaf66c826117d85b04`
- `body-comparison.json`: `496434926f5da8862bd37df5b14813783ed6843aa7101d89395b9bf48068b9f2`
- `proposed-field-updates.json`: `c9e6af1617ac59c7f7c72375e3ea46aa5f231bf672c82ed988b0c0d1a3fa2995`
- `field-provenance.json`: `4a92ff93c9116d965febcc31980a5199df04e94cf12b5a95e00b3b9c93fd366e`
- `external-calls.json`: `57a35a4378e0217fb627f9ece4dbf794a79a4ab47e38fa02bacb1ba1c12f4ff1`
- `report.txt`: `7ca9410da430a058b95aabc494b74e25fd0f77b9972063093cba7fb76b6c7282`
- `stdout.log`: `9b5a5b83422392d432981aab16fc0e3207b082dcee455a630ce55d48b95e96e7`
- `stderr.log`: `3f07ef98cb222f57708ad22902d99630fa13e6505f283f271188375bacfa8fd9`

### HuffPost source verification pilot 05

K2 reviewed `RECORD-00824` through `RECORD-00828` against five official
HuffPost pages and exited with code 0. The accepted evidence is the second
attempt for each record:

| Attempt | Saved response |
| --- | --- |
| `2026-07-23T10:15:34Z` — `RECORD-00824` | HTTP 200; 426,618 saved bytes; HTML SHA-256 `7051ed933288032495c5bad878e293a9fcdf52113ea743be85bca8ea56135d89`. |
| `2026-07-23T10:15:38Z` — `RECORD-00825` | HTTP 200; 462,595 saved bytes; HTML SHA-256 `94bce2116bcf5340ff028eca71918ad628503236cf08720db40f0b0169d8fa0b`. |
| `2026-07-23T10:15:43Z` — `RECORD-00826` | HTTP 200; 447,976 saved bytes; canonical slug corrected; HTML SHA-256 `daffd85294ae3a18eae8ecffae7344b1ed9821d1afacf8f627fdf6dea37724c4`. |
| `2026-07-23T10:15:47Z` — `RECORD-00827` | HTTP 200; 444,173 saved bytes; canonical slug corrected; HTML SHA-256 `8ea78a6e0d9acab0367e72acb3e816f56b48b63e91ac88696696ebebf756bc91`. |
| `2026-07-23T10:15:51Z` — `RECORD-00828` | HTTP 200; 425,680 saved bytes; final redirect and canonical-link slugs differ, so the stored canonical-link URL was retained; HTML SHA-256 `a7d709877bd6724334735409e3327b558ad45688cd3136be85bcf8fba89956e4`. |

The request-log contract had one contained failure. The first fetch program
retrieved `RECORD-00824` and then crashed before appending its call record.
K2 reconstructed that line from the saved response and headers, but the next
program run reused the `attempt_1` filename and overwrote the referenced file.
That line's recorded hash is therefore not replayable and was rejected as
evidence. The later `attempt_2` file is retained and independently rehashed.
The append-only NDJSON and derived JSON each contain 11 entries, and stderr
shows no requests made through another network client. The call logs report
compressed transfer counts as `byte_count`; the table above uses actual saved
file sizes.

All five source titles, authors, and publication dates match. Independent
normalization found every stored body token in source order for all five rows,
with no unmatched token blocks. The stored `raw_text` and archive-convention
`word_count` values were therefore retained. Three stale excerpts were
replaced with complete contiguous source sentences, three canonical URLs were
corrected, and all five missing summaries were filled with article-level
descriptions.

A focused failing regression was added before the repair. Snapshot comparison
confirms that only the five target rows and 26 approved fields changed:

- `RECORD-00824`: `url`, `excerpt`, `summary`, `verified`, `notes`, and
  `needs_review`;
- `RECORD-00825`: `summary`, `verified`, `notes`, and `needs_review`;
- `RECORD-00826`: `url`, `summary`, `verified`, `notes`, and `needs_review`;
- `RECORD-00827`: `url`, `excerpt`, `summary`, `verified`, `notes`, and
  `needs_review`;
- `RECORD-00828`: `excerpt`, `summary`, `verified`, `notes`, and
  `needs_review`.

The focused regression passes, the archive validator reports no errors, and
the CRLF-aware diff check passes. The CSV remains 1,028 rows by 38 columns,
UTF-8 without a BOM, with 1,029 CRLF record boundaries. Explicit archive
`verified=FALSE` rows fell from 59 to 54; 50 HuffPost rows remain false with
blank summaries. The pre-edit archive SHA-256 was
`034b9625ee1513f81dfe0899bc12d3d298499b3dc62b324720e4c3a306a0872b`;
the current SHA-256 is
`5393318004d4b209be5872097882a0b3ea8b0835116d92821c97eb4709d7b444`.
The pre-edit snapshot is under
`%TEMP%/rosen-huffpost-pilot-05-before-20260723-064639`.

The core K2 packet hashes are:

- `source-verification.json`: `639a82dba172e381d981e1ad8ef654c867d4fc72ed8bd3696469ab4d1f7721f3`
- `body-comparison.json`: `8da0a1bb88015e2a09d184857f6d9f44d5f3afd96ac86b1b8e9de8c6b4a73ecf`
- `proposed-field-updates.json`: `d8c0b1e877ee2322d6708264394ce32cbb4bb03d0b8528714f74f49605dc9c59`
- `field-provenance.json`: `7c910888db604070d756eb2a6638b70baa568fea2b9bae197b249e8146ba3d36`
- `external-calls.ndjson`: `d2decfdedfd2716c1cb7bd64c064fdfc40dc434a281cff4ad60f8a281e1eb411`
- `external-calls.json`: `102a5f729abd262f382323d45281fe4a0139e8f4cca8e5c22301a9468aa7779d`
- `report.txt`: `dc02b88dc4c6dbbc48d1a4407d63dc1dedb13419295635e06a515aac284e4ce6`
- `stdout.log`: `01681c7ea60eb19baf2f435c03f4ab36124850e30f8e2ed7e042af2d82156be2`
- `stderr.log`: `9f271ec7b5f2a761395c530bc6ed95e29e1b5dc9ab5e0c6a9d693595d36162b4`

### Orphan-entity duplicate audit

This offline audit advances the canonical-identity and orphan review tracked
under issues #732 and #738. It reviewed the 28 blank-provenance entities
previously classified as probable duplicate or typo identities. All 28 have
zero relationship references, and a simulated candidate-to-canonical remap
followed by candidate removal leaves all 10,804 relationship endpoints
resolving.

Nineteen pairs have strong same-identity evidence and are queued as
`safe_auto_candidate`. Nine remain `curator_required`: `C0604`, `E0121`,
`E0221`, `O0313`, `O1118`, `P1050`, `P2092`, `W0160`, and `W0573`. The audit
corrected weak prior citations for `P1050` and `O1118` and retained type,
display-name, or spelling conflicts for review. This classification is not
merge authorization; retained IDs, aliases, mention-count aggregation, and
cross-type resolution remain one-way stewardship decisions.

The raw relationship-backed blank count is one: `O0734`, referenced only by
the quarantined composite `RECORD-00614`. Excluding that quarantine, the
relationship-backed blank count is zero. No entity or relationship row was
changed. The temp packet is under
`%TEMP%/rosen-orphan-entity-merge-audit`; its main hashes are:

- `entity-merge-audit.json`: `5b8332e5bc8a5f272c3e3267f30bd176cae58bbf948c68dd3c23636c4fb00523`
- `report.md`: `59cfe9c6a2c7b155aef030d87a40548c12e5f4f2c9a8215a7f5b772a7175db70`

### PressThink 2015 recovery batches 02 and 03

Ten more low-count-year candidates were captured sequentially from the
official PressThink site. Each request returned HTTP 200 with curl exit 0,
empty stderr, a matching final URL, and a saved byte count and SHA-256 that
match both call logs. Packet 02's five-entry NDJSON is
`3d65e0f01f58bb4995e024252add800dde3f38343da8fe32016bd3c777a7e04d`;
its derived JSON is
`183b3dc4b63f2edaa6d146ac0668c566a43805d6c23fcd1698a7455946edfb8e`.
Packet 03's corresponding hashes are
`6d2801dbeb45296f54002549ac61a2a75fd036f8d0b340fa5a5a6f1418d0fa1c`
and
`45ee39140d4e76838e56af213f28fc11825d53aa62628b054b686528c96e3b06`.

Offline comparison found zero literal or normalized URL matches, normalized
title matches, WordPress post-ID matches, or exact body-hash matches across
all 1,028 archive rows and 37 staged gap-fill rows. Candidate 8 quotes a 2012
Grist passage, candidate 13 reuses a Charlotte Observer passage, and candidate
15 links candidate 6 as earlier work; the distinct source IDs, dates, URLs,
and bodies establish separate works rather than duplicates.

Extraction was limited to the direct-child
`article.postFull > div.postContent.styles.stylesDefault` body. The comments
container is a separate following sibling, and no page header, navigation,
footer, comments, script, or iframe payload entered the body text. The verified
local dates and body measurements are:

| Candidate | Local date | Words | Body SHA-256 |
| ---: | --- | ---: | --- |
| 6 | 2015-03-14 | 927 | `8a04994b3c9ecbc57ada9578c9950df3e093cb87adeba1750688acbaa8ce72d9` |
| 7 | 2015-03-16 | 1,333 | `39b9f7db98627747997a65843b39a4322d30014d5e52026ad7a7514343ccc9bd` |
| 8 | 2015-03-23 | 3,119 | `65da0136488dca12b4f99dbe41b14819e5f24d40aecaa1f7f9bfb3a9f0718e45` |
| 9 | 2015-04-06 | 2,507 | `9bd61ebfa038763a2653ad3b33bb2ab11cfa2bb1b856aa5cebe43498727b0017` |
| 10 | 2015-04-21 | 2,027 | `925932010fbdb9910fc1fc79a71eda08d55b19fd068bf45c777fca4565e2b44e` |
| 11 | 2015-04-16 | 1,604 | `c370e8a609a723e1184bb86fa344220e512c2650dd2097ce258ea600aeea5a36` |
| 12 | 2015-04-25 | 1,009 | `fd6c2db0ee1eb1286c1482895b63bc23a1c2d44f588a1b06cc8f6fc31c0b1afe` |
| 13 | 2015-05-18 | 1,387 | `b79994fae3f3a788bc79a531dec3066c30f49d733d69265eea132208c75703ba` |
| 14 | 2015-06-28 | 282 | `17aa27768ba71cd60dc9ee9208a3fd4f7ed395f52f814c29659dbff8834f41da` |
| 15 | 2015-06-20 | 1,093 | `594ea33dc32fb78db8553b72b5d1ea90cb5efa9c10f6416fa5e4417b3b82af50` |

Each proposal includes a unique contiguous excerpt and an article-level
summary. No import was made because permanent IDs, insertion order, rights,
permission to publish full extracted text, taxonomy, entities, and
relationships remain one-way curator decisions. The combined offline audit is
under `%TEMP%/rosen-pressthink-recovery-2015-audit-02-03`; its main hashes are:

- `capture-log-validation.json`: `add8f0f70fdb65fd53c3aee656e3a69aa8084852614fdb09b246e58a83b643d1`
- `source-metadata.json`: `f2a37d1248f54922a511e5c5885a9978cc322a5ec928c1f2d04c87449cbf5537`
- `body-extraction.json`: `e998d177367d981497d072b6f76397522b723e503d511cc180d679aed9faf6ba`
- `duplicate-analysis.json`: `44a7c97a621b9ba8358edc2acf4c466f24baeccd4d68b18aee3473dfc6174d00`
- `proposed-fields.json`: `47dcd876635bd8dd1d910f31266ef36efaeafbf4fbe2ecffde27cc3cda3fd2e3`
- `audit-report.txt`: `f0018197bcc7fb196ef9b2fc561c4165cf904ea27a67c0873d0bd388735e71c1`

### Bluesky primary-source verification pilot 02

The second AT Protocol pilot covers `BSKY-00026` through `BSKY-00051`, with
the absent `BSKY-00034` excluded. Two official public API calls were preserved:

- `2026-07-23T10:12:12Z`: the handle resolver returned
  `did:plc:3t37x6vfigdzzp2gjcfnzlz4`; 42 bytes; response SHA-256
  `038d9e2ed36c7889e1e2af31b8bd8d3c7f1b1de8d780dbb9075c43e5cec33e44`;
- `2026-07-23T10:12:13Z`: `app.bsky.feed.getPosts` returned all 25 requested
  records; 57,717 bytes; response SHA-256
  `2f9b4864e8f65839c18d985a2feb14706ee92203f1e6696109759455f3a81666`.

The structured two-entry call manifest was reconstructed from the preserved
responses and command results after capture rather than appended live. It is
therefore an audit manifest, not proof of immediate attempt logging; this
process exception is explicit in each entry. Its SHA-256 is
`4b2f97a5e8a31df6ca581ff5f28ccbdb61f9b7ba4614b7791e1af04909293ecc`.

Offline comparison mapped 25 CSV rows one-to-one to 25 API posts. Text, author,
handle, DID, rkey, durable AT URI, CID, public URL, and whitespace word counts
match for every row. Six publication timestamps differed only by missing hour
padding and were normalized: `BSKY-00035`, `BSKY-00036`, `BSKY-00037`,
`BSKY-00038`, `BSKY-00044`, and `BSKY-00045`.

A focused failing regression was added before the repair. Snapshot comparison
confirms that 25 `verified` values, 25 `notes` values, and only those six
`publication_date` values changed. The other 29,722 rows and every target
`raw_text` and `word_count` value stayed unchanged. The focused test passes,
the archive validator reports no errors, and the CRLF-aware diff check passes.
Explicit verified social rows rose from 29 to 54.

The pre-edit social CSV SHA-256 was
`08cca1874306468c342b0771b9cafbf62266a14b49de044e352bc5c4c0f98b37`;
the current SHA-256 is
`3c850bca0491b44ec7b1da805e61f8b3fbfaea8d80e44c0c24d431c38031dedf`.
The snapshot is under
`%TEMP%/rosen-bsky-pilot-02-before-20260723-065412`. The offline audit hashes
are:

- `audit-evidence.csv`: `9120988ef0327361ad9c16d10cb10f86dcdce8558a7c4cbb443e60817a5b209d`
- `audit-report.md`: `ce442684391a0fafa26aba926f1c2517c486e86cb6d856940e95c80fddad5fb4`

### PressThink 2015 recovery batch 04

The final six URLs from the 2015 sitemap gap were captured sequentially from
the official PressThink site. All six calls returned HTTP 200 with curl exit
0, empty stderr, matching final URLs, and saved byte counts and SHA-256 values
that replay against the call logs. The six-entry NDJSON has SHA-256
`8c85f6d73134b2ae992fe1989775ad0666196df3a5e5d53062aaa21e803613ff`;
the derived JSON has SHA-256
`88e84e367348eeab670405ab8a54ec91941c54699940b52e779ca804a744fd3a`.

Offline comparison found that candidates 16 through 20 are distinct missing
works. They have no exact or normalized primary URL match, normalized title
match, exact body hash, or strong dataset content match. Candidate 18's only
numeric collision is an unrelated image dimension, and its reuse of candidate
17's question is a documented follow-up rather than a duplicate. Candidate 21,
“Tone poem for the ‘leave it there’ press,” is the PressThink original of the
work already stored as `RECORD-00878`: that archive row names the PressThink
URL as the original publication, and the candidate body has 0.826087
five-word-shingle containment with the stored HuffPost version. It is queued
as an original-source link for the existing record, not as a new record.

Body extraction was limited to the direct PressThink post-content container.
The verified local dates and body measurements are:

| Candidate | Local date | Words | Body SHA-256 |
| ---: | --- | ---: | --- |
| 16 | 2015-07-19 | 1,561 | `db17b5a1b5c0b1500450769178afc466fc2ed20580b261c30d2742e33ee23476` |
| 17 | 2015-09-29 | 1,673 | `7bff284226a58a6797d1ee7edbdde078579012ec078022f899c39abf04556844` |
| 18 | 2015-10-01 | 857 | `a9be7fb3ee2efd052f3310375a3085837bfd34c6999ae51eb49483bc7699fade` |
| 19 | 2015-12-21 | 1,341 | `e0e088ef3422811069fef27e957504d73d9273a1fa05e6817676a8c63c23532a` |
| 20 | 2015-12-30 | 15,412 | `6baa7a7c4a1f237d0b58725a269a3fe3fdb9be620447535f9f45d248566a2ea7` |
| 21 | 2015-12-06 | 679 | `48b505c581f61b5c829fb5e98fecbf421ac8c76b90ede5267cc9518fb189d3c9` |

Together, the four 2015 packets identify 20 distinct missing PressThink works
and one original-source mapping for `RECORD-00878`. No import was made because
permanent IDs, insertion order, rights, permission to publish full extracted
text, taxonomy, entities, and relationships remain one-way curator decisions.
The audit is under
`%TEMP%/rosen-pressthink-recovery-2015-audit-04`; its main hashes are:

- `capture-log-validation.json`: `356cafd7c5db25b2eaa4714fa6ef229b3987175c4524b0c33d0e0ea2eaed527f`
- `source-metadata.json`: `88396c952a1afd70033386581e6f6dc4d9b43b221f30dab67ada1adce6118986`
- `body-extraction.json`: `f8a8036cd4b1da406b445be33bfb82910e2b583163248480734c56a4a2ec3584`
- `duplicate-analysis.json`: `857d1706aafe6aa872a4684b41f994ca8ee365f532f0ff02369ce00d1c8bb7d0`
- `proposed-fields.json`: `e9c725a706d6930e7a7ff32803c69d5369e4eac1e54e4c3e4912a538a2946722`
- `audit-report.txt`: `71bcc5beaa3dcf18ff342bc91a613da6c10751b58f6152f33e8c46da52fee0cd`
- `independent-validation.json`: `01142eec45a882fddbf181fd68c8fd137a04513400099404f2672c4c9599fcc2`

### HuffPost source verification pilot 06

K2 reviewed `RECORD-00829` through `RECORD-00833` against five official
HuffPost pages and exited with code 0. A root-written, single-use fetch program
made one sequential request per record, refused to overwrite existing evidence,
and appended each result to the call log. All five calls succeeded on their
first attempt:

| Record | Saved response |
| --- | --- |
| `RECORD-00829` | HTTP 200; 422,664 bytes; canonical slug corrected; HTML SHA-256 `d016a2d297345b93c34e2f56feefcb4e273d2dd4ebca4f438600b2b35d93c1f4`. |
| `RECORD-00830` | HTTP 200; 456,767 bytes; HTML SHA-256 `b535887edd0d17740967ee370ff05d7b8a90fc32b3a6caf3809ea95851b48005`. |
| `RECORD-00831` | HTTP 200; 441,649 bytes; HTML SHA-256 `a9a6e60cd82c283e642ac1e3179d69ffce58cb0fa76691093bc8a265b7ccaaf6`. |
| `RECORD-00832` | HTTP 200; 411,555 bytes; HTML SHA-256 `87b7a2761efb53600d8060016d4c7017233e1acceac2389d832d567851d67a6d`. |
| `RECORD-00833` | HTTP 200; 436,787 bytes; HTML SHA-256 `2f386c7227b9c2c40e1421fad3a29ef6085f6238d418b6653f9a6390d7eda0b1`. |

Independent replay matched all five logged file sizes and hashes. Stderr shows
only the supplied fetch program and no alternate network client. Official
metadata confirms all five titles, authors, and publication dates. Normalized
ordered-token comparison matched every stored body token in source order:
1,605 of 1,605; 3,436 of 3,436; 2,496 of 2,496; 677 of 677; and 2,126 of
2,126. The stored bodies and archive-convention word counts were retained.
Three edited excerpts were replaced with complete contiguous source passages,
one malformed pull quote was repaired to its exact source sentence, the
canonical URL for `RECORD-00829` was corrected, and five missing summaries
were filled with article-level descriptions.

The K2 report incorrectly described physical CSV lines as 82,651 data rows.
That count was rejected. Independent CSV parsing before and after the repair
confirms 1,028 records and 38 columns.

A focused failing regression was added before the repair. Snapshot comparison
confirms that only the five target rows and 25 approved fields changed:

- `RECORD-00829`: `url`, `summary`, `verified`, `notes`, and `needs_review`;
- `RECORD-00830`: `excerpt`, `pull_quote`, `summary`, `verified`, `notes`, and
  `needs_review`;
- `RECORD-00831`: `summary`, `verified`, `notes`, and `needs_review`;
- `RECORD-00832`: `excerpt`, `summary`, `verified`, `notes`, and
  `needs_review`;
- `RECORD-00833`: `excerpt`, `summary`, `verified`, `notes`, and
  `needs_review`.

The focused regression passes, the archive validator reports no errors, and
the CRLF-aware diff check passes. The CSV remains 1,028 rows by 38 columns,
UTF-8 without a BOM, with 1,029 CRLF record boundaries. Explicit archive
`verified=FALSE` rows fell from 54 to 49; 45 HuffPost rows remain false with
blank summaries. The pre-edit archive SHA-256 was
`5393318004d4b209be5872097882a0b3ea8b0835116d92821c97eb4709d7b444`;
the current SHA-256 is
`eb14023ff900777fe116092bfb116f1b81234574f721c381b8edfe11d467ae3c`.
The pre-edit snapshot is under
`%TEMP%/rosen-huffpost-pilot-06-before-20260723-072215`.

The core K2 packet hashes are:

- `source-verification.json`: `4488c6163dad68e7839e2dee568a3145be699679a2584574f6184d515cb0bd36`
- `body-comparison.json`: `ba0133b0cba3ab4f018a7c3e23beebbf674bc8290686186876f42fa3328188f7`
- `proposed-field-updates.json`: `b7e85d77b90954f15379208fdd39a0cadbca62da03a8fa3710c61bbcf74d6cae`
- `field-provenance.json`: `b760f1689b40adf873eeb40f01773015bbbcba70c67da78034b8b64f4384e020`
- `external-calls.ndjson`: `721e39ef5056b435bc8f2f8b0edcfe09cee5bf3ce8058b2cb7caa84e13885166`
- `external-calls.json`: `167eea8caa90f70e505dccdffb5f16fa6eb282153f051417e961ff8b1ea2c2b8`
- `report.txt`: `53fc7dcf3f15362e4c8dd2a26024a17028463bcd8d220df4ad0cf5c80108c495`
- `stdout.log`: `f642977df0a88b95853261eda702813714181d15b37a9f4014165c634364827b`
- `stderr.log`: `342e388d7a0d3aacb37c2f53711ef90c5003eed99557659bde0bc8da2aeb2e80`

### Newspaper PDF source-set inventory

The six preserved clipping-batch manifests contain 77 source-PDF records.
Exact URL comparison maps all 77 one-to-one to 77 current archive rows. Every
mapped row now has populated `raw_text`, `summary`, `excerpt`, and
`gdrive_raw_file_link`; all 77 are explicitly verified. This includes the
records originally numbered `CLIP-00094` through `CLIP-00106` in batch 06,
which received different permanent archive IDs when the full set was sorted
and deduplicated. The batch-local IDs are therefore not missing archive IDs.

The repository contains 83 newspaper-clipping rows in total. The one false
row outside this 77-source set is archive `CLIP-00023`, which names filmmaker
Jay Rosenstein rather than Jay Rosen and remains quarantined for review.

Local searches found no separate unprocessed newspaper PDF directory. Three
read-only Google Drive search attempts were then logged on 2026-07-23 using
the PDF MIME filter and queries `newspapers`, `Jay Rosen`, and
`newspaper clipping`. Each returned the configured 100-result ceiling, with
287 unique files across the responses. None matched the source-filename
pattern recorded in the six clipping manifests; results were processed
archive exports or unrelated research PDFs. No Drive file was changed or
downloaded. This does not prove that no additional private PDF set exists, but
it shows that the known several-dozen-PDF set is already parsed, mapped, and
stored rather than waiting for import.

The source-manifest hashes are:

- `backend/clipping_batch_1.json`: `e0cef058da85324293c81afd664fbb62aa679ffae4fa9f7c542c9d72c02e5eb2`
- `backend/clipping_batch_2.json`: `16e8954ac0923b3294801bfbc1a4763caa30c8c68a1e342ad8d693cb0b9d52ea`
- `backend/clipping_batch_3.json`: `941e825e37037c105d85453ddfe291ebce443ea5e8461dd25c84a0a4183d439c`
- `backend/clipping_batch_4.json`: `67cd8a8988b70697e23a14124ef3ff1c7d0cc835fe15f4e4422214d4d01e2387`
- `backend/clipping_batch_5.json`: `e1bab6a2c94b90164afaaec1da6dd8343347abe952dc8c24d6d4df7a950c7583`
- `backend/clipping_batch_6.json`: `d9f10408f022b82c49d7631502f2a0715c7933bcbe6112215a282dd1fa776fa0`

### PressThink 2014 recovery audit

Seven root-captured packets under
`%TEMP%/rosen-pressthink-recovery-2014-01` through
`%TEMP%/rosen-pressthink-recovery-2014-07` preserve the 31 official
PressThink pages missing from the archive's 2014 count. Every sequential call
returned HTTP 200 with curl exit 0. Offline replay matched all logged final
URLs, response sizes, SHA-256 values, and empty stderr files.

The offline audit extracted 943 direct article-body blocks containing 238,635
characters and 40,566 whitespace-delimited words. It compared exact and
normalized primary URLs, normalized titles, numeric URL tokens, body hashes,
and five-word body shingles against all 1,028 archive rows and all 37 staged
gap-fill rows. Candidates 1 through 27 and 29 through 31 are 30 distinct works
missing from both datasets.

Candidate 28, `How to be literate in what's changing journalism`, is the
PressThink original of `RECORD-00712`, whose IJNet version is an expanded
republication. The two bodies share 507 five-word shingles; 69.5473 percent of
the PressThink candidate's shingles appear in the existing row. The row also
names PressThink as the original publication and says IJNet republished it
with permission and added items 19 through 21. This candidate should be linked
as an original source rather than inserted as another work.

No archive row was imported or changed. Permanent IDs, insertion order,
rights, permission to publish recovered full text, taxonomy, entity identities,
and relationships remain curator decisions. The audit preserved the archive
SHA-256
`eb14023ff900777fe116092bfb116f1b81234574f721c381b8edfe11d467ae3c`
and gap-fill SHA-256
`3ad5fe0995e13e21b4dc70c9bb53c952ae2cb8e83ce530f9aaa3e368f9764754`.
Its independent validator passed 129 of 129 checks. The packet is under
`%TEMP%/rosen-pressthink-recovery-2014-audit`; its main hashes are:

- `capture-log-validation.json`: `9db4e8b148c20d4beb6ebd72f2c6880c66dc10725a3bab28322f68e04535a0f6`
- `source-metadata.json`: `a209a74fd6260f168719ffd124ae256373049705a44b39d0a699bad70b5f2e90`
- `body-extraction.json`: `b603f23788f07181e586f0cdca75ab50aa3f8928ec4e4f00819e4dbe8d75a868`
- `duplicate-analysis.json`: `79fd09cdd3406d64f0057bf666ea0ecfa7aa7612adaecc711638e61a6d397636`
- `proposed-fields.json`: `60cd249edf65da0a8127b80581e430e20416fc52cc4d5670038922bdca91e326`
- `audit-report.txt`: `83086d090700941497423f36dad3b97b934f46bcfafd3482cdc7d7a2ce42267c`
- `independent-validation.json`: `d1e791802ab0a7b5a2d7e1ad68f73b7b74835261520512e7233f28be6f5149ce`

### HuffPost source verification pilot 07

K2 reviewed `RECORD-00834` through `RECORD-00838` against five official
HuffPost responses and exited with code 0. The supplied fetch program ran once
and made one sequential request per record. The NDJSON and JSON call logs are
identical. All five responses succeeded on their first attempt:

| Record | Saved response |
| --- | --- |
| `RECORD-00834` | HTTP 200; 418,408 bytes; canonical slug corrected; HTML SHA-256 `6292d2c7b29cd7edbfd108b3474bba73db86180cb45a8c47b96b711ce38b6ff7`. |
| `RECORD-00835` | HTTP 200; 423,645 bytes; HTML SHA-256 `8116ec769f23f380eafbbc50c18fca6ce8e70302b35d18ddc171b88e05c3831c`. |
| `RECORD-00836` | HTTP 200; 428,936 bytes; HTML SHA-256 `010890aa45ff0034c56d4ee2b39e9e4ebec228c43d7464fe7e23f7f474506d17`. |
| `RECORD-00837` | HTTP 200; 425,127 bytes; canonical slug corrected; HTML SHA-256 `4628b4b90e858ab36b118250ce4c0d7756bf1abceb7f98c02cdf3b1002ca8cd7`. |
| `RECORD-00838` | HTTP 200; 419,542 bytes; canonical slug corrected; HTML SHA-256 `7ec2a3303f6142f22daea3467b431f5fed7f18ad0a8ee5302c5a83a77a3c3030`. |

Independent replay matched every logged response size and hash. K2 stderr
shows the supplied curl program and no wget, PowerShell web request, Python
requests, or httpx call. Official metadata confirms each author and
publication date. Stored titles match the source. K2 proposed stripping the
`<i>` markup from `RECORD-00834`; that proposal was rejected because the
official `og:title` preserves the exact markup already in the archive.

Ordered-token comparison supported the stored bodies. Some modern-page body
extraction counts were lower because the extractor omitted split text and
blockquote nodes. Independent literal checks found the supposedly missing
closing text for `RECORD-00834`, `RECORD-00836`, and `RECORD-00838` and the
omitted master-narrative blockquote for `RECORD-00837` in the saved official
HTML. The stored `raw_text` and archive-convention word counts were retained.

A focused failing regression was added before the repair. Snapshot comparison
confirms that only 28 approved cells changed:

- `RECORD-00834`: `url`, `summary`, `verified`, `notes`, and `needs_review`;
- `RECORD-00835`: `excerpt`, `pull_quote`, `summary`, `verified`, `notes`, and
  `needs_review`;
- `RECORD-00836`: `excerpt`, `summary`, `verified`, `notes`, and
  `needs_review`;
- `RECORD-00837`: `url`, `excerpt`, `summary`, `verified`, `notes`, and
  `needs_review`;
- `RECORD-00838`: `url`, `excerpt`, `summary`, `verified`, `notes`, and
  `needs_review`.

The focused regression passes, the archive validator reports no errors, and
the CRLF-aware diff check passes. The archive remains 1,028 rows by 38 columns,
UTF-8 without a BOM, with 1,029 CRLF record boundaries and unchanged embedded
newlines. Explicit archive `verified=FALSE` rows fell from 49 to 44; 40
HuffPost rows remain false with blank summaries. The pre-edit archive SHA-256
was `eb14023ff900777fe116092bfb116f1b81234574f721c381b8edfe11d467ae3c`;
the current SHA-256 is
`0c9d78f9ef8b9b93578df7271fdfac79e6f807b3b2ea2db43044274c6afd7e5e`.
The snapshot is under
`%TEMP%/rosen-huffpost-pilot-07-before-20260723-075101`.

The main K2 packet hashes are:

- `source-verification.json`: `e42e82f5759ed699782be3627234b26b0257312c7e39cb47feae31b011d50092`
- `body-comparison.json`: `c98736fbcc266f0abacf0a9f8f8baa428473f783c19865a34ba33bf539a17c4b`
- `proposed-field-updates.json`: `5f879439a99313ccf80d98bfde43d3aec58a22f07a4319655ddfe9d163beec33`
- `field-provenance.json`: `e94f8b92151913af4a13d27ade3f1717fc6f48a954cedefbbddc8274232a5794`
- `external-calls.ndjson`: `424c6ad28de043b32f1133a65da0abd78afa5b49d39370371d1e4f2d35239d9a`
- `external-calls.json`: `891e41a159a36b3abef5d964fee3b820feb6245bcc7afb62ef6dfe0064c7137c`
- `report.txt`: `6c2c8d73b4d01b4a69376d0523cff84e15981d0d007a892f297bdd7a427355fd`
- `stdout.log`: `7906978be9538ec6d8b50a29356e5f5342be87a0eabd5f4ad93ad2c3a51894a0`
- `stderr.log`: `da08c62f4b484f07521c95499218ae24e5a3137f498ed87ae7f0ae1e7fd98dbb`

### PressThink 2016 recovery audit

Three root-captured packets under
`%TEMP%/rosen-pressthink-recovery-2016-01` through
`%TEMP%/rosen-pressthink-recovery-2016-03` preserve the 12 official
PressThink pages missing from the archive's 2016 count. Offline replay matched
all 12 HTTP 200 responses, curl exit codes, final URLs, saved sizes, SHA-256
values, empty logged errors, and empty stderr files.

The audit classified candidates 1 through 11 as distinct missing works. Exact
and normalized primary URLs, normalized titles, numeric URL tokens, body
hashes, and meaningful body overlap found no same-work archive or staged
gap-fill row. Citations and reused passages were retained as relationship
evidence rather than misclassified as duplicates.

Candidate 12, `Speaking truth to audience power`, is an existing-source
mapping for `RECORD-00065`. The PressThink page says it publishes a fuller
version of Rosen's Guardian column and adds seven PressThink-only framing
blocks about the Daily Commercial editor's response. Candidate-body
containment is 0.416997 and existing-record containment is 0.865882. This needs
a curator decision about whether the PressThink edition is an alternate source
or a distinct expanded work; it was not inserted automatically.

No archive row was imported or changed by the audit. Permanent IDs, insertion
order, rights, permission to publish recovered full text, taxonomy, entity
identities, and relationships remain curator decisions. The audit began from
archive SHA-256
`eb14023ff900777fe116092bfb116f1b81234574f721c381b8edfe11d467ae3c`.
While it ran, the approved HuffPost pilot 07 changed exactly 28 fields on
`RECORD-00834` through `RECORD-00838`, producing archive SHA-256
`0c9d78f9ef8b9b93578df7271fdfac79e6f807b3b2ea2db43044274c6afd7e5e`.
The audit replayed its duplicate conclusions against both snapshots and found
the same result. Gap-fill SHA-256 remained
`3ad5fe0995e13e21b4dc70c9bb53c952ae2cb8e83ce530f9aaa3e368f9764754`,
and the repository status path list stayed unchanged.

The second offline validator passed 66 of 66 checks. The packet is under
`%TEMP%/rosen-pressthink-recovery-2016-audit`; its main hashes are:

- `capture-log-validation.json`: `25ef2897e7aadf34e92233b3fca08b8236c48cfe53f94a1d9ccebfd3f1c53cd5`
- `source-metadata.json`: `d79b8a6e4877b0c03ffcea6fd2d697884babc51746e90520d9f2ba0bfd827c67`
- `body-extraction.json`: `4b574ca19ef6a8c9d3626aa11d293a78c41f8174964c696cfdb4d0f8aacce684`
- `duplicate-analysis.json`: `6a2e2e9cb8cca591855d012239cd6a182cf18b8acffce1f03a34cf665bde37dd`
- `concurrency-check.json`: `e03226e21b1921dff33cca801bd769d5f7e39dd973c350fb05ffed12a68462a4`
- `proposed-fields.json`: `33faf5aa07561939e9f033ac7beacdd24b8240233a8b2b014c0e362c0dd00406`
- `audit-report.txt`: `fc1ef3baa92ca0279086e9f5991eb32b355905677d4a237345eb4947bdaa534a`
- `independent-validation.json`: `c6672b0e3ba99fb271abef53885062df5528a2f008658a2ce43e79c3b45e9d3c`

### PressThink sitemap gap capture census

The 2026-07-23 sitemap comparison identifies 182 candidate gaps across 2009
through 2021, 2025, and 2026. Every candidate now has preserved official
source evidence for offline audit:

| Year | Candidate gaps | Evidence state |
| --- | ---: | --- |
| 2009 | 2 | Two official HTML responses captured and replayed; audit pending. |
| 2010 | 15 | Fifteen official HTML responses captured and replayed; audit pending. |
| 2011 | 18 | All appear in the preserved 20-post official WordPress API response; full audit pending. |
| 2012 | 13 | Thirteen official HTML responses captured and replayed; audit pending. |
| 2013 | 27 | Twenty-seven official HTML responses captured and replayed; offline audit in progress. |
| 2014 | 31 | Audited as 30 missing works and one existing-source mapping. |
| 2015 | 21 | Audited as 20 missing works and one existing-source mapping. |
| 2016 | 12 | Audited as 11 missing works and one existing-source mapping. |
| 2017 | 10 | Ten official HTML responses captured and replayed; audit pending. |
| 2018 | 12 | Twelve official HTML responses captured and replayed; audit pending. |
| 2019 | 6 | Six official HTML responses captured and replayed; audit pending. |
| 2020 | 12 | Twelve official HTML responses captured and replayed; audit pending. |
| 2021 | 1 | Official HTML response captured and replayed; audit pending. |
| 2025 | 1 | Official HTML response captured and replayed; audit pending. |
| 2026 | 1 | Official HTML response captured and replayed; audit pending. |

An aggregate replay checked 38 HTML capture batches containing 164 unique
requested URLs. Their URL set exactly equals the sitemap gap set after the 18
2011 URLs are excluded. Every response is HTTP 200, its effective URL matches
the request, and its saved size and SHA-256 match the immutable call log; all
available stderr files are empty. The 2011 API snapshot contains all 18
remaining candidate URLs. Together these evidence sets cover all 182 sitemap
gaps with no duplicate capture URL.

Two one-entry PowerShell batches serialized `external-calls.json` as a single
object instead of a one-element array. Their append-only NDJSON entries remain
intact and match the JSON objects after shape normalization; neither log was
rewritten. One earlier 2015 batch used its reviewed JSON-only call log. The
aggregate HTML manifest SHA-256 is
`28b67699209f31a2fe897a4840eb68a1563c0aa087e762914d73bfe4b062f18e`.
The official 2011 API snapshot SHA-256 is
`8f2bf9803658f32e1cc0dc8f4a60fdeb23a05602db4a38f00584504b48e2457e`,
and the gap-report SHA-256 is
`7b503d34d5da2c0793590ed6ef5e69f61496dcb01600fae2caa959877db61ec5`.

This proves source-capture coverage, not that all 182 items are distinct works
or safe to publish. Duplicate/edition analysis, rights, full-text permission,
permanent IDs, taxonomy, entities, and relationships still require the audit
and curator checkpoints described above.

### PressThink 2013 recovery audit

Six root-captured packets under
`%TEMP%/rosen-pressthink-recovery-2013-01` through
`%TEMP%/rosen-pressthink-recovery-2013-06` preserve the 27 official
PressThink pages missing from the archive's 2013 count. Offline replay matched
all 27 HTTP 200 responses, curl exit codes, saved sizes, SHA-256 values, empty
stderr files, effective URLs, canonical URLs, and the equivalent instants in
the JSON-local and NDJSON-UTC timestamps.

All 27 candidates are distinct missing works. Exact and normalized URLs,
titles, numeric URL tokens, body hashes, and an independent 12-word overlap
comparison found no existing-source mapping, probable duplicate, or unresolved
case. Candidate 6 quotes the 2003 PressThink introduction inside a new
ten-year-anniversary post; candidate 24 introduces a quotation from a post
published two years earlier. The audit retained both as new works because the
source labels the reused text and the surrounding articles are distinct.

No archive row was imported or changed. Permanent IDs, insertion order,
rights, permission to publish recovered full text, taxonomy, entity identities,
and relationships remain curator decisions. The archive SHA-256 stayed
`0c9d78f9ef8b9b93578df7271fdfac79e6f807b3b2ea2db43044274c6afd7e5e`;
the staged gap-fill SHA-256 stayed
`3ad5fe0995e13e21b4dc70c9bb53c952ae2cb8e83ce530f9aaa3e368f9764754`;
and the repository status path list was unchanged.

The separate offline validator passed 27 of 27 capture replays, 27 of 27 exact
source-field comparisons, and all 27 classifications. The packet is under
`%TEMP%/rosen-pressthink-recovery-2013-audit`; its main hashes are:

- `capture-validation.json`: `7f9a9361f2e071d59035f4ef0d50bedee533ded6d63dbe7df275cba02b21775e`
- `audit-results.json`: `b688e9871d8e3ea1b2cce243bcacb28c1141955536ef4b9ec7d033b88b98e4af`
- `proposals.csv`: `b5b87aba3eafa5a693b568fd7c1f4b2bfa6cba80c459e9a3e3dd14a4c3ee950f`
- `field-provenance.csv`: `8fe7bd7e0a0a673b31e6a00707b23e8956bd4b68784b10bfe2f443a2b8a41d51`
- `independent-validation.json`: `393cb0e09554959db91a31c997bb1e1cf1658f9f589bb28641c3dcbc3da044e0`
- `report.md`: `ed8d1413579f8cdd8973798f7fea357ed24618ff28be34867923b7f49c41f02c`
- `packet-hashes.sha256`: `b8b76a4d8566162f48c473574771ed334f74d92b8efc5c79524270e6d372bb9d`

### PressThink 2012 recovery audit

Three root-captured packets under
`%TEMP%/rosen-pressthink-recovery-2012-01` through
`%TEMP%/rosen-pressthink-recovery-2012-03` preserve the 13 official
PressThink pages missing from the archive's 2012 count. Offline replay matched
all 13 HTTP 200 responses, curl exit codes, saved sizes, SHA-256 values, empty
stderr files, effective URLs, canonical URLs, selectors, structured and
visible dates, and the equivalent instants in the JSON and NDJSON logs.

All 13 candidates are distinct missing works. Exact and normalized URLs,
titles, numeric URL tokens, body hashes, and an independent 12-word overlap
comparison found no existing-source mapping, probable duplicate, or unresolved
case. Candidate 12 shares James W. Carey's transmission-versus-ritual model
quotation with `RECORD-00278`; its URL, title, date, Iowa caucus analysis, and
remaining text establish it as a separate work.

No archive row was imported or changed. Permanent IDs, insertion order,
rights, permission to publish recovered full text, taxonomy, entity identities,
and relationships remain curator decisions. The archive SHA-256 stayed
`0c9d78f9ef8b9b93578df7271fdfac79e6f807b3b2ea2db43044274c6afd7e5e`;
the staged gap-fill SHA-256 stayed
`3ad5fe0995e13e21b4dc70c9bb53c952ae2cb8e83ce530f9aaa3e368f9764754`;
and the repository status path list was unchanged.

The separate offline validator passed 13 of 13 capture replays, 13 of 13 exact
source-field comparisons, and all 13 classifications. The packet is under
`%TEMP%/rosen-pressthink-recovery-2012-audit`; its main hashes are:

- `capture-validation.json`: `62e89ea0d0eab91ba306b46ca20b1cb28c1bc2658669afed502826f0e2a84c7e`
- `source-metadata.json`: `7554db2d7ef7f1c275cb66f652b608aabdafa60329ba3a1b9b52637a279f7dcb`
- `proposals.csv`: `f126b6cea62cbb3a5a109340935103114db8f1699a5090bf628eb5cd040fd19c`
- `field-provenance.csv`: `664fa0c0d3ba1bd91b7d93e48fbcc43d1311e00b0223eef926ea8822e97cc539`
- `independent-validation.json`: `1d7931929e9f1cf6f926eac52eae07c35ac6bdb4e6667146ed9b8ae18338f17d`
- `report.md`: `f35cb939c1da81b74040ebe573a184e20c7169379ea0218638dee5b5b9c711c3`
- `packet-hashes.sha256`: `4b35f126d3e2f5b8e2b83186683c7bb3799054983f1dcae8bcbba030031066d3`

### HuffPost verification pilot 08

K2 reviewed `RECORD-00839` through `RECORD-00843` against five root-captured
official HuffPost responses under `%TEMP%/rosen-k2-huffpost-pilot-08`. Every
request succeeded on its first attempt with HTTP 200 and curl exit 0. Saved
byte counts and SHA-256 values match both request logs:

- `RECORD-00839`: 417,116 bytes; `64c525c4fdab94598ed8bd923714e5ecf253fa9ea6ab95081061aecd5a8c9a17`
- `RECORD-00840`: 431,259 bytes; `9cefc4113b850579158d1afd05b188b9b226427519f218388a5fc3963cd67080`
- `RECORD-00841`: 402,595 bytes; `cc43debf33cd7a300cad3820192381508c90cf3c9dc27d232ab055971ec86647`
- `RECORD-00842`: 424,494 bytes; `381f2cae7f419e2624b7710ffffbe3de06eeda388de0e606d982a2ab48f447cc`
- `RECORD-00843`: 422,798 bytes; `a4db8e9aa4a6001ae00fa06b61551f3c5a5f4918f3d7ad7c5c3eddae355a9f87`

Independent review re-parsed the official JSON-LD and found `Jay Rosen` as
the author on all five pages. Official `og:title` and publication dates match
the archive exactly. A separate HTML-body extractor confirmed the proposed
excerpts after entity decoding, tag removal, whitespace collapse, and
normalized-token comparison. It also found direct body support for every
accepted summary claim. Ordered normalized-token comparison covered every
stored `raw_text` token, so all bodies and word counts were retained.

Two K2 claims were rejected or corrected. `RECORD-00841` did not redirect;
its corrected `_1_b_56446` URL is supported by the official canonical link
alone. K2's statement that the final URL confirmed the redirect was false.
K2 also described `RECORD-00842` as presenting a non-partisan stance, while
the source says the Huffington Post partnership has a clear political identity.
The accepted summary instead describes the rolling launch, contributor
standards and support, reporting structure, and editorial identity discussed
in the Q&A. The `RECORD-00840` and `RECORD-00841` summaries were likewise
tightened to claims stated directly in the saved bodies.

A focused failing regression was added before the repair. Snapshot comparison
confirms that only 26 approved cells changed:

- `RECORD-00839`: `excerpt`, `summary`, `verified`, `notes`, and `needs_review`;
- `RECORD-00840`: `excerpt`, `summary`, `verified`, `notes`, and `needs_review`;
- `RECORD-00841`: `url`, `excerpt`, `summary`, `verified`, `notes`, and `needs_review`;
- `RECORD-00842`: `url`, `excerpt`, `summary`, `verified`, `notes`, and `needs_review`;
- `RECORD-00843`: `summary`, `verified`, `notes`, and `needs_review`.

The patch tool initially changed the five edited record terminators to LF; the
repair normalized exactly those terminators back to CRLF before acceptance.
The focused regression passes, the archive validator reports no errors, and
the CRLF-aware diff check passes. The archive remains 1,028 rows by 38 columns,
UTF-8 without a BOM, with 1,029 CRLF record boundaries and 81,623 unchanged
embedded bare LF characters. Explicit archive `verified=FALSE` rows fell from
44 to 39; 35 HuffPost rows remain false with blank summaries. The pre-edit
archive SHA-256 was
`0c9d78f9ef8b9b93578df7271fdfac79e6f807b3b2ea2db43044274c6afd7e5e`;
the current SHA-256 is
`d8ae5378cfb2a28dbde40d18768b8622fa2f5a233d51770abb7070a4f5956b92`.
The snapshot and cell comparison are under
`%TEMP%/rosen-huffpost-pilot-08-before-20260723-082752`; the comparison
SHA-256 is
`075afaeee37e140008e79a825cbe7a70a0516ab1f1e3007ac5cb7f48389f5bae`.

The main K2 packet hashes are:

- `source-verification.json`: `68eed9d22853d7419159cfc832d023304e3edb01a2bb5087d85c9c0862139b7e`
- `body-comparison.json`: `ccc7c49a5c62eebaa10b09f305d2d7f36009f651970ca744591934fd26bf5719`
- `proposed-field-updates.json`: `dc490836b1563bb0658c50c34a94b7cb506f81c885c94fbc7b6dc4dbc75a01df`
- `field-provenance.json`: `a6d9296a8bf9719c60ecb11448f77d76a1adef618128002fa9e86aa3f5d2c2c6`
- `external-calls.ndjson`: `04b17cf3c819aae3468fa8abd280242b8fa05a4b0a503226e248accb970fb3dd`
- `external-calls.json`: `38e3ab18e67b6d6962cfd6c208f7d32e274c537b1db73921449b2e6c01a37652`
- `report.txt`: `f11c746353d4436fe218e28f8d76d8c8c1397f671dd1ec3256d7ad57dc3b3353`
- `stdout.log`: `f7711e20e798e9f62d781732f1f556aff454a077f5c6594627f79c040eb797f5`
- `stderr.log`: `c9fdb907a6bc641bcdb948adde47344355de707444776aaff7710e9f804a9bd3`

### PressThink 2017 recovery audit

Two root-captured packets under `%TEMP%/rosen-pressthink-recovery-2017-01`
and `%TEMP%/rosen-pressthink-recovery-2017-02` preserve the ten official
PressThink pages missing from the archive's 2017 count. Offline replay matched
all response logs, HTTP 200 statuses, curl exit codes, saved sizes, SHA-256
values, empty errors and stderr files, effective URLs, canonical URLs, and
local-versus-UTC publication timestamps.

All ten candidates are distinct missing works. Candidates 1 through 8 have no
canonical-URL reference or same-work signal in the current archive. Candidate
9 is cited by `RECORD-00720`; candidate 10 is cited or discussed by
`RECORD-00708`, `RECORD-00732`, and `RECORD-00760`. Those references have
distinct URLs and forms with near-zero body overlap, so they are not duplicate
records.

No archive row was imported or changed. Permanent IDs, insertion order,
rights, permission to publish recovered full text, taxonomy, entity identities,
and relationships remain curator decisions. The archive start and end SHA-256
was `d8ae5378cfb2a28dbde40d18768b8622fa2f5a233d51770abb7070a4f5956b92`;
the repository status path list was unchanged.

The first validator passed 184 of 184 checks. A separate lxml and eight-token
replay passed 237 of 237 checks. The packet is under
`%TEMP%/rosen-pressthink-recovery-2017-audit`; its main hashes are:

- `capture-validation.json`: `ebea30113d6bd0352adfb4e288e47c7a061466b04b301b311e2e50387f6b5d32`
- `source-metadata.json`: `6089465adb23c269d4d5fdef4acd97445246ecbd38e64051e9daaf3f4218e6c1`
- `body-extraction.json`: `7c04984375cc0caffddea4d427be81c05f5b041d02f83844133295c7bd2e6eb7`
- `duplicate-analysis.json`: `c328a27e0cf605bcbdf9fbea8fe1258754dee43b7acf15a42401aad73f13fac3`
- `proposals.csv`: `20104ec4ca695671e057c7a0821dfca77651c9511594baf6902eec3ff9f084c9`
- `provenance.json`: `715b3dbfb0a9b101d5925f43ef939c96d6fcfdd755a4cc3d3010a2b42d740b7f`
- `independent-validation.json`: `240dff3d78a825947aa124c4dff80487d9aa4a512729875cb81539e101ef9252`
- `report.md`: `0c04db328c75f39995ee215d140d9a611d465a991a13ece2bce0729388e36cf8`
- `hashes.json`: `102bbbfdab6597c1b2c2f280bf5225da73418a57bd92e365af0fff438dd4a1cc`

### HuffPost verification pilot 09 evidence packet

K2 reviewed `RECORD-00844` through `RECORD-00848` against five official
HuffPost responses under `%TEMP%/rosen-k2-huffpost-pilot-09`. The single
reviewed fetch program ran once. Every request succeeded on its first attempt
with HTTP 200 and curl exit 0. Saved byte counts and SHA-256 values match both
request logs:

- `RECORD-00844`: 423,626 bytes; `81efb4c1054eadda15748ffea8cfc0afe3232fc62ddda9079a3a6719c805b3ef`
- `RECORD-00845`: 421,777 bytes; `ab3c305fded823f14ed251b7398f3b06d5aa40280ef74d252ca4330b7c353dd7`
- `RECORD-00846`: 419,538 bytes; `d1aa601f359f0032c03450a61053dcdd3540f447468d99a1f85ef5e773ba5920`
- `RECORD-00847`: 435,847 bytes; `d86954cf867853a02f6564c6497d299cdebbe31aff264aa6484b48742ee1d92c`
- `RECORD-00848`: 436,981 bytes; `02251d36950723d42159dd8070954f1d02d0cd27c2106228ee93a9a799c7532e`

The packet accepts all five stored titles, authors, publication dates, bodies,
word counts, excerpts, and pull quotes. Ordered normalized-token coverage is
100% for every stored body with no unmatched block of three or more tokens.
It proposes one source-identity repair: change `RECORD-00847` from the truncated
`would-you-guys-like-us-t_b_63176` URL to the final and canonical
`would-you-guys-like-us-to_b_63176` URL.

An independent read-only replay passed 22 of 22 checks covering JSON and
NDJSON equality, all target keys, statuses, exit codes, saved sizes, saved
hashes, and ordered body coverage. The archive snapshot remains byte-identical
at SHA-256
`d8ae5378cfb2a28dbde40d18768b8622fa2f5a233d51770abb7070a4f5956b92`.

No repository data was changed from this packet. K2 correctly treated summary,
verification, review state, and semantic enrichment as outside its safe field
mask, so the next session must independently draft source-backed summaries,
add a failing regression, review the URL proposal, and apply the five-record
batch before marking these rows verified.

The main packet hashes are:

- `source-verification.json`: `f3f46db7516490aaa7d897644b0522c128bad196891a7b61184d9011e00a395e`
- `body-comparison.json`: `e74fffc0643928c1c1806208e493e095186220839785947ab2e37c2f7f708c5b`
- `proposed-field-updates.json`: `7b610f31bd982da778c196dcaf3325119bacf171a89a417d5fa211277e906e40`
- `field-provenance.json`: `16f877214eacbe95aa44435dd7144c85a07fe6decc3f21175ccef4fe3240e269`
- `external-calls.ndjson`: `b1efc4e80d612f537168845b253698379536a61bf24487515e423aae42efdfc0`
- `external-calls.json`: `60571643f746563b5ee1f5a3a89e9d5fe036b7c3216fef4d2d377efc29403a08`
- `report.txt`: `ec3d2160fad46edde82ee75ba673d91caf6c39559362d293cf5562f059b2395f`
- `stdout.log`: `67ff137883e10a4009c8a8c67397c142bacd47de3ef65e16b35ecd6debc8d5f3`
- `stderr.log`: `32d6f10b850649ebd1c58bed344f01ec01b0fa7a7d7f0db7d3144ba6cf455e81`

### HuffPost verification pilot 09 applied

The branch then accepted the pilot-nine packet into canonical data. A failing
regression was added first for `RECORD-00844` through `RECORD-00848`, locking
the five official-source hashes, the existing raw-text hashes, the source
title/author/date/word-count fields, the accepted excerpts and pull quotes, the
`RECORD-00847` URL repair, and the five source-backed summaries.

Accepted row changes:

- `RECORD-00844`: added a summary describing Gina Cooper, netroots volunteers,
  YearlyKos, aggregated blogger attention, participation, and OffTheBus.
- `RECORD-00845`: added a summary describing press-blogosphere relations at
  YearlyKos, Dan Gillmor's readers-know-more lesson, and unresolved Iraq-war
  accountability.
- `RECORD-00846`: added a summary describing savviness as Rosen's account of
  political journalism's vulnerability to Karl Rove.
- `RECORD-00847`: corrected the URL to
  `https://www.huffpost.com/entry/would-you-guys-like-us-to_b_63176` and
  added a summary describing the White House press corps and Bush's managed
  Iraq-trip press event.
- `RECORD-00848`: added a summary describing the missing Bush-era master
  narrative of executive-power expansion, centered on Charlie Savage, Jack
  Goldsmith, and the Cheney project.

All five rows are now `verified=TRUE` and `needs_review=FALSE`, with notes
pointing to `%TEMP%/rosen-k2-huffpost-pilot-09` and the saved HTTP 200 source
SHA-256 values. The targeted pilot-nine regression now passes. The archive CSV
SHA-256 after application is
`11ffcaa406a01a95dcdf24045675a42b8aaadfdd7429045fb654397e398186b8`.

The update reduced archive rows with blank summaries from 34 to 29 and archive
rows explicitly marked `verified=FALSE` from 38 to 33. The archive CSV remains
1,028 rows by 38 columns, UTF-8 without a BOM, with 1,029 CRLF record
boundaries and 81,117 embedded bare LF characters.

### HuffPost verification pilot 10 evidence packet and application

The branch built `%TEMP%/rosen-k2-huffpost-pilot-10` for `RECORD-00849` through
`RECORD-00853`. All five official HuffPost requests succeeded with HTTP 200:

- `RECORD-00849`: 423,158 bytes; `b6741da8baf7628d4237fa9528672f9a6d24b37fec76b06c44292ec5027e1eab`
- `RECORD-00850`: 416,826 bytes; `2229ffaf2eca673c5151ff1d889c7122014d59125f623ad935a0bf5e59ba43dc`
- `RECORD-00851`: 433,345 bytes; `094c0b519ef803c83f504f13395f6017875d5c7f1260fcf8c50058fc1e3e3659`
- `RECORD-00852`: 412,959 bytes; `e6ecbe33ab28b04cad69d43c2befca17253a61ad44c05a0a7ecd60c390d45067`
- `RECORD-00853`: 454,346 bytes; `c657d296262eb839af1965ab8c7ced33a50523b40f290c7e9060d41b35b8a540`

The first local body-coverage pass produced a false low score for
`RECORD-00850` because the source HTML split `_The Hill_'s` across markup. After
normalizing possessives, all five stored bodies reached 100% ordered normalized
token coverage against the saved official response.

Grok reviewed the packet in read-only mode. The useful objections were accepted:
the first `RECORD-00851` summary incorrectly named Tony Snow, the first
`RECORD-00852` summary imported the fuller thesis from `RECORD-00853`, and
several excerpt/pull-quote fields needed stronger body grounding before the
rows could be marked verified.

Accepted row changes:

- `RECORD-00849`: added a summary about Rather's CBS lawsuit, Rathergate, the
  Bush National Guard story, and Rather's self-image as a driven reporter.
- `RECORD-00850`: corrected the URL to
  `https://www.huffpost.com/entry/the-hill-restores-armstro_b_77979`,
  normalized the verified display title to remove raw `<i>` markup, replaced
  the excerpt with a source-body passage, and added a summary about Rosen's Q&A
  with Hugo Gurdon over The Hill restoring Armstrong Williams after the payola
  scandal.
- `RECORD-00851`: replaced the excerpt and pull quote with source-body
  passages and added a summary about conservative elite contempt, the
  liberal-media thesis, Dan Bartlett, Karl Rove, and Ari Fleischer.
- `RECORD-00852`: corrected the URL to
  `https://www.huffpost.com/entry/when-candidate-vetting-ru_b_88924`,
  replaced the excerpt with a source-body passage, and added a summary that
  keeps the record as a short reader prompt rather than importing the later
  thesis from `RECORD-00853`.
- `RECORD-00853`: replaced the excerpt with a source-body passage and added a
  summary about the pattern-recognition follow-up, reader answers, and newsroom
  self-image problems in Washington Post and New York Times stories.

All five rows are now `verified=TRUE` and `needs_review=FALSE`, with notes
pointing to `%TEMP%/rosen-k2-huffpost-pilot-10` and their saved HTTP 200 source
SHA-256 values. A failing pilot-ten regression was added first and now passes.
The archive CSV SHA-256 after application is
`2065ef04985ab838ac13701b68538f7f9d393a84fdcc75e78a5f1404b88141da`.

Serving `RECORD-00853` surfaced a source entity first-mention mismatch:
`C0007` (`Anti-veneration`) pointed to `RECORD-00853`, but
`RECORD-00014` has two earlier served `C0007` relationship edges. The canonical
entity row now uses `RECORD-00014` with a note documenting the correction. The
entity CSV SHA-256 after this repair is
`34f8d4cf9eee0cbebbb455e9b3b33d2ad8b8d6a30d7805a43f871932390225fe`.

Grok reviewed the summary draft in read-only mode and rejected only
`RECORD-00851` as missing core argument structure. The accepted objection was
applied: the final summary includes Huckabee's rise, elite contempt, Bruce
Bartlett's impact-not-ideology standard, conservative attacks on media bias,
and Rosen's larger concern about executive power.

Changes applied:

- `RECORD-00849`: summary added; `verified=TRUE`; `needs_review=FALSE`;
  `low_confidence=FALSE`; notes now cite official response SHA-256
  `b6741da8baf7628d4237fa9528672f9a6d24b37fec76b06c44292ec5027e1eab`.
- `RECORD-00850`: URL corrected to
  `https://www.huffpost.com/entry/the-hill-restores-armstro_b_77979`;
  excerpt repaired; summary added; `verified=TRUE`; `needs_review=FALSE`;
  `low_confidence=FALSE`; notes now cite official response SHA-256
  `2229ffaf2eca673c5151ff1d889c7122014d59125f623ad935a0bf5e59ba43dc`.
- `RECORD-00851`: pull quote repaired; summary added; `verified=TRUE`;
  `needs_review=FALSE`; `low_confidence=FALSE`; notes now cite official
  response SHA-256
  `094c0b519ef803c83f504f13395f6017875d5c7f1260fcf8c50058fc1e3e3659`.
- `RECORD-00852`: URL corrected to
  `https://www.huffpost.com/entry/when-candidate-vetting-ru_b_88924`;
  excerpt repaired; summary added; `verified=TRUE`; `needs_review=FALSE`;
  `low_confidence=FALSE`; notes now cite official response SHA-256
  `e6ecbe33ab28b04cad69d43c2befca17253a61ad44c05a0a7ecd60c390d45067`.
- `RECORD-00853`: excerpt repaired; summary added; `verified=TRUE`;
  `needs_review=FALSE`; `low_confidence=FALSE`; notes now cite official
  response SHA-256
  `c657d296262eb839af1965ab8c7ced33a50523b40f290c7e9060d41b35b8a540`.

The focused regression
`node --test --test-name-pattern "HuffPost pilot ten" tests\csv-quality.test.js`
failed before the CSV edit because `RECORD-00849` had a blank summary, then
passed after the five-row patch. Raw-text SHA-256 values stayed unchanged:

- `RECORD-00849`: `3340135a7b379a8633e36b8f7c95aa0c27a38b6b261eeeb827d202470755fb1a`
- `RECORD-00850`: `75c77a15a60f496db735f7d9529d82570c53c1caa3bbce1b8e5f13acee49d4f4`
- `RECORD-00851`: `761fffa4f70e34427eafb1d8b042f0da5fe4a77a967b60086c794229e1d85dea`
- `RECORD-00852`: `2fd0be897328e359679db375ac829982e49c4322ffa7f3dea872acf646ce7bee`
- `RECORD-00853`: `03f54e83eb5a54551ff2b7a26a738a1478ec8a327aa77cfc2da115f0a1dc1e7f`

Post-application row counts:

- Archive rows: 1,028.
- Blank archive summaries: 25, down from 30.
- Archive rows not explicitly verified: 29, down from 34.
- Generated records after export: 26,667.
- Entities: 7,389.
- Relationships: 10,804.

Validation:

- `python backend\scripts\validate_archive_data.py`: no errors.
- `npm run test:data:extraction-coverage`: expected completion gate still fails
  on 78 records with raw text but no extracted relationships.
- `npm run test:data`: expected eight completion gates still fail: three core
  blanks, 25 blank summaries, 29 unverified archive records, eight `#NN08`
  capture-year dates, 54 non-Rosen Bluesky profile URLs, 54 non-Rosen Bluesky
  copyright assignments, 29,693 unverified social rows, and 50 blank entity
  first mentions. The pilot-ten regression passes.
- `git -c core.whitespace=trailing-space,cr-at-eol diff --check`: no whitespace
  errors; Windows line-ending warnings only.

Packet artifact SHA-256 values:

- `source-verification.json`: `48bfd5e59678ab879b460650988f9520e6429d4e21670c96522983937e9cc5ad`
- `body-comparison.json`: `4b59d45bf6883b7a361bdcd51db10a529c725ecfa7f85dd7cbf19385b1f842d5`
- `proposed-field-updates.json`: `e03b21729a8468488188b2a65ef8fa944d911760d6ccac1bb23f9c0628760d59`
- `field-provenance.json`: `f50c8471b85061b038abc811e3644be46a440a52a4097a79e4102f315d7a82f4`
- `external-calls.ndjson`: `5ce210494585276f47543dd14b975ebc82ef3323c0629c389626921fd65c0a5a`
- `external-calls.json`: `f3f49b506ef61ce28e50c26f4c94ff5f3b1d71077748ed831654d1f6ed3ab685`

Final SHA-256 values after export:

- `data/archive_records-public.csv`: `fdf5336203242e109f248de85d35fe14757be7f44f3ddf7051f08df62dacdc50`
- `data/social_posts.csv`: `3c850bca0491b44ec7b1da805e61f8b3fbfaea8d80e44c0c24d431c38031dedf`
- `data/extracted_entities.csv`: `5833f0fec30553c1a1ee6fd5fe8663bbe396a32efd0ef3638ad59dcd8063d1a9`
- `data/extracted_relationships.csv`: `181b5acf3d3d3dd0f5f123885e542f8ff56ad7d9fd736f1eae281818918f4c72`
- `data/archive-data.json`: `d2e2dddb78c0dd6d343799273f2bf8ef72c47aa90b8fc3d711f68b64df060da1`
- `data/archive-core.json`: `ecc03f4852a009025c6b8282c4afcb6a75c85a91159e3d2483628bc25b14ce19`
- `data/archive-details.json`: `4ca48aa51d4ce9e70a286dc86aa1e28d99622dc67bcf3b86801f59159f944790`
- `data/archive-entities.json`: `73e939283f9b1f4afc953f4a4c8fb1d53cdce69af48be085e447d9f85b156733`
- `data/archive-analytics.json`: `8ee5c5040e316c35b2b23f1708c6968373cc5c5703cf4550ac74457f0cbae67d`

### HuffPost verification pilot 11 applied

`RECORD-00854` through `RECORD-00858` were applied from the saved packet under
`%TEMP%/rosen-k2-huffpost-pilot-11` without another network request. The K2
worker captured five first-attempt official HTTP 200 responses, verified the
stored titles, authors, dates, bodies, word counts, and pull quotes, and found
no unresolved items. It rejected the stored excerpts because they were source
description metadata rather than contiguous article-body passages.

Grok reviewed the first summary draft in read-only no-web mode. It accepted
`RECORD-00855`, `RECORD-00857`, and `RECORD-00858`, and rejected two summaries:
`RECORD-00854` overemphasized Pincus and missed Clark Hoyt, Josh Marshall, and
transparent political conviction; `RECORD-00856` used unsupported "honorable
mythology" and blurred McCain's access with demonstrated mastery. Both
objections were applied.

Changes applied:

- `RECORD-00854`: URL corrected to
  `https://www.huffpost.com/entry/walter-pincus-of-the-post_b_92019`;
  body-backed excerpt added; summary added; `verified=TRUE`;
  `needs_review=FALSE`; `low_confidence=FALSE`; notes now cite official
  response SHA-256
  `1dacc962fe486d4bf1ba6d0fb8427a4120100a4f6662fc9f03f7bf6b8d3cd42d`.
- `RECORD-00855`: body-backed excerpt added; summary added; `verified=TRUE`;
  `needs_review=FALSE`; `low_confidence=FALSE`; notes now cite official
  response SHA-256
  `99eee19f175791a76156c90f92c23f1efe6685ee1816b8723a8634e82cdf5df8`.
- `RECORD-00856`: body-backed excerpt added; summary added; `verified=TRUE`;
  `needs_review=FALSE`; `low_confidence=FALSE`; notes now cite official
  response SHA-256
  `61069523ad8e8d889f0c7165227a32150dc4812e27ab0885899523d42de7e7b7`.
- `RECORD-00857`: body-backed excerpt added; summary added; `verified=TRUE`;
  `needs_review=FALSE`; `low_confidence=FALSE`; notes now cite official
  response SHA-256
  `b910fdc1de0d3682ba28281a7ba056949a2e08a59f5ada2c338a8ac72c5de842`.
- `RECORD-00858`: body-backed excerpt added; summary added; `verified=TRUE`;
  `needs_review=FALSE`; `low_confidence=FALSE`; notes now cite official
  response SHA-256
  `fc27d7dc586be1c17fc929217f5c15bb7d58d4fb108f45dec56552bc5752f7c0`.

The focused regression
`node --test --test-name-pattern "HuffPost pilot eleven" tests\csv-quality.test.js`
failed before the CSV edit because `RECORD-00854` still used the shortened
non-canonical URL, then passed after the five-row patch. A first local pre-check
computed wrong raw-text hashes with a line splitter that is invalid for this
multiline CSV; the regression was corrected to use the K2 `body-comparison.json`
hashes and the same `csv-parse` semantics as the test suite. Correct raw-text
SHA-256 values stayed unchanged:

- `RECORD-00854`: `ef2ddee448169bdbc15a7b79665a8b32f3ba22ae9f2db87908324d5d2c3f2c61`
- `RECORD-00855`: `c2ca3b27f4321ff8980ec768a320cc143d21825810afecb63e097ff094a73c34`
- `RECORD-00856`: `2debe6510d79803d87d00a70e159323b532e1a9dcdfc6c4e8d0cb89d2f21d778`
- `RECORD-00857`: `22c51b32da698e47140d442dcd86d43114d7f764b32fe62ce559bf03d5f8f6af`
- `RECORD-00858`: `a41a108da674f02a7e6a6264a5087db9275e4933053ce1cb747700eb5196c4cb`

Post-application row counts:

- Archive rows: 1,028.
- Blank archive summaries: 20, down from 25.
- Archive rows not explicitly verified: 24, down from 29.
- Generated records after export: 26,672.
- Entities: 7,389.
- Relationships: 10,804.

Validation:

- `python backend\scripts\validate_archive_data.py`: no errors.
- `npm run test:data:extraction-coverage`: expected completion gate still fails
  on 78 records with raw text but no extracted relationships.
- `npm run test:data`: expected eight completion gates still fail: three core
  blanks, 20 blank summaries, 24 unverified archive records, eight `#NN08`
  capture-year dates, 54 non-Rosen Bluesky profile URLs, 54 non-Rosen Bluesky
  copyright assignments, 29,693 unverified social rows, and 50 blank entity
  first mentions. The pilot-eleven regression passes.

Packet artifact SHA-256 values:

- `source-verification.json`: `8bf7f250af5cfe0211518f268ed3270130aef01fd6fef1437b190e5452f37a69`
- `body-comparison.json`: `aae26ec3508d35689349405529ba2c141bed145ef03cd39880d9df2caac814bc`
- `proposed-field-updates.json`: `42eabb289cc4ebe78be837f72c9d7deed3ea37071451631725360de462823991`
- `field-provenance.json`: `fb04e472fc887f04db01351a5bae34397097afe9f8e8d98e48d48564214d8bbf`
- `external-calls.ndjson`: `3f6d7cb9c4ae5f82ec2373db2e267788956fd6d34b1b0ad86419ecf9cf33a75e`
- `external-calls.json`: `7f266975ce1c03cfb2f003849fb299d4e1af698052831ceda0ff18406c569e9b`
- `grok-summary-review.txt`: `87896301301824b70b41728493f86e2b6b3f5cd31d9f1e8e6b9df00baeec05f2`
- `report.txt`: `de1177478b9a9ddc7aef16570330ef25bfd8b70ecf851414b2fa7f2003e9016c`

Final SHA-256 values after export:

- `data/archive_records-public.csv`: `3dc0e08888a6a641e6a8f5c1ea3531bb459441f6ec44545ad53026751e613488`
- `data/social_posts.csv`: `3c850bca0491b44ec7b1da805e61f8b3fbfaea8d80e44c0c24d431c38031dedf`
- `data/extracted_entities.csv`: `5833f0fec30553c1a1ee6fd5fe8663bbe396a32efd0ef3638ad59dcd8063d1a9`
- `data/extracted_relationships.csv`: `181b5acf3d3d3dd0f5f123885e542f8ff56ad7d9fd736f1eae281818918f4c72`
- `data/archive-data.json`: `c105a0a956b5ee7613919b2f33a82c7ce278f340a0459a2636de5d2918443eb4`
- `data/archive-core.json`: `a0d5ffff28044d647d6ab63bafd2ce6973b691793620a38cea20c61349c068bb`
- `data/archive-details.json`: `578d2f137f1f053ee3cc8bc72b02c134a2f417eb89c7031faa3571da2787e025`
- `data/archive-entities.json`: `2445f36dbacde8da21b50a9c76b852075ca5eaadeb7404ed584340006b99c877`
- `data/archive-analytics.json`: `7be364e05556035f89c3925d28cfc0ef21f4078c4bea443d1241fccd8a6491fa`

### HuffPost verification pilot 12 applied

`RECORD-00859` through `RECORD-00863` were applied from the saved packet under
`%TEMP%/rosen-k2-huffpost-pilot-12`, with supplemental Wayback evidence for the
three short `#NN08` rows whose modern HuffPost URLs now return 404. The K2
worker verified `RECORD-00859` and `RECORD-00860` from first-attempt official
HTTP 200 responses. It left `RECORD-00861` through `RECORD-00863` unresolved
against modern HuffPost; the primary agent then fetched the exact Wayback
captures already cited inside the stored raw text and saved those responses in
`%TEMP%/rosen-k2-huffpost-pilot-12/wayback-supplemental`.

Grok reviewed the summary draft in read-only no-web mode and accepted all five
summaries. No objections were applied.

Changes applied:

- `RECORD-00859`: summary added; `verified=TRUE`; `needs_review=FALSE`;
  `low_confidence=FALSE`; notes now cite official response SHA-256
  `cdf43c9170b945d23b37518cbf746f242530271cbd2b7117faa89fc3a22f864d`.
- `RECORD-00860`: summary added; `verified=TRUE`; `needs_review=FALSE`;
  `low_confidence=FALSE`; notes now cite official response SHA-256
  `e541bfca40e39caabee788a7775fedf23e731f0007836fd84d415714ce44eb06`.
- `RECORD-00861`: body-backed excerpt repaired from the archived capture;
  summary added; `verified=TRUE`; `needs_review=FALSE`;
  `low_confidence=FALSE`; notes now cite Wayback capture SHA-256
  `0041b650c6c2d9689c1337ffe71f62db091c55950fa2bfdacd5bcdd63ca41afe`.
- `RECORD-00862`: publication date corrected from `2013-11-15` to
  `2008-07-19`; body-backed excerpt repaired from the archived capture; summary
  added; `verified=TRUE`; `needs_review=FALSE`; `low_confidence=FALSE`; notes
  now cite Wayback capture SHA-256
  `94c9e65f3e58330739ad36373c6cafcd88af3c7845615ca5478975c3e0830537`.
- `RECORD-00863`: publication date corrected from `2013-11-15` to
  `2008-07-19`; body-backed excerpt repaired from the archived capture; summary
  added; `verified=TRUE`; `needs_review=FALSE`; `low_confidence=FALSE`; notes
  now cite Wayback capture SHA-256
  `2ecba87badcf6807880b33ac689eba97e49bb267cbf8f26f8827a27c6dfd0b7d`.

The focused regression
`node --test --test-name-pattern "HuffPost pilot twelve" tests\csv-quality.test.js`
failed before the CSV edit because `RECORD-00859` still had a blank summary,
then passed after the five-row patch. Raw-text SHA-256 values stayed unchanged:

- `RECORD-00859`: `c012883e030a441f5bc519055e6553f32dfa5ccbd9411fb684f0a2dbc9409d2b`
- `RECORD-00860`: `7e8f39348d07529ed28fd9019a529ce8852b4a9591da09f7869760b2940bcd8b`
- `RECORD-00861`: `e5c37b47d7f36cbd0fe5a8b44c7405c99379cc0cc16e69edc32920151c866fda`
- `RECORD-00862`: `9946a7dc23ae8c527bb54b6a1a86c3fd00c6c3b746a369da6943cba908417153`
- `RECORD-00863`: `81d637bcf5728a3fcf8d4e1edfda5ccfa6c8a5ffe43a3687792bac94432c7bf9`

Post-application row counts:

- Archive rows: 1,028.
- Blank archive summaries: 15, down from 20.
- Archive rows not explicitly verified: 19, down from 24.
- `#NN08` rows with capture-year dates: 6, down from 8.
- Generated records after export: 26,677.
- Entities: 7,389.
- Relationships: 10,804.

Validation:

- `python backend\scripts\validate_archive_data.py`: no errors.
- `npm run test:data:extraction-coverage`: expected completion gate still fails
  on 78 records with raw text but no extracted relationships.
- `npm run test:data`: expected eight completion gates still fail: three core
  blanks, 15 blank summaries, 19 unverified archive records, six `#NN08`
  capture-year dates, 54 non-Rosen Bluesky profile URLs, 54 non-Rosen Bluesky
  copyright assignments, 29,693 unverified social rows, and 50 blank entity
  first mentions. The pilot-twelve regression passes.

Packet artifact SHA-256 values:

- `source-verification.json`: `369464a06e300eed0bb9180f98b990633bd784d27e915bcfd449f5ce419559ae`
- `body-comparison.json`: `5331d5e69902e7502d7ddfe8a73573356a22fec2a00c46adb4ab52ee4bdffdd0`
- `proposed-field-updates.json`: `2ab058ad8b00ca46233d46db7ede262648ae2294ffa06510ca5fec560d9d1d4a`
- `field-provenance.json`: `26b77187dc76a37e22019f14f9554d3eb9dbe884189fe26e3677c3d1f8147a0c`
- `external-calls.ndjson`: `ef1f1f89f112d7987ff5c36b1609c745391079ff2b1559aeee347de67a3fdcd8`
- `external-calls.json`: `663d928907863b29c80a532a409744c013f4ace491a9f8f2f52741fea36ac668`
- `grok-summary-review.txt`: `1c40eda3991990ea93e535a15919f94fbeb76ad477ce1cc68faef37c35df5d4b`
- `wayback-supplemental/external-calls.ndjson`: `5c48dde7a49b3dfb7d9c099316ea42693c0a08a9e7c1a80e9558e00c5ff58be0`
- `wayback-supplemental/RECORD-00861_wayback_capture.html`: `0041b650c6c2d9689c1337ffe71f62db091c55950fa2bfdacd5bcdd63ca41afe`
- `wayback-supplemental/RECORD-00862_wayback_capture.html`: `94c9e65f3e58330739ad36373c6cafcd88af3c7845615ca5478975c3e0830537`
- `wayback-supplemental/RECORD-00863_wayback_capture.html`: `2ecba87badcf6807880b33ac689eba97e49bb267cbf8f26f8827a27c6dfd0b7d`

Final SHA-256 values after export:

- `data/archive_records-public.csv`: `4d86a95512eeb5ebaf87dfde0998d994ab7d5f9378afb04c225079772e493eca`
- `data/social_posts.csv`: `3c850bca0491b44ec7b1da805e61f8b3fbfaea8d80e44c0c24d431c38031dedf`
- `data/extracted_entities.csv`: `5833f0fec30553c1a1ee6fd5fe8663bbe396a32efd0ef3638ad59dcd8063d1a9`
- `data/extracted_relationships.csv`: `181b5acf3d3d3dd0f5f123885e542f8ff56ad7d9fd736f1eae281818918f4c72`
- `data/archive-data.json`: `e2a848a56f8758cac75489025cb9665a667e7cd6c2c0ddb3edd9242aca04828f`
- `data/archive-core.json`: `4c297e6f2c5f8cd448289c707b83e26de0822385fb63a788819a6ba7d3532624`
- `data/archive-details.json`: `aecd75ba74bb097c9119a37a8f6cd81d40211f5adaca21f9d51dd34a9b3fcd32`
- `data/archive-entities.json`: `9274f1af7e8aac5561bf904c3ff927d206ffd81420c8bcac124a9411b5de914b`
- `data/archive-analytics.json`: `42c68dc5788c38afea64e9a06c986693dc59adbcc0d9876ad4878398ac72c32c`

### HuffPost verification pilot 13 applied

`RECORD-00864` through `RECORD-00868` were audited with saved Wayback evidence
under `%TEMP%/rosen-k2-huffpost-pilot-13/wayback-evidence`. Four rows were
verified. `RECORD-00865` remains unresolved because available captures did not
provide both trustworthy 2008 posted-date evidence and article body text.

Kimi reviewed the boundary decision in read-only mode. It agreed that verifying
four rows and leaving `RECORD-00865` unresolved was defensible, with conditions:
document `RECORD-00868` as metadata-derived, preserve its source URL and capture
hash, and add an explicit failure note to `RECORD-00865`. Those conditions were
applied.

Changes applied:

- `RECORD-00864`: body-backed excerpt repaired from the archived capture;
  summary added; `verified=TRUE`; `needs_review=FALSE`;
  `low_confidence=FALSE`; notes now cite Wayback capture SHA-256
  `4bbb6c7857b7c1877cf14ef3b2207883ff7acd381a70f7c503248138b6f3d1d4`.
- `RECORD-00865`: left `verified=FALSE`; set `needs_review=TRUE` and
  `low_confidence=TRUE`; notes now record that the 2011 iframe replay returned
  an empty body and the 2016 replay lacked a trustworthy 2008 posted date.
- `RECORD-00866`: publication date corrected from `2013-11-09` to
  `2008-07-19`; body-backed excerpt repaired from the archived capture; summary
  added; `verified=TRUE`; `needs_review=FALSE`; `low_confidence=FALSE`; notes
  now cite Wayback capture SHA-256
  `0199cd5b7624d4595240146b9393425074553d587998dcb812d48a40bdb98266`.
- `RECORD-00867`: publication date corrected from `2013-11-06` to
  `2008-07-19`; body-backed excerpt repaired from the archived capture; summary
  added; `verified=TRUE`; `needs_review=FALSE`; `low_confidence=FALSE`; notes
  now cite Wayback capture SHA-256
  `63b72c598a5a66c39c79418c36c8b1d0d6d375f4437847becc99042a7addd6f0`.
- `RECORD-00868`: publication date corrected from `2016-02-12` to
  `2008-07-19`; toolbar-only raw text replaced with a metadata-derived short
  record from the capture headline and `article:published_time`; word count
  corrected to 26; body-backed excerpt repaired; summary added;
  `verified=TRUE`; `needs_review=FALSE`; `low_confidence=FALSE`; notes now cite
  Wayback capture SHA-256
  `11d7cfd6b97630102b1e96697abd182a3cc4385ad19418bd40a54d0971acc84e` and state
  that no fuller article body was recovered.

The focused regression
`node --test --test-name-pattern "HuffPost pilot thirteen" tests\csv-quality.test.js`
failed before the CSV edit because `RECORD-00864` still had the stale
metadata-style excerpt, then passed after the patch. Raw-text SHA-256 values:

- `RECORD-00864`: `5b15812a9d7e4014be9cc23396819e00188fe8692df092314ecd7035db665353`
- `RECORD-00866`: `e07da9599f4e1f4ae586ed9bb6fb5c939aa435c087763988cd33338244561175`
- `RECORD-00867`: `e2736a5a5586be748a1d526d3fdf6e44d7cee06ccdfc52ad8fd76494e1b265e8`
- `RECORD-00868`: `950029bd6d26935db2210780e9ee4b210fbb55519a8a86403555e210032c1093`

Post-application row counts:

- Archive rows: 1,028.
- Blank archive summaries: 11, down from 15.
- Archive rows not explicitly verified: 15, down from 19.
- `#NN08` rows with capture-year dates: 3, down from 6.
- Generated records after export: 26,681.
- Entities: 7,389.
- Relationships: 10,804.

Validation:

- `python backend\scripts\validate_archive_data.py`: no errors.
- `npm run test:data:extraction-coverage`: expected completion gate still fails
  on 78 records with raw text but no extracted relationships.
- `npm run test:data`: expected eight completion gates still fail: three core
  blanks, 11 blank summaries, 15 unverified archive records, three `#NN08`
  capture-year dates, 54 non-Rosen Bluesky profile URLs, 54 non-Rosen Bluesky
  copyright assignments, 29,693 unverified social rows, and 50 blank entity
  first mentions. The pilot-thirteen regression passes.

Packet artifact SHA-256 values:

- `kimi-decision-review.txt`: `6b571cde973d83f0acfd35b80f6fbf936d50946787a62717fecf5649e9fcaeec`
- `wayback-evidence/external-calls.ndjson`: `bca8d8f640429b9a26cb3e322854592ba48dd09b738d35608976427715a3b072`
- `wayback-evidence/RECORD-00864_wayback_capture.html`: `4bbb6c7857b7c1877cf14ef3b2207883ff7acd381a70f7c503248138b6f3d1d4`
- `wayback-evidence/RECORD-00865_wayback_capture.html`: `e734395ec9db51a5b4b5a46fbddc3c67b793924135acda021358ff8c8a992940`
- `wayback-evidence/RECORD-00865_wayback_iframe.html`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `wayback-evidence/RECORD-00865_wayback_2016_iframe.html`: `dc1dfb7be312e866b5699ec61df0c3e82591f9bcf0a01c87da2001901b98276e`
- `wayback-evidence/RECORD-00866_wayback_capture.html`: `0199cd5b7624d4595240146b9393425074553d587998dcb812d48a40bdb98266`
- `wayback-evidence/RECORD-00867_wayback_capture.html`: `63b72c598a5a66c39c79418c36c8b1d0d6d375f4437847becc99042a7addd6f0`
- `wayback-evidence/RECORD-00868_wayback_capture.html`: `11d7cfd6b97630102b1e96697abd182a3cc4385ad19418bd40a54d0971acc84e`

Final SHA-256 values after export:

- `data/archive_records-public.csv`: `d24d54a5c4150b3127290fbb1f4933dee48e0811ac7ecabf1a46745b5cf22c73`
- `data/social_posts.csv`: `3c850bca0491b44ec7b1da805e61f8b3fbfaea8d80e44c0c24d431c38031dedf`
- `data/extracted_entities.csv`: `5833f0fec30553c1a1ee6fd5fe8663bbe396a32efd0ef3638ad59dcd8063d1a9`
- `data/extracted_relationships.csv`: `181b5acf3d3d3dd0f5f123885e542f8ff56ad7d9fd736f1eae281818918f4c72`
- `data/archive-data.json`: `101cd9206decec9cb33c5b91a9db0c3a57a6895a46a31f1356e2453d42d1ca5c`
- `data/archive-core.json`: `421f51b4f441b855edcf97516e4d034e82e4d8566d9a178d52bacfddeb97ce1b`
- `data/archive-details.json`: `1d88f557b1134b21a8c7abdc738f75a8dd24da0f0a433c29ddb0a13e7b70a1db`
- `data/archive-entities.json`: `a9865c5d7df586e3902a678c2f8b421d4fd1c584f74bbbadadafb7fee72669f0`
- `data/archive-analytics.json`: `430c2960209d2259c0b99e02bf183d82be16d7ee13999abdfe0e2a8607dd0775`

### HuffPost verification pilot 14 applied

Pilot fourteen covered `RECORD-00869` through `RECORD-00873`. The packet lives
at `%TEMP%\rosen-huffpost-pilot-14`. The primary agent fetched the sources;
Kimi reviewed the captured evidence and proposed updates without web access.
Kimi rejected the first draft summaries for `RECORD-00869`, `RECORD-00871`, and
`RECORD-00872`; the final patch restored "draft off," qualified the Pelosi
event wording, and tied the ABC News/Iraq point to the stored article body.
Grok headless review was attempted twice with web search disabled, but the CLI
hit its turn cap before returning a verdict.

Source results:

- `RECORD-00869`: modern HuffPost returned 406 with an empty body. The
  normalized Wayback raw replay returned 200; its title and `Posted:
  07/19/08 01:22 PM ET` metadata support the row. Publication date was
  corrected from `2013-11-06` to `2008-07-19`; excerpt, summary, verification
  flags, and notes were updated. Source SHA-256:
  `2b51ef5dcf9349d3d2070c431b4525b1110d0356f3af8e33e2a9fa18d90e6345`.
- `RECORD-00870`: modern HuffPost returned 404 with an empty body. The
  normalized Wayback raw replay returned 200; its title and `Posted:
  07/19/08 09:35 PM ET` metadata support the row. The title spacing,
  publication date, excerpt, summary, verification flags, and notes were
  updated. Source SHA-256:
  `4fa21e3f81b9b2ac8df16fd77927177ac1d78669dfa035ee2731d19239eeb3f4`.
- `RECORD-00871`: modern HuffPost returned 404 with an empty body. The
  normalized Wayback raw replay returned 200; its `publish_date` meta tag and
  author attribution support `2008-07-19`. The title, summary, verification
  flags, and notes were updated. Source SHA-256:
  `367e2163721d861b0b10ed052c4a1879c0b1a5eeb67816e937d5ef6e65519e26`.
- `RECORD-00872`: modern HuffPost returned 200 with author, title, and
  `2008-08-11` published metadata. Summary, verification flags, and notes were
  updated. Source SHA-256:
  `b1ed6da2177915cca79483da7d577db37476269bfa71d427e4da328e5e815721`.
- `RECORD-00873`: modern HuffPost returned 200 with author, title, and
  `2008-09-20` published metadata. Summary, verification flags, and notes were
  updated. Source SHA-256:
  `daae6c220c00a9c5bbf057cc7335f7d302a099f4ed44a5d53ddcabe398c30670`.

The focused regression
`node --test --test-name-pattern "HuffPost pilot fourteen" tests\csv-quality.test.js`
failed before the CSV edit on `RECORD-00869`'s stale capture date, then passed
after the patch. Raw-text SHA-256 values:

- `RECORD-00869`: `9880cf8c15a7f57f68f5377896d518cd62e81d57b2712700b2e997c00264dc97`
- `RECORD-00870`: `22f7cd6437c35a05bba3058a37e07f3eae4d8edab5ca9c7d8e5fad026efb6948`
- `RECORD-00871`: `f5fd902bd42a8527399fc4eac961d9522b5106466cb277d95d2f3427cfc6882a`
- `RECORD-00872`: `e30e2d5d64b020eea5c8a747fbd2b6f92715d90d5780f945a17f8665af77d788`
- `RECORD-00873`: `8587258f83ca4b66503d95b69e030b9c111bf52b3e093798f365bd748f6c58d3`

Post-application row counts:

- Archive rows: 1,028.
- Blank archive summaries: 6, down from 11.
- Archive rows not explicitly verified: 10, down from 15.
- `#NN08` rows with capture-year dates: 1, down from 2.
- Generated records after export: 26,686.
- Entities: 7,389.
- Relationships: 10,804.

Validation:

- `node --test --test-name-pattern "HuffPost pilot fourteen" tests\csv-quality.test.js`:
  passed.
- `node data\export-archive-data.js`: passed.
- `python backend\scripts\validate_archive_data.py`: no errors.
- `npm run test:data:extraction-coverage`: expected completion gate still fails
  on 78 records with raw text but no extracted relationships.
- `npm run test:data`: expected eight completion gates still fail: three core
  blanks, six blank summaries (`RECORD-00865`, `RECORD-00874` through
  `RECORD-00878`), 10 unverified archive records, one `#NN08` capture-year date
  (`RECORD-00865:2016-02-12`), 54 non-Rosen Bluesky profile URLs, 54 non-Rosen
  Bluesky copyright assignments, 29,693 unverified social rows, and 50 blank
  entity first mentions. The pilot-fourteen regression passes.

Packet artifact SHA-256 values:

- `external-calls.ndjson`: `878988da0e011df3b1dd6cb1b7f8d0b71d8bd792f713b3f46fd2c97ab7c6f28c`
- `external-calls.json`: `31fb97c49f80b161d7b59d3a322196c69dc7337db34c1c285159287931d885f5`
- `wayback-normalized-calls.ndjson`: `d6ba69f49f1d7091410bf2184a4b21494ea4d879d85d42767a5632d3ca09d75b`
- `wayback-normalized-calls.json`: `7133eb4d2360c1d447cc301cf18cee4e60f0006cfd30c8a1027ed2c325e70045`
- `kimi-review.txt`: `2199bcfe2d74ec50cb1621bb7aeb613b04d0b2837afd6dd2cdf3e8fe9237ced9`
- `grok-review.txt`: `63093895ac434e7ac564c7474daf247ce3e9a5d832857778a1c85e240d239642`

Final SHA-256 values after export:

- `data/archive_records-public.csv`: `35ed18079b5257fd5d96e87ad26db64f1caac18f5165e09920f7bc958c69957d`
- `data/social_posts.csv`: `3c850bca0491b44ec7b1da805e61f8b3fbfaea8d80e44c0c24d431c38031dedf`
- `data/extracted_entities.csv`: `5833f0fec30553c1a1ee6fd5fe8663bbe396a32efd0ef3638ad59dcd8063d1a9`
- `data/extracted_relationships.csv`: `181b5acf3d3d3dd0f5f123885e542f8ff56ad7d9fd736f1eae281818918f4c72`
- `data/archive-data.json`: `2d862e51c7422d4d36afec4cf74a370ae6c8096ed3ae6cebaed158217b526b62`
- `data/archive-core.json`: `72eea517b4f85c771ca87921451cc530957aa3dcf03e97ad3be5738c7c6dfbf5`
- `data/archive-details.json`: `a1ca9c19fcd3ec9ba5bd4ecf5dcd1f56938b94ddf326f88323eaaaa300176a1c`
- `data/archive-entities.json`: `aaf271a553e5487dac47fec2a73931307b3165db3779010b42daa153c3747182`
- `data/archive-analytics.json`: `7ee106c00e12e2afc11095dd5e14c25fb22d31904873ade397ae7860877e6d05`

### HuffPost verification pilot 15 applied

Pilot fifteen covered `RECORD-00874` through `RECORD-00878`. The packet lives
at `%TEMP%\rosen-huffpost-pilot-15`. The primary agent fetched the sources;
Kimi reviewed the proposed updates from captured evidence without web access
and approved the batch. Kimi noted that `RECORD-00878` has a HuffPost title-tag
and og-title mismatch; the stored title follows the og-title, and notes now
preserve the title-tag wording.

Source results:

- `RECORD-00874`: canonical modern HuffPost returned 406 with an empty body,
  but the HuffPost AMP URL returned 200 with author, title, and `2008-10-04`
  published metadata. Summary, verification flags, and notes were updated.
  Source SHA-256:
  `690176d06c7d38c1a8da1e0c93d58a028f78391ac535937bbda43f7a828415bc`.
- `RECORD-00875`: modern HuffPost returned 200 with author, title, and
  `2009-04-14` published metadata. Summary, verification flags, and notes were
  updated. Source SHA-256:
  `d786adfffb8250640d6e0a9e396cdd825abe53253049690eb1de404ce64366a2`.
- `RECORD-00876`: modern HuffPost returned 200 with author, title, and
  `2009-04-16` published metadata. Summary, verification flags, and notes were
  updated. Source SHA-256:
  `aa074de890fbdedabf7995c7914a96419e01eacb8292f1b5a18cd39e731525ad`.
- `RECORD-00877`: the first modern request returned 406 with an empty body; a
  browser-header modern request returned 200 with author, title, and
  `2011-02-10` published metadata. Summary, verification flags, and notes were
  updated. Source SHA-256:
  `defa25d8de9e9068f681fd117f583c4f39c1d0c321af667dd84e0b24bda076da`.
- `RECORD-00878`: modern HuffPost returned 200 with author, og-title, and
  `2015-12-07` published metadata. Summary, verification flags, and notes were
  updated; notes preserve that the title tag reads `Tone Poem for the 'Leave It
  There' Press` while og-title matches the stored title. Source SHA-256:
  `58f738c6147be329cebf9b8134f1f94ba294438e23b4600f8237452c94f69da4`.

The focused regression
`node --test --test-name-pattern "HuffPost pilot fifteen" tests\csv-quality.test.js`
failed before the CSV edit because `RECORD-00874` still had a blank summary,
then passed after the patch. Raw-text SHA-256 values:

- `RECORD-00874`: `7b6c5927576245bbdd6041252f87b037f552923fda2d66378bbef979fda6d1a7`
- `RECORD-00875`: `87c75ed5851f83a2288d54a566de2180d051a3e4aa93c7a2881d957313b81216`
- `RECORD-00876`: `ab23bf9fe433fb3d7e45f700e07b800b07fef963bc48946c2b661d5fc9e5b815`
- `RECORD-00877`: `d0a7ccd044bcf915f136af7fe05a4d2db511657458dc8763013a7ff0708b0a75`
- `RECORD-00878`: `8a431c9057372b9776779a734a530e4e9a3ced3bd0bfde4b4736c4ff1f2f7272`

Post-application row counts:

- Archive rows: 1,028.
- Blank archive summaries: 1, down from 6 (`RECORD-00865`).
- Archive rows not explicitly verified: 5, down from 10.
- `#NN08` rows with capture-year dates: 1, unchanged (`RECORD-00865:2016-02-12`).
- Generated records after export: 26,691.
- Entities: 7,389.
- Relationships: 10,804.

Validation:

- `node --test --test-name-pattern "HuffPost pilot fifteen" tests\csv-quality.test.js`:
  passed.
- `node data\export-archive-data.js`: passed.
- `python backend\scripts\validate_archive_data.py`: no errors.
- `npm run test:data:extraction-coverage`: expected completion gate still fails
  on 78 records with raw text but no extracted relationships.
- `npm run test:data`: expected eight completion gates still fail: three core
  blanks, one blank summary (`RECORD-00865`), five unverified archive records,
  one `#NN08` capture-year date (`RECORD-00865:2016-02-12`), 54 non-Rosen
  Bluesky profile URLs, 54 non-Rosen Bluesky copyright assignments, 29,693
  unverified social rows, and 50 blank entity first mentions. The pilot-fifteen
  regression passes.

Packet artifact SHA-256 values:

- `external-calls.ndjson`: `9d7d8b752c9d95a404ed782c4131de7a42613a3482b46ba5d1137220811e3a08`
- `external-calls.json`: `6c30cbba1bd7321c94341d78502b2c6ba588b7fa7c720ca7b97369a24ff42093`
- `fallback-calls.ndjson`: `3cc0d193993d16df7c71801738d7f1bf29bd734e03f7dcaf1a8f8ca152824eb5`
- `fallback-calls.json`: `92bb8f31bdc8f595d1df181c6bd5c5bcfff3bddeaf96ef4af314dfb10554e6a5`
- `kimi-review.txt`: `4eeed41b8a08d47bc0bffa8270ffcb64697859cd16d66d2967f2a89ca64895ec`

Final SHA-256 values after export:

- `data/archive_records-public.csv`: `0dbb3d00617800eeb35823b25b9f50472be049ce5f22daab5b575fca66d74ce8`
- `data/social_posts.csv`: `3c850bca0491b44ec7b1da805e61f8b3fbfaea8d80e44c0c24d431c38031dedf`
- `data/extracted_entities.csv`: `5833f0fec30553c1a1ee6fd5fe8663bbe396a32efd0ef3638ad59dcd8063d1a9`
- `data/extracted_relationships.csv`: `181b5acf3d3d3dd0f5f123885e542f8ff56ad7d9fd736f1eae281818918f4c72`
- `data/archive-data.json`: `01624685440596e6708660039ea17cf507d5f841780d02edcfac9332625c1780`
- `data/archive-core.json`: `35521dd30ce129717adae1ef7a6dacd011c622b7b40fa5a16708b9a38d7f2e20`
- `data/archive-details.json`: `45712264720f74b2b102a2e34d899725cbcaf7c8a7259737d1373540ddb743fe`
- `data/archive-entities.json`: `d21a684f27502a9d353171fe8ea30c364b80bec78cec31f1c7c5d0694bddbf70`
- `data/archive-analytics.json`: `15788fa14498724398d1954fe86f6a3ab7593bfa2b61322da27be402fbe34128`

### HuffPost record 00865 recovery attempt

`RECORD-00865` was rechecked under
`%TEMP%/rosen-huffpost-record-00865-recovery` after pilot fifteen because it is
the last remaining HuffPost blank summary, unverified archive row from the
pilot range, and `#NN08` capture-year date gate.

The recovery attempt did not produce enough source evidence to verify the row.
CDX found one HTTP 200 capture for the canonical Huffington Post URL. The saved
Wayback replay preserves the title and author, but the `articleBody` metadata
is empty, the page body does not preserve article text, and the page metadata
uses `2011-05-25 12:40:20 -0400` rather than a directly observed 2008 source
date. Modern HuffPost, AMP, mobile, and `us_113763` variants returned either
406 empty responses or 404 pages. The canonical row remains unchanged:
`verified=FALSE`, `needs_review=TRUE`, `low_confidence=TRUE`, blank summary,
and `publication_date=2016-02-12` pending better source evidence or curator
decision.

Kimi was invoked in read-only mode for a boundary review with the packet mounted
as an added directory, but it timed out after the checkpoint window before
returning a verdict. The partial response only acknowledged the review request,
so no decision was taken from it.

Packet artifact SHA-256 values:

- `external-calls.ndjson`: `fb455295ef2711dfab5c6757d1b9d161436057a02d06bb3ddf2f7fa7a467e2b7`
- `fallback-calls.ndjson`: `d3ddad1d5c66085cd9e7a0913237587cced31f41b930090cb4ad554a34db246f`
- `kimi-boundary-review.txt`: partial timed-out response, 96 bytes.
- `capture_20160212022545_id_http_www.huffingtonpost.com_jay-rosen_nn08-sketchbook-rick-pear_b_113763.html.html`:
  `3348da8c6d85800b662e0c182b0fa468b94669db53d0575207c84e6a896f4ecc`
- `capture_20160212022545_normal_http_www.huffingtonpost.com_jay-rosen_nn08-sketchbook-rick-pear_b_113763.html.html`:
  `073a4739d3b109d6b1fc1fe3c77cc3df3a874cfdc5cec4d99d6f804d85dd4705`

### TomDispatch record 00614 publisher repair

`RECORD-00614` had a blank `publisher` field. The linked source URL was
replayed under `%TEMP%/rosen-record-00614-publisher-repair` and returned HTTP
200 from TomDispatch.com. The source page confirms the publisher identity but
also confirms the record remains a composite mismatch: the linked page is a
2004 Jay Rosen article, while the stored text presents a later Tom Engelhardt
interview about a 2017-era Sinclair-Tribune deal.

Changes applied:

- Set `publisher=TomDispatch.com`.
- Appended a note with the source response hash and the unresolved mismatch.
- Left `verified=FALSE`, `needs_review=TRUE`, and `low_confidence=TRUE`.

The focused regression
`node --test --test-name-pattern "TomDispatch composite record" tests\csv-quality.test.js`
failed before the CSV edit because the publisher field was blank, then passed
after the repair.

Post-application row counts:

- Archive rows: 1,028.
- Archive core blanks: 2, down from 3 (`RECORD-00602:url`,
  `RECORD-00613:url`).
- Blank archive summaries: 1, unchanged (`RECORD-00865`).
- Archive rows not explicitly verified: 5, unchanged.
- Generated records after export: 26,691.
- Entities: 7,389.
- Relationships: 10,804.

Validation:

- `node --test --test-name-pattern "TomDispatch composite record" tests\csv-quality.test.js`:
  passed.
- `node data\export-archive-data.js`: passed.
- `python backend\scripts\validate_archive_data.py`: no errors.
- `npm run test:data:extraction-coverage`: expected completion gate still fails
  on 78 records with raw text but no extracted relationships.
- `npm run test:data`: expected eight completion gates still fail: two core
  blanks (`RECORD-00602:url`, `RECORD-00613:url`), one blank summary
  (`RECORD-00865`), five unverified archive records, one `#NN08` capture-year
  date (`RECORD-00865:2016-02-12`), 54 non-Rosen Bluesky profile URLs, 54
  non-Rosen Bluesky copyright assignments, 29,693 unverified social rows, and
  50 blank entity first mentions. The TomDispatch regression passes.

Packet artifact SHA-256 values:

- `external-calls.ndjson`: `a6d05b699c109c8b3fffe73e3cc29b8a085824930d8628fbfe4aaacf9762a24e`
- `tomdispatch-record-00614-source.html`: `17a23743ca1c399fbb878aa623e119d68469b16f2d1390bfb618aa1a5f1b54f1`

Final SHA-256 values after export:

- `data/archive_records-public.csv`: `5626cc10b446bd18a6c3426d7e61471ea6856d577deabdc3b57ce1ee7a340b2f`
- `data/social_posts.csv`: `3c850bca0491b44ec7b1da805e61f8b3fbfaea8d80e44c0c24d431c38031dedf`
- `data/extracted_entities.csv`: `5833f0fec30553c1a1ee6fd5fe8663bbe396a32efd0ef3638ad59dcd8063d1a9`
- `data/extracted_relationships.csv`: `181b5acf3d3d3dd0f5f123885e542f8ff56ad7d9fd736f1eae281818918f4c72`
- `data/archive-data.json`: `d6d053aab0516d11a3bbacd6fe266fce4bcef8a3302fedcd1efc2f35bbfde41f`
- `data/archive-core.json`: `99f3c1f6db53305cd5ded044a1ebbfbd7e10034485614bed7437abaf6f892a52`
- `data/archive-details.json`: `7b72c21efec0e8d1d18efed7c832014aa7adaeae8a22d138623d2c2c45da8a52`
- `data/archive-entities.json`: `e67eb77fc2db743214125b04c6046b453cc14fa9ef1c02499061440ca4581342`
- `data/archive-analytics.json`: `15788fa14498724398d1954fe86f6a3ab7593bfa2b61322da27be402fbe34128`

### Tumblr extraction coverage batch 01

Five Tumblr records with source text but no relationship rows were mapped to
existing entities only: `TUMBLR-00001`, `TUMBLR-00007`, `TUMBLR-00008`,
`TUMBLR-00010`, and `TUMBLR-00011`. No new entity IDs were created. A Qwen CLI
proposal attempt failed before producing usable output because the local Qwen
CLI returned an API-key 401, so the mappings were made directly from stored
`raw_text`.

Changes applied:

- Appended 10 relationship rows to `data/extracted_relationships.csv`.
- Added a focused regression proving every new context snippet is an exact
  substring of its source record.
- Left `data/extracted_entities.csv` unchanged.

The focused regression
`node --test --test-name-pattern "Tumblr extraction batch one" tests\extraction-coverage.test.js`
failed before the relationship append because `TUMBLR-00001_REL_001` was
missing, then passed after the append. The first validator pass caught unquoted
embedded line feeds in appended snippets; the batch rows were rewritten with
quoted CSV fields and the validator then passed.

Post-application counts:

- Relationships: 10,814, up from 10,804.
- Archive records with entities: 800/1,028 (77.8%), up from 795/1,028.
- Extraction coverage missing archive records: 73, down from 78.
- Generated records after export: 26,691.

Validation:

- `node --test --test-name-pattern "Tumblr extraction batch one" tests\extraction-coverage.test.js`:
  passed.
- `python backend\scripts\validate_archive_data.py`: no errors.
- `npm run test:data:extraction-coverage`: expected completion gate still fails
  on 73 records with raw text but no extracted relationships.
- `node data\export-archive-data.js`: passed.
- `npm run test:data`: expected eight completion gates still fail: two core
  blanks (`RECORD-00602:url`, `RECORD-00613:url`), one blank summary
  (`RECORD-00865`), five unverified archive records, one `#NN08` capture-year
  date (`RECORD-00865:2016-02-12`), 54 non-Rosen Bluesky profile URLs, 54
  non-Rosen Bluesky copyright assignments, 29,693 unverified social rows, and
  50 blank entity first mentions. The relationship endpoint, self-reference,
  duplicate semantic key, canonical-name, and Tumblr batch tests pass.

Final SHA-256 values after export:

- `data/archive_records-public.csv`: `5626cc10b446bd18a6c3426d7e61471ea6856d577deabdc3b57ce1ee7a340b2f`
- `data/social_posts.csv`: `3c850bca0491b44ec7b1da805e61f8b3fbfaea8d80e44c0c24d431c38031dedf`
- `data/extracted_entities.csv`: `5833f0fec30553c1a1ee6fd5fe8663bbe396a32efd0ef3638ad59dcd8063d1a9`
- `data/extracted_relationships.csv`: `3ba486daeed35a640dd79480bf25bfc1382871f725b14ed989dda2cf87cb51ff`
- `data/archive-data.json`: `207347eb14acb3b262d80f1142cf6865559b3bbef7ed2b16d902ed6c78b4e1f9`
- `data/archive-core.json`: `923ac92bff9a71f66ea6ee6b49d4ed54e7d8b0d7198cf21dce7a1c659b55da50`
- `data/archive-details.json`: `60509f2eea46f7cfb89d83ecbbb9bc1dbc34f3770a86be3bbd36cc61801b2f23`
- `data/archive-entities.json`: `5fcf3c5fac1d6a90d1a0c82833b404429fe072b20af1d3d8f368d64e4ee6ccfa`
- `data/archive-analytics.json`: `15788fa14498724398d1954fe86f6a3ab7593bfa2b61322da27be402fbe34128`

### Tumblr extraction coverage batch 02

Five more Tumblr records with source text but no relationship rows were mapped
to existing entities only: `TUMBLR-00012`, `TUMBLR-00015`, `TUMBLR-00016`,
`TUMBLR-00018`, and `TUMBLR-00019`. No new entity IDs were created.
`TUMBLR-00013` and `TUMBLR-00014` were left for a later pass because their
useful relationships need missing or ambiguous entities.

Changes applied:

- Appended nine relationship rows to `data/extracted_relationships.csv`.
- Added a focused regression proving every new context snippet is an exact
  substring of its source record.
- Left `data/extracted_entities.csv` unchanged.

The focused regression
`node --test --test-name-pattern "Tumblr extraction batch two" tests\extraction-coverage.test.js`
failed before the relationship append because `TUMBLR-00012_REL_001` was
missing, then passed after the append.

Post-application counts:

- Relationships: 10,823, up from 10,814.
- Archive records with entities: 805/1,028 (78.3%), up from 800/1,028.
- Extraction coverage missing archive records: 68, down from 73.
- Generated records after export: 26,691.

Validation:

- `node --test --test-name-pattern "Tumblr extraction batch two" tests\extraction-coverage.test.js`:
  passed.
- `python backend\scripts\validate_archive_data.py`: no errors.
- `npm run test:data:extraction-coverage`: expected completion gate still fails
  on 68 records with raw text but no extracted relationships.
- `node data\export-archive-data.js`: passed.
- `npm run test:data`: expected eight completion gates still fail: two core
  blanks (`RECORD-00602:url`, `RECORD-00613:url`), one blank summary
  (`RECORD-00865`), five unverified archive records, one `#NN08` capture-year
  date (`RECORD-00865:2016-02-12`), 54 non-Rosen Bluesky profile URLs, 54
  non-Rosen Bluesky copyright assignments, 29,693 unverified social rows, and
  50 blank entity first mentions. The relationship endpoint, self-reference,
  duplicate semantic key, canonical-name, and Tumblr batch tests pass.

Final SHA-256 values after export:

- `data/archive_records-public.csv`: `5626cc10b446bd18a6c3426d7e61471ea6856d577deabdc3b57ce1ee7a340b2f`
- `data/social_posts.csv`: `3c850bca0491b44ec7b1da805e61f8b3fbfaea8d80e44c0c24d431c38031dedf`
- `data/extracted_entities.csv`: `5833f0fec30553c1a1ee6fd5fe8663bbe396a32efd0ef3638ad59dcd8063d1a9`
- `data/extracted_relationships.csv`: `8ebfd7ccf592fb3d8ea7d1c043e6d7c7efd0deefcef49c2d4ecbbeaaf95ed61a`
- `data/archive-data.json`: `5b9eddafd05afdcac5356fb9bc2cecf0c5639440cc3dc9fa174a3b773768725b`
- `data/archive-core.json`: `9699ddf778172ef17c66daf3ca7575e30cd8a8290cd0512e4dda4b3db3b4c48c`
- `data/archive-details.json`: `78eb09f73aff0eb15a8e46063d128ffec7bce56fcb855561c836187c1fe7846a`
- `data/archive-entities.json`: `10e56a52b94de27898835cc2a369b0382ba94c8009c876ee1de84a5bc2e089f7`
- `data/archive-analytics.json`: `15788fa14498724398d1954fe86f6a3ab7593bfa2b61322da27be402fbe34128`

### Tumblr extraction coverage batch 03

Five more Tumblr records with source text but no relationship rows were mapped
to existing entities only: `TUMBLR-00022`, `TUMBLR-00023`, `TUMBLR-00025`,
`TUMBLR-00027`, and `TUMBLR-00028`. No new entity IDs were created.
`TUMBLR-00021`, `TUMBLR-00024`, and `TUMBLR-00026` were left for a later pass
because the useful source text needs missing, ambiguous, or weaker entities.

A read-only Kimi CLI review checked the proposed mappings. The review rejected
weak rows tying Jason Samuels directly to Studio 20, tying Jay Rosen directly to
Studio 20 through the Studio 3 course snippet, and deriving an AOL affiliation
from a one-off Seed.com project sentence. It also downgraded project partner
credits from `Discusses` to `Mentions` where the evidence was only a passing
credit.

Changes applied:

- Appended 12 relationship rows to `data/extracted_relationships.csv`.
- Added a focused regression proving every new context snippet is an exact
  substring of its source record.
- Left `data/extracted_entities.csv` unchanged.

The focused regression
`node --test --test-name-pattern "Tumblr extraction batch three" tests\extraction-coverage.test.js`
failed before the relationship append because `TUMBLR-00022_REL_001` was
missing, then passed after the append. During validation, the first CSV edit
surfaced a mixed line-ending edge case in Node's CSV parser; the final version
uses single-line snippets for this batch and preserves the prior CSV delimiter
style.

Post-application counts:

- Relationships: 10,835, up from 10,823.
- Archive records with entities: 810/1,028 (78.8%), up from 805/1,028.
- Extraction coverage missing archive records: 63, down from 68.
- Generated records after export: 26,691.

Validation:

- `node --test --test-name-pattern "Tumblr extraction batch three" tests\extraction-coverage.test.js`:
  passed.
- `python backend\scripts\validate_archive_data.py`: no errors.
- `npm run test:data:extraction-coverage`: expected completion gate still fails
  on 63 records with raw text but no extracted relationships.
- `node data\export-archive-data.js`: passed.
- `npm run test:data`: expected eight completion gates still fail: two core
  blanks (`RECORD-00602:url`, `RECORD-00613:url`), one blank summary
  (`RECORD-00865`), five unverified archive records, one `#NN08` capture-year
  date (`RECORD-00865:2016-02-12`), 54 non-Rosen Bluesky profile URLs, 54
  non-Rosen Bluesky copyright assignments, 29,693 unverified social rows, and
  50 blank entity first mentions. The relationship endpoint, self-reference,
  duplicate semantic key, canonical-name, and Tumblr batch tests pass.

Final SHA-256 values after export:

- `data/archive_records-public.csv`: `5626cc10b446bd18a6c3426d7e61471ea6856d577deabdc3b57ce1ee7a340b2f`
- `data/social_posts.csv`: `3c850bca0491b44ec7b1da805e61f8b3fbfaea8d80e44c0c24d431c38031dedf`
- `data/extracted_entities.csv`: `5833f0fec30553c1a1ee6fd5fe8663bbe396a32efd0ef3638ad59dcd8063d1a9`
- `data/extracted_relationships.csv`: `5c7bb68a275af15fac0487195d23743b405acd3258c6c44792ae3372579b9eae`
- `data/archive-data.json`: `5512a62d61dd5faf0fe7dd0ae5c98adcc2fa2d9d85b676047177948517ebfe57`
- `data/archive-core.json`: `ae1cf4290466d8c3585b0f17444d341a82998ed2e2927473aaf5e6c8641a2a52`
- `data/archive-details.json`: `f876c46362446d9a3457596e4e88a9437472fb1aeebb9fb61acdc4bd2fe80509`
- `data/archive-entities.json`: `3a7faf7f9e7ec47df9df4568c240029469518b0404362c2a20a2f41ea5e0c15d`
- `data/archive-analytics.json`: `15788fa14498724398d1954fe86f6a3ab7593bfa2b61322da27be402fbe34128`

### Tumblr extraction coverage batch 04

Five more Tumblr records with source text but no relationship rows were mapped
to existing entities only: `TUMBLR-00029`, `TUMBLR-00030`, `TUMBLR-00031`,
`TUMBLR-00032`, and `TUMBLR-00033`. No new entity IDs were created.

A read-only Kimi CLI review checked the proposed mappings. The review rejected
a directional Jay Rosen-to-Amanda Michel row because the source only co-mentions
both people, and rejected a Jason Samuels-to-CNN row because the snippet tied
Soledad O'Brien, not Samuels, to CNN. The final batch replaced those with
Studio 20 mention rows for Jay Rosen and Amanda Michel, plus a Soledad
O'Brien-to-CNN affiliation row.

Changes applied:

- Appended 23 relationship rows to `data/extracted_relationships.csv`.
- Added a focused regression proving every new context snippet is an exact
  substring of its source record.
- Left `data/extracted_entities.csv` unchanged.

The focused regression
`node --test --test-name-pattern "Tumblr extraction batch four" tests\extraction-coverage.test.js`
failed before the relationship append because `TUMBLR-00029_REL_001` was
missing, then passed after the append. The first full data run caught one
non-canonical endpoint name for `W0910`; the final row uses the canonical
entity name.

Post-application counts:

- Relationships: 10,858, up from 10,835.
- Archive records with entities: 815/1,028 (79.3%), up from 810/1,028.
- Extraction coverage missing archive records: 58, down from 63.
- Generated records after export: 26,691.

Validation:

- `node --test --test-name-pattern "Tumblr extraction batch four" tests\extraction-coverage.test.js`:
  passed.
- `python backend\scripts\validate_archive_data.py`: no errors.
- `npm run test:data:extraction-coverage`: expected completion gate still fails
  on 58 records with raw text but no extracted relationships.
- `node data\export-archive-data.js`: passed.
- `npm run test:data`: expected eight completion gates still fail: two core
  blanks (`RECORD-00602:url`, `RECORD-00613:url`), one blank summary
  (`RECORD-00865`), five unverified archive records, one `#NN08` capture-year
  date (`RECORD-00865:2016-02-12`), 54 non-Rosen Bluesky profile URLs, 54
  non-Rosen Bluesky copyright assignments, 29,693 unverified social rows, and
  50 blank entity first mentions. The relationship endpoint, self-reference,
  duplicate semantic key, canonical-name, and Tumblr batch tests pass.

Final SHA-256 values after export:

- `data/archive_records-public.csv`: `5626cc10b446bd18a6c3426d7e61471ea6856d577deabdc3b57ce1ee7a340b2f`
- `data/social_posts.csv`: `3c850bca0491b44ec7b1da805e61f8b3fbfaea8d80e44c0c24d431c38031dedf`
- `data/extracted_entities.csv`: `5833f0fec30553c1a1ee6fd5fe8663bbe396a32efd0ef3638ad59dcd8063d1a9`
- `data/extracted_relationships.csv`: `11f3fdbb709819f598c9819d0b5be59e9b5eacf113dea797738ce490869c6d34`
- `data/archive-data.json`: `040a8fc1d3dcfdeeba6741a1e3b36ee18dcfdc2be98d0f9afb3c12701c79bb30`
- `data/archive-core.json`: `8b4954d8b86e1ecae1fc75f226970e8059f9e0835c071b5067da0ef9aa0861ec`
- `data/archive-details.json`: `4439544d9d7c974f0237d7cd4f1a1b6c6106db0d8f50cbfa8ad8b6e17a679c8c`
- `data/archive-entities.json`: `aeeedf7cae469de8d8ad084203e6cce39b99add1064173c8d6c8b6a2b8453a11`
- `data/archive-analytics.json`: `15788fa14498724398d1954fe86f6a3ab7593bfa2b61322da27be402fbe34128`

### Tumblr extraction coverage batch 05

Five more Tumblr records with source text but no relationship rows were mapped
to existing entities only: `TUMBLR-00034`, `TUMBLR-00035`, `TUMBLR-00036`,
`TUMBLR-00037`, and `TUMBLR-00038`. No new entity IDs were created.

A read-only Kimi CLI review checked the proposed mappings. The review approved
the batch after three conservative changes: dropping a weak Clay Shirky-to-Carter
Institute affiliation row whose snippet did not tie both endpoints together,
downgrading bare `new media` snippets to `Mentions`, and recording PressThink as
a Studio 20 mention rather than a Jay Rosen-to-PressThink relationship.

Changes applied:

- Appended 20 relationship rows to `data/extracted_relationships.csv`.
- Added a focused regression proving every new context snippet is an exact
  substring of its source record.
- Left `data/extracted_entities.csv` unchanged.

The focused regression
`node --test --test-name-pattern "Tumblr extraction batch five" tests\extraction-coverage.test.js`
failed before the relationship append because `TUMBLR-00034_REL_001` was
missing, then passed after the append.

Post-application counts:

- Relationships: 10,878, up from 10,858.
- Archive records with entities: 820/1,028 (79.8%), up from 815/1,028.
- Extraction coverage missing archive records: 53, down from 58.
- Generated records after export: 26,691.

Validation:

- `node --test --test-name-pattern "Tumblr extraction batch five" tests\extraction-coverage.test.js`:
  passed.
- `python backend\scripts\validate_archive_data.py`: no errors.
- `npm run test:data:extraction-coverage`: expected completion gate still fails
  on 53 records with raw text but no extracted relationships.
- `node data\export-archive-data.js`: passed.
- `npm run test:data`: expected eight completion gates still fail: two core
  blanks (`RECORD-00602:url`, `RECORD-00613:url`), one blank summary
  (`RECORD-00865`), five unverified archive records, one `#NN08` capture-year
  date (`RECORD-00865:2016-02-12`), 54 non-Rosen Bluesky profile URLs, 54
  non-Rosen Bluesky copyright assignments, 29,693 unverified social rows, and
  50 blank entity first mentions. The relationship endpoint, self-reference,
  duplicate semantic key, canonical-name, and Tumblr batch tests pass.

Final SHA-256 values after export:

- `data/archive_records-public.csv`: `5626cc10b446bd18a6c3426d7e61471ea6856d577deabdc3b57ce1ee7a340b2f`
- `data/social_posts.csv`: `3c850bca0491b44ec7b1da805e61f8b3fbfaea8d80e44c0c24d431c38031dedf`
- `data/extracted_entities.csv`: `5833f0fec30553c1a1ee6fd5fe8663bbe396a32efd0ef3638ad59dcd8063d1a9`
- `data/extracted_relationships.csv`: `a374ed91129265d5008f25c23ed6c8faf02455426516a69b3721ff8d36001d54`
- `data/archive-data.json`: `cc6318a4f01480d984d4c83e4ecfa0c772b383885d1009db5cd5efb2770d19b0`
- `data/archive-core.json`: `72092606ef828c9e2115493fd7e6a7b809f70e308b44b434c38aad70785330d4`
- `data/archive-details.json`: `caf9b250d1be83276dc197395181de1d44cc069974aeac3fb6f3886de3ee36e4`
- `data/archive-entities.json`: `57cb0e8cdfc0c0e7494083eda0036b39a37f1f6591564c7edce936c9f91c29d1`
- `data/archive-analytics.json`: `15788fa14498724398d1954fe86f6a3ab7593bfa2b61322da27be402fbe34128`

### Tumblr extraction coverage batch 06

Five more Tumblr records with source text but no relationship rows were mapped
to existing entities only: `TUMBLR-00052`, `TUMBLR-00057`, `TUMBLR-00058`,
`TUMBLR-00059`, and `TUMBLR-00061`. No new entity IDs were created.

A read-only Kimi CLI review checked the proposed mappings. The review approved
the batch after three conservative changes: dropping a weak `The Australian`
row whose snippet did not identify the newspaper, downgrading a bare
`Journalism` concept row to `Mentions`, and keeping Lisa Williams-to-Placeblogger
only because the source sentence identifies her as founder and CEO.

Changes applied:

- Appended 21 relationship rows to `data/extracted_relationships.csv`.
- Added a focused regression proving every new context snippet is an exact
  substring of its source record.
- Left `data/extracted_entities.csv` unchanged.

The focused regression
`node --test --test-name-pattern "Tumblr extraction batch six" tests\extraction-coverage.test.js`
failed before the relationship append because `TUMBLR-00052_REL_001` was
missing, then passed after the append.

Post-application counts:

- Relationships: 10,899, up from 10,878.
- Archive records with entities: 825/1,028 (80.3%), up from 820/1,028.
- Extraction coverage missing archive records: 48, down from 53.
- Generated records after export: 26,691.

Validation:

- `node --test --test-name-pattern "Tumblr extraction batch six" tests\extraction-coverage.test.js`:
  passed.
- `python backend\scripts\validate_archive_data.py`: no errors.
- `npm run test:data:extraction-coverage`: expected completion gate still fails
  on 48 records with raw text but no extracted relationships.
- `node data\export-archive-data.js`: passed.
- `npm run test:data`: expected eight completion gates still fail: two core
  blanks (`RECORD-00602:url`, `RECORD-00613:url`), one blank summary
  (`RECORD-00865`), five unverified archive records, one `#NN08` capture-year
  date (`RECORD-00865:2016-02-12`), 54 non-Rosen Bluesky profile URLs, 54
  non-Rosen Bluesky copyright assignments, 29,693 unverified social rows, and
  50 blank entity first mentions. The relationship endpoint, self-reference,
  duplicate semantic key, canonical-name, and Tumblr batch tests pass.

Final SHA-256 values after export:

- `data/archive_records-public.csv`: `5626cc10b446bd18a6c3426d7e61471ea6856d577deabdc3b57ce1ee7a340b2f`
- `data/social_posts.csv`: `3c850bca0491b44ec7b1da805e61f8b3fbfaea8d80e44c0c24d431c38031dedf`
- `data/extracted_entities.csv`: `5833f0fec30553c1a1ee6fd5fe8663bbe396a32efd0ef3638ad59dcd8063d1a9`
- `data/extracted_relationships.csv`: `1d2316c8b281164084a5807730491474f69dfdc489c39715bed0e1540ea99d03`
- `data/archive-data.json`: `7b131bbc6273fb6a4163d6c3fd1e83a3e1679ca18615dc597cc7757b77961791`
- `data/archive-core.json`: `612952f81ba85d124ee6dad6594eb80050e1c54934cf3a065b73df09c1f14be2`
- `data/archive-details.json`: `fd74588f916923aa69e2a3a9d8f06987c8bcdb3543c6129d65bd1a83cd363bcf`
- `data/archive-entities.json`: `6b948123fecd7bd6d1478833a83e1f37be5058609d3f0919632ee85b833f28b6`
- `data/archive-analytics.json`: `15788fa14498724398d1954fe86f6a3ab7593bfa2b61322da27be402fbe34128`

### Tumblr extraction coverage batch 07

Five earlier skipped Tumblr records with source text but no relationship rows
were mapped to existing entities only: `TUMBLR-00013`, `TUMBLR-00014`,
`TUMBLR-00021`, `TUMBLR-00024`, and `TUMBLR-00026`. No new entity IDs were
created.

A read-only Kimi CLI review checked the proposed mappings. The review approved
the batch after one row was dropped: a proposed New York Magazine mention whose
source passage was not included in the review packet. The final batch kept only
direct affiliation, concept, and mention rows supported by exact snippets in the
source records.

Changes applied:

- Appended 17 relationship rows to `data/extracted_relationships.csv`.
- Added a focused regression proving every new context snippet is an exact
  substring of its source record.
- Left `data/extracted_entities.csv` unchanged.

The focused regression
`node --test --test-name-pattern "Tumblr extraction batch seven" tests\extraction-coverage.test.js`
failed before the relationship append because `TUMBLR-00013_REL_001` was
missing, then passed after the append.

Post-application counts:

- Relationships: 10,916, up from 10,899.
- Archive records with entities: 830/1,028 (80.7%), up from 825/1,028.
- Extraction coverage missing archive records: 43, down from 48.
- Generated records after export: 26,691.

Validation:

- `node --test --test-name-pattern "Tumblr extraction batch seven" tests\extraction-coverage.test.js`:
  passed.
- `python backend\scripts\validate_archive_data.py`: no errors.
- `npm run test:data:extraction-coverage`: expected completion gate still fails
  on 43 records with raw text but no extracted relationships.
- `node data\export-archive-data.js`: passed.
- `npm run test:data`: expected eight completion gates still fail: two core
  blanks (`RECORD-00602:url`, `RECORD-00613:url`), one blank summary
  (`RECORD-00865`), five unverified archive records, one `#NN08` capture-year
  date (`RECORD-00865:2016-02-12`), 54 non-Rosen Bluesky profile URLs, 54
  non-Rosen Bluesky copyright assignments, 29,693 unverified social rows, and
  50 blank entity first mentions. The relationship endpoint, self-reference,
  duplicate semantic key, canonical-name, and Tumblr batch tests pass.

Final SHA-256 values after export:

- `data/archive_records-public.csv`: `5626cc10b446bd18a6c3426d7e61471ea6856d577deabdc3b57ce1ee7a340b2f`
- `data/social_posts.csv`: `3c850bca0491b44ec7b1da805e61f8b3fbfaea8d80e44c0c24d431c38031dedf`
- `data/extracted_entities.csv`: `5833f0fec30553c1a1ee6fd5fe8663bbe396a32efd0ef3638ad59dcd8063d1a9`
- `data/extracted_relationships.csv`: `9434cd375c650fe371ae841a0e08bf29e556be4b8d28e2b0e3f9a35932e8920f`
- `data/archive-data.json`: `06ff006882f0c650593129827f22bb06c3b12607a70f5a7e248c3055de570412`
- `data/archive-core.json`: `d3b9450af703716450bdc16d9ab6f6034653c235cdc591e629cf71b20e46af05`
- `data/archive-details.json`: `92e797c5665322d7c197e593df0c3de4ed27666f183d6bef8392b7adac8377e5`
- `data/archive-entities.json`: `ede5a7f5550d4f33b03da959c30740a58ea2987d1ada2db49fd4f35e6ba742dd`
- `data/archive-analytics.json`: `15788fa14498724398d1954fe86f6a3ab7593bfa2b61322da27be402fbe34128`

### Tumblr extraction coverage batch 08

Five more Tumblr records with source text but no relationship rows were mapped
to existing entities only: `TUMBLR-00066`, `TUMBLR-00067`, `TUMBLR-00068`,
`TUMBLR-00069`, and `TUMBLR-00071`. No new entity IDs were created.

A read-only Kimi CLI review checked the proposed mappings. The review required
five safety changes: downgrade the Carter Institute event-context row to
`Mentions`, drop an Internet row whose target was not canonical for a concept
mention, switch the Public Journalism row to Jay Rosen as source, downgrade a
bare Mainstream Media row to `Mentions`, and downgrade the entrepreneurship
advice row to `Mentions`.

Changes applied:

- Appended 28 relationship rows to `data/extracted_relationships.csv`.
- Added a focused regression proving every new context snippet is an exact
  substring of its source record.
- Left `data/extracted_entities.csv` unchanged.

The focused regression
`node --test --test-name-pattern "Tumblr extraction batch eight" tests\extraction-coverage.test.js`
failed before the relationship append because `TUMBLR-00066_REL_001` was
missing, then passed after the append.

Post-application counts:

- Relationships: 10,944, up from 10,916.
- Archive records with entities: 835/1,028 (81.2%), up from 830/1,028.
- Extraction coverage missing archive records: 38, down from 43.
- Generated records after export: 26,691.

Validation:

- `node --test --test-name-pattern "Tumblr extraction batch eight" tests\extraction-coverage.test.js`:
  passed.
- `python backend\scripts\validate_archive_data.py`: no errors.
- `npm run test:data:extraction-coverage`: expected completion gate still fails
  on 38 records with raw text but no extracted relationships.
- `node data\export-archive-data.js`: passed.
- `npm run test:data`: expected eight completion gates still fail: two core
  blanks (`RECORD-00602:url`, `RECORD-00613:url`), one blank summary
  (`RECORD-00865`), five unverified archive records, one `#NN08` capture-year
  date (`RECORD-00865:2016-02-12`), 54 non-Rosen Bluesky profile URLs, 54
  non-Rosen Bluesky copyright assignments, 29,693 unverified social rows, and
  50 blank entity first mentions. The relationship endpoint, self-reference,
  duplicate semantic key, canonical-name, and Tumblr batch tests pass.

Final SHA-256 values after export:

- `data/archive_records-public.csv`: `5626cc10b446bd18a6c3426d7e61471ea6856d577deabdc3b57ce1ee7a340b2f`
- `data/social_posts.csv`: `3c850bca0491b44ec7b1da805e61f8b3fbfaea8d80e44c0c24d431c38031dedf`
- `data/extracted_entities.csv`: `5833f0fec30553c1a1ee6fd5fe8663bbe396a32efd0ef3638ad59dcd8063d1a9`
- `data/extracted_relationships.csv`: `82d6f359ff5b31b344cdc5c3287e5da243056a72d4854719badc55b3689cf799`
- `data/archive-data.json`: `82e444532cc609b36a843865c7e5b1be8564a3ad23808cb89ec9c7342d0d3a6e`
- `data/archive-core.json`: `4c28f6822bec6e764cc16eee7860a9608366d9a11f048096ff98db4a5796c8f4`
- `data/archive-details.json`: `b7b770e49f6c8740d8f6edbfab697c4ae74afa4de919acf2b6b31819c6bb70ba`
- `data/archive-entities.json`: `16b8b43178316350d1fc35b9bf0a547a9e7e3c3ea292ee68343ea155df1dd485`
- `data/archive-analytics.json`: `15788fa14498724398d1954fe86f6a3ab7593bfa2b61322da27be402fbe34128`

### Tumblr extraction coverage batch 09

Five more Tumblr records with source text but no relationship rows were mapped
to existing entities only: `TUMBLR-00073`, `TUMBLR-00077`, `TUMBLR-00078`,
`TUMBLR-00079`, and `TUMBLR-00081`. No new entity IDs were created.

A read-only Kimi CLI review checked the proposed mappings. The first review
timed out after approving most rows and flagging `TUMBLR-00081` snippets for
direct verification. A local snippet check confirmed those excerpts were present,
then a short follow-up review approved the final batch except for one dropped
MIT row: `MIT’s Technology Review` refers to the publication, not the MIT
institution entity.

Changes applied:

- Appended 29 relationship rows to `data/extracted_relationships.csv`.
- Added a focused regression proving every new context snippet is an exact
  substring of its source record.
- Left `data/extracted_entities.csv` unchanged.

The focused regression
`node --test --test-name-pattern "Tumblr extraction batch nine" tests\extraction-coverage.test.js`
failed before the relationship append because `TUMBLR-00073_REL_001` was
missing, then passed after the append.

Post-application counts:

- Relationships: 10,973, up from 10,944.
- Archive records with entities: 840/1,028 (81.7%), up from 835/1,028.
- Extraction coverage missing archive records: 33, down from 38.
- Generated records after export: 26,691.

Validation:

- `node --test --test-name-pattern "Tumblr extraction batch nine" tests\extraction-coverage.test.js`:
  passed.
- `python backend\scripts\validate_archive_data.py`: no errors.
- `npm run test:data:extraction-coverage`: expected completion gate still fails
  on 33 records with raw text but no extracted relationships.
- `node data\export-archive-data.js`: passed.
- `npm run test:data`: expected eight completion gates still fail: two core
  blanks (`RECORD-00602:url`, `RECORD-00613:url`), one blank summary
  (`RECORD-00865`), five unverified archive records, one `#NN08` capture-year
  date (`RECORD-00865:2016-02-12`), 54 non-Rosen Bluesky profile URLs, 54
  non-Rosen Bluesky copyright assignments, 29,693 unverified social rows, and
  50 blank entity first mentions. The relationship endpoint, self-reference,
  duplicate semantic key, canonical-name, and Tumblr batch tests pass.

Final SHA-256 values after export:

- `data/archive_records-public.csv`: `5626cc10b446bd18a6c3426d7e61471ea6856d577deabdc3b57ce1ee7a340b2f`
- `data/social_posts.csv`: `3c850bca0491b44ec7b1da805e61f8b3fbfaea8d80e44c0c24d431c38031dedf`
- `data/extracted_entities.csv`: `5833f0fec30553c1a1ee6fd5fe8663bbe396a32efd0ef3638ad59dcd8063d1a9`
- `data/extracted_relationships.csv`: `242de3e7528e1fc20fb7a01f4d6c184389962a7a0a7103e781024ed291f0a341`
- `data/archive-data.json`: `e88802be9bb069d605b1054e9508fe2a61faadb4cbe8f8607ecdeb44a1b7d01f`
- `data/archive-core.json`: `97eec8080cde09b947a9872c5e16fd8e7fc4449bba58ef6e1956af8131a601f5`
- `data/archive-details.json`: `877a5c51508a07a9e465ff8180d0ce532ec32cd9b218729a5cab18b5dc3ad59e`
- `data/archive-entities.json`: `dd4170d02d571e5ac9fa40843f334fc4587aabce1e67acb50d0b421eda80bedf`
- `data/archive-analytics.json`: `22eae8f49c232ea86f71b6b183863ee8377d7ea512bf6abd06937757e719d91c`

### Tumblr extraction coverage batch 10

Five more Tumblr records with source text but no relationship rows were mapped
to existing entities only: `TUMBLR-00082`, `TUMBLR-00083`, `TUMBLR-00084`,
`TUMBLR-00085`, and `TUMBLR-00086`. No new entity IDs were created.

A read-only Kimi CLI review checked the proposed mappings. The first batch ten
review timed out without useful output, so a shorter no-tools retry was used.
That review approved all final rows. Missing entity cases such as ExplainThis,
Tablet, True/Slant, Lewis Dvorkin, and several students were intentionally left
unmapped rather than creating new IDs.

Changes applied:

- Appended 22 relationship rows to `data/extracted_relationships.csv`.
- Added a focused regression proving every new context snippet is an exact
  substring of its source record.
- Left `data/extracted_entities.csv` unchanged.

The focused regression
`node --test --test-name-pattern "Tumblr extraction batch ten" tests\extraction-coverage.test.js`
failed before the relationship append because `TUMBLR-00082_REL_001` was
missing, then passed after the append.

Post-application counts:

- Relationships: 10,995, up from 10,973.
- Archive records with entities: 845/1,028 (82.2%), up from 840/1,028.
- Extraction coverage missing archive records: 28, down from 33.
- Generated records after export: 26,691.

Validation:

- `node --test --test-name-pattern "Tumblr extraction batch ten" tests\extraction-coverage.test.js`:
  passed.
- `python backend\scripts\validate_archive_data.py`: no errors.
- `npm run test:data:extraction-coverage`: expected completion gate still fails
  on 28 records with raw text but no extracted relationships.
- `node data\export-archive-data.js`: passed.
- `npm run test:data`: expected eight completion gates still fail: two core
  blanks (`RECORD-00602:url`, `RECORD-00613:url`), one blank summary
  (`RECORD-00865`), five unverified archive records, one `#NN08` capture-year
  date (`RECORD-00865:2016-02-12`), 54 non-Rosen Bluesky profile URLs, 54
  non-Rosen Bluesky copyright assignments, 29,693 unverified social rows, and
  50 blank entity first mentions. The relationship endpoint, self-reference,
  duplicate semantic key, canonical-name, and Tumblr batch tests pass.

Final SHA-256 values after export:

- `data/archive_records-public.csv`: `5626cc10b446bd18a6c3426d7e61471ea6856d577deabdc3b57ce1ee7a340b2f`
- `data/social_posts.csv`: `3c850bca0491b44ec7b1da805e61f8b3fbfaea8d80e44c0c24d431c38031dedf`
- `data/extracted_entities.csv`: `5833f0fec30553c1a1ee6fd5fe8663bbe396a32efd0ef3638ad59dcd8063d1a9`
- `data/extracted_relationships.csv`: `f7d51197aa1d965785efacc12c1c5c24321eef2346ae3860a7ca00d5fb771f5b`
- `data/archive-data.json`: `29a69755a9d00133bd88c1cf64c9a9203d365c33a1ac9176857452fcfdff0d83`
- `data/archive-core.json`: `d0ed95fe8620f758698aca6a88952f74dcadac663138f00c4b3231044ef57fe0`
- `data/archive-details.json`: `719646a9313a0b02af0b1f412c5e2947a65c5a6107d70471afd4672f9fa45713`
- `data/archive-entities.json`: `2c364bb2d2db132831377358f693a03451c3aff5cff297b41d29a73576450e6f`
- `data/archive-analytics.json`: `22eae8f49c232ea86f71b6b183863ee8377d7ea512bf6abd06937757e719d91c`

### Tumblr extraction coverage batch 11

Five more Tumblr records with source text but no relationship rows were mapped
to existing entities only: `TUMBLR-00091`, `TUMBLR-00093`, `TUMBLR-00094`,
`TUMBLR-00096`, and `TUMBLR-00098`. No new entity IDs were created.

A read-only Kimi CLI review checked the proposed mappings. The review rejected
one `rebooted music news system` concept row because the snippet was too
music-specific for the existing `Rebooted system of news` concept, and rejected
a Laura Edwins-to-Christian Science Monitor affiliation row because the source
identified a project partner, not employment. The final batch dropped the music
concept row and recast the Christian Science Monitor evidence as a Studio 20
mention.

Changes applied:

- Appended 32 relationship rows to `data/extracted_relationships.csv`.
- Added a focused regression proving every new context snippet is an exact
  substring of its source record.
- Left `data/extracted_entities.csv` unchanged.

The focused regression
`node --test --test-name-pattern "Tumblr extraction batch eleven" tests\extraction-coverage.test.js`
failed before the relationship append because `TUMBLR-00091_REL_001` was
missing, then passed after the append.

Post-application counts:

- Relationships: 11,027, up from 10,995.
- Archive records with entities: 850/1,028 (82.7%), up from 845/1,028.
- Extraction coverage missing archive records: 23, down from 28.
- Generated records after export: 26,691.

Validation:

- `node --test --test-name-pattern "Tumblr extraction batch eleven" tests\extraction-coverage.test.js`:
  passed.
- `python backend\scripts\validate_archive_data.py`: no errors.
- `npm run test:data:extraction-coverage`: expected completion gate still fails
  on 23 records with raw text but no extracted relationships.
- `node data\export-archive-data.js`: passed.
- `npm run test:data`: expected eight completion gates still fail: two core
  blanks (`RECORD-00602:url`, `RECORD-00613:url`), one blank summary
  (`RECORD-00865`), five unverified archive records, one `#NN08` capture-year
  date (`RECORD-00865:2016-02-12`), 54 non-Rosen Bluesky profile URLs, 54
  non-Rosen Bluesky copyright assignments, 29,693 unverified social rows, and
  50 blank entity first mentions. The relationship endpoint, self-reference,
  duplicate semantic key, canonical-name, and Tumblr batch tests pass.

Final SHA-256 values after export:

- `data/archive_records-public.csv`: `5626cc10b446bd18a6c3426d7e61471ea6856d577deabdc3b57ce1ee7a340b2f`
- `data/social_posts.csv`: `3c850bca0491b44ec7b1da805e61f8b3fbfaea8d80e44c0c24d431c38031dedf`
- `data/extracted_entities.csv`: `5833f0fec30553c1a1ee6fd5fe8663bbe396a32efd0ef3638ad59dcd8063d1a9`
- `data/extracted_relationships.csv`: `2d8309e864817db1a3dc8af3ddf4f48ec737f3b54615140e380cfce873bbea4e`
- `data/archive-data.json`: `1ef2ea537e40ab6b39b4adfc839d39968300c3df9fd1c9535577c657f2c2d954`
- `data/archive-core.json`: `4287da1d78175c4ec67280c3de338dbb540842cd0d548f374331ae4080857392`
- `data/archive-details.json`: `d45bcfe144b9fcb08ec5ca73b2ec8448c3f1a9ecd9e34a1d78b3d928f923f73e`
- `data/archive-entities.json`: `de9262d869787396249c4cabb1a9c601a9b05382711bd17a47e6aca9b465ca21`
- `data/archive-analytics.json`: `22eae8f49c232ea86f71b6b183863ee8377d7ea512bf6abd06937757e719d91c`

### Tumblr extraction coverage batch 12

Five more Tumblr records with source text but no relationship rows were mapped
to existing entities only: `TUMBLR-00099`, `TUMBLR-00100`, `TUMBLR-00103`,
`TUMBLR-00104`, and `TUMBLR-00105`. No new entity IDs were created.

A read-only Kimi CLI review checked the proposed mappings. The review rejected
the weak NAMIC diversity, hyperlocal-as-topic, and East Village location rows,
and recommended downgrading several partnership claims from `Affiliated With`
to `Mentions`. The final batch followed those changes and kept only exact
source excerpts.

Changes applied:

- Appended 32 relationship rows to `data/extracted_relationships.csv`.
- Added a focused regression proving every new context snippet is an exact
  substring of its source record.
- Left `data/extracted_entities.csv` unchanged.

The focused regression
`node --test --test-name-pattern "Tumblr extraction batch twelve" tests\extraction-coverage.test.js`
failed before the relationship append because `TUMBLR-00099_REL_001` was
missing, then passed after the append.

Post-application counts:

- Relationships: 11,059, up from 11,027.
- Archive records with entities: 855/1,028 (83.2%), up from 850/1,028.
- Extraction coverage missing archive records: 18, down from 23.
- Generated records after export: 26,691.

Validation:

- `node --test --test-name-pattern "Tumblr extraction batch twelve" tests\extraction-coverage.test.js`:
  passed.
- `python backend\scripts\validate_archive_data.py`: no errors.
- `npm run test:data:extraction-coverage`: expected completion gate still fails
  on 18 records with raw text but no extracted relationships.
- `node data\export-archive-data.js`: passed.
- `npm run test:data`: expected eight completion gates still fail: two core
  blanks (`RECORD-00602:url`, `RECORD-00613:url`), one blank summary
  (`RECORD-00865`), five unverified archive records, one `#NN08` capture-year
  date (`RECORD-00865:2016-02-12`), 54 non-Rosen Bluesky profile URLs, 54
  non-Rosen Bluesky copyright assignments, 29,693 unverified social rows, and
  50 blank entity first mentions. The relationship endpoint, self-reference,
  duplicate semantic key, canonical-name, and Tumblr batch tests pass.

Final SHA-256 values after export:

- `data/archive_records-public.csv`: `5626cc10b446bd18a6c3426d7e61471ea6856d577deabdc3b57ce1ee7a340b2f`
- `data/social_posts.csv`: `3c850bca0491b44ec7b1da805e61f8b3fbfaea8d80e44c0c24d431c38031dedf`
- `data/extracted_entities.csv`: `5833f0fec30553c1a1ee6fd5fe8663bbe396a32efd0ef3638ad59dcd8063d1a9`
- `data/extracted_relationships.csv`: `41b5a26176d7aa1459c210594f2a472264aaae1f7408c69c2167fd412fa87b54`
- `data/archive-data.json`: `0c0a672152d4b7afeaf529eab9049c9d768f18bcdc20d40114a12becb574f382`
- `data/archive-core.json`: `ad83962dad04eb372420a8365091452fdc7a3a3ca6ed68d0a02a3e1233bd962c`
- `data/archive-details.json`: `7b7bee28733866bd887b3f22c5476f5e8d945397b86da895f44d05fe66b6cec6`
- `data/archive-entities.json`: `e925e11fd72802a504964dbdc35fad61f2f95a20dfd17e8486e4a04f7a723f9d`
- `data/archive-analytics.json`: `22eae8f49c232ea86f71b6b183863ee8377d7ea512bf6abd06937757e719d91c`
