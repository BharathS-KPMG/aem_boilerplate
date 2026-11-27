/*
 * Colour Inspiration Listing (color-inspiration-listing)
 * The listing of colour inspiration pages (legacy component colorinspirationlisting on
 * /inspiration/bedroom-colour-combination): the room tabs, the Filters pop-up and Load More for
 * the cards-inspiration blocks in the sections after it.
 *   - Room tabs: links to the room listing pages. The tab whose link is this page is
 *     highlighted (paths compared without host, .html or trailing slash); on a colour page of
 *     the room (one of its Colour | URL pages) the room's tab; a bold label marks a tab by hand.
 *   - Filters: a button that opens the "Filter by Colours" pop-up. Like the legacy filter it is
 *     a redirection: the room's colours and the page each goes to are authored in the block
 *     (the Colour | URL table, below). Apply goes to the chosen colour's page; on a colour page
 *     its colour is the one chosen. Clear All goes to the "Clear all URL" (default: the room
 *     tab's page). No colours: no Filters button.
 *   - Load More: the first 12 cards show, each Load More shows the next 12. When the authored
 *     cards run out, the cards blocks are asked (MORE_EVENT) to add their room's sheet cards.
 * Self-contained: it needs only scripts/aem.js.
 *
 * Authoring: every row is | label | value |, all optional. The labels:
 *   Title                        heading above the tabs (default "Inspiration by spaces")
 *   Inspiration detail page      detail page path that slugs in the cards sheet are under
 *   CTA Text                     the button on every card, as written (e.g. "Book Colour
 *                                Consultation", "Book a Visit"); empty or no row: no button
 *   CTA Popup Form               the form the CTA opens in the site's pop-up, e.g.
 *                                /eds/forms/book-free-site-visit (see addCta)
 *   CTA Popup Trigger            the class the site's pop-up code listens to (default
 *                                trigger-book-free-site-visit-modal); without a CTA Popup Form,
 *                                a CSS selector of an element to click instead (openPopup)
 *   Room                         the {range} of the sheets (default: the cards block option,
 *                                e.g. "Cards Inspiration (Bedroom)" -> bedroom)
 *   Filters API                  optional: a colour sheet instead of the Colour | URL table
 *                                (also page metadata inspiration-filters-api; see loadColourLinks)
 *   Filter title                 the pop-up heading (default "Filter by Colours")
 *   Clear all URL                where Clear All goes (default: the room tab's page)
 *   Cards per load               cards per batch (default 12)
 *   Filters label | Apply label | Clear all label | Load more label   button texts
 * Any other row with a link is a room tab: | Bedroom | /inspiration/bedroom-colour-combination |
 *
 * The colour filter, at the end of the block: a title row | Colour | URL |, then one row per
 * colour, in the order shown: | blue | /inspiration/bedroom-blue-colour-combination |
 * (the colour as written is the option's label; every row after the title row is a colour).
 * (the earlier labels "Consultation CTA label" / "Consultation popup trigger" still work)
 */
import { getMetadata, toClassName } from '../../scripts/aem.js';
import { pushAdobeCtaClickEvent, pushAdobeCalculatorEvents } from '../../scripts/analytics_1.js';

const NAME = 'color-inspiration-listing';
const CARDS = 'cards-inspiration';
// sent by the cards-inspiration blocks when they render; sent to them for more cards
const CARDS_EVENT = 'inspiration-cards:loaded';
const MORE_EVENT = 'inspiration-cards:more';
const CONSULTATION_EVENT = 'inspiration:consultation';
const TIMEOUT = 4000;

const CONFIG = {
  title: 'title',
  'inspiration detail page': 'detailBase',
  'cta text': 'ctaLabel',
  'cta popup form': 'ctaForm',
  'cta popup trigger': 'ctaSelector',
  room: 'range',
  'filters api': 'filtersApi',
  'filter title': 'filterTitle',
  'clear all url': 'clearUrl',
  'cards per load': 'batch',
  'filters label': 'filtersLabel',
  'apply label': 'applyLabel',
  'clear all label': 'clearLabel',
  'load more label': 'loadMoreLabel',
  // earlier names of the CTA rows, still read
  'consultation cta label': 'ctaLabel',
  'consultation popup trigger': 'ctaSelector',
};
const LINK_FIELDS = ['detailBase', 'clearUrl', 'filtersApi', 'ctaForm'];
// the class the site's pop-up code listens to (as on the header's Book Free Site Visit button)
const DEFAULT_POPUP_TRIGGER = 'trigger-book-free-site-visit-modal';
// the title row of the colour filter table: | Colour | URL |
const COLOUR_LABELS = ['colour', 'color'];
const URL_LABELS = ['url', 'redirection link', 'redirectionlink', 'link'];

