import { createOptimizedPicture } from '../../scripts/aem.js';
import { pushAdobeProductTitleClick, pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';

// author label rows in the DA table; removed before rendering
const LABELS = [
  'Section title',
  'Section description',
  'Room image',
  'Colours applied (Name, Code, #HEX, URL)',
  'Image description',
];

function removeLabelRows(block, labels) {
  const norm = (t) => t.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const known = new Set(labels.map(norm));
  [...block.children].forEach((row) => {
    if (row.querySelector('picture, img')) return;
    const texts = [...row.children].map((cell) => cell.textContent.trim()).filter(Boolean);
    if (texts.length && texts.every((t) => known.has(norm(t)))) row.remove();
  });
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function optimize(picture, breakpoints) {
  const img = picture?.querySelector('img');
  if (!img) return null;
  // only media bus (same-origin) images support the optimization params
  if (new URL(img.src, window.location.href).origin !== window.location.origin) return picture;
  return createOptimizedPicture(img.src, img.alt, false, breakpoints);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function buildHeader(cells) {
  const header = el('div', 'lookbook-carousel-header');
  cells.forEach((cell, i) => {
    const heading = cell.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading) {
      heading.classList.add('lookbook-carousel-title');
      header.append(...cell.childNodes);
      return;
    }
    const node = el(i === 0 ? 'h2' : 'p', i === 0 ? 'lookbook-carousel-title' : 'lookbook-carousel-desc', cell.textContent.trim());
    header.append(node);
  });
  header.querySelectorAll(':scope > p:not([class])').forEach((p) => p.classList.add('lookbook-carousel-desc'));
  return header.children.length ? header : null;
}

const URL_TEXT = /^(https?:\/\/|\/)\S+$/i;

/**
 * Parses one "colour applied" list item:
 *   Name, Code, #HEX, URL        – URL is its own part (plain text or a link)
 * A swatch image can replace #HEX. The older form "[Name](URL), Code, #HEX"
 * (name linked to the shade page) is still supported.
 */
function parseColour(li) {
  const swatchImg = li.querySelector('img');
  let rest = li.textContent;
  let name = '';
  let url = '';

  [...li.querySelectorAll('a')].forEach((a) => {
    const text = a.textContent.trim();
    if (URL_TEXT.test(text)) {
      url = url || a.href;
      rest = rest.replace(a.textContent, '');
    } else if (text && !name) {
      // legacy: linked name
      name = text;
      url = url || a.href;
      rest = rest.replace(a.textContent, '');
    }
  });

  const parts = rest.split(/[,|]/).map((part) => part.trim()).filter(Boolean);
  const urlPart = parts.find((part) => URL_TEXT.test(part));
  if (urlPart && !url) url = new URL(urlPart, window.location.href).href;
  const colour = parts.find((part) => HEX.test(part));
  const others = parts.filter((part) => part !== colour && part !== urlPart);
  if (!name) name = others.shift() || '';
  const code = others.join(' ');
  return {
    name, code, colour, url, swatch: swatchImg?.src,
  };
}

function buildColour({
  name, code, colour, url, swatch,
}) {
  const item = el('li', 'lookbook-carousel-colour');
  const wrap = el(url ? 'a' : 'div', 'lookbook-carousel-colour-link');
  if (url) wrap.href = url;

  const chip = el('span', 'lookbook-carousel-chip');
  chip.setAttribute('aria-hidden', 'true');
  if (colour) chip.style.backgroundColor = colour;
  else if (swatch) chip.style.backgroundImage = `url("${swatch}")`;
  wrap.append(chip);

  if (name) wrap.append(el('span', 'lookbook-carousel-colour-name', name));
  if (code) wrap.append(el('span', 'lookbook-carousel-colour-code', code));
  if (url) {
    wrap.addEventListener('click', () => {
      pushAdobeProductTitleClick({
        event: 'look_book_inspiration_carousel',
        productName: name,
        productUrl: url,
        productSku: code,
        parentTitle: document.querySelector('.lookbook-carousel-title')?.textContent?.trim() || '',
      });
    });
  }
  item.append(wrap);
  return item;
}

function buildSlide(row) {
  const cells = [...row.children];
  const imageCell = cells.find((cell) => cell.querySelector('picture') && !cell.querySelector('li'));
  const coloursCell = cells.find((cell) => cell.querySelector('ul, ol'));
  const descCell = cells.find((cell) => ![imageCell, coloursCell].includes(cell)
    && cell.textContent.trim());

  const slide = el('li', 'lookbook-carousel-slide swiper-slide');

  const picture = optimize(imageCell?.querySelector('picture'), [{ width: '1100' }]);
  if (picture) {
    const media = el('div', 'lookbook-carousel-media');
    media.append(picture);
    slide.append(media);
  }

  const desc = descCell?.textContent.trim();
  if (desc) slide.append(el('p', 'lookbook-carousel-slide-desc', desc));

  const items = [...(coloursCell?.querySelectorAll('li') || [])]
    .map(parseColour)
    .filter((c) => c.name || c.code || c.colour || c.swatch);
  if (items.length) {
    const colours = el('ul', 'lookbook-carousel-colours');
    colours.setAttribute('aria-label', 'Colours applied');
    items.forEach((c) => colours.append(buildColour(c)));
    slide.append(colours);
  }

  return slide;
}

function buildNav() {
  const nav = el('div', 'lookbook-carousel-nav');
  const prev = el('button', 'lookbook-carousel-prev');
  const next = el('button', 'lookbook-carousel-next');

  prev.addEventListener('click', () => {
    pushAdobeCtaClickEvent({
      event: 'Navigation',
      selectedValue: 'Navigation Action : Previous',
      title: document.querySelector('.lookbook-carousel-title')?.textContent?.trim() || '',
    });
  });

  next.addEventListener('click', () => {
    pushAdobeCtaClickEvent({
      event: 'Navigation',
      selectedValue: 'Navigation Action : Next',
      title: document.querySelector('.lookbook-carousel-title')?.textContent?.trim() || '',
    });
  });

  prev.type = 'button';
  next.type = 'button';
  prev.setAttribute('aria-label', 'Previous slide');
  next.setAttribute('aria-label', 'Next slide');
  nav.append(prev, next);
  return nav;
}

function getSwiperClass() {
  if (window.Swiper) return Promise.resolve(window.Swiper);
  if (window.loadSwiper) return window.loadSwiper();
  return Promise.reject(new Error('Swiper loader is not available on window.loadSwiper'));
}

// loops endlessly from 3 slides, i.e. once they overflow the desktop view
const LOOP_FROM = 3;
// Swiper's loop needs more slides than are in view at once (up to 4 on
// tablet), so shorter sets are repeated until there are this many
const LOOP_MIN_SLIDES = 5;

// copies stay clickable (shade links work on partly visible slides) but are
// hidden from assistive tech and skipped in the tab order
function makeCopy(slide) {
  const copy = slide.cloneNode(true);
  copy.classList.add('is-copy');
  copy.setAttribute('aria-hidden', 'true');
  copy.querySelectorAll('a, button').forEach((node) => node.setAttribute('tabindex', '-1'));
  return copy;
}

/**
 * Swiper: 300px slides on mobile/tablet, 2.59 slides in view on desktop.
 * The arrows (desktop only) show once the slides overflow.
 */
async function setupSwiper(block, container, nav) {
  const Swiper = await getSwiperClass();
  const track = container.querySelector('.swiper-wrapper');
  const slides = [...track.children];
  const loop = slides.length >= LOOP_FROM;
  while (loop && track.children.length < LOOP_MIN_SLIDES) track.append(...slides.map(makeCopy));

  const swiper = new Swiper(container, {
    slidesPerView: 'auto',
    spaceBetween: 10,
    loop,
    watchOverflow: true,
    navigation: {
      prevEl: nav.querySelector('.lookbook-carousel-prev'),
      nextEl: nav.querySelector('.lookbook-carousel-next'),
    },
    // keep the list semantics of the ul/li track
    a11y: { slideRole: null },
    breakpoints: {
      992: {
        slidesPerView: 2.59,
        spaceBetween: 20,
      },
    },
  });

  const toggleNav = () => block.classList.toggle('is-scrollable', !swiper.isLocked);
  toggleNav();
  swiper.on('lock unlock', toggleNav);
}

/**
 * lookbook-carousel – migrated from the AEM "lookbook-carousel" component
 * ("get inspired" variant): heading, description and a carousel of room
 * images, each with the colours applied (swatch, name, shade code, link).
 * Runs on Swiper (loaded via window.loadSwiper).
 * Desktop (>= 992px): 2.59 slides in view, prev/next arrows at the top right.
 * Mobile/tablet (< 992px): 300px slides, swipe to scroll, no arrows.
 * Loops endlessly in both directions with 3 or more slides.
 *
 * Authoring (DA table):
 * Label rows (the LABELS above, e.g. "Section title") may sit above any row
 * to guide authors; they are removed before rendering.
 *
 * | lookbook-carousel |                     |                         |
 * | ---------------- | ------------------- | ----------------------- |
 * | Title            | Description         |                         |
 * | Image            | Colours applied     | Image description       |
 * | ...one row per slide...                                          |
 *
 * - Row 1: block name only ("lookbook-carousel").
 * - Row 2 – Header (optional, no image):
 *   - Column 1 – Title, rendered as an h2, e.g. "Inspiring ideas for your
 *     home". AEM dialog: title
 *   - Column 2 – Description (optional), e.g. "Find decor inspiration...".
 *     AEM dialog: subTitle
 * - Rows 3+ – Slides (one row per slide). AEM: carouselList entries.
 *   - Column 1 – Image (required): the room image, landscape (about 3:2).
 *     Its alt text is used for accessibility. AEM: lookbookImageModel
 *   - Column 2 – Colours applied (optional): a bulleted list, one colour
 *     per bullet, four parts separated by commas:
 *       Name, Code, #HEX, URL
 *     e.g. "Valley Flower, 8530, #E3CCAE,
 *           https://www.asianpaints.com/colour-catalogue/brown-wall-colours/valley-flower.html"
 *     - Name: shade name (AEM: productName)
 *     - Code: shade code (AEM: productCode)
 *     - #HEX: swatch colour (AEM: bgColour). For textures/products, put a
 *       small swatch image in the bullet instead (AEM: swatchImagePath).
 *     - URL: page the swatch opens when clicked (AEM: productUrl). Plain
 *       text or a link; leave it out for a non-clickable swatch.
 *   - Column 3 – Image description (optional): short text shown above the
 *     colours. AEM: imageDescription
 * - Add or remove slide rows to change the number of slides.
 *
 * @param {Element} block
 */
export default function decorate(block) {
  removeLabelRows(block, LABELS);
  const rows = [...block.children].filter((row) => row.textContent.trim() || row.querySelector('picture'));

  let header;
  if (rows[0] && !rows[0].querySelector('picture')) {
    header = buildHeader([...rows.shift().children].filter((cell) => cell.textContent.trim()));
  }

  const track = el('ul', 'lookbook-carousel-track swiper-wrapper');
  track.setAttribute('aria-label', header?.querySelector('.lookbook-carousel-title')?.textContent.trim() || 'Inspiration');
  track.append(...rows.map(buildSlide));

  const container = el('div', 'lookbook-carousel-swiper swiper');
  container.append(track);

  const nav = buildNav();
  const viewport = el('div', 'lookbook-carousel-viewport');
  viewport.append(container, nav);

  block.replaceChildren(...(header ? [header] : []), viewport);

  // not awaited: the slides render right away, Swiper takes over once loaded
  setupSwiper(block, container, nav).catch((error) => {
    // eslint-disable-next-line no-console
    console.error('lookbook-carousel: Swiper failed to load', error);
  });
}
