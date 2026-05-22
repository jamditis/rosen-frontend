/**
 * Tests for httpCachedLoader — the production Adapter for the
 * EntityDataLoader port.
 *
 * The adapter touches fetch, localStorage and sessionStorage. None of
 * those exist under `node --test`, so every test injects fakes through
 * the `deps` seam: a routed fetch, Map-backed Storage shims, and a
 * deterministic clock. This is the same reasoning the in-memory loader
 * encodes — the port lets the browser surface be swapped out wholesale.
 *
 * Each test pins one behaviour issue #130 asked the adapter to preserve:
 * single-flight, TTL, cache-version stamp, version.json invalidation,
 * the >5MB sessionStorage split, the quota fallback, and the port's
 * reject-don't-mask failure contract.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createHttpCachedLoader } from '../frontend/services/loaders/httpCachedLoader.js';

const ENTITIES_URL = 'data/archive-entities.json';
const TTL_MS = 1000 * 60 * 30;

// ---- fakes ---------------------------------------------------------------

/** Map-backed Web Storage shim: getItem/setItem/removeItem/length/key. */
const makeStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    _map: map,
  };
};

/**
 * Storage that rejects new writes while any archive_* key is present,
 * mimicking a full quota that clearArchiveCaches can recover from.
 */
const makeQuotaStorage = () => {
  const base = makeStorage();
  return {
    ...base,
    setItem: (k, v) => {
      const full = [...base._map.keys()].some((x) => x.startsWith('archive_'));
      if (full && !base._map.has(k)) {
        const err = new Error('storage is full');
        err.name = 'QuotaExceededError';
        throw err;
      }
      base._map.set(k, String(v));
    },
    get length() { return base._map.size; },
  };
};

const okJson = (body) => ({ ok: true, status: 200, json: async () => body });
const httpError = (status) => ({ ok: false, status, json: async () => ({}) });

/** Records every requested URL so tests can count entity-data fetches. */
const makeFetch = (handler) => {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    return handler(url, calls);
  };
  fn.calls = calls;
  fn.entityFetches = () => calls.filter((u) => u.includes('archive-entities')).length;
  return fn;
};

const rawPayload = () => ({
  entities: [
    { id: 'e:lippmann', type: 'Person', prominence: 9, name: 'Walter Lippmann' },
    { id: 'e:dewey', type: 'Person', prominence: 7, name: 'John Dewey' },
  ],
  recordEntityMap: {
    'r:1': ['e:lippmann', 'e:dewey'],
    'r:2': ['e:lippmann'],
  },
});

/** A routed fetch: version.json -> {version}, archive-entities -> payload. */
const routedFetch = ({ payload, version = 'deploy-1', entitiesStatus = 200 } = {}) =>
  makeFetch((url) => {
    if (url.includes('version.json')) return okJson({ version });
    if (url.includes('archive-entities')) {
      return entitiesStatus === 200
        ? okJson(payload ?? rawPayload())
        : httpError(entitiesStatus);
    }
    return httpError(404);
  });

const archiveKeys = (storage) =>
  [...storage._map.keys()].filter((k) => k.startsWith('archive_json_'));

// ---- projection ----------------------------------------------------------

describe('httpCachedLoader: projection onto the port payload', () => {
  it('projects recordEntityMap onto the (entities, records) shape', async () => {
    const loader = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: { fetch: routedFetch(), localStorage: makeStorage(), sessionStorage: makeStorage() },
    });
    const { entities, records } = await loader.loadEntityData();

    assert.deepEqual(entities.map((e) => e.id), ['e:lippmann', 'e:dewey']);
    const r1 = records.find((r) => r.id === 'r:1');
    assert.deepEqual(r1.relatedIds, ['e:lippmann', 'e:dewey']);
  });

  it('injects the dissertation Record stub with relatedIds: []', async () => {
    const loader = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: { fetch: routedFetch(), localStorage: makeStorage(), sessionStorage: makeStorage() },
    });
    const { records } = await loader.loadEntityData();
    const diss = records.find((r) => r.id === 'dissertation-1986');
    assert.ok(diss, 'dissertation Record must be present');
    assert.deepEqual(diss.relatedIds, []);
  });

  it('does not duplicate the dissertation when the payload already has it', async () => {
    const payload = rawPayload();
    payload.recordEntityMap['dissertation-1986'] = [];
    const loader = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: {
        fetch: routedFetch({ payload }),
        localStorage: makeStorage(),
        sessionStorage: makeStorage(),
      },
    });
    const { records } = await loader.loadEntityData();
    const diss = records.filter((r) => r.id === 'dissertation-1986');
    assert.equal(diss.length, 1, 'exactly one dissertation Record');
  });

  it('accepts a payload that already carries the records array shape', async () => {
    const payload = {
      entities: rawPayload().entities,
      records: [{ id: 'r:1', relatedIds: ['e:lippmann'] }],
    };
    const loader = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: {
        fetch: routedFetch({ payload }),
        localStorage: makeStorage(),
        sessionStorage: makeStorage(),
      },
    });
    const { records } = await loader.loadEntityData();
    assert.deepEqual(records.find((r) => r.id === 'r:1').relatedIds, ['e:lippmann']);
  });
});

