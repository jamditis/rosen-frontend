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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sortRecords, RECORD_SORTS } from '../frontend/utils/recordSort.js';

// App.js is read as text, not imported: it uses esm.sh import-map specifiers the
// node test runner cannot resolve, so the layout is asserted from source in the
// same way view-transition.test.js and archive-analytics.test.js check theirs.
const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSrc = fs.readFileSync(path.join(rootDir, 'frontend', 'App.js'), 'utf-8');
const archiveResultsSrc = fs.readFileSync(
  path.join(rootDir, 'frontend', 'components', 'ArchiveResults.js'),
  'utf-8',
);
// Production serves this pre-built bundle directly (index.html links it); there
// is no Tailwind build step, so a utility class the source uses but the bundle
// omits is inert in production.
const shippedCss = fs.readFileSync(
  path.join(rootDir, 'frontend', 'dist', 'tailwind.css'),
  'utf-8',
);

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

  it('keeps chronological order available as an explicit sort', () => {
    // Readers can still select oldest-first when they want a chronological
    // sequence, even though the archive now opens with its newest records.
    assert.ok(RECORD_SORTS.includes('date-asc'));
  });

  it('opens the archive with newest records first', () => {
    assert.match(appSrc, /useState\('date-desc'\)/);
  });
});

describe('record grid renders row-major so array order is the reading order (#529)', () => {
  it('uses a CSS grid, not columns masonry, for the record grid', () => {
    // The records array is already chronological; a row-major grid (left-to-right
    // then down) makes that the reading order. This is the actual #529 fix, so
    // pin it: the sort tests above cannot catch a layout regression on their own.
    assert.match(archiveResultsSrc, /'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6'/);
  });

  it('leaves no masonry classes that would restore column-major flow', () => {
    // Regression guard on the real fix surface. The old `columns-*` masonry and
    // the `break-inside-avoid` card class flowed the grid column-major, which is
    // the jump-around order Jay reported; reverting to either reintroduces #529.
    assert.doesNotMatch(archiveResultsSrc, /columns-1 md:columns-2 xl:columns-3/);
    assert.doesNotMatch(archiveResultsSrc, /break-inside-avoid/);
  });

  it('ships every grid class the record grid depends on', () => {
    // With no build step, a grid class the source names but the pre-built bundle
    // lacks is inert: the columns to grid swap left xl at two columns because
    // .xl:grid-cols-3 was missing from the shipped CSS. Pin the three the grid
    // uses so a future breakpoint change cannot silently drop back a column.
    for (const rule of ['.grid-cols-1{', '.md\\:grid-cols-2{', '.xl\\:grid-cols-3{']) {
      assert.ok(shippedCss.includes(rule), `shipped tailwind.css is missing ${rule}`);
    }
  });
});
