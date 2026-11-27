/*
** Authoring format **

Block name: Banner Video

Full-width banner slider; each row below the column-name row is one video or image slide.

The first row holds the column names below (any order). Every row after it is
a slide; with more than one slide the banner becomes a Swiper slider with
arrows and dots (none with a single slide).

Desktop Video         → link to the video shown from 992px
Mobile Video          → link to the video shown below 992px (falls back to the desktop video)
Desktop Image         → the slide image, or the poster shown until the video plays
Mobile Image          → same for below 992px (falls back to the desktop image)
Text Image            → text image over the banner (e.g. "Explore the world of wood")
Mobile Text Image     → text image below 992px (falls back to the text image)
Link                  → page the whole banner links to
CTA                   → button link; the link text is the label (e.g. "Explore Now").
                        A "#id" link scrolls to that element on the page (an element with
                        the id, else the heading with that text, else the section after the banner).
CTA 2                 → optional second button beside the first (only the
                        "Waterproofing Damp Proof Variant" is laid out for two).
                        It opens the site's "Book a free consultation" pop-up (the one the
                        header CTA opens); its link is only the fallback if that cannot load.
Desktop CTA Position  → top left of the button, e.g. "50% 43%"
Mobile CTA Position   → e.g. "57% 37%"
Desktop Icon Position → top left of the text image, e.g. "30% 40%"
Mobile Icon Position  → e.g. "38% 28%"
Open in new tab       → "true" opens the Link and the CTA in a new tab
Type-video/image      → "video" plays the video (the images are its poster),
                        "image" shows only the images and ignores the video links;
                        left empty, a slide with a video link is a video slide

Variant: name the block "Banner Video (Waterproofing Damp Proof Variant)". It adds the
dark gradient over the video, centres the text image and puts the CTA and CTA 2
buttons side by side under it (stacked under the video on mobile). The position
columns are not used by the variant.
*/

