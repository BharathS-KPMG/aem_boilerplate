import { createOptimizedPicture, getMetadata } from '../../scripts/aem.js';
import { BETA_DOMAIN, PROD_DOMAIN, isProdDomain } from '../../scripts/environment.js';
import { pushAdobeCtaClickEvent, personaExperienceTagging } from '../../scripts/analytics_1.js';

/**
 * complete-look — a heading and subtitle beside (desktop) or above (mobile)
 * a banner image that links to a page (the banner art carries its own CTA),
 * then cards: trending shades (colour swatches), featured products
 * (packshots) and ideas (image tiles).
 *
 * Variants: the page has one block per variant. Only the active variant is
 * shown; it is control-variant (the original) until showVariant() picks
 * another one. A block with no variant option is control-variant.
 *   complete-look (control-variant)
 *   complete-look (product-variant)
 *   complete-look (cost-variant)
 *   complete-look (final-variant)
 *
 * Authoring (DA table): rows grouped by "Start Section | <name>" and
 * "End Section | <name>" rows.
 *   Start Section | Main Heading
 *   Title         | Complete the look
 *   Subtitle      | Pair your festive palette with the right finish for every wall.
 *   End Section   | Main Heading
 *   Start Section | Main Banner
 *   Desktop Image | Mobile Image | Redirection            | Open in new tab   (header row)
 *   <image>       | <image>      | /colour-catalogue.html | false
 *   End Section   | Main Banner
 *   Start Section     | Trending Shades
 *   Title             | Trending shades near you
 *   Subtitle          | Popular colour people are exploring now.
 *   CTA               | Explore more colours        (the CTA link: link this text)
 *   Open in new tab   | false                       (CTA and swatch links)
 *   Swatch hex color | Swatch name  | Swatch number | Swatch link | Swatch roomshot image
 *   FCDEBB           | Nacho Cheese | 9436          | /...html    | <image>
 *   (the first row is the header row)
 *   (the roomshot image's URL goes on the swatch as data-attr-swatch-image)
 *   End Section       | Trending Shades
 *   Start Section     | Featured Products
 *   Title             | Featured Products
 *   Subtitle          | Popular products people are exploring.
 *   CTA               | Explore more colours        (the CTA link: link this text)
 *   Open in new tab   | false                       (CTA and product links)
 *   Packshot image | Packshot name | Packshot category  | Packshot link (header row)
 *   <image>        | Super Luxury  | For Interior Walls | /...html
 *   End Section       | Featured Products
 *   Start Section     | Ideas section
 *   Title             | Looking for ideas?
 *   Subtitle          | Explore colour combination by room for your inspiration
 *   Open in new tab   | false                       (tile links)
 *   Desktop Image | Mobile Image | Redirection link   (header row)
 *   <image>       | <image>      | /...html           (the label is in the image)
 *   End Section       | Ideas section
 *   Start Section     | Image left section     (Image right section: the same)
 *   Open in new tab   | false
 *   Desktop image | Mobile image | Redirection link | Event   (header row)
 *   <image>       | <image>      | /...html                  (the CTA is in the image)
 *   End Section       | Image left section
 *   (Redirection link "Popup", or a "#form" link: the card opens the "Book a
 *   FREE Site Visit" form pop-up instead of going to a page)
 *   Start Section     | PQC section
 *   Title             | Your painting estimate is ready
 *   Subtitle          | Popular colour people are exploring in mumbai
 *   Label             | Recommended for you    (a green pill)
 *   Download CTA      | Download PDF        (a button: makes the PDF from the API response)
 *   Calculate CTA     | Calculate again     (the CTA link: link this text)
 *   Open in new tab   | false               (optional: both CTAs)
 *   Background desktop image | <image>      (optional: behind the card)
 *   Background mobile image  | <image>      (optional: the desktop one if empty)
 *   End Section       | PQC section
 * Columns are matched by the header row's labels. Mobile Image is optional
 * (the desktop image is used). A line break in the Main Heading Title is kept.
 * Each section is shown only when its Start Section is authored; the cards
 * (Trending Shades, Featured Products, Ideas section, Image left section,
 * Image right section) in the order they are authored, two per row on desktop.
 * Image left section stands in for Featured Products: it is shown only when
 * there is no Featured Products card.
 * PQC section: a painting estimate card in the Main Banner's place (the
 * banner is not shown with it). Its packshot, product name and figures come
 * from the paint budget calculator API (the systems returned; the card shows
 * the first), called with the area, paint and category read from the
 * userJourney cookie (JSON: PQCarea, PQCpaint, PQCcategory), and only when
 * its isPQCCompleted is 1. The card stays hidden until the estimate loads
 * (not completed, no cookie, or the call fails: not shown). With a background
 * image, the card sits on it (left on desktop, at the top on mobile).
 */

