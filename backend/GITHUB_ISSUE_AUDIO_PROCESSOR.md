# GitHub Issue to Create: Audio Processor Integration

## Issue Details

**Title:** Implement audio processor integration into main workflow

**Labels:** `backend`, `enhancement`

**Body:**

## Overview
Integrate audio processing functionality into the main scraping workflow to handle audio URLs (SoundCloud, podcasts, direct audio files) alongside existing article and video processing.

## Current State
- Placeholder exists: `src/rosen_scraper/processors/audio_processor.py`
- Audio processing infrastructure exists in diagnostic scripts:
  - `scripts/diagnostics/smart_corrector/audio_optimizer.py` - FFmpeg optimization (2x speed)
  - `scripts/diagnostics/smart_corrector/processors/soundcloud_processor.py` - SoundCloud handling
- **Not integrated** into `dispatcher.py` or main workflow

## Implementation Tasks

### Phase 1: Core Integration (Priority: High)
- [ ] Implement full audio processor in `src/rosen_scraper/processors/audio_processor.py`
- [ ] Update `dispatcher.py` to detect and route audio URLs
- [ ] Integrate `AudioOptimizer` for cost-effective transcription (2x speed = 50% savings)
- [ ] Add Google Speech-to-Text transcription
- [ ] Connect to categorizer for AI analysis
- [ ] Connect to PDF generator for output

### Phase 2: Platform Support (Priority: Medium)
- [ ] SoundCloud URLs (leverage existing `soundcloud_processor.py`)
- [ ] Direct audio file URLs (.mp3, .wav, .m4a, .ogg)
- [ ] Podcast RSS/Atom feeds
- [ ] Spotify podcast URLs (if feasible)
- [ ] Apple Podcasts URLs (if feasible)

### Phase 3: Quality & Optimization (Priority: Low)
- [ ] Audio quality detection and adaptive speed selection
- [ ] Speaker diarization (multiple speakers)
- [ ] Background noise handling
- [ ] Cost estimation logging

### Phase 4: Testing & Documentation (Priority: High)
- [ ] Unit tests for audio_processor
- [ ] Integration tests with real URLs
- [ ] Update user documentation
- [ ] Add examples to README

## Technical Details

### Dependencies (Already Available)
- `google-cloud-speech==2.33.0` ✓ in pyproject.toml
- FFmpeg (system dependency, used by AudioOptimizer)
- `yt-dlp==2025.9.26` ✓ can extract audio from many platforms

### May Need to Add
- `feedparser` for podcast RSS feeds

### Cost Considerations
- Google Speech-to-Text: $0.024/minute
- With 2x speed optimization: **$0.012/minute effective cost**
- 30-minute audio: ~$0.36 (or $0.18 with optimization)
- Always check for existing descriptions/transcripts first (free)

## Reference Implementation
Follow the pattern in `video_processor.py`:
1. Detect platform/type
2. Extract metadata
3. Check for existing transcript (avoid cost)
4. Download & optimize audio (if needed)
5. Transcribe (with AudioOptimizer)
6. Pass to categorizer
7. Return structured data

## Documentation
See `backend/AUDIO_PROCESSOR_IMPLEMENTATION.md` for comprehensive implementation plan.

## Success Criteria
- [ ] Audio URLs automatically routed to audio_processor
- [ ] Transcription works with 2x speed optimization
- [ ] Results formatted for archive schema
- [ ] PDFs generated with transcripts
- [ ] Costs tracked and logged
- [ ] Tests pass for all supported platforms

## Estimated Effort
6-10 days of development time across 4 phases

## Related
- Original TODO comment from PR #8 code review
- Existing audio infrastructure in diagnostic scripts

---

**Note:** This issue tracks the implementation plan documented in the TODO comment resolution work.
