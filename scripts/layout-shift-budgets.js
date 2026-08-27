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
//
// What the measurements say, from three full runs on 2026-08-27 (41 route
// states at mobile, tablet, and desktop, 363 measurements, third-party modules
// and fonts served from the local mirror):
//
//   The settled phase measured exactly 0 on every route, in every viewport, in
//   all three runs. That is the phase the strict cap gates, and it is the part
//   the phase split was meant to make deterministic.
//
//   The hydration phase is repeatable for the static pages and for the desktop
//   shell, which reports the same value to four decimals run after run, and it
//   still moves on the routes that hydrate the corpus and fill a record modal.
//   82 of 120 route states landed within 0.05 of the previous run; the widest
//   single move was 0.81, on the desktop entity record. The hydration caps are
//   therefore ceilings that catch a route doubling, not fine-grained limits.
//
// Every route is measured after a warm-up load, so a run scoped to one route
// reports what a full run reports for that route.

// Timing for the measurement window, in milliseconds.
//
// Measuring costs every route state between about 0.9s (a page that goes quiet
// at once) and about 3.5s (a page that shifts through the whole grace window),
// plus the wait for the route's own startup work. At 41 route states and three
// viewports that is roughly two to seven extra minutes on a full audit run.
export const LAYOUT_SHIFT_TIMING = {
  // How often the audit reads the collected entries while waiting for quiet.
  pollMs: 120,
  // No new entry for this long ends the hydration phase.
  quietMs: 400,
  // Upper bound on the wait for quiet, so a permanently shifting route still
  // finishes. Counted from the moment the route's startup work reports done.
  // Reaching this bound is recorded on the measurement.
  maxGraceMs: 3000,
  // Absolute cap on one route's wait, so startup work that never reports done
  // cannot hang the run.
  maxWaitMs: 20000,
  // How long the audit watches for settled-phase shifts after the quiet point.
  // Nothing interacts with the page during this window.
  settledObservationMs: 500,
};

// Float slack so a value that rounds to exactly the budget still passes.
export const BUDGET_TOLERANCE = 0.001;

// Class budgets. `hydration` covers application startup, `settled` covers
// everything after the route first goes quiet.
//
// Each hydration cap sits above the worst value that class reached across the
// seeding runs, with room for the run-to-run movement measured on that class.
// The three outlier routes are moved out to exceptions below, so one route
// cannot loosen the cap for its whole class. The measured worst per class,
// outside those exceptions, was: archive 0.9091 (entity-detail), record 1.1287
// (record-thread), desktop 1.0698 (desktop-record-modal), standalone 0.3659
// (winer-method).
//
// These are ceilings, not targets. A route sitting near its cap is worth
// reducing even while the run passes; what the cap catches is a route that
// doubles.
//
// The settled caps use the Core Web Vitals "good" threshold of 0.1. Every
// route measured 0 there, so the cap has the whole range as headroom and any
// settled shift at all is a regression worth reading.
export const LAYOUT_SHIFT_BUDGETS = {
  archive: {
    hydration: 1.25,
    settled: 0.1,
    note: 'Standard archive routes hydrate a large corpus, then warm details.',
  },
  record: {
    hydration: 1.35,
    settled: 0.1,
    note: 'Record deep links open a modal over a hydrating archive view.',
  },
  desktop: {
    hydration: 1.3,
    settled: 0.1,
    note: 'Optional desktop swaps its lazy shell in over the loading fallback.',
  },
  standalone: {
    hydration: 0.5,
    settled: 0.05,
    note: 'Standalone pages ship static markup and must stay close to zero.',
  },
};

