# -*- coding: utf-8 -*-
"""Tests for scripts/sweep_stuck.py — the Pillar 3a stuck-row sweeper.

The sweeper runs on a 30-minute cron. It reads the queue sheet and, for any
row that's been stuck longer than its threshold, fires a fresh workflow
dispatch via the GitHub API to recover it.

Thresholds (per design):
    submitted > 30 min  → re-dispatch
    processing > 1 hr   → re-dispatch
    archived > 24 hr    → re-dispatch with sentinel URL (forces SFTP retry)
    live, error, duplicate, no URL, invalid URL → never touched
"""
from __future__ import annotations

import importlib.util
import pathlib
import sys
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

_BACKEND = pathlib.Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


def _load_script_module():
    path = _BACKEND / "scripts" / "sweep_stuck.py"
    spec = importlib.util.spec_from_file_location("sweep_stuck", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pytest.importorskip("googleapiclient")
sweep_stuck = _load_script_module()
# The autouse fixture below replaces the lookup; keep the real one for its tests.
_REAL_LIST_ACTIVE = getattr(sweep_stuck, "list_active_submission_rows", None)


# ---------- Fixtures ---------------------------------------------------------


def _row(
    timestamp_iso,
    url,
    status,
    sheet_row=2,
    title="",
    notes="",
    record_id="",
    error="",
):
    """One row in the queue, shaped the way ``sweep_stuck`` reads it.

    Columns: A=timestamp, B=url, C=title, D=notes, F=status, G=record_id,
    H=error.
    """
    return {
        "sheet_row": sheet_row,
        "timestamp": timestamp_iso,
        "url": url,
        "title": title,
        "notes": notes,
        "status": status,
        "record_id": record_id,
        "error": error,
    }


def _iso_ago(**delta):
    """ISO timestamp `delta` ago (UTC)."""
    return (datetime.now(timezone.utc) - timedelta(**delta)).isoformat()


def _stub_sheet_rows(monkeypatch, rows):
    """Make sweep_stuck.fetch_rows return the canned row list."""
    monkeypatch.setattr(sweep_stuck, "fetch_rows", MagicMock(return_value=rows))


def _stub_dispatch_ok(monkeypatch):
    """Mock the GitHub dispatch POST."""
    mock = MagicMock(return_value={"ok": True, "status_code": 204})
    monkeypatch.setattr(sweep_stuck, "dispatch_workflow", mock)
    return mock


def _env(monkeypatch):
    monkeypatch.setenv("GITHUB_TOKEN", "ghs_fake_token")
    monkeypatch.setenv("GITHUB_REPO", "jamditis/rosen-frontend")
    monkeypatch.setenv("SHEET_ID", "SHEET-ABC")
    monkeypatch.setenv("SHEET_TAB", "Queue")


@pytest.fixture(autouse=True)
def _no_active_runs(monkeypatch):
    """Default: no submit-record.yml run is queued or running."""
    monkeypatch.setattr(
        sweep_stuck,
        "list_active_submission_rows",
        MagicMock(return_value=(set(), 0)),
        raising=False,
    )


# ---------- Tests ------------------------------------------------------------


class TestStuckThresholds:

    def test_redispatches_submitted_over_30min(self, monkeypatch):
        _env(monkeypatch)
        rows = [
            _row(
                _iso_ago(minutes=31),
                "https://example.com/stuck-sub",
                "submitted",
                sheet_row=5,
                title="Stuck submitted",
            )
        ]
        _stub_sheet_rows(monkeypatch, rows)
        dispatch_mock = _stub_dispatch_ok(monkeypatch)

        sweep_stuck.sweep()

        dispatch_mock.assert_called_once()
        payload = (
            dispatch_mock.call_args.kwargs.get("inputs")
            or dispatch_mock.call_args.args[0]
        )
        assert payload["url"] == "https://example.com/stuck-sub"
        assert payload["sheet_row"] in (5, "5")

    def test_redispatches_processing_over_1hr(self, monkeypatch):
        _env(monkeypatch)
        rows = [
            _row(
                _iso_ago(minutes=61),
                "https://example.com/stuck-proc",
                "processing",
                sheet_row=7,
            )
        ]
        _stub_sheet_rows(monkeypatch, rows)
        dispatch_mock = _stub_dispatch_ok(monkeypatch)

        sweep_stuck.sweep()

        dispatch_mock.assert_called_once()
        payload = (
            dispatch_mock.call_args.kwargs.get("inputs")
            or dispatch_mock.call_args.args[0]
        )
        assert payload["url"] == "https://example.com/stuck-proc"

    def test_redispatches_archived_over_24hr_with_sentinel(self, monkeypatch):
        _env(monkeypatch)
        rows = [
            _row(
                _iso_ago(hours=25),
                "https://example.com/stuck-arc",
                "archived",
                sheet_row=9,
                record_id="RECORD-00009",
            )
        ]
        _stub_sheet_rows(monkeypatch, rows)
        dispatch_mock = _stub_dispatch_ok(monkeypatch)

        sweep_stuck.sweep()

        dispatch_mock.assert_called_once()
        payload = (
            dispatch_mock.call_args.kwargs.get("inputs")
            or dispatch_mock.call_args.args[0]
        )
        # 24h+ archived row gets dispatched with a sentinel URL so process_one
        # short-circuits scrape + categorize + append and only runs SFTP.
        assert payload["url"].startswith("https://example.com/sweep-noop-")
        assert payload["retry_record_id"] == "RECORD-00009"


class TestSkipsFreshRows:

    def test_skips_fresh_submitted(self, monkeypatch):
        _env(monkeypatch)
        rows = [
            _row(
                _iso_ago(minutes=5),
                "https://example.com/fresh",
                "submitted",
                sheet_row=3,
            )
        ]
        _stub_sheet_rows(monkeypatch, rows)
        dispatch_mock = _stub_dispatch_ok(monkeypatch)

        sweep_stuck.sweep()

        dispatch_mock.assert_not_called()

    def test_skips_fresh_processing(self, monkeypatch):
        _env(monkeypatch)
        rows = [
            _row(
                _iso_ago(minutes=20),
                "https://example.com/fresh-proc",
                "processing",
                sheet_row=4,
            )
        ]
        _stub_sheet_rows(monkeypatch, rows)
        dispatch_mock = _stub_dispatch_ok(monkeypatch)

        sweep_stuck.sweep()

        dispatch_mock.assert_not_called()


class TestTerminalStates:

    @pytest.mark.parametrize(
        "status", ["live", "committed", "error", "duplicate", "no URL", "invalid URL"]
    )
    def test_skips_terminal_statuses_regardless_of_age(self, monkeypatch, status):
        _env(monkeypatch)
        # Old row, but in a terminal state — sweeper must never touch it.
        rows = [
            _row(
                _iso_ago(days=10), "https://example.com/terminal", status, sheet_row=11
            )
        ]
        _stub_sheet_rows(monkeypatch, rows)
        dispatch_mock = _stub_dispatch_ok(monkeypatch)

        sweep_stuck.sweep()

        dispatch_mock.assert_not_called()


class TestApiResilience:

    def test_sheet_api_failure_exits_nonzero(self, monkeypatch):
        _env(monkeypatch)
        monkeypatch.setattr(
            sweep_stuck, "fetch_rows", MagicMock(side_effect=RuntimeError("Sheets 503"))
        )
        dispatch_mock = _stub_dispatch_ok(monkeypatch)

        with pytest.raises(SystemExit) as excinfo:
            sweep_stuck.main()
        assert excinfo.value.code != 0
        dispatch_mock.assert_not_called()

    def test_github_dispatch_failure_continues_with_next_row(self, monkeypatch):
        _env(monkeypatch)
        rows = [
            _row(
                _iso_ago(minutes=31), "https://example.com/a", "submitted", sheet_row=2
            ),
            _row(
                _iso_ago(minutes=31), "https://example.com/b", "submitted", sheet_row=3
            ),
        ]
        _stub_sheet_rows(monkeypatch, rows)
        dispatch_mock = MagicMock(
            side_effect=[
                RuntimeError("github 500"),
                {"ok": True, "status_code": 204},
            ]
        )
        monkeypatch.setattr(sweep_stuck, "dispatch_workflow", dispatch_mock)

        # Sweep should not raise; both calls happen.
        sweep_stuck.sweep()

        assert dispatch_mock.call_count == 2


class TestInFlightRuns:
    """A row whose submit-record.yml run is still queued or running must wait.

    Re-dispatching it would add a second run to the release FIFO; each extra
    run dedups, pushes the whole site again and rewrites the row status.
    """

    def _stuck(self, sheet_row):
        return _row(
            _iso_ago(minutes=45),
            f"https://example.com/row-{sheet_row}",
            "submitted",
            sheet_row=sheet_row,
        )

    def test_skips_row_with_active_run(self, monkeypatch):
        _env(monkeypatch)
        _stub_sheet_rows(monkeypatch, [self._stuck(5), self._stuck(6)])
        monkeypatch.setattr(
            sweep_stuck,
            "list_active_submission_rows",
            MagicMock(return_value=({5}, 0)),
        )
        dispatch_mock = _stub_dispatch_ok(monkeypatch)

        counts = sweep_stuck.sweep()

        dispatch_mock.assert_called_once()
        assert dispatch_mock.call_args.args[0]["sheet_row"] == 6
        assert counts["in_flight"] == 1

    def test_fails_closed_when_run_lookup_fails(self, monkeypatch, caplog):
        _env(monkeypatch)
        _stub_sheet_rows(monkeypatch, [self._stuck(5)])
        monkeypatch.setattr(
            sweep_stuck,
            "list_active_submission_rows",
            MagicMock(side_effect=RuntimeError("actions api 502")),
        )
        dispatch_mock = _stub_dispatch_ok(monkeypatch)

        counts = sweep_stuck.sweep()

        dispatch_mock.assert_not_called()
        assert counts["in_flight"] == 1
        assert "actions api 502" in caplog.text

    def test_unattributed_active_run_blocks_every_row(self, monkeypatch):
        # A run whose title names no row (one started before run-name existed)
        # could belong to any row, so nothing is dispatched until it ends.
        _env(monkeypatch)
        _stub_sheet_rows(monkeypatch, [self._stuck(5)])
        monkeypatch.setattr(
            sweep_stuck,
            "list_active_submission_rows",
            MagicMock(return_value=(set(), 1)),
        )
        dispatch_mock = _stub_dispatch_ok(monkeypatch)

        sweep_stuck.sweep()

        dispatch_mock.assert_not_called()


class TestListActiveSubmissionRows:

    def _response(self, status_code, runs):
        resp = MagicMock()
        resp.status_code = status_code
        resp.ok = 200 <= status_code < 300
        resp.text = "boom"
        resp.json.return_value = {"total_count": len(runs), "workflow_runs": runs}
        return resp

    def test_reads_row_from_run_title_for_every_active_status(self, monkeypatch):
        _env(monkeypatch)
        calls = []

        def fake_get(url, headers=None, params=None, timeout=None):
            calls.append(params["status"])
            if params["status"] == "queued":
                return self._response(
                    200, [{"id": 1, "display_title": "Submit record for row 12"}]
                )
            if params["status"] == "in_progress":
                return self._response(
                    200,
                    [
                        {"id": 2, "display_title": "Submit record for row 7"},
                        {"id": 3, "display_title": "Pillar 3a — submit record"},
                    ],
                )
            return self._response(200, [])

        monkeypatch.setattr(sweep_stuck.requests, "get", fake_get)

        rows, unattributed = _REAL_LIST_ACTIVE()

        assert rows == {12, 7}
        assert unattributed == 1
        assert set(calls) == {
            "requested",
            "queued",
            "pending",
            "waiting",
            "in_progress",
        }

    def test_raises_on_api_error(self, monkeypatch):
        _env(monkeypatch)
        monkeypatch.setattr(
            sweep_stuck.requests,
            "get",
            MagicMock(return_value=self._response(403, [])),
        )

        with pytest.raises(RuntimeError):
            _REAL_LIST_ACTIVE()

    def test_submit_workflow_run_name_carries_the_sheet_row(self):
        workflow = (
            _BACKEND.parent / ".github" / "workflows" / "submit-record.yml"
        ).read_text(encoding="utf-8")
        line = next(
            line for line in workflow.splitlines() if line.startswith("run-name:")
        )
        title = line.split(":", 1)[1].strip().replace("${{ inputs.sheet_row }}", "42")
        assert sweep_stuck._row_from_run_title(title) == 42


class TestArchivedRetryCap:
    """Sentinel retries of an ``archived`` row stop after a fixed count.

    The count lives in the row's own error cell (column H): every failed
    sentinel run writes ``[sweep attempt N]`` there, so no new column is needed.
    """

    def _archived(self, error=""):
        return _row(
            _iso_ago(hours=30),
            "https://example.com/stuck-arc",
            "archived",
            sheet_row=9,
            record_id="RECORD-00009",
            error=error,
        )

    def test_first_retry_is_attempt_one(self, monkeypatch):
        _env(monkeypatch)
        _stub_sheet_rows(monkeypatch, [self._archived("Live push failed")])
        dispatch_mock = _stub_dispatch_ok(monkeypatch)

        sweep_stuck.sweep()

        url = dispatch_mock.call_args.args[0]["url"]
        assert url.startswith(sweep_stuck.SENTINEL_URL_PREFIX)
        assert url.endswith("-attempt-1")

    def test_next_retry_counts_up_from_the_error_cell(self, monkeypatch):
        _env(monkeypatch)
        _stub_sheet_rows(
            monkeypatch,
            [self._archived("[sweep attempt 2] Publication retry failed: x")],
        )
        dispatch_mock = _stub_dispatch_ok(monkeypatch)

        sweep_stuck.sweep()

        assert dispatch_mock.call_args.args[0]["url"].endswith("-attempt-3")

    def test_stops_after_the_limit(self, monkeypatch, caplog):
        _env(monkeypatch)
        limit = sweep_stuck.MAX_ARCHIVED_RETRIES
        _stub_sheet_rows(
            monkeypatch,
            [self._archived(f"[sweep attempt {limit}] Publication retry failed")],
        )
        dispatch_mock = _stub_dispatch_ok(monkeypatch)

        counts = sweep_stuck.sweep()

        dispatch_mock.assert_not_called()
        assert counts["retry_exhausted"] == 1
        assert "row 9" in caplog.text

    def test_fetch_rows_reads_the_error_column(self, monkeypatch):
        _env(monkeypatch)
        monkeypatch.setattr(sweep_stuck, "_load_sheets_credentials", lambda: None)
        values = [
            ["ts", "url", "title", "notes", "e", "status", "id", "error"],
            ["t", "u", "", "", "", "archived", "RECORD-1", "[sweep attempt 4] x"],
        ]
        service = MagicMock()
        service.spreadsheets.return_value.values.return_value.get.return_value.execute.return_value = {  # noqa: E501
            "values": values
        }
        import googleapiclient.discovery as discovery

        monkeypatch.setattr(discovery, "build", lambda *a, **k: service)

        rows = sweep_stuck.fetch_rows()

        assert rows[0]["error"] == "[sweep attempt 4] x"


class TestUnparseableTimestamp:
    """A hand-edited column A must not hide a stuck row for good."""

    @pytest.mark.parametrize("status", ["submitted", "processing"])
    def test_unparseable_timestamp_counts_as_stuck(self, monkeypatch, caplog, status):
        _env(monkeypatch)
        _stub_sheet_rows(
            monkeypatch,
            [_row("yesterday", "https://example.com/hand-edit", status, sheet_row=8)],
        )
        dispatch_mock = _stub_dispatch_ok(monkeypatch)

        sweep_stuck.sweep()

        dispatch_mock.assert_called_once()
        assert "row 8" in caplog.text
        assert "yesterday" in caplog.text

    def test_future_timestamp_is_still_fresh(self, monkeypatch):
        # Clock skew gives a negative age; that is not an unparseable value.
        _env(monkeypatch)
        future = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
        _stub_sheet_rows(
            monkeypatch, [_row(future, "https://example.com/skew", "submitted")]
        )
        dispatch_mock = _stub_dispatch_ok(monkeypatch)

        sweep_stuck.sweep()

        dispatch_mock.assert_not_called()


def test_sweeper_workflow_comment_lists_committed_as_terminal():
    workflow = (
        _BACKEND.parent / ".github" / "workflows" / "sweep-stuck-rows.yml"
    ).read_text(encoding="utf-8")
    header = workflow.split("\non:", 1)[0]
    terminal = " ".join(
        line.lstrip("# ").strip()
        for line in header.splitlines()
        if line.startswith("#")
    )
    assert "Terminal statuses" in terminal
    clause = terminal.split("Terminal statuses", 1)[1].split("never touched", 1)[0]
    assert "committed" in clause
