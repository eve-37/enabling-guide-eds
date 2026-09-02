import { getBasePathBasedOnEnv } from '../../scripts/utils.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/**
 * Resource-type-bound endpoint node. Uses the archetype appId (enablingguide),
 * NOT the site name (enabling-guide-eds).
 *
 * This block deliberately reuses the relatedarticles selector rather than
 * adding one of its own: StoriesListingModel needed title, subtitle,
 * description, image, path and word count, which is exactly what that endpoint
 * already returns. The featured/rest split and the four-item cap below are
 * layout, not data, so they live here.
 *
 * If you rename this block, the folder and both filenames must match the
 * slugified "name" in _stories-listing.json - not its "id". EDS derives the
 * block class and asset path from the name stored on the node, so a mismatch
 * 404s silently and the block renders as raw stacked rows.
 */
const API_NODE = '/content/enablingguide-api';

/** One featured story plus three beside it, as the Sites model's MAX_STORIES did. */
const MAX_STORIES = 4;
const EXCERPT_LIMIT = 150;
const FALLBACK_SUBTITLE = 'Stories';

/* -------------------------------------------------------------------------- */
/* Data                                                                       */
/* -------------------------------------------------------------------------- */

export function buildApiUrl(pagePath, { children = false } = {}) {
  const selectors = children ? 'relatedarticles.children' : 'relatedarticles';
  return `${getBasePathBasedOnEnv()}${API_NODE}.${selectors}.json${pagePath}`;
}

/**
 * Always resolves to an array so the caller has one shape to render.
 *
 * No custom request headers on purpose. A plain GET is a CORS-simple request,
 * so no OPTIONS preflight fires and the dispatcher only has to allow GET.
 */