// ---- single-flight + cache re-entry -------------------------------------

describe('httpCachedLoader: single-flight and cache re-entry', () => {
  it('shares one fetch across concurrent loadEntityData calls', async () => {
    const fetch = routedFetch();
    const loader = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: { fetch, localStorage: makeStorage(), sessionStorage: makeStorage() },
    });
    const [a, b] = await Promise.all([loader.loadEntityData(), loader.loadEntityData()]);
    assert.equal(fetch.entityFetches(), 1, 'concurrent calls must share one fetch');
    assert.deepEqual(a, b);
  });

  it('serves a later call from the Web Storage cache without re-fetching', async () => {
    const fetch = routedFetch();
    const loader = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: { fetch, localStorage: makeStorage(), sessionStorage: makeStorage() },
    });
    await loader.loadEntityData();
    await loader.loadEntityData();
    assert.equal(fetch.entityFetches(), 1, 'a fresh-enough cache entry must avoid the network');
  });

  it('re-checks the TTL on a reused loader instance once the cache expires', async () => {
    const localStorage = makeStorage();
    const sessionStorage = makeStorage();
    const fetch = routedFetch();
    let clock = 1000;
    const loader = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: { fetch, localStorage, sessionStorage, now: () => clock },
    });
    await loader.loadEntityData();           // fetch #1, cached at t=1000
    clock = 1000 + 60_000;
    await loader.loadEntityData();           // within TTL — cache hit
    assert.equal(fetch.entityFetches(), 1, 'within TTL the same instance serves cache');
    clock = 1000 + TTL_MS + 1;
    await loader.loadEntityData();           // past TTL — re-fetch
    assert.equal(fetch.entityFetches(), 2, 'past TTL the same instance must re-fetch');
  });

  it('re-enters the load path for each settled call when no cache is wired', async () => {
    // No localStorage/sessionStorage — there is no cross-call memo, so a
    // settled in-flight Promise must never be retained as a result cache.
    const fetch = routedFetch();
    const loader = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: { fetch },
    });
    await loader.loadEntityData();
    await loader.loadEntityData();
    assert.equal(fetch.entityFetches(), 2, 'without a cache each call must re-fetch');
  });
});

// ---- failure contract (port: reject, never mask) ------------------------

describe('httpCachedLoader: failure contract', () => {
  it('rejects on an HTTP error instead of resolving with empty arrays', async () => {
    const loader = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: {
        fetch: routedFetch({ entitiesStatus: 500 }),
        localStorage: makeStorage(),
        sessionStorage: makeStorage(),
      },
    });
    await assert.rejects(() => loader.loadEntityData(), /HTTP 500/);
  });

  it('rejects when the network fetch throws', async () => {
    const fetch = makeFetch((url) => {
      if (url.includes('version.json')) return okJson({ version: 'deploy-1' });
      throw new Error('network down');
    });
    const loader = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: { fetch, localStorage: makeStorage(), sessionStorage: makeStorage() },
    });
    await assert.rejects(() => loader.loadEntityData(), /fetch failed/);
  });

  it('rejects when the response body is not valid JSON', async () => {
    const fetch = makeFetch((url) => {
      if (url.includes('version.json')) return okJson({ version: 'deploy-1' });
      return {
        ok: true,
        status: 200,
        json: async () => { throw new Error('Unexpected token'); },
      };
    });
    const loader = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: { fetch, localStorage: makeStorage(), sessionStorage: makeStorage() },
    });
    await assert.rejects(() => loader.loadEntityData(), /parse failed/);
  });

  it('does not memoise a failed load — a retry re-fetches and can succeed', async () => {
    let entityCalls = 0;
    const fetch = makeFetch((url) => {
      if (url.includes('version.json')) return okJson({ version: 'deploy-1' });
      entityCalls += 1;
      if (entityCalls === 1) return httpError(503);
      return okJson(rawPayload());
    });
    const loader = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: { fetch, localStorage: makeStorage(), sessionStorage: makeStorage() },
    });
    await assert.rejects(() => loader.loadEntityData(), /HTTP 503/);
    const { entities } = await loader.loadEntityData();
    assert.equal(entities.length, 2, 'retry after a failure must succeed');
    assert.equal(entityCalls, 2);
  });

  it('requires entitiesUrl', () => {
    assert.throws(() => createHttpCachedLoader({}), /entitiesUrl is required/);
  });
});

