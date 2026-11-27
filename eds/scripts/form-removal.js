/*
 * Lead form removal for visitors who already sent a lead. Set up in the nav document's
 * "form-removal-config" block (label | value rows, read in this order):
 *   1. Allow form removal                              "true" turns it on (default: off)
 *   2. Form removal cookie expiry days                 the cookie's lifetime (none: the session)
 *   3. Form campaign ID's where form removal is ignored     campaign IDs, comma-separated
 *   4. Form blocks where form removal is ignored            block names, comma-separated
 *   5. Download CTA where form removal is ignored           CTA classes, comma-separated
 *
 * A lead Salesforce accepted from a form with a name, email, mobile number and pincode sets the
 * apLeadFormFilled cookie (leadFormFilled, called by the forms and tools that send leads); a lead
 * of a row 3 campaign leaves the cookie as it is. While the cookie is set:
 *   - lead form blocks are removed from every page (scripts.js loads this module for visitors
 *     with the cookie), except the row 4 blocks and forms of a row 3 campaign; the form just
 *     filled goes once its thank-you is closed
 *   - tools skip their lead step (data-attr-skip-form="true", the switch Adobe Target also uses)
 *   - lead form pop-ups (modal.js) only open from a CTA with a row 5 class
 * While row 1 is not "true" nothing changes, and the cookie is removed.
 */
import { getMetadata, toClassName } from './aem.js';

export const COOKIE = 'apLeadFormFilled';

// lead form blocks: removed while the cookie is set
const FORM_BLOCKS = ['form', 'lead-form', 'form-banner', 'hero-form', 'form-consultation'];
// lead forms that blocks build inside themselves: the blog page's form card
const INNER_FORMS = ['.ap-blogs-form-card'];
// tools with a lead step: they skip it while the cookie is set
const TOOL_BLOCKS = [
  'wallpaint-tool', 'paint-quotation-tool', 'wbc-calculator', 'bhs-calculator',
  'texture-finder', 'texture-finder-tool-test', 'colour-quiz', 'festive-palette',
];

const blocks = (names) => names.map((name) => `.block[data-block-name="${name}"]`);
const FORMS = [...blocks(FORM_BLOCKS), ...INNER_FORMS].join(', ');
const TOOLS = blocks(TOOL_BLOCKS).join(', ');
// a form's thank-you (or other result) screen is showing
const THANK_YOU = [
  '.thank-you-active', '.success-active', '.is-thankyou', '.form-popup-overlay--success',
  '.ap-blogs-form-done',
].join(', ');
// pop-ups decide at opening (formPopupAllowed); the forms in them are left alone
const POPUP = 'dialog, .modal';
// what a section can hold besides content (all hidden)
const SECTION_EXTRAS = '.section-metadata, .form-config-wrapper, .form-configs-wrapper';
// how long after a click a pop-up opening counts as opened by it (its code may load first)
const OPENER_WINDOW = 10000;

/* ---------- cookie ---------- */

function readCookie() {
  const entry = document.cookie.split(';').map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`));
  return entry === undefined ? null : entry.slice(COOKIE.length + 1);
}

export const hasLeadFormCookie = () => readCookie() === 'true';

function setCookie(days) {
  const expires = days > 0 ? `;expires=${new Date(Date.now() + days * 864e5).toUTCString()}` : '';
  document.cookie = `${COOKIE}=true${expires};path=/`;
}

function clearCookie() {
  if (readCookie() !== null) document.cookie = `${COOKIE}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
}

/* ---------- config ---------- */

/** a cell's comma-separated values (also one per paragraph or list item) */
function values(cell) {
  if (!cell) return [];
  const parts = cell.querySelector('p, li')
    ? [...cell.querySelectorAll('p, li')].map((el) => el.textContent)
    : [cell.textContent];
  return parts.flatMap((part) => part.split(/[,;\n]/)).map((v) => v.trim()).filter(Boolean);
}

let configPromise;

/**
 * The nav document's form-removal-config block, read once a page.
 * @returns {Promise<object|null>} { enabled, days, campaigns, blocks, ctas }; null when the nav
 *   could not be read (then nothing changes, and the cookie stays)
 */
