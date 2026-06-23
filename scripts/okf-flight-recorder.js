#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  LINK_RE,
  RESERVED_FILENAMES,
  parseFrontmatter,
  resolveMarkdownTarget,
  stripFencedCodeBlocks,
  walkMarkdownFiles
} from './validate-okf.js';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED_FROM = 'scripts/okf-flight-recorder.js';
const INVENTORY_JSON = 'wiki/meta/bundle-inventory.json';
const INVENTORY_MD = 'wiki/meta/bundle-inventory.md';
const GENERATED_MARKDOWN_PATHS = new Set([INVENTORY_MD, 'wiki/meta/blindfold-test.md']);
const GRAPH_POLICY = {
  defaultView: 'local',
  defaultHops: 1,
  maxDefaultHops: 2,
  globalView: 'filterable opt-in',
  labelPolicy: 'show labels by zoom level and node degree'
};
const HIGH_DRIFT_TERMS = [
  'automation',
  'blocker',
  'cache',
  'ci',
  'cloudflare',
  'credential',
  'deploy',
  'dns',
  'github-actions',
  'hosting',
  'launch',
  'security',
  'sftp',
  'submission',
  'testing',
  'versioning'
];
const MEDIUM_DRIFT_TERMS = [
  'community',
  'data',
  'decisions',
  'public',
  'provenance',
  'source',
  'verification',
  'workflow'
];

function relPath(rootDir, filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function stableObject(input) {
  return Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)));
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return stableObject(counts);
}

function parseIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function diffDays(later, earlier) {
  return Math.floor((later.getTime() - earlier.getTime()) / 86400000);
}

function findAsOfDate(files) {
  let maxDate = null;

  for (const file of files) {
    const { frontmatter } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
    if (!frontmatter) continue;
    for (const key of ['verified', 'timestamp']) {
      const date = parseIsoDate(frontmatter[key]);
      if (date && (!maxDate || date > maxDate)) maxDate = date;
    }
  }

  return maxDate ? maxDate.toISOString().slice(0, 10) : '1970-01-01';
}

function extractLinks({ rootDir, filePath, conceptSet }) {
  const text = stripFencedCodeBlocks(fs.readFileSync(filePath, 'utf8'));
  const links = [];

  for (const match of text.matchAll(LINK_RE)) {
    const href = match[1].trim();
    const resolved = resolveMarkdownTarget(filePath, href);
    if (!resolved) {
      links.push({ href, kind: 'external' });
      continue;
    }

    const resolvedRel = relPath(rootDir, resolved);
    links.push({
      href,
      kind: resolvedRel.startsWith('wiki/') ? 'wiki' : 'repo',
      path: resolvedRel,
      concept: conceptSet.has(resolvedRel)
    });
  }

  return links;
}

function includesAnyTerm(text, terms) {
  const haystack = text.toLowerCase();
  return terms.filter(term => haystack.includes(term));
}

function classifyDriftRisk({ concept, asOfDate }) {
  const reasons = [];
  const asOf = parseIsoDate(asOfDate);
  const verified = parseIsoDate(concept.verified);
  const verifiedAgeDays = asOf && verified ? diffDays(asOf, verified) : null;
  const driftText = [
    concept.path,
    concept.type,
    concept.title,
    concept.description,
    ...(concept.tags || [])
  ].join(' ');

  const highTerms = includesAnyTerm(driftText, HIGH_DRIFT_TERMS);
  const mediumTerms = includesAnyTerm(driftText, MEDIUM_DRIFT_TERMS);

  if (verifiedAgeDays === null) {
    reasons.push('missing or invalid verified date');
    return { driftRisk: 'high', driftReasons: reasons, verifiedAgeDays };
  }

  if (verifiedAgeDays > 90) reasons.push(`verified ${verifiedAgeDays} days before inventory`);
  if (highTerms.length) reasons.push(`high-change topic: ${highTerms.join(', ')}`);
  if (mediumTerms.length) reasons.push(`change-prone topic: ${mediumTerms.join(', ')}`);
  if (verifiedAgeDays > 30 && verifiedAgeDays <= 90) reasons.push(`verified ${verifiedAgeDays} days before inventory`);

  if (verifiedAgeDays > 90 || highTerms.length) {
    return { driftRisk: 'high', driftReasons: reasons, verifiedAgeDays };
  }
  if (verifiedAgeDays > 30 || mediumTerms.length) {
    return { driftRisk: 'medium', driftReasons: reasons, verifiedAgeDays };
  }
  return { driftRisk: 'low', driftReasons: reasons.length ? reasons : ['recently verified'], verifiedAgeDays };
}

