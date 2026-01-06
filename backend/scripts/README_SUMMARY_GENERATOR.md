# Summary Generator Script

## Overview

`generate_missing_summaries.py` automatically generates summaries for archive records that are missing them. The script intelligently uses available content (title, hashtags, metadata) to create descriptive 1-3 sentence summaries.

## Usage

### Dry Run (Preview Only)
```bash
cd /home/user/rosen-frontend
python3 backend/scripts/generate_missing_summaries.py --dry-run
```

This will show you what summaries would be generated **without** modifying the CSV file.

### Live Run (Apply Changes)
```bash
cd /home/user/rosen-frontend
python3 backend/scripts/generate_missing_summaries.py
```

This will:
1. Create a backup of the CSV (`archive_records-public.csv.backup`)
2. Generate summaries for all records missing them
3. Update the CSV with the new summaries
4. Generate a detailed report file

### Custom CSV Path
```bash
python3 backend/scripts/generate_missing_summaries.py --csv path/to/custom.csv
```

## What It Does

### 1. Identifies Missing Summaries
Scans the CSV for records where the `summary` field is empty or blank.

### 2. Generates Summaries Based on Available Content

The script uses a smart approach to generate summaries:

- **Title-based**: If the title is descriptive (not just "Studio 20"), uses it as the main description
- **Hashtag extraction**: Extracts hashtags from raw_text to provide topical context
- **Content type inference**: Identifies photo posts, link posts, etc.
- **Temporal context**: Adds publication year
- **Platform attribution**: Notes the source (e.g., "Studio 20 Tumblr blog")

### 3. Example Generated Summaries

| ID | Title | Generated Summary |
|----|-------|------------------|
| TUMBLR-00003 | ExplainerNet | Post about ExplainerNet. Published in 2011. Shared on the Studio 20 Tumblr blog. |
| TUMBLR-00006 | Photos from "Building A Better Explainer" Presentation | Photos from "Building A Better Explainer" Presentation. Published in 2011. Shared on the Studio 20 Tumblr blog. |
| TUMBLR-00112 | Studio 20 | Studio 20 post about Mark Luckie, Twitter, and Jason Samuels. Tagged with: Mark Luckie, Studio 20, Twitter, Jason Samuels, Guest. Published in 2010. Shared on the Studio 20 Tumblr blog. |

### 4. Creates Backup and Report

- **Backup**: `data/archive_records-public.csv.backup` (exact copy before changes)
- **Report**: `data/summary_generation_report_YYYYMMDD_HHMMSS.txt` (detailed log of all changes)

## Safety Features

1. **Dry run mode**: Preview changes before applying them
2. **Automatic backup**: Original CSV is preserved
3. **Detailed report**: Every change is logged
4. **No data loss**: Only fills empty fields, never overwrites existing summaries

## Current Status

As of 2026-01-06, there are **10 records** missing summaries, all from Tumblr:

- TUMBLR-00003: ExplainerNet
- TUMBLR-00006: Photos from "Building A Better Explainer" Presentation
- TUMBLR-00056 through TUMBLR-00129: Various Studio 20 posts

These are minimal Tumblr posts (photo posts, link posts, tagged posts) with very little text content, making them ideal candidates for automated summary generation.

## Technical Details

### Summary Generation Strategy

1. **Extract hashtags**: Uses regex to find all `#Hashtag` patterns
2. **Clean raw text**: Removes timestamps, special characters, noise
3. **Determine post type**: Photo, link, or general post
4. **Build summary**: Combines title, hashtags, and metadata
5. **Add context**: Temporal (year) and platform (Tumblr) attribution
6. **Enforce length**: Max 150 words, typically 50-100 words

### Summary Guidelines

Generated summaries are:
- **Descriptive**: Explain what the content is about
- **Concise**: 1-3 sentences (50-150 words)
- **Third person**: Professional archival tone
- **Contextual**: Include temporal and platform information

## After Running

Once you run the script (without `--dry-run`):

1. **Regenerate frontend data**:
   ```bash
   node data/export-archive-data.js
   ```

2. **Clear cache** (if needed):
   Update `CACHE_VERSION` in `frontend/services/archiveService.js`

3. **Verify changes**:
   ```bash
   git diff data/archive_records-public.csv
   ```

4. **Commit** (if satisfied):
   ```bash
   git add data/archive_records-public.csv
   git commit -m "feat: Add generated summaries for 10 Tumblr records"
   ```

## Troubleshooting

### No records found
- Check that the CSV path is correct
- Ensure the `summary` column exists in the CSV

### Script errors
- Verify Python 3.6+ is installed
- Check that the CSV is not corrupted
- Ensure write permissions on the data directory

### Unexpected summaries
- Run with `--dry-run` first to preview
- Manually edit any unsatisfactory summaries after running
- Consider improving the generation logic for edge cases
