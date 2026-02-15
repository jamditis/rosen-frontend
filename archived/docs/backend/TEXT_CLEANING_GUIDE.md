# Text Cleaning and Formatting Workflow Guide

This guide explains how to use the comprehensive text cleaning system to improve the quality of scraped content in the `raw_text` column of the spreadsheet.

## Overview

The text cleaning system addresses common issues with scraped web content:

- **HTML artifacts** and markup remnants
- **Navigation elements** (menus, breadcrumbs, social links)
- **Structural elements** (headers, footers, pagination)
- **Technical artifacts** (JavaScript, CSS, ads)
- **Poor paragraph structure** and formatting
- **Repetitive content** and duplicated text
- **Unicode issues** and special characters

## System Components

### 1. TextCleaner Class
Core cleaning engine that applies multiple cleaning strategies:
- HTML artifact removal
- Unicode normalization
- Navigation element filtering
- Social media content removal
- Paragraph structure improvement
- Content deduplication
- Quality scoring

### 2. TextCleaningWorkflow Class
Google Sheets integration for batch processing:
- Spreadsheet connection management
- Batch text cleaning and updates
- Progress tracking and error handling
- Quality analysis and reporting

## Usage Instructions

### Step 1: Analyze Current Text Quality

Before cleaning, analyze the current state of your raw_text data:

```bash
# Analyze first 50 records
python src/text_cleaner.py analyze 50

# Analyze first 100 records  
python src/text_cleaner.py analyze 100
```

**Output:**
- Total records analyzed
- Quality distribution (empty, short, low/medium/high quality)
- Sample issues with improvement potential
- Overall assessment of cleaning needs

### Step 2: Test Cleaning on Small Batch

Test the cleaning process on a small batch first:

```bash
# Clean first 5 records starting from row 0
python src/text_cleaner.py clean 0 5

# Clean 10 records starting from row 10
python src/text_cleaner.py clean 10 10
```

### Step 3: Run Aggressive Cleaning (If Needed)

For heavily corrupted content, use aggressive cleaning:

```bash
# Aggressive cleaning on first 10 records
python src/text_cleaner.py clean 0 10 aggressive
```

### Step 4: Deploy Full Cleaning Process

Once satisfied with test results, process larger batches:

```bash
# Clean first 100 records
python src/text_cleaner.py clean 0 100

# Clean records 100-200
python src/text_cleaner.py clean 100 100

# Process all remaining records in batches
python src/text_cleaner.py clean 200 100
python src/text_cleaner.py clean 300 100
# ... continue as needed
```

## Cleaning Strategies

### Standard Cleaning Process

1. **HTML Artifact Removal**
   - Removes HTML tags and entities
   - Cleans technical markup remnants
   - Normalizes special characters

2. **Navigation Element Filtering**
   - Removes menu items and breadcrumbs
   - Filters out "Skip to content" and similar UI text
   - Eliminates category and tag listings

3. **Social Media Cleanup**
   - Removes sharing buttons and social links
   - Filters out "Follow us" and similar prompts
   - Eliminates social media platform names

4. **Structural Element Removal**
   - Removes header and footer content
   - Eliminates pagination and navigation
   - Filters out "Read more" and similar prompts

5. **Paragraph Structure Improvement**
   - Normalizes line breaks and spacing
   - Creates proper paragraph separation
   - Improves sentence flow and readability

6. **Content Deduplication**
   - Removes repetitive sentences and paragraphs
   - Filters out very short, meaningless content
   - Ensures unique, substantial text

### Aggressive Cleaning (Optional)

Additional cleaning for heavily corrupted content:
- Removes lines with low alphabetic content ratio
- Filters out very short lines (likely artifacts)
- Applies stricter content quality thresholds

## Quality Assessment

### Quality Scoring (0-100)

- **Length appropriateness** (100-10,000 characters): +20 points
- **Paragraph structure** (2-20 paragraphs): +20 points  
- **Sentence structure** (3+ sentences): +15 points
- **Word count** (50-2000 words): +15 points
- **Alphabetic content ratio** (>70%): +20 points
- **Artifact presence**: -5 points per common artifact

### Improvement Metrics

- **Significant improvement**: >20% improvement score
- **Minor improvement**: 5-20% improvement score
- **No improvement needed**: <5% improvement score

### Success Indicators

- Reduced content length with maintained meaning
- Better paragraph and sentence structure
- Higher alphabetic content ratio
- Removal of navigation and UI elements
- Improved overall readability

## Batch Processing Best Practices

