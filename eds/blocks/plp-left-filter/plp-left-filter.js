import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import { pushAdobeCalculatorEvents, pushAdobeProductTitleClick, pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';
import initWishlist from '../../scripts/wishlist.js';

/*
 * PLP Left Filter: the product listing of Asian Paints waterproofing pages (the source's
 * `waterproofingproductslisting`, e.g. https://www.asianpaints.com/waterproofing-products/interiors.html):
 * a left filter panel (a FILTER button and drop-down panel on phones), optional pills of the
 * selected filters (the Pills setting), the product grid and the price disclaimer.
 *
 * Authoring (block table), each part under its heading row, all parts optional:
 *   | PLP Left Filter |                       |                       |
 *   | Setting         | Value                 |                       |
 *   | Data            | /d-testing/data/….json  (fallback products, filter groups, settings)
 *   | Products API    | https://…/products.json (future AEM JSON, tried first)
 *   | Filter label    | FILTER                …  (see SETTINGS)
 *   | Filter group    | Label                 | Values                |
 *   | problem         | Problem               | repair, dampness, …   |
 *   | Code | Name | Image | URL | Features | Price | Filters | Description | Brand |
 *   | 6878 | Putty Boost | (image) | https://… | (list) | 176.00 | problem: repair | … | SmartCare |
 *   | Promo desktop image | (image) |   … Promo mobile image, Promo image alt, Promo link,
 *   | Promo desktop position | 22 |     Promo mobile position (see README.md)
 *
 * Products and filter groups come from the Products API if it answers, else from the block
 * table, else from the Data file. The API may answer in the source AEM component's shape
 * (productName, productCode, filterTitle, visibleTags, livePrice, …) or in the Data file's
 * columns, with its filter groups under `filters` or else taken from its products' filters.
 *
 * Filters work as on the source: every selected value narrows the list, values no remaining
 * product has are disabled, phones apply with Apply. The selection is kept in the address in
 * the source's format (?f=encodeURIComponent("problem:repair,dampness_&_price:economy")), so
 * existing links keep working. The block adds the products' ItemList structured data.
 */
const ANALYTICS_OVERRIDES = [
  {
    match: 'waterproofing-budget-calculator',
    btnTitle: 'Calculate now',
    parentTitle: 'Waterproofing Budget Calculator',
  },
];
const SITE = 'https://www.asianpaints.com';
const IMAGE_HOST = 'https://static.asianpaints.com';
const DESKTOP = '(width >= 992px)';
const URL_GROUPS = '_&_';

const SETTINGS = {
  data: ['data', 'data file', 'json'],
  api: ['products api', 'api', 'aem json'],
  filterLabel: ['filter label'],
  clearLabel: ['clear label', 'clear all label'],
  applyLabel: ['apply label'],
  priceLabel: ['price label'],
  currency: ['currency'],
  priceNote: ['price note'],
  disclaimer: ['disclaimer'],
  listLabel: ['list label', 'list heading'],
  emptyMessage: ['empty message'],
  errorMessage: ['error message'],
  wishlist: ['wishlist'],
  // "Show selected filters on desktop / on mobile" (the earlier "Pills" / "Pills mobile" too)
  pills: ['show selected filters on desktop', 'selected filters on desktop', 'pills on desktop', 'pills desktop', 'pills'],
  pillsMobile: ['show selected filters on mobile', 'selected filters on mobile', 'pills on mobile', 'pills mobile', 'mobile pills'],
  imageHost: ['image host'],
};

const DEFAULTS = {
  data: '',
  api: '',
  filterLabel: 'FILTER',
  clearLabel: 'Clear All',
  applyLabel: 'Apply',
  priceLabel: 'MRP',
  currency: '₹',
  priceNote: '(Inclusive of all taxes) per L',
  disclaimer: '',
  // the listing's title; none: no heading, and the list is named "Products" for screen readers
  listLabel: '',
  emptyMessage: 'No products match the selected filters.',
  errorMessage: 'Products could not be loaded. Please try again later.',
  wishlist: 'true',
  // the selected filters as removable pills, set apart for desktop (from 992px) and mobile
  // (below it): shown on desktop, not on mobile, unless the table says otherwise
  pills: 'yes',
  pillsMobile: 'no',
  imageHost: IMAGE_HOST,
};

// heading labels of the table's filter-group and product columns
const GROUP_COLUMNS = {
  key: ['filter group', 'group', 'key'],
  label: ['label', 'title'],
  values: ['values', 'options'],
};
const PRODUCT_COLUMNS = {
  code: ['code', 'sku', 'product code'],
  name: ['name', 'product name'],
  title: ['title', 'tagline'],
  description: ['description'],
  features: ['features', 'key features'],
  price: ['price', 'mrp'],
  url: ['url', 'link', 'page url'],
  image: ['image', 'pack shot', 'packshot'],
  imageAlt: ['image alt', 'alt', 'alt text'],
  filters: ['filters', 'filter'],
  brand: ['brand'],
};

// labels of the promo's rows (label | value)
const PROMO_FIELDS = {
  desktopImage: ['promo desktop image', 'desktop promo image'],
  mobileImage: ['promo mobile image', 'mobile promo image'],
  alt: ['promo image alt', 'promo alt'],
  link: ['promo link'],
  desktopPosition: ['promo desktop position', 'desktop promo position'],
  mobilePosition: ['promo mobile position', 'mobile promo position'],
};

const key = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
// non-breaking spaces are kept (a name can hold words together, as on the source)
const clean = (value) => String(value ?? '').replace(/[^\S\u00a0]+/g, ' ').trim();
const lower = (value) => clean(value).toLowerCase();
const same = (a, b) => lower(a) === lower(b);
const columnOf = (columns, label) => Object.keys(columns)
  .find((field) => columns[field].some((name) => key(name) === key(label)));

let instances = 0;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([name, value]) => {
    if (value === undefined || value === null || value === false) return;
    if (name === 'className') node.className = value;
    else node.setAttribute(name, value === true ? '' : value);
  });
  node.append(...children.flat().filter((child) => child !== undefined && child !== null && child !== ''));
  return node;
}

