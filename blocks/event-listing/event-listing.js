import { getBasePathBasedOnEnv } from '../../scripts/utils.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/**
 * Same endpoint node and selector the Related Events block uses.
 *
 * The relatedevents payload already carries everything this listing needs -
 * title, category, month, day and the raw ISO dates - so no new servlet was
 * added. The one thing it cannot supply is the duration wording: the Sites
 * component said "Only on 27 Sep 2026" for a single day where Related Events
 * says "Starting from 27 Sep 2026", and joined a range with an en dash rather
 * than a hyphen. Two blocks, two phrasings, one shared servlet - so that string
 * is built here from startDate and endDate.
 */
const API_NODE = '/content/enablingguide-api';

/** The Sites model kept only the three soonest events. */
const MAX_EVENTS = 3;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const EN_DASH = '–';

/** Replaces /content/dam/pocsite/homepage/yellow-open-quote.png. */
const QUOTE_MARK = '<svg class="quote-img" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M9.6 5.2C6.5 6.6 4.5 9.6 4.5 13v5.8h6.2V13H7.4c0-2.3 1-4 2.9-5l-.7-2.8Zm9.3 0c-3.1 1.4-5.1 4.4-5.1 7.8v5.8h6.2V13h-3.3c0-2.3 1-4 2.9-5l-.7-2.8Z"/></svg>';

export function buildApiUrl(pagePath, { children = false } = {}) {
  const selectors = children ? 'relatedevents.children' : 'relatedevents';
  return `${getBasePathBasedOnEnv()}${API_NODE}.${selectors}.json${pagePath}`;
}

export async function fetchEvents(pagePath, options = {}) {
  try {
    const response = await fetch(buildApiUrl(pagePath, options));
    if (!response.ok) {
      throw new Error(`Related events request failed: ${response.status}`);
    }
    const body = await response.json();
    if (options.children) return body?.data?.items ?? [];
    const item = body?.data?.item;
    return item ? [item] : [];
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching events:', error);
    return [];
  }
}

/**
 * Reads the date from its integer parts.
 *
 * The servlet sends 2026-09-07T00:00:00Z, and new Date() on that yields UTC
 * midnight - which renders as the previous day anywhere west of Greenwich. The
 * calendar day is what matters here, so only the date part is parsed.
 */
function parseIsoDate(value) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  if (!parts) return null;
  return {
    year: Number(parts[1]),
    month: Number(parts[2]) - 1,
    day: Number(parts[3]),
  };
}

const dayMonth = (d) => `${d.day} ${MONTHS[d.month]}`;
const dayMonthYear = (d) => `${d.day} ${MONTHS[d.month]} ${d.year}`;

const isSameDay = (a, b) => a.year === b.year && a.month === b.month && a.day === b.day;

/**
 * "Only on 27 Sep 2026", or "Starting from 7 Sep - 28 Sep 2026" with an en
 * dash, dropping the year from the start when both ends share it. Explicit
 * month names rather than toLocaleDateString, which changes with the reader's
 * locale where the Sites model formatted with Locale.ENGLISH.
 */
export function formatDuration(startIso, endIso) {
  const start = parseIsoDate(startIso);
  if (!start) return '';

  const end = parseIsoDate(endIso);
  if (!end || isSameDay(start, end)) {
    return `Only on ${dayMonthYear(start)}`;
  }

  const startText = start.year === end.year ? dayMonth(start) : dayMonthYear(start);
  return `Starting from ${startText} ${EN_DASH} ${dayMonthYear(end)}`;
}

function buildEvent(item) {
  const row = document.createElement('li');
  row.className = 'event-item';

  const date = document.createElement('div');
  date.className = 'event-date';

  const month = document.createElement('div');
  month.className = 'month';
  month.textContent = item.month || '';

  const day = document.createElement('div');
  day.className = 'day';
  day.textContent = item.day || '';

  date.append(month, day);

  const info = document.createElement('div');
  info.className = 'event-info';

  if (item.category) {
    const badge = document.createElement('span');
    badge.className = 'event-badge';
    badge.textContent = item.category;
    info.append(badge);
  }

  const title = document.createElement('h4');
  title.textContent = item.title || '';
  info.append(title);

  const duration = formatDuration(item.startDate, item.endDate);
  if (duration) {
    const text = document.createElement('p');
    text.textContent = duration;
    info.append(text);
  }

  row.append(date, info);
  return row;
}

