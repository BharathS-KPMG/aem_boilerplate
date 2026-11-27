/*
** Authoring format **

Block name: Enamel Paints

Two-column rows: label | value. All content and labels come from these rows: the block has no
built-in texts, and an element whose row is missing or empty is not rendered.
Source             → products JSON / API URL, e.g. /eds/enamel-paints.json (a DA sheet, or an
                     API returning the same rows - see toRows() for the accepted shapes);
                     without it no products are shown
Title              → heading above the listing, e.g. "Enamels & Epoxy"
Subtitle           → text under the title
SEO Heading        → visually hidden page h1, e.g. "Enamel Paints for Metal & Wood Surfaces"
Disclaimer         → text above the products (a leading * is shown in red)
Filters            → sheet columns shown as filter groups, in order, e.g. "Gloss, Product Type"
<group name>       → option order for that group, e.g. "Gloss | soft sheen, high gloss"
Filter Label       → filter toggle, e.g. "Filter by" (needed, with Filters and Apply Label,
                     for the filter bar)
Apply Label        → applies the chosen options, e.g. "Apply"
Clear Label        → resets the filters, e.g. "Clear all"
Button Label       → CTA on every card, e.g. "View Product"
Features Label     → heading of the key features, e.g. "Key Features"
Price Label        → text before the price, e.g. "MRP"
Currency Symbol    → shown before the price, e.g. "₹"
Tax Label          → text under the price, e.g. "(Inclusive of all taxes)"
Unit Label         → unit after the tax text when a product has no Unit, e.g. "per L"
Empty Label        → shown when no product matches, e.g. "No products match the selected filters."

Products sheet columns
Code, Name, Description, Image, Image Alt, Key Features (separated by |), Price,
Unit (e.g. "per L", else the Unit Label), Link, plus one column per filter group with comma
separated values
(e.g. Gloss: "soft sheen").

Filters work like the live AEM listing (asianpaints.com/enamel-paints.html): "Filter by" opens
a panel of option chips; options are applied with Apply (Clear all resets), options in one group
are OR'ed, groups are AND'ed, options are disabled as on live (see renderPanel), applied options
are listed as removable pills, and the selection is kept in the URL as
?f=gloss:soft sheen&product type:enamel (links from other pages can preselect filters).
*/

import { createOptimizedPicture } from '../../scripts/aem.js';
import { pushAdobeCalculatorEvents } from '../../scripts/analytics_1.js';

const DESKTOP = window.matchMedia('(min-width: 992px)');
// labels read from the DA table (row label, lower case); there are no fallback texts in the code
const LABEL_KEYS = [
  'filter label',
  'apply label',
  'clear label',
  'button label',
  'features label',
  'price label',
  'currency symbol',
  'tax label',
  'unit label',
  'empty label',
];

function text(el) {
  return (el?.textContent || '').trim();
}

function norm(value) {
  return (value || '').toString().trim().toLowerCase();
}

function list(value, separator = ',') {
  return (
    Array.isArray(value) ? value : (value || '').toString().split(separator)
  )
    .map((v) => v.toString().trim())
    .filter(Boolean);
}

function readConfig(block) {
  const config = {};
  const cells = {};
  [...block.children].forEach((row) => {
    const [label, value] = [...row.children];
    const key = norm(text(label))
      .replace(/[^a-z]+/g, ' ')
      .trim();
    if (!key || !value) return;
    config[key] = value.querySelector('a[href]')?.getAttribute('href') || text(value);
    cells[key] = value;
  });
  return { config, cells };
}

// rows from the configured source: a DA sheet ({ data: [...] }), a multi-sheet
// ({ <name>: { data } }), a plain array, or the AEM listing API ({ All: [...] } / { products })
function toRows(json) {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== 'object') return [];
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json.products)) return json.products;
  if (Array.isArray(json.All)) return json.All;
  const sheet = Object.values(json).find((v) => v && Array.isArray(v.data));
  return sheet ? sheet.data : [];
}

