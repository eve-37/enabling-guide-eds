import { moveInstrumentation } from '../../scripts/scripts.js';
import { readLinkFromCell, readTextFromCell } from '../../scripts/utils.js';

/**
 * Five fields, four rows: imageAlt names the image field, so it becomes that
 * image's alt attribute instead of getting a row of its own.
 *
 * The description is rich text, so its cell is kept as an element rather than
 * read as a string - its markup is the content.
 */
function readRows(block) {
  const cells = [...block.children].map((row) => row.firstElementChild || row);

  let imageCell = null;
  let linkCell = null;
  const rest = [];

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
    rest.push(cell);
  });

  const [titleCell, descriptionCell] = rest;
  return {
    imageCell, titleCell, linkCell, descriptionCell,
  };
}

export default function decorate(block) {
  const {
    imageCell, titleCell, linkCell, descriptionCell,
  } = readRows(block);

  const title = readTextFromCell(titleCell);
  const link = readLinkFromCell(linkCell);
  const picture = imageCell ? imageCell.querySelector('picture, img') : null;

  if (!title && !link && !picture) {
    block.textContent = '';
    if (block.hasAttribute('data-aue-resource')) {
      const placeholder = document.createElement('div');
      placeholder.className = 'cta-teaser-placeholder';
      placeholder.textContent = 'CTA / Teaser: add an image, a title and a link.';
      block.append(placeholder);
    }
    return;
  }

  const card = document.createElement('div');
  card.className = 'cat-card';

  if (picture) {
    const img = picture.tagName === 'IMG' ? picture : picture.querySelector('img');
    if (img && !img.getAttribute('alt')) img.setAttribute('alt', title);
    card.append(picture);
  }

  const body = document.createElement('div');
  body.className = 'cat-body';

  const heading = document.createElement('h3');
  if (link) {
    const anchor = document.createElement('a');
    anchor.href = link;
    anchor.textContent = title;
    heading.append(anchor);
  } else {
    heading.textContent = title;
  }
  body.append(heading);

  // Rich text: move the authored nodes across rather than reading textContent,
  // which would flatten the author's bold, links and lists into plain text.
  if (descriptionCell) {
    while (descriptionCell.firstChild) body.append(descriptionCell.firstChild);
  }

  card.append(body);

  if (titleCell) moveInstrumentation(titleCell, heading);

  block.textContent = '';
  block.append(card);
}
