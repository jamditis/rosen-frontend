# -*- coding: utf-8 -*-
"""Boundary-matching tests for entity_resolver.

resolve_publication / resolve_platform used to match an alias with
``alias in domain`` (substring), so a host that merely embedded the token —
``notpressthink.org``, ``pressthink.example.com`` — was misresolved to the
wrong entity. Submission URLs are operator-influenceable (and self-serve in
Phase 3), so the resolver matches on DNS-label boundaries instead. These tests
pin that: real hosts still resolve, look-alike hosts do not.
"""
import os

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


# ---------- #355: shipped known_entities.json carries full domains ----------
#
# A bare-label alias matched its second-level DNS label on ANY TLD, so a
# look-alike (pressthink.co) resolved to the trusted publication, and the two
# WordPress-hosted pubs (second-level label "wordpress") stopped resolving. The
# fix converts every shipped alias to a full registrable domain. These load the
# REAL data file so they pin the data, not just the matcher.

_REAL_ENTITIES_PATH = os.path.join(
    os.path.dirname(__file__), '..', 'known_entities.json')


def _real_entities():
    # load_known_entities returns None on a load/parse failure, and
    # resolve_publication(..., None) is a no-op — without this assert the
    # negative tests below would pass for the wrong reason if the file broke.
    known = entity_resolver.load_known_entities(_REAL_ENTITIES_PATH)
    assert known is not None, 'known_entities.json failed to load'
    return known


def test_real_data_has_no_bare_label_aliases():
    # Every shipped alias is a full domain (contains a dot); a bare label would
    # re-open the cross-TLD match in #355.
    known = _real_entities()
    bare = [
        (e['correct_name'], a)
        for section in ('publications', 'platforms')
        for e in known[section]
        for a in e['aliases']
        if '.' not in a
    ]
    assert bare == [], f'bare-label aliases remain: {bare}'


def test_real_data_cross_tld_lookalike_does_not_resolve():
    # pressthink.co / huffpost.net are different registrable domains; with full
    # domains they must not resolve to the trusted publication (#355 gap 1).
    known = _real_entities()
    assert entity_resolver.resolve_publication(
        'Some Blog', 'https://pressthink.co/x', known) == 'Some Blog'
    assert entity_resolver.resolve_publication(
        'Some Blog', 'https://huffpost.net/x', known) == 'Some Blog'


def test_real_data_wordpress_hosted_pubs_resolve():
    # publicnotebook / rebootnews live under *.wordpress.com, where the bare
    # aliases stopped resolving (second-level label is "wordpress"). The full
    # hosts fix it (#355 gap 2).
    known = _real_entities()
    assert entity_resolver.resolve_publication(
        'AI guess', 'https://publicnotebook.wordpress.com/2010/x', known
    ) == 'Public Notebook'
    assert entity_resolver.resolve_publication(
        'AI guess', 'https://rebootnews.wordpress.com/x', known
    ) == 'Rebooting the News'


def test_real_data_other_wordpress_blog_does_not_resolve():
    # A different *.wordpress.com blog must not collide with the two we name.
    known = _real_entities()
    assert entity_resolver.resolve_publication(
        'Some Blog', 'https://someoneelse.wordpress.com/x', known) == 'Some Blog'


def test_real_data_converted_aliases_still_resolve_real_hosts():
    # The conversion must not break the happy path: real publication hosts and
    # subdomains still normalize, including the legacy huffingtonpost.com host.
    known = _real_entities()
    cases = {
        'https://pressthink.org/x': 'PressThink',
        'https://www.nytimes.com/x': 'The New York Times',
        'https://www.wnycstudios.org/x': 'WNYC',
        'https://www.huffingtonpost.com/x': 'HuffPost',
    }
    for url, name in cases.items():
        assert entity_resolver.resolve_publication('AI guess', url, known) == name
