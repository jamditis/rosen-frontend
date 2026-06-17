import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('scripts/preview-audit.js', 'utf8');

describe('preview audit browser error handling', () => {
  it('turns a missing Playwright browser into an actionable error', () => {
    assert.match(source, /async function launchBrowser\(\)/);
    assert.match(source, /playwright browser is not installed/i);
    assert.match(source, /npx playwright install chromium/);
    assert.match(source, /chromium\.launch\(\)/);
    assert.match(source, /await main\(\)\.catch/);
    assert.match(source, /console\.error\(err\.message\)/);
  });
});
