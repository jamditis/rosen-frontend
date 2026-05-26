"""
Tests for submission_server.processor — the queue and batch processing path.

Covers process_batch orchestration: status transitions, CSV append, duplicate
detection, run logging, and the CSV sanitizer that guards the shared archive.
The scraper, JSON regen, SFTP push, and sheets writeback are stubbed out so the
test exercises only what processor.process_batch itself is responsible for.
See issue #175.
"""
import csv
import sqlite3

import pytest

from submission_server import db, processor


@pytest.fixture
def temp_env(tmp_path, monkeypatch):
    """Isolate the DB and CSV; stub every side effect the batch reaches for.

    Returns a small bag of paths so individual tests can read what was written.
    """
    # Throwaway DB.
    db_path = tmp_path / "submissions.db"
    monkeypatch.setattr(db, "DATABASE_PATH", db_path)
    db.init_db()

    # Throwaway CSV with the headers the batch expects.
    csv_path = tmp_path / "archive_records-public.csv"
    headers = ["id", "url", "title", "original_publication", "verified", "notes"]
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)

    monkeypatch.setattr(processor, "CSV_FILE", csv_path)

    # Stub schema + known-entities loaders so we don't read the project files.
    monkeypatch.setattr(processor, "_load_schema",
                        lambda: {"output_headers": headers})
    monkeypatch.setattr(processor, "_load_known_entities", lambda: None)

    # Stub the JSON regen, FTP staging, SFTP push, and sheets writeback.
    monkeypatch.setattr(processor, "_regenerate_json", lambda: True)
    monkeypatch.setattr(processor, "_stage_for_ftp", lambda: True)
    monkeypatch.setattr(processor, "_staging_has_content", lambda: False)

    sheets_calls = []

    def _record_sheets(**kwargs):
        sheets_calls.append(kwargs)

    monkeypatch.setattr(processor.sheets_callback, "update_row", _record_sheets)

    return {
        "db_path": db_path,
        "csv_path": csv_path,
        "headers": headers,
        "sheets_calls": sheets_calls,
    }


def _stub_process_single_url(monkeypatch, record_factory):
    """Replace the scraper-driven process_single_url with a canned record builder.

    ``record_factory`` is called with the same signature as process_single_url
    and should return either a record dict or ``None`` to signal a scrape miss.
    """
    monkeypatch.setattr(processor, "process_single_url", record_factory)


