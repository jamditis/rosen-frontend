#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Cron-compatible scheduler for the submission queue.

Checks if batch processing should run based on:
  1. Queue threshold (default: 5+ pending submissions)
  2. Daily schedule (any pending submissions at midnight)

Intended to be called by cron every hour:
    0 * * * * cd /path/to/rosen-frontend && python -m backend.submission_server.scheduler
"""

import sys
import logging
from datetime import datetime
from pathlib import Path

# Ensure the project root is on the path
project_root = Path(__file__).resolve().parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from backend.submission_server.config import QUEUE_THRESHOLD, DAILY_PROCESS_HOUR  # noqa: E402
from backend.submission_server import db  # noqa: E402
from backend.submission_server.processor import process_batch  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [scheduler] %(levelname)s: %(message)s',
)
logger = logging.getLogger('scheduler')


def is_midnight_window() -> bool:
    """Check if the current hour matches the daily processing window."""
    return datetime.now().hour == DAILY_PROCESS_HOUR


def check_and_process():
    """Check if batch processing should run, and run it if so."""
    db.init_db()
    pending_count = db.get_pending_count()

    if pending_count == 0:
        logger.info("No pending submissions.")
        return

    if pending_count >= QUEUE_THRESHOLD:
        logger.info(f"{pending_count} pending (threshold: {QUEUE_THRESHOLD}). Starting batch.")
        process_batch(trigger='threshold')
    elif is_midnight_window():
        logger.info(f"{pending_count} pending at midnight. Starting batch.")
        process_batch(trigger='scheduled')
    else:
        logger.info(f"{pending_count} pending (below threshold {QUEUE_THRESHOLD}, not midnight). Skipping.")


if __name__ == '__main__':
    check_and_process()
