/*
 * Expert Tips
 * A titled row of article cards. The cards sit beside the title on desktop and slide
 * sideways (Swiper) when they don't fit: swipe or drag, 300ms slides. Swiper's pagination
 * bullets (mobile) or prev/next (desktop) appear only when the cards overflow.
 *
 * Authoring (DA table): optional label | value rows, then the cards as a header row + one
 * row per card:
 *   Block title | Expert Tips                                  <- label | value
 *   Block subtitle | Step-by-step guide, tips and how to videos  <- label | value
 *   Eyebrow | Heading | Supporting text | Desktop image | Mobile image | Description | Link
 *                                                              <- cards
 * Columns are matched by header text, so they can be reordered; without a header row the
 * cards are read in the order above. The desktop image is used from 992px (the block's desktop
 * layout), the mobile image below; either one alone is used everywhere.
 *
 * Variants:
 *   blogs-preview-variant  white blog cards with the image on top, "Topic | Topic" above the
 *                      title and the date below it (the date and topics may be typed in either
 *                      the Eyebrow or the Supporting text column; topics one per paragraph or
 *                      "Topic | Topic"), a clamped description, "Read more" + a save heart; the
 *                      title's last word (or the bold words) in the brand gradient. The CSS
 *                      orders the card and draws the heart, so it also works without this JS
 */
import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import initWishlist, { wishlistHeart } from '../../scripts/wishlist.js';

// labels of the title and subtitle rows (label | value) above the cards, lower-cased
const TITLE_LABELS = ['block title', 'title'];
const SUBTITLE_LABELS = ['block subtitle', 'subtitle'];
// card columns, by header text (lower-cased)
const COLUMNS = {
  eyebrow: 'eyebrow',
  heading: 'heading',
  'supporting text': 'supporting',
  'desktop image': 'desktop',
  'mobile image': 'mobile',
  description: 'description',
  link: 'link',
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const RING = 'M18 33C26.2843 33 33 26.2843 33 18C33 9.71573 26.2843 3 18 3C9.71573 3 3 9.71573 3 18C3 26.2843 9.71573 33 18 33Z';
// a path on the 24px grid, or { viewBox, paths } for icons drawn on another grid
const ICONS = {
  // arrow-left-circle / arrow-right-circle: draw their own ring, so the buttons have no border
  prev: { viewBox: '0 0 36 36', paths: [RING, 'M18 12L12 18L18 24', 'M24 18H12'] },
  next: { viewBox: '0 0 36 36', paths: [RING, 'M18 24L24 18L18 12', 'M12 18H24'] },
  external: 'M7 17L17 7M9 7h8v8',
  heart: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
};
const HEADINGS = 'h1, h2, h3, h4, h5, h6';
const DESKTOP_MEDIA = '(min-width: 992px)';

let instances = 0;

function createIcon(name) {
  const icon = typeof ICONS[name] === 'string' ? { paths: [ICONS[name]] } : ICONS[name];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', icon.viewBox || '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  icon.paths.forEach((d) => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  });
  return svg;
}

function createButton(className, label, icon) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.setAttribute('aria-label', label);
  if (icon) button.append(createIcon(icon));
  return button;
}

const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

/** A cell's content as block elements: a single line arrives unwrapped, so it gets a paragraph. */
function cellBlocks(cell) {
  if (!text(cell)) return [];
  if (!cell.querySelector(`:scope > :is(p, ul, ol, ${HEADINGS})`)) {
    const p = document.createElement('p');
    p.append(...cell.childNodes);
    cell.append(p);
  }
  return [...cell.children].filter((child) => text(child));
}

/**
 * The title and subtitle rows (label | value) and the cards, each one
 * { row, <column key>: cell }.
 */
function readRows(block) {
  let titleRow = null;
  let subtitleRow = null;
  let columns = null;
  const cards = [];
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const labels = cells.map((cell) => text(cell).toLowerCase());
    if (!columns && labels.filter((label) => COLUMNS[label]).length >= 2) {
      columns = labels.map((label) => COLUMNS[label] || '');
      return;
    }
    if (!columns && cells.length <= 2) {
      if (TITLE_LABELS.includes(labels[0])) {
        titleRow = row;
        return;
      }
      if (SUBTITLE_LABELS.includes(labels[0])) {
        subtitleRow = row;
        return;
      }
    }
    const card = { row };
    (columns || Object.values(COLUMNS)).forEach((key, i) => {
      if (key) card[key] = cells[i] || null;
    });
    const image = [card.desktop, card.mobile].some((cell) => cell?.querySelector('img'));
    if (image || text(card.heading) || card.link?.querySelector('a[href]')) cards.push(card);
  });
  return { titleRow, subtitleRow, cards };
}

