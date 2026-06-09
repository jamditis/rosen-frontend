/**
 * Analytics Dashboard Component
 *
 * Full-page view with interactive data visualizations
 * showing archive statistics, trends, and insights.
 */

import { useEffect, useState } from 'react';
import { html } from '../html.js?v=3.4.0';
import {
  BarChart3,
  TrendingUp,
  Users,
  Tag,
  Calendar,
  Database,
  Loader2,
  ArrowLeft,
  RefreshCw
} from 'lucide-react';
import {
  initSqlite,
  isSqliteReady,
  fetchAnalytics,
  queryAsObjects
} from '../services/archiveService.js?v=3.4.0';
import QueryBuilder from './QueryBuilder.js?v=3.4.0';

// Simple bar chart component
const BarChart = ({ data, labelKey, valueKey, maxBars = 10, color = '#1c1917' }) => {
  if (!data || data.length === 0) return html`<p className="text-stone-400 text-sm">No data available</p>`;

  const displayData = data.slice(0, maxBars);
  const maxValue = Math.max(...displayData.map(d => d[valueKey]));

  // Label sits above each bar so every bar shares the same left baseline and
  // full width, regardless of how long the label is. A fixed-width label
  // column would either misalign the bars or truncate long names (e.g. the
  // era labels), which made the charts hard to compare.
  return html`
    <div className="space-y-3">
      ${displayData.map((item, i) => html`
        <div key=${i}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs text-stone-600 truncate" title=${item[labelKey]}>
              ${item[labelKey]}
            </span>
            <span className="text-xs text-stone-500 font-mono flex-shrink-0">
              ${item[valueKey].toLocaleString()}
            </span>
          </div>
          <div className="h-3 bg-stone-100 rounded overflow-hidden">
            <div
              className="h-full rounded transition-all duration-500"
              style=${{
                width: `${maxValue ? (item[valueKey] / maxValue) * 100 : 0}%`,
                backgroundColor: color
              }}
            />
          </div>
        </div>
      `)}
    </div>
  `;
};

// Stat card component
const StatCard = ({ icon: Icon, label, value, sublabel }) => html`
  <div className="bg-white border border-stone-200 rounded-lg p-4">
    <div className="flex items-center gap-3 mb-2">
      <div className="p-2 bg-stone-100 rounded">
        <${Icon} className="w-4 h-4 text-stone-600" />
      </div>
      <span className="text-xs uppercase tracking-wider text-stone-400 font-bold">${label}</span>
    </div>
    <div className="text-2xl font-bold text-stone-900">${value}</div>
    ${sublabel && html`<div className="text-xs text-stone-500 mt-1">${sublabel}</div>`}
  </div>
`;

