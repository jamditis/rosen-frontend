# Smart Data Corrector - Implementation Summary
**Complete Solution with Audio Speed Optimization**

## 🎯 Goal

Populate/correct all columns in the "test_runs" Google Sheet tab using existing `raw_text` when available, or intelligently re-scraping multimedia content (audio, video, social media) with advanced cost optimizations.

---

## 📊 Cost Breakdown (Updated with Speed Optimization)

### Original Estimate (No Optimization)
```
629 rows with mixed content types:
├─ 450 articles (cached raw_text available)  ........ $4.50
├─ 89 audio files (avg 30 min each @ $0.024/min) ... $64.08
├─ 65 videos (transcript extraction) ................ $6.50
└─ 25 social media posts ............................ $0.50
                                                      ──────
TOTAL: $75.58
```

### ✅ Optimized Estimate (2x Audio Speed)
```
629 rows with mixed content types:
├─ 450 articles (cached raw_text) ................... $4.50
├─ 89 audio files (2x speed = 15 min effective) ..... $32.04  💰 50% SAVINGS
├─ 65 videos (2x speed if transcribed) .............. $3.25   💰 50% SAVINGS
└─ 25 social media posts ............................ $0.50
                                                      ──────
TOTAL: $40.29

With quality validation (70% already have usable raw_text):
REALISTIC COST: $20-30
```

**Total Savings: $35.29 (46.7% reduction)**

---

## 🚀 Key Innovation: Audio Speed Optimization

### The Strategy
1. **Speed up audio to 2x** using FFmpeg (preserves pitch)
2. **Transcribe the faster audio** (cuts time in half = cuts cost in half)
3. **Normalize timestamps** back to 1x speed timeline
4. **Return accurate transcript** with corrected timestamps

### Implementation
```python
# Speed up audio while preserving pitch
ffmpeg -i input.mp3 -filter:a "atempo=2.0" output.mp3

# Transcribe (costs 50% less due to half duration)
transcript = google_speech_to_text(output.mp3)

# Normalize timestamps: multiply by 2.0
for timestamp in transcript.timestamps:
    timestamp.start *= 2.0
    timestamp.end *= 2.0
```

### Cost Savings Example
```
30-minute podcast:
├─ Original: 30 min × $0.024/min = $0.72
└─ Optimized: 15 min × $0.024/min = $0.36
                                     ──────
                        SAVINGS: $0.36 (50%)

89 audio files total:
├─ Original cost: $64.08
└─ Optimized cost: $32.04
                   ──────
       TOTAL SAVINGS: $32.04
```

---

## 🎨 Content Type Processing

### 📄 Articles (450 rows)
**Strategy:** Use cached `raw_text` if quality score > 0.7
```python
if validate_raw_text(raw_text).score > 0.7:
    use_cached()  # $0.01 (just AI analysis)
else:
    rescrape()    # $0.02 (scraping + AI)
```

### 🎵 Audio - SoundCloud, Podcasts (89 rows)
**Strategy:** Multi-stage fallback with 2x speed optimization
```python
1. Check for embedded transcript/description → FREE
2. Download audio → speed up 2x → transcribe → $0.36 (vs $0.72)
3. Cache transcript for future use → FREE next time
```

**Processors:**
- SoundCloud metadata extraction
- Podcast RSS transcript checking
- Google Speech-to-Text (with 2x speed optimization)

### 🎬 Video - C-SPAN, YouTube (65 rows)
**Strategy:** Prefer embedded transcripts, fall back to 2x optimized transcription
```python
1. Check for embedded transcript (C-SPAN, YouTube captions) → FREE
2. Extract via youtube-transcript-api → FREE
3. Fallback: Extract audio → 2x speed → transcribe → $0.15 (vs $0.30)
```

**Special Handling:**
- C-SPAN: Official transcript extraction from player
- YouTube: Caption/subtitle API (free)
- Generic: Audio extraction + 2x speed transcription

### 🐦 Social Media - Twitter/X (25 rows)
**Strategy:** Multiple fallback methods to avoid API costs
```python
1. Nitter proxy (Twitter frontend, no auth) → FREE
2. Playwright with thread expansion → $0.02
3. Basic scraping → $0.01
```

**Features:**
- Thread extraction with proper ordering
- Quoted tweet context
- Image alt-text inclusion
- Formatted as readable text

