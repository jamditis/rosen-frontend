# -*- coding: utf-8 -*-
"""Tests for the SSRF URL-safety guard (issue #137)."""
import pytest

from rosen_scraper.url_safety import is_safe_public_url


@pytest.mark.parametrize("url", [
    "http://127.0.0.1/admin",
    "http://localhost:5000/",
    "https://10.0.0.5/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",  # cloud metadata endpoint
    "http://[::1]/",
    "http://0.0.0.0/",
])
def test_rejects_private_and_loopback(url):
    ok, reason = is_safe_public_url(url)
    assert ok is False
    assert reason


@pytest.mark.parametrize("url", [
    "ftp://example.com/file",
    "file:///etc/passwd",
    "gopher://127.0.0.1/",
    "javascript:alert(1)",
])
def test_rejects_non_http_schemes(url):
    ok, _ = is_safe_public_url(url)
    assert ok is False


@pytest.mark.parametrize("bad", ["", None, "not a url", "http://"])
def test_rejects_malformed(bad):
    ok, _ = is_safe_public_url(bad)
    assert ok is False


@pytest.mark.parametrize("url", [
    "https://8.8.8.8/",            # public literal IP, no DNS lookup needed
    "http://1.1.1.1/path?q=1",
])
def test_allows_public_literal_ip(url):
    ok, reason = is_safe_public_url(url)
    assert ok is True, reason
