import { embeddingStore } from './EmbeddingStore.js';
import { preferenceModel } from './PreferenceModel.js';
import { pairSelector } from './PairSelector.js';
import { readTracker } from './ReadTracker.js';
import { TimeFilter } from './TimeFilter.js';

const appContainer = document.getElementById('app');
const monthNav = document.getElementById('month-nav');

// Global state
let currentPage = 'accessible';
let currentFilter = 'week'; // Changed from currentMonth
let allPapers = []; // Papers for current filter (may span multiple months)
let indexData = null;
let monthPaperCache = new Map(); // Cache: month -> papers[]
let currentFocusIndex = -1; // Currently focused paper index for keyboard navigation
let mostRecentDate = null; // Most recent paper date in the data
let hideReadPapers = false; // Toggle state for hiding read papers
let readPapersAtPageLoad = new Set(); // Papers that were read at page load time

// ============================================================================
// Data Loading
// ============================================================================

async function fetchIndex() {
  const response = await fetch('/data/index.json');
  return response.json();
}

async function findMostRecentDate() {
  // Get the most recent month
  const sortedMonths = [...indexData.months].sort().reverse();
  if (sortedMonths.length === 0) return null;

  // Load the most recent month
  const recentMonth = sortedMonths[0];
  const papers = await fetchMonth(recentMonth);

  if (papers.length === 0) return null;

  // Find the most recent paper date
  const dates = papers.map(p => new Date(p.published)).filter(d => !isNaN(d));
  if (dates.length === 0) return null;

  const mostRecent = new Date(Math.max(...dates));
  return mostRecent;
}

async function fetchMonth(month) {
  // Check cache first
  if (monthPaperCache.has(month)) {
    return monthPaperCache.get(month);
  }

  const response = await fetch(`/data/${month}.json`);
  const papers = await response.json();

  // Cache the result
  monthPaperCache.set(month, papers);

  return papers;
}

async function loadFilterData(filter) {
  // Get required months for this filter
  const requiredMonths = TimeFilter.getRequiredMonths(filter, indexData.months, mostRecentDate);

  if (requiredMonths.length === 0) {
    allPapers = [];
    return allPapers;
  }

  // Load all required months in parallel
  const monthPapersPromises = requiredMonths.map(month => fetchMonth(month));
  const monthPapersArrays = await Promise.all(monthPapersPromises);

  // Flatten all papers from all months
  const allMonthPapers = monthPapersArrays.flat();

  // Deduplicate by paper ID (in case of overlaps)
  const uniquePapers = Array.from(
    new Map(allMonthPapers.map(p => [p.id, p])).values()
  );

  // Load embeddings for all required months
  await Promise.all(
    requiredMonths.map(month => {
      const monthPapers = uniquePapers.filter(p => p.id.startsWith(month));
      return embeddingStore.loadMonth(month, monthPapers);
    })
  );

  // Filter papers by date range
  const filtered = TimeFilter.filterPapers(uniquePapers, filter, mostRecentDate);

  // Update global state
  allPapers = filtered;

  return filtered;
}

// ============================================================================
// Formatting Utilities
// ============================================================================

function formatMonth(monthStr) {
  const year = '20' + monthStr.slice(0, 2);
  const month = parseInt(monthStr.slice(2), 10);
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return `${monthNames[month - 1]} ${year}`;
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function processLatexFormatting(str) {
  if (!str) return '';

  // First escape HTML to prevent injection
  let result = escapeHtml(str);

  // Convert {\em text} to <em>text</em>
  // Handle nested braces by matching balanced braces
  result = result.replace(/\{\\em\s+([^}]+)\}/g, '<em>$1</em>');

  // Convert \emph{text} to <em>text</em>
  result = result.replace(/\\emph\{([^}]+)\}/g, '<em>$1</em>');

  // Convert {\it text} to <em>text</em> (italic)
  result = result.replace(/\{\\it\s+([^}]+)\}/g, '<em>$1</em>');

  // Convert \textit{text} to <em>text</em>
  result = result.replace(/\\textit\{([^}]+)\}/g, '<em>$1</em>');

  // Convert {\bf text} to <strong>text</strong> (bold)
  result = result.replace(/\{\\bf\s+([^}]+)\}/g, '<strong>$1</strong>');

  // Convert \textbf{text} to <strong>text</strong>
  result = result.replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>');

  return result;
}

