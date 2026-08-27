import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const app = read('frontend/App.js');
const sidebar = read('frontend/components/Sidebar.js');
const timeline = read('frontend/components/Timeline.js');
const featured = read('frontend/components/FeaturedSection.js');
const results = read('frontend/components/ArchiveResults.js');
const loading = read('frontend/components/LoadingQuotes.js');
const styles = read('frontend/index.css');
const recipes = read('frontend/design-system/recipes.css');
const audit = read('scripts/preview-audit.js');
const auditHarness = [
  'docs/feature-audit/harness/lib.mjs',
  'docs/feature-audit/harness/test-main.mjs',
  'docs/feature-audit/harness/test-svc.mjs',
  'docs/feature-audit/harness/test-modals.mjs',
].map(read).join('\n');
const mainAuditHarness = read('docs/feature-audit/harness/test-main.mjs');
const serviceAuditHarness = read('docs/feature-audit/harness/test-svc.mjs');

describe('archive discovery visual-system refresh', () => {
  it('gives compact filter and sort controls stable accessible names', () => {
    assert.match(app, /aria-label="Open archive filters"/);
    assert.match(app, /id="sort-select"[\s\S]*aria-label="Sort archive records"/);
    assert.match(sidebar, /className="archive-control archive-filter-sidebar__search"/);
  });

  it('makes the horizontal timeline keyboard-operable with visible focus', () => {
    assert.match(timeline, /className="archive-timeline__scroll"/);
    assert.match(timeline, /role="region"/);
    assert.match(timeline, /aria-label="Archive timeline by year"/);
    assert.match(timeline, /<button[\s\S]*className="archive-timeline__year"/);
    assert.match(timeline, /tabIndex=\$\{data\.year === rovingYear \? 0 : -1\}/);
    assert.match(timeline, /ArrowLeft[\s\S]*ArrowRight[\s\S]*Home[\s\S]*End/);
    assert.match(timeline, /aria-pressed=\$\{isSelected\}/);
    assert.match(styles, /\.archive-timeline__scroll:focus-visible[\s\S]*outline:\s*3px solid var\(--archive-focus\)/);
    assert.match(styles, /\.archive-timeline__year:focus-visible[\s\S]*outline:\s*3px solid var\(--archive-focus\)/);
  });

  it('uses crisp archive controls and semantic paper surfaces for discovery', () => {
    assert.match(app, /archive-results-toolbar/);
    assert.match(app, /archive-view-switch/);
    assert.match(app, /archive-sort-control/);
    assert.match(sidebar, /archive-filter-sidebar/);
    assert.match(featured, /archive-featured-card/);
    assert.match(timeline, /archive-timeline/);
    assert.match(results, /archive-record-card/);
    assert.match(results, /archive-record-card__accent/);
    assert.match(results, /archive-folder-card/);
    assert.match(results, /archive-empty-state/);
    assert.match(results, /archive-pagination/);
    assert.match(loading, /archive-loading-state/);
    assert.match(styles, /\.archive-results-toolbar/);
    assert.match(styles, /\.archive-record-card/);
    assert.match(styles, /\.archive-folder-card/);
    assert.match(styles, /\.archive-empty-state/);
    assert.match(app, /archive-error-state/);
    assert.match(styles, /\.archive-error-state/);
    assert.match(app, />\s*Reload page\s*</);
  });

  it('renders Tools as an inset manila tab above its menu field', () => {
    assert.match(app, /archive-tools-strip[\s\S]*archive-folder-tab archive-tools-strip__tab[\s\S]*archive-tools-strip__items/);
    assert.match(styles, /\.archive-tools-strip > \.archive-tools-strip__tab[\s\S]*position:\s*absolute[\s\S]*left:\s*1rem[\s\S]*bottom:\s*100%/);
    assert.match(styles, /\.archive-tools-strip__items/);
    assert.match(recipes, /\.archive-folder-tab[\s\S]*background:\s*var\(--archive-folder-tab-edge\)[\s\S]*\.archive-folder-tab::before[\s\S]*inset:\s*1px 1px 0/);
    assert.match(results, /archive-folder-tab archive-folder-card__tab/);
    assert.doesNotMatch(results, /folder-tab-shape/);
    assert.match(styles, /\.archive-folder-card__tab[\s\S]*margin-left:\s*1rem/);
  });

  it('uses the available Tools strip width for direct links without crowding compact layouts', () => {
    const toolsStrip = app.slice(
      app.indexOf('<section className="archive-tools-strip'),
      app.indexOf('</section>', app.indexOf('<section className="archive-tools-strip')),
    );

    for (const label of ['Start here', 'Mind map', 'Dissertation reader', 'Entities', 'Analytics', 'FAQ', 'More']) {
      assert.match(toolsStrip, new RegExp(`>${label.replace(' ', '\\s*')}<|${label}`),
        `the homepage Tools strip must expose ${label}`);
    }
    assert.match(toolsStrip, /href=\$\{resolveSitePath\('dissertation\/reader\/'\)\}/);
    const readerHref = "href=${resolveSitePath('dissertation/reader/')}";
    const readerStart = toolsStrip.indexOf(readerHref);
    const readerLink = toolsStrip.slice(
      readerStart,
      toolsStrip.indexOf('</a>', readerStart) + 4,
    );
    assert.doesNotMatch(readerLink, /archive-tools-strip__status[\s\S]*Beta/,
      'the released dissertation reader must not carry a Beta label');
    assert.match(toolsStrip, /href=\$\{resolveSitePath\('faq\/'\)\}/);
    assert.equal([...toolsStrip.matchAll(/archive-tools-strip__wide"/g)].length, 3,
      'exactly three extra controls belong to the wide strip');
    assert.match(toolsStrip, /aria-labelledby="homepage-tools-title"[\s\S]*<h2 id="homepage-tools-title"/);
    assert.match(toolsStrip, /aria-label="More tools"[\s\S]*aria-haspopup="dialog"/);
    assert.match(styles, /\.archive-tools-strip\s*\{[^}]*container-type:\s*inline-size/s);
    assert.match(styles, /\.archive-tools-strip \.archive-tools-strip__wide\s*\{[^}]*display:\s*none/s,
      'the compact override must outrank the later-loaded shared action recipe');
    assert.match(styles, /@container\s*\(min-width:\s*56rem\)[\s\S]*\.archive-tools-strip \.archive-tools-strip__wide\s*\{[^}]*display:\s*inline-flex/s);
    assert.match(styles, /\.archive-tools-strip \.archive-action\s*\{[^}]*white-space:\s*nowrap/s);
  });

  it('uses the pinned Lucide release name for the More tools icon', () => {
    assert.match(app, /\bMoreHorizontal\b/);
    assert.doesNotMatch(app, /import \{[^}]*\bEllipsis\b[^}]*\} from 'lucide-react'/,
      'lucide-react 0.292.0 does not export the later Ellipsis alias');
  });

  it('reuses the shared folder-tab silhouette on standalone archive labels', () => {
    const participate = read('features/participate/index.html');
    const participateCss = read('features/participate/styles.css');
    const method = read('features/winer-method/index.html');
    const methodScript = read('features/winer-method/script.js');
    const methodCss = read('features/winer-method/styles.css');

    assert.match(participate, /archive-folder-tab kicker/);
    assert.match(participate, /archive-folder-tab eyebrow/);
    assert.doesNotMatch(participateCss, /\.kicker[\s\S]*clip-path:\s*polygon/);

    assert.match(method, /design-system\/recipes\.css\?v=\d+\.\d+\.\d+/);
    assert.match(method, /archive-folder-tab kicker/);
    assert.match(method, /archive-folder-tab eyebrow/);
    assert.match(methodScript, /archive-folder-tab eyebrow/);
    assert.doesNotMatch(methodCss, /\.kicker,\s*\.eyebrow[^}]*clip-path/);
  });

  it('keeps the feature-audit harness aligned with the refreshed archive controls', () => {
    assert.match(auditHarness, /\.archive-results-count/);
    assert.match(auditHarness, /\.archive-error-state/);
    assert.match(auditHarness, /\.archive-record-card__body/);
    assert.match(mainAuditHarness, /\.archive-timeline__year:not\(:disabled\)/);
    assert.match(mainAuditHarness, /\.archive-timeline__clear/);
    assert.match(auditHarness, /window\.location\.hash === '#entities'/);
    assert.match(auditHarness, /document\.querySelector\('#entity-search'\)/);
    assert.doesNotMatch(auditHarness, /break-inside-avoid/);
    assert.doesNotMatch(mainAuditHarness, /main \.flex\.h-32/);
    assert.doesNotMatch(auditHarness, /\/records found\/\.test\(document\.body\.textContent\)/);
    assert.doesNotMatch(auditHarness, /Reset all filters\/\.test\(x\.textContent\)/);
    assert.doesNotMatch(auditHarness, /button\[title="Folder View"\]/);
    assert.doesNotMatch(auditHarness, /\/Reload Page\/\.test\(b\.textContent\)/);
  });

  it('keeps visible view labels inside their accessible names and documents all audit routes', () => {
    assert.match(app, /aria-label="Cards view"[\s\S]*>Cards</);
    assert.match(app, /aria-label="Folders view"[\s\S]*>Folders</);
    assert.match(read('CLAUDE.md'), /walks 41 route states/);
  });

  it('does not expose search-independent timeline counts during a text search', () => {
    assert.match(app, /currentRoute === ROUTES\.archive && !loading && !filters\.search[\s\S]*<\$\{Timeline\}/);
    assert.doesNotMatch(app, /searchActive=\$\{Boolean\(filters\.search\)\}/);
    assert.doesNotMatch(timeline, /searchActive/);
  });

  it('writes accumulated feature-audit verdicts before a fatal exit', () => {
    assert.match(mainAuditHarness, /run\(\)\.catch\(err => \{[\s\S]*writeMainVerdicts\(err\)/);
    assert.match(serviceAuditHarness, /main\(\)\.catch\(err => \{[\s\S]*writeServiceVerdicts\(err\)/);
    assert.match(
      mainAuditHarness,
      /finally\s*\{\s*await browser\.close\(\);\s*\}/,
      'MAIN audit failures must not leave Chromium running',
    );
  });

  it('returns focus to a stable filter control after Reset all removes itself', () => {
    assert.match(sidebar, /const searchInputRef = useRef\(null\)/);
    assert.match(sidebar, /const handleResetFilters = \(\) => \{[\s\S]*resetFilters\(\);[\s\S]*requestAnimationFrame\(\(\) => searchInputRef\.current\?\.focus\(\)\)/);
    assert.match(sidebar, /onClick=\$\{handleResetFilters\}>Reset all/);
    assert.match(sidebar, /id=\$\{searchInputId\}[\s\S]*ref=\$\{searchInputRef\}/);
  });

  it('puts archive work before secondary Read highlights', () => {
    const toolbarIndex = app.indexOf('className="archive-results-toolbar');
    const timelineIndex = app.indexOf('<${Timeline}');
    const resultsIndex = app.lastIndexOf('<${ArchiveResults}');
    const featuredIndex = app.indexOf('<${FeaturedSection}');
    assert.ok(toolbarIndex > 0);
    assert.ok(timelineIndex > toolbarIndex);
    assert.ok(resultsIndex > timelineIndex);
    assert.ok(featuredIndex > resultsIndex);
    assert.match(app, /archive-mobile-search/);
    assert.match(app, /archive-scope-token/);
  });

  it('keeps folder browsing focused on folders instead of default highlights', () => {
    assert.match(app, /currentRoute === ROUTES\.archive[\s\S]*<\$\{FeaturedSection\}/);
    assert.match(app, /currentRoute === ROUTES\.archive[\s\S]*<\$\{Timeline\}/);
    assert.match(app, /viewMode === 'grid'[\s\S]*archive-sort-control/);
    assert.match(app, /Records may appear in more than one folder/);
  });

  it('uses one current mobile highlight and restrained non-moving card hover', () => {
    assert.match(featured, /archive-featured__position/);
    assert.match(featured, /aria-label=\$\{`Read \$\{work\.title\}`\}/);
    assert.match(featured, /prefers-reduced-motion: reduce/);
    assert.match(featured, /aria-label="Previous featured work"/);
    assert.match(featured, /aria-label="Next featured work"/);
    assert.doesNotMatch(featured, /archive-featured__position" aria-live/);
    assert.match(styles, /@media \(max-width: 639px\)[\s\S]*\.archive-featured-card:not\(:first-child\)[\s\S]*display:\s*none/);
    assert.doesNotMatch(styles, /\.archive-record-card:hover,[\s\S]{0,300}transform:/);
    assert.doesNotMatch(styles, /\.archive-featured-card:hover,[\s\S]{0,300}transform:/);
  });

  it('preserves keyboard focus and native links across result interactions', () => {
    assert.match(results, /<a[\s\S]*canonicalRecordUrl\(window\.location\.href, item\.id\)[\s\S]*archive-record-card__body/);
    assert.match(styles, /\.archive-record-card__body:focus-visible[\s\S]*outline-offset:\s*-4px/);
    assert.match(app, /pendingScopeFocusKey/);
    assert.match(app, /className="sr-only" role="status" aria-live="polite"/);
    assert.match(sidebar, /inert=\$\{drawerIsInert \? '' : undefined\}/);
    assert.match(app, /ref=\$\{filterTriggerRef\}[\s\S]*aria-label="Open archive filters"/);
    assert.match(app, /const closeSidebar = useCallback[\s\S]*filterTriggerRef\.current\?\.focus/);
    assert.match(loading, /archive-loading-state__quote"[\s\S]*aria-hidden="true"/);
    assert.match(loading, /archive-loading-state__status" role="status" aria-live="polite"/);
    assert.doesNotMatch(loading, /archive-loading-state" role="status"/);
  });

  it('keeps discovery text on AA-safe semantic ink colors', () => {
    assert.match(styles, /\.archive-results-summary[\s\S]*color:\s*var\(--archive-ink-muted\)/);
    assert.match(styles, /\.archive-featured__description[\s\S]*color:\s*var\(--archive-ink-muted\)/);
    assert.match(styles, /\.archive-timeline__range[\s\S]*color:\s*var\(--archive-ink-muted\)/);
    assert.match(styles, /\.archive-filter-sidebar__hint[\s\S]*color:\s*var\(--archive-ink-muted\)/);
  });

  it('captures every required archive discovery state in the visual audit', () => {
    assert.match(audit, /slug: 'home-archive'[\s\S]*dismissWelcome: true/);
    assert.match(audit, /slug: 'archive-active-filters'[\s\S]*url: '\/\?q=[^']+'[\s\S]*screenshotResults: true/);
    assert.match(audit, /slug: 'archive-folders'[\s\S]*url: '\/#folders'[\s\S]*screenshotResults: true/);
    assert.match(audit, /slug: 'archive-empty-results'[\s\S]*url: '\/\?q=[^']+'[\s\S]*screenshotResults: true/);
    assert.match(audit, /slug: 'record-article'[\s\S]*url: '\/\?record=RECORD-00802'/);
    assert.match(audit, /route\.dismissWelcome[\s\S]*Dismiss Start here invitation/);
    assert.match(audit, /route\.screenshotResults[\s\S]*archive-results-toolbar[\s\S]*scrollIntoViewIfNeeded/);
  });

  it('waits for the intentional details warmup instead of racing its timer', () => {
    assert.match(audit, /expectedArchiveDetails\s*=\s*route\.archiveDetails === 'require'/);
    // The body, not the request. The parse and the re-render that follow the
    // response are the part that moves the layout, so treating the route as
    // ready when the request goes out books startup work as settled
    // instability on a slower machine (#772).
    assert.match(audit, /page\.waitForResponse\([\s\S]*archive-details\.json/);
    assert.match(audit, /response\.finished\(\)/);
    assert.match(audit, /await expectedArchiveDetails/);
  });
});
