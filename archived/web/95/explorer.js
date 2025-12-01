// --- CONFIGURATION CONSTANTS (Adjust these values to change the visualization) ---
        
// Data source
const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT-XqQXvMJNaBXVWlmXu1EyOpa_Cc6ur-pklWX1mbrWIFybZjmbE6UTIteSoCSvf0a7j5r8A6earp3H/pub?gid=928818664&single=true&output=csv';

// Grid size parameters
const MIN_RECORDS_TO_DISPLAY = 441; // Starting grid size (21x21). Must be a perfect square.
const MAX_RECORDS_TO_DISPLAY = 625; // Expanded grid size (25x25). Must be a perfect square.

// Grid layout parameters
const CANVAS_WIDTH = 900;              // Internal drawing width of the Canvas (pixels).
const INTERNAL_CANVAS_HEIGHT = 1150; // Internal drawing height of the Canvas (pixels).
const CONTAINER_PADDING = 25;        // Padding around the Canvas inside its scrolling container (pixels).

// Visual parameters
const DOT_RADIUS = 5;              // Reference size for calculation (base 5px dot).
const HOVER_SPEED = 0.08;          // Interpolation speed for smooth hover animation (0.01 is slow, 1.0 is instant).
const FADE_OPACITY = 0.15;         // Opacity of unrelated dots when in "exploration mode".
const PRIMARY_HIGHLIGHT_COLOR = 'rgb(59, 130, 246)'; // Color of the ring around the selected primary dot.
const HIT_TEST_THRESHOLD = 8;        // Pixel distance the mouse must be from a line for the tooltip to appear.
const MIN_ANIMATION_DURATION = 1200; // Minimum time in ms for path animation.
const MAX_ANIMATION_DURATION = 2800; // Maximum time in ms for path animation.
const DIMMED_OPACITY = 0.25;         // Opacity of non-hovered paths/dots when a line is actively hovered.

// NEW CONFIGURABLE PARAMETERS
let MAX_CONNECTIONS_TO_SHOW = 30; // Set to new user default (30)
let LINE_THICKNESS_BASE = 1.5;    // Base thickness for lines (1.5)
let PULSE_MAX_MULTIPLIER = 1.8;   // Controls the amplitude of the pulse (1.8)
let PULSE_MIN_MULTIPLIER = 0.6;   // Controls the minimum point of the pulse (0.6)
let SNAP_TO_GRID = true;          // Toggle for path snapping
let CLUSTER_MODE = 'grid';        // NEW: Current grouping mode ('grid', 'aggregate', 'concept', 'theme')


// Derived Constants
const MIN_DOT_MULTIPLIER = 0.6; // Smallest dot (3px radius)
const MAX_DOT_MULTIPLIER = 2.8; // Largest dot (14px radius)
const PULSE_SPEED = 0.003;      // Speed of the sine wave for pulsing motion

// Clustering Constants
const CLUSTER_OFFSET_MULTIPLIER = 8.0; // Multiplier for separating clustered groups (higher = more space) - INCREASED FROM 2.5
const CLUSTER_VARIANCE = 1.5;          // Random positional variance within a cluster (0 to 1) - INCREASED FROM 0.5


// Columns retained from the CSV.
const ALLOWED_COLUMNS = ['id', 'title', 'author', 'publication_date', 'original_publication', 'summary', 'url', 'tags', 'thematic_categories', 'era', 'responds_to', 'key_concepts', 'pull_quote', 'verified', 'collection_id'];

// Categories that determine dot/line color (colP).
const CATEGORY_DESCRIPTIONS = {
    "Audience & Public Engagement": "Explores the evolving relationship between journalists and the public they serve.",
    "Journalism Education": "Focuses on the methods and philosophies behind training the next generation of journalists.",
    "Journalism Theory & Practice": "Examines the core principles and practical challenges of reporting and newsgathering.",
    "Politics & Democracy": "Analyzes the crucial role of the press in a democratic society and its political coverage.",
    "Press & Media Criticism": "Provides critical analysis of media performance, ethics, and industry trends.",
    "Technology & Digital Media": "Investigates the impact of digital tools and platforms on the field of journalism."
};

// Static color palette mapped to the categories/key concepts.
const CATEGORY_COLORS = {
    "Audience & Public Engagement": '#3b82f6', // Blue
    "Journalism Education": '#10b981', // Emerald
    "Journalism Theory & Practice": '#f59e0b', // Amber
    "Politics & Democracy": '#ef4444', // Red
    "Press & Media Criticism": '#8b5cf6', // Violet
    "Technology & Digital Media": '#6b7280', // Gray
    "Other": '#4b5563', // Default for uncategorized and placeholders
};
const COLOR_MAP = CATEGORY_COLORS; // Alias for consistent use.

// --- DOM Elements (References to HTML elements) ---
let canvas;
let ctx;
const recordCountStatus = document.getElementById('recordCountStatus');
const resetButton = document.getElementById('resetButton');
const viewSourceButton = document.getElementById('viewSourceButton'); 
const lineTooltip = document.getElementById('lineTooltip');
const infoPanel = document.getElementById('infoPanel'); 
const detailsHeader = document.getElementById('detailsHeader');
const expandBar = document.getElementById('expandBar');
const contentPlaceholder = document.getElementById('contentPlaceholder'); 
const dynamicHeaderContent = document.getElementById('dynamicHeaderContent'); 
const tutorialModal = document.getElementById('tutorialModal');
const exploreButton = document.getElementById('exploreButton');
const connectionFieldSelect = document.getElementById('connectionField');
const primaryStatusBadge = document.getElementById('primaryStatusBadge');

// NEW DOM References
const maxConnectionsValueSpan = document.getElementById('maxConnectionsValue');
const lineThicknessValueSpan = document.getElementById('lineThicknessValue');
const pulseMultiplierValueSpan = document.getElementById('pulseMultiplierValue');
const clusterModeSelect = document.getElementById('clusterModeSelect');


// --- State variables (Current application state) ---
window.records = [];        
let verifiedMasterRecords = []; 
let dotRadii = {};            
let selectedRecordId = null;  
let hoveredRecordId = null;   
let currentInfoRecordId = null; 
let connectedRecordIds = [];  
let currentMaxDisplay = MIN_RECORDS_TO_DISPLAY; 
let panelState = 'closed';    
let connectionField = 'key_concepts'; 
let isDataLoaded = false;     
let activeConnections = [];   
let mainAnimationFrameId = null; 
let isViewLocked = false;     
let xCoords = [];             
let yCoords = [];             
let hoveredConnection = null; 
let maxAggregateConnections = 0; // NEW: Track max strength for normalization


// --- Utility Functions ---

/** Cleans extra quotes or spaces from strings. */
const cleanString = v => typeof v !== 'string' ? '' : v.trim().replace(/^"|"$/g, '');

/** Parses CSV fields that contain multiple items (tags, concepts) into an array. */
const parseAndCleanTags = v => {
    if (typeof v !== 'string' || !v.trim()) return [];
    // Split by comma or semicolon, which handles both typical list formats and the sample schema.
    return v.split(/[;,]/) 
        .map(item => cleanString(item))
        .filter(item => item);
};

/** Finds the nearest existing grid X or Y coordinate to snap a turn point to. */
function findNearestGridCoord(coord, coordList) {
    return coordList.reduce((prev, curr) => 
        (Math.abs(curr - coord) < Math.abs(prev - coord) ? curr : prev), coordList[0]);
}

/** Creates a placeholder object for unused grid slots. */
function createPlaceholderRecord(index) {
    return {
        id: `P${index}`, title: 'Unused grid slot', author: 'System', publication_date: '', summary: 'This slot is a grid filler and does not link to a live data record.', url: '', tags: [], thematic_categories: ['Other'], era: 'N/a - Placeholder', responds_to: '', key_concepts: [], pull_quote: '', verified: 'FALSE', isVerified: false, collection_id: '', numericId: index, category: 'Other', color: COLOR_MAP['Other'], isPlaceholder: true, aggregateConnectionCount: 0, baseRadius: DOT_RADIUS, clusterKey: 'Other', clusterGroup: 'Other'
    };
}

