# -*- coding: utf-8 -*-
"""Tests for processor.process_single_url — verified-field default.

Regression test for #160. Before the fix, process_single_url forced
``verified=True`` on every record on the theory that "Jay submitted it."
The submission server's auth is a shared token (see issue #136) so the
constant misrepresented who submitted the row and what review it received.

Records coming through the submission server should default to the
CSV-style string ``'FALSE'`` (which is what ``generate_review_report.py``
reads — see ``archive_record_reviewer.validate_verification``) and be
flipped to ``'TRUE'`` only by an actual curator review.
"""
from __future__ import annotations

import pathlib
import sys

import pytest

_BACKEND = pathlib.Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

pytest.importorskip("flask")  # processor imports submission_server.app indirectly

from submission_server import processor  # noqa: E402


def _patch_pipeline(monkeypatch, scraped):
    """Stub the scraper + enricher so the test only exercises process_single_url.

    The ``enrich_data`` stub mirrors the real contract in
    ``rosen_scraper.workflow.enrich_data``: ``setdefault('verified', False)``
    and ``setdefault('notes', "")``. Anything in the final dict beyond those
    defaults came from ``process_single_url`` itself (not the upstream
    pipeline) — that's what we want this test to lock down."""
    monkeypatch.setattr(processor.dispatcher, 'dispatch_url',
                        lambda url, schema: dict(scraped))
    monkeypatch.setattr(processor.entity_resolver, 'resolve_publication',
                        lambda *args, **kwargs: scraped.get('original_publication', ''))

    def _fake_enrich(data, url, known_entities):
        data.setdefault('verified', False)
        data.setdefault('notes', "")
        return data

    monkeypatch.setattr(processor, 'enrich_data', _fake_enrich)
    monkeypatch.setattr(processor, 'generate_source_based_id',
                        lambda publication, existing_ids: 'TEST-00001')


def test_process_single_url_defaults_verified_to_false(monkeypatch):
    """A submission-server record is unverified until a curator reviews it.

    Hardcoding ``verified=True`` (the pre-fix behavior) made the field
    meaningless as a data-quality signal because the submission server has
    no proof of submitter identity and no review gate.
    """
    _patch_pipeline(monkeypatch, scraped={
        'title': 'Test article',
        'original_publication': 'PressThink',
    })

    result = processor.process_single_url(
        url='https://example.com/article',
        schema={},
        known_entities={},
        existing_ids=set(),
    )

    assert result is not None, 'process_single_url returned None'
    assert result['verified'] == 'FALSE', (
        "submission-server records must default to verified='FALSE' (#160) — "
        'a curator review flips this to TRUE, not the submission path. The '
        'string form matches the CSV convention generate_review_report.py reads.'
    )


def test_process_single_url_preserves_submission_notes(monkeypatch):
    """The 'Submitted via web form' note is part of the audit trail.

    Even though ``verified`` defaults to False, the note still records the
    record's origin so a curator can tell where it came from. This guards
    against an over-eager refactor that drops both lines together.
    """
    _patch_pipeline(monkeypatch, scraped={
        'title': 'Test article',
        'original_publication': 'PressThink',
    })

    result = processor.process_single_url(
        url='https://example.com/article',
        schema={},
        known_entities={},
        existing_ids=set(),
    )

    assert result['notes'] == 'Submitted via web form'
