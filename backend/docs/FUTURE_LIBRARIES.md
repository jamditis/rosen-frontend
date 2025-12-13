# Future Libraries Documentation

This document describes libraries installed for future use in the Jay Rosen Digital Archive project.

---

## webargs

**Status:** Installed, not yet integrated
**Version:** 8.7.1
**Purpose:** Request parsing and validation for web APIs

### What It Does

`webargs` is a Python library for parsing and validating HTTP request arguments. It provides a declarative way to specify what parameters your API expects and automatically validates incoming requests.

### When to Use It

Consider using `webargs` when you:
- Build a REST API to replace static JSON data serving
- Need to validate query parameters, JSON bodies, or form data
- Want automatic error messages for invalid requests
- Need to parse complex nested data structures

### Use Cases for This Project

#### 1. Dynamic Archive API

Instead of serving static `archive-data.json`, create a Flask/FastAPI endpoint:

```python
from flask import Flask, jsonify
from webargs import fields
from webargs.flaskparser import use_args
import pandas as pd

app = Flask(__name__)

# Define expected query parameters
search_args = {
    'category': fields.Str(required=False),
    'year': fields.Int(required=False, validate=lambda x: 1986 <= x <= 2025),
    'concepts': fields.List(fields.Str(), required=False),
    'author': fields.Str(required=False),
    'limit': fields.Int(missing=50, validate=lambda x: 1 <= x <= 500),
    'offset': fields.Int(missing=0, validate=lambda x: x >= 0),
}

@app.route('/api/search')
@use_args(search_args, location="query")
def search_archive(args):
    """
    Search archive records with validated parameters.

    Example: /api/search?category=Politics&year=2020&limit=10
    """
    df = pd.read_csv('/path/to/archive_records-public.csv')

    # Filter by category
    if args.get('category'):
        df = df[df['thematic_categories'].str.contains(args['category'], na=False)]

    # Filter by year
    if args.get('year'):
        df = df[df['publication_date'].str.startswith(str(args['year']))]

    # Filter by concepts
    if args.get('concepts'):
        for concept in args['concepts']:
            df = df[df['key_concepts'].str.contains(concept, na=False)]

    # Apply limit and offset
    df = df[args['offset']:args['offset'] + args['limit']]

    return jsonify({
        'total': len(df),
        'results': df.to_dict('records')
    })
```

**Benefits:**
- Automatic validation (returns 400 error if invalid)
- Type conversion (string "2020" → int 2020)
- Default values
- Clean, declarative syntax

#### 2. Entity Extraction API

Create an API for on-demand entity extraction:

```python
from webargs import fields
from webargs.flaskparser import use_args

extraction_args = {
    'text': fields.Str(required=True, validate=lambda x: len(x) > 0),
    'model': fields.Str(missing='gemini-flash', validate=lambda x: x in ['gemini-flash', 'gemini-pro']),
    'max_entities': fields.Int(missing=50, validate=lambda x: 1 <= x <= 200),
}

@app.route('/api/extract-entities', methods=['POST'])
@use_args(extraction_args, location="json")
def extract_entities(args):
    """
    Extract entities from provided text.

    POST /api/extract-entities
    {
        "text": "Jay Rosen wrote about public journalism...",
        "model": "gemini-flash",
        "max_entities": 20
    }
    """
    # Call your entity extraction logic
    entities = your_extraction_function(args['text'], args['model'])

    return jsonify({
        'entities': entities[:args['max_entities']]
    })
```

#### 3. Summary Generation API

```python
summary_args = {
    'record_id': fields.Str(required=True),
    'algorithm': fields.Str(missing='lsa', validate=lambda x: x in ['lsa', 'lexrank', 'textrank']),
    'sentences': fields.Int(missing=3, validate=lambda x: 1 <= x <= 10),
}

@app.route('/api/generate-summary', methods=['POST'])
@use_args(summary_args, location="json")
def generate_summary(args):
    """
    Generate summary for a specific record.

    POST /api/generate-summary
    {
        "record_id": "RECORD-00001",
        "algorithm": "lsa",
        "sentences": 3
    }
    """
    # Use your sumy script
    summary = generate_summary_with_sumy(
        record_id=args['record_id'],
        algorithm=args['algorithm'],
        sentences=args['sentences']
    )

    return jsonify({'summary': summary})
```

