import { moveInstrumentation } from '../../scripts/scripts.js';
import { readLinkFromCell, readTextFromCell, toEdsPath } from '../../scripts/utils.js';

const QUERY_INDEX = '/query-index.json';

/** The Sites dialog capped the top bar at four links. */
const MAX_HEADING_ITEMS = 4;

const MOBILE = '(max-width: 991px)';

/**
 * Inline rather than the Sites component's two DAM SVGs, which are not in this
 * project. One icon serves both states - CSS rotates it when the dropdown
 * opens - and it inherits currentColor, which replaces four separate
 * filter: brightness(0) saturate(100%) invert(...) hacks that existed only to
 * recolour a black bitmap per state.
 */
const ARROW = '<svg class="nav-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7.4 9.3a1 1 0 0 1 1.4 0l3.2 3.2 3.2-3.2a1 1 0 1 1 1.4 1.4l-3.9 3.9a1 1 0 0 1-1.4 0l-3.9-3.9a1 1 0 0 1 0-1.4Z"/></svg>';
const SEARCH = '<svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M10.5 3a7.5 7.5 0 1 0 4.6 13.4l4.2 4.3a1 1 0 0 0 1.4-1.4l-4.3-4.2A7.5 7.5 0 0 0 10.5 3Zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z"/></svg>';

let indexPromise;

function loadIndex() {
  if (!indexPromise) {
    indexPromise = fetch(QUERY_INDEX)
      .then((response) => {
        if (!response.ok) throw new Error(`Query index request failed: ${response.status}`);
        return response.json();
      })
      .then((body) => body?.data ?? [])
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Error fetching query index:', error);
        return [];
      });
  }
  return indexPromise;
}