function classifyFreshness({ verifiedAgeDays, sourceCount }) {
  if (verifiedAgeDays === null || verifiedAgeDays === undefined) {
    return {
      badge: 'unknown',
      label: 'Unknown',
      reason: 'Missing or invalid verified date',
      sourceCount
    };
  }
  if (verifiedAgeDays <= 30) {
    return {
      badge: 'fresh',
      label: 'Fresh',
      reason: `Verified ${verifiedAgeDays} days before inventory`,
      sourceCount
    };
  }
  if (verifiedAgeDays <= 90) {
    return {
      badge: 'watch',
      label: 'Watch',
      reason: `Verified ${verifiedAgeDays} days before inventory`,
      sourceCount
    };
  }
  return {
    badge: 'stale',
    label: 'Stale',
    reason: `Verified ${verifiedAgeDays} days before inventory`,
    sourceCount
  };
}

export function buildFlightRecorderInventory({
  rootDir = DEFAULT_ROOT,
  bundleDir = path.join(rootDir, 'wiki'),
  asOfDate
} = {}) {
  const files = walkMarkdownFiles(bundleDir);
  const conceptFiles = files.filter(file => !RESERVED_FILENAMES.has(path.basename(file)));
  const conceptSet = new Set(conceptFiles.map(file => relPath(rootDir, file)));
  const inventoryDate = asOfDate || findAsOfDate(files);
  const inboundCounts = new Map([...conceptSet].map(file => [file, 0]));
  const inboundRefs = new Map([...conceptSet].map(file => [file, []]));
  let totalInternalLinks = 0;
  let totalExternalLinks = 0;

  const parsedConcepts = conceptFiles.map(file => {
    const text = fs.readFileSync(file, 'utf8');
    const { frontmatter } = parseFrontmatter(text);
    const conceptPath = relPath(rootDir, file);
    const links = GENERATED_MARKDOWN_PATHS.has(conceptPath)
      ? []
      : extractLinks({ rootDir, filePath: file, conceptSet });

    for (const link of links) {
      if (link.kind === 'external') {
        totalExternalLinks += 1;
      } else {
        totalInternalLinks += 1;
      }
      if (link.concept) inboundCounts.set(link.path, (inboundCounts.get(link.path) || 0) + 1);
      if (link.concept) inboundRefs.get(link.path).push(conceptPath);
    }

    return {
      file,
      path: conceptPath,
      id: conceptPath.replace(/^wiki\//, '').replace(/\.md$/, ''),
      type: frontmatter?.type || 'unknown',
      title: frontmatter?.title || path.basename(file, '.md'),
      description: frontmatter?.description || '',
      source: Array.isArray(frontmatter?.source) ? frontmatter.source : [],
      verified: frontmatter?.verified || '',
      timestamp: frontmatter?.timestamp || '',
      tags: Array.isArray(frontmatter?.tags) ? frontmatter.tags : [],
      outboundLinks: links.map(link => {
        if (link.kind === 'external') return { kind: 'external', href: link.href };
        return { kind: link.kind, href: link.href, path: link.path, concept: link.concept };
      })
    };
  });

  const concepts = parsedConcepts
    .map(concept => {
      const drift = classifyDriftRisk({ concept, asOfDate: inventoryDate });
      const outboundConcepts = concept.outboundLinks
        .filter(link => link.concept)
        .map(link => link.path)
        .sort();
      const inboundConcepts = [...(inboundRefs.get(concept.path) || [])].sort();
      return {
        path: concept.path,
        id: concept.id,
        type: concept.type,
        title: concept.title,
        description: concept.description,
        tags: [...concept.tags].sort(),
        source: concept.source,
        verified: concept.verified,
        timestamp: concept.timestamp,
        verifiedAgeDays: drift.verifiedAgeDays,
        freshness: classifyFreshness({
          verifiedAgeDays: drift.verifiedAgeDays,
          sourceCount: concept.source.length
        }),
        driftRisk: drift.driftRisk,
        driftReasons: drift.driftReasons,
        inboundCount: inboundCounts.get(concept.path) || 0,
        localGraph: {
          defaultHops: GRAPH_POLICY.defaultHops,
          maxDefaultHops: GRAPH_POLICY.maxDefaultHops,
          inboundConcepts,
          outboundConcepts
        },
        outboundLinks: concept.outboundLinks
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));

  const orphanedConcepts = concepts
    .filter(concept => concept.inboundCount === 0)
    .map(concept => concept.path);

  return {
    schemaVersion: 1,
    generatedFrom: GENERATED_FROM,
    asOfDate: inventoryDate,
    graphPolicy: GRAPH_POLICY,
    summary: {
      markdownFiles: files.length,
      concepts: concepts.length,
      conceptDirectories: new Set(conceptFiles.map(file => relPath(rootDir, path.dirname(file)))).size,
      byType: countBy(concepts, concept => concept.type),
      byDriftRisk: countBy(concepts, concept => concept.driftRisk),
      byFreshness: countBy(concepts, concept => concept.freshness.badge),
      totalInternalLinks,
      totalExternalLinks,
      orphanedConcepts: orphanedConcepts.length
    },
    concepts,
    orphanedConcepts
  };
}

export function formatFlightRecorderJson(inventory) {
  return `${JSON.stringify(inventory, null, 2)}\n`;
}

function markdownLink(concept) {
  const relative = path.posix.relative('wiki/meta', concept.path);
  return `[${concept.title}](${relative})`;
}

function formatCountTable(counts) {
  return Object.entries(counts)
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join('\n');
}

function formatConceptTable(concepts, emptyMessage) {
  if (!concepts.length) return emptyMessage;
  return concepts
    .map(concept => {
      const reason = concept.driftReasons.join('; ');
      return `| ${markdownLink(concept)} | ${concept.type} | ${concept.verified} | ${concept.inboundCount} | ${reason} |`;
    })
    .join('\n');
}

export function formatFlightRecorderMarkdown(inventory) {
  const highDrift = inventory.concepts
    .filter(concept => concept.driftRisk === 'high')
    .sort((left, right) => {
      const ageSort = (right.verifiedAgeDays ?? -1) - (left.verifiedAgeDays ?? -1);
      return ageSort || left.path.localeCompare(right.path);
    });
  const stale = inventory.concepts
    .filter(concept => (concept.verifiedAgeDays ?? 0) > 30)
    .sort((left, right) => (right.verifiedAgeDays ?? 0) - (left.verifiedAgeDays ?? 0));
  const orphaned = inventory.orphanedConcepts
    .map(conceptPath => inventory.concepts.find(concept => concept.path === conceptPath))
    .filter(Boolean);
  const freshnessRows = [...inventory.concepts]
    .sort((left, right) => (right.verifiedAgeDays ?? 9999) - (left.verifiedAgeDays ?? 9999))
    .slice(0, 12)
    .map(concept => `| ${markdownLink(concept)} | ${concept.freshness.label} | ${concept.verified} | ${concept.freshness.sourceCount} | ${concept.freshness.reason} |`)
    .join('\n');

  return `---
type: reference
title: OKF bundle inventory
description: Generated flight-recorder report for the Rosen project OKF bundle.
source: ["${GENERATED_FROM}", "${INVENTORY_JSON}"]
verified: ${inventory.asOfDate}
tags: [okf, inventory, drift, generated]
timestamp: ${inventory.asOfDate}
---

# OKF bundle inventory

This is a generated flight-recorder report for the repo OKF bundle. It gives maintainers and downstream consumers a compact way to see what exists, where attention may drift, and which concepts have weak graph placement.

Run:

\`\`\`bash
npm run okf:flight-recorder
\`\`\`

Machine-readable output: [bundle-inventory.json](bundle-inventory.json).

## Graph policy

The default navigation view should be a per-concept local graph, not a global force graph. Show one hop by default, allow two hops, keep the global graph as a filterable opt-in, and gate labels by zoom level plus node degree.

## Summary

| Metric | Count |
| --- | ---: |
| Markdown files | ${inventory.summary.markdownFiles} |
| Concepts | ${inventory.summary.concepts} |
| Concept directories | ${inventory.summary.conceptDirectories} |
| Internal links | ${inventory.summary.totalInternalLinks} |
| External links | ${inventory.summary.totalExternalLinks} |
| Orphaned concepts | ${inventory.summary.orphanedConcepts} |

## Type counts

| Type | Count |
| --- | ---: |
${formatCountTable(inventory.summary.byType)}

## Drift risk counts

| Risk | Count |
| --- | ---: |
${formatCountTable(inventory.summary.byDriftRisk)}

## Freshness badge counts

| Badge | Count |
| --- | ---: |
${formatCountTable(inventory.summary.byFreshness)}

## Freshness watchlist

| Concept | Badge | Verified | Sources | Reason |
| --- | --- | --- | ---: | --- |
${freshnessRows || '| None | | | | |'}

## High-drift concepts

| Concept | Type | Verified | Inbound links | Reason |
| --- | --- | --- | ---: | --- |
${formatConceptTable(highDrift, '| None | | | | |')}

## Stale concepts

These concepts have a \`verified\` date more than 30 days before the inventory date.

| Concept | Type | Verified | Inbound links | Reason |
| --- | --- | --- | ---: | --- |
${formatConceptTable(stale, '| None | | | | |')}

## Orphaned concepts

These concepts currently have no inbound links from other concept files. Section indexes can still point to them, but orphaned concepts are weaker graph nodes for agents.

| Concept | Type | Verified | Inbound links | Reason |
| --- | --- | --- | ---: | --- |
${formatConceptTable(orphaned, '| None | | | | |')}

## How to interpret this

- High drift does not mean incorrect. It means the concept names a surface likely to change, such as deploys, launch state, credentials, CI, cache/version handling, or submission automation.
- Freshness badge data comes from each concept's \`verified\` date and source count, so a renderer can show trust state without a separate database.
- Stale means the claim has not been rechecked recently relative to the bundle's newest evidence date.
- Orphaned means the concept may be discoverable from an index but is not yet well-integrated into the concept graph.
`;
}

export function writeFlightRecorder({ rootDir = DEFAULT_ROOT, bundleDir = path.join(rootDir, 'wiki'), asOfDate } = {}) {
  const inventory = buildFlightRecorderInventory({ rootDir, bundleDir, asOfDate });
  fs.writeFileSync(path.join(rootDir, INVENTORY_JSON), formatFlightRecorderJson(inventory));
  fs.writeFileSync(path.join(rootDir, INVENTORY_MD), formatFlightRecorderMarkdown(inventory));
  return inventory;
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const asOfArgIndex = process.argv.indexOf('--as-of');
  const asOfDate = asOfArgIndex === -1 ? undefined : process.argv[asOfArgIndex + 1];
  const inventory = writeFlightRecorder({ asOfDate });
  console.log(`OKF flight recorder: ${inventory.summary.concepts} concepts, ${inventory.summary.totalInternalLinks} internal links, ${inventory.summary.byDriftRisk.high || 0} high-drift concepts`);
}
