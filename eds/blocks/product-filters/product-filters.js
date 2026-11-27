/*
 * Product Filters
 * The filter and compare bar of product listing pages (the source's `.filter-compare-container`
 * on /paint-products/interior-wall-paints/plain-finishes), placed after the category banner:
 *   - Filters: a panel of filter groups (range, sheen, properties, brand). Choosing values greys
 *     out the ones no product would match; Apply shows only the products matching every chosen
 *     value, hides ranges left empty, lists the choices as removable chips and records them in
 *     the address (?f=range:luxury&sheen:matt), so a filtered page can be shared. Reset clears.
 *   - Compare: the cards' Compare checkboxes (up to 3 products). With 2 or more, Compare Now
 *     opens the compare page (?compare=sku:<codes>) on www.asianpaints.com (beta only on pages
 *     served from beta). Compare Products opens a panel of all
 *     products by brand, with the same checkboxes and wishlist hearts.
 * It filters and compares the product cards rendered by the cards-nilaya blocks on the page
 * (their data-product-code, data-product-name and data-filters).
 *
 * Its data is the filters API response: by default the mock response mock/filters.json (filter
 * groups and options, the compare page and limit, and for the compare panel each range section's
 * selector and brand logo); the page metadata `product-filters-api` points it at a real API.
 * Authoring (optional): | Compare page | link | overrides the compare page.
 */
import { getMetadata } from '../../scripts/aem.js';
import { BETA_DOMAIN, PROD_DOMAIN } from '../../scripts/environment.js';
import { pushAdobeCalculatorEvents, pushAdobeSingleEvent, pushAdobeProductTitleClick } from '../../scripts/analytics_1.js';
import initWishlist, { wishlistHeart } from '../../scripts/wishlist.js';

const MOCK = new URL('./mock/filters.json', import.meta.url).href;
const DESKTOP = window.matchMedia('(min-width: 992px)');
const DEFAULT_COMPARE = '/paint-products/interior-wall-paints/compare-products.html';

let instances = 0;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

async function loadConfig() {
  try {
    const response = await fetch(getMetadata('product-filters-api') || MOCK);
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    return null;
  }
}

/* ===== COMPARE DATA (opt-in) : START ===== */
/**
 * The products of the compare panel from a sheet (| Compare data | /eds/compare-exterior.json |):
 * one row per product, columns range, logo, code, name, url, image, in the panel's order (the
 * source's compare panel lists every range of the category, not only the page's). Rows without a
 * code, name or range are skipped; null without the row or when the sheet does not load.
 */
async function loadCompareData(url) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    let json = await response.json();
    if (json[':type'] === 'multi-sheet') json = json[json[':names']?.[0]] || {};
    const rows = (Array.isArray(json.data) ? json.data : [])
      .map((row) => Object.fromEntries(Object.entries(row)
        .map(([key, value]) => [key.toLowerCase(), String(value ?? '').trim()])))
      .filter((row) => row.code && row.name && row.range);
    return rows.length ? rows : null;
  } catch (e) {
    return null;
  }
}
/* ===== COMPARE DATA (opt-in) : END ===== */

// links go to the live Asian Paints pages (www), and to beta only on pages served from beta
// (domains from scripts/environment.js)
const SITE_DOMAIN = window.location.hostname === BETA_DOMAIN ? BETA_DOMAIN : PROD_DOMAIN;
const ASIAN_PAINTS_HOSTS = [PROD_DOMAIN, BETA_DOMAIN, 'asianpaints.com'];

/**
 * An Asian Paints page URL on the site's domain (SITE_DOMAIN). Site-relative links (which the
 * content sync makes of authored www links) and www/beta.asianpaints.com links get that domain,
 * with the .html the site uses; other links are kept.
 * @param {string} href The link as authored or from the API
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

/** The product cards on the page, with their filter values. */
function collectProducts() {
  return [...document.querySelectorAll('.cards-nilaya [data-product-code]')].map((card) => {
    let filters = {};
    try {
      filters = JSON.parse(card.dataset.filters || '{}');
    } catch (e) {
      // no filter values: the card only shows without filters
    }
    return { card, code: card.dataset.productCode, filters };
  });
}

