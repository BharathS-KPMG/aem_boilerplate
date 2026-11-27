import { createOptimizedPicture } from '../../scripts/aem.js';
import { pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';

/**
 * colour-book-showcase — intro (eyebrow, title, CTA) beside a strip of room
 * images that swap to their hover artwork, followed by a heading and text.
 *
 * Authoring model (see README in colour-book-showcase.css header): one field
 * per row, label left, value right, then the repeating images:
 *   Eyebrow | Title | CTA label | CTA link | Mobile CTA link | Open in new tab
 *   | Heading | Text                                 <- label | value rows
 *   Image | Hover image                              <- item header row
 *   <img> | <img>                                    <- one row per image
 * Unknown labels are ignored; any row with an image is an item.
 *
 * Desktop (>=992px) shows the images and swaps all of them to the hover
 * artwork while the strip is hovered or keyboard focused; they appear one by
 * one, 300ms apart, when the strip scrolls into view. Below 992px the strip
 * scrolls sideways and shows the hover artwork.
 */

const FIELDS = {
  eyebrow: 'eyebrow',
  title: 'title',
  'cta label': 'ctaLabel',
  'cta link': 'ctaLink',
  'mobile cta link': 'mobileCtaLink',
  'open in new tab': 'newTab',
  heading: 'heading',
  text: 'text',
};
const REVEAL_STEP = 300;

const text = (cell) => (cell?.textContent || '').replace(/\s+/g, ' ').trim();
const href = (cell) => cell?.querySelector('a[href]')?.href || text(cell);

const DOWNLOAD_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false"><path fill="#1C1B1F" d="M9 12L5.25 8.25L6.3 7.1625L8.25 9.1125V3H9.75V9.1125L11.7 7.1625L12.75 8.25L9 12ZM4.5 15C4.0875 15 3.73438 14.8531 3.44063 14.5594C3.14688 14.2656 3 13.9125 3 13.5V11.25H4.5V13.5H13.5V11.25H15V13.5C15 13.9125 14.8531 14.2656 14.5594 14.5594C14.2656 14.8531 13.9125 15 13.5 15H4.5Z"/></svg>';

/** Read label/value rows and item rows from the authored table. */
function readModel(block) {
  const model = { items: [] };
  [...block.children].forEach((row) => {
    const [first, second] = row.children;
    const imgs = [...row.querySelectorAll('img')];
    if (imgs.length) {
      model.items.push({ image: first?.querySelector('img'), hover: second?.querySelector('img') });
      return;
    }
    const key = FIELDS[text(first).toLowerCase()];
    if (key && second) model[key] = second;
  });
  return model;
}

function buildCta(label, link, newTab) {
  const a = document.createElement('a');
  a.className = 'colour-book-showcase-cta';
  a.href = link;
  if (newTab) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  const span = document.createElement('span');
  span.textContent = label;
  const icon = document.createElement('span');
  icon.className = 'colour-book-showcase-cta-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = DOWNLOAD_ICON;
  a.addEventListener('click', () => {
    const isPdf = /\.pdf(\?.*)?$/i.test(a.href || '');
    if (isPdf) {
      pushAdobeCtaClickEvent({
        event: 'download_form_pdf',
        title: a.href.split('/').pop(),
      });
    }
  });
  a.append(span, icon);
  return a;
}

function picture(img, className) {
  const pic = createOptimizedPicture(img.src, img.alt || '', false, [{ width: '600' }]);
  pic.className = className;
  const out = pic.querySelector('img');
  const w = parseInt(img.getAttribute('width'), 10);
  const h = parseInt(img.getAttribute('height'), 10);
  if (w && h) {
    out.width = w;
    out.height = h;
  }
  return pic;
}

/** Show the strip's images one by one once it scrolls into view (as on the source). */
function revealOnView(list) {
  const items = [...list.children];
  const reveal = () => items.forEach((li, i) => {
    setTimeout(() => li.classList.add('is-revealed'), REVEAL_STEP * i);
  });
  if (!('IntersectionObserver' in window)) {
    reveal();
    return;
  }
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    reveal();
  });
  io.observe(list);
}

