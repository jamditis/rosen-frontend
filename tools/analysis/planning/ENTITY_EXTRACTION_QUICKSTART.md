# Entity Extraction Quick Start Guide

## What It Does

The entity extraction system reads article text from column AH (raw_text) in your "test_runs" Google Sheet, uses AI to identify entities (people, organizations, concepts, etc.) and their relationships, then writes the results to two new sheets:
- `extracted_entities` - All identified entities with metadata
- `extracted_relationships` - Connections between entities

## Quick Test (5 Records)

```bash
# Test with first 5 records
python src/entity_extraction_batch_processor.py --test
```

Expected output:
```
================================================================================
ENTITY EXTRACTION BATCH PROCESSOR
================================================================================
Spreadsheet: Rosen Archive URL List
Batch size: 50
Test mode: True
Starting from row: 1
================================================================================

[SHEETS] Connecting to Google Sheets...
[SHEETS] Successfully connected to 'Rosen Archive URL List'
[INFO] Found 0 existing entities in sheet

[FETCH] Fetched 5 records to process (starting from row 2)

[PROCESS] Processing CJR-00001...
  [ENTITY] Extracting entities from record CJR-00001...
  [ENTITY] Successfully extracted 12 entities and 8 relationships

[WRITE] Writing 12 entity rows...
[WRITE] Successfully wrote 12 entities
[WRITE] Writing 8 relationship rows...
[WRITE] Successfully wrote 8 relationships
```

## Run Production Processing

### Process First 50 Records

```bash
python src/entity_extraction_batch_processor.py --limit 50
```

### Process All Records (Full Archive)

```bash
python src/entity_extraction_batch_processor.py
```

### Custom Batch Size

```bash
# Process 25 records per batch instead of default 50
python src/entity_extraction_batch_processor.py --batch-size 25
```

## Check Progress

Progress is automatically saved to `logs/entity_extraction_progress.json`:

```bash
# View current progress
cat logs/entity_extraction_progress.json
```

Example output:
```json
{
  "last_processed_row": 52,
  "total_processed": 50,
  "entities_extracted": 423,
  "relationships_extracted": 687,
  "errors": 0,
  "last_run": "2025-10-15 14:45:30",
  "processed_record_ids": ["CJR-00001", "NATION-00023", ...]
}
```

## Resume After Interruption

If processing is interrupted, simply run the same command again - it will automatically resume from where it left off:

```bash
# This will resume from last processed row
python src/entity_extraction_batch_processor.py
```

## Reset and Start Fresh

```bash
# Clear progress and start from beginning
python src/entity_extraction_batch_processor.py --reset-progress
```

## View Results in Google Sheets

After processing, open your Google Sheet and look for two new tabs:

### 1. `extracted_entities` Sheet
Columns:
- **entity_id**: Unique identifier (P001, O012, C003, etc.)
- **entity_type**: Person, Organization, Work, Concept, Event, Location
- **entity_name**: Full name of the entity
- **role_or_description**: Role, title, or type
- **affiliation**: Associated organization
- **prominence_score**: Importance rating (1-10)
- **first_mention_record_id**: Where entity first appears
- **total_mentions**: Number of times mentioned

### 2. `extracted_relationships` Sheet
Columns:
- **relationship_id**: Unique identifier
- **source_record_id**: Document containing the relationship
- **source_entity_id**: Entity initiating the relationship
- **relationship_type**: Type (Mentions, Criticizes, Cites, etc.)
- **target_entity_id**: Entity receiving the relationship
- **context_snippet**: Supporting quote from text
- **confidence_score**: AI confidence (0-1)

## Entity Types Extracted

- **Person (P)**: Journalists, politicians, academics, media figures
- **Organization (O)**: News outlets, institutions, corporations
- **Work (W)**: Books, articles, studies, blog posts
- **Concept (C)**: Journalism theories, media criticism frameworks
- **Event (E)**: Elections, conferences, media crises
- **Location (L)**: Geographic locations relevant to journalism

## Relationship Types

1. **Mentions** - References another entity
2. **Criticizes** - Negatively evaluates
3. **Cites** - References as source
4. **Discusses** - Analyzes in depth
5. **Expands On** - Elaborates on concept/work
6. **Affiliated With** - Associated with organization
7. **Published In** - Published by organization
8. **Originated By** - Created/coined by person
9. **Occurred At** - Happened at location
10. **Supports** - Advocates for or defends

## Example Extraction

**Input Text** (from column AH):
> "Jay Rosen, a journalism professor at NYU, criticizes the Washington press corps for embracing what he calls 'The Church of the Savvy.'"

**Extracted Entities**:
- P001: Jay Rosen (Person)
- O001: New York University (Organization)
- O002: Washington press corps (Organization)
- C001: The Church of the Savvy (Concept)

**Extracted Relationships**:
- P001 → Affiliated With → O001
- P001 → Criticizes → O002
- C001 → Originated By → P001

## Rate Limits

The system automatically handles rate limiting:
- 6 seconds between each record extraction
- 30 seconds between batches
- ~10 records per minute
- ~600 records per hour

## Troubleshooting

### "No records found"
- Check that "test_runs" sheet has data in column AH (raw_text)
- Verify column headers match expected format

### "GEMINI_API_KEY not found"
- Add `GEMINI_API_KEY="your_key"` to `.env` file
- Source: https://ai.google.dev/

### "Could not connect to Google Sheets"
- Verify `google_credentials.json` exists in project root
- Check Google Cloud credentials have Sheets API enabled

### "Entity extraction failed"
- Check debug logs in `logs/entity_extraction/`
- Review raw AI responses for patterns

## Advanced Options

### Process Specific Spreadsheet
```bash
python src/entity_extraction_batch_processor.py --spreadsheet "Different Sheet Name"
```

### Debug Mode
Check logs after each run:
```bash
# View extraction logs
ls logs/entity_extraction/

# View most recent error
cat logs/entity_extraction/*error*.json | tail -1
```

## Performance Expectations

**Typical Processing Times**:
- 5 records (test): ~1 minute
- 50 records: ~5 minutes
- 500 records: ~50 minutes
- Full archive (700+ records): ~70 minutes

**API Usage**:
- Gemini API: 1 call per record
- Google Sheets: Batch writes (minimal quota)

## Next Steps

After extraction:
1. Review `extracted_entities` sheet for data quality
2. Check `extracted_relationships` sheet for relationship patterns
3. Use extracted data for:
   - Knowledge graph visualization
   - Entity-based search
   - Network analysis
   - Cross-reference studies

## Support

For detailed documentation, see `ENTITY_EXTRACTION_README.md`

For issues:
1. Check logs: `logs/entity_extraction/`
2. Check progress: `logs/entity_extraction_progress.json`
3. Review main docs: `CLAUDE.md`
