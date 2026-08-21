/**
 * Tests for the runtime embeddings worker (issue #397, #278 step 2).
 *
 * The load-bearing claims are: (1) the worker reads exactly what the build-time
 * builder writes, so a synthetic binary made with the real serializer round-trips
 * through the worker's reader; (2) `neighbors` ranks by cosine, most similar
 * first, and returns `[]` for an id outside the embedded set; (3) the x0.92
 * temporal penalty down-weights a same-era match so a farther-in-time neighbor
 * of equal cosine outranks it; and (4) `exclude` drops ids. The synthetic
 * vectors are chosen with wide cosine gaps so int8 quantization noise cannot
 * flip the asserted order.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMBED_DIM,
  quantizeInt8,
  dequantizeInt8,
  serializeVectors,
  readVectorAt,
  sha256Hex,
  buildEmbeddingIndex,
} from "../data/lib/embeddings-builder.js";
import {
  cosine,
  digestSha256Hex,
  readVector,
  buildEmbeddingStore,
  loadEmbeddingStore,
  neighbors,
} from "../frontend/services/embeddings-worker.js";

/** A 384-dim vector with the given { dimIndex: value } components set. */
function vec(components) {
  const v = new Float32Array(EMBED_DIM);
  for (const [dim, value] of Object.entries(components)) v[Number(dim)] = value;
  return v;
}

// A and B point almost the same way (cosine ~0.99); E is identical to B; D is
// partly aligned with A (cosine ~0.6); C is orthogonal to A (cosine 0).
const VECTORS = {
  A: vec({ 0: 1 }),
  B: vec({ 0: 0.9, 1: 0.1 }),
  C: vec({ 1: 1 }),
  D: vec({ 0: 0.6, 2: 0.8 }),
  E: vec({ 0: 0.9, 1: 0.1 }),
};
const IDS = ["A", "B", "C", "D", "E"];
const YEARS = { A: 2000, B: 2001, C: 1990, D: 2020, E: 2010 };
const yearOf = (id) => YEARS[id];

function buildIndex(binBuffer, ids = IDS) {
  return buildEmbeddingIndex(ids, sha256Hex(binBuffer));
}

function buildStore() {
  const quantized = IDS.map((id) => quantizeInt8(VECTORS[id]));
  const binBuffer = serializeVectors(quantized);
  const index = buildIndex(binBuffer);
  return buildEmbeddingStore(binBuffer, index);
}

test("cosine: orthogonal is 0, identical is 1, empty is 0", () => {
  assert.equal(cosine(VECTORS.A, VECTORS.C), 0);
  assert.ok(Math.abs(cosine(VECTORS.B, VECTORS.E) - 1) < 1e-6);
  assert.equal(cosine(new Float32Array(EMBED_DIM), VECTORS.A), 0);
});

test("readVector matches the builder byte-for-byte (pins the float32-LE scale read)", () => {
  const binBuffer = serializeVectors(
    IDS.map((id) => quantizeInt8(VECTORS[id])),
  );
  const view = new DataView(
    binBuffer.buffer,
    binBuffer.byteOffset,
    binBuffer.byteLength,
  );
  // A wrong endianness or row offset in the scale read would survive the
  // ranking tests (cosine is scale-invariant); this pins it against the builder.
  for (const i of [0, 2, 4]) {
    const { scale, bytes } = readVectorAt(binBuffer, i);
    assert.deepEqual(readVector(view, i), dequantizeInt8(scale, bytes));
  }
});

test("buildEmbeddingStore reads back the builder-serialized vectors", () => {
  const store = buildStore();
  assert.deepEqual(store.ids, IDS);
  assert.equal(store.vectors.length, IDS.length);
  // Row 0 (A) dequantizes and normalizes back to the e0 direction.
  assert.ok(Math.abs(store.vectors[0][0] - 1) < 1e-3);
});

test("neighbors ranks by cosine, most similar first", () => {
  const store = buildStore();
  const result = neighbors(store, "A", { k: 4 });
  const order = result.map((r) => r.id);
  // B and E are equally the closest (identical vectors), then D, then C.
  assert.deepEqual(new Set(order.slice(0, 2)), new Set(["B", "E"]));
  assert.equal(order[2], "D");
  assert.equal(order[3], "C");
  // Scores are sorted descending.
  for (let i = 1; i < result.length; i++)
    assert.ok(result[i - 1].score >= result[i].score);
});

test("buildEmbeddingStore throws when the sidecar count exceeds the binary", () => {
  const binBuffer = serializeVectors(
    IDS.map((id) => quantizeInt8(VECTORS[id])),
  );
  // Sidecar claims six vectors; the binary holds five (a mixed/stale pair).
  const index = buildIndex(binBuffer, [...IDS, "GHOST"]);
  assert.throws(() => buildEmbeddingStore(binBuffer, index), /does not match/);
});

test("buildEmbeddingStore throws on a dim mismatch (re-embed at a different size)", () => {
  const binBuffer = serializeVectors(
    IDS.map((id) => quantizeInt8(VECTORS[id])),
  );
  // A future re-embed at a different dimension would decode with the wrong
  // stride and rank garbage; the reader must reject it instead.
  const index = { ...buildIndex(binBuffer), dim: EMBED_DIM - 1 };
  assert.throws(() => buildEmbeddingStore(binBuffer, index), /dim/);
});

test("neighbors returns [] for an id outside the embedded set", () => {
  const store = buildStore();
  assert.deepEqual(neighbors(store, "not-an-article"), []);
});

