import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUDGET_TOLERANCE,
  LAYOUT_SHIFT_BASELINE,
  LAYOUT_SHIFT_BASELINE_RUN,
  LAYOUT_SHIFT_BUDGETS,
  LAYOUT_SHIFT_TIMING,
  ROUTE_LAYOUT_SHIFT_EXCEPTIONS,
  classifyRoute,
  collectLayoutShiftFailures,
  evaluateLayoutShiftBudget,
  formatLayoutShiftFailure,
  resolveLayoutShiftBudget,
  summarizeLayoutShifts,
} from '../scripts/layout-shift-budgets.js';

// Resolve from this file, not from the working directory: the suite has to
// run the same way from a subdirectory as from the repo root.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const auditSource = readFileSync(resolve(REPO_ROOT, 'scripts', 'preview-audit.js'), 'utf8');
const probeSource = readFileSync(resolve(REPO_ROOT, 'scripts', 'layout-shift-probe.js'), 'utf8');
const routeSlugs = [...auditSource.matchAll(/slug: '([^']+)'/g)].map((match) => match[1]);

describe('layout-shift route classes', () => {
  it('classifies the four budgeted route families', () => {
    assert.equal(classifyRoute({ slug: 'home-archive', url: '/' }), 'archive');
    assert.equal(classifyRoute({ slug: 'archive-folders', url: '/#folders' }), 'archive');
    assert.equal(classifyRoute({ slug: 'record-article', url: '/?record=RECORD-00802' }), 'record');
    assert.equal(classifyRoute({ slug: 'archive-desktop', url: '/#desktop' }), 'desktop');
    assert.equal(classifyRoute({ slug: 'desktop-tools', url: '/#desktop/tools' }), 'desktop');
    assert.equal(classifyRoute({ slug: 'faq', url: '/faq/' }), 'standalone');
    assert.equal(
      classifyRoute({ slug: 'design-system', url: '/frontend/design-system/demo.html' }),
      'standalone',
    );
  });

  it('treats a desktop record deep link as a desktop route', () => {
    // Window placement, not the modal, dominates startup shift here.
    assert.equal(
      classifyRoute({ slug: 'desktop-record-modal', url: '/?record=RECORD-00802#desktop/archive' }),
      'desktop',
    );
  });

  it('gives every audited route a resolvable budget', () => {
    assert.ok(routeSlugs.length >= 40, `expected the full route set, found ${routeSlugs.length}`);
    for (const routeClass of Object.keys(LAYOUT_SHIFT_BUDGETS)) {
      const budget = LAYOUT_SHIFT_BUDGETS[routeClass];
      assert.ok(budget.hydration > 0, `${routeClass} needs a hydration budget`);
      assert.ok(budget.settled >= 0, `${routeClass} needs a settled budget`);
      assert.ok(budget.note.length > 0, `${routeClass} needs a note`);
    }
  });
});

