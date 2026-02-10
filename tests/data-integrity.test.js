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

  it('all records have valid era values', () => {
    const validEras = new Set([
      "Public Journalism (90s)",
      "Web & Blogging (00s)",
      "View from Nowhere (10s)",
      "Democracy in Crisis (20s)"
    ]);
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
});

// ============================================
// Cross-file consistency
// ============================================

describe('cross-file consistency', () => {
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
});
