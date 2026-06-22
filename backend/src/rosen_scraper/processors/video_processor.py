# -*- coding: utf-8 -*-
"""
This module handles the processing of video content, specifically from YouTube.
It uses the yt-dlp library to extract metadata from video URLs without
downloading the entire video file.
"""

from typing import Optional, Dict, Any
import yt_dlp
from rosen_scraper import categorizer
from rosen_scraper.processors import base
import os
import re
import shutil
import tempfile


def _clean_vtt(vtt_content: str) -> str:
    """Cleans a VTT file content to extract only the spoken text."""
    lines = vtt_content.splitlines()
    cleaned_lines = []
    for line in lines:
        # Skip VTT metadata, timestamps, and empty lines
        if line.strip().startswith("WEBVTT") or "-->" in line or not line.strip():
            continue
        # Remove any lingering HTML-like tags
        cleaned_line = re.sub(r"<[^>]+>", "", line)
        cleaned_lines.append(cleaned_line.strip())
    return "\n".join(cleaned_lines)


def process_video(url: str, schema: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Extracts metadata and transcript from a YouTube video URL, then analyzes it.
    """
    # Unique per-call temp dir so concurrent video submissions (or two Action
    # runs sharing a workspace) can't collide on a fixed CWD-relative name (#288).
    temp_dir = tempfile.mkdtemp(prefix="rosen_video_")
    temp_filename = os.path.join(temp_dir, "temp_transcript")
    ydl_opts = {
        "quiet": True,
        "writeautomaticsub": True,
        "subtitleslangs": ["en"],
        "skip_download": True,
        "outtmpl": temp_filename,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            transcript_path = f"{temp_filename}.en.vtt"
            raw_transcript = ""
            if os.path.exists(transcript_path):
                with open(transcript_path, "r", encoding="utf-8") as f:
                    raw_transcript = f.read()
                os.remove(transcript_path)

            cleaned_transcript = _clean_vtt(raw_transcript)

            video_data = {
                "title": info.get("fulltitle"),
                "author": info.get("uploader"),
                "publication_date": info.get("upload_date"),
                "original_publication": info.get("uploader"),
                "content_type": "Appearance",
                "format": "video",
                "length_in_seconds": info.get("duration"),
                "raw_text": cleaned_transcript or info.get("description"),
                "tags": info.get("tags", []),
            }

            if video_data["raw_text"]:
                ai_analysis = categorizer.summarize_and_classify(
                    video_data["raw_text"], schema
                )
                base.merge_ai_fields(video_data, ai_analysis, clobber=True)
            return video_data
    except Exception as e:
        print(f"  [Video Processor] Error processing video: {e}")
        return None
    finally:
        # Remove the whole per-call temp dir, including any subtitle files yt-dlp
        # wrote beyond .en.vtt. ignore_errors so cleanup never masks a real error.
        shutil.rmtree(temp_dir, ignore_errors=True)
