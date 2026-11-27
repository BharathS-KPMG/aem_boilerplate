import {
  findStores, opening, list, typeKey,
} from './store-data.js';
import { setMapsKey } from '../../scripts/google-maps.js';
import {
  SEARCH_EVENT, RESULT_EVENT, MOBILE, key, el, readFields, fieldReader, instrumentation,
  placeCentre,
} from '../../scripts/store-locator.js';
import { pushAdobeStoreLocatorEvent, pushAdobeCalculatorEvents } from '../../scripts/analytics_1.js';

/**
 * store-finder — the store locator's results: "Showing results for stores in
 * <place>", a Google map with a pin per store and, over it (below it on
 * mobile), the store list: name, type badge, address, opening time, phone,
 * "Store details" (products and services), Directions and Share. Source:
 * asianpaints.com/store-locator (storelocatorlepton's ".storedetails-revamp").
 * Authoring, data and behaviour: README.md.
 *
 * The block is empty until a search: a city-stores card on the same page
 * (it sends "store-finder:search", see scripts/store-locator.js), or ?q=<place> in the URL,
 * as the source. With neither, the browser asks for the visitor's location and the stores
 * near it show first (as the source).
 *
 * Authoring (DA table): label | value rows only (texts, Maps API key,
 * endpoint, snapshot sheet, radius, limit, store types, page sizes).
 */

const DEFAULTS = {
  heading: 'Showing results for stores in',
  nearYou: 'Near You',
  storeDetails: 'Store details',
  products: 'Products available',
  services: 'Services available',
  directions: 'Directions',
  share: 'Share',
  message: 'Message',
  mail: 'Mail',
  mailSubject: 'Store Locator',
  loadMore: 'Load more',
  open: 'Open-',
  openNow: '(open now)',
  closes: 'Closes:',
  phone: 'Phone:',
  notFound: 'No store found',
  loading: 'Finding stores…',
  results: '{count} stores found in {place}',
  close: 'Close store view',
  showOnMap: 'Show on map',
  mapLabel: 'Map of stores',
  newTab: '(opens in a new tab)',
  filter: 'Filter',
  filterProducts: 'Products',
  filterServices: 'Services',
  apply: 'Apply',
  clearAll: 'Clear all',
  closeFilter: 'Close filter',
  closeDialog: 'Close',
  smsTitle: 'Please enter your mobile number',
  smsText: 'To receive the dealer details on SMS',
  smsMobile: 'Mobile',
  smsSubmit: 'SUBMIT',
  smsRequired: 'Field is required',
  smsInvalid: 'Phone number is invalid',
  smsSuccess: 'Success',
  smsEndpoint: '/apcolourcatalogue/smsService.json',
  mapsKey: '',
  endpoint: '/content/ap/en/home/store-locator/jcr:content/root/responsivegrid_320175147/responsivegrid_242725073/storelocatorlepton_c.json',
  snapshot: '/data/store-finder.json',
  radius: '15000',
  limit: '25',
  types: 'Beautiful Homes,Colour Ideas,EzyCR Prime,EZY CR,CR NXT Prime,CR NXT,Colour World,Non-colour world',
  sortByDistance: 'no',
  pageSize: '5',
  moreSize: '5',
};

const FIELDS = {
  heading: 'heading',
  'near you label': 'nearYou',
  'store details label': 'storeDetails',
  'products label': 'products',
  'services label': 'services',
  'directions label': 'directions',
  'share label': 'share',
  'message label': 'message',
  'mail label': 'mail',
  'mail subject': 'mailSubject',
  'load more label': 'loadMore',
  'open label': 'open',
  'open now label': 'openNow',
  'closes label': 'closes',
  'phone label': 'phone',
  'not found text': 'notFound',
  'loading text': 'loading',
  'results text': 'results',
  'close label': 'close',
  'show on map label': 'showOnMap',
  'map label': 'mapLabel',
  'new tab note': 'newTab',
  'filter label': 'filter',
  'filter products label': 'filterProducts',
  'filter services label': 'filterServices',
  'apply label': 'apply',
  'clear all label': 'clearAll',
  'close filter label': 'closeFilter',
  'close dialog label': 'closeDialog',
  'sms title': 'smsTitle',
  'sms text': 'smsText',
  'sms mobile label': 'smsMobile',
  'sms submit label': 'smsSubmit',
  'sms required text': 'smsRequired',
  'sms invalid text': 'smsInvalid',
  'sms success text': 'smsSuccess',
  'sms endpoint': 'smsEndpoint',
  'maps api key': 'mapsKey',
  endpoint: 'endpoint',
  snapshot: 'snapshot',
  radius: 'radius',
  limit: 'limit',
  'store types': 'types',
  'sort by distance': 'sortByDistance',
  'page size': 'pageSize',
  'load more size': 'moreSize',
};

