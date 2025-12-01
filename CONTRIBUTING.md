# Contributing to Jay Rosen Digital Archive

Thank you for your interest in contributing to the Jay Rosen Digital Archive (JRDA)! This guide will help you get started with development, understand our code standards, and submit contributions.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
  - [Frontend Development](#frontend-development-zero-build)
  - [Backend Development](#backend-development-python)
- [Code Style Guidelines](#code-style-guidelines)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Issue Guidelines](#issue-guidelines)
- [Additional Resources](#additional-resources)

---

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please be respectful and constructive in all interactions.

---

## Getting Started

This is a monorepo containing both frontend (zero-build React) and backend (Python) components. You can work on either or both depending on your contribution.

### Frontend Development (Zero-Build)

The frontend uses a **zero-build architecture** - no npm build, no webpack, no bundlers. All dependencies load via CDN.

#### Prerequisites
- A modern web browser (Chrome, Firefox, Safari, or Edge)
- A simple HTTP server (Python, Node, or any static server)
- Git

#### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/jamditis/rosen-frontend.git
   cd rosen-frontend
   ```

2. **Start a local server:**
   ```bash
   # Using Python 3
   python -m http.server 8000
   
   # Or using Node.js
   npx serve .
   
   # Or using PHP
   php -S localhost:8000
   ```

3. **Open your browser:**
   Navigate to `http://localhost:8000`

#### Frontend Tech Stack
- **React 18** (via CDN: `https://esm.sh/react@18.2.0`)
- **HTM** (JSX-like syntax for vanilla JS)
- **Tailwind CSS** (via CDN with custom config)
- **PapaParse** (CSV parsing)
- **Lucide React** (icons)
- **ES Modules** (native browser imports)

#### Frontend File Structure
```
/                           # Root is the frontend
├── index.html             # Entry point
├── App.js                 # Main application
├── components/            # React components
├── services/              # Data fetching & caching
├── constants.js           # Configuration
├── comparison-tool/       # Standalone tool
├── glossary/              # Standalone tool
└── [other tools]/         # Additional features
```

#### Key Frontend Concepts
- **No build step required** - Edit `.js` files and refresh
- **All files are vanilla ES modules** - Import/export syntax
- **HTM for JSX** - Use `html` template tag instead of JSX
- **CDN dependencies** - No `node_modules` directory
- **Data from Google Sheets** - CSV export cached in localStorage

---

### Backend Development (Python)

The backend is a Python-based data pipeline for scraping, AI analysis, and archiving content.

#### Prerequisites
- **Python 3.13+**
- **Poetry** (dependency management)
- **Playwright** (browser automation)
- **Google Cloud credentials** (for Sheets API and Gemini)
- Git

#### Setup

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Create and activate virtual environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install Poetry (if not already installed):**
   ```bash
   pip install poetry
   ```

4. **Install dependencies:**
   ```bash
   poetry install
   ```

5. **Install Playwright browsers:**
   ```bash
   playwright install
   ```

6. **Configure environment variables:**
   Create a `.env` file in the `backend/` directory:
   ```env
   SPREADSHEET_NAME="Your Google Sheet Name"
   GEMINI_API_KEY="your_gemini_api_key"
   ```

7. **Add Google Cloud credentials:**
   Place your service account JSON file at:
   ```
   backend/google_credentials.json
   ```

#### Backend Tech Stack
- **Python 3.13+**
- **Poetry** (dependency management)
- **Playwright** (web scraping)
- **Google Gemini API** (AI analysis)
- **Google Sheets API** (data storage)
- **ReportLab** (PDF generation)
- **yt-dlp** (video processing)

#### Backend File Structure
```
backend/
├── src/                        # Core source code
│   └── rosen_scraper/
│       ├── processors/         # Content processors
│       ├── scraper/            # Web scraping logic
│       └── workflow.py         # Main orchestrator
├── scripts/                    # Utility scripts
├── tests/                      # Test suite
├── pyproject.toml              # Poetry dependencies
├── poetry.lock                 # Locked dependencies
└── schema.json                 # Data schema
```

#### Running the Backend

```bash
cd backend

# Main workflow
python src/workflow.py

# Data deduplication
python tools/diagnostics/data_deduper.py

# Backfill missing fields
python tools/backfill/backfill_worker.py
```

---

## Code Style Guidelines

### Frontend (JavaScript)

**Standards:**
- **ES6+ syntax** (const, let, arrow functions, template literals)
- **ES Modules** (import/export)
- **HTM for JSX-like syntax** - Use `html` tagged templates
- **No semicolons** (except where required for ASI)
- **2-space indentation**
- **Descriptive variable names** (camelCase)

**Example:**
```javascript
import { html } from './html.js';
import { useState, useEffect } from 'react';

export function MyComponent({ data }) {
  const [isOpen, setIsOpen] = useState(false);
  
  useEffect(() => {
    // Side effect logic
  }, []);
  
  return html`
    <div className="container">
      <h1>${data.title}</h1>
    </div>
  `;
}
```

**Comments:**
- Only add comments for complex logic or non-obvious behavior
- Match the style of existing comments in the file
- Avoid redundant comments that just describe what the code does

**Structure:**
- Keep components focused and single-purpose
- Extract reusable logic into separate functions
- Use existing patterns from the codebase

### Backend (Python)

**Standards:**
- **Python 3.13+** features encouraged
- **Type hints encouraged** but not strictly required
- **PEP 8 style guide** (4-space indentation, snake_case)
- **Docstrings** for modules, classes, and functions
- **Poetry for dependencies** (never `pip install` directly in production)

**Example:**
```python
def process_article(url: str, config: dict) -> dict:
    """
    Process an article from a given URL.
    
    Args:
        url: The article URL to process
        config: Configuration dictionary
        
    Returns:
        dict: Processed article data
    """
    # Implementation
    pass
```

**Comments:**
- Add docstrings to all public functions and classes
- Use inline comments sparingly for complex logic
- Follow Google or NumPy docstring style

---

## Testing

### Frontend Testing

Currently, the frontend uses **manual testing** due to its zero-build nature:

1. **Visual Testing:**
   - Test in multiple browsers (Chrome, Firefox, Safari)
   - Verify responsive design on mobile, tablet, desktop
   - Check accessibility (keyboard navigation, screen readers)

2. **Functional Testing:**
   - Test all interactive features (filters, search, Explorer)
   - Verify data loading and caching
   - Test error states and edge cases

3. **Before Submitting:**
   - Open the app in a browser
   - Click through your changes
   - Test on mobile (Chrome DevTools device mode)
   - Check browser console for errors

### Backend Testing

The backend uses **pytest** for automated testing.

#### Running Tests

```bash
cd backend

# Run all tests
pytest

# Run with verbose output
pytest -v

# Run specific test file
pytest tests/test_multimedia_processors.py

# Run with coverage
pytest --cov=src
```

#### Writing Tests

- Place tests in `backend/tests/`
- Name test files `test_*.py`
- Use `pytest` fixtures and assertions
- Mock external APIs (Google Sheets, Gemini)

**Example:**
```python
import pytest
from rosen_scraper.processors import ArticleProcessor

def test_article_extraction():
    """Test article content extraction."""
    processor = ArticleProcessor()
    result = processor.extract(test_html)
    
    assert result['title'] == 'Expected Title'
    assert len(result['content']) > 0
```

#### Test Requirements

- **New features must include tests** (when adding to backend)
- **Bug fixes should include regression tests**
- **All tests must pass before PR approval**

---

## Pull Request Process

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

**Branch naming:**
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring

### 2. Make Your Changes

- Follow the code style guidelines
- Keep changes focused and minimal
- Test your changes thoroughly
- Update documentation if needed

### 3. Commit Your Changes

Write clear, descriptive commit messages:

```bash
git add .
git commit -m "Add feature: descriptive summary"
```

**Commit message format:**
```
<type>: <short summary>

<optional detailed description>
```

**Types:** feat, fix, docs, style, refactor, test, chore

### 4. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a PR on GitHub with:

- **Clear title** describing the change
- **Description** explaining what and why
- **Reference related issues** (Closes #123)
- **Screenshots** for UI changes
- **Test instructions** for reviewers

### 5. PR Checklist

Before submitting, ensure:

- [ ] Code follows project style guidelines
- [ ] Changes are minimal and focused
- [ ] All tests pass (backend)
- [ ] Manual testing completed (frontend)
- [ ] Documentation updated if needed
- [ ] No console errors or warnings
- [ ] Commit messages are clear
- [ ] PR description is complete

### 6. Review Process

- A maintainer will review your PR
- Address any feedback or requested changes
- Once approved, your PR will be merged

---

## Issue Guidelines

### Creating Issues

When reporting bugs or requesting features, please:

1. **Check existing issues** to avoid duplicates
2. **Use descriptive titles**
3. **Provide context and details**
4. **Include reproduction steps** (for bugs)
5. **Add appropriate labels**

### Issue Labels

| Label | Description |
|-------|-------------|
| `frontend` | Frontend React/JS application |
| `backend` | Backend Python pipeline |
| `bug` | Something isn't working |
| `enhancement` | New feature or request |
| `documentation` | Documentation improvements |
| `good first issue` | Good for newcomers |
| `help wanted` | Extra attention needed |

### Bug Report Template

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**
What you expected to happen.

**Screenshots**
If applicable, add screenshots.

**Environment:**
- Browser [e.g., Chrome 120]
- OS [e.g., Windows 11]
- Component [frontend/backend]

**Additional context**
Any other relevant information.
```

### Feature Request Template

```markdown
**Is your feature request related to a problem?**
A clear description of the problem.

**Describe the solution you'd like**
What you want to happen.

**Describe alternatives you've considered**
Other solutions you've thought about.

**Additional context**
Any other context or screenshots.
```

---

## Additional Resources

### Documentation
- **[README.md](README.md)** - Project overview and quick start
- **[CLAUDE.md](CLAUDE.md)** - AI assistant context (detailed architecture)
- **[changelog.md](changelog.md)** - Development history

### Key Concepts

- **Zero-Build Architecture** - No build step, CDN dependencies
- **Dissertation Integration** - Jay Rosen's 1986 dissertation "The Impossible Press"
- **Data Pipeline** - Automated scraping and AI analysis
- **Google Sheets Backend** - Data stored in spreadsheets

### Getting Help

- **Issues:** Open a GitHub issue with questions
- **Discussions:** Use GitHub Discussions for broader topics
- **Contact:** Reach out to maintainer Joe Amditis

---

## Project Philosophy

This project values:

- **Simplicity** - Zero-build frontend, straightforward deployment
- **Accessibility** - Keyboard navigation, screen reader support
- **Minimal dependencies** - Use existing libraries when possible
- **Clear documentation** - Code should be understandable
- **Incremental progress** - Small, focused changes

---

Thank you for contributing to the Jay Rosen Digital Archive! 🎉
