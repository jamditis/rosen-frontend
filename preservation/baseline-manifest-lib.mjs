// Shared logic for the archive baseline snapshot tool (#702).
//
// A baseline is a BagIt-compatible directory that freezes the source CSVs,
// generated runtime JSON, entity/relationship data, and schema files on disk
// at some point in time, with a SHA-256 digest and byte size recorded for
// every included file. preservation/create-baseline-manifest.mjs builds one;
// preservation/verify-baseline-manifest.mjs checks one against its recorded
// digests. See preservation/BASELINE.md for the full walkthrough and the
// parts of the original request this tool does not cover.
//
// This file holds pure, test-friendly functions. Both CLI scripts are thin
// argv/console wrappers around what is exported here.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export class BaselineManifestError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'BaselineManifestError';
  }
}

// The commit named in issue #702's acceptance criteria. It does exist in this
// repository (checked with `git cat-file -e` below) — see
// preservation/BASELINE.md for why this tool still pins the current HEAD
// commit instead of that older one, and what it records about that choice.
export const ACCEPTANCE_CRITERIA_COMMIT = '43bb423';

// Why this tool pins the current HEAD commit instead of building a baseline
// of ACCEPTANCE_CRITERIA_COMMIT's tree, even though that commit exists. Two
// checkable facts drive this: the relationship-adjacency shard files in
// BASELINE_CATEGORIES were added to the repository after that commit (they
// do not exist in its tree), and the source CSVs have changed in dozens of
// commits since. A baseline of the older commit's tree would both miss files
// this tool is supposed to cover and freeze stale CSV content. See
// preservation/BASELINE.md for how to re-check these facts.
export const DEFAULT_PIN_JUSTIFICATION = 'the requested commit predates the relationship-adjacency shard files '
  + 'this baseline covers, and its source CSVs are dozens of commits behind the current data; pinning HEAD '
  + 'captures the complete, current category list instead of an incomplete historical one.';

export const TOOL_VERSION = '1.0.0';

export const DEFAULT_DESCRIPTION =
  "Frozen baseline snapshot of Jay Rosen's Internet Archive source data: source CSVs, "
  + 'generated runtime JSON, entity and relationship data, and schema files.';

// Every path is relative to the repository root. Grouped to match the four
// content groups named in issue #702's scope. Keep this list in sync with
// data/README.md and the CLAUDE.md data tables — resolveBaselineFiles() fails
// loudly instead of silently skipping a file if one of these paths moves.
//
// This list must also stay a superset of every file individually listed in
// backend/scripts/deploy_full_site.py _DEPLOY_DATA_FILES (the files the live
// site actually ships), or list the omission with a reason next to
// KNOWN_NOT_BASELINED in tests/baseline-manifest.test.js. That test fails the
// build the same way tests/deploy-data-manifest.test.js does for #527: a new
// deployed data file must be a deliberate include-or-exclude decision here,
// not a silent gap a baseline quietly stops covering.
const RELATIONSHIP_ADJACENCY_SHARDS = [
  ...'0123456789abcdef',
].map((hex) => `data/relationship-adjacency-${hex}.json`);

export const BASELINE_CATEGORIES = [
  {
    id: 'source-csv',
    description: 'Source CSV files curators maintain directly.',
    paths: [
      'data/archive_records-public.csv',
      'data/social_posts.csv',
    ],
  },
  {
    id: 'runtime-json',
    description: 'Generated runtime data the frontend loads, rebuilt by data/export-archive-data.js and the '
      + 'other data/*.js build scripts (search indexes, analytics, embeddings, wiki seed data).',
    paths: [
      'data/archive-core.json',
      'data/archive-details.json',
      'data/archive-data.json',
      'data/archive-analytics.json',
      'data/search-index.json',
      'data/social-search-index.json',
      'data/archive-embeddings.bin',
      'data/archive-embeddings.json',
      'data/wiki-seed.json',
    ],
  },
  {
    id: 'entity-relationship-data',
    description: 'Extracted entities, relationships, and the entity/relationship graph derived from them.',
    paths: [
      'data/extracted_entities.csv',
      'data/extracted_relationships.csv',
      'data/archive-entities.json',
      'data/relationship-adjacency-manifest.json',
      ...RELATIONSHIP_ADJACENCY_SHARDS,
    ],
  },
  {
    id: 'schema',
    description: 'The schema and reference files the export pipeline and frontend agree on.',
    paths: [
      'data/schema.json',
      'data/SCHEMA.md',
      'data/eras.js',
    ],
  },
];

function sha256FileSync(absolutePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(absolutePath));
  return hash.digest('hex');
}

