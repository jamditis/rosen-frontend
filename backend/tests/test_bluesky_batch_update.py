import csv
import datetime
import io
import json
import subprocess

import pytest

from scripts import bluesky_batch_update as batch
from scripts import bluesky_feed_backfill as backfill


JAY_DID = backfill.ACTOR_DID


class _HttpResponse:
    def __init__(self, status_code=200, *, payload=None, text="", headers=None):
        self.status_code = status_code
        self._payload = payload
        self.text = text
        self.headers = headers or {}

    def json(self):
        return self._payload


def _feed_item(
    rkey,
    created_at,
    text,
    *,
    cid=None,
    reply_parent="",
    reply_root="",
    quote_uri="",
):
    record = {"text": text, "createdAt": created_at}
    if reply_parent:
        record["reply"] = {
            "parent": {"uri": reply_parent},
            "root": {"uri": reply_root or reply_parent},
        }
    if quote_uri:
        record["embed"] = {
            "$type": "app.bsky.embed.record",
            "record": {"uri": quote_uri, "cid": "bafy-quoted-reference"},
        }
    return {
        "post": {
            "uri": f"at://{JAY_DID}/app.bsky.feed.post/{rkey}",
            "cid": cid or f"bafy-{rkey}",
            "author": {"did": JAY_DID, "handle": backfill.ACTOR},
            "record": record,
            "likeCount": 3,
            "repostCount": 2,
            "replyCount": 1,
        }
    }


def _context_post(uri, handle="reader.example"):
    return {
        "uri": uri,
        "cid": "bafy-context",
        "author": {"did": uri.split("/")[2], "handle": handle},
        "record": {
            "text": "Third-party context stays in the private batch snapshot.",
            "createdAt": "2026-10-15T11:00:00Z",
        },
    }


def _canonical_row(
    rkey="canonical",
    record_id="BSKY-03435",
    publication_date="2026-10-14 15:19:22",
):
    row = {field: "" for field in backfill.SCHEMA_FIELDS}
    row.update(
        {
            "id": record_id,
            "title": "Existing canonical Bluesky record",
            "url": f"https://bsky.app/profile/{backfill.ACTOR}/post/{rkey}",
            "author": "Jay Rosen",
            "publication_date": publication_date,
            "original_publication": "Bluesky",
            "publisher": "Bluesky",
            "platform": "Bluesky",
            "content_type": "Social Media Post",
            "format": "Tweet/Thread",
            "responds_to": "legacy relationship text; keep these bytes exactly",
            "verified": "TRUE",
            "notes": "Existing source evidence.",
        }
    )
    return row


def _write_canonical(path):
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(
        stream,
        fieldnames=backfill.SCHEMA_FIELDS,
        lineterminator="\n",
    )
    writer.writeheader()
    writer.writerow(_canonical_row())
    original = stream.getvalue().encode("utf-8")
    path.write_bytes(original)
    return original


def _read_rows(path):
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def _captured_at():
    return datetime.datetime(2026, 10, 16, 12, 0, tzinfo=datetime.timezone.utc)


def test_cutoff_accepts_legacy_single_digit_hours(tmp_path):
    csv_path = tmp_path / "social_posts.csv"
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=backfill.SCHEMA_FIELDS)
    writer.writeheader()
    writer.writerow(_canonical_row(publication_date="2025-10-14 2:12:59"))
    csv_path.write_text(stream.getvalue(), encoding="utf-8")

    assert batch.derive_input_cutoff(csv_path) == datetime.datetime(
        2025, 10, 13, 2, 12, 59, tzinfo=datetime.timezone.utc
    )


