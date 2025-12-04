# Newspaper Clippings Directory

Place your newspaper clipping files here.

## Supported Formats

- **PDF files** - Scanned newspaper clippings
- **Text files (.txt)** - Pre-OCR'd text
- **JSON files** - Pre-structured metadata

## Naming Convention (Recommended)

Use descriptive filenames that include publication and date:
```
nyt-1992-04-15-public-journalism-article.pdf
wsj-1995-rosen-interview.txt
wapo-2003-press-criticism.pdf
```

## Processing

The clipping processor will:
1. Extract/clean OCR text (for PDFs)
2. Detect publication from content
3. Extract metadata (date, author, headline)
4. Generate appropriate IDs (CLIP-00001, CLIP-02231, etc.)

Run with:
```bash
cd backend
python -m rosen_scraper.processors.clipping_processor --input ./clippings --output ../data/clipping_records.csv
```

## Supported Publications

The processor recognizes these publications automatically:
- New York Times (NYT-)
- Wall Street Journal (WSJ-)
- Washington Post (WP-)
- Los Angeles Times (LAT-)
- Chicago Tribune (CT-)
- Boston Globe (BG-)
- The Guardian (GRD-)
- Columbia Journalism Review (CJR-)
- American Journalism Review (AJR-)
- Editor & Publisher (EP-)
- Nieman Reports (NR-)
- Poynter (PYN-)

Unknown publications get CLIP- prefix.

## Tips

- Higher resolution scans = better OCR results
- If OCR quality is poor, provide pre-cleaned .txt files
- Include publication name in the filename for best results
