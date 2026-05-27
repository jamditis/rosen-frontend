# Recall and performance plan — May 2026

**Date:** 2026-05-27
**Author:** Joe Amditis (with research synthesis from three parallel investigation agents)
**Status:** Recommendations; sequencing decisions made, implementation pending

This plan covers three intersecting concerns that came up during the May 2026 work cycle:

1. **Recall** — the archive's "search" is broken in a fundamental way (substring scan over title + 120-char summary preview only); body text is never indexed.
2. **Relational depth** — entity-overlap matches are strong; semantic ("similar in theme") bridges are missing.
3. **Performance** — the cold-start budget is being burned on a prefetch nobody reads, the service worker has three bugs that explain prior stale-deploy pain, and `JSON.parse(13 MB)` runs on every visit.

Three research agents investigated independently. Their outputs converged on the same architectural shape (static files + Web Worker + IndexedDB), corrected one material misunderstanding about corpus size, and surfaced a fourth concern (telemetry to prove the wins).

---

## 1. Corpus reality

The first thing the investigation surfaced was a corpus-size mismatch in everyone's working model:

- `data/archive_records-public.csv` is **1,030 rows** (800 RECORD + 137 TUMBLR + 83 CLIP + 10 THREAD), but this is the **curatorial source**, not the shipped corpus.
- After `data/export-archive-data.js` runs, the JSONs ship **26,565 records** to the browser: 947 verified articles + 25,617 social posts + 1 dissertation.
- `archive-core.json` is **12.78 MB raw / 1.61 MB gzipped / 1.10 MB brotli**.
- `archive-details.json` is **12.89 MB raw / 2.81 MB gz / 2.01 MB br**.
- `archive-data.json` (the 28 MB combined fallback) is prefetched on every cold visit but never consumed in production.
- `raw_text` (11.2 MB across 978 articles, median 9,351 chars, max 95 KB) is never shipped — it lives only at curator-rebuild time.

The 26,565 number rather than 1,030 is the one that drives shard / index / vector decisions. The 11.2 MB of un-shipped `raw_text` is the largest unrealized recall asset.

---

## 2. Search today

`frontend/App.js:161-204` implements "search" as:

```js
const matchesSearch = !filters.search ||
  record.title.toLowerCase().includes(searchLower) ||
  (record.summaryPreview && record.summaryPreview.toLowerCase().includes(searchLower)) ||
  (record.categories && record.categories.some(c => c.toLowerCase().includes(searchLower)));
```

No tokenization. No ranking. `summaryPreview` is truncated at 120 chars. **The full summary, concepts, tags, and raw_text are never searched.** A query for a phrase Rosen has written about for thirty years can return nothing because the exact 120-character preview happens not to contain that wording.

sql.js (v1.10.3 via `frontend/services/sqliteService.js`) is loaded only on `#analytics` and the Query Builder. It exposes `searchRecords()` with `LIKE` wildcards, not FTS5. Reaching for FTS5-in-sql.js as the primary search engine would mean shipping a pre-built `.sqlite` file from the curator workflow — a real architectural change.

---

## 3. Service worker bugs (#274)

`frontend/sw.js` has three real bugs that compound on every deploy:

1. **`index.html` is served cache-first.** `isStaticAsset()` includes `.html`, so the SW returns the cached page even after a deploy. The browser never reads the new `index.html`, so the `?v=` cache-bust on imports never fires. The `CACHE_VERSION` constant is the only thing that saves you — and it requires perfect curator discipline to bump.
2. **Install precaches nothing data-side.** `STATIC_ASSETS` lists JS only; `DATA_URLS` is declared but unused. First cold visit always pays network cost for `archive-core.json`.
3. **Silent `cache.put` failures.** Both `cacheFirst` and `networkFirst` call `cache.put(request, response.clone())` without await/catch. Quota errors throw into the void.

These three fixes are independent of every other change in this plan. Tracked in issue #274.

---

