/**
 * Colour Combination Carousel block — a title, subtitle and a Swiper carousel
 * of room cards. Each card shows a room image and a coloured
 * panel listing the shades used in the room; clicking a shade swatch selects
 * it and updates the panel colour, shade name, shade code and details link.
 *
 * Authoring contract (DA, all content authored, nothing hard-coded).
 * Labelled rows: the first cell names the row (case-insensitive):
 *   | Colour Combination Carousel |         |              |      |      |
 *   | Title          | Colour combination ideas for your home |  |  |    |
 *   | Subtitle       | Watch every stage of your home transformation |  |
 *   | Shades Label   | Shades used in room                    |  |  |    |
 *   | Link Label     | Shade details (optional)               |  |  |    |
 *   | Link Target    | New Tab (optional; default: same tab)  |  |  |    |
 *   | New Tab Label  | opens in a new tab (optional, read by screen readers) |
 *   | Previous Label | Previous (optional, arrow button name) |  |  |    |
 *   | Next Label     | Next (optional, arrow button name)     |  |  |    |
 *   | Card           | desktop image | mobile image (optional) |  |  |
 *   | Shade          | #A85A3B | Dessert Love - N | K212 | link | New Tab (optional) |
 * A Card row starts a new card; the Shade rows after it belong to that card.
 * The first shade of a card is selected initially.
 */
import { pushAdobeCtaClickEvent, pushAdobeProductTitleClick } from '../../scripts/analytics_1.js';

const BLOCK = 'colour-combination-carousel';

/* Row labels authors type in the first cell (case-insensitive) */
const ROW_LABELS = {
  title: 'title',
  heading: 'title',
  subtitle: 'subtitle',
  'sub title': 'subtitle',
  description: 'subtitle',
  'shades label': 'shadesLabel',
  'shade label': 'shadesLabel',
  'link label': 'linkLabel',
  'link target': 'linkTarget',
  'open in new tab': 'linkTarget',
  'open links in new tab': 'linkTarget',
  'new tab': 'linkTarget',
  'new tab label': 'newTabLabel',
  'previous label': 'previousLabel',
  'prev label': 'previousLabel',
  'next label': 'nextLabel',
  card: 'card',
  room: 'card',
  shade: 'shade',
  colour: 'shade',
  color: 'shade',
};

/* accessible names for the arrow buttons, used only when not authored */
const FALLBACK_PREVIOUS = 'Previous';
const FALLBACK_NEXT = 'Next';

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

const ICON_ARROW = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M6 12.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_EXTERNAL = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false"><path d="M4.5 11.5l7-7M5.5 4.5h6v6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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

/**
 * Parses an authored colour (#RGB, #RRGGBB, with or without the #).
 * @param {string} value
 * @returns {string|null} normalised #rrggbb
 */
