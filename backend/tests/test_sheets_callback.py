# -*- coding: utf-8 -*-
"""Tests for submission_server.sheets_callback — status writeback to Apps Script sheet.

Covers the load-bearing behaviors:
  - Missing SA key: silent no-op (dev / CI shouldn't need real creds).
  - Missing sheet_id or sheet_row: skipped (rows came from non-sheet sources).
  - Successful call: one batchUpdate touching exactly cells F, G, H of the right row.
  - HTTP error: surfaced as ok=False, never raises.
"""
import json
import sys
import pathlib
from unittest.mock import MagicMock, patch

import pytest

_BACKEND = pathlib.Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

pytest.importorskip("googleapiclient")

from submission_server import sheets_callback  # noqa: E402


SA_INFO = {
    "type": "service_account",
    "project_id": "rosen-test",
    "private_key_id": "x",
    "private_key": "-----BEGIN PRIVATE KEY-----\nstub\n-----END PRIVATE KEY-----\n",
    "client_email": "rosen-test@rosen-test.iam.gserviceaccount.com",
    "client_id": "123",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
}


class TestSkipPaths:
    """When the callback can't possibly succeed it must skip quietly."""

    def test_no_sheet_id_skips(self, monkeypatch):
        monkeypatch.setenv('ROSEN_SHEETS_SA_KEY_JSON', json.dumps(SA_INFO))
        result = sheets_callback.update_row(
            sheet_id='', sheet_tab='Queue', row=5, status='live')
        assert result['skipped'] is True
        assert 'missing sheet_id' in result['error']

    def test_no_row_skips(self, monkeypatch):
        monkeypatch.setenv('ROSEN_SHEETS_SA_KEY_JSON', json.dumps(SA_INFO))
        result = sheets_callback.update_row(
            sheet_id='abc', sheet_tab='Queue', row=0, status='live')
        assert result['skipped'] is True

    def test_no_credentials_skips_but_returns_ok(self, monkeypatch):
        """Dev/CI runs without SA configured should not break the pipeline."""
        monkeypatch.delenv('ROSEN_SHEETS_SA_KEY', raising=False)
        monkeypatch.delenv('ROSEN_SHEETS_SA_KEY_JSON', raising=False)
        result = sheets_callback.update_row(
            sheet_id='abc', sheet_tab='Queue', row=5, status='live')
        assert result['ok'] is True
        assert result['skipped'] is True


class TestSuccessfulWriteback:
    """A configured callback writes status, record_id, error to F/G/H in one batchUpdate."""

    def test_batch_update_targets_F_G_H_of_given_row(self, monkeypatch):
        monkeypatch.setenv('ROSEN_SHEETS_SA_KEY_JSON', json.dumps(SA_INFO))

        with patch.object(sheets_callback, '_load_credentials',
                          return_value=MagicMock()), \
             patch('googleapiclient.discovery.build') as mock_build:
            mock_service = MagicMock()
            mock_build.return_value = mock_service
            batch = mock_service.spreadsheets.return_value.values.return_value.batchUpdate

            result = sheets_callback.update_row(
                sheet_id='SHEET1', sheet_tab='Queue', row=42,
                status='live', record_id='RECORD-00933', error='')

        assert result['ok'] is True
        assert result['error'] is None
        batch.assert_called_once()
        body = batch.call_args.kwargs['body']
        ranges = [d['range'] for d in body['data']]
        # Always-quoted per A1 notation safety (codex/Copilot finding on #212).
        assert ranges == ["'Queue'!F42", "'Queue'!G42", "'Queue'!H42"]
        values = [d['values'][0][0] for d in body['data']]
        assert values == ['live', 'RECORD-00933', '']

    def test_tab_defaults_to_Sheet1_when_blank(self, monkeypatch):
        monkeypatch.setenv('ROSEN_SHEETS_SA_KEY_JSON', json.dumps(SA_INFO))

        with patch.object(sheets_callback, '_load_credentials',
                          return_value=MagicMock()), \
             patch('googleapiclient.discovery.build') as mock_build:
            mock_service = MagicMock()
            mock_build.return_value = mock_service
            batch = mock_service.spreadsheets.return_value.values.return_value.batchUpdate

            sheets_callback.update_row(
                sheet_id='SHEET1', sheet_tab='', row=1, status='queued')

        ranges = [d['range'] for d in batch.call_args.kwargs['body']['data']]
        # Always-quoted, including the Sheet1 default.
        assert all(r.startswith("'Sheet1'!") for r in ranges)


class TestHttpErrorReporting:
    """A 4xx / 5xx response surfaces as ok=False, error populated."""

    def test_http_error_does_not_raise(self, monkeypatch):
        from googleapiclient.errors import HttpError

        monkeypatch.setenv('ROSEN_SHEETS_SA_KEY_JSON', json.dumps(SA_INFO))

        fake_resp = MagicMock()
        fake_resp.status = 403
        fake_resp.reason = 'Forbidden'

        with patch.object(sheets_callback, '_load_credentials',
                          return_value=MagicMock()), \
             patch('googleapiclient.discovery.build') as mock_build:
            mock_service = MagicMock()
            mock_service.spreadsheets.return_value.values.return_value.batchUpdate.return_value.execute.side_effect = \
                HttpError(fake_resp, b'denied')
            mock_build.return_value = mock_service

            result = sheets_callback.update_row(
                sheet_id='SHEET1', sheet_tab='Queue', row=1, status='live')

        assert result['ok'] is False
        assert 'HTTP error' in result['error']
