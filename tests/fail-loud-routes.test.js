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

import { sourceSection } from './helpers/source-section.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appJs = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'App.js'), 'utf-8');
const archiveServiceJs = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'services', 'archiveService.js'), 'utf-8');
const entityBrowserJs = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'components', 'EntityBrowser.js'), 'utf-8');

describe('fail-loud error panel is shared across record-backed routes (#369)', () => {
  it('defines a single shared errorPanel keyed on the error state', () => {
    // Static render contract: App.js cannot be imported by Node because its UI
    // dependencies require the browser import map. Restrict the assertion to
    // the shared panel declaration instead of matching anywhere in the file.
    const errorPanel = sourceSection(
      appJs,
      'const errorPanel',
      'return html`',
      'shared route error panel',
    );
    assert.match(errorPanel, /const\s+errorPanel\s*=\s*error\s*&&/,
      'a shared errorPanel should render only when error is set');
  });

  it('surfaces the error panel on the entity browser route', () => {
    const entityRoute = sourceSection(
      appJs,
      '${isEntityBrowser && errorPanel}',
      '${isArchiveGrid && html`\n                <${ArchiveResults}',
      'entity browser route',
    );
    assert.match(entityRoute, /isEntityBrowser\s*&&\s*errorPanel/,
      'the entity browser route must render the shared errorPanel during an outage');
    assert.match(entityRoute, /isEntityBrowser\s*&&\s*!loading\s*&&\s*!error\s*&&\s*html`/,
      'EntityBrowser render must be gated on !error so it stays hidden during an outage');
  });

  it('still renders the shared panel on the archive grid route', () => {
    const recordBackedRoutes = sourceSection(
      appJs,
      '${isEntityBrowser && errorPanel}',
      '${currentRoute === ROUTES.archive',
      'record-backed route renders',
    );
    const archiveGridRoute = sourceSection(
      recordBackedRoutes,
      '${isArchiveGrid && html`',
      '            `}',
      'archive grid route',
    );
    assert.match(archiveGridRoute, /<\$\{ArchiveResults\}[\s\S]*errorPanel=\$\{errorPanel\}[\s\S]*\/>/,
      'the archive grid branch must render the shared errorPanel');
  });
});

describe('entity-index failures remain distinct from core-data failures', () => {
  it('returns a shaped failure that preserves record-modal fallback behavior', () => {
    const entityLoader = sourceSection(
      archiveServiceJs,
      'export const fetchEntitiesData',
      'export const areEntitiesLoaded',
      'entity data loader',
    );
    assert.match(
      entityLoader,
      /return \{\s*entities:\s*\[\],\s*recordEntityMap:\s*\{\},\s*error:\s*'The entity index could not load\./,
    );
  });

  it('renders an explicit shared-browser alert instead of an empty entity list', () => {
    const entityLoad = sourceSection(
      entityBrowserJs,
      '// Load entity data',
      'const { entities: scopedEntities',
      'entity browser data load',
    );
    const errorView = sourceSection(
      entityBrowserJs,
      'if (loadError)',
      '// Resolve the selected entity',
      'entity browser error view',
    );

    assert.match(entityLoad, /if \(data\?\.error\)[\s\S]*setLoadError\(data\.error\)/);
    assert.match(errorView, /role="alert"/);
    assert.match(errorView, /Unable to load people and ideas/);
    assert.match(errorView, /window\.location\.reload\(\)/);
    assert.match(errorView, /className="archive-action archive-action--danger"/,
      'the reload control must retain the shared minimum-target action recipe');
  });
});
