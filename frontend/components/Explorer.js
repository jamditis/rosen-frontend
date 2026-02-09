
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { html } from '../html.js?v=3.0.1';
import { ExternalLink, RefreshCw, Download, Settings2, Network, Users, Building2, Lightbulb, Globe, Tags, Search, ChevronDown, ChevronUp, ArrowLeft, X } from 'lucide-react';
import { COLORS } from '../constants.js?v=3.0.1';
import { calculateEntityConnectionStrength, getEntitiesByRecord, fetchEntitiesData, areEntitiesLoaded, fetchRecordDetails } from '../services/archiveService.js?v=3.0.2';

// Connection mode configurations
const CONNECTION_MODES = {
  entities: { label: 'All Entities', icon: Globe, filter: null, description: 'Connect via any shared entity' },
  people: { label: 'People', icon: Users, filter: 'Person', description: 'Connect via shared people' },
  organizations: { label: 'Organizations', icon: Building2, filter: 'Organization', description: 'Connect via shared organizations' },
  concepts: { label: 'Concepts', icon: Lightbulb, filter: 'Concept', description: 'Connect via shared concepts' },
  key_concepts: { label: 'Key Concepts (Legacy)', icon: Tags, filter: 'legacy_concepts', description: 'Connect via key concepts array' },
  categories: { label: 'Categories (Legacy)', icon: Tags, filter: 'legacy_categories', description: 'Connect via thematic categories' }
};

// Grid size presets
const GRID_PRESETS = [
  { value: 441, label: '21x21 (441)', description: 'Compact view' },
  { value: 625, label: '25x25 (625)', description: 'Default - fits entity records' },
  { value: 900, label: '30x30 (900)', description: 'Medium density' },
  { value: 1600, label: '40x40 (1,600)', description: 'High density' },
  { value: 2500, label: '50x50 (2,500)', description: 'Maximum density' }
];

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 1200;
const DOT_RADIUS = 5;
const HOVER_SPEED = 0.1;
const PULSE_SPEED = 0.003;
const MIN_ANIMATION_DURATION = 1200;
const MAX_ANIMATION_DURATION = 2800;

