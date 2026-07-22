#!/usr/bin/env node
// Stamp the canonical archive version across every cache-busting marker (#282).
//
// version.json `version` is the single source of truth. This rewrites every
// `?v=<x.y.z>` marker in the root app, FAQ, and standalone feature browser
// files, plus the static-asset cache name in frontend/sw.js, then runs the
// version-consistency
// test as the guardrail. It replaces the manual multi-file edit that the
// version-consistency test only catches after the fact.
//
// frontend/services/cacheConfig.js holds a separate CACHE_VERSION (the data cache,
// version.json `cache_version`, e.g. v9). That is a different namespace on its own
// release cadence and is deliberately left untouched here.
//
// The bump is atomic: if the post-rewrite guardrail fails, every file (including
// version.json) is rolled back to its pre-bump content, so a rejected bump never
// leaves a half-stamped tree.
//
// Usage:
//   node scripts/bump-version.mjs 3.4.7   # set version.json version + date, then stamp everywhere
//   node scripts/bump-version.mjs         # re-stamp from the current version.json (repairs drift)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const SEMVER = /^\d+\.\d+\.\d+$/;
const VERSION_MARKER = /\?v=\d+\.\d+\.\d+/g;
// Anchored to `const CACHE_VERSION = '<semver>'`; only the version literal is
// rewritten, and only in sw.js (cacheConfig.js's non-semver 'v9' never matches).
const SW_CACHE_VERSION = /(const CACHE_VERSION\s*=\s*['"])\d+\.\d+\.\d+(['"])/;

// Collect the root entry point and every browser JavaScript, HTML, and CSS file
// in the app and standalone-page trees. This is the same surface the
// version-consistency test scans, so the guardrail and bumper cannot disagree.
// Walking features/ (rather than naming today's feature pages) ensures a new
// standalone feature automatically joins the version-bump surface.
export function collectVersionedFiles(rootDir) {
  const files = [path.join(rootDir, 'index.html')];
  const walk = (dir, extensions) => {
    // A versioned root may be absent (e.g. a fixture tree with no faq/, or a
    // checkout without frontend/); skip it rather than throwing ENOENT.
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'dist' && entry.name !== 'node_modules') walk(full, extensions);
      } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
        files.push(full);
      }
    }
  };
  walk(path.join(rootDir, 'frontend'), ['.html', '.js', '.css']);
  walk(path.join(rootDir, 'faq'), ['.html', '.js', '.css']);
  walk(path.join(rootDir, 'features'), ['.html', '.js', '.css']);
  return files;
}

// Rewrite every ?v= marker (and sw.js's CACHE_VERSION) in the tree to `target`.
// Pure file I/O, no version.json write and no test run — those are CLI concerns —
// so a test can drive it against a fixture tree. Returns what changed.
export function stampVersion(rootDir, target) {
  if (!SEMVER.test(target)) throw new Error(`"${target}" is not a semver x.y.z version`);
  const swPath = path.join(rootDir, 'frontend', 'sw.js');
  let markers = 0;
  const changedFiles = [];
  for (const file of collectVersionedFiles(rootDir)) {
    if (!fs.existsSync(file)) continue;
    const before = fs.readFileSync(file, 'utf-8');
    markers += (before.match(VERSION_MARKER) || []).length;
    let after = before.replace(VERSION_MARKER, `?v=${target}`);
    if (file === swPath) after = after.replace(SW_CACHE_VERSION, `$1${target}$2`);
    if (after !== before) {
      fs.writeFileSync(file, after);
      changedFiles.push(path.relative(rootDir, file));
    }
  }
  return { markers, changedFiles };
}

// Resolve the target version, update version.json when a new one is given, stamp
// the tree, then run `verify` as the guardrail. If `verify` throws, roll every
// touched file (version.json included) back to its pre-bump content and rethrow
// with `.rolledBack = true`, so a failed bump is non-destructive.
export function applyVersion(rootDir, { argVersion, verify } = {}) {
  const versionJsonPath = path.join(rootDir, 'version.json');

  // Snapshot everything we might write, before any write, for rollback.
  const snapshot = new Map();
  for (const file of [versionJsonPath, ...collectVersionedFiles(rootDir)]) {
    if (fs.existsSync(file)) snapshot.set(file, fs.readFileSync(file, 'utf-8'));
  }

  const versionJson = JSON.parse(snapshot.get(versionJsonPath));
  let target;
  if (argVersion) {
    if (!SEMVER.test(argVersion)) throw new Error(`"${argVersion}" is not a semver x.y.z version`);
    target = argVersion;
    versionJson.version = target;
    versionJson.updated = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(versionJsonPath, `${JSON.stringify(versionJson, null, 2)}\n`);
  } else {
    target = versionJson.version;
    if (!SEMVER.test(target)) throw new Error(`version.json version "${target}" is not semver x.y.z`);
  }

  const result = stampVersion(rootDir, target);

  try {
    if (verify) verify();
  } catch (err) {
    for (const [file, content] of snapshot) fs.writeFileSync(file, content);
    err.rolledBack = true;
    throw err;
  }
  return { target, ...result };
}

function fail(msg) {
  console.error(`bump-version: ${msg}`);
  process.exit(1);
}

function main(rootDir, argVersion) {
  let result;
  try {
    result = applyVersion(rootDir, {
      argVersion,
      // Guardrail: the rewrite must leave the version-consistency invariants intact.
      verify: () =>
        execFileSync('node', ['--test', 'tests/version-consistency.test.js'], { cwd: rootDir, stdio: 'inherit' }),
    });
  } catch (err) {
    if (err.rolledBack) {
      fail('version-consistency test failed after stamping — reverted all changes; investigate the inconsistency and retry');
    }
    fail(err.message);
  }

  console.log(
    `bump-version: stamped ${result.target} across ${result.changedFiles.length} file(s) ` +
    `(${result.markers} ?v= markers scanned) + sw.js CACHE_VERSION`,
  );
}

// Run the CLI only when invoked directly, not when imported by a test.
const invokedDirectly = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  main(rootDir, process.argv[2]);
}
