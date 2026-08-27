// Generic rotating-cursor helper (issue #710).
//
// A capped, scheduled job (e.g. "check at most N urls this run") that always
// starts from the front of its item list never makes progress past index N:
// every run re-does the same front slice and the tail is never reached. This
// helper fixes that shape of bug in one place: given a stable-ordered item
// list and a persisted offset, it returns the next slice AND the offset the
// caller should persist for its next run, wrapping around so repeated calls
// eventually sweep the whole list instead of looping on the same prefix.
//
// Deliberately generic -- no knowledge of URLs, links, or liveness checks --
// so another bounded/capped job can reuse it against its own item list and
// its own persisted cursor value (see issue #712, which asks for this same
// durable-progress mechanism for other scheduled jobs; this module is where
// that reuse should start).

export function advanceCursor(items, cursor, count) {
  const total = items.length;
  if (total === 0 || count <= 0) {
    return { selected: [], nextCursor: 0 };
  }
  // Normalize an out-of-range or negative cursor (e.g. the corpus shrank
  // since the cursor was last saved) into a valid index.
  const start = ((cursor % total) + total) % total;
  const take = Math.min(count, total);
  const selected = new Array(take);
  for (let i = 0; i < take; i++) {
    selected[i] = items[(start + i) % total];
  }
  const nextCursor = (start + take) % total;
  return { selected, nextCursor };
}
