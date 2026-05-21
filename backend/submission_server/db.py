# -*- coding: utf-8 -*-
"""
Database operations for the submission queue.
Uses SQLite for zero-dependency persistence.
"""

import sqlite3
from contextlib import contextmanager
from datetime import datetime
from typing import List, Dict, Any, Optional

from .config import DATABASE_PATH


def init_db():
    """Create the database tables if they don't exist."""
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL,
                title TEXT,
                publication TEXT,
                date_published TEXT,
                categories TEXT,
                notes TEXT,
                status TEXT DEFAULT 'pending',
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                processed_at TIMESTAMP,
                record_id TEXT,
                error_message TEXT
            );

            CREATE TABLE IF NOT EXISTS processing_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                trigger TEXT,
                submissions_processed INTEGER,
                submissions_succeeded INTEGER,
                submissions_failed INTEGER
            );
        """)


@contextmanager
def get_db():
    """Context manager for database connections."""
    conn = sqlite3.connect(str(DATABASE_PATH))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def add_submission(url: str, title: str = '', publication: str = '',
                   date_published: str = '', categories: str = '',
                   notes: str = '') -> int:
    """Add a new submission to the queue. Returns the submission ID."""
    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO submissions (url, title, publication, date_published, categories, notes)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (url.strip(), title.strip(), publication.strip(),
             date_published.strip(), categories.strip(), notes.strip())
        )
        return cursor.lastrowid


def get_pending_submissions() -> List[Dict[str, Any]]:
    """Get all pending submissions."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM submissions WHERE status = 'pending' ORDER BY submitted_at ASC"
        ).fetchall()
        return [dict(row) for row in rows]


def get_pending_count() -> int:
    """Get the number of pending submissions."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM submissions WHERE status = 'pending'"
        ).fetchone()
        return row['cnt']


# Statuses that mean processing has finished. processed_at is stamped only on
# these, so an in-flight 'processing' row keeps a NULL processed_at until it
# actually completes. See issue #150.
_TERMINAL_STATUSES = ('completed', 'failed', 'duplicate')


def update_submission_status(submission_id: int, status: str,
                             record_id: str = None, error_message: str = None):
    """Update a submission's status.

    Only ``status`` is overwritten unconditionally. ``record_id`` and
    ``error_message`` are left untouched when not supplied — COALESCE keeps the
    stored value — so a later transition cannot erase context recorded by an
    earlier one. ``processed_at`` is stamped only when the submission reaches a
    terminal status, not on intermediate transitions such as 'processing'.
    """
    processed_at = (datetime.now().isoformat()
                    if status in _TERMINAL_STATUSES else None)
    with get_db() as conn:
        conn.execute(
            """UPDATE submissions
               SET status = ?,
                   processed_at = COALESCE(?, processed_at),
                   record_id = COALESCE(?, record_id),
                   error_message = COALESCE(?, error_message)
               WHERE id = ?""",
            (status, processed_at, record_id, error_message, submission_id)
        )


def get_recent_submissions(limit: int = 20) -> List[Dict[str, Any]]:
    """Get recent submissions regardless of status."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM submissions ORDER BY submitted_at DESC LIMIT ?",
            (limit,)
        ).fetchall()
        return [dict(row) for row in rows]


def get_submission_by_url(url: str) -> Optional[Dict[str, Any]]:
    """Check if a URL has already been submitted."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM submissions WHERE url = ? ORDER BY submitted_at DESC LIMIT 1",
            (url.strip(),)
        ).fetchone()
        return dict(row) if row else None


def log_processing_run(started_at: str, completed_at: str, trigger: str,
                       processed: int, succeeded: int, failed: int) -> int:
    """Log a processing run. Returns the run ID."""
    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO processing_runs
               (started_at, completed_at, trigger, submissions_processed,
                submissions_succeeded, submissions_failed)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (started_at, completed_at, trigger, processed, succeeded, failed)
        )
        return cursor.lastrowid


def get_last_processing_run() -> Optional[Dict[str, Any]]:
    """Get info about the most recent processing run."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM processing_runs ORDER BY started_at DESC LIMIT 1"
        ).fetchone()
        return dict(row) if row else None


def get_queue_stats() -> Dict[str, Any]:
    """Get summary stats about the queue."""
    with get_db() as conn:
        pending = conn.execute(
            "SELECT COUNT(*) as cnt FROM submissions WHERE status = 'pending'"
        ).fetchone()['cnt']
        completed = conn.execute(
            "SELECT COUNT(*) as cnt FROM submissions WHERE status = 'completed'"
        ).fetchone()['cnt']
        failed = conn.execute(
            "SELECT COUNT(*) as cnt FROM submissions WHERE status = 'failed'"
        ).fetchone()['cnt']
        total = conn.execute(
            "SELECT COUNT(*) as cnt FROM submissions"
        ).fetchone()['cnt']

        return {
            'pending': pending,
            'completed': completed,
            'failed': failed,
            'total': total,
        }
