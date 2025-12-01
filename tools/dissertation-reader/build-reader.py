#!/usr/bin/env python3
"""
Build script for dissertation reader.
Converts markdown to HTML and creates the final dist/index.html.
"""

import re
import os

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MD_SOURCE = os.path.join(SCRIPT_DIR, '../web/95/impossible-press.md')
TEMPLATE = os.path.join(SCRIPT_DIR, 'src/templates/shell.html')
OUTPUT = os.path.join(SCRIPT_DIR, 'dist/index.html')

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

def add_section_ids(html):
    """Add IDs to headings for navigation"""
    counter = {'intro': 0, 'chapter': 0, 'conclusion': 0, 'notes': 0, 'works': 0}

    def make_id(match):
        tag = match.group(1)
        content = match.group(2).strip()

        # Create ID from content
        content_lower = content.lower()

        if 'acknowledgement' in content_lower:
            id_val = 'acknowledgements'
        elif 'introduction' in content_lower:
            id_val = 'introduction'
        elif 'conclusion' in content_lower:
            id_val = 'conclusion'
        elif 'notes' == content_lower:
            id_val = 'notes'
        elif 'works consulted' in content_lower:
            id_val = 'works-consulted'
        elif 'part one' in content_lower or 'part two' in content_lower:
            id_val = content_lower.replace(' ', '-').replace(':', '')
        elif content_lower.startswith('chapter') or re.match(r'^\d+\.', content_lower):
            # Extract chapter number
            num_match = re.search(r'(\d+)', content)
            if num_match:
                id_val = f'chapter-{num_match.group(1)}'
            else:
                counter['chapter'] += 1
                id_val = f'chapter-{counter["chapter"]}'
        else:
            # Generic ID
            id_val = re.sub(r'[^a-z0-9]+', '-', content_lower).strip('-')[:50]

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
