/**
 * Unit tests for the pre-launch link-integrity sweep (scripts/verify-links.js,
 * issue #345). These exercise the offline detection logic against a synthetic
 * fixture only (no network, no real dataset), so they stay deterministic and
 * do not flag the live data's known drift.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isWellFormedHttpUrl,
  isValidRecordUrl,
  checkInternalLinks,
  checkUrlWellFormedness
} from '../scripts/verify-links.js';

const fixture = {
  version: 'test',
  records: [
    { id: 'RECORD-1', url: 'https://example.com/a', relatedIds: ['P0001'] },
    { id: 'RECORD-2', url: 'http://example.com/b', relatedIds: ['P0001', 'P9999'] }, // P9999 dangles
    { id: 'RECORD-3', url: 'mailto:x@example.com' }, // malformed: not http(s) and not site-local
    { id: 'RECORD-4', url: '/j/rosen-archive/dissertation/reader/' }, // valid site-local route
    { id: 'RECORD-5', url: 'https://example.com/e', relatedIds: ['RECORD-1'] } // RECORD-1 is a record id, not an entity
  ],
  entities: [
    { id: 'P0001', firstMentionRecordId: 'RECORD-1' },
    { id: 'P0002', firstMentionRecordId: 'RECORD-404' }, // record id in neither set
    { id: 'P0003', firstMentionRecordId: 'P0001' } // P0001 is an entity id, not a record
  ]
};
const aux = {
  recordEntityMap: {
    'RECORD-1': ['P0001'],
    'RECORD-404': ['P0001'], // dangling key
    'RECORD-2': ['P0001', 'P9999'] // P9999 dangling value
  }
};

describe('isWellFormedHttpUrl', () => {
  it('accepts absolute http and https urls', () => {
    assert.ok(isWellFormedHttpUrl('https://example.com/x'));
    assert.ok(isWellFormedHttpUrl('http://example.com'));
  });
  it('rejects relative paths, empty, non-http schemes', () => {
    assert.ok(!isWellFormedHttpUrl('/relative/path'));
    assert.ok(!isWellFormedHttpUrl(''));
    assert.ok(!isWellFormedHttpUrl(null));
    assert.ok(!isWellFormedHttpUrl('mailto:x@example.com'));
    assert.ok(!isWellFormedHttpUrl('ftp://example.com'));
  });
});

describe('isValidRecordUrl', () => {
  it('accepts absolute http(s) and site-local routes', () => {
    assert.ok(isValidRecordUrl('https://example.com/x'));
    assert.ok(isValidRecordUrl('/j/rosen-archive/dissertation/reader/'));
  });
  it('rejects empty, bare slash, and non-http non-relative values', () => {
    assert.ok(!isValidRecordUrl(''));
    assert.ok(!isValidRecordUrl('/'));
    assert.ok(!isValidRecordUrl('mailto:x@example.com'));
    assert.ok(!isValidRecordUrl(null));
  });
});

describe('checkInternalLinks', () => {
  const findings = checkInternalLinks(fixture, aux);
  const ofType = (t) => findings.filter((f) => f.failureType === t);

  it('flags a relatedIds reference that is not a valid entity', () => {
    const f = ofType('dangling_related_entity');
    const targets = f.map((x) => `${x.sourceId}:${x.target}`);
    assert.ok(targets.includes('RECORD-2:P9999'), 'unknown id flagged');
    // RECORD-1 is a valid record id but not an entity. Flagging it proves relatedIds
    // are validated against the entity space alone, not records-or-entities: a union
    // check would false-pass every relatedId and miss all real drift.
    assert.ok(targets.includes('RECORD-5:RECORD-1'), 'record id used as relatedId flagged');
    assert.equal(f.length, 2);
  });

  it('flags a firstMentionRecordId that is not a valid record', () => {
    const f = ofType('dangling_first_mention_record');
    const targets = f.map((x) => `${x.sourceId}:${x.target}`);
    assert.ok(targets.includes('P0002:RECORD-404'), 'unknown id flagged');
    // P0001 is a valid entity id but not a record. Flagging it proves firstMentionRecordId
    // is validated against the record space alone, the mirror of the relatedIds guard.
    assert.ok(targets.includes('P0003:P0001'), 'entity id used as firstMentionRecordId flagged');
    assert.equal(f.length, 2);
  });

  it('flags a recordEntityMap key that is not a record', () => {
    const f = ofType('dangling_record_entity_map_key');
    assert.equal(f.length, 1);
    assert.equal(f[0].sourceId, 'RECORD-404');
  });

  it('flags a recordEntityMap value that is not an entity', () => {
    const f = ofType('dangling_record_entity_map_value');
    assert.equal(f.length, 1);
    assert.equal(f[0].target, 'P9999');
  });

  it('does not flag valid references', () => {
    // RECORD-1 relatedIds P0001, entity P0001 firstMention RECORD-1, map RECORD-1 -> P0001 all resolve.
    const cleanSources = findings.map((f) => `${f.sourceId}:${f.target}`);
    assert.ok(!cleanSources.includes('RECORD-1:P0001'));
  });
});

describe('checkUrlWellFormedness', () => {
  it('flags only the malformed url', () => {
    const findings = checkUrlWellFormedness(fixture.records);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].sourceId, 'RECORD-3');
    assert.equal(findings[0].failureType, 'malformed_url');
  });
});
