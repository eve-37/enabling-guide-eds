import { moveInstrumentation } from '../../scripts/scripts.js';
import { readTextFromCell } from '../../scripts/utils.js';

const DEFAULT_LAYOUT = '6-6';
const GRID_COLUMNS = 12;

/**
 * Turns "8-4" into [8, 4]. Anything unparseable falls back to the Sites
 * component's own default of two equal halves.
 */
function parseLayout(value) {
  const widths = (value || '')
    .split('-')
    .map((part) => Number.parseInt(part, 10))
    .filter((width) => Number.isFinite(width) && width > 0 && width <= GRID_COLUMNS);

  return widths.length ? widths : DEFAULT_LAYOUT.split('-').map(Number);
}

/**
 * The layout row is the parent's only own field, so it is the one row that
 * holds nothing but a layout string. Column items are everything else.
 */
function isLayoutRow(row) {
  return /^\d+(-\d+)*$/.test((row.textContent || '').trim());
}

export default function decorate(block) {
  const rows = [...block.children];
  const layoutRow = rows.find(isLayoutRow);
  const columnRows = rows.filter((row) => row !== layoutRow);

  const widths = parseLayout(
    layoutRow ? readTextFromCell(layoutRow.firstElementChild || layoutRow) : '',
  );

  if (!columnRows.length) {
    if (block.hasAttribute('data-aue-resource')) {
      const placeholder = document.createElement('p');
      placeholder.className = 'column-control-placeholder';
      placeholder.textContent = 'Column Control: add a Column.';
      block.append(placeholder);
    }
    return;
  }

  const layout = document.createElement('div');
  layout.className = 'column-layout';

  columnRows.forEach((row, index) => {
    const item = document.createElement('div');
    item.className = 'column-layout-item';

    // More columns than the layout describes: share the remaining width evenly
    // rather than dropping them off the grid entirely.
    const width = widths[index] ?? Math.max(1, Math.floor(GRID_COLUMNS / columnRows.length));
    item.style.gridColumn = `span ${Math.min(width, GRID_COLUMNS)}`;

    // The authored blocks inside this column move across as they are.
    while (row.firstChild) item.append(row.firstChild);

    moveInstrumentation(row, item);
    layout.append(item);
  });

  block.replaceChildren(layout);
}
