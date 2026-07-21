# -*- coding: utf-8 -*-
"""Shared Google Sheets service-account access for the batch maintenance jobs.

The enrichment scripts (``key_concepts_updater``, ``data_deduper``) and the
sheet -> archive sync job all open the same master spreadsheet. They predate
Pillar 3a and each grew its own credential code that only knew how to read a
checked-out ``google_credentials.json`` file. That works on a laptop but not in
a GitHub Action, where the service-account key arrives as a repo secret.

This module gives them one resolver that prefers the CI path and falls back to
the local file, in the same order as
``submission_runtime.sheets_callback._load_credentials``:

    1. ROSEN_SHEETS_SA_KEY_JSON -- inline service-account JSON (the CI secret)
    2. ROSEN_SHEETS_SA_KEY      -- path to a service-account JSON file
    3. fallback_file            -- a local google_credentials.json (dev default)

Keeping the order identical to sheets_callback lets the maintenance runner and
the submission workflow share one repo secret instead of maintaining two.
"""

from __future__ import annotations

import json
import os
from typing import Optional

import gspread
from google.oauth2.service_account import Credentials

# gspread.open() resolves a sheet by name through Drive, so the token needs the
# drive scope as well as spreadsheets. These match the scopes the enrichment
# scripts each declared before this helper centralized them.
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

DEFAULT_FALLBACK_FILE = "google_credentials.json"


def load_credentials(fallback_file: str = DEFAULT_FALLBACK_FILE) -> Credentials:
    """Return service-account credentials from env-or-file.

    Resolution order is inline-JSON env, then file-path env, then the local
    fallback file. A bad ``ROSEN_SHEETS_SA_KEY_JSON`` raises ``JSONDecodeError``
    and a missing fallback file raises ``FileNotFoundError`` -- both surface
    loudly so a misconfigured run fails instead of silently authing as nobody.
    """
    key_json = os.environ.get("ROSEN_SHEETS_SA_KEY_JSON", "").strip()
    key_path = os.environ.get("ROSEN_SHEETS_SA_KEY", "").strip()

    if key_json:
        info = json.loads(key_json)
        return Credentials.from_service_account_info(info, scopes=SCOPES)
    if key_path:
        return Credentials.from_service_account_file(key_path, scopes=SCOPES)
    return Credentials.from_service_account_file(fallback_file, scopes=SCOPES)


def get_gspread_client(
    fallback_file: str = DEFAULT_FALLBACK_FILE,
) -> gspread.client.Client:
    """Return an authorized gspread client using env-or-file credentials."""
    return gspread.authorize(load_credentials(fallback_file))


def open_spreadsheet(
    name: Optional[str] = None,
    fallback_file: str = DEFAULT_FALLBACK_FILE,
    client: Optional[gspread.client.Client] = None,
) -> gspread.Spreadsheet:
    """Open the master spreadsheet by name.

    Name defaults to the ``SPREADSHEET_NAME`` env var (set as a repo secret in
    CI), then to the historical default the scripts already used.
    """
    client = client or get_gspread_client(fallback_file)
    name = name or os.environ.get("SPREADSHEET_NAME", "Rosen Archive URL List")
    return client.open(name)