// the original, shown until the logic picks another variant
const DEFAULT_VARIANT = 'control-variant';
const VARIANTS = [DEFAULT_VARIANT, 'product-variant', 'cost-variant', 'final-variant'];

// the label | value rows of a card under the banner
const CARD_FIELDS = {
  title: 'title',
  subtitle: 'subtitle',
  cta: 'cta',
  'cta link': 'ctaLink',
  'open in new tab': 'newTab',
};

// "Image left section" and "Image right section": one linked image card
const IMAGE_CARD = {
  fields: { 'open in new tab': 'newTab' },
  columns: {
    'desktop image': 'desktop',
    'mobile image': 'mobile',
    'redirection link': 'link',
    redirection: 'link',
  },
};

// sections by their "Start Section" name: label | value rows (fields), and/or
// a header row of column labels followed by value rows
const SECTIONS = {
  'main heading': {
    key: 'heading',
    fields: { title: 'title', subtitle: 'subtitle' },
  },
  'main banner': {
    key: 'banner',
    columns: {
      'desktop image': 'desktop',
      'mobile image': 'mobile',
      redirection: 'link',
      'open in new tab': 'newTab',
    },
    // column order when the header row is missing
    order: ['desktop', 'mobile', 'link', 'newTab'],
  },
  'trending shades': {
    key: 'trending',
    fields: CARD_FIELDS,
    columns: {
      'swatch hex color': 'hex',
      'swatch hex colour': 'hex',
      'swatch name': 'name',
      'swatch number': 'number',
      'swatch link': 'link',
      'swatch roomshot image': 'image',
    },
  },
  'featured products': {
    key: 'featured',
    fields: CARD_FIELDS,
    columns: {
      'packshot image': 'image',
      'packshot name': 'name',
      'packshot category': 'category',
      'packshot link': 'link',
    },
  },
  'ideas section': {
    key: 'ideas',
    fields: CARD_FIELDS,
    columns: {
      'desktop image': 'desktop',
      'mobile image': 'mobile',
      'redirection link': 'link',
      redirection: 'link',
    },
  },
  'image left section': { key: 'imageLeft', ...IMAGE_CARD },
  'image right section': { key: 'imageRight', ...IMAGE_CARD },
  'pqc section': {
    key: 'pqc',
    fields: {
      title: 'title',
      subtitle: 'subtitle',
      label: 'label',
      'download cta': 'download',
      'calculate cta': 'calculate',
      'open in new tab': 'newTab',
      'background desktop image': 'bgDesktop',
      'background mobile image': 'bgMobile',
    },
  },
};

// the "PQC section" estimate: the calculator API (beta or prod by the site's
// environment), and the cookie holding the area, paint and category inputs
const SITE_HOST = `https://${isProdDomain() ? PROD_DOMAIN : BETA_DOMAIN}`;
const PQC_ENDPOINT = `${SITE_HOST}/apcolourcatalogue/paintBudgetCalculator.pbc.json`;
const PQC_COOKIE = 'userJourney';
// API parameter: key in the cookie's JSON
const PQC_INPUTS = { area: 'PQCarea', paint: 'PQCpaint', category: 'PQCcategory' };
// the paint-quotation-tool PDF module's options: no authored "PDF" rows here
// (its defaults apply), and the labels of the figures
const PQC_PDF_CONFIG = { 'why-item': [], 'how-item': [], plan: [] };
const PQC_PDF_LABELS = {
  paintArea: 'Total area for painting ( {area} x {factor} )',
  perSqft: 'Per SQFT cost',
};
// the packshot's size, so its box is kept while it loads
const PQC_PACKSHOT_SIZE = [380, 472];
// fixed request parameters the calculator endpoint expects
const PQC_REQUEST_DEFAULTS = {
  surface: '', language: 'en', apltype: 'APL_WEB', multiplierValue: '1.35',
};