const DEFAULTS = {
  title: 'Inspiration by spaces',
  detailBase: '',
  ctaLabel: '',
  ctaForm: '',
  ctaSelector: '',
  range: '',
  filtersApi: '',
  filterTitle: 'Filter by Colours',
  clearUrl: '',
  batch: 12,
  filtersLabel: 'Filters',
  applyLabel: 'Apply',
  clearLabel: 'Clear All',
  loadMoreLabel: 'Load more',
};

let instances = 0;

/** A page path to compare: no host, no .html, no trailing slash, lower case. */
const normalisePath = (path) => (path.replace(/\.html$/, '').replace(/\/$/, '') || '/').toLowerCase();

const pathOf = (href) => {
  try {
    return normalisePath(new URL(href, window.location.href).pathname);
  } catch (e) {
    return '';
  }
};

const herePath = () => normalisePath(window.location.pathname);

/**
 * The colours of a room and the page each one redirects to: the inspiration-{range} sheet,
 * columns colour | redirectionLink (optional label). A whole workbook (multi-sheet) works too:
 * its tab named in the URL (?sheet=) is read.
 * @param {string} url The sheet, with {range} already replaced
 * @returns {Promise<{key: string, label: string, link: string}[]>}
 */
async function loadColourLinks(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  let json;
  try {
    const response = await fetch(url, { signal: controller.signal });
    json = response.ok ? await response.json() : null;
  } catch (e) {
    json = null;
  } finally {
    clearTimeout(timer);
  }
  if (!json) return [];
  if (json[':type'] === 'multi-sheet') {
    const sheet = new URL(url, window.location.href).searchParams.get('sheet');
    json = json[sheet] || {};
  }
  const rows = [json, json.data].find(Array.isArray) || [];
  return rows.map((row) => {
    const colour = String(row.colour ?? row.color ?? row.value ?? '').trim();
    const link = String(row.redirectionLink ?? row['redirection-link'] ?? row.link ?? '').trim();
    return { key: toClassName(colour), label: String(row.label || colour).trim(), link };
  }).filter(({ key, link }) => key && link);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(className, text) {
  const node = el('button', className, text);
  node.type = 'button';
  return node;
}

/** Reads the authored rows: the configuration and the room tabs. */
function readConfig(block) {
  const config = { ...DEFAULTS };
  const tabs = [];
  const colours = [];
  let inColours = false;
  [...block.children].forEach((row) => {
    const [labelCell, valueCell] = row.children;
    if (!labelCell) return;
    const label = labelCell.textContent.trim();
    const field = CONFIG[label.toLowerCase()];
    const link = (valueCell || labelCell).querySelector('a[href]');
    const value = valueCell?.textContent.trim() || '';
    // the colour filter table: a "Colour | URL" title row, then one row per colour
    if (COLOUR_LABELS.includes(label.toLowerCase()) && URL_LABELS.includes(value.toLowerCase())) {
      inColours = true;
      return;
    }
    if (inColours) {
      const href = link?.getAttribute('href') || value;
      const key = toClassName(label);
      if (key && href) colours.push({ key, label, link: href });
      return;
    }
    if (field === 'batch') {
      config.batch = Number.parseInt(value, 10) || DEFAULTS.batch;
    } else if (field) {
      config[field] = (LINK_FIELDS.includes(field) && link?.getAttribute('href')) || value;
    } else if (link) {
      tabs.push({
        row,
        label: label || link.textContent.trim(),
        href: link.getAttribute('href'),
        bold: Boolean(labelCell.querySelector('strong, b')),
      });
    }
  });
  return { config, tabs, colours };
}

function buildTabs(tabs) {
  const nav = el('nav', `${NAME}-tabs`);
  nav.setAttribute('aria-label', 'Inspiration by room');
  const list = el('ul', `${NAME}-tabs-list`);
  tabs.forEach((tab) => {
    const li = el('li');
    const a = el('a', `${NAME}-tab`, tab.label);
    a.href = tab.href;
    tab.link = a;
    a.addEventListener('click', () => {
      if (!tab.href) return;
      const parentTitle = document.querySelector('.color-inspiration-listing-title')
        ?.textContent
        ?.trim() || '';
      pushAdobeCtaClickEvent({
        event: 'cta_link_text', cta: tab.label, destinationUrl: new URL(tab.href, window.location.origin).href, parentTitle,
      });
    });
    li.append(a);
    list.append(li);
  });
  nav.append(list);
  return nav;
}

/**
 * The room tab of this page: the tab whose link is this page; on a colour page of the room, the
 * room's tab (its link's last part starts with the room, e.g. bedroom-colour-combination); else
 * a tab with a bold label.
 */
function findCurrentTab(tabs, colours, range) {
  const here = herePath();
  const exact = tabs.find((tab) => pathOf(tab.href) === here);
  if (exact) return exact;
  const onColourPage = colours.some((colour) => pathOf(colour.link) === here);
  const roomTab = onColourPage && range
    && tabs.find((tab) => pathOf(tab.href).split('/').pop().startsWith(`${range}-`));
  return roomTab || tabs.find((tab) => tab.bold) || null;
}

function markTab(tabs, current) {
  tabs.forEach((tab) => {
    if (tab === current) tab.link.setAttribute('aria-current', 'page');
    else tab.link.removeAttribute('aria-current');
  });
}

/**
 * The card CTA (CTA Text row) placeholder. The pop-up itself belongs to the site: the CTA
 *   - announces itself with the `inspiration:consultation` event on the document (detail: the
 *     card's title, link and element), for code that opens the pop-up from the event, and
 *   - clicks the first element outside this block that matches the authored "CTA Popup
 *     Trigger" selector, so a pop-up bound to that element (or to clicks on its class) opens.
 */
function openPopup(cta, selector, block) {
  const card = cta.closest(`.${CARDS}-card`);
  const link = card?.querySelector(`.${CARDS}-title a`);
  const detail = { title: link?.textContent.trim() || '', link: link?.href || '', card };
  document.dispatchEvent(new CustomEvent(CONSULTATION_EVENT, { detail }));
  if (!selector) return;
  try {
    const trigger = [...document.querySelectorAll(selector)]
      .find((candidate) => !block.contains(candidate));
    trigger?.click();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`${NAME}: invalid CTA Popup Trigger "${selector}"`);
  }
}

