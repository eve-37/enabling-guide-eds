import { getBasePathBasedOnEnv } from '../../scripts/utils.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/**
 * Resource-type-bound endpoint node. Uses the archetype appId (enablingguide),
 * NOT the site name (enabling-guide-eds). The endpoint lives in /apps-land; the
 * content it reads lives under /content/enabling-guide-eds.
 *
 * If you rename this block, the folder and both filenames must match the
 * slugified "name" in _related-events.json - not its "id". EDS derives the
 * block class and asset path from the name stored on the node, so a mismatch
 * 404s silently and the block renders as raw stacked rows.
 */
const API_NODE = '/content/enablingguide-api';

const AUTOPLAY_MS = 4000;
const SLIDE_MS = 500;
const CLONE_SETTLE_MS = SLIDE_MS + 20;
const MOBILE_QUERY = '(max-width: 991.98px)';
const DESKTOP_PER_PAGE = 3;
const RESIZE_DEBOUNCE_MS = 150;

/* -------------------------------------------------------------------------- */
/* Data                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The page path travels in the suffix, not a query string, so the dispatcher
 * and the AEM CDN can cache the response. RelatedEventsServlet answers the
 * relatedevents selector, which adds the Content Fragment dates and returns the
 * list already sorted soonest-first.
 */
export function buildApiUrl(pagePath, { children = false } = {}) {
  const selectors = children ? 'relatedevents.children' : 'relatedevents';
  return `${getBasePathBasedOnEnv()}${API_NODE}.${selectors}.json${pagePath}`;
}

/**
 * Always resolves to an array so the caller has one shape to render, whichever
 * mode the author picked.
 *
 * No custom request headers on purpose. A plain GET is a CORS-simple request,
 * so no OPTIONS preflight fires and the dispatcher only has to allow GET.
 */
