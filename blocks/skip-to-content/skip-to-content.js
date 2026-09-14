import { toEdsPath } from '../../scripts/utils.js';

const DEFAULT_SMALL = 14;
const DEFAULT_MEDIUM = 16;
const DEFAULT_LARGE = 20;

/** Headings the Page Outline lists. */
const HEADING_SELECTOR = 'main h1, main h2';

/**
 * A key-value block renders one row per field, as key then value, so the
 * settings are read by name.
 *
 * Twenty-two fields could never be read positionally, and the block is declared
 * key-value in its definition partly for that reason - it also exempts the model
 * from the four-cell limit, which is meant for content blocks rather than
 * settings.
 */
function readSettings(block) {
  const settings = {};
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    if (cells.length < 2) return;
    const key = (cells[0].textContent || '').trim();
    if (key) settings[key] = (cells[1].textContent || '').trim();
  });
  return settings;
}

const isOn = (value) => value === 'true';
const size = (value, fallback) => Number.parseInt(value, 10) || fallback;

function makeLink(href, label, newTab) {
  const anchor = document.createElement('a');
  anchor.href = toEdsPath(href) || '#';
  anchor.textContent = label;
  anchor.setAttribute('role', 'menuitem');
  if (newTab === '_blank') {
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
  }
  return anchor;
}

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Lists the page's own headings, giving each a stable id to jump to.
 *
 * Runs after the sections have loaded, because EDS loads all but the first one
 * lazily and an outline built at decorate time would list only the top of the
 * page.
 */
function buildOutline(menu) {
  menu.querySelectorAll('[data-generated="true"]').forEach((link) => link.remove());

  const used = new Set();

  document.querySelectorAll(HEADING_SELECTOR).forEach((heading) => {
    const label = (heading.textContent || '').trim();
    if (!label) return;

    const base = heading.id || slugify(label);
    let id = base;
    let counter = 2;
    while (used.has(id)
      || (document.getElementById(id) && document.getElementById(id) !== heading)) {
      id = `${base}-${counter}`;
      counter += 1;
    }
    used.add(id);

    if (!heading.id) heading.id = id;
    // Makes the heading focusable so the jump moves the keyboard, not just the
    // scroll position.
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');

    const link = makeLink(`#${id}`, label, '');
    link.dataset.generated = 'true';
    menu.append(link);
  });
}

function sectionsLoaded(main) {
  return [...main.querySelectorAll(':scope > .section')]
    .every((section) => section.dataset.sectionStatus === 'loaded');
}

export default function decorate(block) {
  const settings = readSettings(block);

  const bar = document.createElement('div');
  bar.className = 'access-bar';

  const left = document.createElement('div');
  left.className = 'access-left';
  const right = document.createElement('div');
  right.className = 'access-right';

  let menu = null;

  if (isOn(settings.enableSkipTo)) {
    const wrap = document.createElement('div');
    wrap.className = 'skip-to';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'skip-to-toggle';
    toggle.textContent = 'Skip To…';
    toggle.setAttribute('aria-haspopup', 'true');
    toggle.setAttribute('aria-expanded', 'false');

    menu = document.createElement('div');
    menu.className = 'skip-to-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Skip to section');

    if (isOn(settings.enableMainContent)) {
      menu.append(makeLink(settings.mainContentUrl, 'Main Content', settings.mainContentNewTab));
    }
    if (isOn(settings.enableSearch)) {
      menu.append(makeLink(settings.searchUrl, 'Search', settings.searchNewTab));
    }
    if (isOn(settings.enablePageOutline)) {
      const label = document.createElement('span');
      label.className = 'outline-label';
      label.setAttribute('role', 'presentation');
      label.textContent = 'Page Outline';
      menu.append(label);
    }

    wrap.append(toggle, menu);
    left.append(wrap);

    const closeMenu = () => {
      wrap.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    };

    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = wrap.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });

    menu.addEventListener('click', closeMenu);
    document.addEventListener('click', (event) => {
      if (!wrap.contains(event.target)) closeMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });
  }

  if (isOn(settings.enableSiteMap)) {
    const siteMap = makeLink(settings.siteMapUrl, 'Site Map', settings.siteMapNewTab);
    siteMap.removeAttribute('role');
    left.append(siteMap);
  }

  if (isOn(settings.enableTextSize)) {
    const label = document.createElement('span');
    label.className = 'text-size-label';
    label.textContent = 'Text Size:';

    const group = document.createElement('div');
    group.className = 'font-btns';

    const sizes = [
      {
        key: 'small', text: 'A-', title: 'Small text', px: size(settings.fontSizeSmall, DEFAULT_SMALL),
      },
      {
        key: 'medium', text: 'A', title: 'Normal text', px: size(settings.fontSizeMedium, DEFAULT_MEDIUM),
      },
      {
        key: 'large', text: 'A+', title: 'Large text', px: size(settings.fontSizeLarge, DEFAULT_LARGE),
      },
    ];

    const buttons = sizes.map(({
      key, text, title, px,
    }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'font-btn';
      if (key === 'medium') button.classList.add('active');
      button.title = title;
      button.textContent = text;
      button.setAttribute('aria-label', title);
      button.dataset.fontSize = String(px);
      group.append(button);
      return button;
    });

    buttons.forEach((button) => button.addEventListener('click', () => {
      document.documentElement.style.fontSize = `${button.dataset.fontSize}px`;
      buttons.forEach((other) => other.classList.toggle('active', other === button));
    }));

    right.append(label, group);
  }

  if (isOn(settings.enableContrast)) {
    const contrast = document.createElement('button');
    contrast.type = 'button';
    contrast.className = 'contrast-btn';
    contrast.textContent = 'Contrast';
    contrast.setAttribute('aria-pressed', 'false');
    contrast.addEventListener('click', () => {
      const on = document.body.classList.toggle('high-contrast');
      contrast.setAttribute('aria-pressed', String(on));
    });
    right.append(contrast);
  }

  if (isOn(settings.enableAccessibility)) {
    const link = makeLink(settings.accessibilityUrl, 'Accessibility', settings.accessibilityNewTab);
    link.removeAttribute('role');
    right.append(link);
  }

  if (!left.children.length && !right.children.length) {
    block.textContent = '';
    if (block.hasAttribute('data-aue-resource')) {
      const placeholder = document.createElement('p');
      placeholder.className = 'skip-to-content-placeholder';
      placeholder.textContent = 'Skip To Content: everything is switched off.';
      block.append(placeholder);
    }
    return;
  }

  bar.append(left, right);
  block.replaceChildren(bar);

  // The Sites component set the medium size on every page load, which resets a
  // reader's own browser zoom preference. Left out deliberately - the controls
  // still work, they just no longer override the default.

  if (!menu || !isOn(settings.enablePageOutline)) return;

  const main = block.closest('main') || document.querySelector('main');
  if (!main) return;

  buildOutline(menu);
  if (sectionsLoaded(main)) return;

  const observer = new MutationObserver(() => {
    buildOutline(menu);
    if (sectionsLoaded(main)) observer.disconnect();
  });
  observer.observe(main, {
    attributes: true,
    attributeFilter: ['data-section-status'],
    subtree: true,
  });
}
