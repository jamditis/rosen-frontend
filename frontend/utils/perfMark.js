// Performance marks for the debug-flagged data-load timing (#280).
//
// No-ops unless `localStorage.jrda_debug === '1'` (the #170 debug toggle), so
// nothing here runs in production. Every call is wrapped in try/catch: the
// Performance API and localStorage can throw in privacy modes or under a
// storage policy, and a throw here must never break the data-load path these
// marks wrap (fetchCoreData's fail-loud contract, #290).

const enabled = (() => {
  try {
    return typeof localStorage !== 'undefined'
      && localStorage.getItem('jrda_debug') === '1'
      && typeof performance !== 'undefined'
      && typeof performance.mark === 'function';
  } catch {
    return false;
  }
})();

export const perfMark = (name) => {
  if (!enabled) return;
  try {
    performance.mark(name);
  } catch {
    // Performance API unavailable or name invalid -- timing is best-effort.
  }
};

export const perfMeasure = (name, startMark, endMark) => {
  if (!enabled) return;
  try {
    performance.measure(name, startMark, endMark);
  } catch {
    // A missing start/end mark throws; skip rather than break the caller.
  }
};
