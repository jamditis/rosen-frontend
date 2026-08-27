/**
 * Route vocabulary single-source-of-truth tests
 *
 * Issue #133 moves the route vocabulary (ROUTES / DEFAULT_ROUTE) into
 * viewState.js and has router.js re-export it, so there is now a single literal
 * definition instead of two hand-maintained copies that could drift. These
 * tests lock that: router.js must expose the *same* ROUTES object viewState.js
 * owns, not an equal-looking second copy.
 *
 * Scope: this proves single-source-of-truth at one shared ?v= version. The
 * adjacent cross-file risk — router.js importing viewState.js at a *different*
 * ?v= than the rest of the app, which would load two instances in the browser —
 * is owned by version-consistency.test.js, which fails if any frontend import
 * carries an off-version ?v= query.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const servicesDir = path.join(__dirname, '..', 'frontend', 'services');
const routerPath = path.join(servicesDir, 'router.js');
const viewStatePath = path.join(servicesDir, 'viewState.js');

// router.js imports the route vocabulary from viewState.js with a ?v= cache
// key. Node keys its ESM module cache on the full specifier, so each distinct
// query is a *separate* module instance with its own ROUTES object. To compare
// the same instance router.js actually loaded, import viewState.js under the
// identical query router.js's source uses — read it from source rather than
// hardcoding a version, so this test survives a cache-busting version bump.
const routerSrc = fs.readFileSync(routerPath, 'utf-8');
const queryMatch = routerSrc.match(/from\s+['"]\.\/viewState\.js(\?v=[^'"]+)?['"]/);
const viewStateQuery = queryMatch && queryMatch[1] ? queryMatch[1] : '';

const routerMod = await import(pathToFileURL(routerPath).href);
const viewStateMod = await import(pathToFileURL(viewStatePath).href + viewStateQuery);

describe('route vocabulary single source of truth', () => {
  it('router.js imports the route vocabulary from viewState.js (no second copy)', () => {
    assert.ok(queryMatch, 'router.js must import ROUTES from ./viewState.js');
  });

  it('router.js re-exports the exact ROUTES object viewState.js owns', () => {
    // Reference identity, not deep-equality: an equal-looking but separate copy
    // is exactly the drift this dedup removes, so identity is the strict guard.
    assert.strictEqual(routerMod.ROUTES, viewStateMod.ROUTES);
  });

  it('exposes the full set of archive routes', () => {
    assert.deepStrictEqual(Object.keys(viewStateMod.ROUTES).sort(), [
      'about',
      'analytics',
      'archive',
      'desktop',
      'dissertation',
      'entities',
      'folders',
      'nowhere',
      'start',
      'wiki',
    ]);
  });

  it('defaults to the archive route', () => {
    assert.strictEqual(viewStateMod.DEFAULT_ROUTE, viewStateMod.ROUTES.archive);
  });
});
