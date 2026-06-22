---
type: concept
title: The corpus
description: 26,615 published records spanning four decades, plus 626 concepts and 7,379 entities across 6 categories; Jay Rosen is the top entity at 377 mentions.
source: [data/archive-analytics.json (regen 2026-06-20), data/archive-core.json, CLAUDE.md]
verified: 2026-06-22
tags: [data, corpus, counts]
timestamp: 2026-06-22
---

# The corpus

As of the 2026-06-20 regeneration, the published [Archive](../project/overview.md) holds:

- **26,615 records**
- **626 concepts**
- **7,379 entities** (top entity: **Jay Rosen**, 377 mentions)
- **6 categories**

These come from `data/archive-analytics.json` and match the published `archive-core.json`. The count only changes when a new build is pushed (and deploys are currently manual — see [systems/deploy-and-hosting.md](../systems/deploy-and-hosting.md)), so 26,615 is current for what's live. Jay wants the **exact figure confirmed right before he publishes** his launch essay, since it rises as records are added.

## Composition

The source CSVs hold ~1,030 article-type [Records](schema.md) (types `RECORD`, `TUMBLR`, `CLIP`, `THREAD`) plus a ~29,700-row social-post corpus (Twitter/X and Bluesky); after dedup and the export-layer `verified` filter, the published total is 26,615.

## Loading

Data is split for performance — `archive-core.json` (lightweight cards, on load), `archive-details.json` (full summaries, on demand), `archive-entities.json` (the entity graph), with `archive-data.json` as a combined fallback. See [systems/frontend.md](../systems/frontend.md).

## Known data gaps

Social records have generic titles; some records have empty `raw_text` and so no extracted relationships; a small set is genuinely unrecoverable (print-only or vanished publications). Detail: [docs/decisions-pending.md](../../docs/decisions-pending.md) and the data audits under [docs/](../../docs/).
