# -*- coding: utf-8 -*-
"""Tests for processor.process_batch — the wiring that promotes 'archived'
submissions to 'live' after SFTP and writes status back to the Apps Script sheet.

Mocks at module boundaries (db / scraper / sftp_push / sheets_callback) since
the orchestration logic is what matters — the underlying integrations have
their own tests.
"""
import sys
import pathlib
from unittest.mock import MagicMock

import pytest

_BACKEND = pathlib.Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

pytest.importorskip("flask")  # processor imports submission_server.app indirectly

from submission_server import processor  # noqa: E402


def _make_pending(sub_id, url, **overrides):
    base = {
        'id': sub_id, 'url': url, 'title': '', 'publication': '',
        'date_published': '', 'categories': '', 'notes': '',
        'sheet_id': '', 'sheet_tab': '', 'sheet_row': None,
    }
    base.update(overrides)
    return base


def _patch_pipeline(monkeypatch, pending, scrape_result=None,
                    csv_append_ok=True, regen_ok=True,
                    push_result=None):
    """Stub out every external dependency of process_batch."""
    monkeypatch.setattr(processor, '_load_schema', lambda: {'output_headers': ['id', 'url']})
    monkeypatch.setattr(processor, '_load_known_entities', lambda: {})
    monkeypatch.setattr(processor, '_get_existing_ids', lambda: set())
    monkeypatch.setattr(processor, '_get_existing_urls', lambda: set())
    monkeypatch.setattr(processor.db, 'get_pending_submissions', lambda: pending)
    monkeypatch.setattr(processor.db, 'update_submission_status', MagicMock())
    monkeypatch.setattr(processor.db, 'log_processing_run', MagicMock())
    monkeypatch.setattr(processor, 'process_single_url',
                        lambda *a, **kw: scrape_result)
    monkeypatch.setattr(processor, '_append_to_csv',
                        lambda *a, **kw: csv_append_ok)
    monkeypatch.setattr(processor, '_regenerate_json', lambda: regen_ok)
    monkeypatch.setattr(processor, '_stage_for_ftp', lambda: True)
    # The post-stage push gate: after the codex-fix refactor, the push fires
    # whenever staging has content. Default to True so existing tests that
    # exercise the success path still drive the push.
    monkeypatch.setattr(processor, '_staging_has_content', lambda: True)
    push_mock = MagicMock(return_value=(push_result or
                                        {'ok': True, 'skipped': False,
                                         'files_pushed': 4, 'error': None}))
    monkeypatch.setattr(processor.sftp_push, 'push_to_production', push_mock)
    sheets_mock = MagicMock(return_value={'ok': True, 'skipped': False, 'error': None})
    monkeypatch.setattr(processor.sheets_callback, 'update_row', sheets_mock)
    return push_mock, sheets_mock


class TestStatusPromotion:
    """After a successful SFTP push, archived rows get bumped to 'live'."""

    def test_successful_sftp_promotes_archived_to_live(self, monkeypatch):
        pending = [_make_pending(1, 'https://example.com/a',
                                 sheet_id='SHEET', sheet_tab='Queue', sheet_row=3)]
        scrape = {'id': 'RECORD-00100', 'url': 'https://example.com/a'}
        _, sheets_mock = _patch_pipeline(monkeypatch, pending,
                                         scrape_result=scrape)

        result = processor.process_batch(trigger='test')

        assert result['succeeded'] == 1
        sheets_mock.assert_called_once()
        kwargs = sheets_mock.call_args.kwargs
        assert kwargs['status'] == 'live'
        assert kwargs['record_id'] == 'RECORD-00100'
        assert kwargs['row'] == 3

    def test_failed_sftp_keeps_archived_with_retry_note(self, monkeypatch):
        pending = [_make_pending(1, 'https://example.com/b',
                                 sheet_id='SHEET', sheet_tab='Queue', sheet_row=4)]
        scrape = {'id': 'RECORD-00200', 'url': 'https://example.com/b'}
        _, sheets_mock = _patch_pipeline(
            monkeypatch, pending, scrape_result=scrape,
            push_result={'ok': False, 'skipped': False,
                         'files_pushed': 0, 'error': 'SSH timeout'})

        processor.process_batch(trigger='test')

        kwargs = sheets_mock.call_args.kwargs
        assert kwargs['status'] == 'archived'
        # The error column tells Jay (or Joe) why the row isn't live yet.
        assert 'retry' in kwargs['error'].lower() or 'will retry' in kwargs['error']
        assert 'SSH timeout' in kwargs['error']

    def test_skipped_sftp_records_not_configured(self, monkeypatch):
        """Dev env (no SFTP creds) marks archived rows with a clear status."""
        pending = [_make_pending(1, 'https://example.com/c',
                                 sheet_id='SHEET', sheet_tab='Queue', sheet_row=5)]
        scrape = {'id': 'RECORD-00300', 'url': 'https://example.com/c'}
        _, sheets_mock = _patch_pipeline(
            monkeypatch, pending, scrape_result=scrape,
            push_result={'ok': True, 'skipped': True,
                         'files_pushed': 0, 'error': None})

        processor.process_batch(trigger='test')

        kwargs = sheets_mock.call_args.kwargs
        assert kwargs['status'] == 'archived'
        assert 'not configured' in kwargs['error'].lower() or 'deploy' in kwargs['error'].lower()