import { createOptimizedPicture, getMetadata } from '../../scripts/aem.js';
import { pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';

const MOBILE = window.matchMedia('(max-width: 991px)');
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

const DEFAULT_CONSULTATION_MODAL = '/eds/forms/book-free-site-visit';

// the site's own lead-form pop-up, the one the header "Book free site visit" CTA opens
async function openConsultationPopup(fallbackHref) {
  const modalPath = document.querySelector('.trigger-book-free-site-visit-modal[data-modal-path]')?.dataset.modalPath
    || getMetadata('site-visit-modal') || DEFAULT_CONSULTATION_MODAL;
  try {
    const { openModal } = await import('../modal/modal.js');
    await openModal(modalPath);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('banner-video: consultation pop-up failed to load', error);
    // eslint-disable-next-line no-script-url -- only rejects javascript: links
    if (fallbackHref && !fallbackHref.startsWith('javascript:')) window.location.href = fallbackHref;
  }
}

// "#id" CTA: the element with that id, else the heading whose text matches,
// else the section after the banner
function scrollToAnchor(hash, banner) {
  const id = decodeURIComponent(hash.slice(1));
  const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const target = document.getElementById(id)
    || [...document.querySelectorAll('h1, h2, h3, h4')].find((h) => slug(h.textContent) === slug(id))
    || banner.closest('.section')?.nextElementSibling;
  if (!target) return;
  const header = document.querySelector('header');
  const offset = header ? header.getBoundingClientRect().height : 0;
  const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
  const top = (target.getBoundingClientRect().top + window.scrollY) / zoom - offset;
  // scroll only: the address bar stays as it is (no "#..." added), as on beta
  window.scrollTo({ top, behavior: REDUCED_MOTION.matches ? 'auto' : 'smooth' });
}

function text(el) {
  return (el?.textContent || '').trim();
}

function toKey(label) {
  return label.toLowerCase().replace(/[^a-z]+/g, ' ').trim();
}

// "Type-video/image" → "type", "Desktop CTA Position" → "desktop cta position"
function columnKey(label) {
  if (/^cta\s*2\b/i.test(label.trim())) return 'cta2';
  const key = toKey(label);
  return key.startsWith('type') ? 'type' : key;
}

function linkOf(cell) {
  const a = cell?.querySelector('a[href]');
  if (a) return a.getAttribute('href');
  return text(cell);
}

// desktop and mobile values, each falling back to the other
function pair(desktop, mobile) {
  return desktop || mobile ? { desktop: desktop || mobile, mobile: mobile || desktop } : null;
}

// "50% 43%" → ['50%', '43%']
function position(value) {
  const parts = (value || '').match(/-?\d+(\.\d+)?(%|px)?/g) || [];
  return parts.length >= 2 ? parts.slice(0, 2).map((p) => (/\d$/.test(p) ? `${p}%` : p)) : null;
}

function absoluteUrl(href) {
  try {
    return new URL(href, window.location.origin).href;
  } catch (e) {
    return href || '';
  }
}

function parseSlide(row, keys) {
  const cells = {};
  [...row.children].forEach((cell, i) => {
    if (keys[i]) cells[keys[i]] = cell;
  });
  const img = (key) => cells[key]?.querySelector('img') || null;
  const ctaLink = cells.cta?.querySelector('a[href]');
  const cta2Link = cells.cta2?.querySelector('a[href]');
  const isImage = toKey(text(cells.type)) === 'image';
  return {
    video: isImage ? null : pair(linkOf(cells['desktop video']), linkOf(cells['mobile video'])),
    image: pair(img('desktop image'), img('mobile image')),
    text: pair(img('text image'), img('mobile text image')),
    link: linkOf(cells.link),
    newTab: toKey(text(cells['open in new tab'])) === 'true',
    cta: ctaLink ? { label: text(ctaLink), href: ctaLink.getAttribute('href') } : null,
    cta2: cta2Link ? { label: text(cta2Link), href: cta2Link.getAttribute('href') } : null,
    ctaDesktop: text(cells['desktop cta position']),
    ctaMobile: text(cells['mobile cta position']),
    iconDesktop: text(cells['desktop icon position']),
    iconMobile: text(cells['mobile icon position']),
  };
}

function parse(block) {
  const [header, ...rows] = [...block.children];
  const keys = [...(header?.children || [])].map((cell) => columnKey(text(cell)));
  return rows.map((row) => parseSlide(row, keys)).filter((s) => s.video || s.image);
}

// 2000px from 992px, 750px below (the desktop image when no mobile one is authored)
function buildPicture({ desktop, mobile }, alt, eager, className) {
  const picture = createOptimizedPicture(desktop.src, alt, eager, [{ width: '2000' }]);
  const mobilePicture = createOptimizedPicture(mobile.src, alt, eager, [{ width: '750' }]);
  const webp = mobilePicture.querySelector('source[type="image/webp"]');
  if (webp) {
    webp.media = '(max-width: 991px)';
    picture.prepend(webp);
  }
  if (eager) picture.querySelector('img').setAttribute('fetchpriority', 'high');
  picture.className = className;
  return picture;
}

// the video starts after the poster image so it does not delay the first paint
function bindVideo(slideEl, slide) {
  const poster = slideEl.querySelector('.banner-video-image img');
  // with reduced motion the poster stays; a slide without one shows the video's first frame
  const still = REDUCED_MOTION.matches;
  if (!slide.video || (still && poster)) return null;

  const video = document.createElement('video');
  video.className = 'banner-video-video';
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.setAttribute('aria-hidden', 'true');
  video.setAttribute('preload', still ? 'metadata' : 'none');

  const setSource = () => {
    const src = MOBILE.matches ? slide.video.mobile : slide.video.desktop;
    if (video.getAttribute('src') === src) return;
    slideEl.classList.remove('is-playing');
    video.src = src;
    if (!still && slideEl.classList.contains('is-active')) video.play().catch(() => {});
  };

  video.addEventListener('playing', () => slideEl.classList.add('is-playing'));

  const start = () => {
    setSource();
    MOBILE.addEventListener('change', setSource);
  };
  if (!poster || poster.complete) start();
  else {
    poster.addEventListener('load', start, { once: true });
    poster.addEventListener('error', start, { once: true });
  }
  return video;
}

function setPosition(el, name, value) {
  const pos = position(value);
  if (!pos) return;
  el.style.setProperty(`--${name}-top`, pos[0]);
  el.style.setProperty(`--${name}-left`, pos[1]);
}

function openIn(a, newTab) {
  if (!newTab) return;
  a.target = '_blank';
  a.rel = 'noopener';
}

// returns the slide and a function that adds its pictures and video
function buildSlide(slide, index) {
  const first = index === 0;
  // an image-only slide is named by its image's alt text
  const imageAlt = slide.text ? '' : slide.image?.desktop.alt || '';
  const title = slide.text?.desktop.alt || imageAlt;

  const slideEl = document.createElement('div');
  slideEl.className = 'banner-video-slide swiper-slide';
  if (first) slideEl.classList.add('is-active');
  if (slide.video) slideEl.classList.add('has-video');

  const media = document.createElement(slide.link ? 'a' : 'div');
  media.className = 'banner-video-link';
  if (slide.link) {
    media.href = slide.link;
    openIn(media, slide.newTab);
    if (title) media.setAttribute('aria-label', title);
  }
  media.addEventListener('click', () => {
    pushAdobeCtaClickEvent({
      destinationUrl: slide.link,
      parentTitle: title,
      event: 'carousel_banner_click',
    });
  });
  slideEl.append(media);

  // one button, or two side by side (the wrapper has no box of its own except in the variant)
  const buildCta = ({ label, href }, extra) => {
    const cta = document.createElement('div');
    cta.className = `banner-video-cta${extra ? ` ${extra}` : ''}`;
    const a = document.createElement('a');
    a.href = href;
    openIn(a, slide.newTab);
    a.textContent = label;
    const arrow = document.createElement('span');
    arrow.className = 'banner-video-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    a.append(arrow);
    a.addEventListener('click', () => {
      if (extra === 'banner-video-cta-1') {
        pushAdobeCtaClickEvent({ event: 'jumplink', cta: label });
        return;
      }
      pushAdobeCtaClickEvent({
        cta: label,
        ...(extra === 'banner-video-cta-2' ? {} : { destinationUrl: absoluteUrl(href) }),
        parentTitle: title,
        event: 'custom_cta_click',
      });
    });
    if (extra === 'banner-video-cta-2') {
      a.setAttribute('aria-haspopup', 'dialog');
      a.addEventListener('click', (e) => {
        e.preventDefault();
        openConsultationPopup(href);
      });
    } else if (href.startsWith('#') && href.length > 1) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        scrollToAnchor(href, slideEl.closest('.banner-video'));
      });
    }
    cta.append(a);
    return cta;
  };
  if (slide.cta && slide.cta2) {
    const ctas = document.createElement('div');
    ctas.className = 'banner-video-ctas';
    ctas.append(buildCta(slide.cta, 'banner-video-cta-1'), buildCta(slide.cta2, 'banner-video-cta-2'));
    slideEl.append(ctas);
  } else if (slide.cta) {
    slideEl.append(buildCta(slide.cta));
  }

  setPosition(slideEl, 'cta-desktop', slide.ctaDesktop);
  setPosition(slideEl, 'cta-mobile', slide.ctaMobile);
  // the Icon Position columns place the text image
  setPosition(slideEl, 'icon-desktop', slide.iconDesktop);
  setPosition(slideEl, 'icon-mobile', slide.iconMobile);

  const loadMedia = () => {
    if (slide.image) media.append(buildPicture(slide.image, imageAlt, first, 'banner-video-image'));
    const video = bindVideo(slideEl, slide);
    if (video) media.append(video);
    if (slide.text) media.append(buildPicture(slide.text, title, first, 'banner-video-text'));
  };
  return { slideEl, loadMedia };
}

