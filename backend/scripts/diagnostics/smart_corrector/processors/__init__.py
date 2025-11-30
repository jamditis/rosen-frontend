# -*- coding: utf-8 -*-
"""
Smart Data Corrector - Multimedia Processors
Specialized processors for different content types.
"""

from .soundcloud_processor import SoundCloudProcessor
from .cspan_processor import CSpanProcessor
from .youtube_processor import YouTubeEnhancedProcessor
from .twitter_processor import TwitterProcessor

__all__ = [
    'SoundCloudProcessor',
    'CSpanProcessor',
    'YouTubeEnhancedProcessor',
    'TwitterProcessor'
]
