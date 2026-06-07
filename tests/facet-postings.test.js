/**
 * Tests for the build-time facet posting lists + entity->records inversion
 * (issue #277).
 *
 * #277's two artifacts are deterministic projections, so their load-bearing
 * properties are structural, not size-based: the entity map must be an exact
 * transpose of the record->entity map already shipped (proving it is redundant
 * with data the bundle already carries), and each facet posting list must mirror
 * the live App.js/Sidebar.js filter semantics - including the content-type facet,
 * which is derived and non-exhaustive (some social records match no selectable
 * bucket). These tests pin both on a small synthetic fixture so they stay fast
 * and never drift with the real data files.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFacetPostingLists,
  invertRecordEntityMap,
  contentTypeKeys,
} from '../data/lib/facet-postings.js';

const records = [
  { id: 'R1', categories: ['Theory', 'Practice'], era: '90s', type: 'article', pub: 'PressThink' },
  { id: 'R2', categories: ['Theory'], era: '00s', type: 'social', pub: 'Twitter' },
  { id: 'R3', categories: [], era: '90s', type: 'article', pub: 'PressThink' },
  { id: 'R4', categories: ['Practice'], era: '', type: 'Dissertation' }, // non-social, no era/pub
  { id: 'R5', categories: ['Theory'], era: '00s', type: 'social', pub: 'Mastodon' }, // social, no platform bucket
];

describe('buildFacetPostingLists (#277)', () => {
  const postings = buildFacetPostingLists(records);

  it('indexes each record under every category it carries, in input order', () => {
    assert.deepEqual(postings.categories.Theory, ['R1', 'R2', 'R5']);
    assert.deepEqual(postings.categories.Practice, ['R1', 'R4']);
  });

  it('partitions records by era and publication', () => {
    assert.deepEqual(postings.eras['90s'], ['R1', 'R3']);
    assert.deepEqual(postings.eras['00s'], ['R2', 'R5']);
    assert.deepEqual(postings.publications.PressThink, ['R1', 'R3']);
    assert.deepEqual(postings.publications.Twitter, ['R2']);
  });

  it('mirrors the derived content-type facet: article = non-social, platforms by pub', () => {
    assert.deepEqual(postings.content_types.article, ['R1', 'R3', 'R4']);
    assert.deepEqual(postings.content_types.twitter, ['R2']);
    assert.equal(Object.hasOwn(postings.content_types, 'bluesky'), false); // none in fixture
    assert.equal(Object.hasOwn(postings.content_types, 'social'), false); // not a UI value
  });

  it('leaves a social record on an unsupported platform in NO content-type bucket', () => {
    // R5 (Mastodon) is filterable by publication but matches no content-type
    // value - the same gap the live App.js filter has.
    const allContentTypeIds = Object.values(postings.content_types).flat();
    assert.equal(allContentTypeIds.includes('R5'), false);
  });

  it('drops empty/missing facet values instead of bucketing under "" or "undefined"', () => {
    // R3 has no categories; R4 has no era and no pub.
    assert.equal(Object.hasOwn(postings.eras, ''), false);
    assert.equal(Object.hasOwn(postings.publications, ''), false);
    assert.equal(Object.hasOwn(postings.publications, 'undefined'), false);
  });
});

describe('contentTypeKeys (#277)', () => {
  it('returns ["article"] for any non-social record (articles and the dissertation)', () => {
    assert.deepEqual(contentTypeKeys({ type: 'article', pub: 'PressThink' }), ['article']);
    assert.deepEqual(contentTypeKeys({ type: 'Dissertation' }), ['article']);
  });

  it('maps social records to a platform value by publication string', () => {
    assert.deepEqual(contentTypeKeys({ type: 'social', pub: 'Twitter' }), ['twitter']);
    assert.deepEqual(contentTypeKeys({ type: 'social', pub: 'x.com user' }), ['twitter']);
    assert.deepEqual(contentTypeKeys({ type: 'social', pub: 'Bluesky' }), ['bluesky']);
  });

  it('returns [] for a social record on an unsupported platform', () => {
    assert.deepEqual(contentTypeKeys({ type: 'social', pub: 'Mastodon' }), []);
    assert.deepEqual(contentTypeKeys({ type: 'social' }), []); // missing pub
  });
});

describe('invertRecordEntityMap (#277)', () => {
  const recordEntityMap = {
    R1: ['E1', 'E2'],
    R2: ['E2', 'E3'],
    R3: ['E1'],
  };
  const entityToRecords = invertRecordEntityMap(recordEntityMap);

  it('is the exact transpose of the record->entity map', () => {
    assert.deepEqual(entityToRecords.E1, ['R1', 'R3']);
    assert.deepEqual(entityToRecords.E2, ['R1', 'R2']);
    assert.deepEqual(entityToRecords.E3, ['R2']);
  });

  it('round-trips: the set of forward edges equals the set of reverse edges', () => {
    const forward = new Set();
    for (const [recordId, entityIds] of Object.entries(recordEntityMap)) {
      for (const entityId of entityIds) forward.add(`${recordId}|${entityId}`);
    }
    const reverse = new Set();
    for (const [entityId, recordIds] of Object.entries(entityToRecords)) {
      for (const recordId of recordIds) reverse.add(`${recordId}|${entityId}`);
    }
    assert.deepEqual([...forward].sort(), [...reverse].sort());
  });

  it('returns an empty object for an empty map', () => {
    assert.equal(Object.keys(invertRecordEntityMap({})).length, 0);
  });
});
