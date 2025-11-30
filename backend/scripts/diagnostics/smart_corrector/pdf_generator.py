# -*- coding: utf-8 -*-
"""
Smart Corrector PDF Generator
Integrates accessible PDF generation with multimedia processors.
"""

import sys
import os
from pathlib import Path
from typing import Dict, Optional

# Add project root to path for imports
project_root = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(project_root / 'tools' / 'pdf' / 'enhanced_pdf_generator'))

try:
    from tools.pdf.enhanced_pdf_generator.accessible_pdf_generator import AccessiblePDFGenerator
    PDF_GENERATOR_AVAILABLE = True
except ImportError:
    PDF_GENERATOR_AVAILABLE = False
    print("  [WARNING] Accessible PDF generator not available")


class SmartCorrectorPDFGenerator:
    """
    Generates beautiful, accessibility-friendly PDFs for all content types.

    Handles:
    - Articles (web content)
    - Audio transcripts (SoundCloud, podcasts)
    - Video transcripts (YouTube, C-SPAN)
    - Social media threads (Twitter/X)
    """

    def __init__(self, output_dir: str = "smart_corrector_pdfs"):
        """
        Initialize PDF generator.

        Args:
            output_dir: Directory for generated PDFs
        """
        self.output_dir = output_dir
        self.generator = AccessiblePDFGenerator() if PDF_GENERATOR_AVAILABLE else None

        # Ensure output directory exists
        os.makedirs(output_dir, exist_ok=True)

    def generate_pdf(self, record_data: Dict, content_type: str = 'article') -> Optional[str]:
        """
        Generate accessible PDF from processed record data.

        Args:
            record_data: Processed record dictionary with all metadata
            content_type: Type of content (article, audio, video, social)

        Returns:
            Path to generated PDF file, or None if failed
        """
        if not PDF_GENERATOR_AVAILABLE or not self.generator:
            print("  [PDF] Generator not available, skipping PDF creation")
            return None

        # Enhance record data based on content type
        enhanced_data = self._prepare_record_for_pdf(record_data, content_type)

        try:
            # Generate accessible PDF
            pdf_path = self.generator.create_accessible_pdf(
                enhanced_data,
                output_dir=self.output_dir
            )

            if pdf_path:
                print(f"  [PDF] Generated: {os.path.basename(pdf_path)}")
                return pdf_path
            else:
                print(f"  [PDF] Failed to generate PDF for: {enhanced_data.get('title', 'Unknown')}")
                return None

        except Exception as e:
            print(f"  [PDF] Error generating PDF: {e}")
            return None

    def _prepare_record_for_pdf(self, record_data: Dict, content_type: str) -> Dict:
        """
        Prepare and enhance record data for PDF generation.

        Args:
            record_data: Raw record data
            content_type: Type of content

        Returns:
            Enhanced record data optimized for PDF
        """
        enhanced = record_data.copy()

        # Content-type specific enhancements
        if content_type == 'audio':
            enhanced = self._enhance_audio_record(enhanced)
        elif content_type == 'video':
            enhanced = self._enhance_video_record(enhanced)
        elif content_type == 'social':
            enhanced = self._enhance_social_record(enhanced)
        else:  # article
            enhanced = self._enhance_article_record(enhanced)

        # Ensure all required fields exist
        enhanced.setdefault('id', 'UNKNOWN-ID')
        enhanced.setdefault('title', 'Untitled Content')
        enhanced.setdefault('author', 'Unknown Author')
        enhanced.setdefault('publication_date', '')
        enhanced.setdefault('original_publication', '')
        enhanced.setdefault('url', '')
        enhanced.setdefault('pull_quote', '')
        enhanced.setdefault('raw_text', '')
        enhanced.setdefault('summary', '')
        enhanced.setdefault('thematic_categories', '')
        enhanced.setdefault('key_concepts', '')

        return enhanced

    def _enhance_audio_record(self, record: Dict) -> Dict:
        """Enhance audio content record for PDF."""
        enhanced = record.copy()

        # Add audio-specific metadata to title
        if enhanced.get('duration_seconds'):
            duration_minutes = enhanced['duration_seconds'] / 60
            enhanced['title'] = f"{enhanced.get('title', 'Audio Recording')} [{duration_minutes:.1f} min]"

        # Add transcript indicator to pull quote if not set
        if not enhanced.get('pull_quote') and enhanced.get('raw_text'):
            # Extract first meaningful sentence as pull quote
            first_sentence = self._extract_first_sentence(enhanced['raw_text'])
            if first_sentence:
                enhanced['pull_quote'] = f"Transcript excerpt: {first_sentence}"

        # Add audio source info
        if not enhanced.get('original_publication'):
            if 'soundcloud' in enhanced.get('url', '').lower():
                enhanced['original_publication'] = 'SoundCloud'
            elif 'podcast' in enhanced.get('url', '').lower():
                enhanced['original_publication'] = 'Podcast'
            else:
                enhanced['original_publication'] = 'Audio Recording'

        # Prefix raw_text to indicate it's a transcript
        if enhanced.get('raw_text') and not enhanced['raw_text'].startswith('[TRANSCRIPT]'):
            enhanced['raw_text'] = f"[TRANSCRIPT]\n\n{enhanced['raw_text']}"

        return enhanced

    def _enhance_video_record(self, record: Dict) -> Dict:
        """Enhance video content record for PDF."""
        enhanced = record.copy()

        # Add video-specific metadata to title
        if enhanced.get('duration_seconds'):
            duration_minutes = enhanced['duration_seconds'] / 60
            enhanced['title'] = f"{enhanced.get('title', 'Video')} [{duration_minutes:.1f} min video]"

        # Add transcript indicator
        if not enhanced.get('pull_quote') and enhanced.get('raw_text'):
            first_sentence = self._extract_first_sentence(enhanced['raw_text'])
            if first_sentence:
                enhanced['pull_quote'] = f"Video transcript excerpt: {first_sentence}"

        # Add video source info
        if not enhanced.get('original_publication'):
            url = enhanced.get('url', '').lower()
            if 'youtube' in url or 'youtu.be' in url:
                enhanced['original_publication'] = 'YouTube'
            elif 'c-span' in url:
                enhanced['original_publication'] = 'C-SPAN'
            else:
                enhanced['original_publication'] = 'Video Platform'

        # Add transcript type info if available
        transcript_type = enhanced.get('transcript_type', '')
        if transcript_type:
            type_label = {
                'manual_transcript': 'Manual Transcript',
                'auto_generated': 'Auto-Generated Transcript',
                'cspan_embedded_transcript': 'C-SPAN Official Transcript',
                'cspan_api_transcript': 'C-SPAN API Transcript'
            }.get(transcript_type, 'Transcript')

            enhanced['raw_text'] = f"[{type_label}]\n\n{enhanced.get('raw_text', '')}"

        return enhanced

    def _enhance_social_record(self, record: Dict) -> Dict:
        """Enhance social media content record for PDF."""
        enhanced = record.copy()

        # Add thread indicator to title
        if enhanced.get('is_thread'):
            tweet_count = enhanced.get('tweet_count', 1)
            enhanced['title'] = f"{enhanced.get('title', 'Social Media Post')} [Thread: {tweet_count} tweets]"

        # Add platform info
        if not enhanced.get('original_publication'):
            url = enhanced.get('url', '').lower()
            if 'twitter.com' in url or 'x.com' in url:
                enhanced['original_publication'] = 'Twitter/X'
            elif 'linkedin.com' in url:
                enhanced['original_publication'] = 'LinkedIn'
            else:
                enhanced['original_publication'] = 'Social Media'

        # Format thread content for better PDF readability
        if enhanced.get('is_thread') and enhanced.get('raw_text'):
            # Add thread structure markers
            enhanced['raw_text'] = self._format_thread_for_pdf(enhanced['raw_text'])

        return enhanced

    def _enhance_article_record(self, record: Dict) -> Dict:
        """Enhance article content record for PDF."""
        enhanced = record.copy()

        # Add word count to title if available
        if enhanced.get('raw_text'):
            word_count = len(enhanced['raw_text'].split())
            if word_count > 0:
                enhanced['title'] = f"{enhanced.get('title', 'Article')} [{word_count:,} words]"

        # Extract pull quote if not set
        if not enhanced.get('pull_quote') and enhanced.get('raw_text'):
            first_sentence = self._extract_first_sentence(enhanced['raw_text'])
            if first_sentence:
                enhanced['pull_quote'] = first_sentence

        return enhanced

    def _extract_first_sentence(self, text: str, max_length: int = 200) -> str:
        """
        Extract first meaningful sentence from text.

        Args:
            text: Full text content
            max_length: Maximum length for sentence

        Returns:
            First sentence, truncated if needed
        """
        if not text:
            return ""

        # Clean up text
        text = text.strip()

        # Find first sentence boundary
        sentence_endings = ['. ', '! ', '? ', '.\n', '!\n', '?\n']

        first_end = len(text)
        for ending in sentence_endings:
            pos = text.find(ending)
            if pos != -1 and pos < first_end:
                first_end = pos + 1

        sentence = text[:first_end].strip()

        # Truncate if too long
        if len(sentence) > max_length:
            sentence = sentence[:max_length].rsplit(' ', 1)[0] + '...'

        return sentence

    def _format_thread_for_pdf(self, thread_text: str) -> str:
        """
        Format Twitter thread for better PDF readability.

        Args:
            thread_text: Raw thread text (tweets separated by \n\n)

        Returns:
            Formatted thread with numbered tweets
        """
        # Split into individual tweets
        tweets = [t.strip() for t in thread_text.split('\n\n') if t.strip()]

        if len(tweets) <= 1:
            return thread_text

        # Format as numbered thread
        formatted_parts = ["[TWITTER THREAD]\n"]

        for i, tweet in enumerate(tweets, 1):
            # Skip if it's an image caption (already included)
            if tweet.startswith('[Image:'):
                formatted_parts.append(f"\n{tweet}")
            else:
                formatted_parts.append(f"\n{i}/{len(tweets)}: {tweet}")

        return '\n'.join(formatted_parts)

    def generate_batch_pdfs(self, records: list, content_types: dict) -> Dict:
        """
        Generate PDFs for multiple records.

        Args:
            records: List of record dictionaries
            content_types: Dict mapping record IDs to content types

        Returns:
            Dict with success/failure statistics
        """
        results = {
            'total': len(records),
            'success': 0,
            'failed': 0,
            'skipped': 0,
            'pdf_paths': []
        }

        for i, record in enumerate(records, 1):
            record_id = record.get('id', f'record_{i}')
            content_type = content_types.get(record_id, 'article')

            print(f"\n  [PDF BATCH] Processing {i}/{len(records)}: {record.get('title', 'Untitled')[:50]}...")

            pdf_path = self.generate_pdf(record, content_type)

            if pdf_path:
                results['success'] += 1
                results['pdf_paths'].append(pdf_path)
            elif pdf_path is None and not PDF_GENERATOR_AVAILABLE:
                results['skipped'] += 1
            else:
                results['failed'] += 1

        print(f"\n  [PDF BATCH] Complete: {results['success']} success, {results['failed']} failed, {results['skipped']} skipped")

        return results


