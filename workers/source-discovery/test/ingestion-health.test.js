import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import initSqlJs from "sql.js";
import worker from "../src/index.js";
import { readArchiveHealth, readPendingIngestionCandidates, receiveIngestionReceipt, validateIngestionReceipt } from "../src/ingestion-health.js";

const TOKEN = "example-test-receipt-token-with-no-real-authority";
const NOW = Date.parse("2026-10-14T18:00:00Z");
const URI = "at://did:plc:3t37x6vfigdzzp2gjcfnzlz4/app.bsky.feed.post/example1";
const receipt = (overrides = {}) => ({
  version: 1,
  runId: "example_run_1",
  checkedAt: "2026-10-14T18:00:00.000Z",
  status: "published",
  canonicalCommit: "a".repeat(40),
  releaseVersion: "3.8.38",
  captured: 2,
  admitted: 1,
  contextOnly: 1,
  sourceLatestAt: "2026-10-14T15:30:00Z",
  records: [{ uri: URI, decision: "accepted", recordId: "BSKY-03436" }],
  ...overrides,
});

async function database() {
  const SQL = await initSqlJs();
  const raw = new SQL.Database();
  for (const name of ["0001_initial.sql", "0002_bluesky_candidate_metadata.sql", "0003_origin_backoff.sql", "0004_candidate_history_index.sql", "0005_ingestion_health.sql"]) {
    raw.run(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  }
  return {
    raw,
    prepare(sql) {
      return {
        bind(...params) {
          const all = () => {
            const statement = raw.prepare(sql);
            try {
              statement.bind(params);
              const rows = [];
              while (statement.step()) rows.push(statement.getAsObject());
              return rows;
            } finally { statement.free(); }
          };
          return {
            async first() { return all()[0] || null; },
            async all() { return { results: all() }; },
            async run() { raw.run(sql, params); },
          };
        },
      };
    },
    async batch(statements) {
      raw.run("BEGIN");
      try {
        for (const statement of statements) await statement.run();
        raw.run("COMMIT");
      } catch (error) {
        raw.run("ROLLBACK");
        throw error;
      }
    },
  };
}

function request(body, token = TOKEN) {
  return new Request("https://rosen-source-discovery.jamditis.workers.dev/ingestion-receipt", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("receipt authentication rejects before any D1 access", async () => {
  const result = await receiveIngestionReceipt(request(receipt(), "invalid-token"), { INGESTION_RECEIPT_TOKEN: TOKEN }, NOW);
  assert.equal(result.status, 401);
});

test("pending candidate reads require authentication and paginate only Jay's unsettled URIs", async () => {
  const get = cursor => new Request(`https://rosen-source-discovery.jamditis.workers.dev/ingestion-candidates${cursor}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const denied = new Request("https://rosen-source-discovery.jamditis.workers.dev/ingestion-candidates");
  assert.equal((await readPendingIngestionCandidates(denied, {})).status, 401);
  assert.equal((await readPendingIngestionCandidates(get("?cursor=bad"), { INGESTION_RECEIPT_TOKEN: TOKEN })).status, 400);
  const db = await database();
  const insert = (source, uri, status = "pending_review") => db.raw.run("INSERT INTO discovery_candidates (source_id,canonical_url,first_seen_at,last_seen_at,latest_run_id,review_status) VALUES (?,?,?,?,?,?)", [source, uri, "2026-10-14", "2026-10-14", "example", status]);
  for (let index = 0; index < 201; index++) insert("jay-rosen-bluesky", URI + index);
  insert("pressthink-wordpress-posts", "https://pressthink.org/example");
  insert("jay-rosen-bluesky", URI + "accepted", "accepted");
  const env = { DISCOVERY_LEDGER: db, INGESTION_RECEIPT_TOKEN: TOKEN };
  const first = await readPendingIngestionCandidates(get(""), env);
  assert.equal(first.status, 200);
  assert.equal(first.body.candidates.length, 200);
  assert.ok(first.body.nextCursor);
  const last = await readPendingIngestionCandidates(get(`?cursor=${first.body.nextCursor}`), env);
  assert.equal(last.body.candidates.length, 1);
  assert.equal(last.body.nextCursor, null);
  assert.deepEqual(Object.keys(last.body.candidates[0]), ["uri"]);
  db.raw.close();
});

test("receipt validation bounds counts, source identity, duplicates and timestamps", () => {
  for (const value of [
    receipt({ admitted: 3 }),
    receipt({ captured: "2" }),
    receipt({ checkedAt: "2026-10-10T00:00:00Z" }),
    receipt({ records: [receipt().records[0], receipt().records[0]] }),
    receipt({ records: [{ uri: "at://did:plc:someoneelse/app.bsky.feed.post/a", decision: "accepted", recordId: "BSKY-03436" }] }),
    receipt({ status: "failed" }),
    receipt({ records: Array.from({ length: 41 }, (_, index) => ({ uri: URI + index, decision: "accepted", recordId: "BSKY-03436" })) }),
  ]) assert.throws(() => validateIngestionReceipt(value, NOW));
  assert.equal(validateIngestionReceipt(receipt(), NOW).sourceLatestAt, "2026-10-14T15:30:00.000Z");
});

test("receipt body bounds and database errors fail without partial decisions", async () => {
  const oversized = request({ padding: "x".repeat(100_001) });
  assert.equal((await receiveIngestionReceipt(oversized, { INGESTION_RECEIPT_TOKEN: TOKEN }, NOW)).status, 413);
  const db = await database();
  const env = { DISCOVERY_LEDGER: db, INGESTION_RECEIPT_TOKEN: TOKEN };
  db.raw.run("CREATE TRIGGER reject_candidate BEFORE INSERT ON discovery_candidates BEGIN SELECT RAISE(ABORT, 'example_database_failure'); END;");
  await assert.rejects(receiveIngestionReceipt(request(receipt()), env, NOW));
  assert.equal(db.raw.exec("SELECT count(*) FROM archive_ingestion_runs")[0].values[0][0], 0);
  assert.equal(db.raw.exec("SELECT count(*) FROM discovery_candidates")[0].values[0][0], 0);
  db.raw.close();
});

test("authenticated receipt records only compact metadata and settles candidates atomically", async () => {
  const db = await database();
  db.raw.run("INSERT INTO discovery_candidates (source_id,canonical_url,first_seen_at,last_seen_at,latest_run_id) VALUES (?,?,?,?,?)", ["jay-rosen-bluesky", URI, "2026-10-14", "2026-10-14", "discovery1"]);
  const env = { DISCOVERY_LEDGER: db, INGESTION_RECEIPT_TOKEN: TOKEN };
  assert.equal((await receiveIngestionReceipt(request(receipt()), env, NOW)).status, 200);
  assert.equal((await receiveIngestionReceipt(request(receipt()), env, NOW)).status, 200);
  assert.equal(db.raw.exec("SELECT count(*) FROM archive_ingestion_runs")[0].values[0][0], 1);
  assert.equal(db.raw.exec("SELECT review_status FROM discovery_candidates")[0].values[0][0], "accepted");
  const newer = receipt({ runId: "example_run_2", checkedAt: "2026-10-14T18:01:00Z", records: [{ uri: URI, decision: "rejected", recordId: "BSKY-03436" }] });
  await receiveIngestionReceipt(request(newer), env, NOW + 60_000);
  await receiveIngestionReceipt(request(receipt()), env, NOW + 60_000);
  assert.equal(db.raw.exec("SELECT review_status FROM discovery_candidates")[0].values[0][0], "rejected", "an older receipt must not reverse a newer decision");
  const newUri = URI.replace("example1", "example2");
  const beforeDiscovery = receipt({ runId: "before_discovery", checkedAt: "2026-10-14T18:02:00Z", records: [{ uri: newUri, decision: "accepted", recordId: "BSKY-03437" }] });
  await receiveIngestionReceipt(request(beforeDiscovery), env, NOW + 120_000);
  assert.equal(db.raw.exec("SELECT review_status FROM discovery_candidates WHERE canonical_url = '" + newUri + "'")[0].values[0][0], "accepted", "publication can precede the next edge discovery tick");
  db.raw.close();
});

test("health needs both recent discovery and verified ingestion, with a weekly PressThink allowance", async () => {
  const db = await database();
  db.raw.run("INSERT INTO discovery_source_state VALUES (?,?,?,?,?,?)", ["jay-rosen-bluesky", null, null, "2026-10-14T09:17:00Z", "2026-10-14T09:17:00Z", "candidates_found"]);
  db.raw.run("INSERT INTO discovery_source_state VALUES (?,?,?,?,?,?)", ["pressthink-wordpress-posts", null, null, "2026-10-14T09:17:00Z", "2026-10-08T09:17:00Z", "skipped_interval"]);
  assert.equal((await readArchiveHealth(db, NOW)).healthy, false);
  await receiveIngestionReceipt(request(receipt()), { DISCOVERY_LEDGER: db, INGESTION_RECEIPT_TOKEN: TOKEN }, NOW);
  assert.equal((await readArchiveHealth(db, NOW)).healthy, true);
  assert.equal((await readArchiveHealth(db, NOW + 37 * 3_600_000)).healthy, false);
  const failure = receipt({ runId: "failed_run", checkedAt: "2026-10-14T18:02:00Z", status: "failed", records: [], errorClass: "validation_failed" });
  await receiveIngestionReceipt(request(failure), { DISCOVERY_LEDGER: db, INGESTION_RECEIPT_TOKEN: TOKEN }, NOW + 120_000);
  const health = await readArchiveHealth(db, NOW + 120_000);
  assert.equal(health.healthy, false);
  assert.equal(health.ingestion.status, "failed");
  db.raw.close();
});

test("a live health endpoint cannot report success without its ledger", async () => {
  const response = await worker.fetch(new Request("https://rosen-source-discovery.jamditis.workers.dev/health"), { DISCOVERY_MODE: "live" });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.status, "degraded");
  assert.equal(body.error, "ledger_unavailable");
});
