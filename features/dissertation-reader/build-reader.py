#!/usr/bin/env python3
"""
Build script for dissertation reader.
Converts markdown to HTML and creates the final dist/index.html.
"""

import re
import os

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MD_SOURCE = os.path.join(SCRIPT_DIR, '../../archived/web/95/impossible-press.md')
TEMPLATE = os.path.join(SCRIPT_DIR, 'src/templates/shell.html')
OUTPUT = os.path.join(SCRIPT_DIR, 'index.html')  # Output directly to dissertation-reader root

def convert_markdown_to_html(md_content):
    """Simple markdown to HTML conversion"""
    html = md_content

    # Remove empty markdown headers (artifacts from PDF transcription)
    # These are lines with only # symbols and optional whitespace
    html = re.sub(r'^#{1,6}\s*$', '', html, flags=re.MULTILINE)

    # Escape HTML entities first
    html = html.replace('&', '&amp;')
    html = html.replace('<', '&lt;')
    html = html.replace('>', '&gt;')

    # Now convert markdown

    # Headers (must do in order from h6 to h1 to avoid conflicts)
    html = re.sub(r'^###### (.+)$', r'<h6>\1</h6>', html, flags=re.MULTILINE)
    html = re.sub(r'^##### (.+)$', r'<h5>\1</h5>', html, flags=re.MULTILINE)
    html = re.sub(r'^#### (.+)$', r'<h4>\1</h4>', html, flags=re.MULTILINE)
    html = re.sub(r'^### (.+)$', r'<h3>\1</h3>', html, flags=re.MULTILINE)
    html = re.sub(r'^## (.+)$', r'<h2>\1</h2>', html, flags=re.MULTILINE)
    html = re.sub(r'^# (.+)$', r'<h1>\1</h1>', html, flags=re.MULTILINE)

    # Bold and italic
    html = re.sub(r'\*\*\*(.+?)\*\*\*', r'<strong><em>\1</em></strong>', html)
    html = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', html)
    html = re.sub(r'\*(.+?)\*', r'<em>\1</em>', html)

    # Block quotes
    quote_blocks = []
    def replace_quote(match):
        lines = match.group(0).split('\n')
        content = '\n'.join(line.lstrip('> ').lstrip('>') for line in lines)
        return f'<blockquote>{content}</blockquote>'

    html = re.sub(r'((?:^>.*\n?)+)', replace_quote, html, flags=re.MULTILINE)

    # Horizontal rules
    html = re.sub(r'^---+$', '<hr>', html, flags=re.MULTILINE)
    html = re.sub(r'^\*\*\*+$', '<hr>', html, flags=re.MULTILINE)

    # Paragraphs - wrap text blocks in <p> tags
    paragraphs = html.split('\n\n')
    result = []
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        # Don't wrap if already has block-level HTML
        if para.startswith('<h') or para.startswith('<blockquote') or para.startswith('<hr') or para.startswith('<ul') or para.startswith('<ol'):
            result.append(para)
        else:
            result.append(f'<p>{para}</p>')

    html = '\n\n'.join(result)

    # Clean up line breaks within paragraphs
    html = re.sub(r'<p>(.+?)</p>', lambda m: f'<p>{m.group(1).replace(chr(10), " ")}</p>', html, flags=re.DOTALL)

    return html

def strip_html_tags(text):
    """Remove HTML tags from text for comparison purposes"""
    return re.sub(r'<[^>]+>', '', text)

def add_section_ids(html):
    """Add IDs to headings for navigation"""
    chapter_counter = 0

    def make_id(match):
        nonlocal chapter_counter
        tag = match.group(1)
        content = match.group(2).strip()

        # Strip HTML tags for comparison
        plain_text = strip_html_tags(content).strip()
        text_lower = plain_text.lower()

        if 'acknowledgement' in text_lower:
            id_val = 'acknowledgements'
        elif 'introduction' in text_lower:
            id_val = 'introduction'
        elif text_lower == 'conclusion' or 'toward an ecological view' in text_lower:
            id_val = 'conclusion'
        elif text_lower == 'notes':
            id_val = 'notes'
        elif 'works consulted' in text_lower:
            id_val = 'works-consulted'
        elif 'part one' in text_lower:
            id_val = 'part-one'
        elif 'part two' in text_lower:
            id_val = 'part-two'
        elif text_lower.startswith('chapter') or re.match(r'^chapter\s', text_lower):
            # Chapter heading like "CHAPTER ONE" - extract number word or digit
            chapter_words = {
                'one': 1, 'two': 2, 'three': 3, 'four': 4,
                'five': 5, 'six': 6, 'seven': 7, 'eight': 8,
                'nine': 9, 'ten': 10
            }
            # Try to find chapter number as word
            for word, num in chapter_words.items():
                if word in text_lower:
                    id_val = f'chapter-{num}'
                    break
            else:
                # Try to find digit
                num_match = re.search(r'(\d+)', plain_text)
                if num_match:
                    id_val = f'chapter-{num_match.group(1)}'
                else:
                    chapter_counter += 1
                    id_val = f'chapter-{chapter_counter}'
        else:
            # Generic ID - use plain text without HTML tags
            id_val = re.sub(r'[^a-z0-9]+', '-', text_lower).strip('-')[:50]

        return f'<{tag} id="{id_val}">{content}</{tag}>'

    html = re.sub(r'<(h[1-6])>(.+?)</\1>', make_id, html)
    return html

def main():
    print("Building dissertation reader...")

    # Read markdown source
    print(f"Reading: {MD_SOURCE}")
    with open(MD_SOURCE, 'r', encoding='utf-8') as f:
        md_content = f.read()

    # Convert to HTML
    print("Converting markdown to HTML...")
    html_content = convert_markdown_to_html(md_content)

    # Add section IDs
    print("Adding section IDs for navigation...")
    html_content = add_section_ids(html_content)

    # Read template
    print(f"Reading template: {TEMPLATE}")
    with open(TEMPLATE, 'r', encoding='utf-8') as f:
        template = f.read()

    # Replace placeholder
    final_html = template.replace('{{CONTENT}}', html_content)

    # Write output
    print(f"Writing: {OUTPUT}")
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        f.write(final_html)

    print("Done! Created dissertation reader at dist/index.html")
    print(f"File size: {os.path.getsize(OUTPUT) / 1024:.1f} KB")

if __name__ == '__main__':
    main()
