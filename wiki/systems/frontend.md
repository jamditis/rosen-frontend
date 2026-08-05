---
type: system
title: Front end (zero-build static site)
description: React-via-CDN, HTM, and sql.js static site with hash routing and a service worker; no bundler, deployed as files.
source: [CLAUDE.md, docs/narrative/architecture.md, index.html]
verified: 2026-06-22
tags: [frontend, static-site, architecture]
timestamp: 2026-06-22
---

# Front end (zero-build static site)

A zero-build static site — no npm/Webpack/Vite for production. `index.html` loads an import map pointing React 18, HTM, Lucide, and sql.js to the `esm.sh` CDN; the app entry is `frontend/index.js`. Components use HTM's `html` tagged template, not JSX. Every `.js` import carries a `?v=` query for cache busting. Current version: **v3.4.5**.

- **Routing:** hash-based SPA ([Archive](../data/corpus.md), Folders, Entities, Dissertation, About, Analytics); `?record=ID` opens a record modal on any route.
- **Data loading:** split files for performance with a combined fallback — see [data/corpus.md](../data/corpus.md). Core data is cached in IndexedDB (it exceeds the localStorage cap).
- **Service worker:** `frontend/sw.js` serves static JS and CSS cache-first under exact versioned request URLs. Releases update both the `?v=` markers and `CACHE_VERSION` so old module requests cannot match and the old cache namespace is removed.

Deeper detail: [docs/narrative/architecture.md](../../docs/narrative/architecture.md). Vocabulary: [CONTEXT.md](../../CONTEXT.md). The version bump is a release-time step, not per-PR.
