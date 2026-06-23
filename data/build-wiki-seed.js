#!/usr/bin/env node
/**
 * Build the public wiki data file from the OKF content bundle.
 *
 * Source of truth: data/wiki-content/<kind>/<slug>.md — one OKF concept per
 * file (the same Open Knowledge Format the internal wiki/ bundle uses). This
 * script maps each file onto the public wiki page contract and writes
 * data/wiki-seed.json, the file the frontend renders.
 *
 * It reuses the repo's own OKF parser (scripts/validate-okf.js) for the input
 * and the frontend's own validator (frontend/services/wikiService.js) for the
 * output, so the build fails before it can emit anything the UI would reject.
 *
 * Run: node data/build-wiki-seed.js   (or npm run build-wiki)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseFrontmatter, walkMarkdownFiles, RESERVED_FILENAMES } from '../scripts/validate-okf.js';
import { validateWikiData } from '../frontend/services/wikiService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'data', 'wiki-content');
const OUT_PATH = path.join(ROOT, 'data', 'wiki-seed.json');

const KINDS = new Set(['concept', 'entity', 'topic']);
const DEFAULT_CONTRIBUTORS = ['archive maintainers'];
// The page object key order mirrors the existing seed so regenerated JSON has a
// stable, reviewable diff.
const PAGE_KEYS = [
  'id', 'slug', 'kind', 'title', 'summary', 'aliases', 'body',
  'relatedConcepts', 'relatedEntities', 'relatedRecords', 'references',
  'contributors', 'lastUpdated', 'revisionCount', 'moderationState'
];

function asList(value) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

// The wiki renders body text as plain text, so strip the inline markdown a
// curator might still type (links, emphasis, code) down to its visible text.
function stripInlineMarkdown(text) {
  return text
    .replace(/!?\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

/**
 * Split an OKF markdown body into wiki body blocks and references.
 * - `# Title` (H1) is the page title and is skipped.
 * - Each `## Heading` opens a block; its paragraphs join into one text string.
 * - A `## Sources` section is not a body block: its markdown links become the
 *   page's references (rendered by the UI as a sources list).
 */
function parseBody(body) {
  const blocks = [];
  const references = [];
  const lines = body.split(/\r?\n/);
  let heading = null;
  let inSources = false;
  let buffer = [];

  const flush = () => {
    if (heading && !inSources) {
      const text = stripInlineMarkdown(buffer.join(' ').replace(/\s+/g, ' '));
      if (text) blocks.push({ heading, text });
    }
    buffer = [];
  };

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      flush();
      heading = line.replace(/^##\s+/, '').trim();
      inSources = /^sources\b/i.test(heading);
      continue;
    }
    if (/^#\s+/.test(line)) {
      // H1 page title: end any open block, contribute nothing.
      flush();
      heading = null;
      inSources = false;
      continue;
    }
    if (inSources) {
      for (const match of line.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
        references.push({ label: match[1].trim(), url: match[2].trim() });
      }
      continue;
    }
    buffer.push(line);
  }
  flush();
  return { blocks, references };
}

function buildPage(file) {
  const rel = path.relative(CONTENT_DIR, file);
  const parts = rel.split(path.sep);
  const kind = parts[0];
  if (!KINDS.has(kind)) {
    throw new Error(`${rel}: must live under concept/, entity/ or topic/`);
  }
  const slugTail = path.basename(file, '.md');
  const { frontmatter, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
  if (!frontmatter) throw new Error(`${rel}: missing OKF frontmatter`);

  const { blocks, references } = parseBody(body);
  const related = asList(frontmatter.related);
  const contributors = asList(frontmatter.contributors);

  const page = {
    id: `wiki-${kind}-${slugTail}`,
    slug: `${kind}/${slugTail}`,
    kind,
    title: String(frontmatter.title || '').trim(),
    summary: String(frontmatter.description || '').trim(),
    aliases: asList(frontmatter.aliases),
    body: blocks,
    relatedConcepts: related.filter(slug => slug.startsWith('concept/')),
    relatedEntities: related.filter(slug => slug.startsWith('entity/')),
    relatedRecords: asList(frontmatter.records),
    references,
    contributors: contributors.length ? contributors : DEFAULT_CONTRIBUTORS,
    lastUpdated: String(frontmatter.verified || frontmatter.timestamp || '').trim(),
    revisionCount: Number.parseInt(frontmatter.revisionCount, 10) || 1,
    moderationState: String(frontmatter.moderationState || 'seed').trim()
  };
  // Re-key in the canonical order for a stable serialized diff.
  return Object.fromEntries(PAGE_KEYS.map(key => [key, page[key]]));
}

export function buildSeed() {
  const files = walkMarkdownFiles(CONTENT_DIR)
    .filter(file => !RESERVED_FILENAMES.has(path.basename(file)));
  const pages = files.map(buildPage).sort((a, b) => a.slug.localeCompare(b.slug));

  // Deterministic generatedAt: the most recent page date, so reruns over
  // unchanged content produce an identical file (no churn, stable sync test).
  const generatedAt = pages.reduce(
    (latest, page) => (page.lastUpdated > latest ? page.lastUpdated : latest),
    '0000-00-00'
  );

  const seed = { schemaVersion: 1, generatedAt, status: 'seed', pages };

  const result = validateWikiData(seed);
  if (!result.valid) {
    const error = new Error(`generated wiki seed fails the wiki data contract:\n  - ${result.errors.join('\n  - ')}`);
    error.errors = result.errors;
    throw error;
  }
  return seed;
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  try {
    const seed = buildSeed();
    fs.writeFileSync(OUT_PATH, `${JSON.stringify(seed, null, 2)}\n`);
    console.log(`wrote ${path.relative(ROOT, OUT_PATH)}: ${seed.pages.length} pages`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
