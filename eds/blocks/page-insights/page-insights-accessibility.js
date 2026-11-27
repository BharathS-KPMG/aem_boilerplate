/* =============================================================
 * page-insights — Accessibility tab
 *
 * Shows the PageSpeed accessibility score (gauge) and the failed
 * WCAG checks, grouped and listed as accordions, for desktop or
 * mobile. The data is loaded by page-insights-performance.js
 * (one PageSpeed call fills both tabs).
 * ============================================================= */

import { drawGauge, qualityFromScore } from './page-insights-helpers.js';
import { getPageSpeedMetrics } from './page-insights-state.js';

/* Failed checks are grouped by a word in the Lighthouse check id.
 * Groups are tested in this order; the first match wins. */
const AUDIT_GROUPS = [
  { title: 'Contrast Issues', idContains: 'contrast' },
  { title: 'Alt Text Issues', idContains: 'alt' },
  { title: 'Label Issues', idContains: 'label' },
  { title: 'ARIA Issues', idContains: 'aria' },
  { title: 'Other Accessibility Issues', idContains: '' },
];

let ui = {};

/** Failed checks sorted into AUDIT_GROUPS (keeps every group, even empty). */
function groupAudits(audits = {}) {
  const groups = AUDIT_GROUPS.map((group) => ({ ...group, audits: [] }));
  Object.entries(audits).forEach(([id, audit]) => {
    groups.find((group) => id.includes(group.idContains)).audits.push(audit);
  });
  return groups;
}

/** One failing element: CSS selector, HTML snippet and screenshot (when given). */
function buildElementCard({ node = {} }) {
  const card = document.createElement('div');
  card.className = 'element-card';

  const selector = document.createElement('h4');
  selector.textContent = node.selector || 'Unknown element';
  card.append(selector);

  if (node.snippet) {
    const snippet = document.createElement('pre');
    snippet.className = 'search-placeholder';
    snippet.textContent = node.snippet;
    card.append(snippet);
  }
  if (typeof node.screenshot === 'string') {
    const screenshot = document.createElement('img');
    screenshot.src = node.screenshot;
    screenshot.alt = '';
    card.append(screenshot);
  }
  return card;
}

/** One failed check as an accordion: title row + failing elements. */
function buildAccordion(audit) {
  const accordion = document.createElement('div');
  accordion.className = 'accordion';

  const header = document.createElement('div');
  header.className = 'accordion-header';
  header.setAttribute('role', 'button');
  header.setAttribute('tabindex', '0');
  header.setAttribute('aria-expanded', 'false');

  const title = document.createElement('span');
  title.textContent = audit.title;
  const arrow = document.createElement('span');
  arrow.className = 'accordion-arrow';
  arrow.textContent = '+';
  header.append(title, arrow);

  const content = document.createElement('div');
  content.className = 'accordion-content';
  (audit.details?.items || []).forEach((item) => content.append(buildElementCard(item)));

  const toggle = () => {
    const open = !content.classList.contains('open');
    content.classList.toggle('open', open);
    content.style.maxHeight = open ? `${content.scrollHeight}px` : null;
    arrow.textContent = open ? '×' : '+';
    arrow.classList.toggle('open', open);
    header.setAttribute('aria-expanded', String(open));
  };
  header.addEventListener('click', toggle);
  header.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggle();
  });

  accordion.append(header, content);
  return accordion;
}

function renderAudits(audits) {
  ui.list.textContent = '';
  groupAudits(audits)
    .filter((group) => group.audits.length > 0)
    .forEach((group) => {
      const section = document.createElement('div');
      section.className = 'group-section';
      const title = document.createElement('span');
      title.className = 'group-title';
      title.textContent = `${group.title} (${group.audits.length})`;
      section.append(title, ...group.audits.map(buildAccordion));
      ui.list.append(section);
    });
}

function getActiveDevice() {
  const active = ui.buttons.find((btn) => btn.classList.contains('active'));
  return active?.dataset.device || 'desktop';
}

/** Draws the tab for the device picked in its Desktop / Mobile toggle. */
export function renderAccessibility() {
  const metrics = getPageSpeedMetrics(getActiveDevice());
  if (!metrics || metrics.accessibilityScore === undefined) {
    ui.list.innerHTML = '<p class="placeholder-text">Accessibility metrics unavailable for this device.</p>';
    return;
  }
  drawGauge(ui.gauge, metrics.accessibilityScore);
  renderAudits(metrics.accessibilityAudits);
}

/**
 * Overview warning: when a device's accessibility score is below "high",
 * the title of its first failed check (desktop first, then mobile).
 */
export function getAccessibilityMessage() {
  const titles = ['desktop', 'mobile'].map((device) => {
    const metrics = getPageSpeedMetrics(device);
    if (!metrics || qualityFromScore(metrics.accessibilityScore, true) === 'high') return '';
    const firstGroup = groupAudits(metrics.accessibilityAudits).find((g) => g.audits.length > 0);
    return firstGroup ? firstGroup.audits[0].title : '';
  });
  return titles.find(Boolean) || '';
}

export function initAccessibility(root) {
  const tab = root.querySelector('#accessibilityDetail');
  ui = {
    gauge: tab.querySelector('.performance-score-widget'),
    list: tab.querySelector('#trafficMetricsContainer'),
    buttons: [...tab.querySelectorAll('.accessibility-toggle .toggle-btn')],
  };

  // Placeholder score from the markup until PageSpeed has answered.
  drawGauge(ui.gauge, ui.gauge.dataset.score);

  ui.buttons.forEach((btn) => btn.addEventListener('click', () => {
    if (btn.classList.contains('active')) return;
    ui.buttons.forEach((other) => {
      other.classList.toggle('active', other === btn);
      other.setAttribute('aria-selected', String(other === btn));
    });
    renderAccessibility();
  }));
}
