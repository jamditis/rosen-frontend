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
    path = _BACKEND / 'scripts' / 'sweep_stuck.py'
    spec = importlib.util.spec_from_file_location('sweep_stuck', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pytest.importorskip('googleapiclient')
sweep_stuck = _load_script_module()


# ---------- Fixtures ---------------------------------------------------------

def _row(timestamp_iso, url, status, sheet_row=2, title='', notes=''):
    """One row in the queue, shaped the way ``sweep_stuck`` reads it.

    Columns: A=timestamp, B=url, C=title, D=notes, F=status, G=record_id,
    H=error.
    """
    return {
        'sheet_row': sheet_row,
        'timestamp': timestamp_iso,
        'url': url,
        'title': title,
        'notes': notes,
        'status': status,
    }


def _iso_ago(**delta):
    """ISO timestamp `delta` ago (UTC)."""
    return (datetime.now(timezone.utc) - timedelta(**delta)).isoformat()


def _stub_sheet_rows(monkeypatch, rows):
    """Make sweep_stuck.fetch_rows return the canned row list."""
    monkeypatch.setattr(sweep_stuck, 'fetch_rows', MagicMock(return_value=rows))


def _stub_dispatch_ok(monkeypatch):
    """Mock the GitHub dispatch POST."""
    mock = MagicMock(return_value={'ok': True, 'status_code': 204})
    monkeypatch.setattr(sweep_stuck, 'dispatch_workflow', mock)
    return mock


def _env(monkeypatch):
    monkeypatch.setenv('GITHUB_TOKEN', 'ghs_fake_token')
    monkeypatch.setenv('GITHUB_REPO', 'jamditis/rosen-frontend')
    monkeypatch.setenv('SHEET_ID', 'SHEET-ABC')
    monkeypatch.setenv('SHEET_TAB', 'Queue')


# ---------- Tests ------------------------------------------------------------

class TestStuckThresholds:

    def test_redispatches_submitted_over_30min(self, monkeypatch):
        _env(monkeypatch)
        rows = [_row(_iso_ago(minutes=31),
                     'https://example.com/stuck-sub', 'submitted',
                     sheet_row=5, title='Stuck submitted')]
        _stub_sheet_rows(monkeypatch, rows)
        dispatch_mock = _stub_dispatch_ok(monkeypatch)

        sweep_stuck.sweep()

        dispatch_mock.assert_called_once()
        payload = dispatch_mock.call_args.kwargs.get('inputs') or \
                  dispatch_mock.call_args.args[0]
        assert payload['url'] == 'https://example.com/stuck-sub'
        assert payload['sheet_row'] in (5, '5')

    def test_redispatches_processing_over_1hr(self, monkeypatch):
        _env(monkeypatch)
        rows = [_row(_iso_ago(minutes=61),
                     'https://example.com/stuck-proc', 'processing',
                     sheet_row=7)]
        _stub_sheet_rows(monkeypatch, rows)
        dispatch_mock = _stub_dispatch_ok(monkeypatch)

        sweep_stuck.sweep()

        dispatch_mock.assert_called_once()
        payload = dispatch_mock.call_args.kwargs.get('inputs') or \
                  dispatch_mock.call_args.args[0]
        assert payload['url'] == 'https://example.com/stuck-proc'

    def test_redispatches_archived_over_24hr_with_sentinel(self, monkeypatch):
        _env(monkeypatch)
        rows = [_row(_iso_ago(hours=25),
                     'https://example.com/stuck-arc', 'archived',
                     sheet_row=9)]
        _stub_sheet_rows(monkeypatch, rows)
        dispatch_mock = _stub_dispatch_ok(monkeypatch)

        sweep_stuck.sweep()

        dispatch_mock.assert_called_once()
        payload = dispatch_mock.call_args.kwargs.get('inputs') or \
                  dispatch_mock.call_args.args[0]
        # 24h+ archived row gets dispatched with a sentinel URL so process_one
        # short-circuits scrape + categorize + append and only runs SFTP.
        assert payload['url'].startswith('https://example.com/sweep-noop-')


class TestSkipsFreshRows:

    def test_skips_fresh_submitted(self, monkeypatch):
        _env(monkeypatch)
        rows = [_row(_iso_ago(minutes=5),
                     'https://example.com/fresh', 'submitted', sheet_row=3)]
        _stub_sheet_rows(monkeypatch, rows)
        dispatch_mock = _stub_dispatch_ok(monkeypatch)

        sweep_stuck.sweep()

        dispatch_mock.assert_not_called()

    def test_skips_fresh_processing(self, monkeypatch):
        _env(monkeypatch)
        rows = [_row(_iso_ago(minutes=20),
                     'https://example.com/fresh-proc', 'processing',
                     sheet_row=4)]
        _stub_sheet_rows(monkeypatch, rows)
        dispatch_mock = _stub_dispatch_ok(monkeypatch)

        sweep_stuck.sweep()

        dispatch_mock.assert_not_called()


class TestTerminalStates:

    @pytest.mark.parametrize('status', ['live', 'error', 'duplicate',
                                        'no URL', 'invalid URL'])
    def test_skips_terminal_statuses_regardless_of_age(self, monkeypatch, status):
        _env(monkeypatch)
        # Old row, but in a terminal state — sweeper must never touch it.
        rows = [_row(_iso_ago(days=10),
                     'https://example.com/terminal', status, sheet_row=11)]
        _stub_sheet_rows(monkeypatch, rows)
        dispatch_mock = _stub_dispatch_ok(monkeypatch)

        sweep_stuck.sweep()

        dispatch_mock.assert_not_called()


class TestApiResilience:

    def test_sheet_api_failure_exits_nonzero(self, monkeypatch):
        _env(monkeypatch)
        monkeypatch.setattr(sweep_stuck, 'fetch_rows',
                            MagicMock(side_effect=RuntimeError('Sheets 503')))
        dispatch_mock = _stub_dispatch_ok(monkeypatch)

        with pytest.raises(SystemExit) as excinfo:
            sweep_stuck.main()
        assert excinfo.value.code != 0
        dispatch_mock.assert_not_called()

    def test_github_dispatch_failure_continues_with_next_row(self, monkeypatch):
        _env(monkeypatch)
        rows = [
            _row(_iso_ago(minutes=31), 'https://example.com/a', 'submitted',
                 sheet_row=2),
            _row(_iso_ago(minutes=31), 'https://example.com/b', 'submitted',
                 sheet_row=3),
        ]
        _stub_sheet_rows(monkeypatch, rows)
        dispatch_mock = MagicMock(side_effect=[
            RuntimeError('github 500'),
            {'ok': True, 'status_code': 204},
        ])
        monkeypatch.setattr(sweep_stuck, 'dispatch_workflow', dispatch_mock)

        # Sweep should not raise; both calls happen.
        sweep_stuck.sweep()

        assert dispatch_mock.call_count == 2
