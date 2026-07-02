/**
 * idbCache.js — a small, fail-safe IndexedDB key/value cache for large
 * parsed payloads (#275).
 *
 * archiveService caches the ~13 MB archive-core.json. The Web Storage cache
 * it used pays JSON.parse(~13 MB) on every repeat visit (200-500 ms on
 * phones) and, because the blob exceeds localStorage's ~5 MB cap, it lands in
 * sessionStorage — which is cleared on tab close, so a returning visitor in a
 * fresh tab never gets a hit. IndexedDB structured-clones the object graph on
 * read (no string parse) and persists across sessions with multi-hundred-MB
 * origin quotas.
 *
 * Every operation is fail-safe and resolves to a sentinel (null on read,
 * false on write/clear) instead of throwing:
 *   - IndexedDB is absent, or throws on open, in some private modes and under
 *     Firefox strict tracking protection.
 *   - idb-keyval loads from the esm.sh import map at runtime; a CDN hiccup
 *     must degrade to the Web Storage cache, not break the archive load.
 * The caller treats null/false as "not cached" and falls back. A throw from
 * this module must never reach archiveService — its top comment notes that a
 * module-load throw would take the whole app down with it.
 *
 * Offline note: the dynamic idb-keyval import is cross-origin (esm.sh) and is
 * not service-worker-precached, so an offline read returns null and the load
 * falls through to the service worker's stale-while-revalidate data cache.
 * The win this module targets — skipping the parse on online repeat visits —
 * is unaffected.
 */

import { raceTimeout } from '../utils/raceTimeout.js?v=3.5.0';

// A dedicated database/store so idbClear() only ever wipes this cache, never
// some other consumer's idb-keyval default store.
const DB_NAME = 'jrda-archive-cache';
const STORE_NAME = 'kv';

// idb-keyval is imported lazily and dynamically: this keeps it off the app's
// boot path (loaded on first cache access, not at module eval) and lets a CDN
// failure fall through to the catch below instead of aborting module load.
//
// The import is cross-origin (esm.sh) and not service-worker-precached, so a
// reachable-but-stalled CDN could hang every caller that awaits it —
// fetchCoreData awaits idbGet() before it ever tries same-origin
// archive-core.json or the Web Storage cache. A plain catch only handles a
// reject, not a stall, so the import is raced against a timeout: on a stall the
// race rejects fast and the caller degrades to the non-IndexedDB path (#392).
const IMPORT_TIMEOUT_MS = 3000;

/**
 * Race a promise-returning thunk against a timeout. Mirrors the thunk if it
 * settles within `ms`; otherwise rejects with a timeout error. Defers the
 * thunk to a microtask so a synchronous throw becomes a rejection, then races
 * it in reject-mode through the shared raceTimeout helper. A settle that
 * arrives after the timeout is ignored (raceTimeout settles once). Exported
 * for tests.
 * @param {() => Promise<T>} thunk
 * @param {number} ms
 * @returns {Promise<T>}
 * @template T
 */
export const withTimeout = (thunk, ms) =>
  raceTimeout(Promise.resolve().then(thunk), ms, { rejectOnTimeout: true });

let storePromise = null;
const getKeyval = () => {
  if (!storePromise) {
    storePromise = withTimeout(() => import('idb-keyval'), IMPORT_TIMEOUT_MS)
      .then((kv) => ({ kv, store: kv.createStore(DB_NAME, STORE_NAME) }))
      .catch((err) => {
        storePromise = null; // allow a later call to retry the import
        throw err;
      });
  }
  return storePromise;
};

const hasIndexedDB = () => {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    // Accessing `indexedDB` can itself throw under some storage policies.
    return false;
  }
};

/**
 * Read a value by key. Returns the structured-cloned value, or null on a
 * miss or any failure (IndexedDB blocked, idb-keyval import failed, etc.).
 * @param {string} key
 * @returns {Promise<unknown|null>}
 */
export const idbGet = async (key) => {
  if (!hasIndexedDB()) return null;
  try {
    const { kv, store } = await getKeyval();
    const value = await kv.get(key, store);
    return value === undefined ? null : value;
  } catch {
    return null;
  }
};

/**
 * Write a value by key. Returns true on success, false if the value was not
 * persisted for any reason (so the caller can fall back to another cache).
 * @param {string} key
 * @param {unknown} value
 * @returns {Promise<boolean>}
 */
export const idbSet = async (key, value) => {
  if (!hasIndexedDB()) return false;
  try {
    const { kv, store } = await getKeyval();
    await kv.set(key, value, store);
    return true;
  } catch {
    return false;
  }
};

/**
 * Remove every entry from this cache's store. Returns true on success, false
 * if the store could not be cleared. Used by archiveService's deploy-version
 * invalidation so a new deploy drops stale blobs and IndexedDB doesn't grow
 * one orphaned copy per past version.
 * @returns {Promise<boolean>}
 */
export const idbClear = async () => {
  if (!hasIndexedDB()) return false;
  try {
    const { kv, store } = await getKeyval();
    await kv.clear(store);
    return true;
  } catch {
    return false;
  }
};
