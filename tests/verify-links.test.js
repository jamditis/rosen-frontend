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
  checkUrlWellFormedness,
  collectUrlRecords,
  buildUrlSourceMap,
  collectFeaturedUrls,
  checkFeaturedUrlWellFormedness
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
  it('rejects protocol-relative urls that only look site-local', () => {
    // `//host/path` starts with `/` but a browser resolves it as a scheme-relative
    // external link, so it is neither a valid internal route nor a well-formed http url.
    assert.ok(!isValidRecordUrl('//example.com/path'));
    assert.ok(!isValidRecordUrl('//cdn.evil.test'));
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

describe('checkInternalLinks cross-file drift (archive-data.json vs archive-entities.json)', () => {
  it('flags a record whose relatedIds disagree with its recordEntityMap entry', () => {
    // R1: relatedIds {P1,P2} but the map says {P1}; every id resolves, so the
    // dangling checks pass and only a set-equality check catches the drift.
    const data = {
      records: [
        { id: 'R1', url: 'https://e.com/1', relatedIds: ['P1', 'P2'] },
        { id: 'R2', url: 'https://e.com/2', relatedIds: ['P1'] } // matches the map -> clean
      ],
      entities: [{ id: 'P1' }, { id: 'P2' }]
    };
    const drifted = {
      entities: [{ id: 'P1' }, { id: 'P2' }],
      recordEntityMap: { R1: ['P1'], R2: ['P1'] }
    };
    const drift = checkInternalLinks(data, drifted).filter((f) => f.failureType === 'record_entity_map_drift');
    assert.equal(drift.length, 1);
    assert.equal(drift[0].sourceId, 'R1');
  });

  it('flags a map value missing from archive-entities.json even when archive-data.json keeps it', () => {
    // P1 still exists in archive-data.json (entities) but archive-entities.json
    // dropped it, so the entity browser would follow the map into nothing.
    const data = {
      records: [{ id: 'R1', url: 'https://e.com/1', relatedIds: ['P1'] }],
      entities: [{ id: 'P1' }]
    };
    const auxDropped = { entities: [], recordEntityMap: { R1: ['P1'] } };
    const findings = checkInternalLinks(data, auxDropped);
    const aux = findings.filter((f) => f.failureType === 'dangling_record_entity_map_value_aux');
    assert.equal(aux.length, 1);
    assert.equal(aux[0].target, 'P1');
    // The data.entities check still resolves, so no plain dangling-value finding, and
    // relatedIds equals the map entry, so no drift -- the aux check is the only signal.
    assert.equal(findings.filter((f) => f.failureType === 'dangling_record_entity_map_value').length, 0);
    assert.equal(findings.filter((f) => f.failureType === 'record_entity_map_drift').length, 0);
  });

  it('flags a record that keeps relatedIds after its map key is dropped', () => {
    // The base fixture already has this case: RECORD-5 carries relatedIds but has no
    // recordEntityMap entry. The asymmetric check (iterate the map only) would miss it;
    // the union check treats the absent map entry as empty and flags the drift.
    const drift = checkInternalLinks(fixture, aux).filter((f) => f.failureType === 'record_entity_map_drift');
    assert.equal(drift.length, 1);
    assert.equal(drift[0].sourceId, 'RECORD-5');
  });

  it('does not fire the aux-entity check when archive-entities.json has no entity list', () => {
    // Backward-compat: the original fixture has no aux.entities, so the consumed-payload
    // check is skipped rather than treating every map value as dangling.
    const findings = checkInternalLinks(fixture, aux);
    assert.equal(findings.filter((f) => f.failureType === 'dangling_record_entity_map_value_aux').length, 0);
  });
});

describe('collectUrlRecords (core archive-data.json + split archive-details.json)', () => {
  it('merges both files, dedups identical pairs, keeps divergent and details-only urls', () => {
    const core = [
      { id: 'R1', url: 'https://e.com/1' },
      { id: 'R2', url: 'https://e.com/2' }
    ];
    const details = {
      R1: { url: 'https://e.com/1' }, // identical to core -> one entry
      R2: { url: 'https://e.com/2-changed' }, // split/stale deploy diverged -> own entry
      R3: { url: 'https://e.com/3' }, // present only in details -> included
      R4: {} // no url KEY -> modal keeps core url, falls back silently, skipped
    };
    const merged = collectUrlRecords(core, details);
    const pairs = merged.map((r) => `${r.id} ${r.url}`).sort();
    assert.deepEqual(pairs, [
      'R1 https://e.com/1',
      'R2 https://e.com/2',
      'R2 https://e.com/2-changed',
      'R3 https://e.com/3'
    ]);
  });

  it('keeps an explicit bad details url so the malformed modal link is flagged', () => {
    // The modal merges details over the core record, so a url key present-but-empty
    // overrides a valid core url and breaks the link. That must be checked, not skipped;
    // only a missing key falls back to core.
    const core = [{ id: 'R1', url: 'https://e.com/good' }];
    const details = { R1: { url: '' } }; // explicit empty overrides core in the modal
    const merged = collectUrlRecords(core, details);
    assert.ok(merged.some((r) => r.id === 'R1' && r.url === ''), 'empty details url retained for checking');
    const malformed = checkUrlWellFormedness(merged).filter((f) => f.failureType === 'malformed_url');
    assert.ok(malformed.some((f) => f.sourceId === 'R1'), 'the empty modal url is reported');
  });
});

describe('buildUrlSourceMap', () => {
  it('maps each probeable url back to every record id that carries it', () => {
    const urlRecords = [
      { id: 'R1', url: 'https://e.com/x' },
      { id: 'R2', url: 'https://e.com/x' }, // shared url -> both ids retained
      { id: 'R3', url: '/site-local' }, // not a probeable http url -> skipped
      { id: 'R4', url: 'mailto:a@b.com' } // not http -> skipped
    ];
    const map = buildUrlSourceMap(urlRecords);
    assert.equal(map.size, 1);
    assert.deepEqual(map.get('https://e.com/x'), ['R1', 'R2']);
  });
});

describe('collectFeaturedUrls (FEATURED_WORKS image + link hotlinks, issue #479)', () => {
  it('emits an { id, url } pair per image and link, tagging the field; a missing field is a null pair', () => {
    const works = [
      { id: 'feat-1', image: 'https://images.unsplash.com/photo-1', link: 'https://pressthink.org/a' },
      { id: 'feat-2', image: 'https://images.unsplash.com/photo-2' } // no link -> a null link pair, not skipped
    ];
    const pairs = collectFeaturedUrls(works).map((p) => `${p.id} ${p.url}`).sort();
    assert.deepEqual(pairs, [
      'feat-1 (image) https://images.unsplash.com/photo-1',
      'feat-1 (link) https://pressthink.org/a',
      'feat-2 (image) https://images.unsplash.com/photo-2',
      'feat-2 (link) null'
    ]);
  });

  it('emits a null-url pair for a missing or null field (FeaturedSection renders it directly) so the check can fail it', () => {
    const works = [{ id: 'feat-1', image: 'https://images.unsplash.com/p', link: null }];
    const pairs = collectFeaturedUrls(works);
    assert.equal(pairs.length, 2);
    const linkPair = pairs.find((p) => p.id === 'feat-1 (link)');
    assert.equal(linkPair.url, null);
  });

  it('handles an empty or absent list', () => {
    assert.deepEqual(collectFeaturedUrls([]), []);
    assert.deepEqual(collectFeaturedUrls(undefined), []);
  });
});

describe('checkFeaturedUrlWellFormedness', () => {
  it('passes absolute http(s) hotlinks and flags anything else', () => {
    const featuredUrls = [
      { id: 'feat-1 (image)', url: 'https://images.unsplash.com/photo-1' }, // ok
      { id: 'feat-2 (image)', url: '/relative/path' }, // site-local route is not a valid hotlink
      { id: 'feat-3 (link)', url: '' }, // empty
      { id: 'feat-4 (image)', url: 'not a url' } // malformed
    ];
    const findings = checkFeaturedUrlWellFormedness(featuredUrls);
    const flagged = findings.map((f) => f.sourceId).sort();
    assert.deepEqual(flagged, ['feat-2 (image)', 'feat-3 (link)', 'feat-4 (image)']);
    assert.ok(findings.every((f) => f.failureType === 'malformed_featured_url'));
  });

  it('flags a missing required field (null url) so a broken launch card cannot ship green', () => {
    const featuredUrls = [
      { id: 'feat-1 (image)', url: 'https://images.unsplash.com/p' }, // ok
      { id: 'feat-2 (link)', url: null } // missing required field -> FeaturedSection would render href=undefined
    ];
    const findings = checkFeaturedUrlWellFormedness(featuredUrls);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].sourceId, 'feat-2 (link)');
    assert.equal(findings[0].failureType, 'malformed_featured_url');
    assert.equal(findings[0].target, null);
    assert.match(findings[0].detail, /missing a required/);
  });

  it('returns no findings for an all-clean set', () => {
    const featuredUrls = [{ id: 'feat-1 (image)', url: 'https://images.unsplash.com/photo' }];
    assert.deepEqual(checkFeaturedUrlWellFormedness(featuredUrls), []);
  });
});
