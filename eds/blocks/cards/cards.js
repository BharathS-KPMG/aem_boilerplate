import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  triggerCTAClickWithLinkAndTitle, ga4Implementaion, pushAdobeCtaClickEvent,
} from '../../scripts/analytics_1.js';

/* ============================================
   Variant: tabs — Cards (tabs)
   Tab row (one cell)  - tab label; the rows below it belong to that tab
   Card row            - same columns as Cards (grid, interior-hero): desktop image,
                         mobile image (optional), text (heading, "Upto **15** Years",
                         subtitle, CTA link)
   Tab CTA row         - "Tab CTA" | label | jump link id (e.g. collage_slides_how) or a link;
                         a jump id scrolls to the element with that id, or to a section
                         whose Section Metadata sets "Id"
   ============================================ */

const TABS_DESKTOP_MEDIA = '(width >= 992px)';
// cards are 152px wide, 294px from 992px (cards.css); images are authored at the card's aspect
const TABS_IMAGE_WIDTHS = [300, 450, 600];
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
let tabsBlockCount = 0;

const cellText = (cell) => cell?.textContent.trim() || '';
const isTabCtaRow = (row) => /^tab cta$/i.test(cellText(row.children[0])) && row.children.length > 1;
const isTabRow = (row) => row.children.length === 1 && !row.querySelector('img, a[href]') && cellText(row);

/** Fills a link with a text label and a decorative icon span. */
function setLinkContent(link, label, labelClass, iconClass) {
  const text = document.createElement('span');
  if (labelClass) text.className = labelClass;
  text.textContent = label;
  const icon = document.createElement('span');
  icon.className = iconClass;
  icon.setAttribute('aria-hidden', 'true');
  link.replaceChildren(text, icon);
}

/** A webp <source> with the card image at TABS_IMAGE_WIDTHS, picked by card width and DPR. */
function buildTabsSource(img, sizes, media) {
  const { origin, pathname } = new URL(img.src, window.location.href);
  const source = document.createElement('source');
  if (media) source.media = media;
  source.type = 'image/webp';
  source.srcset = TABS_IMAGE_WIDTHS
    .map((w) => `${origin}${pathname}?width=${w}&format=webply&optimize=medium ${w}w`)
    .join(', ');
  source.sizes = sizes;
  return source;
}

/**
 * @param {HTMLImageElement} desktopImg The authored desktop image
 * @param {HTMLImageElement} [mobileImg] The authored mobile image
 * @param {boolean} [eager] Load right away: the selected tab's cards are in the first viewport
 *   on desktop, and loading="lazy" would hold them back until layout
 * @returns {HTMLPictureElement} The card picture
 */
function buildTabsPicture(desktopImg, mobileImg, eager = false) {
  const fallbackImg = mobileImg || desktopImg;
  const alt = desktopImg.alt || mobileImg?.alt || '';
  let picture;
  if (new URL(fallbackImg.src, window.location.href).origin === window.location.origin) {
    // Sized to the card: a fixed 750px image was up to ~300 KB a card for a 294px / 152px slot.
    // The sources go in before the browser picks one (it waits for a microtask).
    picture = createOptimizedPicture(fallbackImg.src, alt, eager, [{ width: '450' }]);
    picture.querySelectorAll('source').forEach((source) => source.remove());
    picture.prepend(...(mobileImg
      ? [buildTabsSource(desktopImg, '294px', TABS_DESKTOP_MEDIA), buildTabsSource(mobileImg, '152px')]
      : [buildTabsSource(desktopImg, `${TABS_DESKTOP_MEDIA} 294px, 152px`)]));
  } else {
    // media hosted elsewhere cannot be resized by the media bus
    picture = document.createElement('picture');
    if (mobileImg) {
      const source = document.createElement('source');
      source.media = TABS_DESKTOP_MEDIA;
      source.srcset = desktopImg.src;
      picture.append(source);
    }
    const img = document.createElement('img');
    img.src = fallbackImg.src;
    img.alt = alt;
    img.loading = eager ? 'eager' : 'lazy';
    picture.append(img);
  }
  moveInstrumentation(fallbackImg, picture.querySelector('img'));
  return picture;
}

