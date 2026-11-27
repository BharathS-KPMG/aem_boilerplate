/**
 * colour-quiz lead API — the calls the source page (asianpaints.com
 * home-colour-guide) makes from the quiz lead form, ported 1:1:
 *
 *   1. save lead       POST form-urlencoded, personal fields AES-encrypted
 *   2. recommendations GET  ?q=<ts>&requestObject=<quiz JSON>&pagePath=…
 *   3. PDF upload      POST encodeURIComponent(JSON.stringify(<pdf base64>))
 *   4. Salesforce      POST form-urlencoded, lead row id + PDF link
 *
 * Field names, order, encodings and fall-backs match the source scripts
 * (colourconsultancy clientlib + commonheader AesUtil). Endpoints are
 * authored (relative paths): the source endpoints only answer same-origin
 * requests from www.asianpaints.com, so elsewhere the calls fail and the
 * block falls back exactly as the source does on an error.
 */

// the source's AesUtil(128, 1000).ltyEncrypt passphrase (client-side, as on the source)
const PASSPHRASE = 'asianpaints';
const ITERATIONS = 1000;

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));
const base64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

/**
 * AesUtil.ltyEncrypt: PBKDF2-SHA1 (1000 iterations, 128-bit key) from the
 * passphrase and a random salt, AES-128-CBC/PKCS7 with a random IV.
 * Returns saltHex + ivHex + base64(ciphertext); empty input -> undefined
 * (the field is then left out of the request, as jQuery does).
 * @param {string} text
 * @param {{salt?: string, iv?: string}} [fixed] hex salt/IV (tests only)
 */
