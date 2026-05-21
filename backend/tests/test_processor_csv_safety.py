"""
Tests for processor.py CSV-injection defenses (issue #143).

_append_to_csv must neutralize CSV formula injection and bound field length so
scraped page content and user-supplied form overrides cannot inject a
spreadsheet formula or an oversized blob into the published archive CSV.
"""
import csv

import pytest

from submission_server import processor


class TestSanitizeCell:
    """_sanitize_cell escapes formula triggers and bounds length."""

    @pytest.mark.parametrize("trigger", ['=', '+', '-', '@'])
    def test_leading_formula_trigger_is_quote_escaped(self, trigger):
        assert processor._sanitize_cell(f"{trigger}HYPERLINK(1)") == f"'{trigger}HYPERLINK(1)"

    def test_plain_text_is_unchanged(self):
        assert processor._sanitize_cell("PressThink") == "PressThink"

    def test_trigger_not_in_leading_position_is_left_alone(self):
        # An '=' mid-string is not a formula trigger.
        assert processor._sanitize_cell("rate = 5") == "rate = 5"

    def test_overlong_value_is_truncated(self):
        result = processor._sanitize_cell("x" * (processor._MAX_FIELD_LENGTH + 500))
        assert len(result) == processor._MAX_FIELD_LENGTH

    def test_formula_trigger_at_max_length_still_respects_cap(self):
        # A value exactly at the cap that starts with a formula trigger must
        # not exceed the cap once the single-quote escape is prepended.
        at_cap = "=" + "A" * (processor._MAX_FIELD_LENGTH - 1)
        assert len(at_cap) == processor._MAX_FIELD_LENGTH
        result = processor._sanitize_cell(at_cap)
        assert len(result) <= processor._MAX_FIELD_LENGTH
        # The escape must survive — truncation only chops the tail.
        assert result.startswith("'=")

    def test_value_is_stripped(self):
        assert processor._sanitize_cell("  spaced  ") == "spaced"


class TestAppendToCsvSanitizes:
    """_append_to_csv writes only sanitized cells."""

    def test_formula_injection_is_escaped_in_written_row(self, tmp_path, monkeypatch):
        csv_file = tmp_path / "archive.csv"
        headers = ["id", "title", "verified"]
        csv_file.write_text(",".join(headers) + "\n", encoding="utf-8")
        monkeypatch.setattr(processor, "CSV_FILE", csv_file)

        ok = processor._append_to_csv(
            {"id": "REC-1", "title": '=cmd|"/c calc"!A1', "verified": True},
            headers,
        )
        assert ok is True

        with open(csv_file, newline="", encoding="utf-8") as f:
            row = list(csv.DictReader(f))[0]
        assert row["title"].startswith("'=")
        assert row["id"] == "REC-1"

    def test_caller_record_is_not_mutated(self, tmp_path, monkeypatch):
        csv_file = tmp_path / "archive.csv"
        headers = ["title"]
        csv_file.write_text("title\n", encoding="utf-8")
        monkeypatch.setattr(processor, "CSV_FILE", csv_file)

        record = {"title": "=evil"}
        processor._append_to_csv(record, headers)
        # The original dict the caller passed must be untouched.
        assert record["title"] == "=evil"
