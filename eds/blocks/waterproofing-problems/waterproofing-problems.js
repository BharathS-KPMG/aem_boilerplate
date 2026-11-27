/*
 * waterproofing-problems — "Identify Your Waterproofing Problems": Interior /
 * Exterior views of a house with hotspots; each hotspot opens a side drawer
 * with that area's problems, recommended system, products and videos.
 * Source: beta.asianpaints.com waterproofing service page
 * (".waterproofingproblemstabs"). Authoring and behaviour: README.md.
 *
 * The drawer content is a waterproofing-area block per area. Preferred: author each area on
 * THIS page, after the block, as a plain waterproofing-area block whose first row is
 * `Area | <name>` (or inside a section with section metadata `Area | <key>`). The key is the
 * hotspot's Details value, or its name ("Ceiling"). The block lifts these out of the page and
 * shows them in the drawer, so opening an area costs no extra request. A hotspot with no
 * matching area on the page falls back to fetching its Details page, on click only.
 */
import { createOptimizedPicture, getMetadata, loadBlock } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';
import { pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';

const DESKTOP_PICTURE = '(min-width: 768px)'; // the source swaps pictures and hotspot positions here
const POPUP_MEDIA = '(min-width: 768px)'; // hover pop-ups, as on the source
const CLOSE_DELAY = 150; // ms before a pop-up closes once the pointer leaves
const DRAWER_TIME = 350; // ms, the drawer's slide
const DEFAULT_CTA_LABEL = 'Schedule Free Inspection';
const DEFAULT_CTA_MODAL = '/eds/forms/book-free-site-visit'; // the lead form the header CTA opens

const FIELDS = {
  title: 'title',
  subtitle: 'subtitle',
  'tabs label': 'tabsLabel',
  'hint hover': 'hintHover',
  'hint click': 'hintClick',
  'hint tap': 'hintClick',
  'why heading': 'whyHeading',
  'close label': 'closeLabel',
  'cta label': 'ctaLabel',
  'cta link': 'ctaLink',
};

// repeating rows: a header row (these names, any order) then one row per item
const TABLES = {
  view: ['view', 'label', 'desktop image', 'mobile image', 'icon'],
  area: ['area', 'view', 'description', 'link text', 'desktop x', 'desktop y', 'mobile x', 'mobile y', 'details'],
  why: ['why', 'icon'],
};

const ALT = {
  interior: 'Interior view of a house showing waterproofing problem areas',
  exterior: 'Exterior view of a house showing waterproofing problem areas',
};

let uid = 0;
const nextId = (p) => { uid += 1; return `${p}-${uid}`; };
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const text = (cell) => (cell ? cell.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim() : '');
const num = (cell) => {
  const n = parseFloat(text(cell));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
};
const href = (cell) => cell?.querySelector('a')?.getAttribute('href') || text(cell);
// "#ceiling", "ceiling", "Ceiling", "/d-testing/waterproofing/ceiling" and ".../ceiling.html"
// all give "ceiling"
const areaKey = (value) => {
  const raw = String(value || '').trim();
  const part = raw.startsWith('#') ? raw.slice(1) : raw.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop();
  return norm(part.replace(/\.(plain\.)?html$/, ''));
};

/** lift the page's area content out of the page: key -> the nodes to show in the drawer */
function takeInlineAreas(block) {
  const map = new Map();
  const root = block.closest('main') || document;
  const add = (key, nodes) => map.set(key, [...(map.get(key) || []), ...nodes]);
  // 1. sections with section metadata `Area | <key>`
  root.querySelectorAll('.section[data-area]').forEach((section) => {
    const key = areaKey(section.dataset.area);
    if (!key || section.contains(block)) return;
    add(key, [...section.children]);
    section.remove();
  });
  // 2. waterproofing-area blocks whose first row is `Area | <name>`
  root.querySelectorAll('.waterproofing-area').forEach((areaBlock) => {
    if (block.contains(areaBlock) || areaBlock.contains(block)) return;
    const cells = [...(areaBlock.firstElementChild?.children || [])];
    if (norm(text(cells[0])) !== 'area' || !cells[1]) return;
    const key = areaKey(text(cells[1]));
    if (!key) return;
    const holder = areaBlock.parentElement?.classList.contains('waterproofing-area-wrapper')
      ? areaBlock.parentElement : areaBlock;
    const section = holder.closest('.section');
    add(key, [holder]);
    holder.remove();
    if (section && !section.querySelector('.block, .default-content-wrapper > *')) section.remove();
  });
  return map;
}

function el(tag, className, attrs = {}) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v);
  });
  return e;
}

