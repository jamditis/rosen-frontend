#!/usr/bin/env python3
"""
Build Unified PDF for "The Impossible Press"
Merges source PDFs and adds metadata/bookmarks
"""

from PyPDF2 import PdfReader, PdfWriter
import os
from datetime import datetime

# Configuration
DISSERTATION_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(DISSERTATION_DIR, "rosen-impossible-press-dissertation-1986.pdf")

# Source PDFs in correct order
SOURCE_PDFS = [
    "ROSEN DISSERTATION-CH1-3.pdf",  # Front matter + Chapters 1-3
    "ROSEN DISSERTATION PT2.pdf",     # Chapters 4-5 (Part 1 cont.) + Part 2 start
    "ROSEN DISSERTATION PT3.pdf",     # Part 2 continuation
    "ROSEN DISSERTATION END.pdf",     # Conclusion + Notes
    "ROSEN DISSERTATION BIB.pdf",     # Bibliography
]

# Metadata
METADATA = {
    "/Title": "The Impossible Press: American Journalism and the Decline of Public Life",
    "/Author": "Jay Rosen",
    "/Subject": "Doctoral Dissertation, New York University, 1986",
    "/Keywords": "journalism, press, democracy, public life, media criticism, Neil Postman",
    "/Creator": "Jay Rosen Internet Archive",
    "/Producer": "pypdf",
}


def analyze_source_pdfs():
    """Analyze source PDFs and report statistics"""
    print("Analyzing source PDFs...")
    total_pages = 0

    for filename in SOURCE_PDFS:
        filepath = os.path.join(DISSERTATION_DIR, filename)
        if not os.path.exists(filepath):
            print(f"  ERROR: {filename} not found!")
            continue

        reader = PdfReader(filepath)
        page_count = len(reader.pages)
        file_size = os.path.getsize(filepath) / (1024 * 1024)  # MB

        print(f"  {filename}")
        print(f"    Pages: {page_count}")
        print(f"    Size: {file_size:.1f} MB")

        total_pages += page_count

    print(f"\nTotal pages: {total_pages}")
    return total_pages


def merge_pdfs():
    """Merge all source PDFs into one"""
    print("\nMerging PDFs...")
    writer = PdfWriter()

    page_offset = 0
    file_page_ranges = []

    for filename in SOURCE_PDFS:
        filepath = os.path.join(DISSERTATION_DIR, filename)
        if not os.path.exists(filepath):
            print(f"  Skipping missing file: {filename}")
            continue

        reader = PdfReader(filepath)
        start_page = page_offset

        for page in reader.pages:
            writer.add_page(page)
            page_offset += 1

        end_page = page_offset - 1
        file_page_ranges.append({
            "filename": filename,
            "start": start_page,
            "end": end_page,
            "count": end_page - start_page + 1
        })
        print(f"  Added {filename}: pages {start_page+1}-{end_page+1}")

    return writer, file_page_ranges


def add_metadata(writer):
    """Add document metadata"""
    print("\nAdding metadata...")

    # Add metadata
    writer.add_metadata({
        "/Title": METADATA["/Title"],
        "/Author": METADATA["/Author"],
        "/Subject": METADATA["/Subject"],
        "/Keywords": METADATA["/Keywords"],
        "/Creator": METADATA["/Creator"],
        "/Producer": METADATA["/Producer"],
        "/CreationDate": "D:19860101000000",
        "/ModDate": f"D:{datetime.now().strftime('%Y%m%d%H%M%S')}",
    })

    print("  Metadata added successfully")


def add_bookmarks(writer, page_ranges):
    """Add bookmark structure based on dissertation structure"""
    print("\nAdding bookmarks...")

    # Based on the dissertation structure, create bookmarks
    # These page numbers are estimates - adjust based on actual content

    # Main title bookmark
    root = writer.add_outline_item("The Impossible Press", 0)

    # Front matter (first file)
    writer.add_outline_item("Acknowledgements", 1, parent=root)
    writer.add_outline_item("Table of Contents", 3, parent=root)

    # Introduction
    writer.add_outline_item("Introduction: Journalism as a Transaction", 5, parent=root)

    # Part One - starts around page 13 based on ToC
    part1 = writer.add_outline_item("Part One: The Making of the Modern Public", 12, parent=root)
    writer.add_outline_item("Chapter 1: Democracy and Distance", 13, parent=part1)
    writer.add_outline_item("Chapter 2: Two Views of News", 42, parent=part1)
    writer.add_outline_item("Chapter 3: The Universal Town Meeting", 90, parent=part1)
    writer.add_outline_item("Chapter 4: From Crowd to Public", 117, parent=part1)
    writer.add_outline_item("Chapter 5: Communication Without Community", 152, parent=part1)

    # Part Two - starts around page 198
    part2 = writer.add_outline_item("Part Two: The Public and the Professionalized Press", 197, parent=root)
    writer.add_outline_item("Chapter 6: The Impossible Press", 198, parent=part2)
    writer.add_outline_item("Chapter 7: The Myth of the Omnicompetent Citizen", 268, parent=part2)
    writer.add_outline_item("Chapter 8: The Art and Science of Forming a Public", 330, parent=part2)

    # Conclusion and back matter
    writer.add_outline_item("Conclusion: Toward an Ecological View", 374, parent=root)
    writer.add_outline_item("Notes", 416, parent=root)
    writer.add_outline_item("Works Consulted", 452, parent=root)

    print("  Bookmarks added")


def optimize_pdf(writer):
    """Optimize PDF for smaller file size"""
    print("\nOptimizing...")
    # pypdf handles basic optimization during write
    # For heavy optimization, we'd need additional tools
    pass


def save_pdf(writer):
    """Save the final PDF"""
    print(f"\nSaving to: {OUTPUT_FILE}")

    with open(OUTPUT_FILE, "wb") as f:
        writer.write(f)

    file_size = os.path.getsize(OUTPUT_FILE) / (1024 * 1024)
    print(f"  Final size: {file_size:.1f} MB")

    return file_size


def main():
    print("=" * 60)
    print("Building Unified PDF: The Impossible Press")
    print("=" * 60)

    # Step 1: Analyze sources
    total_pages = analyze_source_pdfs()

    # Step 2: Merge PDFs
    writer, page_ranges = merge_pdfs()

    # Step 3: Add metadata
    add_metadata(writer)

    # Step 4: Add bookmarks
    add_bookmarks(writer, page_ranges)

    # Step 5: Optimize
    optimize_pdf(writer)

    # Step 6: Save
    file_size = save_pdf(writer)

    print("\n" + "=" * 60)
    print("BUILD COMPLETE")
    print("=" * 60)
    print(f"Output: {OUTPUT_FILE}")
    print(f"Pages: {total_pages}")
    print(f"Size: {file_size:.1f} MB")

    # Validation reminders
    print("\nValidation checklist:")
    print("  [ ] Open in PDF reader and verify all pages")
    print("  [ ] Test bookmark navigation")
    print("  [ ] Verify text is searchable")
    print("  [ ] Check metadata in document properties")


if __name__ == "__main__":
    main()