/** Utility function to calculate connection strength (number of shared items in the primary field) */
function getConnectionStrength(record1, record2, field) {
    const list1 = Array.isArray(record1[field]) ? record1[field] : [];
    const list2 = Array.isArray(record2[field]) ? record2[field] : [];
    return list1.filter(value => list2.includes(value)).length;
}

/** Updates a visual parameter and triggers necessary redraws. */
window.updateVisualizationParameter = function(param, value) {
    let needsRedraw = false;
    let needsRecalculation = false;
    let needsRepositioning = false;

    switch (param) {
        case 'max_connections':
            MAX_CONNECTIONS_TO_SHOW = parseInt(value);
            maxConnectionsValueSpan.textContent = value;
            needsRecalculation = true; 
            break;
        case 'line_thickness_base':
            LINE_THICKNESS_BASE = parseFloat(value);
            lineThicknessValueSpan.textContent = value;
            needsRedraw = true;
            break;
        case 'pulse_multiplier':
            PULSE_MAX_MULTIPLIER = parseFloat(value);
            pulseMultiplierValueSpan.textContent = value;
            PULSE_MIN_MULTIPLIER = PULSE_MAX_MULTIPLIER * 0.3; 
            needsRedraw = true;
            break;
        case 'snap_to_grid':
            SNAP_TO_GRID = value;
            needsRedraw = true;
            break;
        case 'cluster_mode':
            CLUSTER_MODE = value;
            needsRepositioning = true; // Changing the clustering mode requires recalculating positions
            break;
    }

    if (needsRepositioning) {
        // Changing mode or re-sorting means we need to fully reprocess data and positions
        processData(verifiedMasterRecords, currentMaxDisplay); 
        resetView(); // Full reset clears connections and restarts drawing at new positions
    } else if (needsRecalculation && isViewLocked) {
        // If a connection parameter changed while viewing a primary dot, re-select it to update lines
        const primaryRecord = window.records.find(r => r.numericId === selectedRecordId);
        if (primaryRecord) {
            selectPrimaryRecord(primaryRecord);
        }
    } else if (needsRedraw) {
        // Just redraw the visualization with the new parameters
        if (mainAnimationFrameId === null) {
            animate();
        }
    }
}

/** Calculates dynamic coordinates based on the current CLUSTER_MODE. */
function calculateClusteredPositions(records, cols, rows, xInnerStart, yInnerStart, xStep, yStep) {
    let groups = {};
    let maxGroupSize = 0;

    // 1. Group records based on the current CLUSTER_MODE
    records.forEach(record => {
        let key;
        if (record.isPlaceholder) {
            key = 'Other';
        } else if (CLUSTER_MODE === 'aggregate') {
            // Group by popularity/importance (low, medium, high)
            const normalized = record.aggregateConnectionCount / maxAggregateConnections;
            if (normalized >= 0.7) key = 'High connections';
            else if (normalized >= 0.3) key = 'Medium connections';
            else key = 'Low connections';
        } else if (CLUSTER_MODE === 'concept') {
            key = record.key_concepts[0] || 'Uncategorized concept';
        } else if (CLUSTER_MODE === 'theme') {
            key = record.thematic_categories[0] || 'Uncategorized theme';
        } else {
            // Should not happen if CLUSTER_MODE is 'grid'
            return;
        }

        if (!groups[key]) groups[key] = [];
        groups[key].push(record);
        record.clusterGroup = key;
        maxGroupSize = Math.max(maxGroupSize, groups[key].length);
    });

    const groupKeys = Object.keys(groups);
    const numGroups = groupKeys.length;
    const groupCols = Math.ceil(Math.sqrt(numGroups));
    const groupRows = Math.ceil(numGroups / groupCols);

    const gridSpacingX = (CANVAS_WIDTH - CONTAINER_PADDING * 2) / groupCols;
    const gridSpacingY = (INTERNAL_CANVAS_HEIGHT - CONTAINER_PADDING * 2) / groupRows;
    
    const groupCenterX = (CANVAS_WIDTH - CONTAINER_PADDING * 2) / (groupCols * 2);
    const groupCenterY = (INTERNAL_CANVAS_HEIGHT - CONTAINER_PADDING * 2) / (groupRows * 2);
    
    // Use the increased multiplier for spreading out points
    const varianceRange = DOT_RADIUS * CLUSTER_OFFSET_MULTIPLIER; 
    
    let xCoordsNew = [];
    let yCoordsNew = [];

    // 2. Position the groups and individual dots
    groupKeys.forEach((key, groupIndex) => {
        const col = groupIndex % groupCols;
        const row = Math.floor(groupIndex / groupCols);

        // Determine the center position of the current cluster area
        const clusterCenterX = xInnerStart + (groupCenterX + col * gridSpacingX) + CONTAINER_PADDING;
        const clusterCenterY = yInnerStart + (groupCenterY + row * gridSpacingY) + CONTAINER_PADDING;
        
        groups[key].forEach(record => {
            // Apply offset/variance for "force-directed" look
            // Cluster variance now allows movement up to 1.5 * varianceRange in both directions
            const offsetX = (Math.random() * (CLUSTER_VARIANCE * 2) - CLUSTER_VARIANCE) * varianceRange;
            const offsetY = (Math.random() * (CLUSTER_VARIANCE * 2) - CLUSTER_VARIANCE) * varianceRange;

            record.x = clusterCenterX + offsetX;
            record.y = clusterCenterY + offsetY;
            
            if (xCoordsNew.indexOf(record.x) === -1) xCoordsNew.push(record.x);
            if (yCoordsNew.indexOf(record.y) === -1) yCoordsNew.push(record.y);
        });
    });
    
    return { xCoordsNew, yCoordsNew };
}


/**
 * Assigns fixed grid coordinates, calculates dynamic base size, pads/slices data, and assigns dot colors.
 * Runs on load and when the grid size or connection field changes.
 */