// the desktop (wide) banner image from this width; keep in sync with the CSS
const WIDE = '(min-width: 600px)';

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const ARROW = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let activeVariant = DEFAULT_VARIANT;

const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
const label = (cell) => text(cell).toLowerCase();
const hrefOf = (cell) => cell?.querySelector('a[href]')?.getAttribute('href') || text(cell);
const isTrue = (cell) => /^(true|yes)$/i.test(text(cell));

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/**
 * The sections, by SECTIONS key: { authored, position, fields: { key: cell },
 * rows: [{ key: cell }] }; authored is true when its "Start Section" row is
 * there, and position is the order it is authored in.
 */
function readModel(block) {
  const model = {};
  Object.values(SECTIONS).forEach((def) => {
    model[def.key] = {
      authored: false, position: 0, fields: {}, rows: [],
    };
  });
  let def = null;
  let columns = null;
  let position = 0;
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const first = label(cells[0]);
    if (first === 'start section') {
      def = SECTIONS[label(cells[1])] || null;
      columns = def?.order || null;
      if (def) {
        position += 1;
        model[def.key].authored = true;
        model[def.key].position = position;
      }
      return;
    }
    if (first === 'end section') {
      def = null;
      return;
    }
    if (!def) return;
    const section = model[def.key];
    const labels = cells.map((cell) => def.columns?.[label(cell)] || '');
    if (labels.some(Boolean)) {
      columns = labels;
    } else if (def.fields?.[first]) {
      section.fields[def.fields[first]] = cells[1] || null;
    } else if (columns) {
      const item = {};
      columns.forEach((key, i) => { if (key) item[key] = cells[i] || null; });
      section.rows.push(item);
    }
  });
  return model;
}

/** the cell's inline content; paragraphs become line breaks */
function appendInline(target, cell) {
  const blocks = [...cell.children].filter((child) => /^(P|H[1-6])$/.test(child.tagName));
  if (!blocks.length) {
    target.append(...cell.childNodes);
    return;
  }
  blocks.forEach((child, i) => {
    if (i) target.append(el('br'));
    target.append(...child.childNodes);
  });
}

function buildTitle(cell) {
  if (!text(cell)) return null;
  const title = el('h2', 'complete-look-title');
  appendInline(title, cell);
  return title;
}

/** the subtitle as authored (paragraphs, bold, links) */
function buildSubtitle(cell) {
  if (!text(cell)) return null;
  const subtitle = el('div', 'complete-look-subtitle');
  const hasBlocks = [...cell.children].some((child) => /^(P|UL|OL)$/.test(child.tagName));
  if (hasBlocks) {
    subtitle.append(...cell.childNodes);
  } else {
    const p = el('p');
    p.append(...cell.childNodes);
    subtitle.append(p);
  }
  return subtitle;
}

const ratioOf = (img) => {
  const w = img.getAttribute('width');
  const h = img.getAttribute('height');
  return w && h ? `${w} / ${h}` : '';
};

/** the mobile image, swapped for the desktop one from WIDE */
function buildPicture(desktopImg, mobileImg, [desktopWidth, mobileWidth] = ['1600', '750']) {
  const alt = desktopImg.getAttribute('alt') || mobileImg.getAttribute('alt') || '';
  const picture = createOptimizedPicture(mobileImg.src, alt, false, [{ width: mobileWidth }]);
  const desktop = createOptimizedPicture(desktopImg.src, alt, false, [
    { media: WIDE, width: desktopWidth },
    { width: mobileWidth },
  ]);
  picture.prepend(...desktop.querySelectorAll('source[media]'));
  return picture;
}

