import { createOptimizedPicture } from '../../scripts/aem.js';
import { pushAdobeCalculatorEvents, pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';

/**
 * popular-shades-nilaya — tabbed shade explorer: pick a finish (tab), then a shade
 * swatch, and a room painted in that shade is shown (source: Asian Paints
 * Nilaya Arc "popularshades").
 *
 * Authoring (DA table; full example in README.md): label | value rows, then
 * the shades as a header row + one row per shade:
 *   Title | CTA label | CTA link | Open in new tab           <- label | value
 *   Tab | Swatch | Room image (mobile) | Room image (desktop) | Shade name
 *                                                           <- shades
 * Shades are grouped into tabs by their "Tab" cell (tabs in first-seen order).
 * The desktop room image is used from 576px (as on the source; the desktop
 * layout starts at 992px); leave it empty to use the mobile one at all sizes.
 * The earlier keyword rows (heading | cta | tab | shade, described in
 * popular-shades-nilaya.css) are still read.
 */

const ROOM_DESKTOP_MQ = '(min-width: 576px)';
const FADE_MS = 150;

const ARROW = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="17" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="M10.2563 4.13128C10.598 3.78957 11.152 3.78957 11.4937 4.13128L16.7437 9.38128C17.0854 9.72299 17.0854 10.277 16.7437 10.6187L11.4937 15.8687C11.152 16.2104 10.598 16.2104 10.2563 15.8687C9.91457 15.527 9.91457 14.973 10.2563 14.6313L14.0126 10.875L3.875 10.875C3.39175 10.875 3 10.4832 3 10C3 9.51675 3.39175 9.125 3.875 9.125H14.0126L10.2563 5.36872C9.91457 5.02701 9.91457 4.47299 10.2563 4.13128Z"/></svg>';

let uid = 0;

const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
}

/** Copy the authored intrinsic size so the browser reserves space (no CLS). */
function copySize(from, to) {
  const w = from.getAttribute('width');
  const h = from.getAttribute('height');
  if (w && h) {
    to.setAttribute('width', w);
    to.setAttribute('height', h);
  }
}

/** Responsive picture from one or two images (mobile first, desktop second). */
function roomPicture(imgs, alt) {
  const [mobile, desktop] = imgs;
  if (!desktop) {
    const pic = createOptimizedPicture(mobile.src, alt, false, [{ media: ROOM_DESKTOP_MQ, width: '1400' }, { width: '750' }]);
    copySize(mobile, pic.querySelector('img'));
    return pic;
  }
  const pic = createOptimizedPicture(mobile.src, alt, false, [{ width: '750' }]);
  copySize(mobile, pic.querySelector('img'));
  // only its <source>s are used; lazy so its detached <img> never downloads
  const desk = createOptimizedPicture(desktop.src, alt, false, [{ width: '1400' }]);
  [...desk.querySelectorAll('source')].reverse().forEach((source) => {
    source.setAttribute('media', ROOM_DESKTOP_MQ);
    copySize(desktop, source);
    pic.prepend(source);
  });
  return pic;
}

// label | value rows (lower-cased label -> field)
const FIELDS = {
  title: 'title',
  'cta label': 'ctaLabel',
  'cta link': 'ctaLink',
  'open in new tab': 'newTab',
};
// shade columns, by header text (lower-cased)
const COLUMNS = {
  tab: 'tab',
  swatch: 'swatch',
  'room image (mobile)': 'roomMobile',
  'room image (desktop)': 'roomDesktop',
  'shade name': 'name',
};