export async function ltyEncrypt(text, fixed = {}) {
  if (!text) return undefined;
  const { subtle } = window.crypto;
  const salt = fixed.salt ? unhex(fixed.salt) : window.crypto.getRandomValues(new Uint8Array(16));
  const iv = fixed.iv ? unhex(fixed.iv) : window.crypto.getRandomValues(new Uint8Array(16));
  const material = await subtle.importKey('raw', new TextEncoder().encode(PASSPHRASE), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey(
    {
      name: 'PBKDF2', hash: 'SHA-1', salt, iterations: ITERATIONS,
    },
    material,
    { name: 'AES-CBC', length: 128 },
    false,
    ['encrypt'],
  );
  const cipher = await subtle.encrypt({ name: 'AES-CBC', iv }, key, new TextEncoder().encode(text));
  return `${hex(salt)}${hex(iv)}${base64(cipher)}`;
}

/**
 * jQuery only adds X-Requested-With to same-origin requests. Cross-origin
 * (endpoints authored as full URLs), a custom header would force a CORS
 * preflight; without it these are "simple" requests.
 */
const ajaxHeaders = (url, headers = {}) => (
  new URL(url, window.location.href).origin === window.location.origin
    ? { ...headers, 'X-Requested-With': 'XMLHttpRequest' }
    : headers
);

/**
 * jQuery.param: null/undefined values are sent as empty ("city="), never
 * dropped — the lead endpoints expect every field — and %20 is sent as "+".
 */
function formBody(pairs) {
  return pairs
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? '')}`)
    .join('&')
    .replace(/%20/g, '+');
}

const FORM_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
};

/** Adobe Experience Cloud visitor id (getMcvid). */
export function mcvid() {
  try {
    // eslint-disable-next-line no-underscore-dangle
    return window._satellite?.getVisitorId?.()?.getMarketingCloudVisitorID?.() || '';
  } catch (e) { return ''; }
}

/** GA client id from the _ga cookie (getGaClientIdFromCookie). */
export function gaClientId() {
  const v = (document.cookie.match(/(?:^|;\s*)_ga=([^;]+)/) || [])[1] || '';
  return v ? decodeURIComponent(v).replace(/^GA\d+\.\d+\./, '') : '';
}

/** UTM values read once on load, as the source does. */
export function utmValues() {
  const p = new URLSearchParams(window.location.search);
  const val = (k) => p.get(k) || '';
  return {
    source: val('utm_source'),
    medium: val('utm_medium'),
    utmContent: val('utm_content'),
    utmId: val('utm_id'),
    campaign: (p.get('utm_campaign') || '').trim(),
    utmAdgroupName: val('UTM_Adgroup_Name'),
    utmKeyword: val('UTM_Keyword'),
    utmKeywordMatchType: val('UTM_Keyword_match_type'),
    utmCampaignSource: val('UTM_Campaign_Source'),
  };
}

/** Address/unused fields the source always sends empty, in its order. */
const leadFields = (lead) => [
  ['pageUrl', lead.pageUrl],
  ['node', lead.node],
  ['landMark', ''], ['thirdAddress', ''], ['buildingName', ''], ['houseNo', ''],
  ['organizationName', ''], ['segment', ''], ['street', ''], ['designation', ''],
  ['secondAddress', ''], ['state', ''],
  ['remarks', lead.remarks],
  ['projectType', ''],
  ['lName', lead.lName],
  ['city', lead.city],
  ['phoneNo', ''],
  ['pinCode', lead.pinCode],
  ['email', lead.email],
  ['firstAddress', ''], ['floorNo', ''], ['salutations', ''],
  ['mobileNo', lead.mobileNo],
  ['fName', lead.fName],
  ['skuChosen', ''], ['measurementNeeded', ''], ['dealerName', ''], ['dealerCode', ''],
  ['answer', lead.answer],
  ['sampleFinish', ''], ['datePicker', ''], ['customField', ''],
];

/**
 * ccforms.saveleadform — returns { ok, rowId }.
 * @param {string} url endpoint
 * @param {object} lead encrypted fields + context (see colour-quiz lead-form)
 */
export async function saveLead(url, lead) {
  const { utm } = lead;
  const body = formBody([
    ...leadFields(lead),
    ['visitorId', lead.visitorId],
    ['gaId', lead.gaId],
    ['description', ''], ['whatsAppConsent', ''],
    ['source', utm.source], ['medium', utm.medium], ['utmContent', utm.utmContent], ['utmId', utm.utmId],
    ['campaignId', lead.campaignId],
    ['imageUrl', ''],
    ['referrerId', lead.channel.referrerId],
    ['marketingChannel', lead.channel.marketingChannel],
  ]);
  try {
    const resp = await fetch(url, { method: 'POST', headers: ajaxHeaders(url, FORM_HEADERS), body });
    const json = resp.ok ? await resp.json() : {};
    return json.Status === 'SUCCESS' ? { ok: true, rowId: json.rowID || '' } : { ok: false, rowId: '' };
  } catch (e) {
    return { ok: false, rowId: '' };
  }
}

/**
 * salesforce.leadstosalesforce — returns true on returnCode 201.
 * The source sends the GA client id as visitorId here (not the Adobe id).
 */
export async function sendToSalesforce(url, lead, rowId, pdfUrl) {
  const { utm } = lead;
  const body = formBody([
    ...leadFields(lead),
    ['visitorId', lead.gaId],
    ['description', ''], ['whatsAppConsent', ''],
    ['source', utm.source], ['medium', utm.medium], ['utmContent', utm.utmContent], ['utmId', utm.utmId],
    ['campaignId', lead.campaignId],
    ['campaignName', lead.campaignName],
    ['rowId', rowId],
    ['userCcoPDF', pdfUrl],
    ['utmAdgroupName', utm.utmAdgroupName],
    ['utmKeyword', utm.utmKeyword],
    ['utmKeywordMatchType', utm.utmKeywordMatchType],
    ['utmCampaignSource', utm.utmCampaignSource],
    ['referrerId', lead.channel.referrerId],
    ['marketingChannel', lead.channel.marketingChannel],
  ]);
  try {
    const resp = await fetch(url, {
      method: 'POST', headers: ajaxHeaders(url, FORM_HEADERS), body, keepalive: body.length < 60000,
    });
    const json = resp.ok ? await resp.json() : {};
    return Number(json.returnCode) === 201;
  } catch (e) {
    return false;
  }
}

/** colourConsultancy/recommendationDetails — the response JSON, or null. */
export async function fetchRecommendations(url, requestObject, pagePath) {
  const now = Date.now();
  const sep = url.includes('?') ? '&' : '?';
  const query = formBody([['requestObject', JSON.stringify(requestObject)], ['pagePath', pagePath || ''], ['_', String(now)]]);
  try {
    const resp = await fetch(`${url}${sep}q=${now}&${query}`, {
      headers: ajaxHeaders(url, { Accept: 'application/json, text/javascript, */*; q=0.01' }),
      cache: 'no-store',
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return json && Array.isArray(json.coloursRecommended) ? json : null;
  } catch (e) {
    return null;
  }
}

/** azureassetcall — uploads the PDF (base64) and returns its URL ('' on failure). */
export async function uploadPdf(url, pdfBase64) {
  const sep = url.includes('?') ? '&' : '?';
  try {
    const resp = await fetch(`${url}${sep}container=ccoquiz&imagename=colourRecommendation&fileType=pdf`, {
      method: 'POST',
      headers: ajaxHeaders(url, { 'Content-Type': 'application/x-www-form-urlencoded' }),
      body: encodeURIComponent(JSON.stringify(pdfBase64)),
    });
    return resp.ok ? (await resp.text()).trim() : '';
  } catch (e) {
    return '';
  }
}

/** Adobe Launch (_satellite) + Adobe/GA4 data layers, guarded like the source. */
export function track(event, detail = {}, { adobe = true, ga4 = null } = {}) {
  try {
    // eslint-disable-next-line no-underscore-dangle
    if (typeof window._satellite !== 'undefined') window._satellite.track(event, detail);
  } catch (e) { /* analytics unavailable */ }
  if (adobe) {
    window.adobeDataLayer = window.adobeDataLayer || [];
    window.adobeDataLayer.push({ event, eventInfo: { ...detail } });
  }
  if (ga4) {
    // ccAnalytics.ga4DataLayer: event first, then login status (no login on EDS)
    const { event: ga4Event, ...rest } = ga4;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: ga4Event, user_status: 'No', ...rest });
  }
}