## 4. The cold-start prefetch waste

`index.html:52`:

```html
<link rel="prefetch" href="./data/archive-data.json" as="fetch">
```

`archive-data.json` is the **28 MB combined fallback** that the app never consumes in production. Every cold visit downloads it. Fix:

```html
<link rel="preload" href="./data/archive-core.json" as="fetch" crossorigin fetchpriority="high">
<link rel="preconnect" href="https://esm.sh" crossorigin>
```

~25 MB bandwidth saved per cold visit. ~200 ms TTFB improvement on first React import via the preconnect to the CDN. Tracked in issue #283 (cluster A leadoff).

---

## 5. Why `JSON.parse(13 MB)` runs every visit

`frontend/services/archiveService.js` caches the JSON string in `localStorage` / `sessionStorage`. The 12.8 MB raw exceeds the 5 MB localStorage cap, so it falls back to sessionStorage (dies on tab close). Repeat visitors pay the full `JSON.parse(13 MB)` cost — measured 200-500 ms on phones.

Fix: use [idb-keyval](https://github.com/jakearchibald/idb-keyval) 6.x (0.6 KB gz, single-file, ESM via esm.sh) to store the **parsed object** in IndexedDB:

```js
import { get, set } from 'https://esm.sh/idb-keyval@6.2.1';

export const fetchCoreData = async () => {
  const cached = await get('archive-core-' + version);
  if (cached) return cached;  // structured-clone, no JSON.parse
  const data = await fetch(DATA_CONFIG.archive_core).then(r => r.json());
  set('archive-core-' + version, data);
  return data;
};
```

IndexedDB structured-clones the object directly; no string allocation on read. Key by `version.json` version so deploys invalidate naturally. Tracked in issue #275.

---

## 6. Cluster B — real full-text search (#276, #277)

MiniSearch 7.x is the right primary engine for this corpus. Comparison considered:

| Library | Index size (this corpus) | Query latency | Build complexity | Notes |
|---|---|---|---|---|
| **MiniSearch 7.x** | ~3-4 MB raw / ~0.9 MB gz (title+summary), ~9 MB raw / ~2.2 MB gz (with raw_text excerpts) | 3-10 ms over 26K docs | trivial — `new MiniSearch(...).addAll(records)` | Best fit. BM25 + prefix + fuzzy out of the box. |
| Lunr 2.3.9 | ~5 MB / ~1.2 MB gz | 8-20 ms | needs serialization quirk handling | Stale (last release 2020); no prefix by default. |
| Orama 3.x | ~4 MB / ~1.0 MB gz | 2-6 ms | ~30 KB lib | Real contender. Has hybrid vector + BM25 mode (revisit if PR cluster C ships and the embeddings issue would benefit from a unified engine). |
| sql.js + FTS5 | DB file ~6-8 MB / ~2.5 MB gz | 1-5 ms | hardest — pre-build `.sqlite` at curator time | Curator workflow breaks unless build script ships pre-built DB. |
| Pagefind 1.x | sharded chunks | 50-150 ms (network-bound) | requires CLI build step | Designed for per-page HTML; doesn't fit a SPA. |
| Tantivy-WASM | large | fast | very heavy WASM | Overkill at 26K docs. |

The curator workflow stays one command — `data/export-archive-data.js` gains a step that calls `data/build-search-index.mjs` and emits `data/search-index-articles.json` (~400 KB gz, eager) + `data/search-index-social.json` (~1.8 MB gz, lazy). Frontend lazy-loads the article index on first non-empty search, parses via `MiniSearch.loadJSON()`, swaps the `Array.filter` substring scan in `App.js:161` for ranked queries. Tracked in #276.

Two adjacent build-time wins worth bundling with the search PR:

- **Precomputed facet posting lists** at `data/facets.json` (~15 KB gz). Categories × eras × content_types × publications → record-id arrays. Frontend intersects FTS result Set with active filter posting lists via `Set.has` (O(1) per check).
- **Pre-baked `entityToRecords` map** added to `archive-entities.json` (~40 KB gz). Replaces runtime reconstruction by `buildEntityMaps()`.

Both tracked in #277.

---

## 7. Cluster C — semantic recall (#278, #279)

The knowledge graph (5,800 entities + 6,200 relationships) handles "show me everything Rosen wrote about Lippmann" well — `calculateEntityConnectionStrength` in `archiveService.js` is the existing related-records ranker. It fails on two patterns:

- **Untagged-but-thematic.** A piece about objectivity that never name-checks "objectivity" as an entity.
- **Abstractive bridges.** "Epistemic crisis" connects to "view from nowhere" through ideas, not shared entities.

Both are semantic-similarity problems. The fix:

### Model

**BGE-small-en-v1.5** (BAAI, 384-dim, INT8 quantized for storage). Justification:

| Candidate | Dim | MTEB retrieval | ONNX int8 size | Notes |
|---|---|---|---|---|
| MiniLM-L6-v2 | 384 | ~41 | ~23 MB | Older (2021), beaten by every newer 384-dim model. |
| E5-small-v2 | 384 | ~49 | ~33 MB | Requires `query: ` / `passage: ` prefix discipline. |
| **BGE-small-en-v1.5** | **384** | **~51** | **~33 MB** | **Best small-model retrieval in this size class; well-documented in transformers.js.** |
| gte-small | 384 | ~50 | ~33 MB | Acceptable swap; slightly less ecosystem support. |
| BGE-base-en-v1.5 | 768 | ~54 | ~95 MB | 4× storage for ~6% gain. Not worth it. |

### Build pipeline

`data/build-embeddings.mjs` using `@xenova/transformers@2.17` runs BGE-small over `title + summary + raw_text[:3500]` for each of 947 articles. INT8-quantize. Emit:

- `data/archive-embeddings.bin` — ~360 KB binary, format `[magic 8B][count u32][dim u32][per-vec: scale f32 + int8[dim]]`
- `data/archive-embeddings.json` — id index, ~30 KB

Build-time near-duplicate detection: cosine ≥ 0.95 + shared entity → mark `near_dup_of` in sidecar.

### Runtime

`frontend/services/embeddings-worker.js` (~40 lines):
- Fetch binary, dequantize once into `Float32Array`, normalize so cosine becomes a dot product
- `neighbors(recordId, k=5)` — top-K cosine
- Apply ×0.92 temporal penalty for matches within ±2 years (absorb Rosen's 30-year thematic recurrence)
- Drop ids in `near_dup_of` set

Linear cosine over 26K × 384-dim INT8 vectors in a Worker runs ~30-100 ms. No ANN library needed at this scale; hnswlib-wasm and usearch-wasm break even at ~50K+ vectors. Tracked in #278.

### UI

Augment `frontend/components/RecordModal.js` related-records: add a "Similar in theme" `<details>` strand below the existing shared-entity list. Cosine threshold ≥ 0.70. Show 3-5 records max.

### Opt-in semantic search toggle

Add a "Semantic" toggle to the search bar (off by default; off-state advertises "Find by meaning — downloads 33 MB on first use"). When on, lazy-load the BGE model via transformers.js (IndexedDB-cached after first download). Merge with MiniSearch results via Reciprocal Rank Fusion (k=60):

```
score = 1/(60 + lex_rank) + 1/(60 + sem_rank)
```

RRF beats weighted blends because BM25 and cosine aren't on a calibrated scale and there's no labeled-query dataset to tune α against. Surface in the UI with chip badges: `kw` / `sem` / `kw·sem`. Tracked in #279.

---

## 8. Cluster D — observability and polish (#280, #281, #282)

- **#280 Web Vitals telemetry.** ~25 lines in `frontend/index.js` behind a `localStorage.jrda_debug === '1'` flag. `web-vitals 4.x` is 1.5 KB gz. Logs LCP / INP / CLS + custom `data:load` mark to console. No third-party analytics SDK. Ideally lands **before** cluster A so cold-start improvements are measurable.
- **#281 View Transitions API on record-modal open.** ~20 lines. Browser support in 2026: Chrome 111+, Safari 18+, Firefox 130+. Graceful fallback for older browsers. Smooth modal entry, smooth filter-change re-flows.
- **#282 Auto-stamp `?v=` from `version.json` via bump script.** Eliminates the manual cache-bust failure mode that's bitten previous deploys. Existing `tests/version-consistency.test.js` stays as the guardrail.

---

## 9. Sharding — deferred until measured

At 26,565 records the obvious shard axis is **record type** (articles vs social), not era or category. The indexing agent argued for shipping the shard split now. The cheaper view: do clusters A + B + C, measure with #280 telemetry, then shard only if `archive-core.json` cold-load actually pages out memory on a phone.

Trigger to revisit: if either article shard pushes past 3 MB gzipped, or social search becomes a feature users actually use, split the JSONs into `archive-core-articles.json` + `archive-core-social.json`. Until then, premature sharding adds a state-stitching surface that's easy to get wrong.

---

## 10. Shipping order

| Cluster | Issues | When |
|---|---|---|
| A — caching wins | #283, #274, #275 | Ride with the v3.4.0 FTP bundle |
| Telemetry | #280 | Ideally lands with or just before cluster A |
| B — real search | #276, #277 | Independent PRs after v3.4.0 cutover |
| C — semantic | #278, #279 | After cluster B |
| D — polish | #281, #282 | Independent; ride opportunistically |

Cluster A's three changes total ~150 lines across three files and are scoped to changes that are already in the FTP bundle's blast radius (`index.html`, `sw.js`, `archiveService.js`). Bundling them avoids a second FTP cycle for the same site.

Clusters B and C are larger and deserve independent PRs with their own Copilot review surface. Cluster B is the headline recall improvement; cluster C is the abstractive layer that earns its keep only after the lexical baseline exists.

---

## 11. Things I deliberately did not recommend

- **sqlite-vss inside sql.js.** Overkill at 26K vectors. Brute-force Worker cosine wins.
- **hnswlib-wasm / usearch-wasm.** Same reason. ANN libraries break even at ~50K+ vectors.
- **Entity embeddings.** The KG already routes "show me about X" through the Concept → Records adjacency in O(1) via the relationships map.
- **Hashed-filename cache-busting.** Breaks zero-build. Auto-stamped `?v=` does the same job.
- **Pre-compressing `.json.br` and serving with a JS decompression shim.** Cloudflare already brotlis on PressThink; GitHub Pages doesn't, but the SW + IndexedDB layer absorbs that gap.
- **OPFS (Origin Private File System).** Designed for sqlite-style random-access on multi-GB files. Not needed for in-memory JSON.
- **Hosted embedding APIs (OpenAI, Cohere, Voyage).** Locked to a paid backend, contradicts the static-only deploy posture.

---

## 12. Embedding model commitment

Decided: **commit to BGE-small-en-v1.5** for cluster C. The 384-dim INT8 binary format is part of the static deploy; swapping models later requires a binary regen but no UI change. If a meaningfully better small model ships in late 2026, regen takes a single curator run.

---

## 13. Cross-references

The three research investigations that produced this synthesis ran as parallel agents on 2026-05-27 between ~17:00-17:50 ET. Their full outputs are not committed (live in conversation transcript). Key facts cited here:

- Corpus size (26,565 vs CSV row count of 1,030) — verified by reading generated JSONs in `data/`
- HTTP header reality — verified live via `curl` against pressthink.org and github.io
- Compression numbers — measured with Node `zlib` at gzip(9)/brotli(11) on actual JSON files
- Current search code at `App.js:161-204` and the SW bugs in `frontend/sw.js` — read directly

This doc is the canonical reference; issues #274-#283 are the actionable scope.
