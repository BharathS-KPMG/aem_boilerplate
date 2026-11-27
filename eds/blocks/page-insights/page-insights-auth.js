/* =============================================================
 * page-insights — who can see it
 *
 * Page Insights is only for signed-in users with one of the
 * ALLOWED_ROLES Keycloak realm roles. The site header
 * (blocks/header/header.js) runs the Keycloak sign-in and saves the
 * session in localStorage; this file only reads what it saved.
 *
 *   canViewPageInsights()  true when a signed-in user with an allowed role is saved
 *   getIdToken()           the ID token sent to the analytics API
 *   watchAccess()          calls back when the user signs in or out
 *
 * This file is tiny on purpose: scripts/page-insights-loader.js
 * imports it to decide whether to download the rest of the block.
 * ============================================================= */

/* localStorage keys written by header.js */
const TOKEN_KEY = 'keycloak-token';
const ID_TOKEN_KEY = 'keycloak-id-token';
const PROFILE_KEY = 'userProfile';

/* Keycloak realm roles that may see Page Insights (case-sensitive). */
const ALLOWED_ROLES = ['app-IT', 'app-brand', 'app-marketing'];

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null; // storage blocked (e.g. strict privacy mode)
  }
}

/**
 * True when the header has a signed-in user saved: the same
 * localStorage check as getLoginStatus() in scripts/analytics_1.js.
 * header.js removes both keys when the session ends or cannot be
 * refreshed, so this follows what the header shows.
 */
function isUserLoggedIn() {
  return Boolean(readStorage(TOKEN_KEY) && readStorage(PROFILE_KEY));
}

/**
 * The user's realm roles, read from realm_access.roles of the saved
 * access token: the same claim keycloak.hasRealmRole() checks.
 * @returns {string[]}
 */
function getRealmRoles() {
  try {
    const payload = readStorage(TOKEN_KEY).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { realm_access: realmAccess } = JSON.parse(atob(payload));
    return Array.isArray(realmAccess?.roles) ? realmAccess.roles : [];
  } catch (error) {
    return []; // no token, or not a JWT
  }
}

/**
 * True when a signed-in user with one of ALLOWED_ROLES is saved.
 * This only hides the button: the APIs must check the roles themselves.
 */
export function canViewPageInsights() {
  if (!isUserLoggedIn()) return false;
  const roles = getRealmRoles();
  return ALLOWED_ROLES.some((role) => roles.includes(role));
}

/**
 * The Keycloak ID token (typ "ID"). The analytics API accepts only
 * this token, not the access token saved under 'keycloak-token'.
 */
export function getIdToken() {
  return readStorage(ID_TOKEN_KEY);
}

/**
 * Calls onChange(canView) whenever the sign-in state or roles may have changed:
 *   keycloakLoginReady     the header finished signing the user in
 *   keycloakLoginNotReady  the header found no valid session, or a refresh failed
 *   storage                the user signed in or out (or the token was refreshed) in another tab
 * Signing out in this tab sends the browser to the Keycloak logout page,
 * so the page reloads; the panel also re-checks before it opens.
 * @param {(canView: boolean) => void} onChange
 * @returns {() => void} call it to stop watching
 */
export function watchAccess(onChange) {
  const notify = () => onChange(canViewPageInsights());
  const onStorage = (event) => {
    // key is null when the whole of localStorage was cleared
    if (event.key === null || event.key === TOKEN_KEY || event.key === PROFILE_KEY) notify();
  };

  window.addEventListener('keycloakLoginReady', notify);
  window.addEventListener('keycloakLoginNotReady', notify);
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener('keycloakLoginReady', notify);
    window.removeEventListener('keycloakLoginNotReady', notify);
    window.removeEventListener('storage', onStorage);
  };
}
