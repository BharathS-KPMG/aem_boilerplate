/*
** Authoring format **

Row 1 (Title)
Col 1 → Label "Title"
Col 2 → Carousel title (e.g. "Our shade cards")

Row 2 (optional column labels, ignored)
Desktop image | Mobile image | Title | Subtitle | CTA label | Link

Row 3 onwards (one row per card)
Col 1 → Desktop image (picture)
Col 2 → Mobile image (picture) - shown below 600px, falls back to the desktop image
Col 3 → Card title (e.g. "Royale Shade Card")
Col 4 → Subtitle (e.g. "Premium colour inspiration guide for interiors.")
Col 5 → CTA label (e.g. "Download PDF")
Col 6 → Link (e.g. /content/dam/asian_paints/.../Royale-Shade-Card-PDF-new.pdf)

----------------------------------------
Variant: magazine
(block authored as "multi-carousel (magazine)")

Same authoring format. Dark section, no arrows or dots; cards stack on mobile
and sit in a 3-column grid on desktop (Swiper is not initialised).

----------------------------------------
===== DESIGN-CARDS START =====
Variant: design-cards
(block authored as "multi-carousel (design-cards)")

Same authoring format; Subtitle and CTA label are not used. The whole card
(image + title with an arrow) links to Link. 340px cards with dots below 992px;
4.2 cards with round arrows top right from 992px (like the live wall coverings
"Design That Holds A Room Together" row).
===== DESIGN-CARDS END =====
*/
import { createOptimizedPicture } from '../../scripts/aem.js';
import { pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';

const DESKTOP_MEDIA = '(min-width: 600px)';

/**
 * @param {Element} cell
 * @returns {string} trimmed text of the cell
 */
const text = (cell) => (cell?.textContent || '').trim();

/**
 * builds a picture that shows the mobile image below 600px and the desktop image above
 * @param {HTMLImageElement} desktop desktop image
 * @param {HTMLImageElement} mobile mobile image
 * @param {string} alt alternative text
 * @returns {HTMLPictureElement}
 */
function buildPicture(desktop, mobile, alt) {
  const base = mobile || desktop;
  const picture = createOptimizedPicture(base.src, alt, false, [{ width: '750' }]);
  if (desktop && mobile && desktop.src !== mobile.src) {
    const desktopPicture = createOptimizedPicture(desktop.src, alt, false, [
      { media: DESKTOP_MEDIA, width: '750' },
      { width: '750' },
    ]);
    picture.prepend(...desktopPicture.querySelectorAll('source[media]'));
  }
  return picture;
}

/**
 * builds a card from a row:
 * desktop image | mobile image | title | subtitle | cta label | link
 * @param {Element} row the block row
 * @returns {HTMLLIElement}
 */
function buildCard(row) {
  const [desktopCell, mobileCell, titleCell, subtitleCell, labelCell, linkCell] = row.children;
  const desktopImg = desktopCell?.querySelector('img');
  const mobileImg = mobileCell?.querySelector('img');
  const title = text(titleCell);

  const card = document.createElement('li');
  card.className = 'multi-carousel-card swiper-slide';

  const image = document.createElement('div');
  image.className = 'multi-carousel-image';
  const alt = desktopImg?.alt || mobileImg?.alt || title;
  image.append(buildPicture(desktopImg, mobileImg, alt));

  const body = document.createElement('div');
  body.className = 'multi-carousel-body';

  if (title) {
    const heading = document.createElement('h3');
    heading.textContent = title;
    body.append(heading);
  }

  const subtitle = text(subtitleCell);
  if (subtitle) {
    const p = document.createElement('p');
    p.textContent = subtitle;
    body.append(p);
  }

  // the link cell may hold an anchor or the plain path
  const href = linkCell?.querySelector('a[href]')?.getAttribute('href') || text(linkCell);
  if (href) {
    const label = text(labelCell) || 'Download PDF';
    const link = document.createElement('a');
    link.className = 'multi-carousel-download';
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = label;
    if (title) link.setAttribute('aria-label', `${label}: ${title}`);
    const cta = document.createElement('p');
    cta.className = 'multi-carousel-cta';
    cta.append(link);
    body.append(cta);
    link.addEventListener('click', () => {
      // read at click time: the card is not in the block yet while it is built
      const blockTitle = link.closest('.multi-carousel')?.querySelector('.multi-carousel-header h2')?.textContent?.trim() || '';
      const pdfName = href.split('/').pop().replace('.pdf', '');
      pushAdobeCtaClickEvent({
        event: 'download_multiple_pdf',
        title: blockTitle,
        pdfName,
      });
    });
  }

  card.append(image, body);
  return card;
}

// ===== DESIGN-CARDS START =====
/**
 * design-cards: the whole card (image + title) is one link
 * desktop image | mobile image | title | (subtitle) | (cta label) | link
 * @param {Element} row the block row
 * @returns {HTMLLIElement}
 */
function buildLinkCard(row) {
  const [desktopCell, mobileCell, titleCell, , , linkCell] = row.children;
  const desktopImg = desktopCell?.querySelector('img');
  const mobileImg = mobileCell?.querySelector('img');
  const title = text(titleCell);
  const href = linkCell?.querySelector('a[href]')?.getAttribute('href') || text(linkCell);

  const card = document.createElement('li');
  card.className = 'multi-carousel-card swiper-slide';

  const link = document.createElement(href ? 'a' : 'div');
  link.className = 'multi-carousel-card-link';
  if (href) {
    link.href = href;
    link.addEventListener('click', () => {
      const blockTitle = link.closest('.multi-carousel')?.querySelector('.multi-carousel-header h2')?.textContent?.trim() || '';
      pushAdobeCtaClickEvent({
        cta: title,
        parentTitle: blockTitle,
        destinationUrl: link.href,
        event: 'custom_cta_click',
      });
    });
  }

  const image = document.createElement('div');
  image.className = 'multi-carousel-image';
  image.append(buildPicture(desktopImg, mobileImg, desktopImg?.alt || mobileImg?.alt || title));

  const heading = document.createElement('h3');
  heading.className = 'multi-carousel-title';
  heading.textContent = title;

  link.append(image, heading);
  card.append(link);
  return card;
}
// ===== DESIGN-CARDS END =====

function trackNavClick(button, sectionTitle) {
  if (!button) return;

  button.addEventListener('click', (event) => {
    event.preventDefault();

    let direction = '';
    if (button.classList.contains('multi-carousel-next')) direction = 'Next';
    else if (button.classList.contains('multi-carousel-prev')) direction = 'Previous';

    pushAdobeCtaClickEvent({
      selectedValue: `Navigation Action : ${direction}`,
      title: sectionTitle,
      event: 'Navigation',
    });
  });
}

/**
 * @param {string} direction prev or next
 * @param {string} label accessible label
 * @returns {HTMLButtonElement}
 */
function createArrow(direction, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `multi-carousel-${direction}`;
  button.setAttribute('aria-label', label);
  return button;
}

/**
 * loads and decorates the multi-carousel block
 * @param {Element} block The multi-carousel block element
 */
export default async function decorate(block) {
  const header = document.createElement('div');
  header.className = 'multi-carousel-header';
  const wrapper = document.createElement('ul');
  wrapper.className = 'multi-carousel-track swiper-wrapper';
  // ===== DESIGN-CARDS START =====
  const designCards = block.classList.contains('design-cards');
  // ===== DESIGN-CARDS END =====

  [...block.children].forEach((row) => {
    if (row.querySelector('img')) {
      // ===== DESIGN-CARDS: whole-card link for the design-cards variant =====
      wrapper.append(designCards ? buildLinkCard(row) : buildCard(row));
      return;
    }
    // "Title | value" row; any other row without an image (column labels) is ignored
    const [label, value] = row.children;
    if (text(label).toLowerCase() === 'title' && text(value)) {
      const heading = value.querySelector('h1, h2, h3, h4, h5, h6') || document.createElement('h2');
      if (!heading.parentElement) heading.textContent = text(value);
      header.append(heading);
    }
  });

  const heading = header.querySelector('h1, h2, h3, h4, h5, h6');
  if (heading) {
    heading.id = heading.id || `multi-carousel-${Math.random().toString(36).slice(2, 8)}`;
    wrapper.setAttribute('aria-labelledby', heading.id);
  }

  const container = document.createElement('div');
  container.className = 'multi-carousel-swiper swiper';
  container.append(wrapper);

  // magazine is a static grid, so no arrows, dots or Swiper
  if (block.classList.contains('magazine')) {
    block.replaceChildren(header, container);
    return;
  }

  const prev = createArrow('prev', 'Previous');
  const next = createArrow('next', 'Next');
  // Stops analytics_1's delegated carousel tracker from double-firing Navigation.
  block.dataset.navTrackingBound = 'true';
  const titleText = heading?.textContent?.trim() || 'Multi Carousel';
  trackNavClick(prev, titleText);
  trackNavClick(next, titleText);
  const nav = document.createElement('div');
  nav.className = 'multi-carousel-nav';
  nav.append(prev, next);
  header.append(nav);

  // const titleText = config.title || sectionTitle?.textContent?.trim() || 'Designer Collections';

  const dots = document.createElement('div');
  dots.className = 'multi-carousel-dots';

  block.replaceChildren(header, container, dots);

  const Swiper = await window.loadSwiper?.().catch(() => null);
  if (!Swiper) return;

  // ===== DESIGN-CARDS START =====
  // design-cards: fixed 340px cards, 16px apart and 16px in on mobile;
  // 4.2 cards (width set in CSS), 20px apart and 20px in from 992px
  if (designCards) {
    // eslint-disable-next-line no-new
    new Swiper(container, {
      slidesPerView: 'auto',
      spaceBetween: 16,
      slidesOffsetBefore: 16,
      slidesOffsetAfter: 16,
      watchOverflow: false,
      speed: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500,
      navigation: { prevEl: prev, nextEl: next },
      pagination: {
        el: dots,
        clickable: true,
        bulletElement: 'button',
        bulletClass: 'multi-carousel-dot',
        bulletActiveClass: 'multi-carousel-dot-active',
      },
      a11y: {
        prevSlideMessage: 'Previous',
        nextSlideMessage: 'Next',
        paginationBulletMessage: 'Show card {{index}}',
        // keep the cards' list semantics (ul > li): Swiper's default role="group" breaks the list
        slideRole: null,
      },
      breakpoints: {
        992: { spaceBetween: 20, slidesOffsetBefore: 20, slidesOffsetAfter: 20 },
      },
    });
    return;
  }
  // ===== DESIGN-CARDS END =====

  // ===== FIX START: default variant cards like live "Our shade cards" (catalogue directory) =====
  // live cards have a fixed width (set in CSS): 239px, 17.5px apart below 992px;
  // 284px, 40px apart from 992px. So Swiper takes the CSS width ('auto') instead of
  // fitting 1.75 / 2.75 / 4.6 cards; the default setup below is then not used
  if (!designCards) {
    // eslint-disable-next-line no-new
    new Swiper(container, {
      slidesPerView: 'auto',
      spaceBetween: 17.5,
      speed: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400,
      navigation: { prevEl: prev, nextEl: next },
      pagination: {
        el: dots,
        clickable: true,
        bulletElement: 'button',
        bulletClass: 'multi-carousel-dot',
        bulletActiveClass: 'multi-carousel-dot-active',
      },
      a11y: {
        prevSlideMessage: 'Previous',
        nextSlideMessage: 'Next',
        paginationBulletMessage: 'Show card {{index}}',
        // keep the cards' list semantics (ul > li): Swiper's default role="group" breaks the list
        slideRole: null,
      },
      breakpoints: {
        992: { spaceBetween: 40 },
      },
    });
    return;
  }
  // ===== FIX END =====

  // visible cards: 1.75 on mobile, 2.75 on tablet, 4.4 to 4.6 on desktop
  // eslint-disable-next-line no-new
  new Swiper(container, {
    slidesPerView: 1.75,
    spaceBetween: 12,
    speed: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400,
    navigation: { prevEl: prev, nextEl: next },
    pagination: {
      el: dots,
      clickable: true,
      bulletElement: 'button',
      bulletClass: 'multi-carousel-dot',
      bulletActiveClass: 'multi-carousel-dot-active',
    },
    a11y: {
      prevSlideMessage: 'Previous',
      nextSlideMessage: 'Next',
      paginationBulletMessage: 'Show card {{index}}',
      // keep the cards' list semantics (ul > li): Swiper's default role="group" breaks the list
      slideRole: null,
    },
    breakpoints: {
      600: { slidesPerView: 2.75, spaceBetween: 24 },
      900: { slidesPerView: 4.4, spaceBetween: 40 },
      1200: { slidesPerView: 4.6, spaceBetween: 40 },
    },
  });
}
