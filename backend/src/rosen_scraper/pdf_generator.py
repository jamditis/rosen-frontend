# -*- coding: utf-8 -*-
"""
Generates formatted PDF documents from article data.

`create_article_pdf` is a thin delegator to `EnhancedPDFFormatter`, kept as the
stable entry point that `workflow.py` and `scripts/pdf/regenerate_pdfs.py` call.
The enhanced formatter owns the styled layout; this wrapper preserves the
function name and its (path-or-None) contract.
"""

from typing import Optional, Dict, Any

from rosen_scraper.enhanced_pdf_formatter import EnhancedPDFFormatter


def create_article_pdf(article_data: Dict[str, Any], output_dir: str = "processed_pdf_library") -> Optional[str]:
    """
    Create a formatted PDF from structured article data.

    Delegates to EnhancedPDFFormatter, which builds the styled layout and
    returns the output path (or None on failure).

    Args:
        article_data (dict): Article information (title, author, text, etc.).
        output_dir (str): Directory where the PDF is written.

    Returns:
        str: The path of the created PDF, or None if generation failed.
    """
    try:
        return EnhancedPDFFormatter().create_formatted_pdf(article_data, output_dir)
    except Exception as e:
        print(f"  [PDF] ERROR: Could not create PDF: {e}")
        return None
