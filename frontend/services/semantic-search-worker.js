/**
 * Free-text semantic search worker (#279, the query-to-corpus leg).
 *
 * The similar-in-theme worker compares one stored vector against the others, so
 * it never loads a model. A typed query has no stored vector, so it must be
 * encoded at runtime into the same space the build-time vectors live in. That
 * encode is the only reason this file exists as a second worker: it keeps the
 * model, and its download, out of `embeddings-worker.js`, which stays
 * model-free for the record modal.
 *
 * The model loads lazily on the first query, from a CDN, and the browser caches
 * it. Readers who never turn the toggle on never pay for it.
 *
 * Two contracts must hold or recall degrades silently, with no error:
 *
 * 1. The runtime model must be the model that produced the stored vectors. Both
 *    sides pin `Xenova/bge-small-en-v1.5` with q8 weights and mean pooling.
 * 2. bge is an asymmetric retrieval model. Its passages are embedded bare (the
 *    builder does exactly that) and its queries must carry the instruction
 *    prefix below. Dropping the prefix costs recall without failing.
 *
 * Importing `embeddings-worker.js` also registers its `neighbors` handler on
 * this scope. That handler answers only messages of type "neighbors", which
 * this worker never receives, and it loads nothing until such a message
 * arrives, so it stays inert here.
 */
import {
  EMBED_DIM,
  dot,
  loadEmbeddingStore,
  normalizeInPlace,
  DEFAULT_EMBEDDINGS_BIN_URL,
  DEFAULT_EMBEDDINGS_INDEX_URL,
} from './embeddings-worker.js?v=3.8.33';

// The sentence-transformer that produced data/archive-embeddings.bin. A query
// encoded by any other model lands in a different space and ranks noise.
// tests/semantic-search-worker.test.js pins this to the builder's MODEL_ID.
export const QUERY_MODEL_ID = 'Xenova/bge-small-en-v1.5';

// The instruction prefix bge-small-en-v1.5 prescribes for the query side only.
// The passage side stays bare, which is what the builder does.
export const QUERY_PREFIX =
  'Represent this sentence for searching relevant passages: ';

// Runtime source for the encoder. The same package the builder uses, served as
// a browser module by the CDN the app already imports React from.
export const TRANSFORMERS_MODULE_URL =
  'https://esm.sh/@huggingface/transformers@4.2.0';

// How many articles one query may return, and how similar a match must be to
// count. Cosine between a bge query and a matching passage sits well above 0.6;
// below that the ranking is topic-blob noise, which is the failure mode the
// hybrid merge is supposed to avoid. Both are overridable per request.
export const DEFAULT_QUERY_K = 25;
export const DEFAULT_MIN_SCORE = 0.6;

/** Longest query text the encoder accepts, so a paste cannot stall the worker. */
export const MAX_QUERY_CHARS = 500;

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Rank every stored article against one query vector.
 *
 * Stored vectors are unit-normalized at load, so normalizing the query makes
 * the dot product the cosine. Returns at most `k` matches at or above
 * `minScore`, most similar first. Pure, so the ranking is tested without a
 * model or a network.
 */
export function rankQuery(store, queryVector, { k = DEFAULT_QUERY_K, minScore = DEFAULT_MIN_SCORE } = {}) {
  if (!Number.isInteger(k) || k < 1) {
    throw new Error('semantic search: k must be a positive integer');
  }
  if (!queryVector || queryVector.length !== EMBED_DIM) {
    throw new Error(
      `semantic search: query vector must have ${EMBED_DIM} dimensions`,
    );
  }
  const query = normalizeInPlace(Float32Array.from(queryVector));
  const { ids, vectors } = store;
  const scored = [];
  for (let i = 0; i < ids.length; i++) {
    const score = dot(query, vectors[i]);
    if (score >= minScore) scored.push({ id: ids[i], score });
  }
  scored.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return scored.slice(0, k);
}

/** Add the retrieval prefix and trim the query to the encoder's input budget. */
export function buildQueryText(query) {
  const text = String(query ?? '').trim();
  if (!text) throw new Error('semantic search: query must not be empty');
  return `${QUERY_PREFIX}${text.slice(0, MAX_QUERY_CHARS)}`;
}