// Measured maxima across mobile, tablet, and desktop from the seeding run
// dated below. Each value is the worst that route reached in that run.
//
// Refresh them by running
// `PREVIEW_AUDIT_MODULE_CACHE=1 PREVIEW_AUDIT_LAYOUT_SHIFT_SEED=1 npm run preview:audit`,
// which measures every route, writes
// preview-audit-results/layout-shift-baseline.json, and does not fail on
// budget. Paste that file here and set the run date. A sharded run writes one
// file per viewport under preview-audit-results/shards; merge them by keeping
// the largest value for each route.
//
// The baseline is not the gate. Budgets gate the run on their own; the
// baseline is the reference the report and the CI delta print next to each
// measured value, so a reader can tell normal movement from a regression.
export const LAYOUT_SHIFT_BASELINE_RUN = '2026-08-27';
export const LAYOUT_SHIFT_BASELINE = {
  'home-archive': { hydration: 0.6605, settled: 0.0 },
  'archive-active-filters': { hydration: 0.3213, settled: 0.0 },
  'archive-folders': { hydration: 0.1956, settled: 0.0 },
  'archive-empty-results': { hydration: 0.1467, settled: 0.0 },
  'start-here': { hydration: 0.0157, settled: 0.0 },
  'participate': { hydration: 0.0393, settled: 0.0 },
  'design-system': { hydration: 0.037, settled: 0.0 },
  'archive-desktop': { hydration: 0.7265, settled: 0.0 },
  'desktop-start-menu': { hydration: 0.7265, settled: 0.0 },
  'desktop-unknown': { hydration: 0.7265, settled: 0.0 },
  'desktop-archive': { hydration: 0.7313, settled: 0.0 },
  'desktop-folders': { hydration: 0.8726, settled: 0.0 },
  'desktop-start': { hydration: 0.736, settled: 0.0 },
  'desktop-findings': { hydration: 0.7326, settled: 0.0 },
  'desktop-entities': { hydration: 0.7168, settled: 0.0 },
  'desktop-entity-detail': { hydration: 0.7708, settled: 0.0 },
  'desktop-entity-record': { hydration: 1.3088, settled: 0.0 },
  'desktop-dissertation': { hydration: 0.7168, settled: 0.0 },
  'desktop-analytics': { hydration: 0.7168, settled: 0.0 },
  'desktop-readme': { hydration: 0.7168, settled: 0.0 },
  'desktop-tools': { hydration: 0.7168, settled: 0.0 },
  'desktop-record-modal': { hydration: 1.0698, settled: 0.0 },
  'desktop-report': { hydration: 0.7265, settled: 0.0 },
  'desktop-windowing': { hydration: 0.9603, settled: 0.0 },
  'entities': { hydration: 0.5813, settled: 0.0 },
  'entity-detail': { hydration: 0.853, settled: 0.0 },
  'entity-record': { hydration: 1.902, settled: 0.0 },
  'about': { hydration: 0.0416, settled: 0.0 },
  'analytics': { hydration: 0.0001, settled: 0.0 },
  'analytics-query-results': { hydration: 0.0002, settled: 0.0 },
  'record-article': { hydration: 0.9187, settled: 0.0 },
  'record-social': { hydration: 0.9588, settled: 0.0 },
  'record-thread': { hydration: 1.1216, settled: 0.0 },
  'record-media': { hydration: 1.0114, settled: 0.0 },
  'record-incomplete': { hydration: 0.8602, settled: 0.0 },
  'record-error': { hydration: 0.6214, settled: 0.0 },
  'dissertation-map-detail': { hydration: 0.0017, settled: 0.0 },
  'dissertation': { hydration: 0.0522, settled: 0.0 },
  'dissertation-reader': { hydration: 0.0, settled: 0.0 },
  'faq': { hydration: 0.5775, settled: 0.0 },
  'winer-method': { hydration: 0.2902, settled: 0.0 },
};

// Narrow, evidence-backed exceptions for a route that cannot meet its class
// cap. Each entry needs a measured reason in `note`, and it must loosen
// something: an exception that matches the class cap is dead weight.
export const ROUTE_LAYOUT_SHIFT_EXCEPTIONS = {
  'entity-record': {
    hydration: 2.3,
    note: 'Entity record deep link: the entity view hydrates, then the record '
      + 'modal fills in over it. Measured 1.4661 to 1.9689 across three runs, '
      + 'worst at 375 wide. Reducing it is tracked separately.',
  },
  'desktop-entity-record': {
    hydration: 2.3,
    note: 'Desktop entity record deep link: the lazy shell swaps in, places '
      + 'its windows, then the record modal fills in. Measured 0.8240 to '
      + '1.8847 across three runs, the widest spread of any route.',
  },
  faq: {
    hydration: 0.7,
    note: 'FAQ: the notebook section reflows when the display font swaps in, '
      + 'and the tablet width is the worst case. Measured 0.0298 to 0.5775 '
      + 'across three runs.',
  },
};

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function round(value) {
  return Number(value.toFixed(4));
}

function sumValues(entries) {
  return round(entries.reduce((total, entry) => total + entry.value, 0));
}

// Which elements moved the most. A route over budget needs a place to look,
// and the element that carries most of the value is that place.
export function rankShiftSources(entries, limit = 3) {
  const totals = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    for (const source of Array.isArray(entry?.sources) ? entry.sources : []) {
      if (!source) continue;
      totals.set(source, (totals.get(source) || 0) + entry.value);
    }
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([selector, value]) => ({ selector, value: round(value) }));
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
  // reduce, not Math.max(...values): a route that shifts continuously can
  // collect more entries than an argument list holds.
  const largestSettledShift = settledEntries.reduce(
    (max, entry) => (entry.value > max ? entry.value : max),
    0,
  );
  return {
    hydration,
    settled,
    total: round(hydration + settled),
    topSources: rankShiftSources(usable),
    hydrationShifts: hydrationEntries.length,
    settledShifts: settledEntries.length,
    hydrationEndsAt: round(hydrationEndsAt),
    reachedGraceLimit: Boolean(options.reachedGraceLimit),
    startupWaitMs: isFiniteNumber(options.startupWaitMs) ? Math.round(options.startupWaitMs) : null,
    largestSettledShift: round(largestSettledShift),
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
        // A route that never went quiet inside the grace window had its phase
        // split truncated. Carry that with the failure, so the line does not
        // read like an ordinary settled-phase regression.
        reachedGraceLimit: Boolean(measurement?.reachedGraceLimit),
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
    + `exceeds budget ${failure.budget} by ${failure.over}`
    + (failure.reachedGraceLimit
      ? ' (route never went quiet inside the grace window, so the phase split is truncated)'
      : '');
}
