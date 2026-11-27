/* =============================================================
 * page-insights — small helpers
 *
 * Number formatting, "quality" ratings and the score gauge.
 * No API calls and no state here.
 * ============================================================= */

import {
  METRIC_LIMITS, QUALITY_ICONS, SECONDS_METRICS,
} from './page-insights-constants.js';

/**
 * Turns API values like 1234, "1,234" or "12.5%" into a number.
 * Returns null when the value is missing or not a number.
 */
export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/,/g, '').replace(/%/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

/** 12345 → "12,345". Values that are not numbers are shown as they are. */
export function formatCount(value) {
  const number = toNumber(value);
  return number === null ? String(value) : number.toLocaleString();
}

/** Cuts decimals without rounding: (1.299, 2) → 1.29 */
export function toFixedNoRound(number, decimals) {
  const factor = 10 ** decimals;
  return Math.trunc(number * factor) / factor;
}

/** "moderate" → "Moderate" */
export function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Seconds → "05s", "1m" or "1m 15s" */
export function formatDuration(seconds) {
  const total = Math.max(0, toNumber(seconds) || 0);
  const minutes = Math.floor(total / 60);
  const secs = String(Math.trunc(total % 60)).padStart(2, '0');
  if (minutes === 0) return `${secs}s`;
  if (secs === '00') return `${minutes}m`;
  return `${minutes}m ${secs}s`;
}

/** Percent → 'high' (70 or more), 'moderate' (50 or more) or 'low' */
export function qualityFromPercent(percent) {
  const value = toNumber(percent) || 0;
  if (value >= 70) return 'high';
  if (value >= 50) return 'moderate';
  return 'low';
}

/** Seconds → 'high' (3 minutes or more), 'moderate' (1 minute or more) or 'low' */
export function qualityFromSeconds(seconds) {
  const value = toNumber(seconds) || 0;
  if (value >= 180) return 'high';
  if (value >= 60) return 'moderate';
  return 'low';
}

/**
 * Score 0-100 → 'high' | 'moderate' | 'low'.
 * Accessibility (WCAG) needs 85 for 'high', performance needs 70.
 */
export function qualityFromScore(score, isWcag = false) {
  const value = Number(score) || 0;
  if (value >= (isWcag ? 85 : 70)) return 'high';
  if (value >= 50) return 'moderate';
  return 'low';
}

/** Shows the High / Moderate / Low icon on an <img>. */
export function setQualityIcon(img, quality) {
  const icon = QUALITY_ICONS[quality];
  if (!img || !icon) return;
  img.src = icon.src;
  img.alt = icon.alt;
}

/**
 * Splits two counts into two whole percentages that add up to 100.
 * Any rounding remainder goes to the one that was rounded down most.
 */
export function splitPercent(first, second) {
  const total = first + second;
  if (total === 0) return [0, 0];

  const exactFirst = (first / total) * 100;
  const exactSecond = (second / total) * 100;
  let pctFirst = Math.floor(exactFirst);
  let pctSecond = Math.floor(exactSecond);

  const leftover = 100 - (pctFirst + pctSecond);
  if (leftover > 0) {
    if (exactFirst - pctFirst > exactSecond - pctSecond) pctFirst += leftover;
    else pctSecond += leftover;
  }
  return [pctFirst, pctSecond];
}

/**
 * Draws a half-circle score gauge (.performance-score-widget):
 * the yellow arc is the score, the violet arc is the rest.
 */
export function drawGauge(widget, score) {
  if (!widget) return;
  const CIRCUMFERENCE = 204; // length of the arc in SVG units
  const YELLOW_EXTRA = 4; // makes the yellow arc a little longer
  const GAP = 2; // space between the two arcs

  const value = Math.min(100, Math.max(0, Number(score) || 0));
  const yellow = widget.querySelector('.gauge-yellow');
  const violet = widget.querySelector('.gauge-violet');
  const valueEl = widget.querySelector('.score-value');
  if (!yellow || !violet || !valueEl) return;

  widget.dataset.score = value;
  valueEl.textContent = value;

  const yellowLength = (CIRCUMFERENCE * value) / 100 + YELLOW_EXTRA;
  yellow.style.strokeDasharray = `${yellowLength} ${CIRCUMFERENCE}`;
  yellow.style.strokeDashoffset = 0;
  violet.style.strokeDasharray = `${CIRCUMFERENCE - yellowLength} ${CIRCUMFERENCE}`;
  violet.style.strokeDashoffset = -yellowLength - GAP;

  const isWcag = Boolean(widget.closest('#accessibilityDetail'));
  setQualityIcon(widget.querySelector('.score-quality-icon'), qualityFromScore(value, isWcag));
}

/** A PageSpeed value in the units the panel shows (ms → s for timing metrics). */
export function toDisplayUnits(key, value) {
  const number = toNumber(value) || 0;
  return SECONDS_METRICS.includes(key) ? number / 1000 : number;
}

/**
 * Rates a Core Web Vital (value in display units, see toDisplayUnits).
 * @returns {{ label: string, className: string, text: string }}
 *   text is used in the overview, e.g. "Largest Contentful Paint can be improved"
 */
export function rateMetric(key, value, device = 'desktop') {
  const limits = METRIC_LIMITS[key][device] || METRIC_LIMITS[key];
  if (value <= limits.good) return { label: 'Good', className: 'metric-good', text: 'is good' };
  if (value <= limits.moderate) {
    return { label: 'Needs Improvement', className: 'metric-moderate', text: 'is moderate' };
  }
  return { label: 'Poor', className: 'metric-bad', text: 'can be improved' };
}
