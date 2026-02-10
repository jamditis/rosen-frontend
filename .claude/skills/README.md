# Claude Code Skills for Jay Rosen Internet Archive

This directory contains specialized skills for Claude Code to assist with development, deployment, and maintenance of the Jay Rosen Internet Archive.

## Available Skills

| Skill | Purpose | Use When |
|-------|---------|----------|
| **zero-build-frontend** | React development without build tools | Creating/modifying components, debugging imports |
| **dissertation-tool-generator** | Create new dissertation features | Building new interactive tools |
| **data-pipeline** | Backend workflow orchestration | Running data imports, entity extraction |
| **archive-validation** | Data quality checking | Before deployment, after imports |
| **deployment-manager** | Path and environment management | Preparing for production deployment |
| **version-manager** | Cache busting version strings | Updating versions, debugging cache issues |
| **archive-code-review** | Domain-specific code review | Reviewing PRs, auditing code |

## Skill Dependency Graph

```
                    ┌─────────────────────┐
                    │  zero-build-frontend │ (Foundation)
                    └──────────┬──────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
┌──────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ dissertation-    │ │ version-manager │ │ deployment-     │
│ tool-generator   │ │                 │ │ manager         │
└────────┬─────────┘ └────────┬────────┘ └────────┬────────┘
         │                    │                   │
         └────────────────────┼───────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │  archive-validation  │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
                    ▼                     ▼
          ┌─────────────────┐   ┌──────────────────┐
          │  data-pipeline  │   │ archive-code-    │
          │                 │   │ review           │
          └─────────────────┘   └──────────────────┘
```

## How Skills Work

Skills are loaded into Claude Code's context when relevant tasks are detected. Each skill provides:

1. **Domain expertise** - Specific knowledge about this codebase
2. **Patterns** - Established conventions to follow
3. **Workflows** - Step-by-step procedures
4. **Checklists** - Quality gates and validation

## Skill Format

Each skill follows a standard structure:

```yaml
---
name: skill-name
description: Brief description. Use when [trigger conditions].
---

# Skill Title

## When to Activate
[Specific triggers for this skill]

## Core Content
[Domain knowledge, patterns, workflows]

## Integration
[Related skills]

---
## Skill Metadata
**Created**: YYYY-MM-DD
**Author**: Claude Code
**Version**: X.X.X
```

## Adding New Skills

1. Create a new `.md` file in this directory
2. Follow the format above
3. Document integration with existing skills
4. Update this README

## Design Principles

These skills follow the "4 Core Truths" from context engineering:

| Principle | Application |
|-----------|-------------|
| **Expertise Transfer** | Make Claude think like an archive developer, not follow instructions |
| **Flow, Not Friction** | Produce deployable output, not intermediate documents |
| **Voice Matches Domain** | Sound like a practitioner of this specific codebase |
| **Focused Over Comprehensive** | Every section earns its place through utility |

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-25 | Initial skill set (7 skills) |

## References

- [CLAUDE.md](/CLAUDE.md) - Main project instructions
- [Agent Skills for Context Engineering](https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering) - Inspiration and patterns
