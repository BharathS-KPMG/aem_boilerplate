/*
** Authoring format **
Fandeck block, 2 columns: label | value. Rows are found by their label, so the order can change
and every row is optional.

"Main Title" → the fandeck's title, e.g. "Digital fandeck for wall paints".

"API URL" → colourCatalogue.json endpoint with every shade, e.g.
  /apcolourcatalogue/colourCatalogue.json?shadeFamilyName=all: the colour families and the fan.
  The same URL as catalogue-listing-v2's API URL is requested once for both blocks.

"Quick view closest shade API" → shadelistingpalette.json endpoint: the shade drawer's "Shade
  palette" (the other shades of the shade's fandeck page). The API needs a language: with none
  authored (e.g. ?cfType=Shade&language=en) the API URL's is used, else the page's <html lang>.

"Recently viewed title" → not used yet.

The API rows are paths without a domain; the block adds it from environment.js (www on prod, beta
everywhere else). A full URL is used as authored.

With catalogue-listing-v2 on the page ("Show Fandeck" = true), the fandeck is that block's
Fandeck view: hidden until its toggle picks it, with the title, the search (right of the
breadcrumb) and the colour family chips (beside the toggle) in that block's bar; the URL does not
change. Put the fandeck block in its own section right after the catalogue-listing-v2 one. With no
catalogue-listing-v2 on the page it shows on its own, with its title, search and chips above the
fan.

Not in DA yet, so hardcoded in TEMP_CONTENT below until it is: the colour families' order and dot
colours, and every label. The shortlist is a temporary demo, as on the source: kept in this
browser (localStorage), not the site wishlist.
*/

/*
 * Fandeck
 * The digital fandeck (source: the "Fandeck View" of beta.asianpaints.com/colour-catalogue/
 * beige-wall-colours.html, the apcolourcatalogue "fandeck" component): colour family chips, a fan
 * of 14 shade leaves a page (each leaf: its shade's name and code, then the other shades of its
 * fandeck page), the shade drawer (palette, shortlist, full details, share), a search by name or
 * code and the shortlist screen (fandeck-panels.js, loaded on first use).
 */
import { BETA_DOMAIN, PROD_DOMAIN, isProdDomain } from '../../scripts/environment.js';
import { registerFandeck, sharedJson } from '../../scripts/catalogue-views.js';

// the source's fan: 14 leaves over 90 degrees, a leaf 90px wide
const FAN_SIZE = 14;
const FAN_DEGREES = 90;
const LEAF_WIDTH = 90;
// phones: the fan opens until its outer leaves come this close to the screen's edges
const FAN_EDGE_GAP = 12;
// a fandeck page holds 8 shades: a leaf shows the other 7 of its 8
const PAGE_SHADES = 8;
const SKELETON_FAMILIES = 9;
const SEARCH_MIN = 2;
const SEARCH_MAX = 8;
const SEARCH_DELAY = 300;
const SWIPE_DISTANCE = 20;
const SHORTLIST_KEY = 'fandeck-shortlist';
// the source's two layouts switch at 768px
const MOBILE_MEDIA = window.matchMedia('(max-width: 767px)');
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

// API: prod only on prod, beta everywhere else
const ENV_ORIGIN = `https://${isProdDomain() ? PROD_DOMAIN : BETA_DOMAIN}`;
const SITE_DOMAIN = window.location.hostname === BETA_DOMAIN ? BETA_DOMAIN : PROD_DOMAIN;
const ASIAN_PAINTS_HOSTS = [PROD_DOMAIN, BETA_DOMAIN, 'asianpaints.com'];
const AEM_CONTENT_ROOT = '/content/ap/en/home';

