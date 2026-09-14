import { moveInstrumentation } from '../../scripts/scripts.js';
import { readLinkFromCell, readTextFromCell } from '../../scripts/utils.js';

/**
 * Sorts the block's rows by what they contain rather than by position.
 *
 * Six fields arrive as four cells. Two collapse into others by naming
 * convention: iconAlt becomes the icon image's alt attribute, and ctaLinkText
 * becomes the text inside the ctaLink anchor. Counting positions from the top
 * would read every field after the icon out of the wrong cell.
 */
function readRows(block) {
  const cells = [...block.children].map((row) => row.firstElementChild || row);

  let iconCell = null;
  let linkCell = null;
  const text = [];

  cells.forEach((cell) => {
    if (!iconCell && cell.querySelector('picture, img')) {
      iconCell = cell;
      return;
    }
    const raw = (cell.textContent || '').trim();
    if (!linkCell && (raw.startsWith('/content/') || cell.querySelector('a[href]'))) {
      linkCell = cell;
      return;
    }
    text.push(cell);
  });

  const [headingCell, descriptionCell] = text;
  return {
    iconCell, headingCell, descriptionCell, linkCell,
  };
}

export default function decorate(block) {
  const {
    iconCell, headingCell, descriptionCell, linkCell,
  } = readRows(block);

  const heading = readTextFromCell(headingCell);
  const description = readTextFromCell(descriptionCell);
  const ctaLink = readLinkFromCell(linkCell);
  // The collapsed anchor carries the label as its own text. Where AEM rendered
  // the path as bare text instead, there is no label to read.
  const anchorInCell = linkCell ? linkCell.querySelector('a[href]') : null;
  const ctaLabel = anchorInCell ? (anchorInCell.textContent || '').trim() : '';
  const picture = iconCell ? iconCell.querySelector('picture, img') : null;

  // isEmpty() in the Sites model - nothing authored at all.
  if (!heading && !description && !ctaLabel && !ctaLink && !picture) {
    block.textContent = '';
    if (block.hasAttribute('data-aue-resource')) {
      const placeholder = document.createElement('div');
      placeholder.className = 'content-header-placeholder';
      placeholder.textContent = 'Content Header: add a title.';
      block.append(placeholder);
    }
    return;
  }

  const section = document.createElement('section');
  section.className = 'content-header-wrap';
  // The Sites component top-aligned the icon only when a CTA was present.
  if (ctaLabel) section.classList.add('content-header-has-cta');

  if (picture) {
    const img = picture.tagName === 'IMG' ? picture : picture.querySelector('img');
    // The Sites markup used the title as the alt text; the authored iconAlt
    // wins where it was filled in.
    if (img && !img.getAttribute('alt')) img.setAttribute('alt', heading);
    if (img) {
      img.setAttribute('width', '86');
      img.setAttribute('height', '70');
    }
    picture.classList.add('content-header-icon');
    section.append(picture);
  }

  const textWrap = document.createElement('div');
  textWrap.className = 'content-header-text';

  const title = document.createElement('h1');
  title.textContent = heading;
  textWrap.append(title);

  if (description) {
    const para = document.createElement('p');
    para.textContent = description;
    textWrap.append(para);
  }

  // The Sites component gated the link on ctaLink, not on the label.
  if (ctaLink) {
    const linkWrap = document.createElement('div');
    const anchor = document.createElement('a');
    anchor.className = 'link-arrow';
    anchor.href = ctaLink;
    anchor.textContent = ctaLabel || heading;
    linkWrap.append(anchor);
    textWrap.append(linkWrap);
  }

  section.append(textWrap);

  if (headingCell) moveInstrumentation(headingCell, title);

  block.textContent = '';
  block.append(section);
}
