/**
 * Main Entry Point for the Dissertation Reader
 * "The Impossible Press" by Jay Rosen (1986)
 */

import ReaderSettings from './settings.js';
import ReaderNavigation from './navigation.js';
import ReadingProgress from './progress.js';

class DissertationReader {
  constructor() {
    this.settings = new ReaderSettings();
    this.navigation = new ReaderNavigation();
    this.progress = new ReadingProgress();
  }

  /**
   * Initialize all reader components
   */
  init() {
    // Settings must init first (applies theme before paint)
    this.settings.init();

    // Wait for DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.onDOMReady());
    } else {
      this.onDOMReady();
    }
  }

  /**
   * Called when DOM is ready
   */
  onDOMReady() {
    this.navigation.init();
    this.progress.init();
    this.setupCitationCopy();
    this.handleDeepLinks();

    // Mark app as ready
    document.body.classList.add('reader-ready');

    console.log('Dissertation Reader initialized');
  }

  /**
   * Setup citation copy functionality
   */
  setupCitationCopy() {
    const citationEl = document.querySelector('.reader-footer__citation');
    const copyBtn = document.querySelector('[data-action="copy-citation"]');

    if (!citationEl || !copyBtn) return;

    copyBtn.addEventListener('click', async () => {
      const citationText = citationEl.textContent.trim();

      try {
        await navigator.clipboard.writeText(citationText);
        this.showToast('Citation copied to clipboard');
      } catch (err) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = citationText;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();

        try {
          document.execCommand('copy');
          this.showToast('Citation copied to clipboard');
        } catch (e) {
          this.showToast('Failed to copy citation', 'error');
        }

        document.body.removeChild(textarea);
      }
    });
  }

  /**
   * Handle deep links (hash URLs)
   */
  handleDeepLinks() {
    const hash = window.location.hash.slice(1);
    if (hash) {
      // Delay to ensure content is rendered
      requestAnimationFrame(() => {
        const target = document.getElementById(hash);
        if (target) {
          target.scrollIntoView({ behavior: 'instant', block: 'start' });
        }
      });
    }
  }

  /**
   * Show a toast notification
   * @param {string} message
   * @param {'success' | 'error'} type
   */
  showToast(message, type = 'success') {
    // Remove existing toast
    const existing = document.querySelector('.reader-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `reader-toast reader-toast--${type}`;
    toast.textContent = message;

    // Add toast styles if not present
    if (!document.querySelector('#toast-styles')) {
      const style = document.createElement('style');
      style.id = 'toast-styles';
      style.textContent = `
        .reader-toast {
          position: fixed;
          bottom: var(--space-6);
          left: 50%;
          transform: translateX(-50%);
          background: var(--color-text);
          color: var(--color-bg);
          padding: var(--space-3) var(--space-5);
          border-radius: var(--border-radius-md);
          font-size: var(--font-size-sm);
          z-index: var(--z-toast);
          animation: toastIn 0.3s ease;
        }

        .reader-toast--error {
          background: #dc2626;
          color: white;
        }

        @keyframes toastIn {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }
}

// Initialize on load
const reader = new DissertationReader();
reader.init();

// Export for potential external use
export default DissertationReader;
