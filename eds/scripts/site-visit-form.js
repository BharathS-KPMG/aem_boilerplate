/*
 * "Book a FREE Site Visit" lead form (Asian Paints SPS exit-intent pop-up), loaded on demand.
 * Rebuilds the source pop-up in a native <dialog> and submits to the existing services with the
 * same payloads as the source site:
 *   1. POST /apcolourcatalogue/ccforms.saveleadform.json
 *   2. on SUCCESS: POST /apcolourcatalogue/ccforms/salesforce.leadstosalesforce.json (with rowID)
 *   3. with WhatsApp consent: POST /asianpaints/whatsAppMessage.json
 * Name, email, mobile and PIN are encrypted like the source, with the project's AesUtil
 * (scripts/aesUtil.module.js, `new AesUtil(128, 1000).ltyEncrypt(value)`, key built in), which
 * needs the global CryptoJS (scripts/crypto.js; the stage project's scripts.js loads it, else this
 * module does).
 * Shared by the blocks that offer the form (tabs-wraper and service-steps open it as a pop-up,
 * process-showcase too; enquiry-form places it inline); its styles are styles/site-visit-form.css.
 *
 * Configuration (page or bulk metadata):
 *   asianpaints-api-base        origin of the services; empty = same origin (www.asianpaints.com)
 *   site-visit-campaign         campaign id (default SPS_ORGANIC); utm_campaign overrides it
 *   site-visit-node             AEM form resource path sent as "node" (default: source form path)
 */
import { getMetadata, loadCSS } from './aem.js';
import { getMarketingChannelDetails } from './marketing-channel.js';
import { AesUtil } from './aesUtil.module.js';
import { salesforceAccepted, markLeadFormFilled } from './form-submit-common.js';

const ENDPOINTS = {
  save: '/apcolourcatalogue/ccforms.saveleadform.json',
  salesforce: '/apcolourcatalogue/ccforms/salesforce.leadstosalesforce.json',
  whatsapp: '/asianpaints/whatsAppMessage.json',
};
const DEFAULT_CAMPAIGN = 'SPS_ORGANIC';
const DEFAULT_NODE = '/content/ap/en/home/paint-products/interior-wall-paints/plain-finishes/jcr:content/root/responsivegrid_1675371590/responsivegrid_497128129/ccforms_copy_copy_co';
const PHONE = '1800-209-5678';
const TERMS_URL = 'https://www.asianpaints.com/footer-links/terms-and-conditions.html';
const PRIVACY_URL = 'https://www.asianpaints.com/footer-links/terms-and-conditions/privacy-policy.html';

// validation messages from the source form
const MESSAGES = {
  required: 'Field is required',
  name: 'Username is not valid',
  email: 'Email is invalid',
  mobile: 'Phone number is invalid',
  pincode: 'Enter a valid 6 digit Zip Code',
  choice: 'Please select an option',
  success: 'We value your interest in Asian Paints Beautiful Homes service. We will get in touch with you shortly to schedule a visit by an expert.',
  error: 'Oops! Something went wrong. We couldn’t process your request. Please try again?',
};

const PATTERNS = {
  name: /^[a-zA-Z]+( [a-zA-Z]+)*$/,
  email: /^[a-zA-Z0-9][a-zA-Z0-9-_.]+@([a-zA-Z]|[a-zA-Z0-9]?[a-zA-Z0-9-]+[a-zA-Z0-9])\.[a-zA-Z0-9]{2,10}(?:\.[a-zA-Z]{2,10})?$/,
  mobile: /^[0-9]{10}$/,
  pincode: /^[0-9]{6}$/,
};

// radio values are sent exactly as the source sends them (two options share one value)
const QUESTIONS = [
  {
    name: 'start',
    field: 'remarks',
    legend: 'When do you plan to start with the painting?',
    options: [['Immediate', 'Immediate/Within 1 Month'], ['Within a month', 'Immediate/Within 1 Month'], ['After 1 month', 'After 1 month']],
  },
  {
    name: 'painter',
    field: 'answer',
    legend: 'Is there a local painter hired?',
    options: [['Yes', 'Yes'], ['No', 'No']],
  },
];

