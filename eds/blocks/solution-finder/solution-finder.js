/**
 * Solution Finder
 * Main tabs → two radio options → sub tabs → content (title, cause section,
 * recommended product cards).
 * Desktop: sub tabs on the left, content of the selected one on the right.
 * Mobile: sub tabs become an accordion, each content opening below its sub tab.
 *
 * Authoring model: one row per item, label in column 1 (case/space-insensitive):
 *   Block Title | text                   (optional, plain part of the block heading)
 *   Block Title With Gradient | text     (optional, gradient part following it)
 *   Main Tab | label
 *   Radio Option | label                 (2 per Main Tab expected)
 *   Sub Tab | label
 *   Title | text
 *   Section Label | text
 *   Section Image | image
 *   Section Description | rich text
 *   Products Label | text                (optional, heading above the product cards)
 *   Product - SKU | packshot image | title | bullet list | redirection URL
 *                                         (the SKU after "Product -" adds the wishlist heart)
 *   End Main Tab | label                 (optional divider, renders nothing)
 *
 * @param {Element} block The block element
 */

import { pushAdobeCalculatorEvents, pushAdobeProductTitleClick } from '../../scripts/analytics_1.js';

// "Product - 5677": the product's SKU follows the row label
const PRODUCT_LABEL = /^product\s*[-–—:]\s*(.*)$/i;

const ARROW_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const desktopMQ = window.matchMedia('(min-width: 900px)');

const normalize = (text) => (text || '').toLowerCase().replace(/\s+/g, ' ').trim();

const slugify = (text) => normalize(text)
  .replace(/&/g, ' ')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'item';

let instanceCount = 0;

/** Returns a unique id within the page for the given slug parts. */
function makeIdFactory(prefix) {
  const used = new Set();
  return (...parts) => {
    const base = `${prefix}-${parts.map(slugify).join('--')}`;
    let id = base;
    let n = 2;
    while (used.has(id) || document.getElementById(id)) {
      id = `${base}-${n}`;
      n += 1;
    }
    used.add(id);
    return id;
  };
}

function getUrl(cell) {
  if (!cell) return '';
  const link = cell.querySelector('a[href]');
  if (link) return link.getAttribute('href');
  return cell.textContent.trim();
}

function getBullets(cell) {
  if (!cell) return null;
  const list = cell.querySelector('ul, ol');
  if (list) return list;
  // fall back to one bullet per paragraph / line
  const lines = [...cell.querySelectorAll('p')].map((p) => p.textContent.trim());
  const items = (lines.length ? lines : cell.textContent.split('\n'))
    .map((line) => line.replace(/^[•\-*]\s*/, '').trim())
    .filter(Boolean);
  if (!items.length) return null;
  const ul = document.createElement('ul');
  items.forEach((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    ul.append(li);
  });
  return ul;
}

/** Builds the nested tabs → options → subTabs → content model from the rows. */
function parseRows(block) {
  const heading = { title: '', gradient: '' };
  const tabs = [];
  let tab = null;
  let option = null;
  let subTab = null;

  const needSubTab = (label) => {
    if (subTab) return true;
    // eslint-disable-next-line no-console
    console.warn(`solution-finder: "${label}" row ignored, it must follow a Sub Tab row`);
    return false;
  };

  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const productLabel = cells[0]?.textContent.trim().match(PRODUCT_LABEL);
    const key = productLabel ? 'product' : normalize(cells[0]?.textContent);
    const valueCell = cells[1];
    const value = valueCell?.textContent.trim() || '';
    if (!key) return;

    switch (key) {
      case 'block title':
        heading.title = value;
        break;
      case 'block title with gradient':
        heading.gradient = value;
        break;
      case 'main tab':
        tab = { label: value, options: [] };
        tabs.push(tab);
        option = null;
        subTab = null;
        break;
      case 'end main tab':
        // author-facing divider: closes the current main tab, renders nothing
        tab = null;
        option = null;
        subTab = null;
        break;
      case 'radio option':
      case 'option': // older label, still accepted
        if (!tab) {
          // eslint-disable-next-line no-console
          console.warn(`solution-finder: Radio Option "${value}" ignored, it must follow a Main Tab row`);
          break;
        }
        option = { label: value, subTabs: [] };
        tab.options.push(option);
        subTab = null;
        break;
      case 'sub tab':
        if (!option) {
          // eslint-disable-next-line no-console
          console.warn(`solution-finder: Sub Tab "${value}" ignored, it must follow a Radio Option row`);
          break;
        }
        subTab = {
          label: value,
          title: '',
          sectionLabel: '',
          image: null,
          description: null,
          productsLabel: '',
          products: [],
        };
        option.subTabs.push(subTab);
        break;
      case 'title':
        if (needSubTab('Title')) subTab.title = value;
        break;
      case 'section label':
        if (needSubTab('Section Label')) subTab.sectionLabel = value;
        break;
      case 'section image':
        if (needSubTab('Section Image')) subTab.image = valueCell?.querySelector('picture') || valueCell?.querySelector('img');
        break;
      case 'section description':
        if (needSubTab('Section Description') && valueCell) subTab.description = valueCell;
        break;
      case 'products label':
        if (needSubTab('Products Label')) subTab.productsLabel = value;
        break;
      case 'product': {
        if (!needSubTab('Product')) break;
        const product = {
          image: cells[1]?.querySelector('picture') || cells[1]?.querySelector('img'),
          title: cells[2]?.textContent.trim() || '',
          bullets: getBullets(cells[3]),
          url: getUrl(cells[4]),
          sku: productLabel?.[1].trim() || '',
        };
        const hasData = product.image || product.title || product.bullets || product.url;
        if (hasData) subTab.products.push(product);
        break;
      }
      default:
        // eslint-disable-next-line no-console
        console.warn(`solution-finder: unknown row label "${cells[0]?.textContent.trim()}" ignored`);
    }
  });

  tabs.forEach((t) => {
    if (t.options.length > 2) {
      // eslint-disable-next-line no-console
      console.warn(`solution-finder: Main Tab "${t.label}" has ${t.options.length} options, 2 are expected`);
    }
  });
  return { heading, tabs };
}