function decorateTabsCard(row, sectionTitle, eager = false) {
  const card = document.createElement('li');
  card.className = 'cards-tabs-card';
  moveInstrumentation(row, card);

  const [desktopImg, mobileImg] = [...row.querySelectorAll('img')];
  if (desktopImg) {
    const media = document.createElement('div');
    media.className = 'cards-tabs-media';
    media.append(buildTabsPicture(desktopImg, mobileImg, eager));
    card.append(media);
  }

  const body = document.createElement('div');
  body.className = 'cards-tabs-body';
  [...row.children].filter((col) => !col.querySelector('img'))
    .forEach((col) => body.append(...col.childNodes));
  // drop empty paragraphs (e.g. "All Products" has no warranty lines)
  body.querySelectorAll('p').forEach((p) => { if (!p.textContent.trim() && !p.querySelector('img')) p.remove(); });

  const title = body.querySelector('h1, h2, h3, h4, h5, h6');
  title?.classList.add('cards-tabs-title');
  const titleText = title?.textContent.trim() || '';

  const link = [...body.querySelectorAll('a[href]')].pop();
  // title + warranty lines share a fixed-height slot so every card's CTA lines up
  const info = document.createElement('div');
  info.className = 'cards-tabs-info';
  [...body.children].filter((el) => !el.contains(link)).forEach((el) => info.append(el));
  body.prepend(info);
  if (link) {
    const wrapper = link.closest('p');
    const cta = document.createElement('p');
    cta.className = 'cards-tabs-cta';
    const label = link.textContent.trim();
    link.className = '';
    setLinkContent(link, label, 'cards-tabs-cta-label', 'cards-tabs-arrow');
    if (titleText) link.setAttribute('aria-label', `${label} ${titleText}`);
    cta.append(link);
    body.append(cta);
    if (wrapper && !wrapper.textContent.trim()) wrapper.remove();
    link.addEventListener('click', () => {
      ga4Implementaion({ event: 'product_cards', click_text: label, click_category: desktopImg?.alt || '' });
      pushAdobeCtaClickEvent({
        event: 'custom_cta_click',
        cta: label,
        title: titleText,
        destinationUrl: link.getAttribute('href') || '',
        parentTitle: link.closest('.cards.tabs')
          ?.querySelector('.cards-tabs-list .cards-tabs-tab[aria-selected="true"]')
          ?.textContent.trim() || '',
      });
    });
  }
  card.append(body);
  return card;
}

/** Builds a tab's footer CTA. A plain id (or #id) is a jump link to that element on the page. */
function buildTabCta(row) {
  const cells = [...row.children];
  const label = cellText(cells[1]);
  const authoredLink = row.querySelector('a[href]');
  const jumpId = cells[2] ? cellText(cells[2]).replace(/^#/, '') : '';
  if (!label && !authoredLink) return null;

  const link = document.createElement('a');
  link.className = 'cards-tabs-footer-cta';
  if (authoredLink && !jumpId) {
    link.href = authoredLink.getAttribute('href');
  } else {
    link.href = `#${jumpId}`;
    link.dataset.jumpId = jumpId;
  }
  setLinkContent(link, label || authoredLink.textContent.trim(), '', 'cards-tabs-chevron');
  link.addEventListener('click', (e) => {
    const selectedTab = document
      .querySelector('.cards-tabs-tab[aria-selected="true"]')
      ?.textContent.trim() || '';
    triggerCTAClickWithLinkAndTitle(link.href, link.textContent.trim(), selectedTab);
    const id = link.dataset.jumpId;
    if (!id) return;
    const target = document.getElementById(id) || document.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!target) return; // placeholder id with no target yet: behave as a plain anchor
    e.preventDefault();
    // land the target just below the fixed site header
    const headerBottom = Math.max(document.querySelector('header')?.getBoundingClientRect().bottom || 0, 0);
    window.scrollTo({
      top: target.getBoundingClientRect().top + window.scrollY - headerBottom,
      behavior: REDUCED_MOTION.matches ? 'auto' : 'smooth',
    });
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });

  const wrap = document.createElement('p');
  wrap.className = 'cards-tabs-footer';
  moveInstrumentation(row, wrap);
  wrap.append(link);
  return wrap;
}

