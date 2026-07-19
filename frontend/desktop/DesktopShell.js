import { useEffect, useMemo, useRef, useState } from 'react';
import { html } from '../html.js?v=3.7.5';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  BarChart3,
  BookOpen,
  Compass,
  ExternalLink,
  FileQuestion,
  FileText,
  FolderOpen,
  Info,
  Library,
  Menu,
  Minus,
  Network,
  RotateCcw,
  Search,
  Sparkles,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { resolveSitePath } from '../utils/pathResolver.js?v=3.7.5';
import DesktopArchivePanel from './DesktopArchivePanel.js?v=3.7.5';
import DesktopAnalyticsPanel from './DesktopAnalyticsPanel.js?v=3.7.5';
import DesktopDissertationPanel from './DesktopDissertationPanel.js?v=3.7.5';
import DesktopEntityPanel from './DesktopEntityPanel.js?v=3.7.5';
import DesktopStartPanel from './DesktopStartPanel.js?v=3.7.5';
import {
  DESKTOP_APPS,
  DESKTOP_TOOL_LINKS,
  getDesktopApp,
  getReadyDesktopApps,
} from './desktopRegistry.js?v=3.7.5';
import {
  DESKTOP_LAYOUT_STORAGE_KEY,
  activateDesktopWindow,
  closeDesktopWindow,
  emptyDesktopLayout,
  minimizeDesktopWindow,
  nextVisibleDesktopWindow,
  parseDesktopLayout,
  serializeDesktopLayout,
} from './desktopWindowState.js?v=3.7.5';

const ICONS = {
  archive: Archive,
  folders: FolderOpen,
  start: Compass,
  entities: Network,
  dissertation: BookOpen,
  analytics: BarChart3,
  tools: Wrench,
  about: Info,
  report: AlertTriangle,
  readme: FileText,
  findings: Sparkles,
  method: Search,
  participate: Users,
  'making-of': Library,
};

const iconFor = (key, className = 'desktop-icon-svg') => {
  const Icon = ICONS[key] || FileQuestion;
  return html`<${Icon} className=${className} aria-hidden="true" />`;
};

const launchModeLabel = (app) => {
  if (app.launch.kind === 'shell') return 'Desktop window';
  if (app.launch.kind === 'action') return 'Opens dialog';
  if (app.launch.kind === 'path') return 'Standalone page';
  return 'Standard view';
};

