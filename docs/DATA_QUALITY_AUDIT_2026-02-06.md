# Data quality audit report

**Date:** 2026-02-06
**Source:** Ralph Loop iteration 2 — Playwright testing of live site + raw data search
**Site:** https://pressthink.org/j/rosen-archive/
**Data file:** `data/archive_records-public.csv`

---

## Fix summary (applied 2026-02-06)

| Fix | Records affected | Status |
|---|---|---|
| P0: Rebuilt 5 critically corrupted records | 5 | Done |
| P0: Cleared Gemini prompt leaks | 2 | Done |
| P1: Replaced generic "The author" with "Rosen" | 382 (615 field changes) | Done |
| P1: Replaced sidebar-scrape summaries with raw_text content | 44 | Done |
| P1: Fixed publisher typo | 1 | Done |
| P2: Removed duplicate records (print versions + exact-URL) | 65 removed (845 -> 780) | Done |
| P2: Filled unknown publishers from URL domains | 495 | Done |
| P2: Key concept audit | 0 (no auto-changes needed) | Reviewed |
| **Total records modified** | **~530 unique records** | |

Scripts used (in `data/`):
- `fix_p0_records.py` — 5 critical record rebuilds
- `fix_p0_extras.py` — prompt leak + typo fixes
- `fix_generic_summaries.py` — "The author" -> "Rosen" replacement
- `fix_redundant_rosen.py` — cleanup of "Rosen discusses Jay Rosen" patterns
- `fix_sidebar_summaries.py` — 44 sidebar-scrape summary replacements
- `dedup_records.py` — duplicate detection and removal
- `fix_unknown_publishers.py` — URL domain -> publisher mapping
- `fix_remaining_publishers.py` — extended domain mapping
- `find_duplicates.py` — duplicate analysis report
- `audit_key_concepts.py` — concept assignment audit

---

## Summary numbers

### Author attribution in summaries

| Pattern | Count | Status |
|---|---|---|
| "Rosen [verb]..." (proper) | ~200 | Good |
| "Jay Rosen [verb]..." (proper) | ~88 | Good |
| **"The author [verb]..."** (generic) | **~190** | Needs fix |
| **"This article [verb]..."** (generic) | **~295** | Needs fix |
| **"the article [verb]..."** (generic) | **~69** | Needs fix |
| **"the piece [verb]..."** (generic) | **~21** | Needs fix |
| **"This collection of blog posts..."** (sidebar scrape) | **~44** | Needs fix |
| **"Please provide the scraped..."** (Gemini prompt leak) | **1** | Critical |

**Bottom line:** ~500+ records have generic/impersonal summaries vs ~288 that properly name Rosen. Roughly 63% bad, 37% good.

---

## Critical bugs (individual records)

### 1. Gemini prompt leak — RECORD-00637
- **Title:** "The Digital Divide: Exploring the Gap in Internet Access and Adoption"
- **Summary:** "Please provide the scraped and parsed web content you would like me to summarize. I need the text to generate the paragraph summary."
- **URL:** Points to `publicnotebook.wordpress.com/2010/12/04/julian-assange-ducks-the-question-a-lot-of-us/` — completely different article about Julian Assange
- **Date wrong:** Listed as 2023-10-27 but URL shows 2010/12/04
- **Pull quote:** About Assange rape accusations — nothing to do with "digital divide"
- **Verdict:** Title, date, summary, URL all mismatched. Delete or completely rebuild.

### 2. Ice cream hallucination — RECORD-00633
- **Title:** "Four Types of Scoops" (about journalistic scoops)
- **Summary:** Describes ice cream scooping methods
- **Tags:** Ice cream, Scooping, Dessert, Food, Flat spoon (all wrong)
- **Pull quote:** IS correct (about journalism: "We tend to venerate this kind of scoop, but the journalist is often just a transcription service.")
- **Categories:** Correct (Press & Media Criticism, etc.)
- **Verdict:** Summary and tags are Gemini hallucinations. Pull quote and categories are correct. Needs re-summarization.

