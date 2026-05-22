# -*- coding: utf-8 -*-
"""
Tumblr Archive Processor
Parses Tumblr export files and converts to archive schema.

Tumblr exports typically contain:
- posts/ directory with HTML files for each post
- media/ directory with images, videos, audio
- JSON metadata files (posts.json or similar)

This processor handles all post types:
- Text posts → Standard article processing
- Quote posts → Extract as pull_quotes
- Link posts → Curated links with metadata
- Photo posts → Image descriptions
- Video posts → Flag for transcription
- Audio posts → Flag for transcription
"""

import re
import json
import html
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional
from bs4 import BeautifulSoup


class TumblrProcessor:
    """Process Tumblr archive exports."""

    # Supported post types
    POST_TYPES = ['text', 'quote', 'link', 'photo', 'video', 'audio', 'answer', 'chat']

    def __init__(self, export_dir: str):
        """
        Initialize Tumblr processor.

        Args:
            export_dir: Path to Tumblr export directory
        """
        self.export_dir = Path(export_dir)
        self.posts_dir = self.export_dir / 'posts'
        self.media_dir = self.export_dir / 'media'
        self.processed_count = 0
        self.error_count = 0

    def validate_export(self) -> Dict:
        """
        Validate the Tumblr export structure.

        Returns:
            Dict with validation results
        """
        results = {
            'valid': False,
            'export_dir_exists': self.export_dir.exists(),
            'posts_found': 0,
            'media_found': 0,
            'json_metadata': None,
            'errors': []
        }

        if not results['export_dir_exists']:
            results['errors'].append(f'Export directory not found: {self.export_dir}')
            return results

        # Check for posts directory or JSON file
        if self.posts_dir.exists():
            html_files = list(self.posts_dir.glob('*.html'))
            results['posts_found'] = len(html_files)

        # Check for JSON metadata
        json_files = list(self.export_dir.glob('*.json'))
        if json_files:
            results['json_metadata'] = str(json_files[0])

        # Check for media
        if self.media_dir.exists():
            media_files = list(self.media_dir.glob('*'))
            results['media_found'] = len(media_files)

        # Validate we have something to process
        if results['posts_found'] > 0 or results['json_metadata']:
            results['valid'] = True
        else:
            results['errors'].append('No posts found (no HTML files in posts/ or JSON metadata)')

        return results

    def process_export(self, start_id: int = 1) -> List[Dict]:
        """
        Process all posts in the Tumblr export.

        Args:
            start_id: Starting ID number for TUMBLR-XXXXX format

        Returns:
            List of processed post records
        """
        print(f"[TUMBLR] Processing export from: {self.export_dir}")

        # Validate first
        validation = self.validate_export()
        if not validation['valid']:
            print(f"[TUMBLR] Export validation failed: {validation['errors']}")
            return []

        records = []
        current_id = start_id

        # Strategy 1: Process from JSON metadata (preferred)
        json_path = validation.get('json_metadata')
        if json_path:
            print(f"[TUMBLR] Processing from JSON metadata: {json_path}")
            records = self._process_json_export(json_path, current_id)

        # Strategy 2: Process HTML files directly
        elif validation['posts_found'] > 0:
            print(f"[TUMBLR] Processing {validation['posts_found']} HTML files")
            records = self._process_html_posts(current_id)

        print(f"[TUMBLR] Processed {len(records)} posts ({self.error_count} errors)")
        return records

    def _process_json_export(self, json_path: str, start_id: int) -> List[Dict]:
        """
        Process Tumblr export from JSON metadata file.

        Args:
            json_path: Path to JSON file
            start_id: Starting ID number

        Returns:
            List of processed records
        """
        records = []
        current_id = start_id

        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception as e:
            print(f"[TUMBLR] Error reading JSON: {e}")
            return records

        # Handle different JSON structures
        posts = []
        if isinstance(data, list):
            posts = data
        elif isinstance(data, dict):
            # Common structures: data['posts'], data['tumblr'], etc.
            posts = data.get('posts', data.get('tumblr', []))
            if isinstance(posts, dict):
                posts = posts.get('posts', [])

        print(f"[TUMBLR] Found {len(posts)} posts in JSON")

        for post in posts:
            try:
                record = self._process_post(post, current_id)
                if record:
                    records.append(record)
                    current_id += 1
                    self.processed_count += 1
            except Exception as e:
                print(f"[TUMBLR] Error processing post: {e}")
                self.error_count += 1

        return records

    def _process_html_posts(self, start_id: int) -> List[Dict]:
        """
        Process Tumblr posts from HTML files.

        Args:
            start_id: Starting ID number

        Returns:
            List of processed records
        """
        records = []
        current_id = start_id

        html_files = sorted(self.posts_dir.glob('*.html'))

        for html_file in html_files:
            try:
                with open(html_file, 'r', encoding='utf-8') as f:
                    content = f.read()

                record = self._process_html_post(content, html_file.name, current_id)
                if record:
                    records.append(record)
                    current_id += 1
                    self.processed_count += 1
            except Exception as e:
                print(f"[TUMBLR] Error processing {html_file.name}: {e}")
                self.error_count += 1

        return records

    def _process_post(self, post: Dict, post_id: int) -> Optional[Dict]:
        """
        Process a single Tumblr post from JSON data.

        Args:
            post: Post data dict
            post_id: ID number for this post

        Returns:
            Processed record dict or None
        """
        post_type = post.get('type', 'text')

        # Generate archive ID
        archive_id = f"TUMBLR-{post_id:05d}"

        # Extract common fields
        record = {
            'id': archive_id,
            'url': post.get('post_url', post.get('permalink', '')),
            'title': self._extract_title(post),
            'author': 'Jay Rosen',
            'publication_date': self._parse_date(post.get('date', post.get('timestamp', ''))),
            'original_publication': 'Tumblr',
            'publisher': 'jayrosen_nyu.tumblr.com',
            'platform': 'tumblr',
            'content_type': self._map_content_type(post_type),
            'format': 'text',
            'raw_text': '',
            'excerpt': '',
            'summary': '',
            'tags': ', '.join(post.get('tags', [])),
            'responds_to': self._extract_reblog_source(post),
            'notes': f"Tumblr {post_type} post"
        }

        # Process by post type
        if post_type == 'text':
            record = self._process_text_post(post, record)
        elif post_type == 'quote':
            record = self._process_quote_post(post, record)
        elif post_type == 'link':
            record = self._process_link_post(post, record)
        elif post_type == 'photo':
            record = self._process_photo_post(post, record)
        elif post_type == 'video':
            record = self._process_video_post(post, record)
        elif post_type == 'audio':
            record = self._process_audio_post(post, record)
        elif post_type == 'answer':
            record = self._process_answer_post(post, record)
        elif post_type == 'chat':
            record = self._process_chat_post(post, record)
        else:
            # Unknown type - extract what we can
            record['raw_text'] = self._extract_text_content(post)

        # Skip empty posts
        if not record.get('raw_text') and not record.get('title'):
            return None

        # Generate excerpt if not set
        if not record.get('excerpt') and record.get('raw_text'):
            record['excerpt'] = self._generate_excerpt(record['raw_text'])

        return record

    def _process_text_post(self, post: Dict, record: Dict) -> Dict:
        """Process a text post."""
        body = post.get('body', '')
        record['raw_text'] = self._clean_html(body)

        # Title might be in body as first heading
        if not record['title']:
            record['title'] = self._extract_title_from_body(body)

        return record

    def _process_quote_post(self, post: Dict, record: Dict) -> Dict:
        """Process a quote post."""
        quote_text = post.get('text', '')
        source = post.get('source', '')

        record['content_type'] = 'Quote'
        record['raw_text'] = f'"{self._clean_html(quote_text)}"\n\n— {self._clean_html(source)}'
        record['pull_quote'] = self._clean_html(quote_text)
        record['title'] = f"Quote: {self._truncate(quote_text, 50)}"

        return record

    def _process_link_post(self, post: Dict, record: Dict) -> Dict:
        """Process a link post."""
        link_url = post.get('url', '')
        link_title = post.get('title', '')
        description = post.get('description', '')

        record['content_type'] = 'Link'
        record['title'] = link_title or f"Link: {link_url}"
        record['raw_text'] = f"{link_title}\n\n{link_url}\n\n{self._clean_html(description)}"
        record['related_to'] = link_url

        return record

    def _process_photo_post(self, post: Dict, record: Dict) -> Dict:
        """Process a photo post."""
        caption = post.get('caption', '')
        photos = post.get('photos', [])

        record['content_type'] = 'Photo'
        record['format'] = 'image'
        record['raw_text'] = self._clean_html(caption)
        record['title'] = self._extract_title_from_body(caption) or f"Photo post ({len(photos)} images)"
        record['notes'] = f"Photo post with {len(photos)} images - needs image description"

        # Extract photo URLs for reference
        if photos:
            photo_urls = [p.get('original_size', {}).get('url', '') for p in photos if p.get('original_size')]
            if photo_urls:
                record['notes'] += f"\nMedia URLs: {', '.join(photo_urls[:3])}"

        return record

    def _process_video_post(self, post: Dict, record: Dict) -> Dict:
        """Process a video post."""
        caption = post.get('caption', '')
        video_url = post.get('video_url', '')

        record['content_type'] = 'Video'
        record['format'] = 'video'
        record['raw_text'] = self._clean_html(caption)
        record['title'] = self._extract_title_from_body(caption) or "Video post"
        record['notes'] = f"Video post - needs transcription. Video URL: {video_url}"

        return record

    def _process_audio_post(self, post: Dict, record: Dict) -> Dict:
        """Process an audio post."""
        caption = post.get('caption', '')
        audio_url = post.get('audio_url', '')

        record['content_type'] = 'Audio'
        record['format'] = 'audio'
        record['raw_text'] = self._clean_html(caption)
        record['title'] = self._extract_title_from_body(caption) or "Audio post"
        record['notes'] = f"Audio post - needs transcription. Audio URL: {audio_url}"

        return record

    def _process_answer_post(self, post: Dict, record: Dict) -> Dict:
        """Process an answer (ask) post."""
        question = post.get('question', '')
        answer = post.get('answer', '')
        asking_name = post.get('asking_name', 'Anonymous')

        record['content_type'] = 'Q&A'
        record['raw_text'] = f"Q ({asking_name}): {question}\n\nA: {self._clean_html(answer)}"
        record['title'] = f"Q&A: {self._truncate(question, 50)}"

        return record

    def _process_chat_post(self, post: Dict, record: Dict) -> Dict:
        """Process a chat post."""
        dialogue = post.get('dialogue', [])

        chat_text = []
        for line in dialogue:
            name = line.get('name', '')
            phrase = line.get('phrase', '')
            chat_text.append(f"{name}: {phrase}")

        record['content_type'] = 'Chat'
        record['raw_text'] = '\n'.join(chat_text)
        record['title'] = f"Chat: {self._truncate(chat_text[0] if chat_text else '', 50)}"

        return record

    def _process_html_post(self, content: str, filename: str, post_id: int) -> Optional[Dict]:
        """
        Process a single HTML post file.

        Args:
            content: HTML content
            filename: Original filename
            post_id: ID number for this post

        Returns:
            Processed record dict or None
        """
        soup = BeautifulSoup(content, 'html.parser')

        # Extract post body
        body = soup.find('div', class_='post-body')
        if not body:
            body = soup.find('article')
        if not body:
            body = soup.body or soup

        # Generate archive ID
        archive_id = f"TUMBLR-{post_id:05d}"

        # Extract date from filename or content
        date_match = re.search(r'(\d{4})-(\d{2})-(\d{2})', filename)
        pub_date = f"{date_match.group(2)}/{date_match.group(3)}/{date_match.group(1)}" if date_match else ''

        record = {
            'id': archive_id,
            'url': '',  # May be in HTML metadata
            'title': self._extract_html_title(soup),
            'author': 'Jay Rosen',
            'publication_date': pub_date,
            'original_publication': 'Tumblr',
            'publisher': 'jayrosen_nyu.tumblr.com',
            'platform': 'tumblr',
            'content_type': 'Article',
            'format': 'text',
            'raw_text': self._clean_html(str(body)),
            'notes': f"Processed from HTML file: {filename}"
        }

        # Extract URL from meta tags or links
        canonical = soup.find('link', rel='canonical')
        if canonical:
            record['url'] = canonical.get('href', '')

        # Extract tags
        tags_meta = soup.find('meta', {'name': 'keywords'})
        if tags_meta:
            record['tags'] = tags_meta.get('content', '')

        # Generate excerpt
        record['excerpt'] = self._generate_excerpt(record['raw_text'])

        return record if record['raw_text'] else None

    # === Utility Methods ===

    def _extract_title(self, post: Dict) -> str:
        """Extract title from post, generating one if needed."""
        # Some post types have explicit titles
        title = post.get('title', '')
        if title:
            return self._clean_html(title)

        # Generate from slug or first line
        slug = post.get('slug', '')
        if slug:
            return slug.replace('-', ' ').title()

        return ''

    def _extract_title_from_body(self, body: str) -> str:
        """Extract title from HTML body (first heading or strong text)."""
        soup = BeautifulSoup(body, 'html.parser')

        # Try headings first
        for tag in ['h1', 'h2', 'h3', 'strong', 'b']:
            element = soup.find(tag)
            if element:
                text = element.get_text().strip()
                if len(text) > 5 and len(text) < 200:
                    return text

        return ''

    def _extract_html_title(self, soup: BeautifulSoup) -> str:
        """Extract title from HTML document."""
        title_tag = soup.find('title')
        if title_tag:
            title = title_tag.get_text().strip()
            # Remove common suffixes
            title = re.sub(r'\s*[-|]\s*(Tumblr|jayrosen_nyu).*$', '', title, flags=re.I)
            return title
        return ''

    def _extract_text_content(self, post: Dict) -> str:
        """Extract text from any available field."""
        for field in ['body', 'text', 'caption', 'description', 'answer']:
            if field in post and post[field]:
                return self._clean_html(post[field])
        return ''

    def _extract_reblog_source(self, post: Dict) -> str:
        """Extract reblog source if this is a reblog."""
        reblog = post.get('reblogged_from_name', '') or post.get('source_title', '')
        if reblog:
            reblog_url = post.get('reblogged_from_url', '') or post.get('source_url', '')
            return f"{reblog}: {reblog_url}" if reblog_url else reblog
        return ''

    def _parse_date(self, date_str: str) -> str:
        """
        Parse Tumblr date to MM/DD/YYYY format.

        Tumblr dates can be:
        - Unix timestamp (integer)
        - ISO format: 2015-03-24 12:34:56 GMT
        - Human readable: March 24, 2015
        """
        if not date_str:
            return ''

        # Handle Unix timestamp
        if isinstance(date_str, (int, float)):
            dt = datetime.fromtimestamp(date_str)
            return dt.strftime('%m/%d/%Y')

        # Handle ISO format
        iso_match = re.match(r'(\d{4})-(\d{2})-(\d{2})', str(date_str))
        if iso_match:
            return f"{iso_match.group(2)}/{iso_match.group(3)}/{iso_match.group(1)}"

        # Handle timestamp string
        try:
            timestamp = int(date_str)
            dt = datetime.fromtimestamp(timestamp)
            return dt.strftime('%m/%d/%Y')
        except (ValueError, TypeError):
            pass

        # Return as-is if we can't parse
        return str(date_str)[:10]

    def _map_content_type(self, tumblr_type: str) -> str:
        """Map Tumblr post type to archive content type."""
        mapping = {
            'text': 'Article',
            'quote': 'Quote',
            'link': 'Link',
            'photo': 'Photo',
            'video': 'Video',
            'audio': 'Audio',
            'answer': 'Q&A',
            'chat': 'Chat'
        }
        return mapping.get(tumblr_type, 'Article')

    def _clean_html(self, html_content: str) -> str:
        """Strip HTML tags and clean text."""
        if not html_content:
            return ''

        soup = BeautifulSoup(html_content, 'html.parser')

        # Remove script and style elements
        for element in soup(['script', 'style']):
            element.decompose()

        # Get text with newlines preserved for block elements
        text = soup.get_text(separator='\n')

        # Clean up whitespace
        lines = [line.strip() for line in text.split('\n')]
        text = '\n'.join(line for line in lines if line)

        # Decode HTML entities
        text = html.unescape(text)

        return text.strip()

    def _generate_excerpt(self, text: str, length: int = 300) -> str:
        """Generate excerpt from text."""
        if not text:
            return ''

        # Get first paragraph or sentence
        paragraphs = text.split('\n\n')
        excerpt = paragraphs[0] if paragraphs else text

        if len(excerpt) > length:
            excerpt = excerpt[:length].rsplit(' ', 1)[0] + '...'

        return excerpt

    def _truncate(self, text: str, length: int = 50) -> str:
        """Truncate text to specified length."""
        text = self._clean_html(text)
        if len(text) > length:
            return text[:length].rsplit(' ', 1)[0] + '...'
        return text


