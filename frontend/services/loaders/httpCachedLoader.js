/**
 * httpCachedLoader — production Adapter for the EntityDataLoader port.
 *
 * Fetches the Archive entity payload over HTTP and serves it through the
 * browser's Web Storage cache. The Entity Index never sees any of this:
 * it depends only on the port (see ./entityDataLoader.js); this adapter
 * is the implementation a composition root (App.js) will wire in once the
 * live app migrates onto the port. Nothing wires it yet — this PR is
 * groundwork for that later migration step.
 *
 * Behaviour ported verbatim from archiveService.js (issue #130, step 1):
 *   - sessionStorage for payloads over 5MB, localStorage otherwise
 *   - 30-minute TTL plus a cache-version stamp
 *   - version.json deploy-invalidation
 *   - single-flight: concurrent loads share one in-flight Promise
 *   - quota-exceeded fallback: clear archive_* keys, retry once, then skip
 *
 * Two intentional changes from the legacy code, both toward the port's
 * contract rather than away from it:
 *   1. On any fetch/parse failure this rejects (the port forbids masking
 *      a failure as an empty Archive). archiveService.fetchEntitiesData
 *      swallowed errors and returned { entities: [], recordEntityMap: {} }.
 *   2. The version.json check is awaited before the cache read, but bounded
 *      by versionTimeoutMs. The legacy checkVersion() was fired without
 *      await, so the first load after a deploy served stale cache; an
 *      unbounded await would instead let a slow manifest stall a load that
 *      a good cache could already satisfy. The timeout keeps both at bay.
 *
 * The DISSERTATION_RECORD injection now lives here — it is a loader-side
 * concern (the curated 1986 dissertation predates entity extraction and
 * references no Entities, so it needs a stub Record with relatedIds: []).
 *
 * @typedef {import('./entityDataLoader.js').EntityDataLoader} EntityDataLoader
 * @typedef {import('./entityDataLoader.js').EntityDataPayload} EntityDataPayload
 */

import {
  CACHE_VERSION,
  CACHE_TTL_MS,
  MAX_LOCALSTORAGE_SIZE,
  cacheKeyFor,
} from '../cacheConfig.js?v=3.6.8';
import { raceTimeout } from '../../utils/raceTimeout.js?v=3.6.8';

// localStorage key holding the last-seen deploy version.
const DEPLOY_VERSION_KEY = 'jrda_deploy_version';

// The 1986 PhD dissertation is a curator-added Record. It predates the
// entity-extraction pipeline and references no Entities.
const DISSERTATION_RECORD_ID = 'dissertation-1986';

// Cache keys this adapter owns or may evict. Kept in sync with
// archiveService.clearArchiveCache so a quota purge clears the same set.
const ARCHIVE_CACHE_PREFIXES = ['archive_json_', 'archive_csv_'];

/**
 * True for the browser's storage-quota-exceeded error, across engines.
 * @param {unknown} err
 */
const isQuotaError = (err) =>
  !!err && (err.name === 'QuotaExceededError' || err.code === 22);

/**
 * Remove every archive_* entry from the given storages. Used both by the
 * deploy-version invalidation and the quota fallback. Enumerates with the
 * spec-standard length/key(i) API and collects keys before deleting, so
 * index shifting during removal cannot skip an entry.
 * @param {Array<Storage|undefined>} storages
 */
const clearArchiveCaches = (storages) => {
  for (const storage of storages) {
    if (!storage) continue;
    try {
      const doomed = [];
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key && ARCHIVE_CACHE_PREFIXES.some((p) => key.startsWith(p))) {
          doomed.push(key);
        }
      }
      for (const key of doomed) storage.removeItem(key);
    } catch {
      // Storage unavailable (private mode, disabled) — nothing to clear.
    }
  }
};

/**
 * Read a fresh, version-matched cache entry, or null on miss/stale/corrupt.
 * Stale or corrupt entries are evicted as a side effect. Storage access is
 * wrapped because getItem can throw in private-browsing modes.
 * @param {Array<Storage|undefined>} storages  searched in order
 * @param {string} key
 * @param {() => number} now
 * @returns {unknown|null}
 */