let dialog;
let instances = 0;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) return;
    if (key === 'className') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : value);
  });
  node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

/* ---------- attribution (same inputs as the source site) ---------- */

function visitorIds() {
  let visitorId = '';
  try {
    // eslint-disable-next-line no-underscore-dangle
    visitorId = window._satellite?.getVisitorId?.()?.getMarketingCloudVisitorID?.() || '';
  } catch { /* no Adobe Launch */ }
  const ga = (document.cookie.match(/(?:^|;\s*)_ga=([^;]+)/) || [])[1] || '';
  return { visitorId, gaId: ga ? decodeURIComponent(ga).replace(/^GA\d+\.\d+\./, '') : '' };
}

function campaignCookie() {
  const match = document.cookie.match(/(?:^|;\s*)campaign_cookie_ID=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

/* ---------- field encryption ---------- */

let scriptPolicy;

/**
 * Waits for the global CryptoJS that AesUtil uses: the stage project's scripts.js loads
 * scripts/crypto.js async; elsewhere this module loads it. Pages with
 * `require-trusted-types-for 'script'` (this project's head.html) need a policy for the URL.
 */
async function ensureCryptoJS() {
  if (window.CryptoJS) return;
  const src = `${window.hlx.codeBasePath}/scripts/crypto.js`;
  let script = document.querySelector(`script[src="${src}"]`);
  if (!script) {
    script = document.createElement('script');
    if (window.trustedTypes?.createPolicy && !scriptPolicy) {
      // only ever passes this one same-origin script URL
      scriptPolicy = window.trustedTypes.createPolicy('site-visit-form-crypto', {
        createScriptURL: (url) => (url === src ? url : ''),
      });
    }
    script.src = scriptPolicy ? scriptPolicy.createScriptURL(src) : src;
    document.head.append(script);
  }
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('CryptoJS did not load')), 10000);
    const done = (fn) => () => { clearTimeout(timeout); fn(); };
    script.addEventListener('load', done(resolve), { once: true });
    script.addEventListener('error', done(() => reject(new Error('CryptoJS failed to load'))), { once: true });
  });
  if (!window.CryptoJS) throw new Error('CryptoJS missing');
}

let aesUtil;

/**
 * Encrypts one value with the project's AesUtil, as the source site does. Empty values stay
 * empty. Rejects when CryptoJS can't be loaded (the lead is then not sent).
 * @param {string} value Plain text
 * @returns {Promise<string>}
 */
async function encryptField(value) {
  if (!value) return value;
  if (!aesUtil) {
    await ensureCryptoJS();
    aesUtil = new AesUtil(128, 1000);
  }
  return aesUtil.ltyEncrypt(value);
}

/* ---------- service calls ---------- */

async function post(base, path, form) {
  const url = new URL(`${(base || '').replace(/\/$/, '')}${path}`, window.location.href);
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    body: new URLSearchParams(form),
  });
  if (!response.ok) throw new Error(`${path} responded ${response.status}`);
  let data = await response.text();
  for (let i = 0; i < 2 && typeof data === 'string'; i += 1) {
    try { data = JSON.parse(data); } catch { break; }
  }
  return data;
}

/**
 * Submits a lead like the source saveLeadsToDB, pushLeadToSalesforce and sendWhatsAppMessage.
 * @returns {Promise<boolean>} true when the lead was saved
 */
