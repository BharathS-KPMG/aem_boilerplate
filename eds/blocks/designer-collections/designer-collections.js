/* eslint-disable -- stage site version of this block, kept as is; QA fixes are marked BUG FIX */
import { getDigitalData, bindCarouselNavigationTracking , pushAdobeCtaClickEvent } from "../../scripts/analytics_1.js";
import { PROD_DOMAIN } from '../../scripts/environment.js';
/*
** Authoring format **
Row: Title | <section title>
Row: Background color hexcode | <#hex>
Row: header labels (Logo desktop | Logo mobile | gif url | ...) → ignored
Rows: one card per row
  Column 1 → logo desktop
  Column 2 → logo mobile
  Column 3 → gif URL
  Column 4 → title
  Column 5 → subtitle
  Column 6 → CTA label
  Column 7 → PDF link

** Old authoring format (still supported) **
One row only, every cell holds all the cards (one per line):
Column 1 → logo desktop
Column 2 → logo mobile
Column 3 → gif/video URL
Column 4 → title
Column 5 → subtitle
Column 6 → CTA label
Column 7 → PDF link
*/

async function getSwiperClass() {
  if (window.Swiper) return window.Swiper;
  if (window.loadSwiper) return window.loadSwiper();

  // eslint-disable-next-line no-console
  console.warn('Swiper loader is not available on window.loadSwiper');
  return null;
}
function initVideoOnView(video) {
  if (!video) return;

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;

      if (video.dataset.loaded) {
        obs.unobserve(video);
        return;
      }

      video.dataset.loaded = 'true';

      // Force video to load
      if (typeof video.load === 'function') {
        video.load();
      }

      // Try to play → triggers frame rendering
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          // Autoplay blocked → expected on mobile
        });
      }

      // Immediately pause → keeps first frame visible
      video.pause();

      obs.unobserve(video);
    });
  }, {
    root: null,
    rootMargin: '200px 0px',
    threshold: 0.01,
  });

  observer.observe(video);
}
function updateNavState(swiper, prevButton, nextButton) {
  if (!swiper || !prevButton || !nextButton) return;

  // Hide arrows when all cards fit in view (nothing to slide to)
  const navWrapper = prevButton.parentElement;
  const noOverflow = swiper.isLocked || (swiper.isBeginning && swiper.isEnd);
  if (navWrapper) navWrapper.style.display = noOverflow ? 'none' : '';
  if (noOverflow) return;

  prevButton.disabled = swiper.isBeginning;
  nextButton.disabled = swiper.isEnd;

  prevButton.style.opacity = swiper.isBeginning ? '0.4' : '1';
  nextButton.style.opacity = swiper.isEnd ? '0.4' : '1';
}

function removeInjectedSwiperIcons(prevButton, nextButton) {
  prevButton?.querySelectorAll('.swiper-navigation-icon').forEach((icon) => icon.remove());
  nextButton?.querySelectorAll('.swiper-navigation-icon').forEach((icon) => icon.remove());
}

function getColumnItems(column) {
  if (!column) return [];

  const directChildren = [...column.children].filter((child) => {
    const hasText = child.textContent?.trim();
    const hasPicture = child.querySelector('picture, img') || child.matches('picture, img');
    const hasLink = child.querySelector('a[href]') || child.matches('a[href]');
    return hasText || hasPicture || hasLink;
  });

  if (directChildren.length) return directChildren;

  return column.textContent?.trim() ? [column] : [];
}

function getPictureItem(item) {
  if (!item) return null;

  if (item.matches?.('picture')) return item.cloneNode(true);

  const picture = item.querySelector?.('picture');
  if (picture) return picture.cloneNode(true);

  const img = item.matches?.('img') ? item : item.querySelector?.('img');
  if (img) return img.cloneNode(true);

  return null;
}

function getTextItem(item) {
  if (!item) return '';

  const cloned = item.cloneNode(true);
  cloned.querySelectorAll('picture, img, a').forEach((el) => el.remove());

  return cloned.textContent?.trim() || item.textContent?.trim() || '';
}

function getHrefItem(item) {
  if (!item) return '';

  if (item.matches?.('a[href]')) return item.href.trim();

  const anchor = item.querySelector?.('a[href]');
  if (anchor?.href) return anchor.href.trim();

  return item.textContent?.trim() || '';
}