/** Label | value fields + a header row and one row per shade. */
function readLabelValue(block) {
  const config = { heading: null, cta: null, tabs: [] };
  const fields = {};
  let columns = null;
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const first = text(cells[0]).toLowerCase();
    if (!columns && first === 'tab' && COLUMNS[text(cells[1]).toLowerCase()]) {
      columns = cells.map((c) => COLUMNS[text(c).toLowerCase()] || '');
      return;
    }
    if (!columns) {
      if (FIELDS[first]) fields[FIELDS[first]] = cells[1] || null;
      return;
    }
    const cell = {};
    columns.forEach((k, i) => { if (k) cell[k] = cells[i] || null; });
    const swatch = cell.swatch?.querySelector('img');
    const rooms = [cell.roomMobile, cell.roomDesktop].map((c) => c?.querySelector('img')).filter(Boolean);
    const name = text(cell.name) || swatch?.alt || '';
    const tabName = text(cell.tab);
    let tab = config.tabs.find((t) => t.name === tabName);
    if (!tab) {
      tab = { name: tabName, shades: [] };
      config.tabs.push(tab);
    }
    if (swatch && rooms.length) tab.shades.push({ swatch, rooms, name });
  });
  config.heading = text(fields.title) || null;
  // the CTA as a link element, as the keyword model authors it
  const href = fields.ctaLink?.querySelector('a[href]')?.getAttribute('href') || text(fields.ctaLink);
  if (href) {
    const a = document.createElement('a');
    a.setAttribute('href', href);
    a.textContent = text(fields.ctaLabel) || text(fields.ctaLink?.querySelector('a')) || '';
    if (/^(true|yes|1)$/i.test(text(fields.newTab))) a.target = '_blank';
    config.cta = a;
  }
  config.tabs = config.tabs.filter((t) => t.shades.length);
  return config;
}

function readRows(block) {
  // label | value model: the shades' header row is "Tab | Swatch | …"
  const isLabelValue = [...block.children].some((row) => text(row.children[0]).toLowerCase() === 'tab'
    && COLUMNS[text(row.children[1]).toLowerCase()]);
  if (isLabelValue) return readLabelValue(block);

  // earlier keyword rows: heading | cta | tab | shade
  const config = { heading: null, cta: null, tabs: [] };
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const kind = text(cells[0]).toLowerCase();
    if (kind === 'heading') {
      config.heading = text(cells[1]);
    } else if (kind === 'cta') {
      config.cta = cells[1]?.querySelector('a[href]') || null;
    } else if (kind === 'tab') {
      const name = text(cells[1]);
      if (name) config.tabs.push({ name, shades: [] });
    } else if (kind === 'shade') {
      const swatch = cells[1]?.querySelector('img');
      const rooms = [...(cells[2]?.querySelectorAll('img') || [])];
      const name = text(cells[3]) || swatch?.alt || '';
      if (!config.tabs.length) config.tabs.push({ name: '', shades: [] });
      const tab = config.tabs[config.tabs.length - 1];
      if (swatch && rooms.length) tab.shades.push({ swatch, rooms, name });
    }
  });
  config.tabs = config.tabs.filter((t) => t.shades.length);
  return config;
}

