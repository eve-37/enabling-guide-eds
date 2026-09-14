import { moveInstrumentation } from '../../scripts/scripts.js';
import { readLinkFromCell, readTextFromCell } from '../../scripts/utils.js';

const AUTOPLAY_MS = 4000;
const SLIDE_MS = 500;
/** Slightly longer than the transition, so the silent reset lands after it. */
const RESET_MS = 520;

/**
 * The Sites component used /content/dam/pocsite/global/pause.png and play.png.
 * Those assets are not in this project, so these are inline SVG - which also
 * means the icon follows currentColor instead of being a fixed-colour bitmap.
 */
const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 5h3v14H8zm5 0h3v14h-3z"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';

/**
 * Six fields arrive as four cells: imageAlt collapses into the image and
 * ctaLinkText into the link, leaving the heading and subtitle as the two plain
 * text cells, in model order.
 */
function readSlide(row) {
  let imageCell = null;
  let linkCell = null;
  const text = [];

  [...row.children].forEach((cell) => {
    if (!imageCell && cell.querySelector('picture, img')) {
      imageCell = cell;
      return;
    }
    const raw = (cell.textContent || '').trim();
    if (!linkCell && (raw.startsWith('/content/') || cell.querySelector('a[href]'))) {
      linkCell = cell;
      return;
    }
    text.push(cell);
  });

  const anchor = linkCell ? linkCell.querySelector('a[href]') : null;

  return {
    picture: imageCell ? imageCell.querySelector('picture, img') : null,
    heading: readTextFromCell(text[0]),
    subtitle: readTextFromCell(text[1]),
    ctaLink: readLinkFromCell(linkCell),
    ctaText: anchor ? (anchor.textContent || '').trim() : '',
  };
}

/**
 * A clone must not carry the original's data-aue-* attributes: the Universal
 * Editor would then see two elements claiming the same resource and the item
 * becomes unselectable.
 */
function stripInstrumentation(element) {
  element.removeAttribute('data-aue-resource');
  element.removeAttribute('data-aue-prop');
  element.removeAttribute('data-aue-type');
  element.removeAttribute('data-aue-label');
  element.removeAttribute('data-aue-model');
  element.removeAttribute('data-aue-filter');
  element.querySelectorAll('[data-aue-resource], [data-aue-prop]').forEach((child) => {
    child.removeAttribute('data-aue-resource');
    child.removeAttribute('data-aue-prop');
    child.removeAttribute('data-aue-type');
    child.removeAttribute('data-aue-label');
    child.removeAttribute('data-aue-model');
    child.removeAttribute('data-aue-filter');
  });
}

function arrow(direction, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `hero-arrow ${direction}`;
  button.setAttribute('aria-label', label);
  button.innerHTML = direction === 'prev' ? '&#8249;' : '&#8250;';
  return button;
}

