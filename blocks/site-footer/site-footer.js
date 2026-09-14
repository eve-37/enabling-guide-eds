import { moveInstrumentation } from '../../scripts/scripts.js';
import { readTextFromCell, toEdsPath } from '../../scripts/utils.js';

/**
 * The parent's own rows carry the copyright, the lead-in text and the logo. A
 * link item's row has a URL and a label, so it is told apart by having more
 * than one cell or by holding an anchor.
 */
function isLinkRow(row) {
  if (row.children.length > 1) return true;
  return Boolean(row.querySelector('a[href]'));
}

function buildLink(row) {
  const cells = [...row.children];
  const anchorCell = cells[0];
  const anchor = anchorCell ? anchorCell.querySelector('a[href]') : null;

  const href = anchor
    ? anchor.getAttribute('href')
    : readTextFromCell(anchorCell);
  const label = anchor
    ? (anchor.textContent || '').trim()
    : readTextFromCell(cells[1]);
  const grouped = cells.some((cell) => (cell.textContent || '').trim() === 'grouped');

  if (!href && !label) return null;

  const element = document.createElement('a');
  element.href = toEdsPath(href) || '#';
  element.textContent = label || href;

  // Anything off-site opens in a new tab and gets the usual rel guard.
  if (/^https?:/i.test(element.getAttribute('href'))) {
    element.target = '_blank';
    element.rel = 'noopener noreferrer';
  }

  return { element, grouped };
}

export default function decorate(block) {
  const rows = [...block.children];
  const linkRows = rows.filter(isLinkRow);
  const ownRows = rows.filter((row) => !isLinkRow(row));

  const logoRow = ownRows.find((row) => row.querySelector('picture, img'));
  const textRows = ownRows.filter((row) => row !== logoRow);

  const copyright = readTextFromCell(textRows[0] ? textRows[0].firstElementChild : null);
  const poweredBy = readTextFromCell(textRows[1] ? textRows[1].firstElementChild : null);
  const picture = logoRow ? logoRow.querySelector('picture, img') : null;

  const footer = document.createElement('footer');
  const inner = document.createElement('div');
  inner.className = 'footer-inner';

  if (copyright) {
    const span = document.createElement('span');
    span.className = 'copyright';
    span.textContent = copyright;
    if (textRows[0]) moveInstrumentation(textRows[0], span);
    inner.append(span);
  }

  const links = document.createElement('nav');
  links.className = 'footer-links';
  links.setAttribute('aria-label', 'Footer');

  // Consecutive grouped links share one tight row, which is how Site Map,
  // Terms Of Use and Privacy Policy sat together.
  let group = null;

  linkRows.forEach((row) => {
    const built = buildLink(row);
    if (!built) return;

    moveInstrumentation(row, built.element);

    if (built.grouped) {
      if (!group) {
        group = document.createElement('div');
        group.className = 'footer-links-group';
        links.append(group);
      }
      group.append(built.element);
      return;
    }

    group = null;
    links.append(built.element);
  });

  if (links.children.length) inner.append(links);

  if (picture || poweredBy) {
    const brand = document.createElement('div');
    brand.className = 'footer-brand';

    if (poweredBy) {
      const span = document.createElement('span');
      span.className = 'powered';
      span.textContent = poweredBy;
      brand.append(span);
    }

    if (picture) {
      const img = picture.tagName === 'IMG' ? picture : picture.querySelector('img');
      if (img && !img.getAttribute('alt')) img.setAttribute('alt', 'Site logo');
      picture.classList.add('footer-logo');
      brand.append(picture);
    }

    inner.append(brand);
  }

  if (!inner.children.length) {
    if (block.hasAttribute('data-aue-resource')) {
      const placeholder = document.createElement('p');
      placeholder.className = 'site-footer-placeholder';
      placeholder.textContent = 'Site Footer: add a copyright line, a logo or a Footer Link.';
      block.append(placeholder);
    }
    return;
  }

  footer.append(inner);
  block.replaceChildren(footer);
}
