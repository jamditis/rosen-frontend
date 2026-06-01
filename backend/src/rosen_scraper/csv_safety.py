"""Shared CSV/spreadsheet formula-injection neutralization for rosen_scraper.

A cell whose first character is one of ``= + - @`` (or a leading tab/carriage
return) is evaluated as a formula when the CSV is opened in Excel or Google
Sheets. Prefixing a single quote neutralizes the trigger while keeping the
displayed text intact.

This lives in the rosen_scraper package rather than reusing backend/data/
csv_safe_write.py because the package is self-contained: backend/data is not on
its import path, but rosen_scraper is importable from both the package modules
and the maintenance scripts (e.g. scripts/sync_sheet_to_archive.py) that need
this helper.
"""

from __future__ import annotations

# OWASP CSV-injection prefixes; see the module docstring.
CSV_INJECTION_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def sanitize_csv_value(value: object) -> object:
    """Prefix a leading apostrophe when ``value`` would trigger a formula.

    Non-strings and empty strings pass through unchanged, so numeric and
    JSON-encoded columns are left intact.
    """
    if not isinstance(value, str) or not value:
        return value
    if value[0] in CSV_INJECTION_PREFIXES:
        return "'" + value
    return value
