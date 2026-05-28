/**
 * Unit tests for the three-way path-resolution helper (#PR1).
 *
 * The archive runs at three different URL surfaces — localhost, GH Pages
 * (jamditis.github.io/rosen-frontend/), and production
 * (pressthink.org/j/rosen-archive/) — each with a distinct base path. This
 * helper isolates the host-to-environment mapping so callers in App.js,
 * sw.js, archiveService.js, and Header.js can share one source of truth.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getEnvironment,
  getBasePath,
  getDataPath,
  ENVIRONMENT,
  BASE_PATH,
  DATA_PATH,
  IS_LOCAL,
  IS_GITHUB_PAGES,
  IS_PRODUCTION,
} from '../frontend/utils/pathResolver.js';

describe('getEnvironment(host)', () => {
  it('returns local for localhost', () => {
    assert.strictEqual(getEnvironment('localhost'), 'local');
  });

  it('returns local for 127.0.0.1', () => {
    assert.strictEqual(getEnvironment('127.0.0.1'), 'local');
  });

  it('returns github-pages for jamditis.github.io', () => {
    assert.strictEqual(getEnvironment('jamditis.github.io'), 'github-pages');
  });

  it('returns github-pages for any *.github.io host', () => {
    assert.strictEqual(getEnvironment('someone-else.github.io'), 'github-pages');
  });

  it('returns production for pressthink.org', () => {
    assert.strictEqual(getEnvironment('pressthink.org'), 'production');
  });

  it('falls back to production for unknown hosts', () => {
    assert.strictEqual(getEnvironment('example.com'), 'production');
  });
});

describe('getBasePath(host)', () => {
  it('resolves to /frontend in local', () => {
    assert.strictEqual(getBasePath('localhost'), '/frontend');
  });

  it('resolves to /rosen-frontend on GH Pages', () => {
    assert.strictEqual(getBasePath('jamditis.github.io'), '/rosen-frontend');
  });

  it('resolves to /j/rosen-archive in production', () => {
    assert.strictEqual(getBasePath('pressthink.org'), '/j/rosen-archive');
  });
});

describe('getDataPath(host)', () => {
  it('resolves to /data in local', () => {
    assert.strictEqual(getDataPath('localhost'), '/data');
  });

  it('resolves to /rosen-frontend/data on GH Pages', () => {
    assert.strictEqual(getDataPath('jamditis.github.io'), '/rosen-frontend/data');
  });

  it('resolves to /j/rosen-archive/data in production', () => {
    assert.strictEqual(getDataPath('pressthink.org'), '/j/rosen-archive/data');
  });
});

describe('runtime constants', () => {
  it('exports ENVIRONMENT, BASE_PATH, DATA_PATH as strings', () => {
    assert.strictEqual(typeof ENVIRONMENT, 'string');
    assert.strictEqual(typeof BASE_PATH, 'string');
    assert.strictEqual(typeof DATA_PATH, 'string');
  });

  it('exports IS_LOCAL, IS_GITHUB_PAGES, IS_PRODUCTION as booleans', () => {
    assert.strictEqual(typeof IS_LOCAL, 'boolean');
    assert.strictEqual(typeof IS_GITHUB_PAGES, 'boolean');
    assert.strictEqual(typeof IS_PRODUCTION, 'boolean');
  });

  it('falls back to production under node (no self.location)', () => {
    // Node has no `self` or `window`; detectHost returns '' which maps to
    // the production fallback branch.
    assert.strictEqual(ENVIRONMENT, 'production');
    assert.strictEqual(BASE_PATH, '/j/rosen-archive');
    assert.strictEqual(DATA_PATH, '/j/rosen-archive/data');
    assert.strictEqual(IS_LOCAL, false);
    assert.strictEqual(IS_GITHUB_PAGES, false);
    assert.strictEqual(IS_PRODUCTION, true);
  });
});
