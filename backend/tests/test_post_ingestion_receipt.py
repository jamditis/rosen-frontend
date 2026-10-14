"""Tests for the bounded ingestion receipt sender."""

from __future__ import annotations

import importlib.util
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
                "uri": "at://did:plc:3t37x6vfigdzzp2gjcfnzlz4/app.bsky.feed.post/" + str(index),
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
    response = MagicMock(status_code=302)
    with patch.object(sender.requests, "post", return_value=response) as post:
        with pytest.raises(RuntimeError, match="redirect"):
            sender.post_batch(_receipt(), "private-token")
    call = post.call_args
    assert call.kwargs["allow_redirects"] is False
    assert call.kwargs["headers"] == {"Authorization": "Bearer private-token"}
    assert "private-token" not in str(call.kwargs["json"])


def test_post_batch_retries_only_a_bounded_transient_failure():
    transient = MagicMock(status_code=503)
    success = MagicMock(status_code=204)
    with (
        patch.object(sender.requests, "post", side_effect=[transient, success]) as post,
        patch.object(sender.time, "sleep") as sleep,
    ):
        sender.post_batch(_receipt(), "private-token")
    assert post.call_count == 2
    sleep.assert_called_once_with(1)
    success.raise_for_status.assert_called_once_with()
