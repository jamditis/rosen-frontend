// Behaviour of the layout-shift measurement itself (#772).
//
// The budget arithmetic is covered in tests/layout-shift-budget.test.js. This
// file drives the two parts that decide what the arithmetic is fed: the quiet
// loop that ends the hydration phase, and the rule that decides when a route
// needs its own document.
//
// The quiet loop takes an adapter, so these tests run it on a fake clock with
// scripted entries. No browser, no waiting.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectQuietPoint,
  measureLayoutShift,
  requiresFreshDocument,
} from '../scripts/layout-shift-probe.js';

const TIMING = {
  pollMs: 100,
  quietMs: 400,
  maxGraceMs: 3000,
  maxWaitMs: 20000,
  settledObservationMs: 500,
};

// A fake page clock. `sleep` moves time forward, `now` reads it, and
// `entriesAt` decides which shift entries the page reports at a given time.
function fakeAdapter({ entriesAt, startupSettled = null }) {
  let clock = 0;
  const reads = [];
  return {
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    readEntries: async () => {
      const entries = entriesAt(clock);
      reads.push({ at: clock, count: entries.length });
      return entries;
    },
    startupSettled,
    reads,
    clock: () => clock,
  };
}

const shiftsUpTo = (...startTimes) => (clock) => startTimes
  .filter((startTime) => startTime <= clock)
  .map((startTime) => ({ value: 0.1, startTime, hadRecentInput: false }));

describe('quiet point detection', () => {
  it('ends the hydration phase at the last shift before the quiet window', async () => {
    const adapter = fakeAdapter({ entriesAt: shiftsUpTo(100, 250) });
    const quiet = await detectQuietPoint(adapter, TIMING);
    assert.equal(quiet.hydrationEndsAt, 250);
    assert.equal(quiet.entries.length, 2);
    assert.equal(quiet.reachedGraceLimit, false);
    // Quiet is declared 400ms after the last new entry, not before.
    assert.ok(adapter.clock() >= 650, `quiet declared too early at ${adapter.clock()}`);
  });

  it('reports a route that never goes quiet instead of waiting forever', async () => {
    // A new shift on every poll: the loop has to stop at the grace limit.
    const adapter = fakeAdapter({
      entriesAt: (clock) => Array.from(
        { length: Math.floor(clock / TIMING.pollMs) + 1 },
        (_unused, index) => ({ value: 0.01, startTime: index * TIMING.pollMs, hadRecentInput: false }),
      ),
    });
    const quiet = await detectQuietPoint(adapter, TIMING);
    assert.equal(quiet.reachedGraceLimit, true);
    assert.ok(adapter.clock() >= TIMING.maxGraceMs);
    assert.ok(adapter.clock() < TIMING.maxWaitMs);
  });

  it('holds the phase boundary open until startup work reports done', async () => {
    // The shape of the archive routes: an early shift, a long quiet gap while
    // the details file downloads, then the re-render it causes. Without the
    // gate the quiet point lands in the gap and the re-render is booked as
    // settled instability.
    let releaseStartup;
    const startupSettled = new Promise((res) => { releaseStartup = res; });
    const adapter = fakeAdapter({
      entriesAt: (clock) => shiftsUpTo(100, 2000)(clock),
      startupSettled,
    });
    const original = adapter.sleep;
    adapter.sleep = async (ms) => {
      await original(ms);
      if (adapter.now() >= 1900) releaseStartup();
    };
    const quiet = await detectQuietPoint(adapter, TIMING);
    assert.equal(quiet.hydrationEndsAt, 2000, 'the post-startup shift belongs to hydration');
    assert.equal(quiet.reachedGraceLimit, false);
    assert.ok(quiet.startupWaitMs >= 1900, `startup wait was ${quiet.startupWaitMs}`);
  });

  it('measures anyway when startup work never reports done', async () => {
    const adapter = fakeAdapter({
      entriesAt: shiftsUpTo(100),
      startupSettled: new Promise(() => {}),
    });
    const quiet = await detectQuietPoint(adapter, TIMING);
    assert.equal(quiet.reachedGraceLimit, true);
    assert.equal(quiet.startupWaitMs, null);
    assert.ok(adapter.clock() >= TIMING.maxWaitMs);
  });

  it('treats a route with no shifts as quiet at zero', async () => {
    const adapter = fakeAdapter({ entriesAt: () => [] });
    const quiet = await detectQuietPoint(adapter, TIMING);
    assert.equal(quiet.hydrationEndsAt, 0);
    assert.equal(quiet.reachedGraceLimit, false);
  });
});

describe('full measurement over a fake page', () => {
  // measureLayoutShift reads the wall clock, so this page runs on real
  // timers. The windows are short and the gaps are wide, so the split does
  // not depend on how fast the machine is.
  const PAGE_TIMING = {
    pollMs: 50,
    quietMs: 300,
    maxGraceMs: 3000,
    maxWaitMs: 20000,
    settledObservationMs: 700,
  };

  // A page object with just the two methods the measurement uses.
  function fakePage(entriesAt) {
    const startedAt = Date.now();
    return {
      evaluate: async () => entriesAt(Date.now() - startedAt),
      waitForTimeout: (ms) => new Promise((res) => { setTimeout(res, ms); }),
    };
  }

  it('books a shift inside the idle window as settled instability', async () => {
    // Quiet lands around 350ms; the 800ms shift arrives during the idle window.
    const page = fakePage(shiftsUpTo(50, 800));
    const summary = await measureLayoutShift(page, { timing: PAGE_TIMING });
    assert.equal(summary.hydration, 0.1);
    assert.equal(summary.settled, 0.1);
    assert.equal(summary.settledShifts, 1);
    assert.equal(summary.largestSettledShift, 0.1);
  });

  it('books everything before the quiet point as hydration', async () => {
    const page = fakePage(shiftsUpTo(50, 120, 200));
    const summary = await measureLayoutShift(page, { timing: PAGE_TIMING });
    assert.equal(summary.hydration, 0.3);
    assert.equal(summary.settled, 0);
  });
});

describe('fresh document rule', () => {
  const base = 'http://127.0.0.1:8765';

  it('demands a document for a page that has none yet', () => {
    assert.equal(requiresFreshDocument('about:blank', `${base}/`, base), true);
    assert.equal(requiresFreshDocument('', `${base}/`, base), true);
  });

  it('demands a document when only the hash would change', () => {
    // This is the leak the route order hits: /#about to /#analytics is a
    // fragment navigation, so the app never remounts and the observer keeps
    // the first route's entries.
    assert.equal(requiresFreshDocument(`${base}/#about`, `${base}/#analytics`, base), true);
  });

  it('demands a document when the URL does not change at all', () => {
    // Two audited routes share /#analytics. Without this the second one
    // measures a document that never reloaded.
    assert.equal(requiresFreshDocument(`${base}/#analytics`, `${base}/#analytics`, base), true);
  });

  it('leaves a real navigation alone', () => {
    assert.equal(requiresFreshDocument(`${base}/#about`, `${base}/faq/`, base), false);
    assert.equal(
      requiresFreshDocument(`${base}/?_audit=a#desktop`, `${base}/?_audit=b#desktop`, base),
      false,
    );
    assert.equal(requiresFreshDocument(`${base}/`, `${base}/?q=journalism`, base), false);
  });

  it('demands a document when a URL cannot be parsed', () => {
    assert.equal(requiresFreshDocument(`${base}/#about`, 'not a url', base), true);
  });
});
