// FAQ: Ask the Dissertation
import { FAQ_METADATA, FAQ_CATEGORIES, FAQ_ITEMS, FAQ_KEYWORDS } from './data.js?v=3.8.16';

// DOM Elements
const faqContainer = document.getElementById('faq-container');
const searchInput = document.getElementById('search-input');
const clearSearch = document.getElementById('clear-search');
const resultsCount = document.getElementById('results-count');
const noResults = document.getElementById('no-results');
const clearFilters = document.getElementById('clear-filters');
const categoryButtons = document.querySelectorAll('[data-category]');
const expandAllBtn = document.getElementById('expand-all');
const collapseAllBtn = document.getElementById('collapse-all');

// NotebookLM links (dissertation + archive)
const notebookLink = document.getElementById('notebook-link');
const notebookLinkArchive = document.getElementById('notebook-link-archive');

// State
let activeCategory = 'all';
let searchQuery = '';
let openItemId = null;

// Initialize NotebookLM links from metadata (single source of truth for the URLs)
if (notebookLink && FAQ_METADATA.notebookLM?.dissertation) {
  notebookLink.href = FAQ_METADATA.notebookLM.dissertation;
}
if (notebookLinkArchive && FAQ_METADATA.notebookLM?.archive) {
  notebookLinkArchive.href = FAQ_METADATA.notebookLM.archive;
}

// Render a single FAQ item
function renderFAQItem(item) {
  const category = FAQ_CATEGORIES.find(c => c.id === item.category);
  const article = document.createElement('article');
  article.className = 'faq-item archive-panel';
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

  article.id = item.id;
  const answerId = `answer-${item.id}`;
  const questionId = `question-${item.id}`;

  article.innerHTML = `
    <div class="faq-question">
      <h2 class="faq-heading">
        <button type="button" class="faq-toggle" id="${questionId}" aria-expanded="false" aria-controls="${answerId}">
          <span>
            <span class="archive-folder-tab faq-category"><span>${category?.name || item.category}</span></span>
            <span class="faq-question__text">${item.question}</span>
          </span>
          <svg class="faq-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        </button>
      </h2>
      <button type="button" class="faq-copy-link" title="Copy link to this question" aria-label="Copy link to this question">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
          </svg>
      </button>
    </div>
    <div class="faq-answer" id="${answerId}" role="region" aria-labelledby="${questionId}" hidden>
      ${formattedAnswer}
      ${item.sources?.length ? `
      <div class="faq-sources">
        <p>Sources: ${item.sources.join(', ')}</p>
      </div>
      ` : ''}
    </div>
  `;

  article.querySelector('.faq-toggle').addEventListener('click', () => toggleItem(item.id));

  // Copy link handler
  article.querySelector('.faq-copy-link').addEventListener('click', (e) => {
    const url = `${window.location.origin}${window.location.pathname}#${item.id}`;
    // Capture the button now: e.currentTarget is null once dispatch finishes,
    // so reading it inside the async .then() callback would throw and report
    // the successful copy as a failure.
    const btn = e.currentTarget;

    navigator.clipboard.writeText(url).then(() => {
      const originalTitle = btn.title;
      btn.title = 'Link copied!';
      btn.classList.add('text-green-600');

      setTimeout(() => {
        btn.title = originalTitle;
        btn.classList.remove('text-green-600');
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy link:', err);
    });
  });

  return article;
}

function setItemOpen(item, isOpen) {
  const toggle = item.querySelector('.faq-toggle');
  const answer = item.querySelector('.faq-answer');
  item.classList.toggle('open', isOpen);
  toggle.setAttribute('aria-expanded', String(isOpen));
  answer.hidden = !isOpen;
}

// Toggle FAQ item open/closed
function toggleItem(id, updateHash = true) {
  const items = document.querySelectorAll('.faq-item');

  items.forEach(item => {
    if (item.dataset.id === id) {
      const isOpen = !item.classList.contains('open');
      setItemOpen(item, isOpen);
      openItemId = isOpen ? id : null;

      // Update URL hash
      if (updateHash) {
        if (isOpen) {
          window.history.pushState(null, '', `#${id}`);
        } else {
          window.history.pushState(null, '', window.location.pathname);
        }
      }

      // Scroll to item if opening
      if (isOpen) {
        setTimeout(() => {
          item.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    } else {
      setItemOpen(item, false);
    }
  });
}

// Handle URL hash on page load
function handleUrlHash() {
  const hash = window.location.hash.substring(1); // Remove #
  if (hash && document.getElementById(hash)) {
    // Wait for items to be rendered
    setTimeout(() => {
      toggleItem(hash, false);
    }, 100);
  }
}

// Expand all visible FAQ items
function expandAll() {
  const items = document.querySelectorAll('.faq-item');
  items.forEach(item => {
    if (!item.hidden) {
      setItemOpen(item, true);
    }
  });
  openItemId = null; // Clear single item tracking
}

// Collapse all FAQ items
function collapseAll() {
  const items = document.querySelectorAll('.faq-item');
  items.forEach(item => {
    setItemOpen(item, false);
  });
  openItemId = null;
  window.history.pushState(null, '', window.location.pathname); // Clear hash
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
    item.hidden = !visible;
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
    const isActive = btn.dataset.category === 'all';
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
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

  // Handle URL hash for permalinks
  handleUrlHash();

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
      categoryButtons.forEach(b => {
        const isActive = b === btn;
        b.classList.toggle('is-active', isActive);
        b.setAttribute('aria-pressed', String(isActive));
      });
      filterItems();
    });
  });

  // Clear filters
  clearFilters.addEventListener('click', resetFilters);

  // Expand/collapse all
  expandAllBtn.addEventListener('click', expandAll);
  collapseAllBtn.addEventListener('click', collapseAll);

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
