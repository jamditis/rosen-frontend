# -*- coding: utf-8 -*-
"""
URL safety checks that prevent server-side request forgery (SSRF).

Submitted URLs are fetched server-side by the scraper (a plain ``requests`` call
and a full Playwright render). Without a guard, a submitted URL pointing at a
private, loopback, or link-local address would let the server reach internal
services - cloud metadata endpoints, localhost ports, internal admin panels.

``is_safe_public_url`` resolves the hostname and accepts a URL only when it is a
plain http/https request whose host resolves exclusively to public IP
addresses. It is pure standard library so it can run anywhere the scraper or the
submission server runs.

Resolving in the guard and then letting ``requests``/Chromium resolve again at
connect time leaves a DNS-rebinding window: a low-TTL record can answer with a
public IP for the check and a private one for the fetch. ``resolve_and_validate``
returns the validated IPs, and ``pinned_resolution`` (in-process, for requests)
and ``chromium_host_resolver_rules`` (launch args, for the browser) pin the
connection to one of those addresses so check and connect agree.
"""

import ipaddress
import socket
from contextlib import contextmanager
from urllib.parse import urlparse

# Schemes the scraper is allowed to fetch. Anything else (file:, ftp:, gopher:,
# data:, javascript:, ...) is rejected outright.
ALLOWED_SCHEMES = ("http", "https")


def _addresses_for_host(host):
    """Return the set of IP addresses a hostname resolves to.

    Raises socket.gaierror if the host cannot be resolved.
    """
    infos = socket.getaddrinfo(host, None)
    return {info[4][0] for info in infos}


def _is_public_address(ip_str):
    """Return True only when ip_str is a normal, routable public address."""
    ip = ipaddress.ip_address(ip_str)
    # Reject loopback, private (RFC1918 / ULA), link-local (which includes the
    # 169.254.0.0/16 cloud-metadata range), multicast, reserved, and the
    # unspecified address.
    if (ip.is_private or ip.is_loopback or ip.is_link_local
            or ip.is_multicast or ip.is_reserved or ip.is_unspecified):
        return False
    return True


def _canonical_host(host):
    """Canonicalize a hostname for pin matching.

    requests/urllib3 connect using the IDNA (punycode) form of a host, while the
    guard pins the Unicode form from urlparse. Lowercasing, stripping a trailing
    dot, and IDNA-encoding both sides makes them compare equal, so the pin still
    applies under either spelling instead of falling back to live DNS. Non-string
    or un-encodable hosts fall back to the lowercased value.
    """
    if not isinstance(host, str):
        return host
    h = host.strip().rstrip(".").lower()
    try:
        return h.encode("idna").decode("ascii")
    except (UnicodeError, ValueError):
        return h


def resolve_and_validate(url):
    """Check ``url`` for SSRF safety and return the validated IP addresses.

    Returns an ``(ok, reason, ips)`` tuple. ``ok`` is True only when the URL is
    an http/https request whose host resolves exclusively to public IP
    addresses; ``ips`` is then the list of those validated addresses (a single
    entry for a literal-IP URL). On rejection ``ok`` is False, ``reason``
    explains why, and ``ips`` is an empty list.

    Callers pin the real connection to one of ``ips`` (see ``pinned_resolution``
    and ``chromium_host_resolver_rules``) so a low-TTL DNS record cannot rebind
    the host to a private address between this check and the fetch.
    """
    if not url or not isinstance(url, str):
        return False, "empty URL", []

    # urlparse and especially .hostname raise ValueError on malformed input
    # (e.g. an unterminated IPv6 bracket like "http://[::1"). Reject rather than
    # let the exception escape and crash the caller.
    try:
        parsed = urlparse(url.strip())
        host = parsed.hostname
    except ValueError:
        return False, "URL could not be parsed", []

    if parsed.scheme.lower() not in ALLOWED_SCHEMES:
        return (False,
                f"scheme '{parsed.scheme}' is not allowed (use http/https)",
                [])

    if not host:
        return False, "URL has no host", []

    # A literal IP address in the URL still has to be public.
    try:
        literal_ip = ipaddress.ip_address(host)
    except ValueError:
        literal_ip = None
    if literal_ip is not None:
        if not _is_public_address(str(literal_ip)):
            return False, f"host {host} is not a public address", []
        return True, "ok", [str(literal_ip)]

    # Hostname: resolve it and require every resolved address to be public.
    # Requiring all of them blocks a DNS result that mixes a public and a
    # private address to slip an internal target past the check.
    try:
        addresses = _addresses_for_host(host)
    except (socket.gaierror, UnicodeError):
        # gaierror: name does not resolve. UnicodeError: an invalid IDNA
        # hostname that the resolver cannot even encode. Either way it is
        # unfetchable, so reject instead of propagating.
        return False, f"host {host} could not be resolved", []

    if not addresses:
        return False, f"host {host} resolved to no addresses", []

    for addr in addresses:
        if not _is_public_address(addr):
            return (False,
                    f"host {host} resolves to a non-public address ({addr})",
                    [])

    return True, "ok", sorted(addresses)


