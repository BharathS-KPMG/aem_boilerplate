/*
  * Video Block
  * Show a video referenced by a link
  * https://www.hlx.live/developer/block-collection/video
  *
  * Authoring format
  *
  * Default:
  * | Video                          |
  * | ------------------------------ |
  * | (optional) placeholder image   |
  * | Video link (YouTube/Vimeo/mp4) |
  * Add the "autoplay" variant to autoplay muted on load.
  *
  * Promo variant - video (promo):
  * | Eyebrow text | Title | Sub title | CTA label | Redirection Link | Video Link |
  * | Left swatch color in hex | Right swatch color in hex |
  * - First row with column labels is optional and is skipped.
  * - Video Link must be an .mp4 or .webm file.
  * - Eyebrow text, Sub title and CTA are optional; the CTA renders only
  *   when both CTA label and Redirection Link are filled.
  * - Swatch columns are optional, each "lower, upper" hex pair
  *   (e.g. "#475C77, #4E6247"); empty or invalid values keep the CSS defaults.
  */

import { triggerCTAClickWithLinkAndTitle } from '../../scripts/analytics_1.js';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function embedYoutube(url, autoplay, background) {
  const usp = new URLSearchParams(url.search);
  let suffix = '';
  if (background || autoplay) {
    const suffixParams = {
      autoplay: autoplay ? '1' : '0',
      mute: background ? '1' : '0',
      controls: background ? '0' : '1',
      disablekb: background ? '1' : '0',
      loop: background ? '1' : '0',
      playsinline: background ? '1' : '0',
    };
    suffix = `&${Object.entries(suffixParams).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
  }
  let vid = usp.get('v') ? encodeURIComponent(usp.get('v')) : '';
  const embed = url.pathname;
  if (url.origin.includes('youtu.be')) {
    [, vid] = url.pathname.split('/');
  }

  const temp = document.createElement('div');
  temp.innerHTML = `<div style="left: 0; width: 100%; height: 0; position: relative; padding-bottom: 56.25%;">
        <iframe src="https://www.youtube.com${vid ? `/embed/${vid}?rel=0&v=${vid}${suffix}` : embed}" style="border: 0; top: 0; left: 0; width: 100%; height: 100%; position: absolute;" 
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope; picture-in-picture" allowfullscreen="" scrolling="no" title="Content from Youtube" loading="lazy"></iframe>
      </div>`;
  return temp.children.item(0);
}

function embedVimeo(url, autoplay, background) {
  const [, video] = url.pathname.split('/');
  let suffix = '';
  if (background || autoplay) {
    const suffixParams = {
      autoplay: autoplay ? '1' : '0',
      background: background ? '1' : '0',
    };
    suffix = `?${Object.entries(suffixParams).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
  }
  const temp = document.createElement('div');
  temp.innerHTML = `<div style="left: 0; width: 100%; height: 0; position: relative; padding-bottom: 56.25%;">
        <iframe src="https://player.vimeo.com/video/${video}${suffix}" 
        style="border: 0; top: 0; left: 0; width: 100%; height: 100%; position: absolute;" 
        frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen  
        title="Content from Vimeo" loading="lazy"></iframe>
      </div>`;
  return temp.children.item(0);
}

function getVideoElement(source, autoplay, background) {
  const video = document.createElement('video');
  video.setAttribute('controls', '');
  if (autoplay) video.setAttribute('autoplay', '');
  if (background) {
    video.setAttribute('loop', '');
    video.setAttribute('playsinline', '');
    video.removeAttribute('controls');
    video.addEventListener('canplay', () => {
      video.muted = true;
      if (autoplay) video.play();
    });
  }

  const sourceEl = document.createElement('source');
  sourceEl.setAttribute('src', source);
  sourceEl.setAttribute('type', `video/${source.split('.').pop()}`);
  video.append(sourceEl);

  return video;
}

const loadVideoEmbed = (block, link, autoplay, background) => {
  if (block.dataset.embedLoaded === 'true') {
    return;
  }
  const url = new URL(link);

  const isYoutube = link.includes('youtube') || link.includes('youtu.be');
  const isVimeo = link.includes('vimeo');

  if (isYoutube) {
    const embedWrapper = embedYoutube(url, autoplay, background);
    block.append(embedWrapper);
    embedWrapper.querySelector('iframe').addEventListener('load', () => {
      block.dataset.embedLoaded = true;
    });
  } else if (isVimeo) {
    const embedWrapper = embedVimeo(url, autoplay, background);
    block.append(embedWrapper);
    embedWrapper.querySelector('iframe').addEventListener('load', () => {
      block.dataset.embedLoaded = true;
    });
  } else {
    const videoEl = getVideoElement(link, autoplay, background);
    block.append(videoEl);
    videoEl.addEventListener('canplay', () => {
      block.dataset.embedLoaded = true;
    });
  }
};

const getCellValue = (cell) => {
  if (!cell) return '';
  const a = cell.querySelector('a');
  if (a) return a.getAttribute('href') || a.textContent.trim();
  return cell.textContent.trim();
};

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

// "#475C77, #4E6247" -> ['#475C77', '#4E6247']; invalid entries become ''
const parseSwatchColors = (cell) => (cell ? cell.textContent.split(',') : [])
  .map((c) => c.trim())
  .map((c) => (c && !c.startsWith('#') ? `#${c}` : c))
  .map((c) => (HEX_COLOR.test(c) ? c : ''));

const setSwatchColors = (block, side, cell) => {
  const [lower, upper] = parseSwatchColors(cell);
  if (lower) block.style.setProperty(`--video-promo-${side}-lower`, lower);
  if (upper) block.style.setProperty(`--video-promo-${side}-upper`, upper);
};

function decoratePromo(block) {
  // Authored structure (one row, optionally preceded by a header row):
  // Eyebrow text | Title | Sub title | CTA label | Redirection Link | Video Link
  // | Left swatch color in hex | Right swatch color in hex
  const rows = [...block.children].filter((r) => r.children.length >= 6);
  const row = rows.find((r) => r.children[5].textContent.trim().toLowerCase() !== 'video link')
      || rows[rows.length - 1];
  if (!row) return;

  const [
    eyebrowCol, titleCol, subTitleCol, ctaLabelCol, ctaLinkCol, videoCol,
    leftSwatchCol, rightSwatchCol,
  ] = [...row.children];

  setSwatchColors(block, 'left', leftSwatchCol);
  setSwatchColors(block, 'right', rightSwatchCol);

  const eyebrowText = eyebrowCol.textContent.trim();
  const headingText = titleCol.textContent.trim();
  const descriptionText = subTitleCol.textContent.trim();
  const ctaText = ctaLabelCol.textContent.trim();
  const ctaHref = getCellValue(ctaLinkCol);
  const ctaLink = ctaText && ctaHref ? { href: ctaHref, text: ctaText } : null;
  const videoUrl = getCellValue(videoCol);

  const textContent = document.createElement('div');
  textContent.className = 'video-promo-text';
  const videoContent = document.createElement('div');
  videoContent.className = 'video-promo-media';

  if (eyebrowText) {
    const eyebrow = document.createElement('p');
    eyebrow.className = 'video-promo-eyebrow';
    eyebrow.textContent = eyebrowText;
    textContent.appendChild(eyebrow);
  }
  if (headingText) {
    const h2 = document.createElement('h2');
    h2.className = 'video-promo-heading';
    h2.textContent = headingText;
    textContent.appendChild(h2);
  }
  if (descriptionText) {
    const desc = document.createElement('p');
    desc.className = 'video-promo-description';
    desc.textContent = descriptionText;
    textContent.appendChild(desc);
  }
  if (ctaLink) {
    const cta = document.createElement('a');
    cta.href = ctaLink.href;
    cta.className = 'video-promo-cta';
    cta.innerHTML = `${ctaLink.text}<span class="video-promo-cta-arrow"></span>`;
    cta.addEventListener('click', () => {
      triggerCTAClickWithLinkAndTitle(ctaLink.href, ctaLink.text, headingText);
    });
    textContent.appendChild(cta);
  }

  if (videoUrl && (videoUrl.includes('.mp4') || videoUrl.includes('.webm'))) {
    const videoWrapper = document.createElement('div');
    videoWrapper.className = 'video-promo-video-wrapper';

    const decoTopRight = document.createElement('div');
    decoTopRight.className = 'video-promo-deco video-promo-deco-top-right';
    const decoBottomLeft = document.createElement('div');
    decoBottomLeft.className = 'video-promo-deco video-promo-deco-bottom-left';

    const autoplay = !prefersReducedMotion.matches;
    const videoEl = getVideoElement(videoUrl, autoplay, autoplay);
    videoEl.className = 'video-promo-video-element';

    videoWrapper.appendChild(decoTopRight);
    videoWrapper.appendChild(videoEl);
    videoWrapper.appendChild(decoBottomLeft);
    videoContent.appendChild(videoWrapper);
  }

  block.textContent = '';
  block.appendChild(textContent);
  block.appendChild(videoContent);
  const moveMobileContent = () => {
    const desc = block.querySelector('.video-promo-description');
    const cta = block.querySelector('.video-promo-cta');
    const media = block.querySelector('.video-promo-media');
    const text = block.querySelector('.video-promo-text');

    if (!desc || !cta || !media || !text) return;

    if (window.innerWidth < 991) {
      if (media.nextElementSibling !== desc) {
        media.after(desc);
        desc.after(cta);
      }
    } else if (text.lastElementChild !== cta) {
      text.append(desc);
      text.append(cta);
    }
  };

  moveMobileContent();
  window.addEventListener('resize', moveMobileContent);
}

/* ===== SIDE-IMAGES VARIANT START: video (side-images) =====
  * | Eyebrow text | Title | Sub title | CTA label | Redirection Link | Video Link |
  * | Left image | Right image |
  * Header row optional. Add #_blank to the link to open in a new tab. */

// live page zoom per width: [min width, zoom]
const SIDE_IMAGES_ZOOM = [
  [1440, 1], [1366, 0.9], [1280, 0.85], [1200, 0.8], [1100, 0.75], [992, 0.7],
];

// image cell -> picture (2nd image = mobile)
function buildSideImage(cell, className) {
  const pictures = cell ? [...cell.querySelectorAll('picture')] : [];
  if (!pictures.length) return null;
  const [picture, mobilePicture] = pictures;
  const mobileImg = mobilePicture?.querySelector('img');
  if (mobileImg) {
    const source = document.createElement('source');
    source.media = '(width <= 991px)';
    source.srcset = mobileImg.currentSrc || mobileImg.src;
    picture.prepend(source);
  }
  picture.classList.add('video-side-image', className);
  return picture;
}

// CTA pill with arrow
function buildSideCta(href, text, title, target) {
  const wrap = document.createElement('div');
  wrap.className = 'video-side-cta-wrap';
  const cta = document.createElement('a');
  cta.className = 'video-side-cta';
  cta.href = href;
  if (target) {
    cta.target = '_blank';
    cta.rel = 'noopener';
  }
  cta.innerHTML = `${text}<span class="video-side-cta-arrow" aria-hidden="true"></span>`;
  cta.addEventListener('click', () => {
    triggerCTAClickWithLinkAndTitle(href, text, title);
  });
  wrap.append(cta);
  return wrap;
}

function decorateSideImages(block) {
  const rows = [...block.children].filter((r) => r.children.length >= 6);
  const row = rows.find((r) => r.children[5].textContent.trim().toLowerCase() !== 'video link')
    || rows[rows.length - 1];
  if (!row) return;

  const [eyebrowCol, titleCol, subTitleCol, ctaLabelCol, ctaLinkCol, videoCol,
    leftImageCol, rightImageCol] = [...row.children];

  const eyebrowText = eyebrowCol.textContent.trim();
  const titleText = titleCol.textContent.trim();
  const descriptionText = subTitleCol.textContent.trim();
  const ctaText = ctaLabelCol.textContent.trim();
  const ctaHrefRaw = getCellValue(ctaLinkCol);
  const ctaNewTab = /#_blank$/.test(ctaHrefRaw);
  const ctaHref = ctaHrefRaw.replace(/#_blank$/, '');
  const videoUrl = getCellValue(videoCol);
  const leftImage = buildSideImage(leftImageCol, 'video-side-image-left');
  const rightImage = buildSideImage(rightImageCol, 'video-side-image-right');

  // text column
  const text = document.createElement('div');
  text.className = 'video-side-text';
  if (eyebrowText) {
    const eyebrow = document.createElement('p');
    eyebrow.className = 'video-side-eyebrow';
    eyebrow.textContent = eyebrowText;
    text.append(eyebrow);
  }
  if (titleText) {
    const h2 = document.createElement('h2');
    h2.className = 'video-side-title';
    h2.textContent = titleText;
    text.append(h2);
  }

  // description + CTA: desktop copy in the text column, mobile copy below the video
  const descriptions = ['desk-only', 'mob-only'].map((only) => {
    if (!descriptionText) return null;
    const desc = document.createElement('p');
    desc.className = `video-side-description ${only}`;
    desc.textContent = descriptionText;
    return desc;
  });
  const ctas = ['desk-only', 'mob-only'].map((only) => {
    if (!ctaText || !ctaHref) return null;
    const wrap = buildSideCta(ctaHref, ctaText, titleText, ctaNewTab);
    wrap.classList.add(only);
    return wrap;
  });
  text.append(...[descriptions[0], ctas[0]].filter(Boolean));

  // media: left image, video, right image
  const media = document.createElement('div');
  media.className = 'video-side-media';
  if (leftImage) media.append(leftImage);
  if (videoUrl && (videoUrl.includes('.mp4') || videoUrl.includes('.webm'))) {
    const videoWrap = document.createElement('div');
    videoWrap.className = 'video-side-video';
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('loop', '');
    if (prefersReducedMotion.matches) {
      video.setAttribute('controls', '');
    } else {
      video.autoplay = true;
      video.setAttribute('autoplay', '');
    }
    if (titleText) video.setAttribute('aria-label', titleText);
    videoWrap.append(video);
    media.append(videoWrap);

    // lazy load the video
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        video.src = videoUrl;
      }
    });
    observer.observe(block);
  }
  if (rightImage) media.append(rightImage);

  block.textContent = '';
  block.append(text, media, ...[descriptions[1], ctas[1]].filter(Boolean));

  // match live's 992-1439px page zoom (skipped where the page already zooms)
  const applyZoom = () => {
    const width = window.innerWidth;
    const step = SIDE_IMAGES_ZOOM.find(([min]) => width >= min);
    const target = step ? step[1] : 1;
    const pageZoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
    const zoom = target / pageZoom;
    block.style.zoom = Math.abs(zoom - 1) < 0.001 ? '' : String(zoom);
  };
  applyZoom();
  let zoomFrame;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(zoomFrame);
    zoomFrame = requestAnimationFrame(applyZoom);
  });
}
/* ===== SIDE-IMAGES VARIANT END ===== */

