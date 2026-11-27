/*
 * The signed-in visitor's details in the lead forms, as the AEM site's getLoginUserDetails (cc.js).
 *
 * The lead forms prefill name, email, mobile and pincode from the CCFormFields cookie
 * ("name|email|mobile|pincode", 30 days). Once Keycloak has signed the visitor in, the header
 * calls syncLoginFormFields: the name, email and mobile number of their profile
 * (profile.userProfile.json) replace the cookie's, so every form shows them. The pincode, and
 * whatever the cookie holds after it, is kept. The profile is read once a session per user.
 *
 * Forms already on the page read the cookie before the sign-in finished, so a change is also
 * announced as a `ccformfields:update` window event, detail { previous, current }: the cookie's
 * [name, email, mobile] before and after. form-submit-common.js fills it into the forms it
 * prefilled; hero-form.js prefills on it when it had no cookie to start with.
 */
import { BETA_DOMAIN, PROD_DOMAIN, isProdDomain } from './environment.js';

const COOKIE = 'CCFormFields';
const COOKIE_DAYS = 30;
const PROFILE_PATH = '/apcolourcatalogue/keycloak/profile.userProfile.json';
// the user whose profile is in the cookie, this session
const SYNCED_KEY = 'ccFormFieldsProfile';

function readCookie() {
  const entry = document.cookie.split(';').map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`));
  return entry ? entry.slice(COOKIE.length + 1) : '';
}

function readSynced() {
  try {
    return sessionStorage.getItem(SYNCED_KEY);
  } catch (e) {
    return null;
  }
}

function writeSynced(userId) {
  try {
    sessionStorage.setItem(SYNCED_KEY, userId);
  } catch (e) {
    // storage unavailable: the profile is read on each page
  }
}

// "|" separates the cookie's values and ";" would end the cookie
const clean = (value) => String(value || '').replace(/[|;\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

// the profile's number may carry the country code: its last 10 digits (extractValidMobileNumber)
const tenDigits = (value) => (String(value || '').replace(/\D/g, '').match(/\d{10}$/) || [''])[0];

/** the visitor's profile; null when it can't be read */
async function fetchProfile() {
  // the site's services: relative on its own domains, else on the env's site (prod or beta)
  const host = window.location.hostname.toLowerCase();
  const own = host === 'asianpaints.com' || host.endsWith('.asianpaints.com');
  const site = own ? '' : `https://${isProdDomain() ? PROD_DOMAIN : BETA_DOMAIN}`;
  try {
    const response = await fetch(`${site}${PROFILE_PATH}?_=${Date.now()}`, { credentials: 'include' });
    return response.ok ? await response.json() : null;
  } catch (e) {
    return null;
  }
}

/**
 * Writes the signed-in visitor's name, email and mobile number into the CCFormFields cookie.
 * @param {object} [user]
 * @param {string} [user.userId] the Keycloak subject: the profile is read once a session per user
 * @param {object} [user.claims] the parsed ID (or access) token: the name and email when the
 *   profile has none
 */
export default async function syncLoginFormFields({ userId = '', claims = {} } = {}) {
  if (userId && readSynced() === userId && readCookie()) return;

  const profile = await fetchProfile();
  const name = clean([profile?.firstName, profile?.lastName].map(clean).filter(Boolean).join(' ')
    || claims?.name
    || [claims?.given_name, claims?.family_name].filter(Boolean).join(' '));
  const email = clean(profile?.email || claims?.email);
  const mobile = tenDigits(profile?.attributes?.mobileNumber?.[0]);
  // not read (or not signed in on the services' side): tried again on the next page
  if (userId && (profile?.email || profile?.firstName)) writeSynced(userId);

  const previous = readCookie().split('|');
  while (previous.length < 4) previous.push('');
  const next = [...previous];
  [name, email, mobile].forEach((value, i) => {
    if (value) next[i] = value;
  });
  if (next.join('|') === previous.join('|')) return;

  const expires = new Date(Date.now() + COOKIE_DAYS * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${COOKIE}=${next.join('|')};expires=${expires};path=/`;
  window.dispatchEvent(new CustomEvent('ccformfields:update', {
    detail: { previous: previous.slice(0, 3), current: next.slice(0, 3) },
  }));
}