async function submitLead(values, config) {
  const params = new URLSearchParams(window.location.search);
  const utmCampaign = params.get('utm_campaign')?.trim();
  const formCampaign = campaignCookie() || config.campaign;
  const campaignId = utmCampaign || formCampaign;
  const { visitorId, gaId } = visitorIds();
  const { referrerId, marketingChannel: channel } = getMarketingChannelDetails();

  // name split as in the source: first word = fName, rest = lName (single word -> fName)
  const full = values.name.trim();
  let fName = full.substring(0, full.indexOf(' ')).trim();
  let lName = full.substring(full.indexOf(' ') + 1).trim();
  if (!fName && lName) [fName, lName] = [lName, ''];

  const encrypt = (v) => encryptField(v);
  const arabic = document.documentElement.lang === 'ar';
  const [encF, encL, email, mobileNo, pinCode] = await Promise.all([
    arabic ? fName : encrypt(fName), arabic ? lName : encrypt(lName),
    encrypt(values.email), encrypt(values.mobile), encrypt(values.pincode),
  ]);

  const common = {
    pageUrl: window.location.href,
    node: config.node,
    landMark: '',
    thirdAddress: '',
    buildingName: '',
    houseNo: '',
    organizationName: '',
    segment: '',
    street: '',
    designation: '',
    secondAddress: '',
    state: '',
    remarks: values.remarks,
    projectType: '',
    lName: encL ?? '',
    city: '',
    phoneNo: '',
    pinCode,
    email,
  };
  const tail = {
    floorNo: '',
    salutations: '',
    mobileNo,
    fName: encF ?? '',
    skuChosen: '',
    measurementNeeded: '',
    dealerName: '',
    dealerCode: '',
    answer: values.answer,
    sampleFinish: '',
    datePicker: '',
    customField: '',
  };
  const utm = {
    source: params.get('utm_source') || '',
    medium: params.get('utm_medium') || '',
    utmContent: params.get('utm_content') || '',
    utmId: params.get('utm_id') || '',
  };

  const saved = await post(config.apiBase, ENDPOINTS.save, {
    ...common,
    firstAddress: '',
    ...tail,
    visitorId,
    gaId,
    description: '',
    whatsAppConsent: values.whatsapp,
    date: '',
    ...utm,
    campaignId,
    imageUrl: '',
    referrerId,
    marketingChannel: channel,
    isFileUploadFlow: 'No',
    textEntry: '',
    fileUploadUrl: '',
    bpNumber: '',
  });
  if (saved?.Status !== 'SUCCESS') return false;

  // remembered by the source site so the exit-intent pop-up is not shown again
  const expires = new Date(Date.now() + 30 * 864e5).toUTCString();
  document.cookie = `spsFormSubmission=${JSON.stringify({ formSubmitted: true, exitPop_Up_Closed: false })};path=/;expires=${expires}`;
  try { sessionStorage.setItem('exitPopupForm', 'true'); } catch { /* ignore */ }

  const followUps = [];
  if (values.whatsapp === 'Y' && saved.templateId) {
    // the source JSON-encodes the message text a second time, so the field is a JSON string
    const message = JSON.stringify({
      event: {
        code: 'WELCOME_MESSAGE',
        data: {
          countryCode: '91', mobile: `91${values.mobile}`, name: fName, pincode: values.pincode, serviceType: '', bpNumber: '', leadId: '', messageTemplateId: saved.templateId, visitDate: '', visitTime: '',
        },
      },
    });
    followUps.push(post(config.apiBase, ENDPOINTS.whatsapp, { apiData: JSON.stringify(message) }));
  }
  const language = saved.language == null ? '' : String(saved.language);
  if (['en', 'null', ''].includes(language)) {
    // the source posts the GA id in Salesforce's visitorId field
    followUps.push(post(config.apiBase, ENDPOINTS.salesforce, {
      ...common,
      firstAddressVal: '',
      ...tail,
      visitorId: gaId,
      description: '',
      whatsAppConsent: values.whatsapp,
      ...utm,
      campaignId,
      campaignName: utmCampaign || formCampaign,
      rowId: saved.rowID ?? '',
      utmAdgroupName: params.get('UTM_Adgroup_Name') || '',
      utmKeyword: params.get('UTM_Keyword') || '',
      utmKeywordMatchType: params.get('UTM_Keyword_match_type') || '',
      utmCampaignSource: params.get('UTM_Campaign_Source') || '',
      referrerId,
      marketingChannel: channel,
      cService: '',
    }).then((body) => {
      if (salesforceAccepted(body)) {
        markLeadFormFilled({
          name: values.name,
          email: values.email,
          mobile: values.mobile,
          pincode: values.pincode,
          campaignId,
        });
      }
    }));
  }
  // the lead is stored at this point; follow-up failures must not turn it into an error
  await Promise.allSettled(followUps);
  return true;
}

