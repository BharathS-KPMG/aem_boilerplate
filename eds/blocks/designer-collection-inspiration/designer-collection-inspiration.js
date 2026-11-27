import { pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';
import { findLcpSection, useUnparsedPictureUrls } from '../../scripts/pre-load-image.js';

// icons sit in the site's icons folder (/eds/icons on the AP stage site, /icons here)
const iconPath = (name) => `${window.hlx?.codeBasePath || ''}/icons/${name}`;

// AEM DAM paths (/content/dam/...) only exist on the AP static host, like on the live site;
// on an EDS domain they are a 404
const DAM_HOST = 'https://static.asianpaints.com';
const assetUrl = (href) => (href.startsWith('/content/dam/') ? `${DAM_HOST}${href}` : href);

const CTA_CONFIG = {
  download: {
    icon: iconPath('download-icon-black.svg'),
    iconAlt: 'download icon',
    iconClass: 'link-icon link-icon-download',
  },
  redirection: {
    icon: iconPath('arrow-icon-new.svg'),
    iconAlt: 'arrow icon',
    iconClass: 'link-icon',
  },
};

// desktop image from 1024px, like the CSS hover / layout breakpoint
const DESKTOP_MEDIA = '(min-width: 1024px)';

/**
 * Card image as a real <picture> (not a CSS background) so the browser can
 * discover it, and the LCP card can be preloaded at high priority. URLs are
 * the authored <img> srcs; the 1024px breakpoint and the URLs mirror
 * preloadDesignerCollectionLcp() in pre-load-image.js.
 * @param {HTMLImageElement} desktopImg Authored desktop image
 * @param {HTMLImageElement} mobileImg Authored mobile image (or the desktop one)
 * @param {string} alt Alt text of the rendered image
 * @returns {HTMLPictureElement} The picture
 */
function buildPicture(desktopImg, mobileImg, alt) {
  const picture = document.createElement('picture');
  if (mobileImg.src !== desktopImg.src) {
    const source = document.createElement('source');
    source.media = DESKTOP_MEDIA;
    source.srcset = desktopImg.src;
    ['width', 'height'].forEach((attr) => {
      if (desktopImg.hasAttribute(attr)) source.setAttribute(attr, desktopImg.getAttribute(attr));
    });
    picture.append(source);
  }
  const img = document.createElement('img');
  img.src = mobileImg.src;
  img.alt = alt;
  img.loading = 'lazy';
  ['width', 'height'].forEach((attr) => {
    if (mobileImg.hasAttribute(attr)) img.setAttribute(attr, mobileImg.getAttribute(attr));
  });
  picture.append(img);
  return picture;
}

/**
 * Block structure (one row per card):
 * Desktop image | Desktop image hover | Mobile image | Redirection or Download | CTA label | Link
 */
export default function decorate(block) {
  const items = [...block.children];
  const main = block.closest('main');
  const section = block.closest('.section');
  // first card is the LCP image when the block opens the page, also behind
  // image-less sections (sr-only H1, breadcrumb) as on the catalogue directory
  let eager = !!main && (section === main.querySelector('.section')
    || section === findLcpSection(main));

  items.forEach((item) => {
    const cells = [...item.children];
    const [desktopCell, hoverCell, mobileCell, typeCell, labelCell, linkCell] = cells;
    const desktopImg = desktopCell?.querySelector('img');

    // Skip header/label rows and incomplete rows
    if (!desktopImg) {
      item.remove();
      return;
    }

    const hoverImg = hoverCell?.querySelector('img') || desktopImg;
    const mobileImg = mobileCell?.querySelector('img') || desktopImg;

    const type = typeCell?.textContent.trim().toLowerCase() === 'download' ? 'download' : 'redirection';
    const cta = CTA_CONFIG[type];
    const ctaLabel = labelCell?.textContent.trim() || '';

    const linkAnchor = linkCell?.querySelector('a');
    const link = assetUrl(linkAnchor?.getAttribute('href') || linkCell?.textContent.trim() || '');

    // Create elements
    const div1 = document.createElement('div');
    div1.className = 'designer-collection-inspiration-default';
    const picture = buildPicture(desktopImg, mobileImg, desktopImg.alt);
    if (eager) {
      const img = picture.querySelector('img');
      img.loading = 'eager';
      img.setAttribute('fetchpriority', 'high');
      // same URLs as preloadDesignerCollectionLcp() in pre-load-image.js
      useUnparsedPictureUrls(picture);
      eager = false;
    }
    div1.append(picture);

    // hover image: desktop only (hidden below 1024px, so the lazy <img> is not
    // fetched on phones), and kept behind the LCP image in the queue
    const div2 = document.createElement('div');
    div2.className = 'designer-collection-inspiration-hover';
    const hoverPicture = buildPicture(hoverImg, hoverImg, '');
    hoverPicture.querySelector('img').setAttribute('fetchpriority', 'low');
    div2.append(hoverPicture);

    // const anchor = document.createElement('a');
    // anchor.href = link;
    // anchor.target = '_blank';
    // anchor.classList.add(`cta-${type}`);
    // anchor.textContent = `${ctaLabel} `;
    // if (ctaLabel && itemName) anchor.setAttribute('aria-label', `${ctaLabel}: ${itemName}`);
    // anchor.insertAdjacentHTML('beforeend',
    //   `<img src="${cta.icon}" alt="" class="${cta.iconClass}">`);
    // // anchor.insertAdjacentHTML('beforeend',
    // //   `<img src="${cta.icon}" alt="${cta.iconAlt}" class="${cta.iconClass}">`);

    // // Extract image alt text for tracking
    // const imageAltText = desktopImg.alt || 'Designer Collection';

    // anchor.addEventListener('click', () => {
    //   const downloadPdfName = new URL(anchor.href).pathname.split('/').pop().replace('.pdf', '');
    //   pushAdobeCtaClickEvent({
    //     event: 'download_multiple_pdf',
    //     pdfName: downloadPdfName,
    //     title: imageAltText,
    //   });
    // });

    // Image alt text, used for tracking and the link's accessible name
    // e.g. "Royale Book of Colours - ultimate shade guide…" → "Royale Book of Colours"
    const imageAltText = desktopImg.alt || 'Designer Collection';
    const itemName = imageAltText.split(' - ')[0].trim();

    const anchor = document.createElement('a');
    anchor.href = link;
    anchor.target = '_blank';
    anchor.classList.add(`cta-${type}`);
    anchor.textContent = `${ctaLabel} `;
    if (ctaLabel && itemName) anchor.setAttribute('aria-label', `${ctaLabel}: ${itemName}`);
    anchor.insertAdjacentHTML('beforeend', `<img src="${cta.icon}" alt="" class="${cta.iconClass}">`);

    anchor.addEventListener('click', () => {
      const downloadPdfName = new URL(anchor.href).pathname.split('/').pop().replace('.pdf', '');
      pushAdobeCtaClickEvent({
        event: 'download_multiple_pdf',
        pdfName: downloadPdfName,
        title: imageAltText,
      });
    });

    // Wrapper to hold all three as siblings
    const wrapper = document.createElement('div');
    wrapper.appendChild(div1);
    wrapper.appendChild(div2);
    wrapper.appendChild(anchor);

    // Replace original item
    item.replaceWith(wrapper);
  });
}
