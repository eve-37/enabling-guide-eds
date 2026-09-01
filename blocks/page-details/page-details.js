import { getBasePathBasedOnEnv } from '../../scripts/utils.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/**
 * Resource-type-bound endpoint. /content/enablingguide-api is an nt:unstructured
 * node whose sling:resourceType is enablingguide/api, which is what binds the
 * servlet.
 *
 * This uses the archetype appId (enablingguide), not the site name
 * (enabling-guide-eds). The endpoint lives in /apps-land; the content it reads
 * lives under /content/enabling-guide-eds. Two different names, both correct.
 */
const API_NODE = '/content/enablingguide-api';

/**
 * Builds the servlet URL. The page path is a suffix rather than a query
 * parameter so the dispatcher and CDN can cache the response.
 */
export function buildApiUrl(pagePath, { children = false } = {}) {
  const selectors = children ? 'pagedetails.children' : 'pagedetails';
  return `${getBasePathBasedOnEnv()}${API_NODE}.${selectors}.json${pagePath}`;
}

/**
 * Note: no custom request headers here on purpose. A simple GET with no custom
 * headers is not preflighted, so the browser never sends an OPTIONS request
 * and the dispatcher only has to allow GET.
 */
export async function fetchPageDetails(pagePath, options = {}) {
  try {
    const response = await fetch(buildApiUrl(pagePath, options));
    if (!response.ok) {
      throw new Error(`Page details request failed: ${response.status}`);
    }
    const body = await response.json();
    return options.children
      ? (body?.data?.items ?? [])
      : (body?.data?.item ?? null);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching page details:', error);
    return options.children ? [] : null;
  }
}

/**
 * The Universal Editor aem-content field can land in the DOM either as an
 * anchor (when AEM resolves it to a link) or as the raw path in a text node,
 * so both are handled.
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
  return path.startsWith('/content/') ? path : null;
}

function createTextNode(tag, className, text) {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = text;
  return el;
}

/**
 * DAM images are served by AEM, not by the EDS media bus, so createOptimizedPicture
 * must not be used here - AEM ignores the ?width=&format=webply query it appends.
 * A plain img against the publish origin is the correct call.
 */
function createImage(cardData) {
  const img = document.createElement('img');
  img.src = `${getBasePathBasedOnEnv()}${cardData.image}`;
  img.alt = cardData.title || '';
  img.loading = 'lazy';
  return img;
}

function createCard(cardData) {
  const card = document.createElement('div');
  card.className = 'page-details-card';

  if (cardData.image) {
    const imageWrapper = document.createElement('div');
    imageWrapper.className = 'page-details-image';
    imageWrapper.appendChild(createImage(cardData));
    card.appendChild(imageWrapper);
  }

  const body = document.createElement('div');
  body.className = 'page-details-body';

  if (cardData.subTitle) {
    body.appendChild(
      createTextNode('p', 'page-details-subtitle', cardData.subTitle),
    );
  }

  if (cardData.title) {
    const heading = document.createElement('h3');
    heading.className = 'page-details-title';

    if (cardData.path) {
      const link = document.createElement('a');
      link.href = cardData.path;
      link.textContent = cardData.title;
      heading.appendChild(link);
    } else {
      heading.textContent = cardData.title;
    }

    body.appendChild(heading);
  }

  if (cardData.description) {
    body.appendChild(
      createTextNode('p', 'page-details-description', cardData.description),
    );
  }

  card.appendChild(body);
  return card;
}

export default async function decorate(block) {
  const rows = [...block.children];

  // Row order follows the field order in _page-details.json.
  const pathRow = rows[0];
  const modeRow = rows[1];

  const pagePath = readAuthoredPath(
    pathRow?.querySelector(':scope > div') || pathRow,
  );
  const mode = (modeRow?.textContent || 'page').trim().toLowerCase();
  const wantsChildren = mode === 'children';

  if (!pagePath) {
    block.textContent = '';
    block.classList.add('page-details-empty');
    return;
  }

  const result = await fetchPageDetails(pagePath, { children: wantsChildren });
  const items = wantsChildren ? result : [result].filter(Boolean);

  if (!items.length) {
    block.textContent = '';
    block.classList.add('page-details-empty');
    return;
  }

  const container = document.createElement('div');
  container.className = 'page-details-list';

  items.forEach((item, index) => {
    const card = createCard(item);
    // Keeps the Universal Editor overlay attached to the rebuilt markup so
    // authors can still click the block and change the path.
    if (index === 0 && pathRow) {
      moveInstrumentation(pathRow, card);
    }
    container.appendChild(card);
  });

  block.textContent = '';
  block.appendChild(container);
}