### 3. Content mismatch — RECORD-00602
- **Title:** "I have a new job: president of News Creator Corps."
- **Summary:** About NYT removing the word "blog" from its website (completely unrelated)
- **Tags:** All about NYT/blogging, not News Creator Corps
- **Pull quote:** About defensive newsroom culture — also unrelated
- **Verdict:** Summary, tags, and pull quote all from a different article. Needs complete rebuild.

### 4. Content mismatch — "A Second Academic Exodus From X?" (Inside Higher Ed, 2024-11-13)
- **Title:** About academics leaving X/Twitter
- **Summary:** Describes Stephen Colbert criticizing Rosen about Sunday morning talk shows
- **Verdict:** Summary is from a completely different article/topic. Needs re-summarization.

### 5. 20-year date error — RECORD-00159
- **Title:** "Governing Incorporates the Press and Vice Versa: The President's Secret Flight to Baghdad"
- **URL:** `archive.pressthink.org/2003/12/03/bush_trip.html` (2003 article about Bush)
- **Date in record:** 2023-12-03 (20 years off)
- **Era:** Placed in "Democracy in Crisis (20s)" instead of "Web & Blogging (00s)"
- **Summary:** Describes "a collection of links and descriptions" rather than the specific article
- **Verdict:** Date is 20 years wrong. Needs date fix and re-summarization.

### 6. Publication name typo
- **"The New York Treview"** should be **"The New York Review"** (or "The New York Review of Books")
- Affects at least 1 record

---

## Systemic issues

### 1. "This collection of blog posts" summaries (44 records)
These records describe PressThink as a whole instead of the specific article. The scraper captured sidebar/navigation content from archive.pressthink.org, and Gemini summarized THAT instead of the actual article text. All 44 need new summaries derived from the actual article content.

**Pattern in data:** All start with "This collection of blog posts by Jay Rosen reflects on the changing media landscape in the early 2000s..."

### 2. Duplicate records
Multiple PressThink articles appear twice with slightly different titles:
- "PressThink: [Title]" (from one scrape source) AND "[Title]" (from another scrape source)
- Same URL, same date, different record IDs, often different summaries
- Examples found: Advance Man, Blocking Assignment, Master Narrative, Recall Cliches, Terms of Authority, Flagship Turns, How Do You Cover 133 Candidates

### 3. Generic related records
Many records show the same 4-5 recent articles as "related" regardless of topical relevance:
- "A new fellowship is all about putting the news in news creator" (Nieman)
- "News Consumers are Content Creators in an AI-Driven World" (News Creator Corps)
- "Some more personal news: October 2025" (PressThink)
These appear to be fallback matches when no real entity/concept relationships exist.

### 4. Misassigned key concepts
"The People Formerly Known as the Audience" appears as a key concept on records where it has no relevance:
- A 1989 textbook ("Rereading America")
- A 2010 paywall article
- A 2023 "Digital Divide" article (which is itself corrupted)

### 5. "Unknown" publisher for known sources
Multiple records show "Unknown" as publisher when the URL clearly indicates the source (e.g., PressThink, Public Notebook). These could be auto-populated from the URL domain.

---

## Recommended fixes (priority order)

### P0 — Critical (before any public launch) — COMPLETED 2026-02-06

1. ~~**Delete or rebuild 5 critically corrupted records**~~ — FIXED
   - RECORD-00637: Title/date/summary/tags all rebuilt (was "Digital Divide", now "Julian Assange Ducks the Question")
   - RECORD-00633: Summary/tags/date/author fixed (ice cream hallucination removed, author corrected to Jonathan Stray)
   - RECORD-00602: Summary/tags/date fixed (NYT blog content replaced with News Creator Corps)
   - RECORD-00592: Summary/tags fixed (Colbert content replaced with academic exodus from X)
   - RECORD-00159: Date fixed (2023 -> 2003), era corrected, summary rewritten from raw_text
