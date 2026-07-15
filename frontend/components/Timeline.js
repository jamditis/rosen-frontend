
import { useMemo, useState } from 'react';
import { html } from '../html.js?v=3.7.1';
import { ChevronDown, ChevronUp } from 'lucide-react';

const Timeline = ({ records, selectedYear, onSelectYear }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [hoveredYear, setHoveredYear] = useState(null);
  
  const timelineData = useMemo(() => {
    const counts = {};
    let minYear = 2050;
    let maxYear = 1900;
    let hasData = false;

    records.forEach(r => {
      const y = parseInt(r.year);
      if (!isNaN(y)) {
        counts[r.year] = (counts[r.year] || 0) + 1;
        if (y < minYear) minYear = y;
        if (y > maxYear) maxYear = y;
        hasData = true;
      }
    });
    
    if (!hasData) return [];

    minYear = minYear - 1;
    maxYear = maxYear + 1;

    const years = [];
    for (let y = minYear; y <= maxYear; y++) {
       years.push({ year: y.toString(), count: counts[y.toString()] || 0 });
    }
    return years;
  }, [records]);

  if (timelineData.length === 0) return null;

  const maxCount = Math.max(...timelineData.map(d => d.count));
  const logMax = maxCount > 0 ? Math.log(maxCount + 1) : 1;

  return html`
    <div className="mb-10 select-none animate-fade-in">
      <div className="flex justify-between items-end mb-4 border-b border-stone-200 pb-2">
         <button
            onClick=${() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 group focus:outline-none"
         >
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 group-hover:text-stone-800 transition-colors">Timeline</h3>
            <span className="text-[10px] text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded-full border border-stone-200 font-mono">
                ${timelineData[0].year}–${timelineData[timelineData.length - 1].year}
            </span>
            <div className="text-stone-400 group-hover:text-stone-800 transition-colors">
                ${isExpanded ? html`<${ChevronUp} className="w-3 h-3" />` : html`<${ChevronDown} className="w-3 h-3" />`}
            </div>
         </button>
         ${selectedYear && html`
            <button
                onClick=${() => onSelectYear(null)}
                className="text-xs text-red-600 hover:text-red-800 font-bold flex items-center gap-1 transition-colors bg-red-50 px-2 py-1 rounded"
            >
                Clear filter (${selectedYear})
            </button>
         `}
      </div>

      ${isExpanded && html`
        <div className="relative w-full bg-stone-50/50 border border-stone-200/60 rounded-lg p-4 sm:px-6 animate-fade-in">
            <div className="flex h-32 gap-[2px] sm:gap-1 w-full overflow-x-auto pb-8 pt-4 scrollbar-thin px-1">
                ${timelineData.map((data) => {
                const heightPercent = maxCount > 0
                    ? (data.count > 0 ? Math.max((Math.log(data.count + 1) / logMax) * 100, 8) : 0)
                    : 0;
                
                const isSelected = selectedYear === data.year;
                const isHovered = hoveredYear === data.year;
                const isYearLabel = parseInt(data.year) % 5 === 0 || data.year === timelineData[0].year || data.year === timelineData[timelineData.length-1].year;
                
                return html`
                    <div 
                        key=${data.year}
                        onClick=${() => onSelectYear(isSelected ? null : data.year)}
                        onMouseEnter=${() => setHoveredYear(data.year)}
                        onMouseLeave=${() => setHoveredYear(null)}
                        className="group relative flex-1 min-w-[14px] sm:min-w-[20px] h-full flex flex-col justify-end items-center cursor-pointer"
                    >
                        <div className="absolute inset-x-0 top-0 bottom-0 bg-stone-200/0 group-hover:bg-stone-200/40 rounded transition-colors" />

                        <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30">
                            <div className="bg-stone-800 text-white text-[10px] font-bold px-2 py-1 rounded shadow-xl whitespace-nowrap flex flex-col items-center leading-tight">
                                <span>${data.year}</span>
                                <span className="font-normal text-stone-300">${data.count} records</span>
                            </div>
                            <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-stone-800 mx-auto"></div>
                        </div>

                        <div 
                            className=${`
                                w-full rounded-t-sm transition-all duration-300 ease-out relative z-10
                                ${isSelected ? 'bg-stone-800 shadow-md scale-y-105' : data.count > 0 ? 'bg-stone-400 group-hover:bg-stone-500 group-hover:scale-y-110 origin-bottom' : 'bg-transparent'}
                                ${isHovered && !isSelected && data.count > 0 ? 'ring-1 ring-stone-300' : ''}
                            `}
                            style=${{ 
                                height: data.count > 0 ? `${heightPercent}%` : '0px',
                            }}
                        >
                            ${isSelected && html`
                                <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-stone-800 rounded-full ring-2 ring-white" />
                            `}
                        </div>
                        
                        ${isYearLabel && html`
                            <div className="absolute top-full w-px h-1.5 bg-stone-300 mt-px" />
                        `}

                        ${isYearLabel && html`
                            <span className=${`
                                absolute top-full mt-2.5 text-[9px] sm:text-[10px] font-mono whitespace-nowrap transition-colors
                                ${isSelected || isHovered ? 'text-stone-900 font-bold z-20' : 'text-stone-400'}
                            `}>
                                ${data.year}
                            </span>
                        `}
                    </div>
                `;
                })}
            </div>
        </div>
      `}
    </div>
  `;
};

export default Timeline;
