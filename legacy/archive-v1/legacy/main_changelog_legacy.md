# **Changelog Protocol & Instructions for Gemini**

## **Core Directive**

This document is the official changelog for our project. As the AI assistant, your role is to help maintain it by creating concise, structured entries. Newest entries should always be added under the current date heading.

## **Immutable Rules**

1. **Code Integrity:** You must never truncate, redact, abbreviate, or otherwise shorten the code in any file. Always provide the complete, unabridged source.  
2. **Style Preservation:** You must not deviate from the established styles (e.g., fonts, colors) provided in the original version of a file unless explicitly instructed to do so. This includes the precise Google Fonts URL, which must be treated as a constant.

## **Semi-Automatic Logging Workflow**

After we complete a significant action, you will be prompted to update this log. Upon receiving a cue like "update the log," you are to:

1. Check if a heading for the current date (YYYY-MM-DD) exists. If not, create it.  
2. Analyze our recent conversation to identify the most significant loggable event.  
3. Draft a new entry under the current date's heading using the current UTC time.  
4. Strictly adhere to the formatting rules and abbreviations defined below.

## **Entry Format**

Entries are grouped by date. Each individual entry must use the following structure:  
\[HH:MM:SS UTC\] \[ACTION\] @\[Scope\] \- \[Concise description.\] {key: value}

## **Legend & Definitions**

Action Prefixes:  
| Code | Meaning |  
| :---- | :------------ |  
| ADD | Add a new item, concept, or section |  
| MOD | Modify an existing item |  
| FIX | Correct an error or issue |  
| DEL | Remove an item or section |  
| REF | Restructure or reorganize content |  
| STY | Establish a preference or style |  
| DEC | Log a key decision |  
| DOC | Add notes or documentation |  
**Scope** Tags (Examples):

* @global: A change affecting the entire project/document  
* @objective: The main goal or purpose  
* @section-A: A specific section, topic, or chapter  
* @detail: A specific, low-level point or element  
* @style-guide: A preference related to format, tone, or style  
* @source: The source material or input  
* @output: The resulting draft or deliverable

# **Change History (Newest First)**

## **2025-10-01**

\[21:46:00 UTC\] STY @style \- Added line breaks between all changelog entries for improved readability. {reason: Squished formatting made the log difficult to parse.}

\[21:45:00 UTC\] DOC @global \- Synthesized legacy changelog with the current log for a unified project history. {details: Translated narrative-style entries into the structured format and merged chronologically.}

\[21:40:00 UTC\] FIX @style \- Corrected changelog formatting by replacing $$ timestamp delimiters with \[\]. {reason: Incorrect delimiters were causing center-alignment and line breaks due to being interpreted as math blocks.}

\[21:35:00 UTC\] DOC @global \- Performed a full review of the session and updated the changelog with detailed, granular entries to document all recent changes and fixes. {note: This update brings the changelog to a fully current state, including documenting persistent issues like font/style regressions and their resolutions.}

\[21:32:00 UTC\] FIX @feature-dashboard \- Corrected a recurring chart rendering error by making the treemap's background color callback more robust. {details: The callback now safely checks ctx.raw && ctx.raw.color to prevent crashes when intermediate data points lack a color property.}

\[21:28:00 UTC\] FIX @style-dashboard \- Removed redundant "value" title from treemap tooltips. {details: Set tooltip title callback to return an empty string.}

\[21:27:00 UTC\] FIX @style-dashboard \- Enabled color-coding for the treemap visualization based on the project's color palette. {details: Modified the backgroundColor callback to correctly pull the color from the data object.}

\[21:24:00 UTC\] FIX @style-dashboard \- Corrected infinite scroll issue on dashboard charts by restructuring layout containers. {details: Used flexbox with flex-grow and min-h-0 to properly constrain chart heights and prevent overflow.}

\[21:20:00 UTC\] FIX @data-integrity \- Implemented date-based era validation to override incorrect data from the source. {details: A new getEraFromDate function now programmatically assigns the correct era to each record during data processing, ensuring consistency.}

\[21:12:00 UTC\] FIX @style-dashboard \- Corrected treemap tooltip to display publication names and counts instead of 'null'. {details: Modified the tooltip callback and data structure to reference the correct properties (g for group/name, v for value).}

