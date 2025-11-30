# Jay Rosen Digital Archive (JRDA)

A curated, interactive public collection of the works, critiques, and teachings of NYU Professor Jay Rosen. This application serves as a frontend interface to explore decades of journalism scholarship, utilizing a lightweight architecture powered by Google Sheets as a Content Management System (CMS).

![Archive Preview](https://i.imgur.com/iaBrkg8.png)

## 🏗️ Zero-Build Architecture

**Important Note for Developers:**
This project uses a **zero-build static architecture** designed for simple deployment to any web host via FTP—including WordPress subdirectories.

### Tech Stack
*   **Files:** `*.js` (ES Modules), `*.html`, `*.css`
*   **Stack:** React (via CDN), `htm` (for JSX-like syntax in plain JS), Tailwind CSS (via CDN)
*   **Dependencies:** All loaded via `esm.sh` CDN—no `node_modules` required

### Why Zero-Build?
*   **No build step required.** No `npm run build`, Webpack, or Vite. Simply upload files and it works.
*   **WordPress compatible.** Can be deployed to any WordPress domain by uploading to a subdirectory.
*   **Universal hosting.** Works on any static web host (Apache, Nginx, GitHub Pages, Netlify, etc.)
*   **Simple deployment.** Upload `.js`, `.css`, and `.html` files via FTP and you're done.

---

## 🌟 Key Features

### 🗂️ Browsing & Discovery
*   **Smart Filtering:** Filter records by Era (90s, 00s, 10s, 20s), Media Type (Article, Video, Social), Publication, and Thematic Categories.
*   **Full-Text Search:** Instant search across titles, summaries, and concepts with keyword highlighting.
*   **Interactive Timeline:** A dynamic bar-chart visualization allowing users to filter the dataset by specific years.

### 🕸️ The Explorer (Network Visualization)
*   **Interactive Graph:** A canvas-based visualization that maps relationships between articles based on shared Key Concepts and Categories.
*   **Manhattan Routing:** Aesthetic connection paths inspired by subway maps to visualize intellectual lineage.
*   **Export Capabilities:** Users can generate and download high-resolution PNG cards of specific records or the entire network graph for social sharing.

### 📜 Dissertation Presentation Tools
*   **Interactive Mind Map:** Left-to-right tree visualization of the 1986 dissertation's chapters and key arguments. Features auto-fit zooming, expand/collapse all, keyboard navigation, and touch support.
*   **"Then and Now" Comparison Tool:** Side-by-side presentation of 1986 dissertation insights alongside 2025 media realities. (`/comparison-tool/`)
*   **Glossary:** Interactive visual glossary of key concepts with definitions, connections, and contemporary relevance. (`/glossary/`)
*   **1986 in Journalism:** Historical context page showing the media landscape when the dissertation was written. (`/context-1986/`)
*   **Timeline:** Visual timeline tracing how dissertation ideas evolved through 40 years of work. (`/timeline/`)
*   **Annotated Excerpts:** Key passages with original context, 2025 reflections, and contemporary examples. (`/annotated-excerpts/`)
*   **FAQ / Ask the Dissertation:** Searchable Q&A database with 46 pre-generated answers, plus BYOK (Bring Your Own Key) Claude chat. (`/faq/`)

### ♿ Accessibility
*   **Keyboard Navigation:** Full keyboard support for mind map (arrow keys to pan, +/- to zoom, ESC to close panels)
*   **Screen Reader Support:** ARIA labels, roles, and live regions for all interactive elements
*   **Focus Management:** Visible focus indicators and automatic focus management for dialogs
*   **Touch Support:** Mobile-optimized touch targets (44px+) and touch-based panning
*   **Responsive Design:** All tools work across mobile, tablet, and desktop devices

---

## 🚀 Quick Start (Local)

Because the production version uses a "no-build" architecture, you do not need `npm` or `node_modules` to run the application logic locally.

### Prerequisites
*   A modern web browser (Chrome, Firefox, Safari, Edge).
*   A local static server (to avoid CORS issues with ES modules).

### Running the App

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/jay-rosen-archive.git
    cd jay-rosen-archive
    ```

2.  **Start a static server:**
    *   **Python:** `python -m http.server 8000`
    *   **Node (npx):** `npx serve .`
    *   **VS Code:** Use the "Live Server" extension.

3.  **Open the app:**
    Navigate to `http://localhost:8000`.

---

## 📊 Data Management (Google Sheets)

The application content is populated dynamically via CSV exports from a Google Sheet. The configuration is located in `constants.js`.

### 1. Sheet Structure
Your Google Sheet must have a tab with the following columns (headers are case-insensitive):

| Column Header | Description |
| :--- | :--- |
| `ID` | Unique identifier (e.g., `art-001`) |
| `Title` | Title of the work |
| `Author` | Author name (defaults to Jay Rosen) |
| `Publication_Date` | Format: `YYYY-MM-DD` |
| `Original_Publication`| Publisher name (e.g., PressThink, Twitter) |
| `URL` | Link to the source material |
| `Summary` | Brief description or abstract |
| `Thematic_Categories`| Comma-separated list (e.g., `Public Journalism, Trust`) |
| `Key_Concepts` | Comma-separated list (e.g., `View from Nowhere`) |
| `Verified` | `TRUE` or `FALSE`. Only TRUE records are displayed. |

### 2. Publishing the Data
1.  Open your Google Sheet.
2.  Go to **File > Share > Publish to web**.
3.  Select the tab (e.g., "Test Runs") and format **Comma-separated values (.csv)**.
4.  Click **Publish** and copy the link.

### 3. Updating Configuration
Update `constants.js` with your new URL:

```javascript
export const DATA_CONFIG = {
    test_runs: 'YOUR_GOOGLE_SHEET_CSV_URL_HERE',
    // ...
};
```

### 4. Performance Optimization (Caching)

To improve loading times, the application automatically caches fetched CSV data in the browser's localStorage:

*   **Cache Duration:** 1 hour (configurable via `CACHE_TTL_MS` in `archiveService.js`)
*   **Cache Version:** Increment `CACHE_VERSION` to invalidate all existing caches
*   **Manual Cache Clear:** Open browser console and run:
    ```javascript
    import { clearArchiveCache } from './services/archiveService.js';
    clearArchiveCache();
    ```

**Benefits:**
*   Subsequent page loads are nearly instantaneous (data loaded from cache)
*   Reduces load on Google Sheets servers
*   Better user experience, especially for repeat visitors

**Note:** Cache is automatically invalidated after 1 hour or when `CACHE_VERSION` is incremented.

---

## 📂 Project Structure

```text
├── components/
│   ├── Explorer.js               # Network visualization
│   ├── FeaturedSection.js        # Carousel highlights
│   ├── RecordModal.js            # Detail view overlay
│   ├── Sidebar.js                # Filters and search
│   ├── DissertationPage.js       # Dissertation view container
│   ├── MindMap.js                # Interactive mind map
│   ├── DetailPanel.js            # Dissertation node details
│   ├── dissertationData.js       # Full dissertation content
│   └── ...
├── services/
│   └── archiveService.js         # Data fetching & parsing
├── comparison-tool/              # "Then and Now" comparisons
│   ├── index.html, styles.css, script.js, data.js
├── glossary/                     # Interactive concept glossary
│   ├── index.html, script.js, data.js
├── context-1986/                 # Historical context
│   ├── index.html, script.js, data.js
├── timeline/                     # Dissertation → later work timeline
│   ├── index.html, script.js, data.js
├── annotated-excerpts/           # Key passages with commentary
│   ├── index.html, script.js, data.js
├── faq/                          # FAQ + BYOK Chat
│   ├── index.html, script.js, data.js, chat.html, chat.js
├── shared-styles.css             # Common styles for all tools
├── App.js                        # Main application controller
├── constants.js                  # Config (Sheet URLs, Colors)
├── html.js                       # HTM helper for JSX-like syntax
├── index.html                    # Entry point
└── index.css                     # Global styles
```

---

## 🛠️ Deployment

### Web Hosting (FTP / Netlify / GitHub Pages / WordPress)
1.  Upload **all files** (`.html`, `.css`, `.js` files, and the `components/` and `services/` folders) to your web host.
2.  For WordPress: upload to a subdirectory (e.g., `/archive/`) via FTP.
3.  Ensure your server serves `.js` files with the MIME type `application/javascript`.

That's it—no build step required.

---

**Curated by Joe Amditis.**
