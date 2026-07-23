# Winer method demonstration

A small, self-contained demonstration of the archive's curation method applied
to a different subject: 11 public writings by software pioneer and blogger Dave
Winer. It shows how the same approach — curated records, verified sources,
concept pages, and an editorial reading trail — works on a corpus other than
Jay Rosen's. View it on the live site under `features/winer-method/`.

This standalone, read-only microsite applies a small part of the Rosen Archive
method to a deliberately bounded public-source corpus. It is independent and
unendorsed: Dave Winer did not commission, review, or endorse it.

The page has no build step and no runtime connection to the Rosen archive data
files, SQLite service, or scraper. Public sources were retrieved and normalized
offline during curation. `ingestion-log.json` records each source locator and
date basis. `retrieval-evidence.json` retains immutable SHA-256 digests and byte
counts for the responses actually retrieved, final retrieval URLs, supervised
source-title/date/creator observations, explicit field mappings, and a digest of
each normalized record. `capture-ingestion-evidence.mjs` can refresh that
artifact after a curator rechecks the sources or verify that the frozen records
still match it without touching the network. Scripting News pages use a recorded
HTTP transport fallback because their HTTPS endpoint reset these offline capture
requests; the canonical record URLs remain HTTPS.

`data.js` is the frozen 11-record source of truth. It keeps each primary
`sourceTitle` separate from the curator-authored `title`. The offline
`build-data-artifacts.mjs` script produces both `source-manifest.json` and the
feature-local `demo.sqlite` projection from those records. The database is
queried through four allowlisted statements in `script.js`; visitors never
submit SQL. The JavaScript corpus is also the rendering fallback if
WebAssembly is unavailable. URL state remains shareable in either mode.

The authored trail is a five-stop editorial reading; it does not pretend that
all 11 records are equally important narrative beats. The complete corpus
remains available through Source records and four allowlisted query presets.
Six bounded concept pages and four curator findings link every interpretation
back to named evidence records. `source-manifest.json` is the downloadable,
machine-readable list of canonical sources and verification notes.

Local preview:

```text
http://127.0.0.1:8000/features/winer-method/
```

Supported query keys are `view`, `preset`, `record`, and `concept`. Record and
concept identifiers are allowlisted and only survive in their corresponding
views. Unknown values and cross-view state are discarded. There is
intentionally no free-form query or SQL parameter.

Verify the retained retrieval and normalized-record evidence without network
access:

```text
node features/winer-method/capture-ingestion-evidence.mjs --verify
```

Verify that the downloadable manifest and SQLite database still reproduce
exactly from the frozen JavaScript records:

```text
node features/winer-method/build-data-artifacts.mjs --verify
```

Refreshing the artifact performs public-source network requests and should only
be done as an explicit curator-supervised step:

```text
node features/winer-method/capture-ingestion-evidence.mjs
```
