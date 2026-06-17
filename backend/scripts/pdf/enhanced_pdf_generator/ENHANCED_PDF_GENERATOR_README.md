# Enhanced PDF Generator Usage Guide

This guide explains how to use the new enhanced PDF generator that creates clean, accessible PDFs from the test_runs spreadsheet data.

## PDF Layout Format

The generated PDFs follow this exact structure:

1. **Title** (H1) - Large, bold heading, center-aligned
2. **Line break**
3. **Author | Publication Date | Original Publication** (H3) - Metadata line, center-aligned
4. **Line break** 
5. **URL** (italic, gray text, center-aligned)
6. **Line break**
7. **Pull Quote** (14pt paragraph, italic, center-aligned)
8. **Line break**
9. **Horizontal Divider** (gray line)
10. **Line break**
11. **Raw Text** (justified body paragraphs, left-aligned)

## Files Created

- `src/enhanced_pdf_generator/enhanced_pdf_generator.py` - Core PDF generation module
- `src/enhanced_pdf_generator/batch_pdf_generator.py` - Batch processing script for Google Sheets data
- `src/enhanced_pdf_generator/ENHANCED_PDF_GENERATOR_README.md` - This usage guide

## Usage Options

### 1. Generate Sample PDFs (Recommended for Testing)

```bash
# Generate 5 sample PDFs from test_runs sheet
python src/enhanced_pdf_generator/batch_pdf_generator.py sample

# Generate 10 sample PDFs
python src/enhanced_pdf_generator/batch_pdf_generator.py sample 10
```

### 2. Generate PDFs for All Records

```bash
# Generate PDFs for all records in test_runs sheet
python src/enhanced_pdf_generator/batch_pdf_generator.py all
```

### 3. Generate Single PDF from Python Code

```python
from src.enhanced_pdf_generator.enhanced_pdf_generator import create_enhanced_pdf

# Your record data from spreadsheet
record_data = {
    'id': 'EXAMPLE-001',
    'title': 'Article Title',
    'author': 'Jay Rosen',
    'publication_date': '2024-08-15',
    'original_publication': 'PressThink',
    'url': 'https://example.com/article',
    'pull_quote': 'Key insight from the article',
    'raw_text': 'Full article text content...'
}

# Generate PDF
pdf_path = create_enhanced_pdf(record_data, "output_directory")
```

## PDF Output Locations

Generated PDFs are saved to different directories based on how they're created:

### Default Output Directories:
- **Enhanced PDF Generator (default):** `enhanced_pdf_library/` (project root)
- **Sample PDFs:** `sample_pdfs/` (project root)
- **Full Batch PDFs:** `batch_generated_pdfs/` (project root)
- **Test PDFs:** `test_pdf_output/` (project root)

### Existing PDF Archives:
- **Current Archive:** `src/processed_pdf_library/` (contains existing PDFs from original generator)
- **PDF Library:** `pdf_library/` (project root)

### Custom Output:
You can specify any custom directory when calling the functions directly

## Requirements

- All dependencies from `requirements.txt` must be installed
- Google Sheets credentials must be configured (`google_credentials.json`)
- Environment variables must be set (`.env` file with `SPREADSHEET_NAME`)

## Features

### Accessibility & Readability
- Clean typography with proper font hierarchy
- Justified body text for professional appearance
- Proper spacing and margins
- Special character handling for clean rendering

### Data Handling
- Graceful handling of missing fields
- Automatic filename sanitization
- Error handling and logging
- Unicode character cleanup

### Customization
- Easy to modify styles in `src/enhanced_pdf_generator/enhanced_pdf_generator.py`
- Configurable output directories
- Adjustable margins and spacing

## Sample Output

Running the generator writes a sample PDF under `test_pdf_output/` (named after the record title and id). That directory is not committed — the file is generated on each run.

## Troubleshooting

### Common Issues

1. **Missing Dependencies**
   ```bash
   pip install reportlab gspread python-dotenv
   ```

2. **Google Sheets Connection Errors**
   - Verify `google_credentials.json` is in root directory
   - Check `SPREADSHEET_NAME` in `.env` file
   - Ensure service account has access to the spreadsheet

3. **File Permission Errors**
   - Ensure output directory is writable
   - Close any open PDF files before regenerating

### Error Messages

- `"Missing title and raw_text"` - Record has insufficient data for PDF generation
- `"Could not create PDF"` - Check file permissions and directory access
- `"Error connecting to Google Sheets"` - Verify credentials and spreadsheet access

## Next Steps

1. Test with sample data: `python src/enhanced_pdf_generator/batch_pdf_generator.py sample 3`
2. Review generated PDFs for formatting
3. Adjust styles in `src/enhanced_pdf_generator/enhanced_pdf_generator.py` if needed
4. Run full batch generation when satisfied: `python src/enhanced_pdf_generator/batch_pdf_generator.py all`