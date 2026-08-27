/**
 * Tests for the embeddings splice used by record removals (#867).
 *
 * The splice is the only way to drop a record from the published embeddings pair
 * on a machine that cannot run the model, so the property that matters is that
 * every surviving vector keeps its exact bytes and its row still lines up with
 * its id. The fixtures are built here rather than read from data/, so the suite
 * stays honest even while the real artifact is being regenerated.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256Hex } from '../data/lib/embeddings-builder.js';
import { spliceEmbeddings } from '../data/lib/embeddings-splice.js';

const BYTES_PER_VECTOR = 8;

/** A pair whose row N is filled with the byte N, so misalignment is visible. */
function makePair(ids) {
  const binary = Buffer.alloc(ids.length * BYTES_PER_VECTOR);
  for (let row = 0; row < ids.length; row++) {
    binary.fill(row + 1, row * BYTES_PER_VECTOR, (row + 1) * BYTES_PER_VECTOR);
  }
  const index = {
    version: '1.1.0',
    model: 'Xenova/bge-small-en-v1.5',
    dim: 4,
    quantization: 'int8',
    bytesPerVector: BYTES_PER_VECTOR,
    count: ids.length,
    binarySha256: sha256Hex(binary),
    ids,
  };
  return { index, binary };
}

function rowAt(binary, row) {
  return binary.subarray(row * BYTES_PER_VECTOR, (row + 1) * BYTES_PER_VECTOR);
}

test('keeps every surviving vector byte for byte, in id order', () => {
  const { index, binary } = makePair(['a', 'b', 'c', 'd', 'e']);
  const result = spliceEmbeddings(index, binary, ['b', 'd']);

  assert.deepEqual(result.index.ids, ['a', 'c', 'e']);
  assert.deepEqual(result.removed, ['b', 'd']);
  assert.equal(result.index.count, 3);
  assert.equal(result.binary.length, 3 * BYTES_PER_VECTOR);

  // Rows 0, 2 and 4 of the original become rows 0, 1 and 2.
  for (const [after, before] of [[0, 0], [1, 2], [2, 4]]) {
    assert.deepEqual(rowAt(result.binary, after), rowAt(binary, before));
  }
});

test('rewrites the digest so the sidecar still binds to the binary', () => {
  const { index, binary } = makePair(['a', 'b', 'c']);
  const result = spliceEmbeddings(index, binary, ['a']);

  assert.equal(result.index.binarySha256, sha256Hex(result.binary));
  assert.notEqual(result.index.binarySha256, index.binarySha256);
});

test('carries the embedding-space metadata over unchanged', () => {
  const { index, binary } = makePair(['a', 'b']);
  const result = spliceEmbeddings(index, binary, ['a']);

  // A splice removes rows; it does not re-embed, so bumping the version or
  // changing the model would tell the runtime worker something untrue.
  assert.equal(result.index.version, index.version);
  assert.equal(result.index.model, index.model);
  assert.equal(result.index.dim, index.dim);
  assert.equal(result.index.quantization, index.quantization);
  assert.equal(result.index.bytesPerVector, index.bytesPerVector);
});

test('reports ids that are not in the index instead of failing', () => {
  const { index, binary } = makePair(['a', 'b']);
  const result = spliceEmbeddings(index, binary, ['b', 'never-embedded']);

  assert.deepEqual(result.removed, ['b']);
  assert.deepEqual(result.missing, ['never-embedded']);
  assert.deepEqual(result.index.ids, ['a']);
});

test('a rerun removes nothing and leaves the pair as it was', () => {
  const { index, binary } = makePair(['a', 'b', 'c']);
  const once = spliceEmbeddings(index, binary, ['b']);
  const twice = spliceEmbeddings(once.index, once.binary, ['b']);

  assert.deepEqual(twice.removed, []);
  assert.deepEqual(twice.index, once.index);
  assert.deepEqual(twice.binary, once.binary);
});

test('does not leave the input pair modified', () => {
  const { index, binary } = makePair(['a', 'b', 'c']);
  const digestBefore = sha256Hex(binary);
  spliceEmbeddings(index, binary, ['b']);

  assert.deepEqual(index.ids, ['a', 'b', 'c']);
  assert.equal(index.count, 3);
  assert.equal(sha256Hex(binary), digestBefore);
});

test('refuses a pair whose binary length disagrees with the id count', () => {
  const { index, binary } = makePair(['a', 'b', 'c']);
  assert.throws(
    () => spliceEmbeddings(index, binary.subarray(0, binary.length - 1), ['a']),
    /binary is \d+ bytes, expected \d+/,
  );
});

test('refuses a sidecar whose count disagrees with its ids', () => {
  const { index, binary } = makePair(['a', 'b', 'c']);
  assert.throws(
    () => spliceEmbeddings({ ...index, count: 2 }, binary, ['a']),
    /index.count 2 does not match 3 ids/,
  );
});

test('refuses a sidecar with no usable row width', () => {
  const { index, binary } = makePair(['a', 'b']);
  assert.throws(
    () => spliceEmbeddings({ ...index, bytesPerVector: 0 }, binary, ['a']),
    /bytesPerVector must be a positive integer/,
  );
});
