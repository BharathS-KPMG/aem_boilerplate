/**
 * Columns block
 *
 * Authoring format (DA):
 *
 * | columns                                                              |
 * |----------------------------------------------------------------------|
 * | Title | Roots of Royal play                                          |
 * | Desktop image | Mobile image | Title | Subtitle | CTA Label |         |
 * |   Open in new tab | Redirection or Download | Link                   |
 * | <img> | <img> | <text> | <text> | Download PDF | false | Redirection |
 * |   /catalogue/interior-textures.html?f=...                            |
 * | ...one row per item, same 8 columns...                               |
 *
 * Row 1 (2 cols)  : "Title" label + section title.
 * Row 2 (8 cols)  : Header labels (for authors only).
 * Row 3+ (8 cols) : One item per row:
 *   1. Desktop image   - picture shown at desktop widths
 *   2. Mobile image    - picture shown at mobile widths
 *   3. Title           - item title (optional)
 *   4. Subtitle        - item description text
 *   5. CTA Label       - button text, e.g. "Download PDF"
 *   6. Open in new tab - "true" opens the link in a new tab, "false" in the same tab
 *   7. Redirection or Download - "Redirection" navigates to the link,
 *                                "Download" downloads the linked file,
 *                                "Popup" opens the lead form pop-up (see openFormPopup)
 *   8. Link            - CTA target URL / asset path (optional for "Popup": only
 *                        followed if the pop-up can't open)
 *
 * No CTA label but a Link (or "Popup"): there is no button, the image itself is
 * the link (same new-tab and Redirection / Download / Popup settings). All variants.
 *
 * Variants:
 *   (default)           - title is all black
 *   color-title-variant - author as "columns (color title variant)".
 *                         The last 2 words of the title get the gradient, the
 *                         rest stays black: "Roots of Royale Play" ->
 *                         "Roots of" black, "Royale Play" gradient.
 *                         If the author bolds words, those are used instead.
 */
import { getMetadata } from '../../scripts/aem.js';
import { pushAdobeCtaClickEvent, formatTitle } from '../../scripts/analytics_1.js';

const ITEM_CELLS = 8;
const DESKTOP_MEDIA = '(min-width: 900px)';
const COLOR_TITLE_WORDS = 2;

const cellText = (cell) => cell?.textContent.trim() || '';

const OVERRIDE = [
  {
    match: 'paint-quotation-tool',
    bannerName: 'Find out your painting cost with a quick estimate',
    cta: 'Calculate now',
  },
  {
    match: 'waterproofing-budget-calculator',
    bannerName: 'Estimate your waterproofing cost',
    cta: 'Calculate now',
  },
  {
    match: 'plain-finishes',
    bannerName: 'Ready to bring inspiration to life?',
    cta: 'Get Started',
  },

];

/**
 * Merges desktop and mobile pictures into one responsive picture, so only
 * the image for the current viewport is downloaded.
 * @param {Element} desktopCell cell holding the desktop picture
 * @param {Element} mobileCell cell holding the mobile picture
 * @returns {Element|null} the picture element
 */
function buildPicture(desktopCell, mobileCell) {
  const desktop = desktopCell?.querySelector('picture');
  const mobile = mobileCell?.querySelector('picture');
  if (!desktop || !mobile) return desktop || mobile || null;

  const desktopImg = desktop.querySelector('img');
  const desktopSources = [...desktop.querySelectorAll('source')];
  if (!desktopSources.length && desktopImg) {
    const source = document.createElement('source');
    source.srcset = desktopImg.currentSrc || desktopImg.src;
    desktopSources.push(source);
  }
  desktopSources.reverse().forEach((source) => {
    source.media = DESKTOP_MEDIA;
    mobile.prepend(source);
  });

  const mobileImg = mobile.querySelector('img');
  if (mobileImg && !mobileImg.alt && desktopImg?.alt) mobileImg.alt = desktopImg.alt;
  return mobile;
}

// START FORM POPUP: like choose-plan, "Popup" in the Redirection or Download column opens the
// "Book a FREE Site Visit" lead form pop-up: the form page of the header CTA (data-modal-path),
// else the "site-visit-modal" page metadata, else the stg form page, in the site's modal block
// (loaded on the first click). If the pop-up can't open, the authored Link (if any) is followed.
const DEFAULT_SITE_VISIT_MODAL = '/eds/forms/book-free-site-visit';

async function openFormPopup(fallback) {
  const modalPath = document.querySelector('.trigger-book-free-site-visit-modal[data-modal-path]')?.dataset.modalPath
    || getMetadata('site-visit-modal') || DEFAULT_SITE_VISIT_MODAL;
  try {
    const { openModal } = await import('../modal/modal.js');
    await openModal(modalPath);
  } catch (e) {
    if (fallback) window.location.href = fallback;
  }
}
// END FORM POPUP

/**
 * Builds an item link (CTA or image) with its target and click tracking.
 * @param {string} href link target
 * @param {string} label name sent with the click event
 * @param {boolean} newTab open in new tab
 * @param {string} mode "redirection", "download" or "popup"
 * @returns {Element} the link
 */
