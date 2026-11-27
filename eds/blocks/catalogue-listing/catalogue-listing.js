/*
** Authoring format **
Catalogue Listing block, 2 columns: label | value. Rows are found by their label, so the order
can change and every row is optional.

Row 1, col 1 → "Main Title"
Row 1, col 2 → page title above the family tabs (e.g. "Colour catalogue for wall paints").
  Empty → no title.

Row 2, col 1 → "Heading"
Row 2, col 2 → title above the grid on the all-colours page (e.g. "All Colours");
  family pages show their tab name instead

The API rows (3, 4 and 5) are paths without a domain (/content/…, /apcolourcatalogue/…); the
block adds the domain from environment.js (www on prod, beta everywhere else).

Row 3, col 1 → "API URL"
Row 3, col 2 → shade listing endpoint (…/shadelisting.shade.json?…). Its selectedShadeFamily
  (all, reds, blues …) picks the page's family tab. Empty → no shades (the "could not be
  loaded" message).

Row 4, col 1 → "Recently viewed API"
Row 4, col 2 → previousShades.json endpoint. Its previousShadeSKUs are shown while the visitor
  has no viewed shades yet. Empty → no recently viewed strip. As on the source, the API is asked
  for 5 viewed shades at a time, newest viewed first (LOAD MORE asks for the next 5), and each
  batch is shown exactly in the API's order, on the all-colours and family pages alike.

Row 5, col 1 → "Quick view closest shade API"
Row 5, col 2 → shadelistingpalette.json endpoint (e.g. /apcolourcatalogue/shadelistingpalette.json
  ?cfType=Shade&language=en). The shade details panel's 8 shades, room photos and texts: a card
  click sends its shade's pageNumber (replacing any authored one); with no language parameter the
  API URL's (row 3) is sent. Empty, or the request fails → the panel shows the clicked shade only.

Row 6, col 1 → "Recently viewed title"
Row 6, col 2 → title of the recently viewed strip (e.g. "Recently Viewed Colours")

Row 7, col 1 → "Promo strip"
Row 7, col 2 → line 1: bar text; link: where the bar goes (its text is used when there is no
  line 1). Full-width bar after the first grid row.

Row 8, col 1 → "Help card"
Row 8, col 2 → image, title, text line(s), CTA. Card in the 4th slot of the 2nd grid row,
  hidden while filters are applied.
  CTA: the last link, or, with no link and 3+ lines, the last line as a button. It opens the
  "Book a FREE Site Visit" form pop-up (as in choose-plan); if the pop-up can't open, a link
  goes to its page and a button scrolls to the page's first form.

Row 9, col 1 → "Banner"
Row 9, col 2 → image 1: desktop (900px+); image 2 (optional): mobile; link: where the banner
  goes. Full width after the 3rd grid row, hidden while filters are applied.

Row 10, col 1 → "Sidebar card"
Row 10, col 2 → image, title, text line(s), CTA, same as the Help card (its CTA opens the same
  form pop-up). Shown below the filters from 900px.

The shade details panel's CTA labels (BUY NOW, SPEAK TO PROFESSIONAL, VIEW IN AP COLOUR APP)
and the code prefix are fixed in catalogue-listing-quickview.js, not authored.
*/

/*
 * Catalogue Listing
 * The colour catalogue listing (source: asianpaints.com/colour-catalogue.html, "shadelisting" and
 * "recentlyViewedShades" components): shade family tabs, a filter sidebar with counts, a grid of
 * shade cards with LOAD MORE, a "Recently Viewed Colours" strip and promo cards placed in the grid.
 *
 * Data: all JSON comes from the endpoints authored in DA (no defaults, no local copies): shades,
 * families and filter facets/counts from the API URL at runtime; the shade details panel's
 * shades from the quick view API, one request per pageNumber on card clicks. Like the source,
 * the grid shows 23 shades first (24 slots with the help card) and 12 more per LOAD MORE; filters
 * are OR within a facet and AND across facets, and an option is disabled when no shown shade has
 * it (as the source, options of a ticked facet too); the help card and banner only show unfiltered.
 * The visitor's viewed shades are kept in the source site's "recentShades" cookie (JSON array of
 * shade codes, newest first, max 50), which this block reads and updates on card clicks.
 *
 * Loading: decorate() renders a shell at once (title, family tabs, filter button, a skeleton grid
 * laid out as the first page, and the recently viewed strip with skeleton cards) and returns
 * without waiting for the API, so the section, the header and the sections below show without
 * the data. The shades and facets fill the shell in when it arrives, and the sidebar card and
 * Back To Top (in the shell but hidden while loading) show then.
 * Shade links (cards, the details panel's BUY NOW) are the API's pageUrl as returned; the quick
 * view API returns content paths (/content/ap/en/home/…), which map to the public page (siteUrl).
 *
 * Shade details: a grid card opens the shade details panel (catalogue-listing-quickview.js,
 * loaded on the first click) instead of the shade page; its BUY NOW links go to the page. A
 * ctrl/cmd/shift click still opens the page, as do the recently viewed cards (as on the source).
 *
 * Wishlist: each card has a heart (scripts/wishlist.js, as in pdp-banner-carousel), saved under
 * type "shades" with the shade code as its SKU. wishlist.js loads alongside the API data, so the
 * block's render doesn't wait on it; without it the cards show no heart.
 *
 * API host: the authored paths get the domain from environment.js: www.asianpaints.com on prod,
 * beta.asianpaints.com on every other host (beta, aem.page, localhost). A full URL is used as
 * authored. When a request fails, the listing shows its "could not be loaded" message and the
 * recently viewed strip is left out.
 */
import { createOptimizedPicture, getMetadata } from '../../scripts/aem.js';
import { BETA_DOMAIN, PROD_DOMAIN, isProdDomain } from '../../scripts/environment.js';

