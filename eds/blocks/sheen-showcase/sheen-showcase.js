import { createOptimizedPicture } from '../../scripts/aem.js';
import { pushAdobeCalculatorEvents, pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';

/**
 * sheen-showcase — auto-rotating vertical tabs over a full-width room image,
 * with a title and one product panel per tab.
 *
 * Authoring model (see README in sheen-showcase.css header): label | value
 * rows, then one row per tab:
 *   Eyebrow | Title | Auto-advance (seconds) | Indicator colour
 *   | Panel colour                                          <- label | value
 *   Tab | Background | Mobile background | Product image | Product name
 *   | Description | CTA label | CTA link | Second CTA label
 *   | Second CTA link                                       <- header + rows
 * Unknown labels are ignored; the header row is recognised by its "Tab" and
 * "Background" cells. When every header name is a known column, the tab rows'
 * cells are read by those names (any order, any column optional); otherwise
 * (or without a header) by the original order, as before.
 * Mobile background (below 992px): the tab's own; else the block's shared
 * "Mobile background" row (older pages); else the tab's Background.
 *
 * As on the source, the tabs advance every N seconds (0 / empty = off) and a
 * picked tab stays for one more cycle. Rotation pauses while the pointer or
 * keyboard focus is inside the block, and never runs with reduced motion.
 */

const DESKTOP_MEDIA = '(min-width: 992px)';
const FIELDS = {
  eyebrow: 'eyebrow',
  title: 'title',
  'mobile background': 'mobileBg',
  'auto-advance (seconds)': 'auto',
  'auto-advance': 'auto',
  'indicator colour': 'accent',
  'indicator color': 'accent',
  'panel colour': 'panel',
  'panel color': 'panel',
};
const COLOUR = /^#[0-9a-f]{3,8}$|^(rgb|hsl)a?\([\d\s.,%/]+\)$/i;
// the tab rows' columns, by the header row's names
const COLUMNS = {
  tab: 'name',
  background: 'bg',
  'desktop background': 'bg',
  'mobile background': 'mobileBg',
  'product image': 'product',
  'product name': 'title',
  description: 'desc',
  'cta label': 'ctaLabel',
  'cta link': 'ctaLink',
  'second cta label': 'cta2Label',
  'second cta link': 'cta2Link',
};
// the columns of pages without a header row (the original order)
const DEFAULT_ORDER = ['name', 'bg', 'product', 'title', 'desc', 'ctaLabel', 'ctaLink', 'cta2Label', 'cta2Link'];

const text = (cell) => (cell?.textContent || '').replace(/\s+/g, ' ').trim();

function readModel(block) {
  const model = { tabs: [] };
  let inTabs = false;
  let order = DEFAULT_ORDER;
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const label = text(cells[0]).toLowerCase();
    if (label === 'tab' && text(cells[1]).toLowerCase() === 'background') {
      inTabs = true;
      // by the header's names when every one is known; otherwise the original order, as before
      const names = cells.map((cell) => COLUMNS[text(cell).toLowerCase()]);
      if (names.every(Boolean)) order = names;
      return;
    }
    const key = FIELDS[label];
    if (!inTabs && key && cells.length >= 2) {
      [, model[key]] = cells;
      return;
    }
    if (cells.length >= 3 && text(cells[0])) {
      const cell = (name) => cells[order.indexOf(name)];
      const ctaLink = cell('ctaLink');
      const cta2Link = cell('cta2Link');
      const cta2Href = cta2Link?.querySelector('a[href]')?.getAttribute('href') || text(cta2Link);
      model.tabs.push({
        name: text(cell('name')),
        bg: cell('bg')?.querySelector('img'),
        mobileBg: cell('mobileBg')?.querySelector('img'),
        product: cell('product')?.querySelector('img'),
        title: text(cell('title')),
        desc: cell('desc'),
        ctaLabel: text(cell('ctaLabel')),
        ctaLink: ctaLink?.querySelector('a[href]')?.href || text(ctaLink),
        cta2Label: text(cell('cta2Label')),
        cta2Link: cta2Href.replace(/#_blank$/, ''),
        cta2NewTab: /#_blank$/.test(cta2Href),
      });
    }
  });
  return model;
}

