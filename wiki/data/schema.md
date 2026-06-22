---
type: concept
title: Schema and vocabulary
description: The archive's core types (Record, Entity, Entity Index, Facet) and the exact vocabulary to use when talking about them.
source: [CONTEXT.md, data/SCHEMA.md, data/schema.json]
verified: 2026-06-22
tags: [data, schema, vocabulary]
timestamp: 2026-06-22
---

# Schema and vocabulary

Use the project's terms exactly (full definitions in [CONTEXT.md](../../CONTEXT.md)):

- **Archive** — the whole collection: every Record, every Entity, plus derived structures.
- **Record** — a single archive entry (`id`, `title`, `date`, `year`, `era`, `pub`, `categories`, `type`). The source of truth for what's in the archive.
- **Record type** — the published `Record.type` field (in `archive-core.json`) is `article`, `social`, or `Dissertation` (currently 949 `article`, 25,665 `social`, 1 `Dissertation`). The source CSVs carry finer-grained content types — `RECORD`, `TUMBLR`, `CLIP` (newspaper clipping), `THREAD` (social thread) — which the exporter collapses into `article`/`social` for the published data. Filter and test against the published `article`/`social`/`Dissertation` values, not the CSV types.
- **Entity** — an extracted named thing appearing across Records (`id`, `type`, `prominence`). Six entity types (per `data/schema.json` / `ENTITY_TYPE_CONFIG`, counts from `archive-entities.json`): `Person` (2,668), `Organization` (1,659), `Concept` (1,322), `Work` (997), `Event` (466), `Location` (267) — 7,379 total.
- **Entity Index** — the derived bidirectional lookup: Record → its Entities, Entity → the Records that mention it. A pure projection of Records + Entities, built once at load.
- **Facet** — a filter dimension over Records (`categories`, `eras`, `publications`).
- **Era** — a named time period (e.g. "Public Journalism (90s)").
- **Categories** vs **Concepts** — curator-assigned topic labels on a Record, versus free-text idea labels; distinct from a structured `Concept` Entity.
- **Loader** — fetches Archive data and returns it; does not own the Entity Index.
- **Curator** — [Joe Amditis](../people/joe-amditis.md), who decides which Records enter the Archive.

Field-level detail: [data/SCHEMA.md](../../data/SCHEMA.md) and `data/schema.json`. The pipeline that produces this data: [systems/data-pipeline.md](../systems/data-pipeline.md).
