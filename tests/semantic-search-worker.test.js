/**
 * Free-text semantic search worker (#279, the query-to-corpus leg).
 *
 * Two of these checks guard failures that produce no error at all, only worse
 * results: encoding the query with a different model than the one that built
 * the stored vectors, and dropping the instruction prefix bge prescribes for
 * the query side. Both would pass every other test in the suite.
 *
 * The rest pin the ranking itself and the worker request boundary. The model is
 * reached only through the `createEncoder` seam, so none of this touches a
 * network or loads weights.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_MIN_SCORE,
  DEFAULT_QUERY_K,
  DEFAULT_SOCIAL_MIN_SCORE,
  DEFAULT_SOCIAL_QUERY_K,
  MAX_QUERY_CHARS,
  QUERY_MODEL_ID,
  QUERY_PREFIX,
  TRANSFORMERS_MODULE_URL,
  buildQueryText,
  rankQuery,
  rankSemanticStores,
  registerSemanticSearchWorker,
} from '../frontend/services/semantic-search-worker.js';
import { EMBED_DIM } from '../frontend/services/embeddings-worker.js';
import { MODEL_ID as BUILDER_MODEL_ID } from '../data/lib/embeddings-builder.js';

// A store shaped like the one buildEmbeddingStore returns: unit vectors along
// three axes, so a query aimed at an axis has a predictable cosine.
function axisStore() {
  const unit = (index) => {
    const vector = new Float32Array(EMBED_DIM);
    vector[index] = 1;
    return vector;
  };
  return {
    ids: ['RECORD-A', 'RECORD-B', 'RECORD-C'],
    vectors: [unit(0), unit(1), unit(2)],
    position: new Map([['RECORD-A', 0], ['RECORD-B', 1], ['RECORD-C', 2]]),
  };
}

function mixedQuery(weights) {
  const vector = new Float32Array(EMBED_DIM);
  weights.forEach((weight, index) => { vector[index] = weight; });
  return vector;
}

test('pins the runtime model to the model that built the stored vectors', () => {
  assert.equal(QUERY_MODEL_ID, BUILDER_MODEL_ID);
});

test('runs the same transformers major the builder is pinned to', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
  );
  const buildRange = packageJson.devDependencies['@huggingface/transformers'];
  const buildMajor = buildRange.match(/(\d+)/)[1];
  assert.match(
    TRANSFORMERS_MODULE_URL,
    new RegExp(`^https://esm\\.sh/@huggingface/transformers@${buildMajor}\\.`),
    'the runtime encoder and the build-time encoder must share a major version',
  );
});

test('prefixes the query with the instruction bge prescribes for queries', () => {
  assert.equal(
    QUERY_PREFIX,
    'Represent this sentence for searching relevant passages: ',
  );
  assert.equal(
    buildQueryText('  the view from nowhere  '),
    `${QUERY_PREFIX}the view from nowhere`,
  );
});

test('trims an over-long query instead of stalling the encoder', () => {
  const text = buildQueryText('a'.repeat(MAX_QUERY_CHARS + 500));
  assert.equal(text.length, QUERY_PREFIX.length + MAX_QUERY_CHARS);
});

test('rejects an empty query', () => {
  assert.throws(() => buildQueryText('   '), /query must not be empty/);
});

test('ranks by cosine, most similar first', () => {
  const matches = rankQuery(axisStore(), mixedQuery([0.9, 0.4, 0.1]), {
    minScore: 0,
  });
  assert.deepEqual(matches.map(match => match.id), ['RECORD-A', 'RECORD-B', 'RECORD-C']);
  assert.ok(matches[0].score > matches[1].score);
});

test('drops matches below the score floor', () => {
  const matches = rankQuery(axisStore(), mixedQuery([1, 0.05, 0]), {
    minScore: DEFAULT_MIN_SCORE,
  });
  assert.deepEqual(matches.map(match => match.id), ['RECORD-A']);
});

test('returns at most k matches', () => {
  const matches = rankQuery(axisStore(), mixedQuery([0.9, 0.8, 0.7]), {
    minScore: 0,
    k: 2,
  });
  assert.equal(matches.length, 2);
});

test('normalizes the query, so vector length cannot change the ranking', () => {
  const store = axisStore();
  const small = rankQuery(store, mixedQuery([0.9, 0.4, 0.1]), { minScore: 0 });
  const large = rankQuery(store, mixedQuery([90, 40, 10]), { minScore: 0 });
  assert.deepEqual(small.map(m => m.id), large.map(m => m.id));
  assert.ok(Math.abs(small[0].score - large[0].score) < 1e-6);
});

test('fails loudly on a query vector of the wrong width', () => {
  assert.throws(
    () => rankQuery(axisStore(), new Float32Array(8)),
    /384 dimensions/,
  );
});

test('expands results across curated and social stores without letting posts take over', () => {
  const curated = axisStore();
  const social = axisStore();
  social.ids = ['BSKY-A', 'BSKY-B', 'BSKY-C'];
  const matches = rankSemanticStores(
    { curated, social },
    mixedQuery([0.9, 0.8, 0.7]),
    { minScore: 0, socialMinScore: 0, k: 4, socialK: 1 },
  );
  assert.equal(matches.length, 4);
  assert.equal(matches.filter(match => match.id.startsWith('BSKY-')).length, 1);
});

// A scope stand-in with the two methods the worker boundary needs.
function fakeScope() {
  const sent = [];
  let handler = null;
  return {
    sent,
    addEventListener: (type, fn) => { if (type === 'message') handler = fn; },
    postMessage: message => sent.push(message),
    deliver: data => handler({ data }),
  };
}

function workerFixture({
  loadStore,
  loadCuratedStore,
  loadSocialStore,
  createEncoder,
} = {}) {
  const scope = fakeScope();
  const encodes = [];
  registerSemanticSearchWorker(scope, {
    loadCuratedStore: loadCuratedStore || loadStore || (async () => axisStore()),
    loadSocialStore: loadSocialStore || (async () => null),
    createEncoder: createEncoder || (async () => async (text) => {
      encodes.push(text);
      return mixedQuery([0.9, 0.4, 0.1]);
    }),
  });
  return { scope, encodes };
}

test('answers a query with ranked matches and the covered count', async () => {
  const { scope, encodes } = workerFixture();
  scope.deliver({ type: 'semantic-query', requestId: 'q1', query: 'press think', minScore: 0 });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(scope.sent.length, 1);
  const message = scope.sent[0];
  assert.equal(message.type, 'semantic-query-result');
  assert.equal(message.requestId, 'q1');
  assert.equal(message.count, 3);
  assert.deepEqual(message.matches.map(match => match.id), ['RECORD-A', 'RECORD-B', 'RECORD-C']);
  // The encoder must see the prefixed text, not the raw query.
  assert.deepEqual(encodes, [`${QUERY_PREFIX}press think`]);
});

test('warmup loads the artifact and reports coverage without ranking', async () => {
  const { scope, encodes } = workerFixture();
  scope.deliver({ type: 'semantic-warmup', requestId: 'w1' });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(scope.sent[0].type, 'semantic-warmup-result');
  assert.equal(scope.sent[0].count, 3);
  assert.deepEqual(encodes, []);
});

test('coverage includes the edited-record and social stores', async () => {
  const { scope } = workerFixture({
    loadSocialStore: async () => axisStore(),
  });
  scope.deliver({ type: 'semantic-warmup', requestId: 'w1' });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(scope.sent[0].count, 6);
});

test('reports a failed artifact load as an error the client can fall back from', async () => {
  const { scope } = workerFixture({
    loadStore: async () => { throw new Error('embeddings binary: 404'); },
  });
  scope.deliver({ type: 'semantic-query', requestId: 'q1', query: 'press' });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(scope.sent[0].type, 'semantic-query-error');
  assert.match(scope.sent[0].error, /404/);
});

test('retries the load on a later request instead of failing forever', async () => {
  let attempts = 0;
  const { scope } = workerFixture({
    loadStore: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('network');
      return axisStore();
    },
  });
  scope.deliver({ type: 'semantic-query', requestId: 'q1', query: 'press', minScore: 0 });
  await new Promise(resolve => setTimeout(resolve, 0));
  scope.deliver({ type: 'semantic-query', requestId: 'q2', query: 'press', minScore: 0 });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(scope.sent[0].type, 'semantic-query-error');
  assert.equal(scope.sent[1].type, 'semantic-query-result');
  assert.equal(attempts, 2);
});

test('retries a failed social load without reloading the curated store', async () => {
  let curatedLoads = 0;
  let socialLoads = 0;
  const socialStore = axisStore();
  socialStore.ids = ['BSKY-A', 'BSKY-B', 'BSKY-C'];
  const { scope } = workerFixture({
    loadCuratedStore: async () => {
      curatedLoads += 1;
      return axisStore();
    },
    loadSocialStore: async () => {
      socialLoads += 1;
      if (socialLoads === 1) throw new Error('temporary social outage');
      return socialStore;
    },
  });

  scope.deliver({ type: 'semantic-warmup', requestId: 'w1' });
  await new Promise(resolve => setTimeout(resolve, 0));
  scope.deliver({ type: 'semantic-query', requestId: 'q1', query: 'press', minScore: 0 });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(scope.sent[0].type, 'semantic-warmup-result');
  assert.equal(scope.sent[0].count, 3);
  assert.equal(scope.sent[1].type, 'semantic-query-result');
  assert.equal(scope.sent[1].count, 6);
  assert.equal(curatedLoads, 1);
  assert.equal(socialLoads, 2);
});

test('loads the artifact and the model once across many queries', async () => {
  let loads = 0;
  let encoderBuilds = 0;
  const { scope } = workerFixture({
    loadStore: async () => { loads += 1; return axisStore(); },
    createEncoder: async () => { encoderBuilds += 1; return async () => mixedQuery([1, 0, 0]); },
  });
  scope.deliver({ type: 'semantic-query', requestId: 'q1', query: 'one', minScore: 0 });
  await new Promise(resolve => setTimeout(resolve, 0));
  scope.deliver({ type: 'semantic-query', requestId: 'q2', query: 'two', minScore: 0 });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(loads, 1);
  assert.equal(encoderBuilds, 1);
});

test('ignores messages meant for another worker', async () => {
  const { scope } = workerFixture();
  scope.deliver({ type: 'neighbors', requestId: 'n1', recordId: 'RECORD-A' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(scope.sent, []);
});

test('rejects a request with no usable requestId', async () => {
  const { scope } = workerFixture();
  scope.deliver({ type: 'semantic-query', query: 'press' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(scope.sent[0].type, 'semantic-query-error');
  assert.equal(scope.sent[0].requestId, null);
});

test('defaults keep one query cheap and its matches relevant', () => {
  assert.ok(DEFAULT_QUERY_K > 0 && DEFAULT_QUERY_K <= 50);
  assert.ok(DEFAULT_SOCIAL_QUERY_K > 0 && DEFAULT_SOCIAL_QUERY_K < DEFAULT_QUERY_K);
  assert.ok(DEFAULT_MIN_SCORE > 0 && DEFAULT_MIN_SCORE < 1);
  assert.ok(DEFAULT_SOCIAL_MIN_SCORE > DEFAULT_MIN_SCORE && DEFAULT_SOCIAL_MIN_SCORE < 1);
});
