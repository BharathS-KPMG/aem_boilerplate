/*
 * Tabs Wraper
 * Category banner for product listing pages: full-width background, a title image, a pill of
 * range links (the current page is highlighted) and, on desktop, a promo image with a CTA.
 * The "tabs" are links to sibling listing pages, so this is page navigation, not ARIA tabs.
 *
 * Authoring (Tabs convention, 2 columns: label | content). Each tab is a row:
 *   | Super Luxury | link to that listing page |      (bold label = current tab, optional)
 * plus optional reserved rows, recognised by their label:
 *   | Background   | desktop image, optional mobile image (below 992px) |
 *   | Title        | title image (alt = the visible title)              |
 *   | Heading      | page heading text (rendered as a visually hidden h1, as on the source) |
 *   | Promo        | promo image, CTA link                              |
 * The Promo CTA opens the "Book a FREE Site Visit" lead form pop-up (see openSiteVisitPopup); its
 * link is the fallback when no form can load.
 * The current tab is the one whose link matches this page, or the one with a bold label.
 *
 * Grouped tabs (e.g. "Paints | Textures" on the textures page): a Group row starts each set of
 * tabs; the tab rows below it belong to that group.
 *   | Group | [Paints](link of the group's landing page, e.g. its "All" page) |
 *   | Ultima | link |  …  | All | link |
 *   | Group | [Textures](link) |
 *   | Ultima Allura | link |  …
 * The current group is the one holding this page's tab (or the one with a bold name); only its
 * tabs are shown. Desktop: the groups sit in a segment at the start of the pill; choosing another
 * group opens its link. Below 992px: a "← Group ⌄" strip above the banner opens the group list.
 * Without Group rows the block works as before (one set of tabs).
 * Links go to the live www.asianpaints.com pages (beta on beta itself; see liveUrl).
 * The range pill stays on screen while the page scrolls, as on the source (see pinOnScroll).
 */