def test_batch_is_idempotent_and_preserves_existing_csv_bytes(tmp_path):
    csv_path = tmp_path / "social_posts.csv"
    original = _write_canonical(csv_path)
    page = {
        "feed": [
            _feed_item(
                "new-original",
                "2026-10-15T12:00:00Z",
                (
                    "This news coverage repeats false balance and the view from "
                    "nowhere. Journalists should explain how the press serves democracy."
                ),
            )
        ],
        "cursor": None,
    }

    first = batch.run_batch(
        csv_path=csv_path,
        snapshot_dir=tmp_path / "snapshot-first",
        report_path=tmp_path / "report-first.json",
        captured_at=_captured_at(),
        fetch_page_fn=lambda _cursor: page,
        fetch_context_fn=lambda _uris: {"posts": []},
        policy_check_fn=lambda: None,
        sleep_fn=lambda _seconds: None,
    )

    first_bytes = csv_path.read_bytes()
    assert first_bytes.startswith(original)
    assert _read_rows(csv_path)[-1]["id"] == "BSKY-03436"
    assert first.report["counts"] == {
        "captured": 1,
        "admitted": 1,
        "context_only": 0,
    }
    assert first.snapshot_dir.is_dir()
    assert json.loads((tmp_path / "report-first.json").read_text()) == first.report

    second = batch.run_batch(
        csv_path=csv_path,
        snapshot_dir=tmp_path / "snapshot-second",
        report_path=tmp_path / "report-second.json",
        captured_at=_captured_at() + datetime.timedelta(minutes=1),
        fetch_page_fn=lambda _cursor: page,
        fetch_context_fn=lambda _uris: {"posts": []},
        policy_check_fn=lambda: None,
        sleep_fn=lambda _seconds: None,
    )

    assert csv_path.read_bytes() == first_bytes
    assert second.report["counts"] == {
        "captured": 0,
        "admitted": 0,
        "context_only": 0,
    }


def test_incomplete_walk_writes_neither_csv_nor_snapshots(tmp_path):
    csv_path = tmp_path / "social_posts.csv"
    original = _write_canonical(csv_path)
    snapshot_dir = tmp_path / "snapshot"
    report_path = tmp_path / "report.json"
    page = {
        "feed": [
            _feed_item(
                "new-original",
                "2026-10-15T12:00:00Z",
                "The press and news coverage need stronger public accountability.",
            )
        ],
        "cursor": "another-page",
    }

    with pytest.raises(batch.BatchPreparationError, match="Incomplete feed walk"):
        batch.run_batch(
            csv_path=csv_path,
            snapshot_dir=snapshot_dir,
            report_path=report_path,
            captured_at=_captured_at(),
            max_pages=1,
            fetch_page_fn=lambda _cursor: page,
            fetch_context_fn=lambda _uris: {"posts": []},
            policy_check_fn=lambda: None,
            sleep_fn=lambda _seconds: None,
        )

    assert csv_path.read_bytes() == original
    assert not snapshot_dir.exists()
    assert not report_path.exists()


def test_bad_source_payload_writes_nothing(tmp_path):
    csv_path = tmp_path / "social_posts.csv"
    original = _write_canonical(csv_path)
    snapshot_dir = tmp_path / "snapshot"
    report_path = tmp_path / "report.json"
    bad_item = _feed_item(
        "missing-cid",
        "2026-10-15T12:00:00Z",
        "The press and news coverage need stronger public accountability.",
    )
    del bad_item["post"]["cid"]

    with pytest.raises(batch.BatchPreparationError, match="CID"):
        batch.run_batch(
            csv_path=csv_path,
            snapshot_dir=snapshot_dir,
            report_path=report_path,
            captured_at=_captured_at(),
            fetch_page_fn=lambda _cursor: {"feed": [bad_item], "cursor": None},
            fetch_context_fn=lambda _uris: {"posts": []},
            policy_check_fn=lambda: None,
            sleep_fn=lambda _seconds: None,
        )

    assert csv_path.read_bytes() == original
    assert not snapshot_dir.exists()
    assert not report_path.exists()