// Walk BASELINE_CATEGORIES (or a caller-supplied override, for tests) against
// repoRoot and return a flat, path-sorted file list. Throws instead of
// skipping when a configured path is missing or is not a regular file, so a
// renamed or deleted data file surfaces immediately rather than quietly
// shrinking the baseline.
export function resolveBaselineFiles(repoRoot, categories = BASELINE_CATEGORIES) {
  const files = [];
  for (const category of categories) {
    for (const relativePath of category.paths) {
      const absolutePath = path.join(repoRoot, relativePath);
      if (!fs.existsSync(absolutePath)) {
        throw new BaselineManifestError(
          `configured baseline path "${relativePath}" (category "${category.id}") does not exist under `
          + `${repoRoot}. Update preservation/baseline-manifest-lib.mjs BASELINE_CATEGORIES if the file `
          + 'moved, was renamed, or was retired.',
        );
      }
      if (!fs.statSync(absolutePath).isFile()) {
        throw new BaselineManifestError(`configured baseline path "${relativePath}" is not a regular file`);
      }
      files.push({ category: category.id, relativePath, absolutePath });
    }
  }
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return files;
}

// Resolve the commit this baseline pins, plus the documented status of the
// commit named in the issue's acceptance criteria. `execFile` is injectable
// for tests; it defaults to a real `git` call.
//
// When the requested commit exists, pinning HEAD instead of it is a
// deliberate choice, not a fallback — this function requires and records a
// non-empty `pinJustification` string for that case, so a baseline never
// silently pins a different commit than the one named in the acceptance
// criteria without a documented reason. Callers that always want the
// project's standard reasoning should pass `DEFAULT_PIN_JUSTIFICATION`.
export function computeCommitProvenance(
  repoRoot,
  {
    requestedCommit = ACCEPTANCE_CRITERIA_COMMIT,
    execFile = execFileSync,
    pinJustification = null,
  } = {},
) {
  let commit;
  try {
    commit = execFile('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }).toString().trim();
  } catch (err) {
    throw new BaselineManifestError(`unable to resolve the current git commit: ${err.message}`);
  }

  let requestedCommitExists = false;
  try {
    execFile('git', ['cat-file', '-e', `${requestedCommit}^{commit}`], { cwd: repoRoot, stdio: 'ignore' });
    requestedCommitExists = true;
  } catch {
    requestedCommitExists = false;
  }

  if (requestedCommitExists && (!pinJustification || !pinJustification.trim())) {
    throw new BaselineManifestError(
      `acceptance criteria commit ${requestedCommit} exists in this repository, so pinning HEAD (${commit}) `
      + 'instead requires an explicit pinJustification string explaining why. Pass DEFAULT_PIN_JUSTIFICATION '
      + 'or a specific reason.',
    );
  }

  let gitStatus = null;
  try {
    const porcelain = execFile('git', ['status', '--porcelain'], { cwd: repoRoot }).toString();
    gitStatus = porcelain.trim() === '' ? 'clean' : 'dirty';
  } catch {
    gitStatus = null;
  }

  const note = requestedCommitExists
    ? `Acceptance criteria commit ${requestedCommit} exists in this repository. This baseline pins the `
      + `current HEAD (${commit}) instead. Reason: ${pinJustification}`
    : `Acceptance criteria commit ${requestedCommit} does not exist in this repository's history `
      + `(checked with \`git cat-file -e\`). Recording the current reviewed HEAD commit ${commit} instead. `
      + 'See preservation/BASELINE.md for the full discrepancy note.';

  return {
    commit,
    requestedCommit,
    requestedCommitExists,
    gitStatus,
    pinJustification: requestedCommitExists ? pinJustification : null,
    note,
  };
}

// Build a BagIt-compatible bag at outputDir: a data/ payload directory with a
// copy of every resolved file, plus bagit.txt, bag-info.txt,
// manifest-sha256.txt, tagmanifest-sha256.txt, and a baseline-manifest.json
// that spells out per-file byte size alongside the SHA-256 digest already in
// manifest-sha256.txt. outputDir must not already exist or must be empty —
// this tool never overwrites an existing baseline.
export function buildBaselineBag({
  repoRoot,
  outputDir,
  files,
  commitInfo,
  generatedAt = new Date(),
  toolVersion = TOOL_VERSION,
  description = DEFAULT_DESCRIPTION,
  categories = BASELINE_CATEGORIES,
}) {
  if (fs.existsSync(outputDir) && fs.readdirSync(outputDir).length > 0) {
    throw new BaselineManifestError(`refusing to write into a non-empty output directory: ${outputDir}`);
  }
  fs.mkdirSync(outputDir, { recursive: true });

  const payloadRoot = path.join(outputDir, 'data');
  fs.mkdirSync(payloadRoot, { recursive: true });

  const fileEntries = [];
  let totalBytes = 0;
  for (const file of files) {
    const destPath = path.join(payloadRoot, file.relativePath);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(file.absolutePath, destPath);
    const bytes = fs.statSync(destPath).size;
    const sha256 = sha256FileSync(destPath);
    totalBytes += bytes;
    fileEntries.push({
      category: file.category, path: file.relativePath, bytes, sha256,
    });
  }
  fileEntries.sort((a, b) => a.path.localeCompare(b.path));

  const manifestText = `${fileEntries.map((entry) => `${entry.sha256}  data/${entry.path}`).join('\n')}\n`;
  fs.writeFileSync(path.join(outputDir, 'manifest-sha256.txt'), manifestText);

  fs.writeFileSync(path.join(outputDir, 'bagit.txt'), 'BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n');

  const generatedAtDate = generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
  const generatedAtIso = generatedAtDate.toISOString();
  const payloadOxum = `${totalBytes}.${fileEntries.length}`;

  const bagInfoLines = [
    "Source-Organization: Jay Rosen's Internet Archive",
    `External-Description: ${description}`,
    `Bagging-Date: ${generatedAtIso.slice(0, 10)}`,
    'Bag-Software-Agent: rosen-frontend preservation/create-baseline-manifest.mjs',
    `Source-Commit: ${commitInfo.commit}`,
    `Requested-Acceptance-Commit: ${commitInfo.requestedCommit}`,
    `Requested-Acceptance-Commit-Present: ${commitInfo.requestedCommitExists ? 'yes' : 'no'}`,
    `Source-Commit-Note: ${commitInfo.note}`,
    `Payload-Oxum: ${payloadOxum}`,
  ];
  if (commitInfo.gitStatus) bagInfoLines.push(`Source-Tree-Status: ${commitInfo.gitStatus}`);
  if (commitInfo.pinJustification) bagInfoLines.push(`Pin-Justification: ${commitInfo.pinJustification}`);
  fs.writeFileSync(path.join(outputDir, 'bag-info.txt'), `${bagInfoLines.join('\n')}\n`);

  // Derived from the files actually packaged, not from the full configured
  // category list — a fixture or partial build should never claim categories
  // it did not include.
  const categoryLookup = new Map(categories.map((category) => [category.id, category]));
  const packagedCategories = [...new Set(fileEntries.map((entry) => entry.category))]
    .sort()
    .map((id) => {
      const known = categoryLookup.get(id);
      return { id, description: known ? known.description : null };
    });

  const baselineManifest = {
    schemaVersion: '1.0.0',
    toolVersion,
    generatedAt: generatedAtIso,
    commit: commitInfo.commit,
    requestedAcceptanceCommit: commitInfo.requestedCommit,
    requestedAcceptanceCommitPresent: commitInfo.requestedCommitExists,
    commitNote: commitInfo.note,
    pinJustification: commitInfo.pinJustification ?? null,
    sourceTreeStatus: commitInfo.gitStatus ?? null,
    description,
    totalFiles: fileEntries.length,
    totalBytes,
    categories: packagedCategories,
    files: fileEntries,
  };
  fs.writeFileSync(
    path.join(outputDir, 'baseline-manifest.json'),
    `${JSON.stringify(baselineManifest, null, 2)}\n`,
  );

  const tagFiles = ['bagit.txt', 'bag-info.txt', 'manifest-sha256.txt', 'baseline-manifest.json'];
  const tagManifestText = `${tagFiles
    .map((name) => `${sha256FileSync(path.join(outputDir, name))}  ${name}`)
    .join('\n')}\n`;
  fs.writeFileSync(path.join(outputDir, 'tagmanifest-sha256.txt'), tagManifestText);

  return baselineManifest;
}

// Parse a BagIt manifest file's lines ("<sha256>  <path>") into entries.
function parseManifestLines(text, sourceLabel) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
      if (!match) {
        throw new BaselineManifestError(`malformed manifest line in ${sourceLabel}: "${line}"`);
      }
      return { sha256: match[1], path: match[2] };
    });
}

