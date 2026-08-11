/**
 * Main Entry Point for the Dissertation Reader
 * "The Impossible Press" by Jay Rosen (1986)
 */

import ReaderSettings from './settings.js?v=3.8.21';
import ReaderNavigation from './navigation.js?v=3.8.21';
import ReadingProgress from './progress.js?v=3.8.21';

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
    this.setupSelectionMenu();

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
      // Copy only the citation, not the "Cite this work:" label. Prefer the
      // dedicated text span; fall back to stripping the label from textContent.
      const textEl = citationEl.querySelector('.reader-footer__citation-text');
      const citationText = (textEl ? textEl.textContent : citationEl.textContent)
        .replace(/^\s*Cite this work:\s*/i, '')
        .trim();

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
   * Setup text selection context menu
   */
  setupSelectionMenu() {
    this.injectSelectionStyles();
    this.createSelectionMenu();
    this.createShareModal();

    // Listen for selection changes
    document.addEventListener('mouseup', (e) => this.handleSelection(e));
    document.addEventListener('keyup', (e) => {
      if (e.key === 'Escape') {
        this.hideSelectionMenu();
        this.hideShareModal();
      }
    });

    // Hide menu when clicking outside
    document.addEventListener('mousedown', (e) => {
      const menu = document.getElementById('selection-menu');
      const modal = document.getElementById('share-modal');
      if (menu && !menu.contains(e.target)) {
        this.hideSelectionMenu();
      }
    });
  }

  /**
   * Inject styles for selection menu
   */
  injectSelectionStyles() {
    if (document.querySelector('#selection-menu-styles')) return;

    const style = document.createElement('style');
    style.id = 'selection-menu-styles';
    style.textContent = `
      #selection-menu {
        position: absolute;
        display: none;
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: var(--border-radius-md);
        box-shadow: var(--shadow-lg);
        padding: var(--space-2);
        z-index: var(--z-dropdown);
        gap: var(--space-1);
      }

      #selection-menu.is-visible {
        display: flex;
      }

      .selection-menu-btn {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-3);
        background: none;
        border: none;
        border-radius: var(--border-radius-sm);
        color: var(--color-text);
        font-size: var(--font-size-sm);
        font-family: var(--font-heading);
        cursor: pointer;
        white-space: nowrap;
        transition: background-color var(--transition-fast);
      }

      .selection-menu-btn:hover {
        background: var(--color-bg-secondary);
      }

      .selection-menu-btn svg {
        width: 16px;
        height: 16px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }

      /* Share Modal */
      #share-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: var(--z-modal);
        padding: var(--space-4);
      }

      #share-modal.is-visible {
        display: flex;
      }

      .share-modal-content {
        background: var(--color-bg);
        border-radius: var(--border-radius-lg);
        max-width: 600px;
        width: 100%;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: var(--shadow-lg);
      }

      .share-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-4);
        border-bottom: 1px solid var(--color-border);
      }

      .share-modal-header h3 {
        margin: 0;
        font-size: var(--font-size-lg);
        color: var(--color-text);
      }

      .share-modal-close {
        background: none;
        border: none;
        cursor: pointer;
        padding: var(--space-2);
        color: var(--color-text-secondary);
        border-radius: var(--border-radius-sm);
      }

      .share-modal-close:hover {
        background: var(--color-bg-secondary);
        color: var(--color-text);
      }

      .share-modal-body {
        padding: var(--space-4);
      }

      .share-preview {
        background: #1a1a1a;
        border-radius: var(--border-radius-md);
        padding: var(--space-5);
        margin-bottom: var(--space-4);
      }

      .share-preview-quote {
        color: #f5f5f5;
        font-family: var(--font-body);
        font-size: var(--font-size-base);
        line-height: 1.6;
        font-style: italic;
        margin-bottom: var(--space-4);
        border-left: 3px solid #60a5fa;
        padding-left: var(--space-4);
      }

      .share-preview-citation {
        color: #a0a0a0;
        font-size: var(--font-size-xs);
        font-family: var(--font-heading);
      }

      .share-text-area {
        width: 100%;
        min-height: 80px;
        padding: var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--border-radius-sm);
        font-family: var(--font-body);
        font-size: var(--font-size-sm);
        resize: vertical;
        margin-bottom: var(--space-4);
        background: var(--color-bg);
        color: var(--color-text);
      }

      .share-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
      }

      .share-actions .btn {
        flex: 1;
        min-width: 120px;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Create the selection context menu
   */
  createSelectionMenu() {
    const menu = document.createElement('div');
    menu.id = 'selection-menu';
    menu.innerHTML = `
      <button class="selection-menu-btn" data-action="share">
        <svg viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
        Share
      </button>
      <button class="selection-menu-btn" data-action="cite">
        <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
        Cite
      </button>
      <button class="selection-menu-btn" data-action="copy">
        <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Copy
      </button>
    `;
    document.body.appendChild(menu);

    // Button handlers
    menu.querySelector('[data-action="share"]').addEventListener('click', () => this.showShareModal());
    menu.querySelector('[data-action="cite"]').addEventListener('click', () => this.copySelectionCitation());
    menu.querySelector('[data-action="copy"]').addEventListener('click', () => this.copySelectedText());
  }

  /**
   * Create the share modal
   */
  createShareModal() {
    const modal = document.createElement('div');
    modal.id = 'share-modal';
    modal.innerHTML = `
      <div class="share-modal-content">
        <div class="share-modal-header">
          <h3>Share Quote</h3>
          <button class="share-modal-close" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="share-modal-body">
          <div class="share-preview" id="share-preview">
            <div class="share-preview-quote" id="share-quote"></div>
            <div class="share-preview-citation" id="share-citation"></div>
          </div>
          <label style="display: block; margin-bottom: var(--space-2); font-size: var(--font-size-sm); color: var(--color-text-secondary);">
            Share text (edit as needed):
          </label>
          <textarea class="share-text-area" id="share-text"></textarea>
          <div class="share-actions">
            <button class="btn btn--primary" data-action="copy-share-text">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copy Text
            </button>
            <button class="btn btn--secondary" data-action="download-image">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Download Image
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Close button
    modal.querySelector('.share-modal-close').addEventListener('click', () => this.hideShareModal());

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.hideShareModal();
    });

    // Action buttons
    modal.querySelector('[data-action="copy-share-text"]').addEventListener('click', () => this.copyShareText());
    modal.querySelector('[data-action="download-image"]').addEventListener('click', () => this.downloadShareImage());
  }

  /**
   * Handle text selection
   */
  handleSelection(e) {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    // Only show in content area and if text is selected
    const contentArea = document.querySelector('.reader-content');
    if (!contentArea) {
      return;
    }

    if (!selectedText || selectedText.length < 10 || !contentArea.contains(selection.anchorNode)) {
      this.hideSelectionMenu();
      return;
    }

    this.selectedText = selectedText;
    this.selectedChapter = this.getCurrentChapter();

    // Position menu near selection
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const menu = document.getElementById('selection-menu');

    if (!menu) return;

    // Temporarily show to get dimensions
    menu.style.visibility = 'hidden';
    menu.classList.add('is-visible');

    const menuHeight = menu.offsetHeight || 44;
    const menuWidth = menu.offsetWidth || 200;

    // Position above selection
    let top = window.scrollY + rect.top - menuHeight - 8;
    let left = window.scrollX + rect.left + (rect.width / 2) - (menuWidth / 2);

    // Keep in viewport
    if (left < 10) {
      left = 10;
    }
    if (left + menuWidth > window.innerWidth - 10) {
      left = window.innerWidth - menuWidth - 10;
    }

    // If above viewport, show below selection
    if (top < window.scrollY + 60) {
      top = window.scrollY + rect.bottom + 8;
    }

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.style.visibility = 'visible';
  }

  /**
   * Get current chapter based on scroll position
   */
  getCurrentChapter() {
    const headings = document.querySelectorAll('h1[id], h2[id]');
    let currentChapter = 'Introduction';

    for (const heading of headings) {
      const rect = heading.getBoundingClientRect();
      if (rect.top <= 100) {
        const text = heading.textContent.trim();
        if (text.toLowerCase().includes('chapter')) {
          currentChapter = text;
        } else if (text.toLowerCase().includes('introduction')) {
          currentChapter = 'Introduction';
        } else if (text.toLowerCase().includes('conclusion')) {
          currentChapter = 'Conclusion';
        }
      }
    }

    return currentChapter;
  }

  /**
   * Hide selection menu
   */
  hideSelectionMenu() {
    const menu = document.getElementById('selection-menu');
    if (menu) menu.classList.remove('is-visible');
  }

  /**
   * Show share modal
   */
  showShareModal() {
    this.hideSelectionMenu();

    const modal = document.getElementById('share-modal');
    const quoteEl = document.getElementById('share-quote');
    const citationEl = document.getElementById('share-citation');
    const textArea = document.getElementById('share-text');
    const downloadBtn = modal.querySelector('[data-action="download-image"]');

    // Character limit for shareable PNG (approximately 280 chars = ~5-6 lines in image)
    const IMAGE_CHAR_LIMIT = 500;
    const canGenerateImage = this.selectedText.length <= IMAGE_CHAR_LIMIT;

    // Show/hide download button based on length
    if (downloadBtn) {
      if (canGenerateImage) {
        downloadBtn.style.display = '';
        downloadBtn.removeAttribute('disabled');
      } else {
        downloadBtn.style.display = 'none';
      }
    }

    // Truncate for display if too long
    const displayText = this.selectedText.length > 500
      ? this.selectedText.substring(0, 497) + '...'
      : this.selectedText;

    quoteEl.textContent = `"${displayText}"`;
    citationEl.textContent = `— Jay Rosen, "The Impossible Press" (1986), ${this.selectedChapter}`;

    // Default share text
    const shareText = `"${displayText}"\n\n— Jay Rosen, "The Impossible Press" (1986)\n\nRead more: ${window.location.href}`;
    textArea.value = shareText;

    // Add note if selection is too long for image
    const existingNote = modal.querySelector('.share-length-note');
    if (existingNote) existingNote.remove();

    if (!canGenerateImage) {
      const note = document.createElement('p');
      note.className = 'share-length-note';
      note.style.cssText = 'font-size: 0.75rem; color: var(--color-text-muted); margin-bottom: var(--space-3); font-style: italic;';
      note.textContent = `Selection is too long for image generation (${this.selectedText.length} characters). You can still copy the text to share.`;
      const actionsDiv = modal.querySelector('.share-actions');
      actionsDiv.parentNode.insertBefore(note, actionsDiv);
    }

    modal.classList.add('is-visible');
  }

  /**
   * Hide share modal
   */
  hideShareModal() {
    const modal = document.getElementById('share-modal');
    if (modal) modal.classList.remove('is-visible');
  }

  /**
   * Copy share text to clipboard
   */
  async copyShareText() {
    const textArea = document.getElementById('share-text');
    try {
      await navigator.clipboard.writeText(textArea.value);
      this.showToast('Share text copied to clipboard');
    } catch (err) {
      textArea.select();
      document.execCommand('copy');
      this.showToast('Share text copied to clipboard');
    }
  }

  /**
   * Download quote as image
   */
  async downloadShareImage() {
    const preview = document.getElementById('share-preview');

    try {
      // Create canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Set dimensions (2x for retina)
      const width = 1200;
      const height = 630; // Standard social media image ratio
      canvas.width = width;
      canvas.height = height;

      // Background
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, width, height);

      // Quote accent bar
      ctx.fillStyle = '#60a5fa';
      ctx.fillRect(60, 80, 4, height - 160);

      // Quote text
      ctx.fillStyle = '#f5f5f5';
      ctx.font = 'italic 28px Georgia, serif';

      const quoteText = `"${this.selectedText}"`;
      const maxWidth = width - 160;
      const lines = this.wrapText(ctx, quoteText, maxWidth);

      const lineHeight = 42;
      const maxLines = Math.floor((height - 220) / lineHeight);
      const visibleLineCount = Math.min(lines.length, maxLines);
      const quoteTop = 120;
      const quoteBottom = height - 120;
      const lineSpan = Math.max(0, visibleLineCount - 1) * lineHeight;
      let y = quoteTop + (quoteBottom - quoteTop - lineSpan) / 2;

      for (let i = 0; i < visibleLineCount; i++) {
        let line = lines[i];
        if (i === maxLines - 1 && lines.length > maxLines) {
          line = line.substring(0, line.length - 3) + '..."';
        }
        ctx.fillText(line, 84, y);
        y += lineHeight;
      }

      // Citation
      ctx.fillStyle = '#a0a0a0';
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillText(`— Jay Rosen, "The Impossible Press" (1986)`, 84, height - 60);

      // Convert to blob and download
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'impossible-press-quote.png';
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('Image downloaded');
      }, 'image/png');

    } catch (err) {
      console.error('Error generating image:', err);
      this.showToast('Failed to generate image', 'error');
    }
  }

  /**
   * Wrap text for canvas
   */
  wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  /**
   * Copy selected text
   */
  async copySelectedText() {
    try {
      await navigator.clipboard.writeText(this.selectedText);
      this.showToast('Text copied to clipboard');
    } catch (err) {
      const textarea = document.createElement('textarea');
      textarea.value = this.selectedText;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      this.showToast('Text copied to clipboard');
    }
    this.hideSelectionMenu();
  }

  /**
   * Copy citation for selected text
   */
  async copySelectionCitation() {
    const citation = `Rosen, J. (1986). The impossible press: American journalism and the decline of public life [Doctoral dissertation, New York University]. ${this.selectedChapter}.`;

    try {
      await navigator.clipboard.writeText(citation);
      this.showToast('Citation copied to clipboard');
    } catch (err) {
      const textarea = document.createElement('textarea');
      textarea.value = citation;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      this.showToast('Citation copied to clipboard');
    }
    this.hideSelectionMenu();
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
