# -*- coding: utf-8 -*-
"""Tests for the SSRF URL-safety guard (issue #137)."""
import socket

import pytest

import rosen_scraper.url_safety as url_safety
from rosen_scraper.url_safety import (
    chromium_host_resolver_rules,
    is_safe_public_url,
    pinned_resolution,
    resolve_and_validate,
)


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


# ---------- resolve_and_validate (carries the validated IPs) ----------------
# is_safe_public_url throws away the IPs it resolved, so the actual fetch
# re-resolves and can be rebound to a private address (DNS-rebinding TOCTOU).
# resolve_and_validate returns those IPs so the caller can pin the connection.


def test_resolve_and_validate_returns_public_ips(monkeypatch):
    monkeypatch.setattr(url_safety, "_addresses_for_host",
                        lambda host: {"93.184.216.34"})
    ok, reason, ips = resolve_and_validate("https://example.com/page")
    assert ok is True, reason
    assert ips == ["93.184.216.34"]


def test_resolve_and_validate_rejects_when_any_ip_private(monkeypatch):
    monkeypatch.setattr(url_safety, "_addresses_for_host",
                        lambda host: {"93.184.216.34", "10.0.0.5"})
    ok, reason, ips = resolve_and_validate("https://example.com/")
    assert ok is False
    assert ips == []
    assert "non-public" in reason


def test_resolve_and_validate_literal_public_ip():
    ok, reason, ips = resolve_and_validate("https://8.8.8.8/")
    assert ok is True, reason
    assert ips == ["8.8.8.8"]


def test_resolve_and_validate_rejects_bad_scheme():
    ok, reason, ips = resolve_and_validate("ftp://example.com/x")
    assert ok is False
    assert ips == []


# ---------- pinned_resolution (closes the requests/urllib3 TOCTOU) ----------


def test_pinned_resolution_forces_validated_ip(monkeypatch):
    # Simulate rebinding: the live resolver now hands back a private IP, but
    # the pin must return the pre-validated public IP for the pinned host.
    def _rebind(node, port, *a, **k):
        return [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP,
                 "", ("10.0.0.5", port or 0))]

    monkeypatch.setattr(socket, "getaddrinfo", _rebind)
    with pinned_resolution("example.com", ["93.184.216.34"]):
        infos = socket.getaddrinfo("example.com", 443)
    assert {info[4][0] for info in infos} == {"93.184.216.34"}


def test_pinned_resolution_passes_through_other_hosts(monkeypatch):
    sentinel = [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP,
                 "", ("203.0.113.7", 443))]
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: sentinel)
    with pinned_resolution("example.com", ["93.184.216.34"]):
        other = socket.getaddrinfo("other.test", 443)
    assert other is sentinel  # an unpinned host falls through to the resolver


def test_pinned_resolution_restores_resolver_on_exit(monkeypatch):
    def _orig(*a, **k):
        return "ORIG"

    monkeypatch.setattr(socket, "getaddrinfo", _orig)
    with pinned_resolution("example.com", ["93.184.216.34"]):
        pass
    assert socket.getaddrinfo is _orig


# ---------- chromium_host_resolver_rules (closes the Playwright TOCTOU) -----


def test_chromium_host_resolver_rules_pins_host():
    args = chromium_host_resolver_rules("example.com", ["93.184.216.34"])
    assert args == ["--host-resolver-rules=MAP example.com 93.184.216.34"]


def test_chromium_host_resolver_rules_empty_for_literal_ip():
    assert chromium_host_resolver_rules("8.8.8.8", ["8.8.8.8"]) == []


def test_chromium_host_resolver_rules_empty_when_nothing_to_pin():
    assert chromium_host_resolver_rules("", []) == []
    assert chromium_host_resolver_rules("example.com", []) == []


def test_chromium_host_resolver_rules_prefers_ipv4():
    # resolve_and_validate sorts addresses lexicographically, which can put an
    # IPv6 address first; pinning Chromium to an IPv6-only MAP breaks scraping on
    # IPv4-only runners. Prefer an IPv4 address when the validated set has one.
    args = chromium_host_resolver_rules(
        "example.com", ["2001:db8::1", "93.184.216.34"])
    assert args == ["--host-resolver-rules=MAP example.com 93.184.216.34"]


