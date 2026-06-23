---
type: concept
title: Data quality gaps
description: The known data gaps, quality risks, and order of attack for improving the archive data.
source: [CLAUDE.md, docs/definition-of-done.md, docs/backlog-priority.md, docs/decisions-pending.md, data/archive-analytics.json]
verified: 2026-06-23
tags: [data, quality, gaps, backlog]
timestamp: 2026-06-23
---

# Data quality gaps

The current published [Archive](corpus.md) snapshot has 26,615 Records, 626 concepts, 7,379 Entities, and 6 categories. Re-check `data/archive-analytics.json` before quoting counts externally.

## Known gaps

- Social Records have generic titles such as "Tweet by Jay Rosen" or "Post by Jay Rosen"; content-based title generation is still future work.
- Some thread Records have placeholder titles.
- Roughly 200 Records have zero extracted relationships, mostly because `raw_text` is empty. Relationship extraction should run again only after raw-text gap-fill lands.
- A small set of Records remains `verified=false`; some are genuinely unrecoverable because the original source was print-only or vanished.
- PressThink URL canonicalization remains a policy decision: modern `pressthink.org` URL versus `archive.pressthink.org` historical URL.
- Era taxonomy and duplicate groups still need a final cleanup pass.

## Gap-fill order

The critical path from [docs/definition-of-done.md](../../docs/definition-of-done.md):

1. HuffPost gap-fill.
2. PressThink gap-fill.
3. Wayback recoveries.
4. Re-extract relationships after `raw_text` is filled.
5. Resolve duplicate/canonical URL policy.
6. Finalize unrecoverable Records.
7. Normalize stale era values.

## Data-source boundaries

The canonical inputs for the published JSON are the CSVs in `data/`: `archive_records-public.csv`, `social_posts.csv`, `extracted_entities.csv`, and `extracted_relationships.csv`. Do not regenerate published JSON from gitignored pipeline working directories such as `data/social_import/`.

## Tests to use

- `npm run test:data`
- `npm run test:data:extraction-coverage`
- `npm run test:pipeline`
- `node data/export-archive-data.js` after CSV changes

For public numbers, use the generated JSON/analytics files, not older narrative docs.
