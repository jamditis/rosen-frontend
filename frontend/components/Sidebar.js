
import { useState, useEffect, useRef } from 'react';
import { html } from '../html.js?v=3.4.2';
import { X, Search, XCircle, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';

const Sidebar = ({ facets, filters, setFilters, isOpen, onClose, resetFilters, autocompleteIndex }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const searchRef = useRef(null);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setFilters(prev => ({ ...prev, search: val }));

    if (val.length > 1) {
      const matched = autocompleteIndex
        .filter(term => term.toLowerCase().includes(val.toLowerCase()))
        .slice(0, 8);
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

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const visibleCategories = showAllCategories
    ? facets.categories
    : facets.categories.slice(0, 10);

  // Count active filters for mobile summary
  const activeFilterCount = (filters.search ? 1 : 0) +
    filters.categories.length +
    (filters.era ? 1 : 0) +
    (filters.year ? 1 : 0) +
    (filters.type ? 1 : 0);

  return html`
    <div>
        <div
          className=${`fixed inset-0 bg-black/50 z-[55] lg:hidden backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          onClick=${onClose}
        />

      <aside className=${`
        fixed inset-y-0 left-0 z-[60] lg:z-auto w-80 bg-[#fdfbf7] border-r border-stone-300
        transform transition-transform duration-300 ease-out lg:translate-x-0 lg:static lg:w-64 lg:bg-transparent lg:border-none lg:block shrink-0
        overflow-y-auto lg:overflow-visible shadow-2xl lg:shadow-none
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-5 lg:p-0 space-y-8">

          <div className="flex justify-between items-center lg:hidden mb-6">
            <h3 className="font-display text-xl">Filters & sort</h3>
            <button onClick=${onClose} className="p-1 hover:bg-stone-200 rounded">
              <${X} className="w-6 h-6" />
            </button>
          </div>

          ${activeFilterCount > 0 && html`
            <div className="lg:hidden bg-stone-100 rounded p-3 text-xs text-stone-600">
              <span className="font-bold">${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} active</span>
              ${filters.search && html` — searching "${filters.search}"`}
              ${filters.categories.length > 0 && html` — ${filters.categories.join(', ')}`}
              ${filters.era && html` — ${filters.era}`}
              ${filters.type && html` — ${filters.type}`}
            </div>
          `}

          <div className="space-y-2" ref=${searchRef}>
            <label className="text-xs font-bold uppercase tracking-wider text-stone-500">Search archive</label>
            <div className="relative">
              <input
                type="text"
                value=${filters.search}
                onChange=${handleSearchChange}
                onFocus=${() => filters.search.length > 1 && setShowSuggestions(true)}
                placeholder="Keywords, title..."
                className="w-full bg-white border border-stone-300 rounded-none p-2 pl-9 text-sm focus:outline-none focus:border-stone-800 focus:ring-1 focus:ring-stone-800 font-body shadow-sm transition-all"
              />
              <${Search} className="w-4 h-4 text-stone-400 absolute left-2.5 top-2.5" />
              ${filters.search && html`
                <button
                  onClick=${() => setFilters(prev => ({ ...prev, search: '' }))}
                  className="absolute right-2 top-2 text-stone-400 hover:text-stone-800"
                >
                  <${XCircle} className="w-4 h-4" />
                </button>
              `}

              ${showSuggestions && suggestions.length > 0 && html`
                <div className="absolute z-30 w-full bg-white border border-stone-300 shadow-lg mt-1 max-h-60 overflow-y-auto">
                  <ul>
                    ${suggestions.map((term, idx) => html`
                      <li
                        key=${idx}
                        onClick=${() => handleSelectSuggestion(term)}
                        className="px-3 py-2 text-sm text-stone-700 hover:bg-stone-100 cursor-pointer truncate border-b border-stone-100 last:border-0"
                      >
                        ${term}
                      </li>
                    `)}
                  </ul>
                </div>
              `}
            </div>
            <p className="text-[10px] text-stone-400 mt-1">Searches titles, summaries, and categories</p>
          </div>

          <div className="border-t border-stone-200 pt-4">
             <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">Thematic categories</h4>
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
                        onClick=${() => setShowAllCategories(!showAllCategories)}
                        className="text-xs text-stone-500 hover:text-stone-900 font-bold flex items-center gap-1 mt-2"
                    >
                        ${showAllCategories ? html`View Less <${ChevronUp} className="w-3 h-3"/>` : html`View All (${facets.categories.length - 10} more) <${ChevronDown} className="w-3 h-3"/>`}
                    </button>
                `}
             </div>
          </div>

          <div className="border-t border-stone-200 pt-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">Timeline</h4>
            <p className="text-[10px] text-stone-400 mb-2">Filter by era or click a year in the timeline bar</p>
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

          <div className="border-t border-stone-200 pt-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">Content type</h4>
            <div className="flex flex-wrap gap-4">
              ${[
                { label: 'All', value: null },
                { label: 'Articles', value: 'article' },
                { label: 'Twitter/X', value: 'twitter' },
                { label: 'Bluesky', value: 'bluesky' },
              ].map((opt) => html`
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

          <button
            onClick=${resetFilters}
            className="w-full py-2 border border-stone-300 text-stone-600 text-xs font-bold uppercase tracking-wider hover:bg-stone-800 hover:text-white transition-colors mt-4"
          >
            Reset all filters
          </button>

        </div>
      </aside>
    </div>
  `;
};

export default Sidebar;
