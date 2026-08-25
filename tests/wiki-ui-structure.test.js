import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(rootDir, ...parts), 'utf8');

function section(source, start, end, label) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `${label} start marker must exist`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `${label} end marker must exist`);
  return source.slice(startIndex, endIndex);
}

describe('wiki UI wiring', () => {
  const appSrc = read('frontend', 'App.js');
  const wikiSrc = read('frontend', 'components', 'WikiPage.js');
  const toolsSrc = read('frontend', 'components', 'ToolsModal.js');

  it('does not start the large archive fetch on a cold wiki deep link', () => {
    // Static contract: this verifies the route-to-loader wiring. The loader is
    // browser-only, so a direct Node import is not practical. Keep each check
    // inside its owning declaration instead of matching across all of App.js.
    const nonRecordRoutes = section(
      appSrc,
      'const NON_RECORD_ROUTES',
      'const DESKTOP_RECORD_APPS',
      'non-record route declaration',
    );
    const coreLoad = section(
      appSrc,
      '// Load Data',
      '// Preserve the standard archive',
      'core data load',
    );

    assert.match(nonRecordRoutes, /const NON_RECORD_ROUTES\s*=\s*new Set\(\[[\s\S]*ROUTES\.wiki[\s\S]*\]\);/);
    assert.match(coreLoad, /NON_RECORD_ROUTES\.has\(currentRoute\)\s*&&\s*!desktopNeedsRecords\) return/);
  });

  it('keeps the wiki route reachable by deep link but exposes no public entry point', () => {
    // Jarvis flagged at the launch review that the public "wiki" surface is
    // unclear, so its entry points were pulled until we decide what the
    // section becomes (PR #563). The route and its in-page navigation handler
    // stay wired so existing #wiki deep links still resolve rather than 404.
    // This is a reversible unlink, not a delete.
    // Static policy contract: the route remains intentionally reachable while
    // navigation stays hidden. This is source wiring, not user behavior.
    const toolSelection = section(
      appSrc,
      'const handleToolSelect',
      '// Load Data',
      'tool selection handler',
    );
    assert.match(toolSelection, /action\s*===\s*'wiki'\s*\)\s*\{\s*navigateTo\(ROUTES\.wiki\)/);
    // But nothing in the app advertises it: no nav button, footer link, or
    // homepage tool-row chip navigates to the wiki, and the tools modal no
    // longer lists it.
    assert.doesNotMatch(appSrc, /goTo\(ROUTES\.wiki\)/);
    assert.doesNotMatch(toolsSrc, /id:\s*'wiki'/);
    assert.doesNotMatch(toolsSrc, /action:\s*'wiki'/);
  });

  it('renders an explicit missing-page state for unknown and malformed wiki slugs', () => {
    // parseWikiHash behavior is covered directly in wiki-service.test.js. This
    // static UI contract only checks that its notFound result reaches the
    // explicit missing-page view.
    const missingPage = section(
      wikiSrc,
      'if (activeSlug || notFound) return html`',
      '\n\n  return html`',
      'wiki missing-page view',
    );
    assert.match(missingPage, /Wiki page not found/);
  });

  it('resolves valid wiki slugs through the page index into the detail view', () => {
    // Static component contract: parseWikiHash behavior is tested directly,
    // while this scoped check binds its valid slug to the rendered WikiDetail.
    const pageResolution = section(
      wikiSrc,
      'const pageIndex',
      'const counts',
      'wiki page resolution',
    );
    const loadedStates = section(
      wikiSrc,
      'if (loading)',
      'if (activeSlug || notFound)',
      'loaded wiki states',
    );

    assert.match(pageResolution, /selectedPage\s*=\s*activeSlug\s*\?\s*\(pageIndex\.get\(activeSlug\)\s*\|\|\s*null\)/);
    assert.match(loadedStates, /if \(selectedPage\) return html`<\$\{WikiDetail\}\s+page=\$\{selectedPage\}/);
  });

  it('does not link the public app to repo-only markdown files', () => {
    // Static security boundary: repository paths must never become public URLs.
    assert.doesNotMatch(wikiSrc, /href="\.\/docs\/plans\//);
  });

  it('uses explicit noopener and noreferrer on external wiki references', () => {
    // Static security boundary: the component owns the rendered anchor.
    assert.match(wikiSrc, /rel="noopener noreferrer"/);
  });

  it('does not use numeric && guards for optional alias panels', () => {
    // Static React guard: a numeric && condition can render a stray zero.
    assert.doesNotMatch(wikiSrc, /page\.aliases\.length\s*&&/);
  });
});