export default function decorate(block) {
  const m = readModel(block);
  const newTab = /^(true|yes|1)$/i.test(text(m.newTab));
  const ctaLabel = text(m.ctaLabel);
  const ctaLink = m.ctaLink ? href(m.ctaLink) : '';

  // --- intro column ---
  const intro = document.createElement('div');
  intro.className = 'colour-book-showcase-intro';
  if (text(m.eyebrow)) {
    const h2 = document.createElement('h2');
    h2.className = 'colour-book-showcase-eyebrow';
    const span = document.createElement('span');
    span.className = 'colour-book-showcase-gradient';
    span.textContent = text(m.eyebrow);
    h2.append(span);
    intro.append(h2);
  }
  if (text(m.title)) {
    const p = document.createElement('p');
    p.className = 'colour-book-showcase-title';
    const span = document.createElement('span');
    span.textContent = text(m.title);
    p.append(span);
    intro.append(p);
  }
  // the CTA row keeps its space on phones, where the CTA moves below the images
  const ctaWrap = document.createElement('p');
  ctaWrap.className = 'colour-book-showcase-cta-wrap';
  if (ctaLabel && ctaLink) ctaWrap.append(buildCta(ctaLabel, ctaLink, newTab));
  intro.append(ctaWrap);

  // --- media column ---
  const media = document.createElement('div');
  media.className = 'colour-book-showcase-media';
  const items = m.items.filter((item) => item.image || item.hover);
  if (items.length) {
    const strip = document.createElement('div');
    strip.className = 'colour-book-showcase-strip';
    const list = document.createElement('ul');
    list.className = 'colour-book-showcase-gallery';
    // focusable, like the source: it scrolls sideways on small screens and
    // shows the hover artwork on keyboard focus
    list.tabIndex = 0;
    if (text(m.eyebrow)) list.setAttribute('aria-label', text(m.eyebrow));
    items.forEach(({ image, hover }) => {
      const li = document.createElement('li');
      if (image && hover) {
        li.append(picture(image, 'colour-book-showcase-image'), picture(hover, 'colour-book-showcase-hover'));
      } else {
        // only one image: shown at all sizes and states
        li.append(picture(image || hover, 'colour-book-showcase-only'));
      }
      list.append(li);
    });
    strip.append(list);
    media.append(strip);
    revealOnView(list);
  }

  if (text(m.heading) || text(m.text)) {
    const copy = document.createElement('div');
    copy.className = 'colour-book-showcase-text';
    if (text(m.heading)) {
      const h3 = document.createElement('h3');
      h3.className = 'colour-book-showcase-heading';
      const span = document.createElement('span');
      span.className = 'colour-book-showcase-gradient';
      span.textContent = text(m.heading);
      h3.append(span);
      copy.append(h3);
    }
    if (text(m.text)) {
      const paras = [...m.text.querySelectorAll(':scope > p')];
      if (paras.length) copy.append(...paras);
      else {
        const p = document.createElement('p');
        p.append(...m.text.childNodes);
        copy.append(p);
      }
    }
    media.append(copy);
  }

  // phone-only copy of the CTA, centred below the text
  const mobile = document.createElement('div');
  mobile.className = 'colour-book-showcase-cta-mobile';
  if (ctaLabel && (m.mobileCtaLink || ctaLink)) {
    const p = document.createElement('p');
    p.className = 'colour-book-showcase-cta-wrap';
    p.append(buildCta(ctaLabel, m.mobileCtaLink ? href(m.mobileCtaLink) : ctaLink, newTab));
    mobile.append(p);
  }
  media.append(mobile);

  const row = document.createElement('div');
  row.className = 'colour-book-showcase-row';
  row.append(intro, media);
  block.replaceChildren(row);
}
