# Audio Speed Optimization for Transcription Cost Reduction
**Smart Data Corrector - Advanced Cost Optimization**

## Strategy Overview

**Core Idea:** Speed up audio to 2x before transcription, then normalize timestamps back to 1x speed.

### Cost Savings
```
Original Cost:
- 30-minute podcast @ $0.024/min = $0.72

Optimized Cost:
- 15-minute audio (2x speed) @ $0.024/min = $0.36

SAVINGS: 50% reduction ($0.36 saved per 30-min file)

For 89 audio files (avg 30min each):
- Original: $64.08
- Optimized: $32.04
- TOTAL SAVINGS: $32.04 (50% reduction)
```

---

## Technical Implementation

### 1. FFmpeg Audio Speed Manipulation

**Critical Requirement:** Preserve pitch while increasing speed to maintain intelligibility.

```python
def speed_up_audio_2x(input_file, output_file):
    """
    Speed up audio to 2x while preserving pitch quality.

    FFmpeg filters:
    - atempo: Adjusts tempo without changing pitch (max 2.0x)
    - For speeds > 2.0x, chain multiple atempo filters
    """
    import subprocess

    # FFmpeg command with atempo filter (preserves pitch)
    command = [
        'ffmpeg',
        '-i', input_file,
        '-filter:a', 'atempo=2.0',  # 2x speed, preserves pitch
        '-vn',  # Remove video if present
        output_file,
        '-y'  # Overwrite output file
    ]

    result = subprocess.run(
        command,
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        raise Exception(f"FFmpeg failed: {result.stderr}")

    return output_file


def speed_up_audio_custom(input_file, output_file, speed_factor=2.0):
    """
    Speed up audio by any factor (handles > 2.0x via filter chaining).

    atempo filter limitation: max 2.0x per filter
    For 3x speed: chain two filters (2.0 * 1.5 = 3.0)
    """
    import subprocess
    import math

    # Calculate filter chain needed
    if speed_factor <= 2.0:
        filter_complex = f'atempo={speed_factor}'
    else:
        # Chain multiple atempo filters
        num_filters = math.ceil(math.log(speed_factor, 2))
        filters = []
        remaining_speed = speed_factor

        for _ in range(num_filters):
            if remaining_speed > 2.0:
                filters.append('atempo=2.0')
                remaining_speed /= 2.0
            else:
                filters.append(f'atempo={remaining_speed}')
                remaining_speed = 1.0

        filter_complex = ','.join(filters)

    command = [
        'ffmpeg',
        '-i', input_file,
        '-filter:a', filter_complex,
        '-vn',
        output_file,
        '-y'
    ]

    result = subprocess.run(command, capture_output=True, text=True)

    if result.returncode != 0:
        raise Exception(f"FFmpeg failed: {result.stderr}")

    return output_file
```

### 2. Complete Optimized Transcription Pipeline