// ============================================================================
// Paper Rendering
// ============================================================================

function renderPaperCard(paper, options = {}) {
  const { compact = false, showScore = false, score = null, showReasoning = true } = options;

  const isRead = readTracker.isRead(paper.id);

  const article = document.createElement('article');
  article.className = 'paper' +
    (compact ? ' paper-compact' : '') +
    (isRead ? ' paper-read' : '');
  article.dataset.id = paper.id;

  const title = processLatexFormatting(paper.title);
  const authors = escapeHtml(paper.authors.join(', '));
  const abstract = processLatexFormatting(paper.abstract);

  // Render categories as individual badges
  const categoryBadges = paper.categories.map(cat => {
    const cleanCat = escapeHtml(cat);
    const categoryClass = cat.replace(/\./g, '-'); // math.CO -> math-CO
    return `<span class="paper-category category-${categoryClass}">${cleanCat}</span>`;
  }).join('');

  let scoreHtml = '';
  if (showScore && score !== null) {
    const scorePercent = Math.round((1 / (1 + Math.exp(-score))) * 100);
    scoreHtml = `<span class="paper-score" title="Model confidence">${scorePercent}%</span>`;
  }

  let reasoningHtml = '';
  if (!compact && showReasoning && paper.reasoning) {
    reasoningHtml = `<p class="paper-reasoning"><em>${processLatexFormatting(paper.reasoning)}</em></p>`;
  }

  let tagsHtml = '';
  if (paper.tags && paper.tags.length > 0) {
    tagsHtml = `
      <div class="paper-tags">
        ${paper.tags.map(tag => `<span class="tag">${processLatexFormatting(tag)}</span>`).join('')}
      </div>
    `;
  }

  article.innerHTML = `
    <h2 class="paper-title">${scoreHtml}${title}</h2>
    <p class="paper-authors">${authors}</p>
    <p class="paper-meta">
      <span class="paper-meta-left">
        <span class="paper-categories">${categoryBadges}</span>
        <span class="paper-date">${formatDate(paper.published)}</span>
      </span>
    </p>
    <div class="paper-abstract">${abstract}</div>
    ${reasoningHtml}
    ${tagsHtml}
    <div class="paper-links">
      <a href="${escapeHtml(paper.arxivUrl)}" target="_blank" rel="noopener">arXiv Abstract</a>
      <a href="${escapeHtml(paper.pdfUrl)}" target="_blank" rel="noopener">PDF</a>
    </div>
  `;

  // Add read badge if paper is read
  if (isRead) {
    const metaDiv = article.querySelector('.paper-meta');
    const readBadge = document.createElement('span');
    readBadge.className = 'read-badge';
    readBadge.innerHTML = '<span class="read-badge-check">✓</span><span class="read-badge-x">×</span> Read';
    readBadge.dataset.paperId = paper.id;
    metaDiv.appendChild(readBadge);

    // Add click handler to mark as unread
    readBadge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      readTracker.markAsUnread(paper.id);
      article.classList.remove('paper-read');
      readBadge.remove();
    });
  }

  // Set up intersection observer for this paper (unless it's compact for training view)
  if (!compact) {
    readTracker.observe(article, paper.id);

    // Add click handler to move keyboard focus to this paper
    article.addEventListener('click', (e) => {
      // Don't handle clicks on links, buttons, or the read badge
      if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON' ||
          e.target.closest('.read-badge')) {
        return;
      }

      const papers = appContainer.querySelectorAll('.paper:not(.paper-compact)');
      const index = Array.from(papers).indexOf(article);
      if (index !== -1) {
        setFocus(papers, index);
      }
    });

    // Make article cursor pointer to indicate it's clickable
    article.style.cursor = 'pointer';
  }

  return article;
}