function buildLink(href, label, newTab, mode) {
  const isDownload = mode === 'download';
  const link = document.createElement('a');
  link.href = href || '#';
  if (mode === 'popup') {
    link.setAttribute('aria-haspopup', 'dialog');
    link.addEventListener('click', (event) => {
      event.preventDefault();
      openFormPopup(href);
    });
  } else if (isDownload) {
    link.setAttribute('download', '');
  }
  if (newTab && mode !== 'popup') {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    if (isDownload) {
      link.removeAttribute('download');
    }
  }
  link.addEventListener('click', () => {
    // read at click time: the link is not in the block yet while it is built
    // const imageAlt = link.closest('.columns')?.querySelector('img')?.alt || '';

    const imageAlt = link.closest('div')
      ?.querySelector('img')
      ?.alt || '';

    const cardTitle = link.closest('div')
      ?.querySelector('.columns-item-title')
      ?.textContent
      ?.trim() || '';

    const hasPersonaVariant = document.body.classList.contains('control-variant-persona')
      || document.body.classList.contains('product-variant-persona')
      || document.body.classList.contains('cost-variant-persona');

    if (/\.pdf($|[?#])/i.test(href)) {
      const pdfName = href.split(/[?#]/)[0].split('/').pop().replace(/\.pdf$/i, '');
      pushAdobeCtaClickEvent({
        event: 'download_multiple_pdf',
        pdfName,
        title: imageAlt,
      });
      return;
    }

    const overrideMatch = OVERRIDE.find((item) => href.includes(item.match));
    const eventData = {
      cta: label,
      parentTitle: cardTitle || formatTitle(imageAlt),
      destinationUrl: href,
      event: 'custom_cta_click',
    };
    if (hasPersonaVariant && overrideMatch) {
      eventData.cta = overrideMatch.cta;
      eventData.bannerName = overrideMatch.bannerName;
    }
    pushAdobeCtaClickEvent(eventData);
  });

  return link;
}

/**
 * Builds the CTA button for an item.
 * @param {string} label CTA label
 * @param {string} href link target
 * @param {boolean} newTab open in new tab
 * @param {string} mode "redirection", "download" or "popup"
 * @returns {Element|null} the CTA container
 */
function buildCta(label, href, newTab, mode) {
  if (!label || (!href && mode !== 'popup')) return null;

  const link = buildLink(href, label, newTab, mode);
  link.className = `button ${mode === 'download' ? 'columns-cta-download' : 'columns-cta-redirect'}`;
  if (mode === 'popup') link.classList.add('columns-cta-popup');
  link.textContent = label;
  link.title = label;

  const container = document.createElement('p');
  container.className = 'button-container';
  container.append(link);
  return container;
}

/**
 * Builds the block title from the "Title" row.
 * @param {Element} block the block element
 * @param {Element} cell cell holding the title
 * @returns {Element} the title wrapper
 */
function buildTitle(block, cell) {
  const source = cell.children.length === 1 && cell.firstElementChild.tagName === 'P'
    ? cell.firstElementChild
    : cell;
  const heading = document.createElement('h2');
  heading.append(...source.childNodes);

  // color-title-variant: highlight the last words, unless the author bolded some
  if (block.classList.contains('color-title-variant') && !heading.querySelector('strong')) {
    const words = heading.textContent.trim().split(/\s+/);
    const highlight = document.createElement('strong');
    highlight.textContent = words.splice(-COLOR_TITLE_WORDS).join(' ');
    heading.replaceChildren(words.length ? `${words.join(' ')} ` : '', highlight);
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'columns-title';
  wrapper.append(heading);
  return wrapper;
}

/**
 * Builds one column (picture, title, subtitle, CTA) from an item row.
 * @param {Element[]} cells the 8 item cells
 * @returns {Element} the column element
 */
function buildColumn(cells) {
  const [desktopCell, mobileCell, titleCell, subtitleCell,
    ctaCell, newTabCell, typeCell, linkCell] = cells;
  const col = document.createElement('div');

  const href = linkCell?.querySelector('a')?.href || cellText(linkCell);
  const label = cellText(ctaCell);
  const newTab = cellText(newTabCell).toLowerCase() === 'true';
  const type = cellText(typeCell).toLowerCase();
  const mode = ['download', 'popup'].includes(type) ? type : 'redirection';
  const title = cellText(titleCell);

  const picture = buildPicture(desktopCell, mobileCell);
  if (picture) {
    const p = document.createElement('p');
    if ((href || mode === 'popup') && !label) {
      // no CTA button: the image is the link
      const alt = picture.querySelector('img')?.alt || '';
      const link = buildLink(href, alt || title, newTab, mode);
      link.className = 'columns-image-link';
      if (!alt && title) link.setAttribute('aria-label', title);
      link.append(picture);
      p.append(link);
    } else {
      p.append(picture);
    }
    col.append(p);
  }

  if (title) {
    const p = document.createElement('p');
    p.className = 'columns-item-title';
    const strong = document.createElement('strong');
    strong.textContent = title;
    p.append(strong);
    col.append(p);
  }

  if (cellText(subtitleCell)) {
    const hasParagraphs = [...subtitleCell.children].some((el) => el.tagName === 'P');
    if (hasParagraphs) {
      [...subtitleCell.children].forEach((el) => el.classList.add('columns-item-subtitle'));
      col.append(...subtitleCell.childNodes);
    } else {
      const p = document.createElement('p');
      p.className = 'columns-item-subtitle';
      p.append(...subtitleCell.childNodes);
      col.append(p);
    }
  }

  const cta = buildCta(label, href, newTab, mode);
  if (cta) col.append(cta);

  return col;
}

/**
 * loads and decorates the block
 * Each item row becomes one column of a single row.
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const row = document.createElement('div');
  let title = null;

  [...block.children].forEach((authoredRow) => {
    const cells = [...authoredRow.children];

    if (cells.length !== ITEM_CELLS) {
      if (cellText(cells[0]).toLowerCase() === 'title' && cellText(cells[1])) {
        title = buildTitle(block, cells[1]);
      }
      return;
    }

    // header row with author-facing labels
    if (cellText(cells[0]).toLowerCase() === 'desktop image') return;

    row.append(buildColumn(cells));
  });

  block.replaceChildren(...(title ? [title] : []), row);
}
