# -*- coding: utf-8 -*-
"""
YouTube Enhanced Processor
Extracts captions/transcripts from YouTube videos using youtube-transcript-api.
Much cheaper than downloading and transcribing audio.
"""

import re
import subprocess
import json
from typing import Dict, Optional

try:
    from youtube_transcript_api import YouTubeTranscriptApi
    TRANSCRIPT_API_AVAILABLE = True
except ImportError:
    TRANSCRIPT_API_AVAILABLE = False
    print("  [WARNING] youtube-transcript-api not installed. Install with: pip install youtube-transcript-api")


class YouTubeEnhancedProcessor:
    """Process YouTube videos with enhanced caption extraction."""

    def process(self, url: str) -> Dict:
        """
        Process YouTube video URL.

        Tries to get transcripts in this order:
        1. Manual transcripts (highest quality)
        2. Auto-generated captions
        3. Fallback to video metadata only

        Args:
            url: YouTube URL

        Returns:
            Dict with processed data
        """
        print(f"  [YOUTUBE] Processing: {url}")

        # Extract video ID
        video_id = self._extract_video_id(url)
        if not video_id:
            return {'status': 'failed', 'error': 'Could not extract video ID'}

        print(f"  [YOUTUBE] Video ID: {video_id}")

        # Get video metadata first
        metadata = self._get_metadata(url)

        if not TRANSCRIPT_API_AVAILABLE:
            print("  [YOUTUBE] Transcript API not available, using metadata only")
            return {
                'status': 'partial',
                'source': 'youtube_metadata',
                'raw_text': metadata.get('description', ''),
                'title': metadata.get('title'),
                'author': metadata.get('uploader'),
                'publication_date': metadata.get('upload_date'),
                'metadata': metadata,
                'needs_transcription': True
            }

        # Try to get transcript
        transcript_result = self._get_transcript(video_id)

        if transcript_result['success']:
            print(f"  [YOUTUBE] Found {transcript_result['type']} transcript ({len(transcript_result['text'])} chars)")

            return {
                'status': 'success',
                'source': f"youtube_{transcript_result['type']}",
                'raw_text': transcript_result['text'],
                'title': metadata.get('title'),
                'author': metadata.get('uploader'),
                'publication_date': metadata.get('upload_date'),
                'duration_seconds': metadata.get('duration'),
                'metadata': metadata,
                'transcript_type': transcript_result['type'],
                'needs_transcription': False
            }
        else:
            # No transcript available
            print(f"  [YOUTUBE] No transcript available: {transcript_result.get('error')}")

            return {
                'status': 'needs_transcription',
                'source': 'youtube_no_transcript',
                'raw_text': metadata.get('description', ''),
                'title': metadata.get('title'),
                'author': metadata.get('uploader'),
                'publication_date': metadata.get('upload_date'),
                'metadata': metadata,
                'needs_transcription': True,
                'error': transcript_result.get('error')
            }

    def _extract_video_id(self, url: str) -> Optional[str]:
        """
        Extract YouTube video ID from various URL formats.

        Supports:
        - youtube.com/watch?v=VIDEO_ID
        - youtu.be/VIDEO_ID
        - youtube.com/embed/VIDEO_ID
        """
        patterns = [
            r'(?:v=|/)([0-9A-Za-z_-]{11}).*',
            r'(?:embed/)([0-9A-Za-z_-]{11})',
            r'^([0-9A-Za-z_-]{11})$'
        ]

        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)

        return None

    def _get_transcript(self, video_id: str) -> Dict:
        """
        Get transcript using youtube-transcript-api.

        Returns:
            Dict with success, text, type (manual/auto), and optional error
        """
        if not TRANSCRIPT_API_AVAILABLE:
            return {
                'success': False,
                'error': 'youtube-transcript-api not installed'
            }

        try:
            # Create API instance (new API style)
            api = YouTubeTranscriptApi()

            # Get transcript list to see what's available
            transcript_list = api.list(video_id)

            # Try to find manually created English transcript first
            manual_transcript = None
            auto_transcript = None

            # Check available transcripts
            for transcript_info in transcript_list._manually_created_transcripts.values():
                if transcript_info.language_code == 'en':
                    manual_transcript = transcript_info
                    break

            # Check auto-generated transcripts
            if not manual_transcript:
                for transcript_info in transcript_list._generated_transcripts.values():
                    if transcript_info.language_code == 'en':
                        auto_transcript = transcript_info
                        break

            # Fetch the best available transcript
            if manual_transcript:
                fetched = manual_transcript.fetch()
                transcript_type = 'manual_transcript'
            elif auto_transcript:
                fetched = auto_transcript.fetch()
                transcript_type = 'auto_generated'
            else:
                # Fallback: try to fetch directly
                try:
                    fetched = api.fetch(video_id, languages=['en'])
                    transcript_type = 'auto_generated' if fetched.is_generated else 'manual_transcript'
                except Exception:
                    return {
                        'success': False,
                        'error': 'No English transcript available'
                    }

            # Get transcript data
            transcript_data = fetched.snippets if hasattr(fetched, 'snippets') else []

            if not transcript_data:
                return {
                    'success': False,
                    'error': 'Transcript data is empty'
                }

            text = self._format_transcript(transcript_data)

            return {
                'success': True,
                'text': text,
                'type': transcript_type,
                'language': fetched.language_code if hasattr(fetched, 'language_code') else 'en'
            }

        except Exception as e:
            return {
                'success': False,
                'error': f'Transcript fetch failed: {str(e)}'
            }

    def _format_transcript(self, transcript_data: list) -> str:
        """
        Format transcript data into readable text.

        Args:
            transcript_data: List of FetchedTranscriptSnippet objects with text, start, duration attributes

        Returns:
            Formatted transcript text
        """
        # Combine all text entries (handle both dict and object formats)
        text_parts = []
        for entry in transcript_data:
            if hasattr(entry, 'text'):  # FetchedTranscriptSnippet object
                text_parts.append(entry.text)
            elif isinstance(entry, dict) and 'text' in entry:  # Dictionary format
                text_parts.append(entry['text'])

        text = ' '.join(text_parts)

        # Clean up auto-generated caption artifacts
        text = text.replace('[Music]', '')
        text = text.replace('[Applause]', '')
        text = text.replace('[Laughter]', '')
        text = re.sub(r'\[.*?\]', '', text)  # Remove all [bracketed] text

        # Clean up whitespace but preserve structure for deduplication
        text = re.sub(r' +', ' ', text).strip()

        # Remove consecutive duplicate phrases (common in auto-generated captions)
        # Auto-generated captions often repeat each phrase 2-3 times
        words = text.split()
        deduplicated = []
        i = 0
        while i < len(words):
            # Look for repeated sequences of 3-10 words
            best_match_len = 0
            for seq_len in range(10, 2, -1):  # Try longer sequences first
                if i + seq_len * 2 <= len(words):
                    sequence = words[i:i+seq_len]
                    next_sequence = words[i+seq_len:i+seq_len*2]
                    if sequence == next_sequence:
                        best_match_len = seq_len
                        break

            if best_match_len > 0:
                # Found a duplicate - add once and skip the repeats
                deduplicated.extend(words[i:i+best_match_len])
                # Skip all consecutive duplicates of this sequence
                i += best_match_len
                while i + best_match_len <= len(words) and words[i:i+best_match_len] == deduplicated[-best_match_len:]:
                    i += best_match_len
            else:
                deduplicated.append(words[i])
                i += 1

        text = ' '.join(deduplicated)

        # Truncate if too long for Google Sheets (50,000 char limit)
        # Leave room for metadata and safety margin
        MAX_LENGTH = 49000
        if len(text) > MAX_LENGTH:
            print(f"  [YOUTUBE] Transcript too long ({len(text)} chars), truncating to {MAX_LENGTH}")
            text = text[:MAX_LENGTH] + '... [TRUNCATED - Full transcript available via YouTube captions]'

        return text

    def _get_metadata(self, url: str) -> Dict:
        """
        Get video metadata using yt-dlp.

        Args:
            url: YouTube URL

        Returns:
            Dict with metadata
        """
        try:
            result = subprocess.run([
                'yt-dlp',
                '--dump-json',
                '--no-download',
                url
            ], capture_output=True, text=True, timeout=30)

            if result.returncode == 0:
                metadata = json.loads(result.stdout)

                return {
                    'title': metadata.get('title'),
                    'uploader': metadata.get('uploader'),
                    'upload_date': self._format_date(metadata.get('upload_date')),
                    'duration': metadata.get('duration'),
                    'description': metadata.get('description'),
                    'view_count': metadata.get('view_count'),
                    'like_count': metadata.get('like_count'),
                    'channel': metadata.get('channel'),
                    'channel_id': metadata.get('channel_id'),
                    'thumbnail': metadata.get('thumbnail')
                }

        except Exception as e:
            print(f"  [YOUTUBE] Metadata extraction failed: {e}")

        # Return minimal fallback
        return {
            'title': 'YouTube Video',
            'uploader': 'Unknown',
            'url': url
        }

    def _format_date(self, date_str: Optional[str]) -> Optional[str]:
        """Format YYYYMMDD to YYYY-MM-DD."""
        if not date_str or len(date_str) != 8:
            return date_str

        try:
            return f"{date_str[0:4]}-{date_str[4:6]}-{date_str[6:8]}"
        except Exception:
            return date_str
