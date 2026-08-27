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
| `search-index.json` | ~4.4 MB | Prebuilt MiniSearch index for curated records, loaded on first search |
| `social-search-index.json` | ~7.1 MB | Body-only MiniSearch index for published social posts and served thread containers, loaded on first search |
| `relationship-adjacency-0.json` to `relationship-adjacency-f.json` | Varies | Sixteen stable public-safe relationship shards, loaded one record at a time |
| `relationship-adjacency-manifest.json` | Varies | Record-to-shard index, schema version, byte sizes, and SHA-256 hashes |
| `wiki-seed.json` | ~125 KB | Seed pages for the public archive wiki (`#wiki` route) |
| `stewardship-census.json` | ~150 KB | Machine-readable source/runtime, graph, field, URL, and preservation coverage census |
| `stewardship-census.md` | ~4 KB | Concise human-readable census summary and 2026-07-22 baseline comparison |
| `preservation-sample.json` | ~60 KB | Versioned 100-source manifest for the preservation pilot (issue #704); curator/reviewer eyes only |
| `preservation-sample.md` | ~2 KB | Human-readable coverage summary for the same pilot sample; curator/reviewer eyes only |
| `preservation-sample.sources.json` | ~10 KB | Blind worker-facing projection of the same sample: id, objectType, url only, no stratum or reason |

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

### Relationship adjacency export

`npm run export-data` also writes the relationship adjacency manifest and its
sixteen stable shards. Regenerate only those files with:

```bash
npm run export:relationship-adjacency
```

The export publishes an assertion only when its source record is served, its
relationship type is active, and it has no graph-validation hold. Each
assertion contains stable entity IDs, relationship type and direction,
confidence, decision state, and a record-level evidence reference. It excludes
entity names, context snippets, raw source text, and hold reasons. Here,
`approved` means the assertion passes the current publication policy. It does
not claim a separate human review event.

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

## Stewardship coverage census

Regenerate the committed stewardship inventory from the canonical CSVs and the four runtime JSON bundles:

```bash
npm run census:stewardship
```

The command writes `stewardship-census.json` and `stewardship-census.md`. The JSON contract is `stewardship-census/1.0.0`: version 1 may gain fields, while renamed fields or changed count semantics require a new major version. Output has no wall-clock timestamp, so unchanged inputs in a full-history checkout produce byte-identical reports. A shallow checkout is rejected because it cannot reproduce the last input-changing commit used by the provenance stamp.

The census stamps the most recent Git commit that changed an input file, the clean/dirty state of those inputs, and a SHA-256 digest for each CSV and runtime JSON file. Source and runtime counts remain separate. Filtered rows use the exporter's ordered first-match taxonomy and retain exact record IDs in JSON. The report also keeps the measured 2026-07-22 baseline and explains later deltas rather than overwriting the historical checkpoint.

The command refuses to write a stamped report while any census input is dirty. After a data change, run the data tests and commit the source and runtime files first. The committed-report freshness subtest skips while those inputs are dirty, then resumes after that commit. Run `npm run census:stewardship`, rerun the test, and commit the two reports. This two-commit sequence keeps the input commit truthful and lets the freshness test compare the generated files byte for byte. The automated submission and master-sheet sync pipelines use this same data-commit-then-report-commit sequence before they push.

`tests/stewardship-census.test.js` exercises representative fixtures, proves an intentional source-row change alters the census, and fails when the committed reports drift from regenerated output.

## Preservation pilot sample

Regenerate the 100-source preservation pilot sample (issue #704, epic #696) from the canonical CSVs and the stewardship census:

```bash
npm run sample:preservation
```

The command writes `preservation-sample.json`, `preservation-sample.md`, and `preservation-sample.sources.json`. The JSON contract is `preservation-sample/1.0.0`, and output carries no wall-clock timestamp: the same seed against unchanged inputs reproduces byte-identical output, which is the property `tests/preservation-sample.test.js` checks directly. Pass `--seed <value>` for a different reproducible sample, or `--sample-size <n>` to change the target count from the default 100.

Hand `preservation-sample.sources.json` to whoever runs the blind pilot capture pass — it carries only `id`, `objectType`, and `url` for each source, plus the schema, provenance, and credential policy, with no stratum, reason, or expected-outcome field. `preservation-sample.json` and `preservation-sample.md` carry the full curator/reviewer view (`selection`, with the stratum and reason behind every pick) and must never be handed to the worker.

The sample is stratified across curated and social platforms (PressThink long-form writing, newspaper clippings, Tumblr, threads, Twitter/X, Bluesky, Mastodon), URL outcome (missing, a documented redirector host, a documented capture-difficult host, or an otherwise live-looking URL), verified/unverified status, presence or absence of raw text and extracted-graph links, a few notable (heavily cross-referenced or single-point-of-failure) sources, and page shape (PDF, media, dynamic social timeline, static HTML) — plus a seeded uniform-random slice of at least 10% of the sample to catch whatever the named strata miss. `data/preservation-sample.json`'s `quotas` array records each stratum's target, actual selection, and shortfall.

The manifest carries two parallel arrays, same IDs and order. `sources` (`id`, `objectType`, `url`) is the blind view meant for whoever runs the pilot capture pass — it carries no hint about why a source was picked. `selection` adds `stratum`, `group`, `reason`, and the audit fields behind the pick (platform, URL status, verified, raw-text/graph-link presence, host); it is for curator and reviewer eyes only and must never be handed to the blind worker.

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
