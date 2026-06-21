"""Characterization test for pdf_generator.create_article_pdf.

Locks the delegator's contract for #492: given valid article data it returns
the path to a created .pdf and the file exists. This held before the basic-
fallback removal (the enhanced formatter was already the code path taken) and
must hold after.
"""
import os

from rosen_scraper import pdf_generator


def test_create_article_pdf_returns_existing_pdf_path(tmp_path):
    article = {
        "title": "Test Article",
        "id": "RECORD-00001",
        "format": "text",
        "author": "Jay Rosen",
        "original_publication": "PressThink",
        "publication_date": "2024-01-01",
        "raw_text": "First paragraph.\n\nSecond paragraph.",
    }
    out = pdf_generator.create_article_pdf(article, output_dir=str(tmp_path))
    assert out is not None
    assert out.endswith(".pdf")
    assert os.path.exists(out)
