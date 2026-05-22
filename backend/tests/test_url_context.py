# -*- coding: utf-8 -*-
"""
Simple test script to validate URL Context integration.
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

# Load environment variables
load_dotenv()

from rosen_scraper import scraper

def test_url_context():
    """Test the URL Context functionality with a sample URL."""
    
    # Test with a well-known, accessible article
    test_url = "https://www.bbc.com/news/technology"
    
    print(f"Testing URL Context with: {test_url}")
    print("-" * 50)
    
    # Test URL Context directly
    print("\n1. Testing URL Context directly:")
    url_context_result = scraper.fetch_with_url_context(test_url)
    if url_context_result:
        print("✓ URL Context successful")
        print(f"  - Title: {url_context_result.get('title', 'N/A')}")
        print(f"  - Author: {url_context_result.get('author', 'N/A')}")
        print(f"  - Publication: {url_context_result.get('original_publication', 'N/A')}")
        print(f"  - Text length: {len(url_context_result.get('text', ''))}")
    else:
        print("✗ URL Context failed")
    
    # Test enhanced scraper
    print("\n2. Testing enhanced scraper:")
    content, is_structured = scraper.fetch_article_content_enhanced(test_url)
    if content:
        print(f"✓ Enhanced scraper successful (structured: {is_structured})")
        if is_structured:
            print(f"  - Structured data with keys: {list(content.keys())}")
        else:
            print(f"  - HTML content length: {len(content)}")
    else:
        print("✗ Enhanced scraper failed")
    
    # Test traditional scraper as fallback
    print("\n3. Testing traditional scraper:")
    html_content = scraper.fetch_article_content(test_url)
    if html_content:
        print("✓ Traditional scraper successful")
        print(f"  - HTML content length: {len(html_content)}")
    else:
        print("✗ Traditional scraper failed")

if __name__ == "__main__":
    # Check if API key is configured
    if not os.environ.get("GEMINI_API_KEY"):
        print("WARNING: GEMINI_API_KEY not found in environment variables")
        print("URL Context will be skipped, but traditional scraping should still work")
        print()
    
    test_url_context()
