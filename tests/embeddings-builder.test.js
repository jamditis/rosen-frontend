/**
 * Tests for the build-time embeddings builder (issue #278, step 1).
 *
 * The model itself is not exercised here: every function under test is pure
 * given a fake `embed`, so the suite runs in milliseconds and needs no 30 MB
 * model download. The model seam (createExtractor) is covered by actually
 * running `npm run build-embeddings`, whose output this suite validates for
 * self-consistency when the artifact is present.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  EMBED_DIM,
  BYTES_PER_VECTOR,
  FIRST_CHUNK_CHARS,
  EMBED_INDEX_VERSION,
  MODEL_ID,
  buildEmbeddingChunks,
  meanPoolNormalize,
  quantizeInt8,
  dequantizeInt8,
  serializeVectors,
  readVectorAt,
  sha256Hex,
  buildEmbeddingIndex,
  embedArticle,
  buildEmbeddings,
} from '../data/lib/embeddings-builder.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function l2(vec) {
  let n = 0;
  for (let i = 0; i < vec.length; i++) n += vec[i] * vec[i];
  return Math.sqrt(n);
}

function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot / (l2(a) * l2(b));
}

// Deterministic stand-in for the real model: same text -> same normalized
// vector, different text -> different vector. Lets the pipeline tests assert
// alignment and pooling without loading onnx.
function makeFakeEmbed() {
  let calls = 0;
  const embed = async (text) => {
    calls++;
    const v = new Float32Array(EMBED_DIM);
    for (let i = 0; i < text.length; i++) {
      v[i % EMBED_DIM] += (text.charCodeAt(i) % 13) - 6;
    }
    const n = l2(v) || 1;
    for (let i = 0; i < EMBED_DIM; i++) v[i] /= n;
    return v;
  };
  return { embed, calls: () => calls };
}

test('buildEmbeddingChunks: short raw_text yields one chunk with title+summary+body', () => {
  const chunks = buildEmbeddingChunks({ title: 'T', summary: 'S', rawText: 'short body' });
  assert.equal(chunks.length, 1);
  assert.match(chunks[0], /T/);
  assert.match(chunks[0], /S/);
  assert.match(chunks[0], /short body/);
});

test('buildEmbeddingChunks: empty raw_text still yields one chunk (title+summary only)', () => {
  const chunks = buildEmbeddingChunks({ title: 'Title', summary: 'Summary', rawText: '' });
  assert.equal(chunks.length, 1);
  assert.match(chunks[0], /Title/);
  assert.match(chunks[0], /Summary/);
});

test('buildEmbeddingChunks: long raw_text yields head + distinct trailing chunk', () => {
  // Body long enough that the trailing window clears the opening region entirely:
  // opening A's | middle M's | closing Z's, so the tail holds no A's.
  const opening = 'A'.repeat(FIRST_CHUNK_CHARS);
  const middle = 'M'.repeat(FIRST_CHUNK_CHARS);
  const closing = 'Z'.repeat(500);
  const chunks = buildEmbeddingChunks({ title: 'T', summary: 'S', rawText: opening + middle + closing });
  assert.equal(chunks.length, 2);
  // The second chunk is the tail, carrying the closing text the first chunk
  // (capped at FIRST_CHUNK_CHARS of body) never reached.
  assert.match(chunks[1], /Z/);
  assert.ok(!chunks[1].includes('A'), 'tail chunk should not reach the opening region');
});

test('meanPoolNormalize: single vector is returned at unit norm', () => {
  const v = new Float32Array(EMBED_DIM);
  v[0] = 3;
  v[1] = 4; // norm 5 before normalization
  const out = meanPoolNormalize([v]);
  assert.ok(Math.abs(l2(out) - 1) < 1e-6);
  assert.ok(Math.abs(out[0] - 0.6) < 1e-6);
  assert.ok(Math.abs(out[1] - 0.8) < 1e-6);
});

test('meanPoolNormalize: averages element-wise then normalizes', () => {
  const a = new Float32Array(EMBED_DIM);
  const b = new Float32Array(EMBED_DIM);
  a[0] = 1;
  b[1] = 1;
  const out = meanPoolNormalize([a, b]);
  // mean = (0.5, 0.5, 0...) -> normalized -> (0.707, 0.707, 0...)
  assert.ok(Math.abs(l2(out) - 1) < 1e-6);
  assert.ok(Math.abs(out[0] - out[1]) < 1e-6);
  assert.ok(Math.abs(out[0] - Math.SQRT1_2) < 1e-6);
});

test('meanPoolNormalize: dim mismatch throws', () => {
  const a = new Float32Array(EMBED_DIM);
  const b = new Float32Array(EMBED_DIM - 1);
  assert.throws(() => meanPoolNormalize([a, b]), /dim mismatch/);
});

test('quantizeInt8/dequantizeInt8: round-trip preserves direction (cosine ~1)', () => {
  const v = new Float32Array(EMBED_DIM);
  for (let i = 0; i < EMBED_DIM; i++) v[i] = Math.sin(i) * 0.1;
  const { scale, bytes } = quantizeInt8(v);
  const back = dequantizeInt8(scale, bytes);
  assert.ok(cosine(v, back) > 0.999, `cosine ${cosine(v, back)}`);
});

test('quantizeInt8: largest component maps to +-127', () => {
  const v = new Float32Array(EMBED_DIM);
  v[5] = -0.42; // the max-magnitude component
  v[6] = 0.21;
  const { bytes } = quantizeInt8(v);
  assert.equal(bytes[5], -127);
});

test('quantizeInt8: all-zero vector gets scale 1 and zero bytes', () => {
  const v = new Float32Array(EMBED_DIM);
  const { scale, bytes } = quantizeInt8(v);
  assert.equal(scale, 1);
  assert.ok(bytes.every((b) => b === 0));
  assert.ok(dequantizeInt8(scale, bytes).every((x) => x === 0));
});

test('serializeVectors/readVectorAt: round-trips scale and bytes per row', () => {
  const q1 = quantizeInt8(Float32Array.from({ length: EMBED_DIM }, (_, i) => (i === 0 ? 0.5 : 0)));
  const q2 = quantizeInt8(Float32Array.from({ length: EMBED_DIM }, (_, i) => (i === 1 ? -0.3 : 0)));
  const buf = serializeVectors([q1, q2]);
  assert.equal(buf.length, 2 * BYTES_PER_VECTOR);
  const r0 = readVectorAt(buf, 0);
  const r1 = readVectorAt(buf, 1);
  assert.ok(Math.abs(r0.scale - q1.scale) < 1e-6);
  assert.equal(r0.bytes[0], q1.bytes[0]);
  assert.equal(r1.bytes[1], q2.bytes[1]);
});

test('buildEmbeddingIndex: records model, dim, version, digest, and id order', () => {
  const bin = Buffer.from('paired artifact');
  const digest = sha256Hex(bin);
  const idx = buildEmbeddingIndex(['RECORD-1', 'RECORD-2'], digest);
  assert.equal(idx.version, EMBED_INDEX_VERSION);
  assert.equal(idx.model, MODEL_ID);
  assert.equal(idx.dim, EMBED_DIM);
  assert.equal(idx.quantization, 'int8');
  assert.equal(idx.bytesPerVector, BYTES_PER_VECTOR);
  assert.equal(idx.count, 2);
  assert.equal(idx.binarySha256, digest);
  assert.deepEqual(idx.ids, ['RECORD-1', 'RECORD-2']);
});

test('embedArticle: long body triggers two encodes, short body one', async () => {
  const long = makeFakeEmbed();
  await embedArticle({ title: 'T', summary: 'S' }, 'B'.repeat(FIRST_CHUNK_CHARS + 100), long.embed);
  assert.equal(long.calls(), 2);

  const short = makeFakeEmbed();
  const out = await embedArticle({ title: 'T', summary: 'S' }, 'tiny', short.embed);
  assert.equal(short.calls(), 1);
  assert.ok(Math.abs(l2(out) - 1) < 1e-6);
});

test('buildEmbeddings: ids align with input order and binary round-trips', async () => {
  const { embed } = makeFakeEmbed();
  const articles = [
    { id: 'RECORD-A', title: 'Objectivity', summary: 'On the view from nowhere', },
    { id: 'RECORD-B', title: 'Epistemic crisis', summary: 'Trust and the press' },
    { id: 'RECORD-C', title: 'No body', summary: 'title+summary only' }, // no raw_text
  ];
  const rawTextMap = new Map([
    ['RECORD-A', 'L'.repeat(FIRST_CHUNK_CHARS + 200)],
    ['RECORD-B', 'short'],
    // RECORD-C deliberately absent -> mirrors the 46 published articles with no CSV raw_text
  ]);
  const { index, binBuffer, count } = await buildEmbeddings(articles, rawTextMap, embed);

  assert.equal(count, 3);
  assert.deepEqual(index.ids, ['RECORD-A', 'RECORD-B', 'RECORD-C']);
  assert.equal(binBuffer.length, 3 * BYTES_PER_VECTOR);
  assert.equal(index.binarySha256, sha256Hex(binBuffer));

  // Row N of the binary, dequantized, must match a fresh encode of article N.
  const expectedC = await embedArticle(articles[2], '', embed);
  const { scale, bytes } = readVectorAt(binBuffer, 2);
  const gotC = dequantizeInt8(scale, bytes);
  assert.ok(cosine(expectedC, gotC) > 0.999, `RECORD-C cosine ${cosine(expectedC, gotC)}`);
});

// Validates the committed artifact without the model: cheap CI guard against a
// corrupt or stale binary. Skips cleanly before the artifact is generated.
test('committed artifact (if present) is self-consistent', () => {
  const jsonPath = path.join(ROOT, 'data', 'archive-embeddings.json');
  const binPath = path.join(ROOT, 'data', 'archive-embeddings.bin');
  if (!existsSync(jsonPath) || !existsSync(binPath)) {
    return; // not generated yet -- nothing to validate
  }
  const index = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const bin = readFileSync(binPath);
  assert.equal(index.version, EMBED_INDEX_VERSION);
  assert.equal(index.model, MODEL_ID);
  assert.equal(index.dim, EMBED_DIM);
  assert.equal(index.bytesPerVector, BYTES_PER_VECTOR);
  assert.equal(index.ids.length, index.count);
  assert.equal(bin.length, index.count * BYTES_PER_VECTOR, 'binary size must match id count');
  assert.equal(index.binarySha256, sha256Hex(bin), 'sidecar digest must match binary contents');
  // Every id is unique, so a neighbor lookup can't collide.
  assert.equal(new Set(index.ids).size, index.ids.length, 'ids must be unique');
});
