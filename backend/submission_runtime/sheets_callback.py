# -*- coding: utf-8 -*-
"""Write submission status back into the Apps Script queue sheet."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict

from rosen_scraper.sheets_a1 import quote_tab
from rosen_scraper.sheets_credentials import resolve_service_account_source

logger = logging.getLogger("submission_runtime.sheets_callback")

_COL_STATUS = "F"
_COL_RECORD_ID = "G"
_COL_ERROR = "H"

_SHEETS_SCOPE = ["https://www.googleapis.com/auth/spreadsheets"]


def _load_credentials():
    """Return google.oauth2 credentials, or None if no SA key is configured."""
    source = resolve_service_account_source()
    if source.kind == "unset":
        return None

    try:
        from google.oauth2 import service_account
    except ImportError:
        logger.error("google-auth not installed — cannot write to Sheets")
        return None

    try:
        if source.kind == "inline_json":
            info = json.loads(source.value)
            return service_account.Credentials.from_service_account_info(
                info, scopes=_SHEETS_SCOPE)
        return service_account.Credentials.from_service_account_file(
            source.value, scopes=_SHEETS_SCOPE)
    except (json.JSONDecodeError, FileNotFoundError, ValueError) as exc:
        logger.error(f"Failed to load SA credentials: {exc}")
        return None


def update_row(sheet_id: str, sheet_tab: str, row: int, status: str,
               record_id: str = "", error: str = "") -> Dict[str, Any]:
    """Write status, record_id, and error to a single row of the queue sheet."""
    if not sheet_id or not row:
        return {"ok": False, "skipped": True, "error": "missing sheet_id or row"}

    creds = _load_credentials()
    if creds is None:
        logger.warning("Sheets SA not configured — skipping status writeback")
        return {"ok": True, "skipped": True, "error": None}

    try:
        from googleapiclient.discovery import build
        from googleapiclient.errors import HttpError
    except ImportError:
        return {"ok": False, "skipped": False,
                "error": "google-api-python-client not installed"}

    tab = quote_tab(sheet_tab)
    body = {
        "valueInputOption": "RAW",
        "data": [
            {"range": f"{tab}!{_COL_STATUS}{row}", "values": [[status]]},
            {"range": f"{tab}!{_COL_RECORD_ID}{row}", "values": [[record_id]]},
            {"range": f"{tab}!{_COL_ERROR}{row}", "values": [[error]]},
        ],
    }

    try:
        service = build("sheets", "v4", credentials=creds,
                        cache_discovery=False)
        service.spreadsheets().values().batchUpdate(
            spreadsheetId=sheet_id, body=body).execute()
        logger.info(f"Sheet writeback ok: {sheet_id} row={row} status={status}")
        return {"ok": True, "skipped": False, "error": None}
    except HttpError as exc:
        err = f"Sheets HTTP error: {exc}"
        logger.error(err)
        return {"ok": False, "skipped": False, "error": err}
    except Exception as exc:  # noqa: BLE001 — best-effort, log everything
        err = f"Sheets write error: {exc}"
        logger.error(err)
        return {"ok": False, "skipped": False, "error": err}
