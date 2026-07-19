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

/**
 * Run sw.js in a sandbox shaped like a production deploy. Returns the sandbox
 * (with the SW's top-level functions attached), the captured event handlers,
 * and the list of URLs the install handler tried to cache.add.
 */
function loadSW(hostname = 'pressthink.org') {
  const handlers = {};
  const added = [];
  const fakeCache = {
    add: async (url) => { added.push(String(url)); },
    addAll: async (urls) => { urls.forEach(u => added.push(String(u))); },
    put: async () => {},
    match: async () => null,
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

describe('service worker install precache (#274)', () => {
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
    assert.ok(added.some(u => /\/index\.js$/.test(u)), 'index.js missing from precache');
  });

  it('pre-caches the real document root in local preview', async () => {
    const { handlers, added } = loadSW('127.0.0.1');
    await runInstall(handlers);
    assert.ok(added.includes('/'), 'local site root missing from precache');
    assert.ok(added.includes('/index.html'), 'local root index missing from precache');
    assert.ok(!added.includes('/frontend/index.html'), 'nonexistent frontend index must not be cached');
  });
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

  it('derives the install precache as a bounded subset of DATA_URLS', () => {
    assert.match(SW_SRC, /INSTALL_PRECACHE_DATA\s*=\s*DATA_URLS\.filter/);
  });

  it('routes HTML/navigation requests to networkFirst in the fetch handler', () => {
    assert.match(SW_SRC, /isHtmlRequest\([^)]*\)[\s\S]{0,80}networkFirst/);
  });

  it('falls back from query-string navigations to the cached app root', () => {
    const networkFirstSource = SW_SRC.slice(SW_SRC.indexOf('async function networkFirst'));
    assert.match(networkFirstSource, /request\.mode === 'navigate'/);
    assert.match(networkFirstSource, /cache\.match\(`\$\{SITE_ROOT\}\/`\)/);
  });
});
