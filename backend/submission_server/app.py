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
import hashlib
import hmac
import logging
import threading
import time
from flask import (
    Flask,
    render_template,
    request,
    redirect,
    url_for,
    jsonify,
    abort,
    make_response,
)

from .config import (
    SERVER_PORT,
    SERVER_HOST,
    THEMATIC_CATEGORIES,
    SUBMISSION_AUTH_TOKEN,
    SUBMISSION_RATE_LIMIT_PER_MINUTE,
    SUBMISSION_RATE_LIMIT_PER_HOUR,
)
from . import db
from .processor import process_batch

app = Flask(__name__)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("submission_server")

# Track whether a batch is currently running
_processing_lock = threading.Lock()
_is_processing = False

# In-process submission flood control for the legacy Flask endpoint. The app is
# deployed as a small single-process service, so a local sliding-window limiter
# is enough to protect the queue without adding dependency or lock-file churn.
_rate_limit_lock = threading.Lock()
_submission_hits = {}
_rate_limit_windows = (
    (60, SUBMISSION_RATE_LIMIT_PER_MINUTE),
    (60 * 60, SUBMISSION_RATE_LIMIT_PER_HOUR),
)


# --- Authentication -------------------------------------------------------
# The server has no transport-level access control. When SUBMISSION_AUTH_TOKEN
# is set, every request must present it; when it is empty the server relies on
# binding to localhost (see config.SERVER_HOST). See issue #136.
_AUTH_COOKIE = "submission_token"


def _supplied_token():
    """Return the auth token offered by the current request, if any."""
    return (
        request.headers.get("X-Auth-Token")
        or request.values.get("token")
        or request.cookies.get(_AUTH_COOKIE)
        or ""
    )


def _token_matches(candidate):
    """Constant-time comparison of a request-supplied token to the secret.

    hmac.compare_digest avoids the early-exit timing side-channel a plain `==`
    on the secret would leak. Both operands are encoded to bytes so a token
    containing non-ASCII characters cannot raise TypeError.
    """
    return hmac.compare_digest(
        (candidate or "").encode("utf-8"), SUBMISSION_AUTH_TOKEN.encode("utf-8")
    )


def _client_ip():
    """Return the best available client IP for rate-limit bucketing."""
    if request.access_route:
        return request.access_route[0]
    return request.remote_addr or "unknown"


def _submission_rate_limit_keys():
    """Build independent per-IP and per-token rate-limit buckets."""
    keys = [f"ip:{_client_ip()}"]
    token = _supplied_token()
    if token:
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()[:16]
        keys.append(f"token:{token_hash}")
    return keys


def _check_submission_rate_limit():
    """Record a /submit attempt and return retry seconds if it is blocked."""
    now = time.monotonic()
    keys = _submission_rate_limit_keys()

    with _rate_limit_lock:
        for key in keys:
            windows = _submission_hits.setdefault(key, {})
            for window_seconds, max_hits in _rate_limit_windows:
                hits = windows.setdefault(window_seconds, [])
                cutoff = now - window_seconds
                hits[:] = [hit for hit in hits if hit > cutoff]
                if len(hits) >= max_hits:
                    retry_after = int(window_seconds - (now - hits[0])) + 1
                    return max(1, retry_after)

        for key in keys:
            windows = _submission_hits.setdefault(key, {})
            for window_seconds, _max_hits in _rate_limit_windows:
                windows.setdefault(window_seconds, []).append(now)

    return None


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
        offered = request.headers.get("X-Auth-Token") or request.values.get("token")
        if (
            offered
            and _token_matches(offered)
            and request.cookies.get(_AUTH_COOKIE) != offered
        ):
            # Mark the cookie Secure on HTTPS requests so a valid token is never
            # replayed over plaintext HTTP if the server is fronted by TLS.
            response.set_cookie(
                _AUTH_COOKIE,
                offered,
                httponly=True,
                samesite="Lax",
                secure=request.is_secure,
            )
    return response


@app.before_request
def ensure_db():
    """Initialize database on first request."""
    if not hasattr(app, "_db_initialized"):
        db.init_db()
        app._db_initialized = True


@app.route("/")
@require_auth
def form():
    """Render the submission form."""
    pending_count = db.get_pending_count()
    return render_template(
        "form.html", categories=THEMATIC_CATEGORIES, pending_count=pending_count
    )


def _submission_payload():
    """Return form-or-JSON values for /submit so Apps Script and the HTML form
    can hit the same endpoint. Apps Script posts JSON; the legacy form posts
    multipart. ``getlist`` is form-only, so JSON callers pass categories as a
    list or comma string."""
    if request.is_json:
        body = request.get_json(silent=True) or {}
        cats = body.get("categories", "")
        if isinstance(cats, list):
            cats_list = cats
        else:
            cats_list = [c.strip() for c in str(cats).split(",") if c.strip()]
        return body, cats_list
    return request.form, request.form.getlist("categories")