const readCache = (storages, key, now) => {
  for (const storage of storages) {
    if (!storage) continue;
    let serialized;
    try {
      serialized = storage.getItem(key);
    } catch {
      continue;
    }
    if (!serialized) continue;
    try {
      const entry = JSON.parse(serialized);
      const fresh =
        entry.version === CACHE_VERSION &&
        now() - entry.timestamp <= CACHE_TTL_MS;
      if (fresh) return entry.data;
    } catch {
      // Corrupt entry — fall through and evict it below.
    }
    try {
      storage.removeItem(key);
    } catch {
      // Eviction is best-effort.
    }
  }
  return null;
};

/**
 * Write the raw network payload to the cache. Caching is best-effort: a
 * failure here never propagates, because the caller already holds the data.
 * @param {{ localStorage?: Storage, sessionStorage?: Storage }} storages
 * @param {string} key
 * @param {unknown} data  the raw payload, cached verbatim
 * @param {() => number} now
 */
const writeCache = ({ localStorage, sessionStorage }, key, data, now) => {
  let serialized;
  try {
    serialized = JSON.stringify({ data, timestamp: now(), version: CACHE_VERSION });
  } catch {
    return; // Unserialisable payload — skip caching.
  }

  if (serialized.length > MAX_LOCALSTORAGE_SIZE) {
    // Large payload: sessionStorage only. Evict any localStorage entry
    // under this key first. sessionStorage is per-tab, so a stale smaller
    // payload left in the shared localStorage would otherwise be served
    // by readCache in a new tab — or in this tab if the sessionStorage
    // write below fails — masking the fresh data for the rest of the TTL.
    if (localStorage) {
      try {
        localStorage.removeItem(key);
      } catch {
        // Eviction is best-effort.
      }
    }
    if (sessionStorage) {
      try {
        sessionStorage.setItem(key, serialized);
      } catch {
        // Session cache full — skip.
      }
    }
    return;
  }

  if (!localStorage) return;
  try {
    localStorage.setItem(key, serialized);
  } catch (err) {
    if (isQuotaError(err)) {
      // Quota full: drop the reconstructible archive caches and retry once.
      clearArchiveCaches([localStorage, sessionStorage]);
      try {
        localStorage.setItem(key, serialized);
      } catch {
        // Still full — caching is silently disabled for this load.
      }
    }
    // Non-quota write errors leave the cache cold; the load still succeeds.
  }
};

/**
 * Check version.json and clear the archive caches if the deploy version
 * changed.
 *
 * Returns true only when the check reached a definitive answer (a version
 * was read and applied, or there is no localStorage to invalidate). A
 * transient failure — unreachable, non-OK, unparsable — returns false so
 * the caller can retry on a later load instead of disabling invalidation
 * for the rest of the session. No failure mode throws.
 *
 * @param {{ fetch: typeof fetch, localStorage?: Storage, sessionStorage?: Storage }} deps
 * @param {string} versionUrl
 * @param {() => number} now
 * @returns {Promise<boolean>} true if the check is settled, false to retry
 */
const checkDeployVersion = async ({ fetch, localStorage, sessionStorage }, versionUrl, now) => {
  if (!localStorage) return true; // No persistent store — nothing to invalidate.

  let response;
  try {
    response = await fetch(`${versionUrl}?t=${now()}`);
  } catch {
    return false; // Network error — transient, let a later load retry.
  }
  if (!response || !response.ok) return false;

  let version;
  try {
    ({ version } = await response.json());
  } catch {
    return false;
  }
  if (!version) return false;

  let stored;
  try {
    stored = localStorage.getItem(DEPLOY_VERSION_KEY);
  } catch {
    return false;
  }
  if (stored && stored !== version) {
    clearArchiveCaches([localStorage, sessionStorage]);
  }
  try {
    localStorage.setItem(DEPLOY_VERSION_KEY, version);
  } catch {
    // Cannot record the version — harmless, the comparison still ran.
  }
  return true;
};

/**
 * Project a raw Archive entity payload onto the port's EntityDataPayload.
 *
 * The network file ships `recordEntityMap` ({ recordId: [entityId, ...] }).
 * A cached payload may already carry the `records` array shape, so both are
 * accepted. The dissertation Record stub is injected when absent.
 * @param {{ entities?: unknown, records?: unknown, recordEntityMap?: unknown }} raw
 * @returns {EntityDataPayload}
 */
