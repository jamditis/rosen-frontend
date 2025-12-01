
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { html } from '../html.js';
import { ExternalLink, RefreshCw, Download, Settings2, Network } from 'lucide-react';
import { COLORS } from '../constants.js';

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 1200;
const DOT_RADIUS = 5;
const HOVER_SPEED = 0.1;
const PULSE_SPEED = 0.003;
const MIN_ANIMATION_DURATION = 1200;
const MAX_ANIMATION_DURATION = 2800;

const Explorer = ({ records }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const reqRef = useRef(null);
  
  const [nodes, setNodes] = useState([]);
  const [gridSize, setGridSize] = useState(441);
  
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [connections, setConnections] = useState([]);
  const [panelState, setPanelState] = useState('closed');
  
  const [config, setConfig] = useState({
    connectionField: 'key_concepts',
    maxConnections: 30,
    snapToGrid: true,
    showSettings: false
  });

  const processData = useCallback(() => {
    const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
    
    const totalSlots = gridSize;
    const processed = [];

    for (let i = 0; i < totalSlots; i++) {
      if (i < sorted.length) {
        const r = sorted[i];
        const primaryVal = r.categories[0] || 'Other';
        const hash = primaryVal.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const colorTheme = COLORS[hash % COLORS.length] || COLORS[0];

        processed.push({
          ...r,
          numericId: i,
          x: 0, 
          y: 0,
          color: colorTheme.text,
          baseRadius: DOT_RADIUS,
          currentRadius: DOT_RADIUS,
          isPlaceholder: false,
          aggregateConnectionCount: r.concepts.length + r.categories.length
        });
      } else {
        processed.push({
          ...sorted[0],
          id: `placeholder-${i}`,
          title: 'Empty Slot',
          author: '',
          numericId: i,
          x: 0, y: 0,
          color: '#e5e7eb',
          baseRadius: DOT_RADIUS * 0.6,
          currentRadius: DOT_RADIUS * 0.6,
          isPlaceholder: true,
          aggregateConnectionCount: 0,
          verified: false
        });
      }
    }

    const cols = Math.ceil(Math.sqrt(totalSlots));
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
  }, [records, gridSize]);

  useEffect(() => {
    processData();
  }, [processData]);

  const getConnectionStrength = (n1, n2) => {
    const field = config.connectionField === 'key_concepts' ? 'concepts' : 'categories';
    const arr1 = n1[field] || [];
    const arr2 = n2[field] || [];
    const shared = arr1.filter(x => arr2.includes(x));
    return { strength: shared.length, sharedValue: shared[0] };
  };

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
      
      const { strength, sharedValue } = getConnectionStrength(node, target);
      if (strength > 0) {
        newConnections.push({
          targetId: target.numericId,
          color: target.color,
          duration: Math.random() * (MAX_ANIMATION_DURATION - MIN_ANIMATION_DURATION) + MIN_ANIMATION_DURATION,
          startTime: now,
          horizontalFirst: Math.random() > 0.5,
          midPointRatio: Math.random() * 0.8 + 0.1,
          sharedValue,
          strength
        });
      }
    });

    newConnections.sort((a, b) => b.strength - a.strength);
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

          const brandText = "Jay Rosen Digital Archive";
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

  const selectedNode = selectedId !== null ? nodes[selectedId] : null;
  const connectedNodes = connections
    .map(c => ({ ...nodes[c.targetId], strength: c.strength }))
    .sort((a, b) => b.strength - a.strength);

  // Calculate category-to-color mapping for legend
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
    <div className="relative flex flex-col w-full" style=${{ minHeight: '80vh' }} ref=${containerRef}>
        
        <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 items-end">
            <div className="flex gap-2">
                <button 
                    onClick=${processData}
                    className="p-2 bg-white border border-stone-300 rounded shadow-sm hover:bg-stone-50 text-stone-600"
                    title="Reset Layout"
                >
                    <${RefreshCw} className="w-4 h-4" />
                </button>
                <button 
                    onClick=${exportImage}
                    className="p-2 bg-white border border-stone-300 rounded shadow-sm hover:bg-stone-50 text-stone-600"
                    title=${selectedId !== null ? "Export Record Card" : "Export Graph"}
                >
                    <${Download} className="w-4 h-4" />
                </button>
                <button 
                    onClick=${() => setConfig(c => ({...c, showSettings: !c.showSettings}))}
                    className=${`p-2 border border-stone-300 rounded shadow-sm text-stone-600 ${config.showSettings ? 'bg-stone-100' : 'bg-white'}`}
                    title="Settings"
                >
                    <${Settings2} className="w-4 h-4" />
                </button>
            </div>

            ${config.showSettings && html`
                <div className="bg-white border border-stone-300 rounded shadow-lg p-4 w-64 animate-fade-in text-sm space-y-4">
                    <div>
                        <label className="block font-bold text-stone-600 mb-1">Connect by:</label>
                        <select 
                            value=${config.connectionField}
                            onChange=${(e) => setConfig({...config, connectionField: e.target.value})}
                            className="w-full border border-stone-300 p-1.5 rounded text-stone-700"
                        >
                            <option value="key_concepts">Key Concepts</option>
                            <option value="thematic_categories">Categories</option>
                        </select>
                    </div>
                    <div>
                        <label className="block font-bold text-stone-600 mb-1">Max Connections: ${config.maxConnections}</label>
                        <input 
                            type="range" 
                            min="5" max="50" 
                            value=${config.maxConnections}
                            onChange=${(e) => setConfig({...config, maxConnections: Number(e.target.value)})}
                            className="w-full accent-stone-900"
                        />
                    </div>
                </div>
            `}
        </div>

        <div className="absolute top-16 right-4 z-20 bg-white/95 backdrop-blur-sm border border-stone-300 rounded shadow-lg p-3 max-w-[180px]">
            <h4 className="text-xs font-bold text-stone-600 mb-2 uppercase tracking-wider">Category Colors</h4>
            <div className="flex flex-col gap-1.5 text-xs max-h-[300px] overflow-y-auto">
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
        </div>

        <div className="flex-grow bg-paper flex justify-center overflow-hidden cursor-crosshair">
            <canvas
                ref=${canvasRef}
                width=${CANVAS_WIDTH}
                height=${CANVAS_HEIGHT}
                onMouseMove=${handleCanvasMouseMove}
                onClick=${handleCanvasClick}
                className="max-w-full h-auto object-contain"
                style=${{ maxHeight: '85vh' }}
            />
        </div>

        ${selectedNode && panelState !== 'closed' && html`
            <div 
                className=${`
                    fixed bottom-0 left-0 right-0 bg-white border-t border-stone-300 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] 
                    z-30 transition-all duration-300 ease-out flex flex-col
                    ${panelState === 'maximized' ? 'h-[90vh]' : panelState === 'minimized' ? 'h-12' : 'h-[40vh]'}
                `}
            >
                <div className="flex items-center justify-between px-4 h-12 border-b border-stone-200 bg-stone-50 shrink-0" onClick=${() => setPanelState(s => s === 'minimized' ? 'default' : s)}>
                    <div className="flex items-center gap-2">
                        <div className="flex gap-1.5 mr-2">
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
                        <h3 className="font-bold font-display text-stone-800 truncate max-w-[200px] sm:max-w-md">
                            ${selectedNode.title}
                        </h3>
                        <span className="text-xs bg-stone-200 text-stone-600 px-1.5 rounded hidden sm:inline-block">
                            ID: {selectedNode.id}
                        </span>
                    </div>
                    ${selectedNode.url && html`
                        <a href=${selectedNode.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                            View Source <${ExternalLink} className="w-3 h-3" />
                        </a>
                    `}
                </div>

                <div className=${`flex-grow overflow-y-auto p-6 font-body ${panelState === 'minimized' ? 'hidden' : 'block'}`}>
                    <div className="flex flex-col md:flex-row gap-8">
                        <div className="flex-1 space-y-4">
                            <div className="text-sm text-stone-500 flex gap-3">
                                <span>${selectedNode.date}</span>
                                <span>•</span>
                                <span>${selectedNode.pub}</span>
                            </div>
                            
                            <p className="text-stone-800 leading-relaxed">
                                ${selectedNode.summary || "No summary available."}
                            </p>
                            
                            ${selectedNode.quote && html`
                                <blockquote className="border-l-4 border-stone-800 pl-4 italic text-stone-600 my-4">
                                    "${selectedNode.quote}"
                                </blockquote>
                            `}

                            <div className="space-y-2 pt-4">
                                <h4 className="text-xs font-bold uppercase text-stone-400">Concepts & Categories</h4>
                                <div className="flex flex-wrap gap-2">
                                    ${selectedNode.concepts.concat(selectedNode.categories).map(tag => html`
                                        <span key=${tag} className="px-2 py-1 bg-stone-100 text-stone-700 text-xs rounded border border-stone-200">
                                            ${tag}
                                        </span>
                                    `)}
                                </div>
                            </div>
                        </div>

                        <div className="md:w-1/3 border-l border-stone-100 pl-0 md:pl-8 md:block">
                            <h4 className="font-bold text-stone-800 mb-4 flex items-center gap-2">
                                <${Network} className="w-4 h-4" />
                                Connected Records (${connectedNodes.length})
                            </h4>
                            <div className="space-y-2 max-h-60 overflow-y-auto pr-2 scrollbar-thin">
                                ${connectedNodes.length === 0 ? html`
                                    <p className="text-sm text-stone-400 italic">No strong connections found based on current criteria.</p>
                                ` : (
                                    connectedNodes.map(node => html`
                                        <button 
                                            key=${node.numericId}
                                            onClick=${() => handleNodeClick(node)}
                                            className="w-full text-left p-2 hover:bg-stone-50 rounded border border-transparent hover:border-stone-200 transition-all group"
                                        >
                                            <div className="text-xs font-bold text-stone-700 group-hover:text-stone-900 truncate">
                                                ${node.title}
                                            </div>
                                            <div className="text-[10px] text-stone-400 flex justify-between mt-0.5">
                                                <span>${node.year}</span>
                                                <span className="font-mono">Strength: {node.strength}</span>
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
