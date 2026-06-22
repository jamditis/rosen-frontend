// Unit tests for the shared raceTimeout helper (#487). It replaced three
// near-identical promise-vs-timeout races (archiveService.withVersionTimeout,
// httpCachedLoader.withTimeout, idbCache.withTimeout); these pin both of its
// contracts so the consolidation cannot silently change either call site.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { raceTimeout } from '../frontend/utils/raceTimeout.js?v=3.4.5';

const later = (value, ms) => new Promise((res) => setTimeout(() => res(value), ms));
const laterReject = (err, ms) => new Promise((_, rej) => setTimeout(() => rej(err), ms));

describe('raceTimeout', () => {
  describe('resolve-mode (default)', () => {
    it('resolves the promise value when it settles in time', async () => {
      assert.equal(await raceTimeout(later('v', 5), 100, { fallback: 'fb' }), 'v');
    });

    it('resolves fallback on timeout', async () => {
      assert.equal(await raceTimeout(later('v', 100), 5, { fallback: 'fb' }), 'fb');
    });

    it('resolves fallback when the promise rejects', async () => {
      assert.equal(await raceTimeout(laterReject(new Error('boom'), 5), 100, { fallback: 'fb' }), 'fb');
    });

    it('fallback defaults to undefined', async () => {
      assert.equal(await raceTimeout(later('v', 100), 5), undefined);
    });

    it('swallows a late rejection after a timeout (no unhandled rejection)', async () => {
      assert.equal(await raceTimeout(laterReject(new Error('late'), 30), 5, { fallback: 'fb' }), 'fb');
      await later(null, 50); // the late rejection must be handled, not crash the run
    });
  });

  describe('reject-mode (rejectOnTimeout: true)', () => {
    it('resolves the promise value when it settles in time', async () => {
      assert.equal(await raceTimeout(later('v', 5), 100, { rejectOnTimeout: true }), 'v');
    });

    it('rejects with a timeout error on timeout', async () => {
      await assert.rejects(
        raceTimeout(later('v', 100), 5, { rejectOnTimeout: true }),
        /timed out after 5ms/,
      );
    });

    it('propagates the promise rejection', async () => {
      await assert.rejects(
        raceTimeout(laterReject(new Error('boom'), 5), 100, { rejectOnTimeout: true }),
        /boom/,
      );
    });
  });
});
