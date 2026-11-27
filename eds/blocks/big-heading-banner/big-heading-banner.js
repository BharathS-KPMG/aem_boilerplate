/*
 * Big Heading Banner - the "Image Carousel (centered-text, text-large, big-heading)" banner as
 * its own light block for the top of a page (no carousel / Swiper code): one image with a
 * centred heading, sub heading and CTA, like live
 * www.asianpaints.com/texture-paints/exterior-textures.html
 *
 * Same columns as the image carousel (Title = the big heading, Sub Title = the small text under
 * it; in an image-carousel slide row the two are the other way round, swap them when copying):
 *   Overlay breadcrumb | true            (optional config rows: key | value)
 *   Desktop image | Mobile image | Redirection link | CTA Label | Open in new tab | CTA alignment
 *     | Title | Sub Title               (header row, ignored)
 *   <desktop pic> | <mobile pic> | /link | Explore Now | false | center
 *     | <h1>..</h1> | <h4>..</h4><p>..</p>
 *
 * SEO / performance: the authored heading (e.g. the h1) is kept as is, the CTA is a real link,
 * the image is loaded eagerly with high priority (it is the page's LCP image).
 */
import { createOptimizedPicture } from '../../scripts/aem.js';
import { pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';
import { unparsedUrl, useUnparsedPictureUrls } from '../../scripts/pre-load-image.js';

// Right-pointing arrow of the CTA
// START FIX MATCH LIVE (CTA arrow): live's arrow-icon.svg shape, unscaled in a 17 x 20 box as
// on live (its 20 x 20 icon is a background of a 17px wide span); currentColor for the hover
const ARROW_SVG = '<svg width="17" height="20" viewBox="0 0 17 20" fill="none" aria-hidden="true" focusable="false"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M10.2563 4.13128C10.598 3.78957 11.152 3.78957 11.4937 4.13128L16.7437 9.38128C17.0854 9.72299 17.0854 10.277 16.7437 10.6187L11.4937 15.8687C11.152 16.2104 10.598 16.2104 10.2563 15.8687C9.91457 15.527 9.91457 14.973 10.2563 14.6313L14.0126 10.875L3.875 10.875C3.39175 10.875 3 10.4832 3 10C3 9.51675 3.39175 9.125 3.875 9.125H14.0126L10.2563 5.36872C9.91457 5.02701 9.91457 4.47299 10.2563 4.13128Z"/></svg>';
// END FIX MATCH LIVE (CTA arrow)

const HEADINGS = 'h1, h2, h3, h4, h5, h6';

function cellText(cell) {
  return (cell?.textContent || '').replace(/\s+/g, ' ').trim();
}

function yesNo(value) {
  return /^(true|yes|y|1)$/i.test(value);
}

function cellLink(cell) {
  return cell?.querySelector('a')?.getAttribute('href') || cellText(cell);
}

function ratioOf(img) {
  const w = img?.getAttribute('width');
  const h = img?.getAttribute('height');
  return w && h ? `${w} / ${h}` : '';
}

// mobile image below 992px (like live), desktop image from 992px
function buildPicture(desktopImg, mobileImg) {
  const mobile = mobileImg || desktopImg;
  const desktop = desktopImg || mobileImg;
  const alt = desktop.alt || mobile.alt || '';
  const picture = createOptimizedPicture(mobile.src, alt, true, [{ width: '1000' }]);
  // The desktop <source> alone (a second createOptimizedPicture() <img> fetched the 2000px
  // desktop image again, on phones too), already in the URL form preloadBigHeadingBannerLcp()
  // in pre-load-image.js preloads: Chrome fetches a URL the authored lazy <img> registered as
  // soon as an eager <img> can pick it, next to the preload.
  const { origin, pathname } = new URL(desktop.src, window.location.href);
  const desktopSource = document.createElement('source');
  desktopSource.media = '(min-width: 992px)';
  desktopSource.type = 'image/webp';
  desktopSource.srcset = unparsedUrl(`${origin}${pathname}?width=2000&format=webply&optimize=medium`);
  picture.prepend(desktopSource);
  useUnparsedPictureUrls(picture);
  const img = picture.querySelector('img');
  img.setAttribute('fetchpriority', 'high');
  ['width', 'height'].forEach((attr) => {
    if (mobile.getAttribute(attr)) img.setAttribute(attr, mobile.getAttribute(attr));
  });
  return picture;
}

// sub heading: the Sub Title cell's lines (heading / paragraphs) in one element, one line each
function buildSubHeading(cell) {
  const parts = [...cell.children].filter((el) => cellText(el));
  const lines = parts.length ? parts.map(cellText) : [cellText(cell)].filter(Boolean);
  if (!lines.length) return null;
  const tag = parts[0]?.matches(HEADINGS) ? parts[0].tagName : 'P';
  const sub = document.createElement(tag);
  lines.forEach((line, i) => {
    if (i) sub.append(document.createElement('br'));
    sub.append(line);
  });
  sub.className = 'banner-sub-heading';
  return sub;
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const rows = [...block.children].map((row) => [...row.children]);
  const slide = rows.find((cells) => cells.some((c) => c.querySelector('img')));
  if (!slide) return;

  // config rows (key | value)
  rows.filter((cells) => cells.length === 2 && cells !== slide).forEach(([key, value]) => {
    const name = cellText(key).toLowerCase();
    if ((name === 'overlay breadcrumb' || name === 'breadcrumb') && yesNo(cellText(value))) {
      block.classList.add('breadcrumb-overlay');
    }
  });

  const [
    desktopCell, mobileCell, linkCell, labelCell, newTabCell, alignCell, titleCell, subTitleCell,
  ] = slide;
  const desktopImg = desktopCell?.querySelector('img');
  const mobileImg = mobileCell?.querySelector('img');
  const href = cellLink(linkCell) || labelCell?.querySelector('a')?.getAttribute('href') || '';
  const newTab = yesNo(cellText(newTabCell));
  const alignText = cellText(alignCell).toLowerCase();
  const align = ['left', 'right'].includes(alignText) ? alignText : 'center';
  const authoredHeading = titleCell?.querySelector(HEADINGS);

  // image (clickable like live; the CTA below is the link for keyboard / screen readers)
  const media = document.createElement(href ? 'a' : 'div');
  media.className = 'banner-media';
  media.append(buildPicture(desktopImg, mobileImg));
  if (href) {
    media.href = href;
    media.tabIndex = -1;
    media.setAttribute('aria-hidden', 'true');
    if (newTab) {
      media.target = '_blank';
      media.rel = 'noopener noreferrer';
    }
    media.addEventListener('click', () => {
      const bannerTitle = authoredHeading?.textContent?.trim()
        || cellText(titleCell)
        || '';
      pushAdobeCtaClickEvent({
        title: bannerTitle,
        destinationUrl: new URL(href, window.location.origin).href,
        event: 'carousel_banner_click',
      });
    });
  }
  block.style.setProperty('--banner-ratio-mobile', ratioOf(mobileImg || desktopImg));
  block.style.setProperty('--banner-ratio-desktop', ratioOf(desktopImg || mobileImg));

  // START FIX TITLE FIELDS: the DA columns say what they show - Title is the big heading
  // (authored heading kept for SEO), Sub Title the small text under it; then the CTA
  const text = document.createElement('div');
  text.className = 'banner-text';

  if (authoredHeading || cellText(titleCell)) {
    const heading = authoredHeading || document.createElement('h2');
    if (!authoredHeading) heading.textContent = cellText(titleCell);
    heading.classList.add('banner-heading');
    text.append(heading);
  }

  const sub = subTitleCell ? buildSubHeading(subTitleCell) : null;
  if (sub) text.append(sub);
  // END FIX TITLE FIELDS

  const label = cellText(labelCell);
  if (href && label) {
    const ctaWrap = document.createElement('p');
    ctaWrap.className = `banner-cta-wrap banner-cta-${align}`;
    const cta = document.createElement('a');
    cta.className = 'banner-cta';
    cta.href = href;
    cta.textContent = label;
    cta.insertAdjacentHTML('beforeend', ARROW_SVG);
    if (newTab) {
      cta.target = '_blank';
      cta.rel = 'noopener noreferrer';
    }
    cta.addEventListener('click', () => {
      const bannerTitle = authoredHeading?.textContent?.trim()
        || cellText(titleCell)
        || '';
      pushAdobeCtaClickEvent({
        parentTitle: bannerTitle,
        cta: label,
        destinationUrl: new URL(href, window.location.origin).href,
        event: 'custom_cta_click',
      });
    });
    ctaWrap.append(cta);
    text.append(ctaWrap);
  }

  block.replaceChildren(media, text);
}
