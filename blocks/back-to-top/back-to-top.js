import { moveInstrumentation } from '../../scripts/scripts.js';

/**
 * The Sites component pointed each share button at a PNG under
 * /content/dam/pocsite/global/. Those assets are not in this project, so the
 * icons are inline SVG instead of six broken images - and they inherit
 * currentColor, which the PNGs could only fake with a brightness/invert filter.
 */
const ICONS = {
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M10.6 13.4a1 1 0 0 1 0-1.4l2.8-2.8a3 3 0 0 1 4.2 4.2l-1.4 1.4a1 1 0 0 1-1.4-1.4l1.4-1.4a1 1 0 0 0-1.4-1.4L12 13.4a1 1 0 0 1-1.4 0Zm2.8-2.8a1 1 0 0 1 0 1.4l-2.8 2.8a1 1 0 0 0 1.4 1.4l1.4-1.4a1 1 0 0 1 1.4 1.4l-1.4 1.4a3 3 0 0 1-4.2-4.2l2.8-2.8a1 1 0 0 1 1.4 0Z"/></svg>',
  email: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm8 7.2L4.6 7h14.8L12 12.2ZM4 9.3V17h16V9.3l-7.4 5.2a1 1 0 0 1-1.2 0L4 9.3Z"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13.5 21v-8h2.7l.4-3h-3.1V8.2c0-.9.3-1.5 1.6-1.5H17V4.1c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3V10H7.6v3h2.7v8h3.2Z"/></svg>',
  telegram: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M21.7 4.3a1 1 0 0 0-1.1-.2L3.3 10.7a1 1 0 0 0 .1 1.9l3.9 1.2 1.5 4.6a1 1 0 0 0 1.7.3l2.1-2.2 3.8 2.8a1 1 0 0 0 1.6-.6l3-13.2a1 1 0 0 0-.3-1.2ZM9.6 14.1l-.5 2.4-.8-2.6 8-5.3-6.7 5.5Z"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.5 15.3L2 22l4.8-1.4A10 10 0 1 0 12 2Zm0 2a8 8 0 1 1-4.2 14.8l-.4-.2-2.6.7.7-2.5-.2-.4A8 8 0 0 1 12 4Zm-3 4.4c-.2 0-.5.1-.7.4-.2.3-.6.8-.6 1.6 0 .9.6 1.8.7 1.9.1.2 1.3 2.1 3.2 2.9 1.6.6 2 .5 2.3.5.4 0 1.2-.5 1.4-1 .2-.5.2-1 .1-1.1l-1.4-.7c-.2-.1-.4-.1-.5.1l-.6.7c-.1.1-.2.1-.4 0-.2-.1-.9-.4-1.6-1.1-.5-.5-.8-1-.9-1.2 0-.2 0-.3.1-.4l.4-.5c.1-.2.1-.3 0-.5l-.6-1.4c-.1-.4-.3-.4-.5-.4Z"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6.9 8.8H3.6V21h3.3V8.8ZM5.2 3a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8ZM21 21h-3.3v-6.4c0-1.6-.6-2.5-1.8-2.5-1 0-1.6.6-1.9 1.3-.1.2-.1.6-.1.9V21H10.6s.1-10.4 0-11.2h3.3v1.6c.4-.7 1.2-1.7 3-1.7 2.2 0 3.9 1.4 3.9 4.5V21Z"/></svg>',
};

/** Distance the page must scroll before the top button appears. */
const SCROLL_THRESHOLD = 300;

const SHARE_LABELS = {
  copy: 'Copy link',
  email: 'Share via email',
  facebook: 'Share on Facebook',
  telegram: 'Share on Telegram',
  whatsapp: 'Share on WhatsApp',
  linkedin: 'Share on LinkedIn',
};

const pageUrl = () => encodeURIComponent(window.location.href);
const pageTitle = () => encodeURIComponent(document.title);

const TARGETS = {
  facebook: () => `https://www.facebook.com/sharer/sharer.php?u=${pageUrl()}`,
  telegram: () => `https://t.me/share/url?url=${pageUrl()}&text=${pageTitle()}`,
  whatsapp: () => `https://wa.me/?text=${pageTitle()}%20${pageUrl()}`,
  linkedin: () => `https://www.linkedin.com/sharing/share-offsite/?url=${pageUrl()}`,
  email: () => `mailto:?subject=${pageTitle()}&body=${pageUrl()}`,
};

/** The multiselect arrives as comma-separated text in its cell. */
function readOptions(cell) {
  if (!cell) return [];
  return (cell.textContent || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function iconButton(className, picture) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  if (picture) {
    picture.classList.add(`${className}-icon`);
    const img = picture.tagName === 'IMG' ? picture : picture.querySelector('img');
    // Decorative: the button carries the accessible name.
    if (img) img.setAttribute('alt', '');
    button.append(picture);
  }
  return button;
}

export default function decorate(block) {
  const cells = [...block.children].map((row) => row.firstElementChild || row);
  const pictures = cells.filter((cell) => cell.querySelector('picture, img'));
  const optionCell = cells.find((cell) => !cell.querySelector('picture, img'));

  const scrollPicture = pictures[0] ? pictures[0].querySelector('picture, img') : null;
  const sharePicture = pictures[1] ? pictures[1].querySelector('picture, img') : null;
  const options = readOptions(optionCell);

  const scrollButton = iconButton('scroll-top-btn', scrollPicture);
  scrollButton.setAttribute('aria-label', 'Scroll to top');
  scrollButton.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  if (cells[0]) moveInstrumentation(cells[0], scrollButton);

  block.textContent = '';
  block.append(scrollButton);

  window.addEventListener('scroll', () => {
    scrollButton.classList.toggle('visible', window.scrollY > SCROLL_THRESHOLD);
  }, { passive: true });

  // hasSocialMediaItems() in the Sites model - no options, no share button.
  if (!options.length) return;

  const container = document.createElement('div');
  container.className = 'scroll-top-share-container';

  const shareButton = iconButton('scroll-top-share-btn', sharePicture);
  shareButton.setAttribute('aria-label', 'Share this page');

  const popup = document.createElement('div');
  popup.className = 'share-popup';
  popup.setAttribute('role', 'menu');
  popup.setAttribute('aria-label', 'Share options');

  options.forEach((option) => {
    if (!ICONS[option]) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'share-opt';
    button.dataset.share = option;
    button.setAttribute('role', 'menuitem');
    button.setAttribute('aria-label', SHARE_LABELS[option]);
    button.title = SHARE_LABELS[option];
    button.innerHTML = ICONS[option];
    popup.append(button);
  });

  popup.addEventListener('click', (event) => {
    event.stopPropagation();
    const option = event.target.closest('.share-opt');
    if (!option) return;

    const action = option.dataset.share;

    if (action === 'copy') {
      // Not available on an insecure origin, and the user may have denied it.
      navigator.clipboard?.writeText(window.location.href)
        .then(() => {
          option.classList.add('copied');
          setTimeout(() => option.classList.remove('copied'), 1500);
        })
        .catch(() => {
          option.classList.add('copy-failed');
          setTimeout(() => option.classList.remove('copy-failed'), 1500);
        });
      return;
    }

    if (action === 'email') {
      window.location.href = TARGETS.email();
      return;
    }

    if (TARGETS[action]) {
      window.open(TARGETS[action](), '_blank', 'noopener,noreferrer');
    }
  });

  container.append(shareButton, popup);
  block.append(container);
}
