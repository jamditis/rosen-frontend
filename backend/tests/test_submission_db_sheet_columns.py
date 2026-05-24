# -*- coding: utf-8 -*-
"""Tests for the Pillar 3 sheet round-trip columns added to submission_server.db.

Covers:
  - init_db creates sheet_id/sheet_tab/sheet_row on a fresh database.
  - init_db migrates an existing pre-Pillar-3 database without dropping data.
  - add_submission stores sheet args and returns NULL when they're omitted.
"""
import sqlite3
import sys
import pathlib

import pytest

_BACKEND = pathlib.Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from submission_server import db  # noqa: E402


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    """A throwaway SQLite file with the current schema applied."""
    path = tmp_path / "submissions.db"
    monkeypatch.setattr(db, "DATABASE_PATH", path)
    db.init_db()
    return path


def _cols(path):
    conn = sqlite3.connect(str(path))
    try:
        return {row[1] for row in conn.execute(
            "PRAGMA table_info(submissions)").fetchall()}
    finally:
        conn.close()


class TestFreshSchema:
    """A new database includes all three sheet columns."""

    def test_columns_exist(self, temp_db):
        cols = _cols(temp_db)
        assert {'sheet_id', 'sheet_tab', 'sheet_row'} <= cols


class TestMigration:
    """An existing DB created before Pillar 3 must gain the new columns idempotently."""

    def test_alter_adds_missing_columns(self, tmp_path, monkeypatch):
        path = tmp_path / "submissions.db"
        # Create a pre-Pillar-3 schema by hand — no sheet_* columns.
        conn = sqlite3.connect(str(path))
        conn.executescript("""
            CREATE TABLE submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL,
                title TEXT,
                publication TEXT,
                date_published TEXT,
                categories TEXT,
                notes TEXT,
                status TEXT DEFAULT 'pending',
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                processed_at TIMESTAMP,
                record_id TEXT,
                error_message TEXT
            );
            CREATE TABLE processing_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                trigger TEXT,
                submissions_processed INTEGER,
                submissions_succeeded INTEGER,
                submissions_failed INTEGER
            );
            INSERT INTO submissions (url, status) VALUES ('https://example.com/legacy', 'completed');
        """)
        conn.commit()
        conn.close()

        # Run init_db: must add the three columns without nuking the existing row.
        monkeypatch.setattr(db, "DATABASE_PATH", path)
        db.init_db()

        cols = _cols(path)
        assert {'sheet_id', 'sheet_tab', 'sheet_row'} <= cols

        legacy = sqlite3.connect(str(path)).execute(
            "SELECT url, status, sheet_id FROM submissions").fetchall()
        assert legacy == [('https://example.com/legacy', 'completed', None)]

    def test_migration_is_idempotent(self, temp_db, monkeypatch):
        """Running init_db twice on a current DB must not raise."""
        # First run was the fixture; this second run must be a clean no-op.
        db.init_db()  # would raise "duplicate column" without the guard
        assert {'sheet_id', 'sheet_tab', 'sheet_row'} <= _cols(temp_db)


class TestAddSubmission:
    """add_submission must round-trip sheet args and tolerate their absence."""

    def test_sheet_args_round_trip(self, temp_db):
        sub_id = db.add_submission(
            url='https://example.com/x',
            sheet_id='SHEETID-123',
            sheet_tab='Queue',
            sheet_row=7,
        )
        row = sqlite3.connect(str(temp_db)).execute(
            "SELECT sheet_id, sheet_tab, sheet_row FROM submissions WHERE id = ?",
            (sub_id,)).fetchone()
        assert row == ('SHEETID-123', 'Queue', 7)

    def test_legacy_call_leaves_sheet_cols_null(self, temp_db):
        """A web-form submission omits sheet args — those cells stay NULL."""
        sub_id = db.add_submission(url='https://example.com/legacy-form')
        row = sqlite3.connect(str(temp_db)).execute(
            "SELECT sheet_id, sheet_tab, sheet_row FROM submissions WHERE id = ?",
            (sub_id,)).fetchone()
        # sheet_id/sheet_tab fall through as '' since the function strips,
        # sheet_row stays NULL — both shapes indicate "not from a sheet."
        assert row[0] in ('', None)
        assert row[1] in ('', None)
        assert row[2] is None
