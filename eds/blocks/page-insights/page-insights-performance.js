/* =============================================================
 * page-insights — Performance tab (+ PageSpeed loading)
 *
 * loadPageSpeed() asks Google PageSpeed for the page (desktop and
 * mobile) and fills both the Performance tab and the Accessibility
 * tab. The request takes about a minute, so both tabs show a
 * progress bar while it runs, and an error box with "Try Again"
 * when it fails.
 *
 * The Performance tab shows the score gauge and the Core Web Vitals
 * list for the device picked in its Desktop / Mobile toggle.
 * ============================================================= */

import { fetchPageSpeedReport } from './page-insights-api.js';
import { PERFORMANCE_METRICS, STATUS_ICONS } from './page-insights-constants.js';
import { drawGauge, rateMetric, toDisplayUnits } from './page-insights-helpers.js';
import { getPageSpeedMetrics, state } from './page-insights-state.js';
import {
  revealCriticalMetrics, setCriticalMessage, showCriticalMetricsLoading,
} from './page-insights-overview.js';
import { getAccessibilityMessage, renderAccessibility } from './page-insights-accessibility.js';

/* The progress bar fills up over this many seconds (PageSpeed takes about a minute). */
const PROGRESS_SECONDS = 60;

let ui = {};
let progressBars = [];
let panelSignal = null; // aborted when the panel is removed (user signed out)

/* ---------- progress bar ---------- */

/**
 * Controls one progress bar (.status with a .bar inside).
 * start() fills it over totalSeconds; finish() runs it to 100% and hides it;
 * stop() hides it straight away.
 */
function createProgressBar(statusEl, bar, totalSeconds) {
  let timer = null;
  let finishing = false;

  const setProgress = (percent) => {
    const clamped = Math.max(0, Math.min(100, percent));
    bar.style.width = `${clamped}%`;
    bar.setAttribute('aria-valuenow', String(Math.round(clamped)));
  };

  const hide = () => {
    statusEl.classList.add('hidden');
    setProgress(0);
  };

  /** Stops the timer; with reset (default) also empties and hides the bar. */
  const stop = (reset = true) => {
    clearInterval(timer);
    timer = null;
    if (!reset) return;
    finishing = false;
    bar.style.transition = 'none';
    setProgress(0);
    bar.getBoundingClientRect(); // apply the jump to 0 before the transition comes back
    bar.style.transition = 'width 600ms ease';
    hide();
  };

  /** Animates the bar to 100%; resolves when the animation has ended. */
  const runToEnd = () => {
    if (finishing) return Promise.resolve();
    finishing = true;
    const current = Math.max(0, Math.min(100, parseFloat(bar.getAttribute('aria-valuenow')) || 0));
    const duration = Math.max(300, 200 + (100 - current) * 8);
    bar.style.transition = `width ${duration}ms ease`;
    bar.getBoundingClientRect(); // apply the new transition before changing the width
    setProgress(100);

    return new Promise((resolve) => {
      let settled = false;
      const onEnd = (event) => {
        if (event && (event.target !== bar || event.propertyName !== 'width')) return;
        if (settled) return;
        settled = true;
        bar.removeEventListener('transitionend', onEnd);
        resolve();
      };
      bar.addEventListener('transitionend', onEnd);
      setTimeout(onEnd, duration + 200); // in case transitionend never fires
    });
  };

  const finish = async () => {
    stop(false);
    await runToEnd();
    hide();
    finishing = false;
  };

  const start = () => {
    clearInterval(timer);
    finishing = false;
    statusEl.classList.remove('hidden');
    bar.style.transition = 'width 600ms ease';
    setProgress(0);
    let elapsed = 0;
    timer = setInterval(() => {
      elapsed += 1;
      setProgress((elapsed / totalSeconds) * 100);
      if (elapsed >= totalSeconds) finish();
    }, 1000);
  };

  return { start, stop, finish };
}

/* ---------- loading and error states of both PageSpeed tabs ---------- */

/**
 * While PageSpeed is loading, or after it failed (the error box is inside
 * the loader), the open PageSpeed tab shows its loader instead of its content.
 * Called whenever the panel switches screens.
 */
export function updatePageSpeedTabLoaders() {
  const busy = state.pageSpeedStatus === 'loading' || state.pageSpeedStatus === 'error';
  ui.tabs.forEach(({ detail, loader, content }) => {
    const showLoader = busy && detail.classList.contains('active');
    loader.style.display = showLoader ? 'flex' : 'none';
    content.style.display = showLoader ? 'none' : '';
  });
}

/** Swaps the loading GIF for the error box (or back). */
function showPageSpeedError(visible) {
  ui.errorBoxes.forEach((box) => box.classList.toggle('hidden', !visible));
  ui.loaderImages.forEach((img) => { img.style.display = visible ? 'none' : ''; });
}

/* ---------- Performance tab ---------- */

function getActiveDevice() {
  return ui.mobileBtn.classList.contains('active') ? 'mobile' : 'desktop';
}

function formatMetric(key, value) {
  if (key === 'inp') return `${value.toFixed(0)} ms`;
  if (key === 'cls') return value.toFixed(2);
  return `${value.toFixed(1)} s`;
}