const PAGE_SIZE_ON_LOAD = 23;
const PAGE_SIZE_ON_CLICK = 12;
const RECENT_PAGE_SIZE = 5;
const RECENT_COOKIE = 'recentShades';
const RECENT_MAX = 50;
const WISHLIST_TYPE = 'shades';
const FETCH_TIMEOUT = 20000;
const MOBILE_MEDIA = window.matchMedia('(max-width: 899px)');

// grid slot positions of the promo items, counted in shades (source: renderSwatches): the promo
// strip follows the 1st row, the help card takes the 4th slot of the 2nd row, the banner follows
// the 3rd row (a slot fewer when the help card is in the 2nd)
const ROW_SIZE = 4;
const HELP_CARD_AFTER = ROW_SIZE + 3;
const BANNER_AFTER = ROW_SIZE * 3;

// the source's 8 family tabs; every family has its own listing page, so a two-colour tab links
// each half (and each word of its label) to its own page. `id` is the API's selectedShadeFamily.
const CATALOGUE_PATH = '/colour-catalogue';
const FAMILY_TABS = [
  [{ id: 'all', label: 'All Colours' }],
  [{
    id: 'greys', label: 'Greys', slug: 'grey', colour: '#E2DED6',
  }],
  [{
    id: 'blues', label: 'Blues', slug: 'blue', colour: '#4169E1',
  }],
  [{
    id: 'browns', label: 'Browns', slug: 'brown', colour: '#9C5506',
  }],
  [{
    id: 'reds', label: 'Reds', slug: 'red', colour: '#CB0A00',
  }, {
    id: 'oranges', label: 'Oranges', slug: 'orange', colour: '#FFB800',
  }],
  [{
    id: 'yellows', label: 'Yellows', slug: 'yellow', colour: '#ECE566',
  }, {
    id: 'greens', label: 'Greens', slug: 'green', colour: '#73AF00',
  }],
  [{
    id: 'purples', label: 'Purples', slug: 'purple', colour: '#9C41BB',
  }, {
    id: 'pinks', label: 'Pinks', slug: 'pink', colour: '#FFC0CB',
  }],
  [{
    id: 'whites', label: 'Whites', slug: 'white', colour: '#FFFFFF',
  }, {
    id: 'off whites', label: 'Off Whites', slug: 'off-white', colour: '#F7F0DD',
  }],
];
const familyPath = ({ slug: pageSlug }) => (pageSlug ? `${CATALOGUE_PATH}/${pageSlug}-wall-colours` : CATALOGUE_PATH);
const findFamily = (id) => FAMILY_TABS.flat().find((family) => family.id === id);

const SITE_DOMAIN = window.location.hostname === BETA_DOMAIN ? BETA_DOMAIN : PROD_DOMAIN;
const ASIAN_PAINTS_HOSTS = [PROD_DOMAIN, BETA_DOMAIN, 'asianpaints.com'];
const AEM_CONTENT_ROOT = '/content/ap/en/home';
// prod only on prod, beta everywhere else
const API_ORIGIN = `https://${isProdDomain() ? PROD_DOMAIN : BETA_DOMAIN}`;

let instanceCount = 0;

/* ------------------------------------------------------------------ helpers */

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) return;
    if (key === 'className') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value === true ? '' : value);
  });
  node.append(...children.filter((child) => child !== null && child !== undefined));
  return node;
}

/**
 * Runs `use` with scripts/analytics_1.js, imported on use: scripts.js loads it in the lazy phase,
 * and a static import would hold the block's first render (the LCP section on the all colours
 * page) until its ~100 KB had loaded. Values read from the event or the DOM are taken before.
 * @param {(analytics: object) => void} use
 */
function withAnalytics(use) {
  import('../../scripts/analytics_1.js').then(use).catch(() => {});
}

const toKey = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const titleCase = (value) => value.replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * An authored API URL as a URL object: a path (as authored in DA) gets the environment's domain,
 * a full URL is kept as authored. Null when empty or invalid.
 */
export function apiUrl(authored) {
  if (!authored) return null;
  try {
    return new URL(authored, API_ORIGIN);
  } catch (e) {
    return null;
  }
}

/**
 * Public URL of an Asian Paints page: "/content/ap/en/home/x.html" and www/beta links map to
 * https://<site domain>/x.html (beta only when the page is served from beta); others are kept.
 */
export function siteUrl(href) {
  if (!href) return '';
  const relative = href.startsWith('/') && !href.startsWith('//');
  let url;
  try {
    url = new URL(href, `https://${SITE_DOMAIN}`);
  } catch (e) {
    return href;
  }
  if (!relative && !ASIAN_PAINTS_HOSTS.includes(url.hostname)) return url.href;
  url.protocol = 'https:';
  url.hostname = SITE_DOMAIN;
  if (url.pathname.startsWith(`${AEM_CONTENT_ROOT}/`) || url.pathname === `${AEM_CONTENT_ROOT}.html`) {
    url.pathname = url.pathname.slice(AEM_CONTENT_ROOT.length) || '/';
  }
  return url.href;
}

