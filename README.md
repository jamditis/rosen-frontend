# Jay Rosen's Internet Archive

A public archive of the works, critiques, and teachings of Jay Rosen — press critic, professor of journalism at NYU since 1986, and author of the PressThink blog. The collection spans four decades of journalism criticism, media theory, and writing about public life, from his 1986 doctoral dissertation to his present-day essays and social media threads.

**Explore the archive:** https://pressthink.org/j/rosen-archive/

This public repository holds the website source, archive data, and tools used to build and maintain the collection. Hosting, connected accounts, and preservation copies held elsewhere are maintained separately. You can browse the code, download the data, run the site on your own computer, or read about how it was put together.

## What's in the archive

Counts checked against the repository data on **November 6, 2026**:

- **27,059 published records** — 1,220 curated records, 25,829 published social source records, 9 generated social thread containers, and the dissertation
- **7,481 named entities** — people, organizations, and concepts connected to records across the collection
- **The 1986 dissertation** — *The Impossible Press: American Journalism and the Decline of Public Life*, written under Neil Postman and released publicly in December 2025

Records carry theme, era, and publication information, with coverage varying by field and source. Most curated records are also cross-linked to the people, organizations, and ideas they mention; entity extraction is still catching up on some records, and the social media posts are largely not entity-linked yet. The [stewardship census](data/stewardship-census.md) distinguishes source rows, published records, generated threads, and missing fields.

## Ways to explore

On the live site:

- **[Start here](https://pressthink.org/j/rosen-archive/#start)** — a guided introduction for first-time visitors
- **The archive browser** — search records and narrow them by thematic category, era or year, and content type. The separate [data dashboard](https://pressthink.org/j/rosen-archive/tools/active/dataviz/dataviz.html) also offers publication filters and research exports.
- **[Archive desktop](https://pressthink.org/j/rosen-archive/#desktop)** — an optional alternate way to browse the archive, folders, people and ideas, and research tools. Its archive and folder views include an opt-in “Search by meaning” control alongside regular search.
- **[Entities](https://pressthink.org/j/rosen-archive/#entities)** — browse the people, organizations, and concepts that appear across the collection
- **[The dissertation](https://pressthink.org/j/rosen-archive/dissertation/)** — a full-text reader, a foreword, an interactive mind map, and a film analysis of *Network* (1976)
- **[Analytics](https://pressthink.org/j/rosen-archive/#analytics)** — statistics about the collection
- **[FAQ](https://pressthink.org/j/rosen-archive/faq/)** — common questions about the archive and the dissertation
- **[Ways to participate](https://pressthink.org/j/rosen-archive/features/participate/)** — how to suggest records, report problems, or use the data

### Site tools for AI agents

The main archive registers four read-only WebMCP site tools in supporting
browsers. They list accepted archive facets, search public records, read one
record, and find its related entities. The tools use the same public data and
search logic as the visible archive. They do not change page state, archive
records, or source files. Browsers without WebMCP support use the site normally.

## Open data

The archive's metadata and derived data can be reused under CC BY 4.0 with attribution. Public access does not remove copyright restrictions on the writings, images, or other source material. See [`data/README.md`](data/README.md) for the full data guide, including:

- Generated JSON files the site reads (record cards, full details, entity graph)
- Source CSV files with every record, post, entity, and relationship
- A human-readable data dictionary in [`data/SCHEMA.md`](data/SCHEMA.md)
- RSS and OPML feeds under `data/feeds/`

Licensing: the code in this repository is MIT licensed (see [`LICENSE`](LICENSE)); the metadata and derived data (entities, relationships) are licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), so reuse requires attribution; and the archived writings themselves remain under their original copyright — the dissertation is © 1986 Jay Rosen.

## Running the site locally

The site is a zero-build static site — no bundler, no compile step, no server-side database. If you have Python installed:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. That's it. (`npm run preview` does the same thing with Node.) You only need `npm install` if you want to regenerate the data files or run the tests.

## How the site works

- `index.html` is the entry point. It loads React, HTM, and other libraries from the `esm.sh` CDN via an import map — there is no build step.
- `frontend/` contains the React app. Components use HTM tagged templates (`` html`...` ``) instead of JSX.
- `frontend/desktop/` contains the optional desktop shell and its archive, folder, and research views.
- `data/` contains the archive data as JSON files, generated from CSV source files.
- `dissertation/` contains the dissertation reader, foreword, and network-effect pages, each a standalone page in its own subdirectory. The archive-wide FAQ lives at `faq/`.
- `backend/` contains the Python pipeline used to scrape, analyze, and archive new content. You never need it just to browse or serve the site.
- `frontend/dist/tailwind.css` is pre-built Tailwind CSS. No build needed unless you change styles.

### Key directories

```
index.html                    Entry point
frontend/                     React application
  components/                 UI components
  services/                   Data loading, routing, SQLite
  dist/tailwind.css           Pre-built styles
data/                         CSV sources + generated JSON (see data/README.md)
dissertation/                 Dissertation reader, foreword, and network-effect pages
faq/                          Archive and dissertation FAQ
features/                     Standalone feature pages
backend/                      Python data pipeline (see backend/README.md)
tools/active/                 Data explorer and data visualization tools
tests/                        Frontend and data test suite
docs/                         Project documentation (see docs/README.md)
archived/                     Legacy code kept for reference only
.github/workflows/            Continuous integration
```

## Updating the archive data

The site reads JSON files generated from four main CSV source files and an optional file of curator-written summary overrides:

| Source file | What it contains |
|-------------|-----------------|
| `data/archive_records-public.csv` | Curated archive records |
| `data/social_posts.csv` | Twitter, Bluesky, and Mastodon posts |
| `data/extracted_entities.csv` | Named entities |
| `data/extracted_relationships.csv` | Entity relationships |
| `data/authored-excerpts.csv` | Optional summary overrides keyed by record ID; nonblank entries replace the record summary |

To regenerate the JSON after editing a CSV:

```bash
npm install          # first time only
node data/export-archive-data.js
```

Submit new articles through the queued submission workflow in [`ADDING-RECORDS.md`](ADDING-RECORDS.md); it reserves IDs and prepares the tested release. The guide's manual CSV steps are for corrections to existing records, with their IDs unchanged. Curator-written summary overrides live in `data/authored-excerpts.csv`; preserve that file with the source data.

## Continuous stewardship

New public work now appears mainly on Bluesky. The daily Bluesky workflow finds Jay Rosen's public posts, checks available thread context, and applies defined admission rules before the tested release and publication steps. This automated admission is not a separate human approval of every record. Human review remains an editorial responsibility; the general submission path can publish records marked `needs_review`. If a Bluesky release reaches `main` before deployment completes, the next run validates and deploys that exact commit before it settles pending source candidates.

Read the [current daily Bluesky operations guide](docs/operations/bluesky-stewardship.md) for implemented behavior and publication evidence. The [Bluesky-first stewardship design map](docs/bluesky-stewardship-pipeline.md) also describes longer-term preservation and review work; it is not a statement that every proposed capability is running.

Source discovery does not publish records. The repository data, tests, and deployment workflow remain the publication gate.

## Running tests

```bash
npm test                   # all tests
npm run test:data          # data integrity + CSV quality
npm run test:pipeline      # data pipeline + thread detection
npm run test:frontend      # version consistency + frontend structure
```

Tests use the Node.js built-in test runner.

## Deploying to production

The site is hosted at `pressthink.org/j/rosen-archive/` and deployed through certificate-verified explicit FTPS. The full deploy manifest — what to upload, what to exclude, and the cache-busting steps — lives in [`DEPLOYMENT.md`](DEPLOYMENT.md). The short version:

1. Edit source files as needed.
2. If data changed: `node data/export-archive-data.js`. Refresh the required search-by-meaning vectors as described in [`data/README.md`](data/README.md#search-by-meaning-vectors), and complete the data and release checks in the deployment guide.
3. Run `npm run bump-version -- X.X.X` to stamp the new version across `index.html`, `version.json`, versioned JS/CSS references in `frontend/`, `faq/`, `features/`, and `dissertation/`, and the service worker's `CACHE_VERSION`. The service worker uses exact versioned request URLs and removes old cache namespaces when a release activates, so both version surfaces must move together.
4. Upload dependencies first, then standalone pages and record shells. Upload root `index.html`, `frontend/sw.js`, root `sw.js`, and `version.json` last, preserving the order from `backend/scripts/deploy_full_site.py`.

**Do not upload:** CSVs, backup files, screenshots, or the `backend/`, `tests/`, `docs/`, `archived/`, `.github/`, `.claude/`, or `node_modules/` trees. See `DEPLOYMENT.md` for the full exclusion list.

## Notes for contributors

- **No build step.** The frontend runs directly from source files via ES modules. Never add npm/webpack/vite to the production frontend.
- **Version all imports.** Every `.js` import uses a `?v=X.X.X` query parameter for cache busting. Check `index.html` for the current version.
- **HTM, not JSX.** Components use `` html`...` `` tagged templates imported from the local `html.js`.
- **Dissertation content is verified.** Quotes in `frontend/components/dissertationData.js` are verified citations — don't modify them.
- **Backend uses Poetry.** Run backend commands with `poetry run python ...` from the `backend/` directory.
- **Path auto-detection.** The app detects local vs production paths automatically in `App.js` based on hostname.
- **Sentence case everywhere.** UI text, comments, and documentation use sentence case, not title case.

## Learn more

- [`docs/README.md`](docs/README.md) — a map of all project documentation
- [`CLAUDE.md`](CLAUDE.md) — comprehensive technical reference: architecture, design system, data schema, and known issues
- [`CONTEXT.md`](CONTEXT.md) — the project's shared vocabulary (what "Record," "Entity," and "Facet" mean here)
- The [FAQ on the live site](https://pressthink.org/j/rosen-archive/faq/) — questions about the archive itself

## Contact

The archive is curated and maintained by Joe Amditis. Found a broken link, a missing work, or a data error? [Open an issue](https://github.com/jamditis/rosen-frontend/issues) or use the [ways to participate](https://pressthink.org/j/rosen-archive/features/participate/) page.

Record and entity counts above describe the repository snapshot checked on November 6, 2026. They change as the collection grows and do not, by themselves, verify which revision is live on PressThink.