/* ---------- data ---------- */

/** "problem: repair, dampness | price: economy" (or an AEM filterTitle object) → filters */
function parseFilters(source) {
  const filters = {};
  const add = (group, values) => {
    const name = clean(group);
    const list = values.map(clean).filter(Boolean);
    if (name && list.length) filters[name] = [...new Set([...(filters[name] || []), ...list])];
  };
  if (source && typeof source === 'object') {
    Object.entries(source).forEach(([group, values]) => add(group, [].concat(values)));
    return filters;
  }
  String(source ?? '').split(/[|\n]/).forEach((pair) => {
    const at = pair.indexOf(':');
    if (at > 0) add(pair.slice(0, at), pair.slice(at + 1).split(','));
  });
  return filters;
}

const list = (value) => (Array.isArray(value) ? value : String(value ?? '').split('|')).map(clean).filter(Boolean);

/** one product from a table row, a data-file row or an AEM product */
function normalize(row, imageHost) {
  const aem = 'productName' in row || 'productCode' in row;
  const image = aem ? (row.packShotImageInfo?.src || row.productPackshotImage) : row.image;
  const product = {
    code: clean(aem ? row.productCode : row.code),
    name: clean(aem ? row.productName : row.name),
    title: clean(aem ? row.productTitle : row.title),
    description: clean(aem ? row.shortDescription : row.description),
    features: aem ? list(row.visibleTags) : list(row.features),
    price: clean(aem ? row.livePrice : row.price),
    url: clean(aem ? (row.seoPdpPageUrl || row.pageUrl) : row.url),
    image: clean(image),
    imageAlt: clean(aem ? [].concat(row.packShotImageInfo?.altText || '')[0] : row.imageAlt),
    brand: clean(aem ? row.brandName : row.brand),
    filters: parseFilters(aem ? row.filterTitle : row.filters),
  };
  // AEM DAM paths are served from the image host
  if (product.image.startsWith('/content/dam/')) product.image = `${imageHost}${product.image}`;
  return product;
}

/** the product rows of a JSON answer: AEM list, { products: [...] }, a DA sheet or multi-sheet */
function jsonProducts(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.products)) return json.products;
  if (Array.isArray(json.products?.data)) return json.products.data;
  if (Array.isArray(json.items)) return json.items;
  if (Array.isArray(json.data)) return json.data;
  return [];
}

const sheet = (json, name) => (Array.isArray(json?.[name]?.data) ? json[name].data : []);

