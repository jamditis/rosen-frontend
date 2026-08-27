// The baseline-versus-candidate report CI publishes (#772).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDeltaRows,
  mergeCandidates,
  renderMarkdown,
} from '../scripts/layout-shift-delta.js';
import { LAYOUT_SHIFT_BASELINE, LAYOUT_SHIFT_BUDGETS } from '../scripts/layout-shift-budgets.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(
  resolve(REPO_ROOT, '.github', 'workflows', 'layout-shift-budget.yml'),
  'utf8',
);

const routeUrls = {
  dissertation: '/dissertation/',
  faq: '/faq/',
  'home-archive': '/',
  'desktop-tools': '/#desktop/tools',
};

describe('candidate merge', () => {
  it('keeps the worst viewport for each route', () => {
    const merged = mergeCandidates([
      { faq: { hydration: 0.02, settled: 0 } },
      { faq: { hydration: 0.3, settled: 0.01 } },
      { 'home-archive': { hydration: 1, settled: 0 } },
    ]);
    assert.deepEqual(merged.faq, { hydration: 0.3, settled: 0.01 });
    assert.deepEqual(merged['home-archive'], { hydration: 1, settled: 0 });
  });

  it('survives an empty or malformed shard', () => {
    const merged = mergeCandidates([null, {}, { faq: {} }]);
    assert.deepEqual(merged.faq, { hydration: 0, settled: 0 });
  });
});

describe('delta rows', () => {
  it('flags a measured value over its class budget', () => {
    const rows = buildDeltaRows(
      { dissertation: { hydration: LAYOUT_SHIFT_BUDGETS.standalone.hydration + 0.5, settled: 0 } },
      routeUrls,
    );
    const row = rows.find((entry) => entry.slug === 'dissertation');
    assert.equal(row.routeClass, 'standalone');
    assert.equal(row.phases[0].overBudget, true);
    assert.equal(row.phases[1].overBudget, false);
  });

  it('reports movement against the recorded baseline', () => {
    const seeded = Object.keys(LAYOUT_SHIFT_BASELINE)[0];
    if (!seeded) return; // Nothing seeded yet; the no-baseline case covers it.
    const baseline = LAYOUT_SHIFT_BASELINE[seeded];
    const rows = buildDeltaRows(
      { [seeded]: { hydration: baseline.hydration + 0.05, settled: baseline.settled } },
      routeUrls,
    );
    const row = rows.find((entry) => entry.slug === seeded);
    assert.equal(row.phases[0].delta, 0.05);
    assert.equal(row.phases[1].delta, 0);
  });

  it('marks a route with no baseline instead of inventing a delta', () => {
    const rows = buildDeltaRows({ 'a-brand-new-route': { hydration: 0.2, settled: 0 } }, {});
    const row = rows.find((entry) => entry.slug === 'a-brand-new-route');
    assert.equal(row.unseeded, true);
    assert.equal(row.phases[0].delta, null);
  });

  it('marks a seeded route the run never measured', () => {
    const seeded = Object.keys(LAYOUT_SHIFT_BASELINE)[0];
    if (!seeded) return;
    const row = buildDeltaRows({}, routeUrls).find((entry) => entry.slug === seeded);
    assert.equal(row.missing, true);
    assert.equal(row.phases[0].measured, null);
  });
});

describe('published table', () => {
  it('renders one row per route with its budget', () => {
    const markdown = renderMarkdown(buildDeltaRows(
      { dissertation: { hydration: 0.02, settled: 0 } },
      routeUrls,
    ));
    assert.match(markdown, /\| `dissertation` \| standalone \| 0\.02/);
    assert.match(markdown, /Every measured route is inside its budget\./);
  });

  it('names the routes that went over budget', () => {
    const markdown = renderMarkdown(buildDeltaRows(
      { dissertation: { hydration: 9, settled: 9 } },
      routeUrls,
    ));
    assert.match(markdown, /over budget/);
    assert.match(markdown, /Routes over budget: dissertation\./);
  });
});

describe('CI wiring', () => {
  it('runs the audit in CI, one job per viewport', () => {
    assert.match(workflow, /npm run preview:audit/);
    assert.match(workflow, /viewport: \[mobile, tablet, desktop\]/);
    assert.match(workflow, /PREVIEW_AUDIT_VIEWPORT: \$\{\{ matrix\.viewport \}\}/);
  });

  it('installs the browser the audit needs', () => {
    assert.match(workflow, /npx playwright install --with-deps chromium/);
  });

  it('publishes the candidate against the baseline', () => {
    assert.match(workflow, /node scripts\/layout-shift-delta\.js/);
  });

  it('serves third-party modules from the mirror so a CDN cannot move the numbers', () => {
    assert.match(workflow, /node scripts\/mirror-audit-modules\.js/);
    assert.match(workflow, /PREVIEW_AUDIT_MODULE_CACHE: '1'/);
  });
});
