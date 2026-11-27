/*
 * Collection Listing
 * A product listing of textures (the source's `.collectionListing` on /interior-textures):
 *   - colour family tabs at the top (links to each colour's listing page)
 *   - a filter panel: Room type links, then filter groups (product, finish, collection, type).
 *     Values combine with OR inside a group and AND across groups; values no texture would match
 *     are greyed out. Applied values show as removable pills and are kept in the address
 *     (?f=collection:luxe,classic&finish:metallic), as on the source.
 *   - sort (popularity, latest), a grid of texture cards (photo, wishlist heart, name, up to
 *     three shade swatches that switch the photo, "+more"), and Load more (20 at a time).
 * On mobile the filters open in a full-screen panel and apply with Apply.
 *
 * Authoring (3 columns; rows recognised by their first cell):
 *   | Colour    | label, e.g. Reds & Oranges | one link per colour: text = hex, href = page |
 *   | Room type | label                      | link                                          |
 *   | Load more | 20                         |                                               |
 *   | Data      | link to the texture data (optional; default the DA workbook below)          |
 * A Colour row whose links have no hex code is the "All" tab (rainbow swatch).
 *
 * Data: the DA workbook /eds/interior-textures.json (synced from the source page by
 * tools/sync/texture-feed.mjs, or edited in DA), published so it is served from the EDS CDN: tab
 * collection-listing, one row per texture (code, name, url, image, popularity, latest, tag, stock,
 * shades, shade-<n>-code / -swatch / -image, filter-<group>); tab collection-listing-filters, one
 * row per filter group (group, options), in panel order. The Data row or the page metadata
 * collection-listing-api can point at other data, as a workbook or as an API answering
 * { filters: [{ name, options }], products: [...] } in the source's own format.
 */
import { getMetadata } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import { BETA_DOMAIN, PROD_DOMAIN } from '../../scripts/environment.js';
import {
  pushAdobeCtaClickEvent, pushAdobeProductTitleClick, pushAdobeCalculatorEvents,
} from '../../scripts/analytics_1.js';

// content, not code: read from the site root (also when the code lives in /eds/)
// const DATA = '/eds/interior-textures.json';
const TEXTURES_TAB = 'collection-listing';
const FILTERS_TAB = 'collection-listing-filters';
const MOBILE = window.matchMedia('(max-width: 991px)');
const HEX = /#[0-9a-f]{6}\b/i;
const PAGE_SIZE = 20;
const EAGER = 6;
// swatch rendition size (px): ~2-4 KB as JPEG; drawn at about the originals' width (~670-1000px)
// so the 21px circle shows the same zoomed-in crop as the original
const SHADE_SIZE = 150;
const SHADE_DRAW_SIZE = 700;

// links and DAM images go to the Asian Paints site: www, or beta on pages served from beta
// (domains from scripts/environment.js)
const SITE_DOMAIN = window.location.hostname === BETA_DOMAIN ? BETA_DOMAIN : PROD_DOMAIN;
const ASIAN_PAINTS_HOSTS = [PROD_DOMAIN, BETA_DOMAIN, 'asianpaints.com'];

let instances = 0;

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

// a DAM rendition, as the source requests it (square transform, cropped by CSS)
const rendition = (image, size) => (
  `${siteUrl(image.src)}.transform/cc-width-${size}-height-${size}/image.${image.imgExt || 'png'}`);

/** Reads the authored rows into the block's settings. */
function readConfig(block) {
  const config = {
    colours: [], rooms: [], pageSize: PAGE_SIZE, api: '',
  };
  [...block.children].forEach((row) => {
    const [keyCell, labelCell, valueCell] = row.children;
    const key = keyCell?.textContent.trim().toLowerCase() || '';
    const label = labelCell?.textContent.trim() || '';
    const links = [...row.querySelectorAll('a[href]')];
    if (key.startsWith('colour') || key.startsWith('color')) {
      config.colours.push({
        row,
        label: label.replace(HEX, '').trim(),
        swatches: (links.length ? links : [null]).map((a) => ({
          href: a ? linkUrl(a) : '',
          colour: (a?.textContent.match(HEX) || [''])[0],
        })),
      });
    } else if (key.startsWith('room')) {
      if (links[0]) {
        config.rooms.push({
          row, label: label || links[0].textContent.trim(), href: linkUrl(links[0]),
        });
      }
    } else if (key.startsWith('load')) {
      config.pageSize = Number.parseInt(label, 10) || PAGE_SIZE;
    } else if (key === 'data' || key === 'api') {
      config.api = links[0]?.href || valueCell?.textContent.trim() || label;
    }
  });
  return config;
}

