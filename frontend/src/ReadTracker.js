/**
 * ReadTracker - Manages read/unread state for papers
 *
 * Uses IntersectionObserver to detect when papers are visible in viewport
 * and marks them as read after 2 seconds of continuous visibility.
 *
 * Read state is stored in localStorage and shared across all pages.
 */

class ReadTracker {
  constructor() {
    this.readPapers = new Set();
    this.observer = null;
    this.timers = new Map(); // paperId -> timeoutId
    this.STORAGE_KEY = 'wloga_read_papers';
    this.READ_DELAY_MS = 2000; // 2 seconds
    this.VISIBILITY_THRESHOLD = 0.5; // 50% visibility

    this.initObserver();
  }

  /**
   * Initialize the IntersectionObserver
   */
  initObserver() {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          const paperId = entry.target.dataset.id;
          if (!paperId) return;

          if (entry.isIntersecting && entry.intersectionRatio >= this.VISIBILITY_THRESHOLD) {
            // Paper is visible at threshold - start timer
            this.startReadTimer(paperId);
          } else {
            // Paper left viewport - cancel timer
            this.cancelReadTimer(paperId);
          }
        });
      },
      {
        threshold: this.VISIBILITY_THRESHOLD
      }
    );
  }

  /**
   * Start a timer to mark paper as read after delay
   */
  startReadTimer(paperId) {
    // Don't start timer if already read
    if (this.readPapers.has(paperId)) return;

    // Don't start timer if one is already running for this paper
    if (this.timers.has(paperId)) return;

    const timerId = setTimeout(() => {
      this.markAsRead(paperId);
      this.timers.delete(paperId);
    }, this.READ_DELAY_MS);

    this.timers.set(paperId, timerId);
  }

  /**
   * Cancel the read timer for a paper
   */
  cancelReadTimer(paperId) {
    if (this.timers.has(paperId)) {
      clearTimeout(this.timers.get(paperId));
      this.timers.delete(paperId);
    }
  }

  /**
   * Load read papers from localStorage
   */
  load() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const paperIds = JSON.parse(stored);
        this.readPapers = new Set(paperIds);
      }
    } catch (error) {
      console.warn('Failed to load read papers from localStorage:', error);
      this.readPapers = new Set();
    }
  }

  /**
   * Save read papers to localStorage
   */
  save() {
    try {
      const paperIds = Array.from(this.readPapers);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(paperIds));
    } catch (error) {
      console.warn('Failed to save read papers to localStorage:', error);
    }
  }

  /**
   * Check if a paper has been read
   */
  isRead(paperId) {
    return this.readPapers.has(paperId);
  }

  /**
   * Mark a paper as read
   */
  markAsRead(paperId) {
    if (!this.readPapers.has(paperId)) {
      this.readPapers.add(paperId);
      this.save();

      // Dispatch custom event so UI can react
      window.dispatchEvent(new CustomEvent('paperread', { detail: { paperId } }));
    }
  }

  /**
   * Mark a paper as unread
   */
  markAsUnread(paperId) {
    if (this.readPapers.has(paperId)) {
      this.readPapers.delete(paperId);
      this.save();

      // Dispatch custom event so UI can react
      window.dispatchEvent(new CustomEvent('paperunread', { detail: { paperId } }));
    }
  }

  /**
   * Start observing an element for viewport visibility
   */
  observe(element, paperId) {
    if (!element || !paperId) return;

    // Make sure element has the paper ID in dataset
    element.dataset.id = paperId;

    this.observer.observe(element);
  }

  /**
   * Stop observing a specific element
   */
  unobserve(element) {
    if (element && this.observer) {
      const paperId = element.dataset.id;
      if (paperId) {
        this.cancelReadTimer(paperId);
      }
      this.observer.unobserve(element);
    }
  }

  /**
   * Stop observing all elements and clear all timers
   */
  unobserveAll() {
    if (this.observer) {
      this.observer.disconnect();
    }

    // Clear all pending timers
    this.timers.forEach(timerId => clearTimeout(timerId));
    this.timers.clear();

    // Reinitialize observer for next use
    this.initObserver();
  }

  /**
   * Get count of read papers
   */
  getReadCount() {
    return this.readPapers.size;
  }

  /**
   * Clear all read papers (for debugging/testing)
   */
  clearAll() {
    this.readPapers.clear();
    this.save();
  }
}

// Export singleton instance
export const readTracker = new ReadTracker();
