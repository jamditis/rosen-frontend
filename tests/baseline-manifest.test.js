/**
 * Tests for the archive baseline snapshot tool (#702).
 *
 * Most cases drive preservation/baseline-manifest-lib.mjs against a throwaway
 * fixture tree (fresh per test), so a deliberately corrupted copy never
 * touches the real repository. One end-to-end case runs the real tool
 * against the actual repository files to prove the configured category list
 * still matches what is really on disk.
 */

import {
  describe, it, beforeEach, afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ACCEPTANCE_CRITERIA_COMMIT,
  BaselineManifestError,
  BASELINE_CATEGORIES,
  buildBaselineBag,
  computeCommitProvenance,
  resolveBaselineFiles,
  verifyBaselineBag,
} from '../preservation/baseline-manifest-lib.mjs';
import { runCreateBaseline } from '../preservation/create-baseline-manifest.mjs';
import { runVerifyBaseline } from '../preservation/verify-baseline-manifest.mjs';

const realRepoRoot = process.cwd();

function sha256Of(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

let root; // fixture "repository" root
const cleanupDirs = [];

function write(rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

function freshDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `baseline-test-${label}-`));
  cleanupDirs.push(dir);
  return dir;
}

const fixtureCategories = [
  {
    id: 'fixture-csv',
    description: 'fixture source CSVs',
    paths: ['data/sample-a.csv', 'data/sample-b.csv'],
  },
  {
    id: 'fixture-json',
    description: 'fixture generated JSON',
    paths: ['data/nested/sample-c.json'],
  },
];

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-fixture-repo-'));
  write('data/sample-a.csv', 'id,name\n1,alpha\n');
  write('data/sample-b.csv', 'id,name\n2,beta\n');
  write('data/nested/sample-c.json', '{"ok":true}\n');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  while (cleanupDirs.length > 0) {
    fs.rmSync(cleanupDirs.pop(), { recursive: true, force: true });
  }
});

const fixtureCommitInfo = {
  commit: 'fixture0000000000000000000000000000000000',
  requestedCommit: ACCEPTANCE_CRITERIA_COMMIT,
  requestedCommitExists: false,
  gitStatus: 'clean',
  note: 'fixture commit note',
};

describe('resolveBaselineFiles', () => {
  it('resolves every configured path and sorts them', () => {
    const files = resolveBaselineFiles(root, fixtureCategories);
    assert.deepEqual(
      files.map((f) => f.relativePath),
      ['data/nested/sample-c.json', 'data/sample-a.csv', 'data/sample-b.csv'],
    );
    for (const file of files) {
      assert.equal(fs.existsSync(file.absolutePath), true);
    }
  });

  it('fails loudly instead of silently skipping a missing configured path', () => {
    const categories = [
      { id: 'broken', description: 'broken', paths: ['data/does-not-exist.csv'] },
    ];
    assert.throws(
      () => resolveBaselineFiles(root, categories),
      (err) => err instanceof BaselineManifestError && /does not exist/.test(err.message),
    );
  });

  it('rejects a configured path that is a directory, not a file', () => {
    const categories = [{ id: 'broken', description: 'broken', paths: ['data/nested'] }];
    assert.throws(
      () => resolveBaselineFiles(root, categories),
      (err) => err instanceof BaselineManifestError && /not a regular file/.test(err.message),
    );
  });

  it('keeps the real category list pointed at files that actually exist in this repository', () => {
    // This is the guardrail CLAUDE.md asks for: if data/ is restructured, this
    // fails loudly here instead of silently shrinking a real baseline later.
    const files = resolveBaselineFiles(realRepoRoot);
    assert.ok(files.length > 0);
    const categoryIds = new Set(BASELINE_CATEGORIES.map((c) => c.id));
    assert.deepEqual(
      categoryIds,
      new Set(['source-csv', 'runtime-json', 'entity-relationship-data', 'schema']),
    );
  });
});