function normalizeLabel(text) {
  return (text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isValidHexColor(value) {
  return /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value);
}

function parseBlockRows(block) {
  const config = { title: '', bgColor: '' };
  const cards = [];

  [...block.querySelectorAll(':scope > div')].forEach((row) => {
    const cells = [...row.children];
    const label = normalizeLabel(cells[0]?.textContent);

    if (cells.length < 7) {
      const value = cells[1]?.textContent?.trim() || '';
      if (label === 'title') config.title = value;
      else if (label.startsWith('background')) config.bgColor = value;
      return;
    }

    // Skip the column header row
    if (label === 'logo desktop') return;

    cards.push(cells);
  });

  return { config, cards };
}

function trackNavClick(button, sectionTitle) {
  if (!button) return;

  button.addEventListener('click', (event) => {
    event.preventDefault();

    let direction = '';
    if (button.classList.contains('designer-collections-next') || button.classList.contains('swiper-button-next') || button.classList.contains('slick-next')) {
      direction = 'Next';
    } else if (button.classList.contains('designer-collections-prev') || button.classList.contains('swiper-button-prev') || button.classList.contains('slick-prev')) {
      direction = 'Previous';
    }

    pushAdobeCtaClickEvent ({
      selectedValue : 'Navigation Action : ' + direction,
      title: sectionTitle,
      event: 'Navigation',
    });
  });
}

/**
 * Points an authored asset path (video or PDF; plain text, or a link DA made
 * on this site) at the production site so it also works on localhost and
 * preview hosts; URLs on other domains are returned as is.
 * @param {string} value The authored path or URL
 * @returns {string} The URL to load
 */
function toProdAssetUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin === window.location.origin) {
      return `https://${PROD_DOMAIN}${url.pathname}${url.search}`;
    }
  } catch (e) {
    // not a URL; use it as authored
  }
  return value;
}

function createVideoElement(src, title) {
  if (!src) return null;

  const video = document.createElement('video');
  video.className = 'designer-collections-video';
  video.src = src;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('aria-label', title || 'Collection preview');

  video.addEventListener('ended', () => {
    video.pause();
  });

  return video;
}

function bindHoverPlayback(target, mediaEl) {
  if (!mediaEl || mediaEl.tagName.toLowerCase() !== 'video') return;

  target.addEventListener('mouseenter', async () => {
    try {
      mediaEl.pause();
      mediaEl.currentTime = 0;
      await mediaEl.play();
    } catch (e) { }
  });

  // ⏹️ Hover out → reset
  target.addEventListener('mouseleave', () => {
    mediaEl.pause();
    mediaEl.currentTime = 0;
  });

  // ✅ When video ends → DO NOTHING (stay at last frame)
  mediaEl.addEventListener('ended', () => {
    mediaEl.pause();
    // ❌ no reset here
  });
}

