// Then and Now: Interactive Comparison Tool
// Jay Rosen's 1986 Dissertation meets 2025 realities

import { COMPARISONS, METADATA } from './data.js';

// DOM Elements
const comparisonsContainer = document.getElementById('comparisons-container');
const navDotsContainer = document.getElementById('nav-dots');
const srAnnouncements = document.getElementById('sr-announcements');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const navCounter = document.getElementById('nav-counter');

// State
let activeComparison = 0;

// Announce to screen readers
function announce(message) {
  if (srAnnouncements) {
    srAnnouncements.textContent = message;
    // Clear after announcement to allow repeated announcements of same text
    setTimeout(() => {
      srAnnouncements.textContent = '';
    }, 1000);
  }
}

// Render a single comparison card
function renderComparison(comparison, index) {
  const card = document.createElement('article');
  card.className = 'comparison-card mb-16 md:mb-24';
  card.id = `comparison-${comparison.id}`;
  card.dataset.index = index;

  card.innerHTML = `
    <!-- Theme Header -->
    <header class="text-center mb-8 md:mb-12">
      <span class="text-xs text-stone-400 tracking-widest uppercase">Comparison ${index + 1} of ${COMPARISONS.length}</span>
      <h3 class="font-display text-2xl md:text-3xl text-stone-850 mt-2">${comparison.theme}</h3>
    </header>

    <!-- Two-column comparison -->
    <div class="comparison-grid grid md:grid-cols-2 gap-6 md:gap-8">

      <!-- THEN: 1986 -->
      <div class="panel-then bg-white rounded-lg p-6 md:p-8 shadow-sm">
        <div class="flex items-center gap-3 mb-6">
          <div class="year-badge year-1986">${comparison.then.year}</div>
          <div>
            <p class="text-xs text-stone-500 uppercase tracking-wider">Then</p>
            <p class="text-sm font-medium text-stone-700">The Dissertation</p>
          </div>
        </div>

        <div class="chapter-badge mb-4">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
          </svg>
          <span>${comparison.then.chapter}</span>
          <span class="text-stone-400">pp. ${comparison.then.pages}</span>
        </div>

        <blockquote class="dissertation-quote text-stone-700 leading-relaxed mb-6 pl-4">
          ${comparison.then.quote}
        </blockquote>

        <p class="text-sm text-stone-600 leading-relaxed">
          ${comparison.then.context}
        </p>
      </div>

      <!-- NOW: 2025 -->
      <div class="panel-now bg-white rounded-lg p-6 md:p-8 shadow-sm">
        <div class="flex items-center gap-3 mb-6">
          <div class="year-badge year-2025">${comparison.now.year}</div>
          <div>
            <p class="text-xs text-sky-600 uppercase tracking-wider">Now</p>
            <p class="text-sm font-medium text-stone-700">The Reality</p>
          </div>
        </div>

        <h4 class="text-lg font-medium text-stone-850 mb-4">
          ${comparison.now.headline}
        </h4>

        <p class="text-stone-700 leading-relaxed mb-6">
          ${comparison.now.observation}
        </p>

        <div class="mb-4">
          <p class="text-xs text-stone-500 uppercase tracking-wider mb-2">Examples</p>
          <div class="flex flex-wrap gap-1">
            ${comparison.now.examples.map(ex => `<span class="example-pill">${ex}</span>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <!-- Connection Bridge -->
    <div class="connection-bridge mt-8 p-6 rounded-lg">
      <div class="flex items-start gap-3">
        <svg class="w-5 h-5 text-stone-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
        </svg>
        <div>
          <p class="text-xs text-stone-500 uppercase tracking-wider mb-1">The Connection</p>
          <p class="text-stone-700 leading-relaxed">${comparison.connection}</p>
        </div>
      </div>
    </div>
  `;

  return card;
}

// Render navigation dots
function renderNavDots() {
  navDotsContainer.innerHTML = COMPARISONS.map((c, i) => `
    <button
      class="nav-dot ${i === 0 ? 'active' : ''}"
      data-index="${i}"
      aria-label="Go to comparison ${i + 1}: ${c.theme}"
      title="${c.theme}"
    ></button>
  `).join('');

  // Add click handlers
  navDotsContainer.querySelectorAll('.nav-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const index = parseInt(dot.dataset.index);
      const card = document.querySelector(`[data-index="${index}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });
}

// Update navigation UI (dots, buttons, counter)
function updateNavigationUI() {
  // Update nav dots
  navDotsContainer.querySelectorAll('.nav-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === activeComparison);
    dot.setAttribute('aria-current', i === activeComparison ? 'true' : 'false');
  });

  // Update counter
  navCounter.textContent = `${activeComparison + 1} / ${COMPARISONS.length}`;

  // Update button states
  prevBtn.disabled = activeComparison === 0;
  nextBtn.disabled = activeComparison === COMPARISONS.length - 1;

  // Announce to screen readers
  const currentComparison = COMPARISONS[activeComparison];
  if (currentComparison) {
    announce(`Viewing comparison ${activeComparison + 1} of ${COMPARISONS.length}: ${currentComparison.theme}`);
  }
}

