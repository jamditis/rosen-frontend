# -*- coding: utf-8 -*-
"""
Enhanced PDF generator that creates clean, accessible PDFs from test_runs spreadsheet data.
Layout follows the specified format:
- Title (H1)
- Author | Publication Date | Original Publication (H3)
- URL (italic)
- Pull Quote (H4)
- Horizontal Divider
- Raw Text (body paragraphs)
"""

import os
import re
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.colors import black, grey
from reportlab.lib.pagesizes import letter

def create_enhanced_pdf(record_data, output_dir="enhanced_pdf_library"):
    """
    Creates a clean, accessible PDF from test_runs record data following the specified layout.
    
    Layout Structure:
    1. Title (H1)
    2. [Line break]
    3. Author (H3) | Publication Date (H3) | Original Publication (H3)
    4. [Line break] 
    5. URL (italic)
    6. [Line break]
    7. Pull Quote (H4)
    8. [Line break]
    9. Horizontal Divider
    10. [Line break]
    11. Raw Text (body paragraphs)
    
    Args:
        record_data (dict): Dictionary containing record data from test_runs sheet
        output_dir (str): Directory where PDF will be saved
        
    Returns:
        str: Full file path of created PDF, or None if error occurred
    """
    
    # --- 1. Extract and Prepare Data ---
    title = record_data.get('title', 'Untitled Article') or 'Untitled Article'
    author = record_data.get('author', '') or ''
    publication_date = record_data.get('publication_date', '') or ''
    original_publication = record_data.get('original_publication', '') or ''
    url = record_data.get('url', '') or ''
    pull_quote = record_data.get('pull_quote', '') or ''
    raw_text = record_data.get('raw_text', '') or ''
    item_id = record_data.get('id', 'NO-ID') or 'NO-ID'
    
    # --- 2. Create Filename ---
    sanitized_title = re.sub(r'[\\/*?:"<>|]', '', title)
    if not sanitized_title.strip():
        sanitized_title = "Untitled Article"
    
    pdf_filename = f"{sanitized_title[:50]} - {item_id}.pdf"
    
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    pdf_filepath = os.path.join(output_dir, pdf_filename)
    
    # --- 3. Build PDF Content ---
    try:
        # Initialize document with proper margins
        doc = SimpleDocTemplate(
            pdf_filepath,
            pagesize=letter,
            rightMargin=72,
            leftMargin=72,
            topMargin=72,
            bottomMargin=72
        )
        
        # Get base styles
        styles = getSampleStyleSheet()
        
        # --- 3a. Define Custom Styles ---
        
        # Title style (H1) - Center aligned
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            spaceAfter=16,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold',
            textColor=black
        )
        
        # Metadata style (H3) - Center aligned
        metadata_style = ParagraphStyle(
            'Metadata',
            parent=styles['Heading3'],
            fontSize=14,
            spaceAfter=12,
            alignment=TA_CENTER,
            fontName='Helvetica',
            textColor=black
        )
        
        # URL style (italic) - Center aligned
        url_style = ParagraphStyle(
            'URL',
            parent=styles['Normal'],
            fontSize=11,
            spaceAfter=12,
            alignment=TA_CENTER,
            fontName='Helvetica-Oblique',
            textColor=grey,
            leftIndent=0
        )
        
        # Pull quote style - 14pt paragraph, center aligned
        pullquote_style = ParagraphStyle(
            'PullQuote',
            parent=styles['Normal'],
            fontSize=14,
            spaceAfter=16,
            spaceBefore=8,
            alignment=TA_CENTER,
            fontName='Helvetica-Oblique',
            textColor=black,
            leftIndent=12,
            rightIndent=12
        )
        
        # Body text style
        body_style = ParagraphStyle(
            'Body',
            parent=styles['BodyText'],
            fontSize=11,
            spaceAfter=6,
            alignment=TA_JUSTIFY,
            fontName='Helvetica',
            leading=14,
            textColor=black
        )
        
        # Initialize story
        story = []
        
        # --- 3b. Add Content Elements ---
        
        # 1. Title (H1)
        if title.strip():
            story.append(Paragraph(title, title_style))
            story.append(Spacer(1, 0.1 * inch))  # Line break
        
        # 2. Metadata line: Author | Publication Date | Original Publication (H3)
        metadata_parts = []
        if author.strip():
            metadata_parts.append(author)
        if publication_date.strip():
            metadata_parts.append(publication_date)
        if original_publication.strip():
            metadata_parts.append(original_publication)
        
        if metadata_parts:
            metadata_text = " | ".join(metadata_parts)
            story.append(Paragraph(metadata_text, metadata_style))
            story.append(Spacer(1, 0.1 * inch))  # Line break
        
        # 3. URL (italic)
        if url.strip():
            story.append(Paragraph(url, url_style))
            story.append(Spacer(1, 0.1 * inch))  # Line break
        
        # 4. Pull Quote (H4)
        if pull_quote.strip():
            story.append(Paragraph(f'"{pull_quote}"', pullquote_style))
            story.append(Spacer(1, 0.1 * inch))  # Line break
        
        # 5. Horizontal Divider
        story.append(HRFlowable(
            width="100%", 
            thickness=1, 
            color=grey,
            spaceBefore=6,
            spaceAfter=12
        ))
        story.append(Spacer(1, 0.1 * inch))  # Line break
        
        # 6. Raw Text (body paragraphs)
        if raw_text.strip():
            # Split text into paragraphs and process each one
            paragraphs = raw_text.split('\n')
            
            for para_text in paragraphs:
                para_text = para_text.strip()
                if para_text:  # Skip empty paragraphs
                    # Clean up the text for better PDF rendering
                    para_text = _clean_text_for_pdf(para_text)
                    story.append(Paragraph(para_text, body_style))
        else:
            # Fallback if no raw text
            story.append(Paragraph("Content text not available.", body_style))
        
        # --- 4. Build PDF ---
        doc.build(story)
        print(f"  [Enhanced PDF] Successfully created: {pdf_filepath}")
        return pdf_filepath
        
    except Exception as e:
        print(f"  [Enhanced PDF] ERROR: Could not create PDF for '{title}'. Reason: {e}")
        return None


