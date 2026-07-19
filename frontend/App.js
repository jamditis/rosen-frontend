
import { Component, Suspense, lazy, useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { html } from './html.js?v=3.7.5';
import { Newspaper, SlidersHorizontal, LayoutGrid, Folder, BookOpen, Compass, AlertCircle, ChevronUp, BarChart3, Users, Info, Bug, Github } from 'lucide-react';
import { fetchCoreData, fetchRecordDetails, preloadDetails, loadSearchIndex } from './services/archiveService.js?v=3.7.5';
import { perfMark, perfMeasure } from './utils/perfMark.js?v=3.7.5';
import { withViewTransition } from './utils/viewTransition.js?v=3.7.5';
import { ITEMS_PER_PAGE, REPORT_CONFIG } from './constants.js?v=3.7.5';
import { ROUTES, getCurrentRoute, getDesktopAppIdFromUrl, getEntityIdFromUrl, navigateTo, navigateToDesktop, getRecordIdFromUrl, migrateLegacyUrl } from './services/router.js?v=3.7.5';
import { parseViewState, viewStateToUrl } from './services/viewState.js?v=3.7.5';
import { setRecordParam } from './utils/recordDeepLink.js?v=3.7.5';
import { readReportDeepLink } from './utils/reportDeepLink.js?v=3.7.5';
import { resolveSitePath } from './utils/pathResolver.js?v=3.7.5';
import { recordNeedsReview } from './utils/needsReview.js?v=3.7.5';
import { buildSearchText, normalizeForSearch } from './utils/searchNormalize.js?v=3.7.5';
import { sortRecords } from './utils/recordSort.js?v=3.7.5';
import { deriveFacetsForRecords, intersectByRecordIds } from './services/queryComposition.js?v=3.7.5';
import Sidebar from './components/Sidebar.js?v=3.7.5';
import WelcomeModal from './components/WelcomeModal.js?v=3.7.5';
import RecordView from './components/RecordView.js?v=3.7.5';
import FeaturedSection from './components/FeaturedSection.js?v=3.7.5';
import DissertationPage from './components/DissertationPage.js?v=3.7.5';
import ToolsModal from './components/ToolsModal.js?v=3.7.5';
import BugReportModal from './components/BugReportModal.js?v=3.7.5';
import WorkInProgressBanner from './components/WorkInProgressBanner.js?v=3.7.5';
import AnalyticsDashboard from './components/AnalyticsDashboard.js?v=3.7.5';
import EntityBrowser from './components/EntityBrowser.js?v=3.7.5';
import Timeline from './components/Timeline.js?v=3.7.5';
import AboutPage from './components/AboutPage.js?v=3.7.5';
import WikiPage from './components/WikiPage.js?v=3.7.5';
import StartHerePage from './components/StartHerePage.js?v=3.7.5';
import ArchiveResults from './components/ArchiveResults.js?v=3.7.5';

const DesktopShell = lazy(() => import('./desktop/DesktopShell.js?v=3.7.5'));

const NON_RECORD_ROUTES = new Set([
  ROUTES.analytics,
  ROUTES.wiki,
  ROUTES.desktop,
]);

const DESKTOP_RECORD_APPS = new Set(['archive', 'folders', 'entities', 'start', 'findings']);
const DESKTOP_GUIDED_SHELL_DESTINATIONS = new Set([
  'archive',
  'folders',
  'entities',
  'dissertation',
  'analytics',
]);

class DesktopRouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('Archive desktop failed to load:', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return html`
      <main id="main-content" className="min-h-screen px-4 py-16" style=${{ backgroundColor: '#fdfbf7' }}>
        <div className="mx-auto max-w-xl border-2 border-stone-800 bg-white p-8 shadow-lg">
          <p className="mb-2 font-body text-xs font-bold uppercase tracking-wider text-stone-500">Archive desktop unavailable</p>
          <h1 className="font-display text-3xl font-bold text-stone-900">The standard archive is still ready.</h1>
          <p className="mt-4 font-body text-sm leading-relaxed text-stone-600">
            The optional desktop view could not load. No archive data or standard navigation is affected.
          </p>
          <button
            type="button"
            onClick=${this.props.onExit}
            className="mt-6 inline-flex items-center justify-center bg-stone-900 px-5 py-3 font-display text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
          >
            Open the standard archive
          </button>
        </div>
      </main>
    `;
  }
}

// One source of truth for the empty filter state. The initial state and both
// "clear filters" paths spread this, so adding a filter field can't leave a
// reset path out of sync.
const DEFAULT_FILTERS = {
  search: '',
  categories: [],
  era: null,
  year: null,
  publication: [],
  type: null,
  includeReplies: false,
  recordIds: null,
};

