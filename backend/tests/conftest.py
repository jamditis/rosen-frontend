"""
Pytest configuration and fixtures for backend tests.
"""
import sys
import os
from pathlib import Path
import pytest

# Add src directory to path for imports
backend_dir = Path(__file__).resolve().parents[1]
src_dir = backend_dir / "src"
if str(src_dir) not in sys.path:
    sys.path.insert(0, str(src_dir))


@pytest.fixture
def sample_article_html():
    """Sample HTML for testing article processing."""
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Test Article Title</title>
        <meta name="author" content="John Doe">
        <meta name="date" content="2024-01-15">
    </head>
    <body>
        <article>
            <h1>Test Article Title</h1>
            <p>This is a sample article paragraph for testing.</p>
            <p>Another paragraph with more content.</p>
        </article>
    </body>
    </html>
    """


@pytest.fixture
def sample_article_data():
    """Sample extracted article data."""
    return {
        'title': 'Test Article Title',
        'author': 'John Doe',
        'text': 'This is a sample article paragraph for testing. Another paragraph with more content.',
        'date': '2024-01-15',
        'url': 'https://example.com/test-article',
        'raw_text': 'This is a sample article paragraph for testing. Another paragraph with more content.'
    }


@pytest.fixture
def sample_schema():
    """Sample schema for testing."""
    return {
        'categories': [
            'Press Criticism',
            'Public Journalism',
            'Media Theory',
            'Digital Media',
            'Politics'
        ],
        'concepts': [
            'view from nowhere',
            'audience atomization',
            'press think',
            'objectivity',
            'transparency'
        ],
        'publications': [
            'PressThink',
            'New York Times',
            'Columbia Journalism Review',
            'The Guardian'
        ]
    }


@pytest.fixture
def sample_entities():
    """Sample entities for testing."""
    return [
        {
            'name': 'Jay Rosen',
            'type': 'Person',
            'description': 'Professor of Journalism at NYU'
        },
        {
            'name': 'PressThink',
            'type': 'Publication',
            'description': 'Blog by Jay Rosen'
        },
        {
            'name': 'New York University',
            'type': 'Organization',
            'description': 'University in New York City'
        }
    ]


@pytest.fixture
def mock_env_vars(monkeypatch):
    """Mock environment variables for testing."""
    monkeypatch.setenv("GEMINI_API_KEY", "test_api_key_12345")
    monkeypatch.setenv("SPREADSHEET_NAME", "Test Spreadsheet")
    monkeypatch.setenv("GOOGLE_APPLICATION_CREDENTIALS", "test_credentials.json")


@pytest.fixture
def sample_url():
    """Sample URL for testing."""
    return "https://example.com/test-article"


@pytest.fixture
def sample_existing_ids():
    """Sample existing IDs for testing ID generation."""
    return {
        'PRESSTH-00001',
        'PRESSTH-00002',
        'NYT-00001',
        'NYT-00002',
        'CJR-00001'
    }
