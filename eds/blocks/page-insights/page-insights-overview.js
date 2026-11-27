/* =============================================================
 * page-insights — overview screen
 *
 * The first screen of the panel:
 *   - the full-panel loader shown while the first data loads
 *   - "Critical Metrics": up to three warnings, one per area
 *   - the status pill ("Good" / "Needs Improvement")
 *
 * Each area sets its own warning with setCriticalMessage(). The list
 * stays on its loading shimmer until Analytics and PageSpeed have both
 * finished, then all warnings appear together (revealCriticalMetrics).
 * ============================================================= */

import { state } from './page-insights-state.js';

/* One list item per area, in this order in the markup. */
const AREAS = ['analytics', 'performance', 'accessibility'];

let ui = {};

export function initOverview(root) {
  const items = root.querySelectorAll('#overall-critical-points > li');
  ui = {
    loader: root.querySelector('#globalLoader'),
    sections: root.querySelector('#metricSectionsContainer'),
    pill: root.querySelector('#overallStatusPill'),
    items: AREAS.map((area, index) => ({ area, li: items[index] })).filter(({ li }) => li),
  };
  if (ui.loader) ui.loader.style.display = 'none';
}

/* ---------- full-panel loader ---------- */

/** Covers the panel with the loader until the first analytics reply. */
export function showPanelLoader() {
  ui.loader.style.display = 'flex';
  ui.sections.style.display = 'none';
}

export function hidePanelLoader() {
  ui.loader.style.display = 'none';
  ui.sections.style.display = 'flex';
}

/** Replaces the loader with an error, if it is still showing. */
export function showPanelLoaderError() {
  if (ui.loader.style.display === 'none') return;
  const message = document.createElement('p');
  message.style.cssText = 'text-align:center;color:#D92D20;font-weight:600;';
  message.append(
    'Oops! Unable to fetch the Analytics report.',
    document.createElement('br'),
    'Please close this tab and try again.',
  );
  ui.loader.replaceChildren(message);
  ui.sections.style.display = 'flex';
}

/* ---------- critical metrics ---------- */

/** Puts every warning back on its loading shimmer. */
export function showCriticalMetricsLoading() {
  ui.items.forEach(({ li }) => {
    li.querySelector('.shimmer-card').style.display = '';
    li.querySelector('.critical-item').style.display = 'none';
  });
}

/**
 * Sets the warning of one area: 'analytics', 'performance' or 'accessibility'.
 * An empty message hides that list item (nothing to warn about).
 */
export function setCriticalMessage(area, message) {
  const item = ui.items.find((entry) => entry.area === area);
  if (!item) return;
  item.li.querySelector('.critical-item').textContent = message || '';
  item.li.style.display = message ? '' : 'none';
}

/** "Needs Improvement" when any warning is shown, otherwise "Good". */
function updateStatusPill() {
  if (!ui.pill) return;
  const hasWarning = ui.items.some(({ li }) => li.style.display !== 'none');
  ui.pill.classList.toggle('status-pill--warning', hasWarning);
  ui.pill.classList.toggle('status-pill--good', !hasWarning);
  ui.pill.textContent = hasWarning ? 'Needs Improvement' : 'Good';
  // The pill starts hidden so its placeholder text is never shown.
  ui.pill.style.visibility = 'visible';
}

/** Shows all warnings at once, but only when no request is still running. */
export function revealCriticalMetrics() {
  if (state.analyticsLoading || state.pageSpeedStatus === 'loading') return;
  ui.items.forEach(({ li }) => {
    li.querySelector('.shimmer-card').style.display = 'none';
    li.querySelector('.critical-item').style.display = '';
  });
  updateStatusPill();
}
