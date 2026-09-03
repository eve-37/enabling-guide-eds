import { moveInstrumentation } from '../../scripts/scripts.js';

/**
 * Explicit month names rather than toLocaleDateString, which varies with the
 * viewer's locale. The Sites model formatted with Locale.ENGLISH, so every
 * reader saw the same string regardless of where they were.
 */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Parses the authored value from its integer parts.
 *
 * Never new Date('2026-09-03') - that parses as UTC midnight, so anywhere west
 * of Greenwich it renders as the previous day.
 */
function parseDateValue(value) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec((value || '').trim());
  if (!parts) return null;
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
}

/** SimpleDateFormat("MMMM dd, yyyy") - full month, zero-padded day. */
function formatDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  return `${MONTHS[date.getMonth()]} ${day}, ${date.getFullYear()}`;
}

/**
 * The same definition of a word WordCountUtil uses on the AEM side: strip
 * everything that is not alphanumeric or whitespace, then split on whitespace.
 * Keeping one definition matters - the related-articles cards show a count for
 * the same pages, and two rules would disagree with each other.
 */
function countWords(text) {
  const cleaned = text.replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
  return cleaned ? cleaned.split(/\s+/).length : 0;
}

/**
 * Walks the page's text, skipping this block so the counter never counts its
 * own output. Scoped to main, which leaves out the nav and footer.
 */
function countPageWords(main, skip) {
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (skip.contains(node.parentNode)
      ? NodeFilter.FILTER_REJECT
      : NodeFilter.FILTER_ACCEPT),
  });

  let text = '';
  while (walker.nextNode()) {
    text += ` ${walker.currentNode.nodeValue}`;
  }
  return countWords(text);
}

function sectionsLoaded(main) {
  return [...main.querySelectorAll(':scope > .section')]
    .every((section) => section.dataset.sectionStatus === 'loaded');
}

export default function decorate(block) {
  const row = block.children[0];
  const cell = row ? row.firstElementChild || row : null;

  // The Sites model fell back to Calendar.getInstance() when the property was
  // unset, so an unauthored block showed today. Kept deliberately.
  const date = parseDateValue(cell ? cell.textContent : '') || new Date();

  const meta = document.createElement('div');
  meta.className = 'article-meta';

  const dateEl = document.createElement('span');
  dateEl.className = 'article-date';
  dateEl.textContent = formatDate(date);

  const wordsEl = document.createElement('span');
  wordsEl.className = 'article-words';
  const count = document.createElement('strong');
  wordsEl.append(count, ' words');

  meta.append(dateEl, wordsEl);

  // Carries data-aue-* onto the rendered date so the author can click it to
  // reopen the field, rather than losing the block's only editable target.
  if (cell) moveInstrumentation(cell, dateEl);

  block.textContent = '';
  block.append(meta);

  const main = block.closest('main');
  if (!main) return;

  const update = () => {
    count.textContent = countPageWords(main, block);
  };
  update();

  // loadEager loads the first section only; loadLazy loads the rest afterwards.
  // A block in the first section that counted once would miss every later
  // section and silently report a number that is too low.
  if (!sectionsLoaded(main)) {
    const observer = new MutationObserver(() => {
      update();
      if (sectionsLoaded(main)) observer.disconnect();
    });
    observer.observe(main, {
      attributes: true,
      attributeFilter: ['data-section-status'],
      subtree: true,
    });
  }
}
