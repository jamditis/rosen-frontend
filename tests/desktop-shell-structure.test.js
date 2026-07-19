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

  it('defers full details outside desktop Archive and Folders', () => {
    const app = read('frontend/App.js');
    const coreLoadEffect = app.slice(
      app.indexOf('// Load Data'),
      app.indexOf('// Preserve the standard archive'),
    );

    assert.match(app, /DESKTOP_DETAILS_PRELOAD_APPS\s*=\s*new Set\(\['archive', 'folders'\]\)/);
    assert.match(app, /desktopOpenAppIds\.some\(\(appId\) => DESKTOP_DETAILS_PRELOAD_APPS\.has\(appId\)\)/);
    assert.match(app, /currentRoute !== ROUTES\.desktop\s*\|\| desktopNeedsDetailsPreload/);
    assert.match(app, /if \(!records\.length \|\| !detailsPreloadEnabled\) return undefined/);
    assert.match(app, /const timer = setTimeout\(\(\) => preloadDetails\(\), 1000\)/);
    assert.match(app, /return \(\) => clearTimeout\(timer\)/);
    assert.doesNotMatch(coreLoadEffect, /preloadDetails/,
      'the core fetch promise must not unconditionally warm the full details corpus');
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
    const shell = read('frontend/desktop/DesktopShell.js');
    const auditSlugs = [...audit.matchAll(/\bslug: '([^']+)'/g)].map((match) => match[1]);
    const desktopAuditSlugs = auditSlugs.filter((slug) => (
      slug === 'archive-desktop' || slug.startsWith('desktop-')
    ));
    assert.equal(auditSlugs.length, 32, 'the review handoff expects 32 routes per viewport');
    assert.equal(new Set(auditSlugs).size, auditSlugs.length, 'audit route slugs must stay unique');
    assert.equal(desktopAuditSlugs.length, 17, 'the review handoff expects 17 desktop rows per viewport');
    assert.match(audit, /slug: 'start-here',[\s\S]*verifyDesktopEntry: true/,
      'the optional Start-here entry must be a real keyboard/history audit path');
    assert.match(audit, /'Desktop home after Start here entry'[\s\S]*page\.url\(\) !== sourceUrl[\s\S]*'Start here heading after desktop entry Back'/,
      'desktop entry and browser Back must visibly focus both ends of the round trip');
    assert.match(audit, /slug: 'archive-desktop',[\s\S]*url: '\/#desktop',[\s\S]*verifyStartPathRoundTrip: true/);
    assert.match(audit, /slug: 'desktop-start-menu',[\s\S]*verifyDesktopStartMenu: true/);
    assert.match(audit, /slug: 'desktop-unknown',\s+url: '\/#desktop\/not-real'/);
    assert.match(audit, /slug: 'desktop-archive',[\s\S]*url: '\/#desktop\/archive',[\s\S]*verifyStandardExit:[\s\S]*appId: 'archive'/);
    assert.match(audit, /slug: 'desktop-folders',[\s\S]*url: '\/#desktop\/folders',[\s\S]*verifyStandardExit:[\s\S]*appId: 'folders'/);
    assert.match(audit, /slug: 'desktop-start',[\s\S]*url: '\/#desktop\/start',[\s\S]*verifyStandardExit:[\s\S]*appId: 'start'/);
    assert.match(audit, /slug: 'desktop-findings',[\s\S]*url: '\/#desktop\/findings',[\s\S]*verifyStandardExit:[\s\S]*appId: 'findings'/);
    assert.match(audit, /slug: 'desktop-start',\s+url: '\/#desktop\/start',\s+archiveDetails: 'forbid'/,
      'guided desktop routes must permanently reject the full-details warmup');
    assert.match(audit, /slug: 'desktop-findings',\s+url: '\/#desktop\/findings',\s+archiveDetails: 'forbid'/);
    assert.match(audit, /buttonName: 'Open standard Start here'/,
      'the focused findings view must use its actual standard-view action name');
    assert.match(audit, /slug: 'desktop-entities',[\s\S]*url: '\/#desktop\/entities',[\s\S]*verifyStandardExit:[\s\S]*appId: 'entities'/);
    assert.match(audit, /slug: 'desktop-entities',\s+url: '\/#desktop\/entities',\s+archiveDetails: 'forbid'/,
      'entity browsing must load its index without warming every record detail');
    assert.match(audit, /slug: 'desktop-archive',\s+url: '\/#desktop\/archive',\s+archiveDetails: 'require'/,
      'the canonical browsing surface must retain its deliberate warmup');
    assert.match(audit, /archiveDetailsRequests\.length !== 1/,
      'the browser audit must enforce both the deferral and single-request contracts');
    assert.match(audit, /slug: 'desktop-entity-detail',\s+url: '\/\?entity=P0005#desktop\/entities'/);
    assert.match(audit, /slug: 'desktop-entity-record',[\s\S]*url: '\/\?record=RECORD-00903&entity=P0005#desktop\/entities',[\s\S]*verifyEntityRecordFlow: true/);
    assert.match(audit, /slug: 'desktop-entity-record',\s+url: '\/\?record=RECORD-00903&entity=P0005#desktop\/entities',\s+archiveDetails: 'require'/,
      'a record opened on a deferred entity surface must still load its details once on demand');
    assert.match(audit, /slug: 'desktop-dissertation',[\s\S]*url: '\/#desktop\/dissertation',[\s\S]*verifyStandardExit:[\s\S]*appId: 'dissertation'/);
    assert.match(audit, /slug: 'desktop-analytics',[\s\S]*url: '\/#desktop\/analytics',[\s\S]*verifyStandardExit:[\s\S]*appId: 'analytics'/);
    assert.match(audit, /slug: 'desktop-readme',\s+url: '\/#desktop\/readme'/);
    assert.match(audit, /slug: 'desktop-tools',[\s\S]*url: '\/#desktop\/tools',[\s\S]*verifyToolRoundTrip: true/);
    assert.match(audit, /slug: 'desktop-record-modal',\s+url: '\/\?record=RECORD-00802#desktop\/archive'/);
    assert.match(audit, /slug: 'entity-detail',\s+url: '\/\?entity=P0005#entities'/);
    assert.match(audit, /slug: 'entity-record',[\s\S]*url: '\/\?record=RECORD-00903&entity=P0005#entities',[\s\S]*verifyEntityRecordFlow: true/);
    assert.match(audit, /slug: 'desktop-report',[\s\S]*openReport: true/);
    assert.match(audit, /slug: 'dissertation-map-detail',[\s\S]*openDissertationDetail: true/,
      'the shared keyboard-scrollable detail panel stays in the full audit matrix');
    assert.match(audit, /slug: 'dissertation-reader',[\s\S]*verifyReaderReturn: true/);
    assert.match(audit, /getByRole\('dialog', \{ name: 'Report a problem or suggest a record' \}\)/);
    assert.match(shell, /const openApp = \(app, source = 'desktop'\)[\s\S]*source === 'start-menu'[\s\S]*startButtonRef\.current\?\.focus[\s\S]*onOpenBugReport\?\.\(\)/,
      'the disappearing report menu item must hand focus to a durable modal return target');
    assert.match(shell, /onClick=\$\{\(\) => openApp\(app, 'start-menu'\)\}/,
      'Start menu launches must identify their transient trigger source');
    assert.match(audit, /'Report shortcut after dialog close'[\s\S]*getByRole\('menuitem', \{ name: \/\^Report a problem\/[\s\S]*'Report field after Start menu launch'/,
      'the report audit must exercise both the stable shortcut and unmounted Start-menu trigger');
    assert.match(audit, /'Start button after Start menu report close'[\s\S]*assertVisibleFocusOutline\(startButton/,
      'closing a report launched from Start must return visible focus to Start');
    assert.match(audit, /assertFocused\(dialogClose, 'Direct record dialog'\)/);
    assert.match(audit, /assertFocused\(page\.locator\('#entity-detail-title'\), 'Selected entity after direct record close'\)/);
    assert.match(audit, /assertFocused\(recordOpener, 'Entity record opener after ordinary close'\)/);
    assert.match(audit, /menuItemCount !== 15/,
      'the complete Start menu is exercised as an open accessibility state');
    assert.match(audit, /assertFocused\(startButton, 'Start button after Escape'\)/);
    assert.match(audit, /const toolsRegion = page\.getByRole\('region', \{ name: 'Tools' \}\);[\s\S]*await toolsRegion\.waitFor\(\)/,
      'the Start audit proves a real in-shell destination launches');
    assert.match(audit, /assertFocused\(startButton, 'Start button after forward Tab'\)/);
    assert.match(audit, /'First Start menu destination before reverse Tab'/,
      'the reverse-Tab probe waits for the popup focus frame instead of racing it');
    assert.match(audit, /'Previous visible tool after reverse Tab'/,
      'the Start audit proves Tab exits do not strand focus in an unmounted menu');
    assert.match(audit, /assertArchiveRootReturn\([\s\S]*'Method return'/,
      'the Start path round-trip keeps the JavaScript launcher and explicit exit live');
    assert.match(shell, /rowStart = Math\.floor\(index \/ columns\) \* columns[\s\S]*Math\.min\(rowEnd, index \+ 1\)[\s\S]*index \+ columns <= lastIndex/,
      'shortcut arrows must follow the visible row and column instead of jumping diagonally at edges');
    assert.match(audit, /'Right edge of the first desktop row'[\s\S]*'Left edge of the second desktop row'[\s\S]*'Bottom edge of the desktop shortcut column'/,
      'the rendered shortcut audit must pin spatial edge behavior');
    assert.match(audit, /'Desktop home after method browser Back'/,
      'browser Back must reconstruct the desktop home with the popup closed');
    assert.match(audit, /'About heading after Start navigation'/,
      'an in-document Start launch must announce its canonical route destination');
    assert.match(audit, /assertVisibleFocusOutline\(aboutHeading, 'About heading after keyboard Start navigation'\)/,
      'the route-entry contract must remain visibly focused for keyboard users');
    assert.match(audit, /'Desktop home after about browser Back'/,
      'Back from a canonical route must reconstruct desktop focus and closed-popup state');
    assert.match(audit, /assertArchiveRootReturn\([\s\S]*'Participate return'/,
      'the approved participation path must retain an explicit archive-root exit');
    assert.match(audit, /'Desktop home after participate browser Back'/,
      'browser Back from Participate must reconstruct desktop focus and closed-popup state');
    assert.match(audit, /buttonName = 'Open standard view'[\s\S]*standardExit\.focus\(\)[\s\S]*keyboard\.press\('Enter'\)[\s\S]*page\.url\(\) !== desktopUrl/,
      'canonical adapter exits must round-trip their exact desktop URL');
    assert.match(audit, /assertVisibleFocusOutline\(standardFocusTarget, focusLabel\)/,
      'every keyboard-activated canonical exit must expose a visible destination focus ring');
    assert.match(audit, /`#desktop-window-title-\$\{appId\}`/,
      'Back from standard view must restore focus to the active desktop window');
    assert.match(audit, /assertArchiveRootReturn\([\s\S]*'Dissertation return'/,
      'the tool round-trip audit keeps the standalone return touch-sized');
    assert.match(audit, /assertFocused\(page\.locator\('#desktop-window-title-tools'\), 'Tools window after browser Back'\)/,
      'browser Back must reconstruct the nested Tools route and foreground focus');
    assert.match(audit, /assertArchiveRootReturn\(page, readerReturn, 'Reader return'\)/);
    assert.match(audit, /Reader overflowed the viewport by/);
    assert.match(audit, /route\.slug === 'archive-desktop' \|\| route\.slug\.startsWith\('desktop-'\)[\s\S]*interactiveSelector[\s\S]*width < 44 \|\| height < 44/,
      'every rendered desktop row must enforce the 44-pixel target contract');
    assert.match(audit, /undersized desktop targets/);
    assert.match(audit, /desktopOverflow[\s\S]*overflowed the viewport by/,
      'every rendered desktop row must fail on horizontal page overflow');
    assert.match(audit, /page\.on\('pageerror', capturePageError\)[\s\S]*Unhandled page errors:[\s\S]*page\.off\('pageerror', capturePageError\)/,
      'each audit row must fail on unhandled JavaScript errors without leaking listeners');
    assert.match(audit, /url\.origin === BASE && response\.status\(\) >= 400[\s\S]*Same-origin network errors:/,
      'missing local runtime assets must fail their route instead of looking partially successful');
    assert.match(audit, /setApplicationNetworkCapture\(false\);[\s\S]*new AxeBuilder[\s\S]*finally \{[\s\S]*setApplicationNetworkCapture\(true\)/,
      'application network capture must pause only while axe issues synthetic CSS requests');
    assert.match(audit, /setApplicationNetworkCapture\(true\);[\s\S]*route\.verifyEntityRecordFlow/,
      'network capture must resume for interaction checks that run after accessibility analysis');
    assert.match(audit, /if \(!captureApplicationNetwork\) return;/,
      'route network listeners must ignore only the explicitly paused instrumentation phase');
    assert.match(audit, /page\.off\('response', captureBadResponse\)[\s\S]*page\.off\('requestfailed', captureFailedRequest\)/,
      'route-scoped network listeners must not leak into later rows');
    assert.match(audit, /slug: 'desktop-windowing'[\s\S]*verifyDesktopWindowHistory: true[\s\S]*desktopLayout:[\s\S]*zOrder/);
    assert.match(audit, /'Restored Archive title after browser Back'[\s\S]*assertVisibleFocusOutline\(archiveTitle/,
      'history must visibly focus a URL-active window that was minimized before Back');
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
    assert.match(panel, /addEventListener\('change', preserveFocusedFilter\)/);
    assert.match(panel, /event\.matches && filterPanelRef\.current\?\.contains\(document\.activeElement\)[\s\S]*setFilterOpen\(true\)/,
      'reflow into drawer mode must not hide the currently focused filter');
  });

  it('serializes desktop filters and records through the canonical view state', () => {
    const app = read('frontend/App.js');
    assert.match(app, /parseViewState\(window\.location\.href\)\.filters/);
    assert.match(app, /viewStateToUrl\(\{[\s\S]*route:\s*ROUTES\.desktop/);
    assert.match(app, /routeParams:\s*\{\s*desktopAppId,[\s\S]*?entityId:\s*selectedEntityId/);
    assert.match(app, /selectedRecord:\s*selectedRecordId/);
    assert.match(app, /event\?\.type === 'popstate'[\s\S]*historicalState = parseViewState\(window\.location\.href\)[\s\S]*setFilters\(\{[\s\S]*\.\.\.DEFAULT_FILTERS,[\s\S]*\.\.\.historicalState\.filters/,
      'Back and Forward must restore the query-backed filters recorded in desktop history');
    assert.match(app, /desktopAppId === 'entities' && selectedEntityId \? \{ entityId: selectedEntityId \} : \{\}/,
      'a selected entity must share the canonical desktop view-state URL');
  });
});

describe('desktop entity adapter', () => {
  it('reuses the canonical entity browser and App-owned record state', () => {
    const app = read('frontend/App.js');
    const panel = read('frontend/desktop/DesktopEntityPanel.js');
    assert.match(panel, /<\$\{EntityBrowser\}/);
    assert.match(app, /entityView=\$\{desktopEntityView\}/);
    assert.match(app, /records:\s*queryRecords/);
    assert.match(app, /const desktopEntityView = \{[\s\S]*?loading,[\s\S]*?error,/);
    assert.match(panel, /dataStatus\s*=\s*null/);
    assert.match(panel, /\$\{dataStatus\}[\s\S]*?<div className="desktop-entity-browser">/);
    assert.match(app, /desktopActiveNeedsRecords \? recordView : null/,
      'entity records open in the canonical RecordView overlay');
    assert.match(app, /selectedEntityId,[\s\S]*onSelectEntity:\s*setSelectedEntityId/);
    assert.match(panel, /selectedEntityId=\$\{selectedEntityId\}/);
    assert.match(panel, /onSelectEntity=\$\{onSelectEntity\}/);
    assert.match(panel, /embedded=\$\{true\}/);
    assert.match(panel, /autoFocusSelection=\$\{autoFocusSelection\}/);
    assert.match(app, /const desktopRecordOverlayOpen = desktopActiveNeedsRecords && Boolean\(selectedRecordId\)/);
    assert.match(app, /autoFocusSelection:\s*!desktopRecordOverlayOpen/);
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

  it('prioritizes selected entity details on compact layouts with exact focus entry and return', () => {
    const browser = read('frontend/components/EntityBrowser.js');
    const css = read('frontend/index.css');
    assert.match(browser, /className="entity-browser-list flex-grow"/);
    assert.match(browser, /className="entity-browser-detail flex-shrink-0/);
    assert.match(css, /\.entity-browser-list\s*\{\s*order:\s*2/);
    assert.match(css, /\.entity-browser-detail\s*\{\s*order:\s*1/);
    assert.match(css, /\.entity-detail-heading:focus-visible\s*\{[\s\S]*outline:\s*3px solid/);
    assert.match(css, /@media \(min-width: 1024px\)[\s\S]*\.entity-browser-list\s*\{\s*order:\s*1[\s\S]*\.entity-browser-detail\s*\{\s*order:\s*2/);
    assert.match(browser, /role="region"[\s\S]*aria-labelledby="entity-detail-title"/);
    assert.match(browser, /style=\$\{\{ minWidth: '44px', minHeight: '44px' \}\}[\s\S]*aria-label="Close entity details"/,
      'the shared entity-detail close target must be touch-safe in standard and desktop views');
    assert.match(browser, /const DetailHeading = embedded \? 'h3' : 'h2'/);
    assert.match(browser, /const DetailSectionHeading = embedded \? 'h4' : 'h3'/);
    assert.match(browser, /layoutFrame = requestAnimationFrame[\s\S]*focusFrame = requestAnimationFrame/);
    assert.match(browser, /detailPanel\?\.contains\(document\.activeElement\)[\s\S]*detailHeadingRef\.current\?\.focus\(\)/,
      'deferred entity focus must preserve a record modal\'s more precise opener return');
    assert.match(browser, /if \(!selectedEntity \|\| !autoFocusSelection\) return undefined/);
    assert.match(browser, /\[selectedEntity\?\.id, autoFocusSelection\]/);
    assert.doesNotMatch(browser, /if \(selectedEntityId === selectedEntity\?\.id\) return/,
      'cold entity deep links must refresh their derived records when the core corpus arrives');
    assert.match(browser, /if \(selectedEntityId !== selectedEntity\?\.id\)[\s\S]*showEntityDetails\(entity\)/);
    assert.match(browser, /if \(event\.key !== 'Escape'\) return;/);
    assert.match(browser, /if \(opener\?\.isConnected\) opener\.focus\(\)/);
    assert.match(browser, /data-entity-id=\$\{entity\.id\}/);
    assert.match(browser, /role="region"[\s\S]*aria-label="Records mentioning this entity"/,
      'the keyboard-scrollable record list needs semantics that permit its accessible name');
    assert.match(browser, /else if \(fallback\?\.isConnected\) fallback\.focus\(\)/);
    assert.match(browser, /!opener\.closest\('\[data-entity-detail\]'\)/);
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
    const detailPanel = read('frontend/components/DetailPanel.js');
    assert.doesNotMatch(detailPanel, /aria-modal/,
      'the side panel must not claim modal behavior while the map remains available');
    assert.match(detailPanel, /aria-hidden=\$\{isOpen \? undefined : 'true'\}/);
    assert.match(detailPanel, /inert=\$\{isOpen \? undefined : ''\}/,
      'the retained closing panel must not expose off-screen dialog controls');
    assert.match(detailPanel, /className="archive-detail-content[^\n]+"\s*tabIndex="0"\s*aria-label="Detail panel content"/,
      'the shared reading pane must expose a named keyboard scroll target');
    assert.doesNotMatch(detailPanel, /text-stone-400/,
      'small detail metadata must keep AA contrast on white');
    assert.match(detailPanel, /prefers-reduced-motion: reduce/);
    assert.match(detailPanel, /if \(reduceMotion\) frame = requestAnimationFrame\(focusClose\)/);
    assert.match(detailPanel, /\}, \[isOpen, displayNode\]\);/,
      'focus entry must wait until retained panel content has rendered');
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
    assert.match(app, /const desktopStartView = \{[\s\S]*?records,[\s\S]*?onNavigate:\s*handleDesktopGuideNavigate/);
    assert.match(app, /const desktopStartView = \{[\s\S]*?loading,[\s\S]*?error,/);
    assert.match(panel, /dataStatus\s*=\s*null/);
    assert.match(panel, /\$\{dataStatus\}[\s\S]*?\$\{findingsOnly \? html`/);
  });

  it('explains loading and failed canonical record data in dependent windows', () => {
    const shell = read('frontend/desktop/DesktopShell.js');
    const css = read('frontend/desktop/desktop.css');

    assert.match(shell, /role="status">\$\{loadingMessage\}/);
    assert.match(shell, /className="desktop-data-status is-error" role="alert"/);
    assert.match(shell, /Connected records are unavailable\./);
    assert.match(shell, /Guide records are unavailable\./);
    assert.match(shell, /window\.location\.reload\(\)/);
    assert.match(css, /\.desktop-data-status\.is-error button \{[\s\S]*?min-height:\s*44px/);
    assert.match(css, /\.desktop-data-status\.is-error button:focus-visible/);
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
    const app = read('frontend/App.js');
    assert.match(shell, /className="desktop-window-stack"/);
    assert.match(shell, /role="region"/);
    assert.match(shell, /desktop-active-window-label/);
    assert.match(shell, /onFocusCapture/);
    assert.match(shell, /activeWindow\?\.contains\(document\.activeElement\)/);
    assert.match(shell, /requestAnimationFrame\(\(\) => \{[\s\S]*activeWindow\?\.contains\(document\.activeElement\)[\s\S]*focusTarget\?\.focus/,
      'scheduled window-title focus must yield to an overlay restoring its exact opener');
    assert.match(shell, /if \(!autoFocusWindow\) return undefined/,
      'a foreground record overlay must retain focus ownership during direct desktop loads');
    assert.match(shell, /activeShellWindowVisible[\s\S]*layout\.windows\.some\(\(entry\) => entry\.id === shellApp\.id && !entry\.minimized\)/,
      'focus must rerun when history remounts a minimized active window without changing window count');
    assert.match(app, /autoFocusWindow=\$\{!desktopRecordOverlayOpen\}/);
    assert.match(shell, /pointerWindowControlRef/,
      'pointer title-bar actions must not be consumed by background-window activation');
    assert.match(shell, /windowTitleRefs\.current\[shellApp\?\.id \|\| 'home'\]\?\.focus/,
      'closing or minimizing a background window must recover focus in the active surface');
    assert.match(shell, /compactQuery\.addEventListener\('change', preserveVisibleFocus\)/);
    assert.match(shell, /shortcutPanelRef\.current\?\.contains\(document\.activeElement\)[\s\S]*windowTitleRefs\.current\[shellApp\.id\]\?\.focus/,
      'compact reflow must transfer focus out of the shortcut panel it hides');
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
    const shell = read('frontend/desktop/DesktopShell.js');
    const css = read('frontend/desktop/desktop.css');
    assert.match(shell, /\$\{shellApp && html`<h1 className="desktop-mobile-page-title">Archive desktop<\/h1>`\}/,
      'the replacement mobile page heading must not duplicate the visible launcher heading');
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
    assert.doesNotMatch(shell, /aria-controls=/,
      'the optional menu relationship must not leave axe with an unresolvable critical incomplete');
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

  it('keeps approval-gated apps in metadata without a public placeholder', () => {
    const shell = read('frontend/desktop/DesktopShell.js');
    const registry = read('frontend/desktop/desktopRegistry.js');

    assert.match(registry, /id:\s*'making-of'[\s\S]*availability:\s*'blocked'[\s\S]*launch:\s*null/);
    assert.doesNotMatch(shell, /plannedApps|Future connections|making-of|How it was made/);
  });

  it('defines touch, responsive, safe-area, and reduced-motion behavior', () => {
    const css = read('frontend/desktop/desktop.css');
    const indexCss = read('frontend/index.css');
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
    assert.match(css, /\.desktop-window-wide\s+\.desktop-window-body\s*\{[^}]*height:\s*min\(/s,
      'wide desktop windows bound their content pane to the available viewport');
    assert.match(css, /\.desktop-window-wide\s+\.desktop-window-body\s*\{[^}]*overflow-y:\s*auto/s);
    assert.match(css, /\.desktop-window-wide\s+\.desktop-window-body\s*\{[^}]*overscroll-behavior:\s*contain/s);
    assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.desktop-window-wide\s+\.desktop-window-body\s*\{[^}]*height:\s*auto[^}]*overflow-y:\s*visible/s,
      'compact layouts return window content to the normal mobile flow');
    assert.match(indexCss, /@media \(max-width: 700px\), \(max-width: 900px\) and \(max-height: 520px\)[\s\S]*\.archive-desktop \.desktop-window-body input[\s\S]*\.archive-report-dialog textarea[\s\S]*font-size:\s*1rem/,
      'compact text fields must not trigger iOS focus zoom around fixed shell controls');
  });

  it('ships a reproducible independent-review handoff without crossing release gates', () => {
    const handoff = read('docs/plans/2026-07-19-archive-desktop-review-handoff.md');
    assert.match(handoff, /does not record an approval/i);
    assert.match(handoff, /\?record=RECORD-00903&entity=P0005#desktop\/entities/);
    assert.match(handoff, /375 × 812/);
    assert.match(handoff, /200%-zoom equivalent/);
    assert.match(handoff, /Screen reader:/);
    assert.match(handoff, /Left\/Right stop at visual row edges/,
      'the review script must exercise the shortcut field as a spatial keyboard model');
    assert.match(handoff, /repeat from the Start menu[\s\S]*visible focus ring to Start/,
      'the transient report-menu trigger needs an explicit independent-review check');
    assert.doesNotMatch(handoff, /\/home\/jamditis/,
      'the checked-in review procedure must not depend on the author worktree path');
    assert.match(handoff, /A `FAILED` console line or an `audit-error` report row is a runtime regression/,
      'reviewers must be able to distinguish route failures from the inherited axe baseline');
    assert.match(handoff, /Outcome: approve \/ approve with changes \/ request changes \/ blocked/);
    assert.match(handoff, /Making-of approval, merge, coordinated release version\/cache bump, and live-archive verification remain separate decisions/);
  });
});
