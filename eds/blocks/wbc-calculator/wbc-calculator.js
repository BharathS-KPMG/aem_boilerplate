/**
 * WBC Calculator — the Waterproofing Budget Calculator, migrated from the AEM
 * budget-calculator component (wbcCalculator variant).
 *
 * The block renders the AEM component's markup, so wbc-calculator.css can
 * apply the prod CSS as-is, and repeats its behaviour: surface / project /
 * area selection, the lead form (validation, CCFormFields cookie, lead
 * submission), the result card stack with the SmartCare variant, and the PDF.
 *
 * All copy comes from DA; all product data from the waterproofing API.
 * Hosts come from scripts/environment.js: relative image and link paths are
 * resolved on PROD_DOMAIN on prod and BETA_DOMAIN everywhere else; the API
 * is called on that host, or on STATIC_DOMAIN off the AEM site.
 *
 * Authoring: every row is `key | value`. A single-cell marker row reading
 * "Screen 1", "Screen 2", "Screen 3" or "PDF" starts that section's rows;
 * rows before the first marker (Background, Endpoint, …) are shared. A row
 * that is not authored renders nothing. Image cells take an image, or a DAM
 * path typed as text or as a link (resolved on the environment's site host).
 *
 * Shared
 *   Background           | desktop image | mobile image (desktop if empty)
 *   Endpoint             | /apcolourcatalogue/paintBudgetCalculator.waterproofing.json
 *                          (relative = the API host above; full URL as-is)
 *   Language | en        APL Type | APL_WEB        Multiplier Value | 1
 *   (sent to the endpoint with the area, project type and surface)
 *   Storage Key | miniFormValues   (optional; the calculator-hub block's
 *     storageKey, default miniFormValues; see "From the calculator hub")
 *
 * From the calculator hub — the hub's WBC mini form saves its answers in
 *   localStorage under Storage Key as { ProjectType: surface, SpaceType:
 *   project type, Area } and opens this page. When the surface and project
 *   type match a Surface and a Project Type row (by value or label) and the
 *   area is at least Minimum Area, Screen 1 is skipped: its answers are
 *   filled in, the endpoint is called in the background and the block opens
 *   on Screen 2 (on Screen 3 when Skip Form is "true"). The saved answers
 *   are used once (the key is removed), so a reload starts on Screen 1, as
 *   does Calculate again. If the endpoint fails, Screen 1 shows with its
 *   Technical Error.
 *
 * Screen 1 — surface, project type and area
 *   Title | …   Description | …
 *   Surface Label | Select your surface *        (a trailing "*" is styled)
 *   Surface | icon | label | value               (repeat; the value is sent as
 *                                                 `surface`, the label if empty)
 *   Project Type Label | Select your type of project *
 *   Project Type | label | value                 (repeat; sent as `paint`)
 *   Area Label | …   Area Placeholder | …   Minimum Area | 100
 *   Area Error | …   (shown on blur when the area is below Minimum Area)
 *   CTA | Calculate now   (enabled once a surface, a project type and an area
 *     of at least Minimum Area are given)
 *   Technical Error | …   (shown below the CTA when the endpoint fails; the
 *     user stays on Screen 1)
 *
 * Screen 2 — lead form (prefilled from the CCFormFields cookie; skipped once
 *   it has been submitted, until the page is reloaded)
 *   Title | …   Description | …
 *   Name Label | Enter your name *     Name Placeholder | …     Name Error | …
 *   Email Label | Email *              Email Placeholder | …    Email Error | …
 *   Mobile Label | Mobile Number *     Mobile Placeholder | …   Mobile Error | …
 *   PIN Code Label | PIN Code *        PIN Code Placeholder | … PIN Code Error | …
 *   Country Code | +91
 *   Fields are checked on blur and on submit: name = letters and single
 *   spaces, email, mobile = 10 digits not starting with 0, PIN = 6 digits.
 *   An empty field shows Required Error | Field is required.
 *   WhatsApp Label | Get updates on WhatsApp     (checked by default)
 *   Question | label * | • option • option | • value • value
 *     (two rows; the values are what the lead sends, the option if empty:
 *     question 1 as `remarks`, question 2 as `answer`)
 *   Disclaimer | rich text with links
 *   CTA | Get an estimate
 *   Skip CTA | show | hide   (optional, default hide)   Skip Label | Skip
 *     (the Skip link goes straight to Screen 3, with no lead)
 *   Skip Form | true | false   (optional, default false; set on the block as
 *     data-attr-skip-form, which scripts such as Adobe Target can change to
 *     show / skip the form). When "true", Calculate now goes straight from
 *     Screen 1 to Screen 3: no lead form and no lead.
 *   A skipped form still offers Download PDF; the PDF's name, mobile and
 *   email are left blank.
 *   Error Title | Sorry!   Error Description | …   Error Calculate Again | …
 *   Error Close Icon | image
 *     When the lead cannot be sent, the error panel replaces the form; its
 *     close icon and Calculate again return to Screen 1.
 *   Campaign ID | id     (optional fallback for the form-config block's campaign_id)
 *   Node | path          (optional fallback for the form-config block's node;
 *                         Resource Path is read too)
 *   The lead's campaign ID and node are read as form.js reads them, from a
 *   form-config block (row 1 = campaign_id | id, row 2 = node | path) in this
 *   block's section, or else the nearest earlier, then later, section with
 *   one. utm_campaign wins over the campaign ID; the node defaults to the
 *   page path.
 *   On submit the lead is sent as in the site's other lead blocks:
 *   submitLeadFromForm saves it to the DB, then Salesforce (on the beta
 *   domain off prod). Screen 3 opens once both succeed.
 *
 * Screen 3 — recommendations (one card per system the endpoint returns)
 *   Calculate Again | …   Title | …
 *   Subtitle | …           (shown at 992px and below only)
 *   Description | rich text + list          (beside the cards)
 *   Description Mobile | rich text + list   (inside each card, on mobile)
 *   Card Title | …   Cost Label | … {area} sqft   Per Sqft Label | …
 *   Products Title | …   View Product | …   Required Label | Required
 *   Disclaimer | …   PDF Text | …   PDF CTA | Download PDF
 *   PDF on iOS | show | hide   (optional, default hide: the PDF row is hidden
 *     on iPhone / iPad)
 *   New Tab | true | false     (product links; optional, default true)
 *   Warranty Text | … {warranty} …   (shown when the system has a warranty)
 *   Previous Label | …   Next Label | …   (aria labels of the card arrows)
 *   SmartCare SKUs | 1048, …   (comma-separated; a listed system with only a
 *     first step shows the SmartCare panel in place of the product list)
 *   SmartCare Image | desktop image | mobile image
 *   SmartCare Heading | …   SmartCare Subtitle | …   SmartCare Product Name | …
 *   SmartCare CTA | label | product path (or a link)
 *
 * PDF — generated in the browser (pdf.js) from all the recommendations
 *   File Name | waterproofing-budget-estimate   Logo | image
 *   Greeting | Dear   Header Text | …   Mobile Label | …   Email Label | …
 *   Recommended Title | …   Product Subtitle | …
 *   Cost Label | … {area} sqft   Per Sqft Label | …
 *   Steps Title | …   Step Label | STEP   Coat Labels | COAT | COATS
 *   Layer Labels | PRIMER | PUTTY | FINAL LAYER   (PUTTY for a product named
 *     "putty", FINAL LAYER for the last step, PRIMER otherwise)
 *   Warranty Logo | image   Warranty Labels | Upto | Warranty
 *   Disclaimer | …   (optional, shown after the second system)
 *   Contact Text | …
 *   Why Title | …   Why Item | icon | title | description   (repeat)
 *   How Title | …   How Item | icon | title | description   (repeat)
 *   Plans Title | …   Included Icon | image   Warranty Icon | image
 *   Plan | icon | name | "Included" + list, "Warranty" + list | classic | gold | platinum
 *     (repeat)
 *   Plans Call Text | … {phone} …   Plans Phone | 1800-266-2090
 *   Compare Disclaimer | …   (Plans Disclaimer if not authored)
 *   Plans Disclaimer | …
 */
import {
  BETA_DOMAIN, PROD_DOMAIN, STATIC_DOMAIN, isProdDomain,
} from '../../scripts/environment.js';

// Images, product pages and the API are on the prod domain only on prod;
// every other host (beta, EDS preview/live, localhost) uses the beta domain.
const SITE_HOST = `https://${isProdDomain() ? PROD_DOMAIN : BETA_DOMAIN}`;
// www and beta only answer API calls from their own origin. Anywhere else
// (EDS preview/live, localhost) the API is read from the static CDN, which
// serves the same JSON with Access-Control-Allow-Origin: *.
const ON_SITE = isProdDomain() || window.location.hostname === BETA_DOMAIN;
const API_HOST = ON_SITE ? SITE_HOST : `https://${STATIC_DOMAIN}`;

// The lead APIs only exist on the AEM site, not on EDS preview/live or the
// local `aem up` proxy, so off prod they are called on the beta domain. On
// prod the defaults (same-origin, relative paths) are used.
const LEAD_ENDPOINTS = !isProdDomain() ? {
  saveToDB: `https://${BETA_DOMAIN}/apcolourcatalogue/ccforms.saveleadform.json`,
  pushToSalesforce: `https://${BETA_DOMAIN}/apcolourcatalogue/ccforms/salesforce.leadstosalesforce.json`,
} : undefined;

