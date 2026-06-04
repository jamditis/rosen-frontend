# -*- coding: utf-8 -*-
"""Tests for issue #354 — the diagnostic/backfill scripts must import cleanly
and resolve known_entities.json to the single curated file at backend/.

Background: a refactor moved backend modules under the ``rosen_scraper`` package
(installed editable via the venv ``rosen_scraper.pth``), but these standalone
scripts still imported the old ``src.*`` layout and crashed at import; two also
resolved ``known_entities.json`` to a path that does not exist or to the cwd.

These scripts are intentionally non-packaged (no ``__init__.py`` under
``scripts/``), so they are loaded by file path with ``importlib`` — the same
pattern as ``test_sweep_stuck.py``.
"""

from __future__ import annotations

import hashlib
import importlib.util
import pathlib
from unittest.mock import MagicMock, patch

import pytest

_BACKEND = pathlib.Path(__file__).resolve().parents[1]
_CANONICAL = _BACKEND / "known_entities.json"

# (module name, path relative to backend/) for every script #354 repairs.
_SCRIPTS = {
    "bulk_reprocessor": "scripts/backfill/bulk_reprocessor.py",
    "populate_new_fields": "scripts/diagnostics/populate_new_fields.py",
    "data_improver": "scripts/diagnostics/data_improver.py",
    "review_results": "scripts/diagnostics/review_results.py",
    "schema_builder": "scripts/diagnostics/schema_builder.py",
}


def _load(name: str):
    path = _BACKEND / _SCRIPTS[name]
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize("name", sorted(_SCRIPTS))
def test_script_imports_cleanly(name):
    """Each script imports without ModuleNotFoundError/ImportError (cwd-independent)."""
    _load(name)  # raises if the import surface is still broken


@pytest.mark.parametrize("name", sorted(_SCRIPTS))
def test_known_entities_resolves_to_curated_file(name):
    """Each script exposes a KNOWN_ENTITIES_FILE that points at the one curated file."""
    module = _load(name)
    resolved = pathlib.Path(module.KNOWN_ENTITIES_FILE).resolve()
    assert resolved == _CANONICAL.resolve(), (
        f"{name} resolves known_entities.json to {resolved}, not {_CANONICAL}"
    )
    assert resolved.exists(), f"{name}: known_entities.json not found at {resolved}"


# Entrypoint per script that reaches the gspread.service_account(filename=...) call.
_CREDS_ENTRYPOINTS = {
    "bulk_reprocessor": lambda m: m.BulkReprocessor(),
    "data_improver": lambda m: m.main(),
    "review_results": lambda m: m.main(),
    "schema_builder": lambda m: m.main(),
    "populate_new_fields": lambda m: m.populate_new_fields(dry_run=True),
}


class _StopAtConnect(Exception):
    """Raised from the patched service_account to halt a script right after the
    credentials path is built, before any real Sheets I/O."""


@pytest.mark.parametrize("name", sorted(_CREDS_ENTRYPOINTS))
def test_credentials_path_anchored_to_backend(name, monkeypatch):
    """Each script builds its service-account credentials path under backend/, not
    backend/scripts[/diagnostics] — regression for the wrong-depth os.path.dirname()
    anchor that made gspread.service_account() raise FileNotFoundError with the
    documented relative default (#354)."""
    module = _load(name)

    # Use the documented relative default so a wrong anchor produces a wrong dir.
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)

    captured = {}

    def fake_service_account(*args, filename=None, **kwargs):
        captured["filename"] = filename
        raise _StopAtConnect

    monkeypatch.setattr(module.gspread, "service_account", fake_service_account)
    # init_logger would otherwise mkdir a cwd-relative log tree (tracked separately).
    if hasattr(module, "init_logger"):
        monkeypatch.setattr(module, "init_logger", lambda *a, **k: MagicMock())

    try:
        _CREDS_ENTRYPOINTS[name](module)
    except _StopAtConnect:
        pass  # bulk_reprocessor re-raises; the others swallow and return

    assert "filename" in captured, f"{name}: gspread.service_account was never called"
    resolved = pathlib.Path(captured["filename"]).resolve()
    assert resolved.parent == _BACKEND.resolve(), (
        f"{name}: credentials resolve under {resolved.parent}, not backend/ ({_BACKEND})"
    )
    assert resolved.name == "google_credentials.json"


def test_schema_builder_does_not_clobber_curated_file_by_default():
    """schema_builder writes a staging file by default and leaves the curated file untouched."""
    schema_builder = _load("schema_builder")
    discovered = pathlib.Path(schema_builder.DISCOVERED_FILE)
    before = hashlib.sha256(_CANONICAL.read_bytes()).hexdigest()

    rows = [
        ["url", "publisher", "platform"],
        ["https://pressthink.org/post", "PressThink", "Web"],
    ]
    fake_ws = MagicMock()
    fake_ws.get_all_values.return_value = rows
    fake_gc = MagicMock()
    fake_gc.open.return_value.worksheet.return_value = fake_ws

    discovered.unlink(missing_ok=True)
    try:
        with patch.object(
            schema_builder.gspread, "service_account", return_value=fake_gc
        ):
            schema_builder.main()  # no --write-canonical
        after = hashlib.sha256(_CANONICAL.read_bytes()).hexdigest()
        assert after == before, (
            "default run must not modify the curated known_entities.json"
        )
        assert discovered.exists(), "default run must write the discovered staging file"
    finally:
        discovered.unlink(missing_ok=True)
