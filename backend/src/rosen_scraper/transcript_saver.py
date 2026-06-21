# -*- coding: utf-8 -*-
"""
This module is responsible for saving raw text transcripts to a file.
"""

from typing import Optional, Dict, Any

from rosen_scraper.path_utils import build_output_path


def save_transcript(article_data: Dict[str, Any], output_dir: str = "processed_transcripts") -> Optional[str]:
    """
    Saves the raw text of a transcript to a .txt file.

    Args:
        article_data (dict): A dictionary containing the article information.
        output_dir (str): The directory where the transcript will be saved.

    Returns:
        str: The full file path of the newly created transcript file, or None.
    """
    # --- 1. Prepare Data and Filename ---
    title = article_data.get('title') or 'Untitled Transcript'
    item_id = article_data.get('id', 'NO-ID')

    # Build the sanitized output path (shared with the PDF writer).
    transcript_filepath = build_output_path(
        title, item_id, "transcript.txt", output_dir, "Untitled Transcript"
    )

    # --- 2. Write Transcript to File ---
    try:
        with open(transcript_filepath, 'w', encoding='utf-8') as f:
            f.write(article_data.get('raw_text', ''))
        print(f"  [Transcript Saver] Successfully created transcript: {transcript_filepath}")
        return transcript_filepath
    except Exception as e:
        print(f"  [Transcript Saver] ERROR: Could not create transcript for '{title}'. Reason: {e}")
        return None

