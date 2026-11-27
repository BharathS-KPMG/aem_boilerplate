/*
 * Cards Inspiration
 * The inspiration cards of one room on colour inspiration listing pages (cards-nilaya pattern),
 * paged by the color-inspiration-listing block above them. It needs scripts/aem.js, and
 * scripts/pre-load-image.js for the first row (the LCP), which that script preloads.
 *
 * Authoring: block "Cards Inspiration (<room>)", e.g. "Cards Inspiration (Bedroom)", which
 * renders as the classes `cards-inspiration bedroom`. One row per card, in two cells:
 *   | room image (desktop picture, then optional mobile picture) | text |
 * The text cell holds, in this order (all but the title optional):
 *   *Trending*                                 badge (italic paragraph)
 *   ### [Inspiration title](/inspiration/...)  title, linking to the detail page
 *   Room Type: Bedroom                         labelled values (not shown on the card);
 *   Style: Modern                              several values with commas
 * Without a Room Type, a card has its block's room (the block option).
 *
 * More cards: the cards are the authored ones on first load. When the listing has shown them
 * all, it sends MORE_EVENT; the block then adds the cards of its room's sheet (page metadata
 * inspiration-api, default /eds/inspirations.json?sheet=cards-{range}; columns image,
 * mobile-image, title, link, badge, room-type, style), once, skipping cards already shown.
 * Each render is announced with CARDS_EVENT on the document.
 */
import { createOptimizedPicture, getMetadata, toClassName } from '../../scripts/aem.js';
import { pushAdobeCalculatorEvents } from '../../scripts/analytics_1.js';
import { useUnparsedPictureUrls } from '../../scripts/pre-load-image.js';

const NAME = 'cards-inspiration';
const CARDS_EVENT = 'inspiration-cards:loaded';
const MORE_EVENT = 'inspiration-cards:more';
const DEFAULT_API = '/eds/inspirations.json?sheet=cards-{range}';
const DESKTOP_MEDIA = '(min-width: 768px)';
// four cards a row from 992px (cards-inspiration.css), one below
const FOUR_COLUMNS_MEDIA = '(min-width: 992px)';
const TIMEOUT = 4000;

const LABELS = { 'room type': 'rooms', room: 'rooms', style: 'styles' };

const splitList = (text) => String(text || '').split(',').map((part) => part.trim()).filter(Boolean);

// "living-room" -> "Living Room"
const label = (key) => key.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

