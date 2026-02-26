# Multimedia Processing Implementation Examples
**Smart Data Corrector - Technical Reference**

This document provides concrete code examples for handling different multimedia content types.

---

## 1. SoundCloud Audio Processing

### Challenge
SoundCloud embeds audio that needs transcription, but doesn't always provide transcripts.

### Solution Strategy
```python
def process_soundcloud_audio(url):
    """
    Multi-step strategy for SoundCloud content:
    1. Check for embedded transcript/description
    2. Download audio if needed
    3. Transcribe using Google Speech-to-Text
    4. Cache transcript for future use
    """

    # Step 1: Get metadata and check for existing text
    metadata = extract_soundcloud_metadata(url)

    # Step 2: Use description as fallback
    description = metadata.get('description', '')
    if len(description) > 500:  # Substantial description
        return {
            'raw_text': description,
            'source': 'soundcloud_description',
            'needs_transcription': False
        }

    # Step 3: Transcribe audio
    audio_url = metadata.get('stream_url')
    if audio_url:
        transcript = transcribe_audio_url(audio_url, metadata.get('duration'))
        return {
            'raw_text': transcript,
            'source': 'google_speech_to_text',
            'duration': metadata.get('duration'),
            'needs_transcription': False
        }

    return None


def extract_soundcloud_metadata(url):
    """Extract metadata from SoundCloud page."""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

    response = requests.get(url, headers=headers)
    soup = BeautifulSoup(response.content, 'html.parser')

    # SoundCloud embeds data in script tags
    script_tags = soup.find_all('script')

    for script in script_tags:
        if 'window.__sc_hydration' in script.text:
            # Parse the embedded JSON data
            import json
            import re

            # Extract JSON from JavaScript
            json_match = re.search(r'window\.__sc_hydration\s*=\s*(\[.*?\]);', script.text, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group(1))

                # Navigate through SoundCloud's data structure
                for item in data:
                    if item.get('hydratable') == 'sound':
                        sound_data = item.get('data', {})
                        return {
                            'title': sound_data.get('title'),
                            'description': sound_data.get('description'),
                            'duration': sound_data.get('duration') / 1000,  # ms to seconds
                            'author': sound_data.get('user', {}).get('username'),
                            'publication_date': sound_data.get('created_at'),
                            'stream_url': sound_data.get('media', {}).get('transcodings', [{}])[0].get('url')
                        }

    # Fallback: Use Open Graph tags
    return {
        'title': soup.find('meta', property='og:title').get('content') if soup.find('meta', property='og:title') else 'Unknown',
        'description': soup.find('meta', property='og:description').get('content') if soup.find('meta', property='og:description') else '',
        'author': soup.find('meta', property='og:site_name').get('content') if soup.find('meta', property='og:site_name') else 'SoundCloud'
    }


def transcribe_audio_url(audio_url, duration_seconds):
    """
    Transcribe audio using Google Cloud Speech-to-Text.

    Cost calculation:
    - Standard model: $0.024 per minute
    - 30-minute podcast: ~$0.72
    """
    import io
    from google.cloud import speech

    # Initialize client (credentials from environment)
    client = speech.SpeechClient()

    # Download audio to temporary file
    import tempfile
    import subprocess

    with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as temp_audio:
        # Download using yt-dlp (already in requirements)
        subprocess.run([
            'yt-dlp',
            '-x',  # Extract audio
            '--audio-format', 'mp3',
            '-o', temp_audio.name,
            audio_url
        ], capture_output=True)

        # Convert to format Google STT accepts (LINEAR16, mono, 16000 Hz)
        wav_file = temp_audio.name.replace('.mp3', '.wav')
        subprocess.run([
            'ffmpeg',
            '-i', temp_audio.name,
            '-ac', '1',  # Mono
            '-ar', '16000',  # 16kHz sample rate
            '-acodec', 'pcm_s16le',  # LINEAR16
            wav_file
        ], capture_output=True)

        # Read audio file
        with io.open(wav_file, 'rb') as audio_file:
            content = audio_file.read()

        # Configure recognition
        audio = speech.RecognitionAudio(content=content)
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=16000,
            language_code='en-US',
            enable_automatic_punctuation=True,
            enable_word_time_offsets=False,  # Save tokens
            model='latest_long'  # Best for podcasts
        )

        # Perform transcription
        print(f"  [STT] Transcribing {duration_seconds/60:.1f} minutes of audio...")
        operation = client.long_running_recognize(config=config, audio=audio)
        response = operation.result(timeout=600)  # 10 min timeout

        # Extract transcript
        transcript = ' '.join([
            result.alternatives[0].transcript
            for result in response.results
        ])

        # Clean up temp files
        os.remove(temp_audio.name)
        os.remove(wav_file)

        return transcript
```