def test_runner_outputs_must_stay_under_runner_temp(tmp_path, monkeypatch):
    csv_path = tmp_path / "social_posts.csv"
    original = _write_canonical(csv_path)
    runner_temp = tmp_path / "runner-temp"
    monkeypatch.setenv("RUNNER_TEMP", str(runner_temp))

    with pytest.raises(batch.BatchPreparationError, match="RUNNER_TEMP"):
        batch.run_batch(
            csv_path=csv_path,
            snapshot_dir=tmp_path / "outside-snapshot",
            report_path=tmp_path / "outside-report.json",
            captured_at=_captured_at(),
            fetch_page_fn=lambda _cursor: pytest.fail("feed must not be fetched"),
            fetch_context_fn=lambda _uris: pytest.fail("context must not be fetched"),
            policy_check_fn=lambda: None,
            sleep_fn=lambda _seconds: None,
        )

    assert csv_path.read_bytes() == original


def test_admission_uses_text_taxonomy_and_public_context(tmp_path):
    csv_path = tmp_path / "social_posts.csv"
    _write_canonical(csv_path)
    parent_uri = "at://did:plc:reader/app.bsky.feed.post/parent"
    root_uri = "at://did:plc:root/app.bsky.feed.post/root"
    missing_parent_uri = "at://did:plc:missing/app.bsky.feed.post/parent"
    quote_uri = "at://did:plc:quoted/app.bsky.feed.post/quoted"
    items = [
        _feed_item(
            "meaningful-original",
            "2026-10-15T12:00:00Z",
            (
                "This news coverage repeats false balance and the view from "
                "nowhere. Journalists should explain how the press serves democracy."
            ),
        ),
        _feed_item(
            "brief-reply",
            "2026-10-15T13:00:00Z",
            "Thanks, Ray.",
            reply_parent=parent_uri,
        ),
        _feed_item(
            "meaningful-reply",
            "2026-10-15T14:00:00Z",
            (
                "This news coverage repeats false balance and the view from nowhere. "
                "The press should explain its democratic choices."
            ),
            reply_parent=parent_uri,
            reply_root=root_uri,
        ),
        _feed_item(
            "contextless-reply",
            "2026-10-15T14:30:00Z",
            (
                "This news coverage repeats false balance and the view from nowhere. "
                "The press should explain its democratic choices."
            ),
            reply_parent=missing_parent_uri,
        ),
        _feed_item(
            "meaningful-quote",
            "2026-10-15T15:00:00Z",
            (
                "This news coverage repeats false balance and the view from nowhere. "
                "Journalists should explain what the press chose."
            ),
            quote_uri=quote_uri,
        ),
    ]
    context_requests = []

    def fetch_context(uris):
        context_requests.append(list(uris))
        return {
            "posts": [
                _context_post(
                    uri,
                    handle=(
                        "reader.example" if uri == parent_uri else "quoted.example"
                    ),
                )
                for uri in uris
                if uri != missing_parent_uri
            ]
        }

    result = batch.run_batch(
        csv_path=csv_path,
        snapshot_dir=tmp_path / "snapshot",
        report_path=tmp_path / "report.json",
        captured_at=_captured_at(),
        fetch_page_fn=lambda _cursor: {"feed": items, "cursor": None},
        fetch_context_fn=fetch_context,
        policy_check_fn=lambda: None,
        sleep_fn=lambda _seconds: None,
    )

    rows = {row["url"].rsplit("/", 1)[-1]: row for row in _read_rows(csv_path)}
    assert rows["meaningful-original"]["verified"] == "TRUE"
    assert rows["meaningful-original"]["summary"]
    assert (
        "Press & Media Criticism" in rows["meaningful-original"]["thematic_categories"]
    )
    assert "source evidence" in rows["meaningful-original"]["notes"].lower()

    assert rows["brief-reply"]["verified"] == "FALSE"
    assert rows["brief-reply"]["summary"] == ""
    assert rows["brief-reply"]["thematic_categories"] == ""
    assert "Standalone archive admission not verified" in rows["brief-reply"]["notes"]

    assert rows["meaningful-reply"]["verified"] == "TRUE"
    assert "reader.example" in rows["meaningful-reply"]["summary"]
    assert rows["contextless-reply"]["verified"] == "FALSE"
    assert "required_public_context_unavailable" in rows["contextless-reply"]["notes"]
    assert rows["meaningful-quote"]["verified"] == "TRUE"
    assert "quoted.example" in rows["meaningful-quote"]["summary"]
    assert context_requests == [[parent_uri, root_uri, missing_parent_uri, quote_uri]]

    decisions = {
        item["uri"].rsplit("/", 1)[-1]: item for item in result.report["decisions"]
    }
    assert decisions["meaningful-original"]["decision"] == "admit"
    assert decisions["brief-reply"]["decision"] == "context_only"
    assert decisions["meaningful-reply"]["decision"] == "admit"
    assert decisions["contextless-reply"]["decision"] == "context_only"
    assert decisions["meaningful-quote"]["decision"] == "admit"
    assert all(item["cid"] for item in decisions.values())
    assert result.report["counts"] == {
        "captured": 5,
        "admitted": 3,
        "context_only": 2,
    }
    assert result.report["input_cutoff"] == "2026-10-13T15:19:22+00:00"
    assert result.report["newest_source_time"] == "2026-10-15T15:00:00+00:00"