// START TEMP CONTENT: not in DA yet. Copied from the source; move each part to a DA row, then
// delete it here.
const TEMP_CONTENT = {
  // the API's shadeFamily → its dot colour, in the chips' order
  families: {
    'off whites': '#F5F0E8',
    whites: '#FAFAFA',
    pinks: '#F48FB1',
    reds: '#C62828',
    oranges: '#E65100',
    yellows: '#F9A825',
    greens: '#2E7D32',
    blues: '#1565C0',
    purples: '#6A1B9A',
    browns: '#5D4037',
    greys: '#9E9E9E',
  },
  familiesLabel: 'Colour family selector',
  coloursLabel: 'colours',
  fanLabel: 'Paint Shades',
  hint: 'Click on any shade to view details',
  previous: 'Previous shades',
  next: 'Next shades',
  empty: 'No colours found',
  emptyHint: 'Try selecting a different colour family',
  search: {
    label: 'Search Paint Shades',
    placeholder: 'Search by name or code...',
  },
  drawer: {
    close: 'Close colour detail',
    palette: 'Shade palette',
    paletteHint: 'Close tones from the same family',
    paletteShade: 'View similar shade:',
    add: 'Add to Shortlist',
    remove: 'Remove from Shortlist',
    added: 'Added to shortlist!',
    details: 'View full details',
    share: 'Share',
    copied: 'Link copied!',
    shareTitle: '— Asian Paints',
    shareText: 'Check out this colour:',
    shareFrom: 'from Asian Paints',
  },
  shortlist: {
    open: 'View shortlist',
    saved: 'colours saved',
    back: 'Back to Fandeck',
    share: 'Share',
    copied: 'Copied!',
    title: 'Your Shortlist',
    subtitle: 'Your saved colours for easy comparison',
    empty: 'No colours saved yet',
    emptyHint: 'Browse the fandeck and tap the heart icon on colours you love. They\'ll appear here for easy comparison.',
    explore: 'Explore Fandeck',
    remove: 'Remove',
    removeShade: 'from shortlist',
    lrv: 'LRV',
    shareTitle: 'My Colour Shortlist',
    shareText: 'Check out my saved paint colours from Asian Paints',
  },
};
// END TEMP CONTENT

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

// the source's icons (24px grid, stroked)
const ICONS = {
  search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
  previous: '<path d="m15 18-6-6 6-6"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4M12 2v13"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};

/** A decorative icon from ICONS (fixed markup above, never authored text). */
function icon(name, size = 16) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  [['viewBox', '0 0 24 24'], ['width', size], ['height', size], ['fill', 'none'],
    ['stroke', 'currentColor'], ['stroke-width', '2'], ['stroke-linecap', 'round'],
    ['stroke-linejoin', 'round'], ['aria-hidden', 'true'], ['focusable', 'false']]
    .forEach(([key, value]) => svg.setAttribute(key, value));
  svg.classList.add('fd-icon');
  svg.innerHTML = ICONS[name];
  return svg;
}

const toKey = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const normal = (value) => `${value ?? ''}`.trim().toLowerCase();
const titleCase = (value) => `${value || ''}`.replace(/\b\w/g, (c) => c.toUpperCase());

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

