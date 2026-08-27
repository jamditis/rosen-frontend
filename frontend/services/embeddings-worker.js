/**
 * Runtime reader for the build-time embeddings artifact (#397, #278 step 2).
 *
 * Self-contained on purpose: no React, HTM, CDN, or bare-specifier imports, so
 * this module can run inside a Worker whose scope the document import map does
 * not reach (#278 C5). It only needs `fetch` and Float32Array math, and it
 * mirrors the small binary contract from `data/lib/embeddings-builder.js`
 * rather than importing it.
 *
 * The artifact is a per-vector int8 quantization: each row is a little-endian
 * float32 scale followed by EMBED_DIM signed bytes, and dequantized[i] equals
 * byte[i] * scale. Row N maps to the JSON sidecar's `ids[N]`.
 */

export const EMBED_DIM = 384;
export const SCALE_BYTES = 4;
export const BYTES_PER_VECTOR = SCALE_BYTES + EMBED_DIM;

/**
 * Down-weight thematic neighbors published close in time so cross-decade echoes
 * surface instead of same-era near-duplicates. A match within TEMPORAL_WINDOW
 * years of the query has its cosine multiplied by TEMPORAL_PENALTY (#278).
 */
export const TEMPORAL_PENALTY = 0.92;
export const TEMPORAL_WINDOW_YEARS = 2;
export const DEFAULT_EMBEDDINGS_BIN_URL =
  "../../data/archive-embeddings.bin?v=3.8.32";
export const DEFAULT_EMBEDDINGS_INDEX_URL =
  "../../data/archive-embeddings.json?v=3.8.32";

