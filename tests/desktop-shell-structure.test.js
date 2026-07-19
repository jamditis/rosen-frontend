import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const lazyShellImport = /lazy\(\(\)\s*=>\s*import\('\.\/desktop\/DesktopShell\.js\?v=\d+\.\d+\.\d+'\)\)/;

describe('desktop route wiring', () => {
  it('lazy-loads the optional shell behind an error boundary', () => {
    const app = read('frontend/App.js');
    assert.match(app, lazyShellImport);
    assert.match(app, /DesktopRouteErrorBoundary/);
    assert.match(app, /<\$\{Suspense\}/);
    assert.doesNotMatch(app, /^import .*DesktopShell/m);
  });

  it('does not fetch archive data for a cold desktop home deep link', () => {
    const app = read('frontend/App.js');
    assert.match(app, /NON_RECORD_ROUTES\s*=\s*new Set\([\s\S]*ROUTES\.desktop/);
    assert.match(app, /DESKTOP_RECORD_APPS\s*=\s*new Set\(\['archive', 'folders', 'entities', 'start', 'findings'\]\)/);
    assert.match(app, /NON_RECORD_ROUTES\.has\(currentRoute\)\s*&&\s*!desktopNeedsRecords\) return/);
  });

  it('keeps desktop-only assets out of standard-route eager loading and service-worker install', () => {
    const app = read('frontend/App.js');
    const index = read('index.html');
    const worker = read('frontend/sw.js');
    const installManifest = worker.slice(worker.indexOf('const STATIC_ASSETS'), worker.indexOf('const DATA_URLS'));

    assert.match(app, lazyShellImport);
    assert.doesNotMatch(index, /DesktopShell|desktopRegistry|desktop\.css/);
    assert.doesNotMatch(installManifest, /DesktopShell|desktopRegistry|desktop\.css/);
  });

  it('offers the desktop from Start here and Tools', () => {
    const start = read('frontend/components/StartHerePage.js');
    const tools = read('frontend/components/ToolsModal.js');
    assert.match(start, /Explore the archive desktop/);
    assert.match(start, /navigate\('desktop'\)/);
    assert.match(tools, /id: 'desktop'/);
    assert.match(tools, /action: 'desktop'/);
  });

  it('adds the desktop route to preview audit at mobile, tablet, and desktop sizes', () => {
    const audit = read('scripts/preview-audit.js');
    assert.match(audit, /slug: 'archive-desktop',\s+url: '\/#desktop'/);
    assert.match(audit, /slug: 'desktop-unknown',\s+url: '\/#desktop\/not-real'/);
    assert.match(audit, /slug: 'desktop-archive',\s+url: '\/#desktop\/archive'/);
    assert.match(audit, /slug: 'desktop-start',\s+url: '\/#desktop\/start'/);
    assert.match(audit, /slug: 'desktop-findings',\s+url: '\/#desktop\/findings'/);
    assert.match(audit, /slug: 'desktop-entities',\s+url: '\/#desktop\/entities'/);
    assert.match(audit, /slug: 'desktop-dissertation',\s+url: '\/#desktop\/dissertation'/);
    assert.match(audit, /slug: 'desktop-analytics',\s+url: '\/#desktop\/analytics'/);
    assert.match(audit, /slug: 'desktop-readme',\s+url: '\/#desktop\/readme'/);
    assert.match(audit, /slug: 'desktop-tools',\s+url: '\/#desktop\/tools'/);
    assert.match(audit, /slug: 'desktop-record-modal',\s+url: '\/\?record=RECORD-00802#desktop\/archive'/);
    assert.match(audit, /slug: 'desktop-report',[\s\S]*openReport: true/);
    assert.match(audit, /getByRole\('dialog', \{ name: 'Report a problem or suggest a record' \}\)/);
    assert.match(audit, /slug: 'desktop-windowing'[\s\S]*desktopLayout:[\s\S]*zOrder/);
    assert.match(audit, /name: 'mobile',\s+width: 375,\s+height: 812/);
    assert.match(audit, /name: 'tablet',\s+width: 768,\s+height: 1024/);
    assert.match(audit, /name: 'desktop',\s+width: 1440,\s+height: 900/);
    assert.match(audit, /PREVIEW_AUDIT_VIEWPORT/,
      'the complete audit can be sharded by viewport without reducing route coverage');
  });
});