const hexOf = (value) => {
  const hex = `${value || ''}`.trim().replace(/^#?/, '#');
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toUpperCase() : '#CCCCCC';
};

/** The source's LRV: relative luminance, 0-100 */
function lrvOf(hex) {
  const channel = (offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return Math.round(100 * (0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)));
}

/** Text on a shade: white below LRV 50, as the source */
const inkOn = (shade) => (shade.lrv < 50 ? '#ffffff' : '#1a1a1a');

/** A cell's value: its text when that is a path or URL, else its link's href, else its text. */
function cellValue(cell) {
  if (!cell) return '';
  const text = cell.textContent.trim();
  if (/^(https?:\/\/|\/)/.test(text)) return text;
  return cell.querySelector('a')?.getAttribute('href') || text;
}

function readConfig(block) {
  const config = { title: '', api: '', paletteApi: '' };
  [...block.children].forEach((row) => {
    const [labelCell, valueCell] = [...row.children];
    if (!labelCell) return;
    const key = toKey(labelCell.textContent);
    if (key === 'main title') config.title = valueCell?.textContent.trim() || '';
    else if (key === 'api url') config.api = cellValue(valueCell);
    else if (key === 'quick view closest shade api') config.paletteApi = cellValue(valueCell);
  });
  return config;
}

/* ----------------------------------------------------------------- the data */

/** An API shade as the fandeck's shade */
function toShade(item) {
  const hex = hexOf(item.shadeHexCode);
  return {
    code: `${item.entityCode ?? ''}`.trim(),
    name: titleCase(`${item.entityName || ''}`.trim()),
    hex,
    lrv: lrvOf(hex),
    family: normal(item.shadeFamily),
    page: Number.parseInt(item.pageNumber, 10) || 0,
    position: Number.parseInt(item.positionNumber, 10) || 0,
    pageUrl: siteUrl(item.pageUrl),
    tags: [item.colourTemperature, item.colourTonality].map(normal).filter(Boolean),
  };
}

/**
 * The fandeck from the API's `data` (shades grouped by fandeck page): every shade in fandeck
 * order (page, then position, as the source's fan), the pages and the colour families (in
 * TEMP_CONTENT's order, then the rest).
 */
function buildModel(json) {
  const groups = json?.data && typeof json.data === 'object' ? Object.values(json.data) : [];
  const byCode = new Map();
  groups.flat().forEach((item) => {
    if (!item || typeof item !== 'object' || !item.shadeFamily) return;
    const shade = toShade(item);
    if (shade.code && !byCode.has(shade.code)) byCode.set(shade.code, shade);
  });
  const shades = [...byCode.values()].sort((a, b) => a.page - b.page || a.position - b.position);
  const pages = new Map();
  const familyShades = new Map();
  shades.forEach((shade) => {
    if (!pages.has(shade.page)) pages.set(shade.page, []);
    pages.get(shade.page).push(shade);
    if (!familyShades.has(shade.family)) familyShades.set(shade.family, []);
    familyShades.get(shade.family).push(shade);
  });
  const order = Object.keys(TEMP_CONTENT.families);
  const rank = (key) => (order.includes(key) ? order.indexOf(key) : order.length);
  const families = [...familyShades.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([key, list]) => ({
      key, name: titleCase(key), hex: TEMP_CONTENT.families[key] || list[0].hex, shades: list,
    }));
  return {
    shades, pages, families, byCode,
  };
}

/** The other shades of a shade's fandeck page (its 8), in page order */
function pageSiblings(model, shade) {
  const page = model.pages.get(shade.page) || [];
  const start = Math.floor(page.indexOf(shade) / PAGE_SHADES) * PAGE_SHADES;
  return page.slice(Math.max(start, 0), start + PAGE_SHADES).filter((other) => other !== shade);
}

/**
 * The shade drawer's palette from the "Quick view closest shade API" row (cfType and language as
 * authored, pageNumber of the shade): the other shades of its page. One request per page; a
 * failed one is tried again next time.
 */
function paletteLoader(config, model) {
  const authored = apiUrl(config.paletteApi);
  // the API answers {} without a language: none authored → the API URL's, else the page's
  if (authored && !authored.searchParams.has('language')) {
    const language = apiUrl(config.api)?.searchParams.get('language')
      || document.documentElement.lang.split('-')[0];
    if (language) authored.searchParams.set('language', language);
  }
  const requests = new Map();
  return (shade) => {
    if (!authored || !shade.page) return Promise.resolve([]);
    if (!requests.has(shade.page)) {
      const url = new URL(authored);
      url.searchParams.set('pageNumber', `${shade.page}`);
      requests.set(shade.page, sharedJson(url.href).then((json) => {
        const items = Array.isArray(json?.shadepalette) ? json.shadepalette : [];
        if (!items.length) requests.delete(shade.page);
        return items.map((item) => {
          const known = model().byCode.get(`${item.entityCode ?? ''}`.trim());
          return known || toShade({ shadeFamily: shade.family, ...item });
        });
      }));
    }
    return requests.get(shade.page)
      .then((shades) => shades.filter((other) => other.code !== shade.code));
  };
}

/** The shortlist: shade codes kept in this browser (the source's temporary demo). */
function shortlistStore() {
  let codes = [];
  try {
    codes = JSON.parse(localStorage.getItem(SHORTLIST_KEY) || '[]');
  } catch (e) {
    codes = [];
  }
  if (!Array.isArray(codes)) codes = [];
  const listeners = new Set();
  const save = (next) => {
    codes = next;
    try {
      localStorage.setItem(SHORTLIST_KEY, JSON.stringify(codes));
    } catch (e) {
      // private mode or blocked storage: kept for this page only
    }
    listeners.forEach((listener) => listener(codes));
  };
  return {
    codes: () => [...codes],
    has: (code) => codes.includes(code),
    add: (code) => !codes.includes(code) && save([...codes, code]),
    remove: (code) => save(codes.filter((other) => other !== code)),
    subscribe: (listener) => listeners.add(listener),
  };
}

/* ----------------------------------------------------------------- the fan */

/**
 * The fan's spread: 90 degrees, narrower on phones so the outer leaves' top corners stay
 * FAN_EDGE_GAP inside the screen's edges (6 degrees a side at least).
 */
function fanDegrees(stage, count) {
  if (!MOBILE_MEDIA.matches || count < 2) return FAN_DEGREES;
  // layout sizes (the leaves' transforms left out; no body zoom below 992px)
  const leafHeight = stage.querySelector('.fd-leaf')?.offsetHeight || 0;
  const { left, width } = stage.getBoundingClientRect();
  if (!width || !leafHeight) return FAN_DEGREES;
  const pivot = left + width / 2;
  const room = Math.min(pivot, document.documentElement.clientWidth - pivot) - FAN_EDGE_GAP;
  const reach = (degrees) => {
    const radians = (degrees * Math.PI) / 180;
    return leafHeight * Math.sin(radians) + (LEAF_WIDTH / 2) * Math.cos(radians);
  };
  let half = FAN_DEGREES / 2;
  while (half > 6 && reach(half) > room) half -= 0.5;
  return half * 2;
}

function buildLeaf(shade, index, siblings) {
  return el(
    'button',
    {
      type: 'button',
      className: 'fd-leaf',
      'data-index': index,
      'aria-label': `${shade.name}, ${shade.code}`,
      'aria-haspopup': 'dialog',
      style: `--fd-leaf: ${shade.hex}; --fd-ink: ${inkOn(shade)}; --fd-i: ${index}`,
    },
    el(
      'span',
      { className: 'fd-leaf-card' },
      el(
        'span',
        { className: 'fd-leaf-head' },
        el('span', { className: 'fd-leaf-name' }, shade.name),
        el('span', { className: 'fd-leaf-code' }, shade.code),
      ),
      // the page's other shades: a pointer opens them; the leaf is the keyboard's way in
      el('span', { className: 'fd-leaf-swatches' }, ...siblings.map((other) => el('span', {
        className: 'fd-leaf-swatch', 'data-code': other.code, style: `background-color: ${other.hex}`,
      }))),
      el('span', { className: 'fd-leaf-foot' }),
    ),
  );
}

/* --------------------------------------------------------------------- block */

let instanceCount = 0;

/**
 * Renders the fandeck's shell at once (family chips and fan as placeholders) and fills it when the
 * shade API arrives; not awaited.
 * @param {Element} block The block element
 */
export default function decorate(block) {
  instanceCount += 1;
  const uid = `fandeck-${instanceCount}`;
  const config = readConfig(block);
  const dataReady = sharedJson(apiUrl(config.api)?.href);
  // what shows and hides with the view: the block's section when it holds nothing else
  const wrapper = block.parentElement?.classList.contains('fandeck-wrapper') ? block.parentElement : block;
  const section = block.closest('.section');
  const container = section && [...section.children].every((child) => child === wrapper)
    ? section : wrapper;
  const setShown = (visible) => {
    container.hidden = !visible;
    container.style.display = visible ? '' : 'none';
  };
  // with catalogue-listing-v2 on the page, hidden until its toggle picks the fandeck (its section
  // then sits right under that block's bar: see fandeck.css)
  const paired = Boolean(document.querySelector('.catalogue-listing-v2'));
  setShown(!paired);
  if (paired && container === section) section.classList.add('fd-paired');

  let model = {
    shades: [], pages: new Map(), families: [], byCode: new Map(),
  };
  const shortlist = shortlistStore();
  const loadPalette = paletteLoader(config, () => model);
  const fan = {
    family: null, page: 0, hover: null, tap: null, active: null, entering: 0,
  };

  /* ---- colour family chips */
  const chips = el('div', {
    className: 'fd-families',
    role: 'group',
    'aria-label': TEMP_CONTENT.familiesLabel,
  }, ...Array.from({ length: SKELETON_FAMILIES }, () => el('span', { className: 'fd-family-skeleton' })));
  const chipsNav = el('nav', { className: 'fd-families-nav' }, chips);

  /* ---- search (name or code) */
  const resultsId = `${uid}-results`;
  const searchInput = el('input', {
    type: 'search',
    className: 'fd-search-input',
    placeholder: TEMP_CONTENT.search.placeholder,
    'aria-label': TEMP_CONTENT.search.label,
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': resultsId,
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const searchResults = el('ul', {
    className: 'fd-search-results', id: resultsId, role: 'listbox', hidden: true,
  });
  const search = el(
    'div',
    { className: 'fd-search', role: 'search' },
    el('div', { className: 'fd-search-box' }, icon('search'), searchInput),
    searchResults,
  );

  /* ---- the fan, its hint and pages */
  const stage = el(
    'div',
    { className: 'fd-stage' },
    el('span', { className: 'fd-dot', 'aria-hidden': 'true' }),
  );
  // placeholders fanned out until the shades arrive (the source: 90°, 34° on phones)
  const skeletonDegrees = MOBILE_MEDIA.matches ? 34 : FAN_DEGREES;
  const leaves = el(
    'div',
    {
      className: 'fd-leaves', role: 'group', 'aria-label': TEMP_CONTENT.fanLabel, 'aria-busy': 'true',
    },
    ...Array.from({ length: FAN_SIZE }, (item, index) => el('span', {
      className: 'fd-leaf-skeleton',
      style: `--fd-angle: ${-skeletonDegrees / 2 + (index * skeletonDegrees) / (FAN_SIZE - 1)}deg`,
    })),
  );
  stage.append(leaves);
  const empty = el(
    'div',
    { className: 'fd-empty', hidden: true },
    el('p', { className: 'fd-empty-title' }, TEMP_CONTENT.empty),
    el('p', { className: 'fd-empty-hint' }, TEMP_CONTENT.emptyHint),
  );
  const previous = el('button', {
    type: 'button', className: 'fd-page-button', 'aria-label': TEMP_CONTENT.previous, disabled: true,
  }, icon('previous'));
  const next = el('button', {
    type: 'button', className: 'fd-page-button', 'aria-label': TEMP_CONTENT.next, disabled: true,
  }, icon('next'));
  const pageStatus = el('span', { className: 'fd-page-status', 'aria-live': 'polite' });
  const pager = el('div', { className: 'fd-pager', hidden: true }, previous, pageStatus, next);
  const main = el(
    'div',
    { className: 'fd-main' },
    stage,
    empty,
    el('p', { className: 'fd-hint', 'aria-hidden': 'true' }, TEMP_CONTENT.hint),
    pager,
  );

  /* ---- shortlist button (bottom right) */
  const shortlistCount = el('span', { className: 'fd-shortlist-count', hidden: true });
  const shortlistOpen = el(
    'button',
    { type: 'button', className: 'fd-shortlist-open' },
    icon('heart', 22),
    shortlistCount,
  );
  const updateShortlistButton = (codes) => {
    shortlistCount.textContent = `${codes.length}`;
    shortlistCount.hidden = !codes.length;
    shortlistOpen.setAttribute('aria-label', `${TEMP_CONTENT.shortlist.open} — ${codes.length} ${TEMP_CONTENT.shortlist.saved}`);
  };
  updateShortlistButton(shortlist.codes());
  shortlist.subscribe(updateShortlistButton);

  // own top part when it shows on its own
  const head = el('div', { className: 'fd-head', hidden: true });
  block.replaceChildren(head, main, shortlistOpen);

  /* ---- fan rendering */
  const familyOf = (key) => model.families.find((family) => family.key === key);
  const pageCount = () => Math.max(
    1,
    Math.ceil((familyOf(fan.family)?.shades.length || 0) / FAN_SIZE),
  );
  const leafButtons = () => [...leaves.querySelectorAll('.fd-leaf')];
  const lifted = () => (MOBILE_MEDIA.matches ? fan.tap ?? fan.active : fan.hover ?? fan.active);

  /** angles, lift and stacking of the leaves: the lifted one up 8px, its neighbours 2° aside */
  const layout = () => {
    const buttons = leafButtons();
    const count = buttons.length;
    const degrees = fanDegrees(stage, count);
    const step = count > 1 ? degrees / (count - 1) : 0;
    const up = lifted();
    buttons.forEach((button, index) => {
      let angle = -degrees / 2 + index * step;
      if (up !== null && Math.abs(index - up) === 1) angle += index > up ? 2 : -2;
      // an outer leaf leaning aside stays within the fan (on phones, off the screen's edges)
      angle = Math.min(Math.max(angle, -degrees / 2), degrees / 2);
      if (up === index) button.style.zIndex = `${count + 10}`;
      else button.style.zIndex = `${up === null ? index + 1 : count - Math.abs(index - up)}`;
      button.style.setProperty('--fd-angle', `${angle}deg`);
      button.classList.toggle('is-lifted', up === index);
    });
  };

  /** The leaves fan out from upright, one after another, as the source */
  const animateIn = () => {
    const buttons = leafButtons();
    if (!buttons.length || REDUCED_MOTION.matches) return;
    fan.entering += 1;
    const run = fan.entering;
    leaves.classList.add('is-entering');
    buttons.forEach((button) => button.style.setProperty('--fd-angle', '0deg'));
    // eslint-disable-next-line no-unused-expressions
    leaves.offsetWidth; // start from upright
    leaves.classList.add('is-spreading');
    layout();
    setTimeout(() => {
      if (run !== fan.entering) return;
      leaves.classList.remove('is-entering', 'is-spreading');
    }, 30 * buttons.length + 520);
  };

  const renderFan = ({ animate = true } = {}) => {
    const family = familyOf(fan.family);
    const shades = family?.shades || [];
    const pages = pageCount();
    fan.page = Math.min(Math.max(fan.page, 0), pages - 1);
    const pageShades = shades.slice(fan.page * FAN_SIZE, (fan.page + 1) * FAN_SIZE);
    leaves.replaceChildren(...pageShades.map((shade, index) => {
      const leaf = buildLeaf(shade, index, pageSiblings(model, shade));
      leaf.tabIndex = index === 0 ? 0 : -1;
      return leaf;
    }));
    leaves.removeAttribute('aria-busy');
    stage.hidden = !pageShades.length;
    empty.hidden = Boolean(pageShades.length);
    pager.hidden = pages < 2;
    previous.disabled = fan.page === 0;
    next.disabled = fan.page >= pages - 1;
    pageStatus.textContent = `${fan.page + 1} / ${pages}`;
    layout();
    if (animate) animateIn();
  };

  const syncChips = () => {
    chips.querySelectorAll('.fd-family').forEach((chip) => {
      const picked = chip.dataset.family === fan.family;
      chip.setAttribute('aria-pressed', `${picked}`);
      chip.querySelector('.fd-family-count').hidden = !picked;
    });
  };

  const scrollChipIntoView = () => {
    const chip = chips.querySelector(`[data-family="${CSS.escape(fan.family || '')}"]`);
    if (!chip || chips.scrollWidth <= chips.clientWidth) return;
    const left = chip.offsetLeft - (chips.clientWidth - chip.offsetWidth) / 2;
    chips.scrollTo({ left, behavior: REDUCED_MOTION.matches ? 'auto' : 'smooth' });
  };

  const setFamily = (key, page = 0) => {
    const changed = key !== fan.family || page !== fan.page;
    fan.family = key;
    fan.page = page;
    fan.hover = null;
    fan.tap = null;
    fan.active = null;
    syncChips();
    scrollChipIntoView();
    if (changed) renderFan();
  };

  /* ---- shade drawer and shortlist screen (fandeck-panels.js, loaded on first use) */
  let panels = null;
  const loadPanels = () => {
    panels = panels || import('./fandeck-panels.js')
      .then(({ default: createPanels }) => createPanels({
        block,
        el,
        icon,
        inkOn,
        labels: TEMP_CONTENT,
        shortlist,
        loadPalette,
        // eslint-disable-next-line no-use-before-define
        onPick: (shade) => focusShade(shade),
        onClose: () => {
          const index = fan.active;
          fan.active = null;
          fan.tap = null;
          layout();
          if (index !== null) leafButtons()[index]?.focus({ preventScroll: true });
        },
        // eslint-disable-next-line no-use-before-define
        onBack: () => showShortlist(false),
        shadeByCode: (code) => model.byCode.get(code),
      }))
      .catch(() => null);
    return panels;
  };

  const openShade = async (shade) => {
    const view = await loadPanels();
    if (view) view.open(shade);
    else if (shade.pageUrl) window.open(shade.pageUrl, '_blank', 'noopener');
  };

  /** A shade picked outside the fan (search, palette): its family and page, lifted */
  const focusShade = (shade) => {
    const family = familyOf(shade.family);
    const index = family ? family.shades.indexOf(shade) : -1;
    if (index < 0) return;
    setFamily(shade.family, Math.floor(index / FAN_SIZE));
    fan.active = index % FAN_SIZE;
    layout();
  };

  const showShortlist = async (show) => {
    const view = show ? await loadPanels() : await panels;
    if (show && !view) return;
    main.hidden = show;
    chipsNav.hidden = show;
    search.hidden = show;
    shortlistOpen.hidden = show;
    view?.showShortlist(show);
    if (!show) {
      layout();
      leafButtons()[0]?.focus({ preventScroll: true });
    }
  };
  shortlistOpen.addEventListener('click', () => showShortlist(true));

  /* ---- fan events */
  const leafOf = (target) => target?.closest?.('.fd-leaf');
  const indexOf = (leaf) => Number(leaf.dataset.index);
  const shadeOfLeaf = (leaf) => familyOf(fan.family)?.shades[fan.page * FAN_SIZE + indexOf(leaf)];

  leaves.addEventListener('click', (event) => {
    const leaf = leafOf(event.target);
    if (!leaf) return;
    const index = indexOf(leaf);
    const swatchCode = event.target.closest('.fd-leaf-swatch')?.dataset.code;
    const shade = (swatchCode && model.byCode.get(swatchCode)) || shadeOfLeaf(leaf);
    if (!shade) return;
    // phones: a first tap lifts the leaf, the next opens it (keyboard clicks open at once)
    if (MOBILE_MEDIA.matches && event.detail !== 0 && lifted() !== index) {
      fan.tap = index;
      layout();
      return;
    }
    fan.active = index;
    layout();
    openShade(shade);
  });
  leaves.addEventListener('pointerover', (event) => {
    const leaf = leafOf(event.target);
    if (event.pointerType !== 'mouse' || !leaf) return;
    fan.hover = indexOf(leaf);
    layout();
  });
  leaves.addEventListener('pointerleave', (event) => {
    if (event.pointerType !== 'mouse') return;
    fan.hover = null;
    layout();
  });
  leaves.addEventListener('focusin', (event) => {
    const leaf = leafOf(event.target);
    if (!leaf) return;
    leafButtons().forEach((button) => { button.tabIndex = button === leaf ? 0 : -1; });
    // keyboard focus lifts the leaf (a tap or click focuses it too, but lifts on its own terms)
    if (!leaf.matches(':focus-visible')) return;
    if (MOBILE_MEDIA.matches) fan.tap = indexOf(leaf);
    else fan.hover = indexOf(leaf);
    layout();
  });
  leaves.addEventListener('focusout', (event) => {
    if (leaves.contains(event.relatedTarget)) return;
    fan.hover = null;
    layout();
  });
  // arrows move along the fan (one tab stop for the leaves)
  leaves.addEventListener('keydown', (event) => {
    const leaf = leafOf(event.target);
    const moves = {
      ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1,
    };
    if (!leaf) return;
    const buttons = leafButtons();
    let target = null;
    if (event.key in moves) target = buttons[indexOf(leaf) + moves[event.key]];
    else if (event.key === 'Home') [target] = buttons;
    else if (event.key === 'End') target = buttons[buttons.length - 1];
    if (!target) return;
    event.preventDefault();
    target.focus();
  });

  // phones: a finger moving over the fan lifts the leaf under it; a swipe lifts the next one
  let touchX = null;
  stage.addEventListener('touchstart', (event) => {
    touchX = event.touches[0]?.clientX ?? null;
  }, { passive: true });
  stage.addEventListener('touchmove', (event) => {
    const touch = event.touches[0];
    if (!MOBILE_MEDIA.matches || !touch) return;
    const leaf = leafOf(document.elementFromPoint(touch.clientX, touch.clientY));
    if (!leaf || indexOf(leaf) === fan.tap) return;
    fan.tap = indexOf(leaf);
    layout();
  }, { passive: true });
  stage.addEventListener('touchend', (event) => {
    if (touchX === null || !MOBILE_MEDIA.matches) return;
    const distance = (event.changedTouches[0]?.clientX ?? touchX) - touchX;
    touchX = null;
    if (Math.abs(distance) <= SWIPE_DISTANCE) return;
    const last = leafButtons().length - 1;
    const from = lifted();
    fan.tap = from === null ? 0 : Math.min(Math.max(from + (distance < 0 ? 1 : -1), 0), last);
    layout();
  }, { passive: true });
  // a press anywhere else puts the leaves back
  document.addEventListener('pointerdown', (event) => {
    if (leafOf(event.target) || fan.active !== null) return;
    if (fan.tap === null && fan.hover === null) return;
    fan.tap = null;
    fan.hover = null;
    layout();
  });

  previous.addEventListener('click', () => setFamily(fan.family, fan.page - 1));
  next.addEventListener('click', () => setFamily(fan.family, fan.page + 1));
  new ResizeObserver(() => layout()).observe(stage);
  MOBILE_MEDIA.addEventListener('change', () => {
    fan.hover = null;
    fan.tap = null;
    layout();
  });

  /* ---- chips: drag or wheel to scroll, as the source */
  chips.addEventListener('click', (event) => {
    const chip = event.target.closest('.fd-family');
    if (!chip || chips.dataset.dragged === 'true') return;
    if (main.hidden) showShortlist(false);
    setFamily(chip.dataset.family);
  });
  // the wheel scrolls the chips sideways; at either end the page scrolls on
  chips.addEventListener('wheel', (event) => {
    const max = chips.scrollWidth - chips.clientWidth;
    if (max <= 0 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const left = Math.min(Math.max(chips.scrollLeft + event.deltaY, 0), max);
    if (left === chips.scrollLeft) return;
    event.preventDefault();
    chips.scrollLeft = left;
  }, { passive: false });
  let drag = null;
  chips.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse') return;
    drag = { x: event.clientX, left: chips.scrollLeft, moved: false };
    chips.dataset.dragged = 'false';
  });
  chips.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const distance = event.clientX - drag.x;
    if (Math.abs(distance) > 4) drag.moved = true;
    chips.scrollLeft = drag.left - 1.5 * distance;
  });
  const endDrag = () => {
    if (drag?.moved) chips.dataset.dragged = 'true';
    drag = null;
    // the click that ends a drag is not a pick
    setTimeout(() => { chips.dataset.dragged = 'false'; }, 0);
  };
  chips.addEventListener('pointerup', endDrag);
  chips.addEventListener('pointerleave', endDrag);

  /* ---- search: up to 8 shades whose name or code has the text (2 characters or more) */
  let searchTimer = 0;
  let activeResult = -1;
  const resultItems = () => [...searchResults.querySelectorAll('[role="option"]')];
  const closeResults = () => {
    searchResults.hidden = true;
    searchInput.setAttribute('aria-expanded', 'false');
    searchInput.removeAttribute('aria-activedescendant');
    activeResult = -1;
  };
  const markResult = (index) => {
    const items = resultItems();
    activeResult = index;
    items.forEach((item, i) => item.setAttribute('aria-selected', `${i === index}`));
    if (items[index]) {
      searchInput.setAttribute('aria-activedescendant', items[index].id);
      items[index].scrollIntoView({ block: 'nearest' });
    } else searchInput.removeAttribute('aria-activedescendant');
  };
  const pickResult = (shade) => {
    searchInput.value = '';
    closeResults();
    focusShade(shade);
    openShade(shade);
  };
  const runSearch = () => {
    const text = normal(searchInput.value);
    const found = text.length < SEARCH_MIN ? [] : model.shades
      .filter((shade) => normal(shade.name).includes(text) || normal(shade.code).includes(text))
      .slice(0, SEARCH_MAX);
    searchResults.replaceChildren(...found.map((shade, index) => {
      const item = el(
        'li',
        {
          className: 'fd-search-result',
          id: `${resultsId}-${index}`,
          role: 'option',
          'aria-selected': 'false',
          'aria-label': `${shade.name}, ${shade.code}`,
        },
        el('span', { className: 'fd-search-swatch', style: `background-color: ${shade.hex}` }),
        el(
          'span',
          { className: 'fd-search-text' },
          el('span', { className: 'fd-search-name' }, shade.name),
          el('span', { className: 'fd-search-code' }, shade.code),
        ),
        el('span', { className: 'fd-search-family' }, titleCase(shade.family)),
      );
      // keep the focus in the box
      item.addEventListener('mousedown', (event) => event.preventDefault());
      item.addEventListener('click', () => pickResult(shade));
      return item;
    }));
    const open = Boolean(found.length) && document.activeElement === searchInput;
    searchResults.hidden = !open;
    searchInput.setAttribute('aria-expanded', `${open}`);
    markResult(-1);
  };
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, SEARCH_DELAY);
  });
  searchInput.addEventListener('focus', () => {
    if (searchResults.children.length) {
      searchResults.hidden = false;
      searchInput.setAttribute('aria-expanded', 'true');
    }
  });
  searchInput.addEventListener('blur', closeResults);
  searchInput.addEventListener('keydown', (event) => {
    const items = resultItems();
    if (event.key === 'Escape') {
      if (searchResults.hidden) searchInput.value = '';
      closeResults();
    } else if (!items.length || searchResults.hidden) {
      // nothing to move through
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      markResult((activeResult + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      markResult(activeResult <= 0 ? items.length - 1 : activeResult - 1);
    } else if (event.key === 'Enter' && activeResult >= 0) {
      event.preventDefault();
      items[activeResult].click();
    }
  });

  /* ---- the view: own top part, or the catalogue's Fandeck view */
  let shown = !paired;
  const standalone = () => {
    head.replaceChildren(
      el(
        'div',
        { className: 'fd-head-row' },
        config.title ? el('h2', { className: 'fd-title' }, config.title) : null,
        search,
      ),
      chipsNav,
    );
    head.hidden = false;
    setShown(true);
    shown = true;
    layout();
  };
  registerFandeck({
    title: config.title,
    search,
    chips: chipsNav,
    show: () => {
      setShown(true);
      if (!shown) {
        shown = true;
        renderFan();
      }
    },
    hide: () => {
      setShown(false);
      shown = false;
      panels?.then((view) => view?.close());
    },
    standalone,
  });
  if (!paired) standalone();

  /* ---- data: not awaited (decorate() has returned by then) */
  dataReady.then((json) => {
    model = buildModel(json);
    chips.replaceChildren(...model.families.map((family) => el(
      'button',
      {
        type: 'button',
        className: 'fd-family',
        'data-family': family.key,
        'aria-pressed': 'false',
        'aria-label': `${family.name}, ${family.shades.length} ${TEMP_CONTENT.coloursLabel}`,
      },
      el('span', { className: 'fd-family-dot', style: `background-color: ${family.hex}` }),
      el('span', { className: 'fd-family-name' }, family.name),
      el('span', { className: 'fd-family-count', hidden: true }, `${family.shades.length}`),
    )));
    if (!model.families.length) {
      leaves.removeAttribute('aria-busy');
      stage.hidden = true;
      empty.hidden = false;
      return;
    }
    fan.family = model.families[0].key;
    syncChips();
    renderFan({ animate: shown });
  });
}