const cellValues = (cell) => String(cell || '').split(',').map((value) => value.trim()).filter(Boolean);
const extension = (src) => (String(src).match(/\.([a-z0-9]+)$/i)?.[1] || 'png').toLowerCase();
const imageOf = (src) => (src ? { src, imgExt: extension(src) } : null);

/** A workbook row as a texture in the source's format (what the cards render). */
function textureFromRow(row) {
  const filterTitle = {};
  Object.entries(row).forEach(([key, cell]) => {
    const list = cellValues(cell);
    if (key.startsWith('filter-') && list.length) filterTitle[key.slice('filter-'.length)] = list;
  });
  const swatches = [1, 2, 3].map((n) => ({
    entityCode: row[`shade-${n}-code`],
    swatch: row[`shade-${n}-swatch`],
    listingImage: imageOf(row[`shade-${n}-image`] || row.image),
  })).filter((swatch) => swatch.entityCode && swatch.swatch);
  return {
    entityCode: row.code,
    entityName: row.name,
    pageUrl: row.url,
    popularity: String(row.popularity ?? ''),
    latest: String(row.latest ?? ''),
    featureTag: row.tag || '',
    stockLabel: row.stock || '',
    filterTitle,
    listingSwatchImageInfo: imageOf(row.image),
    swatchCount: Number(row.shades) || swatches.length,
    swatches,
  };
}

/**
 * The texture data: the DA workbook (multi-sheet, or one sheet of textures whose filter groups
 * then follow the filter-<group> columns), or an API answering in the source's format.
 */
function normalizeData(json) {
  if (Array.isArray(json?.products)) return json;
  const textures = json?.[':type'] === 'multi-sheet' ? json[TEXTURES_TAB]?.data : json?.data;
  if (!Array.isArray(textures)) return null;
  const products = textures.filter((row) => row.code && row.name).map(textureFromRow);
  let filters = json[FILTERS_TAB]?.data
    ?.map((row) => ({ name: row.group, options: cellValues(row.options) }));
  if (!filters?.length) {
    // no filters tab: the groups and their values in the order the textures list them
    const groups = new Map();
    products.forEach((product) => Object.entries(product.filterTitle).forEach(([group, list]) => {
      if (!groups.has(group)) groups.set(group, new Set());
      list.forEach((value) => groups.get(group).add(value));
    }));
    filters = [...groups].filter(([group]) => group !== 'room').map(([name, set]) => ({ name, options: [...set] }));
  }
  return { filters: filters.filter((group) => group.name && group.options.length), products };
}

async function loadData(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return normalizeData(await response.json());
  } catch (e) {
    return null;
  }
}

/** Filter selection <-> ?f=collection:luxe,classic&finish:metallic (the source's format) */
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
  !values.size || (product.filterTitle?.[group] || []).some((value) => values.has(value))
));

const copySelection = (selection) => new Map([...selection].map(([g, v]) => [g, new Set(v)]));

