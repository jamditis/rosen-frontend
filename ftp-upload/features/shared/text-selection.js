/**
 * Text Selection Sharing Tool
 * Enables highlight-to-share functionality across dissertation feature pages
 * Based on the implementation from dissertation-reader
 */

export class TextSelectionTool {
  constructor(options = {}) {
    this.selectedText = '';
    this.contentSelector = options.contentSelector || 'main';
    this.source = options.source || 'Jay Rosen, "The Impossible Press" (1986)';
    this.minSelectionLength = options.minSelectionLength || 10;
    this.maxImageLength = options.maxImageLength || 800;

    // Image theme options - 'dark' (default) or 'light' (paper)
    this.imageTheme = options.imageTheme || 'dark';

    // Theme color configurations
    this.themes = {
      dark: {
        background: '#1a1a1a',
        quoteText: '#f5f5f5',
        accentBar: '#60a5fa',
        citation: '#a0a0a0'
      },
      light: {
        background: '#fdfbf7',  // paper color
        quoteText: '#1c1917',   // stone-900
        accentBar: '#0284c7',   // sky-600
        citation: '#57534e'     // stone-600
      }
    };
  }

  /**
   * Initialize the tool
   */
  init() {
    this.injectStyles();
    this.createSelectionMenu();
    this.createShareModal();
    this.bindEvents();
    console.log('[TextSelectionTool] Initialized');
  }

