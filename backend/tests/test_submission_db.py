"""
Tests for submission_server.db — the SQLite submission queue.

Covers update_submission_status (see issue #150) plus the queue helpers — add,
query, stats, run logging — that the queue and batch path depend on (issue #175).
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


def _stamp_submitted_at(db_path, submission_id, iso_timestamp):
    """Force a specific submitted_at on a row.

    SQLite's ``CURRENT_TIMESTAMP`` has 1-second resolution, so rows inserted
    in a tight loop tie on submitted_at and any ORDER BY on that column is
    not deterministic. Tests that exercise ordering set the timestamp by hand.
    """
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute(
            "UPDATE submissions SET submitted_at = ? WHERE id = ?",
            (iso_timestamp, submission_id),
        )
        conn.commit()
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


class TestAddSubmission:
    """add_submission persists the row, trims whitespace, and carries sheet fields."""

    def test_returns_increasing_ids(self, temp_db):
        first = db.add_submission("https://example.com/a")
        second = db.add_submission("https://example.com/b")
        assert isinstance(first, int)
        assert second > first

    def test_strips_whitespace_on_text_fields(self, temp_db):
        sub_id = db.add_submission(
            "  https://example.com/x  ",
            title="  Heading  ",
            publication="  Pub  ",
            date_published="  2026-05-26  ",
            categories="  Politics & Democracy  ",
            notes="  hello  ",
        )
        row = _row(temp_db, sub_id)
        assert row["url"] == "https://example.com/x"
        assert row["title"] == "Heading"
        assert row["publication"] == "Pub"
        assert row["date_published"] == "2026-05-26"
        assert row["categories"] == "Politics & Democracy"
        assert row["notes"] == "hello"

    def test_defaults_status_to_pending(self, temp_db):
        sub_id = db.add_submission("https://example.com/p")
        row = _row(temp_db, sub_id)
        assert row["status"] == "pending"
        assert row["submitted_at"] is not None
        assert row["processed_at"] is None

    def test_persists_sheet_round_trip_fields(self, temp_db):
        sub_id = db.add_submission(
            "https://example.com/sheet",
            sheet_id="SHEET-1",
            sheet_tab="Inbox",
            sheet_row=7,
        )
        row = _row(temp_db, sub_id)
        assert row["sheet_id"] == "SHEET-1"
        assert row["sheet_tab"] == "Inbox"
        assert row["sheet_row"] == 7

    def test_sheet_fields_default_to_empty_or_none(self, temp_db):
        """A web-form submission omits sheet fields; they store as empty/None."""
        sub_id = db.add_submission("https://example.com/no-sheet")
        row = _row(temp_db, sub_id)
        assert row["sheet_id"] == ""
        assert row["sheet_tab"] == ""
        assert row["sheet_row"] is None


class TestPendingQueries:
    """get_pending_submissions and get_pending_count filter by status only."""

    def test_pending_count_with_mixed_statuses(self, temp_db):
        a = db.add_submission("https://example.com/a")
        db.add_submission("https://example.com/b")
        db.add_submission("https://example.com/c")
        db.update_submission_status(a, "completed", record_id="REC-1")

        assert db.get_pending_count() == 2

    def test_pending_count_empty_queue(self, temp_db):
        assert db.get_pending_count() == 0

    def test_pending_excludes_terminal_and_processing_rows(self, temp_db):
        pending_id = db.add_submission("https://example.com/pending")
        completed_id = db.add_submission("https://example.com/completed")
        failed_id = db.add_submission("https://example.com/failed")
        duplicate_id = db.add_submission("https://example.com/duplicate")
        processing_id = db.add_submission("https://example.com/processing")
        db.update_submission_status(completed_id, "completed", record_id="REC-1")
        db.update_submission_status(failed_id, "failed", error_message="boom")
        db.update_submission_status(duplicate_id, "duplicate")
        db.update_submission_status(processing_id, "processing")

        rows = db.get_pending_submissions()
        assert [r["id"] for r in rows] == [pending_id]

    def test_pending_orders_by_submitted_at_ascending(self, temp_db):
        first = db.add_submission("https://example.com/first")
        second = db.add_submission("https://example.com/second")
        third = db.add_submission("https://example.com/third")
        # Stamp explicit, well-separated timestamps so the ORDER BY is exercised
        # rather than racing the 1-second CURRENT_TIMESTAMP resolution.
        _stamp_submitted_at(temp_db, first, "2026-05-26T09:00:00")
        _stamp_submitted_at(temp_db, second, "2026-05-26T09:00:01")
        _stamp_submitted_at(temp_db, third, "2026-05-26T09:00:02")

        rows = db.get_pending_submissions()
        assert [r["id"] for r in rows] == [first, second, third]


class TestRecentAndLookup:
    """get_recent_submissions and get_submission_by_url shape and filter rows."""

    def test_recent_orders_by_submitted_at_descending(self, temp_db):
        first = db.add_submission("https://example.com/first")
        second = db.add_submission("https://example.com/second")
        third = db.add_submission("https://example.com/third")
        _stamp_submitted_at(temp_db, first, "2026-05-26T09:00:00")
        _stamp_submitted_at(temp_db, second, "2026-05-26T09:00:01")
        _stamp_submitted_at(temp_db, third, "2026-05-26T09:00:02")

        rows = db.get_recent_submissions()
        assert [r["id"] for r in rows] == [third, second, first]

    def test_recent_honors_limit(self, temp_db):
        for i in range(5):
            db.add_submission(f"https://example.com/{i}")

        rows = db.get_recent_submissions(limit=2)
        assert len(rows) == 2

    def test_lookup_by_url_returns_latest_match(self, temp_db):
        url = "https://example.com/twice"
        older = db.add_submission(url)
        newer = db.add_submission(url)
        _stamp_submitted_at(temp_db, older, "2026-05-26T09:00:00")
        _stamp_submitted_at(temp_db, newer, "2026-05-26T09:00:01")

        match = db.get_submission_by_url(url)
        assert match is not None
        assert match["id"] == newer
        assert match["id"] != older

    def test_lookup_by_url_strips_whitespace(self, temp_db):
        db.add_submission("https://example.com/strip")
        match = db.get_submission_by_url("  https://example.com/strip  ")
        assert match is not None
        assert match["url"] == "https://example.com/strip"

    def test_lookup_by_url_returns_none_when_missing(self, temp_db):
        assert db.get_submission_by_url("https://example.com/never") is None


class TestProcessingRuns:
    """log_processing_run + get_last_processing_run round-trip and ordering."""

    def test_round_trip_run_fields(self, temp_db):
        run_id = db.log_processing_run(
            started_at="2026-05-26T09:00:00",
            completed_at="2026-05-26T09:01:00",
            trigger="manual",
            processed=3,
            succeeded=2,
            failed=1,
        )
        assert isinstance(run_id, int)

        latest = db.get_last_processing_run()
        assert latest is not None
        assert latest["trigger"] == "manual"
        assert latest["submissions_processed"] == 3
        assert latest["submissions_succeeded"] == 2
        assert latest["submissions_failed"] == 1

    def test_latest_run_wins(self, temp_db):
        # log_processing_run takes started_at as a caller-supplied string, so
        # the ORDER BY is deterministic without monkeying with timestamps.
        db.log_processing_run("2026-05-26T08:00:00", "2026-05-26T08:01:00",
                              "scheduled", 0, 0, 0)
        db.log_processing_run("2026-05-26T09:00:00", "2026-05-26T09:01:00",
                              "manual", 1, 1, 0)

        latest = db.get_last_processing_run()
        assert latest["trigger"] == "manual"

    def test_get_last_run_empty(self, temp_db):
        assert db.get_last_processing_run() is None


class TestQueueStats:
    """get_queue_stats reports counts per status plus total."""

    def test_empty_stats(self, temp_db):
        stats = db.get_queue_stats()
        assert stats == {"pending": 0, "completed": 0, "failed": 0, "total": 0}

    def test_stats_split_by_status(self, temp_db):
        pending_id = db.add_submission("https://example.com/p")  # noqa: F841
        completed_id = db.add_submission("https://example.com/c")
        failed_id = db.add_submission("https://example.com/f")
        duplicate_id = db.add_submission("https://example.com/d")
        db.update_submission_status(completed_id, "completed", record_id="REC-1")
        db.update_submission_status(failed_id, "failed", error_message="boom")
        db.update_submission_status(duplicate_id, "duplicate")

        stats = db.get_queue_stats()
        # The stats helper counts pending/completed/failed plus total; duplicate
        # rows are included in total but not broken out.
        assert stats["pending"] == 1
        assert stats["completed"] == 1
        assert stats["failed"] == 1
        assert stats["total"] == 4


class TestInitDb:
    """init_db is idempotent and back-fills the sheet round-trip columns."""

    def test_init_db_is_idempotent(self, temp_db):
        # Schema already created by the fixture; a second call must not raise.
        db.init_db()
        sub_id = db.add_submission("https://example.com/after-reinit")
        assert _row(temp_db, sub_id) is not None

    def test_init_db_back_fills_sheet_columns(self, tmp_path, monkeypatch):
        """A legacy DB that predates the Sheets-callback columns is migrated."""
        legacy_path = tmp_path / "legacy.db"
        # Build the pre-Sheets schema by hand — no sheet_id/sheet_tab/sheet_row.
        conn = sqlite3.connect(str(legacy_path))
        conn.executescript(
            """
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
            """
        )
        conn.commit()
        conn.close()

        monkeypatch.setattr(db, "DATABASE_PATH", legacy_path)
        db.init_db()

        # Migrated schema must expose the three new columns.
        conn = sqlite3.connect(str(legacy_path))
        cols = {row[1] for row in conn.execute("PRAGMA table_info(submissions)")}
        conn.close()
        assert {"sheet_id", "sheet_tab", "sheet_row"}.issubset(cols)
