import { createOptimizedPicture } from '../../scripts/aem.js';
import { pushAdobeProductTitleClick, pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';
import initWishlist, { wishlistHeart } from '../../scripts/wishlist.js';

// author label rows in the DA table; removed before rendering
const LABELS = [
  'Section title',
  'View all link',
  'Product image',
  'Product name',
  'Subtitle',
  'Description',
  'Key features',
  'Product link',
  'Product code',
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

const DEFAULT_FEATURES_LABEL = 'Key features';
const DEFAULT_CTA_LABEL = 'View product';

function optimize(picture) {
  const img = picture?.querySelector('img');
  if (!img) return null;
  // only media bus (same-origin) images support the optimization params
  if (new URL(img.src, window.location.href).origin !== window.location.origin) return picture;
  return createOptimizedPicture(img.src, img.alt, false, [{ width: '460' }]);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const isLinkCell = (cell) => {
  const a = cell.querySelector('a');
  return a && a.textContent.trim() === cell.textContent.trim();
};

function buildHeader(cells) {
  const header = el('div', 'similar-products-header');
  cells.forEach((cell) => {
    if (isLinkCell(cell)) {
      const link = cell.querySelector('a');
      link.className = 'similar-products-viewall';

      link.addEventListener('click', () => {
        pushAdobeCtaClickEvent({
          event: 'cta_link_text',
          cta: link.textContent.trim(),
          parentTitle: header.querySelector('.similar-products-title')?.textContent?.trim() || '',
          destinationUrl: link.href,
        });
      });

      header.append(link);
      return;
    }
    const heading = cell.querySelector('h1, h2, h3, h4, h5, h6')
      || el('h2', '', cell.textContent.trim());
    heading.classList.add('similar-products-title');
    header.prepend(heading);
  });
  return header.children.length ? header : null;
}

function buildCard(row) {
  const cells = [...row.children];
  const imageCell = cells.find((cell) => cell.querySelector('picture'));
  const featuresCell = cells.find((cell) => cell.querySelector('ul, ol'));
  const linkCell = cells.find((cell) => cell !== imageCell && isLinkCell(cell));
  const [nameCell, subtitleCell, descCell] = cells
    .filter((cell) => ![imageCell, featuresCell, linkCell].includes(cell));
  // the code is the 7th column, by position (an empty features cell would shift it otherwise)
  const codeCell = cells[6];

  const name = nameCell?.textContent.trim() || '';
  const card = el('li', 'similar-products-card swiper-slide');

  // product SKU: the authored code (column 7)
  const code = codeCell?.textContent.trim() || '';
  const fav = wishlistHeart({ code, name, className: 'similar-products-fav' });

  // static face: image + name (desktop, before hover)
  const face = el('div', 'similar-products-face');
  const picture = optimize(imageCell?.querySelector('picture'));
  if (picture) {
    const media = el('div', 'similar-products-media');
    media.append(picture);
    face.append(media);
  }
  const faceName = el('p', 'similar-products-face-name', name);
  faceName.setAttribute('aria-hidden', 'true');
  face.append(faceName);

  // details: revealed on hover/focus on desktop, always visible on mobile
  const details = el('div', 'similar-products-details');
  details.append(el('h3', 'similar-products-name', name));
  const subtitle = subtitleCell?.textContent.trim();
  if (subtitle) details.append(el('p', 'similar-products-subtitle', subtitle));
  const desc = descCell?.textContent.trim();
  if (desc) details.append(el('p', 'similar-products-desc', desc));

  const list = featuresCell?.querySelector('ul, ol');
  if (list) {
    const features = el('div', 'similar-products-features');
    const label = [...featuresCell.children]
      .find((child) => child !== list && child.textContent.trim())?.textContent.trim();
    features.append(el('p', 'similar-products-features-label', label || DEFAULT_FEATURES_LABEL));
    const ul = el('ul');
    [...list.children].forEach((li) => ul.append(el('li', '', li.textContent.trim())));
    features.append(ul);
    details.append(features);
  }

  const link = linkCell?.querySelector('a');
  if (link) {
    const cta = el('a', 'similar-products-cta');
    cta.href = link.href;
    const text = link.textContent.trim();
    cta.textContent = !text || text === link.href ? DEFAULT_CTA_LABEL : text;
    cta.setAttribute('aria-label', `${cta.textContent} – ${name}`);
    cta.addEventListener('click', () => {
      pushAdobeProductTitleClick({
        destinationUrl: link.href,
        event: 'similar_product_click',
        productName: name,
        productSKU: '',
        title: name,
      });
    });
    details.append(cta);
  }

  card.append(fav, face, details);
  return card;
}

// desktop shows 3 cards; from 4 the carousel loops endlessly there
const LOOP_FROM = 4;
const DESKTOP_WIDTH = 992;

function buildNav() {
  const nav = el('div', 'similar-products-nav');
  const prev = el('button', 'similar-products-prev');
  const next = el('button', 'similar-products-next');
  const title = () => document.querySelector('.similar-products-title')?.textContent?.trim() || '';
  prev.addEventListener('click', () => {
    pushAdobeCtaClickEvent({
      event: 'Navigation',
      selectedValue: 'Navigation Action : Previous',
      title: title(),
    });
  });
  next.addEventListener('click', () => {
    pushAdobeCtaClickEvent({
      event: 'Navigation',
      selectedValue: 'Navigation Action : Next',
      title: title(),
    });
  });
  prev.type = 'button';
  next.type = 'button';
  prev.setAttribute('aria-label', 'Previous products');
  next.setAttribute('aria-label', 'Next products');
  nav.append(prev, next);
  return { nav, prev, next };
}

/**
 * Swiper carousel. Desktop (>= 992px): 3 slides 16px apart, looping from 4 cards (fewer are
 * centred). Below that: slides keep the widths set in CSS (slidesPerView 'auto'), 8px apart.
 * The arrows only show while there are more cards than fit. Swiper is created again when the
 * viewport crosses 992px, as loop and slidesPerView change there.
 */
async function initCarousel(block, viewport, prev, next) {
  const Swiper = window.Swiper || await window.loadSwiper?.().catch(() => null);
  if (!Swiper) return;
  const count = viewport.querySelectorAll('.similar-products-card').length;
  const desktop = window.matchMedia(`(min-width: ${DESKTOP_WIDTH}px)`);
  const sync = (swiper) => block.classList.toggle('is-scrollable', !swiper.isLocked);

  const create = () => {
    block.similarProductsSwiper?.destroy(true, true);
    const base = {
      speed: 400,
      watchOverflow: true,
      simulateTouch: false,
      navigation: { prevEl: prev, nextEl: next },
      on: {
        init: sync, lock: sync, unlock: sync, resize: sync,
      },
    };
    const swiper = new Swiper(viewport, desktop.matches
      ? {
        ...base,
        slidesPerView: 3,
        spaceBetween: 16,
        loop: count >= LOOP_FROM,
        centerInsufficientSlides: true,
      }
      : { ...base, slidesPerView: 'auto', spaceBetween: 8 });
    block.similarProductsSwiper = swiper;
    sync(swiper);
  };
  create();
  desktop.addEventListener('change', create);
}

/**
 * similar-products – migrated from the AEM "similarproduct" component.
 * Desktop (>= 992px): cards show image + name; details slide up on hover/focus.
 * Mobile/tablet (< 992px): details always visible (image beside key features).
 * Cards slide with Swiper (3 per view desktop, 2 tablet, 1 + peek mobile).
 * On desktop, 4 or more cards loop endlessly in both directions.
 *
 * Authoring (DA table):
 * Label rows (the LABELS above, e.g. "Section title") may sit above any row
 * to guide authors; they are removed before rendering.
 *
 * | similar-products |              |              |              |               |              |
 * | --------------- | ------------ | ------------ | ------------ | ------------- | ------------ |
 * | Section title   | View all link|              |              |               |              |
 * | Product image   | Product name | Subtitle     | Description  | Key features  | Product link |
 * | ...one row per product...                                                                   |
 *
 * - Row 1: block name only ("similar-products").
 * - Row 2 – Header (optional, no image):
 *   - Column 1 – Section title, rendered as an h2 (e.g. "Similar products").
 *     AEM dialog: ./similarTitle
 *   - Column 2 – "View all" link; the link text is the label (e.g. "VIEW ALL").
 *     AEM dialog: ./ctaTitle (label) + ./ctaredirection (URL)
 * - Rows 3+ – Products (one row per card). In AEM these came from ./skuCode.
 *   - Column 1 – Product image (required): packshot, ideally 230 x 273.
 *     Its alt text is used for accessibility.
 *   - Column 2 – Product name (required), e.g. "Royale Shyne Luxury Emulsion".
 *   - Column 3 – Subtitle (optional): short tagline, shown on mobile only,
 *     e.g. "HIGH-SHEEN WITH SUPERIOR STAIN RESISTANCE".
 *   - Column 4 – Description (optional): short product description.
 *   - Column 5 – Key features (optional): a bulleted list. An optional line of
 *     text above the list sets its label; defaults to "Key features".
 *     AEM dialog: ./featureTagTitle (label)
 *   - Column 6 – Product link (required): link to the product page; the link
 *     text is the button label, e.g. "VIEW PRODUCT" (defaults to "View product").
 *     AEM dialog: ./prodctatitle (label)
 * - Add or remove product rows to change the number of cards.
 *
 * Put the block in a section with Section Metadata "Style | light" for the
 * grey background used on the original page.
 *
 *   - Column 7 – Product code / SKU used by the wishlist.
 *
 * The heart button uses the shared wishlist (scripts/wishlist.js): signed in
 * it saves to the profile, signed out it starts the login.
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

  const track = el('ul', 'similar-products-track swiper-wrapper');
  track.setAttribute('aria-label', header?.querySelector('.similar-products-title')?.textContent || 'Products');
  rows.forEach((row) => track.append(buildCard(row)));

  const viewport = el('div', 'similar-products-viewport swiper');
  viewport.append(track);

  block.replaceChildren(...(header ? [header] : []), viewport);
  // arrows sit at the top right, beside "view all"
  const { nav, prev, next } = buildNav();
  (header || viewport).append(nav);
  initWishlist(block);

  // load Swiper once the carousel nears the viewport
  const start = () => initCarousel(block, viewport, prev, next);
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      io.disconnect();
      start();
    }, { rootMargin: '400px 0px' });
    io.observe(block);
  } else {
    start();
  }
}