function renderComparisonCard(paper) {
  const article = document.createElement('article');
  article.className = 'comparison-card';
  article.dataset.id = paper.id;

  const title = processLatexFormatting(paper.title);
  const authors = escapeHtml(
    paper.authors.slice(0, 3).join(', ') +
    (paper.authors.length > 3 ? ', et al.' : '')
  );

  // Render first 3 categories as badges
  const categoryBadges = paper.categories.slice(0, 3).map(cat => {
    const cleanCat = escapeHtml(cat);
    const categoryClass = cat.replace(/\./g, '-');
    return `<span class="paper-category category-${categoryClass}">${cleanCat}</span>`;
  }).join('');

  // Truncate abstract for comparison view
  const abstractPreview = processLatexFormatting(
    paper.abstract.length > 400
      ? paper.abstract.slice(0, 400) + '...'
      : paper.abstract
  );

  article.innerHTML = `
    <h3 class="card-title">${title}</h3>
    <p class="card-authors">${authors}</p>
    <div class="card-categories">${categoryBadges}</div>
    <div class="card-abstract">${abstractPreview}</div>
    ${paper.tags && paper.tags.length > 0 ? `
      <div class="card-tags">
        ${paper.tags.slice(0, 3).map(tag => `<span class="tag">${processLatexFormatting(tag)}</span>`).join('')}
      </div>
    ` : ''}
  `;

  return article;
}

// ============================================================================
// Page: Accessible (Curated)
// ============================================================================

async function renderAccessiblePage(filter) {
  // allPapers already loaded and filtered by loadFilterData()

  // Filter to accessible papers only
  let accessiblePapers = allPapers.filter(p => p.accessible === true);

  // If toggle is on, filter out papers that were read BEFORE page load
  // Papers marked as read during THIS session stay visible
  if (hideReadPapers) {
    accessiblePapers = accessiblePapers.filter(
      p => !readPapersAtPageLoad.has(p.id)
    );
  }

  // Sort by date, newest first (regardless of read state)
  accessiblePapers.sort((a, b) => new Date(b.published) - new Date(a.published));

  appContainer.innerHTML = '';

  if (accessiblePapers.length === 0) {
    appContainer.innerHTML = '<p class="empty">No accessible papers for this time period.</p>';
    return;
  }

  const heading = document.createElement('h2');
  heading.className = 'month-heading';
  const filterLabel = TimeFilter.getFilterLabel(filter, mostRecentDate);

  // Show count of visible vs total papers if hiding read
  let countText = `${accessiblePapers.length} curated papers`;
  if (hideReadPapers) {
    const totalCount = allPapers.filter(p => p.accessible === true).length;
    countText = `${accessiblePapers.length} of ${totalCount} curated papers`;
  }

  heading.textContent = `${filterLabel} (${countText})`;
  appContainer.appendChild(heading);

  for (const paper of accessiblePapers) {
    appContainer.appendChild(renderPaperCard(paper));
  }

  await typeset();
}

// ============================================================================
// Page: Ranked (For You)
// ============================================================================

async function renderRankedPage(filter) {
  // allPapers already loaded and filtered by loadFilterData()
  let papers = allPapers;

  // If toggle is on, filter out papers that were read BEFORE page load
  if (hideReadPapers) {
    papers = papers.filter(p => !readPapersAtPageLoad.has(p.id));
  }

  appContainer.innerHTML = '';

  const headerDiv = document.createElement('div');
  headerDiv.className = 'ranked-header';

  const compCount = preferenceModel.comparisonCount;
  const filterLabel = TimeFilter.getFilterLabel(filter, mostRecentDate);

  if (compCount === 0) {
    headerDiv.innerHTML = `
      <h2 class="month-heading">${filterLabel}</h2>
      <p class="ranked-info">
        No preferences recorded yet.
        <a href="#train/${filter}">Train your model</a> to get personalized rankings.
      </p>
    `;
    appContainer.appendChild(headerDiv);

    // Show papers in default order
    const sortedPapers = [...papers].sort((a, b) =>
      new Date(b.published) - new Date(a.published)
    );

    for (const paper of sortedPapers) {
      appContainer.appendChild(renderPaperCard(paper, { showReasoning: false }));
    }
  } else {
    // Get ranked papers
    const paperIds = papers.map(p => p.id);
    const ranked = preferenceModel.rank(paperIds);

    // Create lookup map
    const paperMap = new Map(papers.map(p => [p.id, p]));

    headerDiv.innerHTML = `
      <h2 class="month-heading">${filterLabel} - Ranked For You</h2>
      <p class="ranked-info">
        Based on ${compCount} comparison${compCount !== 1 ? 's' : ''}.
        <a href="#train/${filter}">Continue training</a> to improve.
      </p>
    `;
    appContainer.appendChild(headerDiv);

    for (const { id, score } of ranked) {
      const paper = paperMap.get(id);
      if (paper) {
        appContainer.appendChild(renderPaperCard(paper, { showScore: true, score, showReasoning: false }));
      }
    }
  }

  await typeset();
}