// The lead script (form-submit-common.js and its aesUtil.module.js) is kept
// off the block's render path, so it cannot delay LCP: it loads on first
// use, started by "Calculate now" while the API call runs.
let leadApi = null;
function loadLeadApi() {
  if (!leadApi) {
    leadApi = import('../../scripts/form-submit-common.js').catch((err) => {
      leadApi = null;
      throw err;
    });
  }
  return leadApi;
}

const FORM_CONFIG_SELECTOR = '.form-config, .form-configs';

// As form.js finds it: the form-config block in this block's section, else
// the nearest earlier, then later, section with one (skipping form banners,
// which carry their own).
function findFormConfig(block) {
  const section = block.closest('.section');
  if (!section) return null;
  const own = section.querySelector(FORM_CONFIG_SELECTOR);
  if (own) return own;
  const inSection = (s) => (!s.classList.contains('form-banner-container')
    && s.querySelector(FORM_CONFIG_SELECTOR)) || null;
  for (let s = section.previousElementSibling; s; s = s.previousElementSibling) {
    const found = inSection(s);
    if (found) return found;
  }
  for (let s = section.nextElementSibling; s; s = s.nextElementSibling) {
    const found = inSection(s);
    if (found) return found;
  }
  return null;
}

// Reads `campaign_id | id` (row 1) and `node | path` (row 2) by position, as
// form.js does, and hides the config block (and its section, if that holds
// nothing else).
function readFormConfig(block) {
  const config = findFormConfig(block);
  if (!config) return { campaignId: '', node: '' };
  const value = (row) => {
    const cells = row ? [...row.children] : [];
    return (cells.length > 1 ? cells[1] : cells[0])?.textContent.trim() || '';
  };
  const [campaignRow, nodeRow] = [...config.children];

  config.style.display = 'none';
  const wrapper = config.closest('.form-config-wrapper, .form-configs-wrapper');
  if (wrapper) wrapper.style.display = 'none';
  const section = config.closest('.section');
  if (section && section !== block.closest('.section')
    && [...section.children].every((child) => child.contains(config))) {
    section.style.display = 'none';
  }

  return { campaignId: value(campaignRow), node: value(nodeRow) };
}

// HTML for innerHTML / insertAdjacentHTML. Pages that enforce Trusted Types
// without a default policy (scripts.js usually adds one) get a block policy.
let ttPolicy;
function html(markup) {
  const tt = window.trustedTypes;
  if (!tt || !tt.createPolicy || tt.defaultPolicy) return markup;
  if (ttPolicy === undefined) {
    try {
      ttPolicy = tt.createPolicy('wbc-calculator', { createHTML: (value) => value });
    } catch (e) {
      ttPolicy = null;
    }
  }
  return ttPolicy ? ttPolicy.createHTML(markup) : markup;
}

const MOBILE = window.matchMedia('(max-width: 991px)');
const STEP_KEYS = ['stepOne', 'stepTwo', 'stepThree', 'stepFour'];
const LEAD_IDS = {
  name: 'wbc-enquire-name',
  email: 'wbc-enquire-email',
  mobile: 'wbc-enquire-mobile',
  pincode: 'wbc-enquire-pincode',
};
const LEAD_SELECTORS = {
  name: `#${LEAD_IDS.name}`,
  email: `#${LEAD_IDS.email}`,
  mobile: `#${LEAD_IDS.mobile}`,
  pincode: `#${LEAD_IDS.pincode}`,
  whatsappConsent: '.form-whatsapp-consent',
  constructionWorkGoingOnRadio: '[name="NEW_CUSTOM_RADIO_customer_response_one"]:checked',
  localPainterHiredRadio: '[name="NEW_CUSTOM_RADIO_customer_response_two"]:checked',
};
// "javascript:void(0)" is what the AEM markup (and its CSS) uses on the
// carousel arrows.
// eslint-disable-next-line no-script-url
const VOID_HREF = 'javascript:void(0)';

/* ------------------------------------------------------------- helpers */

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function slug(text) {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// A path from the API or DA on the environment's host; full URLs as-is.
function absUrl(path) {
  const clean = (path || '').trim();
  if (!clean) return '';
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith('//')) return `https:${clean}`;
  return `${SITE_HOST}${clean.startsWith('/') ? '' : '/'}${clean}`;
}

// A page link: AEM appends ".html" to repository paths that lack it.
function pageUrl(path) {
  const clean = (path || '').trim();
  if (!clean) return '';
  const withExt = /^\/content\//.test(clean) && !/\.html(\?|#|$)/.test(clean) ? `${clean}.html` : clean;
  return absUrl(withExt);
}

const fill = (template, values) => template
  .replace(/<X>|\{(\w+)\}/g, (m, key) => {
    if (m === '<X>') return values.area ?? m;
    return key in values ? values[key] : m;
  });

// "Label *" → "Label <span class="form-global__required">*</span>".
function labelHtml(text, spaced) {
  const match = (text || '').match(/^(.*?)\s*\*$/);
  if (!match) return esc(text);
  return `${esc(match[1])} <span class="form-global__required">${spaced ? ' *' : '*'}</span>`;
}

const show = (node) => { if (node) node.style.display = ''; };
const hide = (node) => { if (node) node.style.display = 'none'; };

/* ----------------------------------------------------------- authoring */

function splitSections(rows) {
  const groups = {
    shared: [], 1: [], 2: [], 3: [], pdf: [],
  };
  let current = 'shared';
  rows.forEach((row) => {
    const text = row.textContent.trim();
    const marker = row.children.length <= 1 && text.match(/^(?:screen\s*([123])|(pdf))$/i);
    if (marker) {
      current = marker[1] || 'pdf';
      return;
    }
    groups[current].push(row);
  });
  return groups;
}

const REPEATABLE = ['surface', 'project-type', 'question', 'why-item', 'how-item', 'plan'];

function readRows(rows) {
  const cfg = Object.fromEntries(REPEATABLE.map((key) => [key, []]));
  rows.forEach((row) => {
    const cells = [...row.children];
    if (cells.length < 2) return;
    const key = slug(cells[0].textContent);
    const entry = {
      text: cells[1].textContent.trim(), cell: cells[1], cells: cells.slice(1),
    };
    if (REPEATABLE.includes(key)) cfg[key].push(entry);
    else cfg[key] = entry;
  });
  return cfg;
}

const copy = (cfg, key) => (cfg[key] ? cfg[key].text : '');
const cellText = (entry, i) => (entry.cells[i] ? entry.cells[i].textContent.trim() : '');
const listItems = (cell) => (cell ? [...cell.querySelectorAll('li')].map((li) => li.textContent.trim()) : []);

// An image cell: the authored image, or a DAM path typed as text.
function imageUrl(cell) {
  if (!cell) return '';
  const img = cell.querySelector('img');
  if (img) return (img.currentSrc || img.src).split('?')[0];
  const link = cell.querySelector('a[href]');
  return absUrl(link ? link.getAttribute('href') : cell.textContent);
}

const configImage = (cfg, key, i = 0) => (cfg[key] ? imageUrl(cfg[key].cells[i]) : '');
// Authored rich text. Bold comes back as <strong>, but the prod CSS styles
// AEM's <b>, so it is written back as <b>.
const richHtml = (cfg, key) => (cfg[key]
  ? cfg[key].cell.innerHTML.trim().replace(/<(\/?)strong>/g, '<$1b>')
  : '');

/* --------------------------------------------------------- analytics */

// The site's analytics module is optional: without it, events are no-ops.
let analytics = null;
function track(name, data) {
  if (!analytics) {
    analytics = import('../../scripts/analytics_1.js').catch(() => ({}));
  }
  analytics.then((mod) => {
    try {
      if (name.startsWith('form')) {
        mod.pushAdobeFormEvents?.({ event: name, ...data });
      } else {
        mod.pushAdobeCalculatorEvents?.({ event: name, ...data });
      }
    } catch (e) { /* analytics must never break the calculator */ }
  });
}

function trackFormError(data) {
  if (!analytics) analytics = import('../../scripts/analytics_1.js').catch(() => ({}));
  analytics.then((mod) => { try { mod.trackFormError?.(data); } catch (e) { /* ignore */ } });
}

/* ------------------------------------------------------------ screen 1 */

// Screen 1 options as authored: the value is sent to the endpoint, the
// label when no value is authored.
function surfaceOption(entry) {
  const label = cellText(entry, 1);
  return { label, value: cellText(entry, 2) || label };
}
const projectOption = (entry) => ({ label: entry.text, value: cellText(entry, 1) || entry.text });

