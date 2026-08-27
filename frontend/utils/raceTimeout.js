/**
 * Race a promise against a timeout.
 *
 * One settle-once timer guards two contracts, selected by `rejectOnTimeout`:
 *
 *   resolve-mode (default): resolve to the promise's value, or to `fallback`
 *     if it rejects or does not settle within `ms`. Never rejects. Bounds a
 *     check that must not stall work a fallback can already satisfy
 *     (archiveService's version check).
 *
 *   reject-mode (`rejectOnTimeout: true`): resolve to the promise's value;
 *     reject with the promise's own error if it rejects, or with a timeout
 *     Error if it does not settle within `ms`. Surfaces a stall as a failure
 *     the caller can fall back from (idbCache's idb-keyval import race).
 *
 * The timer is intentionally left ref'd: an unref'd timer that is the only
 * pending work never fires (the event loop idles past it), so a hung promise
 * would never time out. It is cleared as soon as either side settles.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {{ fallback?: T, rejectOnTimeout?: boolean }} [options]
 * @returns {Promise<T>}
 */
export const raceTimeout = (promise, ms, { fallback, rejectOnTimeout = false } = {}) =>
  new Promise((resolve, reject) => {
    let settled = false;
    const finishResolve = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const finishReject = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    };
    const timer = setTimeout(() => {
      if (rejectOnTimeout) finishReject(new Error(`timed out after ${ms}ms`));
      else finishResolve(fallback);
    }, ms);
    promise.then(
      finishResolve,
      (err) => (rejectOnTimeout ? finishReject(err) : finishResolve(fallback)),
    );
  });