export function getFormRemovalConfig() {
  if (!configPromise) {
    const navMeta = getMetadata('nav');
    const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';
    configPromise = fetch(`${navPath}.plain.html`)
      .then((resp) => (resp.ok ? resp.text() : Promise.reject(new Error(`${resp.status}`))))
      .then((html) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const rows = [...(doc.querySelector('.form-removal-config')?.children || [])];
        const cell = (row) => rows[row]?.children[1];
        const days = parseFloat(cell(1)?.textContent);
        return {
          enabled: (cell(0)?.textContent || '').trim().toLowerCase() === 'true',
          days: days > 0 ? days : 0,
          campaigns: values(cell(2)).map((id) => id.toLowerCase()),
          blocks: values(cell(3)).map(toClassName),
          ctas: values(cell(4)).map((cls) => cls.replace(/^\./, '')),
        };
      })
      .catch(() => null);
  }
  return configPromise;
}

/** the config while form removal is on; with it off, the cookie is removed */
async function activeConfig() {
  const config = await getFormRemovalConfig();
  if (config && !config.enabled) clearCookie();
  return config?.enabled ? config : null;
}

/* ---------- which forms stay ---------- */

const rowValue = (row) => (row?.children[1] || row?.children[0])?.textContent.trim() || '';

/** the form-config block a form reads (its section, then earlier, then later ones), as form.js */
function nearestFormConfig(el) {
  const selector = '.form-config, .form-configs';
  const section = el.closest('.section');
  if (!section) return null;
  const own = section.querySelector(selector);
  if (own) return own;
  const search = (step) => {
    for (let s = section[step]; s; s = s[step]) {
      const config = s.querySelector?.(selector);
      if (config && !s.classList.contains('form-banner-container')) return config;
    }
    return null;
  };
  return search('previousElementSibling') || search('nextElementSibling');
}

const isCampaignLabel = (label) => {
  const key = toClassName(label);
  return /(^|-)campaign-id$/.test(key) && !key.includes('interested');
};

/** the campaign IDs a form (or tool) may send its lead with, lower case */
function campaignIds(el) {
  const ids = [new URLSearchParams(window.location.search).get('utm_campaign')];
  [el, ...el.querySelectorAll('[data-campaign-id], [data-attr-campaignid]')].forEach((node) => {
    ids.push(node.getAttribute('data-campaign-id'), node.getAttribute('data-attr-campaignid'));
  });
  // an authored "Campaign ID" row (a block not decorated yet)
  [...el.children].forEach((row) => {
    if (row.children.length > 1 && isCampaignLabel(row.children[0].textContent)) {
      ids.push(rowValue(row));
    }
  });
  const config = nearestFormConfig(el);
  if (config) {
    const rows = [...config.children];
    ids.push(rowValue(rows.find((row) => isCampaignLabel(row.children[0]?.textContent || ''))
      || rows[0]));
  }
  return ids.map((id) => (id || '').trim().toLowerCase()).filter(Boolean);
}

/** a row 4 block, or a form of a row 3 campaign */
function isKept(el, config) {
  const name = el.dataset.blockName || el.closest('.block')?.dataset.blockName || '';
  return config.blocks.includes(name)
    || campaignIds(el).some((id) => config.campaigns.includes(id));
}

/* ---------- removal ---------- */

const thankYouOpen = (el) => el.matches(THANK_YOU) || !!el.querySelector(THANK_YOU);

function removeForm(el) {
  const name = el.dataset.blockName;
  const wrapper = name && el.parentElement?.classList.contains(`${name}-wrapper`)
    ? el.parentElement : el;
  const section = wrapper.parentElement?.closest('.section');
  wrapper.remove();
  // a section left with nothing to show would be an empty gap
  if (section && [...section.children].every((child) => child.matches(SECTION_EXTRAS))) {
    section.hidden = true;
  }
}

// forms waiting for their thank-you to close
const pending = new WeakSet();

