/*
 * Wallpaper Collection
 * A product listing of wallpapers (the source's `.wallpaper-collection` on
 * /wall-coverings/wallpaper-for-walls):
 *   - a filter panel: Colours (links to each colour's listing page, drawn as radio options), then
 *     filter groups (design style, colour collection, collection, country of origin). Values
 *     combine with OR inside a group and AND across groups; values no wallpaper would match are
 *     greyed out. Applied values show as removable pills and are kept in the address
 *     (?f=collection:replay,medley&design style:floral), as on the source.
 *   - optional Room type options (Room Type 1 / 2 / 3), which switch every card's photo
 *   - sort (popularity, latest, price high to low, low to high), a grid of wallpaper cards (photo,
 *     wishlist heart, name, MRP and offer price, up to three shade dots that switch the photo,
 *     "+more", Add to cart, which becomes a − 1 + quantity stepper), and Load more (100 at a time;
 *     on mobile every card shows at once, as on the source).
 * On mobile the filters open in a full-screen panel and apply with Apply.
 *
 * Authoring (2 columns; rows recognised by their first cell):
 *   | Colour    | colour name | that colour's listing page (path or link)      |
 *     (or, in two columns, the name linked to the page)
 *   | Room type | label (one row per room type, in order: 1, 2, 3; optional)  |
 *   | Load more | 100                                                         |
 *   | Add to cart | Show (default) or Hide: the Add to cart button on every card   |
 *   | Filter label, Sort label, Clear all label, Apply label, Colours label, Load more label,
 *     Add to cart label | the text of "Filter by", "Sort by :", "Clear all", "Apply" (mobile), the
 *     Colours group, "Load more" and Add to cart (optional; else the listing API's, else these) |
 *   | Listing API | path or link of the Asian Paints listing API (optional; no default)  |
 *   | Sheet path  | path or link of the fallback DA sheet (no default)                   |
 *   | Add to cart API | the add-to-cart URL, with {quantity}, {sku} and {timestamp}        |
 *   | Mini cart API   | the mini cart URL (the visitor's cart: entries, totalItems)        |
 *   | Cart entry API  | the cart entry URL, with {entry} (and {quantity} for a new quantity) |
 *
 * Data comes from the listing API first, when the page gives one (the Listing API row, or the page
 * metadata wallpaper-collection-api; e.g. /apcolourcatalogue/wallpaperlisting.json?path=<listing
 * page>, the source's own data), and from the DA sheet when there is none, or the API can't be
 * read, fails, answers no wallpapers or takes longer than 8 seconds. The API is called only where
 * the browser lets the page read it: on the API's own domain, or on a site listed in the page (or
 * bulk) metadata wallpaper-collection-api-hosts (comma-separated host names, or * for every site;
 * the sites the API's CORS rules allow, e.g. main--edspoc-stg--aemedsap.aem.live). Elsewhere it
 * isn't called and the sheet is read at once. An API path (/apcolourcatalogue/...) gets the Asian
 * Paints domain as on the stage site: the page's own on asianpaints.com, else www on prod and beta
 * on every other host; a full URL is used as is. The sheet comes from the Sheet path row (or
 * Data, or the page metadata wallpaper-collection-sheet), e.g. /eds/wallpapers.json; the code
 * has no path of its own. With neither an API nor a sheet the block shows nothing.
 *
 * The site's mini cart switch: when the nav's section metadata has hide-mini-cart-header = true
 * (the header then shows no mini cart), the block shows no Add to cart either, whatever its Add to
 * cart row says; with false or no value, the row decides (Show by default).
 *
 * Cart: with the three cart APIs authored (rows above, or the page metadata
 * wallpaper-collection-cart-api / -minicart-api / -cart-entry-api) and callable from the page (the
 * listing API's rule), Add to cart adds the shade on show to the visitor's Asian Paints cart (GET
 * the add-to-cart URL, quantity 1), as the live listing does: a success or the API's error shows
 * under the button, then the mini cart is read again for the quantities and the header's cart
 * badge. + adds one more the same way; - sets the entry's quantity (PUT) or removes it at 1
 * (DELETE), as the header's mini cart does. The mini cart is also read once the page is idle, so
 * wallpapers already in the cart show their quantity. Without the APIs the cart is kept on the
 * page only. Either way each change is sent as the wallpaper-collection:cart event.
 *
 * Hearts: the site's shared wishlist, scripts/wishlist.js (as the stage site's catalogue-listing):
 * hearts made by its wishlistHeart (type "wallpapers", the code of the shade on show), set up by
 * its initWishlist. It saves the signed-in visitor's wishlist (keycloak/profile.wishlist.json)
 * and opens the header's login when signed out; its paths are set in that file. On a site without
 * that file, the hearts only toggle on the page.
 * Of the listing API's answer only
 * these are used: listingJson (the wallpapers, All) and parentfilterJson (the filter groups);
 * collectionSecTitle / collectionSecDesc (the heading, when the section has none authored);
 * filterText, applyText, clearText, sortText (labels); sortByListOrder / sortByOrder (the sort
 * options, the first one the default); colourFilterSectionTitle and colourFilters (the Colours
 * group, when no Colour rows are authored); roomTypeFilterTitle and roomTypeOne/Two/ThreeLabel
 * (the Room type group, when no Room type rows are authored); targetNewTab (cards open in a new
 * tab); listType (what the items are called); count, noResultsView, emptySearchImage and
 * emptySearchDescription (the empty listing).
 *
 * The sheet (kept up to date by hand in DA), published so it is served from the EDS CDN: tab
 * wallpaper-collection, one row
 * per wallpaper (code, name, url, popularity, latest, tag, stock, in-stock, mrp, price, discount,
 * shades, shade-<n>-code / -hex / -image / -room-2 / -room-3, filter-<group>); tab
 * wallpaper-collection-filters, one row per filter group (group, options). Either source may also
 * answer { filters: [{ name, options }], products: [...] } in the source's own format.
 *
 * Photos are Asian Paints DAM renditions (cross-origin), so they are built as a <picture> here
 * rather than with createOptimizedPicture, which only serves the site's own media.
 */
