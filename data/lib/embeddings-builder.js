/**
 * Embeddings builder (build-time, curator-publish step) -- issue #278, step 1.
 *
 * Produces a static semantic-similarity index so the frontend can surface
 * "similar in theme" records the knowledge graph misses: pieces that share an
 * idea but no tagged entity (26% of articles carry zero entity coverage), and
 * abstractive bridges between concepts that never co-occur as entities.
 *
 * Each published article is encoded into one 384-dim vector with
 * bge-small-en-v1.5 (via @huggingface/transformers, a build-time-only devDependency
 * -- it never reaches the browser, exactly like minisearch in #276). Vectors are
 * INT8-quantized with a per-vector scale and concatenated into a compact binary
 * (~359 KB for 947 articles) plus a JSON id index.
 *
 * Why iterate archive-data.json, not the CSV (unlike search-index-builder.js):
 * a "similar in theme" neighbor must be a record the user can actually open, and
 * the openable set is exactly what the exporter published into archive-data.json
 * (type === 'article'). Building from the CSV would embed unpublished rows whose
 * ids resolve to nothing in the runtime, producing dead vectors and broken
 * neighbor links. raw_text is the one field archive-data.json drops, so it is
 * joined back from the CSV by id; the 46 published articles with no CSV raw_text
 * embed on title + summary alone (still theme-bearing).
 *
 * Why first+last mean-pool: bge-small caps at 512 tokens (~2,000 chars), but the
 * median essay is 9,271 chars, so a single encode sees only the lede. Rosen's
 * argument often lands in the conclusion, so each long article is encoded as two
 * chunks -- (title + summary + opening) and (closing) -- averaged in float space
 * and re-normalized before quantization. Averaging before quantizing avoids
 * compounding rounding error.
 *
 * The model is the only impure, network-bound step and is reached through a
 * dynamically-imported seam (createExtractor); every other function here is pure
 * and tested without loading the model.
 */
import { readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { parse } from 'csv-parse/sync';

// The sentence-transformer that runs at build time. Pinned by name so the index
// and the eventual runtime worker agree on which model produced the vectors.
export const MODEL_ID = 'Xenova/bge-small-en-v1.5';

// bge-small output width. A mismatch here vs the worker's expectation would
// silently misread the binary, so it is recorded in the JSON index too.
export const EMBED_DIM = 384;

// First chunk = title + summary + this many chars of raw_text; last chunk = this
// many trailing chars. Both sit just above the model's ~2,000-char (512-token)
// window so each chunk fills it; the model truncates the small overflow.
export const FIRST_CHUNK_CHARS = 2000;
export const LAST_CHUNK_CHARS = 2000;

// Per-vector wire layout: one float32 scale (little-endian) followed by EMBED_DIM
// signed bytes. The scale restores magnitude on dequantization.
export const SCALE_BYTES = 4;
export const BYTES_PER_VECTOR = SCALE_BYTES + EMBED_DIM;

// Bump on any regeneration whose vectors change (model, pooling, or chunk size).
// The runtime worker and the service-worker cache key off this so stale vectors
// can't ship silently after a deploy (see #278 C6).
export const EMBED_INDEX_VERSION = '1.1.0';

const str = (v) => (v == null ? '' : String(v));

/**
 * The text chunks to encode for one article. Returns one chunk when there is no
 * distinct tail (short or missing raw_text), two when the body is long enough
 * that a trailing chunk carries text the opening chunk didn't.
 */
export function buildEmbeddingChunks({ title, summary, rawText }) {
  const head =
    `${str(title)}\n\n${str(summary)}\n\n${str(rawText).slice(0, FIRST_CHUNK_CHARS)}`.trim();
  const body = str(rawText);
  if (body.length > FIRST_CHUNK_CHARS) {
    return [head, body.slice(-LAST_CHUNK_CHARS).trim()];
  }
  return [head];
}

/**
 * Average one or more vectors element-wise and L2-normalize the result. A single
 * (already-normalized) vector is re-normalized for safety; the zero vector is
 * returned unchanged rather than dividing by zero.
 */
export function meanPoolNormalize(vectors) {
  if (!vectors.length) throw new Error('meanPoolNormalize: no vectors');
  const dim = vectors[0].length;
  const acc = new Float32Array(dim);
  for (const v of vectors) {
    if (v.length !== dim) throw new Error('meanPoolNormalize: dim mismatch');
    for (let i = 0; i < dim; i++) acc[i] += v[i];
  }
  for (let i = 0; i < dim; i++) acc[i] /= vectors.length;
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += acc[i] * acc[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) acc[i] /= norm;
  }
  return acc;
}

/**
 * Quantize a float vector to signed int8 with a single per-vector scale chosen
 * so the largest-magnitude component maps to +-127. Returns { scale, bytes }
 * where dequantized[i] = bytes[i] * scale. An all-zero vector gets scale 1.
 */
export function quantizeInt8(vec) {
  let maxAbs = 0;
  for (let i = 0; i < vec.length; i++) {
    const a = Math.abs(vec[i]);
    if (a > maxAbs) maxAbs = a;
  }
  const scale = maxAbs === 0 ? 1 : maxAbs / 127;
  const bytes = new Int8Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    let q = Math.round(vec[i] / scale);
    if (q > 127) q = 127;
    if (q < -127) q = -127;
    bytes[i] = q;
  }
  return { scale, bytes };
}

/** Inverse of quantizeInt8: rebuild the float vector from scale + bytes. */
export function dequantizeInt8(scale, bytes) {
  const vec = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) vec[i] = bytes[i] * scale;
  return vec;
}

/**
 * Concatenate quantized vectors into the binary artifact. Each is written as a
 * little-endian float32 scale followed by its int8 bytes, in the given order --
 * which must match the JSON index's ids array so row N maps to ids[N].
 */
