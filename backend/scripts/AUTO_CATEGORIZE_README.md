# Auto-Categorization Script

## Overview

The `auto_categorize_records.py` script automatically assigns thematic categories to the 202 uncategorized archive records using keyword matching and heuristic analysis.

## Location

```
/home/user/rosen-frontend/backend/scripts/auto_categorize_records.py
```

## Valid Categories

The script assigns records to one or more of these six categories:

1. **Press & Media Criticism** - Critical analysis of media institutions and news coverage
2. **Journalism Theory & Practice** - Foundational principles and methodologies
3. **Journalism Education** - Teaching, curriculum, and academic programs
4. **Politics & Democracy** - Political coverage and journalism's civic role
5. **Technology & Digital Media** - Digital platforms and technological transformation
6. **Audience & Public Engagement** - Reader participation and community interaction

## How It Works

### 1. Data Analysis

The script analyzes multiple text sources for each record:
- **Title** - Primary source for categorization
- **URL** - Additional context clues
- **Summary** - AI-generated summary (when available)
- **Excerpt** - Extracted excerpt (when available)
- **Raw text** - First 2000 characters of full content
- **Tags** - Existing tags

### 2. Pattern Matching

Each category has two types of keyword patterns:

**Strong patterns** (contribute 0.3 to confidence score):
- Highly specific terms that strongly indicate a category
- Examples: "Studio 20", "public journalism", "twitter", "democracy"

**Medium patterns** (contribute 0.1 to confidence score):
- More general terms that suggest a category
- Examples: "media", "journalist", "community", "political"

### 3. Scoring System

- Each pattern match adds to the record's confidence score for that category
- Categories are only assigned if the confidence score exceeds the threshold (default: 0.6)
- Multiple categories can be assigned to a single record
- Records below the threshold are flagged for manual review

### 4. Special Cases

The script includes special case handling:
- Generic "Studio 20" titles → automatically assigned to "Journalism Education"
- URL patterns (e.g., "studio20nyu.tumblr.com" → Journalism Education)

## Key Heuristics

### Journalism Education
- **Strong signals**: "Studio 20", "NYU", "teaching", "curriculum", "journalism school"
- **Medium signals**: "academic", "university", "professor", "student"

### Technology & Digital Media
- **Strong signals**: "blog", "twitter", "social media", "platform", "digital"
- **Medium signals**: "online", "web", "data", "podcast"

### Audience & Public Engagement
- **Strong signals**: "audience", "reader", "public journalism", "citizen", "participation"
- **Medium signals**: "community", "public", "engagement", "conversation"

### Press & Media Criticism
- **Strong signals**: "press", "media criticism", "news coverage", "view from nowhere"
- **Medium signals**: "media", "news", "newsroom", "coverage"

### Politics & Democracy
- **Strong signals**: "democracy", "election", "campaign", "democratic backsliding"
- **Medium signals**: "politics", "government", "policy", "civic"

### Journalism Theory & Practice
- **Strong signals**: "journalism theory", "professional standards", "objectivity"
- **Medium signals**: "journalism", "reporting", "editor", "newspaper"

## Usage

### Dry Run (Recommended First)

Test the categorization without modifying files:

```bash
cd /home/user/rosen-frontend
python3 backend/scripts/auto_categorize_records.py --dry-run
```

### Adjust Confidence Threshold

Lower threshold (more aggressive, assigns more categories):
```bash
python3 backend/scripts/auto_categorize_records.py --dry-run --confidence-threshold 0.5
```

Higher threshold (more conservative, fewer assignments):
```bash
python3 backend/scripts/auto_categorize_records.py --dry-run --confidence-threshold 0.7
```

### Apply Changes

Once satisfied with the dry run results:
```bash
python3 backend/scripts/auto_categorize_records.py
```

This will:
1. Update `data/archive_records-public.csv` with new categories
2. Generate a detailed report in `backend/reports/categorization_report_TIMESTAMP.csv`

## Output

### Console Report

The script prints a comprehensive report showing:
- Total records processed
- Successfully categorized count
- Records needing manual review
- Records with no content
- Breakdown of categories assigned
- Sample of records flagged for review

### CSV Report

A detailed CSV report is saved to `backend/reports/` with:
- Record ID
- Title
- URL
- Assigned categories
- Status (Categorized / Needs Review)

## Conservative Approach

The script is intentionally conservative:

✅ **Will categorize** when:
- Multiple strong pattern matches found
- Clear, unambiguous content signals
- Special case rules apply

❌ **Will flag for manual review** when:
- Confidence score below threshold
- Ambiguous or minimal content
- No clear category signals

⚠️ **Records with no content** are tracked separately for investigation

## Expected Results

Based on the sample data:

- **High confidence**: Studio 20 records (138 Tumblr posts) → Journalism Education
- **Medium-high confidence**: Records with clear titles and summaries
- **Needs review**: Generic titles, minimal content, ambiguous topics
- **No content**: Records missing summary, excerpt, and raw text

## Next Steps After Running

1. **Review the report** - Check the categorization_report CSV
2. **Examine flagged records** - Manually categorize records marked "Needs Review"
3. **Validate assignments** - Spot-check automatically assigned categories
4. **Iterate if needed** - Adjust confidence threshold and re-run
5. **Regenerate frontend data** - Run `node data/export-archive-data.js` to update split files

## Backup Recommendation

Before running without `--dry-run`, create a backup:

```bash
cp data/archive_records-public.csv data/archive_records-public.csv.backup
```

## Troubleshooting

### Too many "Needs Review" records
- Lower the confidence threshold (try 0.5 or 0.55)
- Review the pattern matching rules and add more keywords

### Too many categories assigned
- Raise the confidence threshold (try 0.7 or 0.75)
- Review multi-category assignments for accuracy

### Specific records miscategorized
- Add special case rules to the script
- Manually override in CSV after script runs
