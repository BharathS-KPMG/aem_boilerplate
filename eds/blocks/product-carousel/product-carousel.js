/**
 * Product Carousel block — a centred title with previous/next arrows (desktop)
 * and a horizontally scrolling row of product cards: image, name, wishlist heart,
 * price and an "Add to cart" button that turns into a − 01 + quantity stepper.
 * Mobile shows pagination dots instead of arrows.
 *
 * On the Asian Paints EDS site the block uses the site's own modules, like the
 * wallpaper-collection listing:
 *   - login: isUserLoggedIn / startLogin from the header block (blocks/header/header.js).
 *     Signed out, Add to cart stores the SKU (localStorage productCarouselAddToCartSku) and
 *     starts the login, as the shared wishlist does for a heart; back on the page, once the header
 *     announces the sign-in (user-loggedIn), the product is added and the - 01 + stepper shows
 *     (or its quantity, when it is in the cart already). A pending add expires after 30 minutes.
 *   - wishlist: the shared scripts/wishlist.js (wishlistHeart + initWishlist).
 *   - cart: the three authored cart APIs (or page metadata product-carousel-cart-api /
 *     -minicart-api / -cart-entry-api), called only where the page may call them (same host,
 *     or a host listed in the page metadata product-carousel-api-hosts, or the listing's
 *     wallpaper-collection-api-hosts).
 * Without those modules or APIs (any other site) the block still works: hearts toggle on the
 * page and quantities are kept on the page. Every cart change is sent as the bubbling
 * `product-carousel:cart` event ({ code, name, url, quantity }).
 *
 * Nothing is written into the code: every text, label and message comes from DA (a row left out
 * shows nothing), and the products come from a JSON source or from the product rows:
 *   1. Data API  (or page metadata product-carousel-api): an Asian Paints JSON API; a path
 *      (/apcolourcatalogue/...) goes to the site's Asian Paints domain, as the cart APIs. Called
 *      only where the page may call it (same host or the api-hosts metadata below).
 *      The listing API's answer (listingJson -> All) is read too.
 *   2. Sheet path (or page metadata product-carousel-sheet): a DA sheet / JSON on this site,
 *      e.g. /eds/best-sellers.json. Columns: Name, Link, SKU, Price, Price Note, Max Qty,
 *      Desktop Image, Mobile Image, Alt, Link Target (case and spaces do not matter).
 *   3. the product rows of the block (Desktop Image ... Max Qty), when there is no JSON source
 *      or it fails, is empty or takes longer than 8 seconds.
 *
 * Authoring contract (DA). Labelled rows: the first cell
 * names the row (case-insensitive):
 *   | Product Carousel   |                                   |
 *   | Title              | Best Sellers                      |
 *   | Previous Label / Next Label / Slide Label | optional arrow and dot names |
 *   | Band Colour        | #232426 (optional)                |
 *   | Bottom Colour      | #FFFFFF (optional)                |
 *   | Add To Cart Label  | Add to cart                       |
 *   | Cart Resource Path | AEM component of the add-to-cart servlet, e.g.               |
 *   |                    | https://beta.asianpaints.com/content/ap/.../sinceyouliked     |
 *   | Pincode            | 400055 (needed with Cart Resource Path)                       |
 *   |   add to cart = <path>.addtocart.<qty>.<sku>.<pincode>.empty x 8.json (as the PDP) |
 *   | Add to cart API    | or a URL with {quantity}, {sku} (optional {price}, {timestamp}) |
 *   | Mini Cart URL      | /apcolourcatalogue/commerce/miniCart.json (Mini cart API)     |
 *   | Cart Entry URL     | /apcolourcatalogue/commerce/deleteCartEntry                   |
 *   |                    | .<entry>.<qty>.json = new quantity (PUT), .<entry>.json = remove |
 *   |                    | (DELETE); or a URL with {entry} and {quantity}                |
 *   | Service Site       | origin for /apcolourcatalogue/... paths off asianpaints.com (optional) |
 *   | Added Message / Failed Message / Error Message / Stock Message | optional |
 *   | Decrease Label / Increase Label / Remove Label / Quantity Label / Wishlist Label | optional |
 *   | Product Type       | wallpapers (the wishlist type)    |
 *   | Data API / Sheet path | JSON source of the products (see above, optional) |
 *   | Currency Symbol    | ₹ (put before a price the JSON gives as a number, optional) |
 *   | Price Locale       | en-IN (digit grouping of such a price, optional)            |
 *   | Default Price Note | /roll Incl. of all taxes (for JSON products without one)    |
 *   | Link Target        | Same Tab / New Tab (optional)     |
 *   | New Tab Label      | opens in a new tab (optional)     |
 *   | Desktop Image      | image (starts a new product card) |
 *   | Mobile Image       | image (optional)                  |
 *   | Name               | product name (a link = product page) |
 *   | SKU                | AW02VH06N75                       |
 *   | Price              | ₹10,000                           |
 *   | Price Note         | /roll Incl. of all taxes          |
 *   | Max Qty            | 10 (optional)                     |
 */

import { getMetadata } from '../../scripts/aem.js';

const BLOCK = 'product-carousel';

