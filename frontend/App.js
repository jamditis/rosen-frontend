
import { Component, Suspense, lazy, useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { html } from './html.js?v=3.8.7';
import { Newspaper, SlidersHorizontal, LayoutGrid, Folder, BookOpen, Compass, AlertCircle, ChevronUp, BarChart3, Users, Info, Bug, Github, Search, XCircle } from 'lucide-react';
import { fetchCoreData, fetchRecordDetails, preloadDetails, loadSearchIndex } from './services/archiveService.js?v=3.8.7';
import { perfMark, perfMeasure } from './utils/perfMark.js?v=3.8.7';
import { withViewTransition } from './utils/viewTransition.js?v=3.8.7';
import { CONTENT_TYPE_OPTIONS, ITEMS_PER_PAGE, REPORT_CONFIG } from './constants.js?v=3.8.7';
import { ROUTES, getCurrentRoute, getDesktopAppIdFromUrl, getEntityIdFromUrl, navigateTo, navigateToDesktop, getRecordIdFromUrl, migrateLegacyUrl } from './services/router.js?v=3.8.7';
import { parseViewState, viewStateToUrl } from './services/viewState.js?v=3.8.7';
import { setRecordParam } from './utils/recordDeepLink.js?v=3.8.7';
import { readReportDeepLink } from './utils/reportDeepLink.js?v=3.8.7';
import { resolveSitePath } from './utils/pathResolver.js?v=3.8.7';
import { recordNeedsReview } from './utils/needsReview.js?v=3.8.7';
import { buildSearchText, normalizeForSearch } from './utils/searchNormalize.js?v=3.8.7';
import { sortRecords } from './utils/recordSort.js?v=3.8.7';
import { deriveFacetsForRecords, intersectByRecordIds } from './services/queryComposition.js?v=3.8.7';
import Sidebar from './components/Sidebar.js?v=3.8.7';
import WelcomeModal from './components/WelcomeModal.js?v=3.8.7';
import RecordView from './components/RecordView.js?v=3.8.7';
import FeaturedSection from './components/FeaturedSection.js?v=3.8.7';
import DissertationPage from './components/DissertationPage.js?v=3.8.7';
import ToolsModal from './components/ToolsModal.js?v=3.8.7';
import BugReportModal from './components/BugReportModal.js?v=3.8.7';
import WorkInProgressBanner from './components/WorkInProgressBanner.js?v=3.8.7';
import AnalyticsDashboard from './components/AnalyticsDashboard.js?v=3.8.7';
import EntityBrowser from './components/EntityBrowser.js?v=3.8.7';
import Timeline from './components/Timeline.js?v=3.8.7';
import AboutPage from './components/AboutPage.js?v=3.8.7';
import WikiPage from './components/WikiPage.js?v=3.8.7';
import StartHerePage from './components/StartHerePage.js?v=3.8.7';
import ArchiveResults from './components/ArchiveResults.js?v=3.8.7';

const DesktopShell = lazy(() => import('./desktop/DesktopShell.js?v=3.8.7'));

const NON_RECORD_ROUTES = new Set([
  ROUTES.analytics,
  ROUTES.wiki,
  ROUTES.desktop,
]);

const DESKTOP_RECORD_APPS = new Set(['archive', 'folders', 'entities', 'start', 'findings']);
const DESKTOP_DETAILS_PRELOAD_APPS = new Set(['archive', 'folders']);
const DESKTOP_GUIDED_SHELL_DESTINATIONS = new Set([
  'archive',
  'folders',
  'entities',
  'dissertation',
  'analytics',
]);

const ROUTE_ENTRY_FOCUS_SELECTOR = '[data-route-entry-focus], #main-content';

class DesktopRouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
    this.failureHeading = null;
    this.focusFailureFrame = null;
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('Archive desktop failed to load:', error);
    this.focusFailureFrame = requestAnimationFrame(() => {
      this.focusFailureFrame = null;
      this.failureHeading?.focus({ preventScroll: true });
    });
  }

  componentWillUnmount() {
    if (this.focusFailureFrame !== null) cancelAnimationFrame(this.focusFailureFrame);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return html`
      <main id="main-content" className="min-h-screen px-4 py-16" style=${{ backgroundColor: '#fdfbf7' }}>
        <div className="mx-auto max-w-xl border-2 border-stone-800 bg-white p-8 shadow-lg">
          <p className="mb-2 font-body text-xs font-bold uppercase tracking-wider text-stone-500">Archive desktop unavailable</p>
          <h1
            ref=${(element) => { this.failureHeading = element; }}
            tabIndex="-1"
            className="font-display text-3xl font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
          >The standard archive is still ready.</h1>
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
  const [bugReportInitialFields, setBugReportInitialFields] = useState({});
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [announcedResultCount, setAnnouncedResultCount] = useState('');

  const [filters, setFilters] = useState(() => ({
    ...DEFAULT_FILTERS,
    ...parseViewState(window.location.href).filters,
  }));
  const desktopActiveNeedsRecords = currentRoute === ROUTES.desktop
    && DESKTOP_RECORD_APPS.has(desktopAppId);
  const desktopDisallowsRecordContext = currentRoute === ROUTES.desktop
    && !DESKTOP_RECORD_APPS.has(desktopAppId);
  const selectedRecordIsLoaded = useMemo(
    () => Boolean(selectedRecordId) && records.some(({ id }) => id === selectedRecordId),
    [records, selectedRecordId],
  );
  const desktopRecordOverlayOpen = desktopActiveNeedsRecords && selectedRecordIsLoaded;
  const desktopNeedsRecords = currentRoute === ROUTES.desktop
    && (
      desktopActiveNeedsRecords
      || desktopOpenAppIds.some((appId) => DESKTOP_RECORD_APPS.has(appId))
    );
  const desktopNeedsDetailsPreload = currentRoute === ROUTES.desktop
    && (
      DESKTOP_DETAILS_PRELOAD_APPS.has(desktopAppId)
      || desktopOpenAppIds.some((appId) => DESKTOP_DETAILS_PRELOAD_APPS.has(appId))
    );

  // Ref for scrolling to results
  const resultsRef = useRef(null);
  const recordsRef = useRef(null);
  const filterTriggerRef = useRef(null);
  const scopeStatusRef = useRef(null);
  const scopeTokenRefs = useRef(new Map());
  const pendingScopeFocusKey = useRef(null);
  const reportEntryHandled = useRef(false);
  const previouslyRenderedRoute = useRef(currentRoute);

  const openBugReport = useCallback((intent = 'problem', initialFields = {}) => {
    setBugReportIntent(intent);
    setBugReportInitialFields(initialFields);
    setBugReportOpen(true);
  }, []);

  const handleRecordProblemReport = useCallback(() => {
    // The selected record id already stays in the page URL captured with the
    // report. Keep the required description empty so the reader must describe
    // the actual problem instead of submitting an auto-filled prefix alone.
    openBugReport('problem');
  }, [openBugReport]);

  // Hash navigation replaces parts of the React tree without giving the
  // browser a document-navigation focus reset. When the invoking control is
  // unmounted, focus otherwise falls through to <body> and a keyboard or
  // screen-reader user receives no indication that a new page appeared.
  //
  // Child views with a more precise destination (record dialogs, selected
  // entities, Start here, desktop windows) claim focus in their own effects.
  // Re-check at paint time and yield to any connected non-body target so this
  // fallback cannot overwrite those richer focus contracts.
  useEffect(() => {
    const previousRoute = previouslyRenderedRoute.current;
    previouslyRenderedRoute.current = currentRoute;
    if (previousRoute === currentRoute) return undefined;

    const frame = requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement
        && activeElement !== document.body
        && activeElement.isConnected
      ) return;

      const focusTarget = document.querySelector(ROUTE_ENTRY_FOCUS_SELECTOR);
      if (!(focusTarget instanceof HTMLElement)) return;
      focusTarget.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [currentRoute]);

  useEffect(() => {
    if (reportEntryHandled.current) return;
    reportEntryHandled.current = true;
    const entry = readReportDeepLink(window.location.href);
    if (!entry.intent) return;
    setBugReportIntent(entry.intent);
    setBugReportInitialFields({});
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
    setRecordParam(
      url.searchParams,
      desktopDisallowsRecordContext ? null : selectedRecordId,
    );
    if (desktopDisallowsRecordContext) {
      url.searchParams.delete('entity');
      if (selectedRecordId !== null) setSelectedRecordId(null);
    }
    try {
      window.history.replaceState({}, '', url);
    } catch(e) { console.warn("History update blocked"); }
  }, [selectedRecordId, desktopActiveNeedsRecords, desktopDisallowsRecordContext]);

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

  const clearQueryFilter = useCallback(() => {
    setFilters(prev => ({ ...prev, recordIds: null }));
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
      })
      .catch(err => {
        console.error(err);
        setError('Failed to load archive data. Please refresh the page or try again later.');
        setLoading(false);
      });
  }, [currentRoute, desktopAppId, desktopNeedsRecords]);

  // Preserve the standard archive's background full-detail warmup, but keep
  // the lighter guided and entity desktop surfaces on core data until a
  // record is actually opened. Archive/Folders opt back in even when they are
  // restored in a background window. Cancelling the timer when the route or
  // visible window set changes avoids paying for a surface the visitor left.
  useEffect(() => {
    const detailsPreloadEnabled = currentRoute !== ROUTES.desktop
      || desktopNeedsDetailsPreload;
    if (!records.length || !detailsPreloadEnabled) return undefined;

    const timer = setTimeout(() => preloadDetails(), 1000);
    return () => clearTimeout(timer);
  }, [records.length, currentRoute, desktopNeedsDetailsPreload]);

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAnnouncedResultCount(loading
        ? 'Loading archive'
        : `${filteredRecords.length} record${filteredRecords.length === 1 ? '' : 's'}`);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [loading, filteredRecords.length]);

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

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    requestAnimationFrame(() => filterTriggerRef.current?.focus({ preventScroll: true }));
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
      onReportProblem=${handleRecordProblemReport}
      nestedDialogOpen=${bugReportOpen}
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

  const contentTypeLabel = CONTENT_TYPE_OPTIONS.find(option => option.value === filters.type)?.label;

  const activeScopeTokens = [
    filters.search ? { key: 'search', kind: 'search', label: `Search: “${filters.search}”` } : null,
    ...filters.categories.map(category => ({
      key: `category-${category}`,
      kind: 'category',
      value: category,
      label: category,
    })),
    filters.era ? { key: 'era', kind: 'era', label: filters.era } : null,
    filters.year ? { key: 'year', kind: 'year', label: filters.year } : null,
    filters.type ? { key: 'type', kind: 'type', label: contentTypeLabel || filters.type } : null,
    filters.recordIds !== null ? { key: 'query', kind: 'recordIds', label: 'Query results' } : null,
  ].filter(Boolean);
  const activeScopeKey = activeScopeTokens.map(token => token.key).join('|');

  const clearScopeToken = (token) => {
    const tokenIndex = activeScopeTokens.findIndex(candidate => candidate.key === token.key);
    pendingScopeFocusKey.current = activeScopeTokens[tokenIndex + 1]?.key
      || activeScopeTokens[tokenIndex - 1]?.key
      || 'status';
    setFilters(prev => {
      if (token.kind === 'category') {
        return { ...prev, categories: prev.categories.filter(category => category !== token.value) };
      }
      if (token.kind === 'search') return { ...prev, search: '' };
      if (token.kind === 'era') return { ...prev, era: null };
      if (token.kind === 'year') return { ...prev, year: null };
      if (token.kind === 'type') return { ...prev, type: null };
      if (token.kind === 'recordIds') return { ...prev, recordIds: null };
      return prev;
    });
  };

  const clearAllScope = () => {
    pendingScopeFocusKey.current = 'status';
    setFilters({ ...DEFAULT_FILTERS });
  };

  useEffect(() => {
    if (!pendingScopeFocusKey.current) return undefined;
    const frame = requestAnimationFrame(() => {
      const focusKey = pendingScopeFocusKey.current;
      pendingScopeFocusKey.current = null;
      const focusTarget = focusKey === 'status'
        ? scopeStatusRef.current
        : scopeTokenRefs.current.get(focusKey);
      focusTarget?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeScopeKey]);

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
    onClearQuery: clearQueryFilter,
    loading,
    error,
    onSelectRecord: selectRecord,
    selectedEntityId,
    onSelectEntity: setSelectedEntityId,
    autoFocusSelection: !desktopRecordOverlayOpen,
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
    onOpenBugReport: () => openBugReport('problem'),
    onOpenStandard: () => goTo(ROUTES.start),
  };

  // Keep global overlays mounted on full-page routes. Returning a page directly
  // here used to strand any full-page action that opened the bug report modal,
  // because the modal only existed in the archive shell below.
  const renderFullPage = (page, routeOverlay = null) => html`
    <div className="min-h-screen flex flex-col archive-canvas">
      ${page}
      ${routeOverlay}
      <${BugReportModal}
        isOpen=${bugReportOpen}
        onClose=${() => setBugReportOpen(false)}
        endpoint=${REPORT_CONFIG.endpoint}
        initialIntent=${bugReportIntent}
        initialFields=${bugReportInitialFields}
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
            autoFocusWindow=${!desktopRecordOverlayOpen}
            onSelectApp=${goToDesktop}
            onNavigate=${goTo}
            onOpenBugReport=${() => openBugReport('problem')}
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
        onOpenBugReport=${() => openBugReport('problem')}
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
    <div className="archive-error-state" role="alert">
        <${AlertCircle} className="archive-error-state__icon" aria-hidden="true" />
        <p className="archive-section-label">Archive status</p>
        <h3>Error loading archive</h3>
        <p>${error}</p>
        <button
            type="button"
            onClick=${() => window.location.reload()}
            className="archive-action archive-action--danger"
        >
            Reload page
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
        initialFields=${bugReportInitialFields}
      />

      ${recordView}

      <${WorkInProgressBanner} />

      <header className=${`archive-site-header sticky top-0 z-50 w-full transition-all duration-300 ${
          isScrolled
            ? 'archive-site-header--scrolled'
            : ''
      }`}>
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <button
              onClick=${() => goTo(ROUTES.archive)}
              className="archive-site-header__brand"
              aria-label="Return to archive home"
            >
                <div className="archive-site-header__mark">
                    <${Newspaper} className="w-5 h-5" />
                </div>
                <h1 className="text-lg md:text-xl font-display font-bold text-stone-900 tracking-tight hidden sm:block">
                    Jay Rosen's Internet Archive
                </h1>
                <h1 className="text-lg font-display font-bold text-stone-900 sm:hidden">JRIA</h1>
            </button>

            <div className="archive-site-header__stats hidden md:flex items-center gap-6 px-6 h-full">
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
                  className="archive-action archive-action--quiet archive-site-header__action archive-site-header__tools sm:hidden"
                  aria-label="Tools"
                >
                    <${Compass} className="w-5 h-5" />
                </button>
                <button
                  onClick=${() => goTo(ROUTES.about)}
                  className="archive-action archive-action--quiet archive-site-header__action archive-site-header__about hidden md:flex"
                  aria-label="About"
                >
                    <${Info} className="w-4 h-4" />
                    <span>About</span>
                </button>
                <button
                  onClick=${() => openBugReport('problem')}
                  className="archive-action archive-action--quiet archive-site-header__action"
                  aria-label="Report a bug"
                  title="Report a bug"
                >
                    <${Bug} className="w-4 h-4" />
                    <span className="hidden md:inline">Report a bug</span>
                </button>
                <a href="https://github.com/jamditis" target="_blank" rel="noreferrer" className="archive-site-header__credit">
                    Curated by Joe Amditis
                </a>
                ${isArchiveGrid && html`
                    <button
                    type="button"
                    ref=${filterTriggerRef}
                    onClick=${() => setSidebarOpen(true)}
                    className="archive-site-header__filter lg:hidden p-2 text-stone-800 hover:bg-stone-100 rounded-md border border-stone-300 relative"
                    aria-label="Open archive filters"
                    aria-expanded=${sidebarOpen}
                    aria-controls="archive-filters"
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

      <div className=${`archive-discovery-layout flex-grow container mx-auto px-4 py-6 flex gap-8 ${isEntityBrowser || isWiki ? 'justify-center' : ''}`}>

         ${isArchiveGrid && html`
             <${Sidebar}
                facets=${queryFacets}
                filters=${filters}
                setFilters=${setFilters}
                isOpen=${sidebarOpen}
                onClose=${closeSidebar}
                resetFilters=${() => setFilters({ ...DEFAULT_FILTERS })}
                autocompleteIndex=${autocompleteIndex}
             />
         `}

         <main
           id="main-content"
           data-route-entry-focus
           tabIndex="-1"
           className="flex-grow min-w-0 flex flex-col outline-none"
         >

            ${isArchiveGrid && html`
                <div className="archive-discovery-intro">
                    ${activeFilterCount === 0 && html`
                        <section className="archive-tools-strip archive-density--compact mb-6">
                            <span className="archive-folder-tab archive-tools-strip__tab"><span>Tools</span></span>
                            <div className="archive-tools-strip__items">
                                <button
                                    onClick=${() => goTo(ROUTES.dissertation)}
                                    className="archive-action archive-action--quiet"
                                >
                                    <${BookOpen} className="w-3.5 h-3.5" />
                                    Mind Map
                                </button>
                                <button
                                    onClick=${() => goTo(ROUTES.entities)}
                                    className="archive-action archive-action--quiet"
                                >
                                    <${Users} className="w-3.5 h-3.5" />
                                    Entities
                                </button>
                                <button
                                    onClick=${() => goTo(ROUTES.analytics)}
                                    className="archive-action archive-action--quiet"
                                >
                                    <${BarChart3} className="w-3.5 h-3.5" />
                                    Analytics
                                </button>
                                <button
                                    onClick=${() => setToolsModalOpen(true)}
                                    className="archive-action archive-action--quiet"
                                >
                                    <${Compass} className="w-3.5 h-3.5" />
                                    More
                                </button>
                            </div>
                        </section>
                    `}
                </div>
            `}

            ${isWiki && html`
                <${WikiPage} />
            `}

            ${isArchiveGrid && html`
            <div className="archive-mobile-search">
                <label htmlFor="archive-mobile-search">Search archive</label>
                <div className="archive-mobile-search__control">
                    <${Search} className="archive-mobile-search__icon" aria-hidden="true" />
                    <input
                      id="archive-mobile-search"
                      type="search"
                      value=${filters.search}
                      onChange=${event => setFilters(prev => ({ ...prev, search: event.target.value }))}
                      placeholder="Keywords or title"
                      className="archive-control"
                    />
                    ${filters.search && html`
                      <button
                        type="button"
                        onClick=${() => setFilters(prev => ({ ...prev, search: '' }))}
                        aria-label="Clear archive search"
                      >
                        <${XCircle} aria-hidden="true" />
                      </button>
                    `}
                </div>
            </div>

            <div className="archive-results-toolbar scroll-mt-24" ref=${recordsRef}>
                <div className="archive-results-summary">
                    <span
                      ref=${scopeStatusRef}
                      tabIndex="-1"
                      className="archive-results-count"
                    >
                      ${loading
                        ? 'Loading archive...'
                        : `${filteredRecords.length} record${filteredRecords.length === 1 ? '' : 's'}${filters.recordIds !== null ? ' in query results' : ''}`}
                    </span>
                    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                      ${announcedResultCount}
                    </span>
                    ${activeScopeTokens.length > 0 && html`
                      <div className="archive-results-scope" aria-label="Active archive scope">
                        ${activeScopeTokens.map(token => html`
                          <button
                            type="button"
                            key=${token.key}
                            ref=${element => {
                              if (element) scopeTokenRefs.current.set(token.key, element);
                              else scopeTokenRefs.current.delete(token.key);
                            }}
                            data-scope-key=${token.key}
                            className="archive-scope-token"
                            onClick=${() => clearScopeToken(token)}
                            aria-label=${`Remove ${token.label} filter`}
                          >
                            <span>${token.label}</span>
                            <${XCircle} aria-hidden="true" />
                          </button>
                        `)}
                        ${activeScopeTokens.length > 1 && html`
                          <button
                            type="button"
                            className="archive-scope-clear"
                            onClick=${clearAllScope}
                          >
                            Clear all
                          </button>
                        `}
                      </div>
                    `}
                    ${viewMode === 'folder' && html`
                      <p className="archive-folder-note">Records may appear in more than one folder.</p>
                    `}
                </div>
                <div className="archive-results-controls">
                   <div className="archive-view-switch" role="group" aria-label="Archive view">
                        <button
                          type="button"
                          onClick=${() => goTo(ROUTES.archive)}
                          className=${`archive-view-switch__button ${currentRoute === ROUTES.archive ? 'is-active' : ''}`}
                          aria-pressed=${currentRoute === ROUTES.archive}
                          aria-label="Cards view"
                          title="Cards view"
                        >
                            <${LayoutGrid} className="w-3 h-3" /> <span className="hidden sm:inline">Cards</span>
                        </button>
                        <button
                          type="button"
                          onClick=${() => goTo(ROUTES.folders)}
                          className=${`archive-view-switch__button ${currentRoute === ROUTES.folders ? 'is-active' : ''}`}
                          aria-pressed=${currentRoute === ROUTES.folders}
                          aria-label="Folders view"
                          title="Folders view"
                        >
                            <${Folder} className="w-3 h-3" /> <span className="hidden sm:inline">Folders</span>
                        </button>
                    </div>

                    ${viewMode === 'grid' && html`<label className="archive-sort-control" htmlFor="sort-select">
                        <span>Sort</span>
                        <select
                        id="sort-select"
                        aria-label="Sort archive records"
                        value=${sortBy}
                        onChange=${(e) => setSortBy(e.target.value)}
                        className="archive-control archive-sort-control__select"
                        >
                            <option value="date-desc">Newest first</option>
                            <option value="date-asc">Oldest first</option>
                            <option value="title-asc">Title (A-Z)</option>
                        </select>
                    </label>`}
                </div>
            </div>
            `}

            ${currentRoute === ROUTES.archive && !loading && !filters.search && !filters.era && filters.categories.length === 0 && html`
                <${Timeline}
                  records=${queryRecords}
                  selectedYear=${filters.year}
                  onSelectYear=${handleYearSelect}
                />
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
                  onClearQuery=${clearQueryFilter}
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

            ${currentRoute === ROUTES.archive && !loading && activeFilterCount === 0 && html`
                <${FeaturedSection} />
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

      <footer className="archive-site-footer mt-auto">
        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-sm text-stone-600">
            <div>
              <h4 className="archive-site-footer__heading">Jay Rosen's Internet Archive</h4>
              <p className="text-xs leading-relaxed">
                A curated public collection of the works, critiques, and teachings of Jay Rosen, professor of journalism at New York University.
              </p>
            </div>
            <div>
              <h4 className="archive-site-footer__heading">Sections</h4>
              <div className="space-y-1 text-xs">
                <button onClick=${() => goTo(ROUTES.start)} className="archive-site-footer__link">Start here</button>
                <a href=${resolveSitePath('features/participate/')} className="archive-site-footer__link">Ways to participate</a>
                <button onClick=${() => goTo(ROUTES.archive)} className="archive-site-footer__link">Browse archive</button>
                <button onClick=${() => goTo(ROUTES.dissertation)} className="archive-site-footer__link">Dissertation mind map</button>
                <button onClick=${() => goTo(ROUTES.entities)} className="archive-site-footer__link">Entity browser</button>
                <button onClick=${() => goTo(ROUTES.analytics)} className="archive-site-footer__link">Analytics dashboard</button>
                <button onClick=${() => goTo(ROUTES.about)} className="archive-site-footer__link">About this archive</button>
              </div>
            </div>
            <div>
              <h4 className="archive-site-footer__heading">Credits</h4>
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