const DesktopShell = ({
  activeAppId = null,
  onSelectApp,
  onNavigate,
  onOpenBugReport,
  onExit,
  onOpenAppsChange,
  archiveView,
  analyticsView,
  dissertationView,
  entityView,
  startView,
}) => {
  const readyApps = useMemo(() => getReadyDesktopApps(), []);
  const shortcutApps = useMemo(
    () => readyApps.filter((app) => app.surfaces.includes('desktop')),
    [readyApps],
  );
  const startApps = useMemo(
    () => readyApps.filter((app) => app.surfaces.includes('start')),
    [readyApps],
  );
  const shellApps = useMemo(
    () => readyApps.filter((app) => app.launch.kind === 'shell'),
    [readyApps],
  );
  const shellAppIds = useMemo(() => shellApps.map((app) => app.id), [shellApps]);
  const plannedApps = useMemo(
    () => DESKTOP_APPS.filter((app) => app.availability !== 'ready'),
    [],
  );
  const activeApp = activeAppId ? getDesktopApp(activeAppId) : null;
  const shellApp = activeApp?.availability === 'ready' && activeApp.launch.kind === 'shell'
    ? activeApp
    : null;
  const hasUnknownApp = Boolean(activeAppId && !shellApp);

  const [shortcutFocusIndex, setShortcutFocusIndex] = useState(0);
  const [startOpen, setStartOpen] = useState(false);
  const [menuFocusIndex, setMenuFocusIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState(
    hasUnknownApp ? 'That desktop item is unavailable. Showing the desktop home.' : '',
  );
  const [layout, setLayout] = useState(() => {
    try {
      return parseDesktopLayout(localStorage.getItem(DESKTOP_LAYOUT_STORAGE_KEY), shellAppIds);
    } catch {
      return emptyDesktopLayout();
    }
  });

  const desktopTitleRef = useRef(null);
  const windowTitleRefs = useRef({});
  const shortcutRefs = useRef([]);
  const taskButtonRefs = useRef({});
  const startButtonRef = useRef(null);
  const startMenuRef = useRef(null);
  const menuItemRefs = useRef([]);
  const lastShellAppRef = useRef(null);
  const reportedOpenAppsRef = useRef('');

  useEffect(() => {
    const stylesheetId = 'archive-desktop-styles';
    if (document.getElementById(stylesheetId)) return undefined;

    const link = document.createElement('link');
    link.id = stylesheetId;
    link.rel = 'stylesheet';
    link.href = resolveSitePath('frontend/desktop/desktop.css?v=3.7.5');
    link.addEventListener('error', () => {
      setStatusMessage('Desktop styling could not load. All destinations remain available.');
    }, { once: true });
    document.head.appendChild(link);

    return undefined;
  }, []);

  useEffect(() => {
    // Registration happens after the first document load. Asking the active
    // root worker to warm this optional module graph means even a first-ever
    // direct desktop visit is available on the next offline load, while a
    // standard archive visitor never downloads desktop-only assets.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((registration) => registration.active?.postMessage({ action: 'cacheDesktop' }))
        .catch(() => {});
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (!shellApp) return;
    setLayout((current) => activateDesktopWindow(current, shellApp.id, shellAppIds));
  }, [shellApp, shellAppIds]);

  useEffect(() => {
    try {
      localStorage.setItem(
        DESKTOP_LAYOUT_STORAGE_KEY,
        serializeDesktopLayout(layout, shellAppIds),
      );
    } catch {
      // Private browsing and storage policies may reject persistence. Window
      // behavior remains fully usable for the current session.
    }
  }, [layout, shellAppIds]);

  useEffect(() => {
    const visibleAppIds = layout.windows
      .filter((entry) => !entry.minimized)
      .map((entry) => entry.id);
    const signature = visibleAppIds.join('|');
    if (reportedOpenAppsRef.current === signature) return;
    reportedOpenAppsRef.current = signature;
    onOpenAppsChange?.(visibleAppIds);
  }, [layout.windows, onOpenAppsChange]);

  useEffect(() => {
    let focusTarget = null;
    if (shellApp) {
      lastShellAppRef.current = shellApp.id;
      const activeWindow = document.querySelector(`[data-window-id="${shellApp.id}"]`);
      if (activeWindow?.contains(document.activeElement)) return undefined;
      focusTarget = windowTitleRefs.current[shellApp.id];
    } else if (activeAppId) {
      setStatusMessage('That desktop item is unavailable. Showing the desktop home.');
      focusTarget = windowTitleRefs.current.home;
    } else if (lastShellAppRef.current && layout.windows.length === 0) {
      const index = shortcutApps.findIndex((app) => app.id === lastShellAppRef.current);
      if (index >= 0) {
        setShortcutFocusIndex(index);
        focusTarget = shortcutRefs.current[index];
      }
      lastShellAppRef.current = null;
    } else {
      focusTarget = windowTitleRefs.current.home || desktopTitleRef.current;
    }

    const frame = requestAnimationFrame(() => focusTarget?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [activeAppId, shellApp, shortcutApps, layout.windows.length]);

  useEffect(() => {
    if (!shellApp) return undefined;
    const frame = requestAnimationFrame(() => {
      taskButtonRefs.current[shellApp.id]?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [shellApp, layout.windows]);

  useEffect(() => {
    if (!startOpen) return undefined;
    setMenuFocusIndex(0);
    const frame = requestAnimationFrame(() => menuItemRefs.current[0]?.focus());

    const closeFromOutside = (event) => {
      if (
        !startMenuRef.current?.contains(event.target)
        && !startButtonRef.current?.contains(event.target)
      ) {
        setStartOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeFromOutside);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', closeFromOutside);
    };
  }, [startOpen]);

  const activateWindow = (appId) => {
    setLayout((current) => activateDesktopWindow(current, appId, shellAppIds));
    if (activeAppId === appId) {
      windowTitleRefs.current[appId]?.focus({ preventScroll: true });
    } else {
      onSelectApp?.(appId);
    }
  };

  const openApp = (app) => {
    const index = shortcutApps.findIndex((candidate) => candidate.id === app.id);
    if (index >= 0) setShortcutFocusIndex(index);
    setStartOpen(false);

    if (app.launch.kind === 'shell') {
      setStatusMessage(`Opening ${app.label}.`);
      activateWindow(app.launch.destination);
      return;
    }
    if (app.launch.kind === 'action') {
      setStatusMessage('Opening the archive problem report.');
      onOpenBugReport?.();
      return;
    }
    if (app.launch.kind === 'path') {
      setStatusMessage(`${app.label} opens as a standalone archive page.`);
      window.location.assign(resolveSitePath(app.launch.destination));
      return;
    }

    setStatusMessage(`${app.label} opens in the standard archive view.`);
    onNavigate?.(app.launch.destination);
  };

  const moveShortcutFocus = (nextIndex) => {
    const clamped = Math.max(0, Math.min(shortcutApps.length - 1, nextIndex));
    setShortcutFocusIndex(clamped);
    shortcutRefs.current[clamped]?.focus();
  };

  const handleShortcutKeyDown = (event, app, index) => {
    const columns = 2;
    let nextIndex = index;

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openApp(app);
      return;
    }
    if (event.key === 'ArrowLeft') nextIndex = index - 1;
    else if (event.key === 'ArrowRight') nextIndex = index + 1;
    else if (event.key === 'ArrowUp') nextIndex = index - columns;
    else if (event.key === 'ArrowDown') nextIndex = index + columns;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = shortcutApps.length - 1;
    else return;

    event.preventDefault();
    moveShortcutFocus(nextIndex);
  };

  const menuEntryCount = startApps.length + 2;
  const handleMenuKeyDown = (event, index) => {
    let nextIndex = index;
    if (event.key === 'ArrowDown') nextIndex = (index + 1) % menuEntryCount;
    else if (event.key === 'ArrowUp') nextIndex = (index - 1 + menuEntryCount) % menuEntryCount;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = menuEntryCount - 1;
    else if (event.key === 'Escape') {
      event.preventDefault();
      setStartOpen(false);
      startButtonRef.current?.focus();
      return;
    } else if (event.key === 'Tab') {
      setStartOpen(false);
      return;
    } else {
      return;
    }

    event.preventDefault();
    setMenuFocusIndex(nextIndex);
    menuItemRefs.current[nextIndex]?.focus();
  };

  const closeWindow = (app) => {
    const nextLayout = closeDesktopWindow(layout, app.id, shellAppIds);
    setLayout(nextLayout);
    setStatusMessage(`Closed ${app.label}.`);
    if (activeAppId === app.id) {
      onSelectApp?.(nextVisibleDesktopWindow(nextLayout) || null);
    }
  };

  const minimizeWindow = (app) => {
    const nextLayout = minimizeDesktopWindow(layout, app.id, shellAppIds);
    setLayout(nextLayout);
    setStatusMessage(`Minimized ${app.label}. Use its taskbar button to restore it.`);
    if (activeAppId === app.id) {
      onSelectApp?.(nextVisibleDesktopWindow(nextLayout, app.id) || null);
    }
  };

  const resetLayout = () => {
    setLayout(emptyDesktopLayout());
    setStartOpen(false);
    setStatusMessage('Desktop layout reset. All app windows were closed.');
    try {
      localStorage.removeItem(DESKTOP_LAYOUT_STORAGE_KEY);
    } catch {
      // The in-memory reset still succeeds when storage is unavailable.
    }
    onSelectApp?.(null);
    requestAnimationFrame(() => startButtonRef.current?.focus());
  };

  const renderWelcome = () => html`
    <div className="desktop-document">
      ${hasUnknownApp && html`
        <div className="desktop-notice" role="status">
          <${AlertTriangle} className="desktop-inline-icon" aria-hidden="true" />
          <span>That desktop item is unavailable. Showing the desktop home.</span>
        </div>
      `}
      <p className="desktop-eyebrow">A second front door</p>
      <h3>Welcome to the archive desktop</h3>
      <p className="desktop-lede">
        This optional view arranges the same Rosen Archive as shortcuts, folders, and windows. It is a map of the collection, not a separate copy of it.
      </p>
      <div className="desktop-principles">
        <article>
          <span className="desktop-principle-number">01</span>
          <h4>Choose a path</h4>
          <p>Open a shortcut once, or use Start for the complete destination list.</p>
        </article>
        <article>
          <span className="desktop-principle-number">02</span>
          <h4>Keep canonical links</h4>
          <p>Archive records and research areas open in their maintained standard routes.</p>
        </article>
        <article>
          <span className="desktop-principle-number">03</span>
          <h4>Leave at any time</h4>
          <p>The taskbar always provides a direct route back to the standard archive.</p>
        </article>
      </div>
    </div>
  `;

  const renderReadme = () => html`
    <div className="desktop-document">
      <p className="desktop-eyebrow">Read me</p>
      <h3>A familiar shape for a large archive</h3>
      <p className="desktop-lede">
        Personal-computing and early-web history overlap with many of the archive's questions about publishing, publics, platforms, and control. This shell uses that history to make routes visible and the collection feel containable.
      </p>

      <dl className="desktop-definition-list">
        <div><dt>Shortcut</dt><dd>A maintained way into the collection. One click is enough.</dd></div>
        <div><dt>Desktop window</dt><dd>A live archive surface that can remain open while you compare another path.</dd></div>
        <div><dt>Standard view</dt><dd>The existing canonical archive route, with its full current behavior.</dd></div>
        <div><dt>Start</dt><dd>The complete list of destinations and the dependable way out.</dd></div>
      </dl>

      <section className="desktop-layout-help" aria-labelledby="desktop-layout-help-title">
        <h4 id="desktop-layout-help-title">Window memory</h4>
        <p>
          Open and minimized app windows are saved on this device. Active state stays in the URL, so Back and Forward move between the windows you activated.
        </p>
        <button type="button" className="desktop-standard-link" onClick=${resetLayout}>
          <${RotateCcw} aria-hidden="true" />
          Reset desktop layout
        </button>
      </section>

      <section aria-labelledby="future-connections-title" className="desktop-future-section">
        <h4 id="future-connections-title">Future connections</h4>
        <p>These destinations stay non-actionable until their real content and approvals exist.</p>
        <ul>
          ${plannedApps.map((app) => html`
            <li key=${app.id}>
              <span>${app.label}</span>
              <small>${app.availability === 'blocked' ? 'Awaiting approval or dependency' : 'Planned for a later phase'}</small>
            </li>
          `)}
        </ul>
      </section>
    </div>
  `;

  const renderTools = () => html`
    <div className="desktop-document">
      <p className="desktop-eyebrow">Maintained tools</p>
      <h3>Reading and research tools</h3>
      <p className="desktop-lede">
        These pages are maintained alongside the archive. Each opens as its own full page and keeps a route back to the collection.
      </p>
      <div className="desktop-tool-grid">
        ${DESKTOP_TOOL_LINKS.map((tool) => html`
          <a
            key=${tool.id}
            className="desktop-tool-link"
            href=${resolveSitePath(tool.href)}
            aria-label=${`${tool.label}. Opens a standalone archive page.`}
          >
            <span className="desktop-tool-icon">${iconFor(tool.icon)}</span>
            <span className="desktop-tool-copy">
              <strong>${tool.label}</strong>
              <small>${tool.description}</small>
              <span className="desktop-tool-mode">
                Open page <${ExternalLink} className="desktop-external-icon" aria-hidden="true" />
                ${tool.status === 'beta' ? html`<em>Beta</em>` : ''}
                ${tool.status === 'experimental' ? html`<em>Experimental</em>` : ''}
              </span>
            </span>
          </a>
        `)}
      </div>
    </div>
  `;

  const renderArchive = (appId) => {
    const windowViewMode = appId === 'folders' ? 'folder' : 'grid';
    return html`
    <${DesktopArchivePanel}
      viewMode=${windowViewMode}
      loading=${archiveView.loading}
      error=${archiveView.error}
      filters=${archiveView.filters}
      setFilters=${archiveView.setFilters}
      facets=${archiveView.facets}
      autocompleteIndex=${archiveView.autocompleteIndex}
      sortBy=${archiveView.sortBy}
      setSortBy=${archiveView.setSortBy}
      filteredRecords=${archiveView.filteredRecords}
      paginatedRecords=${archiveView.paginatedRecords}
      folderGroups=${archiveView.folderGroups}
      currentPage=${archiveView.currentPage}
      totalPages=${archiveView.totalPages}
      activeFilterCount=${archiveView.activeFilterCount}
      onSetViewMode=${archiveView.onSetViewMode}
      onSelectRecord=${archiveView.onSelectRecord}
      onOpenFolder=${archiveView.onOpenFolder}
      onPageChange=${archiveView.onPageChange}
      onClearFilters=${archiveView.onClearFilters}
      onOpenStandard=${() => archiveView.onOpenStandard(windowViewMode)}
    />
  `;
  };

  const renderEntities = () => html`
    <${DesktopEntityPanel}
      records=${entityView.records}
      queryActive=${entityView.queryActive}
      onSelectRecord=${entityView.onSelectRecord}
      onOpenStandard=${entityView.onOpenStandard}
    />
  `;

  const renderDissertation = () => html`
    <${DesktopDissertationPanel}
      onOpenStandard=${dissertationView.onOpenStandard}
    />
  `;

  const renderAnalytics = () => html`
    <${DesktopAnalyticsPanel}
      onRecordResults=${analyticsView.onRecordResults}
      onOpenStandard=${analyticsView.onOpenStandard}
    />
  `;

  const renderGuidedPath = (appId) => html`
    <${DesktopStartPanel}
      mode=${appId}
      records=${startView.records}
      onNavigate=${startView.onNavigate}
      onSelectRecord=${startView.onSelectRecord}
      onOpenBugReport=${startView.onOpenBugReport}
      onOpenStandard=${startView.onOpenStandard}
    />
  `;

  const renderWindowContent = (app) => {
    if (!app) return renderWelcome();
    if (app.id === 'archive' || app.id === 'folders') return renderArchive(app.id);
    if (app.id === 'entities') return renderEntities();
    if (app.id === 'dissertation') return renderDissertation();
    if (app.id === 'analytics') return renderAnalytics();
    if (app.id === 'start' || app.id === 'findings') return renderGuidedPath(app.id);
    if (app.id === 'readme') return renderReadme();
    if (app.id === 'tools') return renderTools();
    return renderWelcome();
  };

  const renderWindowFrame = (app, stackIndex = 0) => {
    const appId = app?.id || 'home';
    const windowTitle = app?.label || 'Welcome to the archive desktop';
    const isActive = app ? shellApp?.id === app.id : !shellApp;
    const isWideWindow = [
      'archive',
      'folders',
      'entities',
      'dissertation',
      'analytics',
      'start',
      'findings',
    ].includes(app?.id);
    const titleId = `desktop-window-title-${appId}`;
    const style = app ? {
      '--desktop-window-x': `${(stackIndex % 4) * 14}px`,
      '--desktop-window-y': `${(stackIndex % 4) * 14}px`,
      zIndex: stackIndex + 3,
    } : { zIndex: 1 };

    return html`
      <section
        key=${appId}
        className=${`desktop-window ${isWideWindow ? 'desktop-window-wide' : ''} ${isActive ? 'is-active' : 'is-inactive'} ${app ? '' : 'desktop-home-window'}`}
        style=${style}
        role="region"
        aria-labelledby=${titleId}
        data-window-id=${appId}
        onPointerDown=${(event) => {
          if (!app || isActive || event.target.closest('.desktop-window-controls')) return;
          activateWindow(app.id);
        }}
        onFocusCapture=${() => {
          if (app && !isActive) activateWindow(app.id);
        }}
      >
        <div className="desktop-window-titlebar">
          <div className="desktop-window-title-copy">
            <span aria-hidden="true">${iconFor(app?.icon || 'archive', 'desktop-titlebar-icon')}</span>
            <h2
              id=${titleId}
              ref=${(element) => { windowTitleRefs.current[appId] = element; }}
              tabIndex="-1"
            >${windowTitle}</h2>
            ${isActive && html`<span className="desktop-active-window-label">Active</span>`}
          </div>
          ${app && html`
            <div className="desktop-window-controls">
              <button
                type="button"
                className="desktop-window-minimize"
                onClick=${() => minimizeWindow(app)}
                aria-label=${`Minimize ${windowTitle}`}
              >
                <${Minus} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="desktop-window-close"
                onClick=${() => closeWindow(app)}
                aria-label=${`Close ${windowTitle}`}
              >
                <${X} aria-hidden="true" />
              </button>
            </div>
          `}
        </div>
        <div className="desktop-window-body">${renderWindowContent(app)}</div>
        <div className="desktop-window-status">
          ${isActive ? 'Active window' : 'Open in background'}
        </div>
      </section>
    `;
  };

  const openWindows = layout.zOrder
    .map((id) => layout.windows.find((entry) => entry.id === id))
    .filter((entry) => entry && !entry.minimized)
    .map((entry) => getDesktopApp(entry.id))
    .filter((app) => app?.availability === 'ready' && app.launch.kind === 'shell');
  const taskWindows = layout.windows
    .map((entry) => ({ ...entry, app: getDesktopApp(entry.id) }))
    .filter((entry) => entry.app?.availability === 'ready' && entry.app.launch.kind === 'shell');

  return html`
    <main id="main-content" className=${`archive-desktop ${shellApp ? 'desktop-app-active' : ''}`}>
      <h1 className="desktop-mobile-page-title">Archive desktop</h1>
      <div className="desktop-wallpaper-mark" aria-hidden="true">JR</div>
      <div className="desktop-workspace">
        <section className="desktop-shortcut-panel" aria-labelledby="desktop-title">
          <header className="desktop-brand">
            <p>Jay Rosen's Internet Archive</p>
            <h1 id="desktop-title" ref=${desktopTitleRef} tabIndex="-1">Archive desktop</h1>
            <span>Optional exploration view</span>
          </header>

          <div className="desktop-shortcut-grid" role="list" aria-label="Archive desktop shortcuts">
            ${shortcutApps.map((app, index) => html`
              <div role="listitem" key=${app.id}>
                <button
                  ref=${(element) => { shortcutRefs.current[index] = element; }}
                  type="button"
                  className=${`desktop-shortcut ${shellApp?.id === app.id ? 'is-active' : ''}`}
                  tabIndex=${index === shortcutFocusIndex ? 0 : -1}
                  aria-current=${shellApp?.id === app.id ? 'page' : undefined}
                  aria-label=${`${app.label}. ${app.description} ${launchModeLabel(app)}.`}
                  onFocus=${() => setShortcutFocusIndex(index)}
                  onClick=${() => openApp(app)}
                  onKeyDown=${(event) => handleShortcutKeyDown(event, app, index)}
                >
                  <span className="desktop-shortcut-icon">${iconFor(app.icon)}</span>
                  <span className="desktop-shortcut-label">${app.label}</span>
                  <span className="desktop-shortcut-mode">${launchModeLabel(app)}</span>
                </button>
              </div>
            `)}
          </div>
        </section>

        <div className="desktop-window-stack">
          ${renderWindowFrame(null)}
          ${openWindows.map((app, index) => renderWindowFrame(app, index))}
        </div>
      </div>

      <p className="desktop-live-status" aria-live="polite" aria-atomic="true">${statusMessage}</p>

      ${startOpen && html`
        <div
          id="archive-desktop-start-menu"
          ref=${startMenuRef}
          className="desktop-start-menu"
          role="menu"
          aria-label="Archive desktop Start menu"
        >
          <div className="desktop-start-rail" aria-hidden="true"><span>Rosen archive</span></div>
          <div className="desktop-start-content">
            <div className="desktop-start-heading" role="presentation">
              <strong>Archive desktop</strong>
              <small>Choose a destination</small>
            </div>
            ${startApps.map((app, index) => html`
              <button
                key=${app.id}
                ref=${(element) => { menuItemRefs.current[index] = element; }}
                type="button"
                className="desktop-menu-item"
                role="menuitem"
                tabIndex=${index === menuFocusIndex ? 0 : -1}
                onFocus=${() => setMenuFocusIndex(index)}
                onClick=${() => openApp(app)}
                onKeyDown=${(event) => handleMenuKeyDown(event, index)}
              >
                <span className="desktop-menu-icon">${iconFor(app.icon)}</span>
                <span><strong>${app.label}</strong><small>${launchModeLabel(app)}</small></span>
              </button>
            `)}
            <div className="desktop-menu-divider" role="separator"></div>
            <button
              ref=${(element) => { menuItemRefs.current[startApps.length] = element; }}
              type="button"
              className="desktop-menu-item"
              role="menuitem"
              tabIndex=${menuFocusIndex === startApps.length ? 0 : -1}
              onFocus=${() => setMenuFocusIndex(startApps.length)}
              onClick=${resetLayout}
              onKeyDown=${(event) => handleMenuKeyDown(event, startApps.length)}
            >
              <span className="desktop-menu-icon"><${RotateCcw} aria-hidden="true" /></span>
              <span><strong>Reset desktop layout</strong><small>Close windows and clear saved state</small></span>
            </button>
            <button
              ref=${(element) => { menuItemRefs.current[startApps.length + 1] = element; }}
              type="button"
              className="desktop-menu-item desktop-menu-exit"
              role="menuitem"
              tabIndex=${menuFocusIndex === startApps.length + 1 ? 0 : -1}
              onFocus=${() => setMenuFocusIndex(startApps.length + 1)}
              onClick=${onExit}
              onKeyDown=${(event) => handleMenuKeyDown(event, startApps.length + 1)}
            >
              <span className="desktop-menu-icon"><${ArrowLeft} aria-hidden="true" /></span>
              <span><strong>Standard archive</strong><small>Leave the desktop view</small></span>
            </button>
          </div>
        </div>
      `}

      <nav className="desktop-taskbar" aria-label="Archive desktop taskbar">
        <button
          ref=${startButtonRef}
          type="button"
          className=${`desktop-start-button ${startOpen ? 'is-pressed' : ''}`}
          aria-haspopup="menu"
          aria-expanded=${startOpen}
          aria-controls="archive-desktop-start-menu"
          onClick=${() => setStartOpen((open) => !open)}
        >
          <${Menu} aria-hidden="true" />
          <strong>Start</strong>
        </button>

        <button type="button" className="desktop-task-button desktop-standard-button" onClick=${onExit}>
          <${ArrowLeft} aria-hidden="true" />
          <span>Standard archive</span>
        </button>

        ${taskWindows.length > 0 && html`
          <div className="desktop-task-window-list" role="list" aria-label="Open desktop windows" tabIndex="0">
            ${taskWindows.map(({ app, minimized }) => html`
              <div role="listitem" key=${app.id}>
                <button
                  ref=${(element) => { taskButtonRefs.current[app.id] = element; }}
                  type="button"
                  className=${`desktop-task-button ${shellApp?.id === app.id ? 'is-active' : ''} ${minimized ? 'is-minimized' : ''}`}
                  aria-current=${shellApp?.id === app.id ? 'page' : undefined}
                  aria-label=${`${minimized ? 'Restore' : 'Activate'} ${app.label}${minimized ? ', minimized' : ''}`}
                  onClick=${() => {
                    setStatusMessage(`${minimized ? 'Restored' : 'Activated'} ${app.label}.`);
                    activateWindow(app.id);
                  }}
                >
                  ${iconFor(app.icon, 'desktop-task-icon')}
                  <span>${app.label}${minimized ? html`<small>Minimized</small>` : ''}</span>
                </button>
              </div>
            `)}
          </div>
        `}

        <div className="desktop-task-status" aria-hidden="true">
          <span>Rosen archive</span>
          <small>desktop</small>
        </div>
      </nav>
    </main>
  `;
};

export default DesktopShell;