/* Row labels authors type in the first cell (case-insensitive) */
const ROW_LABELS = {
  title: 'title',
  heading: 'title',
  'previous label': 'previousLabel',
  'prev label': 'previousLabel',
  'next label': 'nextLabel',
  'slide label': 'slideLabel',
  'dot label': 'slideLabel',
  'band colour': 'bandColour',
  'band color': 'bandColour',
  'top colour': 'bandColour',
  'top color': 'bandColour',
  'bottom colour': 'bottomColour',
  'bottom color': 'bottomColour',
  'add to cart label': 'addLabel',
  'add to cart': 'addLabel',
  'button label': 'addLabel',
  'add to cart api': 'cartApi',
  'add to cart url': 'cartApi',
  'cart api': 'cartApi',
  'cart resource path': 'cartResourcePath',
  'resource path': 'cartResourcePath',
  pincode: 'pincode',
  'pin code': 'pincode',
  'mini cart api': 'miniCartApi',
  'minicart api': 'miniCartApi',
  'mini cart url': 'miniCartApi',
  'cart entry api': 'cartEntryApi',
  'cart entry url': 'cartEntryApi',
  'service site': 'serviceSite',
  'added message': 'addedMessage',
  'success message': 'addedMessage',
  'failed message': 'failedMessage',
  'failure message': 'failedMessage',
  'error message': 'errorMessage',
  'stock message': 'stockMessage',
  'decrease label': 'decreaseLabel',
  'increase label': 'increaseLabel',
  'remove label': 'removeLabel',
  'quantity label': 'quantityLabel',
  'wishlist label': 'wishlistLabel',
  'product type': 'productType',
  'data api': 'dataApi',
  'products api': 'dataApi',
  'product api': 'dataApi',
  'listing api': 'dataApi',
  'sheet path': 'sheetPath',
  'data sheet': 'sheetPath',
  'products sheet': 'sheetPath',
  'data url': 'sheetPath',
  'currency symbol': 'currencySymbol',
  currency: 'currencySymbol',
  'price locale': 'priceLocale',
  'default price note': 'defaultPriceNote',
  'link target': 'linkTarget',
  'open in new tab': 'linkTarget',
  'new tab': 'linkTarget',
  'new tab label': 'newTabLabel',
  'desktop image': 'desktopImage',
  image: 'desktopImage',
  'mobile image': 'mobileImage',
  name: 'name',
  'product name': 'name',
  sku: 'sku',
  'product code': 'sku',
  price: 'price',
  'price note': 'priceNote',
  'max qty': 'maxQty',
  'max quantity': 'maxQty',
};

/* Every setting starts empty: texts, labels and messages come from DA only (nothing built in) */
const blankSettings = () => Object.values(ROW_LABELS).reduce((all, key) => ({ ...all, [key]: '' }), {});

/** Non-empty parts joined, e.g. a label and a product name ("Add to wishlist, <name>"). */
const joinLabel = (...parts) => parts.filter(Boolean).join(', ');

/* pending add to cart across the login (block-specific key, no clash with other blocks) */
const STORE_CART_SKU = 'productCarouselAddToCartSku';
const PENDING_TIME = 30 * 60 * 1000; // a pending add older than this (login abandoned) is dropped
const MESSAGE_TIME = 5000;
const DATA_TIMEOUT = 8000; // a JSON source slower than this: the product rows are used

const svg = (body, size = 20) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">${body}</svg>`;
const ICON_ARROW = svg('<path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>');
const ICON_CART = svg('<path d="M3 4h2l2.4 10.2a1.5 1.5 0 0 0 1.5 1.1h8.4a1.5 1.5 0 0 0 1.4-1.1L20.5 8H6.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.5" cy="19.5" r="1.3" fill="currentColor"/><circle cx="17" cy="19.5" r="1.3" fill="currentColor"/>', 18);
const ICON_HEART = svg('<path d="M12 20.3s-7.8-4.6-7.8-10.3A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.8 2.4c0 5.7-7.8 10.3-7.8 10.3z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>', 24);
const ICON_MINUS = svg('<path d="M6 12h12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>', 18);
const ICON_PLUS = svg('<path d="M12 6v12M6 12h12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>', 18);
const ICON_BIN = svg('<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>', 18);

const DESKTOP_MEDIA = '(min-width: 900px)';

/* ---------- authoring helpers (same conventions as price-carousel) ---------- */

/**
 * Reads an authored link-target setting.
 * @param {string} text e.g. "New Tab", "Yes", "Same Tab", "No"
 * @returns {boolean|null} true = new tab, false = same tab, null = not a target setting
 */
function parseNewTab(text) {
  const value = (text || '').trim().toLowerCase();
  if (/^(yes|true|on|new|new tab|new window|_blank|blank)$/.test(value)) return true;
  if (/^(no|false|off|same|same tab|same window|_self|self)$/.test(value)) return false;
  return null;
}

/**
 * Returns the row type when the first cell is a known label, and removes that cell.
 * @param {Element} row
 * @returns {string|null}
 */
function takeRowLabel(row) {
  const [first, ...rest] = [...row.children];
  if (!first || !rest.length || first.querySelector('img')) return null;
  const type = ROW_LABELS[first.textContent.trim().toLowerCase().replace(/\s+/g, ' ')];
  if (type) first.remove();
  return type || null;
}

function cellText(cell) {
  return cell ? cell.textContent.trim().replace(/\s+/g, ' ') : '';
}

/** Text of all remaining cells of a row, joined. */
function rowText(row) {
  return [...row.children].map(cellText).filter(Boolean).join(' ');
}

const isUrl = (text) => /^(https?:\/\/|\/)\S+$/i.test(text);

/** An authored colour when the browser understands it (#232426, black, rgb(...)), else null. */
function parseColour(value) {
  const text = (value || '').trim();
  if (!text) return null;
  const hex = /^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(text) ? `#${text}` : text;
  return window.CSS && CSS.supports('color', hex) ? hex : null;
}

/**
 * Whether a CSS colour is light (so dark text reads best on it).
 * @param {string} colour any CSS colour the browser accepts
 * @param {Element} host an element in the page, used to resolve the colour
 */
function isLight(colour, host) {
  const probe = document.createElement('span');
  probe.style.color = colour;
  host.append(probe);
  const [r, g, b] = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g).map(Number);
  probe.remove();
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) > 0.4;
}

/**
 * Reads a Name row: a link (text = name, href = product page) or name | URL,
 * plus an optional "New Tab" / "Same Tab" cell for this product.
 */
function readName(row) {
  const cells = [...row.children];
  const anchor = row.querySelector('a[href]');
  const targetIndex = cells.findIndex((cell) => parseNewTab(cellText(cell)) !== null);
  const newTab = targetIndex >= 0 ? parseNewTab(cellText(cells[targetIndex])) : null;
  const textCell = cells.find((cell, i) => i !== targetIndex
    && cellText(cell)
    && !isUrl(cellText(cell)));
  let href = anchor ? anchor.getAttribute('href') : '';
  if (!href) {
    const urlCell = cells.find((cell) => isUrl(cellText(cell)));
    if (urlCell) href = cellText(urlCell);
  }
  const text = anchor && cellText(anchor) && !isUrl(cellText(anchor))
    ? cellText(anchor)
    : cellText(textCell);
  return { text, href, newTab };
}

function create(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = `${BLOCK}-${className}`;
  if (html) node.innerHTML = html;
  return node;
}

