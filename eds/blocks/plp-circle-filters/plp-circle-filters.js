import { createOptimizedPicture, getMetadata } from '../../scripts/aem.js';
import { pushAdobeCalculatorEvents, pushAdobeProductTitleClick } from '../../scripts/analytics_1.js';

/*
 * PLP Circle Filters: the product listing of Asian Paints category pages (the source's
 * `apPlpListing`, e.g. https://www.asianpaints.com/products/undercoats.html), rendered from a DA
 * spreadsheet: category circles that filter the product grid, whose cards reveal their details
 * on hover, and the price disclaimer under the grid.
 *
 * Authoring: the block names its data file (or page metadata `plp-data`) and can carry the
 * settings and the circles itself, each part under its heading row:
 *   | PLP Circle Filters |                                 |                 |                 |
 *   | Setting            | Value                           |                 |                 |
 *   | Data               | /d-testing/data/undercoats.json |                 |                 |
 *   | Filter group       | undercoats                      |                 |                 |
 *   | Image              | Alt text                        | Label           | Filter value    |
 *   |                    |                                 | All             |                 |
 *   | (image or URL)     | Interior primer on a wall       | Interior primer | interior primer |
 * Rows under "Setting | Value" (the heading is optional) set what the settings sheet sets;
 * rows under "Image | Alt text | Label | Filter value" (columns in any order) are the circles
 * and replace the categories sheet.
 *
 * The data file is a DA spreadsheet served as JSON; an API answering in the same shape can
 * replace it (just point Data at it). Only the products are required there:
 *   products    code | name | title | description | features | price | url | image | imageAlt
 *               | filters | badge             one row per product; features "a|b|c", filters
 *                                              "undercoats: interior primer, putty"
 *   settings    key | value                    optional: Filter group, Price label, Price note,
 *                                              CTA label, Disclaimer, Empty message, List heading
 *   categories  image | alt | label | value    optional: the circles, in order (no value: all)
 *
 * The chosen circle is kept in the address as on the source (?f=undercoats:putty, URL-encoded),
 * so existing links keep working. The block adds the products' ItemList structured data.
 */

const IMAGE = { width: 221, height: 260 };
const SITE = 'https://www.asianpaints.com';

const SETTINGS = {
  group: ['filter group'],
  priceLabel: ['price label'],
  priceNote: ['price note'],
  ctaLabel: ['cta label'],
  disclaimer: ['disclaimer'],
  emptyMessage: ['empty message'],
  errorMessage: ['error message'],
  listHeading: ['list heading'],
};

const DEFAULTS = {
  group: 'undercoats',
  priceLabel: 'MRP',
  priceNote: '(Inclusive of all taxes) per L',
  ctaLabel: 'View Product',
  disclaimer: '',
  emptyMessage: 'No products match the selected category.',
  errorMessage: 'Products could not be loaded. Please try again later.',
  listHeading: 'Products',
};

// heading labels of the block's circle columns
const CIRCLE_COLUMNS = {
  image: ['image', 'circle image'],
  alt: ['alt', 'alt text', 'image alt'],
  label: ['label', 'name'],
  value: ['value', 'filter value'],
};

const key = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// non-breaking spaces are kept (a name can hold words together, as on the source)
const clean = (value) => String(value ?? '').replace(/[^\S\u00a0]+/g, ' ').trim();
const rows = (json, name) => (Array.isArray(json?.[name]?.data) ? json[name].data : []);

let instances = 0;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([name, value]) => {
    if (value === undefined || value === null || value === false) return;
    if (name === 'className') node.className = value;
    else node.setAttribute(name, value === true ? '' : value);
  });
  node.append(...children.filter((child) => child !== undefined && child !== null && child !== ''));
  return node;
}

/* ---------- data ---------- */

/** "undercoats: interior primer, putty" → { undercoats: ['interior primer', 'putty'] } */
function parseFilters(text) {
  const filters = {};
  String(text ?? '').split('|').forEach((pair) => {
    const at = pair.indexOf(':');
    if (at < 1) return;
    const group = clean(pair.slice(0, at)).toLowerCase();
    const values = pair.slice(at + 1).split(',')
      .map((value) => clean(value).toLowerCase()).filter(Boolean);
    if (group && values.length) {
      filters[group] = [...new Set([...(filters[group] || []), ...values])];
    }
  });
  return filters;
}

