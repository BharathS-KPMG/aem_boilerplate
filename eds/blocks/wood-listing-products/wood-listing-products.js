/*
** Authoring format **

Block name: Wood Listing Products

Two-column rows: label | value
Source       → link to the products sheet, e.g. /wood-listing-products.json
Filters      → sheet columns shown as filter groups, in order,
               e.g. "Product Type, Range, Finish, Category"
Disclaimer   → text shown above the products (a leading * is shown in red)
Button Label → CTA label on every card (default "View Product")
<group name> → optional, option order for that filter group, e.g. "Range | italian luxury, premium"

Products sheet columns
Code, Name, Description, Image, Key Features (separated by |), Price, Unit (e.g. "per L"), Link,
plus one column per filter group with comma separated values (e.g. Finish: "matt, high gloss").

Filters work like the live AEM listing: options in one group are OR'ed, groups are AND'ed,
options no shown product has are disabled, and the selection is kept in the URL as
?f=range:italian luxury,premium&category:clear with the group names as authored in "Filters"
(links from other pages can preselect filters).
*/

import { createOptimizedPicture } from '../../scripts/aem.js';
import { pushAdobeCalculatorEvents, pushAdobeProductTitleClick } from '../../scripts/analytics_1.js';
// START FIX WISHLIST HEART
import initWishlist, { wishlistHeart } from '../../scripts/wishlist.js';
// END FIX WISHLIST HEART

const DESKTOP = window.matchMedia('(min-width: 992px)');

// START FIX COMPARE: the ticked codes for the visit, shared with the wood-compare-products block
// (same sessionStorage key there)
const COMPARE_STORAGE = 'wood-listing-products-compare';
// END FIX COMPARE

function text(el) {
  return (el?.textContent || '').trim();
}

function norm(value) {
  return (value || '').toString().trim().toLowerCase();
}

function list(value, separator = ',') {
  return (value || '').split(separator).map((v) => v.trim()).filter(Boolean);
}

function readConfig(block) {
  const config = {};
  [...block.children].forEach((row) => {
    const [label, value] = [...row.children];
    const key = norm(text(label)).replace(/[^a-z]+/g, ' ').trim();
    if (!key || !value) return;
    config[key] = value.querySelector('a[href]')?.getAttribute('href') || text(value);
  });
  return config;
}

