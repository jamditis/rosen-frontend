# -*- coding: utf-8 -*-
"""
Configuration for the submission server.
"""

import os
from pathlib import Path

# Paths
# The submission server lives in backend/submission_server/
# The project root (with data/, frontend/, etc.) is two levels up
SERVER_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SERVER_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent

# Data paths
DATA_DIR = PROJECT_ROOT / 'data'
CSV_FILE = DATA_DIR / 'archive_records-public.csv'
SCHEMA_FILE = BACKEND_DIR / 'schema.json'
KNOWN_ENTITIES_FILE = BACKEND_DIR / 'known_entities.json'
EXPORT_SCRIPT = DATA_DIR / 'export-archive-data.js'
FTP_STAGING_DIR = PROJECT_ROOT / 'ftp-upload' / 'data'

# Database
DATABASE_PATH = SERVER_DIR / 'submissions.db'

# Server
SERVER_PORT = int(os.environ.get('SUBMISSION_PORT', '5000'))
# Bind to localhost by default. The server has no transport-level access control,
# so it must not listen on all interfaces unless it is deliberately placed behind
# an authenticating reverse proxy (in which case set SUBMISSION_HOST explicitly).
SERVER_HOST = os.environ.get('SUBMISSION_HOST', '127.0.0.1')

# Shared-secret auth. When set, every request must present this token via the
# X-Auth-Token header or a 'token' query/form parameter. When empty, requests
# are accepted as-is, which is only safe because SERVER_HOST defaults to
# localhost. Set both SUBMISSION_HOST and SUBMISSION_AUTH_TOKEN to expose the
# server safely.
SUBMISSION_AUTH_TOKEN = os.environ.get('SUBMISSION_AUTH_TOKEN', '')

# Processing
QUEUE_THRESHOLD = int(os.environ.get('QUEUE_THRESHOLD', '5'))
DAILY_PROCESS_HOUR = int(os.environ.get('DAILY_PROCESS_HOUR', '0'))  # midnight

# The 10 thematic categories currently in the archive
THEMATIC_CATEGORIES = [
    'Audience & Public Engagement',
    'Democratic Theory',
    'Journalism Education',
    'Journalism History',
    'Journalism Theory & Practice',
    'Politics & Democracy',
    'Press & Media Criticism',
    'Press Criticism',
    'Public Life',
    'Technology & Digital Media',
]
