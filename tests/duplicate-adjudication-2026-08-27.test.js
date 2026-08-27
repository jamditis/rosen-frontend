/**
 * Guards the curator adjudication of 2026-08-27 (#469, executed in #867).
 *
 * Seven truncated twin captures were dropped and RECORD-00781 was annotated as
 * a dead-platform publication. A record removal is only finished when the id is
 * gone from the source CSVs, every derived artifact, and the embeddings pair,
 * so this checks all three rather than the source alone. It mirrors
 * tests/record-00607-removal.test.js, which guards the #591 removal.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath));

// Each dropped record with the fuller capture that supersedes it.
const DROPPED = new Map([
  ['RECORD-00077', 'RECORD-00747'],
  ['RECORD-00830', 'RECORD-00681'],
  ['RECORD-00846', 'RECORD-00685'],
  ['RECORD-00855', 'RECORD-00695'],
  ['RECORD-00857', 'RECORD-00696'],
  ['RECORD-00873', 'RECORD-00692'],
  ['RECORD-00877', 'RECORD-00701'],
]);

describe('2026-08-27 duplicate adjudication (#867)', () => {
  it('removes the seven duplicate ids from source and every derived artifact', () => {
    for (const relativePath of [
      'data/archive_records-public.csv',
      'data/extracted_entities.csv',
      'data/extracted_relationships.csv',
      'data/archive-core.json',
      'data/archive-details.json',
      'data/archive-data.json',
      'data/search-index.json',
      'data/archive-entities.json',
      'data/archive-embeddings.json',
      'data/graph-validation-holds.json',
      'data/relationship-type-registry.json',
    ]) {
      const contents = read(relativePath);
      for (const droppedId of DROPPED.keys()) {
        assert.equal(
          contents.includes(Buffer.from(droppedId)),
          false,
          `${relativePath} still references ${droppedId}`,
        );
      }
    }
  });

  it('keeps the fuller capture that each dropped record duplicated', () => {
    const records = parse(read('data/archive_records-public.csv').toString('utf8'), {
      columns: true,
      skip_empty_lines: true,
    });
    const byId = new Map(records.map((record) => [record.id, record]));
    for (const [droppedId, survivorId] of DROPPED) {
      assert.ok(byId.has(survivorId), `${survivorId} must survive the ${droppedId} removal`);
      assert.ok(
        (byId.get(survivorId).raw_text || '').length > 0,
        `${survivorId} must still carry the body text ${droppedId} was dropped for lacking`,
      );
    }
  });

  it('keeps RECORD-00781 with a dead-platform note and a Wayback pointer', () => {
    const records = parse(read('data/archive_records-public.csv').toString('utf8'), {
      columns: true,
      skip_empty_lines: true,
    });
    const record = records.find((row) => row.id === 'RECORD-00781');
    assert.ok(record, 'RECORD-00781 was kept, not dropped');
    // The Posterous URL is dead, so the note has to carry a capture a reader can
    // actually open, and name the record that holds the post on a live host.
    assert.match(record.notes, /dead-platform publication/);
    assert.match(record.notes, /RECORD-00658/);
    assert.match(
      record.notes,
      /https:\/\/web\.archive\.org\/web\/\d{14}\/http:\/\/jayrosen\.posterous\.com\//,
    );
  });

  it('leaves no related_to list pointing at a dropped record', () => {
    // Scoped to the seven ids on purpose. The CSV carries older dangling
    // related_to entries from earlier cleanups, and that backlog is its own
    // problem; this asserts only that the #867 removal cleaned up after itself.
    const records = parse(read('data/archive_records-public.csv').toString('utf8'), {
      columns: true,
      skip_empty_lines: true,
    });
    for (const record of records) {
      for (const relatedId of (record.related_to || '').split(',')) {
        const trimmed = relatedId.trim();
        assert.equal(
          DROPPED.has(trimmed),
          false,
          `${record.id}.related_to still points at dropped ${trimmed}`,
        );
      }
    }
  });

  it('keeps the embedding sidecar and binary row-aligned with the published articles', () => {
    const index = JSON.parse(read('data/archive-embeddings.json'));
    const binary = read('data/archive-embeddings.bin');
    const archive = JSON.parse(read('data/archive-data.json'));
    const publishedArticleIds = archive.records
      .filter((record) => record.type === 'article')
      .map((record) => record.id);

    assert.deepEqual(index.ids, publishedArticleIds);
    assert.equal(index.ids.length, index.count);
    assert.equal(binary.length, index.count * index.bytesPerVector);
  });
});
