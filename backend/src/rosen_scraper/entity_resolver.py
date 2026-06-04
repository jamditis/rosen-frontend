# -*- coding: utf-8 -*-
"""
This module resolves entities against a known list of publications and platforms.
"""

from typing import Optional, Dict, Any
import json
from urllib.parse import urlparse

def load_known_entities(schema_file: str) -> Optional[Dict[str, Any]]:
    """
    Loads the known entities from the specified JSON file.
    """
    try:
        with open(schema_file, 'r', encoding='utf-8-sig') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Could not load known entities. Error: {e}")
        return None

def _host_matches_alias(host: str, alias: str) -> bool:
    """True when ``alias`` identifies ``host`` on a DNS-label boundary.

    Avoids the substring trap where ``alias in host`` lets ``notpressthink.org``
    or ``pressthink.example.com`` resolve to the ``pressthink`` entity. A
    full-domain alias (one containing a dot, e.g. ``cjr.org``) matches the host
    or any subdomain of it; a bare-label alias (e.g. ``pressthink``) matches
    only the host's second-level label, so it won't match a different
    registrable domain that merely embeds the token.
    """
    host = (host or '').lower().split(':', 1)[0].rstrip('.')
    alias = (alias or '').lower().strip()
    if not host or not alias:
        return False
    if '.' in alias:
        return host == alias or host.endswith('.' + alias)
    labels = host.split('.')
    return len(labels) >= 2 and labels[-2] == alias


def resolve_publication(publication: str, url: str, known_entities: Optional[Dict[str, Any]]) -> str:
    """
    Resolves the publication name against a list of known entities.
    """
    if not publication or not known_entities:
        return publication

    domain = urlparse(url).netloc

    for entity in known_entities.get('publications', []):
        for alias in entity.get('aliases', []):
            if _host_matches_alias(domain, alias):
                return entity.get('correct_name')

    return publication

def resolve_platform(url: str, known_entities: Optional[Dict[str, Any]]) -> Optional[str]:
    """
    Resolves the platform name against a list of known entities.
    """
    if not known_entities:
        return None

    domain = urlparse(url).netloc

    for entity in known_entities.get('platforms', []):
        for alias in entity.get('aliases', []):
            if _host_matches_alias(domain, alias):
                return entity.get('correct_name')

    return None
