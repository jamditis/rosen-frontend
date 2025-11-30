

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- CONFIGURATION & STATE ---
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT-XqQXvMJNaBXVWlmXu1EyOpa_Cc6ur-pklWX1mbrWIFybZjmbE6UTIteSoCSvf0a7j5r8A6earp3H/pub?gid=928818664&single=true&output=csv';
const IMPOSSIBLE_PRESS_URL = 'https://docs.google.com/document/d/1OHTatfz57Oxcn1YbWHJ6smpWmRpwrWChlbtaO46Q3i0/edit?usp=sharing';
const ALLOWED_COLUMNS = ['id', 'title', 'author', 'publication_date', 'original_publication', 'summary', 'url', 'tags', 'thematic_categories', 'era', 'responds_to', 'key_concepts', 'pull_quote', 'verified', 'collection_id'];

// Hardcoded icon URLs for all app types
const APP_ICONS = {
    'aboutWindow': 'https://win98icons.alexmeub.com/icons/png/directory_open_file_mydocs-5.png',
    'search': 'https://win98icons.alexmeub.com/icons/png/search_file-1.png',
    'dataExplorer': 'https://win98icons.alexmeub.com/icons/png/chart1-4.png',
    'impossiblePress': 'https://win98icons.alexmeub.com/icons/png/notepad_file_gear-2.png',
    'folder': 'https://win98icons.alexmeub.com/icons/png/directory_closed-4.png',
    'categoryFolder': 'https://win98icons.alexmeub.com/icons/png/document-0.png',
    'recordFile': 'https://win98icons.alexmeub.com/icons/png/web_file-3.png'
};

const archiveState = {
    allRecords: [],
    categories: [],
    recordsByCategory: new Map(),
    isDataReady: false,
};

const archiveExplorerState = {
    path: 'C:\\'
};

let activeWindow = null;
let highestZIndex = 20;
const openApps = new Map();
let impossiblePressContent = null;
const openWindowStack = []; // Explicit stack to manage window activation order

// --- DOM ELEMENT REFERENCES ---
const desktop = document.getElementById('desktop');
const startMenu = document.getElementById('start-menu');
const startButton = document.getElementById('start-button');
const taskbarAppsContainer = document.getElementById('taskbar-apps');

// --- CORE OS FUNCTIONS ---

/** Brings a window to the front and sets it as active */
function bringToFront(windowElement) {
    if (activeWindow === windowElement) return;

    // De-activate previously active window
    if (activeWindow) {
        activeWindow.classList.remove('active');
        const oldWindowId = activeWindow.id;
        if (openApps.has(oldWindowId)) {
            openApps.get(oldWindowId).taskbarButton.classList.remove('active');
        }
    }

    // Activate new window
    highestZIndex++;
    windowElement.style.zIndex = highestZIndex.toString();
    windowElement.classList.add('active');
    activeWindow = windowElement;

    // Manage window stack for activation order
    const stackIndex = openWindowStack.indexOf(windowElement);
    if (stackIndex > -1) {
        openWindowStack.splice(stackIndex, 1);
    }
    openWindowStack.push(windowElement);

    // Activate taskbar button
    const windowId = windowElement.id;
    const appData = openApps.get(windowId);
    if (appData?.taskbarButton) {
        appData.taskbarButton.classList.add('active');
    }
}


