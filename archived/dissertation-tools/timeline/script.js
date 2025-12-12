// Timeline: From Dissertation to Now
import { TIMELINE_METADATA, TIMELINE_ENTRIES, RECURRING_THEMES, ENTRY_TYPES } from './data.js';

// DOM Elements
const timeline = document.getElementById('timeline');
const themesContainer = document.getElementById('themes');
const filterButtons = document.querySelectorAll('[data-filter]');

// State
let activeFilter = 'all';

// Get badge class for entry type
function getBadgeClass(type) {
  const typeConfig = ENTRY_TYPES[type];
  if (!typeConfig) return 'badge-stone';
  return `badge-${typeConfig.color}`;
}

// Get dot color for entry type
function getDotColor(type) {
  const colors = {
    milestone: '#f59e0b',  // amber
    publication: '#0ea5e9', // sky
    concept: '#10b981',     // emerald
    career: '#8b5cf6',      // violet
    period: '#f43f5e'       // rose
  };
  return colors[type] || '#78716c';
}

// Render a timeline entry
function renderEntry(entry, index) {
  const typeConfig = ENTRY_TYPES[entry.type];
  const entryEl = document.createElement('div');
  entryEl.className = 'timeline-entry mb-12 fade-in';
  entryEl.dataset.type = entry.type;
  entryEl.style.animationDelay = `${index * 100}ms`;

  entryEl.innerHTML = `
    <div class="timeline-dot" style="background: ${getDotColor(entry.type)}; color: ${getDotColor(entry.type)}"></div>
    <div class="timeline-content">
      <div class="card p-6">
        <div class="flex items-center gap-2 mb-3">
          <span class="font-display text-xl text-stone-400">${entry.year}</span>
          <span class="badge ${getBadgeClass(entry.type)}">${typeConfig?.label || entry.type}</span>
        </div>

        <h3 class="font-medium text-lg text-stone-850 mb-1">${entry.title}</h3>
        ${entry.subtitle ? `<p class="text-sm text-stone-500 mb-3">${entry.subtitle}</p>` : ''}

        <p class="text-stone-600 text-sm leading-relaxed mb-4">${entry.description}</p>

        ${entry.keyIdeas?.length ? `
        <div class="mb-4">
          <p class="text-xs text-stone-500 uppercase tracking-wider mb-2">Key Ideas</p>
          <ul class="space-y-1">
            ${entry.keyIdeas.map(idea => `
              <li class="text-xs text-stone-600 flex items-start gap-2">
                <span class="text-stone-400">•</span>
                <span>${idea}</span>
              </li>
            `).join('')}
          </ul>
        </div>
        ` : ''}

        <div class="pt-4 border-t border-stone-100">
          <p class="text-xs text-stone-500 uppercase tracking-wider mb-1">Connection to Dissertation</p>
          <p class="text-xs text-stone-500 italic">${entry.dissertationConnection}</p>
        </div>

        ${entry.link ? `
        <a href="${entry.link}" target="_blank" class="inline-block mt-4 text-xs text-sky-600 hover:text-sky-800">
          View source →
        </a>
        ` : ''}
      </div>
    </div>
  `;

  return entryEl;
}

// Render recurring themes
function renderThemes() {
  RECURRING_THEMES.forEach(theme => {
    const card = document.createElement('div');
    card.className = 'card p-6';

    card.innerHTML = `
      <h3 class="font-medium text-stone-850 mb-4">${theme.theme}</h3>
      <div class="space-y-3">
        ${theme.instances.map(inst => `
          <div class="flex items-start gap-3">
            <span class="font-display text-sm text-stone-400 w-12 flex-shrink-0">${inst.year}</span>
            <p class="text-xs text-stone-600">${inst.context}</p>
          </div>
        `).join('')}
      </div>
    `;

    themesContainer.appendChild(card);
  });
}

// Filter entries
function filterEntries(type) {
  activeFilter = type;

  // Update button states
  filterButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === type);
  });

  // Filter entries
  document.querySelectorAll('.timeline-entry').forEach(entry => {
    if (type === 'all') {
      entry.style.display = '';
    } else {
      entry.style.display = entry.dataset.type === type ? '' : 'none';
    }
  });
}

// Setup scroll animations
function setupScrollAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
  );

  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
}

// Initialize
function init() {
  // Render timeline entries
  TIMELINE_ENTRIES.forEach((entry, index) => {
    const entryEl = renderEntry(entry, index);
    timeline.appendChild(entryEl);
  });

  // Render themes
  renderThemes();

  // Setup filters
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => filterEntries(btn.dataset.filter));
  });

  // Setup animations
  setTimeout(setupScrollAnimations, 100);

  console.log('Timeline initialized with', TIMELINE_ENTRIES.length, 'entries');
}

// Start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
