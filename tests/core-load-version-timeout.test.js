/**
 * A slow version.json must not let fetchCoreData serve the previous deploy.
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

const freshPayload = {
  records: [{ id: 'RECORD-NEW', title: 'Current deploy' }],
  facets: { categories: [] },
};

const fetchedUrls = [];
globalThis.fetch = async (url) => {
  const href = String(url);
  fetchedUrls.push(href);
  if (href.includes('version.json')) {
    // Never settles: the deploy check loses the bounded race.
    return new Promise(() => {});
  }
  if (href.includes('archive-core.json')) {
    return new Response(JSON.stringify(freshPayload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response('not found', { status: 404 });
};

const { CACHE_VERSION } = await import('../frontend/services/cacheConfig.js');
const idb = await import('../frontend/services/idbCache.js');
const archive = await import('../frontend/services/archiveService.js');

describe('fetchCoreData when the deploy check times out', () => {
  it('skips the IndexedDB entry keyed by the previous deploy and fetches', async () => {
    localStorage.setItem('jrda_deploy_version', '1.0.0');
    const previousKey = `archive-core::${CACHE_VERSION}::1.0.0`;
    const stored = await idb.idbSet(previousKey, {
      data: { records: [{ id: 'RECORD-OLD', title: 'Previous deploy' }], facets: { categories: [] } },
      timestamp: Date.now(),
      version: CACHE_VERSION,
    });
    assert.equal(stored, true, 'fake IndexedDB must accept the seeded entry');

    const data = await archive.fetchCoreData();

    const ids = data.records.map(r => r.id);
    assert.ok(ids.includes('RECORD-NEW'), `expected the fetched payload, got ${ids.join(', ')}`);
    assert.ok(!ids.includes('RECORD-OLD'), 'the previous deploy blob must not be served');
    assert.ok(
      fetchedUrls.some(url => url.includes('archive-core.json')),
      'the core payload must come from the network after a timed-out check',
    );
  });
});
