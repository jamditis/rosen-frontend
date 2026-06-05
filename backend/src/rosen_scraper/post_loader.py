"""Shared social-post loading and prioritization for the CSV entity extractors.

`extract_entities_full_parallel.py` and `extract_entities_csv_batch.py` each
carried a byte-identical copy of `load_social_posts` and a copy of
`prioritize_posts` that differed only in the `max_posts` default (10000 vs 300).
Both scripts already pass `max_posts` explicitly at their call sites, so the
defaults were dead and the duplication was pure drift risk. This module is the
single source for both helpers (issue #188, step 3 of the cluster
reconciliation).

Note on naming: `scripts/generate_thread_records.py` and
`scripts/analyze_extraction_errors.py` define their own
`load_social_posts(csv_path)` that returns a `Dict[str, Dict]` keyed by post id,
and `scripts/unified_entity_processor.py` has class methods of the same names.
Those are different functions with different return shapes -- they are
intentionally NOT consolidated here. This module owns only the `List[Dict]`
filter/prioritize pair shared by the two CSV extractors.
"""

import csv
from pathlib import Path
from typing import Dict, List


def load_social_posts(csv_path: Path, min_words: int = 7) -> List[Dict]:
    """Load social posts from CSV, filtering out short or empty content.

    Drops rows whose `word_count` is below `min_words` or whose stripped
    `raw_text` is empty or shorter than 20 characters.
    """
    posts = []

    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            word_count = int(row.get('word_count', 0) or 0)
            if word_count < min_words:
                continue

            content = row.get('raw_text', '').strip()
            if not content or len(content) < 20:
                continue

            posts.append(row)

    return posts


def prioritize_posts(posts: List[Dict], max_posts: int) -> List[Dict]:
    """Return the top `max_posts` posts scored by engagement, recency, and length.

    When `len(posts) <= max_posts` the input is returned unchanged (no scoring).
    `max_posts` is required on purpose: the two callers want different caps
    (the parallel run takes ~10k, the CSV batch a few hundred), and a shared
    default would silently re-create the divergence this consolidation removed.
    """
    if len(posts) <= max_posts:
        return posts

    scored_posts = []
    for post in posts:
        score = 0

        # Engagement
        likes = int(post.get('likes', 0) or 0)
        reposts = int(post.get('reposts', 0) or 0)
        score += min(likes + (reposts * 2), 100)

        # Recency
        try:
            year = int(post.get('publication_date', '')[:4])
            if year >= 2023:
                score += 50
            elif year >= 2020:
                score += 25
        except (ValueError, IndexError):
            pass

        # Length
        word_count = int(post.get('word_count', 0) or 0)
        if word_count > 100:
            score += 25
        elif word_count > 50:
            score += 15
        elif word_count > 20:
            score += 5

        scored_posts.append((score, post))

    scored_posts.sort(key=lambda x: x[0], reverse=True)
    return [post for score, post in scored_posts[:max_posts]]