const toEntityDataPayload = (raw) => {
  const entities = Array.isArray(raw?.entities) ? raw.entities : [];

  let records;
  if (Array.isArray(raw?.records)) {
    records = raw.records.map((r) => ({
      id: r.id,
      relatedIds: Array.isArray(r.relatedIds) ? r.relatedIds : [],
    }));
  } else {
    const map = raw?.recordEntityMap ?? {};
    records = Object.entries(map).map(([id, relatedIds]) => ({
      id,
      relatedIds: Array.isArray(relatedIds) ? relatedIds : [],
    }));
  }

  if (!records.some((r) => r.id === DISSERTATION_RECORD_ID)) {
    records.push({ id: DISSERTATION_RECORD_ID, relatedIds: [] });
  }

  return { entities, records };
};

/**
 * Create the production EntityDataLoader: HTTP fetch behind a Web Storage
 * cache.
 *
 * `entitiesUrl` is passed in (the composition root reads it from
 * DATA_CONFIG); this adapter imports no app config and no App.js, so the
 * port seam stays closed.
 *
 * `deps` injects the browser surface for testing — node:test wires fakes
 * for fetch and the two storages, and a deterministic `now`. In the
 * browser the defaults (global fetch / localStorage / sessionStorage /
 * Date.now) apply.
 *
 * @param {{
 *   entitiesUrl: string,
 *   versionUrl?: string,
 *   versionTimeoutMs?: number,
 *   deps?: {
 *     fetch?: typeof fetch,
 *     localStorage?: Storage,
 *     sessionStorage?: Storage,
 *     now?: () => number,
 *   },
 * }} options
 * @returns {EntityDataLoader}
 */
export const createHttpCachedLoader = ({
  entitiesUrl,
  versionUrl = './version.json',
  versionTimeoutMs = 4000,
  deps = {},
} = {}) => {
  if (!entitiesUrl) {
    throw new Error('createHttpCachedLoader: entitiesUrl is required');
  }

  const {
    fetch = typeof globalThis.fetch === 'function'
      ? globalThis.fetch.bind(globalThis)
      : undefined,
    localStorage = globalThis.localStorage,
    sessionStorage = globalThis.sessionStorage,
    now = Date.now,
  } = deps;

  const cacheKey = cacheKeyFor(entitiesUrl);

  // Single-flight guard only: concurrent callers share one in-flight
  // Promise. Released as soon as the load settles (resolve or reject) so
  // the next call re-enters the load path and re-checks cache freshness
  // (TTL) — the Web Storage cache, not this field, is the cross-call memo.
  let inflight = null;
  // A successful deploy-version check runs at most once per loader
  // instance — a redeploy mid-session cannot reach the user without a full
  // page reload anyway, and a reload builds a fresh loader. The flag is set
  // only on success, so a transient version.json failure is retried.
  let versionChecked = false;

  const fetchEntityData = async () => {
    if (typeof fetch !== 'function') {
      throw new Error('createHttpCachedLoader: no fetch implementation available');
    }

    // Invalidate stale caches before the cache read, but bound the check
    // by versionTimeoutMs: a slow or hung version.json must not stall a
    // load a good cache could satisfy. On timeout or transient failure
    // versionChecked stays false, so a later call retries the check.
    if (!versionChecked) {
      const checked = await raceTimeout(
        checkDeployVersion({ fetch, localStorage, sessionStorage }, versionUrl, now),
        versionTimeoutMs,
        { fallback: false },
      );
      if (checked) versionChecked = true;
    }

    const cached = readCache([sessionStorage, localStorage], cacheKey, now);
    if (cached) return toEntityDataPayload(cached);

    let response;
    try {
      response = await fetch(entitiesUrl);
    } catch (err) {
      throw new Error(`Entity data fetch failed for ${entitiesUrl}: ${err.message}`);
    }
    if (!response || !response.ok) {
      const status = response ? response.status : 'no response';
      throw new Error(`Entity data fetch failed for ${entitiesUrl}: HTTP ${status}`);
    }

    let raw;
    try {
      raw = await response.json();
    } catch (err) {
      throw new Error(`Entity data parse failed for ${entitiesUrl}: ${err.message}`);
    }

    // Cache the raw network payload (shape-compatible with the legacy
    // archiveService cache); the projection stays out of the cache.
    writeCache({ localStorage, sessionStorage }, cacheKey, raw, now);
    return toEntityDataPayload(raw);
  };

  return {
    loadEntityData: () => {
      if (inflight) return inflight;
      const pending = fetchEntityData();
      inflight = pending;
      const release = () => {
        if (inflight === pending) inflight = null;
      };
      // Release on both outcomes: a success must not be memoised past the
      // cache TTL, and a failure must let a later call retry.
      pending.then(release, release);
      return inflight;
    },
  };
};
