import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath));

describe('RECORD-00607 curator-approved removal (#591)', () => {
  it('removes the duplicate id from source and every derived text artifact', () => {
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
      'data/lib/pressthink-dedup.js',
    ]) {
      assert.equal(
        read(relativePath).includes(Buffer.from('RECORD-00607')),
        false,
        `${relativePath} still references RECORD-00607`
      );
    }
  });

  it('prunes entities made unreachable by the removed record', () => {
    const source = read('data/extracted_entities.csv').toString('utf8');
    const generated = JSON.parse(read('data/archive-entities.json'));
    const generatedIds = new Set(generated.entities.map((entity) => entity.id));

    for (const entityId of ['O1237']) {
      assert.doesNotMatch(source, new RegExp(`^${entityId},`, 'm'));
      assert.equal(generatedIds.has(entityId), false);
    }
  });

  it('keeps the embedding sidecar and binary row-aligned', () => {
    const index = JSON.parse(read('data/archive-embeddings.json'));
    const binary = read('data/archive-embeddings.bin');
    const archive = JSON.parse(read('data/archive-data.json'));
    const publishedDocumentIds = archive.records
      .filter(record => record.type !== 'social')
      .map(record => record.id);

    assert.deepEqual(index.ids, publishedDocumentIds);
    assert.equal(index.ids.length, publishedDocumentIds.length);
    assert.equal(index.ids.length, index.count);
    assert.equal(binary.length, index.count * index.bytesPerVector);
  });
});
