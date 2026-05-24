# -*- coding: utf-8 -*-
"""Failing-test-first coverage for the bugs Codex + Copilot flagged on PR #212.

One test class per bug, named after the finding. Each test fails against the
current code; the same-PR fixes make them pass. Bug-fix workflow per CLAUDE.md:
write the failing test before the fix.

Bugs covered:
  - app.py /submit returns 200 + ok:false on validation/dedup/SSRF errors.
    Apps Script treats 200 as success and never parses the body, so the sheet
    sticks at 'submitted'. Server should return 4xx for JSON callers.
  - processor.process_batch gates the SFTP push on succeeded > 0; a batch of
    pure dups/failures leaves stale staged files on prod indefinitely.
  - processor.process_batch promotion loop writes 'not configured' when
    json_ok=False, but that's misleading — JSON regen failed, deploy wasn't
    skipped because of missing creds.
  - sftp_push._read_env crashes the batch when ROSEN_SFTP_PORT is non-integer.
  - sheets_callback.update_row breaks for tab names containing spaces/specials
    because A1 notation requires quoting.
"""
import json
import importlib
import pathlib
import sys
from unittest.mock import patch, MagicMock

import pytest

_BACKEND = pathlib.Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

pytest.importorskip("flask")
pytest.importorskip("paramiko")
pytest.importorskip("googleapiclient")


# -----------------------------------------------------------------------------
# /submit JSON status codes (Copilot finding #5/#6)
# -----------------------------------------------------------------------------
@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.delenv("SUBMISSION_AUTH_TOKEN", raising=False)
    db_path = tmp_path / "submissions.db"
    from submission_server import config as config_mod
    importlib.reload(config_mod)
    monkeypatch.setattr(config_mod, "DATABASE_PATH", db_path)
    from submission_server import db as db_mod
    importlib.reload(db_mod)
    monkeypatch.setattr(db_mod, "DATABASE_PATH", db_path)
    db_mod.init_db()
    from submission_server import app as app_mod
    importlib.reload(app_mod)
    app_mod.app.config.update(TESTING=True)
    return app_mod.app.test_client()


class TestJsonSubmitReturnsNon2xxOnError:
    """The Apps Script client checks the HTTP status code; JSON errors must
    return 4xx so a row doesn't get silently stuck at 'submitted'."""

    def test_missing_url_returns_400(self, client):
        resp = client.post('/submit', json={})
        assert resp.status_code == 400
        body = resp.get_json()
        assert body['ok'] is False

    def test_ssrf_url_returns_422(self, client):
        resp = client.post('/submit', json={'url': 'http://127.0.0.1/admin'})
        assert resp.status_code == 422
        assert resp.get_json()['ok'] is False

    def test_duplicate_returns_409(self, client):
        client.post('/submit', json={'url': 'https://example.com/dup-409'})
        resp = client.post('/submit', json={'url': 'https://example.com/dup-409'})
        assert resp.status_code == 409
        assert resp.get_json()['ok'] is False

    def test_html_form_still_200_on_error(self, client):
        """The legacy HTML path keeps 200 — the template renders the error."""
        resp = client.post('/submit', data={})  # form-encoded, no url
        assert resp.status_code == 200
        assert resp.content_type.startswith('text/html')


# -----------------------------------------------------------------------------
# processor SFTP retry gating (codex finding #3)
# -----------------------------------------------------------------------------
def _make_pending(sub_id, url, **overrides):
    base = {
        'id': sub_id, 'url': url, 'title': '', 'publication': '',
        'date_published': '', 'categories': '', 'notes': '',
        'sheet_id': '', 'sheet_tab': '', 'sheet_row': None,
    }
    base.update(overrides)
    return base


