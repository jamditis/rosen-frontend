#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pillar 3a stuck-row sweeper.

Invoked by ``sweep-stuck-rows.yml`` on a 30-minute cron. Reads the queue
sheet, classifies every row by status + age, and re-fires
``submit-record.yml`` for any row stuck past its threshold.

Thresholds (per design ``docs/plans/2026-05-24-pillar3a-free-auto-deploy-
design.md`` "Stuck-row sweeper"):

    submitted   > 30 min  → re-dispatch with original URL
    processing  > 1 hr    → re-dispatch with original URL
    archived    > 24 hr   → re-dispatch with sentinel URL (forces SFTP retry)

Terminal statuses (``live``, ``committed``, ``error``, ``duplicate``,
``no URL``, ``invalid URL``) are never touched regardless of age. ``committed``
marks a record whose data is appended but whose live push (SFTP) is not
configured on this runner -- retrying it would never make it live (#414).

The dedup check in ``submit-record.yml`` step 2 guarantees the sweep is
idempotent — a re-dispatched ``submitted`` row whose Action eventually did
run will short-circuit as ``duplicate``.

Required env:
    GITHUB_TOKEN              — App installation token with actions:write
    GITHUB_REPO               — e.g. jamditis/rosen-frontend
    SHEET_ID                  — queue sheet id
    SHEET_TAB                 — queue tab name (defaults to "Sheet1")
    one of:
        ROSEN_SHEETS_SA_KEY       — path to service-account JSON
        ROSEN_SHEETS_SA_KEY_JSON  — inline service-account JSON

Optional env:
    GITHUB_WORKFLOW_FILENAME  — default ``submit-record.yml``
    GITHUB_REF                — default ``main``
"""
from __future__ import annotations

import json
import logging
import os
import pathlib
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, List

import requests

_BACKEND = pathlib.Path(__file__).resolve().parents[1]
for _candidate in (_BACKEND, _BACKEND / 'src'):
    if str(_candidate) not in sys.path:
        sys.path.insert(0, str(_candidate))

from rosen_scraper.sheets_a1 import quote_tab  # noqa: E402 — after sys.path setup

logging.basicConfig(
    level=os.environ.get('LOG_LEVEL', 'INFO'),
    format='%(asctime)s %(levelname)s %(message)s',
    stream=sys.stdout,
    force=True,
)
logger = logging.getLogger('sweep_stuck')

# Status -> age threshold (seconds). Anything outside this dict is terminal.
_THRESHOLDS = {
    'submitted': 30 * 60,
    'processing': 60 * 60,
    'archived': 24 * 60 * 60,
}

# Sentinel URL prefix shared with process_submission.py — the consumer there
# short-circuits scrape/categorize/append and only runs the SFTP step.
SENTINEL_URL_PREFIX = 'https://example.com/sweep-noop-'


# ---------- Sheet ingestion -------------------------------------------------


def _load_sheets_credentials():
    """Build google.oauth2 credentials for the Sheets API."""
    key_path = os.environ.get('ROSEN_SHEETS_SA_KEY', '').strip()
    key_json = os.environ.get('ROSEN_SHEETS_SA_KEY_JSON', '').strip()
    if not (key_path or key_json):
        raise RuntimeError(
            'No Sheets service-account configured (set ROSEN_SHEETS_SA_KEY '
            'or ROSEN_SHEETS_SA_KEY_JSON)')
    from google.oauth2 import service_account
    scopes = ['https://www.googleapis.com/auth/spreadsheets.readonly']
    if key_json:
        info = json.loads(key_json)
        return service_account.Credentials.from_service_account_info(
            info, scopes=scopes)
    return service_account.Credentials.from_service_account_file(
        key_path, scopes=scopes)


def fetch_rows() -> List[Dict[str, Any]]:
    """Read columns A–H of the queue sheet.

    Returns a list of dicts, one per data row (header excluded). Keys:
    ``sheet_row`` (1-indexed), ``timestamp``, ``url``, ``title``, ``notes``,
    ``status``.
    """
    sheet_id = os.environ.get('SHEET_ID', '').strip()
    if not sheet_id:
        raise RuntimeError('SHEET_ID not set')
    sheet_tab = os.environ.get('SHEET_TAB', 'Sheet1').strip() or 'Sheet1'
    creds = _load_sheets_credentials()
    from googleapiclient.discovery import build
    service = build('sheets', 'v4', credentials=creds, cache_discovery=False)
    range_a1 = f'{quote_tab(sheet_tab)}!A1:H'
    resp = service.spreadsheets().values().get(
        spreadsheetId=sheet_id, range=range_a1).execute()
    values = resp.get('values') or []
    if not values:
        return []
    # Drop the header row; row 1 in the sheet is the header.
    out = []
    for idx, row in enumerate(values[1:], start=2):
        # Pad short rows so column access is uniform.
        row = row + [''] * (8 - len(row))
        out.append({
            'sheet_row': idx,
            'timestamp': (row[0] or '').strip(),
            'url': (row[1] or '').strip(),
            'title': (row[2] or '').strip(),
            'notes': (row[3] or '').strip(),
            # row[4] = column E (reserved); row[5] = F status.
            'status': (row[5] or '').strip(),
        })
    return out


# ---------- Workflow dispatch ----------------------------------------------


def dispatch_workflow(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """POST a workflow_dispatch with the given inputs.

    Returns ``{ok, status_code, body}``. Raises on network errors (the
    sweeper catches and continues with the next row).
    """
    token = os.environ.get('GITHUB_TOKEN', '').strip()
    repo = os.environ.get('GITHUB_REPO', '').strip()
    if not token or not repo:
        raise RuntimeError('GITHUB_TOKEN and GITHUB_REPO must be set')
    workflow = os.environ.get('GITHUB_WORKFLOW_FILENAME', 'submit-record.yml')
    ref = os.environ.get('GITHUB_REF', 'main')
    url = (f'https://api.github.com/repos/{repo}/actions/workflows/'
           f'{workflow}/dispatches')
    headers = {
        'Authorization': f'Bearer {token}',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    }
    payload = {'ref': ref,
               'inputs': {k: str(v) for k, v in inputs.items()}}
    resp = requests.post(url, headers=headers, json=payload, timeout=20)
    return {'ok': 200 <= resp.status_code < 300,
            'status_code': resp.status_code,
            'body': resp.text[:500]}


# ---------- Classification + dispatching -----------------------------------


def _parse_ts(ts: str):
    """Parse ISO-ish timestamps tolerant of trailing Z and missing TZ."""
    if not ts:
        return None
    candidate = ts.replace('Z', '+00:00').strip()
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        # Apps Script sometimes writes `2026-05-24 21:00:00` (space-separated).
        try:
            parsed = datetime.strptime(candidate, '%Y-%m-%d %H:%M:%S')
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _age_seconds(ts: str) -> float:
    parsed = _parse_ts(ts)
    if parsed is None:
        return -1.0
    return (datetime.now(timezone.utc) - parsed).total_seconds()


def _is_stuck(status: str, age: float) -> bool:
    threshold = _THRESHOLDS.get(status)
    if threshold is None:
        return False
    return age >= threshold


def _humanize(seconds: float) -> str:
    if seconds < 0:
        return 'unknown'
    if seconds < 60:
        return f'{seconds:.0f}s'
    if seconds < 3600:
        return f'{seconds/60:.0f}m'
    if seconds < 86400:
        return f'{seconds/3600:.1f}h'
    return f'{seconds/86400:.1f}d'


def sweep() -> Dict[str, int]:
    """Read sheet, dispatch every stuck row. Returns counters."""
    rows = fetch_rows()
    counts = {'total': len(rows), 'fresh': 0, 'terminal': 0,
              'dispatched': 0, 'failed': 0}
    sheet_id = os.environ.get('SHEET_ID', '').strip()
    sheet_tab = os.environ.get('SHEET_TAB', 'Sheet1').strip() or 'Sheet1'

    for row in rows:
        status = row['status']
        sheet_row = row['sheet_row']
        if status not in _THRESHOLDS:
            counts['terminal'] += 1
            continue
        age = _age_seconds(row['timestamp'])
        if not _is_stuck(status, age):
            counts['fresh'] += 1
            logger.info(f'row {sheet_row}: {status}={_humanize(age)}, fresh, '
                        'skipping')
            continue
        dispatch_url = row['url']
        title = row['title']
        notes = row['notes']
        if status == 'archived':
            # No-op submission: scrape/categorize/append are skipped; only
            # SFTP runs. The sentinel timestamp keeps each retry unique in
            # the Action run history without affecting dedup (the consumer
            # short-circuits before the dedup check).
            dispatch_url = f'{SENTINEL_URL_PREFIX}{int(time.time())}'
            title = title or f'(sweep-noop for row {sheet_row})'
        # raw_text is intentionally absent: the queue sheet has no raw_text
        # column yet (fetch_rows reads only A:H), so a row originally submitted
        # with pasted text can't carry it through an automated retry. Adding the
        # column + carry is Phase 3, tracked in #353. Until then a stuck
        # paste-submission re-runs against its URL — same behaviour as before
        # the raw_text fallback existed, so no regression, just no carry.
        inputs = {
            'url': dispatch_url, 'title': title, 'notes': notes,
            'sheet_id': sheet_id, 'sheet_tab': sheet_tab,
            'sheet_row': sheet_row,
        }
        try:
            res = dispatch_workflow(inputs)
            if res.get('ok'):
                counts['dispatched'] += 1
                logger.info(f'swept row {sheet_row}: {status}='
                            f'{_humanize(age)}, re-dispatched')
            else:
                counts['failed'] += 1
                logger.error(f'row {sheet_row}: dispatch returned '
                             f"{res.get('status_code')}: {res.get('body')}")
        except Exception as exc:  # noqa: BLE001 — continue with next row
            counts['failed'] += 1
            logger.error(f'row {sheet_row}: dispatch raised: {exc}')

    logger.info(f'sweep done: {counts}')
    return counts


def main(argv=None) -> int:
    try:
        sweep()
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.error(f'sweep failed: {exc}')
        sys.stdout.flush()
        sys.exit(1)
    sys.stdout.flush()
    return 0


if __name__ == '__main__':
    sys.exit(main())