async function loadJson(url) {
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok ? await response.json() : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- block table ---------- */

const cellText = (cell) => clean(cell?.textContent);
const cellLink = (cell) => cell?.querySelector('a')?.getAttribute('href') || cellText(cell);
const cellList = (cell) => {
  if (!cell) return [];
  const items = [...cell.querySelectorAll('li')];
  if (items.length) return items.map((li) => clean(li.textContent)).filter(Boolean);
  const paras = [...cell.querySelectorAll('p')];
  if (paras.length > 1) return paras.map((p) => clean(p.textContent)).filter(Boolean);
  return list(cell.textContent);
};
const cellImage = (cell) => {
  const img = cell?.querySelector('img');
  return { src: img?.getAttribute('src') || cellLink(cell), alt: clean(img?.getAttribute('alt')) };
};

/**
 * the promo from its cells. A position is the tile's place in the grid (1-based); none (or
 * "end"): after the products. A view without its own image has no tile.
 */
function readPromo(cells, row) {
  const imageOf = (cell) => (cell?.querySelector('img') ? cellImage(cell) : { src: '', alt: '' });
  const desktopImage = imageOf(cells.desktopImage);
  const mobileImage = imageOf(cells.mobileImage);
  const place = (cell) => Math.max(0, Number.parseInt(cellText(cell), 10) || 0);
  const desktopPosition = place(cells.desktopPosition);
  return {
    desktop: desktopImage.src,
    mobile: mobileImage.src,
    alt: cellText(cells.alt) || desktopImage.alt || mobileImage.alt,
    url: cellLink(cells.link),
    desktopPosition,
    mobilePosition: cellText(cells.mobilePosition) ? place(cells.mobilePosition) : desktopPosition,
    row,
  };
}

/** the settings, filter groups, products and promo authored in the block table */
function readTable(block) {
  const table = {
    settings: [], groups: [], products: [], promo: null,
  };
  let mode = 'settings';
  let columns = [];
  // the promo's labelled rows (Promo desktop image | …), in any part of the table
  const promoCells = {};
  let promoRow = null;
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const labels = cells.map((cell) => key(cell.textContent));
    const [first] = labels;

    const promoField = columnOf(PROMO_FIELDS, cellText(cells[0]));
    if (promoField) {
      [, promoCells[promoField]] = cells;
      promoRow = promoRow || row;
      return;
    }

    // heading rows
    if (first === 'setting' || first === 'settings') {
      mode = 'settings';
      return;
    }
    if (columnOf(GROUP_COLUMNS, cellText(cells[0])) === 'key' && labels.includes('values')) {
      mode = 'groups';
      columns = cells.map((cell) => columnOf(GROUP_COLUMNS, cellText(cell)));
      return;
    }
    const productFields = cells.map((cell) => columnOf(PRODUCT_COLUMNS, cellText(cell)));
    if (productFields.includes('name') && (productFields.includes('price') || productFields.includes('url'))) {
      mode = 'products';
      columns = productFields;
      return;
    }

    // the one-row form: Promo | desktop image | mobile image | link | desktop position |
    // mobile position
    if (first === 'promo') {
      table.promo = readPromo({
        desktopImage: cells[1],
        mobileImage: cells[2],
        link: cells[3],
        desktopPosition: cells[4],
        mobilePosition: cells[5],
      }, row);
      return;
    }

    const cell = (field) => cells[columns.indexOf(field)];
    if (mode === 'groups') {
      const groupKey = cellText(cell('key'));
      if (!groupKey) return;
      table.groups.push({
        key: groupKey,
        label: cellText(cell('label')) || groupKey,
        values: cellList(cell('values')).flatMap((value) => value.split(',')).map(clean).filter(Boolean),
        row,
      });
    } else if (mode === 'products') {
      const image = cellImage(cell('image'));
      const product = normalize({
        code: cellText(cell('code')),
        name: cellText(cell('name')),
        title: cellText(cell('title')),
        description: cellText(cell('description')),
        features: cellList(cell('features')),
        price: cellText(cell('price')),
        url: cellLink(cell('url')),
        image: image.src,
        imageAlt: cellText(cell('imageAlt')) || image.alt,
        filters: cellList(cell('filters')).join('|'),
        brand: cellText(cell('brand')),
      }, IMAGE_HOST);
      product.row = row;
      if (product.name) table.products.push(product);
    } else if (cells.length >= 2 && first) {
      table.settings.push([cellText(cells[0]), cells[1]]);
    }
  });
  if (!table.promo && (promoCells.desktopImage || promoCells.mobileImage)) {
    table.promo = readPromo(promoCells, promoRow);
  }
  return table;
}

/** settings: the block table's, else the data file's settings sheet, else the defaults */
function readSettings(table, json) {
  const settings = { ...DEFAULTS };
  const field = (name) => Object.keys(SETTINGS)
    .find((f) => SETTINGS[f].some((n) => key(n) === key(name)));
  sheet(json, 'settings').forEach((row) => {
    const name = field(row.key);
    if (name && clean(row.value)) settings[name] = clean(row.value);
  });
  table.settings.forEach(([label, cell]) => {
    const name = field(label);
    // the data file and API cells may hold a link
    const value = name === 'data' || name === 'api' ? cellLink(cell) : cellText(cell);
    if (name && value) settings[name] = value;
  });
  return settings;
}

/**
 * the filter groups of a JSON answer (API or data file), under `filters`:
 * a list of { group, label, values } (values a list or comma separated), a sheet of such rows,
 * or an object { group: [values] }
 */
function jsonGroups(json) {
  const source = json && !Array.isArray(json) ? json.filters : null;
  if (!source) return [];
  let rows = Array.isArray(source) ? source : source.data;
  if (!Array.isArray(rows)) {
    rows = Object.entries(source).map(([group, values]) => ({ group, values }));
  }
  return rows.map((row) => {
    const name = clean(row.group || row.key || row.name);
    const values = Array.isArray(row.values ?? row.options)
      ? row.values ?? row.options
      : String(row.values ?? row.options ?? '').split(',');
    return {
      key: name,
      label: clean(row.label || row.title) || name,
      values: values.map(clean).filter(Boolean),
    };
  }).filter((group) => group.key && group.values.length);
}

