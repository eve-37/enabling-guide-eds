import { moveInstrumentation } from '../../scripts/scripts.js';
import { readTextFromCell } from '../../scripts/utils.js';

/**
 * The Edge Delivery index, not an AEM endpoint.
 *
 * The Sites model walked currentPage.getParent() up the tree and read each
 * ancestor's title from the repository. There is no page hierarchy on the EDS
 * side, but the query index lists every published page with its title, so the
 * whole trail is one cached same-origin request no matter how deep the page is.
 *
 * helix-query.yaml has to declare the title property, and the site has to have
 * been indexed since, or every label falls back to the slug.
 */
const QUERY_INDEX = '/query-index.json';

/** Replaces the Sites component's arrow_right.png, which is not in this project. */
const SEPARATOR = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M9.3 6.7a1 1 0 0 1 1.4 0l4.6 4.6a1 1 0 0 1 0 1.4l-4.6 4.6a1 1 0 1 1-1.4-1.4l3.9-3.9-3.9-3.9a1 1 0 0 1 0-1.4Z"/></svg>';

let indexPromise;

/**
 * Loads the index once per page view. A failure is not fatal: the trail still
 * renders with slug-derived labels, which is better than no breadcrumb.
 */
function loadIndex() {
  if (!indexPromise) {
    indexPromise = fetch(QUERY_INDEX)
      .then((response) => {
        if (!response.ok) throw new Error(`Query index request failed: ${response.status}`);
        return response.json();
      })
      .then((body) => {
        const byPath = new Map();
        (body?.data ?? []).forEach((row) => {
          if (row?.path) byPath.set(row.path.replace(/\/$/, '') || '/', row);
        });
        return byPath;
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Error fetching query index:', error);
        return new Map();
      });
  }
  return indexPromise;
}

/** "annual-report-2025" -> "Annual Report 2025". */
function labelFromSlug(segment) {
  return segment
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * Every ancestor path of the current page, root first, current page last.
 */
function trailFor(pathname) {
  const clean = pathname.replace(/\/$/, '');
  const segments = clean.split('/').filter(Boolean);

  const paths = ['/'];
  segments.forEach((segment, index) => {
    paths.push(`/${segments.slice(0, index + 1).join('/')}`);
  });
  return paths;
}

function isHidden(row) {
  return /noindex/i.test(row?.robots || '');
}

export default function decorate(block) {
  const cells = [...block.children].map((row) => row.firstElementChild || row);
  const startLevel = Number.parseInt(readTextFromCell(cells[0]), 10) || 0;
  const hideCurrent = readTextFromCell(cells[1]) === 'hide';
  const showHidden = readTextFromCell(cells[2]) === 'show';

  const here = window.location.pathname;
  let paths = trailFor(here);

  // startLevel counts from the site root, so it drops leading entries. The
  // current page is never dropped this way, however deep it is.
  paths = paths.slice(Math.min(startLevel, paths.length - 1));
  if (hideCurrent && paths.length > 1) paths = paths.slice(0, -1);

  if (!paths.length) {
    block.textContent = '';
    return;
  }

  const nav = document.createElement('nav');
  nav.className = 'breadcrumb-nav';
  nav.setAttribute('aria-label', 'Breadcrumb');

  const list = document.createElement('ol');
  list.className = 'breadcrumb-list';
  // Kept from the Sites markup - this is what puts the trail in search results.
  list.setAttribute('itemscope', '');
  list.setAttribute('itemtype', 'https://schema.org/BreadcrumbList');

  nav.append(list);
  block.replaceChildren(nav);
  if (cells[0]) moveInstrumentation(cells[0], nav);

  loadIndex().then((byPath) => {
    const items = paths
      .map((path) => ({ path, row: byPath.get(path) }))
      .filter(({ row }) => showHidden || !isHidden(row));

    if (!items.length) {
      nav.remove();
      return;
    }

    list.replaceChildren();

    items.forEach(({ path, row }, index) => {
      const isCurrent = index === items.length - 1 && !hideCurrent && path === here.replace(/\/$/, '');
      const label = row?.title
        || (path === '/' ? 'Home' : labelFromSlug(path.split('/').pop()));

      const item = document.createElement('li');
      item.className = 'breadcrumb-item';
      item.setAttribute('itemprop', 'itemListElement');
      item.setAttribute('itemscope', '');
      item.setAttribute('itemtype', 'https://schema.org/ListItem');

      if (isCurrent) {
        item.classList.add('breadcrumb-item-active');
        item.setAttribute('aria-current', 'page');
      }

      const name = document.createElement('span');
      name.setAttribute('itemprop', 'name');
      name.textContent = label;

      // The current page is text, not a link - the Sites template unwrapped the
      // anchor on the active item for the same reason.
      if (isCurrent) {
        item.append(name);
      } else {
        const link = document.createElement('a');
        link.className = 'breadcrumb-item-link';
        link.href = path;
        link.setAttribute('itemprop', 'item');
        link.append(name);
        item.append(link);
      }

      const position = document.createElement('meta');
      position.setAttribute('itemprop', 'position');
      position.setAttribute('content', String(index + 1));
      item.append(position);

      if (index < items.length - 1) {
        const separator = document.createElement('span');
        separator.className = 'breadcrumb-separator';
        separator.setAttribute('aria-hidden', 'true');
        separator.innerHTML = SEPARATOR;
        item.append(separator);
      }

      list.append(item);
    });
  });
}
