#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sync enriched columns from the master sheet into the repo CSV, then deploy.

Track-1 ``sync_to_archive`` job of the batch maintenance runner. Design:
``docs/plans/2026-05-29-batch-maintenance-runner-design.md``.

The enrichment jobs (key_concepts, dedup, and future backfill) write the master
Google Sheet. Nothing carries that work into ``data/archive_records-public.csv``,
so it never reaches the live site. This job closes that tail:

    read the sheet -> merge enriched columns into the CSV by ``id``
    -> regen JSONs -> npm test -> commit branch -> open review PR
    -> Pillar 3c full-site deploy after merge

The merge is ADDITIVE and never destructive:

  * Enrichment columns (key_concepts, thematic_categories, tags, ...) take the
    sheet's value when it is non-empty -- the sheet is the enrichment surface,
    so it wins for these. An empty sheet cell never blanks the CSV.
  * Fill-only columns (raw_text, publication_date, word_count) are written only
    when the CSV cell is empty; an existing value is never overwritten. raw_text
    is therefore never blanked or shortened (the durable content store must
    survive even when the source URL 404s).
  * id, url, verified, notes, and every other column are left untouched.

It does NOT push to main or SFTP to the live site. It commits the merged data
to a fresh branch and opens a pull request (Joe, 2026-05-29) so a human reviews
the enrichment diff before it goes live. After the PR merges, the live push is
the existing one-click ``deploy.yml`` (Pillar 3c) full-site deploy.

``--dry-run`` logs the diff and per-field write counts, then exits without
touching the CSV, regenerating, committing, or opening a PR -- the first run of
any job should be a no-write rehearsal. ``--limit`` caps how many records this
run will change (the 5 -> 25 -> 100 escalation), never the whole archive at once.