describe('layout-shift summaries', () => {
  const entries = [
    { value: 0.4, startTime: 300, hadRecentInput: false },
    { value: 0.2, startTime: 900, hadRecentInput: false },
    { value: 0.9, startTime: 1200, hadRecentInput: true },
    { value: 0.05, startTime: 1800, hadRecentInput: false },
    { value: 0.01, startTime: 2100, hadRecentInput: false },
  ];

  it('splits shifts at the quiet point', () => {
    const summary = summarizeLayoutShifts(entries, { hydrationEndsAt: 900 });
    assert.equal(summary.hydration, 0.6);
    assert.equal(summary.settled, 0.06);
    assert.equal(summary.total, 0.66);
    assert.equal(summary.hydrationShifts, 2);
    assert.equal(summary.settledShifts, 2);
    assert.equal(summary.largestSettledShift, 0.05);
  });

  it('drops shifts that followed user input', () => {
    const summary = summarizeLayoutShifts(entries, { hydrationEndsAt: 5000 });
    assert.equal(summary.hydration, 0.66);
    assert.equal(summary.settled, 0);
  });

  it('handles a route that never shifted', () => {
    const summary = summarizeLayoutShifts([], { hydrationEndsAt: 0 });
    assert.deepEqual(
      { hydration: summary.hydration, settled: summary.settled, total: summary.total },
      { hydration: 0, settled: 0, total: 0 },
    );
    assert.equal(summary.reachedGraceLimit, false);
  });

  it('records that the wait for quiet hit its limit', () => {
    const summary = summarizeLayoutShifts([], { hydrationEndsAt: 0, reachedGraceLimit: true });
    assert.equal(summary.reachedGraceLimit, true);
  });

  it('names the elements that moved the most', () => {
    const summary = summarizeLayoutShifts([
      { value: 0.2, startTime: 100, hadRecentInput: false, sources: ['#main-content'] },
      { value: 0.5, startTime: 200, hadRecentInput: false, sources: ['.archive-card', '#main-content'] },
      { value: 0.05, startTime: 300, hadRecentInput: false, sources: [] },
    ], { hydrationEndsAt: 500 });
    assert.deepEqual(summary.topSources, [
      { selector: '#main-content', value: 0.7 },
      { selector: '.archive-card', value: 0.5 },
    ]);
  });

  it('reports no sources when the browser gave none', () => {
    const summary = summarizeLayoutShifts(
      [{ value: 0.2, startTime: 100, hadRecentInput: false }],
      { hydrationEndsAt: 500 },
    );
    assert.deepEqual(summary.topSources, []);
  });

  it('ignores malformed entries instead of producing NaN', () => {
    const summary = summarizeLayoutShifts(
      [null, { value: Number.NaN, startTime: 10 }, { value: 0.1, startTime: Number.NaN }],
      { hydrationEndsAt: 100 },
    );
    assert.equal(summary.total, 0);
  });
});

describe('layout-shift budget evaluation', () => {
  // A standalone route with no exception of its own, so these cases read the
  // class budget.
  const standalone = { slug: 'dissertation', url: '/dissertation/' };

  it('passes a route inside its budget', () => {
    const evaluation = evaluateLayoutShiftBudget(standalone, { hydration: 0.01, settled: 0 });
    assert.equal(evaluation.withinBudget, true);
    assert.deepEqual(evaluation.failures, []);
    assert.equal(evaluation.routeClass, 'standalone');
  });

  it('fails a settled-phase regression', () => {
    const evaluation = evaluateLayoutShiftBudget(standalone, { hydration: 0.01, settled: 0.3 });
    assert.equal(evaluation.withinBudget, false);
    assert.equal(evaluation.failures.length, 1);
    assert.equal(evaluation.failures[0].phase, 'settled');
    assert.equal(evaluation.failures[0].budget, LAYOUT_SHIFT_BUDGETS.standalone.settled);
    assert.ok(evaluation.failures[0].over > 0);
  });

  it('fails a hydration-phase regression', () => {
    const evaluation = evaluateLayoutShiftBudget(standalone, { hydration: 1.5, settled: 0 });
    assert.equal(evaluation.failures.length, 1);
    assert.equal(evaluation.failures[0].phase, 'hydration');
  });

  it('reports both phases when both regress', () => {
    const evaluation = evaluateLayoutShiftBudget(standalone, { hydration: 1.5, settled: 0.9 });
    assert.deepEqual(evaluation.failures.map((f) => f.phase), ['hydration', 'settled']);
  });

  it('allows a value exactly on budget', () => {
    const budget = LAYOUT_SHIFT_BUDGETS.standalone;
    const evaluation = evaluateLayoutShiftBudget(standalone, {
      hydration: budget.hydration,
      settled: budget.settled,
    });
    assert.equal(evaluation.withinBudget, true);
  });

  it('keeps the tolerance narrow enough to catch a real regression', () => {
    assert.ok(BUDGET_TOLERANCE > 0 && BUDGET_TOLERANCE <= 0.005);
  });

  it('treats a missing measurement as zero rather than throwing', () => {
    const evaluation = evaluateLayoutShiftBudget(standalone, null);
    assert.equal(evaluation.withinBudget, true);
    assert.equal(evaluation.measured, null);
  });

  it('carries the seeded baseline into the evaluation', () => {
    const evaluation = evaluateLayoutShiftBudget(standalone, { hydration: 0, settled: 0 });
    assert.deepEqual(evaluation.baseline, LAYOUT_SHIFT_BASELINE[standalone.slug] || null);
  });
});

