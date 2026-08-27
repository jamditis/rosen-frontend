/**
 * Unit tests for the durable link-check progress tracker (issue #710).
 *
 * The bug: scripts/verify-links.js selected external-liveness targets with
 * `[...new Set(urls)].slice(0, max)`. Every capped scheduled run re-read the
 * same front slice of the deduped URL list, so a URL past index `max` was
 * never checked by any run -- ever. These tests prove a rotating, persisted
 * cursor fixes that: two capped "runs" against the same corpus must inspect
 * different URLs, and a full sweep of runs must eventually reach every URL.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { advanceCursor } from '../scripts/lib/rotating-cursor.js';
import {
  DEFAULT_REVISIT_INTERVALS_MS,
  classifyStatusBucket,
  isDue,
  selectEligibleUrls,
  recordResults,
  diffFindings,
  detectCorpusChanges,
  createEmptyState
} from '../scripts/lib/link-check-state.js';

describe('advanceCursor (generic rotating-cursor helper)', () => {
  it('takes the next `count` items starting at the cursor', () => {
    const { selected, nextCursor } = advanceCursor(['a', 'b', 'c', 'd', 'e'], 0, 2);
    assert.deepEqual(selected, ['a', 'b']);
    assert.equal(nextCursor, 2);
  });

  it('wraps around the end of the list back to the front', () => {
    const { selected, nextCursor } = advanceCursor(['a', 'b', 'c', 'd', 'e'], 3, 4);
    assert.deepEqual(selected, ['d', 'e', 'a', 'b']);
    assert.equal(nextCursor, 2);
  });

  it('never takes more items than exist, and does not loop forever on a huge count', () => {
    const { selected, nextCursor } = advanceCursor(['a', 'b', 'c'], 1, 50);
    assert.deepEqual(selected, ['b', 'c', 'a']);
    assert.equal(nextCursor, 1);
  });

  it('handles an empty list without dividing by zero', () => {
    const { selected, nextCursor } = advanceCursor([], 0, 5);
    assert.deepEqual(selected, []);
    assert.equal(nextCursor, 0);
  });

  it('normalizes an out-of-range or negative cursor', () => {
    const { selected } = advanceCursor(['a', 'b', 'c'], -1, 1);
    assert.deepEqual(selected, ['c']);
    const wrapped = advanceCursor(['a', 'b', 'c'], 7, 1);
    assert.deepEqual(wrapped.selected, ['b']); // 7 % 3 === 1
  });
});

describe('isDue / revisit cadence', () => {
  const now = Date.parse('2026-08-27T00:00:00Z');

  it('is always due when there is no prior record', () => {
    assert.ok(isDue(undefined, now, DEFAULT_REVISIT_INTERVALS_MS));
    assert.ok(isDue(null, now, DEFAULT_REVISIT_INTERVALS_MS));
  });

  it('a healthy (ok) url is not due until its longer interval elapses', () => {
    const justChecked = { lastStatus: 'ok', lastCheckedAt: new Date(now - 1000).toISOString() };
    assert.ok(!isDue(justChecked, now, DEFAULT_REVISIT_INTERVALS_MS));
    const staleOk = { lastStatus: 'ok', lastCheckedAt: new Date(now - DEFAULT_REVISIT_INTERVALS_MS.ok - 1).toISOString() };
    assert.ok(isDue(staleOk, now, DEFAULT_REVISIT_INTERVALS_MS));
  });

  it('a failing url is due sooner than a healthy one (faster recovery detection)', () => {
    assert.ok(DEFAULT_REVISIT_INTERVALS_MS.failing < DEFAULT_REVISIT_INTERVALS_MS.ok);
    const recentlyFailed = {
      lastStatus: 'failing',
      lastCheckedAt: new Date(now - DEFAULT_REVISIT_INTERVALS_MS.failing - 1).toISOString()
    };
    assert.ok(isDue(recentlyFailed, now, DEFAULT_REVISIT_INTERVALS_MS));
    const justFailed = { lastStatus: 'failing', lastCheckedAt: new Date(now - 1000).toISOString() };
    assert.ok(!isDue(justFailed, now, DEFAULT_REVISIT_INTERVALS_MS));
  });

  it('classifies failure types into ok/redirect/failing buckets', () => {
    assert.equal(classifyStatusBucket(null), 'ok');
    assert.equal(classifyStatusBucket('redirect_url'), 'redirect');
    assert.equal(classifyStatusBucket('client_error_url'), 'failing');
    assert.equal(classifyStatusBucket('server_error_url'), 'failing');
    assert.equal(classifyStatusBucket('unreachable_url'), 'failing');
  });
});

describe('selectEligibleUrls (the actual bug fix)', () => {
  // A corpus much bigger than one run's budget -- exactly the shape of the
  // real weekly job (tens of thousands of urls, --max 3000).
  const urls = Array.from({ length: 10 }, (_, i) => `https://example.com/${i}`);

  it('reproduces the original bug when there is no persisted state: repeated calls with a fresh state always return the same front slice', () => {
    const runA = selectEligibleUrls(urls, createEmptyState(), { max: 3, now: Date.now() });
    const runB = selectEligibleUrls(urls, createEmptyState(), { max: 3, now: Date.now() });
    // This documents the failure mode this fix removes: given no carried-over
    // state, both "runs" are identical -- the tail (indices 3-9) is unreachable.
    assert.deepEqual(runA.selected, runB.selected);
  });

  it('fixes it: carrying the state (cursor + per-url lastCheckedAt) forward makes the next run advance past what the previous run already covered', () => {
    let state = createEmptyState();
    const now = Date.now();

    const run1 = selectEligibleUrls(urls, state, { max: 3, now });
    assert.equal(run1.selected.length, 3);

    state = recordResults(state, {
      checkedUrls: run1.selected,
      findingsByUrl: new Map() // everything came back healthy
    }, now);
    state.cursor = run1.nextCursor;

    const run2 = selectEligibleUrls(urls, state, { max: 3, now: now + 1000 });
    assert.equal(run2.selected.length, 3);

    // The two runs must not be identical, and none of run2's picks were
    // already covered a second ago by run1 (they were just marked healthy,
    // so they are not due again yet).
    assert.notDeepEqual(run1.selected, run2.selected);
    for (const url of run2.selected) {
      assert.ok(!run1.selected.includes(url), `${url} was re-checked instead of advancing`);
    }
  });

  it('reaches every unique url within a bounded number of capped runs (full-corpus coverage)', () => {
    let state = createEmptyState();
    let now = Date.now();
    const seen = new Set();
    const max = 3;
    // ceil(10/3) = 4 runs is the theoretical minimum; give it a little slack.
    const maxRuns = 6;

    for (let i = 0; i < maxRuns && seen.size < urls.length; i++) {
      const { selected, nextCursor } = selectEligibleUrls(urls, state, { max, now });
      for (const u of selected) seen.add(u);
      state = recordResults(state, { checkedUrls: selected, findingsByUrl: new Map() }, now);
      state.cursor = nextCursor;
      now += 1000; // still well inside every revisit interval
    }

    assert.equal(seen.size, urls.length, 'every url should become eligible within the completion window');
  });

  it('keeps always-eligible (e.g. featured-work) urls in every run without permanently starving the rotating tail', () => {
    const featured = ['https://example.com/0'];
    let state = createEmptyState();
    const now = Date.now();

    const run1 = selectEligibleUrls(urls, state, { max: 3, now, alwaysEligible: featured });
    assert.ok(run1.selected.includes('https://example.com/0'));

    state = recordResults(state, { checkedUrls: run1.selected, findingsByUrl: new Map() }, now);
    state.cursor = run1.nextCursor;

    const run2 = selectEligibleUrls(urls, state, { max: 3, now: now + 1000, alwaysEligible: featured });
    assert.ok(run2.selected.includes('https://example.com/0'), 'featured url must appear again');
    // The rest of run2 should still be new ground, not a repeat of run1's tail picks.
    const run2Rest = run2.selected.filter((u) => u !== 'https://example.com/0');
    const run1Rest = run1.selected.filter((u) => u !== 'https://example.com/0');
    for (const u of run2Rest) assert.ok(!run1Rest.includes(u));
  });
});

describe('recordResults', () => {
  it('records a healthy check, a failure, and a redirect destination', () => {
    const now = Date.parse('2026-08-27T00:00:00Z');
    const findingsByUrl = new Map([
      ['https://example.com/bad', { failureType: 'client_error_url', status: 404, location: null }],
      ['https://example.com/moved', { failureType: 'redirect_url', status: 301, location: 'https://example.com/new' }]
    ]);
    const state = recordResults(createEmptyState(), {
      checkedUrls: ['https://example.com/ok', 'https://example.com/bad', 'https://example.com/moved'],
      findingsByUrl
    }, now);

    assert.equal(state.urls['https://example.com/ok'].lastStatus, 'ok');
    assert.equal(state.urls['https://example.com/ok'].consecutiveFailures, 0);

    assert.equal(state.urls['https://example.com/bad'].lastStatus, 'failing');
    assert.equal(state.urls['https://example.com/bad'].lastFailureType, 'client_error_url');
    assert.equal(state.urls['https://example.com/bad'].consecutiveFailures, 1);

    assert.equal(state.urls['https://example.com/moved'].lastStatus, 'redirect');
    assert.equal(state.urls['https://example.com/moved'].lastLocation, 'https://example.com/new');
  });

  it('accumulates consecutiveFailures across repeated failing checks and resets on recovery', () => {
    const now = Date.parse('2026-08-27T00:00:00Z');
    const failing = new Map([['https://example.com/x', { failureType: 'server_error_url', status: 500 }]]);
    let state = recordResults(createEmptyState(), { checkedUrls: ['https://example.com/x'], findingsByUrl: failing }, now);
    assert.equal(state.urls['https://example.com/x'].consecutiveFailures, 1);
    state = recordResults(state, { checkedUrls: ['https://example.com/x'], findingsByUrl: failing }, now + 1);
    assert.equal(state.urls['https://example.com/x'].consecutiveFailures, 2);
    state = recordResults(state, { checkedUrls: ['https://example.com/x'], findingsByUrl: new Map() }, now + 2);
    assert.equal(state.urls['https://example.com/x'].consecutiveFailures, 0);
    assert.equal(state.urls['https://example.com/x'].lastStatus, 'ok');
  });

  it('preserves firstSeenAt across repeated checks', () => {
    const firstNow = Date.parse('2026-08-01T00:00:00Z');
    const laterNow = Date.parse('2026-08-27T00:00:00Z');
    let state = recordResults(createEmptyState(), { checkedUrls: ['https://example.com/x'], findingsByUrl: new Map() }, firstNow);
    const firstSeenAt = state.urls['https://example.com/x'].firstSeenAt;
    state = recordResults(state, { checkedUrls: ['https://example.com/x'], findingsByUrl: new Map() }, laterNow);
    assert.equal(state.urls['https://example.com/x'].firstSeenAt, firstSeenAt);
    assert.notEqual(state.urls['https://example.com/x'].lastCheckedAt, firstSeenAt);
  });
});

describe('diffFindings (new / persistent / recovered / changed)', () => {
  it('classifies a url with no history that fails now as new', () => {
    const findingsByUrl = new Map([['https://example.com/a', { failureType: 'client_error_url' }]]);
    const diff = diffFindings(createEmptyState(), ['https://example.com/a'], findingsByUrl);
    assert.deepEqual(diff.new, ['https://example.com/a']);
    assert.deepEqual(diff.persistent, []);
    assert.deepEqual(diff.recovered, []);
    assert.deepEqual(diff.changed, []);
  });

  it('classifies a url that failed last time and still fails as persistent', () => {
    const prevState = { urls: { 'https://example.com/a': { lastStatus: 'failing' } } };
    const findingsByUrl = new Map([['https://example.com/a', { failureType: 'server_error_url' }]]);
    const diff = diffFindings(prevState, ['https://example.com/a'], findingsByUrl);
    assert.deepEqual(diff.persistent, ['https://example.com/a']);
  });

  it('classifies a url that failed last time and now passes as recovered', () => {
    const prevState = { urls: { 'https://example.com/a': { lastStatus: 'failing' } } };
    const diff = diffFindings(prevState, ['https://example.com/a'], new Map());
    assert.deepEqual(diff.recovered, ['https://example.com/a']);
  });

  it('classifies a redirect whose destination changed as changed, not persistent', () => {
    const prevState = { urls: { 'https://example.com/a': { lastStatus: 'redirect', lastLocation: 'https://example.com/old' } } };
    const findingsByUrl = new Map([['https://example.com/a', { failureType: 'redirect_url', location: 'https://example.com/new' }]]);
    const diff = diffFindings(prevState, ['https://example.com/a'], findingsByUrl);
    assert.deepEqual(diff.changed, ['https://example.com/a']);
    assert.deepEqual(diff.new, []);
  });

  it('does not classify a stable healthy url as anything', () => {
    const prevState = { urls: { 'https://example.com/a': { lastStatus: 'ok' } } };
    const diff = diffFindings(prevState, ['https://example.com/a'], new Map());
    assert.deepEqual(diff.new, []);
    assert.deepEqual(diff.persistent, []);
    assert.deepEqual(diff.recovered, []);
    assert.deepEqual(diff.changed, []);
  });
});

describe('detectCorpusChanges (url additions/removals across runs)', () => {
  it('reports urls new to the corpus and urls dropped from it', () => {
    const prevState = { urls: { 'https://example.com/gone': {}, 'https://example.com/kept': {} } };
    const currentUrls = ['https://example.com/kept', 'https://example.com/new'];
    const changes = detectCorpusChanges(prevState, currentUrls);
    assert.deepEqual(changes.added, ['https://example.com/new']);
    assert.deepEqual(changes.removed, ['https://example.com/gone']);
  });

  it('reports no changes when the corpus is stable', () => {
    const prevState = { urls: { 'https://example.com/a': {} } };
    const changes = detectCorpusChanges(prevState, ['https://example.com/a']);
    assert.deepEqual(changes.added, []);
    assert.deepEqual(changes.removed, []);
  });
});
