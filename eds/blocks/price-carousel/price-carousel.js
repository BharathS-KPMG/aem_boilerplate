/**
 * Price Carousel block — a centred title with previous/next arrows (desktop)
 * and a horizontally scrolling row of image cards. Each card shows an image
 * (the price, e.g. "UNDER ₹3000", is part of the image) and a "Shop now"
 * button below. Mobile shows pagination dots instead of arrows.
 *
 * Authoring contract (DA, everything authored, nothing hard-coded).
 * Labelled rows: the first cell names the row (case-insensitive):
 *   | Price Carousel |                 |                         |
 *   | Title          | Browse by Price |                         |
 *   | Previous Label | Previous (optional, arrow button name)    |
 *   | Next Label     | Next (optional, arrow button name)        |
 *   | Slide Label    | Go to slide (optional, dot name prefix)   |
 *   | Link Target    | Same Tab / New Tab (optional, default same tab) |
 *   | New Tab Label  | opens in a new tab (optional, screen readers) |
 *   | Band Colour    | #232426 (optional)                        |
 *   | Bottom Colour  | #FFFFFF (optional)                        |
 *   | Desktop Image  | image (shown from 900px)                  |
 *   | Mobile Image   | image (optional, shown below 900px)       |
 *   | Button         | link "Shop now" (or text | URL) | New Tab (optional) |
 * A Desktop Image row starts a new card; the Mobile Image and Button rows after it belong to it.
 * (A "Card | desktop image | mobile image" row also still works.)
 */

const BLOCK = 'price-carousel';

/* Row labels authors type in the first cell (case-insensitive) */
const ROW_LABELS = {
  title: 'title',
  heading: 'title',
  'previous label': 'previousLabel',
  'prev label': 'previousLabel',
  'next label': 'nextLabel',
  'slide label': 'slideLabel',
  'dot label': 'slideLabel',
  'link target': 'linkTarget',
  'open in new tab': 'linkTarget',
  'new tab': 'linkTarget',
  'new tab label': 'newTabLabel',
  'band colour': 'bandColour',
  'band color': 'bandColour',
  'top colour': 'bandColour',
  'top color': 'bandColour',
  'bottom colour': 'bottomColour',
  'bottom color': 'bottomColour',
  card: 'card',
  'desktop image': 'desktopImage',
  'mobile image': 'mobileImage',
  button: 'button',
  link: 'button',
  cta: 'button',
};

/* accessible names for the arrow buttons, used only when not authored */
const FALLBACK_PREVIOUS = 'Previous';
const FALLBACK_NEXT = 'Next';

const ICON_ARROW = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const DESKTOP_MEDIA = '(min-width: 900px)';

/**
 * Reads an authored link-target setting.
 * @param {string} text e.g. "New Tab", "Yes", "Same Tab", "No"
 * @returns {boolean|null} true = new tab, false = same tab, null = not a target setting
 */
function parseNewTab(text) {
  const value = (text || '').trim().toLowerCase();
  if (/^(yes|true|on|new|new tab|new window|_blank|blank)$/.test(value)) return true;
  if (/^(no|false|off|same|same tab|same window|_self|self)$/.test(value)) return false;
  return null;
}

/**
 * Returns the row type when the first cell is a known label, and removes that cell.
 * @param {Element} row
 * @returns {string|null}
 */
function takeRowLabel(row) {
  const [first, ...rest] = [...row.children];
  if (!first || !rest.length || first.querySelector('img')) return null;
  const type = ROW_LABELS[first.textContent.trim().toLowerCase().replace(/\s+/g, ' ')];
  if (type) first.remove();
  return type || null;
}

function cellText(cell) {
  return cell ? cell.textContent.trim().replace(/\s+/g, ' ') : '';
}

/** Text of all remaining cells of a row, joined. */
function rowText(row) {
  return [...row.children].map(cellText).filter(Boolean).join(' ');
}

const isUrl = (text) => /^https?:\/\/\S+$/i.test(text);

/** An authored colour when the browser understands it (#232426, black, rgb(...)), else null. */
function parseColour(value) {
  const text = (value || '').trim();
  if (!text) return null;
  const hex = /^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(text) ? `#${text}` : text;
  return window.CSS && CSS.supports('color', hex) ? hex : null;
}

/**
 * Whether a CSS colour is light (so dark text reads best on it).
 * @param {string} colour any CSS colour the browser accepts
 * @param {Element} host an element in the page, used to resolve the colour
 */
function isLight(colour, host) {
  const probe = document.createElement('span');
  probe.style.color = colour;
  host.append(probe);
  const [r, g, b] = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g).map(Number);
  probe.remove();
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) > 0.4;
}

/**
 * Reads a Button row: a link (text = button text), or button text | URL,
 * plus an optional "New Tab" / "Same Tab" cell for this card.
 */