\[21:11:00 UTC\] FIX @style-dashboard \- Adjusted dashboard modal layout to correctly fill the full height of the viewport. {details: Added h-full class to modal-body and its container.}

\[21:05:00 UTC\] FIX @style \- Restored original welcome button style while correcting its font-family to inherit from the body. {reason: Previous fix incorrectly changed the button's style instead of only its font, leading to an unintended visual change.}

\[20:55:00 UTC\] REF @ui-interaction \- Differentiated in-modal tag clicks between 'search' and 'filter' actions. {details: Standardized tags like 'Era' and 'Category' now activate filters, while descriptive tags like 'Key Concepts' trigger an intelligent search.}

\[20:46:00 UTC\] REF @feature-search \- Implemented intelligent search for in-modal tags to balance focus and discovery. {details: The logic now extracts quoted phrases for an exact match and uses remaining text as flexible keywords.}

\[20:26:00 UTC\] MOD @feature-search \- Changed in-modal tag clicks from an exact-phrase search to a keyword search. {reason: Improves discovery for multi-word tags like those in 'Responds To'.}

\[17:22:00 UTC\] FIX @style-dashboard \- Made the data dashboard layout responsive. {details: Adjusted flexbox and grid classes to stack elements vertically on mobile and tablet screens.}

\[17:15:00 UTC\] FIX @feature-dashboard \- Corrected treemap rendering error by making the background color callback more robust. {details: Changed callback from ctx.raw.g.color to ctx.raw && ctx.raw.color to prevent crash.}

\[17:14:00 UTC\] FIX @global \- Restored missing function definitions for renderModalContent and populateFilters. {details: Functions were accidentally replaced with comments in a previous update.}

\[17:10:00 UTC\] REF @feature-dashboard \- Overhauled the data visualization dashboard with an interactive, filterable interface. {details: Added date slider, category filters, key stats, a thematic focus over time chart, and a publication treemap.}

## **2025-09-30**

\[17:57:00 UTC\] ADD @feature \- Implemented a data visualization dashboard with charts for articles by year, top categories, and top publications. {file: ROSEN FRONTEND.html}

\[16:50:00 UTC\] FIX @feature \- Corrected SecurityError by replacing History API with window.location.hash for URL updates. {file: ROSEN FRONTEND.html}

\[16:49:00 UTC\] DEL @feature \- Reverted and shelved the "Share this View" functionality. {file: ROSEN FRONTEND.html}

\[16:45:00 UTC\] ADD @feature \- Implemented "Share this View" button to generate a URL with all active search and filter parameters. {file: ROSEN FRONTEND.html}

\[16:44:00 UTC\] ADD @ui \- Replaced initial loading spinner with a skeleton screen for improved perceived performance. {file: ROSEN FRONTEND.html}

\[16:43:00 UTC\] MOD @ui \- Polished modal open/close animations to be smoother and less jarring. {file: ROSEN FRONTEND.html}

\[16:35:00 UTC\] ADD @feature \- Added a 'Share' button to the record modal to copy a direct link to the item. {file: ROSEN FRONTEND.html}

\[16:32:00 UTC\] DOC @global \- Updated 'Immutable Rules' to explicitly mention preserving the exact Google Fonts URL. {file: changelog.md}

\[16:28:00 UTC\] FIX @style \- Corrected Google Fonts URL to include specific weights, restoring original font rendering. {file: ROSEN FRONTEND.html}

\[16:25:00 UTC\] REF @feature \- Removed Dark Mode feature entirely to resolve font/style conflicts. {file: ROSEN FRONTEND.html}

\[16:24:00 UTC\] DOC @global \- Added 'Immutable Rules' to changelog protocol regarding code integrity and style preservation. {file: changelog.md}

\[16:20:00 UTC\] STY @feature \- Set default theme to light mode, ignoring system preference. {file: ROSEN FRONTEND.html}

\[16:19:00 UTC\] FIX @style \- Reverted fonts on welcome button and sort notification to standard body font. {file: ROSEN FRONTEND.html}

\[16:15:00 UTC\] ADD @feature \- Implemented a light/dark mode theme toggle with localStorage persistence. {file: ROSEN FRONTEND.html}

## **2025-09-26**

\[16:12:00 UTC\] MOD @ui \- Enhanced 'No Results' message to include a 'Reset All Filters' button. {file: ROSEN FRONTEND.html}

\[16:09:00 UTC\] ADD @ui \- Added a pop-up notification to confirm sort order changes. {file: ROSEN FRONTEND.html}

\[16:08:00 UTC\] ADD @ui \- Implemented active filter count badge on the 'Filters & Sort' button. {file: ROSEN FRONTEND.html}

\[16:05:00 UTC\] ADD @ui \- Implemented a "Scroll to Top" button that appears on scroll. {file: ROSEN FRONTEND.html}

\[16:04:00 UTC\] DOC @global \- Session initialized and changelog created. {usage\_examples: "ADD for new items; MOD for changes; FIX for corrections; DEL for removals; REF for restructuring; STY for preferences; DEC for decisions; DOC for notes."}

## **2025-09-24**

\[15:30:00 UTC\] DOC @global \- Documented the final application logic from the initial development phase. {details: Covered data source, processing pipeline, state management, and rendering core.}

\[15:29:00 UTC\] DEL @ui \- Removed experimental 'Era Filter Bar' from the main UI based on user feedback. {reason: Cluttered the interface.}

\[15:28:00 UTC\] DEC @feature-search \- Decided to make the new 'smart search' the default, without a toggle. {reason: Cleaner UI.}

\[15:27:00 UTC\] REF @feature-search \- Replaced simple text search with a robust, relevance-based engine. {details: Implemented scoring weights, multi-keyword search, and Levenshtein fuzzy matching.}

\[15:26:00 UTC\] ADD @feature-navigation \- Added next/previous buttons and keyboard arrow navigation within the record modal. {file: ROSEN FRONTEND.html}

\[15:25:00 UTC\] REF @ui-interaction \- Refactored filtering to apply in real-time on input change, removing the 'Apply' button. {file: ROSEN FRONTEND.html}

\[15:24:00 UTC\] ADD @feature-filter \- Added filters for top 7 publications and collection IDs. {file: ROSEN FRONTEND.html}

\[15:23:00 UTC\] MOD @style \- Increased the width of the filter sidebar for better readability. {file: ROSEN FRONTEND.html}

\[15:22:00 UTC\] FIX @data \- Improved tag parsing to ignore and strip raw Google Sheet formulas. {file: ROSEN FRONTEND.html}

\[15:21:00 UTC\] MOD @data \- Filtered records to only display items marked as 'verified'. {file: ROSEN FRONTEND.html}

\[15:20:00 UTC\] ADD @global \- Added specific error handling for unpublished Google Sheets. {file: ROSEN FRONTEND.html}

\[15:19:00 UTC\] FIX @data \- Updated Google Sheet URL to the correct pub?output=csv link. {reason: Initial URL was an edit link, causing fetch errors.}

\[15:18:00 UTC\] DEC @feature-filter \- Chose 'Advanced Filtering Drawer' approach for new filter UI. {file: ROSEN FRONTEND.html}

\[15:17:00 UTC\] ADD @feature-filter \- Implemented slide-out filter drawer with sort, category, era, and content type controls. {file: ROSEN FRONTEND.html}

\[15:16:00 UTC\] REF @ui \- Replaced text-based accordion toggle with an animated arrow icon. {file: ROSEN FRONTEND.html}

\[15:15:00 UTC\] MOD @style \- Expanded color palette to reduce tag color collisions. {file: ROSEN FRONTEND.html}

\[15:14:00 UTC\] STY @ui \- Italicized the pull quote text in the modal. {file: ROSEN FRONTEND.html}

\[15:13:00 UTC\] MOD @ui \- Made record title in modal a clickable link to the source URL. {file: ROSEN FRONTEND.html}

\[15:12:00 UTC\] ADD @ui \- Converted long tag lists in modal to collapsible accordions. {file: ROSEN FRONTEND.html}

\[15:11:00 UTC\] MOD @ui \- Display only the first thematic category on record cards. {file: ROSEN FRONTEND.html}