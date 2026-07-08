// Pure tour-state persistence for the "take a tour" onboarding (issue #454).
//
// The launch call settled on a hybrid onboarding: a visible-but-skippable "take
// a tour" entry point that never auto-launches as a blocking modal, and that
// does not reappear once a visitor has dismissed or completed it. This module is
// the decision layer for that: it answers "should the entry point show?" and
// records the two terminal outcomes, and nothing else.
//
// It is deliberately pure, in the same spirit as viewState.js: no React, and no
// direct read of `window.localStorage`. The caller injects a Web Storage object
// (or null), so the whole thing is unit-testable under `node --test` with no DOM
// and no browser globals. That injection is also what makes the graceful-
// degradation contract real rather than asserted: a storage that throws, or no
// storage at all (server render, private mode, disabled cookies), degrades to
// "always skippable" and never traps the visitor, because the module simply
// treats an unreachable store as "not seen yet" and reports that it could not
// persist.
//
// Two failure modes are handled differently on purpose. A storage that throws is
// the environment, so it degrades softly. An invalid outcome passed by a caller
// is a programming bug, so it fails loud.
//
// Scope: this decision core only. The React entry-point component, the tour
// steps, and the content-led path into Jay's example content are the build and
// are intentionally not here.

// The persisted key carries its format version. Bumping the version is how a
// future format change invalidates old values cleanly, instead of a tolerant
// reader trying to migrate whatever it finds. Namespaced so it cannot collide
// with the archive's other client state.
export const TOUR_STORAGE_KEY = 'rosen:tour:v1';

// The two terminal outcomes. Both mean "do not show the entry point again";
// keeping them distinct lets the shell tell a finished tour from a skipped one
// (useful for analytics and for a future "restart the tour" affordance).
export const TOUR_OUTCOMES = Object.freeze({
  dismissed: 'dismissed',
  completed: 'completed',
});

const OUTCOME_VALUES = Object.freeze(Object.values(TOUR_OUTCOMES));

/** True when `value` is one of the recognised terminal outcomes. */
export function isTourOutcome(value) {
  return OUTCOME_VALUES.includes(value);
}

/**
 * Read the visitor's tour state from an injected Web Storage object.
 *
 * `storage` is anything with a `getItem(key)` method (a real `localStorage`, or
 * null/undefined when there is no store — server render, blocked storage). Any
 * throw from `getItem`, and any unrecognised stored value, resolves to the safe
 * default: not seen, so the (skippable) entry point shows and the visitor is
 * never trapped by a store we cannot read.
 *
 * Returns `{ seen, outcome, storageAvailable }`:
 * - `seen` — has the visitor dismissed or completed the tour before?
 * - `outcome` — which terminal outcome, or null if not seen.
 * - `storageAvailable` — could we actually read the store? False lets the shell
 *   hold its own in-session "dismissed" flag when persistence is impossible.
 */
export function readTourState(storage) {
  const unseen = { seen: false, outcome: null, storageAvailable: false };
  if (!storage || typeof storage.getItem !== 'function') {
    return unseen;
  }

  let raw;
  try {
    raw = storage.getItem(TOUR_STORAGE_KEY);
  } catch {
    // Blocked storage (private mode, disabled cookies) can throw on access.
    // Degrade to "always skippable" rather than surfacing the error.
    return unseen;
  }

  if (raw === null || raw === undefined) {
    return { seen: false, outcome: null, storageAvailable: true };
  }
  // A value we do not recognise (a stale format, a manual edit, another origin's
  // key) is validated away at this boundary, so the rest of the module only ever
  // sees a known outcome. An unknown value counts as "not seen" so it can never
  // permanently hide the entry point.
  if (!isTourOutcome(raw)) {
    return { seen: false, outcome: null, storageAvailable: true };
  }
  return { seen: true, outcome: raw, storageAvailable: true };
}

/** Should the "take a tour" entry point be shown? Show it to a visitor who has
 *  not already dismissed or completed the tour. */
export function shouldShowTourEntry(state) {
  return !(state && state.seen === true);
}

/**
 * Record a terminal outcome (`dismissed` or `completed`) to the injected store.
 *
 * Storage failures degrade softly: if the store is missing or `setItem` throws
 * (quota, private mode), this returns `{ persisted: false }` without throwing,
 * so closing the tour can never trap the visitor behind an error. An outcome
 * that is not a recognised value is a caller bug, not an environment problem, so
 * it throws a TypeError instead of silently writing garbage.
 *
 * Returns `{ persisted, outcome }`.
 */
export function recordTourOutcome(storage, outcome) {
  if (!isTourOutcome(outcome)) {
    throw new TypeError(
      `recordTourOutcome: outcome must be one of ${OUTCOME_VALUES.join(', ')}, got ${JSON.stringify(outcome)}`,
    );
  }
  if (!storage || typeof storage.setItem !== 'function') {
    return { persisted: false, outcome };
  }
  try {
    storage.setItem(TOUR_STORAGE_KEY, outcome);
    return { persisted: true, outcome };
  } catch {
    return { persisted: false, outcome };
  }
}

/**
 * Clear the stored tour state, so the entry point shows again. Backs a
 * "restart the tour" affordance and test setup. Storage failures degrade
 * softly, matching `recordTourOutcome`. Returns `{ cleared }`.
 */
export function clearTourState(storage) {
  if (!storage || typeof storage.removeItem !== 'function') {
    return { cleared: false };
  }
  try {
    storage.removeItem(TOUR_STORAGE_KEY);
    return { cleared: true };
  } catch {
    return { cleared: false };
  }
}
