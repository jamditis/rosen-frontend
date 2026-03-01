/**
 * Settings Manager for the Dissertation Reader
 * Handles theme, font size, and line height preferences
 */

const STORAGE_KEY = 'dissertation-reader-settings';

const DEFAULT_SETTINGS = {
  theme: 'system',       // 'light' | 'dark' | 'system'
  fontSize: 'medium',    // 'small' | 'medium' | 'large'
  lineHeight: 'normal',  // 'compact' | 'normal' | 'relaxed'
  margin: 'normal',      // 'narrow' | 'normal' | 'wide'
};

class ReaderSettings {
  constructor() {
    this.state = this.load();
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.panelEl = null;
    this.isOpen = false;
  }

  /**
   * Initialize the settings manager
   */
  init() {
    // Apply saved settings immediately (prevents flash)
    this.applyAll();

    // Listen for system theme changes
    this.mediaQuery.addEventListener('change', () => {
      if (this.state.theme === 'system') {
        this.applyTheme();
      }
    });

    // Setup UI after DOM ready
    this.setupPanel();
    this.setupToggle();
  }

  /**
   * Load settings from localStorage
   */
  load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load settings:', e);
    }
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * Save settings to localStorage
   */
  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  }

  /**
   * Apply all current settings to the DOM
   */
  applyAll() {
    this.applyTheme();
    this.applyFontSize();
    this.applyLineHeight();
    this.applyMargin();
  }

  /**
   * Apply theme setting
   */
  applyTheme() {
    const html = document.documentElement;
    const effectiveTheme = this.getEffectiveTheme();

    // Remove existing theme attribute
    html.removeAttribute('data-theme');

    // Apply theme
    if (effectiveTheme === 'dark') {
      html.setAttribute('data-theme', 'dark');
    } else if (effectiveTheme === 'light') {
      html.setAttribute('data-theme', 'light');
    }
    // 'system' handled by CSS media query when no attribute set
  }

  /**
   * Get the effective theme (resolves 'system' to actual value)
   */
  getEffectiveTheme() {
    if (this.state.theme === 'system') {
      return this.mediaQuery.matches ? 'dark' : 'light';
    }
    return this.state.theme;
  }

  /**
   * Set theme
   * @param {'light' | 'dark' | 'system'} theme
   */
  setTheme(theme) {
    this.state.theme = theme;
    this.applyTheme();
    this.save();
    this.updatePanelUI();
  }

  /**
   * Apply font size setting
   */
  applyFontSize() {
    const html = document.documentElement;
    html.removeAttribute('data-font-size');

    if (this.state.fontSize !== 'medium') {
      html.setAttribute('data-font-size', this.state.fontSize);
    }
  }

  /**
   * Set font size
   * @param {'small' | 'medium' | 'large'} size
   */
  setFontSize(size) {
    this.state.fontSize = size;
    this.applyFontSize();
    this.save();
    this.updatePanelUI();
  }

  /**
   * Apply line height setting
   */
  applyLineHeight() {
    const html = document.documentElement;
    html.removeAttribute('data-line-height');

    if (this.state.lineHeight !== 'normal') {
      html.setAttribute('data-line-height', this.state.lineHeight);
    }
  }

  /**
   * Set line height
   * @param {'compact' | 'normal' | 'relaxed'} height
   */
  setLineHeight(height) {
    this.state.lineHeight = height;
    this.applyLineHeight();
    this.save();
    this.updatePanelUI();
  }

  /**
   * Apply margin setting
   */
  applyMargin() {
    const html = document.documentElement;
    html.removeAttribute('data-margin');

    if (this.state.margin !== 'normal') {
      html.setAttribute('data-margin', this.state.margin);
    }
  }

  /**
   * Set margin/column width
   * @param {'narrow' | 'normal' | 'wide'} margin
   */
  setMargin(margin) {
    this.state.margin = margin;
    this.applyMargin();
    this.save();
    this.updatePanelUI();
  }

  /**
   * Setup the settings panel in the DOM
   */
  setupPanel() {
    this.panelEl = document.querySelector('.settings-panel');
    if (!this.panelEl) return;

    // Theme options
    this.panelEl.querySelectorAll('[data-theme-option]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setTheme(btn.dataset.themeOption);
      });
    });

    // Font size options
    this.panelEl.querySelectorAll('[data-fontsize-option]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setFontSize(btn.dataset.fontsizeOption);
      });
    });

    // Line height options
    this.panelEl.querySelectorAll('[data-lineheight-option]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setLineHeight(btn.dataset.lineheightOption);
      });
    });

    // Margin/column width options
    this.panelEl.querySelectorAll('[data-margin-option]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setMargin(btn.dataset.marginOption);
      });
    });

    this.updatePanelUI();
  }

  /**
   * Setup the settings toggle button
   */
  setupToggle() {
    const toggleBtn = document.querySelector('.settings-toggle');
    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
      this.togglePanel();
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
      if (this.isOpen &&
          !this.panelEl.contains(e.target) &&
          !e.target.closest('.settings-toggle')) {
        this.closePanel();
      }
    });

    // Close panel on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.closePanel();
      }
    });
  }

  /**
   * Toggle the settings panel
   */
  togglePanel() {
    if (this.isOpen) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }

  /**
   * Open the settings panel
   */
  openPanel() {
    if (!this.panelEl) return;
    this.panelEl.classList.add('is-open');
    this.isOpen = true;
  }

  /**
   * Close the settings panel
   */
  closePanel() {
    if (!this.panelEl) return;
    this.panelEl.classList.remove('is-open');
    this.isOpen = false;
  }

  /**
   * Update panel UI to reflect current state
   */
  updatePanelUI() {
    if (!this.panelEl) return;

    // Update theme buttons
    this.panelEl.querySelectorAll('[data-theme-option]').forEach(btn => {
      btn.classList.toggle('is-selected', btn.dataset.themeOption === this.state.theme);
    });

    // Update font size buttons
    this.panelEl.querySelectorAll('[data-fontsize-option]').forEach(btn => {
      btn.classList.toggle('is-selected', btn.dataset.fontsizeOption === this.state.fontSize);
    });

    // Update line height buttons
    this.panelEl.querySelectorAll('[data-lineheight-option]').forEach(btn => {
      btn.classList.toggle('is-selected', btn.dataset.lineheightOption === this.state.lineHeight);
    });

    // Update margin/column width buttons
    this.panelEl.querySelectorAll('[data-margin-option]').forEach(btn => {
      btn.classList.toggle('is-selected', btn.dataset.marginOption === this.state.margin);
    });
  }
}

export default ReaderSettings;
