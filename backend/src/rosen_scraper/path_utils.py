# -*- coding: utf-8 -*-
"""
Path utility functions for the Rosen Scraper project.

This module provides shared path handling utilities to ensure
consistent path resolution across all modules.
"""

import os
import re
from pathlib import Path

# Characters that are illegal in filenames on common filesystems.
_ILLEGAL_FILENAME_CHARS = re.compile(r'[\\/*?:"<>|]')


def build_output_path(
    title: str,
    item_id: str,
    suffix: str,
    output_dir: str,
    default_title: str,
) -> str:
    """
    Build a sanitized "<title> - <id> - <suffix>" path under output_dir.

    Strips filename-illegal characters from the title, falls back to
    default_title when the result is empty, truncates the title to 60
    characters, and ensures output_dir exists. Shared by the PDF and
    transcript writers so the filename convention lives in one place.

    Args:
        title: Article/transcript title (already defaulted by the caller).
        item_id: Record id used in the filename.
        suffix: Trailing part of the filename, e.g. "text.pdf" or "transcript.txt".
        output_dir: Directory the file is written to (created if missing).
        default_title: Title used when sanitizing leaves an empty string.

    Returns:
        The full output path.
    """
    sanitized = _ILLEGAL_FILENAME_CHARS.sub("", title)
    if not sanitized:
        sanitized = default_title
    filename = f"{sanitized[:60]} - {item_id} - {suffix}"
    os.makedirs(output_dir, exist_ok=True)
    return os.path.join(output_dir, filename)


def find_project_root() -> Path:
    """
    Find the project root by looking for pyproject.toml.
    
    This function traverses up the directory tree from the calling module
    until it finds a directory containing pyproject.toml, which marks the
    project root. This is more reliable than using multiple dirname() calls
    as it doesn't depend on a fixed directory depth.
    
    Returns:
        Path: The absolute path to the project root directory.
        
    Raises:
        FileNotFoundError: If pyproject.toml cannot be found in any parent directory.
    
    Example:
        >>> from rosen_scraper.path_utils import find_project_root
        >>> project_root = find_project_root()
        >>> schema_file = project_root / 'schema.json'
    """
    # Start from this file's directory and walk up
    current = Path(__file__).resolve().parent
    
    # Walk up the directory tree until we find pyproject.toml or reach the root
    while current.parent != current:
        if (current / "pyproject.toml").exists():
            return current
        current = current.parent
    
    # If we reached the filesystem root without finding pyproject.toml, raise an error
    raise FileNotFoundError("Project root (pyproject.toml) not found")