def _patch_processor(monkeypatch, pending, scrape_result=None,
                     csv_ok=True, regen_ok=True, existing_urls=None,
                     push_result=None):
    from submission_server import processor
    monkeypatch.setattr(processor, '_load_schema', lambda: {'output_headers': ['id', 'url']})
    monkeypatch.setattr(processor, '_load_known_entities', lambda: {})
    monkeypatch.setattr(processor, '_get_existing_ids', lambda: set())
    monkeypatch.setattr(processor, '_get_existing_urls',
                        lambda: set(existing_urls or []))
    monkeypatch.setattr(processor.db, 'get_pending_submissions', lambda: pending)
    monkeypatch.setattr(processor.db, 'update_submission_status', MagicMock())
    monkeypatch.setattr(processor.db, 'log_processing_run', MagicMock())
    monkeypatch.setattr(processor, 'process_single_url',
                        lambda *a, **kw: scrape_result)
    monkeypatch.setattr(processor, '_append_to_csv', lambda *a, **kw: csv_ok)
    monkeypatch.setattr(processor, '_regenerate_json', lambda: regen_ok)
    monkeypatch.setattr(processor, '_stage_for_ftp', lambda: True)
    # Default: staging has content. Tests that want to assert the staging
    # gate (e.g. the SFTP retry test) override FTP_STAGING_DIR with a real
    # tmp dir before calling.
    monkeypatch.setattr(processor, '_staging_has_content', lambda: True)
    push_mock = MagicMock(return_value=(push_result or
                                        {'ok': True, 'skipped': False,
                                         'files_pushed': 4, 'error': None}))
    monkeypatch.setattr(processor.sftp_push, 'push_to_production', push_mock)
    sheets_mock = MagicMock(return_value={'ok': True, 'skipped': False,
                                          'error': None})
    monkeypatch.setattr(processor.sheets_callback, 'update_row', sheets_mock)
    return processor, push_mock, sheets_mock


class TestSftpRetryWithoutNewSuccesses:
    """A batch with zero new successes must still retry SFTP when prior
    staging is sitting on disk waiting to deploy."""

    def test_pure_duplicate_batch_still_retries_push(self, monkeypatch, tmp_path):
        # Staging dir has all 4 files (simulating a prior failed push).
        from submission_server import processor
        from submission_server import sftp_push as sftp_mod
        for f in sftp_mod._PUSH_FILES:
            (tmp_path / f).write_text('{}')
        monkeypatch.setattr(processor, 'FTP_STAGING_DIR', tmp_path)

        # All pending submissions are URL dups → succeeded=0.
        pending = [_make_pending(1, 'https://example.com/dup-retry')]
        proc, push_mock, _ = _patch_processor(
            monkeypatch, pending,
            existing_urls=['https://example.com/dup-retry'])

        result = proc.process_batch(trigger='test')

        assert result['succeeded'] == 0
        # The bug: push never fires when succeeded=0. The fix: push fires
        # whenever the staging dir has content, regardless of new successes.
        push_mock.assert_called_once()


# -----------------------------------------------------------------------------
# processor json_ok=False misleading writeback (Copilot finding #7)
# -----------------------------------------------------------------------------
class TestJsonRegenFailureWriteback:
    """When JSON regen fails, the row shouldn't say 'not configured' — that
    misleads the operator into looking at SFTP creds instead of the regen log."""

    def test_regen_failure_writes_distinct_error(self, monkeypatch, tmp_path):
        pending = [_make_pending(1, 'https://example.com/regen-fail',
                                 sheet_id='SHEET', sheet_tab='Queue', sheet_row=9)]
        scrape = {'id': 'RECORD-99999', 'url': 'https://example.com/regen-fail'}
        proc, _, sheets_mock = _patch_processor(
            monkeypatch, pending, scrape_result=scrape, regen_ok=False)

        proc.process_batch(trigger='test')

        kwargs = sheets_mock.call_args.kwargs
        # Status should reflect the actual failure (regen), not deploy config.
        assert 'not configured' not in (kwargs.get('error') or '').lower(), \
            f"misleading error: {kwargs.get('error')!r}"
        # Some explicit signal that regen failed.
        assert 'regen' in (kwargs.get('error') or '').lower() or \
               'json' in (kwargs.get('error') or '').lower()


