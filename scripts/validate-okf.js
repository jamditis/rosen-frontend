#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const RESERVED_FILENAMES = new Set(['index.md', 'log.md']);
const REQUIRED_PROFILE_KEYS = ['type', 'title', 'description', 'source', 'verified', 'timestamp', 'tags'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const LINK_RE = /!?\[[^\]]*\]\(([^)]+)\)/g;
const SECRET_PATTERNS = [
  ['private key block', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/],
  ['GitHub token', /\bgh[pousr]_[0-9A-Za-z]{36,}\b/],
  ['GitHub fine-grained token', /\bgithub_pat_[0-9A-Za-z_]{22,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Slack token', /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/],
  [
    'secret assignment',
    /(?:password|passwd|secret|api[_-]?key|apikey|client[_-]?secret|access[_-]?token|auth[_-]?token)\s*[:=]\s*['"]?[A-Za-z0-9_+/=-]{24,}['"]?/i
  ]
];

export function walkMarkdownFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function parseInlineList(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  return inner
    .split(',')
    .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function parseFrontmatterValue(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const list = parseInlineList(trimmed);
  if (list) return list;
  return trimmed.replace(/^['"]|['"]$/g, '');
}

export function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return { frontmatter: null, body: text };
  const end = text.indexOf('\n---', 4);
  if (end === -1) return { frontmatter: null, body: text };

  const raw = text.slice(4, end);
  const bodyStart = text.indexOf('\n', end + 4);
  const body = bodyStart === -1 ? '' : text.slice(bodyStart + 1);
  const frontmatter = {};
  const lines = raw.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) {
      throw new Error(`unsupported frontmatter line: ${line}`);
    }
    const [, key, value = ''] = match;
    if (value.trim()) {
      frontmatter[key] = parseFrontmatterValue(value);
      continue;
    }

    const blockItems = [];
    while (i + 1 < lines.length) {
      const next = lines[i + 1];
      const item = next.match(/^\s*-\s+(.*)$/);
      if (!item) break;
      blockItems.push(item[1].trim().replace(/^['"]|['"]$/g, ''));
      i += 1;
    }
    frontmatter[key] = blockItems.length ? blockItems : '';
  }

  return { frontmatter, body };
}

export function isExternalLink(target) {
  return /^(https?:|mailto:|tel:|#)/.test(target);
}

export function isValidIsoDate(value) {
  if (!DATE_RE.test(String(value || ''))) return false;
  const [year, month, day] = String(value).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function stripMarkdownLinkTitle(target) {
  const trimmed = target.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('<')) {
    const close = trimmed.indexOf('>');
    return close === -1 ? trimmed : trimmed.slice(1, close);
  }

  let escaped = false;
  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (/\s/.test(char)) {
      return trimmed.slice(0, i);
    }
  }

  return trimmed;
}

export function resolveMarkdownTarget(filePath, target) {
  const clean = stripMarkdownLinkTitle(target).split('#')[0].trim();
  if (!clean || isExternalLink(clean)) return null;
  return path.resolve(path.dirname(filePath), clean);
}

export function stripFencedCodeBlocks(text) {
  return text.replace(/(^|\n)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2[ \t]*(?=\n|$)/g, '\n');
}

function hasIndexEntry(indexText, conceptPath) {
  return indexText.includes(`](${path.basename(conceptPath)})`) ||
    indexText.includes(`](${path.basename(conceptPath, '.md')}.md)`);
}

export function validateOkfBundle({ rootDir = process.cwd(), bundleDir = path.join(rootDir, 'wiki') } = {}) {
  const errors = [];
  const warnings = [];
  const files = walkMarkdownFiles(bundleDir);
  const conceptFiles = [];

  for (const file of files) {
    const rel = path.relative(rootDir, file);
    const text = fs.readFileSync(file, 'utf8');

    for (const [label, pattern] of SECRET_PATTERNS) {
      if (pattern.test(text)) {
        errors.push(`${rel}: possible secret value (${label})`);
      }
    }

    let parsed;
    try {
      parsed = parseFrontmatter(text);
    } catch (error) {
      errors.push(`${rel}: ${error.message}`);
      continue;
    }
    const { frontmatter } = parsed;
    const filename = path.basename(file);

    if (RESERVED_FILENAMES.has(filename)) {
      if (filename === 'index.md' && path.resolve(file) === path.resolve(bundleDir, 'index.md')) {
        if (!frontmatter || frontmatter.okf_version !== '0.1') {
          errors.push(`${rel}: root index.md must declare okf_version: "0.1"`);
        }
      } else if (frontmatter) {
        errors.push(`${rel}: reserved ${filename} should not carry concept frontmatter`);
      }
      continue;
    }

    conceptFiles.push(file);
    if (!frontmatter) {
      errors.push(`${rel}: missing YAML frontmatter`);
      continue;
    }

    for (const key of REQUIRED_PROFILE_KEYS) {
      const value = frontmatter[key];
      if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
        errors.push(`${rel}: missing or empty frontmatter key ${key}`);
      }
    }

    if (frontmatter.type && String(frontmatter.type).trim() !== frontmatter.type) {
      errors.push(`${rel}: type must not have leading or trailing whitespace`);
    }
    if (frontmatter.verified && !isValidIsoDate(frontmatter.verified)) {
      errors.push(`${rel}: verified must be a valid YYYY-MM-DD date`);
    }
    if (frontmatter.timestamp && !isValidIsoDate(frontmatter.timestamp)) {
      errors.push(`${rel}: timestamp must be a valid YYYY-MM-DD date`);
    }
    if (frontmatter.source && !Array.isArray(frontmatter.source)) {
      errors.push(`${rel}: source must be a list`);
    }
    if (frontmatter.tags && !Array.isArray(frontmatter.tags)) {
      errors.push(`${rel}: tags must be a list`);
    }
    if (!text.includes(`# ${frontmatter.title}`)) {
      warnings.push(`${rel}: body heading does not match title exactly`);
    }
  }

  const dirsWithConcepts = new Map();
  for (const file of conceptFiles) {
    const dir = path.dirname(file);
    if (!dirsWithConcepts.has(dir)) dirsWithConcepts.set(dir, []);
    dirsWithConcepts.get(dir).push(file);
  }

  for (const [dir, concepts] of dirsWithConcepts) {
    const indexPath = path.join(dir, 'index.md');
    const relDir = path.relative(rootDir, dir) || '.';
    if (!fs.existsSync(indexPath)) {
      errors.push(`${relDir}: directory contains concepts but has no index.md`);
      continue;
    }
    const indexText = fs.readFileSync(indexPath, 'utf8');
    for (const concept of concepts) {
      if (!hasIndexEntry(indexText, concept)) {
        errors.push(`${path.relative(rootDir, indexPath)}: missing link to ${path.basename(concept)}`);
      }
    }
  }

  for (const file of files) {
    const text = stripFencedCodeBlocks(fs.readFileSync(file, 'utf8'));
    const rel = path.relative(rootDir, file);
    for (const match of text.matchAll(LINK_RE)) {
      const target = match[1].trim();
      const resolved = resolveMarkdownTarget(file, target);
      if (!resolved) continue;
      if (!fs.existsSync(resolved)) {
        errors.push(`${rel}: dangling link -> ${target}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    files: files.length,
    concepts: conceptFiles.length,
    directories: dirsWithConcepts.size
  };
}

function printResult(result) {
  console.log(`OKF bundle: ${result.files} markdown files, ${result.concepts} concepts, ${result.directories} concept directories`);
  for (const warning of result.warnings) console.warn(`WARN: ${warning}`);
  if (!result.ok) {
    for (const error of result.errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log('PASS: wiki bundle satisfies the Rosen project OKF profile.');
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  printResult(validateOkfBundle({ rootDir }));
}
