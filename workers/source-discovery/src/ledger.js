import { DISCOVERY_MODE, discoverSource } from "./discovery.js";
import { SOURCE_MANIFEST } from "./source-manifest.js";

const MAX_METADATA_LENGTH = 2_048;

const SQL = Object.freeze({
  createRun: `
    INSERT INTO discovery_runs (
      run_id, started_at, source_count, candidate_count, outcome
    ) VALUES (?, ?, ?, 0, 'running')
  `,
  sourceState: `
    SELECT etag, last_modified
    FROM discovery_source_state
    WHERE source_id = ?
  `,
  updateSourceState: `
    INSERT INTO discovery_source_state (
      source_id, etag, last_modified, last_checked_at, last_success_at, last_status
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id) DO UPDATE SET
      etag = COALESCE(excluded.etag, discovery_source_state.etag),
      last_modified = COALESCE(excluded.last_modified, discovery_source_state.last_modified),
      last_checked_at = excluded.last_checked_at,
      last_success_at = COALESCE(excluded.last_success_at, discovery_source_state.last_success_at),
      last_status = excluded.last_status
  `,
  upsertCandidate: `
    INSERT INTO discovery_candidates (
      source_id, canonical_url, first_seen_at, last_seen_at,
      external_timestamp, etag, fingerprint, latest_run_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id, canonical_url) DO UPDATE SET
      last_seen_at = excluded.last_seen_at,
      external_timestamp = COALESCE(excluded.external_timestamp, discovery_candidates.external_timestamp),
      etag = COALESCE(excluded.etag, discovery_candidates.etag),
      fingerprint = COALESCE(excluded.fingerprint, discovery_candidates.fingerprint),
      latest_run_id = excluded.latest_run_id
  `,
  completeRun: `
    UPDATE discovery_runs
    SET finished_at = ?, candidate_count = ?, outcome = ?
    WHERE run_id = ?
  `,
});

function metadata(value) {
  if (typeof value !== "string" || value === "") return null;
  return value.slice(0, MAX_METADATA_LENGTH);
}

function isSuccessfulOutcome(status) {
  return ["candidates_found", "no_candidates", "not_modified"].includes(status);
}

async function sourceState(database, sourceId) {
  const state = await database
    .prepare(SQL.sourceState)
    .bind(sourceId)
    .first();
  return {
    etag: metadata(state?.etag),
    lastModified: metadata(state?.last_modified),
  };
}

async function updateSourceState(database, outcome, checkedAt) {
  const successfulAt = isSuccessfulOutcome(outcome.status) ? checkedAt : null;
  await database
    .prepare(SQL.updateSourceState)
    .bind(
      metadata(outcome.sourceId),
      metadata(outcome.etag),
      metadata(outcome.lastModified),
      checkedAt,
      successfulAt,
      metadata(outcome.status),
    )
    .run();
}

async function upsertCandidates(database, runId, candidates) {
  if (candidates.length === 0) return;
  const statements = candidates.map((candidate) =>
    database
      .prepare(SQL.upsertCandidate)
      .bind(
        metadata(candidate.sourceId),
        metadata(candidate.url),
        candidate.discoveredAt,
        candidate.discoveredAt,
        metadata(candidate.externalTimestamp),
        metadata(candidate.etag),
        metadata(candidate.fingerprint),
        runId,
      ),
  );
  await database.batch(statements);
}

/**
 * Persist only source and candidate metadata. The Worker never stores a feed
 * body, item title, article text, credentials, or an arbitrary URL.
 */
export async function runLiveDiscovery({
  database,
  sources = SOURCE_MANIFEST,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  makeRunId = () => crypto.randomUUID(),
} = {}) {
  if (!database) throw new Error("missing_d1_binding");

  const startedAt = now().toISOString();
  const runId = makeRunId();
  await database
    .prepare(SQL.createRun)
    .bind(runId, startedAt, sources.length)
    .run();

  const outcomes = [];
  let candidateCount = 0;
  try {
    for (const source of sources) {
      const conditional = await sourceState(database, source.id);
      const outcome = await discoverSource(source, { fetchImpl, now, conditional });
      const checkedAt = now().toISOString();
      outcomes.push(outcome);
      candidateCount += outcome.candidateCount || 0;
      await updateSourceState(database, outcome, checkedAt);
      await upsertCandidates(database, runId, outcome.candidates || []);
    }
    const finishedAt = now().toISOString();
    await database
      .prepare(SQL.completeRun)
      .bind(finishedAt, candidateCount, "completed", runId)
      .run();
    return {
      mode: DISCOVERY_MODE.LIVE,
      runId,
      startedAt,
      finishedAt,
      sourceCount: sources.length,
      sources: outcomes,
    };
  } catch (error) {
    const finishedAt = now().toISOString();
    await database
      .prepare(SQL.completeRun)
      .bind(finishedAt, candidateCount, "failed", runId)
      .run();
    throw error;
  }
}