async function fetchJson(url) {
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------- recently viewed cookie */

function readRecentSkus() {
  const entry = document.cookie.split(';').map((c) => c.trim())
    .find((c) => c.startsWith(`${RECENT_COOKIE}=`));
  if (!entry) return [];
  const raw = entry.slice(RECENT_COOKIE.length + 1);
  try {
    let value = raw;
    try { value = decodeURIComponent(raw); } catch (e) { /* keep raw */ }
    const list = JSON.parse(value);
    return Array.isArray(list) ? list.map((sku) => `${sku}`.trim()).filter(Boolean) : [];
  } catch (e) {
    return [];
  }
}

/** Same format as the source site (recentlyViewedShades clientlib) so both share the history. */
function rememberShade(code) {
  const sku = `${code || ''}`.replace('Colour Code:', '').trim();
  if (!sku) return;
  const list = readRecentSkus().filter((item) => item !== sku);
  list.unshift(sku);
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${RECENT_COOKIE}=${JSON.stringify(list.slice(0, RECENT_MAX))};path=/;expires=${expires}`;
}

/* ----------------------------------------------------------- authored content */

function cellValue(cells) {
  const cell = cells[0];
  if (!cell) return '';
  const text = cell.textContent.trim();
  if (/^https?:\/\//.test(text)) return text;
  const link = cell.querySelector('a');
  return link ? link.href : text;
}

/** Images, text lines and links of the content cell(s) of a promo row. */
function parseContent(cells) {
  const images = [];
  const texts = [];
  const links = [];
  cells.forEach((cell) => {
    cell.querySelectorAll('img').forEach((img) => images.push(img));
    cell.querySelectorAll('a').forEach((a) => links.push(a));
    const blocks = [...cell.children].filter((child) => !['PICTURE', 'IMG', 'BR'].includes(child.tagName));
    const lines = blocks.length ? blocks : [cell];
    lines.forEach((line) => {
      const linkText = [...line.querySelectorAll('a')].map((a) => a.textContent.trim()).join('');
      const text = line.textContent.trim();
      if (text && text !== linkText) texts.push(text);
    });
  });
  return { images, texts, links };
}

function readConfig(block) {
  const config = {
    mainTitle: '',
    heading: '',
    api: '',
    recentApi: '',
    paletteApi: '',
    recentTitle: 'Recently Viewed Colours',
    promos: {},
  };
  [...block.children].forEach((row) => {
    const [labelCell, ...cells] = [...row.children];
    if (!labelCell) return;
    const key = toKey(labelCell.textContent);
    if (key === 'main title') config.mainTitle = cells[0]?.textContent.trim() || '';
    else if (key === 'heading') config.heading = cellValue(cells);
    else if (key === 'api url') config.api = cellValue(cells);
    else if (key === 'recently viewed api') config.recentApi = cellValue(cells);
    else if (key === 'quick view closest shade api') config.paletteApi = cellValue(cells);
    else if (key === 'recently viewed title') config.recentTitle = cellValue(cells) || config.recentTitle;
    else if (['promo strip', 'help card', 'banner', 'sidebar card'].includes(key)) {
      config.promos[key] = parseContent(cells);
    }
  });
  return config;
}

function picture(img, width = '500') {
  if (!img) return null;
  return createOptimizedPicture(img.src, img.alt || '', false, [{ width }]);
}

/** Scrolls to the page's first form (outside the block). False when the page has none. */
function goToPageForm() {
  const form = [...document.querySelectorAll('main .form.block, main form')]
    .find((f) => !f.closest('.catalogue-listing'));
  if (!form) return false;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
  const offset = MOBILE_MEDIA.matches ? 100 : 100 + 40 * zoom;
  window.scrollTo({
    top: form.getBoundingClientRect().top + window.scrollY - offset,
    behavior: reduce ? 'auto' : 'smooth',
  });
  if (!form.hasAttribute('tabindex')) form.setAttribute('tabindex', '-1');
  form.focus({ preventScroll: true });
  return true;
}

function scrollToForm(event) {
  if (goToPageForm()) event.preventDefault();
}

// START FORM POPUP: like choose-plan, the help card and sidebar card CTAs and the shade details
// panel's SPEAK TO PROFESSIONAL open the "Book a FREE Site Visit" lead form pop-up: the form page
// of the header CTA (data-modal-path), else the "site-visit-modal" page metadata, else the stg
// form page, in the site's modal block (loaded on the first click). If the pop-up can't open, a
// link goes to its page and a button scrolls to the page's first form.
const DEFAULT_SITE_VISIT_MODAL = '/eds/forms/book-free-site-visit';

async function openFormPopup(action) {
  const modalPath = document.querySelector('.trigger-book-free-site-visit-modal[data-modal-path]')?.dataset.modalPath
    || getMetadata('site-visit-modal') || DEFAULT_SITE_VISIT_MODAL;
  try {
    const { openModal } = await import('../modal/modal.js');
    await openModal(modalPath);
  } catch (e) {
    const href = action.getAttribute('href');
    if (href && !href.startsWith('#')) window.location.href = action.href;
    else goToPageForm();
    return;
  }
  const cardTitle = (action.closest('.catalogue-listing-aside-card, .catalogue-listing-help-card')
    ?.querySelector('.catalogue-listing-aside-card-title, .catalogue-listing-help-card-title')
    ?.textContent || '').trim();
  withAnalytics(({ getAdobeBasePayload }) => {
    const dl = getAdobeBasePayload();
    dl.event = 'exit_intent_impression';
    dl.eventInfo.location = cardTitle;
    window.adobeDataLayer = window.adobeDataLayer || [];
    window.adobeDataLayer.push(dl);
  });
}

function opensFormPopup(action) {
  action.setAttribute('aria-haspopup', 'dialog');
  action.addEventListener('click', (event) => {
    event.preventDefault();
    openFormPopup(action);
  });
}
// END FORM POPUP

/**
 * The authored CTA: the last link, or with no link and `minLines`+ text lines, the last line as a
 * button. It scrolls to the page's first form (a link only when it is a "#…" link), or with
 * `popup`, opens the form pop-up.
 */
function cta(content, className, minLines = 3, popup = false) {
  const link = content.links[content.links.length - 1];
  let action = null;
  if (link) {
    const href = link.getAttribute('href') || '';
    action = el('a', { className, href: href.startsWith('#') ? href : siteUrl(link.href) }, link.textContent.trim());
    if (href.startsWith('#') && !popup) action.addEventListener('click', scrollToForm);
  } else if (content.texts.length >= minLines) {
    action = el('button', { type: 'button', className }, content.texts[content.texts.length - 1]);
    if (!popup) action.addEventListener('click', scrollToForm);
  }
  if (action && popup) opensFormPopup(action);
  return action;
}

function buildInfoCard(content, className, popup = false) {
  if (!content) return null;
  const action = cta(content, 'catalogue-listing-button', 3, popup);
  const texts = !content.links.length && content.texts.length >= 3
    ? content.texts.slice(0, -1) : content.texts;
  const [title, ...rest] = texts;

  if (action) {
    action.addEventListener('click', () => {
      const ctaText = action.textContent.trim();
      withAnalytics(({ pushAdobeCalculatorEvents }) => pushAdobeCalculatorEvents({
        event: 'custom_cta_click',
        cta: ctaText,
        parentTitle: title || '',
      }));
    });
  }

  const card = el(
    'div',
    { className },
    content.images[0] ? el('div', { className: `${className}-image` }, picture(content.images[0], '400')) : null,
    el(
      'div',
      { className: `${className}-body` },
      title ? el('p', { className: `${className}-title` }, title) : null,
      ...rest.map((text) => el('p', { className: `${className}-text` }, text)),
      action,
    ),
  );
  return card;
}

function buildPromoStrip(content) {
  if (!content) return null;
  const link = content.links[0];
  const text = content.texts[0] || link?.textContent.trim() || '';
  if (!text) return null;
  const label = el('span', { className: 'catalogue-listing-promo-text' }, text);
  const arrow = el('span', { className: 'catalogue-listing-promo-arrow', 'aria-hidden': 'true' });
  if (!link) return el('div', { className: 'catalogue-listing-promo' }, label, arrow);

  const promoLink = el('a', {
    className: 'catalogue-listing-promo',
    href: siteUrl(link.href),
    'aria-label': text,
  }, label, arrow);

  promoLink.addEventListener('click', () => {
    const payload = {
      event: 'custom_cta_click',
      cta: promoLink.getAttribute('aria-label') || '',
      destinationUrl: promoLink.href || '',
    };
    withAnalytics(({ pushAdobeCalculatorEvents }) => pushAdobeCalculatorEvents(payload));
  });

  return promoLink;
}

function buildBanner(content) {
  if (!content || !content.images.length) return null;
  const [desktop, mobile] = content.images;
  const pic = createOptimizedPicture(desktop.src, desktop.alt || '', false, [
    { media: '(min-width: 900px)', width: '1200' },
    { width: '750' },
  ]);
  if (mobile) {
    const small = createOptimizedPicture(mobile.src, '', false, [{ width: '750' }]);
    pic.querySelectorAll('source:not([media])').forEach((s) => s.remove());
    small.querySelectorAll('source').forEach((s) => pic.querySelector('img').before(s));
    pic.querySelector('img').src = small.querySelector('img').src;
  }
  const link = content.links[0];
  if (!link) return el('div', { className: 'catalogue-listing-banner' }, pic);
  const label = link.textContent.trim() || content.texts[0] || desktop.alt || '';

  const bannerLink = el(
    'a',
    { href: siteUrl(link.href), 'aria-label': label || null },
    pic,
  );

  bannerLink.addEventListener('click', () => {
    const payload = {
      event: 'custom_cta_click',
      cta: bannerLink.getAttribute('aria-label') || '',
      destinationUrl: bannerLink.href || '',
    };
    withAnalytics(({ pushAdobeCalculatorEvents }) => pushAdobeCalculatorEvents(payload));
  });

  return el(
    'div',
    { className: 'catalogue-listing-banner' },
    bannerLink,
  );
}

/* ---------------------------------------------------------------- shade data */

/** The page's shade family: the selectedShadeFamily of its API URL ("all" on the main page). */
function pageFamily(api) {
  const id = (apiUrl(api)?.searchParams.get('selectedShadeFamily') || '').toLowerCase().trim();
  return findFamily(id) ? id : 'all';
}

/** facet -> option -> count for a list of shades, both sorted alphabetically (as the source). */
function facetCounts(shades) {
  const facets = {};
  shades.forEach((shade) => {
    Object.entries(shade.filterTitle || {}).forEach(([facet, values]) => {
      const name = facet.toLowerCase();
      facets[name] = facets[name] || {};
      (Array.isArray(values) ? values : [values]).forEach((value) => {
        const option = `${value}`.toLowerCase();
        facets[name][option] = (facets[name][option] || 0) + 1;
      });
    });
  });
  return Object.keys(facets).sort().map((facet) => ({
    facet,
    options: Object.keys(facets[facet]).sort().map((option) => ({
      option, count: facets[facet][option],
    })),
  }));
}

function shadeValues(shade, facet) {
  const entry = Object.entries(shade.filterTitle || {})
    .find(([key]) => key.toLowerCase() === facet);
  if (!entry) return [];
  return (Array.isArray(entry[1]) ? entry[1] : [entry[1]]).map((v) => `${v}`.toLowerCase());
}

/** OR within a facet, AND across facets. */
function matches(shade, applied) {
  return Object.entries(applied).every(([facet, options]) => {
    if (!options.size) return true;
    const values = shadeValues(shade, facet);
    return [...options].some((option) => values.includes(option));
  });
}

/**
 * "?f=room:bedroom,kitchen&tonality:light" (the source page's shareable filter URL). The source's
 * "Shade:<family>" part is ignored: each family has its own page.
 */
function readUrlFilters() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('f');
  if (!raw) return null;
  const result = { applied: {} };
  raw.split('&').forEach((part) => {
    const [facet, values] = part.split(':');
    if (!facet || !values || facet.toLowerCase() === 'shade') return;
    const list = values.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
    result.applied[facet.toLowerCase()] = new Set(list);
  });
  return result;
}

function writeUrlFilters(state) {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('f')) return;
  const parts = [];
  Object.entries(state.applied).forEach(([facet, options]) => {
    if (options.size) parts.push(`${facet}:${[...options].join(',')}`);
  });
  if (parts.length) params.set('f', parts.join('&'));
  else params.delete('f');
  const query = params.toString();
  window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
}

/* ---------------------------------------------------------------- rendering */

/**
 * A shade card. With the wishlist loaded, its heart sits beside the card's link (a button can't
 * sit inside a link) and takes the shade code as its SKU. With `onOpen` (grid cards), a click
 * opens the shade details panel instead of the page; a ctrl/cmd/shift click still opens the page.
 * @param {object} shade
 * @param {{ heart: Function }|null} wishlist
 * @param {(shade: object, link: Element) => void} [onOpen]
 */
function buildCard(shade, wishlist, onOpen) {
  const name = shade.entityName || '';
  const code = shade.entityCode || '';
  const link = el(
    'a',
    {
      className: 'catalogue-listing-card',
      href: shade.pageUrl || null,
      'aria-label': `${titleCase(name)}${code ? `, colour code ${code}` : ''}`,
    },
    el('span', { className: 'catalogue-listing-swatch', style: `background-color: ${shade.shadeHexCode || '#eee'}` }),
    el(
      'span',
      { className: 'catalogue-listing-card-desc' },
      el('span', { className: 'catalogue-listing-card-name', title: name }, name),
      el('span', { className: 'catalogue-listing-card-code' }, code),
    ),
  );
  link.addEventListener('click', (event) => {
    rememberShade(code);

    const parentTitle = link.closest('.catalogue-listing-recent')
      ?.querySelector('.catalogue-listing-recent-title')
      ?.textContent.trim()
      || link.closest('.catalogue-listing-panel')
        ?.querySelector('.catalogue-listing-panel-title')
        ?.textContent.trim()
      || '';

    withAnalytics(({ pushAdobeCalculatorEvents }) => pushAdobeCalculatorEvents({
      event: 'shades_click',
      shadeName: name,
      shadeCode: code,
      destinationUrl: shade.pageUrl || '',
      parentTitle,
    }));

    if (!onOpen || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey
      || event.altKey) return;
    event.preventDefault();
    onOpen(shade, link);
  });
  if (onOpen) link.setAttribute('aria-expanded', 'false');
  const item = el('li', { className: 'catalogue-listing-item' }, link);
  if (wishlist && code) {
    item.append(wishlist.heart({
      code, type: WISHLIST_TYPE, name, className: 'catalogue-listing-wishlist',
    }));
  }
  return item;
}

/**
 * The shared wishlist for this block: hearts' state and clicks (scripts/wishlist.js). Resolves
 * to { heart, refresh } (refresh paints hearts added since), or null if it can't be loaded.
 */
function loadWishlist(block) {
  return import('../../scripts/wishlist.js')
    .then(({ default: initWishlist, wishlistHeart }) => ({
      heart: wishlistHeart,
      refresh: initWishlist(block).refresh,
    }))
    .catch(() => null);
}

function skeletonItems(count) {
  return Array.from({ length: count }, () => el(
    'li',
    { className: 'catalogue-listing-item catalogue-listing-skeleton', 'aria-hidden': 'true' },
    el('span', { className: 'catalogue-listing-swatch' }),
    el('span', { className: 'catalogue-listing-card-desc' }),
  ));
}

/**
 * The 8 family tabs as links to the family pages. The chip (one half per family) is a pointer
 * shortcut; keyboard and screen reader users get the label links (one per family word).
 */
function buildFamilyTabs(current) {
  const list = el('ul', { className: 'catalogue-listing-families', 'aria-label': 'Colour families' });
  FAMILY_TABS.forEach((families) => {
    const active = families.some(({ id }) => id === current);
    const chip = el('span', { className: 'catalogue-listing-chip' });
    const name = el('span', { className: 'catalogue-listing-family-name' });
    families.forEach((family, i) => {
      const isCurrent = family.id === current;

      // "#RRGGBB" as "rgb(r, g, b)"
      const hexToRgb = (hex) => `rgb(${[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ')})`;

      const chipLink = el('a', {
        className: `catalogue-listing-chip-part${isCurrent ? ' is-current' : ''}`,
        href: familyPath(family),
        style: family.colour ? `background-color: ${family.colour}` : null,
        tabindex: '-1',
        'aria-hidden': 'true',
      });

      chipLink.addEventListener('click', () => {
        withAnalytics(({ pushAdobeCalculatorEvents }) => pushAdobeCalculatorEvents({
          event: 'colour_tab_click',
          cta: family.label,
          destinationUrl: `${window.location.origin}${familyPath(family)}`,
          detail: family.colour ? hexToRgb(family.colour) : '',
        }));
      });
      chip.append(chipLink);

      if (i) name.append(' & ');
      name.append(el('a', {
        href: familyPath(family),
        'aria-current': isCurrent ? 'page' : null,
      }, family.label));
    });
    list.append(el('li', {}, el(
      'div',
      {
        className: `catalogue-listing-family${active ? ' is-active' : ''}`,
        'data-family': families[0].id,
      },
      chip,
      name,
    )));
  });
  return list;
}

