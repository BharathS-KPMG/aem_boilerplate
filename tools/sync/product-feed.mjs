/* eslint-env node */
/* eslint-disable no-console */
/*
 * Product feed sync (run by .github/workflows/product-feed.yml every 30 minutes).
 *
 * The Asian Paints listing pages render their products on the server (from Hybris) and embed
 * them as JSON in `#paints-listing[data-attr-alldata]`; the popular products are a curated list
 * of product codes (`.interiorpopularproducts [data-attr-sku]`). The EDS site cannot read them in
 * the browser (the source only allows www.asianpaints.com), so this script copies them into
 * same-origin JSON the blocks render from: one Document Authoring workbook, /data/products.json
 * (with --da: written to DA, then previewed and published, so it is served from the EDS CDN like
 * any page), with one tab per block, named after it:
 *
 *   - cards-nilaya: a tab per range and block option (cards-nilaya, cards-royale, …), read with
 *     /data/products.json?sheet=cards-<range>
 *   - cards-popular: the listing's products with their popular rank (column `popular`), read
 *     with /data/products.json?sheet=cards-popular
 *
 * It uses the EDS sheet shapes ({ data: [...], ":type": "sheet" } and its multi-sheet form), so
 * an Asian Paints API can replace it later without changing the blocks.
 *
 * Usage: node tools/sync/product-feed.mjs [--check] [--da] [--out=<dir>]
 *   --check     exit 1 if a feed would change (nothing is written)
 *   --da        write, preview and publish the cards-nilaya workbook in DA (see DA_* below)
 *   --out=<dir> also write the cards-nilaya workbook to <dir> (for review)
 * DA settings (environment):
 *   DA_ORG, DA_REPO   the DA content source / EDS site (default sachingulshette / ap-eds-repo)
 *   DA_BRANCH         the branch to preview/publish on (default main)
 *   DA_TOKEN          an Adobe IMS access token with write access to the DA org and the site's
 *                     admin API; or, for a scheduled job (user tokens expire in 24 hours), a
 *                     technical account: IMS_CLIENT_ID, IMS_CLIENT_SECRET, IMS_SCOPES
 * A feed or workbook is written only when its products change; on any source error the last good
 * one is kept and the script exits non-zero.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';

const SITE = 'https://www.asianpaints.com';
// the listing page the workbook is built from: its ranges -> tabs cards-<range>, its products and
// popular list -> tab cards-popular of the DA workbook /data/products.json
const SOURCES = [
  { page: `${SITE}/paint-products/interior-wall-paints/plain-finishes.html` },
];
const MIN_PRODUCTS = 5; // a much smaller list means the source markup changed; keep the old feed
const WORKBOOK = '/data/products.json';
// the tabs in the order of the source page's sections (other ranges follow)
const TAB_ORDER = ['nilaya', 'royale', 'apcolite', 'tractor'];
const tabName = (range) => `cards-${range}`;
const POPULAR_TAB = 'cards-popular';
// the source's filter groups, in its panel order (unknown groups go last)
const FILTER_ORDER = ['filter-range', 'filter-sheen', 'filter-properties', 'filter-BRAND'];

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const TO_DA = args.includes('--da');
const OUT = args.find((arg) => arg.startsWith('--out='))?.slice('--out='.length);
const DA = {
  org: process.env.DA_ORG || 'sachingulshette',
  repo: process.env.DA_REPO || 'ap-eds-repo',
  branch: process.env.DA_BRANCH || 'main',
};

const unescape = (value) => value
  .replace(/&#(\d+);/g, (m, code) => String.fromCharCode(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (m, code) => String.fromCharCode(parseInt(code, 16)))
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');

const absolute = (url) => (url ? new URL(url, `${SITE}/`).href
  .replace('//static.asianpaints.com/', '//www.asianpaints.com/') : '');

// as toClassName in scripts/aem.js: "Royale" -> "royale", the block option and sheet name
const toClassName = (name) => String(name || '').toLowerCase().replace(/[^0-9a-z]/gi, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

function extractProducts(html) {
  const match = html.match(/id="paints-listing"[^>]*data-attr-alldata="([^"]*)"/)
    || html.match(/data-attr-alldata="([^"]*)"/);
  if (!match) throw new Error('product JSON (data-attr-alldata) not found');
  const products = JSON.parse(unescape(match[1]));
  if (!Array.isArray(products)) throw new Error('product JSON is not a list');
  return products;
}

function extractPopular(html) {
  const start = html.indexOf('interiorpopularproducts');
  if (start < 0) return [];
  const end = html.indexOf('</section>', start) > 0 ? html.indexOf('</section>', start) : start + 20000;
  const codes = [...html.slice(start, end).matchAll(/data-attr-sku="([^"]+)"/g)].map((m) => m[1]);
  return [...new Set(codes)];
}

// the fields both feeds share
function baseRow(product) {
  return {
    code: product.productCode || '',
    name: (product.productName || '').trim(),
    brand: product.brandName || '',
    category: product.category || '',
    subCategory: product.subCategory || '',
    url: product.pageUrl || product.seoPdpPageUrl || '',
    image: absolute(product.productPackshotImage || product.packShotImageInfo?.src),
    badge: product.featuredTag || '',
    features: (product.visibleTags || []).map((tag) => tag.trim()).filter(Boolean).join(' | '),
    price: product.livePrice || '',
    popularity: String(product.popularity || ''),
  };
}

// cards-popular feed row
function toRow(product, popular) {
  const range = (product.invisibleTag || [])
    .map((tag) => tag.match(/products\/range\/([\w-]+)/)?.[1])
    .find(Boolean) || '';
  const rank = popular.indexOf(product.productCode);
  const {
    code, name, brand, ...rest
  } = baseRow(product);
  return {
    code, name, brand, range, ...rest, popular: rank >= 0 ? String(rank + 1) : '',
  };
}

// cards-nilaya sheet row: the base fields plus one `filter-<group>` column per filter group
// (comma-separated values), as product-filters filters on them
function toListingRow(product) {
  const row = baseRow(product);
  Object.entries(product.filterTitle || {}).forEach(([group, values]) => {
    const list = (Array.isArray(values) ? values : String(values).split(','))
      .map((value) => String(value).trim()).filter(Boolean);
    row[`filter-${group}`] = list.join(', ');
  });
  return row;
}

const sheet = (rows) => ({
  total: rows.length, offset: 0, limit: rows.length, data: rows, ':type': 'sheet',
});

async function readSource({ page }) {
  const response = await fetch(page, { headers: { 'user-agent': 'Mozilla/5.0 (EDS product feed sync)' } });
  if (!response.ok) throw new Error(`${page}: HTTP ${response.status}`);
  const html = await response.text();
  const products = extractProducts(html)
    .filter((product) => product.productCode && product.productName
      && (product.pageUrl || product.seoPdpPageUrl));
  if (products.length < MIN_PRODUCTS) throw new Error(`${page}: only ${products.length} products found`);
  return { products, popular: extractPopular(html) };
}

// cards-popular tab: every product with its popular rank
function buildPopularTab({ products, popular }) {
  const rows = products.map((product) => toRow(product, popular));
  rows.sort((a, b) => a.brand.localeCompare(b.brand)
    || Number(a.popularity || 99) - Number(b.popularity || 99)
    || a.name.localeCompare(b.name));
  return sheet(rows);
}

// one tab per range (brand), in the source order (popularity), then cards-popular; every row of
// a tab has every column
function buildWorkbook(data) {
  const { products } = data;
  const byRange = new Map();
  products.forEach((product) => {
    const range = toClassName(product.brandName);
    if (!range) return;
    if (!byRange.has(range)) byRange.set(range, []);
    byRange.get(range).push(toListingRow(product));
  });
  const tabs = [...byRange].map(([range, rows]) => {
    const keys = [...new Set(rows.flatMap(Object.keys))];
    const filterColumns = keys.filter((key) => key.startsWith('filter-'))
      .sort((a, b) => FILTER_ORDER.indexOf(a) - FILTER_ORDER.indexOf(b));
    const columns = [...keys.filter((key) => !key.startsWith('filter-')), ...filterColumns];
    const filled = rows
      .sort((a, b) => Number(a.popularity || 99) - Number(b.popularity || 99)
        || a.name.localeCompare(b.name))
      .map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? ''])));
    return [range, sheet(filled)];
  }).sort(([a], [b]) => (TAB_ORDER.indexOf(a) + 1 || 99) - (TAB_ORDER.indexOf(b) + 1 || 99));
  // a workbook tab is a sheet without its own :type
  const asTab = ({ ':type': type, ...rest }) => rest;
  const workbook = { ':names': [], ':version': 3, ':type': 'multi-sheet' };
  [...tabs.map(([range, tab]) => [tabName(range), tab]), [POPULAR_TAB, buildPopularTab(data)]]
    .forEach(([name, tab]) => {
      workbook[name] = asTab(tab);
      workbook[':names'].push(name);
    });
  return workbook;
}

/* ---------- Document Authoring ---------- */

