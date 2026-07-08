/**
 * tour-state persistence tests
 *
 * Exercises the pure onboarding decision core (frontend/services/tourState.js)
 * built for issue #454. Two contracts matter most and get the most coverage:
 *
 *  1. Persistence: once a visitor dismisses or completes the tour, the entry
 *     point does not come back on a later read.
 *  2. Graceful degradation: a missing store, a store that throws, or an
 *     unrecognised stored value all resolve to "always skippable" and never
 *     throw, so a blocked-storage visitor (private mode, server render) is
 *     never trapped. This is the part the issue calls out explicitly.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOUR_STORAGE_KEY,
  TOUR_OUTCOMES,
  isTourOutcome,
  readTourState,
  shouldShowTourEntry,
  recordTourOutcome,
  clearTourState,
} from '../frontend/services/tourState.js';

// A fresh in-memory Web Storage stand-in per call, so no test leaks state into
// another. Only the three methods the module uses are implemented.
function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

// A store whose chosen operations throw, standing in for blocked storage.
function throwingStorage({ onGet = false, onSet = false, onRemove = false } = {}) {
  const boom = () => {
    throw new DOMException('storage is blocked', 'SecurityError');
  };
  return {
    getItem: onGet ? boom : () => null,
    setItem: onSet ? boom : () => {},
    removeItem: onRemove ? boom : () => {},
  };
}

describe('isTourOutcome', () => {
  it('accepts the two terminal outcomes and rejects everything else', () => {
    assert.equal(isTourOutcome('dismissed'), true);
    assert.equal(isTourOutcome('completed'), true);
    for (const bad of ['seen', '', null, undefined, 0, 'DISMISSED', {}]) {
      assert.equal(isTourOutcome(bad), false, `${JSON.stringify(bad)} is not an outcome`);
    }
  });
});

describe('readTourState — first-time visitor', () => {
  it('an empty store means not seen, and the entry point shows', () => {
    const state = readTourState(makeStorage());
    assert.deepEqual(state, { seen: false, outcome: null, storageAvailable: true });
    assert.equal(shouldShowTourEntry(state), true);
  });
});

describe('persistence round-trip', () => {
  for (const outcome of [TOUR_OUTCOMES.dismissed, TOUR_OUTCOMES.completed]) {
    it(`recording "${outcome}" is seen on the next read and hides the entry point`, () => {
      const storage = makeStorage();
      const result = recordTourOutcome(storage, outcome);
      assert.deepEqual(result, { persisted: true, outcome });
      assert.equal(storage.getItem(TOUR_STORAGE_KEY), outcome);

      const state = readTourState(storage);
      assert.deepEqual(state, { seen: true, outcome, storageAvailable: true });
      assert.equal(shouldShowTourEntry(state), false);
    });
  }
});

describe('graceful degradation', () => {
  it('no store at all resolves to the safe default without throwing (server render)', () => {
    for (const missing of [null, undefined, {}]) {
      const state = readTourState(missing);
      assert.deepEqual(state, { seen: false, outcome: null, storageAvailable: false });
      assert.equal(shouldShowTourEntry(state), true, 'the skippable entry still shows');
    }
  });

  it('a getItem that throws (blocked storage) degrades to always-skippable', () => {
    const state = readTourState(throwingStorage({ onGet: true }));
    assert.deepEqual(state, { seen: false, outcome: null, storageAvailable: false });
    assert.equal(shouldShowTourEntry(state), true);
  });

  it('an unrecognised stored value counts as not seen and never hides the tour', () => {
    const state = readTourState(makeStorage({ [TOUR_STORAGE_KEY]: 'garbage-v0' }));
    assert.deepEqual(state, { seen: false, outcome: null, storageAvailable: true });
    assert.equal(shouldShowTourEntry(state), true);
  });

  it('a setItem that throws reports not persisted and does not trap the visitor', () => {
    const result = recordTourOutcome(throwingStorage({ onSet: true }), TOUR_OUTCOMES.dismissed);
    assert.deepEqual(result, { persisted: false, outcome: TOUR_OUTCOMES.dismissed });
  });

  it('recording with no store returns not persisted without throwing', () => {
    assert.deepEqual(recordTourOutcome(null, TOUR_OUTCOMES.completed), {
      persisted: false,
      outcome: TOUR_OUTCOMES.completed,
    });
  });
});

describe('recordTourOutcome — caller bugs fail loud', () => {
  it('an invalid outcome throws a TypeError rather than writing garbage', () => {
    const storage = makeStorage();
    assert.throws(() => recordTourOutcome(storage, 'skip'), TypeError);
    assert.equal(storage.getItem(TOUR_STORAGE_KEY), null, 'nothing was written');
  });
});

describe('clearTourState', () => {
  it('clearing restores the first-time state', () => {
    const storage = makeStorage();
    recordTourOutcome(storage, TOUR_OUTCOMES.completed);
    assert.equal(shouldShowTourEntry(readTourState(storage)), false);

    const result = clearTourState(storage);
    assert.deepEqual(result, { cleared: true });
    assert.equal(shouldShowTourEntry(readTourState(storage)), true);
  });

  it('degrades softly when the store is missing or removeItem throws', () => {
    assert.deepEqual(clearTourState(null), { cleared: false });
    assert.deepEqual(clearTourState(throwingStorage({ onRemove: true })), { cleared: false });
  });
});
