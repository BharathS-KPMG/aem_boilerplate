import { createOptimizedPicture } from '../../scripts/aem.js';
import { BETA_DOMAIN, isProdDomain } from '../../scripts/environment.js';
import { pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';

/**
 * Banner Float
 * Full-width image banner from the asianpaints.com product pages
 * (bannerFloatVariant-3Item, e.g. "Explore More At Our Stores"): a photo with a
 * centred white heading and a button on top of it.
 *
 * Authoring model (DA): a header row of labels, then one row of values:
 *   Desktop image | Mobile image | Title | Description | Open in new tab | CTA text | Link
 *   <img> | <img> | Explore more at our stores | | false | LOCATE DEALER | /store-locator.html
 * Columns are matched by their header label; without a header row they are
 * read in the order above. Mobile image is optional (defaults to the desktop
 * image). Description is optional rich text shown under the title.
 * A line break (Shift+Enter) in Title or Description is kept.
 * "Open in new tab" = true opens the link in a new tab.
 *
 * Older pages use one cell per row (cells are recognised by their content):
 *   image row   | desktop image | mobile image (optional)
 *   heading row | Explore More At Our Stores
 *   button row  | LOCATE DEALER link
 * A block with no row wider than two cells is read that way.
 *
 * Variant "ids-type-variant" (Beautiful Homes stores, interior-design-solutions):
 * dark title and description above the photo instead of on it. The photo carries
 * its own grid and labels, so there is no button: only its bottom-right
 * "Find a store" cell links to Link. CTA text (e.g. "Find a store") is that
 * link's screen-reader label; it falls back to the title. Its line breaks apply
 * on mobile only: on desktop the title and description run on one line each.
 *
 * @param {Element} block The block element
 */

const DESKTOP = '(min-width: 992px)';

// value columns, by header text (lower-cased)
const COLUMNS = {
  'desktop image': 'desktop',
  'mobile image': 'mobile',
  title: 'title',
  description: 'description',
  'open in new tab': 'newTab',
  'cta text': 'ctaText',
  link: 'link',
};
// column order when there is no header row
const ORDER = ['desktop', 'mobile', 'title', 'description', 'newTab', 'ctaText', 'link'];

const text = (cell) => (cell?.textContent || '').replace(/\s+/g, ' ').trim();

/**
 * The cell's text as the lines the author broke it into (line breaks or
 * paragraphs), each with its whitespace collapsed.
 * @param {Element|null} cell The cell
 * @returns {string[]} The lines
 */
function textLines(cell) {
  if (!cell) return [];
  cell.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  cell.querySelectorAll('p').forEach((p) => p.append('\n'));
  return cell.textContent.split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Reads the table: the header row (if any) and the first value row.
 * @param {Element[][]} rows The block's rows, as arrays of cells
 * @returns {Object|null} banner fields, or null when there is no value row
 */
function readTable(rows) {
  const isHeader = (cells) => cells
    .filter((cell) => COLUMNS[text(cell).toLowerCase()]).length >= 2;
  const header = rows.find(isHeader);
  const values = rows.find((cells) => cells !== header && cells.length > 2);
  // a header row with no values yet is still the new table (don't show its labels)
  if (!values) return header ? {} : null;

  const columns = header ? header.map((cell) => COLUMNS[text(cell).toLowerCase()] || '') : ORDER;
  const cell = {};
  columns.forEach((key, i) => { if (key) cell[key] = values[i] || null; });
  const desktopImg = cell.desktop?.querySelector('img') || cell.mobile?.querySelector('img');
  return {
    desktopImg,
    mobileImg: cell.mobile?.querySelector('img') || desktopImg,
    headingLines: textLines(cell.title),
    description: cell.description || null,
    ctaText: text(cell.ctaText),
    href: cell.link?.querySelector('a[href]')?.getAttribute('href') || text(cell.link),
    newTab: /^(true|yes)$/i.test(text(cell.newTab)),
  };
}

/**
 * Reads the older one-cell-per-row layout, recognising cells by their content.
 * @param {Element} block The block element
 * @returns {Object} banner fields
 */
function readLegacy(block) {
  const [desktopImg, mobileImg = desktopImg] = block.querySelectorAll('img');
  const link = [...block.querySelectorAll('a')].find((a) => !a.querySelector('img'));
  const headingEl = block.querySelector('h1, h2, h3, h4, h5, h6');
  const textCell = headingEl || [...block.querySelectorAll(':scope > div > div')]
    .find((cell) => !cell.querySelector('img, a') && cell.textContent.trim());
  return {
    desktopImg,
    mobileImg,
    headingLines: textLines(textCell),
    ctaText: text(link),
    href: link?.getAttribute('href') || '',
    newTab: false,
  };
}

function readFields(block) {
  const rows = [...block.children].map((row) => [...row.children]);
  return readTable(rows) || readLegacy(block);
}

/**
 * Keeps the CTA on the domain the page is served from: an authored
 * www/beta asianpaints.com link gets the current origin, keeping its path,
 * query and hash. Relative links already resolve to it; other sites are kept.
 * @param {string} href The authored link
 * @returns {string} The link to use
 */
function toCurrentDomain(href) {
  try {
    const url = new URL(href, window.location.href);
    const host = url.hostname.toLowerCase();
    if (!isProdDomain(host) && host !== BETA_DOMAIN) return href;
    return `${window.location.origin}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

function createElement(tag, className, ...children) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.append(...children.filter((child) => child !== null && child !== undefined));
  return el;
}

/**
 * Marks an authored line break so CSS can drop it where the text fits on one
 * line; the space keeps the words apart when it is dropped.
 * @param {HTMLBRElement} br The line break
 */
function markBreak(br) {
  br.classList.add('banner-float-break');
  br.before(' ');
}

function buildHeading(lines) {
  const heading = createElement('h2', '');
  lines.forEach((line, i) => {
    if (i) {
      const br = createElement('br', '');
      heading.append(br);
      markBreak(br);
    }
    heading.append(line);
  });
  return heading;
}

/**
 * Smaller desktops zoom out like the reference page, which does it with a
 * page-wide `body { zoom }`. When the page itself is already zoomed (e.g. the
 * asianpaints.com header styles are on the page), the block must not zoom a
 * second time, so it gets a `data-page-zoomed` attribute and its CSS switches its
 * own zoom off. Those styles can arrive after the block is decorated (the header
 * loads later), so the check reruns whenever the block's wrapper changes size:
 * a page zoom changes its width in CSS pixels, and so does resizing the window.
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

function buildPicture(desktopImg, mobileImg) {
  const alt = desktopImg.getAttribute('alt') || mobileImg.getAttribute('alt') || '';
  const picture = createOptimizedPicture(mobileImg.src, alt, false, [{ width: '750' }]);
  const desktop = createOptimizedPicture(desktopImg.src, alt, false, [
    { media: DESKTOP, width: '2000' },
    { width: '750' },
  ]);
  picture.prepend(...desktop.querySelectorAll('source[media]'));
  return picture;
}

/**
 * The description under the title, keeping the author's formatting
 * (paragraphs, bold, links); links stay on the current domain like the CTA.
 * @param {Element|null} cell The Description cell
 * @returns {Element|null} The description, or null when the cell is empty
 */
function buildDescription(cell) {
  if (!text(cell)) return null;
  const description = createElement('div', 'banner-float-description');
  const hasParagraphs = [...cell.children].some((child) => /^(P|UL|OL)$/.test(child.tagName));
  if (hasParagraphs) description.append(...cell.childNodes);
  else description.append(createElement('p', '', ...cell.childNodes));
  description.querySelectorAll('a[href]').forEach((a) => {
    a.href = toCurrentDomain(a.getAttribute('href'));
  });
  description.querySelectorAll('br').forEach(markBreak);
  return description;
}

function buildLink(href, newTab, className, ...children) {
  const link = createElement('a', className, ...children);
  link.href = toCurrentDomain(href);
  if (newTab) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  return link;
}

export default function decorate(block) {
  const {
    desktopImg, mobileImg, headingLines, description, ctaText, href, newTab,
  } = readFields(block);
  const heading = headingLines.join(' ');
  const isIds = block.classList.contains('ids-type-variant');

  const content = createElement('div', 'banner-float-content');
  if (heading) content.append(buildHeading(headingLines));
  const descriptionEl = buildDescription(description);
  if (descriptionEl) content.append(descriptionEl);
  if (!isIds && ctaText && href) {
    const cta = buildLink(href, newTab, 'banner-float-cta', ctaText);
    cta.addEventListener('click', () => {
      pushAdobeCtaClickEvent({
        destinationUrl: new URL(href, window.location.origin).href || href,
        event: 'custom_cta_click',
        cta: ctaText,
        parentTitle: heading,
      });
    });
    content.append(createElement('p', 'banner-float-cta-wrap', cta));
  }

  const media = createElement('div', 'banner-float-media');
  if (desktopImg) media.append(buildPicture(desktopImg, mobileImg));

  if (isIds) {
    // only the photo's "Find a store" cell is a link, not the whole photo
    if (href && desktopImg) {
      const label = createElement('span', 'banner-float-hotspot-label', ctaText || heading);

      const hotspot = buildLink(href, newTab, 'banner-float-hotspot', label);
      hotspot.addEventListener('click', () => {
        pushAdobeCtaClickEvent({
          destinationUrl: new URL(href, window.location.origin).href || href,
          event: 'cta_link_text',
          cta: 'Find a store',
          parentTitle: ctaText || heading,
        });
      });
      media.append(hotspot);
      // media.append(buildLink(href, newTab, 'banner-float-hotspot', label));
    }
    block.replaceChildren(createElement('div', 'banner-float-inner', content, media));
  } else {
    media.append(content);
    block.replaceChildren(createElement('div', 'banner-float-inner', media));
  }
  syncPageZoom(block);
}
