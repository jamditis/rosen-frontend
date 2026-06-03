# -*- coding: utf-8 -*-
"""Boundary-matching tests for entity_resolver.

resolve_publication / resolve_platform used to match an alias with
``alias in domain`` (substring), so a host that merely embedded the token —
``notpressthink.org``, ``pressthink.example.com`` — was misresolved to the
wrong entity. Submission URLs are operator-influenceable (and self-serve in
Phase 3), so the resolver matches on DNS-label boundaries instead. These tests
pin that: real hosts still resolve, look-alike hosts do not.
"""
from rosen_scraper import entity_resolver

KNOWN = {
    'publications': [
        {'correct_name': 'PressThink', 'aliases': ['pressthink']},
        {'correct_name': 'Columbia Journalism Review', 'aliases': ['cjr.org']},
        {'correct_name': 'NYU Journalism', 'aliases': ['journalism.nyu.edu']},
    ],
    'platforms': [
        {'correct_name': 'Medium', 'aliases': ['medium.com']},
        {'correct_name': 'YouTube', 'aliases': ['youtube.com', 'youtu.be']},
    ],
}


# ---------- resolve_publication: bare-label alias --------------------------

def test_bare_alias_matches_exact_registrable_domain():
    assert entity_resolver.resolve_publication(
        'AI guess', 'https://pressthink.org/2026/x', KNOWN) == 'PressThink'


def test_bare_alias_matches_subdomain():
    assert entity_resolver.resolve_publication(
        'AI guess', 'https://www.pressthink.org/x', KNOWN) == 'PressThink'


def test_bare_alias_does_not_match_lookalike_prefix():
    # notpressthink.org embeds 'pressthink' but is a different domain.
    assert entity_resolver.resolve_publication(
        'Some Blog', 'https://notpressthink.org/x', KNOWN) == 'Some Blog'


def test_bare_alias_does_not_match_token_as_other_domain_subdomain():
    # pressthink.example.com is a subdomain of example.com, not PressThink.
    assert entity_resolver.resolve_publication(
        'Some Blog', 'https://pressthink.example.com/x', KNOWN) == 'Some Blog'


# ---------- resolve_publication: full-domain alias -------------------------

def test_full_domain_alias_matches_host_and_subdomain():
    assert entity_resolver.resolve_publication(
        'AI guess', 'https://cjr.org/x', KNOWN) == 'Columbia Journalism Review'
    assert entity_resolver.resolve_publication(
        'AI guess', 'https://www.cjr.org/x', KNOWN
    ) == 'Columbia Journalism Review'


def test_full_domain_alias_rejects_suffix_spoof():
    # cjr.org.evil.com must not resolve to CJR.
    assert entity_resolver.resolve_publication(
        'Some Blog', 'https://cjr.org.evil.com/x', KNOWN) == 'Some Blog'


def test_multi_label_full_domain_alias_matches():
    assert entity_resolver.resolve_publication(
        'AI guess', 'https://journalism.nyu.edu/x', KNOWN) == 'NYU Journalism'


# ---------- resolve_publication: invariants --------------------------------

def test_no_match_returns_original_publication():
    assert entity_resolver.resolve_publication(
        'Original', 'https://example.com/x', KNOWN) == 'Original'


def test_empty_known_entities_is_noop():
    assert entity_resolver.resolve_publication(
        'Original', 'https://pressthink.org/x', None) == 'Original'


# ---------- resolve_platform (same matcher, separate entry point) ----------

def test_platform_full_domain_matches_subdomain():
    assert entity_resolver.resolve_platform(
        'https://www.medium.com/@jay/x', KNOWN) == 'Medium'


def test_platform_rejects_lookalike_and_suffix_spoof():
    assert entity_resolver.resolve_platform(
        'https://notmedium.com/x', KNOWN) is None
    assert entity_resolver.resolve_platform(
        'https://medium.com.evil.com/x', KNOWN) is None


def test_platform_short_alias_matches_exact_host():
    assert entity_resolver.resolve_platform(
        'https://youtu.be/abc123', KNOWN) == 'YouTube'
