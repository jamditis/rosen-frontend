#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test script to verify HTML escaping in mock HTML generation.
This test ensures that user content is properly escaped to prevent XSS vulnerabilities.
"""

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

# Add project root to path
ROOT_DIR = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from rosen_scraper.scraper import fetch_article_content


def test_html_escaping_in_mock_html():
    """Test that HTML special characters are properly escaped in mock HTML generation."""
    print("\n" + "="*60)
    print("Testing HTML Escaping in Mock HTML Generation")
    print("="*60)
    
    # Test data with HTML special characters that should be escaped
    malicious_data = {
        'title': '<script>alert("XSS")</script>',
        'author': 'Test & Author <tag>',
        'original_publication': 'Test "Publication" & More',
        'text': '<img src=x onerror=alert("XSS")> Some text with & and < and >'
    }
    
    # Mock the fetch_with_url_context function to return our test data
    with patch('rosen_scraper.scraper.fetch_with_url_context') as mock_fetch:
        mock_fetch.return_value = malicious_data
        
        # Call the function
        result = fetch_article_content("https://example.com/test")
        
        # Verify that HTML special characters are escaped
        assert result is not None, "Result should not be None"
        
        # Check that dangerous content is NOT present in its original form
        assert '<script>' not in result, "Original script tags should not be present"
        assert 'alert("XSS")' not in result, "Unescaped alert should not be present"
        assert '<img src=x onerror=' not in result, "Dangerous img tag should not be present"
        
        # Verify that escaped versions ARE present
        assert '&lt;script&gt;' in result, "Script tags should be escaped to &lt;script&gt;"
        assert '&lt;' in result, "< should be escaped to &lt;"
        assert '&gt;' in result, "> should be escaped to &gt;"
        assert '&amp;' in result, "& should be escaped to &amp;"
        assert '&quot;' in result, 'Double quotes should be escaped to &quot;'
        
        # Verify specific escaped content is present
        assert 'Test &amp; Author' in result, "Escaped ampersand in author should be present"
        
        print("✓ HTML special characters are properly escaped")
        print(f"✓ Script tags are neutralized")
        print(f"✓ Ampersands are escaped")
        print(f"✓ Quotes are escaped")
        print(f"✓ Angle brackets are escaped")


def test_normal_content_still_works():
    """Test that normal content without special characters still works correctly."""
    print("\n" + "="*60)
    print("Testing Normal Content Processing")
    print("="*60)
    
    # Normal data without HTML special characters
    normal_data = {
        'title': 'A Normal Article Title',
        'author': 'John Doe',
        'original_publication': 'Example Publication',
        'text': 'This is normal text without any special characters.'
    }
    
    # Mock the fetch_with_url_context function
    with patch('rosen_scraper.scraper.fetch_with_url_context') as mock_fetch:
        mock_fetch.return_value = normal_data
        
        # Call the function
        result = fetch_article_content("https://example.com/normal")
        
        # Verify that normal content is present
        assert result is not None, "Result should not be None"
        assert 'A Normal Article Title' in result, "Title should be present"
        assert 'John Doe' in result, "Author should be present"
        assert 'Example Publication' in result, "Publication should be present"
        assert 'This is normal text' in result, "Text content should be present"
        
        print("✓ Normal content is processed correctly")
        print("✓ Title is preserved")
        print("✓ Author is preserved")
        print("✓ Publication is preserved")
        print("✓ Text content is preserved")


def test_empty_fields_handled():
    """Test that empty or missing fields are handled correctly."""
    print("\n" + "="*60)
    print("Testing Empty/Missing Fields Handling")
    print("="*60)
    
    # Data with some empty fields
    sparse_data = {
        'title': '',
        'author': '',
        'original_publication': '',
        'text': 'Only text is present'
    }
    
    # Mock the fetch_with_url_context function
    with patch('rosen_scraper.scraper.fetch_with_url_context') as mock_fetch:
        mock_fetch.return_value = sparse_data
        
        # Call the function
        result = fetch_article_content("https://example.com/sparse")
        
        # Verify that result is valid HTML even with empty fields
        assert result is not None, "Result should not be None"
        assert '<title></title>' in result or '<title/>' in result, "Empty title should be handled"
        assert 'Only text is present' in result, "Text content should be present"
        
        print("✓ Empty fields are handled correctly")
        print("✓ Missing data does not break HTML generation")


if __name__ == "__main__":
    print("\n" + "="*70)
    print(" HTML ESCAPING SECURITY TEST SUITE")
    print("="*70)
    
    try:
        # Run all tests
        test_html_escaping_in_mock_html()
        test_normal_content_still_works()
        test_empty_fields_handled()
        
        print("\n" + "="*70)
        print(" ✓ ALL TESTS PASSED")
        print("="*70)
        print("\nConclusion: HTML escaping is working correctly.")
        print("User content is properly sanitized to prevent XSS vulnerabilities.")
        
    except AssertionError as e:
        print(f"\n✗ TEST FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
