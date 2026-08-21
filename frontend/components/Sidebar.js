
import { useState, useEffect, useRef } from 'react';
import { html } from '../html.js?v=3.8.23';
import { X, Search, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import {
  findSearchSuggestions,
  normalizeForSearch,
} from '../utils/searchNormalize.js?v=3.8.23';
import { CONTENT_TYPE_OPTIONS } from '../constants.js?v=3.8.23';

const Sidebar = ({
  facets,
  filters,
  setFilters,
  isOpen,
  onClose,
  resetFilters,
  autocompleteIndex,
  variant = 'standard',
}) => {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
  ));
  const searchRef = useRef(null);
  const searchInputRef = useRef(null);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setFilters(prev => ({ ...prev, search: val }));

    if (val.length > 1) {
      const matched = findSearchSuggestions(autocompleteIndex, val, 8);
      setSuggestions(matched);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (term) => {
    setFilters(prev => ({ ...prev, search: term }));
    setShowSuggestions(false);
  };

  const toggleCategory = (cat) => {
    setFilters(prev => {
      const exists = prev.categories.includes(cat);
      return {
        ...prev,
        categories: exists ? prev.categories.filter(c => c !== cat) : [...prev.categories, cat]
      };
    });
  };

  const handleEraChange = (era) => {
    setFilters(prev => ({
        ...prev,
        era: prev.era === era ? null : era,
        year: null
    }));
  };

  const handleTypeChange = (type) => {
    setFilters(prev => ({ ...prev, type }));
  };

  const handleResetFilters = () => {
    resetFilters();
    setSuggestions([]);
    setShowSuggestions(false);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const syncViewport = () => setIsCompactViewport(media.matches);
    syncViewport();
    media.addEventListener('change', syncViewport);
    return () => media.removeEventListener('change', syncViewport);
  }, []);

  const visibleCategories = showAllCategories
    ? facets.categories
    : facets.categories.slice(0, 10);

  // Count active filters for mobile summary
  const activeFilterCount = (filters.search ? 1 : 0) +
    filters.categories.length +
    (filters.era ? 1 : 0) +
    (filters.year ? 1 : 0) +
    (filters.type ? 1 : 0) +
    (filters.recordIds !== null ? 1 : 0);
  const embedded = variant === 'desktop';
  const searchInputId = embedded ? 'desktop-archive-search' : 'archive-search';
  const FilterPanelTag = embedded ? 'div' : 'aside';
  const drawerIsInert = !embedded && isCompactViewport && !isOpen;

  return html`
    <div className=${embedded ? 'desktop-filter-root archive-filter-sidebar-root' : 'archive-filter-sidebar-root'}>
        <div
          className=${embedded
            ? `desktop-filter-backdrop ${isOpen ? 'is-open' : ''}`
            : `fixed inset-0 bg-black/50 z-[55] lg:hidden backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          onClick=${onClose}
          aria-hidden="true"
        />

      <${FilterPanelTag}
        id=${embedded ? 'desktop-archive-filters' : 'archive-filters'}
        className=${embedded
          ? `desktop-filter-panel archive-filter-sidebar ${isOpen ? 'is-open' : ''}`
          : `
            archive-filter-sidebar
            fixed inset-y-0 left-0 z-[60] lg:z-auto w-80 bg-[#fdfbf7] border-r border-stone-300
            transform transition-transform duration-300 ease-out lg:translate-x-0 lg:static lg:w-64 lg:bg-transparent lg:border-none lg:block shrink-0
            overflow-y-auto lg:overflow-visible shadow-2xl lg:shadow-none
            ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
        aria-label=${embedded ? undefined : 'Archive filters'}
        aria-hidden=${drawerIsInert ? 'true' : undefined}
        inert=${drawerIsInert ? '' : undefined}
      >
        <div className="archive-filter-sidebar__inner p-5 lg:p-0">

          <div className="flex justify-between items-center lg:hidden mb-6">
            <h3 className="font-display text-xl">Filters and sort</h3>
            <button type="button" onClick=${onClose} className="p-1 hover:bg-stone-200 rounded" aria-label="Close archive filters">
              <${X} className="w-6 h-6" aria-hidden="true" />
            </button>
          </div>

          ${activeFilterCount > 0 && html`
            <div className="archive-filter-sidebar__active">
              <div>
                <span className="font-bold">${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} active</span>
                ${filters.search && html` — searching "${filters.search}"`}
                ${filters.categories.length > 0 && html` — ${filters.categories.join(', ')}`}
                ${filters.era && html` — ${filters.era}`}
                ${filters.type && html` — ${filters.type}`}
                ${filters.recordIds !== null && html`, query results`}
              </div>
              <button type="button" onClick=${handleResetFilters}>Reset all</button>
            </div>
          `}

          ${filters.recordIds !== null && html`
            <div className="border border-amber-300 bg-amber-50 p-3 text-xs text-stone-700">
              <p className="font-bold">Limited to query results</p>
              <button
                type="button"
                onClick=${() => setFilters(prev => ({ ...prev, recordIds: null }))}
                className="mt-2 inline-flex items-center gap-1 font-bold text-amber-900 underline underline-offset-2 hover:text-stone-900"
              >
                <${XCircle} className="h-4 w-4" aria-hidden="true" />
                Clear query results
              </button>
            </div>
          `}

          <div className="archive-filter-sidebar__search-group space-y-2" ref=${searchRef}>
            <label htmlFor=${searchInputId} className="archive-filter-sidebar__label">Search archive</label>
            <div className="relative">
              <input
                id=${searchInputId}
                ref=${searchInputRef}
                type="text"
                value=${filters.search}
                onChange=${handleSearchChange}
                onFocus=${() => filters.search.length > 1 && setShowSuggestions(true)}
                placeholder="Keywords, title..."
                className="archive-control archive-filter-sidebar__search"
              />
              <${Search} className="w-4 h-4 text-stone-400 absolute left-2.5 top-2.5" />
              ${filters.search && html`
                <button
                  type="button"
                  onClick=${() => setFilters(prev => ({ ...prev, search: '' }))}
                  className="absolute right-2 top-2 text-stone-400 hover:text-stone-800"
                  aria-label="Clear archive search"
                >
                  <${XCircle} className="w-4 h-4" aria-hidden="true" />
                </button>
              `}

              ${showSuggestions && suggestions.length > 0 && html`
                <div className="absolute z-30 w-full bg-white border border-stone-300 shadow-lg mt-1 max-h-60 overflow-y-auto">
                  <ul>
                    ${suggestions.map(term => html`
                      <li key=${normalizeForSearch(term)}>
                        <button
                          type="button"
                          onClick=${() => handleSelectSuggestion(term)}
                          className="block w-full px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 cursor-pointer truncate border-b border-stone-100 last:border-0"
                        >
                          ${term}
                        </button>
                      </li>
                    `)}
                  </ul>
                </div>
              `}
            </div>
            <p className="archive-filter-sidebar__hint">Searches metadata, article text, and social post text</p>
          </div>

          <div className="archive-filter-group border-t border-stone-200 pt-4">
             <h4 className="archive-filter-sidebar__label">Thematic categories</h4>
             <div className="space-y-2">
                ${visibleCategories.map(cat => html`
                  <label key=${cat} className="flex items-start gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked=${filters.categories.includes(cat)}
                      onChange=${() => toggleCategory(cat)}
                      className="mt-1 w-4 h-4 accent-stone-900 border-stone-300 rounded focus:ring-stone-900 transition-colors"
                    />
                    <span className="text-sm text-stone-600 group-hover:text-stone-900 transition-colors leading-tight pt-0.5">${cat}</span>
                  </label>
                `)}

                ${facets.categories.length > 10 && html`
                    <button
                        type="button"
                        onClick=${() => setShowAllCategories(!showAllCategories)}
                        className="archive-filter-more"
                    >
                        ${showAllCategories ? html`View less <${ChevronUp} className="w-3 h-3"/>` : html`View all (${facets.categories.length - 10} more) <${ChevronDown} className="w-3 h-3"/>`}
                    </button>
                `}
             </div>
          </div>

          <div className="archive-filter-group border-t border-stone-200 pt-4">
            <h4 className="archive-filter-sidebar__label">Timeline</h4>
            <p className="archive-filter-sidebar__hint">Filter by era or choose a year in the timeline</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="era"
                  checked=${filters.era === null && filters.year === null}
                  onChange=${() => setFilters(prev => ({ ...prev, era: null, year: null }))}
                  className="accent-stone-900 focus:ring-stone-900"
                />
                <span className="text-sm">All eras</span>
              </label>
              ${facets.eras.map(era => html`
                <label key=${era} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="era"
                    checked=${filters.era === era}
                    onChange=${() => handleEraChange(era)}
                    className="accent-stone-900 focus:ring-stone-900"
                  />
                  <span className="text-sm">${era}</span>
                </label>
              `)}
            </div>
          </div>

          <div className="archive-filter-group border-t border-stone-200 pt-4">
            <h4 className="archive-filter-sidebar__label">Content type</h4>
            <div className="flex flex-wrap gap-4">
              ${CONTENT_TYPE_OPTIONS.map((opt) => html`
                <label key=${opt.label} className="flex items-center gap-2 cursor-pointer">
                   <input
                    type="radio"
                    name="ctype"
                    checked=${filters.type === opt.value}
                    onChange=${() => handleTypeChange(opt.value)}
                    className="accent-stone-900 focus:ring-stone-900"
                  />
                  <span className="text-sm">${opt.label}</span>
                </label>
              `)}
            </div>
            ${/* Reply filtering is now handled during data export — short replies and thread members are excluded */''}
          </div>

          <div className="archive-filter-sidebar__actions">
            ${!embedded && html`
              <button
                type="button"
                onClick=${onClose}
                className="archive-action archive-filter-sidebar__apply lg:hidden"
              >
                Apply filters
              </button>
            `}
          </div>

        </div>
      <//>
    </div>
  `;
};

export default Sidebar;