def is_safe_public_url(url):
    """Check whether ``url`` is safe for the server to fetch.

    Returns an ``(ok, reason)`` tuple. ``ok`` is True only when the URL is an
    http/https request whose host resolves exclusively to public IP addresses.
    ``reason`` explains the rejection when ``ok`` is False. This is the
    boolean-only view of ``resolve_and_validate``; callers that need to pin the
    connection use that function instead.
    """
    ok, reason, _ips = resolve_and_validate(url)
    return ok, reason


@contextmanager
def pinned_resolution(host, ips):
    """Force ``host`` to resolve to exactly ``ips`` for the duration of the block.

    The scraper validates a URL's resolved IPs and then lets ``requests`` /
    urllib3 fetch it, which resolves DNS again - a window an attacker's low-TTL
    record can use to rebind ``host`` to a private address (DNS-rebinding
    TOCTOU). Wrapping the fetch in this context manager makes
    ``socket.getaddrinfo`` hand back the pre-validated ``ips`` for ``host``, so
    the connection lands on an address that was actually checked. Any other host
    resolves normally, and the original resolver is always restored on exit.

    The override is process-global for the duration of the block. The scraper
    fetch path processes one URL at a time (the one-shot submission processor),
    so a scoped global override is safe here; it is not meant for concurrent
    use.
    """
    original = socket.getaddrinfo
    pinned = [str(ip) for ip in ips]
    target = _canonical_host(host)

    def _patched(node, port, family=0, socktype=0, proto=0, flags=0):
        # Compare canonicalized hosts so the pin still matches when urllib3
        # connects using the punycode spelling of an IDN we pinned by its
        # Unicode name.
        if _canonical_host(node) != target or not pinned:
            return original(node, port, family, socktype, proto, flags)
        normalized_port = port if isinstance(port, int) else 0
        results = []
        for ip in pinned:
            addr = ipaddress.ip_address(ip)
            if addr.version == 6:
                if family not in (0, socket.AF_INET6):
                    continue
                results.append((socket.AF_INET6, socket.SOCK_STREAM,
                                socket.IPPROTO_TCP, "",
                                (ip, normalized_port, 0, 0)))
            else:
                if family not in (0, socket.AF_INET):
                    continue
                results.append((socket.AF_INET, socket.SOCK_STREAM,
                                socket.IPPROTO_TCP, "",
                                (ip, normalized_port)))
        if not results:
            # This is the pinned host but no validated address matches the
            # requested family. Fail closed: falling back to the live resolver
            # here would re-resolve this very host and reopen the DNS-rebinding
            # window the pin exists to close.
            raise socket.gaierror(
                socket.EAI_NONAME,
                "no pinned address for host in the requested family")
        return results

    socket.getaddrinfo = _patched
    try:
        yield
    finally:
        socket.getaddrinfo = original


def chromium_host_resolver_rules(host, ips):
    """Build Chromium ``--host-resolver-rules`` args that pin ``host`` to an IP.

    Chromium resolves DNS in its own process, so ``pinned_resolution`` (which
    patches this process's resolver) cannot reach it. Launching the browser with
    ``--host-resolver-rules=MAP <host> <ip>`` forces the main navigation to
    connect to the pre-validated address instead of re-resolving and possibly
    rebinding to a private host.

    Returns a single-element ``--host-resolver-rules`` arg list, or an empty
    list when there is nothing to pin (no host/ips, or a literal-IP URL whose
    host is already an address), so the caller can splat it into
    ``chromium.launch(args=...)``.
    """
    if not host or not ips:
        return []
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        return []  # host is already a literal IP; nothing to remap
    # resolve_and_validate sorts addresses lexicographically, which can place an
    # IPv6 address first. MAP takes a single target, so prefer a validated IPv4
    # address when one exists -- pinning to an IPv6-only MAP would break scraping
    # on IPv4-only runners even though the site is reachable over its A record.
    ipv4 = [ip for ip in ips if ":" not in str(ip)]
    chosen = ipv4[0] if ipv4 else ips[0]
    # Chromium connects to the IDNA/punycode spelling of an internationalized
    # domain, so the MAP rule has to name that same form or it silently fails to
    # apply -- reopening the rebinding window for IDN hosts. Canonicalize here for
    # parity with pinned_resolution, which pins the same canonical host.
    target = _canonical_host(host)
    return [f"--host-resolver-rules=MAP {target} {chosen}"]
