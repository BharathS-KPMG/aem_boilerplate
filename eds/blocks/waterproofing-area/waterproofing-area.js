/*
 * waterproofing-area — one problem area (e.g. Ceiling) of the waterproofing
 * hotspots: problem tabs, each with a picture, description, causes, impact,
 * the recommended system (steps + products) and video tutorials.
 * Authored on its own fragment page and shown in the waterproofing-problems
 * drawer. Source: beta.asianpaints.com waterproofing service page
 * (".hs-side-panel"). Authoring and behaviour: README.md.
 */
import { createOptimizedPicture } from '../../scripts/aem.js';
import { pushAdobeCtaClickEvent, pushAdobeProductTitleClick } from '../../scripts/analytics_1.js';

const FIELDS = {
  'problems heading': 'problemsHeading',
  'tabs label': 'tabsLabel',
  'video close label': 'videoCloseLabel',
};

// header rows: the first cell is "Problem"; the other names pick the table
const COLUMNS = ['problem', 'image', 'description', 'causes', 'impact', 'steps heading', 'videos heading',
  'step', 'product', 'badge', 'badge style', 'link', 'separator', 'video', 'title', 'thumbnail'];

const SVG = {
  causes: '<svg class="wpa-info-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>',
  impact: '<svg class="wpa-info-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m10.29 3.86-8.2 14.2A1 1 0 0 0 3 19.5h18a1 1 0 0 0 .9-1.44l-8.18-14.2a1 1 0 0 0-1.73 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  arrow: '<svg viewBox="0 0 16 16" fill="none" width="14" height="14" aria-hidden="true" focusable="false"><path d="M3 13L13 3M13 3H7M13 3V9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  play: '<svg viewBox="0 0 44 44" fill="none" width="44" height="44" aria-hidden="true" focusable="false"><circle cx="22" cy="22" r="22" fill="rgba(255,255,255,0.85)"/><path d="M18 15l14 7-14 7V15z" fill="#1a1a1a"/></svg>',
  close: '<svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false"><path fill-rule="evenodd" clip-rule="evenodd" d="M20 18.3838L26.049 12.3347C26.4953 11.8884 27.219 11.8884 27.6653 12.3347C28.1116 12.781 28.1116 13.5047 27.6653 13.951L21.6162 20L27.6653 26.049C28.1116 26.4953 28.1116 27.219 27.6653 27.6653C27.219 28.1116 26.4953 28.1116 26.049 27.6653L20 21.6162L13.951 27.6653C13.5047 28.1116 12.781 28.1116 12.3347 27.6653C11.8884 27.219 11.8884 26.4953 12.3347 26.049L18.3838 20L12.3347 13.951C11.8884 13.5047 11.8884 12.781 12.3347 12.3347C12.781 11.8884 13.5047 11.8884 13.951 12.3347L20 18.3838Z" fill="white"/></svg>',
};

let uid = 0;
const nextId = (p) => { uid += 1; return `${p}-${uid}`; };
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const text = (cell) => (cell ? cell.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim() : '');
const href = (cell) => cell?.querySelector('a')?.getAttribute('href') || text(cell);

// "<active top-level tab> | <area name>"; the area is shown in the waterproofing-problems drawer
const getTabFilter = (block) => {
  const root = block.closest('.waterproofing-problems') || document;
  const tab = root.querySelector('.wp-tab[aria-selected="true"]')?.textContent.trim() || '';
  const area = root.querySelector('.wp-drawer-title')?.textContent.trim() || '';
  return `${tab} | ${area}`;
};

function el(tag, className, attrs = {}) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v);
  });
  return e;
}

function readModel(block) {
  const fields = {};
  const rows = {
    problem: [], step: [], product: [], video: [],
  };
  let current = null;
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const names = cells.map((c) => norm(text(c)));
    if (names[0] === 'problem' && names.length > 1 && !row.querySelector('img, a')
      && names.every((n) => !n || COLUMNS.includes(n))) {
      let type = 'problem';
      if (names.includes('video')) type = 'video';
      else if (names.includes('product')) type = 'product';
      else if (names.includes('step')) type = 'step';
      current = { type, cols: names };
      return;
    }
    if (current) {
      const item = { row };
      current.cols.forEach((name, i) => { if (name) item[name] = cells[i] || null; });
      rows[current.type].push(item);
      return;
    }
    if (FIELDS[names[0]]) fields[FIELDS[names[0]]] = { row, cell: cells[1] || null };
  });
  return { fields, rows };
}

/** a rich-text cell's content (bold label + text) as one paragraph */
function richParagraph(cell) {
  const p = el('p');
  const blocks = cell.querySelectorAll(':scope > p');
  const src = blocks.length === 1 ? blocks[0] : cell;
  [...src.childNodes].forEach((n) => p.append(n.cloneNode(true)));
  p.querySelectorAll('strong, b').forEach((s) => s.classList.add('wpa-info-label'));
  return p;
}

