import { embeddingStore } from './EmbeddingStore.js';
import { preferenceModel } from './PreferenceModel.js';
import { pairSelector } from './PairSelector.js';

const appContainer = document.getElementById('app');
const monthNav = document.getElementById('month-nav');

// Global state
let currentPage = 'accessible';
let currentMonth = null;
let allPapers = []; // Papers for current month
let indexData = null;

// ============================================================================
// Data Loading
// ============================================================================

async function fetchIndex() {
  const response = await fetch('/data/index.json');
  return response.json();
}

async function fetchMonth(month) {
  const response = await fetch(`/data/${month}.json`);
  return response.json();
}

async function loadMonthData(month) {
  if (currentMonth === month && allPapers.length > 0) {
    return allPapers;
  }

  currentMonth = month;
  allPapers = await fetchMonth(month);

  // Load embeddings for this month
  await embeddingStore.loadMonth(month, allPapers);

  return allPapers;
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

// ============================================================================
// Paper Rendering
// ============================================================================

function renderPaperCard(paper, options = {}) {
  const { compact = false, showScore = false, score = null, showReasoning = true } = options;

  const article = document.createElement('article');
  article.className = 'paper' + (compact ? ' paper-compact' : '');
  article.dataset.id = paper.id;

  const categories = paper.categories.join(', ');
  const authors = paper.authors.join(', ');

  let scoreHtml = '';
  if (showScore && score !== null) {
    const scorePercent = Math.round((1 / (1 + Math.exp(-score))) * 100);
    scoreHtml = `<span class="paper-score" title="Model confidence">${scorePercent}%</span>`;
  }

  let reasoningHtml = '';
  if (!compact && showReasoning && paper.reasoning) {
    reasoningHtml = `<p class="paper-reasoning"><em>${paper.reasoning}</em></p>`;
  }

  let tagsHtml = '';
  if (paper.tags && paper.tags.length > 0) {
    tagsHtml = `
      <div class="paper-tags">
        ${paper.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
      </div>
    `;
  }

  article.innerHTML = `
    <h2 class="paper-title">${scoreHtml}${paper.title}</h2>
    <p class="paper-authors">${authors}</p>
    <p class="paper-meta">
      <span class="paper-categories">${categories}</span>
      <span class="paper-date">${formatDate(paper.published)}</span>
    </p>
    <div class="paper-abstract">${paper.abstract}</div>
    ${reasoningHtml}
    ${tagsHtml}
    <div class="paper-links">
      <a href="${paper.arxivUrl}" target="_blank" rel="noopener">arXiv Abstract</a>
      <a href="${paper.pdfUrl}" target="_blank" rel="noopener">PDF</a>
    </div>
  `;

  return article;
}

function renderComparisonCard(paper) {
  const article = document.createElement('article');
  article.className = 'comparison-card';
  article.dataset.id = paper.id;

  const categories = paper.categories.slice(0, 3).join(', ');
  const authors = paper.authors.slice(0, 3).join(', ') +
    (paper.authors.length > 3 ? ', et al.' : '');

  // Truncate abstract for comparison view
  const abstractPreview = paper.abstract.length > 400
    ? paper.abstract.slice(0, 400) + '...'
    : paper.abstract;

  article.innerHTML = `
    <h3 class="card-title">${paper.title}</h3>
    <p class="card-authors">${authors}</p>
    <p class="card-categories">${categories}</p>
    <div class="card-abstract">${abstractPreview}</div>
    ${paper.tags && paper.tags.length > 0 ? `
      <div class="card-tags">
        ${paper.tags.slice(0, 3).map(tag => `<span class="tag">${tag}</span>`).join('')}
      </div>
    ` : ''}
  `;

  return article;
}

// ============================================================================
// Page: Accessible (Curated)
// ============================================================================

async function renderAccessiblePage(month) {
  const papers = await loadMonthData(month);

  // Filter to accessible papers only
  const accessiblePapers = papers.filter(p => p.accessible === true);

  // Sort by date, newest first
  accessiblePapers.sort((a, b) => new Date(b.published) - new Date(a.published));

  appContainer.innerHTML = '';

  if (accessiblePapers.length === 0) {
    appContainer.innerHTML = '<p class="empty">No accessible papers this month.</p>';
    return;
  }

  const heading = document.createElement('h2');
  heading.className = 'month-heading';
  heading.textContent = `${formatMonth(month)} (${accessiblePapers.length} curated papers)`;
  appContainer.appendChild(heading);

  for (const paper of accessiblePapers) {
    appContainer.appendChild(renderPaperCard(paper));
  }

  await typeset();
}

// ============================================================================
// Page: Ranked (For You)
// ============================================================================

async function renderRankedPage(month) {
  const papers = await loadMonthData(month);

  appContainer.innerHTML = '';

  const headerDiv = document.createElement('div');
  headerDiv.className = 'ranked-header';

  const compCount = preferenceModel.comparisonCount;

  if (compCount === 0) {
    headerDiv.innerHTML = `
      <h2 class="month-heading">${formatMonth(month)}</h2>
      <p class="ranked-info">
        No preferences recorded yet.
        <a href="#train">Train your model</a> to get personalized rankings.
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
      <h2 class="month-heading">${formatMonth(month)} - Ranked For You</h2>
      <p class="ranked-info">
        Based on ${compCount} comparison${compCount !== 1 ? 's' : ''}.
        <a href="#train">Continue training</a> to improve.
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

async function renderTrainPage(month) {
  await loadMonthData(month);

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
      <a href="#ranked" class="btn btn-primary">View Rankings</a>
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
    renderTrainPage(currentMonth);
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

// ============================================================================
// Navigation
// ============================================================================

function renderMonthNav(months) {
  const sortedMonths = [...months].sort().reverse();

  monthNav.innerHTML = sortedMonths.map(month => `
    <a href="#${currentPage}/${month}" class="month-link" data-month="${month}">
      ${formatMonth(month)}
    </a>
  `).join('');

  monthNav.querySelectorAll('.month-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const month = link.dataset.month;
      navigateTo(currentPage, month);
    });
  });
}

function updateActiveNav(page, month) {
  // Update page nav
  document.querySelectorAll('.page-link').forEach(link => {
    link.classList.toggle('active', link.dataset.page === page);
  });

  // Update month nav
  document.querySelectorAll('.month-link').forEach(link => {
    link.classList.toggle('active', link.dataset.month === month);
    // Update href to maintain current page
    link.href = `#${page}/${link.dataset.month}`;
  });
}

