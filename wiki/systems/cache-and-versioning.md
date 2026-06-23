---
type: system
title: Cache and versioning
description: The version knobs and browser caches that must move together so returning visitors receive fresh archive code and data.
source: [README.md, DEPLOYMENT.md, version.json, frontend/sw.js, frontend/services/archiveService.js, frontend/services/cacheConfig.js, tests/version-consistency.test.js]
verified: 2026-06-23
tags: [cache, versioning, service-worker, deploy]
timestamp: 2026-06-23
---

# Cache and versioning

The archive has several cache layers. A release is safe only when the version knobs that address those layers move together.

## Current knobs

- `version.json` currently reports `version: 3.4.6`, `updated: 2026-06-23`, and `cache_version: v9`.
- `index.html` versioned imports use `?v=3.4.6`.
- `frontend/sw.js` has its own `CACHE_VERSION`.
- `frontend/services/cacheConfig.js` defines the app data-cache version used by the archive Loader and HTTP cached loader paths.

## The service-worker trap

The service worker serves static JavaScript cache-first and uses `ignoreSearch: true`. That means the browser can keep serving an old `frontend/index.js` even when `index.html` points to `frontend/index.js?v=new`. The service-worker `CACHE_VERSION` must change to drop the old static cache.

## Data caches

- `archive-core.json` is large enough to exceed Web Storage on many browsers, so the core-data cache uses IndexedDB first and Web Storage as a fallback.
- Details, entities, analytics, and other data use shared cache keys from `cacheConfig.js`.
- `archiveService.js` checks `version.json` and clears caches when the deploy version changes. Cold analytics and wiki routes have special behavior: analytics checks its own data freshness; wiki routes intentionally avoid loading archive core data.

## Release checklist

When deployable code or data changes:

1. Regenerate JSON with `node data/export-archive-data.js` if CSVs changed.
2. Keep `index.html`, `version.json`, every relevant `?v=` import, and `frontend/sw.js` `CACHE_VERSION` in lockstep.
3. Sweep standalone pages by hand: `dissertation/`, `dissertation-launch/`, `features/`, and `tools/` are not all covered by the main version test.
4. Run `npm run test:frontend` at minimum; run `npm test` for wider changes.
5. Deploy only the files listed in [DEPLOYMENT.md](../../DEPLOYMENT.md), not source CSVs or internal docs.

More deployment context: [deploy-and-hosting.md](deploy-and-hosting.md).
