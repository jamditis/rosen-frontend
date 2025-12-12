// 1986 in Journalism: Historical Context
import { CONTEXT_1986, MEDIA_LANDSCAPE, KEY_EVENTS_1986, WHAT_DIDNT_EXIST, DISSERTATION_CONTEXT } from './data.js';

// DOM Elements
const landscapeGrid = document.getElementById('landscape-grid');
const didntExistGrid = document.getElementById('didnt-exist-grid');
const eventsList = document.getElementById('events-list');
const contextContent = document.getElementById('context-content');

// Render media landscape cards
function renderLandscape() {
  MEDIA_LANDSCAPE.forEach((item, index) => {
    const card = document.createElement('article');
    card.className = 'card p-6 fade-in';
    card.style.animationDelay = `${index * 100}ms`;

    card.innerHTML = `
      <div class="flex items-center gap-2 mb-3">
        <span class="badge badge-stone">${item.category}</span>
      </div>
      <h3 class="font-medium text-lg text-stone-850 mb-2">${item.title}</h3>
      <p class="text-stone-600 text-sm leading-relaxed mb-4">${item.description}</p>

      <div class="mb-4">
        <p class="text-xs text-stone-500 uppercase tracking-wider mb-2">Details</p>
        <ul class="space-y-1">
          ${item.details.map(d => `<li class="text-xs text-stone-600 flex items-start gap-2">
            <span class="text-stone-400 mt-1">•</span>
            <span>${d}</span>
          </li>`).join('')}
        </ul>
      </div>

      <div class="pt-4 border-t border-stone-100">
        <p class="text-xs text-stone-500 uppercase tracking-wider mb-1">Contrast: 2025</p>
        <p class="text-xs text-stone-500 italic">${item.contrast2025}</p>
      </div>
    `;

    landscapeGrid.appendChild(card);
  });
}

// Render what didn't exist
function renderDidntExist() {
  WHAT_DIDNT_EXIST.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'bg-white rounded-lg p-4 fade-in';
    card.style.animationDelay = `${index * 50}ms`;

    card.innerHTML = `
      <p class="font-medium text-stone-850 mb-1">${item.item}</p>
      <p class="text-xs text-stone-500 mb-2">Invented: ${item.invented}</p>
      <p class="text-xs text-stone-600">${item.note}</p>
    `;

    didntExistGrid.appendChild(card);
  });
}

// Render key events
function renderEvents() {
  KEY_EVENTS_1986.forEach((event, index) => {
    const item = document.createElement('div');
    item.className = 'card p-5 flex gap-4 fade-in';
    item.style.animationDelay = `${index * 100}ms`;

    item.innerHTML = `
      <div class="flex-shrink-0 w-24">
        <p class="font-display text-stone-850">${event.date}</p>
      </div>
      <div>
        <h3 class="font-medium text-stone-850 mb-1">${event.event}</h3>
        <p class="text-sm text-stone-600">${event.mediaNote}</p>
      </div>
    `;

    eventsList.appendChild(item);
  });
}

// Render dissertation context
function renderContext() {
  contextContent.innerHTML = `
    <div class="grid md:grid-cols-2 gap-8 mb-8">
      <div>
        <p class="text-xs text-stone-500 uppercase tracking-wider mb-2">Program</p>
        <p class="text-stone-700">${DISSERTATION_CONTEXT.program}</p>
      </div>
      <div>
        <p class="text-xs text-stone-500 uppercase tracking-wider mb-2">Advisor</p>
        <p class="text-stone-700">${DISSERTATION_CONTEXT.advisor}</p>
      </div>
      <div class="md:col-span-2">
        <p class="text-xs text-stone-500 uppercase tracking-wider mb-2">Committee</p>
        <p class="text-stone-700">${DISSERTATION_CONTEXT.committee}</p>
      </div>
    </div>

    <div class="mb-8">
      <p class="text-xs text-stone-500 uppercase tracking-wider mb-2">Intellectual Context</p>
      <p class="text-stone-600 leading-relaxed">${DISSERTATION_CONTEXT.significance}</p>
    </div>

    <div>
      <p class="text-xs text-stone-500 uppercase tracking-wider mb-3">Contemporary Works</p>
      <div class="space-y-3">
        ${DISSERTATION_CONTEXT.contemporaryWorks.map(work => `
          <div class="bg-stone-50 rounded p-4">
            <p class="font-medium text-stone-850">${work.title} (${work.year})</p>
            <p class="text-sm text-stone-600">${work.author}</p>
            <p class="text-xs text-stone-500 mt-1">${work.note}</p>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Fade in elements on scroll
function setupScrollAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    },
    { threshold: 0.1 }
  );

  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
}

// Track active section for TOC highlighting
function setupTOCTracking() {
  const sections = ['landscape', 'didnt-exist', 'events', 'context'];
  const tocLinks = document.querySelectorAll('.toc-link');

  function updateActiveTOC() {
    let activeSection = null;
    const scrollPos = window.scrollY + window.innerHeight / 3;

    // Find the current section
    for (const sectionId of sections) {
      const section = document.getElementById(sectionId);
      if (section) {
        const rect = section.getBoundingClientRect();
        const sectionTop = window.scrollY + rect.top;
        if (scrollPos >= sectionTop) {
          activeSection = sectionId;
        }
      }
    }

    // Update active class on TOC links
    tocLinks.forEach(link => {
      const href = link.getAttribute('href').substring(1); // Remove #
      if (href === activeSection) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  // Throttled scroll listener
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    if (scrollTimeout) return;
    scrollTimeout = setTimeout(() => {
      updateActiveTOC();
      scrollTimeout = null;
    }, 100);
  });

  // Initial update
  updateActiveTOC();
}

// Initialize
function init() {
  renderLandscape();
  renderDidntExist();
  renderEvents();
  renderContext();

  // Setup scroll animations after render
  setTimeout(setupScrollAnimations, 100);

  // Setup TOC tracking
  setupTOCTracking();

  console.log('1986 Context page initialized');
}

// Start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
