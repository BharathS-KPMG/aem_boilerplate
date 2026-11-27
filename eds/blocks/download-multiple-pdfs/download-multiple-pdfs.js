import { createOptimizedPicture, toClassName } from '../../scripts/aem.js';
import { pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';

/**
 * Download Multiple PDFs
 * "Downloadable resources" panel from the asianpaints.com product pages
 * (downloadmultiplepdfs): a photo with an offset grey panel holding a heading,
 * a short text and one download button per file.
 *
 * Authoring model (one row per field: label | value):
 *   Title         | Downloadable resources
 *   Subtitle      | Get more information about this product with these downloadable files.
 *   Desktop image | photo shown from 992px
 *   Mobile image  | photo shown below 992px (optional, falls back to the desktop image)
 *   PDF           | one link per file (the link text is the button label)
 *
 * @param {Element} block The block element
 */

function createElement(tag, className, ...children) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.append(...children.filter((child) => child !== null && child !== undefined));
  return el;
}

const text = (el) => el?.textContent.trim().replace(/\s+/g, ' ') || '';

const DESKTOP_MEDIA = '(min-width: 992px)';

/**
 * Mobile picture with the desktop image as sources from 992px.
 * Either image may be missing, the other one is then used everywhere.
 */
function buildPicture(desktopImg, mobileImg) {
  const desktopSrc = (desktopImg || mobileImg)?.src;
  if (!desktopSrc) return null;
  const mobileSrc = (mobileImg || desktopImg).src;
  const alt = desktopImg?.getAttribute('alt') || mobileImg?.getAttribute('alt') || '';
  const picture = createOptimizedPicture(mobileSrc, alt, false, [{ width: '400' }]);
  const desktop = createOptimizedPicture(desktopSrc, alt, false, [
    { media: DESKTOP_MEDIA, width: '750' },
    { width: '750' },
  ]);
  picture.prepend(...desktop.querySelectorAll('source[media]'));
  return picture;
}

/**
 * Smaller desktops zoom out like the reference page, which does it with a
 * page-wide `body { zoom }`. When the page itself is already zoomed (e.g. the
 * asianpaints.com header styles are on the page), the block must not zoom a
 * second time, so it gets a `data-page-zoomed` attribute and its CSS switches its
 * own zoom off. Those styles can arrive after the block is decorated (the header
 * loads later), so the check reruns whenever the block's wrapper changes size:
 * a page zoom changes its width in CSS pixels, and so does resizing the window.
 * Kept in this file so the block has no dependencies besides aem.js.
 * @param {Element} block The block element
 */
function syncPageZoom(block) {
  const update = () => {
    let zoom = 1;
    for (let el = block.parentElement; el; el = el.parentElement) {
      zoom *= parseFloat(getComputedStyle(el).zoom) || 1;
    }
    block.toggleAttribute('data-page-zoomed', Math.abs(zoom - 1) > 0.001);
  };
  update();
  const target = block.parentElement || block;
  if ('ResizeObserver' in window) new ResizeObserver(update).observe(target);
  else window.addEventListener('resize', update);
}

export default function decorate(block) {
  const fields = {};
  const links = [];
  [...block.children].forEach((row) => {
    const [label, value] = row.children;
    const key = toClassName(text(label));
    if (!key || !value) return;
    // "PDF", "PDFs", "PDF 2", ...: every link in those rows is a download
    if (key.startsWith('pdf')) links.push(...value.querySelectorAll('a[href]'));
    else fields[key] = value;
  });

  const heading = text(fields.title);
  const description = text(fields.subtitle);

  const info = createElement('div', 'download-multiple-pdfs-info');
  if (heading) info.append(createElement('h2', '', heading));
  if (description) info.append(createElement('p', 'download-multiple-pdfs-text', description));
  links.forEach((link) => {
    const button = createElement('a', 'download-multiple-pdfs-button', text(link));
    button.href = link.href;
    button.setAttribute('download', '');
    button.addEventListener('click', () => {
      const downloadPdfName = new URL(link.href).pathname.split('/').pop().replace('.pdf', '');
      pushAdobeCtaClickEvent({ pdfName: downloadPdfName, title: button.textContent, event: 'download_multiple_pdf' });
    });
    info.append(createElement('p', 'download-multiple-pdfs-item', button));
  });

  const media = createElement('div', 'download-multiple-pdfs-media', buildPicture(
    fields['desktop-image']?.querySelector('img'),
    fields['mobile-image']?.querySelector('img'),
  ));

  const panel = createElement('div', 'download-multiple-pdfs-panel', info);
  block.replaceChildren(createElement('div', 'download-multiple-pdfs-inner', media, panel));
  syncPageZoom(block);
}