function processData(masterRecords, targetMax) {
    // Deep clone and sort the master records by publication_date (earliest to most recent)
    let processedRecords = JSON.parse(JSON.stringify(masterRecords)); 
    processedRecords.sort((a, b) => {
        const dateA = new Date(a.publication_date);
        const dateB = new Date(b.publication_date);
        return dateA - dateB; // Ascending sort: earliest date first
    });
    
    const limit = Math.min(processedRecords.length, targetMax);
    processedRecords = processedRecords.slice(0, limit);

    // Pad the array with placeholders if necessary to hit the targetMax
    const startNumericId = masterRecords.length + 1;
    for (let i = startNumericId; processedRecords.length < targetMax; i++) {
        processedRecords.push(createPlaceholderRecord(i));
    }
    
    window.records = processedRecords.slice(0, targetMax); 

    // --- Dynamic Dot Sizing Calculation ---
    maxAggregateConnections = 0;

    // Step 1: Calculate aggregate strength for each record
    window.records.forEach(record => {
        if (!record.isVerified) {
            record.aggregateConnectionCount = 0;
            return;
        }

        let totalConnections = 0;
        window.records.forEach(targetRecord => {
            if (record.numericId !== targetRecord.numericId && targetRecord.isVerified) {
                // Sum up shared items with every other record based on current connection field
                totalConnections += getConnectionStrength(record, targetRecord, connectionField);
            }
        });
        record.aggregateConnectionCount = totalConnections;
        if (totalConnections > maxAggregateConnections) {
            maxAggregateConnections = totalConnections;
        }
    });

    // Step 2: Determine grid and coordinate calculation setup
    const targetSize = Math.max(1, targetMax);
    const cols = Math.ceil(Math.sqrt(targetSize)); 
    const rows = Math.ceil(targetSize / cols);
    
    let xStep, yStep;
    
    const xInnerStart = CONTAINER_PADDING;
    const xInnerEnd = CANVAS_WIDTH - CONTAINER_PADDING;
    const yInnerStart = CONTAINER_PADDING;
    const yInnerEnd = INTERNAL_CANVAS_HEIGHT - CONTAINER_PADDING;

    const xEffective = xInnerEnd - xInnerStart; 
    const yEffective = yInnerEnd - yInnerStart; 

    if (cols > 1) {
        xStep = (xEffective - (2 * DOT_RADIUS)) / (cols - 1); 
        yStep = (yEffective - (2 * DOT_RADIUS)) / (rows - 1);
    } else {
         xStep = CANVAS_WIDTH / 2;
         yStep = INTERNAL_CANVAS_HEIGHT / 2;
    }

    xCoords = [];
    yCoords = [];
    dotRadii = {}; 
    
    // 3. Calculate Base Radius and Color Properties (independent of layout)
    window.records.forEach(record => {
        if (!record.isPlaceholder) {
            const colorSourceField = connectionField; 
            const colorSourceValue = Array.isArray(record[colorSourceField]) && record[colorSourceField].length > 0 ? record[colorSourceField][0] : 'Other';
            
            const allCategoryKeys = Object.keys(CATEGORY_COLORS).filter(k => k !== 'Other');
            let colorKey = 'Other';

            if (colorSourceValue !== 'Other') {
               const matchingKey = Object.keys(CATEGORY_DESCRIPTIONS).find(category => category === colorSourceValue);
                
                if (matchingKey) {
                    colorKey = matchingKey;
                } else {
                    const hash = colorSourceValue.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                    const index = hash % allCategoryKeys.length;
                    colorKey = allCategoryKeys[index];
                }
            }

            record.color = CATEGORY_COLORS[colorKey] || COLOR_MAP['Other']; 
            record.colorKey = colorKey; 
            record.colorValue = colorSourceValue; 
            
            // Assign dynamic baseRadius
            if (maxAggregateConnections === 0) {
                record.baseRadius = DOT_RADIUS * MIN_DOT_MULTIPLIER;
            } else {
                const ratio = record.aggregateConnectionCount / maxAggregateConnections;
                const scaleRange = MAX_DOT_MULTIPLIER - MIN_DOT_MULTIPLIER;
                const sizeMultiplier = MIN_DOT_MULTIPLIER + (ratio * scaleRange);
                record.baseRadius = DOT_RADIUS * sizeMultiplier;
            }

        } else {
            record.baseRadius = DOT_RADIUS * MIN_DOT_MULTIPLIER;
        }
    });


    // 4. Calculate Positions based on CLUSTER_MODE
    let newCoords;
    let finalRecords = [];
    
    if (CLUSTER_MODE === 'grid') {
        // Grid layout (Default)
        window.records.forEach((record, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            
            if (cols > 1) {
                record.x = xInnerStart + DOT_RADIUS + col * xStep;
                record.y = yInnerStart + DOT_RADIUS + row * yStep;
            } else {
                record.x = xInnerStart + xEffective / 2; 
                record.y = yInnerStart + yEffective / 2;
            }
            finalRecords.push(record);
            if (xCoords.indexOf(record.x) === -1) xCoords.push(record.x);
            if (yCoords.indexOf(record.y) === -1) yCoords.push(record.y);
        });
    } else {
        // Clustered Layout (Hubs, Concept, or Theme)
        newCoords = calculateClusteredPositions(window.records, cols, rows, xInnerStart, yInnerStart, xStep, yStep);
        xCoords = newCoords.xCoordsNew;
        yCoords = newCoords.yCoordsNew;
        finalRecords = window.records;
    }
    
    window.records = finalRecords;
    
    // 5. Final setup
    window.records.forEach(record => {
        dotRadii[record.numericId] = record.baseRadius; // Initialize dot radius
    });
    
    xCoords.sort((a,b) => a - b);
    yCoords.sort((a,b) => a - b);
}

/**
 * Handles fetching the CSV data in the background using PapaParse.
 */
function fetchDataAndInitialize(targetMax = MIN_RECORDS_TO_DISPLAY, isToggle = false) {
    // Handles network/parsing errors gracefully
    const handleError = (message) => {
        recordCountStatus.textContent = `Error loading data.`;
        console.error("Data loading error:", message);
        contentPlaceholder.innerHTML = `<p class="text-red-500">Failed to load data. See console for details. (Check CSV URL or network.)</p>`;
        isDataLoaded = true;
        window.handleExploreClick(); 
    };
    
    // Optimization: If only toggling size, skip the slow network request
    if (isToggle && verifiedMasterRecords.length > 0) {
        processData(verifiedMasterRecords, targetMax);
        renderInitialPanelContent();
        if (mainAnimationFrameId === null) animate();
        return;
    }

    Papa.parse(csvUrl, {
        download: true,
        header: true,
        skipEmptyLines: true,
        // Normalize header names for consistent JS access
        transformHeader: h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'), 
        complete: (results) => {
            if (results.errors.length > 0) {
                handleError(results.errors[0].message);
                return;
            }

            // Filter for only verified records
            verifiedMasterRecords = results.data
                .map((raw, index) => {
                    const record = {};
                    
                    ALLOWED_COLUMNS.forEach(col => {
                        const normalizedCol = col.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                        record[col] = raw[normalizedCol] || ''; 
                    });

                    // Ensure tag fields are parsed into arrays
                    record.tags = parseAndCleanTags(record.tags);
                    record.thematic_categories = parseAndCleanTags(record.thematic_categories);
                    record.key_concepts = parseAndCleanTags(record.key_concepts); 
                    record.numericId = index + 1; 
                    
                    // Check verification status from the column
                    record.isVerified = record.verified && record.verified.toUpperCase().trim() === 'TRUE';
                    
                    return record;
                })
                .filter(r => r.isVerified && r.id && r.title.trim());

            processData(verifiedMasterRecords, targetMax);

            currentMaxDisplay = targetMax;
            isDataLoaded = true;
            
            const verifiedRecordCount = window.records.filter(r => r.isVerified).length;
            recordCountStatus.textContent = `${verifiedRecordCount} records loaded`;
            
            renderInitialPanelContent();
            
            // FIX: If the user already clicked "Explore" and the button shows "Loading data...",
            // trigger the click function again to dismiss the modal and unlock the UI.
            if (exploreButton.textContent === 'Loading data...') {
                exploreButton.textContent = 'Explore the archive';
                exploreButton.disabled = false;
                window.handleExploreClick(); // Direct function call instead of .click()
            }
            
            animate(); 
        },
        error: (err) => {
            handleError(err.message);
        }
    });
}

/** Allows the user to change the field used for connections and dot coloring. */
window.updateConnectionField = function(newField) {
    connectionField = newField;
    
    // Recalculate colors, positions, and dynamic size based on the new field
    processData(verifiedMasterRecords, currentMaxDisplay);
    
    // Reset view to clear old lines and start new ones with the new color map
    resetView(); 
}

/** Handles the button click on the tutorial modal. */
// FIX: Added 'retry' parameter to properly track polling attempts and stop the loop if data fails to load.
window.handleExploreClick = function(retry = 0) {
    const maxRetries = 50; // Max polling attempts (10 seconds total)
    
    if (isDataLoaded) {
        // Condition 2 met: data is loaded, dismiss modal
        tutorialModal.classList.add('hidden');
        
        // Open panel to default state if not already open
        if (selectedRecordId === null) {
            togglePanelState('default');
        }
    } else {
        // Condition 1 not met: show loading state
        exploreButton.textContent = 'Loading data...';
        exploreButton.disabled = true;
        
        if (retry < maxRetries) {
            // Poll again after 200ms
            setTimeout(() => {
                window.handleExploreClick(retry + 1);
            }, 200);
        } else {
            // Max retries reached
            exploreButton.textContent = 'Data load failed (Try refreshing)';
            exploreButton.disabled = false;
        }
    }
}

