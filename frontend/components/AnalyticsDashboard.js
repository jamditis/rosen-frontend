/**
 * Analytics Dashboard Component
 *
 * Full-page view with interactive data visualizations
 * showing archive statistics, trends, and insights.
 */

import { useEffect, useState } from 'react';
import { html } from '../html.js?v=3.8.21';
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
} from '../services/archiveService.js?v=3.8.21';
import QueryBuilder from './QueryBuilder.js?v=3.8.21';

// Simple bar chart component
const BarChart = ({ data, labelKey, valueKey, maxBars = 10, color = '#1c1917' }) => {
  if (!data || data.length === 0) return html`<p className="text-stone-600 text-sm">No data available</p>`;

  const displayData = data.slice(0, maxBars);
  const maxValue = Math.max(...displayData.map(d => d[valueKey]));

  // Label sits above each bar so every bar shares the same left baseline and
  // full width, regardless of how long the label is. A fixed-width label
  // column would either misalign the bars or truncate long names (e.g. the
  // era labels), which made the charts hard to compare.
  return html`
    <div className="archive-data-bars">
      ${displayData.map((item, i) => html`
        <div key=${i} className="archive-data-bar">
          <div className="archive-data-bar__labels">
            <span>
              ${item[labelKey]}
            </span>
            <strong>
              ${item[valueKey].toLocaleString()}
            </strong>
          </div>
          <div className="archive-data-bar__track">
            <div
              className="archive-data-bar__fill"
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
const StatCard = ({ icon: Icon, label, value, sublabel, accent }) => html`
  <div className="archive-data-stat" style=${{ '--archive-stat-accent': accent }}>
    <div className="archive-data-stat__label">
      <div className="archive-data-stat__icon">
        <${Icon} aria-hidden="true" />
      </div>
      <span>${label}</span>
    </div>
    <div className="archive-data-stat__value">${value}</div>
    ${sublabel && html`<div className="archive-data-stat__note">${sublabel}</div>`}
  </div>
`;

const AnalyticsDashboard = ({ onBack, onRecordResults, embedded = false }) => {
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
        setError('The archive summary could not load. Please refresh the page or try again later.');
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
    <div className=${embedded ? 'desktop-analytics-surface archive-data-route archive-data-route--analytics is-embedded' : 'archive-data-route archive-data-route--analytics'}>
      ${!embedded && html`<header className="archive-data-route__header">
        <div className="archive-data-route__header-inner">
          <button
            type="button"
            aria-label="Return to archive"
            onClick=${onBack}
            className="archive-action archive-action--quiet archive-data-route__back"
          >
            <${ArrowLeft} aria-hidden="true" />
            <span>Archive</span>
          </button>
          <div className="archive-data-route__identity">
            <div className="archive-data-route__mark">
              <${BarChart3} aria-hidden="true" />
            </div>
            <div>
              <h2
                data-route-entry-focus
                tabIndex="-1"
                className="archive-data-route__title"
              >Archive analytics</h2>
              <p>Powered by sql.js (SQLite in your browser)</p>
            </div>
          </div>
        </div>
      </header>`}

      <div className=${embedded ? 'desktop-analytics-content archive-data-surface archive-data-surface--analytics' : 'archive-data-surface archive-data-surface--analytics'}>
        ${loading && html`
          <div className="archive-data-loading" role="status" aria-live="polite">
            <${Loader2} className="archive-data-loading__icon animate-spin" aria-hidden="true" />
            <p>Loading analytics...</p>
          </div>
        `}

        ${error && html`
          <div className="archive-notice archive-notice--danger archive-data-error" role="alert">
            <div>
            <h3>Error loading analytics</h3>
            <p>${error}</p>
            <button
              type="button"
              onClick=${() => window.location.reload()}
              className="archive-action archive-action--danger"
            >
              Reload page
            </button>
            </div>
          </div>
        `}

        ${!loading && !error && html`
          <div className="archive-data-sections">
            <!-- Summary Stats -->
            <section className="archive-data-section">
              <h3 className="archive-data-heading">
                <${Database} aria-hidden="true" /> Database overview
              </h3>
              <div className="archive-data-stats">
                <${StatCard}
                  icon=${BarChart3}
                  label="Records"
                  value=${stats?.records?.toLocaleString() || '0'}
                  accent="var(--archive-ink)"
                />
                <${StatCard}
                  icon=${Tag}
                  label="Categories"
                  value=${stats?.categories || '0'}
                  accent="var(--archive-sky-dark)"
                />
                <${StatCard}
                  icon=${TrendingUp}
                  label="Concepts"
                  value=${stats?.concepts || '0'}
                  accent="var(--archive-amber-dark)"
                />
                <${StatCard}
                  icon=${Users}
                  label="Entities"
                  value=${stats?.entities?.toLocaleString() || '0'}
                  accent="var(--archive-green-dark)"
                />
              </div>
            </section>

            <!-- Charts Grid -->
            <div className="archive-data-chart-grid">
              <section className="archive-data-panel archive-data-chart">
                <h3 className="archive-data-heading">
                  <${Calendar} aria-hidden="true" /> Records by era
                </h3>
                <${BarChart} data=${byEra} labelKey="era" valueKey="count" color="#059669" />
              </section>

              <section className="archive-data-panel archive-data-chart">
                <h3 className="archive-data-heading">
                  <${Tag} aria-hidden="true" /> Top categories
                </h3>
                <${BarChart} data=${byCategory} labelKey="category" valueKey="count" color="#0284c7" />
              </section>

              <section className="archive-data-panel archive-data-chart">
                <h3 className="archive-data-heading">
                  <${Users} aria-hidden="true" /> Most mentioned people
                </h3>
                <${BarChart} data=${topPeople} labelKey="name" valueKey="mentions" color="#7c3aed" />
              </section>

              <section className="archive-data-panel archive-data-chart">
                <h3 className="archive-data-heading">
                  <${TrendingUp} aria-hidden="true" /> Most common concepts
                </h3>
                <${BarChart} data=${topConcepts} labelKey="concept" valueKey="count" color="#dc2626" />
              </section>
            </div>

            <!-- Records by Year -->
            <section className="archive-data-panel archive-data-chart archive-data-chart--wide">
              <h3 className="archive-data-heading">
                <${Calendar} aria-hidden="true" /> Output by year
              </h3>
              <div className="overflow-x-auto">
                <${BarChart} data=${byYear} labelKey="year" valueKey="count" maxBars=${30} color="#1c1917" />
              </div>
            </section>

            <!-- Category Co-occurrence -->
            <section className="archive-data-panel archive-data-cooccurrence">
              <h3 className="archive-data-heading">
                Categories that appear together
              </h3>
              <div className="archive-data-cooccurrence__grid">
                ${coOccurrence.map((item, i) => html`
                  <div key=${i} className="archive-data-cooccurrence__row">
                    <span>
                      ${item.category1} <b aria-hidden="true">+</b> ${item.category2}
                    </span>
                    <strong>${item.co_occurrences}</strong>
                  </div>
                `)}
              </div>
            </section>

            <!-- Query Builder -->
            <section className="archive-data-panel archive-query-lab">
              <h3 className="archive-data-heading">
                <${Database} aria-hidden="true" /> Query builder
                <span className="archive-data-note">No SQL knowledge required</span>
              </h3>
              <p className="archive-query-lab__intro">
                Build custom queries by completing sentences. Choose from dropdowns and enter values to explore the archive your way.
              </p>
              <${QueryBuilder} onRecordResults=${onRecordResults} />
            </section>

            <!-- Custom Query Section -->
            <section className="archive-query-terminal">
              <h3 className="archive-data-heading">
                <${Database} aria-hidden="true" /> Advanced: raw SQL query
              </h3>
              <div className="archive-query-terminal__body">
                <textarea
                  value=${customQuery}
                  onChange=${(e) => setCustomQuery(e.target.value)}
                  className="archive-query-terminal__input"
                  placeholder="Enter SQL query..."
                  aria-label="Raw SQL query"
                />
                <div className="archive-query-terminal__actions">
                  <button
                    type="button"
                    onClick=${runCustomQuery}
                    disabled=${sqlLoading}
                    className="archive-action archive-query-terminal__run"
                  >
                    ${sqlLoading
                      ? html`<${Loader2} className="w-4 h-4 animate-spin" /> Loading database...`
                      : html`<${RefreshCw} className="w-4 h-4" /> Run query`}
                  </button>
                  <span className="archive-query-terminal__hint">
                    ${sqlLoading
                      ? 'First query loads the full archive into SQLite (~28MB, one time)'
                      : 'Tables: records, record_categories, record_concepts, entities, record_entities'}
                  </span>
                </div>

                ${customQueryResult && html`
                  <div className="archive-query-terminal__results">
                    ${customQueryResult.success ? html`
                      <div className="archive-data-scroll" role="region" tabIndex="0" aria-label="Raw SQL results">
                        <pre>
                          ${JSON.stringify(customQueryResult.data, null, 2)}
                        </pre>
                      </div>
                    ` : html`
                      <div className="archive-query-terminal__error" role="alert">
                        <p>${customQueryResult.error}</p>
                      </div>
                    `}
                  </div>
                `}
              </div>
            </section>

            <!-- Example Queries -->
            <section className="archive-data-panel archive-query-examples">
              <h3 className="archive-data-heading">
                Example queries to try
              </h3>
              <div className="archive-query-examples__grid">
                <button
                  type="button"
                  onClick=${() => setCustomQuery("SELECT pub, COUNT(*) as count FROM records GROUP BY pub ORDER BY count DESC LIMIT 15")}
                  className="archive-query-example"
                >
                  <span>Top publications</span>
                  <p>Which outlets has Jay written for most?</p>
                </button>
                <button
                  type="button"
                  onClick=${() => setCustomQuery("SELECT year, type, COUNT(*) as count FROM records GROUP BY year, type ORDER BY year DESC")}
                  className="archive-query-example"
                >
                  <span>Articles vs social by year</span>
                  <p>Compare output types over time</p>
                </button>
                <button
                  type="button"
                  onClick=${() => setCustomQuery("SELECT e.name, e.type, COUNT(*) as mentions FROM entities e JOIN record_entities re ON e.id = re.entity_id WHERE e.type = 'Organization' GROUP BY e.id ORDER BY mentions DESC LIMIT 15")}
                  className="archive-query-example"
                >
                  <span>Top organizations</span>
                  <p>Most mentioned organizations</p>
                </button>
                <button
                  type="button"
                  onClick=${() => setCustomQuery("SELECT title, date, pub FROM records WHERE title LIKE '%Trump%' ORDER BY date DESC LIMIT 20")}
                  className="archive-query-example"
                >
                  <span>Articles about Trump</span>
                  <p>Search for specific topics</p>
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