import { createOptimizedPicture, getMetadata } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import { BETA_DOMAIN, PROD_DOMAIN } from '../../scripts/environment.js';
import { pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';

const DESKTOP_MEDIA = '(min-width: 992px)';
const RESERVED = ['background', 'title', 'heading', 'promo'];
const GROUP_KEY = 'group';

const normalisePath = (path) => path.replace(/\.html$/, '').replace(/\/$/, '') || '/';

// links go to the live Asian Paints pages (www), and to beta only on pages served from beta
// (domains from scripts/environment.js)
const SITE_DOMAIN = window.location.hostname === BETA_DOMAIN ? BETA_DOMAIN : PROD_DOMAIN;
const ASIAN_PAINTS_HOSTS = [PROD_DOMAIN, BETA_DOMAIN, 'asianpaints.com'];

/**
 * The Asian Paints URL for an authored link, on the site's domain (SITE_DOMAIN). Site-relative
 * links ("/paint-products/…", which the content sync makes of authored www links) and links to
 * www/beta.asianpaints.com map to that domain, with the .html the site uses; other links are
 * kept as authored.
 */
function liveUrl(link) {
  const href = link.getAttribute('href') || '';
  const relative = href.startsWith('/') && !href.startsWith('//');
  const url = new URL(relative ? href : link.href, `https://${SITE_DOMAIN}`);
  if (!relative && !ASIAN_PAINTS_HOSTS.includes(url.hostname)) return link.href;
  url.protocol = 'https:';
  url.hostname = SITE_DOMAIN;
  if (url.pathname !== '/' && !/\.[a-z0-9]+$/i.test(url.pathname)) {
    url.pathname = `${url.pathname.replace(/\/$/, '')}.html`;
  }
  return url.href;
}

/** Art-directed background: desktop image from 992px, mobile image below. */
function buildBackground(content, eager) {
  const [desktop, mobile] = [...content.querySelectorAll('picture img')];
  if (!desktop) return null;
  // base picture = mobile image (or desktop when there is none); desktop sources win from 992px
  const small = mobile || desktop;
  const picture = createOptimizedPicture(small.src, desktop.alt || '', eager, [{ width: '750' }]);
  const wide = createOptimizedPicture(desktop.src, '', eager, [
    { media: DESKTOP_MEDIA, width: '2000' },
    { width: '750' },
  ]);
  picture.prepend(...wide.querySelectorAll(`source[media="${DESKTOP_MEDIA}"]`));
  const img = picture.querySelector('img');
  moveInstrumentation(desktop, img);
  if (eager) img.setAttribute('fetchpriority', 'high');
  const wrapper = document.createElement('div');
  wrapper.className = 'tabs-wraper-background';
  wrapper.append(picture);
  return wrapper;
}

function buildTitle(content, eager) {
  const img = content.querySelector('picture img');
  const title = document.createElement('div');
  title.className = 'tabs-wraper-title';
  if (img) {
    const picture = createOptimizedPicture(img.src, img.alt || '', eager, [{ width: '400' }]);
    moveInstrumentation(img, picture.querySelector('img'));
    title.append(picture);
  } else if (content.textContent.trim()) {
    const p = document.createElement('p');
    p.textContent = content.textContent.trim();
    title.append(p);
  }
  return title.children.length ? title : null;
}

/**
 * Builds the range navigation from tab rows (| label | link |).
 * @param {{row: Element, label: Element, link: HTMLAnchorElement}[]} tabs Tab rows
 * @param {string} name Accessible name for the navigation landmark
 * @param {string} [bannerTitle] Title image alt text, sent with the click events
 */
function buildTabs(tabs, name, bannerTitle = '') {
  const nav = document.createElement('nav');
  nav.className = 'tabs-wraper-nav';
  nav.setAttribute('aria-label', name);
  const list = document.createElement('ul');
  const here = normalisePath(window.location.pathname);
  tabs.forEach(({ row, label, link }) => {
    const li = document.createElement('li');
    moveInstrumentation(row, li);
    const a = document.createElement('a');
    a.href = liveUrl(link);
    a.textContent = label.textContent.trim() || link.textContent.trim();
    moveInstrumentation(link, a);
    a.addEventListener('click', () => {
      pushAdobeCtaClickEvent({
        cta: a.textContent.trim(),
        title: bannerTitle,
        destinationUrl: a.href,
        event: 'custom_cta_click',
      });
    });
    const current = normalisePath(new URL(a.href).pathname) === here
      || Boolean(label.querySelector('strong, b'));
    if (current) a.setAttribute('aria-current', 'page');
    li.append(a);
    list.append(li);
  });
  nav.append(list);
  return nav;
}

// below 992px the pinned pill sits in a white strip at the top of the page, this far down
const MOBILE_PIN_TOP = 10;

/**
 * The bottom of the site header as it shows now: its fixed or sticky parts that are attached to
 * the top of the page (the header element itself only when it has none, since a fixed wrapper
 * can keep its full height while its parts collapse on scroll).
 * @param {{header: Element, parts: Element[]}} cache Header and its fixed parts, filled lazily
 */
function headerBottom(cache) {
  if (!cache.header?.isConnected) {
    cache.header = document.querySelector('header');
    cache.parts = null;
  }
  if (!cache.header) return 0;
  if (!cache.parts?.length) {
    cache.parts = [...cache.header.querySelectorAll('*')]
      .filter((el) => ['fixed', 'sticky'].includes(getComputedStyle(el).position));
  }
  const parts = cache.parts.length ? cache.parts : [cache.header];
  return parts.reduce((bottom, el) => {
    const rect = el.getBoundingClientRect();
    const attached = rect.height > 0 && rect.top <= 1 && rect.bottom > 0;
    return attached && getComputedStyle(el).visibility !== 'hidden' ? Math.max(bottom, rect.bottom) : bottom;
  }, 0);
}

/**
 * On desktop the source's pinned pill is fixed at z-index 1, so the page's lead form (the
 * formVerticalVariantContainer) scrolls over it and the pill shows again once the form has passed.
 * Here the pill keeps its z-index (it must stay above the header's box to take clicks), so the part
 * of it that the form would cover is clipped away instead.
 */
function coverByForm(nav, active) {
  const list = nav.querySelector('ul');
  if (!list) return;
  let hideTop = 0;
  let hideBottom = 0;
  if (active) {
    const pill = list.getBoundingClientRect();
    document.querySelectorAll('main .form.block').forEach((form) => {
      const box = form.getBoundingClientRect();
      if (box.bottom <= pill.top || box.top >= pill.bottom) return;
      if (box.top <= pill.top) hideTop = Math.max(hideTop, box.bottom - pill.top);
      else hideBottom = Math.max(hideBottom, pill.bottom - box.top);
    });
  }
  const zoom = nav.currentCSSZoom || 1;
  list.style.clipPath = hideTop || hideBottom
    ? `inset(${hideTop / zoom}px 0 ${hideBottom / zoom}px 0)`
    : '';
}

/**
 * Pins the range pill once it would scroll under the header, as on the source: just below the
 * header on desktop, in a white strip at the top of the page (over the header) below 992px.
 * The nav keeps its place in the banner; only its list is fixed (see tabs-wraper.css).
 */
function pinOnScroll(nav) {
  const desktop = window.matchMedia(DESKTOP_MEDIA);
  const cache = {};
  let frame = 0;
  const update = () => {
    frame = 0;
    // not laid out yet (its section stays hidden while it loads): no position to compare
    if (!nav.getClientRects().length) {
      nav.classList.remove('tabs-wraper-nav-pinned');
      return;
    }
    const top = desktop.matches ? headerBottom(cache) : MOBILE_PIN_TOP;
    const pinned = nav.getBoundingClientRect().top < top;
    nav.classList.toggle('tabs-wraper-nav-pinned', pinned);
    // fixed offsets are in the block's zoomed pixels (the source zooms the page below 1440px)
    if (pinned) nav.style.setProperty('--tabs-wraper-pin-top', `${top / (nav.currentCSSZoom || 1)}px`);
    coverByForm(nav, pinned && desktop.matches);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', () => {
    cache.parts = null;
    schedule();
  });
  // the section is shown once it has loaded, without a scroll: measure again when the banner
  // gets its box (and on any later change of its size)
  new ResizeObserver(schedule).observe(nav.closest('.tabs-wraper'));
  /* ===== FIX PIN BELOW HEADER : START ===== */
  // the header changes its own classes on scroll (e.g. desktop-scrolled, which slides its top bar
  // away) just after this measures it; without a later scroll the pill would stay pinned at the
  // old header bottom (40px instead of 100px after a jump, like a reload or an anchor link)
  const header = document.querySelector('header');
  if (header) {
    new MutationObserver(schedule).observe(header, {
      attributes: true, attributeFilter: ['class', 'style'], subtree: true,
    });
  }
  /* ===== FIX PIN BELOW HEADER : END ===== */
  schedule();
}