function buildColours(colours) {
  const nav = el('nav', 'collection-listing-colours');
  nav.setAttribute('aria-label', 'Colour families');
  const list = el('ul');
  const here = pagePath(window.location.href);
  const isHere = (swatch) => swatch.href && pagePath(swatch.href) === here;
  let current = colours.findIndex((colour) => colour.swatches.some(isHere));
  if (current < 0) current = 0;

  const swatchOf = (swatch, tag) => {
    const part = el(tag, 'collection-listing-colour-swatch');
    if (swatch.colour) part.style.setProperty('--swatch', swatch.colour);
    else part.classList.add('collection-listing-colour-all');
    return part;
  };

  colours.forEach((colour, i) => {
    const li = el('li', 'collection-listing-colour');
    moveInstrumentation(colour.row, li);
    if (i === current) li.classList.add('is-current');
    const swatches = el('span', 'collection-listing-colour-swatches');
    const name = el('span', 'collection-listing-colour-name', colour.label);

    if (colour.swatches.length === 1) {
      // one colour: the whole tab is its link
      const [swatch] = colour.swatches;
      const target = el(swatch.href ? 'a' : 'span', 'collection-listing-colour-link');
      if (swatch.href) target.href = swatch.href;
      if (i === current && swatch.href) target.setAttribute('aria-current', 'page');
      swatches.append(swatchOf(swatch, 'span'));
      target.append(swatches, name);
      if (swatch.href) {
        target.addEventListener('click', () => {
          const ctaText = colour.label;
          const swatchColor = swatch.colour;
          const rgbColor = swatchColor
            ? `rgb(${parseInt(swatch.colour.slice(1, 3), 16)
            }, ${parseInt(swatch.colour.slice(3, 5), 16)
            }, ${parseInt(swatch.colour.slice(5, 7), 16)
            })`
            : '';
          const destinationUrl = target.href;
          pushAdobeCtaClickEvent({
            event: 'colour_tab_click',
            detail: rgbColor,
            destinationUrl,
            cta: ctaText,
          });
        });
      }
      li.append(target);
    } else {
      // a pair (e.g. Reds & Oranges): one link per colour, as on the source
      const names = colour.label.split('&').map((part) => part.trim()).filter(Boolean);
      colour.swatches.forEach((swatch, s) => {
        const part = swatchOf(swatch, swatch.href ? 'a' : 'span');

        if (swatch.href) {
          part.href = swatch.href;
          part.setAttribute('aria-label', `${names[s] || colour.label} textures`);

          if (i === current && pagePath(swatch.href) === here) {
            part.setAttribute('aria-current', 'page');
          }

          part.addEventListener('click', () => {
            const ctaText = names[s] || colour.label;
            const swatchColor = swatch.colour;

            const rgbColor = swatchColor
              ? `rgb(${parseInt(swatchColor.slice(1, 3), 16)
              }, ${parseInt(swatchColor.slice(3, 5), 16)
              }, ${parseInt(swatchColor.slice(5, 7), 16)
              })`
              : '';

            pushAdobeCtaClickEvent({
              event: 'colour_tab_click',
              detail: rgbColor,
              destinationUrl: part.href,
              cta: ctaText,
            });
          });
        }

        swatches.append(part);
      });
      name.setAttribute('aria-hidden', 'true');
      li.append(swatches, name);
    }
    list.append(li);
  });
  nav.append(list);
  return { nav, current: colours[current]?.label || '' };
}