function screenOneHtml(cfg) {
  const surfaces = cfg.surface.map((entry, i) => {
    const { label, value } = surfaceOption(entry);
    return `<label tabindex="0" class="custom-radio">
        <input id="wbc-surface-${i}" name="project-surface" type="radio" value="${esc(value)}">
        <span class="radio-btn">
          <div class="hobbies-icon"><img class="" src="${esc(imageUrl(entry.cells[0]))}" alt=""></div>
          <h3 class="checkbox-title">${esc(label)}</h3>
        </span>
      </label>`;
  }).join('');
  const projects = cfg['project-type'].map((entry, i) => {
    const { label, value } = projectOption(entry);
    return `<label tabindex="0" for="wbc-project-${i}">${esc(label)}
        <input tabindex="-1" id="wbc-project-${i}" name="project-type" type="radio" value="${esc(value)}">
      </label>`;
  }).join('');
  const areaLabel = copy(cfg, 'area-label');
  return `<div class="user-input-surface-layout">
    <div tabindex="0" class="focus-visible-auto-imp title">${esc(copy(cfg, 'title'))}</div>
    <div tabindex="0" class="focus-visible-auto-imp sub-title">${esc(copy(cfg, 'description'))}</div>
    <div class="wraper wbcwraper">
      <fieldset class="wbcSurface-title">
        <legend tabindex="0" class="focus-visible-auto-imp">${labelHtml(copy(cfg, 'surface-label'))}</legend>
      </fieldset>
      <fieldset class="wbcSurface">${surfaces}</fieldset>
      <fieldset class="wbc-project-type">
        <legend tabindex="0" class="focus-visible-auto-imp">${labelHtml(copy(cfg, 'project-type-label'))}</legend>
        ${projects}
      </fieldset>
      <fieldset class="carpet-area">
        <legend tabindex="0" class="focus-visible-auto-imp" aria-label="${esc(areaLabel.replace(/\s*\*$/, ''))}">${labelHtml(areaLabel)}</legend>
        <label for="area" class="sqft-area">
          <input tabindex="0" id="area" name="area" placeholder="${esc(copy(cfg, 'area-placeholder'))}" type="number">
          <div class="carpet-area-error-msg d-none">${esc(copy(cfg, 'area-error'))}</div>
        </label>
      </fieldset>
      <div class="cta animated-btn-white round-corner-radius-button waterproofing">
        <button tabindex="0" aria-disabled="true" class="animated-arrow-button" disabled="disabled" id="calculate-now">
          ${esc(copy(cfg, 'cta'))}
          <span class="arrow"></span>
          <span class="rotating js-rotatingCalculateNow saving-progress-status d-none">↻</span>
        </button>
        <div class="calculatenow-error-msg d-none">${esc(copy(cfg, 'technical-error'))}</div>
      </div>
    </div>
  </div>`;
}

/* ------------------------------------------------------------ screen 2 */

function textField(cfg, key, id, extra = '') {
  return `<div class="form-global form-text-input form-global--normal form-text-input--normal floating-label form-global-layout-revamp">
      <label for="${id}" class="form-global__label form-text-input__label${key === 'mobile' ? ' phoneNumLabel' : ''} d-none">${labelHtml(copy(cfg, `${key}-label`), key !== 'name')}</label>
      <input style="background: #F9F9F9" data-input-field-color="#F9F9F9" id="${id}" class="form-text-input__field${key === 'mobile' ? ' telNum' : ''}" type="text" data-field-type="text-input" placeholder="${esc(copy(cfg, `${key}-placeholder`))}" ${extra}>
    </div>`;
}

function questionHtml(entry, i) {
  const names = ['one', 'two'];
  const values = listItems(entry.cells[2]);
  const options = listItems(entry.cells[1]).map((label, j) => `<label class="form-global__inline-label form-radio-input__inline-label">
        <input tabindex="-1" type="radio" name="NEW_CUSTOM_RADIO_customer_response_${names[i] || i}" value="${esc(values[j] || label)}" class="form-radio-input__field form-global__custom focus-visible-auto">
        <span tabindex="0" class="focus-visible-auto-imp form-global__custom-element form-radio-input__custom-element align-middle" role="radio" aria-checked="false" aria-label="${esc(label)}"></span>
        <span class="form-global__custom-label-text align-middle d-inline-block ml-1">${esc(label)}</span>
      </label>`).join('');
  return `<div class="disclaimer-ques-${names[i] || i} disclaimer-group">
      <p tabindex="0" class="focus-visible-auto-imp">${labelHtml(entry.text)}</p>
      <div class="label-wraper">${options}</div>
    </div>`;
}

// Screen 2 "Skip CTA" (Show / Hide, hidden when not authored) and
// "Skip Label": prod's .skip-form link under "Get an estimate".
function skipHtml(cfg) {
  if (!/^(show|yes|true)$/i.test(copy(cfg, 'skip-cta'))) return '';
  return `<div class="skip-form" role="button" tabindex="0">${esc(copy(cfg, 'skip-label') || 'Skip')}</div>`;
}

function screenTwoHtml(cfg, pdfName, lead) {
  return `<div class="budget-form-layout wbc-form-variant" style="display: none">
    <div class="budget-form-header">
      <div tabindex="0" class="focus-visible-auto-imp title">${esc(copy(cfg, 'title'))}</div>
      <div tabindex="0" class="focus-visible-auto-imp sub-title">${esc(copy(cfg, 'description'))}</div>
    </div>
    <div class="form-layout-container">
      <div class="ccforms form-attributes" style="background: #fff" data-form-bg-color="#fff" data-attr-campaignId="${esc(lead.campaignId)}" data-attr-resourcePath="${esc(lead.node)}" data-attr-pdfName="${esc(pdfName)}">
        <div class="track_form_title enquire-form__step" data-step="1">
          <form name="form-layout-revamp" class="form-layout-revamp js-form-layout-revamp" novalidate autocomplete="off">
            <div class="track_field_focus">
              <div class="row-parent">
                ${textField(cfg, 'name', LEAD_IDS.name, 'name="ENQUIRE_NAME" data-validate="name" maxlength="30" autocomplete="name"')}
                ${textField(cfg, 'email', LEAD_IDS.email, 'name="ENQUIRE_EMAIL" data-validate="email" autocomplete="email"')}
              </div>
              <div class="row-parent">
                <div class="phone-number-revamp">
                  ${textField(cfg, 'mobile', LEAD_IDS.mobile, 'name="ENQUIRE_MOBILE" data-validate="mobile" autocomplete="tel-national"')}
                  <div class="MobileNum d-flex" style="background: #F9F9F9" data-input-field-color="#F9F9F9">
                    <span class="spriteIcon-Aprevamp CountryFlag"></span>
                    <span class="CountryCode">${esc(copy(cfg, 'country-code'))}</span>
                    <div class="line-break"></div>
                  </div>
                </div>
                ${textField(cfg, 'pin-code', LEAD_IDS.pincode, 'name="ENQUIRE_PINCODE" data-validate="pincode" maxlength="6" autocomplete="postal-code"')}
              </div>
            </div>
            <div class="new-questions-wrapper">
              <label class="form-checkbox-input__custom form-checkbox-input__custom--left form-whatsapp-consent" tabindex="0">
                <input type="checkbox" name="CUSTOM_CHECKBOX" tabindex="-1" class="form-checkbox-input__field form-global__custom" checked>
                <span tabindex="0" role="button" aria-pressed="true" class="form-checkbox-input__custom--check whatsApp-toggle whatsAppCheckbox js-whatsappCheckbox whatsAppCheckbox-checked whatsAppConsentFormFld focus-visible-auto-imp"></span>
                <span tabindex="0" class="form-global-label-text focus-visible-auto-imp">${esc(copy(cfg, 'whatsapp-label'))}</span>
              </label>
              <div class="new-disclaimer-questions disclaimer-questions">${cfg.question.map(questionHtml).join('')}</div>
            </div>
            <div tabindex="0" class="focus-visible-auto-imp form-disclaimer"><p class="revisedDisclaimer">${cfg.disclaimer ? (cfg.disclaimer.cell.querySelector('p') || cfg.disclaimer.cell).innerHTML : ''}</p></div>
            <div class="cta ctaComp baseBtn ctaRevampYellow">
              <button tabindex="0" type="submit" class="ctaText track_form_submit animated-arrow-btn yellow-gradient" data-current-step="1">
                ${esc(copy(cfg, 'cta'))}
                <span class="arrow"></span>
                <span class="rotating js-rotatingLeadForm saving-progress-status d-none">↻</span>
              </button>
            </div>
            ${skipHtml(cfg)}
          </form>
        </div>
      </div>
      <div class="ccformsError" style="display: none">
        <button tabindex="0" type="button" class="focus-visible-auto-imp back form-error-back">${esc(copy(cfg, 'error-calculate-again'))}</button>
        <div class="error-slide d-flex" style="background: #fff" data-form-bg-color="#fff">
          <div class="error-msg">
            <p class="error-heading">${esc(copy(cfg, 'error-title'))}</p>
            <p class="error-description">${esc(copy(cfg, 'error-description'))}</p>
          </div>
          <a tabindex="0" class="iconLinks form-layout-revamp__close" role="button"><img loading="lazy" alt="closeIcon" title="closeIcon" src="${esc(configImage(cfg, 'error-close-icon'))}"></a>
        </div>
      </div>
    </div>
  </div>`;
}

/* ------------------------------------------------------------ screen 3 */

function screenThreeHtml(cfg) {
  const again = esc(copy(cfg, 'calculate-again'));
  return `<div class="estimated-result-layout" style="display: none">
    <div class="info-section">
      <button type="button" class="back">${again}</button>
      <div class="info-section-wraper">
        <h2 class="info-title">${esc(copy(cfg, 'title'))}</h2>
        <h4 class="info-sub-title">${esc(copy(cfg, 'subtitle'))}</h4>
        <div class="estimate-includes info-description">${richHtml(cfg, 'description')}</div>
      </div>
    </div>
    <div class="recommend-product-section">
      <div class="container-wraper">
        <div class="card-stack">
          <a class="buttons prev disabled" href="${VOID_HREF}" role="button" aria-label="${esc(copy(cfg, 'previous-label'))}"></a>
          <ul class="card-list"></ul>
          <a class="buttons next" href="${VOID_HREF}" role="button" aria-label="${esc(copy(cfg, 'next-label'))}"></a>
        </div>
      </div>
      <button type="button" class="back mob-view" style="display: none">${again}</button>
    </div>
  </div>`;
}

