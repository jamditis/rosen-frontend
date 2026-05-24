# -*- coding: utf-8 -*-
"""Write submission status back into the Apps Script queue sheet.

The Apps Script onEdit trigger captures the row index when it POSTs a URL, and
the row index round-trips through ``submissions.db`` (sheet_id + sheet_row
columns) so this module can write the result to the right row.

Per the Pillar 3 architecture, only three cells are touched:
    F (col 6) — status. Values actually written:
        - 'submitted'  — Apps Script accepted the row and POSTed it
        - 'archived'   — server scraped + appended to CSV, live deploy pending
        - 'live'       — JSON regenerated and SFTP'd to pressthink.org
        - 'duplicate'  — URL was already in the archive
        - 'error'      — scrape / CSV / network failure (see H)
        - 'no URL'     — Apps Script: column B empty
        - 'invalid URL'— Apps Script: column B not http(s)
    G (col 7) — record_id: e.g. RECORD-00933 on success
    H (col 8) — error:     short error string on failure

Configuration is env-only. When required vars are missing the callback is a
no-op so dev/CI never need credentials.

Required env vars:
    one of:
        ROSEN_SHEETS_SA_KEY      — path to service-account JSON file
        ROSEN_SHEETS_SA_KEY_JSON — service-account JSON content (inline)

Behavior is best-effort: a callback failure logs and returns ok=False but
never raises into the processor batch loop.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Dict, Any, Optional

logger = logging.getLogger('submission_server.sheets_callback')

# Column letters mapped to 1-indexed Sheets API column positions. Keep in sync
# with the Apps Script project's `appendQueueRow` helper — a column-index
# divergence would silently write status into the wrong cells.
_COL_STATUS = 'F'
_COL_RECORD_ID = 'G'
_COL_ERROR = 'H'

_SHEETS_SCOPE = ['https://www.googleapis.com/auth/spreadsheets']


def _quote_tab(name: str) -> str:
    """Return an A1-safe sheet-tab reference.

    Google Sheets A1 notation requires a sheet name to be wrapped in single
    quotes if it contains anything other than letters, digits, and underscores,
    and any internal apostrophe must be doubled. Always quoting is simpler and
    accepted even for plain names — pays a few bytes per range to avoid a 400
    when Jay's sheet is named "Archive Queue" or "Joe's URLs".
    """
    safe = (name or 'Sheet1').replace("'", "''")
    return f"'{safe}'"


def _load_credentials():
    """Return google.oauth2 credentials, or None if no SA key is configured."""
    key_path = os.environ.get('ROSEN_SHEETS_SA_KEY', '').strip()
    key_json = os.environ.get('ROSEN_SHEETS_SA_KEY_JSON', '').strip()

    if not (key_path or key_json):
        return None

    try:
        from google.oauth2 import service_account
    except ImportError:
        logger.error("google-auth not installed — cannot write to Sheets")
        return None

    try:
        if key_json:
            info = json.loads(key_json)
            return service_account.Credentials.from_service_account_info(
                info, scopes=_SHEETS_SCOPE)
        return service_account.Credentials.from_service_account_file(
            key_path, scopes=_SHEETS_SCOPE)
    except (json.JSONDecodeError, FileNotFoundError, ValueError) as exc:
        logger.error(f"Failed to load SA credentials: {exc}")
        return None


def update_row(sheet_id: str, sheet_tab: str, row: int, status: str,
               record_id: str = '', error: str = '') -> Dict[str, Any]:
    """Write status, record_id, and error to a single row of the queue sheet.

    Returns ``{ok, skipped, error}``. Best-effort — failures are logged but
    do not raise.
    """
    if not sheet_id or not row:
        return {'ok': False, 'skipped': True, 'error': 'missing sheet_id or row'}

    creds = _load_credentials()
    if creds is None:
        logger.warning("Sheets SA not configured — skipping status writeback")
        return {'ok': True, 'skipped': True, 'error': None}

    try:
        from googleapiclient.discovery import build
        from googleapiclient.errors import HttpError
    except ImportError:
        return {'ok': False, 'skipped': False,
                'error': 'google-api-python-client not installed'}

    tab = _quote_tab(sheet_tab)
    # batchUpdate is one round-trip instead of three; also atomic from the
    # reader's perspective so Jay never sees status=live + record_id=blank.
    body = {
        'valueInputOption': 'RAW',
        'data': [
            {'range': f"{tab}!{_COL_STATUS}{row}", 'values': [[status]]},
            {'range': f"{tab}!{_COL_RECORD_ID}{row}", 'values': [[record_id]]},
            {'range': f"{tab}!{_COL_ERROR}{row}", 'values': [[error]]},
        ],
    }

    try:
        service = build('sheets', 'v4', credentials=creds,
                        cache_discovery=False)
        service.spreadsheets().values().batchUpdate(
            spreadsheetId=sheet_id, body=body).execute()
        logger.info(f"Sheet writeback ok: {sheet_id} row={row} status={status}")
        return {'ok': True, 'skipped': False, 'error': None}
    except HttpError as exc:
        err = f'Sheets HTTP error: {exc}'
        logger.error(err)
        return {'ok': False, 'skipped': False, 'error': err}
    except Exception as exc:  # noqa: BLE001 — best-effort, log everything
        err = f'Sheets write error: {exc}'
        logger.error(err)
        return {'ok': False, 'skipped': False, 'error': err}
