/**
 * Tests for the Reciprocal Rank Fusion core (issue #279, the fusion step).
 *
 * The load-bearing claims of #279's merge are: (1) the fused set is the UNION of
 * the lexical and semantic lists, not their intersection; (2) a candidate missing
 * from one list contributes nothing from it (the term is omitted, not added as
 * 1/(k+infinity)); and (3) agreement near the top of both lists outranks a single
 * list's top hit. The first three tests prove exactly those, using k=60. The rest
 * pin provenance (the kw/sem/kw·sem chips), determinism, and the fail-loud guards.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reciprocalRankFusion,
  chipFor,
  DEFAULT_RRF_K,
  LABEL_LEXICAL,
  LABEL_SEMANTIC,
} from '../frontend/utils/rrf.js';

// A small worked example reused across tests. With k=60 the per-rank weights are
// 1/61, 1/62, 1/63 for ranks 1, 2, 3.
const KW = ['A', 'B', 'C']; // lexical leg
const SEM = ['B', 'D', 'A']; // semantic leg
const W1 = 1 / 61;
const W2 = 1 / 62;
const W3 = 1 / 63;

test('fuses two lists into the union, ordered by summed reciprocal rank', () => {
  const out = reciprocalRankFusion({ kw: KW, sem: SEM });
  assert.deepEqual(out.map((h) => h.id), ['B', 'A', 'D', 'C']);

  const byId = Object.fromEntries(out.map((h) => [h.id, h]));
  // B: kw rank2 + sem rank1; A: kw rank1 + sem rank3.
  assert.ok(Math.abs(byId.B.score - (W2 + W1)) < 1e-12);
  assert.ok(Math.abs(byId.A.score - (W1 + W3)) < 1e-12);
  // C and D each appear in one list only.
  assert.ok(Math.abs(byId.C.score - W3) < 1e-12);
  assert.ok(Math.abs(byId.D.score - W2) < 1e-12);
});

test('agreement near the top beats a single list top hit (B > A)', () => {
  // A is rank 1 in kw but only rank 3 in sem; B is rank 2 + rank 1. B wins
  // because RRF rewards showing up well in BOTH legs.
  const out = reciprocalRankFusion({ kw: KW, sem: SEM });
  assert.equal(out[0].id, 'B');
  assert.ok(out[0].score > out[1].score);
});

test('a missing-from-one-list candidate contributes exactly its single term', () => {
  // D is absent from kw. Its score must be precisely the sem-rank-2 weight, with
  // NO phantom 1/(k+infinity) from the list it is missing from.
  const out = reciprocalRankFusion({ kw: ['A'], sem: ['Z', 'D'] });
  const d = out.find((h) => h.id === 'D');
  assert.equal(d.score, W2);
  assert.deepEqual(d.sources, ['sem']);
  assert.deepEqual(d.ranks, { sem: 2 });

  // And a both-lists hit at rank 1 each scores 2/61 > any single-list rank-1 hit.
  const both = reciprocalRankFusion({ kw: ['X'], sem: ['X'] });
  assert.equal(both[0].score, 2 * W1);
  assert.ok(both[0].score > W1);
});

test('provenance and chips fall out of the leg labels', () => {
  const out = reciprocalRankFusion({ kw: KW, sem: SEM });
  const byId = Object.fromEntries(out.map((h) => [h.id, h]));
  assert.deepEqual(byId.A.sources, ['kw', 'sem']);
  assert.equal(chipFor(byId.A.sources), 'kw·sem');
  assert.equal(chipFor(byId.C.sources), 'kw'); // lexical only
  assert.equal(chipFor(byId.D.sources), 'sem'); // semantic only
  // The middle dot is U+00B7, not an ASCII period.
  assert.equal(chipFor([LABEL_LEXICAL, LABEL_SEMANTIC]), 'kw·sem');
  // chipFor canonicalizes its own input, so a hand-built out-of-order sources
  // array still renders the canonical badge.
  assert.equal(chipFor(['sem', 'kw']), 'kw·sem');
});

test('chip provenance is canonical regardless of input list order', () => {
  // A hit in both legs must render 'kw·sem' whether the caller passed the lists
  // as { kw, sem } or { sem, kw } -- sources is canonicalized, not key-ordered.
  const forward = reciprocalRankFusion({ kw: ['X'], sem: ['X'] });
  const reversed = reciprocalRankFusion({ sem: ['X'], kw: ['X'] });
  assert.deepEqual(forward[0].sources, ['kw', 'sem']);
  assert.deepEqual(reversed[0].sources, ['kw', 'sem']);
  assert.equal(chipFor(reversed[0].sources), 'kw·sem');
});

test('ties break by id ascending, independent of input order', () => {
  // Both hits sit at rank 1 of their own single list -> equal score. The order
  // must be deterministic (id ascending), regardless of which list came first.
  const a = reciprocalRankFusion({ kw: ['Y'], sem: ['X'] });
  const b = reciprocalRankFusion({ sem: ['X'], kw: ['Y'] });
  assert.deepEqual(a.map((h) => h.id), ['X', 'Y']);
  assert.deepEqual(b.map((h) => h.id), ['X', 'Y']);
  assert.equal(a[0].score, a[1].score);
});

test('duplicate ids in a list use dense ranks and are not double-counted', () => {
  // The repeated 'A' must not score twice, and must not push 'B' to rank 3 --
  // dense ranking gives B rank 2.
  const out = reciprocalRankFusion({ kw: ['A', 'A', 'B'] });
  const byId = Object.fromEntries(out.map((h) => [h.id, h]));
  assert.equal(byId.A.score, W1);
  assert.equal(byId.A.ranks.kw, 1);
  assert.equal(byId.B.score, W2);
  assert.equal(byId.B.ranks.kw, 2);
});

test('k flattens the head: larger k shrinks the rank-1 advantage', () => {
  const small = reciprocalRankFusion({ kw: ['A', 'B'] }, { k: 1 });
  const large = reciprocalRankFusion({ kw: ['A', 'B'] }, { k: 1000 });
  const gap = (o) => o[0].score - o[1].score;
  assert.ok(gap(small) > gap(large));
  assert.equal(DEFAULT_RRF_K, 60);
});

test('empty and absent lists fuse to nothing', () => {
  assert.deepEqual(reciprocalRankFusion({}), []);
  assert.deepEqual(reciprocalRankFusion({ kw: [], sem: [] }), []);
});

test('fails loud on a bad k or a non-array list', () => {
  assert.throws(() => reciprocalRankFusion({ kw: ['A'] }, { k: -1 }), /k must be/);
  assert.throws(() => reciprocalRankFusion({ kw: ['A'] }, { k: NaN }), /k must be/);
  assert.throws(() => reciprocalRankFusion({ kw: 'A' }), /must be an array/);
});
