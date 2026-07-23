# Contributor guide

## What this project is

**Jay Rosen's Internet Archive** is a public collection of the works, critiques, and teachings of Jay Rosen, professor of journalism at NYU since 1986. It covers four decades of journalism criticism, media theory, and public life. The archive currently holds ~940 records (articles, essays, interviews, lectures, social media posts) and is live at https://pressthink.org/j/rosen-archive/.

The archive curator is Joe Amditis.

## Architecture

This is a **zero-build static site**. There is no npm build step, no Webpack, no Vite, no bundler of any kind for the production frontend. The data pipeline is a separate Python/Poetry backend that runs offline.

### Frontend

- **React 18** loaded via CDN (`esm.sh`) using an import map in `index.html`
- **HTM** (`htm` library) for JSX-like template syntax — all components use `` html`...` `` tagged templates, not JSX
- **Tailwind CSS** pre-built at `frontend/dist/tailwind.css`
- **Lucide React** for icons (also via esm.sh)
- **sql.js** for optional in-browser SQLite queries
- **ES modules** — native browser imports, no transpilation

### Data

- **Static JSON files** generated from CSV sources by `node data/export-archive-data.js`
- Split into three files for performance: `archive-core.json` (loads first), `archive-details.json` (on demand), `archive-entities.json` (on demand)
- Full combined fallback at `archive-data.json`
- No runtime API calls — all data is pre-built and served statically

### Backend pipeline

- **Python 3.10+** with **Poetry** for dependency management
- Scraping cascade (trafilatura, Playwright, BeautifulSoup) for content extraction
- **Gemini AI** for content analysis, categorization, and entity extraction
- Google Sheets integration for data management
- PDF generation (ReportLab)
- Output: CSV files that feed the JSON export pipeline

### Deployment

- FTP upload to WordPress at `pressthink.org/j/rosen-archive/`
- No CI/CD deployment — manual FTP
- Cloudflare CDN sits in front for caching

### Testing

- **Frontend/data tests:** Node.js built-in test runner (`npm test`)
- **Backend tests:** pytest (`cd backend && poetry run pytest`)
- **CI:** GitHub Actions runs frontend validation, backend tests, and backend linting

## Contributor roles

This project doesn't use a "team of agents" model. Instead, there are four distinct areas of work, each described in its own persona document:

| Role | Document | Scope |
|------|----------|-------|
| Data pipeline engineer | `data-pipeline-engineer.md` | Python backend, scraping, AI analysis, CSV/JSON flow |
| Frontend developer | `frontend-developer.md` | React components, HTM templates, design system, routing |
| Data curator | `data-curator.md` | Archive records, CSV editing, data quality, taxonomies |
| Code reviewer | `code-reviewer.md` | Review standards, project conventions, quality checks |

## Key rules

These apply to all contributors regardless of role:

1. **No build step for frontend.** Never suggest npm/Webpack/Vite for the production frontend. npm is only used for `node data/export-archive-data.js` (data generation) and `npm test` (testing).

2. **HTM, not JSX.** All components use the `html` tagged template from `./html.js`. Import: `import { html } from '../html.js?v=3.3.0'`.

3. **Version all imports.** Every `.js` import must include a `?v=X.X.X` query parameter matching the current version. Check `index.html` and `version.json` for the current version.

4. **Sentence case everywhere.** Never use Title Case in UI text, comments, or documentation.

5. **Dissertation content is sacred.** Quotes and content in `dissertationData.js` are verified citations from the original 1986 dissertation. Do not modify, paraphrase, or fabricate quotes.

6. **Backend uses Poetry.** Run commands with `poetry run python ...`, not `pip` directly.

7. **Git LFS for PDFs.** Large PDF files in `dissertation/` are managed via Git LFS.

8. **Don't modify archived code.** The `/archived/` directory is reference only.

9. **Keep data regeneration working.** If you change CSV structure, update `data/export-archive-data.js` to match.

10. **Standalone pages go in `/dissertation/` or `/features/`.** Each gets its own subdirectory with an `index.html`.

## Local development

```bash
# Serve the frontend (no build needed)
python3 -m http.server 8000
# Open http://localhost:8000

# Run tests
npm test                   # All 8 test files
npm run test:data          # Data integrity + CSV quality
npm run test:pipeline      # Data pipeline + thread detection
npm run test:frontend      # Version consistency + frontend structure

# Regenerate JSON from CSV
npm install                # First time only
node data/export-archive-data.js

# Backend pipeline
cd backend
poetry install
poetry run python src/workflow.py
```

## Directory structure

See `CLAUDE.md` for the full annotated directory tree.

## About Jay Rosen

Professor of Journalism at NYU since 1986. Creator of the PressThink blog. Known for "the view from nowhere," "audience atomization overcome," and critiques of professional journalism. His 1986 dissertation, "The Impossible Press: American Journalism and the Decline of Public Life" (advisor: Neil Postman), was released publicly in December 2025.
