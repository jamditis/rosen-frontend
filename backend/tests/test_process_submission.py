# -*- coding: utf-8 -*-
"""Tests for scripts/process_submission.py — the Pillar 3a Action-facing
entry point.

The script is invoked once per `submit-record.yml` workflow run with all
submission inputs as CLI args. It runs the 12-step pipeline (sheet ack →
dedup → scrape → categorize → id → sanitize → CSV append → JSON regen →
node tests → git commit/push → SFTP → final sheet writeback).

These tests mock at module boundaries (dispatcher, categorizer, sftp_push,
sheets_callback, subprocess) and exercise the orchestration logic.
"""
from __future__ import annotations

import csv
import importlib.util
import pathlib
import subprocess
import sys
from unittest.mock import MagicMock

import pytest

_BACKEND = pathlib.Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


def _load_script_module():
    """Import process_submission.py as a regular module under tests."""
    path = _BACKEND / 'scripts' / 'process_submission.py'
    spec = importlib.util.spec_from_file_location('process_submission', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# Importing the script touches the real submission_server package; skip the
# whole file if Flask isn't installed (matches conftest convention for the
# other writeback tests).
pytest.importorskip('flask')

process_submission = _load_script_module()


# ---------- Fixtures ---------------------------------------------------------

CSV_HEADERS = [
    'id', 'title', 'url', 'author', 'publication_date',
    'original_publication', 'publisher', 'platform', 'collection_id',
    'content_type', 'format', 'word_count', 'length_in_seconds', 'excerpt',
    'summary', 'thematic_categories', 'key_concepts', 'series', 'era',
    'scope', 'tags', 'related_to', 'responds_to', 'influence', 'copyright',
    'license', 'permissions', 'date_processed', 'gdrive_pdf_link',
    'gdrive_raw_file_link', 'gdrive_transcript_link', 'transcript_filepath',
    'pull_quote', 'raw_text', 'verified', 'notes', 'low_confidence',
]


@pytest.fixture
def csv_with_headers(tmp_path):
    """A fresh archive CSV that has only the header row."""
    csv_path = tmp_path / 'archive_records-public.csv'
    with csv_path.open('w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(CSV_HEADERS)
    return csv_path


@pytest.fixture
def csv_with_existing_url(tmp_path):
    """An archive CSV that already contains a row for example.com/already."""
    csv_path = tmp_path / 'archive_records-public.csv'
    with csv_path.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=CSV_HEADERS, extrasaction='ignore')
        writer.writeheader()
        writer.writerow({
            'id': 'PRESSTH-00099',
            'title': 'Already in archive',
            'url': 'https://example.com/already',
            'original_publication': 'PressThink',
        })
    return csv_path


def _stub_dispatcher_ok(monkeypatch, **overrides):
    """Mock dispatch_url to return a populated scrape dict."""
    base = {
        'title': 'A scraped title',
        'author': 'Jay Rosen',
        'publication_date': '2026-05-24',
        'original_publication': 'PressThink',
        'summary': 'A summary',
        'excerpt': 'An excerpt',
        'pull_quote': 'A pull quote',
        'thematic_categories': ['Press & Media Criticism'],
        'key_concepts': ['View from Nowhere'],
        'era': 'Platform Transition & Future Models (2021-Present)',
        'scope': 'Commentary/Critique',
        'tags': ['journalism', 'media', 'press', 'criticism', 'rosen'],
        'raw_text': 'Some article body text.',
    }
    base.update(overrides)
    monkeypatch.setattr(process_submission, 'dispatch_url',
                        MagicMock(return_value=base))
    return base


def _stub_dispatcher_empty(monkeypatch):
    monkeypatch.setattr(process_submission, 'dispatch_url',
                        MagicMock(return_value=None))


def _stub_dispatcher_raises(monkeypatch, exc=None):
    err = exc or RuntimeError('scrape boom')
    monkeypatch.setattr(process_submission, 'dispatch_url',
                        MagicMock(side_effect=err))


def _stub_sheets(monkeypatch, side_effect=None):
    mock = MagicMock(return_value={'ok': True, 'skipped': False, 'error': None})
    if side_effect is not None:
        mock.side_effect = side_effect
    monkeypatch.setattr(process_submission.sheets_callback, 'update_row', mock)
    return mock


def _stub_sftp(monkeypatch, result=None):
    mock = MagicMock(return_value=(result or
                                   {'ok': True, 'skipped': False,
                                    'files_pushed': 4, 'error': None}))
    monkeypatch.setattr(process_submission.sftp_push, 'push_to_production', mock)
    return mock


def _stub_subprocess(monkeypatch, returncode_for=None, stdout='', stderr=''):
    """Stub subprocess.run for node export + npm test + git commit/push.

    ``returncode_for`` is a callable cmd -> int; default 0 for everything.
    """
    def _fake_run(cmd, *args, **kwargs):
        rc = 0
        if returncode_for is not None:
            rc = returncode_for(cmd)
        result = subprocess.CompletedProcess(
            args=cmd, returncode=rc, stdout=stdout, stderr=stderr)
        if kwargs.get('check') and rc != 0:
            raise subprocess.CalledProcessError(rc, cmd,
                                                output=stdout, stderr=stderr)
        return result
    monkeypatch.setattr(process_submission.subprocess, 'run',
                        MagicMock(side_effect=_fake_run))


def _stub_schema(monkeypatch):
    monkeypatch.setattr(process_submission, '_load_schema',
                        lambda: {'output_headers': CSV_HEADERS, 'taxonomy': {}})
    monkeypatch.setattr(process_submission, '_load_known_entities', lambda: {})


def _run(monkeypatch, csv_path, url='https://example.com/new', title='',
         notes='', sheet_id='SHEET', sheet_tab='Queue', sheet_row=3):
    """Convenience: invoke main() with a tmp CSV path patched in."""
    monkeypatch.setattr(process_submission, 'CSV_FILE', csv_path)
    return process_submission.process_one(
        url=url, title=title, notes=notes,
        sheet_id=sheet_id, sheet_tab=sheet_tab, sheet_row=sheet_row,
    )


# ---------- Tests ------------------------------------------------------------

class TestHappyPath:

    def test_happy_path(self, monkeypatch, csv_with_headers):
        _stub_schema(monkeypatch)
        _stub_dispatcher_ok(monkeypatch)
        sheets_mock = _stub_sheets(monkeypatch)
        sftp_mock = _stub_sftp(monkeypatch)
        _stub_subprocess(monkeypatch)

        result = _run(monkeypatch, csv_with_headers,
                      url='https://example.com/new', title='New piece',
                      sheet_row=3)

        assert result['status'] == 'live'
        assert result['record_id'].startswith('PRESSTH-')
        # CSV now has the new row
        with csv_with_headers.open() as f:
            rows = list(csv.DictReader(f))
        assert len(rows) == 1
        assert rows[0]['url'] == 'https://example.com/new'
        # sheets writeback final call has status=live
        final = sheets_mock.call_args_list[-1].kwargs
        assert final['status'] == 'live'
        assert final['record_id'] == result['record_id']
        # SFTP fired exactly once
        sftp_mock.assert_called_once()
        # git commit subprocess invoked with the record id in the message
        git_calls = [c for c in process_submission.subprocess.run.call_args_list
                     if c.args[0][:2] == ['git', 'commit']]
        assert git_calls, 'expected at least one git commit invocation'
        msg = ' '.join(git_calls[0].args[0])
        assert result['record_id'] in msg


class TestDedup:

    def test_dedup_url_already_in_csv(self, monkeypatch, csv_with_existing_url):
        _stub_schema(monkeypatch)
        # No scrape needed — dedup short-circuits.
        dispatch_mock = MagicMock()
        monkeypatch.setattr(process_submission, 'dispatch_url', dispatch_mock)
        sheets_mock = _stub_sheets(monkeypatch)
        sftp_mock = _stub_sftp(monkeypatch)
        _stub_subprocess(monkeypatch)

        result = _run(monkeypatch, csv_with_existing_url,
                      url='https://example.com/already')

        assert result['status'] == 'duplicate'
        assert result['record_id'] == 'PRESSTH-00099'
        dispatch_mock.assert_not_called()
        # No git commit on dup
        git_calls = [c for c in process_submission.subprocess.run.call_args_list
                     if c.args[0][:2] == ['git', 'commit']]
        assert git_calls == []
        # Sheets gets the duplicate status with the existing record id
        final = sheets_mock.call_args_list[-1].kwargs
        assert final['status'] == 'duplicate'
        assert final['record_id'] == 'PRESSTH-00099'
        sftp_mock.assert_not_called()


class TestScrapeFailure:

    def test_scrape_returns_empty(self, monkeypatch, csv_with_headers):
        _stub_schema(monkeypatch)
        _stub_dispatcher_empty(monkeypatch)
        sheets_mock = _stub_sheets(monkeypatch)
        _stub_sftp(monkeypatch)
        _stub_subprocess(monkeypatch)

        result = _run(monkeypatch, csv_with_headers)

        assert result['status'] == 'error'
        assert 'no content' in result['error'].lower() or \
               'unreachable' in result['error'].lower()
        # No git commit and no CSV row written
        with csv_with_headers.open() as f:
            rows = list(csv.DictReader(f))
        assert rows == []
        final = sheets_mock.call_args_list[-1].kwargs
        assert final['status'] == 'error'

    def test_scrape_raises(self, monkeypatch, csv_with_headers):
        _stub_schema(monkeypatch)
        _stub_dispatcher_raises(monkeypatch)
        sheets_mock = _stub_sheets(monkeypatch)
        _stub_sftp(monkeypatch)
        _stub_subprocess(monkeypatch)

        result = _run(monkeypatch, csv_with_headers)

        assert result['status'] == 'error'
        final = sheets_mock.call_args_list[-1].kwargs
        assert final['status'] == 'error'


class TestCategorizeDegrades:

    def test_categorize_failure_degrades_gracefully(self, monkeypatch, csv_with_headers):
        _stub_schema(monkeypatch)
        # Dispatcher returns scrape WITHOUT categorization fields.
        scrape = {
            'title': 'Untagged piece',
            'author': 'Jay Rosen',
            'original_publication': 'PressThink',
            'raw_text': 'Body',
        }
        monkeypatch.setattr(process_submission, 'dispatch_url',
                            MagicMock(return_value=scrape))
        # categorize() raises (simulating Gemini outage).
        monkeypatch.setattr(process_submission, 'categorize',
                            MagicMock(side_effect=RuntimeError('gemini down')))
        sheets_mock = _stub_sheets(monkeypatch)
        _stub_sftp(monkeypatch)
        _stub_subprocess(monkeypatch)

        result = _run(monkeypatch, csv_with_headers)

        # Categorization failure must NEVER strand the row.
        assert result['status'] == 'live'
        # Read the appended row and verify low-confidence flag + fallback.
        with csv_with_headers.open() as f:
            rows = list(csv.DictReader(f))
        assert len(rows) == 1
        row = rows[0]
        assert 'uncategorized' in row['thematic_categories'].lower()
        assert row['low_confidence'].lower() in ('true', '1', 'yes')
        final = sheets_mock.call_args_list[-1].kwargs
        assert final['status'] == 'live'


class TestTestSuiteFailure:

    def test_test_suite_failure_aborts_commit(self, monkeypatch, csv_with_headers):
        _stub_schema(monkeypatch)
        _stub_dispatcher_ok(monkeypatch)
        sheets_mock = _stub_sheets(monkeypatch)
        sftp_mock = _stub_sftp(monkeypatch)

        def rc(cmd):
            if cmd[:2] == ['npm', 'test']:
                return 1
            return 0
        _stub_subprocess(monkeypatch, returncode_for=rc,
                         stdout='', stderr='AssertionError: thing broke ' * 20)

        result = _run(monkeypatch, csv_with_headers)

        assert result['status'] == 'error'
        assert 'test' in result['error'].lower()
        # No git commit ever fired.
        git_calls = [c for c in process_submission.subprocess.run.call_args_list
                     if c.args[0][:2] == ['git', 'commit']]
        assert git_calls == []
        # No SFTP either.
        sftp_mock.assert_not_called()
        final = sheets_mock.call_args_list[-1].kwargs
        assert final['status'] == 'error'
        # Output is truncated to <= 500 chars in the error field.
        assert len(final['error']) <= 600  # leave room for prefix wording


class TestSftpFailure:

    def test_sftp_failure_writes_archived(self, monkeypatch, csv_with_headers):
        _stub_schema(monkeypatch)
        _stub_dispatcher_ok(monkeypatch)
        sheets_mock = _stub_sheets(monkeypatch)
        _stub_sftp(monkeypatch, result={'ok': False, 'skipped': False,
                                        'files_pushed': 0,
                                        'error': 'SSH timeout'})
        _stub_subprocess(monkeypatch)

        result = _run(monkeypatch, csv_with_headers)

        assert result['status'] == 'archived'
        # Commit DID happen — archived is "committed but not yet live".
        git_calls = [c for c in process_submission.subprocess.run.call_args_list
                     if c.args[0][:2] == ['git', 'commit']]
        assert git_calls, 'expected commit to happen before SFTP attempt'
        final = sheets_mock.call_args_list[-1].kwargs
        assert final['status'] == 'archived'
        assert 'retry' in final['error'].lower() or \
               'next submission' in final['error'].lower()


class TestFormulaInjectionSanitize:

    def test_formula_injection_in_title_sanitized(self, monkeypatch, csv_with_headers):
        _stub_schema(monkeypatch)
        _stub_dispatcher_ok(monkeypatch, title='=cmd|notepad')
        sheets_mock = _stub_sheets(monkeypatch)
        _stub_sftp(monkeypatch)
        _stub_subprocess(monkeypatch)

        _run(monkeypatch, csv_with_headers,
             title='=cmd|notepad', notes='+1 then formula')

        with csv_with_headers.open() as f:
            rows = list(csv.DictReader(f))
        assert len(rows) == 1
        # Sanitizer prefixes a single-quote escape on cells starting with a
        # formula-trigger char (=, +, -, @).
        assert rows[0]['title'].startswith("'")
        assert rows[0]['notes'].startswith("'")
        # Sheets writeback never receives an unescaped formula-trigger title.
        for call in sheets_mock.call_args_list:
            kwargs = call.kwargs
            if kwargs.get('error', '').startswith(('=', '+', '-', '@')):
                pytest.fail("sheet error field contains unescaped formula trigger")


class TestSentinelUrl:

    def test_sentinel_url_skips_scrape(self, monkeypatch, csv_with_headers):
        _stub_schema(monkeypatch)
        dispatch_mock = MagicMock()
        categorize_mock = MagicMock()
        monkeypatch.setattr(process_submission, 'dispatch_url', dispatch_mock)
        monkeypatch.setattr(process_submission, 'categorize', categorize_mock)
        sheets_mock = _stub_sheets(monkeypatch)
        sftp_mock = _stub_sftp(monkeypatch)
        _stub_subprocess(monkeypatch)

        result = _run(monkeypatch, csv_with_headers,
                      url='https://example.com/sweep-noop-1748147200')

        # Sentinel handling: no scrape, no categorize, no CSV append, no
        # commit. Only the SFTP step runs (so a stuck `archived` row gets a
        # fresh push without rewriting any data).
        dispatch_mock.assert_not_called()
        categorize_mock.assert_not_called()
        with csv_with_headers.open() as f:
            rows = list(csv.DictReader(f))
        assert rows == []
        git_calls = [c for c in process_submission.subprocess.run.call_args_list
                     if c.args[0][:2] == ['git', 'commit']]
        assert git_calls == []
        sftp_mock.assert_called_once()
        # Status reflects the no-op: not 'live' (no new row) and not 'error'.
        assert result['status'] in ('noop', 'live')
        # Sheet writeback for a sweep noop is optional — a sentinel submission
        # has no real row to update. Either no call or a no-op status is fine.
        if sheets_mock.call_args_list:
            assert sheets_mock.call_args_list[-1].kwargs.get('status') in (
                'noop', 'live', 'archived', None)


class TestSheetWritebackResilience:

    def test_sheet_writeback_failure_at_step_1_is_non_fatal(self, monkeypatch,
                                                            csv_with_headers):
        _stub_schema(monkeypatch)
        _stub_dispatcher_ok(monkeypatch)
        # First call (step 1 ack) raises; later calls succeed.
        call_count = {'n': 0}

        def _flaky(**kwargs):
            call_count['n'] += 1
            if call_count['n'] == 1:
                raise RuntimeError('sheets API hiccup')
            return {'ok': True, 'skipped': False, 'error': None}
        monkeypatch.setattr(process_submission.sheets_callback,
                            'update_row', MagicMock(side_effect=_flaky))
        _stub_sftp(monkeypatch)
        _stub_subprocess(monkeypatch)

        result = _run(monkeypatch, csv_with_headers)

        # Processing continued past the failed step-1 writeback.
        assert result['status'] == 'live'

    def test_sheet_writeback_failure_at_final_step_fails_loudly(self, monkeypatch,
                                                                csv_with_headers):
        _stub_schema(monkeypatch)
        _stub_dispatcher_ok(monkeypatch)
        # All writeback calls raise — so the final writeback (after retry)
        # still fails.
        monkeypatch.setattr(
            process_submission.sheets_callback, 'update_row',
            MagicMock(side_effect=RuntimeError('sheets API down')))
        _stub_sftp(monkeypatch)
        _stub_subprocess(monkeypatch)

        # process_one must report final-writeback failure so the Action turns red.
        result = _run(monkeypatch, csv_with_headers)
        assert result['status'] == 'error' or result.get('exit_code', 0) != 0
        assert result.get('exit_code', 0) != 0


class TestCodexReviewFindings:
    """Regressions for two real bugs codex 5.4 surfaced in the initial PR."""

    def test_sentinel_writes_live_on_sftp_success(self, monkeypatch,
                                                  csv_with_headers):
        """An archived row recovered via sweep retry must be writeback'd to
        'live' so the cron sweeper's 'archived > 24h' query stops re-firing
        it. Without this, every sweep tick re-dispatches the same row.
        """
        _stub_schema(monkeypatch)
        monkeypatch.setattr(process_submission, 'dispatch_url', MagicMock())
        monkeypatch.setattr(process_submission, 'categorize', MagicMock())
        sheets_mock = _stub_sheets(monkeypatch)
        _stub_sftp(monkeypatch)
        _stub_subprocess(monkeypatch)

        result = _run(monkeypatch, csv_with_headers,
                      url='https://example.com/sweep-noop-1748147200',
                      sheet_row=42)

        # Sentinel + successful SFTP must writeback status='live' for the
        # originally-archived row (row 42), so the sweeper stops re-firing.
        live_calls = [c for c in sheets_mock.call_args_list
                      if c.kwargs.get('status') == 'live'
                      and c.kwargs.get('row') == 42]
        assert live_calls, (
            'sentinel retry must writeback live on SFTP success — '
            f'got calls: {sheets_mock.call_args_list}'
        )
        assert result['status'] in ('noop', 'live')

    def test_sentinel_keeps_archived_on_sftp_failure(self, monkeypatch,
                                                     csv_with_headers):
        """When the sentinel SFTP retry itself fails, the row must stay at
        'archived' so the next sweep tick retries again — must NOT writeback
        'live' (which would prematurely declare success).
        """
        _stub_schema(monkeypatch)
        monkeypatch.setattr(process_submission, 'dispatch_url', MagicMock())
        monkeypatch.setattr(process_submission, 'categorize', MagicMock())
        sheets_mock = _stub_sheets(monkeypatch)
        _stub_sftp(monkeypatch,
                   result={'ok': False, 'skipped': False,
                           'files_pushed': 0, 'error': 'host unreachable'})
        _stub_subprocess(monkeypatch)

        _run(monkeypatch, csv_with_headers,
             url='https://example.com/sweep-noop-1748147200',
             sheet_row=42)

        live_calls = [c for c in sheets_mock.call_args_list
                      if c.kwargs.get('status') == 'live']
        assert not live_calls, (
            'sentinel must NOT writeback live when SFTP retry itself failed'
        )

    def test_dispatcher_failure_payload_writes_error(self, monkeypatch,
                                                     csv_with_headers):
        """Existing platform dispatchers (Bluesky, Twitter, article) can return
        a truthy ``{'status': 'failed', 'error': ...}`` payload instead of
        None. The submission flow must treat that as a scrape error and
        writeback 'error' — not commit + deploy a broken record.
        """
        _stub_schema(monkeypatch)
        monkeypatch.setattr(
            process_submission, 'dispatch_url',
            MagicMock(return_value={'status': 'failed',
                                    'error': 'URL blocked by source site'}))
        sheets_mock = _stub_sheets(monkeypatch)
        sftp_mock = _stub_sftp(monkeypatch)
        _stub_subprocess(monkeypatch)

        result = _run(monkeypatch, csv_with_headers,
                      url='https://example.com/blocked')

        assert result['status'] == 'error'
        assert 'URL blocked by source site' in result['error']
        # No SFTP, no git commit — the broken payload must NOT publish.
        sftp_mock.assert_not_called()
        git_calls = [c for c in process_submission.subprocess.run.call_args_list
                     if c.args[0][:2] == ['git', 'commit']]
        assert git_calls == [], 'must not commit on dispatcher failure payload'
        error_calls = [c for c in sheets_mock.call_args_list
                       if c.kwargs.get('status') == 'error']
        assert error_calls, 'must writeback error status on dispatcher failure'
