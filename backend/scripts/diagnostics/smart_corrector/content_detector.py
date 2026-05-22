# -*- coding: utf-8 -*-
"""
Content Type Detection Module
Automatically detects content type from URL patterns.
"""

import re
from typing import Dict
from urllib.parse import urlparse


class ContentDetector:
    """Detects content type from URL patterns."""

    # URL pattern definitions for each content type
    CONTENT_TYPE_PATTERNS = {
        'audio': [
            r'soundcloud\.com',
            r'\.mp3$',
            r'\.wav$',
            r'\.m4a$',
            r'podcasts\.apple\.com',
            r'spotify\.com/(episode|show)',
            r'anchor\.fm',
            r'spreaker\.com',
            r'simplecast\.com',
            r'libsyn\.com',
        ],
        'video': [
            r'youtube\.com|youtu\.be',
            r'c-span\.org',
            r'vimeo\.com',
            r'\.mp4$',
            r'wistia\.com',
            r'dailymotion\.com',
            r'video\.',  # Generic video subdomain
        ],
        'social': [
            r'twitter\.com|x\.com',
            r'facebook\.com',
            r'linkedin\.com/posts',
            r'threads\.net',
            r'bsky\.app',
            r'mastodon\.',
            r'reddit\.com',
        ],
        'article': [
            r'pressthink\.org',
            r'/\d{4}/\d{2}/',  # Date-based URLs (common for articles)
            r'medium\.com',
            r'substack\.com',
            r'\.html$',
            r'/article/',
            r'/post/',
            r'/blog/',
            r'\.com/\w+/\w+',  # Generic article pattern
        ]
    }

    # Domain-specific overrides
    DOMAIN_OVERRIDES = {
        'pressthink.org': 'article',
        'jayrosen.pressthink.org': 'article',
        'archive.pressthink.org': 'article',
        'soundcloud.com': 'audio',
        'youtube.com': 'video',
        'youtu.be': 'video',
        'c-span.org': 'video',
        'twitter.com': 'social',
        'x.com': 'social',
    }

    def detect(self, url: str) -> str:
        """
        Detect content type from URL.

        Args:
            url: URL to analyze

        Returns:
            Content type: 'article', 'audio', 'video', or 'social'
        """
        if not url:
            return 'article'  # Default fallback

        # Parse URL
        parsed = urlparse(url)
        domain = parsed.netloc.lower().replace('www.', '')

        # Check domain overrides first (most reliable)
        if domain in self.DOMAIN_OVERRIDES:
            return self.DOMAIN_OVERRIDES[domain]

        # Check URL patterns
        url_lower = url.lower()

        # Check each content type in priority order
        for content_type in ['video', 'audio', 'social', 'article']:
            patterns = self.CONTENT_TYPE_PATTERNS.get(content_type, [])
            for pattern in patterns:
                if re.search(pattern, url_lower):
                    return content_type

        # Default to article
        return 'article'

    def get_domain(self, url: str) -> str:
        """Extract domain from URL."""
        try:
            parsed = urlparse(url)
            return parsed.netloc.lower().replace('www.', '')
        except Exception:
            return ''

    def get_metadata(self, url: str) -> Dict[str, str]:
        """
        Get content type and additional metadata.

        Returns:
            Dict with content_type, domain, and confidence
        """
        content_type = self.detect(url)
        domain = self.get_domain(url)

        # Calculate confidence based on how we detected it
        confidence = 'high' if domain in self.DOMAIN_OVERRIDES else 'medium'

        return {
            'content_type': content_type,
            'domain': domain,
            'confidence': confidence,
            'url': url
        }

    def is_multimedia(self, url: str) -> bool:
        """Check if URL is multimedia (audio or video)."""
        content_type = self.detect(url)
        return content_type in ['audio', 'video']

    def requires_transcription(self, url: str) -> bool:
        """Check if content requires transcription."""
        return self.is_multimedia(url)