/* ------------------------------------------------------------ recently viewed */

/**
 * The recently viewed strip, or null when there are no shade codes to show. It is returned at
 * once with skeleton cards, as it sits above the grid (filling it in later would push the grid
 * down); the first batch's cards replace them, and if that request fails or returns no shades
 * the strip is removed.
 */
function buildRecent(config, uid, wishlistReady) {
  const authored = apiUrl(config.recentApi);
  if (!authored) return null;
  let skus = readRecentSkus();
  const fromCookie = skus.length > 0;
  if (!fromCookie) {
    try {
      skus = JSON.parse(authored.searchParams.get('previousShadeSKUs') || '[]');
    } catch (e) {
      skus = [];
    }
  }
  if (!Array.isArray(skus) || !skus.length) return null;

  // As on the source: the API keeps the order of up to 5 codes but re-sorts more (by tone, then
  // page), so it is asked for RECENT_PAGE_SIZE (5) codes at a time, newest viewed first, and LOAD
  // MORE asks for the next ones. Each batch is shown exactly in the API's order, on every page.
  let requested = 0;
  const fetchBatch = async () => {
    const batch = skus.slice(requested, requested + RECENT_PAGE_SIZE);
    const url = new URL(authored);
    url.searchParams.set('previousShadeSKUs', JSON.stringify(batch));
    url.searchParams.set('swatchesOnLoad', `${batch.length}`);
    const data = await fetchJson(url.href);
    if (!data) return null; // failed: the next LOAD MORE asks for the same batch again
    requested += batch.length;
    return Array.isArray(data.previousShades) ? data.previousShades : [];
  };

  const titleId = `catalogue-listing-recent-${uid}`;
  const list = el(
    'ul',
    { className: 'catalogue-listing-recent-list', 'aria-busy': 'true' },
    ...skeletonItems(Math.min(RECENT_PAGE_SIZE, skus.length)),
  );
  const section = el(
    'section',
    { className: 'catalogue-listing-recent', 'aria-labelledby': titleId },
    el('h2', { className: 'catalogue-listing-recent-title', id: titleId }, config.recentTitle),
    list,
  );
  // whether LOAD MORE shows is known from the codes (more than one batch); it is disabled until
  // the first batch is in
  const more = el('button', {
    type: 'button', disabled: true, hidden: skus.length <= RECENT_PAGE_SIZE,
  }, 'LOAD MORE');
  let wishlist = null;
  const show = (batch) => {
    list.append(...batch.map((shade) => buildCard(shade, wishlist)));
    wishlist?.refresh();
    more.hidden = requested >= skus.length;
  };
  let loading = false;
  const showMore = async () => {
    if (loading) return;
    loading = true;
    const batch = await fetchBatch();
    loading = false;
    if (batch) show(batch);
  };
  more.addEventListener('click', () => {
    const payload = {
      event: 'custom_cta_click',
      cta: more.innerText || 'Load More',
      parentTitle: section.querySelector('.catalogue-listing-recent-title')?.textContent.trim() || '',
    };
    withAnalytics(({ pushAdobeCtaClickEvent }) => pushAdobeCtaClickEvent(payload));

    showMore();
  });
  section.append(el('div', { className: 'catalogue-listing-more' }, more));

  Promise.all([fetchBatch(), wishlistReady]).then(([shades, hearts]) => {
    if (!shades?.length) {
      section.remove();
      return;
    }
    wishlist = hearts;
    list.removeAttribute('aria-busy');
    list.replaceChildren();
    more.disabled = false;
    show(shades);
  });
  return section;
}

