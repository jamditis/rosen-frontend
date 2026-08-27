/**
 * Deploy data-manifest tests (#527)
 *
 * The wiki #wiki page 404'd in production because data/wiki-seed.json was added
 * to the repo (and to frontend/sw.js's DATA_URLS) but never to either deploy
 * manifest, so the manual/CI upload never carried it — the frontend fetched a
 * file that was never deployed.
 *
 * Why classify files instead of scanning fetch code: deployed code reaches data
 * files through at least three path shapes — `./data/x.json` literals
 * (constants.js, wikiService.js), `${basePath}/data/x.json` templates
 * (archiveService.js getOpenDataURLs), and `DATA_BASE + 'x.json'` concatenation
 * (tools/active/dataviz/dataviz.html). A regex that matches one shape silently
 * misses the others and gives false confidence. The invariant that is immune to
 * how a file is fetched is to classify the data files themselves: every data
 * file in the repo must be a deliberate deploy-or-exclude decision. #527 is
 * exactly the bad state that becomes impossible here — a new data file cannot be
 * added without this test forcing a decision about whether it ships.
 *
 * This lives in the Node suite on purpose: frontend-validation.yml runs on
 * data/** and frontend/** changes, so it fires when a data file is added;
 * backend-tests.yml (the Python suite that guards the same manifest) only runs
 * on backend/** and would be blind to the change that introduces this bug.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const deployScriptPath = path.join(rootDir, 'backend', 'scripts', 'deploy_full_site.py');

// Every *.json under data/, at any depth, as a repo-root-relative posix path
// (e.g. 'data/archive-core.json', 'data/feeds/index.json'). Recursive so a
// future asset like data/search/index.json cannot slip past the classification.
function allDataJsonFiles() {
  return execFileSync('git', ['ls-files', '--', 'data'], {
    cwd: rootDir,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(rel => rel.endsWith('.json'));
}

// Extract a Python tuple of string literals named `name` from the deploy script
// (e.g. _DEPLOY_DATA_FILES, _DEPLOY_DIRS). Returns the literal values.
function pyTuple(name) {
  const py = fs.readFileSync(deployScriptPath, 'utf-8');
  const block = py.match(new RegExp(`${name}\\s*:[^=]*=\\s*\\(([\\s\\S]*?)\\)`));
  assert.ok(block, `deploy_full_site.py: could not find the ${name} tuple`);
  return [...block[1].matchAll(/['"]([^'"]+)['"]/g)].map(m => m[1]);
}

// data files the deploy script uploads individually, and the data/ directories
// it walks recursively (e.g. data/feeds) — together these are "deployed".
function deployedDataFiles() { return new Set(pyTuple('_DEPLOY_DATA_FILES')); }
function deployedDataDirs() {
  return pyTuple('_DEPLOY_DIRS').filter(d => d === 'data' || d.startsWith('data/'));
}

// The data file basenames listed as DIRECT children of the `data/` block in
// DEPLOYMENT.md's first fenced "Files to deploy" code block. Scoped to the data
// block so top-level version.json / metadata.json are not counted, and pinned to
// the direct-child indent so nested entries (e.g. data/feeds/index.json) and
// feeds/ itself (a directory) do not leak in.
function deploymentMdDataFiles() {
  const md = fs.readFileSync(path.join(rootDir, 'DEPLOYMENT.md'), 'utf-8');
  const fenced = md.split('```')[1];
  assert.ok(fenced, 'DEPLOYMENT.md: could not find the fenced "Files to deploy" block');

  const files = new Set();
  let inDataBlock = false;
  let childIndent = null; // leading-whitespace width of a direct child of data/
  for (const raw of fenced.split('\n')) {
    if (/^data\//.test(raw)) { inDataBlock = true; childIndent = null; continue; }
    if (!inDataBlock || !raw.trim()) continue;
    const indent = raw.length - raw.trimStart().length;
    if (indent === 0) { inDataBlock = false; continue; } // next top-level entry ends the block
    if (childIndent === null) childIndent = indent;       // first child sets the direct-child level
    if (indent !== childIndent) continue;                 // skip deeper-nested entries (data/feeds/*)
    const entry = raw.trim().split('#')[0].trim();
    const m = entry.match(/^([A-Za-z0-9_-]+\.(?:json|js|md|bin))$/i);
    if (m) files.add(`data/${m[1]}`);
  }
  return files;
}

// Data files deliberately NOT deployed, keyed by repo-root-relative posix path,
// each with a reason. A file belongs here ONLY if no deployed code references it
// (verify before adding); if deployed code links or fetches it, deploy it
// instead — a referenced-but-undeployed file is exactly the #527 404 class.
const KNOWN_NOT_DEPLOYED = new Map([
  ['data/graph-validation-holds.json',
    'validator policy input used only by repository and CI graph checks; no ' +
    'deployed page reads it'],
  ['data/relationship-type-registry.json',
    'relationship-type semantics used only by scripts/validate-graph-data.mjs ' +
    '(issue #737); no deployed page reads it'],
  ['data/stewardship-census.json',
    'repository stewardship report, not referenced by any deployed page (built ' +
    'by scripts/build-stewardship-census.mjs)'],
  ['data/preservation-sample.json',
    'preservation pilot manifest for curator/reviewer and pilot-runner use, not ' +
    'referenced by any deployed page (built by scripts/select-preservation-sample.mjs)'],
  ['data/preservation-sample.sources.json',
    'blind worker-facing projection of the same pilot manifest (id/objectType/url ' +
    'only, no stratum or reason), not referenced by any deployed page (built by ' +
    'scripts/select-preservation-sample.mjs)'],
  ['data/link-check-state.json',
    'workflow-internal traversal state for the scheduled external-link liveness ' +
    'sweep (issue #710, .github/workflows/verify-external-links.yml); read and ' +
    'written only by scripts/verify-links.js, not fetched by any deployed page'],
]);

// A data file is "deployed" if it is listed individually or lives under a data/
// directory the deploy script walks recursively (e.g. data/feeds/index.json).
function isDeployed(relPath, deployedFiles, deployedDirs) {
  if (deployedFiles.has(relPath)) return true;
  return deployedDirs.some(dir => relPath.startsWith(`${dir}/`));
}

describe('deploy data manifest classifies every data file', () => {
  it('ignores gitignored local scratch JSON', () => {
    const scratchDir = path.join(dataDir, '_recovery_tmp');
    const scratchPath = path.join(scratchDir, 'issue-627-local-only.json');
    fs.mkdirSync(scratchDir, { recursive: true });
    fs.writeFileSync(scratchPath, '{}');
    try {
      assert.equal(
        allDataJsonFiles().includes('data/_recovery_tmp/issue-627-local-only.json'),
        false,
        'gitignored recovery scratch cannot become a deploy-manifest candidate'
      );
    } finally {
      fs.rmSync(scratchPath, { force: true });
    }
  });

  it('deploys or explicitly excludes every data/**/*.json', () => {
    const deployedFiles = deployedDataFiles();
    const deployedDirs = deployedDataDirs();
    const unclassified = allDataJsonFiles().filter(rel =>
      !isDeployed(rel, deployedFiles, deployedDirs) && !KNOWN_NOT_DEPLOYED.has(rel));

    assert.deepStrictEqual(unclassified, [],
      `Unclassified data file(s): each must be added to _DEPLOY_DATA_FILES (or a ` +
      `walked _DEPLOY_DIRS) in backend/scripts/deploy_full_site.py and to ` +
      `DEPLOYMENT.md so the deploy uploads it, or to KNOWN_NOT_DEPLOYED in this ` +
      `test with a reason. Leaving it unlisted is how data/wiki-seed.json 404'd ` +
      `in production (#527):\n  ${unclassified.join('\n  ')}`);
  });

  it('never both deploys and excludes the same file', () => {
    const deployedFiles = deployedDataFiles();
    const deployedDirs = deployedDataDirs();
    const contradictions = [...KNOWN_NOT_DEPLOYED.keys()]
      .filter(rel => isDeployed(rel, deployedFiles, deployedDirs));
    assert.deepStrictEqual(contradictions, [],
      `Data file(s) listed as both deployed and excluded: ${contradictions.join(', ')}`);
  });

  it('references only data files that exist on disk (no manifest rot)', () => {
    const missing = [...deployedDataFiles(), ...KNOWN_NOT_DEPLOYED.keys()]
      .filter(rel => !fs.existsSync(path.join(rootDir, rel)));
    assert.deepStrictEqual(missing, [],
      `Manifest/exclusion lists reference data file(s) absent from data/: ${missing.join(', ')}`);
  });

  it('keeps DEPLOYMENT.md and the deploy script in agreement on data files', () => {
    // Compare only individually-listed data files (DEPLOYMENT.md lists feeds/ as
    // a directory, matched to _DEPLOY_DIRS, not enumerated file by file).
    const fromScript = [...deployedDataFiles()].sort();
    const fromMd = [...deploymentMdDataFiles()].sort();
    assert.deepStrictEqual(fromMd, fromScript,
      `DEPLOYMENT.md's data block and deploy_full_site.py _DEPLOY_DATA_FILES ` +
      `must list the same data files (DEPLOYMENT.md is what a human follows for ` +
      `a manual/WP File Manager upload).\n  DEPLOYMENT.md: ${fromMd.join(', ')}` +
      `\n  deploy script: ${fromScript.join(', ')}`);
  });

  it('classifies the known data files (guards the scanner itself)', () => {
    // A scan that silently matched nothing would make the checks above vacuously
    // pass. Pin known files so a readdir/regex regression fails loudly.
    const found = new Set(allDataJsonFiles());
    for (const expected of ['data/archive-core.json', 'data/wiki-seed.json',
                            'data/schema.json', 'data/feeds/index.json']) {
      assert.ok(found.has(expected),
        `expected the data/ scan to find ${expected}; got: ${[...found].join(', ')}`);
    }
    assert.ok(deployedDataFiles().has('data/wiki-seed.json'),
      'wiki-seed.json must be in _DEPLOY_DATA_FILES (the #527 fix)');
    for (const artifact of ['data/archive-embeddings.bin', 'data/archive-embeddings.json']) {
      assert.ok(deployedDataFiles().has(artifact),
        `similar-in-theme artifact must deploy: ${artifact}`);
    }
  });
});