def test_chromium_host_resolver_rules_ipv6_only_still_pins():
    # Chromium MAP parses the replacement port off the last colon, so an IPv6
    # literal must be bracketed or "2001:db8::1" is misparsed as host
    # "2001:db8:" + port "1" and the pin silently fails to apply.
    args = chromium_host_resolver_rules("example.com", ["2001:db8::1"])
    assert args == ["--host-resolver-rules=MAP example.com [2001:db8::1]"]


def test_chromium_host_resolver_rules_brackets_chosen_ipv6():
    # When the validated set is IPv6-only the chosen replacement must be
    # bracketed; an IPv4 replacement must not be.
    assert chromium_host_resolver_rules("h.test", ["::1"]) == [
        "--host-resolver-rules=MAP h.test [::1]"]
    assert chromium_host_resolver_rules("h.test", ["203.0.113.9"]) == [
        "--host-resolver-rules=MAP h.test 203.0.113.9"]


def test_chromium_host_resolver_rules_canonicalizes_idn_host():
    # Chromium connects to the IDNA/punycode form of an internationalized
    # domain, so a MAP rule naming the raw Unicode host silently fails to apply,
    # reopening the rebinding window for IDN hosts. The rule must name the same
    # punycode host the browser will resolve (parity with pinned_resolution).
    args = chromium_host_resolver_rules("münchen.test", ["203.0.113.5"])
    assert args == ["--host-resolver-rules=MAP xn--mnchen-3ya.test 203.0.113.5"]


# ---------- DNS-rebinding hardening of pinned_resolution / resolve_and_validate


def test_pinned_resolution_no_live_fallback_on_family_mismatch(monkeypatch):
    # A host validated to an IPv6-only public set must NOT fall back to the live
    # resolver when an IPv4 (AF_INET) connection is requested -- re-resolving
    # there would reopen the rebinding window. Fail closed instead.
    called = {"n": 0}

    def _orig(*a, **k):
        called["n"] += 1
        return [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP,
                 "", ("10.0.0.5", 0))]

    monkeypatch.setattr(socket, "getaddrinfo", _orig)
    with pinned_resolution("example.com", ["2001:db8::1"]):
        with pytest.raises(socket.gaierror):
            socket.getaddrinfo("example.com", 443, family=socket.AF_INET)
    assert called["n"] == 0  # the pinned host never reached the live resolver


def test_pinned_resolution_matches_punycode_connect_host(monkeypatch):
    # urllib3 connects using the IDNA (punycode) host while the guard pinned the
    # Unicode host from urlparse. The pin must still apply under either spelling
    # instead of falling back to live DNS for the "different" host.
    unicode_host = "münchen.test"  # münchen.test
    puny = unicode_host.encode("idna").decode("ascii")

    def _rebind(*a, **k):
        return [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP,
                 "", ("10.0.0.5", 0))]

    monkeypatch.setattr(socket, "getaddrinfo", _rebind)
    with pinned_resolution(unicode_host, ["93.184.216.34"]):
        infos = socket.getaddrinfo(puny, 443)
    assert {info[4][0] for info in infos} == {"93.184.216.34"}


def test_resolve_and_validate_handles_malformed_ipv6_url():
    # Accessing .hostname on a malformed bracketed IPv6 URL raises ValueError;
    # the guard must catch it and reject rather than crash the caller.
    ok, reason, ips = resolve_and_validate("http://[::1")
    assert ok is False
    assert ips == []
    assert reason


def test_resolve_and_validate_handles_resolution_unicode_error(monkeypatch):
    # Invalid IDNA hostnames raise UnicodeError from getaddrinfo (not gaierror);
    # the guard must treat that as unresolvable, not propagate it.
    def _boom(host):
        raise UnicodeError("invalid IDNA label")

    monkeypatch.setattr(url_safety, "_addresses_for_host", _boom)
    ok, reason, ips = resolve_and_validate("http://bad-idna.example/")
    assert ok is False
    assert ips == []