function labelFromSlug(segment) {
  return segment
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

const isHidden = (row) => /noindex/i.test(row?.robots || '');

/**
 * Builds the two-level tree under the navigation root from the query index.
 *
 * Two things the index cannot give us, both worth knowing:
 *
 * - It holds only pages published to Edge Delivery, and an intermediate section
 *   page is often missing while its children are present. Sections are
 *   therefore synthesised from the paths of everything below them, so a section
 *   still appears when only its children are live - its label then comes from
 *   the slug rather than a real title.
 * - Rows arrive in indexing order, not the order an author arranged the pages
 *   in. The Sites component used Page.listChildren(), which preserved that
 *   order. Sorting by title is the closest deterministic substitute.
 */
function buildTree(rows, root) {
  const base = root === '/' ? '' : root;
  const byPath = new Map();
  rows.forEach((row) => {
    if (row?.path) byPath.set(row.path.replace(/\/$/, '') || '/', row);
  });

  const sections = new Map();

  rows.forEach((row) => {
    const path = (row.path || '').replace(/\/$/, '');
    if (!path.startsWith(`${base}/`)) return;
    if (isHidden(row)) return;

    const rest = path.slice(base.length + 1).split('/').filter(Boolean);
    if (!rest.length) return;

    const sectionPath = `${base}/${rest[0]}`;
    if (!sections.has(sectionPath)) {
      const own = byPath.get(sectionPath);
      sections.set(sectionPath, {
        path: sectionPath,
        title: own?.title || labelFromSlug(rest[0]),
        children: [],
        seen: new Set(),
      });
    }

    if (rest.length < 2) return;

    const childPath = `${base}/${rest[0]}/${rest[1]}`;
    const section = sections.get(sectionPath);
    if (section.seen.has(childPath)) return;
    section.seen.add(childPath);

    const childRow = byPath.get(childPath);
    section.children.push({
      path: childPath,
      title: childRow?.title || labelFromSlug(rest[1]),
    });
  });

  const byTitle = (a, b) => a.title.localeCompare(b.title);
  const list = [...sections.values()].sort(byTitle);
  list.forEach((section) => section.children.sort(byTitle));
  return list;
}

function buildTopNav(sections, here) {
  const nav = document.createElement('nav');
  nav.className = 'top-nav';
  nav.setAttribute('aria-label', 'Sections');

  sections.forEach((section) => {
    const dropdown = document.createElement('div');
    dropdown.className = 'nav-dropdown';

    // Active when the reader is on the section page itself or anywhere inside
    // it, which is what the Sites model computed server-side.
    if (here === section.path || here.startsWith(`${section.path}/`)) {
      dropdown.classList.add('active');
    }

    const toggle = document.createElement('a');
    toggle.className = 'nav-dropdown-toggle';
    toggle.href = section.path;
    toggle.append(document.createTextNode(section.title));

    if (section.children.length) {
      toggle.insertAdjacentHTML('beforeend', ARROW);
      toggle.setAttribute('aria-expanded', 'false');

      const menu = document.createElement('div');
      menu.className = 'nav-dropdown-menu';

      section.children.forEach((child) => {
        const link = document.createElement('a');
        link.href = child.path;
        link.textContent = child.title;
        if (here === child.path) link.classList.add('active');
        menu.append(link);
      });

      dropdown.append(toggle, menu);
    } else {
      dropdown.append(toggle);
    }

    nav.append(dropdown);
  });

  // Kept from the Sites markup. It has no behaviour there either - there is no
  // search page to point it at yet.
  const searchWrap = document.createElement('div');
  searchWrap.className = 'nav-dropdown';
  const search = document.createElement('button');
  search.type = 'button';
  search.className = 'nav-dropdown-toggle search-btn';
  search.setAttribute('aria-label', 'Search');
  search.innerHTML = SEARCH;
  searchWrap.append(search);
  nav.append(searchWrap);

  return nav;
}

/** A row holding both a link and a label is one of the authored top-bar items. */
function isLinkRow(row) {
  if (row.children.length > 1) return true;
  return Boolean(row.querySelector('a[href]'));
}

export default function decorate(block) {
  const rows = [...block.children];
  const itemRows = rows.filter(isLinkRow).slice(0, MAX_HEADING_ITEMS);
  const ownRows = rows.filter((row) => !isLinkRow(row));

  const logoRow = ownRows.find((row) => row.querySelector('picture, img'));
  const pathRows = ownRows.filter((row) => row !== logoRow);

  const navigationRoot = toEdsPath(readTextFromCell(
    pathRows[0] ? pathRows[0].firstElementChild : null,
  )) || '/';
  const logoLink = readLinkFromCell(pathRows[1] ? pathRows[1].firstElementChild : null) || '/';
  const picture = logoRow ? logoRow.querySelector('picture, img') : null;

  const here = window.location.pathname.replace(/\/$/, '') || '/';

  const header = document.createElement('header');

  const logoAnchor = document.createElement('a');
  logoAnchor.className = 'logo';
  logoAnchor.href = logoLink;
  if (picture) {
    const img = picture.tagName === 'IMG' ? picture : picture.querySelector('img');
    if (img && !img.getAttribute('alt')) img.setAttribute('alt', 'Home');
    picture.classList.add('logo-img');
    logoAnchor.append(picture);
  }
  if (logoRow) moveInstrumentation(logoRow, logoAnchor);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'nav-toggle';
  toggle.setAttribute('aria-label', 'Toggle navigation');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'site-header-main-nav');
  toggle.innerHTML = '<span class="nav-toggle-bar"></span><span class="nav-toggle-bar"></span><span class="nav-toggle-bar"></span>';

  const mainNav = document.createElement('nav');
  mainNav.className = 'main-nav';
  mainNav.id = 'site-header-main-nav';

  itemRows.forEach((row) => {
    const cells = [...row.children];
    const anchor = cells[0] ? cells[0].querySelector('a[href]') : null;
    const href = anchor ? toEdsPath(anchor.getAttribute('href')) : readLinkFromCell(cells[0]);
    const label = anchor
      ? (anchor.textContent || '').trim()
      : readTextFromCell(cells[1]);
    if (!href && !label) return;

    const link = document.createElement('a');
    link.href = href || '#';
    link.textContent = label || href;
    if (here === (href || '').replace(/\/$/, '')) link.classList.add('active');
    moveInstrumentation(row, link);
    mainNav.append(link);
  });

  header.append(logoAnchor, toggle, mainNav);
  block.replaceChildren(header);

  toggle.addEventListener('click', () => {
    const open = mainNav.classList.toggle('is-open');
    toggle.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });

  loadIndex().then((rowsFromIndex) => {
    const sections = buildTree(rowsFromIndex, navigationRoot);
    if (!sections.length) return;

    const topNav = buildTopNav(sections, here);
    block.append(topNav);

    const closeAll = () => {
      topNav.querySelectorAll('.nav-dropdown.open').forEach((dropdown) => {
        dropdown.classList.remove('open');
        dropdown.querySelector('.nav-dropdown-toggle')?.setAttribute('aria-expanded', 'false');
      });
    };

    // Only a toggle that owns a menu intercepts the click; one without children
    // stays an ordinary link through to its section page.
    topNav.querySelectorAll('.nav-dropdown-toggle').forEach((element) => {
      element.addEventListener('click', (event) => {
        const dropdown = element.closest('.nav-dropdown');
        if (!dropdown.querySelector('.nav-dropdown-menu')) return;

        event.preventDefault();
        const wasOpen = dropdown.classList.contains('open');
        closeAll();
        if (!wasOpen) {
          dropdown.classList.add('open');
          element.setAttribute('aria-expanded', 'true');
        }
      });
    });

    document.addEventListener('click', (event) => {
      if (!block.contains(event.target)) closeAll();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAll();
    });

    // --- mobile: the section nav moves inside the hamburger ---------------

    const mobile = window.matchMedia(MOBILE);

    const syncMobileMenu = () => {
      mainNav.querySelectorAll('.injected-dropdown').forEach((el) => el.remove());
      if (!mobile.matches) return;

      const firstLink = mainNav.querySelector('a');
      topNav.querySelectorAll('.nav-dropdown').forEach((dropdown) => {
        // The search control is not cloned into the hamburger.
        if (dropdown.querySelector('.search-icon')) return;
        const clone = dropdown.cloneNode(true);
        clone.classList.add('injected-dropdown');
        clone.classList.remove('open');
        mainNav.insertBefore(clone, firstLink);
      });
    };

    // Delegated, so it also covers clones made after this runs.
    mainNav.addEventListener('click', (event) => {
      const element = event.target.closest('.injected-dropdown .nav-dropdown-toggle');
      if (!element) return;
      const dropdown = element.closest('.nav-dropdown');
      if (!dropdown.querySelector('.nav-dropdown-menu')) return;

      event.preventDefault();
      const wasOpen = dropdown.classList.contains('open');
      mainNav.querySelectorAll('.injected-dropdown.open').forEach((el) => el.classList.remove('open'));
      if (!wasOpen) dropdown.classList.add('open');
    });

    syncMobileMenu();
    mobile.addEventListener('change', syncMobileMenu);
  });
}
