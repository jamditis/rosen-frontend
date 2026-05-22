# -*- coding: utf-8 -*-
"""
Enhanced PDF Generator with Proper Formatting

This module creates visually appealing, well-structured PDFs with:
- Proper paragraph breaks and spacing
- Text styling (bold, italic, headers)
- Audio transcript formatting with timestamps
- Clean layout and accessibility features
"""

import os
import re
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.colors import gray, darkblue

class EnhancedPDFFormatter:
    """Enhanced PDF formatter with proper text structure and styling."""

    def __init__(self):
        """Initialize the PDF formatter with custom styles."""
        self.styles = getSampleStyleSheet()
        self._create_custom_styles()

    def _create_custom_styles(self):
        """Create custom paragraph styles for better formatting."""

        # Title style - larger, centered, bold
        self.styles.add(ParagraphStyle(
            name='EnhancedTitle',
            parent=self.styles['Heading1'],
            fontSize=18,
            spaceAfter=12,
            alignment=TA_CENTER,
            textColor=darkblue,
            fontName='Helvetica-Bold'
        ))

        # Metadata style - centered, italic, smaller
        self.styles.add(ParagraphStyle(
            name='EnhancedMeta',
            parent=self.styles['Normal'],
            fontSize=10,
            alignment=TA_CENTER,
            fontName='Helvetica-Oblique',
            textColor=gray,
            spaceAfter=6
        ))

        # Pull quote style - italic, indented
        self.styles.add(ParagraphStyle(
            name='PullQuote',
            parent=self.styles['Normal'],
            fontSize=12,
            fontName='Helvetica-Oblique',
            leftIndent=36,
            rightIndent=36,
            spaceAfter=12,
            spaceBefore=6,
            textColor=darkblue
        ))

        # Body paragraph style - justified, proper spacing
        self.styles.add(ParagraphStyle(
            name='EnhancedBody',
            parent=self.styles['Normal'],
            fontSize=11,
            leading=14,
            alignment=TA_JUSTIFY,
            spaceAfter=8,
            spaceBefore=0,
            firstLineIndent=0
        ))

        # Section header style
        self.styles.add(ParagraphStyle(
            name='SectionHeader',
            parent=self.styles['Heading2'],
            fontSize=14,
            spaceAfter=6,
            spaceBefore=12,
            fontName='Helvetica-Bold',
            textColor=darkblue
        ))

        # Timestamp style for audio transcripts
        self.styles.add(ParagraphStyle(
            name='Timestamp',
            parent=self.styles['Normal'],
            fontSize=9,
            fontName='Helvetica-Bold',
            textColor=gray,
            spaceAfter=3,
            spaceBefore=6
        ))

        # Tags style
        self.styles.add(ParagraphStyle(
            name='TagsStyle',
            parent=self.styles['Normal'],
            fontSize=10,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold',
            textColor=darkblue,
            spaceAfter=8
        ))

    def create_formatted_pdf(self, article_data, output_dir="processed_pdf_library"):
        """
        Create a properly formatted PDF with enhanced styling.

        Args:
            article_data (dict): Article data dictionary
            output_dir (str): Output directory for PDF

        Returns:
            str: Path to generated PDF
        """
        # Prepare filename
        title = article_data.get('title', 'Untitled Article') or 'Untitled Article'
        item_id = article_data.get('id', 'NO-ID')
        doc_format = article_data.get('format', 'text')

        sanitized_title = re.sub(r'[\\/*?:"<>|]', "", title)
        if not sanitized_title:
            sanitized_title = "Untitled Article"

        pdf_filename = f"{sanitized_title[:60]} - {item_id} - {doc_format}.pdf"
        os.makedirs(output_dir, exist_ok=True)
        pdf_filepath = os.path.join(output_dir, pdf_filename)

        try:
            # Create document
            doc = SimpleDocTemplate(
                pdf_filepath,
                topMargin=0.75*inch,
                bottomMargin=0.75*inch,
                leftMargin=0.75*inch,
                rightMargin=0.75*inch
            )

            story = []

            # Add title
            story.append(Paragraph(title, self.styles['EnhancedTitle']))
            story.append(Spacer(1, 0.2 * inch))

            # Add metadata
            meta_parts = [
                article_data.get('author', 'Author Not Found'),
                article_data.get('original_publication', 'Publication Not Found'),
                article_data.get('publication_date', 'Date Not Found')
            ]
            story.append(Paragraph(" • ".join(filter(None, meta_parts)), self.styles['EnhancedMeta']))

            # Add URL
            url = article_data.get('url', '')
            if url:
                story.append(Paragraph(f"Source: {url}", self.styles['EnhancedMeta']))

            story.append(Spacer(1, 0.2 * inch))

            # Add pull quote if exists
            pull_quote = article_data.get('pull_quote')
            if pull_quote and pull_quote.strip():
                story.append(Paragraph(f'"{pull_quote}"', self.styles['PullQuote']))
                story.append(Spacer(1, 0.1 * inch))

            # Add tags if exist
            tags = article_data.get('tags', '')
            if tags:
                if isinstance(tags, list):
                    tag_text = ', '.join(tags)
                else:
                    tag_text = str(tags)
                story.append(Paragraph(f"Tags: {tag_text}", self.styles['TagsStyle']))

            # Add horizontal rule
            story.append(HRFlowable(width="80%", thickness=1, color=gray))
            story.append(Spacer(1, 0.3 * inch))

            # Process main content based on format
            if doc_format == 'audio' or doc_format == 'video':
                self._add_transcript_content(story, article_data)
            else:
                self._add_article_content(story, article_data)

            # Build PDF
            doc.build(story)
            print(f"  [PDF] Successfully created enhanced PDF: {pdf_filepath}")
            return pdf_filepath

        except Exception as e:
            print(f"  [PDF] ERROR: Could not create enhanced PDF for '{title}'. Reason: {e}")
            return None

    def _add_article_content(self, story, article_data):
        """Add properly formatted article content."""
        text_content = article_data.get('raw_text') or article_data.get('text', '')

        if not text_content:
            story.append(Paragraph("Article text could not be extracted.", self.styles['EnhancedBody']))
            return

        # Clean and structure the text
        formatted_text = self._format_article_text(text_content)

        # Split into paragraphs and add formatting
        paragraphs = self._split_into_paragraphs(formatted_text)

        for para in paragraphs:
            if para.strip():
                # Check if paragraph looks like a header
                if self._is_section_header(para):
                    story.append(Paragraph(para.strip(), self.styles['SectionHeader']))
                else:
                    # Apply inline formatting
                    formatted_para = self._apply_inline_formatting(para.strip())
                    story.append(Paragraph(formatted_para, self.styles['EnhancedBody']))

    def _add_transcript_content(self, story, article_data):
        """Add formatted transcript content with timestamps."""
        transcript_text = article_data.get('raw_text') or article_data.get('text', '')

        if not transcript_text:
            story.append(Paragraph("Transcript could not be extracted.", self.styles['EnhancedBody']))
            return

        story.append(Paragraph("Transcript", self.styles['SectionHeader']))
        story.append(Spacer(1, 0.1 * inch))

        # Process transcript with timestamps
        lines = transcript_text.split('\n')
        current_speaker = None

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Check for timestamp patterns
            timestamp_match = re.match(r'^(\d{1,2}:\d{2}(?::\d{2})?)', line)
            if timestamp_match:
                timestamp = timestamp_match.group(1)
                content = line[len(timestamp):].strip()

                # Add timestamp
                story.append(Paragraph(f"[{timestamp}]", self.styles['Timestamp']))

                # Add content if exists
                if content:
                    story.append(Paragraph(content, self.styles['EnhancedBody']))
            else:
                # Check for speaker changes
                speaker_match = re.match(r'^([A-Z][A-Za-z\s]+):\s*(.+)', line)
                if speaker_match:
                    speaker = speaker_match.group(1)
                    content = speaker_match.group(2)

                    if speaker != current_speaker:
                        current_speaker = speaker
                        story.append(Spacer(1, 0.1 * inch))
                        story.append(Paragraph(f"<b>{speaker}:</b>", self.styles['EnhancedBody']))

                    story.append(Paragraph(content, self.styles['EnhancedBody']))
                else:
                    # Regular content
                    story.append(Paragraph(line, self.styles['EnhancedBody']))

    def _format_article_text(self, text):
        """Clean and format article text."""
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text)

        # Fix common web artifacts
        artifacts = [
            'Skip to main content',
            'Subscribe to our newsletter',
            'Follow us on',
            'Share this article',
            'Advertisement',
            'Continue reading',
            'Read more',
            'Sign up for',
            'Get our newsletter'
        ]

        for artifact in artifacts:
            text = text.replace(artifact, '')

        return text.strip()

    def _split_into_paragraphs(self, text):
        """Split text into proper paragraphs."""
        # Split on double newlines first
        paragraphs = text.split('\n\n')

        if len(paragraphs) == 1:
            # If no double newlines, try single newlines
            paragraphs = text.split('\n')

        if len(paragraphs) == 1:
            # If still one block, split on sentence boundaries for very long text
            if len(text) > 1000:
                sentences = re.split(r'(?<=[.!?])\s+', text)
                paragraphs = []
                current_para = ""

                for sentence in sentences:
                    if len(current_para + sentence) > 500:  # ~3-4 sentences per paragraph
                        if current_para:
                            paragraphs.append(current_para.strip())
                        current_para = sentence
                    else:
                        current_para += " " + sentence if current_para else sentence

                if current_para:
                    paragraphs.append(current_para.strip())
            else:
                paragraphs = [text]

        return [p for p in paragraphs if p.strip()]

    def _is_section_header(self, text):
        """Determine if text looks like a section header."""
        text = text.strip()

        # Check for header patterns
        if len(text) < 5 or len(text) > 80:
            return False

        # Headers often end without punctuation or with colons
        if text.endswith(':'):
            return True

        # Headers are often short and don't end with periods
        if len(text) < 50 and not text.endswith('.'):
            # Check if it looks title-case
            words = text.split()
            if len(words) <= 8 and sum(1 for w in words if w[0].isupper()) > len(words) * 0.6:
                return True

        return False

    def _apply_inline_formatting(self, text):
        """Apply inline formatting like bold and italic."""
        # Convert markdown-style formatting
        text = re.sub(r'\*\*([^\*]+)\*\*', r'<b>\1</b>', text)  # **bold**
        text = re.sub(r'\*([^\*]+)\*', r'<i>\1</i>', text)      # *italic*
        text = re.sub(r'_([^_]+)_', r'<i>\1</i>', text)         # _italic_

        # Handle quotes
        text = text.replace('"', '"').replace('"', '"')
        text = text.replace(''', "'").replace(''', "'")

        return text

# Convenience function to maintain compatibility
def create_article_pdf(article_data, output_dir="processed_pdf_library"):
    """
    Create an enhanced PDF using the new formatter.
    Maintains compatibility with existing code.
    """
    formatter = EnhancedPDFFormatter()
    return formatter.create_formatted_pdf(article_data, output_dir)