let token;
async function accessToken() {
  if (token) return token;
  if (process.env.DA_TOKEN) {
    token = process.env.DA_TOKEN;
  } else if (process.env.IMS_CLIENT_ID && process.env.IMS_CLIENT_SECRET) {
    const response = await fetch('https://ims-na1.adobelogin.com/ims/token/v3', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.IMS_CLIENT_ID,
        client_secret: process.env.IMS_CLIENT_SECRET,
        scope: process.env.IMS_SCOPES || 'AdobeID,openid,aem.frontend.all,read_organizations',
      }),
    });
    if (!response.ok) throw new Error(`IMS token: HTTP ${response.status}`);
    token = (await response.json()).access_token;
  }
  return token;
}

async function authHeaders() {
  const value = await accessToken();
  return value ? { authorization: `Bearer ${value}` } : {};
}

// the workbook as published, to skip an unchanged one
async function publishedJson(path) {
  const url = `https://${DA.branch}--${DA.repo}--${DA.org}.aem.live${path}`;
  const response = await fetch(`${url}?nocache=${Date.now()}`);
  return response.ok ? response.json() : null;
}

async function writeToDa(path, json) {
  const headers = await authHeaders();
  const body = new FormData();
  body.append('data', new Blob([JSON.stringify(json)], { type: 'application/json' }), path.split('/').pop());
  const source = await fetch(`https://admin.da.live/source/${DA.org}/${DA.repo}${path}`, { method: 'POST', headers, body });
  if (!source.ok) throw new Error(`DA upload ${path}: HTTP ${source.status}`);
  // eslint-disable-next-line no-restricted-syntax
  for (const action of ['preview', 'live']) {
    // eslint-disable-next-line no-await-in-loop
    const response = await fetch(`https://admin.hlx.page/${action}/${DA.org}/${DA.repo}/${DA.branch}${path}`, { method: 'POST', headers });
    if (!response.ok) throw new Error(`${action} ${path}: HTTP ${response.status}`);
  }
}