/** The room ({range}): the Room row, else the option of the first cards block after the block. */
function findRange(config, listing) {
  if (config.range) return toClassName(config.range);
  const cards = listing.map((part) => part.querySelector(`.${CARDS}`)).find(Boolean);
  return cards ? [...cards.classList].find((cls) => cls !== 'block' && cls !== CARDS) || '' : '';
}

export default function decorate(block) {
  instances += 1;
  const id = `${NAME}-${instances}`;
  const { config, tabs, colours: authoredColours } = readConfig(block);
  let visible = config.batch;

  /* ---- header: title, room tabs and the Filters button with its pop-up ---- */
  const header = el('div', `${NAME}-header`);
  if (config.title) {
    // the page heading when the page has none
    const heading = el(document.querySelector('main h1') ? 'h2' : 'h1', `${NAME}-title`, config.title);
    header.append(heading);
  }
  if (tabs.length) header.append(buildTabs(tabs));

  const filter = el('div', `${NAME}-filter`);
  filter.hidden = true;
  const toggle = button(`${NAME}-toggle`, config.filtersLabel);
  const badge = el('span', `${NAME}-badge`);
  badge.hidden = true;
  toggle.append(badge, el('span', `${NAME}-toggle-icon`));
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', `${id}-panel`);
  const panel = el('div', `${NAME}-panel`);
  panel.id = `${id}-panel`;
  panel.hidden = true;
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', config.filtersLabel);
  const fieldset = el('fieldset', `${NAME}-group`);
  fieldset.append(el('legend', `${NAME}-group-title`, config.filterTitle));
  const options = el('ul', `${NAME}-options`);
  fieldset.append(options);
  const actions = el('div', `${NAME}-actions`);
  const apply = button(`${NAME}-apply`, config.applyLabel);
  const clear = button(`${NAME}-clear`, config.clearLabel);
  actions.append(apply, clear);
  panel.append(fieldset, actions);
  filter.append(toggle, panel);
  header.append(filter);

  /* ---- results: the listing sections after this block and Load More ---- */
  const results = el('div', `${NAME}-results`);
  const status = el('p', `${NAME}-status`);
  status.setAttribute('aria-live', 'polite');
  const more = el('div', `${NAME}-more`);
  const loadMore = button(`${NAME}-load-more`, config.loadMoreLabel);
  more.append(loadMore);
  more.hidden = true;

  // the cards-inspiration sections that follow this block's section are its listing
  const section = block.closest('.section');
  const listing = [];
  let next = section?.nextElementSibling;
  while (next?.classList.contains('section') && next.querySelector(`.${CARDS}`)) {
    listing.push(next);
    next = next.nextElementSibling;
  }
  results.append(status, ...listing, more);
  block.replaceChildren(header, results);

  const range = findRange(config, listing);
  let colours = [];
  let currentColour = null;
  markTab(tabs, findCurrentTab(tabs, colours, range));

  /* ---- cards and Load More ---- */
  const items = () => [...results.querySelectorAll(`.${CARDS}-item`)];

  /**
   * The card CTA. With a CTA Popup Form it is the site's pop-up trigger, in the same markup as
   * the header's Book Free Site Visit button:
   *   <a class="... trigger-book-free-site-visit-modal" href="/eds/forms/..."
   *     data-modal-path="/eds/forms/...">
   * The site's own click listener (scripts/delayed.js on edspoc-stg) opens the form in its modal.
   * Until that listener is there (it loads late), the CTA opens the modal itself
   * (blocks/modal/modal.js openModal), else goes to the form page.
   */
  function addCta(item) {
    if (!config.ctaLabel || item.querySelector(`.${CARDS}-cta`)) return;
    const form = config.ctaForm;
    let cta;
    if (form) {
      cta = el('a', `${CARDS}-cta`, config.ctaLabel);
      cta.href = form;
      cta.dataset.modalPath = form;
      (config.ctaSelector || DEFAULT_POPUP_TRIGGER).replace(/\./g, ' ').split(/\s+/)
        .filter(Boolean).forEach((cls) => cta.classList.add(cls));
    } else {
      cta = button(`${CARDS}-cta`, config.ctaLabel);
    }
    cta.setAttribute('aria-haspopup', 'dialog');
    const link = item.querySelector(`.${CARDS}-title a`);
    if (link) {
      cta.dataset.inspirationTitle = link.textContent.trim();
      cta.dataset.inspirationLink = link.href;
    }
    cta.addEventListener('click', async (e) => {
      if (!form) {
        openPopup(cta, config.ctaSelector, block);
        return;
      }
      // reached only when the site's listener has not taken the click
      e.preventDefault();
      if (cta.dataset.loading === 'true') return;
      cta.dataset.loading = 'true';
      const { inspirationTitle: title = '', inspirationLink: href = '' } = cta.dataset;
      const card = cta.closest(`.${CARDS}-card`);
      const detail = { title, link: href, card };
      document.dispatchEvent(new CustomEvent(CONSULTATION_EVENT, { detail }));
      try {
        // the site's modal block (edspoc-stg), as its header button uses
        // eslint-disable-next-line import/no-unresolved
        const { openModal } = await import('../modal/modal.js');
        await openModal(form);
      } catch {
        window.location.assign(cta.href);
      } finally {
        delete cta.dataset.loading;
      }
    });
    item.querySelector(`.${CARDS}-body`)?.append(cta);
  }

  function render() {
    const all = items();
    const shown = new Set(all.slice(0, visible));
    all.forEach((item) => { item.hidden = !shown.has(item); });
    // a listing section (heading included) shows while it has cards to show
    results.querySelectorAll(`:scope > .section, :scope > .${NAME}-feed`).forEach((part) => {
      const cards = part.querySelectorAll(`.${CARDS}-item`);
      if (!cards.length) return;
      part.hidden = ![...cards].some((item) => !item.hidden);
    });
    more.hidden = all.length <= shown.size;
    status.textContent = all.length ? `Showing ${shown.size} of ${all.length} inspirations` : '';
    return { all, shown };
  }

  /* ---- the colour filter: a redirection ---- */
  const inputs = () => [...options.querySelectorAll('input')];

  // the pop-up shows this page's colour; a choice not applied is dropped when it closes
  function syncInputs() {
    inputs().forEach((input) => { input.checked = input.value === currentColour?.key; });
  }

  /**
   * Opens or closes the pop-up. Opening moves focus to the chosen option (or the first), with the
   * focus ring only when opened from the keyboard, as the source shows none for the mouse.
   */
  function openPanel(open, restoreFocus = false, keyboard = false) {
    if (open) syncInputs();
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      (options.querySelector('input:checked') || options.querySelector('input'))
        ?.focus({ preventScroll: true, focusVisible: keyboard });
    } else if (restoreFocus) {
      toggle.focus({ preventScroll: true });
    }
  }

  // goes to a page, unless it is this one (then the pop-up just closes)
  function go(href) {
    if (href && pathOf(href) !== herePath()) {
      window.location.href = href;
      return;
    }
    openPanel(false, true);
  }

  /** The colour sheet is in: the options, this page's colour and the room tab. */
  function initColours(loaded) {
    colours = loaded;
    const here = herePath();
    currentColour = colours.find((colour) => pathOf(colour.link) === here) || null;
    options.replaceChildren(...colours.map(({ key, label, link }) => {
      const li = el('li');
      const option = el('label', `${NAME}-option`);
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `${id}-colour`;
      input.value = key;
      input.dataset.link = link;
      option.append(input, el('span', `${NAME}-option-name`, label));
      li.append(option);
      return li;
    }));
    // without colours (no sheet) the listing works on, without the Filters button
    filter.hidden = !colours.length;
    badge.textContent = currentColour ? '1' : '';
    badge.hidden = !currentColour;
    toggle.setAttribute('aria-label', currentColour ? `${config.filtersLabel}, ${currentColour.label} applied` : config.filtersLabel);
    markTab(tabs, findCurrentTab(tabs, colours, range));
    syncInputs();
  }

  // the colours: the block's own Colour | URL rows; without them, a sheet when one is set up
  // (Filters API row or page metadata inspiration-filters-api; {range} is the room)
  const api = config.filtersApi || getMetadata('inspiration-filters-api');
  if (authoredColours.length) {
    initColours(authoredColours);
  } else if (api && (range || !/\{(range|roomType)\}/.test(api))) {
    loadColourLinks(api.replace(/\{(range|roomType)\}/g, encodeURIComponent(range)))
      .then(initColours);
  }

  /* ---- events ---- */
  // a click with no pointer (detail 0) comes from Enter or Space
  toggle.addEventListener('click', (e) => openPanel(panel.hidden, false, e.detail === 0));

  apply.addEventListener('click', () => {
    const chosen = options.querySelector('input:checked');

    if (chosen) {
      const value = chosen.closest(`.${NAME}-option`)
        ?.querySelector(`.${NAME}-option-name`)
        ?.textContent
        ?.trim() || '';

      const parentTitle = document.querySelector(
        '.color-inspiration-listing-tab[aria-current="page"]',
      )?.textContent?.trim() || '';

      pushAdobeCalculatorEvents({
        event: 'filter_click',
        filter: value,
        parentTitle,
      });

      go(chosen.dataset.link);
    } else {
      openPanel(false, true);
    }
  });

  // Clear All: the Clear all URL, else the room tab's page (this page's room without a colour)
  clear.addEventListener('click', () => {
    const target = config.clearUrl || findCurrentTab(tabs, colours, range)?.href || '';
    if (!target || pathOf(target) === herePath()) {
      inputs().forEach((input) => { input.checked = false; });
    }
    go(target);
  });

  // Escape, a click elsewhere or tabbing out closes the pop-up without applying
  block.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) openPanel(false, true);
  });
  filter.addEventListener('focusout', (e) => {
    if (!panel.hidden && e.relatedTarget && !filter.contains(e.relatedTarget)) openPanel(false);
  });
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !filter.contains(e.target)) openPanel(false);
  });

  loadMore.addEventListener('click', () => {
    pushAdobeCtaClickEvent({
      event: 'custom_cta_click',
      cta: 'Load more',
    });

    const before = render().shown.size;
    visible += config.batch;
    const { all, shown } = render();
    // keyboard users continue at the first new card
    all.filter((item) => shown.has(item))[before]?.querySelector('a[href]:not([tabindex="-1"])')?.focus();
    // every card shown: the cards blocks add their room's sheet cards (once)
    if (shown.size >= all.length) {
      document.dispatchEvent(new CustomEvent(MORE_EVENT, {
        detail: { listing: results, detailBase: config.detailBase },
      }));
    }
  });

  // cards blocks render after this block, section by section
  document.addEventListener(CARDS_EVENT, (e) => {
    const { block: cards } = e.detail || {};
    if (!results.contains(cards)) return;
    cards.querySelectorAll(`.${CARDS}-item`).forEach(addCta);
    render();
  });

  render();
  // the current tab in view in the scrolling tab row (narrow screens), once it is laid out
  const tabList = header.querySelector(`.${NAME}-tabs-list`);
  if (tabList) {
    new ResizeObserver((entries, observer) => {
      const currentTab = tabList.querySelector('[aria-current="page"]');
      if (!tabList.clientWidth || !currentTab) return;
      observer.disconnect();
      const left = currentTab.offsetLeft - (tabList.clientWidth - currentTab.offsetWidth) / 2;
      if (tabList.scrollWidth > tabList.clientWidth) tabList.scrollLeft = Math.max(0, left);
    }).observe(tabList);
  }
}
