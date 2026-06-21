/**
 * Progress Tracker for the Dissertation Reader
 * Tracks reading position and offers resume functionality
 */

const PROGRESS_STORAGE_KEY = 'dissertation-reader-progress';

class ReadingProgress {
  constructor() {
    this.progressBarEl = null;
    this.progressFillEl = null;
    this.currentSection = null;
    this.scrollProgress = 0;
    this.lastSaveTime = 0;
    this.saveInterval = 5000; // Save every 5 seconds
  }

  /**
   * Initialize the progress tracker
   */
  init() {
    this.progressBarEl = document.querySelector('.progress-bar');
    this.progressFillEl = document.querySelector('.progress-bar__fill');

    this.setupScrollTracking();
    this.setupSectionTracking();
    this.checkForSavedPosition();
  }

  /**
   * Setup scroll progress tracking
   */
  setupScrollTracking() {
    let ticking = false;

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          this.updateScrollProgress();
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  /**
   * Update the scroll progress
   */
  updateScrollProgress() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    this.scrollProgress = Math.min(100, Math.max(0, (scrollTop / docHeight) * 100));

    // Update progress bar
    if (this.progressFillEl) {
      this.progressFillEl.style.width = `${this.scrollProgress}%`;
    }

    // Periodically save position
    const now = Date.now();
    if (now - this.lastSaveTime > this.saveInterval) {
      this.savePosition();
      this.lastSaveTime = now;
    }
  }

  /**
   * Setup section change tracking
   */
  setupSectionTracking() {
    document.addEventListener('sectionchange', (e) => {
      this.currentSection = e.detail.sectionId;
      this.savePosition();
    });
  }

  /**
   * Save current reading position
   */
  savePosition() {
    try {
      const data = {
        sectionId: this.currentSection,
        scrollProgress: this.scrollProgress,
        scrollY: window.scrollY,
        timestamp: Date.now()
      };
      localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save reading position:', e);
    }
  }

  /**
   * Load saved reading position
   */
  loadPosition() {
    try {
      const saved = localStorage.getItem(PROGRESS_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load reading position:', e);
    }
    return null;
  }

  /**
   * Check for saved position and offer to resume
   */
  checkForSavedPosition() {
    const saved = this.loadPosition();
    if (!saved) return;

    // Only offer resume when there is a usable position to return to: a
    // meaningful reading fraction, or at least a section anchor for a legacy or
    // partial entry. A non-finite scrollProgress (malformed storage) must not
    // slip through -- "undefined < 5" is false, which would otherwise surface a
    // "NaN% complete" prompt.
    const savedPct = Number(saved.scrollProgress);
    const hasFraction = Number.isFinite(savedPct) && savedPct >= 5;
    if (!hasFraction && !saved.sectionId) return;

    // Only offer if saved within last 30 days
    const maxAge = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - saved.timestamp > maxAge) return;

    this.showResumePrompt(saved);
  }

  /**
   * Show a prompt to resume reading
   * @param {Object} savedPosition
   */
  showResumePrompt(savedPosition) {
    const prompt = document.createElement('div');
    prompt.className = 'resume-prompt';
    const pct = Number(savedPosition.scrollProgress);
    const label = Number.isFinite(pct)
      ? `Continue reading from where you left off? (${Math.round(pct)}% complete)`
      : 'Continue reading from where you left off?';
    prompt.innerHTML = `
      <div class="resume-prompt__content">
        <p>${label}</p>
        <div class="resume-prompt__actions">
          <button class="btn btn--primary" data-action="resume">Continue reading</button>
          <button class="btn btn--secondary" data-action="dismiss">Start from beginning</button>
        </div>
      </div>
    `;

    // Add styles for the prompt
    const style = document.createElement('style');
    style.textContent = `
      .resume-prompt {
        position: fixed;
        bottom: var(--space-6);
        left: 50%;
        transform: translateX(-50%);
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: var(--border-radius-md);
        padding: var(--space-4);
        box-shadow: var(--shadow-lg);
        z-index: var(--z-toast);
        max-width: 400px;
        width: calc(100% - var(--space-8));
        animation: slideUp 0.3s ease;
      }

      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      }

      .resume-prompt__content p {
        margin: 0 0 var(--space-3);
        font-size: var(--font-size-sm);
      }

      .resume-prompt__actions {
        display: flex;
        gap: var(--space-2);
        flex-wrap: wrap;
      }
    `;
    document.head.appendChild(style);

    // Handle button clicks
    prompt.querySelector('[data-action="resume"]').addEventListener('click', () => {
      this.resumeReading(savedPosition);
      prompt.remove();
    });

    prompt.querySelector('[data-action="dismiss"]').addEventListener('click', () => {
      this.clearSavedPosition();
      prompt.remove();
    });

    document.body.appendChild(prompt);

    // Dismiss when the reader starts scrolling (an actual decision to read from
    // here) rather than on a fixed timer that can yank the prompt mid-choice.
    // Saved position is kept so a later visit can still offer resume.
    const dismissOnScroll = () => {
      if (prompt.parentNode) prompt.remove();
      window.removeEventListener('scroll', dismissOnScroll);
    };
    window.addEventListener('scroll', dismissOnScroll, { passive: true, once: true });
  }

  /**
   * Resume reading from saved position
   * @param {Object} savedPosition
   */
  resumeReading(savedPosition) {
    // Restore by reading fraction, not an absolute pixel offset. scrollProgress
    // is a ratio of the live document height, so it survives reflow (font size,
    // width, spacing) between sessions and still returns the reader to where
    // they actually were -- mid-chapter, not the chapter top an element anchor
    // would snap to. It is also the value the resume prompt reports
    // ("N% complete"), so the jump matches what the reader was promised.
    const pct = Number(savedPosition.scrollProgress);
    if (Number.isFinite(pct)) {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({ top: Math.max(0, (pct / 100) * docHeight), behavior: 'smooth' });
      return;
    }
    // Malformed or legacy entry with only a section anchor: a coarse jump to the
    // section beats a NaN scroll that would go nowhere.
    const target = savedPosition.sectionId && document.getElementById(savedPosition.sectionId);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * Clear saved position
   */
  clearSavedPosition() {
    try {
      localStorage.removeItem(PROGRESS_STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear reading position:', e);
    }
  }

  /**
   * Get current progress percentage
   */
  getProgress() {
    return this.scrollProgress;
  }

  /**
   * Check if reading is complete
   */
  isComplete() {
    return this.scrollProgress >= 95;
  }
}

export default ReadingProgress;