/* ------------------------------------------------------- shade details palette */

/**
 * The shade details panel's shades for a pageNumber, from the "Quick view closest shade API" row
 * (as the source's quick view: cfType and language as authored, pageNumber of the clicked shade;
 * no language → the API URL's). Resolves to the shades with public page links, or null (no row,
 * no pageNumber, failed request). One request per pageNumber; a failed one is tried again.
 */
function paletteLoader(config) {
  const authored = apiUrl(config.paletteApi);
  if (authored && !authored.searchParams.has('language')) {
    const language = apiUrl(config.api)?.searchParams.get('language');
    if (language) authored.searchParams.set('language', language);
  }
  const requests = new Map();
  return (pageNumber) => {
    const page = `${pageNumber ?? ''}`.trim();
    if (!authored || !page) return Promise.resolve(null);
    if (!requests.has(page)) {
      const url = new URL(authored);
      url.searchParams.set('pageNumber', page);
      requests.set(page, fetchJson(url.href).then((data) => {
        const shades = Array.isArray(data?.shadepalette) ? data.shadepalette : [];
        if (!shades.length) {
          requests.delete(page);
          return null;
        }
        return shades.map((shade) => ({ ...shade, pageUrl: siteUrl(shade.pageUrl) }));
      }));
    }
    return requests.get(page);
  };
}