const summary = (workbook) => workbook[':names'].map((name) => `${name} ${workbook[name].total}`).join(', ');

async function syncWorkbook(workbook) {
  if (OUT) {
    const file = resolve(join(OUT, WORKBOOK));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(workbook, null, 2)}\n`);
  }
  if (!TO_DA && !CHECK) {
    console.log(`built: ${WORKBOOK} (${summary(workbook)})`);
    return 0;
  }
  const current = await publishedJson(WORKBOOK);
  const same = current?.[':type'] === 'multi-sheet'
    && JSON.stringify(current[':names']) === JSON.stringify(workbook[':names'])
    && workbook[':names'].every((name) => JSON.stringify(current[name]?.data) === JSON.stringify(workbook[name].data));
  if (same) {
    console.log(`unchanged: ${WORKBOOK} (${summary(workbook)})`);
    return 0;
  }
  if (TO_DA && !CHECK) {
    await writeToDa(WORKBOOK, workbook);
    console.log(`published: ${WORKBOOK} (${summary(workbook)}) to ${DA.org}/${DA.repo}`);
  } else {
    console.log(`would update: ${WORKBOOK} (${summary(workbook)})`);
  }
  return 1;
}

async function main() {
  let changed = 0;
  let failed = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const source of SOURCES) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const data = await readSource(source);
      // eslint-disable-next-line no-await-in-loop
      changed += await syncWorkbook(buildWorkbook(data));
    } catch (error) {
      failed += 1;
      console.error(`kept the last feed for ${source.page}: ${error.message}`);
    }
  }
  if (failed || (CHECK && changed)) process.exitCode = 1;
}

main();