---

## 2. C-SPAN Video Processing

### Challenge
C-SPAN videos need transcript extraction from their custom player.

### Solution Strategy
```python
def process_cspan_video(url):
    """
    C-SPAN provides official transcripts for most congressional videos.
    Extract from their transcript viewer.
    """

    # Extract video ID from URL
    # Example: https://www.c-span.org/video/?c5067890/user-clip-jay-rosen
    video_id_match = re.search(r'/\?c?(\d+)', url)
    if not video_id_match:
        return None

    video_id = video_id_match.group(1)

    # Fetch video page
    response = requests.get(url)
    soup = BeautifulSoup(response.content, 'html.parser')

    # Strategy 1: Check for transcript button/link
    transcript_link = soup.find('a', href=re.compile(r'/transcript/'))
    if transcript_link:
        transcript_url = 'https://www.c-span.org' + transcript_link['href']
        return extract_cspan_transcript_page(transcript_url)

    # Strategy 2: Check for embedded transcript in page
    transcript_div = soup.find('div', id='transcript-container')
    if transcript_div:
        return extract_transcript_from_div(transcript_div)

    # Strategy 3: Use C-SPAN API (if available)
    api_url = f'https://www.c-span.org/assets/player/ajax-transcript.php?id={video_id}'
    transcript_response = requests.get(api_url)
    if transcript_response.ok:
        return parse_cspan_transcript_json(transcript_response.json())

    # Strategy 4: Fallback to YouTube (many C-SPAN videos are on YouTube)
    youtube_link = soup.find('a', href=re.compile(r'youtube\.com'))
    if youtube_link:
        return process_youtube_video(youtube_link['href'])

    return None


def extract_cspan_transcript_page(transcript_url):
    """Extract transcript from dedicated transcript page."""
    response = requests.get(transcript_url)
    soup = BeautifulSoup(response.content, 'html.parser')

    # C-SPAN transcript format
    transcript_entries = soup.find_all('div', class_='transcript-entry')

    if not transcript_entries:
        # Try alternative selectors
        transcript_entries = soup.find_all('p', class_='speaker-text')

    formatted_transcript = []

    for entry in transcript_entries:
        # Extract speaker and text
        speaker_elem = entry.find('span', class_='speaker-name')
        text_elem = entry.find('span', class_='speaker-text') or entry

        speaker = speaker_elem.get_text(strip=True) if speaker_elem else ''
        text = text_elem.get_text(strip=True)

        if speaker:
            formatted_transcript.append(f"{speaker}: {text}")
        else:
            formatted_transcript.append(text)

    return '\n\n'.join(formatted_transcript)


def parse_cspan_transcript_json(json_data):
    """Parse C-SPAN API transcript response."""
    # C-SPAN returns time-stamped transcript entries
    transcript_parts = []

    for entry in json_data.get('transcript', []):
        speaker = entry.get('speaker', '')
        text = entry.get('text', '')
        timestamp = entry.get('time', '')

        if speaker:
            transcript_parts.append(f"[{timestamp}] {speaker}: {text}")
        else:
            transcript_parts.append(f"[{timestamp}] {text}")

    return '\n\n'.join(transcript_parts)
```

---

## 3. Twitter/X Thread Extraction

### Challenge
Twitter requires authentication, has rate limits, and threads need special handling.