import { getMetadata } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import { BETA_DOMAIN, PROD_DOMAIN, isProdDomain } from '../../scripts/environment.js';
import { pushAdobeCalculatorEvents, pushAdobeProductTitleClick, pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';

// the hearts' wishlist type, as on the source
const WISHLIST_TYPE = 'wallpapers';
// the Asian Paints services' site for authored paths, as on the stage site (environment.js)
const SERVICE_SITE = `https://${isProdDomain() ? PROD_DOMAIN : BETA_DOMAIN}`;
// the listing API takes ~4s; after this the sheet is used instead
const API_TIMEOUT = 8000;
const WALLPAPERS_TAB = 'wallpaper-collection';
const FILTERS_TAB = 'wallpaper-collection-filters';
const MOBILE = window.matchMedia('(max-width: 991px)');
const PAGE_SIZE = 100;
const EAGER = 3;
// cards built per batch
const BATCH = 24;
const SHADES = 3;
const MAX_QUANTITY = 99;
// how long the "added to cart" message shows, as on the source
const CART_MESSAGE_TIME = 5000;
const SORTS = [
  ['POPULARITY', 'Popularity'],
  ['LATEST', 'Latest'],
  ['PRICE-HIGH TO LOW', 'Price-High to Low'],
  ['PRICE-LOW TO HIGH', 'Price-Low to High'],
];

// the label rows (first cell, any case) and the setting each one sets
const LABEL_ROWS = [
  [/^filter( by)? (label|text|title)$/, 'filter'],
  [/^sort( by)? (label|text|title)$/, 'sort'],
  [/^clear( all)? (label|text|title)$/, 'clear'],
  [/^apply (label|text|title)$/, 'apply'],
  [/^load more (label|text|title)$/, 'loadMore'],
  [/^colou?rs? (label|text|title)$/, 'colours'],
  [/^add to cart (label|text|title)$/, 'cart'],
];

// links and DAM images go to the Asian Paints site: www, or beta on pages served from beta
// (domains from scripts/environment.js)
const SITE_DOMAIN = window.location.hostname === BETA_DOMAIN ? BETA_DOMAIN : PROD_DOMAIN;
const ASIAN_PAINTS_HOSTS = [PROD_DOMAIN, BETA_DOMAIN, 'asianpaints.com'];

let instances = 0;

/**
 * Whether the site hides its mini cart: hide-mini-cart-header = true in the nav's section metadata,
 * read as the header reads it (the nav page from the page's nav metadata, else /nav). The
 * .plain.html carries it as a data-hide-mini-cart-header attribute (or a section-metadata row).
 * Read from the text, since the site's Trusted Types rule forbids parsing HTML strings. Shown
 * (false) when the nav can't be read, as the header then shows nothing.
 */
async function miniCartHidden() {
  try {
    const nav = getMetadata('nav');
    const navPath = nav ? new URL(nav, window.location).pathname : '/nav';
    const response = await fetch(`${navPath}.plain.html`);
    if (!response.ok) return false;
    const html = await response.text();
    const value = html.match(/data-hide-mini-cart-header\s*=\s*"([^"]*)"/i)?.[1]
      ?? html.match(/>\s*(?:<p>)?\s*hide-mini-cart-header\s*(?:<\/p>)?\s*<\/div>\s*<div>\s*(?:<p>)?\s*([^<]*)/i)?.[1];
    return String(value ?? '').trim().toLowerCase() === 'true';
  } catch (e) {
    return false;
  }
}

/**
 * The site's shared wishlist (scripts/wishlist.js on the stage site): { heart, init }, or null
 * where the site has none.
 */
function loadWishlist() {
  // on the stage site only (not in this repo): elsewhere the import fails and null is returned
  // eslint-disable-next-line import/no-unresolved
  return import('../../scripts/wishlist.js')
    .then(({ default: initWishlist, wishlistHeart }) => (
      typeof initWishlist === 'function' && typeof wishlistHeart === 'function'
        ? { heart: wishlistHeart, init: (root) => initWishlist(root) } : null))
    .catch(() => null);
}

/** A heart with the attributes the shared wishlist reads, for a site without it. */
function pageHeart({
  code, type, name, price, className,
}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-label', `Wishlist: ${name || code}`);
  button.dataset.attrSku = String(code);
  button.dataset.pid = String(code);
  button.dataset.attrAction = 'like';
  button.dataset.attrType = type;
  if (name) button.dataset.attrTitle = name;
  if (price) button.dataset.attrPrice = price;
  return button;
}

/** Without the shared wishlist: the hearts toggle on the page only (nothing is saved). */
function pageWishlist(root) {
  const liked = new Set();
  const refresh = () => root.querySelectorAll('[data-attr-sku][data-attr-type]').forEach((heart) => {
    const on = liked.has(`${heart.dataset.attrType}:${heart.dataset.attrSku}`);
    heart.setAttribute('aria-pressed', String(on));
    heart.dataset.attrAction = on ? 'dislike' : 'like';
  });
  root.addEventListener('click', (event) => {
    const heart = event.target.closest('[data-attr-sku][data-attr-type]');
    if (!heart || !root.contains(heart)) return;
    event.preventDefault();
    const key = `${heart.dataset.attrType}:${heart.dataset.attrSku}`;
    if (liked.has(key)) liked.delete(key);
    else liked.add(key);
    refresh();
  });
  refresh();
  return { refresh };
}

