/**
 * TimeFilter - Utilities for filtering papers by time range
 *
 * Handles date range calculations and multi-month data loading
 * for time-based filters (today, week, month).
 */

export class TimeFilter {
  /**
   * Get the date range for a filter type
   * @param {string} filter - One of: 'today', 'week', 'month'
   * @param {Date} referenceDate - Reference date for 'today' (defaults to now)
   * @returns {{start: Date, end: Date}} - Date range in UTC
   */
  static getDateRange(filter, referenceDate = null) {
    const now = referenceDate || new Date();
    const end = new Date(now); // Clone to avoid mutation
    let start;

    switch (filter) {
      case 'today': {
        // Specific day 00:00:00 UTC to 23:59:59 UTC
        start = new Date(Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          0, 0, 0, 0
        ));
        // Set end to 23:59:59 of the same day
        end.setUTCFullYear(now.getUTCFullYear());
        end.setUTCMonth(now.getUTCMonth());
        end.setUTCDate(now.getUTCDate());
        end.setUTCHours(23, 59, 59, 999);
        break;
      }

      case 'week': {
        // 7 days ago
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      }

      case 'month': {
        // 30 days ago
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      }

      default: {
        // Default to week
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }
    }

    return { start, end };
  }

  /**
   * Convert a Date to YYMM month string
   * @param {Date} date
   * @returns {string} - e.g., "2603" for March 2026
   */
  static dateToMonthString(date) {
    const year = String(date.getUTCFullYear()).slice(-2);
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return year + month;
  }

  /**
   * Get list of required months to load for a filter
   * @param {string} filter - One of: 'today', 'week', 'month'
   * @param {string[]} availableMonths - Array of YYMM strings from index
   * @param {Date} referenceDate - Reference date for 'today' (defaults to now)
   * @returns {string[]} - Array of YYMM strings to load
   */
  static getRequiredMonths(filter, availableMonths, referenceDate = null) {
    const { start, end } = this.getDateRange(filter, referenceDate);

    // Generate all months between start and end
    const requiredMonths = new Set();
    const current = new Date(start);

    // Add start month
    requiredMonths.add(this.dateToMonthString(start));

    // Add all months in between
    while (current <= end) {
      requiredMonths.add(this.dateToMonthString(current));
      // Move to next month
      current.setUTCMonth(current.getUTCMonth() + 1);
    }

    // Add end month
    requiredMonths.add(this.dateToMonthString(end));

    // Filter to only available months and sort
    const available = Array.from(requiredMonths)
      .filter(month => availableMonths.includes(month))
      .sort();

    return available;
  }

  /**
   * Filter papers by date range for a given filter type
   * @param {Array} papers - Array of paper objects
   * @param {string} filter - One of: 'today', 'week', 'month'
   * @param {Date} referenceDate - Reference date for 'today' (defaults to now)
   * @returns {Array} - Filtered papers
   */
  static filterPapers(papers, filter, referenceDate = null) {
    const { start, end } = this.getDateRange(filter, referenceDate);

    return papers.filter(paper => {
      if (!paper.published) return false;

      const publishedDate = new Date(paper.published);
      return publishedDate >= start && publishedDate <= end;
    });
  }

  /**
   * Get display label for a filter
   * @param {string} filter - One of: 'today', 'week', 'month'
   * @param {Date} referenceDate - Reference date for 'today' (defaults to now)
   * @returns {string} - Display label
   */
  static getFilterLabel(filter, referenceDate = null) {
    if (filter === 'today' && referenceDate) {
      // Format as "Month DD, YYYY" (e.g., "March 11, 2026")
      return referenceDate.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    }

    const labels = {
      'today': 'Today',
      'week': 'Last Week',
      'month': 'Last Month'
    };
    return labels[filter] || 'Last Week';
  }

  /**
   * Validate filter string
   * @param {string} filter - Filter to validate
   * @returns {boolean} - True if valid
   */
  static isValidFilter(filter) {
    return ['today', 'week', 'month'].includes(filter);
  }
}
