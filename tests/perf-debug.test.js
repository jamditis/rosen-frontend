/**
 * Perf-debug instrumentation tests (#280)
 *
 * Covers the opt-in Web Vitals + data-load timing added behind the
 * `localStorage.jrda_debug === '1'` flag (the #170 toggle):
 *   - perfMark/perfMeasure no-op safely when the flag is off and never throw,
 *     so they cannot break fetchCoreData's fail-loud path (#290);
 *   - index.js gates web-vitals and the measure observer behind the flag and
 *     imports web-vitals dynamically (not loaded in production);
 *   - App.js brackets the fetchCoreData call with data:start/data:end marks
 *     and a data:load measure.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');

describe('perfMark helper safety', () => {
  it('exports perfMark and perfMeasure as functions', async () => {
    const mod = await import('../frontend/utils/perfMark.js');
    assert.equal(typeof mod.perfMark, 'function');
    assert.equal(typeof mod.perfMeasure, 'function');
  });

  it('no-ops without throwing when the debug flag is absent', async () => {
    // In the test runner there is no localStorage.jrda_debug, so the helper is
    // disabled. The contract that matters: calling it must never throw into the
    // caller -- it wraps the critical data-load path.
    const { perfMark, perfMeasure } = await import('../frontend/utils/perfMark.js');
    assert.doesNotThrow(() => perfMark('data:start'));
    assert.doesNotThrow(() => perfMeasure('data:load', 'data:start', 'data:end'));
    assert.equal(perfMark('x'), undefined);
    assert.equal(perfMeasure('x', 'a', 'b'), undefined);
  });

  it('does not throw even when given a measure with missing marks', async () => {
    const { perfMeasure } = await import('../frontend/utils/perfMark.js');
    assert.doesNotThrow(() => perfMeasure('data:load', 'nope-start', 'nope-end'));
  });
});

describe('index.js perf instrumentation', () => {
  const src = fs.readFileSync(path.join(frontendDir, 'index.js'), 'utf-8');

  it('gates instrumentation behind the jrda_debug flag', () => {
    assert.match(src, /jrda_debug/);
    assert.match(src, /if \(perfDebugEnabled\(\)\)/);
  });

  it('imports web-vitals dynamically so production never loads it', () => {
    // A dynamic import inside the flag block, not a top-level static import.
    assert.match(src, /import\(['"]https:\/\/esm\.sh\/web-vitals@/);
    assert.doesNotMatch(src, /^import .*web-vitals/m);
  });

  it('registers a PerformanceObserver for the data-load measure', () => {
    assert.match(src, /new PerformanceObserver/);
    assert.match(src, /type: 'measure'/);
  });
});

describe('App.js data-load marks', () => {
  const src = fs.readFileSync(path.join(frontendDir, 'App.js'), 'utf-8');

  it('imports the versioned perfMark helper', () => {
    assert.match(src, /from '\.\/utils\/perfMark\.js\?v=\d+\.\d+\.\d+'/);
  });

  it('brackets fetchCoreData with data:start/data:end and a data:load measure', () => {
    assert.match(src, /perfMark\('data:start'\)/);
    assert.match(src, /perfMark\('data:end'\)/);
    assert.match(src, /perfMeasure\('data:load', 'data:start', 'data:end'\)/);
    // start mark precedes the fetch; end mark + measure land after it resolves.
    assert.ok(src.indexOf("perfMark('data:start')") < src.indexOf('fetchCoreData()'));
    assert.ok(src.indexOf('fetchCoreData()') < src.indexOf("perfMark('data:end')"));
  });
});