export async function fetchEvents(pagePath, options = {}) {
  try {
    const response = await fetch(buildApiUrl(pagePath, options));
    if (!response.ok) {
      throw new Error(`Related events request failed: ${response.status}`);
    }
    const body = await response.json();
    if (options.children) {
      return body?.data?.items ?? [];
    }
    const item = body?.data?.item;
    return item ? [item] : [];
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching related events:', error);
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

function readText(row) {
  return (row?.textContent || '').trim();
}

function cellOf(row) {
  return row?.querySelector(':scope > div') || row;
}

/**
 * Finds each field by what its cell contains rather than by row index.
 *
 * Row count is not field count: AEM renders the iconAlt field as the alt
 * attribute of the icon it names, so this five-field model arrives as four
 * rows. Positional reads would land on the wrong cells and the path would fail
 * to parse, leaving the block empty with nothing in the console.
 */
function readRows(block) {
  const rows = [...block.children];
  const found = {
    headingRow: rows[0] || null, iconRow: null, pathRow: null, modeRow: null, altRow: null,
  };

  rows.slice(1).forEach((row) => {
    const cell = cellOf(row);
    if (!found.iconRow && cell.querySelector('picture, img')) {
      found.iconRow = row;
      return;
    }
    if (!found.pathRow && readAuthoredPath(cell)) {
      found.pathRow = row;
      return;
    }
    const text = (cell.textContent || '').trim().toLowerCase();
    if (!found.modeRow && (text === 'children' || text === 'page')) {
      found.modeRow = row;
      return;
    }
    if (!found.altRow && text) found.altRow = row;
  });

  return found;
}

/**
 * Reuses the authored <picture> rather than rebuilding it, so the srcset the
 * EDS media bus generated survives. AEM has normally already put iconAlt on the
 * img, so an authored alt is kept unless an explicit one is passed in.
 */
function readIcon(row, altText) {
  const media = row?.querySelector('picture, img');
  if (!media) return null;
  const img = media.tagName === 'IMG' ? media : media.querySelector('img');
  if (img) {
    if (altText) img.setAttribute('alt', altText);
    else if (img.getAttribute('alt') === null) img.setAttribute('alt', '');
    img.removeAttribute('width');
    img.removeAttribute('height');
    img.classList.add('rel-events-icon');
  }
  return media;
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
 * RelatedEventModel dropped the current page server-side via
 * getContainingPage(currentResource). The servlet response is cached by path
 * and selector and has no idea which page is asking, so that filter lives here.
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

const ICONS = {
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * The date block. The servlet sends the display strings and an ISO startDate,
 * so the visible "SEP 14" can sit inside a machine-readable <time> without the
 * block having to reparse "14 Sep 2026".
 */
function createDateBox(item) {
  if (!item.month && !item.day) return null;

  const box = el('time', 'event-date');
  if (item.startDate) box.setAttribute('datetime', item.startDate);
  box.appendChild(el('span', 'month', item.month || ''));
  box.appendChild(el('span', 'day', item.day || ''));
  return box;
}

function createCard(item) {
  const card = el('a', 'rel-card');
  card.href = item.path || '#';

  const dateBox = createDateBox(item);
  if (dateBox) card.appendChild(dateBox);

  const info = el('div', 'event-info');
  if (item.category) info.appendChild(el('span', 'event-badge', item.category));
  info.appendChild(el('h4', null, item.title || ''));
  if (item.dateRange) info.appendChild(el('p', null, item.dateRange));

  card.appendChild(info);
  return card;
}

function createShell({ heading, icon }) {
  const section = el('div', 'rel-events');

  const header = el('div', 'rel-events-header');
  const titleWrap = el('div', 'rel-events-title');
  if (icon) titleWrap.appendChild(icon);
  const title = el('h2', null, heading || '');
  titleWrap.appendChild(title);
  header.appendChild(titleWrap);

  const controls = el('div', 'rel-events-controls');

  const pauseBtn = el('button', 'rel-pause');
  pauseBtn.type = 'button';
  pauseBtn.innerHTML = ICONS.pause;
  controls.appendChild(pauseBtn);

  const prevBtn = el('button', 'rel-arrow rel-prev');
  prevBtn.type = 'button';
  prevBtn.setAttribute('aria-label', 'Previous slide');
  prevBtn.innerHTML = ICONS.prev;
  const nextBtn = el('button', 'rel-arrow rel-next');
  nextBtn.type = 'button';
  nextBtn.setAttribute('aria-label', 'Next slide');
  nextBtn.innerHTML = ICONS.next;
  controls.append(prevBtn, nextBtn);

  const dots = el('div', 'rel-dots');
  dots.setAttribute('role', 'tablist');
  controls.appendChild(dots);

  header.appendChild(controls);
  section.appendChild(header);

  const viewport = el('div', 'rel-events-viewport');
  const track = el('div', 'rel-events-track');
  track.setAttribute('aria-live', 'polite');
  viewport.appendChild(track);
  section.appendChild(viewport);

  return {
    section, title, viewport, track, controls, dots, pauseBtn, prevBtn, nextBtn,
  };
}

/**
 * A block that renders nothing cannot be clicked in the Universal Editor, so an
 * author has no way back into the dialog to fix it. Show a placeholder while
 * editing; render nothing at all on the published site.
 */
function renderEmpty(block, message) {
  block.textContent = '';
  if (block.hasAttribute('data-aue-resource')) {
    block.classList.add('related-events-placeholder');
    block.appendChild(el('p', 'rel-events-placeholder-text', message));
  } else {
    block.classList.add('related-events-empty');
  }
}

/* -------------------------------------------------------------------------- */
/* Carousel                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Three cards per slide on desktop, one on mobile. The loop is seamless because
 * a copy of the first slide sits after the last one (and vice versa): the track
 * animates onto the clone, then jumps back to the real slide with the
 * transition off, which the eye cannot see.
 */
function initCarousel(refs, cards) {
  const {
    viewport, track, controls, dots: dotsContainer, pauseBtn, prevBtn, nextBtn,
  } = refs;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let current = 0;
  let playing = !reducedMotion;
  let timer = null;
  let dots = [];
  let isAnimating = false;
  let hasClones = false;
  let realCount = 0;
  let lastPerPage = null;
  let resizeTimer = null;

  const perPage = () => (window.matchMedia(MOBILE_QUERY).matches ? 1 : DESKTOP_PER_PAGE);
  const slotFor = (index) => (hasClones ? index + 1 : index);

  function buildSlides(pp) {
    track.innerHTML = '';

    for (let i = 0; i < cards.length; i += pp) {
      const slide = el('div', 'rel-slide');
      for (let j = i; j < i + pp && j < cards.length; j += 1) {
        slide.appendChild(cards[j]);
      }
      // Keeps the cards of a partial last slide at their normal width.
      while (slide.children.length < pp) {
        slide.appendChild(el('div', 'rel-placeholder'));
      }
      track.appendChild(slide);
    }

    const slides = [...track.children];
    realCount = slides.length;
    hasClones = realCount > 1;

    if (hasClones) {
      const endClone = slides[0].cloneNode(true);
      endClone.classList.add('rel-slide--clone');
      endClone.setAttribute('aria-hidden', 'true');
      track.appendChild(endClone);

      const startClone = slides[realCount - 1].cloneNode(true);
      startClone.classList.add('rel-slide--clone');
      startClone.setAttribute('aria-hidden', 'true');
      track.insertBefore(startClone, track.firstChild);
    }
  }

  function setSlot(slot, animate) {
    const viewportWidth = viewport.getBoundingClientRect().width;
    track.style.transition = animate && !reducedMotion ? `transform ${SLIDE_MS}ms ease-in-out` : 'none';
    track.style.transform = `translateX(-${slot * viewportWidth}px)`;
  }

  function updateDots() {
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === current);
      dot.setAttribute('aria-selected', String(i === current));
    });
  }

  function goTo(index) {
    if (isAnimating) return;
    current = index;
    setSlot(slotFor(current), true);
    updateDots();
  }

  function advance() {
    if (isAnimating || realCount <= 1) return;

    if (current < realCount - 1) {
      current += 1;
      setSlot(slotFor(current), true);
      updateDots();
      return;
    }

    isAnimating = true;
    setSlot(slotFor(realCount), true);
    setTimeout(() => {
      current = 0;
      setSlot(slotFor(0), false);
      updateDots();
      isAnimating = false;
    }, CLONE_SETTLE_MS);
  }

  function retreat() {
    if (isAnimating || realCount <= 1) return;

    if (current > 0) {
      current -= 1;
      setSlot(slotFor(current), true);
      updateDots();
      return;
    }

    isAnimating = true;
    setSlot(slotFor(-1), true);
    setTimeout(() => {
      current = realCount - 1;
      setSlot(slotFor(current), false);
      updateDots();
      isAnimating = false;
    }, CLONE_SETTLE_MS);
  }

  function startTimer() {
    clearInterval(timer);
    if (!playing || realCount <= 1 || reducedMotion) return;
    timer = setInterval(advance, AUTOPLAY_MS);
  }

  function buildDots() {
    dotsContainer.innerHTML = '';
    dots = [];
    if (realCount <= 1) return;

    for (let i = 0; i < realCount; i += 1) {
      const dot = el('button', 'rel-dot', String(i + 1));
      dot.type = 'button';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', `Go to page ${i + 1}`);
      dot.addEventListener('click', () => {
        goTo(i);
        startTimer();
      });
      dotsContainer.appendChild(dot);
      dots.push(dot);
    }
    updateDots();
  }

  /**
   * Slides are only rebuilt when the breakpoint actually changes; every other
   * resize just re-measures the viewport so the current slide stays aligned.
   */
  function rebuild() {
    const pp = perPage();
    if (pp !== lastPerPage) {
      lastPerPage = pp;
      buildSlides(pp);
      if (current >= realCount) current = realCount - 1;
      if (current < 0) current = 0;
      buildDots();
      // Nothing to page through when every card fits on one slide.
      controls.hidden = realCount <= 1;
    }
    setSlot(slotFor(current), false);
  }

  function setPlaying(next) {
    playing = next;
    pauseBtn.innerHTML = playing ? ICONS.pause : ICONS.play;
    pauseBtn.setAttribute('aria-label', playing ? 'Pause auto-play' : 'Start auto-play');
    pauseBtn.setAttribute('aria-pressed', String(!playing));
    if (playing) startTimer();
    else clearInterval(timer);
  }

  pauseBtn.addEventListener('click', () => setPlaying(!playing));

  nextBtn.addEventListener('click', () => {
    advance();
    startTimer();
  });

  prevBtn.addEventListener('click', () => {
    retreat();
    startTimer();
  });

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(rebuild, RESIZE_DEBOUNCE_MS);
  });

  rebuild();
  setPlaying(playing);
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

export default async function decorate(block) {
  const {
    headingRow, iconRow, pathRow, modeRow, altRow,
  } = readRows(block);

  const heading = readText(headingRow);
  const icon = readIcon(iconRow, readText(altRow));
  const pagePath = readAuthoredPath(cellOf(pathRow));
  const wantsChildren = readText(modeRow).toLowerCase() !== 'page';

  if (!pagePath) {
    renderEmpty(block, 'Related Events: pick a source page.');
    return;
  }

  const items = withoutCurrentPage(await fetchEvents(pagePath, { children: wantsChildren }));

  if (!items.length) {
    renderEmpty(block, 'Related Events: nothing to show for the selected page.');
    return;
  }

  const refs = createShell({ heading, icon });
  const cards = items.map(createCard);

  // Keeps the heading inline-editable in the Universal Editor after the
  // authored rows are thrown away.
  if (headingRow) moveInstrumentation(cellOf(headingRow), refs.title);

  block.textContent = '';
  block.appendChild(refs.section);

  initCarousel(refs, cards);
}
