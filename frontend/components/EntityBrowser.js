
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { html } from '../html.js?v=3.8.21';
import { Users, Building2, Lightbulb, BookOpen, MapPin, Calendar, Search, ArrowUpDown, ChevronDown, ChevronRight, X, ExternalLink, AlertTriangle, RotateCw } from 'lucide-react';
import { fetchEntitiesData, getRecordsByEntity } from '../services/archiveService.js?v=3.8.21';
import { getEntityScope } from '../services/queryComposition.js?v=3.8.21';
import { COLORS, ENTITY_TYPE_CONFIG } from '../constants.js?v=3.8.21';
import { normalizeForSearch } from '../utils/searchNormalize.js?v=3.8.21';

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
  onClearQuery,
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
      <div className="archive-data-loading" role="status" aria-live="polite">
        <div className="archive-data-loading__spinner" aria-hidden="true"></div>
        <p>Loading entity data...</p>
      </div>
    `;
  }

  if (loadError) {
    return html`
      <div className="archive-notice archive-notice--danger archive-data-error" role="alert">
        <${AlertTriangle} aria-hidden="true" />
        <div>
          <h3>Unable to load people and ideas</h3>
          <p>${loadError}</p>
          <button
            type="button"
            onClick=${() => window.location.reload()}
            className="archive-action archive-action--danger"
          >
            <${RotateCw} aria-hidden="true" />
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
    <div className="archive-data-surface archive-data-surface--entities">
      ${queryActive && html`
        <div className="archive-notice archive-notice--warning archive-data-query-scope" role="status">
          <p><strong>Query scope:</strong> Counts and connections below are limited to the current query results.</p>
          <button
            type="button"
            onClick=${onClearQuery}
            className="archive-action archive-action--secondary"
          >
            Clear query results
          </button>
        </div>
      `}

      <!-- Type filter chips -->
      <div className="archive-data-dimensions" aria-label="Entity types">
        <button
          type="button"
          onClick=${() => setSelectedType(null)}
          aria-pressed=${!selectedType}
          className=${`archive-data-dimension ${!selectedType ? 'is-active' : ''}`}
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
              className=${`archive-data-dimension ${selectedType === type ? 'is-active' : ''}`}
              style=${{
                '--archive-dimension-color': config.color,
                '--archive-dimension-soft': config.bg,
              }}
            >
              <${Icon} aria-hidden="true" />
              ${config.label} (${count})
            </button>
          `;
        })}
      </div>

      <!-- Search and sort controls -->
      <div className="archive-data-toolbar">
        <div className="archive-data-search">
          <label htmlFor="entity-search" className="sr-only">Search entities</label>
          <${Search} className="archive-data-search__icon" aria-hidden="true" />
          <input
            id="entity-search"
            type="text"
            value=${searchTerm}
            onInput=${(e) => setSearchTerm(e.target.value)}
            placeholder="Search entities..."
            className="archive-control archive-data-search__input"
          />
          ${searchTerm && html`
            <button
              type="button"
              onClick=${() => setSearchTerm('')}
              className="archive-data-search__clear"
              aria-label="Clear entity search"
            >
              <${X} aria-hidden="true" />
            </button>
          `}
        </div>
        <div className="archive-data-sort">
          <${ArrowUpDown} aria-hidden="true" />
          <select
            aria-label="Sort entities"
            value=${sortBy}
            onChange=${(e) => setSortBy(e.target.value)}
            className="archive-control"
          >
            <option value="mentions">Most mentioned</option>
            <option value="prominence">Highest prominence</option>
            <option value="name">Alphabetical</option>
          </select>
        </div>
      </div>

      <div className="archive-data-caption" aria-live="polite">
        Showing ${displayedEntities.length} of ${filteredEntities.length} entities
      </div>

      <!-- Main content: entity list + detail panel -->
      <div className=${`archive-entity-layout ${selectedEntity ? 'has-detail' : ''}`}>
        <!-- Entity list -->
        <div className="entity-browser-list flex-grow">
          <div className="archive-entity-grid">
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
                  className=${`archive-entity-row ${isSelected ? 'is-selected' : ''}`}
                  style=${{
                    '--archive-entity-accent': config.color,
                    '--archive-entity-soft': config.bg,
                  }}
                >
                  <div className="archive-entity-row__content">
                    <div
                      className="archive-entity-row__icon"
                      style=${{ backgroundColor: config.bg }}
                    >
                      <${Icon} style=${{ color: config.color }} aria-hidden="true" />
                    </div>
                    <div className="archive-entity-row__body">
                      <div className="archive-entity-row__name">
                        ${entity.name}
                      </div>
                      ${entity.role && entity.role !== 'None' && html`
                        <div className="archive-entity-row__role">
                          ${entity.role}
                        </div>
                      `}
                      <div className="archive-entity-row__metrics">
                        <span>
                          ${mentions} record${mentions !== 1 ? 's' : ''}
                        </span>
                        ${entity.prominence > 0 && html`
                          <span>
                            P:${entity.prominence}
                          </span>
                        `}
                      </div>
                    </div>
                    <${isSelected ? ChevronDown : ChevronRight}
                      className="archive-entity-row__chevron"
                      aria-hidden="true"
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
              className="archive-action archive-action--secondary archive-entity-more"
            >
              Show more (${filteredEntities.length - displayedEntities.length} remaining)
            </button>
          `}
        </div>

        <!-- Detail panel (when entity selected) -->
        ${selectedEntity && html`
          <div className="entity-browser-detail flex-shrink-0 archive-entity-detail">
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
              className="archive-data-panel archive-entity-detail__sheet"
            >
              <!-- Entity header -->
              <div className="archive-entity-detail__header">
                <div className="archive-entity-detail__utility">
                  <div className="archive-entity-detail__type">
                    <div
                      className="archive-entity-detail__icon"
                      style=${{ backgroundColor: selConfig.bg }}
                    >
                      <${selConfig.icon}
                        style=${{ color: selConfig.color }}
                        aria-hidden="true"
                      />
                    </div>
                    <span>
                      ${selectedEntity.type}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick=${closeEntityDetails}
                    className="archive-action archive-action--quiet archive-entity-detail__close"
                    style=${{ minWidth: '44px', minHeight: '44px' }}
                    aria-label="Close entity details"
                  >
                    <${X} aria-hidden="true" />
                  </button>
                </div>
                <${DetailHeading}
                  id="entity-detail-title"
                  ref=${detailHeadingRef}
                  tabIndex="-1"
                  className="entity-detail-heading archive-entity-detail__title"
                >
                  ${selectedEntity.name}
                <//>
                ${selectedEntity.role && selectedEntity.role !== 'None' && html`
                  <p className="archive-entity-detail__role">${selectedEntity.role}</p>
                `}
                <div className="archive-entity-detail__metrics">
                  <span>${entityRecords.length} records</span>
                  <span>Prominence: ${selectedEntity.prominence || 0}</span>
                </div>
              </div>

              <!-- Records mentioning this entity -->
              <div className="archive-entity-detail__section">
                <${DetailSectionHeading} className="archive-data-heading">
                  Records (${entityRecords.length})
                <//>
                <div
                  className="archive-entity-detail__records archive-data-scroll"
                  role="region"
                  tabIndex="0"
                  aria-label="Records mentioning this entity"
                >
                  ${entityRecords.slice(0, 20).map(record => html`
                    <button
                      type="button"
                      key=${record.id}
                      onClick=${(e) => { e.stopPropagation(); onSelectRecord(record.id); }}
                      className="archive-entity-record"
                    >
                      <div className="archive-entity-record__title">
                        ${record.title}
                      </div>
                      <div className="archive-entity-record__meta">
                        ${record.date} | ${record.pub}
                      </div>
                    </button>
                  `)}
                  ${entityRecords.length > 20 && html`
                    <div className="archive-data-caption archive-entity-record__more">
                      +${entityRecords.length - 20} more records
                    </div>
                  `}
                </div>
              </div>

              <!-- Co-occurring entities -->
              ${coOccurring.length > 0 && html`
                <div className="archive-entity-detail__section">
                  <${DetailSectionHeading} className="archive-data-heading">
                    Often appears with
                  <//>
                  <div className="archive-entity-relations">
                    ${coOccurring.slice(0, 15).map(coEntity => {
                      const coConfig = TYPE_CONFIG[coEntity.type] || TYPE_CONFIG.Concept;
                      const CoIcon = coConfig.icon;
                      return html`
                        <button
                          type="button"
                          key=${coEntity.id}
                          onClick=${(event) => handleEntitySelect(coEntity, event.currentTarget)}
                          className="archive-entity-relation"
                        >
                          <${CoIcon} style=${{ color: coConfig.color }} aria-hidden="true" />
                          <span>
                            ${coEntity.name}
                          </span>
                          <strong>
                            ${coEntity.coCount}x
                          </strong>
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
