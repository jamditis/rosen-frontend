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
SERVER_HOST = os.environ.get('SUBMISSION_HOST', '0.0.0.0')

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
