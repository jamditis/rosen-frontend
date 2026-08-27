#!/usr/bin/env node
// Freeze and checksum a baseline snapshot of the archive data, so slow
// per-object preservation work has an immutable, independently verifiable
// starting point (#702).
//
// Packages the source CSVs, generated runtime JSON, entity/relationship
// data, and schema files listed in preservation/baseline-manifest-lib.mjs
// BASELINE_CATEGORIES into a BagIt-compatible directory: bagit.txt,
// bag-info.txt, manifest-sha256.txt, tagmanifest-sha256.txt, and a
// baseline-manifest.json that spells out per-file byte size next to the
// SHA-256 digest. See preservation/BASELINE.md for the full create / verify /
// restore procedure and the parts of the original request this tool does not
// cover on its own (two off-repo storage copies).
//
// Usage:
//   node preservation/create-baseline-manifest.mjs [--output <dir>]
//   npm run baseline:create -- --output <dir>
//
// With no --output, writes to a fresh directory under the OS temp folder, so
// a baseline is never accidentally committed to the frontend git history —
// large or generated artifacts belong outside normal git history, not in it.

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BaselineManifestError,
  buildBaselineBag,
  computeCommitProvenance,
  resolveBaselineFiles,
} from './baseline-manifest-lib.mjs';

function parseArgs(argv) {
  let outputDir = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--output' || arg === '-o') {
      outputDir = argv[i + 1];
      i += 1;
    } else {
      throw new BaselineManifestError(`unknown argument "${arg}" (usage: --output <dir>)`);
    }
  }
  return { outputDir };
}

function defaultOutputDir() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(os.tmpdir(), `rosen-archive-baseline-${stamp}`);
}

export function runCreateBaseline(repoRoot, argv) {
  const { outputDir } = parseArgs(argv);
  const resolvedOutputDir = outputDir ? path.resolve(outputDir) : defaultOutputDir();

  const files = resolveBaselineFiles(repoRoot);
  const commitInfo = computeCommitProvenance(repoRoot);
  const manifest = buildBaselineBag({
    repoRoot, outputDir: resolvedOutputDir, files, commitInfo,
  });

  return { outputDir: resolvedOutputDir, manifest, commitInfo };
}

function main(repoRoot, argv) {
  const { outputDir, manifest, commitInfo } = runCreateBaseline(repoRoot, argv);

  console.log(`baseline: wrote ${manifest.totalFiles} file(s), ${manifest.totalBytes} byte(s) to ${outputDir}`);
  console.log(`baseline: commit ${manifest.commit}`);
  console.log(`baseline: ${commitInfo.note}`);
  if (manifest.sourceTreeStatus === 'dirty') {
    console.warn(
      'baseline: warning — the working tree has uncommitted changes; this baseline reflects the files '
      + 'on disk right now, not a clean commit',
    );
  }
  console.log(`baseline: verify with \`node preservation/verify-baseline-manifest.mjs ${outputDir}\``);
  console.log(
    'baseline: this directory is a single local copy. Per preservation/BASELINE.md, copy it to at least '
    + 'two storage locations outside this git working tree before treating it as durable.',
  );
}

// Run the CLI only when invoked directly, not when imported by a test.
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    main(repoRoot, process.argv.slice(2));
  } catch (err) {
    console.error(`baseline: ${err.message}`);
    process.exitCode = 1;
  }
}
