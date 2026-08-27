#!/usr/bin/env node
// Compare one audit run against the recorded layout-shift baseline and print
// the difference as a table.
//
// The preview audit writes layout-shift-baseline.json for every run: the
// largest hydration and settled value each route reached across the viewports
// in that run. This script reads those files, lines them up against
// LAYOUT_SHIFT_BASELINE in scripts/layout-shift-budgets.js, and reports the
// movement per route.
//
// It is what makes a CI run readable: the audit says pass or fail against the
// budget, and this says how far each route moved since the seeding run.
//
// Usage:
//   node scripts/layout-shift-delta.js [candidate.json ...]
//
// With no arguments it reads preview-audit-results/layout-shift-baseline.json
// plus every preview-audit-results/shards/<viewport>/layout-shift-baseline.json,
// keeping the largest value per route. In GitHub Actions it also appends the
// table to the job summary.

import { readFile, appendFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAYOUT_SHIFT_BASELINE,
  LAYOUT_SHIFT_BASELINE_RUN,
  BUDGET_TOLERANCE,
  resolveLayoutShiftBudget,
} from './layout-shift-budgets.js';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const RESULTS_DIR = resolve(REPO_ROOT, 'preview-audit-results');

// A route's URL decides its class, and the audit script is where the URLs
// live. Reading them keeps one source of truth for the route table.
async function readRouteUrls() {
  const source = await readFile(resolve(REPO_ROOT, 'scripts', 'preview-audit.js'), 'utf8');
  const urls = {};
  for (const match of source.matchAll(/slug: '([^']+)',\s*\n?\s*url: '([^']+)'/g)) {
    urls[match[1]] = match[2];
  }
  return urls;
}

export function defaultCandidatePaths() {
  const paths = [];
  const root = resolve(RESULTS_DIR, 'layout-shift-baseline.json');
  if (existsSync(root)) paths.push(root);
  const shards = resolve(RESULTS_DIR, 'shards');
  if (existsSync(shards)) {
    for (const entry of readdirSync(shards)) {
      const shard = resolve(shards, entry, 'layout-shift-baseline.json');
      if (existsSync(shard)) paths.push(shard);
    }
  }
  return paths;
}

// One run can arrive as several files, one per viewport shard. A route's value
// is the worst any viewport reported, which is what the budget gates on.
export function mergeCandidates(files) {
  const merged = {};
  for (const file of files) {
    for (const [slug, value] of Object.entries(file || {})) {
      const current = merged[slug] || { hydration: 0, settled: 0 };
      merged[slug] = {
        hydration: Math.max(current.hydration, Number(value?.hydration) || 0),
        settled: Math.max(current.settled, Number(value?.settled) || 0),
      };
    }
  }
  return merged;
}

const round = (value) => Number(value.toFixed(4));
const signed = (value) => (value > 0 ? `+${round(value)}` : String(round(value)));

export function buildDeltaRows(candidate, routeUrls) {
  const slugs = [...new Set([...Object.keys(candidate), ...Object.keys(LAYOUT_SHIFT_BASELINE)])].sort();
  return slugs.map((slug) => {
    const measured = candidate[slug] || null;
    const baseline = LAYOUT_SHIFT_BASELINE[slug] || null;
    const budget = resolveLayoutShiftBudget({ slug, url: routeUrls[slug] || '/' });
    const phases = ['hydration', 'settled'].map((phase) => {
      const now = measured ? measured[phase] : null;
      const then = baseline ? baseline[phase] : null;
      return {
        phase,
        measured: now,
        baseline: then,
        delta: now === null || then === null ? null : round(now - then),
        overBudget: now !== null && now > budget[phase] + BUDGET_TOLERANCE,
      };
    });
    return {
      slug,
      routeClass: budget.routeClass,
      budget: { hydration: budget.hydration, settled: budget.settled },
      phases,
      missing: measured === null,
      unseeded: baseline === null,
    };
  });
}

const cell = (entry) => {
  if (entry.measured === null) return 'not measured';
  const value = round(entry.measured);
  const flag = entry.overBudget ? ' **over budget**' : '';
  if (entry.baseline === null) return `${value} (no baseline)${flag}`;
  return `${value} (${signed(entry.delta)})${flag}`;
};

export function renderMarkdown(rows) {
  const lines = [
    '## Layout shift: candidate against baseline',
    '',
    Object.keys(LAYOUT_SHIFT_BASELINE).length === 0
      ? 'No baseline is recorded yet, so this run reports measured values only.'
      : `Baseline: seeding run ${LAYOUT_SHIFT_BASELINE_RUN}. Values are the worst viewport per route.`,
    '',
    '| Route | Class | Hydration | Settled | Budget |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const row of rows) {
    const [hydration, settled] = row.phases;
    lines.push(
      `| \`${row.slug}\` | ${row.routeClass} | ${cell(hydration)} | ${cell(settled)} `
      + `| ${row.budget.hydration} / ${row.budget.settled} |`,
    );
  }
  const overBudget = rows.filter((row) => row.phases.some((phase) => phase.overBudget));
  lines.push('');
  lines.push(overBudget.length === 0
    ? 'Every measured route is inside its budget.'
    : `Routes over budget: ${overBudget.map((row) => row.slug).join(', ')}.`);
  return `${lines.join('\n')}\n`;
}

async function main() {
  const explicit = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  const paths = explicit.length > 0 ? explicit.map((path) => resolve(path)) : defaultCandidatePaths();
  if (paths.length === 0) {
    throw new Error(
      'No candidate file found. Run the audit first, or pass a layout-shift-baseline.json path.',
    );
  }
  const files = [];
  for (const path of paths) files.push(JSON.parse(await readFile(path, 'utf8')));
  const markdown = renderMarkdown(buildDeltaRows(mergeCandidates(files), await readRouteUrls()));
  process.stdout.write(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
