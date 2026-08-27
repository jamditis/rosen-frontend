// Route-level layout-shift budgets for the preview audit.
//
// The preview audit records every Layout Instability entry a route produces.
// A single raw CLS number is not a usable release gate here, because archive
// hydration, the delayed details warmup, and desktop window placement all
// finish asynchronously. The same route can therefore report a very different
// total from one run to the next.
//
// This module splits each route into two phases and budgets them separately:
//
//   hydration - shifts up to the moment the route first goes quiet. This is
//               expected application startup. The budget is generous and is
//               seeded from a measured baseline.
//   settled   - shifts after that quiet point, with no user input in between.
//               This is unexpected instability that a visitor sees on a page
//               that already looked finished. The budget is near zero.
//
// The phase boundary is the route's own quiet point, not a wall-clock
// deadline, so a slow machine moves the boundary instead of leaking startup
// shifts into the settled phase. That is what makes repeated runs comparable.
//
// Budgets are per route class. A route whose measured baseline does not fit
// its class cap gets a narrow, documented exception in
// ROUTE_LAYOUT_SHIFT_EXCEPTIONS instead of loosening the cap for every route.

// Repeatability check, 2026-08-27: the standalone routes were measured twice
// per viewport with this timing. Every route returned the same value on both
// passes, including the one route that shifts (winer-method at 1440 wide,
// 0.1457 both times). That run could not reach the CDN the app imports React
// from, so it exercised the standalone pages only.

// Timing for the measurement window, in milliseconds.
export const LAYOUT_SHIFT_TIMING = {
  // How often the audit reads the collected entries while waiting for quiet.
  pollMs: 120,
  // No new entry for this long ends the hydration phase.
  quietMs: 400,
  // Upper bound on the wait for quiet, so a permanently shifting route still
  // finishes. Reaching this bound is recorded on the measurement.
  maxGraceMs: 3000,
  // How long the audit watches for settled-phase shifts after the quiet point.
  // Nothing interacts with the page during this window.
  settledObservationMs: 500,
};

// Float slack so a value that rounds to exactly the budget still passes.
export const BUDGET_TOLERANCE = 0.001;

// Class budgets. `hydration` covers application startup, `settled` covers
// everything after the route first goes quiet.
//
// The hydration caps start from the evidence in the #662 release-acceptance
// pass, which recorded initial-load CLS on SPA and desktop routes ranging from
// 0 to about 1.55 in a single run. The caps sit above that recorded maximum so
// the gate catches a real regression instead of firing on normal startup, and
// they are meant to be tightened once a seeding run on the release machine
// fills LAYOUT_SHIFT_BASELINE below.
//
// The settled caps use the Core Web Vitals "good" threshold of 0.1. A page
// that already looked finished should not move at all, so anything close to
// that cap is worth investigating even when the run passes.
export const LAYOUT_SHIFT_BUDGETS = {
  archive: {
    hydration: 1.8,
    settled: 0.1,
    note: 'Standard archive routes hydrate a large corpus, then warm details.',
  },
  record: {
    hydration: 1.8,
    settled: 0.1,
    note: 'Record deep links open a modal over a hydrating archive view.',
  },
  desktop: {
    hydration: 1.8,
    settled: 0.1,
    note: 'Optional desktop places windows after the shell mounts.',
  },
  standalone: {
    hydration: 0.25,
    settled: 0.05,
    note: 'Standalone pages ship static markup and must stay close to zero.',
  },
};

// Measured maxima across mobile, tablet, and desktop from a seeding run.
//
// The map is empty until someone runs the audit on a machine that can reach
// the CDN the app imports React from. Fill it by running
// `PREVIEW_AUDIT_LAYOUT_SHIFT_SEED=1 npm run preview:audit`, which measures
// every route, writes preview-audit-results/layout-shift-baseline.json, and
// does not fail on budget. Paste that file here, set the run date, and tighten
// any class cap the measured values leave far behind. A sharded run writes one
// file per viewport under preview-audit-results/shards; merge them by keeping
// the largest value for each route.
//
// Budgets already gate the run while the map is empty. The baseline only adds
// the measured reference the report prints next to each value.
export const LAYOUT_SHIFT_BASELINE_RUN = '2026-08-01';
export const LAYOUT_SHIFT_BASELINE = {};

// Narrow, evidence-backed exceptions for a route that cannot meet its class
// cap. Each entry needs a measured reason in `note`, and it must loosen
// something: an exception that matches the class cap is dead weight.
export const ROUTE_LAYOUT_SHIFT_EXCEPTIONS = {};

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function round(value) {
  return Number(value.toFixed(4));
}