/**
 * filter groups, in the products' order of sources: products from the API take its groups
 * (else the API products' own filters); otherwise the block table's, else the data file's;
 * last, the products' own filters
 */
function readGroups({
  table, api, json, products, fromApi,
}) {
  let listed = jsonGroups(api);
  if (!fromApi) listed = table.groups.length ? table.groups : jsonGroups(json);
  if (listed.length) return listed;
  const derived = new Map();
  products.forEach((product) => Object.entries(product.filters).forEach(([group, values]) => {
    const entry = derived.get(lower(group)) || { key: group, label: group, values: [] };
    values.forEach((value) => {
      if (!entry.values.some((v) => same(v, value))) entry.values.push(value);
    });
    derived.set(lower(group), entry);
  }));
  return [...derived.values()];
}

/* ---------- images ---------- */

/** a product image: this site's media optimized, other images (AEM DAM) as they are */
// a card's pack shot is at most 80px wide (160px at 2x)
const CARD_IMAGE = { breakpoints: [{ width: '160' }], width: 80, height: 96 };

function productImage(src, alt, eager, { breakpoints, width, height } = CARD_IMAGE) {
  if (!src) return null;
  let url;
  try {
    url = new URL(src, window.location.href);
  } catch (e) {
    return null;
  }
  if (url.origin === window.location.origin || /\.aem\.(page|live)$/.test(url.hostname)) {
    const picture = createOptimizedPicture(url.pathname, alt, eager, breakpoints);
    const img = picture.querySelector('img');
    if (width) img.width = width;
    if (height) img.height = height;
    return picture;
  }
  return el('img', {
    src: url.href, alt, width, height, loading: eager ? 'eager' : 'lazy', decoding: 'async',
  });
}

/* ---------- address (?f=) in the source's format ---------- */

const decode = (text) => {
  try {
    return decodeURIComponent(text);
  } catch (e) {
    return text;
  }
};

