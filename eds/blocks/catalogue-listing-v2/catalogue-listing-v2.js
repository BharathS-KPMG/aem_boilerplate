/*
** Authoring format **
Catalogue Listing v2 block, 2 columns: label | value. Rows are found by their label, so the order
can change and every row is optional.

"Main Title" → the title in the filter bar, an h2 (the page keeps its own h1), e.g.
  "Colour catalogue". Empty → no title.

"Show Fandeck" → "true" puts the Catalogue | Fandeck toggle in the filter bar, left of the top
  filter chips, with the breadcrumb and title on a row of their own above. Fandeck shows the
  fandeck block of the page in place of the catalogue, without changing the URL: its title, its
  search (right of the breadcrumb) and its colour family chips (beside the toggle) take the bar's
  title and chips' place (scripts/catalogue-views.js). No fandeck block → the toggle only switches.
  Empty, no row or anything else → false: no toggle.

"API URL" → colourCatalogue.json endpoint, e.g.
  /apcolourcatalogue/colourCatalogue.json?shadeFamilyName=all. Its shadeFamilyName decides what
  the colour picker filters by, as on the source: "all" → the picked colour's shade family; a
  family page → the picked colour's page (pageNumber). Empty, or the request fails → the
  "No Results Found" panel.

"Recently viewed API" → previousShades.json endpoint. Empty → no recently viewed strip. The
  visitor's viewed shades (the site's recentShades cookie, shared with catalogue-listing) are
  asked for 5 at a time, newest first, and shown in the API's order; with none viewed, the
  authored previousShadeSKUs are shown.

"Recently viewed title" → title of that strip.

"Quick view closest shade API" → shadelistingpalette.json endpoint: the closest shades of a
  recently viewed shade whose page isn't in the API URL's data (on family pages). Grid shades
  take their closest shades from the API URL's data (the same pageNumber), as on the source.

"Viewing label" → what "Viewing:" shows with no top chip picked, e.g. "All Shades" (a picked
  chip shows the chip's name).

"Reset label" → the reset button's text, e.g. "Reset filters". Empty → no reset button.

"Show more label" → the Show More buttons' text (the grid's and the recently viewed strip's),
  e.g. "Show more". Empty → no Show More: only the first 96 shades (5 recently viewed) show.

"Start: Floating button" … "End: Floating button" (one-cell rows) → the corner "colour of the
  year" card. The row between them has 3 cells: the badge image | the card image | the card's
  link (a site path, e.g. /test-page/colour-catalogue-revamp/greens/chinese-tea.html). The
  badge's alt text names its button and the card's alt text names the link. No badge or card
  image → no floating button.

The API rows and the floating button's link are paths without a domain; the block adds it from
environment.js (www on prod, beta everywhere else). A full URL is used as authored.

Breadcrumb: a breadcrumb block authored in the same section moves into the filter bar, above the
title, as the source shows it. No breadcrumb block → none in the bar.

Not in DA yet, so hardcoded in TEMP_CONTENT below until it is (see START/END TEMP CONTENT): the
top filter chips, the Catalogue | Fandeck toggle labels, the filter tools (labels, colour
families, shade tones, vibes), "Viewing:",
"No results found", the shade details and compare labels, the colour of the year card's close
label and the error panel. The source's disclaimer note is not repeated here: the page has it as
its own section.
*/

/*
 * Catalogue Listing v2
 * The revamped colour catalogue (source: beta.asianpaints.com/test-page/colour-catalogue-revamp
 * .html, the "colourcataloguelisting" component): a filter bar that sticks under the header
 * (breadcrumb, title, top filter chips), a grid of shade swatches with Show More, a floating
 * filter toolbar (colour picker wheel, colour family links, shade tone slider, shades by vibe,
 * compare), the shade details pop-up with its closest shades and compare
 * (catalogue-listing-v2-details.js) and the corner "colour of the year" card.
 *
 * Data: all shades come from the API URL (`data`: shades grouped by pageNumber, 8 per page), in
 * its order; the grid shows 96 (12 rows of 8) and 96 more per Show More. Filters work as the
 * source's: a top chip (shadeMapperFamily, or the trending shades by their rank) on its own; the
 * colour picker (shade family, or pageNumber on a family page); the shade tone (colourTonality),
 * which keeps a picked colour; a vibe (colourTemperature) on its own. Values are compared
 * without case. Red dots mark the tools with a filter in use.
 *
 * Loading: decorate() renders the shell at once (bar, chips, a skeleton grid laid out as the
 * first 96 swatches, the recently viewed strip with skeleton cards) and returns without waiting
 * for the API, so the page doesn't wait for the data; the shades fill the grid in when they
 * arrive, and the toolbar shows then. The colour wheel (catalogue-listing-v2-wheel.js) loads when
 * its tool is first opened, the details pop-up and scripts/wishlist.js on the first swatch click.
 *
 * Layout: the source's two layouts switch at 992px (where the site's body zoom starts too).
 */
import { createOptimizedPicture } from '../../scripts/aem.js';
import { BETA_DOMAIN, PROD_DOMAIN, isProdDomain } from '../../scripts/environment.js';
import { registerCatalogue, sharedJson } from '../../scripts/catalogue-views.js';

const ROW_SIZE = 8;
// the source's data-attr-numberofRowsDisplay (12) rows of 8
const PAGE_SIZE = ROW_SIZE * 12;
const RECENT_PAGE_SIZE = 5;
const RECENT_COOKIE = 'recentShades';
const RECENT_MAX = 50;
const WISHLIST_TYPE = 'shades';
const FETCH_TIMEOUT = 20000;
const TRENDING = 'trendingShades';
const MOBILE_MEDIA = window.matchMedia('(max-width: 991px)');
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

// API, DAM assets and the revamp's pages: prod only on prod, beta everywhere else
const ENV_ORIGIN = `https://${isProdDomain() ? PROD_DOMAIN : BETA_DOMAIN}`;
const SITE_DOMAIN = window.location.hostname === BETA_DOMAIN ? BETA_DOMAIN : PROD_DOMAIN;
const ASIAN_PAINTS_HOSTS = [PROD_DOMAIN, BETA_DOMAIN, 'asianpaints.com'];
const AEM_CONTENT_ROOT = '/content/ap/en/home';
// floating "colour of the year": image widths requested (about 2× and 3× their 367px / 90px)
const COTY_CARD_WIDTH = '750';
const COTY_BADGE_WIDTH = '270';