/* ---------- dialog ---------- */

function textField(prefix, {
  name, label, type = 'text', autocomplete, inputmode, max, filter, pattern, message, addon,
}) {
  const id = `${prefix}-${name}`;
  const error = el('p', { className: 'svf-error', id: `${id}-error`, hidden: true });
  const input = el('input', {
    id, name, type, required: true, autocomplete, inputmode, 'aria-describedby': error.id,
  });
  const wrap = el('div', { className: 'svf-input' }, addon ? el('span', { className: 'svf-addon', text: addon, 'aria-hidden': 'true' }) : null, input);
  const field = el('div', { className: `svf-field svf-field-${name}` }, el('label', { for: id }, label, el('span', { className: 'svf-req', 'aria-hidden': 'true', text: ' *' })), wrap, error);
  const api = {
    field,
    input,
    touched: false,
    get value() { return input.value.trim(); },
    check(show = api.touched) {
      let msg = '';
      if (!api.value) msg = MESSAGES.required;
      else if (!pattern.test(api.value)) msg = message;
      if (show) {
        api.touched = true;
        error.textContent = msg;
        error.hidden = !msg;
        if (msg) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
      }
      return !msg;
    },
  };
  input.addEventListener('input', () => {
    if (filter) {
      const clean = filter(input.value).slice(0, max);
      if (clean !== input.value) input.value = clean;
    }
    if (api.touched) api.check();
  });
  input.addEventListener('blur', () => api.check(true));
  return api;
}

function choiceGroup(prefix, { name, legend, options }) {
  const id = `${prefix}-${name}`;
  const error = el('p', { className: 'svf-error', id: `${id}-error`, hidden: true });
  const radios = options.map(([label, value], i) => el('label', { className: 'svf-choice' }, el('input', {
    type: 'radio', name: `${id}`, value, id: `${id}-${i}`, required: true,
  }), label));
  const fieldset = el('fieldset', { className: `svf-group svf-group-${name}`, 'aria-describedby': error.id }, el('legend', {}, legend, el('span', { className: 'svf-req', 'aria-hidden': 'true', text: ' *' })), el('div', { className: 'svf-choices' }, radios), error);
  const inputs = () => [...fieldset.querySelectorAll('input')];
  const api = {
    field: fieldset,
    get value() { return inputs().find((r) => r.checked)?.value || ''; },
    check(show = true) {
      const ok = Boolean(api.value);
      if (show) {
        error.textContent = ok ? '' : MESSAGES.choice;
        error.hidden = ok;
        if (ok) fieldset.removeAttribute('aria-invalid');
        else fieldset.setAttribute('aria-invalid', 'true');
      }
      return ok;
    },
    focus() { inputs()[0].focus(); },
  };
  fieldset.addEventListener('change', () => api.check(true));
  return api;
}

/**
 * Builds the lead form, its result screen and the live status region. Shared by the pop-up and
 * the inline enquiry form.
 * @param {object} config Service configuration
 * @param {object} [options]
 * @param {boolean} [options.placeholders] Show the source's example text in the inputs
 * @param {string} [options.submitLabel] Submit button text
 * @param {string} [options.doneLabel] Label of the button on the thank-you screen
 * @param {Function} [options.onDone] Called by that button (the pop-up closes itself)
 */
