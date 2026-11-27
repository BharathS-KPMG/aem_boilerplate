import { AesUtil } from './aesUtil.module.js';
import { getMarketingChannelDetails, rememberVisit } from './marketing-channel.js';
import { BETA_DOMAIN } from './environment.js';

// keep this visit's cid / utm_* / first referrer for the session (lead marketingChannel)
rememberVisit();

// The lead APIs only exist on the AEM site, not on the local `aem up` proxy, so on localhost
// they are called on the beta domain. Everywhere else they stay same-origin (relative paths).
const IS_LOCALHOST = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const LEAD_API_ORIGIN = IS_LOCALHOST ? `https://${BETA_DOMAIN}` : '';

const DEFAULT_ENDPOINTS = {
  saveToDB: `${LEAD_API_ORIGIN}/apcolourcatalogue/ccforms.saveleadform.json`,
  pushToSalesforce: `${LEAD_API_ORIGIN}/apcolourcatalogue/ccforms/salesforce.leadstosalesforce.json`,
};

const DEFAULT_SELECTORS = {
  name: '#enquire-name',
  email: '#enquire-email',
  mobile: '#enquire-mobile',
  pincode: '#enquire-pincode',
  whatsappConsent: '.whatsAppConsentFormFld',
  constructionWorkGoingOn: '[name="constructionWorkGoingOn"]',
  localPainterHired: '[name="localPainterHired"]',
  // BHPS form (isBhpsForm in form.js): both disclaimer questions are radio
  // groups instead of checkboxes — the checked option's own value is sent
  // as-is, taking priority over the default checkbox fields below.
  // "When do you plan to start with the painting?" -> remarks
  constructionWorkGoingOnRadio: '[name="NEW_CUSTOM_CHECKBOX_customer_response_one"]:checked',
  // "Is there a local painter hired?" -> answer
  localPainterHiredRadio: '[name="NEW_CUSTOM_CHECKBOX_customer_response_two"]:checked',
};

/**
 * Get cookie value by name
 */
export function getCookieValues(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return '';
}

// The forms checkCookieValues prefilled, with their field selectors. A signed-in visitor's
// profile can update the cookie after they rendered (login-form-fields.js, `ccformfields:update`
// with the cookie's [name, email, mobile] before and after): their fields that are empty or still
// show the old cookie value take the new one. What the visitor typed, or is typing, stays.
const prefilledForms = new Map();

