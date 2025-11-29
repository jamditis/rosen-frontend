
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Newspaper, SlidersHorizontal, LayoutGrid, Folder, SearchX, ChevronLeft, ChevronRight, Network, FolderOpen, BookOpen } from 'lucide-react';
import { fetchArchiveData, hashString } from './services/archiveService';
import { ArchiveRecord, Facets, FilterState } from './types';
import { ITEMS_PER_PAGE, COLORS } from './constants';
import Sidebar from './components/Sidebar';
import WelcomeModal from './components/WelcomeModal';
import RecordModal from './components/RecordModal';
import FeaturedSection from './components/FeaturedSection';
import Timeline from './components/Timeline';
import Explorer from './components/Explorer';
import DissertationPage from './pages/DissertationPage';

// Helper to highlight text
const Highlight: React.FC<{ text: string; term: string }> = ({ text, term }) => {
  if (!term || term.length < 2) return <>{text}</>;
  const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === term.toLowerCase() ? <mark key={i}>{part}</mark> : part
      )}
    </>
  );
};

const App: React.FC = () => {
  // --- State ---
  const [records, setRecords] = useState<ArchiveRecord[]>([]);
  const [facets, setFacets] = useState<Facets>({ categories: [], eras: [], publications: [] });
  const [autocompleteIndex, setAutocompleteIndex] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'folder' | 'explorer'>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'title-asc'>('date-desc');
  const [isScrolled, setIsScrolled] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'archive' | 'dissertation'>('archive');

  // Refs
  const recordsRef = useRef<HTMLDivElement>(null);

  const [filters, setFilters] = useState<FilterState>({
    search: '',
    categories: [],
    era: null,
    year: null,
    publication: [],
    type: null
  });

  // --- Check URL for view param on mount ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    if (viewParam === 'dissertation') {
      setCurrentView('dissertation');
    }
  }, []);

  // --- Data Loading ---
  useEffect(() => {
    fetchArchiveData()
      .then((data) => {
        setRecords(data.records);
        setFacets(data.facets);
        setAutocompleteIndex(data.autocompleteIndex);
        setLoading(false);

        // Check URL for deep link
        const params = new URLSearchParams(window.location.search);
        const recordParam = params.get('record');
        if (recordParam) {
             const target = data.records.find(r => r.id === recordParam);
             if (target) setSelectedRecordId(recordParam);
        }
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
      // Wrap in try-catch to prevent security errors in some sandboxes
      try {
        window.history.pushState({}, '', url);
      } catch (e) {
        console.warn("Could not update URL history", e);
      }
  }, [selectedRecordId]);

  // Update URL when view changes
  useEffect(() => {
      const url = new URL(window.location.href);
      if (currentView === 'dissertation') {
          url.searchParams.set('view', 'dissertation');
          url.searchParams.delete('record'); // Clear record param when viewing dissertation
      } else {
          url.searchParams.delete('view');
      }
      try {
        window.history.pushState({}, '', url);
      } catch (e) {
        console.warn("Could not update URL history", e);
      }
  }, [currentView]);

  // Navigation handlers
  const navigateToDissertation = () => setCurrentView('dissertation');
  const navigateToArchive = () => setCurrentView('archive');

  // --- Scroll Listener ---
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // --- Filtering & Sorting ---
  const filteredRecords = useMemo(() => {
    const term = filters.search.toLowerCase();
    let res = records.filter(r => {
      // Search
      const matchesSearch = !term || 
        r.title.toLowerCase().includes(term) || 
        r.summary.toLowerCase().includes(term) ||
        r.quote.toLowerCase().includes(term) ||
        r.concepts.some(c => c.toLowerCase().includes(term));
      if (!matchesSearch) return false;

      // Categories
      if (filters.categories.length > 0) {
        const hasAll = filters.categories.every(cat => r.categories.includes(cat));
        if (!hasAll) return false;
      }

      // Era
      if (filters.year) {
        if (r.year !== filters.year) return false;
      } else if (filters.era) {
        if (r.era !== filters.era) return false;
      }
      
      // Type
      if (filters.type === 'video') {
         if (!(r.url.includes('youtube') || r.url.includes('vimeo'))) return false;
      } else if (filters.type === 'article') {
         // "Article" implies standard text content, so we exclude video. 
         // Social media posts are technically text but handled by specific filters if chosen.
         // If "article" is selected, we usually want just traditional reads, so exclude known video platforms.
         if (r.url.includes('youtube') || r.url.includes('vimeo')) return false;
      } else if (filters.type) {
         // Specific social types
         if (r.type !== 'social') return false;
         // Further refine by platform if needed based on pub name or url
         const platform = filters.type as string;
         if (platform === 'twitter' && !r.pub.toLowerCase().includes('twitter') && !r.pub.toLowerCase().includes('x.com')) return false;
         if (platform === 'bluesky' && !r.pub.toLowerCase().includes('bluesky')) return false;
         if (platform === 'tumblr' && !r.pub.toLowerCase().includes('tumblr')) return false;
      }

      return true;
    });

    // Sort
    res = res.sort((a, b) => {
        if (sortBy === 'date-asc') return a.date.localeCompare(b.date);
        if (sortBy === 'title-asc') return a.title.localeCompare(b.title);
        return b.date.localeCompare(a.date);
    });

    return res;
  }, [records, filters, sortBy]);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, sortBy]);

  // Force grid view on search or year filter (unless already in explorer)
  useEffect(() => {
    if ((filters.search || filters.year) && viewMode === 'folder') setViewMode('grid');
  }, [filters.search, filters.year, viewMode]);

  // --- Pagination Logic ---
  const totalPages = Math.ceil(filteredRecords.length / ITEMS_PER_PAGE);
  const paginatedRecords = filteredRecords.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // --- Folder View Logic ---
  const folderGroups = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredRecords.forEach(r => {
      r.categories.forEach(c => counts[c] = (counts[c] || 0) + 1);
    });
    return Object.keys(counts)
      .sort((a, b) => counts[b] - counts[a])
      .map(cat => ({ name: cat, count: counts[cat] }));
  }, [filteredRecords]);

  // --- Handlers ---
  const handleFolderClick = (category: string) => {
    setFilters(prev => ({ ...prev, categories: [category] }));
    setViewMode('grid');
  };

  const handleModalNav = (direction: 'next' | 'prev') => {
    if (!selectedRecordId) return;
    const idx = filteredRecords.findIndex(r => r.id === selectedRecordId);
    if (idx === -1) return;
    
    if (direction === 'next' && idx < filteredRecords.length - 1) {
      setSelectedRecordId(filteredRecords[idx + 1].id);
    } else if (direction === 'prev' && idx > 0) {
      setSelectedRecordId(filteredRecords[idx - 1].id);
    }
  };

  const handleYearSelect = (year: string | null) => {
    setFilters(prev => ({
        ...prev,
        year: year,
        era: year ? null : prev.era // Clear era if year selected
    }));
  };

  const handlePageChange = (newPage: number) => {
      setCurrentPage(newPage);
      if (recordsRef.current) {
          const offset = 100;
          const top = recordsRef.current.getBoundingClientRect().top + window.scrollY - offset;
          window.scrollTo({ top, behavior: 'smooth' });
      }
  };

  // Calculate stats
  const years = records.map(r => parseInt(r.year)).filter(y => !isNaN(y));
  const minYear = years.length ? Math.min(...years) : 0;
  const maxYear = years.length ? Math.max(...years) : 0;

  const selectedRecord = filteredRecords.find(r => r.id === selectedRecordId) || null;
  const selectedRecordIndex = filteredRecords.findIndex(r => r.id === selectedRecordId);
  
  // Is explorer mode active?
  const isExplorer = viewMode === 'explorer';

  // If viewing dissertation, render the dissertation page
  if (currentView === 'dissertation') {
    return <DissertationPage onBack={navigateToArchive} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <WelcomeModal />

      <RecordModal
        record={selectedRecord}
        allRecords={records}
        isOpen={!!selectedRecordId}
        onClose={() => setSelectedRecordId(null)}
        onNext={() => handleModalNav('next')}
        onPrev={() => handleModalNav('prev')}
        onSelectRecord={setSelectedRecordId}
        hasPrev={selectedRecordIndex > 0}
        hasNext={selectedRecordIndex < filteredRecords.length - 1}
        currentIndex={selectedRecordIndex}
        total={filteredRecords.length}
      />

      {/* Header */}
      <header className={`sticky top-0 z-50 w-full border-b transition-all duration-300 ${
          isScrolled
            ? 'bg-paper border-stone-300 shadow-sm'
            : 'bg-paper/80 backdrop-blur-md border-stone-200'
      }`}>
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="bg-stone-900 text-white p-1.5">
                    <Newspaper className="w-5 h-5" />
                </div>
                <h1 className="text-lg md:text-xl font-display font-bold text-stone-900 tracking-tight hidden sm:block">
                    Jay Rosen digital archive
                </h1>
                <h1 className="text-lg font-display font-bold text-stone-900 sm:hidden">JRDA</h1>
            </div>

            <div className="hidden md:flex items-center gap-6 text-xs text-stone-500 border-l border-r border-stone-200 px-6 h-full">
                <div className="flex flex-col leading-tight">
                    <span className="font-bold text-stone-900">{records.length}</span>
                    <span>records</span>
                </div>
                <div className="h-6 w-px bg-stone-200"></div>
                <div className="flex flex-col leading-tight">
                    <span className="font-bold text-stone-900">{minYear}–{maxYear}</span>
                    <span>timeline</span>
                </div>
            </div>

            <div className="flex items-center gap-4">
                {/* Dissertation Link */}
                <button
                  onClick={navigateToDissertation}
                  className="flex items-center gap-2 text-stone-600 hover:text-stone-900 transition-colors text-xs border border-stone-200 px-3 py-1.5 hover:border-stone-300 hidden sm:flex"
                >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>1986 Dissertation</span>
                </button>
                <a href="https://twitter.com/jsamditis" target="_blank" rel="noreferrer" className="text-stone-500 hover:text-stone-900 transition-colors text-xs hidden md:inline-block">
                    Curated by Joe Amditis
                </a>
                {/* Hide mobile menu button in explorer mode since sidebar is hidden */}
                {!isExplorer && (
                    <button
                    onClick={() => setSidebarOpen(true)}
                    className="lg:hidden p-2 text-stone-800 hover:bg-stone-100 rounded-md border border-stone-300"
                    >
                        <SlidersHorizontal className="w-5 h-5" />
                    </button>
                )}
            </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className={`flex-grow container mx-auto px-4 py-6 flex gap-8 ${isExplorer ? 'justify-center' : ''}`}>
         
         {/* Sidebar: Hidden in Explorer Mode */}
         {!isExplorer && (
             <Sidebar 
                facets={facets}
                filters={filters}
                setFilters={setFilters}
                isOpen={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
                resetFilters={() => setFilters({ search: '', categories: [], era: null, year: null, publication: [], type: null })}
                autocompleteIndex={autocompleteIndex}
             />
         )}

         <main className="flex-grow min-w-0 flex flex-col">
            
            {/* Featured & Timeline - Only show when not exploring and no filters active */}
            {!isExplorer && (
                <div>
                    {!loading && !filters.search && !filters.era && !filters.year && filters.categories.length === 0 && (
                        <FeaturedSection />
                    )}

                    {/* Timeline Component */}
                    {!loading && (
                        <Timeline 
                            records={records}
                            selectedYear={filters.year}
                            onSelectYear={handleYearSelect}
                        />
                    )}
                </div>
            )}

            {/* Top Controls Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4 border-b border-stone-200 pb-4 scroll-mt-24" ref={recordsRef}>
                <div className="font-display text-stone-500 text-sm">
                    {isExplorer 
                        ? "Interactive relationship explorer" 
                        : (loading ? 'Loading archive...' : `${filteredRecords.length} records found`)
                    }
                </div>
                <div className="flex items-center gap-3">
                   {/* View Toggle */}
                   <div className="flex bg-stone-200 p-1 rounded mr-4">
                        <button 
                          onClick={() => setViewMode('grid')}
                          className={`flex items-center justify-center gap-2 py-1.5 px-3 text-xs font-medium rounded shadow-sm transition-all ${viewMode === 'grid' ? 'bg-white text-stone-900' : 'text-stone-600 hover:bg-stone-100'}`}
                          title="Grid View"
                        >
                            <LayoutGrid className="w-3 h-3" /> <span className="hidden sm:inline">Cards</span>
                        </button>
                        <button 
                          onClick={() => setViewMode('folder')}
                          className={`flex items-center justify-center gap-2 py-1.5 px-3 text-xs font-medium rounded shadow-sm transition-all ${viewMode === 'folder' ? 'bg-white text-stone-900' : 'text-stone-600 hover:bg-stone-100'}`}
                          title="Folder View"
                        >
                            <Folder className="w-3 h-3" /> <span className="hidden sm:inline">Folders</span>
                        </button>
                        <button 
                          onClick={() => setViewMode('explorer')}
                          className={`flex items-center justify-center gap-2 py-1.5 px-3 text-xs font-medium rounded shadow-sm transition-all ${viewMode === 'explorer' ? 'bg-white text-stone-900' : 'text-stone-600 hover:bg-stone-100'}`}
                          title="Explorer View"
                        >
                            <Network className="w-3 h-3" /> <span className="hidden sm:inline">Explorer</span>
                        </button>
                    </div>

                    {/* Sort Selector (Hidden in Explorer) */}
                    {!isExplorer && (
                        <div className="flex items-center">
                            <label htmlFor="sort-select" className="text-xs font-bold text-stone-500 uppercase hidden sm:inline mr-2">Sort:</label>
                            <select 
                            id="sort-select" 
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as any)}
                            className="bg-transparent border-b border-stone-300 text-sm font-bold text-stone-800 focus:outline-none focus:border-stone-800 py-1 pr-8 cursor-pointer"
                            >
                                <option value="date-desc">Newest first</option>
                                <option value="date-asc">Oldest first</option>
                                <option value="title-asc">Title (A-Z)</option>
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {/* --- EXPLORER MODE --- */}
            {isExplorer && !loading && (
                <Explorer records={records} />
            )}

            {/* --- STANDARD MODES (Grid/Folder) --- */}
            {!isExplorer && (
                <div>
                    {/* Loading Skeleton */}
                    {loading && (
                    <div className="columns-1 md:columns-2 xl:columns-3 gap-6 space-y-6">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} className="break-inside-avoid bg-white border border-stone-200 p-6 shadow-sm h-64 animate-pulse" />
                        ))}
                    </div>
                    )}

                    {/* Empty State */}
                    {!loading && filteredRecords.length === 0 && (
                    <div className="text-center py-20 border-2 border-dashed border-stone-200 rounded-lg bg-stone-50">
                        <SearchX className="w-12 h-12 mx-auto text-stone-300 mb-4" />
                        <h3 className="font-display text-xl text-stone-700 mb-2">No records found</h3>
                        <p className="text-stone-500 text-sm mb-6">Try adjusting your search terms or filters.</p>
                        <button 
                            onClick={() => setFilters({ search: '', categories: [], era: null, year: null, publication: [], type: null })}
                            className="text-sm border-b-2 border-stone-800 pb-0.5 hover:text-stone-600 transition-colors font-bold"
                        >
                            Clear all filters
                        </button>
                    </div>
                    )}

                    {/* Grid View */}
                    {!loading && viewMode === 'grid' && (
                    <div className="columns-1 md:columns-2 xl:columns-3 gap-6 space-y-6">
                        {paginatedRecords.map(item => {
                            const primaryCat = item.categories[0] || 'Uncategorized';
                            const colorIdx = hashString(primaryCat) % COLORS.length;
                            const theme = COLORS[colorIdx];
                            
                            return (
                            <div 
                                key={item.id}
                                onClick={() => setSelectedRecordId(item.id)}
                                className="break-inside-avoid mb-6 bg-white border border-stone-200 hover:border-stone-400 hover:shadow-lg transition-all duration-300 rounded-sm flex flex-col group cursor-pointer overflow-hidden relative"
                            >
                                <div className="h-1 w-full" style={{ backgroundColor: theme.text }}></div>
                                <div className="p-6 flex flex-col h-full">
                                    <div className="flex justify-between items-start mb-3">
                                        <span className="text-xs font-bold uppercase tracking-wider text-stone-400">{item.pub}</span>
                                        <span className="text-xs text-stone-400 font-mono border border-stone-200 px-1 rounded">{item.year}</span>
                                    </div>
                                    
                                    <h3 className="text-lg font-display font-bold text-stone-900 leading-tight mb-3 group-hover:text-stone-600 transition-colors">
                                        <Highlight text={item.title} term={filters.search} />
                                    </h3>
                                    
                                    <p className="text-stone-600 text-sm leading-relaxed mb-4 flex-grow font-body">
                                        <Highlight text={item.summary.length > 180 ? item.summary.substring(0, 180) + '...' : item.summary} term={filters.search} />
                                    </p>
            
                                    <div className="mt-auto pt-4 border-t border-stone-100 flex flex-wrap gap-2">
                                        {item.categories.slice(0, 2).map(c => (
                                            <span key={c} className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-stone-100 text-stone-600 tracking-wide border border-stone-200">
                                                {c}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            );
                        })}
                    </div>
                    )}

                    {/* Folder View */}
                    {!loading && viewMode === 'folder' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {folderGroups.map(group => {
                            const colorIdx = hashString(group.name) % COLORS.length;
                            const theme = COLORS[colorIdx];
                            
                            return (
                            <button 
                                key={group.name}
                                onClick={() => handleFolderClick(group.name)}
                                className="text-left group relative flex flex-col h-40 transition-transform hover:-translate-y-1 focus:outline-none"
                            >
                                {/* Tab */}
                                <div 
                                    className="folder-tab-shape w-1/2 h-8 border-t border-l border-r relative z-10 translate-y-[1px] ml-0"
                                    style={{ backgroundColor: theme.bg, borderColor: theme.border }}
                                >
                                    <span 
                                        className="px-4 py-2 text-[10px] font-bold uppercase block truncate"
                                        style={{ color: theme.text }}
                                    >
                                        {group.count} records
                                    </span>
                                </div>
                                {/* Body */}
                                <div className="flex-grow w-full bg-white border border-stone-300 rounded-r-md rounded-b-md shadow-sm p-6 relative z-20 flex items-center">
                                    <div className="w-1 h-full absolute left-0 top-0 rounded-l-sm" style={{ backgroundColor: theme.text }} />
                                    <h3 className="text-lg font-display font-bold text-stone-800 group-hover:underline decoration-stone-300 underline-offset-4">
                                        {group.name}
                                    </h3>
                                    <FolderOpen className="w-6 h-6 ml-auto text-stone-300 group-hover:text-stone-500 transition-colors" style={{ color: `group-hover:${theme.text}` }} />
                                </div>
                            </button>
                            )
                        })}
                    </div>
                    )}

                    {/* Pagination */}
                    {!loading && viewMode === 'grid' && totalPages > 1 && (
                        <div className="mt-12 flex justify-center items-center gap-4">
                            <button 
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="p-2 border border-stone-300 rounded hover:bg-stone-100 disabled:opacity-30 transition-all"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <span className="font-display text-stone-600">Page {currentPage} of {totalPages}</span>
                            <button 
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="p-2 border border-stone-300 rounded hover:bg-stone-100 disabled:opacity-30 transition-all"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    )}
                </div>
            )}

         </main>
      </div>
    </div>
  );
}

export default App;
