"""Tests for the bounded ingestion receipt sender."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


def _load_sender():
    script = Path(__file__).resolve().parents[1] / "scripts/post_ingestion_receipt.py"
    spec = importlib.util.spec_from_file_location("post_ingestion_receipt", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


sender = _load_sender()
JAY_URI_PREFIX = (
    "at://did:plc:3t37x6vfigdzzp2gjcfnzlz4/app.bsky.feed.post/"
)


def _receipt(record_count: int = 0, status: str = "published") -> dict:
    return {
        "version": 1,
        "runId": "123_1",
        "status": status,
        "checkedAt": "2026-10-14T18:47:00.000Z",
        "canonicalCommit": "1" * 40,
        "releaseVersion": "3.8.38",
        "captured": record_count,
        "admitted": record_count,
        "contextOnly": 0,
        "sourceLatestAt": "2026-10-14T17:30:00.000Z",
        "records": [
            {
                "uri": JAY_URI_PREFIX + str(index),
                "decision": "accepted",
                "recordId": f"BSKY-{index + 1:05d}",
            }
            for index in range(record_count)
        ],
    }


def test_receipt_batches_keep_shared_totals_and_cap_decisions_at_40():
    batches = list(sender.receipt_batches(_receipt(85)))
    assert [len(batch["records"]) for batch in batches] == [40, 40, 5]
    assert {batch["runId"] for batch in batches} == {"123_1"}
    assert {batch["captured"] for batch in batches} == {85}
    assert {batch["checkedAt"] for batch in batches} == {
        "2026-10-14T18:47:00.000Z"
    }


def test_failed_receipt_rejects_candidate_decisions():
    with pytest.raises(ValueError, match="must not include"):
        list(sender.receipt_batches(_receipt(1, status="failed")))
    failed = _receipt(0, status="failed")
    failed["errorClass"] = "deploy_failed"
    assert list(sender.receipt_batches(failed)) == [failed]


def test_post_batch_keeps_token_out_of_body_and_rejects_redirects():
    response = MagicMock(status_code=302, headers={})
    with patch.object(sender.requests, "post", return_value=response) as post:
        with pytest.raises(RuntimeError, match="redirect"):
            sender.post_batch(_receipt(), "private-token")
    call = post.call_args
    assert call.kwargs["allow_redirects"] is False
    assert call.kwargs["headers"] == {"Authorization": "Bearer private-token"}
    assert "private-token" not in str(call.kwargs["json"])


def test_post_batch_retries_only_a_bounded_transient_failure():
    transient = MagicMock(status_code=503, headers={"Retry-After": "120"})
    success = MagicMock(status_code=204, headers={})
    with (
        patch.object(sender.requests, "post", side_effect=[transient, success]) as post,
        patch.object(sender.time, "sleep") as sleep,
    ):
        sender.post_batch(_receipt(), "private-token")
    assert post.call_count == 2
    sleep.assert_called_once_with(sender.MAX_RETRY_DELAY_SECONDS)
    success.raise_for_status.assert_called_once_with()


def test_post_batch_retries_a_network_exception_without_leaking_payload():
    success = MagicMock(status_code=204, headers={})
    with (
        patch.object(
            sender.requests,
            "post",
            side_effect=[sender.requests.ConnectionError("offline"), success],
        ) as post,
        patch.object(sender.time, "sleep") as sleep,
    ):
        sender.post_batch(_receipt(), "private-token")
    assert post.call_count == 2
    sleep.assert_called_once_with(1.0)


@pytest.mark.parametrize("status_code", [401, 403])
def test_post_batch_does_not_retry_an_authentication_failure(status_code):
    response = MagicMock(status_code=status_code, headers={})
    response.raise_for_status.side_effect = sender.requests.HTTPError("denied")
    with (
        patch.object(sender.requests, "post", return_value=response) as post,
        patch.object(sender.time, "sleep") as sleep,
        pytest.raises(sender.requests.HTTPError, match="denied"),
    ):
        sender.post_batch(_receipt(), "private-token")
    assert post.call_count == 1
    sleep.assert_not_called()


def _candidate_response(payload: dict) -> MagicMock:
    body = json.dumps(payload).encode()
    response = MagicMock(status_code=200, headers={"Content-Length": str(len(body))})
    response.content = body
    return response


def test_fetch_pending_candidates_reads_bounded_pages_before_posting():
    first_uri = JAY_URI_PREFIX + "first"
    second_uri = JAY_URI_PREFIX + "second"
    responses = [
        _candidate_response({"candidates": [{"uri": first_uri}], "nextCursor": "200"}),
        _candidate_response({"candidates": [{"uri": second_uri}], "nextCursor": None}),
    ]
    with patch.object(sender.requests, "get", side_effect=responses) as get:
        assert sender.fetch_pending_candidate_uris("private-token") == [first_uri, second_uri]
    assert get.call_count == 2
    assert get.call_args_list[0].kwargs["params"] == {}
    assert get.call_args_list[1].kwargs["params"] == {"cursor": "200"}
    assert all(call.kwargs["allow_redirects"] is False for call in get.call_args_list)


def test_published_receipt_appends_already_canonical_pending_candidates(tmp_path):
    canonical = tmp_path / "social_posts.csv"
    canonical.write_text(
        "id,url,verified\n"
        "BSKY-03409,https://bsky.app/profile/jayrosen.bsky.social/post/accepted,TRUE\n"
        "BSKY-03412,https://bsky.app/profile/jayrosen.bsky.social/post/rejected,FALSE\n",
        encoding="utf-8",
    )
    payload = _receipt(0, status="no_change")
    with patch.object(
        sender,
        "fetch_pending_candidate_uris",
        return_value=[JAY_URI_PREFIX + "accepted", JAY_URI_PREFIX + "rejected"],
    ):
        result = sender.append_pending_decisions(payload, "private-token", canonical)
    assert result["captured"] == 0
    assert result["admitted"] == 0
    assert result["contextOnly"] == 0
    assert result["records"] == [
        {
            "uri": JAY_URI_PREFIX + "accepted",
            "decision": "accepted",
            "recordId": "BSKY-03409",
        },
        {
            "uri": JAY_URI_PREFIX + "rejected",
            "decision": "rejected",
            "recordId": "BSKY-03412",
        },
    ]


def test_missing_pending_candidate_remains_unsettled(tmp_path):
    canonical = tmp_path / "social_posts.csv"
    canonical.write_text(
        "id,url,verified\n"
        "BSKY-03409,https://bsky.app/profile/jayrosen.bsky.social/post/other,TRUE\n",
        encoding="utf-8",
    )
    with patch.object(
        sender,
        "fetch_pending_candidate_uris",
        return_value=[JAY_URI_PREFIX + "not-yet-canonical"],
    ):
        result = sender.append_pending_decisions(
            _receipt(0, status="no_change"), "private-token", canonical
        )
    assert result["records"] == []


def test_failed_receipt_never_fetches_pending_candidates(tmp_path):
    with patch.object(sender, "fetch_pending_candidate_uris") as fetch:
        result = sender.append_pending_decisions(
            _receipt(0, status="failed"),
            "private-token",
            tmp_path / "not-read.csv",
        )
    assert result["status"] == "failed"
    fetch.assert_not_called()


def test_candidate_fetch_failure_stops_before_any_receipt_post(tmp_path):
    with (
        patch.object(
            sender,
            "fetch_pending_candidate_uris",
            side_effect=sender.requests.ConnectionError("offline"),
        ),
        patch.object(sender, "post_batch") as post,
        pytest.raises(sender.requests.ConnectionError, match="offline"),
    ):
        sender.deliver_receipt(
            _receipt(0, status="no_change"),
            "private-token",
            tmp_path / "not-read.csv",
        )
    post.assert_not_called()