// "2 SC Damp Proof | image | product path | sku | … | quantity" → step.
function parseStep(raw, stepTitle) {
  if (!raw || !raw.trim()) return null;
  const parts = raw.split('|');
  const first = parts[0];
  const coats = first.substring(0, first.indexOf(' '));
  return {
    stepTitle,
    numberOfCoats: coats,
    mainTitle: first.substring(first.indexOf(' ') + 1),
    imagePath: (parts[1] || '').trim(),
    productUrl: parts[2] ? parts[2].trim() : '',
    prodQty: parts[6],
  };
}

function cardHtml(system, index, total, area, cfg, target, smartSkus) {
  const L = (key) => esc(copy(cfg, key));
  let position = '';
  if (index === 0) position = 'first';
  else if (index === total - 1) position = 'last';
  const cost = system.bhpsCost ? system.bhpsCost : system.mrp;
  const perSqft = system.totalCostPerSqFt ? system.totalCostPerSqFt : system.pricePerSqFt;
  const view = `<a href="${esc(pageUrl(system.pageUrl))}" target="${target}" class="view-product">${L('view-product')}</a>`;
  const isSmart = smartSkus.includes(String(system.sku)) && system.stepOne
    && !system.stepTwo && !system.stepThree && !system.stepFour;
  const disclaimer = copy(cfg, 'disclaimer');
  const warranty = system.warranty ? fill(copy(cfg, 'warranty-text'), { warranty: system.warranty }) : '';
  const smartDesktop = configImage(cfg, 'smartcare-image', 0);
  const smartMobile = configImage(cfg, 'smartcare-image', 1) || smartDesktop;
  const smartCta = cfg['smartcare-cta'];
  const smartHref = smartCta ? pageUrl(cellText(smartCta, 1) || smartCta.cell.querySelector('a')?.getAttribute('href') || '') : '';
  return `<li class="main-card-${index} result-card ${index === 0 ? 'active' : ''}" data-attr-entityCode="${esc(system.sku)}" data-attr-position="${position}">
    <div class="wraper">
      <h4 class="cardHeading">${L('card-title')}</h4>
      <div class="product-wraper">
        <div class="left"><img src="${esc(absUrl(system.swatchImage))}" alt="${esc(system.entityName)}"></div>
        <div class="right">
          <h4 class="product-title"> ${esc(system.entityName)} </h4>
          <a href="${esc(pageUrl(system.pageUrl))}" target="${target}" class="view-product mob-pbc-cta">${L('view-product')}</a>
          <p class="product-warenty ${system.warranty ? '' : 'd-none'}">${esc(warranty)}</p>
          <ul class="price-details">
            <li class="total"><span> ${esc(fill(copy(cfg, 'cost-label'), { area }))} </span><span class="bold"> Rs.${esc(cost)} <span class="red-a">*</span></span></li>
            <li class="areaforPainting"><span></span><span class="bold"></span></li>
            <li class="SQFT"><span> ${L('per-sqft-label')} </span><span class="bold"> Rs.${esc(perSqft)}</span></li>
            ${view}
          </ul>
        </div>
      </div>
      <div class="included-products ${isSmart ? 'd-none' : ''}">
        <div class="quote-disclaimer ${disclaimer ? '' : 'd-none'}"><p><span>*</span>${esc(disclaimer)}</p></div>
        <h2 class="title">${L('products-title')}</h2>
        <div class="included-products-wraper"></div>
        <div class="quote-disclaimer-desk ${disclaimer ? '' : 'd-none'}"><p><span>*</span>${esc(disclaimer)}</p></div>
      </div>
      <div class="included-products smartcare-variant ${isSmart ? '' : 'd-none'}">
        <div class="quote-disclaimer ${disclaimer ? '' : 'd-none'}"><p><span>*</span>${esc(disclaimer)}</p></div>
        <div class="wraper-for-title-products">
          <h2 class="title">${L('products-title')}</h2>
          <div class="included-products-wraper"></div>
        </div>
        <div class="smartcare-block">
          <picture class="">
            <source media="(max-width:575px)" srcset="${esc(smartMobile)}">
            <source media="(min-width:576px) and (max-width:767px)" srcset="${esc(smartMobile)}">
            <source media="(min-width:768px) and (max-width:991px)" srcset="${esc(smartMobile)}">
            <source media="(min-width:992px)" srcset="${esc(smartDesktop)}">
            <img loading="lazy" fetchpriority="auto" class="smartcare-img" src="${esc(smartDesktop)}" alt="${esc(copy(cfg, 'smartcare-product-name'))}" width="202" height="164">
          </picture>
          <div class="smartcare-wraper">
            <div class="smartcare-wraper-title">
              <h2 class="smartcare-title">${L('smartcare-heading')}</h2>
              <h4 class="smartcare-sub-title">${L('smartcare-subtitle')}</h4>
            </div>
            <div class="product-name-and-cta">
              <p class="smartcare-para">${L('smartcare-product-name')}</p>
              <a href="${esc(smartHref)}" class="view-product" target="_blank" rel="noopener">${esc(smartCta ? smartCta.text : '')}</a>
            </div>
          </div>
        </div>
        <div class="quote-disclaimer-desk"><p><span>*</span>${esc(disclaimer)}</p></div>
      </div>
      <div class="estimate-includes info-description">${richHtml(cfg, 'description-mobile')}</div>
      <div class="pdf-wraper">
        <span>${L('pdf-text')}</span>
        <div class="cta round-corner-radius-button animated-btn-black download-pdf">
          <a target="_self" class="animated-arrow-button" role="button" tabindex="0">${L('pdf-cta')}<span class="arrow"></span>
            <span class="rotating js-rotatingCalculateNow saving-progress-status d-none">↻</span>
          </a>
        </div>
      </div>
    </div>
  </li>`;
}

function productTileHtml(step, cfg, target) {
  const href = step.productUrl ? pageUrl(`${step.productUrl}.html`) : '';
  return `<div class="included-product-detail">
    <a href="${esc(href)}" class="linkforpbc" target="${target}"><h4 class="product-title">${esc(step.mainTitle)}</h4>
      <div class="related-product-img"><img src="${esc(absUrl(step.imagePath))}" alt="${esc(step.mainTitle)}"><h4 class="Qty-require">${esc(step.prodQty)}<span> ${esc(copy(cfg, 'required-label'))} </span></h4></div></a>
    <a href="${esc(href)}" class="view-product" target="${target}">${esc(copy(cfg, 'view-product'))}</a>
  </div>`;
}

/* ------------------------------------------------------------------ PDF */

function compareSectionHtml(items, title, className, style = '') {
  if (!items.length) return '';
  const cols = items.map((item) => `<div class="col-item"><div><div class="compare-item compare-item-0">
      <div style="vertical-align: top"><div><img class="compare-icon" data-icon-src="${esc(imageUrl(item.cells[0]))}" src="" height="32" width="32" alt=""></div></div>
      <div style="vertical-align: top; padding-left: 8px"><div class="compare-description">
        <p class="compare-heading">${esc(cellText(item, 1))}</p>
        <p class="compare-subheading">${esc(cellText(item, 2))}</p>
      </div></div>
    </div></div></div>`);
  const rows = [];
  for (let i = 0; i < cols.length; i += 2) rows.push(`<div class="row-item">${cols.slice(i, i + 2).join('')}</div>`);
  return `<div class="compare-pdf ${className}"${style ? ` style="${style}"` : ''}>
    <div class="compare-pdf-heading">${esc(title)}</div>${rows.join('')}</div>`;
}

function plansHtml(cfg) {
  if (!cfg.plan.length) return '';
  const icons = [configImage(cfg, 'included-icon'), configImage(cfg, 'warranty-icon')];
  const cards = cfg.plan.map((plan) => {
    const variant = slug(cellText(plan, 3) || 'classic');
    const lists = [];
    let current = null;
    [...(plan.cells[2] ? plan.cells[2].children : [])].forEach((node) => {
      if (node.tagName === 'UL' || node.tagName === 'OL') {
        if (current) current.items = [...node.querySelectorAll('li')].map((li) => li.textContent.trim());
      } else if (node.textContent.trim()) {
        current = { heading: node.textContent.trim(), items: [] };
        lists.push(current);
      }
    });
    // As authored on prod: a space after the "included" icon, a no-break
    // space after the warranty one (it shows as a gap in the flex row).
    const listHtml = lists.map((list, i) => `<div class="choosePlanBlock__wrapper--banners--cards--lists">
        <div class="lists-titleAndIcon"><img src="${esc(icons[Math.min(i, 1)])}" height="18" width="18" alt="">${i ? '&nbsp;' : ' '}<span class="sub-title">${esc(list.heading)}</span></div>
        <ul>${list.items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
      </div>`).join('');
    return `<div class="choosePlanBlock__wrapper--banners--cards${variant === 'classic' ? '' : ` ${variant}-plan`}">
      <div class="choosePlanBlock__wrapper--banners--cards__iconAndText">
        <div class="choosePlanBlock__wrapper--banners--cards__iconAndText-cirle"><img loading="lazy" src="" data-compare-plan-icon="${esc(imageUrl(plan.cells[0]))}" height="52" width="52" alt="${esc(plan.cells[1] ? cellText(plan, 1) : '')}"></div>
        <p class="main-sub-title">${esc(cellText(plan, 1))}</p>
      </div>
      <div class="${variant}-plan-description">${listHtml}</div>
    </div>`;
  }).join('');
  const [before, after = ''] = copy(cfg, 'plans-call-text').split('{phone}');
  return `<div class="choosePlan"><div class="choosePlanBlock"><div class="choosePlanBlock__wrapper">
      <h2 class="choosePlanBlock__wrapper--title">${esc(copy(cfg, 'plans-title'))}</h2>
      <div class="choosePlanBlock__wrapper--banners">${cards}</div>
    </div></div></div>
    <div class="disclaimer-contact choosePlan-disclaimer-contact">${esc(before.trim())}<span>${esc(copy(cfg, 'plans-phone'))}</span>${esc(after.trim())}</div>
    <div class="quote-disclaimer choosePlan-quote-disclaimer quote-disclaimer-chooseplan"><div class="quote-disclaimer-p" style="">${esc(copy(cfg, 'plans-disclaimer'))}</div></div>`;
}

