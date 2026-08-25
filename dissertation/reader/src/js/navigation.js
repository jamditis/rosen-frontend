/**
 * Navigation Manager for the Dissertation Reader
 * Handles ToC, scroll tracking, and keyboard navigation
 */

class ReaderNavigation {
  constructor() {
    this.navEl = null;
    this.overlayEl = null;
    this.tocLinks = [];
    this.headings = [];
    this.currentSection = null;
    this.observer = null;
    this.isNavOpen = false;
  }

  /**
   * Initialize the navigation
   */
  init() {
    this.navEl = document.querySelector('.reader-nav');
    this.overlayEl = document.querySelector('.nav-overlay');

    if (!this.navEl) return;

    // ToC links first: collectHeadings narrows the scroll-spy set to the
    // headings the ToC actually links, so a non-linked subheading can't blank
    // every highlight as it scrolls past.
    this.collectTocLinks();
    this.collectHeadings();
    this.setupScrollTracking();
    this.setupMobileNav();
    this.setupKeyboardNav();
    this.setupBackToTop();
  }

  /**
   * Collect the section headings the scroll-spy tracks. Only headings that the
   * ToC links are tracked, so the active-section highlight maps 1:1 to a ToC
   * entry and the last chapter stays highlighted while its body is read
   * (instead of de-highlighting on every non-linked subheading). Falls back to
   * all headings if the ToC targets resolve to nothing.
   */
  collectHeadings() {
    const content = document.querySelector('.reader-content');
    if (!content) return;

    const all = Array.from(content.querySelectorAll('h1[id], h2[id], h3[id]'));
    const tocTargets = new Set(
      this.tocLinks.map(link => link.getAttribute('href').slice(1))
    );
    const linked = all.filter(h => tocTargets.has(h.id));
    this.headings = linked.length ? linked : all;
  }

  /**
   * Collect ToC links and set up click handlers
   */
  collectTocLinks() {
    this.tocLinks = Array.from(this.navEl.querySelectorAll('.toc-link'));

    this.tocLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('href').slice(1);
        this.scrollToSection(targetId);

        // Close mobile nav after clicking
        if (this.isNavOpen) {
          this.closeNav();
        }
      });
    });
  }

  /**
   * Setup IntersectionObserver for scroll tracking
   */
  setupScrollTracking() {
    if (!this.headings.length) return;

    const options = {
      rootMargin: '-20% 0px -70% 0px',
      threshold: 0
    };

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this.setActiveSection(entry.target.id);
        }
      });
    }, options);

    this.headings.forEach(heading => {
      this.observer.observe(heading);
    });
  }

  /**
   * Set the currently active section
   * @param {string} sectionId
   */
  setActiveSection(sectionId) {
    if (this.currentSection === sectionId) return;

    this.currentSection = sectionId;

    // Update ToC highlighting
    this.tocLinks.forEach(link => {
      const linkTarget = link.getAttribute('href').slice(1);
      link.classList.toggle('is-active', linkTarget === sectionId);
    });

    // Keep an explicit footnote round trip in browser history while the smooth
    // scroll crosses tracked headings. ToC navigation replaces it deliberately
    // in scrollToSection(), so normal section tracking can resume afterward.
    const hasFootnoteHash = /^#fn(?:ref)?-/.test(window.location.hash);
    if (history.replaceState && !hasFootnoteHash) {
      history.replaceState(null, null, `#${sectionId}`);
    }

    // Dispatch custom event for progress tracking
    document.dispatchEvent(new CustomEvent('sectionchange', {
      detail: { sectionId }
    }));
  }

  /**
   * Scroll to a specific section
   * @param {string} sectionId
   */
  scrollToSection(sectionId) {
    const target = document.getElementById(sectionId);
    if (!target) return;

    if (history.replaceState) {
      history.replaceState(null, null, `#${sectionId}`);
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Focus the heading for accessibility
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }

  /**
   * Setup mobile navigation toggle
   */
  setupMobileNav() {
    const toggleBtn = document.querySelector('.menu-toggle');
    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
      this.toggleNav();
    });

    // Close on overlay click
    if (this.overlayEl) {
      this.overlayEl.addEventListener('click', () => {
        this.closeNav();
      });
    }
  }

  /**
   * Toggle mobile navigation
   */
  toggleNav() {
    if (this.isNavOpen) {
      this.closeNav();
    } else {
      this.openNav();
    }
  }

  /**
   * Open mobile navigation
   */
  openNav() {
    this.navEl.classList.add('is-open');
    this.overlayEl?.classList.add('is-visible');
    this.isNavOpen = true;

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Focus first ToC link
    const firstLink = this.navEl.querySelector('.toc-link');
    if (firstLink) {
      firstLink.focus();
    }
  }

  /**
   * Close mobile navigation
   */
  closeNav() {
    this.navEl.classList.remove('is-open');
    this.overlayEl?.classList.remove('is-visible');
    this.isNavOpen = false;

    // Restore body scroll
    document.body.style.overflow = '';
  }

  /**
   * Setup keyboard navigation
   */
  setupKeyboardNav() {
    document.addEventListener('keydown', (e) => {
      // Escape closes mobile nav
      if (e.key === 'Escape' && this.isNavOpen) {
        this.closeNav();
        document.querySelector('.menu-toggle')?.focus();
        return;
      }

      // Alt+Left/Right for previous/next chapter
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        this.navigateChapter(e.key === 'ArrowRight' ? 'next' : 'prev');
        return;
      }

      // Home/End for beginning/end
      if (e.key === 'Home' && e.ctrlKey) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      if (e.key === 'End' && e.ctrlKey) {
        e.preventDefault();
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        return;
      }
    });
  }

  /**
   * Navigate to previous or next chapter
   * @param {'prev' | 'next'} direction
   */
  navigateChapter(direction) {
    if (!this.currentSection) return;

    const currentIndex = this.headings.findIndex(h => h.id === this.currentSection);
    if (currentIndex === -1) return;

    const newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

    if (newIndex >= 0 && newIndex < this.headings.length) {
      this.scrollToSection(this.headings[newIndex].id);
    }
  }

  /**
   * Setup back to top button
   */
  setupBackToTop() {
    const btn = document.querySelector('.back-to-top');
    if (!btn) return;

    // Show/hide based on scroll position
    const toggleVisibility = () => {
      const scrolled = window.scrollY > window.innerHeight * 0.5;
      btn.classList.toggle('is-visible', scrolled);
    };

    window.addEventListener('scroll', toggleVisibility, { passive: true });
    toggleVisibility();

    // Click handler
    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /**
   * Get the current reading position (0-100)
   */
  getScrollProgress() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    return Math.min(100, Math.max(0, (scrollTop / docHeight) * 100));
  }
}

export default ReaderNavigation;
