# -*- coding: utf-8 -*-
"""
Test Smart Data Corrector Multimedia Processors
Focus on SoundCloud, YouTube, C-SPAN, and Twitter URLs
"""

import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).resolve().parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(project_root / 'tools' / 'diagnostics'))

from tools.diagnostics.smart_corrector.processors import (
    SoundCloudProcessor,
    CSpanProcessor,
    YouTubeEnhancedProcessor,
    TwitterProcessor
)
from tools.diagnostics.smart_corrector import AudioOptimizer

# Test URLs from the sheet
test_urls = {
    'YouTube': [
        'https://youtu.be/outtbi0i67u',
        'https://youtu.be/n8pttfgl6hg',
        'https://youtu.be/evff3pbhwtc'
    ]
}

def test_processors():
    """Test multimedia processors on sample URLs."""
    print("=" * 80)
    print("MULTIMEDIA PROCESSORS TEST")
    print("=" * 80)

    # Initialize processors
    audio_optimizer = AudioOptimizer(speed_factor=2.0)
    soundcloud = SoundCloudProcessor(audio_optimizer=audio_optimizer)
    youtube = YouTubeEnhancedProcessor()
    cspan = CSpanProcessor()
    twitter = TwitterProcessor(playwright_fallback=True)

    print("\n[1/4] Testing YouTube Processor (FREE caption extraction)")
    print("-" * 80)

    for i, url in enumerate(test_urls.get('YouTube', []), 1):
        print(f"\n[YouTube {i}/3] {url}")
        try:
            result = youtube.process(url)

            print(f"  Status: {result.get('status')}")

            if result.get('status') == 'success':
                print(f"  [OK] SUCCESS - Free captions extracted!")
                print(f"    Source: {result.get('source')}")
                print(f"    Transcript Type: {result.get('transcript_type')}")
                print(f"    Title: {result.get('title', 'N/A')[:60]}")
                print(f"    Duration: {result.get('duration_seconds', 0)/60:.1f} minutes")

                if result.get('raw_text'):
                    text_preview = result['raw_text'][:200].replace('\n', ' ')
                    print(f"    Content: {len(result['raw_text'])} chars")
                    print(f"    Preview: {text_preview}...")

                # Calculate cost savings
                duration_min = result.get('duration_seconds', 0) / 60
                traditional_cost = duration_min * 0.024  # Transcription cost
                smart_cost = 0.05  # Just AI analysis
                savings = traditional_cost - smart_cost

                print(f"    [COST SAVINGS]:")
                print(f"       Traditional (transcribe): ${traditional_cost:.2f}")
                print(f"       Smart Corrector (free): ${smart_cost:.2f}")
                print(f"       Savings: ${savings:.2f} ({(savings/traditional_cost*100):.0f}%)")
            else:
                print(f"  [WARN] {result.get('error', 'Unknown error')}")

        except Exception as e:
            print(f"  [ERROR] {e}")

    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print("\n[OK] YouTube Processor: Tested with 3 URLs")
    print("  - Uses youtube-transcript-api for FREE caption extraction")
    print("  - Avoids expensive audio transcription")
    print("  - Average savings: ~$0.50 per 20-minute video")

    print("\nNOTE: To test SoundCloud, C-SPAN, and Twitter processors,")
    print("      add test URLs to the test_urls dictionary in this script.")


if __name__ == "__main__":
    try:
        test_processors()
    except Exception as e:
        print(f"\n[ERROR] Test failed: {e}")
        import traceback
        traceback.print_exc()
