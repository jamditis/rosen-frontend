import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const app = read('frontend/App.js');
const sidebar = read('frontend/components/Sidebar.js');
const timeline = read('frontend/components/Timeline.js');
const featured = read('frontend/components/FeaturedSection.js');
const results = read('frontend/components/ArchiveResults.js');
const river = read('frontend/components/RiverOfNews.js');
const loading = read('frontend/components/LoadingQuotes.js');
const styles = read('frontend/index.css');
const recipes = read('frontend/design-system/recipes.css');
const audit = read('scripts/preview-audit.js');

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
    assert.match(river, /archive-river__item/);
    assert.match(river, /role="button"[\s\S]*tabIndex="0"/);
    assert.match(loading, /archive-loading-state/);
    assert.match(styles, /\.archive-results-toolbar/);
    assert.match(styles, /\.archive-record-card/);
    assert.match(styles, /\.archive-folder-card/);
    assert.match(styles, /\.archive-empty-state/);
    assert.match(styles, /\.archive-river__item/);
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
    assert.match(audit, /slug: 'record-modal'[\s\S]*url: '\/\?record=RECORD-00802'/);
    assert.match(audit, /route\.dismissWelcome[\s\S]*Dismiss Start here invitation/);
    assert.match(audit, /route\.screenshotResults[\s\S]*archive-results-toolbar[\s\S]*scrollIntoViewIfNeeded/);
  });

  it('waits for the intentional details warmup instead of racing its timer', () => {
    assert.match(audit, /expectedArchiveDetailsRequest\s*=\s*route\.archiveDetails === 'require'/);
    assert.match(audit, /page\.waitForRequest\([\s\S]*archive-details\.json/);
    assert.match(audit, /await expectedArchiveDetailsRequest/);
  });
});