describe('desktop archive adapter', () => {
  it('reuses canonical App state and the shared result renderer', () => {
    const app = read('frontend/App.js');
    const panel = read('frontend/desktop/DesktopArchivePanel.js');
    assert.match(app, /<\$\{ArchiveResults\}/, 'standard archive uses shared results');
    assert.match(panel, /<\$\{ArchiveResults\}/, 'desktop adapter uses shared results');
    assert.match(app, /archiveView=\$\{desktopArchiveView\}/);
    assert.match(app, /desktopActiveNeedsRecords \? recordView : null/,
      'desktop record reading uses the canonical RecordView overlay');
  });

  it('loads the corpus only for real desktop record apps', () => {
    const app = read('frontend/App.js');
    const desktopFiles = [
      read('frontend/desktop/DesktopShell.js'),
      read('frontend/desktop/DesktopArchivePanel.js'),
      read('frontend/desktop/desktopRegistry.js'),
    ].join('\n');
    assert.match(app, /DESKTOP_RECORD_APPS\.has\(desktopAppId\)/);
    assert.doesNotMatch(desktopFiles, /fetchCoreData|archive-core\.json|archive-data\.json/,
      'desktop components must not fetch or copy the archive corpus');
  });

  it('keeps archive search, folders, filters, record details, and standard escape live', () => {
    const panel = read('frontend/desktop/DesktopArchivePanel.js');
    const sidebar = read('frontend/components/Sidebar.js');
    assert.match(sidebar, /Search archive/);
    assert.match(sidebar, /FilterPanelTag = embedded \? 'div' : 'aside'/,
      'the embedded filter panel must not nest a complementary landmark in a window region');
    assert.match(panel, /onSetViewMode\('folder'\)/);
    assert.match(panel, /<\$\{Sidebar\}/);
    assert.match(panel, /onSelectRecord=\$\{onSelectRecord\}/);
    assert.match(panel, /Open standard view/);
    assert.match(panel, /requestAnimationFrame\(\(\) => \{[\s\S]*requestAnimationFrame\(\(\) => \{[\s\S]*desktop-archive-search/,
      'drawer focus waits until the newly visible panel has painted');
    assert.match(panel, /matchMedia\('\(max-width: 1100px\)'\)\.matches/,
      'Escape only closes the filters while they are an overlay drawer');
  });

  it('serializes desktop filters and records through the canonical view state', () => {
    const app = read('frontend/App.js');
    assert.match(app, /parseViewState\(window\.location\.href\)\.filters/);
    assert.match(app, /viewStateToUrl\(\{[\s\S]*route:\s*ROUTES\.desktop/);
    assert.match(app, /routeParams:\s*\{\s*desktopAppId\s*\}/);
    assert.match(app, /selectedRecord:\s*selectedRecordId/);
  });
});

describe('desktop entity adapter', () => {
  it('reuses the canonical entity browser and App-owned record state', () => {
    const app = read('frontend/App.js');
    const panel = read('frontend/desktop/DesktopEntityPanel.js');
    assert.match(panel, /<\$\{EntityBrowser\}/);
    assert.match(app, /entityView=\$\{desktopEntityView\}/);
    assert.match(app, /records:\s*queryRecords/);
    assert.match(app, /desktopActiveNeedsRecords \? recordView : null/,
      'entity records open in the canonical RecordView overlay');
  });

  it('does not fetch or copy entity and archive data inside desktop modules', () => {
    const desktopFiles = [
      read('frontend/desktop/DesktopShell.js'),
      read('frontend/desktop/DesktopEntityPanel.js'),
      read('frontend/desktop/desktopRegistry.js'),
    ].join('\n');
    assert.doesNotMatch(
      desktopFiles,
      /fetchCoreData|fetchEntitiesData|archive-core\.json|archive-entities\.json/,
      'the desktop adapter receives the canonical App-owned data',
    );
  });

  it('keeps entity exploration, record selection, and the standard escape live', () => {
    const panel = read('frontend/desktop/DesktopEntityPanel.js');
    assert.match(panel, /records=\$\{records\}/);
    assert.match(panel, /onSelectRecord=\$\{onSelectRecord\}/);
    assert.match(panel, /Open standard view/);
  });
});

describe('desktop research adapters', () => {
  it('embeds the canonical dissertation map and analytics dashboard', () => {
    const dissertation = read('frontend/desktop/DesktopDissertationPanel.js');
    const analytics = read('frontend/desktop/DesktopAnalyticsPanel.js');
    const dissertationPage = read('frontend/components/DissertationPage.js');
    const analyticsDashboard = read('frontend/components/AnalyticsDashboard.js');

    assert.match(dissertation, /<\$\{DissertationPage\}\s+embedded=\$\{true\}/);
    assert.match(analytics, /<\$\{AnalyticsDashboard\}[\s\S]*embedded=\$\{true\}/);
    assert.match(dissertationPage, /embedded\s*=\s*false/);
    assert.match(analyticsDashboard, /embedded\s*=\s*false/);
  });

  it('keeps aggregate queries in the desktop and offers standard-view exits', () => {
    const app = read('frontend/App.js');
    const dissertation = read('frontend/desktop/DesktopDissertationPanel.js');
    const analytics = read('frontend/desktop/DesktopAnalyticsPanel.js');

    assert.match(app, /handleDesktopQueryResults[\s\S]*navigateToDesktop\('archive'\)/);
    assert.match(app, /analyticsView=\$\{desktopAnalyticsView\}/);
    assert.match(app, /dissertationView=\$\{desktopDissertationView\}/);
    assert.match(dissertation, /Open standard view/);
    assert.match(analytics, /Open standard view/);
  });

  it('keeps mind-map keyboard shortcuts local and exposes its nodes to the keyboard', () => {
    const map = read('frontend/components/MindMap.js');
    const dissertationPage = read('frontend/components/DissertationPage.js');
    assert.match(map, /containerRef\.current\?\.contains\(document\.activeElement\)/);
    assert.match(map, /role="button"/);
    assert.match(map, /tabIndex="0"/);
    assert.match(map, /e\.key === 'Enter' \|\| e\.key === ' '/);
    assert.match(map, /role="region"/);
    assert.doesNotMatch(map, /role="application"/);
    assert.match(dissertationPage, /minimumZoom=\$\{embedded \? 44 \/ 72 : 0\.3\}/);
    assert.match(dissertationPage, /aria-label="Back to archive"/,
      'the standard mobile back button keeps its name when its visible label is hidden');
    assert.match(map, /Math\.max\(\s*safeMinimumZoom,\s*Math\.min\(scaleX, scaleY/);
    assert.match(map, /prefers-reduced-motion: reduce/);
    assert.match(map, /if \(reduceMotion \|\| duration <= 0\)/);
  });
});

describe('desktop guided-path adapter', () => {
  it('reuses the canonical Start here component and exported selected-record trail', () => {
    const app = read('frontend/App.js');
    const startPage = read('frontend/components/StartHerePage.js');
    const panel = read('frontend/desktop/DesktopStartPanel.js');

    assert.match(startPage, /export const SelectedFindings/);
    assert.match(startPage, /embedded\s*=\s*false/);
    assert.match(panel, /<\$\{StartHerePage\}[\s\S]*embedded=\$\{true\}/);
    assert.match(panel, /<\$\{SelectedFindings\}/);
    assert.match(startPage, /start-here-path-grid/);
    assert.match(startPage, /selected-findings-grid/);
    assert.match(app, /startView=\$\{desktopStartView\}/);
    assert.match(app, /records,\s*\n\s*onNavigate:\s*handleDesktopGuideNavigate/);
  });

  it('keeps guide navigation in shell and opens records in the canonical overlay', () => {
    const app = read('frontend/App.js');
    const panel = read('frontend/desktop/DesktopStartPanel.js');

    assert.match(app, /DESKTOP_GUIDED_SHELL_DESTINATIONS\.has\(destination\)[\s\S]*navigateToDesktop\(destination\)/);
    assert.match(app, /onSelectRecord:\s*selectRecord/);
    assert.match(app, /desktopActiveNeedsRecords \? recordView : null/);
    assert.match(panel, /onOpenStandard/);
    assert.match(panel, /onOpenBugReport=\$\{onOpenBugReport\}/);
  });
});

describe('desktop windowing and spatial memory', () => {
  it('uses the versioned state model for concurrent windows and safe persistence', () => {
    const shell = read('frontend/desktop/DesktopShell.js');
    const state = read('frontend/desktop/desktopWindowState.js');
    assert.match(shell, /desktopWindowState\.js\?v=\d+\.\d+\.\d+/);
    assert.match(shell, /activateDesktopWindow/);
    assert.match(shell, /minimizeDesktopWindow/);
    assert.match(shell, /closeDesktopWindow/);
    assert.match(shell, /DESKTOP_LAYOUT_STORAGE_KEY/);
    assert.match(
      shell,
      /if \(layout\.windows\.length === 0\) \{\s*localStorage\.removeItem\(DESKTOP_LAYOUT_STORAGE_KEY\);\s*return;/,
      'an empty or reset layout must clear persistence instead of recreating an empty envelope',
    );
    assert.match(state, /DESKTOP_LAYOUT_SCHEMA\s*=\s*1/);
    assert.match(state, /candidate\.schema !== DESKTOP_LAYOUT_SCHEMA/);
  });

  it('renders named non-modal windows, active state, task buttons, and reset controls', () => {
    const shell = read('frontend/desktop/DesktopShell.js');
    assert.match(shell, /className="desktop-window-stack"/);
    assert.match(shell, /role="region"/);
    assert.match(shell, /desktop-active-window-label/);
    assert.match(shell, /onFocusCapture/);
    assert.match(shell, /activeWindow\?\.contains\(document\.activeElement\)/);
    assert.match(shell, /pointerWindowControlRef/,
      'pointer title-bar actions must not be consumed by background-window activation');
    assert.match(shell, /windowTitleRefs\.current\[shellApp\?\.id \|\| 'home'\]\?\.focus/,
      'closing or minimizing a background window must recover focus in the active surface');
    assert.match(shell, /Minimize \$\{windowTitle\}/);
    assert.match(shell, /aria-label="Open desktop windows"/);
    assert.match(shell, /Reset desktop layout/);
    assert.doesNotMatch(shell, /role="dialog"|aria-modal/);
  });

  it('loads data for visible restored record apps but keeps record overlays URL-active', () => {
    const app = read('frontend/App.js');
    assert.match(app, /desktopOpenAppIds\.some\(\(appId\) => DESKTOP_RECORD_APPS\.has\(appId\)\)/);
    assert.match(app, /onOpenAppsChange=\$\{setDesktopOpenAppIds\}/);
    assert.match(app, /desktopActiveNeedsRecords \? recordView : null/);
  });

  it('collapses to one active full-width window on narrow screens', () => {
    const css = read('frontend/desktop/desktop.css');
    assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.desktop-window\s*\{[\s\S]*display:\s*none/);
    assert.match(css, /\.desktop-window\.is-active\s*\{\s*display:\s*block/);
    assert.match(css, /\.desktop-task-window-list[\s\S]*overflow-x:\s*auto/);
    assert.match(css, /@media \(max-width: 420px\)[\s\S]*\.desktop-standard-button span[\s\S]*white-space:\s*normal/);
    assert.match(css, /\.desktop-start-button,\s*\.desktop-standard-button\s*\{\s*flex:\s*0 0 auto/);
  });
});

describe('desktop interaction structure', () => {
  it('implements roving shortcut focus and conventional keyboard activation', () => {
    const shell = read('frontend/desktop/DesktopShell.js');
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']) {
      assert.match(shell, new RegExp(`['"]${key}['"]`));
    }
    assert.match(shell, /tabIndex=\$\{index === shortcutFocusIndex \? 0 : -1\}/);
    assert.match(shell, /event\.key === 'Enter' \|\| event\.key === ' '/);
  });

  it('uses named non-modal windows and a keyboard-managed Start menu', () => {
    const shell = read('frontend/desktop/DesktopShell.js');
    assert.match(shell, /<main id="main-content"/);
    assert.match(shell, /role="menu"/);
    assert.match(shell, /role="menuitem"/);
    assert.match(shell, /aria-haspopup="menu"/);
    assert.match(shell, /aria-expanded=\$\{startOpen\}/);
    assert.match(shell, /tabIndex=\$\{index === menuFocusIndex \? 0 : -1\}/);
    assert.match(shell, /setMenuFocusIndex\(nextIndex\)/);
    assert.match(shell, /event\.key === 'Escape'/);
    assert.match(shell, /role="region"/);
    assert.doesNotMatch(shell, /aria-modal/);
  });

  it('keeps a visible standard-view escape and useful unknown-app fallback', () => {
    const shell = read('frontend/desktop/DesktopShell.js');
    assert.match(shell, /Standard archive/);
    assert.match(shell, /That desktop item is unavailable/);
    assert.match(shell, /className="desktop-notice" role="note"/);
    assert.doesNotMatch(shell, /className="desktop-notice" role="status"/,
      'the visible note must not duplicate the dedicated live-region announcement');
    assert.match(shell, /aria-live="polite" aria-atomic="true"/);
    assert.match(shell, /onExit/);
  });

  it('defines touch, responsive, safe-area, and reduced-motion behavior', () => {
    const css = read('frontend/desktop/desktop.css');
    assert.match(css, /min-width:\s*44px/);
    assert.match(css, /min-height:\s*44px/);
    assert.match(css, /@media\s*\(max-width:\s*700px\)/);
    assert.match(css, /env\(safe-area-inset-bottom/);
    assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    const archivePanel = read('frontend/desktop/DesktopArchivePanel.js');
    assert.match(archivePanel, /prefers-reduced-motion: reduce/);
    assert.match(archivePanel, /behavior:\s*reduceMotion \? 'auto' : 'smooth'/);
    assert.match(css, /@media\s*\(forced-colors:\s*active\)[\s\S]*\.desktop-wallpaper-mark\s*\{\s*display:\s*none/);
    assert.match(css, /\.desktop-brand,[\s\S]*\.desktop-shortcut-mode\s*\{[\s\S]*color:\s*CanvasText/);
    assert.match(css, /\.desktop-menu-item:hover small,[\s\S]*color:\s*CanvasText/);
    assert.match(css, /overflow-x:\s*hidden/);
    assert.match(css, /desktop-filter-panel label\.flex[\s\S]*min-height:\s*44px/);
    assert.match(css, /Previous results page[\s\S]*min-width:\s*44px/);
    assert.match(css, /desktop-canonical-surface button[\s\S]*min-width:\s*44px/);
    assert.match(css, /@container\s*\(min-width:\s*42rem\)[\s\S]*selected-findings-grid/);
  });
});