// one product from a sheet row (column names as authored) or an AEM listing API item
function toProduct(row, groupNames) {
  const columns = {};
  Object.keys(row).forEach((col) => {
    columns[norm(col)] = row[col];
  });
  const pick = (...names) => {
    const found = names
      .map((n) => columns[norm(n)])
      .find((v) => v !== undefined && v !== null && v !== '');
    return found === undefined ? '' : found;
  };
  const apiAlt = row.packShotImageInfo?.altText;
  // the AEM API's alt is often the file name ("metals-apcolite-premium-gloss-enamel"):
  // such slugs are not used, the product name is
  const realAlt = (value) => (/\s/.test(String(value || '').trim()) ? String(value).trim() : '');
  const altText = realAlt(pick('image alt', 'alt'))
    || realAlt(Array.isArray(apiAlt) ? apiAlt[0] : apiAlt);
  const filterTitle = row.filterTitle || {};
  const tags = {};
  groupNames.forEach((name) => {
    const key = norm(name);
    tags[key] = list(columns[key] ?? filterTitle[key]).map(norm);
  });
  let image = pick('image', 'productpackshotimage');
  if (image && image.startsWith('/content/dam/')) image = `https://static.asianpaints.com${image}`;
  return {
    code: String(pick('code', 'productcode')).trim(),
    name: String(pick('name', 'productname')).trim(),
    description: pick('description', 'shortdescription'),
    image,
    alt: altText,
    features: list(pick('key features', 'visibletags'), '|'),
    price: pick('price', 'liveprice'),
    unit: String(pick('unit')).trim(),
    link: pick('link', 'pageurl'),
    tags,
  };
}

// DA media (same origin) gets EDS optimized renditions; external DAM URLs are used as they are
function productImage(src, alt, eager) {
  const url = new URL(src, window.location.href);
  if (url.origin === window.location.origin) {
    return createOptimizedPicture(src, alt, eager, [{ width: '500' }]);
  }
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  img.loading = eager ? 'eager' : 'lazy';
  img.width = 242;
  img.height = 242;
  return img;
}

// ?f=gloss:soft sheen,high gloss&product type:enamel (the whole rest of the URL after f=)
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
    .map((g) => `${g.key}:${[...selected[g.key]].join(',')}`);
  const url = new URL(window.location.href);
  url.search = url.search.replace(/[?&]f=.*$/, '');
  const base = `${url.pathname}${url.search}`;
  const query = parts.length
    ? `${url.search ? '&' : '?'}f=${encodeURIComponent(parts.join('&'))}`
    : '';
  window.history.replaceState(null, '', `${base}${query}${url.hash}`);
}

function buildHeader(config, cells) {
  const header = document.createElement('div');
  header.className = 'enamel-paints-header';
  if (config['seo heading']) {
    const h1 = document.createElement('h1');
    h1.className = 'enamel-paints-sr-only';
    h1.textContent = config['seo heading'];
    header.append(h1);
  }
  if (config.title) {
    const title = document.createElement('h2');
    title.className = 'enamel-paints-title';
    title.textContent = config.title;
    header.append(title);
  }
  if (config.subtitle) {
    const subtitle = document.createElement('p');
    subtitle.className = 'enamel-paints-subtitle';
    // keeps the author's inline formatting / links from DA
    subtitle.append(
      ...[...cells.subtitle.childNodes].map((n) => n.cloneNode(true)),
    );
    if (subtitle.querySelector('p')) subtitle.replaceChildren(...subtitle.querySelector('p').childNodes);
    header.append(subtitle);
  }
  return header.children.length ? header : null;
}

function buildCard(product, labels, eager) {
  const li = document.createElement('li');
  li.className = 'enamel-paints-card';

  const imageWrap = document.createElement('div');
  imageWrap.className = 'enamel-paints-card-image';
  if (product.image) {
    imageWrap.append(
      productImage(product.image, product.alt || product.name, eager),
    );
  }

  const body = document.createElement('div');
  body.className = 'enamel-paints-card-body';

  const title = document.createElement('h3');
  title.className = 'enamel-paints-card-title';
  title.textContent = product.name;

  const info = document.createElement('div');
  info.className = 'enamel-paints-card-info';
  if (product.description) {
    const desc = document.createElement('p');
    desc.className = 'enamel-paints-card-description';
    desc.textContent = product.description;
    info.append(desc);
  }
  if (product.features.length) {
    const features = document.createElement('div');
    features.className = 'enamel-paints-card-features';
    if (labels['features label']) {
      const label = document.createElement('span');
      label.textContent = labels['features label'];
      features.append(label);
    }
    const ul = document.createElement('ul');
    product.features.forEach((feature) => {
      const item = document.createElement('li');
      item.textContent = feature;
      ul.append(item);
    });
    features.append(ul);
    info.append(features);
  }

  const bottom = document.createElement('div');
  bottom.className = 'enamel-paints-card-bottom';
  if (product.price) {
    const price = document.createElement('div');
    price.className = 'enamel-paints-card-price';
    const mrp = document.createElement('p');
    mrp.className = 'enamel-paints-card-mrp';
    if (labels['price label']) mrp.append(`${labels['price label']} `);
    if (labels['currency symbol']) {
      const symbol = document.createElement('span');
      symbol.className = 'enamel-paints-card-symbol';
      symbol.textContent = labels['currency symbol'];
      mrp.append(symbol);
    }
    const value = document.createElement('span');
    value.className = 'enamel-paints-card-value';
    value.textContent = product.price;
    mrp.append(value);
    price.append(mrp);
    const taxText = [labels['tax label'], product.unit || labels['unit label']]
      .filter(Boolean)
      .join(' ');
    if (taxText) {
      const tax = document.createElement('p');
      tax.className = 'enamel-paints-card-tax';
      tax.append(taxText);
      const star = document.createElement('span');
      star.className = 'enamel-paints-star';
      star.textContent = '*';
      tax.append(star);
      price.append(tax);
    }
    bottom.append(price);
  }
  if (product.link && labels['button label']) {
    const cta = document.createElement('a');
    cta.className = 'enamel-paints-card-cta';
    cta.href = product.link;
    cta.textContent = labels['button label'];
    cta.setAttribute(
      'aria-label',
      `${labels['button label']}: ${product.name}`,
    );
    cta.addEventListener('click', () => {
      pushAdobeCalculatorEvents({
        event: 'plp_product_click', destinationUrl: new URL(product.link, window.location.origin).href, productName: product.name, productSku: product.code,
      });
    });
    bottom.append(cta);
  }

  body.append(title, info, bottom);
  li.append(imageWrap, body);
  return li;
}

