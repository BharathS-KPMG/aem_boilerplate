/**
 * budget-calculator data: the source's budgetCalculatorEnhanced API, with an
 * authored snapshot sheet as the fallback.
 *
 * The API's numbers can be recomputed from area-independent product data
 * (checked against 690 API records, all exact):
 *   painting area   walls x 2.5 (Interior) / x 1.5 (Exterior); ceiling = walls;
 *                   wood / metal as entered
 *   step quantity   ceil(area x coats / coverage)     (each "stepN" string:
 *                   "<coats> <name> | img | page | code | ? | <coverage> | <qty> | <unit price>")
 *   total (mrp)     ceil(sum of step quantity x unit price)
 *   wood            stepOne "<coats>|<coverage>|<unit>", total ceil(pricePerSqFt x area)
 * so the snapshot holds the product lists per space and need, and quantities
 * and totals are recomputed for the visitor's areas.
 */

export const STEPS = ['stepOne', 'stepTwo', 'stepThree', 'stepFour'];
export const MULTIPLIER = { Interior: 2.5, Exterior: 1.5 };

/** the source's tier order on the walls screen (and in the results) */
export const TIERS = {
  Interior: ['Super Luxury Products', 'Luxury Products', 'Premium Products', 'Economy Products'],
  Exterior: ['Ultima Exterior Emulsions', 'Apex Exterior Emulsions', 'Ace Exterior Emulsions'],
};

const tenths = (n) => Math.round(Number(n) * 10);
const paise = (n) => Math.round(Number(String(n).replace(/,/g, '')) * 100);
const ceilDiv = (a, b) => Math.ceil(a / b - 1e-9);

/** "3 Litres" -> "3 Litre" when the quantity is 1 or less (the source's wording) */
export const unitWord = (qty) => {
  const [n, ...rest] = String(qty || '').trim().split(' ');
  const u = rest.join(' ');
  return parseFloat(n) <= 1 ? `${n} ${u.replace('Litres', 'Litre')}` : `${n} ${u}`.trim();
};

export const parseStep = (s) => {
  const p = String(s || '').split('|').map((x) => x.trim());
  if (p.length < 8) return null;
  return {
    coats: parseFloat(p[0]) || 0,
    name: p[0].replace(/^\d+\s*/, ''),
    image: p[1],
    page: p[2],
    coverage: parseFloat(p[5]) || 0,
    qty: p[6],
    price: p[7],
  };
};

/** recompute one product's quantities and total for an area (in sq ft, may be x.5) */
export function recompute(item, area) {
  const a10 = tenths(area);
  const out = { ...item };
  if (item.category === 'Wood') {
    const [coats, coverage, unit] = String(item.stepOne || '').split('|').map((x) => x.trim());
    if (coverage) out.quantityRequired = `${ceilDiv(a10 * parseFloat(coats), tenths(coverage))} ${unit}`;
    out.mrp = ceilDiv(paise(item.pricePerSqFt) * a10, 1000);
    return out;
  }
  let total = 0;
  let last = null;
  STEPS.forEach((key) => {
    const s = parseStep(item[key]);
    if (!s || !s.coverage) return;
    const q = ceilDiv(a10 * s.coats, tenths(s.coverage));
    const unit = s.qty.split(' ').slice(1).join(' ');
    const parts = String(item[key]).split('|');
    parts[6] = `${q} ${unit}`;
    out[key] = parts.join('|');
    total += q * paise(s.price);
    last = `${q} ${unit}`;
  });
  if (last) out.quantityRequired = last;
  out.mrp = ceilDiv(total, 100);
  return out;
}

/** areas per API category for the visitor's inputs */
export function areas(space, walls, wood, metal) {
  const w = Number(walls) || 0;
  return {
    [space]: w * (MULTIPLIER[space] || 1),
    Ceiling: w,
    Wood: Number(wood) || 0,
    Metal: Number(metal) || 0,
  };
}

const hasData = (resp) => resp && resp.data && Object.keys(resp.data).length;

async function getJson(url) {
  const resp = await fetch(url, { credentials: 'same-origin' });
  if (!resp.ok) throw new Error(`${url}: ${resp.status}`);
  return resp.json();
}

/** rows of the snapshot sheet (space | need | category | data) */
let sheetCache;
async function snapshot(url, space, need) {
  sheetCache = sheetCache || getJson(url);
  const sheet = await sheetCache;
  const rows = sheet.data || sheet[Object.keys(sheet).find((k) => sheet[k]?.data)]?.data || [];
  const data = {};
  rows.filter((r) => r.space === space && r.need === need).forEach((r) => {
    data[r.category] = JSON.parse(r.data);
  });
  return Object.keys(data).length ? { data } : null;
}

/**
 * The visitor's products: the endpoint's response (as the source), or the
 * snapshot with quantities and totals recomputed for these areas.
 * @returns {Promise<{data: Object, source: 'endpoint'|'snapshot'}>}
 */
export async function loadProducts({
  endpoint, snapshotUrl, space, need, walls, wood, metal,
}) {
  const query = new URLSearchParams({
    projectType: need, category: space, wallArea: walls, woodArea: wood, metalArea: metal,
  });
  try {
    const baseUrl = window.location.hostname === 'localhost'
      ? 'https://beta.asianpaints.com'
      : '';

    const resp = await getJson(`${baseUrl}${endpoint}${endpoint.includes('?') ? '&' : '?'}${query}`);
    if (hasData(resp) && resp.totalProducts) return { data: resp.data, source: 'endpoint' };
  } catch (e) { /* not reachable here (no CORS): use the snapshot */ }
  if (!snapshotUrl) throw new Error('no product data');
  const snap = await snapshot(snapshotUrl, space, need);
  if (!snap) throw new Error('no product data');
  const ar = areas(space, walls, wood, metal);
  const data = {};
  Object.entries(snap.data).forEach(([cat, v]) => {
    const area = ar[cat] || 0;
    const fix = (list) => list.map((item) => recompute(item, area));
    data[cat] = Array.isArray(v)
      ? fix(v)
      : Object.fromEntries(Object.entries(v).map(([k, l]) => [k, fix(l)]));
  });
  return { data, source: 'snapshot' };
}
