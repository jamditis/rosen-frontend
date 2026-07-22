import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const analytics = read('frontend/components/AnalyticsDashboard.js');
const dissertation = read('frontend/components/DissertationPage.js');
const entityBrowser = read('frontend/components/EntityBrowser.js');
const mindMap = read('frontend/components/MindMap.js');
const queryBuilder = read('frontend/components/QueryBuilder.js');
const styles = read('frontend/index.css');
const desktopStyles = read('frontend/desktop/desktop.css');
const audit = read('scripts/preview-audit.js');
const guide = read('CLAUDE.md');

describe('archival research and data surfaces', () => {
  it('gives entity discovery a dense ruled index and a distinct research detail sheet', () => {
    assert.match(entityBrowser, /archive-data-surface archive-data-surface--entities/);
    assert.match(entityBrowser, /archive-data-dimensions/);
    assert.match(entityBrowser, /archive-data-toolbar/);
    assert.match(entityBrowser, /archive-data-caption/);
    assert.match(entityBrowser, /archive-entity-grid/);
    assert.match(entityBrowser, /archive-entity-row/);
    assert.match(entityBrowser, /archive-entity-detail/);
    assert.match(entityBrowser, /archive-data-loading/);
    assert.match(entityBrowser, /archive-notice archive-notice--danger/);
    assert.match(entityBrowser, /aria-pressed=\$\{selectedType === type\}/);
  });

  it('frames analytics around numeric hierarchy and crisp chart panels', () => {
    assert.match(analytics, /archive-data-route archive-data-route--analytics/);
    assert.match(analytics, /archive-data-route__header/);
    assert.match(analytics, /archive-data-surface archive-data-surface--analytics/);
    assert.match(analytics, /archive-data-stats/);
    assert.match(analytics, /archive-data-stat__value/);
    assert.match(analytics, /archive-data-panel archive-data-chart/);
    assert.match(analytics, /archive-data-cooccurrence/);
    assert.match(analytics, /archive-query-lab/);
    assert.match(analytics, /archive-query-terminal/);
    assert.doesNotMatch(analytics, /bg-gradient-to-/);
  });

  it('keeps the query builder technical, composable, and table-dense', () => {
    assert.match(queryBuilder, /archive-query-builder/);
    assert.match(queryBuilder, /archive-query-template/);
    assert.match(queryBuilder, /archive-query-sentence/);
    assert.match(queryBuilder, /archive-query-field archive-query-field--dropdown/);
    assert.match(queryBuilder, /archive-query-field archive-query-field--number/);
    assert.match(queryBuilder, /archive-query-field archive-query-field--text/);
    assert.match(queryBuilder, /archive-query-actions/);
    assert.match(queryBuilder, /archive-query-results/);
    assert.match(queryBuilder, /role="region"[\s\S]{0,160}tabIndex="0"[\s\S]{0,160}aria-label="Query results"/);
    assert.match(queryBuilder, /archive-data-table/);
    assert.match(queryBuilder, /archive-query-legend/);
  });

  it('uses the same archival map chrome in standard and embedded dissertation views', () => {
    assert.match(dissertation, /archive-dissertation-route/);
    assert.match(dissertation, /archive-dissertation-header/);
    assert.match(dissertation, /archive-dissertation-intro/);
    assert.match(dissertation, /archive-dissertation-guide/);
    assert.match(dissertation, /archive-dissertation-map/);
    assert.match(dissertation, /archive-index-term/);
    assert.match(dissertation, /role="region"[\s\S]{0,120}tabIndex="0"[\s\S]{0,120}aria-label="Dissertation index terms"/);
    assert.match(mindMap, /archive-mind-map/);
    assert.match(mindMap, /archive-mind-map__controls/);
    assert.match(mindMap, /archive-mind-map__status/);
    assert.match(mindMap, /archive-mind-map__shortcuts/);
    assert.match(mindMap, /rx="2"/);
  });

  it('keeps new visible copy in sentence case', () => {
    for (const source of [analytics, dissertation, mindMap, queryBuilder]) {
      assert.doesNotMatch(source, />\s*(?:Back to Archive|Read Full Text|Collapse All|Expand All|Keyboard Shortcuts|Run Query)\s*</);
    }
    const templateNames = [...queryBuilder.matchAll(/\bname: '([^']+)'/g)]
      .map(([, name]) => name);
    assert.ok(templateNames.length > 0, 'expected query template labels');
    assert.deepEqual(
      templateNames.filter((name) => /\s[A-Z][a-z]/.test(name)),
      [],
      'query template labels should use sentence case',
    );
  });

  it('defines shared square data recipes and compact 200-percent reflow', () => {
    for (const selector of [
      '.archive-data-surface',
      '.archive-data-panel',
      '.archive-data-stat',
      '.archive-data-chart',
      '.archive-data-toolbar',
      '.archive-entity-row',
      '.archive-query-sentence',
      '.archive-query-terminal',
      '.archive-data-table',
      '.archive-dissertation-map',
      '.archive-mind-map__controls',
    ]) {
      assert.match(styles, new RegExp(selector.replace('.', '\\.')));
    }
    assert.match(styles, /\.archive-data-panel\s*\{[\s\S]*border-radius:\s*0/);
    assert.match(styles, /\.archive-data-stat__value\s*\{[\s\S]*font-family:\s*var\(--font-display\)/);
    assert.match(styles, /\.archive-dissertation-terms\s*\{[\s\S]*min-height:\s*var\(--archive-target-min\)/);
    for (const selector of [
      '.archive-data-error h3',
      '.archive-entity-detail__title',
      '.archive-query-results__header h4',
      '.archive-dissertation-intro__title h1',
      '.archive-mind-map__shortcuts-header h3',
    ]) {
      const escaped = selector.replaceAll('.', '\\.');
      assert.match(
        styles,
        new RegExp(`${escaped}\\s*\\{[\\s\\S]*?font-weight:\\s*var\\(--font-weight-bold\\);[\\s\\S]*?\\}`),
        `${selector} must restore the heading weight reset by Tailwind preflight`,
      );
    }
    assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.archive-data-toolbar/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.archive-mind-map/);
    assert.match(desktopStyles, /\.archive-desktop \.archive-action\s*\{[\s\S]*color:\s*var\(--archive-action-color\)/);
    assert.match(
      desktopStyles,
      /@media \(hover: hover\) and \(forced-colors: none\)[\s\S]*\.archive-desktop \.archive-action:hover/,
      'desktop hover colors must not override the forced-colors recipe',
    );
  });

  it('audits query results and research-surface reflow as a 41-route matrix', () => {
    assert.match(audit, /slug: 'analytics-query-results'[\s\S]*verifyQueryResults: true/);
    assert.match(audit, /route\.verifyQueryResults/);
    assert.match(audit, /getByRole\('button', \{ name: 'Run query', exact: true \}\)/);
    assert.match(audit, /Query results escaped the 200%-zoom viewport/);
    assert.match(guide, /walks 41 route states at mobile, tablet, and desktop/);
  });
});
