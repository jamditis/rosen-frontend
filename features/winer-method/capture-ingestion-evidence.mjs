#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { RECORDS } from './data.js';

const execFileAsync = promisify(execFile);
const ingestionPath = new URL('./ingestion-log.json', import.meta.url);
const evidencePath = new URL('./retrieval-evidence.json', import.meta.url);
const CAPTURE_TOOL = 'capture-ingestion-evidence.mjs@1';

const OBSERVATIONS = Object.freeze({
  'direct-2001-desktop-websites': {
    sourceTitle: 'My Blog on the Desktop',
    dateObserved: 'January 18, 2001 archive entry',
    creatorObserved: 'Dave Winer',
  },
  'direct-2004-bloggers-sources': {
    sourceTitle: 'Archive: August 2004',
    dateObserved: 'August 10, 2004 entry at 3:28:15 PM Eastern',
    creatorObserved: 'Dave Winer',
  },
  'direct-2009-flying-seminar': {
    sourceTitle: 'Rosen’s Flying Seminar In The Future of News',
    dateObserved: '26 March 2009 article date',
    creatorObserved: 'Jay Rosen',
  },
  'direct-2009-tech-heroes': {
    sourceTitle: 'Tech heroes who blog?',
    dateObserved: '15 May 2009 post date',
    creatorObserved: 'Dave Winer',
  },
  'direct-2013-networked-beat': {
    sourceTitle: 'Designs for a Networked Beat',
    dateObserved: '13 May 2013 article date and lecture description',
    creatorObserved: 'Jay Rosen',
  },
  'direct-2013-motto': {
    sourceTitle: 'About Scripting News',
    dateObserved: 'August 4, 2013 page creation date supplied by the author',
    creatorObserved: 'Dave Winer',
  },
  'direct-2016-github-archive': {
    sourceTitle: 'scripting/Scripting-News',
    dateObserved: 'June 2, 2016 initial repository commit',
    creatorObserved: 'Dave Winer',
  },
  'direct-2017-source-namespace': {
    sourceTitle: 'The “source” namespace',
    dateObserved: 'October 2, 2017 posting date supplied by the specification',
    creatorObserved: 'Dave Winer',
  },
  'direct-2023-feedland': {
    sourceTitle: 'scripting/feedland',
    dateObserved: 'April 24, 2023 public-source announcement recorded in the README',
    creatorObserved: 'Dave Winer and contributors',
  },
  'direct-2024-social-blogroll': {
    sourceTitle: 'blogroll.social',
    dateObserved: 'February 14, 2024 first public toolkit commit',
    creatorObserved: 'Dave Winer',
  },
  'direct-2026-community-news': {
    sourceTitle: 'The reboot that news needs',
    dateObserved: 'February 7, 2026 dated permalink',
    creatorObserved: 'Dave Winer',
  },
});

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function digest(value) {
  const bytes = Buffer.isBuffer(value)
    ? value
    : Buffer.from(JSON.stringify(canonicalize(value)));
  return createHash('sha256').update(bytes).digest('hex');
}

async function retrieveWithFetch(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'RosenArchiveMethodEvidence/1.0 (+https://pressthink.org/j/rosen-archive/)' },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') || 'unknown',
    finalUrl: response.url,
    httpStatus: response.status,
    retrievalClient: 'node-fetch',
  };
}

async function retrieveWithCurl(url) {
  const separator = '\nROSEN_EVIDENCE_META:';
  const { stdout } = await execFileAsync('curl', [
    '--compressed', '--fail', '--http1.1', '--location', '--retry', '5', '--silent', '--show-error',
    '--user-agent', 'RosenArchiveMethodEvidence/1.0 (+https://pressthink.org/j/rosen-archive/)',
    '--write-out', `${separator}%{http_code}\t%{url_effective}\t%{content_type}`,
    url,
  ], { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024, timeout: 90_000 });
  const marker = Buffer.from(separator);
  const markerIndex = stdout.lastIndexOf(marker);
  if (markerIndex < 0) throw new Error('curl response metadata was missing');
  const [status, finalUrl, contentType] = stdout.subarray(markerIndex + marker.length).toString().split('\t');
  return {
    body: stdout.subarray(0, markerIndex),
    contentType: contentType || 'unknown',
    finalUrl,
    httpStatus: Number(status),
    retrievalClient: 'curl-http1.1-fallback',
  };
}