// ---- Web Storage cache --------------------------------------------------

describe('httpCachedLoader: Web Storage cache', () => {
  it('writes to localStorage; a fresh loader then serves from cache', async () => {
    const localStorage = makeStorage();
    const sessionStorage = makeStorage();
    const fetch = routedFetch();

    const first = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: { fetch, localStorage, sessionStorage, now: () => 1000 },
    });
    await first.loadEntityData();
    assert.equal(archiveKeys(localStorage).length, 1, 'payload must be cached in localStorage');

    const second = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: { fetch, localStorage, sessionStorage, now: () => 1000 + 60_000 },
    });
    const { entities } = await second.loadEntityData();
    assert.equal(entities.length, 2);
    assert.equal(fetch.entityFetches(), 1, 'a fresh loader must hit the cache, not the network');
  });

  it('ignores a cache entry past the 30-minute TTL and re-fetches', async () => {
    const localStorage = makeStorage();
    const sessionStorage = makeStorage();
    const fetch = routedFetch();

    const fresh = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: { fetch, localStorage, sessionStorage, now: () => 1000 },
    });
    await fresh.loadEntityData();

    const stale = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: { fetch, localStorage, sessionStorage, now: () => 1000 + TTL_MS + 1 },
    });
    await stale.loadEntityData();
    assert.equal(fetch.entityFetches(), 2, 'an expired cache entry must trigger a re-fetch');
  });

  it('ignores a cache entry stamped with a different cache version', async () => {
    const localStorage = makeStorage();
    const sessionStorage = makeStorage();
    const fetch = routedFetch();

    const loader = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: { fetch, localStorage, sessionStorage, now: () => 1000 },
    });
    await loader.loadEntityData();

    // Rewrite the cached entry under an old cache version.
    const key = archiveKeys(localStorage)[0];
    const entry = JSON.parse(localStorage.getItem(key));
    entry.version = 'v0-ancient';
    localStorage.setItem(key, JSON.stringify(entry));

    const next = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: { fetch, localStorage, sessionStorage, now: () => 1000 },
    });
    await next.loadEntityData();
    assert.equal(fetch.entityFetches(), 2, 'a version-mismatched entry must be ignored');
  });

  it('recovers from a quota error: clears archive caches, retries, caches', async () => {
    const localStorage = makeQuotaStorage();
    const sessionStorage = makeStorage();
    // A stale archive entry occupies the quota until it is cleared.
    localStorage.setItem('archive_json_stale', 'x'.repeat(32));
    const fetch = routedFetch();

    const loader = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: { fetch, localStorage, sessionStorage, now: () => 1000 },
    });
    const { entities } = await loader.loadEntityData();
    assert.equal(entities.length, 2, 'load succeeds even when the first cache write is rejected');

    const keys = archiveKeys(localStorage);
    assert.ok(!keys.includes('archive_json_stale'), 'the stale entry must be evicted');
    assert.equal(keys.length, 1, 'the payload must be cached after the retry');
  });

  it('routes payloads over 5MB to sessionStorage, not localStorage', async () => {
    const localStorage = makeStorage();
    const sessionStorage = makeStorage();
    const big = rawPayload();
    big.entities[0].name = 'x'.repeat(6 * 1024 * 1024); // forces serialised size > 5MB

    const loader = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: {
        fetch: routedFetch({ payload: big }),
        localStorage,
        sessionStorage,
        now: () => 1000,
      },
    });
    await loader.loadEntityData();
    assert.equal(archiveKeys(localStorage).length, 0, 'large payload must skip localStorage');
    assert.equal(archiveKeys(sessionStorage).length, 1, 'large payload must use sessionStorage');
  });

  it('evicts a stale localStorage entry when the payload is written sessionStorage-only', async () => {
    // The cache key is shared with the legacy archiveService during the
    // migration. If a small entry is written to localStorage under that key
    // while a >5MB payload is in flight, the large-payload write (which
    // goes to sessionStorage only) must still evict the localStorage entry.
    // sessionStorage is per-tab, so a leftover localStorage entry would be
    // served stale to a new tab within the TTL.
    const localStorage = makeStorage();

    // Learn the entities cache key by caching a small payload once.
    const warm = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: { fetch: routedFetch(), localStorage, sessionStorage: makeStorage(), now: () => 1000 },
    });
    await warm.loadEntityData();
    const cacheKey = archiveKeys(localStorage)[0];
    assert.ok(cacheKey, 'a small payload caches under the entities cache key');

    // Drop it so the next loader misses the cache and fetches. During that
    // fetch, simulate the legacy archiveService re-populating the same key.
    localStorage.removeItem(cacheKey);
    const big = rawPayload();
    big.entities[0].name = 'x'.repeat(6 * 1024 * 1024); // forces serialised size > 5MB
    const racingFetch = makeFetch((url) => {
      if (url.includes('version.json')) return okJson({ version: 'deploy-1' });
      localStorage.setItem(
        cacheKey,
        JSON.stringify({ data: rawPayload(), timestamp: 1000 }),
      );
      return okJson(big);
    });
    const large = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: { fetch: racingFetch, localStorage, sessionStorage: makeStorage(), now: () => 1000 },
    });
    await large.loadEntityData();

    assert.equal(
      localStorage.getItem(cacheKey),
      null,
      'the >5MB write must evict the stale localStorage entry under the cache key',
    );
  });
});