function pdfHtml(cfg) {
  return `<div class="parent-container-budget-cal-pdf d-none">
    <div class="container-one">
      <div class="left-section">
        <div class="name-heading">${esc(copy(cfg, 'greeting'))} <span class="pdf-username"></span></div>
        <div class="sub-heading"><div class="sub-heading">${esc(copy(cfg, 'header-text'))}</div></div>
      </div>
      <div class="right-section">
        <img loading="lazy" fetchpriority="auto" class="apLogoPDF" width="153" height="28" data-attr-ap-logo="${esc(configImage(cfg, 'logo'))}" src="" alt="">
        <div class="mobile-section">${esc(copy(cfg, 'mobile-label'))}<span class="mobile-number"></span></div>
        <div class="email-section">${esc(copy(cfg, 'email-label'))} <span class="email-value"></span></div>
      </div>
    </div>
    <div class="product-detail-pdf"></div>
    <div class="container-three">
      <div class="quote-disclaimer"><div class="quote-disclaimer-p"></div></div>
      <div class="estimate-includes info-description"></div>
      <hr>
      <div class="disclaimer-contact"><div class="disclaimer-contact">${esc(copy(cfg, 'contact-text'))}</div></div>
    </div>
    ${compareSectionHtml(cfg['why-item'], copy(cfg, 'why-title'), 'why-choose-us')}
    ${compareSectionHtml(cfg['how-item'], copy(cfg, 'how-title'), 'how-it-works', 'margin-top: 16px')}
    <div class="quote-disclaimer choosePlan-quote-disclaimer quote-disclaimer-compare"><div class="quote-disclaimer-p" style="">${esc(copy(cfg, 'compare-disclaimer') || copy(cfg, 'plans-disclaimer'))}</div></div>
    ${plansHtml(cfg)}
  </div>`;
}

function pdfSystemHtml(system, index, steps, area, cfg) {
  const L = (key) => esc(copy(cfg, key));
  const cost = system.bhpsCost ? system.bhpsCost : system.mrp;
  const perSqft = system.totalCostPerSqFt ? system.totalCostPerSqFt : system.pricePerSqFt;
  const [coat, coats] = cfg['coat-labels'] ? cfg['coat-labels'].cells.map((c) => c.textContent.trim()) : ['', ''];
  const layers = cfg['layer-labels'] ? cfg['layer-labels'].cells.map((c) => c.textContent.trim()) : ['', '', ''];
  const stepItems = steps.map((step, i) => {
    let layer = layers[0];
    if (step.mainTitle && step.mainTitle.toLowerCase().includes('putty')) [, layer] = layers;
    if (i === steps.length - 1) [, , layer] = layers;
    return `<div class="apply-steps-item"><p class="step-count">${esc(step.stepTitle)}</p><p class="step-title">${esc(step.numberOfCoats)} ${esc(parseInt(step.numberOfCoats, 10) > 1 ? coats : coat)}<span>&#8226; &nbsp; ${esc(layer)}</span></p><img class="step-image" src="${esc(absUrl(step.imagePath))}" alt=""><div class="n-product-qty-wraper"><div class="product-title">${esc(step.mainTitle)}</div><div class="n-qty-title onlypbcpdf"></div><div class="qty-required onlypbcpdf"> <span>${esc(step.prodQty)}</span> </div></div></div>`;
  }).join('');
  const warranty = system.warranty ? `<div class="waterproofing-warranty"><div class="waterproofing-info"><img src="${esc(configImage(cfg, 'warranty-logo'))}" alt=""><div class="warranty-years"><p class="upto">${esc(cellText(cfg['warranty-labels'] || { cells: [] }, 0))}</p><p class="years">${esc(system.warranty)}</p><p class="warranty">${esc(cellText(cfg['warranty-labels'] || { cells: [] }, 1))}</p></div></div></div>` : '';
  return `<div class="container-two container-two-${index}">${warranty}<div class="product-main-section d-flex">
      <div class="product-main-image"><img src="${esc(absUrl(system.swatchImage))}" width="100%" height="100%" alt=""></div>
      <div class="product-main-desc">
        <p class="product-title">${esc(system.entityName)}</p>
        <p class="product-title-desc"> ${L('product-subtitle')}</p>
        <div class="product-total-section">
          <div class="total-cost-row"><p class="total-cost-title">${esc(fill(copy(cfg, 'cost-label'), { area }))}</p><p class="total-cost-value"> Rs.${esc(cost)}</p></div>
          <div class="total-cost-row onlypbcpdf"><p class="total-cost-title"></p><p class="total-cost-value"></p></div>
          <div class="total-cost-row"><p class="total-cost-title">${L('per-sqft-label')}</p><p class="total-qty-value"> Rs.${esc(perSqft)}</p></div>
        </div>
      </div>
    </div>
    <div class="product-apply-section"><p class="apply-title">${L('steps-title')}</p><div class="apply-steps-section">${stepItems}</div></div>
  </div>`;
}

/* --------------------------------------------------------------- block */

// The endpoint's systems for Screen 1's answers ({ area, paint, surface }).
async function fetchSystems(shared, a) {
  const endpoint = copy(shared, 'endpoint');
  const url = /^https?:\/\//.test(endpoint)
    ? endpoint
    : `${API_HOST}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const params = new URLSearchParams({
    area: a.area,
    paint: a.paint,
    surface: a.surface,
    language: copy(shared, 'language'),
    apltype: copy(shared, 'apl-type'),
    multiplierValue: copy(shared, 'multiplier-value'),
  });
  const res = await fetch(`${url}?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// The calculator hub's saved answers ({ ProjectType: surface, SpaceType:
// project type, Area }) as Screen 1 answers, when they match a Surface and
// a Project Type row (by value or label) and the area is at least
// minArea; else null. Answers that match are used once: the key is removed.
function takeHubAnswers(s1, key, minArea) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (!saved || typeof saved !== 'object') return null;
    const norm = (v) => String(v ?? '').trim().toLowerCase();
    const find = (options, wanted) => (norm(wanted)
      ? options.findIndex((o) => norm(o.value) === norm(wanted) || norm(o.label) === norm(wanted))
      : -1);
    const surfaces = s1.surface.map(surfaceOption);
    const projects = s1['project-type'].map(projectOption);
    const surfaceIndex = find(surfaces, saved.ProjectType);
    const projectIndex = find(projects, saved.SpaceType);
    const area = Math.floor(Number(saved.Area));
    if (surfaceIndex < 0 || projectIndex < 0 || !(area > 0) || area < minArea) return null;
    localStorage.removeItem(key);
    return {
      surfaceIndex,
      projectIndex,
      area: String(area),
      paint: projects[projectIndex].value,
      surface: surfaces[surfaceIndex].value,
    };
  } catch (e) {
    return null; // no storage, or nothing usable saved
  }
}

// Waits (briefly) for the block's Manrope faces, so the calculator first
// paints in its own font instead of shifting when the font swaps in.
const fontsReady = () => Promise.race([
  Promise.all([300, 400, 500, 700, 800].map((w) => document.fonts.load(`${w} 14px Manrope`))),
  new Promise((resolve) => { setTimeout(resolve, 1500); }),
]).catch(() => {});

