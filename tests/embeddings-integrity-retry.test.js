import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildEmbeddingIndex,
  quantizeInt8,
  serializeVectors,
  sha256Hex,
} from '../data/lib/embeddings-builder.js';
import {
  EMBED_DIM,
  loadEmbeddingStore,
} from '../frontend/services/embeddings-worker.js';

function fixturePair() {
  const vectors = [
    Array.from({ length: EMBED_DIM }, (_value, index) => (index === 0 ? 1 : 0)),
    Array.from({ length: EMBED_DIM }, (_value, index) => (index === 1 ? 1 : 0)),
  ];
  const binary = serializeVectors(vectors.map(quantizeInt8));
  const index = buildEmbeddingIndex(['A', 'B'], sha256Hex(binary));
  return { binary, index };
}

function binaryResponse(binary) {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => binary.buffer.slice(
      binary.byteOffset,
      binary.byteOffset + binary.byteLength,
    ),
  };
}

function indexResponse(index) {
  return {
    ok: true,
    status: 200,
    json: async () => index,
  };
}

describe('embeddings integrity refresh', () => {
  it('refetches the sidecar once with a cache-busted URL after a digest mismatch', async () => {
    const { binary, index } = fixturePair();
    const staleIndex = { ...index, binarySha256: '0'.repeat(64) };
    const calls = [];
    let sidecarReads = 0;

    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      if (url.includes('.bin')) return binaryResponse(binary);
      sidecarReads += 1;
      return indexResponse(sidecarReads === 1 ? staleIndex : index);
    };

    const store = await loadEmbeddingStore(
      '../../data/archive-embeddings.bin?v=3.8.24',
      '../../data/archive-embeddings.json?v=3.8.24',
      {
        fetchImpl,
        cacheBustToken: () => 'retry-token',
      },
    );

    assert.deepEqual(store.ids, ['A', 'B']);
    assert.equal(calls.length, 3);
    assert.equal(
      calls[2].url,
      '../../data/archive-embeddings.json?v=3.8.24&integrity=retry-token',
    );
    assert.deepEqual(calls[2].options, { cache: 'reload' });
  });

  it('also retries a structurally stale sidecar before decoding vectors', async () => {
    const { binary, index } = fixturePair();
    const staleIndex = { ...index, count: index.count + 1 };
    let sidecarReads = 0;

    const fetchImpl = async (url) => {
      if (url.includes('.bin')) return binaryResponse(binary);
      sidecarReads += 1;
      return indexResponse(sidecarReads === 1 ? staleIndex : index);
    };

    const store = await loadEmbeddingStore('vectors.bin', 'vectors.json', {
      fetchImpl,
      cacheBustToken: () => 'structural-retry',
    });

    assert.deepEqual(store.ids, ['A', 'B']);
    assert.equal(sidecarReads, 2);
  });

  it('fails after exactly one fresh-sidecar retry when the pair still disagrees', async () => {
    const { binary, index } = fixturePair();
    const staleIndex = { ...index, binarySha256: 'f'.repeat(64) };
    const calls = [];

    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return url.includes('.bin')
        ? binaryResponse(binary)
        : indexResponse(staleIndex);
    };

    await assert.rejects(
      loadEmbeddingStore('vectors.bin', 'vectors.json', {
        fetchImpl,
        cacheBustToken: () => 'only-once',
      }),
      /does not match sidecar/,
    );
    assert.equal(calls.length, 3);
    assert.equal(calls.filter(call => call.url.includes('integrity=')).length, 1);
  });
});