def _csv_rows(csv_path):
    """Read the archive CSV back as a list of dict rows."""
    with open(csv_path, "r", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _row(db_path, submission_id):
    """Read one submission row from the queue DB."""
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        return conn.execute(
            "SELECT * FROM submissions WHERE id = ?", (submission_id,)
        ).fetchone()
    finally:
        conn.close()


class TestProcessBatch:
    """process_batch must drive status transitions, append CSV, and log the run."""

    def test_empty_queue_returns_zero_counts(self, temp_env):
        summary = processor.process_batch(trigger="test")
        assert summary["processed"] == 0
        assert summary["succeeded"] == 0
        assert summary["failed"] == 0

    def test_happy_path_completes_and_appends_csv(self, temp_env, monkeypatch):
        sub_id = db.add_submission("https://example.com/new")

        def fake_process(url, schema, known_entities, existing_ids, user_overrides=None):
            return {
                "id": "RECORD-09001",
                "url": url,
                "title": "Sample title",
                "original_publication": "Example",
                "verified": "FALSE",
                "notes": "Submitted via web form",
            }

        _stub_process_single_url(monkeypatch, fake_process)

        summary = processor.process_batch(trigger="test")
        assert summary["processed"] == 1
        assert summary["succeeded"] == 1
        assert summary["failed"] == 0

        row = _row(temp_env["db_path"], sub_id)
        assert row["status"] == "completed"
        assert row["record_id"] == "RECORD-09001"
        assert row["processed_at"] is not None
        assert row["error_message"] is None

        rows = _csv_rows(temp_env["csv_path"])
        assert len(rows) == 1
        assert rows[0]["id"] == "RECORD-09001"
        assert rows[0]["url"] == "https://example.com/new"

    def test_duplicate_url_marks_duplicate_without_scraping(
        self, temp_env, monkeypatch
    ):
        # Seed the archive CSV with an existing URL.
        with open(temp_env["csv_path"], "a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=temp_env["headers"])
            writer.writerow({
                "id": "RECORD-00001", "url": "https://example.com/old",
                "title": "Old", "original_publication": "Example",
                "verified": "TRUE", "notes": "",
            })

        sub_id = db.add_submission("https://example.com/old")

        # If the scraper is reached for a duplicate, fail loudly.
        def _should_not_be_called(*args, **kwargs):
            raise AssertionError("process_single_url called for a duplicate URL")

        _stub_process_single_url(monkeypatch, _should_not_be_called)

        summary = processor.process_batch(trigger="test")
        # The batch counts duplicates as 'failed' in its returned summary (the
        # row never reaches the live archive); the DB status is the more
        # informative signal.
        assert summary["processed"] == 1
        assert summary["succeeded"] == 0
        assert summary["failed"] == 1

        row = _row(temp_env["db_path"], sub_id)
        assert row["status"] == "duplicate"
        assert row["error_message"] == "URL already exists in archive"

    def test_scrape_miss_marks_failed(self, temp_env, monkeypatch):
        sub_id = db.add_submission("https://example.com/dead-link")
        _stub_process_single_url(monkeypatch, lambda *a, **kw: None)

        summary = processor.process_batch(trigger="test")
        assert summary["succeeded"] == 0
        assert summary["failed"] == 1

        row = _row(temp_env["db_path"], sub_id)
        assert row["status"] == "failed"
        assert row["error_message"] == "Processing returned no data"

    def test_scraper_exception_marks_failed_with_message(
        self, temp_env, monkeypatch
    ):
        sub_id = db.add_submission("https://example.com/boom")

        def _explode(*args, **kwargs):
            raise RuntimeError("scraper boom")

        _stub_process_single_url(monkeypatch, _explode)

        summary = processor.process_batch(trigger="test")
        assert summary["failed"] == 1

        row = _row(temp_env["db_path"], sub_id)
        assert row["status"] == "failed"
        assert "scraper boom" in row["error_message"]

    def test_logs_processing_run(self, temp_env, monkeypatch):
        db.add_submission("https://example.com/run-1")
        _stub_process_single_url(
            monkeypatch,
            lambda url, *a, **kw: {
                "id": "RECORD-09002", "url": url, "title": "T",
                "original_publication": "Example", "verified": "FALSE",
                "notes": "Submitted via web form",
            },
        )

        processor.process_batch(trigger="scheduled")

        run = db.get_last_processing_run()
        assert run is not None
        assert run["trigger"] == "scheduled"
        assert run["submissions_processed"] == 1
        assert run["submissions_succeeded"] == 1
        assert run["submissions_failed"] == 0

    def test_mixed_batch_handles_success_and_failure_in_one_pass(
        self, temp_env, monkeypatch
    ):
        good = db.add_submission("https://example.com/good")
        bad = db.add_submission("https://example.com/bad")

        def fake_process(url, schema, known_entities, existing_ids, user_overrides=None):
            if url.endswith("/bad"):
                return None
            return {
                "id": "RECORD-09003", "url": url, "title": "Good",
                "original_publication": "Example", "verified": "FALSE",
                "notes": "Submitted via web form",
            }

        _stub_process_single_url(monkeypatch, fake_process)

        summary = processor.process_batch(trigger="test")
        assert summary["succeeded"] == 1
        assert summary["failed"] == 1

        good_row = _row(temp_env["db_path"], good)
        bad_row = _row(temp_env["db_path"], bad)
        assert good_row["status"] == "completed"
        assert bad_row["status"] == "failed"

    def test_sheet_row_triggers_writeback_callback(self, temp_env, monkeypatch):
        """Submissions carrying sheet_id + sheet_row produce a sheets_callback call."""
        db.add_submission(
            "https://example.com/from-sheet",
            sheet_id="SHEET-1",
            sheet_tab="Inbox",
            sheet_row=42,
        )
        _stub_process_single_url(
            monkeypatch,
            lambda url, *a, **kw: {
                "id": "RECORD-09004", "url": url, "title": "Sheet",
                "original_publication": "Example", "verified": "FALSE",
                "notes": "Submitted via web form",
            },
        )

        processor.process_batch(trigger="test")

        # The 'archived' status is set when the row lands in CSV; SFTP push is
        # stubbed to skip in this fixture, so the writeback status stays
        # 'archived' rather than promoting to 'live'.
        assert len(temp_env["sheets_calls"]) == 1
        call = temp_env["sheets_calls"][0]
        assert call["sheet_id"] == "SHEET-1"
        assert call["sheet_tab"] == "Inbox"
        assert call["row"] == 42
        assert call["status"] == "archived"
        assert call["record_id"] == "RECORD-09004"


class TestSanitizeCell:
    """_sanitize_cell escapes CSV-formula triggers and caps length."""

    @pytest.mark.parametrize("trigger", ["=", "+", "-", "@"])
    def test_prefixes_formula_trigger_with_quote(self, trigger):
        out = processor._sanitize_cell(f"{trigger}cmd|'/c calc'!A1")
        assert out.startswith(f"'{trigger}")

    def test_passes_through_plain_text(self):
        assert processor._sanitize_cell("just a title") == "just a title"

    def test_strips_surrounding_whitespace(self):
        assert processor._sanitize_cell("  padded  ") == "padded"

    def test_caps_at_max_length(self):
        oversized = "a" * (processor._MAX_FIELD_LENGTH + 50)
        out = processor._sanitize_cell(oversized)
        assert len(out) == processor._MAX_FIELD_LENGTH

    def test_escape_survives_truncation_on_oversized_formula(self):
        """Escape goes on first; truncation chops the tail so the quote survives."""
        oversized = "=" + ("a" * (processor._MAX_FIELD_LENGTH + 50))
        out = processor._sanitize_cell(oversized)
        assert out[0] == "'"
        assert out[1] == "="
        assert len(out) == processor._MAX_FIELD_LENGTH


class TestSanitizeRecord:
    """_sanitize_record sanitizes only string fields and never mutates the input."""

    def test_sanitizes_strings_and_passes_non_strings(self):
        record = {"title": "=danger", "count": 7, "flag": True, "empty": None}
        cleaned = processor._sanitize_record(record)
        assert cleaned["title"] == "'=danger"
        assert cleaned["count"] == 7
        assert cleaned["flag"] is True
        assert cleaned["empty"] is None

    def test_does_not_mutate_original(self):
        record = {"title": "=danger"}
        processor._sanitize_record(record)
        assert record["title"] == "=danger"


class TestAppendToCsv:
    """_append_to_csv writes a sanitized row using only known headers."""

    def test_writes_only_declared_headers(self, tmp_path, monkeypatch):
        csv_path = tmp_path / "archive.csv"
        headers = ["id", "url", "title"]
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(headers)
        monkeypatch.setattr(processor, "CSV_FILE", csv_path)

        # `extras` is not in headers — it must be dropped on append.
        record = {"id": "RECORD-1", "url": "https://example.com/",
                  "title": "Hello", "extras": "ignored"}
        assert processor._append_to_csv(record, headers) is True

        rows = list(csv.DictReader(open(csv_path, encoding="utf-8")))
        assert len(rows) == 1
        assert rows[0] == {"id": "RECORD-1", "url": "https://example.com/",
                           "title": "Hello"}

    def test_sanitizes_formula_trigger_on_append(self, tmp_path, monkeypatch):
        csv_path = tmp_path / "archive.csv"
        headers = ["id", "url", "title"]
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(headers)
        monkeypatch.setattr(processor, "CSV_FILE", csv_path)

        record = {"id": "RECORD-1", "url": "https://example.com/",
                  "title": "=HYPERLINK()"}
        assert processor._append_to_csv(record, headers) is True

        rows = list(csv.DictReader(open(csv_path, encoding="utf-8")))
        assert rows[0]["title"].startswith("'=")