// every chosen value must be one of the product's values in that group, as on the source
const matches = (product, selection) => [...selection].every(([group, values]) => (
  [...values].every((value) => product.filters[group]?.includes(value))
));

const checkmark = () => el('span', 'product-filters-checkmark');

/** Filter selection <-> ?f=range:luxury,premium&sheen:matt (the source's format) */
function readSelection() {
  const selection = new Map();
  const param = new URLSearchParams(window.location.search).get('f');
  (param || '').split('&').forEach((part) => {
    const [group, values] = part.split(':');
    if (group && values) selection.set(group, new Set(values.split(',').filter(Boolean)));
  });
  return selection;
}

function writeSelection(selection) {
  const value = [...selection].map(([group, values]) => `${group}:${[...values].join(',')}`).join('&');
  const params = new URLSearchParams(window.location.search);
  params.delete('f');
  // encoded like the source (spaces as %20)
  const search = [params.toString(), value && `f=${encodeURIComponent(value)}`].filter(Boolean).join('&');
  const url = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
  if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.pushState({}, '', url);
  }
}

function wishlistButton(code, name) {
  return wishlistHeart({ code, name, className: 'product-filters-wishlist' });
}

export default async function decorate(block) {
  instances += 1;
  const id = `product-filters-${instances}`;

  // authored overrides: | Compare page | link |
  let authoredCompare = '';
  [...block.children].forEach((row) => {
    const [label, value] = row.children;
    const link = (value || label)?.querySelector('a[href]');
    if (link && /compare/i.test(label?.textContent || '')) {
      authoredCompare = siteUrl(link.getAttribute('href') || '', link.href);
    }
  });

  /* ===== COMPARE LABEL / FILTERS OF THIS PAGE (opt-in) : START ===== */
  // | Compare Label | Compare Brands | (optional): the compare button and panel title, e.g. as on
  // the source's range pages; default "Compare Products"
  let compareLabel = 'Compare Products';
  [...block.children].forEach((row) => {
    const [label, value] = row.children;
    const name = (label?.textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const text = (value?.textContent || '').trim();
    if (['compare label', 'compare button', 'compare text'].includes(name) && text) compareLabel = text;
  });
  // "Product Filters (page-filters)": the panel lists only the values of the page's products
  // (fitToPage); without it, every value of the filter data as before
  const pageFilters = block.classList.contains('page-filters');
  // | Compare data | /eds/compare-exterior.json | (optional): the compare panel's products from
  // that sheet (every range of the category, as on the source); without it, the page's cards
  let compareDataUrl = '';
  [...block.children].forEach((row) => {
    const [label, value] = row.children;
    const name = (label?.textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!['compare data', 'compare products', 'compare sheet'].includes(name) || !value) return;
    compareDataUrl = value.querySelector('a[href]')?.href || value.textContent.trim();
  });
  /* ===== COMPARE LABEL / FILTERS OF THIS PAGE (opt-in) : END ===== */

  /* ===== FILTER GROUPS (opt-in) : START ===== */
  // | Filter groups | range, warranty, sheen, BRAND | (optional, with "page-filters"): the groups
  // of the panel in that order, as on the source; a group the filter data does not have (e.g.
  // warranty) gets its values from the page's products (their filter-<group> column).
  // A group may list values in brackets, e.g. "range (premium, economy)": those always show, in
  // that order, and stay selectable even when no product on the page has them (as on the source)
  let filterGroups = [];
  const filterValues = new Map();
  [...block.children].forEach((row) => {
    const [label, value] = row.children;
    const name = (label?.textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!['filter groups', 'filters order', 'filter order'].includes(name) || !value) return;
    filterGroups = value.textContent.split(/,(?![^()]*\))/).map((entry) => {
      const [, group, values] = entry.trim().match(/^([^()]*?)\s*(?:\(([^)]*)\))?$/) || [];
      if (group && values) {
        filterValues.set(group.toLowerCase(), values.split(',').map((v) => v.trim().toLowerCase())
          .filter(Boolean));
      }
      return group;
    }).filter(Boolean);
  });
  /* ===== FILTER GROUPS (opt-in) : END ===== */

  block.replaceChildren();

  const config = await loadConfig();
  if (!config?.filters?.length) {
    block.closest('.section')?.setAttribute('hidden', '');
    return;
  }

  /* ===== FILTER GROUPS (opt-in) : START ===== */
  if (filterGroups.length && block.classList.contains('page-filters')) {
    const same = (a, b) => a.toLowerCase() === b.toLowerCase();
    const listed = filterGroups.map((name) => {
      const group = config.filters.find((data) => same(data.name, name)) || { name, options: [] };
      const values = filterValues.get(name.toLowerCase());
      if (!values) return group;
      // the listed values first, in their order, then the data's others
      const rest = (group.options || [])
        .filter((option) => !values.includes(String(option).toLowerCase()));
      return { ...group, options: [...values, ...rest] };
    });
    const others = config.filters
      .filter((group) => !filterGroups.some((name) => same(group.name, name)));
    config.filters = [...listed, ...others];
  }
  /* ===== FILTER GROUPS (opt-in) : END ===== */

  const comparePage = authoredCompare || siteUrl(config.compare?.page || DEFAULT_COMPARE);
  const compareLimit = Number(config.compare?.limit) || 3;

  let products = collectProducts();
  let applied = readSelection();
  const compared = [];

  /* ---- bar: chips, Filters and Compare Products buttons, Compare Now ---- */
  const chips = el('ul', 'product-filters-chips');
  chips.setAttribute('aria-label', 'Applied filters');

  const controls = el('div', 'product-filters-controls');
  const buttons = el('div', 'product-filters-buttons');
  const filterToggle = el('button', 'product-filters-toggle', 'Filters');
  filterToggle.type = 'button';
  filterToggle.append(el('span', 'product-filters-icon'));
  filterToggle.setAttribute('aria-expanded', 'false');
  filterToggle.setAttribute('aria-controls', `${id}-panel`);
  // COMPARE LABEL: authored, else 'Compare Products'
  const compareToggle = el('button', 'product-filters-compare-toggle', compareLabel);
  compareToggle.type = 'button';
  compareToggle.append(el('span', 'product-filters-icon'));
  compareToggle.setAttribute('aria-expanded', 'false');
  compareToggle.setAttribute('aria-controls', `${id}-compare`);
  buttons.append(filterToggle, compareToggle);

  const compareNowLink = () => {
    const a = el('a', 'product-filters-compare-now', 'Compare Now');
    a.append(el('span', 'product-filters-arrow'));
    a.hidden = true;
    return a;
  };
  const compareNow = compareNowLink();

  /* ---- filter panel ---- */
  const panel = el('div', 'product-filters-panel');
  panel.id = `${id}-panel`;
  panel.hidden = true;
  const groups = el('div', 'product-filters-groups');
  const options = [];
  config.filters.forEach((group, g) => {
    const fieldset = el('fieldset', 'product-filters-group');
    // FILTERS OF THIS PAGE: the group's name, to match the page's product values (fitToPage)
    fieldset.dataset.group = group.name;
    const legend = document.createElement('legend');
    const heading = el('button', 'product-filters-group-toggle', group.name);
    heading.type = 'button';
    heading.setAttribute('aria-expanded', 'false');
    heading.setAttribute('aria-controls', `${id}-group-${g}`);
    legend.append(heading);
    const list = el('ul', 'product-filters-options');
    list.id = `${id}-group-${g}`;
    list.hidden = true;
    (group.options || []).forEach((value) => {
      const li = el('li');
      const label = el('label', 'product-filters-option');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = String(value).toLowerCase();
      input.dataset.group = group.name;
      label.append(input, checkmark(), el('span', 'product-filters-option-name', value));
      li.append(label);
      list.append(li);
      options.push(input);
    });
    fieldset.append(legend, list);
    groups.append(fieldset);
  });

  /* ===== FILTERS OF THIS PAGE : START ===== */
  /*
   * As on the source, the panel lists only the groups and values of the page's products (e.g.
   * Ultima: Range luxury, Sheen high sheen, BRAND ultima; no Properties): values of the filter
   * data that no product here has are left out, values the products have that the data does not
   * list are added, a group left without values is hidden. Without products carrying filter
   * values (e.g. authored cards only), the panel keeps every value of the filter data.
   * Opt-in: only with the block option "page-filters", so other pages are unchanged.
   */
  function addOption(fieldset, value) {
    const li = el('li');
    const label = el('label', 'product-filters-option');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = String(value).toLowerCase();
    input.dataset.group = fieldset.dataset.group;
    label.append(input, checkmark(), el('span', 'product-filters-option-name', value));
    li.append(label);
    fieldset.querySelector('.product-filters-options').append(li);
    options.push(input);
  }

  function fitToPage() {
    // only on pages that ask for it: "Product Filters (page-filters)"
    if (!pageFilters) return;
    const present = new Map();
    products.forEach(({ filters }) => Object.entries(filters || {}).forEach(([group, values]) => {
      (Array.isArray(values) ? values : [values]).forEach((value) => {
        if (!present.has(group)) present.set(group, new Set());
        present.get(group).add(String(value).toLowerCase());
      });
    }));
    groups.querySelectorAll('.product-filters-group').forEach((fieldset) => {
      const { group } = fieldset.dataset;
      const values = present.get(group);
      if (values) {
        values.forEach((value) => {
          if (!options.some((input) => input.dataset.group === group && input.value === value)) {
            addOption(fieldset, value);
          }
        });
      }
      let shown = 0;
      fieldset.querySelectorAll('.product-filters-option input').forEach((input) => {
      // FILTER GROUPS: a value listed in the row always shows
        const show = !present.size || Boolean(values?.has(input.value)) || input.checked
          || Boolean(filterValues.get(group.toLowerCase())?.includes(input.value));

        input.closest('li').hidden = !show;
        if (show) shown += 1;
      });
      fieldset.hidden = !shown;
    });
  }
  /* ===== FILTERS OF THIS PAGE : END ===== */

  const actions = el('div', 'product-filters-actions');
  const apply = el('button', 'product-filters-action product-filters-apply', 'Apply');
  apply.type = 'button';
  const reset = el('button', 'product-filters-action product-filters-reset', 'Reset');
  reset.type = 'button';
  actions.append(apply, reset);
  panel.append(groups, actions);

  controls.append(buttons, compareNow, panel);

  /* ---- compare panel ---- */
  const comparePanel = el('div', 'product-filters-compare');
  comparePanel.id = `${id}-compare`;
  comparePanel.hidden = true;
  const compareHead = el('div', 'product-filters-compare-head');
  const back = el('button', 'product-filters-compare-back');
  back.type = 'button';
  back.setAttribute('aria-label', 'Close compare products');
  // COMPARE LABEL: authored, else 'Compare Products'
  const compareTitle = el('h2', 'product-filters-compare-title', compareLabel);

  compareTitle.id = `${id}-compare-title`;
  compareHead.append(back, compareTitle);
  const compareBody = el('div', 'product-filters-compare-body');
  const compareNowPanel = compareNowLink();

  [compareNow, compareNowPanel].forEach((link) => {
    link.addEventListener('click', () => {
      pushAdobeProductTitleClick({
        event: 'compare_button_click',
        productSku: compareNow.dataset.compareCodes?.split(',').join('|') || '',
        productName: compareNow.dataset.compareNames?.split(',').join('|') || '',
      });
    });
  });

  compareBody.append(compareNowPanel);
  comparePanel.append(compareHead, compareBody);
  comparePanel.setAttribute('role', 'region');
  comparePanel.setAttribute('aria-labelledby', compareTitle.id);

  block.append(chips, controls, comparePanel);

  /* ---- filtering ---- */
  const checkedSelection = () => {
    const selection = new Map();
    options.filter((input) => input.checked).forEach((input) => {
      if (!selection.has(input.dataset.group)) selection.set(input.dataset.group, new Set());
      selection.get(input.dataset.group).add(input.value);
    });
    return selection;
  };

  // grey out the values no product matching the current choice has, as on the source
  function updateAvailability() {
    const selection = checkedSelection();
    const matching = products.filter((product) => matches(product, selection));
    options.forEach((input) => {
      const available = input.checked || matching.some((product) => (
        product.filters[input.dataset.group]?.includes(input.value)))
        || Boolean(filterValues.get(input.dataset.group.toLowerCase())?.includes(input.value));
      input.disabled = !available;
    });
    const any = options.some((input) => input.checked);
    apply.disabled = !any && !applied.size;
    reset.disabled = !any;
  }

  // the panel shows the applied choice; unapplied changes are dropped when it closes
  function syncOptions() {
    options.forEach((input) => {
      input.checked = Boolean(applied.get(input.dataset.group)?.has(input.value));
    });
  }

  function renderChips() {
    chips.replaceChildren(...[...applied].flatMap(([group, values]) => [...values].map((value) => {
      const li = el('li', 'product-filters-chip');
      li.append(el('span', '', value));
      const remove = el('button', 'product-filters-chip-remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove filter ${value}`);
      remove.addEventListener('click', () => {
        applied.get(group)?.delete(value);
        if (!applied.get(group)?.size) applied.delete(group);
        syncOptions();
        // eslint-disable-next-line no-use-before-define
        commit(false);
        filterToggle.focus();
      });
      li.append(remove);
      return li;
    })));
  }

  // shows the matching cards; banners and empty ranges are hidden while filtering
  function filterCards() {
    const filtering = applied.size > 0;
    products.forEach((product) => {
      product.card.hidden = filtering && !matches(product, applied);
    });
    document.querySelectorAll('.cards-nilaya').forEach((cards) => {
      cards.querySelectorAll('.cards-nilaya-banner').forEach((banner) => { banner.hidden = filtering; });
      const section = cards.closest('.section');
      const visible = cards.querySelector('[data-product-code]:not([hidden])');
      if (section && cards.querySelector('[data-product-code]')) section.hidden = filtering && !visible;
    });
  }

  function scrollToListing() {
    const top = block.getBoundingClientRect().top + window.scrollY - 150;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
  }

  /* ---- compare ---- */
  function syncCompare() {
    const full = compared.length >= compareLimit;
    document.querySelectorAll('input[data-compare-code]').forEach((input) => {
      input.checked = compared.includes(input.dataset.compareCode);
      input.disabled = full && !input.checked;
    });
    const href = `${comparePage}?compare=sku:${compared.join(',')}`;
    const ready = compared.length > 1;
    [compareNow, compareNowPanel].forEach((link) => {
      link.href = href;

      link.dataset.compareCodes = compared.join(',');

      const compareNames = compared.map((code) => {
        const input = document.querySelector(
          `input[data-compare-code="${code}"]`,
        );

        return input?.getAttribute('aria-label')
          ?.replace('Compare ', '') || '';
      }).join(',');

      link.dataset.compareNames = compareNames;
    });
    compareNowPanel.hidden = !ready;
    compareNow.hidden = !ready || !comparePanel.hidden;
    block.classList.toggle('product-filters-comparing', !compareNow.hidden);
  }

  document.addEventListener('change', (e) => {
    const input = e.target.closest?.('input[data-compare-code]');
    if (!input) return;
    const code = input.dataset.compareCode;
    const index = compared.indexOf(code);

    const label = input.getAttribute('aria-label') || '';
    const productName = label.replace(/^Compare\s+/i, '');

    if (input.checked) {
      pushAdobeProductTitleClick({
        event: 'add_to_compare_click',
        productName,
        productSku: code,
      });
    }

    if (input.checked && index < 0 && compared.length < compareLimit) compared.push(code);
    if (!input.checked && index >= 0) compared.splice(index, 1);
    syncCompare();
  });

  // the compare panel: every product by brand, as on the source
  /* ===== COMPARE DATA : START ===== */
  // a product of the compare panel: from a card on the page, or a row of the compare data sheet
  const cardItem = (card) => {
    const img = card.querySelector('.cards-nilaya-image img');
    return {
      code: card.dataset.productCode,
      name: card.dataset.productName,
      href: card.querySelector('.cards-nilaya-title a')?.href,
      image: img && (img.currentSrc || img.src),
    };
  };
  let compareRows = null;
  // the sheet's ranges in its order, each with its logo (as the source's compare panel), or null
  function compareSections() {
    if (!compareRows) return null;
    const byRange = new Map();
    compareRows.forEach((row) => {
      if (!byRange.has(row.range)) byRange.set(row.range, { range: row.range, items: [] });
      const section = byRange.get(row.range);
      if (row.logo && !section.logo) {
        section.logo = { src: new URL(row.logo, 'https://www.asianpaints.com').href, alt: row.range };
      }
      section.items.push({
        code: row.code,
        name: row.name,
        href: row.url ? siteUrl(row.url) : '',
        image: row.image ? new URL(row.image, 'https://www.asianpaints.com').href : '',
      });
    });
    return [...byRange.values()];
  }
  /* ===== COMPARE DATA : END ===== */

  function buildComparePanel() {
    // COMPARE DATA: the sheet's ranges when authored, else the page's cards as before
    const sections = compareSections() || (config.sections || []).map((section) => ({
      ...section, block: document.querySelector(section.selector),
    })).filter((section) => section.block);
    // without sections in the response, one group per cards block
    if (!sections.length) {
      document.querySelectorAll('.cards-nilaya').forEach((cards) => {
        sections.push({ range: cards.dataset.range || '', block: cards });
      });
    }
    const brands = sections.map((section) => {
    // COMPARE DATA: the sheet's products, else the cards of the section's block
      const cards = section.items
        || [...section.block.querySelectorAll('[data-product-code]')].map(cardItem);
      if (!cards.length) return null;
      const brand = el('div', 'product-filters-brand');
      const title = el('h3', 'product-filters-brand-title');
      if (section.logo?.src) {
        const logo = document.createElement('img');
        logo.src = section.logo.src;
        logo.alt = section.logo.alt || section.range || '';
        if (section.logo.width) logo.width = section.logo.width;
        if (section.logo.height) logo.height = section.logo.height;
        logo.loading = 'lazy';
        title.append(logo);
      } else {
        title.textContent = section.range || '';
      }
      const list = el('ul', 'product-filters-brand-products');
      cards.forEach(({
        code, name, href, image,
      }) => {
        const li = el('li', 'product-filters-product');
        const a = el('a', 'product-filters-product-link');
        a.href = href || '#';
        if (image) {
          const img = document.createElement('img');
          img.src = image;
          img.alt = '';
          img.loading = 'lazy';
          img.width = 221;
          img.height = 264;
          a.append(img);
        }
        // long names are shortened like on the source; the full name stays the link's name
        const short = name.length > 20 ? `${name.slice(0, 20)}...` : name;
        const text = el('span', 'product-filters-product-name', short);
        if (short !== name) {
          text.setAttribute('aria-hidden', 'true');
          a.setAttribute('aria-label', name);
        }
        a.append(text);
        const compare = el('label', 'product-filters-option product-filters-product-compare');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.compareCode = code;
        input.setAttribute('aria-label', `Compare ${name}`);
        const labelText = el('span', 'product-filters-option-name', 'Compare');
        labelText.setAttribute('aria-hidden', 'true');
        compare.append(input, checkmark(), labelText);
        a.addEventListener('click', () => {
          pushAdobeProductTitleClick({
            event: 'product_tile_click',
            productName: name,
            destinationUrl: href || '',
            productSku: code,
          });
        });
        li.append(a, wishlistButton(code, name), compare);
        list.append(li);
      });
      brand.append(title, list);
      return brand;
    }).filter(Boolean);
    compareBody.replaceChildren(compareNowPanel, ...brands);
    initWishlist(block);
    syncCompare();
  }

  /* ---- open and close ---- */
  function closeFilters(restoreFocus) {
    if (panel.hidden) return;
    panel.hidden = true;
    filterToggle.setAttribute('aria-expanded', 'false');
    syncOptions();
    if (restoreFocus) filterToggle.focus();
  }

  function closeCompare(restoreFocus) {
    if (comparePanel.hidden) return;
    comparePanel.hidden = true;
    compareToggle.setAttribute('aria-expanded', 'false');
    filterToggle.disabled = false;
    block.classList.remove('product-filters-compare-open');
    syncCompare();
    if (restoreFocus) compareToggle.focus();
  }

  // applies the panel's choice (or the current one): cards, chips, address
  function commit(scroll) {
    filterCards();
    renderChips();
    writeSelection(applied);
    if (scroll) scrollToListing();
  }

  filterToggle.addEventListener('click', () => {
    if (!panel.hidden) {
      closeFilters(false);
      return;
    }
    // every group starts closed, as on the source
    groups.querySelectorAll('.product-filters-group-toggle').forEach((heading) => {
      heading.setAttribute('aria-expanded', 'false');
      document.getElementById(heading.getAttribute('aria-controls')).hidden = true;
    });
    syncOptions();
    updateAvailability();
    panel.hidden = false;
    filterToggle.setAttribute('aria-expanded', 'true');
  });

  // one group open at a time
  groups.addEventListener('click', (e) => {
    const heading = e.target.closest('.product-filters-group-toggle');
    if (!heading) return;
    const open = heading.getAttribute('aria-expanded') !== 'true';
    groups.querySelectorAll('.product-filters-group-toggle').forEach((other) => {
      other.setAttribute('aria-expanded', String(open && other === heading));
      document.getElementById(other.getAttribute('aria-controls')).hidden = !(open && other === heading);
    });
  });

  groups.addEventListener('change', updateAvailability);

  apply.addEventListener('click', () => {
    applied = checkedSelection();

    const toTitleCase = (str) => str
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    const appliedFilters = [...applied]
      .map(([group, values]) => `${toTitleCase(group)}: ${[...values].map(toTitleCase).join(', ')}`)
      .join(' | ');

    pushAdobeCalculatorEvents({
      event: 'filter_click',
      filter: appliedFilters,
    });

    closeFilters(false);
    commit(true);
    filterToggle.focus();
  });

  reset.addEventListener('click', () => {
    applied = new Map();
    options.forEach((input) => { input.checked = false; });
    closeFilters(false);
    commit(true);
    filterToggle.focus();
  });

  compareToggle.addEventListener('click', () => {
    if (!comparePanel.hidden) {
      closeCompare(false);
      return;
    }
    closeFilters(false);
    buildComparePanel();
    comparePanel.hidden = false;
    compareToggle.setAttribute('aria-expanded', 'true');
    // as on the source, filters wait until the compare panel is closed
    filterToggle.disabled = true;
    block.classList.add('product-filters-compare-open');
    syncCompare();
    // on mobile the panel covers the screen: start at its back button
    if (!DESKTOP.matches) back.focus();

    pushAdobeSingleEvent('compare_brands_pop_up');
  });

  back.addEventListener('click', () => closeCompare(true));

  block.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!panel.hidden) closeFilters(true);
    else if (!comparePanel.hidden) closeCompare(true);
  });

  // browser back/forward through applied filters
  window.addEventListener('popstate', () => {
    applied = readSelection();
    syncOptions();
    filterCards();
    renderChips();
  });

  document.addEventListener('product-cards:loaded', () => {
    products = collectProducts();
    // FILTERS OF THIS PAGE: the panel follows the page's products
    fitToPage();
    filterCards();
    syncCompare();
    if (!comparePanel.hidden) buildComparePanel();
  });

  // COMPARE DATA: loaded after the block shows (the panel opens on a click); rebuilt if open
  loadCompareData(compareDataUrl).then((rows) => {
    compareRows = rows;
    if (rows && !comparePanel.hidden) buildComparePanel();
  });

  // FILTERS OF THIS PAGE: the panel follows the page's products
  fitToPage();
  syncOptions();
  filterCards();
  renderChips();
  syncCompare();
}
