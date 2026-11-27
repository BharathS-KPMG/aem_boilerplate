/* =============================================================
 * page-insights — SEO Insights tab
 *
 * Search numbers for one month (Impressions, Clicks, CTR, Average
 * Position), each compared with the month before, plus an overall
 * "Improved / Declined" banner. A month picker in the header picks
 * the month; the default is last month.
 *
 * openSeo() runs each time the SEO screen is opened.
 * ============================================================= */

import { fetchSeoMonth } from './page-insights-api.js';
import { toNumber } from './page-insights-helpers.js';
import { state } from './page-insights-state.js';

const CACHE_MS = 5 * 60 * 1000; // keep a month's rows for 5 minutes
const TIMEOUT_MS = 12000; // give up on a request after 12 seconds
const EPS = 1e-9; // changes smaller than this count as "no change"

/* The four metric cards. The ids are the elements in the markup.
 * keys = field names the API may use for this metric (first found wins).
 * higherBetter: false means a lower value is better (Average Position). */
const SEO_METRICS = [
  {
    type: 'integer',
    higherBetter: true,
    keys: ['Impressions', 'impressions'],
    ids: {
      value: 'seoImpressions',
      previous: 'seoPrevImpressions',
      change: 'seoImpressionsChange',
      badge: 'seoImpressionsBadge',
      delta: 'seoImpressionsDelta',
    },
  },
  {
    type: 'integer',
    higherBetter: true,
    keys: ['Clicks', 'clicks'],
    ids: {
      value: 'seoClicks',
      previous: 'seoPrevClicks',
      change: 'seoClicksChange',
      badge: 'seoClicksBadge',
      delta: 'seoClicksDelta',
    },
  },
  {
    type: 'percent',
    higherBetter: true,
    keys: ['CTR', 'ctr'],
    ids: {
      value: 'seoCTR',
      previous: 'seoPrevCTR',
      change: 'seoCTRChange',
      badge: 'seoCTRBadge',
      delta: 'seoCTRDelta',
    },
  },
  {
    type: 'decimal',
    higherBetter: false,
    keys: ['Average Position', 'Avg Position', 'average_position', 'position'],
    ids: {
      value: 'seoPosition',
      previous: 'seoPrevPosition',
      change: 'seoPositionChange',
      badge: 'seoPositionBadge',
      delta: 'seoPositionDelta',
    },
  },
];

let ui = {};
let selectedMonth = null; // moment, first day of the month shown
let currentRequest = null; // AbortController of the running request
let panelSignal = null; // aborted when the panel is removed (user signed out)

/* ---------- months ---------- */

const defaultMonth = () => window.moment().subtract(1, 'month').startOf('month');
const toVersion = (month) => month.format('MMMM-YYYY'); // API format: "October-2026"
const toLabel = (month) => month.format('MMMM YYYY'); // shown: "October 2026"

/* ---------- small DOM helpers ---------- */

const byId = (id) => ui.root.querySelector(`#${id}`);

function setText(id, text) {
  const el = byId(id);
  if (el) el.textContent = text;
}

/** Sets class + content of an element (content may contain the chevron SVG). */
function setElement(id, className, html) {
  const el = byId(id);
  if (!el) return;
  el.className = className;
  el.innerHTML = html;
}

function setLoading(isLoading) {
  ui.body?.classList.toggle('is-loading', isLoading);
}

/** Shows either the dashboard or the "Data Not found." message. */
function showDashboard(hasData) {
  if (ui.content) ui.content.style.display = hasData ? 'block' : 'none';
  if (ui.noData) {
    ui.noData.innerHTML = '<strong>Data Not found.</strong>';
    ui.noData.style.display = hasData ? 'none' : 'block';
  }
}

/* ---------- numbers ---------- */