function buildBanner(cells, titleText) {
  const desktopImg = cells.desktop?.querySelector('img') || cells.mobile?.querySelector('img');
  if (!desktopImg) return null;
  const mobileImg = cells.mobile?.querySelector('img') || desktopImg;
  const href = hrefOf(cells.link);
  const newTab = isTrue(cells.newTab);

  const picture = buildPicture(desktopImg, mobileImg);
  const banner = el(href ? 'a' : 'div', 'complete-look-banner');
  // reserve the image's space so nothing moves when a hidden variant is shown
  banner.style.setProperty('--complete-look-ratio-mobile', ratioOf(mobileImg));
  banner.style.setProperty('--complete-look-ratio-desktop', ratioOf(desktopImg));
  banner.append(picture);
  if (!href) return banner;

  banner.href = href;
  if (newTab) {
    banner.target = '_blank';
    banner.rel = 'noopener noreferrer';
  }
  const ctaName = picture.querySelector('img').alt || titleText;
  banner.addEventListener('click', () => {
    pushAdobeCtaClickEvent({
      event: 'custom_cta_click',
      cta: ctaName,
      destinationUrl: href || '',
      parentTitle: titleText || '',
    });
  });
  // the banner art carries the CTA; its alt text names the link
  if (!picture.querySelector('img').alt && titleText) banner.setAttribute('aria-label', titleText);
  return banner;
}

/** a link when there is an href, else a plain span */
function linkOrSpan(href, newTab, className) {
  const node = el(href ? 'a' : 'span', className);
  if (href) {
    node.href = href;
    if (newTab) {
      node.target = '_blank';
      node.rel = 'noopener noreferrer';
    }
  }
  return node;
}

function buildSwatch(item, newTab) {
  const li = el('li', 'complete-look-swatch');
  // the roomshot image's URL (an image, or a URL as a link or text)
  const roomshot = item.image?.querySelector('img')?.src || hrefOf(item.image);
  if (roomshot) li.dataset.attrSwatchImage = roomshot;
  const link = linkOrSpan(hrefOf(item.link), newTab, 'complete-look-swatch-link');
  const chip = el('span', 'complete-look-swatch-chip');
  chip.setAttribute('aria-hidden', 'true');
  const hex = text(item.hex).match(HEX);
  if (hex) chip.style.backgroundColor = `#${hex[1]}`;
  const name = el('span', 'complete-look-swatch-name');
  name.textContent = text(item.name);
  const number = el('span', 'complete-look-swatch-number');
  number.textContent = text(item.number);
  // the space keeps name and number apart in the link's accessible name
  link.addEventListener('click', () => {
    personaExperienceTagging({
      event: 'custom_cta_click',
      shadeName: text(item.name) || '',
      shadeCode: text(item.number) || '',
      shadePosition: String([...li.parentElement.children].indexOf(li) + 1),
      destinationUrl: hrefOf(item.link) || '',
      parentTitle: link.closest('.complete-look-trending')
        ?.querySelector('.complete-look-trending-title')?.textContent.trim() || '',
    });
  });
  link.append(chip, name, ' ', number);
  li.append(link);
  return li;
}

function buildProduct(item, newTab) {
  const li = el('li', 'complete-look-product');
  const link = linkOrSpan(hrefOf(item.link), newTab, 'complete-look-product-link');
  // the box is kept without an image too, so the names stay in line
  const img = item.image?.querySelector('img');
  // decorative: the name next to it names the link
  const image = img ? createOptimizedPicture(img.src, '', false, [{ width: '240' }]) : el('span');
  image.classList.add('complete-look-product-image');
  const name = el('span', 'complete-look-product-name');
  name.textContent = text(item.name);
  const category = el('span', 'complete-look-product-category');
  category.textContent = text(item.category);
  link.append(image, name, ' ', category);
  link.addEventListener('click', () => {
    personaExperienceTagging({
      event: 'custom_cta_click',
      tileProductName: text(item.name) || '',
      tileProductPosition: String([...li.parentElement.children].indexOf(li) + 1),
      destinationUrl: hrefOf(item.link) || '',
      parentTitle: link.closest('.complete-look-featured')
        ?.querySelector('.complete-look-featured-title')?.textContent.trim() || '',
    });
  });
  li.append(link);
  return li;
}

