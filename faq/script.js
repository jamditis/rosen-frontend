// FAQ: Ask the Dissertation
import { FAQ_METADATA, FAQ_CATEGORIES, FAQ_ITEMS, FAQ_KEYWORDS } from './data.js';

// DOM Elements
const faqContainer = document.getElementById('faq-container');
const searchInput = document.getElementById('search-input');
const clearSearch = document.getElementById('clear-search');
const resultsCount = document.getElementById('results-count');
const noResults = document.getElementById('no-results');
const clearFilters = document.getElementById('clear-filters');
const categoryButtons = document.querySelectorAll('[data-category]');

// NotebookLM link
const notebookLink = document.getElementById('notebook-link');

// State
let activeCategory = 'all';
let searchQuery = '';
let openItemId = null;

// Initialize NotebookLM link
if (FAQ_METADATA.notebookLM?.dissertation) {
  notebookLink.href = FAQ_METADATA.notebookLM.dissertation;
}

// Render a single FAQ item
function renderFAQItem(item) {
  const category = FAQ_CATEGORIES.find(c => c.id === item.category);
  const article = document.createElement('article');
  article.className = 'faq-item card';
  article.dataset.id = item.id;
  article.dataset.category = item.category;

  // Format answer with paragraphs
  const formattedAnswer = item.answer
    .split('\n\n')
    .map(p => {
      if (p.startsWith('**') && p.includes(':**')) {
        // Bold heading paragraph
        return `<p class="mb-3"><strong>${p.replace(/\*\*/g, '')}</strong></p>`;
      }
      return `<p class="mb-3">${p}</p>`;
    })
    .join('');

  article.innerHTML = `
    <div class="faq-question p-5 flex items-start justify-between gap-4">
      <div class="flex-1">
        <span class="text-xs text-stone-400 uppercase tracking-wider">${category?.name || item.category}</span>
        <h3 class="font-medium text-stone-850 mt-1">${item.question}</h3>
      </div>
      <svg class="faq-chevron w-5 h-5 text-stone-400 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
      </svg>
    </div>
    <div class="faq-answer">
      <div class="px-5 pb-5 pt-0 border-t border-stone-100">
        <div class="prose prose-stone prose-sm max-w-none mt-4 text-stone-600 leading-relaxed">
          ${formattedAnswer}
        </div>
        ${item.sources?.length ? `
        <div class="mt-4 pt-4 border-t border-stone-100">
          <p class="text-xs text-stone-400">Sources: ${item.sources.join(', ')}</p>
        </div>
        ` : ''}
      </div>
    </div>
  `;

  // Toggle on click
  article.querySelector('.faq-question').addEventListener('click', () => {
    toggleItem(item.id);
  });

  return article;
}

// Toggle FAQ item open/closed
function toggleItem(id) {
  const items = document.querySelectorAll('.faq-item');

  items.forEach(item => {
    if (item.dataset.id === id) {
      item.classList.toggle('open');
      openItemId = item.classList.contains('open') ? id : null;
    } else {
      item.classList.remove('open');
    }
  });
}

// Filter and search FAQ items
function filterItems() {
  const query = searchQuery.toLowerCase().trim();
  let visibleCount = 0;

  document.querySelectorAll('.faq-item').forEach(item => {
    const id = item.dataset.id;
    const category = item.dataset.category;
    const faqData = FAQ_ITEMS.find(f => f.id === id);

    // Category filter
    const categoryMatch = activeCategory === 'all' || category === activeCategory;

    // Search filter
    let searchMatch = true;
    if (query) {
      const keywords = FAQ_KEYWORDS[id] || [];
      const searchText = [
        faqData.question,
        faqData.answer,
        ...keywords
      ].join(' ').toLowerCase();

      searchMatch = query.split(' ').every(word => searchText.includes(word));
    }

    const visible = categoryMatch && searchMatch;
    item.style.display = visible ? '' : 'none';
    if (visible) visibleCount++;
  });

  // Update results count
  if (query || activeCategory !== 'all') {
    resultsCount.textContent = `Showing ${visibleCount} of ${FAQ_ITEMS.length} questions`;
  } else {
    resultsCount.textContent = `${FAQ_ITEMS.length} questions`;
  }

  // Show/hide no results message
  noResults.classList.toggle('hidden', visibleCount > 0);
  faqContainer.classList.toggle('hidden', visibleCount === 0);
}

// Clear all filters
function resetFilters() {
  activeCategory = 'all';
  searchQuery = '';
  searchInput.value = '';
  clearSearch.classList.add('hidden');

  categoryButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === 'all');
  });

  filterItems();
}

// Initialize
function init() {
  // Render FAQ items
  FAQ_ITEMS.forEach(item => {
    const element = renderFAQItem(item);
    faqContainer.appendChild(element);
  });

  // Initial count
  resultsCount.textContent = `${FAQ_ITEMS.length} questions`;

  // Search handlers
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    clearSearch.classList.toggle('hidden', !searchQuery);
    filterItems();
  });

  clearSearch.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearSearch.classList.add('hidden');
    filterItems();
    searchInput.focus();
  });

  // Category filter handlers
  categoryButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.category;
      categoryButtons.forEach(b => b.classList.toggle('active', b === btn));
      filterItems();
    });
  });

  // Clear filters
  clearFilters.addEventListener('click', resetFilters);

  // Keyboard handling
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    }
  });

  console.log('FAQ initialized with', FAQ_ITEMS.length, 'questions');
}

// Start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