export default function decorate(block) {
  const rows = [...block.children];

  if (!rows.length) {
    if (block.hasAttribute('data-aue-resource')) {
      const placeholder = document.createElement('p');
      placeholder.className = 'hero-carousel-placeholder';
      placeholder.textContent = 'Hero Carousel: add a Carousel Slide.';
      block.append(placeholder);
    }
    return;
  }

  const slides = rows.map(readSlide);

  const hero = document.createElement('div');
  hero.className = 'hero';

  const track = document.createElement('div');
  track.className = 'hero-slides';

  const stage = document.createElement('div');
  stage.className = 'hero-content-stage';

  const dots = [];
  const contentBlocks = [];

  slides.forEach((slide, index) => {
    const slideEl = document.createElement('div');
    slideEl.className = 'hero-slide';
    if (slide.picture) {
      const img = slide.picture.tagName === 'IMG'
        ? slide.picture : slide.picture.querySelector('img');
      if (img && !img.getAttribute('alt')) img.setAttribute('alt', slide.heading);
      slide.picture.classList.add('hero-bg-img');
      slideEl.append(slide.picture);
    }
    track.append(slideEl);

    const inner = document.createElement('div');
    inner.className = 'hero-content-inner';
    if (index === 0) inner.classList.add('active');

    const heading = document.createElement('h2');
    heading.textContent = slide.heading;
    inner.append(heading);

    if (slide.subtitle) {
      const sub = document.createElement('p');
      sub.className = 'hero-subtitle';
      sub.textContent = slide.subtitle;
      inner.append(sub);
    }

    if (slide.ctaLink && slide.ctaText) {
      const cta = document.createElement('a');
      cta.className = 'btn-hero';
      cta.href = slide.ctaLink;
      cta.textContent = slide.ctaText;
      inner.append(cta);
    }

    // The text is the editable part of a slide, so the instrumentation goes
    // here rather than on the background image.
    moveInstrumentation(rows[index], inner);

    stage.append(inner);
    contentBlocks.push(inner);

    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'hero-dot';
    if (index === 0) dot.classList.add('active');
    dot.dataset.slide = String(index);
    dot.setAttribute('aria-label', `Go to slide ${index + 1}`);
    dots.push(dot);
  });

  const controls = document.createElement('div');
  controls.className = 'hero-controls';

  const pauseButton = document.createElement('button');
  pauseButton.type = 'button';
  pauseButton.className = 'hero-btn';
  pauseButton.innerHTML = ICON_PAUSE;
  pauseButton.setAttribute('aria-label', 'Pause auto-play');
  controls.append(pauseButton, ...dots);

  const content = document.createElement('div');
  content.className = 'hero-content';
  content.append(stage, controls);

  const prevButton = arrow('prev', 'Previous slide');
  const nextButton = arrow('next', 'Next slide');

  hero.append(prevButton, track, content, nextButton);
  block.replaceChildren(hero);

  // --- behaviour, ported from the Sites component's script ---------------

  const realSlides = [...track.children];
  const realCount = realSlides.length;

  let current = 0;
  let playing = true;
  let animating = false;
  let hasClones = false;
  let timer;

  const setupClones = () => {
    if (realCount <= 1) return;

    const endClone = realSlides[0].cloneNode(true);
    endClone.classList.add('hero-slide-clone');
    endClone.setAttribute('aria-hidden', 'true');
    stripInstrumentation(endClone);
    track.append(endClone);

    const startClone = realSlides[realCount - 1].cloneNode(true);
    startClone.classList.add('hero-slide-clone');
    startClone.setAttribute('aria-hidden', 'true');
    stripInstrumentation(startClone);
    track.prepend(startClone);

    hasClones = true;
  };

  const slotFor = (index) => (hasClones ? index + 1 : index);

  const setSlot = (slot, animate) => {
    track.style.transition = animate ? `transform ${SLIDE_MS}ms ease` : 'none';
    track.style.transform = `translateX(-${slot * 100}%)`;
  };

  const syncUI = () => {
    dots.forEach((dot, i) => dot.classList.toggle('active', i === current));
    contentBlocks.forEach((b, i) => b.classList.toggle('active', i === current));
  };

  const advance = () => {
    if (animating || realCount <= 1) return;
    if (current < realCount - 1) {
      current += 1;
      setSlot(slotFor(current), true);
      syncUI();
      return;
    }
    // Slide onto the trailing clone, then jump back to the real first slide
    // with the transition off so the loop looks continuous.
    animating = true;
    setSlot(slotFor(realCount), true);
    current = 0;
    syncUI();
    setTimeout(() => {
      setSlot(slotFor(0), false);
      animating = false;
    }, RESET_MS);
  };

  const retreat = () => {
    if (animating || realCount <= 1) return;
    if (current > 0) {
      current -= 1;
      setSlot(slotFor(current), true);
      syncUI();
      return;
    }
    animating = true;
    setSlot(slotFor(-1), true);
    current = realCount - 1;
    syncUI();
    setTimeout(() => {
      setSlot(slotFor(current), false);
      animating = false;
    }, RESET_MS);
  };

  const startTimer = () => {
    clearInterval(timer);
    if (realCount <= 1 || !playing) return;
    timer = setInterval(advance, AUTOPLAY_MS);
  };

  /**
   * All the content blocks are stacked, so the stage has no height of its own.
   * Measure the tallest one and pin the stage to it, or the controls below jump
   * as the slides change.
   */
  const sizeStage = () => {
    let tallest = 0;
    contentBlocks.forEach((b) => {
      const previous = b.getAttribute('style') || '';
      b.style.visibility = 'hidden';
      b.style.position = 'relative';
      b.style.opacity = '0';
      b.style.height = 'auto';
      tallest = Math.max(tallest, b.offsetHeight);
      b.setAttribute('style', previous);
    });
    stage.style.minHeight = `${tallest}px`;
  };

  pauseButton.addEventListener('click', () => {
    playing = !playing;
    pauseButton.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    pauseButton.setAttribute('aria-label', playing ? 'Pause auto-play' : 'Play');
    if (playing) startTimer();
    else clearInterval(timer);
  });

  nextButton.addEventListener('click', () => { advance(); startTimer(); });
  prevButton.addEventListener('click', () => { retreat(); startTimer(); });
  dots.forEach((dot) => dot.addEventListener('click', () => {
    if (animating) return;
    current = Number(dot.dataset.slide);
    setSlot(slotFor(current), true);
    syncUI();
    startTimer();
  }));

  // A single slide needs no arrows, dots or timer.
  if (realCount <= 1) {
    prevButton.hidden = true;
    nextButton.hidden = true;
    controls.hidden = true;
  }

  setupClones();
  setSlot(slotFor(0), false);
  syncUI();
  sizeStage();

  if (document.fonts?.ready) document.fonts.ready.then(sizeStage);

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(sizeStage, 150);
  });

  // Respect a reader who has asked for no motion: no auto-advance, arrows and
  // dots still work.
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    startTimer();
  } else {
    playing = false;
    pauseButton.innerHTML = ICON_PLAY;
    pauseButton.setAttribute('aria-label', 'Play');
  }
}
