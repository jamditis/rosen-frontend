# -*- coding: utf-8 -*-
"""Tests for issue #358 — nested diagnostic/PDF scripts must anchor their
service-account credentials to backend/ regardless of nesting depth or cwd.

These scripts live >=2 levels under backend/ but built their credentials with a
double/triple ``os.path.dirname()`` anchor that resolved to ``backend/scripts``
(or deeper), so with the documented relative default
(``GOOGLE_APPLICATION_CREDENTIALS`` unset) ``gspread.service_account()`` pointed
at a file that does not exist and raised ``FileNotFoundError`` — same bug class
as #354 (``test_diagnostic_scripts_resolve.py``), but in the scripts outside
that scope.

The fix differs by how each script can reach the backend root:

* The three diagnostics scripts already put ``backend/src`` on ``sys.path`` for
  their own imports, so they anchor via
  ``rosen_scraper.path_utils.find_project_root`` (walks up to pyproject.toml,
  correct from any depth). They are importable, so they are driven to the real
  connector call and the captured credentials path is asserted under backend/.
* The two PDF scripts are run standalone from their own directory and only put
  the sibling ``pdf/`` dir on ``sys.path`` (never ``backend/src``), so they
  cannot import ``rosen_scraper``. They anchor with a literal
  ``Path(__file__).resolve().parents[N]`` hop instead (same pattern as
  ``scripts/backfill/bulk_reprocessor.py``) and are checked structurally,
  because importlib can't load them without their sibling modules.
"""

from __future__ import annotations

import importlib.util
import pathlib
import re
from unittest.mock import MagicMock

import pytest

_BACKEND = pathlib.Path(__file__).resolve().parents[1]


def _load(rel: str):
    path = _BACKEND / rel
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _StopAtConnect(Exception):
    """Raised from the patched connector to halt the script right after the
    credentials path is built, before any real Sheets I/O."""


def test_find_project_root_resolves_to_backend():
    """The anchor the fix relies on must point at backend/ (where pyproject.toml
    lives) — the credentials default is resolved relative to it."""
    from rosen_scraper.path_utils import find_project_root

    assert find_project_root().resolve() == _BACKEND.resolve()


# Drivers reach each credentials site. cross_reference_analyzer has two (one per
# method); both are exercised. The connector each script calls differs: the
# diagnostics use gspread.service_account; data_deduper uses the shared
# get_gspread_client imported into its namespace.
def _drive_cross_ref_analyze(m):
    m.CrossReferenceManager().analyze_all_relationships()


def _drive_cross_ref_update(m):
    m.CrossReferenceManager().update_related_to_fields([])


def _drive_format_converter(m):
    m.DataFormatConverter().migrate_google_sheets_format(dry_run=True)


def _drive_data_deduper(m):
    m.main([])


# (id, rel path, connector attr to patch, driver)
_BEHAVIORAL = [
    (
        "cross_reference_analyzer::analyze",
        "scripts/diagnostics/cross_reference_analyzer.py",
        "gspread.service_account",
        _drive_cross_ref_analyze,
    ),
    (
        "cross_reference_analyzer::update",
        "scripts/diagnostics/cross_reference_analyzer.py",
        "gspread.service_account",
        _drive_cross_ref_update,
    ),
    (
        "format_converter",
        "scripts/diagnostics/format_converter.py",
        "gspread.service_account",
        _drive_format_converter,
    ),
    (
        "data_deduper",
        "scripts/diagnostics/data_deduper.py",
        "get_gspread_client",
        _drive_data_deduper,
    ),
]


@pytest.mark.parametrize(
    "label,rel,connector,driver", _BEHAVIORAL, ids=[b[0] for b in _BEHAVIORAL]
)
def test_credentials_anchored_to_backend(label, rel, connector, driver, monkeypatch):
    module = _load(rel)
    # Documented relative default, so a wrong anchor yields a wrong directory.
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)

    captured = {}

    def fake_connect(*args, filename=None, **kwargs):
        # gspread.service_account takes filename=; get_gspread_client takes it positionally.
        captured["filename"] = (
            filename if filename is not None else (args[0] if args else None)
        )
        raise _StopAtConnect

    if connector.startswith("gspread."):
        monkeypatch.setattr(module.gspread, "service_account", fake_connect)
    else:
        monkeypatch.setattr(module, connector, fake_connect)

    # get_logger would otherwise build a cwd-relative log tree (tracked as #357).
    if hasattr(module, "get_logger"):
        monkeypatch.setattr(module, "get_logger", lambda *a, **k: MagicMock())

    try:
        driver(module)
    except _StopAtConnect:
        pass  # propagated
    except Exception:
        pass  # several methods catch Exception internally and return; that's fine

    assert "filename" in captured, f"{label}: the Sheets connector was never called"
    resolved = pathlib.Path(captured["filename"]).resolve()
    assert (
        resolved.parent == _BACKEND.resolve()
    ), f"{label}: credentials resolve under {resolved.parent}, not backend/ ({_BACKEND})"
    assert resolved.name == "google_credentials.json"


# These two import sibling modules via sys.path manipulation and cannot be loaded
# standalone with importlib, so verify the fix structurally. Each entry pairs the
# script with the parents[N] index that resolves to backend/ from its real depth.
_SOURCE_ONLY = [
    ("scripts/pdf/regenerate_pdfs.py", 2),
    ("scripts/pdf/enhanced_pdf_generator/batch_pdf_generator.py", 3),
]


@pytest.mark.parametrize("rel,depth", _SOURCE_ONLY, ids=[s[0] for s in _SOURCE_ONLY])
def test_pdf_scripts_anchor_credentials_to_backend(rel, depth):
    path = _BACKEND / rel
    src = path.read_text(encoding="utf-8")
    # The literal hop must actually land on backend/ from this file's real depth,
    # so a future move that changes the nesting fails loudly here.
    assert (
        path.resolve().parents[depth] == _BACKEND.resolve()
    ), f"{rel}: parents[{depth}] is {path.resolve().parents[depth]}, not backend/"
    # The source must use that exact hop and join the credentials filename onto a
    # backend-rooted path -- either the literal parents[N] hop or a _BACKEND_ROOT
    # alias of it. Tying the two together rejects a stray unrelated
    # "/ credentials_filename" elsewhere in the file.
    assert (
        f"Path(__file__).resolve().parents[{depth}]" in src
    ), f"{rel}: must anchor to backend/ via Path(__file__).resolve().parents[{depth}]"
    assert re.search(
        rf"(parents\[{depth}\]|_BACKEND_ROOT)\s*/\s*credentials_filename", src
    ), f"{rel}: credentials_filename must be joined onto the backend-rooted path"
    # These standalone scripts must NOT depend on the rosen_scraper package
    # import, which is unavailable without a backend/src sys.path hack and was the
    # ModuleNotFoundError this revision removed.
    assert (
        "from rosen_scraper.path_utils import find_project_root" not in src
    ), f"{rel}: must not import rosen_scraper (unavailable when run standalone)"
    # The wrong-depth anchor fed os.path.dirname(os.path.dirname(...)) into the
    # credentials os.path.join; that pattern must be gone (the surviving
    # sys.path.append dirname call is not an os.path.join and is left alone).
    assert not re.search(
        r"os\.path\.join\(\s*os\.path\.dirname\(\s*os\.path\.dirname", src
    ), f"{rel}: wrong-depth credentials anchor still present"
