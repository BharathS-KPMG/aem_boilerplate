/* =============================================================
 * page-insights — side panel
 *
 * Opening and closing the panel, and moving between its screens:
 *   overview (four cards) ⇄ one detail screen per card.
 * The first time the panel opens, PageSpeed and Analytics start
 * loading. The SEO data loads when its screen is opened.
 * ============================================================= */

import { showPanelLoader } from './page-insights-overview.js';
import { loadPageSpeed, updatePageSpeedTabLoaders } from './page-insights-performance.js';
import { loadAnalytics } from './page-insights-analytics.js';
import { openSeo } from './page-insights-seo.js';

/**
 * @param {Element} root the block
 * @param {object} options
 * @param {AbortSignal} options.signal removes the page-level listeners with the panel
 * @param {() => boolean} options.canOpen false stops the panel from opening (no access)
 * @param {Promise<void>} [options.ready] resolves once the tab styles and date picker are set up
 */
export default function initSidebar(root, { signal, canOpen, ready }) {
  const sidebar = root.querySelector('#metricsSidebar');
  const ctaButton = root.querySelector('#showMetricsBtn');
  const header = root.querySelector('.sidebar-header');
  const headerLogo = root.querySelector('.header-left');
  const backButton = root.querySelector('#headerBackBtn');
  const overview = root.querySelector('#metricsOverview');
  const detailScreens = [...root.querySelectorAll('.metric-detail')];
  let dataRequested = false;

  /* ---------- screens ---------- */

  const showOverview = () => {
    overview.style.display = 'flex';
    detailScreens.forEach((screen) => {
      screen.classList.remove('active');
      screen.scrollTop = 0;
    });
    headerLogo.style.display = 'flex';
    backButton.style.display = 'none';
    header.classList.remove('has-back');
    updatePageSpeedTabLoaders();
  };

  const showDetail = (detailId) => {
    overview.style.display = 'none';
    detailScreens.forEach((screen) => {
      screen.classList.toggle('active', screen.id === detailId);
      if (screen.id === detailId) screen.scrollTop = 0;
    });
    headerLogo.style.display = 'none';
    backButton.style.display = 'inline-flex';
    header.classList.add('has-back');
    updatePageSpeedTabLoaders();

    // SEO loads when its screen opens (after it is drawn).
    if (detailId === 'seoDetail') requestAnimationFrame(openSeo);
  };

  /* ---------- open / close ---------- */

  const open = async () => {
    if (!canOpen()) return;
    // Usually done long before; only a click right after the button appears waits here.
    await ready;
    if (signal.aborted) return; // panel removed meanwhile (signed out)
    showOverview();
    sidebar.classList.add('open');

    if (!dataRequested) {
      dataRequested = true;
      showPanelLoader();
      loadPageSpeed();
      loadAnalytics();
    }
  };

  const close = () => {
    // Close first, so the panel can never stay stuck open if resetting the screens fails.
    sidebar.classList.remove('open');
    try {
      showOverview();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('page-insights: failed to reset panel on close', error);
    }
  };

  ctaButton.addEventListener('click', open);
  backButton.addEventListener('click', showOverview);

  // Delegated, so the × keeps working even if its node is re-rendered.
  sidebar.addEventListener('click', (event) => {
    if (event.target.closest('#closeBtn, .close-btn')) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar.classList.contains('open')) close();
  }, { signal });

  // Overview cards open their detail screen (click, Enter or Space).
  root.querySelectorAll('.metric-card[data-detail]').forEach((card) => {
    card.addEventListener('click', () => showDetail(card.dataset.detail));
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      showDetail(card.dataset.detail);
    });
  });

  /* ---------- CTA shrinks after the first scroll ---------- */

  const onFirstScroll = () => {
    if (window.scrollY <= 0) return;
    ctaButton.classList.add('is-collapsed');
    window.removeEventListener('scroll', onFirstScroll);
  };
  window.addEventListener('scroll', onFirstScroll, { passive: true, signal });

  showOverview();
}
