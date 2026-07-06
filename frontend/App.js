
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { html } from './html.js?v=3.6.3';
import { Newspaper, SlidersHorizontal, LayoutGrid, Folder, FolderOpen, SearchX, ChevronLeft, ChevronRight, BookOpen, Compass, AlertCircle, ChevronUp, BarChart3, Users, Info, Bug, Github } from 'lucide-react';
import { fetchCoreData, fetchRecordDetails, preloadDetails, hashString, loadSearchIndex } from './services/archiveService.js?v=3.6.3';
import { perfMark, perfMeasure } from './utils/perfMark.js?v=3.6.3';
import { withViewTransition } from './utils/viewTransition.js?v=3.6.3';
import { ITEMS_PER_PAGE, COLORS, REPORT_CONFIG } from './constants.js?v=3.6.3';
import { ROUTES, getCurrentRoute, navigateTo, getRecordIdFromUrl, migrateLegacyUrl } from './services/router.js?v=3.6.3';
import { setRecordParam } from './utils/recordDeepLink.js?v=3.6.3';
import { recordNeedsReview } from './utils/needsReview.js?v=3.6.3';
import { buildSearchText, normalizeForSearch } from './utils/searchNormalize.js?v=3.6.3';
import Sidebar from './components/Sidebar.js?v=3.6.3';
import WelcomeModal from './components/WelcomeModal.js?v=3.6.3';
import RecordView from './components/RecordView.js?v=3.6.3';
import FeaturedSection from './components/FeaturedSection.js?v=3.6.3';
import DissertationPage from './components/DissertationPage.js?v=3.6.3';
import ToolsModal from './components/ToolsModal.js?v=3.6.3';
import BugReportModal from './components/BugReportModal.js?v=3.6.3';
import LoadingQuotes from './components/LoadingQuotes.js?v=3.6.3';
import WorkInProgressBanner from './components/WorkInProgressBanner.js?v=3.6.3';
import AnalyticsDashboard from './components/AnalyticsDashboard.js?v=3.6.3';
import EntityBrowser from './components/EntityBrowser.js?v=3.6.3';
import Timeline from './components/Timeline.js?v=3.6.3';
import AboutPage from './components/AboutPage.js?v=3.6.3';
import WikiPage from './components/WikiPage.js?v=3.6.3';

// Helper to highlight text
const Highlight = ({ text, term }) => {
  if (!term || term.length < 2) return html`<span>${text}</span>`;
  const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return html`
    <span>
      ${parts.map((part, i) =>
        part.toLowerCase() === term.toLowerCase() ? html`<mark key=${i}>${part}</mark>` : part
      )}
    </span>
  `;
};

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
};

