
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { html } from './html.js';
import { Newspaper, SlidersHorizontal, LayoutGrid, Folder, FolderOpen, SearchX, ChevronLeft, ChevronRight, Network, BookOpen, Compass } from 'lucide-react';
import { fetchArchiveData, hashString } from './services/archiveService.js';
import { ITEMS_PER_PAGE, COLORS } from './constants.js';
import Sidebar from './components/Sidebar.js';
import WelcomeModal from './components/WelcomeModal.js';
import RecordModal from './components/RecordModal.js';
import FeaturedSection from './components/FeaturedSection.js';
import Explorer from './components/Explorer.js';
import DissertationPage from './components/DissertationPage.js';
import ToolsModal from './components/ToolsModal.js';
import LoadingQuotes from './components/LoadingQuotes.js';
import WorkInProgressBanner from './components/WorkInProgressBanner.js';

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

const App = () => {
  const [records, setRecords] = useState([]);
  const [facets, setFacets] = useState({ categories: [], eras: [], publications: [] });
  const [autocompleteIndex, setAutocompleteIndex] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState('date-desc');
  const [isScrolled, setIsScrolled] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState(null);
  const [currentView, setCurrentView] = useState('archive'); // 'archive' or 'dissertation'
  const [toolsModalOpen, setToolsModalOpen] = useState(false);

  const [filters, setFilters] = useState({
    search: '',
    categories: [],
    era: null,
    year: null,
    publication: [],
    type: null
  });

  // Ref for scrolling to results
  const resultsRef = useRef(null);
  const recordsRef = useRef(null);

  // Check URL for view param on mount and handle browser back/forward
  useEffect(() => {
    const handleURLChange = () => {
      const params = new URLSearchParams(window.location.search);
      const viewParam = params.get('view');
      const recordParam = params.get('record');

      if (viewParam === 'dissertation') {
        setCurrentView('dissertation');
        setSelectedRecordId(null);
      } else {
        setCurrentView('archive');
        if (recordParam && records.length > 0) {
          const target = records.find(r => r.id === recordParam);
          if (target) {
            setSelectedRecordId(recordParam);
          } else {
            setSelectedRecordId(null);
          }
        } else {
          setSelectedRecordId(null);
        }
      }
    };

    // Handle initial URL state
    handleURLChange();

    // Listen for browser back/forward navigation
    window.addEventListener('popstate', handleURLChange);
    return () => window.removeEventListener('popstate', handleURLChange);
  }, [records]);

  // Update URL when view changes
  useEffect(() => {
    const url = new URL(window.location.href);
    if (currentView === 'dissertation') {
      url.searchParams.set('view', 'dissertation');
      url.searchParams.delete('record');
    } else {
      url.searchParams.delete('view');
    }
    try {
      window.history.pushState({}, '', url);
    } catch(e) { console.warn("History update blocked"); }
  }, [currentView]);

  // Navigation handlers
  const navigateToDissertation = () => setCurrentView('dissertation');
  const navigateToArchive = () => setCurrentView('archive');

  // Tool selection handler
  const handleToolSelect = useCallback((action) => {
    if (action === 'mindmap') {
      setCurrentView('dissertation');
    } else if (action === 'explorer') {
      setViewMode('explorer');
    }
  }, []);

  // Load Data
  useEffect(() => {
    fetchArchiveData()
      .then((data) => {
        setRecords(data.records);
        setFacets(data.facets);
        setAutocompleteIndex(data.autocompleteIndex);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  // Update URL when record selected
  useEffect(() => {
      const url = new URL(window.location.href);
      if (selectedRecordId) {
          url.searchParams.set('record', selectedRecordId);
      } else {
          url.searchParams.delete('record');
      }
      try {
        window.history.pushState({}, '', url);
      } catch(e) { console.warn("History update blocked"); }
  }, [selectedRecordId]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const filteredRecords = useMemo(() => {
    const term = filters.search.toLowerCase();
    let res = records.filter(r => {
      const matchesSearch = !term || 
        r.title.toLowerCase().includes(term) || 
        r.summary.toLowerCase().includes(term) ||
        r.quote.toLowerCase().includes(term) ||
        r.concepts.some(c => c.toLowerCase().includes(term));
      if (!matchesSearch) return false;

      if (filters.categories.length > 0) {
        const hasAll = filters.categories.every(cat => r.categories.includes(cat));
        if (!hasAll) return false;
      }

      if (filters.year) {
        if (r.year !== filters.year) return false;
      } else if (filters.era) {
        if (r.era !== filters.era) return false;
      }
      
      if (filters.type === 'video') {
         if (!(r.url.includes('youtube') || r.url.includes('vimeo'))) return false;
      } else if (filters.type === 'article') {
         if (r.url.includes('youtube') || r.url.includes('vimeo')) return false;
      } else if (filters.type) {
         // Specific social types
         if (r.type !== 'social') return false;
         const platform = filters.type;
         if (platform === 'twitter' && !r.pub.toLowerCase().includes('twitter') && !r.pub.toLowerCase().includes('x.com')) return false;
         if (platform === 'bluesky' && !r.pub.toLowerCase().includes('bluesky')) return false;
         if (platform === 'tumblr' && !r.pub.toLowerCase().includes('tumblr')) return false;
      }

      return true;
    });

    res = res.sort((a, b) => {
        if (sortBy === 'date-asc') return a.date.localeCompare(b.date);
        if (sortBy === 'title-asc') return a.title.localeCompare(b.title);
        return b.date.localeCompare(a.date);
    });

    return res;
  }, [records, filters, sortBy]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, sortBy]);

  useEffect(() => {
    if ((filters.search || filters.year) && viewMode === 'folder') setViewMode('grid');
  }, [filters.search, filters.year, viewMode]);

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
      .filter(cat => counts[cat] >= 10) // Only show categories with 10+ records
      .sort((a, b) => counts[b] - counts[a])
      .slice(0, 6) // Limit to top 6 folders
      .map(cat => ({ name: cat, count: counts[cat] }));
  }, [filteredRecords]);

  const handleFolderClick = (category) => {
    setFilters(prev => ({ ...prev, categories: [category] }));
    setViewMode('grid');
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
    // Scroll to top of records grid instead of top of page
    if (recordsRef.current) {
        const offset = 100; // Header buffer
        const top = recordsRef.current.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  const years = records.map(r => parseInt(r.year)).filter(y => !isNaN(y));
  const minYear = years.length ? Math.min(...years) : 0;
  const maxYear = years.length ? Math.max(...years) : 0;

  const selectedRecord = filteredRecords.find(r => r.id === selectedRecordId) || null;
  const selectedRecordIndex = filteredRecords.findIndex(r => r.id === selectedRecordId);
  
  const isExplorer = viewMode === 'explorer';

  // If viewing dissertation, render the dissertation page
  if (currentView === 'dissertation') {
    return html`<${DissertationPage} onBack=${navigateToArchive} />`;
  }

  return html`
    <div className="min-h-screen flex flex-col">
      <${WelcomeModal} />

      <${ToolsModal}
        isOpen=${toolsModalOpen}
        onClose=${() => setToolsModalOpen(false)}
        onSelectTool=${handleToolSelect}
      />

      <${RecordModal} 
        record=${selectedRecord}
        allRecords=${records}
        isOpen=${!!selectedRecordId}
        onClose=${() => setSelectedRecordId(null)}
        onNext=${() => handleModalNav('next')}
        onPrev=${() => handleModalNav('prev')}
        onSelectRecord=${setSelectedRecordId}
        hasPrev=${selectedRecordIndex > 0}
        hasNext=${selectedRecordIndex < filteredRecords.length - 1}
        currentIndex=${selectedRecordIndex}
        total=${filteredRecords.length}
      />

      <header className=${`sticky top-0 z-50 w-full border-b transition-all duration-300 ${
          isScrolled 
            ? 'bg-paper border-stone-300 shadow-sm' 
            : 'bg-paper/80 backdrop-blur-md border-stone-200'
      }`}>
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="bg-stone-900 text-white p-1.5">
                    <${Newspaper} className="w-5 h-5" />
                </div>
                <h1 className="text-lg md:text-xl font-display font-bold text-stone-900 tracking-tight hidden sm:block">
                    Jay Rosen Digital Archive
                </h1>
                <h1 className="text-lg font-display font-bold text-stone-900 sm:hidden">JRDA</h1>
            </div>

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
                <!-- Mobile-only Tools Button (shows when tools section isn't visible) -->
                <button
                  onClick=${() => setToolsModalOpen(true)}
                  className="sm:hidden p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-md border border-stone-200"
                  aria-label="Explore tools"
                >
                    <${Compass} className="w-5 h-5" />
                </button>
                <a href="https://twitter.com/jsamditis" target="_blank" rel="noreferrer" className="text-stone-500 hover:text-stone-900 transition-colors text-xs hidden md:inline-block">
                    Curated by Joe Amditis
                </a>
                ${!isExplorer && html`
                    <button
                    onClick=${() => setSidebarOpen(true)}
                    className="lg:hidden p-2 text-stone-800 hover:bg-stone-100 rounded-md border border-stone-300"
                    >
                        <${SlidersHorizontal} className="w-5 h-5" />
                    </button>
                `}
            </div>
        </div>
      </header>

      <${WorkInProgressBanner} onNavigateToDissertation=${navigateToDissertation} />

      <div className=${`flex-grow container mx-auto px-4 py-6 flex gap-8 ${isExplorer ? 'justify-center' : ''}`}>
         
         ${!isExplorer && html`
             <${Sidebar} 
                facets=${facets}
                filters=${filters}
                setFilters=${setFilters}
                isOpen=${sidebarOpen}
                onClose=${() => setSidebarOpen(false)}
                resetFilters=${() => setFilters({ search: '', categories: [], era: null, year: null, publication: [], type: null })}
                autocompleteIndex=${autocompleteIndex}
             />
         `}

         <main className="flex-grow min-w-0 flex flex-col">
            
            ${!isExplorer && html`
                <div>
                    <!-- Tools Section (above Featured Works) - always visible even while loading -->
                    ${!filters.search && !filters.era && !filters.year && filters.categories.length === 0 && html`
                        <section className="mb-8 py-6 border-b border-stone-200">
                            <div className="mb-4">
                                <h2 className="font-display text-lg text-stone-800">Explore the archive</h2>
                                <p className="text-xs text-stone-500 mt-1">Interactive tools for exploring the archive</p>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                <button
                                    onClick=${navigateToDissertation}
                                    className="flex flex-col items-center p-4 bg-white rounded-lg border border-stone-200 hover:border-stone-400 hover:shadow-md transition-all group"
                                >
                                    <${BookOpen} className="w-6 h-6 text-stone-500 group-hover:text-stone-700 mb-2" />
                                    <span className="text-xs font-medium text-stone-700">Mind Map</span>
                                </button>
                                <button
                                    onClick=${() => setViewMode('explorer')}
                                    className="flex flex-col items-center p-4 bg-white rounded-lg border border-stone-200 hover:border-stone-400 hover:shadow-md transition-all group"
                                >
                                    <${Network} className="w-6 h-6 text-stone-500 group-hover:text-stone-700 mb-2" />
                                    <span className="text-xs font-medium text-stone-700">Network</span>
                                </button>
                                <a
                                    href="/wp-content/rosen-archive/comparison-tool/"
                                    className="flex flex-col items-center p-4 bg-white rounded-lg border border-stone-200 hover:border-stone-400 hover:shadow-md transition-all group"
                                >
                                    <span className="text-xl mb-1">⚡</span>
                                    <span className="text-xs font-medium text-stone-700">Then & Now</span>
                                </a>
                                <a
                                    href="/wp-content/rosen-archive/glossary/"
                                    className="flex flex-col items-center p-4 bg-white rounded-lg border border-stone-200 hover:border-stone-400 hover:shadow-md transition-all group"
                                >
                                    <span className="text-xl mb-1">📚</span>
                                    <span className="text-xs font-medium text-stone-700">Glossary</span>
                                </a>
                                <button
                                    onClick=${() => setToolsModalOpen(true)}
                                    className="flex flex-col items-center p-4 bg-stone-50 rounded-lg border border-stone-200 hover:border-stone-400 hover:shadow-md transition-all group"
                                >
                                    <${Compass} className="w-6 h-6 text-stone-400 group-hover:text-stone-600 mb-2" />
                                    <span className="text-xs font-medium text-stone-500 group-hover:text-stone-700">More tools</span>
                                </button>
                            </div>
                        </section>
                    `}

                    ${!loading && !filters.search && !filters.era && !filters.year && filters.categories.length === 0 && html`
                        <${FeaturedSection} />
                    `}
                </div>
            `}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4 border-b border-stone-200 pb-4 scroll-mt-24" ref=${recordsRef}>
                <div className="font-display text-stone-500 text-sm">
                    ${isExplorer 
                        ? "Interactive relationship explorer" 
                        : (loading ? 'Loading archive...' : `${filteredRecords.length} records found`)
                    }
                </div>
                <div className="flex items-center gap-3">
                   <div className="flex bg-stone-200 p-1 rounded mr-4">
                        <button 
                          onClick=${() => setViewMode('grid')}
                          className=${`flex items-center justify-center gap-2 py-1.5 px-3 text-xs font-medium rounded shadow-sm transition-all ${viewMode === 'grid' ? 'bg-white text-stone-900' : 'text-stone-600 hover:bg-stone-100'}`}
                          title="Grid View"
                        >
                            <${LayoutGrid} className="w-3 h-3" /> <span className="hidden sm:inline">Cards</span>
                        </button>
                        <button
                          onClick=${() => setViewMode('folder')}
                          className=${`flex items-center justify-center gap-2 py-1.5 px-3 text-xs font-medium rounded shadow-sm transition-all ${viewMode === 'folder' ? 'bg-white text-stone-900' : 'text-stone-600 hover:bg-stone-100'}`}
                          title="Folder View"
                        >
                            <${Folder} className="w-3 h-3" /> <span className="hidden sm:inline">Folders</span>
                        </button>
                    </div>

                    ${!isExplorer && html`
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
                    `}
                </div>
            </div>

            ${isExplorer && !loading && html`
                <${Explorer} records=${records} />
            `}

            ${!isExplorer && html`
                <div>
                    ${loading && html`
                    <${LoadingQuotes} />
                    `}

                    ${!loading && filteredRecords.length === 0 && html`
                    <div className="text-center py-20 border-2 border-dashed border-stone-200 rounded-lg bg-stone-50">
                        <${SearchX} className="w-12 h-12 mx-auto text-stone-300 mb-4" />
                        <h3 className="font-display text-xl text-stone-700 mb-2">No records found</h3>
                        <p className="text-stone-500 text-sm mb-6">Try adjusting your search terms or filters.</p>
                        <button 
                            onClick=${() => setFilters({ search: '', categories: [], era: null, year: null, publication: [], type: null })}
                            className="text-sm border-b-2 border-stone-800 pb-0.5 hover:text-stone-600 transition-colors font-bold"
                        >
                            Clear all filters
                        </button>
                    </div>
                    `}

                    ${!loading && viewMode === 'grid' && html`
                    <div className="columns-1 md:columns-2 xl:columns-3 gap-6 space-y-6">
                        ${paginatedRecords.map(item => {
                            const primaryCat = item.categories[0] || 'Uncategorized';
                            const colorIdx = hashString(primaryCat) % COLORS.length;
                            const theme = COLORS[colorIdx];
                            
                            return html`
                            <div 
                                key=${item.id}
                                onClick=${() => setSelectedRecordId(item.id)}
                                className="break-inside-avoid mb-6 bg-white border border-stone-200 hover:border-stone-400 hover:shadow-lg transition-all duration-300 rounded-sm flex flex-col group cursor-pointer overflow-hidden relative"
                            >
                                <div className="h-1 w-full" style=${{ backgroundColor: theme.text }}></div>
                                <div className="p-6 flex flex-col h-full">
                                    <div className="flex justify-between items-start mb-3">
                                        <span className="text-xs font-bold uppercase tracking-wider text-stone-400">${item.pub}</span>
                                        <span className="text-xs text-stone-400 font-mono border border-stone-200 px-1 rounded">${item.year}</span>
                                    </div>
                                    
                                    <h3 className="text-lg font-display font-bold text-stone-900 leading-tight mb-3 group-hover:text-stone-600 transition-colors">
                                        <${Highlight} text=${item.title} term=${filters.search} />
                                    </h3>
                                    
                                    <p className="text-stone-600 text-sm leading-relaxed mb-4 flex-grow font-body">
                                        <${Highlight} text=${item.summary.length > 180 ? item.summary.substring(0, 180) + '...' : item.summary} term=${filters.search} />
                                    </p>
            
                                    <div className="mt-auto pt-4 border-t border-stone-100 flex flex-wrap gap-2">
                                        ${item.categories.slice(0, 2).map(c => html`
                                            <span key=${c} className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-stone-100 text-stone-600 tracking-wide border border-stone-200">
                                                ${c}
                                            </span>
                                        `)}
                                    </div>
                                </div>
                            </div>
                            `;
                        })}
                    </div>
                    `}

                    ${!loading && viewMode === 'folder' && html`
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
                                    <${FolderOpen} className="w-6 h-6 ml-auto text-stone-300 group-hover:text-stone-500 transition-colors" style=${{ color: `group-hover:${theme.text}` }} />
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
      </div>
    </div>
  `;
}

export default App;
