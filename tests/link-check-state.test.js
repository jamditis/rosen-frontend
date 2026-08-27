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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { advanceCursor } from '../scripts/lib/rotating-cursor.js';
import {
  STATE_VERSION,
  DEFAULT_REVISIT_INTERVALS_MS,
  classifyStatusBucket,
  isDue,
  loadState,
  saveState,
  selectEligibleUrls,
  recordResults,
  diffFindings,
  detectCorpusChanges,
  pruneRemovedUrls,
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

describe('loadState / saveState (real filesystem round trip, not hand-threaded)', () => {
  // The other describe blocks above call selectEligibleUrls/recordResults directly
  // and assign state.cursor themselves -- that proves the pure functions are
  // correct, but it never exercises loadState or saveState, so a wiring bug in
  // scripts/verify-links.js's main() (e.g. forgetting to persist the cursor, or
  // reloading before the previous save lands) would still pass every test above.
  // These tests go through the real file on disk between "runs" instead, the way
  // two separate scheduled workflow invocations actually would.
  function tempStatePath() {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'link-check-state-')), 'state.json');
  }

  it('loadState returns an empty state when the file does not exist yet (first-ever run)', () => {
    const file = tempStatePath();
    assert.deepEqual(loadState(file), createEmptyState());
  });

  it('loadState returns an empty state for corrupt JSON rather than throwing', () => {
    const file = tempStatePath();
    fs.writeFileSync(file, '{not valid json');
    assert.deepEqual(loadState(file), createEmptyState());
  });

  it('loadState resets to empty when the file version does not match STATE_VERSION', () => {
    const file = tempStatePath();
    fs.writeFileSync(file, JSON.stringify({ version: STATE_VERSION + 1, cursor: 7, urls: { x: {} } }));
    assert.deepEqual(loadState(file), createEmptyState());
  });

  it('a second run reads what the first run saved and resumes past it, via real fs -- not an in-memory handoff', () => {
    const file = tempStatePath();
    const urls = Array.from({ length: 10 }, (_, i) => `https://example.com/${i}`);

    // Run 1: nothing persisted yet.
    let state = loadState(file);
    assert.deepEqual(state, createEmptyState());
    const now1 = Date.now();
    const run1 = selectEligibleUrls(urls, state, { max: 3, now: now1 });
    let saved = recordResults(state, { checkedUrls: run1.selected, findingsByUrl: new Map() }, now1);
    saved.cursor = run1.nextCursor;
    saved = pruneRemovedUrls(saved, urls);
    saveState(file, saved);

    // Run 2: a fresh loadState() call, as a completely separate process/run would do.
    const reloaded = loadState(file);
    assert.equal(reloaded.cursor, run1.nextCursor, 'the cursor written to disk is what the next run reads back');
    for (const url of run1.selected) {
      assert.ok(reloaded.urls[url], `${url} was recorded to disk`);
      assert.equal(reloaded.urls[url].lastStatus, 'ok');
    }

    const now2 = now1 + 1000;
    const run2 = selectEligibleUrls(urls, reloaded, { max: 3, now: now2 });
    assert.notDeepEqual(run2.selected, run1.selected, 'run 2 starts where run 1 stopped, not the same front slice');
    for (const url of run2.selected) {
      assert.ok(!run1.selected.includes(url), `${url} was re-checked instead of advancing`);
    }
  });

  it('saveState writes compact JSON (a single line) rather than pretty-printed output', () => {
    const file = tempStatePath();
    saveState(file, createEmptyState());
    const raw = fs.readFileSync(file, 'utf-8');
    assert.equal(raw.trim().split('\n').length, 1, 'the committed state file should not carry pretty-print indentation');
    assert.deepEqual(JSON.parse(raw), createEmptyState());
  });
});

describe('pruneRemovedUrls', () => {
  it('drops state entries for urls no longer in the current corpus', () => {
    const state = {
      version: STATE_VERSION,
      cursor: 5,
      urls: {
        'https://example.com/kept': { lastStatus: 'ok' },
        'https://example.com/gone': { lastStatus: 'ok' }
      }
    };
    const pruned = pruneRemovedUrls(state, ['https://example.com/kept']);
    assert.deepEqual(Object.keys(pruned.urls), ['https://example.com/kept']);
    assert.equal(pruned.cursor, 5, 'pruning does not disturb the cursor');
  });

  it('keeps every entry when nothing was removed from the corpus', () => {
    const state = createEmptyState();
    state.urls['https://example.com/a'] = { lastStatus: 'ok' };
    const pruned = pruneRemovedUrls(state, ['https://example.com/a']);
    assert.deepEqual(pruned.urls, state.urls);
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