/** Opens the link in a new tab (the API's targetNewTab), and says so to screen readers. */
function newTab(a) {
  a.target = '_blank';
  a.rel = 'noopener';
  const name = a.getAttribute('aria-label');
  if (name) {
    a.setAttribute('aria-label', `${name} (opens in a new tab)`);
    return;
  }
  const note = document.createElement('span');
  note.className = 'wallpaper-collection-sr-only';
  note.textContent = ' (opens in a new tab)';
  a.append(note);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/**
 * An Asian Paints URL on the site's domain: site-relative paths (also DAM paths) and
 * www/beta.asianpaints.com links get it, with the .html the site uses for pages.
 * @param {string} href As authored or from the API
 * @param {string} [resolved] The browser-resolved link, used for links to other sites
 */
function siteUrl(href, resolved = href) {
  const relative = href.startsWith('/') && !href.startsWith('//');
  let url;
  try {
    url = new URL(relative ? href : resolved, `https://${SITE_DOMAIN}`);
  } catch (e) {
    return resolved;
  }
  if (!relative && !ASIAN_PAINTS_HOSTS.includes(url.hostname)) return resolved;
  url.protocol = 'https:';
  url.hostname = SITE_DOMAIN;
  if (url.pathname !== '/' && !/\.[a-z0-9]+$/i.test(url.pathname)) {
    url.pathname = `${url.pathname.replace(/\/$/, '')}.html`;
  }
  return url.href;
}

const linkUrl = (a) => siteUrl(a.getAttribute('href') || '', a.href);
const pagePath = (href) => {
  try {
    return new URL(href, window.location.href).pathname.replace(/\.html$/, '').replace(/\/$/, '');
  } catch (e) {
    return '';
  }
};

const extension = (src) => (String(src).match(/\.([a-z0-9]+)$/i)?.[1] || 'png').toLowerCase();

// a DAM rendition, as the source requests it (square transform, cropped by CSS)
const rendition = (src, size) => (
  `${siteUrl(src)}.transform/cc-width-${size}-height-${size}/image.${extension(src)}`);

/** Reads the authored rows into the block's settings. */
function readConfig(block) {
  const config = {
    colours: [],
    rooms: [],
    pageSize: PAGE_SIZE,
    api: '',
    sheet: '',
    cart: true,
    cartApi: '',
    miniCartApi: '',
    cartEntryApi: '',
    labels: {},
  };
  [...block.children].forEach((row) => {
    const [keyCell, valueCell, pageCell] = row.children;
    const key = keyCell?.textContent.trim().toLowerCase() || '';
    const value = valueCell?.textContent.trim() || '';
    const link = row.querySelector('a[href]');
    const labelRow = LABEL_ROWS.find(([pattern]) => pattern.test(key.replace(/\s+/g, ' ')));
    if (labelRow) {
      if (value) config.labels[labelRow[1]] = value;
    } else if (key.startsWith('colour') || key.startsWith('color')) {
      const pageLink = pageCell?.querySelector('a[href]');
      const page = pageLink ? pageLink.getAttribute('href') : pageCell?.textContent.trim();
      if (page) {
        // three columns: the name, then the page (a path or a link)
        config.colours.push({
          row, label: value, href: pageLink ? linkUrl(pageLink) : siteUrl(page),
        });
      } else if (link) {
        config.colours.push({ row, label: link.textContent.trim() || value, href: linkUrl(link) });
      }
    } else if (key.startsWith('room')) {
      if (value) config.rooms.push({ row, label: value });
    } else if (key.startsWith('load')) {
      config.pageSize = Number.parseInt(value, 10) || PAGE_SIZE;
    } else if (key === 'api' || key.replace(/\s+/g, ' ') === 'listing api') {
      // a link's href as authored (a path stays a path)
      config.api = link?.getAttribute('href') || value;
    } else if (/^(sheet( path)?|fallback sheet|data)$/.test(key.replace(/\s+/g, ' '))) {
      config.sheet = link?.getAttribute('href') || value;
    } else if (/^(add to cart|cart) api$/.test(key.replace(/\s+/g, ' '))) {
      config.cartApi = link?.getAttribute('href') || value;
    } else if (/^mini ?cart api$/.test(key.replace(/\s+/g, ' '))) {
      config.miniCartApi = link?.getAttribute('href') || value;
    } else if (/^cart entry api$/.test(key.replace(/\s+/g, ' '))) {
      config.cartEntryApi = link?.getAttribute('href') || value;
    } else if (key.replace(/\s+/g, ' ') === 'add to cart' || key === 'cart') {
      // Show (the default) or Hide, for every card
      config.cart = !/^(hide|hidden|no|false|off|0)$/i.test(value);
    }
  });
  return config;
}

const cellValues = (cell) => String(cell || '').split(',').map((value) => value.trim()).filter(Boolean);

/** A workbook row as a wallpaper (what the cards render). */
function wallpaperFromRow(row) {
  const filters = {};
  Object.entries(row).forEach(([key, cell]) => {
    const list = cellValues(cell);
    if (key.startsWith('filter-') && list.length) filters[key.slice('filter-'.length)] = list;
  });
  const shades = Array.from({ length: SHADES }, (_, i) => i + 1).map((n) => ({
    code: row[`shade-${n}-code`],
    hex: row[`shade-${n}-hex`],
    images: { 1: row[`shade-${n}-image`], 2: row[`shade-${n}-room-2`], 3: row[`shade-${n}-room-3`] },
  })).filter((shade) => shade.images[1]);
  return {
    code: row.code,
    name: row.name,
    url: row.url,
    popularity: row.popularity,
    latest: row.latest,
    tag: row.tag || row.stock || '',
    inStock: String(row['in-stock'] ?? '').trim() !== '0',
    mrp: row.mrp,
    price: row.price,
    discount: row.discount,
    filters,
    shadeCount: Number(row.shades) || shades.length,
    shades,
  };
}

/** A wallpaper in the source's own format (an API answering like the source page's data). */
function wallpaperFromSource(item) {
  const at = (list, i) => list?.[i]?.src || '';
  const count = Math.max(item.hexCodeList?.length || 0, item.swatchImageInfoList?.length || 0, 1);
  return {
    code: item.entityCode,
    name: item.entityName,
    url: item.pageUrl,
    popularity: item.popularity,
    latest: item.latest,
    tag: item.featureTag || item.stockLabel || '',
    inStock: String(item.stockNumber ?? '') !== '0',
    mrp: item.mrp,
    price: item.sellingPrice,
    discount: item.discount,
    filters: item.filterTitle || {},
    shadeCount: count,
    shades: Array.from({ length: Math.min(count, SHADES) }, (_, i) => ({
      code: item.entityCodeList?.[i] || item.entityCode,
      hex: item.hexCodeList?.[i] || '',
      images: {
        1: at(item.swatchImageInfoList, i) || (i ? '' : item.swatchImageInfo?.src),
        2: at(item.roomTypeTwoImageInfoList, i),
        3: at(item.roomTypeThreeImageInfoList, i),
      },
    })).filter((shade) => shade.images[1]),
  };
}

// the API's labels are in capitals (FILTER BY); the CSS sets the case, so screen readers get words
const labelText = (value) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text === text.toUpperCase() ? text.charAt(0) + text.slice(1).toLowerCase() : text;
};

// text only: the API's descriptions are HTML (<p>NOT FOUND!</p>), never inserted as markup
const plainText = (html) => (typeof html === 'string'
  ? html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '');

/** The listing settings from the API's answer (the fields listed at the top of this file). */
function apiSettings(json) {
  const colourPage = (colour) => colour?.linkModel?.url
    || String(colour?.colourFamilyPagePath || '').replace(/^\/content\/ap\/en\/home/, '');
  const text = (value) => (typeof value === 'string' ? value.trim() : '');
  return {
    title: text(json.collectionSecTitle),
    description: plainText(json.collectionSecDesc),
    filterText: labelText(json.filterText),
    applyText: labelText(json.applyText),
    clearText: labelText(json.clearText),
    sortText: labelText(json.sortText),
    sorts: [json.sortByListOrder, json.sortByOrder]
      .find((order) => Array.isArray(order) && order.length) || [],
    coloursTitle: labelText(json.colourFilterSectionTitle),
    colours: (Array.isArray(json.colourFilters) ? json.colourFilters : [])
      .map((colour) => ({ label: text(colour?.colourFamilyTitle), href: colourPage(colour) }))
      .filter((colour) => colour.label && colour.href)
      .map((colour) => ({ ...colour, href: siteUrl(colour.href) })),
    roomsTitle: labelText(json.roomTypeFilterTitle),
    rooms: [json.roomTypeOneLabel, json.roomTypeTwoLabel, json.roomTypeThreeLabel]
      .map((value, i) => ({ label: text(value), type: String(i + 1) }))
      .filter((room) => room.label),
    newTab: json.targetNewTab === true,
    noun: text(json.listType).toLowerCase(),
    noResults: json.noResultsView === true || json.count === 0,
    empty: {
      image: text(json.emptySearchImage),
      description: plainText(json.emptySearchDescription),
    },
  };
}

/**
 * The wallpaper data: the DA workbook (multi-sheet, or one sheet of wallpapers whose filter groups
 * then follow the filter-<group> columns), or an API answering in the source's format.
 */
