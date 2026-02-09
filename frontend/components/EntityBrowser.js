
import { useState, useEffect, useMemo, useCallback } from 'react';
import { html } from '../html.js?v=3.0.1';
import { Users, Building2, Lightbulb, BookOpen, MapPin, Calendar, Search, ArrowUpDown, ChevronDown, ChevronRight, X, ExternalLink } from 'lucide-react';
import { fetchEntitiesData, getRecordsByEntity, getEntityById, areEntitiesLoaded } from '../services/archiveService.js?v=3.0.2';
import { COLORS, ENTITY_TYPE_CONFIG } from '../constants.js?v=3.0.1';

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

const EntityBrowser = ({ records, onSelectRecord }) => {
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('mentions');
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [entityRecords, setEntityRecords] = useState([]);
  const [coOccurring, setCoOccurring] = useState([]);
  const [recordEntityMap, setRecordEntityMap] = useState({});

  // Load entity data
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await fetchEntitiesData();
      if (data && data.entities) {
        setEntities(data.entities);
        setRecordEntityMap(data.recordEntityMap || {});
      }
      setLoading(false);
    };
    load();
  }, []);

  // Type counts
  const typeCounts = useMemo(() => {
    const counts = {};
    entities.forEach(e => {
      counts[e.type] = (counts[e.type] || 0) + 1;
    });
    return counts;
  }, [entities]);

  // Filter and sort entities
  const filteredEntities = useMemo(() => {
    let result = entities;

    if (selectedType) {
      result = result.filter(e => e.type === selectedType);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(e =>
        e.name.toLowerCase().includes(term) ||
        (e.role && e.role.toLowerCase().includes(term))
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
  }, [entities, selectedType, searchTerm, sortBy]);

  // Limit displayed entities for performance
  const [displayLimit, setDisplayLimit] = useState(100);
  const displayedEntities = filteredEntities.slice(0, displayLimit);

  // Reset display limit when filters change
  useEffect(() => {
    setDisplayLimit(100);
  }, [selectedType, searchTerm, sortBy]);

  // When an entity is selected, find its records and co-occurring entities
  const handleEntitySelect = useCallback((entity) => {
    if (selectedEntity && selectedEntity.id === entity.id) {
      setSelectedEntity(null);
      setEntityRecords([]);
      setCoOccurring([]);
      return;
    }

    setSelectedEntity(entity);

    // Find records that mention this entity
    const recordIds = getRecordsByEntity(entity.id);
    const matchedRecords = recordIds
      .map(rid => records.find(r => r.id === rid))
      .filter(Boolean)
      .sort((a, b) => b.date.localeCompare(a.date));
    setEntityRecords(matchedRecords);

    // Find co-occurring entities (appear in same records)
    const coEntityCounts = {};
    recordIds.forEach(rid => {
      const entityIds = recordEntityMap[rid] || [];
      entityIds.forEach(eid => {
        if (eid !== entity.id) {
          coEntityCounts[eid] = (coEntityCounts[eid] || 0) + 1;
        }
      });
    });

    const coEntities = Object.entries(coEntityCounts)
      .map(([eid, count]) => {
        const e = getEntityById(eid);
        return e ? { ...e, coCount: count } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.coCount - a.coCount)
      .slice(0, 20);

    setCoOccurring(coEntities);
  }, [selectedEntity, records, recordEntityMap]);

  if (loading) {
    return html`
      <div className="flex flex-col items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-stone-300 border-t-stone-800 rounded-full mb-4"></div>
        <p className="text-stone-500 text-sm font-body">Loading entity data...</p>
      </div>
    `;
  }

  return html`
    <div className="flex flex-col gap-6">
      <!-- Type filter chips -->
      <div className="flex flex-wrap gap-2">
        <button
          onClick=${() => setSelectedType(null)}
          className=${`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
            !selectedType
              ? 'bg-stone-800 text-white border-stone-800'
              : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
          }`}
        >
          All (${entities.length})
        </button>
        ${Object.entries(TYPE_CONFIG).map(([type, config]) => {
          const count = typeCounts[type] || 0;
          if (count === 0) return null;
          const Icon = config.icon;
          return html`
            <button
              key=${type}
              onClick=${() => setSelectedType(selectedType === type ? null : type)}
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
          <${Search} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            value=${searchTerm}
            onInput=${(e) => setSearchTerm(e.target.value)}
            placeholder="Search entities..."
            className="w-full pl-9 pr-8 py-2 border border-stone-200 rounded text-sm font-body focus:outline-none focus:border-stone-400"
          />
          ${searchTerm && html`
            <button
              onClick=${() => setSearchTerm('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
            >
              <${X} className="w-4 h-4" />
            </button>
          `}
        </div>
        <div className="flex items-center gap-2">
          <${ArrowUpDown} className="w-4 h-4 text-stone-400" />
          <select
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
        <div className="flex-grow">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${displayedEntities.map(entity => {
              const config = TYPE_CONFIG[entity.type] || TYPE_CONFIG.Concept;
              const Icon = config.icon;
              const isSelected = selectedEntity && selectedEntity.id === entity.id;
              const mentions = entity.totalMentions || 1;

              return html`
                <button
                  key=${entity.id}
                  onClick=${() => handleEntitySelect(entity)}
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
                        <span className="text-xs font-mono text-stone-400">
                          ${mentions} record${mentions !== 1 ? 's' : ''}
                        </span>
                        ${entity.prominence > 0 && html`
                          <span className="text-xs font-mono text-stone-400">
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
              onClick=${() => setDisplayLimit(prev => prev + 100)}
              className="mt-4 w-full py-2 text-sm font-bold text-stone-600 border border-stone-200 rounded hover:bg-stone-50 transition-colors"
            >
              Show more (${filteredEntities.length - displayedEntities.length} remaining)
            </button>
          `}
        </div>

        <!-- Detail panel (when entity selected) -->
        ${selectedEntity && html`
          <div className="lg:w-96 lg:sticky lg:top-20 lg:self-start flex-shrink-0">
            <div className="border border-stone-200 rounded bg-white shadow-sm">
              <!-- Entity header -->
              <div className="p-4 border-b border-stone-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="p-1.5 rounded"
                      style=${{ backgroundColor: (TYPE_CONFIG[selectedEntity.type] || TYPE_CONFIG.Concept).bg }}
                    >
                      <${(TYPE_CONFIG[selectedEntity.type] || TYPE_CONFIG.Concept).icon}
                        className="w-4 h-4"
                        style=${{ color: (TYPE_CONFIG[selectedEntity.type] || TYPE_CONFIG.Concept).color }}
                      />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-stone-400">
                      ${selectedEntity.type}
                    </span>
                  </div>
                  <button
                    onClick=${() => { setSelectedEntity(null); setEntityRecords([]); setCoOccurring([]); }}
                    className="text-stone-400 hover:text-stone-600"
                  >
                    <${X} className="w-4 h-4" />
                  </button>
                </div>
                <h3 className="font-display font-bold text-lg text-stone-900 mt-2">
                  ${selectedEntity.name}
                </h3>
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
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3">
                  Records (${entityRecords.length})
                </h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  ${entityRecords.slice(0, 20).map(record => html`
                    <button
                      key=${record.id}
                      onClick=${(e) => { e.stopPropagation(); onSelectRecord(record.id); }}
                      className="w-full text-left p-2 rounded border border-stone-100 hover:border-stone-300 hover:bg-stone-50 transition-all"
                    >
                      <div className="text-xs font-bold text-stone-800 font-display leading-tight truncate">
                        ${record.title}
                      </div>
                      <div className="text-[10px] text-stone-400 mt-0.5 font-mono">
                        ${record.date} | ${record.pub}
                      </div>
                    </button>
                  `)}
                  ${entityRecords.length > 20 && html`
                    <div className="text-xs text-stone-400 text-center py-1">
                      +${entityRecords.length - 20} more records
                    </div>
                  `}
                </div>
              </div>

              <!-- Co-occurring entities -->
              ${coOccurring.length > 0 && html`
                <div className="p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3">
                    Often appears with
                  </h4>
                  <div className="space-y-1.5">
                    ${coOccurring.slice(0, 15).map(coEntity => {
                      const coConfig = TYPE_CONFIG[coEntity.type] || TYPE_CONFIG.Concept;
                      const CoIcon = coConfig.icon;
                      return html`
                        <button
                          key=${coEntity.id}
                          onClick=${() => handleEntitySelect(coEntity)}
                          className="w-full text-left flex items-center gap-2 p-1.5 rounded hover:bg-stone-50 transition-colors"
                        >
                          <${CoIcon} className="w-3 h-3 flex-shrink-0" style=${{ color: coConfig.color }} />
                          <span className="text-xs font-body text-stone-700 truncate flex-grow">
                            ${coEntity.name}
                          </span>
                          <span className="text-[10px] font-mono text-stone-400 flex-shrink-0">
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
