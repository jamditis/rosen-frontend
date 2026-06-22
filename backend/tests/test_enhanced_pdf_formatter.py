"""Characterization tests for EnhancedPDFFormatter inline formatting.

These lock the observable behavior of `_apply_inline_formatting` so the #492
cleanup stays behavior-preserving: it removes two no-op quote-replace lines
(straight->straight, proven not to touch curly quotes) and the unused
module-level `create_article_pdf` convenience function. The emphasis-regex
behavior these lines sit beside must not change.
"""
from rosen_scraper.enhanced_pdf_formatter import EnhancedPDFFormatter


def test_inline_formatting_converts_markdown_emphasis():
    formatter = EnhancedPDFFormatter()
    out = formatter._apply_inline_formatting("**bold** and *italic* and _under_")
    assert out == "<b>bold</b> and <i>italic</i> and <i>under</i>"


def test_inline_formatting_leaves_quotes_untouched():
    """The removed replace() lines were no-ops: straight quotes stay straight
    and curly quotes are not normalized to straight."""
    formatter = EnhancedPDFFormatter()
    assert formatter._apply_inline_formatting('straight "x" and \'y\'') == 'straight "x" and \'y\''
    assert formatter._apply_inline_formatting('curly “x” and ‘y’') == 'curly “x” and ‘y’'
