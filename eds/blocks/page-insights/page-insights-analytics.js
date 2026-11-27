/* =============================================================
 * page-insights — Page Analytics tab
 *
 * Adobe Analytics numbers for the page: visits, bounce rate, time
 * spent, form/FAQ/video/PDF counts and the mobile / non-mobile split.
 *
 *   - date range picker (jQuery daterangepicker + moment), default
 *     is the current month
 *   - Overall / Organic toggle (Organic = visits from search engines)
 *   - each range + toggle result is cached, so going back is instant
 * ============================================================= */

import { fetchAnalyticsReport } from './page-insights-api.js';
import { PAGE_FEATURES } from './page-insights-constants.js';
import {
  capitalize, formatCount, formatDuration, qualityFromPercent, qualityFromSeconds,
  splitPercent, toFixedNoRound, toNumber,
} from './page-insights-helpers.js';
import { state } from './page-insights-state.js';
import {
  hidePanelLoader, revealCriticalMetrics, setCriticalMessage, showCriticalMetricsLoading,
  showPanelLoaderError,
} from './page-insights-overview.js';

const LABEL_DATE_FORMAT = 'DD MMM YYYY'; // shown in the date field
const API_DATE_FORMAT = 'YYYY-MM-DD'; // sent to the API

let ui = {};
let range = null; // { start: moment, end: moment }
let isOrganic = false;
let latestRequest = 0; // only the newest request may update the screen
let panelSignal = null; // aborted when the panel is removed (user signed out)

/* ---------- small DOM helpers ---------- */

function setText(el, text) {
  if (el) el.textContent = text;
}

function showRow(el, visible) {
  const row = el?.closest('.metric-row');
  if (row) row.style.display = visible ? '' : 'none';
}

/** Which page features are on this page (see PAGE_FEATURES). */
function getPageFeatures() {
  return Object.fromEntries(Object.entries(PAGE_FEATURES)
    .map(([name, selector]) => [name, Boolean(document.querySelector(selector))]));
}

/* ---------- drawing the numbers ---------- */

/**
 * Overview warning: a high/moderate bounce rate, otherwise a
 * low/moderate average time spent, otherwise nothing.
 */
function getAnalyticsMessage(metrics) {
  const timeMessage = () => {
    if (metrics.avgTimePerVisitSeconds == null) return '';
    const quality = qualityFromSeconds(metrics.avgTimePerVisitSeconds);
    return quality === 'high' ? '' : `${capitalize(quality)} average time spent`;
  };
  if (metrics.bounceRate == null) return timeMessage();
  const bounce = qualityFromPercent(metrics.bounceRate);
  return bounce === 'low' ? timeMessage() : `${capitalize(bounce)} bounce rate`;
}

function renderMetrics(metrics) {
  const page = getPageFeatures();

  // Traffic volume
  if (metrics.Visits != null) setText(ui.totalVisits, formatCount(metrics.Visits));
  if (metrics.Visitors != null) setText(ui.uniqueVisits, formatCount(metrics.Visitors));

  // Engagement quality
  if (metrics.bounceRate != null) {
    setText(ui.bounceRate, `${(toNumber(metrics.bounceRate) || 0).toFixed(1)}%`);
  }
  if (metrics.avgTimePerVisitSeconds != null) {
    setText(ui.averageTime, formatDuration(metrics.avgTimePerVisitSeconds));
  }

  // Form rows: only on pages with a lead form
  [ui.formStart, ui.formSubmit, ui.conversionRate].forEach((el) => showRow(el, page.leadForm));
  if (page.leadForm) {
    setText(ui.formStart, metrics.formStartCount != null ? formatCount(metrics.formStartCount) : '--');
    setText(ui.formSubmit, metrics.event9 != null ? formatCount(metrics.event9) : '--');
    setText(ui.conversionRate, metrics.conversionRate != null
      ? `${toFixedNoRound(toNumber(metrics.conversionRate) || 0, 2)}%`
      : '--');
  }

  // FAQ clicks: the campaign FAQ metric on pages with a campaign FAQ
  const faqClicks = page.campaignFaq ? metrics.campaignFaqClicked : metrics.faqClicked;
  setText(ui.faqClicked, formatCount(toNumber(faqClicks) || 0));

  // Video plays and PDF downloads: only on campaign pages with a video / PDF list
  const showVideo = page.campaignVideo && metrics.videoPlayed != null;
  showRow(ui.videoPlayed, showVideo);
  if (showVideo) setText(ui.videoPlayed, String(metrics.videoPlayed));

  const showPdf = page.campaignPdf && metrics.downloadClick != null;
  showRow(ui.pdfDownloaded, showPdf);
  if (showPdf) setText(ui.pdfDownloaded, String(metrics.downloadClick || 0));

  // Device-wise traffic
  const [mobilePercent, otherPercent] = splitPercent(
    Math.trunc(toNumber(metrics.mobileVisits) || 0),
    Math.trunc(toNumber(metrics.nonMobileVisits) || 0),
  );
  setText(ui.mobilePercent, `${mobilePercent}%`);
  setText(ui.nonMobilePercent, `${otherPercent}%`);

  setCriticalMessage('analytics', getAnalyticsMessage(metrics));
}

