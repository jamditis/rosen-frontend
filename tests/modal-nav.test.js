/**
 * Tests for the record modal's prev/next nav flags (#421).
 *
 * Regression: a deep-linked record excluded by the active filters opens the
 * modal but is absent from `filteredRecords`, so its index is -1. The old
 * derivation reported hasNext = true for index === -1 on any non-empty list,
 * leaving a Next button that looked enabled but did nothing (handleModalNav
 * no-ops on index === -1). Both flags must be false when the record is not in
 * the filtered list.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveNavFlags } from '../frontend/utils/modalNav.js';

const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('deriveNavFlags (#421)', () => {
  it('a middle record can go both directions', () => {
    assert.deepEqual(deriveNavFlags(list, 'b'), {
      index: 1, total: 3, hasPrev: true, hasNext: true,
    });
  });

  it('the first record has no prev', () => {
    assert.deepEqual(deriveNavFlags(list, 'a'), {
      index: 0, total: 3, hasPrev: false, hasNext: true,
    });
  });

  it('the last record has no next', () => {
    assert.deepEqual(deriveNavFlags(list, 'c'), {
      index: 2, total: 3, hasPrev: true, hasNext: false,
    });
  });

  it('a deep-linked record excluded by filters has neither prev nor next', () => {
    // The bug: hasNext was true here because -1 < length - 1.
    assert.deepEqual(deriveNavFlags(list, 'not-in-list'), {
      index: -1, total: 3, hasPrev: false, hasNext: false,
    });
  });

  it('a single-record list has neither prev nor next', () => {
    assert.deepEqual(deriveNavFlags([{ id: 'only' }], 'only'), {
      index: 0, total: 1, hasPrev: false, hasNext: false,
    });
  });

  it('an empty list yields index -1 and no navigation', () => {
    assert.deepEqual(deriveNavFlags([], 'a'), {
      index: -1, total: 0, hasPrev: false, hasNext: false,
    });
  });

  it('a null/undefined list is handled safely', () => {
    assert.deepEqual(deriveNavFlags(null, 'a'), {
      index: -1, total: 0, hasPrev: false, hasNext: false,
    });
    assert.deepEqual(deriveNavFlags(undefined, 'a'), {
      index: -1, total: 0, hasPrev: false, hasNext: false,
    });
  });
});