const Explorer = ({ records, onBack }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const reqRef = useRef(null);

  const [entitiesReady, setEntitiesReady] = useState(false);
  const [nodes, setNodes] = useState([]);

  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [connections, setConnections] = useState([]);
  const [panelState, setPanelState] = useState('closed');

  const [searchTerm, setSearchTerm] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [recordDetails, setRecordDetails] = useState({});

  const [config, setConfig] = useState({
    connectionMode: 'entities',
    maxConnections: 30,
    gridSize: 625,
    recordFilter: 'articles',
    sortByProminence: true
  });

  // Close settings on ESC
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape' && settingsOpen) setSettingsOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [settingsOpen]);

  // Load entity data on mount
  useEffect(() => {
    if (!areEntitiesLoaded()) {
      fetchEntitiesData().then(() => setEntitiesReady(true));
    } else {
      setEntitiesReady(true);
    }
  }, []);

  // Fetch record details (summary, quote) when a node is selected
  useEffect(() => {
    if (selectedId === null) return;
    const node = nodes[selectedId];
    if (!node || node.isPlaceholder || recordDetails[node.id]) return;
    fetchRecordDetails(node.id).then(details => {
      if (details) {
        setRecordDetails(prev => ({ ...prev, [node.id]: details }));
      }
    });
  }, [selectedId, nodes]);

  // Filter records based on settings
  const filteredRecords = useMemo(() => {
    switch (config.recordFilter) {
      case 'articles':
        return records.filter(r => r.type === 'article');
      case 'with_entities':
        return records.filter(r => r.type === 'article' && getEntitiesByRecord(r.id).length > 0);
      default:
        return records;
    }
  }, [records, config.recordFilter, entitiesReady]);

  // Record filter options
  const RECORD_FILTERS = {
    articles: { label: 'Articles Only', description: 'Core archive articles' },
    with_entities: { label: 'With Entities', description: 'Records with extracted entities' },
    all: { label: 'All Records', description: 'Including social posts' }
  };

  const processData = useCallback(() => {
    const sorted = [...filteredRecords].sort((a, b) => a.date.localeCompare(b.date));

    const totalSlots = config.gridSize;
    const processed = [];

    const cols = Math.ceil(Math.sqrt(totalSlots));
    const baseDotRadius = Math.max(2, Math.min(DOT_RADIUS, 600 / cols));

    for (let i = 0; i < totalSlots; i++) {
      if (i < sorted.length) {
        const r = sorted[i];
        const cats = r.categories || [];
        const cons = r.concepts || [];
        const primaryVal = cats[0] || 'Other';
        const hash = primaryVal.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const colorTheme = COLORS[hash % COLORS.length] || COLORS[0];
        const hasEntities = entitiesReady && getEntitiesByRecord(r.id).length > 0;

        processed.push({
          ...r,
          numericId: i,
          x: 0,
          y: 0,
          color: colorTheme.text,
          baseRadius: hasEntities ? baseDotRadius : baseDotRadius * 0.7,
          currentRadius: hasEntities ? baseDotRadius : baseDotRadius * 0.7,
          isPlaceholder: false,
          hasEntities,
          aggregateConnectionCount: cons.length + cats.length
        });
      } else {
        processed.push({
          id: `placeholder-${i}`,
          title: 'Empty Slot',
          author: '',
          numericId: i,
          x: 0, y: 0,
          color: '#e5e7eb',
          baseRadius: baseDotRadius * 0.6,
          currentRadius: baseDotRadius * 0.6,
          isPlaceholder: true,
          aggregateConnectionCount: 0,
          verified: false,
          concepts: [],
          categories: [],
          relatedIds: []
        });
      }
    }

    const padding = 40;
    const effectiveWidth = CANVAS_WIDTH - (padding * 2);
    const effectiveHeight = CANVAS_HEIGHT - (padding * 2);
    const stepX = effectiveWidth / (cols - 1);
    const stepY = effectiveHeight / (cols - 1);

    processed.forEach((node, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      node.x = padding + col * stepX;
      node.y = padding + row * stepY;
    });

    setNodes(processed);
  }, [filteredRecords, config.gridSize]);

  useEffect(() => {
    processData();
  }, [processData]);

  const getConnectionStrength = useCallback((n1, n2) => {
    const modeConfig = CONNECTION_MODES[config.connectionMode];

    if (modeConfig.filter === 'legacy_concepts') {
      const arr1 = n1.concepts || [];
      const arr2 = n2.concepts || [];
      const shared = arr1.filter(x => arr2.includes(x));
      return {
        strength: shared.length,
        prominenceScore: shared.length,
        sharedEntities: shared.map(name => ({ name, type: 'Concept (legacy)' })),
        sharedValue: shared[0]
      };
    }

    if (modeConfig.filter === 'legacy_categories') {
      const arr1 = n1.categories || [];
      const arr2 = n2.categories || [];
      const shared = arr1.filter(x => arr2.includes(x));
      return {
        strength: shared.length,
        prominenceScore: shared.length,
        sharedEntities: shared.map(name => ({ name, type: 'Category' })),
        sharedValue: shared[0]
      };
    }

    const entityTypeFilter = modeConfig.filter;
    const result = calculateEntityConnectionStrength(n1.id, n2.id, entityTypeFilter);

    return {
      strength: result.strength,
      prominenceScore: result.prominenceScore,
      sharedEntities: result.sharedEntities,
      sharedValue: result.sharedEntities[0]?.name || null
    };
  }, [config.connectionMode]);

  const handleNodeClick = (node) => {
    if (node.isPlaceholder) return;

    if (selectedId === node.numericId) {
      setSelectedId(null);
      setConnections([]);
      setPanelState('closed');
      return;
    }

    setSelectedId(node.numericId);
    setPanelState('default');

    const newConnections = [];
    const now = Date.now();

    nodes.forEach(target => {
      if (target.numericId === node.numericId || target.isPlaceholder) return;

      const { strength, prominenceScore, sharedEntities, sharedValue } = getConnectionStrength(node, target);
      if (strength > 0) {
        newConnections.push({
          targetId: target.numericId,
          color: target.color,
          duration: Math.random() * (MAX_ANIMATION_DURATION - MIN_ANIMATION_DURATION) + MIN_ANIMATION_DURATION,
          startTime: now,
          horizontalFirst: Math.random() > 0.5,
          midPointRatio: Math.random() * 0.8 + 0.1,
          sharedValue,
          strength,
          prominenceScore,
          sharedEntities
        });
      }
    });

    if (config.sortByProminence) {
      newConnections.sort((a, b) => b.prominenceScore - a.prominenceScore);
    } else {
      newConnections.sort((a, b) => b.strength - a.strength);
    }
    setConnections(newConnections.slice(0, config.maxConnections));
  };

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const now = Date.now();
    const isLocked = selectedId !== null;

    if (selectedId !== null && connections.length > 0) {
      const source = nodes[selectedId];

      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';

      connections.forEach(conn => {
        const target = nodes[conn.targetId];
        const elapsed = now - conn.startTime;
        const progress = Math.min(1, elapsed / conn.duration);

        ctx.strokeStyle = conn.color;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);

        let p1 = { x: 0, y: 0 };
        let p2 = { x: 0, y: 0 };

        if (conn.horizontalFirst) {
            const midX = source.x + (target.x - source.x) * conn.midPointRatio;
            p1 = { x: midX, y: source.y };
            p2 = { x: midX, y: target.y };
        } else {
            const midY = source.y + (target.y - source.y) * conn.midPointRatio;
            p1 = { x: source.x, y: midY };
            p2 = { x: target.x, y: midY };
        }

        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(target.x, target.y);

        ctx.globalAlpha = progress;
        ctx.stroke();
      });
    }

    let hoveredNode = null;

    nodes.forEach(node => {
      const isSelected = selectedId === node.numericId;
      const isConnected = connections.some(c => c.targetId === node.numericId);
      const isHovered = hoveredId === node.numericId;

      if (isHovered) hoveredNode = node;

      let targetR = node.baseRadius;
      if (isSelected) targetR = node.baseRadius * 1.5;
      else if (isHovered) targetR = node.baseRadius * 2.5;
      else if (isConnected) {
          const pulse = Math.sin(now * PULSE_SPEED + node.numericId) * 2;
          targetR = node.baseRadius * 1.5 + pulse;
      } else if (isLocked) {
          targetR = node.baseRadius * 0.8;
      }

      node.currentRadius += (targetR - node.currentRadius) * HOVER_SPEED;

      let alpha = 1;
      if (node.isPlaceholder) alpha = 0.2;
      else if (isLocked && !isSelected && !isConnected) alpha = 0.15;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = node.color;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.currentRadius, 0, Math.PI * 2);
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = '#1c1917';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // Draw Tooltip
    if (hoveredNode && !hoveredNode.isPlaceholder) {
        const padding = 8;
        const x = hoveredNode.x + 15;
        const y = hoveredNode.y - 15;

        ctx.font = 'bold 12px "Roboto Mono", monospace';
        const titleWidth = ctx.measureText(hoveredNode.title).width;
        const yearWidth = ctx.measureText(hoveredNode.year).width;
        const width = Math.max(titleWidth, yearWidth) + padding * 2;
        const height = 40;

        let finalX = x;
        if (x + width > CANVAS_WIDTH) finalX = hoveredNode.x - width - 15;

        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(28, 25, 23, 0.9)';
        ctx.beginPath();
        if(ctx.roundRect) ctx.roundRect(finalX, y, width, height, 4);
        else ctx.rect(finalX, y, width, height);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'top';
        ctx.fillText(hoveredNode.title, finalX + padding, y + padding);

        ctx.font = 'normal 10px "Roboto Mono", monospace';
        ctx.fillStyle = '#d6d3d1';
        ctx.fillText(hoveredNode.year, finalX + padding, y + padding + 16);
    }

    reqRef.current = requestAnimationFrame(draw);
  }, [nodes, selectedId, hoveredId, connections]);

  useEffect(() => {
    reqRef.current = requestAnimationFrame(draw);
    return () => {
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
    };
  }, [draw]);

  const handleCanvasMouseMove = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    let foundId = null;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (n.isPlaceholder) continue;
      const dx = n.x - x;
      const dy = n.y - y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < n.currentRadius + 5) {
        foundId = n.numericId;
        break;
      }
    }
    setHoveredId(foundId);
  };

  const handleCanvasClick = (e) => {
    if (hoveredId !== null) {
      handleNodeClick(nodes[hoveredId]);
    } else if (selectedId !== null) {
        setSelectedId(null);
        setConnections([]);
        setPanelState('closed');
    }
  };

  const exportImage = () => {
      if (!canvasRef.current) return;

      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = CANVAS_WIDTH;
      exportCanvas.height = CANVAS_HEIGHT;
      const ctx = exportCanvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#fdfbf7';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.drawImage(canvasRef.current, 0, 0);

      if (selectedId !== null) {
          const node = nodes[selectedId];
          const padding = 40;
          const cardWidth = 600;
          const x = 40;

          ctx.font = 'bold 36px "Special Elite", serif';
          const words = node.title.split(' ');
          const lines = [];
          let currentLine = words[0];

          for (let i = 1; i < words.length; i++) {
              const width = ctx.measureText(currentLine + " " + words[i]).width;
              if (width < cardWidth - (padding * 2)) {
                  currentLine += " " + words[i];
              } else {
                  lines.push(currentLine);
                  currentLine = words[i];
              }
          }
          lines.push(currentLine);

          const titleLineHeight = 44;
          const titleBlockHeight = lines.length * titleLineHeight;
          const metadataBlockHeight = 120;
          const cardHeight = padding + titleBlockHeight + 30 + metadataBlockHeight;

          const y = CANVAS_HEIGHT - cardHeight - 40;

          ctx.shadowColor = "rgba(0, 0, 0, 0.15)";
          ctx.shadowBlur = 30;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 15;

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x, y, cardWidth, cardHeight);
          ctx.shadowColor = "transparent";

          ctx.strokeStyle = '#1c1917';
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, cardWidth, cardHeight);

          ctx.fillStyle = '#1c1917';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';

          let cursorY = y + padding;

          ctx.font = 'bold 14px "Roboto Mono", monospace';
          ctx.fillStyle = '#a8a29e';
          ctx.fillText(`ID: ${node.id}`, x + padding, cursorY);
          cursorY += 30;

          ctx.font = 'bold 36px "Special Elite", serif';
          ctx.fillStyle = '#1c1917';
          lines.forEach(line => {
             ctx.fillText(line, x + padding, cursorY);
             cursorY += titleLineHeight;
          });
          cursorY += 30;

          ctx.font = 'bold 18px "Roboto Mono", monospace';
          ctx.fillStyle = '#44403c';
          ctx.fillText(`By ${node.author || 'Jay Rosen'}`, x + padding, cursorY);
          cursorY += 26;

          ctx.font = '16px "Roboto Mono", monospace';
          ctx.fillStyle = '#78716c';
          ctx.fillText(`${node.date} • ${node.pub}`, x + padding, cursorY);

          const brandText = "Jay Rosen Internet Archive";
          ctx.font = '14px "Special Elite", cursive';
          ctx.fillStyle = '#d6d3d1';
          ctx.textAlign = 'right';
          ctx.fillText(brandText, x + cardWidth - padding, y + cardHeight - 25);
      }

      const link = document.createElement('a');
      link.download = selectedId !== null ? `jrda-record-${nodes[selectedId].id}.png` : 'archive-network.png';
      link.href = exportCanvas.toDataURL();
      link.click();
  };

  const rawSelectedNode = selectedId !== null ? nodes[selectedId] : null;
  const selectedNode = rawSelectedNode ? { ...rawSelectedNode, ...(recordDetails[rawSelectedNode.id] || {}) } : null;
  const connectedNodes = connections
    .map(c => ({
      ...nodes[c.targetId],
      strength: c.strength,
      prominenceScore: c.prominenceScore,
      sharedEntities: c.sharedEntities || []
    }))
    .sort((a, b) => config.sortByProminence ? b.prominenceScore - a.prominenceScore : b.strength - a.strength);

  const currentModeConfig = CONNECTION_MODES[config.connectionMode];

  // Category-to-color mapping for legend
  const categoryColors = useMemo(() => {
    const uniqueCategories = new Map();
    records.forEach(r => {
      const primaryCat = r.categories[0] || 'Other';
      if (!uniqueCategories.has(primaryCat)) {
        const hash = primaryCat.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const colorTheme = COLORS[hash % COLORS.length] || COLORS[0];
        uniqueCategories.set(primaryCat, colorTheme);
      }
    });
    return Array.from(uniqueCategories.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [records]);

  return html`
    <div className="flex flex-col h-screen bg-[#fdfbf7]" ref=${containerRef}>

      <!-- Toolbar -->
      <header className="sticky top-0 z-30 bg-paper border-b border-stone-300 shadow-sm shrink-0">
        <div className="px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick=${onBack}
              className="flex items-center gap-1.5 text-stone-600 hover:text-stone-900 transition-colors"
            >
              <${ArrowLeft} className="w-4 h-4" />
              <span className="text-xs font-bold hidden sm:inline">Archive</span>
            </button>
            <div className="h-5 w-px bg-stone-300 hidden sm:block"></div>
            <div className="flex items-center gap-2">
              <${Network} className="w-4 h-4 text-stone-700" />
              <span className="font-display font-bold text-stone-900 text-sm">Network explorer</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-500 bg-stone-100 px-2 py-1 rounded border border-stone-200 hidden sm:inline-block">
              ${filteredRecords.length} records
            </span>
            <button
              onClick=${processData}
              className="p-2 bg-white border border-stone-300 rounded hover:bg-stone-50 text-stone-600 transition-colors"
              title="Reset layout"
            >
              <${RefreshCw} className="w-3.5 h-3.5" />
            </button>
            <button
              onClick=${exportImage}
              className="p-2 bg-white border border-stone-300 rounded hover:bg-stone-50 text-stone-600 transition-colors"
              title=${selectedId !== null ? "Export record card" : "Export graph"}
            >
              <${Download} className="w-3.5 h-3.5" />
            </button>
            <button
              onClick=${() => setSettingsOpen(true)}
              className="p-2 bg-white border border-stone-300 rounded hover:bg-stone-50 text-stone-600 transition-colors"
              title="Settings"
            >
              <${Settings2} className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      <!-- Settings sidebar overlay -->
      ${settingsOpen && html`
        <div className="fixed inset-0 z-40" onClick=${() => setSettingsOpen(false)}>
          <div className="absolute inset-0 bg-stone-900/30"></div>
        </div>
      `}

      <!-- Settings sidebar -->
      <div className="fixed top-0 right-0 z-50 h-full w-80 bg-white border-l border-stone-300 shadow-xl overflow-y-auto"
           style=${{ transform: settingsOpen ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.2s ease-out' }}>
        <div className="p-4 border-b border-stone-200 flex items-center justify-between">
          <h3 className="font-display font-bold text-stone-900 text-sm">Settings</h3>
          <button onClick=${() => setSettingsOpen(false)} className="p-1 text-stone-400 hover:text-stone-700 transition-colors">
            <${X} className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-5 text-sm">
          <!-- Connection mode -->
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Connect by</label>
            <div className="space-y-1">
              ${Object.entries(CONNECTION_MODES).map(([key, mode]) => html`
                <button
                  key=${key}
                  onClick=${() => setConfig({...config, connectionMode: key})}
                  className=${`w-full text-left px-3 py-1.5 rounded flex items-center gap-2 transition-colors ${
                    config.connectionMode === key
                      ? 'bg-stone-800 text-white'
                      : 'bg-stone-50 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  <${mode.icon} className="w-4 h-4" />
                  <span className="flex-1">${mode.label}</span>
                </button>
              `)}
            </div>
            <p className="text-xs text-stone-400 mt-2 italic">${currentModeConfig.description}</p>
          </div>

          <!-- Grid density -->
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Grid density</label>
            <div className="space-y-1">
              ${GRID_PRESETS.map(preset => html`
                <button
                  key=${preset.value}
                  onClick=${() => setConfig({...config, gridSize: preset.value})}
                  className=${`w-full text-left px-3 py-1.5 rounded flex items-center justify-between transition-colors ${
                    config.gridSize === preset.value
                      ? 'bg-stone-800 text-white'
                      : 'bg-stone-50 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  <span>${preset.label}</span>
                  <span className="text-xs opacity-75">${preset.description}</span>
                </button>
              `)}
            </div>
            <p className="text-xs text-stone-400 mt-2">
              ${filteredRecords.length > config.gridSize
                ? `${filteredRecords.length - config.gridSize} records won't fit`
                : `${config.gridSize - filteredRecords.length} empty slots`
              }
            </p>
          </div>

          <!-- Record filter -->
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Show records</label>
            <div className="space-y-1">
              ${Object.entries(RECORD_FILTERS).map(([key, filter]) => html`
                <button
                  key=${key}
                  onClick=${() => setConfig({...config, recordFilter: key})}
                  className=${`w-full text-left px-3 py-1.5 rounded flex items-center justify-between transition-colors ${
                    config.recordFilter === key
                      ? 'bg-stone-800 text-white'
                      : 'bg-stone-50 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  <span>${filter.label}</span>
                  <span className="text-xs opacity-75">${filter.description}</span>
                </button>
              `)}
            </div>
            <p className="text-xs text-stone-400 mt-2">
              Showing ${filteredRecords.length} records
            </p>
          </div>

          <!-- Advanced -->
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Advanced</label>
            <div className="space-y-3">
              <div>
                <label className="block text-stone-600 mb-1">Max connections: ${config.maxConnections}</label>
                <input
                  type="range"
                  min="5" max="100"
                  value=${config.maxConnections}
                  onChange=${(e) => setConfig({...config, maxConnections: Number(e.target.value)})}
                  className="w-full accent-stone-900"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked=${config.sortByProminence}
                  onChange=${(e) => setConfig({...config, sortByProminence: e.target.checked})}
                  className="rounded border-stone-300 accent-stone-900"
                />
                <span className="text-stone-700">Sort by prominence score</span>
              </label>
              <p className="text-xs text-stone-400">When enabled, connections are weighted by entity importance</p>
            </div>
          </div>

          <!-- Color legend -->
          <div className="border-t border-stone-200 pt-4">
            <button
              onClick=${() => setLegendOpen(s => !s)}
              className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider text-stone-500 hover:text-stone-700"
            >
              <span>Color legend</span>
              <${legendOpen ? ChevronUp : ChevronDown} className="w-3 h-3" />
            </button>
            ${legendOpen && html`
              <div className="flex flex-col gap-1.5 text-xs mt-3 max-h-[250px] overflow-y-auto pr-1">
                ${categoryColors.map(([category, color]) => html`
                  <div key=${category} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style=${{ backgroundColor: color.text }}
                    />
                    <span className="text-stone-700 truncate" title=${category}>${category}</span>
                  </div>
                `)}
              </div>
            `}
          </div>
        </div>
      </div>

      <!-- Canvas area -->
      <div className="flex-grow relative overflow-hidden">
        <!-- Search overlay -->
        <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
          ${!entitiesReady && html`
            <div className="bg-white/90 backdrop-blur-sm border border-stone-200 rounded px-3 py-2 shadow-sm flex items-center gap-2 text-sm text-stone-600">
              <div className="animate-spin w-4 h-4 border-2 border-stone-300 border-t-stone-800 rounded-full"></div>
              Loading entity data...
            </div>
          `}
          <div className="relative">
            <${Search} className="absolute left-2.5 top-2.5 w-4 h-4 text-stone-400" />
            <input
              type="text"
              value=${searchTerm}
              onInput=${(e) => {
                const val = e.target.value;
                setSearchTerm(val);
                if (val.length > 2) {
                  const term = val.toLowerCase();
                  const match = nodes.find(n => !n.isPlaceholder && n.title && n.title.toLowerCase().includes(term));
                  if (match) {
                    handleNodeClick(match);
                  }
                } else if (val.length === 0) {
                  setSelectedId(null);
                  setConnections([]);
                  setPanelState('closed');
                }
              }}
              placeholder="Find a record..."
              className="w-56 pl-9 pr-3 py-2 bg-white/90 backdrop-blur-sm border border-stone-300 rounded shadow-sm text-sm font-body focus:outline-none focus:border-stone-800"
            />
          </div>
        </div>

        <div className="h-full flex justify-center items-center p-4 sm:p-8 cursor-crosshair">
          <canvas
            ref=${canvasRef}
            width=${CANVAS_WIDTH}
            height=${CANVAS_HEIGHT}
            onMouseMove=${handleCanvasMouseMove}
            onClick=${handleCanvasClick}
            className="max-w-full h-auto object-contain border border-stone-200 rounded shadow-sm bg-white/50"
            style=${{ maxHeight: '75vh' }}
          />
        </div>
      </div>

      <!-- Detail panel -->
      ${selectedNode && panelState !== 'closed' && html`
        <div
          className=${`
            border-t border-stone-300 bg-white shrink-0 flex flex-col
            explorer-detail-panel
            ${panelState === 'maximized' ? 'h-[80vh]' : panelState === 'minimized' ? 'h-12' : 'h-[40vh]'}
          `}
          style=${{ transition: 'height 0.3s ease-out' }}
        >
          <!-- Panel header -->
          <div className="flex items-center justify-between px-4 h-12 border-b border-stone-200 bg-stone-50 shrink-0 cursor-pointer"
               onClick=${() => setPanelState(s => s === 'minimized' ? 'default' : s)}>
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex gap-1.5 mr-2 shrink-0">
                <button
                  onClick=${(e) => { e.stopPropagation(); setPanelState('closed'); setSelectedId(null); setConnections([]); }}
                  className="w-3 h-3 rounded-full bg-red-400 hover:bg-red-500"
                  title="Close"
                />
                <button
                  onClick=${(e) => { e.stopPropagation(); setPanelState('minimized'); }}
                  className="w-3 h-3 rounded-full bg-yellow-400 hover:bg-yellow-500"
                  title="Minimize"
                />
                <button
                  onClick=${(e) => { e.stopPropagation(); setPanelState(s => s === 'maximized' ? 'default' : 'maximized'); }}
                  className="w-3 h-3 rounded-full bg-green-400 hover:bg-green-500"
                  title="Maximize"
                />
              </div>
              <span className="text-xs bg-stone-200 text-stone-600 px-1.5 rounded hidden sm:inline-block shrink-0">
                ${selectedNode.id}
              </span>
              <h3 className="font-bold font-display text-stone-800 truncate text-sm">
                ${selectedNode.title}
              </h3>
            </div>
            ${selectedNode.url && html`
              <a href=${selectedNode.url} target="_blank" rel="noreferrer"
                 className="text-xs text-blue-600 hover:underline flex items-center gap-1 shrink-0 ml-2"
                 onClick=${(e) => e.stopPropagation()}>
                View source <${ExternalLink} className="w-3 h-3" />
              </a>
            `}
          </div>

          <!-- Panel content (three-column grid) -->
          <div className=${`flex-grow overflow-y-auto ${panelState === 'minimized' ? 'hidden' : 'block'}`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-0 h-full">

              <!-- Column 1: Record details -->
              <div className="p-4 space-y-3 border-r border-stone-100 overflow-y-auto">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400">Record details</h4>
                <div className="text-sm text-stone-500 flex gap-3">
                  <span>${selectedNode.date}</span>
                  <span>·</span>
                  <span>${selectedNode.pub}</span>
                </div>

                <p className="text-stone-800 text-sm leading-relaxed">
                  ${selectedNode.summary || "No summary available."}
                </p>

                ${selectedNode.quote && html`
                  <blockquote className="border-l-4 border-stone-800 pl-3 italic text-stone-600 text-sm">
                    "${selectedNode.quote}"
                  </blockquote>
                `}

                <div className="pt-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">Concepts & categories</h4>
                  <div className="flex flex-wrap gap-1.5">
                    ${(selectedNode.concepts || []).concat(selectedNode.categories || []).map(tag => html`
                      <span key=${tag} className="px-2 py-0.5 bg-stone-100 text-stone-700 text-xs rounded border border-stone-200">
                        ${tag}
                      </span>
                    `)}
                  </div>
                </div>
              </div>

              <!-- Column 2: Extracted entities -->
              <div className="p-4 space-y-3 border-r border-stone-100 overflow-y-auto">
                ${(() => {
                  const nodeEntities = getEntitiesByRecord(selectedNode.id);
                  if (nodeEntities.length === 0) return html`
                    <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400">Extracted entities</h4>
                    <p className="text-sm text-stone-400 italic">No entities extracted for this record.</p>
                  `;

                  const grouped = nodeEntities.reduce((acc, e) => {
                    const type = e.type || 'Other';
                    if (!acc[type]) acc[type] = [];
                    acc[type].push(e);
                    return acc;
                  }, {});

                  return html`
                    <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400">Extracted entities (${nodeEntities.length})</h4>
                    <div className="space-y-3">
                      ${Object.entries(grouped).map(([type, entities]) => html`
                        <div key=${type}>
                          <div className="flex items-center gap-1 text-xs text-stone-500 mb-1">
                            ${type === 'Person' && html`<${Users} className="w-3 h-3" />`}
                            ${type === 'Organization' && html`<${Building2} className="w-3 h-3" />`}
                            ${type === 'Concept' && html`<${Lightbulb} className="w-3 h-3" />`}
                            <span>${type}s (${entities.length})</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            ${entities.slice(0, 10).map(e => html`
                              <span
                                key=${e.id}
                                className="px-2 py-0.5 text-xs rounded-full bg-stone-50 text-stone-600 border border-stone-200"
                                title=${e.role ? `${e.name} - ${e.role}` : e.name}
                              >
                                ${e.name}
                              </span>
                            `)}
                            ${entities.length > 10 && html`
                              <span className="px-2 py-0.5 text-xs rounded-full bg-stone-100 text-stone-400">
                                +${entities.length - 10} more
                              </span>
                            `}
                          </div>
                        </div>
                      `)}
                    </div>
                  `;
                })()}
              </div>

              <!-- Column 3: Connected records -->
              <div className="p-4 space-y-3 overflow-y-auto">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                  <${currentModeConfig.icon} className="w-3 h-3" />
                  Connected via ${currentModeConfig.label.toLowerCase()} (${connectedNodes.length})
                </h4>
                <div className="space-y-2 pr-1 scrollbar-thin">
                  ${connectedNodes.length === 0 ? html`
                    <p className="text-sm text-stone-400 italic">No connections found. Try a different connection mode.</p>
                  ` : (
                    connectedNodes.map(node => html`
                      <button
                        key=${node.numericId}
                        onClick=${() => handleNodeClick(node)}
                        className="w-full text-left p-2.5 hover:bg-stone-50 rounded border border-stone-100 hover:border-stone-300 transition-all group"
                      >
                        <div className="text-xs font-bold text-stone-700 group-hover:text-stone-900 line-clamp-2">
                          ${node.title}
                        </div>
                        <div className="text-[11px] text-stone-400 mt-0.5">
                          ${node.year} · ${node.pub}
                        </div>
                        ${node.sharedEntities && node.sharedEntities.length > 0 && html`
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            ${node.sharedEntities.slice(0, 3).map((entity, idx) => html`
                              <span
                                key=${idx}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded-full bg-stone-100 text-stone-600"
                                title=${entity.type ? `${entity.type}: ${entity.name}` : entity.name}
                              >
                                ${entity.type === 'Person' && html`<${Users} className="w-2.5 h-2.5" />`}
                                ${entity.type === 'Organization' && html`<${Building2} className="w-2.5 h-2.5" />`}
                                ${entity.type === 'Concept' && html`<${Lightbulb} className="w-2.5 h-2.5" />`}
                                ${entity.name?.substring(0, 15)}${entity.name?.length > 15 ? '...' : ''}
                              </span>
                            `)}
                            ${node.sharedEntities.length > 3 && html`
                              <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-stone-200 text-stone-500">
                                +${node.sharedEntities.length - 3}
                              </span>
                            `}
                          </div>
                        `}
                        <div className="text-[10px] text-stone-400 mt-1.5 flex justify-between items-center border-t border-stone-100 pt-1">
                          <span>${node.strength} shared ${node.strength === 1 ? 'entity' : 'entities'}</span>
                          <span className="font-mono text-stone-500">Score: ${node.prominenceScore}</span>
                        </div>
                      </button>
                    `)
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      `}
    </div>
  `;
};

export default Explorer;
