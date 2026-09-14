import { moveInstrumentation } from '../../scripts/scripts.js';
import { readTextFromCell } from '../../scripts/utils.js';

/**
 * Sections opt in by carrying this class.
 *
 * The Sites model walked the page's component tree for containers that had a
 * label property, so a section joined the menu only when an author gave it one.
 * A section's authored name does not reach the published DOM in Edge Delivery -
 * only its Style values do, as classes - so the Style multiselect carries the
 * opt-in and the section's own first heading supplies the label.
 */
const OPT_IN_CLASS = 'nav-section';

const HEADING_SELECTOR = 'h1, h2, h3';

/** Replaces the DAM up/down arrow pair; CSS rotates this one when open. */
const CHEVRON = '<svg class="in-section-chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7.4 9.3a1 1 0 0 1 1.4 0l3.2 3.2 3.2-3.2a1 1 0 1 1 1.4 1.4l-3.9 3.9a1 1 0 0 1-1.4 0l-3.9-3.9a1 1 0 0 1 0-1.4Z"/></svg>';

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function sectionsLoaded(main) {
  return [...main.querySelectorAll(':scope > .section')]
    .every((section) => section.dataset.sectionStatus === 'loaded');
}

/**
 * Collects the opted-in sections, giving each a stable id to jump to.
 *
 * EDS already gives headings ids, so an existing one is reused rather than
 * replaced - overwriting it would break any link already pointing at it.
 */
function collectSections(main, block) {
  const used = new Set();

  return [...main.querySelectorAll(`.section.${OPT_IN_CLASS}`)]
    .filter((section) => !section.contains(block))
    .map((section) => {
      const heading = section.querySelector(HEADING_SELECTOR);
      const title = heading ? (heading.textContent || '').trim() : '';
      if (!title) return null;

      const base = section.id || heading.id || slugify(title) || 'section';
      let id = base;
      let counter = 2;
      while (used.has(id)
        || (document.getElementById(id) && document.getElementById(id) !== section)) {
        id = `${base}-${counter}`;
        counter += 1;
      }
      used.add(id);

      if (!section.id) section.id = id;
      // Moves the keyboard along with the scroll, not just the viewport.
      if (!section.hasAttribute('tabindex')) section.setAttribute('tabindex', '-1');

      return { id: section.id, title };
    })
    .filter(Boolean);
}

export default function decorate(block) {
  const label = readTextFromCell(block.children[0]?.firstElementChild) || 'In this section';

  const wrap = document.createElement('div');
  wrap.className = 'in-section-wrap';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn-in-section';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-haspopup', 'true');
  button.append(document.createTextNode(label));
  button.insertAdjacentHTML('beforeend', CHEVRON);

  const dropdown = document.createElement('div');
  dropdown.className = 'in-section-dropdown';
  dropdown.setAttribute('role', 'menu');
  dropdown.setAttribute('aria-label', label);

  wrap.append(button, dropdown);

  if (block.children[0]) moveInstrumentation(block.children[0], button);
  block.replaceChildren(wrap);

  const close = () => {
    dropdown.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
  };

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = dropdown.classList.toggle('open');
    button.setAttribute('aria-expanded', String(open));
  });

  document.addEventListener('click', (event) => {
    if (!wrap.contains(event.target)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  const main = block.closest('main');
  if (!main) return;

  const render = () => {
    const sections = collectSections(main, block);

    // Nothing has opted in. Hidden on the published page; in the editor it says
    // so, otherwise there is no way back into the dialog.
    if (!sections.length) {
      wrap.hidden = !block.hasAttribute('data-aue-resource');
      dropdown.replaceChildren();
      return;
    }
    wrap.hidden = false;

    dropdown.replaceChildren(...sections.map(({ id, title }) => {
      const link = document.createElement('a');
      link.className = 'section-link';
      link.href = `#${id}`;
      link.textContent = title;
      link.setAttribute('role', 'menuitem');

      link.addEventListener('click', (event) => {
        const target = document.getElementById(id);
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // The href alone would not move focus, because the jump is prevented.
        target.focus({ preventScroll: true });
        close();
      });

      return link;
    }));
  };

  render();

  // loadEager loads only the first section; the rest arrive afterwards, so a
  // menu built once would list whatever happened to exist at that moment.
  if (sectionsLoaded(main)) return;

  const observer = new MutationObserver(() => {
    render();
    if (sectionsLoaded(main)) observer.disconnect();
  });
  observer.observe(main, {
    attributes: true,
    attributeFilter: ['data-section-status'],
    subtree: true,
  });
}
