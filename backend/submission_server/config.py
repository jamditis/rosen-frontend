# -*- coding: utf-8 -*-
"""
Configuration for the submission server.
"""

import os
import sys
from pathlib import Path

# submission_runtime lives at backend/submission_runtime and is imported as a
# top-level package. The current GitHub Actions path runs with
# working-directory: backend, so it resolves; the legacy repo-root invocation
# (python -m backend.submission_server.scheduler) only puts the repo root on
# sys.path. Add backend/ so the import resolves under both invocation modes.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from submission_runtime.config import (  # noqa: E402
    BACKEND_DIR as BACKEND_DIR,
    CSV_FILE as CSV_FILE,
    DATA_DIR as DATA_DIR,
    EXPORT_SCRIPT as EXPORT_SCRIPT,
    FTP_STAGING_DIR as FTP_STAGING_DIR,
    KNOWN_ENTITIES_FILE as KNOWN_ENTITIES_FILE,
    PROJECT_ROOT as PROJECT_ROOT,
    SCHEMA_FILE as SCHEMA_FILE,
    THEMATIC_CATEGORIES as THEMATIC_CATEGORIES,
    positive_int_from_env,
)

SERVER_DIR = Path(__file__).resolve().parent

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
SUBMISSION_RATE_LIMIT_PER_MINUTE = positive_int_from_env(
    "SUBMISSION_RATE_LIMIT_PER_MINUTE", 5
)
SUBMISSION_RATE_LIMIT_PER_HOUR = positive_int_from_env(
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
MAX_SHEET_ROW = positive_int_from_env("ROSEN_MAX_SHEET_ROW", 5_000_000)
