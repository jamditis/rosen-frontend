# Jay Rosen's Internet Archive — knowledge bundle

This `wiki/` directory is an [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) (OKF v0.1) bundle: a graph of one-concept-per-file markdown notes that an agent (or a person) can read to rebuild context on the project quickly.

## How to use it

1. Start at [`index.md`](index.md) for the map.
2. Each subdirectory has its own `index.md` listing its concepts.
3. Concept files carry YAML frontmatter (`type`, `title`, `description`, `source`, `verified`, `timestamp`) and link to each other and into the repo's [`docs/`](../docs/) with ordinary relative links.
4. [`log.md`](log.md) records changes to the bundle, newest first.

## What it is and isn't

- **It is** the navigable index layer: verified facts, plus pointers into the fuller material in [`docs/`](../docs/), [`CONTEXT.md`](../CONTEXT.md), and [`CLAUDE.md`](../CLAUDE.md).
- **It is not** the source of truth for code or data. The code is the front end and backend; the corpus is in [`data/`](../data/). When this bundle and the code disagree, the code wins — fix the bundle.

## Conventions

- Use the project's vocabulary from [`CONTEXT.md`](../CONTEXT.md) exactly: Archive, Record, Entity, Entity Index, Facet, Era, Categories, Concepts, Loader, Curator.
- Every concept file states where its facts came from (`source`) and whether they were checked against live state (`verified`).
- Contingent facts stay contingent — flag what is decided versus pending.
- Secrets, credentials, and host logins never go in this bundle.
