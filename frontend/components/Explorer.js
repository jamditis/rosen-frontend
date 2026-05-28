
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { html } from '../html.js?v=3.4.0';
import { ExternalLink, RefreshCw, Download, Settings2, Network, Users, Building2, Lightbulb, Globe, Tags, Search, ChevronDown, ChevronUp, ArrowLeft, X } from 'lucide-react';
import { COLORS } from '../constants.js?v=3.4.0';
import { calculateEntityConnectionStrength, getEntitiesByRecord, fetchEntitiesData, areEntitiesLoaded, fetchRecordDetails } from '../services/archiveService.js?v=3.4.0';

// Connection mode configurations
const CONNECTION_MODES = {
  entities: { label: 'All Entities', icon: Globe, filter: null, description: 'Connect via any shared entity' },
  people: { label: 'People', icon: Users, filter: 'Person', description: 'Connect via shared people' },
  organizations: { label: 'Organizations', icon: Building2, filter: 'Organization', description: 'Connect via shared organizations' },
  concepts: { label: 'Concepts', icon: Lightbulb, filter: 'Concept', description: 'Connect via shared concepts' },
  key_concepts: { label: 'Key Concepts (Legacy)', icon: Tags, filter: 'legacy_concepts', description: 'Connect via key concepts array' },
  categories: { label: 'Categories (Legacy)', icon: Tags, filter: 'legacy_categories', description: 'Connect via thematic categories' }
};

