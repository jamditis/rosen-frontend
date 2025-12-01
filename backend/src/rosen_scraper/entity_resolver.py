# -*- coding: utf-8 -*-
"""
This module resolves entities against a known list of publications and platforms.
"""

from typing import Optional, Dict, Any
import json
import os
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

def resolve_publication(publication: str, url: str, known_entities: Optional[Dict[str, Any]]) -> str:
    """
    Resolves the publication name against a list of known entities.
    """
    if not publication or not known_entities:
        return publication

    domain = urlparse(url).netloc
    
    for entity in known_entities.get('publications', []):
        for alias in entity.get('aliases', []):
            if alias in domain:
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
            if alias in domain:
                return entity.get('correct_name')

    return None
