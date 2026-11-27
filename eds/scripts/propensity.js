/*
 * Propensity API integration.
 * Reads the segment id from <meta name="ap-propensity-segment">, resolves the
 * Experience Cloud visitor id (Launch ECID extension or Web SDK), fetches the
 * propensity score and publishes it on `window.apPropensity` and the
 * `apPropensityReady` document event.
 */

import { BETA_DOMAIN, PROD_DOMAIN } from './environment.js';

const ENDPOINT_PATH = '/apcolourcatalogue/propensity.json';
const AEM_HOSTS = [BETA_DOMAIN, PROD_DOMAIN, 'asianpaints.com'];

// The endpoint is an AEM servlet. EDS hosts (localhost, *.aem.page, *.aem.live)
// do not serve it and reject POSTs with 405, so call the AEM-backed domain there.
const ENDPOINT = AEM_HOSTS.includes(window.location.hostname)
  ? ENDPOINT_PATH
  : `https://${BETA_DOMAIN}${ENDPOINT_PATH}`;
const STORAGE_PREFIX = 'apPropensity:';
const MAX_ATTEMPTS = 20;
const RETRY_DELAY_MS = 500;

function getSegmentId() {
  const meta = document.querySelector('meta[name="ap-propensity-segment"]');
  return meta ? meta.getAttribute('content') : '';
}

async function getVisitorId() {
  try {
    // eslint-disable-next-line no-underscore-dangle -- Adobe Launch global
    const satellite = window._satellite;
    if (satellite && typeof satellite.getVisitorId === 'function') {
      const visitor = satellite.getVisitorId();
      if (visitor && typeof visitor.getMarketingCloudVisitorID === 'function') {
        return visitor.getMarketingCloudVisitorID() || '';
      }
    }
    if (typeof window.alloy === 'function') {
      const result = await window.alloy('getIdentity', { namespaces: ['ECID'] });
      return (result && result.identity && result.identity.ECID) || '';
    }
  } catch (e) {
    return '';
  }
  return '';
}

async function waitForVisitorId() {
  for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const visitorId = await getVisitorId();
    if (visitorId) return visitorId;
    if (attempt < MAX_ATTEMPTS) {
      // eslint-disable-next-line no-await-in-loop, no-promise-executor-return
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  return '';
}

function publish(result) {
  window.apPropensity = result;
  document.dispatchEvent(new CustomEvent('apPropensityReady', { detail: result }));
}

function readCache(cacheKey) {
  try {
    const cached = window.sessionStorage.getItem(cacheKey);
    return cached ? JSON.parse(cached) : null;
  } catch (e) {
    return null;
  }
}

function writeCache(cacheKey, result) {
  try {
    window.sessionStorage.setItem(cacheKey, JSON.stringify(result));
  } catch (e) {
    // storage unavailable or full; caching is best effort
  }
}

async function fetchScore(segmentId, visitorId) {
  const cacheKey = `${STORAGE_PREFIX}${segmentId}:${visitorId}`;
  const cached = readCache(cacheKey);
  if (cached) {
    publish(cached);
    return;
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ segmentId, visitorId }),
    });
    const result = await response.json();
    if (result && result.status === 'SUCCESS') {
      writeCache(cacheKey, result);
    }
    publish(result);
  } catch (e) {
    publish({ status: 'FAILURE' });
  }
}

export default async function initPropensity() {
  const segmentId = getSegmentId();
  if (!segmentId) return;

  const visitorId = await waitForVisitorId();
  if (visitorId) {
    await fetchScore(segmentId, visitorId);
  }
}
