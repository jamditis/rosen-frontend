# -*- coding: utf-8 -*-
"""
Batch processor for queued submissions.

Reuses the existing rosen_scraper pipeline:
  - dispatcher.dispatch_url() for scraping + AI categorization
  - workflow.generate_source_based_id() for unique IDs
  - workflow.enrich_data() for metadata enrichment
  - entity_resolver for publication/platform resolution
"""

import csv
import json
import logging
import subprocess
import shutil
from datetime import datetime
from typing import Dict, Any, Optional, Set

from rosen_scraper import dispatcher, entity_resolver
from rosen_scraper.workflow import generate_source_based_id, enrich_data

from .config import (
    DATA_DIR,
    CSV_FILE, SCHEMA_FILE, KNOWN_ENTITIES_FILE,
    EXPORT_SCRIPT, FTP_STAGING_DIR,
)
from . import db
from . import sftp_push
from . import sheets_callback

logger = logging.getLogger('submission_server.processor')


def _load_schema() -> Optional[Dict[str, Any]]:
    """Load the classification schema."""
    try:
        with open(SCHEMA_FILE, 'r', encoding='utf-8-sig') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        logger.error(f"Could not load schema: {e}")
        return None


def _load_known_entities() -> Optional[Dict[str, Any]]:
    """Load known entities for publication resolution."""
    try:
        with open(KNOWN_ENTITIES_FILE, 'r', encoding='utf-8-sig') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        logger.warning(f"Could not load known entities (non-fatal): {e}")
        return None


