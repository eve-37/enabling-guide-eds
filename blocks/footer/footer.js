import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

/**
 * Loads the footer.
 *
 * The footer is authored as an ordinary page (`/footer` by default, overridable with the
 * `footer` page metadata) holding a Site Footer block. `loadFragment` decorates that page,
 * so the Site Footer block has already run its own decoration by the time we get it —
 * this block only mounts the result. All markup and styling belong to
 * `blocks/site-footer/`; do not decorate the fragment here.
 *
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  const footerMeta = getMetadata('footer');
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';
  const fragment = await loadFragment(footerPath);

  block.textContent = '';
  // loadFragment returns null when the page is missing or unpublished.
  if (!fragment) return;
  block.append(...fragment.childNodes);

  // The page already supplies the <footer> contentinfo landmark. Site Footer emits a
  // <footer> of its own, which would expose a second contentinfo to screen readers —
  // demote the nested ones.
  block.querySelectorAll('footer').forEach((el) => el.setAttribute('role', 'none'));
}
