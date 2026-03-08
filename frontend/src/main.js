const papersContainer = document.getElementById('papers');
const monthNav = document.getElementById('month-nav');

let currentMonth = null;

async function fetchIndex() {
  const response = await fetch('/data/index.json');
  return response.json();
}

async function fetchMonth(month) {
  const response = await fetch(`/data/${month}.json`);
  return response.json();
}

function formatMonth(monthStr) {
  // Convert "2603" to "March 2026"
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

function renderPaper(paper) {
  const article = document.createElement('article');
  article.className = 'paper';

  const categories = paper.categories.join(', ');
  const authors = paper.authors.join(', ');

  article.innerHTML = `
    <h2 class="paper-title">${paper.title}</h2>
    <p class="paper-authors">${authors}</p>
    <p class="paper-meta">
      <span class="paper-categories">${categories}</span>
      <span class="paper-date">${formatDate(paper.published)}</span>
    </p>
    <div class="paper-abstract">${paper.abstract}</div>
    <p class="paper-reasoning"><em>${paper.reasoning}</em></p>
    <div class="paper-tags">
      ${paper.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
    </div>
    <div class="paper-links">
      <a href="${paper.arxivUrl}" target="_blank" rel="noopener">arXiv Abstract</a>
      <a href="${paper.pdfUrl}" target="_blank" rel="noopener">PDF</a>
    </div>
  `;

  return article;
}

async function renderPapers(month) {
  currentMonth = month;

  // Update nav active state
  document.querySelectorAll('.month-link').forEach(link => {
    link.classList.toggle('active', link.dataset.month === month);
  });

  papersContainer.innerHTML = '<p class="loading">Loading papers...</p>';

  try {
    const papers = await fetchMonth(month);

    papersContainer.innerHTML = '';

    if (papers.length === 0) {
      papersContainer.innerHTML = '<p class="empty">No accessible papers this month.</p>';
      return;
    }

    // Sort by date, newest first
    papers.sort((a, b) => new Date(b.published) - new Date(a.published));

    const heading = document.createElement('h2');
    heading.className = 'month-heading';
    heading.textContent = `${formatMonth(month)} (${papers.length} papers)`;
    papersContainer.appendChild(heading);

    for (const paper of papers) {
      papersContainer.appendChild(renderPaper(paper));
    }

    // Trigger MathJax to process the new content
    if (window.MathJax && window.MathJax.typesetPromise) {
      await window.MathJax.typesetPromise([papersContainer]);
    }
  } catch (error) {
    console.error('Error loading papers:', error);
    papersContainer.innerHTML = '<p class="error">Error loading papers.</p>';
  }
}

function renderMonthNav(months) {
  // Sort months in reverse order (newest first)
  const sortedMonths = [...months].sort().reverse();

  monthNav.innerHTML = sortedMonths.map(month => `
    <a href="#${month}" class="month-link" data-month="${month}">
      ${formatMonth(month)}
    </a>
  `).join('');

  // Add click handlers
  monthNav.querySelectorAll('.month-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      renderPapers(link.dataset.month);
      history.pushState(null, '', `#${link.dataset.month}`);
    });
  });
}

async function init() {
  try {
    const index = await fetchIndex();

    if (index.months.length === 0) {
      papersContainer.innerHTML = '<p class="empty">No papers available yet.</p>';
      return;
    }

    renderMonthNav(index.months);

    // Check URL hash for month, otherwise use most recent
    const hash = window.location.hash.slice(1);
    const initialMonth = index.months.includes(hash)
      ? hash
      : index.months.sort().reverse()[0];

    renderPapers(initialMonth);
  } catch (error) {
    console.error('Error initializing:', error);
    papersContainer.innerHTML = '<p class="error">Error loading data. Please try again later.</p>';
  }
}

// Handle back/forward navigation
window.addEventListener('popstate', () => {
  const hash = window.location.hash.slice(1);
  if (hash && hash !== currentMonth) {
    renderPapers(hash);
  }
});

init();