function srOnly(text) {
  const span = create('span', 'sr-only');
  span.textContent = text;
  return span;
}

/* ---------- images (same as price-carousel) ---------- */

/** Same-origin raster images can be requested resized; others keep their src (GIF/SVG too). */
function isOptimisable(url) {
  return url.origin === window.location.origin && !/\.(svg|gif)$/i.test(url.pathname);
}

function appendSources(picture, img, media, width) {
  const url = new URL(img.getAttribute('src'), window.location.href);
  const sources = isOptimisable(url)
    ? [
      { type: 'image/webp', srcset: `${url.pathname}?width=${width}&format=webply&optimize=medium` },
      { srcset: `${url.pathname}?width=${width}&format=jpg&optimize=medium` },
    ]
    : [{ srcset: img.src }];
  sources.forEach(({ type, srcset }) => {
    const source = document.createElement('source');
    if (type) source.type = type;
    if (media) source.media = media;
    source.srcset = srcset;
    ['width', 'height'].forEach((attr) => {
      if (img.getAttribute(attr)) source.setAttribute(attr, img.getAttribute(attr));
    });
    picture.append(source);
  });
}

/**
 * Desktop image from 900px, mobile image below.
 * One image is used for both when only one is authored.
 */
function buildImage(desktopImg, mobileImg, fallbackAlt) {
  const picture = document.createElement('picture');
  if (desktopImg !== mobileImg) appendSources(picture, desktopImg, DESKTOP_MEDIA, 900);
  appendSources(picture, mobileImg, null, desktopImg === mobileImg ? 900 : 600);

  const url = new URL(mobileImg.getAttribute('src'), window.location.href);
  const image = document.createElement('img');
  image.src = isOptimisable(url) ? `${url.pathname}?width=600&format=jpg&optimize=medium` : mobileImg.src;
  image.alt = desktopImg.getAttribute('alt') || mobileImg.getAttribute('alt') || fallbackAlt;
  image.loading = 'lazy';
  ['width', 'height'].forEach((attr) => {
    const value = mobileImg.getAttribute(attr) || desktopImg.getAttribute(attr);
    if (value) image.setAttribute(attr, value);
  });
  picture.append(image);
  return picture;
}

/* ---------- the Asian Paints site's modules (optional, loaded when needed) ---------- */

/** Loads a module; null when the site has no such file or it fails. */
async function optionalModule(load) {
  try {
    return await load();
  } catch (e) {
    return null;
  }
}

/**
 * The site's header login and shared scripts. Only the Asian Paints header exports
 * isUserLoggedIn / startLogin; without them this is another site, which has none of the
 * shared scripts either, so they are not requested (no 404s).
 */
let siteModules = null;
function loadSiteModules() {
  siteModules = siteModules || (async () => {
    const modules = {
      auth: null, wishlist: null, analytics: null, environment: null,
    };
    const header = await optionalModule(() => import('../header/header.js'));
    if (!header || typeof header.isUserLoggedIn !== 'function'
      || typeof header.startLogin !== 'function') return modules;
    modules.auth = { isUserLoggedIn: header.isUserLoggedIn, startLogin: header.startLogin };
    const [wishlist, analytics, environment] = await Promise.all([
      // eslint-disable-next-line import/no-unresolved
      optionalModule(() => import('../../scripts/wishlist.js')),
      // eslint-disable-next-line import/no-unresolved
      optionalModule(() => import('../../scripts/analytics_1.js')),
      // eslint-disable-next-line import/no-unresolved
      optionalModule(() => import('../../scripts/environment.js')),
    ]);
    if (wishlist && typeof wishlist.default === 'function'
      && typeof wishlist.wishlistHeart === 'function') modules.wishlist = wishlist;
    modules.analytics = analytics;
    modules.environment = environment;
    return modules;
  })();
  return siteModules;
}

function isSignedIn(auth) {
  try {
    return Boolean(auth && auth.isUserLoggedIn());
  } catch (e) {
    return false;
  }
}

/**
 * The Asian Paints domain for service paths: the Service Site row, else what the site's
 * scripts/environment.js gives; '' when neither (paths then stay on this site).
 */
function serviceSite(environment, authored) {
  if (authored) return authored.replace(/\/+$/, '');
  try {
    if (environment && typeof environment.isProdDomain === 'function') {
      const domain = environment.isProdDomain() ? environment.PROD_DOMAIN : environment.BETA_DOMAIN;
      if (domain) return `https://${domain}`;
    }
  } catch (e) {
    // no domain from the site
  }
  return '';
}

/** An Asian Paints service URL: a path on the site's own domain, else on the service site. */
function serviceUrl(value, site) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return value;
  const host = window.location.hostname.toLowerCase();
  const own = host === 'asianpaints.com' || host.endsWith('.asianpaints.com');
  return `${own ? window.location.origin : site}${value}`;
}

/**
 * Whether this page may call the service: on its own domain, or on a site listed in the page
 * metadata product-carousel-api-hosts (the sites its CORS rules allow; * for every site).
 */
function canCall(url) {
  let api;
  try {
    api = new URL(url, window.location.href);
  } catch (e) {
    return false;
  }
  const { hostname } = window.location;
  // the block's own setting, or the listing's (the same cart services, the same CORS rules)
  const extra = [getMetadata(`${BLOCK}-api-hosts`), getMetadata('wallpaper-collection-api-hosts')]
    .join(',').split(',').map((h) => h.trim()).filter(Boolean);
  return api.hostname === hostname || extra.includes('*') || extra.includes(hostname);
}

/** A URL template with its {placeholders} filled in (values URL-encoded). */
function fillUrl(template, values) {
  return Object.entries(values).reduce(
    (url, [name, value]) => url.split(`{${name}}`).join(encodeURIComponent(value)),
    template,
  );
}

/**
 * The add-to-cart call of an AEM component, as the wallpaper PDP makes it
 * (EcommerceProductPincodeServlet):
 * <path>.addtocart.<qty>.<sku>.<pincode>.empty x 8.json
 *   ?productResourceId=<path>&amount=<price>&...
 * @param {string} path the component's resource path (with or without the site),
 *   e.g. .../jcr:content/.../sinceyouliked
 * @param {string} pincode
 * @returns {string} a template with {quantity}, {sku} and {price}, or '' without a path
 */
