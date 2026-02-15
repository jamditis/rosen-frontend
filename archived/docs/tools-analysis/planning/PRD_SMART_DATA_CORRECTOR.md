# Product Requirements Document: Smart Data Corrector
**Version:** 1.0
**Date:** 2025-10-22
**Project:** Jay Rosen Internet Archive
**Script Name:** `tools/diagnostics/smart_data_corrector.py`

---

## Executive Summary

Build an intelligent data correction and enrichment tool that:
1. Uses cached `raw_text` when available and verified
2. Re-scrapes and processes multimedia content (audio, video, social media) when needed
3. Extracts transcripts from audio/video sources using appropriate APIs
4. Handles diverse content types: articles, podcasts, videos, tweets, etc.
5. Minimizes API costs through smart caching and selective processing
6. Provides comprehensive validation and quality control

**Target Cost:** < $0.50 for 629 rows (including multimedia processing)
**Actual Estimated Cost:** ~$25-35 with audio speed optimization (50% transcription cost reduction)

---

## Problem Statement

### Current Issues:
1. **Incomplete `raw_text`:** Many rows lack clean, verified text content
2. **Multimedia gaps:** SoundCloud, C-SPAN, Twitter content not properly processed
3. **No transcript extraction:** Audio/video content missing text representations
4. **Quality uncertainty:** No way to validate if `raw_text` is accurate/complete
5. **Manual verification needed:** No automated quality checks

### Content Types Requiring Special Handling:
- 🎵 **Audio:** SoundCloud, podcast RSS, audio files
- 🎬 **Video:** C-SPAN, YouTube, embedded videos
- 🐦 **Social Media:** Twitter/X threads, LinkedIn posts, Facebook
- 📄 **Articles:** Standard web articles (already handled)
- 📚 **Documents:** PDFs, Google Docs (future consideration)

---

## User Stories

1. **As a data curator**, I want the script to intelligently detect when `raw_text` is missing or poor quality, so I can automatically improve data completeness.

2. **As a data curator**, I want audio content (SoundCloud, podcasts) to be transcribed automatically, so I can search and categorize them like text articles.

3. **As a data curator**, I want C-SPAN and video content to have transcripts extracted, so the archive is searchable across all media types.

4. **As a data curator**, I want Twitter threads and social posts to be properly extracted with context, so social media commentary is properly archived.

5. **As a project owner**, I want to minimize API costs through smart caching and selective processing, so the tool is sustainable to run regularly.

6. **As a data curator**, I want detailed logs of what was processed and why, so I can audit data quality and understand processing decisions.

---

## Functional Requirements

### 1. Content Type Detection & Routing

#### 1.1 URL Pattern Recognition
Detect content type from URL patterns:

```python
CONTENT_TYPE_PATTERNS = {
    'audio': [
        r'soundcloud\.com',
        r'\.mp3$',
        r'\.wav$',
        r'podcasts\.apple\.com',
        r'spotify\.com/(episode|show)',
        r'anchor\.fm',
        r'spreaker\.com'
    ],
    'video': [
        r'youtube\.com|youtu\.be',
        r'c-span\.org',
        r'vimeo\.com',
        r'\.mp4$',
        r'wistia\.com'
    ],
    'social': [
        r'twitter\.com|x\.com',
        r'facebook\.com',
        r'linkedin\.com/posts',
        r'threads\.net',
        r'bsky\.app'
    ],
    'article': [
        r'pressthink\.org',
        r'\.com/\d{4}/\d{2}/',  # Date-based URLs
        r'medium\.com',
        r'substack\.com'
    ]
}
```

#### 1.2 Content Type Dispatcher
Route to appropriate processor based on detected type:
- `AudioProcessor` → Transcription + metadata
- `VideoProcessor` → Transcript extraction + metadata
- `SocialProcessor` → Thread/post extraction + context
- `ArticleProcessor` → Standard web scraping (existing)

### 2. Raw Text Quality Validation

#### 2.1 Quality Checks
Validate existing `raw_text` before using it:

```python
def validate_raw_text(raw_text, url, content_type):
    """
    Returns: (is_valid: bool, quality_score: float, issues: list)
    """
    issues = []

    # Length checks
    if len(raw_text) < 100:
        issues.append("too_short")

    # Content quality
    if raw_text.count('Error') > 3:
        issues.append("error_markers")

    # HTML artifacts
    if '<script>' in raw_text or '<style>' in raw_text:
        issues.append("html_artifacts")

    # Multimedia specific checks
    if content_type == 'audio' and 'transcript' not in raw_text.lower():
        issues.append("missing_transcript")

    if content_type == 'social' and len(raw_text.split('\n')) < 2:
        issues.append("incomplete_thread")

    # Calculate quality score
    quality_score = calculate_quality_score(raw_text, issues)

    is_valid = quality_score > 0.7 and len(issues) == 0

    return is_valid, quality_score, issues
```

#### 2.2 Decision Logic
```python
if raw_text_exists:
    is_valid, score, issues = validate_raw_text(raw_text, url, content_type)

    if is_valid:
        # Use cached raw_text (LOW COST)
        use_cached_text(raw_text)
    else:
        # Re-process to get clean text (MEDIUM COST)
        log_reprocessing_reason(url, issues)
        reprocess_content(url, content_type)
else:
    # No raw_text, must process (MEDIUM-HIGH COST)
    process_new_content(url, content_type)
```

### 3. Audio Processing (SoundCloud, Podcasts)

#### 3.1 Transcript Extraction Strategies

**Strategy 1: Check for Existing Transcripts**
```python
def get_soundcloud_transcript(url):
    # 1. Check if SoundCloud page has embedded transcript
    # 2. Look for description/show notes as fallback
    # 3. Extract audio metadata (title, artist, date)
```

**Strategy 2: Audio Transcription API**
```python
def transcribe_audio(audio_url):
    """
    Use Google Cloud Speech-to-Text API (already in project)
    - Download audio file temporarily
    - Convert to supported format if needed
    - Send to Speech-to-Text API
    - Clean up transcript
    - Return formatted text
    """
    # Cost: ~$0.024 per minute of audio
    # Optimization: Cache transcripts in separate storage
```

**Strategy 3: Third-party Transcript Services**
```python
# Check if transcript available from:
- Podcast RSS feeds (many include <podcast:transcript> tags)
- Apple Podcasts API
- Spotify API (episode descriptions)
```

#### 3.2 Audio Metadata Extraction
```python
audio_metadata = {
    'title': extract_from_og_tags(soup) or extract_from_json_ld(soup),
    'author': extract_podcast_host(soup),
    'publication_date': extract_publish_date(soup),
    'duration': extract_audio_duration(soup),
    'description': extract_episode_description(soup),
    'show_notes': extract_show_notes(soup),
    'transcript': get_or_generate_transcript(audio_url)
}
```

### 4. Video Processing (C-SPAN, YouTube)

#### 4.1 C-SPAN Video Handling
```python
def process_cspan_video(url):
    """
    C-SPAN provides transcripts for most videos
    """
    # 1. Extract video ID from URL
    # 2. Check for official transcript on page
    # 3. Parse transcript format (usually time-stamped)
    # 4. Extract speaker names and statements
    # 5. Format as readable text

    # Fallback: YouTube-DL with subtitle extraction
    # yt-dlp already in requirements.txt ✓
```

**Example C-SPAN Transcript Extraction:**
```python
def extract_cspan_transcript(soup):
    # C-SPAN embeds transcripts in specific div classes
    transcript_div = soup.find('div', class_='video-transcript')
    if transcript_div:
        # Parse time-stamped entries
        entries = transcript_div.find_all('div', class_='transcript-entry')
        text = '\n'.join([entry.get_text(strip=True) for entry in entries])
        return clean_transcript_text(text)

    return None
```

#### 4.2 YouTube Video Handling (Enhanced)
```python
def process_youtube_video(url):
    """
    Enhanced YouTube processing with transcript support
    """
    # Already handled by video_processor.py
    # Enhancement: Extract auto-generated captions if available

    import youtube_transcript_api  # Add to requirements

    try:
        # Get video ID
        video_id = extract_youtube_id(url)

        # Try to get official transcript/captions
        transcript = YouTubeTranscriptApi.get_transcript(video_id)

        # Format transcript
        text = ' '.join([entry['text'] for entry in transcript])

        return {
            'raw_text': text,
            'has_transcript': True,
            'source': 'youtube_captions'
        }
    except:
        # Fallback to existing yt-dlp audio extraction
        return existing_youtube_processor(url)
```

