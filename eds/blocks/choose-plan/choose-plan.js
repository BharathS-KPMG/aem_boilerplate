import { createOptimizedPicture, getMetadata } from '../../scripts/aem.js';
import { pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';

// plan colours are picked by plan name, falling back to the plan's position
const PLAN_KEYS = ['classic', 'gold', 'platinum'];

// labelled option rows: "Heading | text" and "Sub heading | text"
const OPTIONS = {
  heading: 'heading',
  subheading: 'subheading',
};

/**
 * @param {Element[]} cells the cells of a row
 * @returns {string|null} the option a two-cell row sets, if any
 */
function optionName(cells) {
  if (cells.length !== 2) return null;
  const label = cells[0].textContent.trim().toLowerCase().replace(/[\s:_-]/g, '');
  return OPTIONS[label] || null;
}

// START SITE VISIT POPUP: like live (and the stg service-steps block), a plan button that links to
// the safe painting service page (any form: /services/..., the AEM path, with or without .html)
// or to #form (the link on live) opens the "Book a FREE Site Visit" lead form pop-up: the form
// page of the header CTA (data-modal-path), else the "site-visit-modal" page metadata, else the stg
// form page, in the site's modal block; the link is the fallback
const SITE_VISIT_PATH = '/services/asian-paints-safe-painting-service';
const DEFAULT_SITE_VISIT_MODAL = '/eds/forms/book-free-site-visit';

function isSiteVisitLink(href) {
  if (!href) return false;
  // of the links within the page, only #form (other #links stay jump links)
  if (href.startsWith('#')) return href === '#form';
  const path = new URL(href, window.location.href).pathname.replace(/(\.html)?\/?$/, '');
  return path.endsWith(SITE_VISIT_PATH);
}

async function openSiteVisitPopup(fallback) {
  const modalPath = document.querySelector('.trigger-book-free-site-visit-modal[data-modal-path]')?.dataset.modalPath
    || getMetadata('site-visit-modal') || DEFAULT_SITE_VISIT_MODAL;
  try {
    const { openModal } = await import('../modal/modal.js');
    await openModal(modalPath);
    // optional: sized like live (see choose-plan.css)
    [...document.querySelectorAll('main > .modal')].pop()?.classList.add('choose-plan-popup');
  } catch (e) {
    window.location.href = fallback;
  }
}
// END SITE VISIT POPUP

/**
 * @param {string} name the plan name
 * @param {number} index position of the plan
 * @returns {string} classic, gold or platinum
 */
function planKey(name, index) {
  const text = name.toLowerCase();
  return PLAN_KEYS.find((key) => text.includes(key)) || PLAN_KEYS[index % PLAN_KEYS.length];
}

/**
 * builds the plan header: an optional header image with the plan name
 * @param {Element} cell the plan name cell
 * @returns {HTMLDivElement}
 */
function buildHeader(cell) {
  const header = document.createElement('div');
  header.className = 'choose-plan-header';

  const img = cell.querySelector('img');
  if (img) {
    const image = document.createElement('div');
    image.className = 'choose-plan-header-image';
    // decorative: the plan name is shown as text on top of it
    image.append(createOptimizedPicture(img.src, '', false, [{ width: '750' }]));
    header.append(image);
    (img.closest('picture') || img).remove();
    header.classList.add('has-image');
  }

  let heading = cell.querySelector('h1, h2, h3, h4, h5, h6');
  if (!heading) {
    heading = document.createElement('h3');
    heading.textContent = cell.textContent.trim();
  }
  header.append(heading);
  return header;
}

// the booking form a plan button scrolls to when no #hash element is named
const FORM_TARGETS = '.form-banner, .form';

/**
 * Height of a fixed or sticky site header, so a jump target isn't hidden under it.
 * @returns {number} The header height in pixels
 */
function headerOffset() {
  const header = document.querySelector('header .nav-wrapper') || document.querySelector('header');
  if (!header) return 0;
  const { position } = getComputedStyle(header);
  return position === 'fixed' || position === 'sticky' ? header.getBoundingClientRect().height : 0;
}

/**
 * Click handler for a choose-plan-v2 button (BOOK THIS PLAN). It runs only when the button is
 * clicked: it smooth-scrolls up to the page's booking form, like the live site. The target is
 * the element named by a #hash link (e.g. "#form"), otherwise the form banner on the page.
 * Only when the page has no form does the click follow the button's link as normal.
 * @param {MouseEvent} event The click on the button
 */
function scrollToBookingForm(event) {
  const link = event.currentTarget;
  const href = link.getAttribute('href');
  const isHash = href.startsWith('#');
  const id = isHash ? decodeURIComponent(href.slice(1)) : '';
  const target = (id && document.getElementById(id)) || document.querySelector(FORM_TARGETS);
  // no booking form on this page: behave like a normal link
  if (!target && !isHash) return;

  event.preventDefault();
  const top = target ? target.getBoundingClientRect().top + window.scrollY - headerOffset() : 0;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: Math.max(top, 0), behavior: reduceMotion ? 'auto' : 'smooth' });
}

