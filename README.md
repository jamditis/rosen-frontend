# Jay Rosen Digital Archive (JRDA)

A curated, interactive public collection of the works, critiques, and teachings of NYU Professor Jay Rosen. This application serves as a frontend interface to explore decades of journalism scholarship, utilizing a lightweight architecture powered by Google Sheets as a Content Management System (CMS).

![Archive Preview](https://i.imgur.com/iaBrkg8.png)

## 🏗️ Dual-Architecture Overview

**Important Note for Developers:**
This project is unique in that it maintains **two paired versions** of the application logic within the same repository. This structure allows for robust development in AI-assisted environments while ensuring the final product can be deployed to any static web host (via FTP) without a build process.

### 1. The TypeScript Version (Development)
*   **Files:** `*.tsx`, `*.ts`
*   **Purpose:** Used for editing, type-checking, and previewing within environments like **Google AI Studio** or modern IDEs.
*   **Stack:** React, TypeScript, Tailwind CSS.
*   **Benefit:** Provides strong typing and better developer tooling during the creation phase.

### 2. The Vanilla JS Version (Production / FTP)
*   **Files:** `*.js` (using ES Modules)
*   **Purpose:** Designed for immediate deployment to standard web hosting (Apache/Nginx) via FTP or GitHub Pages.
*   **Stack:** React (via CDN), `htm` (for JSX-like syntax in plain JS), Tailwind CSS (via CDN).
*   **Benefit:** **Zero-Build System.** No `npm run build`, Webpack, or Vite is required. You simply upload the `.js`, `.css`, and `index.html` files to a server, and it works.

> **Current Configuration:** The `index.html` file is currently configured to load the **JS Version** (`src="./index.js"`).

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
*   **Interactive Mind Map:** Tree-structured visualization of the 1986 dissertation's chapters and key arguments.
*   **"Then and Now" Comparison Tool:** Side-by-side presentation of 1986 dissertation insights alongside 2025 media realities. (`/comparison-tool/`)
*   **Glossary:** Interactive visual glossary of key concepts with definitions, connections, and contemporary relevance. (`/glossary/`)
*   **1986 in Journalism:** Historical context page showing the media landscape when the dissertation was written. (`/context-1986/`)
*   **Timeline:** Visual timeline tracing how dissertation ideas evolved through 40 years of work. (`/timeline/`)
*   **Annotated Excerpts:** Key passages with original context, 2025 reflections, and contemporary examples. (`/annotated-excerpts/`)
*   **FAQ / Ask the Dissertation:** Searchable Q&A database with 25+ pre-generated answers, plus BYOK (Bring Your Own Key) Claude chat. (`/faq/`)

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

The application content is populated dynamically via CSV exports from a Google Sheet. The configuration is located in `constants.js` (for production) and `constants.ts` (for dev).

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
Update `constants.js` (and `constants.ts`) with your new URL:

```javascript
export const DATA_CONFIG = {
    test_runs: 'YOUR_GOOGLE_SHEET_CSV_URL_HERE',
    // ...
};
```

### 4. Performance Optimization (Caching)

To improve loading times, the application automatically caches fetched CSV data in the browser's localStorage:

*   **Cache Duration:** 1 hour (configurable via `CACHE_TTL_MS` in `archiveService.js/ts`)
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
│   ├── Explorer.js / .tsx        # Network visualization
│   ├── FeaturedSection.js / .tsx # Carousel highlights
│   ├── RecordModal.js / .tsx     # Detail view overlay
│   ├── Sidebar.js / .tsx         # Filters and search
│   ├── DissertationPage.js       # Dissertation view container
│   ├── MindMap.js                # Interactive mind map
│   ├── DetailPanel.js            # Dissertation node details
│   ├── dissertationData.js       # Full dissertation content
│   └── ...
├── services/
│   └── archiveService.js / .ts   # Data fetching & parsing
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
├── App.js / .tsx                 # Main application controller
├── constants.js / .ts            # Config (Sheet URLs, Colors)
├── html.js                       # HTM helper (JS version only)
├── index.html                    # Entry point
└── types.ts                      # Type definitions (TS version only)
```

---

## 🛠️ Deployment

### Web Hosting (FTP / Netlify / GitHub Pages)
1.  Ensure `index.html` points to `./index.js`.
2.  Upload **all files** (specifically `.html`, `.css`, `.js` files, and the `components/` and `services/` folders) to your web host's `public_html` directory.
3.  Ensure your server serves `.js` files with the MIME type `application/javascript`.

### Editing in AI Studio
1.  Edit the `.tsx` and `.ts` files.
2.  If major logic changes are made, ensure they are ported to the matching `.js` files for production deployment.

---

**Curated by Joe Amditis.**