### Solution Strategy
```python
def process_twitter_thread(url):
    """
    Extract Twitter/X threads with multiple fallback strategies.
    """

    # Strategy 1: Use Nitter (Twitter proxy, no auth required)
    nitter_result = extract_via_nitter(url)
    if nitter_result:
        return nitter_result

    # Strategy 2: Playwright scraping with thread expansion
    playwright_result = extract_via_playwright(url)
    if playwright_result:
        return playwright_result

    # Strategy 3: Basic extraction via requests (limited)
    return extract_via_basic_scraping(url)


def extract_via_nitter(url):
    """
    Use Nitter (privacy-focused Twitter frontend) to extract tweets.
    No authentication required.
    """
    # Convert Twitter URL to Nitter URL
    nitter_instances = [
        'nitter.net',
        'nitter.it',
        'nitter.unixfox.eu',
    ]

    twitter_url = url.replace('x.com', 'twitter.com')
    original_domain = urlparse(twitter_url).netloc

    for nitter_domain in nitter_instances:
        try:
            nitter_url = twitter_url.replace(original_domain, nitter_domain)
            response = requests.get(nitter_url, timeout=10)

            if response.ok:
                soup = BeautifulSoup(response.content, 'html.parser')
                return extract_tweets_from_nitter_soup(soup)

        except Exception as e:
            continue  # Try next instance

    return None


def extract_tweets_from_nitter_soup(soup):
    """Parse Nitter HTML to extract tweet thread."""
    tweets = []

    # Find all tweet containers
    tweet_divs = soup.find_all('div', class_='timeline-item')

    for tweet_div in tweet_divs:
        # Extract tweet content
        tweet_text_div = tweet_div.find('div', class_='tweet-content')
        if not tweet_text_div:
            continue

        tweet_text = tweet_text_div.get_text(strip=True)

        # Extract metadata
        tweet_meta = {
            'text': tweet_text,
            'author': tweet_div.find('a', class_='username').get_text(strip=True) if tweet_div.find('a', class_='username') else '',
            'date': tweet_div.find('span', class_='tweet-date').get('title') if tweet_div.find('span', class_='tweet-date') else '',
        }

        # Extract quoted tweet if present
        quoted_div = tweet_div.find('div', class_='quote')
        if quoted_div:
            quoted_text = quoted_div.get_text(strip=True)
            tweet_meta['quoted_tweet'] = quoted_text

        # Extract media alt text (important for context)
        media_alts = []
        for img in tweet_div.find_all('img', alt=True):
            if img['alt'] and img['alt'] != 'Image':
                media_alts.append(img['alt'])

        if media_alts:
            tweet_meta['media_descriptions'] = media_alts

        tweets.append(tweet_meta)

    # Format as readable text
    return format_thread_as_text(tweets)


def extract_via_playwright(url):
    """
    Use Playwright to scrape Twitter with JavaScript rendering.
    Handles thread expansion and dynamic loading.
    """
    from playwright.sync_api import sync_playwright
    from playwright_stealth import Stealth

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                viewport={'width': 1280, 'height': 720}
            )
            page = context.new_page()
            Stealth().apply_stealth_sync(page)

            # Navigate to tweet
            page.goto(url, wait_until='networkidle', timeout=30000)

            # Wait for tweets to load
            page.wait_for_selector('article[data-testid="tweet"]', timeout=10000)

            # Click "Show more replies" if present (to expand thread)
            try:
                show_more = page.locator('text=Show replies').first
                if show_more:
                    show_more.click()
                    page.wait_for_timeout(2000)  # Wait for expansion
            except:
                pass

            # Extract all tweet articles
            tweet_articles = page.locator('article[data-testid="tweet"]').all()

            tweets = []
            for article in tweet_articles:
                try:
                    # Extract text content
                    tweet_text = article.locator('[data-testid="tweetText"]').inner_text()

                    # Extract author
                    author = article.locator('[data-testid="User-Name"]').first.inner_text()

                    # Extract timestamp
                    timestamp = article.locator('time').get_attribute('datetime')

                    tweets.append({
                        'text': tweet_text,
                        'author': author,
                        'timestamp': timestamp
                    })
                except:
                    continue

            browser.close()

            if tweets:
                return format_thread_as_text(tweets)

    except Exception as e:
        print(f"  [Twitter] Playwright extraction failed: {e}")
        return None


def format_thread_as_text(tweets):
    """
    Format tweet thread as readable, searchable text.
    """
    if not tweets:
        return None

    formatted_parts = []

    # Add header
    if len(tweets) > 1:
        formatted_parts.append(f"=== TWITTER THREAD ({len(tweets)} tweets) ===\n")

    for i, tweet in enumerate(tweets, 1):
        # Tweet number and author
        author = tweet.get('author', 'Unknown')
        formatted_parts.append(f"[{i}/{len(tweets)}] {author}")

        # Tweet text
        text = tweet.get('text', '')
        formatted_parts.append(text)

        # Quoted tweet
        if tweet.get('quoted_tweet'):
            formatted_parts.append(f"  ↳ Quoting: {tweet['quoted_tweet']}")

        # Media descriptions (important context)
        if tweet.get('media_descriptions'):
            for desc in tweet['media_descriptions']:
                formatted_parts.append(f"  📷 Image: {desc}")

        # Add separator between tweets
        if i < len(tweets):
            formatted_parts.append("")  # Empty line

    return '\n'.join(formatted_parts)
```