/**
 * choose-plan-v2 on mobile: dots under the swipeable row of cards
 * (hidden on desktop by CSS, where the cards sit side by side)
 * @param {HTMLDivElement} plans the scrolling row of plan cards
 */
function addSliderDots(plans) {
  const cards = [...plans.children];
  if (cards.length < 2) return;

  const dots = document.createElement('div');
  dots.className = 'choose-plan-dots';
  const buttons = cards.map((card, index) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'choose-plan-dot';
    const header = card.querySelector('.choose-plan-header');
    const name = header?.textContent.trim() || `plan ${index + 1}`;
    dot.setAttribute('aria-label', `Show ${name}`);
    dot.addEventListener('click', () => {
      plans.scrollTo({ left: card.offsetLeft - cards[0].offsetLeft, behavior: 'smooth' });
    });
    dots.append(dot);
    return dot;
  });

  const update = () => {
    const step = cards[1].offsetLeft - cards[0].offsetLeft || 1;
    const maxScroll = plans.scrollWidth - plans.clientWidth;
    // not scrollable yet (e.g. before the block CSS applies) counts as the first plan
    const atEnd = maxScroll > 1 && plans.scrollLeft >= maxScroll - 1;
    const current = atEnd ? cards.length - 1 : Math.round(plans.scrollLeft / step);
    buttons.forEach((dot, index) => dot.setAttribute('aria-current', String(index === current)));
  };

  let frame;
  const scheduleUpdate = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  };
  plans.addEventListener('scroll', scheduleUpdate, { passive: true });
  // re-check when the layout changes (CSS arriving, rotation, resizing)
  new ResizeObserver(scheduleUpdate).observe(plans);
  plans.after(dots);
  update();
}

/**
 * loads and decorates the choose-plan block
 * @param {Element} block The choose-plan block element
 */
export default function decorate(block) {
  const intro = document.createElement('div');
  intro.className = 'choose-plan-intro';

  const plans = document.createElement('div');
  plans.className = 'choose-plan-plans';

  [...block.children].forEach((row) => {
    const cells = [...row.children];

    // "Heading" and "Sub heading" option rows
    const option = optionName(cells);
    if (option) {
      const text = cells[1].textContent.trim();
      if (text) {
        const el = document.createElement(option === 'heading' ? 'h2' : 'p');
        el.className = `choose-plan-${option}`;
        el.textContent = text;
        intro.append(el);
      }
      return;
    }

    // a row with a single cell is the intro (heading + description)
    if (cells.length <= 1) {
      if (cells[0]) intro.append(...cells[0].childNodes);
      return;
    }

    // otherwise the row is a plan: name (+ optional image) | features | optional cta
    const [nameCell, features, cta] = cells;
    const card = document.createElement('div');
    card.className = 'choose-plan-plan';

    const header = buildHeader(nameCell);
    card.classList.add(`plan-${planKey(header.textContent, plans.children.length)}`);
    card.append(header);

    if (features) {
      features.className = 'choose-plan-features';
      // lines starting with * are footnotes (e.g. availability notes)
      features.querySelectorAll('li, p').forEach((item) => {
        if (item.textContent.trim().startsWith('*')) item.classList.add('choose-plan-footnote');
      });
      card.append(features);
    }

    const authoredLink = cta && cta.querySelector('a[href]');
    if (authoredLink) {
      // clone drops the global bindButtonContainerTracking listener
      // so the click isn't tracked twice
      const link = authoredLink.cloneNode(true);
      authoredLink.replaceWith(link);
      cta.className = 'choose-plan-cta';
      link.className = 'button choose-plan-button';
      link.addEventListener('click', () => {
        const btnTitle = link.textContent.trim();
        const planName = card.querySelector('.choose-plan-header h3')?.textContent?.trim() || '';
        const parentTitle = block.querySelector('h1, h2, h3, h4, h5, h6')?.textContent?.trim() || '';

        pushAdobeCtaClickEvent({
          cta: `${btnTitle} - ${planName}`,
          parentTitle,
          event: 'custom_cta_click',
        });
      });
      // START SITE VISIT POPUP (added before the choose-plan-v2 scroll, which it replaces here)
      if (isSiteVisitLink(link.getAttribute('href'))) {
        link.setAttribute('aria-haspopup', 'dialog');
        link.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          openSiteVisitPopup(link.href);
        });
      }
      // END SITE VISIT POPUP
      card.append(cta);
    }

    plans.append(card);
  });

  // keep the heading above the sub heading whatever order the rows were authored in
  const heading = intro.querySelector(':scope > .choose-plan-heading');
  if (heading) intro.prepend(heading);

  block.replaceChildren(...(intro.childNodes.length ? [intro] : []), plans);

  if (block.classList.contains('choose-plan-v2')) {
    addSliderDots(plans);
    // scroll only on click of BOOK THIS PLAN
    block.querySelectorAll('.choose-plan-cta a[href]').forEach((link) => {
      link.addEventListener('click', scrollToBookingForm);
    });
  }
}
