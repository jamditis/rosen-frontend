/**
 * setCachedData no longer attempts a doomed sessionStorage write (#337).
 *
 * localStorage and sessionStorage share a ~5 MB per-origin quota, so the old
 * "overflow large payloads to sessionStorage" path threw QuotaExceededError on
 * every load for archive-core/archive-details and cached nothing -- while the
 * IndexedDB cache (core) and the service-worker Cache Storage (both) already
 * cover those files. The fix skips the write above the quota threshold.
 *
 * Source-pattern, because archiveService.js imports browser-only ?v=-suffixed
 * modules Node cannot load -- consistent with the repo's other archiveService
 * structural tests.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const svc = fs.readFileSync(
  path.join(__dirname, '..', 'frontend', 'services', 'archiveService.js'),
  'utf-8'
);

// Isolate setCachedData so assertions cannot match an unrelated code path.
const setCachedData = svc.match(/const setCachedData = \(url, data\) => \{[\s\S]*?\n};/);

describe('setCachedData skips Web Storage for oversized payloads (#337)', () => {
  it('isolates the setCachedData writer', () => {
    assert.ok(setCachedData, 'setCachedData must exist');
  });

  it('never writes a payload to sessionStorage', () => {
    // The doomed overflow write is the whole bug; it must be gone from the writer.
    assert.doesNotMatch(setCachedData[0], /sessionStorage\.setItem/,
      'oversized data must not be written to sessionStorage (it overflows the same quota)');
  });

  it('drops the per-load "session cache full" warning', () => {
    assert.doesNotMatch(svc, /Session cache full/,
      'the doomed write and its per-load warning must be gone');
  });

  it('short-circuits when the payload exceeds the Web Storage quota', () => {
    assert.match(setCachedData[0], /serialized\.length > MAX_LOCALSTORAGE_SIZE\)\s*\{\s*return;/,
      'an oversized payload must skip caching instead of attempting a doomed write');
  });

  it('still caches sub-threshold payloads in localStorage', () => {
    assert.match(setCachedData[0], /localStorage\.setItem\(cacheKey, serialized\)/,
      'small data must still be cached in localStorage');
  });
});