let uid = 0;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const icon = (base, name, size = 22) => el('img', 'store-finder-icon', {
  src: `${base}/${name}.svg`, alt: '', width: size, height: size, loading: 'lazy',
});

export default async function decorate(block) {
  // label | value rows
  const fields = readFields(block, FIELDS);
  const v = fieldReader(fields, DEFAULTS, ['endpoint', 'snapshot', 'smsEndpoint']);
  const moveInstrumentation = await instrumentation();

  uid += 1;
  const id = `store-finder-${uid}`;
  const icons = `${window.hlx?.codeBasePath || ''}/blocks/store-finder/icons`;
  const mq = window.matchMedia(MOBILE);

  /* ---------- skeleton ---------- */
  const head = el('div', 'store-finder-head');
  const heading = el('h2', 'store-finder-heading', { id: `${id}-heading`, tabindex: '-1' });
  // the source's "Filter" button (beside the heading) and the chosen filters under it
  const filterBtn = el('button', 'store-finder-filter-btn', {
    type: 'button', 'aria-expanded': 'false', 'aria-controls': `${id}-filter`, hidden: true,
  });
  filterBtn.append(document.createTextNode(v('filter')), el('span', 'store-finder-filter-icon', { 'aria-hidden': 'true' }));
  head.append(heading, filterBtn);
  const notFound = el('p', 'store-finder-not-found', { hidden: true });
  notFound.textContent = v('notFound');
  head.append(notFound);
  const chips = el('div', 'store-finder-chips', { hidden: true });
  head.append(chips);

  // the filter panel: a popover on desktop, a full-screen sheet on mobile
  const filterPanel = el('div', 'store-finder-filter', {
    id: `${id}-filter`, role: 'group', 'aria-label': v('filter'), hidden: true,
  });
  const filterTop = el('div', 'store-finder-filter-top');
  filterTop.append(document.createTextNode(v('filter')));
  const filterClose = el('button', 'store-finder-filter-close', { type: 'button', 'aria-label': v('closeFilter') });
  filterTop.append(filterClose);
  const filterTypes = el('div', 'store-finder-filter-types');
  const filterGroups = {};
  [['product', v('filterProducts')], ['service', v('filterServices')]].forEach(([kind, title]) => {
    const group = el('div', 'store-finder-filter-type', { hidden: true });
    const t = el('p', 'store-finder-filter-title');
    t.textContent = title;
    const options = el('div', 'store-finder-filter-options');
    group.append(t, options);
    filterTypes.append(group);
    filterGroups[kind] = { group, options };
  });
  const filterActions = el('div', 'store-finder-filter-actions');
  const applyBtn = el('button', 'store-finder-filter-apply', { type: 'button' });
  applyBtn.textContent = v('apply');
  const clearBtn = el('button', 'store-finder-filter-clear', { type: 'button' });
  clearBtn.textContent = v('clearAll');
  filterActions.append(applyBtn, clearBtn);
  filterPanel.append(filterTop, filterTypes, filterActions);

  const mapBox = el('div', 'store-finder-map', { role: 'region', 'aria-label': v('mapLabel') });
  const panel = el('div', 'store-finder-panel');
  const scroller = el('div', 'store-finder-scroller');
  const listEl = el('ul', 'store-finder-list', { 'aria-labelledby': heading.id });
  const more = el('button', 'store-finder-more', { type: 'button', hidden: true });
  const moreLabel = el('span');
  moreLabel.textContent = v('loadMore');
  more.append(moreLabel, el('span', 'store-finder-more-arrow', { 'aria-hidden': 'true' }));
  scroller.append(listEl, more);
  panel.append(scroller);
  const status = el('p', 'store-finder-sr-only', { role: 'status', 'aria-live': 'polite' });

  if (fields.heading) moveInstrumentation(fields.heading.row, heading);
  block.replaceChildren(head, filterPanel, mapBox, panel, status);
  block.classList.add('is-idle');

  /* ---------- map (only with an authored key) ---------- */
  let mapApi = null;
  let mapReady = null;
  // the authored key, else the page's "google-maps-key" metadata (shared with store-search)
  const mapsKey = setMapsKey(v('mapsKey'));
  const ensureMap = () => {
    if (!mapsKey) return Promise.resolve(null);
    if (!mapReady) {
      mapReady = import('./store-map.js')
        .then(({ default: createMap }) => createMap(mapBox, {
          apiKey: mapsKey,
          icons,
          labels: { phone: v('phone'), directions: v('directions'), newTab: v('newTab') },
        }))
        .then((api) => {
          mapApi = api;
          if (api) block.classList.add('has-map');
          // eslint-disable-next-line no-use-before-define
          hints();
          return api;
        })
        .catch(() => null);
    }
    return mapReady;
  };
  if (!mapsKey) mapBox.setAttribute('aria-hidden', 'true');

  /* ---------- state ---------- */
  let found = []; // everything the search returned
  let stores = []; // what the filter lets through
  let shown = 0;
  let centre = null;
  let searched = '';
  const pageSize = Math.max(1, parseInt(v('pageSize'), 10) || 5);
  const moreSize = Math.max(1, parseInt(v('moreSize'), 10) || 5);

  // what a store name does: the map pin (desktop, with a map) or its details
  const hints = () => {
    const label = !mq.matches && mapApi ? v('showOnMap') : v('storeDetails');
    listEl.querySelectorAll('.store-finder-name + .store-finder-sr-only, .store-finder-name .store-finder-sr-only').forEach((h) => { h.textContent = label; });
  };

  const directionsUrl = (s) => `https://www.google.com/maps/dir/${centre ? `${centre.lat},${centre.lng}` : ','}/${s.latitude},${s.longitude}`;
  const phoneText = (s) => (/^\d+(\.\d+)?$/.test(s.phone) ? String(Math.trunc(Number(s.phone))) : 'NA');

  // "Message": the source's mobile-number dialog, loaded when first used
  let shareDialog = null;
  const openSms = async (sms, from) => {
    if (!shareDialog) {
      const { default: createShareDialog } = await import('./store-share.js');
      shareDialog = createShareDialog(block, {
        endpoint: v('smsEndpoint'),
        announce: (msg) => { status.textContent = msg; },
        labels: {
          title: v('smsTitle'),
          text: v('smsText'),
          mobile: v('smsMobile'),
          submit: v('smsSubmit'),
          required: v('smsRequired'),
          invalid: v('smsInvalid'),
          success: v('smsSuccess'),
          close: v('closeDialog'),
        },
      });
    }
    shareDialog(sms, from);
  };

  const closeShareMenus = (except) => {
    listEl.querySelectorAll('.store-finder-share[aria-expanded="true"]').forEach((b) => {
      if (b === except) return;
      b.setAttribute('aria-expanded', 'false');
      document.getElementById(b.getAttribute('aria-controls')).hidden = true;
    });
  };

  // "Store details": the source animates height, opacity, padding and margin
  const setDetails = (btn, openIt) => {
    const box = document.getElementById(btn.getAttribute('aria-controls'));
    btn.setAttribute('aria-expanded', String(openIt));
    btn.classList.toggle('is-open', openIt);
    if (openIt) {
      box.classList.add('is-open');
      box.style.height = 'auto';
      const target = box.scrollHeight;
      box.style.height = '0px';
      requestAnimationFrame(() => { box.style.height = `${target}px`; });
      // once open, let it grow with the text (zoom, text-spacing overrides)
      const settle = () => { if (box.classList.contains('is-open')) box.style.height = 'auto'; };
      box.addEventListener('transitionend', settle, { once: true });
      if (reducedMotion()) settle();
    } else {
      box.style.height = `${box.scrollHeight}px`;
      requestAnimationFrame(() => { box.classList.remove('is-open'); box.style.height = '0px'; });
    }
  };

  /* ---------- mobile single-store view (the source's "active" card) ---------- */
  const leaveFocusView = (focusName = true) => {
    const card = listEl.querySelector('.store-finder-card.is-active');
    if (!card) return;
    card.classList.remove('is-active');
    block.classList.remove('is-focus-view');
    const toggle = card.querySelector('.store-finder-details-toggle');
    if (toggle.getAttribute('aria-expanded') === 'true') setDetails(toggle, false);
    card.querySelector('.store-finder-name-btn').setAttribute('aria-expanded', 'false');
    if (focusName) card.querySelector('.store-finder-name-btn').focus();
  };
  const enterFocusView = (card) => {
    leaveFocusView(false);
    card.classList.add('is-active');
    block.classList.add('is-focus-view');
    card.querySelector('.store-finder-name-btn').setAttribute('aria-expanded', 'true');
    const toggle = card.querySelector('.store-finder-details-toggle');
    if (toggle.getAttribute('aria-expanded') !== 'true') setDetails(toggle, true);
    card.querySelector('.store-finder-close').focus();
  };
  mq.addEventListener('change', () => { leaveFocusView(false); hints(); });

  /* ---------- a card ---------- */
  const card = (s, index) => {
    const li = el('li', 'store-finder-card', { 'data-index': index });
    const cid = `${id}-s${index}`;

    const top = el('div', 'store-finder-card-head');
    const name = el('h3', 'store-finder-name');
    const nameBtn = el('button', 'store-finder-name-btn', { type: 'button', 'aria-describedby': `${cid}-hint` });
    nameBtn.textContent = s.name;
    const hint = el('span', 'store-finder-sr-only', { id: `${cid}-hint` });
    hint.textContent = !mq.matches && mapApi ? v('showOnMap') : v('storeDetails');
    name.append(nameBtn, hint);
    const badge = el('span', 'store-finder-badge', { 'data-type': typeKey(s.type) });
    badge.textContent = s.type;
    const close = el('button', 'store-finder-close', { type: 'button', 'aria-label': v('close') });
    close.append(icon(icons, 'circle-close-icon', 24));
    top.append(name, badge, close);

    const info = el('div', 'store-finder-info-block');
    const address = el('p', 'store-finder-address');
    address.append(icon(icons, 'map'), document.createTextNode(s.address));
    const meta = el('div', 'store-finder-meta');
    // as the source: the clock beside an inline line, so "Open- " keeps its space
    const time = el('div', 'store-finder-time');
    const timeText = el('p', 'store-finder-time-text');
    const when = opening(s.timings);
    const openEl = el('span', `store-finder-open${when.open ? ' is-open' : ''}`);
    openEl.textContent = `${v('open')} `;
    if (when.open) {
      // the source shows "open now" by colour alone (1.4.1): say it too
      const now = el('span', 'store-finder-sr-only');
      now.textContent = `${v('openNow')} `;
      openEl.append(now);
    }
    const closesEl = el('span', 'store-finder-closes');
    closesEl.textContent = `${v('closes')} ${when.closes}`;
    timeText.append(openEl, document.createTextNode(' '), closesEl);
    time.append(icon(icons, 'clock'), timeText);
    const phone = el('p', 'store-finder-phone');
    const digits = phoneText(s);
    phone.append(icon(icons, 'mob'), document.createTextNode(` ${v('phone')} `));
    if (digits !== 'NA') {
      const tel = el('a', 'store-finder-tel', { href: `tel:${digits}` });
      tel.textContent = digits;
      phone.append(tel);
    } else phone.append(document.createTextNode(digits));
    meta.append(time, phone);
    info.append(address, meta);

    const actions = el('div', 'store-finder-actions');
    // store details
    const details = el('div', 'store-finder-details');
    const toggle = el('button', 'store-finder-details-toggle', {
      type: 'button', 'aria-expanded': 'false', 'aria-controls': `${cid}-details`,
    });
    toggle.append(el('span', 'store-finder-store-icon', { 'aria-hidden': 'true' }), document.createTextNode(v('storeDetails')), el('span', 'store-finder-chevron', { 'aria-hidden': 'true' }));
    const box = el('div', 'store-finder-more-info', { id: `${cid}-details` });
    [[v('products'), list(s.products)], [v('services'), list(s.services)]].forEach(([title, items]) => {
      if (!items.length) return;
      const col = el('div', 'store-finder-more-col');
      const t = el('p', 'store-finder-more-title');
      t.textContent = title;
      const ul = el('ul');
      items.forEach((item) => { const x = el('li'); x.textContent = item; ul.append(x); });
      col.append(t, ul);
      box.append(col);
    });
    details.append(toggle, box);
    if (!box.children.length) details.hidden = true;

    // directions + share
    const links = el('div', 'store-finder-links');
    const dir = el('a', 'store-finder-directions', { href: directionsUrl(s), target: '_blank', rel: 'noopener noreferrer' });
    const dirNote = el('span', 'store-finder-sr-only');
    dirNote.textContent = ` ${v('newTab')}`;
    dir.append(el('span', 'store-finder-link-icon', { 'aria-hidden': 'true' }), document.createTextNode(v('directions')), dirNote);
    dir.addEventListener('click', () => {
      pushAdobeStoreLocatorEvent({ event: 'store_locator_direction', title: s.name, pincode: s.pincode });
    });
    const shareWrap = el('div', 'store-finder-share-wrap');
    const share = el('button', 'store-finder-share', {
      type: 'button', 'aria-expanded': 'false', 'aria-controls': `${cid}-share`,
    });
    share.append(el('span', 'store-finder-link-icon', { 'aria-hidden': 'true' }), document.createTextNode(v('share')));
    const menu = el('ul', 'store-finder-share-menu', { id: `${cid}-share`, hidden: true });
    const address2 = s.address.replace('&', 'and');
    const smsBody = `Store Name: ${s.name}.${digits}${digits ? ',' : ''} Shop Address: ${address2}, Google map link: ${directionsUrl(s)} | Asian Paints.`.replace('#', 'No.');
    const mailBody = `${s.name} PH: ${digits} ${address2} ${directionsUrl(s)}`;
    [
      ['msg', v('message'), `sms:?&body=${encodeURIComponent(smsBody)}`, 'SMS'],
      ['mail', v('mail'), `mailto:?subject=${encodeURIComponent(v('mailSubject'))}&body=${encodeURIComponent(mailBody)}`, 'Mail'],
    ].forEach(([cls, label, url]) => {
      const item = el('li');
      // Message opens the source's mobile-number dialog; Mail is a mailto: link
      const a = cls === 'msg'
        ? el('button', `store-finder-share-item is-${cls}`, { type: 'button' })
        : el('a', `store-finder-share-item is-${cls}`, { href: url });
      a.textContent = label;
      a.addEventListener('click', () => {
        pushAdobeStoreLocatorEvent({ event: 'store_locator_share', title: s.name, pincode: s.pincode });
        share.click();
        if (cls === 'msg') openSms(smsBody, share);
      });
      item.append(a);
      menu.append(item);
    });
    share.addEventListener('click', () => {
      const openIt = share.getAttribute('aria-expanded') !== 'true';
      closeShareMenus(share);
      share.setAttribute('aria-expanded', String(openIt));
      menu.hidden = !openIt;
    });
    shareWrap.append(share, menu);
    links.append(dir, shareWrap);
    actions.append(details, links);

    toggle.addEventListener('click', () => {
      const isOpening = toggle.getAttribute('aria-expanded') !== 'true';

      if (isOpening) {
        pushAdobeStoreLocatorEvent({
          event: 'store_locator_view_details',
          title: s.name,
          pincode: s.pincode,
        });
      }

      setDetails(toggle, isOpening);
    });
    nameBtn.addEventListener('click', () => {
      if (mq.matches) {
        if (li.classList.contains('is-active')) leaveFocusView();
        else enterFocusView(li);
      } else if (mapApi) {
        mapApi.open(index);
      } else {
        toggle.click();
      }
    });
    close.addEventListener('click', () => leaveFocusView());

    li.append(top, info, actions);
    return li;
  };

  const paint = () => {
    [...listEl.children].forEach((li, i) => { li.hidden = i >= shown; });
    more.hidden = shown >= stores.length;
  };

  // a pin was chosen: bring its card into view in the panel (the source's 800ms scroll)
  const pick = (index) => {
    while (index >= shown && shown < stores.length) shown += moreSize;
    paint();
    const li = listEl.children[index];
    if (!li) return;
    const top = li.offsetTop - scroller.offsetTop - 100;
    scroller.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' });
    if (mq.matches) enterFocusView(li);
  };

  more.addEventListener('click', () => {
    const first = shown;
    shown += moreSize;
    paint();
    listEl.children[first]?.querySelector('.store-finder-name-btn')?.focus();
  });

  block.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const openShare = listEl.querySelector('.store-finder-share[aria-expanded="true"]');
    if (openShare) { openShare.click(); openShare.focus(); return; }
    if (block.classList.contains('is-focus-view')) leaveFocusView();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.store-finder-share-wrap')) closeShareMenus();
  });

  /* ---------- filter (the source's Products / Services panel) ---------- */
  const boxes = (kind) => [...filterPanel.querySelectorAll(`input[data-kind="${kind}"]`)];
  const chosen = (kind) => boxes(kind).filter((b) => b.checked).map((b) => b.value);

  // what the list and the map show
  const showStores = (view) => {
    stores = view;
    leaveFocusView(false);
    listEl.replaceChildren(...stores.map(card));
    shown = Math.min(pageSize, stores.length);
    paint();
    scroller.scrollTop = 0;
    notFound.hidden = stores.length > 0;
    status.textContent = stores.length
      ? v('results').replace('{count}', stores.length).replace('{place}', searched)
      : v('notFound');
    if (mapApi) mapApi.show(stores, centre, pick);
  };

  const setFilterOpen = (openIt) => {
    filterPanel.hidden = !openIt;
    filterBtn.setAttribute('aria-expanded', String(openIt));
    filterBtn.classList.toggle('is-open', openIt);
    block.classList.toggle('is-filter-open', openIt);
  };

  const drawChips = () => {
    const picked = [...chosen('product'), ...chosen('service')];
    chips.replaceChildren(...picked.map((name) => {
      const chip = el('button', 'store-finder-chip', { type: 'button' });
      chip.textContent = name;
      chip.setAttribute('aria-label', `${name}, ${v('clearAll')}`);
      return chip;
    }));
    chips.hidden = !picked.length;
    return picked;
  };

  // products picked and services picked narrow the list (both: a store needs one of each)
  const applyFilter = () => {
    const wants = ['product', 'service'].map((kind) => chosen(kind).map(key));
    const [ps, ss] = wants;
    drawChips();
    if (!ps.length && !ss.length) { showStores(found); return; }
    showStores(found.filter((s) => {
      const has = [list(s.products).map(key), list(s.services).map(key)];
      const p = ps.some((x) => has[0].includes(x));
      const sv = ss.some((x) => has[1].includes(x));
      return ps.length && ss.length ? p && sv : p || sv;
    }));
  };

  // the choices come from the stores found (as the source: sorted, "nan" never listed)
  const buildOptions = () => {
    ['product', 'service'].forEach((kind) => {
      const names = new Map();
      found.forEach((s) => list(kind === 'product' ? s.products : s.services).forEach((n) => {
        if (!names.has(key(n))) names.set(key(n), n);
      }));
      const { group, options } = filterGroups[kind];
      const sortedNames = [...names.values()].sort((a, b) => a.localeCompare(b));
      options.replaceChildren(...sortedNames.map((name) => {
        const box = `${id}-${kind}-${key(name).replace(/[^a-z0-9]+/g, '-')}`;
        const wrap = el('div', 'store-finder-filter-option');
        const input = el('input', 'store-finder-filter-input', {
          type: 'checkbox', id: box, value: name, 'data-kind': kind,
        });
        const label = el('label', 'store-finder-filter-label', { for: box });
        const text2 = el('span', 'store-finder-filter-label-text');
        text2.textContent = name;
        label.append(el('span', 'store-finder-filter-check', { 'aria-hidden': 'true' }), text2);
        wrap.append(input, label);
        return wrap;
      }));
      group.hidden = !names.size;
    });
  };

  const resetFilter = () => {
    setFilterOpen(false);
    chips.replaceChildren();
    chips.hidden = true;
    buildOptions();
    filterBtn.hidden = !found.length;
  };

  filterBtn.addEventListener('click', () => setFilterOpen(filterPanel.hidden));
  filterClose.addEventListener('click', () => { setFilterOpen(false); filterBtn.focus(); });
  const trackFilter = () => {
    const filters = [];

    if (chosen('product').length) {
      filters.push(`Products: ${chosen('product').join(',')}`);
    }

    if (chosen('service').length) {
      filters.push(`Services: ${chosen('service').join(',')}`);
    }

    pushAdobeCalculatorEvents({
      event: 'filter_click',
      filter: filters.join(' | '),
    });
  };
  applyBtn.addEventListener('click', () => {
    setFilterOpen(false);
    if (drawChips().length) trackFilter();
    applyFilter();
    filterBtn.focus();
  });
  clearBtn.addEventListener('click', () => {
    [...boxes('product'), ...boxes('service')].forEach((b) => { b.checked = false; });
    applyFilter();
  });
  chips.addEventListener('click', (e) => {
    const chip = e.target.closest('.store-finder-chip');
    if (!chip) return;
    const name = key(chip.textContent);
    [...boxes('product'), ...boxes('service')].forEach((b) => { if (key(b.value) === name) b.checked = false; });
    applyFilter();
    trackFilter();
    chips.querySelector('.store-finder-chip')?.focus();
  });
  filterPanel.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    setFilterOpen(false);
    filterBtn.focus();
  });

  /* ---------- search ---------- */
  let run = 0;
  const search = async (query, {
    scroll = true, analytics = true, at = null, label = '', searchType = '',
  } = {}) => {
    const place = String(query || '').split('(')[0].trim();
    if (!place) return;
    searched = place;
    run += 1;
    const mine = run;
    block.classList.remove('is-idle');
    block.setAttribute('aria-busy', 'true');
    status.textContent = v('loading');
    const word = label || place.split(' ')[0] || v('nearYou');
    heading.replaceChildren(document.createTextNode(`${v('heading')} "`), Object.assign(el('strong'), { textContent: word }), document.createTextNode('"'));
    if (scroll) {
      const y = block.getBoundingClientRect().top + window.scrollY - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-height'), 10) || 0);
      window.scrollTo({ top: y, behavior: reducedMotion() ? 'auto' : 'smooth' });
      heading.focus({ preventScroll: true });
    }

    const maps = ensureMap();
    // the visitor's pick, else Google's geocoder on the text (as the source; needs a key)
    centre = await placeCentre({ query: place, at });
    const result = await findStores({
      endpoint: v('endpoint'),
      snapshotUrl: v('snapshot'),
      query: place,
      centre,
      radius: v('radius'),
      limit: v('limit'),
      types: v('types'),
      sortByDistance: v('sortByDistance'),
    });
    if (mine !== run) return;
    found = result.stores;
    found.forEach((s) => { s.phoneText = phoneText(s); s.directions = directionsUrl(s); });
    resetFilter();
    block.classList.toggle('is-empty', !found.length);
    stores = found;
    leaveFocusView(false);
    listEl.replaceChildren(...stores.map(card));
    shown = Math.min(pageSize, stores.length);
    paint();
    scroller.scrollTop = 0;
    notFound.hidden = stores.length > 0;
    block.removeAttribute('aria-busy');
    status.textContent = stores.length
      ? v('results').replace('{count}', stores.length).replace('{place}', place)
      : v('notFound');
    // store-search clears its spinner and shows the source's "Invalid location" / "No store found"
    let reason = 'found';
    if (!stores.length) reason = centre ? 'none' : 'invalid';
    document.dispatchEvent(new CustomEvent(RESULT_EVENT, {
      cancelable: true, detail: { reason, count: stores.length, query: place },
    }));
    if (analytics) {
      pushAdobeStoreLocatorEvent({
        event: 'store_locator_click',
        location: place,
        resultCount: stores.length,
        subFlow: searchType,

      });
    }
    const api = await maps;
    if (api && mine === run) {
      api.show(stores, centre, pick);
    }
  };

  // a city card on this page hands its city over (cancelable: the card stays a link otherwise)
  document.addEventListener(SEARCH_EVENT, (e) => {
    e.preventDefault();
    search(e.detail?.query, { at: e.detail?.at, analytics: e.detail?.from !== 'city-stores' });
  });
  // the source's ?q=<place>
  const q = new URLSearchParams(window.location.search).get('q');
  if (q) {
    search(q, { scroll: false, analytics: false });
  } else if (navigator.geolocation) {
    // as the source: the browser asks to know the visitor's location and the stores near it show
    // up front. Declined, unavailable or too slow: the page stays as it is. A search made while
    // the browser waits for the answer wins.
    navigator.geolocation.getCurrentPosition((pos) => {
      if (run) return;
      search(v('nearYou'), {
        scroll: false,
        analytics: true,
        label: v('nearYou'),
        searchType: 'Autoload Stores',
        at: { lat: pos.coords.latitude, lng: pos.coords.longitude },
      });
    }, () => {}, { timeout: 10000, maximumAge: 300000 });
  }
}