// Parse the "Payload-Oxum: <octets>.<count>" line bag-info.txt records at
// build time (see buildBaselineBag). Returns null when the line is absent
// instead of throwing, so a hand-built or legacy bag without one just skips
// the completeness check below rather than failing to verify at all.
function parsePayloadOxum(bagInfoText) {
  const match = /^Payload-Oxum:\s*(\d+)\.(\d+)$/m.exec(bagInfoText);
  if (!match) return null;
  return { octets: Number(match[1]), count: Number(match[2]) };
}

// Recursively count regular files and total bytes under rootDir. Returns
// zeros for a directory that does not exist, so a bag whose payload was
// deleted entirely is reported as a payload/manifest mismatch elsewhere
// rather than throwing here.
function walkFileStats(rootDir) {
  let count = 0;
  let bytes = 0;
  if (!fs.existsSync(rootDir)) return { count, bytes };
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile()) {
        count += 1;
        bytes += fs.statSync(entryPath).size;
      }
    }
  }
  return { count, bytes };
}

function verifyTagManifest(bagDir) {
  const tagManifestPath = path.join(bagDir, 'tagmanifest-sha256.txt');
  if (!fs.existsSync(tagManifestPath)) {
    return { ok: false, mismatches: [], missing: [], error: 'tagmanifest-sha256.txt not found' };
  }
  const entries = parseManifestLines(fs.readFileSync(tagManifestPath, 'utf8'), 'tagmanifest-sha256.txt');
  const mismatches = [];
  const missing = [];
  for (const entry of entries) {
    const filePath = path.join(bagDir, entry.path);
    if (!fs.existsSync(filePath)) {
      missing.push(entry.path);
      continue;
    }
    const actualSha256 = sha256FileSync(filePath);
    if (actualSha256 !== entry.sha256) {
      mismatches.push({ path: entry.path, expectedSha256: entry.sha256, actualSha256 });
    }
  }
  return { ok: mismatches.length === 0 && missing.length === 0, mismatches, missing };
}