async function navigateTo(page, month) {
  currentPage = page;

  // Update URL
  history.pushState(null, '', `#${page}/${month}`);

  updateActiveNav(page, month);

  appContainer.innerHTML = '<p class="loading">Loading...</p>';

  try {
    switch (page) {
      case 'accessible':
        await renderAccessiblePage(month);
        break;
      case 'ranked':
        await renderRankedPage(month);
        break;
      case 'train':
        await renderTrainPage(month);
        break;
      default:
        await renderAccessiblePage(month);
    }
  } catch (error) {
    console.error('Error rendering page:', error);
    appContainer.innerHTML = '<p class="error">Error loading content.</p>';
  }
}

function parseHash() {
  const hash = window.location.hash.slice(1);
  const parts = hash.split('/');

  let page = parts[0] || 'accessible';
  let month = parts[1] || null;

  // Validate page
  if (!['accessible', 'ranked', 'train'].includes(page)) {
    page = 'accessible';
  }

  return { page, month };
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
    // Load saved model
    preferenceModel.load();

    // Fetch index
    indexData = await fetchIndex();

    if (indexData.months.length === 0) {
      appContainer.innerHTML = '<p class="empty">No papers available yet.</p>';
      return;
    }

    // Render month nav
    renderMonthNav(indexData.months);

    // Parse URL and navigate
    const { page, month } = parseHash();
    const targetMonth = month && indexData.months.includes(month)
      ? month
      : indexData.months.sort().reverse()[0];

    await navigateTo(page, targetMonth);

    // Set up page nav clicks
    document.querySelectorAll('.page-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(link.dataset.page, currentMonth);
      });
    });

  } catch (error) {
    console.error('Error initializing:', error);
    appContainer.innerHTML = '<p class="error">Error loading data. Please try again later.</p>';
  }
}

// Handle back/forward navigation
window.addEventListener('popstate', () => {
  const { page, month } = parseHash();
  const targetMonth = month && indexData?.months.includes(month)
    ? month
    : currentMonth;
  navigateTo(page, targetMonth);
});

init();
