/**
 * Fail-loud route coverage tests (#369).
 *
 * PR #363 (#290) made fetchCoreData throw on a core-data outage, and App.js's
 * loader .catch sets `error`. But the error panel was rendered only in the
 * archive-grid branch, so the entity browser (which depends on the same core
 * load) rendered an empty browser with no explanation during an outage. The fix
 * extracts a shared `errorPanel` and surfaces it on every record-backed route.
 *
 * Source-pattern, because App.js pulls in browser-only ?v=-suffixed imports
 * Node cannot load — consistent with the other App.js structural tests.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appJs = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'App.js'), 'utf-8');

describe('fail-loud error panel is shared across record-backed routes (#369)', () => {
  it('defines a single shared errorPanel keyed on the error state', () => {
    assert.match(appJs, /const\s+errorPanel\s*=\s*error\s*&&/,
      'a shared errorPanel should render only when error is set');
  });

  it('surfaces the error panel on the entity browser route', () => {
    assert.match(appJs, /isEntityBrowser\s*&&\s*errorPanel/,
      'the entity browser route must render the shared errorPanel during an outage');
  });

  it('does not render the entity browser when the core load failed', () => {
    // Guard the gap directly: EntityBrowser must not render an empty browser
    // when error is set. The render condition must include !error.
    const match = appJs.match(/isEntityBrowser\s*&&\s*!loading\s*&&\s*!error\s*&&\s*html`/);
    assert.ok(match,
      'EntityBrowser render must be gated on !error so it stays hidden during an outage');
  });

  it('still renders the shared panel on the archive grid route', () => {
    // Regression: the archive grid kept its error panel after the extraction.
    // `isArchiveGrid && html\`` appears several times (filter button, sidebar,
    // record grid); the record grid is the terminal branch, so anchor on the
    // last occurrence and confirm the shared panel renders inside it.
    const gridIdx = appJs.lastIndexOf('isArchiveGrid && html`');
    assert.notStrictEqual(gridIdx, -1, 'archive grid branch must exist');
    assert.ok(appJs.slice(gridIdx, gridIdx + 200).includes('errorPanel'),
      'the archive grid branch must render the shared errorPanel');
  });
});