function setupTabs(tablist, tabs, panels) {
  const select = (index, focus = false) => {
    tabs.forEach((tab, i) => {
      const selected = i === index;
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.tabIndex = selected ? 0 : -1;
      panels[i].hidden = !selected;
    });
    if (focus) tabs[index].focus();
  };
  tabs.forEach((tab, i) => tab.addEventListener('click', () => {
    pushAdobeCtaClickEvent({
      event: 'cta_link_click',
      cta: tab.textContent.trim(),
    });

    select(i);
  }));
  tablist.addEventListener('keydown', (e) => {
    const current = tabs.indexOf(document.activeElement);
    if (current < 0) return;
    const last = tabs.length - 1;
    const next = {
      ArrowRight: current === last ? 0 : current + 1,
      ArrowLeft: current === 0 ? last : current - 1,
      Home: 0,
      End: last,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(next, true);
  });
  select(0);
}

function decorateTabs(block) {
  tabsBlockCount += 1;
  const uid = `cards-tabs-${tabsBlockCount}`;
  const sectionTitle = block.closest('.section')?.querySelector('h1, h2, h3')?.textContent.trim() || '';

  // group rows into tabs; card rows before any tab row form an unnamed first tab
  const groups = [];
  [...block.children].forEach((row) => {
    if (isTabRow(row)) {
      groups.push({ label: cellText(row), row, items: [] });
      return;
    }
    if (!groups.length) groups.push({ label: '', row: null, items: [] });
    groups[groups.length - 1].items.push(row);
  });

  const tablist = document.createElement('div');
  tablist.className = 'cards-tabs-list';
  tablist.setAttribute('role', 'tablist');
  const tabs = [];
  const panels = [];

  groups.forEach((group, i) => {
    const panel = document.createElement('div');
    panel.className = 'cards-tabs-panel';
    panel.id = `${uid}-panel-${i}`;
    const list = document.createElement('ul');
    list.className = 'cards-tabs-cards';
    let tabCta = null;
    group.items.forEach((row) => {
      if (isTabCtaRow(row)) tabCta = buildTabCta(row);
      // only the first tab shows on load (select(0)); hidden tabs keep lazy images
      else if (row.querySelector('img, a[href]')) list.append(decorateTabsCard(row, sectionTitle, i === 0));
    });
    panel.append(list);
    if (tabCta) {
      panel.classList.add('has-cta');
      panel.append(tabCta);
    }
    panels.push(panel);

    if (groups.length > 1 || group.label) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'cards-tabs-tab';
      tab.id = `${uid}-tab-${i}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', panel.id);
      tab.textContent = group.label || `Tab ${i + 1}`;
      if (group.row) moveInstrumentation(group.row, tab);
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      tablist.append(tab);
      tabs.push(tab);
    }
  });

  block.replaceChildren(...(tabs.length ? [tablist] : []), ...panels);
  if (tabs.length) setupTabs(tablist, tabs, panels);
}

/**
 * Wraps a card image in a copy of the card's CTA link. The CTA is the card's link for
 * assistive technology; the image is a mouse shortcut, kept out of the tab order and the
 * accessibility tree (an image with no alt would otherwise be a link with no name).
 */
function linkCardImage(imageWrapper, ctaLink) {
  if (imageWrapper.querySelector('a')) return;
  const imageLink = document.createElement('a');
  imageLink.href = ctaLink.href;
  imageLink.className = 'cards-card-image-link';
  imageLink.tabIndex = -1;
  imageLink.setAttribute('aria-hidden', 'true');
  if (ctaLink.target) imageLink.target = ctaLink.target;
  if (ctaLink.rel) imageLink.rel = ctaLink.rel;
  else if (ctaLink.target === '_blank') imageLink.rel = 'noopener noreferrer';
  imageLink.append(...imageWrapper.childNodes);
  imageWrapper.append(imageLink);
}

/* ===== BLOG FIX (JS) START: Cards (blog) mobile slider dots, like live =====
   Below 768px the blog cards scroll sideways one card at a time (see BLOG FIX in
   cards.css); these dots show and pick the current card. CSS hides them from 768px. */
function setupBlogDots(block, ul) {
  const cards = [...ul.children];
  if (cards.length < 2) return;

  const offsetOf = (card) => card.getBoundingClientRect().left
    - ul.getBoundingClientRect().left + ul.scrollLeft;
  const dots = document.createElement('div');
  dots.className = 'cards-blog-dots';

  let buttons = [];
  const setActive = (index) => {
    let current = index;
    if (current === undefined) {
      const step = (offsetOf(cards[1]) - offsetOf(cards[0])) || 1;
      const atEnd = ul.scrollLeft >= ul.scrollWidth - ul.clientWidth - 2;
      current = atEnd ? cards.length - 1 : Math.round(ul.scrollLeft / step);
    }
    current = Math.min(cards.length - 1, Math.max(0, current));
    buttons.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === current);
      if (i === current) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  };

  buttons = cards.map((card, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'cards-blog-dot';
    dot.setAttribute('aria-label', `Go to card ${i + 1}`);
    dot.addEventListener('click', () => {
      ul.scrollTo({
        left: offsetOf(card) - offsetOf(cards[0]),
        behavior: REDUCED_MOTION.matches ? 'auto' : 'smooth',
      });
      setActive(i);
    });
    dots.append(dot);
    return dot;
  });

  if ('onscrollend' in window) {
    ul.addEventListener('scrollend', () => setActive());
  } else {
    let settle;
    ul.addEventListener('scroll', () => {
      clearTimeout(settle);
      settle = setTimeout(() => setActive(), 150);
    }, { passive: true });
  }
  setActive(0);
  block.append(dots);
}
/* ===== BLOG FIX (JS) END ===== */

export default function decorate(block) {
  if (block.classList.contains('tabs')) {
    decorateTabs(block);
    return;
  }

  const isCta = block.classList.contains('cta');
  const isGrid = block.classList.contains('grid');
  const isStats = block.classList.contains('stats');
  const isServicesBlock = block.classList.contains('services');
  const isRoomBlock = block.classList.contains('room');
  const isBenefitsBlock = block.classList.contains('benefits');

  const ul = document.createElement('ul');

  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    moveInstrumentation(row, li);

    while (row.firstElementChild) li.append(row.firstElementChild);

    [...li.children].forEach((div) => {
      if (!isCta && div.children.length === 1 && div.querySelector('picture')) {
        div.className = 'cards-card-image';
      } else {
        div.className = 'cards-card-body';

        if (isStats) div.classList.add('content-wrapper');
      }
    });

    if ((isGrid || isServicesBlock) && li.children.length === 3 && li.children[1].classList.contains('cards-card-image')) {
      li.children[1].classList.add('mob-view');
    }

    if (isGrid) {
      const bodyWrapper = li.querySelector('.cards-card-body');
      const ctaLink = bodyWrapper?.querySelector('a[href]');

      if (ctaLink) {
        li.querySelectorAll('.cards-card-image').forEach((imageWrapper) => linkCardImage(imageWrapper, ctaLink));
      }
    }

    if (isStats) {
      li.classList.add('data-parent-container');

      li.querySelectorAll('.cards-card-body.content-wrapper').forEach((body) => {
        const ps = body.querySelectorAll('p');
        if (ps[0]) ps[0].classList.add('title');
        if (ps[1]) ps[1].classList.add('sub-title');
      });
    }

    /* Room variant only: make image clickable using CTA link */
    if (isRoomBlock) {
      li.querySelectorAll('.cards-card-body p').forEach((p) => {
        const strong = p.querySelector('strong');
        const link = p.querySelector('a');

        if (strong && !strong.classList.contains('cards-card-title')) {
          strong.classList.add('cards-card-title');
        }

        if (!strong || !link || p.querySelector('.cards-card-description')) return;

        const nodes = [...p.childNodes];
        const descriptionWrapper = document.createElement('span');
        descriptionWrapper.className = 'cards-card-description';

        let shouldCollect = false;
        let hasDescriptionContent = false;

        nodes.forEach((node) => {
          if (node === strong) {
            shouldCollect = true;
            return;
          }

          if (node === link) {
            shouldCollect = false;
            return;
          }

          if (shouldCollect) {
            const clonedNode = node.cloneNode(true);

            if (
              (clonedNode.nodeType === Node.TEXT_NODE && clonedNode.textContent.trim())
              || clonedNode.nodeType === Node.ELEMENT_NODE
            ) {
              hasDescriptionContent = true;
            }

            descriptionWrapper.append(clonedNode);
            node.remove();
          }
        });

        if (hasDescriptionContent) {
          strong.insertAdjacentElement('afterend', descriptionWrapper);
        }
      });

      /* Room variant only: make image clickable using CTA link */
      const imageWrapper = li.querySelector('.cards-card-image');
      const bodyWrapper = li.querySelector('.cards-card-body');
      const ctaLink = bodyWrapper?.querySelector('a[href]');

      if (imageWrapper && ctaLink) linkCardImage(imageWrapper, ctaLink);
    }

    ul.append(li);
  });

  /* Identify the first grid image BEFORE the optimisation loop so we can
     set loading="eager" + fetchpriority="high" at creation time.
     Setting these attributes after the element is created has no effect
     because the browser commits to lazy-loading when the <img> is parsed.
     Pick the image that is actually visible — mob-view on mobile,
     desktop image on wider viewports — so we don't eagerly fetch a
     display:none image that blocks the network pipe. */
  // Matches the CSS breakpoint in cards.css (max-width: 992px) that swaps
  // to the mob-view image, so the LCP-candidate pick agrees with what is
  // actually visible.
  const isMobileViewport = window.innerWidth <= 992;

  const firstGridImg = isGrid
    ? ul.querySelector(isMobileViewport
      ? '.cards-card-image.mob-view img'
      : '.cards-card-image:not(.mob-view) img')
    : null;

  const imgWidth = '750';
  ul.querySelectorAll('picture > img').forEach((img) => {
    const isLCPCandidate = img === firstGridImg;
    const optimizedPic = createOptimizedPicture(
      img.src,
      img.alt,
      isLCPCandidate,
      [{ width: imgWidth }],
    );
    const optimizedImg = optimizedPic.querySelector('img');

    moveInstrumentation(img, optimizedImg);

    // Copy existing intrinsic dimensions if present
    const originalWidth = img.getAttribute('width') || img.naturalWidth;
    const originalHeight = img.getAttribute('height') || img.naturalHeight;

    if (originalWidth) optimizedImg.setAttribute('width', originalWidth);
    if (originalHeight) optimizedImg.setAttribute('height', originalHeight);

    optimizedImg.decoding = 'async';

    if (isLCPCandidate) {
      optimizedImg.loading = 'eager';
      optimizedImg.setAttribute('fetchpriority', 'high');
    } else {
      optimizedImg.loading = 'lazy';
      optimizedImg.setAttribute('fetchpriority', 'auto');
    }

    img.closest('picture').replaceWith(optimizedPic);
  });

  if (!isServicesBlock && !isRoomBlock && !isBenefitsBlock) {
    ul.querySelectorAll('.cards-card-body p').forEach((p) => {
      if (!p.querySelector('a')) return;

      [...p.childNodes].forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          node.remove();
        } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'A') {
          node.remove();
        }
      });
    });
  }

  block.textContent = '';
  block.append(ul);

  // ===== BLOG FIX (JS): slider dots for Cards (blog) =====
  if (block.classList.contains('blog')) setupBlogDots(block, ul);

  const sectionTitle = block.closest('.section')?.querySelector('h1, h2, h3, h4, h5, h6')?.textContent?.trim() || '';

  // ===== POC ONLY
  if (block.classList.contains('blog')) {
    const section = block.closest('.section');

    const viewAllLink = section?.querySelector(
      '.default-content-wrapper .button-container a.button',
    );

    if (viewAllLink) {
      viewAllLink.dataset.analyticsBound = 'true';
      viewAllLink.addEventListener('click', () => {
        pushAdobeCtaClickEvent({
          event: 'cta_link_text',
          cta: viewAllLink.textContent.trim(),
          destinationUrl: viewAllLink.href || '',
          parentTitle: sectionTitle || '',
        });
      });
    }

    block.querySelectorAll('.cards-card-body p').forEach((p) => {
      const link = p.querySelector(':scope > a:only-child');
      if (!link) return;
      p.classList.add('button-container');
      link.classList.add('button');
      link.addEventListener('click', () => {
        pushAdobeCtaClickEvent({
          event: 'squarecross_click',
          detail2: link.href || '',
          cta: link.textContent.trim() || '',
        });
      });
    });
  }

  ul.querySelectorAll('.cards-card-body a').forEach((cta) => {
    if (block.classList.contains('blog')) return;
    cta.addEventListener('click', () => {
      const ctaLink = cta.getAttribute('href') || '';
      const btnTitle = cta.textContent.trim();
      const body = cta.closest('.cards-card-body');
      const parentTitle = sectionTitle || body?.querySelector('h1, h2, h3, h4, h5, h6, p')?.textContent.trim() || '';
      const imageAlt = cta
        .closest('li')
        ?.querySelector('.cards-card-image img')
        ?.alt || '';
      ga4Implementaion({
        event: 'product_cards',
        click_text: btnTitle,
        click_category: imageAlt,
      });
      if (isRoomBlock && btnTitle.toLowerCase() === 'explore now') {
        const roomTitle = body?.querySelector('.cards-card-title')?.textContent.trim() || parentTitle;

        pushAdobeCtaClickEvent({
          event: 'cta_link_text',
          cta: btnTitle,
          parentTitle: roomTitle,
          destinationUrl: ctaLink,
        });
        return;
      }
      triggerCTAClickWithLinkAndTitle(ctaLink, btnTitle, parentTitle);
    });
  });

  // Image link clicks
  ul.querySelectorAll('.cards-card-image-link').forEach((imageLink) => {
    imageLink.addEventListener('click', () => {
      const ctaLink = imageLink.getAttribute('href') || '';
      const li = imageLink.closest('li');
      const imageAlt = li?.querySelector('.cards-card-image img')?.alt || '';
      const btnTitle = li?.querySelector('.cards-card-body a')?.textContent.trim() || '';

      ga4Implementaion({
        event: 'product_cards',
        click_text: btnTitle,
        click_category: imageAlt,
      });

      // Room cards have a redirect on the image too — fire the same
      // cta_link_text (event143) so image clicks aren't lost in Adobe.
      if (isRoomBlock) {
        const body = li?.querySelector('.cards-card-body');
        const roomTitle = body?.querySelector('.cards-card-title')?.textContent.trim() || sectionTitle;
        pushAdobeCtaClickEvent({
          event: 'cta_link_text',
          cta: btnTitle || 'Explore Now',
          parentTitle: roomTitle,
          destinationUrl: ctaLink,
        });
        return;
      }

      // Other card variants (e.g. grid) also have a redirect on the image.
      // Mirror the body CTA so the image click fires custom_cta_click
      // (event132) instead of being lost in Adobe.
      if (ctaLink) {
        const body = li?.querySelector('.cards-card-body');
        const parentTitle = sectionTitle
          || body?.querySelector('h1, h2, h3, h4, h5, h6, p')?.textContent.trim() || '';
        triggerCTAClickWithLinkAndTitle(ctaLink, btnTitle, parentTitle);
      }
    });
  });

  if (isServicesBlock) {
    const initServicesSwiper = async () => {
      // match the CSS slider breakpoint (width <= 899px)
      const isMobile = window.innerWidth < 900;

      // Mobile browsers fire resize when the URL bar collapses on scroll;
      // only rebuild when the breakpoint is actually crossed.
      if (ul.swiperInitInProgress || isMobile === !!ul.servicesSwiper) return;
      ul.swiperInitInProgress = true;

      if (ul.servicesSwiper) {
        ul.servicesSwiper.destroy(true, true);
        ul.servicesSwiper = null;
      }

      // slides may be nested inside a previous swiper-wrapper
      const slides = [...ul.querySelectorAll(':scope li')];

      ul.classList.remove('swiper');
      ul.querySelectorAll(':scope > .swiper-wrapper').forEach((w) => w.remove());
      slides.forEach((li) => {
        li.classList.remove('swiper-slide');
        li.removeAttribute('style');
        ul.appendChild(li);
      });

      if (!isMobile) {
        ul.swiperInitInProgress = false;
        return;
      }

      ul.classList.add('swiper');

      const wrapper = document.createElement('div');
      wrapper.className = 'swiper-wrapper';

      slides.forEach((li) => {
        li.classList.add('swiper-slide');
        wrapper.appendChild(li);
      });

      ul.appendChild(wrapper);

      let pagination = ul.parentElement.querySelector('.swiper-pagination');
      if (!pagination) {
        pagination = document.createElement('div');
        pagination.className = 'swiper-pagination';
        ul.parentElement.appendChild(pagination);
      }

      const Swiper = window.Swiper || (window.loadSwiper && await window.loadSwiper());
      if (!Swiper) {
        ul.swiperInitInProgress = false;
        return;
      }

      ul.servicesSwiper = new Swiper(ul, {
        slidesPerView: 'auto',
        spaceBetween: 10,
        loop: false,
        pagination: {
          el: pagination,
          clickable: true,
        },
      });
      ul.swiperInitInProgress = false;
    };

    initServicesSwiper();
    window.addEventListener('resize', initServicesSwiper);
  }
}
