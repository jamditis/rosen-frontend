"""Tests for submission-runtime CSV-injection defenses (issue #143).

Submission fields must be formula-escaped and length-bounded before the current
Action flow appends them to the published archive CSV.
"""

import pytest

from submission_runtime import csv_safety


class TestSanitizeCell:
    """sanitize_cell escapes formula triggers and bounds length."""

    @pytest.mark.parametrize("trigger", ['=', '+', '-', '@'])
    def test_leading_formula_trigger_is_quote_escaped(self, trigger):
        assert csv_safety.sanitize_cell(f"{trigger}HYPERLINK(1)") == f"'{trigger}HYPERLINK(1)"

    def test_plain_text_is_unchanged(self):
        assert csv_safety.sanitize_cell("PressThink") == "PressThink"

    def test_trigger_not_in_leading_position_is_left_alone(self):
        # An '=' mid-string is not a formula trigger.
        assert csv_safety.sanitize_cell("rate = 5") == "rate = 5"

    def test_overlong_value_is_truncated(self):
        result = csv_safety.sanitize_cell("x" * (csv_safety.MAX_FIELD_LENGTH + 500))
        assert len(result) == csv_safety.MAX_FIELD_LENGTH

    def test_formula_trigger_at_max_length_still_respects_cap(self):
        # A value exactly at the cap that starts with a formula trigger must
        # not exceed the cap once the single-quote escape is prepended.
        at_cap = "=" + "A" * (csv_safety.MAX_FIELD_LENGTH - 1)
        assert len(at_cap) == csv_safety.MAX_FIELD_LENGTH
        result = csv_safety.sanitize_cell(at_cap)
        assert len(result) <= csv_safety.MAX_FIELD_LENGTH
        # The escape must survive — truncation only chops the tail.
        assert result.startswith("'=")

    def test_value_is_stripped(self):
        assert csv_safety.sanitize_cell("  spaced  ") == "spaced"


class TestSanitizeRecord:
    def test_sanitizes_string_fields_without_mutating_input(self):
        record = {"title": "=evil", "verified": True}
        sanitized = csv_safety.sanitize_record(record)

        assert sanitized == {"title": "'=evil", "verified": True}
        assert record == {"title": "=evil", "verified": True}
