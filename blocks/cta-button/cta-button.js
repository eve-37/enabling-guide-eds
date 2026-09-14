import { moveInstrumentation } from '../../scripts/scripts.js';
import { readLinkFromCell, readTextFromCell } from '../../scripts/utils.js';

/**
 * The Sites component delegated to a shared buttons.html template. Its markup is
 * gone, but the SCSS shows exactly what it produced: an anchor carrying
 * .btn-purple, optionally wrapped in a .btn-center. That is what is rebuilt here.
 *
 * Reading all four cells positionally is safe in this block: there is no image
 * field, so the model's field count and the row count agree. Blocks that pair an
 * image with an Alt field cannot do this - the Alt gets no row of its own.
 */
export default function decorate(block) {
  const rows = [...block.children];
  const cellOf = (row) => (row ? row.firstElementChild || row : null);

  const labelCell = cellOf(rows[0]);
  const label = readTextFromCell(labelCell);
  const link = readLinkFromCell(cellOf(rows[1]));
  const target = readTextFromCell(cellOf(rows[2]));
  const align = readTextFromCell(cellOf(rows[3]));

  // The Sites component required both a title and a link, and rendered an
  // author-only placeholder when either was missing.
  if (!label || !link) {
    block.textContent = '';
    if (block.hasAttribute('data-aue-resource')) {
      const placeholder = document.createElement('div');
      placeholder.className = 'cta-button-placeholder';
      placeholder.textContent = 'CTA Button: set both a label and a link.';
      block.append(placeholder);
    }
    return;
  }

  const anchor = document.createElement('a');
  anchor.className = 'btn-purple';
  anchor.href = link;
  anchor.textContent = label;

  if (target === '_blank') {
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
  }

  const wrapper = document.createElement('div');
  if (align === 'center') wrapper.classList.add('btn-center');
  wrapper.append(anchor);

  if (labelCell) moveInstrumentation(labelCell, anchor);

  block.textContent = '';
  block.append(wrapper);
}
