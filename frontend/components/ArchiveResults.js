import { html } from '../html.js?v=3.8.29';
import { ChevronLeft, ChevronRight, FolderOpen, SearchX } from 'lucide-react';
import { COLORS } from '../constants.js?v=3.8.29';
import { hashString } from '../services/archiveService.js?v=3.8.29';
import { recordNeedsReview } from '../utils/needsReview.js?v=3.8.29';
import { canonicalRecordUrl } from '../utils/recordDeepLink.js?v=3.8.29';
import LoadingQuotes from './LoadingQuotes.js?v=3.8.29';

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
  const openCard = (event, recordId) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onSelectRecord(recordId);
  };

  return html`
    <div className=${compact ? 'archive-results archive-results--compact desktop-archive-results' : 'archive-results'}>
      ${errorPanel}

      ${!errorPanel && loading && html`<${LoadingQuotes} />`}

      ${!errorPanel && !loading && filteredRecords.length === 0 && html`
        <div className="archive-empty-state">
          <${SearchX} className="archive-empty-state__icon" aria-hidden="true" />
          <p className="archive-section-label">Search result</p>
          <h3>No records found</h3>
          <p>Try adjusting your search terms or filters.</p>
          <button
            type="button"
            onClick=${onClearFilters}
            className="archive-action archive-action--secondary"
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
                className="archive-record-card"
              >
                <span
                  className="archive-record-card__accent"
                  style=${{ backgroundColor: theme.text }}
                  aria-hidden="true"
                />
                <a
                  href=${canonicalRecordUrl(window.location.href, item.id)}
                  aria-label=${`Open record: ${item.title}`}
                  onClick=${event => openCard(event, item.id)}
                  className="archive-record-card__body"
                >
                  <div className="archive-record-card__meta">
                    <span className="archive-record-card__publication">${item.pub}</span>
                    <span className="archive-record-card__date">${item.date}</span>
                  </div>

                  <h3 className="archive-record-card__title">
                    <${Highlight} text=${item.title} term=${searchTerm} />
                  </h3>

                  <p className="archive-record-card__summary">
                    <${Highlight} text=${item.summaryPreview || item.summary || ''} term=${searchTerm} />
                  </p>

                  <div className="archive-record-card__labels">
                    ${item.categories.slice(0, 2).map((category, index) => html`
                      <span
                        key=${category}
                        className="archive-record-card__label"
                        style=${index === 0 ? {
                          backgroundColor: theme.bg,
                          borderColor: theme.border,
                          color: theme.text,
                        } : undefined}
                      >
                        ${category}
                      </span>
                    `)}
                    ${item.categories.length > 2 && html`
                      <span className="archive-record-card__label">
                        +${item.categories.length - 2} more
                      </span>
                    `}
                    ${recordNeedsReview(item) && html`
                      <span
                        className="archive-record-card__label archive-record-card__label--review"
                        style=${{ backgroundColor: '#fffbeb', color: '#b45309' }}
                        title="Auto-submitted; pending a human review pass"
                      >
                        needs review
                      </span>
                    `}
                  </div>
                </a>
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
                className="archive-folder-card"
              >
                <span
                  className="archive-folder-tab archive-folder-card__tab"
                  style=${{
                    '--archive-folder-tab-fill': theme.bg,
                    '--archive-folder-tab-edge': theme.border,
                  }}
                >
                  <span
                    className="archive-folder-card__count"
                    style=${{ color: theme.text }}
                  >
                    ${group.count} records
                  </span>
                </span>
                <span className="archive-folder-card__body">
                  <span className="archive-folder-card__accent" style=${{ backgroundColor: theme.text }}></span>
                  <span className="archive-folder-card__name">
                    ${group.name}
                  </span>
                  <${FolderOpen} className="archive-folder-card__icon" aria-hidden="true" />
                </span>
              </button>
            `;
          })}
        </div>
      `}

      ${!loading && !errorPanel && viewMode === 'grid' && totalPages > 1 && html`
        <nav className="archive-pagination" aria-label="Archive results pages">
          <button
            type="button"
            onClick=${() => onPageChange(currentPage - 1)}
            disabled=${currentPage === 1}
            className="archive-action archive-action--quiet archive-pagination__button"
            aria-label="Previous results page"
          >
            <${ChevronLeft} className="w-5 h-5" aria-hidden="true" />
          </button>
          <span className="archive-pagination__status">Page ${currentPage} of ${totalPages}</span>
          <button
            type="button"
            onClick=${() => onPageChange(currentPage + 1)}
            disabled=${currentPage === totalPages}
            className="archive-action archive-action--quiet archive-pagination__button"
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