/** Block heading: plain title followed by the gradient part, either may be empty. */
function buildHeading({ title, gradient }) {
  if (!title && !gradient) return null;
  const h2 = document.createElement('h2');
  h2.className = 'solution-finder-heading';
  if (title) h2.append(title);
  if (gradient) {
    const span = document.createElement('span');
    span.className = 'solution-finder-heading-gradient';
    span.textContent = gradient;
    h2.append(title ? ' ' : '', span);
  }
  return h2;
}

/**
 * Wishlist heart, as in cards-nilaya: the attributes of wishlistHeart (scripts/wishlist.js),
 * which handles its clicks and saved state. Built here so wishlist.js can load after render.
 */
function wishlistButton(sku, name) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'solution-finder-wishlist';
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-label', `Wishlist: ${name || sku}`);
  button.dataset.attrSku = sku;
  button.dataset.pid = sku;
  button.dataset.attrAction = 'like';
  button.dataset.attrType = 'products';
  if (name) button.dataset.attrTitle = name;
  return button;
}

function buildProductCard(product) {
  const item = document.createElement('li');
  item.className = 'solution-finder-card';

  const card = document.createElement(product.url ? 'a' : 'div');
  card.className = 'solution-finder-card-link';
  if (product.url) card.href = product.url;
  const name = product.title
    || product.bullets?.querySelector('li')?.textContent.trim()
    || product.image?.querySelector('img')?.alt
    || '';
  if (product.url && name) card.setAttribute('aria-label', name);

  if (product.image) {
    const media = document.createElement('div');
    media.className = 'solution-finder-card-image';
    media.append(product.image);
    card.append(media);
  }
  if (product.title) {
    const title = document.createElement('p');
    title.className = 'solution-finder-card-title';
    title.textContent = product.title;
    card.append(title);
  }
  if (product.bullets) {
    product.bullets.classList.add('solution-finder-card-bullets');
    card.append(product.bullets);
  }
  if (card.href) {
    card.addEventListener('click', () => {
      pushAdobeProductTitleClick({
        event: 'product_tile_click',
        productName: name,
        destinationUrl: card.href || '',
      });
    });
  }
  item.append(card);
  // the heart only for a product with a SKU, as in cards-nilaya
  if (product.sku) item.append(wishlistButton(product.sku, name));
  return item;
}

/** Prev / next arrows for the horizontally scrolling product cards (mobile). */
function buildProductsNav(list) {
  const nav = document.createElement('div');
  nav.className = 'solution-finder-products-nav';
  // the cards stay reachable by scrolling and tabbing, the arrows are a pointer shortcut
  nav.setAttribute('aria-hidden', 'true');
  const [prev, next] = [-1, 1].map((dir) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.tabIndex = -1;
    btn.className = `solution-finder-products-${dir < 0 ? 'prev' : 'next'}`;
    btn.innerHTML = ARROW_ICON;
    btn.addEventListener('click', () => {
      const card = list.querySelector('.solution-finder-card');
      const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
      list.scrollBy({ left: dir * (card.offsetWidth + gap), behavior: 'smooth' });
    });
    nav.append(btn);
    return btn;
  });
  const update = () => {
    const max = list.scrollWidth - list.clientWidth;
    nav.hidden = max <= 1;
    prev.disabled = list.scrollLeft <= 1;
    next.disabled = list.scrollLeft >= max - 1;
  };
  list.addEventListener('scroll', update, { passive: true });
  // also fires when the list is first shown (opening an accordion item)
  new ResizeObserver(update).observe(list);
  return nav;
}