// Verify a bag's payload files against manifest-sha256.txt, and its tag files
// against tagmanifest-sha256.txt. By default the payload is read from
// `<bagDir>/data`; pass `dataDir` to check a restored checkout root living
// somewhere else instead (see preservation/BASELINE.md's restore procedure).
//
// When verifying the bag in place (no `dataDir`), this also checks the
// payload directory's total file count and byte total against the
// Payload-Oxum recorded in bag-info.txt at build time. A per-file manifest
// walk alone only proves the files it lists are unchanged — it says nothing
// about a file that was added to the payload directory afterward and was
// never in the manifest to begin with. Oxum catches that: an extra or
// injected payload file changes the total count and byte sum, so it fails
// verification instead of passing silently. This check is skipped for a
// restored checkout (`dataDir` set), because a real checkout's data/
// directory legitimately holds many files the baseline never claimed to
// cover, and counting all of them would be a false positive, not a finding.
export function verifyBaselineBag({ bagDir, dataDir }) {
  const resolvedDataDir = dataDir ?? path.join(bagDir, 'data');
  const manifestPath = path.join(bagDir, 'manifest-sha256.txt');
  if (!fs.existsSync(manifestPath)) {
    throw new BaselineManifestError(`no manifest-sha256.txt found in ${bagDir}`);
  }
  const entries = parseManifestLines(fs.readFileSync(manifestPath, 'utf8'), 'manifest-sha256.txt');

  const mismatches = [];
  const missing = [];
  for (const entry of entries) {
    if (!entry.path.startsWith('data/')) {
      throw new BaselineManifestError(`manifest entry "${entry.path}" is not inside the payload data/ directory`);
    }
    const repoRelativePath = entry.path.slice('data/'.length);
    const filePath = path.join(resolvedDataDir, repoRelativePath);
    if (!fs.existsSync(filePath)) {
      missing.push(repoRelativePath);
      continue;
    }
    const actualSha256 = sha256FileSync(filePath);
    if (actualSha256 !== entry.sha256) {
      mismatches.push({ path: repoRelativePath, expectedSha256: entry.sha256, actualSha256 });
    }
  }

  const tag = verifyTagManifest(bagDir);

  let oxum = null;
  if (!dataDir) {
    const bagInfoPath = path.join(bagDir, 'bag-info.txt');
    const expected = fs.existsSync(bagInfoPath) ? parsePayloadOxum(fs.readFileSync(bagInfoPath, 'utf8')) : null;
    if (expected) {
      const actual = walkFileStats(path.join(resolvedDataDir, 'data'));
      oxum = {
        expected,
        actual,
        ok: actual.count === expected.count && actual.bytes === expected.octets,
      };
    }
  }

  return {
    ok: mismatches.length === 0 && missing.length === 0 && tag.ok && (oxum ? oxum.ok : true),
    checkedFiles: entries.length,
    mismatches,
    missing,
    tag,
    oxum,
  };
}
