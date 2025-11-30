# -*- coding: utf-8 -*-
"""
This module provides a URL dispatcher that determines the appropriate content
processor based on the URL's structure. It helps in routing URLs to the correct
handler (e.g., for video, articles, etc.).
"""

import re
from rosen_scraper.processors import article_processor, video_processor

def dispatch_url(url, schema):
    """
    Determines the content type of a URL and returns the appropriate processor.

    This function inspects the provided URL to identify its source (e.g., YouTube)
    and decides which processing pipeline should handle it. The default is 'article'
    if no other specific content type is matched.

    Args:
        url (str): The URL to be dispatched to a content processor.
        schema (dict): The classification schema to be used by the AI model.

    Returns:
        dict: A dictionary containing the processed data, or None if an error occurs.
    """
    # Use regular expressions to check if the URL is a YouTube link.
    # This covers both standard youtube.com URLs and shortened youtu.be links.
    if re.search(r"(youtube\.com|youtu\.be)", url):
        return video_processor.process_video(url, schema)
    else:
        # If the URL is not a video, default to the article processor.
        return article_processor.process_article(url, schema)

def reprocess_text(raw_text, schema):
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