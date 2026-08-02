/**
 * Query Builder Component
 *
 * A "mad libs" style interface that lets users construct database queries
 * using plain English sentences with dropdowns and text inputs.
 * Abstracts SQL syntax for non-technical users.
 */

import { useState, useEffect } from 'react';
import { html } from '../html.js?v=3.8.10';
import {
  Play,
  RotateCcw,
  Sparkles,
  HelpCircle,
  Loader2
} from 'lucide-react';
import { queryAsObjects, isSqliteReady, initSqlite } from '../services/archiveService.js?v=3.8.10';
import { ERAS } from '../constants.js?v=3.8.10';
import {
  extractRecordIds,
  templateIsComposable,
  resolveFieldValues,
} from '../services/queryComposition.js?v=3.8.10';

const eraOrderCase = ERAS
  .map((era, index) => `WHEN '${era.replace(/'/g, "''")}' THEN ${index + 1}`)
  .join('\n          ');

// Query template definitions
const QUERY_TEMPLATES = [
  {
    id: 'count-by-field',
    composable: false,
    name: 'Count records',
    sentence: ['Count all records grouped by', 'FIELD', 'showing the top', 'LIMIT', 'results'],
    fields: {
      FIELD: {
        type: 'dropdown',
        options: [
          { label: 'year', value: 'year' },
          { label: 'era', value: 'era' },
          { label: 'publication', value: 'pub' },
          { label: 'type (article/social)', value: 'type' }
        ],
        default: 'year'
      },
      LIMIT: {
        type: 'number',
        default: 10,
        min: 1,
        max: 100
      }
    },
    buildSql: (values) => `
      SELECT ${values.FIELD}, COUNT(*) as count
      FROM records
      WHERE ${values.FIELD} != ''
      GROUP BY ${values.FIELD}
      ORDER BY count DESC
      LIMIT ${values.LIMIT}
    `
  },
  {
    id: 'search-titles',
    composable: true,
    name: 'Search titles',
    sentence: ['Find records where the title contains', 'SEARCH_TERM', 'limited to', 'LIMIT', 'results'],
    fields: {
      SEARCH_TERM: {
        type: 'text',
        placeholder: 'enter search term...',
        default: ''
      },
      LIMIT: {
        type: 'number',
        default: 20,
        min: 1,
        max: 100
      }
    },
    buildSql: (values) => `
      SELECT id, title, date, pub
      FROM records
      WHERE title LIKE '%${values.SEARCH_TERM.replace(/'/g, "''")}%'
      ORDER BY date DESC
      LIMIT ${values.LIMIT}
    `
  },
  {
    id: 'records-by-year',
    composable: true,
    name: 'Records from year',
    sentence: ['Show me all records from the year', 'YEAR', 'limited to', 'LIMIT', 'results'],
    fields: {
      YEAR: {
        type: 'dropdown',
        options: Array.from({ length: 40 }, (_, i) => {
          const year = 2025 - i;
          return { label: String(year), value: String(year) };
        }),
        default: '2024'
      },
      LIMIT: {
        type: 'number',
        default: 25,
        min: 1,
        max: 200
      }
    },
    buildSql: (values) => `
      SELECT id, title, date, pub, type
      FROM records
      WHERE year = '${values.YEAR}'
      ORDER BY date DESC
      LIMIT ${values.LIMIT}
    `
  },
  {
    id: 'records-by-era',
    composable: true,
    name: 'Records by era',
    sentence: ['Show records from the', 'ERA', 'era, limited to', 'LIMIT', 'results'],
    fields: {
      ERA: {
        type: 'dropdown',
        options: ERAS.map(era => ({ label: era, value: era })),
        default: ERAS[ERAS.length - 1]
      },
      LIMIT: {
        type: 'number',
        default: 25,
        min: 1,
        max: 200
      }
    },
    buildSql: (values) => `
      SELECT id, title, date, pub, year
      FROM records
      WHERE era = '${values.ERA}'
      ORDER BY date DESC
      LIMIT ${values.LIMIT}
    `
  },
  {
    id: 'top-categories',
    composable: false,
    name: 'Top categories',
    sentence: ['Show the top', 'LIMIT', 'categories by number of records'],
    fields: {
      LIMIT: {
        type: 'number',
        default: 15,
        min: 1,
        max: 50
      }
    },
    buildSql: (values) => `
      SELECT category, COUNT(*) as record_count
      FROM record_categories
      GROUP BY category
      ORDER BY record_count DESC
      LIMIT ${values.LIMIT}
    `
  },
  {
    id: 'records-by-category',
    composable: true,
    name: 'Records in category',
    sentence: ['Find records in the', 'CATEGORY', 'category, showing', 'LIMIT', 'results'],
    fields: {
      CATEGORY: {
        type: 'text',
        placeholder: 'enter category name...',
        default: 'Press criticism'
      },
      LIMIT: {
        type: 'number',
        default: 20,
        min: 1,
        max: 100
      }
    },
    buildSql: (values) => `
      SELECT DISTINCT r.id, r.title, r.date, r.pub
      FROM records r
      JOIN record_categories rc ON r.id = rc.record_id
      WHERE rc.category LIKE '%${values.CATEGORY.replace(/'/g, "''")}%'
      ORDER BY r.date DESC
      LIMIT ${values.LIMIT}
    `
  },
  {
    id: 'top-publications',
    composable: false,
    name: 'Top publications',
    sentence: ['Show the top', 'LIMIT', 'publications Jay has written for'],
    fields: {
      LIMIT: {
        type: 'number',
        default: 15,
        min: 1,
        max: 50
      }
    },
    buildSql: (values) => `
      SELECT pub as publication, COUNT(*) as articles
      FROM records
      WHERE pub != ''
      GROUP BY pub
      ORDER BY articles DESC
      LIMIT ${values.LIMIT}
    `
  },
  {
    id: 'top-people',
    composable: false,
    name: 'Most mentioned people',
    sentence: ['Show the top', 'LIMIT', 'most frequently mentioned people'],
    fields: {
      LIMIT: {
        type: 'number',
        default: 15,
        min: 1,
        max: 50
      }
    },
    buildSql: (values) => `
      SELECT e.name, COUNT(re.record_id) as mentions
      FROM entities e
      JOIN record_entities re ON e.id = re.entity_id
      WHERE e.type = 'Person'
      GROUP BY e.id
      ORDER BY mentions DESC
      LIMIT ${values.LIMIT}
    `
  },
  {
    id: 'top-concepts',
    composable: false,
    name: 'Most common concepts',
    sentence: ['Show the top', 'LIMIT', 'most frequently discussed concepts'],
    fields: {
      LIMIT: {
        type: 'number',
        default: 15,
        min: 1,
        max: 50
      }
    },
    buildSql: (values) => `
      SELECT concept, COUNT(*) as occurrences
      FROM record_concepts
      GROUP BY concept
      ORDER BY occurrences DESC
      LIMIT ${values.LIMIT}
    `
  },
  {
    id: 'records-mentioning-person',
    composable: true,
    name: 'Records mentioning person',
    sentence: ['Find records that mention', 'PERSON_NAME', 'limited to', 'LIMIT', 'results'],
    fields: {
      PERSON_NAME: {
        type: 'text',
        placeholder: 'enter person name...',
        default: 'Trump'
      },
      LIMIT: {
        type: 'number',
        default: 20,
        min: 1,
        max: 100
      }
    },
    buildSql: (values) => `
      SELECT DISTINCT r.id, r.title, r.date, r.pub
      FROM records r
      JOIN record_entities re ON r.id = re.record_id
      JOIN entities e ON re.entity_id = e.id
      WHERE e.name LIKE '%${values.PERSON_NAME.replace(/'/g, "''")}%'
      ORDER BY r.date DESC
      LIMIT ${values.LIMIT}
    `
  },
  {
    id: 'yearly-output',
    composable: false,
    name: 'Yearly output',
    sentence: ['Show how many', 'TYPE', 'Jay produced each year'],
    fields: {
      TYPE: {
        type: 'dropdown',
        options: [
          { label: 'total records', value: 'all' },
          { label: 'articles', value: 'article' },
          { label: 'social posts', value: 'social' },
          { label: 'videos', value: 'video' }
        ],
        default: 'all'
      }
    },
    buildSql: (values) => {
      const whereClause = values.TYPE === 'all' ? '' : `AND type = '${values.TYPE}'`;
      return `
        SELECT year, COUNT(*) as count
        FROM records
        WHERE year != '' ${whereClause}
        GROUP BY year
        ORDER BY year
      `;
    }
  },
  {
    id: 'compare-eras',
    composable: false,
    name: 'Compare eras',
    sentence: ['Compare the number of records across all eras'],
    fields: {},
    buildSql: () => `
      SELECT
        era,
        COUNT(*) as total_records,
        COUNT(DISTINCT pub) as unique_publications
      FROM records
      WHERE era != ''
      GROUP BY era
      ORDER BY
        CASE era
          ${eraOrderCase}
          ELSE ${ERAS.length + 1}
        END,
        era
    `
  },
  {
    id: 'category-cooccurrence',
    composable: false,
    name: 'Related categories',
    sentence: ['Show categories that often appear together, top', 'LIMIT', 'pairs'],
    fields: {
      LIMIT: {
        type: 'number',
        default: 10,
        min: 1,
        max: 30
      }
    },
    buildSql: (values) => `
      SELECT
        rc1.category as category_1,
        rc2.category as category_2,
        COUNT(*) as times_together
      FROM record_categories rc1
      JOIN record_categories rc2 ON rc1.record_id = rc2.record_id
      WHERE rc1.category < rc2.category
      GROUP BY rc1.category, rc2.category
      ORDER BY times_together DESC
      LIMIT ${values.LIMIT}
    `
  }
];