// START TEMP CONTENT: not in DA yet. Copied from the source's markup (beta.asianpaints.com/
// test-page/colour-catalogue-revamp.html); move each part to a DA row, then delete it here.
// Images are DAM paths and links site paths: the domain comes from environment.js.
const REVAMP_DAM = '/content/dam/asian_paints/cc-revamp/listing';
const REVAMP_PAGES = '/test-page/colour-catalogue-revamp';
const TEMP_CONTENT = {
  // value: the API's shadeMapperFamily (TRENDING: the shades with a trendingShades rank; '': all
  // shades, no chip filter). No image: the chip is drawn in CSS with its label as text.
  chips: [
    { value: '', label: 'All Shades', image: '' },
    { value: 'Whites & Pastels', label: 'Whites & Pastels', image: `${REVAMP_DAM}/top-filter/whites-pastelss.png` },
    { value: 'Soft Colours', label: 'Soft Colours', image: `${REVAMP_DAM}/top-filter/soft-colorss.png` },
    { value: 'Earthen Mineral', label: 'Earthen Mineral', image: `${REVAMP_DAM}/top-filter/earthen-mineral.png` },
    { value: 'Festive Shades', label: 'Festive Shades', image: `${REVAMP_DAM}/top-filter/festive-shadess.png` },
    { value: 'Colour Pop', label: 'Colour Pop', image: `${REVAMP_DAM}/top-filter/colour-pops.png` },
    { value: TRENDING, label: 'Trending Shades', image: `${REVAMP_DAM}/top-filter/trending-shadess.png` },
  ],
  // the Catalogue | Fandeck toggle ("Show Fandeck" row)
  views: { catalogue: 'Catalogue', fandeck: 'Fandeck' },
  viewing: 'Viewing:',
  noResults: 'No results found',
  cancel: 'Cancel',
  apply: 'Apply',
  tools: {
    picker: 'Colour Picker',
    families: 'Colour Families',
    tone: 'Shade Tone',
    vibe: 'Shades by Vibe',
    compare: 'Compare Shades',
    // names of the icon-only buttons that open / close the toolbar below 992px
    open: 'Filters',
    close: 'Close filters',
  },
  families: [
    { label: 'Greys', path: `${REVAMP_PAGES}/greys.html`, image: `${REVAMP_DAM}/colour-families/greys.webp` },
    { label: 'Whites & Lights', path: `${REVAMP_PAGES}/whites-and-lights.html`, image: `${REVAMP_DAM}/colour-families/whites.webp` },
    { label: 'Beiges & Neutrals', path: `${REVAMP_PAGES}/beiges-and-neutrals.html`, image: `${REVAMP_DAM}/colour-families/beiges.webp` },
    { label: 'Browns', path: `${REVAMP_PAGES}/browns.html`, image: `${REVAMP_DAM}/colour-families/browns.webp` },
    { label: 'Yellows', path: `${REVAMP_PAGES}/yellows.html`, image: `${REVAMP_DAM}/colour-families/yellows.webp` },
    { label: 'Oranges', path: `${REVAMP_PAGES}/oranges.html`, image: `${REVAMP_DAM}/colour-families/oranges.webp` },
    { label: 'Reds', path: `${REVAMP_PAGES}/reds.html`, image: `${REVAMP_DAM}/colour-families/reds.webp` },
    { label: 'Pinks', path: `${REVAMP_PAGES}/pinks.html`, image: `${REVAMP_DAM}/colour-families/pinks.webp` },
    { label: 'Lilacs & Violets', path: `${REVAMP_PAGES}/lilacs-and-violets.html`, image: `${REVAMP_DAM}/colour-families/violets.webp` },
    { label: 'Blues', path: `${REVAMP_PAGES}/blues.html`, image: `${REVAMP_DAM}/colour-families/blues.webp` },
    { label: 'Greens', path: `${REVAMP_PAGES}/greens.html`, image: `${REVAMP_DAM}/colour-families/greens.webp` },
  ],
  tone: {
    title: 'Shade Tone',
    // label as shown, value as the API's colourTonality
    options: [
      { label: 'Ultra light', value: 'Ultra Light' },
      { label: 'Pastel', value: 'Pastel' },
      { label: 'Medium', value: 'Medium' },
      { label: 'Dark', value: 'Dark' },
      { label: 'Ultra Dark', value: 'Ultra Dark' },
    ],
  },
  vibe: {
    title: 'Shades for your vibe',
    // value as the API's colourTemperature
    options: [
      { label: 'Minimal', value: 'Minimal', image: `${REVAMP_DAM}/shades-by-vibe/minimal.webp` },
      { label: 'Cheerful', value: 'Cheerful', image: `${REVAMP_DAM}/shades-by-vibe/cheerful.webp` },
      { label: 'Cool & Calm', value: 'Cool & Calm', image: `${REVAMP_DAM}/shades-by-vibe/cool-n-calm.webp` },
      { label: 'Gourmet', value: 'Gourmet', image: `${REVAMP_DAM}/shades-by-vibe/gourmet.webp` },
      { label: 'Vibrant', value: 'Vibrant', image: `${REVAMP_DAM}/shades-by-vibe/vibrant.webp` },
      { label: 'Nature Edit', value: 'Nature Edit', image: `${REVAMP_DAM}/shades-by-vibe/nature-edit.webp` },
      { label: 'Moody & Dramatic', value: 'Moody & Dramatic', image: `${REVAMP_DAM}/shades-by-vibe/moody-n-dramatic.webp` },
      { label: 'Warm & Optimistic', value: 'Warm & Optimistic', image: `${REVAMP_DAM}/shades-by-vibe/warm-n-optimistic.webp` },
    ],
  },
  details: {
    cta: 'Shade Details',
    closest: 'Closest Shades',
    compare: 'Compare Shade',
    compareMax: 'You can only compare up to 4 shades. Please Remove a shade to continue.',
    added: 'Shade added to compare',
    close: 'Close',
  },
  compare: {
    title: 'Match & compare your colours',
    max: 4,
    remove: 'Remove',
    close: 'Close',
  },
  coty: {
    close: 'Close colour of the year',
  },
  error: {
    image: `${REVAMP_DAM}/error-updated.webp`,
    message: 'No Results Found',
    back: 'Back to colour catalogue',
    href: '/colour-catalogue',
  },
};
// END TEMP CONTENT

let instanceCount = 0;

/* ------------------------------------------------------------------ helpers */

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) return;
    if (key === 'className') node.className = value;
    else node.setAttribute(key, value === true ? '' : value);
  });
  node.append(...children.filter((child) => ![null, undefined, false].includes(child)));
  return node;
}

const toKey = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const titleCase = (value) => `${value || ''}`.replace(/\b\w/g, (c) => c.toUpperCase());
const normal = (value) => `${value ?? ''}`.trim().toLowerCase();
const sameValue = (a, b) => normal(a) === normal(b);
const codeOf = (shade) => `${shade?.entityCode ?? ''}`.trim();
/** a DAM or site path on the environment's domain (prod on prod, beta elsewhere) */
const envUrl = (path) => (path ? new URL(path, ENV_ORIGIN).href : '');

