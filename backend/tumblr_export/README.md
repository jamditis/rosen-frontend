# Tumblr Export Directory

Place your Tumblr export files here.

## How to Get Your Tumblr Export

1. Log into your Tumblr account
2. Go to Settings (gear icon)
3. Scroll down to "Export"
4. Click "Export [blog name]"
5. Wait for email notification (can take a few hours)
6. Download the ZIP file
7. Unzip contents into this directory

## Expected Structure

After unzipping, you should have:
```
tumblr_export/
├── posts/           # HTML files for each post
│   ├── 12345678.html
│   ├── 12345679.html
│   └── ...
├── media/           # Images, videos, audio
│   ├── image1.jpg
│   └── ...
├── posts.json       # Post metadata (optional, newer exports)
└── README.md        # This file
```

## Processing

Once files are in place, run:
```bash
cd backend
python -m rosen_scraper.processors.tumblr_processor --input ./tumblr_export --output ../data/tumblr_records.csv
```

## Notes

- The processor handles all post types: text, quote, link, photo, video, audio, answer, chat
- Media files are referenced but not uploaded to the archive
- Each post gets a TUMBLR-XXXXX ID
