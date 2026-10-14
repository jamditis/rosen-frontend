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
  buildIncrementalSocialEmbeddings,
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
  assert.equal(result.index.textSha256.length, 2);
});

test('incremental build reuses identical bytes and encodes only changed text', async () => {
  const previousRecords = [
    { id: 'BSKY-A', type: 'social', quote: 'unchanged' },
    { id: 'BSKY-B', type: 'social', quote: 'old text' },
    { id: 'BSKY-C', type: 'social', quote: 'deleted' },
  ];
  const previous = await buildSocialEmbeddings(previousRecords, fakeEmbedMany());
  const currentRecords = [
    { id: 'BSKY-B', type: 'social', quote: 'new text with a different length' },
    { id: 'BSKY-A', type: 'social', quote: 'unchanged' },
  ];
  const encodedTexts = [];
  const result = await buildIncrementalSocialEmbeddings(
    currentRecords,
    async texts => {
      encodedTexts.push(...texts);
      return fakeEmbedMany()(texts);
    },
    { previousIndex: previous.index, previousBinary: previous.binBuffer },
  );

  assert.deepEqual(encodedTexts, ['new text with a different length']);
  assert.deepEqual(result.index.ids, ['BSKY-B', 'BSKY-A']);
  assert.equal(result.reused, 1);
  assert.equal(result.encoded, 1);
  assert.equal(result.binBuffer.length, 2 * BYTES_PER_VECTOR);
  assert.deepEqual(
    result.binBuffer.subarray(BYTES_PER_VECTOR),
    previous.binBuffer.subarray(0, BYTES_PER_VECTOR),
  );
  assert.equal(result.index.binarySha256, sha256Hex(result.binBuffer));
});

test('old sidecar migration requires the explicit previous archive records', async () => {
  const previousRecords = [{ id: 'BSKY-A', type: 'social', quote: 'same text' }];
  const previous = await buildSocialEmbeddings(previousRecords, fakeEmbedMany());
  const oldIndex = { ...previous.index };
  delete oldIndex.textSha256;

  await assert.rejects(
    buildIncrementalSocialEmbeddings(previousRecords, fakeEmbedMany(), {
      previousIndex: oldIndex,
      previousBinary: previous.binBuffer,
    }),
    /--previous-archive/,
  );

  let encodeCalls = 0;
  const migrated = await buildIncrementalSocialEmbeddings(
    previousRecords,
    async texts => {
      encodeCalls += texts.length;
      return fakeEmbedMany()(texts);
    },
    {
      previousIndex: oldIndex,
      previousBinary: previous.binBuffer,
      previousRecords,
    },
  );
  assert.equal(encodeCalls, 0);
  assert.equal(migrated.reused, 1);
  assert.equal(migrated.index.textSha256.length, 1);
});

test('incremental build rejects a corrupt previous binary before encoding', async () => {
  const records = [{ id: 'BSKY-A', type: 'social', quote: 'same text' }];
  const previous = await buildSocialEmbeddings(records, fakeEmbedMany());
  const corrupt = Buffer.from(previous.binBuffer);
  corrupt[corrupt.length - 1] ^= 1;
  let called = false;

  await assert.rejects(
    buildIncrementalSocialEmbeddings(records, async () => {
      called = true;
      return [];
    }, {
      previousIndex: previous.index,
      previousBinary: corrupt,
    }),
    /checksum/,
  );
  assert.equal(called, false);
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
