/**
 * getOpenDataURLs path regression test (#300).
 *
 * getOpenDataURLs hardcoded the WordPress upload root (/wp-content/rosen-archive)
 * for production instead of the canonical BASE_PATH (/j/rosen-archive) the rest
 * of the app uses, so open-data download links would diverge from the app's URL
 * scheme and depend on a brittle WP rewrite. This guards that the function
 * derives its base from the shared resolver and never reintroduces a hardcoded
 * deploy root. Source-pattern, because archiveService.js pulls in browser-only
 * deps and ?v=-suffixed imports that Node cannot load; the resolver's
 * per-environment output is covered behaviorally in path-resolution.test.js.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBasePath } from '../frontend/utils/pathResolver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const svc = fs.readFileSync(
  path.join(__dirname, '..', 'frontend', 'services', 'archiveService.js'), 'utf-8');

// Isolate the basePath assignment expression — not the whole function — so the
// assertions guard the actual value and aren't tripped by the comment that
// documents the removed path by name.
const fnStart = svc.indexOf('export const getOpenDataURLs');
const assignMatch = svc.slice(fnStart).match(/const\s+basePath\s*=\s*([^;]+);/);
const assignment = assignMatch ? assignMatch[1] : '';

describe('getOpenDataURLs base path (#300)', () => {
  it('derives the base path from the shared resolver BASE_PATH', () => {
    assert.notStrictEqual(fnStart, -1, 'getOpenDataURLs must exist');
    assert.ok(assignMatch, 'getOpenDataURLs must assign a basePath');
    assert.match(assignment, /\bBASE_PATH\b/,
      'getOpenDataURLs must derive its production base from BASE_PATH');
  });

  it('does not hardcode the WordPress upload root or the pages prefix', () => {
    assert.ok(!assignment.includes('/wp-content/rosen-archive'),
      'getOpenDataURLs must not hardcode the WordPress upload root');
    assert.ok(!assignment.includes('/rosen-frontend'),
      'getOpenDataURLs must not hardcode the github-pages prefix — BASE_PATH encodes it');
  });

  it('confirms the resolver yields the canonical production base', () => {
    // The contract the fix relies on: production base is the public /j path,
    // not the WP upload root.
    assert.strictEqual(getBasePath('pressthink.org'), '/j/rosen-archive');
  });
});
