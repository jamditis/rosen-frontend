#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Flask web server for Jay Rosen archive submissions.

Routes:
    GET  /         — submission form
    POST /submit   — accept a URL submission
    GET  /status   — dashboard showing queue and processing history
    GET  /queue    — JSON API for queue status (monitoring)
    POST /process  — manually trigger batch processing
"""

import logging
import threading
from flask import Flask, render_template, request, redirect, url_for, jsonify

from .config import SERVER_PORT, SERVER_HOST, THEMATIC_CATEGORIES
from . import db
from .processor import process_batch

app = Flask(__name__)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(name)s] %(levelname)s: %(message)s',
)
logger = logging.getLogger('submission_server')

# Track whether a batch is currently running
_processing_lock = threading.Lock()
_is_processing = False


@app.before_request
def ensure_db():
    """Initialize database on first request."""
    if not hasattr(app, '_db_initialized'):
        db.init_db()
        app._db_initialized = True


@app.route('/')
def form():
    """Render the submission form."""
    pending_count = db.get_pending_count()
    return render_template('form.html',
                           categories=THEMATIC_CATEGORIES,
                           pending_count=pending_count)


@app.route('/submit', methods=['POST'])
def submit():
    """Accept a URL submission."""
    url = request.form.get('url', '').strip()

    if not url:
        return render_template('form.html',
                               categories=THEMATIC_CATEGORIES,
                               pending_count=db.get_pending_count(),
                               error='URL is required.')

    # Basic URL validation
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url

    # Check for duplicate in queue
    existing = db.get_submission_by_url(url)
    if existing and existing['status'] in ('pending', 'processing'):
        return render_template('form.html',
                               categories=THEMATIC_CATEGORIES,
                               pending_count=db.get_pending_count(),
                               error=f'This URL is already in the queue (status: {existing["status"]}).')

    # Collect optional fields
    title = request.form.get('title', '').strip()
    publication = request.form.get('publication', '').strip()
    date_published = request.form.get('date_published', '').strip()
    notes = request.form.get('notes', '').strip()

    # Collect selected categories
    selected_cats = request.form.getlist('categories')
    categories_str = ', '.join(selected_cats)

    sub_id = db.add_submission(
        url=url,
        title=title,
        publication=publication,
        date_published=date_published,
        categories=categories_str,
        notes=notes,
    )

    pending_count = db.get_pending_count()
    logger.info(f"New submission #{sub_id}: {url} (queue: {pending_count})")

    return render_template('form.html',
                           categories=THEMATIC_CATEGORIES,
                           pending_count=pending_count,
                           success=True,
                           submitted_url=url,
                           submission_id=sub_id)


@app.route('/status')
def status():
    """Render the status dashboard."""
    stats = db.get_queue_stats()
    recent = db.get_recent_submissions(limit=30)
    last_run = db.get_last_processing_run()

    return render_template('status.html',
                           stats=stats,
                           recent=recent,
                           last_run=last_run,
                           is_processing=_is_processing)


@app.route('/queue')
def queue_api():
    """JSON API for monitoring."""
    stats = db.get_queue_stats()
    last_run = db.get_last_processing_run()
    return jsonify({
        'stats': stats,
        'last_run': last_run,
        'is_processing': _is_processing,
    })


@app.route('/process', methods=['POST'])
def trigger_process():
    """Manually trigger batch processing."""
    global _is_processing

    if _is_processing:
        return redirect(url_for('status'))

    pending = db.get_pending_count()
    if pending == 0:
        return redirect(url_for('status'))

    # Run processing in a background thread so the page doesn't hang
    def run_batch():
        global _is_processing
        _is_processing = True
        try:
            with _processing_lock:
                process_batch(trigger='manual')
        finally:
            _is_processing = False

    thread = threading.Thread(target=run_batch, daemon=True)
    thread.start()

    return redirect(url_for('status'))


def main():
    """Run the Flask development server."""
    db.init_db()
    logger.info(f"Starting submission server on {SERVER_HOST}:{SERVER_PORT}")
    app.run(host=SERVER_HOST, port=SERVER_PORT, debug=False)


if __name__ == '__main__':
    main()