// ============================================================================
// Page: Train
// ============================================================================

let currentPair = null;

async function renderTrainPage(filter) {
  // allPapers already loaded and filtered by loadFilterData()

  appContainer.innerHTML = '';

  const trainContainer = document.createElement('div');
  trainContainer.className = 'train-container';

  const compCount = preferenceModel.comparisonCount;

  // Header with progress
  const header = document.createElement('div');
  header.className = 'train-header';
  header.innerHTML = `
    <h2>Train Your Preferences</h2>
    <p class="train-progress">
      ${compCount} comparison${compCount !== 1 ? 's' : ''} recorded
      ${compCount < 30 ? `<span class="train-hint"> - aim for 30+ for good results</span>` : ''}
    </p>
    <div class="train-actions">
      <button id="reset-model" class="btn btn-secondary">Reset Model</button>
      <a href="#ranked/${filter}" class="btn btn-primary">View Rankings</a>
    </div>
  `;
  trainContainer.appendChild(header);

  // Comparison area
  const comparisonArea = document.createElement('div');
  comparisonArea.className = 'comparison-area';
  comparisonArea.innerHTML = `
    <p class="comparison-prompt">Which paper interests you more?</p>
    <div class="comparison-cards" id="comparison-cards"></div>
    <div class="comparison-controls">
      <button id="skip-pair" class="btn btn-text">Skip this pair</button>
    </div>
    <p class="comparison-hint">Click a paper or use arrow keys (← left, → right)</p>
  `;
  trainContainer.appendChild(comparisonArea);

  appContainer.appendChild(trainContainer);

  // Set up event handlers
  document.getElementById('reset-model').addEventListener('click', handleResetModel);
  document.getElementById('skip-pair').addEventListener('click', showNextPair);

  // Show first pair
  showNextPair();
}

function showNextPair() {
  const paperIds = allPapers.map(p => p.id);
  const pair = pairSelector.selectPair(paperIds);

  if (!pair) {
    document.getElementById('comparison-cards').innerHTML =
      '<p class="empty">Not enough papers with embeddings to compare.</p>';
    return;
  }

  currentPair = pair;
  pairSelector.recordShown(pair.id1, pair.id2);

  const paper1 = allPapers.find(p => p.id === pair.id1);
  const paper2 = allPapers.find(p => p.id === pair.id2);

  const cardsContainer = document.getElementById('comparison-cards');
  cardsContainer.innerHTML = '';

  const card1 = renderComparisonCard(paper1);
  const card2 = renderComparisonCard(paper2);

  card1.addEventListener('click', () => handleChoice(pair.id1, pair.id2));
  card2.addEventListener('click', () => handleChoice(pair.id2, pair.id1));

  cardsContainer.appendChild(card1);
  cardsContainer.appendChild(card2);

  // Trigger MathJax
  typeset();
}

function handleChoice(winnerId, loserId) {
  // Record comparison
  preferenceModel.addComparison(winnerId, loserId);

  // Update model
  preferenceModel.update();

  // Save to localStorage
  preferenceModel.save();

  // Update progress display
  const compCount = preferenceModel.comparisonCount;
  const progressEl = document.querySelector('.train-progress');
  if (progressEl) {
    progressEl.innerHTML = `
      ${compCount} comparison${compCount !== 1 ? 's' : ''} recorded
      ${compCount < 30 ? `<span class="train-hint"> - aim for 30+ for good results</span>` : ''}
    `;
  }

  // Show next pair
  showNextPair();
}

function handleResetModel() {
  if (confirm('Reset your preference model? This will clear all your comparisons.')) {
    preferenceModel.reset();
    pairSelector.reset();
    renderTrainPage(currentFilter);
  }
}

