#!/usr/bin/env node

import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import process from 'node:process';

export const LIVE_SITE_ROOT = 'https://pressthink.org/j/rosen-archive/';
export const DEFAULT_ARTIFACT_PATHS = Object.freeze([
  'version.json',
  'index.html',
  'data/archive-core.json',
]);

const sha256 = (bytes) =>
  crypto.createHash('sha256').update(bytes).digest('hex');

const defaultSleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * Verify cache-busted live responses against exact reviewed repository bytes.
 * Redirects fail closed so the fixed archive boundary cannot move unnoticed.
 */
export async function verifyLiveArtifacts({
  artifactPaths = DEFAULT_ARTIFACT_PATHS,
  readLocal = (relativePath) => readFile(path.resolve(relativePath)),
  fetchImpl = fetch,
  runId = process.env.GITHUB_RUN_ID || 'local',
  attempts = 6,
  retryMilliseconds = 15_000,
  requestTimeoutMilliseconds = 30_000,
  sleep = defaultSleep,
} = {}) {
  if (!Array.isArray(artifactPaths) || artifactPaths.length === 0) {
    throw new Error('At least one live artifact is required.');
  }
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error('attempts must be a positive integer.');
  }
  if (!Number.isInteger(requestTimeoutMilliseconds) || requestTimeoutMilliseconds < 1) {
    throw new Error('requestTimeoutMilliseconds must be a positive integer.');
  }

  const verified = [];
  for (const relativePath of artifactPaths) {
    if (typeof relativePath !== 'string' || !relativePath || relativePath.startsWith('/')) {
      throw new Error(`Invalid relative artifact path: ${relativePath}`);
    }
    const localBytes = Buffer.from(await readLocal(relativePath));
    const localDigest = sha256(localBytes);
    let lastFailure = 'no response';

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const liveUrl = new URL(relativePath, LIVE_SITE_ROOT);
      liveUrl.searchParams.set('deploy_verify', `${runId}-${attempt}`);
      try {
        const response = await fetchImpl(liveUrl, {
          cache: 'no-store',
          redirect: 'error',
          signal: AbortSignal.timeout(requestTimeoutMilliseconds),
          headers: {
            Accept: '*/*',
            'Cache-Control': 'no-cache',
          },
        });
        if (!response.ok) {
          lastFailure = `HTTP ${response.status}`;
        } else {
          const liveBytes = Buffer.from(await response.arrayBuffer());
          const liveDigest = sha256(liveBytes);
          if (liveDigest === localDigest) {
            verified.push({
              path: relativePath,
              bytes: liveBytes.length,
              sha256: liveDigest,
            });
            break;
          }
          lastFailure = `SHA-256 ${liveDigest} did not equal ${localDigest}`;
        }
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error);
      }

      if (attempt < attempts) await sleep(retryMilliseconds);
    }

    if (verified.at(-1)?.path !== relativePath) {
      throw new Error(
        `${relativePath} did not match after ${attempts} attempts: ${lastFailure}`,
      );
    }
  }
  return verified;
}

async function main() {
  const verified = await verifyLiveArtifacts({
    runId: [process.env.GITHUB_RUN_ID, process.env.GITHUB_RUN_ATTEMPT]
      .filter(Boolean)
      .join('-') || 'local',
  });
  for (const artifact of verified) {
    console.log(
      `Verified ${artifact.path}: ${artifact.bytes} bytes, sha256 ${artifact.sha256}`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
