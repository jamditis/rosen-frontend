import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { unescapeRow } from '../data/lib/csv-unescape.js';
import { generateAllFeeds } from '../data/lib/rss-generator.js';

function assertIds(actual, expected, artifact) {
  assert.equal(new Set(actual).size, actual.length, `${artifact}: duplicate record IDs`);
  assert.deepEqual([...actual].sort(), [...expected].sort(), `${artifact}: stale record IDs; run npm run export-data`);
}

function publishedCuratedIds(rows) {
  // Match the exporter's curated visibility boundary. Social posts and generated
  // threads have separate filtering rules and are not source article records.
  return rows.filter(row => {
    const title = String(row.title || 'Untitled').trim();
    return ['TRUE', 'true', 'Yes', true].includes(row.verified)
      && title !== 'Untitled' && title.length >= 5
      && (row.publication_date || (row.url && row.url !== '#'));
  }).map(row => row.id);
}

function assertDerivedIds({ csv, full, core, details, index }) {
  const expected = publishedCuratedIds(csv);
  assertIds(full.filter(record => record.type === 'article').map(record => record.id), expected, 'archive-data.json articles');
  assertIds(core.filter(record => record.type === 'article').map(record => record.id), expected, 'archive-core.json articles');
  const allIds = full.map(record => record.id);
  assertIds(core.map(record => record.id), allIds, 'archive-core.json');
  assertIds(Object.keys(details), allIds, 'archive-details.json');
  assertIds(Object.values(index.documentIds), expected, 'search-index.json');
  assert.equal(index.documentCount, expected.length, 'search-index.json document count');
}

function fixture() {
  return {
    csv: [{ id: 'R1', title: 'A valid title', verified: 'TRUE', publication_date: '2026-01-01' }],
    full: [{ id: 'R1', type: 'article' }, { id: 'BSKY-1', type: 'social' }],
    core: [{ id: 'R1', type: 'article' }, { id: 'BSKY-1', type: 'social' }],
    details: { R1: {}, 'BSKY-1': {} },
    index: { documentIds: { 0: 'R1' }, documentCount: 1 },
  };
}

test('derived ID guard catches source additions, removals, and each stale artifact', () => {
  assertDerivedIds(fixture());
  for (const mutate of [
    input => input.csv.push({ ...input.csv[0], id: 'R2' }),
    input => input.csv.splice(0),
    input => input.full.pop(),
    input => input.core.pop(),
    input => delete input.details.R1,
    input => { input.index.documentIds[0] = 'R2'; },
    input => input.core.push(input.core[0]),
  ]) {
    const input = fixture();
    mutate(input);
    assert.throws(() => assertDerivedIds(input), /record IDs/);
  }
});

test('visibility exclusions do not require unpublished rows in derived artifacts', () => {
  const input = fixture();
  input.csv.push({ ...input.csv[0], id: 'R2', verified: 'FALSE' });
  input.csv.push({ ...input.csv[0], id: 'R3', title: 'Untitled' });
  assertDerivedIds(input);
});

test('committed derived record IDs match current CSVs even when inputs are dirty', () => {
  const readJson = name => JSON.parse(fs.readFileSync(path.join('data', name), 'utf8'));
  const csv = parse(fs.readFileSync('data/archive_records-public.csv', 'utf8'), { columns: true, skip_empty_lines: true }).map(unescapeRow);
  const full = readJson('archive-data.json').records;
  assertDerivedIds({ csv, full, core: readJson('archive-core.json').records, details: readJson('archive-details.json').details, index: readJson('search-index.json') });

  // Feeds intentionally contain a limited, ordered subset and identify entries
  // by URL rather than record ID. Reuse the generator's selection and compare
  // GUIDs only so changing build timestamps cannot hide missing/stale entries.
  const guids = xml => [...xml.matchAll(/<guid\b[^>]*>([^<]*)<\/guid>/g)].map(match => match[1]);
  for (const [name, expected] of Object.entries(generateAllFeeds(full, 'https://pressthink.org/j/rosen-archive'))) {
    assert.deepEqual(guids(fs.readFileSync(path.join('data/feeds', name), 'utf8')), guids(expected), `data/feeds/${name}: stale feed entries`);
  }
});
