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
// v10: the 9c entity cleanup rewrote archive-entities.json; bump so a returning
// visitor's cached pre-cleanup entity payload is dropped instead of served for
// up to CACHE_TTL_MS after deploy.
export const CACHE_VERSION = 'v10';

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
