# Edge Cases & Solutions - Smart Data Corrector

## Summary of Failures from Test Runs

**Total rows tested:** 42
**Successfully processed:** 36
**Failed/Issues:** 6

---

## Edge Case 1: YouTube Videos with No Captions Available

### Example
- **Row 33**: `https://youtu.be/o_SzPrd2RNw`
- **Error**: "Subtitles are disabled for this video"

### Why This Happens
- Video creator disabled captions/subtitles
- Very old videos (pre-auto-caption era)
- Private/unlisted videos with restricted features

### Solutions

#### Option A: Download Audio & Transcribe (HIGH COST)
```python
# Cost: ~$0.024/minute = $0.48 for 20-min video
# Time: 10-20 minutes for processing

from youtube_dl import YoutubeDL
from google.cloud import speech_v1

# Download audio
ydl_opts = {'format': 'bestaudio', 'outtmpl': 'temp_audio.m4a'}
with YoutubeDL(ydl_opts) as ydl:
    ydl.download([url])

# Transcribe with Google Cloud Speech-to-Text
# (Use 2x speed optimization to cut cost in half!)
```

**When to use:** Important videos where transcript is critical

#### Option B: Use Video Metadata Only (FREE)
```python
# Use yt-dlp to get description, title, tags
# Cost: $0
# Quality: Low (metadata only, no actual content)

result = {
    'status': 'metadata_only',
    'raw_text': f"{title}\n\n{description}",
    'needs_transcription': True,
    'transcription_estimate': '$0.48'
}
```

**When to use:** Low-priority videos, budget constraints

#### Option C: Flag for Manual Review
```python
# Mark in notes column for future batch processing
note = "[NEEDS_TRANSCRIPTION] No captions available - download + transcribe needed (~$0.48)"
```

**When to use:** Defer decision to batch process later

### Recommended Approach
1. **Check video metadata** (description, tags) - if substantial (>500 chars), use that
2. **Flag as needs_transcription** in notes column
3. **Batch process** these later with audio transcription when budget allows

---

## Edge Case 2: Excessive Repetition / Metadata Pollution

### Example
- **Row 35**: YouTube transcript with 3x repetition + "Kind: captions, Language: en" metadata

### Why This Happens
- Auto-generated captions sometimes include format metadata
- Captions repeat phrases for timing/sync
- Our deduplication algorithm failed (quality < 70%)

### Current Data
```
Kind: captions
Language: en
good morning I thought yesterday was
good morning I thought yesterday was
good morning I thought yesterday was
```

### Solutions

#### Solution A: Enhanced Deduplication Algorithm
```python
def advanced_deduplicate(text: str) -> str:
    """Remove both metadata AND repetitive phrases."""

    # Step 1: Remove metadata lines
    lines = text.split('\n')
    clean_lines = [
        line for line in lines
        if not line.strip().startswith(('Kind:', 'Language:'))
    ]
    text = ' '.join(clean_lines)

    # Step 2: Remove 3x repetition patterns
    # "word word word" -> "word"
    words = text.split()
    deduplicated = []

    i = 0
    while i < len(words):
        # Check for 3x repetition
        if i + 2 < len(words) and words[i] == words[i+1] == words[i+2]:
            deduplicated.append(words[i])
            # Skip all consecutive duplicates
            while i < len(words) and words[i] == deduplicated[-1]:
                i += 1
        else:
            deduplicated.append(words[i])
            i += 1

    return ' '.join(deduplicated)
```

#### Solution B: Fallback to Original Source
```python
# If deduplication fails, try alternative transcript sources:
# 1. Manual captions (if available)
# 2. Different language with translation
# 3. Download audio and transcribe fresh
```

#### Solution C: Accept Lower Quality Threshold
```python
# For very long videos, accept 60% uniqueness instead of 70%
# Adjust based on video length
min_quality = 0.60 if len(text) > 30000 else 0.70
```

### Recommended Fix for Row 35
```bash
# Run enhanced deduplication + metadata removal
python fix_youtube_row_35.py
```

---

## Edge Case 3: SoundCloud with No Description

### Example
- **Row 42**: `https://soundcloud.com/currentpubmedia/too-much-of-podcasting-is-in-new-york`
- **Issue**: Description was too short (<100 chars) or empty

### Why This Happens
- Some SoundCloud tracks have minimal descriptions
- Description extraction failed
- Track was deleted/made private

### Current Data
```
Raw text: (empty)
Notes: "Used cached text (Q:0.82)" <- FALSE POSITIVE!
```

