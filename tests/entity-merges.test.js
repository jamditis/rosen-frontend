/**
 * Structured entity merges (#874).
 *
 * When two entity rows turn out to name the same thing, one row is retired and
 * its mentions and relationships move to the other. Before #874 the only trace
 * of that was free text in the notes column of extracted_entities.csv, so a
 * link or a cached payload that still carried the retired id had nothing to
 * follow. data/entity-merges.csv now records each merge as a row, the exporter
 * publishes it as `entityRedirects` in archive-entities.json, and the frontend
 * resolves a retired id to its canonical entity.
 *
 * These tests pin four layers: the parser and redirect builder in
 * data/lib/entity-merges.js, the committed merge table against the entity and
 * relationship CSVs, the generated entity payload, and the frontend lookup.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

import {
  ENTITY_MERGE_COLUMNS,
  parseEntityMerges,
  buildEntityRedirects,
} from '../data/lib/entity-merges.js';

const repositoryRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRepo = (relative) => readFileSync(path.join(repositoryRoot, relative), 'utf8');
const readCsv = (relative) => parse(readRepo(relative), { columns: true, skip_empty_lines: true });

const HEADER = ENTITY_MERGE_COLUMNS.join(',');
const row = (fields) => ENTITY_MERGE_COLUMNS.map((column) => fields[column] ?? '').join(',');

describe('entity merge parser and redirect builder (#874)', () => {
  it('parses a merge table into one structured row per retired id', () => {
    const text = [
      HEADER,
      row({ retired_id: 'W0666', retired_type: 'Work', retired_name: 'PressThink', canonical_id: 'O0033', merged_on: '2026-08-27', issue: '#859', reason: 'Same blog' }),
      '',
    ].join('\n');
    assert.deepEqual(parseEntityMerges(text), [{
      retiredId: 'W0666',
      retiredType: 'Work',
      retiredName: 'PressThink',
      canonicalId: 'O0033',
      mergedOn: '2026-08-27',
      issue: '#859',
      reason: 'Same blog',
    }]);
  });

  it('rejects a table whose header drifts from the documented columns', () => {
    assert.throws(() => parseEntityMerges('retired,canonical\nW0666,O0033\n'), /header/);
  });

  it('rejects a row with a malformed id or date', () => {
    const bad = (fields) => [HEADER, row({ retired_id: 'W0666', retired_type: 'Work', retired_name: 'x', canonical_id: 'O0033', merged_on: '2026-08-27', issue: '#859', ...fields })].join('\n');
    assert.throws(() => parseEntityMerges(bad({ retired_id: 'w666' })), /retired_id/);
    assert.throws(() => parseEntityMerges(bad({ canonical_id: '' })), /canonical_id/);
    assert.throws(() => parseEntityMerges(bad({ merged_on: 'August' })), /merged_on/);
    assert.throws(() => parseEntityMerges(bad({ canonical_id: 'W0666' })), /itself/);
  });

  it('rejects the same retired id listed twice', () => {
    const line = row({ retired_id: 'W0666', retired_type: 'Work', retired_name: 'x', canonical_id: 'O0033', merged_on: '2026-08-27', issue: '#859' });
    assert.throws(() => parseEntityMerges([HEADER, line, line].join('\n')), /more than once/);
  });

  it('maps each retired id to a live canonical id', () => {
    const merges = [{ retiredId: 'W0666', canonicalId: 'O0033' }];
    assert.deepEqual(buildEntityRedirects(merges, new Set(['O0033'])), { W0666: 'O0033' });
  });

  it('follows a chain of merges to the entity that is still live', () => {
    const merges = [
      { retiredId: 'A0001', canonicalId: 'B0001' },
      { retiredId: 'B0001', canonicalId: 'C0001' },
    ];
    assert.deepEqual(buildEntityRedirects(merges, new Set(['C0001'])), { A0001: 'C0001', B0001: 'C0001' });
  });

  it('refuses a cycle, a dangling canonical id, or a retired id that is still live', () => {
    assert.throws(() => buildEntityRedirects([
      { retiredId: 'A0001', canonicalId: 'B0001' },
      { retiredId: 'B0001', canonicalId: 'A0001' },
    ], new Set()), /cycle/);
    assert.throws(() => buildEntityRedirects([{ retiredId: 'W0666', canonicalId: 'O9999' }], new Set()), /O9999/);
    assert.throws(() => buildEntityRedirects([{ retiredId: 'W0666', canonicalId: 'O0033' }], new Set(['W0666', 'O0033'])), /still/);
  });
});

describe('committed entity merge table (#874)', () => {
  const merges = parseEntityMerges(readRepo('data/entity-merges.csv'));
  const entities = readCsv('data/extracted_entities.csv');
  const relationships = readCsv('data/extracted_relationships.csv');
  const liveIds = new Set(entities.map((entity) => entity.entity_id));
  const redirects = buildEntityRedirects(merges, liveIds);

  it('backfills the PressThink merge that was only in free-text notes (#859)', () => {
    const pressthink = merges.find((merge) => merge.retiredId === 'W0666');
    assert.ok(pressthink, 'data/entity-merges.csv must record the W0666 merge');
    assert.equal(pressthink.canonicalId, 'O0033');
    assert.equal(pressthink.retiredType, 'Work');
    assert.equal(pressthink.retiredName, 'PressThink');
    assert.equal(pressthink.issue, '#859');
  });

  it('keeps no entity row for a retired id', () => {
    const stale = merges.filter((merge) => liveIds.has(merge.retiredId)).map((merge) => merge.retiredId);
    assert.deepEqual(stale, []);
  });

  it('leaves no relationship pointing at a retired id', () => {
    const stray = relationships
      .filter((rel) => redirects[rel.source_entity_id] || redirects[rel.target_entity_id])
      .map((rel) => rel.relationship_id);
    assert.deepEqual(stray, [], 'every relationship that named a retired entity must be re-pointed at its canonical id');
  });

});

describe('entity export carries the redirects (#874)', () => {
  it('publishes entityRedirects in archive-entities.json matching the merge table', () => {
    const payload = JSON.parse(readRepo('data/archive-entities.json'));
    const liveIds = new Set(payload.entities.map((entity) => entity.id));
    const expected = buildEntityRedirects(parseEntityMerges(readRepo('data/entity-merges.csv')), liveIds);
    assert.deepEqual(payload.entityRedirects, expected);
    for (const canonicalId of Object.values(payload.entityRedirects)) {
      assert.ok(liveIds.has(canonicalId), `${canonicalId} must be a published entity`);
    }
  });

  it('declares entityRedirects in data/schema.json', () => {
    const schema = JSON.parse(readRepo('data/schema.json'));
    assert.ok(schema.properties.entityRedirects, 'schema must describe the entityRedirects map');
  });

  it('wires the merge table into the exporter', () => {
    const exporter = readRepo('data/export-archive-data.js');
    assert.match(exporter, /entity-merges\.csv/);
    assert.match(exporter, /entityRedirects/);
  });
});

describe('frontend resolves a retired entity id (#874)', () => {
  const SERVICE_PATH = '../frontend/services/archiveService.js';
  let originalFetch;
  let originalLocalStorage;
  let originalSessionStorage;
  const stubStorage = () => ({ getItem: () => null, setItem: () => {}, removeItem: () => {}, length: 0, key: () => null });
  let counter = 0;
  const freshService = () => import(`${SERVICE_PATH}?merge-probe=${Date.now()}-${counter++}`);

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalLocalStorage = globalThis.localStorage;
    originalSessionStorage = globalThis.sessionStorage;
    globalThis.localStorage = stubStorage();
    globalThis.sessionStorage = stubStorage();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalLocalStorage;
    globalThis.sessionStorage = originalSessionStorage;
  });

  it('looks a retired id up as its canonical entity once the entity index loads', async () => {
    const pressthink = { id: 'O0033', type: 'Organization', name: 'PressThink' };
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        entities: [pressthink],
        recordEntityMap: { 'RECORD-00056': ['O0033'] },
        entityRedirects: { W0666: 'O0033' },
      }),
    });

    const service = await freshService();
    await service.fetchEntitiesData();
    assert.equal(service.resolveEntityId('W0666'), 'O0033');
    assert.equal(service.resolveEntityId('O0033'), 'O0033');
    assert.equal(service.resolveEntityId('P9999'), 'P9999', 'an unknown id passes through unchanged');
    assert.equal(service.getEntityById('W0666'), pressthink);
    assert.deepEqual(service.getRecordsByEntity('W0666'), ['RECORD-00056']);
  });

  it('ignores a malformed redirect map instead of failing the entity load', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ entities: [], recordEntityMap: {}, entityRedirects: ['W0666'] }),
    });
    const service = await freshService();
    const result = await service.fetchEntitiesData();
    assert.equal(result.error, undefined);
    assert.equal(service.resolveEntityId('W0666'), 'W0666');
  });

  it('sends a deep link to a retired id on to the canonical entity in the entity browser', () => {
    const browser = readRepo('frontend/components/EntityBrowser.js');
    // The import alone would satisfy a bare name match, so pin the lookup and
    // the hand-off of the canonical id back to the router.
    assert.match(
      browser,
      /scopedEntityById\.get\(resolveEntityId\(selectedEntityId\)\)/,
      'EntityBrowser must look a retired ?entity= id up through resolveEntityId',
    );
    assert.match(
      browser,
      /entity\.id !== selectedEntityId && onSelectEntity\)\s*\{\s*onSelectEntity\(entity\.id\);/,
      'EntityBrowser must replace a retired id in the selection with the canonical id',
    );
  });
});
