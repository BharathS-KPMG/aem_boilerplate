import { createOptimizedPicture } from '../../scripts/aem.js';
import { pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';

/**
 * collection-collage — a titled band of product collections: each has a
 * three-line heading, a description, a download CTA and a photo collage
 * (source: Asian Paints "imageCollageGrid" + its "Whispers Of Inspirations"
 * title, nilaya-arc-inspiration).
 *
 * Authoring (DA table; full example in README.md): label | value rows, then
 * the collections as a header row + one row per collection:
 *   Title                                                  <- label | value
 *   Eyebrow | Name | Tagline | Description | Description (mobile) | Highlight |
 *   CTA label | CTA link | Open in new tab | Images (desktop) | Images (mobile)
 *                                                          <- collections
 * Collections alternate text left / text right, as on the source.
 * Images (desktop): up to 8, Images (mobile): up to 4, in collage order.
 */

// desktop collage: 3 images under the text (1 + 2), 5 beside it (3 + 2)
const DESKTOP_GROUPS = [[[0], [1, 2]], [[3, 4, 5], [6, 7]]];
// mobile collage: 4 images below the text, in two columns (2 + 2)
const MOBILE_GROUP = [[0, 1], [2, 3]];

const DOWNLOAD_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 20" width="17" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="M4.375 16.125C4.375 15.6418 4.76675 15.25 5.25 15.25H15.75C16.2333 15.25 16.625 15.6418 16.625 16.125C16.625 16.6082 16.2333 17 15.75 17H5.25C4.76675 17 4.375 16.6082 4.375 16.125ZM7.25628 9.38128C7.59799 9.03957 8.15201 9.03957 8.49372 9.38128L9.625 10.5126L9.625 3.875C9.625 3.39175 10.0167 3 10.5 3C10.9832 3 11.375 3.39175 11.375 3.875L11.375 10.5126L12.5063 9.38128C12.848 9.03957 13.402 9.03957 13.7437 9.38128C14.0854 9.72299 14.0854 10.277 13.7437 10.6187L11.1187 13.2437C10.9546 13.4078 10.7321 13.5 10.5 13.5C10.2679 13.5 10.0454 13.4078 9.88128 13.2437L7.25628 10.6187C6.91457 10.277 6.91457 9.72299 7.25628 9.38128Z"/></svg>';

// label | value rows (lower-cased label -> field)
const FIELDS = { title: 'title' };
// collection columns, by header text (lower-cased)
const COLUMNS = {
  eyebrow: 'eyebrow',
  name: 'name',
  tagline: 'tagline',
  description: 'description',
  'description (mobile)': 'mobileDescription',
  highlight: 'highlight',
  'cta label': 'ctaLabel',
  'cta link': 'ctaLink',
  'open in new tab': 'newTab',
  'images (desktop)': 'desktop',
  'images (mobile)': 'mobile',
};

const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();

function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
}

function readRows(block) {
  const fields = {};
  const items = [];
  let columns = null;
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const labels = cells.map((c) => text(c).toLowerCase());
    if (!columns && labels.filter((l) => COLUMNS[l]).length >= 2) {
      columns = labels.map((l) => COLUMNS[l] || '');
      return;
    }
    if (!columns) {
      if (FIELDS[labels[0]]) fields[FIELDS[labels[0]]] = cells[1] || null;
      return;
    }
    const item = {};
    columns.forEach((key, i) => { if (key) item[key] = cells[i] || null; });
    const imgs = (cell) => [...(cell?.querySelectorAll('img') || [])];
    const entry = {
      eyebrow: text(item.eyebrow),
      name: text(item.name),
      tagline: text(item.tagline),
      description: text(item.description),
      mobileDescription: text(item.mobileDescription),
      highlight: text(item.highlight),
      ctaLabel: text(item.ctaLabel),
      ctaLink: item.ctaLink?.querySelector('a[href]')?.getAttribute('href') || text(item.ctaLink),
      newTab: /^(true|yes|1)$/i.test(text(item.newTab)),
      desktop: imgs(item.desktop),
      mobile: imgs(item.mobile),
    };
    const hasContent = entry.name || entry.eyebrow || entry.desktop.length || entry.mobile.length;
    if (hasContent) items.push(entry);
  });
  return { title: text(fields.title), items };
}