def _json_or_html(success: bool, status_code: int = 200, **payload):
    """Return JSON for Apps Script callers, rendered HTML for browser callers.

    ``status_code`` controls the JSON response code (caller picks 400/409/422
    for validation/dedup/SSRF). HTML responses stay at 200 because the template
    renders the error inline — flipping that to 4xx would change form UX.

    The Apps Script client at automation/apps-script/Code.gs keys off the HTTP
    status code; returning 200 on an error body silently strands the row at
    'submitted' with no feedback to Jay. Codex + Copilot finding on PR #212.
    """
    if request.is_json or request.headers.get("Accept", "").startswith(
        "application/json"
    ):
        return jsonify({"ok": success, **payload}), status_code
    return render_template(
        "form.html",
        categories=THEMATIC_CATEGORIES,
        pending_count=db.get_pending_count(),
        success=success,
        **payload,
    )


@app.route("/submit", methods=["POST"])
@require_auth
def submit():
    """Accept a URL submission. Supports both the HTML form and JSON callers
    (Apps Script). When the caller provides ``sheet_id``/``sheet_tab``/
    ``sheet_row``, those round-trip into the queue so the status writeback
    can update the right row of the right sheet."""
    retry_after = _check_submission_rate_limit()
    if retry_after is not None:
        response = make_response(
            _json_or_html(
                False,
                status_code=429,
                error="Too many submissions. Please wait before trying again.",
                retry_after_seconds=retry_after,
            )
        )
        response.headers["Retry-After"] = str(retry_after)
        return response

    body, selected_cats = _submission_payload()
    url = (body.get("url") or "").strip()

    if not url:
        return _json_or_html(False, status_code=400, error="URL is required.")

    # Basic URL validation
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    # SSRF guard: reject URLs that point at private/loopback/link-local hosts
    # before the URL is ever queued and fetched server-side. See issue #137.
    from rosen_scraper.url_safety import is_safe_public_url

    url_ok, url_reason = is_safe_public_url(url)
    if not url_ok:
        return _json_or_html(
            False, status_code=422, error=f"That URL cannot be accepted: {url_reason}."
        )

    # Check for duplicate in queue
    existing = db.get_submission_by_url(url)
    if existing and existing["status"] in ("pending", "processing"):
        return _json_or_html(
            False,
            status_code=409,
            error=f'This URL is already in the queue (status: {existing["status"]}).',
        )

    title = (body.get("title") or "").strip()
    publication = (body.get("publication") or "").strip()
    date_published = (body.get("date_published") or "").strip()
    notes = (body.get("notes") or "").strip()
    categories_str = ", ".join(selected_cats)

    sheet_id = (body.get("sheet_id") or "").strip()
    sheet_tab = (body.get("sheet_tab") or "").strip()
    sheet_row_raw = body.get("sheet_row")
    try:
        sheet_row = int(sheet_row_raw) if sheet_row_raw not in (None, "") else None
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
    return _json_or_html(
        True, submitted_url=url, submission_id=sub_id, queue_size=pending_count
    )


@app.route("/status")
@require_auth
def status():
    """Render the status dashboard."""
    stats = db.get_queue_stats()
    recent = db.get_recent_submissions(limit=30)
    last_run = db.get_last_processing_run()

    return render_template(
        "status.html",
        stats=stats,
        recent=recent,
        last_run=last_run,
        is_processing=_is_processing,
    )


@app.route("/queue")
@require_auth
def queue_api():
    """JSON API for monitoring."""
    stats = db.get_queue_stats()
    last_run = db.get_last_processing_run()
    return jsonify(
        {
            "stats": stats,
            "last_run": last_run,
            "is_processing": _is_processing,
        }
    )


@app.route("/process", methods=["POST"])
@require_auth
def trigger_process():
    """Manually trigger batch processing."""
    global _is_processing

    if _is_processing:
        return redirect(url_for("status"))

    pending = db.get_pending_count()
    if pending == 0:
        return redirect(url_for("status"))

    # Run processing in a background thread so the page doesn't hang
    def run_batch():
        global _is_processing
        _is_processing = True
        try:
            with _processing_lock:
                process_batch(trigger="manual")
        finally:
            _is_processing = False

    thread = threading.Thread(target=run_batch, daemon=True)
    thread.start()

    return redirect(url_for("status"))


def main():
    """Run the Flask development server."""
    db.init_db()
    logger.info(f"Starting submission server on {SERVER_HOST}:{SERVER_PORT}")
    app.run(host=SERVER_HOST, port=SERVER_PORT, debug=False)


if __name__ == "__main__":
    main()