/** Opens an application window */
function openApp(appName, options = {}) {
    // Special case: Open Impossible Press in new tab instead of window
    if (appName === 'impossiblePress') {
        window.open(IMPOSSIBLE_PRESS_URL, '_blank', 'noopener,noreferrer');
        return;
    }

    const windowId = options.recordId ? `${appName}_${options.recordId}` :
                     options.category ? `${appName}_${options.category.replace(/[^a-zA-Z0-9]/g, '_')}` : appName;

    // If window for this specific record is already open, just bring it to front
    const existingWindow = document.getElementById(windowId);
    if (existingWindow) {
        if (existingWindow.style.display !== 'flex') {
            existingWindow.style.display = 'flex';
        }
        bringToFront(existingWindow);
        return;
    }

    let windowElement = document.getElementById(appName);
    if (!windowElement) {
        console.error(`Template window element not found for app: ${appName}`);
        return;
    }

    // Clone the template if it's a viewer window
    if (appName === 'recordViewer' || appName === 'collectionViewer') {
        windowElement = windowElement.cloneNode(true);
        windowElement.id = windowId;
        desktop.appendChild(windowElement);
        setupWindowMouseEvents(windowElement); // Wire up events for the new clone
    }

    if (windowElement.style.display === 'flex' && !['recordViewer', 'collectionViewer'].includes(appName)) {
        bringToFront(windowElement);
        return;
    }
    
    windowElement.style.display = 'flex';
    bringToFront(windowElement);
    
    // Randomize position for new windows
    const randomTop = Math.random() * (window.innerHeight / 4) + 20;
    const randomLeft = Math.random() * (window.innerWidth / 3) + 20;
    windowElement.style.top = `${randomTop}px`;
    windowElement.style.left = `${randomLeft}px`;

    // Handle Taskbar button creation (one button per window instance)
    if (!openApps.has(windowId)) {
        const taskbarButton = document.createElement('div');
        taskbarButton.classList.add('taskbar-app');
        taskbarButton.id = `taskbar-${windowId}`; // Unique ID for each taskbar button
        taskbarButton.dataset.windowId = windowId;

        let iconSrc = '';
        let title = appName;
        // Find icon from either desktop or start menu
        const iconElement = Array.from(document.querySelectorAll(`.icon[data-app="${appName}"], .start-menu-item[data-app="${appName}"]`))[0];
        if (iconElement) {
            const img = iconElement.querySelector('img');
            const span = iconElement.querySelector('span');
            if (img) iconSrc = img.src;
            if (span) title = span.textContent || appName;
        } else {
             const windowTitleEl = windowElement.querySelector('.window-title');
             if(windowTitleEl) title = windowTitleEl.textContent;
        }

        // For cloned windows, use the window title as the button text
        if (windowId !== appName) {
            const windowTitleEl = windowElement.querySelector('.window-title');
            if (windowTitleEl && windowTitleEl.textContent) {
                title = windowTitleEl.textContent;
            }
        }

        if (iconSrc) {
            const img = document.createElement('img');
            img.src = iconSrc;
            img.alt = title;
            taskbarButton.appendChild(img);
        }
        taskbarButton.appendChild(document.createTextNode(title));

        taskbarButton.addEventListener('click', () => {
            const targetWindow = document.getElementById(windowId);
            if (!targetWindow) return;

            // If this window is active and visible, minimize it
            if (targetWindow === activeWindow && targetWindow.style.display !== 'none') {
                targetWindow.style.display = 'none';
                targetWindow.classList.remove('active');
                taskbarButton.classList.remove('active');

                // Remove from stack
                const stackIndex = openWindowStack.indexOf(targetWindow);
                if (stackIndex > -1) {
                    openWindowStack.splice(stackIndex, 1);
                }

                // Activate next window if available
                activeWindow = null;
                if (openWindowStack.length > 0) {
                    const nextWindow = openWindowStack[openWindowStack.length - 1];
                    if (nextWindow.style.display !== 'none') {
                        bringToFront(nextWindow);
                    }
                }
            } else {
                // Otherwise, show and bring to front
                targetWindow.style.display = 'flex';
                bringToFront(targetWindow);
            }
        });

        taskbarAppsContainer.appendChild(taskbarButton);
        openApps.set(windowId, { windowEl: windowElement, taskbarButton: taskbarButton });
    }

    if (openApps.has(windowId)) {
        openApps.get(windowId)?.taskbarButton.classList.add('active');
    }


    // Initialize specific applications
    if (appName === 'archiveExplorer') {
        archiveExplorerState.path = 'C:\\';
        renderExplorerContent();
    } else if (appName === 'recordViewer' && options.recordId) {
        populateRecordViewer(windowElement, options.recordId);
    } else if (appName === 'collectionViewer' && options.category) {
        populateCollectionViewer(windowElement, options.category);
    } else if (appName === 'search') {
        const input = windowElement.querySelector('#search-input-field');
        input?.focus();
    }
}