function resourceCartApi(path, pincode) {
  const resource = (path || '').trim().replace(/\s+/g, '').replace(/\.html$|\/+$/, '');
  if (!resource || !pincode) return '';
  let resourcePath = resource;
  try {
    resourcePath = new URL(resource, window.location.href).pathname;
  } catch (e) {
    // keep the authored text
  }
  const selectors = ['{quantity}', '{sku}', encodeURIComponent(pincode)]
    .concat(Array(8).fill('empty')).join('.');
  const query = [
    `productResourceId=${encodeURIComponent(resourcePath)}`,
    'amount={price}',
    'textureSubVariantCode=',
    'textureImageUrl=empty',
  ].join('&');
  return `${resource}.addtocart.${selectors}.json?${query}`;
}

/**
 * The cart-entry template: an authored URL with {entry} is kept; the plain service URL
 * (…/deleteCartEntry) gets the selectors the header's mini cart uses: .<entry>.<qty>.json
 */
function cartEntryTemplate(url) {
  const value = (url || '').trim().replace(/\s+/g, '');
  if (!value || value.includes('{entry}')) return value;
  return `${value.replace(/\.json$/, '')}.{entry}.{quantity}.json`;
}

/** The URL with a fresh _=<timestamp> (no cache), or its {timestamp} filled in. */
function withTimestamp(url) {
  if (url.includes('{timestamp}')) return fillUrl(url, { timestamp: Date.now() });
  return `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`;
}

/** The error the cart API gave (short messages only), else the fallback. */
function cartError(json, fallback) {
  const first = json && Array.isArray(json.errors) && json.errors[0];
  const message = (first && first.message)
    || (json && (json.statusMessage || json.message || json.desc));
  return typeof message === 'string' && message && message.length <= 50 ? message : fallback;
}

const storage = {
  get(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  },
  remove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* storage unavailable */ }
  },
};

/** The header's cart badge, as the site's header sets it (it may appear later). */
let cartCount = null;
let badgeWatch = null;
function paintBadges() {
  const badges = document.querySelectorAll('header .cart-badge');
  badges.forEach((badge) => {
    if (badge.textContent === String(cartCount)) return;
    badge.textContent = String(cartCount);
    badge.style.display = 'flex';
    badge.setAttribute('aria-hidden', 'false');
  });
  return badges.length > 0;
}
function showCartCount(count) {
  cartCount = count;
  if (paintBadges() || badgeWatch || !window.MutationObserver) return;
  badgeWatch = new MutationObserver(() => {
    if (paintBadges()) badgeWatch.disconnect();
  });
  badgeWatch.observe(document.body, { childList: true, subtree: true });
  // stop looking after a while (a page without the header's cart)
  setTimeout(() => badgeWatch.disconnect(), 30000);
}

const whenIdle = (callback) => {
  const run = () => (window.requestIdleCallback || setTimeout)(callback);
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
};

const padQty = (qty) => (qty < 10 ? `0${qty}` : `${qty}`);

/* ---------- card ---------- */

function buildCard(data, settings) {
  const card = create('li', 'card');
  const desktopImg = data.image || data.mobileImage;
  const mobileImg = data.mobileImage || data.image;
  const name = data.name ? data.name.text : '';
  const href = data.name ? data.name.href : '';
  const newTab = (data.name && data.name.newTab !== null) ? data.name.newTab : settings.newTab;
  const setLink = (link) => {
    link.href = href;
    if (newTab) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
  };

  // image (a duplicate link to the product page, hidden from keyboard and screen readers)
  const media = create(href ? 'a' : 'div', 'card-media');
  if (href) {
    setLink(media);
    media.tabIndex = -1;
    media.setAttribute('aria-hidden', 'true');
  }
  if (desktopImg) media.append(buildImage(desktopImg, mobileImg, name));
  card.append(media);

  const body = create('div', 'card-body');
  const head = create('div', 'card-head');
  const title = create('p', 'name');
  if (href) {
    const link = create('a', 'name-link');
    setLink(link);
    link.textContent = name;
    if (newTab && settings.newTabLabel) link.append(srOnly(` (${settings.newTabLabel})`));
    title.append(link);
  } else {
    title.textContent = name;
  }
  head.append(title);

  if (data.sku) {
    const wishlist = create('button', 'wishlist', ICON_HEART);
    wishlist.type = 'button';
    wishlist.setAttribute('aria-pressed', 'false');
    wishlist.setAttribute('aria-label', joinLabel(settings.wishlistLabel, name));
    wishlist.dataset.attrSku = data.sku;
    wishlist.dataset.pid = data.sku;
    wishlist.dataset.attrAction = 'like';
    wishlist.dataset.attrType = settings.productType;
    if (name) wishlist.dataset.attrTitle = name;
    if (data.price) wishlist.dataset.attrPrice = data.price;
    head.append(wishlist);
  }
  body.append(head);

  if (data.price || data.priceNote) {
    const price = create('p', 'price');
    if (data.price) {
      const value = create('span', 'price-value');
      value.textContent = data.price;
      price.append(value);
    }
    if (data.priceNote) {
      const note = create('span', 'price-note');
      note.textContent = data.priceNote;
      price.append(note);
    }
    body.append(price);
  }

  if (data.sku) {
    const cart = create('div', 'cart');
    cart.dataset.sku = data.sku;
    if (name) cart.dataset.name = name;
    if (href) cart.dataset.url = new URL(href, window.location.href).href;
    if (data.price) cart.dataset.price = data.price.replace(/[^\d.,]/g, '');
    const maxQty = parseInt(data.maxQty, 10);
    if (maxQty > 0) cart.dataset.maxQty = `${maxQty}`;

    const add = create('button', 'add-to-cart');
    add.type = 'button';
    const addText = create('span', 'add-to-cart-text');
    addText.textContent = settings.addLabel;
    add.append(addText);
    if (name) add.append(srOnly(`, ${name}`));
    add.append(create('span', 'add-to-cart-icon', ICON_CART), create('span', 'spinner'));

    const stepper = create('div', 'stepper');
    stepper.setAttribute('role', 'group');
    stepper.setAttribute('aria-label', joinLabel(settings.quantityLabel, name));
    stepper.hidden = true;
    const minus = create('button', 'qty-minus', `${ICON_MINUS}${ICON_BIN}`);
    minus.type = 'button';
    const qty = create('span', 'qty');
    qty.setAttribute('aria-live', 'polite');
    const plus = create('button', 'qty-plus', ICON_PLUS);
    plus.type = 'button';
    plus.setAttribute('aria-label', settings.increaseLabel);
    stepper.append(minus, qty, plus);

    const message = create('p', 'message');
    message.setAttribute('aria-live', 'polite');
    message.hidden = true;

    cart.append(add, stepper, message);
    body.append(cart);
  }

  card.append(body);
  card.dataset.name = name;
  return card;
}