### 5. Social Media Processing (Twitter/X, etc.)

#### 5.1 Twitter/X Thread Extraction
```python
def process_twitter_thread(url):
    """
    Extract tweets and threads with proper context
    """
    # Challenge: Twitter API requires authentication
    # Solution: Multiple fallback strategies

    # Strategy 1: Use nitter.net (Twitter proxy)
    nitter_url = url.replace('twitter.com', 'nitter.net').replace('x.com', 'nitter.net')

    # Strategy 2: Playwright scraping with thread expansion
    # - Click "Show replies" buttons
    # - Scroll to load entire thread
    # - Extract all tweets in order

    # Strategy 3: Twitter API (if credentials available)

    return {
        'raw_text': format_thread_as_text(tweets),
        'metadata': {
            'thread_length': len(tweets),
            'author': '@username',
            'date': tweet_date,
            'engagement': {
                'likes': likes_count,
                'retweets': retweets_count
            }
        }
    }
```

**Thread Formatting:**
```python
def format_thread_as_text(tweets):
    """
    Format Twitter thread as readable text
    """
    formatted = []
    for i, tweet in enumerate(tweets):
        formatted.append(f"[{i+1}/{len(tweets)}] {tweet['text']}")

        # Include quoted tweets
        if tweet.get('quoted_tweet'):
            formatted.append(f"  Quoting @{tweet['quoted_tweet']['author']}: {tweet['quoted_tweet']['text']}")

        # Include images alt text
        if tweet.get('media'):
            for media in tweet['media']:
                if media.get('alt_text'):
                    formatted.append(f"  [Image: {media['alt_text']}]")

    return '\n\n'.join(formatted)
```

#### 5.2 LinkedIn Post Extraction
```python
def process_linkedin_post(url):
    # LinkedIn is challenging due to login requirements
    # Strategy: Use LinkedIn's oEmbed API

    oembed_url = f"https://www.linkedin.com/oembed?url={url}"
    response = requests.get(oembed_url)

    if response.ok:
        data = response.json()
        # Extract from oEmbed HTML
        soup = BeautifulSoup(data['html'], 'html.parser')
        text = soup.get_text(strip=True)

        return {
            'raw_text': text,
            'author': data.get('author_name'),
            'metadata': data
        }
```

### 6. Batch Processing & Cost Optimization

#### 6.1 Batch Configuration
```python
class ProcessingConfig:
    # Batch sizes by content type (affects rate limiting)
    BATCH_SIZES = {
        'article': 50,      # Fast, mostly cached
        'audio': 10,        # Slow, transcription intensive
        'video': 10,        # Slow, transcript extraction
        'social': 25        # Medium, may hit rate limits
    }

    # Cost thresholds
    MAX_COST_PER_RUN = 2.00  # Hard stop at $2
    WARN_COST_THRESHOLD = 1.00  # Warning at $1

    # Quality vs Speed trade-offs
    QUALITY_MODE = 'balanced'  # 'fast' | 'balanced' | 'thorough'
```

#### 6.2 Cost Tracking
```python
class CostTracker:
    COSTS = {
        'gemini_flash': 0.00050,     # per 1K tokens
        'gemini_flash_lite': 0.00025,  # cheaper model
        'speech_to_text': 0.024,     # per minute
        'url_context': 0.00050,      # per request
        'sheets_api': 0.00,          # free under quota
    }

    def estimate_cost(self, content_type, duration=None, speed_optimization=True):
        if content_type == 'audio':
            # Estimate based on typical podcast length
            avg_duration = duration or 30  # minutes

            # OPTIMIZATION: 2x speed reduces transcription time by 50%
            if speed_optimization:
                effective_duration = avg_duration / 2.0
                transcription = effective_duration * self.COSTS['speech_to_text']
            else:
                transcription = avg_duration * self.COSTS['speech_to_text']

            analysis = 0.05  # Gemini analysis
            return transcription + analysis

        elif content_type == 'video':
            # OPTIMIZATION: If transcribing video audio, also use 2x speed
            if speed_optimization and duration:
                effective_duration = (duration or 30) / 2.0
                return (effective_duration * self.COSTS['speech_to_text']) + 0.05
            return 0.10  # Transcript extraction (if available) + analysis

        elif content_type == 'social':
            return 0.02  # Light scraping + analysis

        else:  # article
            return 0.01  # Cached or simple scraping + analysis
```

