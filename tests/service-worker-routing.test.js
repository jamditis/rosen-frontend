/**
 * Service worker routing, precache, and put-safety tests (#274).
 *
 * Three bugs this pins:
 *   1. index.html was served cache-first (isStaticAsset matched '.html'), so a
 *      returning visitor kept the old page after a deploy and never saw the new
 *      ?v= import strings. HTML/navigations must be network-first.
 *   2. The install handler never pre-cached any data file (DATA_URLS was
 *      declared but unused), so the core data the app loads on every visit was
 *      cold on a return visit. Install must warm archive-core.json.
 *   3. cache.put was called bare (no await/catch), so a quota error threw into
 *      an unhandled rejection. Puts must go through a helper that swallows the
 *      error.
 *
 * sw.js is a classic worker (it cannot be `import`ed). We load its source into
 * a vm context with a minimal fake `self`/`caches`/`console`, which exposes its
 * top-level function declarations and lets us invoke the captured install
 * handler against a mock cache -- real behaviour, not a regex over the source.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'frontend', 'sw.js'), 'utf8');
const APP_VERSION = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8'),
).version;

/**
 * Run sw.js in a sandbox shaped like a production deploy. Returns the sandbox
 * (with the SW's top-level functions attached), the captured event handlers,
 * and the list of URLs the install handler tried to cache.add.
 */