const SVG = {
  close: '<svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true" focusable="false"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

/** label | value rows, then header-led tables */
function readModel(block) {
  const fields = {};
  const tables = { view: [], area: [], why: [] };
  let current = null;
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const names = cells.map((c) => norm(text(c)));
    const key = names[0];
    if (TABLES[key] && !row.querySelector('img, a')
      && names.every((n) => !n || TABLES[key].includes(n))) {
      current = { key, cols: names };
      return;
    }
    if (current) {
      const item = { row };
      current.cols.forEach((name, i) => { if (name) item[name] = cells[i] || null; });
      tables[current.key].push(item);
      return;
    }
    if (FIELDS[key]) fields[FIELDS[key]] = { row, cell: cells[1] || null };
  });
  return { fields, tables };
}

/** mobile picture, desktop from 768px; width/height (or source sizes) prevent layout shift */
function viewPicture(mobileImg, desktopImg, alt, eager) {
  const base = mobileImg || desktopImg;
  const pic = createOptimizedPicture(base.src, alt, eager, [{ width: '750' }]);
  const img = pic.querySelector('img');
  img.className = 'wp-img';
  img.setAttribute('draggable', 'false');
  img.width = parseInt(base.getAttribute('width'), 10) || (mobileImg ? 648 : 972);
  img.height = parseInt(base.getAttribute('height'), 10) || (mobileImg ? 740 : 592);
  if (eager) img.setAttribute('fetchpriority', 'high');
  if (mobileImg && desktopImg && mobileImg !== desktopImg) {
    const desk = createOptimizedPicture(desktopImg.src, alt, eager, [{ width: '2000' }]);
    [...desk.querySelectorAll('source')].reverse().forEach((source) => {
      source.setAttribute('media', DESKTOP_PICTURE);
      source.setAttribute('width', desktopImg.getAttribute('width') || 972);
      source.setAttribute('height', desktopImg.getAttribute('height') || 592);
      pic.prepend(source);
    });
  }
  return pic;
}

/** the source's pop-up placement: edge-aligned near the sides, above near the bottom */
function place(spot, desktop) {
  const x = Number(spot.dataset[desktop ? 'dx' : 'mx']);
  const y = Number(spot.dataset[desktop ? 'dy' : 'my']);
  spot.dataset.halign = (x < 22 && 'left') || (x > 78 && 'right') || 'center';
  spot.dataset.above = y > 68 ? 'true' : 'false';
}

const getActiveTabName = (block) => block.querySelector('.wp-tab[aria-selected="true"]')?.textContent.trim() || '';
const getTabFilter = (block, areaName) => `${getActiveTabName(block)} | ${areaName}`;