describe('layout-shift baseline and exceptions', () => {
  it('names the run the baseline came from', () => {
    assert.match(LAYOUT_SHIFT_BASELINE_RUN, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('gates the run whether or not the baseline is seeded', () => {
    // The baseline is a measured reference for the report. Budgets do the
    // gating on their own, so an empty baseline must not weaken the check.
    const evaluation = evaluateLayoutShiftBudget(
      { slug: 'dissertation', url: '/dissertation/' },
      { hydration: 9, settled: 9 },
    );
    assert.equal(evaluation.withinBudget, false);
  });

  it('keeps baseline entries tied to real routes', () => {
    for (const slug of Object.keys(LAYOUT_SHIFT_BASELINE)) {
      assert.ok(routeSlugs.includes(slug), `baseline references unknown route ${slug}`);
      const entry = LAYOUT_SHIFT_BASELINE[slug];
      assert.equal(typeof entry.hydration, 'number');
      assert.equal(typeof entry.settled, 'number');
    }
  });

  it('documents every exception and ties it to a real route', () => {
    for (const slug of Object.keys(ROUTE_LAYOUT_SHIFT_EXCEPTIONS)) {
      const exception = ROUTE_LAYOUT_SHIFT_EXCEPTIONS[slug];
      assert.ok(routeSlugs.includes(slug), `exception references unknown route ${slug}`);
      assert.ok(exception.note && exception.note.length > 10, `${slug} exception needs a reason`);
      const routeClass = classifyRoute({
        slug,
        url: auditSource.match(new RegExp(`slug: '${slug}',\\s*\\n?\\s*url: '([^']+)'`))?.[1] || '/',
      });
      const classBudget = LAYOUT_SHIFT_BUDGETS[routeClass];
      const loosens = (exception.hydration ?? 0) > classBudget.hydration
        || (exception.settled ?? 0) > classBudget.settled;
      assert.ok(loosens, `${slug} exception does not loosen anything and should be removed`);
    }
  });

  it('holds every seeded baseline inside its budget', () => {
    const over = [];
    for (const slug of Object.keys(LAYOUT_SHIFT_BASELINE)) {
      const url = auditSource.match(new RegExp(`slug: '${slug}',\\s*\\n?\\s*url: '([^']+)'`))?.[1] || '/';
      const budget = resolveLayoutShiftBudget({ slug, url });
      const baseline = LAYOUT_SHIFT_BASELINE[slug];
      if (baseline.hydration > budget.hydration + BUDGET_TOLERANCE) over.push(`${slug} hydration`);
      if (baseline.settled > budget.settled + BUDGET_TOLERANCE) over.push(`${slug} settled`);
    }
    assert.deepEqual(over, [], `baselines above budget without an exception: ${over.join(', ')}`);
  });
});

describe('layout-shift failure collection', () => {
  const rows = [
    {
      route: 'home-archive',
      viewport: 'mobile',
      layoutShift: {
        routeClass: 'archive',
        failures: [{ phase: 'settled', measured: 0.4, budget: 0.02, over: 0.38 }],
      },
    },
    { route: 'faq', viewport: 'mobile', layoutShift: { routeClass: 'standalone', failures: [] } },
    { route: 'about', viewport: 'mobile' },
  ];

  it('flattens failures across rows and skips unmeasured routes', () => {
    const failures = collectLayoutShiftFailures(rows);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].route, 'home-archive');
    assert.equal(failures[0].viewport, 'mobile');
    assert.equal(failures[0].routeClass, 'archive');
  });

  it('returns nothing for an empty run', () => {
    assert.deepEqual(collectLayoutShiftFailures([]), []);
    assert.deepEqual(collectLayoutShiftFailures(null), []);
  });

  it('formats a failure into one readable line', () => {
    const [failure] = collectLayoutShiftFailures(rows);
    const line = formatLayoutShiftFailure(failure);
    assert.match(line, /mobile home-archive/);
    assert.match(line, /settled CLS 0\.4/);
    assert.match(line, /budget 0\.02/);
    assert.doesNotMatch(line, /never went quiet/);
  });

  it('says when a failing route never went quiet', () => {
    // Otherwise a truncated phase split reads like an ordinary regression.
    const evaluation = evaluateLayoutShiftBudget(
      { slug: 'dissertation', url: '/dissertation/' },
      { hydration: 0.01, settled: 0.4, reachedGraceLimit: true },
    );
    const [failure] = collectLayoutShiftFailures([
      { route: 'dissertation', viewport: 'mobile', layoutShift: evaluation },
    ]);
    assert.equal(failure.reachedGraceLimit, true);
    assert.match(formatLayoutShiftFailure(failure), /never went quiet/);
  });
});

describe('preview audit layout-shift wiring', () => {
  it('installs the observer before any document script', () => {
    assert.match(probeSource, /export function installLayoutShiftObserver\(context\)/);
    assert.match(probeSource, /context\.addInitScript/);
    assert.match(probeSource, /type: 'layout-shift', buffered: true/);
    assert.match(auditSource, /await installLayoutShiftObserver\(context\)/);
  });

  it('gives every route its own document before measuring it', () => {
    // tests/layout-shift-navigation.browser.test.js drives this against a real
    // browser. This only holds the wiring in place.
    assert.match(auditSource, /requiresFreshDocument\(page\.url\(\), targetUrl\.toString\(\), BASE\)/);
    assert.match(auditSource, /await page\.goto\(BOOTSTRAP_URL/);
  });

  it('waits for the details body, not the request, before measuring', () => {
    assert.match(auditSource, /page\.waitForResponse\(/);
    assert.match(auditSource, /response\.finished\(\)/);
    assert.match(auditSource, /measureLayoutShift\(page, \{ startupSettled \}\)/);
  });

  it('measures each route before any interaction check runs', () => {
    const measureAt = auditSource.indexOf('const layoutShiftMeasurement = await measureLayoutShift(page');
    const firstInteraction = auditSource.indexOf('if (route.verifyReportFirst)');
    assert.ok(measureAt > 0, 'route measurement call is missing');
    assert.ok(measureAt < firstInteraction, 'measurement must precede the interaction checks');
  });

  it('fails the run on a budget regression outside seeding mode', () => {
    assert.match(auditSource, /budgetFailures\.length > 0 && !LAYOUT_SHIFT_SEED_MODE\) process\.exitCode = 1/);
    assert.match(auditSource, /PREVIEW_AUDIT_LAYOUT_SHIFT_SEED === '1'/);
  });

  it('writes measured and baseline values into the report', () => {
    assert.match(auditSource, /layout-shift-baseline\.json/);
    assert.match(auditSource, /Layout-shift budget failures/);
    assert.match(auditSource, /baseline \$\{esc\(baseline\)\}/);
  });

  it('keeps the measurement window bounded', () => {
    assert.ok(LAYOUT_SHIFT_TIMING.quietMs >= 200);
    assert.ok(LAYOUT_SHIFT_TIMING.maxGraceMs > LAYOUT_SHIFT_TIMING.quietMs);
    assert.ok(LAYOUT_SHIFT_TIMING.settledObservationMs >= 200);
    assert.ok(LAYOUT_SHIFT_TIMING.pollMs < LAYOUT_SHIFT_TIMING.quietMs);
  });
});