/**
 * A card under the banner: title, subtitle, a list (swatches or products)
 * and a CTA. The CTA links to the link in its cell, else to "CTA Link".
 * Classes: complete-look-<kind>, complete-look-<kind>-title, -subtitle, -cta.
 */
function buildCard(kind, fields, list) {
  const prefix = `complete-look-${kind}`;
  const card = el('div', prefix);
  if (text(fields.title)) {
    const title = el('h3', `${prefix}-title`);
    title.textContent = text(fields.title);
    card.append(title);
  }
  if (text(fields.subtitle)) {
    const subtitle = el('p', `${prefix}-subtitle`);
    subtitle.textContent = text(fields.subtitle);
    card.append(subtitle);
  }
  if (list) card.append(list);

  const ctaText = text(fields.cta);
  if (ctaText) {
    const href = fields.cta.querySelector('a[href]')?.getAttribute('href') || hrefOf(fields.ctaLink);
    const cta = linkOrSpan(href, isTrue(fields.newTab), `${prefix}-cta`);
    const ctaLabel = el('span', `${prefix}-cta-label`);
    ctaLabel.textContent = ctaText;
    cta.append(ctaLabel);
    cta.insertAdjacentHTML('beforeend', ARROW);
    cta.addEventListener('click', () => {
      pushAdobeCtaClickEvent({
        event: 'custom_cta_click',
        cta: ctaText,
        destinationUrl: href,
        parentTitle: card.querySelector(`.${prefix}-title`)?.textContent.trim() || '',
      });
    });
    card.append(cta);
  }
  return card;
}

function buildList(className, items) {
  if (!items.length) return null;
  const list = el('ul', className);
  list.append(...items);
  return list;
}

/** the "Trending shades" card: colour swatches */
function buildTrending({ authored, fields, rows }) {
  // shown only when "Start Section | Trending Shades" is authored
  if (!authored) return null;
  const swatches = rows.filter((item) => text(item.name) || HEX.test(text(item.hex)));
  if (!text(fields.title) && !swatches.length) return null;
  const newTab = isTrue(fields.newTab);
  const items = swatches.map((item) => buildSwatch(item, newTab));
  return buildCard('trending', fields, buildList('complete-look-swatches', items));
}

/** a row's desktop and mobile images (either one is enough) */
function rowImages(item) {
  const desktop = item.desktop?.querySelector('img') || item.mobile?.querySelector('img');
  return desktop ? { desktop, mobile: item.mobile?.querySelector('img') || desktop } : null;
}

/** the "Ideas section" card: image tiles (each label is part of its image) */
function buildIdeas({ authored, fields, rows }) {
  // shown only when "Start Section | Ideas section" is authored
  if (!authored) return null;
  const ideas = rows
    .map((item) => ({ link: item.link, images: rowImages(item) }))
    .filter((idea) => idea.images);
  if (!text(fields.title) && !ideas.length) return null;
  const newTab = isTrue(fields.newTab);
  const items = ideas.map(({ link, images }) => {
    const li = el('li', 'complete-look-idea');
    const tile = linkOrSpan(hrefOf(link), newTab, 'complete-look-idea-link');
    tile.addEventListener('click', () => {
      personaExperienceTagging({
        event: 'custom_cta_click',
        cta: images.desktop?.alt || '',
        destinationUrl: hrefOf(link) || '',
        parentTitle: text(fields.title) || '',
      });
    });
    tile.append(buildPicture(images.desktop, images.mobile, ['500', '320']));
    li.append(tile);
    return li;
  });
  const list = buildList('complete-look-idea-tiles', items);
  if (list) {
    // all tiles take the first one's shape, so they line up
    const { desktop, mobile } = ideas[0].images;
    list.style.setProperty('--complete-look-idea-ratio-mobile', ratioOf(mobile));
    list.style.setProperty('--complete-look-idea-ratio-desktop', ratioOf(desktop));
  }
  return buildCard('ideas', fields, list);
}

/** the "Featured Products" card: product packshots */
function buildFeatured({ authored, fields, rows }) {
  // shown only when "Start Section | Featured Products" is authored
  if (!authored) return null;
  const products = rows.filter((item) => text(item.name) || item.image?.querySelector('img'));
  if (!text(fields.title) && !products.length) return null;
  const newTab = isTrue(fields.newTab);
  const items = products.map((item) => buildProduct(item, newTab));
  return buildCard('featured', fields, buildList('complete-look-products', items));
}