# -----------------------------------------------------------------------------
# sftp_push ROSEN_SFTP_PORT ValueError (Copilot finding #9)
# -----------------------------------------------------------------------------
class TestSftpPortValidation:
    """A malformed port env value must not crash the batch processor."""

    def test_non_integer_port_returns_skipped(self, tmp_path, monkeypatch):
        from submission_server import sftp_push
        for k in ('ROSEN_SFTP_HOST', 'ROSEN_SFTP_USER',
                  'ROSEN_SFTP_REMOTE_PATH', 'ROSEN_SFTP_PASSWORD',
                  'ROSEN_SFTP_KEY_PATH', 'ROSEN_SFTP_PORT'):
            monkeypatch.delenv(k, raising=False)
        for k, v in (('ROSEN_SFTP_HOST', 'sftp.example.com'),
                     ('ROSEN_SFTP_USER', 'rosen'),
                     ('ROSEN_SFTP_REMOTE_PATH', '/x'),
                     ('ROSEN_SFTP_PASSWORD', 'secret'),
                     ('ROSEN_SFTP_PORT', 'not-an-int')):
            monkeypatch.setenv(k, v)

        # Must not raise — the bug is ValueError leaks out.
        result = sftp_push.push_to_production(tmp_path)
        assert result.get('skipped') is True or result.get('ok') is False
        assert 'port' in (result.get('error') or '').lower() or result.get('skipped')


# -----------------------------------------------------------------------------
# sheets_callback A1 tab quoting (codex finding #4)
# -----------------------------------------------------------------------------
class TestSheetTabQuoting:
    """Tab names with spaces / specials must be wrapped in single quotes
    per Google Sheets A1 notation, otherwise batchUpdate returns 400."""

    def test_tab_with_space_is_quoted_in_range(self, monkeypatch):
        from submission_server import sheets_callback
        sa_info = {
            "type": "service_account", "project_id": "p",
            "private_key_id": "x",
            "private_key": "-----BEGIN PRIVATE KEY-----\nstub\n-----END PRIVATE KEY-----\n",
            "client_email": "x@x.iam.gserviceaccount.com",
            "client_id": "1", "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
        monkeypatch.setenv('ROSEN_SHEETS_SA_KEY_JSON', json.dumps(sa_info))

        with patch.object(sheets_callback, '_load_credentials',
                          return_value=MagicMock()), \
             patch('googleapiclient.discovery.build') as mock_build:
            mock_service = MagicMock()
            mock_build.return_value = mock_service
            batch = mock_service.spreadsheets.return_value.values.return_value.batchUpdate

            sheets_callback.update_row(
                sheet_id='SHEET1', sheet_tab='Archive Queue', row=5,
                status='live', record_id='RECORD-1', error='')

        ranges = [d['range'] for d in batch.call_args.kwargs['body']['data']]
        # The bug: 'Archive Queue!F5' (no quotes). The fix: "'Archive Queue'!F5".
        assert all(r.startswith("'Archive Queue'!") for r in ranges), \
            f"tab not quoted: {ranges}"

    def test_tab_with_apostrophe_escapes_inner_quote(self, monkeypatch):
        """A1 escape: 'Joe''s Sheet'!F5 (double the apostrophe)."""
        from submission_server import sheets_callback
        sa_info = {
            "type": "service_account", "project_id": "p", "private_key_id": "x",
            "private_key": "-----BEGIN PRIVATE KEY-----\nstub\n-----END PRIVATE KEY-----\n",
            "client_email": "x@x.iam.gserviceaccount.com", "client_id": "1",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
        monkeypatch.setenv('ROSEN_SHEETS_SA_KEY_JSON', json.dumps(sa_info))

        with patch.object(sheets_callback, '_load_credentials',
                          return_value=MagicMock()), \
             patch('googleapiclient.discovery.build') as mock_build:
            mock_service = MagicMock()
            mock_build.return_value = mock_service
            batch = mock_service.spreadsheets.return_value.values.return_value.batchUpdate

            sheets_callback.update_row(
                sheet_id='SHEET1', sheet_tab="Joe's Sheet", row=5,
                status='live', record_id='', error='')

        ranges = [d['range'] for d in batch.call_args.kwargs['body']['data']]
        assert all(r.startswith("'Joe''s Sheet'!") for r in ranges), \
            f"apostrophe not escaped: {ranges}"