### Recommended Workflow

1. **Start Small**: Always test with 5-10 records first
2. **Review Results**: Check a few cleaned texts manually
3. **Adjust Strategy**: Use aggressive mode if needed
4. **Process in Batches**: Use 50-100 record batches for large datasets
5. **Monitor Progress**: Watch for errors and success rates

### Safety Measures

- **Automatic Backups**: Original text is preserved until confirmed
- **Error Handling**: Failed records are logged and skipped
- **Rate Limiting**: Built-in delays prevent API quota issues
- **Progress Tracking**: Detailed logging of all operations

### Performance Considerations

- **API Rate Limits**: 0.5 second delay between updates
- **Batch Size**: 10-100 records per batch depending on content size
- **Memory Usage**: Processes one record at a time to manage memory
- **Network Stability**: Requires stable connection to Google Sheets

## Output and Results

### Console Output

```
Found raw_text in column 32 (AF)
Processing 10 records starting from row 1...
  Row 2: Processing 'Some personal news...'
    [IMPROVED] by 30.0% (Quality: 70/100)
  Row 3: Processing 'Why Trump Is Winning...'
    [NO CHANGE] No significant improvement needed
  Row 4: Processing 'Prof. Jay Rosen interviewed...'
    [IMPROVED] by 25.5% (Quality: 75/100)

Applying 2 updates to spreadsheet...
[SUCCESS] Updates applied successfully

==================================================
CLEANING BATCH RESULTS
==================================================
Records processed: 10
Records improved: 7
Significant improvements: 5
Errors: 0
```

### Spreadsheet Updates

- Only records with >5% improvement are updated
- Original text is replaced with cleaned version
- Changes are applied immediately to Google Sheets
- Update history is tracked in console output

### Quality Improvements

Typical improvements include:
- **Cleaner paragraph structure** with proper breaks
- **Removal of navigation artifacts** like "Skip to content"
- **Better text flow** with normalized spacing
- **Elimination of repetitive content**
- **Unicode normalization** for better character display

## Common Issues and Solutions

### Issue: "Column not found"
**Solution**: Verify 'raw_text' column exists in 'test_runs' worksheet

### Issue: "API rate limit exceeded"
**Solution**: Reduce batch size or increase delay between updates

### Issue: "Unicode encoding errors"
**Solution**: Text cleaner handles UTF-8 encoding automatically

### Issue: "Low improvement scores"
**Solution**: Use aggressive cleaning mode or manual review

### Issue: "Too much content removed"
**Solution**: Reduce cleaning aggressiveness or review filter patterns

## Advanced Configuration

### Customizing Cleaning Patterns

Edit `text_cleaner.py` to modify cleaning patterns:

```python
# Add custom navigation patterns
self.navigation_patterns.append(r'Your custom pattern')

# Modify social media patterns
self.social_patterns.extend(['CustomSocial', 'AnotherPattern'])
```

### Adjusting Quality Thresholds

Modify improvement thresholds in the cleaning workflow:

```python
# Change minimum improvement threshold
if cleaning_result['improvement_percentage'] > 10:  # Changed from 5
```

### Custom Aggressive Cleaning

Implement additional aggressive cleaning strategies:

```python
def _custom_aggressive_cleaning(self, text):
    # Your custom cleaning logic
    return cleaned_text
```

## Integration with PDF Generation

The cleaned text directly improves PDF quality:

1. **Run text cleaning first**:
   ```bash
   python src/text_cleaner.py clean 0 50
   ```

2. **Generate PDFs with cleaned content**:
   ```bash
   python src/enhanced_pdf_generator/batch_pdf_generator.py sample 50
   ```

3. **Result**: PDFs with significantly improved readability and structure

## Troubleshooting

### Common Error Messages

**"Successfully connected to spreadsheet"** - Normal operation
**"Error connecting to Google Sheets"** - Check credentials and network
**"Column not found"** - Verify worksheet structure
**"API rate limit"** - Reduce batch size or increase delays

### Performance Tips

- **Process during off-peak hours** for better API performance
- **Use smaller batches** (25-50 records) for large datasets
- **Monitor console output** for errors and progress
- **Review sample results** before processing large batches

### Quality Verification

After cleaning, verify improvements by:
- **Manual review** of 5-10 cleaned texts
- **PDF generation** to see visual improvements
- **Readability assessment** of cleaned content
- **Comparison** with original raw text

---

This text cleaning system provides a robust foundation for improving scraped content quality, resulting in better PDFs and more accessible archive materials.