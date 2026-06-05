# -*- coding: utf-8 -*-
"""Tests for the shared backfill URL date extractor (issue #189).

Two things are locked in here:

1. ``extract_date_from_url`` behaviour at the module interface. The function is
   pure -- no Google Sheets, no network -- so it is exercised directly, with no
   I/O layer to mock. This is the regression guard the issue's acceptance
   criteria ask for before the three date-backfill strategies are consolidated.

2. A drift guard: each strategy class
   (``SimpleDateBackfiller`` / ``PublicationDateBackfiller`` /
   ``EnhancedDateBackfiller``) must now delegate to the shared function rather
   than carry its own copy. The classes are loaded by file path (they live in
   the non-packaged ``scripts/backfill/`` directory, the same pattern as
   ``test_diagnostic_scripts_resolve.py``) and their ``extract_date_from_url``
   is called unbound so no Google credentials are needed.
"""

from __future__ import annotations

import importlib.util
import inspect
import pathlib

import pytest

_BACKFILL = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "backfill"


def _load(name: str, filename: str):
    path = _BACKFILL / filename
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


extract_date_from_url = _load(
    "date_extraction_under_test", "date_extraction.py"
).extract_date_from_url


# (URL, expected MM/DD/YYYY or None). Each case documents the branch it covers.
_CASES = [
    # PressThink permalink, month only -> day defaults to the 1st.
    ("https://pressthink.org/2020/11/the-post/", "11/01/2020"),
    # PressThink permalink with an explicit day.
    ("https://pressthink.org/2003/08/25/another-post/", "08/25/2003"),
    # http archive subdomain still parses.
    ("http://archive.pressthink.org/2009/03/", "03/01/2009"),
    # Fallback: YYYY-MM-DD elsewhere in the path.
    ("https://example.com/news/2015-06-26-headline", "06/26/2015"),
    # Fallback: MM-DD-YYYY (the one branch with a different group order).
    ("https://example.com/06-26-2015/headline", "06/26/2015"),
    # Fallback: YYYY/MM/DD that the PressThink pattern does not catch
    # (no leading slash before the year, so it falls through to the loop).
    ("https://example.com/post?d=2015/06/26", "06/26/2015"),
    # No date anywhere -> None.
    ("https://example.com/about/the-team", None),
    # Invalid month in a PressThink-shaped path -> not coerced, returns None.
    ("https://pressthink.org/2020/13/bad-month/", None),
    # Invalid day (Feb 30) in YYYY/MM/DD shape -> not coerced, returns None.
    ("https://pressthink.org/2020/02/30/bad-day/", None),
    # Empty string -> None.
    ("", None),
]


@pytest.mark.parametrize("url,expected", _CASES)
def test_extract_date_from_url(url, expected):
    assert extract_date_from_url(url) == expected


def test_none_input_returns_none():
    # Hardened over the original strategies, which raised TypeError on None.
    # No caller passes None today; this makes the bad state safe rather than
    # fatal.
    assert extract_date_from_url(None) is None


# (module name, filename, class name) for each strategy that must delegate.
_STRATEGIES = [
    ("simple_date_backfill", "simple_date_backfill.py", "SimpleDateBackfiller"),
    (
        "publication_date_backfill",
        "publication_date_backfill.py",
        "PublicationDateBackfiller",
    ),
    ("enhanced_date_backfill", "enhanced_date_backfill.py", "EnhancedDateBackfiller"),
]


class _DummySelf:
    """Stand-in for ``self``; the delegating method ignores it."""


@pytest.mark.parametrize("name,filename,classname", _STRATEGIES)
def test_strategy_delegates_to_shared_extractor(name, filename, classname):
    module = _load(name, filename)

    # Structural guard: the strategy must call the shared helper, not a
    # re-pasted copy. The module-level name must resolve to the shared module,
    # and the method body must be the one-line delegation. A future copy-paste
    # regression fails here even if it still produces identical output.
    assert module.extract_date_from_url.__module__ == "date_extraction"
    method_src = inspect.getsource(getattr(module, classname).extract_date_from_url)
    assert "return extract_date_from_url(url)" in method_src

    # Behaviour guard: the delegating method matches the shared function.
    cls = getattr(module, classname)
    dummy = _DummySelf()
    for url, _expected in _CASES:
        assert cls.extract_date_from_url(dummy, url) == extract_date_from_url(url)