/* ---------- cart behaviour ---------- */

function setupCart(block, settings) {
  const carts = [...block.querySelectorAll(`.${BLOCK}-cart`)];
  if (!carts.length) return;
  const cartFor = (sku) => carts.find((cart) => cart.dataset.sku === sku);

  const basket = new Map(); // sku -> quantity, kept on the page (no cart APIs)
  const entries = new Map(); // sku -> { entry, quantity }, from the mini cart
  let apis = {};
  let remote = false;
  let modules = {};

  // the site's modules and the cart APIs, worked out once (on idle, or at the first click)
  let readyPromise = null;
  const ready = () => {
    readyPromise = readyPromise || (async () => {
      modules = await loadSiteModules();
      const site = serviceSite(modules.environment, settings.serviceSite
        || getMetadata(`${BLOCK}-service-site`));
      // add to cart: an authored API URL, else Cart Resource Path + Pincode (as the PDP)
      const addApi = settings.cartApi || getMetadata(`${BLOCK}-cart-api`)
        || resourceCartApi(
          settings.cartResourcePath || getMetadata(`${BLOCK}-cart-resource-path`),
          settings.pincode,
        );
      apis = {
        add: serviceUrl(addApi, site),
        miniCart: serviceUrl(settings.miniCartApi || getMetadata(`${BLOCK}-minicart-api`), site),
        entry: serviceUrl(cartEntryTemplate(settings.cartEntryApi
          || getMetadata(`${BLOCK}-cart-entry-api`)), site),
      };
      remote = Object.values(apis).every((url) => url && canCall(url));
    })();
    return readyPromise;
  };

  const quantityOf = (sku) => {
    if (!remote) return basket.get(sku) || 0;
    const entry = entries.get(sku);
    return entry ? entry.quantity : 0;
  };

  const showMessage = (cart, text, type) => {
    const message = cart.querySelector(`.${BLOCK}-message`);
    clearTimeout(cart.messageTimer);
    message.textContent = text;
    message.classList.toggle('is-error', type === 'error');
    message.classList.toggle('is-success', type === 'success');
    message.hidden = !text;
    if (!text) return;
    cart.messageTimer = setTimeout(() => {
      message.hidden = true;
      message.textContent = '';
    }, MESSAGE_TIME);
  };

  const setBusy = (cart, busy) => {
    cart.classList.toggle('is-busy', busy);
    if (busy) cart.setAttribute('aria-busy', 'true');
    else cart.removeAttribute('aria-busy');
    const max = parseInt(cart.dataset.maxQty, 10);
    const qty = parseInt(cart.dataset.qty, 10) || 0;
    cart.querySelector(`.${BLOCK}-add-to-cart`).disabled = busy;
    cart.querySelector(`.${BLOCK}-qty-minus`).disabled = busy;
    cart.querySelector(`.${BLOCK}-qty-plus`).disabled = busy || (max > 0 && qty >= max);
  };

  /** Shows the stepper (qty > 0) or the Add to cart button (qty 0). */
  const render = (cart) => {
    const qty = quantityOf(cart.dataset.sku);
    const add = cart.querySelector(`.${BLOCK}-add-to-cart`);
    const stepper = cart.querySelector(`.${BLOCK}-stepper`);
    const minus = cart.querySelector(`.${BLOCK}-qty-minus`);
    const plus = cart.querySelector(`.${BLOCK}-qty-plus`);
    const hadFocus = cart.contains(document.activeElement);
    const wasStepper = !stepper.hidden;
    cart.dataset.qty = `${qty}`;
    add.hidden = qty > 0;
    stepper.hidden = qty <= 0;
    if (qty > 0) {
      const value = cart.querySelector(`.${BLOCK}-qty`);
      value.textContent = padQty(qty);
      if (settings.quantityLabel) value.prepend(srOnly(`${settings.quantityLabel} `));
      minus.classList.toggle('is-remove', qty === 1);
      minus.setAttribute('aria-label', qty === 1 ? settings.removeLabel : settings.decreaseLabel);
      const max = parseInt(cart.dataset.maxQty, 10);
      plus.disabled = max > 0 && qty >= max;
    }
    // keep keyboard focus on the control that replaced the one just used
    if (hadFocus && wasStepper !== (qty > 0)) (qty > 0 ? plus : add).focus();
  };
  const renderAll = () => carts.forEach(render);

  /** Sends the change to the host page. */
  const announce = (cart) => {
    block.dispatchEvent(new CustomEvent(`${BLOCK}:cart`, {
      bubbles: true,
      detail: {
        code: cart.dataset.sku,
        name: cart.dataset.name || '',
        url: cart.dataset.url || '',
        quantity: quantityOf(cart.dataset.sku),
      },
    }));
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

  /** The visitor's cart: entry numbers and quantities by product code, and the header badge. */
  const readCart = async () => {
    try {
      const { json } = await cartFetch(apis.miniCart);
      const failed = !json || json.status === 'failure';
      entries.clear();
      const items = failed ? [] : json.entries || json.cartEntries || json.items || [];
      items.forEach((item) => {
        const product = item.product || {};
        const code = String(product.code || product.productSKU || item.productCode || item.sku || '');
        let entry = item.entryNumber;
        if (entry === undefined || entry === null) entry = item.entryId;
        if (entry === undefined || entry === null) entry = item.id;
        if (code && entry !== undefined && entry !== null) {
          entries.set(code, { entry: String(entry), quantity: Number(item.quantity) || 0 });
        }
      });
      showCartCount(failed ? 0 : json.totalItems || json.count || 0);
    } catch (e) {
      // the cart stays as last read
    }
    renderAll();
  };

  /** Adds one (GET the Add to cart API); the API's error otherwise. */
  const addOne = async (sku) => {
    const cart = cartFor(sku);
    // the servlet's amount: the price as a number (29,500 -> 29500)
    const price = ((cart && cart.dataset.price) || '').replace(/[^\d.]/g, '') || '0';
    try {
      const { json } = await cartFetch(fillUrl(apis.add, { quantity: 1, sku, price }));
      if (!json || json.status !== 'success') {
        return { failed: true, error: cartError(json, settings.failedMessage) };
      }
      if (json.cartCount) showCartCount(json.cartCount);
      return {};
    } catch (e) {
      return { failed: true, error: settings.errorMessage };
    }
  };

  /** A new quantity for the product's cart entry (PUT), or none (DELETE). */
  const setEntry = async (sku, quantity) => {
    const known = entries.get(sku);
    if (!known) return { failed: true, error: settings.errorMessage };
    const update = apis.entry.includes('{quantity}')
      ? apis.entry : apis.entry.split('{entry}').join('{entry}.{quantity}');
    const remove = apis.entry.split('.{quantity}').join('').split('{quantity}').join('');
    try {
      const { ok } = quantity > 0
        ? await cartFetch(fillUrl(update, { entry: known.entry, quantity }), 'PUT')
        : await cartFetch(fillUrl(remove, { entry: known.entry }), 'DELETE');
      return ok ? {} : { failed: true, error: settings.errorMessage };
    } catch (e) {
      return { failed: true, error: settings.errorMessage };
    }
  };

  const trackAdd = (cart) => {
    const { analytics } = modules;
    try {
      if (analytics && typeof analytics.pushAdobeCtaClickEvent === 'function') {
        analytics.pushAdobeCtaClickEvent({
          event: 'custom_cta_click',
          cta: settings.addLabel,
          parentTitle: settings.title || '',
          title: cart.dataset.name || '',
        });
      }
      if (typeof window.gtagAddToCartNewFunction === 'function') {
        const price = parseFloat((cart.dataset.price || '').replace(/,/g, ''));
        const amount = Number.isNaN(price) ? cart.dataset.price : price;
        window.gtagAddToCartNewFunction(amount, cart.dataset.sku);
      }
    } catch (e) {
      // analytics must never break the cart
    }
  };

  /** One change at a time per card; the cart is read again after it. */
  const change = async (cart, action, added) => {
    const { sku } = cart.dataset;
    setBusy(cart, true);
    showMessage(cart, '');
    const { failed, error } = await action(sku);
    if (!failed && remote) await readCart();
    setBusy(cart, false);
    render(cart);
    if (failed) {
      showMessage(cart, error, 'error');
      return;
    }
    if (added) {
      trackAdd(cart);
      const max = parseInt(cart.dataset.maxQty, 10);
      if (max > 0 && quantityOf(sku) >= max) showMessage(cart, settings.stockMessage, 'error');
      else showMessage(cart, settings.addedMessage, 'success');
    }
    announce(cart);
  };

  // page-only cart (no APIs): the same steps, without requests
  const pageAdd = async (sku) => {
    basket.set(sku, (basket.get(sku) || 0) + 1);
    return {};
  };
  const pageSet = async (sku, quantity) => {
    if (quantity > 0) basket.set(sku, quantity);
    else basket.delete(sku);
    return {};
  };
  const addAction = (sku) => (remote ? addOne(sku) : pageAdd(sku));
  const setAction = (sku, quantity) => (remote ? setEntry(sku, quantity) : pageSet(sku, quantity));

  /**
   * Login first: signed out, the SKU is kept and the header's login starts (back on the page
   * the add is completed). Without the header's login, a cart that would call the APIs asks the
   * host page (event); a page-only cart goes ahead.
   */
  const mayAdd = (sku) => {
    const { auth } = modules;
    if (auth && isSignedIn(auth)) return true;
    if (!auth && !remote) return true;
    storage.set(STORE_CART_SKU, JSON.stringify({ sku, time: Date.now() }));
    if (auth) {
      Promise.resolve()
        .then(() => auth.startLogin(window.location.href))
        .catch(() => {});
    } else {
      block.dispatchEvent(new CustomEvent(`${BLOCK}:login-required`, {
        bubbles: true,
        detail: { sku, action: 'add-to-cart' },
      }));
    }
    return false;
  };

  carts.forEach((cart) => {
    const { sku } = cart.dataset;
    const busy = () => cart.classList.contains('is-busy');
    cart.querySelector(`.${BLOCK}-add-to-cart`).addEventListener('click', async () => {
      if (busy()) return;
      setBusy(cart, true);
      await ready();
      setBusy(cart, false);
      if (mayAdd(sku)) await change(cart, addAction, true);
    });
    cart.querySelector(`.${BLOCK}-qty-plus`).addEventListener('click', () => {
      const max = parseInt(cart.dataset.maxQty, 10);
      if (busy() || (max > 0 && quantityOf(sku) >= max)) return;
      change(cart, addAction, true);
    });
    cart.querySelector(`.${BLOCK}-qty-minus`).addEventListener('click', () => {
      if (busy()) return;
      change(cart, (code) => setAction(code, quantityOf(code) - 1), false);
    });
  });

  /** The add started before the login ({ sku, time }), or null (none, or older than 30 min). */
  const pendingSku = () => {
    let pending = null;
    try {
      pending = JSON.parse(storage.get(STORE_CART_SKU));
    } catch (e) {
      pending = null;
    }
    if (!pending || !pending.sku || !(Date.now() - pending.time < PENDING_TIME)) {
      if (storage.get(STORE_CART_SKU)) storage.remove(STORE_CART_SKU);
      return null;
    }
    return String(pending.sku);
  };

  /** Back from the login: finish the add the visitor started (when it is in this block). */
  const resume = async () => {
    const pending = pendingSku();
    const cart = pending && cartFor(pending);
    if (!cart || !isSignedIn(modules.auth)) return;
    storage.remove(STORE_CART_SKU);
    // already in the cart: its quantity shows; else one is added (the stepper then shows)
    if (quantityOf(pending) > 0) render(cart);
    else await change(cart, addAction, true);
  };

  // signed in (the header's user-loggedIn, as the shared wishlist listens to; or already signed
  // in when the page is idle): the visitor's cart quantities, then the add started before the login
  let signInDone = null;
  const onSignIn = () => {
    signInDone = signInDone || (async () => {
      await ready();
      if (remote) await readCart();
      await resume();
    })();
    return signInDone;
  };
  document.addEventListener('user-loggedIn', onSignIn);

  // once the page is idle: the cart's quantities (products already in it), then any pending add
  whenIdle(async () => {
    await ready();
    if (isSignedIn(modules.auth)) {
      await onSignIn();
      return;
    }
    if (remote) await readCart();
  });
}

/* ---------- products from a JSON source (API or DA sheet) ---------- */

/** A field of a JSON item, whatever its case or spacing (Desktop Image, desktopImage, ...). */
function field(item, ...names) {
  const wanted = names.map((name) => name.toLowerCase().replace(/[\s_-]/g, ''));
  const plain = (k) => k.toLowerCase().replace(/[\s_-]/g, '');
  const key = Object.keys(item).find((k) => wanted.includes(plain(k)));
  const value = key === undefined ? '' : item[key];
  if (value && typeof value === 'object') return value.src || value.url || value.path || '';
  return value === null || value === undefined ? '' : String(value).trim();
}

/** The items of a JSON answer: a DA sheet (data or first sheet), the listing API, a list. */
function jsonItems(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  if (typeof json.listingJson === 'string') {
    try {
      const list = JSON.parse(json.listingJson).All;
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }
  const lists = [json.data, json.products, json.items, json.results];
  if (json[':type'] === 'multi-sheet' && Array.isArray(json[':names'])) {
    lists.push(json[json[':names'][0]] && json[json[':names'][0]].data);
  }
  return lists.find((list) => Array.isArray(list)) || [];
}

/** A price the JSON gives as a number, with the authored currency symbol and digit grouping. */
function formatPrice(value, settings) {
  const number = Number(value);
  if (value === '' || Number.isNaN(number)) return value;
  let text = String(number);
  try {
    text = number.toLocaleString(settings.priceLocale || undefined, { maximumFractionDigits: 2 });
  } catch (e) {
    // an unknown locale: the plain number
  }
  return `${settings.currencySymbol || ''}${text}`;
}

/** A JSON item as the product rows give it: images, name (+ link), SKU, price... */
function productFromItem(item, base, settings) {
  const url = (value) => {
    if (!value) return '';
    try {
      return new URL(value, base).href;
    } catch (e) {
      return value;
    }
  };
  const image = (src, alt) => {
    if (!src) return null;
    const img = document.createElement('img');
    img.src = url(src);
    img.alt = alt;
    return img;
  };
  const name = field(item, 'name', 'product name', 'title', 'entityName');
  const alt = field(item, 'alt', 'image alt', 'alt text') || name;
  const desktop = field(item, 'desktop image', 'image', 'image url', 'swatchImageInfo', 'thumbnail');
  const mobile = field(item, 'mobile image', 'mobile image url');
  const target = parseNewTab(field(item, 'link target', 'new tab', 'target'));
  return {
    image: image(desktop, alt),
    mobileImage: image(mobile, alt),
    name: {
      text: name,
      href: url(field(item, 'link', 'url', 'href', 'product url', 'pageUrl')),
      newTab: target,
    },
    sku: field(item, 'sku', 'product code', 'code', 'entityCode'),
    price: formatPrice(field(item, 'price', 'offer price', 'sellingPrice'), settings),
    priceNote: field(item, 'price note', 'priceNote') || settings.defaultPriceNote,
    maxQty: field(item, 'max qty', 'max quantity', 'maxQuantityToBeSold'),
  };
}

/** The JSON at url, or null (error, not JSON, or slower than DATA_TIMEOUT). */
async function loadJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DATA_TIMEOUT);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok ? await response.json() : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The products of the authored JSON source: the Data API first, then the Sheet path.
 * @returns {Promise<object[]|null>} null when there is no source or it gives no products
 */
async function loadProducts(settings) {
  const api = settings.dataApi || getMetadata(`${BLOCK}-api`);
  const sheet = settings.sheetPath || getMetadata(`${BLOCK}-sheet`);
  const sources = [];
  if (api) {
    // an API path goes to the Asian Paints domain, as the cart APIs
    const relative = api.startsWith('/') && !api.startsWith('//');
    const environment = relative
      // eslint-disable-next-line import/no-unresolved
      ? await optionalModule(() => import('../../scripts/environment.js')) : null;
    const apiUrl = serviceUrl(api, serviceSite(environment, settings.serviceSite));
    if (canCall(apiUrl)) sources.push(apiUrl);
  }
  if (sheet) sources.push(sheet);
  for (let i = 0; i < sources.length; i += 1) {
    const base = new URL(sources[i], window.location.href).href;
    // eslint-disable-next-line no-await-in-loop
    const items = jsonItems(await loadJson(base))
      .map((item) => (item && typeof item === 'object' ? productFromItem(item, base, settings) : null))
      .filter((product) => product && (product.name.text || product.sku));
    if (items.length) return items;
  }
  return null;
}

/* ---------- wishlist hearts ---------- */

/**
 * The site's shared wishlist (scripts/wishlist.js) when it is there: its hearts, its login and
 * its saving. Elsewhere the hearts only toggle on the page.
 */
function setupWishlist(block, settings) {
  const hearts = () => [...block.querySelectorAll(`.${BLOCK}-wishlist`)];
  if (!hearts().length) return;
  let shared = false;

  block.addEventListener('click', async (event) => {
    const heart = event.target.closest(`.${BLOCK}-wishlist`);
    if (!heart || !block.contains(heart)) return;
    await loadSiteModules();
    if (shared) return; // the shared wishlist handles its own hearts
    heart.setAttribute('aria-pressed', `${heart.getAttribute('aria-pressed') !== 'true'}`);
  });

  whenIdle(async () => {
    const { wishlist } = await loadSiteModules();
    if (!wishlist) return;
    try {
      hearts().forEach((old) => {
        const heart = wishlist.wishlistHeart({
          code: old.dataset.attrSku,
          type: settings.productType,
          name: old.dataset.attrTitle || '',
          price: old.dataset.attrPrice || '',
          className: `${BLOCK}-wishlist`,
        });
        heart.innerHTML = ICON_HEART;
        heart.setAttribute('aria-label', old.getAttribute('aria-label'));
        old.replaceWith(heart);
      });
      wishlist.default(block);
      shared = true;
    } catch (e) {
      // keep the page-only hearts
    }
  });

  // keep every heart of a product in step (the same product may appear twice)
  block.addEventListener('wishlist:change', (event) => {
    const { code, saved } = event.detail || {};
    hearts().filter((heart) => heart.dataset.attrSku === code)
      .forEach((heart) => heart.setAttribute('aria-pressed', `${Boolean(saved)}`));
  });
}

/* ---------- carousel controls (same as price-carousel) ---------- */

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Arrows (desktop) and dots (mobile) share the track's scroll position. */
function setupControls(track, previous, next, dots) {
  const cards = [...track.querySelectorAll(`.${BLOCK}-card`)];
  const step = () => {
    if (!cards.length) return track.clientWidth;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    return cards[0].getBoundingClientRect().width + gap;
  };
  const maxScroll = () => track.scrollWidth - track.clientWidth;
  const scrollToLeft = (left) => {
    track.scrollTo({ left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };
  const update = () => {
    const max = maxScroll();
    previous.disabled = track.scrollLeft <= 1;
    next.disabled = track.scrollLeft >= max - 1;
    let active = Math.round(track.scrollLeft / step());
    if (track.scrollLeft >= max - 1) active = cards.length - 1;
    active = Math.max(0, Math.min(cards.length - 1, active));
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === active);
      if (i === active) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  };
  previous.addEventListener('click', () => scrollToLeft(track.scrollLeft - step()));
  next.addEventListener('click', () => scrollToLeft(track.scrollLeft + step()));
  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => scrollToLeft(Math.min(i * step(), maxScroll())));
  });
  track.addEventListener('scroll', update, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(update).observe(track);
  window.addEventListener('resize', update, { passive: true });
  update();
}