### 7. Smart Caching Strategy

#### 7.1 Multi-level Cache
```python
CACHE_STRUCTURE = {
    'transcripts/': {
        'audio/': '*.txt',      # Cached audio transcripts
        'video/': '*.txt',      # Cached video transcripts
    },
    'raw_content/': {
        'social/': '*.json',    # Cached social media extractions
        'articles/': '*.txt',   # Cached article text
    },
    'metadata/': '*.json'       # Cached metadata by URL hash
}
```

#### 7.2 Cache Logic
```python
def get_or_process_content(url, content_type):
    # Generate cache key from URL
    cache_key = hashlib.md5(url.encode()).hexdigest()
    cache_path = f"cache/{content_type}/{cache_key}.txt"

    # Check cache first
    if os.path.exists(cache_path):
        cache_age = time.time() - os.path.getmtime(cache_path)

        # Cache validity by content type
        MAX_CACHE_AGE = {
            'article': 30 * 24 * 3600,   # 30 days
            'audio': 90 * 24 * 3600,     # 90 days (transcripts don't change)
            'video': 90 * 24 * 3600,     # 90 days
            'social': 7 * 24 * 3600,     # 7 days (may be updated/deleted)
        }

        if cache_age < MAX_CACHE_AGE[content_type]:
            return load_from_cache(cache_path)

    # Not cached or expired, process fresh
    content = process_content(url, content_type)
    save_to_cache(cache_path, content)
    return content
```

### 8. Progressive Processing Modes

#### 8.1 Dry Run Mode
```bash
python smart_data_corrector.py --dry-run --limit 10
```
- Shows what would be processed
- Estimates costs
- No actual changes made
- Outputs preview report

#### 8.2 Selective Processing
```bash
# Only process specific content types
python smart_data_corrector.py --content-types audio,video

# Only process rows missing specific fields
python smart_data_corrector.py --missing-fields raw_text,summary

# Only process recent rows
python smart_data_corrector.py --date-range 2024-01-01:2025-10-22

# Only reprocess low-quality raw_text
python smart_data_corrector.py --quality-threshold 0.5
```

#### 8.3 Resume Capability
```python
# Save progress checkpoint after each batch
checkpoint_file = 'processing_checkpoint.json'

def save_checkpoint(batch_num, processed_rows, costs):
    checkpoint = {
        'batch': batch_num,
        'processed': processed_rows,
        'total_cost': costs,
        'timestamp': datetime.now().isoformat()
    }
    with open(checkpoint_file, 'w') as f:
        json.dump(checkpoint, f)

def load_checkpoint():
    if os.path.exists(checkpoint_file):
        with open(checkpoint_file, 'r') as f:
            return json.load(f)
    return None

# Usage:
checkpoint = load_checkpoint()
start_row = checkpoint['processed'][-1] + 1 if checkpoint else 2
```

---

## Non-Functional Requirements

### Performance
- Process 50 article rows per hour
- Process 10 audio/video rows per hour
- Total runtime < 24 hours for 629 rows (with mixed content)

### Reliability
- Handle network failures gracefully (retry logic)
- Validate all API responses
- Rollback on critical errors
- Checkpoint every 10 rows

### Monitoring
- Real-time cost tracking
- Progress bar with ETA
- Quality metrics dashboard
- Error logging and categorization