// Dropdown component
const Dropdown = ({ options, value, onChange, label }) => {
  return html`
    <select
      aria-label=${label}
      value=${value}
      onChange=${(e) => onChange(e.target.value)}
      className="archive-query-field archive-query-field--dropdown"
      style=${{ minWidth: '140px' }}
    >
      ${options.map(opt => html`
        <option key=${opt.value} value=${opt.value}>${opt.label}</option>
      `)}
    </select>
  `;
};

// Number input component
const NumberInput = ({ value, onChange, min, max, label }) => {
  return html`
    <input
      aria-label=${label}
      type="number"
      value=${value}
      onChange=${(e) => onChange(parseInt(e.target.value) || min)}
      min=${min}
      max=${max}
      className="archive-query-field archive-query-field--number"
    />
  `;
};

// Text input component
const TextInput = ({ value, onChange, placeholder, label }) => {
  return html`
    <input
      aria-label=${label}
      type="text"
      value=${value}
      onChange=${(e) => onChange(e.target.value)}
      placeholder=${placeholder}
      className="archive-query-field archive-query-field--text"
      style=${{ minWidth: '160px' }}
    />
  `;
};

// Query sentence renderer
const QuerySentence = ({ template, values, onChange }) => {
  const fieldLabels = {
    FIELD: 'Group records by',
    LIMIT: 'Result limit',
    SEARCH_TERM: 'Title search term',
    YEAR: 'Year',
    ERA: 'Era',
    CATEGORY: 'Category',
    PERSON_NAME: 'Person name',
    TYPE: 'Record type',
  };

  return html`
    <div className="archive-query-sentence__line">
      ${template.sentence.map((part, index) => {
        // Check if this part is a field placeholder
        if (template.fields[part]) {
          const field = template.fields[part];
          const currentValue = values[part] ?? field.default;

          if (field.type === 'dropdown') {
            return html`<${Dropdown}
              key=${index}
              options=${field.options}
              value=${currentValue}
              label=${fieldLabels[part] || part}
              onChange=${(val) => onChange(part, val)}
            />`;
          } else if (field.type === 'number') {
            return html`<${NumberInput}
              key=${index}
              value=${currentValue}
              onChange=${(val) => onChange(part, val)}
              min=${field.min}
              max=${field.max}
              label=${fieldLabels[part] || part}
            />`;
          } else if (field.type === 'text') {
            return html`<${TextInput}
              key=${index}
              value=${currentValue}
              onChange=${(val) => onChange(part, val)}
              placeholder=${field.placeholder}
              label=${fieldLabels[part] || part}
            />`;
          }
        }
        // Regular text
        return html`<span key=${index}>${part}</span>`;
      })}
    </div>
  `;
};

