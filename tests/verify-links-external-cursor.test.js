/**
 * Integration-level regression test for issue #710: proves the fix holds
 * through the real network-probing path (checkExternalLiveness), not just
 * the pure state-selection helpers already covered by
 * tests/link-check-state.test.js. fetch is mocked (always healthy) so this
 * stays offline and deterministic; only the selection/state plumbing is
 * under test here.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkExternalLiveness, buildUrlSourceMap } from '../scripts/verify-links.js';
import { createEmptyState, selectEligibleUrls, recordResults } from '../scripts/lib/link-check-state.js';

describe('external liveness sweep with a persisted cursor (issue #710)', () => {
  it('advances through a corpus larger than one run\'s --max instead of re-checking the same front slice', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => ({ status: 200, headers: { get: () => null } }));

    const urls = Array.from({ length: 20 }, (_, i) => `https://example.com/${i}`);
    const sourceMap = buildUrlSourceMap(urls.map((u) => ({ id: 'R', url: u })));

    let state = createEmptyState();
    let now = Date.now();
    const runs = [];

    for (let run = 0; run < 3; run++) {
      const { selected, nextCursor } = selectEligibleUrls(urls, state, { max: 5, now });
      const result = await checkExternalLiveness(selected, { sourceMap, delayMs: 0 });
      assert.equal(result.checked, 5, 'each capped run probes exactly `max` urls');
      const findingsByUrl = new Map(result.findings.map((f) => [f.target, f]));
      runs.push(selected);
      state = recordResults(state, { checkedUrls: selected, findingsByUrl }, now);
      state.cursor = nextCursor;
      now += 1000;
    }

    // The original bug: [...new Set(urls)].slice(0, max) makes every run
    // identical to the first. Assert the opposite for every pair of runs.
    assert.notDeepEqual(runs[0], runs[1]);
    assert.notDeepEqual(runs[1], runs[2]);
    assert.notDeepEqual(runs[0], runs[2]);

    const allSeen = new Set(runs.flat());
    assert.equal(allSeen.size, 15, 'three runs of 5 reach 15 distinct urls, not the same 5 three times');
  });
});
