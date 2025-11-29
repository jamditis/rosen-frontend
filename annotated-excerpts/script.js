// Annotated Excerpts: Key Passages with Commentary
import { EXCERPTS, EXCERPTS_METADATA, EXCERPT_TAGS } from './data.js';

// DOM Elements
const container = document.getElementById('excerpts-container');
const navDots = document.getElementById('nav-dots');
const filterButtons = document.querySelectorAll('[data-filter]');

// State
let activeExcerpt = 0;
let activeFilter = 'all';

// Render an excerpt
function renderExcerpt(excerpt, index) {
  const article = document.createElement('article');
  article.className = 'excerpt-card fade-in';
  article.id = `excerpt-${excerpt.id}`;
  article.dataset.index = index;
  article.dataset.tags = excerpt.tags.join(',');

  article.innerHTML = `
    <!-- Header -->
    <header class="mb-6">
      <span class="text-xs text-stone-400 tracking-wider">EXCERPT ${index + 1} OF ${EXCERPTS.length}</span>
      <h2 class="font-display text-2xl text-stone-850 mt-2">${excerpt.title}</h2>
      <div class="chapter-ref mt-3 inline-flex">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
        </svg>
        <span>${excerpt.chapter}</span>
        <span class="text-stone-400">pp. ${excerpt.pages}</span>
      </div>
    </header>

    <!-- The Quote -->
    <blockquote class="excerpt-quote text-stone-700 italic mb-8">
      ${excerpt.originalText}
    </blockquote>

    <!-- Two Column Layout -->
    <div class="grid md:grid-cols-2 gap-6">
      <!-- 1986 Context -->
      <div class="section-1986 bg-white rounded-lg p-6">
        <div class="flex items-center gap-2 mb-4">
          <span class="year-marker w-12 h-12 text-sm">1986</span>
          <div>
            <p class="text-xs text-stone-500 uppercase">Original Context</p>
          </div>
        </div>
        <p class="text-stone-600 text-sm leading-relaxed">
          ${excerpt.context1986}
        </p>
      </div>

      <!-- 2025 Reflection -->
      <div class="section-2025 bg-sky-50/50 rounded-lg p-6">
        <div class="flex items-center gap-2 mb-4">
          <span class="year-marker w-12 h-12 text-sm border-sky-500 text-sky-700 bg-sky-50">2025</span>
          <div>
            <p class="text-xs text-sky-600 uppercase">Reflection</p>
          </div>
        </div>
        <p class="text-stone-600 text-sm leading-relaxed">
          ${excerpt.reflection2025}
        </p>
      </div>
    </div>

    <!-- Contemporary Example -->
    <div class="mt-6 bg-stone-50 rounded-lg p-6">
      <p class="text-xs text-stone-500 uppercase tracking-wider mb-2">Contemporary Example</p>
      <p class="text-stone-600 text-sm leading-relaxed">
        ${excerpt.contemporaryExample}
      </p>
    </div>

    <!-- Later Work Connection -->
    ${excerpt.laterWork ? `
    <div class="mt-6 flex items-start gap-3 p-4 border border-stone-200 rounded-lg">
      <svg class="w-5 h-5 text-stone-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path>
      </svg>
      <div>
        <p class="text-xs text-stone-500 uppercase tracking-wider mb-1">Developed Later</p>
        <p class="text-sm font-medium text-stone-700">${excerpt.laterWork.title} (${excerpt.laterWork.year})</p>
        <p class="text-xs text-stone-500 mt-1">${excerpt.laterWork.connection}</p>
      </div>
    </div>
    ` : ''}

    <!-- Tags -->
    <div class="mt-6 flex flex-wrap gap-2">
      ${excerpt.tags.map(tag => {
        const tagInfo = EXCERPT_TAGS.find(t => t.id === tag);
        return `<span class="pill text-xs">${tagInfo?.label || tag}</span>`;
      }).join('')}
    </div>
  `;

  return article;
}

// Render navigation dots
function renderNavDots() {
  navDots.innerHTML = EXCERPTS.map((e, i) => `
    <button
      class="nav-dot ${i === 0 ? 'active' : ''}"
      data-index="${i}"
      title="${e.title}"
    ></button>
  `).join('');

  navDots.querySelectorAll('.nav-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const index = parseInt(dot.dataset.index);
      const card = document.querySelector(`[data-index="${index}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });
}

// Update active nav dot
function updateActiveNavDot() {
  const cards = document.querySelectorAll('.excerpt-card');
  const viewportCenter = window.innerHeight / 2;

  let closestIndex = 0;
  let closestDistance = Infinity;

  cards.forEach((card, index) => {
    if (card.style.display === 'none') return;
    const rect = card.getBoundingClientRect();
    const cardCenter = rect.top + rect.height / 2;
    const distance = Math.abs(cardCenter - viewportCenter);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  if (closestIndex !== activeExcerpt) {
    activeExcerpt = closestIndex;
    navDots.querySelectorAll('.nav-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === closestIndex);
    });
  }
}

// Filter excerpts
function filterExcerpts(tag) {
  activeFilter = tag;

  filterButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === tag);
  });

  document.querySelectorAll('.excerpt-card').forEach(card => {
    if (tag === 'all') {
      card.style.display = '';
    } else {
      const tags = card.dataset.tags.split(',');
      card.style.display = tags.includes(tag) ? '' : 'none';
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
  // Render excerpts
  EXCERPTS.forEach((excerpt, index) => {
    const article = renderExcerpt(excerpt, index);
    container.appendChild(article);
  });

  // Render nav dots
  renderNavDots();

  // Setup filters
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => filterExcerpts(btn.dataset.filter));
  });

  // Setup scroll handling
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    if (scrollTimeout) return;
    scrollTimeout = setTimeout(() => {
      updateActiveNavDot();
      scrollTimeout = null;
    }, 100);
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      const nextIndex = Math.min(activeExcerpt + 1, EXCERPTS.length - 1);
      const card = document.querySelector(`[data-index="${nextIndex}"]`);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      const prevIndex = Math.max(activeExcerpt - 1, 0);
      const card = document.querySelector(`[data-index="${prevIndex}"]`);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  // Setup animations
  setTimeout(setupScrollAnimations, 100);

  console.log('Annotated Excerpts initialized with', EXCERPTS.length, 'passages');
}

// Start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