const App = () => {
  const [records, setRecords] = useState([]);
  const [facets, setFacets] = useState({ categories: [], eras: [], publications: [] });
  const [autocompleteIndex, setAutocompleteIndex] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentRoute, setCurrentRoute] = useState(() => getCurrentRoute());
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState('date-asc');
  const [isScrolled, setIsScrolled] = useState(false);
  // Initialise from ?record= so a deep-linked load survives mount. The URL-sync
  // effect below runs on mount with this value already set, so it preserves the
  // param instead of deleting it; the [records] effect then validates the id
  // once the archive data finishes loading (clearing it if no record matches).
  const [selectedRecordId, setSelectedRecordId] = useState(() => getRecordIdFromUrl());
  const [toolsModalOpen, setToolsModalOpen] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });

  // Ref for scrolling to results
  const resultsRef = useRef(null);
  const recordsRef = useRef(null);

  // Migrate legacy ?view= URLs on mount, then sync hash state
  useEffect(() => {
    migrateLegacyUrl();

    const syncRoute = () => {
      const route = getCurrentRoute();
      setCurrentRoute(route);

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
    const url = new URL(window.location.href);
    setRecordParam(url.searchParams, selectedRecordId);
    try {
      window.history.replaceState({}, '', url);
    } catch(e) { console.warn("History update blocked"); }
  }, [selectedRecordId]);

  // Navigation helpers
  const goTo = useCallback((route) => {
    navigateTo(route);
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
    navigateTo(ROUTES.archive);
  }, []);

  const handleFilterSearch = useCallback((term) => {
    setFilters(prev => ({ ...prev, search: term }));
    navigateTo(ROUTES.archive);
  }, []);

  // Tool selection handler
  const handleToolSelect = useCallback((action) => {
    if (action === 'mindmap') {
      navigateTo(ROUTES.dissertation);
    } else if (action === 'entities') {
      navigateTo(ROUTES.entities);
    } else if (action === 'wiki') {
      navigateTo(ROUTES.wiki);
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
    if (currentRoute === ROUTES.analytics || currentRoute === ROUTES.wiki) return;
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
  }, [currentRoute]);

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
  const searchIndex = useMemo(() => records.map(buildSearchText), [records]);

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
    let res = records.filter((r, i) => {
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

    res = res.sort((a, b) => {
        if (sortBy === 'date-asc') return a.date.localeCompare(b.date);
        if (sortBy === 'title-asc') return a.title.localeCompare(b.title);
        return b.date.localeCompare(a.date);
    });

    return res;
  }, [records, searchIndex, filters, sortBy, miniReady]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, sortBy]);

  // Derive viewMode from route for backward-compatible logic
  const viewMode = currentRoute === ROUTES.folders ? 'folder' : 'grid';

  useEffect(() => {
    if ((filters.search || filters.year) && currentRoute === ROUTES.folders) {
      navigateTo(ROUTES.archive);
    }
  }, [filters.search, filters.year, currentRoute]);

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
    navigateTo(ROUTES.archive);
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
    (filters.type ? 1 : 0);

  // Full-page routes: dissertation, about, analytics
  if (currentRoute === ROUTES.dissertation) {
    return html`<${DissertationPage} onBack=${() => goTo(ROUTES.archive)} />`;
  }

  if (currentRoute === ROUTES.about) {
    return html`<${AboutPage} onBack=${() => goTo(ROUTES.archive)} records=${records} />`;
  }

  if (isAnalytics) {
    return html`<${AnalyticsDashboard} onBack=${() => goTo(ROUTES.archive)} />`;
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
      <${WelcomeModal} />

      <${ToolsModal}
        isOpen=${toolsModalOpen}
        onClose=${() => setToolsModalOpen(false)}
        onSelectTool=${handleToolSelect}
      />

      <${BugReportModal}
        isOpen=${bugReportOpen}
        onClose=${() => setBugReportOpen(false)}
        endpoint=${REPORT_CONFIG.endpoint}
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
                  onClick=${() => setBugReportOpen(true)}
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
                facets=${facets}
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
                    ${!filters.search && !filters.era && !filters.year && filters.categories.length === 0 && html`
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

                    ${!loading && !filters.search && !filters.era && !filters.year && filters.categories.length === 0 && html`
                        <${FeaturedSection} />
                    `}

                    ${!loading && !filters.search && !filters.era && filters.categories.length === 0 && html`
                        <${Timeline}
                          records=${records}
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
                    ${loading ? 'Loading archive...' : `${filteredRecords.length} records found`}
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
                <${EntityBrowser} records=${records} onSelectRecord=${selectRecord} />
            `}

            ${isArchiveGrid && html`
                <div>
                    ${errorPanel}

                    ${!error && loading && html`
                    <${LoadingQuotes} />
                    `}

                    ${!error && !loading && filteredRecords.length === 0 && html`
                    <div className="text-center py-20 border-2 border-dashed border-stone-200 rounded-lg bg-stone-50">
                        <${SearchX} className="w-12 h-12 mx-auto text-stone-300 mb-4" />
                        <h3 className="font-display text-xl text-stone-700 mb-2">No records found</h3>
                        <p className="text-stone-500 text-sm mb-6">Try adjusting your search terms or filters.</p>
                        <button
                            onClick=${() => setFilters({ ...DEFAULT_FILTERS })}
                            className="text-sm border-b-2 border-stone-800 pb-0.5 hover:text-stone-600 transition-colors font-bold"
                        >
                            Clear all filters
                        </button>
                    </div>
                    `}

                    ${!error && !loading && viewMode === 'grid' && html`
                    <div className="columns-1 md:columns-2 xl:columns-3 gap-6 space-y-6">
                        ${paginatedRecords.map(item => {
                            const primaryCat = item.categories[0] || 'Uncategorized';
                            const colorIdx = hashString(primaryCat) % COLORS.length;
                            const theme = COLORS[colorIdx];

                            return html`
                            <div
                                key=${item.id}
                                onClick=${() => selectRecord(item.id)}
                                className="break-inside-avoid mb-6 bg-white border border-stone-200 hover:border-stone-400 hover:shadow-lg transition-all duration-300 rounded-sm flex flex-col group cursor-pointer overflow-hidden relative"
                            >
                                <div className="h-1 w-full" style=${{ backgroundColor: theme.text }}></div>
                                <div className="p-6 flex flex-col h-full">
                                    <div className="flex justify-between items-start mb-3">
                                        <span className="text-xs font-bold uppercase tracking-wider text-stone-400">${item.pub}</span>
                                        <span className="text-xs text-stone-400 font-mono border border-stone-200 px-1 rounded">${item.date}</span>
                                    </div>

                                    <h3 className="text-lg font-display font-bold text-stone-900 leading-tight mb-3 group-hover:text-stone-600 transition-colors">
                                        <${Highlight} text=${item.title} term=${filters.search} />
                                    </h3>

                                    <p className="text-stone-600 text-sm leading-relaxed mb-4 flex-grow font-body">
                                        <${Highlight} text=${item.summaryPreview || item.summary || ''} term=${filters.search} />
                                    </p>

                                    <div className="mt-auto pt-4 border-t border-stone-100 flex flex-wrap gap-2">
                                        ${item.categories.slice(0, 2).map(c => html`
                                            <span key=${c} className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-stone-100 text-stone-600 tracking-wide border border-stone-200">
                                                ${c}
                                            </span>
                                        `)}
                                        ${recordNeedsReview(item) && html`
                                            <span
                                                className="text-[10px] uppercase font-bold px-2 py-1 rounded tracking-wide"
                                                style=${{ backgroundColor: '#fffbeb', color: '#b45309' }}
                                                title="Auto-submitted; pending a human review pass"
                                            >
                                                needs review
                                            </span>
                                        `}
                                    </div>
                                </div>
                            </div>
                            `;
                        })}
                    </div>
                    `}

                    ${!error && !loading && viewMode === 'folder' && html`
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        ${folderGroups.map(group => {
                            const colorIdx = hashString(group.name) % COLORS.length;
                            const theme = COLORS[colorIdx];

                            return html`
                            <button
                                key=${group.name}
                                onClick=${() => handleFolderClick(group.name)}
                                className="text-left group relative flex flex-col h-40 transition-transform hover:-translate-y-1 focus:outline-none"
                            >
                                <div
                                    className="folder-tab-shape w-1/2 h-8 border-t border-l border-r relative z-10 translate-y-[1px] ml-0"
                                    style=${{ backgroundColor: theme.bg, borderColor: theme.border }}
                                >
                                    <span
                                        className="px-4 py-2 text-[10px] font-bold uppercase block truncate"
                                        style=${{ color: theme.text }}
                                    >
                                        ${group.count} records
                                    </span>
                                </div>
                                <div className="flex-grow w-full bg-white border border-stone-300 rounded-r-md rounded-b-md shadow-sm p-6 relative z-20 flex items-center">
                                    <div className="w-1 h-full absolute left-0 top-0 rounded-l-sm" style=${{ backgroundColor: theme.text }} />
                                    <h3 className="text-lg font-display font-bold text-stone-800 group-hover:underline decoration-stone-300 underline-offset-4">
                                        ${group.name}
                                    </h3>
                                    <${FolderOpen} className="w-6 h-6 ml-auto text-stone-300 group-hover:text-stone-500 transition-colors" />
                                </div>
                            </button>
                            `;
                        })}
                    </div>
                    `}

                    ${!loading && viewMode === 'grid' && totalPages > 1 && html`
                        <div className="mt-12 flex justify-center items-center gap-4">
                            <button
                            onClick=${() => handlePageChange(currentPage - 1)}
                            disabled=${currentPage === 1}
                            className="p-2 border border-stone-300 rounded hover:bg-stone-100 disabled:opacity-30 transition-all"
                            >
                                <${ChevronLeft} className="w-5 h-5" />
                            </button>
                            <span className="font-display text-stone-600">Page ${currentPage} of ${totalPages}</span>
                            <button
                            onClick=${() => handlePageChange(currentPage + 1)}
                            disabled=${currentPage === totalPages}
                            className="p-2 border border-stone-300 rounded hover:bg-stone-100 disabled:opacity-30 transition-all"
                            >
                                <${ChevronRight} className="w-5 h-5" />
                            </button>
                        </div>
                    `}
                </div>
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
              <p className="text-xs text-stone-400">
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
