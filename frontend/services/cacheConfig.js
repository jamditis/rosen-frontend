/**
 * Shared cache configuration for the Archive's storage layer.
 *
 * archiveService.js reads the entity payload cache through these constants
 * and the key hash below, so they live here rather than inline: bumping
 * CACHE_VERSION in one place invalidates every cache by construction,
 * instead of relying on a "bump it everywhere" comment a future edit can
 * forget. (Formerly shared with loaders/httpCachedLoader.js, an unwired
 * entity-loading path removed in #503.)
 */

// Increment to invalidate all caches (e.g. after a breaking payload change).
// v11: the 3.8.34 data release genuinely changed the archive payloads -- seven
// duplicate records dropped (#867), RECORD-00918 added by the RECORD-00429
// split (#863), and the duplicate PressThink entity merged into O0033 (#859).
// A returning visitor holding a v10 payload would otherwise be served records
// that no longer exist, and a stale entity graph, for up to CACHE_TTL_MS after
// deploy.
export const CACHE_VERSION = 'v11';

// Entity data is small (~1MB), so a short TTL keeps it current cheaply.
export const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

// localStorage quota is ~5MB; larger payloads go to sessionStorage instead.
export const MAX_LOCALSTORAGE_SIZE = 5 * 1024 * 1024;

/**
 * djb2 hash of the data URL, namespaced under archive_json_. archiveService's
 * cache addresses entries with this exact key.
 * @param {string} url
 * @returns {string}
 */
export const cacheKeyFor = (url) => {
  let hash = 5381;
  for (let i = 0; i < url.length; i += 1) {
    hash = ((hash << 5) + hash) + url.charCodeAt(i);
  }
  return `archive_json_${Math.abs(hash >>> 0)}`;
};
