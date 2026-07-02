// Submit lifecycle gate for the branded report modal (#509).
//
// The modal has two concurrency rules that fought each other as ad-hoc refs:
//   1. Block a second submit fired synchronously (a double-click or Enter-repeat)
//      before React re-renders the disabled button, so one action never files
//      two issues.
//   2. Still allow a fresh submit after the modal is closed and reopened while an
//      earlier request is in flight, and drop that earlier request's result so it
//      cannot write into the reopened session.
// Rule 1 alone blocks rule 2; naively clearing the guard on reopen lets an older
// overlapping request's completion clear a newer submit's guard, which resurrects
// the duplicate-file bug. Encoding the rules as a tiny pure state object with an
// ownership check makes both correct by construction and unit-testable with no DOM.
//
// One gate per mounted modal (held in a ref). Seqs are opaque positive integers.
export const createSubmitGate = () => {
  let inFlightSeq = 0; // 0 = idle; otherwise the seq of the submit in flight
  let lastSeq = 0;     // monotonic id of the newest submit-or-reset

  return {
    // Call on modal open. Disowns any still-pending submit (its result will be
    // dropped and its cleanup will not touch the guard) so a fresh submit is
    // allowed even while the old request is still settling.
    reset() {
      inFlightSeq = 0;
      lastSeq += 1;
    },

    // Try to start a submit. Returns a positive seq if allowed, or 0 if a submit
    // is already in flight (the synchronous double-submit block).
    begin() {
      if (inFlightSeq !== 0) return 0;
      lastSeq += 1;
      inFlightSeq = lastSeq;
      return inFlightSeq;
    },

    // Whether `seq` is still the newest submit. False once the modal has been
    // reopened or a newer submit began, so a slow completion drops its result.
    isCurrent(seq) {
      return seq !== 0 && seq === lastSeq;
    },

    // Call in the submit's finally. Clears the in-flight guard only if `seq` still
    // owns it, so an older overlapping request cannot release a newer submit.
    end(seq) {
      if (inFlightSeq === seq) inFlightSeq = 0;
    },
  };
};
