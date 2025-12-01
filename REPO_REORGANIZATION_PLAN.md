# Repository Reorganization Plan

## Purpose

This document outlines a comprehensive plan to reorganize the Jay Rosen Digital Archive repository before transitioning from private to public. The goal is to create a clean, professional, well-documented open-source project.

---

## Executive Summary

### Current State
- **400+ files** across a monorepo structure
- Excellent documentation but scattered across multiple locations
- Some duplicate files wasting space and causing maintenance burden
- Mixed active/legacy tools without clear status indicators
- Large data files (~60MB) checked into version control
- Inconsistencies between .gitignore and actual committed files

### Goals
1. **Clarity**: Clear directory structure that's intuitive for newcomers
2. **Professionalism**: Standard open-source files and practices
3. **Efficiency**: Remove duplicates, consolidate documentation
4. **Discoverability**: Easy navigation to key features
5. **Maintainability**: Clear separation of concerns

---

## Phase 1: Critical Cleanup (Pre-Public)

### 1.1 Remove Duplicate Files

| File | Current Locations | Action |
|------|-------------------|--------|
| `FINAL-ROSEN_DISSERTATION_THE-IMPOSSIBLE-PRESS_TRANSCRIBED.md` | Root + `/dissertation/` | **Delete from root**, keep in `/dissertation/` |
| `CLAUDE.md` | Root + `/docs/` | **Delete from `/docs/`**, keep at root only |
| `/tools/dissertation-reader/dist/` | Mirrors `/src/` exactly | **Delete `/dist/`**, regenerate at deploy time |

**Space Savings**: ~800KB

### 1.2 Fix .gitignore Inconsistencies

The `/csv/` directory is listed in `.gitignore` but files are currently tracked. Decision needed:

**Option A: Keep Data in Repo (Recommended for Archive)**
- Remove `/csv/` from `.gitignore`
- Add clear README explaining data files
- Consider Git LFS for files >10MB

**Option B: Remove Data from Repo**
- Run `git rm -r --cached csv/`
- Keep in `.gitignore`
- Document how to obtain data separately

### 1.3 Sensitive File Audit

Before going public, verify no sensitive data:
- [ ] Check all `.env.example` files don't contain real values
- [ ] Verify `google_credentials.json` is in `.gitignore`
- [ ] Audit `release-assets/promotional/contact-lists.md` for private info
- [ ] Check CSV files for any PII or sensitive metadata

---

## Phase 2: Directory Restructure

### 2.1 Proposed New Structure

```
rosen-frontend/
│
├── README.md                    # Project overview (enhanced)
├── CLAUDE.md                    # AI assistant instructions
├── CONTRIBUTING.md              # Contribution guidelines
├── LICENSE                      # License file
├── CHANGELOG.md                 # Version history (rename from changelog.md)
├── SECURITY.md                  # NEW: Security policy
├── CODE_OF_CONDUCT.md           # NEW: Community standards
│
├── .github/
│   ├── workflows/               # CI/CD pipelines (existing)
│   ├── ISSUE_TEMPLATE/          # NEW: Issue templates
│   │   ├── bug_report.md
│   │   ├── feature_request.md
│   │   └── documentation.md
│   ├── PULL_REQUEST_TEMPLATE.md # NEW: PR template
│   └── FUNDING.yml              # NEW: Optional sponsorship
│
├── frontend/                    # NEW: Consolidate frontend code
│   ├── index.html
│   ├── App.js
│   ├── index.js
│   ├── index.css
│   ├── constants.js
│   ├── html.js
│   ├── tailwind.config.js
│   ├── shared-styles.css
│   ├── components/              # React components
│   └── services/                # Data services
│
├── features/                    # NEW: Rename from scattered tools
│   ├── comparison-tool/         # "Then and Now" comparisons
│   ├── glossary/                # Key concepts glossary
│   ├── context-1986/            # Historical context
│   ├── timeline/                # Dissertation to 2025 timeline
│   ├── annotated-excerpts/      # Key passages with commentary
│   ├── faq/                     # Ask the Dissertation
│   └── dissertation-reader/     # PDF viewer (move from /tools/)
│
├── backend/                     # Python pipeline (existing, well-organized)
│   ├── src/
│   ├── scripts/
│   ├── tests/
│   ├── pyproject.toml
│   └── README.md
│
├── dissertation/                # Source materials (existing)
│   ├── *.pdf                    # PDF scans (Git LFS)
│   ├── TRANSCRIPTION.md         # Rename for clarity
│   └── build_unified_pdf.py
│
├── data/                        # NEW: Consolidate data files
│   ├── csv/                     # Move from /csv/
│   │   ├── README.md            # Data dictionary
│   │   └── *.csv
│   └── exports/                 # Generated exports
│
├── docs/                        # Documentation (consolidated)
│   ├── README.md                # Documentation index
│   ├── ARCHITECTURE.md          # System architecture
│   ├── DEPLOYMENT.md            # NEW: Deployment guide
│   ├── DEVELOPMENT.md           # NEW: Developer setup
│   ├── API.md                   # NEW: Backend API docs
│   │
│   ├── guides/                  # NEW: Consolidated guides
│   │   ├── quick-start.md
│   │   ├── contributing.md
│   │   └── data-pipeline.md
│   │
│   ├── narrative/               # Project history (existing)
│   │   ├── PROJECT_LOG.md
│   │   └── ARCHITECTURE.md      # Move to /docs/
│   │
│   └── agents/                  # AI persona docs (rename from agent-personas)
│
├── tools/                       # Development & analysis tools
│   ├── active/                  # NEW: Currently maintained
│   │   ├── dataexplorer/
│   │   └── dataviz/
│   │
│   ├── analysis/                # NEW: Move from /data-tools/
│   │   ├── r-scripts/           # R analysis (from RStudio/)
│   │   └── planning/            # Planning docs
│   │
│   └── archive/                 # NEW: Legacy/reference tools
│       ├── archive-v1/          # Original interface
│       ├── web/                 # Promotional site
│       └── byok-chat/           # Archived BYOK feature
│
├── release-assets/              # Promotional materials (existing)
│   ├── archive-launch/
│   ├── dissertation/
│   ├── promotional/
│   └── documentation/
│
└── .gitignore
```