def test_adapter_self_thread_passes_generated_thread_evidence_gate(tmp_path):
    evidence_module = batch.REPO_ROOT / "scripts/refresh-social-release-artifacts.mjs"
    root_uri = f"at://{JAY_DID}/app.bsky.feed.post/thread-root"
    middle_uri = f"at://{JAY_DID}/app.bsky.feed.post/thread-middle"
    items = [
        _feed_item(
            "thread-root",
            "2026-10-15T12:00:00Z",
            (
                "This news coverage repeats false balance and the view from nowhere. "
                "Journalists should explain how the press serves democracy."
            ),
        ),
        _feed_item(
            "thread-middle",
            "2026-10-15T12:01:00Z",
            "Thanks.",
            reply_parent=root_uri,
            reply_root=root_uri,
        ),
        _feed_item(
            "thread-final",
            "2026-10-15T12:02:00Z",
            (
                "This thread explains why public trust depends on accountable news "
                "coverage and transparent choices by the press."
            ),
            reply_parent=middle_uri,
            reply_root=root_uri,
        ),
    ]
    source_rows = [
        backfill.post_to_row(item, 10000 + index, "2026-10-16 12:00:00")
        for index, item in enumerate(items)
    ]
    item_by_url = {row["url"]: item for row, item in zip(source_rows, items)}
    context_by_uri = {
        root_uri: _context_post(root_uri, handle=backfill.ACTOR),
        middle_uri: _context_post(middle_uri, handle=backfill.ACTOR),
    }

    rows, _decisions = batch._decision_rows(
        source_rows,
        item_by_url,
        context_by_uri,
        _captured_at(),
    )

    assert {row["verified"] for row in rows} == {"TRUE", "FALSE"}
    assert all(backfill.FEED_ENDPOINT in row["notes"] for row in rows)
    generated_thread = {
        "id": "THREAD-99999",
        "type": "social",
        "author": "Jay Rosen",
        "pub": "Bluesky",
        "url": rows[0]["url"],
        "thread_data": {
            "thread_id": rows[0]["id"],
            "posts": [
                {
                    "id": row["id"],
                    "content": row["raw_text"],
                    "url": row["url"],
                    "parent_id": None if index == 0 else rows[index - 1]["id"],
                }
                for index, row in enumerate(rows)
            ],
        },
    }
    payload_path = tmp_path / "adapter-thread.json"
    payload_path.write_text(
        json.dumps({"record": generated_thread, "rows": rows}),
        encoding="utf-8",
    )
    if not evidence_module.exists():
        pytest.skip(
            "generated-thread evidence module is supplied by the artifact layer"
        )
    node_program = """
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const [payloadPath, modulePath] = process.argv.slice(1);
const { assertJayGeneratedThreadEvidence } = await import(pathToFileURL(modulePath));
const payload = JSON.parse(await readFile(payloadPath, 'utf8'));
assertJayGeneratedThreadEvidence(
  payload.record,
  new Map(payload.rows.map(row => [row.id, row])),
);
"""
    subprocess.run(
        [
            "node",
            "--input-type=module",
            "--eval",
            node_program,
            str(payload_path),
            str(evidence_module),
        ],
        cwd=batch.REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )


