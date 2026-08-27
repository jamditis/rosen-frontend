#!/usr/bin/env node
// Verify a baseline bag produced by preservation/create-baseline-manifest.mjs
// (#702). Recomputes the SHA-256 of every payload and tag file and compares
// it against the digest recorded in manifest-sha256.txt /
// tagmanifest-sha256.txt, printing every mismatch or missing file. Exits
// non-zero on any failure. See preservation/BASELINE.md for the restore
// procedure this command backs.
//
// Usage:
//   node preservation/verify-baseline-manifest.mjs <bag-directory>
//   node preservation/verify-baseline-manifest.mjs <bag-directory> --restore-root <checkout-dir>
//   npm run baseline:verify -- <bag-directory>
//
// --restore-root checks a restored checkout held somewhere other than
// <bag-directory>/data — its value is the checkout ROOT (for example a fresh
// clone), not a data/ directory: the repository-relative "data/..." path is
// re-joined onto whatever you pass, the same as BASELINE.md's restore step 5.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BaselineManifestError, verifyBaselineBag } from './baseline-manifest-lib.mjs';

function parseArgs(argv) {
  let bagDir = null;
  let restoreRoot = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--restore-root') {
      if (i + 1 >= argv.length) throw new BaselineManifestError(`"${arg}" requires a value (usage: ${arg} <dir>)`);
      restoreRoot = argv[i + 1];
      i += 1;
    } else if (!bagDir) {
      bagDir = arg;
    } else {
      throw new BaselineManifestError(`unknown argument "${arg}"`);
    }
  }
  if (!bagDir) {
    throw new BaselineManifestError('usage: verify-baseline-manifest.mjs <bag-directory> [--restore-root <dir>]');
  }
  return { bagDir: path.resolve(bagDir), restoreRoot: restoreRoot ? path.resolve(restoreRoot) : undefined };
}

export function runVerifyBaseline(argv) {
  const { bagDir, restoreRoot } = parseArgs(argv);
  const result = verifyBaselineBag({ bagDir, dataDir: restoreRoot });
  return { bagDir, restoreRoot, result };
}

function main(argv) {
  const { bagDir, restoreRoot, result } = runVerifyBaseline(argv);

  console.log(`baseline: checked ${result.checkedFiles} payload file(s) in ${restoreRoot ?? path.join(bagDir, 'data')}`);
  for (const entry of result.missing) console.error(`baseline: MISSING ${entry}`);
  for (const entry of result.mismatches) {
    console.error(`baseline: MISMATCH ${entry.path} — expected ${entry.expectedSha256}, got ${entry.actualSha256}`);
  }
  if (!result.tag.ok) {
    for (const entry of result.tag.missing ?? []) console.error(`baseline: MISSING tag file ${entry}`);
    for (const entry of result.tag.mismatches ?? []) {
      console.error(`baseline: MISMATCH tag file ${entry.path} — expected ${entry.expectedSha256}, got ${entry.actualSha256}`);
    }
    if (result.tag.error) console.error(`baseline: ${result.tag.error}`);
  }
  if (result.oxum && !result.oxum.ok) {
    console.error(
      `baseline: PAYLOAD COUNT MISMATCH — bag-info.txt records ${result.oxum.expected.count} file(s) / `
      + `${result.oxum.expected.octets} byte(s), the payload directory actually has `
      + `${result.oxum.actual.count} file(s) / ${result.oxum.actual.bytes} byte(s) `
      + '(an extra or missing file outside the manifest, most likely)',
    );
  }

  if (result.ok) {
    console.log('baseline: OK — every payload and tag file matches its recorded SHA-256 digest');
  } else {
    console.error('baseline: FAILED — see mismatches above');
    process.exitCode = 1;
  }
}

// Run the CLI only when invoked directly, not when imported by a test.
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(`baseline: ${err.message}`);
    process.exitCode = 1;
  }
}