---

## 4. YouTube Enhanced Transcript Extraction

### Using youtube-transcript-api
```python
def process_youtube_video_enhanced(url):
    """
    Enhanced YouTube processing with automatic caption extraction.
    This is much cheaper than downloading and transcribing audio.
    """
    from youtube_transcript_api import YouTubeTranscriptApi
    import re

    # Extract video ID
    video_id = extract_youtube_id(url)
    if not video_id:
        return None

    try:
        # Try to get transcript (auto-generated or manual)
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)

        # Prefer manual transcripts over auto-generated
        try:
            transcript = transcript_list.find_manually_created_transcript(['en'])
        except:
            transcript = transcript_list.find_generated_transcript(['en'])

        # Fetch the actual transcript
        transcript_data = transcript.fetch()

        # Format transcript (remove timestamps, combine)
        text = ' '.join([entry['text'] for entry in transcript_data])

        # Clean up auto-generated caption artifacts
        text = text.replace('[Music]', '')
        text = text.replace('[Applause]', '')
        text = re.sub(r'\[.*?\]', '', text)  # Remove all [bracketed] text
        text = re.sub(r'\s+', ' ', text).strip()

        # Get video metadata using yt-dlp
        import subprocess
        import json

        result = subprocess.run([
            'yt-dlp',
            '--dump-json',
            '--no-download',
            url
        ], capture_output=True, text=True)

        metadata = json.loads(result.stdout)

        return {
            'raw_text': text,
            'title': metadata.get('title'),
            'author': metadata.get('uploader'),
            'publication_date': metadata.get('upload_date'),
            'duration': metadata.get('duration'),
            'description': metadata.get('description'),
            'source': 'youtube_captions'
        }

    except Exception as e:
        print(f"  [YouTube] Transcript extraction failed: {e}")
        # Fallback to existing video_processor (audio download + transcribe)
        return process_video_fallback(url)


def extract_youtube_id(url):
    """Extract YouTube video ID from various URL formats."""
    patterns = [
        r'(?:v=|/)([0-9A-Za-z_-]{11}).*',
        r'(?:embed/)([0-9A-Za-z_-]{11})',
        r'^([0-9A-Za-z_-]{11})$'
    ]

    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)

    return None
```

---

## 5. Quality Validation Implementation

```python
def validate_raw_text(raw_text, url, content_type):
    """
    Comprehensive quality validation for raw_text.

    Returns: (is_valid: bool, quality_score: float, issues: List[str])
    """
    issues = []
    quality_components = {}

    # 1. Length validation
    text_length = len(raw_text) if raw_text else 0

    if text_length < 50:
        issues.append("text_too_short")
        quality_components['length'] = 0.0
    elif text_length < 200:
        quality_components['length'] = 0.5
    elif text_length < 500:
        quality_components['length'] = 0.7
    else:
        quality_components['length'] = 1.0

    # 2. HTML/Code artifacts
    html_patterns = [
        r'<script[^>]*>.*?</script>',
        r'<style[^>]*>.*?</style>',
        r'<!DOCTYPE',
        r'<html>',
        r'{.*?"@context".*?}',  # JSON-LD
    ]

    artifact_count = sum(1 for pattern in html_patterns if re.search(pattern, raw_text or '', re.DOTALL))

    if artifact_count > 0:
        issues.append("html_artifacts")
        quality_components['cleanliness'] = max(0, 1.0 - (artifact_count * 0.2))
    else:
        quality_components['cleanliness'] = 1.0

    # 3. Content coherence
    if raw_text:
        # Check for repeated patterns (scraping errors)
        words = raw_text.split()
        if len(words) > 10:
            unique_ratio = len(set(words)) / len(words)
            quality_components['coherence'] = unique_ratio
        else:
            quality_components['coherence'] = 0.5

        # Check for error messages
        error_markers = ['error', 'not found', '404', '403', 'access denied', 'subscription required']
        error_count = sum(1 for marker in error_markers if marker.lower() in raw_text.lower())

        if error_count > 2:
            issues.append("error_markers")
            quality_components['error_free'] = 0.0
        else:
            quality_components['error_free'] = 1.0
    else:
        quality_components['coherence'] = 0.0
        quality_components['error_free'] = 0.0

    # 4. Content-type specific checks
    if content_type == 'audio':
        # Audio should have transcript indicators
        transcript_indicators = ['speaker', 'transcript', ':', 'said', 'minutes']
        has_indicators = any(ind in (raw_text or '').lower() for ind in transcript_indicators)

        if not has_indicators and text_length > 200:
            issues.append("missing_transcript_format")
            quality_components['type_specific'] = 0.5
        else:
            quality_components['type_specific'] = 1.0

    elif content_type == 'video':
        # Video transcripts often have speaker labels
        has_speaker_pattern = bool(re.search(r'[A-Z][a-z]+:', raw_text or ''))
        quality_components['type_specific'] = 1.0 if has_speaker_pattern else 0.7

    elif content_type == 'social':
        # Social media should have thread structure or conversational tone
        has_thread_markers = bool(re.search(r'\[\d+/\d+\]', raw_text or ''))
        quality_components['type_specific'] = 1.0 if has_thread_markers else 0.8

    else:  # article
        # Articles should have paragraph structure
        paragraph_count = (raw_text or '').count('\n\n')
        quality_components['type_specific'] = min(1.0, paragraph_count / 5)

    # 5. Calculate overall quality score
    if quality_components:
        quality_score = sum(quality_components.values()) / len(quality_components)
    else:
        quality_score = 0.0

    # Determine if valid
    is_valid = quality_score >= 0.7 and len(issues) == 0

    return is_valid, quality_score, issues


# Example usage in main processor
def process_row(row_data, content_type):
    """Process a single row with quality validation."""
    raw_text = row_data.get('raw_text', '')

    # Validate existing raw_text
    is_valid, score, issues = validate_raw_text(
        raw_text,
        row_data['url'],
        content_type
    )

    print(f"  Quality Score: {score:.2f}")

    if is_valid:
        print(f"  Using cached raw_text (quality: {score:.2f})")
        return reprocess_cached_text(raw_text)
    else:
        print(f"  Re-processing due to quality issues: {', '.join(issues)}")
        return reprocess_from_source(row_data['url'], content_type)
```

