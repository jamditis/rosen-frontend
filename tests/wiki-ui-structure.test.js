import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(rootDir, ...parts), 'utf8');

describe('wiki UI wiring', () => {
  const appSrc = read('frontend', 'App.js');
  const wikiSrc = read('frontend', 'components', 'WikiPage.js');
  const toolsSrc = read('frontend', 'components', 'ToolsModal.js');

  it('does not start the large archive fetch on a cold wiki deep link', () => {
    assert.match(appSrc, /currentRoute\s*===\s*ROUTES\.analytics\s*\|\|\s*currentRoute\s*===\s*ROUTES\.wiki\)\s*return/);
  });

  it('routes the mobile tools modal to the wiki page', () => {
    assert.match(toolsSrc, /id:\s*'wiki'/);
    assert.match(toolsSrc, /action:\s*'wiki'/);
    assert.match(appSrc, /action\s*===\s*'wiki'[\s\S]*navigateTo\(ROUTES\.wiki\)/);
    // The archive group must be rendered, not just declared, or the modal's
    // discovery path to the wiki is dead.
    assert.match(toolsSrc, /TOOLS\.archive\.map/);
  });

  it('renders an explicit missing-page state for unknown and malformed wiki slugs', () => {
    assert.match(wikiSrc, /Wiki page not found/);
    assert.match(wikiSrc, /activeSlug[\s\S]*selectedPage/);
    // A malformed deep link must reach the not-found state, not the index.
    assert.match(wikiSrc, /activeSlug\s*\|\|\s*notFound/);
  });

  it('does not link the public app to repo-only markdown files', () => {
    assert.doesNotMatch(wikiSrc, /href="\.\/docs\/plans\//);
  });

  it('uses explicit noopener and noreferrer on external wiki references', () => {
    assert.match(wikiSrc, /rel="noopener noreferrer"/);
  });

  it('does not use numeric && guards for optional alias panels', () => {
    assert.doesNotMatch(wikiSrc, /page\.aliases\.length\s*&&/);
  });
});
