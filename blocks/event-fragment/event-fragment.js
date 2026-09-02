import { getBasePathBasedOnEnv } from '../../scripts/utils.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/**
 * Resource-type-bound endpoint node. Uses the archetype appId (enablingguide),
 * NOT the site name (enabling-guide-eds).
 *
 * This is the event DETAIL block, the migration of the AEM Sites
 * EventFragmentModel. It renders one Content Fragment in full: rich-text
 * sections down the left, an info card down the right. Related Events is the
 * separate listing block that links to pages carrying this one.
 *
 * If you rename this block, the folder and both filenames must match the
 * slugified "name" in _event-fragment.json - not its "id". EDS derives the block
 * class and asset path from the name stored on the node, so a mismatch 404s
 * silently and the block renders as raw stacked rows.
 */
const API_NODE = '/content/enablingguide-api';

/**
 * The "Supported By" logo. The 6.5 component hardcoded a single Enabling Academy
 * logo here and ignored the fragment's own supportedBy field, and that behaviour
 * is kept deliberately - so this constant is the one place to change it.
 *
 * Set to '' to drop the section entirely. The asset must exist at this path in
 * the DAM, or the section renders a broken image.
 */
const SUPPORTED_BY_LOGO = '/content/dam/enabling-guide-eds/enabling-academy-logo.png';
const SUPPORTED_BY_ALT = 'Enabling Academy';

/**
 * The left column, in the order the HTL rendered it. `list: true` marks the
 * fields the Content Fragment Model authors as a multicheckbox, which arrive as
 * arrays rather than rich text.
 */
const SECTIONS = [
  { key: 'description', heading: 'Description' },
  { key: 'learningGoals', heading: 'Learning Goals' },
  { key: 'prerequisites', heading: 'Prerequisites' },
  { key: 'modeOfDelivery', heading: 'Mode of Delivery', list: true },
  { key: 'targetAudience', heading: 'Target Audience' },
  { key: 'feesAndSubsidies', heading: 'Fees and Subsidies' },
  { key: 'additionalInformation', heading: 'Additional Information' },
];

/* -------------------------------------------------------------------------- */
/* Icons                                                                      */
/* -------------------------------------------------------------------------- */

/*
 * The 6.5 component pulled these two from the DAM as <img alt="">. They are
 * purely decorative, so they are inlined here instead: two fewer requests, two
 * fewer DAM dependencies to remap, and they take the surrounding text colour.
 */
const ICONS = {
  location: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" fill="currentColor"/></svg>',
  contact: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 4h16v16H4z" fill="none"/><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4.4-8 5-8-5V6l8 5 8-5z" fill="currentColor"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M10.6 13.4a1 1 0 0 1 0-1.4l3-3a1 1 0 0 1 1.4 1.4l-3 3a1 1 0 0 1-1.4 0zm-1.9 4.3-1.4 1.4a3.5 3.5 0 0 1-5-5l3.6-3.5a3.5 3.5 0 0 1 5 0l-1.5 1.4a1.5 1.5 0 0 0-2.1 0L5.8 15.5a1.5 1.5 0 0 0 2.1 2.1zm6.6-11.4 1.4-1.4a3.5 3.5 0 0 1 5 5l-3.6 3.5a3.5 3.5 0 0 1-5 0l1.5-1.4a1.5 1.5 0 0 0 2.1 0l3.5-3.5a1.5 1.5 0 0 0-2.1-2.1z" fill="currentColor"/></svg>',
};

/* -------------------------------------------------------------------------- */
/* Reading the authored row                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The aem-content field can land in the DOM as an anchor or as the raw path in a
 * text node, so both are handled.
 *
 * Note the inversion from the listing blocks: they REJECT /content/dam paths,
 * because a DAM value there means the row reading is off. Here a DAM path is
 * exactly what is expected - the field points at a Content Fragment.
 */
