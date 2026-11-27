/**
 * store-finder data: the source's store service (POST, form-encoded; it answers
 * on the asianpaints.com hosts, not on *.aem.page) with the authored snapshot
 * sheet as the fallback. Snapshot rows (one per store):
 *   city | cityLatitude | cityLongitude | name | type | address | pincode |
 *   latitude | longitude | phone | timings | products | services
 */

import {
  norm, key, snapshotRows,
} from '../../scripts/store-locator.js';

/** a store from the service's JSON or a snapshot row, in one shape */
function toStore(s) {
  return {
    name: norm(s.companyname ?? s.name),
    type: norm(s.typeofretailer ?? s.type),
    address: norm(s.address),
    pincode: norm(s.pincode),
    latitude: Number(s.latitude),
    longitude: Number(s.longitude),
    phone: norm(s.mobileno ?? s.phone),
    timings: norm(s.storetimings ?? s.timings),
    products: norm(s.products),
    services: norm(s.servicesprovided ?? s.services),
  };
}

const valid = (s) => s.name && Number.isFinite(s.latitude) && Number.isFinite(s.longitude);

/**
 * Stores near a point: the service first (as the source sends it), then the
 * snapshot's stores for the searched city.
 * @returns {Promise<{stores: Array, source: 'endpoint'|'snapshot'|'none'}>}
 */
export async function findStores({
  endpoint, snapshotUrl, query, centre, radius, limit, types, sortByDistance,
}) {
  if (endpoint && centre) {
    try {
      const body = new URLSearchParams({
        latitude: centre.lat,
        longitude: centre.lng,
        radius,
        limit,
        products: '',
        servicesprovided: '',
        typeofretailer: types,
        sortByDistanceFlag: sortByDistance,
      });
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body,
      });
      if (resp.ok) {
        const json = await resp.json();
        if (Array.isArray(json) && json.length) {
          return { stores: json.map(toStore).filter(valid), source: 'endpoint' };
        }
      }
    } catch (e) {
      // off production the service refuses the request (CORS): use the snapshot
    }
  }
  const rows = await snapshotRows(snapshotUrl);
  const stores = rows.filter((r) => key(r.city) === key(query)).map(toStore).filter(valid);
  return { stores: stores.slice(0, Number(limit) || stores.length), source: stores.length ? 'snapshot' : 'none' };
}

/**
 * The source's opening line: "Closes: 9:00pm", and whether the store is open
 * now (the source compares the visitor's clock; here India time, as the
 * stores are).
 */
export function opening(timings) {
  const opens = /OPENS\s+(\d{1,2}):(\d{2})\s?([AP]M)/i.exec(timings || '');
  const closes = /CLOSES\s+(\d{1,2}):(\d{2})\s?([AP]M)/i.exec(timings || '');
  if (!opens || !closes) return { closes: '', open: false };
  const mins = ([, h, m, ap]) => ((Number(h) % 12) + (/p/i.test(ap) ? 12 : 0)) * 60 + Number(m);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const now = Number(parts.find((p) => p.type === 'hour').value) * 60
    + Number(parts.find((p) => p.type === 'minute').value);
  return {
    closes: `${closes[1]}:${closes[2]}${closes[3].toLowerCase()}`,
    open: now >= mins(opens) && now < mins(closes),
  };
}

/** "Paints,Wood Finishes" -> ['Paints', 'Wood Finishes'] (the source hides "nan") */
export const list = (value) => norm(value).split(',').map((v) => v.trim())
  .filter((v) => v && v.toLowerCase() !== 'nan');

/** the source's badge colour key: "Colour Ideas" -> "colourideas" */
export const typeKey = (type) => key(type).replace(/\s+/g, '');
