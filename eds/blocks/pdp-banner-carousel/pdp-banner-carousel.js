import { createOptimizedPicture, toClassName } from '../../scripts/aem.js';
import { findLcpSection, useUnparsedPictureUrls } from '../../scripts/pre-load-image.js';
import initWishlist, { wishlistHeart } from '../../scripts/wishlist.js';

/*
 * PDP Banner Carousel
 * Full-bleed product banner: background image with eyebrow + title overlay,
 * product packshot overlapping the bottom edge, description below, and
 * wishlist + share icons.
 *
 * Content model — one row per slide:
 *   | background image (desktop) [+ mobile image] | eyebrow + title | packshot | description |
 * followed by optional key/value config rows:
 *   | SKU | 1048 |  | Product ID | 1048 |  | Product Type | products |
 * A single slide renders a static banner; two or more become a carousel.
 *
 * The wishlist heart works through scripts/wishlist.js when a SKU row is authored (the Product
 * Type row sets the wishlist type, default products); without a SKU it is a decorative icon.
 * The share icon is a placeholder only (decorative image, no functionality). The config rows
 * are read so they are not shown as slides.
 *
 * Variants:
 *   no-share    — hide the share icon
 *   no-wishlist — hide the wishlist icon
 */

const DESKTOP_MEDIA = '(min-width: 900px)';
const MOBILE_MEDIA = '(max-width: 899px)';
const CONFIG_KEYS = ['sku', 'product-id', 'product-type'];

const ICONS = {
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m15 18-6-6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 18 6-6-6-6"/></svg>',
};

function getImages(cell) {
  return cell ? [...cell.querySelectorAll('img')] : [];
}

/** Key/value rows (SKU, Product ID, Product Type) — not slides */
function isConfigRow(row) {
  const cells = [...row.children];
  return cells.length === 2
    && !row.querySelector('img')
    && CONFIG_KEYS.includes(toClassName(cells[0].textContent));
}

function configValue(rows, key) {
  const row = rows.find((r) => toClassName(r.children[0].textContent) === key);
  return row?.children[1].textContent.trim() || '';
}

/**
 * The authored mobile image's own proportions (from its width/height attributes), so phones
 * show it uncropped like the source; '' when there is no mobile image or no dimensions.
 */
function mobileRatio(row) {
  const [, mobileImg] = getImages(row?.children[0]);
  const width = Number(mobileImg?.getAttribute('width'));
  const height = Number(mobileImg?.getAttribute('height'));
  return width && height ? `${width} / ${height}` : '';
}

/**
 * The authored desktop image's own proportions, so desktop shows it uncropped like the source
 * (a fixed ratio taller than the image would zoom it in); '' when there are no dimensions.
 */
function desktopRatio(row) {
  const [desktopImg] = getImages(row?.children[0]);
  const width = Number(desktopImg?.getAttribute('width'));
  const height = Number(desktopImg?.getAttribute('height'));
  return width && height ? `${width} / ${height}` : '';
}

/**
 * Builds the background picture. The second authored image (if any) is used
 * as the art-directed mobile crop. Always eager (no lazy loading); the LCP
 * slide also gets high fetch priority and the preloaded URLs.
 */
function buildBanner(desktopImg, mobileImg, lcp) {
  const picture = createOptimizedPicture(
    desktopImg.src,
    desktopImg.alt,
    true,
    [{ media: DESKTOP_MEDIA, width: '2000' }, { width: '1200' }],
  );
  if (mobileImg) {
    const mobile = createOptimizedPicture(
      mobileImg.src,
      desktopImg.alt,
      true,
      [{ media: MOBILE_MEDIA, width: '1200' }, { width: '1200' }],
    );
    picture.prepend(...mobile.querySelectorAll('source[media]'));
  }
  if (lcp) {
    picture.querySelector('img').setAttribute('fetchpriority', 'high');
    // same URLs as preloadPdpBannerCarouselLcp() in pre-load-image.js
    useUnparsedPictureUrls(picture);
  }
  return picture;
}

