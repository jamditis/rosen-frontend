/**
 * Service worker cache-invalidation tests (issue #141)
 *
 * The service worker must tie its cache name to the app version so that every
 * deploy drops stale caches. Static assets must retain the `?v=` query in the
 * cache key so an older controlling worker cannot pair modules from different
 * releases during the first navigation after a deploy.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const SW = fs.readFileSync(path.join(ROOT, 'frontend', 'sw.js'), 'utf8');
const HTACCESS = fs.readFileSync(path.join(ROOT, '.htaccess'), 'utf8');
const VERSION = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')
).version;

describe('service worker cache invalidation', () => {
  it('defines a CACHE_VERSION constant', () => {
    assert.match(SW, /const CACHE_VERSION\s*=\s*['"][^'"]+['"]/);
  });

  it('ties CACHE_VERSION to version.json', () => {
    const m = SW.match(/const CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/);
    assert.ok(m, 'CACHE_VERSION not found in sw.js');
    assert.equal(m[1], VERSION);
  });

  it('derives cache names from CACHE_VERSION, not a hardcoded literal', () => {
    assert.match(SW, /CACHE_NAME\s*=\s*`jrda-cache-\$\{CACHE_VERSION\}`/);
    assert.match(SW, /DATA_CACHE_NAME\s*=\s*`jrda-data-\$\{CACHE_VERSION\}`/);
    assert.doesNotMatch(SW, /['"]jrda-cache-v\d+['"]/);
  });

  it('makes cacheFirst match the exact versioned request URL', () => {
    const fn = SW.slice(SW.indexOf('function cacheFirst'));
    assert.match(fn, /cache\.match\(request\)/);
    assert.doesNotMatch(fn, /ignoreSearch\s*:\s*true/);
  });

  it('requires both service-worker scripts to revalidate on update checks', () => {
    assert.match(HTACCESS, /<FilesMatch "\^sw\\\.js\$">/);
    assert.match(HTACCESS, /Cache-Control "no-cache, max-age=0, must-revalidate"/);
  });
});