window.addEventListener('ccformfields:update', ({ detail }) => {
  prefilledForms.forEach((fieldSelectors, formRow) => {
    [fieldSelectors.name, fieldSelectors.email, fieldSelectors.mobile].forEach((selector, i) => {
      const input = formRow.querySelector(selector);
      const value = detail?.current?.[i];
      if (!input || !value || input.value === value || input === document.activeElement) return;
      if (input.value && input.value !== detail.previous?.[i]) return;
      input.value = value;
      input.parentElement.classList.add('focussed');
      // the form's own input handlers update its labels, filters and submit button
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
});

/**
 * Check and prefill form fields from cookies
 * @param {Element} formRow container to search for the fields
 * @param {Object} [selectors] optional overrides for the name/email/mobile/
 *   pincode selectors (defaults: #enquire-*), for forms whose inputs use
 *   other ids
 */
export function checkCookieValues(formRow, selectors = {}) {
  const fieldSelectors = { ...DEFAULT_SELECTORS, ...selectors };
  prefilledForms.set(formRow, fieldSelectors);
  const cachedFieldVal = getCookieValues('CCFormFields');

  if (cachedFieldVal && cachedFieldVal !== '') {
    const cachedValues = cachedFieldVal.split('|');
    const fields = [
      fieldSelectors.name,
      fieldSelectors.email,
      fieldSelectors.mobile,
      fieldSelectors.pincode,
    ];

    // cookie order: name|email|mobile|pincode
    fields.forEach((selector, i) => {
      const input = formRow.querySelector(selector);
      const value = cachedValues[i];
      if (input && value && value !== '' && value !== 'undefined') {
        input.value = value;
        input.parentElement.classList.add('focussed');
      }
    });
  }
}

/**
 * Set form fields to cookies
 * @param {Element} formRow container to search for the fields
 * @param {Object} [selectors] optional selector overrides, as in checkCookieValues
 */
export function setFormFieldsToCookie(formRow, selectors = {}) {
  const fieldSelectors = { ...DEFAULT_SELECTORS, ...selectors };
  const cookieFullName = formRow.querySelector(fieldSelectors.name)?.value?.trim() || '';
  const cookieEmail = formRow.querySelector(fieldSelectors.email)?.value?.trim() || '';
  const cookieMobileNo = formRow.querySelector(fieldSelectors.mobile)?.value?.trim() || '';
  const cookiePinCode = formRow.querySelector(fieldSelectors.pincode)?.value?.trim() || '';

  const now = new Date();
  const time = now.getTime();
  const exdays = 30;
  const expireTime = time + (exdays * 24 * 60 * 60 * 1000);
  now.setTime(expireTime);

  const existingCookie = getCookieValues('CCFormFields');

  if (existingCookie === '') {
    if (cookieFullName !== '' && cookieEmail !== '' && cookieMobileNo !== '') {
      document.cookie = `CCFormFields=${cookieFullName}|${cookieEmail}|${cookieMobileNo}|${cookiePinCode};expires=${now.toUTCString()};path=/`;
    }
  } else {
    const existingValues = existingCookie.split('|');
    if (cookieFullName !== '') existingValues[0] = cookieFullName;
    if (cookieEmail !== '') existingValues[1] = cookieEmail;
    if (cookieMobileNo !== '') existingValues[2] = cookieMobileNo;
    if (cookiePinCode !== '') existingValues[3] = cookiePinCode;
    document.cookie = `CCFormFields=${existingValues[0]}|${existingValues[1]}|${existingValues[2]}|${existingValues[3]};expires=${now.toUTCString()};path=/`;
  }
}

export function splitName(fullName) {
  const normalized = (fullName || '').trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return { fName: '', lName: '' };
  }

  const firstSpace = normalized.indexOf(' ');
  if (firstSpace === -1) {
    return { fName: normalized, lName: '' };
  }

  return {
    fName: normalized.substring(0, firstSpace),
    lName: normalized.substring(firstSpace + 1),
  };
}

export function getVisitorId() {
  // Read MCMID directly from the AMCV cookie set by Alloy (was:
  // _satellite.getVisitorId() — no longer available after Launch removal).
  const m = document.cookie.match(/MCMID(?:%7C|\|)(\d+)/);
  return m ? m[1] : '';
}

export function getGaIdFromCookie() {
  let gaId = (document.cookie.match(/(?:^|;\s*)_ga=([^;]+)/) || [])[1] || '';
  if (gaId) {
    gaId = decodeURIComponent(gaId).replace(/^GA\d+\.\d+\./, '');
  }
  return gaId;
}

export function getCampaignIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return (urlParams.get('utm_campaign') || '').trim();
}

function getUtmValueFromUrl(keys = []) {
  const urlParams = new URLSearchParams(window.location.search);
  for (let i = 0; i < keys.length; i += 1) {
    const value = (urlParams.get(keys[i]) || '').trim();
    if (value) return value;
  }
  return '';
}

export function getSourceFromUrl() {
  return getUtmValueFromUrl(['utm_source', 'source']);
}

export function getMediumFromUrl() {
  return getUtmValueFromUrl(['utm_medium', 'medium']);
}

function getCampaignId(options = {}) {
  return (options.overrideCampaignId || '').trim()
    || getCampaignIdFromUrl()
    || (options.campaignId || '').trim()
    || (window.digitalData?.utmValues?.campaign || '').trim();
}

function getSource(options = {}) {
  return getSourceFromUrl()
    || (options.source || '').trim()
    || (window.digitalData?.utmValues?.source || '').trim();
}

function getMedium(options = {}) {
  return getMediumFromUrl()
    || (options.medium || '').trim()
    || (window.digitalData?.utmValues?.medium || '').trim();
}

export function encryptLeadFields({
  fName, lName, email, mobileNo, pinCode,
}) {
  try {
    if (!window.CryptoJS) {
      return {
        fName, lName, email, mobileNo, pinCode,
      };
    }

    const aesUtil = new AesUtil(128, 1000);
    return {
      fName: aesUtil.ltyEncrypt(fName),
      lName: aesUtil.ltyEncrypt(lName),
      email: aesUtil.ltyEncrypt(email),
      mobileNo: aesUtil.ltyEncrypt(mobileNo),
      pinCode: aesUtil.ltyEncrypt(pinCode),
    };
  } catch (e) {
    return {
      fName, lName, email, mobileNo, pinCode,
    };
  }
}

export function postFormUrlEncoded(url, data) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: 'application/json, text/plain, */*',
    },
    body: new URLSearchParams(data),
    credentials: 'same-origin',
  }).then(async (res) => {
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch (e) {
      body = { raw: text, status: res.status };
    }

    // fetch() only rejects on a network-level failure — a 4xx/5xx response
    // still resolves normally, so without this check a real API failure
    // (e.g. saveleadform.json returning 500) would silently take the
    // success path (submitLeadFromForm's .then()) instead of .catch(),
    // and the error popup would never show.
    if (!res.ok) {
      const error = new Error(`Request to ${url} failed with status ${res.status}`);
      error.status = res.status;
      error.body = body;
      throw error;
    }

    return body;
  });
}

