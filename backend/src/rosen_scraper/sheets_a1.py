# -*- coding: utf-8 -*-
"""A1-notation helpers for the Google Sheets API.

Shared so the submission-server writeback (submission_server.sheets_callback)
and the stuck-row sweeper (scripts/sweep_stuck.py) quote tab names the same
way; a divergence would let one path build a range the API rejects.
"""


def quote_tab(name: str) -> str:
    """Return an A1-safe sheet-tab reference.

    Google Sheets A1 notation requires a sheet name to be wrapped in single
    quotes if it contains anything other than letters, digits, and underscores,
    and any internal apostrophe must be doubled. Always quoting is simpler and
    accepted even for plain names -- pays a few bytes per range to avoid a 400
    when Jay's sheet is named "Archive Queue" or "Joe's URLs".
    """
    safe = (name or "Sheet1").replace("'", "''")
    return f"'{safe}'"
