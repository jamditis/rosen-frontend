# Launch-day FAQ and talking points

Short answers Joe can hand to Jay, post, or read from when someone asks how the
archive works. Written for the questions that actually came up on the Rosen
walkthrough call (2026-06-24, ~00:43 to 00:48), where Jay asked for material
ready to describe the project to reviewers who would have questions (Jarvis, a
reader in Korea, possibly Dave Winer). Grounded in the repo as it stands, not in
how it was pitched: where the pitch and the build differ, this doc follows the
build and flags the gap for Joe.

Live site: https://pressthink.org/j/rosen-archive/

## The one-sentence version

It is a public, searchable archive of four decades of Jay Rosen's journalism
criticism: about 26,600 records in the shipped data — roughly 950 articles and
essays plus about 25,700 archived social posts. An extracted index of about 8,150
named people, organizations, and concepts cross-links the records that have
extracted relationships (about 1,400 so far), not the whole corpus. It runs as a
static site with no server-side code and nothing calling out to an AI model when
you use it.

Accuracy note for Joe: these figures are computed from the shipped data, not
guessed — `archive-core.json` holds 26,616 records (951 non-social plus 25,665
social), `archive-entities.json` holds 8,152 entities, and
`data/extracted_relationships.csv` holds about 12,560 relationship rows. The
README still says 5,036 entities and 4,666 relationships — the older
curated-record figures from before the social-post extraction grew the data — so
update `README.md` to match, or the doc set stays inconsistent.

## How the archive is built, and why it does not depend on AI at runtime

The site is static files: HTML, JavaScript, and pre-built JSON data, served
straight from the PressThink host. When you open a page, the browser loads the
JSON and renders it. There is no application server, no database server, and no
API to an AI model in that path, so nothing you do on the site sends a request to
a language model.

AI is used earlier, offline, as a research tool: extracting candidate entities
and relationships from the source material during data preparation. That
extraction goes through a documented review pipeline before it ships (see
`docs/ENTITY_EXTRACTION_PIPELINE.md` and `data/verification-log.md`). By the time
a record reaches the site it is plain data in a JSON file.

Accuracy note for Joe: `data/verification-log.md` signs off on the curated set
(5,036 entities, 4,666 relationships) and notes a second-pass diff over the
larger social-post extraction is still queued — so the full 8,150-entity set is
reviewed-in-progress, not fully signed off. Don't tell Jay "every single entity
is human-verified" until that diff closes. The runtime is dumb on purpose, and that is a
feature: it is cheap to host, fast to load, and it needs no model and no API key
to keep working. One caveat: the core frontend libraries (React, HTM,
Lucide) load from a public CDN (`esm.sh`) through an import map in `index.html`,
so a first visit does depend on that CDN being reachable. (The SQLite query
engine's WASM binary is vendored in the repo, but its loader script still loads
from cdnjs on first use — see the link-rot section below.) The archive's own data
is self-hosted next to the site, which is the part that matters for long-term
survival.

## How records get added

Records are curated, not scraped on a timer. A record is a row in a source CSV
(`data/archive_records-public.csv` and the social-post CSVs); `node
data/export-archive-data.js` regenerates the split JSON files the site reads, and
those are deployed to the PressThink host over FTP. `ADDING-RECORDS.md` is
the full procedure. A lighter-weight submission path is designed so a record can
be proposed without hand-editing the CSV — a Flask submission server (Pillar 3)
and a GitHub Action flow using `submit-record.yml` and `sweep-stuck-rows.yml`
(Pillar 3a) — but it is not stood up yet: the Pillar 3a wiring exists in code and
was never activated. `automation/PILLAR3A-STATUS.md` is the current status and
`docs/setup/pillar-3a-runbook.md` is the install procedure. Until it is live,
records are added the manual way above.

Accuracy note for Joe: the source issue described this as a "weekly scrape of the
PressThink RSS feed," and that is not what the code does today. The archive
*emits* its own RSS/OPML feed of its records (`data/lib/rss-generator.js`), but
nothing in the repo pulls new posts from PressThink's feed on a schedule. Safer to
say "records are curated from PressThink and other sources and added through a
reviewed pipeline" than to promise an automated weekly scrape that is not wired
up. If Jay wants the auto-ingest story to be true by launch, that is a real task,
not a description.

## What "SQLite in the browser" means, and why it is fast and link-rot resistant

Two data paths, and the distinction is worth getting right because both come up:

- **Everyday browsing is flat JSON.** Search, filter, and record cards read
  pre-built JSON files (`archive-core.json` loads on page load; details are
  prefetched about a second later; entities load on demand). No query engine, no
  database — just data the browser already has. That is why it feels instant.
  (The combined `archive-data.json` is only a fallback and the source the query
  engine below builds from — not part of normal browsing.)
- **Custom queries use SQLite compiled to WebAssembly.** The analytics and query
  surface can load `sql.js` (SQLite built to WASM) and run real SQL *in the
  browser*, only when someone actually writes a custom query. It does not download
  a separate database file: `initSqlite()` reads the archive's own
  `data/archive-data.json` and builds the SQLite database in memory from it, so the
  SQL layer is the same data seen through a query engine, not a second copy. The
  dashboards above it render from pre-built aggregates and never load the engine at
  all, so that work is lazy.

Why it is link-rot resistant: the data lives as files on the archive's own host
next to the site that reads them, so there is no third-party API or service that
can disappear and take the everyday archive down with it. One exception on the
optional custom-query surface: the SQLite database is built in the browser from
the local JSON and the WASM binary is self-hosted
(`frontend/vendor/sql-wasm-1.10.3.wasm`), but the `sql.js` *loader* script still
loads from cdnjs on the first custom query (`frontend/services/sqliteService.js`,
pinned with subresource integrity). So all the archive *data* is self-hosted, and
everyday browsing calls no third-party API. The app *code* is not fully CDN-free,
though: the core libraries (React, HTM, Lucide, idb-keyval, MiniSearch) load from
`esm.sh` through the import map in `index.html`, and that `sql.js` loader loads
from cdnjs. Vendoring those libraries and the loader would close the remaining
gaps. To preserve or fork the whole thing, you copy the files (and, for full
offline use, those CDN-loaded scripts).

## How the entity and relationship mapping works

It is relational, not just loose co-mention. The offline pipeline extracts about
8,150 named entities — people, organizations, and concepts — and typed
relationships between them (a subject, a relationship type, and an object) into
`data/extracted_relationships.csv`.

An important caveat about what the browser actually receives: the export step
(`data/export-archive-data.js`) collapses those typed relationships into a plain
entity-to-record association map, and the in-browser SQLite ships a single
`record_entities(record_id, entity_id)` table — the relationship *type* is not
carried into the shipped data. So the Explorer answers "which entities share
records with X" — who and what co-occur across the same records — which is
stronger than a loose full-text co-mention, but it is not a typed "X is-the-editor-of
Y" query in the browser. The typed relationship types live in the source CSV and
the offline pipeline; surfacing them in the Explorer would mean shipping the
relationship table too, which is a real feature, not something the site does
today. The extraction and merge steps are in `docs/ENTITY_EXTRACTION_PIPELINE.md`.

## How someone can contribute

The project is open source. Clone the repo, run it locally with a plain static
server, and open a pull request:

```bash
python3 -m http.server 8000   # then open http://localhost:8000 — no build step
```

No `npm install` is needed just to serve the site; it is only required when you
regenerate the JSON from the source CSVs. Adding or correcting a record means
editing a CSV, regenerating the JSON, and opening a PR — `ADDING-RECORDS.md`
walks through it. The in-progress submission path (see the record-added question
above) is the lighter-weight way to propose a single record without touching the
CSV by hand.

## Quick talking points (for reading aloud)

- It is a public archive of Jay Rosen's work: about 26,600 records in the shipped
  data — roughly 950 articles and essays plus about 25,700 archived social posts —
  with an extracted index of people, organizations, and concepts over the records
  that have relationships (about 1,400 so far).
- It is a static site. No server, no database server, nothing calling an AI model
  while you use it — so it is fast, cheap to keep online, and hard to break.
- AI helped build the index offline, through a documented review pipeline. The
  curated set is human-reviewed; the second-pass review of the larger social-post
  extraction is still in progress. The running site is just the resulting data.
- The everyday archive is flat JSON files. A SQLite database compiled to
  WebAssembly powers optional custom queries in the browser, loaded only when you
  ask for one.
- The entity map links entities to the records they appear in, so the Explorer
  answers "which entities share records with X" — stronger than loose co-mention.
  The typed relationship types live in the source data, not the in-browser query
  layer.
- It is open source. Clone it, serve it with one command, send a pull request.
- If someone asks about automated ingest: it is curated through a reviewed
  pipeline today, not an automatic weekly scrape.
