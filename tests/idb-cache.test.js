/**
 * IndexedDB core-data cache tests (#275)
 *
 * Two layers:
 *  1. Runtime fail-safe contract of idbCache.js — the load-bearing property.
 *     A throw from this module would take the whole app down (archiveService
 *     imports it statically), so every op must resolve to a sentinel
 *     (null/false) when IndexedDB is missing or the idb-keyval import fails.
 *     Both branches are reachable in plain Node: idb-keyval is not a Node
 *     dependency, so import('idb-keyval') always rejects here.
 *  2. Static-text wiring checks — the integration with archiveService,
 *     index.html, and sw.js can't run without a browser, so (matching
 *     fetch-error-handling.test.js) we assert the wiring from source text.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const idbCache = await import('../frontend/services/idbCache.js');

// ============================================
// Runtime fail-safe contract
// ============================================

describe('idbCache fail-safe contract (#275)', () => {
  it('returns sentinels (never throws) when IndexedDB is absent', async () => {
    delete globalThis.indexedDB;
    await assert.doesNotReject(idbCache.idbGet('archive-core'));
    assert.equal(await idbCache.idbGet('archive-core'), null);
    assert.equal(await idbCache.idbSet('archive-core', { a: 1 }), false);
    assert.equal(await idbCache.idbClear(), false);
  });

  it('returns sentinels (never throws) when the idb-keyval import fails', async () => {
    // Make hasIndexedDB() pass so the code reaches the dynamic import, which
    // rejects in Node (idb-keyval is loaded from the esm.sh import map in the
    // browser, and is not installed here) — the same path a CDN outage hits.
    globalThis.indexedDB = {};
    try {
      assert.equal(await idbCache.idbGet('archive-core'), null);
      assert.equal(await idbCache.idbSet('archive-core', { a: 1 }), false);
      assert.equal(await idbCache.idbClear(), false);
    } finally {
      delete globalThis.indexedDB;
    }
  });

  it('uses a dedicated database/store and a dynamic import', () => {
    const src = fs.readFileSync(
      path.join(rootDir, 'frontend', 'services', 'idbCache.js'), 'utf-8');
    assert.match(src, /import\(['"]idb-keyval['"]\)/, 'must lazily import idb-keyval');
    assert.match(src, /createStore\(/, 'must namespace into a dedicated store');
    for (const name of ['idbGet', 'idbSet', 'idbClear']) {
      assert.match(src, new RegExp(`export const ${name}\\b`), `must export ${name}`);
    }
  });
});

// ============================================
// idb-keyval import is bounded by a timeout (#392)
// ============================================

describe('idbCache import timeout (#392)', () => {
  it('withTimeout resolves with the thunk value when it settles in time', async () => {
    assert.equal(await idbCache.withTimeout(() => Promise.resolve('ok'), 1000), 'ok');
  });

  it('withTimeout rejects with the thunk error (not a timeout) when it rejects in time', async () => {
    const boom = new Error('boom');
    await assert.rejects(
      idbCache.withTimeout(() => Promise.reject(boom), 1000),
      (err) => err === boom,
    );
  });

  it('withTimeout rejects with a timeout error when the thunk never settles', async () => {
    await assert.rejects(
      idbCache.withTimeout(() => new Promise(() => {}), 20),
      /timed out/,
    );
  });

  it('a settle arriving after the timeout is a harmless no-op', async () => {
    let resolveLate;
    const late = new Promise((r) => { resolveLate = r; });
    const raced = idbCache.withTimeout(() => late, 20);
    await assert.rejects(raced, /timed out/);
    // Resolving after the race already rejected must not double-settle or throw.
    resolveLate('too late');
    await new Promise((r) => setTimeout(r, 10));
  });

  it('getKeyval races the idb-keyval import against a positive timeout', () => {
    const src = fs.readFileSync(
      path.join(rootDir, 'frontend', 'services', 'idbCache.js'), 'utf-8');
    assert.match(
      src,
      /withTimeout\(\s*\(\)\s*=>\s*import\(['"]idb-keyval['"]\)/,
      'getKeyval must race the idb-keyval import, not await it bare',
    );
    const m = src.match(/IMPORT_TIMEOUT_MS\s*=\s*(\d+)/);
    assert.ok(m, 'must define a numeric IMPORT_TIMEOUT_MS');
    assert.ok(Number(m[1]) > 0, 'IMPORT_TIMEOUT_MS must be positive');
  });
});

// ============================================
// archiveService wiring
// ============================================

describe('archiveService IndexedDB wiring (#275)', () => {
  const src = fs.readFileSync(
    path.join(rootDir, 'frontend', 'services', 'archiveService.js'), 'utf-8');

  it('imports the cache helpers with the versioned specifier', () => {
    assert.match(
      src,
      /import \{ idbGet, idbSet, idbClear \} from '\.\/idbCache\.js\?v=\d+\.\d+\.\d+'/,
    );
  });

  it('fetchCoreData reads IndexedDB before Web Storage and before fetch', () => {
    const start = src.indexOf('export const fetchCoreData');
    assert.ok(start >= 0, 'fetchCoreData not found');
    // Body runs to the next exported binding.
    const end = src.indexOf('\nexport ', start + 1);
    const body = src.slice(start, end === -1 ? undefined : end);

    const idbGetIdx = body.indexOf('await idbGet(');
    const webIdx = body.indexOf('getCachedData(');
    const fetchIdx = body.indexOf('await fetch(dataUrl)');

    assert.ok(idbGetIdx >= 0, 'fetchCoreData must read IndexedDB');
    assert.ok(webIdx > idbGetIdx, 'IndexedDB read must precede the Web Storage read');
    assert.ok(fetchIdx > idbGetIdx, 'IndexedDB read must precede the network fetch');
  });

  it('fetchCoreData writes IndexedDB first, Web Storage only as fallback', () => {
    const start = src.indexOf('export const fetchCoreData');
    const end = src.indexOf('\nexport ', start + 1);
    const body = src.slice(start, end === -1 ? undefined : end);

    // The successful-fetch write path guards setCachedData behind a failed
    // IndexedDB write, so a capable browser skips the redundant ~13 MB
    // sessionStorage write.
    assert.match(body, /const storedInIdb = await idbSet\(/);
    assert.match(body, /if \(!storedInIdb\) \{\s*setCachedData\(/);
  });

  it('clearArchiveCache also clears the IndexedDB store', () => {
    const start = src.indexOf('export const clearArchiveCache');
    const end = src.indexOf('\nexport ', start + 1);
    const body = src.slice(start, end === -1 ? undefined : end);
    assert.match(body, /idbClear\(\)/, 'clearArchiveCache must drop the IndexedDB store');
  });
});

// ============================================
// import map + service-worker precache
// ============================================

describe('idb-keyval delivery wiring (#275)', () => {
  it('index.html import map pins idb-keyval', () => {
    const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
    assert.match(html, /"idb-keyval":\s*"https:\/\/esm\.sh\/idb-keyval@\d+\.\d+\.\d+"/);
  });

  it('the service worker precaches idbCache.js through the environment-aware shell manifest', () => {
    const sw = fs.readFileSync(path.join(rootDir, 'frontend', 'sw.js'), 'utf-8');
    assert.match(sw, /['"]services\/idbCache\.js['"]/);
    assert.match(sw, /APP_SHELL_FRONTEND_FILES\.map\(file\s*=>\s*`\$\{FRONTEND_PATH\}\/\$\{file\}\?v=\$\{CACHE_VERSION\}`\)/);
  });
});