def main():
    """
    CLI entry point for Tumblr processing.

    Usage:
        python tumblr_processor.py /path/to/tumblr/export
        python tumblr_processor.py /path/to/tumblr/export --output records.json
    """
    import argparse

    parser = argparse.ArgumentParser(description='Process Tumblr archive export')
    parser.add_argument('export_dir', help='Path to Tumblr export directory')
    parser.add_argument('--output', '-o', help='Output JSON file path')
    parser.add_argument('--start-id', type=int, default=1, help='Starting ID number')
    parser.add_argument('--validate-only', action='store_true', help='Only validate export structure')

    args = parser.parse_args()

    processor = TumblrProcessor(args.export_dir)

    if args.validate_only:
        validation = processor.validate_export()
        print(json.dumps(validation, indent=2))
        return

    records = processor.process_export(start_id=args.start_id)

    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(records, f, indent=2, ensure_ascii=False)
        print(f"[TUMBLR] Wrote {len(records)} records to {args.output}")
    else:
        # Print summary
        print("\n[TUMBLR] Processing complete:")
        print(f"  Total records: {len(records)}")
        print(f"  Content types: {set(r['content_type'] for r in records)}")

        # Show sample record
        if records:
            print("\n  Sample record:")
            sample = records[0]
            for key in ['id', 'title', 'publication_date', 'content_type', 'url']:
                print(f"    {key}: {sample.get(key, '')}")


if __name__ == "__main__":
    main()
