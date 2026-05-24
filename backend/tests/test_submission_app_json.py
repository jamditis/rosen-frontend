# -*- coding: utf-8 -*-
"""Tests for the JSON path of /submit added for the Apps Script caller.

Covers:
  - JSON POST returns {ok, submission_id, ...} instead of HTML.
  - Sheet round-trip fields (sheet_id/sheet_tab/sheet_row) reach the DB.
  - JSON errors return ok=False with a clear message (no HTML masking).
  - JSON dedup short-circuits the queue.
  - Legacy form POST still works (HTML response, no regression).
"""
import importlib
import pathlib
import sys

import pytest

pytest.importorskip("flask")

_BACKEND = pathlib.Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


@pytest.fixture
def client(tmp_path, monkeypatch):
    """A test client whose db lives in a throwaway tmp dir."""
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
    return app_mod.app.test_client(), db_path


def _row(db_path, sub_id):
    import sqlite3
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        return conn.execute(
            "SELECT * FROM submissions WHERE id = ?", (sub_id,)).fetchone()
    finally:
        conn.close()


class TestJsonSubmit:
    """A JSON POST is recognized and produces a JSON response."""

    def test_json_success_returns_ok_true(self, client):
        c, db_path = client
        resp = c.post('/submit', json={
            'url': 'https://example.com/post-a',
            'sheet_id': 'SHEETID',
            'sheet_tab': 'Queue',
            'sheet_row': 11,
        })
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['ok'] is True
        assert body['submitted_url'] == 'https://example.com/post-a'
        assert body['submission_id'] >= 1

        row = _row(db_path, body['submission_id'])
        assert row['sheet_id'] == 'SHEETID'
        assert row['sheet_tab'] == 'Queue'
        assert row['sheet_row'] == 11

    def test_json_missing_url_returns_ok_false(self, client):
        c, _ = client
        resp = c.post('/submit', json={})
        body = resp.get_json()
        assert body['ok'] is False
        assert 'required' in body['error'].lower()

    def test_json_dedup_returns_ok_false(self, client):
        c, _ = client
        c.post('/submit', json={'url': 'https://example.com/dup'})
        resp = c.post('/submit', json={'url': 'https://example.com/dup'})
        body = resp.get_json()
        assert body['ok'] is False
        assert 'already in the queue' in body['error']

    def test_invalid_sheet_row_does_not_crash(self, client):
        """A malformed sheet_row degrades to NULL rather than 500."""
        c, db_path = client
        resp = c.post('/submit', json={
            'url': 'https://example.com/bad-row',
            'sheet_id': 'SHEETID',
            'sheet_row': 'not-an-int',
        })
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['ok'] is True
        row = _row(db_path, body['submission_id'])
        assert row['sheet_row'] is None
        # sheet_id still captured — only the bad field falls through.
        assert row['sheet_id'] == 'SHEETID'


class TestSsrfGuard:
    """The SSRF guard fires on JSON callers same as on the form."""

    def test_loopback_url_rejected_json(self, client):
        c, _ = client
        resp = c.post('/submit', json={'url': 'http://127.0.0.1/admin'})
        body = resp.get_json()
        assert body['ok'] is False
        assert 'cannot be accepted' in body['error']


class TestFormBackcompat:
    """The legacy HTML form path is unchanged."""

    def test_form_post_returns_html(self, client):
        c, _ = client
        resp = c.post('/submit', data={'url': 'https://example.com/form-post'})
        assert resp.status_code == 200
        assert b'<' in resp.data  # rendered HTML, not JSON
        assert resp.content_type.startswith('text/html')