// Maximum grid slots for usability (dots become too small to click beyond this)
const MAX_GRID_SLOTS = 2500;

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 1200;
const DOT_RADIUS = 5;
const HOVER_SPEED = 0.15;
const PULSE_SPEED = 0.003;
const IDLE_DRIFT_SPEED = 0.0008;
const IDLE_DRIFT_AMOUNT = 1.5;
const MIN_ANIMATION_DURATION = 800;
const MAX_ANIMATION_DURATION = 3200;
const TRAVELER_SPEED = 0.0004;
const CONNECTION_STAGGER_MS = 60;

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

  // Auto-compute grid to fit all filtered records (capped at MAX_GRID_SLOTS)
  const gridInfo = useMemo(() => {
    const count = Math.min(filteredRecords.length, MAX_GRID_SLOTS);
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const totalSlots = cols * rows;
    const capped = filteredRecords.length > MAX_GRID_SLOTS;
    return { count, cols, rows, totalSlots, capped };
  }, [filteredRecords.length]);

  const processData = useCallback(() => {
    // Sort by entity connections (most connected first) so important records
    // are always visible when the set is capped
    let sorted;
    if (gridInfo.capped) {
      sorted = [...filteredRecords].sort((a, b) => {
        const aEntities = entitiesReady ? getEntitiesByRecord(a.id).length : 0;
        const bEntities = entitiesReady ? getEntitiesByRecord(b.id).length : 0;
        return bEntities - aEntities || a.date.localeCompare(b.date);
      }).slice(0, gridInfo.count);
    } else {
      sorted = [...filteredRecords].sort((a, b) => a.date.localeCompare(b.date));
    }

    const { cols, totalSlots } = gridInfo;
    const processed = [];
    const baseDotRadius = Math.max(2, Math.min(DOT_RADIUS, 600 / cols));

    for (let i = 0; i < totalSlots; i++) {
      if (i < sorted.length) {
        const r = sorted[i];
        const cats = r.categories || [];
        const cons = r.concepts || [];
        const primaryVal = cats[0] || 'Other';
        const hash = primaryVal.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const colorTheme = COLORS[hash % COLORS.length] || COLORS[0];
        const entityList = entitiesReady ? getEntitiesByRecord(r.id) : [];
        const hasEntities = entityList.length > 0;
        const entityCount = entityList.length;
        const entityTypeCounts = entityList.reduce((acc, e) => {
          acc[e.type] = (acc[e.type] || 0) + 1;
          return acc;
        }, {});

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
          entityCount,
          entityTypeCounts,
          idleSeed: Math.random() * Math.PI * 2,
          aggregateConnectionCount: cons.length + cats.length
        });
      } else {
        // Partial last row — fill remaining cells as placeholders
        processed.push({
          id: `placeholder-${i}`,
          title: '',
          author: '',
          numericId: i,
          x: 0, y: 0,
          color: 'transparent',
          baseRadius: 0,
          currentRadius: 0,
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
    const stepX = cols > 1 ? effectiveWidth / (cols - 1) : 0;
    const stepY = gridInfo.rows > 1 ? effectiveHeight / (gridInfo.rows - 1) : 0;

    processed.forEach((node, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      node.x = padding + col * stepX;
      node.y = padding + row * stepY;
    });

    setNodes(processed);
  }, [filteredRecords, gridInfo, entitiesReady]);

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

    // Stagger start times for cascade animation effect
    const sliced = newConnections.slice(0, config.maxConnections);
    sliced.forEach((conn, i) => {
      conn.startTime = now + i * CONNECTION_STAGGER_MS;
    });
    setConnections(sliced);
  };

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const now = Date.now();
    const isLocked = selectedId !== null;

    // --- Draw connections with staggered cascade and traveling dots ---
    if (selectedId !== null && connections.length > 0) {
      const source = nodes[selectedId];

      ctx.lineCap = 'round';

      connections.forEach(conn => {
        const target = nodes[conn.targetId];
        const elapsed = now - conn.startTime;
        if (elapsed < 0) return; // hasn't started yet (stagger)

        const progress = Math.min(1, elapsed / conn.duration);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic

        // Compute Manhattan path points
        let p1, p2;
        if (conn.horizontalFirst) {
          const midX = source.x + (target.x - source.x) * conn.midPointRatio;
          p1 = { x: midX, y: source.y };
          p2 = { x: midX, y: target.y };
        } else {
          const midY = source.y + (target.y - source.y) * conn.midPointRatio;
          p1 = { x: source.x, y: midY };
          p2 = { x: target.x, y: midY };
        }

        // Draw the path up to the current animated progress
        const segments = [
          { from: { x: source.x, y: source.y }, to: p1 },
          { from: p1, to: p2 },
          { from: p2, to: { x: target.x, y: target.y } }
        ];

        // Calculate total path length
        const segLengths = segments.map(s =>
          Math.sqrt(Math.pow(s.to.x - s.from.x, 2) + Math.pow(s.to.y - s.from.y, 2))
        );
        const totalLen = segLengths.reduce((a, b) => a + b, 0);
        const drawLen = eased * totalLen;

        // Thicker lines for stronger connections
        const lineWidth = Math.min(2.5, 1 + conn.strength * 0.3);
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = conn.color;
        ctx.globalAlpha = 0.4 + eased * 0.4;

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);

        let remaining = drawLen;
        for (const seg of segments) {
          const segLen = Math.sqrt(Math.pow(seg.to.x - seg.from.x, 2) + Math.pow(seg.to.y - seg.from.y, 2));
          if (remaining >= segLen) {
            ctx.lineTo(seg.to.x, seg.to.y);
            remaining -= segLen;
          } else if (remaining > 0) {
            const t = remaining / segLen;
            ctx.lineTo(seg.from.x + (seg.to.x - seg.from.x) * t, seg.from.y + (seg.to.y - seg.from.y) * t);
            remaining = 0;
          }
        }
        ctx.stroke();

        // Traveling dot along completed connections
        if (progress >= 1) {
          const travelerT = ((now * TRAVELER_SPEED + conn.targetId * 0.3) % 1);
          const travelerLen = travelerT * totalLen;
          let tRemaining = travelerLen;
          let tx = source.x, ty = source.y;

          for (const seg of segments) {
            const segLen = Math.sqrt(Math.pow(seg.to.x - seg.from.x, 2) + Math.pow(seg.to.y - seg.from.y, 2));
            if (tRemaining >= segLen) {
              tRemaining -= segLen;
              tx = seg.to.x;
              ty = seg.to.y;
            } else {
              const st = tRemaining / segLen;
              tx = seg.from.x + (seg.to.x - seg.from.x) * st;
              ty = seg.from.y + (seg.to.y - seg.from.y) * st;
              break;
            }
          }

          ctx.globalAlpha = 0.9;
          ctx.fillStyle = conn.color;
          ctx.beginPath();
          ctx.arc(tx, ty, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // --- Draw nodes with ambient idle animation ---
    let hoveredNode = null;

    nodes.forEach(node => {
      const isSelected = selectedId === node.numericId;
      const isConnected = connections.some(c => c.targetId === node.numericId);
      const isHovered = hoveredId === node.numericId;

      if (isHovered) hoveredNode = node;

      // Ambient drift when idle (no selection)
      let drawX = node.x;
      let drawY = node.y;
      if (!isLocked && !node.isPlaceholder) {
        const seed = node.idleSeed || 0;
        drawX += Math.sin(now * IDLE_DRIFT_SPEED + seed) * IDLE_DRIFT_AMOUNT;
        drawY += Math.cos(now * IDLE_DRIFT_SPEED * 0.7 + seed * 1.3) * IDLE_DRIFT_AMOUNT;
      }

      let targetR = node.baseRadius;
      if (isSelected) targetR = node.baseRadius * 2;
      else if (isHovered) targetR = node.baseRadius * 3;
      else if (isConnected) {
        const pulse = Math.sin(now * PULSE_SPEED + node.numericId) * 2;
        targetR = node.baseRadius * 1.8 + pulse;
      } else if (isLocked) {
        targetR = node.baseRadius * 0.6;
      } else if (node.hasEntities) {
        // Subtle breathing for entity-bearing dots
        const breath = Math.sin(now * 0.002 + (node.idleSeed || 0)) * 0.5;
        targetR = node.baseRadius + breath;
      }

      node.currentRadius += (targetR - node.currentRadius) * HOVER_SPEED;

      let alpha = 1;
      if (node.isPlaceholder) alpha = 0.15;
      else if (isLocked && !isSelected && !isConnected) alpha = 0.1;

      // Glow effect for hovered and selected nodes
      if ((isHovered || isSelected) && !node.isPlaceholder) {
        ctx.globalAlpha = alpha * 0.25;
        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.arc(drawX, drawY, node.currentRadius * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = alpha;
      ctx.fillStyle = node.color;
      ctx.beginPath();
      ctx.arc(drawX, drawY, node.currentRadius, 0, Math.PI * 2);
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = '#1c1917';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Small inner ring for nodes with entities (when idle)
      if (!isLocked && node.hasEntities && !node.isPlaceholder && node.currentRadius > 3) {
        ctx.globalAlpha = alpha * 0.3;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(drawX, drawY, node.currentRadius * 0.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // --- Enhanced tooltip with entity info ---
    if (hoveredNode && !hoveredNode.isPlaceholder) {
      const pad = 10;
      const lineH = 16;

      ctx.font = 'bold 12px "Roboto Mono", monospace';
      const titleText = hoveredNode.title?.length > 50
        ? hoveredNode.title.substring(0, 47) + '...'
        : (hoveredNode.title || 'Untitled');
      const titleWidth = ctx.measureText(titleText).width;

      ctx.font = 'normal 10px "Roboto Mono", monospace';
      const metaText = `${hoveredNode.year || ''}  ·  ${hoveredNode.pub || ''}`;
      const metaWidth = ctx.measureText(metaText).width;

      const entityText = hoveredNode.entityCount > 0
        ? `${hoveredNode.entityCount} entities`
        : 'No entities extracted';
      const entityWidth = ctx.measureText(entityText).width;

      // Type breakdown line
      const typeEntries = Object.entries(hoveredNode.entityTypeCounts || {});
      const typeText = typeEntries.length > 0
        ? typeEntries.map(([t, c]) => `${c} ${t}`).join('  ·  ')
        : '';
      const typeWidth = typeText ? ctx.measureText(typeText).width : 0;

      const lines = typeText ? 4 : 3;
      const width = Math.max(titleWidth, metaWidth, entityWidth, typeWidth) + pad * 2;
      const height = pad * 2 + lines * lineH;

      let tx = hoveredNode.x + 18;
      let ty = hoveredNode.y - height - 5;
      if (tx + width > CANVAS_WIDTH - 10) tx = hoveredNode.x - width - 18;
      if (ty < 10) ty = hoveredNode.y + 18;

      ctx.globalAlpha = 0.95;
      ctx.fillStyle = 'rgba(28, 25, 23, 0.92)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(tx, ty, width, height, 6);
      else ctx.rect(tx, ty, width, height);
      ctx.fill();

      // Accent bar
      ctx.fillStyle = hoveredNode.color;
      ctx.fillRect(tx, ty, 3, height);

      let cursorY = ty + pad;
      ctx.textBaseline = 'top';

      // Title
      ctx.font = 'bold 12px "Roboto Mono", monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(titleText, tx + pad + 4, cursorY);
      cursorY += lineH;

      // Meta (year + pub)
      ctx.font = 'normal 10px "Roboto Mono", monospace';
      ctx.fillStyle = '#a8a29e';
      ctx.fillText(metaText, tx + pad + 4, cursorY);
      cursorY += lineH;

      // Entity count
      ctx.fillStyle = hoveredNode.entityCount > 0 ? '#86efac' : '#78716c';
      ctx.fillText(entityText, tx + pad + 4, cursorY);
      cursorY += lineH;

      // Type breakdown
      if (typeText) {
        ctx.fillStyle = '#d6d3d1';
        ctx.fillText(typeText, tx + pad + 4, cursorY);
      }
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
              ${gridInfo.capped ? `${gridInfo.count.toLocaleString()} of ${filteredRecords.length.toLocaleString()}` : filteredRecords.length.toLocaleString()} records
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

          <!-- Grid info -->
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Grid layout</label>
            <div className="bg-stone-50 rounded px-3 py-2 text-xs text-stone-600 space-y-1">
              <div className="flex justify-between">
                <span>Grid</span>
                <span className="font-mono">${gridInfo.cols} x ${gridInfo.rows}</span>
              </div>
              <div className="flex justify-between">
                <span>Records shown</span>
                <span className="font-mono">${gridInfo.count}</span>
              </div>
              ${gridInfo.capped && html`
                <p className="text-amber-600 text-xs mt-1">
                  Showing ${gridInfo.count.toLocaleString()} of ${filteredRecords.length.toLocaleString()} (most connected first)
                </p>
              `}
            </div>
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
              ${filteredRecords.length.toLocaleString()} records → ${gridInfo.cols}x${gridInfo.rows} grid
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
          ${entitiesReady && selectedId === null && html`
            <div className="bg-white/90 backdrop-blur-sm border border-stone-200 rounded px-3 py-2 shadow-sm text-xs text-stone-500 max-w-[220px] leading-relaxed">
              <span className="font-bold text-stone-700">Click any dot</span> to discover which records share people, organizations, and concepts. Larger dots have more entity connections.
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
