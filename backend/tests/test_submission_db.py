"""
Tests for submission_server.db — the SQLite submission queue.

Focused on update_submission_status, which must not stamp processed_at on an
in-flight row and must not erase record_id / error_message recorded by an
earlier transition. See issue #150.
"""
import sqlite3

import pytest

from submission_server import db


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    """Point the db module at a throwaway SQLite file and create the schema."""
    db_path = tmp_path / "submissions.db"
    monkeypatch.setattr(db, "DATABASE_PATH", db_path)
    db.init_db()
    return db_path


def _row(db_path, submission_id):
    """Read one submission row straight from the SQLite file."""
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        return conn.execute(
            "SELECT * FROM submissions WHERE id = ?", (submission_id,)
        ).fetchone()
    finally:
        conn.close()


class TestUpdateSubmissionStatus:
    """update_submission_status must do partial, context-preserving updates."""

    def test_intermediate_status_leaves_processed_at_null(self, temp_db):
        """A 'processing' row has not finished, so processed_at stays NULL."""
        sub_id = db.add_submission("https://example.com/a")
        db.update_submission_status(sub_id, "processing")

        row = _row(temp_db, sub_id)
        assert row["status"] == "processing"
        assert row["processed_at"] is None

    def test_terminal_status_stamps_processed_at(self, temp_db):
        """A terminal status records both processed_at and the record id."""
        sub_id = db.add_submission("https://example.com/b")
        db.update_submission_status(sub_id, "processing")
        db.update_submission_status(sub_id, "completed", record_id="REC-1")

        row = _row(temp_db, sub_id)
        assert row["status"] == "completed"
        assert row["processed_at"] is not None
        assert row["record_id"] == "REC-1"

    def test_transition_preserves_earlier_error_message(self, temp_db):
        """A transition that supplies no error_message must not erase it."""
        sub_id = db.add_submission("https://example.com/c")
        db.update_submission_status(sub_id, "failed", error_message="dispatch boom")
        db.update_submission_status(sub_id, "processing")

        row = _row(temp_db, sub_id)
        assert row["error_message"] == "dispatch boom"

    def test_transition_preserves_earlier_record_id(self, temp_db):
        """A later transition without a record_id keeps the one already stored."""
        sub_id = db.add_submission("https://example.com/d")
        db.update_submission_status(sub_id, "completed", record_id="REC-42")
        db.update_submission_status(sub_id, "failed", error_message="late failure")

        row = _row(temp_db, sub_id)
        assert row["record_id"] == "REC-42"
        assert row["error_message"] == "late failure"