async function retrieve(url) {
  const parsed = new URL(url);
  if (parsed.protocol === 'https:' && /(^|\.)scripting\.com$/.test(parsed.hostname)) {
    parsed.protocol = 'http:';
    const response = await retrieveWithCurl(parsed.href);
    return { ...response, retrievalClient: `${response.retrievalClient}-http-transport-fallback` };
  }
  try {
    return await retrieveWithFetch(url);
  } catch {
    return retrieveWithCurl(url);
  }
}

function normalizedEvidence(record, logRecord) {
  const observation = OBSERVATIONS[record.id];
  if (!observation) throw new Error(`Missing supervised observation for ${record.id}`);
  return {
    id: record.id,
    retrievalUrl: logRecord.retrievalUrl,
    sourceLocator: logRecord.sourceLocator,
    observations: observation,
    fieldMapping: {
      sourceTitle: 'observations.sourceTitle → record.sourceTitle',
      publicationDate: 'observations.dateObserved + ingestion-log dateBasis → record.date',
      creator: 'observations.creatorObserved → record.creator',
      editorialFields: 'source body + named locator → curator-authored record.title, summary, themes, entities, and evidence',
    },
    normalizedRecordSha256: digest(record),
  };
}

async function capture() {
  const ingestion = JSON.parse(await readFile(ingestionPath, 'utf8'));
  const logById = new Map(ingestion.records.map((record) => [record.id, record]));
  const records = [];
  for (const record of RECORDS) {
    const logRecord = logById.get(record.id);
    if (!logRecord) throw new Error(`Missing ingestion record for ${record.id}`);
    const response = await retrieve(logRecord.retrievalUrl);
    records.push({
      ...normalizedEvidence(record, logRecord),
      retrieval: {
        capturedAt: new Date().toISOString(),
        finalUrl: response.finalUrl,
        httpStatus: response.httpStatus,
        contentType: response.contentType,
        byteLength: response.body.byteLength,
        responseSha256: digest(response.body),
        client: response.retrievalClient,
      },
    });
  }
  const artifact = {
    schemaVersion: 1,
    captureTool: CAPTURE_TOOL,
    captureMode: 'offline curator-supervised retrieval with immutable response and normalized-record digests',
    recordSource: './data.js',
    runtimeNetworkAccess: false,
    records,
  };
  await writeFile(evidencePath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`Captured ${records.length} retrievals in ${fileURLToPath(evidencePath)}`);
}

async function verify() {
  const ingestion = JSON.parse(await readFile(ingestionPath, 'utf8'));
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  const logById = new Map(ingestion.records.map((record) => [record.id, record]));
  const evidenceById = new Map(evidence.records.map((record) => [record.id, record]));
  if (evidence.captureTool !== CAPTURE_TOOL) throw new Error('Capture tool version does not match');
  if (evidence.records.length !== RECORDS.length) throw new Error('Evidence record count does not match');
  for (const record of RECORDS) {
    const stored = evidenceById.get(record.id);
    if (!stored) throw new Error(`Missing retrieval evidence for ${record.id}`);
    const logRecord = logById.get(record.id);
    if (!logRecord) throw new Error(`Missing ingestion record for ${record.id}`);
    const expected = normalizedEvidence(record, logRecord);
    for (const field of ['id', 'retrievalUrl', 'sourceLocator', 'observations', 'fieldMapping', 'normalizedRecordSha256']) {
      if (digest(stored[field]) !== digest(expected[field])) {
        throw new Error(`Normalization evidence field "${field}" drifted for ${record.id}; recapture after verifying the source`);
      }
    }
    if (!/^[a-f0-9]{64}$/.test(stored.retrieval.responseSha256) || stored.retrieval.byteLength < 1) {
      throw new Error(`Invalid response evidence for ${record.id}`);
    }
  }
  console.log(`Verified ${RECORDS.length} stored retrieval and normalization evidence records`);
}

if (process.argv.includes('--verify')) await verify();
else await capture();