// Keyboard navigation for training
document.addEventListener('keydown', (e) => {
  if (currentPage !== 'train' || !currentPair) return;

  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    handleChoice(currentPair.id1, currentPair.id2);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    handleChoice(currentPair.id2, currentPair.id1);
  }
});

// Keyboard navigation for accessible and ranked pages
document.addEventListener('keydown', (e) => {
  // Only work on accessible and ranked pages
  if (currentPage === 'train') return;

  const papers = appContainer.querySelectorAll('.paper:not(.paper-compact)');
  if (papers.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    moveFocus(papers, 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    moveFocus(papers, -1);
  }
});

function setFocus(papers, index) {
  // Remove current focus
  if (currentFocusIndex >= 0 && currentFocusIndex < papers.length) {
    papers[currentFocusIndex].classList.remove('paper-keyboard-focus');
  }

  // Update focus index
  currentFocusIndex = index;

  // Apply new focus
  const focusedPaper = papers[currentFocusIndex];
  focusedPaper.classList.add('paper-keyboard-focus');

  // Scroll into view
  focusedPaper.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });

  // Mark as read immediately
  const paperId = focusedPaper.dataset.id;
  if (paperId) {
    readTracker.markAsRead(paperId);
    // Update the UI to show it's read
    if (!focusedPaper.classList.contains('paper-read')) {
      focusedPaper.classList.add('paper-read');

      // Add read badge
      const metaDiv = focusedPaper.querySelector('.paper-meta');
      if (metaDiv && !metaDiv.querySelector('.read-badge')) {
        const readBadge = document.createElement('span');
        readBadge.className = 'read-badge';
        readBadge.innerHTML = '<span class="read-badge-check">✓</span><span class="read-badge-x">×</span> Read';
        readBadge.dataset.paperId = paperId;

        // Add click handler to mark as unread
        readBadge.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          readTracker.markAsUnread(paperId);
          focusedPaper.classList.remove('paper-read');
          readBadge.remove();
        });

        metaDiv.appendChild(readBadge);
      }
    }
  }
}

function moveFocus(papers, direction) {
  // Calculate new focus index
  let newIndex = currentFocusIndex + direction;

  // Clamp to valid range (no wrap-around)
  if (newIndex < 0) {
    newIndex = 0;
  } else if (newIndex >= papers.length) {
    newIndex = papers.length - 1;
  }

  setFocus(papers, newIndex);
}

// ============================================================================
// Navigation
// ============================================================================

function renderFilterNav(currentFilter) {
  const filters = [
    { id: 'today', label: TimeFilter.getFilterLabel('today', mostRecentDate) },
    { id: 'week', label: 'Last Week' },
    { id: 'month', label: 'Last Month' }
  ];

  monthNav.innerHTML = `
    <div class="filter-buttons">
      ${filters.map(filter => `
        <button
          class="filter-btn ${filter.id === currentFilter ? 'active' : ''}"
          data-filter="${filter.id}"
        >
          ${filter.label}
        </button>
      `).join('')}
    </div>
    <button class="toggle-read-btn" id="toggle-read-btn">
      ${hideReadPapers ? 'Show Read' : 'Hide Read'}
    </button>
  `;

  // Event listeners for filter buttons
  monthNav.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const filter = btn.dataset.filter;
      navigateTo(currentPage, filter);
    });
  });

  // Event listener for toggle button
  const toggleBtn = document.getElementById('toggle-read-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      hideReadPapers = !hideReadPapers;
      // Re-render current page with new toggle state
      rerenderCurrentPage();
    });
  }
}

function updateActiveNav(page, filter) {
  // Update page nav
  document.querySelectorAll('.page-link').forEach(link => {
    link.classList.toggle('active', link.dataset.page === page);
  });

  // Update filter nav
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
}

