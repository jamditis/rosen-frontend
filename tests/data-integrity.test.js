/**
 * Data integrity tests for generated JSON files
 *
 * Validates that the 4 output JSON files from the export pipeline
 * have correct schema, cross-file consistency, and no data errors.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ERAS } from '../data/eras.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');

let coreData, detailsData, entitiesData, fullData;

before(() => {
  coreData = JSON.parse(fs.readFileSync(path.join(dataDir, 'archive-core.json'), 'utf-8'));
  detailsData = JSON.parse(fs.readFileSync(path.join(dataDir, 'archive-details.json'), 'utf-8'));
  entitiesData = JSON.parse(fs.readFileSync(path.join(dataDir, 'archive-entities.json'), 'utf-8'));
  fullData = JSON.parse(fs.readFileSync(path.join(dataDir, 'archive-data.json'), 'utf-8'));
});

// ============================================
// archive-core.json
// ============================================

describe('archive-core.json', () => {
  it('has a version field', () => {
    assert.ok(coreData.version);
  });

  it('has a generated timestamp', () => {
    assert.ok(coreData.generated);
    assert.ok(!isNaN(new Date(coreData.generated).getTime()));
  });

  it('has a non-empty records array', () => {
    assert.ok(Array.isArray(coreData.records));
    assert.ok(coreData.records.length > 0, 'Expected at least 1 record');
  });

  it('has a facets object with required keys', () => {
    assert.ok(coreData.facets);
    assert.ok(Array.isArray(coreData.facets.categories));
    assert.ok(Array.isArray(coreData.facets.eras));
    assert.ok(coreData.facets.categories.length > 0);
    assert.ok(coreData.facets.eras.length > 0);
  });

  it('has an autocomplete index', () => {
    assert.ok(Array.isArray(coreData.autocompleteIndex));
    assert.ok(coreData.autocompleteIndex.length > 100, 'Expected substantial autocomplete index');
  });

  it('each record has required core fields', () => {
    const requiredFields = ['id', 'title', 'date', 'year', 'era', 'pub', 'categories', 'type', 'verified'];
    for (const record of coreData.records) {
      for (const field of requiredFields) {
        assert.ok(field in record, `Record ${record.id} missing field: ${field}`);
      }
    }
  });

  it('has no duplicate IDs', () => {
    const ids = coreData.records.map(r => r.id);
    const uniqueIds = new Set(ids);
    assert.strictEqual(ids.length, uniqueIds.size, `Found ${ids.length - uniqueIds.size} duplicate IDs`);
  });

  it('all records have valid type values', () => {
    const validTypes = new Set(['article', 'social', 'Dissertation']);
    for (const record of coreData.records) {
      assert.ok(validTypes.has(record.type), `Record ${record.id} has invalid type: ${record.type}`);
    }
  });

  it('the canonical era list matches the 8 shipped eras', () => {
    // Drift guard: the canonical list lives only in data/eras.js. Any edit to
    // it must be a deliberate edit to this golden list too (and, if values
    // change, a matching data migration). The order is the published
    // facets.eras order.
    assert.deepEqual(ERAS, [
      "Public Journalism (90s)",
      "Blogging Launch & Digital Disruption (2000-2004)",
      "Peak Blogging & Citizen Journalism (2005-2009)",
      "Social Media & Financial Crisis (2010-2015)",
      "View from Nowhere (10s)",
      "Trump Era & Democratic Crisis (2016-2020)",
      "Democracy in Crisis (20s)",
      "Platform Transition & Future Models (2021-Present)"
    ]);
  });

  it('all records have valid era values', () => {
    // validEras is built from the same canonical list the exporter imports
    // (data/eras.js), so this check can no longer drift from the exporter.
    const validEras = new Set(ERAS);
    for (const record of coreData.records) {
      assert.ok(validEras.has(record.era), `Record ${record.id} has invalid era: ${record.era}`);
    }
  });

  it('all records have categories as arrays', () => {
    for (const record of coreData.records) {
      assert.ok(Array.isArray(record.categories), `Record ${record.id} categories is not an array`);
    }
  });

  it('includes the dissertation record', () => {
    const diss = coreData.records.find(r => r.id === 'dissertation-1986');
    assert.ok(diss, 'Dissertation record not found');
    assert.strictEqual(diss.type, 'Dissertation');
    assert.strictEqual(diss.year, '1986');
  });

  it('has records sorted by date (newest first)', () => {
    for (let i = 1; i < coreData.records.length; i++) {
      const prev = coreData.records[i - 1].date;
      const curr = coreData.records[i].date;
      if (prev && curr) {
        assert.ok(prev >= curr, `Records not sorted: ${prev} before ${curr} at index ${i}`);
      }
    }
  });

  it('has summaryPreview field on all records', () => {
    for (const record of coreData.records) {
      assert.ok('summaryPreview' in record, `Record ${record.id} missing summaryPreview`);
    }
  });
});

// ============================================
// archive-details.json
// ============================================

describe('archive-details.json', () => {
  it('has a version field', () => {
    assert.ok(detailsData.version);
  });

  it('has a details object', () => {
    assert.ok(detailsData.details);
    assert.ok(typeof detailsData.details === 'object');
  });

  it('each detail entry has required fields', () => {
    const requiredFields = ['summary', 'url', 'author'];
    for (const [id, detail] of Object.entries(detailsData.details)) {
      for (const field of requiredFields) {
        assert.ok(field in detail, `Detail ${id} missing field: ${field}`);
      }
    }
  });

  it('publishes the corrected author for RECORD-00038', () => {
    assert.equal(detailsData.details['RECORD-00038']?.author, 'Marty Linsky');
    assert.match(
      detailsData.details['RECORD-00038']?.summary,
      /^Marty Linsky reviews Jay Rosen's book/
    );
    assert.equal(
      fullData.records.find(record => record.id === 'RECORD-00038')?.author,
      'Marty Linsky'
    );

    const deployVersion = JSON.parse(
      fs.readFileSync(path.join(dataDir, '..', 'version.json'), 'utf-8')
    ).version;
    assert.notEqual(
      deployVersion,
      '3.8.10',
      'the RECORD-00038 correction must ship in a new cache generation'
    );
  });

  it('THREAD records have thread_data in details', () => {
    const threadIds = Object.keys(detailsData.details).filter(id => id.startsWith('THREAD-'));
    assert.ok(threadIds.length > 0, 'Expected at least 1 THREAD record in details');

    for (const id of threadIds) {
      const detail = detailsData.details[id];
      assert.ok(detail.thread_data, `THREAD detail ${id} missing thread_data`);
      assert.ok(detail.thread_data.posts, `THREAD detail ${id} missing thread_data.posts`);
      assert.ok(Array.isArray(detail.thread_data.posts), `THREAD detail ${id} thread_data.posts is not an array`);
      assert.ok(detail.thread_data.posts.length >= 3, `THREAD ${id} has fewer than 3 posts: ${detail.thread_data.posts.length}`);
    }
  });

  it('thread_data posts have required fields', () => {
    const threadIds = Object.keys(detailsData.details).filter(id => id.startsWith('THREAD-'));
    for (const id of threadIds) {
      const posts = detailsData.details[id].thread_data.posts;
      for (const post of posts) {
        assert.ok('number' in post, `Thread ${id} post missing number`);
        assert.ok('id' in post, `Thread ${id} post missing id`);
        assert.ok('content' in post, `Thread ${id} post missing content`);
        assert.ok('depth' in post, `Thread ${id} post missing depth`);
      }
    }
  });
});

// ============================================
// archive-entities.json
// ============================================

describe('archive-entities.json', () => {
  it('has a version field', () => {
    assert.ok(entitiesData.version);
  });

  it('has entities array', () => {
    assert.ok(Array.isArray(entitiesData.entities));
    assert.ok(entitiesData.entities.length > 0, 'Expected at least 1 entity');
  });

  it('has recordEntityMap', () => {
    assert.ok(entitiesData.recordEntityMap);
    assert.ok(typeof entitiesData.recordEntityMap === 'object');
  });

  it('each entity has required fields', () => {
    const requiredFields = ['id', 'type', 'name'];
    for (const entity of entitiesData.entities) {
      for (const field of requiredFields) {
        assert.ok(entity[field], `Entity missing ${field}: ${JSON.stringify(entity).substring(0, 80)}`);
      }
    }
  });

  it('entities have valid types', () => {
    const validTypes = new Set(['Person', 'Organization', 'Concept', 'Work', 'Event', 'Location', 'Publication', 'Media']);
    for (const entity of entitiesData.entities) {
      assert.ok(validTypes.has(entity.type), `Entity ${entity.id} has unexpected type: ${entity.type}`);
    }
  });

  it('has no duplicate entity IDs', () => {
    const ids = entitiesData.entities.map(e => e.id);
    const uniqueIds = new Set(ids);
    assert.strictEqual(ids.length, uniqueIds.size, `Found ${ids.length - uniqueIds.size} duplicate entity IDs`);
  });

  it('does not orphan entities outside the known pre-existing baseline', () => {
    // An entity is orphaned when it is unreachable from every served record via
    // recordEntityMap. That is the exact condition under which the UI's
    // getRecordsByEntity() (archiveService.js: entityToRecords, built only from
    // served records' relatedIds) returns zero: the entity shows in the Explorer
    // but opens with no records. firstMentionRecordId is deliberately NOT part of
    // this test -- the UI never reads it to list records, so an unreachable entity
    // with a served first mention is still broken and must be counted.
    //
    // A baseline set of pre-existing unreachable entities remains, from records
    // with empty raw_text (issues #207 / #211 / #199) and from entities whose only
    // mentions are in unserved social posts. tests/fixtures/orphan-baseline.json
    // pins their exact ids. This asserts the current unreachable set is a SUBSET of
    // that baseline, so a future extraction slice -- or an exporter regression that
    // drops recordEntityMap links -- cannot introduce a new orphan even if an
    // unrelated cleanup drops the count by the same amount (a count ceiling would
    // miss that). The 9c social slice added ~1,350 orphans before its cleanup (PR
    // after #579); it now adds none. Shrink the fixture as the backlog clears.
    const baseline = new Set(JSON.parse(
      fs.readFileSync(path.join(__dirname, 'fixtures', 'orphan-baseline.json'), 'utf-8')));
    const servedIds = new Set(fullData.records.map(r => r.id));
    const reachable = new Set();
    for (const [recId, entIds] of Object.entries(entitiesData.recordEntityMap)) {
      if (servedIds.has(recId)) for (const eid of entIds) reachable.add(eid);
    }
    const orphaned = entitiesData.entities.filter(e => !reachable.has(e.id));
    const novel = orphaned.filter(e => !baseline.has(e.id));
    assert.equal(novel.length, 0,
      `${novel.length} entities are unreachable but not in the pinned baseline; a data change introduced entities that open with zero records: ${novel.slice(0, 5).map(e => `${e.id}:${e.name}`).join(', ')}`);
  });
});

// ============================================
// Cross-file consistency
// ============================================

describe('cross-file consistency', () => {
  it('publishes the verified #751 records and excludes its false-identity clip', () => {
    const fullIds = new Set(fullData.records.map(record => record.id));
    const coreIds = new Set(coreData.records.map(record => record.id));

    assert.ok(fullIds.has('RECORD-00804'), 'full data omits newly verified RECORD-00804');
    assert.ok(coreIds.has('RECORD-00804'), 'core data omits newly verified RECORD-00804');
    assert.ok(detailsData.details['RECORD-00804'], 'details omit newly verified RECORD-00804');
    assert.ok(!fullIds.has('CLIP-00023'), 'full data publishes the CLIP-00023 false identity');
    assert.ok(!coreIds.has('CLIP-00023'), 'core data publishes the CLIP-00023 false identity');
    assert.ok(!detailsData.details['CLIP-00023'], 'details publish the CLIP-00023 false identity');
  });

  it('entity first mentions resolve to records that the archive serves', () => {
    const servedIds = new Set(fullData.records.map(record => record.id));
    const entitiesById = new Map(fullData.entities.map(entity => [entity.id, entity]));
    const expectedFallbacks = new Map([
      ['C0007', 'RECORD-00014'],
      ['C1261', 'BSKY-02051'],
      ['P2353', 'TWTR-07504'],
    ]);

    for (const [entityId, recordId] of expectedFallbacks) {
      assert.strictEqual(
        entitiesById.get(entityId)?.firstMentionRecordId,
        recordId,
        `${entityId} should use its earliest served relationship as first mention`
      );
    }
    assert.strictEqual(entitiesById.get('P2353')?.role, '');
    assert.strictEqual(entitiesById.get('P2353')?.affiliation, '');

    for (const [label, entities] of [
      ['archive-data.json', fullData.entities],
      ['archive-entities.json', entitiesData.entities],
    ]) {
      const dangling = entities
        .filter(entity => entity.firstMentionRecordId)
        .filter(entity => !servedIds.has(entity.firstMentionRecordId))
        .map(entity => `${entity.id}:${entity.firstMentionRecordId}`);

      assert.deepStrictEqual(
        dangling,
        [],
        `${label} contains ${dangling.length} unserved first mentions: ${dangling.slice(0, 10).join(', ')}`
      );
    }
  });

  it('every core record ID has a details entry', () => {
    const missingDetails = [];
    for (const record of coreData.records) {
      // Dissertation details are served from archiveService constant, not from the JSON
      if (record.id === 'dissertation-1986') continue;
      if (!detailsData.details[record.id]) {
        missingDetails.push(record.id);
      }
    }
    assert.strictEqual(missingDetails.length, 0,
      `${missingDetails.length} core records missing details: ${missingDetails.slice(0, 5).join(', ')}...`);
  });

  it('every details entry has a core record', () => {
    const coreIds = new Set(coreData.records.map(r => r.id));
    const orphanDetails = [];
    for (const id of Object.keys(detailsData.details)) {
      if (!coreIds.has(id)) {
        orphanDetails.push(id);
      }
    }
    assert.strictEqual(orphanDetails.length, 0,
      `${orphanDetails.length} detail entries have no core record: ${orphanDetails.slice(0, 5).join(', ')}...`);
  });

  it('core and full data have the same record count', () => {
    assert.strictEqual(coreData.records.length, fullData.records.length,
      `Core has ${coreData.records.length} records but full has ${fullData.records.length}`);
  });

  it('core and full data have the same record IDs', () => {
    const coreIds = new Set(coreData.records.map(r => r.id));
    const fullIds = new Set(fullData.records.map(r => r.id));
    const inCoreNotFull = [...coreIds].filter(id => !fullIds.has(id));
    const inFullNotCore = [...fullIds].filter(id => !coreIds.has(id));
    assert.strictEqual(inCoreNotFull.length, 0, `IDs in core but not full: ${inCoreNotFull.join(', ')}`);
    assert.strictEqual(inFullNotCore.length, 0, `IDs in full but not core: ${inFullNotCore.join(', ')}`);
  });

  it('facets match between core and full data', () => {
    assert.deepStrictEqual(coreData.facets.categories, fullData.facets.categories);
    assert.deepStrictEqual(coreData.facets.eras, fullData.facets.eras);
  });

  it('all versions are the same across JSON files', () => {
    assert.strictEqual(coreData.version, detailsData.version);
    assert.strictEqual(coreData.version, entitiesData.version);
    assert.strictEqual(coreData.version, fullData.version);
  });
});

// ============================================
// archive-data.json (full)
// ============================================

describe('archive-data.json (full)', () => {
  it('has records, entities, facets, and autocompleteIndex', () => {
    assert.ok(Array.isArray(fullData.records));
    assert.ok(Array.isArray(fullData.entities));
    assert.ok(fullData.facets);
    assert.ok(Array.isArray(fullData.autocompleteIndex));
  });

  it('records have full fields (summary, quote, concepts, tags)', () => {
    // Sample a few records to verify full data presence
    const sample = fullData.records.slice(0, 50);
    for (const record of sample) {
      assert.ok('summary' in record, `Record ${record.id} missing summary`);
      assert.ok('quote' in record, `Record ${record.id} missing quote`);
      assert.ok('concepts' in record, `Record ${record.id} missing concepts`);
      assert.ok('tags' in record, `Record ${record.id} missing tags`);
      assert.ok('relatedIds' in record, `Record ${record.id} missing relatedIds`);
    }
  });

  it('no record has an empty title', () => {
    const emptyTitles = fullData.records.filter(r => !r.title || r.title.trim().length < 5);
    assert.strictEqual(emptyTitles.length, 0,
      `${emptyTitles.length} records have empty/short titles: ${emptyTitles.slice(0, 3).map(r => r.id).join(', ')}`);
  });

  it('all verified flags are true', () => {
    const unverified = fullData.records.filter(r => !r.verified);
    assert.strictEqual(unverified.length, 0,
      `${unverified.length} records are not verified`);
  });

  it('no thread member post survives in published JSON when its THREAD container is also present (#233)', () => {
    // The export pipeline (data/export-archive-data.js:475-510) filters social
    // posts that appear in any THREAD record's thread_data.posts. This pins
    // that invariant so a future refactor of the social-records filter can't
    // silently regress it — which would surface the same Bluesky/Twitter
    // thread twice in the UI (once as the THREAD container, once as the loose
    // root post).
    const recordsById = new Map(fullData.records.map(r => [r.id, r]));
    const threadRecords = fullData.records.filter(r => r.id.startsWith('THREAD-'));
    assert.ok(threadRecords.length > 0,
      'no THREAD-* records found in published JSON — the dedup invariant cannot be checked without thread containers');
    const duplicateMembers = [];
    for (const thread of threadRecords) {
      assert.ok(thread.thread_data && Array.isArray(thread.thread_data.posts),
        `THREAD record ${thread.id} is missing thread_data.posts — the export schema would need to change to remove it, which would itself be a regression of the dedup contract`);
      for (const post of thread.thread_data.posts) {
        if (post.id && recordsById.has(post.id)) {
          duplicateMembers.push(`${post.id} (member of ${thread.id})`);
        }
      }
    }
    assert.strictEqual(duplicateMembers.length, 0,
      `${duplicateMembers.length} thread member posts also exist as standalone records in the published JSON: ${duplicateMembers.slice(0, 5).join(', ')}`);
  });
});