/** Closes an application window and handles state cleanup */
function closeApp(windowId) {
    const windowEl = document.getElementById(windowId);
    if (!windowEl) return;

    const wasActive = activeWindow === windowEl;
    const appName = windowId.split('_')[0];
    const isClone = windowId.includes('_');

    // --- Hide the window and remove it from tracking ---
    windowEl.style.display = 'none';
    windowEl.classList.remove('active'); // Remove active class to prevent CSS display override
    const stackIndex = openWindowStack.indexOf(windowEl);
    if (stackIndex > -1) {
        openWindowStack.splice(stackIndex, 1);
    }

    // --- Taskbar cleanup for this specific window ---
    const taskbarButtonId = `taskbar-${windowId}`;
    const taskbarButton = document.getElementById(taskbarButtonId);
    if (taskbarButton) {
        taskbarButton.remove();
    }
    openApps.delete(windowId); // Use windowId instead of appName

    // Remove from DOM if it's a clone
    if (isClone) {
        windowEl.remove();
    }

    // If the closed window was active, find the next one to activate from openWindowStack
    if (wasActive) {
        activeWindow = null;

        // Use the openWindowStack to find the next window (it's already in z-index order)
        if (openWindowStack.length > 0) {
            const nextActiveWindow = openWindowStack[openWindowStack.length - 1];
            // Verify it's actually visible before activating
            if (nextActiveWindow.style.display !== 'none') {
                bringToFront(nextActiveWindow);
            }
        }
    }
}

/** Minimizes a specific window */
function minimizeWindow(windowId) {
    const windowEl = document.getElementById(windowId);
    if (!windowEl) return;

    const wasActive = activeWindow === windowEl;

    // Hide window and remove from activation stack
    windowEl.style.display = 'none';
    windowEl.classList.remove('active');
    const stackIndex = openWindowStack.indexOf(windowEl);
    if (stackIndex > -1) {
        openWindowStack.splice(stackIndex, 1);
    }

    // Deactivate taskbar button
    const taskbarButton = openApps.get(windowId)?.taskbarButton;
    if (taskbarButton) {
        taskbarButton.classList.remove('active');
    }

    // If we minimized the active window, activate the next one
    if (wasActive) {
        activeWindow = null;
        if (openWindowStack.length > 0) {
            const nextWindow = openWindowStack[openWindowStack.length - 1];
            if (nextWindow.style.display !== 'none') {
                bringToFront(nextWindow);
            }
        }
    }
}

/** Updates the taskbar button text for a specific window */
function updateTaskbarButtonText(windowId, newTitle) {
    const appData = openApps.get(windowId);
    if (!appData?.taskbarButton) return;

    const taskbarButton = appData.taskbarButton;
    // Remove all text nodes from the button
    Array.from(taskbarButton.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
            node.remove();
        }
    });

    // Add new title text
    taskbarButton.appendChild(document.createTextNode(newTitle));
}


