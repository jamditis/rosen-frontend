import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('scripts/preview-audit.js', 'utf8');

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
});