function buildSlide(row, index, lcp) {
  const [imageCell, textCell, packCell, descCell] = [...row.children];
  const slide = document.createElement('div');
  slide.className = 'pdp-banner-carousel-slide';

  const banner = document.createElement('div');
  banner.className = 'pdp-banner-carousel-banner';
  const [desktopImg, mobileImg] = getImages(imageCell);
  if (desktopImg) banner.append(buildBanner(desktopImg, mobileImg, lcp));

  if (textCell && textCell.children.length) {
    const content = document.createElement('div');
    content.className = 'pdp-banner-carousel-content';
    const heading = textCell.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading) {
      heading.classList.add('pdp-banner-carousel-title');
      // paragraphs authored before the title are the eyebrow
      let prev = heading.previousElementSibling;
      while (prev) {
        if (prev.tagName === 'P') prev.classList.add('pdp-banner-carousel-eyebrow');
        prev = prev.previousElementSibling;
      }
    }
    // move (not clone) authored nodes so the content stays intact
    content.append(...textCell.childNodes);
    banner.append(content);
  }
  slide.append(banner);

  const [packImg] = getImages(packCell);
  if (packImg) {
    const pack = document.createElement('div');
    pack.className = 'pdp-banner-carousel-packshot';
    const picture = createOptimizedPicture(packImg.src, packImg.alt, true, [{ width: '600' }]);
    pack.append(picture);
    slide.append(pack);
  }

  if (descCell && descCell.textContent.trim()) {
    const desc = document.createElement('div');
    desc.className = 'pdp-banner-carousel-description';
    desc.append(...descCell.childNodes);
    slide.append(desc);
  }

  slide.dataset.index = index;
  return slide;
}

function buildIconButton(className, label, icon) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `pdp-banner-carousel-icon-button ${className}`;
  button.setAttribute('aria-label', label);
  button.innerHTML = icon;
  return button;
}

/**
 * Wishlist / share placeholder: the source's icon as a decorative image only
 * (no click behaviour, not focusable, hidden from assistive technology).
 */