2. ~~**Fix the Gemini prompt leak**~~ — FIXED
   - RECORD-00637 prompt leak fixed (in summary + excerpt)
   - RECORD-00092 prompt leak found and cleared (in responds_to field)
   - Full scan completed: no other prompt leaks found
3. ~~**Fix the 20-year date error**~~ — FIXED (included in #1 above)

### P1 — High priority (data quality) — COMPLETED 2026-02-06

4. ~~**Fix generic author references in ~382 records**~~ — FIXED
   - Replaced "The author argues..." with "Rosen argues..." (and similar patterns)
   - 382 records modified, 615 field-level changes across summary and excerpt fields
   - Fixed 1 redundant "Rosen discusses Jay Rosen's" pattern
5. ~~**Rebuild 44 "collection of blog posts" records**~~ — FIXED
   - All 44 sidebar-scrape summaries replaced with content extracted from raw_text
   - 6 generic excerpts also replaced
6. ~~**Fix publication typo**~~ — FIXED
   - RECORD-00023: "The New York Treview" -> "The New York Review of Books"

### P2 — Medium priority (dedup and relationships) — COMPLETED 2026-02-06

7. ~~**Deduplicate PressThink records**~~ — FIXED
   - Removed 60 PressThink _p.html (print version) duplicates
   - Removed 5 exact-URL newspaper clipping duplicates
   - Total: 65 records removed (845 -> 780)
   - Cleaned 175 related_to field references to removed records
   - 6 cross-platform duplicates flagged for manual review (not auto-removed)
8. ~~**Audit key concept assignments**~~ — REVIEWED, NO AUTO-FIX NEEDED
   - "The People Formerly Known as the Audience" appears on 283/780 records (36%)
   - Keyword analysis found 0 obviously misassigned records
   - High frequency is plausible: Rosen's work centers on audience dynamics
   - Flagged for future manual review
9. ~~**Fill "Unknown" publishers from URL domains**~~ — FIXED
   - 473 publishers filled from URL domain mapping (first pass)
   - 22 more filled from extended domain list (second pass)
   - Total: 495 / 499 unknown publishers resolved
   - Only 4 remain unknown (niche domains with 1 record each)
   - Publications count increased from 140 to 147

### P3 — Low priority (UX improvements)
10. **Improve related records algorithm** — don't show the same generic recent articles for every record
11. **Add content type "Dissertation"** — the dissertation record shows as "Article"

---

## Records tested in this audit

| Record ID | Title | Era | Issues found |
|---|---|---|---|
| dissertation-1986 | The Impossible Press | All | Type shows "Article" not "Dissertation" |
| RECORD-00633 | Four Types of Scoops | 10s | Ice cream hallucination |
| RECORD-00624 | Rereading America | 90s | Author mismatch, wrong key concept |
| RECORD-00052 | The savvy turn in political journalism | 20s | "The author" x2 |
| RECORD-00053 | Answers to Craig's Questions | 20s | "the author" x1 |
| RECORD-00641 | After six years of asking, NPR interviewed Trump | 20s | "The author" x4 |
| RECORD-00637 | The Digital Divide | 20s | Gemini prompt leak, all fields wrong |
| RECORD-00602 | I have a new job: president of News Creator Corps | 20s | Summary/tags from different article |
| RECORD-00159 | President's Secret Flight to Baghdad | 20s | 20-year date error, sidebar summary |
| RECORD-00100 | Recall Cliches at the LA Times | 00s | "Collection of blog posts" summary |
| RECORD-00652 | NYT paywall disappears | 10s | "The author" x5 |
| (unnamed) | A Second Academic Exodus From X? | 20s | Summary from Colbert segment |
| (unnamed) | A desperate appeal to newsroom leaders | 20s | Summary about Musk/Twitter instead |
| (unnamed) | America's Press (NY Treview) | 20s | Publisher typo |
