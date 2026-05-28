#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pillar 3a Action-facing entry point.

Invoked once per `submit-record.yml` workflow_dispatch run. Replaces the
per-submission Flask handler from Pillar 3 with a one-shot script that the
GitHub Action calls with the row's inputs. Design:
``docs/plans/2026-05-24-pillar3a-free-auto-deploy-design.md``.

Usage::

    python backend/scripts/process_submission.py \\
        --url "$URL" --title "$TITLE" --notes "$NOTES" \\
        --sheet-id "$SHEET_ID" --sheet-tab "$SHEET_TAB" \\
        --sheet-row "$SHEET_ROW"

Behavior (12-step pipeline from the design's "Architecture" diagram):

    1.  Sheet writeback F='processing'              (best-effort)
    2.  Dedup vs current archive_records-public.csv (short-circuit on hit)
    3.  dispatcher.dispatch_url(url)                (scrape)
    4.  categorize(...)                             (Gemini; degrade on fail)
    5.  generate_source_based_id()                  (next RECORD-NNNNN)
    6.  enrich_data() + _sanitize_cell()            (mimic Pillar 3)
    7.  Append to data/archive_records-public.csv   (atomic tmp+rename)
    8.  node data/export-archive-data.js            (regen JSONs)
    9.  npm test                                    (abort commit on fail)
   10.  git commit + push to main                   (App-token identity)
   11.  SFTP push 4 JSONs to pressthink.org         (sftp_push.py)
   12.  Sheet writeback F='live', G=RECORD-NNNNN   (retry once, then exit-non-0)

Status outcomes: ``live | archived | duplicate | error | noop``.

Critical conventions:
    * NEVER ``git add -A`` — stage explicit paths.
    * NEVER include AI attribution in commit messages.
    * ``_sanitize_cell`` on every user-supplied string before any CSV/sheet write.
    * Atomic tmp+rename for CSV writes.
    * Secrets from env: ``GEMINI_API_KEY``, ``ROSEN_SHEETS_SA_KEY[_JSON]``,
      ``ROSEN_SFTP_HOST/USER/PASSWORD/KEY_PATH/REMOTE_PATH/KNOWN_HOSTS``,
      ``GITHUB_TOKEN``.
    * No ``--no-verify`` on commits.
"""
from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import pathlib
import subprocess
import sys
import tempfile
from typing import Any, Dict, Optional, Set

# Lay the package roots on sys.path so the script is runnable both via
# `python backend/scripts/process_submission.py` and via the workflow's
# `cd backend && python scripts/...` invocation.
_BACKEND = pathlib.Path(__file__).resolve().parents[1]
for _candidate in (_BACKEND, _BACKEND / 'src'):
    if str(_candidate) not in sys.path:
        sys.path.insert(0, str(_candidate))

# Re-exported so tests can monkeypatch a single import surface per module.
from rosen_scraper.dispatcher import dispatch_url as _dispatch_url  # noqa: E402
from rosen_scraper.categorizer import summarize_and_classify as _categorize  # noqa: E402
from rosen_scraper.entity_extractor import (  # noqa: E402
    extract_entities_and_relationships as _extract_entities,
)
from rosen_scraper import entity_csv_writer  # noqa: E402
from rosen_scraper.workflow import (  # noqa: E402
    enrich_data,
    generate_source_based_id,
)
from submission_server import sftp_push, sheets_callback  # noqa: E402
from submission_server.config import (  # noqa: E402
    CSV_FILE as _DEFAULT_CSV_FILE,
    DATA_DIR,
    EXPORT_SCRIPT,
    FTP_STAGING_DIR,
    KNOWN_ENTITIES_FILE,
    PROJECT_ROOT,
    SCHEMA_FILE,
)
from submission_server.processor import (  # noqa: E402
    _STAGED_JSON_FILES,
    _sanitize_cell,
    _sanitize_record,
)

# Module-level handles that tests monkeypatch. Functions in this module call
# these names so a `monkeypatch.setattr(process_submission, 'dispatch_url', …)`
# in a test reroutes the call cleanly.
dispatch_url = _dispatch_url
categorize = _categorize
extract_entities_and_relationships = _extract_entities

# Tests override CSV_FILE to point at a tmp file. Defaults to the canonical
# archive CSV when the script runs in CI.
CSV_FILE = _DEFAULT_CSV_FILE

SENTINEL_URL_PREFIX = 'https://example.com/sweep-noop-'

logging.basicConfig(
    level=os.environ.get('LOG_LEVEL', 'INFO'),
    format='%(asctime)s %(levelname)s %(message)s',
    stream=sys.stdout,
    force=True,
)
logger = logging.getLogger('process_submission')


# ---------- Helpers ---------------------------------------------------------


def _load_schema() -> Dict[str, Any]:
    """Load classification schema; return an empty dict on miss.

    The script never bails on a missing schema — categorization is allowed to
    degrade to ``uncategorized`` and submission still proceeds.
    """
    try:
        with open(SCHEMA_FILE, 'r', encoding='utf-8-sig') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        logger.warning(f'Could not load schema (degrading): {exc}')
        return {}


def _load_known_entities() -> Dict[str, Any]:
    try:
        with open(KNOWN_ENTITIES_FILE, 'r', encoding='utf-8-sig') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _read_csv_headers(csv_path: pathlib.Path) -> list:
    if not csv_path.exists():
        return []
    with csv_path.open('r', encoding='utf-8-sig', newline='') as f:
        reader = csv.reader(f)
        return next(reader, [])


def _read_existing(csv_path: pathlib.Path):
    """Return (existing_urls, existing_ids, url_to_id) for dedup + ID gen."""
    urls = set()
    ids: Set[str] = set()
    url_to_id: Dict[str, str] = {}
    if not csv_path.exists():
        return urls, ids, url_to_id
    with csv_path.open('r', encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            url = (row.get('url') or '').strip()
            rid = (row.get('id') or '').strip()
            if url:
                urls.add(url)
            if rid:
                ids.add(rid)
            if url and rid:
                url_to_id[url] = rid
    return urls, ids, url_to_id


def _atomic_append_row(csv_path: pathlib.Path, row: Dict[str, Any],
                       headers: list) -> None:
    """Append one row to ``csv_path`` via tmp+rename.

    Read the existing file, write existing + new row to a sibling tmp, then
    ``os.replace``. Atomic for any concurrent reader — they see either the
    pre-append or post-append file, never a partial line.
    """
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    existing_rows = []
    if csv_path.exists():
        with csv_path.open('r', encoding='utf-8-sig', newline='') as f:
            reader = csv.DictReader(f)
            for r in reader:
                existing_rows.append(r)
    sanitized = _sanitize_record(row)
    fd, tmp_path = tempfile.mkstemp(prefix='.csv_tmp.', dir=str(csv_path.parent))
    os.close(fd)
    try:
        with open(tmp_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=headers, extrasaction='ignore')
            writer.writeheader()
            for r in existing_rows:
                writer.writerow(r)
            writer.writerow(sanitized)
        os.replace(tmp_path, str(csv_path))
    except Exception:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise


def _stage_for_ftp() -> bool:
    """Copy regenerated JSONs from data/ to the SFTP staging dir."""
    import shutil
    FTP_STAGING_DIR.mkdir(parents=True, exist_ok=True)
    copied = 0
    for fname in _STAGED_JSON_FILES:
        src = DATA_DIR / fname
        dst = FTP_STAGING_DIR / fname
        if src.exists():
            shutil.copy2(str(src), str(dst))
            copied += 1
        else:
            logger.warning(f'Expected JSON missing: {src}')
    return copied > 0


def _safe_writeback(sheet_id: str, sheet_tab: str, sheet_row: int,
                    status: str, record_id: str = '', error: str = '',
                    *, fatal: bool = False) -> bool:
    """Best-effort wrapper around sheets_callback.update_row.

    Returns True on success. Catches every exception so a sheet-API outage in
    the early steps doesn't abort the submission. The final-step caller passes
    ``fatal=True`` and uses the return value to decide whether to retry / exit
    non-zero.
    """
    if not sheet_id or not sheet_row:
        return False
    try:
        result = sheets_callback.update_row(
            sheet_id=sheet_id, sheet_tab=sheet_tab, row=int(sheet_row),
            status=status, record_id=record_id, error=_sanitize_cell(error or ''),
        )
        if isinstance(result, dict):
            return bool(result.get('ok'))
        return True
    except Exception as exc:  # noqa: BLE001 — best-effort
        level = logger.error if fatal else logger.warning
        level(f'Sheet writeback failed (status={status}): {exc}')
        return False


def _short_title(title: str, width: int = 60) -> str:
    title = (title or '').strip()
    if len(title) <= width:
        return title
    return title[:width - 1].rstrip() + '…'


def _git_commit_and_push(record_id: str, title: str,
                         relative_csv_path: str) -> Optional[str]:
    """Stage explicit paths, commit, push. Returns None on success, error string."""
    paths = ([relative_csv_path,
              'data/extracted_entities.csv',
              'data/extracted_relationships.csv']
             + [f'data/{f}' for f in _STAGED_JSON_FILES])
    short = _short_title(title) or 'auto-submit'
    message = f'data: add {record_id} via auto-submit ({short})'
    try:
        # Configure bot identity for the commit. The Action sets GIT_AUTHOR_*
        # env vars too, but a direct configure keeps the script portable.
        subprocess.run(
            ['git', 'config', 'user.name',
             os.environ.get('GIT_BOT_NAME', 'rosen-archive-bot')],
            cwd=str(PROJECT_ROOT), check=True, capture_output=True, text=True,
        )
        subprocess.run(
            ['git', 'config', 'user.email',
             os.environ.get('GIT_BOT_EMAIL',
                            'rosen-archive-bot@users.noreply.github.com')],
            cwd=str(PROJECT_ROOT), check=True, capture_output=True, text=True,
        )
        subprocess.run(
            ['git', 'add'] + paths,
            cwd=str(PROJECT_ROOT), check=True, capture_output=True, text=True,
        )
        subprocess.run(
            ['git', 'commit', '-m', message],
            cwd=str(PROJECT_ROOT), check=True, capture_output=True, text=True,
        )
        subprocess.run(
            ['git', 'push', 'origin', 'HEAD:main'],
            cwd=str(PROJECT_ROOT), check=True, capture_output=True, text=True,
        )
        return None
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or '').strip()
        return f'git op failed: {stderr or exc}'


def _csv_relpath(csv_path: pathlib.Path) -> str:
    try:
        return str(csv_path.resolve().relative_to(PROJECT_ROOT.resolve()))
    except ValueError:
        return str(csv_path)


# ---------- Pipeline --------------------------------------------------------


def _is_sentinel(url: str) -> bool:
    return (url or '').startswith(SENTINEL_URL_PREFIX)


def process_one(url: str, title: str = '', notes: str = '',
                sheet_id: str = '', sheet_tab: str = '',
                sheet_row: Optional[int] = None,
                prototype_mode: bool = False) -> Dict[str, Any]:
    """Run the 12-step pipeline for one submission. Returns a result dict.

    Keys: ``status`` (live/archived/duplicate/error/noop), ``record_id``,
    ``error``, ``exit_code``.
    """
    result: Dict[str, Any] = {'status': 'error', 'record_id': '',
                              'error': '', 'exit_code': 1}

    url = (url or '').strip()
    title = title or ''
    notes = notes or ''

    # --- Sentinel handling: no-op submission that only runs the SFTP step. -
    if _is_sentinel(url):
        logger.info(f'Sentinel URL ({url}); skipping scrape/categorize/append, '
                    'running SFTP only')
        # Even on a noop we still need the staged JSONs to push. Regen if
        # the staging dir is empty.
        if not all((FTP_STAGING_DIR / f).exists() for f in _STAGED_JSON_FILES):
            try:
                subprocess.run(['node', str(EXPORT_SCRIPT)],
                               cwd=str(DATA_DIR), check=True,
                               capture_output=True, text=True)
                _stage_for_ftp()
            except Exception as exc:  # noqa: BLE001
                logger.warning(f'Sentinel regen failed (continuing): {exc}')
        push = sftp_push.push_to_production()
        if push.get('ok'):
            # Promote the originally-archived row to 'live' so the sweeper's
            # `archived > 24hr` query stops re-firing it. Without this the
            # row stays archived forever and every cron tick re-dispatches.
            _safe_writeback(sheet_id, sheet_tab, sheet_row or 0,
                            status='live',
                            error='Recovered via sweep retry')
            result.update({'status': 'noop', 'exit_code': 0,
                           'error': 'sentinel sweep no-op; SFTP retry ok'})
        else:
            # Leave the row at 'archived'; the next sweep tick will retry.
            result.update({'status': 'noop', 'exit_code': 0,
                           'error': f"sentinel sweep no-op; SFTP retry: "
                                    f"{push.get('error', 'unknown')}"})
        return result

    # --- Step 1: sheet ack (best-effort). ---------------------------------
    _safe_writeback(sheet_id, sheet_tab, sheet_row or 0, status='processing')

    # --- Step 2: dedup. ---------------------------------------------------
    csv_path = pathlib.Path(CSV_FILE)
    headers = _read_csv_headers(csv_path)
    existing_urls, existing_ids, url_to_id = _read_existing(csv_path)
    if url in existing_urls:
        existing_id = url_to_id.get(url, '')
        logger.info(f'Duplicate URL → {existing_id}')
        _safe_writeback(sheet_id, sheet_tab, sheet_row or 0,
                        status='duplicate', record_id=existing_id,
                        error='URL already in archive')
        return {'status': 'duplicate', 'record_id': existing_id,
                'error': 'URL already in archive', 'exit_code': 0}

    # --- Step 3: scrape. --------------------------------------------------
    schema = _load_schema()
    known_entities = _load_known_entities()
    try:
        scrape = dispatch_url(url, schema)
    except Exception as exc:  # noqa: BLE001
        logger.error(f'Dispatcher raised: {exc}')
        scrape = None
    # The existing platform dispatchers (Bluesky, Twitter, article scraper,
    # etc.) sometimes report failures via a truthy dict like
    # ``{'status': 'failed', 'error': '...'}`` instead of returning None.
    # Treat any non-success status as a scrape failure so we don't commit
    # a broken record and deploy it.
    scrape_failed = (
        not scrape
        or (isinstance(scrape, dict)
            and str(scrape.get('status', '')).lower() in {'failed', 'error'})
    )
    if scrape_failed:
        reason = ''
        if isinstance(scrape, dict):
            reason = str(scrape.get('error') or '').strip()
        msg = (f'Scrape failed: {reason}'
               if reason
               else 'Scrape returned no content (URL may be unreachable)')
        _safe_writeback(sheet_id, sheet_tab, sheet_row or 0,
                        status='error', error=msg)
        return {'status': 'error', 'record_id': '', 'error': msg, 'exit_code': 1}

    # --- Step 4: categorize. ----------------------------------------------
    # If the scrape result already carries categorization fields (the existing
    # dispatchers usually do — they call `_run_ai_analysis` inline), we trust
    # them. Otherwise call categorize() ourselves and degrade on failure.
    low_confidence = False
    needs_categorization = not (scrape.get('thematic_categories')
                                and scrape.get('era'))
    if needs_categorization:
        try:
            ai = categorize(scrape.get('raw_text', '') or scrape.get('text', ''),
                            schema)
            if ai:
                for k, v in ai.items():
                    scrape.setdefault(k, v)
            else:
                low_confidence = True
        except Exception as exc:  # noqa: BLE001 — degrade, never strand
            logger.warning(f'Categorization failed; degrading: {exc}')
            low_confidence = True
    if low_confidence or not scrape.get('thematic_categories'):
        scrape['thematic_categories'] = ['uncategorized']
        low_confidence = True

    # --- Step 5: assign ID. -----------------------------------------------
    publication = scrape.get('original_publication') or ''
    record_id = generate_source_based_id(publication, existing_ids)
    scrape['id'] = record_id
    scrape['url'] = url

    # --- Step 6: enrich + sanitize. ---------------------------------------
    if title:
        scrape['title'] = title
    if notes:
        scrape['notes'] = notes
    try:
        scrape = enrich_data(scrape, url, known_entities)
    except Exception as exc:  # noqa: BLE001 — enrichment is non-critical
        logger.warning(f'enrich_data failed (continuing): {exc}')
    if low_confidence:
        scrape['low_confidence'] = 'true'
    scrape['verified'] = scrape.get('verified', True)

    # Sanitize string fields explicitly via _sanitize_record (called inside
    # _atomic_append_row), but also pre-sanitize the user-controlled overrides
    # so a hostile sheet entry can't slip past via the sheet writeback path.
    if title:
        scrape['title'] = _sanitize_cell(scrape.get('title', ''))
    if notes:
        scrape['notes'] = _sanitize_cell(scrape.get('notes', ''))

    # --- Step 7: CSV append (atomic). -------------------------------------
    if not headers:
        # First-ever write: take the schema's output_headers if present, else
        # fall back to the keys on the scrape dict.
        headers = (schema.get('output_headers')
                   or list(scrape.keys()))
    try:
        _atomic_append_row(csv_path, scrape, headers)
    except Exception as exc:  # noqa: BLE001
        msg = f'CSV append failed: {exc}'
        logger.error(msg)
        _safe_writeback(sheet_id, sheet_tab, sheet_row or 0,
                        status='error', record_id=record_id, error=msg)
        return {'status': 'error', 'record_id': record_id,
                'error': msg, 'exit_code': 1}

    # --- Step 8: regen JSONs. ---------------------------------------------
    try:
        subprocess.run(['node', str(EXPORT_SCRIPT)],
                       cwd=str(DATA_DIR), check=True,
                       capture_output=True, text=True)
    except Exception as exc:  # noqa: BLE001
        msg = f'JSON regen failed: {exc}'
        logger.error(msg)
        _safe_writeback(sheet_id, sheet_tab, sheet_row or 0,
                        status='error', record_id=record_id, error=msg)
        return {'status': 'error', 'record_id': record_id,
                'error': msg, 'exit_code': 1}

    # --- Step 8.5: extract entities (best-effort, degrade on fail). -------
    # Skip when raw_text is too short to extract anything useful; a Gemini
    # timeout or quota hit must not abort the submission (same model as the
    # step-4 categorization degrade).
    raw_text = scrape.get('raw_text', '') or ''
    if len(raw_text.strip()) >= 500:
        try:
            extraction = extract_entities_and_relationships(
                text_content=raw_text,
                record_id=record_id,
                record_title=scrape.get('title'),
                record_author=scrape.get('author'),
                record_publication=scrape.get('original_publication'),
            )
            if extraction:
                stats = entity_csv_writer.append_entities_and_relationships(
                    extraction,
                    entities_csv=DATA_DIR / 'extracted_entities.csv',
                    relationships_csv=DATA_DIR / 'extracted_relationships.csv',
                    record_id=record_id,
                )
                logger.info(f'Entities: +{stats["entities_added"]} / '
                            f'+{stats["relationships_added"]}')
                if stats['entities_added'] or stats['relationships_added']:
                    subprocess.run(['node', str(EXPORT_SCRIPT)],
                                   cwd=str(DATA_DIR), check=True,
                                   capture_output=True, text=True)
        except Exception as exc:  # noqa: BLE001 — degrade like categorization
            logger.warning(f'Entity extraction failed (degrading): {exc}')

    # --- Step 9: node test suite. -----------------------------------------
    try:
        subprocess.run(['npm', 'test'],
                       cwd=str(PROJECT_ROOT), check=True,
                       capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        combined = (exc.stderr or '') + (exc.stdout or '')
        truncated = combined[-500:].strip() or 'tests failed (no output)'
        msg = f'Tests failed; commit aborted. {truncated}'
        _safe_writeback(sheet_id, sheet_tab, sheet_row or 0,
                        status='error', record_id=record_id, error=msg)
        return {'status': 'error', 'record_id': record_id,
                'error': msg, 'exit_code': 1}
    except Exception as exc:  # noqa: BLE001
        msg = f'Tests failed to run: {exc}'
        _safe_writeback(sheet_id, sheet_tab, sheet_row or 0,
                        status='error', record_id=record_id, error=msg)
        return {'status': 'error', 'record_id': record_id,
                'error': msg, 'exit_code': 1}

    # --- Step 10: git commit + push. --------------------------------------
    rel_csv = _csv_relpath(csv_path)
    push_err = _git_commit_and_push(record_id, scrape.get('title') or title,
                                    rel_csv)
    if push_err:
        msg = f'Could not commit to repo: {push_err}'
        _safe_writeback(sheet_id, sheet_tab, sheet_row or 0,
                        status='error', record_id=record_id, error=msg)
        return {'status': 'error', 'record_id': record_id,
                'error': msg, 'exit_code': 1}

    # --- Step 11: SFTP push. ----------------------------------------------
    # Prototype mode skips SFTP entirely: the prototype surface is served by
    # GitHub Pages off main, so the step-10 push already deployed it.
    if prototype_mode:
        logger.info('Prototype mode: skipping SFTP push to production')
    else:
        _stage_for_ftp()
        push = sftp_push.push_to_production()
        if not (push.get('ok') and not push.get('skipped')):
            if push.get('skipped'):
                note = 'Live push not configured on this runner'
            else:
                note = (f"Live push failed; will retry next submission "
                        f"({push.get('error', 'unknown error')})")
            _safe_writeback(sheet_id, sheet_tab, sheet_row or 0,
                            status='archived', record_id=record_id, error=note)
            return {'status': 'archived', 'record_id': record_id,
                    'error': note, 'exit_code': 0}

    # --- Step 12: final sheet writeback. Retry once. ----------------------
    ok = _safe_writeback(sheet_id, sheet_tab, sheet_row or 0,
                         status='live', record_id=record_id, error='',
                         fatal=True)
    if not ok and sheet_id and sheet_row:
        logger.warning('Final sheet writeback failed; retrying once')
        ok = _safe_writeback(sheet_id, sheet_tab, sheet_row or 0,
                             status='live', record_id=record_id, error='',
                             fatal=True)
    if not ok and sheet_id and sheet_row:
        # The data is live; only the sheet status is out of date. Exit
        # non-zero so the Action shows red and Joe / Hali notice.
        return {'status': 'error', 'record_id': record_id,
                'error': 'Live deploy ok; sheet status writeback failed',
                'exit_code': 2}

    return {'status': 'live', 'record_id': record_id, 'error': '',
            'exit_code': 0}


# ---------- CLI -------------------------------------------------------------


def _parse_args(argv):
    p = argparse.ArgumentParser(
        description='Process one Pillar 3a queue submission end-to-end.')
    p.add_argument('--url', required=True)
    p.add_argument('--title', default='')
    p.add_argument('--notes', default='')
    p.add_argument('--sheet-id', dest='sheet_id', default='')
    p.add_argument('--sheet-tab', dest='sheet_tab', default='')
    p.add_argument('--sheet-row', dest='sheet_row', type=int, default=0)
    p.add_argument('--prototype-mode', dest='prototype_mode',
                   action='store_true', default=False,
                   help='Skip SFTP push to PressThink (GH Pages auto-deploy '
                        'handles the prototype surface).')
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = _parse_args(argv if argv is not None else sys.argv[1:])
    result = process_one(
        url=args.url, title=args.title, notes=args.notes,
        sheet_id=args.sheet_id, sheet_tab=args.sheet_tab,
        sheet_row=args.sheet_row,
        prototype_mode=args.prototype_mode,
    )
    logger.info(f'Result: status={result["status"]} '
                f'record_id={result["record_id"]} error={result["error"]}')
    sys.stdout.flush()
    return int(result.get('exit_code', 1))


if __name__ == '__main__':
    sys.exit(main())
