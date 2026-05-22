# -*- coding: utf-8 -*-
"""
SoundCloud Audio Processor
Extracts metadata, transcripts, and processes SoundCloud audio content.
"""

import re
import json
import requests
from typing import Dict, Optional
from bs4 import BeautifulSoup


class SoundCloudProcessor:
    """Process SoundCloud audio content."""

    def __init__(self, audio_optimizer=None):
        """
        Initialize SoundCloud processor.

        Args:
            audio_optimizer: AudioOptimizer instance for 2x speed transcription
        """
        self.audio_optimizer = audio_optimizer

    def process(self, url: str) -> Dict:
        """
        Process a SoundCloud URL.

        Args:
            url: SoundCloud URL

        Returns:
            Dict with processed data
        """
        print(f"  [SOUNDCLOUD] Processing: {url}")

        # Step 1: Extract metadata
        metadata = self.extract_metadata(url)
        if not metadata:
            return {'status': 'failed', 'error': 'Failed to extract metadata'}

        print(f"  [SOUNDCLOUD] Title: {metadata.get('title')}")
        print(f"  [SOUNDCLOUD] Duration: {metadata.get('duration', 0)/60:.1f} minutes")

        # Step 2: Check for existing description/transcript
        description = metadata.get('description', '')
        if len(description) > 500:
            # Substantial description, use as transcript
            print(f"  [SOUNDCLOUD] Using description as content ({len(description)} chars)")
            return {
                'status': 'success',
                'source': 'soundcloud_description',
                'raw_text': description,
                'title': metadata.get('title'),
                'author': metadata.get('author'),
                'publication_date': metadata.get('publication_date'),
                'duration_seconds': metadata.get('duration'),
                'metadata': metadata,
                'needs_transcription': False
            }

        # Step 3: Need to transcribe audio
        if self.audio_optimizer:
            print("  [SOUNDCLOUD] Transcription needed (optimized 2x speed)")
            # This would integrate with audio transcription
            # For now, return metadata indicating transcription needed
            return {
                'status': 'needs_transcription',
                'source': 'soundcloud_audio',
                'metadata': metadata,
                'needs_transcription': True,
                'estimated_cost': self._estimate_transcription_cost(metadata.get('duration', 1800))
            }
        else:
            # No optimizer available, return what we have
            return {
                'status': 'partial',
                'source': 'soundcloud_metadata',
                'raw_text': description,
                'title': metadata.get('title'),
                'author': metadata.get('author'),
                'publication_date': metadata.get('publication_date'),
                'metadata': metadata,
                'needs_transcription': True
            }

    def extract_metadata(self, url: str) -> Optional[Dict]:
        """
        Extract metadata from SoundCloud page.

        Args:
            url: SoundCloud URL

        Returns:
            Dict with metadata or None if failed
        """
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }

        try:
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()

            soup = BeautifulSoup(response.content, 'html.parser')

            # Strategy 1: Extract from embedded JSON-LD
            metadata = self._extract_from_jsonld(soup)
            if metadata:
                return metadata

            # Strategy 2: Extract from window.__sc_hydration
            metadata = self._extract_from_hydration(soup)
            if metadata:
                return metadata

            # Strategy 3: Use Open Graph tags
            return self._extract_from_opengraph(soup)

        except Exception as e:
            print(f"  [SOUNDCLOUD] Metadata extraction failed: {e}")
            return None

    def _extract_from_jsonld(self, soup: BeautifulSoup) -> Optional[Dict]:
        """Extract metadata from JSON-LD script tags."""
        try:
            jsonld_script = soup.find('script', type='application/ld+json')
            if jsonld_script:
                data = json.loads(jsonld_script.string)

                return {
                    'title': data.get('name'),
                    'description': data.get('description'),
                    'author': data.get('author', {}).get('name'),
                    'publication_date': data.get('datePublished'),
                    'duration': self._parse_duration(data.get('duration')),
                    'url': data.get('url')
                }
        except Exception as e:
            print(f"  [SOUNDCLOUD] Could not extract metadata from JSON-LD: {e}")

        return None

    def _extract_from_hydration(self, soup: BeautifulSoup) -> Optional[Dict]:
        """Extract metadata from SoundCloud's hydration data."""
        try:
            script_tags = soup.find_all('script')

            for script in script_tags:
                if script.string and 'window.__sc_hydration' in script.string:
                    # Extract JSON from JavaScript
                    json_match = re.search(
                        r'window\.__sc_hydration\s*=\s*(\[.*?\]);',
                        script.string,
                        re.DOTALL
                    )

                    if json_match:
                        data = json.loads(json_match.group(1))

                        # Navigate through SoundCloud's data structure
                        for item in data:
                            if item.get('hydratable') == 'sound':
                                sound_data = item.get('data', {})

                                return {
                                    'title': sound_data.get('title'),
                                    'description': sound_data.get('description'),
                                    'author': sound_data.get('user', {}).get('username'),
                                    'publication_date': sound_data.get('created_at'),
                                    'duration': sound_data.get('duration', 0) / 1000,  # ms to seconds
                                    'stream_url': self._get_stream_url(sound_data),
                                    'permalink_url': sound_data.get('permalink_url')
                                }
        except Exception as e:
            print(f"  [SOUNDCLOUD] Could not extract metadata from hydration data: {e}")

        return None

    def _extract_from_opengraph(self, soup: BeautifulSoup) -> Dict:
        """Extract metadata from Open Graph tags as fallback."""
        return {
            'title': self._get_meta_content(soup, 'og:title') or 'Unknown Title',
            'description': self._get_meta_content(soup, 'og:description') or '',
            'author': self._get_meta_content(soup, 'og:site_name') or 'SoundCloud User',
            'publication_date': None,
            'duration': 1800,  # Default 30 minutes
            'url': self._get_meta_content(soup, 'og:url')
        }

    def _get_meta_content(self, soup: BeautifulSoup, property_name: str) -> Optional[str]:
        """Get content from meta tag."""
        meta = soup.find('meta', property=property_name)
        return meta.get('content') if meta else None

    def _get_stream_url(self, sound_data: Dict) -> Optional[str]:
        """Extract stream URL from sound data."""
        try:
            transcodings = sound_data.get('media', {}).get('transcodings', [])
            if transcodings:
                return transcodings[0].get('url')
        except Exception as e:
            print(f"  [SOUNDCLOUD] Could not extract stream URL: {e}")

        return None

    def _parse_duration(self, duration_str: Optional[str]) -> int:
        """Parse ISO 8601 duration to seconds."""
        if not duration_str:
            return 1800  # Default 30 minutes

        try:
            # Parse PT#M#S format
            match = re.match(r'PT(?:(\d+)M)?(?:(\d+)S)?', duration_str)
            if match:
                minutes = int(match.group(1) or 0)
                seconds = int(match.group(2) or 0)
                return minutes * 60 + seconds
        except Exception as e:
            print(f"  [SOUNDCLOUD] Could not parse duration: {e}")

        return 1800

    def _estimate_transcription_cost(self, duration_seconds: float) -> float:
        """Estimate transcription cost for audio."""
        minutes = duration_seconds / 60.0

        if self.audio_optimizer:
            # 2x speed optimization
            effective_minutes = minutes / 2.0
            cost = effective_minutes * 0.024
        else:
            cost = minutes * 0.024

        return round(cost, 4)
