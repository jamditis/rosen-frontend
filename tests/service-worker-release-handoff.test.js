/**
 * Service worker release handoff (state machine map, problem 6 / follow-up 7).
 *
 * Install calls skipWaiting and activate claims every open window, so a page
 * from the previous release keeps running under the new worker. That page
 * still imports modules under its own ?v= keys, for example the lazy
 * DesktopShell.js?v=<old>. Activate used to delete the previous release's
 * static cache at once; the import then missed, the server answered with the
 * new release's bytes, and cacheFirst stored them under the old key in the
 * new cache. The old page then ran new modules until a reload.
 *
 * The worker now keeps the newest previous static cache while a window that
 * was open at activation is still open, serves other-release URLs from any
 * cache without writing new bytes under their keys, and deletes the retained
 * cache once those windows are gone.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'frontend', 'sw.js'), 'utf8');
const APP_VERSION = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8'),
).version;
const OLD_VERSION = '3.0.0';
const ORIGIN = 'https://pressthink.org';
const BASE = '/j/rosen-archive';

function createCacheStorage() {
  const stores = new Map();
  const openStore = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  };
  const keyOf = (request) => (typeof request === 'string'
    ? new URL(request, ORIGIN).href
    : request.url);
  const cacheFor = (store) => ({
    async match(request) { return store.get(keyOf(request))?.clone(); },
    async put(request, response) { store.set(keyOf(request), response.clone()); },
    async add(request) { store.set(keyOf(request), new Response(`precached ${keyOf(request)}`)); },
  });
  return {
    stores,
    async open(name) { return cacheFor(openStore(name)); },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async match(request) {
      for (const store of stores.values()) {
        const hit = store.get(keyOf(request));
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };
}

function loadSW({ cacheStorage, windows, fetchImpl, version = APP_VERSION }) {
  const handlers = {};
  const source = version === APP_VERSION
    ? SW_SRC
    : SW_SRC.replace(`const CACHE_VERSION = '${APP_VERSION}'`, `const CACHE_VERSION = '${version}'`);
  const sandbox = {
    self: {
      location: { hostname: 'pressthink.org' },
      addEventListener: (type, fn) => { handlers[type] = fn; },
      skipWaiting: async () => {},
      clients: {
        claim: async () => {},
        matchAll: async () => windows.map(id => ({ id, type: 'window' })),
      },
    },
    caches: cacheStorage,
    location: { origin: ORIGIN, hostname: 'pressthink.org' },
    URL,
    Request,
    Response,
    fetch: fetchImpl,
    console: { log: () => {}, warn: () => {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return handlers;
}

async function activate(handlers) {
  let pending;
  handlers.activate({ waitUntil(p) { pending = p; } });
  await pending;
}

async function fetchThrough(handlers, request) {
  let response;
  const lifetimes = [];
  handlers.fetch({
    request,
    respondWith(p) { response = p; },
    waitUntil(p) { lifetimes.push(p); },
  });
  const result = await response;
  await Promise.all(lifetimes);
  return result;
}

const oldModuleUrl = `${ORIGIN}${BASE}/frontend/desktop/DesktopShell.js?v=${OLD_VERSION}`;
const newBytes = () => new Response('current release module');

// Seed the cache layout an old release leaves behind: its static and data
// caches, plus a static cache from a release before it.
function seedPreviousRelease(cacheStorage) {
  const oldStatic = new Map([[oldModuleUrl, new Response('previous release module')]]);
  cacheStorage.stores.set(`jrda-cache-${OLD_VERSION}`, oldStatic);
  cacheStorage.stores.set(`jrda-data-${OLD_VERSION}`, new Map());
  cacheStorage.stores.set('jrda-cache-2.9.0', new Map());
}

describe('service worker release handoff', () => {
  it('keeps the previous static cache while a window from before activation is open', async () => {
    const cacheStorage = createCacheStorage();
    seedPreviousRelease(cacheStorage);
    const windows = ['old-tab'];
    let networkFetches = 0;
    const handlers = loadSW({
      cacheStorage,
      windows,
      fetchImpl: async () => { networkFetches += 1; return newBytes(); },
    });

    await activate(handlers);

    assert.equal(cacheStorage.stores.has(`jrda-cache-${OLD_VERSION}`), true,
      'the previous release cache must survive while its window is open');
    assert.equal(cacheStorage.stores.has('jrda-cache-2.9.0'), false,
      'only the newest previous release is retained');
    assert.equal(cacheStorage.stores.has(`jrda-data-${OLD_VERSION}`), false,
      'data URLs are unversioned, so the old data cache is not needed');

    const response = await fetchThrough(handlers, new Request(oldModuleUrl));
    assert.equal(await response.text(), 'previous release module');
    assert.equal(networkFetches, 0);
  });

  it('never stores another release\'s network bytes under the old key', async () => {
    const cacheStorage = createCacheStorage();
    const handlers = loadSW({
      cacheStorage,
      windows: ['old-tab'],
      fetchImpl: async () => newBytes(),
    });
    await activate(handlers);

    const response = await fetchThrough(handlers, new Request(oldModuleUrl));
    assert.equal(await response.text(), 'current release module');
    assert.equal(await cacheStorage.match(oldModuleUrl), undefined,
      'new bytes cached under the old ?v= key would keep the old page mixed after a refetch');
  });

  it('deletes the retained cache once no window from before activation remains', async () => {
    const cacheStorage = createCacheStorage();
    seedPreviousRelease(cacheStorage);
    const windows = ['old-tab'];
    const handlers = loadSW({
      cacheStorage,
      windows,
      fetchImpl: async () => new Response('<!doctype html>'),
    });
    await activate(handlers);

    const navigation = { url: `${ORIGIN}${BASE}/`, mode: 'navigate' };
    windows.splice(0, windows.length, 'old-tab', 'new-tab');
    await fetchThrough(handlers, navigation);
    assert.equal(cacheStorage.stores.has(`jrda-cache-${OLD_VERSION}`), true,
      'the old window is still open');

    windows.splice(0, windows.length, 'new-tab');
    await fetchThrough(handlers, navigation);
    assert.equal(cacheStorage.stores.has(`jrda-cache-${OLD_VERSION}`), false,
      'the retained cache must go once its windows have closed');
  });

  it('deletes every previous cache at activation when no window is open', async () => {
    const cacheStorage = createCacheStorage();
    seedPreviousRelease(cacheStorage);
    const handlers = loadSW({ cacheStorage, windows: [], fetchImpl: async () => newBytes() });
    await activate(handlers);

    assert.deepEqual(
      [...cacheStorage.stores.keys()].filter(name => name.endsWith(OLD_VERSION) || name.endsWith('2.9.0')),
      [],
    );
  });

  it('still caches current-release assets under their own keys', async () => {
    const cacheStorage = createCacheStorage();
    const handlers = loadSW({ cacheStorage, windows: [], fetchImpl: async () => newBytes() });
    await activate(handlers);

    const currentUrl = `${ORIGIN}${BASE}/frontend/desktop/DesktopShell.js?v=${APP_VERSION}`;
    await fetchThrough(handlers, new Request(currentUrl));
    assert.equal(cacheStorage.stores.get(`jrda-cache-${APP_VERSION}`)?.has(currentUrl), true);
  });
});