export default async function decorate(block) {
  // ===== SIDE-IMAGES VARIANT START =====
  if (block.classList.contains('side-images')) {
    decorateSideImages(block);
    return;
  }
  // ===== SIDE-IMAGES VARIANT END =====
  if (block.classList.contains('promo')) {
    decoratePromo(block);
    return;
  }

  const placeholder = block.querySelector('picture');
  const link = block.querySelector('a').href;
  block.textContent = '';
  block.dataset.embedLoaded = false;

  const autoplay = block.classList.contains('autoplay');
  if (placeholder) {
    block.classList.add('placeholder');
    const wrapper = document.createElement('div');
    wrapper.className = 'video-placeholder';
    wrapper.append(placeholder);

    if (!autoplay) {
      wrapper.insertAdjacentHTML(
        'beforeend',
        '<div class="video-placeholder-play"><button type="button" title="Play"></button></div>',
      );
      wrapper.addEventListener('click', () => {
        wrapper.remove();
        loadVideoEmbed(block, link, true, false);
      });
    }
    block.append(wrapper);
  }

  if (!placeholder || autoplay) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        const playOnLoad = autoplay && !prefersReducedMotion.matches;
        loadVideoEmbed(block, link, playOnLoad, autoplay);
      }
    });
    observer.observe(block);
  }
}
