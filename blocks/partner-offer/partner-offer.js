import { moveInstrumentation } from '../../scripts/scripts.js';
import { readLinkFromCell, readTextFromCell } from '../../scripts/utils.js';

/** The Sites component capped the carousel at seven cards. */
const MAX_CARDS = 7;

/** Scroll fractions the two phases occupy: text reveal, then cards rising. */
const PHASE1_END = 0.4;
const PHASE2_START = 0.4;
/** Every second card sits higher, which is what staggers the row. */
const EVEN_OFFSET = -80;

const CLICK_THRESHOLD = 6;
const FLICK_THRESHOLD = 30;
/** How much the grid gives when dragged past either end. */
const RUBBER = 80;

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut3 = (t) => 1 - (1 - t) ** 3;

/**
 * The parent's own paragraph arrives as a row before the card rows, and it has
 * no image and no link - which is how it is told apart from a card.
 */
function isCardRow(row) {
  const cells = [...row.children];
  if (cells.length > 1) return true;
  return Boolean(row.querySelector('picture, img'));
}

/**
 * Reads one card.
 *
 * The three cta_ fields are grouped into a single cell by naming convention, so
 * the link, its text and the target may all arrive together. Everything is
 * located by content rather than by position, which means this also works if
 * they arrive as separate cells.
 */
function readCard(row) {
  const cells = [...row.children];

  let imageCell = null;
  let linkCell = null;
  const text = [];

  cells.forEach((cell) => {
    if (!imageCell && cell.querySelector('picture, img')) {
      imageCell = cell;
      return;
    }
    const raw = (cell.textContent || '').trim();
    if (!linkCell && (raw.startsWith('/content/') || cell.querySelector('a[href]'))) {
      linkCell = cell;
      return;
    }
    if (raw === '_blank') return;
    text.push(cell);
  });

  const anchor = linkCell ? linkCell.querySelector('a[href]') : null;
  const newTab = cells.some((cell) => (cell.textContent || '').includes('_blank'));

  return {
    picture: imageCell ? imageCell.querySelector('picture, img') : null,
    title: readTextFromCell(text[0]),
    description: readTextFromCell(text[1]),
    link: readLinkFromCell(linkCell),
    linkText: anchor ? (anchor.textContent || '').trim() : '',
    newTab,
  };
}

/** Wraps every character in its own span so each can be lit independently. */
function splitIntoChars(element, value) {
  element.textContent = '';
  const words = value.split(' ');

  words.forEach((word, index) => {
    const wordSpan = document.createElement('span');
    wordSpan.className = 'word';
    [...word].forEach((character) => {
      const charSpan = document.createElement('span');
      charSpan.className = 'char';
      charSpan.textContent = character;
      wordSpan.append(charSpan);
    });
    element.append(wordSpan);
    if (index < words.length - 1) element.append(document.createTextNode(' '));
  });

  return [...element.querySelectorAll('.char')];
}

function buildCard(card) {
  const article = document.createElement('div');
  article.className = 'partner-card';

  const imageWrap = document.createElement('div');
  imageWrap.className = 'partner-card-img';
  if (card.picture) {
    const img = card.picture.tagName === 'IMG'
      ? card.picture : card.picture.querySelector('img');
    if (img) {
      if (!img.getAttribute('alt')) img.setAttribute('alt', card.title);
      img.setAttribute('draggable', 'false');
    }
    imageWrap.append(card.picture);
  }
  article.append(imageWrap);

  const content = document.createElement('div');
  content.className = 'partner-card-content';

  const title = document.createElement('div');
  title.className = 'partner-card-title';
  title.textContent = card.title;

  const description = document.createElement('div');
  description.className = 'partner-card-desc';
  description.textContent = card.description;

  content.append(title, description);
  article.append(content);

  if (card.link && card.linkText) {
    // A real anchor rather than the Sites markup's anchor-wrapping-a-button,
    // which was neither valid nor keyboard-friendly.
    const cta = document.createElement('a');
    cta.className = 'partner-card-btn';
    cta.href = card.link;
    cta.textContent = card.linkText;
    if (card.newTab) {
      cta.target = '_blank';
      cta.rel = 'noopener noreferrer';
    }
    article.append(cta);
  }

  return article;
}