### Solutions

#### Solution A: Download Audio & Transcribe (2x Speed)
```python
# Cost with 2x optimization: ~$0.012/min = $0.27 for 22-min track
# Original cost would be: $0.53

from tools.diagnostics.smart_corrector import AudioOptimizer

optimizer = AudioOptimizer(speed_factor=2.0)

# 1. Download audio
audio_file = download_soundcloud_audio(url)

# 2. Speed up 2x
fast_audio = optimizer.speed_up_audio(audio_file, 'fast.mp3', 2.0)

# 3. Transcribe (costs half as much!)
transcript = transcribe_audio(fast_audio)

# 4. Normalize timestamps back to 1x
transcript = optimizer.normalize_timestamps(transcript, 2.0)
```

**When to use:** Important audio content, moderate budget

#### Solution B: Use Track Metadata Only
```python
# Extract title, artist, tags, comments
# Quality: Very low, but free

metadata = extract_soundcloud_metadata(url)
raw_text = f"{metadata['title']}\n\nArtist: {metadata['artist']}\n\nTags: {', '.join(metadata['tags'])}"
```

**When to use:** Low-priority tracks, no budget

#### Solution C: Check for Transcript in External Sources
```python
# Some podcasts publish transcripts on their websites
# Check show notes, blog posts, etc.

# Example: Current podcast might have transcript at:
# https://current.org/transcripts/[episode-slug]
```

**When to use:** Well-known podcasts, professional productions

### Recommended Approach
1. **Re-check SoundCloud** page for any content we missed
2. **Check podcast website** for published transcripts
3. If none found, **flag for batch audio transcription** later

---

## Edge Case 4: Google Sheets Cell Limit (>50,000 chars)

### Example
- **Row 32, 35, 36, 37, 38**: YouTube transcripts >50K chars

### Why This Happens
- Long videos (1+ hour) have massive transcripts
- Google Sheets has hard 50K char limit per cell

### Solutions

#### Solution A: Truncate + Store Full Version in Google Drive (IMPLEMENTED ✅)
```python
from tools.diagnostics.smart_corrector.gdrive_overflow_handler import handle_overflow

# Truncate to 48K, upload full version to Google Drive
result = handle_overflow(
    text=full_transcript,
    record_id='ROW-35',
    content_type='transcript'
)

# Store truncated in sheet
worksheet.update_cell(row, col_raw_text, result['text_for_sheet'])

# Store Drive link
worksheet.update_cell(row, col_gdrive_link, result['gdrive_link'])
```

**Pros:**
- AI can still process 48K chars (usually sufficient)
- Full text preserved in Google Drive
- No data loss

**Cons:**
- Requires fetching from Drive for full text
- Extra complexity

#### Solution B: Intelligent Summarization
```python
# Use AI to create dense summary (<10K chars)
from categorizer import summarize_and_classify

summary = create_dense_summary(full_transcript, max_length=10000)

# Store summary in sheet, full in Drive
```

**Pros:**
- Faster AI processing
- Lower costs
- Still captures key information

**Cons:**
- Loses some detail
- Requires extra AI call

#### Solution C: Split Across Multiple Rows
```python
# Create child rows for overflow
# Row 35: Main record (first 48K)
# Row 35a: Continuation (next 48K)
# Row 35b: Continuation (remaining)
```

**Pros:**
- All data in spreadsheet
- No external storage needed

**Cons:**
- Complicates data model
- Hard to process as single unit

### Recommended Approach
**Use Solution A** (already implemented):
- Truncate to 48,000 chars for sheet storage
- Upload full version to Google Drive
- Store link in `gdrive_transcript_link` column
- Add note in `notes` column: `[OVERFLOW] Full transcript in Drive`

---

## Edge Case 5: Code Bugs (CostTracker Error)

### Example
- **Multiple rows**: `CostTracker.estimate_cost() got an unexpected keyword argument 'speed_optimization'`

### Why This Happened
- Code mismatch between processor and tracker
- `estimate_cost()` signature changed

### Solution
```python
# Fix in run_smart_corrector_27_42.py line 175

# WRONG:
cost = cost_tracker.estimate_cost(content_type, speed_optimization=True)

# RIGHT:
cost = cost_tracker.estimate_cost(content_type, duration=1800)
```

### Fix Applied
Update cost estimation calls to use correct parameters.

---

## Edge Case 6: False Positive Quality Scores

### Example
- **Row 42**: Validator said Q:0.82 but raw_text was empty!