function buildLeadForm(config, {
  placeholders = false, submitLabel = 'Book free site visit', doneLabel = 'Close', onDone,
} = {}) {
  instances += 1;
  const prefix = `svf-${instances}`;
  const letters = (v) => v.replace(/[^a-zA-Z ]/g, '');
  const digits = (v) => v.replace(/\D/g, '');
  const fields = {
    name: textField(prefix, {
      name: 'name', label: 'Name', autocomplete: 'name', max: 30, filter: letters, pattern: PATTERNS.name, message: MESSAGES.name,
    }),
    email: textField(prefix, {
      name: 'email', label: 'Email', type: 'email', autocomplete: 'email', max: 100, pattern: PATTERNS.email, message: MESSAGES.email,
    }),
    mobile: textField(prefix, {
      name: 'mobile', label: 'Mobile Number', type: 'tel', autocomplete: 'tel-national', inputmode: 'numeric', max: 10, filter: digits, pattern: PATTERNS.mobile, message: MESSAGES.mobile, addon: '+91',
    }),
    pincode: textField(prefix, {
      name: 'pincode', label: 'PIN Code', autocomplete: 'postal-code', inputmode: 'numeric', max: 6, filter: digits, pattern: PATTERNS.pincode, message: MESSAGES.pincode,
    }),
  };
  if (placeholders) {
    // the source's inline form hints; the labels stay visible
    fields.name.input.placeholder = 'Enter your name';
    fields.email.input.placeholder = 'Enter your email';
    fields.mobile.input.placeholder = 'Enter mobile number';
    fields.pincode.input.placeholder = 'Enter your Pincode';
  }
  const questions = QUESTIONS.map((q) => ({ ...q, api: choiceGroup(prefix, q) }));
  const whatsapp = el('input', { type: 'checkbox', id: `${prefix}-whatsapp`, checked: true });
  const submit = el('button', { type: 'submit', className: 'svf-submit', text: submitLabel });
  const status = el('p', { className: 'svf-sr-only', role: 'status', 'aria-live': 'polite' });

  const form = el(
    'form',
    { className: 'svf-form', noValidate: true },
    fields.name.field,
    fields.email.field,
    el('div', { className: 'svf-row' }, fields.mobile.field, fields.pincode.field),
    questions.map((q) => q.api.field),
    el('div', { className: 'svf-consent' }, whatsapp, el('label', { for: whatsapp.id, text: 'Get updates on WhatsApp' })),
    el(
      'p',
      { className: 'svf-legal' },
      'By proceeding, I authorize Asian Paints Limited and its authorized contractors/partners to contact me via WhatsApp, phone calls, SMS and e-mail and I agree to the ',
      el('a', {
        href: TERMS_URL, target: '_blank', rel: 'noopener', text: 'Terms & Conditions',
      }),
      ' and ',
      el('a', {
        href: PRIVACY_URL, target: '_blank', rel: 'noopener', text: 'Privacy Policy',
      }),
      '.',
    ),
    submit,
  );
  form.noValidate = true;

  const result = el('div', { className: 'svf-result', hidden: true });
  const content = el('div', { className: 'svf-content' }, form, result, status);

  const reset = () => {
    form.reset();
    whatsapp.checked = true;
    Object.values(fields).forEach((f) => {
      f.touched = false;
      f.check(false);
      f.input.removeAttribute('aria-invalid');
      f.field.querySelector('.svf-error').hidden = true;
    });
    questions.forEach(({ api }) => {
      api.field.removeAttribute('aria-invalid');
      api.field.querySelector('.svf-error').hidden = true;
    });
    form.hidden = false;
    result.hidden = true;
    submit.classList.remove('svf-ready');
  };
  const focusFirst = () => fields.name.input.focus();

  const showResult = (ok) => {
    form.hidden = true;
    const heading = el('h3', { tabindex: '-1', text: ok ? 'Thank you!' : 'Something went wrong' });
    result.replaceChildren(
      heading,
      el('p', { text: ok ? MESSAGES.success : MESSAGES.error }),
      ok ? el('button', {
        type: 'button',
        className: 'svf-submit',
        text: doneLabel,
        onclick: () => {
          if (onDone) onDone();
          else {
            reset();
            focusFirst();
          }
        },
      }) : el('button', {
        type: 'button', className: 'svf-submit', text: 'Try again', onclick: () => { form.hidden = false; result.hidden = true; submit.focus(); },
      }),
    );
    result.hidden = false;
    heading.focus();
    status.textContent = ok ? 'Thank you! Your site visit request has been received.' : MESSAGES.error;
  };

  // like the source, the button turns from grey to brand yellow once everything is valid; it stays
  // clickable throughout so pressing it early shows what is missing
  const updateReady = () => {
    const ready = Object.values(fields).every((f) => f.check(false))
      && questions.every(({ api }) => api.check(false));
    submit.classList.toggle('svf-ready', ready);
  };
  form.addEventListener('input', updateReady);
  form.addEventListener('change', updateReady);

  let started = false;
  form.addEventListener('focusin', () => {
    if (started) return;
    started = true;
    content.dispatchEvent(new CustomEvent('site-visit-form', { bubbles: true, detail: { name: 'form_start', campaignId: config.campaign } }));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const invalid = [
      ...Object.values(fields).filter((f) => !f.check(true)),
      ...questions.map((q) => q.api).filter((q) => !q.check(true)),
    ];
    if (invalid.length) {
      const first = invalid[0];
      if (first.input) first.input.focus();
      else first.focus();
      return;
    }
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    submit.textContent = 'Submitting…';
    let ok = false;
    try {
      ok = await submitLead({
        name: fields.name.value,
        email: fields.email.value,
        mobile: fields.mobile.value,
        pincode: fields.pincode.value,
        remarks: questions[0].api.value,
        answer: questions[1].api.value,
        whatsapp: whatsapp.checked ? 'Y' : 'N',
      }, config);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('site-visit-form: submission failed', error);
    }
    submit.disabled = false;
    submit.removeAttribute('aria-busy');
    submit.textContent = submitLabel;
    content.dispatchEvent(new CustomEvent('site-visit-form', { bubbles: true, detail: { name: ok ? 'form_submit' : 'form_error', pincode: fields.pincode.value } }));
    showResult(ok);
  });

  return {
    content, result, reset, focusFirst,
  };
}