describe('computeCommitProvenance', () => {
  it('documents that the acceptance-criteria commit is absent and pins HEAD instead', () => {
    // Deterministic stand-in for `git`, so this does not depend on the
    // worktree's actual history.
    const execFile = (cmd, args) => {
      if (args[0] === 'rev-parse') return Buffer.from('deadbeefcafef00d\n');
      if (args[0] === 'cat-file') throw new Error('fatal: Not a valid object name 43bb423');
      if (args[0] === 'status') return Buffer.from('');
      throw new Error(`unexpected git invocation: ${args.join(' ')}`);
    };
    const info = computeCommitProvenance(root, { execFile });
    assert.equal(info.commit, 'deadbeefcafef00d');
    assert.equal(info.requestedCommit, '43bb423');
    assert.equal(info.requestedCommitExists, false);
    assert.equal(info.gitStatus, 'clean');
    assert.match(info.note, /does not exist/);
    assert.match(info.note, /deadbeefcafef00d/);
  });

  it('documents a present acceptance-criteria commit without changing what gets pinned', () => {
    const execFile = (cmd, args) => {
      if (args[0] === 'rev-parse') return Buffer.from('cafef00ddeadbeef\n');
      if (args[0] === 'cat-file') return Buffer.from('');
      if (args[0] === 'status') return Buffer.from(' M data/sample-a.csv\n');
      throw new Error(`unexpected git invocation: ${args.join(' ')}`);
    };
    const info = computeCommitProvenance(root, { execFile });
    assert.equal(info.requestedCommitExists, true);
    assert.equal(info.gitStatus, 'dirty');
    assert.match(info.note, /exists in this repository/);
  });

  it('is non-fatal when the working-tree status cannot be read', () => {
    const execFile = (cmd, args) => {
      if (args[0] === 'rev-parse') return Buffer.from('abc123\n');
      if (args[0] === 'cat-file') throw new Error('not found');
      if (args[0] === 'status') throw new Error('git status unavailable');
      throw new Error(`unexpected git invocation: ${args.join(' ')}`);
    };
    const info = computeCommitProvenance(root, { execFile });
    assert.equal(info.gitStatus, null);
  });

  it('raises when the commit itself cannot be resolved', () => {
    const execFile = () => {
      throw new Error('not a git repository');
    };
    assert.throws(
      () => computeCommitProvenance(root, { execFile }),
      (err) => err instanceof BaselineManifestError && /unable to resolve/.test(err.message),
    );
  });

  it('confirms, against the real repository, that commit 43bb423 named in issue #702 is absent', () => {
    const info = computeCommitProvenance(realRepoRoot);
    const actualHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: realRepoRoot }).toString().trim();
    assert.equal(info.commit, actualHead);
    assert.equal(info.requestedCommit, '43bb423');
    assert.equal(info.requestedCommitExists, false);
    assert.match(info.note, /43bb423/);
  });
});

