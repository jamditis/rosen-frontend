# -*- coding: utf-8 -*-
"""
This module provides a URL dispatcher that determines the appropriate content
processor based on the URL's structure. It helps in routing URLs to the correct
handler (e.g., for video, articles, etc.).
"""

from typing import Optional, Dict, Any
import re
from rosen_scraper.processors import article_processor, video_processor
from rosen_scraper.processors.twitter_processor import TwitterProcessor
from rosen_scraper.processors.tumblr_processor import TumblrProcessor
from rosen_scraper.processors.clipping_processor import ClippingProcessor
from rosen_scraper.processors.bluesky_processor import BlueskyProcessor

def dispatch_url(url: str, schema: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Determines the content type of a URL and returns the appropriate processor.

    This function inspects the provided URL to identify its source (e.g., YouTube,
    Twitter, Tumblr, PDF) and decides which processing pipeline should handle it.
    The default is 'article' if no other specific content type is matched.

    Args:
        url (str): The URL to be dispatched to a content processor.
        schema (dict): The classification schema to be used by the AI model.

    Returns:
        dict: A dictionary containing the processed data, or None if an error occurs.
    """
    # YouTube videos
    if re.search(r"(youtube\.com|youtu\.be)", url):
        return video_processor.process_video(url, schema)

    # Twitter/X posts
    elif re.search(r"(twitter\.com|x\.com)/.*?/status/", url):
        processor = TwitterProcessor()
        result = processor.process(url)
        # If processing succeeded, add schema for AI analysis
        if result.get('status') == 'success' and result.get('raw_text'):
            # Run AI analysis on the extracted text
            ai_result = article_processor._run_ai_analysis(result['raw_text'], schema)
            if ai_result:
                result.update(ai_result)
        return result

    # Bluesky posts
    elif re.search(r"bsky\.app/profile/.*/post/", url):
        processor = BlueskyProcessor()
        result = processor.process(url)
        if result.get('status') == 'success' and result.get('raw_text'):
            ai_result = article_processor._run_ai_analysis(result['raw_text'], schema)
            if ai_result:
                result.update(ai_result)
        return result

    # Tumblr posts
    elif re.search(r"\.tumblr\.com", url):
        processor = TumblrProcessor()
        result = processor.process(url)
        if result.get('status') == 'success' and result.get('raw_text'):
            ai_result = article_processor._run_ai_analysis(result['raw_text'], schema)
            if ai_result:
                result.update(ai_result)
        return result

    # PDF newspaper clippings
    elif url.lower().endswith('.pdf') or 'pdf' in url.lower():
        processor = ClippingProcessor()
        result = processor.process(url)
        if result.get('status') == 'success' and result.get('raw_text'):
            ai_result = article_processor._run_ai_analysis(result['raw_text'], schema)
            if ai_result:
                result.update(ai_result)
        return result

    else:
        # If the URL is not a video or special content type, default to the article processor.
        return article_processor.process_article(url, schema)

def reprocess_text(raw_text: str, schema: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Reprocesses existing raw text using the AI analysis module.

    This function is designed to take text that has already been scraped and
    run it through the AI-powered analysis and classification process again.
    It's useful for updating or correcting data without needing to re-scrape
    the original URL.

    Args:
        raw_text (str): The raw text content to be re-analyzed.
        schema (dict): The classification schema to guide the AI model.

    Returns:
        dict: A dictionary containing the newly analyzed data, or None if an
              error occurs during processing.
    """
    # Directly use the AI analysis function from the article processor.
    # This assumes that any text reprocessing will follow the same logic
    # as the initial analysis of an article.
    return article_processor._run_ai_analysis(raw_text, schema)