/** Builds the quote card from the block's first Quote Card item. */
function buildQuote(row) {
  const cells = [...row.children];

  const imageCell = cells.find((cell) => cell.querySelector('picture, img'));
  const textCells = cells.filter((cell) => cell !== imageCell);

  const left = document.createElement('div');
  left.className = 'join-left';

  const picture = imageCell ? imageCell.querySelector('picture, img') : null;
  const banner = document.createElement('div');
  banner.className = 'image-banner';
  if (picture) {
    const img = picture.tagName === 'IMG' ? picture : picture.querySelector('img');
    if (img) {
      // The Sites markup set this as a CSS background through a custom
      // property. Keeping it an <img> means it can carry alt text and be
      // lazy-loaded, and object-fit does the same job as background-size.
      if (!img.getAttribute('alt')) img.setAttribute('alt', '');
      banner.append(picture);
    }
  }

  const card = document.createElement('blockquote');
  card.className = 'join-quote';
  card.insertAdjacentHTML('afterbegin', QUOTE_MARK);

  // Rich text: the authored nodes move across so bold and links survive.
  const [quoteCell, nameCell, positionCell] = textCells;
  if (quoteCell) {
    const body = document.createElement('div');
    body.className = 'join-quote-text';
    while (quoteCell.firstChild) body.append(quoteCell.firstChild);
    card.append(body);
  }

  const name = nameCell ? (nameCell.textContent || '').trim() : '';
  const position = positionCell ? (positionCell.textContent || '').trim() : '';

  if (name || position) {
    card.append(document.createElement('hr'));
    const attribution = document.createElement('footer');
    if (name) {
      const strong = document.createElement('p');
      strong.innerHTML = '<strong></strong>';
      strong.firstChild.textContent = name;
      attribution.append(strong);
    }
    if (position) {
      const role = document.createElement('p');
      role.textContent = position;
      attribution.append(role);
    }
    card.append(attribution);
  }

  left.append(banner, card);
  return left;
}

/** The parent's own rows hold a single value; a Quote Card row holds several. */
function isQuoteRow(row) {
  return row.children.length > 1 || Boolean(row.querySelector('picture, img'));
}

function readOwnValue(row) {
  if (!row) return '';
  return ((row.firstElementChild || row).textContent || '').trim();
}

export default function decorate(block) {
  const rows = [...block.children];
  const quoteRow = rows.find(isQuoteRow);
  const ownRows = rows.filter((row) => !isQuoteRow(row));

  // Two own fields: the source path, then the mode.
  const pathRow = ownRows.find((row) => {
    const text = readOwnValue(row);
    return text.startsWith('/content/') || row.querySelector('a[href]');
  });
  const modeRow = ownRows.find((row) => {
    const text = readOwnValue(row).toLowerCase();
    return text === 'children' || text === 'page';
  });

  const anchor = pathRow ? pathRow.querySelector('a[href]') : null;
  const pagePath = anchor ? anchor.getAttribute('href') : readOwnValue(pathRow);
  const wantsChildren = readOwnValue(modeRow).toLowerCase() !== 'page';

  const section = document.createElement('section');
  section.className = 'join-in';

  const grid = document.createElement('div');
  grid.className = 'join-grid';

  if (quoteRow) {
    const left = buildQuote(quoteRow);
    moveInstrumentation(quoteRow, left);
    grid.append(left);
  }

  const right = document.createElement('div');
  right.className = 'join-right';
  const list = document.createElement('ul');
  list.className = 'event-list';
  right.append(list);
  grid.append(right);

  section.append(grid);
  block.replaceChildren(section);

  if (!pagePath) {
    if (block.hasAttribute('data-aue-resource')) {
      const placeholder = document.createElement('p');
      placeholder.className = 'event-listing-placeholder';
      placeholder.textContent = 'Event Listing: pick an events source page.';
      list.append(placeholder);
    }
    return;
  }

  fetchEvents(pagePath, { children: wantsChildren }).then((items) => {
    // The servlet already drops undated pages and sorts soonest first, which is
    // what the Sites model did in Java before trimming to three.
    const events = items.slice(0, MAX_EVENTS);

    if (!events.length) {
      if (block.hasAttribute('data-aue-resource')) {
        const placeholder = document.createElement('p');
        placeholder.className = 'event-listing-placeholder';
        placeholder.textContent = 'Event Listing: no dated events under that page.';
        list.append(placeholder);
      }
      return;
    }

    list.append(...events.map(buildEvent));
  });
}
