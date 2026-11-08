/**
 * A payload fetched after a timed-out deploy check must not be cached under
 * a deploy key that changed during the fetch.
 *
 * The IndexedDB key for the core payload is namespaced by the deploy version
 * that checkVersion stored in localStorage. When version.json loses the
 * bounded race, that stored value is still the previous deploy's, so reading
 * the IndexedDB entry under it returned the previous release's records for up
 * to the cache TTL (state machine map, follow-up 6). After a timeout the load
 * must go to the network instead.
 *
 * idb-keyval comes from the browser import map, so a resolve hook maps the
 * bare specifier to an in-memory fake for this process.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const FAKE_IDB_KEYVAL = `
const stores = globalThis.__fakeIdbStores ??= new Map();
export const createStore = (db, store) => {
  const key = db + '/' + store;
  if (!stores.has(key)) stores.set(key, new Map());
  return stores.get(key);
};
export const get = async (key, store) => store.get(key);
export const set = async (key, value, store) => { store.set(key, value); };
export const clear = async (store) => { store.clear(); };
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'idb-keyval') {
      return {
        url: `data:text/javascript,${encodeURIComponent(FAKE_IDB_KEYVAL)}`,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const memoryStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
};

globalThis.localStorage = memoryStorage();
globalThis.sessionStorage = memoryStorage();
globalThis.indexedDB = {};


// The service worker answers archive-core.json stale-while-revalidate, so the
// body fetched after a timed-out check can still be the previous release's.
const swStalePayload = {
  records: [{ id: 'RECORD-SW-STALE', title: 'Previous deploy, from the worker cache' }],
  facets: { categories: [] },
};

let releaseVersionJson;
const versionJson = new Promise(resolve => { releaseVersionJson = resolve; });

globalThis.fetch = async (url) => {
  const href = String(url);
  if (href.includes('version.json')) {
    // Loses the bounded race, then settles while the core payload downloads.
    return versionJson;
  }
  if (href.includes('archive-core.json')) {
    releaseVersionJson(new Response(JSON.stringify({ version: '2.0.0', updated: '2026-11-08' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    // Let the background check store the new deploy version first.
    await new Promise(resolve => setTimeout(resolve, 50));
    return new Response(JSON.stringify(swStalePayload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response('not found', { status: 404 });
};

const { CACHE_VERSION } = await import('../frontend/services/cacheConfig.js');
const idb = await import('../frontend/services/idbCache.js');
const archive = await import('../frontend/services/archiveService.js');

describe('fetchCoreData when the deploy version changes during the fetch', () => {
  it('does not store the unconfirmed payload under the new deploy key', async () => {
    localStorage.setItem('jrda_deploy_version', '1.0.0');

    const data = await archive.fetchCoreData();
    assert.ok(data.records.some(r => r.id === 'RECORD-SW-STALE'));
    assert.equal(localStorage.getItem('jrda_deploy_version'), '2.0.0',
      'the background check must have stored the new deploy version');

    const newKey = `archive-core::${CACHE_VERSION}::2.0.0`;
    assert.equal(await idb.idbGet(newKey) ?? null, null,
      'a payload of unknown revision must not be cached as the new deploy');
    assert.equal(sessionStorage.length, 0,
      'nor may it fall back to the Web Storage cache');
  });
});
