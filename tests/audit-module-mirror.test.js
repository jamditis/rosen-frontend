// The local mirror of the third-party responses the app loads (#772).
//
// Without it a browser that cannot reach the CDN never mounts React, so the
// audit measures the standalone pages and nothing else. That is how the first
// budgets ended up with no measured evidence behind them.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ASSET_HOSTS,
  EXTRA_ASSET_SEEDS,
  MIRRORED_HOSTS,
  cacheLookupKeys,
  findReferences,
  isMirroredHost,
  normalizeUrl,
} from '../scripts/mirror-audit-modules.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const auditSource = readFileSync(resolve(REPO_ROOT, 'scripts', 'preview-audit.js'), 'utf8');

describe('mirror crawl', () => {
  it('follows the import graph of a module', () => {
    const body = `export * from "/react@18.2.0/es2022/react.mjs";
      import { x } from "https://esm.sh/scheduler@0.23.2/es2022/scheduler.mjs";
      const later = import("./chunk.mjs");`;
    const found = findReferences(body, 'https://esm.sh/react@18.2.0');
    assert.ok(found.includes('https://esm.sh/react@18.2.0/es2022/react.mjs'));
    assert.ok(found.includes('https://esm.sh/scheduler@0.23.2/es2022/scheduler.mjs'));
    assert.ok(found.includes('https://esm.sh/chunk.mjs'));
  });

  it('follows the font files a stylesheet names', () => {
    const css = "@font-face { src: url(https://fonts.gstatic.com/s/robotomono/v31/x.woff2) format('woff2'); }";
    assert.deepEqual(
      findReferences(css, 'https://fonts.googleapis.com/css2?family=Roboto+Mono'),
      ['https://fonts.gstatic.com/s/robotomono/v31/x.woff2'],
    );
  });

  it('ignores a host the mirror does not carry', () => {
    const body = 'import x from "https://example.com/thing.js";';
    assert.deepEqual(findReferences(body, 'https://esm.sh/a.mjs'), []);
  });

  it('ignores an inline data URL', () => {
    const css = 'src: url(data:font/woff2;base64,AAAA);';
    assert.deepEqual(findReferences(css, 'https://fonts.googleapis.com/css2'), []);
  });
});

describe('cache keys', () => {
  it('looks a URL up in both the escaped and the literal form', () => {
    // Chromium requests scheduler@%5E0.23.0; Node stores scheduler@^0.23.0.
    const keys = cacheLookupKeys('https://esm.sh/scheduler@%5E0.23.0?target=es2022');
    assert.ok(keys.includes('https://esm.sh/scheduler@%5E0.23.0?target=es2022'));
    assert.ok(keys.includes('https://esm.sh/scheduler@^0.23.0?target=es2022'));
  });

  it('returns the exact key when there is nothing to decode', () => {
    assert.deepEqual(cacheLookupKeys('https://esm.sh/react@18.2.0'), ['https://esm.sh/react@18.2.0']);
  });

  it('survives a malformed escape instead of throwing', () => {
    assert.deepEqual(cacheLookupKeys('https://esm.sh/%zz'), ['https://esm.sh/%zz']);
  });

  it('normalizes through the URL parser', () => {
    assert.equal(normalizeUrl('https://esm.sh/a/../b'), 'https://esm.sh/b');
  });
});

describe('mirrored hosts', () => {
  it('covers the module, font, and asset hosts the app loads from', () => {
    for (const host of ['esm.sh', 'fonts.googleapis.com', 'fonts.gstatic.com']) {
      assert.ok(MIRRORED_HOSTS.has(host), `${host} must be mirrored`);
      assert.equal(isMirroredHost(host), true);
    }
    assert.ok(ASSET_HOSTS.has('images.unsplash.com'), 'the featured-work images must be mirrored');
    assert.equal(isMirroredHost('twitter.com'), false, 'a link target is not an asset host');
  });

  it('lists one-off assets by full URL rather than by host', () => {
    for (const url of EXTRA_ASSET_SEEDS) {
      const { host, pathname } = new URL(url);
      assert.equal(isMirroredHost(host), false, `${host} should stay a link target`);
      assert.match(pathname, /\.(png|jpe?g|webp|gif|svg)$/);
    }
  });
});

describe('audit wiring', () => {
  it('serves the mirror only when asked, and says when it is incomplete', () => {
    assert.match(auditSource, /PREVIEW_AUDIT_MODULE_CACHE === '1'/);
    assert.match(auditSource, /missingModules\.add\(request\.url\(\)\)/);
    assert.match(auditSource, /if \(missingModules\.size > 0\) process\.exitCode = 1/);
  });

  it('writes the missing list where the mirror script reads it', () => {
    assert.match(auditSource, /resolve\(OUT_DIR_ROOT, 'missing-modules\.json'\)/);
  });
});
