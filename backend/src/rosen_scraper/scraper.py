# -*- coding: utf-8 -*-
"""
This module is responsible for fetching and extracting article content from URLs.
It employs a two-step "scraping cascade" to robustly handle both static and
dynamically-rendered web pages, and uses the trafilatura library for
intelligent content extraction.
"""

from typing import Optional, Dict, Any, Tuple
import random
import time
import requests
import trafilatura
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth
import os
from html import escape
from urllib.parse import urljoin, urlparse
from google import genai
from google.genai.types import GenerateContentConfig
from rosen_scraper.rate_limiter import rate_limited_gemini_call
from rosen_scraper.url_safety import (
    chromium_host_resolver_rules,
    is_safe_public_url,
    pinned_resolution,
    resolve_and_validate,
)


# A list of common user agents to rotate through for both requests and Playwright.
# This helps mimic real browser activity and can prevent being blocked by websites.
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
]

# Cap on redirect hops followed manually. requests' own default is 30; an
# article URL that needs more than a handful of hops is almost always wrong.
_MAX_REDIRECTS = 5

# Transient-failure retry policy for the fast HTTP scrape (issue #159).
# Connection errors, timeouts, and "try again later" status codes are retried
# with exponential backoff before the caller gives up and falls back to the
# slow Playwright render. Three attempts means two backoff waits: 0.5s then 1s.
_RETRY_MAX_ATTEMPTS = 3
_RETRY_BACKOFF_BASE_SECONDS = 0.5
_RETRYABLE_STATUS_CODES = frozenset({429, 500, 502, 503, 504})

# Minimum length, in characters, of the body text for a fast-scraped page with
# no semantic content wrapper to count as an already-rendered article rather
# than an empty single-page-application shell (issue #159). A real article body
# runs to thousands of characters; site chrome left after boilerplate removal
# rarely approaches this, and the Playwright fallback still catches anything
# shorter.
_MIN_RENDERED_TEXT_CHARS = 500

# Minimum text length for a semantic <article>/<main> element to count as a
# populated region. Above an empty SPA shell or skeleton placeholder, below a
# genuine short post — so a brief but fully rendered article skips Playwright.
_MIN_SEMANTIC_REGION_CHARS = 100

# Page regions that never hold the article body. Stripped before the content
# length is measured so navigation menus, cookie banners, and legal footers in
# an otherwise-empty SPA shell are not mistaken for a rendered article.
# <noscript> is deliberately kept: most only carry an "enable JavaScript"
# message (far below the length threshold), but some sites ship a full
# readable article fallback there that the fast path should still use.
#
# Two passes are needed because <header>/<footer>/<aside> appear both as page
# chrome AND as the article's own byline/section markup nested inside
# <article>/<main>. Stripping them globally drops the article's own title and
# byline from the semantic-region text count and pushes short, fully-rendered
# WordPress-style posts (<article><header class="entry-header">…</header>…)
# below the threshold, forcing an unneeded Playwright fallback.
_NON_CONTENT_TAGS_GLOBAL = ('script', 'style', 'template', 'nav')
_NON_CONTENT_TAGS_CHROME_ONLY = ('header', 'footer', 'aside')
# ARIA-role equivalents of the same chrome — cookie consent popups in
# particular tend to be untagged <div>s carrying role="dialog".
_NON_CONTENT_ROLES = ('navigation', 'banner', 'contentinfo',
                      'dialog', 'alertdialog')


def _get_with_retry(url: str, headers: Dict[str, str],
                    timeout: int) -> requests.Response:
    """GET ``url`` once, retrying transient failures with exponential backoff.

    A transient failure is either a network-level error
    (``requests.RequestException`` — connection reset, DNS hiccup, read
    timeout) or a "retry later" status code (429, 500, 502, 503, 504). Each
    retry waits ``_RETRY_BACKOFF_BASE_SECONDS * 2 ** attempt`` seconds, so a
    momentarily overloaded server is given room to recover before the caller
    gives up and falls back to the expensive Playwright render.

    Redirects are not followed here: the response is returned unchanged so the
    caller (``_requests_get_safe``) can re-validate each hop against the SSRF
    guard. A permanent 4xx (anything other than 429) is likewise returned
    immediately rather than retried.

    Args:
        url: The exact URL to fetch — a single redirect hop, not a chain.
        headers: Request headers, including the rotating User-Agent.
        timeout: Per-request timeout in seconds.

    Returns:
        The ``requests.Response``. If a transient status code never clears,
        the last response is still returned so the caller's
        ``raise_for_status`` can surface it.

    Raises:
        requests.RequestException: if every attempt fails with a network
            error. The final exception is re-raised so the caller can fall
            back to Playwright.
    """
    for attempt in range(_RETRY_MAX_ATTEMPTS):
        is_last_attempt = attempt == _RETRY_MAX_ATTEMPTS - 1
        try:
            response = requests.get(url, headers=headers, timeout=timeout,
                                    allow_redirects=False)
        except requests.RequestException as exc:
            if is_last_attempt:
                raise
            backoff = _RETRY_BACKOFF_BASE_SECONDS * (2 ** attempt)
            print(f"  [retry] request error ({exc}); retrying in {backoff:.1f}s")
            time.sleep(backoff)
            continue
        if response.status_code in _RETRYABLE_STATUS_CODES and not is_last_attempt:
            backoff = _RETRY_BACKOFF_BASE_SECONDS * (2 ** attempt)
            print(f"  [retry] HTTP {response.status_code} from {url}; "
                  f"retrying in {backoff:.1f}s")
            # Return the socket to requests' connection pool before sleeping
            # so retry-heavy runs do not stack idle connections until GC.
            response.close()
            time.sleep(backoff)
            continue
        return response
    # The loop always returns or raises on the final attempt; this line only
    # satisfies static analysis that every path produces a value.
    raise requests.RequestException(  # pragma: no cover
        f"request to {url} failed after {_RETRY_MAX_ATTEMPTS} attempts")


