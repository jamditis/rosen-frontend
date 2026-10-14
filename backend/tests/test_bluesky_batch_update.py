import csv
import datetime
import io
import json

import pytest

from scripts import bluesky_batch_update as batch
from scripts import bluesky_feed_backfill as backfill


JAY_DID = backfill.ACTOR_DID


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