def _clean_text_for_pdf(text):
    """
    Clean text for better PDF rendering by handling special characters
    and formatting issues.
    
    Args:
        text (str): Raw text to clean
        
    Returns:
        str: Cleaned text suitable for PDF
    """
    if not text:
        return ""
    
    # Replace problematic characters
    text = text.replace('\u2019', "'")  # Right single quotation mark
    text = text.replace('\u2018', "'")  # Left single quotation mark
    text = text.replace('\u201c', '"')  # Left double quotation mark
    text = text.replace('\u201d', '"')  # Right double quotation mark
    text = text.replace('\u2013', '-')  # En dash
    text = text.replace('\u2014', '--') # Em dash
    text = text.replace('\u2026', '...') # Ellipsis
    
    # Remove excessive whitespace
    text = ' '.join(text.split())
    
    return text


def generate_pdf_from_spreadsheet_row(row_dict, output_dir="enhanced_pdf_library"):
    """
    Convenience function to generate PDF directly from a spreadsheet row dictionary.
    
    Args:
        row_dict (dict): Dictionary representing a row from test_runs sheet
        output_dir (str): Directory where PDF will be saved
        
    Returns:
        str: Full file path of created PDF, or None if error occurred
    """
    return create_enhanced_pdf(row_dict, output_dir)


# Example usage and testing
if __name__ == "__main__":
    # Sample data for testing
    sample_data = {
        'id': 'TEST-001',
        'title': 'Sample Article Title for Testing PDF Generation',
        'author': 'Jay Rosen',
        'publication_date': '2024-08-15',
        'original_publication': 'PressThink',
        'url': 'https://pressthink.org/sample-article',
        'pull_quote': 'This is a compelling excerpt that summarizes the key point of the article.',
        'raw_text': '''This is the first paragraph of the article. It contains the main content and ideas that the author wants to convey to the readers.

This is the second paragraph, which continues the discussion and adds more detail to the topic. It demonstrates how the PDF will handle multiple paragraphs.

This final paragraph concludes the article and provides a summary of the key takeaways for the reader.'''
    }
    
    # Generate test PDF
    result = create_enhanced_pdf(sample_data, "test_pdf_output")
    if result:
        print(f"Test PDF generated successfully: {result}")
    else:
        print("Failed to generate test PDF")