function parseHex(value) {
  const match = (value || '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  let hex = match[1].toLowerCase();
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
  return `#${hex}`;
}

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * true when dark text reads better than white on the colour.
 * The threshold favours white text on mid tones (terracotta, taupe), as in the design.
 */
function isLight(hex) {
  return luminance(hex) > 0.4;
}

/** Applies a colour and its matching light/dark text class to an element. */
function applyColour(target, hex, property) {
  target.classList.remove('is-light', 'is-dark');
  if (!hex) {
    target.style.removeProperty(property);
    return;
  }
  target.style.setProperty(property, hex);
  target.classList.add(isLight(hex) ? 'is-light' : 'is-dark');
}

/**
 * Reads a Shade row: colour | name | code | link (cells in that order).
 * The colour cell may hold the hex as text; a link may be a real link or a URL as text.
 */
function readShade(row) {
  const cells = [...row.children];
  const anchor = row.querySelector('a[href]');
  const colourIndex = cells.findIndex((cell) => parseHex(cellText(cell)));
  const colour = colourIndex >= 0 ? parseHex(cellText(cells[colourIndex])) : null;
  // optional cell after the link: "New Tab" / "Same Tab" for this shade's link
  const targetIndex = cells.findIndex((cell, i) => i !== colourIndex
    && parseNewTab(cellText(cell)) !== null);
  const newTab = targetIndex >= 0 ? parseNewTab(cellText(cells[targetIndex])) : null;
  const textCells = cells.filter((cell, i) => i !== colourIndex
    && i !== targetIndex
    && !cell.querySelector('a[href]')
    && !/^https?:\/\//i.test(cellText(cell))
    && cellText(cell));
  let href = anchor ? anchor.getAttribute('href') : '';
  let linkText = '';
  if (anchor) {
    const text = cellText(anchor);
    if (text && text !== href && !/^https?:\/\//i.test(text)) linkText = text;
  } else {
    const urlCell = cells.find((cell) => /^https?:\/\/\S+$/i.test(cellText(cell)));
    if (urlCell) href = cellText(urlCell);
  }
  return {
    colour,
    name: cellText(textCells[0]),
    code: cellText(textCells[1]),
    href,
    linkText,
    newTab,
  };
}

function create(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = `${BLOCK}-${className}`;
  if (html) node.innerHTML = html;
  return node;
}

const DESKTOP_MEDIA = '(min-width: 900px)';

/** Same-origin raster images can be requested resized; others keep their src (GIF/SVG too). */
function isOptimisable(url) {
  return url.origin === window.location.origin && !/\.(svg|gif)$/i.test(url.pathname);
}

/**
 * Appends the <source> elements for one authored image.
 * @param {HTMLPictureElement} picture
 * @param {HTMLImageElement} img authored image
 * @param {string|null} media media query, null for the default source
 */
function appendSources(picture, img, media) {
  const url = new URL(img.getAttribute('src'), window.location.href);
  const sources = isOptimisable(url)
    ? [
      { type: 'image/webp', srcset: `${url.pathname}?width=750&format=webply&optimize=medium` },
      { srcset: `${url.pathname}?width=750&format=jpg&optimize=medium` },
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
 * @param {HTMLImageElement} desktopImg
 * @param {HTMLImageElement} mobileImg
 */
function buildImage(desktopImg, mobileImg) {
  const picture = document.createElement('picture');
  if (desktopImg !== mobileImg) appendSources(picture, desktopImg, DESKTOP_MEDIA);
  appendSources(picture, mobileImg, null);

  const url = new URL(mobileImg.getAttribute('src'), window.location.href);
  const image = document.createElement('img');
  image.src = isOptimisable(url) ? `${url.pathname}?width=750&format=jpg&optimize=medium` : mobileImg.src;
  image.alt = desktopImg.alt || mobileImg.alt || '';
  image.loading = 'lazy';
  ['width', 'height'].forEach((attr) => {
    const value = mobileImg.getAttribute(attr) || desktopImg.getAttribute(attr);
    if (value) image.setAttribute(attr, value);
  });
  picture.append(image);
  return picture;
}

/** Updates a card's panel to the selected shade. */
function selectShade(card, index) {
  const {
    shades, panel, swatches, name, code, link,
  } = card;
  const shade = shades[index];
  swatches.forEach((swatch, i) => {
    swatch.setAttribute('aria-pressed', i === index ? 'true' : 'false');
    swatch.classList.toggle('is-selected', i === index);
  });
  applyColour(panel, shade.colour, `--${BLOCK}-panel-bg`);
  name.textContent = shade.name;
  name.hidden = !shade.name;
  code.textContent = shade.code;
  code.hidden = !shade.code;
  if (shade.href) {
    link.href = shade.href;
    link.querySelector(`.${BLOCK}-link-text`).textContent = shade.linkText || card.linkLabel || shade.name || shade.href;
    // same tab by default; new tab when the shade or the block says so
    const newTab = shade.newTab ?? card.newTab;
    if (newTab) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    } else {
      link.removeAttribute('target');
      link.removeAttribute('rel');
    }
    const hint = link.querySelector(`.${BLOCK}-link-hint`);
    if (hint) hint.hidden = !newTab;
    link.hidden = false;
  } else {
    link.removeAttribute('href');
    link.hidden = true;
  }
}

function buildCard(data, labels) {
  const card = create('div', 'card');
  card.classList.add('swiper-slide');
  if (data.image) {
    const media = create('div', 'card-media');
    media.append(buildImage(data.image, data.mobileImage || data.image));
    card.append(media);
  }

  const panel = create('div', 'card-panel');
  if (labels.shadesLabel) {
    const label = create('p', 'shades-label');
    label.textContent = labels.shadesLabel;
    panel.append(label);
  }

  const swatchList = create('div', 'swatches');
  swatchList.setAttribute('role', 'group');
  if (labels.shadesLabel) swatchList.setAttribute('aria-label', labels.shadesLabel);

  const state = {
    shades: data.shades,
    panel,
    swatches: [],
    linkLabel: labels.linkLabel,
    newTab: parseNewTab(labels.linkTarget) === true,
  };

  data.shades.forEach((shade, i) => {
    const swatch = create('button', 'swatch');
    swatch.type = 'button';
    swatch.setAttribute('aria-label', [shade.name, shade.code].filter(Boolean).join(', ') || shade.colour || '');
    applyColour(swatch, shade.colour, `--${BLOCK}-swatch-bg`);
    swatch.append(create('span', 'swatch-check', ICON_CHECK));
    if (shade.code) {
      const swatchCode = create('span', 'swatch-code');
      swatchCode.textContent = shade.code;
      swatchCode.setAttribute('aria-hidden', 'true');
      swatch.append(swatchCode);
    }
    swatch.addEventListener('click', () => {
      pushAdobeProductTitleClick({
        event: 'natural_wood_shade_click',
        productName: shade.name || '',
        productSku: shade.code || '',
        title: labels.shadesLabel || '',
      });
      selectShade(state, i);
    });
    state.swatches.push(swatch);
    swatchList.append(swatch);
  });
  panel.append(swatchList);

  const footer = create('div', 'card-footer');
  const details = create('p', 'shade');
  details.setAttribute('aria-live', 'polite');
  state.name = create('span', 'shade-name');
  state.code = create('span', 'shade-code');
  details.append(state.name, state.code);
  state.link = create('a', 'link');
  state.link.append(create('span', 'link-text'), create('span', 'link-icon', ICON_EXTERNAL));
  if (labels.newTabLabel) {
    // authored screen-reader hint, read only when the link opens in a new tab
    const hint = create('span', 'link-hint');
    hint.textContent = ` (${labels.newTabLabel})`;
    hint.hidden = true;
    state.link.append(hint);
  }
  footer.append(details, state.link);
  state.link.addEventListener('click', () => {
    pushAdobeCtaClickEvent({
      event: 'cta_link_text',
      cta: state.link.querySelector(`.${BLOCK}-link-text`)?.textContent.trim() || '',
      parentTitle: labels.title || '',
      destinationUrl: state.link.href,
    });
  });
  panel.append(footer);

  card.append(panel);
  if (data.shades.length) selectShade(state, 0);
  else state.link.hidden = true;
  return card;
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/*
 * Cards in view and the gap between them, by window width. Must match the
 * --colour-combination-carousel-visible / -gap values in the CSS, which lay the
 * cards out the same way before Swiper loads (no shift when it takes over).
 */
const SLIDES = { slidesPerView: 1.12, spaceBetween: 12 };
const BREAKPOINTS = {
  600: { slidesPerView: 2.15, spaceBetween: 16 },
  900: { slidesPerView: 3.15, spaceBetween: 20 },
  1200: { slidesPerView: 4.15, spaceBetween: 20 },
};

async function getSwiperClass() {
  if (window.Swiper) return window.Swiper;
  if (window.loadSwiper) return window.loadSwiper();
  // eslint-disable-next-line no-console
  console.warn('Swiper loader is not available on window.loadSwiper');
  return null;
}

/**
 * Starts Swiper once the block nears the viewport, so its download and init
 * stay out of the page's LCP window (same as color-gallery).
 */
function setupCarousel(block, swiperEl, previous, next, labels) {
  const trackNavigation = (direction) => {
    pushAdobeCtaClickEvent({
      selectedValue: `Navigation Action : ${direction}`,
      title: labels.title || '',
      event: 'Navigation',
    });
  };
  previous.addEventListener('click', () => trackNavigation('Previous'));
  next.addEventListener('click', () => trackNavigation('Next'));

  const init = async () => {
    try {
      const Swiper = await getSwiperClass();
      if (!Swiper) return;
      block.colourCombinationSwiper = new Swiper(swiperEl, {
        ...SLIDES,
        breakpoints: BREAKPOINTS,
        speed: prefersReducedMotion() ? 0 : 500,
        watchOverflow: true,
        navigation: { prevEl: previous, nextEl: next },
        // keep the authored arrow names (Swiper's a11y would replace them)
        a11y: {
          prevSlideMessage: previous.getAttribute('aria-label'),
          nextSlideMessage: next.getAttribute('aria-label'),
        },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to initialise colour-combination-carousel Swiper', error);
    }
  };

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      obs.disconnect();
      init();
    }, { rootMargin: '300px 0px' });
    observer.observe(block);
  } else {
    init();
  }
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const labels = {};
  const cards = [];
  let current = null;

  [...block.children].forEach((row) => {
    const type = takeRowLabel(row);
    const [img, mobileImg = null] = row.querySelectorAll('img');
    if (type === 'card' || (!type && img)) {
      // Card row: desktop image, then an optional separate mobile image
      current = { image: img || mobileImg, mobileImage: mobileImg, shades: [] };
      cards.push(current);
    } else if (type === 'shade' || (!type && parseHex(cellText(row.children[0])))) {
      if (!current) {
        current = { image: null, shades: [] };
        cards.push(current);
      }
      current.shades.push(readShade(row));
    } else if (type) {
      labels[type] = rowText(row);
    }
  });

  const header = create('div', 'header');
  if (labels.title) {
    const title = create('h2', 'title');
    title.textContent = labels.title;
    header.append(title);
  }
  if (labels.subtitle) {
    const subtitle = create('p', 'subtitle');
    subtitle.textContent = labels.subtitle;
    header.append(subtitle);
  }

  const swiperEl = create('div', 'swiper');
  swiperEl.classList.add('swiper');
  const track = create('div', 'track');
  track.classList.add('swiper-wrapper');
  cards.forEach((data) => track.append(buildCard(data, labels)));
  swiperEl.append(track);

  const controls = create('div', 'controls');
  const previous = create('button', 'arrow', ICON_ARROW);
  previous.classList.add(`${BLOCK}-arrow-previous`);
  previous.type = 'button';
  previous.disabled = true; // the carousel starts at the first card
  previous.setAttribute('aria-label', labels.previousLabel || FALLBACK_PREVIOUS);
  const next = create('button', 'arrow', ICON_ARROW);
  next.classList.add(`${BLOCK}-arrow-next`);
  next.type = 'button';
  next.setAttribute('aria-label', labels.nextLabel || FALLBACK_NEXT);
  controls.append(previous, next);
  header.append(controls);

  block.replaceChildren(header, swiperEl);
  if (cards.length) setupCarousel(block, swiperEl, previous, next, labels);
}
