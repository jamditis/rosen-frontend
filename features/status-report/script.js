/**
 * Status Report Rendering Script
 *
 * Renders the archive status report using pre-computed data
 *
 * Note: innerHTML is used throughout because all data comes from the
 * trusted data.js file within this project - no user input is rendered.
 */

import {
  STATUS_METRICS,
  ERA_DISTRIBUTION,
  ENTITY_TYPES,
  RELATIONSHIP_TYPES,
  CHECKLIST_ITEMS,
  TIMELINE_MILESTONES,
  FIELD_COMPLETENESS,
  ACTION_ITEMS
} from './data.js?v=3.7.7';

// ============================================================================
// Countdown Timer
// ============================================================================

function updateCountdown() {
  const launchDate = new Date('2026-02-01T00:00:00');
  const now = new Date();
  const diff = launchDate - now;

  if (diff <= 0) {
    document.getElementById('countdown-days').textContent = '0';
    document.getElementById('countdown-hours').textContent = '0';
    document.getElementById('countdown-mins').textContent = '0';
    return;
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  document.getElementById('countdown-days').textContent = days;
  document.getElementById('countdown-hours').textContent = hours;
  document.getElementById('countdown-mins').textContent = mins;
}

// ============================================================================
// Overview Cards
// ============================================================================

function renderOverviewCards() {
  const cards = [
    {
      value: STATUS_METRICS.totalRecords.toLocaleString(),
      label: 'Records in archive',
      icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
      </svg>`
    },
    {
      value: STATUS_METRICS.totalEntities.toLocaleString(),
      label: 'Entities extracted',
      icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
      </svg>`
    },
    {
      value: STATUS_METRICS.totalRelationships.toLocaleString(),
      label: 'Relationships mapped',
      icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path>
      </svg>`
    },
    {
      value: `${STATUS_METRICS.verifiedPercent}%`,
      label: 'Verified',
      sublabel: `${STATUS_METRICS.verifiedRecords} records`,
      color: STATUS_METRICS.verifiedPercent >= 90 ? 'emerald' : STATUS_METRICS.verifiedPercent >= 70 ? 'amber' : 'rose',
      icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>`
    }
  ];

  const container = document.getElementById('overview-cards');
  // Data comes from trusted data.js - safe to use innerHTML
  container.innerHTML = cards.map(card => `
    <div class="stat-card">
      <div class="flex items-center gap-2 mb-2">
        <div class="p-1.5 bg-stone-100 rounded text-stone-600">
          ${card.icon}
        </div>
        <span class="text-xs uppercase tracking-wider text-stone-400 font-medium">${card.label}</span>
      </div>
      <div class="text-2xl md:text-3xl font-bold ${card.color ? `text-${card.color}-600` : 'text-stone-900'}">${card.value}</div>
      ${card.sublabel ? `<div class="text-xs text-stone-500 mt-1">${card.sublabel}</div>` : ''}
    </div>
  `).join('');
}

// ============================================================================
// Bar Charts
// ============================================================================

function renderBarChart(containerId, data, labelKey, valueKey, color = '#1c1917') {
  const container = document.getElementById(containerId);
  if (!container || !data.length) return;

  const maxValue = Math.max(...data.map(d => d[valueKey]));

  // Data comes from trusted data.js - safe to use innerHTML
  container.innerHTML = data.map(item => `
    <div class="bar-chart-row">
      <div class="bar-chart-label" title="${item[labelKey]}">${item[labelKey]}</div>
      <div class="bar-chart-bar">
        <div class="bar-chart-fill" style="width: ${(item[valueKey] / maxValue) * 100}%; background-color: ${color};"></div>
      </div>
      <div class="bar-chart-value">${item[valueKey].toLocaleString()}</div>
    </div>
  `).join('');
}

// ============================================================================
// Field Completeness
// ============================================================================

function renderFieldCompleteness() {
  const container = document.getElementById('field-completeness');
  if (!container) return;

  const tiers = [
    FIELD_COMPLETENESS.tier1,
    FIELD_COMPLETENESS.tier2,
    FIELD_COMPLETENESS.tier3,
    FIELD_COMPLETENESS.tier4
  ];

  let html = '';
  tiers.forEach(tier => {
    html += `<div class="mb-4">
      <div class="text-xs font-medium text-stone-500 mb-2">${tier.name}</div>
      ${tier.fields.map(field => {
        const colorClass = field.complete >= 90 ? 'progress-emerald' : field.complete >= 70 ? 'progress-amber' : 'progress-rose';
        return `
          <div class="flex items-center gap-3 mb-2">
            <div class="w-24 text-xs text-stone-600">${field.name}</div>
            <div class="flex-1 progress-bar">
              <div class="progress-fill ${colorClass}" style="width: ${field.complete}%;"></div>
            </div>
            <div class="w-12 text-xs font-mono text-stone-500 text-right">${field.complete}%</div>
          </div>
        `;
      }).join('')}
    </div>`;
  });

  // Data comes from trusted data.js - safe to use innerHTML
  container.innerHTML = `<h4 class="text-sm font-bold text-stone-700 mb-4">Field completeness</h4>${html}`;
}

// ============================================================================
// Quality Metrics
// ============================================================================

function renderQualityMetrics() {
  const container = document.getElementById('quality-metrics');
  if (!container) return;

  const metrics = [
    { label: 'Verified records', value: STATUS_METRICS.verifiedPercent, good: true },
    { label: 'Categorized', value: STATUS_METRICS.categorizedPercent, good: true },
    { label: 'Has summary', value: 100 - STATUS_METRICS.missingSummaryPercent, good: true },
    { label: 'Missing categories', value: STATUS_METRICS.missingCategoriesPercent, good: false },
    { label: 'Missing concepts', value: STATUS_METRICS.missingConceptsPercent, good: false }
  ];

  // Data comes from trusted data.js - safe to use innerHTML
  container.innerHTML = metrics.map(metric => {
    const badgeClass = metric.good
      ? (metric.value >= 90 ? 'badge-emerald' : metric.value >= 70 ? 'badge-amber' : 'badge-rose')
      : (metric.value <= 10 ? 'badge-emerald' : metric.value <= 30 ? 'badge-amber' : 'badge-rose');

    return `
      <div class="flex items-center justify-between py-2 border-b border-stone-100 last:border-0">
        <span class="text-sm text-stone-700">${metric.label}</span>
        <span class="badge ${badgeClass}">${metric.value.toFixed(1)}%</span>
      </div>
    `;
  }).join('');
}

// ============================================================================
// Checklist
// ============================================================================

function renderChecklist() {
  const container = document.getElementById('checklist');
  if (!container) return;

  // Data comes from trusted data.js - safe to use innerHTML
  container.innerHTML = CHECKLIST_ITEMS.map(item => {
    let iconHtml = '';
    let iconClass = '';

    if (item.status === 'complete') {
      iconClass = 'checklist-complete';
      iconHtml = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
      </svg>`;
    } else if (item.status === 'in_progress') {
      iconClass = 'checklist-partial';
      iconHtml = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>`;
    } else {
      iconClass = 'checklist-pending';
      iconHtml = '';
    }

    return `
      <div class="checklist-item">
        <div class="checklist-icon ${iconClass}">${iconHtml}</div>
        <div class="flex-1">
          <span class="text-sm text-stone-800">${item.label}</span>
          ${item.note ? `<span class="text-xs text-stone-400 ml-2">(${item.note})</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// Timeline
// ============================================================================

function renderTimeline() {
  const container = document.getElementById('timeline');
  if (!container) return;

  // Data comes from trusted data.js - safe to use innerHTML
  container.innerHTML = TIMELINE_MILESTONES.map(milestone => {
    let dotClass = 'timeline-pending';
    if (milestone.status === 'complete') dotClass = 'timeline-complete';
    else if (milestone.status === 'current') dotClass = 'timeline-current';

    return `
      <div class="timeline-item">
        <div class="timeline-dot ${dotClass}"></div>
        <div>
          <div class="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">${milestone.date}</div>
          <div class="text-sm font-bold text-stone-800">${milestone.label}</div>
          <div class="text-xs text-stone-500 mt-1">${milestone.description}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// Action Items
// ============================================================================

function renderActionItems() {
  const container = document.getElementById('action-items');
  if (!container) return;

  // Data comes from trusted data.js - safe to use innerHTML
  container.innerHTML = ACTION_ITEMS.map((item, index) => {
    const priorityColors = {
      high: 'border-rose-300 bg-rose-50',
      medium: 'border-amber-300 bg-amber-50',
      low: 'border-emerald-300 bg-emerald-50'
    };
    const priorityBadge = {
      high: 'badge-rose',
      medium: 'badge-amber',
      low: 'badge-emerald'
    };

    return `
      <div class="stat-card ${priorityColors[item.priority] || ''}" style="box-shadow: none; border-width: 2px;">
        <div class="expandable-header flex items-center justify-between" onclick="toggleExpand(${index})">
          <div class="flex items-center gap-3">
            <span class="text-2xl font-bold text-stone-800">${item.count.toLocaleString()}</span>
            <span class="text-sm text-stone-700">${item.title}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="badge ${priorityBadge[item.priority]}">${item.priority}</span>
            <svg class="w-5 h-5 text-stone-400 expand-icon-${index} transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
            </svg>
          </div>
        </div>
        <div class="expandable-content expandable-${index}">
          <p class="text-sm text-stone-600 mt-3 pt-3 border-t border-stone-200">${item.description}</p>
        </div>
      </div>
    `;
  }).join('');
}

// Toggle expandable sections
window.toggleExpand = function(index) {
  const content = document.querySelector(`.expandable-${index}`);
  const icon = document.querySelector(`.expand-icon-${index}`);
  if (content) {
    content.classList.toggle('open');
    if (icon) {
      icon.style.transform = content.classList.contains('open') ? 'rotate(180deg)' : '';
    }
  }
};

// ============================================================================
// Initialize
// ============================================================================

function init() {
  // Update last updated timestamp
  document.getElementById('last-updated').textContent = STATUS_METRICS.lastUpdated;

  // Start countdown
  updateCountdown();
  setInterval(updateCountdown, 60000); // Update every minute

  // Render all sections
  renderOverviewCards();
  renderFieldCompleteness();
  renderQualityMetrics();
  renderBarChart('entity-chart', ENTITY_TYPES, 'type', 'count', '#7c3aed');
  renderBarChart('relationship-chart', RELATIONSHIP_TYPES, 'type', 'count', '#0284c7');
  renderBarChart('era-chart', ERA_DISTRIBUTION, 'era', 'count', '#059669');
  renderChecklist();
  renderTimeline();
  renderActionItems();
}

// Run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