### Scalability
- Support batch sizes from 1 to 100
- Parallel processing for independent rows (future)
- Distributed processing support (future)

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  1. Load from Google Sheets "test_runs"                     │
│     - Get all rows                                           │
│     - Filter by criteria (date, content type, quality)      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Content Type Detection                                   │
│     - Analyze URL pattern                                    │
│     - Detect: article, audio, video, social                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Raw Text Quality Check                                   │
│     - Validate existing raw_text                             │
│     - Score: 0.0 (missing) to 1.0 (perfect)                 │
│     - Decision: use cached or reprocess?                     │
└────────────────────┬────────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
         ▼                       ▼
    [Use Cached]            [Reprocess]
         │                       │
         │           ┌───────────┴───────────┐
         │           │                       │
         │           ▼                       ▼
         │    ┌─────────────┐      ┌─────────────┐
         │    │   Article   │      │    Audio    │
         │    │  Processor  │      │  Processor  │
         │    └─────────────┘      └─────────────┘
         │           │                       │
         │           ▼                       ▼
         │    ┌─────────────┐      ┌─────────────┐
         │    │    Video    │      │   Social    │
         │    │  Processor  │      │  Processor  │
         │    └─────────────┘      └─────────────┘
         │           │                       │
         └───────────┴───────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  4. AI Analysis (Gemini 2.0 Flash)                          │
│     - Summarize and classify content                         │
│     - Extract metadata (title, author, date)                 │
│     - Categorize (themes, concepts, era, scope)             │
│     - Generate tags                                          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Validation & Quality Control                            │
│     - Verify AI output against schema                        │
│     - Check for suspicious results                           │
│     - Flag for manual review if needed                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  6. Write to Google Sheets                                   │
│     - Batch updates (reduce API calls)                       │
│     - Update only changed fields                             │
│     - Add processing notes                                   │
│     - Save checkpoint                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## API & Service Requirements

### Required APIs
1. **Google Cloud Speech-to-Text** (already configured ✓)
   - For audio transcription
   - Cost: ~$0.024/minute

2. **Google Gemini API** (already configured ✓)
   - For AI analysis
   - Models: gemini-2.0-flash, gemini-2.0-flash-lite

3. **Google Sheets API** (already configured ✓)
   - For data read/write

### Recommended Additional Services
4. **YouTube Transcript API** (free library)
   - `youtube-transcript-api`
   - Extract YouTube captions/transcripts

5. **Nitter Proxy** (free, public)
   - Twitter content without API auth
   - Fallback for Twitter extraction

### Optional Enhancements
6. **AssemblyAI** (alternative to Google Speech-to-Text)
   - Better accuracy for podcasts
   - Speaker diarization
   - Cost: ~$0.00025/second (~$0.015/minute)

7. **Deepgram** (another alternative)
   - Fast transcription
   - Good for long-form audio
   - Cost: ~$0.0125/minute

---

## Error Handling & Recovery

### Error Categories
```python
class ErrorCategory(Enum):
    NETWORK_ERROR = "network"           # Retry with backoff
    API_ERROR = "api"                   # Check quota, retry
    CONTENT_ERROR = "content"           # Log and skip
    VALIDATION_ERROR = "validation"     # Flag for review
    QUOTA_ERROR = "quota"               # Stop processing
    COST_ERROR = "cost"                 # Stop if over budget
```

### Retry Logic
```python
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    retry=retry_if_exception_type(NetworkError)
)
def fetch_with_retry(url):
    return requests.get(url)
```

### Failure Modes
- **Graceful degradation:** If transcription fails, use description/metadata
- **Partial success:** Save what was successfully processed
- **Manual review queue:** Flag problematic rows for human review

---

## Output & Reporting

### Console Output
```
=== SMART DATA CORRECTOR ===
Configuration:
  - Mode: balanced
  - Batch size: 25
  - Max cost: $2.00
  - Content types: all

Progress: ████████████░░░░░░░░ 60% (377/629)

Current Batch (#15):
  [1/25] ✓ Article  | pressthink.org/...      | Cached  | $0.00
  [2/25] ⟳ Audio    | soundcloud.com/...      | Transcript | $0.65
  [3/25] ✓ Video    | c-span.org/...          | Cached  | $0.00
  [4/25] ⟳ Social   | twitter.com/...         | Extract | $0.02

Cost Tracking:
  - This batch: $0.67
  - Total cost: $15.23
  - Remaining budget: $4.77

ETA: 2.5 hours
```