/**
 * Load the encoder from the CDN. Reached only through the `createEncoder` seam
 * below, so every other function here runs offline in tests.
 */
async function defaultCreateEncoder() {
  const { pipeline } = await import(TRANSFORMERS_MODULE_URL);
  const extractor = await pipeline('feature-extraction', QUERY_MODEL_ID, {
    dtype: 'q8',
  });
  return async (text) => {
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Float32Array.from(output.data);
  };
}

/**
 * Register the worker request boundary.
 *
 * Requests:
 *   `{ type: 'semantic-warmup', requestId }` loads the artifact and the model
 *   without ranking anything, so the toggle can report readiness and the number
 *   of articles the semantic leg covers.
 *   `{ type: 'semantic-query', requestId, query, k?, minScore? }` ranks one query.
 *
 * Responses carry the same `requestId` so the caller can discard a late answer:
 *   `{ type: 'semantic-warmup-result', requestId, count }`
 *   `{ type: 'semantic-query-result', requestId, query, matches, count }`
 *   `{ type: 'semantic-query-error', requestId, error }`
 *
 * A failed load clears its cached promise, so a later request retries after a
 * transient network or deploy error instead of failing forever.
 */
export function registerSemanticSearchWorker(
  scope,
  {
    loadStore = () =>
      loadEmbeddingStore(
        DEFAULT_EMBEDDINGS_BIN_URL,
        DEFAULT_EMBEDDINGS_INDEX_URL,
      ),
    createEncoder = defaultCreateEncoder,
  } = {},
) {
  if (
    !scope ||
    typeof scope.addEventListener !== 'function' ||
    typeof scope.postMessage !== 'function'
  ) {
    throw new Error('semantic search worker: invalid worker scope');
  }

  let storePromise;
  let encoderPromise;

  const getStore = () => {
    if (!storePromise) {
      storePromise = Promise.resolve()
        .then(() => loadStore())
        .catch((error) => {
          storePromise = undefined;
          throw error;
        });
    }
    return storePromise;
  };

  const getEncoder = () => {
    if (!encoderPromise) {
      encoderPromise = Promise.resolve()
        .then(() => createEncoder())
        .catch((error) => {
          encoderPromise = undefined;
          throw error;
        });
    }
    return encoderPromise;
  };

  const onMessage = async (event) => {
    const request = event?.data;
    const type = request?.type;
    if (type !== 'semantic-query' && type !== 'semantic-warmup') return;

    const requestId = request.requestId;
    try {
      if (
        (typeof requestId !== 'string' && typeof requestId !== 'number') ||
        (typeof requestId === 'string' && requestId.length === 0)
      ) {
        throw new Error(
          'semantic search worker: requestId must be a string or number',
        );
      }

      if (type === 'semantic-warmup') {
        const [store] = await Promise.all([getStore(), getEncoder()]);
        scope.postMessage({
          type: 'semantic-warmup-result',
          requestId,
          count: store.ids.length,
        });
        return;
      }

      const text = buildQueryText(request.query);
      const [store, encode] = await Promise.all([getStore(), getEncoder()]);
      const matches = rankQuery(store, await encode(text), {
        k: request.k ?? DEFAULT_QUERY_K,
        minScore: request.minScore ?? DEFAULT_MIN_SCORE,
      });
      scope.postMessage({
        type: 'semantic-query-result',
        requestId,
        query: request.query,
        matches,
        count: store.ids.length,
      });
    } catch (error) {
      scope.postMessage({
        type: 'semantic-query-error',
        requestId: requestId ?? null,
        error: errorMessage(error),
      });
    }
  };

  scope.addEventListener('message', onMessage);
  return onMessage;
}

const isDedicatedWorkerScope =
  typeof globalThis.document === 'undefined' &&
  typeof globalThis.addEventListener === 'function' &&
  typeof globalThis.postMessage === 'function';

if (isDedicatedWorkerScope) registerSemanticSearchWorker(globalThis);