export async function fetchStories(pagePath, options = {}) {
  try {
    const response = await fetch(buildApiUrl(pagePath, options));
    if (!response.ok) {
      throw new Error(`Stories request failed: ${response.status}`);
    }
    const body = await response.json();
    if (options.children) {
      return body?.data?.items ?? [];
    }
    const item = body?.data?.item;
    return item ? [item] : [];
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching stories:', error);
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Reading the authored rows                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The aem-content field can land in the DOM as an anchor or as the raw path in
 * a text node, so both are handled. A DAM path here means the row reading is
 * off, not that the author picked an image as a page.
 */
function readAuthoredPath(cell) {
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
  if (!path.startsWith('/content/') || path.startsWith('/content/dam/')) return null;
  return path;
}

function cellOf(row) {
  return row?.querySelector(':scope > div') || row;
}

const MODES = ['children', 'page', 'selection'];

/**
 * Splits the block's rows into the parent's own fields and its child items.
 *
 * The mode select is the last field on the parent model, and a container
 * block's child items are always appended after the parent's property rows.
 * So the mode row is the boundary: a page path before it is the source page, a
 * page path after it is a selected story.
 *
 * Anchoring on the mode row rather than counting rows matters because row count
 * is not reliably field count - AEM folds an "<image>Alt" field into the alt
 * attribute of the image it names, and this way the reading survives that.
 */
function readRows(block) {
  const rows = [...block.children];
  const modeIndex = rows.findIndex((row) => MODES.includes(
    (cellOf(row).textContent || '').trim().toLowerCase(),
  ));

  const before = modeIndex === -1 ? rows : rows.slice(0, modeIndex);
  const after = modeIndex === -1 ? [] : rows.slice(modeIndex + 1);

  return {
    modeRow: modeIndex === -1 ? null : rows[modeIndex],
    pathRow: before.find((row) => readAuthoredPath(cellOf(row))) || null,
    // The row is kept alongside the path: each child item carries its own
    // data-aue-resource, and that has to be moved onto the card that replaces
    // it or the Universal Editor loses the item entirely.
    items: after
      .map((row) => ({ row, path: readAuthoredPath(cellOf(row)) }))
      .filter((entry) => entry.path),
  };
}

/* -------------------------------------------------------------------------- */
/* Current-page exclusion                                                     */
/* -------------------------------------------------------------------------- */

function normalisePath(path) {
  if (!path) return '';
  let value = path.replace(/\.html$/, '');
  if (value.length > 1) value = value.replace(/\/$/, '');
  return value;
}

/**
 * The servlet response is cached by path and selector and has no idea which
 * page is asking, so a listing placed on one of its own stories has to drop
 * that story here.
 */
function withoutCurrentPage(items) {
  const here = normalisePath(window.location.pathname);
  const seen = new Set();
  return items.filter((item) => {
    if (!item) return false;
    const path = normalisePath(item.path);
    if (!path) return true;
    if (path === here || seen.has(path)) return false;
    seen.add(path);
    return true;
  });
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

function truncate(text, limit) {
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

/**
 * DAM images are served by AEM, not the EDS media bus, so createOptimizedPicture
 * must not be used - AEM ignores the ?width=&format=webply query it appends and
 * you get an unoptimised original behind a srcset that claims otherwise.
 */
function createImage(item, width, height) {
  const img = document.createElement('img');
  img.src = `${getBasePathBasedOnEnv()}${item.image}`;
  img.alt = '';
  img.width = width;
  img.height = height;
  img.loading = 'lazy';
  return img;
}

/** The shared text column: tag, linked title, excerpt, word count. */
function createBody(item, className) {
  const body = el('div', className);

  // The subtitle property or the literal fallback, matching StoriesListingModel.
  // Deliberately NOT item.category: the servlet sets that to the parent page's
  // title, so a listing under /index would tag every card "Index".
  body.appendChild(el('div', 'story-tag', item.subTitle || FALLBACK_SUBTITLE));

  const heading = el('h3');
  const link = el('a', null, item.title || '');
  link.href = item.path || '#';
  heading.appendChild(link);
  body.appendChild(heading);

  if (item.description) {
    body.appendChild(el('p', null, truncate(item.description, EXCERPT_LIMIT)));
  }

  if (item.wordCount) {
    const words = el('div', 'story-words');
    words.appendChild(el('strong', null, String(item.wordCount)));
    words.appendChild(document.createTextNode(' words'));
    body.appendChild(words);
  }

  return body;
}

function createStoryCard(item) {
  const card = el('div', 'story-card');
  if (item.image) card.appendChild(createImage(item, 220, 150));
  card.appendChild(createBody(item, 'story-meta'));
  return card;
}

function createFeatured(item) {
  const featured = el('div', 'story-featured');
  if (item.image) featured.appendChild(createImage(item, 480, 420));
  featured.appendChild(createBody(item, 'story-featured-body'));
  return featured;
}

/**
 * A block that renders nothing cannot be clicked in the Universal Editor, so an
 * author has no way back into the dialog to fix it. Show a placeholder while
 * editing; render nothing at all on the published site.
 */
function renderEmpty(block, message) {
  if (block.hasAttribute('data-aue-resource')) {
    // In the editor the authored rows are left in place. Emptying the block
    // would destroy the child items' instrumentation, and the author would
    // watch their Story items vanish from the content tree a second after the
    // page loads.
    block.classList.add('stories-listing-placeholder');
    block.appendChild(el('p', 'stories-placeholder-text', message));
  } else {
    block.textContent = '';
    block.classList.add('stories-listing-empty');
  }
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

export default async function decorate(block) {
  const { pathRow, modeRow, items: authoredItems } = readRows(block);

  const pagePath = readAuthoredPath(cellOf(pathRow));
  const mode = (modeRow?.textContent || '').trim().toLowerCase();
  const itemPaths = authoredItems.map((entry) => entry.path);
  // Lets each rendered card reclaim the instrumentation of the row it came from.
  const rowForPath = new Map(authoredItems.map((entry) => [entry.path, entry.row]));

  if (mode === 'selection' && !itemPaths.length) {
    // An item with no page picked contributes no row, so "add a Story" would be
    // wrong advice for the common case of empty items already sitting there.
    renderEmpty(block, 'Stories Listing: add a Story item and pick a page for each one.');
    return;
  }

  if (mode !== 'selection' && !pagePath) {
    renderEmpty(block, 'Stories Listing: pick a source page.');
    return;
  }

  const fetched = mode === 'selection'
    // One cached request per story, in parallel, kept in authored order.
    ? (await Promise.all(itemPaths.map((path) => fetchStories(path)))).flat()
    : await fetchStories(pagePath, { children: mode !== 'page' });

  const available = withoutCurrentPage(fetched);

  if (!available.length) {
    renderEmpty(block, 'Stories Listing: nothing to show for the selected page.');
    return;
  }

  // The layout holds exactly one featured story and three beside it.
  const items = available.slice(0, MAX_STORIES);
  const [featured, ...rest] = items;

  /**
   * Carries a selected item's data-aue-resource onto the card built from it.
   * Without this the child items are destroyed when the block is rebuilt: the
   * author sees them disappear from the content tree, and the block stops
   * offering to add more.
   */
  const reinstrument = (item, element) => {
    const row = rowForPath.get(item.aemPath) || rowForPath.get(item.path);
    if (row) moveInstrumentation(row, element);
  };

  const section = el('div', 'stories');
  const grid = el('div', 'stories-grid');

  if (rest.length) {
    const left = el('div', 'stories-left');
    rest.forEach((item) => {
      const card = createStoryCard(item);
      reinstrument(item, card);
      left.appendChild(card);
    });
    grid.appendChild(left);
  }

  const featuredCard = createFeatured(featured);
  reinstrument(featured, featuredCard);
  grid.appendChild(featuredCard);
  section.appendChild(grid);

  // In the other modes there are no child items, so the source page field is
  // what the author needs to reach from the rendered markup.
  if (mode !== 'selection' && pathRow) moveInstrumentation(cellOf(pathRow), featuredCard);

  block.textContent = '';
  block.appendChild(section);

  // The Sites model raised tooManyItems for authors who configured more than
  // four. The equivalent warning belongs in the editor only - on the published
  // page the extra stories are simply not part of this layout.
  if (available.length > MAX_STORIES && block.hasAttribute('data-aue-resource')) {
    block.appendChild(el(
      'p',
      'stories-listing-note',
      `Showing ${MAX_STORIES} of ${available.length} stories. This layout holds one featured story and three beside it.`,
    ));
  }
}
