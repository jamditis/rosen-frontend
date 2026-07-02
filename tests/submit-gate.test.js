// Tests for the report modal's submit lifecycle gate (#509). Pure logic, no DOM:
// the concurrency rules that produced two review findings as ad-hoc refs are
// pinned here so they cannot silently regress.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubmitGate } from '../frontend/utils/submitGate.js';

test('blocks a synchronous second submit while the first is in flight', () => {
  const g = createSubmitGate();
  g.reset(); // modal open
  const a = g.begin();
  assert.ok(a > 0, 'first submit is allowed');
  assert.strictEqual(g.begin(), 0, 'a second submit is blocked while one is in flight');
  g.end(a);
  assert.ok(g.begin() > 0, 'a new submit is allowed once the first ends');
});

test('allows a fresh submit after reopen even while the old request is in flight', () => {
  const g = createSubmitGate();
  g.reset();
  const a = g.begin();      // submit A, still in flight
  g.reset();                // close + reopen before A settles
  const b = g.begin();
  assert.ok(b > 0, 'the reopened modal can submit again');
  assert.notStrictEqual(a, b);
});

test('a stale in-flight result is dropped after reopen', () => {
  const g = createSubmitGate();
  g.reset();
  const a = g.begin();
  assert.strictEqual(g.isCurrent(a), true, 'A is current while it is the newest');
  g.reset();                // reopen supersedes A
  assert.strictEqual(g.isCurrent(a), false, 'A is no longer current after reopen');
  const b = g.begin();
  assert.strictEqual(g.isCurrent(b), true);
});

test('an older overlapping request cannot release a newer submit guard', () => {
  const g = createSubmitGate();
  g.reset();
  const a = g.begin();      // A in flight
  g.reset();                // reopen
  const b = g.begin();      // B in flight
  g.end(a);                 // A settles late: must NOT clear B's guard
  assert.strictEqual(g.begin(), 0, 'B is still guarded against a duplicate submit');
  g.end(b);                 // B settles: now idle
  assert.ok(g.begin() > 0);
});

test('end is a no-op for a seq that never owned the guard', () => {
  const g = createSubmitGate();
  g.reset();
  const a = g.begin();
  g.end(999);               // some seq that never ran
  assert.strictEqual(g.begin(), 0, 'A still holds the guard');
  g.end(a);
  assert.ok(g.begin() > 0);
});

test('isCurrent is false for an idle/never-started seq', () => {
  const g = createSubmitGate();
  g.reset();
  assert.strictEqual(g.isCurrent(0), false);
  assert.strictEqual(g.isCurrent(42), false);
});
