# Pre-publication task list: Jay Rosen Internet Archive

**Created:** February 5, 2026
**Target:** Full archive launch (Phase 2)
**Last updated:** February 5, 2026

---

## Overview

This document tracks everything that needs to happen before the full Jay Rosen Internet Archive goes live. The dissertation and reader are already launched at pressthink.org/j/rosen-archive/. This is about the full archive — the searchable database, entity network, and expanded content features.

---

## Completed (Phase 1 — December 2025)

These are done and deployed:

- [x] Dissertation reader with full text, dark/light mode, text selection sharing, PDF download
- [x] Landing page with hero, "How to explore," tools grid, "Why it matters," "Scholars respond," bio
- [x] FAQ tool (46 Q&A pairs)
- [x] Annotated excerpts (12 passages, placeholder commentary)
- [x] Read the announcement (links to PressThink blog post)
- [x] Phase 1 launch implementation (PR #107, merged December 8, 2025)
- [x] Path standardization for /j/rosen-archive/ deployment (PR #106)
- [x] Entity extraction branch cherry-picked into main (February 5, 2026)

---

## Tasks for Jay Rosen

Jay's job is simple: use the archive, tell us what's broken, and make editorial decisions.

### Use the archive and report bugs

- [ ] **Go to pressthink.org/j/rosen-archive/ and click everything.** Try every link on the landing page. Open the reader. Open the FAQ. Try it on your phone. Tell Joe what's broken, confusing, or ugly.
- [ ] **Report any broken links, misattributions, or factual errors** — Email Joe a list. Screenshots help.

### Review promotional content

- [ ] **Review promo drafts in `release-assets/promotional-content/`** — Social media posts, blog drafts, talking points. Approve, revise, or reject.
- [ ] **Review the Dave Winer analysis** in `docs/DAVE_WINER_ANALYSIS.md` — Recommendations for engaging Winer and his audience.

### Publication and release decisions

- [ ] **Set a target date for full archive launch** — When does Phase 2 go live?
- [ ] **Decide on the PressThink announcement timing** — Blog post goes live when, relative to launch?
- [ ] **Identify copublication opportunities** — Industry publications (Nieman Lab, CJR, Poynter, etc.), academic journals, media newsletters. Who should cover the archive launch?
- [ ] **Decide on "Scholars respond" section** — Are there confirmed contributors? Timeline?
- [ ] **Decide on release/publication schedule** — What order do things roll out? Soft launch to academics → public launch → media coverage?

### Future content (not blocking launch)

- [ ] Write "What I got wrong" essay (retrospective)
- [ ] Write "The chapter I'd add today" essay
- [ ] Write 2025 commentary for annotated excerpts (currently placeholder text)
- [ ] Record audio commentary / office hours (optional)

---

## Tasks for Joe and Claude

### A. Data quality and validation (verified counts as of Feb 5, 2026)

- [ ] **Fix 24 duplicate URL groups (29 excess records)** — 53 records share URLs across 24 groups. Includes true duplicates, data entry errors (wrong tweet mapped to URL), and shared newspaper page images.
- [ ] **Deduplicate 135 entity name groups** — Same person/concept appears under multiple IDs (e.g., "PressThink" appears 5 times across 3 entity types). This fragments the knowledge graph.
- [ ] **Fix 5,633 single-mention entities (98.2%)** — Almost no entities connect across records. Cross-record deduplication never ran. This is the biggest data quality issue.
- [ ] **Categorize 76 records missing categories** (8.7%) — 52 clip records and 24 Tumblr records have no category.
- [ ] **Extract key concepts for 335 records** (38.6%) — All 138 Tumblr, all 62 clips, all 10 threads, plus 125 core records (RECORD-00302 to -00599 range) missing concepts.
- [ ] **Fix RECORD-00068** — Missing era, title/URL mismatch ("Running Records for Classroom Teachers" pointing to "What Are Journalists For?" on Goodreads).
- [ ] **Remove 36 duplicate relationships** — 34 groups of extraction artifacts where the same relationship was extracted multiple times.
- [ ] **Verify 229 unverified records** (26.4%) — All 138 Tumblr and 62 clip records are unverified. 29 core RECORD entries also unverified.
- [ ] **Fix featured work #6 URL** — "Audience Atomization" card links to the "People Formerly Known as the Audience" URL. Should point to RECORD-00616.

### B. Entity extraction and relationship mapping

- [x] **Merge entity extraction branch** — Cherry-picked into main on Feb 5, 2026.
- [ ] **Resume entity extraction pipeline** — Currently at 24.8% (5,800 of 23,416 social posts processed). Need to process remaining 17,616 posts. Script: `backend/scripts/unified_entity_processor.py`
- [ ] **Deduplicate entities across records** — 5,633 of 5,736 entities (98.2%) appear in only one record. Cross-record deduplication needed. 135 entity name groups have the same name under different IDs.
- [ ] **Rebuild relationship counts** — After completing extraction and deduplication, recalculate all mention counts and relationship weights.
- [ ] **Validate entity types** — Confirm all 6 types (Person, Organization, Concept, Work, Event, Location) are correctly assigned.
- [ ] **Generate final entity/relationship CSVs** — Export from extraction DB to data/ directory for frontend consumption.

### C. The "21 things" structural motif

Jay's idea. We build it. See `docs/21-STRUCTURE-PROPOSAL.md` for the full plan.

- [x] **Expand key themes from 7 to 21** — Done. 21 themes in `dissertationData.js` KEY_THEMES array.
- [x] **Expand notable quotations from 9 to 21** — Done. 21 quotations in `dissertationData.js` NOTABLE_QUOTATIONS array.
- [x] **Expand featured works from 6 to 21** — Done (Feb 6, 2026). 21 works in `constants.js` FEATURED_WORKS array. Spans 1986-2025, covers all major Rosen concepts.
- [x] **Expand glossary from 16 to 21** — Done. 29 terms in `dissertation/glossary/data.js` (exceeds target).
- [x] **Expand timeline from 13 to 21** — Done. 21 milestones in `dissertation/timeline/data.js`.
- [x] **Expand comparisons from 7 to 21** — Done. 21 comparisons in `dissertation/comparison/data.js`.
- [x] **Expand annotated excerpts from 12 to 21** — Done. 21 excerpts in `dissertation/excerpts/data.js`.
- [x] **FAQ stays at 46** — Skipped per recommendation in 21-STRUCTURE-PROPOSAL.md. 46 Q&A pairs, no forced regrouping.
- [x] **Expand context 1986 to 21** — Done. 9 media landscape + 4 key events + 8 "what didn't exist" = 21 items across three arrays in `dissertation/context/data.js`.
- [ ] **Update landing page** with "21" branding and framing
- [ ] **Design the presentation** — How do the 21-item lists display in the UI?

### D. Frontend bug testing

- [ ] **Test all feature tool links from landing page** — Validation report flagged potential path mismatches between `/features/` and `/dissertation/` directories.
- [ ] **Test Explorer (network visualization)** — Load with full dataset. Check for performance issues, rendering bugs, broken connections.
- [ ] **Test MindMap (dissertation tree)** — Click all nodes, expand/collapse, verify content loads correctly.
- [ ] **Test RecordModal** — Open records of each type (article, interview, thread, social). Verify all fields display.
- [ ] **Test Sidebar search and filters** — Search by keyword, filter by era, category, concept. Verify results are correct.
- [ ] **Test Timeline component** — Click year bars, verify filtering works.
- [ ] **Test responsive layout** — Desktop, tablet, mobile breakpoints.
- [ ] **Test all external links** — 78 external URLs need verification (CDN links, PressThink links, PDF downloads).
- [ ] **Cross-browser testing** — Chrome, Firefox, Safari, Edge.
- [ ] **Test localStorage caching** — Verify 1-hour TTL works, data refreshes properly.

### E. Performance and deployment

- [ ] **Test load time with full 25MB dataset** — Measure initial load, ensure split data loading works.
- [ ] **Verify CDN dependencies** — React 18, HTM, Tailwind, PapaParse, Lucide React all load from CDN.
- [ ] **Update absolute paths for production** — Confirm all paths use `/j/rosen-archive/` prefix.
- [ ] **Verify Git LFS files** — Dissertation PDFs must be properly served.
- [ ] **Run CI/CD validation** — Trigger all GitHub Actions workflows, confirm green.
- [ ] **Deploy updated archive to WordPress** — FTP upload to pressthink.org/j/rosen-archive/

---

## Priority order

1. **Data quality fixes** — Duplicates, missing categories, missing concepts
2. **Entity extraction** — Resume pipeline from 24.8%, then deduplicate
3. **Implement the "21 things" structure** — Expand all feature data files
4. **Frontend bug testing** — Systematic walkthrough
5. **Jay's bug reports and editorial decisions** — In parallel with #1-4
6. **Production deployment** — After everything above is done

---

## How to use this document

Check off items as they're completed. This is a living document — update it as new issues surface or priorities change.