/** The path of a link, for de-duplicating cards. */
function cardKey(href) {
  try {
    const { pathname } = new URL(href, window.location.href);
    return pathname.replace(/\.html$/, '').replace(/\/$/, '').toLowerCase();
  } catch (e) {
    return '';
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const isSameOrigin = (src) => {
  try {
    return new URL(src, window.location.href).origin === window.location.origin;
  } catch (e) {
    return false;
  }
};

/**
 * The mobile image below 768px, the desktop image from 768px; other hosts' images as they are.
 * Eager: loaded right away at high priority (the first row, the page's LCP), from the URLs
 * preloadCardsInspirationLcp() in scripts/pre-load-image.js preloads: keep the two in step.
 * They are the unparsed URLs, so the preload is not taken over by the authored lazy <img>.
 * The picture is built lazy and made eager once complete, so no other URL is requested first.
 */
function buildPicture(desktopSrc, mobileSrc, alt = '', eager = false) {
  const small = mobileSrc || desktopSrc;
  let picture;
  if (isSameOrigin(small) && isSameOrigin(desktopSrc)) {
    picture = createOptimizedPicture(small, alt, false, [{ width: '750' }]);
    if (mobileSrc && mobileSrc !== desktopSrc) {
      const wide = createOptimizedPicture(desktopSrc, '', false, [{ media: DESKTOP_MEDIA, width: '750' }, { width: '750' }]);
      picture.prepend(...wide.querySelectorAll(`source[media="${DESKTOP_MEDIA}"]`));
    }
  } else {
    picture = document.createElement('picture');
    if (mobileSrc && mobileSrc !== desktopSrc) {
      const source = document.createElement('source');
      source.media = DESKTOP_MEDIA;
      source.srcset = desktopSrc;
      picture.append(source);
    }
    const img = document.createElement('img');
    img.src = small;
    img.alt = alt;
    img.loading = 'lazy';
    picture.append(img);
  }
  if (eager) {
    useUnparsedPictureUrls(picture);
    const img = picture.querySelector('img');
    img.setAttribute('fetchpriority', 'high');
    img.setAttribute('loading', 'eager');
  }
  return picture;
}

/** A card, the same markup for authored rows and sheet rows. */
function buildCard({
  title, link, badge, picture, rooms = [], styles = [],
}) {
  const item = el('li', `${NAME}-item`);
  const card = el('div', `${NAME}-card`);
  card.dataset.roomType = rooms.map(toClassName).join(',');
  card.dataset.style = styles.map(toClassName).join(',');
  if (link) card.dataset.key = cardKey(link);
  if (picture) {
    const image = el(link ? 'a' : 'div', `${NAME}-image`);
    if (link) {
      // the title is the card's link for assistive technology; the image is a mouse shortcut
      image.href = link;
      image.tabIndex = -1;
      image.setAttribute('aria-hidden', 'true');
      image.addEventListener('click', () => {
        const selectedTab = document
          .querySelector('.color-inspiration-listing-tab[aria-current="page"]')
          ?.textContent
          ?.trim() || '';

        pushAdobeCalculatorEvents({ event: 'ColourDetailClick', detail: title, stepDetails2: selectedTab });
      });
    }
    image.append(picture);
    card.append(image);
  }
  const body = el('div', `${NAME}-body`);
  if (badge) {
    const p = el('p', `${NAME}-badge`);
    p.append(el('em', '', badge));
    body.append(p);
  }
  const heading = el('h3', `${NAME}-title`);
  if (link) {
    const a = el('a', '', title);
    a.href = link;
    heading.append(a);
  } else {
    heading.textContent = title;
  }
  body.append(heading);
  [['room-tag', rooms], ['style-tag', styles]].forEach(([cls, values]) => {
    if (!values.length) return;
    const tag = el('p', cls, values.join(', '));
    tag.hidden = true;
    body.append(tag);
  });
  card.append(body);
  item.append(card);
  return item;
}

/** A labelled line of a card ("Style: Modern"), or null. */
function labelOf(node) {
  const text = node.textContent.trim();
  const index = text.indexOf(':');
  if (index < 1) return null;
  const key = LABELS[text.slice(0, index).trim().toLowerCase()];
  return key ? { key, value: text.slice(index + 1) } : null;
}

/** Reads an authored row; null for an empty row. Eager: its image loads right away. */
function readRow(row, defaultRooms, eager) {
  const cells = [...row.children];
  const imageCell = cells.find((cell) => cell.querySelector('picture, img'));
  const nodes = cells.filter((cell) => cell !== imageCell).flatMap((cell) => [...cell.children]);
  const images = imageCell ? [...imageCell.querySelectorAll('img')] : [];
  if (!images.length && !nodes.length) return null;
  const data = {
    title: '', link: '', badge: '', rooms: [], styles: [],
  };
  // the title is the first heading; without one, the first paragraph with a link
  const titleNode = nodes.find((node) => node.matches('h1, h2, h3, h4, h5, h6'))
    || nodes.find((node) => node.matches('p') && node.querySelector('a[href]') && !labelOf(node));
  if (titleNode) {
    data.title = titleNode.textContent.trim();
    data.link = titleNode.querySelector('a[href]')?.getAttribute('href') || '';
  }
  let beforeTitle = Boolean(titleNode);
  nodes.forEach((node) => {
    if (node === titleNode) {
      beforeTitle = false;
      return;
    }
    const labelled = labelOf(node);
    if (labelled) data[labelled.key] = splitList(labelled.value);
    // text above the title is the badge, e.g. *Trending*
    else if (beforeTitle && !data.badge) data.badge = node.textContent.trim();
  });
  if (!data.rooms.length) data.rooms = defaultRooms;
  const [desktop, mobile] = images;
  if (desktop) {
    data.picture = buildPicture(desktop.src, mobile?.src, desktop.alt || data.title, eager);
  }
  return data.title || data.picture ? data : null;
}

/** Reads a sheet row; slugs in the link column are under detailBase. */
function readRecord(record, defaultRooms, detailBase) {
  const value = (key) => String(record[key] ?? '').trim();
  let link = value('link');
  if (link && !/^(https?:)?\//.test(link) && detailBase) link = `${detailBase.replace(/\/$/, '')}/${link}`;
  const image = value('image');
  const rooms = splitList(value('room-type'));
  return {
    title: value('title'),
    link,
    badge: value('badge'),
    picture: image ? buildPicture(image, value('mobile-image'), value('title')) : null,
    rooms: rooms.length ? rooms : defaultRooms,
    styles: splitList(value('style')),
  };
}

async function loadRecords(room) {
  const api = getMetadata('inspiration-api') || DEFAULT_API;
  const url = api.replace(/\{(range|roomType)\}/g, encodeURIComponent(room));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return [];
    const json = await response.json();
    return [json, json.data].find(Array.isArray) || [];
  } catch (e) {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export default function decorate(block) {
  const [room] = [...block.classList].filter((cls) => cls !== 'block' && cls !== NAME);
  const rooms = room ? [label(room)] : [];
  const list = el('ul', `${NAME}-list`);
  // the first row of the page's first cards block is above the fold and holds the LCP image
  const firstRow = window.matchMedia(FOUR_COLUMNS_MEDIA).matches ? 4 : 1;
  const eagerRows = block === document.querySelector(`.${NAME}`) ? firstRow : 0;
  [...block.children].forEach((row, index) => {
    const data = readRow(row, rooms, index < eagerRows);
    if (data) list.append(buildCard(data));
  });
  block.replaceChildren(list);
  if (room) block.dataset.room = room;
  const announce = () => {
    document.dispatchEvent(new CustomEvent(CARDS_EVENT, { detail: { block } }));
  };

  // the listing has shown every card: add the room's sheet cards, once
  let topped = false;
  document.addEventListener(MORE_EVENT, async (e) => {
    const { listing, detailBase = '' } = e.detail || {};
    if (topped || !room || !listing?.contains(block)) return;
    topped = true;
    const known = new Set([...document.querySelectorAll(`.${NAME}-card[data-key]`)]
      .map((card) => card.dataset.key));
    const records = await loadRecords(room);
    const fresh = records.map((record) => readRecord(record, rooms, detailBase))
      .filter((data) => data.title && data.link && !known.has(cardKey(data.link)));
    fresh.forEach((data) => list.append(buildCard(data)));
    if (fresh.length) announce();
  });

  announce();
}
