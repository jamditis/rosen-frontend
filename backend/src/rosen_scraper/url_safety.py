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
"""

import ipaddress
import socket
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


def is_safe_public_url(url):
    """Check whether ``url`` is safe for the server to fetch.

    Returns an ``(ok, reason)`` tuple. ``ok`` is True only when the URL is an
    http/https request whose host resolves exclusively to public IP addresses.
    ``reason`` explains the rejection when ``ok`` is False.
    """
    if not url or not isinstance(url, str):
        return False, "empty URL"

    parsed = urlparse(url.strip())

    if parsed.scheme.lower() not in ALLOWED_SCHEMES:
        return False, f"scheme '{parsed.scheme}' is not allowed (use http/https)"

    host = parsed.hostname
    if not host:
        return False, "URL has no host"

    # A literal IP address in the URL still has to be public.
    try:
        literal_ip = ipaddress.ip_address(host)
    except ValueError:
        literal_ip = None
    if literal_ip is not None:
        if not _is_public_address(str(literal_ip)):
            return False, f"host {host} is not a public address"
        return True, "ok"

    # Hostname: resolve it and require every resolved address to be public.
    # Requiring all of them blocks a DNS result that mixes a public and a
    # private address to slip an internal target past the check.
    try:
        addresses = _addresses_for_host(host)
    except socket.gaierror:
        return False, f"host {host} could not be resolved"

    if not addresses:
        return False, f"host {host} resolved to no addresses"

    for addr in addresses:
        if not _is_public_address(addr):
            return False, f"host {host} resolves to a non-public address ({addr})"

    return True, "ok"