def _get_existing_ids() -> Set[str]:
    """Read all existing record IDs from the main CSV."""
    ids = set()
    if CSV_FILE.exists():
        with open(CSV_FILE, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                record_id = row.get('id', '')
                if record_id:
                    ids.add(record_id)
    return ids


def _get_existing_urls() -> Set[str]:
    """Read all existing URLs from the main CSV."""
    urls = set()
    if CSV_FILE.exists():
        with open(CSV_FILE, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                url = row.get('url', '')
                if url:
                    urls.add(url.strip())
    return urls


def _get_csv_headers() -> list:
    """Read the column headers from the main CSV."""
    if not CSV_FILE.exists():
        return []
    with open(CSV_FILE, 'r', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        return next(reader, [])


# A spreadsheet treats a cell beginning with one of these as a formula, so a
# scraped page or form field starting with one is prefixed with a single quote.
_CSV_FORMULA_TRIGGERS = ('=', '+', '-', '@')

# Upper bound on any single CSV cell. Generous for legitimate titles and
# summaries, but stops a hostile submission writing an unbounded blob.
_MAX_FIELD_LENGTH = 10000


def _sanitize_cell(value: str) -> str:
    """Length-bound and CSV-formula-escape a single string cell.

    Neutralizes CSV formula injection (a value starting with =, +, -, @ is
    prefixed with the spreadsheet-recognized single-quote escape) and caps the
    length so neither scraped content nor user form input can inject a formula
    or write an oversized blob into the shared archive CSV. See issue #143.
    """
    text = value.strip()
    # Escape before bounding length. A value already at _MAX_FIELD_LENGTH that
    # starts with a formula trigger would otherwise end up one char over the
    # cap once the single-quote escape is prepended. Truncation chops only the
    # tail, so the leading escape always survives.
    if text and text[0] in _CSV_FORMULA_TRIGGERS:
        text = "'" + text
    if len(text) > _MAX_FIELD_LENGTH:
        text = text[:_MAX_FIELD_LENGTH]
    return text


def _sanitize_record(record: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy of ``record`` with every string field sanitized.

    Non-string values (booleans, None) are passed through untouched — formula
    injection only applies to text cells. The original dict is not mutated.
    """
    return {
        key: _sanitize_cell(value) if isinstance(value, str) else value
        for key, value in record.items()
    }


def _append_to_csv(record: Dict[str, Any], headers: list) -> bool:
    """Append a single record to the main archive CSV.

    Every string field is sanitized first so neither scraped page content nor
    user-supplied form overrides can inject a spreadsheet formula or an
    unbounded blob into the published data. See issue #143.
    """
    try:
        with open(CSV_FILE, 'a', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=headers, extrasaction='ignore')
            writer.writerow(_sanitize_record(record))
        return True
    except Exception as e:
        logger.error(f"Failed to append record to CSV: {e}")
        return False


def _regenerate_json() -> bool:
    """Run the export script to regenerate JSON files from CSV."""
    try:
        result = subprocess.run(
            ['node', str(EXPORT_SCRIPT)],
            cwd=str(DATA_DIR),
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            logger.error(f"Export script failed: {result.stderr}")
            return False
        logger.info(f"JSON regenerated: {result.stdout[-200:]}")
        return True
    except subprocess.TimeoutExpired:
        logger.error("Export script timed out after 120s")
        return False
    except FileNotFoundError:
        logger.error("Node.js not found — cannot run export script")
        return False


# Single source of truth for the canonical JSON artifact set. Also referenced
# by _staging_has_content so a divergence can't silently desync staging and
# the SFTP retry gate.
_STAGED_JSON_FILES = (
    'archive-data.json',
    'archive-core.json',
    'archive-details.json',
    'archive-entities.json',
)


def _stage_for_ftp() -> bool:
    """Copy regenerated JSON files to the FTP staging directory."""
    if not FTP_STAGING_DIR.exists():
        FTP_STAGING_DIR.mkdir(parents=True, exist_ok=True)

    copied = 0
    for filename in _STAGED_JSON_FILES:
        src = DATA_DIR / filename
        dst = FTP_STAGING_DIR / filename
        if src.exists():
            shutil.copy2(str(src), str(dst))
            copied += 1
        else:
            logger.warning(f"Expected file not found: {src}")

    logger.info(f"Staged {copied}/{len(_STAGED_JSON_FILES)} files for FTP")
    return copied > 0


def _staging_has_content() -> bool:
    """True iff every canonical JSON file is present in the staging dir.

    SFTP push is gated on this so a previously-failed deploy gets retried on
    the next batch, even when the new batch has zero successful submissions.
    """
    if not FTP_STAGING_DIR.exists():
        return False
    return all((FTP_STAGING_DIR / f).exists() for f in _STAGED_JSON_FILES)


def process_single_url(url: str, schema: Dict[str, Any],
                       known_entities: Optional[Dict[str, Any]],
                       existing_ids: Set[str],
                       user_overrides: Dict[str, str] = None) -> Optional[Dict[str, Any]]:
    """
    Process a single URL through the scraper pipeline.

    Returns the enriched record dict if successful, None on failure.
    """
    try:
        processed_data = dispatcher.dispatch_url(url, schema)
    except Exception as e:
        logger.error(f"Dispatch failed for {url}: {e}")
        return None

    if not processed_data:
        logger.warning(f"No data returned for {url}")
        return None

    # Apply user overrides (title, publication, date) if provided
    if user_overrides:
        if user_overrides.get('title'):
            processed_data['title'] = user_overrides['title']
        if user_overrides.get('publication'):
            processed_data['original_publication'] = user_overrides['publication']
        if user_overrides.get('date_published'):
            processed_data['publication_date'] = user_overrides['date_published']
        if user_overrides.get('categories'):
            processed_data['thematic_categories'] = user_overrides['categories']

    # Generate unique ID
    publication = processed_data.get('original_publication', '')
    item_id = generate_source_based_id(publication, existing_ids)
    processed_data['id'] = item_id
    processed_data['url'] = url

    # Standardize date field name
    if 'date' in processed_data and 'publication_date' not in processed_data:
        processed_data['publication_date'] = processed_data.pop('date')

    # Resolve publication name
    publication = entity_resolver.resolve_publication(
        processed_data.get('original_publication'), url, known_entities
    )
    processed_data['original_publication'] = publication

    # Enrich with derived fields
    processed_data = enrich_data(processed_data, url, known_entities)

    # Mark as verified (submitted by Jay himself)
    processed_data['verified'] = True
    processed_data['notes'] = "Submitted via web form"

    return processed_data


def process_batch(trigger: str = 'manual') -> Dict[str, Any]:
    """
    Process all pending submissions.

    Returns a summary dict with counts of processed/succeeded/failed.
    """
    started_at = datetime.now().isoformat()

    # Load pipeline dependencies
    schema = _load_schema()
    if not schema:
        return {'error': 'Could not load schema', 'processed': 0, 'succeeded': 0, 'failed': 0}

    known_entities = _load_known_entities()
    headers = schema.get('output_headers', [])
    if not headers:
        headers = _get_csv_headers()

    existing_ids = _get_existing_ids()
    existing_urls = _get_existing_urls()

    # Get pending submissions
    pending = db.get_pending_submissions()
    if not pending:
        return {'processed': 0, 'succeeded': 0, 'failed': 0, 'message': 'No pending submissions'}

    succeeded = 0
    failed = 0
    # Per-submission writeback entries. Populated in the loop so the post-loop
    # SFTP step can mutate ``status`` from 'archived' → 'live' (or → 'archived
    # (push pending)' on failure) without re-querying the DB.
    writebacks = []

    def _add_writeback(sub, status, record_id='', error=''):
        if not sub.get('sheet_id') or not sub.get('sheet_row'):
            return
        writebacks.append({
            'sheet_id': sub['sheet_id'],
            'sheet_tab': sub.get('sheet_tab') or 'Sheet1',
            'sheet_row': sub['sheet_row'],
            'status': status,
            'record_id': record_id,
            'error': error,
        })

    for submission in pending:
        sub_id = submission['id']
        url = submission['url']

        # Check for duplicate URL in existing archive
        if url in existing_urls:
            db.update_submission_status(sub_id, 'duplicate',
                                        error_message='URL already exists in archive')
            _add_writeback(submission, 'duplicate',
                           error='URL already exists in archive')
            failed += 1
            continue

        # Mark as processing
        db.update_submission_status(sub_id, 'processing')

        # Build user overrides from form fields
        overrides = {
            'title': submission.get('title', ''),
            'publication': submission.get('publication', ''),
            'date_published': submission.get('date_published', ''),
            'categories': submission.get('categories', ''),
        }

        try:
            record = process_single_url(url, schema, known_entities,
                                        existing_ids, overrides)
        except Exception as e:
            logger.error(f"Error processing submission {sub_id} ({url}): {e}")
            db.update_submission_status(sub_id, 'failed', error_message=str(e))
            _add_writeback(submission, 'error', error=str(e)[:200])
            failed += 1
            continue

        if record:
            # Append to main CSV
            success = _append_to_csv(record, headers)
            if success:
                existing_ids.add(record['id'])
                existing_urls.add(url)
                db.update_submission_status(sub_id, 'completed', record_id=record['id'])
                # Tentatively 'archived'; bumped to 'live' after SFTP push.
                _add_writeback(submission, 'archived', record_id=record['id'])
                succeeded += 1
                logger.info(f"Processed submission {sub_id}: {record['id']} — {url}")
            else:
                db.update_submission_status(sub_id, 'failed',
                                            error_message='Failed to write to CSV')
                _add_writeback(submission, 'error', error='CSV write failed')
                failed += 1
        else:
            db.update_submission_status(sub_id, 'failed',
                                        error_message='Processing returned no data')
            _add_writeback(submission, 'error',
                           error='Scrape returned no data (URL may be unreachable)')
            failed += 1

    # Regen JSON only when there's new content to flatten. Empty regen runs
    # would just rewrite identical files for no benefit.
    json_ok = True
    if succeeded > 0:
        logger.info("Regenerating JSON files...")
        json_ok = _regenerate_json()
        if json_ok:
            _stage_for_ftp()

    # SFTP push runs whenever staging has content — even if this batch added
    # no new rows. SFTP overwrites are idempotent, so a pure-dup/failure batch
    # still gives a previously-failed deploy a chance to recover. Codex P1 on
    # #212: prior gating left prod indefinitely stale.
    push_result = None
    if _staging_has_content():
        push_result = sftp_push.push_to_production()
        if push_result.get('ok'):
            logger.info(f"SFTP push ok: {push_result.get('files_pushed')} files")
        elif push_result.get('skipped'):
            logger.info("SFTP push skipped (no creds configured)")
        else:
            logger.error(f"SFTP push failed: {push_result.get('error')}")

    # Promote 'archived' → 'live' (or annotate retry state) for sheet rows.
    # Distinguishes the three failure modes so the operator looks in the
    # right place: regen failed (rebuild the JSON), deploy unconfigured
    # (set the SFTP env), or live push failed (transient network).
    for entry in writebacks:
        if entry['status'] != 'archived':
            continue
        if not json_ok:
            entry['error'] = 'JSON regen failed; staged files not updated'
        elif push_result is None:
            entry['error'] = 'Staged; no live deploy attempted (nothing in staging)'
        elif push_result.get('skipped'):
            entry['error'] = 'Staged; live deploy not configured on this server'
        elif push_result.get('ok'):
            entry['status'] = 'live'
        else:
            entry['error'] = (f"Archived; live push will retry next batch "
                              f"({push_result.get('error', 'unknown error')})")

    # Sheet writebacks are best-effort — never raise into the batch summary.
    for entry in writebacks:
        try:
            sheets_callback.update_row(
                sheet_id=entry['sheet_id'],
                sheet_tab=entry['sheet_tab'],
                row=entry['sheet_row'],
                status=entry['status'],
                record_id=entry['record_id'],
                error=entry['error'],
            )
        except Exception as exc:  # noqa: BLE001 — best-effort
            logger.error(f"sheets_callback failed for row {entry['sheet_row']}: {exc}")

    completed_at = datetime.now().isoformat()
    processed = succeeded + failed

    # Log the run
    db.log_processing_run(started_at, completed_at, trigger,
                          processed, succeeded, failed)

    summary = {
        'processed': processed,
        'succeeded': succeeded,
        'failed': failed,
        'trigger': trigger,
        'started_at': started_at,
        'completed_at': completed_at,
    }
    logger.info(f"Batch complete: {summary}")
    return summary
