# -*- coding: utf-8 -*-
"""CSV/spreadsheet formula-injection neutralization (rosen_scraper.csv_safety)."""

from rosen_scraper.csv_safety import sanitize_csv_value


def test_escapes_each_formula_trigger():
    # Every leading control/operator that a spreadsheet treats as a formula
    # start must be neutralized, including the line-feed variant.
    for trigger in ("=", "+", "-", "@", "\t", "\r", "\n"):
        assert sanitize_csv_value(trigger + "x") == "'" + trigger + "x"


def test_leading_linefeed_formula_is_escaped():
    # A payload led by LF (not just CR/tab) still executes when the CSV is
    # opened in spreadsheet software, so it must be escaped too.
    assert sanitize_csv_value("\n=HYPERLINK(0)") == "'\n=HYPERLINK(0)"


def test_safe_values_pass_through():
    assert sanitize_csv_value("Jay Rosen") == "Jay Rosen"
    assert sanitize_csv_value("") == ""
    assert sanitize_csv_value(5) == 5
    assert sanitize_csv_value(None) is None


def test_unescape_reverses_the_escape_for_every_trigger():
    from rosen_scraper.csv_safety import (
        CSV_INJECTION_PREFIXES,
        unescape_csv_value,
    )
    for trigger in CSV_INJECTION_PREFIXES:
        escaped = sanitize_csv_value(trigger + "x")
        assert unescape_csv_value(escaped) == trigger + "x"


def test_unescape_preserves_a_legitimate_leading_apostrophe():
    # A real apostrophe not followed by a formula trigger is content, not an
    # escape, so it must survive unchanged (no over-stripping).
    from rosen_scraper.csv_safety import unescape_csv_value
    assert unescape_csv_value("'tis the season") == "'tis the season"
    assert unescape_csv_value("'") == "'"
    assert unescape_csv_value("Jay Rosen") == "Jay Rosen"
    assert unescape_csv_value(None) is None