function readButton(row) {
  const cells = [...row.children];
  const anchor = row.querySelector('a[href]');
  const targetIndex = cells.findIndex((cell) => parseNewTab(cellText(cell)) !== null);
  const newTab = targetIndex >= 0 ? parseNewTab(cellText(cells[targetIndex])) : null;
  const textCell = cells.find((cell, i) => i !== targetIndex
    && !cell.querySelector('a[href]')
    && cellText(cell)
    && !isUrl(cellText(cell)));
  let href = anchor ? anchor.getAttribute('href') : '';
  let text = '';
  if (anchor) {
    const anchorText = cellText(anchor);
    if (anchorText && anchorText !== href && !isUrl(anchorText)) text = anchorText;
  } else {
    const urlCell = cells.find((cell) => isUrl(cellText(cell)));
    if (urlCell) href = cellText(urlCell);
  }
  if (!text && textCell) text = cellText(textCell);
  return { href, text: text || href, newTab };
}

function create(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = `${BLOCK}-${className}`;
  if (html) node.innerHTML = html;
  return node;
}

/** Same-origin raster images can be requested resized; others keep their src (GIF/SVG too). */
function isOptimisable(url) {
  return url.origin === window.location.origin && !/\.(svg|gif)$/i.test(url.pathname);
}

/**
 * Appends the <source> elements for one authored image.
 * @param {HTMLPictureElement} picture
 * @param {HTMLImageElement} img authored image
 * @param {string|null} media media query, null for the default source
 * @param {number} width requested width of optimised renditions
 */
function appendSources(picture, img, media, width) {
  const url = new URL(img.getAttribute('src'), window.location.href);
  const sources = isOptimisable(url)
    ? [
      { type: 'image/webp', srcset: `${url.pathname}?width=${width}&format=webply&optimize=medium` },
      { srcset: `${url.pathname}?width=${width}&format=jpg&optimize=medium` },
    ]
    : [{ srcset: img.src }];
  sources.forEach(({ type, srcset }) => {
    const source = document.createElement('source');
    if (type) source.type = type;
    if (media) source.media = media;
    source.srcset = srcset;
    ['width', 'height'].forEach((attr) => {
      if (img.getAttribute(attr)) source.setAttribute(attr, img.getAttribute(attr));
    });
    picture.append(source);
  });
}

/**
 * Card picture: desktop image from 900px, mobile image below that.
 * One image is used for both when only one is authored.
 */
function buildImage(desktopImg, mobileImg, fallbackAlt) {
  const picture = document.createElement('picture');
  if (desktopImg !== mobileImg) appendSources(picture, desktopImg, DESKTOP_MEDIA, 900);
  appendSources(picture, mobileImg, null, desktopImg === mobileImg ? 900 : 600);

  const url = new URL(mobileImg.getAttribute('src'), window.location.href);
  const image = document.createElement('img');
  image.src = isOptimisable(url) ? `${url.pathname}?width=600&format=jpg&optimize=medium` : mobileImg.src;
  image.alt = desktopImg.getAttribute('alt') || mobileImg.getAttribute('alt') || fallbackAlt;
  image.loading = 'lazy';
  ['width', 'height'].forEach((attr) => {
    const value = mobileImg.getAttribute(attr) || desktopImg.getAttribute(attr);
    if (value) image.setAttribute(attr, value);
  });
  picture.append(image);
  return picture;
}

function buildCard(data, settings) {
  const card = create('li', 'card');
  const desktopImg = data.image || data.mobileImage;
  const mobileImg = data.mobileImage || data.image;
  // the price is part of the image: its alt text (e.g. "Under ₹3000") names the card
  const name = (desktopImg && desktopImg.getAttribute('alt'))
    || (mobileImg && mobileImg.getAttribute('alt')) || '';

  const media = create('div', 'card-media');
  if (desktopImg) media.append(buildImage(desktopImg, mobileImg, name));
  card.append(media);

  const { button } = data;
  if (button && button.href) {
    const link = create('a', 'button');
    link.href = button.href;
    const text = create('span', 'button-text');
    text.textContent = button.text;
    link.append(text, create('span', 'button-icon', ICON_ARROW));
    // "Shop now" repeats on every card: screen readers also hear the image's alt text
    if (name) {
      const context = create('span', 'sr-only');
      context.textContent = `, ${name}`;
      link.append(context);
    }
    // same tab by default; new tab when the card or the block says so
    const newTab = button.newTab ?? settings.newTab;
    if (newTab) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      if (settings.newTabLabel) {
        const hint = create('span', 'sr-only');
        hint.textContent = ` (${settings.newTabLabel})`;
        link.append(hint);
      }
    }
    card.append(link);
  }
  card.dataset.name = name;
  return card;
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Arrows (desktop) and dots (mobile) share the track's scroll position. */
function setupControls(track, previous, next, dots) {
  const cards = [...track.querySelectorAll(`.${BLOCK}-card`)];
  const step = () => {
    if (!cards.length) return track.clientWidth;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    return cards[0].getBoundingClientRect().width + gap;
  };
  const maxScroll = () => track.scrollWidth - track.clientWidth;
  const scrollToLeft = (left) => {
    track.scrollTo({ left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };
  const update = () => {
    const max = maxScroll();
    previous.disabled = track.scrollLeft <= 1;
    next.disabled = track.scrollLeft >= max - 1;
    let active = Math.round(track.scrollLeft / step());
    if (track.scrollLeft >= max - 1) active = cards.length - 1;
    active = Math.max(0, Math.min(cards.length - 1, active));
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === active);
      if (i === active) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  };
  previous.addEventListener('click', () => scrollToLeft(track.scrollLeft - step()));
  next.addEventListener('click', () => scrollToLeft(track.scrollLeft + step()));
  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => scrollToLeft(Math.min(i * step(), maxScroll())));
  });
  track.addEventListener('scroll', update, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(update).observe(track);
  window.addEventListener('resize', update, { passive: true });
  update();
}