export default async function decorate(block) {
  const inline = takeInlineAreas(block);
  const { fields, tables } = readModel(block);
  // Universal Editor: carry instrumentation over (a no-op with DA authoring)
  const { moveInstrumentation = () => {} } = await import('../../scripts/scripts.js');
  const v = (k) => text(fields[k]?.cell);
  const codeBase = window.hlx?.codeBasePath || '';
  const sectionTitle = v('title');

  const views = tables.view
    .map((r) => {
      const key = norm(text(r.view)) || norm(text(r.label));
      const mobile = r['mobile image']?.querySelector('img') || null;
      const desktop = r['desktop image']?.querySelector('img') || null;
      return {
        row: r.row,
        key,
        label: text(r.label) || text(r.view),
        mobile,
        desktop,
        icon: r.icon?.querySelector('img')?.getAttribute('src')
          || (ALT[key] ? `${codeBase}/blocks/waterproofing-problems/icons/${key}.svg` : ''),
        alt: (desktop?.getAttribute('alt') || mobile?.getAttribute('alt') || '').trim() || ALT[key] || '',
      };
    })
    .filter((view) => view.key && (view.mobile || view.desktop));
  if (!views.length) return;

  const areas = tables.area.map((r) => ({
    row: r.row,
    name: text(r.area),
    view: norm(text(r.view)),
    description: text(r.description),
    linkText: text(r['link text']) || 'View details',
    dx: num(r['desktop x']),
    dy: num(r['desktop y']),
    mx: num(r['mobile x']),
    my: num(r['mobile y']),
    // Details is optional: with inline area sections the hotspot name is the key
    // ("Ceiling" -> `ceiling`)
    details: href(r.details) || text(r.area),
  })).filter((a) => a.name && a.details);

  const why = tables.why.map((r) => ({
    row: r.row, label: text(r.why), icon: r.icon?.querySelector('img') || null,
  })).filter((w) => w.label);

  /* ---------- heading, sub ---------- */
  const wrap = el('div', 'wp-wrap');
  if (sectionTitle) {
    const h2 = el('h2', 'wp-title');
    h2.textContent = sectionTitle;
    moveInstrumentation(fields.title.row, h2);
    wrap.append(h2);
  }
  if (v('subtitle')) {
    const p = el('p', 'wp-sub');
    p.textContent = v('subtitle');
    moveInstrumentation(fields.subtitle.row, p);
    wrap.append(p);
  }

  /* ---------- view tabs + one panel (picture + hotspots) per view ---------- */
  const tabs = el('div', 'wp-tabs', { role: 'tablist', 'aria-label': v('tabsLabel') || 'View type' });
  const frame = el('div', 'wp-frame');
  const eager = !block.closest('.section')?.previousElementSibling;
  const spots = [];
  views.forEach((view, i) => {
    const tabId = nextId('wp-tab');
    const panelId = nextId('wp-panel');
    const tab = el('button', 'wp-tab', {
      type: 'button', role: 'tab', id: tabId, 'aria-controls': panelId, 'aria-selected': i === 0 ? 'true' : 'false', tabindex: i === 0 ? '0' : '-1', 'data-view': view.key,
    });
    if (view.icon) {
      tab.append(el('img', 'wp-tab-icon', {
        src: view.icon, alt: '', width: 15, height: 15,
      }));
    }
    const label = el('span');
    label.textContent = view.label;
    tab.append(label);
    moveInstrumentation(view.row, tab);
    tabs.append(tab);

    const canvas = el('div', 'wp-canvas', {
      role: 'tabpanel', id: panelId, 'aria-labelledby': tabId, 'data-view': view.key,
    });
    if (i) canvas.hidden = true;
    canvas.append(viewPicture(view.mobile, view.desktop, view.alt, eager && i === 0));
    const layer = el('div', 'wp-spots');
    areas.filter((a) => (a.view || views[0].key) === view.key).forEach((area) => {
      const spot = el('div', 'wp-spot', {
        'data-dx': area.dx ?? 50, 'data-dy': area.dy ?? 50, 'data-mx': area.mx ?? area.dx ?? 50, 'data-my': area.my ?? area.dy ?? 50,
      });
      spot.style.setProperty('--wp-dx', `${area.dx ?? 50}%`);
      spot.style.setProperty('--wp-dy', `${area.dy ?? 50}%`);
      spot.style.setProperty('--wp-mx', `${area.mx ?? area.dx ?? 50}%`);
      spot.style.setProperty('--wp-my', `${area.my ?? area.dy ?? 50}%`);
      const descId = nextId('wp-desc');
      const dot = el('button', 'wp-dot', {
        type: 'button', 'aria-label': area.name, 'aria-haspopup': 'dialog', 'aria-describedby': area.description ? descId : null,
      });
      dot.innerHTML = '<span class="wp-dot-ring" aria-hidden="true"></span><span class="wp-dot-core" aria-hidden="true"></span>';
      // the visual card: the dot carries its name and description for assistive tech
      const popup = el('div', 'wp-popup', { 'aria-hidden': 'true' });
      const pt = el('strong', 'wp-popup-title');
      pt.textContent = area.name;
      popup.append(pt);
      if (area.description) {
        const pd = el('p', 'wp-popup-desc', { id: descId });
        pd.textContent = area.description;
        popup.append(pd);
      }
      const pl = el('span', 'wp-popup-link');
      pl.textContent = area.linkText;
      popup.append(pl);
      spot.append(dot, popup);
      moveInstrumentation(area.row, spot);
      layer.append(spot);
      spots.push({
        spot, dot, popup, link: pl, area, view,
      });
    });
    canvas.append(layer);
    frame.append(canvas);
  });
  wrap.append(tabs, frame);

  /* ---------- hint ---------- */
  if (v('hintHover') || v('hintClick')) {
    const hint = el('p', 'wp-hint');
    if (v('hintHover')) {
      const h = el('span', 'wp-hint-text wp-hint-hover');
      h.textContent = v('hintHover');
      hint.append(el('span', 'wp-hint-dot', { 'aria-hidden': 'true' }), h);
      if (v('hintClick')) hint.append(el('span', 'wp-hint-pipe', { 'aria-hidden': 'true' }));
    }
    if (v('hintClick')) {
      // the source's second dot: shown before the tap hint on mobile, an empty gap on desktop
      hint.append(el('span', 'wp-hint-dot-mobile', { 'aria-hidden': 'true' }));
      const c = el('span', 'wp-hint-text wp-hint-click');
      c.textContent = v('hintClick');
      hint.append(c);
    }
    wrap.append(hint);
  }

  /* ---------- drawer (one, filled per area) ---------- */
  const titleId = nextId('wp-drawer-title');
  const drawer = el('dialog', 'wp-drawer', { 'aria-labelledby': titleId });
  const overlay = el('div', 'wp-drawer-overlay', { 'aria-hidden': 'true' });
  const sheet = el('div', 'wp-drawer-sheet');
  const header = el('div', 'wp-drawer-header');
  const dTitle = el('h2', 'wp-drawer-title', { id: titleId, tabindex: '-1' });
  const close = el('button', 'wp-drawer-close', { type: 'button', 'aria-label': v('closeLabel') || 'Close' });
  close.innerHTML = SVG.close;
  header.append(dTitle, close);
  const body = el('div', 'wp-drawer-body');
  const areaSlot = el('div', 'wp-drawer-area');
  body.append(areaSlot);
  if (why.length) {
    const sec = el('div', 'wp-why');
    const inner = el('div', 'wp-why-inner');
    if (v('whyHeading')) {
      const h = el('h3', 'wp-why-heading');
      h.textContent = v('whyHeading');
      moveInstrumentation(fields.whyHeading.row, h);
      inner.append(h);
    }
    const list = el('ul', 'wp-why-list');
    why.forEach((w) => {
      const li = el('li', 'wp-why-item');
      if (w.icon) {
        const pic = createOptimizedPicture(w.icon.src, '', false, [{ width: '96' }]);
        const img = pic.querySelector('img');
        img.width = 44;
        img.height = 44;
        li.append(pic);
      }
      const label = el('span', 'wp-why-label');
      label.textContent = w.label;
      li.append(label);
      moveInstrumentation(w.row, li);
      list.append(li);
    });
    inner.append(list);
    sec.append(inner);
    body.append(sec);
  }
  sheet.append(header, body);
  // "Schedule Free Inspection": closes the drawer and opens the site's lead-form pop-up (the
  // header CTA's); the authored CTA Link is only the fallback if that cannot load. The label is
  // authorable ("CTA Label").
  const ctaHref = href(fields.ctaLink?.cell);
  const bar = el('div', 'wp-drawer-cta');
  const cta = el('a', 'wp-drawer-cta-link', { href: ctaHref || '#', 'aria-haspopup': 'dialog' });
  const ctaText = el('span');
  ctaText.textContent = v('ctaLabel') || DEFAULT_CTA_LABEL;
  cta.append(ctaText, el('img', '', {
    src: `${codeBase}/blocks/waterproofing-problems/icons/calendar.svg`, alt: '', width: 18, height: 20,
  }));
  cta.addEventListener('click', async (e) => {
    e.preventDefault();
    pushAdobeCtaClickEvent({
      event: 'custom_cta_click',
      filter: getTabFilter(block, dTitle.textContent.trim()),
      cta: cta.textContent.trim(),
      parentTitle: block.querySelector('.wp-title')?.textContent.trim() || '',
    });
    // eslint-disable-next-line no-use-before-define -- set below, before the drawer can open
    closeDrawer(); // the drawer slides away as the pop-up opens
    const modalPath = document.querySelector('.trigger-book-free-site-visit-modal[data-modal-path]')?.dataset.modalPath
      || getMetadata('site-visit-modal') || DEFAULT_CTA_MODAL;
    try {
      const { openModal } = await import('../modal/modal.js');
      await openModal(modalPath);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('waterproofing-problems: consultation pop-up failed to load', error);
      if (ctaHref) window.location.href = ctaHref;
    }
  });
  bar.append(cta);
  sheet.append(bar);
  drawer.append(overlay, sheet);
  wrap.append(drawer);

  block.replaceChildren(wrap);

  /* ---------- behaviour ---------- */
  // the sliding white pill under the active tab
  const tabButtons = [...tabs.querySelectorAll('.wp-tab')];
  const pill = () => {
    const t = tabButtons.find((b) => b.getAttribute('aria-selected') === 'true');
    if (!t) return;
    tabs.style.setProperty('--wp-active-left', `${t.offsetLeft}px`);
    tabs.style.setProperty('--wp-active-width', `${t.offsetWidth}px`);
  };
  pill();
  if (window.ResizeObserver) new ResizeObserver(pill).observe(tabs);
  document.fonts?.ready.then(pill);

  const popups = window.matchMedia(POPUP_MEDIA);
  const desktopPlacement = window.matchMedia(DESKTOP_PICTURE);
  const placeAll = () => spots.forEach((s) => place(s.spot, desktopPlacement.matches));
  placeAll();
  desktopPlacement.addEventListener('change', placeAll);

  let closeTimer;
  const hidePopups = () => spots.forEach((s) => s.popup.classList.remove('is-open'));
  const showPopup = (s) => {
    clearTimeout(closeTimer);
    hidePopups();
    s.popup.classList.add('is-open');
  };
  const later = () => {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(hidePopups, CLOSE_DELAY);
  };

  const select = (tab, focus) => {
    const key = tab.dataset.view;
    tabButtons.forEach((b) => {
      const on = b === tab;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    frame.querySelectorAll('.wp-canvas').forEach((c) => { c.hidden = c.dataset.view !== key; });
    if (focus) tab.focus();
    pill();
    hidePopups();
  };
  tabButtons.forEach((tab, i) => {
    tab.addEventListener('click', () => {
      pushAdobeCtaClickEvent({
        event: 'cta_link_text',
        cta: tab.textContent,
        parentTitle: block.querySelector('.wp-title')?.textContent.trim() || '',
      });
      select(tab, false);
    });
    tab.addEventListener('keydown', (e) => {
      const last = tabButtons.length - 1;
      const to = {
        ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last,
      }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      select(tabButtons[to], true);
    });
  });

  /* drawer content: a fragment per area, fetched once */
  const cache = new Map();
  // the local preview serves the content folder under /content/: try there too
  const fetchArea = (path) => loadFragment(path).then((main) => main
    || (window.location.pathname.startsWith('/content/') ? loadFragment(`/content${path}`) : null));
  const resolved = new Map(); // path -> nodes, for the areas already fetched
  const pathOf = (link) => {
    try { return new URL(link, window.location.href).pathname; } catch (e) { return link; }
  };
  // The area's pictures are lazy: left alone they only load once the drawer shows them, and pop
  // in during the slide. Fetch and decode the ones it opens on (not those in a hidden problem
  // tab) up front, so the drawer arrives complete.
  const warmImages = (nodes) => nodes.forEach((n) => n.querySelectorAll('img[loading="lazy"]').forEach((img) => {
    if (img.closest('[hidden]')) return;
    img.loading = 'eager';
    img.decoding = 'async';
    if (img.decode) img.decode().catch(() => {});
  }));
  const isInline = (area) => inline.has(areaKey(area.details));
  // an inline area is decorated (JS only, its pictures stay lazy) when first needed;
  // a fetched one is requested
  const prepare = (nodes) => Promise.all(nodes
    .flatMap((n) => (n.matches('.block') ? [n] : [...n.querySelectorAll('.block')]))
    .map((b) => loadBlock(b)));
  const load = (area) => {
    const key = area.details;
    if (!cache.has(key)) {
      const local = inline.get(areaKey(key));
      const task = local
        ? prepare(local).then(() => local)
        : fetchArea(pathOf(key)).then((main) => {
          const nodes = main ? [...main.querySelectorAll(':scope > .section > div')] : [];
          warmImages(nodes);
          return nodes;
        });
      cache.set(key, task.then((nodes) => {
        if (nodes.length) resolved.set(key, nodes);
        else cache.delete(key);
        return nodes;
      }).catch(() => { cache.delete(key); return []; }));
    }
    return cache.get(key);
  };

  // The page does not scroll while the drawer is open. Its scrollbar gutter is kept, so the page
  // and its fixed header keep their width: nothing behind the drawer moves or repaints.
  // (Without scrollbar-gutter support, padding keeps the page's width.)
  const root = document.documentElement;
  const keepGutter = window.CSS?.supports?.('scrollbar-gutter', 'stable');
  const lockPage = () => {
    if (keepGutter) root.style.scrollbarGutter = 'stable';
    else {
      const gutter = window.innerWidth - root.clientWidth;
      if (gutter > 0) root.style.paddingRight = `${gutter}px`;
    }
    root.style.overflow = 'hidden';
  };
  const unlockPage = () => {
    root.style.overflow = '';
    root.style.scrollbarGutter = '';
    root.style.paddingRight = '';
  };

  let trigger = null;
  let closing;
  const closeDrawer = () => {
    if (!drawer.open || drawer.classList.contains('is-closing')) return;
    drawer.classList.add('is-closing');
    drawer.classList.remove('is-visible');
    const done = () => {
      drawer.classList.remove('is-closing');
      drawer.close();
      unlockPage(); // once the sheet is gone, so nothing changes under the slide
      body.scrollTop = 0;
      if (trigger?.isConnected) trigger.focus();
    };
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    clearTimeout(closing);
    closing = setTimeout(done, reduce ? 0 : DRAWER_TIME);
  };

  const openDrawer = async (s, from) => {
    hidePopups();
    trigger = from;
    clearTimeout(closing);
    drawer.classList.remove('is-closing');
    dTitle.textContent = s.area.name;
    // an area fetched already is in place before the slide starts, so the drawer arrives full;
    // otherwise a placeholder holds the space and the content fades in when it lands
    const fill = (nodes, animate) => {
      areaSlot.classList.remove('is-loading');
      areaSlot.replaceChildren(...nodes);
      body.removeAttribute('aria-busy');
      body.scrollTop = 0;
      // the area opens on its first problem, as on the source
      areaSlot.querySelectorAll('.waterproofing-area').forEach((a) => a.dispatchEvent(new CustomEvent('waterproofing-area:reset')));
      if (animate) {
        areaSlot.classList.remove('is-entering');
        areaSlot.getBoundingClientRect();
        areaSlot.classList.add('is-entering');
      }
    };
    const ready = resolved.get(s.area.details);
    if (ready) {
      areaSlot.classList.remove('is-entering');
      fill(ready, false);
    } else {
      areaSlot.classList.remove('is-entering');
      areaSlot.classList.add('is-loading');
      areaSlot.replaceChildren(el('div', 'wp-drawer-skeleton', { 'aria-hidden': 'true' }));
      body.setAttribute('aria-busy', 'true');
    }
    if (!drawer.open) drawer.showModal();
    // start on the title (read first), not on the close button
    dTitle.focus({ preventScroll: true });
    lockPage();
    // the sheet is laid out off screen first, then slides in on the next frame
    sheet.getBoundingClientRect();
    requestAnimationFrame(() => drawer.classList.add('is-visible'));
    if (ready) return;
    const nodes = await load(s.area);
    if (dTitle.textContent !== s.area.name || !drawer.open) return;
    fill(nodes, true);
  };

  spots.forEach((s) => {
    // pointing at a hotspot readies its inline area, pictures included, so the drawer slides
    // in complete; a separate page is fetched on click, never ahead of it
    const prefetch = () => { if (isInline(s.area)) load(s.area).then(warmImages); };
    s.spot.addEventListener('pointerenter', (e) => {
      prefetch();
      if (e.pointerType !== 'touch' && popups.matches) showPopup(s);
    });
    s.spot.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch' && popups.matches) later(); });
    s.dot.addEventListener('focus', () => {
      prefetch();
      if (popups.matches && s.dot.matches(':focus-visible')) showPopup(s);
    });
    // while the pointer is over the hotspot or its pop-up the pop-up stays: pressing
    // "View details" moves focus off the dot, and closing it then would swallow the click
    s.dot.addEventListener('blur', () => { if (!s.spot.matches(':hover')) s.popup.classList.remove('is-open'); });
    s.dot.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && s.popup.classList.contains('is-open')) {
        e.preventDefault();
        hidePopups();
      }
    });
    s.dot.addEventListener('click', (e) => {
      pushAdobeCtaClickEvent({
        event: 'hotspot_click',
        cta: s.area.name,
        parentTitle: block.querySelector('.wp-title')?.textContent.trim() || '',
        filter: getTabFilter(block, s.area.name),
      });
      e.stopPropagation();
      openDrawer(s, s.dot);
    });
    s.popup.addEventListener('click', (e) => e.stopPropagation());
    s.link.addEventListener('click', () => openDrawer(s, s.dot));
  });
  document.addEventListener('click', hidePopups);

  // inline areas are decorated once the page is idle (no network), so the first click
  // opens a full drawer
  const warm = () => spots.filter((s) => isInline(s.area)).forEach((s) => load(s.area));
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(warm, { timeout: 4000 });
  else setTimeout(warm, 2000);

  overlay.addEventListener('click', () => closeDrawer());
  close.addEventListener('click', () => {
    pushAdobeCtaClickEvent({
      event: 'custom_cta_click',
      filter: getTabFilter(block, dTitle.textContent.trim()),
      cta: close.textContent.trim() || 'Close',
      parentTitle: block.querySelector('.wp-title')?.textContent.trim() || '',
    });
    closeDrawer();
  });
  drawer.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeDrawer();
  });
  // a click outside the sheet (the backdrop area) closes the drawer, as the overlay does
  drawer.addEventListener('click', (e) => { if (e.target === drawer) closeDrawer(); });
}
