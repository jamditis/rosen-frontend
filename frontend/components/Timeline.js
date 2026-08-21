
import { useEffect, useMemo, useRef, useState } from 'react';
import { html } from '../html.js?v=3.8.23';
import { buildTimelineModel } from '../utils/timelineData.js?v=3.8.23';
import { ChevronDown, ChevronUp } from 'lucide-react';

const Timeline = ({ records, selectedYear, onSelectYear }) => {
  const [isExpanded, setIsExpanded] = useState(() => (
    typeof window === 'undefined' || window.innerWidth >= 640
  ));
  const [hoveredYear, setHoveredYear] = useState(null);
  const [rovingYear, setRovingYear] = useState(null);
  const yearButtonRefs = useRef(new Map());

  const { timelineData, dataMinYear, dataMaxYear } = useMemo(
    () => buildTimelineModel(records),
    [records],
  );

  const enabledYears = useMemo(
    () => timelineData.filter(data => data.count > 0).map(data => data.year),
    [timelineData],
  );

  useEffect(() => {
    setRovingYear(current => {
      if (selectedYear && enabledYears.includes(selectedYear)) return selectedYear;
      if (current && enabledYears.includes(current)) return current;
      return enabledYears[0] || null;
    });
  }, [enabledYears, selectedYear]);

  if (timelineData.length === 0) return null;

  const maxCount = Math.max(...timelineData.map(d => d.count));
  const logMax = maxCount > 0 ? Math.log(maxCount + 1) : 1;

  const handleYearKeyDown = (event, year) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = enabledYears.indexOf(year);
    let nextYear;
    if (event.key === 'Home') nextYear = enabledYears[0];
    else if (event.key === 'End') nextYear = enabledYears[enabledYears.length - 1];
    else {
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      nextYear = enabledYears[(currentIndex + direction + enabledYears.length) % enabledYears.length];
    }
    setRovingYear(nextYear);
    yearButtonRefs.current.get(nextYear)?.focus();
  };

  return html`
    <section className="archive-timeline" aria-labelledby="archive-timeline-title">
      <div className="archive-timeline__header">
        <button
          type="button"
          onClick=${() => setIsExpanded(!isExpanded)}
          className="archive-timeline__toggle"
          aria-expanded=${isExpanded}
          aria-controls="archive-timeline-panel"
        >
          <h3 id="archive-timeline-title">Timeline</h3>
          <span className="archive-timeline__range">
            ${dataMinYear}–${dataMaxYear}
          </span>
          ${isExpanded
            ? html`<${ChevronUp} className="w-4 h-4" aria-hidden="true" />`
            : html`<${ChevronDown} className="w-4 h-4" aria-hidden="true" />`}
        </button>
        ${selectedYear && html`
          <button
            type="button"
            onClick=${() => onSelectYear(null)}
            className="archive-action archive-action--quiet archive-timeline__clear"
          >
            Clear ${selectedYear}
          </button>
        `}
      </div>

      ${isExpanded && html`
        <div id="archive-timeline-panel" className="archive-panel archive-density--compact archive-timeline__panel">
          <div
            className="archive-timeline__scroll"
            role="region"
            aria-label="Archive timeline by year"
          >
            ${timelineData.map((data) => {
              const heightPercent = maxCount > 0
                ? (data.count > 0 ? Math.max((Math.log(data.count + 1) / logMax) * 100, 8) : 0)
                : 0;
              const isSelected = selectedYear === data.year;
              const isHovered = hoveredYear === data.year;
              const isYearLabel = parseInt(data.year) % 5 === 0
                || data.year === timelineData[0].year
                || data.year === timelineData[timelineData.length - 1].year;

              return html`
                <button
                  type="button"
                  key=${data.year}
                  ref=${element => {
                    if (element) yearButtonRefs.current.set(data.year, element);
                    else yearButtonRefs.current.delete(data.year);
                  }}
                  disabled=${data.count === 0}
                  tabIndex=${data.year === rovingYear ? 0 : -1}
                  onClick=${() => onSelectYear(isSelected ? null : data.year)}
                  onKeyDown=${event => handleYearKeyDown(event, data.year)}
                  onMouseEnter=${() => setHoveredYear(data.year)}
                  onMouseLeave=${() => setHoveredYear(null)}
                  onFocus=${() => {
                    setHoveredYear(data.year);
                    setRovingYear(data.year);
                  }}
                  onBlur=${() => setHoveredYear(null)}
                  className="archive-timeline__year"
                  data-selected=${isSelected ? 'true' : 'false'}
                  aria-label=${`${data.year}: ${data.count} record${data.count === 1 ? '' : 's'}`}
                  aria-pressed=${isSelected}
                >
                  <span className="archive-timeline__tooltip" aria-hidden="true">
                    <strong>${data.year}</strong>
                    <span>${data.count} records</span>
                  </span>
                  <span
                    className=${`archive-timeline__bar ${isHovered ? 'is-hovered' : ''}`}
                    style=${{ height: data.count > 0 ? `${heightPercent}%` : '0px' }}
                    aria-hidden="true"
                  />
                  ${isYearLabel && html`<span className="archive-timeline__tick" aria-hidden="true" />`}
                  ${isYearLabel && html`
                    <span className="archive-timeline__year-label" aria-hidden="true">${data.year}</span>
                  `}
                </button>
              `;
            })}
          </div>
        </div>
      `}
    </section>
  `;
};

export default Timeline;
