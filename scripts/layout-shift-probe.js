// Browser-facing half of the route-level layout-shift measurement.
//
// scripts/layout-shift-budgets.js holds the budgets and the arithmetic. This
// module holds the parts that touch a page: installing the Layout Instability
// observer, making sure each route measures its own document, and finding the
// point where a route first goes quiet.
//
// The quiet loop is written against a small adapter (`readEntries`, `sleep`,
// `now`) instead of a Playwright page, so its behaviour is testable without a
// browser. scripts/preview-audit.js passes the Playwright-backed adapter.

import { LAYOUT_SHIFT_TIMING, summarizeLayoutShifts } from './layout-shift-budgets.js';

// Runs before any document script, on every document the context loads.
// `buffered: true` still hands over entries the browser recorded before the
// observer attached.
function collectLayoutShifts() {
  window.__previewLayoutShifts = [];
  // Name the element that moved, so a route over budget says what to fix
  // instead of only how much it moved.
  const describe = (node) => {
    if (!node || node.nodeType !== 1) return '';
    if (node.id) return `#${node.id}`;
    const className = typeof node.className === 'string' ? node.className.trim() : '';
    const first = className ? `.${className.split(/\s+/)[0]}` : '';
    return `${node.tagName.toLowerCase()}${first}`;
  };
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        let sources = [];
        try {
          sources = (entry.sources || []).slice(0, 2).map((source) => describe(source.node))
            .filter(Boolean);
        } catch {
          // Source attribution is best effort; the value still counts.
        }
        window.__previewLayoutShifts.push({
          value: entry.value,
          startTime: entry.startTime,
          hadRecentInput: entry.hadRecentInput,
          sources,
        });
      }
    });
    observer.observe({ type: 'layout-shift', buffered: true });
  } catch {
    // A browser without the Layout Instability API reports no shifts.
  }
}

export function installLayoutShiftObserver(context) {
  return context.addInitScript(collectLayoutShifts);
}

// An init script runs on a document navigation, never on a fragment one. Two
// routes that differ only by hash therefore share one document: the app does
// not remount and the observer keeps the first route's entries, so the second
// route reports the first route's shifts on top of its own. The audit loads a
// tiny same-origin document in between to force a real navigation.
//
// The same check answers a second question: whether the page is on a
// same-origin document at all. localStorage is unreachable from about:blank,
// which is where every fresh page starts, so the seeding step needs the
// in-between document too.
export function requiresFreshDocument(currentUrl, targetUrl, base) {
  const current = String(currentUrl || '');
  if (!current.startsWith(base)) return true;
  let from;
  let to;
  try {
    from = new URL(current);
    to = new URL(String(targetUrl));
  } catch {
    return true;
  }
  return from.origin === to.origin
    && from.pathname === to.pathname
    && from.search === to.search;
}

function readMaxStartTime(entries) {
  // reduce, not Math.max(...entries): a route that shifts through the whole
  // grace window can collect more entries than an argument list holds.
  return entries.reduce(
    (max, entry) => (Number.isFinite(entry?.startTime) && entry.startTime > max ? entry.startTime : max),
    0,
  );
}

// Find the point where a route first goes quiet.
//
// Quiet is only allowed to start once the route's known startup work has
// finished (`startupSettled`). Without that gate the boundary moves with
// machine speed: the archive warms its details file one second after the core
// corpus commits, so a fast machine finishes that work inside the hydration
// phase while a slow machine has already gone quiet and books the same
// re-render as settled instability. Same code, same route, opposite verdicts.
export async function detectQuietPoint(adapter, timing = LAYOUT_SHIFT_TIMING) {
  const now = adapter.now || (() => Date.now());
  const startedAt = now();
  let startupSettled = adapter.startupSettled === undefined || adapter.startupSettled === null;
  if (!startupSettled) {
    Promise.resolve(adapter.startupSettled).then(
      () => { startupSettled = true; },
      () => { startupSettled = true; },
    );
  }

  let entries = [];
  let seen = -1;
  let quietSince = startedAt;
  let graceStartedAt = null;
  let reachedGraceLimit = false;

  for (;;) {
    entries = await adapter.readEntries();
    const at = now();
    if (entries.length !== seen) {
      seen = entries.length;
      quietSince = at;
    }
    if (startupSettled && graceStartedAt === null) {
      // Startup just finished. Its last render can still be a frame away, so
      // the quiet window starts here rather than counting the wait itself.
      graceStartedAt = at;
      quietSince = at;
    }
    if (graceStartedAt !== null) {
      if (at - quietSince >= timing.quietMs) break;
      if (at - graceStartedAt >= timing.maxGraceMs) {
        reachedGraceLimit = true;
        break;
      }
    }
    if (at - startedAt >= timing.maxWaitMs) {
      // Startup never reported finished. Measure what there is and say so.
      reachedGraceLimit = true;
      break;
    }
    await adapter.sleep(timing.pollMs);
  }

  return {
    entries,
    hydrationEndsAt: readMaxStartTime(entries),
    reachedGraceLimit,
    startupWaitMs: graceStartedAt === null ? null : graceStartedAt - startedAt,
  };
}

// Wait for the route to stop shifting, mark that quiet point, then watch a
// short idle window for anything that shifts afterwards. Nothing touches the
// page during the idle window, so what it records is instability the visitor
// would see on a page that already looked finished.
export async function measureLayoutShift(page, options = {}) {
  const adapter = {
    readEntries: () => page.evaluate(
      () => (window.__previewLayoutShifts || []).map((entry) => ({ ...entry })),
    ),
    sleep: (ms) => page.waitForTimeout(ms),
    startupSettled: options.startupSettled || null,
  };
  const quiet = await detectQuietPoint(adapter, options.timing || LAYOUT_SHIFT_TIMING);
  await adapter.sleep((options.timing || LAYOUT_SHIFT_TIMING).settledObservationMs);
  const settledEntries = await adapter.readEntries();
  return summarizeLayoutShifts(settledEntries, quiet);
}
