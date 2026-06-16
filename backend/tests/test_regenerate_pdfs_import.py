# -*- coding: utf-8 -*-
"""Test for issue #431 — scripts/pdf/regenerate_pdfs.py must import cleanly.

Background: the script used a bare ``import pdf_generator`` that resolved only
while it sat beside ``pdf_generator.py``. The monorepo merge (commit 0b51cfa)
moved that module into the ``rosen_scraper`` package under ``src/``, so the bare
import has raised ModuleNotFoundError ever since unless the script happened to be
run from inside that package directory. The fix uses the package-qualified import
the rest of the backend already uses (rosen_scraper/workflow.py).

The script is intentionally non-packaged (no ``__init__.py`` under ``scripts/``),
so it is loaded by file path with ``importlib`` — the same pattern as
test_diagnostic_scripts_resolve.py.
"""

from __future__ import annotations

import importlib.util
import pathlib

_BACKEND = pathlib.Path(__file__).resolve().parents[1]
_SCRIPT = _BACKEND / "scripts/pdf/regenerate_pdfs.py"


def _load():
    spec = importlib.util.spec_from_file_location("regenerate_pdfs", _SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # raises if the import surface is broken
    return module


def test_regenerate_pdfs_imports_cleanly():
    """The script imports without ModuleNotFoundError, independent of cwd."""
    _load()


def test_regenerate_pdfs_uses_pdf_generator():
    """The resolved pdf_generator exposes create_article_pdf (the function the
    script calls), proving the import points at the real module, not a stub."""
    module = _load()
    assert hasattr(module.pdf_generator, "create_article_pdf")