Data validity (e.g. a thematic category outside the canonical six) is NOT
pre-checked here: the run regenerates JSON and runs ``npm test`` BEFORE opening
the PR, so a synced value that violates a CSV invariant fails the tests and
aborts loudly. The PR's own CI is a second gate before a human merges.
"""

from __future__ import annotations

import argparse
import csv
import logging
import os
import pathlib
import subprocess
import sys
import tempfile
import time
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

# Make submission_runtime and rosen_scraper importable whether this runs as
# `python backend/scripts/sync_sheet_to_archive.py` or via the workflow's
# `cd backend && python scripts/...` invocation. Mirrors process_submission.py.
_BACKEND = pathlib.Path(__file__).resolve().parents[1]
for _candidate in (_BACKEND, _BACKEND / "src"):
    if str(_candidate) not in sys.path:
        sys.path.insert(0, str(_candidate))

from rosen_scraper.sheets_client import open_spreadsheet  # noqa: E402
from rosen_scraper.csv_safety import sanitize_csv_value  # noqa: E402
from submission_runtime.artifacts import DATA_DEPLOY_JSON_FILES  # noqa: E402
from submission_runtime.config import (  # noqa: E402
    CSV_FILE as _DEFAULT_CSV_FILE,
    DATA_DIR,
    EXPORT_SCRIPT,
    PROJECT_ROOT,
)

# Tests override this to point at a tmp CSV. Defaults to the canonical archive.
CSV_FILE = _DEFAULT_CSV_FILE
DEFAULT_SHEET_TAB = "test_runs"

# The canonical JSON artifacts `node export-archive-data.js` regenerates.
_DEPLOY_JSON_FILES = DATA_DEPLOY_JSON_FILES

# Columns the enrichment jobs produce. On sync the sheet's non-empty value wins
# (the sheet is the enrichment surface). An empty sheet cell never blanks the
# CSV -- we only ever write a non-empty sheet value.
ENRICHMENT_COLUMNS = (
    "thematic_categories",
    "key_concepts",
    "tags",
    "summary",
    "excerpt",
    "pull_quote",
    "scope",
    "era",
    "content_type",
)

# Never overwrite a populated CSV cell for these -- only fill when the CSV cell
# is empty and the sheet has content. raw_text is irreplaceable; a wrong
# date/word_count clobber is hard to undo.
FILL_ONLY_COLUMNS = (
    "raw_text",
    "publication_date",
    "word_count",
)

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(message)s",
    stream=sys.stdout,
    force=True,
)
logger = logging.getLogger("sync_sheet_to_archive")


# ---------- Pure merge logic (unit-testable, no I/O) ------------------------


def sheet_rows_by_id(values: List[List[str]]) -> Dict[str, Dict[str, str]]:
    """Index a sheet's ``get_all_values()`` output by the ``id`` column.

    Returns ``{id: {column_name: value}}`` carrying only the columns the merge
    cares about. Rows with a blank id are skipped. Raises ``ValueError`` if the
    sheet has no ``id`` header -- a sheet we can't key by id is unusable here.
    """
    if not values or len(values) < 2:
        return {}
    header = values[0]
    col_index = {name: i for i, name in enumerate(header)}
    if "id" not in col_index:
        raise ValueError("sheet has no 'id' column; cannot merge by id")

    wanted = set(ENRICHMENT_COLUMNS) | set(FILL_ONLY_COLUMNS)
    present = [c for c in wanted if c in col_index]
    id_idx = col_index["id"]

    by_id: Dict[str, Dict[str, str]] = {}
    for row in values[1:]:
        rid = row[id_idx].strip() if id_idx < len(row) else ""
        if not rid:
            continue
        record = {}
        for col in present:
            j = col_index[col]
            record[col] = row[j] if j < len(row) else ""
        by_id[rid] = record
    return by_id


def merge_enrichment(
    csv_rows: List[Dict[str, Any]],
    sheet_by_id: Dict[str, Dict[str, str]],
    fieldnames: List[str],
    limit: int = 0,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Additively merge sheet enrichment into CSV rows in place.

    ``limit`` (> 0) caps the number of records changed this run. Returns the
    (mutated) rows and a stats dict ``{rows_changed, writes_by_field,
    limit_reached, matched}``.
    """
    enrich_cols = [c for c in ENRICHMENT_COLUMNS if c in fieldnames]
    fill_cols = [c for c in FILL_ONLY_COLUMNS if c in fieldnames]

    writes_by_field: Dict[str, int] = defaultdict(int)
    rows_changed = 0
    matched = 0
    applied = 0
    limit_reached = False

    for row in csv_rows:
        rid = (row.get("id") or "").strip()
        if not rid or rid not in sheet_by_id:
            continue
        matched += 1
        if limit and applied >= limit:
            limit_reached = True
            continue

        sheet = sheet_by_id[rid]
        changed = False

        # Enrichment: a non-empty sheet value wins. Never blank the CSV. Sheet
        # values are editor-controlled, so neutralize CSV/spreadsheet formula
        # triggers before they reach the committed archive.
        for col in enrich_cols:
            new = sanitize_csv_value((sheet.get(col) or "").strip())
            if new and new != (row.get(col) or ""):
                row[col] = new
                writes_by_field[col] += 1
                changed = True

        # Fill-only: write only into an empty CSV cell. raw_text is never
        # overwritten or shortened here.
        for col in fill_cols:
            new = sanitize_csv_value((sheet.get(col) or "").strip())
            old = (row.get(col) or "").strip()
            if new and not old:
                row[col] = new
                writes_by_field[col] += 1
                changed = True

        if changed:
            rows_changed += 1
            applied += 1

    return csv_rows, {
        "rows_changed": rows_changed,
        "writes_by_field": dict(writes_by_field),
        "limit_reached": limit_reached,
        "matched": matched,
    }


# ---------- CSV I/O ---------------------------------------------------------


def load_csv(csv_path: pathlib.Path) -> Tuple[List[str], List[Dict[str, Any]]]:
    """Return (fieldnames, rows). Preserves the file's exact header order."""
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        rows = [dict(r) for r in reader]
    return fieldnames, rows


def write_csv_atomic(csv_path: pathlib.Path, fieldnames: List[str],
                     rows: List[Dict[str, Any]]) -> None:
    """Write rows to a sibling tmp then ``os.replace`` -- atomic for readers.

    Every cell is formula-injection-sanitized on the way out, not just the cells
    a sync overwrote: this rewrites the whole file, so a pre-existing trigger cell
    (e.g. a summary that begins with ``=`` or ``@``) would otherwise be committed
    raw (#336). The escape is idempotent -- an already-escaped value passes through
    -- and the site reverses it at export (#335). Rows are copied, so the caller's
    dicts are not mutated.
    """
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(prefix=".csv_tmp.", dir=str(csv_path.parent))
    os.close(fd)
    try:
        with open(tmp_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(
                {k: sanitize_csv_value(v) for k, v in row.items()} for row in rows
            )
        os.replace(tmp_path, str(csv_path))
    except Exception:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise


# ---------- Deploy tail (mirrors process_submission.py steps 8-11) ----------


def _run(cmd: List[str], cwd: pathlib.Path) -> Tuple[bool, str]:
    """Run a subprocess, capturing output. Returns (ok, combined_output)."""
    try:
        proc = subprocess.run(cmd, cwd=str(cwd), check=True,
                              capture_output=True, text=True)
        return True, (proc.stdout or "")
    except subprocess.CalledProcessError as exc:
        combined = (exc.stderr or "") + (exc.stdout or "")
        return False, combined.strip()
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)