const AnalyticsDashboard = ({ onBack }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [byYear, setByYear] = useState([]);
  const [byCategory, setByCategory] = useState([]);
  const [byEra, setByEra] = useState([]);
  const [topPeople, setTopPeople] = useState([]);
  const [topConcepts, setTopConcepts] = useState([]);
  const [coOccurrence, setCoOccurrence] = useState([]);
  const [customQueryResult, setCustomQueryResult] = useState(null);
  const [customQuery, setCustomQuery] = useState('SELECT year, COUNT(*) as count FROM records GROUP BY year ORDER BY count DESC LIMIT 10');
  // Tracks the lazy SQLite load triggered by the raw-SQL box (the charts above
  // render from the prebuilt aggregates and never need SQLite).
  const [sqlLoading, setSqlLoading] = useState(false);

  // Load the prebuilt analytics aggregates. This is a ~1KB fetch, not the
  // ~28MB SQLite source — SQLite only loads when a user runs a custom query.
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        const analytics = await fetchAnalytics();
        setStats(analytics.stats);
        setByYear(analytics.byYear);
        setByCategory(analytics.byCategory);
        setByEra(analytics.byEra);
        setTopPeople(analytics.topPeople);
        setTopConcepts(analytics.topConcepts);
        setCoOccurrence(analytics.coOccurrence);
        setLoading(false);
      } catch (err) {
        console.error('[Analytics] Error:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Run a raw SQL query. SQLite is loaded on demand here (and in the Query
  // Builder) rather than on page load, so the first query pays the load cost.
  const runCustomQuery = async () => {
    try {
      if (!isSqliteReady()) {
        setSqlLoading(true);
        const ready = await initSqlite();
        setSqlLoading(false);
        if (!ready) {
          setCustomQueryResult({ success: false, error: 'Could not load the query database. Please try again.' });
          return;
        }
      }
      const result = queryAsObjects(customQuery);
      setCustomQueryResult({ success: true, data: result });
    } catch (err) {
      setSqlLoading(false);
      setCustomQueryResult({ success: false, error: err.message });
    }
  };

  return html`
    <div className="min-h-screen bg-[#fdfbf7]">
      <header className="sticky top-0 z-50 bg-paper border-b border-stone-300 shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center">
          <button
            onClick=${onBack}
            className="flex items-center gap-2 text-stone-600 hover:text-stone-900 transition-colors mr-4"
          >
            <${ArrowLeft} className="w-5 h-5" />
            <span className="text-sm font-bold hidden sm:inline">Archive</span>
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-stone-900 rounded">
              <${BarChart3} className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-display font-bold text-stone-900">Archive analytics</h2>
              <p className="text-xs text-stone-500">Powered by sql.js (SQLite in your browser)</p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        ${loading && html`
          <div className="flex flex-col items-center justify-center h-64">
            <${Loader2} className="w-8 h-8 text-stone-400 animate-spin mb-4" />
            <p className="text-stone-500">Loading analytics...</p>
          </div>
        `}

        ${error && html`
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-700 font-bold mb-2">Error loading analytics</p>
            <p className="text-red-600 text-sm">${error}</p>
            <button
              onClick=${() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Reload Page
            </button>
          </div>
        `}

        ${!loading && !error && html`
          <div className="space-y-8">
            <!-- Summary Stats -->
            <section>
              <h3 className="text-sm uppercase tracking-wider text-stone-400 font-bold mb-4 flex items-center gap-2">
                <${Database} className="w-4 h-4" /> Database overview
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <${StatCard}
                  icon=${BarChart3}
                  label="Records"
                  value=${stats?.records?.toLocaleString() || '0'}
                />
                <${StatCard}
                  icon=${Tag}
                  label="Categories"
                  value=${stats?.categories || '0'}
                />
                <${StatCard}
                  icon=${TrendingUp}
                  label="Concepts"
                  value=${stats?.concepts || '0'}
                />
                <${StatCard}
                  icon=${Users}
                  label="Entities"
                  value=${stats?.entities?.toLocaleString() || '0'}
                />
              </div>
            </section>

            <!-- Charts Grid -->
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="bg-white border border-stone-200 rounded-lg p-4">
                <h3 className="text-sm uppercase tracking-wider text-stone-400 font-bold mb-4 flex items-center gap-2">
                  <${Calendar} className="w-4 h-4" /> Records by era
                </h3>
                <${BarChart} data=${byEra} labelKey="era" valueKey="count" color="#059669" />
              </section>

              <section className="bg-white border border-stone-200 rounded-lg p-4">
                <h3 className="text-sm uppercase tracking-wider text-stone-400 font-bold mb-4 flex items-center gap-2">
                  <${Tag} className="w-4 h-4" /> Top categories
                </h3>
                <${BarChart} data=${byCategory} labelKey="category" valueKey="count" color="#0284c7" />
              </section>

              <section className="bg-white border border-stone-200 rounded-lg p-4">
                <h3 className="text-sm uppercase tracking-wider text-stone-400 font-bold mb-4 flex items-center gap-2">
                  <${Users} className="w-4 h-4" /> Most mentioned people
                </h3>
                <${BarChart} data=${topPeople} labelKey="name" valueKey="mentions" color="#7c3aed" />
              </section>

              <section className="bg-white border border-stone-200 rounded-lg p-4">
                <h3 className="text-sm uppercase tracking-wider text-stone-400 font-bold mb-4 flex items-center gap-2">
                  <${TrendingUp} className="w-4 h-4" /> Most common concepts
                </h3>
                <${BarChart} data=${topConcepts} labelKey="concept" valueKey="count" color="#dc2626" />
              </section>
            </div>

            <!-- Records by Year -->
            <section className="bg-white border border-stone-200 rounded-lg p-4">
              <h3 className="text-sm uppercase tracking-wider text-stone-400 font-bold mb-4 flex items-center gap-2">
                <${Calendar} className="w-4 h-4" /> Output by year
              </h3>
              <div className="overflow-x-auto">
                <${BarChart} data=${byYear} labelKey="year" valueKey="count" maxBars=${30} color="#1c1917" />
              </div>
            </section>

            <!-- Category Co-occurrence -->
            <section className="bg-white border border-stone-200 rounded-lg p-4">
              <h3 className="text-sm uppercase tracking-wider text-stone-400 font-bold mb-4">
                Categories that appear together
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                ${coOccurrence.map((item, i) => html`
                  <div key=${i} className="flex items-center justify-between bg-stone-50 rounded px-3 py-2">
                    <span className="text-xs text-stone-700">
                      ${item.category1} <span className="text-stone-400">+</span> ${item.category2}
                    </span>
                    <span className="text-xs font-mono text-stone-500">${item.co_occurrences}</span>
                  </div>
                `)}
              </div>
            </section>

            <!-- Query Builder -->
            <section className="bg-gradient-to-br from-stone-50 to-amber-50 border-2 border-stone-200 rounded-lg p-6">
              <h3 className="text-sm uppercase tracking-wider text-stone-500 font-bold mb-4 flex items-center gap-2">
                <${Database} className="w-4 h-4" /> Query builder
                <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-normal normal-case">No SQL knowledge required!</span>
              </h3>
              <p className="text-sm text-stone-600 mb-6">
                Build custom queries by completing sentences. Choose from dropdowns and enter values to explore the archive your way.
              </p>
              <${QueryBuilder} />
            </section>

            <!-- Custom Query Section -->
            <section className="bg-stone-800 text-white rounded-lg p-4">
              <h3 className="text-sm uppercase tracking-wider text-stone-400 font-bold mb-4 flex items-center gap-2">
                <${Database} className="w-4 h-4" /> Advanced: raw SQL query
              </h3>
              <div className="space-y-4">
                <textarea
                  value=${customQuery}
                  onChange=${(e) => setCustomQuery(e.target.value)}
                  className="w-full h-24 bg-stone-900 text-green-400 font-mono text-sm p-3 rounded border border-stone-700 focus:border-green-500 focus:outline-none"
                  placeholder="Enter SQL query..."
                />
                <div className="flex items-center gap-4">
                  <button
                    onClick=${runCustomQuery}
                    disabled=${sqlLoading}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-bold text-sm flex items-center gap-2 disabled:opacity-60"
                  >
                    ${sqlLoading
                      ? html`<${Loader2} className="w-4 h-4 animate-spin" /> Loading database...`
                      : html`<${RefreshCw} className="w-4 h-4" /> Run Query`}
                  </button>
                  <span className="text-xs text-stone-500">
                    ${sqlLoading
                      ? 'First query loads the full archive into SQLite (~28MB, one time)'
                      : 'Tables: records, record_categories, record_concepts, entities, record_entities'}
                  </span>
                </div>

                ${customQueryResult && html`
                  <div className="mt-4">
                    ${customQueryResult.success ? html`
                      <div className="bg-stone-900 rounded p-3 overflow-x-auto">
                        <pre className="text-xs text-green-400 font-mono">
                          ${JSON.stringify(customQueryResult.data, null, 2)}
                        </pre>
                      </div>
                    ` : html`
                      <div className="bg-red-900/50 rounded p-3">
                        <p className="text-red-400 text-sm">${customQueryResult.error}</p>
                      </div>
                    `}
                  </div>
                `}
              </div>
            </section>

            <!-- Example Queries -->
            <section className="bg-stone-50 border border-stone-200 rounded-lg p-4">
              <h3 className="text-sm uppercase tracking-wider text-stone-400 font-bold mb-4">
                Example queries to try
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <button
                  onClick=${() => setCustomQuery("SELECT pub, COUNT(*) as count FROM records GROUP BY pub ORDER BY count DESC LIMIT 15")}
                  className="text-left p-3 bg-white rounded border border-stone-200 hover:border-stone-400 transition-colors"
                >
                  <span className="font-bold text-stone-800">Top publications</span>
                  <p className="text-stone-500 mt-1">Which outlets has Jay written for most?</p>
                </button>
                <button
                  onClick=${() => setCustomQuery("SELECT year, type, COUNT(*) as count FROM records GROUP BY year, type ORDER BY year DESC")}
                  className="text-left p-3 bg-white rounded border border-stone-200 hover:border-stone-400 transition-colors"
                >
                  <span className="font-bold text-stone-800">Articles vs social by year</span>
                  <p className="text-stone-500 mt-1">Compare output types over time</p>
                </button>
                <button
                  onClick=${() => setCustomQuery("SELECT e.name, e.type, COUNT(*) as mentions FROM entities e JOIN record_entities re ON e.id = re.entity_id WHERE e.type = 'Organization' GROUP BY e.id ORDER BY mentions DESC LIMIT 15")}
                  className="text-left p-3 bg-white rounded border border-stone-200 hover:border-stone-400 transition-colors"
                >
                  <span className="font-bold text-stone-800">Top organizations</span>
                  <p className="text-stone-500 mt-1">Most mentioned organizations</p>
                </button>
                <button
                  onClick=${() => setCustomQuery("SELECT title, date, pub FROM records WHERE title LIKE '%Trump%' ORDER BY date DESC LIMIT 20")}
                  className="text-left p-3 bg-white rounded border border-stone-200 hover:border-stone-400 transition-colors"
                >
                  <span className="font-bold text-stone-800">Articles about Trump</span>
                  <p className="text-stone-500 mt-1">Search for specific topics</p>
                </button>
              </div>
            </section>
          </div>
        `}
      </div>
    </div>
  `;
};

export default AnalyticsDashboard;
