/**
 * Tests for the record grid ordering (issue #529).
 *
 * Jay picked a year in the volume bars and expected the records to read
 * left-to-right in chronological order; the grid instead "jumped around"
 * (for 2026: Jan 1, Jan 22, Jan 24, then April, with March later on scroll).
 * The array order was already chronological — the old CSS `columns` masonry
 * flowed it column-major, so reading across a row skipped dates. The grid is
 * now row-major, which makes the array order the reading order, so these tests
 * pin the array order itself: 'date-asc' oldest-first, and no month-out-of-order.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { sortRecords, RECORD_SORTS } from '../frontend/utils/recordSort.js';

// The exact shape Jay flagged: 2026 records across several months, shuffled in
// input with March placed AFTER April, so a comparator that left input order
// (or mis-ordered the months) would fail the first assertion.
const recs = [
  { id: 'c', date: '2026-04-22', title: 'Apr' },
  { id: 'a', date: '2026-01-01', title: 'Jan 1' },
  { id: 'e', date: '2026-03-10', title: 'Mar' },
  { id: 'b', date: '2026-01-22', title: 'Jan 22' },
  { id: 'd', date: '2026-01-24', title: 'Jan 24' },
];

describe('sortRecords — per-year record ordering (#529)', () => {
  it('date-asc reads oldest-first, left-to-right chronological (March before April)', () => {
    const out = sortRecords(recs, 'date-asc').map((r) => r.date);
    assert.deepEqual(out, [
      '2026-01-01',
      '2026-01-22',
      '2026-01-24',
      '2026-03-10',
      '2026-04-22',
    ]);
  });

  it('date-desc reverses to newest-first', () => {
    const out = sortRecords(recs, 'date-desc').map((r) => r.date);
    assert.deepEqual(out, [
      '2026-04-22',
      '2026-03-10',
      '2026-01-24',
      '2026-01-22',
      '2026-01-01',
    ]);
  });

  it('an unknown sort key falls back to date-desc (the historical default)', () => {
    const out = sortRecords(recs, 'nonsense').map((r) => r.date);
    assert.deepEqual(out, sortRecords(recs, 'date-desc').map((r) => r.date));
  });

  it('title-asc orders alphabetically by title', () => {
    const out = sortRecords(recs, 'title-asc').map((r) => r.title);
    assert.deepEqual(out, ['Apr', 'Jan 1', 'Jan 22', 'Jan 24', 'Mar']);
  });

  it('does not mutate the input array', () => {
    const before = recs.map((r) => r.id);
    sortRecords(recs, 'date-asc');
    assert.deepEqual(recs.map((r) => r.id), before);
  });

  it('a missing date does not throw and sorts as the earliest key', () => {
    const withGap = [{ id: 'x', date: '2026-01-01' }, { id: 'y' }];
    const out = sortRecords(withGap, 'date-asc').map((r) => r.id);
    assert.deepEqual(out, ['y', 'x']); // '' sorts before any real date
  });

  it('date-asc is the default the year filter relies on', () => {
    // The app defaults sortBy to 'date-asc' (App.js), so a year click shows the
    // oldest record first. Guard that 'date-asc' is a recognised sort, not a
    // silent fallthrough to date-desc.
    assert.ok(RECORD_SORTS.includes('date-asc'));
  });
});
