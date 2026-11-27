/*
 * Propensity Nudge block.
 * Shows one of three modal nudges based on the score published by
 * scripts/propensity.js (requires the ap-propensity-segment page metadata).
 *   High   : score >= 13
 *   Medium : 7 <= score <= 12
 *   Low    : score <= 6
 *
 * Authoring (one row per band, all optional; defaults are used when empty):
 * | Propensity Nudge                                                  |
 * | High   | Title | Description | [Button label](https://link)     |
 * | Medium | Title | Description | [Button label](https://link)     |
 * | Low    | Title | Description | [Button label](https://link)     |
 */

const DISMISS_KEY = 'apPropensityNudgeDismissed';
const SERVICE_URL = '/services/asian-paints-safe-painting-service.html';

const DEFAULTS = {
  high: {
    title: 'Ready to waterproof your home?',
    text: 'Book a waterproofing consultation with our experts and protect your walls and roof.',
    cta: 'Book Consultation',
    url: SERVICE_URL,
  },
  medium: {
    title: 'Planning waterproofing?',
    text: 'Estimate your cost or get an expert recommendation for your home.',
    cta: 'Estimate Cost',
    url: '/resources/tools/waterproofing-budget-calculator.html',
  },
  low: {
    title: 'Dampness or leakage troubles you?',
    text: 'Explore waterproofing solutions and learn what works best for your home.',
    cta: 'Explore Solutions',
    url: '/services/waterproofing-solutions.html',
  },
};

export function getBand(score) {
  if (score === null || score === undefined || score === '') return '';
  const value = parseFloat(score);
  if (Number.isNaN(value)) return '';
  if (value >= 13) return 'high';
  if (value >= 7) return 'medium';
  return 'low';
}

function readConfig(block) {
  const config = {};
  Object.keys(DEFAULTS).forEach((band) => {
    config[band] = { ...DEFAULTS[band] };
  });

  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const band = cells[0]?.textContent.trim().toLowerCase();
    if (!config[band]) return;

    const title = cells[1]?.textContent.trim();
    const text = cells[2]?.textContent.trim();
    const link = cells[3]?.querySelector('a');
    const cta = (link?.textContent || cells[3]?.textContent || '').trim();

    if (title) config[band].title = title;
    if (text) config[band].text = text;
    if (cta) config[band].cta = cta;
    if (link?.href) config[band].url = link.href;
  });
  return config;
}

function isDismissed() {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === 'true';
  } catch (e) {
    return false;
  }
}

function setDismissed() {
  try {
    window.sessionStorage.setItem(DISMISS_KEY, 'true');
  } catch (e) {
    // storage unavailable; the nudge may show again on the next page
  }
}

function buildModal(band, {
  title, text, cta, url,
}) {
  const dialog = document.createElement('dialog');
  dialog.className = `propensity-nudge-modal propensity-nudge-${band}`;
  dialog.dataset.band = band;
  dialog.setAttribute('aria-labelledby', 'propensity-nudge-title');

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'propensity-nudge-close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '\u00D7';

  const heading = document.createElement('h2');
  heading.id = 'propensity-nudge-title';
  heading.textContent = title;

  const body = document.createElement('p');
  body.textContent = text;

  const link = document.createElement('a');
  link.className = 'propensity-nudge-cta';
  link.href = url;
  link.textContent = cta;

  dialog.append(close, heading, body, link);

  close.addEventListener('click', () => dialog.close());
  link.addEventListener('click', setDismissed);
  // a click on the backdrop targets the dialog element itself
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    setDismissed();
    dialog.remove();
  });
  return dialog;
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const config = readConfig(block);
  block.textContent = '';

  if (isDismissed()) return;

  const show = (result) => {
    if (!result || result.status !== 'SUCCESS' || isDismissed()) return;
    if (document.querySelector('dialog.propensity-nudge-modal')) return;

    const band = getBand(result.score);
    if (!band) return;

    const dialog = buildModal(band, config[band]);
    document.body.append(dialog);
    dialog.showModal();
  };

  // the score is fetched by scripts/propensity.js (delayed phase)
  document.addEventListener('apPropensityReady', (e) => show(e.detail));
  show(window.apPropensity);
}