/** The card image: desktop from 992px, mobile below (the same image when only one is set). */
function buildPicture(desktop, mobile) {
  const alt = desktop.alt || mobile?.alt || '';
  if (!mobile || mobile.src === desktop.src) {
    return createOptimizedPicture(desktop.src, alt, false, [
      { media: '(min-width: 600px)', width: '750' },
      { width: '450' },
    ]);
  }
  const picture = createOptimizedPicture(mobile.src, alt, false, [{ width: '450' }]);
  const wide = createOptimizedPicture(desktop.src, '', false, [
    { media: DESKTOP_MEDIA, width: '750' },
    { width: '450' },
  ]);
  picture.prepend(...wide.querySelectorAll(`source[media="${DESKTOP_MEDIA}"]`));
  return picture;
}

/** The article's last path segment without extension, e.g. "/blogs/a-b.html" -> "a-b". */
function articleSlug(link) {
  const href = link?.getAttribute('href') || '';
  let path = href;
  try {
    path = new URL(href, window.location.origin).pathname;
  } catch (e) {
    // keep the raw value
  }
  return path.split('/').filter(Boolean).pop()?.replace(/\.[a-z0-9]+$/i, '') || '';
}

/**
 * blogs-preview-variant: the save heart beside "Read more", as on the source. Its SKU is the
 * article's page name from the authored link; clicks are handled by scripts/wishlist.js.
 */
function favouriteButton(title, link) {
  const slug = articleSlug(link);
  if (!slug) return null;
  const button = wishlistHeart({
    code: slug, type: 'blogs', name: title, className: 'expert-tips-favourite',
  });
  button.append(createIcon('heart'));
  return button;
}

// a date such as "24 June 2024": it has a year
const isDate = (value) => /\b(19|20)\d{2}\b/.test(value);

/**
 * blogs-preview-variant: the date goes in the eyebrow and the topics in the supporting text (one
 * paragraph each, "Topic | Topic" split up), whichever of the two columns the author typed them
 * in. The CSS then shows the topics first and the date under the title, as on the source.
 */
function sortBlogCells(card) {
  const date = [card.eyebrow, card.supporting].find((cell) => isDate(text(cell)));
  const topicsCell = date === card.eyebrow ? card.supporting : card.eyebrow;
  const topics = cellBlocks(topicsCell)
    .flatMap((part) => text(part).split('|'))
    .map((topic) => topic.trim())
    .filter(Boolean);
  const eyebrow = document.createElement('div');
  if (date) eyebrow.append(el('p', '', text(date)));
  const supporting = document.createElement('div');
  supporting.append(...topics.map((topic) => el('p', '', topic)));
  return { ...card, eyebrow, supporting };
}

function buildCard(authored, id, blog) {
  const card = blog ? sortBlogCells(authored) : authored;
  const li = el('li', 'expert-tips-card');
  moveInstrumentation(card.row, li);

  const body = el('div', 'expert-tips-card-body');

  // the small label above the title (e.g. the date, or topics: one per paragraph)
  const topics = cellBlocks(card.eyebrow).map(text);
  if (topics.length) {
    const eyebrow = el('p', 'expert-tips-card-eyebrow');
    topics.forEach((topic, i) => eyebrow.append(i ? ' ' : '', el('span', '', topic)));
    body.append(eyebrow);
  }

  const heading = text(card.heading);
  if (heading) {
    const title = el('h3', 'expert-tips-card-title', heading);
    title.id = id;
    body.append(title);
  }

  [['supporting', 'expert-tips-card-supporting'], ['description', 'expert-tips-card-description']]
    .forEach(([key, className]) => {
      cellBlocks(card[key]).forEach((part) => {
        part.classList.add(className);
        body.append(part);
      });
    });

  const link = card.link?.querySelector('a[href]');
  const cta = el('p', 'expert-tips-card-cta');
  if (link) {
    if (!blog) link.append(createIcon('external'));
    // "Read article" is ambiguous out of context; tie it to the card title
    if (heading) link.setAttribute('aria-describedby', id);
    cta.append(link);
  }
  if (blog) {
    const heart = favouriteButton(heading, link);
    if (heart) cta.append(heart);
  }
  if (cta.children.length) body.append(cta);

  li.append(body);

  const desktop = card.desktop?.querySelector('img');
  const mobile = card.mobile?.querySelector('img');
  const img = desktop || mobile;
  if (img) {
    const media = document.createElement('div');
    media.className = 'expert-tips-card-image';
    const picture = buildPicture(img, desktop ? mobile : null);
    moveInstrumentation(img, picture.querySelector('img'));
    media.append(picture);
    li.append(media);
  }

  return li;
}

