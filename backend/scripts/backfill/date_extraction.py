# -*- coding: utf-8 -*-
"""Shared publication-date extraction from URL patterns.

Background (issue #189): the three date-backfill strategies in this package --
``simple_date_backfill``, ``publication_date_backfill``, and
``enhanced_date_backfill`` -- each carried a byte-for-byte copy of the same
URL-pattern parser. Three copies meant a regex fix had to land in three places
or the strategies would silently drift. This module holds the single canonical
implementation; each strategy now delegates to it.

The function is pure (no Google Sheets, no network), so it is unit-testable on
its own -- see ``backend/tests/test_date_backfill_url_extraction.py``.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Optional

# PressThink archive permalinks: /YYYY/MM/ or /YYYY/MM/DD/ (day optional).
_PRESSTHINK_PATTERN = re.compile(r"/(\d{4})/(\d{2})/(?:(\d{2})/)?")

# Fallback date shapes that may appear elsewhere in a URL path. Order matters:
# the first match wins, mirroring the original strategy implementations.
_YEAR_MONTH_DAY_DASH = re.compile(r"(\d{4})-(\d{2})-(\d{2})")  # YYYY-MM-DD
_MONTH_DAY_YEAR_DASH = re.compile(r"(\d{2})-(\d{2})-(\d{4})")  # MM-DD-YYYY
_YEAR_MONTH_DAY_SLASH = re.compile(r"(\d{4})/(\d{2})/(\d{2})")  # YYYY/MM/DD
_FALLBACK_PATTERNS = (
    _YEAR_MONTH_DAY_DASH,
    _MONTH_DAY_YEAR_DASH,
    _YEAR_MONTH_DAY_SLASH,
)


def extract_date_from_url(url: Optional[str]) -> Optional[str]:
    """Return an ``MM/DD/YYYY`` date parsed from URL date patterns, or ``None``.

    Tries the PressThink archive pattern first (``/YYYY/MM/`` with an optional
    day, defaulting to the 1st when the day is absent), then a small set of
    fallback shapes. Returns ``None`` when no pattern matches, when the input is
    empty, or when the matched numbers do not form a real calendar date.
    """
    if not url:
        return None

    pressthink_match = _PRESSTHINK_PATTERN.search(url)
    if pressthink_match:
        year, month = pressthink_match.groups()[:2]
        day = pressthink_match.group(3) or "01"  # default to the 1st if no day
        try:
            return datetime(int(year), int(month), int(day)).strftime("%m/%d/%Y")
        except ValueError:
            pass

    for pattern in _FALLBACK_PATTERNS:
        match = pattern.search(url)
        if match:
            try:
                if pattern is _MONTH_DAY_YEAR_DASH:
                    month, day, year = match.groups()
                else:  # YYYY-MM-DD or YYYY/MM/DD
                    year, month, day = match.groups()
                return datetime(int(year), int(month), int(day)).strftime("%m/%d/%Y")
            except ValueError:
                continue

    return None