/**
 * Sets the visibility and dimension state of the floating info panel.
 * @param {'closed'|'default'|'minimized'|'maximized'} newState 
 */
window.togglePanelState = function(newState) {
    
    // Check for a record ID only if we are not closing, or if we are trying to open from a closed state.
    if (newState !== 'closed' && currentInfoRecordId === null) {
         const firstVerifiedRecord = window.records.find(r => r.isVerified);
         if (firstVerifiedRecord) {
            currentInfoRecordId = firstVerifiedRecord.numericId;
         } else {
             return;
         }
    }
    
    // Handles double-clicking the same state dot to revert to default
    if (newState === 'maximized' && panelState === 'maximized') {
        newState = 'default';
    } else if (newState === 'minimized' && panelState === 'minimized') {
        newState = 'default';
    }

    // Remove all state classes first
    infoPanel.classList.remove('is-visible', 'is-minimized', 'is-maximized');
    document.body.classList.remove('modal-open');

    // Handle content swap for minimized state
    const currentRecord = window.records.find(r => r.numericId === currentInfoRecordId);
    const titleContent = currentRecord ? currentRecord.title : 'Record details';
    const idContent = currentRecord ? `ID: ${currentRecord.id}` : 'Record details';

    switch (newState) {
        case 'closed':
            // FIX: Panel close ONLY hides the panel (transform), it does NOT call resetView().
            dynamicHeaderContent.innerHTML = `<h2 id="detailsHeader" class="text-xl font-bold text-gray-800 truncate">Record details</h2>`;
            // Note: Connections remain visible until 'End exploration' is clicked.
            break;
        case 'default':
            dynamicHeaderContent.innerHTML = `<h2 id="detailsHeader" class="text-xl font-bold text-gray-800 truncate">${idContent}</h2>`;
            infoPanel.classList.add('is-visible');
            break;
        case 'minimized':
            dynamicHeaderContent.innerHTML = `<h2 id="detailsHeader" class="text-base font-semibold text-gray-800 truncate">${titleContent}</h2>`;
            infoPanel.classList.add('is-visible', 'is-minimized');
            break;
        case 'maximized':
            dynamicHeaderContent.innerHTML = `<h2 id="detailsHeader" class="text-xl font-bold text-gray-800 truncate">${idContent}</h2>`;
            infoPanel.classList.add('is-visible', 'is-maximized');
            document.body.classList.add('modal-open');
            break;
    }
    panelState = newState;
}

/** Toggles the grid size between 441 and 625 dots. */
window.toggleGridSize = function() {
    if (currentMaxDisplay === MAX_RECORDS_TO_DISPLAY) {
        currentMaxDisplay = MIN_RECORDS_TO_DISPLAY;
        expandBar.textContent = `Show ${MAX_RECORDS_TO_DISPLAY} total dots (Click to expand)`;
    } else {
        currentMaxDisplay = MAX_RECORDS_TO_DISPLAY;
        expandBar.textContent = `Hide ${MAX_RECORDS_TO_DISPLAY} total dots (Click to contract)`;
    }
    // Re-initializes data processing and redraws the grid for the new size
    fetchDataAndInitialize(currentMaxDisplay, true); 
}

