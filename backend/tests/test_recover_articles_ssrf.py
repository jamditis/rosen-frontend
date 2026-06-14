# -*- coding: utf-8 -*-
"""SSRF-guard tests for the Playwright recovery script (#287).

The recovery script drives a real browser to a URL taken from --url or from a
gap JSON file. A polluted gap file could point at a loopback, private, or
link-local host (e.g. 169.254.169.254 cloud metadata), and the recovery runs on
a machine with internal services on localhost / Tailscale. These tests prove
the guard rejects unsafe targets *before* any navigation, and that the route
handler aborts unsafe redirects/subresources while leaving in-browser schemes
(data:, blob:) alone so legitimate pages still render.
"""

import importlib.util
import pathlib
import sys
from unittest.mock import MagicMock

import pytest

pytest.importorskip("playwright")

_BACKEND = pathlib.Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


def _load_module():
    path = _BACKEND / "scripts" / "recover_articles_playwright.py"
    spec = importlib.util.spec_from_file_location("recover_articles_playwright", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


rap = _load_module()


class TestRecoverRejectsUnsafeTargets:
    """recover() must reject an unsafe URL without ever calling page.goto."""

    @pytest.mark.parametrize(
        "url",
        [
            "http://127.0.0.1/admin",
            "http://169.254.169.254/latest/meta-data/",
            "http://10.0.0.1/internal",
            "http://[::1]/admin",
        ],
    )
    def test_unsafe_url_rejected_without_navigation(self, url):
        page = MagicMock()
        result = rap.recover(page, url)
        assert result["source"] == "rejected"
        assert "unsafe" in result["error"].lower()
        page.goto.assert_not_called()

    def test_non_http_scheme_rejected_without_navigation(self):
        page = MagicMock()
        result = rap.recover(page, "file:///etc/passwd")
        assert result["source"] == "rejected"
        page.goto.assert_not_called()


class TestRouteGuard:
    """The page route handler aborts unsafe http(s); passes everything else."""

    def test_aborts_unsafe_http_request(self):
        route, request = MagicMock(), MagicMock()
        request.url = "http://127.0.0.1/admin"
        rap._block_unsafe_request(route, request)
        route.abort.assert_called_once()
        route.continue_.assert_not_called()

    def test_aborts_link_local_metadata_request(self):
        route, request = MagicMock(), MagicMock()
        request.url = "http://169.254.169.254/latest/meta-data/"
        rap._block_unsafe_request(route, request)
        route.abort.assert_called_once()

    def test_allows_public_literal_ip(self):
        # A literal public IP takes the no-DNS path in is_safe_public_url, so
        # this test never touches the network.
        route, request = MagicMock(), MagicMock()
        request.url = "http://93.184.216.34/"
        rap._block_unsafe_request(route, request)
        route.continue_.assert_called_once()
        route.abort.assert_not_called()

    def test_allows_data_uri(self):
        # data: carries no network request to an internal host; aborting it
        # would break rendering of pages with inline images/fonts.
        route, request = MagicMock(), MagicMock()
        request.url = "data:image/png;base64,iVBORw0KGgo="
        rap._block_unsafe_request(route, request)
        route.continue_.assert_called_once()
        route.abort.assert_not_called()
