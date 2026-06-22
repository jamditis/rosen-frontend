---
type: system
title: Data pipeline (backend)
description: Poetry-managed Python pipeline that scrapes, categorizes, and AI-analyzes sources, then exports the JSON the front end loads.
source: [CLAUDE.md, docs/narrative/data-pipeline.md, backend/]
verified: 2026-06-22
tags: [backend, pipeline, data]
timestamp: 2026-06-22
---

# Data pipeline (backend)

The Python pipeline in [`backend/`](../../backend/) (Poetry-managed) scrapes sources, categorizes and AI-analyzes them, and produces the archive data. It handles articles, videos, Twitter/X, Tumblr, and newspaper clippings (PDF OCR).

- **Source of truth:** the CSVs in [`data/`](../../data/) — `archive_records-public.csv` (article-type [Records](../data/corpus.md)), `social_posts.csv`, `extracted_entities.csv`, `extracted_relationships.csv`.
- **Export step:** `node data/export-archive-data.js` regenerates the JSON the [front end](frontend.md) loads. The pipeline→exporter `verified` contract is case-sensitive (write `'TRUE'`), and the exporter filters out records that don't match.
- **Entity extraction** produces the [Entity](../data/corpus.md) graph and relationships used by the Entity Index.

Deeper detail: [docs/narrative/data-pipeline.md](../../docs/narrative/data-pipeline.md) and [docs/ENTITY_EXTRACTION_PIPELINE.md](../../docs/ENTITY_EXTRACTION_PIPELINE.md). Schema: [data/schema.md](../data/schema.md).
