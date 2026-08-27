/**
 * Build the semantic-search vector sidecar for published social records.
 *
 * The curated archive keeps its smaller artifact for the "similar in theme"
 * record tool. Semantic search loads this second artifact only after a reader
 * turns meaning search on, which expands coverage without adding 10 MB to a
 * normal visit or a record-modal neighbor lookup.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

import {
  EMBED_DIM,
  MODEL_ID,
  buildEmbeddingIndex,
  meanPoolNormalize,
  quantizeInt8,
  serializeVectors,
  sha256Hex,
} from './embeddings-builder.js';

export const DEFAULT_SOCIAL_EMBED_BATCH_SIZE = 16;

const str = value => (value == null ? '' : String(value));

/** Use every post in a thread. A single-post record uses its full quote text. */
export function buildSocialEmbeddingText(record) {
  const threadPosts = Array.isArray(record?.thread_data?.posts)
    ? record.thread_data.posts
      .map(post => str(post?.content).trim())
      .filter(Boolean)
    : [];
  if (threadPosts.length > 0) return threadPosts.join('\n\n');
  return str(record?.quote).trim();
}

/** Select every published social record that has text the model can encode. */
export function selectPublishedSocialRecords(data) {
  return (data?.records || []).filter(record => (
    record.type === 'social' && buildSocialEmbeddingText(record).length > 0
  ));
}

/**
 * Build the social artifact with bounded model batches.
 * `embedMany` accepts an array of text and returns one vector per item.
 */
export async function buildSocialEmbeddings(
  records,
  embedMany,
  { batchSize = DEFAULT_SOCIAL_EMBED_BATCH_SIZE, onProgress = null } = {},
) {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error('social embeddings: batchSize must be a positive integer');
  }

  const ids = [];
  const quantized = [];
  for (let offset = 0; offset < records.length; offset += batchSize) {
    const batch = records.slice(offset, offset + batchSize);
    const vectors = await embedMany(batch.map(buildSocialEmbeddingText));
    if (!Array.isArray(vectors) || vectors.length !== batch.length) {
      throw new Error('social embeddings: model output count does not match input count');
    }
    for (let i = 0; i < batch.length; i++) {
      if (!vectors[i] || vectors[i].length !== EMBED_DIM) {
        throw new Error(`social embeddings: ${batch[i].id} vector must have ${EMBED_DIM} dimensions`);
      }
      ids.push(str(batch[i].id));
      quantized.push(quantizeInt8(meanPoolNormalize([vectors[i]])));
    }
    onProgress?.(Math.min(offset + batch.length, records.length), records.length);
  }

  const binBuffer = serializeVectors(quantized);
  const index = {
    ...buildEmbeddingIndex(ids, sha256Hex(binBuffer)),
    corpus: 'social',
  };
  return { index, binBuffer, count: ids.length };
}

/** Create the batched build-time encoder. */
export async function createBatchExtractor() {
  const { pipeline } = await import('@huggingface/transformers');
  const extractor = await pipeline('feature-extraction', MODEL_ID, { dtype: 'q8' });
  return async (texts) => {
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    if (output.dims?.[0] !== texts.length || output.dims?.[1] !== EMBED_DIM) {
      throw new Error(`social embeddings: unexpected model output shape ${output.dims?.join('x')}`);
    }
    return texts.map((_, index) => Float32Array.from(
      output.data.subarray(index * EMBED_DIM, (index + 1) * EMBED_DIM),
    ));
  };
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const archive = JSON.parse(readFileSync(path.join(root, 'data', 'archive-data.json'), 'utf8'));
  const records = selectPublishedSocialRecords(archive);
  const binPath = path.join(root, 'data', 'archive-social-embeddings.bin');
  const jsonPath = path.join(root, 'data', 'archive-social-embeddings.json');

  console.log(`social embeddings: ${records.length} records`);
  const embedMany = await createBatchExtractor();
  const result = await buildSocialEmbeddings(records, embedMany, {
    onProgress: (done, total) => {
      if (done === total || done % 1024 === 0) {
        console.log(`social embeddings: encoded ${done}/${total}`);
      }
    },
  });

  writeFileSync(binPath, result.binBuffer);
  writeFileSync(jsonPath, JSON.stringify(result.index));
  console.log(
    `social embeddings: wrote ${result.count} vectors -> ${path.relative(root, binPath)} (${result.binBuffer.length} bytes), ${path.relative(root, jsonPath)}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export default {
  DEFAULT_SOCIAL_EMBED_BATCH_SIZE,
  buildSocialEmbeddingText,
  selectPublishedSocialRecords,
  buildSocialEmbeddings,
  createBatchExtractor,
};
