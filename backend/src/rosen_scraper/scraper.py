# -*- coding: utf-8 -*-
"""
This module is responsible for fetching and extracting article content from URLs.
It employs a two-step "scraping cascade" to robustly handle both static and
dynamically-rendered web pages, and uses the trafilatura library for
intelligent content extraction.
"""

import random
import requests
import trafilatura
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth
import os
from html import escape
from google import genai
from google.genai.types import Tool, GenerateContentConfig


# A list of common user agents to rotate through for both requests and Playwright.
# This helps mimic real browser activity and can prevent being blocked by websites.
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
]

def fetch_with_url_context(url):
    """
    Attempts to fetch article content using Google's URL Context tool via Gemini API.
    This serves as the fastest method in our scraping cascade, providing structured
    content extraction without needing to download the full HTML.

    Args:
        url (str): The URL of the article to fetch.

    Returns:
        dict: A dictionary containing extracted content with keys like 'title', 'text', 
              'author', 'date', etc. Returns None if the API call fails.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("  [URL Context] GEMINI_API_KEY not found. Skipping URL Context method.")
        return None

    try:
        print(f"Attempting URL Context fetch for: {url}")
        
        # Initialize the Gemini client
        client = genai.Client(api_key=api_key)
        model_id = "gemini-2.5-flash"
        
        # Configure URL Context tool
        tools = [{"url_context": {}}]
        
        # Create a prompt to extract structured article data
        prompt = f"""
        Please extract the following information from the article at {url}:
        
        Return the data in this exact JSON format:
        {{
            "title": "Article title",
            "author": "Author name if available",
            "text": "Full article text content",
            "date": "Publication date if available",
            "original_publication": "Publication name if available",
            "raw_text": "Raw text content for further processing"
        }}
        
        If any field is not available, set it to null. Focus on extracting the main article content, excluding navigation, ads, and sidebar content.
        """
        
        # Make the API call with URL Context
        response = client.models.generate_content(
            model=model_id,
            contents=prompt,
            config=GenerateContentConfig(tools=tools)
        )
        
        # Extract the text response
        response_text = ""
        for part in response.candidates[0].content.parts:
            if part.text:
                response_text += part.text
        
        # Try to parse as JSON
        import json
        try:
            # Clean up the response to extract JSON
            cleaned_response = response_text.strip()
            if cleaned_response.startswith('```json'):
                cleaned_response = cleaned_response[7:]
            if cleaned_response.endswith('```'):
                cleaned_response = cleaned_response[:-3]
            cleaned_response = cleaned_response.strip()
            
            extracted_data = json.loads(cleaned_response)
            print("URL Context fetch successful.")
            return extracted_data
            
        except json.JSONDecodeError:
            # If JSON parsing fails, return the raw text
            print("URL Context returned non-JSON response, extracting text content.")
            return {
                "text": response_text,
                "raw_text": response_text,
                "title": None,
                "author": None,
                "date": None,
                "original_publication": None
            }
            
    except Exception as e:
        print(f"URL Context fetch failed: {e}")
        return None

def fetch_article_content(url):
    """
    Fetches the full HTML content of a URL using a "scraping cascade" approach.

    This method first attempts Google's URL Context tool for the fastest extraction.
    If that fails, it attempts a fast, simple HTTP request. If that also fails or
    returns minimal content (often a sign of a JavaScript-heavy page), it
    falls back to a full browser render using Playwright to ensure dynamic
    content is loaded.

    Args:
        url (str): The URL of the article to scrape.

    Returns:
        str: The HTML content of the page as a string, or None if all
             fetching methods fail.
    """
    # Attempt 1: URL Context for fastest structured extraction
    url_context_data = fetch_with_url_context(url)
    if url_context_data and url_context_data.get('text'):
        print("URL Context extraction successful. Returning structured data.")
        # Convert the structured data back to a format compatible with trafilatura
        # by creating a mock HTML structure
        mock_html = f"""
        <html>
        <head>
            <title>{escape(url_context_data.get('title', ''))}</title>
            <meta name="author" content="{escape(url_context_data.get('author', ''))}">
            <meta name="publication" content="{escape(url_context_data.get('original_publication', ''))}">
        </head>
        <body>
            <article>
                <h1>{escape(url_context_data.get('title', ''))}</h1>
                <div class="content">{escape(url_context_data.get('text', ''))}</div>
            </article>
        </body>
        </html>
        """
        return mock_html
    
    print(f"URL Context failed, attempting fast scrape for: {url}")
    # Select a random User-Agent to make the request appear more like a real user.
    headers = {'User-Agent': random.choice(USER_AGENTS)}
    
    try:
        # Attempt 2: Fast, direct request using the requests library.
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)
        
        # Check if the response contains a reasonable amount of content and no JS errors.
        if len(response.text) > 1500 and "javascript" not in response.text.lower():
            print("Fast scrape successful.")
            return response.text
        else:
            # If content is too short, it might be a loader for a single-page application.
            print("Fast scrape returned minimal content. Falling back to Playwright.")
            
    except requests.RequestException as e:
        # Handle network errors or bad status codes from the initial request.
        print(f"Fast scrape failed: {e}. Falling back to Playwright.")

    # Attempt 3: Fallback to a full browser render using Playwright.
    # This is slower but can handle pages that rely heavily on JavaScript.
    print(f"Attempting full browser scrape with Playwright for: {url}")
    try:
        with sync_playwright() as p:
            # Launch a headless Chromium browser instance.
            browser = p.chromium.launch(headless=True)
            # Create a new browser context with a random user agent.
            context = browser.new_context(
                user_agent=random.choice(USER_AGENTS),
                java_script_enabled=True,
            )
            page = context.new_page()
            Stealth().apply_stealth_sync(page)
            
            # Navigate to the URL and wait until the network is idle, indicating
            # that most dynamic content has likely loaded.
            # For more reliable scraping, it is recommended to wait for a specific selector 
            # that is unique to the article content.
            page.goto(url, timeout=90000, wait_until='networkidle')
            content = page.content()
            browser.close()
            
            print("Playwright scrape successful.")
            return content
            
    except Exception as e:
        # Catch any exceptions during the Playwright process.
        print(f"Playwright scrape also failed for {url}: {e}")
        return None

def fetch_article_content_enhanced(url):
    """
    Enhanced version that can return either HTML content or structured data.
    
    This method first attempts Google's URL Context tool for the fastest extraction.
    If URL Context succeeds, it returns the structured data directly.
    Otherwise, it falls back to the traditional HTML scraping cascade.

    Args:
        url (str): The URL of the article to scrape.

    Returns:
        tuple: (content, is_structured) where content is either HTML string or 
               structured dict, and is_structured is a boolean indicating the type.
    """
    # Attempt 1: URL Context for fastest structured extraction
    url_context_data = fetch_with_url_context(url)
    if url_context_data and url_context_data.get('text'):
        print("URL Context extraction successful. Returning structured data.")
        return url_context_data, True
    
    # Fall back to traditional HTML scraping
    html_content = fetch_article_content(url)
    return html_content, False

def extract_article_data(html_content, url):
    """
    Uses the trafilatura library to extract the main article content and
    metadata from raw HTML.

    Args:
        html_content (str): The raw HTML of the webpage.
        url (str): The original URL, which can help trafilatura resolve relative links.

    Returns:
        dict: A dictionary containing the extracted article text and metadata
              in JSON format, or None if extraction fails.
    """
    if not html_content:
        return None
    try:
        # Use trafilatura to intelligently parse the HTML and extract the core article.
        # It's configured to exclude comments and tables and to output structured JSON.
        return trafilatura.extract(
            html_content,
            include_comments=False,
            include_tables=False,
            output_format='json',
            url=url
        )
    except Exception as e:
        # Handle any errors that occur during the extraction process.
        print(f"An error occurred during trafilatura extraction for {url}: {e}")
        return None