function buildDialog(config) {
  const closeButton = el('button', {
    type: 'button', className: 'svf-close', 'aria-label': 'Close',
  });
  let node;
  const lead = buildLeadForm(config, { onDone: () => node.close() });
  const titleId = `svf-${instances}-title`;
  const body = el('div', { className: 'svf-body' }, el('div', { className: 'svf-head' }, el('h2', { id: titleId, text: 'Let our experts help you!' }), closeButton), lead.content);

  node = el(
    'dialog',
    { className: 'site-visit-form', 'aria-labelledby': titleId },
    el('p', { className: 'svf-call' }, 'Call us for Painting Services ', el('a', { href: `tel:${PHONE}`, text: PHONE })),
    body,
  );

  closeButton.addEventListener('click', () => node.close());
  // clicking the backdrop closes the dialog, as on the source
  node.addEventListener('click', (e) => { if (e.target === node) node.close(); });
  node.addEventListener('close', () => { if (!lead.result.hidden) lead.reset(); });

  node.firstFocus = lead.focusFirst;
  return node;
}

export function getSiteVisitConfig() {
  return {
    apiBase: getMetadata('asianpaints-api-base') || getMetadata('warranty-api-base'),
    campaign: getMetadata('site-visit-campaign') || DEFAULT_CAMPAIGN,
    node: getMetadata('site-visit-node') || DEFAULT_NODE,
  };
}

/**
 * Opens the site-visit lead form. Reuses one dialog per page.
 * @param {object} [config] Service configuration (defaults to page metadata)
 */
export default async function openSiteVisitForm(config = getSiteVisitConfig()) {
  await loadCSS(`${window.hlx.codeBasePath}/styles/site-visit-form.css`);
  if (!dialog) {
    dialog = buildDialog(config);
    document.body.append(dialog);
  }
  dialog.showModal();
  dialog.firstFocus();
  return dialog;
}

/**
 * Builds the same lead form for placing inline on a page (e.g. the enquiry-form block).
 * @param {object} [config] Service configuration (defaults to page metadata)
 * @param {object} [options] Form options (placeholders, submitLabel, doneLabel)
 * @returns {Promise<HTMLElement>} The form wrapper
 */
export async function createSiteVisitForm(config = getSiteVisitConfig(), options = {}) {
  await loadCSS(`${window.hlx.codeBasePath}/styles/site-visit-form.css`);
  const lead = buildLeadForm(config, { doneLabel: 'Done', ...options });
  return el('div', { className: 'site-visit-form svf-inline' }, lead.content);
}