function normalizeData(json) {
  let data = null;
  if (typeof json?.listingJson === 'string') {
    // the Asian Paints listing API: the live page's own data, as JSON strings
    const all = (field) => {
      try {
        return JSON.parse(json[field] || '{}').All;
      } catch (e) {
        return null;
      }
    };
    const settings = apiSettings(json);
    // an empty listing is an answer too: show it rather than the workbook
    if (settings.noResults) return { filters: [], products: [], settings };
    const list = all('listingJson');
    if (Array.isArray(list)) {
      data = {
        filters: Object.values(all('parentfilterJson') || {})
          .map((group) => ({ name: group?.name, options: group?.filterButtonList || [] })),
        products: list.map(wallpaperFromSource),
        settings,
      };
    }
  } else if (Array.isArray(json?.products)) {
    data = { filters: json.filters || [], products: json.products.map(wallpaperFromSource) };
  } else {
    const rows = json?.[':type'] === 'multi-sheet' ? json[WALLPAPERS_TAB]?.data : json?.data;
    if (Array.isArray(rows)) {
      data = {
        filters: (json[FILTERS_TAB]?.data || [])
          .map((row) => ({ name: row.group, options: cellValues(row.options) })),
        products: rows.filter((row) => row.code && row.name).map(wallpaperFromRow),
      };
    }
  }
  if (!data?.products.length) return null;
  // every value a wallpaper has shows in its group, as on the source (the groups listed first,
  // then any other group the wallpapers use)
  const groups = new Map(data.filters.filter((group) => group.name)
    .map((group) => [group.name, new Set(group.options)]));
  data.products.forEach((product) => Object.entries(product.filters).forEach(([group, list]) => {
    if (!groups.has(group)) groups.set(group, new Set());
    list.forEach((value) => groups.get(group).add(value));
  }));
  data.filters = [...groups].map(([name, set]) => ({ name, options: [...set] }));
  return data;
}

