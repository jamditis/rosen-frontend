// Unit tests for archiveService.toRecords (#487). It replaced two slightly
// different inline record projections in fetchEntitiesData (the cache-hit path
// had `cached.records ||` and a `|| {}` guard; the network path had neither).
// The real entity payload (archive-entities.json) has no `records` key and
// always has recordEntityMap, so unifying on the guarded shape is byte-
// identical for real data; these pin that and the defensive edges.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { toRecords } from '../frontend/services/archiveService.js?v=3.4.5';

describe('toRecords', () => {
  it('derives records from recordEntityMap (the real-data path)', () => {
    const out = toRecords({ recordEntityMap: { 'R-1': ['E1', 'E2'], 'R-2': [] } });
    assert.deepEqual(out, [
      { id: 'R-1', relatedIds: ['E1', 'E2'] },
      { id: 'R-2', relatedIds: [] },
    ]);
  });

  it('prefers an explicit records array when present', () => {
    const records = [{ id: 'R-9', relatedIds: ['E9'] }];
    const out = toRecords({ records, recordEntityMap: { 'R-1': ['E1'] } });
    assert.equal(out, records); // same reference; recordEntityMap ignored
  });

  it('returns [] when recordEntityMap is missing', () => {
    assert.deepEqual(toRecords({}), []);
  });
});
