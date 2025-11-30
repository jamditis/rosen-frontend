# -*- coding: utf-8 -*-
"""
C-SPAN Video Processor
Extracts transcripts and metadata from C-SPAN videos.
"""

import re
import requests
from typing import Dict, Optional
from bs4 import BeautifulSoup


class CSpanProcessor:
    """Process C-SPAN video content."""

    def process(self, url: str) -> Dict:
        """
        Process a C-SPAN video URL.

        Uses multiple fallback strategies:
        1. Check for embedded transcript in page
        2. Try C-SPAN API for transcript
        3. Check for dedicated transcript page
        4. Fall back to YouTube if video is on YouTube

        Args:
            url: C-SPAN video URL

        Returns:
            Dict with processed data
        """
        print(f"  [C-SPAN] Processing: {url}")

        # Extract video ID
        video_id = self._extract_video_id(url)
        if not video_id:
            return {'status': 'failed', 'error': 'Could not extract video ID'}

        print(f"  [C-SPAN] Video ID: {video_id}")

        # Strategy 1: Check for embedded transcript
        transcript = self._extract_embedded_transcript(url)
        if transcript:
            print(f"  [C-SPAN] Found embedded transcript ({len(transcript)} chars)")
            metadata = self._extract_metadata(url)
            return {
                'status': 'success',
                'source': 'cspan_embedded_transcript',
                'raw_text': transcript,
                'title': metadata.get('title'),
                'author': metadata.get('author', 'C-SPAN'),
                'publication_date': metadata.get('date'),
                'metadata': metadata
            }

        # Strategy 2: Try C-SPAN API
        transcript = self._fetch_from_api(video_id)
        if transcript:
            print(f"  [C-SPAN] Found transcript via API ({len(transcript)} chars)")
            metadata = self._extract_metadata(url)
            return {
                'status': 'success',
                'source': 'cspan_api_transcript',
                'raw_text': transcript,
                'title': metadata.get('title'),
                'author': metadata.get('author', 'C-SPAN'),
                'publication_date': metadata.get('date'),
                'metadata': metadata
            }

        # Strategy 3: Check for transcript page link
        transcript_url = self._find_transcript_url(url)
        if transcript_url:
            transcript = self._extract_from_transcript_page(transcript_url)
            if transcript:
                print(f"  [C-SPAN] Found transcript page ({len(transcript)} chars)")
                metadata = self._extract_metadata(url)
                return {
                    'status': 'success',
                    'source': 'cspan_transcript_page',
                    'raw_text': transcript,
                    'title': metadata.get('title'),
                    'author': metadata.get('author', 'C-SPAN'),
                    'publication_date': metadata.get('date'),
                    'metadata': metadata
                }

        # Strategy 4: Check for YouTube fallback
        youtube_url = self._find_youtube_url(url)
        if youtube_url:
            print(f"  [C-SPAN] Found YouTube version: {youtube_url}")
            return {
                'status': 'youtube_fallback',
                'youtube_url': youtube_url,
                'metadata': self._extract_metadata(url)
            }

        # No transcript found
        print(f"  [C-SPAN] No transcript found, would need audio transcription")
        return {
            'status': 'needs_transcription',
            'metadata': self._extract_metadata(url),
            'needs_transcription': True
        }

    def _extract_video_id(self, url: str) -> Optional[str]:
        """Extract video ID from C-SPAN URL."""
        # Pattern: c-span.org/video/?c5067890/user-clip-jay-rosen
        # or c-span.org/video/?123456/program-name
        match = re.search(r'/\?c?(\d+)', url)
        if match:
            return match.group(1)
        return None

    def _extract_embedded_transcript(self, url: str) -> Optional[str]:
        """Extract transcript from page if embedded."""
        try:
            response = requests.get(url, timeout=30)
            response.raise_for_status()

            soup = BeautifulSoup(response.content, 'html.parser')

            # Check for transcript container
            transcript_div = soup.find('div', id='transcript-container')
            if transcript_div:
                return self._format_transcript_entries(transcript_div)

            # Check for transcript modal
            transcript_div = soup.find('div', class_='transcript-modal')
            if transcript_div:
                return self._format_transcript_entries(transcript_div)

            return None

        except Exception as e:
            print(f"  [C-SPAN] Embedded extraction failed: {e}")
            return None

    def _fetch_from_api(self, video_id: str) -> Optional[str]:
        """Fetch transcript from C-SPAN API."""
        api_url = f'https://www.c-span.org/assets/player/ajax-transcript.php?id={video_id}'

        try:
            response = requests.get(api_url, timeout=30)
            if response.ok and response.text:
                data = response.json()
                return self._parse_api_response(data)

        except Exception as e:
            print(f"  [C-SPAN] API request failed: {e}")

        return None

    def _find_transcript_url(self, url: str) -> Optional[str]:
        """Find link to dedicated transcript page."""
        try:
            response = requests.get(url, timeout=30)
            soup = BeautifulSoup(response.content, 'html.parser')

            # Look for transcript link
            transcript_link = soup.find('a', href=re.compile(r'/transcript/'))
            if transcript_link:
                href = transcript_link['href']
                if href.startswith('/'):
                    return f"https://www.c-span.org{href}"
                return href

        except Exception:
            pass

        return None

    def _extract_from_transcript_page(self, url: str) -> Optional[str]:
        """Extract transcript from dedicated transcript page."""
        try:
            response = requests.get(url, timeout=30)
            soup = BeautifulSoup(response.content, 'html.parser')

            # C-SPAN transcript format
            transcript_entries = soup.find_all('div', class_='transcript-entry')

            if not transcript_entries:
                # Try alternative selectors
                transcript_entries = soup.find_all('p', class_='speaker-text')

            if transcript_entries:
                return self._format_transcript_entries_list(transcript_entries)

        except Exception as e:
            print(f"  [C-SPAN] Transcript page extraction failed: {e}")

        return None

    def _format_transcript_entries(self, container) -> str:
        """Format transcript entries from container."""
        entries = container.find_all(['div', 'p'], class_=re.compile(r'transcript|speaker'))

        formatted = []
        for entry in entries:
            # Extract speaker and text
            speaker_elem = entry.find('span', class_='speaker-name')
            text_elem = entry.find('span', class_='speaker-text') or entry

            speaker = speaker_elem.get_text(strip=True) if speaker_elem else ''
            text = text_elem.get_text(strip=True)

            if speaker:
                formatted.append(f"{speaker}: {text}")
            elif text:
                formatted.append(text)

        return '\n\n'.join(formatted)

    def _format_transcript_entries_list(self, entries: list) -> str:
        """Format list of transcript entries."""
        formatted = []

        for entry in entries:
            speaker_elem = entry.find('span', class_='speaker-name')
            text = entry.get_text(strip=True)

            if speaker_elem:
                speaker = speaker_elem.get_text(strip=True)
                # Remove speaker name from text
                text = text.replace(speaker, '', 1).strip()
                formatted.append(f"{speaker}: {text}")
            else:
                formatted.append(text)

        return '\n\n'.join(formatted)

    def _parse_api_response(self, data: dict) -> Optional[str]:
        """Parse C-SPAN API transcript response."""
        try:
            transcript_parts = []

            for entry in data.get('transcript', []):
                speaker = entry.get('speaker', '')
                text = entry.get('text', '')
                timestamp = entry.get('time', '')

                if speaker:
                    transcript_parts.append(f"[{timestamp}] {speaker}: {text}")
                else:
                    transcript_parts.append(f"[{timestamp}] {text}")

            return '\n\n'.join(transcript_parts)

        except Exception:
            return None

    def _find_youtube_url(self, url: str) -> Optional[str]:
        """Find YouTube URL if video is also on YouTube."""
        try:
            response = requests.get(url, timeout=30)
            soup = BeautifulSoup(response.content, 'html.parser')

            # Look for YouTube link
            youtube_link = soup.find('a', href=re.compile(r'youtube\.com|youtu\.be'))
            if youtube_link:
                return youtube_link['href']

        except Exception:
            pass

        return None

    def _extract_metadata(self, url: str) -> Dict:
        """Extract metadata from C-SPAN page."""
        try:
            response = requests.get(url, timeout=30)
            soup = BeautifulSoup(response.content, 'html.parser')

            # Extract title
            title = None
            title_elem = soup.find('h1')
            if title_elem:
                title = title_elem.get_text(strip=True)
            else:
                # Try meta tags
                title_meta = soup.find('meta', property='og:title')
                if title_meta:
                    title = title_meta.get('content')

            # Extract date
            date = None
            date_elem = soup.find('time')
            if date_elem:
                date = date_elem.get('datetime') or date_elem.get_text(strip=True)

            # Extract description
            desc = None
            desc_meta = soup.find('meta', property='og:description')
            if desc_meta:
                desc = desc_meta.get('content')

            return {
                'title': title or 'C-SPAN Video',
                'date': date,
                'description': desc,
                'url': url
            }

        except Exception:
            return {
                'title': 'C-SPAN Video',
                'date': None,
                'url': url
            }
