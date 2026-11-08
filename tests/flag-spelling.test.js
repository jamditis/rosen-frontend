/**
 * One spelling for the verified and needs_review flags (state machine map
 * follow-up 25).
 *
 * Writers used TRUE, true, Yes, false and Python booleans, and readers each
 * accepted a different subset: the exporter takes TRUE/true/Yes, the quality
 * evaluator and the ingestion receipt take only TRUE/FALSE. This validator
 * holds the canonical CSVs and the Python CSV writers to TRUE, FALSE, or an
 * empty cell (not yet decided).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FLAG_COLUMNS = ['verified', 'needs_review'];
const CANONICAL = new Set(['TRUE', 'FALSE', '']);

// Python files that set these keys on something other than a canonical CSV
// row. Each needs a reason.
const NOT_CSV_WRITERS = new Map([
  ['backend/scripts/rtn_backfill_scrape.py',
    'sets JSON booleans on an intermediate capture file; data/_add_pillar2_rtn_p1.py writes the CSV rows with TRUE'],
  ['backend/scripts/backfill/bulk_reprocessor.py',
    'legacy Google Sheets backfill; its cell typing is a Sheets decision, not a CSV write'],
]);

function readCsv(name) {
  return parse(fs.readFileSync(path.join(rootDir, 'data', name), 'utf-8'), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });
}

function pythonFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(rootDir, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['tests', '__pycache__', '.venv', 'node_modules'].includes(entry.name)) continue;
      out.push(...pythonFiles(rel));
    } else if (entry.name.endsWith('.py')) {
      out.push(rel);
    }
  }
  return out;
}

const LITERAL = String.raw`(True|False|"[^"\n]*"|'[^'\n]*')`;
const KEY = String.raw`["'](${FLAG_COLUMNS.join('|')})["']`;
const ASSIGNMENTS = [
  new RegExp(String.raw`${KEY}\s*\]\s*=\s*${LITERAL}`, 'g'),
  new RegExp(String.raw`${KEY}\s*:\s*${LITERAL}`, 'g'),
  new RegExp(String.raw`setdefault\(\s*${KEY}\s*,\s*${LITERAL}`, 'g'),
];

function literalValue(token) {
  if (token === 'True' || token === 'False') return token;
  return token.slice(1, -1);
}

describe('verified and needs_review spelling', () => {
  it('canonical CSVs use only TRUE, FALSE, or an empty cell', () => {
    const problems = [];
    for (const name of ['archive_records-public.csv', 'social_posts.csv']) {
      const rows = readCsv(name);
      for (const column of FLAG_COLUMNS) {
        if (!(column in (rows[0] ?? {}))) continue;
        const counts = new Map();
        for (const row of rows) {
          if (!CANONICAL.has(row[column])) counts.set(row[column], (counts.get(row[column]) ?? 0) + 1);
        }
        for (const [value, count] of counts) problems.push(`${name} ${column}=${JSON.stringify(value)} x${count}`);
      }
    }
    assert.deepEqual(problems, []);
  });

  it('archive records always carry an explicit verified decision', () => {
    const blank = readCsv('archive_records-public.csv').filter(row => row.verified === '').map(row => row.id);
    assert.deepEqual(blank, []);
  });

  it('Python CSV writers set the flags only to TRUE, FALSE, or empty', () => {
    const files = [
      ...pythonFiles('backend/scripts'),
      ...pythonFiles('backend/src'),
      ...pythonFiles('backend/submission_runtime'),
      'backend/integrate_clippings.py',
      ...fs.readdirSync(path.join(rootDir, 'data')).filter(name => name.endsWith('.py')).map(name => `data/${name}`),
      ...pythonFiles('data/fixes'),
    ].filter(file => !NOT_CSV_WRITERS.has(file));
    const problems = [];
    for (const file of files) {
      const source = fs.readFileSync(path.join(rootDir, file), 'utf-8');
      for (const pattern of ASSIGNMENTS) {
        for (const match of source.matchAll(pattern)) {
          const value = literalValue(match[2]);
          if (CANONICAL.has(value)) continue;
          const line = source.slice(0, match.index).split('\n').length;
          problems.push(`${file}:${line} sets ${match[1]} to ${match[2]}`);
        }
      }
    }
    assert.deepEqual(problems, []);
  });

  it('keeps the exclusion list honest', () => {
    for (const file of NOT_CSV_WRITERS.keys()) {
      assert.ok(fs.existsSync(path.join(rootDir, file)), `${file} no longer exists; drop it from the list`);
    }
  });
});