const App = () => {
  const [records, setRecords] = useState([]);
  const [facets, setFacets] = useState({ categories: [], eras: [], publications: [] });
  const [autocompleteIndex, setAutocompleteIndex] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentRoute, setCurrentRoute] = useState(() => getCurrentRoute());
  const [desktopAppId, setDesktopAppId] = useState(() => getDesktopAppIdFromUrl());
  const [desktopOpenAppIds, setDesktopOpenAppIds] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState('date-asc');
  const [isScrolled, setIsScrolled] = useState(false);
  // Initialise from ?record= so a deep-linked load survives mount. The URL-sync
  // effect below runs on mount with this value already set, so it preserves the
  // param instead of deleting it; the [records] effect then validates the id
  // once the archive data finishes loading (clearing it if no record matches).
  const [selectedRecordId, setSelectedRecordId] = useState(() => getRecordIdFromUrl());
  const [selectedEntityId, setSelectedEntityId] = useState(() => getEntityIdFromUrl());
  const [toolsModalOpen, setToolsModalOpen] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [bugReportIntent, setBugReportIntent] = useState('problem');
  const [showBackToTop, setShowBackToTop] = useState(false);

  const [filters, setFilters] = useState(() => ({
    ...DEFAULT_FILTERS,
    ...parseViewState(window.location.href).filters,
  }));
  const desktopActiveNeedsRecords = currentRoute === ROUTES.desktop
    && DESKTOP_RECORD_APPS.has(desktopAppId);
  const desktopNeedsRecords = currentRoute === ROUTES.desktop
    && (
      desktopActiveNeedsRecords
      || desktopOpenAppIds.some((appId) => DESKTOP_RECORD_APPS.has(appId))
    );

  // Ref for scrolling to results
  const resultsRef = useRef(null);
  const recordsRef = useRef(null);
  const reportEntryHandled = useRef(false);

  useEffect(() => {
    if (reportEntryHandled.current) return;
    reportEntryHandled.current = true;
    const entry = readReportDeepLink(window.location.href);
    if (!entry.intent) return;
    setBugReportIntent(entry.intent);
    setBugReportOpen(true);
    window.history.replaceState({}, '', entry.cleanHref);
  }, []);

  // Migrate legacy ?view= URLs on mount, then sync hash state
  useEffect(() => {
    migrateLegacyUrl();

    const syncRoute = (event) => {
      const route = getCurrentRoute();
      setCurrentRoute(route);
      setDesktopAppId(getDesktopAppIdFromUrl());
      setSelectedEntityId(getEntityIdFromUrl());

      // Desktop filters replace the current history entry as their readable
      // query string changes. Back/Forward must therefore restore those
      // historical query-backed filters alongside the active window. Ordinary
      // hash navigation keeps the live in-memory filters (standard archive
      // filters are not URL-synchronised), while transient analytics recordIds
      // intentionally clear because they are not part of the URL contract.
      if (event?.type === 'popstate') {
        const historicalState = parseViewState(window.location.href);
        setFilters({
          ...DEFAULT_FILTERS,
          ...historicalState.filters,
        });
      }

      const recordId = getRecordIdFromUrl();
      if (recordId && records.length > 0) {
        const target = records.find(r => r.id === recordId);
        setSelectedRecordId(target ? recordId : null);
      } else if (!recordId) {
        setSelectedRecordId(null);
      }
    };

    syncRoute();
    window.addEventListener('hashchange', syncRoute);
    window.addEventListener('popstate', syncRoute);
    return () => {
      window.removeEventListener('hashchange', syncRoute);
      window.removeEventListener('popstate', syncRoute);
    };
  }, [records]);

  // Update URL when record selected (without changing route)
  useEffect(() => {
    if (desktopActiveNeedsRecords) return;
    const url = new URL(window.location.href);
    setRecordParam(url.searchParams, selectedRecordId);
    try {
      window.history.replaceState({}, '', url);
    } catch(e) { console.warn("History update blocked"); }
  }, [selectedRecordId, desktopActiveNeedsRecords]);

  // Desktop archive links preserve the canonical filter query plus the shared
  // ?record= deep link. The hash only identifies the active shell app; no
  // second desktop-only filter or record URL format is introduced.
  useEffect(() => {
    if (!desktopActiveNeedsRecords) return;
    const nextUrl = viewStateToUrl({
      route: ROUTES.desktop,
      routeParams: {
        desktopAppId,
        ...(desktopAppId === 'entities' && selectedEntityId ? { entityId: selectedEntityId } : {}),
      },
      filters,
      selectedRecord: selectedRecordId,
    }, window.location.href);
    try {
      window.history.replaceState({}, '', nextUrl);
    } catch {
      console.warn('Desktop view-state update blocked');
    }
  }, [desktopActiveNeedsRecords, desktopAppId, filters, selectedRecordId, selectedEntityId]);

  useEffect(() => {
    if (currentRoute !== ROUTES.entities) return;
    const currentState = parseViewState(window.location.href);
    const nextUrl = viewStateToUrl({
      route: ROUTES.entities,
      routeParams: selectedEntityId ? { entityId: selectedEntityId } : {},
      filters: currentState.filters,
      selectedRecord: selectedRecordId,
    }, window.location.href);
    try {
      window.history.replaceState({}, '', nextUrl);
    } catch {
      console.warn('Entity view-state update blocked');
    }
  }, [currentRoute, selectedEntityId, selectedRecordId]);

  // Navigation helpers
  const goTo = useCallback((route) => {
    navigateTo(route);
  }, []);

  const goToDesktop = useCallback((appId = null) => {
    navigateToDesktop(appId);
  }, []);

  const handleDesktopGuideNavigate = useCallback((destination) => {
    if (destination === 'desktop') {
      navigateToDesktop();
    } else if (DESKTOP_GUIDED_SHELL_DESTINATIONS.has(destination)) {
      navigateToDesktop(destination);
    } else {
      navigateTo(destination);
    }
  }, []);

  // Open, close, or switch the record modal with a View Transition cross-fade
  // (#281). Used by every deliberate record selection -- grid card, entity
  // browser, in-modal related links, and close -- so they animate the same way;
  // browsers without the API just set state directly (see withViewTransition).
  // Two paths stay plain on purpose: prev/next arrow paging (handleModalNav),
  // where a cross-fade on every press would lag, and history-driven sync (back/
  // forward, deep links), which should not animate on navigation.
  const selectRecord = useCallback((id) => {
    withViewTransition(() => setSelectedRecordId(id));
  }, []);

  // Tag click handlers (from RecordModal) — go to archive and filter
  const handleFilterCategory = useCallback((cat) => {
    setFilters(prev => ({ ...prev, categories: [cat] }));
    if (currentRoute === ROUTES.desktop) navigateToDesktop('archive');
    else navigateTo(ROUTES.archive);
  }, [currentRoute]);

  const handleFilterSearch = useCallback((term) => {
    setFilters(prev => ({ ...prev, search: term }));
    if (currentRoute === ROUTES.desktop) navigateToDesktop('archive');
    else navigateTo(ROUTES.archive);
  }, [currentRoute]);

  const handleRecordEntitySelect = useCallback((entityId) => {
    setSelectedEntityId(entityId);
    if (currentRoute === ROUTES.desktop) navigateToDesktop('entities', entityId);
    else navigateTo(ROUTES.entities, null, entityId);
  }, [currentRoute]);

  const handleQueryResults = useCallback((recordIds) => {
    setFilters(prev => ({ ...prev, recordIds }));
    navigateTo(ROUTES.archive);
  }, []);

  const handleDesktopQueryResults = useCallback((recordIds) => {
    setFilters(prev => ({ ...prev, recordIds }));
    navigateToDesktop('archive');
  }, []);

  // Tool selection handler
  const handleToolSelect = useCallback((action) => {
    if (action === 'start') {
      navigateTo(ROUTES.start);
    } else if (action === 'mindmap') {
      navigateTo(ROUTES.dissertation);
    } else if (action === 'entities') {
      navigateTo(ROUTES.entities);
    } else if (action === 'wiki') {
      navigateTo(ROUTES.wiki);
    } else if (action === 'desktop') {
      navigateToDesktop();
    }
  }, []);

  // Load Data
  // Gate the ~13MB core fetch so cold deep-links into non-record routes do
  // not fetch and parse archive data those routes never render. The ref makes
  // this fire once; depending on currentRoute means navigating back to a
  // record-backed route back-fills the data.
  const coreFetchStarted = useRef(false);
  useEffect(() => {
    if (coreFetchStarted.current) return;
    if (NON_RECORD_ROUTES.has(currentRoute) && !desktopNeedsRecords) return;
    coreFetchStarted.current = true;
    perfMark('data:start');
    fetchCoreData()
      .then((data) => {
        perfMark('data:end');
        perfMeasure('data:load', 'data:start', 'data:end');
        setRecords(data.records);
        setFacets(data.facets);
        setAutocompleteIndex(data.autocompleteIndex);
        setLoading(false);
        setTimeout(() => preloadDetails(), 1000);
      })
      .catch(err => {
        console.error(err);
        setError('Failed to load archive data. Please refresh the page or try again later.');
        setLoading(false);
      });
  }, [currentRoute, desktopAppId, desktopNeedsRecords]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
      setShowBackToTop(window.scrollY > 500);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Precompute a normalized search blob per record once per data load (#456),
  // so the per-keystroke filter normalizes only the term and runs one
  // includes() per record instead of re-normalizing every field every keystroke.
  const queryRecords = useMemo(
    () => intersectByRecordIds(records, filters.recordIds),
    [records, filters.recordIds]
  );

  const queryFacets = useMemo(
    () => filters.recordIds === null ? facets : deriveFacetsForRecords(facets, queryRecords, filters),
    [facets, queryRecords, filters.recordIds, filters.categories, filters.era]
  );

  const searchIndex = useMemo(() => queryRecords.map(buildSearchText), [queryRecords]);

  // Lazy full-text index (#276), unioned with the substring blob above. Loaded
  // on first non-empty search so browse-only visits never pay for MiniSearch or
  // the ~1MB artifact. miniLoading (a ref) dedups concurrent loads across
  // keystrokes before state commits; miniReady (state) re-runs the filter once
  // the index resolves.
  const miniRef = useRef(null);
  const miniLoading = useRef(false);
  const miniRetryAfter = useRef(0);
  const [miniReady, setMiniReady] = useState(false);

  useEffect(() => {
    if (!filters.search.trim() || miniReady || miniLoading.current) return;
    // After a failure, hold off before retrying so a persistently missing index
    // (e.g. a stale deploy 404) is not refetched on every keystroke; a search
    // past the cooldown still recovers from a transient failure. loadSearchIndex
    // clears its own memo on failure, so the retry is a real re-fetch.
    if (performance.now() < miniRetryAfter.current) return;
    miniLoading.current = true;
    loadSearchIndex()
      .then((mini) => {
        // miniReady is a monotonic "index is loaded" latch, so set it
        // unconditionally even if the triggering search was cleared mid-load:
        // the filter only reads it when a search term is active, and having it
        // latched means the next search unions immediately. Not gating it on a
        // per-run cancelled flag avoids a race where a cleared-then-retyped
        // query could leave the loaded index unused until the box is edited.
        miniRef.current = mini;
        setMiniReady(true);
      })
      .catch((err) => {
        miniRetryAfter.current = performance.now() + 10000;
        console.warn('[search] full-text index unavailable; substring search only:', err.message);
      })
      .finally(() => { miniLoading.current = false; });
  }, [filters.search, miniReady]);

  const filteredRecords = useMemo(() => {
    const term = normalizeForSearch(filters.search);
    // Union the substring blob with MiniSearch full-text hits: a record matches
    // if EITHER matches. Additive by design, so social / thread / dissertation
    // records (absent from the article-scoped index) stay covered by substring,
    // and nothing regresses while the index is still loading. combineWith AND +
    // prefix = "every word present, last word may be a prefix", how a search box
    // is expected to narrow.
    const rawTerm = filters.search.trim();
    let miniIds = null;
    if (rawTerm && miniReady && miniRef.current) {
      miniIds = new Set(
        miniRef.current.search(rawTerm, { prefix: true, combineWith: 'AND' }).map((h) => h.id)
      );
    }
    let res = queryRecords.filter((r, i) => {
      if (term && !(searchIndex[i].includes(term) || (miniIds && miniIds.has(r.id)))) return false;

      if (filters.categories.length > 0) {
        const hasAll = filters.categories.every(cat => r.categories.includes(cat));
        if (!hasAll) return false;
      }

      if (filters.year) {
        if (r.year !== filters.year) return false;
      } else if (filters.era) {
        if (r.era !== filters.era) return false;
      }

      if (filters.type === 'article') {
         if (r.type === 'social') return false;
      } else if (filters.type) {
         if (r.type !== 'social') return false;
         const platform = filters.type;
         if (platform === 'twitter' && !r.pub.toLowerCase().includes('twitter') && !r.pub.toLowerCase().includes('x.com')) return false;
         if (platform === 'bluesky' && !r.pub.toLowerCase().includes('bluesky')) return false;
      }

      // Note: Short reply posts and thread members are now filtered during data export.
      // No need for title-based reply filtering here.

      return true;
    });

    res = sortRecords(res, sortBy);

    return res;
  }, [queryRecords, searchIndex, filters, sortBy, miniReady]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, sortBy]);

  // Derive viewMode from route for backward-compatible logic
  const viewMode = currentRoute === ROUTES.folders
    || (currentRoute === ROUTES.desktop && desktopAppId === 'folders')
    ? 'folder'
    : 'grid';

  useEffect(() => {
    if ((filters.search || filters.year) && viewMode === 'folder') {
      if (currentRoute === ROUTES.desktop) navigateToDesktop('archive');
      else navigateTo(ROUTES.archive);
    }
  }, [filters.search, filters.year, currentRoute, viewMode]);

  const totalPages = Math.ceil(filteredRecords.length / ITEMS_PER_PAGE);
  const paginatedRecords = filteredRecords.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const folderGroups = useMemo(() => {
    const counts = {};
    filteredRecords.forEach(r => {
      r.categories.forEach(c => counts[c] = (counts[c] || 0) + 1);
    });
    return Object.keys(counts)
      .filter(cat => counts[cat] >= 10)
      .sort((a, b) => counts[b] - counts[a])
      .slice(0, 6)
      .map(cat => ({ name: cat, count: counts[cat] }));
  }, [filteredRecords]);

  const handleFolderClick = (category) => {
    setFilters(prev => ({ ...prev, categories: [category] }));
    if (currentRoute === ROUTES.desktop) navigateToDesktop('archive');
    else navigateTo(ROUTES.archive);
  };

  const handleModalNav = (direction) => {
    if (!selectedRecordId) return;
    const idx = filteredRecords.findIndex(r => r.id === selectedRecordId);
    if (idx === -1) return;

    if (direction === 'next' && idx < filteredRecords.length - 1) {
      setSelectedRecordId(filteredRecords[idx + 1].id);
    } else if (direction === 'prev' && idx > 0) {
      setSelectedRecordId(filteredRecords[idx - 1].id);
    }
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    if (recordsRef.current) {
        const offset = 100;
        const top = recordsRef.current.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  const handleYearSelect = useCallback((year) => {
    setFilters(prev => ({ ...prev, year, era: null }));
  }, []);

  const years = records.map(r => parseInt(r.year)).filter(y => !isNaN(y));
  const minYear = years.length ? Math.min(...years) : 0;
  const maxYear = years.length ? Math.max(...years) : 0;

  // One <RecordView> element for the default archive route. RecordView owns the
  // selected-record lookup and prev/next nav math that App.js used to compute
  // inline and pass to two identical <RecordModal> call sites. #134 Step B.
  const recordView = html`
    <${RecordView}
      records=${records}
      filteredRecords=${filteredRecords}
      selectedRecordId=${selectedRecordId}
      onClose=${() => selectRecord(null)}
      onNext=${() => handleModalNav('next')}
      onPrev=${() => handleModalNav('prev')}
      onSelectRecord=${selectRecord}
      onFilterCategory=${handleFilterCategory}
      onFilterSearch=${handleFilterSearch}
      onSelectEntity=${handleRecordEntitySelect}
    />
  `;

  const isEntityBrowser = currentRoute === ROUTES.entities;
  const isWiki = currentRoute === ROUTES.wiki;
  const isAnalytics = currentRoute === ROUTES.analytics;
  const isArchiveGrid = currentRoute === ROUTES.archive || currentRoute === ROUTES.folders;

  const activeFilterCount = (filters.search ? 1 : 0) +
    filters.categories.length +
    (filters.era ? 1 : 0) +
    (filters.year ? 1 : 0) +
    (filters.type ? 1 : 0) +
    (filters.recordIds !== null ? 1 : 0);

  const desktopArchiveView = {
    viewMode,
    loading,
    error,
    filters,
    setFilters,
    facets: queryFacets,
    autocompleteIndex,
    sortBy,
    setSortBy,
    filteredRecords,
    paginatedRecords,
    folderGroups,
    currentPage,
    totalPages,
    activeFilterCount,
    onSetViewMode: (mode) => navigateToDesktop(mode === 'folder' ? 'folders' : 'archive'),
    onSelectRecord: selectRecord,
    onOpenFolder: handleFolderClick,
    onPageChange: handlePageChange,
    onClearFilters: () => setFilters({ ...DEFAULT_FILTERS }),
    onOpenStandard: (mode = viewMode) => goTo(mode === 'folder' ? ROUTES.folders : ROUTES.archive),
  };

  const desktopEntityView = {
    records: queryRecords,
    queryActive: filters.recordIds !== null,
    loading,
    error,
    onSelectRecord: selectRecord,
    selectedEntityId,
    onSelectEntity: setSelectedEntityId,
    autoFocusSelection: !selectedRecordId,
    onOpenStandard: () => goTo(ROUTES.entities),
  };

  const desktopDissertationView = {
    onOpenStandard: () => goTo(ROUTES.dissertation),
  };

  const desktopAnalyticsView = {
    onRecordResults: handleDesktopQueryResults,
    onOpenStandard: () => goTo(ROUTES.analytics),
  };

  const desktopStartView = {
    records,
    loading,
    error,
    onNavigate: handleDesktopGuideNavigate,
    onSelectRecord: selectRecord,
    onOpenBugReport: () => {
      setBugReportIntent('problem');
      setBugReportOpen(true);
    },
    onOpenStandard: () => goTo(ROUTES.start),
  };

  // Keep global overlays mounted on full-page routes. Returning a page directly
  // here used to strand any full-page action that opened the bug report modal,
  // because the modal only existed in the archive shell below.
  const renderFullPage = (page, routeOverlay = null) => html`
    <div className="min-h-screen flex flex-col">
      ${page}
      ${routeOverlay}
      <${BugReportModal}
        isOpen=${bugReportOpen}
        onClose=${() => setBugReportOpen(false)}
        endpoint=${REPORT_CONFIG.endpoint}
        initialIntent=${bugReportIntent}
      />
    </div>
  `;

  // Full-page routes: desktop, Start here, dissertation, about, analytics
  if (currentRoute === ROUTES.desktop) {
    const desktopFallback = html`
      <main id="main-content" className="min-h-screen px-4 py-16 text-white" style=${{ backgroundColor: '#0b6867' }}>
        <div className="mx-auto max-w-lg border-2 border-white/70 bg-black/20 p-6">
          <p className="font-display text-xl" role="status">Opening the archive desktop...</p>
          <button
            type="button"
            onClick=${() => goTo(ROUTES.archive)}
            className="mt-5 border-2 border-white px-4 py-3 font-body text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            Return to the standard archive
          </button>
        </div>
      </main>
    `;

    return renderFullPage(html`
      <${DesktopRouteErrorBoundary} onExit=${() => goTo(ROUTES.archive)}>
        <${Suspense} fallback=${desktopFallback}>
          <${DesktopShell}
            activeAppId=${desktopAppId}
            autoFocusWindow=${!selectedRecordId}
            onSelectApp=${goToDesktop}
            onNavigate=${goTo}
            onOpenBugReport=${() => { setBugReportIntent('problem'); setBugReportOpen(true); }}
            onExit=${() => goTo(ROUTES.archive)}
            onOpenAppsChange=${setDesktopOpenAppIds}
            archiveView=${desktopArchiveView}
            analyticsView=${desktopAnalyticsView}
            dissertationView=${desktopDissertationView}
            entityView=${desktopEntityView}
            startView=${desktopStartView}
          />
        <//>
      <//>
    `, desktopActiveNeedsRecords ? recordView : null);
  }

  if (currentRoute === ROUTES.start) {
    const handleStartRecordSelect = (recordOrId) => {
      const id = typeof recordOrId === 'string' ? recordOrId : recordOrId?.id;
      if (!id || !records.some(record => record.id === id)) return;
      navigateTo(ROUTES.archive, id);
      selectRecord(id);
    };

    return renderFullPage(html`
      <${StartHerePage}
        onBack=${() => goTo(ROUTES.archive)}
        records=${records}
        onNavigate=${goTo}
        onOpenBugReport=${() => { setBugReportIntent('problem'); setBugReportOpen(true); }}
        onSelectRecord=${handleStartRecordSelect}
      />
    `);
  }

  if (currentRoute === ROUTES.dissertation) {
    return renderFullPage(html`<${DissertationPage} onBack=${() => goTo(ROUTES.archive)} />`);
  }

  if (currentRoute === ROUTES.about) {
    return renderFullPage(html`
      <${AboutPage}
        onBack=${() => goTo(ROUTES.archive)}
        onStart=${() => goTo(ROUTES.start)}
        onParticipate=${() => { window.location.href = resolveSitePath('features/participate/'); }}
        records=${records}
      />
    `);
  }

  if (isAnalytics) {
    return renderFullPage(html`
      <${AnalyticsDashboard}
        onBack=${() => goTo(ROUTES.archive)}
        onRecordResults=${handleQueryResults}
      />
    `);
  }

  // Shared fail-loud panel for the record-backed routes. fetchCoreData throws
  // on a core-data outage (#290), so both the archive grid and the entity
  // browser depend on the same load; render the same error on each instead of
  // letting the entity route show an empty browser with no explanation (#369).
  const errorPanel = error && html`
    <div className="text-center py-20 border-2 border-red-200 rounded-lg bg-red-50 mx-4">
        <${AlertCircle} className="w-12 h-12 mx-auto text-red-500 mb-4" />
        <h3 className="font-display text-xl text-red-700 mb-2">Error loading archive</h3>
        <p className="text-red-600 text-sm mb-6">${error}</p>
        <button
            onClick=${() => window.location.reload()}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-bold text-sm"
        >
            Reload Page
        </button>
    </div>
  `;

  return html`
    <div className="min-h-screen flex flex-col">
      <${WelcomeModal} onStart=${() => goTo(ROUTES.start)} />

      <${ToolsModal}
        isOpen=${toolsModalOpen}
        onClose=${() => setToolsModalOpen(false)}
        onSelectTool=${handleToolSelect}
      />

      <${BugReportModal}
        isOpen=${bugReportOpen}
        onClose=${() => setBugReportOpen(false)}
        endpoint=${REPORT_CONFIG.endpoint}
        initialIntent=${bugReportIntent}
      />

      ${recordView}

      <${WorkInProgressBanner} />

      <header className=${`sticky top-0 z-50 w-full border-b transition-all duration-300 ${
          isScrolled
            ? 'bg-paper border-stone-300 shadow-sm'
            : 'bg-paper/80 backdrop-blur-md border-stone-200'
      }`}>
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <button
              onClick=${() => goTo(ROUTES.archive)}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer"
              aria-label="Return to archive home"
            >
                <div className="bg-stone-900 text-white p-1.5">
                    <${Newspaper} className="w-5 h-5" />
                </div>
                <h1 className="text-lg md:text-xl font-display font-bold text-stone-900 tracking-tight hidden sm:block">
                    Jay Rosen's Internet Archive
                </h1>
                <h1 className="text-lg font-display font-bold text-stone-900 sm:hidden">JRIA</h1>
            </button>

            <div className="hidden md:flex items-center gap-6 text-xs text-stone-500 border-l border-r border-stone-200 px-6 h-full">
                <div className="flex flex-col leading-tight">
                    <span className="font-bold text-stone-900">${records.length}</span>
                    <span>records</span>
                </div>
                <div className="h-6 w-px bg-stone-200"></div>
                <div className="flex flex-col leading-tight">
                    <span className="font-bold text-stone-900">${minYear}–${maxYear}</span>
                    <span>timeline</span>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <button
                  onClick=${() => setToolsModalOpen(true)}
                  className="sm:hidden p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-md border border-stone-200"
                  aria-label="Tools"
                >
                    <${Compass} className="w-5 h-5" />
                </button>
                <button
                  onClick=${() => goTo(ROUTES.about)}
                  className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-md transition-colors hidden md:flex items-center gap-1 text-xs"
                  aria-label="About"
                >
                    <${Info} className="w-4 h-4" />
                    <span>About</span>
                </button>
                <button
                  onClick=${() => { setBugReportIntent('problem'); setBugReportOpen(true); }}
                  className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-md transition-colors flex items-center gap-1 text-xs"
                  aria-label="Report a bug"
                  title="Report a bug"
                >
                    <${Bug} className="w-4 h-4" />
                    <span className="hidden md:inline">Report a bug</span>
                </button>
                <a href="https://github.com/jamditis" target="_blank" rel="noreferrer" className="text-stone-500 hover:text-stone-900 transition-colors text-xs hidden md:inline-block">
                    Curated by Joe Amditis
                </a>
                ${isArchiveGrid && html`
                    <button
                    onClick=${() => setSidebarOpen(true)}
                    className="lg:hidden p-2 text-stone-800 hover:bg-stone-100 rounded-md border border-stone-300 relative"
                    >
                        <${SlidersHorizontal} className="w-5 h-5" />
                        ${activeFilterCount > 0 && html`
                          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                            ${activeFilterCount}
                          </span>
                        `}
                    </button>
                `}
            </div>
        </div>
      </header>

      <div className=${`flex-grow container mx-auto px-4 py-6 flex gap-8 ${isEntityBrowser || isWiki ? 'justify-center' : ''}`}>

         ${isArchiveGrid && html`
             <${Sidebar}
                facets=${queryFacets}
                filters=${filters}
                setFilters=${setFilters}
                isOpen=${sidebarOpen}
                onClose=${() => setSidebarOpen(false)}
                resetFilters=${() => setFilters({ ...DEFAULT_FILTERS })}
                autocompleteIndex=${autocompleteIndex}
             />
         `}

         <main className="flex-grow min-w-0 flex flex-col">

            ${isArchiveGrid && html`
                <div>
                    ${!filters.search && !filters.era && !filters.year && filters.categories.length === 0 && filters.recordIds === null && html`
                        <section className="mb-6 pb-4 border-b border-stone-200">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-stone-500 mr-1">Tools:</span>
                                <button
                                    onClick=${() => goTo(ROUTES.dissertation)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-full border border-stone-200 hover:border-stone-400 hover:bg-stone-50 transition-all text-xs font-medium text-stone-600 hover:text-stone-800"
                                >
                                    <${BookOpen} className="w-3.5 h-3.5" />
                                    Mind Map
                                </button>
                                <button
                                    onClick=${() => goTo(ROUTES.entities)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-full border border-stone-200 hover:border-stone-400 hover:bg-stone-50 transition-all text-xs font-medium text-stone-600 hover:text-stone-800"
                                >
                                    <${Users} className="w-3.5 h-3.5" />
                                    Entities
                                </button>
                                <button
                                    onClick=${() => goTo(ROUTES.analytics)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-full border border-stone-200 hover:border-stone-400 hover:bg-stone-50 transition-all text-xs font-medium text-stone-600 hover:text-stone-800"
                                >
                                    <${BarChart3} className="w-3.5 h-3.5" />
                                    Analytics
                                </button>
                                <button
                                    onClick=${() => setToolsModalOpen(true)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 rounded-full border border-stone-200 hover:border-stone-400 hover:bg-stone-200 transition-all text-xs font-medium text-stone-500 hover:text-stone-700"
                                >
                                    <${Compass} className="w-3.5 h-3.5" />
                                    More
                                </button>
                            </div>
                        </section>
                    `}

                    ${!loading && !filters.search && !filters.era && !filters.year && filters.categories.length === 0 && filters.recordIds === null && html`
                        <${FeaturedSection} />
                    `}

                    ${!loading && !filters.search && !filters.era && filters.categories.length === 0 && html`
                        <${Timeline}
                          records=${queryRecords}
                          selectedYear=${filters.year}
                          onSelectYear=${handleYearSelect}
                        />
                    `}
                </div>
            `}

            ${isWiki && html`
                <${WikiPage} />
            `}

            ${isArchiveGrid && html`
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4 border-b border-stone-200 pb-4 scroll-mt-24" ref=${recordsRef}>
                <div className="font-display text-stone-500 text-sm">
                    ${loading
                      ? 'Loading archive...'
                      : `${filteredRecords.length} records found${filters.recordIds !== null ? ' in query results' : ''}`}
                </div>
                <div className="flex items-center gap-3">
                   <div className="flex bg-stone-200 p-1 rounded mr-4">
                        <button
                          onClick=${() => goTo(ROUTES.archive)}
                          className=${`flex items-center justify-center gap-2 py-1.5 px-3 text-xs font-medium rounded shadow-sm transition-all ${currentRoute === ROUTES.archive ? 'bg-white text-stone-900' : 'text-stone-600 hover:bg-stone-100'}`}
                          title="Grid View"
                        >
                            <${LayoutGrid} className="w-3 h-3" /> <span className="hidden sm:inline">Cards</span>
                        </button>
                        <button
                          onClick=${() => goTo(ROUTES.folders)}
                          className=${`flex items-center justify-center gap-2 py-1.5 px-3 text-xs font-medium rounded shadow-sm transition-all ${currentRoute === ROUTES.folders ? 'bg-white text-stone-900' : 'text-stone-600 hover:bg-stone-100'}`}
                          title="Folder View"
                        >
                            <${Folder} className="w-3 h-3" /> <span className="hidden sm:inline">Folders</span>
                        </button>
                    </div>

                    <div class="flex items-center">
                        <label htmlFor="sort-select" className="text-xs font-bold text-stone-500 uppercase hidden sm:inline mr-2">Sort:</label>
                        <select
                        id="sort-select"
                        value=${sortBy}
                        onChange=${(e) => setSortBy(e.target.value)}
                        className="bg-transparent border-b border-stone-300 text-sm font-bold text-stone-800 focus:outline-none focus:border-stone-800 py-1 pr-8 cursor-pointer"
                        >
                            <option value="date-desc">Newest first</option>
                            <option value="date-asc">Oldest first</option>
                            <option value="title-asc">Title (A-Z)</option>
                        </select>
                    </div>
                </div>
            </div>
            `}

            ${isEntityBrowser && html`
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4 border-b border-stone-200 pb-4 scroll-mt-24">
                <div className="font-display text-stone-500 text-sm">
                    Browse entities and their connections
                </div>
            </div>
            `}

            ${isEntityBrowser && errorPanel}

            ${isEntityBrowser && !loading && !error && html`
                <${EntityBrowser}
                  records=${queryRecords}
                  queryActive=${filters.recordIds !== null}
                  onSelectRecord=${selectRecord}
                  selectedEntityId=${selectedEntityId}
                  onSelectEntity=${setSelectedEntityId}
                  autoFocusSelection=${!selectedRecordId}
                />
            `}

            ${isArchiveGrid && html`
                <${ArchiveResults}
                  errorPanel=${errorPanel}
                  loading=${loading}
                  filteredRecords=${filteredRecords}
                  paginatedRecords=${paginatedRecords}
                  folderGroups=${folderGroups}
                  viewMode=${viewMode}
                  searchTerm=${filters.search}
                  currentPage=${currentPage}
                  totalPages=${totalPages}
                  onSelectRecord=${selectRecord}
                  onOpenFolder=${handleFolderClick}
                  onPageChange=${handlePageChange}
                  onClearFilters=${() => setFilters({ ...DEFAULT_FILTERS })}
                />
            `}
         </main>

      ${showBackToTop && html`
        <button
          onClick=${() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-40 p-3 bg-stone-800 text-white rounded-full shadow-lg hover:bg-stone-700 transition-all hover:scale-110"
          aria-label="Back to top"
        >
          <${ChevronUp} className="w-5 h-5" />
        </button>
      `}
      </div>

      <footer className="border-t border-stone-200 bg-stone-50 mt-auto">
        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-sm text-stone-600">
            <div>
              <h4 className="font-display font-bold text-stone-900 mb-2">Jay Rosen's Internet Archive</h4>
              <p className="text-xs leading-relaxed">
                A curated public collection of the works, critiques, and teachings of Jay Rosen, professor of journalism at New York University.
              </p>
            </div>
            <div>
              <h4 className="font-display font-bold text-stone-900 mb-2">Sections</h4>
              <div className="space-y-1 text-xs">
                <button onClick=${() => goTo(ROUTES.start)} className="block hover:text-stone-900 transition-colors">Start here</button>
                <a href=${resolveSitePath('features/participate/')} className="block hover:text-stone-900 transition-colors">Ways to participate</a>
                <button onClick=${() => goTo(ROUTES.archive)} className="block hover:text-stone-900 transition-colors">Browse archive</button>
                <button onClick=${() => goTo(ROUTES.dissertation)} className="block hover:text-stone-900 transition-colors">Dissertation mind map</button>
                <button onClick=${() => goTo(ROUTES.entities)} className="block hover:text-stone-900 transition-colors">Entity browser</button>
                <button onClick=${() => goTo(ROUTES.analytics)} className="block hover:text-stone-900 transition-colors">Analytics dashboard</button>
                <button onClick=${() => goTo(ROUTES.about)} className="block hover:text-stone-900 transition-colors">About this archive</button>
              </div>
            </div>
            <div>
              <h4 className="font-display font-bold text-stone-900 mb-2">Credits</h4>
              <p className="text-xs leading-relaxed mb-2">
                Curated by <a href="https://github.com/jamditis" target="_blank" rel="noreferrer" className="text-stone-900 font-bold hover:underline">Joe Amditis</a>
              </p>
              <p className="text-xs text-stone-600">
                ${records.length} records | ${minYear}–${maxYear}
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  `;
}

export default App;
