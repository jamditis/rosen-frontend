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
  describeFetchFailure,
  findReferences,
  isMirroredHost,
  isRequiredMirror,
  isRetryableStatus,
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

  it('fails an unreachable image fast instead of waiting on the same host', () => {
    // The mirror records what it could not reach; the audit has to route those
    // URLs itself, or the browser waits on the host that just timed out and the
    // wait moves the measurement.
    assert.match(auditSource, /unmirroredAssets\.has\(url\.toString\(\)\)/);
    assert.match(auditSource, /if \(unmirroredAssets\.has\(request\.url\(\)\)\) \{/);
  });
});

// A transient network failure on one third-party host used to abort the mirror
// before the audit measured anything, and the log said only "fetch failed"
// (#852). Retries fix the transient case; the required/optional split keeps a
// permanently unreachable image host from deleting the whole gate.
describe('mirror resilience', () => {
  it('retries the statuses that can change and gives up on the ones that cannot', () => {
    for (const status of [408, 425, 429, 500, 502, 503, 504]) {
      assert.equal(isRetryableStatus(status), true, `${status} should be retried`);
    }
    for (const status of [400, 401, 403, 404, 410]) {
      assert.equal(isRetryableStatus(status), false, `${status} should not be retried`);
    }
  });

  it('names the underlying reason instead of a bare fetch failure', () => {
    const cause = Object.assign(new Error('connect ETIMEDOUT 1.2.3.4:443'), { code: 'ETIMEDOUT' });
    const err = Object.assign(new TypeError('fetch failed'), { cause });
    const described = describeFetchFailure(err);
    assert.match(described, /fetch failed/);
    assert.match(described, /ETIMEDOUT/);
  });

  it('survives an error with no message and no cause', () => {
    assert.equal(describeFetchFailure(new Error('')), 'unknown error');
  });

  it('treats runtime code, stylesheets, and fonts as required', () => {
    for (const url of [
      'https://esm.sh/react@18.2.0',
      'https://fonts.googleapis.com/css2?family=Special+Elite',
      'https://fonts.gstatic.com/s/robotomono/v31/x.woff2',
      'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js',
    ]) {
      assert.equal(isRequiredMirror(url), true, `${url} must fail the mirror when unreachable`);
    }
  });

  it('treats the one-off images as optional, because the page sizes their boxes', () => {
    for (const url of EXTRA_ASSET_SEEDS) {
      assert.equal(isRequiredMirror(url), false, `${url} must not be able to abort the gate`);
    }
    assert.equal(isRequiredMirror('https://images.unsplash.com/photo-1?w=800'), false);
  });

  it('keeps every mirrored host on the required side of the split', () => {
    // The two sets have to stay in step: a host added to MIRRORED_HOSTS serves
    // code or fonts, and dropping it to optional would let a page be measured
    // without the modules the budgets describe.
    for (const host of MIRRORED_HOSTS) {
      assert.equal(isRequiredMirror(`https://${host}/thing`), true, `${host} must be required`);
    }
    for (const host of ASSET_HOSTS) {
      assert.equal(isRequiredMirror(`https://${host}/thing.jpg`), false, `${host} must be optional`);
    }
  });
});