/** Fixed decimals without trailing zeros: 6.20 → "6.2" */
function trimNumber(number, maxDecimals) {
  const text = Number(number).toFixed(maxDecimals);
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

function formatValue(type, number) {
  if (number === null) return '--';
  if (type === 'integer') return Math.round(number).toLocaleString('en-IN');
  if (type === 'percent') return `${trimNumber(number, 2)}%`;
  return trimNumber(number, 2);
}

/**
 * Reads one metric from an API row. Values are "current|previous|change"
 * ("1,742|1,740|+0.1%", or "1,742|NA|NEW" for a first month) or, in older
 * replies, just the number.
 * @returns {{ current, previous, change, isNew }}
 */
function readMetric(row, keys) {
  const empty = {
    current: null, previous: null, change: null, isNew: false,
  };
  const key = keys.find((name) => row?.[name] !== undefined && row[name] !== null && row[name] !== '');
  if (!key) return empty;
  const raw = row[key];
  if (typeof raw !== 'string' || !raw.includes('|')) return { ...empty, current: toNumber(raw) };

  const [current, previous, change] = raw.split('|').map((part) => part.trim());
  const isNew = (change || '').toUpperCase() === 'NEW';
  return {
    current: toNumber(current),
    previous: (previous || '').toUpperCase() === 'NA' ? null : toNumber(previous),
    change: change && !isNew ? change : null,
    isNew,
  };
}

/** Up or down chevron icon. */
function chevron(up) {
  const path = up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6';
  return `<svg class="seo-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
}

/**
 * Change in percent where a positive number always means "better".
 * Uses the change from the API when it sent one, else works it out.
 */
function improvementPercent(spec, current, previous, change) {
  const fromApi = toNumber(change);
  if (fromApi !== null) return fromApi;
  if (current === null || previous === null || previous === 0) return null;
  const diff = spec.higherBetter ? current - previous : previous - current;
  return (diff / Math.abs(previous)) * 100;
}

function statusOf(percent) {
  if (percent === null) return 'none';
  if (percent > EPS) return 'improved';
  if (percent < -EPS) return 'declined';
  return 'flat';
}

/** Text of the "vs last month" line under the value. */
function deltaText(spec, current, previous) {
  if (previous === null) return 'No previous data';
  const diff = current - previous;
  const sign = diff > 0 ? '+' : '-';
  if (spec.type === 'integer') {
    if (Math.abs(diff) < EPS) return 'No change vs last month';
    return `${sign}${Math.abs(Math.round(diff)).toLocaleString('en-IN')} vs last month`;
  }
  if (spec.type === 'percent') {
    if (Math.abs(diff) < 0.005) return 'No change vs last month';
    return `${sign}${trimNumber(Math.abs(diff), 2)}% vs last month`;
  }
  // Average Position: lower is better, so say "Improved by" / "Declined by".
  const improvement = previous - current;
  if (Math.abs(improvement) < 0.005) return 'No change vs last month';
  const unit = Math.abs(improvement) === 1 ? 'position' : 'positions';
  const verb = improvement > 0 ? 'Improved by' : 'Declined by';
  return `${verb} ${trimNumber(Math.abs(improvement), 2)} ${unit}`;
}

/* ---------- drawing ---------- */

/**
 * Fills one metric card.
 * @param previousFromMonthBefore value from the month-before reply, used when
 *   the current row has no "previous" part (older reply format)
 * @returns {'improved'|'declined'|'flat'|'none'}
 */
function renderCard(spec, metric, previousFromMonthBefore) {
  const { current, change, isNew } = metric;
  const previous = metric.previous ?? previousFromMonthBefore;
  const { ids } = spec;

  setText(ids.value, formatValue(spec.type, current));
  setText(ids.previous, previous === null ? '--' : formatValue(spec.type, previous));

  const percent = improvementPercent(spec, current, previous, change);
  const status = isNew ? 'none' : statusOf(percent);

  if (status === 'none') {
    setElement(ids.badge, 'seo-badge', isNew ? 'New Data' : 'No data');
    setElement(ids.change, 'seo-mc-pct', '--');
    setElement(ids.delta, 'seo-mc-delta', isNew ? 'First month of data' : 'No previous data');
    return 'none';
  }

  const good = status === 'improved';
  const bad = status === 'declined';
  let tone = '';
  if (good) tone = ' is-good';
  if (bad) tone = ' is-bad';
  let badgeText = 'No change';
  if (good) badgeText = 'Improved';
  if (bad) badgeText = 'Declined';
  const delta = deltaText(spec, current, previous);

  setElement(ids.badge, `seo-badge${tone}`, badgeText);
  if (status === 'flat') {
    setElement(ids.change, `seo-mc-pct${tone}`, '0%');
    setElement(ids.delta, `seo-mc-delta${tone}`, delta);
  } else {
    setElement(ids.change, `seo-mc-pct${tone}`, `${chevron(good)}<span>${percent.toFixed(1)}%</span>`);
    setElement(ids.delta, `seo-mc-delta${tone}`, `${chevron(good)}<span>${delta}</span>`);
  }
  return status;
}

/** The "Overall Performance" banner: how many metrics improved / declined. */
function renderOverall(improved, declined, previousMonth) {
  setText('seoImprovedCount', String(improved));
  setText('seoDeclinedCount', String(declined));
  setText('seoOverallCompare', `Compared to ${toLabel(previousMonth)}`);

  let label = 'Mixed';
  let toneClass = ' is-neutral';
  if (improved === 0 && declined === 0) {
    label = 'No change';
  } else if (improved > declined) {
    label = 'Improved';
    toneClass = '';
  } else if (declined > improved) {
    label = 'Declined';
    toneClass = ' is-bad';
  }

  const arrow = '<span class="seo-overall-status-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M9 7h8v8"/></svg></span>';
  setElement('seoOverallStatus', `seo-overall-status${toneClass}`, `${label}${arrow}`);
  const badge = byId('seoOverallBadge');
  if (badge) badge.className = `seo-overall-badge${toneClass}`;
}

function renderInsights(currentRows, previousRows, month) {
  if (!currentRows.length) {
    showDashboard(false);
    return;
  }
  showDashboard(true);
  ui.input.value = toLabel(month);

  const currentRow = currentRows[0] || {};
  const previousRow = previousRows[0] || null;
  let improved = 0;
  let declined = 0;

  SEO_METRICS.forEach((spec) => {
    const previousValue = previousRow ? readMetric(previousRow, spec.keys).current : null;
    const status = renderCard(spec, readMetric(currentRow, spec.keys), previousValue);
    if (status === 'improved') improved += 1;
    if (status === 'declined') declined += 1;
  });

  renderOverall(improved, declined, month.clone().subtract(1, 'month'));
}

/* ---------- loading ---------- */

/** Rows of one month, from the 5-minute cache or the API. Errors give []. */
async function getMonthRows(version, signal) {
  const cached = state.seoCache[version];
  if (cached && Date.now() - cached.time < CACHE_MS) return cached.rows;

  try {
    const rows = await fetchSeoMonth({ version, signal });
    state.seoCache[version] = { time: Date.now(), rows };
    return rows;
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    return [];
  }
}

/** Loads a month and the month before it, then fills the dashboard. */
async function loadSeo(month) {
  currentRequest?.abort(); // a newer month replaces a running request
  const controller = new AbortController();
  currentRequest = controller;
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const version = toVersion(month);
  const previousVersion = toVersion(month.clone().subtract(1, 'month'));
  setLoading(true);

  try {
    const [currentRows, previousRows] = await Promise.all([
      getMonthRows(version, controller.signal),
      getMonthRows(previousVersion, controller.signal),
    ]);
    state.lastSeoVersion = version;
    renderInsights(currentRows, previousRows, month);
  } catch (error) {
    // Aborted: replaced by a newer request or the panel was removed → leave the
    // screen to them. Timed out (still the current request) → show "no data".
    if (currentRequest === controller && !panelSignal?.aborted) showDashboard(false);
  } finally {
    clearTimeout(timeout);
    if (currentRequest === controller) {
      currentRequest = null;
      setLoading(false);
    }
  }
}

/* ---------- month picker ---------- */

/** Small popup with a year and a month list. Only past months can be picked. */
function showMonthPicker() {
  ui.root.querySelector('#seo-month-picker')?.remove();
  const { moment } = window;

  const picker = document.createElement('div');
  picker.id = 'seo-month-picker';
  picker.setAttribute('role', 'dialog');
  picker.setAttribute('aria-label', 'Choose a month');
  Object.assign(picker.style, {
    position: 'absolute',
    background: '#fff',
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '10px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: '999999',
  });

  // Place it under the month field.
  ui.sidebar.append(picker);
  const fieldBox = ui.input.getBoundingClientRect();
  const sidebarBox = ui.sidebar.getBoundingClientRect();
  picker.style.top = `${fieldBox.bottom - sidebarBox.top + 8}px`;
  picker.style.left = `${fieldBox.left - sidebarBox.left}px`;

  const today = moment();
  const yearSelect = document.createElement('select');
  yearSelect.setAttribute('aria-label', 'Year');
  const monthSelect = document.createElement('select');
  monthSelect.setAttribute('aria-label', 'Month');
  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.textContent = 'Apply';
  Object.assign(applyBtn.style, {
    marginTop: '10px',
    padding: '6px 14px',
    background: '#5b2d91',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  });

  // This year and the 5 before it.
  for (let year = today.year(); year >= today.year() - 5; year -= 1) {
    yearSelect.add(new Option(String(year), String(year), false, year === selectedMonth.year()));
  }

  // Months of the chosen year, up to last month.
  const fillMonths = (year) => {
    monthSelect.textContent = '';
    moment.monthsShort().forEach((name, index) => {
      const isPast = year < today.year() || index < today.month();
      if (!isPast) return;
      const isSelected = year === selectedMonth.year() && index === selectedMonth.month();
      monthSelect.add(new Option(name, String(index), false, isSelected));
    });
    if (monthSelect.selectedIndex < 0 && monthSelect.options.length > 0) {
      monthSelect.selectedIndex = monthSelect.options.length - 1;
    }
    applyBtn.disabled = monthSelect.options.length === 0;
  };
  yearSelect.addEventListener('change', () => fillMonths(Number(yearSelect.value)));
  fillMonths(selectedMonth.year());

  // Closing: Apply, a click outside, or Escape.
  const listeners = new AbortController();
  const close = () => {
    listeners.abort();
    picker.remove();
  };
  panelSignal.addEventListener('abort', close, { signal: listeners.signal });

  applyBtn.addEventListener('click', () => {
    const month = Number(monthSelect.value);
    const year = Number(yearSelect.value);
    if (!Number.isFinite(month) || !Number.isFinite(year)) return;
    selectedMonth = moment({ year, month });
    ui.input.value = toLabel(selectedMonth);
    close();
    loadSeo(selectedMonth);
  });

  picker.append(yearSelect, monthSelect, document.createElement('br'), applyBtn);

  // Wait a tick, so the click that opened the picker does not close it.
  setTimeout(() => {
    if (listeners.signal.aborted) return;
    document.addEventListener('click', (event) => {
      if (!picker.contains(event.target) && event.target !== ui.input) close();
    }, { signal: listeners.signal });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    }, { signal: listeners.signal });
  }, 0);
}

/* ---------- setup ---------- */

export function initSeo(root, signal) {
  panelSignal = signal;
  ui = {
    root,
    sidebar: root.querySelector('#metricsSidebar'),
    input: root.querySelector('#seoDateRangeInput'),
    body: root.querySelector('#seoDetailBody'),
    content: root.querySelector('#seoInsightsContent'),
    noData: root.querySelector('#seoNoDataMsg'),
  };
  selectedMonth = null;
  currentRequest = null;
  signal.addEventListener('abort', () => currentRequest?.abort());

  ui.input.addEventListener('click', (event) => {
    event.stopPropagation();
    if (selectedMonth) showMonthPicker();
  });
}

/** Runs when the SEO screen opens: first time loads last month, later reloads the month shown. */
export function openSeo() {
  if (!window.moment) return;
  if (!selectedMonth) {
    selectedMonth = defaultMonth();
    ui.input.value = toLabel(selectedMonth);
    loadSeo(selectedMonth);
  } else if (state.lastSeoVersion) {
    loadSeo(selectedMonth);
  }
}
