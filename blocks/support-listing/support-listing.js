import { moveInstrumentation } from '../../scripts/scripts.js';
import { readLinkFromCell, readTextFromCell } from '../../scripts/utils.js';

/**
 * Reads one card's cells by content.
 *
 * Six fields arrive as four cells - imageAlt collapses into the image and
 * ctaLinkText into the link - so the two text cells that remain are the title
 * and the description, in model order.
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
    text.push(cell);
  });

  const anchor = linkCell ? linkCell.querySelector('a[href]') : null;

  return {
    picture: imageCell ? imageCell.querySelector('picture, img') : null,
    title: readTextFromCell(text[0]),
    description: readTextFromCell(text[1]),
    link: readLinkFromCell(linkCell),
    linkText: anchor ? (anchor.textContent || '').trim() : '',
  };
}

function buildCard(row) {
  const {
    picture, title, description, link, linkText,
  } = readCard(row);

  const card = document.createElement('li');
  card.className = 'info-card';

  const textWrap = document.createElement('div');
  textWrap.className = 'info-card-text';

  const heading = document.createElement('h3');
  heading.textContent = title;
  textWrap.append(heading);

  if (description) {
    const para = document.createElement('p');
    para.textContent = description;
    textWrap.append(para);
  }
  card.append(textWrap);

  if (picture) {
    const img = picture.tagName === 'IMG' ? picture : picture.querySelector('img');
    if (img && !img.getAttribute('alt')) img.setAttribute('alt', title);
    picture.classList.add('info-card-icon');
    card.append(picture);
  }

  // The Sites component required both a label and a link before rendering the
  // button, and opened it in a new tab.
  if (link && linkText) {
    const cta = document.createElement('a');
    cta.className = 'btn-purple';
    cta.href = link;
    cta.textContent = linkText;
    cta.target = '_blank';
    cta.rel = 'noopener noreferrer';
    card.append(cta);
  }

  return card;
}

export default function decorate(block) {
  const rows = [...block.children];

  if (!rows.length) {
    // Leaves the block's own children alone - wiping them would remove the
    // authored items from the Universal Editor's content tree.
    if (block.hasAttribute('data-aue-resource')) {
      const placeholder = document.createElement('p');
      placeholder.className = 'support-listing-placeholder';
      placeholder.textContent = 'Support Listing: add a Support Card.';
      block.append(placeholder);
    }
    return;
  }

  const grid = document.createElement('ul');
  grid.className = 'info-grid';

  rows.forEach((row) => {
    const card = buildCard(row);
    // Per item, so each card stays individually selectable in the editor.
    moveInstrumentation(row, card);
    grid.append(card);
  });

  block.replaceChildren(grid);
}
