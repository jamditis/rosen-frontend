import { DISCOVERY_MODE, discoverSource } from "./discovery.js";
import { SOURCE_MANIFEST, SOURCE_MANIFEST_VERSION } from "./source-manifest.js";

const MAX_METADATA_LENGTH = 2_048;
const BACKOFF_BASE_MS = 15 * 60 * 1_000;
const BACKOFF_MAX_MS = 24 * 60 * 60 * 1_000;
const BACKOFF_MAX_FAILURES = 8;
const STALE_RUN_MS = 25 * 60 * 60 * 1_000;

const SQL = Object.freeze({
  createRun: `
    INSERT INTO discovery_runs (
      run_id, started_at, source_count, candidate_count, outcome
    ) VALUES (?, ?, ?, 0, 'running')
  `,
  expireStaleRuns: `
    UPDATE discovery_runs
    SET finished_at = ?, outcome = 'failed'
    WHERE outcome = 'running' AND started_at < ?
  `,
  sourceState: `
    SELECT etag, last_modified, last_success_at
    FROM discovery_source_state
    WHERE source_id = ?
  `,
  originState: `
    SELECT backoff_until, consecutive_failures
    FROM discovery_origin_state
    WHERE origin = ?
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
  updateOriginState: `
    INSERT INTO discovery_origin_state (
      origin, backoff_until, consecutive_failures, last_checked_at, last_status
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(origin) DO UPDATE SET
      backoff_until = excluded.backoff_until,
      consecutive_failures = excluded.consecutive_failures,
      last_checked_at = excluded.last_checked_at,
      last_status = excluded.last_status
  `,
  upsertCandidate: `
    INSERT INTO discovery_candidates (
      source_id, canonical_url, first_seen_at, last_seen_at,
      external_timestamp, etag, content_id, post_type, root_id, parent_id,
      fingerprint, latest_run_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id, canonical_url) DO UPDATE SET
      last_seen_at = excluded.last_seen_at,
      external_timestamp = COALESCE(excluded.external_timestamp, discovery_candidates.external_timestamp),
      etag = COALESCE(excluded.etag, discovery_candidates.etag),
      content_id = COALESCE(excluded.content_id, discovery_candidates.content_id),
      post_type = COALESCE(excluded.post_type, discovery_candidates.post_type),
      root_id = COALESCE(excluded.root_id, discovery_candidates.root_id),
      parent_id = COALESCE(excluded.parent_id, discovery_candidates.parent_id),
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

function canonicalUrl(value) {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.length > MAX_METADATA_LENGTH
  ) {
    throw new Error("invalid_candidate_url");
  }
  return value;
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
    lastSuccessAt: metadata(state?.last_success_at),
  };
}

function sourceOrigin(source) {
  const endpoint = new URL(source.endpoint);
  if (!source.fetchOrigins.includes(endpoint.origin)) {
    throw new Error("invalid_source_origin");
  }
  return endpoint.origin;
}

async function originState(database, origin) {
  const state = await database
    .prepare(SQL.originState)
    .bind(origin)
    .first();
  return {
    backoffUntil: metadata(state?.backoff_until),
    consecutiveFailures:
      Number.isSafeInteger(state?.consecutive_failures) && state.consecutive_failures >= 0
        ? state.consecutive_failures
        : 0,
  };
}

function sourceIsDue(source, state, checkedAt) {
  if (!Number.isFinite(source.minimumIntervalHours) || source.minimumIntervalHours <= 0) {
    return true;
  }
  if (!state.lastSuccessAt) return true;
  const lastSuccess = Date.parse(state.lastSuccessAt);
  const current = Date.parse(checkedAt);
  if (!Number.isFinite(lastSuccess) || !Number.isFinite(current)) return true;
  return current - lastSuccess >= source.minimumIntervalHours * 60 * 60 * 1_000;
}

function originIsDue(state, checkedAt) {
  if (!state.backoffUntil) return true;
  const backoffUntil = Date.parse(state.backoffUntil);
  const current = Date.parse(checkedAt);
  if (!Number.isFinite(backoffUntil) || !Number.isFinite(current)) return true;
  return current >= backoffUntil;
}

function requiresBackoff(status) {
  const originStatus = status.startsWith("robots_")
    ? status.slice("robots_".length)
    : status;
  return (
    originStatus === "network_error" ||
    originStatus === "response_read_timeout" ||
    originStatus === "response_read_error" ||
    originStatus === "stop_http_429" ||
    /^http_5\d\d$/.test(originStatus)
  );
}

function nextOriginState(state, outcome, checkedAt) {
  if (!requiresBackoff(outcome.status)) {
    return { backoffUntil: null, consecutiveFailures: 0 };
  }
  const consecutiveFailures = Math.min(
    state.consecutiveFailures + 1,
    BACKOFF_MAX_FAILURES,
  );
  const delayMs = Math.min(
    BACKOFF_BASE_MS * 2 ** (consecutiveFailures - 1),
    BACKOFF_MAX_MS,
  );
  return {
    backoffUntil: new Date(Date.parse(checkedAt) + delayMs).toISOString(),
    consecutiveFailures,
  };
}

function sourceStateUpdate(database, outcome, checkedAt) {
  const successfulAt = isSuccessfulOutcome(outcome.status) ? checkedAt : null;
  return database
    .prepare(SQL.updateSourceState)
    .bind(
      metadata(outcome.sourceId),
      metadata(outcome.etag),
      metadata(outcome.lastModified),
      checkedAt,
      successfulAt,
      metadata(outcome.status),
    );
}

function originStateUpdate(database, origin, state, outcome, checkedAt) {
  if (outcome.status === "skipped_interval" || outcome.status === "skipped_backoff") {
    return null;
  }
  const nextState = nextOriginState(state, outcome, checkedAt);
  return database
    .prepare(SQL.updateOriginState)
    .bind(
      origin,
      nextState.backoffUntil,
      nextState.consecutiveFailures,
      checkedAt,
      metadata(outcome.status),
    );
}

function candidateUpserts(database, runId, candidates) {
  return candidates.map((candidate) =>
    database
      .prepare(SQL.upsertCandidate)
      .bind(
        metadata(candidate.sourceId),
        canonicalUrl(candidate.url),
        candidate.discoveredAt,
        candidate.discoveredAt,
        metadata(candidate.externalTimestamp),
        metadata(candidate.etag),
        metadata(candidate.contentId),
        metadata(candidate.postType),
        metadata(candidate.rootId),
        metadata(candidate.parentId),
        metadata(candidate.fingerprint),
        runId,
      ),
  );
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
  const staleBefore = new Date(Date.parse(startedAt) - STALE_RUN_MS).toISOString();
  await database
    .prepare(SQL.expireStaleRuns)
    .bind(startedAt, staleBefore)
    .run();
  await database
    .prepare(SQL.createRun)
    .bind(runId, startedAt, sources.length)
    .run();

  const outcomes = [];
  let candidateCount = 0;
  try {
    for (const source of sources) {
      const checkedAt = now().toISOString();
      let origin;
      try {
        origin = sourceOrigin(source);
      } catch {
        const outcome = {
          sourceId: source.id,
          status: "invalid_source_origin",
          candidateCount: 0,
        };
        outcomes.push(outcome);
        await database.batch([sourceStateUpdate(database, outcome, checkedAt)]);
        continue;
      }
      const conditional = await sourceState(database, source.id);
      const originBackoff = await originState(database, origin);
      const outcome = sourceIsDue(source, conditional, checkedAt)
        ? originIsDue(originBackoff, checkedAt)
          ? await discoverSource(source, { fetchImpl, now, conditional })
          : { sourceId: source.id, status: "skipped_backoff", candidateCount: 0 }
        : { sourceId: source.id, status: "skipped_interval", candidateCount: 0 };
      outcomes.push(outcome);
      const statements = [
        sourceStateUpdate(database, outcome, checkedAt),
        originStateUpdate(database, origin, originBackoff, outcome, checkedAt),
        ...candidateUpserts(database, runId, outcome.candidates || []),
      ].filter(Boolean);
      await database.batch(statements);
      candidateCount += outcome.candidateCount || 0;
    }
    const finishedAt = now().toISOString();
    await database
      .prepare(SQL.completeRun)
      .bind(finishedAt, candidateCount, "completed", runId)
      .run();
    return {
      mode: DISCOVERY_MODE.LIVE,
      manifestVersion: SOURCE_MANIFEST_VERSION,
      runId,
      startedAt,
      finishedAt,
      sourceCount: sources.length,
      sources: outcomes,
    };
  } catch (error) {
    const finishedAt = now().toISOString();
    try {
      await database
        .prepare(SQL.completeRun)
        .bind(finishedAt, candidateCount, "failed", runId)
        .run();
    } catch (completionError) {
      console.error(JSON.stringify({
        event: "rosen_source_discovery_failure_completion_failed",
        runId,
        error: completionError instanceof Error ? completionError.name : "unknown_error",
        message:
          completionError instanceof Error && completionError.message !== ""
            ? completionError.message.slice(0, 256)
            : "unknown_error",
      }));
    }
    throw error;
  }
}