# Convenience function for standalone usage
def generate_pdf_for_record(record_data: Dict, content_type: str = 'article', output_dir: str = "smart_corrector_pdfs") -> Optional[str]:
    """
    Generate accessible PDF for a single record.

    Args:
        record_data: Record dictionary
        content_type: Type of content (article, audio, video, social)
        output_dir: Output directory

    Returns:
        Path to generated PDF
    """
    generator = SmartCorrectorPDFGenerator(output_dir)
    return generator.generate_pdf(record_data, content_type)


# Example usage
if __name__ == "__main__":
    # Test with sample data for each content type

    print("Testing Smart Corrector PDF Generator...\n")

    # Article example
    article_data = {
        'id': 'TEST-001',
        'title': 'Test Article About Digital Journalism',
        'author': 'Jay Rosen',
        'publication_date': '2024-08-15',
        'original_publication': 'PressThink',
        'url': 'https://pressthink.org/test-article',
        'pull_quote': 'This is a test pull quote from the article.',
        'raw_text': 'This is the first paragraph of the test article. It discusses important topics in digital journalism.\n\nThis is the second paragraph. It continues the discussion with additional insights.\n\nThe final paragraph wraps up the main points.',
        'thematic_categories': 'Press & Media Criticism',
        'key_concepts': 'Digital Journalism, Media Analysis'
    }

    # Audio example
    audio_data = {
        'id': 'TEST-002',
        'title': 'Test Podcast Episode',
        'author': 'Podcast Host',
        'publication_date': '2024-08-16',
        'url': 'https://soundcloud.com/test-podcast',
        'duration_seconds': 1800,
        'raw_text': 'This is a transcript of the podcast episode. The host discusses various topics related to media and journalism.\n\nThe conversation continues with insights from the guest speaker.\n\nThe episode concludes with key takeaways for the audience.',
        'thematic_categories': 'Audio Content',
        'key_concepts': 'Podcasting, Media Discussion'
    }

    # Video example
    video_data = {
        'id': 'TEST-003',
        'title': 'Test YouTube Video',
        'author': 'Content Creator',
        'publication_date': '2024-08-17',
        'url': 'https://youtube.com/watch?v=test123',
        'duration_seconds': 900,
        'transcript_type': 'manual_transcript',
        'raw_text': 'Welcome to this video about digital media. Today we will discuss important trends in journalism.\n\nAs you can see in this example, the industry is evolving rapidly.\n\nThank you for watching. Please subscribe for more content.',
        'thematic_categories': 'Video Content',
        'key_concepts': 'Digital Media, Video Analysis'
    }

    # Twitter thread example
    twitter_data = {
        'id': 'TEST-004',
        'title': 'Tweet by @TestUser',
        'author': '@TestUser',
        'publication_date': '2024-08-18',
        'url': 'https://x.com/testuser/status/123456789',
        'is_thread': True,
        'tweet_count': 3,
        'raw_text': 'This is the first tweet in a thread about media criticism.\n\nThe second tweet continues the argument with additional evidence.\n\nThe final tweet summarizes the key points and conclusions.',
        'thematic_categories': 'Social Media',
        'key_concepts': 'Twitter Threads, Media Criticism'
    }

    # Generate PDFs
    generator = SmartCorrectorPDFGenerator(output_dir="test_smart_pdfs")

    print("1. Generating article PDF...")
    generator.generate_pdf(article_data, 'article')

    print("\n2. Generating audio PDF...")
    generator.generate_pdf(audio_data, 'audio')

    print("\n3. Generating video PDF...")
    generator.generate_pdf(video_data, 'video')

    print("\n4. Generating social media PDF...")
    generator.generate_pdf(twitter_data, 'social')

    print("\n=== All test PDFs generated ===")
