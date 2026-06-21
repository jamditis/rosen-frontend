# -*- coding: utf-8 -*-
"""Shared entity normalization and type-prefix mapping.

Single source of truth for two things that were previously copy-pasted and
at risk of silent drift:

- ``normalize_entity_name`` — the canonical dedup-key normalizer used by
  ``entity_registry`` and ``entity_deduplicator``. Drift here changes which
  entities merge and which ids get reused, so the two modules kept identical
  copies "to ensure consistency"; this makes that consistency structural.
- ``ENTITY_TYPE_PREFIXES`` — the entity-type to id-prefix map.

Note: ``entity_csv_writer.normalize_name`` is intentionally NOT consolidated
here. It is a different function — it un-escapes CSV formula values and keeps
punctuation because it is the on-disk CSV dedup key — and merging it would
change id allocation.
"""

import re

# Entity type -> canonical id prefix. Call sites that may see an unknown type
# use ``.get(type, "X")``; sites that require a known type index it directly.
# Both behaviors are preserved at the call sites — do not bake a fallback in
# here.
ENTITY_TYPE_PREFIXES = {
    "Person": "P",
    "Organization": "O",
    "Work": "W",
    "Concept": "C",
    "Event": "E",
    "Location": "L",
}

# Organization-name abbreviations expanded before matching.
_ORG_ABBREVIATIONS = {
    "nyt": "new york times",
    "wapo": "washington post",
    "nyu": "new york university",
    "npr": "national public radio",
    "pbs": "public broadcasting service",
    "cnn": "cable news network",
    "bbc": "british broadcasting corporation",
    "ap": "associated press",
    "wsj": "wall street journal",
}


def normalize_entity_name(name: str, entity_type: str) -> str:
    """Normalize an entity name for dedup matching.

    Lowercase, strip a leading article (the/a/an), drop punctuation, and
    collapse whitespace. Organization names matching a known abbreviation are
    expanded to their full form.
    """
    if not name:
        return ""

    normalized = name.lower().strip()

    # Remove common articles at the start
    normalized = re.sub(r"^(the|a|an)\s+", "", normalized)

    # Remove punctuation but keep spaces
    normalized = re.sub(r"[^\w\s]", "", normalized)

    # Collapse multiple spaces
    normalized = re.sub(r"\s+", " ", normalized).strip()

    # Handle common abbreviations (organization specific)
    if entity_type == "Organization" and normalized in _ORG_ABBREVIATIONS:
        normalized = _ORG_ABBREVIATIONS[normalized]

    return normalized
