# Changelog

All notable changes to the Jay Rosen Internet Archive Windows 95 Interface will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Ready for Deployment - 2025-10-20

**Files to Upload:**
- `index.html` (cache version: `?v=3`)
- `index.js` (37,935 bytes - verify file size on upload)
- `CHANGELOG.md` (this file)

**Testing Checklist:**
- [ ] Archive Explorer displays apps and collections folder with icons
- [ ] Collection folders show category icons when opened
- [ ] Individual record files display with proper icons
- [ ] Impossible Press opens Google Doc in new tab (not window)
- [ ] Window management working (no cascade on close)
- [ ] Taskbar buttons match window titles
- [ ] Browser cache cleared to load new version

### Fixed - 2025-10-20

#### Window Management System Overhaul
**Issue #1**: Fixed window closing behavior that was causing all windows to open in succession
- **Root Cause**: Window activation logic was incorrectly querying for visible windows using inline styles only, which could miss windows in various display states
- **Solution**:
  - Refactored `closeApp()` to use the `openWindowStack` array for finding the next window to activate
  - Added explicit removal of `active` class when closing windows to prevent CSS display override conflicts
  - Changed window activation logic to verify window visibility before bringing to front
- **Impact**: Windows now close cleanly without triggering unintended window opens

#### Individual Taskbar Buttons for All Windows
**Issue #2**: Each window instance now gets its own taskbar button when minimized
- **Previous Behavior**: All instances of the same app type (e.g., multiple record viewers) shared a single taskbar button
- **New Behavior**: Each window gets a unique taskbar button with its own title and controls
- **Changes**:
  - Modified `openApp()` to create taskbar buttons using `windowId` instead of `appName`
  - Updated `bringToFront()` to manage taskbar button states per window instance
  - Created new `minimizeWindow(windowId)` function to replace app-level `minimizeApp(appName)`
  - Each taskbar button now includes the window's title (e.g., specific record name for record viewers)
  - Taskbar buttons can independently minimize/restore their associated window
- **Benefits**:
  - Users can distinguish between multiple open records
  - Individual windows can be minimized and restored independently
  - Better matches Windows 95 expected behavior for multi-document interface apps

#### Collection Record Icons
**Issue #3**: Fixed broken image display in collection folders
- **Problem**: Record icons were using CSS `background-image` approach (div with class `icon-image`) which was not displaying images
- **Root Cause**: Inconsistency in icon rendering - all other file explorer icons use `<img>` tags, but collection records used CSS backgrounds
- **Solution**: Changed `populateCollectionViewer()` to use `<img>` tags with direct `src` attribute pointing to `https://win98icons.alexmeub.com/icons/png/web_file-3.png`
- **Result**: Record icons now display correctly and match the styling of other file explorer items

### Technical Details

#### Modified Functions
- `closeApp(windowId)`: Complete rewrite for safer window closing and taskbar cleanup
- `bringToFront(windowElement)`: Updated to use `windowId` for taskbar button management
- `openApp(appName, options)`: Enhanced taskbar button creation with per-instance titles
- `minimizeWindow(windowId)`: New function replacing app-level minimize functionality
- `setupWindowMouseEvents(windowElement)`: Updated minimize button handler
- `populateCollectionViewer(windowElement, category)`: Changed icon rendering from CSS background to `<img>` tags

#### Data Structure Changes
- `openApps` Map now keys by `windowId` instead of `appName`
- Taskbar buttons now have unique IDs: `taskbar-${windowId}`
- Taskbar button click handlers operate on specific window instances

#### Deployment Information
- **Live URL**: https://centerforcooperativemedia.org/wp-content/amditis/rosen/95/index.html
- **Deployment Method**: Direct FTP upload
- **Browser Compatibility**: Modern browsers with ES2022 support required

#### Impossible Press Content Loading
**Issue #4**: Fixed Impossible Press text not loading when opened from desktop
- **Root Cause**: `loadImpossiblePressContent()` was querying the document globally instead of within the specific window instance
- **Solution**:
  - Modified function to accept `windowElement` parameter
  - Changed selector from `document.getElementById()` to `windowElement.querySelector()`
  - Updated function call in `openApp()` to pass the window element
- **Impact**: Impossible Press content now loads correctly when opened from any location

#### Taskbar Button Naming
**Issue #5**: Fixed taskbar button names to match window titles
- **Problem**: Taskbar buttons showed generic names (e.g., "recordViewer") instead of specific window titles (e.g., record name)
- **Root Cause**: Taskbar buttons were created before window content was populated, so titles weren't available yet
- **Solution**:
  - Created new `updateTaskbarButtonText(windowId, newTitle)` helper function
  - Added calls to update button text at end of `populateRecordViewer()` and `populateCollectionViewer()`
  - Taskbar buttons now dynamically update to match actual window content
- **Benefits**:
  - Users can identify windows by their actual titles in the taskbar
  - Better UX when multiple record/collection viewers are open

#### CSS Display Override Fix
**Issue #6**: Fixed `.window.active` CSS class causing display conflicts
- **Problem**: CSS rule `.window.active { display: flex }` was overriding inline `display: none` styles
- **Root Cause**: CSS specificity caused active class to force windows to display even when minimized
- **Solution**: Removed `display: flex` declaration from `.window.active` class in index.html
- **Impact**: Window display state is now fully controlled by inline styles without CSS interference

#### Hardcoded Icon URLs
**Issue #7**: Simplified icon management by using hardcoded icon map
- **Problem**: Archive Explorer was showing empty content after deployment, icons were being looked up dynamically from DOM
- **Root Cause**: Dynamic icon lookup from desktop/start menu elements was unreliable in some scenarios
- **Solution**:
  - Created `APP_ICONS` constant at top of index.js with all icon URLs mapped
  - Updated `renderExplorerContent()` to use hardcoded apps array with icon URLs
  - Updated collection category folder icons to use `APP_ICONS.categoryFolder`
  - Updated collection record icons to use `APP_ICONS.recordFile`
- **Benefits**:
  - More reliable icon rendering
  - Easier to maintain and modify icons
  - Single source of truth for all icon URLs
  - Resolves Archive Explorer empty content issue

#### Impossible Press Opens in New Tab
**Issue #8**: Changed Impossible Press to open Google Doc in new tab instead of window
- **Problem**: Impossible Press markdown file had slow load time when displayed in window
- **User Requirement**: Open dissertation directly in Google Docs for better performance
- **Solution**:
  - Updated `IMPOSSIBLE_PRESS_URL` constant to point to Google Docs URL: `https://docs.google.com/document/d/1OHTatfz57Oxcn1YbWHJ6smpWmRpwrWChlbtaO46Q3i0/edit?usp=sharing`
  - Modified `openApp()` function to detect 'impossiblePress' and call `window.open()` with new tab instead of creating window
  - Removed obsolete `loadImpossiblePressContent()` call from window initialization code
  - Kept `loadImpossiblePressContent()` function in codebase for potential future use
- **Benefits**:
  - Instant access to dissertation without loading delays
  - Leverages Google Docs' superior document viewing features
  - Opens in new tab with `noopener,noreferrer` for security

### Known Issues
- ~~Icon URL defaulting to template_wordpad-0.png instead of explicitly set icons~~ (RESOLVED - Issue #7)

### Future Enhancements
- Consider adding window cascade/tile functionality
- Add keyboard shortcuts for window management (Alt+F4, Alt+Tab, etc.)
- Implement window state persistence across sessions
