// Glossary: Interactive Concept Explorer
import { CONCEPTS, CONCEPT_CATEGORIES, KEY_FIGURES, METADATA } from './data.js';

// DOM Elements
const conceptsGrid = document.getElementById('concepts-grid');
const detailPanel = document.getElementById('detail-panel');
const detailContent = document.getElementById('detail-content');
const figuresGrid = document.getElementById('figures-grid');
const closePanel = document.getElementById('close-panel');
const filterButtons = document.querySelectorAll('[data-filter]');

// State
let selectedConcept = null;
let activeFilter = 'all';

// Get category for a concept
function getConceptCategory(conceptId) {
  for (const cat of CONCEPT_CATEGORIES) {
    if (cat.concepts.includes(conceptId)) {
      return cat;
    }
  }
  return null;
}

// Render a concept card
function renderConceptCard(concept) {
  const category = getConceptCategory(concept.id);
  const card = document.createElement('article');
  card.className = 'concept-card card p-5 fade-in';
  card.dataset.id = concept.id;
  card.dataset.category = category?.id || '';

  card.innerHTML = `
    <h3 class="font-medium text-stone-850 mb-2">${concept.term}</h3>
    <p class="text-sm text-stone-600 leading-relaxed mb-3">${concept.shortDef}</p>
    <div class="flex items-center justify-between">
      <span class="text-xs text-stone-400">${concept.chapter.split(':')[0]}</span>
      ${category ? `<span class="badge badge-stone">${category.name}</span>` : ''}
    </div>
  `;

  card.addEventListener('click', () => selectConcept(concept));
  return card;
}

// Render detail panel content
function renderDetail(concept) {
  const category = getConceptCategory(concept.id);

  detailContent.innerHTML = `
    <div class="mb-6">
      ${category ? `<span class="badge badge-stone mb-2">${category.name}</span>` : ''}
      <h2 class="font-display text-2xl text-stone-850 mt-2">${concept.term}</h2>
    </div>

    <div class="chapter-ref mb-4">
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
      </svg>
      <span>${concept.chapter}</span>
      <span class="text-stone-400">pp. ${concept.pages}</span>
    </div>

    <div class="mb-6">
      <p class="text-stone-700 leading-relaxed">${concept.fullDef}</p>
    </div>

    <div class="quote mb-6">
      <p class="text-stone-600 text-sm leading-relaxed">${concept.quote}</p>
    </div>

    ${concept.keyFigure ? `
    <div class="mb-6">
      <p class="text-xs text-stone-500 uppercase tracking-wider mb-1">Key Figure</p>
      <p class="text-sm text-stone-700">${concept.keyFigure}</p>
    </div>
    ` : ''}

    <div class="mb-6">
      <p class="text-xs text-stone-500 uppercase tracking-wider mb-2">In 2025</p>
      <p class="text-sm text-stone-600 leading-relaxed">${concept.contemporary}</p>
    </div>

    ${concept.relatedConcepts?.length ? `
    <div>
      <p class="text-xs text-stone-500 uppercase tracking-wider mb-2">Related Concepts</p>
      <div class="flex flex-wrap gap-1">
        ${concept.relatedConcepts.map(id => {
          const related = CONCEPTS.find(c => c.id === id);
          return related ? `<button class="pill text-xs" data-related="${id}">${related.term}</button>` : '';
        }).join('')}
      </div>
    </div>
    ` : ''}
  `;

  // Add click handlers for related concepts
  detailContent.querySelectorAll('[data-related]').forEach(btn => {
    btn.addEventListener('click', () => {
      const relatedConcept = CONCEPTS.find(c => c.id === btn.dataset.related);
      if (relatedConcept) selectConcept(relatedConcept);
    });
  });
}

// Select a concept
function selectConcept(concept) {
  selectedConcept = concept;

  // Update card states
  document.querySelectorAll('.concept-card').forEach(card => {
    card.classList.toggle('ring-2', card.dataset.id === concept.id);
    card.classList.toggle('ring-sky-500', card.dataset.id === concept.id);
  });

  // Show panel
  detailPanel.classList.remove('hidden');
  renderDetail(concept);
}

// Close panel
function closeDetailPanel() {
  selectedConcept = null;
  detailPanel.classList.add('hidden');
  document.querySelectorAll('.concept-card').forEach(card => {
    card.classList.remove('ring-2', 'ring-sky-500');
  });
}

// Filter concepts
function filterConcepts(categoryId) {
  activeFilter = categoryId;

  // Update button states
  filterButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === categoryId);
  });

  // Filter cards
  document.querySelectorAll('.concept-card').forEach(card => {
    if (categoryId === 'all') {
      card.style.display = '';
    } else {
      card.style.display = card.dataset.category === categoryId ? '' : 'none';
    }
  });
}

// Render key figures
function renderFigures() {
  KEY_FIGURES.forEach(figure => {
    const card = document.createElement('article');
    card.className = 'card p-5';

    card.innerHTML = `
      <h3 class="font-medium text-stone-850 mb-1">${figure.name}</h3>
      <p class="text-xs text-stone-500 mb-3">${figure.role}</p>
      <p class="text-sm text-stone-600 leading-relaxed mb-4">${figure.relevance}</p>
      <div class="flex flex-wrap gap-1">
        ${figure.concepts.map(id => {
          const concept = CONCEPTS.find(c => c.id === id);
          return concept ? `<span class="pill text-xs">${concept.term}</span>` : '';
        }).join('')}
      </div>
    `;

    figuresGrid.appendChild(card);
  });
}

// Initialize
function init() {
  // Render concept cards
  CONCEPTS.forEach(concept => {
    const card = renderConceptCard(concept);
    conceptsGrid.appendChild(card);
  });

  // Render key figures
  renderFigures();

  // Setup filter handlers
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => filterConcepts(btn.dataset.filter));
  });

  // Setup close handler
  closePanel.addEventListener('click', closeDetailPanel);

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetailPanel();
  });

  // Fade in cards
  setTimeout(() => {
    document.querySelectorAll('.fade-in').forEach((el, i) => {
      setTimeout(() => el.classList.add('visible'), i * 50);
    });
  }, 100);

  console.log('Glossary initialized with', CONCEPTS.length, 'concepts');
}

// Start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
