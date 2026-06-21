/**
 * Static-text regression tests for fetch error handling (#171)
 *
 * Real runtime tests would need jsdom + fetch/localStorage mocks. The bugs
 * we're guarding against are simple enough that a source-text check catches
 * the regression without standing up a browser harness.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

describe('fetch error handling (#171)', () => {
  it('dataviz.html checks response.ok before reading the core JSON body', () => {
    const file = path.join(rootDir, 'tools', 'active', 'dataviz', 'dataviz.html');
    const src = fs.readFileSync(file, 'utf-8');

    // The dashboard now loads the live archive JSON (CORE_URL) instead of the
    // old Google Sheets CSV. Assert the ok-check appears between the core
    // fetch and the `coreRes.json()` body read, so a non-OK response (CDN
    // outage, 404 deploy gap) surfaces as an error instead of throwing on a
    // non-JSON body. Structured search instead of a brittle whole-file regex.
    const fetchIdx = src.indexOf('fetch(CORE_URL)');
    assert.ok(fetchIdx >= 0, 'expected `fetch(CORE_URL)` in dataviz.html');
    const jsonIdx = src.indexOf('coreRes.json()', fetchIdx);
    assert.ok(jsonIdx > fetchIdx, 'expected `coreRes.json()` to follow fetch(CORE_URL)');

    const between = src.slice(fetchIdx, jsonIdx);
    assert.match(
      between,
      /coreRes\.ok/,
      'dataviz.html must check `coreRes.ok` between fetch(CORE_URL) and coreRes.json()'
    );
  });

  it('archiveService.fetchCoreData awaits checkVersion before reading the cache', () => {
    const file = path.join(rootDir, 'frontend', 'services', 'archiveService.js');
    const src = fs.readFileSync(file, 'utf-8');

    // Find the fetchCoreData definition; verify `await checkVersion()`
    // appears before the first `getCachedData(` call inside it.
    const fnIdx = src.indexOf('export const fetchCoreData');
    assert.ok(fnIdx >= 0, 'expected `export const fetchCoreData` in archiveService.js');

    // Body is everything up to the next top-level `export ` (the next
    // exported binding starts a sibling definition).
    const bodyEnd = src.indexOf('\nexport ', fnIdx + 1);
    const body = src.slice(fnIdx, bodyEnd >= 0 ? bodyEnd : src.length);

    const cacheReadIdx = body.indexOf('getCachedData(');
    assert.ok(cacheReadIdx >= 0, 'expected getCachedData(...) call inside fetchCoreData');

    const beforeCacheRead = body.slice(0, cacheReadIdx);
    assert.match(
      beforeCacheRead,
      /await\s+raceTimeout\s*\(\s*checkVersion\s*\(\s*\)\s*,/,
      'fetchCoreData must `await` a bounded `checkVersion()` (raceTimeout with a timeout arg) before reading the cache so a slow version.json cannot stall the load'
    );
  });

  it('checkVersion releases its memoised Promise on settle so a hung check does not poison future calls', () => {
    const file = path.join(rootDir, 'frontend', 'services', 'archiveService.js');
    const src = fs.readFileSync(file, 'utf-8');

    const defIdx = src.indexOf('const checkVersion');
    assert.ok(defIdx >= 0, 'expected `const checkVersion` in archiveService.js');
    const defEnd = src.indexOf('\n};', defIdx);
    const def = src.slice(defIdx, defEnd >= 0 ? defEnd : src.length);

    // After the Promise settles, clear versionCheckPromise so the next call
    // can retry. Without this a single hung version.json would freeze every
    // future load in the session.
    assert.match(
      def,
      /\.finally\s*\([^}]*versionCheckPromise\s*=\s*null/s,
      'checkVersion must reset versionCheckPromise on settle'
    );
  });

  it('checkVersion memoises its in-flight Promise to dedupe concurrent callers', () => {
    // The original implementation set a sync boolean before the await, so
    // a concurrent caller saw versionChecked=true and returned before the
    // cache-clear had landed. A Promise cache fixes this; the boolean
    // alone does not.
    const file = path.join(rootDir, 'frontend', 'services', 'archiveService.js');
    const src = fs.readFileSync(file, 'utf-8');

    const defIdx = src.indexOf('const checkVersion');
    assert.ok(defIdx >= 0, 'expected `const checkVersion` in archiveService.js');
    const defEnd = src.indexOf('\n};', defIdx);
    const def = src.slice(defIdx, defEnd >= 0 ? defEnd : src.length);

    // Either the function body returns/awaits a cached Promise variable,
    // OR it sets a sync flag AFTER the await (so concurrent callers can't
    // race past). Test the most direct form: a Promise cache.
    const hasPromiseCache =
      /versionCheckPromise|versionCheckInFlight|checkVersionPromise/.test(def);
    assert.ok(
      hasPromiseCache,
      'checkVersion must memoise the in-flight Promise (not just a sync boolean) so concurrent callers all await the same fetch'
    );
  });
});

describe('fetchCoreData failure propagation (#290)', () => {
  it('re-throws on fetch failure instead of masking it as a 1-record archive', () => {
    const file = path.join(rootDir, 'frontend', 'services', 'archiveService.js');
    const src = fs.readFileSync(file, 'utf-8');

    const fnIdx = src.indexOf('export const fetchCoreData');
    assert.ok(fnIdx >= 0, 'expected `export const fetchCoreData` in archiveService.js');
    const bodyEnd = src.indexOf('\nexport ', fnIdx + 1);
    const body = src.slice(fnIdx, bodyEnd >= 0 ? bodyEnd : src.length);

    // Inspect only the catch block — the try block legitimately throws on
    // !response.ok, which we want to propagate, not swallow.
    const catchIdx = body.indexOf('catch (error)');
    assert.ok(catchIdx >= 0, 'expected a `catch (error)` block in fetchCoreData');
    const catchBlock = body.slice(catchIdx);

    // Must propagate the failure so App.js's .catch can render its error state.
    assert.match(
      catchBlock,
      /throw\s+error/,
      'fetchCoreData must re-throw on failure so App.js renders its error state (#290)'
    );

    // Must NOT swallow it by returning a synthetic records fallback — that
    // ships visitors a near-empty archive labelled as the real one, hiding a
    // CDN/JSON/deploy outage from users and monitors alike.
    assert.doesNotMatch(
      catchBlock,
      /return\s*\{/,
      'fetchCoreData catch must not return a fallback object — it masks an outage as a 1-record archive (#290)'
    );
  });
});