@pytest.mark.parametrize(
    "policy",
    [
        "User-agent: *\nDisallow: /xrpc\n",
        "Allow: /xrpc\n",
        "This is not a robots directive\n",
    ],
)
def test_robots_policy_fails_closed_for_disallow_or_invalid_policy(policy):
    calls = []

    def request(url, **kwargs):
        calls.append((url, kwargs))
        return _HttpResponse(text=policy)

    with pytest.raises(batch.BatchPreparationError, match="robots policy"):
        batch.check_public_api_policy(
            request_fn=request,
            sleep_fn=lambda _seconds: pytest.fail("policy response must not retry"),
        )

    assert len(calls) == 1
    assert calls[0][0] == batch.ROBOTS_URL
    assert calls[0][1]["allow_redirects"] is False
    assert calls[0][1]["params"] is None


def test_robots_policy_allows_both_fixed_public_endpoints():
    calls = []

    def request(url, **kwargs):
        calls.append((url, kwargs))
        return _HttpResponse(text="User-agent: *\nDisallow:\n")

    batch.check_public_api_policy(
        request_fn=request,
        sleep_fn=lambda _seconds: pytest.fail("valid policy must not retry"),
    )

    assert [url for url, _kwargs in calls] == [batch.ROBOTS_URL]


@pytest.mark.parametrize("status", [401, 403])
def test_robots_policy_does_not_retry_access_denials(status):
    calls = []

    def request(url, **kwargs):
        calls.append((url, kwargs))
        return _HttpResponse(status_code=status)

    with pytest.raises(batch.BatchPreparationError, match=f"HTTP {status}"):
        batch.check_public_api_policy(
            request_fn=request,
            sleep_fn=lambda _seconds: pytest.fail("access denial must not retry"),
        )

    assert [url for url, _kwargs in calls] == [batch.ROBOTS_URL]


def test_policy_gate_precedes_feed_and_preserves_canonical_data(tmp_path):
    csv_path = tmp_path / "social_posts.csv"
    original = _write_canonical(csv_path)
    snapshot_dir = tmp_path / "snapshot"
    report_path = tmp_path / "report.json"

    def deny_policy():
        raise batch.BatchPreparationError("Public API robots policy is invalid")

    with pytest.raises(batch.BatchPreparationError, match="robots policy"):
        batch.run_batch(
            csv_path=csv_path,
            snapshot_dir=snapshot_dir,
            report_path=report_path,
            captured_at=_captured_at(),
            policy_check_fn=deny_policy,
            fetch_page_fn=lambda _cursor: pytest.fail("feed must not be fetched"),
            fetch_context_fn=lambda _uris: pytest.fail("context must not be fetched"),
            sleep_fn=lambda _seconds: None,
        )

    assert csv_path.read_bytes() == original
    assert not snapshot_dir.exists()
    assert not report_path.exists()


