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

  // Records added without running the embedding model are listed here. The
  // sidecar covers every published article except these, so a new record can
  // land before its vector does without silently un-aligning the pair.
  // RECORD-00918 was split off RECORD-00429 on 2026-08-27 (issue #863) on a
  // machine that could not run the model.
  const PENDING_EMBEDDING = ['RECORD-00918'];

  it('keeps the embedding sidecar and binary row-aligned', () => {
    const index = JSON.parse(read('data/archive-embeddings.json'));
    const binary = read('data/archive-embeddings.bin');
    const archive = JSON.parse(read('data/archive-data.json'));
    const publishedArticleIds = archive.records
      .filter(record => record.type === 'article')
      .map(record => record.id);
    const pending = new Set(PENDING_EMBEDDING);

    // Every id awaiting a vector must still be a published article, so a
    // deleted record cannot hide in this list.
    for (const recordId of PENDING_EMBEDDING) {
      assert.ok(
        publishedArticleIds.includes(recordId),
        `${recordId} is listed as pending an embedding but is not a published article`
      );
    }

    assert.deepEqual(
      index.ids,
      publishedArticleIds.filter(recordId => !pending.has(recordId))
    );
    assert.equal(index.ids.length, publishedArticleIds.length - PENDING_EMBEDDING.length);
    assert.equal(index.ids.length, index.count);
    assert.equal(binary.length, index.count * index.bytesPerVector);
  });
});