---

## 6. Cost-Aware Processing

```python
class CostTracker:
    """Track and limit API costs during processing."""

    def __init__(self, max_budget=2.00):
        self.max_budget = max_budget
        self.costs = {
            'gemini_flash': 0,
            'gemini_flash_lite': 0,
            'speech_to_text': 0,
            'url_context': 0,
            'total': 0
        }

    def estimate_content_cost(self, content_type, **kwargs):
        """Estimate cost before processing."""
        if content_type == 'audio':
            duration_minutes = kwargs.get('duration', 30)  # Default 30 min
            transcription = duration_minutes * 0.024
            ai_analysis = 0.05
            return transcription + ai_analysis

        elif content_type == 'video':
            # Assume transcript already exists or cheap extraction
            return 0.10

        elif content_type == 'social':
            return 0.02

        else:  # article
            has_cached = kwargs.get('has_cached', False)
            return 0.005 if has_cached else 0.02

    def can_afford(self, estimated_cost):
        """Check if we can afford this operation."""
        return (self.costs['total'] + estimated_cost) <= self.max_budget

    def record_cost(self, cost_type, amount):
        """Record an actual cost."""
        self.costs[cost_type] += amount
        self.costs['total'] += amount

        if self.costs['total'] >= self.max_budget * 0.9:
            print(f"  ⚠️  WARNING: 90% of budget used (${self.costs['total']:.2f}/${self.max_budget:.2f})")

        if self.costs['total'] >= self.max_budget:
            raise BudgetExceededError(f"Budget exceeded: ${self.costs['total']:.2f}")


# Usage in main loop
cost_tracker = CostTracker(max_budget=2.00)

for row in rows:
    content_type = detect_content_type(row['url'])

    # Estimate cost
    estimated_cost = cost_tracker.estimate_content_cost(
        content_type,
        duration=row.get('length_in_seconds', 1800) / 60,
        has_cached=bool(row.get('raw_text'))
    )

    # Check budget
    if not cost_tracker.can_afford(estimated_cost):
        print(f"⛔ Budget limit reached. Stopping at row {row['id']}")
        break

    # Process
    result = process_row(row, content_type)

    # Record actual cost (would come from API responses)
    actual_cost = calculate_actual_cost(result)
    cost_tracker.record_cost('gemini_flash', actual_cost)
```

---

**Next Steps:**
1. Review these implementation examples
2. Approve PRD
3. Begin Phase 1 implementation
4. Test on sample rows

**Questions?** Review the full PRD in `PRD_SMART_DATA_CORRECTOR.md`