// --- DATA HANDLING & CLEANING (from Rosen Archive) ---
const clean = {
    normalizeHeader: (h) => h.toLowerCase().trim().replace(/[^a-z0-9_]/g, ''),
    cleanTitle: (t) => { if (typeof t !== 'string') return ''; const d = /\s(—|-|\|)/; const m = t.match(d); return m ? t.substring(0, m.index).trim() : t.trim(); },
    cleanString: (v) => typeof v !== 'string' ? '' : v.replace(/^['"\[\s]+|['"\]\s]+$/g, ''),
    standardizeDate: (d) => { if (!d || typeof d !== 'string' || !d.trim()) return ''; const dt = new Date(d); if (isNaN(dt.getTime())) return ''; const y = dt.getUTCFullYear(); const m = String(dt.getUTCMonth() + 1).padStart(2, '0'); const day = String(dt.getUTCDate()).padStart(2, '0'); return `${y}-${m}-${day}`; },
    parseAndCleanTags: (v) => { if (typeof v !== 'string' || !v.trim() || v.trim() === '[]' || v.startsWith('=')) return []; const r = /['"]([^'"]*?)['"]/g; let i = []; let m; while ((m = r.exec(v)) !== null) { if (m[1].length < 100 && !m[1].startsWith('=')) i.push(m[1]); } const c = v.replace(/\[.*?\]/g, '').replace(/['"]/g, ''); const rem = c.split(/[;,]/).map(item => item.trim()).filter(item => item && item.length < 100 && !item.startsWith('=')); return [...new Set([...i, ...rem].map(item => item.trim()).filter(Boolean))]; },
    getEraFromDate: (dateString) => { const y = new Date(dateString).getFullYear(); if (y >= 1990 && y <= 1999) return "The Public Journalism Movement (1990s)"; if (y >= 2000 && y <= 2009) return "The Rise of the Web & Blogging (2000-2009)"; if (y >= 2010 && y <= 2019) return "The View from Nowhere & Its Critics (2010s)"; if (y >= 2020) return "Democracy in Crisis & The Information War (2020s)"; return "Unknown Era"; }
};

function cleanAndFilterData(rawData) {
    return rawData.map(raw => {
        const formatted = {};
        ALLOWED_COLUMNS.forEach(c => {
            const normalizedHeader = clean.normalizeHeader(c); let v = raw[normalizedHeader] || '';
            if (c === 'title') v = clean.cleanTitle(v);
            else if (['original_publication', 'collection_id'].includes(c)) v = clean.cleanString(v);
            else if (c === 'publication_date') v = clean.standardizeDate(v);
            else if (['tags', 'thematic_categories', 'responds_to', 'key_concepts'].includes(c)) v = clean.parseAndCleanTags(v);
            formatted[c] = v;
        });
        formatted.era = [clean.getEraFromDate(formatted.publication_date)];
        return formatted;
    }).filter(rec => rec.verified === 'TRUE' && rec.id && rec.title.trim() !== '' && rec.publication_date.trim() !== '');
}

function fetchData() {
    Papa.parse(CSV_URL, {
        download: true, header: true, skipEmptyLines: true, transformHeader: clean.normalizeHeader,
        complete: (res) => {
            if (res.errors.length > 0 || res.data.length === 0) {
                // Since archive explorer doesn't use this, only show error if search or data explorer fails.
                // This will be handled by the apps themselves if data isn't ready.
                console.error("Error: Could not load archive data.");
                return;
            }
            archiveState.allRecords = cleanAndFilterData(res.data);
            const catSet = new Set();
            archiveState.allRecords.forEach(rec => {
                (rec.thematic_categories || []).forEach(c => {
                    catSet.add(c);
                    if (!archiveState.recordsByCategory.has(c)) {
                        archiveState.recordsByCategory.set(c, []);
                    }
                    archiveState.recordsByCategory.get(c)?.push(rec);
                });
            });
            archiveState.categories = [...catSet].sort();
            archiveState.isDataReady = true;

            // Re-render any open collection viewers that were waiting for data
            document.querySelectorAll('.window[id^="collectionViewer_"]').forEach(win => {
                if(win.querySelector('.loading-text')){
                    const category = win.querySelector('.window-title').textContent;
                    populateCollectionViewer(win, category);
                }
            });

        },
        error: (err) => {
            console.error("CSV Error:", err);
        }
    });
}

// --- APP-SPECIFIC UI FUNCTIONS ---

async function loadImpossiblePressContent(windowElement) {
    const contentArea = windowElement.querySelector('#impossible-press-text-area');
    if (!contentArea) return;

    if (impossiblePressContent) {
        contentArea.textContent = impossiblePressContent;
        return;
    }

    contentArea.textContent = 'Loading content...';
    try {
        const response = await fetch(IMPOSSIBLE_PRESS_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        impossiblePressContent = text;
        contentArea.textContent = impossiblePressContent;
    } catch (error) {
        console.error('Failed to load Impossible Press content:', error);
        contentArea.textContent = `Error: Could not load content.\n\n${error.message}`;
    }
}

function renderExplorerContent() {
    const explorerWindow = document.getElementById('archiveExplorer');
    if (!explorerWindow) return;
    
    const container = explorerWindow.querySelector('#archive-files-container');
    const pathDisplay = explorerWindow.querySelector('#archive-path');
    const backButton = explorerWindow.querySelector('#archive-back-button');

    if (!container || !pathDisplay || !backButton) return;
    
    container.innerHTML = ''; // Clear current content
    pathDisplay.textContent = archiveExplorerState.path;
    
    if (archiveExplorerState.path === 'C:\\') {
        backButton.style.display = 'none';

        // Render App shortcuts with hardcoded icons
        const apps = [
            { name: 'aboutWindow', label: 'About this Archive', icon: APP_ICONS.aboutWindow },
            { name: 'search', label: 'Search Archive', icon: APP_ICONS.search },
            { name: 'dataExplorer', label: 'Data Explorer', icon: APP_ICONS.dataExplorer },
            { name: 'impossiblePress', label: 'The Impossible Press', icon: APP_ICONS.impossiblePress }
        ];

        apps.forEach(app => {
            const fileIcon = document.createElement('div');
            fileIcon.className = 'window-file-icon';
            fileIcon.dataset.app = app.name;
            fileIcon.innerHTML = `
                <img src="${app.icon}" alt="${app.label}"/>
                <span>${app.label}</span>
            `;
            container.appendChild(fileIcon);
        });

        // Render "Archive Collections" folder
        const collectionsFolder = document.createElement('div');
        collectionsFolder.className = 'window-file-icon';
        collectionsFolder.dataset.path = 'C:\\Archive Collections';
        collectionsFolder.innerHTML = `
            <img src="${APP_ICONS.folder}" alt="Archive Collections"/>
            <span>Archive Collections</span>
        `;
        container.appendChild(collectionsFolder);

    } else if (archiveExplorerState.path === 'C:\\Archive Collections') {
        backButton.style.display = 'block';
        if (!archiveState.isDataReady) {
            container.innerHTML = `<div class="loading-text">Loading Collections...</div>`;
            return;
        }

        archiveState.categories.forEach(category => {
            const categoryFolder = document.createElement('div');
            categoryFolder.className = 'window-file-icon';
            categoryFolder.dataset.category = category;
            categoryFolder.innerHTML = `
                <img src="${APP_ICONS.categoryFolder}" alt="${category}"/>
                <span>${category}</span>
            `;
            container.appendChild(categoryFolder);
        });
    }
}

function populateCollectionViewer(windowElement, category) {
    const container = windowElement.querySelector('.archive-files-container');
    const titleEl = windowElement.querySelector('.window-title');
    if (!container || !titleEl) return;

    titleEl.textContent = category;

    if (!archiveState.isDataReady) {
        container.innerHTML = `<div class="loading-text">Loading Records...</div>`;
        return;
    }

    container.innerHTML = '';
    const records = archiveState.recordsByCategory.get(category) || [];

    if (records.length === 0) {
        container.innerHTML = `<div class="loading-text">No records found in this collection.</div>`;
        return;
    }

    records.forEach(record => {
        const recordIcon = document.createElement('div');
        recordIcon.className = 'window-file-icon collection-record-icon';
        recordIcon.dataset.recordId = record.id;
        recordIcon.innerHTML = `
            <img src="${APP_ICONS.recordFile}" alt="${record.title}"/>
            <span>${record.title}</span>
        `;
        container.appendChild(recordIcon);
    });

    // Add dblclick listener to this new window's content area
    container.addEventListener('dblclick', (e) => {
        const target = e.target;
        const recordIcon = target.closest('.window-file-icon[data-record-id]');
        if (recordIcon) {
            const recordId = recordIcon.dataset.recordId;
            openApp('recordViewer', { recordId });
        }
    });

    // Update taskbar button to match window title
    updateTaskbarButtonText(windowElement.id, category);
}

function populateRecordViewer(windowElement, recordId) {
    const record = archiveState.allRecords.find(r => r.id === recordId);
    if (!record) return;

    const titleEl = windowElement.querySelector('.window-title');
    const contentEl = windowElement.querySelector('.record-viewer-content');

    if(titleEl) titleEl.textContent = record.title;

    const createTagHtml = (items) => items.map(item => `<span>${item}</span>`).join(', ');

    if(contentEl) contentEl.innerHTML = `
        <h1 class="title">${record.title}</h1>
        <p class="meta">
            Published in <strong>${record.original_publication || 'N/A'}</strong> on ${record.publication_date} |
            <a href="${record.url}" target="_blank" rel="noopener noreferrer">View Original Source</a>
        </p>
        <p class="summary">${record.summary || 'No summary available.'}</p>

        <h2 class="section-title">Key Concepts</h2>
        <div class="tags-container">${record.key_concepts.length > 0 ? createTagHtml(record.key_concepts) : 'N/A'}</div>

        <h2 class="section-title">Tags</h2>
        <div class="tags-container">${record.tags.length > 0 ? createTagHtml(record.tags) : 'N/A'}</div>

        <h2 class="section-title">Era</h2>
        <div class="tags-container">${record.era.length > 0 ? createTagHtml(record.era) : 'N/A'}</div>
    `;

    // Update taskbar button to match window title
    updateTaskbarButtonText(windowElement.id, record.title);
}

function performSearch() {
    const input = document.getElementById('search-input-field');
    const resultsContainer = document.getElementById('search-results-container');
    const searchTerm = (input instanceof HTMLInputElement) ? input.value.trim() : '';

    if (!resultsContainer) return;
    
    if (!archiveState.isDataReady) {
        resultsContainer.innerHTML = '<p>Archive data is still loading. Please try again in a moment.</p>';
        return;
    }
    
    if (!searchTerm) {
        resultsContainer.innerHTML = '<p>Please enter a search term.</p>';
        return;
    }
    
    resultsContainer.innerHTML = '<p>Searching...</p>';

    // Levenshtein distance function for fuzzy matching (typo-friendliness)
    const levenshtein = (a, b) => {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        const matrix = [];
        for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
        for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j] + 1      // deletion
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    };

    // Define weights for different record fields to prioritize results
    const weights = { title: 10, key_concepts: 8, thematic_categories: 8, pull_quote: 5, summary: 3, tags: 2, original_publication: 2, author: 1 };
    const PHRASE_BONUS = 3; // Exact phrase matches are 3x more valuable

    // Separate quoted phrases from individual keywords
    const phrases = [...searchTerm.matchAll(/"([^"]+)"/g)].map(m => m[1].toLowerCase());
    const remainingTerm = searchTerm.replace(/"[^"]+"/g, '').trim().toLowerCase();
    const keywords = remainingTerm.split(/\s+/).filter(k => k.length > 1);

    const results = archiveState.allRecords.map(rec => {
        let score = 0;
        const searchableText = {
            title: rec.title || '',
            key_concepts: (rec.key_concepts || []).join(' '),
            thematic_categories: (rec.thematic_categories || []).join(' '),
            pull_quote: rec.pull_quote || '',
            summary: rec.summary || '',
            tags: (rec.tags || []).join(' '),
            original_publication: rec.original_publication || '',
            author: rec.author || ''
        };

        // 1. Score based on exact phrase matches within weighted fields
        phrases.forEach(phrase => {
            for (const field in weights) {
                const fieldText = searchableText[field].toLowerCase();
                if (fieldText.includes(phrase)) {
                    score += weights[field] * PHRASE_BONUS; // Higher score for phrases in important fields
                }
            }
        });

        // 2. Score based on keyword matches (including fuzzy matches)
        keywords.forEach(keyword => {
            for (const field in weights) {
                const fieldText = searchableText[field].toLowerCase();
                if (fieldText.includes(keyword)) {
                    score += weights[field]; // Exact keyword match
                } else if (keyword.length > 3) { // Only do fuzzy matching for longer words
                    const words = fieldText.split(/\s+/);
                    for (const word of words) {
                        // Allow for one typo (Levenshtein distance of 1)
                        if (levenshtein(keyword, word) <= 1) {
                            score += weights[field] / 2; // Fuzzy match gets half points
                            break; // Only score first fuzzy match per field
                        }
                    }
                }
            }
        });

        rec.relevanceScore = score;
        return rec;
    })
    .filter(r => (r.relevanceScore || 0) > 0)
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    // Display results
    if (results.length === 0) {
        resultsContainer.innerHTML = `<p>No results found for "<strong>${searchTerm}</strong>".</p>`;
    } else {
        resultsContainer.innerHTML = results.map(rec => 
            `<div class="search-result-item" data-record-id="${rec.id}">
                📄 ${rec.title}
             </div>`
        ).join('');
    }
}


// --- EVENT LISTENERS ---

function setupWindowMouseEvents(windowElement) {
    const titleBar = windowElement.querySelector('.window-titlebar');
    const closeButton = windowElement.querySelector('.window-close');
    const minimizeButton = windowElement.querySelector('.window-minimize');

    let isDragging = false;
    let isResizing = false;
    let resizeHandle = '';
    const resizeHandleSize = 8; // px

    windowElement.addEventListener('mousedown', () => bringToFront(windowElement), true);

    if (closeButton) {
        closeButton.addEventListener('click', (e) => { e.stopPropagation(); closeApp(windowElement.id); });
    }
    if (minimizeButton) {
        minimizeButton.addEventListener('click', (e) => { e.stopPropagation(); minimizeWindow(windowElement.id); });
    }
    
    // --- CURSOR UPDATE LOGIC ---
    windowElement.addEventListener('mousemove', (e) => {
        if (isDragging || isResizing) return;

        const rect = windowElement.getBoundingClientRect();
        const onLeft = e.clientX >= rect.left && e.clientX <= rect.left + resizeHandleSize;
        const onRight = e.clientX <= rect.right && e.clientX >= rect.right - resizeHandleSize;
        const onTop = e.clientY >= rect.top && e.clientY <= rect.top + resizeHandleSize;
        const onBottom = e.clientY <= rect.bottom && e.clientY >= rect.bottom - resizeHandleSize;

        // Set cursor for title bar drag
        if (!onLeft && !onRight && !onTop && !onBottom) {
            if (titleBar && (e.target === titleBar || titleBar.contains(e.target))) {
                 windowElement.style.cursor = 'grab';
            } else {
                 windowElement.style.cursor = 'default';
            }
            resizeHandle = '';
            return;
        }

        // Set cursor for resize handles
        if (onTop && onLeft) { windowElement.style.cursor = 'nwse-resize'; resizeHandle = 'top-left'; }
        else if (onTop && onRight) { windowElement.style.cursor = 'nesw-resize'; resizeHandle = 'top-right'; }
        else if (onBottom && onLeft) { windowElement.style.cursor = 'nesw-resize'; resizeHandle = 'bottom-left'; }
        else if (onBottom && onRight) { windowElement.style.cursor = 'nwse-resize'; resizeHandle = 'bottom-right'; }
        else if (onLeft) { windowElement.style.cursor = 'ew-resize'; resizeHandle = 'left'; }
        else if (onRight) { windowElement.style.cursor = 'ew-resize'; resizeHandle = 'right'; }
        else if (onTop) { windowElement.style.cursor = 'ns-resize'; resizeHandle = 'top'; }
        else if (onBottom) { windowElement.style.cursor = 'ns-resize'; resizeHandle = 'bottom'; }
        else { resizeHandle = ''; windowElement.style.cursor = 'default'; }
    });

    // Reset cursor when mouse leaves the window if not actively performing an action
    windowElement.addEventListener('mouseleave', () => {
        if (!isDragging && !isResizing) {
            windowElement.style.cursor = 'default';
            resizeHandle = '';
        }
    });

    // --- MOUSE DOWN LOGIC TO INITIATE DRAG OR RESIZE ---
    windowElement.addEventListener('mousedown', (e) => {
        // Priority 1: Check if it's a resize action.
        if (resizeHandle && !isResizing && windowElement.classList.contains('resizable')) {
            e.preventDefault();
            isResizing = true;
            
            const initialX = e.clientX;
            const initialY = e.clientY;
            const rect = windowElement.getBoundingClientRect();
            const initialWidth = rect.width;
            const initialHeight = rect.height;
            const initialTop = rect.top;
            const initialLeft = rect.left;
            
            const styles = window.getComputedStyle(windowElement);
            const minWidth = parseInt(styles.minWidth, 10) || 200;
            const minHeight = parseInt(styles.minHeight, 10) || 150;

            const resizeMove = (moveEvent) => {
                const dx = moveEvent.clientX - initialX;
                const dy = moveEvent.clientY - initialY;
                let newWidth = initialWidth, newHeight = initialHeight, newLeft = initialLeft, newTop = initialTop;

                if (resizeHandle.includes('right')) newWidth = initialWidth + dx;
                if (resizeHandle.includes('bottom')) newHeight = initialHeight + dy;
                if (resizeHandle.includes('left')) { newWidth = initialWidth - dx; newLeft = initialLeft + dx; }
                if (resizeHandle.includes('top')) { newHeight = initialHeight - dy; newTop = initialTop + dy; }

                if (newWidth >= minWidth) {
                    windowElement.style.width = `${newWidth}px`;
                    windowElement.style.left = `${newLeft}px`;
                }
                if (newHeight >= minHeight) {
                    windowElement.style.height = `${newHeight}px`;
                    windowElement.style.top = `${newTop}px`;
                }
            };

            const resizeUp = () => {
                isResizing = false;
                document.removeEventListener('mousemove', resizeMove);
                document.removeEventListener('mouseup', resizeUp);
            };

            document.addEventListener('mousemove', resizeMove);
            document.addEventListener('mouseup', resizeUp);
            return;
        }
        
        // Priority 2: Check if it's a drag action on the titlebar.
        if (titleBar && (e.target === titleBar || titleBar.contains(e.target)) && !e.target.closest('.window-control-button')) {
            e.preventDefault();
            isDragging = true;
            
            const rect = windowElement.getBoundingClientRect();
            const dragOffsetX = e.clientX - rect.left;
            const dragOffsetY = e.clientY - rect.top;
            if(titleBar) titleBar.style.cursor = 'grabbing';
            
            const dragMove = (moveEvent) => {
                if (!isDragging) return;
                let x = moveEvent.clientX - dragOffsetX;
                let y = moveEvent.clientY - dragOffsetY;
                
                const taskbarHeight = (taskbarAppsContainer.parentElement?.offsetHeight ?? 36);
                const minY = 0; const minX = -(windowElement.offsetWidth - 40);
                const maxX = window.innerWidth - 40;
                const maxY = window.innerHeight - taskbarHeight - 22; // 22 is titlebar height
                x = Math.max(minX, Math.min(x, maxX));
                y = Math.max(minY, Math.min(y, maxY));
                windowElement.style.left = `${x}px`;
                windowElement.style.top = `${y}px`;
            };

            const dragUp = () => {
                isDragging = false;
                if(titleBar) titleBar.style.cursor = 'grab';
                document.removeEventListener('mousemove', dragMove);
                document.removeEventListener('mouseup', dragUp);
            };

            document.addEventListener('mousemove', dragMove);
            document.addEventListener('mouseup', dragUp);
        }
    });
}


function init() {
    // Setup listeners for static elements
    document.querySelectorAll('.icon').forEach(icon => {
        icon.addEventListener('dblclick', () => { // Changed to double-click for desktop icons
            const appName = icon.dataset.app;
            if (appName) {
                openApp(appName);
            }
        });
    });

    document.querySelectorAll('.start-menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const appName = item.dataset.app;
            if (appName) openApp(appName);
            startMenu.classList.remove('active');
        });
    });

    startButton.addEventListener('click', (e) => {
        e.stopPropagation();
        startMenu.classList.toggle('active');
        if (startMenu.classList.contains('active')) {
            highestZIndex++;
            startMenu.style.zIndex = highestZIndex.toString();
        }
    });

    document.addEventListener('click', (e) => {
        if (startMenu.classList.contains('active') && !startMenu.contains(e.target) && !startButton.contains(e.target)) {
            startMenu.classList.remove('active');
        }
    });

    // Wire up events for pre-existing windows in HTML
    document.querySelectorAll('.window').forEach(windowElement => {
        setupWindowMouseEvents(windowElement);
    });
    
    // Archive Explorer specific listeners
    const explorerContent = document.getElementById('archive-explorer-content');
    if (explorerContent) {
        explorerContent.addEventListener('dblclick', (e) => {
            const target = e.target;
            const icon = target.closest('.window-file-icon');
            if (!icon) return;

            if (icon.dataset.app) {
                openApp(icon.dataset.app);
            } else if (icon.dataset.path) {
                archiveExplorerState.path = icon.dataset.path;
                renderExplorerContent();
            } else if (icon.dataset.category) {
                openApp('collectionViewer', { category: icon.dataset.category });
            }
        });

        const backButton = document.getElementById('archive-back-button');
        backButton?.addEventListener('click', () => {
            if (archiveExplorerState.path === 'C:\\Archive Collections') {
                archiveExplorerState.path = 'C:\\';
                renderExplorerContent();
            }
        });
    }

    // Search App specific listeners
    const searchButton = document.getElementById('search-submit-button');
    const searchInput = document.getElementById('search-input-field');
    const searchResults = document.getElementById('search-results-container');
    
    searchButton?.addEventListener('click', performSearch);
    searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') performSearch();
    });
    searchResults?.addEventListener('dblclick', (e) => {
        const target = e.target;
        const item = target.closest('.search-result-item[data-record-id]');
        if (item) {
            const recordId = item.dataset.recordId;
            if (recordId) {
                openApp('recordViewer', { recordId });
            }
        }
    });

    // Impossible Press download listener
    const downloadButton = document.getElementById('download-impossible-press');
    if (downloadButton) {
        downloadButton.addEventListener('click', () => {
            if (impossiblePressContent) {
                const blob = new Blob([impossiblePressContent], { type: 'text/markdown;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = 'the-impossible-press.md';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else {
                alert('Content is not loaded yet. Please wait a moment and try again.');
            }
        });
    }

    // Fetch archive data to start the process
    fetchData();
}

// --- INITIALIZATION ---
init();