/* ---------- loading ---------- */

/** Blurs the tab while a request runs; the overview waits for it too. */
function setLoading(isLoading) {
  state.analyticsLoading = isLoading;
  ui.body.classList.toggle('is-loading', isLoading);
  if (isLoading) showCriticalMetricsLoading();
  else revealCriticalMetrics();
}

function getCacheKey() {
  const mode = isOrganic ? 'organic' : 'overall';
  return `${mode}|${range.start.format(API_DATE_FORMAT)}|${range.end.format(API_DATE_FORMAT)}`;
}

/** Loads (or takes from cache) the numbers for the current date range and toggle. */
export async function loadAnalytics() {
  latestRequest += 1;
  const requestId = latestRequest;
  const cacheKey = getCacheKey();

  const cached = state.analyticsCache[cacheKey];
  if (cached) {
    renderMetrics(cached);
    setLoading(false);
    return;
  }

  setLoading(true);
  let metrics = null;
  try {
    metrics = await fetchAnalyticsReport({
      startDate: range.start.format(API_DATE_FORMAT),
      endDate: range.end.format(API_DATE_FORMAT),
      isOrganic,
      signal: panelSignal,
    });
  } catch (error) {
    if (panelSignal?.aborted) return; // panel was removed; nothing to show
    // eslint-disable-next-line no-console
    console.error('page-insights: analytics request failed', error);
  }

  // The user changed the range or toggle meanwhile: that newer request wins.
  if (requestId !== latestRequest) return;

  if (metrics) {
    state.analyticsCache[cacheKey] = metrics;
    renderMetrics(metrics);
    hidePanelLoader();
  } else {
    setCriticalMessage('analytics', '');
    showPanelLoaderError();
  }
  setLoading(false);
}

/* ---------- date range picker ---------- */

function showDateRange() {
  ui.dateInput.value = `${range.start.format(LABEL_DATE_FORMAT)} – ${range.end.format(LABEL_DATE_FORMAT)}`;
}

/** "31 days selected" in the picker footer. */
function showSelectedDays(picker) {
  if (!picker?.container) return;
  const days = range.end.diff(range.start, 'days') + 1;
  picker.container.find('.drp-selected').text(days === 1 ? '1 day selected' : `${days} days selected`);
}

function initDatePicker(sidebar) {
  const { jQuery, moment } = window;
  range = { start: moment().startOf('month'), end: moment().endOf('month') };
  showDateRange();

  if (!jQuery?.fn?.daterangepicker) {
    // eslint-disable-next-line no-console
    console.warn('page-insights: date picker library missing; using the current month');
    return;
  }

  const $input = jQuery(ui.dateInput);
  $input.daterangepicker({
    parentEl: sidebar,
    startDate: range.start,
    endDate: range.end,
    opens: 'left',
    autoUpdateInput: false,
    locale: { format: LABEL_DATE_FORMAT, separator: ' – ' },
  }, (start, end) => {
    range = { start, end };
    showDateRange();
    showSelectedDays($input.data('daterangepicker'));
    loadAnalytics();
  });
  $input.on('show.daterangepicker', (event, picker) => showSelectedDays(picker));

  // Remove the picker (and its page-level listeners) with the panel.
  panelSignal.addEventListener('abort', () => $input.data('daterangepicker')?.remove());
}

/* ---------- setup ---------- */

export function initAnalytics(root, signal) {
  panelSignal = signal;
  const tab = root.querySelector('#pageAnalyticsDetail');
  const find = (id) => tab.querySelector(`#${id}`);
  ui = {
    body: tab.querySelector('.detail-body'),
    dateInput: find('dateRangeInput'),
    overallBtn: find('overall-btn'),
    organicBtn: find('organic-btn'),
    totalVisits: find('totalVisitsValue'),
    uniqueVisits: find('uniqueVisitsValue'),
    formStart: find('formStartValue'),
    formSubmit: find('formSubmitValue'),
    bounceRate: find('bounceRateValue'),
    conversionRate: find('conversionRateValue'),
    averageTime: find('averageTimeSpentValue'),
    faqClicked: find('faqClicked'),
    videoPlayed: find('videoPlayed'),
    pdfDownloaded: find('pdfdownloaded'),
    mobilePercent: find('mobileVisitsPercent'),
    nonMobilePercent: find('nonMobileVisitsPercent'),
  };
  isOrganic = false;

  initDatePicker(root.querySelector('#metricsSidebar'));

  // Overall / Organic toggle
  const modeButtons = [ui.overallBtn, ui.organicBtn];
  modeButtons.forEach((btn) => btn.addEventListener('click', () => {
    if (btn.classList.contains('active')) return;
    isOrganic = btn === ui.organicBtn;
    modeButtons.forEach((other) => {
      other.classList.toggle('active', other === btn);
      other.setAttribute('aria-pressed', String(other === btn));
    });
    loadAnalytics();
  }));
}
