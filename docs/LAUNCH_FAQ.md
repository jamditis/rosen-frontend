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
criticism: 1,030 curated records and tens of thousands of social posts,
cross-indexed by about 8,150 named people, organizations, and concepts and the
typed relationships between them. It runs as a static site with no server-side
code and nothing calling out to an AI model when you use it.

Accuracy note for Joe: the archive's analytics page shows about 8,150 entities
(computed live from the shipped data), so that is the reader-facing figure this
FAQ uses. The README still says 5,036 entities and 4,666 relationships — the older
curated-record figures from before the social-post extraction grew the data — so
update `README.md` to match, or the doc set stays inconsistent.

## How the archive is built, and why it does not depend on AI at runtime

The site is static files: HTML, JavaScript, and pre-built JSON data, served
straight from the PressThink host. When you open a page, the browser loads the
JSON and renders it. There is no application server, no database server, and no
API to an AI model in that path, so nothing you do on the site sends a request to
a language model.

AI is used earlier, offline, as a research tool: extracting candidate entities
and relationships from the source material during data preparation. Every one of
those passes through review before it ships (see `docs/ENTITY_EXTRACTION_PIPELINE.md`
and the verification log in `data/`). By the time a record reaches the site it is
plain reviewed data in a JSON file. The runtime is dumb on purpose, and that is a
feature: it is cheap to host, fast to load, and it needs no model and no API key
to keep working. One caveat: the core frontend libraries (React, HTM,
Lucide) load from a public CDN (`esm.sh`) through an import map in `index.html`,
so a first visit does depend on that CDN being reachable. (The SQLite query engine
is the exception — its WASM binary is vendored in the repo, not CDN-loaded.) The
archive's own data is self-hosted next to the site, which is the part that matters
for long-term survival.

## How records get added

Records are curated, not scraped on a timer. A record is a row in a source CSV
(`data/archive_records-public.csv` and the social-post CSVs); `node
data/export-archive-data.js` regenerates the split JSON files the site reads, and
those are deployed to the PressThink host over FTP. `ADDING-RECORDS.md` is
the full procedure. There is also an in-progress submission path so a record can
be proposed and swept in without hand-editing the CSV: a Flask submission server
(Pillar 3) and a separate GitHub Action flow using `submit-record.yml` and
`sweep-stuck-rows.yml` (Pillar 3a). `docs/HANDOFF.md` has the current state of
each.

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
  pre-built JSON files (`archive-core.json` loads on page load; details, entities,
  and the full file load on demand). No query engine, no database — just data the
  browser already has. That is why it feels instant.
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
can disappear and take the archive down with it. The custom-query engine runs
locally — its SQLite database is built in the browser from the JSON, and the WASM
binary is vendored in the repo (`frontend/vendor/sql-wasm-1.10.3.wasm`), so a
query does not phone home either. To preserve or fork the whole thing, you copy
the files.

## How the entity and relationship mapping works

It is relational, not just co-mention. The pipeline pulls out about 8,150 named
entities — people, organizations, and concepts — and the relationships that are
*typed edges* between two specific entities (a subject, a relationship type, and
an object), stored as real relationship rows, not a count of how often two names
appear in the same post. So the Explorer can answer "how is X connected to Y,"
not only "X and Y are mentioned together a lot." The extraction and merge steps
are in `docs/ENTITY_EXTRACTION_PIPELINE.md`; extracted entities and relationships
are reviewed before they ship.

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

- It is a public archive of Jay Rosen's work: ~1,030 curated records plus tens of
  thousands of social posts, cross-indexed by people, organizations, and concepts.
- It is a static site. No server, no database server, nothing calling an AI model
  while you use it — so it is fast, cheap to keep online, and hard to break.
- AI helped build the index offline; every extracted entity and relationship was
  reviewed before it shipped. The running site is just reviewed data.
- The everyday archive is flat JSON files. A SQLite database compiled to
  WebAssembly powers optional custom queries in the browser, loaded only when you
  ask for one.
- The entity map is relational: typed connections between specific entities, not
  just "these two names show up together."
- It is open source. Clone it, serve it with one command, send a pull request.
- If someone asks about automated ingest: it is curated through a reviewed
  pipeline today, not an automatic weekly scrape.