### Integration Steps

1. **Choose a framework:** Flask (simple) or FastAPI (modern, async)
2. **Install dependencies:**
   ```bash
   poetry add flask  # or: poetry add fastapi uvicorn
   ```
3. **Create API endpoints** in `backend/src/api/`
4. **Update frontend** to use API instead of static JSON
5. **Deploy** using Gunicorn/Uvicorn

### Resources

- Documentation: https://webargs.readthedocs.io/
- Flask example: https://webargs.readthedocs.io/en/latest/framework_support.html#flask
- FastAPI example: https://webargs.readthedocs.io/en/latest/framework_support.html#fastapi

---

## thumbor

**Status:** Installed, not yet integrated
**Version:** 7.7.7
**Purpose:** Image processing service with smart cropping and filters

### What It Does

`thumbor` is a smart imaging service that can:
- Resize, crop, and filter images on-demand
- Detect faces and smart-crop around them
- Apply filters (blur, sharpen, brightness, etc.)
- Generate thumbnails at various sizes
- Serve images via HTTP with URL-based parameters

It's designed to run as a separate service that processes images on-the-fly.

### When to Use It

Consider using `thumbor` when you:
- Need to generate multiple image sizes (thumbnails, cards, full-size)
- Want to crop images intelligently (focusing on faces or important areas)
- Need to apply filters or watermarks to images
- Have a large image library that needs optimization

### Use Cases for This Project

#### 1. Social Media Share Images

Generate optimized share images for archive records:

```python
# Original: dissertation reader's share quote feature
# Currently generates 1200x630 PNG on client side

# With thumbor: Generate on server with better quality
thumbor_url = "http://localhost:8888/unsafe/1200x630/filters:format(jpeg):quality(85)/path/to/quote-image.png"
```

**Benefits:**
- Server-side rendering (faster, better fonts)
- Consistent quality across devices
- Can add watermarks or logos automatically

#### 2. Archive Item Thumbnails

If you add images/screenshots to archive records:

```python
# Example: Add featured images for articles
# Thumbor generates sizes automatically

# Card view (300x200)
thumb_url = f"http://thumbor/unsafe/300x200/smart/{image_url}"

# Modal view (800x600)
modal_url = f"http://thumbor/unsafe/800x600/smart/{image_url}"

# Full size (1920x1080)
full_url = f"http://thumbor/unsafe/1920x1080/{image_url}"
```

The `smart` parameter uses face/feature detection for intelligent cropping.

#### 3. Jay Rosen Photo Archive

If you archive Jay's photos/headshots:

```python
# Generate consistent-sized thumbnails
from libthumbor import CryptoURL

crypto = CryptoURL(key='my-secret-key')

# Generate square thumbnail (200x200)
thumb = crypto.generate(
    width=200,
    height=200,
    smart=True,  # Smart crop around face
    image_url='photos/jay-rosen-2020.jpg'
)

# Generate filtered version (grayscale for print)
filtered = crypto.generate(
    width=800,
    height=600,
    filters=['grayscale()'],
    image_url='photos/jay-rosen-2020.jpg'
)
```

#### 4. Dissertation Page Previews

Generate thumbnail previews of dissertation PDF pages:

```python
# Convert PDF pages to thumbnails
# (Requires thumbor with PDF support)

page_thumb = f"http://thumbor/unsafe/400x600/filters:format(jpeg)/dissertation/page-{page_num}.pdf"
```

### Setup Guide

1. **Configure thumbor:**
   ```bash
   # Create config file
   poetry run thumbor-config > thumbor.conf

   # Edit thumbor.conf:
   # - Set SECURITY_KEY
   # - Configure storage (file system or S3)
   # - Enable/disable features
   ```

2. **Run thumbor service:**
   ```bash
   # Development
   poetry run thumbor --conf thumbor.conf

   # Production (with multiple processes)
   poetry run thumbor --conf thumbor.conf --processes 4
   ```

3. **Generate URLs:**
   ```python
   from libthumbor import CryptoURL

   crypto = CryptoURL(key='your-security-key')

   url = crypto.generate(
       width=300,
       height=200,
       smart=True,
       image_url='http://example.com/image.jpg'
   )
   ```