function buildDetail(subTab, id) {
  const detail = document.createElement('div');
  detail.className = 'solution-finder-detail';
  detail.id = id;
  detail.hidden = true;

  if (subTab.title) {
    const h3 = document.createElement('h3');
    h3.className = 'solution-finder-title';
    h3.textContent = subTab.title;
    detail.append(h3);
  }
  if (subTab.sectionLabel) {
    const h4 = document.createElement('h4');
    h4.className = 'solution-finder-section-label';
    h4.textContent = subTab.sectionLabel;
    detail.append(h4);
  }
  if (subTab.image || subTab.description) {
    const section = document.createElement('div');
    section.className = 'solution-finder-section';
    if (subTab.image) {
      const media = document.createElement('div');
      media.className = 'solution-finder-section-image';
      media.append(subTab.image);
      section.append(media);
    }
    if (subTab.description) {
      const desc = document.createElement('div');
      desc.className = 'solution-finder-section-description';
      // keep authored paragraphs, bold and links
      if (subTab.description.querySelector('p')) desc.append(...subTab.description.childNodes);
      else {
        const p = document.createElement('p');
        p.append(...subTab.description.childNodes);
        desc.append(p);
      }
      section.append(desc);
    }
    detail.append(section);
  }
  if (subTab.products.length) {
    if (subTab.productsLabel) {
      const h4 = document.createElement('h4');
      h4.className = 'solution-finder-products-label';
      h4.textContent = subTab.productsLabel;
      detail.append(h4);
    }
    const list = document.createElement('ul');
    list.className = 'solution-finder-products';
    subTab.products.forEach((product) => list.append(buildProductCard(product)));
    detail.append(list);
    if (subTab.products.length > 1) detail.append(buildProductsNav(list));
  }
  return detail;
}