def _looks_like_rendered_content(html: str) -> bool:
    """Decide whether ``html`` already contains a server-rendered article.

    The fast HTTP scrape only needs the slow Playwright fallback when the page
    is an empty single-page-application shell whose body is injected by
    JavaScript. This replaces an earlier heuristic
    (``len(text) > 1500 and "javascript" not in text.lower()``) that rejected
    any page containing the substring "javascript" — present in almost every
    real page via script tags and ``<noscript>`` blocks — which forced nearly
    every page onto the Playwright path.

    The page is stripped of script/style and of site chrome (navigation,
    header, footer, sidebars, cookie dialogs), then two signals are checked.
    A populated semantic ``<article>`` or ``<main>`` element means the server
    already rendered the article — client-side SPA shells inject those via
    JavaScript and ship them empty or absent — so even a short post counts.
    Failing that, the body as a whole must carry at least
    ``_MIN_RENDERED_TEXT_CHARS`` characters of text, which catches articles
    whose body uses plain ``<div>`` or ``<section>`` markup with no semantic
    wrapper. A page matching neither signal is sent to Playwright.

    Args:
        html: The raw HTML returned by the fast HTTP request.

    Returns:
        True if the page can be parsed directly; False if it should be
        re-fetched with a full browser render.
    """
    if not html or not html.strip():
        return False
    soup = BeautifulSoup(html, 'html.parser')

    # Drop non-content regions so site chrome and boilerplate text never
    # counts toward the article-body length. The tag selector and find_all
    # return materialised lists, so decomposing while iterating is safe.
    for tag in soup(list(_NON_CONTENT_TAGS_GLOBAL)):
        tag.decompose()
    # <header>/<footer>/<aside> are stripped only when they are page chrome
    # (no <article>/<main> ancestor). The same tags inside an <article> are
    # the article's own title block / byline / pull-quote and must count
    # toward Signal 1, or short WordPress-style posts get pushed below
    # _MIN_SEMANTIC_REGION_CHARS and forced onto Playwright.
    for tag in soup(list(_NON_CONTENT_TAGS_CHROME_ONLY)):
        if tag.find_parent(['article', 'main']) is None:
            tag.decompose()
    for element in soup.find_all(attrs={'role': list(_NON_CONTENT_ROLES)}):
        element.decompose()

    # Signal 1: a semantic <article>/<main> region with real text. A populated
    # one is present only when the server rendered the article, so it accepts
    # short posts, announcements, and link items that signal 2 would miss.
    region = soup.find('article') or soup.find('main')
    if (region is not None
            and len(region.get_text(separator=' ', strip=True))
            >= _MIN_SEMANTIC_REGION_CHARS):
        return True

    # Signal 2: enough body text overall, for article bodies that use plain
    # <div>/<section> markup with no semantic wrapper.
    body = soup.body or soup
    body_text = body.get_text(separator=' ', strip=True)
    return len(body_text) >= _MIN_RENDERED_TEXT_CHARS


def _requests_get_safe(url: str, headers: Dict[str, str], timeout: int) -> requests.Response:
    """GET ``url``, re-validating every redirect hop against the SSRF guard.

    requests follows redirects automatically, so a URL that passes the
    entry-point safety check is still free to redirect to a private, loopback,
    or link-local host (for example a cloud metadata endpoint) and have the
    server fetch it anyway. To close that bypass we disable automatic
    redirects and re-check each Location target before following it, so no
    request is ever issued to an unsafe host.

    Each hop is fetched through ``_get_with_retry``, so transient network
    errors and 5xx responses are retried with backoff rather than aborting the
    whole fast-scrape attempt.

    Raises:
        requests.RequestException: if a hop is unsafe, the redirect chain is
            longer than ``_MAX_REDIRECTS``, or a hop fails every retry.
    """
    current = url
    for _ in range(_MAX_REDIRECTS + 1):
        ok, reason, ips = resolve_and_validate(current)
        if not ok:
            raise requests.RequestException(f"unsafe redirect target ({reason}): {current}")
        # Pin the connection to a validated IP so a low-TTL DNS record cannot
        # rebind this host to a private address between the check above and
        # requests' own resolution (DNS-rebinding TOCTOU).
        host = urlparse(current).hostname
        with pinned_resolution(host, ips):
            response = _get_with_retry(current, headers, timeout)
        if response.is_redirect or response.is_permanent_redirect:
            location = response.headers.get('Location')
            if not location:
                return response
            current = urljoin(current, location)
            continue
        return response
    raise requests.RequestException(f"exceeded {_MAX_REDIRECTS} redirects starting from {url}")