### Why This Happens
- Validator checked old cached value before processing
- Empty string edge case in quality calculation
- Race condition in data flow

### Solution
```python
def validate(self, raw_text: str, url: str = '', content_type: str = 'article'):
    # Add empty check FIRST
    if not raw_text or len(raw_text.strip()) == 0:
        return False, 0.0, ['No raw_text found']

    # Rest of validation...
```

### Fix Applied
Add empty text check at start of validation function.

---

## Comprehensive Edge Case Handling Strategy

### Priority Matrix

| Edge Case | Frequency | Cost Impact | Fix Priority |
|-----------|-----------|-------------|--------------|
| No YouTube captions | Low (5%) | High ($0.50/video) | **P2** - Flag for batch |
| Excessive repetition | Medium (15%) | Low (free retry) | **P1** - Fix immediately |
| No SoundCloud description | Low (10%) | High ($0.30/track) | **P2** - Flag for batch |
| >50K char limit | Low (5%) | None (truncate) | **P1** - Already fixed ✅ |
| Code bugs | High (varies) | None | **P0** - Fix ASAP ✅ |
| False quality scores | Low (2%) | Low | **P1** - Fix in validator |

### Recommended Workflow

```python
def process_with_edge_case_handling(url, raw_text):
    """Process with comprehensive edge case handling."""

    # 1. Detect content type
    content_type = detector.detect(url)

    # 2. Validate existing data (with empty check!)
    is_valid, quality, issues = validator.validate(raw_text, url, content_type)

    if is_valid:
        # Use cached data
        return {'strategy': 'cache', 'text': raw_text}

    # 3. Try to fetch new data
    try:
        result = processor.process(url)

        if result['status'] == 'success':
            new_text = result['raw_text']

            # 4. Handle overflow
            if len(new_text) > 48000:
                overflow_result = handle_overflow(new_text, record_id, content_type)
                return {
                    'strategy': 'reprocess_with_overflow',
                    'text': overflow_result['text_for_sheet'],
                    'gdrive_link': overflow_result['gdrive_link']
                }

            return {'strategy': 'reprocess', 'text': new_text}

        elif result['status'] == 'needs_transcription':
            # 5. Flag for batch transcription
            return {
                'strategy': 'defer',
                'text': result.get('metadata', {}).get('description', ''),
                'note': f"[NEEDS_TRANSCRIPTION] Est. cost: ${result['estimated_cost']}"
            }

        else:
            # 6. Fallback to metadata
            return {
                'strategy': 'metadata_only',
                'text': extract_metadata_text(url),
                'note': '[METADATA_ONLY] Full extraction failed'
            }

    except Exception as e:
        # 7. Error handling
        return {
            'strategy': 'error',
            'text': raw_text,  # Keep old data
            'note': f'[ERROR] {str(e)[:100]}'
        }
```

---

## Batch Processing for Deferred Items

For items flagged as `needs_transcription`, create a batch processing script:

```bash
# Identify all rows needing transcription
python identify_transcription_needed.py

# Output: transcription_queue.csv
# - 12 YouTube videos: ~$6.00
# - 8 SoundCloud tracks: ~$3.60
# - Total: ~$9.60 with 2x speed optimization

# Process in batch when budget allows
python batch_transcribe.py --max-cost 10.00
```

---

## Summary: How to Fix Current Issues

### Fix Row 35 (Excessive Repetition)
```bash
python -c "
from tools.diagnostics.smart_corrector.processors import YouTubeEnhancedProcessor
import gspread
from google.oauth2.service_account import Credentials

# Enhanced deduplication for Row 35
# [code to re-process with better algorithm]
"
```

### Fix Row 42 (Empty SoundCloud)
```bash
# Re-check SoundCloud page
# If still empty, flag for batch audio transcription
python flag_for_transcription.py --row 42
```

### Fix Code Bugs
```bash
# Already fixed in updated scripts:
# - CostTracker parameter fix ✅
# - Quality validator empty check ✅
```

---

## Long-term Improvements

1. **Implement overflow handler** in main workflow
2. **Add retry logic** for failed extractions
3. **Create transcription queue** for batch processing
4. **Improve deduplication algorithm** for edge cases
5. **Add quality score validation** (catch false positives)
6. **Monitor error patterns** and add specific handlers

---

**Last Updated:** 2025-10-22
**Status:** 6/42 rows need attention (14% edge cases)
**Cost to fix:** ~$0.50 for transcriptions if needed
