/**
 * Build the semantic-search vector sidecar for published social records.
 *
 * The curated archive keeps its smaller artifact for the "similar in theme"
 * record tool. Semantic search loads this second artifact only after a reader
 * turns meaning search on, which expands coverage without adding 10 MB to a
 * normal visit or a record-modal neighbor lookup.
 *
 * A normal invocation rebuilds every vector. Incremental invocation reuses
 * only rows whose exact embedding-text hash is unchanged:
 *
 *   node data/lib/social-embeddings-builder.js --incremental
 *
 * The first incremental run against an older sidecar needs the matching prior
 * archive because that sidecar has no text hashes:
 *
 *   node data/lib/social-embeddings-builder.js --incremental \
 *     --previous-archive /path/to/prior/archive-data.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

import {
  BYTES_PER_VECTOR,
  EMBED_DIM,
  EMBED_INDEX_VERSION,
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

/** Hash the exact text that determines one social vector. */
export function socialEmbeddingTextSha256(record) {
  return sha256Hex(Buffer.from(buildSocialEmbeddingText(record), 'utf8'));
}

function assertUniqueRecordIds(records, label) {
  const ids = new Set();
  for (const record of records) {
    const id = str(record?.id);
    if (!id) throw new Error(`social embeddings: ${label} contains a record without an id`);
    if (ids.has(id)) throw new Error(`social embeddings: ${label} contains duplicate id ${id}`);
    ids.add(id);
  }
}

/**
 * Validate an existing binary/index pair and return its safe reuse metadata.
 * Old indexes have no text hashes. They require the prior archive so reuse is
 * still based on identical embedding text, never an ID match alone.
 */
export function validatePreviousSocialArtifact(
  previousIndex,
  previousBinary,
  { previousRecords = null } = {},
) {
  if (!previousIndex || typeof previousIndex !== 'object') {
    throw new Error('social embeddings: previous index must be an object');
  }
  if (!Buffer.isBuffer(previousBinary)) {
    throw new Error('social embeddings: previous binary must be a Buffer');
  }
  const expected = {
    version: EMBED_INDEX_VERSION,
    model: MODEL_ID,
    dim: EMBED_DIM,
    quantization: 'int8',
    bytesPerVector: BYTES_PER_VECTOR,
    corpus: 'social',
  };
  for (const [field, value] of Object.entries(expected)) {
    if (previousIndex[field] !== value) {
      throw new Error(
        `social embeddings: previous ${field} is ${JSON.stringify(previousIndex[field])}; expected ${JSON.stringify(value)}`,
      );
    }
  }
  if (!Array.isArray(previousIndex.ids) || previousIndex.count !== previousIndex.ids.length) {
    throw new Error('social embeddings: previous index count does not match its ids');
  }
  if (new Set(previousIndex.ids).size !== previousIndex.ids.length) {
    throw new Error('social embeddings: previous index contains duplicate ids');
  }
  if (previousBinary.length !== previousIndex.ids.length * BYTES_PER_VECTOR) {
    throw new Error('social embeddings: previous binary length does not match its index layout');
  }
  if (sha256Hex(previousBinary) !== previousIndex.binarySha256) {
    throw new Error('social embeddings: previous binary checksum does not match its index');
  }

  let textSha256 = previousIndex.textSha256;
  if (textSha256 === undefined) {
    if (!Array.isArray(previousRecords)) {
      throw new Error(
        'social embeddings: previous index has no text hashes; pass --previous-archive to migrate it safely',
      );
    }
    assertUniqueRecordIds(previousRecords, 'previous archive');
    const previousRecordById = new Map(previousRecords.map(record => [str(record.id), record]));
    textSha256 = previousIndex.ids.map((id) => {
      const record = previousRecordById.get(id);
      if (!record) {
        throw new Error(`social embeddings: previous archive has no social embedding record ${id}`);
      }
      return socialEmbeddingTextSha256(record);
    });
  }
  if (!Array.isArray(textSha256) || textSha256.length !== previousIndex.ids.length) {
    throw new Error('social embeddings: previous text hash count does not match its ids');
  }
  for (const [index, digest] of textSha256.entries()) {
    if (!/^[a-f0-9]{64}$/.test(digest || '')) {
      throw new Error(`social embeddings: previous text hash ${index} is not a SHA-256 digest`);
    }
  }

  return {
    positionById: new Map(previousIndex.ids.map((id, index) => [id, index])),
    textSha256ById: new Map(previousIndex.ids.map((id, index) => [id, textSha256[index]])),
  };
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

  assertUniqueRecordIds(records, 'records');
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
    textSha256: records.map(socialEmbeddingTextSha256),
  };
  return { index, binBuffer, count: ids.length };
}

