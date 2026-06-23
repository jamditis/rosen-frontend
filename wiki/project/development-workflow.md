---
type: concept
title: Development workflow
description: The repo workflow for choosing issues, changing the zero-build frontend, regenerating data, and verifying before a PR.
source: [AGENTS.md, CLAUDE.md, README.md, package.json, .github/PULL_REQUEST_TEMPLATE.md]
verified: 2026-06-23
tags: [workflow, development, issues, pr]
timestamp: 2026-06-23
---

# Development workflow

Work from the repo root (`~/projects/rosen-frontend`). The production front end is a zero-build static site: change source files directly, keep HTM imports versioned, and do not introduce a bundler for production. See [systems/frontend.md](../systems/frontend.md) and [systems/cache-and-versioning.md](../systems/cache-and-versioning.md).

## Issue selection

Some GitHub issues are for human visibility only. Never select, work on, open a PR against, or change the state of a `do-not-automate` issue. Enumerate candidate work with:

```bash
gh issue list --search 'is:open -label:"do-not-automate"'
```

If you open a `do-not-automate` issue by accident, stop and move on.

## Change shape

- Frontend components use HTM tagged templates, not JSX.
- Shared app code lives under `frontend/`; standalone public pages live under `dissertation/` or `features/`.
- Source CSVs live in `data/`; generated JSON must be regenerated after source-data edits.
- Backend pipeline work lives under `backend/` and uses Poetry.
- `archived/` is reference-only unless the task explicitly asks for it.

## Verification flow

Pick the narrow command first, then run the broader command for the touched surface:

- Frontend or route change: `npm run test:frontend`
- Wiki or OKF change: `npm run test:okf`
- Data/export change: `npm run test:data` and `npm run test:data:extraction-coverage`
- Pipeline change: `npm run test:pipeline`
- Cross-cutting change: `npm test`
- Visual/accessibility-sensitive change: `npm run preview:audit`
- Backend change: `cd backend && poetry run pytest -v --tb=short`

Bug fixes should start with a failing test that proves the bug, then the fix, then the same test passing.

## Release-time sweep

If deployable source files changed, do the cache/version sweep once at release time: `index.html`, `version.json`, `frontend/sw.js`, and versioned imports. The service worker ignores query strings for static JS, so a `?v=` change without a `CACHE_VERSION` change is not enough. See [systems/cache-and-versioning.md](../systems/cache-and-versioning.md).