export default function decorate(block) {
  const config = readRows(block);
  if (!config.tabs.length) return;
  uid += 1;
  const id = `popular-shades-nilaya-${uid}`;
  const children = [];

  let title = null;
  if (config.heading) {
    title = el('h2', 'popular-shades-nilaya-title', { id: `${id}-title` });
    title.textContent = config.heading;
    children.push(title);
  }

  const tablist = el('div', 'popular-shades-nilaya-tabs', { role: 'tablist' });
  if (title) tablist.setAttribute('aria-labelledby', title.id);
  else tablist.setAttribute('aria-label', 'Finishes');
  children.push(tablist);

  const panelsWrap = el('div', 'popular-shades-nilaya-panels');
  children.push(panelsWrap);

  const tabs = [];
  const panels = config.tabs.map((t, ti) => {
    const tab = el('button', 'popular-shades-nilaya-tab', {
      type: 'button', role: 'tab', id: `${id}-tab-${ti}`, 'aria-controls': `${id}-panel-${ti}`,
    });
    tab.textContent = t.name || `Collection ${ti + 1}`;
    tablist.append(tab);
    tabs.push(tab);

    const panel = el('div', 'popular-shades-nilaya-panel', {
      role: 'tabpanel', id: `${id}-panel-${ti}`, 'aria-labelledby': tab.id,
    });
    const swatches = el('div', 'popular-shades-nilaya-swatches', { role: 'group', 'aria-label': `${tab.textContent} shades` });
    const view = el('div', 'popular-shades-nilaya-view');
    const ring = el('span', 'popular-shades-nilaya-ring', { 'aria-hidden': 'true' });

    const items = t.shades.map((s, si) => {
      const btn = el('button', 'popular-shades-nilaya-swatch', { type: 'button', 'aria-pressed': 'false' });
      btn.setAttribute('aria-label', s.name);
      const sw = createOptimizedPicture(s.swatch.src, '', false, [{ width: '160' }]);
      copySize(s.swatch, sw.querySelector('img'));
      btn.append(sw);
      swatches.append(btn);
      const room = roomPicture(s.rooms, s.name ? `Room painted in ${s.name}` : '');
      room.classList.add('popular-shades-nilaya-room');
      room.hidden = si !== 0;
      view.append(room);
      return { btn, room };
    });
    swatches.append(ring);
    panel.append(view, swatches);
    panelsWrap.append(panel);
    return {
      panel, swatches, ring, items, current: 0,
    };
  });

  if (config.cta) {
    const cta = el('a', 'popular-shades-nilaya-cta', { href: config.cta.getAttribute('href') });
    cta.append(text(config.cta) || 'Download');
    cta.addEventListener('click', () => {
      pushAdobeCtaClickEvent({
        event: 'download_multiple_pdf',
        pdfName: cta.getAttribute('href').split('/').pop().replace('.pdf', ''),
        title: config.heading || '',
      });
    });
    const pdf = /\.pdf($|[?#])/i.test(cta.getAttribute('href'));
    if (pdf || config.cta.target === '_blank') {
      cta.target = '_blank';
      cta.rel = 'noopener';
      const note = el('span', 'popular-shades-nilaya-visually-hidden');
      note.textContent = pdf ? ' (PDF, opens in a new tab)' : ' (opens in a new tab)';
      cta.append(note);
    }
    cta.insertAdjacentHTML('beforeend', ARROW);
    children.push(cta);
  }

  block.replaceChildren(...children);

  /* --- behaviour --- */
  const placeRing = (p) => {
    const btn = p.items[p.current]?.btn;
    if (!btn || p.panel.hidden) return;
    const box = p.swatches.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    // getBoundingClientRect() is in zoomed pixels when the page uses CSS zoom
    // (the main site zooms the body between 992 and 1439px); top/left are not
    const zoom = p.swatches.currentCSSZoom
      || Math.round((box.width / p.swatches.offsetWidth) * 100) / 100 || 1;
    const top = (b.top - box.top + b.height / 2) / zoom + p.swatches.scrollTop - 13;
    const left = (b.left - box.left + b.width / 2) / zoom + p.swatches.scrollLeft - 13;
    p.ring.style.setProperty('--popular-shades-nilaya-ring-top', `${top}px`);
    p.ring.style.setProperty('--popular-shades-nilaya-ring-left', `${left}px`);
  };

  const selectShade = async (p, index, animate = true) => {
    const prev = p.items[p.current];
    const next = p.items[index];
    p.items.forEach((it, i) => it.btn.setAttribute('aria-pressed', String(i === index)));
    p.current = index;
    placeRing(p);
    if (prev === next) {
      next.room.hidden = false;
      return;
    }
    if (animate && !reducedMotion()) {
      await prev.room.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS }).finished;
      prev.room.hidden = true;
      next.room.hidden = false;
      next.room.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS });
    } else {
      prev.room.hidden = true;
      next.room.hidden = false;
    }
  };

  const selectTab = (index, focus = false) => {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[i].panel.hidden = !on;
    });
    if (focus) tabs[index].focus();
    // as on the source, a tab opens on its first shade
    selectShade(panels[index], 0, false);
  };

  tabs.forEach((tab, i) => tab.addEventListener('click', () => {
    const selectedTab = tab.textContent.trim();

    const selectedShade = panels[i]
      .items[0]
      ?.btn
      ?.getAttribute('aria-label') || '';

    const filterValue = `${selectedTab} | ${selectedShade}`;

    pushAdobeCalculatorEvents({
      filter: filterValue,
      event: 'waterproofing_categories_filter',
    });

    selectTab(i);
  }));
  tablist.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const last = tabs.length - 1;
    const map = {
      ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last,
    };
    if (e.key in map) {
      e.preventDefault();
      selectTab(map[e.key], true);
    }
  });
  panels.forEach((p, panelIndex) => {
    p.items.forEach((it, i) => it.btn.addEventListener('click', () => {
      const selectedTab = tabs[panelIndex]?.textContent?.trim() || '';
      const selectedShade = it.btn.getAttribute('aria-label') || '';
      const filterValue = `${selectedTab} | ${selectedShade}`;

      pushAdobeCalculatorEvents({
        filter: filterValue,
        event: 'waterproofing_categories_filter',
      });

      selectShade(p, i);
    }));
  });

  // the ring position depends on layout (desktop column / mobile row)
  const reposition = () => panels.forEach(placeRing);
  window.addEventListener('resize', reposition);
  block.addEventListener('load', reposition, true);

  selectTab(0);
}
