# -*- coding: utf-8 -*-
"""
This module defines the processing pipeline for a single article. It orchestrates
the scraping of content and analysis by the AI model. PDF generation is handled
in the main workflow.
"""

from typing import Optional, Dict, Any
from rosen_scraper import scraper
import json
from rosen_scraper import categorizer
from rosen_scraper.processors import base

def _run_scraping(url: str) -> Optional[Dict[str, Any]]:
    """
    Scrapes the article content from the given URL using the enhanced scraper
    that includes URL Context support as the first step in the cascade.
    """
    print("  [Processor] Step 1: Fetching and extracting content...")
    
    # Use the enhanced scraper that can return either structured data or HTML
    content, is_structured = scraper.fetch_article_content_enhanced(url)
    
    if not content:
        print("  [Processor] Step 1 FAILED: Could not fetch content.")
        return None
    
    # If we got structured data from URL Context, use it directly
    if is_structured:
        article_data = content
        print("  [Processor] Step 1 SUCCESS: Content fetched via URL Context.")
    else:
        # Traditional HTML extraction path
        extracted_json = scraper.extract_article_data(content, url)
        if not extracted_json:
            print("  [Processor] Step 1 FAILED: Could not extract data.")
            return None

        try:
            article_data = json.loads(extracted_json)
        except json.JSONDecodeError:
            print("  [Processor] FAILED: Could not parse JSON from trafilatura.")
            return None
        
        print("  [Processor] Step 1 SUCCESS: Content fetched and extracted via HTML scraping.")

    if not article_data.get('text'):
        print("  [Processor] FAILED: Extracted data is missing the main 'text' body.")
        return None
    
    # Ensure raw_text is available for further processing
    if not article_data.get('raw_text'):
        article_data['raw_text'] = article_data['text']
    
    return article_data

def _run_ai_analysis(text: str, schema: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Runs the AI analysis on the given text.
    """
    print("  [Processor] Step 2: Performing AI analysis...")
    ai_analysis_data = categorizer.summarize_and_classify(text, schema)

    if not ai_analysis_data:
        print("  [Processor] Step 2 FAILED: AI analysis did not return complete data.")
        return None
    
    print("  [Processor] Step 2 SUCCESS: AI analysis complete.")
    return ai_analysis_data

def process_article(url: str, schema: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Processes a single article URL through a multi-step pipeline.
    """
    print(f"  [Processor] Starting full process for article: {url}")
    
    article_data = _run_scraping(url)
    if not article_data:
        return None

    ai_analysis_data = _run_ai_analysis(article_data['text'], schema)
    if not ai_analysis_data:
        return None
    
    # Merge AI fields without clobbering scraped values
    base.merge_ai_fields(article_data, ai_analysis_data, clobber=False)

    print(f"  [Processor] Finished processing article: {url}")
    return article_data