/** One Core Web Vital row: icon, name, value and Good / Poor icon. */
function metricRowHtml(metric, metrics, device) {
  const value = toDisplayUnits(metric.key, metrics[metric.key]);
  const rating = rateMetric(metric.key, value, device);
  return `
    <div class="metric-row">
      <div class="metric-left">
        <span class="metric-icon">
          <img src="${metric.icon}" class="page-performance-icon" alt="${metric.label} icon"/>
        </span>
        <span class="metric-label long">${metric.label}</span>
        <span class="metric-label short">${metric.short}</span>
      </div>
      <div class="metric-middle">
        <span class="metric-value">${formatMetric(metric.key, value)}</span>
      </div>
      <div class="metric-right">
        <span class="metric-rating ${rating.className}">
          <img src="${STATUS_ICONS[rating.className]}" class="metric-status-icon" alt="${rating.label}"/>
        </span>
      </div>
    </div>`;
}

/** Draws the gauge and the list for the device picked in the toggle. */
function renderPerformance() {
  const device = getActiveDevice();
  const metrics = getPageSpeedMetrics(device);

  if (!metrics) {
    if (device === 'mobile') {
      ui.list.innerHTML = '<p class="placeholder-text">Mobile metrics unavailable.</p>';
    }
    return;
  }
  if (Object.keys(metrics).length === 0) {
    ui.list.innerHTML = '<p class="placeholder-text" style="color:red;">Metrics data unavailable.</p>';
    return;
  }

  const rows = PERFORMANCE_METRICS.map((metric) => metricRowHtml(metric, metrics, device));
  ui.list.innerHTML = `<div class="detail-metrics-grid-engagement">${rows.join('')}</div>`;
  if (metrics.performanceScore !== undefined) drawGauge(ui.gauge, metrics.performanceScore);
}

/**
 * Overview warning: the first of LCP / CLS (desktop, then mobile) that is
 * not "Good", e.g. "Largest Contentful Paint can be improved in mobile".
 */
function getPerformanceMessage() {
  const checks = [['lcp', 'desktop'], ['lcp', 'mobile'], ['cls', 'desktop'], ['cls', 'mobile']];
  const messages = checks.map(([key, device]) => {
    const raw = getPageSpeedMetrics(device)?.[key];
    if (raw === null || raw === undefined) return '';
    const rating = rateMetric(key, toDisplayUnits(key, raw), device);
    if (rating.className === 'metric-good') return '';
    const { label } = PERFORMANCE_METRICS.find((metric) => metric.key === key);
    return `${label} ${rating.text} in ${device}`;
  });
  return messages.find(Boolean) || '';
}

/* ---------- loading ---------- */

/** Loads PageSpeed (desktop + mobile) and fills the Performance and Accessibility tabs. */
export async function loadPageSpeed() {
  if (state.pageSpeedStatus === 'loading') return;
  state.pageSpeedStatus = 'loading';
  showPageSpeedError(false);
  progressBars.forEach((bar) => bar.start());
  updatePageSpeedTabLoaders();
  showCriticalMetricsLoading();

  try {
    const report = await fetchPageSpeedReport({ signal: panelSignal });
    await Promise.all(progressBars.map((bar) => bar.finish()));

    state.desktopMetrics = report.desktop;
    state.mobileMetrics = report.mobile;
    state.pageSpeedStatus = 'done';

    renderPerformance();
    renderAccessibility();
    setCriticalMessage('performance', getPerformanceMessage());
    setCriticalMessage('accessibility', getAccessibilityMessage());
  } catch (error) {
    if (panelSignal?.aborted) return; // panel was removed; nothing to show
    // eslint-disable-next-line no-console
    console.error('page-insights: PageSpeed request failed', error);
    state.pageSpeedStatus = 'error';
    progressBars.forEach((bar) => bar.stop());
    showPageSpeedError(true);
    setCriticalMessage('performance', '');
    setCriticalMessage('accessibility', '');
  }

  updatePageSpeedTabLoaders();
  revealCriticalMetrics();
}

/* ---------- setup ---------- */

export function initPerformance(root, signal) {
  panelSignal = signal;
  const tab = root.querySelector('#performanceDetail');
  ui = {
    gauge: tab.querySelector('.performance-score-widget'),
    list: tab.querySelector('#desktopMetrics'),
    desktopBtn: tab.querySelector('#desktopBtn'),
    mobileBtn: tab.querySelector('#mobileBtn'),
    tabs: ['performance', 'accessibility'].map((name) => ({
      detail: root.querySelector(`#${name}Detail`),
      loader: root.querySelector(`#${name}TabLoader`),
      content: root.querySelector(`#${name}TabContent`),
    })),
    errorBoxes: [...root.querySelectorAll('.api-error-block')],
    loaderImages: [...root.querySelectorAll('.pagespeed-loader')],
  };

  progressBars = [...root.querySelectorAll('.status')]
    .map((statusEl) => createProgressBar(statusEl, statusEl.querySelector('.bar'), PROGRESS_SECONDS));
  signal.addEventListener('abort', () => progressBars.forEach((bar) => bar.stop()));

  // Placeholder score from the markup until PageSpeed has answered.
  drawGauge(ui.gauge, ui.gauge.dataset.score);

  // Desktop / Mobile toggle
  const toggleButtons = [ui.desktopBtn, ui.mobileBtn];
  toggleButtons.forEach((btn) => btn.addEventListener('click', () => {
    if (btn.classList.contains('active')) return;
    toggleButtons.forEach((other) => {
      other.classList.toggle('active', other === btn);
      other.setAttribute('aria-selected', String(other === btn));
    });
    renderPerformance();
  }));

  // "Try Again" in the error box of either tab
  root.querySelectorAll('.retry-btn').forEach((btn) => btn.addEventListener('click', () => {
    loadPageSpeed();
  }));
}