function finiteYear(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toDataView(buffer) {
  if (ArrayBuffer.isView(buffer)) {
    return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }
  return new DataView(buffer);
}

function toUint8Array(buffer) {
  if (ArrayBuffer.isView(buffer)) {
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }
  return new Uint8Array(buffer);
}

/** Compute a browser-native SHA-256 digest for an ArrayBuffer or typed view. */
export async function digestSha256Hex(
  buffer,
  { cryptoImpl = globalThis.crypto } = {},
) {
  if (!cryptoImpl?.subtle?.digest) {
    throw new Error('embeddings digest: Web Crypto SHA-256 is unavailable');
  }
  const digest = await cryptoImpl.subtle.digest('SHA-256', toUint8Array(buffer));
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

/** Dequantize the vector at row `i` of the serialized binary into floats. */
export function readVector(view, i) {
  const base = i * BYTES_PER_VECTOR;
  const scale = view.getFloat32(base, true);
  const vec = new Float32Array(EMBED_DIM);
  for (let j = 0; j < EMBED_DIM; j++) {
    vec[j] = view.getInt8(base + SCALE_BYTES + j) * scale;
  }
  return vec;
}

/** Scale a vector to unit length in place; an all-zero vector is left alone. */
export function normalizeInPlace(vec) {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  }
  return vec;
}

/** Dot product of two equal-length vectors. Equals cosine for unit vectors. */
export function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/** Cosine similarity of two equal-length vectors; 0 if either has no length. */
export function cosine(a, b) {
  let sum = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return sum / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Fail fast when the fetched binary and JSON sidecar do not describe the same
 * artifact, and return the validated vector count. A mixed or stale pair (a
 * deploy or cache rollover that ships one but not the other) would otherwise
 * read past the buffer or rank garbage similarities, which is the mixed-release
 * failure the deploy rules guard against. Throwing here lets the caller skip
 * the strand instead of decoding bad data.
 */
export function assertArtifactContract(buffer, index) {
  const ids = index?.ids;
  if (!Array.isArray(ids))
    throw new Error("embeddings sidecar: missing ids array");
  const count = index.count ?? ids.length;
  if (ids.length !== count) {
    throw new Error(
      `embeddings sidecar: count ${count} does not match ids length ${ids.length}`,
    );
  }
  if (index.dim !== undefined && index.dim !== EMBED_DIM) {
    throw new Error(
      `embeddings sidecar: dim ${index.dim} does not match reader ${EMBED_DIM}`,
    );
  }
  if (
    index.bytesPerVector !== undefined &&
    index.bytesPerVector !== BYTES_PER_VECTOR
  ) {
    throw new Error(
      `embeddings sidecar: bytesPerVector ${index.bytesPerVector} does not match reader ${BYTES_PER_VECTOR}`,
    );
  }
  if (index.quantization !== undefined && index.quantization !== "int8") {
    throw new Error(
      `embeddings sidecar: quantization ${index.quantization} is not int8`,
    );
  }
  if (
    typeof index.binarySha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(index.binarySha256)
  ) {
    throw new Error("embeddings sidecar: missing or invalid binarySha256");
  }
  const expected = count * BYTES_PER_VECTOR;
  if (buffer.byteLength !== expected) {
    throw new Error(
      `embeddings binary: ${buffer.byteLength} bytes does not match ${expected} for ${count} vectors`,
    );
  }
  return count;
}

/**
 * Decode the whole binary once into an in-memory store the neighbor search
 * reads. `index` is the JSON sidecar ({ ids, count, ... }); its `ids` order
 * must match the binary's row order. Vectors are normalized to unit length at
 * load, so the neighbor search reduces to a plain dot product (see `neighbors`).
 * Throws if the binary and sidecar disagree (see `assertArtifactContract`).
 */
export function buildEmbeddingStore(buffer, index) {
  const count = assertArtifactContract(buffer, index);
  const ids = index.ids;
  const view = toDataView(buffer);
  const vectors = new Array(count);
  const position = new Map();
  for (let i = 0; i < count; i++) {
    vectors[i] = normalizeInPlace(readVector(view, i));
    position.set(ids[i], i);
  }
  return { ids, vectors, position };
}

/**
 * Fetch the binary and its JSON sidecar and build the store. `fetchImpl` is
 * injectable so this loads under a fake fetch in tests and under the real one
 * (worker or main thread) in the browser.
 */
function cacheBustedArtifactUrl(url, token) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}integrity=${encodeURIComponent(token)}`;
}

async function verifyEmbeddingPair(buffer, index, digestImpl) {
  assertArtifactContract(buffer, index);
  const actualDigest = await digestImpl(buffer);
  if (actualDigest !== index.binarySha256) {
    throw new Error(
      `embeddings binary: SHA-256 ${actualDigest} does not match sidecar ${index.binarySha256}`,
    );
  }
  return buildEmbeddingStore(buffer, index);
}

export async function loadEmbeddingStore(
  binUrl,
  indexUrl,
  {
    fetchImpl = globalThis.fetch,
    digestImpl = digestSha256Hex,
    cacheBustToken = () => Date.now().toString(36),
  } = {},
) {
  const [binResponse, indexResponse] = await Promise.all([
    fetchImpl(binUrl),
    fetchImpl(indexUrl),
  ]);
  if (!binResponse.ok)
    throw new Error(`embeddings binary ${binUrl}: ${binResponse.status}`);
  if (!indexResponse.ok)
    throw new Error(`embeddings index ${indexUrl}: ${indexResponse.status}`);
  const [buffer, index] = await Promise.all([
    binResponse.arrayBuffer(),
    indexResponse.json(),
  ]);

  try {
    return await verifyEmbeddingPair(buffer, index, digestImpl);
  } catch (initialIntegrityError) {
    // The two parallel requests can observe either order of a release switch.
    // Refresh both members exactly once under one new cache key so the retry
    // reads one release without creating an unbounded network loop.
    const retryToken = cacheBustToken();
    const freshBinUrl = cacheBustedArtifactUrl(binUrl, retryToken);
    const freshIndexUrl = cacheBustedArtifactUrl(indexUrl, retryToken);
    const [freshBinResponse, freshIndexResponse] = await Promise.all([
      fetchImpl(freshBinUrl, { cache: 'reload' }),
      fetchImpl(freshIndexUrl, { cache: 'reload' }),
    ]);
    if (!freshBinResponse.ok) {
      throw new Error(
        `embeddings binary ${freshBinUrl}: ${freshBinResponse.status}`,
        { cause: initialIntegrityError },
      );
    }
    if (!freshIndexResponse.ok) {
      throw new Error(
        `embeddings index ${freshIndexUrl}: ${freshIndexResponse.status}`,
        { cause: initialIntegrityError },
      );
    }
    const [freshBuffer, freshIndex] = await Promise.all([
      freshBinResponse.arrayBuffer(),
      freshIndexResponse.json(),
    ]);
    return verifyEmbeddingPair(freshBuffer, freshIndex, digestImpl);
  }
}

/**
 * Top-`k` cosine neighbors of `recordId`, most similar first.
 *
 * Returns `[]` for an id that is not in the index, so social posts and deep-link
 * records outside the embedded article set render no "similar in theme" strand
 * (#278 C8). `yearOf(id)` supplies the publication year for the temporal
 * penalty; finite numeric strings are accepted because archive records store
 * years as strings. Other missing or non-numeric values skip the penalty.
 * `exclude` is an optional set of ids to drop (a near-dup sidecar, once built).
 */
export function neighbors(store, recordId, { k = 5, yearOf, exclude } = {}) {
  const { ids, vectors, position } = store;
  const queryIndex = position.get(recordId);
  if (queryIndex === undefined) return [];
  const query = vectors[queryIndex];
  const baseYear =
    typeof yearOf === "function" ? finiteYear(yearOf(recordId)) : null;
  const scored = [];
  for (let i = 0; i < ids.length; i++) {
    if (i === queryIndex) continue;
    const id = ids[i];
    if (exclude && exclude.has(id)) continue;
    // Vectors are unit-normalized at load, so the dot product is the cosine.
    let score = dot(query, vectors[i]);
    // Only down-weight positive similarities: multiplying a negative cosine by
    // 0.92 moves it toward zero and would rank a dissimilar same-era record
    // higher, the opposite of the intended penalty. Thematic neighbors sit in
    // the positive regime, so the guard costs nothing there.
    if (score > 0 && baseYear !== null) {
      const year = finiteYear(yearOf(id));
      if (
        year !== null &&
        Math.abs(year - baseYear) <= TEMPORAL_WINDOW_YEARS
      ) {
        score *= TEMPORAL_PENALTY;
      }
    }
    scored.push({ id, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

function requestYearOf(years) {
  if (years instanceof Map) return (id) => years.get(id);
  if (years && typeof years === "object") return (id) => years[id];
  return undefined;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Register the dedicated Worker request boundary used by the RecordModal wiring.
 *
 * Request: `{ type: "neighbors", requestId, recordId, k?, years?, exclude? }`.
 * Response: `{ type: "neighbors-result", requestId, recordId, neighbors }` or
 * `{ type: "neighbors-error", requestId, error }`. `requestId` is an opaque
 * string or number that lets the caller discard a late response. The artifact
 * loads once on first use; a failed load clears the cached promise so a later
 * request can retry after a transient deployment or network error.
 */
export function registerEmbeddingsWorker(
  scope,
  {
    loadStore = () =>
      loadEmbeddingStore(
        DEFAULT_EMBEDDINGS_BIN_URL,
        DEFAULT_EMBEDDINGS_INDEX_URL,
      ),
  } = {},
) {
  if (
    !scope ||
    typeof scope.addEventListener !== "function" ||
    typeof scope.postMessage !== "function"
  ) {
    throw new Error("embeddings worker: invalid worker scope");
  }

  let storePromise;
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

  const onMessage = async (event) => {
    const request = event?.data;
    if (request?.type !== "neighbors") return;

    const requestId = request.requestId;
    try {
      if (
        (typeof requestId !== "string" && typeof requestId !== "number") ||
        (typeof requestId === "string" && requestId.length === 0)
      ) {
        throw new Error(
          "embeddings worker: requestId must be a string or number",
        );
      }
      if (typeof request.recordId !== "string" || request.recordId.length === 0) {
        throw new Error(
          "embeddings worker: recordId must be a non-empty string",
        );
      }

      const k = request.k ?? 5;
      if (!Number.isInteger(k) || k < 1) {
        throw new Error("embeddings worker: k must be a positive integer");
      }
      const exclude = Array.isArray(request.exclude)
        ? new Set(request.exclude)
        : undefined;
      const result = neighbors(await getStore(), request.recordId, {
        k,
        yearOf: requestYearOf(request.years),
        exclude,
      });
      scope.postMessage({
        type: "neighbors-result",
        requestId,
        recordId: request.recordId,
        neighbors: result,
      });
    } catch (error) {
      scope.postMessage({
        type: "neighbors-error",
        requestId: requestId ?? null,
        error: errorMessage(error),
      });
    }
  };

  scope.addEventListener("message", onMessage);
  return onMessage;
}

const isDedicatedWorkerScope =
  typeof globalThis.document === "undefined" &&
  typeof globalThis.addEventListener === "function" &&
  typeof globalThis.postMessage === "function";

if (isDedicatedWorkerScope) registerEmbeddingsWorker(globalThis);
