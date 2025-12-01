# -*- coding: utf-8 -*-
"""
Path utility functions for the Rosen Scraper project.

This module provides shared path handling utilities to ensure
consistent path resolution across all modules.
"""

from pathlib import Path


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
    
    while current.parent != current:
        if (current / "pyproject.toml").exists():
            return current
        current = current.parent
    
    raise FileNotFoundError("Project root (pyproject.toml) not found")


# Pre-compute common paths for convenience
try:
    PROJECT_ROOT = find_project_root()
except FileNotFoundError:
    # If we can't find the project root, this will be set to None
    # and modules can handle this gracefully
    PROJECT_ROOT = None