/*
 * "Book a FREE Site Visit" pop-up. The host's own one first: the stage project opens its lead
 * form with its modal block (blocks/modal openModal) and the form page its header CTA points to,
 * like that header, so every CTA on the page opens the same form. Without a modal block (this
 * project) it is this project's form (scripts/site-visit-form.js); if neither loads, the link.
 */
const DEFAULT_SITE_VISIT_MODAL = '/eds/forms/book-free-site-visit';

async function openSiteVisitPopup(opener, fallback) {
  const modalPath = document.querySelector('.trigger-book-free-site-visit-modal[data-modal-path]')?.dataset.modalPath
    || getMetadata('site-visit-modal') || DEFAULT_SITE_VISIT_MODAL;
  try {
    // the host project's modal block (not in this project, so not resolvable here)
    // eslint-disable-next-line import/no-unresolved
    const { openModal } = await import('../modal/modal.js');
    await openModal(modalPath);
    return;
  } catch {
    // no modal block (or no form page) on this site: this project's form
  }
  try {
    const { default: openSiteVisitForm } = await import('../../scripts/site-visit-form.js');
    const dialog = await openSiteVisitForm();
    dialog.addEventListener('close', () => opener.focus(), { once: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('site visit form failed to load', error);
    window.location.href = fallback;
  }
}

function buildPromo(content) {
  const img = content.querySelector('picture img');
  const link = content.querySelector('a[href]');
  if (!img && !link) return null;
  const promo = document.createElement('div');
  promo.className = 'tabs-wraper-promo';
  if (img) {
    const picture = createOptimizedPicture(img.src, img.alt || '', false, [{ width: '500' }]);
    moveInstrumentation(img, picture.querySelector('img'));
    promo.append(picture);
  }
  if (link) {
    // opens the "Book a FREE Site Visit" lead form pop-up, as on the source; the authored link is
    // the fallback if the form cannot load
    const cta = document.createElement('button');
    cta.type = 'button';
    cta.className = 'tabs-wraper-cta';
    cta.textContent = link.textContent.trim();
    cta.setAttribute('aria-haspopup', 'dialog');
    moveInstrumentation(link, cta);
    cta.addEventListener('click', () => {
      const parentTitle = img?.alt || '';
      pushAdobeCtaClickEvent({
        cta: cta.textContent.trim(),
        parentTitle,
        event: 'custom_cta_click',
      });
      openSiteVisitPopup(cta, liveUrl(link));
    });
    promo.append(cta);
  }
  return promo;
}

/** Reports a group switch like the source (custom_cta_click with the group's destination). */
function trackGroupClick(name, href) {
  pushAdobeCtaClickEvent({ event: 'custom_cta_click', cta: name, destinationUrl: href });
}

function groupLink(group, current, className) {
  const a = document.createElement('a');
  a.className = className;
  a.textContent = group.name;
  moveInstrumentation(group.row, a);
  if (group.link) {
    a.href = liveUrl(group.link);
    a.addEventListener('click', () => trackGroupClick(group.name, a.href));
  }
  if (current) a.setAttribute('aria-current', 'true');
  return a;
}

/** Desktop: the group segment at the start of the pill ("Paints | Textures"). */
function buildGroupSegment(groups, active) {
  const li = document.createElement('li');
  li.className = 'tabs-wraper-groups';
  groups.forEach((group) => li.append(groupLink(group, group === active, 'tabs-wraper-group')));
  return li;
}

/** Below 992px: "← Textures ⌄" strip above the banner; the caret opens the group list. */
function buildGroupSwitch(groups, active) {
  const strip = document.createElement('div');
  strip.className = 'tabs-wraper-switch';

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'tabs-wraper-switch-back';
  back.setAttribute('aria-label', 'Back');
  back.addEventListener('click', () => window.history.back());

  const menu = document.createElement('div');
  menu.className = 'tabs-wraper-switch-menu';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'tabs-wraper-switch-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  const listId = `tabs-wraper-groups-${Math.random().toString(36).slice(2, 8)}`;
  toggle.setAttribute('aria-controls', listId);
  toggle.textContent = active.name;

  const list = document.createElement('ul');
  list.id = listId;
  list.className = 'tabs-wraper-switch-list';
  list.hidden = true;
  groups.forEach((group) => {
    const li = document.createElement('li');
    li.append(groupLink(group, group === active, 'tabs-wraper-switch-option'));
    list.append(li);
  });
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', open);
    list.hidden = !open;
  });

  menu.append(toggle, list);
  strip.append(back, menu);
  return strip;
}