// ?f=range:italian luxury,premium&category:clear (the whole rest of the URL after f=)
function readUrlFilters() {
  const { href } = window.location;
  const at = href.search(/[?&]f=/);
  if (at === -1) return {};
  let raw = href.slice(at + 3).split('#')[0];
  try {
    raw = decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch (e) {
    // keep the raw value
  }
  const selected = {};
  raw.split('&').forEach((part) => {
    const [key, values] = part.split(':');
    if (key && values) selected[norm(key)] = list(values).map(norm);
  });
  return selected;
}

function writeUrlFilters(groups, selected) {
  const parts = groups
    .filter((g) => selected[g.key].size)
    .map((g) => `${g.label}:${[...selected[g.key]].join(',')}`);
  const url = new URL(window.location.href);
  url.search = url.search.replace(/[?&]f=.*$/, '');
  const base = `${url.pathname}${url.search}`;
  const query = parts.length ? `${url.search ? '&' : '?'}f=${encodeURIComponent(parts.join('&'))}` : '';
  window.history.replaceState(null, '', `${base}${query}${url.hash}`);
}

// START FIX COMPARE
const yes = (value) => /^(yes|true|on|show|1)$/i.test(String(value || '').trim());

function readCompareSelection() {
  try {
    const codes = JSON.parse(window.sessionStorage.getItem(COMPARE_STORAGE) || '[]');
    return Array.isArray(codes) ? codes.map(String) : [];
  } catch (e) {
    return [];
  }
}

function saveCompareSelection(codes) {
  try {
    window.sessionStorage.setItem(COMPARE_STORAGE, JSON.stringify(codes));
  } catch (e) {
    // the selection lasts for this page view
  }
}

/** the compare page with the codes: ?compare=sku:a,b (after any query the link already has) */
function compareUrl(page, codes) {
  const [path, hash = ''] = page.split('#');
  const joiner = path.includes('?') ? '&' : '?';
  return `${path}${joiner}compare=sku:${codes.map(encodeURIComponent).join(',')}${hash ? `#${hash}` : ''}`;
}

/** the card's "+ COMPARE" checkbox (green tick when ticked, as on the AEM listing) */
function buildCompare(product, label) {
  const wrap = document.createElement('label');
  wrap.className = 'wood-listing-products-compare';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.dataset.compareCode = product.code;
  input.setAttribute('aria-label', `${label}: ${product.name}`);
  const mark = document.createElement('span');
  mark.className = 'wood-listing-products-compare-mark';
  mark.setAttribute('aria-hidden', 'true');
  const caption = document.createElement('span');
  caption.className = 'wood-listing-products-compare-label';
  caption.textContent = label;
  caption.setAttribute('aria-hidden', 'true');
  wrap.append(input, mark, caption);
  return wrap;
}

/**
 * The compare selection: 2 to `limit` products. Ticking one past the limit is not possible
 * (the other checkboxes are disabled); the button shows from 2 ticked products.
 */
function setupCompare(block, cards, config) {
  const limit = Math.max(2, Number.parseInt(config['compare limit'], 10) || 3);
  const page = config['compare page'];
  const inputs = cards.flatMap((card) => [...card.querySelectorAll('input[data-compare-code]')]);
  const known = new Set(inputs.map((input) => input.dataset.compareCode));

  // START FIX COMPARE RESET ON REFRESH: only a refresh starts with nothing ticked. Following a link
  // from the compare page (its Back / Add Product links) the ticks are the products still on that
  // page (its ?compare=sku:a,b, so a product removed there is unticked); otherwise, e.g. the
  // browser's Back (whose referrer is the page's first one), the selection of the visit (this tab)
  const navigation = window.performance?.getEntriesByType?.('navigation')?.[0];
  const fromComparePage = () => {
    try {
      const referrer = new URL(document.referrer);
      if (referrer.origin !== window.location.origin) return null;
      const value = referrer.searchParams.get('compare');
      return value === null ? null : value.replace(/^sku:/i, '').split(',')
        .map((code) => code.split(/[?&#]/)[0].trim()).filter(Boolean);
    } catch (e) {
      return null;
    }
  };
  let compared = [];
  if (navigation?.type === 'back_forward') compared = readCompareSelection();
  else if (navigation?.type !== 'reload') compared = fromComparePage() || readCompareSelection();
  compared = compared.filter((code) => known.has(code)).slice(0, limit);
  // END FIX COMPARE RESET ON REFRESH

  const button = document.createElement('a');
  button.className = 'wood-listing-products-compare-now';
  button.textContent = config['compare button text'] || 'Compare Products';

  button.addEventListener('click', () => {
    const compareNames = compared.map((code) => {
      const input = block.querySelector(
        `input[data-compare-code="${code}"]`,
      );

      return input?.getAttribute('aria-label')
        ?.replace(/^COMPARE:\s*/i, '') || '';
    }).join('|');

    pushAdobeProductTitleClick({
      event: 'compare_button_click',
      productSku: compared.join('|'),
      productName: compareNames,
    });
  });

  const arrow = document.createElement('span');
  arrow.className = 'wood-listing-products-compare-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  button.append(arrow);
  const status = document.createElement('p');
  status.className = 'wood-listing-products-compare-status';
  status.setAttribute('role', 'status');

  const update = () => {
    const full = compared.length >= limit;
    inputs.forEach((input) => {
      input.checked = compared.includes(input.dataset.compareCode);
      input.disabled = full && !input.checked;
      input.closest('label').classList.toggle('is-disabled', input.disabled);
    });
    const ready = compared.length >= 2 && !!page;
    button.hidden = !ready;
    if (ready) button.href = compareUrl(page, compared);
    status.textContent = compared.length
      ? `${compared.length} of ${limit} products selected for comparison${full ? ' (limit reached)' : ''}`
      : '';
    saveCompareSelection(compared);
  };

  block.addEventListener('change', (e) => {
    const input = e.target.closest('input[data-compare-code]');
    if (!input) return;
    const code = input.dataset.compareCode;

    const productName = input
      .getAttribute('aria-label')
      ?.replace(/^COMPARE:\s*/i, '')
      || '';

    if (input.checked) {
      pushAdobeProductTitleClick({
        event: 'add_to_compare_click',
        productName,
        productSku: code,
      });
    }

    compared = compared.filter((c) => c !== code);
    if (input.checked && compared.length < limit) compared.push(code);
    update();
  });
  // back from the compare page (restored from the page cache): its removals count
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    compared = readCompareSelection().filter((code) => known.has(code)).slice(0, limit);
    update();
  });

  block.append(button, status);
  update();
}
// END FIX COMPARE

function buildCard(product, buttonLabel, eager, compareLabel) {
  const li = document.createElement('li');
  li.className = 'wood-listing-products-card';

  const imageWrap = document.createElement('div');
  imageWrap.className = 'wood-listing-products-card-image';
  if (product.image) {
    imageWrap.append(createOptimizedPicture(product.image, product.name, eager, [{ width: '500' }]));
  }

  const body = document.createElement('div');
  body.className = 'wood-listing-products-card-body';

  const title = document.createElement('h3');
  title.className = 'wood-listing-products-card-title';
  title.textContent = product.name;

  const info = document.createElement('div');
  info.className = 'wood-listing-products-card-info';
  if (product.description) {
    const desc = document.createElement('p');
    desc.className = 'wood-listing-products-card-description';
    desc.textContent = product.description;
    info.append(desc);
  }
  if (product.features.length) {
    const features = document.createElement('div');
    features.className = 'wood-listing-products-card-features';
    const label = document.createElement('span');
    label.textContent = 'Key Features';
    const ul = document.createElement('ul');
    product.features.forEach((feature) => {
      const item = document.createElement('li');
      item.textContent = feature;
      ul.append(item);
    });
    features.append(label, ul);
    info.append(features);
  }

  const bottom = document.createElement('div');
  bottom.className = 'wood-listing-products-card-bottom';
  if (product.price) {
    const price = document.createElement('div');
    price.className = 'wood-listing-products-card-price';
    price.innerHTML = '<p class="wood-listing-products-card-mrp">MRP <span class="wood-listing-products-card-symbol">₹</span><span class="wood-listing-products-card-value"></span></p>'
      + '<p class="wood-listing-products-card-tax">(Inclusive of all taxes) <span class="wood-listing-products-card-unit"></span><span class="wood-listing-products-card-star">*</span></p>';
    price.querySelector('.wood-listing-products-card-value').textContent = product.price;
    price.querySelector('.wood-listing-products-card-unit').textContent = product.unit;
    bottom.append(price);
  }
  if (product.link) {
    const cta = document.createElement('a');
    cta.className = 'wood-listing-products-card-cta';
    cta.href = product.link;
    cta.textContent = buttonLabel;
    cta.setAttribute('aria-label', `${buttonLabel}: ${product.name}`);
    cta.addEventListener('click', () => {
      pushAdobeProductTitleClick({
        event: 'plp_product_click',
        productName: product.name,
        productSku: product.code || '',
        destinationUrl: new URL(product.link, window.location.origin).href,
      });
    });
    bottom.append(cta);
  }

  // START FIX COMPARE: the card's Compare checkbox (only when Compare is on, for rows with a Code)
  if (compareLabel && product.code) bottom.append(buildCompare(product, compareLabel));
  // END FIX COMPARE

  body.append(title, info, bottom);
  li.append(imageWrap, body);
  // START FIX WISHLIST HEART: the live card's heart (top right), saved by the product code like
  // live (type "products", see scripts/wishlist.js); only for rows with a Code
  if (product.code) {
    li.append(wishlistHeart({
      code: product.code,
      name: product.name,
      price: product.price,
      className: 'wood-listing-products-wishlist',
    }));
  }
  // END FIX WISHLIST HEART
  return li;
}

function buildFilters(groups, onToggle) {
  const pane = document.createElement('div');
  pane.className = 'wood-listing-products-filters';

  const head = document.createElement('div');
  head.className = 'wood-listing-products-filters-head';
  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className = 'wood-listing-products-filters-toggle';
  openButton.textContent = 'Filter by';
  openButton.setAttribute('aria-expanded', 'false');
  head.append(openButton);

  const panel = document.createElement('div');
  panel.className = 'wood-listing-products-filters-panel';
  panel.id = `wood-listing-products-filters-${Math.random().toString(36).slice(2, 8)}`;
  openButton.setAttribute('aria-controls', panel.id);

  const form = document.createElement('form');
  form.className = 'wood-listing-products-filters-groups';
  form.addEventListener('submit', (e) => e.preventDefault());

  groups.forEach((group) => {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'wood-listing-products-group is-open';
    const legend = document.createElement('legend');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'wood-listing-products-group-toggle';
    toggle.textContent = group.label;
    toggle.setAttribute('aria-expanded', 'true');
    const options = document.createElement('div');
    options.className = 'wood-listing-products-group-options';

    toggle.addEventListener('click', () => {
      const open = fieldset.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open);
      // START FIX MATCH LIVE (group slide): the group's options slide open and closed as on
      // live (jQuery slideToggle: 400ms, "swing"); none with reduced motion
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      options.getAnimations().forEach((animation) => animation.cancel());
      // shown while it closes
      if (!open) options.style.display = 'block';
      // its height as shown (before overflow:hidden would add the last option's margin)
      const { height } = options.getBoundingClientRect();
      options.style.overflow = 'hidden';
      const frames = [{ height: '0px' }, { height: `${height}px` }];
      const done = () => {
        if (options.getAnimations().length) return;
        options.style.removeProperty('display');
        options.style.removeProperty('overflow');
      };
      options.animate(open ? frames : frames.reverse(), {
        duration: 400,
        easing: 'cubic-bezier(0.37, 0, 0.63, 1)',
      }).finished.then(done, done);
      // END FIX MATCH LIVE (group slide)
    });
    legend.append(toggle);
    group.values.forEach((value) => {
      const label = document.createElement('label');
      label.className = 'wood-listing-products-option';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = value;
      input.dataset.group = group.key;
      input.addEventListener('change', () => onToggle(group.key, value, input.checked));
      const name = document.createElement('span');
      name.className = 'wood-listing-products-option-name';
      name.textContent = value;
      label.append(input, name);
      options.append(label);
    });
    fieldset.append(legend, options);
    form.append(fieldset);
  });

  const actions = document.createElement('div');
  actions.className = 'wood-listing-products-filters-actions';
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'wood-listing-products-clear';
  clear.textContent = 'Clear all';
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.className = 'wood-listing-products-apply';
  apply.textContent = 'Apply';
  actions.append(clear, apply);

  head.append(clear.cloneNode(true));
  panel.append(form, actions);
  pane.append(head, panel);
  return {
    pane, panel, form, openButton, clearButtons: [head.lastElementChild, clear], apply,
  };
}

export default async function decorate(block) {
  const config = readConfig(block);
  const { source } = config;
  block.textContent = '';
  if (!source) return;

  let rows = [];
  try {
    const resp = await fetch(source);
    if (resp.ok) rows = (await resp.json()).data || [];
  } catch (e) {
    rows = [];
  }

  const groupNames = list(config.filters || 'Product Type, Range, Finish, Category');
  const buttonLabel = config['button label'] || 'View Product';

  const products = rows.map((row) => {
    const columns = {};
    Object.keys(row).forEach((col) => { columns[norm(col)] = row[col]; });
    const tags = {};
    groupNames.forEach((name) => {
      tags[norm(name)] = list(columns[norm(name)]).map(norm);
    });
    return {
      name: row.Name || '',
      description: row.Description || '',
      image: row.Image || '',
      features: list(row['Key Features'], '|'),
      price: row.Price || '',
      unit: row.Unit || '',
      link: row.Link || '',
      // FIX WISHLIST HEART: the product code (the sheet's Code column)
      code: String(row.Code || columns.code || '').trim(),
      tags,
    };
  }).filter((p) => p.name);

  // filter groups; options in the order given by a row named after the group, then sheet order
  const groups = groupNames.map((label) => {
    const key = norm(label);
    const values = list(config[key]).map(norm)
      .filter((v) => products.some((p) => p.tags[key].includes(v)));
    products.forEach((p) => p.tags[key].forEach((v) => {
      if (!values.includes(v)) values.push(v);
    }));
    return { key, label, values };
  }).filter((g) => g.values.length);

  const selected = {};
  const fromUrl = readUrlFilters();
  groups.forEach((g) => {
    selected[g.key] = new Set((fromUrl[g.key] || []).filter((v) => g.values.includes(v)));
  });

  const matches = (product, extra) => groups.every((g) => {
    const chosen = selected[g.key];
    if (extra && extra.key === g.key && !product.tags[g.key].includes(extra.value)) return false;
    return !chosen.size || product.tags[g.key].some((v) => chosen.has(v));
  });

  // layout
  const container = document.createElement('div');
  container.className = 'wood-listing-products-layout';
  // same analytics as the AEM listing: filter_click with "group : a|b || group : c"
  const trackFilters = () => {
    const filter = groups
      .filter((g) => selected[g.key].size)
      .map((g) => `${g.label} : ${[...selected[g.key]].join('|')}`)
      .join(' || ');
    pushAdobeCalculatorEvents({
      event: 'filter_click',
      filter,
    });
  };

  const filters = buildFilters(groups, (key, value, checked) => {
    if (checked) selected[key].add(value);
    else selected[key].delete(value);
    // eslint-disable-next-line no-use-before-define
    render();
    trackFilters();
  });

  const results = document.createElement('div');
  results.className = 'wood-listing-products-results';
  if (config.disclaimer) {
    const disclaimer = document.createElement('p');
    disclaimer.className = 'wood-listing-products-disclaimer';
    const star = config.disclaimer.startsWith('*');
    disclaimer.innerHTML = star ? '<span class="wood-listing-products-card-star">*</span>' : '';
    disclaimer.append(star ? config.disclaimer.slice(1) : config.disclaimer);
    results.append(disclaimer);
  }
  const grid = document.createElement('ul');
  grid.className = 'wood-listing-products-grid';
  const empty = document.createElement('p');
  empty.className = 'wood-listing-products-empty';
  empty.textContent = 'No products match the selected filters.';
  empty.hidden = true;
  results.append(grid, empty);

  // START FIX COMPARE: off unless the Compare row says Yes
  const compareOn = yes(config.compare);
  const compareLabel = compareOn ? (config['compare label'] || 'COMPARE') : '';
  // END FIX COMPARE
  const cards = products.map((p, i) => buildCard(p, buttonLabel, i < 2, compareLabel));

  grid.append(...cards);

  const inputs = [...filters.form.querySelectorAll('input')];

  function render() {
    let visible = 0;
    products.forEach((p, i) => {
      const show = matches(p);
      cards[i].hidden = !show;
      if (show) visible += 1;
    });
    empty.hidden = visible > 0;
    inputs.forEach((input) => {
      const { group } = input.dataset;
      input.checked = selected[group].has(input.value);
      // an option is off when no shown product has it; checked options stay on so they
      // can be unticked, and with no results everything is on again
      const possible = !visible || input.checked
        || products.some((p) => matches(p, { key: group, value: input.value }));
      input.disabled = !possible;
      input.closest('label').classList.toggle('is-disabled', !possible);
    });
    writeUrlFilters(groups, selected);
  }

  const setOpen = (open) => {
    filters.pane.classList.toggle('is-open', open);
    filters.openButton.setAttribute('aria-expanded', open);
    document.body.classList.toggle('wood-listing-products-modal-open', open && !DESKTOP.matches);
  };
  filters.openButton.addEventListener('click', () => {
    if (!DESKTOP.matches) setOpen(!filters.pane.classList.contains('is-open'));
  });
  filters.apply.addEventListener('click', () => setOpen(false));
  filters.clearButtons.forEach((button) => button.addEventListener('click', () => {
    groups.forEach((g) => selected[g.key].clear());
    render();
    setOpen(false);
  }));
  filters.pane.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && filters.pane.classList.contains('is-open')) {
      setOpen(false);
      filters.openButton.focus();
    }
  });
  DESKTOP.addEventListener('change', () => {
    setOpen(false);
    render();
  });

  container.append(filters.pane, results);
  block.append(container);
  render();
  // START FIX WISHLIST HEART: clicks and the saved state of the hearts
  initWishlist(block);
  // END FIX WISHLIST HEART

  // START FIX COMPARE
  if (compareOn) setupCompare(block, cards, config);
  // END FIX COMPARE
}