/** the settings and circles authored in the block table */
function readTable(block) {
  const table = { dataUrl: '', settings: [], circles: [] };
  const columnOf = (label) => Object.keys(CIRCLE_COLUMNS)
    .find((field) => CIRCLE_COLUMNS[field].some((n) => key(n) === key(label)));
  let columns = null;
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const labels = cells.map((cell) => key(cell.textContent));
    const [first, second] = labels;

    // heading rows
    if (first === 'setting' || first === 'settings') {
      columns = null;
      return;
    }
    if (labels.some((label) => label === 'image') && labels.some((label) => label === 'label')) {
      columns = cells.map((cell) => columnOf(cell.textContent));
      return;
    }

    if (columns) {
      const cell = (field) => cells[columns.indexOf(field)];
      const picture = cell('image')?.querySelector('img');
      const circle = {
        image: picture?.getAttribute('src') || cell('image')?.querySelector('a')?.getAttribute('href') || clean(cell('image')?.textContent),
        alt: clean(cell('alt')?.textContent) || clean(picture?.getAttribute('alt')),
        label: clean(cell('label')?.textContent),
        value: clean(cell('value')?.textContent).toLowerCase(),
      };
      if (circle.label) table.circles.push(circle);
      return;
    }

    if (first === 'data' || first === 'datafile') {
      const value = cells[1];
      table.dataUrl = value?.querySelector('a')?.getAttribute('href') || clean(value?.textContent);
    } else if (first && second !== undefined) {
      table.settings.push([cells[0].textContent, cells[1].textContent]);
    }
  });
  return table;
}

/** the settings, circles and products of the data file, the block table's taking precedence */
function readData(json, table) {
  const settings = { ...DEFAULTS };
  const apply = (name, value) => {
    const setting = Object.entries(SETTINGS)
      .find(([, names]) => names.some((n) => key(n) === key(name)));
    if (setting && clean(value)) settings[setting[0]] = clean(value);
  };
  rows(json, 'settings').forEach((row) => apply(row.key, row.value));
  table.settings.forEach(([name, value]) => apply(name, value));

  const circles = table.circles.length ? table.circles : rows(json, 'categories').map((row) => ({
    image: clean(row.image),
    alt: clean(row.alt),
    label: clean(row.label),
    value: clean(row.value).toLowerCase(),
  })).filter((circle) => circle.label);
  if (!circles.length) {
    circles.push({
      image: '', alt: '', label: 'All', value: '',
    });
  }

  // a single-sheet file is the products sheet itself
  const productRows = rows(json, 'products').length ? rows(json, 'products') : (json?.data || []);
  const products = productRows.map((row) => ({
    code: clean(row.code),
    name: clean(row.name),
    title: clean(row.title),
    description: clean(row.description),
    features: String(row.features ?? '').split('|').map(clean).filter(Boolean),
    price: clean(row.price),
    url: clean(row.url),
    image: clean(row.image),
    imageAlt: clean(row.imageAlt),
    badge: clean(row.badge),
    filters: parseFilters(row.filters),
  })).filter((product) => product.name && product.url);

  return { settings, circles, products };
}

async function loadData(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    return null;
  }
}

/** an image of the data: this site's media optimized, Asian Paints DAM images at the source's
 * rendition */
function image(src, alt, width, height, eager = false) {
  if (!src) return null;
  let url;
  try {
    url = new URL(src, window.location.href);
  } catch (e) {
    return null;
  }
  if (url.origin === window.location.origin || /\.aem\.(page|live)$/.test(url.hostname)) {
    const breakpoints = [{ width: String(width * 2) }];
    const picture = createOptimizedPicture(url.pathname, alt, eager, breakpoints);
    const img = picture.querySelector('img');
    img.width = width;
    img.height = height;
    return picture;
  }
  if (/asianpaints\.com$/.test(url.hostname) && url.pathname.startsWith('/content/dam/')
    && !url.pathname.includes('.transform/') && width === IMAGE.width) {
    url.pathname = `${url.pathname}.transform/cc-width-${width}-height-${height}/image.png`;
  }
  return el('img', {
    src: url.href, alt, width, height, loading: eager ? 'eager' : 'lazy', decoding: 'async',
  });
}

/* ---------- address (?f=) in the source's format ---------- */