4. **Integrate with frontend:**
   ```javascript
   // In React component
   const getThumborUrl = (imageUrl, width, height) => {
     const thumborBase = 'https://your-thumbor.com'
     return `${thumborBase}/unsafe/${width}x${height}/smart/${imageUrl}`
   }

   // Use in component
   <img src={getThumborUrl(record.image, 300, 200)} alt={record.title} />
   ```

### Advanced Features

#### Filters

Apply multiple filters via URL:

```python
# Brightness, contrast, saturation
filters:brightness(10):contrast(20):saturation(30)

# Blur and sharpen
filters:blur(5):sharpen(2,1.0,true)

# Watermark
filters:watermark(logo.png,0,0,50)

# Multiple filters combined
filters:grayscale():blur(2):brightness(10)
```

#### Smart Cropping

Thumbor can detect important areas:

```python
# Face detection
/unsafe/300x300/smart/photo.jpg

# Feature detection (contrast-based)
/unsafe/300x300/smart/photo.jpg

# Manual focal point
/unsafe/300x300/200x100:400x300/photo.jpg
```

#### Storage Backends

- **File system:** Store processed images locally
- **S3:** Store in AWS S3
- **Redis:** Cache processed images in memory

### Performance Considerations

- **Caching:** Thumbor caches processed images (configure TTL)
- **CDN:** Put thumbor behind CloudFlare/Fastly for global distribution
- **Async:** Use nginx/varnish in front of thumbor for async processing
- **Result storage:** Store processed images to avoid re-processing

### Resources

- Documentation: https://thumbor.readthedocs.io/
- GitHub: https://github.com/thumbor/thumbor
- Filter reference: https://thumbor.readthedocs.io/en/latest/filters.html
- libthumbor (URL generation): https://github.com/thumbor/libthumbor

---

## Future Architecture Considerations

### If Building an API

Current architecture:
```
Frontend (Static) → Static JSON files → Data
```

Future API architecture:
```
Frontend → Flask/FastAPI → Database/CSV → Processed Data
         ↓
      Thumbor → Processed Images
```

**Benefits:**
- Dynamic queries (filter, search, paginate)
- Real-time entity extraction
- Image optimization
- Better security (API keys, rate limiting)

**Tradeoffs:**
- More complex deployment (not just FTP)
- Requires server infrastructure
- Higher hosting costs

### Deployment Options

1. **Hybrid:** Keep static frontend, add optional API for advanced features
2. **Full API:** Migrate to SPA with API backend
3. **Serverless:** Use AWS Lambda + API Gateway + S3

### Next Steps When Ready

1. Evaluate whether WordPress subdirectory deployment still meets needs
2. If API needed, start with Flask + webargs for search endpoint
3. If images needed, deploy thumbor as separate Docker container
4. Update frontend incrementally to use new APIs

---

## Installation Record

These libraries were installed on **December 13, 2025** via:

```bash
cd backend
poetry add desbordante sumy webargs thumbor pandas
```

**Dependencies added:**
- `desbordante==2.4.1` - Data profiling and functional dependency discovery
- `sumy==0.11.0` - Automatic text summarization
- `webargs==8.7.1` - Request parsing and validation
- `thumbor==7.7.7` - Image processing service
- `pandas==2.3.3` - Data analysis (for scripts)

**Total new dependencies:** 100+ (including transitive dependencies)

---

## Related Scripts

### Using desbordante

```bash
# Analyze archive data quality
poetry run python scripts/analyze_archive_patterns.py
```

### Using sumy

```bash
# Dry run (preview only)
poetry run python scripts/backfill_summaries_sumy.py --dry-run --limit 5

# Generate summaries for records with missing/short summaries
poetry run python scripts/backfill_summaries_sumy.py

# Use different algorithm
poetry run python scripts/backfill_summaries_sumy.py --algorithm lexrank

# Adjust summary length
poetry run python scripts/backfill_summaries_sumy.py --sentences 5
```

### Using webargs (example)

```bash
# Create Flask app
poetry run flask --app backend/src/api/app.py run
```

### Using thumbor (example)

```bash
# Generate config
poetry run thumbor-config > thumbor.conf

# Run service
poetry run thumbor --conf thumbor.conf --port 8888
```

---

## Questions?

If you have questions about integrating these libraries, refer to:
- This document for use cases and examples
- Official documentation (links provided above)
- CLAUDE.md for overall project architecture
- backend/scripts/ for working examples