/** ?f=problem%3Adampness%2Crepair_%26_price%3Aeconomy → [['problem', ['dampness', 'repair']], …] */
function readAddress() {
  const match = window.location.search.match(/[?&]f=([^&#]*)/);
  if (!match) return [];
  let value = decode(match[1].replace(/\+/g, ' '));
  if (/%[0-9a-f]{2}/i.test(value)) value = decode(value);
  return value.split(URL_GROUPS).map((pair) => {
    const at = pair.indexOf(':');
    return at > 0 ? [clean(pair.slice(0, at)), pair.slice(at + 1).split(',').map((v) => clean(decode(v))).filter(Boolean)] : null;
  }).filter((pair) => pair && pair[1].length);
}

function writeAddress(groups, selection) {
  const params = new URLSearchParams(window.location.search);
  params.delete('f');
  const value = groups
    .filter((group) => selection.get(group.key)?.size)
    .map((group) => `${group.key}:${[...selection.get(group.key)].join(',')}`)
    .join(URL_GROUPS);
  const query = [params.toString(), value ? `f=${encodeURIComponent(value)}` : ''].filter(Boolean).join('&');
  const href = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  if (href !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.pushState({ plpLeftFilter: value }, '', href);
  }
}

/* ---------- rendering ---------- */

function card(product, settings, id, index) {
  const nameId = `${id}-product-${index}`;
  const alt = product.imageAlt && /\s/.test(product.imageAlt) ? product.imageAlt : product.name;
  const price = product.price ? el(
    'p',
    { className: 'plp-left-filter-card-price' },
    el(
      'span',
      { className: 'plp-left-filter-card-amount' },
      `${settings.priceLabel} `,
      el('span', { className: 'plp-left-filter-card-currency' }, settings.currency),
      el('span', { className: 'plp-left-filter-card-value' }, product.price),
    ),
    el(
      'span',
      { className: 'plp-left-filter-card-note' },
      settings.priceNote,
      el('span', { className: 'plp-left-filter-card-star', 'aria-hidden': 'true' }, '*'),
    ),
  ) : el('p', { className: 'plp-left-filter-card-price' });
  const item = el(
    'li',
    { className: 'plp-left-filter-card', 'data-code': product.code },
    el(
      'a',
      { className: 'plp-left-filter-card-link', href: product.url || undefined, 'aria-labelledby': nameId },
      el('span', { className: 'plp-left-filter-card-media' }, productImage(product.image, alt, index < 4)),
      el('h3', { className: 'plp-left-filter-card-name', id: nameId }, product.name),
      el('ul', { className: 'plp-left-filter-card-features' }, product.features.map((feature) => el('li', {}, feature))),
      price,
    ),
  );
  // the heart, with the source's attributes (see scripts/wishlist.js); a product needs a code (SKU)
  if (lower(settings.wishlist) !== 'false' && product.code) {
    item.prepend(el('button', {
      type: 'button',
      className: 'plp-left-filter-wishlist',
      'aria-pressed': 'false',
      'aria-label': `Wishlist: ${product.name}`,
      'data-attr-sku': product.code,
      'data-pid': product.code,
      'data-attr-action': 'like',
      'data-attr-type': 'products',
      'data-attr-title': product.name,
      'data-attr-price': product.price || undefined,
    }));
  }
  if (product.row) moveInstrumentation(product.row, item);
  return item;
}

/**
 * the promo tiles, as the source's banner: one with the desktop image (shown from 992px) and
 * one with the mobile image (shown below), each placed at its own position in the grid
 */
function promoCards(promo) {
  const tile = (src, view) => {
    // a banner, not a pack shot: sized for its tile (up to the row's width, at 2x), not 160px
    const picture = productImage(src, promo.alt, false, {
      breakpoints: view === 'desktop'
        ? [{ media: '(min-width: 600px)', width: '2000' }, { width: '750' }]
        : [{ width: '750' }],
    });
    if (!picture) return null;
    // the image keeps its own proportions; the size attributes of a card image do not apply
    const img = picture.tagName === 'IMG' ? picture : picture.querySelector('img');
    img.removeAttribute('width');
    img.removeAttribute('height');
    const content = promo.url && !/^javascript:/i.test(promo.url)
      ? el('a', { className: 'plp-left-filter-promo-link', href: promo.url }, picture)
      : el('div', { className: 'plp-left-filter-promo-link' }, picture);
    return el('li', { className: `plp-left-filter-promo plp-left-filter-promo-${view}` }, content);
  };
  const desktop = tile(promo.desktop, 'desktop');
  const mobile = tile(promo.mobile, 'mobile');
  moveInstrumentation(promo.row, desktop || mobile);
  // each tile only when its own image is authored; desktop: the tile covers the rest of its
  // row (place 22 = 3 columns, 23 = 2); phones: one
  return [
    desktop && {
      item: desktop, position: promo.desktopPosition, columns: 4, fillRow: true,
    },
    mobile && {
      item: mobile, position: promo.mobilePosition, columns: 2, fillRow: false,
    },
  ].filter(Boolean);
}

function addStructuredData(products, id) {
  // product pages are the source site's; images may be this site's media
  const absolute = (href) => new URL(href, SITE).href;
  const imageUrl = (href) => new URL(href, window.location.href).href;
  const script = el('script', { type: 'application/ld+json', 'data-source': id });
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: document.title,
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Product',
        name: product.name,
        url: product.url ? absolute(product.url) : undefined,
        image: product.image ? imageUrl(product.image) : undefined,
        description: product.description || product.title || undefined,
        sku: product.code || undefined,
        brand: { '@type': 'Brand', name: product.brand || 'Asian Paints' },
        offers: product.price ? {
          '@type': 'Offer', price: product.price, priceCurrency: 'INR', availability: 'https://schema.org/InStock', url: product.url ? absolute(product.url) : undefined,
        } : undefined,
      },
    })),
  });
  document.head.append(script);
}