/** The data at url, or null (an error, no wallpapers, or no answer within timeout ms). */
async function loadData(url, timeout) {
  if (!url) return null;
  const controller = new AbortController();
  const timer = timeout ? setTimeout(() => controller.abort(), timeout) : null;
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return normalizeData(await response.json());
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** An Asian Paints service URL: a path on the site's own domain, else on SERVICE_SITE. */
function serviceUrl(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return value;
  const host = window.location.hostname.toLowerCase();
  const own = host === 'asianpaints.com' || host.endsWith('.asianpaints.com');
  return `${own ? window.location.origin : SERVICE_SITE}${value}`;
}

/**
 * Whether this page may call the service: on its own domain, or on a site listed in the page
 * metadata wallpaper-collection-api-hosts (the sites its CORS rules allow; * for every site).
 */
function canCall(url) {
  let api;
  try {
    api = new URL(url, window.location.href);
  } catch (e) {
    return false;
  }
  const { hostname } = window.location;
  const extra = getMetadata('wallpaper-collection-api-hosts').split(',').map((h) => h.trim()).filter(Boolean);
  return api.hostname === hostname || extra.includes('*') || extra.includes(hostname);
}

/** A URL template with its {placeholders} filled in (values URL-encoded). */
function fillUrl(template, values) {
  return Object.entries(values).reduce(
    (url, [name, value]) => url.split(`{${name}}`).join(encodeURIComponent(value)),
    template,
  );
}

/** The URL with a fresh _=<timestamp>, as the source sends its cart calls (no cache). */
function withTimestamp(url) {
  if (url.includes('{timestamp}')) return fillUrl(url, { timestamp: Date.now() });
  return `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`;
}

/** The error the cart API gave, as the source shows it (short messages only). */
function cartError(json, fallback) {
  const message = json?.errors?.[0]?.message || json?.statusMessage || json?.message || json?.desc;
  return typeof message === 'string' && message && message.length <= 50 ? message : fallback;
}

/** Filter selection <-> ?f=collection:replay,medley&design style:floral (the source's format) */
function readSelection() {
  const selection = new Map();
  const param = new URLSearchParams(window.location.search).get('f');
  (param || '').split('&').forEach((part) => {
    const [group, values] = part.split(':');
    if (!group || !values) return;
    const set = new Set(values.split(',').map((value) => {
      try {
        return decodeURIComponent(value);
      } catch (e) {
        return value;
      }
    }).filter(Boolean));
    if (set.size) selection.set(group, set);
  });
  return selection;
}

function writeSelection(selection) {
  const value = [...selection].filter(([, values]) => values.size)
    .map(([group, values]) => `${group}:${[...values].map(encodeURIComponent).join(',')}`)
    .join('&');
  const params = new URLSearchParams(window.location.search);
  params.delete('f');
  const search = [params.toString(), value && `f=${encodeURIComponent(value)}`].filter(Boolean).join('&');
  window.history.replaceState({}, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`);
}

const matches = (product, selection) => [...selection].every(([group, values]) => (
  !values.size || (product.filters?.[group] || []).some((value) => values.has(value))
));

const copySelection = (selection) => new Map([...selection].map(([g, v]) => [g, new Set(v)]));

// the source's amounts as shown there ("2999.00"); a discount without a number is not shown
const amount = (value) => Number(String(value || '').replace(/[^\d.]/g, '')) || 0;
const hasDiscount = (discount) => /[1-9]/.test(String(discount || ''));

export default async function decorate(block) {
  instances += 1;
  const id = `wallpaper-collection-${instances}`;
  const config = readConfig(block);
  block.replaceChildren();

  // the API first (where this page may read it), else the workbook
  block.setAttribute('aria-busy', 'true');
  // the API only when the page names one (the Listing API row or metadata)
  const api = serviceUrl(config.api || getMetadata('wallpaper-collection-api'));
  // warm up the connections to the API and the DAM images before they are needed
  [['', api], ['anonymous', api], ['', `https://${SITE_DOMAIN}`]].forEach(([crossOrigin, href]) => {
    try {
      const { origin } = new URL(href, window.location.href);
      if (!href || origin === window.location.origin) return;
      const hint = document.createElement('link');
      hint.rel = 'preconnect';
      hint.href = origin;
      if (crossOrigin) hint.crossOrigin = crossOrigin;
      document.head.append(hint);
    } catch (e) {
      // no valid URL to connect to
    }
  });
  // the site's wishlist loads alongside the data
  const wishlistReady = loadWishlist();
  // the site's mini cart switch, read alongside the data
  const miniCartHiddenReady = miniCartHidden();
  let data = api && canCall(api) ? await loadData(api, API_TIMEOUT) : null;
  // which one is on show, for checking in the browser
  block.dataset.source = data ? 'api' : 'sheet';
  // the sheet only when the page names one (the Sheet path row or metadata)
  data = data || await loadData(config.sheet || getMetadata('wallpaper-collection-sheet'));
  block.removeAttribute('aria-busy');
  if (!data) {
    block.dataset.source = 'none';
    return;
  }
  const settings = data.settings || {};
  // the labels: authored, else the listing API's, else the defaults
  const labels = {
    filter: config.labels.filter || settings.filterText || 'Filter by',
    sort: config.labels.sort || settings.sortText || 'Sort by :',
    clear: config.labels.clear || settings.clearText || 'Clear all',
    colours: config.labels.colours || settings.coloursTitle || 'Colours',
    cart: config.labels.cart || 'Add to cart',
    apply: config.labels.apply || settings.applyText || 'Apply',
    loadMore: config.labels.loadMore || 'Load more',
  };
  const noun = settings.noun ? `${settings.noun}s` : 'wallpapers';

  // the API's heading, when the section has none of its own
  const authoredHeading = block.closest('.section')
    ?.querySelector(':scope > .default-content-wrapper :is(h1, h2, h3)');

  const parentTitle = authoredHeading?.textContent?.trim()
  || settings.title
  || '';

  if (settings.title && !authoredHeading) {
    const heading = el('div', 'wallpaper-collection-heading');
    heading.append(el('h2', '', settings.title));
    if (settings.description) heading.append(el('p', '', settings.description));
    block.append(heading);
  }

  // an empty listing: the API's image and message
  if (!data.products.length) {
    const empty = el('div', 'wallpaper-collection-empty');
    if (settings.empty?.image) {
      const img = document.createElement('img');
      img.src = siteUrl(settings.empty.image);
      img.alt = '';
      img.loading = 'lazy';
      empty.append(img);
    }
    const message = el('p', '', settings.empty?.description || `No ${noun} found.`);
    message.setAttribute('role', 'status');
    empty.append(message);
    block.append(empty);
    return;
  }
  const groups = (data.filters || []).filter((group) => group.name && group.options?.length);

  /* ---- markup ---- */
  const body = el('div', 'wallpaper-collection-body');

  // filter panel (inline on desktop, a full-screen dialog on mobile)
  const panel = el('div', 'wallpaper-collection-filters');
  panel.id = `${id}-filters`;
  const panelHead = el('div', 'wallpaper-collection-filters-head');
  const panelTitle = el('h2', 'wallpaper-collection-filters-title', labels.filter);
  panelTitle.id = `${id}-filters-title`;
  const panelCount = el('span', 'wallpaper-collection-count');
  panelTitle.append(panelCount);
  const close = el('button', 'wallpaper-collection-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close filters');
  // Clear all sits by the title on desktop and in the bottom bar (with Apply) on mobile
  const clearAll = el('button', 'wallpaper-collection-clear', labels.clear);
  clearAll.type = 'button';
  panelHead.append(panelTitle, clearAll, close);
  const actions = el('div', 'wallpaper-collection-filters-actions');
  const apply = el('button', 'wallpaper-collection-apply', labels.apply);
  apply.type = 'button';
  actions.append(apply);
  panel.append(panelHead);

  let groupIndex = 0;
  const accordion = (title, open, content) => {
    const section = el('div', 'wallpaper-collection-group');
    const heading = el('h3', 'wallpaper-collection-group-title');
    const toggle = el('button', 'wallpaper-collection-group-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(open));
    const count = el('span', 'wallpaper-collection-count');
    toggle.append(el('span', '', title), count);
    heading.append(toggle);
    content.id = `${id}-group-${groupIndex}`;
    groupIndex += 1;
    toggle.setAttribute('aria-controls', content.id);
    content.hidden = !open;
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(expanded));
      content.hidden = !expanded;
    });
    section.append(heading, content);
    panel.append(section);
    return count;
  };

  // Colours: links to the colour listing pages, drawn as radio options like the source (open);
  // the authored rows, else the API's
  const colourLinks = config.colours.length ? config.colours : settings.colours || [];
  if (colourLinks.length) {
    const colours = el('ul', 'wallpaper-collection-colours');
    const here = pagePath(window.location.href);
    colourLinks.forEach((colour) => {
      const li = el('li');
      if (colour.row) moveInstrumentation(colour.row, li);
      const a = el('a', 'wallpaper-collection-radio', colour.label);
      a.href = colour.href;
      if (pagePath(colour.href) === here) a.setAttribute('aria-current', 'page');
      a.addEventListener('click', () => {
        pushAdobeCalculatorEvents({
          event: 'filter_click',
          filter: `${labels.colours} : ${colour.label}`,
        });
      });
      li.append(a);
      colours.append(li);
    });
    accordion(labels.colours, true, colours);
  }

  const options = [];
  const groupCounts = new Map();
  // a group's values in alphabetical order, as on the source
  const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
  groups.forEach((group) => {
    const fieldset = el('fieldset', 'wallpaper-collection-options');
    fieldset.append(el('legend', 'wallpaper-collection-sr-only', group.name));
    [...new Set(group.options)].sort(byName).forEach((value) => {
      const label = el('label', 'wallpaper-collection-option');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = value;
      input.dataset.group = group.name;
      label.append(input, el('span', 'wallpaper-collection-box'), el('span', '', value));
      fieldset.append(label);
      options.push(input);
    });
    groupCounts.set(group.name, accordion(group.name, false, fieldset));
  });

  // Room type (the authored rows, else the API's labels): switches every card's photo; types 2
  // and 3 only when some wallpaper has a photo for them, as on the source
  const roomLabels = config.rooms.length
    ? config.rooms.map((room, i) => ({ ...room, type: String(i + 1) }))
    : settings.rooms || [];
  const rooms = roomLabels
    .filter((room) => room.type === '1'
      || data.products.some((p) => p.shades.some((shade) => shade.images[room.type])));
  let roomType = '1';
  if (rooms.length > 1) {
    const fieldset = el('fieldset', 'wallpaper-collection-options wallpaper-collection-rooms');
    fieldset.append(el('legend', 'wallpaper-collection-sr-only', 'Room type'));
    rooms.forEach((room) => {
      const label = el('label', 'wallpaper-collection-option');
      if (room.row) moveInstrumentation(room.row, label);
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `${id}-room`;
      input.value = room.type;
      input.checked = room.type === roomType;
      label.append(input, el('span', 'wallpaper-collection-radio-mark'), el('span', '', room.label));
      fieldset.append(label);
    });
    accordion(settings.roomsTitle || 'Room type', false, fieldset);
  }
  panel.append(actions);

  // results: Filter button (mobile), pills, sort, grid, load more
  const results = el('div', 'wallpaper-collection-results');
  const bar = el('div', 'wallpaper-collection-bar');
  const openFilters = el('button', 'wallpaper-collection-open', labels.filter);
  openFilters.type = 'button';
  const openCount = el('span', 'wallpaper-collection-count');
  openFilters.append(openCount);
  openFilters.setAttribute('aria-controls', panel.id);
  openFilters.setAttribute('aria-expanded', 'false');
  const pills = el('ul', 'wallpaper-collection-pills');
  pills.setAttribute('aria-label', 'Applied filters');
  const sort = el('div', 'wallpaper-collection-sort');
  const sortLabel = el('label', '', labels.sort);
  const select = document.createElement('select');
  select.id = `${id}-sort`;
  sortLabel.htmlFor = select.id;
  const sorts = (settings.sorts || [])
    .map((value) => SORTS.find(([key]) => key === String(value).trim().toUpperCase()))
    .filter(Boolean);
  [...new Set(sorts.length ? sorts : SORTS)].forEach(([value, text]) => {
    const option = el('option', '', text);
    option.value = value;
    select.append(option);
  });
  sort.append(sortLabel, select);
  bar.append(openFilters, pills, sort);

  const grid = el('ul', 'wallpaper-collection-grid');
  grid.setAttribute('aria-label', noun.charAt(0).toUpperCase() + noun.slice(1));
  const status = el('p', 'wallpaper-collection-sr-only');
  status.setAttribute('role', 'status');
  const more = el('div', 'wallpaper-collection-more');
  const loadMore = el('button', 'wallpaper-collection-load', labels.loadMore);
  loadMore.type = 'button';
  more.append(loadMore);
  results.append(bar, grid, more, status);

  body.append(panel, results);
  block.append(body);

  /* ---- state ---- */
  const products = data.products.map((product, i) => ({ ...product, index: i }));
  let applied = readSelection();
  let draft = copySelection(applied);
  // on mobile every card shows at once (no Load more), as on the source; else the authored page
  const firstPage = () => (MOBILE.matches ? Infinity : config.pageSize);
  let shown = firstPage();
  let list = [];
  const chosenShade = new Map(); // wallpaper code -> the shade on show

  // as on the source: out-of-stock wallpapers last, then ascending by the number, prices by MRP;
  // ties keep popularity, then the data order
  const rank = (item, key) => Number(item[key]) || 0;
  const sorted = (items) => [...items].sort((a, b) => {
    let order = Number(b.inStock) - Number(a.inStock);
    if (order) return order;
    if (select.value === 'LATEST') order = rank(a, 'latest') - rank(b, 'latest');
    if (select.value === 'PRICE-HIGH TO LOW') order = amount(b.mrp) - amount(a.mrp);
    if (select.value === 'PRICE-LOW TO HIGH') order = amount(a.mrp) - amount(b.mrp);
    return order || rank(a, 'popularity') - rank(b, 'popularity') || a.index - b.index;
  });

  const isAvailable = (selection, group, value) => {
    const others = new Map([...selection].filter(([g]) => g !== group));
    return products.some((product) => matches(product, others)
      && (product.filters?.[group] || []).includes(value));
  };

  // as on the source, a choice that the other groups' choices rule out is dropped
  const prune = (selection) => {
    const ruledOut = () => [...selection].flatMap(([group, values]) => [...values]
      .filter((value) => !isAvailable(selection, group, value))
      .map((value) => [group, value]));
    for (let out = ruledOut(); out.length; out = ruledOut()) {
      out.forEach(([group, value]) => selection.get(group).delete(value));
    }
    return selection;
  };

  // a value is available when some wallpaper matching the other groups' choices has it
  function updateOptions(selection) {
    options.forEach((input) => {
      const { group } = input.dataset;
      input.checked = Boolean(selection.get(group)?.has(input.value));
      input.disabled = !input.checked && !isAvailable(selection, group, input.value);
    });
    let total = 0;
    groupCounts.forEach((count, group) => {
      const n = selection.get(group)?.size || 0;
      total += n;
      count.textContent = n ? ` (${n})` : '';
    });
    [panelCount, openCount].forEach((count) => { count.textContent = total ? ` (${total})` : ''; });
  }

  // the hearts: the site's shared wishlist (set up once the first cards are in), else a toggle
  // on the page
  const sharedWishlist = await wishlistReady;
  let wishlist = null;

  // the cart: the visitor's Asian Paints cart through the authored cart APIs (where the page may
  // call them), else quantities kept on the page. Each change is announced and sent as the
  // `wallpaper-collection:cart` event ({ code, name, url, quantity }) for the host page to use.
  const basket = new Map(); // code -> quantity, on the page
  const apis = {
    add: serviceUrl(config.cartApi || getMetadata('wallpaper-collection-cart-api')),
    miniCart: serviceUrl(config.miniCartApi || getMetadata('wallpaper-collection-minicart-api')),
    entry: serviceUrl(config.cartEntryApi || getMetadata('wallpaper-collection-cart-entry-api')),
  };
  // no Add to cart where the site hides its mini cart (the header's switch), else as the row says
  const showCart = config.cart && !(await miniCartHiddenReady);
  const remote = showCart && Object.values(apis).every((url) => url && canCall(url));
  const entries = new Map(); // code -> { entry, quantity }, from the mini cart
  const quantityOf = (code) => (remote ? entries.get(code)?.quantity || 0 : basket.get(code) || 0);
  const paintCarts = () => block.querySelectorAll('.wallpaper-collection-cart')
    .forEach((node) => node.update());

  const announce = (product, code) => {
    const quantity = quantityOf(code);
    status.textContent = quantity > 0
      ? `${product.name}: ${quantity} in cart`
      : `${product.name} removed from cart`;
    block.dispatchEvent(new CustomEvent('wallpaper-collection:cart', {
      bubbles: true,
      detail: {
        code, name: product.name, url: siteUrl(product.url), quantity,
      },
    }));
  };

  // the header's cart badge, as the header sets it; the header may build it after the cart is
  // read, so the count is also set once the badge appears
  let cartCount = null;
  let badgeWatch = null;
  const paintBadges = () => {
    const badges = document.querySelectorAll('header .cart-badge');
    badges.forEach((badge) => {
      if (badge.textContent === String(cartCount)) return;
      badge.textContent = String(cartCount);
      badge.style.display = 'flex';
      badge.setAttribute('aria-hidden', 'false');
    });
    return badges.length > 0;
  };
  const showCartCount = (count) => {
    cartCount = count;
    if (paintBadges() || badgeWatch) return;
    badgeWatch = new MutationObserver(() => {
      if (!paintBadges()) return;
      badgeWatch.disconnect();
    });
    badgeWatch.observe(document.body, { childList: true, subtree: true });
    // stop looking after a while (a page without the header's cart)
    setTimeout(() => badgeWatch.disconnect(), 30000);
  };

  const cartFetch = async (url, method = 'GET') => {
    const response = await fetch(withTimestamp(url), { method, credentials: 'include', cache: 'no-store' });
    let json = null;
    try {
      json = await response.json();
    } catch (e) {
      // no JSON answer
    }
    return { ok: response.ok, json };
  };

  // the visitor's cart: entry numbers and quantities by product code, and the badge
  async function readCart() {
    try {
      const { json } = await cartFetch(apis.miniCart);
      entries.clear();
      const items = json?.status === 'failure' ? [] : json?.entries || json?.cartEntries || json?.items || [];
      items.forEach((item) => {
        const code = String(item.product?.code || item.product?.productSKU || item.productCode
          || item.sku || '');
        const entry = item.entryNumber ?? item.entryId ?? item.id;
        if (code && entry !== undefined && entry !== null) {
          entries.set(code, { entry: String(entry), quantity: Number(item.quantity) || 0 });
        }
      });
      showCartCount(json?.status === 'failure' ? 0 : json?.totalItems || json?.count || 0);
    } catch (e) {
      // the cart stays as last read
    }
    paintCarts();
  }

  // adds one of the shade (GET, as the source's addToCartLogic); the answer's error otherwise
  async function addOne(code) {
    try {
      const { json } = await cartFetch(fillUrl(apis.add, { quantity: 1, sku: code }));
      if (json?.status !== 'success') return { error: cartError(json, 'Unable to add to cart.') };
      if (json.cartCount) showCartCount(json.cartCount);
      return {};
    } catch (e) {
      return { error: 'Unable to add to cart.' };
    }
  }

  // a new quantity for the shade's entry (PUT), or none (DELETE), as the header's mini cart
  async function setEntry(code, quantity) {
    const entry = entries.get(code)?.entry;
    if (entry === undefined) return { error: 'Unable to update the cart.' };
    const update = apis.entry.includes('{quantity}')
      ? apis.entry : apis.entry.split('{entry}').join('{entry}.{quantity}');
    const remove = apis.entry.split('.{quantity}').join('').split('{quantity}').join('');
    try {
      const { ok } = quantity > 0
        ? await cartFetch(fillUrl(update, { entry, quantity }), 'PUT')
        : await cartFetch(fillUrl(remove, { entry }), 'DELETE');
      return ok ? {} : { error: 'Unable to update the cart.' };
    } catch (e) {
      return { error: 'Unable to update the cart.' };
    }
  }

  // the cart's quantities show once the page is idle (not before the listing's first paint)
  if (remote) {
    const read = () => (window.requestIdleCallback || setTimeout)(() => readCart());
    if (document.readyState === 'complete') read();
    else window.addEventListener('load', read, { once: true });
  }

  /** Add to cart, which turns into a − 1 + stepper once the shade is in the cart. */
  function cartControl(product, firstCode) {
    const node = el('div', 'wallpaper-collection-cart');
    const add = el('button', 'wallpaper-collection-add', labels.cart);
    add.type = 'button';
    // the visible text first in the name, so speech users can say it
    add.setAttribute('aria-label', `${labels.cart}: ${product.name}`);
    const stepper = el('div', 'wallpaper-collection-quantity');
    stepper.setAttribute('role', 'group');
    stepper.setAttribute('aria-label', `Quantity of ${product.name}`);
    const less = el('button', 'wallpaper-collection-step', '−');
    less.type = 'button';
    const count = el('span', 'wallpaper-collection-step-count');
    const plus = el('button', 'wallpaper-collection-step', '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', 'Increase quantity');
    stepper.append(less, count, plus);
    // the cart's answer under the button: added (for a while) or its error
    const message = el('p', 'wallpaper-collection-cart-message');
    message.hidden = true;
    node.append(add, stepper, message);

    let messageTimer = null;
    const say = (text, isError) => {
      clearTimeout(messageTimer);
      message.textContent = text;
      message.classList.toggle('is-error', Boolean(isError));
      message.hidden = !text;
      if (text) status.textContent = text;
      if (text && !isError) {
        messageTimer = setTimeout(() => { message.hidden = true; }, CART_MESSAGE_TIME);
      }
    };

    node.update = () => {
      const n = quantityOf(node.dataset.cartCode);
      add.hidden = n > 0;
      stepper.hidden = n === 0;
      count.textContent = String(n);
      less.setAttribute('aria-label', n > 1 ? 'Decrease quantity' : `Remove ${product.name} from cart`);
      plus.disabled = n >= MAX_QUANTITY;
      // busy, not disabled, so the focused button keeps its focus (extra clicks are ignored)
      const busy = String(node.classList.contains('is-busy'));
      [add, less, plus].forEach((button) => button.setAttribute('aria-disabled', busy));
    };

    // one change at a time per card, with the cart read again after it
    const change = async (action) => {
      if (node.classList.contains('is-busy')) return;
      const code = node.dataset.cartCode;
      node.classList.add('is-busy');
      node.setAttribute('aria-busy', 'true');
      node.update();
      say('');
      const { error, added } = await action(code);
      if (!error) await readCart();
      node.classList.remove('is-busy');
      node.removeAttribute('aria-busy');
      node.update();
      if (error) say(error, true);
      else {
        if (added) say('Product added to cart successfully.');
        announce(product, code);
      }
    };

    add.addEventListener('click', async () => {
      if (!remote) {
        basket.set(node.dataset.cartCode, 1);
        paintCarts();
        announce(product, node.dataset.cartCode);
        plus.focus();
        return;
      }
      await change(async (code) => ({ ...await addOne(code), added: true }));
      if (!stepper.hidden) plus.focus();
    });
    plus.addEventListener('click', () => {
      if (!remote) {
        basket.set(node.dataset.cartCode, quantityOf(node.dataset.cartCode) + 1);
        paintCarts();
        announce(product, node.dataset.cartCode);
        return;
      }
      change((code) => addOne(code));
    });
    less.addEventListener('click', async () => {
      const code = node.dataset.cartCode;
      if (!remote) {
        const next = quantityOf(code) - 1;
        if (next > 0) basket.set(code, next);
        else basket.delete(code);
        paintCarts();
        announce(product, code);
      } else {
        await change((c) => setEntry(c, quantityOf(c) - 1));
      }
      if (!quantityOf(code)) add.focus();
    });
    const setCode = (code) => {
      node.dataset.cartCode = code;
      say('');
      node.update();
    };
    setCode(firstCode);
    return { node, setCode };
  }

  function price(product) {
    const p = el('p', 'wallpaper-collection-price');
    const mrp = amount(product.mrp);
    const offer = amount(product.price);
    if (!mrp && !offer) return null;
    p.append('MRP ');
    if (offer && mrp && offer !== mrp) {
      const was = el('del', 'wallpaper-collection-mrp');
      was.append(el('span', 'wallpaper-collection-sr-only', 'was '), `₹ ${product.mrp}`);
      p.append(was, ' ');
    }
    p.append(el('span', 'wallpaper-collection-offer', `₹ ${offer ? product.price : product.mrp}`));
    if (hasDiscount(product.discount)) {
      p.append(' ', el('span', 'wallpaper-collection-discount', `(${product.discount})`));
    }
    return p;
  }

  function card(product, position) {
    const li = el('li', 'wallpaper-collection-card');
    const link = el('a', 'wallpaper-collection-card-link');
    link.href = siteUrl(product.url);

    link.addEventListener('click', () => {
      pushAdobeProductTitleClick({
        event: 'product_tile_click',
        productName: product.name || '',
        productCode: product.code || '',
        destinationUrl: siteUrl(product.url) || '',
      });
    });

    if (settings.newTab) newTab(link);
    const media = el('span', 'wallpaper-collection-card-image');
    const picture = document.createElement('picture');
    const source = document.createElement('source');
    source.media = '(min-width: 992px)';
    const img = document.createElement('img');
    img.alt = '';
    img.width = 302;
    img.height = 252;
    img.loading = position < EAGER ? 'eager' : 'lazy';
    if (position === 0) img.fetchPriority = 'high';
    // the shade's photo for the room type (the room shot when that room has none), as on the source
    const show = (shade) => {
      const src = shade.images[roomType] || shade.images[1];
      source.srcset = rendition(src, 302);
      img.src = rendition(src, 338);
    };
    const current = product.shades[chosenShade.get(product.code) || 0] || product.shades[0];
    if (current) show(current);
    picture.append(source, img);
    media.append(picture);
    if (product.tag) media.append(el('span', 'wallpaper-collection-tag', product.tag));
    link.append(media, el('h3', 'wallpaper-collection-card-name', product.name));
    const amounts = price(product);
    if (amounts) link.append(amounts, el('p', 'wallpaper-collection-tax', 'Incl. of all taxes'));
    li.append(link);

    // the heart, for the shade on show, as on the source
    const heart = (sharedWishlist?.heart || pageHeart)({
      code: current?.code || product.code,
      type: WISHLIST_TYPE,
      name: product.name,
      price: product.price || product.mrp || '',
      className: 'wallpaper-collection-wishlist',
    });
    li.append(heart);

    // the bottom row: the shade dots on the left, Add to cart on the right
    const foot = el('div', 'wallpaper-collection-card-foot');
    const cart = showCart && product.inStock
      ? cartControl(product, current?.code || product.code) : null;
    if (cart) foot.append(cart.node);
    if (cart) li.append(foot);
    return li;
  }

  // cards are built in small batches so a long list (every card on mobile) is not one long task;
  // gridReady settles when they are all built, so the section is revealed only then (cards added
  // after the reveal would push the content below them down)
  let renderToken = 0;
  let gridReady = Promise.resolve();
  function renderGrid() {
    renderToken += 1;
    const token = renderToken;
    const pending = list.slice(grid.children.length, shown);
    const start = grid.children.length;
    gridReady = (async () => {
      for (let offset = 0; offset < pending.length; offset += BATCH) {
        if (offset) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => { setTimeout(resolve); });
        }
        if (token !== renderToken) return;
        pending.slice(offset, offset + BATCH).forEach((product, i) => {
          grid.append(card(product, start + offset + i));
        });
        wishlist?.refresh();
      }
    })();
    loadMore.hidden = shown >= list.length;
    status.textContent = `Showing ${Math.min(shown, list.length)} of ${list.length} ${noun}`;
  }

  function renderPills() {
    pills.replaceChildren(...[...applied].flatMap(([group, values]) => [...values].map((value) => {
      const li = el('li', 'wallpaper-collection-pill');
      li.append(el('span', '', value));
      const remove = el('button', 'wallpaper-collection-pill-remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove filter ${value}`);
      remove.addEventListener('click', () => {
        applied.get(group)?.delete(value);
        // eslint-disable-next-line no-use-before-define
        render();
        (pills.querySelector('button') || (MOBILE.matches ? openFilters : clearAll)).focus();
      });
      li.append(remove);
      return li;
    })));
  }

  function render() {
    prune(applied);
    draft = copySelection(applied);
    list = sorted(products.filter((product) => matches(product, applied)));
    shown = firstPage();
    grid.replaceChildren();
    renderGrid();
    renderPills();
    updateOptions(draft);
    writeSelection(applied);
  }

  // a new room type redraws the cards on show (keeping their shades)
  function redraw() {
    grid.replaceChildren();
    renderGrid();
  }

  /* ---- interactions ---- */
  // desktop applies each change at once; mobile collects them until Apply
  panel.addEventListener('change', (e) => {
    if (e.target.name === `${id}-room`) {
      roomType = e.target.value;
      redraw();
      return;
    }
    const input = e.target.closest('input[data-group]');
    if (!input) return;

    const { group } = input.dataset;
    if (!draft.has(group)) draft.set(group, new Set());
    if (input.checked) draft.get(group).add(input.value);
    else draft.get(group).delete(input.value);
    const filterString = [...draft.entries()]
      .filter(([, values]) => values.size)
      .map(([groupName, values]) => `${groupName} : ${[...values].join(', ')}`)
      .join(' | ');

    pushAdobeCalculatorEvents({
      event: 'filter_click',
      filter: filterString,
    });

    if (MOBILE.matches) updateOptions(draft);
    else {
      applied = copySelection(draft);
      render();
    }
  });

  let lastFocus = null;
  const trap = (e) => {
    if (e.key === 'Escape') {
      // eslint-disable-next-line no-use-before-define
      closePanel(false);
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = [...panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled])')]
      .filter((node) => node.getClientRects().length);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  function openPanel() {
    lastFocus = document.activeElement;
    draft = copySelection(applied);
    updateOptions(draft);
    panel.classList.add('is-open');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', panelTitle.id);
    openFilters.setAttribute('aria-expanded', 'true');
    document.body.classList.add('wallpaper-collection-locked');
    panel.addEventListener('keydown', trap);
    close.focus();
  }

  function closePanel(keep) {
    if (!panel.classList.contains('is-open')) return;
    if (!keep) draft = copySelection(applied);
    updateOptions(draft);
    panel.classList.remove('is-open');
    ['role', 'aria-modal', 'aria-labelledby'].forEach((attr) => panel.removeAttribute(attr));
    openFilters.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('wallpaper-collection-locked');
    panel.removeEventListener('keydown', trap);
    (lastFocus || openFilters).focus();
  }

  openFilters.addEventListener('click', openPanel);
  close.addEventListener('click', () => closePanel(false));
  apply.addEventListener('click', () => {
    applied = copySelection(draft);
    render();
    closePanel(true);
  });
  clearAll.addEventListener('click', () => {
    applied = new Map();
    render();
    // on mobile the panel closes, as on the source
    closePanel(true);
  });
  MOBILE.addEventListener('change', () => {
    closePanel(false);
    // narrowed to mobile: the rest of the cards, as there
    if (MOBILE.matches) {
      shown = Infinity;
      renderGrid();
    }
  });

  // desktop: once the panel sticks below the header it gets the source's 10px padding and white
  // background, which the source's script adds at that point (is-stuck)
  let stuckFrame = 0;
  const checkStuck = () => {
    stuckFrame = 0;
    const box = panel.getBoundingClientRect();
    const zoom = panel.offsetHeight ? box.height / panel.offsetHeight : 1;
    const top = parseFloat(getComputedStyle(panel).top) * zoom;
    panel.classList.toggle('is-stuck', !MOBILE.matches && box.height > 0 && box.top <= top + 0.5);
  };
  window.addEventListener('scroll', () => {
    if (!stuckFrame) stuckFrame = requestAnimationFrame(checkStuck);
  }, { passive: true });
  MOBILE.addEventListener('change', checkStuck);
  checkStuck();

  select.addEventListener('change', render);
  loadMore.addEventListener('click', () => {
    pushAdobeCtaClickEvent({
      event: 'custom_cta_click',
      cta: config.labels.loadMore || 'Load more',
      parentTitle,
    });
    const next = grid.children.length;
    shown += config.pageSize;
    renderGrid();
    grid.children[next]?.querySelector('a')?.focus();
  });

  render();
  await gridReady;
  wishlist = sharedWishlist ? sharedWishlist.init(block) : pageWishlist(block);
}
