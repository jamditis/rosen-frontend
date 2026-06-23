---
type: system
title: Public archive wiki feature
description: The in-app read-only #wiki route for community-facing concept/entity/topic pages, distinct from this repo-maintenance OKF bundle.
source: [docs/plans/2026-06-21-community-wiki-spec.md, data/wiki-seed.json, frontend/components/WikiPage.js, frontend/services/wikiService.js, tests/wiki-service.test.js, tests/wiki-ui-structure.test.js]
verified: 2026-06-23
tags: [wiki, frontend, community, seed-data]
timestamp: 2026-06-23
---

# Public archive wiki feature

The public archive wiki is the in-app `#wiki` route. It is separate from this repo's `wiki/` OKF bundle:

- `wiki/` is maintainer/agent project knowledge.
- `#wiki` is a public reader feature for archive concepts, entities, topics, and record context.

The public app should not link to repo-only markdown files; `tests/wiki-ui-structure.test.js` guards against linking to `docs/plans/`.

## Current state

Phase 1 is read-only:

- Seed data lives in `data/wiki-seed.json` (`schemaVersion: 1`, `status: seed`, generated 2026-06-21).
- The seed currently has four pages: `concept/public-journalism`, `entity/jay-rosen`, `concept/press-public-relationship`, and `concept/audience-relationship`.
- `frontend/services/wikiService.js` validates slugs, filters/searches pages, normalizes data, rejects unsafe reference URLs, and parses nested `#wiki/...` hashes.
- `frontend/components/WikiPage.js` renders the landing page, search/filter controls, detail pages, missing-page state, page facts, aliases, references, and related-page chips.
- Cold `#wiki` deep links intentionally do not fetch `archive-core.json`.

## Route contract

- `#wiki` — wiki index.
- `#wiki/concept/public-journalism` — detail page by stable slug.
- Malformed slugs stay on the wiki route and render a not-found state.
- `viewState.js` preserves nested wiki slugs in `routeParams.wikiSlug` so share links do not collapse to the index.

## Data contract

Page kinds are `concept`, `entity`, and `topic`. Moderation states are `seed`, `draft`, `pending`, `approved`, and `locked`. Slugs must match:

```text
^(concept|entity|topic)/[a-z0-9]+(?:-[a-z0-9]+)*$
```

Every seed page needs a title, summary, body block, contributor, last-updated date, revision count, moderation state, and safe public references if references are present. Related concept/entity slugs must point to existing seed pages.

## UX guardrails

- Avoid a global graph as the default wiki view. If graph navigation is added, open from the current page with one hop visible and a two-hop expansion. The global graph should be an explicit, filterable view.
- Do not render labels across a whole graph at once. Gate labels by zoom level and node degree.
- Show a freshness badge on every public wiki page and result card. For seed pages, derive it from `lastUpdated` and references. For OKF-backed views, derive it from `verified` and `source`.

## Future gates

Public editing is intentionally deferred. Before edits open, the system needs append-only revisions, authenticated writes, server-side role checks, source requirements, reports, locks, moderator queues, diff/revert preview, audit logs, rate limits, and stored-XSS regression tests. The phase plan lives in [docs/plans/2026-06-21-community-wiki-spec.md](../../docs/plans/2026-06-21-community-wiki-spec.md).
