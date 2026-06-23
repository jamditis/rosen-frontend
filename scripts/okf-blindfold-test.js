#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  LINK_RE,
  parseFrontmatter,
  resolveMarkdownTarget,
  stripFencedCodeBlocks,
  walkMarkdownFiles
} from './validate-okf.js';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCENARIOS_JSON = 'wiki/meta/blindfold-scenarios.json';
const REPORT_MD = 'wiki/meta/blindfold-test.md';
const GENERATED_FROM = 'scripts/okf-blindfold-test.js';

function relPath(rootDir, filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function parseIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function findAsOfDate(markdownFiles) {
  let maxDate = null;
  for (const file of markdownFiles) {
    const { frontmatter } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
    if (!frontmatter) continue;
    for (const key of ['verified', 'timestamp']) {
      const date = parseIsoDate(frontmatter[key]);
      if (date && (!maxDate || date > maxDate)) maxDate = date;
    }
  }
  return maxDate ? maxDate.toISOString().slice(0, 10) : '1970-01-01';
}

function buildWikiGraph({ rootDir, bundleDir }) {
  const markdownFiles = walkMarkdownFiles(bundleDir);
  const markdownSet = new Set(markdownFiles.map(file => relPath(rootDir, file)));
  const graph = new Map();

  for (const file of markdownFiles) {
    const sourceRel = relPath(rootDir, file);
    const text = stripFencedCodeBlocks(fs.readFileSync(file, 'utf8'));
    const targets = new Set();

    for (const match of text.matchAll(LINK_RE)) {
      const resolved = resolveMarkdownTarget(file, match[1].trim());
      if (!resolved) continue;
      const targetRel = relPath(rootDir, resolved);
      if (markdownSet.has(targetRel) && targetRel.startsWith('wiki/')) {
        targets.add(targetRel);
      }
    }

    graph.set(sourceRel, [...targets].sort());
  }

  return { graph, markdownFiles, markdownSet };
}

function reachableFrom(graph, start) {
  const seen = new Set();
  const queue = [start];

  while (queue.length) {
    const current = queue.shift();
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of graph.get(current) || []) {
      if (!seen.has(next)) queue.push(next);
    }
  }

  return seen;
}

export function loadBlindfoldScenarios({ rootDir = DEFAULT_ROOT } = {}) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, SCENARIOS_JSON), 'utf8'));
}

function findMissingTerms(rootDir, scenario) {
  const corpus = scenario.expectedWikiFiles
    .map(file => fs.readFileSync(path.join(rootDir, file), 'utf8'))
    .join('\n')
    .toLowerCase();

  return scenario.requiredTerms.filter(term => !corpus.includes(term.toLowerCase()));
}

export function runBlindfoldScenarios({
  rootDir = DEFAULT_ROOT,
  bundleDir = path.join(rootDir, 'wiki'),
  scenarios = loadBlindfoldScenarios({ rootDir })
} = {}) {
  const { graph, markdownFiles, markdownSet } = buildWikiGraph({ rootDir, bundleDir });
  const reachable = reachableFrom(graph, 'wiki/index.md');
  const asOfDate = findAsOfDate(markdownFiles);
  const results = scenarios.map(scenario => {
    const missingFiles = scenario.expectedWikiFiles.filter(file => !markdownSet.has(file));
    const unreachableFiles = scenario.expectedWikiFiles.filter(file => markdownSet.has(file) && !reachable.has(file));
    const missingTerms = missingFiles.length ? scenario.requiredTerms : findMissingTerms(rootDir, scenario);

    return {
      id: scenario.id,
      prompt: scenario.prompt,
      expectedWikiFiles: scenario.expectedWikiFiles,
      requiredTerms: scenario.requiredTerms,
      rubric: scenario.rubric,
      missingFiles,
      unreachableFiles,
      missingTerms,
      ok: missingFiles.length === 0 && unreachableFiles.length === 0 && missingTerms.length === 0
    };
  });

  return {
    schemaVersion: 1,
    generatedFrom: GENERATED_FROM,
    asOfDate,
    startFile: 'wiki/index.md',
    reachableFiles: reachable.size,
    scenarios: results,
    ok: results.every(result => result.ok)
  };
}

function markdownLink(file) {
  const relative = path.posix.relative('wiki/meta', file);
  return `[${file.replace(/^wiki\//, '')}](${relative})`;
}

function formatScenario(result) {
  const files = result.expectedWikiFiles.map(markdownLink).join(', ');
  const terms = result.requiredTerms.map(term => `\`${term}\``).join(', ');
  const status = result.ok ? 'pass' : 'fail';
  const failures = [
    ...result.missingFiles.map(file => `missing file ${file}`),
    ...result.unreachableFiles.map(file => `unreachable file ${file}`),
    ...result.missingTerms.map(term => `missing term ${term}`)
  ];

  return `### ${result.id}

**Prompt:** ${result.prompt}

**Status:** ${status}

**Expected files:** ${files}

**Required terms:** ${terms}

**Rubric:** ${result.rubric}

${failures.length ? `**Failures:** ${failures.join('; ')}` : '**Failures:** none'}
`;
}

export function formatBlindfoldReport(report) {
  const failed = report.scenarios.filter(scenario => !scenario.ok);

  return `---
type: test
title: OKF blindfold test
description: Scenario-based navigation test for whether a new contributor can answer project questions starting only from the OKF root index.
source: ["${GENERATED_FROM}", "${SCENARIOS_JSON}"]
verified: ${report.asOfDate}
tags: [okf, test, navigation, onboarding]
timestamp: ${report.asOfDate}
---

# OKF blindfold test

The blindfold test treats [\`wiki/index.md\`](../index.md) as the only starting point. Each scenario asks a realistic contributor or agent question, then checks that the answer path is reachable and contains the terms a correct answer should surface.

Run:

\`\`\`bash
npm run okf:blindfold
\`\`\`

## Current result

| Metric | Value |
| --- | ---: |
| Scenarios | ${report.scenarios.length} |
| Passing scenarios | ${report.scenarios.filter(scenario => scenario.ok).length} |
| Reachable wiki markdown files | ${report.reachableFiles} |
| Failed scenarios | ${failed.length} |

## Scenarios

${report.scenarios.map(formatScenario).join('\n')}
## Maintenance rule

Add a scenario when a maintainer notices a project question that took too long to answer. The question should name expected wiki files and a few required terms, not a canned answer.
`;
}

export function writeBlindfoldReport({ rootDir = DEFAULT_ROOT, bundleDir = path.join(rootDir, 'wiki') } = {}) {
  const report = runBlindfoldScenarios({ rootDir, bundleDir });
  fs.writeFileSync(path.join(rootDir, REPORT_MD), formatBlindfoldReport(report));
  return report;
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const report = writeBlindfoldReport();
  console.log(`OKF blindfold test: ${report.scenarios.filter(scenario => scenario.ok).length}/${report.scenarios.length} scenarios passing from ${report.startFile}`);
  if (!report.ok) process.exitCode = 1;
}
