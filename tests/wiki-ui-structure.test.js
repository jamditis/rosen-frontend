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
    assert.match(appSrc, /NON_RECORD_ROUTES\s*=\s*new Set\([\s\S]*ROUTES\.wiki/);
    assert.match(appSrc, /NON_RECORD_ROUTES\.has\(currentRoute\)\s*&&\s*!desktopNeedsRecords\) return/);
  });

  it('keeps the wiki route reachable by deep link but exposes no public entry point', () => {
    // Jarvis flagged at the launch review that the public "wiki" surface is
    // unclear, so its entry points were pulled until we decide what the
    // section becomes (PR #563). The route and its in-page navigation handler
    // stay wired so existing #wiki deep links still resolve rather than 404.
    // This is a reversible unlink, not a delete.
    assert.match(appSrc, /action\s*===\s*'wiki'[\s\S]*navigateTo\(ROUTES\.wiki\)/);
    // But nothing in the app advertises it: no nav button, footer link, or
    // homepage tool-row chip navigates to the wiki, and the tools modal no
    // longer lists it.
    assert.doesNotMatch(appSrc, /goTo\(ROUTES\.wiki\)/);
    assert.doesNotMatch(toolsSrc, /id:\s*'wiki'/);
    assert.doesNotMatch(toolsSrc, /action:\s*'wiki'/);
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