function getAppliedFiltersString(applied, filterOrder) {
  return filterOrder
    .filter((facet) => applied[facet]?.size)
    .map((facet) => `${facet} : ${[...applied[facet]].join('|')}`)
    .join(' || ');
}

/* --------------------------------------------------------------------- block */

/**
 * Renders the block's shell at once and returns without waiting for the shade API, so neither
 * its section nor the rest of the page (header, the sections below, footer) waits for the data;
 * the shades fill the shell in when they arrive.
 * @param {Element} block The block element
 */
export default function decorate(block) {
  instanceCount += 1;
  const uid = instanceCount;
  const config = readConfig(block);
  const { promos } = config;

  // requested first; the shades fill the shell once both are in (end of this function).
  // The wishlist hearts load alongside the data, not before the block can ask for it.
  const shadesReady = fetchJson(apiUrl(config.api)?.href);
  const wishlistReady = loadWishlist(block);

  const family = pageFamily(config.api);
  const state = {
    pool: [],
    // a shared filter link's filters (?f=…), applied to the shades when they arrive
    applied: readUrlFilters()?.applied || {},
    filtered: [],
    filterOrder: [],
    shown: 0,
  };
  const isFiltered = () => Object.values(state.applied).some((set) => set.size);
  let wishlist = null; // set with the shades

  const promoStrip = buildPromoStrip(promos['promo strip']);
  const helpCard = buildInfoCard(promos['help card'], 'catalogue-listing-help-card', true);
  const banner = buildBanner(promos.banner);
  const bannerAfter = BANNER_AFTER - (helpCard ? 1 : 0);

  /**
   * Grid items for shade items (cards, or the shell's skeletons) from shade position `start`,
   * with the promo items in their slots, as on the source: the promo strip after the 1st row;
   * unfiltered, the help card in the 2nd row and the banner after the 3rd; filtered, the banner
   * first. `help` / `banners` false leave those out.
   */
  const withPromos = (shadeItems, start, { help = true, banners = true } = {}) => {
    const items = [];
    if (banners && isFiltered() && banner && start === 0) {
      items.push(el('li', { className: 'catalogue-listing-wide catalogue-listing-wide-top' }, banner));
    }
    shadeItems.forEach((item, i) => {
      const position = start + i; // number of shades already placed before this one
      if (promoStrip && position === ROW_SIZE) items.push(el('li', { className: 'catalogue-listing-wide' }, promoStrip));
      if (help && !isFiltered() && helpCard && position === HELP_CARD_AFTER) {
        items.push(el('li', { className: 'catalogue-listing-item catalogue-listing-help' }, helpCard));
      }
      if (banners && !isFiltered() && banner && position === bannerAfter) {
        items.push(el('li', { className: 'catalogue-listing-wide' }, banner));
      }
      items.push(item);
    });
    return items;
  };

  // ---- shell, rendered before the data
  // page title: an h2, as the page keeps its own (screen-reader) h1, like the source
  const mainTitle = config.mainTitle
    ? el('h2', { className: 'catalogue-listing-title' }, config.mainTitle) : null;
  const familiesWrap = el('div', { className: 'catalogue-listing-families-wrap' }, buildFamilyTabs(family));
  const familyTab = FAMILY_TABS.find((families) => families.some(({ id }) => id === family));
  const title = family === 'all'
    ? (config.heading || 'All Colours')
    : familyTab?.map(({ label }) => label).join(' & ') || '';
  const panelTitle = el('h2', { className: 'catalogue-listing-panel-title' }, title);
  // The skeleton grid is the first page's layout (see applyFilters) with placeholder shades, so
  // nothing in view moves when the shades replace them. Its only image is the help card's, from
  // 900px, where that is the LCP (preloaded by pre-load-image.js). On phones the title is the LCP
  // and the shell has no image, as the eager phase (scripts.js) shows the LCP section only once
  // its first image has loaded: the help card (below the fold there) comes with the shades, and
  // so does the banner on every screen.
  const shellHelp = !!helpCard && !isFiltered() && !MOBILE_MEDIA.matches;
  const grid = el(
    'ul',
    { className: 'catalogue-listing-grid', 'aria-busy': 'true' },
    ...withPromos(skeletonItems(PAGE_SIZE_ON_LOAD + (shellHelp ? 0 : 1)), 0, {
      help: shellHelp, banners: false,
    }),
  );
  const status = el('p', { className: 'catalogue-listing-status', role: 'status' });
  const loadMore = el('button', { type: 'button', hidden: true }, 'LOAD MORE');
  const panel = el(
    'div',
    { className: 'catalogue-listing-panel' },
    panelTitle,
    grid,
    status,
    el('div', { className: 'catalogue-listing-more' }, loadMore),
  );

  const drawerId = `catalogue-listing-filters-${uid}`;
  // enabled with the shades: until then there are no filters to open
  const filterToggle = el('button', {
    type: 'button',
    className: 'catalogue-listing-filter-toggle',
    'aria-expanded': 'false',
    'aria-controls': drawerId,
    disabled: true,
  }, 'FILTER BY');
  const facetList = el('div', { className: 'catalogue-listing-facets' });
  const clearBtn = el('button', { type: 'button', className: 'catalogue-listing-button catalogue-listing-button-secondary' }, 'Clear');
  const applyBtn = el('button', { type: 'button', className: 'catalogue-listing-button' }, 'APPLY');
  const drawer = el(
    'div',
    {
      className: 'catalogue-listing-drawer', id: drawerId, role: 'group', 'aria-label': 'Filters',
    },
    facetList,
    el('div', { className: 'catalogue-listing-drawer-actions' }, clearBtn, applyBtn),
  );
  const filters = el('div', { className: 'catalogue-listing-filters' }, filterToggle, drawer);

  const sidebarCard = buildInfoCard(promos['sidebar card'], 'catalogue-listing-aside-card', true);
  const backToTop = el('a', { className: 'catalogue-listing-top', href: '#' }, 'Back To Top');
  backToTop.addEventListener('click', (event) => {
    event.preventDefault();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const label = backToTop.textContent.trim();
    withAnalytics(({ pushAdobeCalculatorEvents }) => pushAdobeCalculatorEvents({ event: 'jumplink', cta: label }));
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  });
  // The aside (sidebar card, Back To Top) is in the shell, as an Adobe Target activity replaces
  // its content, but hidden until the shades are in (.is-loading): from 900px the facets fill in
  // above it then. The card's image is added then too, out of the eager phase's wait (see grid).
  const sidebarImage = sidebarCard?.querySelector('.catalogue-listing-aside-card-image');
  sidebarImage?.remove();
  const aside = el('div', { className: 'catalogue-listing-aside' }, sidebarCard, backToTop);
  // recently viewed: independent of the listing request, its skeleton shows at once
  const recentSlot = el('div', { className: 'catalogue-listing-recent-slot' }, buildRecent(config, uid, wishlistReady));

  const body = el(
    'div',
    { className: 'catalogue-listing-body' },
    recentSlot,
    el('div', { className: 'catalogue-listing-sidebar' }, filters, aside),
    panel,
  );
  block.classList.add('is-loading');
  block.replaceChildren(...[mainTitle, familiesWrap, body].filter(Boolean));

  // ---- mobile filter drawer
  const setDrawer = (open) => {
    const wasOpen = drawer.classList.contains('is-open');
    drawer.classList.toggle('is-open', open);
    filterToggle.setAttribute('aria-expanded', `${open}`);
    document.documentElement.classList.toggle('catalogue-listing-no-scroll', open && MOBILE_MEDIA.matches);
    if (open) drawer.querySelector('input, button')?.focus();
    else if (wasOpen && MOBILE_MEDIA.matches) filterToggle.focus();
  };
  filterToggle.addEventListener('click', () => setDrawer(!drawer.classList.contains('is-open')));
  applyBtn.addEventListener('click', () => setDrawer(false));
  drawer.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && drawer.classList.contains('is-open')) setDrawer(false);
  });
  MOBILE_MEDIA.addEventListener('change', () => setDrawer(false));

  // ---- shade details panel: its module loads on the first card click; if it can't, the card
  // goes to the shade page as before. Its shades are requested on the click, alongside.
  let quickView = null;
  let quickViewReady = null;
  const loadPalette = paletteLoader(config);
  const openShade = async (shade, link) => {
    const palette = loadPalette(shade.pageNumber);
    quickViewReady = quickViewReady || import('./catalogue-listing-quickview.js')
      .then(({ default: createQuickView }) => {
        quickView = createQuickView({
          wishlist,
          wishlistType: WISHLIST_TYPE,
          helpers: {
            el, rememberShade, cta, titleCase, siteUrl,
          },
        });
        return quickView;
      })
      .catch(() => null);
    const details = await quickViewReady;
    if (details) details.toggle(shade, link, palette);
    else window.location.href = link.href;
  };

  const renderMore = (count) => {
    const start = state.shown;
    const next = state.filtered.slice(start, start + count);
    const items = withPromos(next.map((shade) => buildCard(shade, wishlist, openShade)), start);
    state.shown += next.length;
    // a short list still gets the promo strip after it (as on the source)
    const allShown = state.shown === state.filtered.length;
    if (promoStrip && start === 0 && allShown && state.shown <= ROW_SIZE) {
      items.push(el('li', { className: 'catalogue-listing-wide' }, promoStrip));
    }
    grid.append(...items);
    wishlist?.refresh();
    loadMore.hidden = state.shown >= state.filtered.length;
    status.classList.remove('is-message');
    status.textContent = `Showing ${state.shown} of ${state.filtered.length} colours`;
  };

  // as the source: an option is enabled only when a shown shade has it, options of a ticked group
  // too (ticking Dark disables Light and Medium). Ticked options stay enabled so they can be
  // unticked; with no shade shown, every option is enabled.
  const updateOptions = () => {
    const shown = state.filtered;
    const present = new Set();
    shown.forEach((shade) => Object.keys(shade.filterTitle || {}).forEach((key) => {
      const facet = key.toLowerCase();
      shadeValues(shade, facet).forEach((option) => present.add(`${facet}:${option}`));
    }));
    facetList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      const { facet, option } = input.dataset;
      const available = input.checked || !shown.length || present.has(`${facet}:${option}`);
      input.disabled = !available;
      input.closest('label').classList.toggle('is-disabled', !available);
    });
  };

  const applyFilters = () => {
    const { pool } = state;
    state.filtered = isFiltered() ? pool.filter((shade) => matches(shade, state.applied)) : pool;
    state.shown = 0;
    quickView?.close(false);
    grid.replaceChildren();
    if (!state.filtered.length) {
      status.classList.add('is-message');
      status.textContent = 'No colours match the selected filters.';
      loadMore.hidden = true;
    } else {
      // 23 shades + the help card fill 6 rows; without the card, a full 24
      renderMore(helpCard && !isFiltered() ? PAGE_SIZE_ON_LOAD : PAGE_SIZE_ON_LOAD + 1);
    }
    updateOptions();
    writeUrlFilters(state);
  };

  const renderFacets = () => {
    const facets = facetCounts(state.pool);
    filters.hidden = !facets.length;
    facetList.replaceChildren(...facets.map(({ facet, options }) => {
      const optionsId = `${drawerId}-${slug(facet)}`;
      const toggle = el(
        'button',
        {
          type: 'button', className: 'catalogue-listing-facet-title', 'aria-expanded': 'true', 'aria-controls': optionsId,
        },
        facet.toUpperCase(),
      );
      const list = el('ul', { className: 'catalogue-listing-facet-options', id: optionsId });
      options.forEach(({ option, count }) => {
        const input = el('input', {
          type: 'checkbox',
          className: 'catalogue-listing-checkbox',
          'data-facet': facet,
          'data-option': option,
          value: option,
          checked: state.applied[facet]?.has(option),
        });
        input.addEventListener('change', () => {
          state.applied[facet] = state.applied[facet] || new Set();

          if (input.checked) {
            state.applied[facet].add(option);

            if (!state.filterOrder.includes(facet)) {
              state.filterOrder.push(facet);
            }

            const filterString = getAppliedFiltersString(
              state.applied,
              state.filterOrder,
            );

            withAnalytics(({ pushAdobeCalculatorEvents }) => pushAdobeCalculatorEvents({
              event: 'filter_click',
              filter: filterString,
            }));
          } else {
            state.applied[facet].delete(option);

            if (!state.applied[facet].size) {
              delete state.applied[facet];
              state.filterOrder = state.filterOrder.filter((f) => f !== facet);
            }
          }

          applyFilters();
        });
        list.append(el(
          'li',
          {},
          el('label', { className: 'catalogue-listing-option' }, input, el('span', {}, `${option} (${count})`)),
        ));
      });
      toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', `${open}`);
        list.hidden = !open;
      });
      return el('div', { className: 'catalogue-listing-facet' }, toggle, list);
    }));
  };

  clearBtn.addEventListener('click', () => {
    state.applied = {};
    facetList.querySelectorAll('input[type="checkbox"]').forEach((input) => { input.checked = false; });
    applyFilters();
    // as on the source, Clear also closes the mobile filter pop-up (like Apply)
    setDrawer(false);
  });

  loadMore.addEventListener('click', () => {
    const first = state.shown;
    const payload = {
      event: 'custom_cta_click',
      cta: loadMore.innerText || 'Load More',
      parentTitle: panelTitle.textContent.trim(),
    };
    withAnalytics(({ pushAdobeCtaClickEvent }) => pushAdobeCtaClickEvent(payload));

    renderMore(PAGE_SIZE_ON_CLICK);
    // keep keyboard users in place: focus the first newly added card
    grid.querySelectorAll('.catalogue-listing-card')[first]?.focus({ preventScroll: true });
  });

  // ---- listing data: not awaited (decorate() has returned by then); the shades replace the
  // skeletons in the same layout, the facets fill in and the aside shows
  Promise.all([shadesReady, wishlistReady]).then(([data, hearts]) => {
    wishlist = hearts;
    const shades = Array.isArray(data?.shade) ? data.shade : [];
    grid.removeAttribute('aria-busy');
    if (sidebarImage) sidebarCard.prepend(sidebarImage);
    block.classList.remove('is-loading');
    if (!shades.length) {
      grid.replaceChildren();
      block.classList.add('is-error');
      status.classList.add('is-message');
      status.textContent = 'Colours could not be loaded right now. Please try again later.';
      filters.hidden = true;
      return;
    }
    state.pool = shades;
    filterToggle.disabled = false;
    renderFacets();
    applyFilters();
  });
}