// filter bar: applied pills + "Filter by" toggle; the panel holds one row of option chips per group
function buildFilters(groups, labels, uid) {
  const bar = document.createElement('div');
  bar.className = 'enamel-paints-filters';

  const head = document.createElement('div');
  head.className = 'enamel-paints-filters-head';
  const pills = document.createElement('ul');
  pills.className = 'enamel-paints-pills';
  pills.setAttribute('aria-label', 'Applied filters');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'enamel-paints-filters-toggle';
  toggle.textContent = labels['filter label'];
  toggle.setAttribute('aria-expanded', 'false');
  head.append(pills, toggle);

  const panel = document.createElement('div');
  panel.className = 'enamel-paints-filters-panel';
  panel.id = `enamel-paints-filters-${uid}`;
  panel.hidden = true;
  toggle.setAttribute('aria-controls', panel.id);

  const groupEls = groups.map((group, index) => {
    const row = document.createElement('div');
    row.className = 'enamel-paints-group';
    // mobile: groups are an accordion, the first one open (desktop shows them all)
    if (index === 0) row.classList.add('is-open');
    const labelId = `${panel.id}-${index}`;
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'enamel-paints-group-label';
    label.id = labelId;
    label.textContent = group.label;
    label.setAttribute('aria-expanded', String(index === 0));
    const options = document.createElement('div');
    options.className = 'enamel-paints-group-options';
    options.setAttribute('role', 'group');
    options.setAttribute('aria-labelledby', labelId);
    label.addEventListener('click', () => {
      const open = row.classList.toggle('is-open');
      label.setAttribute('aria-expanded', String(open));
    });
    const chips = group.values.map((value) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'enamel-paints-option';
      chip.textContent = value;
      chip.dataset.group = group.key;
      chip.dataset.value = value;
      chip.setAttribute('aria-pressed', 'false');
      options.append(chip);
      return chip;
    });
    row.append(label, options);
    panel.append(row);
    return { row, chips };
  });

  const actions = document.createElement('div');
  actions.className = 'enamel-paints-filters-actions';
  let clear = null;
  if (labels['clear label']) {
    clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'enamel-paints-clear';
    clear.textContent = labels['clear label'];
    actions.append(clear);
  }
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.className = 'enamel-paints-apply';
  apply.textContent = labels['apply label'];
  actions.append(apply);
  panel.append(actions);

  bar.append(head, panel);
  return {
    bar,
    toggle,
    panel,
    pills,
    clear,
    apply,
    chips: groupEls.flatMap((g) => g.chips),
  };
}