```python
def transcribe_audio_optimized(audio_url, duration_seconds, speed_factor=2.0):
    """
    Optimized transcription pipeline with speed manipulation.

    Steps:
    1. Download original audio
    2. Speed up to 2x (or custom factor)
    3. Transcribe sped-up audio
    4. Normalize timestamps back to 1x speed
    5. Return transcript with corrected timestamps

    Cost savings: ~50% for 2x speed
    """
    import io
    import tempfile
    import subprocess
    from google.cloud import speech

    print(f"  [OPTIMIZATION] Speeding up audio by {speed_factor}x for cost reduction")

    with tempfile.TemporaryDirectory() as temp_dir:
        # File paths
        original_audio = f"{temp_dir}/original.mp3"
        sped_up_audio = f"{temp_dir}/sped_up.mp3"
        wav_file = f"{temp_dir}/final.wav"

        # Step 1: Download original audio
        print(f"  [DOWNLOAD] Fetching audio file...")
        subprocess.run([
            'yt-dlp',
            '-x',  # Extract audio only
            '--audio-format', 'mp3',
            '-o', original_audio,
            audio_url
        ], capture_output=True, check=True)

        # Step 2: Speed up audio (2x speed, preserve pitch)
        print(f"  [SPEEDUP] Increasing speed to {speed_factor}x (pitch preserved)...")
        speed_up_audio_custom(original_audio, sped_up_audio, speed_factor)

        # Step 3: Convert to format Google STT accepts
        print(f"  [CONVERT] Converting to LINEAR16 WAV...")
        subprocess.run([
            'ffmpeg',
            '-i', sped_up_audio,
            '-ac', '1',          # Mono
            '-ar', '16000',      # 16kHz sample rate
            '-acodec', 'pcm_s16le',  # LINEAR16
            wav_file,
            '-y'
        ], capture_output=True, check=True)

        # Step 4: Transcribe the sped-up audio
        actual_duration = duration_seconds / speed_factor
        print(f"  [STT] Transcribing {actual_duration/60:.1f} minutes (original: {duration_seconds/60:.1f} min)")
        print(f"  [COST] Estimated: ${actual_duration/60 * 0.024:.2f} (vs ${duration_seconds/60 * 0.024:.2f} original)")

        with io.open(wav_file, 'rb') as audio_file:
            content = audio_file.read()

        # Initialize Google Speech-to-Text client
        client = speech.SpeechClient()

        audio = speech.RecognitionAudio(content=content)
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=16000,
            language_code='en-US',
            enable_automatic_punctuation=True,
            enable_word_time_offsets=True,  # Get timestamps for normalization
            model='latest_long'
        )

        # Perform transcription
        operation = client.long_running_recognize(config=config, audio=audio)
        response = operation.result(timeout=600)

        # Step 5: Normalize timestamps back to 1x speed
        print(f"  [NORMALIZE] Adjusting timestamps to original speed...")
        normalized_transcript = normalize_timestamps(response, speed_factor)

        return normalized_transcript


def normalize_timestamps(stt_response, speed_factor):
    """
    Normalize timestamps from sped-up audio back to original timeline.

    If audio was sped up by 2x:
    - Timestamp 10s in transcript → 20s in original
    - Multiply all timestamps by speed_factor
    """
    normalized_results = []

    for result in stt_response.results:
        alternative = result.alternatives[0]
        transcript_text = alternative.transcript

        # Get word-level timing if available
        words_with_timing = []
        if alternative.words:
            for word_info in alternative.words:
                # Convert protobuf Duration to seconds
                start_time = (
                    word_info.start_time.seconds +
                    word_info.start_time.microseconds / 1e6
                )
                end_time = (
                    word_info.end_time.seconds +
                    word_info.end_time.microseconds / 1e6
                )

                # Normalize to original timeline
                normalized_start = start_time * speed_factor
                normalized_end = end_time * speed_factor

                words_with_timing.append({
                    'word': word_info.word,
                    'start_time': normalized_start,
                    'end_time': normalized_end
                })

        normalized_results.append({
            'transcript': transcript_text,
            'words': words_with_timing
        })

    # Format as readable text with optional timestamps
    formatted_transcript = format_transcript_with_timestamps(normalized_results)

    return formatted_transcript


def format_transcript_with_timestamps(results, include_timestamps=False):
    """
    Format transcript with optional timestamp annotations.

    Options:
    1. Plain text (no timestamps) - for AI analysis
    2. Timestamped text - for manual review/reference
    """
    if not include_timestamps:
        # Simple concatenation for AI processing
        return ' '.join([r['transcript'] for r in results])

    # Formatted with timestamps for reference
    formatted = []
    for result in results:
        if result['words']:
            # Get start time of first word
            start_time = result['words'][0]['start_time']
            timestamp = format_seconds_as_timestamp(start_time)
            formatted.append(f"[{timestamp}] {result['transcript']}")
        else:
            formatted.append(result['transcript'])

    return '\n'.join(formatted)


def format_seconds_as_timestamp(seconds):
    """Convert seconds to MM:SS or HH:MM:SS format."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)

    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    else:
        return f"{minutes:02d}:{secs:02d}"
```

### 3. Video Audio Extraction with Speed Optimization

```python
def process_video_with_optimized_transcription(url, speed_factor=2.0):
    """
    Extract audio from video, speed up, transcribe, normalize.

    Works for:
    - YouTube videos
    - C-SPAN videos (if no transcript available)
    - Any video URL supported by yt-dlp
    """
    import subprocess
    import tempfile

    with tempfile.TemporaryDirectory() as temp_dir:
        audio_file = f"{temp_dir}/video_audio.mp3"

        # Extract audio from video using yt-dlp
        print(f"  [VIDEO] Extracting audio track...")
        subprocess.run([
            'yt-dlp',
            '-x',  # Extract audio
            '--audio-format', 'mp3',
            '-o', audio_file,
            url
        ], capture_output=True, check=True)

        # Get video metadata for duration
        import json
        metadata_result = subprocess.run([
            'yt-dlp',
            '--dump-json',
            '--no-download',
            url
        ], capture_output=True, text=True)

        metadata = json.loads(metadata_result.stdout)
        duration = metadata.get('duration', 1800)  # Default 30 min

        # Use optimized transcription
        transcript = transcribe_audio_optimized(
            f"file://{audio_file}",  # Local file URL
            duration,
            speed_factor=speed_factor
        )

        return {
            'raw_text': transcript,
            'title': metadata.get('title'),
            'author': metadata.get('uploader'),
            'publication_date': metadata.get('upload_date'),
            'duration': duration,
            'source': 'video_audio_transcription_optimized'
        }
```

