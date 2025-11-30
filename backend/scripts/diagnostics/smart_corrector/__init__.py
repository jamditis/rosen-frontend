# -*- coding: utf-8 -*-
"""
Smart Data Corrector Module
Intelligent data correction and enrichment for the Rosen Archive.
"""

from .content_detector import ContentDetector
from .quality_validator import QualityValidator
from .audio_optimizer import AudioOptimizer
from .cost_tracker import CostTracker
from .pdf_generator import SmartCorrectorPDFGenerator

__all__ = [
    'ContentDetector',
    'QualityValidator',
    'AudioOptimizer',
    'CostTracker',
    'SmartCorrectorPDFGenerator'
]

__version__ = '1.1.0'
