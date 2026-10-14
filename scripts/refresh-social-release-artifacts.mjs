#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { refreshRelationshipTypeCensus } from '../data/lib/graph-policy-refresh.js';
import {
  buildEndpointReviewReport,
  loadRepositoryGraphDataset,
  readCanonicalCsv,
  validateGraphDataset,
} from './validate-graph-data.mjs';

const execFileAsync = promisify(execFile);
const THREAD_ID_PATTERN = /^THREAD-\d{5}$/;
const BSKY_ID_PATTERN = /^BSKY-\d{5,}$/;
const JAY_BLUESKY_POST_PATTERN = /^https:\/\/bsky\.app\/profile\/jayrosen\.bsky\.social\/post\/([^/?#]+)\/?$/;
const CAPTURE_NOTE_PATTERN = /app\.bsky\.feed\.(?:getAuthorFeed|getPosts|getPostThread)|source[- ]verified|public API/i;

const text = value => (value == null ? '' : String(value).trim());

function sourcePostRkey(row) {
  return JAY_BLUESKY_POST_PATTERN.exec(text(row?.url))?.[1] ?? null;
}

function parentRkey(row) {
  const respondsTo = text(row?.responds_to);
  return respondsTo ? respondsTo.split('/').pop() : null;
}

/** Validate the source rows that justify one generated thread container. */
export function assertJayGeneratedThreadEvidence(
  record,
  socialRowById,
  newlyCapturedRecordIds = new Set(),
) {
  const threadId = text(record?.id);
  if (!THREAD_ID_PATTERN.test(threadId)) {
    throw new Error(`${threadId || 'generated record'}: only canonical THREAD records can be registered`);
  }
  if (record?.type !== 'social' || record?.author !== 'Jay Rosen' || record?.pub !== 'Bluesky') {
    throw new Error(`${threadId}: generated record is not a Jay Rosen Bluesky thread`);
  }
  const posts = record?.thread_data?.posts;
  if (!Array.isArray(posts) || posts.length < 3) {
    throw new Error(`${threadId}: generated thread must contain at least three source posts`);
  }
  const rootId = text(record?.thread_data?.thread_id);
  if (!rootId || text(posts[0]?.id) !== rootId) {
    throw new Error(`${threadId}: thread root does not match its first source post`);
  }
  const postIds = new Set();
  const rkeyByPostId = new Map();
  let verifiedMembers = 0;

  for (const [index, post] of posts.entries()) {
    const postId = text(post?.id);
    if (!postId || postIds.has(postId)) {
      throw new Error(`${threadId}: generated thread contains an empty or duplicate source post ID`);
    }
    postIds.add(postId);
    const source = socialRowById.get(postId);
    if (!source) throw new Error(`${threadId}: source row ${postId} is missing`);
    if (text(source.author).toLowerCase() !== 'jay rosen') {
      throw new Error(`${threadId}: ${postId} is not sourced to Jay Rosen`);
    }
    if (text(source.platform) !== 'Bluesky') {
      throw new Error(`${threadId}: ${postId} is not a Bluesky source row`);
    }
    const rkey = sourcePostRkey(source);
    if (!rkey) throw new Error(`${threadId}: ${postId} has no canonical Jay Rosen Bluesky URL`);
    rkeyByPostId.set(postId, rkey);
    if (text(post.url) !== text(source.url)) {
      throw new Error(`${threadId}: ${postId} runtime URL does not match its source row`);
    }
    const sourceContent = text(source.raw_text || source.excerpt);
    if (!sourceContent || text(post.content) !== sourceContent) {
      throw new Error(`${threadId}: ${postId} runtime text does not match its source row`);
    }
    if (text(source.permissions) !== 'Public Post' || !text(source.date_processed)) {
      throw new Error(`${threadId}: ${postId} lacks public capture provenance`);
    }
    if (
      newlyCapturedRecordIds.has(postId)
      && !CAPTURE_NOTE_PATTERN.test(text(source.notes))
    ) {
      throw new Error(`${threadId}: ${postId} lacks named source-capture provenance`);
    }
    const verification = text(source.verified).toUpperCase();
    if (verification !== 'TRUE' && verification !== 'FALSE') {
      throw new Error(`${threadId}: ${postId} has no source verification state`);
    }
    if (verification === 'TRUE') verifiedMembers += 1;

    if (index === 0) {
      if (post.parent_id != null) {
        throw new Error(`${threadId}: root ${postId} unexpectedly has a parent`);
      }
      if (text(record.url) !== text(source.url)) {
        throw new Error(`${threadId}: container URL does not match root ${postId}`);
      }
      continue;
    }

    const parentId = text(post.parent_id);
    if (!postIds.has(parentId)) {
      throw new Error(`${threadId}: ${postId} does not name an earlier source member as parent`);
    }
    if (parentRkey(source) !== rkeyByPostId.get(parentId)) {
      throw new Error(`${threadId}: ${postId} source response does not match parent ${parentId}`);
    }
  }

  if (verifiedMembers === 0) {
    throw new Error(`${threadId}: generated thread has no admitted source member`);
  }
}

/**
 * Add exceptions only for new published thread containers whose member chain is
 * fully supported by the canonical Jay Rosen Bluesky source rows.
 */
export function registerSourceSupportedGeneratedThreads(
  holdPolicy,
  { publishedRecords, archiveRows, socialRows, newlyCapturedRecordIds = new Set() },
) {
  const policy = structuredClone(holdPolicy);
  if (!Array.isArray(policy.generatedPublishedRecordIds)) {
    throw new Error('graph hold policy has no generatedPublishedRecordIds array');
  }
  const registered = new Set(policy.generatedPublishedRecordIds);
  const sourceIds = new Set([...archiveRows, ...socialRows].map(row => text(row.id)).filter(Boolean));
  const socialRowById = new Map(socialRows.map(row => [text(row.id), row]));
  if (!(newlyCapturedRecordIds instanceof Set)) {
    throw new Error('newlyCapturedRecordIds must be a Set');
  }
  for (const recordId of newlyCapturedRecordIds) {
    if (!BSKY_ID_PATTERN.test(recordId) || !socialRowById.has(recordId)) {
      throw new Error(`newly captured source row ${recordId} is not canonical`);
    }
  }
  const candidates = publishedRecords
    .filter(record => !sourceIds.has(text(record.id)) && !registered.has(text(record.id)))
    .sort((left, right) => text(left.id).localeCompare(text(right.id)));
  const added = [];
  for (const record of candidates) {
    assertJayGeneratedThreadEvidence(record, socialRowById, newlyCapturedRecordIds);
    policy.generatedPublishedRecordIds.push(record.id);
    registered.add(record.id);
    added.push(record.id);
  }
  return { policy, added };
}

export function newlyCapturedRecordIdsFromReport(report) {
  if (report?.schema_version !== 1 || !Array.isArray(report?.decisions)) {
    throw new Error('Bluesky batch report does not match schema version 1');
  }
  if (report?.canonical?.rows_appended !== report.decisions.length) {
    throw new Error('Bluesky batch report decisions do not match appended rows');
  }
  const recordIds = new Set();
  for (const decision of report.decisions) {
    const recordId = text(decision?.record_id);
    if (!BSKY_ID_PATTERN.test(recordId) || recordIds.has(recordId)) {
      throw new Error('Bluesky batch report has an invalid or duplicate record ID');
    }
    recordIds.add(recordId);
  }
  return recordIds;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function runArchiveExporter(repositoryRoot) {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [path.join(repositoryRoot, 'data/export-archive-data.js')],
    { cwd: repositoryRoot, maxBuffer: 16 * 1024 * 1024 },
  );
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

export async function refreshSocialReleaseArtifacts(
  repositoryRoot,
  { asOfDate, batchReportPath, runExporter = runArchiveExporter } = {},
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate || '')) {
    throw new Error('refresh social artifacts: asOfDate must use YYYY-MM-DD');
  }
  const root = path.resolve(repositoryRoot);
  const newlyCapturedRecordIds = batchReportPath
    ? newlyCapturedRecordIdsFromReport(await readJson(path.resolve(batchReportPath)))
    : new Set();
  await runExporter(root);

  const dataPath = (...parts) => path.join(root, 'data', ...parts);
  const [
    archiveRows,
    socialRows,
    relationshipRows,
    entityRows,
    archiveData,
    holdPolicy,
    relationshipTypeRegistry,
  ] = await Promise.all([
    readCanonicalCsv(dataPath('archive_records-public.csv')),
    readCanonicalCsv(dataPath('social_posts.csv')),
    readCanonicalCsv(dataPath('extracted_relationships.csv')),
    readCanonicalCsv(dataPath('extracted_entities.csv')),
    readJson(dataPath('archive-data.json')),
    readJson(dataPath('graph-validation-holds.json')),
    readJson(dataPath('relationship-type-registry.json')),
  ]);

  const registration = registerSourceSupportedGeneratedThreads(holdPolicy, {
    publishedRecords: archiveData.records,
    archiveRows,
    socialRows,
    newlyCapturedRecordIds,
  });
  const census = refreshRelationshipTypeCensus(structuredClone(relationshipTypeRegistry), {
    relationshipRows,
    entityRows,
    asOfDate,
  });
  if (census.problems.length > 0) {
    throw new Error(`refresh social artifacts: relationship census needs review: ${census.problems.join('; ')}`);
  }

  const dataset = await loadRepositoryGraphDataset(root);
  dataset.policy.generatedPublishedRecordIds = registration.policy.generatedPublishedRecordIds;
  dataset.policy.relationshipTypeHolds = registration.policy.relationshipTypeHolds;
  dataset.policy.duplicateEdgeExceptions = registration.policy.duplicateEdgeExceptions;
  dataset.policy.relationshipTypeRegistry = census.registry.types;
  const validation = await validateGraphDataset(dataset);
  const reviewReport = buildEndpointReviewReport(validation.endpointReviewRows);

  await Promise.all([
    writeFile(
      dataPath('graph-validation-holds.json'),
      `${JSON.stringify(registration.policy, null, 2)}\n`,
      'utf8',
    ),
    writeFile(
      dataPath('relationship-type-registry.json'),
      `${JSON.stringify(census.registry, null, 2)}\n`,
      'utf8',
    ),
    writeFile(
      dataPath('relationship-review-report.json'),
      `${JSON.stringify(reviewReport, null, 2)}\n`,
      'utf8',
    ),
  ]);

  return {
    generatedThreadsAdded: registration.added,
    censusChanges: census.changes,
    graph: validation,
  };
}

function parseArgs(argv) {
  if (
    ![2, 4].includes(argv.length)
    || argv[0] !== '--as-of'
    || (argv.length === 4 && argv[2] !== '--report')
  ) {
    throw new Error(
      'usage: node scripts/refresh-social-release-artifacts.mjs '
      + '--as-of YYYY-MM-DD [--report PATH]',
    );
  }
  return { asOfDate: argv[1], batchReportPath: argv[3] };
}

async function main() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = await refreshSocialReleaseArtifacts(repositoryRoot, parseArgs(process.argv.slice(2)));
  console.log(
    `Social release artifacts refreshed: ${result.generatedThreadsAdded.length} generated threads registered, `
    + `${result.censusChanges.length} census changes, ${result.graph.publishedRecords} published records validated.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