/** Exports the current Canvas view as a PNG file download. */
window.exportCanvasAsPNG = function() {
    if (!canvas) {
        console.error("Canvas element not initialized.");
        return;
    }
    
    // Force redraw of the visualization first to ensure the latest state is captured
    drawVisualization();

    // Use the canvas toDataURL method to create a base64 encoded image
    const imageURL = canvas.toDataURL('image/png');
    
    // Create a temporary link element to trigger the download
    const link = document.createElement('a');
    link.href = imageURL;
    link.download = `record-explorer-view-${Date.now()}.png`; // Set filename
    
    // Append to body, click it, and remove it immediately
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/** NEW: Clears all active connections and resets the view lock. */
window.clearConnections = function() {
    resetView(true); // Call reset logic, but keep the panel closed if it was closed.
}

/** Resets the UI state: clears connections, unlocks the view, and restores defaults. */
window.resetView = function(keepPanelState = false) {
    // Stop the animation loop
    if (mainAnimationFrameId !== null) {
        cancelAnimationFrame(mainAnimationFrameId);
        mainAnimationFrameId = null;
    }
    
    // Reset all state variables related to connection and interaction lock
    selectedRecordId = null;
    hoveredRecordId = null; 
    currentInfoRecordId = null;
    connectedRecordIds = [];
    activeConnections = [];
    isViewLocked = false;
    hoveredConnection = null;
    lineTooltip.classList.add('hidden'); 
    viewSourceButton.classList.add('hidden'); 
    primaryStatusBadge.classList.add('hidden');

    // Reset dot radii to default (using stored baseRadius)
    window.records.forEach(record => {
        dotRadii[record.numericId] = record.baseRadius || DOT_RADIUS;
    });

    // Update UI elements
    resetButton.classList.add('hidden');
    const verifiedRecordCount = window.records.filter(r => r.isVerified).length;
    recordCountStatus.textContent = `${verifiedRecordCount} records loaded`;
    
    // Reset cluster mode display if needed
    if (CLUSTER_MODE !== 'grid' && clusterModeSelect) {
        clusterModeSelect.value = CLUSTER_MODE;
    }

    // Handle panel state reset (Only call togglePanelState if we need to visually close it)
    if (!keepPanelState || panelState !== 'closed') {
        togglePanelState('closed');
    }
    // Ensure initial content is rendered after clearing connections
    renderInitialPanelContent();

    // Restart animation to handle lingering hover effects
    animate(); 
}

/** Main Canvas drawing loop. Draws dots and animated paths. */
function drawVisualization() {
    // Check to ensure ctx is initialized
    if (!ctx) return; 

    ctx.clearRect(0, 0, CANVAS_WIDTH, INTERNAL_CANVAS_HEIGHT); // Clear previous frame

    const primaryId = selectedRecordId;
    const isLineHoverActive = hoveredConnection !== null;
    const currentTime = Date.now();

    // --- Draw Paths ---
    if (primaryId !== null && activeConnections.length > 0) {
        const primaryRecord = window.records.find(r => r.numericId === primaryId);
        if (!primaryRecord) return;

        const pX = primaryRecord.x;
        const pY = primaryRecord.y;
        
        for (const connection of activeConnections) {
            const targetRecord = window.records.find(r => r.numericId === connection.targetId);
            if (!targetRecord) continue;

            const elapsedTime = currentTime - connection.startTime;
            let progress = Math.min(1, elapsedTime / connection.duration); // Animation progress (0 to 1)
            
            // Line thickness is based on CONNECTION_THICKNESS_BASE and strength
            ctx.lineWidth = LINE_THICKNESS_BASE + (connection.strength * 1.5); 
            ctx.strokeStyle = connection.color; 
            ctx.lineCap = 'round';
            ctx.setLineDash([]); 
            
            // Dim unrelated lines if a line is hovered
            if (isLineHoverActive && hoveredConnection.targetId !== connection.targetId) {
                 ctx.globalAlpha = DIMMED_OPACITY;
            } else {
                 ctx.globalAlpha = 1.0;
            }
            
            // Draw the animated line segment
            drawManhattanPath(pX, pY, targetRecord.x, targetRecord.y, progress, connection.horizontalFirst, connection.midPointRatio);
        }
    }

    // --- Draw Dots ---
    for (const record of window.records) {
        const isPrimary = record.numericId === primaryId;
        const isConnected = connectedRecordIds.includes(record.numericId);
        const isPrimaryOrConnected = isPrimary || isConnected;
        const isVerified = record.isVerified;
        
        let alpha = 1.0;
        
        // Opacity logic
        if (!isVerified) {
            alpha = 0.3; // Unverified records are slightly dimmed
        } else if (primaryId !== null && !isPrimaryOrConnected) {
            alpha = FADE_OPACITY; // Unrelated records fade out in locked mode
        } else if (isLineHoverActive && !isPrimary) {
            // Dim connected dots if the line being hovered doesn't include them
            const isTargetOfHoveredLine = (hoveredConnection && hoveredConnection.targetId === record.numericId);
            if (!isTargetOfHoveredLine) {
                 alpha = DIMMED_OPACITY;
            }
        }

        const baseSize = record.baseRadius || DOT_RADIUS; // Use calculated base size
        let targetRadius = baseSize;
        const HOVER_RADIUS = baseSize * 1.6;

        // Apply pulsing to connected dots
        if (isConnected) {
            const timeFactor = currentTime * PULSE_SPEED;
            
            // Pulse magnitude is relative to the base size, scaled by PULSE_MAX_MULTIPLIER
            const PULSE_MIN = baseSize * PULSE_MIN_MULTIPLIER; 
            const PULSE_MAX = baseSize * PULSE_MAX_MULTIPLIER;
            
            const pulseAmplitude = (PULSE_MAX - PULSE_MIN) / 2;
            const pulseCenter = PULSE_MIN + pulseAmplitude;
            
            targetRadius = pulseCenter + Math.sin(timeFactor + (record.numericId * 0.5)) * pulseAmplitude;
        } 

        // Hover overrides pulse/default radius
        if (record.numericId === hoveredRecordId) {
            targetRadius = HOVER_RADIUS; 
        } else if (isPrimary) {
            targetRadius = baseSize; // Primary dot stays fixed at its calculated importance size
        }
        
        // Interpolate the radius for a smooth transition from default/hover
        let currentRadius = dotRadii[record.numericId] || baseSize;
        
        if (Math.abs(currentRadius - targetRadius) > 0.05) {
            // Interpolate the radius for a smooth transition
            currentRadius += (targetRadius - currentRadius) * HOVER_SPEED;
            dotRadii[record.numericId] = currentRadius;
        } else {
            dotRadii[record.numericId] = targetRadius;
        }


        // Draw the dot
        ctx.beginPath();
        ctx.arc(record.x, record.y, currentRadius, 0, Math.PI * 2);
        ctx.fillStyle = record.color;
        ctx.globalAlpha = alpha;
        ctx.fill();

        // Draw cluster labels if in clustered mode
        if (CLUSTER_MODE !== 'grid' && isPrimary) {
            ctx.font = '14px Inter';
            ctx.fillStyle = record.color;
            ctx.textAlign = 'center';
            ctx.globalAlpha = 0.8;
            ctx.fillText(record.clusterGroup, record.x, record.y - currentRadius - 10);
        }


        // Draw highlight rings
        if (isPrimary) {
            ctx.strokeStyle = PRIMARY_HIGHLIGHT_COLOR;
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        if (record.numericId === currentInfoRecordId && !isPrimary) {
            ctx.strokeStyle = 'rgba(107, 114, 128, 0.7)'; // Highlight for connected dot in info panel
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        ctx.globalAlpha = 1.0; // Reset global alpha
    }
}

/** Draws the three-segment, grid-aligned, animated right-angle path. */
function drawManhattanPath(x1, y1, x2, y2, progress, horizontalFirst, midPointRatio) {
    
    let iX, iY; // Intermediate turn point coordinates
    
    // Calculate potential intermediate points based on midPointRatio
    const tempIX = x1 + (x2 - x1) * midPointRatio;
    const tempIY = y1 + (y2 - y1) * midPointRatio;
    
    let finalIX, finalIY;

    // Apply grid snapping if toggled on
    if (SNAP_TO_GRID && CLUSTER_MODE === 'grid') {
        if (horizontalFirst) {
            finalIX = findNearestGridCoord(tempIX, xCoords); // Middle turn point snaps to a grid column
            finalIY = y2;                                    // Final turn point snaps to target dot's row
        } else {
            finalIY = findNearestGridCoord(tempIY, yCoords); // Middle turn point snaps to a grid row
            finalIX = x2;                                    // Final turn point snaps to target dot's column
        }
    } else {
        // If not grid mode or snapping is off, use the direct calculated turn point.
        // This gives a more chaotic, force-directed look in cluster mode.
        if (horizontalFirst) {
            finalIX = tempIX;
            finalIY = y2;
        } else {
            finalIY = tempIY;
            finalIX = x2;
        }
    }
    
    iX = finalIX;
    iY = finalIY;

    // Define the three segments of the zig-zag path
    let pathPoints = [];
    if (horizontalFirst) {
        // H-V-H path: Start -> Intermediate X, Start Y -> Intermediate X, Target Y -> Target
        pathPoints = [{x: x1, y: y1}, {x: iX, y: y1}, {x: iX, y: y2}, {x: x2, y: y2}];
    } else {
        // V-H-V path: Start -> Start X, Intermediate Y -> Target X, Intermediate Y -> Target
        pathPoints = [{x: x1, y: y1}, {x: x1, y: iY}, {x: x2, y: iY}, {x: x2, y: y2}];
    }

    // Calculate length of each segment
    const L1 = Math.abs(pathPoints[1].x - pathPoints[0].x) + Math.abs(pathPoints[1].y - pathPoints[0].y);
    const L2 = Math.abs(pathPoints[2].x - pathPoints[1].x) + Math.abs(pathPoints[2].y - pathPoints[1].y);
    const L3 = Math.abs(pathPoints[3].x - pathPoints[2].x) + Math.abs(pathPoints[3].y - pathPoints[2].y);
    
    const totalDistance = L1 + L2 + L3;
    let currentPathLength = progress * totalDistance; // Length travelled based on animation progress
    
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    
    let traveled = 0;

    // Iterate through the three segments to draw the path up to the current length
    for (let i = 1; i <= 3; i++) {
        const startPoint = pathPoints[i-1];
        const endPoint = pathPoints[i];
        const segmentLength = (i === 1) ? L1 : (i === 2) ? L2 : L3;
        
        if (currentPathLength > traveled) {
            if (currentPathLength < traveled + segmentLength) {
                // We are in the middle of this segment, calculate and draw the stopping point
                const ratio = (currentPathLength - traveled) / segmentLength;
                
                const currentX = startPoint.x + (endPoint.x - startPoint.x) * ratio;
                const currentY = startPoint.y + (endPoint.y - startPoint.y) * ratio;
                
                ctx.lineTo(currentX, currentY);
                ctx.stroke();
                return;
            } else {
                // Draw the full segment and continue
                ctx.lineTo(endPoint.x, endPoint.y);
                traveled += segmentLength;
            }
        } else {
            break; // Animation finished
        }
    }
    ctx.stroke();
}

/** Checks if the mouse is currently hovering over a verified dot. */
function getHoveredRecord(mouseX, mouseY) {
    for (const record of window.records) {
        if (!record.isVerified) continue; // Only verified dots are hoverable
        
        const distance = Math.sqrt(Math.pow(record.x - mouseX, 2) + Math.pow(record.y - mouseY, 2));
        
        const currentBaseRadius = dotRadii[record.numericId] || record.baseRadius || DOT_RADIUS;
        const hoverHitbox = currentBaseRadius * 1.2 + 4; // Dynamic hitbox size

        // Use the current radius (or slightly expanded) for hit testing
        if (distance < hoverHitbox) { 
            if (isViewLocked) {
                // If locked, only primary or connected dots are active
                const isPrimary = record.numericId === selectedRecordId;
                const isConnected = connectedRecordIds.includes(record.numericId);
                if (!isPrimary && !isConnected) { return null; }
            }
            return record;
        }
    }
    return null;
}

/** Checks if the mouse is hovering over an animated path line. */
window.checkLineHit = function(mouseX, mouseY) {
    if (!isViewLocked || activeConnections.length === 0) return null;

    const primaryRecord = window.records.find(r => r.numericId === selectedRecordId);
    if (!primaryRecord) return null;

    const pX = primaryRecord.x;
    const pY = primaryRecord.y;

    for (const connection of activeConnections) {
        const targetRecord = window.records.find(r => r.numericId === connection.targetId);
        if (!targetRecord) continue;

        const { x: x2, y: y2 } = targetRecord;
        const { horizontalFirst, midPointRatio } = connection;
        
        let iX, iY;
        const tempIX = pX + (x2 - pX) * midPointRatio;
        const tempIY = pY + (y2 - pY) * midPointRatio; 

        // Apply grid snapping if toggled on AND not in cluster mode (cluster mode paths don't snap)
        const shouldSnap = SNAP_TO_GRID && CLUSTER_MODE === 'grid';

        if (shouldSnap) {
            if (horizontalFirst) {
                iX = findNearestGridCoord(tempIX, xCoords);
                iY = y2;
            } else {
                iY = findNearestGridCoord(tempIY, yCoords);
                iX = x2;
            }
        } else {
            // No snapping
            if (horizontalFirst) {
                iX = tempIX;
                iY = y2;
            } else {
                iY = tempIY;
                iX = x2;
            }
        }

        let segments = [];
        if (horizontalFirst) {
            segments = [
                { start: { x: pX, y: pY }, end: { x: iX, y: pY } },
                { start: { x: iX, y: pY }, end: { x: iX, y: y2 } },
                { start: { x: iX, y: y2 }, end: { x: x2, y: y2 } }
            ];
        } else {
            segments = [
                { start: { x: pX, y: pY }, end: { x: pX, y: iY } },
                { start: { x: pX, y: iY }, end: { x: x2, y: iY } },
                { start: { x: x2, y: iY }, end: { x: x2, y: y2 } }
            ];
        }
        
        for (const segment of segments) {
            const { start, end } = segment;
            
            if (start.y === end.y) { // Horizontal segment check
                const minY = start.y - HIT_TEST_THRESHOLD;
                const maxY = start.y + HIT_TEST_THRESHOLD;
                const minX = Math.min(start.x, end.x);
                const maxX = Math.max(start.x, end.x);
                
                if (mouseY >= minY && mouseY <= maxY && mouseX >= minX && mouseX <= maxX) {
                    // Return the connection object, not the target record, to access the sharedValue
                    return connection; 
                }
            } 
            else if (start.x === end.x) { // Vertical segment check
                const minX = start.x - HIT_TEST_THRESHOLD;
                const maxX = start.x + HIT_TEST_THRESHOLD;
                const minY = Math.min(start.y, end.y);
                const maxY = Math.max(start.y, end.y);

                if (mouseX >= minX && mouseX <= maxX && mouseY >= minY && mouseY <= maxY) {
                    // Return the connection object
                    return connection;
                }
            }
        }
    }
    return null;
}

/** Handles updating the HTML tooltip position and content. */
function updateTooltip(clientX, clientY, dotRecord, connectionObject) {
    let content = '';

    // Dot hover takes precedence over line hover
    if (dotRecord) {
        content = renderDotTooltipContent(dotRecord);
        hoveredConnection = null; // Clear line hover state
    } else if (connectionObject && isViewLocked) {
        content = renderLineTooltipContent(connectionObject);
        hoveredConnection = connectionObject; // Set line hover state
    } else {
         hoveredConnection = null; // Clear line hover state
    }

    if (content) {
        lineTooltip.innerHTML = content;
        // Position the tooltip using raw clientX/Y coordinates plus scroll offsets
        lineTooltip.style.left = `${clientX + 15 + window.scrollX}px`;
        lineTooltip.style.top = `${clientY + 15 + window.scrollY}px`; 
        lineTooltip.classList.remove('hidden');
    } else {
        lineTooltip.classList.add('hidden');
    }
}

// --- Tooltip Content Generation ---

/** Generates HTML content for the DOT hover tooltip. */
function renderDotTooltipContent(record) {
    const date = record.publication_date || 'N/a';
    const title = record.title || 'Untitled record';
    const tags = Array.isArray(record.tags) ? record.tags.slice(0, 3) : []; // Show max 3 tags
    
    const dateParts = date.split('-');
    // Format date as DD-MM-YYYY (assuming input is YYYY-MM-DD)
    const formattedDate = dateParts.length === 3 ? `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}` : date;

    const tagsHtml = tags.map(t => `<div class="text-[10px] text-gray-400 leading-tight">${t}</div>`).join('');

    return `
        <div class="flex flex-col text-left p-1">
            <div class="text-[10px] text-gray-400 font-medium tracking-wider mb-0.5">${formattedDate}</div> 
            <div class="text-xs font-bold text-white leading-tight mb-1">${title}</div>
            ${tagsHtml}
        </div>
    `;
}

/** Generates HTML content for the LINE hover tooltip. */
function renderLineTooltipContent(connectionObject) {
    // NEW: Show strength in line tooltip
    return `<div class="text-xs font-semibold">${connectionObject.sharedValue} (Strength: ${connectionObject.strength})</div>`;
}

/** Renders the initial color key and instructions in the info panel when no dot is selected. */
function renderInitialPanelContent() {
    // This is called by resetView, which clears selectedRecordId and currentInfoRecordId
    const verifiedRecordCount = window.records.filter(r => r.isVerified).length;
    
    detailsHeader.textContent = `Record details`;
    viewSourceButton.classList.add('hidden'); 
    primaryStatusBadge.classList.add('hidden');

    const statusText = `
        <h3 class="mt-2 text-lg font-semibold text-gray-700 mb-2">Instructions</h3>
        <p class="text-sm text-gray-600 mb-4">Click any colored dot on the grid to begin exploring connections based on shared concepts or categories.</p>
        <p class="text-sm text-gray-600 mb-4">The visualization currently loads ${verifiedRecordCount} verified records into a ${currentMaxDisplay}-dot grid.</p>
        <div class="mt-4 p-3 bg-gray-50 rounded-lg">
            <p class="text-xs font-semibold text-gray-600 mb-1">Color interpretation:</p>
            <p class="text-xs text-gray-500">Dot color indicates the primary thematic category or key concept, depending on the current filter setting above.</p>
            <p class="text-xs text-gray-500 mt-1">Dot size indicates aggregate connectivity (Hubs).</p>
        </div>
    `;
    
    contentPlaceholder.innerHTML = statusText;
}


/** Initiates the exploration mode when a primary dot is clicked. */
function selectPrimaryRecord(record) {
    // Set state immediately
    selectedRecordId = record.numericId;
    currentInfoRecordId = record.numericId; // Set current info panel to the primary record
    isViewLocked = true;
    hoveredRecordId = null;

    // Open the panel to default state
    if (panelState === 'closed' || panelState === 'minimized') {
        togglePanelState('default');
    }

    if (mainAnimationFrameId !== null) cancelAnimationFrame(mainAnimationFrameId);

    resetButton.classList.remove('hidden');
    
    // Set the main header text to the ID
    dynamicHeaderContent.innerHTML = `<h2 id="detailsHeader" class="text-xl font-bold text-gray-800 truncate">ID: ${record.id}</h2>`;
    primaryStatusBadge.classList.remove('hidden');

    const primaryId = record.numericId;
    const primaryConnectionField = connectionField;
    const primaryConnectionValues = Array.isArray(record[primaryConnectionField]) ? record[primaryConnectionField] : [];

    // Find all connected records based on shared concepts/categories
    let connectionMap = [];
    window.records
        .filter(r => r.isVerified && r.numericId !== primaryId && Array.isArray(r[primaryConnectionField]))
        .forEach(targetRecord => {
            
            // NEW: Calculate strength and check for connection based on minimum strength (1)
            const strength = getConnectionStrength(record, targetRecord, primaryConnectionField);
            if (strength === 0) return; // Skip if no shared concepts

            // Find the first shared value for coloring/labeling
            const sharedValue = targetRecord[primaryConnectionField].find(val => primaryConnectionValues.includes(val));
            
            if (sharedValue) {
                 // Find the corresponding color key to ensure consistency with the color key bar
                const allCategoryKeys = Object.keys(CATEGORY_COLORS).filter(k => k !== 'Other');
                let colorKey = 'Other';
                
                // Check if the shared value is one of the main categories
                const matchingKey = Object.keys(CATEGORY_DESCRIPTIONS).find(category => category === sharedValue);
                
                if (matchingKey) {
                    colorKey = matchingKey;
                } else {
                     // Hash the value for consistent color assignment if not a main category
                    const hash = sharedValue.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                    const index = hash % allCategoryKeys.length;
                    colorKey = allCategoryKeys[index];
                }

                connectionMap.push({
                    targetId: targetRecord.numericId, 
                    sharedValue: sharedValue, 
                    color: CATEGORY_COLORS[colorKey] || COLOR_MAP['Other'],
                    date: targetRecord.publication_date || '9999-12-31', // Use a large date for sorting if null
                    strength: strength // NEW: Store connection strength
                });
            }
        });

    // Sort connections first by strength (strongest first), then by date (oldest first)
    connectionMap.sort((a, b) => {
        if (a.strength !== b.strength) {
            return b.strength - a.strength; // Descending by strength
        }
        return new Date(a.date) - new Date(b.date); // Ascending by date
    });

    // Apply the maximum connection limit (now controlled by MAX_CONNECTIONS_TO_SHOW)
    activeConnections = [];
    connectedRecordIds = [];

    // Generate animation parameters for each connection
    connectionMap.slice(0, MAX_CONNECTIONS_TO_SHOW).forEach(connection => {
        const targetId = connection.targetId;
        connectedRecordIds.push(targetId);

        // Randomize animation speed
        const duration = Math.floor(Math.random() * (MAX_ANIMATION_DURATION - MIN_ANIMATION_DURATION)) + MIN_ANIMATION_DURATION; 
        const horizontalFirst = Math.random() > 0.5; // Randomize start direction (H-V-H or V-H-V)
        const midPointRatio = Math.random() * 0.8 + 0.1; // Randomize the point where the path turns

        activeConnections.push({
            targetId: targetId, 
            color: connection.color, 
            duration: duration, 
            startTime: 0, 
            horizontalFirst: horizontalFirst, 
            midPointRatio: midPointRatio,
            sharedValue: connection.sharedValue, // Store the shared value for the tooltip
            strength: connection.strength // Store connection strength
        });
    });


    updateInfoPanel(record);

    const currentTime = Date.now();
    activeConnections.forEach(conn => conn.startTime = currentTime); // Start the animation timers

    animate();
}

/** Updates the content of the floating info panel when a dot is clicked/focused. */
window.updateInfoPanel = function(record) {
    if (!record) {
        resetView();
        return;
    }
    
    currentInfoRecordId = record.numericId;
    drawVisualization(); // Redraw immediately to highlight the focused dot

    const fullTitle = record.title || 'No title available';
    const tags = Array.isArray(record.tags) ? record.tags : [];
    const keyConcepts = Array.isArray(record.key_concepts) ? record.key_concepts : [];
    const thematicCategories = Array.isArray(record.thematic_categories) ? record.thematic_categories : [];
    const date = record.publication_date || 'N/a';
    const isPrimary = record.numericId === selectedRecordId;
    
    // Set Panel Header Content
    const idContent = `ID: ${record.id}`;
    const titleContent = record.title;

    if (isPrimary) {
        dynamicHeaderContent.innerHTML = `<h2 id="detailsHeader" class="text-xl font-bold text-gray-800 truncate">${idContent}</h2>`;
        primaryStatusBadge.textContent = 'Primary selected record';
        primaryStatusBadge.classList.remove('hidden');
    } else if (connectedRecordIds.includes(record.numericId)) {
        dynamicHeaderContent.innerHTML = `<h2 id="detailsHeader" class="text-xl font-bold text-gray-800 truncate">${idContent}</h2>`;
        primaryStatusBadge.textContent = 'Connected record';
        primaryStatusBadge.classList.remove('hidden');
    } else {
         dynamicHeaderContent.innerHTML = `<h2 id="detailsHeader" class="text-xl font-bold text-gray-800 truncate">Record details</h2>`;
         primaryStatusBadge.classList.add('hidden');
    }
    
    // Update source button
    viewSourceButton.href = record.url || '#';
    viewSourceButton.classList.toggle('hidden', !record.url);

    // Full Panel Content (Pill generation)
    const tagPills = tags.map(tag => `<span class="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full font-medium">${tag}</span>`).join('');
    const keyConceptPills = keyConcepts.map(kc => `<span class="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full font-medium">${kc}</span>`).join('');
    const categoryPills = thematicCategories.map(cat => `<span class="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style="background-color: ${COLOR_MAP[cat] || COLOR_MAP['Other']};">${cat}</span>`).join('');
    
    // --- Connected Records List Generation ---
    let connectedRecordsListHtml = '';
    
    if (activeConnections.length > 0) {
         // Get the actual records from the numeric IDs, filtered by current active list, and map connection strength
        const connectedRecordsData = window.records
            .filter(r => connectedRecordIds.includes(r.numericId))
            .map(r => {
                const connection = activeConnections.find(c => c.targetId === r.numericId);
                return {
                    ...r,
                    date: r.publication_date || '9999-12-31', // Use temp date for sorting
                    strength: connection ? connection.strength : 0
                };
            })
            // Sort the display list by strength (descending)
            .sort((a, b) => b.strength - a.strength);


        connectedRecordsListHtml = `
            <div class="pt-4 border-t mt-4">
                <h4 class="font-semibold text-gray-700 mb-2">Connected records (${connectedRecordsData.length}) <span class="text-sm font-normal text-gray-500">(Sorted by strength)</span></h4>
                <div class="overflow-y-auto max-h-96 pr-2">
                    ${connectedRecordsData.map(r => `
                        <div class="flex justify-between items-center py-2 border-b border-gray-100 hover:bg-gray-50 transition duration-150 rounded-lg px-2" onclick="window.updateInfoPanel(window.records.find(rec => rec.numericId === ${r.numericId}))">
                            <div class="flex flex-col text-sm">
                                <span class="font-bold text-gray-800">${r.id} - ${r.title}</span>
                                <span class="text-xs text-gray-500">${r.publication_date} | strength: ${r.strength}</span>
                            </div>
                            <a href="${r.url || '#'}" target="_blank" class="text-primary-blue hover:text-blue-700 text-xs font-medium flex-shrink-0" ${r.url ? '' : 'onclick="event.preventDefault(); return false;"'}>View source</a>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    contentPlaceholder.innerHTML = `
        
        <p class="text-2xl font-extrabold text-gray-800 mb-1">${fullTitle}</p>
        
        <p class="text-sm mb-4 text-gray-500">
            <span class="font-bold">${record.author || 'Unknown author'}</span> | ${record.publication_date || 'N/a'} | ${record.original_publication || 'Unknown publication'}
        </p>
        
        <div class="space-y-4">
            ${record.pull_quote ? `<div class="pt-2 border-t mt-2"><h4 class="font-semibold text-gray-700 mb-2">Key quote</h4><p class="text-gray-700 text-base italic border-l-4 border-gray-300 pl-3">"${record.pull_quote}"</p></div>` : ''}

            <p class="text-sm"><span class="font-semibold text-gray-700">Era:</span> ${record.era || 'Unknown era'}</p>

            <div class="pt-1"><span class="font-semibold text-gray-700 block mb-1">Thematic categories:</span><div class="flex flex-wrap gap-2">${categoryPills}</div></div>
            
            <div class="pt-1"><span class="font-semibold text-gray-700 block mb-1">Summary:</span><p class="text-gray-600 text-sm italic">${record.summary || 'No summary provided.'}</p></div>

            <div class="pt-1"><span class="font-semibold text-gray-700 block mb-1">Key concepts (${keyConcepts.length}):</span><div class="flex flex-wrap gap-2">${keyConceptPills}</div></div>

            <div class="pt-1"><span class="font-semibold text-gray-700 block mb-1">Tags (${tags.length}):</span><div class="flex flex-wrap gap-2">${tagPills}</div></div>

            ${connectedRecordsListHtml}
        </div>
    `;
}

// --- Event Listeners ---

/** Finds the record clicked using basic geometry. */
function getClickedRecord(mouseX, mouseY) {
    for (const record of window.records) {
        const distance = Math.sqrt(Math.pow(record.x - mouseX, 2) + Math.pow(record.y - mouseY, 2));
        
        if (!record.isVerified) continue; 

        const isPrimaryOrConnected = record.numericId === selectedRecordId || connectedRecordIds.includes(record.numericId);

        const currentBaseRadius = dotRadii[record.numericId] || record.baseRadius || DOT_RADIUS;
        const hoverHitbox = currentBaseRadius * 1.2 + 4; // Dynamic hitbox size

        if (distance < hoverHitbox) { 
            // Prevent clicking unrelated dots in locked state
            if (isViewLocked && !isPrimaryOrConnected) { return null; }
            return record;
        }
    }
    return null;
}


// --- Animation Loop ---
function animate() {
    // Check to ensure ctx is initialized
    if (!ctx) return;
    
    // Check if any lines are still animating
    let linesAnimating = activeConnections.some(conn => (Date.now() - conn.startTime) / conn.duration < 1);
    let radiiChanging = false;

    for (const record of window.records) {
        let targetRadius = record.baseRadius || DOT_RADIUS; // Start with the dynamic base size
        const isConnected = connectedRecordIds.includes(record.numericId);
        const currentTime = Date.now();
        const HOVER_RADIUS_DERIVED = targetRadius * 1.6;

        // Apply pulsing to connected dots
        if (isConnected) {
            const timeFactor = currentTime * PULSE_SPEED;
            
            // Pulse magnitude is relative to the base size, scaled by PULSE_MAX_MULTIPLIER
            const PULSE_MIN = targetRadius * PULSE_MIN_MULTIPLIER; 
            const PULSE_MAX = targetRadius * PULSE_MAX_MULTIPLIER;
            
            const pulseAmplitude = (PULSE_MAX - PULSE_MIN) / 2;
            const pulseCenter = PULSE_MIN + pulseAmplitude;
            
            targetRadius = pulseCenter + Math.sin(timeFactor + (record.numericId * 0.5)) * pulseAmplitude;
        } 

        // Hover overrides pulse/default radius
        if (record.numericId === hoveredRecordId) {
            targetRadius = HOVER_RADIUS_DERIVED; 
        } else if (record.numericId === selectedRecordId) {
             targetRadius = targetRadius; // Primary dot stays fixed at its calculated importance size
        }
        
        // Interpolate the radius for a smooth transition from default/hover/pulse
        let currentRadius = dotRadii[record.numericId] || targetRadius;
        
        if (Math.abs(currentRadius - targetRadius) > 0.05) {
            // Interpolate the radius for a smooth transition
            currentRadius += (targetRadius - currentRadius) * HOVER_SPEED;
            dotRadii[record.numericId] = currentRadius;
            radiiChanging = true; // Set to true here to track the transition
        } else {
            dotRadii[record.numericId] = targetRadius;
        }
    }

    drawVisualization(); 

    // Continue the loop if in exploration mode (view is locked) OR lines are moving OR radii are changing
    // We force the loop to run when isViewLocked is true to maintain line hover responsiveness
    if (isViewLocked || linesAnimating || radiiChanging) {
        mainAnimationFrameId = requestAnimationFrame(animate);
    } else {
        mainAnimationFrameId = null;
    }
}

// --- Initialization ---

/** This is the robust initialization function, now called immediately at the end of the <body>. */
function initializeApp() {
    // FIX: Initialize canvas and ctx here after the DOM elements are loaded
    canvas = document.getElementById('dataCanvas');
    // Add safety check just in case, though in onload it should succeed
    if (canvas) {
        ctx = canvas.getContext('2d');
    } else {
        // Keep this error logged as a safety net
        console.error("Critical error: cannot find dataCanvas element.");
        return;
    }
    
    fetchDataAndInitialize(MIN_RECORDS_TO_DISPLAY); 
    
    // Set up event listeners that rely on 'canvas' after initialization
    canvas.addEventListener('click', (event) => {
        const rect = canvas.getBoundingClientRect();
        // Calculate mouse position relative to internal Canvas resolution
        const scaleX = CANVAS_WIDTH / rect.width;
        const scaleY = INTERNAL_CANVAS_HEIGHT / rect.height;

        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;

        const clickedRecord = getClickedRecord(x, y);

        if (clickedRecord) {
            if (!isViewLocked) {
                // Initial click: start exploration mode
                selectPrimaryRecord(clickedRecord);
            } else {
                // Exploration mode: update panel if primary or connected dot is clicked
                const isPrimary = clickedRecord.numericId === selectedRecordId;
                const isConnected = connectedRecordIds.includes(clickedRecord.numericId);

                if (isPrimary || isConnected) {
                    window.updateInfoPanel(clickedRecord);
                }
            }
        } else if (isViewLocked) {
            // Clicked empty space in locked view: clear the board
            // Changed to call clearConnections() for full reset
            clearConnections();
        }
    });
    
    canvas.addEventListener('mousemove', (event) => {
        const rect = canvas.getBoundingClientRect();
        // Store raw client coordinates for positioning the HTML tooltip
        const clientX = event.clientX;
        const clientY = event.clientY;

        // Calculate Canvas coordinates for hit testing (scaled to internal resolution)
        const scaleX = CANVAS_WIDTH / rect.width;
        const scaleY = INTERNAL_CANVAS_HEIGHT / rect.height;
        const mouseX = (clientX - rect.left) * scaleX;
        const mouseY = (clientY - rect.top) * scaleY;

        const dotRecord = getHoveredRecord(mouseX, mouseY);
        const newHoveredId = dotRecord ? dotRecord.numericId : null;

        // Trigger redraw for smooth hover animation if dot hover state changes
        if (hoveredRecordId !== newHoveredId) {
            hoveredRecordId = newHoveredId;
            if (mainAnimationFrameId === null) { animate(); }
        }
        
        // Check for line hover for tooltip
        const connectionObject = window.checkLineHit(mouseX, mouseY);
        
        // Pass raw client coordinates (plus scroll offset for absolute positioning)
        updateTooltip(clientX, clientY, dotRecord, connectionObject);
        
        // Trigger redraw for line dimming if line hover state changes
        if (connectionObject !== hoveredConnection) {
             if (mainAnimationFrameId === null) { animate(); }
        }
    });

    canvas.addEventListener('mouseout', () => {
         hoveredRecordId = null;
         hoveredConnection = null;
         updateTooltip(0, 0, null, null);
    });
}

// Execute initialization function immediately, now that the script is at the end of <body>
initializeApp();