async function navigateTo(page, filter) {
  // Clean up observers from previous page
  readTracker.unobserveAll();

  // Reset keyboard focus
  currentFocusIndex = -1;

  currentPage = page;
  currentFilter = filter;

  // Update URL
  history.pushState(null, '', `#${page}/${filter}`);

  // Re-render filter nav to update labels
  renderFilterNav(filter);

  updateActiveNav(page, filter);

  appContainer.innerHTML = '<p class="loading">Loading...</p>';

  try {
    // Load data for filter
    await loadFilterData(filter);

    // Capture papers that are ALREADY read before rendering this page
    // These are the ones that can be hidden by the toggle
    readPapersAtPageLoad = new Set(
      allPapers.filter(p => readTracker.isRead(p.id)).map(p => p.id)
    );

    switch (page) {
      case 'accessible':
        await renderAccessiblePage(filter);
        break;
      case 'ranked':
        await renderRankedPage(filter);
        break;
      case 'train':
        await renderTrainPage(filter);
        break;
      default:
        await renderAccessiblePage(filter);
    }
  } catch (error) {
    console.error('Error rendering page:', error);
    appContainer.innerHTML = '<p class="error">Error loading content.</p>';
  }
}

async function rerenderCurrentPage() {
  // Update toggle button text
  const toggleBtn = document.getElementById('toggle-read-btn');
  if (toggleBtn) {
    toggleBtn.textContent = hideReadPapers ? 'Show Read' : 'Hide Read';
  }

  // Re-render current page without reloading data
  appContainer.innerHTML = '<p class="loading">Loading...</p>';

  try {
    switch (currentPage) {
      case 'accessible':
        await renderAccessiblePage(currentFilter);
        break;
      case 'ranked':
        await renderRankedPage(currentFilter);
        break;
      case 'train':
        // Train page doesn't have read filtering
        await renderTrainPage(currentFilter);
        break;
    }
  } catch (error) {
    console.error('Error re-rendering page:', error);
    appContainer.innerHTML = '<p class="error">Error loading content.</p>';
  }
}

function parseHash() {
  const hash = window.location.hash.slice(1);
  const parts = hash.split('/');

  let page = parts[0] || 'accessible';
  let filter = parts[1] || 'week';

  // Validate page
  if (!['accessible', 'ranked', 'train'].includes(page)) {
    page = 'accessible';
  }

  // Validate filter
  if (!TimeFilter.isValidFilter(filter)) {
    filter = 'week';
  }

  return { page, filter };
}

// ============================================================================
// MathJax
// ============================================================================

async function typeset() {
  if (window.MathJax && window.MathJax.typesetPromise) {
    try {
      await window.MathJax.typesetPromise([appContainer]);
    } catch (error) {
      console.warn('MathJax typeset error:', error);
    }
  }
}

// ============================================================================
// Initialization
// ============================================================================

async function init() {
  try {
    // Load saved model and read tracker
    preferenceModel.load();
    readTracker.load();

    // Fetch index
    indexData = await fetchIndex();

    if (indexData.months.length === 0) {
      appContainer.innerHTML = '<p class="empty">No papers available yet.</p>';
      return;
    }

    // Find the most recent paper date
    mostRecentDate = await findMostRecentDate();

    // Parse URL and navigate
    const { page, filter } = parseHash();

    // Render filter nav
    renderFilterNav(filter);

    // Navigate to page
    await navigateTo(page, filter);

    // Set up page nav clicks
    document.querySelectorAll('.page-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(link.dataset.page, currentFilter);
      });
    });

  } catch (error) {
    console.error('Error initializing:', error);
    appContainer.innerHTML = '<p class="error">Error loading data. Please try again later.</p>';
  }
}

// Handle back/forward navigation
window.addEventListener('popstate', () => {
  const { page, filter } = parseHash();
  navigateTo(page, filter);
});

// Listen for papers being marked as read (from viewport tracking)
window.addEventListener('paperread', (e) => {
  const paperId = e.detail.paperId;
  const paperElement = appContainer.querySelector(`.paper[data-id="${paperId}"]`);
  if (paperElement && !paperElement.classList.contains('paper-read')) {
    paperElement.classList.add('paper-read');

    // Add read badge
    const metaDiv = paperElement.querySelector('.paper-meta');
    if (metaDiv && !metaDiv.querySelector('.read-badge')) {
      const readBadge = document.createElement('span');
      readBadge.className = 'read-badge';
      readBadge.innerHTML = '<span class="read-badge-check">✓</span><span class="read-badge-x">×</span> Read';
      readBadge.dataset.paperId = paperId;

      // Add click handler to mark as unread
      readBadge.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        readTracker.markAsUnread(paperId);
        paperElement.classList.remove('paper-read');
        readBadge.remove();
      });

      metaDiv.appendChild(readBadge);
    }
  }
});

init();
