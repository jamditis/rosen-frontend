# -*- coding: utf-8 -*-
"""
This module is responsible for generating formatted PDF documents from article data.
It uses the reportlab library to create a structured and readable PDF layout,
including metadata, excerpts, and the main article text.
"""

from typing import Optional, Dict, Any
import os
import re
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT

# Import the enhanced formatter
try:
    from rosen_scraper.enhanced_pdf_formatter import EnhancedPDFFormatter
    ENHANCED_FORMATTER_AVAILABLE = True
except ImportError:
    ENHANCED_FORMATTER_AVAILABLE = False

def create_article_pdf(article_data: Dict[str, Any], output_dir: str = "processed_pdf_library") -> Optional[str]:
    """
    Creates a clean PDF from structured article data with a specific filename
    format and internal layout.

    Args:
        article_data (dict): A dictionary containing all the necessary article
                             information, such as title, author, text, etc.
        output_dir (str): The directory where the generated PDF will be saved.
                          Defaults to "processed_pdf_library".

    Returns:
        str: The full file path of the newly created PDF, or None if an
             error occurred.
    """
    # Use enhanced formatter if available
    if ENHANCED_FORMATTER_AVAILABLE:
        try:
            formatter = EnhancedPDFFormatter()
            return formatter.create_formatted_pdf(article_data, output_dir)
        except Exception as e:
            print(f"  [PDF] Enhanced formatter failed, falling back to basic: {e}")

    # Fallback to basic PDF generation
    # --- 1. Prepare Data and Filename ---
    # Extract metadata from the article data dictionary, providing default values.
    title = article_data.get('title', 'Untitled Article') or 'Untitled Article'
    item_id = article_data.get('id', 'NO-ID')
    doc_format = article_data.get('format', 'text')

    # Sanitize the title to create a valid filename by removing illegal characters.
    sanitized_title = re.sub(r'[\\/*?:"<>|]',"", title)
    if not sanitized_title:
        sanitized_title = "Untitled Article"

    # Construct the final PDF filename using the sanitized title and other metadata.
    pdf_filename = f"{sanitized_title[:60]} - {item_id} - {doc_format}.pdf"

    # Ensure the output directory exists before saving the file.
    os.makedirs(output_dir, exist_ok=True)
    pdf_filepath = os.path.join(output_dir, pdf_filename)

    # --- 2. Build PDF Content ---
    try:
        # Initialize the PDF document template with the specified file path.
        doc = SimpleDocTemplate(pdf_filepath)
        # Get a sample stylesheet to use as a base for styling.
        styles = getSampleStyleSheet()
        
        # --- 2a. Custom Styles ---
        # Create and register custom paragraph styles for metadata and tags.
        styles.add(ParagraphStyle(name='Meta', parent=styles['Normal'], alignment=TA_CENTER, fontName='Helvetica-Oblique'))
        styles.add(ParagraphStyle(name='Tags', parent=styles['Normal'], alignment=TA_CENTER, fontName='Helvetica-Bold'))

        # The 'story' will hold all the elements (paragraphs, spacers, etc.) of the PDF.
        story = []

        # --- 2b. Add PDF Elements ---
        # Add the main title, centered.
        title_style = styles['h1']
        title_style.alignment = TA_CENTER
        story.append(Paragraph(title, title_style))
        story.append(Spacer(1, 0.2 * inch))

        # Add a metadata line with author, publication, and date.
        meta_parts = [
            article_data.get('author', 'Author Not Found'),
            article_data.get('original_publication', 'Publication Not Found'),
            article_data.get('publication_date', 'Date Not Found')
        ]
        story.append(Paragraph(" | ".join(filter(None, meta_parts)), styles['Meta']))
        story.append(Spacer(1, 0.2 * inch))

        # Add the excerpt if it exists, styled in italics.
        excerpt = article_data.get('excerpt')
        if excerpt:
            story.append(Paragraph(f'"{excerpt}"', styles['Italic']))
            story.append(Spacer(1, 0.1 * inch))

        # Add the tags if they exist, styled in bold.
        tags = article_data.get('tags')
        if tags and isinstance(tags, list):
            story.append(Paragraph(f"Tags: {', '.join(tags)}", styles['Tags']))
            story.append(Spacer(1, 0.2 * inch))

        # Add a horizontal rule as a visual separator.
        story.append(HRFlowable(width="80%", thickness=1, color='grey'))
        story.append(Spacer(1, 0.3 * inch))

        # --- 2c. Add Body Content ---
        # Set up the style for the main body text.
        body_style = styles['BodyText']
        body_style.alignment = TA_LEFT
        text_content = article_data.get('raw_text') or article_data.get('text', 'Article text could not be extracted.')
        
        # Split the body text into paragraphs and add them to the story.
        # This preserves paragraph breaks from the original text.
        text_paragraphs = text_content.split('\n')
        for para_text in text_paragraphs:
            if para_text.strip(): # Avoid adding empty paragraphs
                story.append(Paragraph(para_text.strip(), body_style))
                story.append(Spacer(1, 0.1 * inch))

        # Build the PDF document from the story elements.
        doc.build(story)
        print(f"  [PDF] Successfully created PDF: {pdf_filepath}")
        return pdf_filepath

    except Exception as e:
        # Catch any errors during PDF generation and report them.
        print(f"  [PDF] ERROR: Could not create PDF for '{title}'. Reason: {e}")
        return None