export default function decorate(block) {
  const { heading, tabs } = parseRows(block);
  instanceCount += 1;
  const makeId = makeIdFactory(`sf${instanceCount > 1 ? instanceCount : ''}`);
  const isDesktop = () => desktopMQ.matches;

  const tabList = document.createElement('div');
  tabList.className = 'solution-finder-tabs';
  tabList.setAttribute('role', 'tablist');

  const panels = document.createElement('div');
  panels.className = 'solution-finder-panels';

  // per main tab: tab button, panel, a selectOption(i) to reset its state and a
  // setLayout(desktop) to move the contents between accordion and right column
  const tabState = tabs.map((tab) => {
    const tabId = makeId(tab.label, 'tab');
    const panelId = makeId(tab.label, 'panel');

    const tabBtn = document.createElement('button');
    tabBtn.type = 'button';
    tabBtn.className = 'solution-finder-tab';
    tabBtn.id = tabId;
    tabBtn.setAttribute('role', 'tab');
    tabBtn.setAttribute('aria-controls', panelId);
    tabBtn.textContent = tab.label;
    tabList.append(tabBtn);

    const panel = document.createElement('div');
    panel.className = 'solution-finder-panel';
    panel.id = panelId;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tabId);
    panel.tabIndex = 0;

    const nav = document.createElement('div');
    nav.className = 'solution-finder-nav';
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'solution-finder-options';
    const legend = document.createElement('legend');
    legend.className = 'solution-finder-visually-hidden';
    legend.textContent = tab.label;
    fieldset.append(legend);
    nav.append(fieldset);

    const content = document.createElement('div');
    content.className = 'solution-finder-content';
    content.setAttribute('aria-live', 'polite');

    const radioName = makeId(tab.label, 'option');
    const optionState = tab.options.map((option) => {
      const wrap = document.createElement('div');
      wrap.className = 'solution-finder-option';

      const control = document.createElement('div');
      control.className = 'solution-finder-option-control';
      const inputId = makeId(tab.label, option.label, 'radio');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = radioName;
      input.id = inputId;
      input.className = 'solution-finder-radio';
      const label = document.createElement('label');
      label.htmlFor = inputId;
      label.textContent = option.label;
      control.append(input, label);

      const subList = document.createElement('div');
      subList.className = 'solution-finder-subtabs';
      subList.setAttribute('role', 'group');
      subList.setAttribute('aria-label', option.label);
      subList.hidden = true;

      const subState = option.subTabs.map((subTab) => {
        const detailId = makeId(tab.label, option.label, subTab.label);
        const item = document.createElement('div');
        item.className = 'solution-finder-subtab-item';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'solution-finder-subtab';
        btn.textContent = subTab.label;
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', detailId);
        item.append(btn);
        subList.append(item);
        return { btn, item, detail: buildDetail(subTab, detailId) };
      });

      wrap.append(control, subList);
      fieldset.append(wrap);
      return { input, subList, subState };
    });

    let activeOption = null;
    // si = -1 closes every sub tab (mobile accordion only)
    const selectSub = (opt, si) => {
      optionState.forEach((o) => o.subState.forEach((s, i) => {
        const active = o === opt && i === si;
        s.btn.setAttribute('aria-expanded', String(active));
        s.btn.classList.toggle('is-active', active);
        s.detail.hidden = !active;
      }));
    };
    const selectOption = (oi) => {
      activeOption = optionState[oi];
      if (!activeOption) return;
      optionState.forEach((o) => {
        const active = o === activeOption;
        o.input.checked = active;
        o.subList.hidden = !active || !o.subState.length;
      });
      // the mobile accordion starts closed, desktop always shows one sub tab
      selectSub(activeOption, isDesktop() ? 0 : -1);
    };
    const setLayout = (desktop) => {
      optionState.forEach((o) => o.subState.forEach((s) => {
        (desktop ? content : s.item).append(s.detail);
      }));
      const anyOpen = activeOption?.subState.some((s) => !s.detail.hidden);
      if (desktop && activeOption && !anyOpen) selectSub(activeOption, 0);
    };

    optionState.forEach((o, oi) => {
      o.input.addEventListener('change', () => { if (o.input.checked) selectOption(oi); });
      o.subState.forEach((s, si) => s.btn.addEventListener('click', () => {
        const mainTab = tab.label;

        const radioText = document.querySelector(
          `label[for="${o.input.id}"]`,
        )?.textContent.trim() || '';

        const subTab = s.btn.textContent.trim();

        const filterValue = `${mainTab} | ${radioText} | ${subTab}`;
        pushAdobeCalculatorEvents({
          event: 'waterproofing_categories_filter',
          filter: filterValue,
        });

        if (isDesktop()) {
          selectSub(o, si);
          return;
        }
        const opening = s.detail.hidden;
        selectSub(o, opening ? si : -1);
        // closing a long item above can push this header out of view
        if (opening && s.btn.getBoundingClientRect().top < 0) {
          s.btn.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
      }));
    });

    const body = document.createElement('div');
    body.className = 'solution-finder-body';
    body.append(nav, content);
    panel.append(body);
    panels.append(panel);

    return {
      tabBtn, panel, selectOption, setLayout,
    };
  });

  const selectTab = (ti, { focus = false, reveal = false } = {}) => {
    tabState.forEach((t, i) => {
      const active = i === ti;
      t.tabBtn.setAttribute('aria-selected', String(active));
      t.tabBtn.tabIndex = active ? 0 : -1;
      t.panel.hidden = !active;
    });
    const current = tabState[ti];
    if (!current) return;
    current.selectOption(0);
    if (focus) current.tabBtn.focus({ preventScroll: true });
    // keep the active tab visible in the horizontally scrolling tab row
    if (reveal && tabList.scrollWidth > tabList.clientWidth) {
      tabList.scrollTo({ left: current.tabBtn.offsetLeft - 16, behavior: 'smooth' });
    }
  };

  tabState.forEach((t, ti) => {
    t.tabBtn.addEventListener('click', () => {
      pushAdobeCalculatorEvents({
        event: 'waterproofing_categories',
        category: t.tabBtn.textContent?.trim(),
      });
      selectTab(ti, { reveal: true });
    });
  });
  tabList.addEventListener('keydown', (e) => {
    const current = tabState.findIndex((t) => t.tabBtn === document.activeElement);
    if (current < 0) return;
    const last = tabState.length - 1;
    const next = {
      ArrowRight: current === last ? 0 : current + 1,
      ArrowLeft: current === 0 ? last : current - 1,
      Home: 0,
      End: last,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    selectTab(next, { focus: true, reveal: true });
  });

  const applyLayout = () => tabState.forEach((t) => t.setLayout(isDesktop()));
  applyLayout();
  desktopMQ.addEventListener('change', applyLayout);

  // only the first visible section image loads eagerly
  panels.querySelectorAll('img').forEach((img) => { img.loading = 'lazy'; });
  block.replaceChildren(...[buildHeading(heading), tabList, panels].filter(Boolean));
  if (tabState.length) {
    selectTab(0);
    const firstImage = panels.querySelector('.solution-finder-detail:not([hidden]) .solution-finder-section-image img');
    if (firstImage) firstImage.loading = 'eager';
  }
  // wishlist: loaded after render (not to delay the page), it paints and handles the hearts
  if (block.querySelector('[data-attr-sku]')) {
    import('../../scripts/wishlist.js').then(({ default: initWishlist }) => initWishlist(block));
  }
}