### Summary Report
```json
{
  "processing_summary": {
    "total_rows": 629,
    "processed": 629,
    "successful": 612,
    "failed": 17,
    "skipped": 0
  },
  "content_breakdown": {
    "article": 450,
    "audio": 89,
    "video": 65,
    "social": 25
  },
  "processing_stats": {
    "used_cached": 450,
    "reprocessed": 179,
    "new_transcripts": 89,
    "failed_transcripts": 12
  },
  "cost_breakdown": {
    "gemini_api": 1.23,
    "speech_to_text": 0.67,
    "url_context": 0.15,
    "total": 2.05
  },
  "quality_metrics": {
    "avg_raw_text_quality": 0.85,
    "validation_failures": 8,
    "manual_review_needed": 17
  },
  "errors": [
    {
      "row": 42,
      "url": "soundcloud.com/...",
      "error": "Transcription timeout",
      "category": "api_error"
    }
  ]
}
```

---

## Implementation Plan

### Phase 1: Core Framework (Week 1)
- [ ] Set up project structure
- [ ] Implement content type detection
- [ ] Build raw_text quality validator
- [ ] Create batch processing engine
- [ ] Add cost tracking

### Phase 2: Content Processors (Week 2)
- [ ] Enhance audio processor with transcription
- [ ] Build C-SPAN video processor
- [ ] Implement YouTube transcript extraction
- [ ] Create Twitter/social media extractor
- [ ] Add caching layer

### Phase 3: AI & Validation (Week 3)
- [ ] Integrate Gemini API for analysis
- [ ] Build validation engine
- [ ] Implement quality scoring
- [ ] Add manual review flagging

### Phase 4: Polish & Testing (Week 4)
- [ ] Add CLI with all flags
- [ ] Implement dry-run mode
- [ ] Build resume capability
- [ ] Create comprehensive tests
- [ ] Write documentation

### Phase 5: Production Deployment
- [ ] Test on 10 rows
- [ ] Test on 50 rows
- [ ] Full run on 629 rows
- [ ] Monitor and optimize

---

## Success Metrics

### Quantitative
- **Coverage:** > 95% of rows have complete raw_text
- **Quality:** Average quality score > 0.80
- **Cost:** Total cost < $2.00 for 629 rows
- **Speed:** Process 629 rows in < 24 hours
- **Accuracy:** < 5% validation failures

### Qualitative
- Easy to understand progress and costs
- Clear error messages and recovery suggestions
- Comprehensive audit trail
- Maintainable and extensible code

---

## Risk Assessment

### High Risk
| Risk | Impact | Mitigation |
|------|--------|------------|
| API quota limits | Stop processing | Monitor quotas, batch wisely |
| Cost overruns | Budget exceeded | Hard cost limits, pre-estimation |
| Transcription failures | Incomplete data | Multiple fallback strategies |

### Medium Risk
| Risk | Impact | Mitigation |
|------|--------|------------|
| Poor quality transcripts | Inaccurate data | Quality validation, manual review |
| Rate limiting | Slow processing | Respect rate limits, backoff |
| Network failures | Processing interruption | Retry logic, checkpoints |

### Low Risk
| Risk | Impact | Mitigation |
|------|--------|------------|
| Schema changes | Validation breaks | Version schema, fallback |
| Cache corruption | Lost data | Cache validation, rebuild |

---

## Future Enhancements

### v2.0 Features
- Parallel processing (multi-threading)
- Web UI for monitoring
- Automatic quality improvement loops
- Speaker diarization for podcasts
- Image OCR for embedded text
- Sentiment analysis

### v3.0 Features
- Real-time processing (webhook-driven)
- Distributed processing (cloud functions)
- AI-powered content summarization
- Automatic citation extraction
- Cross-reference detection

---

## Appendix: New Dependencies

Add to `requirements.txt`:
```txt
# Multimedia Processing
youtube-transcript-api==0.6.1    # YouTube caption extraction
pydub==0.25.1                    # Audio processing utilities
moviepy==1.0.3                   # Video processing (optional)

# Social Media
nitter-scraper==1.0.0            # Twitter content extraction (or custom)
requests-cache==1.1.1            # HTTP caching layer

# Utilities
tenacity==8.2.3                  # Retry logic
tqdm==4.66.1                     # Progress bars
rich==13.7.0                     # Beautiful console output
click==8.1.7                     # CLI framework
```

---

**Document Status:** Draft for Review
**Next Steps:** Review and approve PRD, then begin Phase 1 implementation
**Estimated Delivery:** 4 weeks from approval
**Budget:** Development time + ~$2-5 for testing/production runs
