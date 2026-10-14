import { readBoundedText } from "./discovery.js";
import { SOURCE_MANIFEST } from "./source-manifest.js";

const MAX_RECEIPT_BYTES = 100_000;
const MAX_RECORD_DECISIONS = 40;
const FRESHNESS_MS = 36 * 60 * 60 * 1_000;
const ACTOR_POST = /^at:\/\/did:plc:3t37x6vfigdzzp2gjcfnzlz4\/app\.bsky\.feed\.post\/[A-Za-z0-9._~:-]{1,128}$/;
const ACTOR_POST_PREFIX = "at://did:plc:3t37x6vfigdzzp2gjcfnzlz4/app.bsky.feed.post/";
const SUCCESS = new Set(["candidates_found", "no_candidates", "not_modified", "skipped_interval"]);

function fresh(timestamp, now, maximumAge = FRESHNESS_MS) {
  const time = Date.parse(timestamp || "");
  return Number.isFinite(time) && time <= now + 300_000 && now - time <= maximumAge;
}

export async function readArchiveHealth(database, now = Date.now()) {
  const placeholders = SOURCE_MANIFEST.map(() => "?").join(",");
  const sourceRows = (await database.prepare(
    `SELECT source_id, last_checked_at, last_success_at, last_status FROM discovery_source_state WHERE source_id IN (${placeholders})`,
  ).bind(...SOURCE_MANIFEST.map(source => source.id)).all()).results;
  const states = new Map(sourceRows.map(row => [row.source_id, row]));
  const discovery = SOURCE_MANIFEST.map(source => {
    const state = states.get(source.id);
    const maximumAge = Math.max(FRESHNESS_MS, (source.minimumIntervalHours || 0) * 3_600_000 + FRESHNESS_MS);
    return {
      sourceId: source.id,
      lastCheckedAt: state?.last_checked_at || null,
      lastSuccessAt: state?.last_success_at || null,
      lastStatus: state?.last_status || "never_checked",
      healthy: Boolean(state && SUCCESS.has(state.last_status) && fresh(state.last_success_at, now, maximumAge)),
    };
  });
  const ingestion = await database.prepare(
    "SELECT run_id, checked_at, status, canonical_commit, release_version, captured_count, admitted_count, context_only_count, source_latest_at, error_class FROM archive_ingestion_runs ORDER BY checked_at DESC LIMIT 1",
  ).bind().first();
  const ingestionFresh = Boolean(ingestion && fresh(ingestion.checked_at, now));
  const ingestionHealthy = Boolean(ingestionFresh && ingestion.status !== "failed");
  return {
    healthy: discovery.every(source => source.healthy) && ingestionHealthy,
    discovery,
    ingestion: ingestion ? {
      runId: ingestion.run_id,
      checkedAt: ingestion.checked_at,
      status: ingestionFresh ? ingestion.status : "receipt_stale",
      lastReceiptStatus: ingestion.status,
      canonicalCommit: ingestion.canonical_commit,
      releaseVersion: ingestion.release_version,
      captured: ingestion.captured_count,
      admitted: ingestion.admitted_count,
      contextOnly: ingestion.context_only_count,
      sourceLatestAt: ingestion.source_latest_at,
      errorClass: ingestionFresh ? ingestion.error_class : "publication_receipt_stale",
      healthy: ingestionHealthy,
    } : { status: "never_run", errorClass: "publication_receipt_missing", healthy: false },
  };
}