/**
 * An authored API URL as a URL object: a path gets the environment's domain, a full URL is kept
 * as authored. Null when empty or invalid.
 */
function apiUrl(authored) {
  if (!authored) return null;
  try {
    return new URL(authored, ENV_ORIGIN);
  } catch (e) {
    return null;
  }
}

/**
 * Public URL of an Asian Paints page: "/content/ap/en/home/x.html" and www/beta links map to
 * https://<site domain>/x.html (beta only when the page is served from beta); others are kept.
 */
function siteUrl(href) {
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

/** Same format as the source site (recentlyViewedShades clientlib) so all share the history. */
function rememberShade(code) {
  const sku = `${code || ''}`.trim();
  if (!sku) return;
  const list = readRecentSkus().filter((item) => item !== sku);
  list.unshift(sku);
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${RECENT_COOKIE}=${JSON.stringify(list.slice(0, RECENT_MAX))};path=/;expires=${expires}`;
}

/* ----------------------------------------------------------- authored content */

/** A cell's value: its text when that is a path or URL, else its link's href, else its text. */
function cellValue(cell) {
  if (!cell) return '';
  const text = cell.textContent.trim();
  if (/^(https?:\/\/|\/)/.test(text)) return text;
  return cell.querySelector('a')?.getAttribute('href') || text;
}

/** A cell's authored image: its src (the media URL), alt and size; null without one. */
function cellImage(cell) {
  const img = cell?.querySelector('img');
  if (!img?.getAttribute('src')) return null;
  return {
    src: img.getAttribute('src'),
    alt: img.getAttribute('alt') || '',
    width: img.getAttribute('width'),
    height: img.getAttribute('height'),
  };
}

/** "Start: Name" / "End: Name" marker rows: [kind, group key], else null. */
function groupMarker(cells) {
  if (cells.slice(1).some((cell) => cell.textContent.trim())) return null;
  const match = cells[0]?.textContent.trim().match(/^(start|end)\s*:\s*(.*)$/i);
  return match ? [match[1].toLowerCase(), toKey(match[2])] : null;
}

function readConfig(block) {
  const config = {
    mainTitle: '',
    showFandeck: false,
    api: '',
    recentApi: '',
    recentTitle: '',
    paletteApi: '',
    viewingLabel: '',
    resetLabel: '',
    showMoreLabel: '',
    coty: null,
  };
  let group = '';
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const marker = groupMarker(cells);
    if (marker) {
      group = marker[0] === 'start' ? marker[1] : '';
      return;
    }
    // "Floating button": badge image | card image | link
    if (group === 'floating button') {
      config.coty = config.coty || (cellImage(cells[0]) && {
        badge: cellImage(cells[0]), card: cellImage(cells[1]), link: cellValue(cells[2]),
      });
      return;
    }
    const [labelCell, valueCell] = cells;
    if (!labelCell) return;
    const key = toKey(labelCell.textContent);
    if (key === 'main title') config.mainTitle = valueCell?.textContent.trim() || '';
    else if (key === 'show fandeck') config.showFandeck = normal(valueCell?.textContent) === 'true';
    else if (key === 'api url') config.api = cellValue(valueCell);
    else if (key === 'recently viewed api') config.recentApi = cellValue(valueCell);
    else if (key === 'recently viewed title') config.recentTitle = valueCell?.textContent.trim() || '';
    else if (key === 'quick view closest shade api') config.paletteApi = cellValue(valueCell);
    else if (key === 'viewing label') config.viewingLabel = valueCell?.textContent.trim() || '';
    else if (key === 'reset label') config.resetLabel = valueCell?.textContent.trim() || '';
    else if (key === 'show more label') config.showMoreLabel = valueCell?.textContent.trim() || '';
  });
  return config;
}

/* ---------------------------------------------------------------- shade data */

/** the value, or any of its "a | b" parts, is `wanted` */
const hasValue = (value, wanted) => `${value ?? ''}`.split('|').some((part) => sameValue(part, wanted));
const isTrending = (shade) => !['', 'na'].includes(normal(shade.trendingShades))
  && !Number.isNaN(Number(shade.trendingShades));

/** The source's renderProducts filters, in its order. */
function filterShades(pool, filters) {
  const {
    chip, shadeFamily, pageNumber, tone, vibe,
  } = filters;
  let list = pool;
  if (chip && chip !== TRENDING) list = list.filter((s) => hasValue(s.shadeMapperFamily, chip));
  if (shadeFamily) list = list.filter((s) => sameValue(s.shadeFamily, shadeFamily));
  if (tone) list = list.filter((s) => hasValue(s.colourTonality, tone));
  if (vibe) list = list.filter((s) => hasValue(s.colourTemperature, vibe));
  if (pageNumber) list = list.filter((s) => sameValue(s.pageNumber, pageNumber));
  if (chip === TRENDING) {
    list = list.filter(isTrending)
      .sort((a, b) => Number(a.trendingShades) - Number(b.trendingShades));
  }
  return list;
}

/** the filters without empty values */
const cleanFilters = (filters) => Object.fromEntries(Object.entries(filters)
  .filter(([, value]) => value !== undefined && value !== null && value !== ''));

/**
 * The closest shades of a shade's page from the "Quick view closest shade API" row (as the
 * source's quick view: cfType and language as authored, pageNumber of the shade). Resolves to the
 * shades with public page links, or null (no row, no pageNumber, failed request). One request per
 * pageNumber; a failed one is tried again next time.
 */
function paletteLoader(config) {
  const authored = apiUrl(config.paletteApi);
  // the API answers {} without a language: none authored → the API URL's, else the page's
  if (authored && !authored.searchParams.has('language')) {
    const language = apiUrl(config.api)?.searchParams.get('language')
      || document.documentElement.lang.split('-')[0];
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

/**
 * The shared wishlist (scripts/wishlist.js), for the hearts of the details and compare pop-ups.
 * Resolves to { heart, refresh }, or null if it can't be loaded.
 */
function loadWishlist(block) {
  return import('../../scripts/wishlist.js')
    .then(({ default: initWishlist, wishlistHeart }) => ({
      heart: (options) => wishlistHeart({ type: WISHLIST_TYPE, ...options }),
      refresh: initWishlist(block).refresh,
    }))
    .catch(() => null);
}

/**
 * Where the site header ends on screen now: its fixed or sticky parts stacked from the top of the
 * screen down (the brand bar, then the logo and menu rows under it; the header slides its brand
 * bar away once the page has scrolled).
 * @param {{header: Element, parts: Element[]}} cache filled lazily
 */
function headerBottom(cache) {
  if (!cache.header?.isConnected) {
    cache.header = document.querySelector('header');
    cache.parts = null;
  }
  if (!cache.header) return 0;
  if (!cache.parts?.length) {
    cache.parts = [...cache.header.querySelectorAll('*')]
      .filter((node) => ['fixed', 'sticky'].includes(getComputedStyle(node).position));
  }
  return (cache.parts.length ? cache.parts : [cache.header])
    .map((node) => ({ node, rect: node.getBoundingClientRect() }))
    .filter(({ node, rect }) => rect.height > 0 && rect.bottom > 0
      && getComputedStyle(node).visibility !== 'hidden')
    .sort((a, b) => a.rect.top - b.rect.top)
    .reduce((bottom, { rect }) => (
      rect.top <= bottom + 1 ? Math.max(bottom, rect.bottom) : bottom
    ), 0);
}

/** Keeps the sticky bar's top at the header's bottom (in the block's zoomed pixels). */
function stickBelowHeader(bar) {
  const cache = {};
  let frame = 0;
  let last = '';
  const update = () => {
    frame = 0;
    const top = `${Math.round(headerBottom(cache) / (bar.currentCSSZoom || 1))}px`;
    if (top === last) return;
    last = top;
    bar.style.setProperty('--cl2-bar-top', top);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', () => {
    cache.parts = null;
    schedule();
  });
  // the header slides its brand bar away with a transition, after the scroll that started it
  document.querySelector('header')?.addEventListener('transitionend', schedule);
  schedule();
}

/* ---------------------------------------------------------------- rendering */

function swatch(hex) {
  const node = el('span', { className: 'cl2-swatch' });
  node.style.backgroundColor = hex || '';
  return node;
}

/** A grid swatch: a button opening the shade details pop-up. */
function buildCard(shade, onOpen) {
  const name = shade.entityName || '';
  const code = codeOf(shade);
  const card = el(
    'button',
    {
      type: 'button',
      className: 'cl2-card',
      'aria-haspopup': 'dialog',
      'aria-label': [titleCase(name), code].filter(Boolean).join(', '),
    },
    swatch(shade.shadeHexCode),
    el(
      'span',
      { className: 'cl2-card-detail', 'aria-hidden': 'true' },
      el('span', { className: 'cl2-card-name' }, name),
      el('span', { className: 'cl2-card-code' }, code),
    ),
  );
  card.addEventListener('click', () => onOpen(shade, card));
  return el('li', { className: 'cl2-item' }, card);
}

function skeletonItems(count) {
  return Array.from({ length: count }, () => el(
    'li',
    { className: 'cl2-item cl2-skeleton', 'aria-hidden': 'true' },
    el('span', { className: 'cl2-swatch' }),
  ));
}

/**
 * The breadcrumb block authored in the block's section (its wrapper), to move into the filter
 * bar. Blocks of a section are decorated in order, so it is usually decorated already; if not,
 * it still decorates where it is moved to.
 */
const sectionBreadcrumb = (block) => block.closest('.section')
  ?.querySelector(':scope > .breadcrumb-wrapper') || null;

/** An authored image (cellImage) as a picture at one width, keeping its size attributes. */
function authoredPicture(image, width, eager) {
  const picture = createOptimizedPicture(image.src, image.alt, eager, [{ width }]);
  const img = picture.querySelector('img');
  if (image.width && image.height) {
    img.setAttribute('width', image.width);
    img.setAttribute('height', image.height);
  }
  return picture;
}

/**
 * The corner "colour of the year" card (the authored floating button): a badge that slides the
 * colour's card in and out. Null without a badge and a card image.
 */
function buildColourOfTheYear(uid, coty) {
  if (!coty?.badge || !coty.card) return null;
  const popId = `${uid}-coty`;
  const close = el('button', { type: 'button', className: 'cl2-coty-close', 'aria-label': TEMP_CONTENT.coty.close });
  // the card's picture is only added (and requested) on the first open
  const link = coty.link
    ? el('a', {
      className: 'cl2-coty-link', href: envUrl(coty.link), target: '_blank', rel: 'noopener',
    })
    : el('div', { className: 'cl2-coty-link' });
  const pop = el('div', { className: 'cl2-coty-pop', id: popId }, link, close);
  // named by the badge image's alt text
  const badge = el(
    'button',
    {
      type: 'button', className: 'cl2-coty-badge', 'aria-expanded': 'false', 'aria-controls': popId,
    },
    authoredPicture(coty.badge, COTY_BADGE_WIDTH, false),
  );
  const root = el('div', { className: 'cl2-coty' }, pop, badge);

  let artReady = null;
  let wanted = false;
  const setOpen = async (open) => {
    wanted = open;
    if (open) {
      artReady = artReady || new Promise((resolve) => {
        // eager: the card starts off screen (slid out), where a lazy image would never load
        const picture = authoredPicture(coty.card, COTY_CARD_WIDTH, true);
        const art = picture.querySelector('img');
        art.className = 'cl2-coty-art';
        art.decoding = 'async';
        art.addEventListener('load', resolve, { once: true });
        art.addEventListener('error', resolve, { once: true });
        link.append(picture);
      });
      root.classList.add('is-busy');
      await artReady;
      root.classList.remove('is-busy');
    }
    if (wanted !== open) return;
    root.classList.toggle('is-open', open);
    badge.setAttribute('aria-expanded', `${open}`);
  };
  badge.addEventListener('click', () => setOpen(!wanted));
  close.addEventListener('click', () => {
    setOpen(false);
    badge.focus();
  });
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !wanted) return;
    setOpen(false);
    badge.focus();
  });
  return root;
}

/**
 * The recently viewed strip, or null when there are no shade codes to show. Returned at once with
 * skeleton cards (it sits above the grid: filling it in later would push the grid down); the first
 * batch replaces them, and if that request fails or returns no shades the strip is removed.
 * As catalogue-listing: the API keeps the order of up to 5 codes but re-sorts more, so it is asked
 * for 5 codes at a time, newest viewed first, and each batch is shown in the API's order.
 */
function buildRecent(config, uid, onOpen) {
  const authored = apiUrl(config.recentApi);
  if (!authored) return null;
  let skus = readRecentSkus();
  if (!skus.length) {
    try {
      skus = JSON.parse(authored.searchParams.get('previousShadeSKUs') || '[]');
    } catch (e) {
      skus = [];
    }
  }
  if (!Array.isArray(skus) || !skus.length) return null;

  let requested = 0;
  const fetchBatch = async () => {
    const batch = skus.slice(requested, requested + RECENT_PAGE_SIZE);
    const url = new URL(authored);
    url.searchParams.set('previousShadeSKUs', JSON.stringify(batch));
    url.searchParams.set('swatchesOnLoad', `${batch.length}`);
    const data = await fetchJson(url.href);
    if (!data) return null; // failed: the next Show More asks for the same batch again
    requested += batch.length;
    return Array.isArray(data.previousShades) ? data.previousShades : [];
  };

  const titleId = `${uid}-recent`;
  const list = el(
    'ul',
    { className: 'cl2-grid cl2-recent-list', 'aria-busy': 'true' },
    ...skeletonItems(Math.min(RECENT_PAGE_SIZE, skus.length)),
  );
  // no authored label → no Show More (it stays hidden). While the first batch loads it shows
  // disabled when there are more to come, so nothing below moves when the shades arrive.
  const hasMore = () => Boolean(config.showMoreLabel) && requested < skus.length;
  const more = el('button', {
    type: 'button',
    className: 'cl2-more',
    disabled: true,
    hidden: !config.showMoreLabel || skus.length <= RECENT_PAGE_SIZE,
  }, config.showMoreLabel);
  const section = el(
    'section',
    { className: 'cl2-recent', 'aria-labelledby': config.recentTitle ? titleId : null },
    config.recentTitle ? el('h2', { className: 'cl2-recent-title', id: titleId }, config.recentTitle) : null,
    list,
    el('div', { className: 'cl2-more-wrap' }, more),
  );
  const show = (batch) => {
    const first = list.children.length;
    list.append(...batch.map((shade) => buildCard(shade, onOpen)));
    more.hidden = !hasMore();
    return first;
  };
  let loading = false;
  more.addEventListener('click', async () => {
    if (loading) return;
    loading = true;
    const batch = await fetchBatch();
    loading = false;
    if (!batch) return;
    const first = show(batch);
    list.querySelectorAll('.cl2-card')[first]?.focus({ preventScroll: true });
  });

  fetchBatch().then((shades) => {
    if (!shades?.length) {
      section.remove();
      return;
    }
    list.removeAttribute('aria-busy');
    list.replaceChildren();
    more.disabled = false;
    show(shades);
  });
  return section;
}

/* --------------------------------------------------------------------- block */

/**
 * Renders the block's shell at once and returns without waiting for the shade API; the shades
 * fill the shell in when they arrive.
 * @param {Element} block The block element
 */
export default function decorate(block) {
  instanceCount += 1;
  const uid = `catalogue-listing-v2-${instanceCount}`;
  const config = readConfig(block);
  const api = apiUrl(config.api);
  // requested first: everything below is built while it loads (one request for this and the
  // fandeck block, which reads the same API)
  const dataReady = sharedJson(api?.href);
  // "all" → the colour picker filters by shade family, a family page → by page (the source's
  // data-attr-shadeFamily)
  const pageFamily = normal(api?.searchParams.get('shadeFamilyName') || 'all');

  const state = {
    data: {}, pool: [], filters: {}, list: [], shown: 0,
  };

  /* ---- shade details pop-up (loaded on the first swatch click) */
  const loadPalette = paletteLoader(config);
  // the shade's page from the API URL's data (as the source), else the quick view API
  const closestFor = (shade) => {
    const group = state.data[`${shade.pageNumber ?? ''}`.trim()];
    if (Array.isArray(group) && group.some((item) => codeOf(item) === codeOf(shade))) return group;
    return loadPalette(shade.pageNumber);
  };
  const compareCount = el('span', { className: 'cl2-compare-count' });
  const compareOpen = el(
    'button',
    {
      type: 'button', className: 'cl2-compare-open', 'aria-haspopup': 'dialog', hidden: true,
    },
    el('span', { className: 'cl2-compare-label' }, TEMP_CONTENT.tools.compare),
    compareCount,
  );
  const updateCompare = (count) => {
    compareOpen.hidden = !count;
    compareCount.textContent = count ? `${count}` : '';
    block.classList.toggle('has-compare', count > 0);
  };
  let details = null;
  let detailsReady = null;
  const loadDetails = () => {
    detailsReady = detailsReady || Promise.all([
      import('./catalogue-listing-v2-details.js'),
      loadWishlist(block),
    ]).then(([{ default: createDetails }, wishlist]) => {
      details = createDetails({
        block,
        wishlist,
        labels: TEMP_CONTENT.details,
        compareLabels: TEMP_CONTENT.compare,
        helpers: {
          el, titleCase, codeOf, rememberShade, envUrl,
        },
        onCompareChange: updateCompare,
      });
      return details;
    }).catch(() => null);
    return detailsReady;
  };
  const openShade = async (shade, card) => {
    card.classList.add('is-active');
    const closest = closestFor(shade);
    const view = await loadDetails();
    if (view) {
      view.open(shade, card, closest);
      return;
    }
    // no pop-up: the shade's page, as before
    card.classList.remove('is-active');
    if (shade.pageUrl) window.location.href = shade.pageUrl;
  };
  compareOpen.addEventListener('click', () => details?.openCompare());

  /* ---- bar: breadcrumb, title, Catalogue | Fandeck toggle, top filter chips */
  let imageChips = 0;
  const chipButtons = TEMP_CONTENT.chips.map((chip) => {
    const attrs = {
      type: 'button',
      className: chip.value ? 'cl2-chip' : 'cl2-chip cl2-chip-all',
      'aria-pressed': 'false',
      'data-value': chip.value,
      disabled: true,
    };
    if (!chip.image) {
      // drawn in CSS: the label in two lines, its first word bold, as the chip images' text
      const [first, ...rest] = chip.label.split(' ');
      return el('button', attrs, el('strong', {}, first), ' ', el('span', {}, rest.join(' ')));
    }
    // the first chip image is the LCP on most screens; the ones off screen (phones) load when
    // scrolled to
    imageChips += 1;
    const lcp = imageChips === 1;
    return el('button', attrs, el('img', {
      src: envUrl(chip.image),
      alt: chip.label,
      width: '132',
      height: '70',
      loading: lcp ? 'eager' : 'lazy',
      fetchpriority: lcp ? 'high' : null,
    }));
  });
  const chips = el('div', { className: 'cl2-chips' }, ...chipButtons);

  // "Show Fandeck": the Catalogue | Fandeck toggle (see setView). The fandeck block, when on the
  // page, brings its title, search (right of the breadcrumb) and colour family chips (beside the
  // toggle) into this bar.
  const viewButtons = config.showFandeck
    ? Object.entries(TEMP_CONTENT.views).map(([view, label]) => el('button', {
      type: 'button',
      className: `cl2-view cl2-view-${view}`,
      'aria-pressed': `${view === 'catalogue'}`,
      'data-view': view,
    }, label))
    : [];

  const breadcrumb = sectionBreadcrumb(block);
  const barTop = viewButtons.length ? el('div', { className: 'cl2-bar-top' }, breadcrumb) : null;
  const barTitle = config.mainTitle ? el('h2', { className: 'cl2-title' }, config.mainTitle) : null;
  const barText = el('div', { className: 'cl2-bar-text' }, barTop || breadcrumb, barTitle);
  const barRow = viewButtons.length
    ? el('div', { className: 'cl2-bar-row' }, el('div', { className: 'cl2-views' }, ...viewButtons), chips)
    : null;
  const bar = el(
    'div',
    { className: viewButtons.length ? 'cl2-bar has-views' : 'cl2-bar' },
    barText,
    barRow || chips,
  );

  /* ---- "Viewing", reset, grid, Show More */
  const viewingValue = el('span', { className: 'cl2-viewing-value' }, config.viewingLabel);
  const resetButton = config.resetLabel
    ? el('button', { type: 'button', className: 'cl2-reset', disabled: true }, config.resetLabel)
    : null;
  const head = el(
    'div',
    { className: 'cl2-head' },
    el('p', { className: 'cl2-viewing' }, TEMP_CONTENT.viewing, viewingValue),
    resetButton,
  );
  // the first page's layout with placeholder swatches, so nothing in view moves when the
  // shades replace them
  const grid = el('ul', { className: 'cl2-grid', 'aria-busy': 'true' }, ...skeletonItems(PAGE_SIZE));
  const noResults = el('p', { className: 'cl2-no-results', role: 'status' });
  const more = el('button', { type: 'button', className: 'cl2-more', hidden: true }, config.showMoreLabel);

  /* ---- filter toolbar */
  const panels = {};
  const toolButtons = {};
  const toolsId = `${uid}-tools`;
  ['picker', 'families', 'tone', 'vibe'].forEach((key) => {
    toolButtons[key] = el(
      'button',
      {
        type: 'button', className: `cl2-tool cl2-tool-${key}`, 'aria-expanded': 'false', 'aria-controls': `${uid}-${key}`,
      },
      el('span', { className: 'cl2-tool-icon', 'aria-hidden': 'true' }),
      el('span', { className: 'cl2-tool-label' }, TEMP_CONTENT.tools[key]),
    );
  });
  const actionButtons = () => ({
    cancel: el('button', { type: 'button', className: 'cl2-button cl2-button-secondary' }, TEMP_CONTENT.cancel),
    apply: el('button', { type: 'button', className: 'cl2-button' }, TEMP_CONTENT.apply),
  });

  // colour picker: the wheel is drawn when the tool is first opened (catalogue-listing-v2-wheel.js)
  const wheelCanvas = el('canvas', { className: 'cl2-wheel-canvas', 'aria-hidden': 'true' });
  const wheelCursor = el('span', { className: 'cl2-wheel-cursor', 'aria-hidden': 'true' });
  const wheelRoot = el('div', {
    className: 'cl2-wheel', role: 'slider', tabindex: '0', 'aria-label': TEMP_CONTENT.tools.picker,
  }, wheelCanvas, wheelCursor);
  panels.picker = el('div', { className: 'cl2-panel cl2-panel-picker', id: `${uid}-picker`, hidden: true }, wheelRoot);

  // colour families: links to the family pages, stacked cards
  panels.families = el(
    'div',
    { className: 'cl2-panel cl2-panel-families', id: `${uid}-families`, hidden: true },
    el('ul', { className: 'cl2-families', 'aria-label': TEMP_CONTENT.tools.families }, ...TEMP_CONTENT.families
      .map(({ label, path, image }, i) => el(
        'li',
        { className: 'cl2-family', style: `--cl2-family-index: ${i}` },
        el('a', { className: 'cl2-family-link', href: envUrl(path) }, el('img', { src: envUrl(image), alt: label, loading: 'lazy' })),
      ))),
  );

  // shade tone: a segmented slider (radio buttons); drag the thumb or pick a segment
  const tone = (() => {
    const { title, options } = TEMP_CONTENT.tone;
    const titleId = `${uid}-tone-title`;
    const segments = options.map(({ label }, i) => el('button', {
      type: 'button',
      role: 'radio',
      className: 'cl2-tone-segment',
      'aria-checked': 'false',
      'aria-label': label,
      'data-index': `${i}`,
      tabindex: i ? '-1' : '0',
    }));
    const labels = options.map(({ label }) => el('span', { className: 'cl2-tone-label' }, label));
    const thumb = el('span', { className: 'cl2-tone-thumb', 'aria-hidden': 'true' });
    const track = el('div', { className: 'cl2-tone-track', role: 'radiogroup', 'aria-labelledby': titleId }, ...segments);
    const slider = el('div', { className: 'cl2-tone-slider' }, track, thumb);
    const { cancel, apply } = actionButtons();
    let pending = -1;
    const centre = (i) => segments[i].offsetLeft + segments[i].offsetWidth / 2;
    const show = (index, x) => {
      pending = index;
      segments.forEach((segment, i) => {
        const on = i === index;
        segment.setAttribute('aria-checked', `${on}`);
        segment.tabIndex = on || (index < 0 && i === 0) ? 0 : -1;
        segment.classList.toggle('is-active', on);
        labels[i].classList.toggle('is-active', on);
      });
      thumb.classList.toggle('is-active', index >= 0);
      // the thumb sits on its segment's centre, or at the track's start when none is picked
      thumb.style.left = `${x ?? (index >= 0 ? centre(index) : 0)}px`;
    };
    const nearest = (x) => segments.reduce((best, _, i) => (
      Math.abs(x - centre(i)) < Math.abs(x - centre(best)) ? i : best), 0);
    const pointerX = (event) => {
      const rect = slider.getBoundingClientRect();
      const x = (event.clientX - rect.left) * (slider.offsetWidth / (rect.width || 1));
      return Math.max(-thumb.offsetWidth / 2, Math.min(slider.offsetWidth, x));
    };
    let dragging = false;
    slider.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      dragging = true;
      slider.setPointerCapture(event.pointerId);
      slider.classList.add('is-dragging');
      const x = pointerX(event);
      show(x < 0 ? -1 : nearest(x), x);
    });
    slider.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const x = pointerX(event);
      show(x < 0 ? -1 : nearest(x), x);
    });
    const endDrag = (event) => {
      if (!dragging) return;
      dragging = false;
      slider.classList.remove('is-dragging');
      // dropped left of the track: no tone (as the source's reset); else the nearest segment
      const x = pointerX(event);
      show(x < 0 ? -1 : nearest(x));
    };
    slider.addEventListener('pointerup', endDrag);
    slider.addEventListener('pointercancel', endDrag);
    segments.forEach((segment, i) => segment.addEventListener('click', () => show(i)));
    labels.forEach((label, i) => label.addEventListener('click', () => show(i)));
    track.addEventListener('keydown', (event) => {
      const step = {
        ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1,
      }[event.key];
      if (!step) return;
      event.preventDefault();
      const from = pending < 0 && step > 0 ? -1 : Math.max(pending, 0);
      const next = (from + step + segments.length) % segments.length;
      show(next);
      segments[next].focus();
    });
    const panel = el(
      'div',
      { className: 'cl2-panel cl2-panel-tone', id: `${uid}-tone`, hidden: true },
      el('p', { className: 'cl2-panel-title', id: titleId }, title),
      el('div', { className: 'cl2-tone-labels', 'aria-hidden': 'true' }, ...labels),
      slider,
      el('div', { className: 'cl2-panel-actions' }, cancel, apply),
    );
    return {
      panel,
      cancel,
      apply,
      value: () => options[pending]?.value || '',
      // back to the applied tone (also places the thumb, once the panel is shown)
      reset: () => show(options.findIndex(({ value }) => sameValue(value, state.filters.tone))),
      first: () => segments[Math.max(pending, 0)],
    };
  })();
  panels.tone = tone.panel;

  // shades by vibe: one option at a time (a second click unselects it)
  const vibe = (() => {
    const { title, options } = TEMP_CONTENT.vibe;
    const titleId = `${uid}-vibe-title`;
    let pending = '';
    let buttons = [];
    const show = (value) => {
      pending = value;
      buttons.forEach((button) => button.setAttribute('aria-pressed', `${button.dataset.value === value}`));
    };
    buttons = options.map((option) => {
      const button = el(
        'button',
        {
          type: 'button', className: 'cl2-vibe', 'aria-pressed': 'false', 'data-value': option.value,
        },
        el('span', { className: 'cl2-vibe-image' }, el('img', {
          src: envUrl(option.image), alt: '', width: '147', height: '59', loading: 'lazy',
        })),
        el('span', { className: 'cl2-vibe-label' }, option.label),
      );
      button.addEventListener('click', () => show(pending === option.value ? '' : option.value));
      return button;
    });
    const { cancel, apply } = actionButtons();
    const panel = el(
      'div',
      { className: 'cl2-panel cl2-panel-vibe', id: `${uid}-vibe`, hidden: true },
      el('p', { className: 'cl2-panel-title', id: titleId }, title),
      el('div', { className: 'cl2-vibes', role: 'group', 'aria-labelledby': titleId }, ...buttons),
      el('div', { className: 'cl2-panel-actions' }, cancel, apply),
    );
    return {
      panel,
      cancel,
      apply,
      value: () => pending,
      reset: () => show(options.find(({ value }) => sameValue(value, state.filters.vibe))?.value || ''),
      first: () => buttons.find((button) => button.getAttribute('aria-pressed') === 'true') || buttons[0],
    };
  })();
  panels.vibe = vibe.panel;

  const toolsClose = el('button', { type: 'button', className: 'cl2-tools-close', 'aria-label': TEMP_CONTENT.tools.close });
  const toolsToggle = el('button', {
    type: 'button',
    className: 'cl2-tools-toggle',
    'aria-expanded': 'false',
    'aria-controls': toolsId,
    'aria-label': TEMP_CONTENT.tools.open,
  });
  const toolbar = el('div', { className: 'cl2-toolbar', id: toolsId }, toolsClose, ...Object.values(toolButtons));
  const tools = el(
    'div',
    { className: 'cl2-tools' },
    el('div', { className: 'cl2-tools-row' }, toolbar, compareOpen),
    ...Object.values(panels),
    toolsToggle,
  );

  /* ---- shell */
  const recent = buildRecent(config, uid, openShade);
  const moreWrap = el('div', { className: 'cl2-more-wrap' }, more);
  const coty = buildColourOfTheYear(uid, config.coty);
  block.classList.add('is-loading');
  block.replaceChildren(
    ...[bar, recent, head, grid, noResults, moreWrap, coty, tools].filter(Boolean),
  );
  stickBelowHeader(bar);

  /* ---- filters */
  const syncFilterUi = () => {
    const {
      chip, shadeFamily, pageNumber, tone: toneValue, vibe: vibeValue,
    } = state.filters;
    chipButtons.forEach((button) => button.setAttribute('aria-pressed', `${button.dataset.value === (chip || '')}`));
    viewingValue.textContent = chip
      ? TEMP_CONTENT.chips.find(({ value }) => value === chip)?.label || chip
      : config.viewingLabel;
    toolButtons.picker.classList.toggle('has-filter', Boolean(shadeFamily || pageNumber));
    toolButtons.tone.classList.toggle('has-filter', Boolean(toneValue));
    toolButtons.vibe.classList.toggle('has-filter', Boolean(vibeValue));
    tone.reset();
    vibe.reset();
  };

  const renderMore = () => {
    const first = state.shown;
    const next = state.list.slice(first, first + PAGE_SIZE);
    grid.append(...next.map((shade) => buildCard(shade, openShade)));
    state.shown += next.length;
    // no authored label → no Show More
    more.hidden = !config.showMoreLabel || state.shown >= state.list.length;
    return first;
  };

  // after a filter change from further down the page, back to the top of the grid
  const revealGrid = () => {
    const barBottom = bar.getBoundingClientRect().bottom;
    const headTop = head.getBoundingClientRect().top;
    if (headTop >= barBottom) return;
    window.scrollTo({
      top: window.scrollY + headTop - barBottom,
      behavior: REDUCED_MOTION.matches ? 'auto' : 'smooth',
    });
  };

  const applyFilters = (reveal = true) => {
    state.list = filterShades(state.pool, state.filters);
    state.shown = 0;
    grid.replaceChildren();
    noResults.textContent = state.list.length ? '' : TEMP_CONTENT.noResults;
    renderMore();
    syncFilterUi();
    if (reveal) revealGrid();
  };

  const setFilters = (filters) => {
    state.filters = cleanFilters(filters);
    applyFilters();
  };

  more.addEventListener('click', () => {
    const first = renderMore();
    // keep keyboard users in place: focus the first new swatch
    grid.querySelectorAll('.cl2-card')[first]?.focus({ preventScroll: true });
  });

  chipButtons.forEach((button) => button.addEventListener('click', () => {
    const { value } = button.dataset;
    // All Shades (no value), or the picked chip again → all shades
    setFilters(!value || state.filters.chip === value ? {} : { chip: value });
  }));
  resetButton?.addEventListener('click', () => setFilters({}));

  /* ---- toolbar panels */
  let openKey = null;
  let wheelReady = null;
  /** opens the tool's panel (its tool again, or null, closes it); unapplied choices are undone */
  const setPanel = (key, { focusTool = false } = {}) => {
    const next = key === openKey ? null : key;
    if (openKey) {
      panels[openKey].hidden = true;
      toolButtons[openKey].setAttribute('aria-expanded', 'false');
      if (focusTool) toolButtons[openKey].focus();
    }
    tone.reset();
    vibe.reset();
    openKey = next;
    if (next) {
      panels[next].hidden = false;
      toolButtons[next].setAttribute('aria-expanded', 'true');
      if (next === 'tone') tone.reset();
      if (next === 'picker') {
        // eslint-disable-next-line no-use-before-define
        showWheel();
      } else {
        ({
          families: () => panels.families.querySelector('.cl2-family-link'),
          tone: tone.first,
          vibe: vibe.first,
        })[next]()?.focus({ preventScroll: true });
      }
    }
    tools.classList.toggle('has-panel', Boolean(next));
    document.documentElement.classList.toggle('cl2-no-scroll', Boolean(next) && MOBILE_MEDIA.matches);
  };

  const pickColour = (shade) => {
    const byFamily = pageFamily === 'all';
    if (shade && (byFamily ? shade.shadeFamily : shade.pageNumber)) {
      setFilters(byFamily ? { shadeFamily: shade.shadeFamily } : { pageNumber: `${shade.pageNumber}` });
    }
    setPanel(null, { focusTool: panels.picker.contains(document.activeElement) });
  };

  const showWheel = () => {
    wheelReady = wheelReady || import('./catalogue-listing-v2-wheel.js')
      .then(({ default: createWheel }) => createWheel({
        root: wheelRoot,
        canvas: wheelCanvas,
        cursor: wheelCursor,
        shades: state.pool,
        describe: (shade) => titleCase(shade?.shadeFamily || ''),
        onPick: pickColour,
      }))
      .catch(() => null);
    wheelReady.then((wheel) => {
      if (!wheel || openKey !== 'picker') return;
      wheel.draw();
      wheelRoot.focus({ preventScroll: true });
    });
  };

  Object.entries(toolButtons).forEach(([key, button]) => button.addEventListener('click', () => setPanel(key)));
  tone.cancel.addEventListener('click', () => setPanel(null, { focusTool: true }));
  vibe.cancel.addEventListener('click', () => setPanel(null, { focusTool: true }));
  tone.apply.addEventListener('click', () => {
    // the tone keeps a picked colour; the chips and vibe go
    const { shadeFamily, pageNumber } = state.filters;
    setFilters({ shadeFamily, pageNumber, tone: tone.value() });
    setPanel(null, { focusTool: true });
  });
  vibe.apply.addEventListener('click', () => {
    setFilters({ vibe: vibe.value() });
    setPanel(null, { focusTool: true });
  });

  // below 992px the toolbar opens from its toggle
  const setToolsOpen = (open, focus = true) => {
    tools.classList.toggle('is-open', open);
    toolsToggle.setAttribute('aria-expanded', `${open}`);
    if (!open) setPanel(null);
    if (!focus) return;
    if (open) toolButtons.picker.focus();
    else toolsToggle.focus();
  };
  toolsToggle.addEventListener('click', () => setToolsOpen(true));
  toolsClose.addEventListener('click', () => setToolsOpen(false));
  tools.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (openKey) setPanel(null, { focusTool: true });
    else if (tools.classList.contains('is-open')) setToolsOpen(false);
  });
  document.addEventListener('click', (event) => {
    if (tools.contains(event.target)) return;
    if (openKey) setPanel(null);
    // the open toolbar (phones) sits above the header: the header's menu, search or cart close it
    if (tools.classList.contains('is-open') && event.target.closest('header')) setToolsOpen(false, false);
  });
  MOBILE_MEDIA.addEventListener('change', () => setToolsOpen(false, false));
  // the toolbar floats over the page only while the block is in view
  new IntersectionObserver(([entry]) => {
    tools.classList.toggle('is-visible', entry.isIntersecting);
    if (!entry.isIntersecting && (openKey || tools.classList.contains('is-open'))) setToolsOpen(false, false);
  }).observe(block);

  /* ---- Catalogue | Fandeck: switched in place, the URL unchanged */
  let currentView = 'catalogue';
  let fandeckView = null;
  let fandeckParts = [];
  const catalogueParts = [barTitle, chips, recent, head, grid, noResults, moreWrap, coty, tools]
    .filter(Boolean);
  const headerCache = {};
  const setView = (view) => {
    currentView = view;
    block.dataset.view = view;
    viewButtons.forEach((button) => button.setAttribute('aria-pressed', `${button.dataset.view === view}`));
    // with no fandeck block on the page, the toggle only switches
    const fandeckOn = view === 'fandeck' && Boolean(fandeckView);
    catalogueParts.forEach((part) => { part.hidden = fandeckOn; });
    fandeckParts.forEach((part) => { part.hidden = !fandeckOn; });
    // the fandeck's section follows this one without the sections' gap (see the CSS)
    block.closest('.section')?.classList.toggle('cl2-fandeck-view', fandeckOn);
    if (fandeckOn) {
      setToolsOpen(false, false);
      fandeckView.show();
    } else fandeckView?.hide();
  };
  viewButtons.forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.view === currentView) return;
    setView(button.dataset.view);
    // back to the top of the view, under the header
    const top = block.getBoundingClientRect().top - headerBottom(headerCache);
    if (top < 0) window.scrollTo({ top: window.scrollY + top });
  }));
  registerCatalogue({
    hasToggle: Boolean(viewButtons.length),
    attach: (view) => {
      fandeckView = view;
      const fandeckTitle = view.title ? el('h2', { className: 'cl2-title' }, view.title) : null;
      if (fandeckTitle) barText.append(fandeckTitle);
      barTop.append(view.search);
      barRow.append(view.chips);
      fandeckParts = [fandeckTitle, view.search, view.chips].filter(Boolean);
      setView(currentView);
    },
  });

  /* ---- data: not awaited (decorate() has returned by then) */
  dataReady.then((json) => {
    const data = json?.data && typeof json.data === 'object' ? json.data : null;
    const pool = data ? Object.values(data).flat().filter((shade) => shade && typeof shade === 'object') : [];
    block.classList.remove('is-loading');
    if (!pool.length) {
      const { error } = TEMP_CONTENT;
      block.classList.add('is-error');
      setToolsOpen(false, false);
      block.replaceChildren(el(
        'div',
        { className: 'cl2-error' },
        el('img', {
          src: envUrl(error.image), alt: '', width: '429', height: '281', loading: 'lazy',
        }),
        el('p', { className: 'cl2-error-message' }, error.message),
        el('a', { className: 'cl2-error-back', href: error.href }, error.back),
      ));
      return;
    }
    state.data = data;
    state.pool = pool;
    [...chipButtons, resetButton].filter(Boolean).forEach((button) => { button.disabled = false; });
    grid.removeAttribute('aria-busy');
    applyFilters(false);
  });
}