export default function decorate(block) {
  const rows = [...block.children];
  const paragraphRow = rows.find((row) => !isCardRow(row));
  const cardRows = rows.filter(isCardRow).slice(0, MAX_CARDS);

  const paragraph = paragraphRow ? readTextFromCell(paragraphRow.firstElementChild) : '';

  if (!cardRows.length) {
    if (block.hasAttribute('data-aue-resource')) {
      const placeholder = document.createElement('p');
      placeholder.className = 'partner-offer-placeholder';
      placeholder.textContent = 'Partner Offer: add a Partner Card.';
      block.append(placeholder);
    }
    return;
  }

  // In the editor the scene is a fixed 500px rather than two viewport heights,
  // so the whole component stays reachable without scroll-scrubbing it.
  const editing = block.hasAttribute('data-aue-resource');

  const driver = document.createElement('div');
  driver.className = 'partner-scroll-driver';
  if (editing) driver.classList.add('edit-mode');

  const scene = document.createElement('div');
  scene.className = 'partner-sticky-scene';
  if (editing) scene.classList.add('edit-mode');

  const background = document.createElement('div');
  background.className = 'partner-scene-bg';

  const textWrap = document.createElement('div');
  textWrap.className = 'partner-scene-text';
  const revealEl = document.createElement('p');
  revealEl.className = 'reveal-type';
  const chars = splitIntoChars(revealEl, paragraph);
  textWrap.append(revealEl);

  const cardsWrap = document.createElement('div');
  cardsWrap.className = 'partner-scene-cards';
  const viewport = document.createElement('div');
  viewport.className = 'partner-swipe-viewport';
  const grid = document.createElement('div');
  grid.className = 'partner-cards-grid';

  const cards = cardRows.map((row) => {
    const article = buildCard(readCard(row));
    moveInstrumentation(row, article);
    grid.append(article);
    return article;
  });

  viewport.append(grid);
  cardsWrap.append(viewport);
  scene.append(background, textWrap, cardsWrap);
  driver.append(scene);

  if (paragraphRow) moveInstrumentation(paragraphRow, revealEl);

  block.replaceChildren(driver);

  // --- phase 1 and 2, driven by how far the driver has scrolled -----------

  const update = () => {
    const driverRect = driver.getBoundingClientRect();
    const totalScroll = driver.offsetHeight - window.innerHeight;
    if (totalScroll <= 0) return;

    const master = clamp01(-driverRect.top / totalScroll);
    const p1 = clamp01(master / PHASE1_END);

    if (master <= PHASE1_END) {
      chars.forEach((char, index) => {
        const start = index / chars.length;
        const end = (index + 1) / chars.length;
        const progress = clamp01((p1 - start) / (end - start));
        char.style.opacity = 0.2 + progress * 0.8;
        char.style.color = `rgb(${Math.round(progress * 51)} ${Math.round(progress * 171)} ${Math.round(progress * 186)})`;
      });
    } else {
      chars.forEach((char) => {
        char.style.opacity = 1;
        char.style.color = '#fff';
      });
    }

    const p2Raw = clamp01((master - PHASE2_START) / (1 - PHASE2_START));
    const p2 = easeOut3(p2Raw);

    revealEl.classList.toggle('phase2', p2Raw > 0.05);
    background.style.transform = `translateY(${lerp(100, 0, p2)}%)`;
    cardsWrap.style.pointerEvents = p2 > 0.05 ? 'auto' : 'none';

    cards.forEach((card, index) => {
      const stagger = index * 0.07;
      const cardProgress = easeOut3(clamp01((p2Raw - stagger) / (1 - stagger)));
      const baseY = index % 2 === 1 ? EVEN_OFFSET : 0;
      card.style.opacity = cardProgress;
      card.style.transform = `translateY(${lerp(baseY + 140, baseY + 100, cardProgress)}px)`;
    });
  };

  window.addEventListener('scroll', update, { passive: true });
  update();

  // --- drag to swipe, snapping to whole cards -----------------------------

  let dragging = false;
  let didDrag = false;
  let startX = 0;
  let currentX = 0;
  let previousX = 0;
  let frame = 0;
  // The Sites component deliberately started one card in, so the row reads as
  // already scrolled.
  let index = 1;

  const cardStep = () => {
    if (cards.length < 2) return cards[0] ? cards[0].offsetWidth : 328;
    return Math.abs(cards[1].getBoundingClientRect().left
      - cards[0].getBoundingClientRect().left);
  };

  const itemsVisible = () => Math.max(1, Math.floor(viewport.clientWidth / cardStep()));
  const maxIndex = () => Math.max(0, cards.length - itemsVisible());
  const indexToX = (value) => -(Math.max(0, Math.min(value, maxIndex())) * cardStep());

  const pointerX = (event) => (event.type.startsWith('mouse')
    ? event.pageX
    : event.touches[0].clientX);

  const applyTranslate = (x, animate) => {
    if (animate) {
      grid.style.transform = `translateX(${x}px)`;
      return;
    }
    grid.classList.add('no-transition');
    grid.style.transform = `translateX(${x}px)`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      grid.classList.remove('no-transition');
    }));
  };

  const snapTo = (value) => {
    index = Math.max(0, Math.min(value, maxIndex()));
    currentX = indexToX(index);
    previousX = currentX;
    applyTranslate(currentX, true);
  };

  const dragLoop = () => {
    if (!dragging) return;
    grid.style.transform = `translateX(${currentX}px)`;
    frame = requestAnimationFrame(dragLoop);
  };

  const onStart = (event) => {
    currentX = new DOMMatrix(getComputedStyle(grid).transform).m41;
    previousX = currentX;
    dragging = true;
    didDrag = false;
    startX = pointerX(event);
    grid.classList.add('no-transition', 'dragging');
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(dragLoop);
  };

  const onMove = (event) => {
    if (!dragging) return;
    const delta = pointerX(event) - startX;
    if (Math.abs(delta) > CLICK_THRESHOLD) didDrag = true;

    let next = previousX + delta;
    if (next > 0) {
      next /= 1 + Math.abs(next) / RUBBER;
    }
    const min = -(maxIndex() * cardStep());
    if (next < min) {
      next = min + (next - min) / (1 + Math.abs(next - min) / RUBBER);
    }
    currentX = next;
  };

  const onEnd = () => {
    if (!dragging) return;
    dragging = false;
    cancelAnimationFrame(frame);
    grid.classList.remove('no-transition', 'dragging');

    const moved = currentX - previousX;
    if (Math.abs(moved) < CLICK_THRESHOLD) {
      snapTo(index);
      return;
    }
    const steps = Math.max(1, Math.round(Math.abs(moved) / cardStep()));
    if (moved < -FLICK_THRESHOLD) snapTo(index + steps);
    else if (moved > FLICK_THRESHOLD) snapTo(index - steps);
    else snapTo(index);
  };

  // A drag that ends over a card must not also count as a click on its CTA.
  grid.addEventListener('click', (event) => {
    if (!didDrag) return;
    event.preventDefault();
    event.stopPropagation();
    didDrag = false;
  }, true);

  viewport.addEventListener('touchstart', onStart, { passive: true });
  viewport.addEventListener('touchmove', onMove, { passive: true });
  viewport.addEventListener('touchend', onEnd);
  viewport.addEventListener('touchcancel', onEnd);
  viewport.addEventListener('mousedown', onStart);
  viewport.addEventListener('mousemove', onMove);
  viewport.addEventListener('mouseup', onEnd);
  viewport.addEventListener('mouseleave', onEnd);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    dragging = false;
    didDrag = false;
    grid.classList.remove('no-transition', 'dragging');
    applyTranslate(currentX, false);
  });

  window.addEventListener('resize', () => {
    index = Math.min(index, maxIndex());
    currentX = indexToX(index);
    previousX = currentX;
    applyTranslate(currentX, false);
  });

  currentX = indexToX(index);
  previousX = currentX;
  applyTranslate(currentX, false);
}
