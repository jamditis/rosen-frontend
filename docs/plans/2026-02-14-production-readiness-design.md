# Production readiness design: Jay Rosen's Internet Archive

**Created:** February 14, 2026
**Deadline:** End of week of February 23, 2026 (~9 days)
**Goal:** Full archive launch with 100% data completeness and cross-browser testing

---

## Critical path

Entity extraction is the longest-running task (~5-7 days continuous API processing). Everything else fits around it.

```
Day 1-7: Entity extraction running continuously (background)
Day 1-3: Data fixes + metadata batch processing (parallel)
Day 3-5: Entity dedup + relationship rebuild (after extraction catches up)
Day 5-7: "21 things" UI branding + final data export
Day 7-9: Full testing + deployment
```

---

## Workstream 1: Entity extraction (days 1-7)

- Resume `unified_entity_processor.py` from batch 188 (9,850/23,416 posts, 42.1%)
- Run locally first, move to Raspberry Pi (officejawn) if needed for unattended 24/7 operation
- Monitor progress daily — if API rate limits slow things down, split across providers
- Target: 100% of 23,416 substantive social posts processed
- Database: `data/social_import/extraction.db`

**Resume command:**
```bash
cd backend
PYTHONPATH=src python scripts/unified_entity_processor.py --status --data-dir ../data/social_import
```

---

## Workstream 2: Data quality fixes (days 1-3)

All run in parallel with entity extraction.

### Metadata gaps (AI batch + spot check)

- **76 records missing categories** — AI batch via Gemini/OpenAI/Anthropic. Feed record title + URL + summary, get category back. Spot-check 10-15% of results.
- **335 records missing key concepts** — Same approach. Feed content, extract 3-5 concepts per record. Spot-check sample.
- Breakdown of 335 missing concepts: 138 Tumblr, 62 newspaper clippings, 10 threads, 125 core records (RECORD-00302 to RECORD-00599)

### Record fixes

- **24 duplicate URL groups (29 excess records)** — Audit each group, merge or delete
- **Fix RECORD-00068** — Missing era, title/URL mismatch ("Running Records for Classroom Teachers" pointing to "What Are Journalists For?" on Goodreads)
- **Fix featured work #6 URL** — "Audience Atomization" card links to wrong record. Should point to RECORD-00616.
- **Remove 36 duplicate relationships**
- **229 unverified records** — Batch verify via URL spot-checks + content validation (138 Tumblr, 62 clips, 29 core records)

---

## Workstream 3: Entity deduplication (days 3-5)

Depends on entity extraction being well ahead.

- **135 entity name groups** — Merge duplicate entity IDs (e.g., 5 "PressThink" entries across 3 entity types → 1)
- **Cross-record deduplication** — 5,633 of 5,736 entities (98.2%) appear in only one record. Match against each other.
- **Validate entity types** — Confirm Person/Org/Concept/Work/Event/Location assignments are correct
- **Rebuild relationship counts** — Recalculate mention counts and weights after dedup
- **Generate final entity/relationship CSVs** — Export from extraction DB to `data/` directory

---

## Workstream 4: "21 things" UI branding (days 5-7)

Light branding pass — no layout redesign.

- Add "21" framing text to dissertation landing page
- Add narrative callouts where 21-item lists appear (themes, quotes, works, glossary, timeline, comparisons, excerpts, context)
- Reference framing from `docs/21-STRUCTURE-PROPOSAL.md`:
  > *21 key ideas. 21 essential quotations. 21 featured works. 21 milestones. The Impossible Press was written in 1986. This archive traces how one dissertation became a life's work.*

---

## Workstream 5: Testing + deployment (days 7-9)

After data is finalized.

### Data regeneration
- Regenerate all JSON from CSV: `node data/export-archive-data.js`
- Run full test suite: `npm test`
- Verify JSON sizes are reasonable (core ~11MB, details ~12MB, entities ~1.1MB)

### Frontend testing
- Cross-browser: Chrome, Firefox, Safari, Edge
- Mobile: iOS Safari, Android Chrome
- Test all feature tool links from landing page
- Test Explorer with full entity dataset
- Test search, filters, timeline
- Test RecordModal for each record type (article, interview, thread, social)
- Test MindMap — click all nodes, expand/collapse
- Verify responsive layout at desktop/tablet/mobile breakpoints

### Link verification
- Verify all 78 external URLs
- Verify CDN dependencies load (React 18, HTM, Tailwind, PapaParse, Lucide, sql.js)

### Deployment
- FTP upload to pressthink.org/j/rosen-archive/
- Bump `?v=` version strings for cache busting
- Verify absolute paths use `/j/rosen-archive/` prefix
- Verify Git LFS files (dissertation PDFs) serve correctly
- Post-deploy smoke test on live URL

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Entity extraction slower than expected | Split across multiple API providers; move to Pi for 24/7 operation |
| AI batch categorization produces bad results | Spot-check before committing; rerun failures with different provider |
| Testing surfaces major bugs | Days 7-9 buffer; minor issues can be hotfixed post-launch |
| Data regeneration breaks something | Run test suite after every JSON export |

---

## Out of scope for launch

- Social post title generation (28k+ generic titles stay as-is)
- localStorage caching fix
- Full entity browser UI redesign
- Jay's "What I got wrong" essay and other future content essays
- Audio commentary / office hours

---

## Decisions made

- Entity extraction must reach 100% before launch (hard requirement)
- Metadata gaps filled via AI batch processing with spot-check review
- "21 things" gets a light branding pass, not a full redesign
- Launch bar: all data complete + fully tested across browsers
- Compute: flexible — local machine + Pi as needed
