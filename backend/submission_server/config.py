# -*- coding: utf-8 -*-
"""
Configuration for the submission server.
"""

import os
from pathlib import Path


def _positive_int_from_env(name, default):
    """Return a positive integer env value, falling back on bad input."""
    try:
        value = int(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


# Paths
# The submission server lives in backend/submission_server/
# The project root (with data/, frontend/, etc.) is two levels up
SERVER_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SERVER_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent

# Data paths
DATA_DIR = PROJECT_ROOT / "data"
CSV_FILE = DATA_DIR / "archive_records-public.csv"
SCHEMA_FILE = BACKEND_DIR / "schema.json"
KNOWN_ENTITIES_FILE = BACKEND_DIR / "known_entities.json"
EXPORT_SCRIPT = DATA_DIR / "export-archive-data.js"
FTP_STAGING_DIR = PROJECT_ROOT / "ftp-upload" / "data"

# Database
DATABASE_PATH = SERVER_DIR / "submissions.db"

# Server
SERVER_PORT = int(os.environ.get("SUBMISSION_PORT", "5000"))
# Bind to localhost by default. The server has no transport-level access control,
# so it must not listen on all interfaces unless it is deliberately placed behind
# an authenticating reverse proxy (in which case set SUBMISSION_HOST explicitly).
SERVER_HOST = os.environ.get("SUBMISSION_HOST", "127.0.0.1")

# Shared-secret auth. When set, every request must present this token via the
# X-Auth-Token header or a 'token' query/form parameter. When empty, requests
# are accepted as-is, which is only safe because SERVER_HOST defaults to
# localhost. Set both SUBMISSION_HOST and SUBMISSION_AUTH_TOKEN to expose the
# server safely.
SUBMISSION_AUTH_TOKEN = os.environ.get("SUBMISSION_AUTH_TOKEN", "")

# Submission flood controls. These protect the queue and downstream Gemini /
# GitHub Actions usage if the legacy Flask endpoint is exposed publicly.
SUBMISSION_RATE_LIMIT_PER_MINUTE = _positive_int_from_env(
    "SUBMISSION_RATE_LIMIT_PER_MINUTE", 5
)
SUBMISSION_RATE_LIMIT_PER_HOUR = _positive_int_from_env(
    "SUBMISSION_RATE_LIMIT_PER_HOUR", 30
)

# Processing
QUEUE_THRESHOLD = int(os.environ.get("QUEUE_THRESHOLD", "5"))
DAILY_PROCESS_HOUR = int(os.environ.get("DAILY_PROCESS_HOUR", "0"))  # midnight

# Writeback target pinning. The status writeback uses a service-account key that
# can write to every spreadsheet (and every tab within it) shared with the SA,
# so a /submit caller must not be able to redirect that write by naming a
# different target. The writeback target is (sheet_id, sheet_tab, row); pin all
# three. ALLOWED_SHEET_ID pins the spreadsheet, ALLOWED_SHEET_TAB pins the tab
# inside it, and MAX_SHEET_ROW bounds the row. Both allowlists are empty by
# default so dev and the current single-sheet deploy are unrestricted — but to
# actually pin the writeback in production set BOTH, since pinning the
# spreadsheet alone still lets a caller redirect the write to another tab in it.
# See issue #285.
ALLOWED_SHEET_ID = os.environ.get("ROSEN_ALLOWED_SHEET_ID", "").strip()
ALLOWED_SHEET_TAB = os.environ.get("ROSEN_ALLOWED_SHEET_TAB", "").strip()

# Upper bound for a 1-based sheet row. A real queue sheet has at most a few
# thousand rows; anything outside [1, MAX_SHEET_ROW] is treated as absent rather
# than passed through to the Sheets API. The bound is generous on purpose — it
# only rejects nonsense, not legitimate rows.
MAX_SHEET_ROW = _positive_int_from_env("ROSEN_MAX_SHEET_ROW", 5_000_000)

# The six canonical thematic categories. This list MUST stay in sync with
# `facets.categories` in data/archive-data.json and the "Category Values"
# section of data/SCHEMA.md. A form submission tagged with any other category
# would not group, filter, or facet on the live site. See issue #173.
THEMATIC_CATEGORIES = [
    "Audience & Public Engagement",
    "Journalism Education",
    "Journalism Theory & Practice",
    "Politics & Democracy",
    "Press & Media Criticism",
    "Technology & Digital Media",
]
