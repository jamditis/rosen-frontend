/**
 * query-composition tests
 *
 * Exercises the pure QueryBuilder -> archive-filter data layer
 * (frontend/services/queryComposition.js) built for issue #135 Path A. The
 * contracts that matter most: aggregate query results carry no record ids (so
 * they are non-composable), and the recordIds filter distinguishes null ("no
 * query active, show everything") from [] ("a query matched zero records, show
 * nothing"). Both are pure and DOM-free, so they round-trip under `node --test`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as queryComposition from '../frontend/services/queryComposition.js';

const {
  extractRecordIds,
  templateIsComposable,
  intersectByRecordIds,
} = queryComposition;

// A record-returning query result (the SELECT carries an id column).
const RECORD_ROWS = [
  { id: 'rec-3', title: 'C', date: '2024-03-01' },
  { id: 'rec-1', title: 'A', date: '2024-01-01' },
  { id: 'rec-3', title: 'C dup', date: '2024-03-02' }, // a join can repeat a record
];

// An aggregate query result (COUNT/GROUP BY templates): no id column at all.
const AGGREGATE_ROWS = [
  { year: '2024', count: 42 },
  { year: '2023', count: 17 },
];

describe('extractRecordIds', () => {
  it('returns [] for non-array / empty input', () => {
    assert.deepStrictEqual(extractRecordIds(null), []);
    assert.deepStrictEqual(extractRecordIds(undefined), []);
    assert.deepStrictEqual(extractRecordIds([]), []);
  });

  it('returns [] for aggregate rows with no id column', () => {
    assert.deepStrictEqual(extractRecordIds(AGGREGATE_ROWS), []);
  });

  it('pulls ids, dedupes, and preserves first-occurrence order', () => {
    assert.deepStrictEqual(extractRecordIds(RECORD_ROWS), ['rec-3', 'rec-1']);
  });

  it('coerces a numeric id column to a string', () => {
    assert.deepStrictEqual(extractRecordIds([{ id: 5 }, { id: 12 }]), ['5', '12']);
  });

  it('skips rows with a null / empty id and non-object rows', () => {
    const rows = [{ id: 'a' }, { id: null }, { id: '' }, null, 'nope', { id: 'b' }];
    assert.deepStrictEqual(extractRecordIds(rows), ['a', 'b']);
  });

  it('honours a custom id column name', () => {
    assert.deepStrictEqual(
      extractRecordIds([{ record_id: 'x' }, { record_id: 'y' }], 'record_id'),
      ['x', 'y'],
    );
  });

});

describe('templateIsComposable', () => {
  it('is true only when a template explicitly declares composable: true', () => {
    assert.equal(templateIsComposable({ id: 'search-titles', composable: true }), true);
  });

  it('is false for an aggregate template marked composable: false', () => {
    assert.equal(templateIsComposable({ id: 'count-by-field', composable: false }), false);
  });

  it('defaults to false for a template with no composable flag', () => {
    assert.equal(templateIsComposable({ id: 'search-titles' }), false);
  });

  it('is false for null / undefined', () => {
    assert.equal(templateIsComposable(null), false);
    assert.equal(templateIsComposable(undefined), false);
  });

  it('does not treat a truthy non-true flag as composable', () => {
    assert.equal(templateIsComposable({ composable: 'yes' }), false);
    assert.equal(templateIsComposable({ composable: 1 }), false);
  });

  it('is independent of row count: composability is a template property', () => {
    // A record-returning template stays composable even when its query matched zero
    // rows -- the empty result is applied as an empty filter, not treated as aggregate.
    const recordTemplate = { id: 'records-by-year', composable: true };
    assert.equal(templateIsComposable(recordTemplate), true);
    assert.deepStrictEqual(extractRecordIds([]), []); // zero matches -> empty id set, still valid
  });
});

describe('intersectByRecordIds', () => {
  const ARCHIVE = [
    { id: 'rec-1', title: 'A' },
    { id: 'rec-2', title: 'B' },
    { id: 'rec-3', title: 'C' },
    { id: 'dissertation-1986', title: 'D' },
  ];

  it('returns every record when recordIds is null (no query active)', () => {
    assert.deepStrictEqual(intersectByRecordIds(ARCHIVE, null), ARCHIVE);
    assert.deepStrictEqual(intersectByRecordIds(ARCHIVE, undefined), ARCHIVE);
  });

  it('returns nothing when recordIds is [] (a query matched zero records)', () => {
    assert.deepStrictEqual(intersectByRecordIds(ARCHIVE, []), []);
  });

  it('narrows to the named records, preserving archive order', () => {
    const out = intersectByRecordIds(ARCHIVE, ['rec-3', 'rec-1']);
    assert.deepStrictEqual(
      out.map((r) => r.id),
      ['rec-1', 'rec-3'],
    );
  });

  it('keeps non-numeric string ids like dissertation-1986', () => {
    const out = intersectByRecordIds(ARCHIVE, ['dissertation-1986']);
    assert.deepStrictEqual(
      out.map((r) => r.id),
      ['dissertation-1986'],
    );
  });

  it('matches a numeric query id against a string record id (cross-type)', () => {
    const records = [{ id: '5' }, { id: '6' }];
    assert.deepStrictEqual(intersectByRecordIds(records, [5]), [{ id: '5' }]);
  });

  it('never matches a record whose id is null/empty', () => {
    const records = [{ id: null }, { id: '' }, { id: 'rec-1' }];
    assert.deepStrictEqual(intersectByRecordIds(records, ['rec-1']), [{ id: 'rec-1' }]);
    // a filter of only-unusable ids narrows to nothing, like an empty result
    assert.deepStrictEqual(intersectByRecordIds(records, [null, '']), []);
  });

  it('returns [] for a non-array records argument', () => {
    assert.deepStrictEqual(intersectByRecordIds(null, ['rec-1']), []);
  });
});

describe('deriveEntityScope', () => {
  it('keeps only entities linked to query records and replaces global mention counts', () => {
    assert.equal(
      typeof queryComposition.deriveEntityScope,
      'function',
      'queryComposition must export deriveEntityScope'
    );
    if (typeof queryComposition.deriveEntityScope !== 'function') return;

    const entities = [
      { id: 'person-1', type: 'Person', name: 'One', totalMentions: 20 },
      { id: 'org-1', type: 'Organization', name: 'Two', totalMentions: 15 },
      { id: 'concept-1', type: 'Concept', name: 'Three', totalMentions: 8 },
      { id: 'location-1', type: 'Location', name: 'Unrelated', totalMentions: 4 },
    ];
    const recordEntityMap = {
      'record-1': ['person-1', 'org-1', 'person-1'],
      'record-2': ['org-1', 'concept-1'],
      'record-outside-query': ['person-1', 'location-1'],
    };
    const records = [{ id: 'record-1' }, { id: 'record-2' }];

    const scope = queryComposition.deriveEntityScope(entities, recordEntityMap, records);

    assert.deepStrictEqual(
      scope.entities.map(({ id, totalMentions }) => ({ id, totalMentions })),
      [
        { id: 'person-1', totalMentions: 1 },
        { id: 'org-1', totalMentions: 2 },
        { id: 'concept-1', totalMentions: 1 },
      ]
    );
    assert.deepStrictEqual(scope.recordIdsByEntity.get('person-1'), ['record-1']);
    assert.deepStrictEqual(scope.recordIdsByEntity.get('org-1'), ['record-1', 'record-2']);
    assert.equal(scope.recordIdsByEntity.has('location-1'), false);
  });
});

describe('getEntityScope', () => {
  it('preserves the payload entity index when no query is active', () => {
    assert.equal(
      typeof queryComposition.getEntityScope,
      'function',
      'queryComposition must export getEntityScope'
    );
    if (typeof queryComposition.getEntityScope !== 'function') return;

    const entities = [
      { id: 'person-1', type: 'Person', name: 'One', totalMentions: 20 },
      { id: 'org-1', type: 'Organization', name: 'Two', totalMentions: 15 },
    ];
    const scope = queryComposition.getEntityScope(
      entities,
      { 'record-1': ['person-1'] },
      [{ id: 'record-1' }],
      false
    );

    assert.strictEqual(scope.entities, entities);
    assert.deepStrictEqual(
      scope.entities.map(({ id, totalMentions }) => ({ id, totalMentions })),
      [
        { id: 'person-1', totalMentions: 20 },
        { id: 'org-1', totalMentions: 15 },
      ]
    );
    assert.equal(scope.recordIdsByEntity, null);
  });

  it('derives the entity index when a query is active', () => {
    const entities = [
      { id: 'person-1', totalMentions: 20 },
      { id: 'org-1', totalMentions: 15 },
    ];
    const scope = queryComposition.getEntityScope(
      entities,
      { 'record-1': ['person-1'] },
      [{ id: 'record-1' }],
      true
    );

    assert.deepStrictEqual(scope.entities, [{ id: 'person-1', totalMentions: 1 }]);
    assert.deepStrictEqual(scope.recordIdsByEntity.get('person-1'), ['record-1']);
  });
});