@rate_limited_gemini_call
def _call_gemini_url_context(client, model_id, prompt, tools):
    """
    Make a rate-limited call to Gemini API with URL Context tool.

    This function is decorated with rate limiting to prevent API throttling.

    Args:
        client: Gemini client instance
        model_id: Model ID to use
        prompt: The prompt to send
        tools: Tools configuration for URL Context

    Returns:
        The API response object
    """
    response = client.models.generate_content(
        model=model_id,
        contents=prompt,
        config=GenerateContentConfig(tools=tools)
    )
    return response

def fetch_with_url_context(url: str) -> Optional[Dict[str, Any]]:
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
        response = _call_gemini_url_context(client, model_id, prompt, tools)
        
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

def fetch_article_content(url: str) -> Optional[str]:
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
    # SSRF guard: refuse URLs that resolve to private/loopback/link-local
    # addresses or use a non-http(s) scheme before any network request runs.
    ok, reason = is_safe_public_url(url)
    if not ok:
        print(f"Refusing to fetch unsafe URL ({reason}): {url}")
        return None

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
        # Attempt 2: Fast, direct request. Redirects are followed manually so
        # each hop is re-checked by the SSRF guard (see _requests_get_safe).
        response = _requests_get_safe(url, headers, timeout=15)
        response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)

        # Use the fast scrape only when the page already carries a rendered
        # article body. An empty single-page-application shell is sent to
        # Playwright so its JavaScript can populate the content first.
        if _looks_like_rendered_content(response.text):
            print("Fast scrape successful.")
            return response.text
        else:
            print("Fast scrape returned an unrendered page. Falling back to Playwright.")
            
    except requests.RequestException as e:
        # Handle network errors or bad status codes from the initial request.
        print(f"Fast scrape failed: {e}. Falling back to Playwright.")

    # Attempt 3: Fallback to a full browser render using Playwright.
    # This is slower but can handle pages that rely heavily on JavaScript.
    print(f"Attempting full browser scrape with Playwright for: {url}")
    try:
        # Re-validate immediately before launch and pin Chromium's resolver to a
        # validated IP. Chromium resolves DNS in its own process, so the
        # in-process pin used by the requests path cannot reach it; the
        # --host-resolver-rules launch arg closes the same DNS-rebinding TOCTOU
        # for the main navigation. Subresource/redirect hosts stay covered by
        # the per-request route guard below.
        ok, reason, ips = resolve_and_validate(url)
        if not ok:
            print(f"Refusing to fetch unsafe URL ({reason}): {url}")
            return None
        launch_args = chromium_host_resolver_rules(urlparse(url).hostname, ips)
        with sync_playwright() as p:
            # Launch a headless Chromium browser instance.
            browser = p.chromium.launch(headless=True, args=launch_args)
            # Create a new browser context with a random user agent.
            context = browser.new_context(
                user_agent=random.choice(USER_AGENTS),
                java_script_enabled=True,
            )

            # SSRF guard for the browser path: Playwright follows redirects
            # internally, so re-check every request it makes — including a
            # redirected main-frame navigation — and abort any that targets a
            # private/loopback/link-local host.
            def _block_unsafe_requests(route):
                is_ok, _ = is_safe_public_url(route.request.url)
                if is_ok:
                    route.continue_()
                else:
                    route.abort()

            context.route("**/*", _block_unsafe_requests)

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

def fetch_article_content_enhanced(url: str) -> Tuple[Optional[Any], bool]:
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
    # SSRF guard (see fetch_article_content): reject unsafe URLs up front.
    ok, reason = is_safe_public_url(url)
    if not ok:
        print(f"Refusing to fetch unsafe URL ({reason}): {url}")
        return None, False

    # Attempt 1: URL Context for fastest structured extraction
    url_context_data = fetch_with_url_context(url)
    if url_context_data and url_context_data.get('text'):
        print("URL Context extraction successful. Returning structured data.")
        return url_context_data, True
    
    # Fall back to traditional HTML scraping
    html_content = fetch_article_content(url)
    return html_content, False

def extract_article_data(html_content: str, url: str) -> Optional[str]:
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
