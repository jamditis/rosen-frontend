# -*- coding: utf-8 -*-
"""Regression for #432 -- backfill/diagnostic scripts must anchor their
service-account credentials to backend/ instead of passing a bare
``'google_credentials.json'`` relative literal to the connector.

A bare literal resolves against the current working directory, so the scripts
raised ``FileNotFoundError`` unless invoked from backend/. Same bug class as
#354 / #358; these are the remaining offenders called out in #432.

The checks are structural and pure-stdlib on purpose: importing these scripts
pulls gspread / google-api-python-client and (for some) Playwright at module
load, which the existing driver-style tests handle for their own scope. Here we
verify the source compiles, reads the env override, anchors at the declared
depth, and -- the real correctness guard -- that ``parents[N]`` from each
script's own location actually resolves to backend/.
"""

from __future__ import annotations

import pathlib

import pytest

_BACKEND = pathlib.Path(__file__).resolve().parents[1]

# script (relative to backend/) -> the parents[N] depth that reaches backend/.
SCRIPTS = {
    # The three date-backfill strategies were merged into one module (#189).
    "scripts/backfill/date_backfill.py": 2,
    "scripts/diagnostics/text_cleaner.py": 2,
    "scripts/diagnostics/smart_corrector/gdrive_overflow_handler.py": 3,
    "scripts/verify_extraction_sheets.py": 1,
    "scripts/corrector.py": 1,
}

# Bare relative literals handed straight to a connector -- the bug.
_BARE_CALLS = (
    "service_account(filename='google_credentials.json')",
    "from_service_account_file('google_credentials.json'",
)


@pytest.mark.parametrize("rel, depth", sorted(SCRIPTS.items()))
def test_credentials_anchored_to_backend(rel, depth):
    path = _BACKEND / rel
    assert path.exists(), f"{rel} moved -- update the #432 anchor map"
    src = path.read_text(encoding="utf-8")

    # The edits are syntactically valid Python.
    compile(src, str(path), "exec")

    # No bare relative literal reaches the connector anymore.
    for bad in _BARE_CALLS:
        assert bad not in src, f"{rel} still passes a bare credentials literal"

    # The default is the env override, anchored at the declared depth.
    assert 'os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"' in src, rel
    assert f"parents[{depth}]" in src, rel

    # The declared depth genuinely reaches backend/ from this script's location.
    assert (
        path.resolve().parents[depth] == _BACKEND
    ), f"{rel}: parents[{depth}] is {path.resolve().parents[depth]}, not {_BACKEND}"
