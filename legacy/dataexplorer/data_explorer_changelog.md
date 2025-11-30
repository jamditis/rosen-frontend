## **Project changelog: Interactive record explorer**

| Version | Date | Change Type | Description |
| :---- | :---- | :---- | :---- |
| 1.0.0 | 2025-09-01 | Initial commit | Core feature implementation: dot grid, basic click/details panel, initial path drawing (Manhattan distance). |
| 1.0.1 | 2025-09-02 | Feature | Dot colors now determined by a specific Google Sheet column (Category). Added basic color key/legend. |
| 1.1.0 | 2025-09-04 | Feature | Implemented "Exploration mode": Locked view state, fading unrelated dots, and dedicated Reset View button. |
| 1.2.0 | 2025-09-05 | Feature | Added complexity to paths: Variable speed animation (600ms \- 1400ms) and circuitous zig-zag paths. Paths colored by connected record's category. |
| 1.2.1 | 2025-09-06 | Fix/bug | Fixed ReferenceError: current1 is not defined in drawManhattanPath (typo fix). |
| 1.3.0 | 2025-09-07 | Enhancement | Path Tooltip added: Mouseover any animated line to see its connection category. Increased animation duration to 1.2s \- 2.8s. |
| 1.3.1 | 2025-09-08 | Enhancement | Renamed Reset button to "Clear the board". Implemented reset-on-empty-canvas-click functionality. |
| 1.3.2 | 2025-09-09 | Enhancement | Dots now smoothly increase by 50% on mouse hover for tactile feedback. |
| 1.4.0 | 2025-09-10 | Feature/fix | Integrated PapaParse and live Google Sheet data. Fixed data parsing logic to correctly identify all verified records. Grid layout fixed to prevent dot movement on click. |
| 1.5.0 | 2025-09-11 | Feature | Implemented Dynamic Grid Max: Grid starts at 441 dots and expands to 625 via a clickable bar. |
| 1.5.1 | 2025-09-12 | Fix/aesthetic | Fixed dot placement/spacing issues. Set grid container/Canvas to fixed 1200px height to ensure path spacing and stable coordinates. |
| 1.6.0 | 2025-09-13 | Feature | Path Recalibration: Path turns now snap precisely to the X/Y coordinates of existing dots on the grid (following "lanes"). Set max visible connections to 15\. |
| 1.6.1 | 2025-09-14 | Layout/UI | Redesigned controls: Moved "Clear the board" and expand bar below the grid. Added blue "View record source" button to the info panel. |
| 1.6.2 | 2025-09-15 | UI/enhancement | Dot Hover Tooltip implemented: Displays date (small), title (large), and first 3 tags. |
| 1.7.0 | 2025-09-16 | Data logic | Unified Connection Field: Connections and dot colors are now both based on the primary shared key\_concepts to ensure relevance and visual consistency. |
| 1.8.0 | 2025-09-17 | Layout/feature | Major Redesign: Grid is now full-width. Sidebar converted to floating 30vh footer panel with minimize/maximize controls. Added Dynamic Connection Field dropdown to header. |
| 1.9.0 | 2025-09-18 | Performance/UI | Added Background Loading/Tutorial Modal to mask load times. |
| 1.9.1 | 2025-09-19 | Fix/bug | Fixed loading modal bug where it wouldn't dismiss after data finished loading if button was clicked early. |
| 1.9.2 | 2025-09-20 | Fix/bug | Fixed ReferenceError: checkLineHit is not defined by making the function globally accessible. Fixed multiple SyntaxError: Identifier '...' has already been declared by removing duplicated function definitions. |
| 2.0.0 | 2025-10-12 | Final polish | Sorting: Dot grid is now sorted by publication\_date (earliest to most recent). Added thorough, redundant code comments for improved adjustability. |
| 2.1.0 | 2025-10-12 | Layout/UI | Info panel UI cleanup: Consolidated header, moved buttons, removed redundancy. Added full metadata display (Title, Author/Date/Source, Quote, Era, Summary, Concepts, Tags) and dedicated Connected Records List (max-h-96, date sorted). |
| 2.1.1 | 2025-10-12 | UI/aesthetic | Panel Controls: Added visual icons (X, \-, ^) to the close, minimize, and maximize buttons. |
| 2.1.2 | 2025-10-12 | Fix/UI | Fixed maximize panel transition to unfold smoothly from the bottom. |
| 2.1.3 | 2025-10-12 | Fix/bug | Fixed ReferenceError in connected records list by exposing records array globally as window.records. |
| 2.1.4 | 2025-10-12 | Data logic | Improved CSV data parsing for key\_concepts to ensure multi-item fields are correctly split by commas and semicolons, enabling accurate connections. |
| 2.2.0 | 2025-10-12 | Feature/UI | Collapsible color key: Added as a standalone, absolutely positioned element below the main header. Header consolidation: Moved record count status next to the main title. |
| 2.2.1 | 2025-10-12 | Fix/UI | Fixed color key and tooltip positioning to correctly track the cursor position even when the page is scrolled. |
| 2.3.0 | 2025-10-12 | Data logic | Improved line coloring: Lines are now dynamically colored based on the actual *shared value* (concept/category) that forms the connection, instead of just the target dot's color. Tooltip updated to display the shared value. |
| 2.4.0 | 2025-10-12 | Feature/UI | Line hover dimming: Implemented visual dimming (25% opacity) of all non-hovered lines/dots when the user hovers over an active connection path. |
| 2.4.1 | 2025-10-12 | Fix/bug | Animation loop stability: Fixed bug where line hover effects stopped working after the path animation completed by forcing the animate() loop to run continuously while in Exploration Mode. |
| 2.4.2 | 2025-10-12 | Fix/bug | Permanent line hover fix: Ensured the Canvas animation loop remains active indefinitely whenever the view is locked (in exploration mode), guaranteeing continuous line hover functionality regardless of the initial path animation status. |
| 2.5.0 | 2025-10-13 | Data resilience | Added remote→local CSV fallback (`RosenArchivedataset-TEST-DATA.csv`) so the explorer loads even when the Google Sheet is offline; updated parsing to align with the main explorer. |