export default async function decorate(block) {
  const { config, cells } = readConfig(block);
  const { source } = config;
  const labels = {};
  LABEL_KEYS.forEach((key) => {
    labels[key] = config[key] || '';
  });
  const header = buildHeader(config, cells);
  block.textContent = '';
  if (header) block.append(header);
  // the products come from the authored Source only
  if (!source) return;

  let rows = [];
  try {
    const resp = await fetch(source);
    if (resp.ok) rows = toRows(await resp.json());
  } catch (e) {
    rows = [];
  }

  const groupNames = list(config.filters);
  const products = rows
    .map((row) => toProduct(row, groupNames))
    .filter((p) => p.name);

  // filter groups; options in the order given by a row named after the group, then data order
  const groups = groupNames
    .map((label) => {
      const key = norm(label);
      const values = list(config[key])
        .map(norm)
        .filter((v) => products.some((p) => p.tags[key].includes(v)));
      products.forEach((p) => p.tags[key].forEach((v) => {
        if (!values.includes(v)) values.push(v);
      }));
      return { key, label, values };
    })
    .filter((g) => g.values.length);

  // applied = what the listing shows; pending = chips toggled in the open panel (Apply commits)
  const applied = {};
  const pending = {};
  const fromUrl = readUrlFilters();
  groups.forEach((g) => {
    applied[g.key] = new Set(
      (fromUrl[g.key] || []).filter((v) => g.values.includes(v)),
    );
    pending[g.key] = new Set(applied[g.key]);
  });
  // the group whose last change narrowed the results (live's disabling depends on it, see
  // renderPanel); `applied...` is the one in effect for the applied selection, restored when the
  // panel reopens. From a link: the first group of the URL that has a selection, as live
  let appliedLastGroup = Object.keys(fromUrl).find((key) => applied[key]?.size) || null;
  let lastGroup = appliedLastGroup;
  // after a change in group `key` (`before` = how many of its options were selected before):
  // - the group's first option picked, or one unticked with others left: the results got
  //   narrower -> `key` limits the other groups
  // - another option added to a group that had one (OR = wider results), or its last one
  //   unticked: no group limits the others
  const lastGroupAfter = (key, selection, added, before) => {
    if (!selection[key].size) return null;
    return added && before > 0 ? null : key;
  };

  // with `extra`, tells whether picking that option would show anything: the product must have it,
  // and match the selections of the other groups (options of one group are OR'ed, so the option's
  // own group selection does not narrow it down)
  const matches = (product, selection, extra) => groups.every((g) => {
    if (extra && extra.key === g.key) return product.tags[g.key].includes(extra.value);
    const chosen = selection[g.key];
    return !chosen.size || product.tags[g.key].some((v) => chosen.has(v));
  });
  const sameSelection = () => groups.every(
    (g) => applied[g.key].size === pending[g.key].size
        && [...applied[g.key]].every((v) => pending[g.key].has(v)),
  );

  // live unselects an option once it is disabled: in the groups other than the one changed last,
  // a selected option no product of the current results has is dropped (e.g. soft sheen +
  // high gloss, then epoxy -> high gloss is unselected and disabled; picking enamel enables it
  // again, still unselected). Dropping only widens the results, so one pass per group is enough.
  function dropUnavailable(selection, last) {
    if (!last) return;
    const shown = products.filter((p) => matches(p, selection));
    if (!shown.length) return;
    const others = groups.filter((g) => g.key !== last);
    others.forEach((g) => {
      [...selection[g.key]]
        .filter((value) => !shown.some((p) => p.tags[g.key].includes(value)))
        .forEach((value) => selection[g.key].delete(value));
    });
  }

  // a link (?f=) gets the same clean-up as a selection made in the panel
  dropUnavailable(applied, appliedLastGroup);
  groups.forEach((g) => {
    pending[g.key] = new Set(applied[g.key]);
  });

  const uid = Math.random().toString(36).slice(2, 8);
  // the filter bar needs its toggle and Apply texts from DA
  const canFilter = groups.length && labels['filter label'] && labels['apply label'];
  const filters = canFilter ? buildFilters(groups, labels, uid) : null;

  const results = document.createElement('div');
  results.className = 'enamel-paints-results';
  if (config.disclaimer) {
    const disclaimer = document.createElement('p');
    disclaimer.className = 'enamel-paints-disclaimer';
    const star = config.disclaimer.startsWith('*');
    if (star) {
      const mark = document.createElement('span');
      mark.className = 'enamel-paints-star';
      mark.textContent = '*';
      disclaimer.append(mark);
    }
    disclaimer.append(star ? config.disclaimer.slice(1) : config.disclaimer);
    results.append(disclaimer);
  }
  const grid = document.createElement('ul');
  grid.className = 'enamel-paints-grid';
  const empty = document.createElement('p');
  empty.className = 'enamel-paints-empty';
  empty.textContent = labels['empty label'];
  empty.setAttribute('role', 'status');
  empty.hidden = true;
  results.append(grid);
  if (labels['empty label']) results.append(empty);

  const cards = products.map((p, i) => buildCard(p, labels, i < 2));
  grid.append(...cards);

  // chips in the panel: pressed = pending. Disabled like live (its "disabledElement"):
  // - options of the group that narrowed the results last (or of every group when none did): off
  //   when no product has them together with the other groups' selections (OR within a group)
  // - options of the other groups: off when no product of the current results has them
  //   e.g. enamel, then soft sheen -> epoxy off; soft sheen, then enamel -> high gloss off;
  //   soft sheen + high gloss, then epoxy -> high gloss unselected and off, then enamel -> on
  function renderPanel() {
    if (!filters) return;
    dropUnavailable(pending, lastGroup);
    const shown = products.filter((p) => matches(p, pending));
    filters.chips.forEach((chip) => {
      const { group, value } = chip.dataset;
      const pressed = pending[group].has(value);
      let possible = true;
      if (!pressed && shown.length) {
        possible = !lastGroup || group === lastGroup
          ? products.some((p) => matches(p, pending, { key: group, value }))
          : shown.some((p) => p.tags[group].includes(value));
      }
      chip.setAttribute('aria-pressed', String(pressed));
      chip.disabled = !possible;
    });
    filters.apply.disabled = sameSelection();
  }

  function setOpen(open) {
    if (!filters) return;
    filters.panel.hidden = !open;
    filters.bar.classList.toggle('is-open', open);
    filters.toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      // the panel always starts from what is applied
      groups.forEach((g) => {
        pending[g.key] = new Set(applied[g.key]);
      });
      lastGroup = appliedLastGroup;
      renderPanel();
    }
  }

  function renderPills() {
    if (!filters) return;
    filters.pills.replaceChildren(
      ...groups.flatMap((g) => [...applied[g.key]].map((value) => {
        const li = document.createElement('li');
        li.className = 'enamel-paints-pill';
        li.append(value);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'enamel-paints-pill-remove';
        remove.setAttribute('aria-label', `Remove filter ${value}`);
        remove.addEventListener('click', () => {
          applied[g.key].delete(value);
          pending[g.key].delete(value);
          appliedLastGroup = lastGroupAfter(g.key, applied, false);
          lastGroup = appliedLastGroup;
          // eslint-disable-next-line no-use-before-define
          render();
          (
            filters.pills.querySelector('.enamel-paints-pill-remove')
              || filters.toggle
          ).focus();
        });
        li.append(remove);
        return li;
      })),
    );
  }

  function render() {
    let visible = 0;
    products.forEach((p, i) => {
      const show = matches(p, applied);
      cards[i].hidden = !show;
      if (show) visible += 1;
    });
    empty.hidden = visible > 0;
    renderPills();
    renderPanel();
    if (groups.length) writeUrlFilters(groups, applied);
  }

  if (filters) {
    filters.toggle.addEventListener('click', () => setOpen(filters.panel.hidden));
    filters.chips.forEach((chip) => chip.addEventListener('click', () => {
      const { group, value } = chip.dataset;
      const before = pending[group].size;
      const added = !pending[group].has(value);
      if (added) pending[group].add(value);
      else pending[group].delete(value);
      lastGroup = lastGroupAfter(group, pending, added, before);
      renderPanel();
    }));
    filters.apply.addEventListener('click', () => {
      groups.forEach((g) => {
        applied[g.key] = new Set(pending[g.key]);
      });
      appliedLastGroup = lastGroup;

      const selectedFilters = groups
        .filter((g) => applied[g.key].size)
        .map(
          (g) => `${g.label.toLowerCase()} : ${[...applied[g.key]].join(' | ')}`,
        )
        .join(' || ');

      pushAdobeCalculatorEvents({ event: 'filter_click', filter: selectedFilters });

      setOpen(false);
      render();
      filters.toggle.focus();
    });
    // Clear all, as live: the panel stays open, every option is unselected and the listing shows
    // all products right away (no Apply needed); Apply stays off until something is picked again
    filters.clear?.addEventListener('click', () => {
      groups.forEach((g) => {
        applied[g.key].clear();
        pending[g.key].clear();
      });
      appliedLastGroup = null;
      lastGroup = null;
      render();
    });
    filters.bar.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !filters.panel.hidden) {
        setOpen(false);
        filters.toggle.focus();
      }
    });
    // group names only toggle their options below 992px; on desktop they are plain labels
    const groupLabels = [
      ...filters.panel.querySelectorAll('.enamel-paints-group-label'),
    ];
    const syncGroupLabels = () => groupLabels.forEach((label) => {
      label.tabIndex = DESKTOP.matches ? -1 : 0;
    });
    syncGroupLabels();
    DESKTOP.addEventListener('change', () => {
      setOpen(false);
      syncGroupLabels();
    });
  }

  const layout = document.createElement('div');
  layout.className = 'enamel-paints-layout';
  if (filters) layout.append(filters.bar);
  layout.append(results);
  block.append(layout);
  render();
}
