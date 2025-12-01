# Future Features

This directory contains features that have been developed but are not currently active in the production archive. These are preserved for potential future implementation.

## BYOK Chat (`/byok-chat/`)

**Status:** Archived (December 2025)

An interactive chat interface that allows users to explore Jay Rosen's dissertation using their own Claude API key (BYOK = Bring Your Own Key).

### Files
- `chat.html` - Chat interface page
- `chat.js` - Chat functionality and Claude API integration

### Why Archived
This feature was removed from the active FAQ section to simplify the user experience for the initial December 2025 dissertation release. The BYOK approach requires users to have their own Anthropic API key, which limits accessibility.

### To Reactivate
1. Move `chat.html` and `chat.js` back to `/faq/`
2. Restore the BYOK modal HTML to `/faq/index.html`
3. Restore the BYOK JavaScript handlers to `/faq/script.js`
4. Update documentation in CLAUDE.md and README.md

### Notes
- The chat functionality works with Claude Sonnet and includes a system prompt with dissertation context
- API calls go directly from the browser to Anthropic's API (client-side only)
- User API keys are stored in localStorage
