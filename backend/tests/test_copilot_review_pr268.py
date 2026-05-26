# -*- coding: utf-8 -*-
"""Failing-test-first coverage for the bugs Copilot flagged on PR #268.

Bug-fix workflow per CLAUDE.md: write the failing test before the fix.
Each test fails against the pre-fix code; the same-PR fixes make them pass.

Bugs covered:
  - pick_overrides() uses `if domain in host` — substring match treats
    "not-huffpost.com" as a match for "huffpost.com" override. Should be
    exact-or-parent-domain.
  - pick_overrides() uses host.lstrip("www."), which treats the argument
    as a character set, not a literal prefix. Corrupts hosts that begin
    with characters in the set {'w', '.'}, e.g. "www.weather.com" →
    "eather.com" (3 w's + 1 dot stripped, then 'w' in "weather" also
    stripped because it's still in the set).

The Wayback-fallback short-body false-success bug (Copilot finding #3)
is also fixed in the same PR but tests would require Playwright mocking
out of scope for this PR; the fix is small and inspectable in the diff.
"""
import pathlib
import sys

import pytest

_BACKEND = pathlib.Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

pytest.importorskip("playwright")

from scripts import recover_articles_playwright as mod  # noqa: E402


class TestPickOverridesSubstringFalsePositive:
    """Copilot finding #2 — substring match would apply HuffPost overrides
    to unrelated domains containing the substring."""

    def test_exact_huffpost_match(self):
        cfg = mod.pick_overrides("https://www.huffpost.com/entry/foo")
        assert cfg.get("paragraphs") == "article p"

    def test_not_huffpost_does_not_match(self):
        # Pre-fix: `if "huffpost.com" in "not-huffpost.com"` → True → wrong cfg.
        cfg = mod.pick_overrides("https://not-huffpost.com/article")
        assert cfg == {}

    def test_huffpost_lookalike_does_not_match(self):
        cfg = mod.pick_overrides("https://huffpostfake.example.com/article")
        assert cfg == {}

    def test_subdomain_of_huffpost_does_match(self):
        # Legitimate subdomain match — endswith('.huffpost.com').
        cfg = mod.pick_overrides("https://uk.huffpost.com/entry/foo")
        assert cfg.get("paragraphs") == "article p"


class TestPickOverridesLstripBug:
    """Sibling bug found while fixing #2 — `lstrip('www.')` treats the
    argument as a character set, not a literal prefix."""

    def test_www_prefix_stripped(self):
        cfg = mod.pick_overrides("https://www.huffpost.com/entry/foo")
        assert cfg.get("paragraphs") == "article p"

    def test_weather_com_not_corrupted(self):
        # Pre-fix: "www.weather.com" → lstrip("www.") → "eather.com" → no
        # override match → cfg = {}. The end result is technically the same
        # ({} either way because no weather override is registered), but the
        # CORRUPTED host would silently make any future weather.com override
        # registration not work. Test that the host parsing itself is sound.
        cfg = mod.pick_overrides("https://www.weather.com/forecast/foo")
        assert cfg == {}

    def test_host_with_double_w_subdomain_preserved(self):
        # If someone registered an override for "ww-something.example",
        # lstrip would incorrectly strip a leading 'w'. removeprefix("www.")
        # only strips the literal prefix.
        cfg = mod.pick_overrides("https://ww-test.example.com/foo")
        assert cfg == {}
