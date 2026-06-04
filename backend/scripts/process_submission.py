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
   2b.  SSRF guard via is_safe_public_url(url)      (reject private/non-http)
    3.  dispatcher.dispatch_url(url)                (scrape, or pasted raw text)
    4.  categorize(...)                             (Gemini; degrade on fail)
    5.  assign id: keep processor CLIP-/NYT-/WSJ-,  (else next RECORD-NNNNN)
    6.  enrich_data() + _sanitize_cell()            (mimic Pillar 3; flag review)
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
from rosen_scraper import entity_resolver  # noqa: E402
from rosen_scraper.url_safety import is_safe_public_url  # noqa: E402
from rosen_scraper.workflow import enrich_data  # noqa: E402
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

# Shown to the submitter (via the sheet error column) when the scraper can't
# fetch or parse a URL. Some hosts (Medium, paywalled or login-walled pages,
# heavily JS-rendered sites) block automated scraping. The submitter can paste
# the article body to bypass the fetch — the AI still tags the pasted text.
# The text rides the workflow's raw_text input today (a maintainer fills it in
# the Actions UI). The self-serve sheet column that would let a submitter do
# this without help is Phase 3, tracked in #353 — so this hint names the
# raw_text field, not a sheet column that does not exist yet.
SCRAPE_FAILED_PASTE_HINT = (
    "Couldn't fetch or parse this URL automatically ({reason}). Some sites "
    "(Medium, paywalled, or login-walled pages) block automated scraping. To "
    "archive it anyway, re-submit with the article's full text in the raw text "
    "field — the pipeline skips the fetch and tags the pasted text directly."
)

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


def _next_record_id(existing_ids: Set[str], prefix: str = 'RECORD') -> str:
    """Return the next sequential ``RECORD-NNNNN`` id.

    New submissions continue the canonical ``RECORD-`` sequence used by the
    ~800 existing article records (and documented in CLAUDE.md), rather than
    the source-based prefixes (``PRESSTH-``, ``CJR-``) that
    ``generate_source_based_id`` produces for the legacy batch pipeline. Scans
    ``existing_ids`` for the highest ``<prefix>-<number>`` and increments.
    """
    highest = 0
    for rid in existing_ids:
        if rid.startswith(prefix + '-'):
            # Guard against relationship-style suffixes (RECORD-00027_REL_001).
            num_part = rid[len(prefix) + 1:].split('_', 1)[0]
            if num_part.isdigit():
                highest = max(highest, int(num_part))
    return f"{prefix}-{highest + 1:05d}"


