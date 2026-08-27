/**
 * The social-record sidecar that expands semantic search to the full archive.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BYTES_PER_VECTOR, EMBED_DIM, sha256Hex } from '../data/lib/embeddings-builder.js';
import {
  buildSocialEmbeddingText,
  buildSocialEmbeddings,
  selectPublishedSocialRecords,
} from '../data/lib/social-embeddings-builder.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(repoRoot, ...parts), 'utf8'));

function fakeEmbedMany() {
  return async texts => texts.map((text) => {
    const vector = new Float32Array(EMBED_DIM);
    vector[0] = text.length || 1;
    vector[1] = 1;
    return vector;
  });
}

test('selectPublishedSocialRecords includes every social record with text', () => {
  const selected = selectPublishedSocialRecords({ records: [
    { id: 'RECORD-A', type: 'article', quote: 'article' },
    { id: 'BSKY-A', type: 'social', quote: 'A useful post' },
    { id: 'BSKY-B', type: 'social', quote: '   ' },
  ] });
  assert.deepEqual(selected.map(record => record.id), ['BSKY-A']);
});

test('buildSocialEmbeddingText uses the full thread instead of its preview', () => {
  const text = buildSocialEmbeddingText({
    quote: 'First post preview',
    thread_data: { posts: [
      { content: 'First post' },
      { content: 'Second post adds the conclusion' },
    ] },
  });
  assert.equal(text, 'First post\n\nSecond post adds the conclusion');
});

test('buildSocialEmbeddings writes one aligned vector per social record', async () => {
  const records = [
    { id: 'BSKY-A', type: 'social', quote: 'First post' },
    { id: 'TWITTER-A', type: 'social', quote: 'Second post' },
  ];
  const result = await buildSocialEmbeddings(records, fakeEmbedMany(), { batchSize: 1 });
  assert.deepEqual(result.index.ids, ['BSKY-A', 'TWITTER-A']);
  assert.equal(result.index.corpus, 'social');
  assert.equal(result.count, 2);
  assert.equal(result.binBuffer.length, 2 * BYTES_PER_VECTOR);
  assert.equal(result.index.binarySha256, sha256Hex(result.binBuffer));
});

test('the committed social artifact covers every published social record', () => {
  const archive = readJson('data', 'archive-data.json');
  const index = readJson('data', 'archive-social-embeddings.json');
  const binary = fs.readFileSync(path.join(repoRoot, 'data', 'archive-social-embeddings.bin'));
  const expectedIds = selectPublishedSocialRecords(archive).map(record => record.id);

  assert.deepEqual(index.ids, expectedIds);
  assert.equal(index.corpus, 'social');
  assert.equal(index.count, expectedIds.length);
  assert.equal(binary.length, index.count * index.bytesPerVector);
  assert.equal(index.binarySha256, sha256Hex(binary));
});
