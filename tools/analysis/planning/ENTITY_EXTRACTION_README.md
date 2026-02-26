# Entity Extraction System

## Overview

The Entity Extraction System is an AI-powered module for the Jay Rosen Internet Archive that automatically identifies and extracts named entities (people, organizations, works, concepts, events, locations) and their relationships from archived content.

## Key Features

- **6 Entity Types**: Person, Organization, Work, Concept, Event, Location
- **10 Relationship Types**: Mentions, Criticizes, Cites, Discusses, Expands On, Affiliated With, Published In, Originated By, Occurred At, Supports
- **AI-Powered**: Uses Google Gemini 1.5 Flash for intelligent entity extraction
- **Batch Processing**: Processes multiple records with progress tracking and auto-resume
- **Google Sheets Integration**: Reads from `test_runs` sheet, writes to dedicated entity sheets
- **Validation & Quality Control**: Schema validation, prominence scoring, confidence scoring

## Architecture

### Core Components

1. **`src/entity_extraction_schema.json`**
   - Comprehensive schema defining entity types, relationship types, and extraction guidelines
   - Includes examples and validation rules
   - Output format specifications for Google Sheets

2. **`src/entity_extractor.py`**
   - Core extraction module using Gemini AI
   - Functions for entity/relationship extraction, normalization, and validation
   - Debug logging for troubleshooting
   - Standalone testable module

3. **`src/entity_extraction_batch_processor.py`**
   - Batch processing orchestrator
   - Reads from `test_runs` sheet (column AH: raw_text)
   - Writes to `extracted_entities` and `extracted_relationships` sheets
   - Progress tracking with JSON persistence
   - Rate limiting and error handling

## Installation & Setup

### Prerequisites

```bash
# Python 3.11+ required
# Google Cloud credentials configured
# GEMINI_API_KEY in environment variables
```

### Dependencies

All dependencies are already in `requirements.txt`:
- `google-generativeai` - Gemini AI SDK
- `gspread` - Google Sheets API
- `python-dotenv` - Environment variable management

### Configuration

Ensure `.env` file contains:
```
SPREADSHEET_NAME="Your Google Sheet Name"
GEMINI_API_KEY="your_gemini_api_key"
GOOGLE_APPLICATION_CREDENTIALS="google_credentials.json"
```

## Usage

### Test the Entity Extractor (Standalone)

Test the core extraction module with sample text:

```bash
cd src
python entity_extractor.py
```

This will run a test extraction on sample text and display results.

### Run Batch Processing

#### Test Mode (5 records only)

```bash
python src/entity_extraction_batch_processor.py --test
```

#### Process First 10 Records

```bash
python src/entity_extraction_batch_processor.py --limit 10
```

#### Process Full Batch (50 records)

```bash
python src/entity_extraction_batch_processor.py
```

#### Process with Custom Batch Size

```bash
python src/entity_extraction_batch_processor.py --batch-size 25 --limit 100
```

#### Reset Progress and Start Fresh

```bash
python src/entity_extraction_batch_processor.py --reset-progress
```

### Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--test` | Test mode: process only 5 records | False |
| `--limit N` | Maximum records to process | None (all) |
| `--batch-size N` | Records per batch | 50 |
| `--reset-progress` | Clear progress and restart | False |
| `--spreadsheet NAME` | Google Sheet name | From env |

## Data Flow

```
┌─────────────────┐
│  test_runs      │  Column AH (raw_text)
│  Google Sheet   │  + Column A (id)
└────────┬────────┘
         │
         │ Read text content
         ▼
┌─────────────────────────┐
│  entity_extractor.py    │
│  - Gemini AI analysis   │
│  - Entity detection     │
│  - Relationship mapping │
└────────┬────────────────┘
         │
         │ Extract structured data
         ▼
┌─────────────────────────────────────┐
│  entity_extraction_batch_processor  │
│  - Progress tracking                │
│  - Rate limiting                    │
│  - Batch writing                    │
└────────┬────────────────────────────┘
         │
         │ Write results
         ▼
┌──────────────────────────────────────┐
│  extracted_entities (Sheet)          │
│  - entity_id, type, name             │
│  - role, affiliation, prominence     │
│  - first_mention, total_mentions     │
└──────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  extracted_relationships (Sheet)     │
│  - relationship_id, type             │
│  - source/target entities            │
│  - context, confidence               │
└──────────────────────────────────────┘
```