### 2.2 Key Changes Explained

#### Create `/frontend/` directory
- Move all root-level JS/CSS files into `/frontend/`
- Update `index.html` paths or keep at root with imports from `/frontend/`
- **Rationale**: Clearer separation, standard monorepo practice

#### Rename standalone tools to `/features/`
- Better reflects that these are user-facing features, not dev tools
- Move `dissertation-reader` from `/tools/` to `/features/`
- **Rationale**: Semantic clarity for contributors

#### Create `/data/` directory
- Move `/csv/` contents to `/data/csv/`
- Add data dictionary README
- **Rationale**: Standard location for data assets

#### Reorganize `/tools/`
- Split into `active/`, `analysis/`, `archive/`
- Move R scripts from `/data-tools/RStudio/` to `/tools/analysis/r-scripts/`
- Move legacy code to `/tools/archive/`
- **Rationale**: Clear status indicators

#### Consolidate `/docs/`
- Create documentation index
- Add missing docs (DEPLOYMENT, DEVELOPMENT, API)
- Organize into subdirectories
- **Rationale**: Easier navigation

---

## Phase 3: Add Standard Public Repo Files

### 3.1 Create SECURITY.md

```markdown
# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please:

1. **Do not** open a public issue
2. Email [security contact] with details
3. Allow 48 hours for initial response

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | ✅        |

## Security Considerations

- This is a static archive with no user authentication
- No sensitive data is collected or stored
- All external dependencies loaded via CDN
```

### 3.2 Create CODE_OF_CONDUCT.md

Use Contributor Covenant v2.1 (standard for open source projects)

### 3.3 Create Issue Templates

**Bug Report Template:**
```markdown
---
name: Bug Report
about: Report a bug in the archive
---

## Description
[Clear description of the bug]

## Steps to Reproduce
1. Go to...
2. Click on...
3. See error...

## Expected Behavior
[What should happen]

## Environment
- Browser:
- Device:
- URL:
```

**Feature Request Template:**
```markdown
---
name: Feature Request
about: Suggest an enhancement
---

## Problem
[What problem does this solve?]

## Proposed Solution
[How would you implement it?]

## Alternatives Considered
[Other approaches]
```

### 3.4 Create Pull Request Template

```markdown
## Summary
[Brief description of changes]

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation
- [ ] Refactoring

## Testing
- [ ] Tested locally
- [ ] All existing tests pass

## Checklist
- [ ] Code follows project style
- [ ] Documentation updated
- [ ] No sensitive data included
```

---

## Phase 4: Documentation Consolidation

### 4.1 Files to Consolidate

| Current Location | Action |
|------------------|--------|
| `/docs/narrative/ARCHITECTURE.md` | Move to `/docs/ARCHITECTURE.md` |
| `/docs/narrative/QUICK_START.md` | Move to `/docs/guides/quick-start.md` |
| `/data-tools/planning/*.md` | Keep as reference in `/tools/analysis/planning/` |
| Multiple README files | Keep but ensure consistency |

### 4.2 Create Documentation Index

Create `/docs/README.md`:

```markdown
# Documentation

## Quick Links
- [Architecture Overview](./ARCHITECTURE.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Development Setup](./DEVELOPMENT.md)

## Guides
- [Quick Start](./guides/quick-start.md)
- [Contributing](./guides/contributing.md)
- [Data Pipeline](./guides/data-pipeline.md)

## Project History
- [Project Log](./narrative/PROJECT_LOG.md)

## AI Agents
- [Agent Personas](./agents/)
```

### 4.3 Create Missing Documentation

**DEPLOYMENT.md** - How to deploy to WordPress/static hosting
**DEVELOPMENT.md** - Local development setup
**API.md** - Backend service documentation (for data pipeline)