// the chosen circle of "undercoats:putty" (other groups of older links are ignored)
function readCircle(group) {
  const match = window.location.search.match(/[?&]f=([^&#]*)/);
  if (!match) return '';
  let value;
  try {
    value = decodeURIComponent(match[1]);
  } catch (e) {
    return '';
  }
  const pair = value.split('&').find((item) => item.slice(0, item.indexOf(':')).trim().toLowerCase() === group);
  if (!pair) return '';
  const first = pair.slice(pair.indexOf(':') + 1).split(',')[0];
  try {
    return decodeURIComponent(first).trim().toLowerCase();
  } catch (e) {
    return first.trim().toLowerCase();
  }
}

function writeCircle(group, value) {
  const params = new URLSearchParams(window.location.search);
  params.delete('f');
  const filter = value ? `f=${encodeURIComponent(`${group}:${encodeURIComponent(value)}`)}` : '';
  const query = [params.toString(), filter].filter(Boolean).join('&');
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
}

/* ---------- rendering ---------- */

function circleButton(circle, index, id) {
  const visual = el('span', { className: 'plp-circle-filters-circle' });
  const picture = image(circle.image, circle.alt, 150, 150);
  if (picture) visual.append(picture);
  else {
    // a circle without an image (All) shows its label inside, as on the source
    visual.classList.add('is-text');
    visual.append(el('span', { className: 'plp-circle-filters-circle-text', 'aria-hidden': 'true' }, circle.label));
  }
  const labelId = `${id}-category-${index}`;
  return el('li', {}, el(
    'button',
    {
      type: 'button',
      className: `plp-circle-filters-category${picture ? '' : ' is-text'}`,
      'aria-pressed': 'false',
      'aria-labelledby': labelId,
      'data-value': circle.value,
    },
    visual,
    el('span', { className: 'plp-circle-filters-category-label', id: labelId }, circle.label),
  ));
}

// features as the source shows them, in sentence case ("SUPERIOR WHITENESS" → "Superior whiteness")
const sentence = (text) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

function card(product, settings, id, index) {
  const nameId = `${id}-product-${index}`;
  // some alt texts are only the product code; the name describes the pack better
  const alt = /\s/.test(product.imageAlt) ? product.imageAlt : product.name;
  const media = el('div', { className: 'plp-circle-filters-card-media' }, image(product.image, alt, IMAGE.width, IMAGE.height));
  const features = product.features.length ? el(
    'div',
    { className: 'plp-circle-filters-card-features' },
    el('p', {}, 'Key Features'),
    el('ul', {}, ...product.features.map((feature) => el('li', {}, sentence(feature)))),
  ) : '';
  const price = product.price ? el(
    'p',
    { className: 'plp-circle-filters-card-price' },
    el('span', { className: 'plp-circle-filters-card-amount' }, `${settings.priceLabel} ₹ ${product.price}`),
    el('span', { className: 'plp-circle-filters-card-note' }, settings.priceNote, el('span', { className: 'plp-circle-filters-card-star', 'aria-hidden': 'true' }, '*')),
  ) : '';
  return el(
    'li',
    { className: 'plp-circle-filters-card', 'data-code': product.code },
    el(
      'article',
      { 'aria-labelledby': nameId },
      media,
      el('h3', { className: 'plp-circle-filters-card-name', id: nameId }, product.name),
      el(
        'div',
        { className: 'plp-circle-filters-card-details' },
        el('p', { className: 'plp-circle-filters-card-overlay-name', 'aria-hidden': 'true' }, product.name),
        product.title ? el('p', { className: 'plp-circle-filters-card-title' }, product.title) : '',
        product.description ? el('p', { className: 'plp-circle-filters-card-description' }, product.description) : '',
        features,
        // price and button together, as the source's show-mrp (on phones as wide as the price)
        el(
          'div',
          { className: 'plp-circle-filters-card-buy' },
          price,
          el('a', { className: 'plp-circle-filters-card-cta', href: product.url, 'aria-describedby': nameId }, settings.ctaLabel),
        ),
      ),
    ),
  );
}

function addStructuredData(products, id) {
  const absolute = (href) => new URL(href, SITE).href;
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
        url: absolute(product.url),
        image: product.image ? absolute(product.image) : undefined,
        description: product.description || product.title || undefined,
        sku: product.code || undefined,
        brand: { '@type': 'Brand', name: 'Asian Paints' },
        offers: product.price ? {
          '@type': 'Offer', price: product.price, priceCurrency: 'INR', availability: 'https://schema.org/InStock', url: absolute(product.url),
        } : undefined,
      },
    })),
  });
  document.head.append(script);
}

/** the circle chosen in the address, if it is one of the circles ('' is All) */
function chosenCircle(group, circles) {
  const value = readCircle(group);
  return circles.some((circle) => circle.value === value) ? value : '';
}

function pressCircle(categoryList, value) {
  categoryList.querySelectorAll('.plp-circle-filters-category').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.value === value));
  });
}