export default function decorate(block) {
  const main = block.closest('main');
  const eager = !main || block.closest('.section') === main.querySelector('.section');

  const parts = {};
  const tabs = [];
  const groups = [];
  [...block.children].forEach((row) => {
    const [labelCell, contentCell] = row.children;
    if (!labelCell) return;
    const content = contentCell || labelCell;
    const key = labelCell.textContent.trim().toLowerCase();
    if (contentCell && RESERVED.includes(key)) {
      if (!parts[key]) parts[key] = { row, content };
      return;
    }
    if (contentCell && key === GROUP_KEY) {
      groups.push({
        row,
        name: content.textContent.trim(),
        link: content.querySelector('a[href]'),
        // a bold link may already be a button: decorateButtons turns <strong><a> into a.primary
        bold: Boolean(content.querySelector('strong, b, a.button.primary, a.button.accent')),
        tabs: [],
      });
      return;
    }
    const link = content.querySelector('a[href]');
    if (!link) return;
    const tab = { row, label: contentCell ? labelCell : link, link };
    (groups.length ? groups[groups.length - 1].tabs : tabs).push(tab);
  });

  // grouped tabs: show the current group's tabs (the group holding this page, else the bold one)
  const here = normalisePath(window.location.pathname);
  const holdsThisPage = (group) => group.tabs
    .some(({ link }) => normalisePath(new URL(liveUrl(link)).pathname) === here);
  const activeGroup = groups.length
    ? groups.find(holdsThisPage) || groups.find((group) => group.bold) || groups[0]
    : null;
  if (activeGroup) tabs.push(...activeGroup.tabs);

  const titleEl = parts.title ? buildTitle(parts.title.content, eager) : null;
  const titleText = titleEl?.querySelector('img')?.alt || titleEl?.textContent.trim();
  let heading = null;
  const headingText = parts.heading?.content.textContent.trim();
  if (headingText) {
    // the page's h1: read by screen readers and search engines, hidden like on the source
    heading = document.createElement('h1');
    heading.className = 'tabs-wraper-heading';
    heading.textContent = headingText;
  }
  const built = {
    background: parts.background && buildBackground(parts.background.content, eager),
    title: titleEl,
    heading,
    promo: parts.promo && buildPromo(parts.promo.content),
  };
  Object.entries(built).forEach(([key, el]) => {
    if (el && parts[key]) moveInstrumentation(parts[key].row, el);
  });
  const nav = tabs.length ? buildTabs(tabs, titleText ? `${titleText} ranges` : 'Product ranges', titleText || '') : null;
  const grouped = nav && groups.length > 1;
  if (grouped) {
    nav.classList.add('tabs-wraper-nav-grouped');
    nav.querySelector('ul').prepend(buildGroupSegment(groups, activeGroup));
  }

  const center = document.createElement('div');
  center.className = 'tabs-wraper-center';
  center.append(...[built.heading, built.title, nav].filter(Boolean));

  block.replaceChildren(...[built.background, center, built.promo].filter(Boolean));
  if (grouped) {
    // the mobile group switch sits above the banner, outside its clipped box
    block.closest('.tabs-wraper-wrapper')?.querySelector(':scope > .tabs-wraper-switch')?.remove();
    block.before(buildGroupSwitch(groups, activeGroup));
  }
  if (nav) pinOnScroll(nav);
}
