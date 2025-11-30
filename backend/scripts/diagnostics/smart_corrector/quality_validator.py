# -*- coding: utf-8 -*-
"""
Quality Validation Module
Validates raw_text quality to determine if reprocessing is needed.
"""

import re
from typing import Dict, List, Tuple


class QualityValidator:
    """Validates raw_text quality and determines if reprocessing is needed."""

    # Quality thresholds
    MIN_VALID_QUALITY = 0.7  # Minimum score to be considered valid
    MIN_LENGTH_CHARS = 100   # Minimum text length
    GOOD_LENGTH_CHARS = 500  # Good length threshold

    # Error markers that indicate scraping failures
    ERROR_MARKERS = [
        'error', '404', '403', '500', 'not found', 'access denied',
        'subscription required', 'paywall', 'sign in', 'login required',
        'page not available', 'content unavailable'
    ]

    # HTML artifacts that indicate poor extraction
    HTML_PATTERNS = [
        r'<script[^>]*>.*?</script>',
        r'<style[^>]*>.*?</style>',
        r'<!DOCTYPE',
        r'<html[^>]*>',
        r'{.*?"@context".*?}',  # JSON-LD
        r'<div[^>]*>',
        r'<nav[^>]*>',
    ]

    def __init__(self):
        """Initialize the quality validator."""
        pass

    def validate(self, raw_text: str, url: str = '', content_type: str = 'article') -> Tuple[bool, float, List[str]]:
        """
        Validate raw_text quality.

        Args:
            raw_text: Text to validate
            url: Source URL (for context)
            content_type: Type of content (article/audio/video/social)

        Returns:
            Tuple of (is_valid, quality_score, issues_list)
        """
        issues = []
        quality_components = {}

        # Handle None or empty text
        if not raw_text:
            return False, 0.0, ['missing_raw_text']

        text_length = len(raw_text)

        # 1. Length validation
        if text_length < self.MIN_LENGTH_CHARS:
            issues.append('text_too_short')
            quality_components['length'] = 0.0
        elif text_length < 200:
            quality_components['length'] = 0.3
        elif text_length < self.GOOD_LENGTH_CHARS:
            quality_components['length'] = 0.7
        else:
            quality_components['length'] = 1.0

        # 2. HTML/Code artifacts detection
        artifact_count = 0
        for pattern in self.HTML_PATTERNS:
            if re.search(pattern, raw_text, re.DOTALL | re.IGNORECASE):
                artifact_count += 1

        if artifact_count > 0:
            issues.append('html_artifacts')
            quality_components['cleanliness'] = max(0, 1.0 - (artifact_count * 0.15))
        else:
            quality_components['cleanliness'] = 1.0

        # 3. Content coherence (uniqueness of words)
        words = raw_text.split()
        if len(words) > 10:
            unique_ratio = len(set(words)) / len(words)
            quality_components['coherence'] = unique_ratio

            # Check for excessive repetition (indicates scraping errors)
            if unique_ratio < 0.3:
                issues.append('excessive_repetition')
        else:
            quality_components['coherence'] = 0.3

        # 4. Error markers check
        error_count = sum(
            1 for marker in self.ERROR_MARKERS
            if marker.lower() in raw_text.lower()
        )

        if error_count > 2:
            issues.append('error_markers_present')
            quality_components['error_free'] = 0.0
        elif error_count > 0:
            quality_components['error_free'] = 0.5
        else:
            quality_components['error_free'] = 1.0

        # 5. Content-type specific checks
        type_quality = self._validate_content_type_specific(raw_text, content_type)
        quality_components['type_specific'] = type_quality['score']

        if type_quality.get('issues'):
            issues.extend(type_quality['issues'])

        # Calculate overall quality score
        if quality_components:
            quality_score = sum(quality_components.values()) / len(quality_components)
        else:
            quality_score = 0.0

        # Determine if valid (high score and no critical issues)
        is_valid = quality_score >= self.MIN_VALID_QUALITY and len(issues) == 0

        return is_valid, quality_score, issues

    def _validate_content_type_specific(self, raw_text: str, content_type: str) -> Dict:
        """Perform content-type specific validation."""
        result = {'score': 0.8, 'issues': []}  # Default

        if content_type == 'audio':
            # Audio transcripts should have speaker indicators or dialogue
            has_transcript_markers = any(
                marker in raw_text.lower()
                for marker in ['speaker', 'transcript', ':', 'said', 'asked', 'replied']
            )

            if not has_transcript_markers and len(raw_text) > 300:
                result['issues'].append('missing_transcript_format')
                result['score'] = 0.5
            else:
                result['score'] = 1.0

        elif content_type == 'video':
            # Video transcripts often have speaker labels or timestamps
            has_speaker_pattern = bool(re.search(r'[A-Z][a-z]+\s*:', raw_text))
            has_timestamp_pattern = bool(re.search(r'\[\d+:\d+\]|\d+:\d+', raw_text))

            if has_speaker_pattern or has_timestamp_pattern:
                result['score'] = 1.0
            else:
                result['score'] = 0.7

        elif content_type == 'social':
            # Social media should have thread markers or conversational structure
            has_thread_markers = bool(re.search(r'\[\d+/\d+\]', raw_text))
            has_reply_structure = 'replied' in raw_text.lower() or 'quoting' in raw_text.lower()

            if has_thread_markers or has_reply_structure:
                result['score'] = 1.0
            else:
                result['score'] = 0.8

        else:  # article
            # Articles should have paragraph structure
            paragraph_count = raw_text.count('\n\n')
            sentence_count = raw_text.count('.')

            if paragraph_count > 3 and sentence_count > 10:
                result['score'] = 1.0
            elif paragraph_count > 1 or sentence_count > 5:
                result['score'] = 0.8
            else:
                result['score'] = 0.5
                result['issues'].append('poor_article_structure')

        return result

    def get_quality_label(self, score: float) -> str:
        """Convert quality score to human-readable label."""
        if score >= 0.9:
            return 'excellent'
        elif score >= 0.7:
            return 'good'
        elif score >= 0.5:
            return 'fair'
        elif score >= 0.3:
            return 'poor'
        else:
            return 'very_poor'

    def should_reprocess(self, raw_text: str, url: str = '', content_type: str = 'article') -> bool:
        """
        Quick check if content should be reprocessed.

        Returns:
            True if reprocessing is recommended, False otherwise
        """
        is_valid, score, issues = self.validate(raw_text, url, content_type)
        return not is_valid or score < self.MIN_VALID_QUALITY
