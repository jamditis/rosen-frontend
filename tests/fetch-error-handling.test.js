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
  it('dataviz.html checks response.ok before reading the CSV body', () => {
    const file = path.join(rootDir, 'tools', 'active', 'dataviz', 'dataviz.html');
    const src = fs.readFileSync(file, 'utf-8');

    // Locate the fetchData() function body and assert the ok-check appears
    // between `fetch(csvUrl)` and `response.text()`. Doing this with a
    // structured search instead of a brittle regex on the whole file.
    const fetchIdx = src.indexOf('await fetch(csvUrl)');
    assert.ok(fetchIdx > 0, 'expected `await fetch(csvUrl)` in dataviz.html');
    const textIdx = src.indexOf('response.text()', fetchIdx);
    assert.ok(textIdx > fetchIdx, 'expected `response.text()` to follow fetch(csvUrl)');

    const between = src.slice(fetchIdx, textIdx);
    assert.match(
      between,
      /response\.ok/,
      'dataviz.html must check `response.ok` between fetch(csvUrl) and response.text()'
    );
  });

  it('archiveService.fetchCoreData awaits checkVersion before reading the cache', () => {
    const file = path.join(rootDir, 'frontend', 'services', 'archiveService.js');
    const src = fs.readFileSync(file, 'utf-8');

    // Find the fetchCoreData definition; verify `await checkVersion()`
    // appears before the first `getCachedData(` call inside it.
    const fnIdx = src.indexOf('export const fetchCoreData');
    assert.ok(fnIdx > 0, 'expected `export const fetchCoreData` in archiveService.js');

    // Body is everything up to the next top-level `export ` (the next
    // exported binding starts a sibling definition).
    const bodyEnd = src.indexOf('\nexport ', fnIdx + 1);
    const body = src.slice(fnIdx, bodyEnd > 0 ? bodyEnd : src.length);

    const cacheReadIdx = body.indexOf('getCachedData(');
    assert.ok(cacheReadIdx > 0, 'expected getCachedData(...) call inside fetchCoreData');

    const beforeCacheRead = body.slice(0, cacheReadIdx);
    assert.match(
      beforeCacheRead,
      /await\s+checkVersion\s*\(/,
      'fetchCoreData must `await checkVersion()` before reading the cache'
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
    assert.ok(defIdx > 0, 'expected `const checkVersion` in archiveService.js');
    const defEnd = src.indexOf('\n};', defIdx);
    const def = src.slice(defIdx, defEnd > 0 ? defEnd : src.length);

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