function buildPlaceholder(className) {
  const icon = document.createElement('span');
  icon.className = `pdp-banner-carousel-placeholder ${className}`;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

/**
 * Replaces the share placeholder with the share block's button (.share-wrap) once the share
 * block has decorated, wherever it was authored on the page.
 */
function adoptShare(block, placeholder) {
  const find = () => [...document.querySelectorAll('.share-wrap')]
    .find((wrap) => !block.querySelector('.pdp-banner-carousel-actions')?.contains(wrap));
  const swap = () => {
    const wrap = find();
    if (!wrap) return false;
    wrap.classList.remove('share-attached', 'share-top-left', 'share-top-right', 'share-bottom-left', 'share-bottom-right');
    wrap.classList.add('pdp-banner-carousel-share-wrap');
    placeholder.replaceWith(wrap);
    return true;
  };
  if (swap()) return;
  const observer = new MutationObserver(() => {
    if (!placeholder.isConnected || swap()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  // stop watching once the page has finished loading its blocks
  setTimeout(() => observer.disconnect(), 10000);
}

function initCarousel(block, track, slides, tools) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let active = 0;

  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', 'carousel');
  block.setAttribute('aria-label', 'Product banners');

  slides.forEach((slide, i) => {
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', 'slide');
    slide.setAttribute('aria-label', `${i + 1} of ${slides.length}`);
  });

  const prev = buildIconButton('pdp-banner-carousel-prev', 'Previous slide', ICONS.prev);
  const next = buildIconButton('pdp-banner-carousel-next', 'Next slide', ICONS.next);
  tools.prepend(prev, next);

  const dots = document.createElement('div');
  dots.className = 'pdp-banner-carousel-dots';
  const dotButtons = slides.map((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.setAttribute('aria-label', `Show slide ${i + 1}`);
    dots.append(dot);
    return dot;
  });
  block.append(dots);

  const update = (index) => {
    active = index;
    slides.forEach((slide, i) => { slide.inert = i !== index; });
    dotButtons.forEach((dot, i) => {
      if (i === index) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
    prev.disabled = index === 0;
    next.disabled = index === slides.length - 1;
  };

  const goTo = (index) => {
    const target = Math.max(0, Math.min(slides.length - 1, index));
    track.scrollTo({ left: slides[target].offsetLeft, behavior: reduceMotion ? 'auto' : 'smooth' });
    update(target);
  };

  prev.addEventListener('click', () => goTo(active - 1));
  next.addEventListener('click', () => goTo(active + 1));
  dotButtons.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));
  block.addEventListener('keydown', (e) => {
    if (!e.target.closest('.pdp-banner-carousel-dots, .pdp-banner-carousel-prev, .pdp-banner-carousel-next')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(active - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(active + 1); }
  });

  // keep state in sync with touch swipes / scroll-snap
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) update(Number(entry.target.dataset.index));
    });
  }, { root: track, threshold: 0.6 });
  slides.forEach((slide) => observer.observe(slide));

  update(0);
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  // the SKU / Product ID / Product Type rows are not slides
  const slideRows = [...block.children].filter((row) => !isConfigRow(row));
  const configRows = [...block.children].filter(isConfigRow);

  // nothing to show: don't render floating wishlist/share icons
  if (!slideRows.some((row) => row.querySelector('img') || row.textContent.trim())) {
    block.replaceChildren();
    return;
  }

  // likely LCP in the first section, or behind image-less ones (breadcrumb, sr-only H1)
  const main = block.closest('main');
  const section = block.closest('.section');
  const isLcpSection = !section || !section.previousElementSibling
    || (!!main && section === findLcpSection(main));

  // the first slide's mobile image sets the banner height on phones and tablets
  const ratio = mobileRatio(slideRows[0]);
  if (ratio) block.style.setProperty('--banner-ratio-mobile', ratio);
  const wideRatio = desktopRatio(slideRows[0]);
  if (wideRatio) block.style.setProperty('--banner-ratio-desktop', wideRatio);

  const track = document.createElement('div');
  track.className = 'pdp-banner-carousel-slides';
  const slides = slideRows.map((row, i) => buildSlide(row, i, isLcpSection && i === 0));
  track.append(...slides);

  // overlay aligned with the banner area for the wishlist/share icons + carousel controls
  const tools = document.createElement('div');
  tools.className = 'pdp-banner-carousel-tools';

  block.replaceChildren(track, tools);

  // wishlist + share: placeholder icons only, no functionality
  const actions = document.createElement('div');
  actions.className = 'pdp-banner-carousel-actions';
  if (!block.classList.contains('no-wishlist')) {
    const sku = configValue(configRows, 'sku') || configValue(configRows, 'product-id');
    if (sku) {
      actions.append(wishlistHeart({
        code: sku,
        type: configValue(configRows, 'product-type') || 'products',
        name: track.querySelector('.pdp-banner-carousel-title')?.textContent.trim() || '',
        className: 'pdp-banner-carousel-placeholder pdp-banner-carousel-wishlist',
      }));
    } else {
      actions.append(buildPlaceholder('pdp-banner-carousel-wishlist'));
    }
  }
  let sharePlaceholder;
  if (!block.classList.contains('no-share')) {
    sharePlaceholder = buildPlaceholder('pdp-banner-carousel-share');
    actions.append(sharePlaceholder);
  }
  if (actions.children.length) tools.append(actions);
  if (sharePlaceholder) adoptShare(block, sharePlaceholder);
  initWishlist(block);

  if (slides.length > 1) initCarousel(block, track, slides, tools);
  if (!tools.children.length) tools.remove();
}
