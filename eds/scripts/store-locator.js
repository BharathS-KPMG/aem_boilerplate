import { geocode } from './google-maps.js';

/**
 * Shared by the store locator's three blocks (store-search, store-finder, city-stores): the
 * DOM and authoring helpers, the events the blocks talk through, the stores snapshot sheet and
 * the lookup that turns what was searched into coordinates.
 *
 * store-search and the city cards send SEARCH_EVENT; the store-finder answers with RESULT_EVENT.
 */

export const SEARCH_EVENT = 'store-finder:search';
export const RESULT_EVENT = 'store-finder:result';
export const DESKTOP = '(min-width: 992px)';
export const MOBILE = '(max-width: 991px)';

export const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
export const href = (cell) => cell?.querySelector('a[href]')?.getAttribute('href') || text(cell);
export const norm = (value) => String(value ?? '').trim();
export const key = (value) => norm(value).toLowerCase();

export function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
  });
  return node;
}

/**
 * Reads label | value rows. `map` maps a lower-case label to a field name.
 * @returns {Object<string, {row: Element, cell: Element}>}
 */
export function readFields(block, map) {
  const fields = {};
  [...block.children].forEach((row) => {
    const [label, cell] = row.children;
    const k = map[text(label).toLowerCase()];
    if (k) fields[k] = { row, cell: cell || null };
  });
  return fields;
}

/**
 * A field's authored value, else the default. Fields in `links` read a link's address.
 * @returns {(name: string) => string}
 */
export function fieldReader(fields, defaults, links = []) {
  return (name) => {
    const cell = fields[name]?.cell;
    if (!cell) return defaults[name];
    return (links.includes(name) ? href(cell) : text(cell)) || defaults[name];
  };
}

/** Universal Editor: carries instrumentation over (a no-op with DA authoring) */
export async function instrumentation() {
  const { moveInstrumentation = () => {} } = await import('./scripts.js');
  return moveInstrumentation;
}

/* ---------- the stores snapshot sheet ---------- */

const sheets = new Map();
/** the snapshot sheet's rows (one fetch per URL for the page), [] when it is not there */
export function snapshotRows(url) {
  if (!url) return Promise.resolve([]);
  if (!sheets.has(url)) {
    sheets.set(url, fetch(url)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => j.data || j.stores?.data || [])
      .catch(() => []));
  }
  return sheets.get(url);
}

/* ---------- coordinates ---------- */

/**
 * City names for suggestions when Google's are not available:
 * the snapshot sheet's, if there is one.
 */
export async function cityNames(snapshotUrl) {
  const rows = await snapshotRows(snapshotUrl);
  return [...new Set(rows.map((r) => norm(r.city)).filter(Boolean))];
}

/**
 * Where a search is, as the source does it: the point of the Google suggestion the visitor picked,
 * else Google's geocoder on whatever was searched (needs a Maps key). null when it can't say.
 * No coordinates are kept in code or content, so a new city needs no change.
 */
export async function placeCentre({ query, at }) {
  if (at && Number.isFinite(Number(at.lat)) && Number.isFinite(Number(at.lng))) return at;
  return geocode(query);
}