/**
 * Passes the visible page width (without the vertical scrollbar, unlike 100vw)
 * to CSS, so the full-width block ends exactly at the screen edge.
 */
let viewportTracked = false;
function trackViewportWidth() {
  if (viewportTracked) return; // once per page, however many carousels
  viewportTracked = true;
  const root = document.documentElement;
  const update = () => root.style.setProperty(`--${BLOCK}-viewport`, `${root.clientWidth}px`);
  update();
  window.addEventListener('resize', update, { passive: true });
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  trackViewportWidth();
  const settings = {};
  const cards = [];
  let current = null;
  const currentCard = () => {
    if (!current) {
      current = { image: null, mobileImage: null };
      cards.push(current);
    }
    return current;
  };

  [...block.children].forEach((row) => {
    const type = takeRowLabel(row);
    const [img, secondImg = null] = row.querySelectorAll('img');
    if (type === 'desktopImage') {
      // a Desktop Image row starts a new card (unless the card has only a mobile image so far)
      if (!current || current.image) {
        current = { image: null, mobileImage: null };
        cards.push(current);
      }
      current.image = img || null;
    } else if (type === 'mobileImage') {
      if (!current || current.mobileImage) {
        current = { image: null, mobileImage: null };
        cards.push(current);
      }
      current.mobileImage = img || null;
    } else if (type === 'card' || (!type && img)) {
      // Card row: desktop image, then an optional separate mobile image
      current = { image: img || null, mobileImage: secondImg };
      cards.push(current);
    } else if (type === 'button') {
      currentCard().button = readButton(row);
    } else if (type) {
      settings[type] = rowText(row);
    }
  });

  const band = parseColour(settings.bandColour);
  const bottom = parseColour(settings.bottomColour);
  if (band) {
    block.style.setProperty(`--${BLOCK}-band`, band);
    // title and arrows: dark on a light band, white on a dark one
    block.style.setProperty(`--${BLOCK}-text`, isLight(band, block) ? '#000' : '#fff');
  }
  if (bottom) {
    block.style.setProperty(`--${BLOCK}-bottom`, bottom);
    // buttons and dots sit on the bottom colour
    const light = isLight(bottom, block);
    block.style.setProperty(`--${BLOCK}-bottom-text`, light ? '#000' : '#fff');
    block.style.setProperty(`--${BLOCK}-dot`, light ? '#c9cacc' : '#fff');
    block.style.setProperty(`--${BLOCK}-dot-active`, light ? '#232426' : '#5c5e61');
  }

  const header = create('div', 'header');
  if (settings.title) {
    const title = create('h2', 'title');
    title.textContent = settings.title;
    header.append(title);
  }

  const controls = create('div', 'controls');
  const previous = create('button', 'arrow', ICON_ARROW);
  previous.classList.add(`${BLOCK}-arrow-previous`);
  previous.type = 'button';
  previous.setAttribute('aria-label', settings.previousLabel || FALLBACK_PREVIOUS);
  const next = create('button', 'arrow', ICON_ARROW);
  next.classList.add(`${BLOCK}-arrow-next`);
  next.type = 'button';
  next.setAttribute('aria-label', settings.nextLabel || FALLBACK_NEXT);
  controls.append(previous, next);
  header.append(controls);

  const cardSettings = {
    newTab: parseNewTab(settings.linkTarget) === true,
    newTabLabel: settings.newTabLabel,
  };
  const track = create('ul', 'track');
  track.setAttribute('tabindex', '0');
  if (settings.title) track.setAttribute('aria-label', settings.title);
  const cardNodes = cards.map((data) => buildCard(data, cardSettings));
  track.append(...cardNodes);

  const dotList = create('div', 'dots');
  if (settings.title) dotList.setAttribute('aria-label', settings.title);
  dotList.setAttribute('role', 'group');
  const dots = cardNodes.map((card, i) => {
    const dot = create('button', 'dot');
    dot.type = 'button';
    const label = settings.slideLabel
      ? `${settings.slideLabel} ${i + 1}`
      : card.dataset.name || `${i + 1}`;
    dot.setAttribute('aria-label', label);
    delete card.dataset.name;
    dotList.append(dot);
    return dot;
  });
  if (dots.length < 2) dotList.hidden = true;

  block.replaceChildren(header, track, dotList);
  setupControls(track, previous, next, dots);
}
