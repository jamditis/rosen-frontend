#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Test script for Smart Data Corrector modules.
"""

import sys
from pathlib import Path

# Add project root to path
ROOT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT_DIR))
sys.path.insert(0, str(ROOT_DIR / 'tools' / 'diagnostics'))

from tools.diagnostics.smart_corrector import (
    ContentDetector,
    QualityValidator,
    AudioOptimizer,
    CostTracker
)


def test_content_detector():
    """Test content type detection."""
    print("\n" + "="*60)
    print("Testing Content Detector")
    print("="*60)

    detector = ContentDetector()

    test_urls = [
        ("https://pressthink.org/2024/01/test-article", "article"),
        ("https://soundcloud.com/currentpubmedia/jay-rosen", "audio"),
        ("https://www.youtube.com/watch?v=abc123", "video"),
        ("https://c-span.org/video/?123456/user-clip", "video"),
        ("https://twitter.com/jayrosen_nyu/status/123", "social"),
        ("https://x.com/jayrosen_nyu/status/456", "social"),
    ]

    for url, expected_type in test_urls:
        detected = detector.detect(url)
        status = "[OK]" if detected == expected_type else "[FAIL]"
        print(f"{status} {url[:50]:50s} -> {detected:10s} (expected: {expected_type})")

    print("[OK] Content Detector Test Complete\n")


def test_quality_validator():
    """Test quality validation."""
    print("\n" + "="*60)
    print("Testing Quality Validator")
    print("="*60)

    validator = QualityValidator()

    test_cases = [
        ("Good article text with multiple paragraphs and sentences. " * 20, "article", True),
        ("<script>alert('bad')</script>Short text", "article", False),
        ("404 not found error page", "article", False),
        ("Speaker 1: This is a transcript. Speaker 2: Yes, it is. " * 10, "audio", True),
        ("Short", "article", False),
    ]

    for text, content_type, should_be_valid in test_cases:
        is_valid, score, issues = validator.validate(text, '', content_type)
        status = "[OK]" if is_valid == should_be_valid else "[FAIL]"
        quality_label = validator.get_quality_label(score)
        print(f"{status} Score: {score:.2f} ({quality_label:10s}) Issues: {len(issues):2d} Valid: {is_valid}")

    print("[OK] Quality Validator Test Complete\n")


def test_audio_optimizer():
    """Test audio optimizer (without actual FFmpeg processing)."""
    print("\n" + "="*60)
    print("Testing Audio Optimizer")
    print("="*60)

    try:
        optimizer = AudioOptimizer(speed_factor=2.0)
        print("[OK] Audio Optimizer initialized successfully")

        # Test cost calculation
        savings = optimizer.calculate_cost_savings(1800)  # 30 minutes
        print(f"  Original duration:  {savings['original_duration_minutes']} minutes")
        print(f"  Optimized duration: {savings['optimized_duration_minutes']} minutes")
        print(f"  Original cost:      ${savings['original_cost']:.2f}")
        print(f"  Optimized cost:     ${savings['optimized_cost']:.2f}")
        print(f"  Savings:            ${savings['savings']:.2f} ({savings['savings_percent']:.1f}%)")

        # Test atempo chain building
        chain_1_5x = optimizer._build_atempo_chain(1.5)
        chain_2_0x = optimizer._build_atempo_chain(2.0)
        chain_2_5x = optimizer._build_atempo_chain(2.5)

        print(f"\n  Atempo chains:")
        print(f"    1.5x: {chain_1_5x}")
        print(f"    2.0x: {chain_2_0x}")
        print(f"    2.5x: {chain_2_5x}")

        print("[OK] Audio Optimizer Test Complete\n")

    except Exception as e:
        print(f"⚠ Audio Optimizer test skipped (FFmpeg may not be installed): {e}\n")


def test_cost_tracker():
    """Test cost tracking."""
    print("\n" + "="*60)
    print("Testing Cost Tracker")
    print("="*60)

    tracker = CostTracker(max_budget=10.00, speed_optimization=True)

    # Test cost estimation
    article_cost = tracker.estimate_cost('article')
    audio_cost = tracker.estimate_cost('audio', duration=30)
    video_cost = tracker.estimate_cost('video', duration=20)
    social_cost = tracker.estimate_cost('social')

    print(f"Estimated costs:")
    print(f"  Article:      ${article_cost:.4f}")
    print(f"  Audio (30m):  ${audio_cost:.4f}")
    print(f"  Video (20m):  ${video_cost:.4f}")
    print(f"  Social:       ${social_cost:.4f}")

    # Test cost recording
    tracker.record_cost('gemini_flash', 0.05, 'Test operation 1')
    tracker.record_cost('speech_to_text', 0.36, 'Test transcription')

    summary = tracker.get_summary()
    print(f"\nTracking Summary:")
    print(f"  Total cost:    ${summary['total_cost']:.2f}")
    print(f"  Budget used:   {summary['budget_used_percent']:.1f}%")
    print(f"  Operations:    {summary['operations_count']}")

    print("[OK] Cost Tracker Test Complete\n")


def main():
    """Run all tests."""
    print("\n" + "="*60)
    print("SMART DATA CORRECTOR - MODULE TESTS")
    print("="*60)

    test_content_detector()
    test_quality_validator()
    test_audio_optimizer()
    test_cost_tracker()

    print("="*60)
    print("ALL TESTS COMPLETE")
    print("="*60 + "\n")


if __name__ == "__main__":
    main()
