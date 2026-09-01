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

// eslint-disable-next-line import/prefer-default-export
export function getBasePathBasedOnEnv() {
  const { hostname } = window.location;

  const isPreview = hostname.endsWith('.aem.page')
    || hostname.endsWith('.aem.live')
    || hostname === 'localhost'
    || hostname === '127.0.0.1';

  return isPreview ? AEM_PUBLISH_ORIGIN : '';
}
