import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve from this file so the suite runs from any working directory.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(REPO_ROOT, 'scripts', 'preview-audit.js'), 'utf8');

describe('preview audit browser error handling', () => {
  it('turns a missing Playwright browser into an actionable error', () => {
    assert.match(source, /async function launchBrowser\(\)/);
    assert.match(source, /playwright browser is not installed/i);
    assert.match(source, /npx playwright install chromium/);
    assert.match(source, /chromium\.launch\(/);
    assert.match(source, /await main\(\)\.catch/);
    assert.match(source, /console\.error\(err\.message\)/);
  });

  it('points at a Chromium that is already on the machine', () => {
    assert.match(source, /PREVIEW_AUDIT_CHROMIUM_PATH/);
    assert.match(source, /executablePath \? \{ executablePath \} : \{\}/);
  });
});

describe('preview audit run scoping', () => {
  it('audits every route when no filter is set', () => {
    assert.match(source, /REQUESTED_ROUTES\.length === 0/);
    assert.match(source, /if \(!isAuditedRoute\(route\)\) continue;/);
  });

  it('rejects a filter that names a route the audit does not have', () => {
    assert.match(source, /Unknown PREVIEW_AUDIT_ROUTES entries/);
  });

  it('counts the audited routes, not the configured routes, in the report', () => {
    assert.match(source, /Routes audited: \$\{AUDITED_ROUTE_COUNT\}/);
  });

  it('warms the page before the first measured route', () => {
    // A cold browser pays for the fonts, the modules, and the first corpus
    // render, and that cost used to land on whichever route ran first. A run
    // scoped to one route therefore reported a different number than the same
    // route in a full run.
    const warmAt = source.indexOf('await warmUpPage(page, viewport)');
    const loopAt = source.indexOf('for (const route of ROUTES) {');
    assert.ok(warmAt > 0, 'warm-up call is missing');
    assert.ok(warmAt < loopAt, 'the warm-up must run before the route loop');
    assert.match(source, /async function warmUpPage\(page, viewport\)/);
  });

  it('seeds the desktop layout whichever route runs first', () => {
    // The seeding step used to be skipped when the page was not already on a
    // preview URL, which is every first route of a run. Scoping a run to
    // desktop-windowing made that route first, so its three-window layout was
    // never written and the route failed before it was measured. The bootstrap
    // document now runs first and localStorage is always reachable.
    const bootstrapAt = source.indexOf('await page.goto(BOOTSTRAP_URL');
    const seedAt = source.indexOf("localStorage.setItem('jrda-desktop-layout'");
    assert.ok(bootstrapAt > 0, 'bootstrap navigation is missing');
    assert.ok(seedAt > bootstrapAt, 'the desktop layout must be seeded after the bootstrap document');
    assert.doesNotMatch(source, /if \(page\.url\(\)\.startsWith\(BASE\)\) \{\s*\n\s*await page\.evaluate/);
  });
});

describe('preview audit context wiring', () => {
  it('gives every isolated context the same third-party wiring', () => {
    // The minimized-window restore, invalid record, desktop load failure, and
    // compact viewport checks each open their own context and load the app in
    // it. A context without the module cache never mounts React.
    assert.doesNotMatch(source, /await browser\.newContext\(\{\n\s+viewport/);
    const helperCount = (source.match(/await newAuditContext\(browser, /g) || []).length;
    assert.ok(helperCount >= 5, `expected every context to go through the helper, found ${helperCount}`);
  });
});