export default async function decorate(block) {
  // This block tracks Previous/Next locally via trackNavClick.
  // Mark as already bound so analytics_1's document-level delegated
  // carousel tracker skips it and does not double-fire Navigation.
  block.dataset.navTrackingBound = 'true';

  const { config, cards } = parseBlockRows(block);
  if (!cards.length) return;

  const section = block.closest('.section');
  const sectionTitle = section?.querySelector('h2');
  const titleText = config.title || sectionTitle?.textContent?.trim() || 'Designer Collections';

  if (sectionTitle && !config.title) {
    sectionTitle.style.display = 'none';
  }

  if (isValidHexColor(config.bgColor)) {
    block.style.background = config.bgColor;
  }

  // ===== OLD FORMAT START: original block code, kept unchanged =====
  // Original authoring: ONE row of 7 cells where every cell holds all the cards, one per line
  // (cell 1 = every desktop logo, cell 4 = every title, ...) and no Title / Background rows,
  // e.g. /components-reference/components-catalogue. New pages use one row per card.
  const isOldFormat = cards.length === 1 && !config.title && !config.bgColor;
  let oldFormatCards = null;

  if (isOldFormat) {
    const row = block.querySelector(':scope > div');
    if (!row) return;

    const columns = [...row.children];
    if (columns.length < 7) return;

    const desktopLogoCol = columns[0];
    const mobileLogoCol = columns[1];
    const mediaUrlCol = columns[2];
    const titleCol = columns[3];
    const subtitleCol = columns[4];
    const ctaLabelCol = columns[5];
    const pdfLinkCol = columns[6];

    const desktopLogoItems = getColumnItems(desktopLogoCol);
    const mobileLogoItems = getColumnItems(mobileLogoCol);
    const mediaUrlItems = getColumnItems(mediaUrlCol);
    const titleItems = getColumnItems(titleCol);
    const subtitleItems = getColumnItems(subtitleCol);
    const ctaLabelItems = getColumnItems(ctaLabelCol);
    const pdfLinkItems = getColumnItems(pdfLinkCol);

    const totalCards = Math.max(
      desktopLogoItems.length,
      mobileLogoItems.length,
      mediaUrlItems.length,
      titleItems.length,
      subtitleItems.length,
      ctaLabelItems.length,
      pdfLinkItems.length,
    );

    if (!totalCards) return;

    // card i = item i of every cell (same as the original for loop)
    oldFormatCards = [];
    for (let i = 0; i < totalCards; i += 1) {
      oldFormatCards.push([
        desktopLogoItems[i],
        mobileLogoItems[i],
        mediaUrlItems[i],
        titleItems[i],
        subtitleItems[i],
        ctaLabelItems[i],
        pdfLinkItems[i],
      ]);
    }
  }
  // ===== OLD FORMAT END =====

  const header = document.createElement('div');
  header.className = 'designer-collections-header';

  const titleEl = document.createElement('h2');
  titleEl.className = 'designer-collections-title';
  titleEl.textContent = titleText;
  header.appendChild(titleEl);

  const navWrapper = document.createElement('div');
  navWrapper.className = 'designer-collections-nav-wrapper';

  const prevButton = document.createElement('button');
  prevButton.className = 'designer-collections-nav designer-collections-prev swiper-button-prev';
  prevButton.type = 'button';
  prevButton.setAttribute('aria-label', 'Previous');

  const nextButton = document.createElement('button');
  nextButton.className = 'designer-collections-nav designer-collections-next swiper-button-next';
  nextButton.type = 'button';
  nextButton.setAttribute('aria-label', 'Next');

  trackNavClick(prevButton, titleText);
  trackNavClick(nextButton, titleText);

  navWrapper.appendChild(prevButton);
  navWrapper.appendChild(nextButton);
  header.appendChild(navWrapper);

  const carousel = document.createElement('div');
  carousel.className = 'designer-collections-carousel swiper';

  const track = document.createElement('div');
  track.className = 'designer-collections-track swiper-wrapper';

  // ===== BUG FIX START: cards of the old one-row format, or one card per row (new format) =====
  const cardItems = oldFormatCards || cards.map((cells) => cells.map((col) => getColumnItems(col)[0]));
  // ===== BUG FIX END =====

  cardItems.forEach((items) => {
    const [
      desktopLogoCol,
      mobileLogoCol,
      mediaUrlCol,
      titleCol,
      subtitleCol,
      ctaLabelCol,
      pdfLinkCol,
    ] = items;

    const desktopLogo = getPictureItem(desktopLogoCol);
    const mobileLogo = getPictureItem(mobileLogoCol);
    // old format: links as authored (original code); new format: /content/dam → PROD_DOMAIN
    const mediaSrc = isOldFormat ? getHrefItem(mediaUrlCol) : toProdAssetUrl(getHrefItem(mediaUrlCol));
    const title = getTextItem(titleCol);
    const subtitle = getTextItem(subtitleCol);
    const ctaLabel = getTextItem(ctaLabelCol) || 'Download PDF';
    const pdfHref = (isOldFormat ? getHrefItem(pdfLinkCol) : toProdAssetUrl(getHrefItem(pdfLinkCol))) || '#';

    if (!title && !desktopLogo && !mobileLogo && !mediaSrc) return;

    const slide = document.createElement('div');
    slide.className = 'designer-collections-card swiper-slide';

    const cardInner = document.createElement('div');
    cardInner.className = 'designer-collections-card-inner';

    const logoWrap = document.createElement('div');
    logoWrap.className = 'designer-collections-logo';

    if (desktopLogo) {
      const desktopWrap = document.createElement('div');
      desktopWrap.className = 'designer-collections-logo-image designer-collections-logo-image--desktop';
      desktopWrap.appendChild(desktopLogo);
      logoWrap.appendChild(desktopWrap);
    }

    if (mobileLogo) {
      const mobileWrap = document.createElement('div');
      mobileWrap.className = 'designer-collections-logo-image designer-collections-logo-image--mobile';
      mobileWrap.appendChild(mobileLogo);
      logoWrap.appendChild(mobileWrap);
    }

    const mediaWrap = document.createElement('div');
    mediaWrap.className = 'designer-collections-image';

    const mediaEl = createVideoElement(mediaSrc, title);
    if (mediaEl) {
      mediaWrap.appendChild(mediaEl);

        // ✅ ADD THIS LINE
      initVideoOnView(mediaEl);
      bindHoverPlayback(mediaWrap, mediaEl);
    }

    const content = document.createElement('div');
    content.className = 'designer-collections-content';

    if (title) {
      const cardTitle = document.createElement('h3');
      cardTitle.textContent = title;
      content.appendChild(cardTitle);
    }

    if (subtitle) {
      const cardSubtitle = document.createElement('p');
      cardSubtitle.textContent = subtitle;
      content.appendChild(cardSubtitle);
    }

    const ctaWrap = document.createElement('div');
    ctaWrap.className = 'designer-collections-cta-wrap';

    const cta = document.createElement('a');
    cta.className = 'designer-collections-cta';
    cta.href = pdfHref;
    cta.target = '_blank';
    cta.rel = 'noopener noreferrer';
    cta.setAttribute('aria-label', title ? `${ctaLabel} - ${title}` : ctaLabel);

    const ctaText = document.createElement('span');
    ctaText.className = 'designer-collections-cta-text';
    ctaText.textContent = ctaLabel;

    const ctaIcon = document.createElement('img');
    ctaIcon.className = 'designer-collections-cta-icon';
    ctaIcon.src = 'https://www.asianpaints.com/etc.clientlibs/apcolourcatalogue/clientlibs/clientlib-global/resources/images/download-icon-shade-tool.svg';
    ctaIcon.alt = '';
    ctaIcon.setAttribute('aria-hidden', 'true');
    ctaIcon.setAttribute('width', '18');
    ctaIcon.setAttribute('height', '18');

    cta.appendChild(ctaText);
    cta.appendChild(ctaIcon);

    cta.addEventListener("click", function (e) {
      const data = {
        "Title": titleText,
        "pdfName": pdfHref.split('/').pop().replace(".pdf", "")
      }
      getDigitalData().download = data;

      pushAdobeCtaClickEvent({
        event: "download_multiple_pdf",
        pdfName: pdfHref.split('/').pop().replace(".pdf", ""),
        title: titleText,
      });

    });
    ctaWrap.appendChild(cta);

    cardInner.appendChild(logoWrap);
    cardInner.appendChild(mediaWrap);
    cardInner.appendChild(content);
    cardInner.appendChild(ctaWrap);

    slide.appendChild(cardInner);
    track.appendChild(slide);
  });

  if (!track.children.length) return;

  carousel.appendChild(track);

  const pagination = document.createElement('div');
  pagination.className = 'designer-collections-pagination swiper-pagination';
  // ===== BUG FIX START: dots on mobile (Bug 4 and 7) =====
  carousel.appendChild(pagination);
  // ===== BUG FIX END =====

  block.innerHTML = '';
  block.appendChild(header);
  block.appendChild(carousel);

  if (track.children.length <= 1) {
    navWrapper.style.display = 'none';
    pagination.style.display = 'none';
    return;
  }

  try {
    const Swiper = await getSwiperClass();
    if (!Swiper) return;

    const swiper = new Swiper(carousel, {
      // ===== BUG FIX START: card widths and gaps like live =====
      // Cards keep the width set in the CSS (250px, 319px from 992px) with live's gaps
      // (30px, 70px from 992px), so the sub-titles wrap like live.
      // Was: slidesPerView 1.15 / 1.5 / 1.75 / 3.9 with spaceBetween 18 / 18 / 10 / 50,
      // which stretched the cards to the screen (e.g. 435px wide at 1920px).
      slidesPerView: 'auto',
      spaceBetween: 30,
      // ===== BUG FIX END =====
      speed: 500,
      loop: false,
      watchOverflow: true,
      navigation: {
        prevEl: prevButton,
        nextEl: nextButton,
      },
      // ===== BUG FIX START: dots on mobile (Bug 4 and 7) =====
      pagination: {
        el: pagination,
        clickable: true,
      },
      // ===== BUG FIX END =====
      // ===== BUG FIX START: card widths and gaps like live (see above) =====
      breakpoints: {
        992: {
          spaceBetween: 70,
        },
      },
      // ===== BUG FIX END =====
      on: {
        init(instance) {
          removeInjectedSwiperIcons(prevButton, nextButton);
          updateNavState(instance, prevButton, nextButton);
        },
        slideChange(instance) {
          updateNavState(instance, prevButton, nextButton);
        },
        resize(instance) {
          removeInjectedSwiperIcons(prevButton, nextButton);
          updateNavState(instance, prevButton, nextButton);
        },
        reachBeginning(instance) {
          updateNavState(instance, prevButton, nextButton);
        },
        reachEnd(instance) {
          updateNavState(instance, prevButton, nextButton);
        },
        fromEdge(instance) {
          updateNavState(instance, prevButton, nextButton);
        },
        lock(instance) {
          updateNavState(instance, prevButton, nextButton);
        },
        unlock(instance) {
          updateNavState(instance, prevButton, nextButton);
        },
      },
    });

    removeInjectedSwiperIcons(prevButton, nextButton);
    block.designerCollectionsSwiper = swiper;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize designer-collections Swiper', error);
  }
}