export default async function decorate(block) {
  instances += 1;
  const id = `plp-left-filter-${instances}`;
  const table = readTable(block);
  let settings = readSettings(table, null);

  // the listing's title (the List label), above the white box as the source's; it also names
  // the product list
  const heading = el('h2', { className: 'plp-left-filter-heading', id: `${id}-heading` });
  let grid;
  const showTitle = () => {
    if (!settings.listLabel) return;
    heading.textContent = settings.listLabel;
    if (!heading.isConnected) block.before(heading);
    grid?.removeAttribute('aria-label');
    grid?.setAttribute('aria-labelledby', heading.id);
  };

  // the layout first, its space reserved, while any data loads
  const toggle = el(
    'button',
    {
      type: 'button', className: 'plp-left-filter-toggle', 'aria-expanded': 'false', 'aria-controls': `${id}-panel`,
    },
    el('span', {}, settings.filterLabel),
    el('span', { className: 'plp-left-filter-toggle-icon', 'aria-hidden': 'true' }),
  );
  const title = el('p', { className: 'plp-left-filter-title', id: `${id}-title` }, settings.filterLabel);
  const clearTop = el('button', { type: 'button', className: 'plp-left-filter-clear-top' }, settings.clearLabel);
  const groupsWrap = el('div', { className: 'plp-left-filter-groups', role: 'group', 'aria-labelledby': `${id}-title` });
  const apply = el('button', { type: 'button', className: 'plp-left-filter-apply' }, settings.applyLabel);
  const reset = el('button', { type: 'button', className: 'plp-left-filter-reset' }, settings.clearLabel);
  const panel = el(
    'div',
    { className: 'plp-left-filter-panel', id: `${id}-panel` },
    groupsWrap,
    el('div', { className: 'plp-left-filter-actions' }, apply, reset),
  );
  const status = el('p', { className: 'plp-left-filter-status', role: 'status' });
  grid = el('ul', { className: 'plp-left-filter-grid', 'aria-label': 'Products', 'aria-busy': 'true' });
  showTitle();
  const empty = el(
    'div',
    { className: 'plp-left-filter-empty', hidden: true },
    el('p'),
    el('button', { type: 'button', className: 'plp-left-filter-empty-clear' }, settings.clearLabel),
  );
  const pills = el('ul', { className: 'plp-left-filter-pills', 'aria-label': 'Selected filters', hidden: true });
  const results = el('div', { className: 'plp-left-filter-results', tabindex: '-1' }, status, pills, grid, empty);
  block.replaceChildren(
    el('div', { className: 'plp-left-filter-aside' }, el('div', { className: 'plp-left-filter-bar' }, title, toggle, clearTop), panel),
    results,
  );

  // products and their filter groups: the AEM API first, else the block table, else the data file
  let products = [];
  const api = settings.api ? await loadJson(settings.api) : null;
  if (api) products = jsonProducts(api).map((row) => normalize(row, settings.imageHost));
  const fromApi = products.length > 0;
  if (!fromApi) products = table.products;
  const needData = settings.data && (!products.length || (!fromApi && !table.groups.length));
  const json = needData ? await loadJson(settings.data) : null;
  if (json) {
    settings = readSettings(table, json);
    // a title from the data file's settings sheet
    showTitle();
  }
  if (!products.length) {
    products = jsonProducts(json).map((row) => normalize(row, settings.imageHost));
  }
  products = products.filter((product) => product.name);

  grid.removeAttribute('aria-busy');
  if (!products.length) {
    empty.querySelector('p').textContent = settings.errorMessage;
    empty.querySelector('button').remove();
    empty.hidden = false;
    block.classList.add('is-error');
    return;
  }
  empty.querySelector('p').textContent = settings.emptyMessage;

  const groups = readGroups({
    table, api, json, products, fromApi,
  });
  const has = (product, group, value) => (Object.entries(product.filters)
    .find(([name]) => same(name, group))?.[1] || []).some((v) => same(v, value));

  // the filter groups: a heading button opening its list of checkboxes
  const desktop = window.matchMedia(DESKTOP);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const groupNodes = groups.map((group, g) => {
    const listId = `${id}-group-${g}`;
    const button = el(
      'button',
      {
        type: 'button', className: 'plp-left-filter-group-toggle', 'aria-expanded': 'true', 'aria-controls': listId,
      },
      el('span', {}, group.label),
      el('span', { className: 'plp-left-filter-group-arrow', 'aria-hidden': 'true' }),
    );
    const options = el('ul', { className: 'plp-left-filter-options', id: listId, 'aria-label': group.label }, group.values.map((value) => el(
      'li',
      {},
      el(
        'label',
        { className: 'plp-left-filter-option' },
        el('input', {
          type: 'checkbox', value, 'data-group': group.key,
        }),
        el('span', { className: 'plp-left-filter-box', 'aria-hidden': 'true' }),
        el('span', { className: 'plp-left-filter-option-name' }, value),
      ),
    )));
    const node = el('div', { className: 'plp-left-filter-group' }, el('h3', { className: 'plp-left-filter-group-heading' }, button), options);
    if (group.row) moveInstrumentation(group.row, node);
    return node;
  });
  groupsWrap.append(...groupNodes);
  const inputs = [...groupsWrap.querySelectorAll('input')];

  const cards = products.map((product, i) => card(product, settings, id, i));
  grid.append(...cards);
  if (lower(settings.wishlist) !== 'false') initWishlist(grid);
  // each promo tile becomes that place in the grid (before that product); none, after the last
  const promos = table.promo ? promoCards(table.promo) : [];
  promos.forEach((promo) => {
    // a place past the last product: in the row after the last product, a desktop tile keeps
    // its column (that row's earlier places stay empty); further on, the end
    if (promo.position > cards.length) {
      const row = (place) => Math.ceil(place / promo.columns);
      const lastRow = promo.fillRow && row(promo.position) === row(cards.length + 1);
      promo.start = lastRow ? ((promo.position - 1) % promo.columns) + 1 : 0;
      promo.position = 0;
    }
    grid.insertBefore(promo.item, cards[promo.position - 1] || null);
  });
  addStructuredData(products, id);

  if (settings.disclaimer) {
    results.append(el(
      'p',
      { className: 'plp-left-filter-disclaimer' },
      el('span', { className: 'plp-left-filter-disclaimer-star', 'aria-hidden': 'true' }, '*'),
      settings.disclaimer.replace(/^\*\s*/, ''),
    ));
  }

  /* ---------- state ---------- */

  // applied: what filters the grid and the address; on phones the panel edits a pending copy
  let applied = new Map();
  // phones: whether a value was checked or unchecked since the panel opened
  let changed = false;
  const copy = (selection) => new Map([...selection].map(([g, values]) => [g, new Set(values)]));
  const count = (selection) => [...selection.values()]
    .reduce((sum, values) => sum + values.size, 0);
  const matches = (product, selection) => [...selection].every(([group, values]) => [...values]
    .every((value) => has(product, group, value)));
  const groupOf = (name) => groups
    .find((group) => same(group.key, name) || same(group.label, name));
  const fromAddress = () => {
    const selection = new Map();
    readAddress().forEach(([name, values]) => values.forEach((value) => {
      // a value of a known group, else the group that offers it (as the source matches values)
      const group = [groupOf(name), ...groups].find((g) => g?.values.some((v) => same(v, value)));
      if (!group) return;
      const authored = group.values.find((v) => same(v, value));
      if (!selection.has(group.key)) selection.set(group.key, new Set());
      selection.get(group.key).add(authored);
    }));
    return selection;
  };

  const syncInputs = (selection) => {
    const remaining = products.filter((product) => matches(product, selection));
    inputs.forEach((input) => {
      const checked = !!selection.get(input.dataset.group)?.has(input.value);
      input.checked = checked;
      // as on the source, a value no remaining product has cannot be picked
      input.disabled = !checked
        && !remaining.some((product) => has(product, input.dataset.group, input.value));
      input.closest('.plp-left-filter-option').classList.toggle('is-disabled', input.disabled);
    });
    // as on the source: Clear All needs a checked value; Apply needs one, or a change since
    // the panel opened (so unchecking everything can still be applied)
    reset.disabled = count(selection) === 0;
    apply.disabled = !changed && count(selection) === 0;
  };

  // the selected filters as pills, each view set on its own: "Show selected filters on desktop"
  // (from 992px, default yes) and "Show selected filters on mobile" (below 992px, default no)
  const yes = (value) => ['true', 'yes', 'y', 'on', 'show', 'all', 'desktop'].includes(lower(value));
  const pillsView = () => ({
    desktopPills: yes(settings.pills),
    mobilePills: yes(settings.pillsMobile),
  });
  const renderPills = () => {
    const { desktopPills, mobilePills } = pillsView();
    block.classList.toggle('pills-no-mobile', !mobilePills);
    block.classList.toggle('pills-no-desktop', !desktopPills);
    const selected = desktopPills || mobilePills
      ? groups.flatMap((group) => [...(applied.get(group.key) || [])]
        .map((value) => [group, value]))
      : [];
    const items = selected.map(([group, value]) => el(
      'li',
      {},
      el(
        'button',
        {
          type: 'button', className: 'plp-left-filter-pill', 'data-group': group.key, 'data-value': value, 'aria-label': `Remove filter ${value}`,
        },
        el('span', {}, value),
        el('span', { className: 'plp-left-filter-pill-icon', 'aria-hidden': 'true' }),
      ),
    ));
    pills.replaceChildren(...items);
    pills.hidden = items.length === 0;
  };

  const render = () => {
    let shown = 0;
    products.forEach((product, i) => {
      const visible = matches(product, applied);
      cards[i].hidden = !visible;
      if (visible) shown += 1;
    });
    promos.forEach(({
      item, position, columns, fillRow, start,
    }) => {
      // hidden while filtered. At the end it fills the rest of the last row; placed, the
      // desktop tile fills the rest of its own row (the cards after it start the next row)
      // and the mobile tile is one card wide
      item.hidden = count(applied) > 0;
      let span = columns - (shown % columns);
      if (position) span = fillRow ? columns - ((position - 1) % columns) : 1;
      if (start) span = columns - start + 1;
      item.style.setProperty('--plf-promo-span', String(span));
      if (start) item.style.setProperty('--plf-promo-start', String(start));
      // a tile alone in its row takes its image's height (no card beside it to give one)
      item.classList.toggle('is-full-row', span === columns);
    });
    empty.hidden = shown > 0;
    status.textContent = `Showing ${shown} of ${products.length} products`;
    clearTop.disabled = count(applied) === 0;
    renderPills();
    syncInputs(applied);
  };

  const commit = (selection, { address = true, track = true } = {}) => {
    applied = copy(selection);
    if (address) writeAddress(groups, applied);
    render();
    if (track && count(applied)) {
      const filter = groups.filter((group) => applied.get(group.key)?.size)
        .map((group) => `${group.key}:${[...applied.get(group.key)].join(',')}`).join('|');
      pushAdobeCalculatorEvents({ event: 'filter_click', filter });
    }
  };

  // the panel's current selection (phones: pending until Apply)
  const panelSelection = () => {
    const selection = new Map();
    inputs.filter((input) => input.checked).forEach((input) => {
      if (!selection.has(input.dataset.group)) selection.set(input.dataset.group, new Set());
      selection.get(input.dataset.group).add(input.value);
    });
    return selection;
  };

  /* ---------- panel (phones) and groups ---------- */

  // a group's values open / close as the source's slideDown / slideUp: the height eases (jQuery's
  // "swing", 0.5 - cos(πt) / 2) over `duration` ms; no animation without one, or for reduced motion
  const setGroup = (node, open, duration = 0) => {
    node.querySelector('.plp-left-filter-group-toggle').setAttribute('aria-expanded', String(open));
    const values = node.querySelector('.plp-left-filter-options');
    const from = values.hidden ? 0 : values.offsetHeight;
    values.getAnimations().forEach((animation) => animation.cancel());
    values.hidden = false;
    const to = open ? values.scrollHeight : 0;
    if (!duration || reducedMotion.matches || from === to) {
      values.hidden = !open;
      return;
    }
    values.style.overflow = 'hidden';
    const animation = values.animate(
      { height: [`${from}px`, `${to}px`] },
      { duration, easing: 'cubic-bezier(0.37, 0, 0.63, 1)' },
    );
    animation.onfinish = () => {
      values.style.overflow = '';
      values.hidden = !open;
    };
    animation.oncancel = () => { values.style.overflow = ''; };
  };
  const setPanel = (open, { restore = true } = {}) => {
    toggle.setAttribute('aria-expanded', String(open));
    block.classList.toggle('is-open', open);
    // each opening starts with no change made
    changed = false;
    if (open || restore) syncInputs(open ? panelSelection() : applied);
    // phones close the panel with its groups closed; desktop keeps every group open
    if (!open && !desktop.matches) groupNodes.forEach((node) => setGroup(node, false));
  };
  const layout = () => {
    // desktop: every group open, the panel always shown; phones: closed groups in a closed panel
    groupNodes.forEach((node) => setGroup(node, desktop.matches));
    setPanel(false);
  };

  toggle.addEventListener('click', () => setPanel(toggle.getAttribute('aria-expanded') !== 'true'));
  groupsWrap.addEventListener('click', (event) => {
    const button = event.target.closest('.plp-left-filter-group-toggle');
    if (!button) return;
    const node = button.closest('.plp-left-filter-group');
    const open = button.getAttribute('aria-expanded') !== 'true';
    // phones keep one group open at a time, as on the source (the others close in its default
    // 400ms); the clicked group opens or closes in its 500ms
    if (open && !desktop.matches) {
      groupNodes.forEach((other) => other !== node && setGroup(other, false, 400));
    }
    setGroup(node, open, 500);
  });
  groupsWrap.addEventListener('change', () => {
    changed = true;
    if (desktop.matches) commit(panelSelection());
    else syncInputs(panelSelection());
  });
  apply.addEventListener('click', () => {
    commit(panelSelection());
    setPanel(false, { restore: false });
    toggle.focus();
  });
  const clearAll = () => {
    commit(new Map(), { track: false });
    if (!desktop.matches) setPanel(false, { restore: false });
  };
  reset.addEventListener('click', () => {
    clearAll();
    toggle.focus();
  });
  clearTop.addEventListener('click', clearAll);
  empty.querySelector('button')?.addEventListener('click', clearAll);
  block.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && block.classList.contains('is-open')) {
      setPanel(false);
      toggle.focus();
    }
  });
  // a pill removes its value; focus stays on the pills, or moves to the results when the last
  // one is gone
  pills.addEventListener('click', (event) => {
    const pill = event.target.closest('.plp-left-filter-pill');
    if (!pill) return;
    const next = copy(applied);
    next.get(pill.dataset.group)?.delete(pill.dataset.value);
    const index = [...pills.querySelectorAll('.plp-left-filter-pill')].indexOf(pill);
    commit(next);
    const remaining = pills.querySelectorAll('.plp-left-filter-pill');
    (remaining[Math.min(index, remaining.length - 1)] || results).focus();
  });

  /* ---------- cards ---------- */

  grid.addEventListener('click', (event) => {
    const link = event.target.closest('.plp-left-filter-card-link');
    if (!link) return;
    const item = link.closest('.plp-left-filter-card');
    const productName = item.querySelector('.plp-left-filter-card-name')?.textContent.trim() || '';
    pushAdobeProductTitleClick({
      event: 'product_tile_click', productName, productSku: item.dataset.code || '', destinationUrl: link.href,
    });
  });

  grid.addEventListener('click', (event) => {
    const promoLink = event.target.closest('.plp-left-filter-promo-link');
    if (!promoLink?.href) return;

    const img = promoLink.querySelector('img');

    const override = ANALYTICS_OVERRIDES.find((o) => promoLink.href.includes(o.match));

    const cta = override ? override.btnTitle : 'Calculate Now';

    const parentTitle = override
      ? override.parentTitle
      : (img?.alt?.trim() || '');

    pushAdobeCtaClickEvent({
      event: 'custom_cta_click',
      cta,
      parentTitle,
      destinationUrl: promoLink.href,
    });
  });

  // the selection of the address (links, back / forward)
  window.addEventListener('popstate', () => commit(fromAddress(), { address: false, track: false }));
  desktop.addEventListener('change', layout);
  layout();
  commit(fromAddress(), { address: false, track: false });
}