---

## Phase 5: Code Quality & Cleanup

### 5.1 Standardize File Naming

| Current | Proposed |
|---------|----------|
| `changelog.md` | `CHANGELOG.md` (conventional) |
| `dissertationData.js` | `dissertation-data.js` (kebab-case) |

**Note**: JS file renaming requires updating imports - consider keeping as-is for stability

### 5.2 Remove Dead Code

- Review `/future-features/` - move to `/tools/archive/` or delete
- Review `/tools/web/95/errors/` - 12 screenshot files from debugging (delete)

### 5.3 Standardize Comments

- Ensure all files have header comment with purpose
- Review TODOs (only 1 exists - already documented)

---

## Phase 6: Git History Cleanup (Optional)

### 6.1 Consider Squashing

Before going public, consider if git history should be preserved or squashed:

**Keep History (Recommended):**
- Preserves development narrative
- Shows project evolution
- Standard for open source

**Squash History:**
- Cleaner starting point
- May hide early mistakes
- Loses context

### 6.2 Git LFS Verification

Ensure all large files properly tracked:
```bash
git lfs ls-files
```

Should show:
- All `dissertation/*.pdf` files
- Any files >10MB in `/data/csv/`

---

## Implementation Order

### Week 1: Critical Cleanup
1. [ ] Remove duplicate files (Phase 1.1)
2. [ ] Resolve .gitignore inconsistencies (Phase 1.2)
3. [ ] Sensitive data audit (Phase 1.3)
4. [ ] Create SECURITY.md
5. [ ] Create CODE_OF_CONDUCT.md

### Week 2: Directory Restructure
6. [ ] Create new directory structure
7. [ ] Move files to new locations
8. [ ] Update all import paths
9. [ ] Update CLAUDE.md with new structure
10. [ ] Test all features still work

### Week 3: Documentation & Polish
11. [ ] Create issue templates
12. [ ] Create PR template
13. [ ] Write missing documentation
14. [ ] Consolidate existing docs
15. [ ] Update README.md

### Week 4: Final Review
16. [ ] Full functionality test
17. [ ] Review all documentation
18. [ ] Security audit
19. [ ] Remove debug/test artifacts
20. [ ] Final commit and tag v1.0.0

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Broken imports after restructure | High | High | Thorough testing, gradual migration |
| Missing sensitive data | Low | Critical | Automated scanning, manual review |
| Lost functionality | Medium | High | Test each feature after migration |
| Documentation gaps | Medium | Medium | Review checklist before launch |

---

## Success Criteria

Before going public, verify:

- [ ] No duplicate files
- [ ] No sensitive data in repo
- [ ] All features functional
- [ ] Documentation complete and accurate
- [ ] CLAUDE.md updated
- [ ] README welcoming to newcomers
- [ ] LICENSE file present
- [ ] SECURITY.md present
- [ ] CODE_OF_CONDUCT.md present
- [ ] Issue templates created
- [ ] All CI/CD workflows passing

---

## Alternative: Minimal Reorganization

If full restructure is too risky, here's a minimal approach:

### Minimal Changes Only
1. Remove duplicate files (saves 800KB)
2. Add SECURITY.md, CODE_OF_CONDUCT.md
3. Add issue/PR templates
4. Update README with better navigation
5. Add status badges to tools
6. Keep current directory structure

**Pros**: Lower risk, faster implementation
**Cons**: Misses opportunity for cleaner structure

---

## Appendix: File Inventory

### Files to Delete
- `/FINAL-ROSEN_DISSERTATION_THE-IMPOSSIBLE-PRESS_TRANSCRIBED.md` (duplicate)
- `/docs/CLAUDE.md` (duplicate)
- `/tools/dissertation-reader/dist/` (regeneratable)
- `/tools/web/95/errors/*.png` (debug artifacts)

### Files to Move
- Root JS/CSS files → `/frontend/`
- `/csv/` → `/data/csv/`
- `/data-tools/RStudio/` → `/tools/analysis/r-scripts/`
- `/future-features/byok-chat/` → `/tools/archive/byok-chat/`
- Standalone tools → `/features/`

### Files to Create
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/ISSUE_TEMPLATE/feature_request.md`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `/docs/DEPLOYMENT.md`
- `/docs/DEVELOPMENT.md`
- `/docs/README.md` (index)
- `/data/csv/README.md` (data dictionary)

### Files to Rename
- `changelog.md` → `CHANGELOG.md`

---

## Decision Points for Stakeholder

1. **Frontend restructure**: Move root files to `/frontend/` or keep at root?
2. **Data handling**: Keep 60MB CSV data in repo or externalize?
3. **Legacy tools**: Delete `archive-v1` or keep for reference?
4. **Git history**: Preserve full history or squash before public?
5. **Timeline**: Full restructure vs minimal cleanup?

---

*Document created: December 2025*
*Last updated: December 2025*
*Author: Claude (via Claude Code)*