---

## Quality Assurance

### 1. Transcription Accuracy Testing

**Potential Concern:** Does speeding up audio reduce transcription accuracy?

```python
def test_speed_accuracy(test_audio_url):
    """
    Compare transcription accuracy at different speeds.

    Test methodology:
    1. Transcribe at 1x speed (baseline)
    2. Transcribe at 1.5x speed
    3. Transcribe at 2.0x speed
    4. Compare word error rate (WER)
    """
    from jiwer import wer

    # Transcribe at different speeds
    transcript_1x = transcribe_audio_optimized(test_audio_url, 1800, speed_factor=1.0)
    transcript_15x = transcribe_audio_optimized(test_audio_url, 1800, speed_factor=1.5)
    transcript_2x = transcribe_audio_optimized(test_audio_url, 1800, speed_factor=2.0)

    # Calculate word error rate
    wer_15x = wer(transcript_1x, transcript_15x)
    wer_2x = wer(transcript_1x, transcript_2x)

    print(f"Word Error Rate (1.5x): {wer_15x:.2%}")
    print(f"Word Error Rate (2.0x): {wer_2x:.2%}")

    # Acceptable if WER < 5%
    return {
        '1.5x_acceptable': wer_15x < 0.05,
        '2.0x_acceptable': wer_2x < 0.05
    }
```

### 2. Adaptive Speed Selection

```python
def select_optimal_speed(audio_metadata):
    """
    Intelligently select speed factor based on content characteristics.

    Factors:
    - Speaking rate (words per minute)
    - Audio quality
    - Background noise
    - Speaker accent/clarity
    """
    # Default: 2.0x for maximum savings
    speed_factor = 2.0

    # Check audio quality indicators
    if audio_metadata.get('bitrate', 128) < 64:
        # Low quality audio - use slower speed for accuracy
        speed_factor = 1.5
        print("  [ADAPTIVE] Low bitrate detected, using 1.5x speed")

    # Check speaking rate (if available from metadata/description)
    description = audio_metadata.get('description', '').lower()
    if any(word in description for word in ['fast-paced', 'rapid', 'quick']):
        speed_factor = 1.5
        print("  [ADAPTIVE] Fast-paced content detected, using 1.5x speed")

    # Check for multiple speakers (harder to transcribe at high speed)
    if 'interview' in description or 'conversation' in description:
        speed_factor = 1.75
        print("  [ADAPTIVE] Multi-speaker content, using 1.75x speed")

    return speed_factor
```

---

## Integration with Main Pipeline

### Updated Audio Processor

```python
class AudioProcessor:
    """Enhanced audio processor with speed optimization."""

    def __init__(self, cost_optimization=True, default_speed=2.0):
        self.cost_optimization = cost_optimization
        self.default_speed = default_speed

    def process_audio(self, url, metadata=None):
        """Process audio with intelligent speed selection."""

        # Get audio metadata
        if not metadata:
            metadata = self.extract_audio_metadata(url)

        duration = metadata.get('duration', 1800)

        # Calculate cost savings
        original_cost = (duration / 60) * 0.024
        optimized_cost = (duration / 60 / self.default_speed) * 0.024
        savings = original_cost - optimized_cost

        print(f"  [COST OPTIMIZATION]")
        print(f"    Original cost: ${original_cost:.2f}")
        print(f"    Optimized cost: ${optimized_cost:.2f}")
        print(f"    Savings: ${savings:.2f} ({savings/original_cost*100:.0f}%)")

        # Select optimal speed
        if self.cost_optimization:
            speed_factor = select_optimal_speed(metadata)
        else:
            speed_factor = 1.0  # No optimization

        # Transcribe with optimization
        transcript = transcribe_audio_optimized(url, duration, speed_factor)

        return {
            'raw_text': transcript,
            'metadata': metadata,
            'cost_savings': savings,
            'speed_factor_used': speed_factor
        }
```

