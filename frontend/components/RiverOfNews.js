/**
 * River of News Component
 *
 * A reverse-chronological stream view inspired by Dave Winer's "River of News" concept.
 * The river is a continuously updating stream where new items flow by, grouped by time.
 *
 * Design principles (from Winer):
 * - Reverse chronological order (newest first)
 * - Minimal chrome - focus on the content
 * - Time markers to orient the reader
 * - Dense but scannable layout
 * - No pagination - infinite scroll
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { html } from '../html.js?v=3.8.8';
import { Clock, ExternalLink, ChevronDown } from 'lucide-react';
import { COLORS } from '../constants.js?v=3.8.8';
import { hashString } from '../services/archiveService.js?v=3.8.8';

// Time groupings
function getTimeGroup(dateStr) {
  if (!dateStr) return 'Unknown';

  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This week';
  if (diffDays < 30) return 'This month';
  if (diffDays < 365) return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return date.getFullYear().toString();
}

// Format relative time
function formatRelativeTime(dateStr) {
  if (!dateStr) return '';

  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Get category color (using hash for deterministic color assignment)
function getCategoryColor(category) {
  if (!category) return COLORS[0];
  const colorIdx = hashString(category) % COLORS.length;
  return COLORS[colorIdx];
}

const RiverOfNews = ({ records, onSelectRecord, fetchDetails }) => {
  const [visibleCount, setVisibleCount] = useState(50);
  const [expandedGroups, setExpandedGroups] = useState(new Set(['Today', 'Yesterday', 'This week']));
  const loaderRef = useRef(null);

  // Sort records by date (newest first) - memoized for performance with large datasets
  const sortedRecords = useMemo(() =>
    [...records].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [records]
  );

  // Group records by time period - memoized to avoid recalculation
  const { groupedRecords, orderedGroups } = useMemo(() => {
    const grouped = sortedRecords.slice(0, visibleCount).reduce((acc, record) => {
      const group = getTimeGroup(record.date);
      if (!acc[group]) acc[group] = [];
      acc[group].push(record);
      return acc;
    }, {});

    // Preserve group order
    const groupOrder = ['Today', 'Yesterday', 'This week', 'This month'];
    const ordered = Object.keys(grouped).sort((a, b) => {
      const aIdx = groupOrder.indexOf(a);
      const bIdx = groupOrder.indexOf(b);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return b.localeCompare(a);
    });

    return { groupedRecords: grouped, orderedGroups: ordered };
  }, [sortedRecords, visibleCount]);

  // Infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleCount < sortedRecords.length) {
          setVisibleCount(prev => Math.min(prev + 30, sortedRecords.length));
        }
      },
      { threshold: 0.1 }
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [visibleCount, sortedRecords.length]);

  const toggleGroup = (group) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  const handleRecordClick = useCallback(async (record) => {
    // Fetch full details if needed
    if (fetchDetails && !record.summary) {
      await fetchDetails(record.id);
    }
    onSelectRecord(record.id);
  }, [fetchDetails, onSelectRecord]);

  const activateRecord = (event, record) => {
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    if (event.type === 'keydown') event.preventDefault();
    handleRecordClick(record);
  };

  return html`
    <div className="archive-river">
      <!-- River header -->
      <div className="archive-river__header">
        <div>
          <${Clock} aria-hidden="true" />
          <span>River of news</span>
          <span aria-hidden="true">•</span>
          <span>${sortedRecords.length.toLocaleString()} items</span>
        </div>
      </div>

      <!-- Time-grouped stream -->
      ${orderedGroups.map(group => {
        const items = groupedRecords[group];
        const isExpanded = expandedGroups.has(group);

        return html`
          <section key=${group} className="archive-river__group" aria-label=${`${group} - ${items.length} items`}>
            <!-- Time marker -->
            <button
              type="button"
              onClick=${() => toggleGroup(group)}
              className="archive-river__group-toggle"
              aria-expanded=${isExpanded}
              aria-controls=${`river-group-${group.replace(/\s+/g, '-').toLowerCase()}`}
            >
              <span className="archive-river__rule" aria-hidden="true" />
              <span>
                ${group}
                <small>(${items.length})</small>
              </span>
              <${ChevronDown}
                className=${isExpanded ? '' : 'is-collapsed'}
                aria-hidden="true"
              />
              <span className="archive-river__rule" aria-hidden="true" />
            </button>

            <!-- Items in this time group -->
            ${isExpanded && html`
              <div
                id=${`river-group-${group.replace(/\s+/g, '-').toLowerCase()}`}
                className="archive-river__items"
              >
                ${items.map(record => {
                  const primaryCategory = (record.categories || [])[0];
                  const categoryColor = getCategoryColor(primaryCategory);

                  return html`
                    <article
                      key=${record.id}
                      role="button"
                      tabIndex="0"
                      aria-label=${`Open record: ${record.title}`}
                      onClick=${(event) => activateRecord(event, record)}
                      onKeyDown=${(event) => activateRecord(event, record)}
                      className="archive-river__item"
                      style=${{ '--record-accent': categoryColor?.text || '#57534e' }}
                    >
                      <div className="archive-river__item-layout">
                        <!-- Time indicator -->
                        <div className="archive-river__time">
                          <span>
                            ${formatRelativeTime(record.date)}
                          </span>
                        </div>

                        <!-- Content -->
                        <div className="archive-river__content">
                          <h3>
                            ${record.title}
                          </h3>

                          ${record.summaryPreview && html`
                            <p>
                              ${record.summaryPreview}
                            </p>
                          `}

                          <div className="archive-river__meta">
                            <!-- Source/pub -->
                            <span title=${record.pub}>
                              ${record.pub || 'Unknown'}
                            </span>

                            <!-- Category pill -->
                            ${primaryCategory && html`
                              <span
                                className="archive-river__category"
                                style=${{
                                  backgroundColor: categoryColor?.bg || '#f5f5f4',
                                  color: categoryColor?.text || '#57534e'
                                }}
                              >
                                ${primaryCategory.split(' ')[0]}
                              </span>
                            `}

                            <!-- External link indicator -->
                            ${record.url && record.url.startsWith('http') && html`
                              <${ExternalLink} aria-hidden="true" />
                            `}
                          </div>
                        </div>
                      </div>
                    </article>
                  `;
                })}
              </div>
            `}
          </section>
        `;
      })}

      <!-- Infinite scroll loader -->
      ${visibleCount < sortedRecords.length && html`
        <div ref=${loaderRef} className="archive-river__loader" role="status">
          <div>
            <span aria-hidden="true" />
            Loading more...
          </div>
        </div>
      `}

      <!-- End of river -->
      ${visibleCount >= sortedRecords.length && sortedRecords.length > 0 && html`
        <div className="archive-river__end">
          ─── End of river ───
        </div>
      `}
    </div>
  `;
};

export default RiverOfNews;