export function buildLeadPayload(form, options = {}) {
  const selectors = { ...DEFAULT_SELECTORS, ...(options.selectors || {}) };
  const fullName = form.querySelector(selectors.name)?.value?.trim() || '';
  const { fName, lName } = splitName(fullName);
  const email = form.querySelector(selectors.email)?.value?.trim() || '';
  const mobileNo = form.querySelector(selectors.mobile)?.value?.trim() || '';
  const pinCode = form.querySelector(selectors.pincode)?.value?.trim() || '';
  // The selector may point to a wrapper div (lead-form pattern) or directly to
  // the checkbox input (form.js / form-banner.js pattern). Always resolve to the
  // actual <input type="checkbox"> before reading .checked.
  const consentEl = form.querySelector(selectors.whatsappConsent);
  const consentInput = consentEl?.matches('input[type="checkbox"]')
    ? consentEl
    : consentEl?.querySelector('input[type="checkbox"]');
  const whatsAppConsent = consentInput?.checked ? 'Y' : 'N';
  // BHPS form: prefer each checked disclaimer radio's own value when
  // present, falling back to the default checkboxes for non-BHPS forms.
  const constructionWorkGoingOnRadio = form
    .querySelector(selectors.constructionWorkGoingOnRadio)?.value;
  const constructionWorkGoingOn = constructionWorkGoingOnRadio
    || (form.querySelector(selectors.constructionWorkGoingOn)?.checked ? 'Yes' : '');
  const localPainterHiredRadio = form.querySelector(selectors.localPainterHiredRadio)?.value;
  const localPainterHired = localPainterHiredRadio
    || (form.querySelector(selectors.localPainterHired)?.checked ? 'Yes' : '');
  const { referrerId, marketingChannel } = getMarketingChannelDetails();

  return {
    pageUrl: options.pageUrl || window.location.href,
    node: options.resourcePath || window.location.pathname || '',
    fName,
    lName,
    email,
    mobileNo,
    pinCode,
    whatsAppConsent,
    constructionWorkGoingOn,
    localPainterHired,
    encrypted: encryptLeadFields({
      fName, lName, email, mobileNo, pinCode,
    }),
    visitorId: getVisitorId(),
    gaId: getGaIdFromCookie(),
    source: getSource(options),
    medium: getMedium(options),
    campaignId: getCampaignId(options),
    referrerId,
    marketingChannel,
  };
}

export function saveToDB(lead, options = {}) {
  const endpoints = { ...DEFAULT_ENDPOINTS, ...(options.endpoints || {}) };

  return postFormUrlEncoded(endpoints.saveToDB, {
    pageUrl: lead.pageUrl,
    node: lead.node,
    lName: lead.encrypted.lName,
    pinCode: lead.encrypted.pinCode,
    email: lead.encrypted.email,
    mobileNo: lead.encrypted.mobileNo,
    fName: lead.encrypted.fName,
    visitorId: lead.visitorId,
    gaId: lead.gaId,
    whatsAppConsent: lead.whatsAppConsent,
    // Keep legacy API keys while also sending explicit checkbox field names.
    remarks: lead.constructionWorkGoingOn,
    answer: lead.localPainterHired,
    source: lead.source,
    medium: lead.medium,
    campaignId: lead.campaignId,
    referrerId: lead.referrerId,
    marketingChannel: lead.marketingChannel,
  });
}

/** Salesforce took the lead (returnCode 201; some answers carry statusCode 200 instead) */
export const salesforceAccepted = (body) => Number(body?.returnCode) === 201
  || Number(body?.statusCode) === 200;

/**
 * A lead Salesforce accepted sets the apLeadFormFilled cookie when it qualifies
 * (scripts/form-removal.js, loaded only then).
 * @param {object} lead name, email, mobile, pincode, campaignId as sent
 * @param {Element} [form] the form filled
 */
export function markLeadFormFilled(lead, form) {
  import('./form-removal.js')
    .then(({ leadFormFilled }) => leadFormFilled(lead, form))
    .catch(() => {});
}

/**
 * @param {object} lead buildLeadPayload's lead
 * @param {string} rowId the DB row of the lead
 * @param {object} [options] endpoints; form: the form filled (form removal)
 */
export function pushToSalesforce(lead, rowId, options = {}) {
  const endpoints = { ...DEFAULT_ENDPOINTS, ...(options.endpoints || {}) };

  return postFormUrlEncoded(endpoints.pushToSalesforce, {
    pageUrl: lead.pageUrl,
    node: lead.node,
    lName: lead.encrypted.lName,
    pinCode: lead.encrypted.pinCode,
    email: lead.encrypted.email,
    mobileNo: lead.encrypted.mobileNo,
    fName: lead.encrypted.fName,
    visitorId: lead.gaId,
    whatsAppConsent: lead.whatsAppConsent,
    // Keep legacy API keys while also sending explicit checkbox field names.
    remarks: lead.constructionWorkGoingOn,
    answer: lead.localPainterHired,
    source: lead.source,
    medium: lead.medium,
    campaignId: lead.campaignId,
    campaignName: lead.campaignId,
    rowId,
    referrerId: lead.referrerId,
    marketingChannel: lead.marketingChannel,
  }).then((body) => {
    if (salesforceAccepted(body)) {
      markLeadFormFilled({
        name: `${lead.fName} ${lead.lName}`,
        email: lead.email,
        mobile: lead.mobileNo,
        pincode: lead.pinCode,
        campaignId: lead.campaignId,
      }, options.form);
    }
    return body;
  });
}

export function submitLeadFromForm(form, options = {}) {
  const lead = buildLeadPayload(form, options);

  return saveToDB(lead, options)
    .then((dbResult) => {
      const rowId = dbResult?.rowID || `direct-${Date.now()}`;
      return pushToSalesforce(lead, rowId, { ...options, form });
    });
}
