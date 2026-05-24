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

import functools
import hmac
import logging
import threading
from flask import Flask, render_template, request, redirect, url_for, jsonify, abort

from .config import (SERVER_PORT, SERVER_HOST, THEMATIC_CATEGORIES,
                     SUBMISSION_AUTH_TOKEN)
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


# --- Authentication -------------------------------------------------------
# The server has no transport-level access control. When SUBMISSION_AUTH_TOKEN
# is set, every request must present it; when it is empty the server relies on
# binding to localhost (see config.SERVER_HOST). See issue #136.
_AUTH_COOKIE = 'submission_token'


def _supplied_token():
    """Return the auth token offered by the current request, if any."""
    return (request.headers.get('X-Auth-Token')
            or request.values.get('token')
            or request.cookies.get(_AUTH_COOKIE)
            or '')


def _token_matches(candidate):
    """Constant-time comparison of a request-supplied token to the secret.

    hmac.compare_digest avoids the early-exit timing side-channel a plain `==`
    on the secret would leak. Both operands are encoded to bytes so a token
    containing non-ASCII characters cannot raise TypeError.
    """
    return hmac.compare_digest((candidate or '').encode('utf-8'),
                               SUBMISSION_AUTH_TOKEN.encode('utf-8'))


def require_auth(view):
    """Gate a route behind SUBMISSION_AUTH_TOKEN when one is configured."""
    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        if SUBMISSION_AUTH_TOKEN and not _token_matches(_supplied_token()):
            abort(401)
        return view(*args, **kwargs)
    return wrapped


@app.after_request
def _persist_token(response):
    """Store a valid token in a cookie so browser navigation keeps working."""
    if SUBMISSION_AUTH_TOKEN:
        offered = request.headers.get('X-Auth-Token') or request.values.get('token')
        if offered and _token_matches(offered) and request.cookies.get(_AUTH_COOKIE) != offered:
            # Mark the cookie Secure on HTTPS requests so a valid token is never
            # replayed over plaintext HTTP if the server is fronted by TLS.
            response.set_cookie(_AUTH_COOKIE, offered, httponly=True,
                                samesite='Lax', secure=request.is_secure)
    return response


@app.before_request
def ensure_db():
    """Initialize database on first request."""
    if not hasattr(app, '_db_initialized'):
        db.init_db()
        app._db_initialized = True


@app.route('/')
@require_auth
def form():
    """Render the submission form."""
    pending_count = db.get_pending_count()
    return render_template('form.html',
                           categories=THEMATIC_CATEGORIES,
                           pending_count=pending_count)


def _submission_payload():
    """Return form-or-JSON values for /submit so Apps Script and the HTML form
    can hit the same endpoint. Apps Script posts JSON; the legacy form posts
    multipart. ``getlist`` is form-only, so JSON callers pass categories as a
    list or comma string."""
    if request.is_json:
        body = request.get_json(silent=True) or {}
        cats = body.get('categories', '')
        if isinstance(cats, list):
            cats_list = cats
        else:
            cats_list = [c.strip() for c in str(cats).split(',') if c.strip()]
        return body, cats_list
    return request.form, request.form.getlist('categories')


def _json_or_html(success: bool, **payload):
    """Return JSON for Apps Script callers, rendered HTML for browser callers.

    ``success`` is the canonical pass/fail flag; payload kwargs are merged in
    for both shapes. The form template reads ``success`` as a Jinja flag.
    """
    if request.is_json or request.headers.get('Accept', '').startswith('application/json'):
        return jsonify({'ok': success, **payload})
    return render_template('form.html',
                           categories=THEMATIC_CATEGORIES,
                           pending_count=db.get_pending_count(),
                           success=success,
                           **payload)


@app.route('/submit', methods=['POST'])
@require_auth
def submit():
    """Accept a URL submission. Supports both the HTML form and JSON callers
    (Apps Script). When the caller provides ``sheet_id``/``sheet_tab``/
    ``sheet_row``, those round-trip into the queue so the status writeback
    can update the right row of the right sheet."""
    body, selected_cats = _submission_payload()
    url = (body.get('url') or '').strip()

    if not url:
        return _json_or_html(False, error='URL is required.')

    # Basic URL validation
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url

    # SSRF guard: reject URLs that point at private/loopback/link-local hosts
    # before the URL is ever queued and fetched server-side. See issue #137.
    from rosen_scraper.url_safety import is_safe_public_url
    url_ok, url_reason = is_safe_public_url(url)
    if not url_ok:
        return _json_or_html(False, error=f'That URL cannot be accepted: {url_reason}.')

    # Check for duplicate in queue
    existing = db.get_submission_by_url(url)
    if existing and existing['status'] in ('pending', 'processing'):
        return _json_or_html(
            False,
            error=f'This URL is already in the queue (status: {existing["status"]}).')

    title = (body.get('title') or '').strip()
    publication = (body.get('publication') or '').strip()
    date_published = (body.get('date_published') or '').strip()
    notes = (body.get('notes') or '').strip()
    categories_str = ', '.join(selected_cats)

    sheet_id = (body.get('sheet_id') or '').strip()
    sheet_tab = (body.get('sheet_tab') or '').strip()
    sheet_row_raw = body.get('sheet_row')
    try:
        sheet_row = int(sheet_row_raw) if sheet_row_raw not in (None, '') else None
    except (TypeError, ValueError):
        sheet_row = None

    sub_id = db.add_submission(
        url=url,
        title=title,
        publication=publication,
        date_published=date_published,
        categories=categories_str,
        notes=notes,
        sheet_id=sheet_id,
        sheet_tab=sheet_tab,
        sheet_row=sheet_row,
    )

    pending_count = db.get_pending_count()
    logger.info(f"New submission #{sub_id}: {url} (queue: {pending_count})")

    # _json_or_html re-reads pending_count for the HTML branch; the JSON branch
    # surfaces it from the local in case callers want the post-submit count.
    return _json_or_html(True, submitted_url=url,
                         submission_id=sub_id, queue_size=pending_count)


@app.route('/status')
@require_auth
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
@require_auth
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
@require_auth
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