function readFragmentPath(cell) {
  if (!cell) return null;

  const link = cell.querySelector('a[href]');
  const raw = link ? link.getAttribute('href') : cell.textContent;
  if (!raw || !raw.trim()) return null;

  let path = raw.trim();

  if (path.startsWith('http')) {
    try {
      path = new URL(path).pathname;
    } catch {
      return null;
    }
  }

  path = path.replace(/\.html$/, '');
  return path.startsWith('/content/') ? path : null;
}

function cellOf(row) {
  return row?.querySelector(':scope > div') || row;
}

/* -------------------------------------------------------------------------- */
/* Data                                                                       */
/* -------------------------------------------------------------------------- */

export function buildApiUrl(path) {
  return `${getBasePathBasedOnEnv()}${API_NODE}.eventfragment.json${path}`;
}

/**
 * No custom request headers on purpose. A plain GET is a CORS-simple request, so
 * no OPTIONS preflight fires and the dispatcher only has to allow GET.
 */
export async function fetchEvent(path) {
  try {
    const response = await fetch(buildApiUrl(path));
    if (!response.ok) {
      throw new Error(`Event fragment request failed: ${response.status}`);
    }
    const body = await response.json();
    return body?.data?.item ?? null;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching event fragment:', error);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function iconSpan(name) {
  const span = el('span', 'event-icon');
  span.innerHTML = ICONS[name];
  return span;
}

/** Renders an array of authored values as one line each. */
function valueList(values) {
  const wrap = el('p');
  values.forEach((value) => wrap.appendChild(el('span', 'event-list-item', value)));
  return wrap;
}

/**
 * One left-column section. Rich text is injected as markup, matching the HTL's
 * `@ context='html'` - the values are authored in AEM and carry the same trust
 * as any other content this site renders.
 */
function createSection({ key, heading, list }, item) {
  const value = item[key];
  const hasValue = list ? Array.isArray(value) && value.length : Boolean(value);
  if (!hasValue) return null;

  const section = el('section', 'event-section');
  section.appendChild(el('h2', 'event-section-heading', heading));

  const body = el('div', 'event-section-body');
  if (list) {
    body.appendChild(valueList(value));
  } else {
    body.innerHTML = value;
  }
  section.appendChild(body);
  return section;
}

function createSupportedBy() {
  if (!SUPPORTED_BY_LOGO) return null;

  const section = el('section', 'event-section');
  section.appendChild(el('h2', 'event-section-heading', 'Supported By'));

  const logos = el('div', 'event-logos');
  const img = document.createElement('img');
  img.className = 'event-logo';
  // A DAM asset, so it is served by AEM rather than the EDS media bus -
  // createOptimizedPicture would append parameters AEM ignores.
  img.src = `${getBasePathBasedOnEnv()}${SUPPORTED_BY_LOGO}`;
  img.alt = SUPPORTED_BY_ALT;
  img.loading = 'lazy';
  logos.appendChild(img);

  section.appendChild(logos);
  return section;
}

/** One row of the right-hand info card: a bold label above its value nodes. */
function createInfoRow(label, ...valueNodes) {
  const present = valueNodes.filter(Boolean);
  if (!present.length) return null;

  const row = el('div', 'event-info-row');
  row.appendChild(el('p', 'event-info-label', label));
  present.forEach((node) => row.appendChild(node));
  return row;
}

/** A value line prefixed with a decorative icon. */
function iconLine(name, ...children) {
  const line = el('p', 'event-info-value event-info-value-icon');
  line.appendChild(iconSpan(name));
  const wrap = el('span');
  children.filter(Boolean).forEach((child) => wrap.appendChild(child));
  line.appendChild(wrap);
  return line;
}

function createDateRow(item) {
  if (!item.dateRange) return null;

  const value = el('p');
  value.appendChild(el('span', 'event-date-range', item.dateRange));
  if (item.dateWeekdays) {
    value.appendChild(el('span', 'event-date-weekdays', item.dateWeekdays));
  }
  return createInfoRow('Date', value);
}

function createVenueRow(item) {
  if (!item.venue && !item.address) return null;

  const parts = [];
  if (item.venue) parts.push(el('span', null, item.venue));
  if (item.address) parts.push(el('span', 'event-venue-address', item.address));

  return createInfoRow('Event Venue', iconLine('location', ...parts));
}

function createContactRow(item) {
  if (!item.contact && !item.url) return null;

  const row = el('div', 'event-info-row');
  row.appendChild(el('p', 'event-info-label', 'Contact Information'));

  if (item.contact) {
    row.appendChild(iconLine('contact', el('span', null, item.contact)));
  }
  if (item.url) {
    const link = el('a', 'event-contact-line', item.url);
    link.href = item.url;
    link.rel = 'noopener';
    link.target = '_blank';
    row.appendChild(iconLine('link', link));
  }
  return row;
}

function createInfoCard(item) {
  const aside = el('aside', 'event-info');
  aside.setAttribute('aria-label', 'Event information');

  const list = el('div', 'event-info-list');
  const rows = [
    createDateRow(item),
    item.timeRange ? createInfoRow('Time', el('p', null, item.timeRange)) : null,
    createVenueRow(item),
    item.region?.length ? createInfoRow('Event Region', valueList(item.region)) : null,
    createContactRow(item),
    item.suitableConditions?.length
      ? createInfoRow('Suitable for the following condition(s)', valueList(item.suitableConditions))
      : null,
    item.ageProfile?.length
      ? createInfoRow('Age profile of participants', valueList(item.ageProfile))
      : null,
    item.cost ? createInfoRow('Cost', el('p', null, item.cost)) : null,
  ].filter(Boolean);

  if (!rows.length) return null;

  rows.forEach((row) => list.appendChild(row));
  aside.appendChild(list);
  return aside;
}

function createArticle(item) {
  const article = el('article', 'event');

  const header = el('header', 'event-header');
  if (item.categoryLabel) {
    header.appendChild(el('p', 'event-category', item.categoryLabel));
  }
  header.appendChild(el('h1', 'event-title', item.title || ''));
  article.appendChild(header);

  const body = el('div', 'event-body');

  const main = el('div', 'event-main');
  SECTIONS.forEach((definition) => {
    const section = createSection(definition, item);
    if (section) main.appendChild(section);
  });
  const supportedBy = createSupportedBy();
  if (supportedBy) main.appendChild(supportedBy);
  body.appendChild(main);

  const info = createInfoCard(item);
  if (info) {
    body.appendChild(info);
  } else {
    // Nothing in the right-hand card, so let the prose use the full width
    // instead of leaving a column of empty space.
    body.classList.add('event-body-single');
  }

  article.appendChild(body);
  return article;
}

/**
 * A block that renders nothing cannot be clicked in the Universal Editor, so an
 * author has no way back into the dialog to fix it. Show a placeholder while
 * editing; render nothing at all on the published site.
 */
function renderEmpty(block, message) {
  if (block.hasAttribute('data-aue-resource')) {
    block.textContent = '';
    block.classList.add('event-fragment-placeholder');
    block.appendChild(el('p', 'event-placeholder-text', message));
  } else {
    block.textContent = '';
    block.classList.add('event-fragment-empty');
  }
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

export default async function decorate(block) {
  const pathRow = [...block.children].find((row) => readFragmentPath(cellOf(row))) || null;
  // Falling back to the page's own path lets the servlet resolve the fragment
  // from the page's fragmentPath property, so an author who set it in page
  // properties does not have to pick it a second time here.
  const authored = readFragmentPath(cellOf(pathRow));
  const lookupPath = authored || window.location.pathname;

  const item = await fetchEvent(lookupPath);

  // The Sites model gated rendering on a non-blank title via isReady().
  if (!item || !item.title) {
    renderEmpty(block, authored
      ? 'Event Fragment: nothing to show for the selected Content Fragment.'
      : 'Event Fragment: pick a Content Fragment, or set one in this page\'s properties.');
    return;
  }

  const article = createArticle(item);

  block.textContent = '';
  block.appendChild(article);

  // Lets the author click through the rendered event back to the field.
  if (pathRow) moveInstrumentation(cellOf(pathRow), article);
}
