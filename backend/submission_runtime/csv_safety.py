# -*- coding: utf-8 -*-
"""CSV sanitization helpers for submission write paths."""

from typing import Any, Dict

from rosen_scraper.csv_safety import sanitize_csv_value


# Upper bound on any single CSV cell. Generous for legitimate titles and
# summaries, but stops hostile submissions from writing unbounded blobs.
MAX_FIELD_LENGTH = 10000


def sanitize_cell(value: str) -> str:
    """Length-bound and CSV-formula-escape a single string cell."""
    text = sanitize_csv_value(value.strip())
    if len(text) > MAX_FIELD_LENGTH:
        text = text[:MAX_FIELD_LENGTH]
    return text


def sanitize_record(record: Dict[str, Any]) -> Dict[str, Any]:
    """Return a sanitized copy of ``record`` without mutating the input."""
    return {
        key: sanitize_cell(value) if isinstance(value, str) else value
        for key, value in record.items()
    }