---

## 🔍 Quality Validation System

### Raw Text Quality Score (0.0 - 1.0)
```python
quality_components = {
    'length': 1.0 if len(text) > 500 else 0.5,
    'cleanliness': 1.0 - (html_artifacts * 0.2),
    'coherence': unique_words / total_words,
    'error_free': 1.0 if no_error_markers else 0.0,
    'type_specific': content_type_validation()
}

quality_score = average(quality_components)
is_valid = quality_score >= 0.7 and no_critical_issues
```

### Decision Logic
```
If quality_score >= 0.7:
    ✓ Use cached raw_text (LOW COST)
    → AI analysis only: $0.01

If quality_score < 0.7:
    ⟳ Reprocess from source (MEDIUM COST)
    → Scraping + AI: $0.02-$0.40 depending on type

If raw_text missing:
    ⚠ Full processing required (HIGHER COST)
    → Type-specific processing: $0.02-$0.40
```

---

## 🛠️ Technical Architecture

```
┌──────────────────────────────────────────────────────┐
│  Google Sheets "test_runs"                           │
│  629 rows with varying data quality                  │
└─────────────────────┬────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────┐
│  Content Type Detection                              │
│  URL pattern analysis → article/audio/video/social   │
└─────────────────────┬────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────┐
│  Quality Validation                                  │
│  Score existing raw_text (0.0-1.0)                  │
└─────────┬────────────────────────────┬───────────────┘
          │                            │
    [Good Quality]              [Poor/Missing]
          │                            │
          ▼                            ▼
    ┌─────────┐              ┌──────────────────┐
    │  Cached │              │  Type-Specific   │
    │   $0.01 │              │   Processors     │
    └─────────┘              └──────────────────┘
                                      │
                 ┌────────────────────┼────────────────────┐
                 │                    │                    │
                 ▼                    ▼                    ▼
          ┌────────────┐      ┌────────────┐      ┌────────────┐
          │   Audio    │      │   Video    │      │   Social   │
          │ Processor  │      │ Processor  │      │ Processor  │
          │            │      │            │      │            │
          │ 2x Speed   │      │ Transcript │      │  Nitter/   │
          │   $0.36    │      │ Extract    │      │ Playwright │
          └────────────┘      │   $0.10    │      │   $0.02    │
                              └────────────┘      └────────────┘
                                      │
                                      ▼
                              ┌────────────────────┐
                              │  AI Analysis       │
                              │  (Gemini 2.0)      │
                              │  Categorize +      │
                              │  Summarize         │
                              └────────────────────┘
                                      │
                                      ▼
                              ┌────────────────────┐
                              │  Write to Sheet    │
                              │  Batch updates     │
                              │  + Processing note │
                              └────────────────────┘
```

---

## 📋 Features

### Core Functionality
- ✅ **Smart caching** - Uses existing raw_text when quality is good
- ✅ **Quality validation** - Scores text quality before processing
- ✅ **Content type detection** - Automatic routing to specialized processors
- ✅ **Cost tracking** - Real-time budget monitoring with hard limits
- ✅ **Batch processing** - Process in configurable batch sizes
- ✅ **Resume capability** - Checkpoint system for interruption recovery

### Multimedia Processing
- ✅ **Audio transcription** - Google Speech-to-Text with 2x speed optimization
- ✅ **Video transcript extraction** - YouTube captions, C-SPAN embedded transcripts
- ✅ **Social media extraction** - Twitter threads via Nitter proxy
- ✅ **Metadata extraction** - Rich metadata from all content types

### Cost Optimization
- ✅ **2x audio speed** - 50% transcription cost reduction
- ✅ **Multi-level caching** - Transcripts, metadata, processed content
- ✅ **Adaptive speed selection** - Intelligent speed based on audio quality
- ✅ **Budget enforcement** - Hard stop at configured limit

### Quality Control
- ✅ **Validation engine** - Comprehensive quality checks
- ✅ **Manual review flags** - Mark suspicious results for review
- ✅ **Detailed logging** - Full audit trail of all changes
- ✅ **Dry-run mode** - Preview changes and costs before execution

---

## 🎮 Usage

