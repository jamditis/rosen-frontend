/**
 * View-state and small lifecycle fixes from the 2026-11-08 state machine map
 * (docs/research/2026-11-08-state-machine-map.md, follow-up items 8, 19, 20,
 * and 26).
 *
 * App.js, RecordModal.js, and DesktopShell.js resolve esm.sh import-map
 * specifiers that the node runner does not have, so they cannot be imported
 * here. Pure decisions live in frontend/services/viewState.js and are tested
 * for real; the wiring that calls them is checked against the source text.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');
const app = read('frontend', 'App.js');

describe('one default filter object (item 26)', () => {
  it('App.js builds its defaults from viewState.defaultFilters', () => {
    assert.match(
      app,
      /import \{[^}]*\bdefaultFilters\b[^}]*\} from '\.\/services\/viewState\.js\?v=/,
      'App.js must import the shared defaultFilters factory',
    );
    assert.match(app, /\.\.\.defaultFilters\(\),\s*recordIds: null/);
  });

  it('App.js does not restate the URL filter fields in a second literal', () => {
    assert.doesNotMatch(app, /const DEFAULT_FILTERS = \{/);
    assert.doesNotMatch(app, /^\s+search: '',\n\s+categories: \[\],/m);
  });
});