// START FORM POPUP: like choose-plan and columns, an image card whose
// Redirection link is "Popup" (or a "#form" link) opens the "Book a FREE Site
// Visit" lead form pop-up: the form page of the header CTA (data-modal-path),
// else the "site-visit-modal" page metadata, else the default form page, in
// the site's modal block (loaded on the first click). If the pop-up can't
// open, the form page itself is opened.
const DEFAULT_SITE_VISIT_MODAL = '/eds/forms/book-free-site-visit';
const isFormPopup = (href) => /^(popup|#form)$/i.test(href);
let popupOpening = false;

async function openFormPopup() {
  if (popupOpening) return;
  popupOpening = true;
  const modalPath = document.querySelector('.trigger-book-free-site-visit-modal[data-modal-path]')?.dataset.modalPath
    || getMetadata('site-visit-modal') || DEFAULT_SITE_VISIT_MODAL;
  try {
    const { openModal } = await import('../modal/modal.js');
    await openModal(modalPath);
  } catch (e) {
    window.location.href = modalPath;
  } finally {
    popupOpening = false;
  }
}
// END FORM POPUP

/**
 * An "Image left section" / "Image right section" card: one linked image (the
 * art carries its own CTA). On desktop it fills the height of the card next
 * to it. Like the other cards, it sits where it is authored. With "Popup" as
 * its Redirection link it is a button that opens the form pop-up.
 */
function buildImageCard({ authored, fields, rows }, side) {
  // shown only when its "Start Section" is authored
  if (!authored) return null;
  const item = rows.find(rowImages);
  if (!item) return null;
  const { desktop, mobile } = rowImages(item);
  const href = hrefOf(item.link);
  const className = `complete-look-image-card complete-look-image-${side}`;
  let card;
  if (isFormPopup(href)) {
    card = el('button', className);
    card.type = 'button';
    card.setAttribute('aria-haspopup', 'dialog');
    card.addEventListener('click', openFormPopup);
  } else {
    card = linkOrSpan(href, isTrue(fields.newTab), className);
  }
  card.style.setProperty('--complete-look-image-ratio-mobile', ratioOf(mobile));
  card.style.setProperty('--complete-look-image-ratio-desktop', ratioOf(desktop));
  card.append(buildPicture(desktop, mobile, ['1200', '750']));
  return card;
}

/** a "PQC section" CTA (the link in its cell), with an arrow */
function buildPqcCta(cell, newTab) {
  if (!text(cell)) return null;
  const href = cell.querySelector('a[href]')?.getAttribute('href') || '';
  const cta = linkOrSpan(href, newTab, 'complete-look-pqc-cta');
  const ctaLabel = el('span', 'complete-look-pqc-cta-label');
  ctaLabel.textContent = text(cell);
  cta.append(ctaLabel);
  cta.insertAdjacentHTML('beforeend', ARROW);
  return cta;
}

/**
 * The "PQC section" Download CTA: a button that makes the PDF from the same
 * API response, with the paint-quotation-tool block's PDF module (pdf.js).
 * That module reads its progress / error elements from the button's wrapper.
 */
function buildPqcDownload(cell, getPdfOptions) {
  if (!text(cell)) return null;
  const wrap = el('div', 'complete-look-pqc-download');
  const button = el('button', 'complete-look-pqc-cta');
  button.type = 'button';
  const ctaLabel = el('span', 'complete-look-pqc-cta-label');
  ctaLabel.textContent = text(cell);
  button.append(ctaLabel);
  button.insertAdjacentHTML('beforeend', ARROW);
  const error = el('p', 'complete-look-pqc-pdf-error');
  const status = el('p', 'complete-look-pqc-sr-only');
  status.setAttribute('aria-live', 'polite');
  button.addEventListener('click', async () => {
    const { default: downloadPdf } = await import('../paint-quotation-tool/pdf.js');
    downloadPdf({ button, ...getPdfOptions() });
  });
  wrap.append(button, error, status);
  return wrap;
}

/** reads a cookie's raw value ('' when absent) */
function readCookie(name) {
  const entry = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : '';
}

/**
 * The estimate inputs (area, paint, category) from the PQCarea, PQCpaint and
 * PQCcategory of the PQC_COOKIE JSON; null unless isPQCCompleted is 1 and
 * the cookie has all three.
 */
function readPqcInputs() {
  let journey;
  try {
    journey = JSON.parse(decodeURIComponent(readCookie(PQC_COOKIE)));
  } catch {
    return null;
  }
  if (Number(journey?.isPQCCompleted) !== 1) return null;
  const inputs = {};
  Object.entries(PQC_INPUTS).forEach(([param, key]) => {
    // the cookie may hold "Fresh+Painting"; the API needs a space (sent as "+")
    inputs[param] = String(journey?.[key] ?? '').replace(/\+/g, ' ').trim();
  });
  return Object.values(inputs).every(Boolean) ? inputs : null;
}

/** the systems (array) of the calculator API's response for the inputs */
async function fetchPqcEstimate(inputs) {
  const params = new URLSearchParams({ ...PQC_REQUEST_DEFAULTS, ...inputs });
  const res = await fetch(`${PQC_ENDPOINT}?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** an API path (e.g. the packshot) on the environment's site host */
const siteUrl = (path) => {
  const clean = (path || '').trim();
  if (!clean || /^https?:\/\//.test(clean)) return clean;
  return SITE_HOST + (clean.startsWith('/') ? clean : `/${clean}`);
};

/** the card's product: packshot, name and figures of an API system */
function buildPqcProduct(system, area) {
  const name = system.entityName || system.title || '';
  const cost = Number(system.bhpsCost) || 0;
  const perSqft = Number(system.totalCostPerSqFt) || 0;
  const paintArea = perSqft ? Math.round(cost / perSqft) : 0;
  const factor = Number(area) ? Number((paintArea / Number(area)).toFixed(2)) : 0;

  const product = el('div', 'complete-look-pqc-product');
  const src = siteUrl(system.swatchImage);
  if (src) {
    const packshot = el('img', 'complete-look-pqc-packshot');
    // decorative: the product name is next to it
    packshot.alt = '';
    packshot.src = src;
    [packshot.width, packshot.height] = PQC_PACKSHOT_SIZE;
    // lazy, so a hidden variant does not load it
    packshot.loading = 'lazy';
    product.append(packshot);
  }
  const details = el('div', 'complete-look-pqc-details');
  const nameNode = el('p', 'complete-look-pqc-name');
  nameNode.textContent = name;
  const figures = el('dl', 'complete-look-pqc-figures');
  // [label, value, marked with a red asterisk]
  [
    [`Total Estimated cost for ${area} sqft`, `Rs.${cost.toFixed(2)}`, true],
    [`Total area for painting ( ${area} x ${factor} )`, `${paintArea} sqft`],
    ['Per SQFT cost', `Rs.${perSqft.toFixed(2)}`],
  ].forEach(([term, value, marked]) => {
    const dt = el('dt');
    dt.textContent = term;
    const dd = el('dd');
    dd.textContent = value;
    if (marked) {
      const mark = el('span', 'complete-look-pqc-mark');
      mark.textContent = '*';
      dd.append(mark);
    }
    figures.append(dt, dd);
  });
  details.append(nameNode, figures);
  product.append(details);
  return product;
}

/**
 * The "PQC section" background: the authored desktop / mobile image behind
 * the card (decorative), its box kept to the image's shape; null without one.
 */
function buildPqcBackground(box, fields) {
  const images = rowImages({ desktop: fields.bgDesktop, mobile: fields.bgMobile });
  if (!images) return null;
  box.classList.add('complete-look-pqc-with-bg');
  box.style.setProperty('--complete-look-pqc-ratio-mobile', ratioOf(images.mobile));
  box.style.setProperty('--complete-look-pqc-ratio-desktop', ratioOf(images.desktop));
  const picture = buildPicture(images.desktop, images.mobile);
  picture.classList.add('complete-look-pqc-bg');
  picture.querySelector('img').alt = '';
  return picture;
}

/**
 * The "PQC section" card: the painting estimate (title, subtitle, label and
 * CTAs from DA; packshot, product name and figures from the calculator API),
 * on the background image when one is authored. Hidden until the estimate
 * loads.
 */
function buildPqc({ authored, fields }) {
  // shown only when "Start Section | PQC section" is authored
  if (!authored) return null;
  const box = el('div', 'complete-look-pqc');
  box.hidden = true;
  const card = el('div', 'complete-look-pqc-card');
  const background = buildPqcBackground(box, fields);
  if (background) box.append(background);
  box.append(card);
  [
    ['h3', 'title'],
    ['p', 'subtitle'],
    ['p', 'label'],
  ].forEach(([tag, key]) => {
    if (!text(fields[key])) return;
    const node = el(tag, `complete-look-pqc-${key}`);
    node.textContent = text(fields[key]);
    card.append(node);
  });

  const newTab = isTrue(fields.newTab);
  const inputs = readPqcInputs();
  let systems = [];
  const ctas = [
    buildPqcDownload(fields.download, () => ({
      system: systems[0],
      systems,
      area: inputs.area,
      // pdf.js copy and pages not authored here use its defaults
      config: PQC_PDF_CONFIG,
      labels: PQC_PDF_LABELS,
      lead: null,
    })),
    buildPqcCta(fields.calculate, newTab),
  ].filter(Boolean);
  const ctaRow = el('div', 'complete-look-pqc-ctas');
  ctaRow.append(...ctas);

  if (inputs) {
    fetchPqcEstimate(inputs)
      .then((data) => {
        systems = data;
        const [system] = data;
        if (!system) return;
        card.append(buildPqcProduct(system, inputs.area));
        if (ctas.length) card.append(ctaRow);
        box.hidden = false;
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('complete-look: the painting estimate failed to load', err);
      });
  }
  return box;
}

/** shows the block's wrapper only when it is the active variant */
function applyVariant(block) {
  block.parentElement.hidden = block.dataset.variant !== activeVariant;
}

/**
 * Shows the complete-look block of one variant and hides the others
 * (blocks decorated later follow it too).
 * @param {string} variant e.g. 'product-variant'
 */
export function showVariant(variant) {
  activeVariant = VARIANTS.includes(variant) ? variant : DEFAULT_VARIANT;
  document.querySelectorAll('.complete-look[data-variant]').forEach(applyVariant);
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const {
    heading, banner, trending, featured, ideas, imageLeft, imageRight, pqc,
  } = readModel(block);
  block.dataset.variant = VARIANTS.find((v) => block.classList.contains(v)) || DEFAULT_VARIANT;

  // each section only when its "Start Section" is authored
  const inner = el('div', 'complete-look-inner');
  const title = heading.authored ? buildTitle(heading.fields.title) : null;
  const subtitle = heading.authored ? buildSubtitle(heading.fields.subtitle) : null;
  if (title || subtitle) {
    const content = el('div', 'complete-look-text');
    if (title) content.append(title);
    if (subtitle) content.append(subtitle);
    inner.append(content);
  }
  // the PQC estimate card takes the banner's place
  const media = buildPqc(pqc)
    || (banner.authored ? buildBanner(banner.rows[0] || {}, text(title)) : null);
  if (media) inner.append(media);

  // the cards under the banner, in authored order (two per row on desktop);
  // "Image left section" stands in for Featured Products: shown only without it
  const featuredCard = buildFeatured(featured);
  const cardList = [
    [trending, buildTrending(trending)],
    [featured, featuredCard],
    [ideas, buildIdeas(ideas)],
    [imageLeft, featuredCard ? null : buildImageCard(imageLeft, 'left')],
    [imageRight, buildImageCard(imageRight, 'right')],
  ]
    .filter(([, card]) => card)
    .sort(([a], [b]) => a.position - b.position);
  if (cardList.length) {
    const cards = el('div', 'complete-look-cards');
    cards.append(...cardList.map(([, card]) => card));
    inner.append(cards);
  }

  block.replaceChildren(...(inner.children.length ? [inner] : []));
  applyVariant(block);
}