function removeAfterThankYou(form) {
  if (pending.has(form)) return;
  pending.add(form);
  const observer = new MutationObserver(() => {
    if (thankYouOpen(form)) return;
    observer.disconnect();
    removeForm(form);
  });
  observer.observe(form, {
    attributes: true, attributeFilter: ['class', 'hidden'], childList: true, subtree: true,
  });
}

function apply(root, config) {
  const find = (selector) => [
    ...(root.matches(selector) ? [root] : []),
    ...root.querySelectorAll(selector),
  ];
  find(FORMS).forEach((form) => {
    // nested forms go (or stay) with the outer one; pop-ups decide at opening
    if (form.parentElement?.closest(FORMS) || form.closest(POPUP) || pending.has(form)) return;
    if (isKept(form, config)) return;
    if (thankYouOpen(form)) removeAfterThankYou(form);
    else removeForm(form);
  });
  find(TOOLS).forEach((tool) => {
    if (!isKept(tool, config)) tool.dataset.attrSkipForm = 'true';
  });
}

let observing = false;

/** removes the forms on the page now, and those added later (fragments, lazy content) */
function start(config) {
  apply(document.body, config);
  if (observing) return;
  observing = true;
  new MutationObserver((records) => records.forEach(({ addedNodes }) => addedNodes
    .forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE && node.isConnected) apply(node, config);
    }))).observe(document.body, { childList: true, subtree: true });
}

/**
 * Removes the lead forms (and the tools' lead steps) for a visitor with the cookie. Started from
 * scripts.js once the page is decorated; with form removal off it removes the cookie.
 */
export default async function removeLeadForms() {
  if (readCookie() === null) return;
  const config = await activeConfig();
  if (config && hasLeadFormCookie()) start(config);
}

/**
 * A lead Salesforce accepted: with a name, email, mobile number and pincode, and not of a row 3
 * campaign, it sets the cookie, and the page's forms go (the one filled once its thank-you is
 * closed).
 * @param {object} lead the values sent
 * @param {string} lead.name
 * @param {string} lead.email
 * @param {string} lead.mobile
 * @param {string} lead.pincode
 * @param {string} [lead.campaignId]
 * @param {Element} [form] the form filled
 */
export async function leadFormFilled({
  name, email, mobile, pincode, campaignId,
} = {}, form = null) {
  if (![name, email, mobile, pincode].every((value) => String(value ?? '').trim())) return;
  const config = await activeConfig();
  if (!config || config.campaigns.includes(String(campaignId ?? '').trim().toLowerCase())) return;
  setCookie(config.days);
  // after this task, so the form shows its thank-you by then
  setTimeout(() => {
    const filled = form?.isConnected ? form.closest(FORMS) : null;
    if (filled && !filled.closest(POPUP) && !isKept(filled, config)) removeAfterThankYou(filled);
    start(config);
  }, 0);
}

/* ---------- pop-ups ---------- */

let lastClick = null;
window.addEventListener('click', ({ target }) => {
  lastClick = { target, time: Date.now() };
}, true);

/**
 * The element whose click is opening a pop-up (read once, when the pop-up starts opening).
 * @returns {Element|null}
 */
export function popupOpener() {
  const click = lastClick;
  lastClick = null;
  return click && Date.now() - click.time < OPENER_WINDOW && click.target instanceof Element
    ? click.target : null;
}

/**
 * Whether a pop-up may open: one with a lead form opens for a visitor with the cookie only from a
 * row 5 CTA, or when its form is kept (row 3 campaign, row 4 block).
 * @param {Element|null} opener the CTA clicked (popupOpener)
 * @param {Element|null} [content] the pop-up's content; none counts as a lead form
 * @returns {Promise<boolean>}
 */
export async function formPopupAllowed(opener, content = null) {
  if (!hasLeadFormCookie()) return true;
  const forms = content ? [...content.querySelectorAll(FORMS)] : null;
  if (forms && !forms.length) return true;
  const config = await activeConfig();
  if (!config || !hasLeadFormCookie()) return true;
  if (opener && config.ctas.some((cls) => opener.closest(`.${CSS.escape(cls)}`))) return true;
  return !!forms?.some((form) => isKept(form, config));
}