// ---- version.json invalidation ------------------------------------------

describe('httpCachedLoader: version.json invalidation', () => {
  it('clears the archive cache when the deploy version changes', async () => {
    const localStorage = makeStorage();
    const sessionStorage = makeStorage();

    const before = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: {
        fetch: routedFetch({ version: 'deploy-1' }),
        localStorage,
        sessionStorage,
        now: () => 1000,
      },
    });
    await before.loadEntityData();
    assert.equal(archiveKeys(localStorage).length, 1);

    const afterFetch = routedFetch({ version: 'deploy-2' });
    const after = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: { fetch: afterFetch, localStorage, sessionStorage, now: () => 1000 },
    });
    await after.loadEntityData();
    assert.equal(
      afterFetch.entityFetches(),
      1,
      'a changed deploy version must invalidate the cache and force a re-fetch',
    );
  });

  it('keeps serving cache when the deploy version is unchanged', async () => {
    const localStorage = makeStorage();
    const sessionStorage = makeStorage();
    const fetch = routedFetch({ version: 'deploy-1' });

    const before = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: { fetch, localStorage, sessionStorage, now: () => 1000 },
    });
    await before.loadEntityData();

    const after = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: { fetch, localStorage, sessionStorage, now: () => 1000 },
    });
    await after.loadEntityData();
    assert.equal(fetch.entityFetches(), 1, 'an unchanged version must keep the cache valid');
  });

  it('does not stall the load when version.json is slow to respond', async () => {
    // version.json is backed by a manually-resolved Promise: it stays
    // pending across the whole load and is resolved only after the
    // assertions. This proves the load did not wait for it, with no
    // wall-clock race between a delay timer and the load to flake on a
    // slow CI runner.
    let versionSettled = false;
    let resolveVersion;
    const versionResponse = new Promise((resolve) => { resolveVersion = resolve; });
    const fetch = makeFetch((url) => {
      if (url.includes('version.json')) {
        return versionResponse.then((value) => {
          versionSettled = true;
          return value;
        });
      }
      return okJson(rawPayload());
    });
    const loader = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      versionTimeoutMs: 5,
      deps: { fetch, localStorage: makeStorage(), sessionStorage: makeStorage() },
    });
    const { entities } = await loader.loadEntityData();
    assert.equal(entities.length, 2, 'a slow version.json must not block the entity load');
    assert.equal(versionSettled, false, 'the load must not have waited on version.json');

    // Resolve version.json, then hold the event loop open with a live
    // (non-unref'd) timer while checkDeployVersion's continuation settles.
    // Without that slack node:test flags its awaited fetch as a Promise
    // still pending when the loop idles.
    resolveVersion(okJson({ version: 'deploy-1' }));
    await new Promise((resolve) => { setTimeout(resolve, 50); });
  });

  it('retries the deploy-version check after a transient version.json failure', async () => {
    const localStorage = makeStorage();
    const sessionStorage = makeStorage();
    let versionCalls = 0;
    const fetch = makeFetch((url) => {
      if (url.includes('version.json')) {
        versionCalls += 1;
        if (versionCalls === 1) throw new Error('offline');
        return okJson({ version: 'deploy-1' });
      }
      return okJson(rawPayload());
    });
    const loader = createHttpCachedLoader({
      entitiesUrl: ENTITIES_URL,
      deps: { fetch, localStorage, sessionStorage },
    });
    await loader.loadEntityData(); // first version check fails transiently
    await loader.loadEntityData(); // must retry rather than skip permanently
    assert.ok(versionCalls >= 2, 'a transient failure must not disable later version checks');
  });
});