async function authorized(request, expected) {
  if (typeof expected !== "string" || expected.length < 32) return false;
  const supplied = request.headers.get("Authorization")?.match(/^Bearer (\S{32,256})$/)?.[1];
  if (!supplied) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([supplied, expected].map(value =>
    crypto.subtle.digest("SHA-256", encoder.encode(value)),
  ));
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function readPendingIngestionCandidates(request, env) {
  if (!await authorized(request, env.INGESTION_RECEIPT_TOKEN)) return { status: 401, body: { error: "unauthorized" } };
  const query = new URL(request.url).searchParams;
  const value = query.get("cursor") || "0";
  if ([...query.keys()].some(key => key !== "cursor") || query.getAll("cursor").length > 1
    || !/^\d{1,16}$/.test(value) || !Number.isSafeInteger(Number(value))) {
    return { status: 400, body: { error: "invalid_cursor" } };
  }
  const rows = (await env.DISCOVERY_LEDGER.prepare(
    // D1 limits LIKE/GLOB patterns to 50 bytes; this fixed URI prefix is longer.
    "SELECT rowid AS cursor, canonical_url AS uri FROM discovery_candidates WHERE source_id = ? AND substr(canonical_url, 1, length(?)) = ? AND review_status = 'pending_review' AND rowid > ? ORDER BY rowid LIMIT 201",
  ).bind("jay-rosen-bluesky", ACTOR_POST_PREFIX, ACTOR_POST_PREFIX, Number(value)).all()).results;
  const page = rows.slice(0, 200);
  if (page.some(row => !ACTOR_POST.test(row.uri))) throw new Error("invalid_ledger_candidate");
  return { status: 200, body: {
    candidates: page.map(({ uri }) => ({ uri })),
    nextCursor: rows.length > 200 ? String(page.at(-1).cursor) : null,
  } };
}

export function validateIngestionReceipt(value, now = Date.now()) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1) throw new Error("invalid_receipt");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(value.runId || "")) throw new Error("invalid_run_id");
  if (!["published", "no_change", "failed"].includes(value.status)) throw new Error("invalid_status");
  if (!fresh(value.checkedAt, now, 24 * 3_600_000)) throw new Error("invalid_check_time");
  if (!/^[0-9a-f]{40}$/.test(value.canonicalCommit || "")) throw new Error("invalid_commit");
  if (!/^\d+\.\d+\.\d+$/.test(value.releaseVersion || "")) throw new Error("invalid_version");
  for (const name of ["captured", "admitted", "contextOnly"]) {
    if (!Number.isSafeInteger(value[name]) || value[name] < 0 || value[name] > 100_000) throw new Error("invalid_counts");
  }
  if (value.admitted + value.contextOnly !== value.captured) throw new Error("inconsistent_counts");
  if (value.sourceLatestAt !== null && (typeof value.sourceLatestAt !== "string" || !Number.isFinite(Date.parse(value.sourceLatestAt)) || Date.parse(value.sourceLatestAt) > now + 300_000)) throw new Error("invalid_source_time");
  if (value.errorClass != null && !/^[A-Za-z0-9_-]{1,80}$/.test(value.errorClass)) throw new Error("invalid_error_class");
  if (!Array.isArray(value.records) || value.records.length > MAX_RECORD_DECISIONS) throw new Error("invalid_records");
  const uris = new Set();
  for (const record of value.records) {
    if (!record || !ACTOR_POST.test(record.uri || "") || uris.has(record.uri)) throw new Error("invalid_record_uri");
    if (!["accepted", "rejected"].includes(record.decision) || !/^BSKY-\d{5,}$/.test(record.recordId || "")) throw new Error("invalid_record_decision");
    uris.add(record.uri);
  }
  if (value.status === "failed" && value.records.length) throw new Error("failed_receipt_has_decisions");
  return {
    ...value,
    checkedAt: new Date(value.checkedAt).toISOString(),
    sourceLatestAt: value.sourceLatestAt === null ? null : new Date(value.sourceLatestAt).toISOString(),
  };
}

export async function receiveIngestionReceipt(request, env, now = Date.now()) {
  if (!await authorized(request, env.INGESTION_RECEIPT_TOKEN)) return { status: 401, body: { error: "unauthorized" } };
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) return { status: 415, body: { error: "json_required" } };
  const text = await readBoundedText(request, MAX_RECEIPT_BYTES);
  if (!text.ok) return { status: 413, body: { error: "receipt_too_large" } };
  let receipt;
  try {
    receipt = validateIngestionReceipt(JSON.parse(text.text), now);
  } catch {
    return { status: 400, body: { error: "invalid_receipt" } };
  }
  const statements = [env.DISCOVERY_LEDGER.prepare(`
    INSERT INTO archive_ingestion_runs (run_id, checked_at, status, canonical_commit, release_version, captured_count, admitted_count, context_only_count, source_latest_at, error_class)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id) DO UPDATE SET checked_at = excluded.checked_at, status = excluded.status,
      canonical_commit = excluded.canonical_commit, release_version = excluded.release_version,
      captured_count = excluded.captured_count, admitted_count = excluded.admitted_count,
      context_only_count = excluded.context_only_count, source_latest_at = excluded.source_latest_at,
      error_class = excluded.error_class
    WHERE archive_ingestion_runs.checked_at < excluded.checked_at
  `).bind(receipt.runId, receipt.checkedAt, receipt.status, receipt.canonicalCommit, receipt.releaseVersion,
    receipt.captured, receipt.admitted, receipt.contextOnly, receipt.sourceLatestAt, receipt.errorClass || null)];
  for (const record of receipt.records) {
    statements.push(env.DISCOVERY_LEDGER.prepare(`
      INSERT INTO discovery_candidates (source_id, canonical_url, first_seen_at, last_seen_at, latest_run_id, review_status)
      SELECT 'jay-rosen-bluesky', ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM archive_ingestion_runs WHERE run_id = ? AND checked_at = ?)
        AND NOT EXISTS (SELECT 1 FROM archive_ingestion_runs WHERE checked_at > ?)
      ON CONFLICT(source_id, canonical_url) DO UPDATE SET review_status = excluded.review_status
    `).bind(record.uri, receipt.checkedAt, receipt.checkedAt, receipt.runId, record.decision,
      receipt.runId, receipt.checkedAt, receipt.checkedAt));
  }
  await env.DISCOVERY_LEDGER.batch(statements);
  return { status: 200, body: { status: "recorded", runId: receipt.runId, decisions: receipt.records.length } };
}
