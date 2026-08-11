import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const app = read('frontend/App.js');
const styles = read('frontend/index.css');
const startHere = read('frontend/components/StartHerePage.js');
const about = read('frontend/components/AboutPage.js');
const tools = read('frontend/components/ToolsModal.js');
const report = read('frontend/components/BugReportModal.js');
const welcome = read('frontend/components/WelcomeModal.js');
const announcement = read('frontend/components/WorkInProgressBanner.js');
const worker = read('frontend/sw.js');
const desktopStyles = read('frontend/desktop/desktop.css');

describe('global shell visual-system refresh', () => {
  it('uses one archive-specific route header on orientation pages', () => {
    const routeHeader = read('frontend/components/ArchiveRouteHeader.js');

    assert.match(routeHeader, /const ArchiveRouteHeader/);
    assert.match(routeHeader, /archive-route-header/);
    assert.match(routeHeader, /archive-route-header__nav/);
    assert.match(routeHeader, /Jay Rosen's Internet Archive/);
    assert.match(routeHeader, /Back to archive/);
    assert.match(startHere, /<\$\{ArchiveRouteHeader\}/);
    assert.match(about, /<\$\{ArchiveRouteHeader\}/);
    assert.match(worker, /'components\/ArchiveRouteHeader\.js'/);
  });

  it('gives the standard archive shell a shared paper-and-ink grammar', () => {
    assert.match(app, /min-h-screen flex flex-col archive-canvas/);
    assert.match(app, /archive-site-header/);
    assert.match(app, /archive-site-header__tools/);
    assert.match(app, /archive-site-header__about/);
    assert.match(app, /archive-site-header__filter/);
    assert.match(app, /archive-tools-strip/);
    assert.match(app, /archive-site-footer/);
    assert.match(styles, /\.archive-site-header/);
    assert.match(styles, /\.archive-route-header__nav\s*\{[\s\S]*min-height:\s*4rem/);
    assert.match(styles, /@media \(min-width: 640px\)[\s\S]*\.archive-site-header \.archive-site-header__tools\s*\{[\s\S]*display:\s*none/);
    assert.match(styles, /@media \(min-width: 768px\)[\s\S]*\.archive-site-header \.archive-site-header__about\s*\{[\s\S]*display:\s*inline-flex/);
    assert.match(styles, /@media \(min-width: 768px\)[\s\S]*\.archive-site-header__credit\s*\{[\s\S]*display:\s*inline-flex/);
    assert.doesNotMatch(app, /archive-site-header__credit[^"\n]*md:inline-flex/);
    assert.match(styles, /\.archive-site-header__filter\s*\{[\s\S]*width:\s*var\(--archive-target-min\)/);
    assert.match(styles, /\.archive-tools-strip/);
    assert.match(styles, /\.archive-tools-strip \.archive-action\s*\{[\s\S]*min-block-size:\s*var\(--archive-target-min\)/);
    assert.match(styles, /\.archive-site-footer/);
  });

  it('keeps the footer navigation compact without undersized link targets', () => {
    const footerLinkRule = styles.match(/\.archive-site-footer__link\s*\{([^}]*)\}/)?.[1] || '';
    const backToTopRule = styles.match(/\.archive-back-to-top\s*\{([^}]*)\}/)?.[1] || '';

    assert.match(app, /archive-site-footer__links/);
    assert.doesNotMatch(app, /archive-site-footer__links[^>]*space-y-1/);
    assert.match(
      styles,
      /\.archive-site-footer__links\s*\{[\s\S]*display:\s*grid/,
    );
    assert.match(
      styles,
      /@media \(min-width:\s*360px\)[\s\S]*\.archive-site-footer__links\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    );
    assert.match(app, /grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8/);
    assert.match(
      footerLinkRule,
      /min-height:\s*2rem/,
    );
    assert.doesNotMatch(
      footerLinkRule,
      /min-height:\s*var\(--archive-target-min\)/,
    );
    assert.match(app, /archive-back-to-top/);
    assert.match(backToTopRule, /right:\s*1\.5rem/);
    assert.match(backToTopRule, /left:\s*auto/);
  });

  it('migrates orientation actions, panels, and statistics to recipes', () => {
    assert.match(startHere, /archive-action archive-action--primary/);
    assert.match(startHere, /archive-action archive-action--secondary/);
    assert.match(startHere, /archive-panel/);
    assert.match(about, /archive-panel archive-panel--accent/);
    assert.match(about, /archive-stat/);
    assert.match(about, /archive-action archive-action--primary/);
    assert.match(about, /archive-action archive-action--secondary/);
    assert.match(desktopStyles, /\.desktop-guided-panel \.archive-action--primary\s*\{[\s\S]*color:\s*var\(--archive-on-dark\)/);
  });

  it('uses the same dialog, panel, notice, and action recipes for global overlays', () => {
    assert.match(tools, /archive-tools-dialog-backdrop archive-dialog-backdrop/);
    assert.match(tools, /archive-dialog/);
    assert.match(tools, /archive-tool-card/);
    assert.match(tools, /archive-tools-dialog__notice[\s\S]*text-xs text-stone-700 text-center/);
    assert.match(report, /archive-dialog-backdrop/);
    assert.match(styles, /\.archive-tools-dialog-backdrop\.archive-dialog-backdrop,[\s\S]*\.archive-report-dialog\.archive-dialog-backdrop\s*\{[\s\S]*z-index:\s*100/);
    assert.match(report, /archive-dialog/);
    assert.match(styles, /\.archive-dialog\.archive-report-dialog__panel\s*\{[\s\S]*padding:\s*0/);
    assert.match(welcome, /archive-panel archive-panel--accent/);
    assert.match(styles, /\.archive-panel\.archive-welcome-panel\s*\{[\s\S]*position:\s*fixed/);
    assert.match(welcome, /archive-action archive-action--primary/);
    assert.match(announcement, /archive-notice/);
  });
});