class TestPerOutcomeWritebacks:
    """Every outcome (duplicate, scrape failure, CSV failure, success) hits the sheet."""

    def test_duplicate_writes_duplicate_status(self, monkeypatch):
        pending = [_make_pending(1, 'https://example.com/dup',
                                 sheet_id='SHEET', sheet_tab='Queue', sheet_row=10)]
        monkeypatch.setattr(processor, '_load_schema', lambda: {'output_headers': []})
        monkeypatch.setattr(processor, '_load_known_entities', lambda: {})
        monkeypatch.setattr(processor, '_get_existing_ids', lambda: set())
        # URL already in archive — first short-circuit branch in the loop.
        monkeypatch.setattr(processor, '_get_existing_urls',
                            lambda: {'https://example.com/dup'})
        monkeypatch.setattr(processor.db, 'get_pending_submissions', lambda: pending)
        monkeypatch.setattr(processor.db, 'update_submission_status', MagicMock())
        monkeypatch.setattr(processor.db, 'log_processing_run', MagicMock())
        sheets_mock = MagicMock(return_value={'ok': True, 'skipped': False})
        monkeypatch.setattr(processor.sheets_callback, 'update_row', sheets_mock)

        processor.process_batch(trigger='test')

        sheets_mock.assert_called_once()
        assert sheets_mock.call_args.kwargs['status'] == 'duplicate'

    def test_scrape_returning_none_writes_error(self, monkeypatch):
        pending = [_make_pending(1, 'https://example.com/dead',
                                 sheet_id='SHEET', sheet_tab='Queue', sheet_row=11)]
        _, sheets_mock = _patch_pipeline(monkeypatch, pending, scrape_result=None)

        processor.process_batch(trigger='test')

        kwargs = sheets_mock.call_args.kwargs
        assert kwargs['status'] == 'error'
        assert kwargs['record_id'] == ''
        assert 'no data' in kwargs['error'].lower() or 'unreachable' in kwargs['error'].lower()

    def test_no_sheet_id_means_no_callback(self, monkeypatch):
        """A web-form submission has no sheet row — callback must not fire."""
        pending = [_make_pending(1, 'https://example.com/web-only')]  # no sheet_*
        scrape = {'id': 'RECORD-00400', 'url': 'https://example.com/web-only'}
        _, sheets_mock = _patch_pipeline(monkeypatch, pending, scrape_result=scrape)

        processor.process_batch(trigger='test')

        sheets_mock.assert_not_called()


class TestSheetsCallbackResilience:
    """A sheets_callback exception must not crash the batch."""

    def test_callback_raise_does_not_kill_batch(self, monkeypatch):
        pending = [_make_pending(1, 'https://example.com/x',
                                 sheet_id='SHEET', sheet_tab='Queue', sheet_row=20)]
        scrape = {'id': 'RECORD-00500', 'url': 'https://example.com/x'}
        push_mock, _ = _patch_pipeline(monkeypatch, pending, scrape_result=scrape)
        # Wire a callback that explodes — must NOT propagate.
        monkeypatch.setattr(
            processor.sheets_callback, 'update_row',
            MagicMock(side_effect=RuntimeError('sheets API down')))

        result = processor.process_batch(trigger='test')

        # Batch still reports success — the row made it into the archive
        # whether or not the spreadsheet got the news.
        assert result['succeeded'] == 1
        push_mock.assert_called_once()
