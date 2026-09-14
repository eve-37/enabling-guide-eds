import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

/**
 * Loads the header.
 *
 * The header is authored as an ordinary page (`/nav` by default, overridable with the
 * `nav` page metadata) holding a Site Header block. `loadFragment` decorates that page,
 * so the Site Header block has already run its own decoration by the time we get it —
 * this block only mounts the result. All markup and styling belong to
 * `blocks/site-header/`; do not decorate the fragment here.
 *
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  const navMeta = getMetadata('nav');
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';
  const fragment = await loadFragment(navPath);

  block.textContent = '';
  // loadFragment returns null when the page is missing or unpublished.
  if (!fragment) return;
  block.append(...fragment.childNodes);

  // The page already supplies the <header> banner landmark. Site Header emits a <header>
  // of its own (site-header.css targets that element, so it has to stay), which would
  // expose a second banner to screen readers — demote the nested ones.
  block.querySelectorAll('header').forEach((el) => el.setAttribute('role', 'none'));
}
