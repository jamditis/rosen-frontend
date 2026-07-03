/**
 * Tests for scripts/bump-version.mjs (#282).
 *
 * Each test drives the script against its own throwaway fixture tree (fresh per
 * test, so order and runner concurrency can't couple them) and the real repo
 * files are never touched. Proves the parts that are easy to get wrong: the
 * data-cache CACHE_VERSION stays put, build output is skipped, sw.js's
 * static-asset CACHE_VERSION moves in lockstep with the ?v= markers, and a
 * failed guardrail rolls the whole tree back.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { stampVersion, applyVersion, collectVersionedFiles } from '../scripts/bump-version.mjs';

let root;

function write(rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf-8');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bump-version-'));
  write('version.json', `${JSON.stringify({ version: '1.0.0', updated: '2026-01-01', cache_version: 'v9' }, null, 2)}\n`);
  write('index.html', '<script type="module" src="./frontend/App.js?v=1.0.0"></script>\n');
  write('frontend/App.js', "import { x } from './util.js?v=1.0.0';\n");
  write('frontend/components/Sidebar.js', "import './Item.js?v=1.0.0';\n");
  write('frontend/sw.js', "const CACHE_VERSION = '1.0.0';\nconst STATIC = [];\n");
  write('frontend/services/cacheConfig.js', "export const CACHE_VERSION = 'v9';\n");
  // Must be skipped: build output and dependencies.
  write('frontend/dist/bundle.js', "import './x.js?v=1.0.0';\n");
  write('frontend/node_modules/pkg/index.js', "import './y.js?v=1.0.0';\n");
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('stampVersion', () => {
  it('rewrites every ?v= marker and sw.js CACHE_VERSION to the target', () => {
    const { markers, changedFiles } = stampVersion(root, '2.3.4');

    assert.match(read('index.html'), /\?v=2\.3\.4/);
    assert.match(read('frontend/App.js'), /\?v=2\.3\.4/);
    assert.match(read('frontend/components/Sidebar.js'), /\?v=2\.3\.4/);
    assert.match(read('frontend/sw.js'), /const CACHE_VERSION = '2\.3\.4'/);

    // Four files changed: index.html + App.js + Sidebar.js (?v=) and sw.js
    // (CACHE_VERSION). Three carry a ?v= marker; sw.js does not. dist/ and
    // node_modules/ are excluded from the scan entirely.
    assert.strictEqual(changedFiles.length, 4);
    assert.strictEqual(markers, 3, `expected 3 markers scanned, got ${markers}`);
  });

  it('stamps the standalone faq/ page and its .js imports (#567)', () => {
    // faq/ is served outside the app bundle, so its own ?v= markers must be in
    // the bump surface or they drift while the app advances. This is the direct
    // guard that collectVersionedFiles walks faq/ (not only frontend/).
    write('faq/index.html', '<script type="module" src="./script.js?v=1.0.0"></script>\n');
    write('faq/script.js', "import { FAQ_ITEMS } from './data.js?v=1.0.0';\n");
    write('faq/data.js', 'export const FAQ_ITEMS = [];\n'); // data only; no import to stamp

    stampVersion(root, '2.3.4');

    assert.match(read('faq/index.html'), /src="\.\/script\.js\?v=2\.3\.4"/);
    assert.match(read('faq/script.js'), /'\.\/data\.js\?v=2\.3\.4'/);
  });

  it('leaves the data-cache CACHE_VERSION (cacheConfig.js) untouched', () => {
    stampVersion(root, '2.3.4');
    // cacheConfig's 'v9' is not semver, so the anchored sw.js regex can't match
    // it, and the file carries no ?v= marker to rewrite.
    assert.match(read('frontend/services/cacheConfig.js'), /CACHE_VERSION = 'v9'/);
  });

  it('skips build output (dist/) and dependencies (node_modules/)', () => {
    stampVersion(root, '2.3.4');
    assert.match(read('frontend/dist/bundle.js'), /\?v=1\.0\.0/);
    assert.match(read('frontend/node_modules/pkg/index.js'), /\?v=1\.0\.0/);
    const collected = collectVersionedFiles(root).map((f) => path.relative(root, f));
    assert.ok(!collected.some((f) => f.includes('dist')));
    assert.ok(!collected.some((f) => f.includes('node_modules')));
  });

  it('rejects a non-semver target', () => {
    assert.throws(() => stampVersion(root, '3.4'), /not a semver/);
    assert.throws(() => stampVersion(root, 'v3.4.0'), /not a semver/);
  });
});

describe('applyVersion', () => {
  it('with a version arg, writes version.json and stamps the tree', () => {
    const result = applyVersion(root, { argVersion: '2.3.4', verify: () => {} });
    assert.strictEqual(result.target, '2.3.4');
    assert.strictEqual(JSON.parse(read('version.json')).version, '2.3.4');
    assert.match(read('index.html'), /\?v=2\.3\.4/);
    assert.match(read('frontend/sw.js'), /const CACHE_VERSION = '2\.3\.4'/);
  });

  it('no-arg repair mode stamps from version.json and leaves version.json byte-identical', () => {
    write('frontend/App.js', "import './util.js?v=0.9.0';\n"); // induce drift
    const versionJsonBefore = read('version.json');
    applyVersion(root, { verify: () => {} });
    assert.match(read('frontend/App.js'), /\?v=1\.0\.0/); // repaired to version.json.version
    assert.strictEqual(read('version.json'), versionJsonBefore); // repair never rewrites the source
  });

  it('rolls the whole tree back (version.json included) when the guardrail fails', () => {
    const indexBefore = read('index.html');
    const swBefore = read('frontend/sw.js');
    const versionJsonBefore = read('version.json');

    assert.throws(
      () => applyVersion(root, { argVersion: '2.3.4', verify: () => { throw new Error('guardrail boom'); } }),
      (err) => err.message.includes('boom') && err.rolledBack === true,
    );

    // Nothing left half-stamped: every file is back to its pre-bump content.
    assert.strictEqual(read('index.html'), indexBefore);
    assert.strictEqual(read('frontend/sw.js'), swBefore);
    assert.strictEqual(read('version.json'), versionJsonBefore);
  });
});
