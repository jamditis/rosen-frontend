"""Tests for the shared CSV post loader/prioritizer (issue #188, step 3).

These pin the behavior that `extract_entities_full_parallel.py` and
`extract_entities_csv_batch.py` previously each carried as a private copy, so
the consolidation into `rosen_scraper.post_loader` is provably no-regression.
"""

import csv
import inspect

import pytest

from rosen_scraper.post_loader import load_social_posts, prioritize_posts


def _write_csv(path, rows, fieldnames):
    with open(path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


FIELDNAMES = ['id', 'word_count', 'raw_text', 'likes', 'reposts', 'publication_date']


def _post(**overrides):
    base = {
        'id': 'BSKY-0001',
        'word_count': '50',
        'raw_text': 'x' * 40,
        'likes': '0',
        'reposts': '0',
        'publication_date': '2024-01-01',
    }
    base.update(overrides)
    return base


# --- load_social_posts ----------------------------------------------------

def test_load_keeps_qualifying_rows(tmp_path):
    csv_path = tmp_path / 'posts.csv'
    _write_csv(csv_path, [_post(id='BSKY-0001'), _post(id='BSKY-0002')], FIELDNAMES)

    posts = load_social_posts(csv_path)

    assert [p['id'] for p in posts] == ['BSKY-0001', 'BSKY-0002']


def test_load_drops_rows_below_min_words(tmp_path):
    csv_path = tmp_path / 'posts.csv'
    _write_csv(csv_path, [
        _post(id='keep', word_count='7'),
        _post(id='drop', word_count='6'),
    ], FIELDNAMES)

    posts = load_social_posts(csv_path)

    assert [p['id'] for p in posts] == ['keep']


def test_load_min_words_is_configurable(tmp_path):
    csv_path = tmp_path / 'posts.csv'
    _write_csv(csv_path, [_post(id='only', word_count='10')], FIELDNAMES)

    assert load_social_posts(csv_path, min_words=20) == []
    assert len(load_social_posts(csv_path, min_words=10)) == 1


def test_load_drops_short_or_empty_content(tmp_path):
    csv_path = tmp_path / 'posts.csv'
    _write_csv(csv_path, [
        _post(id='too-short', raw_text='x' * 19),
        _post(id='exactly-20', raw_text='x' * 20),
        _post(id='whitespace', raw_text='   '),
        _post(id='empty', raw_text=''),
    ], FIELDNAMES)

    posts = load_social_posts(csv_path)

    # 19 chars dropped (floor is < 20), 20 chars kept, blank/empty dropped.
    assert [p['id'] for p in posts] == ['exactly-20']


def test_load_treats_blank_word_count_as_zero(tmp_path):
    csv_path = tmp_path / 'posts.csv'
    _write_csv(csv_path, [_post(id='blank', word_count='')], FIELDNAMES)

    # Blank word_count -> 0 -> below default min_words, so dropped (no crash).
    assert load_social_posts(csv_path) == []


# --- prioritize_posts -----------------------------------------------------

def test_prioritize_passes_through_when_under_cap():
    posts = [_post(id='a'), _post(id='b')]

    result = prioritize_posts(posts, max_posts=10)

    # Identity passthrough, no scoring/reordering when len <= max_posts.
    assert result is posts


def test_prioritize_truncates_to_max_posts():
    posts = [_post(id=str(i), likes=str(i)) for i in range(5)]

    result = prioritize_posts(posts, max_posts=2)

    assert len(result) == 2


def test_prioritize_orders_by_descending_score():
    low = _post(id='low', likes='0', reposts='0', word_count='10', publication_date='2010-01-01')
    high = _post(id='high', likes='100', reposts='50', word_count='200', publication_date='2024-01-01')
    mid = _post(id='mid', likes='10', reposts='0', word_count='60', publication_date='2021-01-01')

    result = prioritize_posts([low, high, mid], max_posts=2)

    # high (engagement capped 100 + recency 50 + length 25) beats mid beats low.
    assert [p['id'] for p in result] == ['high', 'mid']


def test_prioritize_handles_malformed_recency_year():
    # A non-numeric publication_date must not crash; it scores 0 recency.
    bad = _post(id='bad', publication_date='n/a', likes='0', word_count='10')
    good = _post(id='good', publication_date='2024-01-01', likes='0', word_count='10')

    result = prioritize_posts([bad, good], max_posts=1)

    assert [p['id'] for p in result] == ['good']


def test_prioritize_requires_max_posts():
    # max_posts is intentionally required: a default would let the two callers'
    # caps silently re-diverge (issue #188). Omitting it must raise.
    with pytest.raises(TypeError):
        prioritize_posts([_post()])  # type: ignore[call-arg]

    sig = inspect.signature(prioritize_posts)
    assert sig.parameters['max_posts'].default is inspect.Parameter.empty
