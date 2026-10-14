"""Exercise the Worker's actual candidate query under D1's SQLite limit."""

import json
from pathlib import Path
import sqlite3
import subprocess


ROOT = Path(__file__).resolve().parents[2]
PREFIX = "at://did:plc:3t37x6vfigdzzp2gjcfnzlz4/app.bsky.feed.post/"


def test_candidate_query_works_with_d1_pattern_limit_and_exact_actor_prefix():
    # Capture the statement and bindings at the external D1 boundary. Execute
    # them below in real SQLite with the provider's documented pattern limit.
    script = """
import { readPendingIngestionCandidates } from './workers/source-discovery/src/ingestion-health.js';
const token = 'example-receipt-token-with-no-real-authority';
let query;
const database = {
  prepare(sql) {
    return { bind(...params) {
      query = { sql, params };
      return { async all() { return { results: [] }; } };
    } };
  },
};
const request = new Request('https://example.org/ingestion-candidates', {
  headers: { Authorization: `Bearer ${token}` },
});
const result = await readPendingIngestionCandidates(request, {
  DISCOVERY_LEDGER: database, INGESTION_RECEIPT_TOKEN: token,
});
if (result.status !== 200 || !query) throw new Error('Candidate query was not prepared');
process.stdout.write(JSON.stringify(query));
"""
    result = subprocess.run(
        ["node", "--input-type=module"],
        input=script,
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
        timeout=15,
    )
    query = json.loads(result.stdout)
    with sqlite3.connect(":memory:") as database:
        # Python 3.10 has no setlimit API. It still executes the real query and
        # checks exact actor selection; 3.11+ also enforces D1's pattern limit.
        set_limit = getattr(database, "setlimit", None)
        if set_limit is not None:
            set_limit(sqlite3.SQLITE_LIMIT_LIKE_PATTERN_LENGTH, 50)
        migrations = ROOT / "workers/source-discovery/migrations"
        for migration in sorted(migrations.glob("*.sql")):
            database.executescript(migration.read_text())
        insert = """
INSERT INTO discovery_candidates
  (source_id, canonical_url, first_seen_at, last_seen_at, latest_run_id, review_status)
VALUES (?, ?, '2026-10-14', '2026-10-14', 'example', ?)
"""
        expected = [PREFIX + f"example{index}" for index in range(201)]
        database.executemany(
            insert,
            [
                ("jay-rosen-bluesky", PREFIX + "accepted", "accepted"),
                (
                    "jay-rosen-bluesky",
                    PREFIX.replace("did:plc:3t", "did:plc:3T") + "other",
                    "pending_review",
                ),
                (
                    "jay-rosen-bluesky",
                    "at://did:plc:anotherauthor/app.bsky.feed.post/repost",
                    "pending_review",
                ),
                (
                    "pressthink-wordpress-posts",
                    "https://example.org/story",
                    "pending_review",
                ),
            ],
        )
        database.executemany(
            insert, [("jay-rosen-bluesky", uri, "pending_review") for uri in expected]
        )
        rows = database.execute(query["sql"], query["params"]).fetchall()
        assert [row[1] for row in rows] == expected