def test_fixed_feed_get_retries_network_429_and_transient_5xx():
    events = [
        batch.requests.ConnectionError("temporary network failure"),
        _HttpResponse(status_code=429, headers={"Retry-After": "7"}),
        _HttpResponse(status_code=503),
        _HttpResponse(payload={"feed": [], "cursor": None}),
    ]
    calls = []
    delays = []

    def request(url, **kwargs):
        calls.append((url, kwargs))
        event = events.pop(0)
        if isinstance(event, Exception):
            raise event
        return event

    payload = batch.fetch_feed_page(
        "fixed-cursor",
        request_fn=request,
        sleep_fn=delays.append,
    )

    assert payload == {"feed": [], "cursor": None}
    assert len(calls) == batch.MAX_REQUEST_ATTEMPTS
    assert {url for url, _kwargs in calls} == {backfill.FEED_ENDPOINT}
    assert all(kwargs["allow_redirects"] is False for _url, kwargs in calls)
    assert all(kwargs["params"]["actor"] == JAY_DID for _url, kwargs in calls)
    assert all(kwargs["params"]["cursor"] == "fixed-cursor" for _url, kwargs in calls)
    assert delays == [1, 7, 4]


def test_transient_failures_stop_at_the_request_bound():
    calls = []
    delays = []

    def request(url, **kwargs):
        calls.append((url, kwargs))
        return _HttpResponse(status_code=503)

    with pytest.raises(batch.BatchPreparationError, match="after 4 attempts"):
        batch.fetch_feed_page(
            None,
            request_fn=request,
            sleep_fn=delays.append,
        )

    assert len(calls) == batch.MAX_REQUEST_ATTEMPTS
    assert delays == [1, 2, 4]


def test_context_access_denial_is_not_retried():
    uri = "at://did:plc:reader/app.bsky.feed.post/parent"
    calls = []

    def request(url, **kwargs):
        calls.append((url, kwargs))
        return _HttpResponse(status_code=403)

    with pytest.raises(batch.BatchPreparationError, match="HTTP 403"):
        batch.fetch_context_posts(
            [uri],
            request_fn=request,
            sleep_fn=lambda _seconds: pytest.fail("403 must not retry"),
        )

    assert len(calls) == 1
    assert calls[0][0] == batch.CONTEXT_ENDPOINT
    assert calls[0][1]["params"] == [("uris", uri)]


def test_network_boundary_rejects_an_alternate_host_without_requesting_it():
    with pytest.raises(batch.BatchPreparationError, match="not allowed"):
        batch._get_with_retry(
            "https://bsky.social/xrpc/app.bsky.feed.getAuthorFeed",
            request_fn=lambda *_args, **_kwargs: pytest.fail(
                "alternate host must not be requested"
            ),
            sleep_fn=lambda _seconds: None,
        )


@pytest.mark.parametrize(
    ("context_mutation", "message"),
    [
        (lambda post: post["author"].update(did="did:plc:impostor"), "author DID"),
        (
            lambda post: post["record"].update(createdAt="2026-10-15T11:00:00"),
            "timezone",
        ),
    ],
)
def test_malformed_context_aborts_without_canonical_writes(
    tmp_path,
    context_mutation,
    message,
):
    csv_path = tmp_path / "social_posts.csv"
    original = _write_canonical(csv_path)
    snapshot_dir = tmp_path / "snapshot"
    report_path = tmp_path / "report.json"
    parent_uri = "at://did:plc:reader/app.bsky.feed.post/parent"
    item = _feed_item(
        "meaningful-reply",
        "2026-10-15T14:00:00Z",
        (
            "This news coverage repeats false balance and the view from nowhere. "
            "The press should explain its democratic choices."
        ),
        reply_parent=parent_uri,
    )
    context = _context_post(parent_uri)
    context_mutation(context)

    with pytest.raises(batch.BatchPreparationError, match=message):
        batch.run_batch(
            csv_path=csv_path,
            snapshot_dir=snapshot_dir,
            report_path=report_path,
            captured_at=_captured_at(),
            policy_check_fn=lambda: None,
            fetch_page_fn=lambda _cursor: {"feed": [item], "cursor": None},
            fetch_context_fn=lambda _uris: {"posts": [context]},
            sleep_fn=lambda _seconds: None,
        )

    assert csv_path.read_bytes() == original
    assert not snapshot_dir.exists()
    assert not report_path.exists()