/** Background: the tab's desktop image from 992px, its mobile one below. */
function backgroundPicture(desktop, mobile) {
  const src = mobile || desktop;
  const pic = createOptimizedPicture(src.src, desktop?.alt || mobile?.alt || '', false, mobile && desktop
    ? [{ width: '750' }]
    : [{ media: DESKTOP_MEDIA, width: '1440' }, { width: '750' }]);
  if (mobile && desktop) {
    const desk = createOptimizedPicture(desktop.src, desktop.alt || '', false, [{ width: '1440' }]);
    [...desk.querySelectorAll('source')].reverse().forEach((source) => {
      source.setAttribute('media', DESKTOP_MEDIA);
      pic.prepend(source);
    });
  }
  return pic;
}

export default function decorate(block) {
  const m = readModel(block);
  const tabs = m.tabs.filter((t) => t.name);
  if (!tabs.length) return;
  const uid = `sheen-showcase-${Math.random().toString(36).slice(2, 8)}`;
  if (COLOUR.test(text(m.accent))) block.style.setProperty('--sheen-showcase-indicator', text(m.accent));
  if (COLOUR.test(text(m.panel))) block.style.setProperty('--sheen-showcase-panel', text(m.panel));
  // the shared mobile background of older pages, for tabs without their own
  const sharedMobileBg = m.mobileBg?.querySelector('img');

  const stage = document.createElement('div');
  stage.className = 'sheen-showcase-stage';

  // --- visual: backgrounds, tab list, title ---
  const visual = document.createElement('div');
  visual.className = 'sheen-showcase-visual';
  const bgs = document.createElement('div');
  bgs.className = 'sheen-showcase-backgrounds';
  const spacer = document.createElement('div');
  spacer.className = 'sheen-showcase-spacer';
  const tabsWrap = document.createElement('div');
  tabsWrap.className = 'sheen-showcase-tabs-wrap';
  const list = document.createElement('div');
  list.className = 'sheen-showcase-tabs';
  list.setAttribute('role', 'tablist');
  list.setAttribute('aria-orientation', 'vertical');
  tabsWrap.append(list);

  const titleBox = document.createElement('div');
  titleBox.className = 'sheen-showcase-title';
  if (text(m.eyebrow)) {
    const p = document.createElement('p');
    p.textContent = text(m.eyebrow);
    titleBox.append(p);
  }
  if (text(m.title)) {
    const h2 = document.createElement('h2');
    h2.textContent = text(m.title);
    titleBox.append(h2);
    list.setAttribute('aria-label', text(m.title));
  }
  visual.append(bgs, spacer, tabsWrap, titleBox);

  // --- product panels ---
  const panels = document.createElement('div');
  panels.className = 'sheen-showcase-panels';

  const buttons = [];
  const panelEls = [];
  const bgEls = [];
  tabs.forEach((tab, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sheen-showcase-tab';
    button.id = `${uid}-tab-${i}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `${uid}-panel-${i}`);
    button.textContent = tab.name;
    list.append(button);
    buttons.push(button);

    const mobileBg = tab.mobileBg || sharedMobileBg;
    const bg = tab.bg || mobileBg ? backgroundPicture(tab.bg, mobileBg) : document.createElement('div');
    bg.classList.add('sheen-showcase-background');
    bgs.append(bg);
    bgEls.push(bg);

    const panel = document.createElement('div');
    panel.className = 'sheen-showcase-panel';
    panel.id = `${uid}-panel-${i}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    if (tab.product) {
      const product = createOptimizedPicture(tab.product.src, tab.product.alt || '', false, [{ width: '400' }]);
      product.classList.add('sheen-showcase-product');
      panel.append(product);
    }
    const details = document.createElement('div');
    details.className = 'sheen-showcase-details';
    // name + description share one wrapper (source .rte), so the name spans
    // the description's width
    const copy = document.createElement('div');
    copy.className = 'sheen-showcase-copy';
    if (tab.title) {
      const h3 = document.createElement('h3');
      h3.textContent = tab.title;
      copy.append(h3);
    }
    if (text(tab.desc)) {
      const p = document.createElement('p');
      p.textContent = text(tab.desc);
      copy.append(p);
    }
    if (copy.children.length) details.append(copy);
    if (tab.ctaLabel && tab.ctaLink) {
      const a = document.createElement('a');
      a.className = 'sheen-showcase-cta';
      a.href = tab.ctaLink;
      const label = document.createElement('span');
      label.textContent = tab.ctaLabel;
      const icon = document.createElement('span');
      icon.className = 'sheen-showcase-cta-icon';
      icon.setAttribute('aria-hidden', 'true');
      a.addEventListener('click', () => {
        const parentTitle = copy.querySelector('h3')?.textContent?.trim() || '';
        pushAdobeCtaClickEvent({
          event: 'custom_cta_click',
          cta: tab.ctaLabel,
          parentTitle,
          destinationUrl: a.href,
        });
      });
      a.append(label, icon);
      details.append(a);
    }
    // ===== SECOND CTA (optional): text link below the CTA =====
    if (tab.cta2Label && tab.cta2Link) {
      const a2 = document.createElement('a');
      a2.className = 'sheen-showcase-cta-secondary';
      a2.href = tab.cta2Link;
      a2.textContent = tab.cta2Label;
      if (tab.cta2NewTab) {
        a2.target = '_blank';
        a2.rel = 'noopener';
      }
      a2.addEventListener('click', () => {
        const parentTitle = copy.querySelector('h3')?.textContent?.trim() || '';
        pushAdobeCtaClickEvent({
          event: 'cta_link_text',
          cta: tab.cta2Label,
          parentTitle,
          destinationUrl: a2.href,
        });
      });
      details.append(a2);
    }
    panel.append(details);
    panels.append(panel);
    panelEls.push(panel);
  });

  stage.append(visual, panels);
  block.replaceChildren(stage);

  // --- tab state ---
  let current = -1;
  const select = (index, focus = false) => {
    if (index === current) {
      if (focus) buttons[index].focus();
      return;
    }
    current = index;
    buttons.forEach((b, i) => {
      const on = i === index;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle('is-active', on);
      panelEls[i].hidden = !on;
      bgEls[i].hidden = !on;
    });
    if (focus) buttons[index].focus();
  };
  select(0);

  // source timing: tick every N ms, clicking tab `next`; a manual pick sets
  // `next` to the picked tab, so it stays for one more cycle
  const seconds = parseFloat(text(m.auto));
  const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
  let next = 1 % tabs.length;
  let hold = false;
  const pick = (index, focus) => {
    select(index, focus);
    next = index;
  };
  buttons.forEach((b, i) => b.addEventListener('click', () => {
    const parentTitle = titleBox.querySelector('h2')?.textContent?.trim() || '';
    pushAdobeCalculatorEvents({
      event: 'filter_click',
      filter: b.textContent.trim(),
      parentTitle,
    });
    pick(i);
  }));
  list.addEventListener('keydown', (e) => {
    const keys = {
      ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1,
    };
    let index;
    if (keys[e.key]) index = (current + keys[e.key] + tabs.length) % tabs.length;
    else if (e.key === 'Home') index = 0;
    else if (e.key === 'End') index = tabs.length - 1;
    else return;
    e.preventDefault();
    pick(index, true);
  });

  if (delay && tabs.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const pause = () => { hold = true; };
    const resume = () => { hold = block.matches(':hover') || block.contains(document.activeElement); };
    block.addEventListener('pointerenter', pause);
    block.addEventListener('pointerleave', resume);
    block.addEventListener('focusin', pause);
    block.addEventListener('focusout', () => setTimeout(resume));
    const tick = () => {
      if (!hold) {
        select(next);
        next = (next + 1) % tabs.length;
      }
      setTimeout(tick, delay);
    };
    setTimeout(tick, delay);
  }

  // hidden tabs' images load once the block is near the viewport, so a tab
  // change never shows an empty picture
  const preload = () => block.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      preload();
    }, { rootMargin: '200px' });
    io.observe(block);
  } else preload();
}
