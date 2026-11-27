import { loadCSS } from './aem.js';
import { canViewPageInsights, watchAccess } from '../blocks/page-insights/page-insights-auth.js';

/* The page-insights bundle is heavy (~100 KB JS + ~80 KB CSS, plus the
 * jQuery / moment / daterangepicker dependencies it pulls in), so it is
 * kept completely out of the eager, lazy and LCP windows: nothing is
 * fetched, parsed or inserted into the DOM until the page has fully loaded
 * AND the main thread is idle. The button itself only needs
 * page-insights.css + page-insights.js; the rest loads after it is drawn.
 *
 * Page Insights is only for signed-in users with an allowed Keycloak role
 * (see page-insights-auth.js), so for everyone else nothing but the tiny
 * page-insights-auth.js is downloaded. */

/** Resolves once the page has fully loaded (window 'load' already fired). */
function whenPageLoaded() {
  return new Promise((resolve) => {
    if (document.readyState === 'complete') {
      resolve();
      return;
    }
    window.addEventListener('load', resolve, { once: true });
  });
}

/** Resolves on the next idle period, so nothing here competes with
 * post-load work (analytics, delayed phase, user interactions). */
function whenIdle(timeout = 3000) {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(resolve, { timeout });
    } else {
      window.setTimeout(resolve, 200);
    }
  });
}

function isMounted(doc) {
  return Boolean(doc.getElementById('pageInsightsMain') || doc.querySelector('.page-insights'));
}

/** Downloads the block and inserts it at the end of <body>. */
async function mountPageInsights(doc) {
  // Another call may have mounted the block meanwhile.
  if (isMounted(doc)) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'page-insights';
  /* Zero-footprint host: the block's own elements (CTA + sidebar) are
     position:fixed, so the wrapper never needs to occupy space. Pinning it
     out of flow at 0x0 guarantees the late insertion cannot shift any
     existing content, i.e. it can never contribute to CLS.
     z-index:10 keeps the CTA below the site header and its menus; while
     the panel is open, page-insights.css lifts this host above them
     (#pageInsightsMain:has(.sidebar.open)) so the panel covers the header. */
  wrapper.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:10;';

  try {
    // Fetch CSS and JS in parallel, but only attach the markup once the
    // stylesheet has landed — otherwise the unstyled sidebar markup would
    // paint over the page for a frame.
    const [, mod] = await Promise.all([
      loadCSS(`${window.hlx.codeBasePath}/blocks/page-insights/page-insights.css`),
      import('../blocks/page-insights/page-insights.js'),
    ]);

    // Build the markup in an idle moment, not in the middle of a tap or click (INP).
    await whenIdle();
    doc.body.appendChild(wrapper);
    if (mod.default) await mod.default(wrapper);
  } catch (error) {
    wrapper.remove();
    // eslint-disable-next-line no-console
    console.error('Failed to load page-insights', error);
  }
}

/**
 * Mounts the page-insights block globally so the floating "Page Insights"
 * CTA (and the sidebar it opens on the left) appears on every page, without
 * needing to be authored into content. Mirrors the pattern used by
 * fixed-color-partner-loader.js.
 *
 * Loading is deferred until after the load event + an idle slice, and the
 * markup is only inserted once its stylesheet has arrived and the main
 * thread is idle again, so the block can contribute to neither LCP/CLS (it
 * is inserted late, and out of flow) nor TBT/INP.
 *
 * Only for signed-in users with an allowed role: if there is none yet, it
 * waits for the header to report a sign-in (its Keycloak check may still be
 * running). Once mounted, the block itself hides the panel again on sign-out.
 * @param {Document} doc
 */
export default async function loadPageInsights(doc) {
  if (isMounted(doc)) return;

  await whenPageLoaded();
  await whenIdle();

  if (canViewPageInsights()) {
    await mountPageInsights(doc);
    return;
  }

  const stopWatching = watchAccess((canView) => {
    if (!canView) return;
    stopWatching();
    mountPageInsights(doc);
  });
}
