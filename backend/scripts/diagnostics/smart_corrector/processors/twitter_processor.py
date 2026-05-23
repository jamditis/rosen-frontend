# -*- coding: utf-8 -*-
"""
Twitter/X Thread Processor
Extracts threads and tweets using Nitter proxy and Playwright fallback.
"""

import re
import time
import requests
from typing import Dict, Optional
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout


class TwitterProcessor:
    """Process Twitter/X threads and individual tweets."""

    # Public Nitter instances (rotate if one fails)
    NITTER_INSTANCES = [
        'https://nitter.net',
        'https://nitter.poast.org',
        'https://nitter.privacydev.net',
        'https://nitter.unixfox.eu'
    ]

    def __init__(self, playwright_fallback: bool = True):
        """
        Initialize Twitter processor.

        Args:
            playwright_fallback: Enable Playwright fallback if Nitter fails
        """
        self.playwright_fallback = playwright_fallback
        self.current_nitter_instance = 0

    def process(self, url: str) -> Dict:
        """
        Process a Twitter/X URL.

        Args:
            url: Twitter/X URL (twitter.com or x.com)

        Returns:
            Dict with processed data
        """
        print(f"  [TWITTER] Processing: {url}")

        # Normalize URL to x.com format
        normalized_url = url.replace('twitter.com', 'x.com')

        # Extract tweet ID
        tweet_id = self._extract_tweet_id(normalized_url)
        if not tweet_id:
            return {'status': 'failed', 'error': 'Could not extract tweet ID'}

        print(f"  [TWITTER] Tweet ID: {tweet_id}")

        # Strategy 1: Try Nitter proxy (fast, no authentication)
        result = self._try_nitter_extraction(normalized_url)
        if result['status'] == 'success':
            print(f"  [TWITTER] Nitter extraction successful ({len(result['raw_text'])} chars)")
            return result

        # Strategy 2: Playwright fallback (slower, more reliable)
        if self.playwright_fallback:
            print("  [TWITTER] Nitter failed, trying Playwright fallback...")
            result = self._try_playwright_extraction(normalized_url)
            if result['status'] == 'success':
                print(f"  [TWITTER] Playwright extraction successful ({len(result['raw_text'])} chars)")
                return result

        # All strategies failed
        print("  [TWITTER] All extraction methods failed")
        return {
            'status': 'failed',
            'error': 'Could not extract tweet content with any method',
            'url': normalized_url
        }

    def _extract_tweet_id(self, url: str) -> Optional[str]:
        """
        Extract tweet ID from Twitter/X URL.

        Supports:
        - twitter.com/user/status/123456789
        - x.com/user/status/123456789
        """
        match = re.search(r'/status/(\d+)', url)
        if match:
            return match.group(1)
        return None

    def _try_nitter_extraction(self, url: str) -> Dict:
        """
        Try extracting tweet using Nitter proxy instances.

        Args:
            url: Twitter/X URL

        Returns:
            Dict with status and extracted data
        """
        # Try all Nitter instances
        for attempt, nitter_instance in enumerate(self.NITTER_INSTANCES):
            try:
                # Convert x.com URL to Nitter URL
                nitter_url = url.replace('https://x.com', nitter_instance)
                nitter_url = nitter_url.replace('https://twitter.com', nitter_instance)

                print(f"  [NITTER] Trying instance {attempt + 1}/{len(self.NITTER_INSTANCES)}: {nitter_instance}")

                # Make request with timeout
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
                response = requests.get(nitter_url, headers=headers, timeout=15)

                if response.status_code == 200:
                    # Parse with BeautifulSoup
                    soup = BeautifulSoup(response.content, 'html.parser')

                    # Extract thread data
                    thread_data = self._parse_nitter_thread(soup)

                    if thread_data and thread_data['text']:
                        return {
                            'status': 'success',
                            'source': 'twitter_nitter',
                            'raw_text': thread_data['text'],
                            'title': thread_data.get('title'),
                            'author': thread_data.get('author'),
                            'publication_date': thread_data.get('date'),
                            'metadata': thread_data.get('metadata', {}),
                            'is_thread': thread_data.get('is_thread', False),
                            'tweet_count': thread_data.get('tweet_count', 1)
                        }

            except requests.RequestException as e:
                print(f"  [NITTER] Instance {nitter_instance} failed: {e}")
                continue
            except Exception as e:
                print(f"  [NITTER] Parsing error: {e}")
                continue

        # All Nitter instances failed
        return {'status': 'failed', 'error': 'All Nitter instances failed'}

    def _parse_nitter_thread(self, soup: BeautifulSoup) -> Optional[Dict]:
        """
        Parse thread data from Nitter HTML.

        Args:
            soup: BeautifulSoup object of Nitter page

        Returns:
            Dict with thread data or None
        """
        try:
            # Find main tweet container
            main_tweet = soup.find('div', class_='main-tweet')
            if not main_tweet:
                return None

            # Extract author
            author_elem = main_tweet.find('a', class_='username')
            author = author_elem.get_text(strip=True) if author_elem else 'Unknown'

            # Extract timestamp
            date_elem = main_tweet.find('span', class_='tweet-date')
            date = None
            if date_elem:
                date_link = date_elem.find('a')
                if date_link and date_link.get('title'):
                    date = date_link['title']

            # Extract main tweet text
            tweet_content = main_tweet.find('div', class_='tweet-content')
            main_text = tweet_content.get_text(separator='\n', strip=True) if tweet_content else ''

            # Extract media alt-text if available
            media_descriptions = []
            attachments = main_tweet.find_all('div', class_='attachment')
            for attachment in attachments:
                img = attachment.find('img')
                if img and img.get('alt'):
                    media_descriptions.append(f"[Image: {img['alt']}]")

            # Check for thread continuation
            thread_tweets = soup.find_all('div', class_='timeline-item')
            is_thread = len(thread_tweets) > 1

            # Combine thread if exists
            thread_parts = [main_text]

            if is_thread:
                for item in thread_tweets:
                    # Skip if this is the main tweet
                    if 'main-thread' in item.get('class', []):
                        continue

                    tweet_content = item.find('div', class_='tweet-content')
                    if tweet_content:
                        text = tweet_content.get_text(separator='\n', strip=True)
                        if text and text not in thread_parts:
                            thread_parts.append(text)

                        # Get media from thread tweets
                        attachments = item.find_all('div', class_='attachment')
                        for attachment in attachments:
                            img = attachment.find('img')
                            if img and img.get('alt'):
                                media_descriptions.append(f"[Image: {img['alt']}]")

            # Combine all parts
            full_text = '\n\n'.join(thread_parts)

            # Add media descriptions
            if media_descriptions:
                full_text += '\n\n' + '\n'.join(media_descriptions)

            # Extract quote tweets if present
            quote_tweet = main_tweet.find('div', class_='quote')
            if quote_tweet:
                quote_author = quote_tweet.find('a', class_='username')
                quote_content = quote_tweet.find('div', class_='quote-text')

                if quote_author and quote_content:
                    quote_text = f"\n\n[Quoted tweet from {quote_author.get_text(strip=True)}]\n{quote_content.get_text(strip=True)}"
                    full_text += quote_text

            return {
                'text': full_text,
                'title': f"Tweet by {author}",
                'author': author,
                'date': date,
                'is_thread': is_thread,
                'tweet_count': len(thread_parts),
                'metadata': {
                    'has_media': len(media_descriptions) > 0,
                    'has_quote_tweet': quote_tweet is not None,
                    'extraction_method': 'nitter'
                }
            }

        except Exception as e:
            print(f"  [NITTER] Parse error: {e}")
            return None

    def _try_playwright_extraction(self, url: str) -> Dict:
        """
        Extract tweet using Playwright (fallback method).

        Args:
            url: Twitter/X URL

        Returns:
            Dict with status and extracted data
        """
        try:
            with sync_playwright() as p:
                # Launch browser in headless mode
                browser = p.chromium.launch(headless=True)

                context = browser.new_context(
                    user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    viewport={'width': 1280, 'height': 720}
                )

                page = context.new_page()

                # Navigate to tweet
                print(f"  [PLAYWRIGHT] Loading: {url}")
                page.goto(url, wait_until='networkidle', timeout=30000)

                # Wait for content to load
                time.sleep(3)

                # Try to expand "Show more" buttons in threads
                try:
                    show_more_buttons = page.locator('[aria-label*="Show"]').all()
                    for button in show_more_buttons[:10]:  # Limit to prevent infinite loops
                        try:
                            button.click(timeout=2000)
                            time.sleep(0.5)
                        except Exception:
                            continue
                except Exception as e:
                    print(f"  [TWITTER] Could not expand 'Show more' buttons: {e}")

                # Extract page content
                html = page.content()
                soup = BeautifulSoup(html, 'html.parser')

                # Extract tweet data
                thread_data = self._parse_twitter_html(soup, url)

                browser.close()

                if thread_data and thread_data['text']:
                    return {
                        'status': 'success',
                        'source': 'twitter_playwright',
                        'raw_text': thread_data['text'],
                        'title': thread_data.get('title'),
                        'author': thread_data.get('author'),
                        'publication_date': thread_data.get('date'),
                        'metadata': thread_data.get('metadata', {}),
                        'is_thread': thread_data.get('is_thread', False)
                    }
                else:
                    return {'status': 'failed', 'error': 'Could not extract tweet content'}

        except PlaywrightTimeout:
            return {'status': 'failed', 'error': 'Playwright timeout - page took too long to load'}
        except Exception as e:
            return {'status': 'failed', 'error': f'Playwright extraction failed: {str(e)}'}

    def _parse_twitter_html(self, soup: BeautifulSoup, url: str) -> Optional[Dict]:
        """
        Parse Twitter/X HTML from Playwright.

        Args:
            soup: BeautifulSoup object
            url: Original URL

        Returns:
            Dict with tweet data or None
        """
        try:
            # Twitter uses article tags for tweets
            tweets = soup.find_all('article', {'data-testid': 'tweet'})

            if not tweets:
                # Try alternative selectors
                tweets = soup.find_all('div', {'data-testid': 'tweetText'})

            if not tweets:
                return None

            # Extract all tweet texts (for threads)
            tweet_texts = []
            author = None
            date = None

            for tweet in tweets:
                # Extract text
                text_elem = tweet.find('div', {'data-testid': 'tweetText'})
                if text_elem:
                    text = text_elem.get_text(separator='\n', strip=True)
                    if text and text not in tweet_texts:
                        tweet_texts.append(text)

                # Extract author (from first tweet)
                if not author:
                    author_elem = tweet.find('div', {'data-testid': 'User-Name'})
                    if author_elem:
                        author_link = author_elem.find('a')
                        if author_link:
                            author = author_link.get_text(strip=True)

                # Extract timestamp (from first tweet)
                if not date:
                    time_elem = tweet.find('time')
                    if time_elem and time_elem.get('datetime'):
                        date = time_elem['datetime']

            if not tweet_texts:
                return None

            # Combine thread
            full_text = '\n\n'.join(tweet_texts)

            return {
                'text': full_text,
                'title': f"Tweet by {author or 'Unknown'}",
                'author': author,
                'date': date,
                'is_thread': len(tweet_texts) > 1,
                'tweet_count': len(tweet_texts),
                'metadata': {
                    'extraction_method': 'playwright',
                    'url': url
                }
            }

        except Exception as e:
            print(f"  [PLAYWRIGHT] Parse error: {e}")
            return None
