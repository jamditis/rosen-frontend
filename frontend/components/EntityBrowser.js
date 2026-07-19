
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { html } from '../html.js?v=3.7.5';
import { Users, Building2, Lightbulb, BookOpen, MapPin, Calendar, Search, ArrowUpDown, ChevronDown, ChevronRight, X, ExternalLink, AlertTriangle, RotateCw } from 'lucide-react';
import { fetchEntitiesData, getRecordsByEntity } from '../services/archiveService.js?v=3.7.5';
import { getEntityScope } from '../services/queryComposition.js?v=3.7.5';
import { COLORS, ENTITY_TYPE_CONFIG } from '../constants.js?v=3.7.5';
import { normalizeForSearch } from '../utils/searchNormalize.js?v=3.7.5';

// Add icons to shared config
const TYPE_ICONS = {
  Person: Users,
  Organization: Building2,
  Concept: Lightbulb,
  Work: BookOpen,
  Event: Calendar,
  Location: MapPin
};

const TYPE_CONFIG = Object.fromEntries(
  Object.entries(ENTITY_TYPE_CONFIG).map(([type, cfg]) => [
    type,
    { ...cfg, icon: TYPE_ICONS[type] || Lightbulb }
  ])
);

const EntityBrowser = ({
  records,
  queryActive,
  onSelectRecord,
  selectedEntityId = null,
  onSelectEntity,
  embedded = false,
  autoFocusSelection = true,
}) => {
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('mentions');
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [entityRecords, setEntityRecords] = useState([]);
  const [coOccurring, setCoOccurring] = useState([]);
  const [recordEntityMap, setRecordEntityMap] = useState({});
  const detailHeadingRef = useRef(null);
  const entityOpenerRef = useRef(null);

  // Load entity data
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await fetchEntitiesData();
        if (data?.error) {
          setLoadError(data.error);
          setEntities([]);
          setRecordEntityMap({});
        } else if (data?.entities) {
          setEntities(data.entities);
          setRecordEntityMap(data.recordEntityMap || {});
        }
      } catch (error) {
        console.error('Error loading entity browser:', error);
        setLoadError('The entity index could not load. Archive records remain available.');
      }
      setLoading(false);
    };
    load();
  }, []);

  const { entities: scopedEntities, recordIdsByEntity } = useMemo(
    () => getEntityScope(entities, recordEntityMap, records, queryActive),
    [entities, recordEntityMap, records, queryActive]
  );

  const scopedEntityById = useMemo(
    () => new Map(scopedEntities.map(entity => [entity.id, entity])),
    [scopedEntities]
  );

  // Type counts
  const typeCounts = useMemo(() => {
    const counts = {};
    scopedEntities.forEach(e => {
      counts[e.type] = (counts[e.type] || 0) + 1;
    });
    return counts;
  }, [scopedEntities]);

  // Filter and sort entities
  const filteredEntities = useMemo(() => {
    let result = scopedEntities;

    if (selectedType) {
      result = result.filter(e => e.type === selectedType);
    }

    if (searchTerm) {
      const term = normalizeForSearch(searchTerm);
      result = result.filter(e =>
        normalizeForSearch(e.name).includes(term) ||
        (e.role && normalizeForSearch(e.role).includes(term))
      );
    }

    if (sortBy === 'mentions') {
      result = [...result].sort((a, b) => (b.totalMentions || 1) - (a.totalMentions || 1));
    } else if (sortBy === 'prominence') {
      result = [...result].sort((a, b) => (b.prominence || 0) - (a.prominence || 0));
    } else {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [scopedEntities, selectedType, searchTerm, sortBy]);

  // Limit displayed entities for performance
  const [displayLimit, setDisplayLimit] = useState(100);
  const displayedEntities = filteredEntities.slice(0, displayLimit);

  // Reset display limit when filters change
  useEffect(() => {
    setDisplayLimit(100);
  }, [selectedType, searchTerm, sortBy]);

  const closeEntityDetails = useCallback(() => {
    const opener = entityOpenerRef.current;
    const selectedId = selectedEntity?.id;
    setSelectedEntity(null);
    setEntityRecords([]);
    setCoOccurring([]);
    entityOpenerRef.current = null;
    requestAnimationFrame(() => {
      const fallback = selectedId
        ? document.querySelector(`[data-entity-id="${selectedId}"]`)
        : null;
      if (opener?.isConnected) opener.focus();
      else if (fallback?.isConnected) fallback.focus();
      else document.getElementById('entity-search')?.focus();
    });
    onSelectEntity?.(null);
  }, [selectedEntity?.id, onSelectEntity]);

  const showEntityDetails = useCallback((entity) => {
    setSelectedEntity(entity);

    // Find records that mention this entity
    const recordIds = queryActive
      ? (recordIdsByEntity.get(entity.id) || [])
      : getRecordsByEntity(entity.id);
    const matchedRecords = recordIds
      .map(rid => records.find(r => r.id === rid))
      .filter(Boolean)
      .sort((a, b) => b.date.localeCompare(a.date));
    setEntityRecords(matchedRecords);

    // Find co-occurring entities (appear in same records)
    const coEntityCounts = {};
    recordIds.forEach(rid => {
      const entityIds = new Set(recordEntityMap[rid] || []);
      entityIds.forEach(eid => {
        if (eid !== entity.id) {
          coEntityCounts[eid] = (coEntityCounts[eid] || 0) + 1;
        }
      });
    });

    const coEntities = Object.entries(coEntityCounts)
      .map(([eid, count]) => {
        const coEntity = scopedEntityById.get(eid);
        return coEntity ? { ...coEntity, coCount: count } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.coCount - a.coCount)
      .slice(0, 20);

    setCoOccurring(coEntities);
  }, [records, queryActive, recordEntityMap, recordIdsByEntity, scopedEntityById]);

  // When an entity is selected, find its records and co-occurring entities.
  // Keep the stable list opener while following co-occurrence links inside the
  // detail panel, so closing the research path has somewhere useful to return.
  const handleEntitySelect = useCallback((entity, opener = null) => {
    if (selectedEntity && selectedEntity.id === entity.id) {
      closeEntityDetails();
      return;
    }

    if (opener && !opener.closest('[data-entity-detail]')) {
      entityOpenerRef.current = opener;
    }
    showEntityDetails(entity);
    onSelectEntity?.(entity.id);
  }, [selectedEntity, closeEntityDetails, showEntityDetails, onSelectEntity]);

  // Re-run showEntityDetails even when the selected ID is unchanged: on a cold
  // deep link, the entity index can resolve before the core record list, and
  // the derived record/co-occurrence panels must refresh when that list arrives.
  useEffect(() => {
    if (!selectedEntityId) {
      if (selectedEntity) {
        entityOpenerRef.current = null;
        setSelectedEntity(null);
        setEntityRecords([]);
        setCoOccurring([]);
      }
      return;
    }

    const entity = scopedEntityById.get(selectedEntityId);
    if (entity) {
      if (selectedEntityId !== selectedEntity?.id) {
        entityOpenerRef.current = null;
      }
      showEntityDetails(entity);
    } else if (!loading) {
      onSelectEntity?.(null);
    }
  }, [selectedEntityId, selectedEntity?.id, scopedEntityById, showEntityDetails, loading, onSelectEntity]);

  useEffect(() => {
    if (!selectedEntity || !autoFocusSelection) return undefined;
    // Compact layouts place the selected detail before the long result list.
    // Moving focus makes that new context immediate for keyboard and screen-
    // reader users, and scrolls it into view for touch users who selected a
    // card near the top of a list that can contain hundreds of entities.
    let focusFrame = null;
    const layoutFrame = requestAnimationFrame(() => {
      // DesktopShell first announces/focuses the newly active window. Enter
      // the selected content on the following paint so a deep link or Forward
      // traversal does not finish on chrome instead of the requested entity.
      focusFrame = requestAnimationFrame(() => {
        const detailPanel = detailHeadingRef.current?.closest('[data-entity-detail]');
        // RecordModal restores an ordinary close to its exact invoking record
        // button inside this panel. Preserve that more precise return point;
        // direct combined URLs have no such opener and still enter the heading.
        if (detailPanel?.contains(document.activeElement)) return;
        detailHeadingRef.current?.focus();
      });
    });
    return () => {
      cancelAnimationFrame(layoutFrame);
      if (focusFrame !== null) cancelAnimationFrame(focusFrame);
    };
  }, [selectedEntity?.id, autoFocusSelection]);

  if (loading) {
    return html`
      <div className="flex flex-col items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-stone-300 border-t-stone-800 rounded-full mb-4"></div>
        <p className="text-stone-500 text-sm font-body">Loading entity data...</p>
      </div>
    `;
  }

  if (loadError) {
    return html`
      <div className="flex items-start gap-3 border border-red-300 border-l-4 border-l-red-700 bg-red-50 p-5 text-red-900" role="alert">
        <${AlertTriangle} className="mt-0.5 h-6 w-6 flex-shrink-0" aria-hidden="true" />
        <div>
          <h3 className="font-display text-lg font-bold">Unable to load people and ideas</h3>
          <p className="mt-1 text-sm leading-relaxed">${loadError}</p>
          <button
            type="button"
            onClick=${() => window.location.reload()}
            className="mt-4 inline-flex items-center gap-2 border-2 border-red-800 bg-white px-4 py-2 text-sm font-bold text-red-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2"
            style=${{ minHeight: '44px' }}
          >
            <${RotateCw} className="h-4 w-4" aria-hidden="true" />
            Reload page
          </button>
        </div>
      </div>
    `;
  }

  // Resolve the selected entity's type styling once; the detail panel reads
  // its bg/icon/color below and only renders when selectedEntity is set.
  const selConfig = selectedEntity
    ? (TYPE_CONFIG[selectedEntity.type] || TYPE_CONFIG.Concept)
    : null;
  const DetailHeading = embedded ? 'h3' : 'h2';
  const DetailSectionHeading = embedded ? 'h4' : 'h3';

  return html`
    <div className="flex flex-col gap-6">
      <!-- Type filter chips -->
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick=${() => setSelectedType(null)}
          aria-pressed=${!selectedType}
          className=${`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
            !selectedType
              ? 'bg-stone-800 text-white border-stone-800'
              : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
          }`}
        >
          All (${scopedEntities.length})
        </button>
        ${Object.entries(TYPE_CONFIG).map(([type, config]) => {
          const count = typeCounts[type] || 0;
          if (count === 0) return null;
          const Icon = config.icon;
          return html`
            <button
              type="button"
              key=${type}
              onClick=${() => setSelectedType(selectedType === type ? null : type)}
              aria-pressed=${selectedType === type}
              className=${`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                selectedType === type
                  ? 'text-white border-transparent'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
              }`}
              style=${selectedType === type ? { backgroundColor: config.color } : {}}
            >
              <${Icon} className="w-3 h-3" />
              ${config.label} (${count})
            </button>
          `;
        })}
      </div>

      <!-- Search and sort controls -->
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-grow">
          <label htmlFor="entity-search" className="sr-only">Search entities</label>
          <${Search} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" aria-hidden="true" />
          <input
            id="entity-search"
            type="text"
            value=${searchTerm}
            onInput=${(e) => setSearchTerm(e.target.value)}
            placeholder="Search entities..."
            className="w-full pl-9 pr-8 py-2 border border-stone-200 rounded text-sm font-body focus:outline-none focus:border-stone-400"
          />
          ${searchTerm && html`
            <button
              type="button"
              onClick=${() => setSearchTerm('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              aria-label="Clear entity search"
            >
              <${X} className="w-4 h-4" aria-hidden="true" />
            </button>
          `}
        </div>
        <div className="flex items-center gap-2">
          <${ArrowUpDown} className="w-4 h-4 text-stone-400" aria-hidden="true" />
          <select
            aria-label="Sort entities"
            value=${sortBy}
            onChange=${(e) => setSortBy(e.target.value)}
            className="border border-stone-200 rounded text-sm font-body py-2 px-3 focus:outline-none focus:border-stone-400 bg-white"
          >
            <option value="mentions">Most mentioned</option>
            <option value="prominence">Highest prominence</option>
            <option value="name">Alphabetical</option>
          </select>
        </div>
      </div>

      <div className="text-xs text-stone-500 font-body">
        Showing ${displayedEntities.length} of ${filteredEntities.length} entities
      </div>

      <!-- Main content: entity list + detail panel -->
      <div className="flex flex-col lg:flex-row gap-6">
        <!-- Entity list -->
        <div className="entity-browser-list flex-grow">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${displayedEntities.map(entity => {
              const config = TYPE_CONFIG[entity.type] || TYPE_CONFIG.Concept;
              const Icon = config.icon;
              const isSelected = selectedEntity && selectedEntity.id === entity.id;
              const mentions = entity.totalMentions || 1;

              return html`
                <button
                  type="button"
                  key=${entity.id}
                  data-entity-id=${entity.id}
                  onClick=${(event) => handleEntitySelect(entity, event.currentTarget)}
                  aria-expanded=${Boolean(isSelected)}
                  aria-controls=${isSelected ? 'entity-detail-panel' : undefined}
                  className=${`text-left p-3 border rounded transition-all ${
                    isSelected
                      ? 'border-stone-800 bg-stone-50 shadow-md'
                      : 'border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className="p-1 rounded mt-0.5 flex-shrink-0"
                      style=${{ backgroundColor: config.bg }}
                    >
                      <${Icon} className="w-3.5 h-3.5" style=${{ color: config.color }} />
                    </div>
                    <div className="min-w-0 flex-grow">
                      <div className="font-display font-bold text-sm text-stone-900 truncate">
                        ${entity.name}
                      </div>
                      ${entity.role && entity.role !== 'None' && html`
                        <div className="text-xs text-stone-500 font-body truncate mt-0.5">
                          ${entity.role}
                        </div>
                      `}
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs font-mono text-stone-600">
                          ${mentions} record${mentions !== 1 ? 's' : ''}
                        </span>
                        ${entity.prominence > 0 && html`
                          <span className="text-xs font-mono text-stone-600">
                            P:${entity.prominence}
                          </span>
                        `}
                      </div>
                    </div>
                    <${isSelected ? ChevronDown : ChevronRight}
                      className="w-4 h-4 text-stone-400 flex-shrink-0 mt-1"
                    />
                  </div>
                </button>
              `;
            })}
          </div>

          ${displayedEntities.length < filteredEntities.length && html`
            <button
              type="button"
              onClick=${() => setDisplayLimit(prev => prev + 100)}
              className="mt-4 w-full py-2 text-sm font-bold text-stone-600 border border-stone-200 rounded hover:bg-stone-50 transition-colors"
            >
              Show more (${filteredEntities.length - displayedEntities.length} remaining)
            </button>
          `}
        </div>

        <!-- Detail panel (when entity selected) -->
        ${selectedEntity && html`
          <div className="entity-browser-detail flex-shrink-0 lg:sticky lg:top-20 lg:w-96 lg:self-start">
            <div
              id="entity-detail-panel"
              data-entity-detail
              role="region"
              aria-labelledby="entity-detail-title"
              onKeyDown=${(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                closeEntityDetails();
              }}
              className="border border-stone-200 rounded bg-white shadow-sm"
            >
              <!-- Entity header -->
              <div className="p-4 border-b border-stone-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="p-1.5 rounded"
                      style=${{ backgroundColor: selConfig.bg }}
                    >
                      <${selConfig.icon}
                        className="w-4 h-4"
                        style=${{ color: selConfig.color }}
                      />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-stone-600">
                      ${selectedEntity.type}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick=${closeEntityDetails}
                    className="inline-flex items-center justify-center text-stone-400 hover:text-stone-600"
                    style=${{ minWidth: '44px', minHeight: '44px' }}
                    aria-label="Close entity details"
                  >
                    <${X} className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
                <${DetailHeading}
                  id="entity-detail-title"
                  ref=${detailHeadingRef}
                  tabIndex="-1"
                  className="entity-detail-heading font-display font-bold text-lg text-stone-900 mt-2"
                >
                  ${selectedEntity.name}
                <//>
                ${selectedEntity.role && selectedEntity.role !== 'None' && html`
                  <p className="text-sm text-stone-600 font-body mt-1">${selectedEntity.role}</p>
                `}
                <div className="flex gap-4 mt-2 text-xs text-stone-500 font-mono">
                  <span>${entityRecords.length} records</span>
                  <span>Prominence: ${selectedEntity.prominence || 0}</span>
                </div>
              </div>

              <!-- Records mentioning this entity -->
              <div className="p-4 border-b border-stone-100">
                <${DetailSectionHeading} className="text-xs font-bold uppercase tracking-wider text-stone-600 mb-3">
                  Records (${entityRecords.length})
                <//>
                <div
                  className="space-y-2 max-h-64 overflow-y-auto"
                  role="region"
                  tabIndex="0"
                  aria-label="Records mentioning this entity"
                >
                  ${entityRecords.slice(0, 20).map(record => html`
                    <button
                      type="button"
                      key=${record.id}
                      onClick=${(e) => { e.stopPropagation(); onSelectRecord(record.id); }}
                      className="w-full text-left p-2 rounded border border-stone-100 hover:border-stone-300 hover:bg-stone-50 transition-all"
                    >
                      <div className="text-xs font-bold text-stone-800 font-display leading-tight truncate">
                        ${record.title}
                      </div>
                      <div className="text-[10px] text-stone-600 mt-0.5 font-mono">
                        ${record.date} | ${record.pub}
                      </div>
                    </button>
                  `)}
                  ${entityRecords.length > 20 && html`
                    <div className="text-xs text-stone-600 text-center py-1">
                      +${entityRecords.length - 20} more records
                    </div>
                  `}
                </div>
              </div>

              <!-- Co-occurring entities -->
              ${coOccurring.length > 0 && html`
                <div className="p-4">
                  <${DetailSectionHeading} className="text-xs font-bold uppercase tracking-wider text-stone-600 mb-3">
                    Often appears with
                  <//>
                  <div className="space-y-1.5">
                    ${coOccurring.slice(0, 15).map(coEntity => {
                      const coConfig = TYPE_CONFIG[coEntity.type] || TYPE_CONFIG.Concept;
                      const CoIcon = coConfig.icon;
                      return html`
                        <button
                          type="button"
                          key=${coEntity.id}
                          onClick=${(event) => handleEntitySelect(coEntity, event.currentTarget)}
                          className="w-full text-left flex items-center gap-2 p-1.5 rounded hover:bg-stone-50 transition-colors"
                        >
                          <${CoIcon} className="w-3 h-3 flex-shrink-0" style=${{ color: coConfig.color }} />
                          <span className="text-xs font-body text-stone-700 truncate flex-grow">
                            ${coEntity.name}
                          </span>
                          <span className="text-[10px] font-mono text-stone-600 flex-shrink-0">
                            ${coEntity.coCount}x
                          </span>
                        </button>
                      `;
                    })}
                  </div>
                </div>
              `}
            </div>
          </div>
        `}
      </div>
    </div>
  `;
};

export default EntityBrowser;
