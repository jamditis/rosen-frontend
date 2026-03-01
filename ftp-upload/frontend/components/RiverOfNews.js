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
import { html } from '../html.js?v=2.0.2';
import { Clock, ExternalLink, ChevronDown, Tag } from 'lucide-react';
import { COLORS } from '../constants.js?v=2.0.2';
import { hashString } from '../services/archiveService.js?v=2.0.2';

// Time groupings
function getTimeGroup(dateStr) {
  if (!dateStr) return 'Unknown';

  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This Week';
  if (diffDays < 30) return 'This Month';
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
  const [expandedGroups, setExpandedGroups] = useState(new Set(['Today', 'Yesterday', 'This Week']));
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
    const groupOrder = ['Today', 'Yesterday', 'This Week', 'This Month'];
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

  return html`
    <div className="river-of-news max-w-3xl mx-auto">
      <!-- River header -->
      <div className="sticky top-0 z-10 bg-gradient-to-b from-stone-50 to-transparent pb-4 pt-2">
        <div className="flex items-center gap-2 text-stone-500 text-sm font-mono">
          <${Clock} className="w-4 h-4" />
          <span>River of News</span>
          <span className="text-stone-300">•</span>
          <span>${sortedRecords.length.toLocaleString()} items</span>
        </div>
      </div>

      <!-- Time-grouped stream -->
      ${orderedGroups.map(group => {
        const items = groupedRecords[group];
        const isExpanded = expandedGroups.has(group);

        return html`
          <section key=${group} className="mb-6" aria-label=${`${group} - ${items.length} items`}>
            <!-- Time marker -->
            <button
              onClick=${() => toggleGroup(group)}
              className="w-full flex items-center gap-3 py-2 text-left group"
              aria-expanded=${isExpanded}
              aria-controls=${`river-group-${group.replace(/\s+/g, '-').toLowerCase()}`}
            >
              <div className="h-px flex-1 bg-stone-200"></div>
              <span className="text-xs font-mono uppercase tracking-wider text-stone-400 group-hover:text-stone-600 transition-colors">
                ${group}
                <span className="ml-2 text-stone-300">(${items.length})</span>
              </span>
              <${ChevronDown}
                className=${`w-3 h-3 text-stone-300 transition-transform ${isExpanded ? '' : '-rotate-90'}`}
              />
              <div className="h-px flex-1 bg-stone-200"></div>
            </button>

            <!-- Items in this time group -->
            ${isExpanded && html`
              <div
                id=${`river-group-${group.replace(/\s+/g, '-').toLowerCase()}`}
                className="space-y-1 pl-2 border-l-2 border-stone-100 ml-2"
                role="list"
              >
                ${items.map(record => {
                  const primaryCategory = (record.categories || [])[0];
                  const categoryColor = getCategoryColor(primaryCategory);

                  return html`
                    <article
                      key=${record.id}
                      onClick=${() => handleRecordClick(record)}
                      className="group py-3 px-3 -ml-3 rounded-r-lg cursor-pointer hover:bg-white hover:shadow-sm transition-all border-l-2 border-transparent hover:border-l-2"
                      style=${{ '--hover-border': categoryColor?.border || '#d6d3d1' }}
                    >
                      <div className="flex items-start gap-3">
                        <!-- Time indicator -->
                        <div className="flex-shrink-0 w-12 text-right">
                          <span className="text-xs font-mono text-stone-400">
                            ${formatRelativeTime(record.date)}
                          </span>
                        </div>

                        <!-- Content -->
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-stone-800 group-hover:text-stone-900 line-clamp-2 leading-snug">
                            ${record.title}
                          </h3>

                          ${record.summaryPreview && html`
                            <p className="mt-1 text-xs text-stone-500 line-clamp-2 leading-relaxed">
                              ${record.summaryPreview}
                            </p>
                          `}

                          <div className="mt-2 flex items-center gap-2 text-xs text-stone-400">
                            <!-- Source/pub -->
                            <span className="truncate max-w-[120px]" title=${record.pub}>
                              ${record.pub || 'Unknown'}
                            </span>

                            <!-- Category pill -->
                            ${primaryCategory && html`
                              <span
                                className="px-1.5 py-0.5 rounded text-xs"
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
                              <${ExternalLink} className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                            `}
                          </div>
                        </div>
                      </div>
                    </article>
                  `;
                })}
              </div>
            `}
          </div>
        `;
      })}

      <!-- Infinite scroll loader -->
      ${visibleCount < sortedRecords.length && html`
        <div ref=${loaderRef} className="py-8 text-center">
          <div className="inline-flex items-center gap-2 text-stone-400 text-sm">
            <div className="w-4 h-4 border-2 border-stone-300 border-t-transparent rounded-full animate-spin"></div>
            Loading more...
          </div>
        </div>
      `}

      <!-- End of river -->
      ${visibleCount >= sortedRecords.length && sortedRecords.length > 0 && html`
        <div className="py-8 text-center text-stone-400 text-sm font-mono">
          ─── End of river ───
        </div>
      `}

      <style>
        .river-of-news article:hover {
          border-left-color: var(--hover-border) !important;
        }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      </style>
    </div>
  `;
};

export default RiverOfNews;
