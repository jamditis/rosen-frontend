# Audio Processor Implementation Plan

## Issue Context
This document tracks the implementation plan for the audio processor integration referenced in:
- `src/rosen_scraper/processors/audio_processor.py`
- Original TODO comment identified in code review

## Current State

### Implemented Components
1. **AudioOptimizer** (`scripts/diagnostics/smart_corrector/audio_optimizer.py`)
   - FFmpeg-based audio speed optimization
   - 2x speed processing = 50% transcription cost savings
   - WAV conversion for Google Speech-to-Text
   - Timestamp normalization
   - Cost calculation utilities

2. **SoundCloudProcessor** (`scripts/diagnostics/smart_corrector/processors/soundcloud_processor.py`)
   - Metadata extraction from SoundCloud pages
   - Description parsing (alternative to transcription)
   - Integration with AudioOptimizer
   - Currently used in diagnostic/correction scripts only

### Not Yet Implemented
- Integration into main workflow (`dispatcher.py`)
- Generic audio file/URL processing
- Podcast feed processing
- Direct MP3/WAV URL handling
- Main pipeline integration

## Implementation Tasks

### Phase 1: Core Integration
- [ ] Update `audio_processor.py` with full implementation
- [ ] Add audio URL detection patterns to `dispatcher.py`
- [ ] Integrate AudioOptimizer for cost-effective transcription
- [ ] Add Google Speech-to-Text transcription logic
- [ ] Connect to categorizer for AI analysis
- [ ] Connect to PDF generator for output

### Phase 2: Platform Support
- [ ] SoundCloud URLs (leverage existing processor)
- [ ] Direct audio file URLs (.mp3, .wav, .m4a, .ogg)
- [ ] Podcast feed URLs (RSS/Atom parsing)
- [ ] Spotify podcast URLs (if API access available)
- [ ] Apple Podcasts URLs (if API access available)

### Phase 3: Quality & Optimization
- [ ] Add audio quality detection
- [ ] Adaptive speed selection (based on audio metadata)
- [ ] Speaker diarization (multiple speakers)
- [ ] Background noise handling
- [ ] Cost estimation before transcription

### Phase 4: Testing & Documentation
- [ ] Unit tests for audio_processor
- [ ] Integration tests with real URLs
- [ ] Update documentation
- [ ] Add examples to README

## Technical Requirements

### Dependencies (Already Available)
- `google-cloud-speech==2.33.0` (in pyproject.toml)
- FFmpeg (system dependency, used by AudioOptimizer)
- `yt-dlp==2025.9.26` (can extract audio from many platforms)
- `requests`, `beautifulsoup4` (for metadata extraction)

### Additional Dependencies (May Need)
- `feedparser` (for podcast RSS feeds)
- `pydub` (alternative audio manipulation, if needed)

### API Keys Required
- `GOOGLE_APPLICATION_CREDENTIALS` (for Speech-to-Text)
- Already configured for project

## Cost Considerations

### Transcription Pricing
- Google Speech-to-Text: $0.024/minute (standard model)
- With 2x speed optimization: $0.012/minute effective cost
- 30-minute audio: ~$0.36 (or $0.18 with optimization)

### Budget Recommendations
1. Always use AudioOptimizer for 2x speed (50% savings)
2. Check description/existing transcripts first (free)
3. For long content (>60 min), consider manual transcription alternatives
4. Batch process when possible to manage costs

## Architecture Pattern

Follow the existing video_processor.py pattern:

```python
def process_audio(url, schema):
    """Main entry point"""
    # 1. Detect platform/type
    # 2. Extract metadata
    # 3. Check for existing transcript/description
    # 4. If needed, download & optimize audio
    # 5. Transcribe (with AudioOptimizer)
    # 6. Pass to categorizer
    # 7. Return structured data
```

## Integration Points

### dispatcher.py URL Patterns
```python
# Add audio platform detection
if re.search(r"soundcloud\.com", url):
    return audio_processor.process_audio(url, schema)
elif re.search(r"\.(mp3|wav|m4a|ogg)$", url):
    return audio_processor.process_audio(url, schema)
elif re.search(r"(podcast|feed)", url.lower()):
    return audio_processor.process_audio(url, schema)
```

## Reference Files
- `src/rosen_scraper/processors/video_processor.py` - Similar pattern for YouTube
- `src/rosen_scraper/processors/article_processor.py` - AI analysis integration
- `scripts/diagnostics/smart_corrector/audio_optimizer.py` - Audio optimization
- `scripts/diagnostics/smart_corrector/processors/soundcloud_processor.py` - Platform-specific handling

## Testing Strategy

### Test URLs
1. SoundCloud: https://soundcloud.com/jay-rosen-nyu/* (if available)
2. Direct MP3: Sample audio file URL
3. Podcast RSS: Sample podcast feed with Jay Rosen interview

### Test Scenarios
- Short audio (<5 min) - full transcription
- Long audio (>30 min) - optimization critical
- Audio with existing description - skip transcription
- Multiple audio formats - conversion handling
- Error cases - network failures, invalid URLs, unsupported formats

## Success Criteria
1. Audio URLs are automatically detected and routed to audio_processor
2. Transcription works reliably with 2x speed optimization
3. Results are correctly formatted for archive schema
4. PDFs are generated with transcripts
5. Costs are tracked and logged
6. Tests pass for all supported audio platforms

## Timeline Estimate
- Phase 1 (Core): 2-3 days
- Phase 2 (Platforms): 2-3 days
- Phase 3 (Optimization): 1-2 days
- Phase 4 (Testing): 1-2 days
- **Total: 6-10 days of development time**

## Notes
- This work was deferred from initial implementation to focus on core article/video processing
- SoundCloud handling already exists but is in diagnostic scripts, not main pipeline
- Audio transcription has cost implications - optimization and smart checking are essential
- The AudioOptimizer class provides significant cost savings and should be central to the implementation