function loadSW(hostname = 'pressthink.org', {
  cacheMatch = async () => null,
  cachePut = async () => {},
  fetchImpl = async () => { throw new Error('offline'); },
} = {}) {
  const handlers = {};
  const added = [];
  const fakeCache = {
    add: async (url) => { added.push(String(url)); },
    addAll: async (urls) => { urls.forEach(u => added.push(String(u))); },
    put: cachePut,
    match: cacheMatch,
  };
  const sandbox = {
    self: {
      location: { hostname },
      addEventListener: (type, fn) => { handlers[type] = fn; },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches: {
      open: async () => fakeCache,
      keys: async () => [],
      delete: async () => true,
    },
    location: { origin: `https://${hostname}`, hostname },
    URL,
    Response,
    fetch: fetchImpl,
    console: { log: () => {}, warn: () => {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(SW_SRC, sandbox);
  return { sandbox, handlers, added };
}

const BASE = '/j/rosen-archive';

describe('service worker request classification (#274)', () => {
  const { sandbox } = loadSW();

  it('does NOT treat index.html as a cache-first static asset', () => {
    // The bug: '.html' was in isStaticAsset, so the page was served stale.
    assert.equal(sandbox.isStaticAsset(`${BASE}/index.html`), false);
  });

  it('still treats versioned JS, CSS, and the self-hosted query runtime as static assets', () => {
    assert.equal(sandbox.isStaticAsset(`${BASE}/frontend/App.js`), true);
    assert.equal(sandbox.isStaticAsset(`${BASE}/frontend/dist/tailwind.css`), true);
    assert.equal(sandbox.isStaticAsset(`${BASE}/frontend/vendor/sql-wasm-1.10.3.wasm`), true);
  });

  it('treats a top-level navigation as an HTML request', () => {
    assert.equal(sandbox.isHtmlRequest({ mode: 'navigate' }, `${BASE}/`), true);
  });

  it('treats any .html path as an HTML request', () => {
    assert.equal(sandbox.isHtmlRequest({ mode: 'cors' }, `${BASE}/dissertation/index.html`), true);
  });

  it('does not treat a JS sub-resource as an HTML request', () => {
    assert.equal(sandbox.isHtmlRequest({ mode: 'cors' }, `${BASE}/frontend/App.js`), false);
  });

  it('recognizes root and index query deep links as SPA navigations', () => {
    assert.equal(sandbox.isSpaNavigation({
      mode: 'navigate',
      url: `https://pressthink.org${BASE}/?record=RECORD-00903`,
    }), true);
    assert.equal(sandbox.isSpaNavigation({
      mode: 'navigate',
      url: `https://pressthink.org${BASE}/index.html?q=public`,
    }), true);
  });

  it('does not classify standalone controlled pages as SPA navigations', () => {
    for (const path of ['/faq/', '/dissertation/reader/', '/features/winer-method/']) {
      assert.equal(sandbox.isSpaNavigation({
        mode: 'navigate',
        url: `https://pressthink.org${BASE}${path}`,
      }), false, path);
    }
  });

  it('still classifies archive JSON under /data/ as a data file', () => {
    assert.equal(sandbox.isDataFile(`${BASE}/data/archive-core.json`), true);
    assert.equal(sandbox.isDataFile(`${BASE}/frontend/App.js`), false);
  });
});

// Invoke the captured install handler and await the promise it hands to
// event.waitUntil (the handler itself returns undefined, so we must capture the
// waitUntil arg or the precache is still pending when we assert).
async function runInstall(handlers) {
  assert.ok(handlers.install, 'no install handler registered');
  let pending;
  handlers.install({ waitUntil: (p) => { pending = p; } });
  await pending;
}

async function runMessage(handlers, data) {
  assert.ok(handlers.message, 'no message handler registered');
  let pending;
  handlers.message({ data, waitUntil: (p) => { pending = p; } });
  if (pending) await pending;
}

describe('service worker install precache (#274)', () => {
  it('keeps browser-serialized IPv6 loopback on local preview paths', async () => {
    const { handlers, added } = loadSW('[::1]');
    await runInstall(handlers);
    assert.ok(added.includes('/index.html'));
    assert.ok(added.includes(`/frontend/App.js?v=${APP_VERSION}`));
    assert.ok(added.includes('/data/archive-core.json'));
    assert.equal(added.some((url) => url.startsWith('/j/rosen-archive/')), false);
  });

  it('warms archive-core.json on install', async () => {
    const { handlers, added } = loadSW();
    await runInstall(handlers);
    assert.ok(
      added.some(u => /\/data\/archive-core\.json$/.test(u)),
      'install did not pre-cache archive-core.json'
    );
  });

  it('does not pre-cache the heavy on-demand data files on install', async () => {
    const { handlers, added } = loadSW();
    await runInstall(handlers);
    assert.ok(!added.some(u => /archive-details\.json$/.test(u)), 'details should stay on-demand');
    assert.ok(!added.some(u => /archive-entities\.json$/.test(u)), 'entities should stay on-demand');
  });

  it('still pre-caches the app shell (index.html + entry JS)', async () => {
    const { handlers, added } = loadSW();
    await runInstall(handlers);
    assert.ok(added.some(u => /\/index\.html$/.test(u)), 'index.html missing from precache');
    assert.ok(added.some(u => /\/index\.js\?v=\d+\.\d+\.\d+$/.test(u)), 'index.js missing from precache');
  });

  it('pre-caches module and stylesheet assets under their exact release URLs', async () => {
    const { handlers, added } = loadSW();
    await runInstall(handlers);

    assert.ok(
      added.includes(`${BASE}/frontend/App.js?v=${APP_VERSION}`),
      'App.js must be cached under the same versioned URL requested by the page',
    );
    assert.ok(
      added.includes(`${BASE}/frontend/services/viewState.js?v=${APP_VERSION}`),
      'viewState.js must be cached under the same versioned URL requested by App.js',
    );
    assert.ok(
      added.includes(`${BASE}/frontend/services/privacyRoute.js?v=${APP_VERSION}`),
      'the privacy routing module must be available in the offline app shell',
    );
    assert.equal(added.includes(`${BASE}/frontend/App.js`), false);
    assert.equal(added.includes(`${BASE}/frontend/services/viewState.js`), false);
  });

  it('pre-caches the real document root in local preview', async () => {
    const { handlers, added } = loadSW('127.0.0.1');
    await runInstall(handlers);
    assert.ok(added.includes('/'), 'local site root missing from precache');
    assert.ok(added.includes('/index.html'), 'local root index missing from precache');
    assert.ok(!added.includes('/frontend/index.html'), 'nonexistent frontend index must not be cached');
  });

  for (const [surface, host, prefix] of [
    ['GitHub Pages', 'jamditis.github.io', '/rosen-frontend'],
    ['production', 'pressthink.org', '/j/rosen-archive'],
  ]) {
    it(`keeps every ${surface} install entry inside the deployed subtree`, async () => {
      const { handlers, added } = loadSW(host);
      await runInstall(handlers);
      assert.ok(added.length > 0, `${surface} install manifest is empty`);
      assert.ok(
        added.every(url => url.startsWith(`${prefix}/`)),
        `install entry escaped ${prefix}/: ${added.find(url => !url.startsWith(`${prefix}/`))}`
      );
      assert.ok(added.includes(`${prefix}/`), `${surface} app root missing from precache`);
    });
  }
});

describe('service worker release-boundary module loading', () => {
  it('does not satisfy a new release URL with a cached module from the previous release', async () => {
    const staleModule = { source: 'previous release' };
    const freshModule = {
      ok: true,
      source: 'current release',
      clone() { return this; },
    };
    let networkFetches = 0;
    const { sandbox } = loadSW('pressthink.org', {
      cacheMatch: async (_request, options) => options?.ignoreSearch ? staleModule : null,
      fetchImpl: async () => {
        networkFetches += 1;
        return freshModule;
      },
    });

    const request = {
      url: `https://pressthink.org${BASE}/frontend/App.js?v=${APP_VERSION}`,
    };
    const response = await sandbox.cacheFirst(request, 'previous-release-cache');

    assert.equal(response, freshModule);
    assert.equal(networkFetches, 1);
  });

  it('keeps an uncached static response pending until its cache write completes', async () => {
    let finishPut;
    let putStarted = false;
    const putPending = new Promise(resolve => { finishPut = resolve; });
    const freshModule = {
      ok: true,
      clone() { return this; },
    };
    const { sandbox } = loadSW('pressthink.org', {
      cachePut: async () => {
        putStarted = true;
        await putPending;
      },
      fetchImpl: async () => freshModule,
    });

    let responseSettled = false;
    const responsePending = sandbox.cacheFirst({
      url: `https://pressthink.org${BASE}/data/archive-embeddings.bin?v=${APP_VERSION}`,
    }, 'test-cache').then(response => {
      responseSettled = true;
      return response;
    });
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(putStarted, true);
    assert.equal(responseSettled, false);
    finishPut();
    assert.equal(await responsePending, freshModule);
  });
});

describe('service worker embeddings sidecar cache lifetime', () => {
  it('keeps the first sidecar cache write alive through the fetch event', async () => {
    let finishPut;
    let putStarted = false;
    const putPending = new Promise(resolve => { finishPut = resolve; });
    const freshIndex = {
      ok: true,
      clone() { return this; },
    };
    const { handlers } = loadSW('pressthink.org', {
      cachePut: async () => {
        putStarted = true;
        await putPending;
      },
      fetchImpl: async () => freshIndex,
    });
    const event = {
      request: {
        mode: 'cors',
        url: `https://pressthink.org${BASE}/data/archive-embeddings.json?v=${APP_VERSION}`,
      },
      lifetimes: [],
      respondWith(promise) { this.responsePending = promise; },
      waitUntil(promise) { this.lifetimes.push(promise); },
    };

    handlers.fetch(event);
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(putStarted, true);
    assert.equal(event.lifetimes.length, 1);
    let lifetimeSettled = false;
    event.lifetimes[0].then(() => { lifetimeSettled = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(lifetimeSettled, false);

    finishPut();
    assert.equal(await event.responsePending, freshIndex);
    await event.lifetimes[0];
  });
});

describe('service worker offline navigation fallback', () => {
  it('uses the cached app root for an uncached SPA query deep link', async () => {
    const appRoot = { source: 'cached app root' };
    const matched = [];
    const { sandbox } = loadSW('pressthink.org', {
      cacheMatch: async (request) => {
        matched.push(request);
        return request === `${BASE}/` ? appRoot : null;
      },
    });

    const response = await sandbox.networkFirst({
      mode: 'navigate',
      url: `https://pressthink.org${BASE}/?record=RECORD-00903`,
    }, 'test-cache');

    assert.equal(response, appRoot);
    assert.equal(matched.at(-1), `${BASE}/`);
  });

  it('returns unavailable instead of substituting the SPA for an uncached standalone page', async () => {
    const matched = [];
    const { sandbox } = loadSW('pressthink.org', {
      cacheMatch: async (request) => {
        matched.push(request);
        return request === `${BASE}/` ? { source: 'wrong app root' } : null;
      },
    });

    const response = await sandbox.networkFirst({
      mode: 'navigate',
      url: `https://pressthink.org${BASE}/faq/`,
    }, 'test-cache');

    assert.equal(response.status, 503);
    assert.equal(matched.includes(`${BASE}/`), false);
  });
});

describe('service worker optional desktop cache', () => {
  for (const [surface, host, prefix] of [
    ['GitHub Pages', 'jamditis.github.io', '/rosen-frontend'],
    ['production', 'pressthink.org', '/j/rosen-archive'],
  ]) {
    it(`warms exactly nine versioned desktop assets under the ${surface} subtree`, async () => {
      const { handlers, added } = loadSW(host);
      await runMessage(handlers, { action: 'cacheDesktop' });

      assert.equal(added.length, 9);
      assert.equal(new Set(added).size, 9);
      assert.ok(added.every(url => url.startsWith(`${prefix}/frontend/desktop/`)));
      assert.ok(added.every(url => url.endsWith(`?v=${APP_VERSION}`)));
    });
  }
});

describe('service worker safePut (#274)', () => {
  it('returns true when the put succeeds', async () => {
    const { sandbox } = loadSW();
    const ok = await sandbox.safePut({ put: async () => {} }, { url: 'u' }, {});
    assert.equal(ok, true);
  });

  it('swallows a quota error instead of throwing', async () => {
    const { sandbox } = loadSW();
    const result = await sandbox.safePut(
      { put: async () => { throw new Error('QuotaExceededError'); } },
      { url: 'u' },
      {}
    );
    assert.equal(result, false);
  });
});

describe('service worker structure (#274)', () => {
  it('keeps DATA_URLS as the SWR data manifest, including analytics (#338 contract)', () => {
    // DATA_URLS stays -- it is the stale-while-revalidate manifest and the #338
    // analytics lazy-load test asserts archive-analytics.json appears in sw.js.
    assert.match(SW_SRC, /const\s+DATA_URLS\b/);
    assert.match(SW_SRC, /archive-analytics\.json/);
  });

  it('does not contain duplicate data-manifest entries', () => {
    const manifest = SW_SRC.slice(
      SW_SRC.indexOf('const DATA_URLS'),
      SW_SRC.indexOf('const INSTALL_PRECACHE_DATA'),
    );
    const entries = [...manifest.matchAll(/`\$\{DATA_PATH\}\/([^`]+)`/g)].map(match => match[1]);
    assert.ok(entries.length > 0, 'DATA_URLS manifest is empty');
    assert.equal(new Set(entries).size, entries.length);
  });

  it('derives the install precache as a bounded subset of DATA_URLS', () => {
    assert.match(SW_SRC, /INSTALL_PRECACHE_DATA\s*=\s*DATA_URLS\.filter/);
  });

  it('routes HTML/navigation requests to networkFirst in the fetch handler', () => {
    assert.match(SW_SRC, /isHtmlRequest\([^)]*\)[\s\S]{0,80}networkFirst/);
  });

  it('falls back from query-string navigations to the cached app root', () => {
    const networkFirstSource = SW_SRC.slice(SW_SRC.indexOf('async function networkFirst'));
    assert.match(networkFirstSource, /isSpaNavigation\(request\)/);
    assert.match(networkFirstSource, /cache\.match\(`\$\{SITE_ROOT\}\/`\)/);
  });
});