export function serializeVectors(quantized) {
  const buf = Buffer.alloc(quantized.length * BYTES_PER_VECTOR);
  let offset = 0;
  for (const { scale, bytes } of quantized) {
    if (bytes.length !== EMBED_DIM) throw new Error('serializeVectors: dim mismatch');
    buf.writeFloatLE(scale, offset);
    offset += SCALE_BYTES;
    for (let i = 0; i < bytes.length; i++) buf.writeInt8(bytes[i], offset + i);
    offset += bytes.length;
  }
  return buf;
}

/** Read the vector at row index i out of a serialized buffer. */
export function readVectorAt(buffer, i) {
  const base = i * BYTES_PER_VECTOR;
  const scale = buffer.readFloatLE(base);
  const bytes = new Int8Array(EMBED_DIM);
  for (let j = 0; j < EMBED_DIM; j++) bytes[j] = buffer.readInt8(base + SCALE_BYTES + j);
  return { scale, bytes };
}

/** The JSON sidecar: everything the worker needs to read the binary by id. */
export function buildEmbeddingIndex(ids) {
  return {
    version: EMBED_INDEX_VERSION,
    model: MODEL_ID,
    dim: EMBED_DIM,
    quantization: 'int8',
    bytesPerVector: BYTES_PER_VECTOR,
    count: ids.length,
    ids,
  };
}

/** Published articles (the served set) from archive-data.json. */
export function loadPublishedArticles(archiveDataPath) {
  const data = JSON.parse(readFileSync(archiveDataPath, 'utf8'));
  const records = data.records || [];
  return records
    .filter((r) => r.type === 'article')
    .map((r) => ({ id: str(r.id), title: str(r.title), summary: str(r.summary) }));
}

/** Map of record id -> raw_text from the source CSV. */
export function loadRawTextMap(csvPath) {
  const rows = parse(readFileSync(csvPath, 'utf8'), { columns: true, skip_empty_lines: true });
  const map = new Map();
  for (const row of rows) {
    const id = str(row.id);
    if (id) map.set(id, str(row.raw_text));
  }
  return map;
}

/**
 * Encode one article into its final (mean-pooled, normalized) float vector.
 * `embed` is the model seam: async (text) -> Float32Array(EMBED_DIM).
 */
export async function embedArticle(article, rawText, embed) {
  const chunks = buildEmbeddingChunks({
    title: article.title,
    summary: article.summary,
    rawText,
  });
  const vectors = [];
  for (const chunk of chunks) vectors.push(await embed(chunk));
  return meanPoolNormalize(vectors);
}

/**
 * Build the full artifact from articles + raw_text map. Returns
 * { index, binBuffer, count }. Pure given a pure `embed`, so a fake embed makes
 * the whole pipeline testable without the model.
 */
export async function buildEmbeddings(articles, rawTextMap, embed) {
  const ids = [];
  const quantized = [];
  for (const article of articles) {
    const rawText = rawTextMap.get(article.id) || '';
    const vec = await embedArticle(article, rawText, embed);
    ids.push(article.id);
    quantized.push(quantizeInt8(vec));
  }
  return { index: buildEmbeddingIndex(ids), binBuffer: serializeVectors(quantized), count: ids.length };
}

/**
 * The model seam. Dynamically imports @huggingface/transformers so requiring this
 * module (e.g. in unit tests) never loads onnxruntime. Returns an async
 * embed(text) -> Float32Array(EMBED_DIM), mean-pooled and L2-normalized by the
 * pipeline.
 */
export async function createExtractor() {
  const { pipeline } = await import('@huggingface/transformers');
  // Transformers.js v2 loaded model_quantized.onnx by default. V4 otherwise
  // selects the full-precision model on Node, which needlessly changes the
  // established embedding space and makes this build substantially slower.
  const extractor = await pipeline('feature-extraction', MODEL_ID, { dtype: 'q8' });
  return async (text) => {
    const out = await extractor(text, { pooling: 'mean', normalize: true });
    return Float32Array.from(out.data);
  };
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const archiveDataPath = path.join(root, 'data', 'archive-data.json');
  const csvPath = path.join(root, 'data', 'archive_records-public.csv');
  const binPath = path.join(root, 'data', 'archive-embeddings.bin');
  const jsonPath = path.join(root, 'data', 'archive-embeddings.json');

  const articles = loadPublishedArticles(archiveDataPath);
  const rawTextMap = loadRawTextMap(csvPath);
  const withRaw = articles.filter((a) => (rawTextMap.get(a.id) || '').length > 0).length;
  console.log(
    `embeddings: ${articles.length} articles (${withRaw} with raw_text, ${articles.length - withRaw} title+summary only)`,
  );

  const embed = await createExtractor();
  const { index, binBuffer, count } = await buildEmbeddings(articles, rawTextMap, embed);

  writeFileSync(binPath, binBuffer);
  writeFileSync(jsonPath, JSON.stringify(index));
  console.log(
    `embeddings: wrote ${count} vectors -> ${path.relative(root, binPath)} (${binBuffer.length} bytes), ${path.relative(root, jsonPath)}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export default {
  MODEL_ID,
  EMBED_DIM,
  FIRST_CHUNK_CHARS,
  LAST_CHUNK_CHARS,
  BYTES_PER_VECTOR,
  EMBED_INDEX_VERSION,
  buildEmbeddingChunks,
  meanPoolNormalize,
  quantizeInt8,
  dequantizeInt8,
  serializeVectors,
  readVectorAt,
  buildEmbeddingIndex,
  loadPublishedArticles,
  loadRawTextMap,
  embedArticle,
  buildEmbeddings,
  createExtractor,
};
