/* =============================================================
 * page-insights block
 *
 * A floating "Page Insights" button that opens a side panel with
 * Analytics, Performance, Accessibility and SEO data for the
 * current page. Only signed-in users with an allowed Keycloak role
 * (app-IT, app-brand, app-marketing) see it.
 *
 * Usually mounted on every page by scripts/page-insights-loader.js
 * (after the page has loaded); it also works when
 * authored as a block.
 *
 * Files in this folder (more in README.md):
 *   page-insights.js                this file: sign-in / role gate, loads CSS
 *                                   and libraries, builds the panel
 *   page-insights-auth.js           is the user signed in with an allowed role?
 *   page-insights-api.js            ALL API calls (PageSpeed, Analytics, SEO)
 *   page-insights-markup.js         the HTML of the button and the panel
 *   page-insights-sidebar.js        open / close / switch screens
 *   page-insights-overview.js       overview: loader, warnings, status pill
 *   page-insights-performance.js    Performance tab + PageSpeed loading
 *   page-insights-accessibility.js  Accessibility tab
 *   page-insights-analytics.js      Page Analytics tab
 *   page-insights-seo.js            SEO Insights tab
 *   page-insights-state.js          data shared by the files above
 *   page-insights-constants.js      images, limits, fixed values
 *   page-insights-helpers.js        formatting and the score gauge
 * ============================================================= */

import { loadCSS, loadScript } from '../../scripts/aem.js';
import { canViewPageInsights, watchAccess } from './page-insights-auth.js';
import buildMarkup from './page-insights-markup.js';
import { resetState } from './page-insights-state.js';
import { initOverview } from './page-insights-overview.js';
import { initPerformance } from './page-insights-performance.js';
import { initAccessibility } from './page-insights-accessibility.js';
import { initAnalytics } from './page-insights-analytics.js';
import { initSeo } from './page-insights-seo.js';
import initSidebar from './page-insights-sidebar.js';

/* Feature stylesheets (page-insights.css itself is loaded by EDS or the
 * loader). Order matters: the date picker's base skin must come before
 * page-insights-analytics.css, which restyles it. */
const FEATURE_STYLES = ['daterangepicker', 'accessibility', 'analytics', 'performance', 'seo']
  .map((name) => new URL(`./page-insights-${name}.css`, import.meta.url).href);

/* Libraries for the date pickers: jQuery + daterangepicker (Page Analytics)
 * and moment (Page Analytics + SEO). */
const LIBRARIES = {
  jquery: 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js',
  moment: 'https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.30.1/moment.min.js',
  daterangepicker: 'https://cdn.jsdelivr.net/npm/daterangepicker@3.1.0/daterangepicker.js',
};

async function loadLibraries() {
  // Use the site's own jQuery when scripts.js offers it, so it is not loaded twice.
  let jqueryReady = null;
  if (!window.jQuery) {
    jqueryReady = window.loadJQuery ? window.loadJQuery() : loadScript(LIBRARIES.jquery);
  }
  await Promise.all([
    jqueryReady,
    window.moment ? null : loadScript(LIBRARIES.moment),
  ]);
  // daterangepicker is a jQuery plugin that also needs moment, so it loads last.
  if (!window.jQuery.fn.daterangepicker) await loadScript(LIBRARIES.daterangepicker);
}

/** Loads the tabs' stylesheets and the date picker libraries. Never rejects:
 * a file that fails to load only affects the tab that needs it. */
function loadPanelExtras() {
  return Promise.allSettled([...FEATURE_STYLES.map((href) => loadCSS(href)), loadLibraries()])
    .then((results) => results.forEach(({ status, reason }) => {
      // eslint-disable-next-line no-console
      if (status === 'rejected') console.error('page-insights: could not load', reason);
    }));
}

/**
 * Builds the button + panel inside the block.
 * @param {Element} block
 * @param {() => boolean} canOpen checked each time the button is clicked
 * @returns {Promise<() => void>} removes the panel again
 */
async function buildPanel(block, canOpen) {
  // Aborting this removes page-level listeners and cancels running requests.
  const controller = new AbortController();
  const { signal } = controller;

  // Only the open panel needs these, so the button is drawn without waiting for them.
  const extras = loadPanelExtras();

  resetState();
  block.innerHTML = buildMarkup();
  initOverview(block);
  initAccessibility(block);
  initPerformance(block, signal);
  initSeo(block, signal);

  // The Page Analytics date picker needs jQuery, moment and daterangepicker.
  const ready = extras
    .then(() => {
      if (!signal.aborted) initAnalytics(block, signal);
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('page-insights: could not set up Page Analytics', error);
    });

  initSidebar(block, { signal, canOpen, ready });

  return () => {
    controller.abort();
    block.textContent = '';
  };
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default async function decorate(block) {
  if (block.dataset.piDecorated === 'true') return;
  block.dataset.piDecorated = 'true';
  // The CSS is scoped to this id.
  block.id = 'pageInsightsMain';
  block.textContent = '';

  let removePanel = null; // set while the panel is shown
  let building = null; // set while the panel is being built

  const hidePanel = () => {
    if (!removePanel) return;
    removePanel();
    removePanel = null;
  };

  // Checked on every button click: signing out in this tab fires no event.
  const canOpen = () => {
    if (canViewPageInsights()) return true;
    hidePanel();
    return false;
  };

  const showPanel = () => {
    if (removePanel || building) return building;
    building = buildPanel(block, canOpen)
      .then((remove) => {
        removePanel = remove;
        if (!canViewPageInsights()) hidePanel(); // signed out while it was loading
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('page-insights: could not build the panel', error);
      })
      .finally(() => {
        building = null;
      });
    return building;
  };

  // Only signed-in users with an allowed role see the panel. Follow the header's sign-in state.
  watchAccess((canView) => (canView ? showPanel() : hidePanel()));
  if (canViewPageInsights()) await showPanel();
}
