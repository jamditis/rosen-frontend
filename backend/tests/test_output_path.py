"""Filename characterization tests for the PDF and transcript writers (#492).

These pin the exact output filenames produced by save_transcript and
create_article_pdf across the tricky cases (illegal chars, empty/None title,
over-length title) before the shared build_output_path helper is extracted,
so the extraction is provably byte-identical. The direct build_output_path
unit tests at the bottom run once the helper exists.
"""
import os

from rosen_scraper.transcript_saver import save_transcript
from rosen_scraper import pdf_generator


def _basename(path):
    assert path is not None
    return os.path.basename(path)


def test_transcript_filenames(tmp_path):
    out = str(tmp_path)
    cases = [
        ({"title": "Hello World", "id": "REC-1"}, "Hello World - REC-1 - transcript.txt"),
        ({"title": 'a:b/c*d?e"f<g>h|i\\j', "id": "REC-1"}, "abcdefghij - REC-1 - transcript.txt"),
        ({"title": None, "id": "REC-1"}, "Untitled Transcript - REC-1 - transcript.txt"),
        ({"title": "*?:", "id": "REC-1"}, "Untitled Transcript - REC-1 - transcript.txt"),
        ({"title": "A" * 70, "id": "REC-1"}, "A" * 60 + " - REC-1 - transcript.txt"),
    ]
    for article, expected in cases:
        assert _basename(save_transcript(article, output_dir=out)) == expected, article


def test_pdf_filenames(tmp_path):
    out = str(tmp_path)
    cases = [
        ({"title": "Hello World", "id": "REC-1", "format": "text"}, "Hello World - REC-1 - text.pdf"),
        ({"title": 'a:b/c*d', "id": "REC-2", "format": "audio"}, "abcd - REC-2 - audio.pdf"),
        ({"title": "*?:", "id": "REC-3", "format": "text"}, "Untitled Article - REC-3 - text.pdf"),
    ]
    for article, expected in cases:
        assert _basename(pdf_generator.create_article_pdf(article, output_dir=out)) == expected, article


def test_build_output_path_directly(tmp_path):
    from rosen_scraper.path_utils import build_output_path

    out = str(tmp_path)
    # normal
    p = build_output_path("Hello", "REC-1", "text.pdf", out, "Untitled")
    assert _basename(p) == "Hello - REC-1 - text.pdf"
    # illegal chars stripped
    p = build_output_path('a/b:c', "REC-1", "transcript.txt", out, "Untitled")
    assert _basename(p) == "abc - REC-1 - transcript.txt"
    # sanitizes to empty -> default
    p = build_output_path('*?:', "REC-1", "text.pdf", out, "Fallback")
    assert _basename(p) == "Fallback - REC-1 - text.pdf"
    # truncates title to 60 chars
    p = build_output_path("Z" * 80, "REC-1", "text.pdf", out, "Untitled")
    assert _basename(p) == "Z" * 60 + " - REC-1 - text.pdf"
    # creates the output directory
    nested = tmp_path / "made" / "here"
    build_output_path("x", "REC-1", "text.pdf", str(nested), "Untitled")
    assert nested.is_dir()