## Output Sheets

### `extracted_entities` Sheet

| Column | Description | Example |
|--------|-------------|---------|
| entity_id | Unique identifier | P001, O012, C003 |
| entity_type | Type of entity | Person, Organization, Concept |
| entity_name | Full name | Jay Rosen |
| normalized_name | Standardized name | Jay Rosen |
| role_or_description | Role/title | Journalism professor |
| affiliation | Organization affiliation | New York University |
| prominence_score | Importance (1-10) | 9 |
| first_mention_record_id | First appearance | CJR-00042 |
| total_mentions | Mention count | 15 |
| related_entities | Connected entities | (populated by analysis) |
| notes | Additional notes | |

### `extracted_relationships` Sheet

| Column | Description | Example |
|--------|-------------|---------|
| relationship_id | Unique identifier | CJR-00042_REL_001 |
| source_record_id | Source document | CJR-00042 |
| source_entity_id | Entity initiating | P001 |
| source_entity_name | Entity name | Jay Rosen |
| relationship_type | Type of relationship | Criticizes |
| target_entity_id | Entity receiving | O015 |
| target_entity_name | Target name | Washington press corps |
| context_snippet | Supporting text | "criticizes the press corps for..." |
| confidence_score | AI confidence (0-1) | 0.95 |
| extracted_date | Extraction date | 2025-10-15 |

## Entity Types

### Person (Prefix: P)
Individual journalists, politicians, media figures, academics
- **Attributes**: role, affiliation, prominence_score
- **Examples**: Jay Rosen, Margaret Sullivan, Brian Stelter

### Organization (Prefix: O)
Media outlets, institutions, corporations, government bodies
- **Attributes**: org_type, industry, prominence_score
- **Examples**: The New York Times, CNN, New York University

### Work (Prefix: W)
Published works, articles, books, reports, studies
- **Attributes**: work_type, author, publication_year, prominence_score
- **Examples**: "Why Political Coverage Is Broken", "The Elements of Journalism"

### Concept (Prefix: C)
Journalism theories, media criticism frameworks
- **Attributes**: originator, related_concepts, prominence_score
- **Examples**: "View from Nowhere", "Church of the Savvy", "Citizens' Agenda"

### Event (Prefix: E)
Significant events, conferences, elections, media crises
- **Attributes**: event_date, location, significance, prominence_score
- **Examples**: 2016 Presidential Election, Iraq War Coverage

### Location (Prefix: L)
Geographic locations relevant to media/journalism
- **Attributes**: location_type, relevance, prominence_score
- **Examples**: Washington D.C., New York City

## Relationship Types

1. **Mentions** - Entity A mentions entity B
2. **Criticizes** - Entity A criticizes entity B
3. **Cites** - Entity A cites entity B as source
4. **Discusses** - Entity A discusses concept/event B
5. **Expands On** - Entity A elaborates on concept/work B
6. **Affiliated With** - Person A affiliated with organization B
7. **Published In** - Work A published in organization B
8. **Originated By** - Concept A originated by person B
9. **Occurred At** - Event A occurred at location B
10. **Supports** - Entity A supports entity B

## Progress Tracking

The system automatically saves progress to `logs/entity_extraction_progress.json`:

```json
{
  "last_processed_row": 150,
  "total_processed": 148,
  "entities_extracted": 892,
  "relationships_extracted": 1456,
  "errors": 2,
  "last_run": "2025-10-15 14:32:10",
  "processed_record_ids": ["CJR-00001", "NATION-00023", ...]
}
```