/**
 * Slides the cards with Swiper, like the site's other carousels: swipe or drag, Swiper's
 * pagination bullets (mobile) and prev/next (desktop), shown only when the cards overflow.
 * The card widths and gaps stay in the CSS: slidesPerView 'auto' measures them (margins included).
 * @param {HTMLElement} viewport The clipping box around the list (the Swiper container)
 * @param {HTMLElement} controls Holds the prev/next buttons and the pagination
 */
async function setupSwiper(viewport, controls) {
  const prev = createButton('expert-tips-prev', 'Previous articles', 'prev');
  const next = createButton('expert-tips-next', 'Next articles', 'next');
  const dots = el('div', 'expert-tips-dots');
  controls.append(prev, dots, next);

  const Swiper = await window.loadSwiper?.().catch(() => null);
  if (!Swiper) {
    // no slider: let the cards scroll natively instead
    viewport.style.overflowX = 'auto';
    return;
  }

  const swiper = new Swiper(viewport, {
    wrapperClass: 'expert-tips-list',
    slideClass: 'expert-tips-card',
    slidesPerView: 'auto',
    speed: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300,
    navigation: { prevEl: prev, nextEl: next },
    pagination: { el: dots, clickable: true, bulletElement: 'button' },
    a11y: {
      prevSlideMessage: 'Previous articles',
      nextSlideMessage: 'Next articles',
      paginationBulletMessage: 'Show article {{index}}',
      // the cards keep their list semantics (ul > li) and are named by their own content
      slideRole: '',
      slideLabelMessage: '',
    },
    on: {
      lock: () => { controls.hidden = true; },
      unlock: () => { controls.hidden = false; },
    },
  });
  controls.hidden = swiper.isLocked;
}

export default function decorate(block) {
  instances += 1;
  const id = `expert-tips-${instances}`;
  const blog = block.classList.contains('blogs-preview-variant');
  const { titleRow, subtitleRow, cards } = readRows(block);

  const list = document.createElement('ul');
  list.className = 'expert-tips-list';
  cards.forEach((card, i) => list.append(buildCard(card, `${id}-title-${i}`, blog)));
  if (!list.children.length) return;

  const content = [];
  // the title cell: a heading (+ optional description); plain text becomes the heading
  const intro = titleRow ? cellBlocks(titleRow.children[1]) : [];
  if (intro.length && !intro.some((part) => part.matches(HEADINGS))) {
    intro[0] = el('h2', '', text(intro[0]));
  }
  // the subtitle cell: the line(s) under the title, kept as authored
  const subtitle = subtitleRow ? cellBlocks(subtitleRow.children[1]) : [];
  if (subtitle.length) moveInstrumentation(subtitleRow, subtitle[0]);
  const heading = intro.find((part) => part.matches(HEADINGS));
  if (intro.length || subtitle.length) {
    const header = el('div', 'expert-tips-intro');
    if (titleRow) moveInstrumentation(titleRow, header);
    header.append(...intro, ...subtitle);
    content.push(header);
  }
  if (heading) {
    heading.id = `${id}-heading`;
    // blogs-preview-variant: the last word takes the brand gradient, unless the author bolded some
    if (blog && !heading.querySelector('strong')) {
      const words = text(heading).split(' ');
      const highlight = el('strong', '', words.pop());
      heading.replaceChildren(words.length ? `${words.join(' ')} ` : '', highlight);
    }
    list.setAttribute('aria-labelledby', heading.id);
  } else {
    list.setAttribute('aria-label', 'Articles');
  }

  const rail = document.createElement('div');
  rail.className = 'expert-tips-rail';
  const viewport = document.createElement('div');
  viewport.className = 'expert-tips-viewport';
  viewport.append(list);
  const controls = document.createElement('div');
  controls.className = 'expert-tips-controls';
  controls.hidden = true;
  rail.append(viewport, controls);
  content.push(rail);

  block.replaceChildren(...content);
  if (blog) initWishlist(block);
  if (list.children.length > 1) setupSwiper(viewport, controls);
}