  /**
   * Inject required CSS styles
   */
  injectStyles() {
    if (document.querySelector('#text-selection-styles')) return;

    const style = document.createElement('style');
    style.id = 'text-selection-styles';
    style.textContent = `
      #text-selection-menu {
        position: absolute;
        display: none;
        background: #fdfbf7;
        border: 1px solid #d6d3d1;
        border-radius: 8px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.15);
        padding: 4px;
        z-index: 9999;
        gap: 2px;
      }

      [data-theme="dark"] #text-selection-menu {
        background: #292524;
        border-color: #44403c;
      }

      #text-selection-menu.is-visible {
        display: flex;
      }

      .text-selection-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        background: none;
        border: none;
        border-radius: 6px;
        color: #1c1917;
        font-size: 13px;
        font-family: 'Roboto Mono', monospace;
        cursor: pointer;
        white-space: nowrap;
        transition: background-color 0.15s ease;
      }

      [data-theme="dark"] .text-selection-btn {
        color: #f5f5f4;
      }

      .text-selection-btn:hover {
        background: #e7e5e4;
      }

      [data-theme="dark"] .text-selection-btn:hover {
        background: #44403c;
      }

      .text-selection-btn svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }

      /* Share Modal */
      #text-selection-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        padding: 16px;
      }

      #text-selection-modal.is-visible {
        display: flex;
      }

      .text-selection-modal-content {
        background: #fdfbf7;
        border-radius: 12px;
        max-width: 600px;
        width: 100%;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 25px 50px rgba(0,0,0,0.25);
      }

      [data-theme="dark"] .text-selection-modal-content {
        background: #1c1917;
      }

      .text-selection-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid #e7e5e4;
      }

      [data-theme="dark"] .text-selection-modal-header {
        border-bottom-color: #44403c;
      }

      .text-selection-modal-header h3 {
        margin: 0;
        font-size: 18px;
        color: #1c1917;
        font-family: 'Special Elite', monospace;
      }

      [data-theme="dark"] .text-selection-modal-header h3 {
        color: #f5f5f4;
      }

      .text-selection-modal-close {
        background: none;
        border: none;
        cursor: pointer;
        padding: 8px;
        color: #78716c;
        border-radius: 6px;
      }

      .text-selection-modal-close:hover {
        background: #e7e5e4;
        color: #1c1917;
      }

      [data-theme="dark"] .text-selection-modal-close:hover {
        background: #44403c;
        color: #f5f5f4;
      }

      .text-selection-modal-body {
        padding: 20px;
      }

      .text-selection-preview {
        border-radius: 8px;
        padding: 24px;
        margin-bottom: 16px;
      }

      /* Dark theme preview (default) */
      .text-selection-preview.theme-dark {
        background: #1a1a1a;
      }

      .text-selection-preview.theme-dark .text-selection-preview-quote {
        color: #f5f5f5;
        border-left-color: #60a5fa;
      }

      .text-selection-preview.theme-dark .text-selection-preview-citation {
        color: #a0a0a0;
      }

      /* Light theme preview (paper) */
      .text-selection-preview.theme-light {
        background: #fdfbf7;
        border: 1px solid #d6d3d1;
      }

      .text-selection-preview.theme-light .text-selection-preview-quote {
        color: #1c1917;
        border-left-color: #0284c7;
      }

      .text-selection-preview.theme-light .text-selection-preview-citation {
        color: #57534e;
      }

      .text-selection-preview-quote {
        font-family: Georgia, serif;
        font-size: 16px;
        line-height: 1.7;
        font-style: italic;
        margin-bottom: 16px;
        border-left: 3px solid;
        padding-left: 16px;
      }

      .text-selection-preview-citation {
        font-size: 12px;
        font-family: 'Roboto Mono', monospace;
      }

      .text-selection-textarea {
        width: 100%;
        min-height: 80px;
        padding: 12px;
        border: 1px solid #d6d3d1;
        border-radius: 6px;
        font-family: 'Roboto Mono', monospace;
        font-size: 13px;
        resize: vertical;
        margin-bottom: 16px;
        background: #fdfbf7;
        color: #1c1917;
      }

      [data-theme="dark"] .text-selection-textarea {
        background: #292524;
        border-color: #44403c;
        color: #f5f5f4;
      }

      .text-selection-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .text-selection-action-btn {
        flex: 1;
        min-width: 120px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 10px 16px;
        border-radius: 6px;
        font-size: 13px;
        font-family: 'Roboto Mono', monospace;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .text-selection-action-btn--primary {
        background: #1c1917;
        color: #fff;
        border: none;
      }

      .text-selection-action-btn--primary:hover {
        background: #292524;
      }

      .text-selection-action-btn--secondary {
        background: transparent;
        color: #1c1917;
        border: 1px solid #d6d3d1;
      }

      [data-theme="dark"] .text-selection-action-btn--secondary {
        color: #f5f5f4;
        border-color: #44403c;
      }

      .text-selection-action-btn--secondary:hover {
        background: #e7e5e4;
      }

      [data-theme="dark"] .text-selection-action-btn--secondary:hover {
        background: #44403c;
      }

      .text-selection-action-btn svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }

      .text-selection-note {
        font-size: 12px;
        color: #78716c;
        margin-bottom: 12px;
        font-style: italic;
      }

      /* Toast notifications */
      .text-selection-toast {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: #1c1917;
        color: #fff;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 13px;
        font-family: 'Roboto Mono', monospace;
        z-index: 999999;
        animation: textSelectionToastIn 0.3s ease;
      }

      @keyframes textSelectionToastIn {
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

  /**
   * Create the selection context menu
   */
  createSelectionMenu() {
    const menu = document.createElement('div');
    menu.id = 'text-selection-menu';
    menu.innerHTML = `
      <button class="text-selection-btn" data-action="share">
        <svg viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
        Share
      </button>
      <button class="text-selection-btn" data-action="copy">
        <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Copy
      </button>
    `;
    document.body.appendChild(menu);

    menu.querySelector('[data-action="share"]').addEventListener('click', () => this.showShareModal());
    menu.querySelector('[data-action="copy"]').addEventListener('click', () => this.copySelectedText());
  }

  /**
   * Create the share modal
   */
  createShareModal() {
    const modal = document.createElement('div');
    modal.id = 'text-selection-modal';
    modal.innerHTML = `
      <div class="text-selection-modal-content">
        <div class="text-selection-modal-header">
          <h3>Share quote</h3>
          <button class="text-selection-modal-close" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="text-selection-modal-body">
          <div class="text-selection-preview">
            <div class="text-selection-preview-quote" id="text-selection-quote"></div>
            <div class="text-selection-preview-citation" id="text-selection-citation"></div>
          </div>
          <label style="display: block; margin-bottom: 8px; font-size: 13px; color: #78716c;">
            Share text (edit as needed):
          </label>
          <textarea class="text-selection-textarea" id="text-selection-text"></textarea>
          <div id="text-selection-length-note"></div>
          <div class="text-selection-actions">
            <button class="text-selection-action-btn text-selection-action-btn--primary" data-action="copy-text">
              <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              Copy text
            </button>
            <button class="text-selection-action-btn text-selection-action-btn--secondary" data-action="download-image" id="text-selection-download-btn">
              <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Download image
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('.text-selection-modal-close').addEventListener('click', () => this.hideShareModal());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.hideShareModal();
    });
    modal.querySelector('[data-action="copy-text"]').addEventListener('click', () => this.copyShareText());
    modal.querySelector('[data-action="download-image"]').addEventListener('click', () => this.downloadShareImage());
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    document.addEventListener('mouseup', (e) => this.handleSelection(e));
    document.addEventListener('keyup', (e) => {
      if (e.key === 'Escape') {
        this.hideSelectionMenu();
        this.hideShareModal();
      }
    });
    document.addEventListener('mousedown', (e) => {
      const menu = document.getElementById('text-selection-menu');
      const modal = document.getElementById('text-selection-modal');
      if (menu && !menu.contains(e.target) && (!modal || !modal.contains(e.target))) {
        this.hideSelectionMenu();
      }
    });
  }

  /**
   * Handle text selection
   */
  handleSelection(e) {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    const contentArea = document.querySelector(this.contentSelector);
    if (!contentArea) return;

    if (!selectedText || selectedText.length < this.minSelectionLength || !contentArea.contains(selection.anchorNode)) {
      this.hideSelectionMenu();
      return;
    }

    this.selectedText = selectedText;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const menu = document.getElementById('text-selection-menu');
    if (!menu) return;

    menu.style.visibility = 'hidden';
    menu.classList.add('is-visible');

    const menuHeight = menu.offsetHeight || 44;
    const menuWidth = menu.offsetWidth || 160;

    let top = window.scrollY + rect.top - menuHeight - 8;
    let left = window.scrollX + rect.left + (rect.width / 2) - (menuWidth / 2);

    if (left < 10) left = 10;
    if (left + menuWidth > window.innerWidth - 10) left = window.innerWidth - menuWidth - 10;
    if (top < window.scrollY + 60) top = window.scrollY + rect.bottom + 8;

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.style.visibility = 'visible';
  }

  /**
   * Hide selection menu
   */
  hideSelectionMenu() {
    const menu = document.getElementById('text-selection-menu');
    if (menu) menu.classList.remove('is-visible');
  }

  /**
   * Show share modal
   */
  showShareModal() {
    this.hideSelectionMenu();

    const modal = document.getElementById('text-selection-modal');
    const previewEl = modal.querySelector('.text-selection-preview');
    const quoteEl = document.getElementById('text-selection-quote');
    const citationEl = document.getElementById('text-selection-citation');
    const textArea = document.getElementById('text-selection-text');
    const downloadBtn = document.getElementById('text-selection-download-btn');
    const noteEl = document.getElementById('text-selection-length-note');

    // Apply theme class to preview
    previewEl.classList.remove('theme-dark', 'theme-light');
    previewEl.classList.add(`theme-${this.imageTheme}`);

    const canGenerateImage = this.selectedText.length <= this.maxImageLength;

    if (downloadBtn) {
      downloadBtn.style.display = canGenerateImage ? '' : 'none';
    }

    const displayText = this.selectedText.length > 500
      ? this.selectedText.substring(0, 497) + '...'
      : this.selectedText;

    quoteEl.textContent = `"${displayText}"`;
    citationEl.textContent = `— ${this.source}`;

    const shareText = `"${displayText}"\n\n— ${this.source}\n\nRead more: ${window.location.href}`;
    textArea.value = shareText;

    if (!canGenerateImage) {
      noteEl.innerHTML = `<p class="text-selection-note">Selection is too long for image generation (${this.selectedText.length} characters). You can still copy the text to share.</p>`;
    } else {
      noteEl.innerHTML = '';
    }

    modal.classList.add('is-visible');
  }

  /**
   * Hide share modal
   */
  hideShareModal() {
    const modal = document.getElementById('text-selection-modal');
    if (modal) modal.classList.remove('is-visible');
  }

  /**
   * Copy share text
   */
  async copyShareText() {
    const textArea = document.getElementById('text-selection-text');
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
   * Download quote as image
   */
  async downloadShareImage() {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const width = 1200;
      const height = 630;
      canvas.width = width;
      canvas.height = height;

      // Get theme colors
      const theme = this.themes[this.imageTheme] || this.themes.dark;

      // Background
      ctx.fillStyle = theme.background;
      ctx.fillRect(0, 0, width, height);

      // Quote accent bar
      ctx.fillStyle = theme.accentBar;
      ctx.fillRect(60, 80, 4, height - 160);

      // Quote text
      ctx.fillStyle = theme.quoteText;
      ctx.font = 'italic 28px Georgia, serif';

      const quoteText = `"${this.selectedText}"`;
      const maxWidth = width - 160;
      const lines = this.wrapText(ctx, quoteText, maxWidth);

      let y = 120;
      const lineHeight = 42;
      const maxLines = Math.floor((height - 220) / lineHeight);

      for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
        let line = lines[i];
        if (i === maxLines - 1 && lines.length > maxLines) {
          line = line.substring(0, line.length - 3) + '..."';
        }
        ctx.fillText(line, 84, y);
        y += lineHeight;
      }

      // Citation
      ctx.fillStyle = theme.citation;
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillText(`— ${this.source}`, 84, height - 60);

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
      this.showToast('Failed to generate image');
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

    if (currentLine) lines.push(currentLine);
    return lines;
  }

  /**
   * Show toast notification
   */
  showToast(message) {
    const existing = document.querySelector('.text-selection-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'text-selection-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
  }
}

// Auto-initialize if data attribute is present
document.addEventListener('DOMContentLoaded', () => {
  const trigger = document.querySelector('[data-text-selection]');
  if (trigger) {
    const tool = new TextSelectionTool({
      contentSelector: trigger.getAttribute('data-text-selection') || 'main',
      source: trigger.getAttribute('data-source') || 'Jay Rosen, "The Impossible Press" (1986)'
    });
    tool.init();
  }
});

export default TextSelectionTool;