**Auto-Resume**: If processing is interrupted, simply run the command again and it will resume from the last successful record.

## Rate Limiting

To respect API quotas and avoid overwhelming services:

- **Between extractions**: 6 seconds (10 per minute)
- **Between batches**: 30 seconds
- **Sheets API batching**: 100 rows per write, 2 second delay

## Error Handling

### Debug Logs

All extraction attempts are logged to `logs/entity_extraction/`:
- Validation failures
- JSON parse errors
- API exceptions
- Records with no entities found

### Common Issues

**Issue**: "GEMINI_API_KEY not found"
**Solution**: Ensure `.env` file has `GEMINI_API_KEY="your_key"`

**Issue**: "Could not connect to Google Sheets"
**Solution**: Verify `google_credentials.json` exists and has proper permissions

**Issue**: "No valid entities extracted"
**Solution**: Check debug logs in `logs/entity_extraction/` for AI response details

**Issue**: Sheet "extracted_entities" not found
**Solution**: Processor auto-creates sheets with proper headers on first run

## Quality Control

### Validation Rules

- Entity must have: `entity_id`, `entity_type`, `entity_name`
- Entity type must match schema definitions
- Relationship must have: `relationship_type`, `source_entity_id`, `target_entity_id`
- Relationship type must match schema definitions

### Scoring Systems

**Prominence Score (1-10)**:
- 10: Highly central to the text
- 7-9: Substantively discussed
- 4-6: Mentioned multiple times
- 1-3: Brief mention

**Confidence Score (0-1)**:
- 1.0: Explicitly stated relationship
- 0.7-0.9: Clearly implied
- 0.5-0.6: Moderately implied
- < 0.5: Weak evidence

## Examples

### Sample Extraction Output

**Input Text**:
"Jay Rosen, a journalism professor at NYU, criticizes the Washington press corps for embracing what he calls 'The Church of the Savvy.'"

**Extracted Entities**:
- P001: Jay Rosen (Person, Journalism professor, NYU, prominence: 10)
- O001: New York University (Organization, Academic Institution, prominence: 5)
- O002: Washington press corps (Organization, Media Group, prominence: 7)
- C001: The Church of the Savvy (Concept, originated by Jay Rosen, prominence: 9)

**Extracted Relationships**:
- P001 → Affiliated With → O001 (confidence: 1.0)
- P001 → Criticizes → O002 (confidence: 1.0)
- C001 → Originated By → P001 (confidence: 1.0)

## Performance

**Typical Processing Speed**:
- ~10 records per minute (with rate limiting)
- ~600 records per hour
- Full archive (700+ records): ~1.5 hours

**Resource Usage**:
- Gemini API: ~1 call per record
- Google Sheets API: Batch writes (minimal quota usage)

## Integration with Existing Systems

The entity extraction system integrates seamlessly with:

1. **Main Pipeline** (`workflow.py`) - Can be added as post-processing step
2. **Data Quality Tools** - Enhances entity tracking in `data_deduper.py`
3. **Cross-Reference Analyzer** - Provides structured entity data for relationship mapping
4. **Frontend** - Entities/relationships available for visualization and search

## Future Enhancements

Potential improvements for future development:

1. **Entity Disambiguation**: Resolve duplicate entities (e.g., "NYT" vs "New York Times")
2. **Cross-Record Analysis**: Track entity mentions across entire archive
3. **Relationship Strength**: Calculate relationship importance across multiple records
4. **Entity Clustering**: Group related entities for knowledge graph construction
5. **Temporal Analysis**: Track how entity relationships evolve over time
6. **Interactive Curation**: UI for reviewing and refining extractions

## Support

For issues or questions:
1. Check debug logs in `logs/entity_extraction/`
2. Review progress file: `logs/entity_extraction_progress.json`
3. Test standalone extractor: `python src/entity_extractor.py`
4. Consult main project documentation in `CLAUDE.md`

## License

This module is part of the Jay Rosen Internet Archive project.