/** Build a current artifact while reusing only byte rows with identical text. */
export async function buildIncrementalSocialEmbeddings(
  records,
  embedMany,
  {
    previousIndex,
    previousBinary,
    previousRecords = null,
    batchSize = DEFAULT_SOCIAL_EMBED_BATCH_SIZE,
    onProgress = null,
  } = {},
) {
  assertUniqueRecordIds(records, 'records');
  const previous = validatePreviousSocialArtifact(previousIndex, previousBinary, {
    previousRecords,
  });
  const currentTextSha256 = records.map(socialEmbeddingTextSha256);
  const changedRecords = records.filter((record, index) => (
    previous.textSha256ById.get(str(record.id)) !== currentTextSha256[index]
  ));
  const changed = await buildSocialEmbeddings(changedRecords, embedMany, {
    batchSize,
    onProgress,
  });
  const changedPositionById = new Map(changed.index.ids.map((id, index) => [id, index]));
  const rows = records.map((record) => {
    const id = str(record.id);
    const changedPosition = changedPositionById.get(id);
    if (changedPosition !== undefined) {
      return changed.binBuffer.subarray(
        changedPosition * BYTES_PER_VECTOR,
        (changedPosition + 1) * BYTES_PER_VECTOR,
      );
    }
    const previousPosition = previous.positionById.get(id);
    if (previousPosition === undefined) {
      throw new Error(`social embeddings: ${id} was neither reused nor encoded`);
    }
    return previousBinary.subarray(
      previousPosition * BYTES_PER_VECTOR,
      (previousPosition + 1) * BYTES_PER_VECTOR,
    );
  });
  const binBuffer = Buffer.concat(rows);
  const index = {
    ...buildEmbeddingIndex(records.map(record => str(record.id)), sha256Hex(binBuffer)),
    corpus: 'social',
    textSha256: currentTextSha256,
  };
  return {
    index,
    binBuffer,
    count: records.length,
    reused: records.length - changedRecords.length,
    encoded: changedRecords.length,
  };
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

export function parseSocialEmbeddingArgs(argv) {
  const options = { incremental: false, previousArchivePath: null };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--incremental') {
      options.incremental = true;
    } else if (argument === '--previous-archive') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) {
        throw new Error('social embeddings: --previous-archive requires a path');
      }
      options.previousArchivePath = path.resolve(value);
    } else {
      throw new Error(`social embeddings: unknown argument ${argument}`);
    }
  }
  if (options.previousArchivePath && !options.incremental) {
    throw new Error('social embeddings: --previous-archive requires --incremental');
  }
  return options;
}

async function main(argv = process.argv.slice(2)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const archive = JSON.parse(readFileSync(path.join(root, 'data', 'archive-data.json'), 'utf8'));
  const records = selectPublishedSocialRecords(archive);
  const binPath = path.join(root, 'data', 'archive-social-embeddings.bin');
  const jsonPath = path.join(root, 'data', 'archive-social-embeddings.json');

  const options = parseSocialEmbeddingArgs(argv);
  console.log(`social embeddings: ${records.length} records`);
  const progress = {
    onProgress: (done, total) => {
      if (done === total || done % 1024 === 0) {
        console.log(`social embeddings: encoded ${done}/${total}`);
      }
    },
  };
  let result;
  if (options.incremental) {
    const previousIndex = JSON.parse(readFileSync(jsonPath, 'utf8'));
    const previousBinary = readFileSync(binPath);
    const previousRecords = options.previousArchivePath
      ? selectPublishedSocialRecords(JSON.parse(readFileSync(options.previousArchivePath, 'utf8')))
      : null;
    // Reject an incompatible or corrupt artifact before loading the model.
    validatePreviousSocialArtifact(previousIndex, previousBinary, { previousRecords });
    const embedMany = await createBatchExtractor();
    result = await buildIncrementalSocialEmbeddings(records, embedMany, {
      previousIndex,
      previousBinary,
      previousRecords,
      ...progress,
    });
    console.log(`social embeddings: reused ${result.reused}, encoded ${result.encoded}`);
  } else {
    const embedMany = await createBatchExtractor();
    result = await buildSocialEmbeddings(records, embedMany, progress);
  }

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
  socialEmbeddingTextSha256,
  selectPublishedSocialRecords,
  validatePreviousSocialArtifact,
  buildSocialEmbeddings,
  buildIncrementalSocialEmbeddings,
  createBatchExtractor,
  parseSocialEmbeddingArgs,
};