test("temporal penalty down-weights a same-era match", () => {
  const store = buildStore();
  // B (2001) is within +-2 years of A (2000) so it is penalized; E (2010) is
  // not. With identical vectors the penalty is the only tiebreaker, so E must
  // outrank B. Without the penalty the two tie and E would not lead.
  const result = neighbors(store, "A", { k: 5, yearOf });
  const order = result.map((r) => r.id);
  assert.equal(order[0], "E");
  assert.equal(order[1], "B");
  assert.ok(result[0].score > result[1].score);
});

test("temporal penalty accepts archive year strings", () => {
  const store = buildStore();
  const stringYears = { A: "2000", B: "2001", E: "2010" };
  const result = neighbors(store, "A", {
    k: 2,
    yearOf: (id) => stringYears[id],
  });
  assert.deepEqual(
    result.map((entry) => entry.id),
    ["E", "B"],
  );
});

test("temporal penalty never boosts a negative-cosine same-era match", () => {
  const ids = ["Q", "OPP"];
  const opposed = { Q: vec({ 0: 1 }), OPP: vec({ 0: -1 }) }; // cosine(Q, OPP) = -1
  const binBuffer = serializeVectors(
    ids.map((id) => quantizeInt8(opposed[id])),
  );
  const store = buildEmbeddingStore(binBuffer, buildIndex(binBuffer, ids));
  const sameEra = (id) => (id === "Q" ? 2000 : 2001); // within +-2 years
  const [opp] = neighbors(store, "Q", { k: 1, yearOf: sameEra });
  // x0.92 on -1 would give -0.92 (ranked higher); the guard keeps it at -1.
  assert.ok(
    opp.score <= -0.99,
    `expected the raw cosine near -1, got ${opp.score}`,
  );
});

test("exclude drops the given ids", () => {
  const store = buildStore();
  const result = neighbors(store, "A", { k: 5, exclude: new Set(["B"]) });
  assert.ok(!result.some((r) => r.id === "B"));
  assert.ok(result.some((r) => r.id === "E"));
});

test("browser SHA-256 matches the build-time digest", async () => {
  const binBuffer = serializeVectors(IDS.map((id) => quantizeInt8(VECTORS[id])));
  assert.equal(await digestSha256Hex(binBuffer), sha256Hex(binBuffer));
});

test("loadEmbeddingStore rejects a same-shape stale binary by digest", async () => {
  const binBuffer = serializeVectors(IDS.map((id) => quantizeInt8(VECTORS[id])));
  const index = { ...buildIndex(binBuffer), binarySha256: '0'.repeat(64) };
  const fetchImpl = async (url) => {
    if (url.endsWith(".bin")) {
      return {
        ok: true,
        arrayBuffer: async () =>
          binBuffer.buffer.slice(
            binBuffer.byteOffset,
            binBuffer.byteOffset + binBuffer.byteLength,
          ),
      };
    }
    return { ok: true, json: async () => index };
  };
  await assert.rejects(
    loadEmbeddingStore('x/archive-embeddings.bin', 'x/archive-embeddings.json', { fetchImpl }),
    /SHA-256 .* does not match sidecar/,
  );
});

test("loadEmbeddingStore fetches the binary and sidecar via an injected fetch", async () => {
  const quantized = IDS.map((id) => quantizeInt8(VECTORS[id]));
  const binBuffer = serializeVectors(quantized);
  const index = buildIndex(binBuffer);
  const fetchImpl = async (url) => {
    if (url.endsWith(".bin")) {
      return {
        ok: true,
        arrayBuffer: async () =>
          binBuffer.buffer.slice(
            binBuffer.byteOffset,
            binBuffer.byteOffset + binBuffer.byteLength,
          ),
      };
    }
    return { ok: true, json: async () => index };
  };
  const store = await loadEmbeddingStore(
    "x/archive-embeddings.bin",
    "x/archive-embeddings.json",
    {
      fetchImpl,
    },
  );
  assert.deepEqual(store.ids, IDS);
  assert.deepEqual(neighbors(store, "A", { k: 1 }).length, 1);
});

test("worker messages load once, echo request ids, and return structured errors", async () => {
  const workerModule = await import(
    "../frontend/services/embeddings-worker.js"
  );
  assert.equal(typeof workerModule.registerEmbeddingsWorker, "function");

  const posted = [];
  let messageHandler;
  let loads = 0;
  const scope = {
    addEventListener(type, handler) {
      assert.equal(type, "message");
      messageHandler = handler;
    },
    postMessage(message) {
      posted.push(message);
    },
  };
  workerModule.registerEmbeddingsWorker(scope, {
    loadStore: async () => {
      loads++;
      return buildStore();
    },
  });

  const years = { A: "2000", B: "2001", E: "2010" };
  await messageHandler({
    data: { type: "neighbors", requestId: "first", recordId: "A", k: 2, years },
  });
  await messageHandler({
    data: { type: "neighbors", requestId: "second", recordId: "A", k: 1, years },
  });
  await messageHandler({
    data: { type: "neighbors", requestId: "bad-request" },
  });

  assert.equal(loads, 1);
  assert.deepEqual(posted[0], {
    type: "neighbors-result",
    requestId: "first",
    recordId: "A",
    neighbors: [
      { id: "E", score: posted[0].neighbors[0].score },
      { id: "B", score: posted[0].neighbors[1].score },
    ],
  });
  assert.equal(posted[1].requestId, "second");
  assert.equal(posted[1].neighbors.length, 1);
  assert.deepEqual(posted[2], {
    type: "neighbors-error",
    requestId: "bad-request",
    error: "embeddings worker: recordId must be a non-empty string",
  });
});