/** One collage image: lazy, with the authored size reserved (no CLS). */
function image(img, width) {
  const pic = createOptimizedPicture(img.src, img.alt || '', false, [{ width }]);
  const w = img.getAttribute('width');
  const h = img.getAttribute('height');
  if (w && h) {
    pic.querySelector('img').setAttribute('width', w);
    pic.querySelector('img').setAttribute('height', h);
  }
  return pic;
}

/** A row of image columns (each column: indexes into imgs). */
function collage(imgs, layout, className, width) {
  const wrap = el('div', className);
  layout.forEach((indexes) => {
    const col = el('div', 'collection-collage-column');
    indexes.filter((i) => imgs[i]).forEach((i) => col.append(image(imgs[i], width)));
    if (col.children.length) wrap.append(col);
  });
  return wrap.children.length ? wrap : null;
}

function buildItem(item, index) {
  const side = index % 2 ? 'right' : 'left';
  const article = el('div', `collection-collage-item collection-collage-item-text-${side}`);
  const inner = el('div', 'collection-collage-inner');
  const main = el('div', 'collection-collage-main');
  const details = el('div', 'collection-collage-details');

  const heading = el('h3', 'collection-collage-heading');
  [['eyebrow', item.eyebrow], ['name', item.name], ['tagline', item.tagline]]
    .filter(([, value]) => value)
    .forEach(([part, value], i) => {
      if (i) heading.append(document.createElement('br'));
      const span = el('span', `collection-collage-${part}`);
      span.textContent = value;
      heading.append(span);
    });
  if (heading.children.length) details.append(heading);

  // an optional shorter mobile text (as on the source) replaces it below 992px
  const descriptions = item.mobileDescription && item.mobileDescription !== item.description
    ? [[item.description, ' collection-collage-description-desktop'], [item.mobileDescription, ' collection-collage-description-mobile']]
    : [[item.description, '']];
  if (item.description || item.highlight) {
    descriptions.forEach(([copy, variant]) => {
      const desc = el('p', `collection-collage-description${variant}`);
      desc.append(copy);
      if (item.highlight) {
        if (copy) desc.append(' ', document.createElement('br'));
        const strong = el('strong', 'collection-collage-highlight');
        strong.textContent = item.highlight;
        desc.append(strong);
      }
      details.append(desc);
    });
  }

  if (item.ctaLink) {
    const cta = el('div', 'collection-collage-cta');
    const a = el('a', 'collection-collage-button', { href: item.ctaLink });
    a.addEventListener('click', () => {
      const isPdf = /\.pdf(\?.*)?$/i.test(item.ctaLink || '');
      if (isPdf) {
        pushAdobeCtaClickEvent({
          event: 'download_form_pdf',
          title: item.ctaLink.split('/').pop(),
        });
      }
    });
    a.append(item.ctaLabel || 'Download');
    a.insertAdjacentHTML('beforeend', DOWNLOAD_ICON);
    const what = [item.eyebrow, item.name].filter(Boolean).join(' ');
    if (what) a.setAttribute('aria-label', `${item.ctaLabel || 'Download'}: ${what}${item.newTab ? ' (opens in a new tab)' : ''}`);
    if (item.newTab) {
      a.target = '_blank';
      a.rel = 'noopener';
    }
    cta.append(a);
    details.append(cta);
  }
  main.append(details);

  const under = collage(item.desktop, DESKTOP_GROUPS[0], 'collection-collage-images collection-collage-images-under', '660');
  if (under) main.append(under);
  inner.append(main);

  const beside = collage(item.desktop, DESKTOP_GROUPS[1], 'collection-collage-images collection-collage-images-beside', '660');
  if (beside) inner.append(beside);
  const mobile = collage(item.mobile, MOBILE_GROUP, 'collection-collage-images collection-collage-images-mobile', '400');
  if (mobile) inner.append(mobile);

  article.append(inner);
  return article;
}

/** Slide up + fade in when scrolled into view, as on the source. */
function reveal(nodes) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -25% 0px' });
  nodes.forEach((node) => {
    node.classList.add('collection-collage-reveal');
    io.observe(node);
  });
}

export default function decorate(block) {
  const { title, items } = readRows(block);
  if (!items.length) return;

  const children = [];
  if (title) {
    const h2 = el('h2', 'collection-collage-title');
    const span = el('span');
    span.textContent = title;
    h2.append(span);
    children.push(h2);
  }
  const list = items.map(buildItem);
  children.push(...list);
  block.replaceChildren(...children);
  reveal([block, ...list]);
}
