# Security Policy

## Reporting a Vulnerability

The Jay Rosen Internet Archive takes security seriously. If you discover a security vulnerability, please follow responsible disclosure practices:

### How to Report

1. **Do not** open a public GitHub issue for security vulnerabilities
2. Email security concerns to the repository maintainer
3. Include as much detail as possible:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Resolution Target**: Within 30 days (depending on severity)

## Scope

This security policy applies to:

- The main archive application (`/frontend/`)
- All feature tools (`/features/`)
- The backend data pipeline (`/backend/`)
- Any deployed instances of the archive

## Security Considerations

### What This Project Does NOT Handle

This is a **static archive** with minimal security surface:

- **No user authentication** - The archive is publicly accessible
- **No user data collection** - No forms, accounts, or personal data storage
- **No server-side processing** - Frontend is entirely client-side
- **No database** - Data is served from static CSV/JSON files

### What We Do Protect

- **Data integrity** - Archive content should not be tampered with
- **External dependencies** - CDN-loaded libraries should be from trusted sources
- **API keys** - Backend pipeline credentials must remain secure

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Known Limitations

- The archive loads external dependencies via CDN (React, Tailwind, etc.)
- The backend uses third-party APIs (Google Sheets, Gemini AI)
- Historical data in the archive is for research purposes only

## Acknowledgments

We appreciate responsible security researchers who help keep this project safe. Contributors who report valid security issues will be acknowledged (with permission) in our documentation.