/* Swiper (and the media of the later slides) loads on the first scroll, tap,
   key or wheel, or after 25 s, the same as carousel-hero-banner: until then the
   first slide is plain HTML, so neither delays the LCP nor adds blocking time. */
function onFirstInteraction(callback) {
  const events = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'wheel'];
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    events.forEach((type) => window.removeEventListener(type, run, { capture: true }));
    callback();
  };
  events.forEach((type) => window.addEventListener(type, run, { passive: true, capture: true }));
  setTimeout(run, 25000);
}

// fade slider with arrows and dots, only when there is more than one slide
function bindSlider(block, container, slides) {
  const slideEls = slides.map((s) => s.slideEl);
  let active = 0;
  let target = 0;
  let swiper;
  let started = false;

  const nav = document.createElement('div');
  nav.className = 'banner-video-nav';
  const arrowButton = (dir, label) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `banner-video-${dir}`;
    button.setAttribute('aria-label', label);
    return button;
  };
  const prev = arrowButton('prev', 'Previous slide');
  const next = arrowButton('next', 'Next slide');
  const dots = slideEls.map((el, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'banner-video-dot';
    dot.setAttribute('aria-label', `Go to slide ${i + 1} of ${slideEls.length}`);
    return dot;
  });
  nav.append(prev, ...dots, next);
  block.append(nav);

  // hidden slides are inert, so only the visible slide's links can be clicked or focused
  const setActive = (index) => {
    active = index;
    slideEls.forEach((el, i) => {
      const current = i === active;
      el.classList.toggle('is-active', current);
      el.setAttribute('aria-hidden', !current);
      el.inert = !current;
      const video = el.querySelector('video');
      if (video && video.getAttribute('src')) {
        if (current && !REDUCED_MOTION.matches) video.play().catch(() => {});
        else video.pause();
      }
    });
    dots.forEach((dot, i) => dot.setAttribute('aria-current', i === active));
    prev.disabled = active === 0;
    next.disabled = active === slideEls.length - 1;
  };

  const start = async () => {
    if (started) return;
    started = true;
    slides.slice(1).forEach((s) => s.loadMedia());
    try {
      const Swiper = await window.loadSwiper();
      swiper = new Swiper(container, {
        effect: 'fade',
        fadeEffect: { crossFade: true },
        speed: REDUCED_MOTION.matches ? 0 : 2000,
        initialSlide: target,
        on: {
          init: (sw) => setActive(sw.activeIndex),
          slideChange: (sw) => setActive(sw.activeIndex),
        },
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('banner-video: Swiper failed to load', e);
    }
  };

  // a click before Swiper is ready opens that slide once it is
  const go = (index) => {
    target = Math.max(0, Math.min(index, slideEls.length - 1));
    if (swiper) swiper.slideTo(target);
    else start();
  };

  prev.addEventListener('click', () => go(active - 1));
  next.addEventListener('click', () => go(active + 1));
  dots.forEach((dot, i) => dot.addEventListener('click', () => go(i)));
  setActive(0);
  onFirstInteraction(start);
}

export default function decorate(block) {
  const data = parse(block);
  const slides = data.map(buildSlide);
  if (!slides.length) return;

  const container = document.createElement('div');
  container.className = 'banner-video-slides swiper';
  // below 992px the banner takes the shape of the first slide's mobile image, so it is not cropped
  const mobileImg = data[0].image?.mobile;
  const width = Number(mobileImg?.getAttribute('width'));
  const height = Number(mobileImg?.getAttribute('height'));
  if (width > 0 && height > 0) {
    container.style.setProperty('--banner-mobile-ratio', `${width} / ${height}`);
    container.style.setProperty('--banner-mobile-height', 'auto');
  }
  const wrapper = document.createElement('div');
  wrapper.className = 'swiper-wrapper';
  wrapper.append(...slides.map((s) => s.slideEl));
  container.append(wrapper);
  block.replaceChildren(container);
  slides[0].loadMedia();

  // one slide: no Swiper, no arrows or dots
  if (slides.length > 1) bindSlider(block, container, slides);
}
