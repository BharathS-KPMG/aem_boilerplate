/*
 * Product feed for the cards-popular block: the JSON fallback when the block has no authored
 * tiles. It uses the products-listing loader (blocks/products-listing/product-data.js), so a page
 * whose listing reads the same file makes one request for both.
 *
 * Its URL is the block's `Data` row, else the page metadata `product-feed`, else the site's
 * workbook /eds/products.json. The popular products are the rows with a `popular` rank (1, 2, …),
 * in rank order, from:
 *   - a `popular` (or `cards-popular`) tab of a workbook, else all its products;
 *   - a sheet ({ data: [{ code, name, url, image, popular, … }] }), e.g. a range's data file with
 *     a `popular` column;
 *   - the Asian Paints listing JSON itself (a list of { productCode, productName, pageUrl,
 *     productPackshotImage, … }), e.g. from a future AEM API: then the optional metadata
 *     `product-feed-popular` lists the popular product codes in order.
 * Returns null (no tiles) when there is no feed, it fails or it has no popular product.
 */
import { getMetadata } from '../../scripts/aem.js';
import { loadJson, productRecords } from '../products-listing/product-data.js';

const SITE = 'https://www.asianpaints.com';
const DATA = '/eds/products.json';
const POPULAR_SHEETS = ['popular', 'cards-popular'];

function normalize(record, popularCodes) {
  const code = record.code ?? record.productCode ?? '';
  let popular = Number(record.popular) || 0;
  if (!popular && popularCodes.length) popular = popularCodes.indexOf(code) + 1;
  const image = record.image ?? record.productPackshotImage ?? '';
  return {
    code,
    name: String(record.name ?? record.productName ?? '').trim(),
    url: record.url ?? record.pageUrl ?? '',
    image: image ? new URL(image, SITE).href : '',
    popular,
  };
}

// a workbook's popular tab, else every product of the answer
function records(json) {
  if (json?.[':type'] === 'multi-sheet') {
    const sheet = POPULAR_SHEETS.find((name) => Array.isArray(json[name]?.data));
    if (sheet) return json[sheet].data;
  }
  return productRecords(json);
}

/**
 * The popular products of a feed, in rank order
 * @param {string} [url] The block's Data row
 * @returns {Promise<object[]|null>}
 */
export default async function loadProductFeed(url) {
  const source = url || getMetadata('product-feed') || DATA;
  const popularCodes = getMetadata('product-feed-popular').split(',')
    .map((code) => code.trim()).filter(Boolean);
  const popular = records(await loadJson(source))
    .map((record) => normalize(record, popularCodes))
    .filter((product) => product.popular && product.name && product.url)
    .sort((a, b) => a.popular - b.popular);
  return popular.length ? popular : null;
}
