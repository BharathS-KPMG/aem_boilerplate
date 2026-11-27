/*
 * Product data of products-listing (its cards, and the filters and compare panel of the
 * product-filters bar it adds).
 *
 * Sources, in the order the block uses them (as plp-left-filter): the Products API (AEM, when
 * set and it answers), then the products authored in the block table, then the Data file (a DA
 * sheet or workbook). Each URL is fetched once per page.
 *
 * A response may be:
 *   - the source's AEM listing JSON: a list, or { products | items | data: [...] }, of
 *     { productCode, productName, brandName, category, pageUrl, productPackshotImage,
 *       featuredTag, visibleTags, livePrice, popularity, filterTitle: { group: [values] } };
 *   - a DA sheet ({ data: [{ code, name, brand, category, url, image, badge, features, price,
 *     popularity, filter-<group> }] }, features "|"-separated, filter values comma-separated);
 *   - a DA workbook (multi-sheet): the products of all its sheets, each product once.
 * Filter groups come from the products' own filter values.
 */

const SITE = 'https://www.asianpaints.com';
const TIMEOUT = 5000;
const cache = new Map();

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/**
 * The JSON at url, fetched once per page (later calls share the first request).
 * @param {string} url
 * @returns {Promise<object|null>} null when there is no answer, it fails or it is slow
 */
export function loadJson(url) {
  if (!url) return Promise.resolve(null);
  if (!cache.has(url)) {
    cache.set(url, (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT);
      try {
        const response = await fetch(url, { signal: controller.signal });
        return response.ok ? await response.json() : null;
      } catch (e) {
        return null;
      } finally {
        clearTimeout(timer);
      }
    })());
  }
  return cache.get(url);
}

// a sheet row's `filter-<group>` columns as { group: 'a, b' }
const filterColumns = (record) => Object.fromEntries(Object.entries(record)
  .filter(([key]) => key.startsWith('filter-'))
  .map(([key, value]) => [key.slice('filter-'.length), value]));

// "range: luxury | sheen: matt, satin" (an authored cell) as
// { range: 'luxury', sheen: 'matt, satin' }
const filterText = (text) => Object.fromEntries(String(text || '').split(/[|\n]/)
  .map((pair) => pair.split(':'))
  .filter(([group, values]) => clean(group) && clean(values))
  .map(([group, ...values]) => [clean(group), values.join(':')]));

// filter values by group, lower case as on the source's filter labels: { range: ['luxury'] }
function normalizeFilters(source) {
  const filters = {};
  const entries = typeof source === 'string' ? filterText(source) : source || {};
  Object.entries(entries).forEach(([group, values]) => {
    const list = (Array.isArray(values) ? values : String(values).split(','))
      .map((value) => clean(value).toLowerCase()).filter(Boolean);
    if (list.length) filters[group] = list;
  });
  return filters;
}

/**
 * One product, from a DA sheet row, an authored table row or the AEM listing JSON.
 * @param {object} record
 */
export function normalizeProduct(record) {
  const features = Array.isArray(record.visibleTags ?? record.features)
    ? record.visibleTags ?? record.features
    : String(record.features || '').split('|');
  const image = record.image ?? record.productPackshotImage ?? '';
  return {
    code: clean(record.code ?? record.productCode),
    name: clean(record.name ?? record.productName),
    brand: clean(record.brand ?? record.brandName),
    category: clean(record.category),
    url: clean(record.url ?? record.pageUrl ?? record.seoPdpPageUrl),
    image: image ? new URL(image, SITE).href : '',
    imageAlt: clean(record.imageAlt),
    badge: clean(record.badge ?? record.featuredTag),
    features: features.map(clean).filter(Boolean),
    price: clean(record.price ?? record.livePrice),
    popularity: Number(record.popularity) || 99,
    filters: normalizeFilters(record.filterTitle ?? record.filters ?? filterColumns(record)),
  };
}

/**
 * The product records of a JSON answer: a list, { products | items | data }, a DA sheet, or
 * every sheet of a DA workbook (each product once).
 */
export function productRecords(json) {
  if (!json) return [];
  if (json[':type'] === 'multi-sheet') {
    const seen = new Set();
    return (json[':names'] || Object.keys(json).filter((key) => !key.startsWith(':')))
      .filter((name) => !['filters', 'ranges', 'brands', 'settings'].includes(name))
      .flatMap((name) => json[name]?.data || [])
      .filter((record) => {
        const id = clean(record.code ?? record.productCode) || clean(record.url ?? record.pageUrl);
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
  }
  return [json, json.products, json.items, json.data].find(Array.isArray) || [];
}

/** The products of a JSON answer, normalized; ones without a name or link are left out. */
export const productsOf = (json) => productRecords(json).map(normalizeProduct)
  .filter((product) => product.name && product.url);

/** A sheet of a DA workbook (or the `name` list of an object), as rows. */
export const sheetRows = (json, name) => {
  const value = json && !Array.isArray(json) ? json[name] : null;
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.data) ? value.data : [];
};

/** Filter groups from the products' own filter values, in order of first appearance. */
export function filterGroupsFromProducts(products) {
  const groups = new Map();
  products.forEach((product) => Object.entries(product.filters).forEach(([key, values]) => {
    if (!groups.has(key)) groups.set(key, { key, values: [] });
    const group = groups.get(key);
    values.forEach((value) => { if (!group.values.includes(value)) group.values.push(value); });
  }));
  return [...groups.values()];
}
