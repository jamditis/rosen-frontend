# -*- coding: utf-8 -*-
"""Configuration shared by the current submission runtime scripts."""

import os
from pathlib import Path


def positive_int_from_env(name, default):
    """Return a positive integer env value, falling back on bad input."""
    try:
        value = int(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


RUNTIME_DIR = Path(__file__).resolve().parent
BACKEND_DIR = RUNTIME_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent

DATA_DIR = PROJECT_ROOT / "data"
CSV_FILE = DATA_DIR / "archive_records-public.csv"
SCHEMA_FILE = BACKEND_DIR / "schema.json"
KNOWN_ENTITIES_FILE = BACKEND_DIR / "known_entities.json"
EXPORT_SCRIPT = DATA_DIR / "export-archive-data.js"
FTP_STAGING_DIR = PROJECT_ROOT / "ftp-upload" / "data"

ALLOWED_SHEET_ID = os.environ.get("ROSEN_ALLOWED_SHEET_ID", "").strip()
ALLOWED_SHEET_TAB = os.environ.get("ROSEN_ALLOWED_SHEET_TAB", "").strip()
MAX_SHEET_ROW = positive_int_from_env("ROSEN_MAX_SHEET_ROW", 5_000_000)

THEMATIC_CATEGORIES = [
    "Audience & Public Engagement",
    "Journalism Education",
    "Journalism Theory & Practice",
    "Politics & Democracy",
    "Press & Media Criticism",
    "Technology & Digital Media",
]
