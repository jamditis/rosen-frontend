import { useEffect, useRef, useState } from 'react';
import { html } from '../html.js?v=3.7.5';
import {
  AlertCircle,
  Filter,
  Folder,
  LayoutGrid,
  RotateCw,
} from 'lucide-react';
import ArchiveResults from '../components/ArchiveResults.js?v=3.7.5';
import Sidebar from '../components/Sidebar.js?v=3.7.5';

const DesktopArchivePanel = ({
  viewMode,
  loading,
  error,
  filters,
  setFilters,
  facets,
  autocompleteIndex,
  sortBy,
  setSortBy,
  filteredRecords,
  paginatedRecords,
  folderGroups,
  currentPage,
  totalPages,
  activeFilterCount,
  onSetViewMode,
  onSelectRecord,
  onOpenFolder,
  onPageChange,
  onClearFilters,
  onOpenStandard,
}) => {
  const [filterOpen, setFilterOpen] = useState(false);
  const resultsRef = useRef(null);
  const filterButtonRef = useRef(null);

  useEffect(() => {
    setFilterOpen(false);
  }, [viewMode]);

  useEffect(() => {
    if (!filterOpen) return undefined;
    const frame = requestAnimationFrame(() => {
      document.getElementById('desktop-archive-search')?.focus();
    });
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setFilterOpen(false);
      filterButtonRef.current?.focus();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [filterOpen]);

  const closeFilters = () => {
    setFilterOpen(false);
    filterButtonRef.current?.focus();
  };

  const changePage = (page) => {
    onPageChange(page);
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const errorPanel = error && html`
    <div className="desktop-archive-error" role="alert">
      <${AlertCircle} aria-hidden="true" />
      <div>
        <h3>Error loading archive</h3>
        <p>${error}</p>
        <button type="button" onClick=${() => window.location.reload()}>
          <${RotateCw} aria-hidden="true" />
          Reload page
        </button>
      </div>
    </div>
  `;

  return html`
    <div className="desktop-archive-panel">
      <header className="desktop-archive-heading">
        <div>
          <p className="desktop-eyebrow">Canonical collection</p>
          <h3>${viewMode === 'folder' ? 'Browse archive folders' : 'Search and read the archive'}</h3>
          <p>
            This window uses the archive's live records, filters, details, citations, and share links.
          </p>
        </div>
        <button type="button" className="desktop-standard-link" onClick=${onOpenStandard}>
          Open standard view
        </button>
      </header>

      <div className="desktop-archive-toolbar" aria-label="Archive view controls">
        <div className="desktop-view-switch" role="group" aria-label="Archive layout">
          <button
            type="button"
            className=${viewMode === 'grid' ? 'is-active' : ''}
            aria-pressed=${viewMode === 'grid'}
            onClick=${() => onSetViewMode('grid')}
          >
            <${LayoutGrid} aria-hidden="true" />
            Cards
          </button>
          <button
            type="button"
            className=${viewMode === 'folder' ? 'is-active' : ''}
            aria-pressed=${viewMode === 'folder'}
            onClick=${() => onSetViewMode('folder')}
          >
            <${Folder} aria-hidden="true" />
            Folders
          </button>
        </div>

        <button
          ref=${filterButtonRef}
          type="button"
          className="desktop-filter-toggle"
          aria-expanded=${filterOpen}
          aria-controls="desktop-archive-filter-panel"
          onClick=${() => setFilterOpen((open) => !open)}
        >
          <${Filter} aria-hidden="true" />
          Filters
          ${activeFilterCount > 0 && html`<span>${activeFilterCount}</span>`}
        </button>

        <label className="desktop-sort-control">
          <span>Sort</span>
          <select value=${sortBy} onChange=${(event) => setSortBy(event.target.value)}>
            <option value="date-desc">Newest first</option>
            <option value="date-asc">Oldest first</option>
            <option value="title-asc">Title (A–Z)</option>
          </select>
        </label>
      </div>

      <div className="desktop-archive-layout">
        <div id="desktop-archive-filter-panel">
          <${Sidebar}
            facets=${facets}
            filters=${filters}
            setFilters=${setFilters}
            isOpen=${filterOpen}
            onClose=${closeFilters}
            resetFilters=${onClearFilters}
            autocompleteIndex=${autocompleteIndex}
            variant="desktop"
          />
        </div>

        <section className="desktop-archive-result-column" aria-labelledby="desktop-result-summary" ref=${resultsRef}>
          <p id="desktop-result-summary" className="desktop-result-summary" aria-live="polite">
            ${loading
              ? 'Loading archive…'
              : `${filteredRecords.length} record${filteredRecords.length === 1 ? '' : 's'} found${filters.recordIds !== null ? ' in query results' : ''}`}
          </p>
          <${ArchiveResults}
            compact=${true}
            errorPanel=${errorPanel}
            loading=${loading}
            filteredRecords=${filteredRecords}
            paginatedRecords=${paginatedRecords}
            folderGroups=${folderGroups}
            viewMode=${viewMode}
            searchTerm=${filters.search}
            currentPage=${currentPage}
            totalPages=${totalPages}
            onSelectRecord=${onSelectRecord}
            onOpenFolder=${onOpenFolder}
            onPageChange=${changePage}
            onClearFilters=${onClearFilters}
          />
        </section>
      </div>
    </div>
  `;
};

export default DesktopArchivePanel;
