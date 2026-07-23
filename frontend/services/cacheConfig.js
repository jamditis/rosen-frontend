/**
 * Shared cache configuration for the Archive's storage layer.
 *
 * archiveService.js and loaders/httpCachedLoader.js both cache the entity
 * payload under the same key and version so the two code paths interoperate
 * during the entity-loader migration (#130). These constants and the key hash
 * live here so they cannot drift: bumping CACHE_VERSION in one place now
 * invalidates every cache by construction, instead of relying on a
 * "bump both together" comment that a future edit can forget.
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
 * djb2 hash of the data URL, namespaced under archive_json_. Both the legacy
 * archiveService cache and the httpCachedLoader adapter address entries with
 * this exact key, so they must compute it identically.
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