/** the products (and the data file's circles) into the layout, once the data has loaded */
function showListing(json, table, id, {
  block, categoryList, status, heading, grid, empty,
}) {
  const { settings, circles, products } = readData(json, table);
  const group = settings.group.toLowerCase();
  heading.textContent = settings.listHeading;
  grid.removeAttribute('aria-busy');
  if (!table.circles.length) {
    categoryList.append(...circles.map((circle, i) => circleButton(circle, i, id)));
  }
  if (!products.length) {
    empty.querySelector('p').textContent = settings.errorMessage;
    empty.querySelector('button').remove();
    empty.hidden = false;
    block.classList.add('is-error');
    return;
  }
  empty.querySelector('p').textContent = settings.emptyMessage;

  const cards = products.map((product, i) => card(product, settings, id, i));
  grid.append(...cards);

  grid.querySelectorAll('.plp-circle-filters-card-cta').forEach((cta) => {
    cta.addEventListener('click', () => {
      const item = cta.closest('.plp-circle-filters-card');

      const productName = item?.querySelector(
        '.plp-circle-filters-card-overlay-name',
      )?.textContent?.trim() || '';

      const productCode = item?.dataset.code || '';

      pushAdobeProductTitleClick({
        event: 'plp_product_click',
        productName,
        productSku: productCode,
        destinationUrl: cta.href || '',
      });
    });
  });

  addStructuredData(products, id);

  // the price disclaimer under the grid, as on the source (* in the price note's red)
  if (settings.disclaimer) {
    block.classList.add('has-disclaimer');
    grid.after(el(
      'p',
      { className: 'plp-circle-filters-disclaimer' },
      el('span', { className: 'plp-circle-filters-disclaimer-star', 'aria-hidden': 'true' }, '*'),
      settings.disclaimer.replace(/^\*\s*/, ''),
    ));
  }

  let selected = chosenCircle(group, circles);

  const render = () => {
    pressCircle(categoryList, selected);
    let shown = 0;
    products.forEach((product, i) => {
      const visible = !selected || (product.filters[group] || []).includes(selected);
      cards[i].hidden = !visible;
      if (visible) shown += 1;
    });
    empty.hidden = shown > 0;
    status.textContent = `Showing ${shown} of ${products.length} products`;
  };

  const choose = (value) => {
    selected = value;
    writeCircle(group, selected);
    render();
  };

  categoryList.addEventListener('click', (event) => {
    const button = event.target.closest('.plp-circle-filters-category');
    if (!button) return;
    choose(button.dataset.value);

    const selectedFilter = button.querySelector(
      '.plp-circle-filters-category-label',
    )?.textContent?.trim() || 'all';

    pushAdobeCalculatorEvents({
      event: 'filter_click',
      filter: `${selectedFilter}`,
    });
  });

  empty.querySelector('button')?.addEventListener('click', () => {
    choose('');
    categoryList.querySelector('button')?.focus();
  });

  render();
}

export default function decorate(block) {
  instances += 1;
  const id = `plp-circle-filters-${instances}`;

  // the data file, and the settings and circles of the block table
  const table = readTable(block);
  const dataUrl = table.dataUrl || getMetadata('plp-data');
  // requested at once, but not awaited (see the end)
  const loading = dataUrl ? loadData(dataUrl) : Promise.resolve(null);

  // the layout first, its space reserved, while the data loads
  const categoryList = el('ul', { className: 'plp-circle-filters-categories', 'aria-label': 'Product categories' });
  const status = el('p', { className: 'plp-circle-filters-status', role: 'status' });
  const heading = el('h2', { className: 'plp-circle-filters-heading' }, DEFAULTS.listHeading);
  const grid = el('ul', { className: 'plp-circle-filters-grid', 'aria-busy': 'true' });
  const empty = el('div', { className: 'plp-circle-filters-empty', hidden: true }, el('p'), el('button', { type: 'button', className: 'plp-circle-filters-clear' }, 'Show all products'));
  block.replaceChildren(
    el('div', { className: 'plp-circle-filters-categories-wrap' }, categoryList),
    // the source's (empty) strip between the circles and the grid
    el('div', { className: 'plp-circle-filters-toolbar', 'aria-hidden': 'true' }),
    status,
    heading,
    grid,
    empty,
  );

  // the block table's circles show at once, the chosen one marked (the data file's, used when
  // the table has none, come with the products)
  if (table.circles.length) {
    const { group } = readData(null, table).settings;
    categoryList.append(...table.circles.map((circle, i) => circleButton(circle, i, id)));
    pressCircle(categoryList, chosenCircle(group.toLowerCase(), table.circles));
  }

  // Not awaited: a section is shown only once all its blocks have decorated, and this block sits
  // under the page's banner (the LCP image), which would otherwise wait for the data file too.
  // The grid keeps its room meanwhile (aria-busy): nothing in view shifts when the products come.
  loading.then((json) => showListing(json, table, id, {
    block, categoryList, status, heading, grid, empty,
  }));
}