/**
 * Passes the visible page width (without the vertical scrollbar, unlike 100vw)
 * to CSS, so the full-width block ends exactly at the screen edge.
 */
let viewportTracked = false;
function trackViewportWidth() {
  if (viewportTracked) return; // once per page, however many carousels
  viewportTracked = true;
  const root = document.documentElement;
  const update = () => root.style.setProperty(`--${BLOCK}-viewport`, `${root.clientWidth}px`);
  update();
  window.addEventListener('resize', update, { passive: true });
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default async function decorate(block) {
  trackViewportWidth();
  const authored = {};
  const products = [];
  let current = null;
  const currentProduct = () => {
    if (!current) {
      current = { image: null, mobileImage: null };
      products.push(current);
    }
    return current;
  };

  [...block.children].forEach((row) => {
    const type = takeRowLabel(row);
    const img = row.querySelector('img');
    if (type === 'desktopImage') {
      // a Desktop Image row starts a new product (unless it has only a mobile image so far)
      if (!current || current.image) {
        current = { image: null, mobileImage: null };
        products.push(current);
      }
      current.image = img || null;
    } else if (type === 'mobileImage') {
      currentProduct().mobileImage = img || null;
    } else if (type === 'name') {
      currentProduct().name = readName(row);
    } else if (['sku', 'price', 'priceNote', 'maxQty'].includes(type)) {
      currentProduct()[type] = rowText(row);
    } else if (type) {
      authored[type] = rowText(row);
    }
  });

  const settings = blankSettings();
  Object.entries(authored).forEach(([key, value]) => {
    if (value) settings[key] = value;
  });
  settings.newTab = parseNewTab(settings.linkTarget) === true;

  // the products: the JSON source when it gives any, else the product rows
  const loaded = await loadProducts(settings);
  if (loaded) products.splice(0, products.length, ...loaded);

  const band = parseColour(settings.bandColour);
  const bottom = parseColour(settings.bottomColour);
  if (band) {
    block.style.setProperty(`--${BLOCK}-band`, band);
    // title and arrows: dark on a light band, white on a dark one
    block.style.setProperty(`--${BLOCK}-text`, isLight(band, block) ? '#000' : '#fff');
  }
  if (bottom) {
    block.style.setProperty(`--${BLOCK}-bottom`, bottom);
    // product text, stepper and dots sit on the bottom colour
    const light = isLight(bottom, block);
    block.style.setProperty(`--${BLOCK}-bottom-text`, light ? '#000' : '#fff');
    block.style.setProperty(`--${BLOCK}-muted`, light ? '#5c5e61' : '#a2a4a6');
    block.style.setProperty(`--${BLOCK}-dot`, light ? '#c9cacc' : '#fff');
    block.style.setProperty(`--${BLOCK}-dot-active`, light ? '#232426' : '#5c5e61');
  }

  const header = create('div', 'header');
  if (settings.title) {
    const title = create('h2', 'title');
    title.textContent = settings.title;
    header.append(title);
  }

  const controls = create('div', 'controls');
  const previous = create('button', 'arrow', ICON_ARROW);
  previous.classList.add(`${BLOCK}-arrow-previous`);
  previous.type = 'button';
  previous.setAttribute('aria-label', settings.previousLabel);
  const next = create('button', 'arrow', ICON_ARROW);
  next.classList.add(`${BLOCK}-arrow-next`);
  next.type = 'button';
  next.setAttribute('aria-label', settings.nextLabel);
  controls.append(previous, next);
  header.append(controls);

  const track = create('ul', 'track');
  track.setAttribute('tabindex', '0');
  if (settings.title) track.setAttribute('aria-label', settings.title);
  const cardNodes = products.map((data) => buildCard(data, settings));
  track.append(...cardNodes);

  const dotList = create('div', 'dots');
  if (settings.title) dotList.setAttribute('aria-label', settings.title);
  dotList.setAttribute('role', 'group');
  const dots = cardNodes.map((card, i) => {
    const dot = create('button', 'dot');
    dot.type = 'button';
    const label = settings.slideLabel
      ? `${settings.slideLabel} ${i + 1}`
      : card.dataset.name || `${i + 1}`;
    dot.setAttribute('aria-label', label);
    delete card.dataset.name;
    dotList.append(dot);
    return dot;
  });
  if (dots.length < 2) dotList.hidden = true;

  block.replaceChildren(header, track, dotList);
  setupControls(track, previous, next, dots);
  setupCart(block, settings);
  setupWishlist(block, settings);
}