---

## Cost Impact Analysis

### Original Cost Structure (No Optimization)
```
89 audio files @ 30 min average:
- Total duration: 2,670 minutes (44.5 hours)
- Cost: 2,670 × $0.024 = $64.08
```

### Optimized Cost Structure (2x Speed)
```
89 audio files @ 15 min effective (2x speed):
- Total duration: 1,335 minutes (22.25 hours)
- Cost: 1,335 × $0.024 = $32.04
- SAVINGS: $32.04 (50%)
```

### Adaptive Speed (Variable 1.5x - 2.0x)
```
Estimated distribution:
- 70% at 2.0x speed: 62 files → $22.42
- 20% at 1.75x speed: 18 files → $6.58
- 10% at 1.5x speed: 9 files → $3.84
- TOTAL: $32.84
- SAVINGS: $31.24 (48.7%)
```

### Total Project Cost Impact
```
BEFORE OPTIMIZATION:
- Articles (cached): $4.50
- Audio files: $64.08
- Video files: $6.50
- Social media: $0.50
- Total: $75.58

AFTER OPTIMIZATION:
- Articles (cached): $4.50
- Audio files: $32.04 (50% reduction)
- Video files: $3.25 (50% reduction, if transcribed)
- Social media: $0.50
- Total: $40.29

TOTAL PROJECT SAVINGS: $35.29 (46.7% reduction)
```

---

## Potential Risks & Mitigations

### Risk 1: Reduced Accuracy
**Mitigation:**
- Test on sample files first
- Use adaptive speed selection
- Fall back to 1x if accuracy drops

### Risk 2: Speaker-Dependent Quality
**Mitigation:**
- Analyze speaker rate from metadata
- Use 1.5x for fast speakers
- Use 2x for slow/clear speakers

### Risk 3: Background Noise Amplification
**Mitigation:**
- Apply noise reduction before speed-up
- Use lower speed (1.5x) for noisy audio

### Risk 4: Timestamp Synchronization Errors
**Mitigation:**
- Thorough testing of normalization function
- Validate timestamps against known checkpoints
- Include original speed factor in metadata

---

## Testing Plan

### Phase 1: Proof of Concept (3 files)
1. Clear speech, slow speaker → Test at 2.0x
2. Podcast interview, multiple speakers → Test at 1.75x
3. Low quality audio → Test at 1.5x

**Success Criteria:** WER < 5% compared to 1x transcription

### Phase 2: Small Batch (10 files)
- Process 10 diverse audio files
- Measure accuracy across different speeds
- Validate cost savings

**Success Criteria:** Average WER < 5%, 40%+ cost reduction

### Phase 3: Production Rollout (All files)
- Process all 89 audio files
- Monitor accuracy metrics
- Track actual cost savings

**Success Criteria:** 95%+ files processed successfully, 45%+ cost reduction

---

## Implementation Checklist

- [ ] Update `transcribe_audio_url()` to use speed optimization
- [ ] Implement `speed_up_audio_2x()` with FFmpeg
- [ ] Implement `normalize_timestamps()` function
- [ ] Add adaptive speed selection logic
- [ ] Create accuracy testing framework
- [ ] Update cost tracking to show savings
- [ ] Add configuration flag to enable/disable optimization
- [ ] Test on 3 sample files
- [ ] Validate timestamp accuracy
- [ ] Document accuracy results
- [ ] Roll out to production

---

## Configuration

```python
# config.py or command-line arguments

AUDIO_OPTIMIZATION_CONFIG = {
    'enabled': True,
    'default_speed_factor': 2.0,
    'adaptive_speed': True,
    'speed_limits': {
        'max': 2.0,
        'min': 1.0
    },
    'quality_thresholds': {
        'low_bitrate': 64,  # kbps
        'acceptable_wer': 0.05  # 5% word error rate
    },
    'preserve_pitch': True,  # Always preserve pitch
    'save_timestamps': True  # Save normalized timestamps
}
```

---

## Next Steps

1. **Immediate:** Test speed optimization on 3 sample audio files
2. **Short-term:** Integrate into main audio processor
3. **Medium-term:** Apply to all audio and video content
4. **Long-term:** Explore speeds > 2x with accuracy validation

**Expected Outcome:** 45-50% reduction in transcription costs with minimal accuracy impact.

**Questions to Resolve:**
- Acceptable WER threshold?
- Preference for cost vs. accuracy trade-offs?
- Should we save both sped-up and original transcripts for comparison?