### Basic Usage
```bash
# Process all rows with defaults
python tools/diagnostics/smart_data_corrector.py

# Dry run (preview only, no changes)
python tools/diagnostics/smart_data_corrector.py --dry-run

# Limit to 10 rows for testing
python tools/diagnostics/smart_data_corrector.py --limit 10
```

### Advanced Options
```bash
# Process only specific content types
python tools/diagnostics/smart_data_corrector.py --content-types audio,video

# Process only rows missing specific fields
python tools/diagnostics/smart_data_corrector.py --missing-fields raw_text,summary

# Set custom budget limit
python tools/diagnostics/smart_data_corrector.py --max-cost 50.00

# Disable audio speed optimization (use 1x)
python tools/diagnostics/smart_data_corrector.py --no-speed-optimization

# Resume from checkpoint
python tools/diagnostics/smart_data_corrector.py --resume
```

---

## 📦 Dependencies

### Existing (Already in requirements.txt)
```
✓ google-cloud-speech    # Audio transcription
✓ google-generativeai    # AI analysis
✓ gspread                # Google Sheets
✓ playwright             # Web scraping
✓ yt-dlp                 # Video/audio download
✓ beautifulsoup4         # HTML parsing
✓ trafilatura            # Article extraction
```

### New (Need to add)
```
youtube-transcript-api==0.6.1   # YouTube captions (FREE)
pydub==0.25.1                   # Audio utilities
tenacity==8.2.3                 # Retry logic
tqdm==4.66.1                    # Progress bars
rich==13.7.0                    # Beautiful console output
click==8.1.7                    # CLI framework
```

---

## 📈 Success Metrics

### Quantitative
- **Coverage:** > 95% of rows have complete raw_text
- **Quality:** Average quality score > 0.80
- **Cost:** Total cost < $35 for 629 rows (with optimization)
- **Speed:** Process 629 rows in < 24 hours
- **Accuracy:** < 5% validation failures

### Qualitative
- Clear progress tracking and cost visibility
- Comprehensive audit trail of all changes
- Easy error recovery and manual review
- Maintainable and extensible codebase

---

## 🗓️ Implementation Timeline

| Week | Phase | Deliverables |
|------|-------|--------------|
| **1** | Core Framework | Content detection, quality validation, batch engine, cost tracker |
| **2** | Multimedia Processors | Audio (2x speed), video, social processors with fallbacks |
| **3** | AI & Validation | Gemini integration, validation engine, review flags |
| **4** | Polish & Testing | CLI, dry-run, resume, comprehensive tests |

**Total:** ~4 weeks to production-ready

---

## 🚦 Next Steps

### Immediate (This Week)
1. **Review & Approve** this implementation plan
2. **Test audio speed optimization** on 3 sample files
3. **Validate cost savings** with actual measurements
4. **Decision:** Proceed with full implementation?

### Short-term (Week 1-2)
1. Begin Phase 1: Core framework implementation
2. Build content type detection and routing
3. Implement quality validation system
4. Create batch processing engine

### Medium-term (Week 3-4)
1. Build specialized processors for each content type
2. Integrate AI analysis with validation
3. Add CLI with all configuration options
4. Comprehensive testing on sample data

### Long-term (Production)
1. Test on 10 rows (diverse content types)
2. Test on 50 rows (representative sample)
3. Full production run on 629 rows
4. Monitor, measure, optimize

---

## 📄 Documentation

- **PRD:** `PRD_SMART_DATA_CORRECTOR.md` (42 pages, comprehensive spec)
- **Audio Optimization:** `AUDIO_SPEED_OPTIMIZATION.md` (detailed cost reduction strategy)
- **Code Examples:** `MULTIMEDIA_PROCESSING_EXAMPLES.md` (concrete implementations)
- **This Summary:** `IMPLEMENTATION_SUMMARY.md`

---

## ❓ Questions to Resolve

1. **Accuracy vs Cost:** Acceptable Word Error Rate for 2x speed transcription?
2. **Quality Threshold:** What quality score (0.0-1.0) should trigger reprocessing?
3. **Budget:** Confirm $30-35 budget for full 629-row processing?
4. **Timeline:** Prefer 4-week comprehensive build or faster MVP?
5. **Testing:** Should we pilot test on 10 diverse rows first?

---

**Status:** PRD Complete, Ready for Implementation Approval
**Author:** Claude Code
**Date:** 2025-10-22
**Project:** Jay Rosen Internet Archive