def regen_json() -> Tuple[bool, str]:
    ok, out = _run(["node", str(EXPORT_SCRIPT)], DATA_DIR)
    return ok, out


def run_node_tests() -> Tuple[bool, str]:
    ok, out = _run(["npm", "test"], PROJECT_ROOT)
    # Surface only the tail of the test log on failure.
    return ok, (out[-800:] if not ok else "")


def _changed_paths(csv_path: pathlib.Path) -> List[str]:
    """Repo-relative paths the sync touches: the CSV plus the regenerated JSON."""
    try:
        rel_csv = str(csv_path.resolve().relative_to(PROJECT_ROOT.resolve()))
    except ValueError:
        rel_csv = str(csv_path)
    return [rel_csv] + [f"data/{f}" for f in _DEPLOY_JSON_FILES]


def _branch_name() -> str:
    """A unique branch per run: the Action run id, or a timestamp locally."""
    suffix = os.environ.get("GITHUB_RUN_ID") or str(int(time.time()))
    return f"sync/master-sheet-{suffix}"


def open_sync_pr(csv_path: pathlib.Path, stats: Dict[str, Any]) -> Tuple[Optional[str], str]:
    """Commit the merged data to a fresh branch, push it, and open a PR.

    A direct push to main is deliberately avoided -- a human reviews the
    enrichment diff before it goes live (Joe, 2026-05-29). The live push itself
    is the existing deploy.yml (Pillar 3c) run, triggered after the PR merges.

    Returns ``(branch_or_None_on_error, message)``. ``gh`` authenticates via the
    GH_TOKEN env var, which the workflow sets to the GitHub App token so the new
    PR triggers CI (a PR opened by the default GITHUB_TOKEN would not).
    """
    branch = _branch_name()
    paths = _changed_paths(csv_path)
    rows_changed = stats["rows_changed"]
    field_lines = "\n".join(
        f"- `{f}`: {n}" for f, n in sorted(stats["writes_by_field"].items()))
    title = f"data: sync {rows_changed} enriched record(s) from master sheet"
    body = (
        f"Automated sync from the master Google Sheet by the batch maintenance "
        f"runner (`sync_to_archive`).\n\n"
        f"Matched {stats['matched']} record(s) by id; changed {rows_changed}.\n\n"
        f"Per-field writes:\n{field_lines or '- (none)'}\n\n"
        f"The merge is additive: enrichment columns take the sheet's non-empty "
        f"value, fill-only columns (raw_text, publication_date, word_count) are "
        f"written only into empty cells, and raw_text is never blanked or "
        f"shortened. JSON was regenerated and `npm test` passed before this PR "
        f"opened.\n\n"
        f"Merge to land the data on main, then run the **Pillar 3c deploy** "
        f"workflow to push it live.\n\n"
        f"Design: `docs/plans/2026-05-29-batch-maintenance-runner-design.md`"
    )
    try:
        subprocess.run(["git", "config", "user.name",
                        os.environ.get("GIT_BOT_NAME", "rosen-archive-bot")],
                       cwd=str(PROJECT_ROOT), check=True, capture_output=True, text=True)
        subprocess.run(["git", "config", "user.email",
                        os.environ.get("GIT_BOT_EMAIL",
                                       "rosen-archive-bot@users.noreply.github.com")],
                       cwd=str(PROJECT_ROOT), check=True, capture_output=True, text=True)
        subprocess.run(["git", "checkout", "-b", branch],
                       cwd=str(PROJECT_ROOT), check=True, capture_output=True, text=True)
        subprocess.run(["git", "add"] + paths,
                       cwd=str(PROJECT_ROOT), check=True, capture_output=True, text=True)
        subprocess.run(["git", "commit", "-m", title],
                       cwd=str(PROJECT_ROOT), check=True, capture_output=True, text=True)
        subprocess.run(["git", "push", "origin", branch],
                       cwd=str(PROJECT_ROOT), check=True, capture_output=True, text=True)
        subprocess.run(["gh", "pr", "create", "--base", "main", "--head", branch,
                        "--title", title, "--body", body],
                       cwd=str(PROJECT_ROOT), check=True, capture_output=True, text=True)
        return branch, f"opened PR from {branch}"
    except subprocess.CalledProcessError as exc:
        return None, f"git/gh op failed: {(exc.stderr or '').strip() or exc}"


# ---------- Orchestration ---------------------------------------------------