/** the video dialog (one per block, filled on open) */
function videoDialog(closeLabel) {
  const dialog = el('dialog', 'wpa-video-modal');
  const content = el('div', 'wpa-video-modal-content');
  const header = el('div', 'wpa-video-modal-header');
  const close = el('button', 'wpa-video-modal-close', { type: 'button', 'aria-label': closeLabel || 'Close video' });
  close.innerHTML = SVG.close;
  header.append(close);
  const body = el('div', 'wpa-video-modal-body');
  const frame = el('div', 'wpa-video-modal-ratio');
  body.append(frame);
  content.append(header, body);
  dialog.append(content);
  const stop = () => frame.replaceChildren();
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', stop);
  return {
    dialog,
    open(src, title) {
      const iframe = el('iframe', 'wpa-video-iframe', {
        title,
        src: `${src}${src.includes('?') ? '&' : '?'}autoplay=1&modestbranding=1&showinfo=0`,
        allow: 'autoplay; encrypted-media; picture-in-picture',
        allowfullscreen: '',
      });
      frame.replaceChildren(iframe);
      dialog.setAttribute('aria-label', title);
      dialog.showModal();
      close.focus();
    },
  };
}

export default async function decorate(block) {
  const { fields, rows } = readModel(block);
  // Universal Editor: carry instrumentation over (a no-op with DA authoring)
  const { moveInstrumentation = () => {} } = await import('../../scripts/scripts.js');
  const v = (k) => text(fields[k]?.cell);

  const problems = rows.problem.map((r) => ({
    row: r.row,
    name: text(r.problem),
    img: r.image?.querySelector('img') || null,
    description: r.description || null,
    causes: r.causes && text(r.causes) ? r.causes : null,
    impact: r.impact && text(r.impact) ? r.impact : null,
    stepsHeading: text(r['steps heading']),
    videosHeading: text(r['videos heading']),
  })).filter((p) => p.name);
  if (!problems.length) return;
  const key = (s) => norm(s);
  const steps = rows.step.map((r) => ({
    row: r.row, problem: key(text(r.problem)), step: text(r.step), description: text(r.description),
  }));
  const products = rows.product.map((r) => ({
    row: r.row,
    problem: key(text(r.problem)),
    step: key(text(r.step)),
    name: text(r.product),
    img: r.image?.querySelector('img') || null,
    badge: text(r.badge),
    badgeStyle: norm(text(r['badge style'])) || 'coat',
    link: href(r.link),
    separator: text(r.separator).toUpperCase(),
  })).filter((p) => p.name);
  const videos = rows.video.map((r) => ({
    row: r.row,
    problem: key(text(r.problem)),
    src: href(r.video),
    title: text(r.title),
    thumb: r.thumbnail?.querySelector('img') || null,
  })).filter((x) => x.src);

  const modal = videoDialog(v('videoCloseLabel'));

  const wrap = el('div', 'wpa-probs');
  if (v('problemsHeading')) {
    const h = el('h3', 'wpa-probs-heading');
    h.textContent = v('problemsHeading');
    moveInstrumentation(fields.problemsHeading.row, h);
    wrap.append(h);
  }
  const box = el('div', 'wpa-box');
  const tablist = el('div', 'wpa-tabs', { role: 'tablist', 'aria-label': v('tabsLabel') || 'Problem types' });
  box.append(tablist);
  const tabs = [];
  const panes = [];

  problems.forEach((p, i) => {
    const tabId = nextId('wpa-tab');
    const paneId = nextId('wpa-pane');
    const tab = el('button', 'wpa-tab', {
      type: 'button', role: 'tab', id: tabId, 'aria-controls': paneId, 'aria-selected': i === 0 ? 'true' : 'false', tabindex: i === 0 ? '0' : '-1',
    });
    tab.textContent = p.name;
    tablist.append(tab);
    tabs.push(tab);

    const pane = el('div', 'wpa-pane', {
      role: 'tabpanel', id: paneId, 'aria-labelledby': tabId, tabindex: '0',
    });
    if (i) pane.hidden = true;
    moveInstrumentation(p.row, pane);

    const inner = el('div', 'wpa-pane-inner');
    if (p.img) {
      const pic = createOptimizedPicture(p.img.src, (p.img.getAttribute('alt') || '').trim(), false, [{ width: '750' }]);
      const img = pic.querySelector('img');
      img.width = parseInt(p.img.getAttribute('width'), 10) || 1046;
      img.height = parseInt(p.img.getAttribute('height'), 10) || 400;
      img.setAttribute('draggable', 'false');
      const fig = el('div', 'wpa-pane-img');
      fig.append(pic);
      inner.append(fig);
    }
    const content = el('div', 'wpa-pane-content');
    if (p.description && text(p.description)) {
      const d = el('p', 'wpa-pane-desc');
      d.textContent = text(p.description);
      content.append(d);
    }
    [['causes', p.causes], ['impact', p.impact]].forEach(([kind, cell]) => {
      if (!cell) return;
      const info = el('div', `wpa-info is-${kind}`);
      info.innerHTML = SVG[kind];
      info.append(richParagraph(cell));
      content.append(info);
    });
    inner.append(content);
    pane.append(inner);

    // recommended system
    const mine = steps.filter((s) => s.problem === key(p.name));
    if (mine.length) {
      const rec = el('div', 'wpa-rec');
      if (p.stepsHeading) {
        const h = el('h4', 'wpa-rec-heading');
        h.textContent = p.stepsHeading;
        rec.append(h);
      }
      const ol = el('ol', 'wpa-steps');
      mine.forEach((s) => {
        const li = el('li', 'wpa-step');
        moveInstrumentation(s.row, li);
        const n = el('span', 'wpa-step-num');
        n.textContent = s.step;
        const d = el('p', 'wpa-step-desc');
        d.textContent = s.description;
        li.append(n, d);
        const items = products.filter((x) => x.problem === key(p.name) && x.step === key(s.step));
        if (items.length) {
          const ul = el('ul', 'wpa-products');
          items.forEach((x, j) => {
            const item = el('li', 'wpa-product-item');
            moveInstrumentation(x.row, item);
            if (j) {
              const sep = el('span', 'wpa-product-sep');
              sep.textContent = x.separator || 'OR';
              item.append(sep);
            }
            const a = el(x.link ? 'a' : 'div', 'wpa-product', x.link ? { href: x.link } : {});
            if (x.img) {
              const pic = createOptimizedPicture(x.img.src, '', false, [{ width: '120' }]);
              const img = pic.querySelector('img');
              img.width = 52;
              img.height = 52;
              a.append(pic);
            }
            if (a.href) {
              a.addEventListener('click', () => {
                pushAdobeProductTitleClick({
                  event: 'product_tile_click',
                  productName: x.name,
                  destinationUrl: a.href,
                  filter: getTabFilter(block),
                });
              });
            }
            const info = el('span', 'wpa-product-info');
            if (x.badge) {
              const badge = el('span', 'wpa-product-badge');
              const label = el('span', `wpa-product-badge-label is-${x.badgeStyle}`);
              label.textContent = x.badge;
              badge.append(label, ' ');
              badge.append(Object.assign(el('span', '', { 'aria-hidden': 'true' }), { textContent: '•' }));
              info.append(badge);
            }
            const name = el('span', 'wpa-product-name');
            name.textContent = x.name;
            info.append(name);
            a.append(info);
            if (x.link) {
              const arrow = el('span', 'wpa-product-arrow');
              arrow.innerHTML = SVG.arrow;
              a.append(arrow);
            }
            item.append(a);
            ul.append(item);
          });
          li.append(ul);
        }
        ol.append(li);
      });
      rec.append(ol);
      pane.append(rec);
    }

    // video tutorials
    const vids = videos.filter((x) => x.problem === key(p.name));
    if (vids.length) {
      const sec = el('div', 'wpa-videos');
      if (p.videosHeading) {
        const h = el('h4', 'wpa-videos-heading');
        h.textContent = p.videosHeading;
        sec.append(h);
      }
      const track$ = el('ul', 'wpa-videos-track');
      vids.forEach((x, j) => {
        const li = el('li', 'wpa-video-item');
        moveInstrumentation(x.row, li);
        const title = x.title || `${p.name} video ${j + 1}`;
        const btn = el('button', 'wpa-video', { type: 'button', 'aria-label': `Play video: ${title}`, 'aria-haspopup': 'dialog' });
        const thumb = el('span', 'wpa-video-thumb');
        if (x.thumb) {
          const pic = createOptimizedPicture(x.thumb.src, '', false, [{ width: '400' }]);
          const img = pic.querySelector('img');
          img.width = 200;
          img.height = 136;
          img.setAttribute('draggable', 'false');
          thumb.append(pic);
        }
        const play = el('span', 'wpa-video-play');
        play.innerHTML = SVG.play;
        thumb.append(play);
        btn.append(thumb);
        btn.addEventListener('click', () => {
          pushAdobeCtaClickEvent({
            event: 'video_playbotton_click',
            title: p.videosHeading,
            filter: getTabFilter(block),
          });
          modal.open(x.src, title);
        });
        li.append(btn);
        track$.append(li);
      });
      sec.append(track$);
      pane.append(sec);
    }

    box.append(pane);
    panes.push(pane);
  });
  wrap.append(box);

  block.replaceChildren(wrap, modal.dialog);

  /* ---------- problem tabs ---------- */
  const select = (i, focus) => {
    tabs.forEach((t, j) => {
      t.setAttribute('aria-selected', j === i ? 'true' : 'false');
      t.tabIndex = j === i ? 0 : -1;
      panes[j].hidden = j !== i;
    });
    if (focus) tabs[i].focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => {
      if (t.getAttribute('aria-selected') !== 'true') {
        pushAdobeCtaClickEvent({
          event: 'waterproofing_categories',
          category: t.textContent.trim(),
          filter: getTabFilter(block),
        });
        select(i, false);
      }
    });
    t.addEventListener('keydown', (e) => {
      const last = tabs.length - 1;
      const to = {
        ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last,
      }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      select(to, true);
    });
  });
  block.addEventListener('waterproofing-area:reset', () => select(0, false));
}