/** Resolves once the browser has reported the page's LCP (3 s at most) */
function afterLcp() {
  return new Promise((resolve) => {
    setTimeout(resolve, 3000);
    if (!window.PerformanceObserver?.supportedEntryTypes?.includes('largest-contentful-paint')) {
      requestAnimationFrame(() => setTimeout(resolve));
      return;
    }
    new PerformanceObserver((entries, observer) => {
      observer.disconnect();
      resolve();
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
}

export default async function decorate(block) {
  instances += 1;
  const id = `collection-listing-${instances}`;
  const config = readConfig(block);
  // ===== FIX START: mobile lists every texture, no Load more, like live (desktop: 20) =====
  const desktopPageSize = config.pageSize;
  Object.defineProperty(config, 'pageSize', {
    get: () => (MOBILE.matches ? Infinity : desktopPageSize),
  });
  // ===== FIX END =====

  block.replaceChildren();

  // the cards (the page's LCP) wait on both: load the wishlist script alongside the data
  // (preloaded by scripts/pre-load-image.js), not before the block can ask for the data
  // START FIX DATA FROM DA: the data comes from the block's Data row or the page metadata
  // collection-listing-api (bulk metadata in DA), no data path in the code
  const dataUrl = config.api || getMetadata('collection-listing-api');
  if (!dataUrl) return;
  // END FIX DATA FROM DA
  const [data, { default: initWishlist, wishlistHeart }] = await Promise.all([
    loadData(dataUrl),
    import('../../scripts/wishlist.js'),
  ]);
  if (!data) return;
  const groups = (data.filters || []).filter((group) => group.options?.length);

  /* ---- markup ---- */
  const colours = config.colours.length ? buildColours(config.colours) : null;

  const body = el('div', 'collection-listing-body');
  const current = el('p', 'collection-listing-current', colours?.current || '');

  // filter panel (inline on desktop, a full-screen dialog on mobile)
  const panel = el('div', 'collection-listing-filters');
  panel.id = `${id}-filters`;
  const panelHead = el('div', 'collection-listing-filters-head');
  const panelTitle = el('h2', 'collection-listing-filters-title', 'Filter');
  panelTitle.id = `${id}-filters-title`;
  const panelCount = el('span', 'collection-listing-count');
  panelTitle.append(panelCount);
  const close = el('button', 'collection-listing-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close filters');
  // Clear all sits by the title on desktop and in the bottom bar (with Apply) on mobile
  const clearAll = el('button', 'collection-listing-clear', 'Clear all');
  clearAll.type = 'button';
  panelHead.append(panelTitle, clearAll, close);
  const actions = el('div', 'collection-listing-filters-actions');
  const apply = el('button', 'collection-listing-apply', 'Apply');
  apply.type = 'button';
  actions.append(apply);

  const accordion = (title, open, content) => {
    const section = el('div', 'collection-listing-group');
    const heading = el('h3', 'collection-listing-group-title');
    const toggle = el('button', 'collection-listing-group-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(open));
    const label = el('span', '', title);
    const count = el('span', 'collection-listing-count');
    toggle.append(label, count);
    heading.append(toggle);
    content.id = `${id}-group-${panel.querySelectorAll('.collection-listing-group').length}`;
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

  panel.append(panelHead);
  // Room type: links to the room listing pages, drawn as radio options like the source
  if (config.rooms.length) {
    const rooms = el('ul', 'collection-listing-rooms');
    config.rooms.forEach((room) => {
      const li = el('li');
      moveInstrumentation(room.row, li);
      const a = el('a', 'collection-listing-room', room.label);
      a.href = room.href;
      a.addEventListener('click', () => {
        const filterValue = `Room Type : ${room.label}`;

        pushAdobeCalculatorEvents({
          event: 'filter_click',
          filter: filterValue,
        });
      });
      if (pagePath(room.href) === pagePath(window.location.href)) a.setAttribute('aria-current', 'page');
      li.append(a);
      rooms.append(li);
    });
    accordion('Room type', true, rooms);
  }
  const options = [];
  const groupCounts = new Map();
  groups.forEach((group) => {
    const fieldset = el('fieldset', 'collection-listing-options');
    const legend = el('legend', 'collection-listing-sr-only', group.name);
    fieldset.append(legend);
    group.options.forEach((value) => {
      const label = el('label', 'collection-listing-option');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = value;
      input.dataset.group = group.name;
      label.append(input, el('span', 'collection-listing-box'), el('span', 'collection-listing-option-name', value));
      fieldset.append(label);
      options.push(input);
    });
    groupCounts.set(group.name, accordion(group.name, false, fieldset));
  });
  panel.append(actions);

  // results: mobile Filter button, pills, sort, grid, load more
  const results = el('div', 'collection-listing-results');
  const bar = el('div', 'collection-listing-bar');
  const openFilters = el('button', 'collection-listing-open', 'Filter');
  openFilters.type = 'button';
  const openCount = el('span', 'collection-listing-count');
  openFilters.append(openCount);
  openFilters.setAttribute('aria-controls', panel.id);
  openFilters.setAttribute('aria-expanded', 'false');
  const pills = el('ul', 'collection-listing-pills');
  pills.setAttribute('aria-label', 'Applied filters');
  const sort = el('div', 'collection-listing-sort');
  const sortLabel = el('label', '', 'Sort by');
  const select = document.createElement('select');
  select.id = `${id}-sort`;
  sortLabel.htmlFor = select.id;
  [['POPULARITY', 'Popularity'], ['LATEST', 'Latest']].forEach(([value, text]) => {
    const option = el('option', '', text);
    option.value = value;
    select.append(option);
  });
  sort.append(sortLabel, select);
  bar.append(openFilters, pills, sort);

  const grid = el('ul', 'collection-listing-grid');
  grid.setAttribute('aria-label', 'Textures');
  const status = el('p', 'collection-listing-sr-only');
  status.setAttribute('role', 'status');
  const more = el('div', 'collection-listing-more');
  const loadMore = el('button', 'collection-listing-load', 'Load more');
  loadMore.type = 'button';
  more.append(loadMore);
  results.append(bar, grid, more, status);

  body.append(current, panel, results);
  block.append(...[colours?.nav, body].filter(Boolean));

  /* ---- state ---- */
  const products = data.products.map((product, i) => ({ ...product, index: i }));
  let applied = readSelection();
  let draft = copySelection(applied);
  let shown = config.pageSize;
  let list = [];
  // only the first screen of cards until the LCP is reported (see the end)
  let renderUpTo = EAGER;

  // as on the source: ascending by the number (empty first); Latest keeps popularity order
  // for ties, then the data order
  const rank = (item, key) => Number(item[key]) || 0;
  const sorted = (items) => [...items].sort((a, b) => (
    (select.value === 'LATEST' ? rank(a, 'latest') - rank(b, 'latest') : 0)
    || rank(a, 'popularity') - rank(b, 'popularity')
    || a.index - b.index));

  const isAvailable = (selection, group, value) => {
    const others = new Map([...selection].filter(([g]) => g !== group));
    return products.some((product) => matches(product, others)
      && (product.filterTitle?.[group] || []).includes(value));
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

  // a value is available when some texture matching the other groups' choices has it
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

  // the shared wishlist (scripts/wishlist.js): hearts are saved by SKU under type "textures",
  // as on the source; hearts added later are painted with wishlist.refresh()
  const wishlist = initWishlist(block);

  // the swatches are full-size DAM images (up to ~1 MB each) shown as CSS backgrounds, which the
  // browser fetches for every rendered card, even off screen: they are set only near the viewport,
  // as a small JPEG rendition (~2-4 KB); the original is used if the rendition does not load
  const showShades = (shades) => shades.querySelectorAll('[data-shade]').forEach((button) => {
    const original = button.dataset.shade;
    const small = new Image();
    const set = (src, size) => {
      if (size) button.style.setProperty('--shade-size', size);
      button.style.setProperty('--shade', `url("${src}")`);
    };
    small.onload = () => set(small.src, `${SHADE_DRAW_SIZE}px`);
    small.onerror = () => set(original);
    small.src = `${original}.transform/cc-width-${SHADE_SIZE}-height-${SHADE_SIZE}/image.jpeg`;
    button.removeAttribute('data-shade');
  });
  const shadeObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => entries.forEach(({ isIntersecting, target }) => {
      if (!isIntersecting) return;
      shadeObserver.unobserve(target);
      showShades(target);
    }), { rootMargin: '200px 0px' })
    : null;

  function card(product, position) {
    const li = el('li', 'collection-listing-card');
    const link = el('a', 'collection-listing-card-link');
    link.href = siteUrl(product.pageUrl);
    link.addEventListener('click', () => {
      pushAdobeProductTitleClick({
        event: 'product_tile_click',
        productName: product.entityName,
        destinationUrl: link.href,
        productSku: product.entityCode,
      });
    });
    const media = el('span', 'collection-listing-card-image');
    const picture = document.createElement('picture');
    const source = document.createElement('source');
    source.media = '(min-width: 992px)';
    const img = document.createElement('img');
    img.alt = '';
    img.width = 302;
    img.height = 251;
    img.loading = position < EAGER ? 'eager' : 'lazy';
    if (position === 0) img.fetchPriority = 'high';
    const show = (image) => {
      source.srcset = rendition(image, 302);
      img.src = rendition(image, 338);
    };
    show(product.listingSwatchImageInfo || product.swatches[0]?.listingImage);
    picture.append(source, img);
    media.append(picture);
    if (product.featureTag || product.stockLabel) {
      media.append(el('span', 'collection-listing-tag', product.featureTag || product.stockLabel));
    }
    link.append(media, el('h3', 'collection-listing-card-name', product.entityName));
    li.append(link);

    const heart = wishlistHeart({
      code: product.entityCode,
      type: 'textures',
      name: product.entityName,
      className: 'collection-listing-wishlist',
    });
    li.append(heart);

    if (product.swatches?.length) {
      const shades = el('div', 'collection-listing-shades');
      product.swatches.forEach((swatch, i) => {
        const button = el('button', 'collection-listing-shade');
        button.type = 'button';
        button.dataset.shade = siteUrl(swatch.swatch);
        button.setAttribute('aria-pressed', String(i === 0));
        button.setAttribute('aria-label', `${product.entityName}, shade ${i + 1}`);
        button.addEventListener('click', () => {
          shades.querySelectorAll('.collection-listing-shade').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
          show(swatch.listingImage);
          // the heart is for the shade on show, as on the source
          heart.dataset.attrSku = swatch.entityCode;
          heart.dataset.pid = swatch.entityCode;
          wishlist.refresh();
        });
        shades.append(button);
      });
      if (product.swatchCount > 3) {
        const extra = el('a', 'collection-listing-more-shades', '+more');
        extra.href = siteUrl(product.pageUrl);
        extra.setAttribute('aria-label', `More shades of ${product.entityName}`);
        shades.append(extra);
      }
      li.append(shades);
      if (shadeObserver) shadeObserver.observe(shades);
      else showShades(shades);
    }
    return li;
  }

  function renderGrid() {
    const from = grid.children.length;
    list.slice(from, Math.min(shown, renderUpTo))
      .forEach((product, i) => grid.append(card(product, from + i)));
    wishlist.refresh();
    loadMore.hidden = shown >= list.length;
    status.textContent = `Showing ${Math.min(shown, list.length)} of ${list.length} textures`;
  }

  function renderPills() {
    pills.replaceChildren(...[...applied].flatMap(([group, values]) => [...values].map((value) => {
      const li = el('li', 'collection-listing-pill');
      li.append(el('span', '', value));
      const remove = el('button', 'collection-listing-pill-remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove filter ${value}`);
      remove.addEventListener('click', () => {
        applied.get(group)?.delete(value);
        draft = copySelection(applied);
        // eslint-disable-next-line no-use-before-define
        render();
        (pills.querySelector('button') || openFilters).focus();
      });
      li.append(remove);
      return li;
    })));
  }

  function render() {
    prune(applied);
    draft = copySelection(applied);
    list = sorted(products.filter((product) => matches(product, applied)));
    shown = config.pageSize;
    shadeObserver?.disconnect();
    grid.replaceChildren();
    renderGrid();
    renderPills();
    updateOptions(draft);
    writeSelection(applied);
  }

  function getFilterTrackingValue(selection) {
    const parts = [];

    selection.forEach((values, group) => {
      if (!values.size) return;

      parts.push(`${group} : ${[...values].join('|')}`);
    });

    const roomType = document
      .querySelector('.collection-listing-room[aria-current="page"]')
      ?.textContent?.trim();

    if (roomType) {
      parts.push(`roomType : ${roomType}`);
    }

    return parts.join(' || ');
  }

  /* ---- interactions ---- */
  // desktop applies each change at once; mobile collects them until Apply
  panel.addEventListener('change', (e) => {
    const input = e.target.closest('input[data-group]');
    if (!input) return;

    const { group } = input.dataset;

    if (!draft.has(group)) draft.set(group, new Set());

    if (input.checked) {
      draft.get(group).add(input.value);
    } else {
      draft.get(group).delete(input.value);
    }

    const filterValue = getFilterTrackingValue(draft);

    pushAdobeCalculatorEvents({
      event: 'filter_click',
      filter: filterValue,
    });

    if (MOBILE.matches) {
      updateOptions(draft);
    } else {
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
    document.body.classList.add('collection-listing-locked');
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
    document.body.classList.remove('collection-listing-locked');
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
    draft = new Map();
    render();
  });
  MOBILE.addEventListener('change', () => closePanel(false));

  select.addEventListener('change', render);
  loadMore.addEventListener('click', () => {
    const next = grid.children.length;
    shown += config.pageSize;
    renderGrid();
    grid.children[next]?.querySelector('a')?.focus();
    const currentColour = document.querySelector(
      '.collection-listing-colour.is-current .collection-listing-colour-name',
    )?.textContent?.trim() || '';
    pushAdobeCtaClickEvent({
      event: 'custom_cta_click',
      parentTitle: currentColour,
      cta: 'Load more',
    });
  });

  // ===== FIX START: list again when crossing 992px (every texture on mobile, 20 on desktop) =====
  MOBILE.addEventListener('change', render);
  // ===== FIX END =====

  // ===== FIX START: like live, once the desktop filters dock
  const dock = () => {
    if (MOBILE.matches) return;
    const box = panel.getBoundingClientRect();
    const zoom = panel.offsetWidth ? box.width / panel.offsetWidth : 1;
    if (box.top <= parseFloat(getComputedStyle(panel).top) * zoom + 0.5) {
      panel.classList.add('is-docked');
      window.removeEventListener('scroll', dock);
    }
  };
  window.addEventListener('scroll', dock, { passive: true });
  // ===== FIX END =====

  // the first screen of cards first (the LCP image is among them), the rest once the LCP is
  // reported: requested before it, their images would share its bandwidth
  render();
  afterLcp().then(() => {
    renderUpTo = Infinity;
    renderGrid();
  });
}
