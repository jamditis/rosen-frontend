# Archive data guide

This directory holds the archive's data: the CSV source files that record everything in the collection, the generated JSON files the website reads, and the script that turns one into the other.

The metadata and derived data (entities, relationships) are licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): you're free to use and build on them, but attribution is required — credit the archive and link back to https://pressthink.org/j/rosen-archive/ (see the license section of [`SCHEMA.md`](SCHEMA.md)).

## The data files at a glance

### Generated JSON (what the site reads)

| File | Size | Contents |
|------|------|----------|
| `archive-core.json` | ~13 MB | Lightweight record cards, loaded on page load |
| `archive-details.json` | ~13 MB | Full summaries, quotes, and concepts, loaded on demand |
| `archive-entities.json` | ~1.9 MB | Entity graph for the Explorer view, loaded on demand |
| `archive-data.json` | ~30 MB | Full combined data — the fallback if the split files fail |
| `archive-analytics.json` | ~4 KB | Prebuilt aggregates for the analytics view |
| `search-index.json` | ~4 MB | Prebuilt MiniSearch full-text index, loaded on first search |
| `wiki-seed.json` | ~125 KB | Seed pages for the public archive wiki (`#wiki` route) |

### Source CSVs (the source of truth)

Counts verified 2026-07-23; they grow as records are added.

| File | Rows | Contents |
|------|------|----------|
| `archive_records-public.csv` | 1,029 | Curated records: 799 articles (`RECORD-`), 137 Tumblr posts (`TUMBLR-`), 83 newspaper clippings (`CLIP-`), 10 threads (`THREAD-`). Raw line count is much higher because text fields span multiple lines. |
| `social_posts.csv` | 29,747 | Social media posts: 26,114 Twitter/X (`TWTR-`), 3,117 Bluesky (`BSKY-`), 516 Mastodon (`MAST-`) |
| `extracted_entities.csv` | 8,150 | Named entities: people, organizations, and concepts |
| `extracted_relationships.csv` | 12,556 | Entity-to-record relationships with context snippets |

### Reference files

| File | Purpose |
|------|---------|
| `SCHEMA.md` | Human-readable data dictionary — start here if you want to use the data |
| `schema.json` | Machine-readable schema, linked from the site's open-data download UI |
| `eras.js` | The canonical era taxonomy, shared with the frontend |
| `authored-excerpts.csv` | Curator-written summaries that override auto-generated ones |
| `feeds/` | RSS feeds (full archive, articles, per-category, per-era) and OPML subscription lists |
| `export-archive-data.js` | The Node.js script that generates all the JSON from the CSVs |

## Using the data

- **Just want to read it?** Browse the archive at https://pressthink.org/j/rosen-archive/ — it's the same data with search and filters.
- **Want to analyze it?** The CSVs open in any spreadsheet app or data tool. `SCHEMA.md` explains every column. Note that text fields in `archive_records-public.csv` contain line breaks, so use a real CSV parser rather than splitting on newlines.
- **Want to build on it?** The split JSON files are what the site itself consumes; `archive-data.json` is the everything-in-one-file option.

Licensing: the code in this repository is MIT licensed; the metadata and derived data are [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (attribution required); and the archived writings referenced by the data remain under the original copyright of their authors and publications.

## Regenerating the JSON

After editing a CSV, regenerate the JSON files from the repository root:

```bash
npm install          # first time only
npm run export-data  # or: node data/export-archive-data.js
```

The script reads the four source CSVs (plus `authored-excerpts.csv`), processes and links the records, and writes the JSON files listed above. It prints progress as it goes, including a row count for each CSV it reads.

## Validating graph integrity

Run the cross-file graph validator from the repository root whenever records,
entities, relationships, extraction schemas, or generated archive JSON changes:

```bash
npm run validate:graph
```

The command generates a disposable in-memory SQLite database from the CSV and
JSON text sources. It enforces stable IDs, foreign keys, allowed types, first
mention references, relationship endpoints, and equality between published
`relatedIds`, `archive-entities.json`'s `recordEntityMap`, and the endpoint links
derived from canonical relationships. It also compares every duplicated entity
field across the two generated JSON files. The database is a validation artifact
only; no SQLite file is committed or treated as canonical.

Rows with unregistered relationship semantics must have an exact, reviewed
entry in `graph-validation-holds.json`. Holds are explicit temporary states,
not additions to the accepted relationship vocabulary. The per-relationship
semantic endpoint matrix remains part of the relationship-type audit in issue
#737; this validator requires both endpoints to resolve to typed entities without
prematurely declaring that matrix canonical.

Published records that are intentionally generated without a canonical CSV row
must likewise have their exact stable ID listed in
`generatedPublishedRecordIds` in that policy file. The validator rejects both
unlisted source-less records and obsolete entries that now have a source row.

For the full record-adding walkthrough — written for non-technical curators — see [`ADDING-RECORDS.md`](../ADDING-RECORDS.md). For which files to upload to production, see [`DEPLOYMENT.md`](../DEPLOYMENT.md).

### A note on history

The site originally fetched data from Google Sheets at runtime, which meant slow and unreliable loads. The pre-generated JSON approach replaced that: data loads in a few hundred milliseconds from static files, split so the first page load only fetches what it needs.

## Canonical CSVs vs `social_import/`

The CSVs listed above are the **canonical inputs** for `export-archive-data.js`. Regenerate the published JSON only from these.

`data/social_import/` is the gitignored working directory for the backend entity-extraction pipeline. Three scripts default `--data-dir` to it:

- `backend/scripts/unified_entity_processor.py`
- `backend/scripts/batch_entity_extraction.py`
- `backend/scripts/export_merged_data.py`

A frozen copy of `rosen_social_posts.csv` and ~200 `batch_*` artifacts live there. That CSV may share a header with `social_posts.csv` but is older pipeline output, not the live data — **do not regenerate the published JSON from anything under `social_import/`**.

## See also

- [`SCHEMA.md`](SCHEMA.md) — the data dictionary
- [`../frontend/services/archiveService.js`](../frontend/services/archiveService.js) — how the site loads this data
- [`../frontend/constants.js`](../frontend/constants.js) — data source URL configuration
- [`../backend/README.md`](../backend/README.md) — the pipeline that produces new records
