// AEM publish tier for this program/environment. Confirmed against the
// deployed page details endpoint, not inferred.
const AEM_PUBLISH_ORIGIN = 'https://publish-p144127-e1488012.adobeaemcloud.com';

/**
 * Returns the origin to prefix onto AEM API calls.
 *
 * On aem.page, aem.live and localhost the block has to call AEM
 * cross-origin, which is what the CORS policy on publish allows. On a
 * production domain the CDN in front should route /content/enablingguide-api*
 * to publish, so a relative URL stays same-origin and skips CORS entirely.
 */

export function getBasePathBasedOnEnv() {
  const { hostname } = window.location;

  const isPreview = hostname.endsWith('.aem.page')
    || hostname.endsWith('.aem.live')
    || hostname === 'localhost'
    || hostname === '127.0.0.1';

  return isPreview ? AEM_PUBLISH_ORIGIN : '';
}

/** Site root in AEM. Everything below it is served by EDS one level up. */
const AEM_SITE_ROOT = '/content/enabling-guide-eds';

/**
 * Turns an authored aem-content value into a URL that works on the EDS site.
 *
 * The Universal Editor stores the AEM path (/content/enabling-guide-eds/foo)
 * while EDS serves the page at /foo, so an href used verbatim 404s. The AEM
 * servlets do this server-side with their edsPathPrefixes config; a block that
 * reads a pathfield directly has to do it here.
 *
 * Anything already absolute, external, an anchor or a mailto is returned as it
 * came in.
 */
export function toEdsPath(value) {
  const raw = (value || '').trim();
  if (!raw) return '';
  if (/^(https?:|mailto:|tel:|#|\/\/)/.test(raw)) return raw;

  let path = raw.replace(/\.html$/, '');
  if (path.startsWith(AEM_SITE_ROOT)) {
    path = path.slice(AEM_SITE_ROOT.length) || '/';
  }
  return path;
}

/**
 * Reads a link out of a block cell.
 *
 * An aem-content field lands in the DOM either as an anchor, when AEM resolved
 * it to a link, or as the bare path in a text node - both shapes occur, so both
 * are handled. A /content/dam value means the cell being read is the wrong one,
 * not that the author picked an asset as a page, so it is rejected.
 */
export function readLinkFromCell(cell) {
  if (!cell) return '';

  const anchor = cell.querySelector('a[href]');
  const raw = (anchor ? anchor.getAttribute('href') : cell.textContent || '').trim();
  if (!raw || raw.startsWith('/content/dam')) return '';

  return toEdsPath(raw);
}

/** The text of a cell, or an empty string when the author left it blank. */
export function readTextFromCell(cell) {
  return cell ? (cell.textContent || '').trim() : '';
}