// Update active nav dot based on scroll position
function updateActiveNavDot() {
  const cards = document.querySelectorAll('.comparison-card');
  const viewportCenter = window.innerHeight / 2;

  let closestIndex = 0;
  let closestDistance = Infinity;

  cards.forEach((card, index) => {
    const rect = card.getBoundingClientRect();
    const cardCenter = rect.top + rect.height / 2;
    const distance = Math.abs(cardCenter - viewportCenter);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  if (closestIndex !== activeComparison) {
    activeComparison = closestIndex;
    updateNavigationUI();
  }
}

// Navigate to comparison by index
function navigateToComparison(index) {
  if (index < 0 || index >= COMPARISONS.length) return;
  const card = document.querySelector(`[data-index="${index}"]`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// Intersection Observer for scroll animations
function setupScrollAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    },
    {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    }
  );

  document.querySelectorAll('.comparison-card').forEach(card => {
    observer.observe(card);
  });
}

// Keyboard navigation
function setupKeyboardNav() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      navigateToComparison(activeComparison + 1);
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      navigateToComparison(activeComparison - 1);
    }
  });
}

// Get the current visible card index from DOM (real-time, not state-dependent)
function getCurrentVisibleCardIndex() {
  const cards = document.querySelectorAll('.comparison-card');
  const viewportCenter = window.innerHeight / 2;
  let closestIndex = 0;
  let closestDistance = Infinity;

  cards.forEach((card, index) => {
    const rect = card.getBoundingClientRect();
    const cardCenter = rect.top + rect.height / 2;
    const distance = Math.abs(cardCenter - viewportCenter);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });
  return closestIndex;
}

// Setup next/prev button handlers
function setupNavButtons() {
  prevBtn.addEventListener('click', () => {
    const current = getCurrentVisibleCardIndex();
    navigateToComparison(current - 1);
  });

  nextBtn.addEventListener('click', () => {
    const current = getCurrentVisibleCardIndex();
    navigateToComparison(current + 1);
  });
}

// Initialize
function init() {
  // Render all comparisons
  COMPARISONS.forEach((comparison, index) => {
    const card = renderComparison(comparison, index);
    comparisonsContainer.appendChild(card);
  });

  // Render navigation
  renderNavDots();

  // Setup interactions
  setupScrollAnimations();
  setupKeyboardNav();
  setupNavButtons();

  // Scroll listener for nav dots (throttled)
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    if (scrollTimeout) return;
    scrollTimeout = setTimeout(() => {
      updateActiveNavDot();
      scrollTimeout = null;
    }, 100);
  });

  // Initial navigation UI state
  updateNavigationUI();

  console.log('Then and Now: Comparison Tool initialized');
  console.log(`Loaded ${COMPARISONS.length} comparisons`);
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