export default async function decorate(block) {
  const groups = splitSections([...block.children]);
  const shared = readRows(groups.shared);
  const s1 = readRows(groups[1]);
  const s2 = readRows(groups[2]);
  const s3 = readRows(groups[3]);
  const pdfCfg = readRows(groups.pdf);
  // The authored "Skip Form" as data-attr-skip-form="true|false" on the block
  // (false when not authored), which is what "Calculate now" reads, so a
  // script such as Adobe Target can switch the lead form on or off by
  // changing the attribute. It is set before the font wait below, so it is
  // there as soon as the block starts decorating. A value already on the
  // block (set by a script before decoration) is kept over the authored one.
  if (!block.hasAttribute('data-attr-skip-form')) {
    block.dataset.attrSkipForm = String(copy(s2, 'skip-form').toLowerCase() === 'true');
  }
  // The lead's campaign ID and node come from the form-config block, falling
  // back to Screen 2's Campaign ID / Node (or Resource Path) rows; as in
  // form.js, utm_campaign wins over the authored campaign ID and the node
  // defaults to the page path.
  const formConfig = readFormConfig(block);
  const authoredCampaignId = formConfig.campaignId || copy(s2, 'campaign-id');
  // utm_campaign is read with the lead script, once it has loaded (null if
  // it failed to load).
  const campaignIdFor = (api) => api?.getCampaignIdFromUrl() || authoredCampaignId;
  const node = formConfig.node
    || copy(s2, 'node')
    || copy(s2, 'resource-path')
    || window.location.pathname;

  const bgDesktop = configImage(shared, 'background', 0);
  const bgMobile = configImage(shared, 'background', 1) || bgDesktop;
  const minArea = Number(copy(s1, 'minimum-area')) || 0;

  // Arriving from the calculator hub with Screen 1 already answered: its
  // endpoint call starts now, alongside the font wait.
  let flowType = '';
  const hub = takeHubAnswers(s1, copy(shared, 'storage-key') || 'miniFormValues', minArea);
  if (hub) {
    flowType = 'SPS_WBC_Miniform';
  }
  const hubSystems = hub ? fetchSystems(shared, hub) : null;
  hubSystems?.catch(() => {}); // handled once the block is built
  const hubSkipsForm = block.dataset.attrSkipForm === 'true';

  await fontsReady();
  block.textContent = '';
  const root = document.createElement('div');
  root.className = 'budgetcalculator';
  root.innerHTML = html(`<div class="budget-calculator-container wbcCalculator">
      ${screenOneHtml(s1)}
      ${screenTwoHtml(s2, copy(pdfCfg, 'file-name'), { campaignId: authoredCampaignId, node })}
      ${screenThreeHtml(s3)}
    </div>
    ${pdfHtml(pdfCfg)}`);
  // From the hub the block first paints on Screen 2 (Screen 3 when the form
  // is skipped), never on Screen 1.
  if (hub) {
    hide(root.querySelector('.user-input-surface-layout'));
    if (hubSkipsForm) show(root.querySelector('.estimated-result-layout'));
    else root.querySelector('.budget-form-layout').style.display = 'flex';
  }
  block.append(root);

  const container = root.querySelector('.budget-calculator-container');
  container.style.setProperty('--bg-image-desktop', `url("${bgDesktop}")`);
  container.style.setProperty('--bg-image-mob', `url("${bgMobile}")`);
  container.style.backgroundSize = '100% 100%';

  const q = (selector) => root.querySelector(selector);
  const qa = (selector) => [...root.querySelectorAll(selector)];
  const layout1 = q('.user-input-surface-layout');
  const layout2 = q('.budget-form-layout');
  const layout3 = q('.estimated-result-layout');
  const area = q('#area');
  const calculate = q('#calculate-now');
  const cardList = q('.card-list');
  const stack = q('.card-stack');
  const prev = q('.card-stack .prev');
  const next = q('.card-stack .next');
  const mobBack = q('.back.mob-view');
  const pdf = q('.parent-container-budget-cal-pdf');
  const form = q('.js-form-layout-revamp');
  const newTab = copy(s3, 'new-tab').toLowerCase() !== 'false';
  const target = newTab ? '_blank' : '_self';
  const smartSkus = copy(s3, 'smartcare-skus').split(',').map((s) => s.trim()).filter(Boolean);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.userAgent.match(/iPad/i);
  // Screen 3 "PDF on iOS" (Show / Hide): prod hides the download row on
  // iPhone / iPad, which stays the default when the row is not authored.
  const hidePdfOnIOS = !/^(show|yes|true)$/i.test(copy(s3, 'pdf-on-ios'));
  let formSubmitted = false;
  let userInput = '';
  let calcStarted = false;
  // Settles true once the latest calculation's cards are rendered, false if
  // its endpoint call failed. Only the hub's background call is ever pending
  // here; "Calculate now" renders before it leaves Screen 1. calcRun marks
  // which calculation is the latest.
  let calculation = Promise.resolve(true);
  let calcRun = 0;

  // Desktop shows the subtitle only on phones, as on AEM.
  if (window.innerWidth > 992) q('.info-sub-title')?.remove();

  const scrollTop = () => {
    const top = block.getBoundingClientRect().top + window.scrollY;
    window.scroll({ top: Math.max(0, top - (document.querySelector('header')?.offsetHeight || 0)), left: 0, behavior: 'smooth' });
  };

  /* -- screen 1 -- */
  const answers = () => ({
    area: area.value,
    paint: q('input[name="project-type"]:checked')?.value || '',
    surface: q('input[name="project-surface"]:checked')?.value || '',
  });
  const startTracking = () => {
    if (calcStarted) return;
    calcStarted = true;
    track('calc_start', { calcType: 'Basic' });
  };
  const updateCalculate = () => {
    const a = answers();
    const ready = parseInt(a.area, 10) > minArea - 1 && a.paint && a.surface;
    if (ready) {
      calculate.removeAttribute('disabled');
      calculate.removeAttribute('aria-disabled');
    } else {
      calculate.setAttribute('disabled', 'disabled');
      calculate.setAttribute('aria-disabled', 'true');
    }
  };
  qa('.user-input-surface-layout input[type="radio"]').forEach((input) => input.addEventListener('change', () => {
    startTracking();
    updateCalculate();
  }));
  qa('.user-input-surface-layout .custom-radio, .user-input-surface-layout .wbc-project-type label').forEach((label) => {
    label.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const input = label.querySelector('input[type="radio"]');
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  area.addEventListener('input', () => {
    // Always reassigned, as on prod (this also moves the caret like prod).
    area.value = area.value.replace(/[^0-9]/g, '');
    startTracking();
    updateCalculate();
  });
  area.addEventListener('keyup', updateCalculate);
  area.addEventListener('blur', () => {
    q('.carpet-area-error-msg').classList.toggle('d-none', !(parseInt(area.value, 10) < minArea));
  });

  /* -- card stack -- */
  const cards = () => [...cardList.querySelectorAll('.result-card')];

  // On phones the arrows and "Calculate again" sit below the stack
  // (AEM syncControlRow).
  function syncControls(attempt = 0) {
    const section = q('.recommend-product-section');
    cardList.style.height = '';
    stack.style.height = '';
    section.style.paddingBottom = '';
    [prev, next].forEach((btn) => Object.assign(btn.style, { top: '', bottom: '', transform: '' }));
    Object.assign(mobBack.style, {
      position: '', top: '', bottom: '', left: '', transform: '',
    });
    if (!MOBILE.matches) return;
    const listTop = cardList.getBoundingClientRect().top;
    let bottom = 0;
    cards().forEach((card) => {
      const top = Number.parseFloat(getComputedStyle(card).top) || 0;
      const cardBottom = Math.ceil(card.getBoundingClientRect().bottom - listTop);
      bottom = Math.max(bottom, top + Math.ceil(card.offsetHeight || 0), cardBottom);
    });
    bottom = Math.max(bottom, Math.ceil(cardList.scrollHeight || 0));
    if (!bottom || (cards().length && bottom < 120)) {
      if (attempt < 12) setTimeout(() => syncControls(attempt + 1), 150);
      return;
    }
    const controlsTop = bottom + 20;
    cardList.style.height = `${bottom}px`;
    stack.style.height = `${bottom + 20 + 44}px`;
    section.style.paddingBottom = '64px';
    [prev, next].forEach((btn) => Object.assign(btn.style, {
      top: `${controlsTop}px`, bottom: 'auto', transform: 'none',
    }));
    Object.assign(mobBack.style, {
      position: 'absolute',
      top: `${controlsTop}px`,
      bottom: 'auto',
      width: 'fit-content',
      left: '50%',
      transform: 'translateX(-50%)',
    });
  }
  // Every card is as tall as the tallest one (AEM normalizeResultCardHeights).
  function normalizeHeights(attempt = 0) {
    const list = cards();
    if (!list.length) return;
    list.forEach((card) => { card.style.height = ''; });
    // Fractional height rounded up, as jQuery outerHeight() + Math.ceil on AEM.
    // Measured in CSS px: the block is zoomed on laptop widths (as prod's
    // body is), and getBoundingClientRect() reports zoomed px.
    const cssHeight = (card) => card.getBoundingClientRect().height / (card.currentCSSZoom || 1);
    const tallest = Math.max(...list.map((card) => Math.ceil(cssHeight(card))));
    if (!tallest || tallest < 80) {
      if (attempt < 12) {
        setTimeout(() => {
          normalizeHeights(attempt + 1);
          syncControls(attempt + 1);
        }, 150);
      }
      return;
    }
    // AEM sets this with jQuery .height(), which adds padding and border on
    // border-box elements, so the cards end up taller than their content.
    list.forEach((card) => {
      const cs = getComputedStyle(card);
      const extra = cs.boxSizing === 'border-box'
        ? ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
          .reduce((sum, prop) => sum + (parseFloat(cs[prop]) || 0), 0)
        : 0;
      card.style.height = `${Math.max(tallest, 80) + extra}px`;
    });
  }

  const layoutCards = () => {
    normalizeHeights();
    syncControls();
    setTimeout(() => { normalizeHeights(); syncControls(); }, 250);
  };
  window.addEventListener('resize', () => syncControls());
  window.addEventListener('orientationchange', () => syncControls());

  next.addEventListener('click', (e) => {
    e.preventDefault();
    const active = cardList.querySelector('.result-card.active');
    const upcoming = active?.nextElementSibling;
    if (!upcoming) return;
    active.classList.remove('active');
    upcoming.classList.add('active');
    cardList.append(active);
    if (cardList.querySelector('.result-card.active').dataset.attrPosition === 'last') next.classList.add('disabled');
    prev.classList.remove('disabled');
  });
  prev.addEventListener('click', (e) => {
    e.preventDefault();
    const list = cards();
    cardList.prepend(list[list.length - 1]);
    const active = cardList.querySelector('.result-card.active');
    const before = active?.previousElementSibling;
    if (before) {
      active.classList.remove('active');
      before.classList.add('active');
    }
    if (cardList.querySelector('.result-card.active').dataset.attrPosition === 'first') prev.classList.add('disabled');
    next.classList.remove('disabled');
  });

  /* -- screen 2: lead form -- */
  const messages = {
    required: copy(s2, 'required-error'),
    name: copy(s2, 'name-error'),
    email: copy(s2, 'email-error'),
    mobile: copy(s2, 'mobile-error'),
    pincode: copy(s2, 'pin-code-error'),
  };
  // The site form library's checks (clientlib-baselanding-commonheader).
  // Name: letters with single spaces, trimmed; written without prod's
  // nested quantifier, which matches the same names but can hang.
  const RULES = {
    name: (v) => /^[a-zA-Z]+(?:\s[a-zA-Z]+)*$/.test(v.trim()),
    email: (v) => /^\b[A-Z0-9._%-]+@[A-Z0-9.-]+\.[A-Z]{2,4}\b$/i.test(v),
    mobile: (v) => /^[1-9]\d{9}$/.test(v),
    pincode: (v) => /^[0-9]{6}$/.test(v),
  };
  // Prod's onkeydown filters on the same fields.
  const NAV_KEYS = ['Tab', 'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight'];
  const digitKey = (e) => NAV_KEYS.includes(e.code)
    || (!Number.isNaN(Number(e.key)) && e.code !== 'Space');
  const KEY_FILTERS = {
    name: (e) => /[a-z, ]/i.test(e.key),
    mobile: digitKey,
    pincode: digitKey,
  };

  // Focus styling as form.js applies it: a transparent field with a dark
  // border and the label shown on the border.
  function activate(input) {
    const wrap = input.closest('.form-global');
    wrap.classList.add('focussed');
    wrap.querySelector('label').classList.remove('d-none');
    const isMobile = input.id === LEAD_IDS.mobile;
    input.style.background = 'transparent';
    input.style.border = '1px solid rgb(48, 48, 48)';
    const bg = q('.ccforms').dataset.formBgColor;
    qa('.ccforms .form-text-input__label').forEach((label) => { label.style.background = bg; });
    if (isMobile) {
      input.style.borderLeft = 'none';
      const flag = q('.MobileNum');
      flag.style.background = 'transparent';
      flag.style.border = '1px solid rgb(48, 48, 48)';
    }
  }

  // Fields filled from the cookie keep their resting look (grey, no label),
  // as on prod; a field takes the focus styling when it is focused.
  function prefillFromCookie() {
    loadLeadApi().then(({ checkCookieValues }) => {
      checkCookieValues(form, LEAD_SELECTORS);
    }).catch(() => { /* no prefill; the submit shows the lead error */ });
  }

  /* -- results and PDF pages -- */
  function render(systems, areaValue) {
    cardList.textContent = '';
    q('.product-detail-pdf').textContent = '';
    systems.forEach((system, i) => {
      cardList.insertAdjacentHTML('beforeend', html(cardHtml(system, i, systems.length, areaValue, s3, target, smartSkus)));
    });
    prev.classList.add('disabled');
    next.classList.toggle('disabled', systems.length <= 1);
    if (isIOS && hidePdfOnIOS) qa('.pdf-wraper').forEach((row) => row.classList.add('d-none'));
    container.querySelector('.estimated-result-layout').classList.toggle(
      'smartBlockVisible',
      qa('.smartcare-variant').some((n) => !n.classList.contains('d-none')),
    );

    const stepLabel = copy(pdfCfg, 'step-label');
    systems.forEach((system, i) => {
      const steps = STEP_KEYS
        .map((key, n) => parseStep(system[key], `${stepLabel} ${String(n + 1).padStart(2, '0')}`))
        .filter(Boolean);
      const card = cardList.querySelector(`.main-card-${i}`);
      card.querySelectorAll('.included-products-wraper').forEach((wrap) => {
        wrap.innerHTML = html(steps.map((step) => productTileHtml(step, s3, target)).join(''));
      });
      q('.product-detail-pdf').insertAdjacentHTML('beforeend', html(pdfSystemHtml(system, i, steps, areaValue, pdfCfg)));
    });
    const first = q('.product-detail-pdf .container-two');
    if (first) {
      first.insertAdjacentHTML('afterbegin', html(`<div class="recommended-product"><div class="recommended-product-section"><p class="recommended-product-heading">${esc(copy(pdfCfg, 'recommended-title'))}</p></div></div>`));
    }
    // Page-break spacing in the PDF, as on AEM.
    const three = q('.container-three');
    const has = (n) => !!q(`.container-two-${n}`);
    const pdfDisclaimer = copy(pdfCfg, 'disclaimer');
    if (pdfDisclaimer && has(1)) {
      q('.container-two-1').insertAdjacentHTML('afterend', html(`<div class="quote-disclaimer text-center"><div class="quote-disclaimer-p">${esc(pdfDisclaimer)}</div></div>`));
    }
    three.style.marginBottom = '';
    three.querySelector('.quote-disclaimer').style.display = '';
    if (!has(1)) {
      if (q('.quote-disclaimer.text-center')) hide(q('.quote-disclaimer.text-center'));
      three.style.marginBottom = '470px';
    }
    if (has(1) && !has(2)) {
      if (q('.quote-disclaimer.text-center')) q('.quote-disclaimer.text-center').style.marginBottom = '50px';
      three.style.marginBottom = '60px';
      hide(three.querySelector('.quote-disclaimer'));
    }
    if (has(2) && !has(3)) three.style.marginBottom = '550px';
    if (has(3)) three.style.marginBottom = '210px';
    const logo = q('img.apLogoPDF');
    logo.src = logo.dataset.attrApLogo;
    qa('.compare-icon').forEach((img) => { img.src = img.dataset.iconSrc; });
    qa('.choosePlanBlock__wrapper--banners--cards__iconAndText-cirle img').forEach((img) => { img.src = img.dataset.comparePlanIcon; });
    if (formSubmitted) qa('.download-pdf').forEach((cta) => { cta.style.display = 'block'; });
  }

  async function onCalculate() {
    const spinner = calculate.querySelector('.js-rotatingCalculateNow');
    spinner.classList.remove('d-none');
    q('.calculatenow-error-msg').classList.add('d-none');
    const a = answers();
    if (!a.area || !a.paint || !a.surface || !q('.carpet-area-error-msg.d-none')) {
      spinner.classList.add('d-none');
      return;
    }
    // This calculation replaces the hub's background one, if still pending.
    calcRun += 1;
    calculation = Promise.resolve(true);
    userInput = `${a.paint}|${a.surface}|${a.area}`;
    // The lead form will show: load its script alongside the API call.
    if (!formSubmitted && block.dataset.attrSkipForm !== 'true') loadLeadApi().catch(() => {});
    try {
      const systems = await fetchSystems(shared, a);
      if (!systems) throw new Error('empty response');
      spinner.classList.add('d-none');
      hide(layout1);
      // Skip Screen 2 when data-attr-skip-form is "true" (read now, not at
      // decorate, so a script such as Adobe Target can change it) or once the
      // lead form has been submitted; otherwise show the lead form.
      const skipForm = block.dataset.attrSkipForm === 'true';
      const straightToResults = formSubmitted || skipForm;
      if (straightToResults) {
        show(layout3);
        track('calc_continue', { calcType: 'Basic', filter: userInput });
        track('calct_submit', { calcType: 'Basic', filter: userInput });
      } else {
        layout2.style.display = 'flex';
        track('calc_continue', { calcType: 'Basic', filter: userInput });
        prefillFromCookie();
      }
      render(Array.isArray(systems) ? systems : [], a.area);
      if (straightToResults) setTimeout(layoutCards, 0);
      scrollTop();
    } catch (err) {
      spinner.classList.add('d-none');
      q('.calculatenow-error-msg').classList.remove('d-none');
    }
  }
  calculate.addEventListener('click', onCalculate);

  function setFieldError(input, message) {
    const wrap = input.closest('.form-global');
    wrap.querySelector('.form-global__field-message')?.remove();
    wrap.classList.toggle('form-global--error', !!message);
    wrap.classList.toggle('form-text-input--error', !!message);
    wrap.classList.toggle('form-global--normal', !message);
    wrap.classList.toggle('form-text-input--normal', !message);
    input.setAttribute('aria-invalid', String(!!message));
    if (message) {
      wrap.insertAdjacentHTML('beforeend', html(`<div class="form-global__field-message form-text-input__field-message" role="status" aria-live="polite">${esc(message)}</div>`));
    }
  }

  function validateInput(input) {
    // As on prod: "required" only needs a character (spaces count); then
    // the field's own rule.
    const { value } = input;
    const rule = input.dataset.validate;
    let message = '';
    if (!value.length) message = messages.required;
    else if (RULES[rule] && !RULES[rule](value)) message = messages[rule];
    setFieldError(input, message);
    return !message;
  }

  function setGroupError(group, show_) {
    group.querySelector(':scope > .form-global__field-message')?.remove();
    if (show_) group.insertAdjacentHTML('beforeend', html(`<span class="form-global__field-message" style="padding-top: 24px;transform: translate(5px, 0px);"> ${esc(messages.required)} </span>`));
  }

  let formStarted = false;
  const formName = () => copy(s2, 'title');
  q('.revisedDisclaimer')?.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;
    track('cta_link_text', {
      cta: link.textContent.trim(),
      cta_: link.textContent.trim(),
      parentTitle: formName(),
      destinationUrl: link.href,
      param1: link.href,
    });
  });
  qa('.js-form-layout-revamp input[type="text"]').forEach((input) => {
    input.addEventListener('focus', () => {
      activate(input);
      if (!formStarted) {
        formStarted = true;
        loadLeadApi().catch(() => null).then((api) => {
          track('form_start', { formName: formName(), formCampaignId: campaignIdFor(api) });
        });
      }
    });
    input.addEventListener('keydown', (e) => {
      const allow = KEY_FILTERS[input.dataset.validate];
      if (allow && !allow(e)) e.preventDefault();
    });
    input.addEventListener('input', () => {
      // As on prod, typing clears the error; the field is checked again on blur.
      setFieldError(input, '');
    });
    input.addEventListener('blur', () => validateInput(input));
  });

  // WhatsApp opt-in: the styled box toggles the real checkbox.
  const consent = q('.form-whatsapp-consent');
  const consentBox = consent.querySelector('input');
  const consentToggle = consent.querySelector('.whatsAppCheckbox');
  const toggleConsent = (e) => {
    e.preventDefault();
    consentBox.checked = !consentBox.checked;
    consentToggle.classList.toggle('whatsAppCheckbox-checked', consentBox.checked);
    consentToggle.setAttribute('aria-pressed', String(consentBox.checked));
  };
  consent.addEventListener('click', toggleConsent);
  consent.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') toggleConsent(e); });

  qa('.disclaimer-group').forEach((group) => {
    group.querySelectorAll('.form-radio-input__inline-label').forEach((label) => {
      const input = label.querySelector('input');
      const custom = label.querySelector('.form-global__custom-element');
      const choose = () => {
        input.checked = true;
        group.querySelectorAll('.form-global__custom-element').forEach((el) => el.setAttribute('aria-checked', String(el === custom)));
        setGroupError(group, false);
      };
      input.addEventListener('change', choose);
      custom.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          choose();
        }
      });
    });
  });

  async function showResultsAfterLead() {
    formSubmitted = true;
    // From the hub the cards may still be loading: wait for them. If their
    // endpoint call failed, Screen 1 is showing its technical error instead.
    if (!(await calculation)) return;
    track('calct_submit', {
      calcType: 'Basic',
      filter: userInput,
      ...(flowType && { flowType }),
    });
    hide(layout2);
    show(layout3);
    qa('.download-pdf').forEach((cta) => { cta.style.display = 'block'; });
    layoutCards();
    scrollTop();
  }

  function showLeadError() {
    hide(q('.ccforms'));
    q('.ccformsError').style.display = 'block';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    // Normally loaded already, by "Calculate now"; null if it failed to load.
    const api = await loadLeadApi().catch(() => null);
    const campaignId = campaignIdFor(api);
    const inputs = qa('.js-form-layout-revamp input[type="text"]');
    const failed = inputs.filter((input) => !validateInput(input)).map((input) => input.name);
    qa('.disclaimer-group').forEach((group) => {
      const answered = !!group.querySelector('input:checked');
      setGroupError(group, !answered);
      if (!answered) failed.push(group.querySelector('p').textContent.replace('*', '').trim());
    });
    if (failed.length) {
      trackFormError({ campaignId, formName: formName(), formError: failed });
      return;
    }
    const button = q('.track_form_submit');
    const spinner = q('.js-rotatingLeadForm');
    button.setAttribute('disabled', 'disabled');
    spinner.classList.remove('d-none');

    const name = q(LEAD_SELECTORS.name).value.trim();
    const email = q(LEAD_SELECTORS.email).value.trim();
    const mobile = q(LEAD_SELECTORS.mobile).value.trim();
    api?.setFormFieldsToCookie(form, LEAD_SELECTORS);
    q('.pdf-username').textContent = `${name},`;
    q('.mobile-number').textContent = mobile;
    q('.email-value').textContent = email;
    const construction = form.querySelector('[name="NEW_CUSTOM_RADIO_customer_response_one"]:checked')?.value || '';

    const localPainter = form.querySelector('[name="NEW_CUSTOM_RADIO_customer_response_two"]:checked')?.value || '';
    track('form_submit', {
      formName: formName(),
      formCampaignId: campaignIdFor(api),
      construction,
      localPainter,
      whatsappOptIn: consentBox.checked ? 'checked' : 'unchecked',
    });

    // As in the site's other lead blocks: save to DB, then Salesforce; the
    // results show once both are sent, the error panel if either fails.
    try {
      if (!api) throw new Error('form-submit-common.js did not load');
      await api.submitLeadFromForm(form, {
        selectors: LEAD_SELECTORS,
        campaignId,
        resourcePath: node,
        endpoints: LEAD_ENDPOINTS,
      });
      await showResultsAfterLead();
    } catch (err) {
      showLeadError();
    } finally {
      spinner.classList.add('d-none');
      button.removeAttribute('disabled');
    }
  });

  // "Calculate again" on the lead error panel: back to screen 1.
  q('.form-error-back').addEventListener('click', () => {
    form.reset();
    qa('.js-form-layout-revamp .floating-label').forEach((wrap) => wrap.classList.remove('focussed'));
    q('.ccforms').style.display = 'block';
    hide(q('.ccformsError'));
    hide(layout2);
    show(layout1);
    calculate.setAttribute('disabled', 'disabled');
    calculate.setAttribute('aria-disabled', 'true');
  });
  q('.form-layout-revamp__close').addEventListener('click', () => q('.form-error-back').click());

  // Skip (prod .skip-form): no lead, straight to the results. Download PDF
  // stays; with no lead the PDF's name, mobile and email are left blank.
  const skip = q('.skip-form');
  const onSkip = async () => {
    track('custom_cta_click', { cta_: 'Skip', cta: 'Skip', parentTitle: formName() });
    if (!(await calculation)) return; // as in showResultsAfterLead
    hide(layout2);
    show(layout3);
    layoutCards();
    scrollTop();
  };
  skip?.addEventListener('click', onSkip);
  skip?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSkip();
    }
  });

  /* -- screen 3 -- */
  qa('.estimated-result-layout .back').forEach((back) => back.addEventListener('click', () => {
    track('calct_recalculate');
    calcStarted = false; // add this
    flowType = '';
    hide(layout2);
    hide(layout3);
    show(layout1);
    calculate.removeAttribute('disabled');
    calculate.removeAttribute('aria-disabled');
    q('.js-rotatingCalculateNow').classList.add('d-none');
    scrollTop();
  }));

  // Download PDF: the PDF module and its libraries load on first use.
  cardList.addEventListener('click', (e) => {
    const cta = e.target.closest('.download-pdf');
    if (!cta) return;

    const card = cta.closest('.result-card');

    const productName = card?.querySelector('.product-wraper .product-title')
      ?.textContent.trim() || '';

    const totalCost = card?.querySelector('.price-details .total .bold')
      ?.textContent.trim() || '';

    const perSqftCost = card?.querySelector('.price-details .SQFT .bold')
      ?.textContent.trim() || '';

    e.preventDefault();
    import('./pdf.js').then(({ default: downloadPdf }) => downloadPdf({
      container: pdf,
      spinners: qa('.js-rotatingCalculateNow'),
      fileName: copy(pdfCfg, 'file-name'),
    }));
    track('calct_download', {
      filter: userInput,
      productdetails: [
        productName,
        totalCost,
        perSqftCost,
      ].filter(Boolean).join(' | '),
    });
  });
  cardList.addEventListener('click', (e) => {
    const link = e.target.closest('.view-product');
    if (!link) return;

    const card = link.closest('.result-card');

    const isMainProduct = !!link.closest('.product-wraper');
    const isIncludedProduct = !!link.closest('.included-product-detail');

    if (isMainProduct) {
      const productName = card?.querySelector('.product-wraper .product-title')
        ?.textContent.trim() || '';

      const totalCost = card?.querySelector('.price-details .total .bold')
        ?.textContent.trim() || '';

      const perSqftCost = card?.querySelector('.price-details .SQFT .bold')
        ?.textContent.trim() || '';

      track('calct_product_view', {
        productdetails: [
          productName,
          totalCost,
          perSqftCost,
        ].filter(Boolean).join(' | '),
        productSku: card?.dataset?.attrEntityCode || '',
        destinationUrl: link.href,
        filter: userInput,
      });
    }

    if (isIncludedProduct) {
      track('calct_product_view', {
        productdetails: link.closest('.included-product-detail')
          ?.querySelector('.product-title')
          ?.textContent.trim() || '',
        productSku: card?.dataset.attrEntityCode || '',
        destinationUrl: link.href,
        filter: userInput,
      });
    }
  });
  cardList.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.download-pdf a')) {
      e.preventDefault();
      e.target.click();
    }
  });

  /* -- from the calculator hub -- */
  // Screen 1 is answered with the hub's values, so "Calculate again" shows
  // them, as after "Calculate now". The block already shows Screen 2 (or
  // 3); the cards render when the background call returns. calc_continue
  // is not sent again: the hub sent it for its own "Calculate now".
  if (hub) {
    q(`#wbc-surface-${hub.surfaceIndex}`).checked = true;
    q(`#wbc-project-${hub.projectIndex}`).checked = true;
    area.value = hub.area;
    updateCalculate();
    userInput = `${hub.paint}|${hub.surface}|${hub.area}`;
    calcRun += 1;
    const run = calcRun;
    if (!hubSkipsForm) prefillFromCookie();
    calculation = hubSystems.then((systems) => {
      if (run !== calcRun) return false;
      if (!systems) throw new Error('empty response');
      render(Array.isArray(systems) ? systems : [], hub.area);
      if (hubSkipsForm) {
        track('calct_submit', { calcType: 'Basic', filter: userInput, ...(flowType && { flowType }) });
        layoutCards();
      }
      return true;
    }).catch(() => {
      if (run !== calcRun) return false;
      // As when "Calculate now" fails: Screen 1 with its technical error.
      hide(layout2);
      hide(layout3);
      show(layout1);
      q('.calculatenow-error-msg').classList.remove('d-none');
      return false;
    });
  }
}