function sumValues(entries) {
  return round(entries.reduce((total, entry) => total + entry.value, 0));
}

// Route class decides which budget applies. Desktop wins over record, because
// window placement dominates the startup shift on a desktop record deep link.
export function classifyRoute(route) {
  const slug = String(route?.slug || '');
  const url = String(route?.url || '/');
  if (slug === 'archive-desktop' || slug.startsWith('desktop-') || url.includes('#desktop')) {
    return 'desktop';
  }
  if (url.includes('record=')) return 'record';
  const path = url.split('#')[0].split('?')[0];
  if (path && path !== '/') return 'standalone';
  return 'archive';
}

export function resolveLayoutShiftBudget(route) {
  const routeClass = classifyRoute(route);
  const classBudget = LAYOUT_SHIFT_BUDGETS[routeClass];
  const exception = ROUTE_LAYOUT_SHIFT_EXCEPTIONS[route?.slug];
  const baseline = LAYOUT_SHIFT_BASELINE[route?.slug] || null;
  return {
    routeClass,
    baseline,
    hydration: isFiniteNumber(exception?.hydration) ? exception.hydration : classBudget.hydration,
    settled: isFiniteNumber(exception?.settled) ? exception.settled : classBudget.settled,
    isException: Boolean(exception),
    note: exception?.note || classBudget.note,
  };
}

// Turn raw Layout Instability entries into the two budgeted phase totals.
// Entries that follow user input are dropped, the same way the standard CLS
// metric drops them: the audit drives the keyboard and the mouse, and those
// shifts are not what a visitor sees on an idle page.
export function summarizeLayoutShifts(entries, options = {}) {
  const hydrationEndsAt = isFiniteNumber(options.hydrationEndsAt) ? options.hydrationEndsAt : 0;
  const usable = (Array.isArray(entries) ? entries : []).filter((entry) => (
    entry
    && !entry.hadRecentInput
    && isFiniteNumber(entry.value)
    && entry.value > 0
    && isFiniteNumber(entry.startTime)
  ));
  const hydrationEntries = usable.filter((entry) => entry.startTime <= hydrationEndsAt);
  const settledEntries = usable.filter((entry) => entry.startTime > hydrationEndsAt);
  const hydration = sumValues(hydrationEntries);
  const settled = sumValues(settledEntries);
  return {
    hydration,
    settled,
    total: round(hydration + settled),
    hydrationShifts: hydrationEntries.length,
    settledShifts: settledEntries.length,
    hydrationEndsAt: round(hydrationEndsAt),
    reachedGraceLimit: Boolean(options.reachedGraceLimit),
    largestSettledShift: settledEntries.length
      ? round(Math.max(...settledEntries.map((entry) => entry.value)))
      : 0,
  };
}

export function evaluateLayoutShiftBudget(route, measurement) {
  const budget = resolveLayoutShiftBudget(route);
  const failures = [];
  for (const phase of ['hydration', 'settled']) {
    const measured = isFiniteNumber(measurement?.[phase]) ? measurement[phase] : 0;
    const allowed = budget[phase];
    if (measured > allowed + BUDGET_TOLERANCE) {
      failures.push({
        phase,
        measured,
        budget: allowed,
        over: round(measured - allowed),
      });
    }
  }
  return {
    routeClass: budget.routeClass,
    budget: { hydration: budget.hydration, settled: budget.settled },
    baseline: budget.baseline,
    isException: budget.isException,
    note: budget.note,
    measured: measurement || null,
    failures,
    withinBudget: failures.length === 0,
  };
}

// Flatten the per-row evaluations into one list the audit can print and gate
// on. Rows without a measurement (an errored route) are skipped: the route
// error already fails the run.
export function collectLayoutShiftFailures(rows) {
  const failures = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const evaluation = row?.layoutShift;
    if (!evaluation || !Array.isArray(evaluation.failures)) continue;
    for (const failure of evaluation.failures) {
      failures.push({
        route: row.route,
        viewport: row.viewport,
        routeClass: evaluation.routeClass,
        ...failure,
      });
    }
  }
  return failures;
}

export function formatLayoutShiftFailure(failure) {
  return `${failure.viewport} ${failure.route}: ${failure.phase} CLS ${failure.measured} `
    + `exceeds budget ${failure.budget} by ${failure.over}`;
}
