import { html } from '../html.js?v=3.7.11';
import { ChevronLeft, ChevronRight, FolderOpen, SearchX } from 'lucide-react';
import { COLORS } from '../constants.js?v=3.7.11';
import { hashString } from '../services/archiveService.js?v=3.7.11';
import { recordNeedsReview } from '../utils/needsReview.js?v=3.7.11';
import LoadingQuotes from './LoadingQuotes.js?v=3.7.11';

const Highlight = ({ text, term }) => {
  if (!term || term.length < 2) return html`<span>${text}</span>`;
  const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return html`
    <span>
      ${parts.map((part, index) => (
        part.toLowerCase() === term.toLowerCase()
          ? html`<mark key=${index}>${part}</mark>`
          : part
      ))}
    </span>
  `;
};

/**
 * The canonical archive-result renderer shared by the standard archive and
 * the optional desktop adapter. Filtering, sorting, pagination, and record
 * selection remain owned by App; this component only presents those results.
 */
const ArchiveResults = ({
  compact = false,
  errorPanel = null,
  loading,
  filteredRecords,
  paginatedRecords,
  folderGroups,
  viewMode,
  searchTerm,
  currentPage,
  totalPages,
  onSelectRecord,
  onOpenFolder,
  onPageChange,
  onClearFilters,
}) => {
  const activateCard = (event, recordId) => {
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    if (event.type === 'keydown') event.preventDefault();
    onSelectRecord(recordId);
  };

  return html`
    <div className=${compact ? 'desktop-archive-results' : ''}>
      ${errorPanel}

      ${!errorPanel && loading && html`<${LoadingQuotes} />`}

      ${!errorPanel && !loading && filteredRecords.length === 0 && html`
        <div className="text-center py-20 border-2 border-dashed border-stone-200 rounded-lg bg-stone-50">
          <${SearchX} className="w-12 h-12 mx-auto text-stone-300 mb-4" aria-hidden="true" />
          <h3 className="font-display text-xl text-stone-700 mb-2">No records found</h3>
          <p className="text-stone-500 text-sm mb-6">Try adjusting your search terms or filters.</p>
          <button
            type="button"
            onClick=${onClearFilters}
            className="text-sm border-b-2 border-stone-800 pb-0.5 hover:text-stone-600 transition-colors font-bold"
          >
            Clear all filters
          </button>
        </div>
      `}

      ${!errorPanel && !loading && viewMode === 'grid' && html`
        <div className=${compact
          ? 'desktop-archive-card-grid'
          : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6'}>
          ${paginatedRecords.map((item) => {
            const primaryCategory = item.categories[0] || 'Uncategorized';
            const colorIndex = hashString(primaryCategory) % COLORS.length;
            const theme = COLORS[colorIndex];

            return html`
              <article
                key=${item.id}
                className="bg-white border border-stone-200 hover:border-stone-400 hover:shadow-lg transition-all duration-300 rounded-sm flex flex-col group overflow-hidden relative"
              >
                <div className="h-1 w-full" style=${{ backgroundColor: theme.text }}></div>
                <div
                  role="button"
                  tabIndex="0"
                  aria-label=${`Open record: ${item.title}`}
                  onClick=${(event) => activateCard(event, item.id)}
                  onKeyDown=${(event) => activateCard(event, item.id)}
                  className="p-6 flex flex-col h-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-500"
                >
                  <div className="flex justify-between items-start mb-3 gap-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-stone-600">${item.pub}</span>
                    <span className="text-xs text-stone-600 font-mono border border-stone-200 px-1 rounded">${item.date}</span>
                  </div>

                  <h3 className="text-lg font-display font-bold text-stone-900 leading-tight mb-3 group-hover:text-stone-600 transition-colors">
                    <${Highlight} text=${item.title} term=${searchTerm} />
                  </h3>

                  <p className="text-stone-600 text-sm leading-relaxed mb-4 flex-grow font-body">
                    <${Highlight} text=${item.summaryPreview || item.summary || ''} term=${searchTerm} />
                  </p>

                  <div className="mt-auto pt-4 border-t border-stone-100 flex flex-wrap gap-2">
                    ${item.categories.slice(0, 2).map((category) => html`
                      <span key=${category} className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-stone-100 text-stone-600 tracking-wide border border-stone-200">
                        ${category}
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
              </article>
            `;
          })}
        </div>
      `}

      ${!errorPanel && !loading && viewMode === 'folder' && html`
        <div className=${compact
          ? 'desktop-archive-folder-grid'
          : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'}>
          ${folderGroups.map((group) => {
            const colorIndex = hashString(group.name) % COLORS.length;
            const theme = COLORS[colorIndex];

            return html`
              <button
                type="button"
                key=${group.name}
                onClick=${() => onOpenFolder(group.name)}
                className="text-left group relative flex flex-col h-40 transition-transform hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
              >
                <span
                  className="folder-tab-shape block w-1/2 h-8 border-t border-l border-r relative z-10 translate-y-[1px] ml-0"
                  style=${{ backgroundColor: theme.bg, borderColor: theme.border }}
                >
                  <span
                    className="px-4 py-2 text-[10px] font-bold uppercase block truncate"
                    style=${{ color: theme.text }}
                  >
                    ${group.count} records
                  </span>
                </span>
                <span className="flex-grow w-full bg-white border border-stone-300 rounded-r-md rounded-b-md shadow-sm p-6 relative z-20 flex items-center">
                  <span className="w-1 h-full absolute left-0 top-0 rounded-l-sm" style=${{ backgroundColor: theme.text }}></span>
                  <span className="text-lg font-display font-bold text-stone-800 group-hover:underline decoration-stone-300 underline-offset-4">
                    ${group.name}
                  </span>
                  <${FolderOpen} className="w-6 h-6 ml-auto text-stone-300 group-hover:text-stone-500 transition-colors" aria-hidden="true" />
                </span>
              </button>
            `;
          })}
        </div>
      `}

      ${!loading && !errorPanel && viewMode === 'grid' && totalPages > 1 && html`
        <nav className="mt-12 flex justify-center items-center gap-4" aria-label="Archive results pages">
          <button
            type="button"
            onClick=${() => onPageChange(currentPage - 1)}
            disabled=${currentPage === 1}
            className="p-2 border border-stone-300 rounded hover:bg-stone-100 disabled:opacity-30 transition-all"
            aria-label="Previous results page"
          >
            <${ChevronLeft} className="w-5 h-5" aria-hidden="true" />
          </button>
          <span className="font-display text-stone-600">Page ${currentPage} of ${totalPages}</span>
          <button
            type="button"
            onClick=${() => onPageChange(currentPage + 1)}
            disabled=${currentPage === totalPages}
            className="p-2 border border-stone-300 rounded hover:bg-stone-100 disabled:opacity-30 transition-all"
            aria-label="Next results page"
          >
            <${ChevronRight} className="w-5 h-5" aria-hidden="true" />
          </button>
        </nav>
      `}
    </div>
  `;
};

export default ArchiveResults;