describe('buildBaselineBag / verifyBaselineBag', () => {
  it('records byte size and SHA-256 for every included file and passes verification', () => {
    const files = resolveBaselineFiles(root, fixtureCategories);
    const bagDir = freshDir('build');
    const manifest = buildBaselineBag({
      repoRoot: root, outputDir: bagDir, files, commitInfo: fixtureCommitInfo,
    });

    assert.equal(manifest.totalFiles, 3);
    assert.equal(manifest.commit, fixtureCommitInfo.commit);
    for (const entry of manifest.files) {
      const original = fs.readFileSync(path.join(root, entry.path));
      assert.equal(entry.sha256, sha256Of(original));
      assert.equal(entry.bytes, original.length);
    }

    // BagIt structure.
    assert.equal(fs.readFileSync(path.join(bagDir, 'bagit.txt'), 'utf8').includes('BagIt-Version: 1.0'), true);
    const bagInfo = fs.readFileSync(path.join(bagDir, 'bag-info.txt'), 'utf8');
    assert.match(bagInfo, /Source-Commit: fixture0000000000000000000000000000000000/);
    assert.match(bagInfo, /Payload-Oxum: \d+\.3/);
    const manifestText = fs.readFileSync(path.join(bagDir, 'manifest-sha256.txt'), 'utf8');
    assert.equal(manifestText.split('\n').filter(Boolean).length, 3);
    assert.ok(fs.existsSync(path.join(bagDir, 'tagmanifest-sha256.txt')));
    // Payload copies live at <bag>/data/<repo-relative-path>. Every fixture
    // path here already starts with "data/" (it mirrors the real repo layout),
    // so the payload directory nests an inner data/ — see BASELINE.md.
    assert.ok(fs.existsSync(path.join(bagDir, 'data', 'data', 'sample-a.csv')));

    const result = verifyBaselineBag({ bagDir });
    assert.equal(result.ok, true);
    assert.equal(result.checkedFiles, 3);
    assert.deepEqual(result.mismatches, []);
    assert.deepEqual(result.missing, []);
    assert.equal(result.tag.ok, true);
  });

  it('refuses to write into a non-empty output directory', () => {
    const files = resolveBaselineFiles(root, fixtureCategories);
    const bagDir = freshDir('nonempty');
    fs.writeFileSync(path.join(bagDir, 'already-here.txt'), 'x');
    assert.throws(
      () => buildBaselineBag({
        repoRoot: root, outputDir: bagDir, files, commitInfo: fixtureCommitInfo,
      }),
      (err) => err instanceof BaselineManifestError && /non-empty/.test(err.message),
    );
  });

  it('verifies successfully from a clean copy in a different temporary directory', () => {
    const files = resolveBaselineFiles(root, fixtureCategories);
    const bagDir = freshDir('clean-source');
    buildBaselineBag({
      repoRoot: root, outputDir: bagDir, files, commitInfo: fixtureCommitInfo,
    });

    const cleanCopyDir = freshDir('clean-copy');
    fs.rmSync(cleanCopyDir, { recursive: true, force: true });
    fs.cpSync(bagDir, cleanCopyDir, { recursive: true });

    const result = verifyBaselineBag({ bagDir: cleanCopyDir });
    assert.equal(result.ok, true);
    assert.equal(result.missing.length, 0);
    assert.equal(result.mismatches.length, 0);
  });

  it('fails verification when a payload copy is deliberately altered', () => {
    const files = resolveBaselineFiles(root, fixtureCategories);
    const bagDir = freshDir('tamper');
    buildBaselineBag({
      repoRoot: root, outputDir: bagDir, files, commitInfo: fixtureCommitInfo,
    });

    fs.writeFileSync(path.join(bagDir, 'data', 'data', 'sample-a.csv'), 'id,name\n1,tampered\n');

    const result = verifyBaselineBag({ bagDir });
    assert.equal(result.ok, false);
    assert.equal(result.mismatches.length, 1);
    assert.equal(result.mismatches[0].path, 'data/sample-a.csv');
    assert.notEqual(result.mismatches[0].expectedSha256, result.mismatches[0].actualSha256);
  });

  it('fails verification when a payload copy is deleted', () => {
    const files = resolveBaselineFiles(root, fixtureCategories);
    const bagDir = freshDir('delete');
    buildBaselineBag({
      repoRoot: root, outputDir: bagDir, files, commitInfo: fixtureCommitInfo,
    });

    fs.rmSync(path.join(bagDir, 'data', 'data', 'nested', 'sample-c.json'));

    const result = verifyBaselineBag({ bagDir });
    assert.equal(result.ok, false);
    assert.deepEqual(result.missing, ['data/nested/sample-c.json']);
  });

  it('fails verification when a tag file (bag-info.txt) is altered', () => {
    const files = resolveBaselineFiles(root, fixtureCategories);
    const bagDir = freshDir('tag-tamper');
    buildBaselineBag({
      repoRoot: root, outputDir: bagDir, files, commitInfo: fixtureCommitInfo,
    });

    fs.appendFileSync(path.join(bagDir, 'bag-info.txt'), 'Tampered: yes\n');

    const result = verifyBaselineBag({ bagDir });
    assert.equal(result.ok, false);
    assert.equal(result.tag.ok, false);
    assert.equal(result.tag.mismatches.some((m) => m.path === 'bag-info.txt'), true);
    // The payload itself is untouched.
    assert.deepEqual(result.mismatches, []);
  });

  it('verifies a restored data/ tree against the original bag via dataDir', () => {
    const files = resolveBaselineFiles(root, fixtureCategories);
    const bagDir = freshDir('restore-source');
    buildBaselineBag({
      repoRoot: root, outputDir: bagDir, files, commitInfo: fixtureCommitInfo,
    });

    // Simulate restoring the payload into a fresh checkout's data/ directory.
    const restoreDir = freshDir('restore-dest');
    fs.cpSync(path.join(bagDir, 'data'), restoreDir, { recursive: true });

    const restored = verifyBaselineBag({ bagDir, dataDir: restoreDir });
    assert.equal(restored.ok, true);

    fs.writeFileSync(path.join(restoreDir, 'data', 'sample-b.csv'), 'tampered restore\n');
    const restoredAfterTamper = verifyBaselineBag({ bagDir, dataDir: restoreDir });
    assert.equal(restoredAfterTamper.ok, false);
    assert.equal(restoredAfterTamper.mismatches[0].path, 'data/sample-b.csv');
  });

  it('rejects a hand-edited manifest line pointing outside the payload directory', () => {
    const files = resolveBaselineFiles(root, fixtureCategories);
    const bagDir = freshDir('outside-payload');
    buildBaselineBag({
      repoRoot: root, outputDir: bagDir, files, commitInfo: fixtureCommitInfo,
    });

    const manifestPath = path.join(bagDir, 'manifest-sha256.txt');
    const rewritten = fs
      .readFileSync(manifestPath, 'utf8')
      .replace(/ {2}data\/data\/sample-a\.csv$/m, '  sample-a.csv');
    fs.writeFileSync(manifestPath, rewritten);

    assert.throws(
      () => verifyBaselineBag({ bagDir }),
      (err) => err instanceof BaselineManifestError && /payload data\/ directory/.test(err.message),
    );
  });

  it('rejects a missing manifest file', () => {
    const bagDir = freshDir('no-manifest');
    assert.throws(
      () => verifyBaselineBag({ bagDir }),
      (err) => err instanceof BaselineManifestError && /no manifest-sha256\.txt/.test(err.message),
    );
  });
});

describe('CLI wrappers', () => {
  it('runCreateBaseline rejects an unknown flag', () => {
    assert.throws(
      () => runCreateBaseline(root, ['--bogus']),
      (err) => err instanceof BaselineManifestError && /unknown argument/.test(err.message),
    );
  });

  it('runVerifyBaseline requires a bag directory argument', () => {
    assert.throws(
      () => runVerifyBaseline([]),
      (err) => err instanceof BaselineManifestError && /usage:/.test(err.message),
    );
  });

  it('creates a real baseline bag from this repository and verifies it end to end', () => {
    const outputDir = freshDir('real-repo-cli');
    fs.rmSync(outputDir, { recursive: true, force: true });
    const created = runCreateBaseline(realRepoRoot, ['--output', outputDir]);

    assert.equal(created.outputDir, outputDir);
    assert.ok(created.manifest.totalFiles > 0);
    assert.equal(created.commitInfo.requestedCommitExists, false);

    const verified = runVerifyBaseline([outputDir]);
    assert.equal(verified.result.ok, true);
    assert.equal(verified.result.checkedFiles, created.manifest.totalFiles);
  });
});