// Results table component
const ResultsTable = ({ results }) => {
  if (!results || results.length === 0) {
    return html`<p className="archive-query-empty">No results found</p>`;
  }

  const columns = Object.keys(results[0]);

  return html`
    <div className="archive-data-scroll" role="region" tabIndex="0" aria-label="Query results">
      <table className="archive-data-table">
        <thead>
          <tr>
            ${columns.map(col => html`
              <th key=${col} scope="col">
                ${col.replace(/_/g, ' ')}
              </th>
            `)}
          </tr>
        </thead>
        <tbody>
          ${results.map((row, i) => html`
            <tr key=${i}>
              ${columns.map(col => html`
                <td key=${col}>
                  ${row[col] ?? '—'}
                </td>
              `)}
            </tr>
          `)}
        </tbody>
      </table>
    </div>
  `;
};

// Main QueryBuilder component
const QueryBuilder = ({ onRecordResults }) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState(QUERY_TEMPLATES[0].id);
  const [fieldValues, setFieldValues] = useState({});
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [showSql, setShowSql] = useState(false);
  const [resultCount, setResultCount] = useState(0);
  // SQLite loads on first query rather than on dashboard mount (issue #338).
  const [dbLoading, setDbLoading] = useState(false);

  const selectedTemplate = QUERY_TEMPLATES.find(t => t.id === selectedTemplateId);

  // Initialize field values when the template changes. resolveFieldValues with an
  // empty source yields each declared field's default, the same resolution the two
  // buildSql sites use, so init, reset, and build never drift from one definition.
  useEffect(() => {
    if (selectedTemplate) {
      setFieldValues(resolveFieldValues(selectedTemplate, {}));
      setResults(null);
      setError(null);
    }
  }, [selectedTemplateId]);

  const handleFieldChange = (fieldName, value) => {
    setFieldValues(prev => ({ ...prev, [fieldName]: value }));
  };

  const runQuery = async () => {
    try {
      // Load SQLite on demand. The dashboard no longer initializes it on mount,
      // so the first query in either query surface pays the one-time load.
      if (!isSqliteReady()) {
        setDbLoading(true);
        const ready = await initSqlite();
        setDbLoading(false);
        if (!ready) {
          setError('Could not load the query database. Please try again.');
          setResults(null);
          setResultCount(0);
          return;
        }
      }

      const sql = selectedTemplate.buildSql(resolveFieldValues(selectedTemplate, fieldValues));
      const queryResults = queryAsObjects(sql);

      if (templateIsComposable(selectedTemplate)) {
        setResults(null);
        setResultCount(queryResults.length);
        setError(null);
        onRecordResults(extractRecordIds(queryResults));
        return;
      }

      setResults(queryResults);
      setResultCount(queryResults.length);
      setError(null);
    } catch (err) {
      setDbLoading(false);
      setError(err.message);
      setResults(null);
      setResultCount(0);
    }
  };

  const resetQuery = () => {
    setFieldValues(resolveFieldValues(selectedTemplate, {}));
    setResults(null);
    setError(null);
    setResultCount(0);
  };

  const currentSql = selectedTemplate ? selectedTemplate.buildSql(resolveFieldValues(selectedTemplate, fieldValues)) : '';

  return html`
    <div className="archive-query-builder">
      <!-- Template Selector -->
      <div className="archive-query-template">
        <label htmlFor="query-template">
          I want to:
        </label>
        <select
          id="query-template"
          value=${selectedTemplateId}
          onChange=${(e) => setSelectedTemplateId(e.target.value)}
          className="archive-control"
        >
          ${QUERY_TEMPLATES.map(template => html`
            <option key=${template.id} value=${template.id}>${template.name}</option>
          `)}
        </select>
      </div>

      <!-- Query Sentence Builder -->
      <div className="archive-query-sentence">
        <div className="archive-query-sentence__instruction">
          <${Sparkles} aria-hidden="true" />
          <p>
            Complete the sentence below by choosing options or entering values.
            Ruled fields are interactive.
          </p>
        </div>

        ${selectedTemplate && html`
          <${QuerySentence}
            template=${selectedTemplate}
            values=${fieldValues}
            onChange=${handleFieldChange}
          />
        `}

        <!-- Action Buttons -->
        <div className="archive-query-actions">
          <button
            type="button"
            onClick=${runQuery}
            disabled=${dbLoading}
            className="archive-action archive-action--primary"
          >
            ${dbLoading
              ? html`<${Loader2} className="w-4 h-4 animate-spin" /> Loading database...`
              : html`<${Play} className="w-4 h-4" /> Run query`}
          </button>
          <button
            type="button"
            onClick=${resetQuery}
            className="archive-action archive-action--secondary"
          >
            <${RotateCcw} className="w-4 h-4" />
            Reset
          </button>
          <button
            type="button"
            onClick=${() => setShowSql(!showSql)}
            className="archive-action archive-action--quiet"
          >
            <${HelpCircle} className="w-4 h-4" />
            ${showSql ? 'Hide' : 'Show'} SQL
          </button>
        </div>

        <!-- SQL Preview (collapsible) -->
        ${showSql && html`
          <div className="archive-query-sql-preview archive-data-scroll" role="region" tabIndex="0" aria-label="Generated SQL">
            <pre>${currentSql.trim()}</pre>
          </div>
        `}
      </div>

      <!-- Results -->
      ${error && html`
        <div className="archive-notice archive-notice--danger archive-query-error" role="alert">
          <p><strong>Error:</strong> ${error}</p>
        </div>
      `}

      ${results && html`
        <div className="archive-data-panel archive-query-results">
          <div className="archive-query-results__header">
            <h4>Results</h4>
            <span>${resultCount} ${resultCount === 1 ? 'row' : 'rows'} returned</span>
          </div>
          <div className="archive-query-results__table">
            <${ResultsTable} results=${results} />
          </div>
        </div>
      `}

      <!-- Color Legend -->
      <div className="archive-query-legend" aria-label="Query field legend">
        <div>
          <span className="archive-query-legend__swatch archive-query-legend__swatch--dropdown" aria-hidden="true"></span>
          <span>Dropdown choice</span>
        </div>
        <div>
          <span className="archive-query-legend__swatch archive-query-legend__swatch--number" aria-hidden="true"></span>
          <span>Number</span>
        </div>
        <div>
          <span className="archive-query-legend__swatch archive-query-legend__swatch--text" aria-hidden="true"></span>
          <span>Text search</span>
        </div>
      </div>
    </div>
  `;
};

export default QueryBuilder;
