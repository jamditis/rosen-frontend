import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync('frontend/components/StartHerePage.js', 'utf8');
const app = readFileSync('frontend/App.js', 'utf8');
const serviceWorker = readFileSync('frontend/sw.js', 'utf8');
const shippedCss = readFileSync('frontend/dist/tailwind.css', 'utf8');

describe('Start here page', () => {
  it('offers direct archive access and three intent-based starting points', () => {
    assert.match(page, /Search and browse records/);
    assert.match(page, /Learn how the archive works/);
    assert.match(page, /Show me the highlights/);
    assert.match(page, /Research a topic or idea/);
    assert.doesNotMatch(page, /Take a short tour/);
  });

  it('presents an authored chronological trail through three matched records', () => {
    const dissertation = page.indexOf("title: 'The Impossible Press (1986)'");
    const book = page.indexOf("title: 'What Are Journalists For?'");
    const essay = page.indexOf("title: 'The View from Nowhere'");

    assert.ok(dissertation > -1 && dissertation < book && book < essay, 'curated trail should be chronological');
    assert.match(page, /Folio \$\{entry\.folio\}/);
    assert.match(page, /\$\{entry\.year\} · \$\{entry\.form\}/);
    assert.match(page, /recordYear === entry\.year \? 4 : 0/, 'the matched record should belong to the stated folio year');
    assert.match(page, /aria-label=\$\{`Open \$\{record\.title\} in the archive`\}/);
    assert.match(page, /onClick=\$\{\(\) => onSelectRecord && onSelectRecord\(record\.id\)\}/);
    assert.doesNotMatch(page, /<article key=\$\{record\.id\}/, 'the whole highlight card should be interactive');
  });

  it('links every field-guide section to the live archive feature it describes', () => {
    for (const route of ['archive', 'folders', 'entities', 'dissertation', 'analytics']) {
      assert.match(page, new RegExp(`routeButton\\('${route}'`), `${route} action is missing`);
    }
    assert.match(page, /onClick=\$\{onOpenBugReport\}/);
    assert.match(page, /onSelectRecord\(record\.id\)/);
  });

  it('derives changing archive facts from records instead of hardcoding totals', () => {
    assert.match(page, /useMemo\(\(\) =>/);
    assert.match(page, /total: records\.length/);
    assert.match(page, /new Set\(records\.flatMap/);
    assert.match(page, /Math\.min\(\.\.\.years\)/);
    assert.match(page, /Math\.max\(\.\.\.years\)/);
    assert.doesNotMatch(page, /26,6\d{2}/, 'the current archive total must not be embedded in copy');
  });

  it('uses real archive records for highlights and handles unloaded data', () => {
    assert.match(page, /findFeaturedRecords\(records\)/);
    assert.match(page, /records\s*\.filter\(\(record\) => record\.type !== 'social'\)/);
    assert.match(page, /Curated records will appear here once the archive data has loaded/);
  });

  it('keeps the complete guide in accessible progressive disclosure', () => {
    assert.match(page, /<details className=/);
    assert.match(page, /<summary className=/);
    assert.match(page, /Complete visitor field guide · 7 sections/);
    for (const id of [
      'guide-records',
      'guide-folders',
      'guide-entities',
      'guide-dissertation',
      'guide-analytics',
      'guide-archive-vault',
      'guide-reporting'
    ]) {
      assert.match(page, new RegExp(`id: '${id}'`), `${id} content is missing`);
    }
  });

  it('moves focus on route entry and in-page jumps while respecting reduced motion', () => {
    assert.match(page, /window\.scrollTo\(\{ top: 0, left: 0, behavior: 'auto' \}\)/);
    assert.match(page, /titleRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
    assert.match(page, /ref=\$\{titleRef\} tabIndex="-1"/);
    assert.match(page, /prefers-reduced-motion: reduce/);
    assert.match(page, /behavior: reduceMotion \? 'auto' : 'smooth'/);
    assert.match(page, /if \(disclosure\) disclosure\.open = true/);
    assert.match(page, /target\.querySelector\('h2, summary'\)/);
    assert.match(page, /focusTarget\?\.focus\(\{ preventScroll: true \}\)/);
  });

  it('ships the CSS utilities introduced by the compact field guide', () => {
    for (const rule of [
      '.cursor-pointer{',
      '.outline-none{',
      '.px-5{',
      '.py-2{',
      '.font-normal{',
      '.md\\:p-8{'
    ]) {
      assert.ok(shippedCss.includes(rule), `shipped tailwind.css is missing ${rule}`);
    }
  });

  it('is wired as a cached full-page route with the report modal still mounted', () => {
    assert.match(app, /currentRoute === ROUTES\.start/);
    assert.match(app, /<\$\{StartHerePage\}/);
    assert.match(app, /const renderFullPage = \(page\)/);
    assert.match(app, /<\$\{BugReportModal\}/);
    assert.equal((serviceWorker.match(/StartHerePage\.js/g) || []).length, 2);
    assert.equal((serviceWorker.match(/tourState\.js/g) || []).length, 2);
  });
});
