// Wrap a state update in a View Transition for a smooth cross-fade (#281).
//
// document.startViewTransition snapshots the DOM before and after `update`
// runs and cross-fades between them. With React 18 the update must commit
// synchronously inside the callback, or the API takes its "after" snapshot
// before React paints and nothing animates -- so flushSync forces the commit.
// react-dom is pinned to the same 18.2.0 build as react-dom/client in the
// import map, so flushSync drives the same root createRoot mounted.
//
// Browsers without the API (Firefox < 130, older Safari) run `update` directly:
// same state change, no animation. startViewTransition can also throw, so that
// path falls back to a plain update too -- the modal can never get stuck behind
// a failed or unsupported transition.

import { flushSync } from 'react-dom';

export function withViewTransition(update) {
  const reduceMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (
    reduceMotion
    || typeof document === 'undefined'
    || typeof document.startViewTransition !== 'function'
  ) {
    update();
    return;
  }
  try {
    document.startViewTransition(() => flushSync(update));
  } catch {
    update();
  }
}