def _print_stats(stats: Dict[str, Any], dry_run: bool) -> None:
    verb = "would change" if dry_run else "changed"
    print("=" * 70)
    print(f"[sync] matched {stats['matched']} record(s) by id; "
          f"{verb} {stats['rows_changed']}")
    if stats["writes_by_field"]:
        for field, n in sorted(stats["writes_by_field"].items()):
            print(f"  {field}: {n}")
    else:
        print("  (no field changes)")
    if stats["limit_reached"]:
        print(f"  [limit] stopped at {stats['rows_changed']} changes; "
              "more records have pending sheet enrichment -- raise --limit to continue")
    print("=" * 70)


def run(sheet_tab: str = DEFAULT_SHEET_TAB, limit: int = 0,
        dry_run: bool = False, csv_path: Optional[pathlib.Path] = None) -> Dict[str, Any]:
    """Read the sheet, merge into the CSV, and (unless dry-run) open a PR.

    Returns ``{status, rows_changed, exit_code, error}``. ``status`` is one of
    ``pr_opened | dry_run | nothing_to_sync | error``.
    """
    csv_path = pathlib.Path(csv_path or CSV_FILE)

    # --- Read the master sheet. ---
    try:
        sh = open_spreadsheet()
        worksheet = sh.worksheet(sheet_tab)
        values = worksheet.get_all_values()
    except Exception as exc:  # noqa: BLE001
        msg = f"Could not read sheet tab '{sheet_tab}': {exc}"
        logger.error(msg)
        return {"status": "error", "rows_changed": 0, "exit_code": 1, "error": msg}

    try:
        sheet_by_id = sheet_rows_by_id(values)
    except ValueError as exc:
        logger.error(str(exc))
        return {"status": "error", "rows_changed": 0, "exit_code": 1, "error": str(exc)}

    # --- Merge into the CSV (in memory). ---
    fieldnames, rows = load_csv(csv_path)
    rows, stats = merge_enrichment(rows, sheet_by_id, fieldnames, limit=limit)
    _print_stats(stats, dry_run)

    if dry_run:
        print("[sync] DRY RUN -- CSV not written, nothing deployed")
        return {"status": "dry_run", "rows_changed": stats["rows_changed"],
                "exit_code": 0, "error": ""}

    if stats["rows_changed"] == 0:
        # Sheet and CSV already agree. A deterministic no-op is a valid success.
        print("[sync] nothing to sync; CSV already matches the sheet")
        return {"status": "nothing_to_sync", "rows_changed": 0,
                "exit_code": 0, "error": ""}

    # --- Write CSV + regenerate + test, then open a PR. ---
    write_csv_atomic(csv_path, fieldnames, rows)
    logger.info(f"Wrote {stats['rows_changed']} merged record(s) to {csv_path}")

    ok, out = regen_json()
    if not ok:
        return {"status": "error", "rows_changed": stats["rows_changed"],
                "exit_code": 1, "error": f"JSON regen failed: {out}"}

    ok, out = run_node_tests()
    if not ok:
        return {"status": "error", "rows_changed": stats["rows_changed"],
                "exit_code": 1, "error": f"Tests failed; PR not opened. {out}"}

    branch, msg = open_sync_pr(csv_path, stats)
    if branch is None:
        return {"status": "error", "rows_changed": stats["rows_changed"],
                "exit_code": 1, "error": f"Could not open PR: {msg}"}

    print(f"[sync] {msg}; review and merge, then run the Pillar 3c deploy to "
          "go live")
    return {"status": "pr_opened", "rows_changed": stats["rows_changed"],
            "branch": branch, "exit_code": 0, "error": ""}


# ---------- CLI -------------------------------------------------------------


def _parse_args(argv):
    p = argparse.ArgumentParser(
        description="Merge enriched master-sheet columns into the archive CSV "
                    "and deploy.")
    p.add_argument("--sheet-tab", dest="sheet_tab", default=DEFAULT_SHEET_TAB,
                   help=f"Sheet tab to read (default: {DEFAULT_SHEET_TAB})")
    p.add_argument("--limit", type=int, default=0,
                   help="Cap records changed this run (0 = no cap)")
    p.add_argument("--dry-run", dest="dry_run", action="store_true",
                   help="Rehearse only: log the diff, write/deploy nothing")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = _parse_args(argv if argv is not None else sys.argv[1:])
    result = run(sheet_tab=args.sheet_tab, limit=args.limit, dry_run=args.dry_run)
    if result["error"]:
        logger.error(result["error"])
    logger.info(f"Result: status={result['status']} "
                f"rows_changed={result['rows_changed']}")
    sys.stdout.flush()
    return int(result.get("exit_code", 1))


if __name__ == "__main__":
    sys.exit(main())