def _clean_title(title: str, publication: str) -> str:
    """Strip a trailing ' - <publication>' site suffix from a scraped title.

    trafilatura builds the title from the page ``<title>`` tag, which usually
    carries the site name (e.g. 'Headline - PressThink'). Drop it when the tail
    matches the resolved publication so records get a clean headline.
    """
    title = (title or '').strip()
    pub = (publication or '').strip()
    if not title or not pub:
        return title
    for sep in (' - ', ' | ', ' – ', ' — '):
        suffix = f"{sep}{pub}"
        if title.endswith(suffix):
            return title[:-len(suffix)].strip()
    return title


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
                prototype_mode: bool = False,
                raw_text: str = '') -> Dict[str, Any]:
    """Run the 12-step pipeline for one submission. Returns a result dict.

    Keys: ``status`` (live/archived/duplicate/error/noop), ``record_id``,
    ``error``, ``exit_code``.

    ``raw_text``: manual fallback. When provided, the network scrape is
    skipped and the AI categorizer tags the pasted article body directly. Use
    it for hosts the scraper can't fetch (Medium, paywalled or login-walled
    pages). The submitter only pastes text; the pipeline still tags it.
    """
    result: Dict[str, Any] = {'status': 'error', 'record_id': '',
                              'error': '', 'exit_code': 1}

    url = (url or '').strip()
    title = title or ''
    notes = notes or ''
    raw_text = raw_text or ''

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

    # --- Step 2b: SSRF guard. ---------------------------------------------
    # Run after the dedup short-circuit (a URL already in the archive needs no
    # fetch, so a host that has since gone away or now resolves privately should
    # still dedup, not error) but before the dispatcher and its deploy/SFTP/
    # Sheets secrets. Reject private/loopback/link-local or non-http(s) targets
    # so this secret-bearing entry point never fetches an unsafe URL (parity with
    # the scraper's own gate). Runs even on the manual paste path below: a
    # legitimate paste target (Medium, paywalled) is still a public http(s) URL,
    # and a private/non-http URL should not be archived as a record regardless.
    safe, ssrf_reason = is_safe_public_url(url)
    if not safe:
        msg = f'Unsafe URL refused: {ssrf_reason}'
        logger.warning(msg)
        _safe_writeback(sheet_id, sheet_tab, sheet_row or 0,
                        status='error', error=msg)
        return {'status': 'error', 'record_id': '', 'error': msg,
                'exit_code': 1}

    # --- Step 3: scrape (or use manually-pasted text). --------------------
    schema = _load_schema()
    known_entities = _load_known_entities()

    manual_text = raw_text.strip()
    if manual_text:
        # Manual fallback: the submitter pasted the article body because the
        # scraper can't reach this host (e.g. Medium, paywalled, JS-rendered).
        # Skip the network fetch and let the AI categorizer (step 4) tag the
        # pasted text, so the submitter only provides text — not the tedious
        # metadata. This is viable here because submissions are one at a time,
        # unlike the bulk-processing pipeline.
        logger.info(f'Manual raw-text submission ({len(manual_text)} chars); '
                    'skipping scrape and tagging the pasted text.')
        scrape = {'raw_text': manual_text, 'text': manual_text}
        if title:
            scrape['title'] = title
    else:
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
            # Actionable: tell the submitter exactly how to recover — paste the
            # text. The scrape failure is logged above; this is the human-facing
            # message that lands in the sheet's error column.
            msg = SCRAPE_FAILED_PASTE_HINT.format(
                reason=reason or 'page unreachable or unparseable')
            logger.warning(f'Scrape failed for {url}: '
                           f'{reason or "no content"}')
            _safe_writeback(sheet_id, sheet_tab, sheet_row or 0,
                            status='error', error=msg)
            return {'status': 'error', 'record_id': '', 'error': msg,
                    'exit_code': 1}

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

    # --- Step 4.5: normalize fields before ID/enrichment. -----------------
    # The article scraper (trafilatura) emits a 'date' key, but the schema and
    # the rest of the pipeline (and the export script) use 'publication_date'.
    # The CSV writer drops unknown keys (extrasaction='ignore'), so without
    # this rename the scraped date is silently lost. Mirrors workflow.main();
    # trafilatura's date wins when present, else the AI's publication_date is
    # kept.
    scraped_date = scrape.pop('date', None)
    if scraped_date:
        scrape['publication_date'] = scraped_date

    # Resolve the publication against known entities + the URL host so a
    # hallucinated 'original_publication' (e.g. an AI guess of 'Talking Points
    # Memo' for a pressthink.org URL) doesn't become the publisher. enrich_data
    # derives the publisher field from this. resolve_publication is a no-op
    # when known_entities is empty, so it never makes things worse.
    resolved_pub = entity_resolver.resolve_publication(
        scrape.get('original_publication'), url, known_entities)
    if resolved_pub:
        scrape['original_publication'] = resolved_pub

    # Drop a trailing ' - <publication>' suffix trafilatura pulls from the page
    # <title> (e.g. 'Headline - PressThink'). A submitter-supplied title (step
    # 6, below) is applied after this and is left untouched.
    if scrape.get('title'):
        scrape['title'] = _clean_title(scrape['title'],
                                       scrape.get('original_publication'))

    # --- Step 5: assign ID. -----------------------------------------------
    # Preserve a processor-assigned source id when one is present: the clipping
    # processor emits CLIP-/NYT-/WSJ- ids that downstream tooling keys off
    # (backend/update_clippings.py only touches CLIP- rows), and the social and
    # video processors set their own. Only mint a new RECORD-NNNNN id when the
    # processor left it unset — the article path, which is the common submission
    # and the case Joe's "continue the RECORD- sequence" decision targeted. The
    # resolved publication feeds the publisher field (above), not the ID.
    processor_id = (scrape.get('id') or '').strip()
    if processor_id and processor_id in existing_ids:
        # A processor returned an id already in the archive (e.g. a clipping
        # processor whose counter restarted, or a re-run that re-emits an
        # archived id). Preserving it would write a duplicate id, which the
        # exporter and tests forbid. Mint the next free id in the SAME prefix
        # so downstream tooling keyed off the prefix (update_clippings.py only
        # touches CLIP- rows) still matches. URL-level duplicates were already
        # short-circuited in step 2; this guards an id collision on a new URL.
        prefix = processor_id.rsplit('-', 1)[0] or 'RECORD'
        deduped = _next_record_id(existing_ids, prefix=prefix)
        logger.warning(f'Processor id {processor_id!r} already in archive; '
                       f'using {deduped!r} to avoid a duplicate id.')
        processor_id = deduped
    record_id = processor_id or _next_record_id(existing_ids)
    scrape['id'] = record_id
    scrape['url'] = url

    # --- Step 6: enrich + sanitize. ---------------------------------------
    if title:
        scrape['title'] = title
    if notes:
        scrape['notes'] = notes
    # Capture any verified value a processor set BEFORE enrich_data runs its
    # `data.setdefault('verified', False)` — after that call the key always
    # exists, so this is the only point where "processor set it" and "processor
    # left it unset" are still distinguishable.
    processor_verified = scrape.get('verified')
    try:
        scrape = enrich_data(scrape, url, known_entities)
    except Exception as exc:  # noqa: BLE001 — enrichment is non-critical
        logger.warning(f'enrich_data failed (continuing): {exc}')
    if low_confidence:
        scrape['low_confidence'] = 'true'
    # Hybrid 'live but flagged' model. Auto-submissions publish immediately so
    # the submitter sees the record appear, then carry needs_review=true so a
    # human can vet the AI-generated metadata before it's treated as final.
    #
    # Force verified True only when no processor set it: enrich_data() above runs
    # `data.setdefault('verified', False)` (a conservative default for legacy or
    # broken rows), so `scrape.get('verified', True)` would always read back that
    # False and the public exporter — which drops verified=False rows — would
    # silently hide every submission. Article scrapes leave verified unset, so
    # they publish. A processor's explicit verified value is preserved: the
    # clipping processor stamps 'false' on every OCR'd PDF as an "OCR needs a
    # human check" signal, not a hide flag. That clipping still goes
    # live-but-flagged — the exporter surfaces CLIP- ids via a dedicated
    # allowance, and needs_review below marks it for the OCR review pass. (For a
    # non-CLIP record an explicit 'false' does gate it, since the exporter drops
    # verified=false rows without that allowance.) Unifying the CLIP- allowance
    # with this verified/needs_review model is tracked in issue #352.
    if processor_verified is None:
        # Write the string 'TRUE', not a Python bool. csv.DictWriter serializes
        # True as the string 'True', but data/export-archive-data.js treats only
        # the exact strings 'TRUE'/'true'/'Yes' (or a real boolean) as verified —
        # 'True' round-trips through the CSV and is then dropped, silently hiding
        # the record. 'TRUE' matches the existing column convention.
        scrape['verified'] = 'TRUE'
    scrape['needs_review'] = 'true'

    # Guarantee an exporter-visible title. The public exporter drops any record
    # whose title is empty, 'Untitled', or under 5 chars, so a manual paste with
    # no title and a failed/degraded AI categorization would commit, deploy and
    # write back 'live' yet never appear. Synthesize a provisional title from the
    # best available signal; needs_review is already set, so the human review
    # pass fixes it.
    _title = (scrape.get('title') or '').strip()
    if not _title or _title.lower() == 'untitled' or len(_title) < 5:
        _text = (scrape.get('raw_text') or scrape.get('text') or '').strip()
        _first_line = next(
            (ln.strip() for ln in _text.splitlines() if ln.strip()), '')
        _provisional = _first_line[:80].strip() or url
        logger.warning('No usable title; using provisional title pending '
                       f'review: {_provisional!r}')
        scrape['title'] = _provisional

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
    # Skip when text is too short to extract anything useful; a Gemini timeout
    # or quota hit must not abort the submission (same model as the step-4
    # categorization degrade). Mirror step-4's raw_text/text fallback so a
    # dispatcher that returns ``text`` but no ``raw_text`` still gets
    # entity-extracted instead of silently skipped.
    raw_text = (scrape.get('raw_text', '')
                or scrape.get('text', '')
                or '')
    if len(raw_text.strip()) >= 500:
        extraction = None
        try:
            extraction = extract_entities_and_relationships(
                text_content=raw_text,
                record_id=record_id,
                record_title=scrape.get('title'),
                record_author=scrape.get('author'),
                record_publication=scrape.get('original_publication'),
            )
        except Exception as exc:  # noqa: BLE001 — degrade like categorization
            logger.warning(f'Entity extraction failed (degrading): {exc}')

        stats = None
        if extraction:
            try:
                stats = entity_csv_writer.append_entities_and_relationships(
                    extraction,
                    entities_csv=DATA_DIR / 'extracted_entities.csv',
                    relationships_csv=DATA_DIR / 'extracted_relationships.csv',
                    record_id=record_id,
                )
                logger.info(f'Entities: +{stats["entities_added"]} / '
                            f'+{stats["relationships_added"]}')
            except Exception as exc:  # noqa: BLE001 — degrade like categorization
                logger.warning(f'Entity writer failed (degrading): {exc}')

        # Re-regen JSONs only if writer appended rows. NOT best-effort: the
        # CSV change is already committed; a regen failure here would let
        # stale JSONs ship in step 10's commit alongside the new entity rows.
        # Let it raise to abort the submission.
        if stats and (stats['entities_added'] or stats['relationships_added']):
            try:
                subprocess.run(['node', str(EXPORT_SCRIPT)],
                               cwd=str(DATA_DIR), check=True,
                               capture_output=True, text=True)
            except Exception as exc:  # noqa: BLE001
                msg = f'JSON regen (post-entity) failed: {exc}'
                logger.error(msg)
                _safe_writeback(sheet_id, sheet_tab, sheet_row or 0,
                                status='error', record_id=record_id, error=msg)
                return {'status': 'error', 'record_id': record_id,
                        'error': msg, 'exit_code': 1}

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
    p.add_argument('--raw-text', dest='raw_text', default='',
                   help='Manual fallback: paste the article body to skip the '
                        'network scrape (for hosts the scraper cannot fetch, '
                        'e.g. Medium or paywalled pages). The AI still tags it.')
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = _parse_args(argv if argv is not None else sys.argv[1:])
    result = process_one(
        url=args.url, title=args.title, notes=args.notes,
        sheet_id=args.sheet_id, sheet_tab=args.sheet_tab,
        sheet_row=args.sheet_row,
        prototype_mode=args.prototype_mode,
        raw_text=args.raw_text,
    )
    logger.info(f'Result: status={result["status"]} '
                f'record_id={result["record_id"]} error={result["error"]}')
    sys.stdout.flush()
    return int(result.get('exit_code', 1))


if __name__ == '__main__':
    sys.exit(main())
