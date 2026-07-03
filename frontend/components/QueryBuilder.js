/**
 * Query Builder Component
 *
 * A "mad libs" style interface that lets users construct database queries
 * using plain English sentences with dropdowns and text inputs.
 * Abstracts SQL syntax for non-technical users.
 */

import { useState, useEffect } from 'react';
import { html } from '../html.js?v=3.6.1';
import {
  Search,
  Play,
  RotateCcw,
  ChevronDown,
  Sparkles,
  HelpCircle,
  Loader2
} from 'lucide-react';
import { queryAsObjects, isSqliteReady, initSqlite } from '../services/archiveService.js?v=3.6.1';

// Query template definitions
const QUERY_TEMPLATES = [
  {
    id: 'count-by-field',
    name: 'Count Records',
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
    name: 'Search Titles',
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
      SELECT title, date, pub
      FROM records
      WHERE title LIKE '%${values.SEARCH_TERM.replace(/'/g, "''")}%'
      ORDER BY date DESC
      LIMIT ${values.LIMIT}
    `
  },
  {
    id: 'records-by-year',
    name: 'Records from Year',
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
      SELECT title, date, pub, type
      FROM records
      WHERE year = '${values.YEAR}'
      ORDER BY date DESC
      LIMIT ${values.LIMIT}
    `
  },
  {
    id: 'records-by-era',
    name: 'Records by Era',
    sentence: ['Show records from the', 'ERA', 'era, limited to', 'LIMIT', 'results'],
    fields: {
      ERA: {
        type: 'dropdown',
        options: [
          { label: 'Public Journalism (90s)', value: 'Public Journalism (90s)' },
          { label: 'Web & Blogging (00s)', value: 'Web & Blogging (00s)' },
          { label: 'View from Nowhere (10s)', value: 'View from Nowhere (10s)' },
          { label: 'Democracy in Crisis (20s)', value: 'Democracy in Crisis (20s)' }
        ],
        default: 'Democracy in Crisis (20s)'
      },
      LIMIT: {
        type: 'number',
        default: 25,
        min: 1,
        max: 200
      }
    },
    buildSql: (values) => `
      SELECT title, date, pub, year
      FROM records
      WHERE era = '${values.ERA}'
      ORDER BY date DESC
      LIMIT ${values.LIMIT}
    `
  },
  {
    id: 'top-categories',
    name: 'Top Categories',
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
    name: 'Records in Category',
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
      SELECT r.title, r.date, r.pub
      FROM records r
      JOIN record_categories rc ON r.id = rc.record_id
      WHERE rc.category LIKE '%${values.CATEGORY.replace(/'/g, "''")}%'
      ORDER BY r.date DESC
      LIMIT ${values.LIMIT}
    `
  },
  {
    id: 'top-publications',
    name: 'Top Publications',
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
    name: 'Most Mentioned People',
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
    name: 'Most Common Concepts',
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
    name: 'Records Mentioning Person',
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
      SELECT DISTINCT r.title, r.date, r.pub
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
    name: 'Yearly Output',
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
    name: 'Compare Eras',
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
          WHEN 'Public Journalism (90s)' THEN 1
          WHEN 'Web & Blogging (00s)' THEN 2
          WHEN 'View from Nowhere (10s)' THEN 3
          WHEN 'Democracy in Crisis (20s)' THEN 4
          ELSE 5
        END
    `
  },
  {
    id: 'category-cooccurrence',
    name: 'Related Categories',
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
const Dropdown = ({ options, value, onChange }) => {
  return html`
    <select
      value=${value}
      onChange=${(e) => onChange(e.target.value)}
      className="mx-1 px-3 py-1.5 bg-amber-100 border-2 border-amber-300 rounded-lg text-stone-800 font-bold text-sm cursor-pointer hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-400 appearance-none"
      style=${{ minWidth: '140px' }}
    >
      ${options.map(opt => html`
        <option key=${opt.value} value=${opt.value}>${opt.label}</option>
      `)}
    </select>
  `;
};

// Number input component
const NumberInput = ({ value, onChange, min, max }) => {
  return html`
    <input
      type="number"
      value=${value}
      onChange=${(e) => onChange(parseInt(e.target.value) || min)}
      min=${min}
      max=${max}
      className="mx-1 w-16 px-2 py-1.5 bg-sky-100 border-2 border-sky-300 rounded-lg text-stone-800 font-bold text-sm text-center focus:outline-none focus:ring-2 focus:ring-sky-400"
    />
  `;
};

// Text input component
const TextInput = ({ value, onChange, placeholder }) => {
  return html`
    <input
      type="text"
      value=${value}
      onChange=${(e) => onChange(e.target.value)}
      placeholder=${placeholder}
      className="mx-1 px-3 py-1.5 bg-green-100 border-2 border-green-300 rounded-lg text-stone-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
      style=${{ minWidth: '160px' }}
    />
  `;
};

// Query sentence renderer
const QuerySentence = ({ template, values, onChange }) => {
  return html`
    <div className="flex flex-wrap items-center gap-1 text-lg text-stone-700 leading-relaxed py-2">
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
              onChange=${(val) => onChange(part, val)}
            />`;
          } else if (field.type === 'number') {
            return html`<${NumberInput}
              key=${index}
              value=${currentValue}
              onChange=${(val) => onChange(part, val)}
              min=${field.min}
              max=${field.max}
            />`;
          } else if (field.type === 'text') {
            return html`<${TextInput}
              key=${index}
              value=${currentValue}
              onChange=${(val) => onChange(part, val)}
              placeholder=${field.placeholder}
            />`;
          }
        }
        // Regular text
        return html`<span key=${index} className="mx-0.5">${part}</span>`;
      })}
    </div>
  `;
};

// Results table component
const ResultsTable = ({ results }) => {
  if (!results || results.length === 0) {
    return html`<p className="text-stone-400 text-sm italic">No results found</p>`;
  }

  const columns = Object.keys(results[0]);

  return html`
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-stone-100">
            ${columns.map(col => html`
              <th key=${col} className="px-3 py-2 text-left text-xs font-bold text-stone-600 uppercase tracking-wider border-b border-stone-200">
                ${col.replace(/_/g, ' ')}
              </th>
            `)}
          </tr>
        </thead>
        <tbody>
          ${results.map((row, i) => html`
            <tr key=${i} className=${i % 2 === 0 ? 'bg-white' : 'bg-stone-50'}>
              ${columns.map(col => html`
                <td key=${col} className="px-3 py-2 text-stone-700 border-b border-stone-100 truncate" style=${{ maxWidth: '300px' }}>
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
const QueryBuilder = () => {
  const [selectedTemplateId, setSelectedTemplateId] = useState(QUERY_TEMPLATES[0].id);
  const [fieldValues, setFieldValues] = useState({});
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [showSql, setShowSql] = useState(false);
  const [resultCount, setResultCount] = useState(0);
  // SQLite loads on first query rather than on dashboard mount (issue #338).
  const [dbLoading, setDbLoading] = useState(false);

  const selectedTemplate = QUERY_TEMPLATES.find(t => t.id === selectedTemplateId);

  // Initialize field values when template changes
  useEffect(() => {
    if (selectedTemplate) {
      const defaults = {};
      Object.entries(selectedTemplate.fields).forEach(([key, field]) => {
        defaults[key] = field.default;
      });
      setFieldValues(defaults);
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

      const sql = selectedTemplate.buildSql(fieldValues);
      const queryResults = queryAsObjects(sql);
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
    const defaults = {};
    Object.entries(selectedTemplate.fields).forEach(([key, field]) => {
      defaults[key] = field.default;
    });
    setFieldValues(defaults);
    setResults(null);
    setError(null);
    setResultCount(0);
  };

  const currentSql = selectedTemplate ? selectedTemplate.buildSql(fieldValues) : '';

  return html`
    <div className="space-y-6">
      <!-- Template Selector -->
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-bold text-stone-500 uppercase tracking-wider">
          I want to:
        </label>
        <select
          value=${selectedTemplateId}
          onChange=${(e) => setSelectedTemplateId(e.target.value)}
          className="px-4 py-2 bg-white border-2 border-stone-300 rounded-lg text-stone-800 font-bold cursor-pointer hover:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400"
        >
          ${QUERY_TEMPLATES.map(template => html`
            <option key=${template.id} value=${template.id}>${template.name}</option>
          `)}
        </select>
      </div>

      <!-- Query Sentence Builder -->
      <div className="bg-gradient-to-r from-amber-50 to-sky-50 border-2 border-stone-200 rounded-xl p-6">
        <div className="flex items-start gap-2 mb-4">
          <${Sparkles} className="w-5 h-5 text-amber-500 mt-1 flex-shrink-0" />
          <p className="text-xs text-stone-500">
            Complete the sentence below by choosing options or entering values.
            Colored fields are interactive!
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
        <div className="flex flex-wrap items-center gap-3 mt-6 pt-4 border-t border-stone-200">
          <button
            onClick=${runQuery}
            disabled=${dbLoading}
            className="flex items-center gap-2 px-5 py-2.5 bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors font-bold disabled:opacity-60"
          >
            ${dbLoading
              ? html`<${Loader2} className="w-4 h-4 animate-spin" /> Loading database...`
              : html`<${Play} className="w-4 h-4" /> Run Query`}
          </button>
          <button
            onClick=${resetQuery}
            className="flex items-center gap-2 px-4 py-2.5 bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200 transition-colors font-medium"
          >
            <${RotateCcw} className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick=${() => setShowSql(!showSql)}
            className="flex items-center gap-2 px-4 py-2.5 text-stone-500 hover:text-stone-700 transition-colors font-medium text-sm"
          >
            <${HelpCircle} className="w-4 h-4" />
            ${showSql ? 'Hide' : 'Show'} SQL
          </button>
        </div>

        <!-- SQL Preview (collapsible) -->
        ${showSql && html`
          <div className="mt-4 p-3 bg-stone-800 rounded-lg overflow-x-auto">
            <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">${currentSql.trim()}</pre>
          </div>
        `}
      </div>

      <!-- Results -->
      ${error && html`
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 text-sm font-medium">Error: ${error}</p>
        </div>
      `}

      ${results && html`
        <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
            <h4 className="font-bold text-stone-700">Results</h4>
            <span className="text-xs text-stone-500">${resultCount} ${resultCount === 1 ? 'row' : 'rows'} returned</span>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <${ResultsTable} results=${results} />
          </div>
        </div>
      `}

      <!-- Color Legend -->
      <div className="flex flex-wrap gap-4 text-xs text-stone-500">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-amber-100 border-2 border-amber-300 rounded"></div>
          <span>Dropdown choice</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-sky-100 border-2 border-sky-300 rounded"></div>
          <span>Number</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-100 border-2 border-green-300 rounded"></div>
          <span>Text search</span>
        </div>
      </div>
    </div>
  `;
};

export default QueryBuilder;
