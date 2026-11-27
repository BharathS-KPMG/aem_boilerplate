import { createOptimizedPicture, loadSection } from '../../scripts/aem.js';

/**
 * inspiration-banner — full-width hero with a looping background video, a logo,
 * a heading and a tagline (source: asianpaints.com royale-inspiration
 * "imagebanner video-banner").
 *
 * Authoring (labelled table, like designer-collection-inspiration):
 *   | inspiration-banner |
 *   | Video | Video description | Logo | Title | Tagline |      <- labels (skipped)
 *   | <link to .mp4/.webm> | text | <image> | line 1¶line 2 | text |
 * Rows without a video link are label rows and are ignored; the first row
 * with a video is used. Every cell except Video is optional. Each paragraph
 * of Title is one line of the heading.
 *
 * The video (12 MB on the source) only starts loading after the page has
 * loaded and the banner is on screen. On phones and tablets (< 992px) it also
 * waits for the first touch / key / wheel input: a large <video> that paints
 * after `load` becomes the LCP element (LCP then swings with video download
 * speed) and its frames keep Speed Index running. Until then the dark banner
 * shows the logo and heading. It does not autoplay for visitors who prefer
 * reduced motion or save data; a pause / play button is shown by default
 * (WCAG 2.2.2).
 *
 * Variant "no-toggle": | inspiration-banner (no-toggle) | hides the pause / play
 * button. The video still autoplays and loops; visitors who prefer reduced
 * motion or save data then see the first frame with no way to start it.
 */

const VIDEO_EXT = /\.(mp4|webm|ogg|mov)(\?|#|$)/i;
const TYPES = {
  mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg', mov: 'video/mp4',
};

const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();

function videoUrl(cell) {
  const href = cell?.querySelector('a[href]')?.getAttribute('href') || text(cell);
  return VIDEO_EXT.test(href || '') ? href : '';
}

/** Run once the page has loaded and the element is on screen. */
function whenLoadedAndVisible(el, fn) {
  const onScreen = () => {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        fn();
      }
    });
    io.observe(el);
  };
  if (document.readyState === 'complete') onScreen();
  else window.addEventListener('load', onScreen, { once: true });
}

/** Run fn after the first real user input (mirrors the 992px CSS breakpoint). */
function whenInteracted(fn) {
  const events = ['pointerdown', 'touchstart', 'keydown', 'wheel'];
  const onInput = () => {
    events.forEach((name) => window.removeEventListener(name, onInput));
    fn();
  };
  events.forEach((name) => window.addEventListener(name, onInput, { passive: true }));
}

/** Resolves once loadSection() has revealed the section. */
function whenSectionLoaded(section) {
  return new Promise((resolve) => {
    if (section.dataset.sectionStatus === 'loaded') {
      resolve();
      return;
    }
    const observer = new MutationObserver(() => {
      if (section.dataset.sectionStatus !== 'loaded') return;
      observer.disconnect();
      resolve();
    });
    observer.observe(section, { attributes: true, attributeFilter: ['data-section-status'] });
  });
}

/**
 * The next section holds the LCP (text on mobile, image on desktop): load it
 * now, not in the lazy phase. Its block assets are already in flight
 * (preloadInspirationBannerLcp in pre-load-image.js), so it can be ready
 * before this section, which still waits for the logo; it is revealed only
 * after this one so the banner never pushes it down (CLS).
 */
function loadNextSection(block) {
  const section = block.closest('.section');
  const next = section?.nextElementSibling;
  if (!next?.classList.contains('section')) return;
  loadSection(next, () => whenSectionLoaded(section));
}

export default function decorate(block) {
  const row = [...block.children].find((r) => videoUrl(r.children[0]));
  if (!row) return;
  loadNextSection(block);
  const [videoCell, descCell, logoCell, titleCell, taglineCell] = [...row.children];
  const src = videoUrl(videoCell);

  // background video (no src until it is allowed to load)
  const media = document.createElement('div');
  media.className = 'inspiration-banner-media';
  const video = document.createElement('video');
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'none';
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.tabIndex = -1; // not interactive: the toggle button controls it
  // the video itself is hidden from assistive tech; an authored description
  // is announced on its wrapper instead
  video.setAttribute('aria-hidden', 'true');
  const description = text(descCell);
  if (description) {
    media.setAttribute('role', 'img');
    media.setAttribute('aria-label', description);
  }
  media.append(video);

  // text over the video
  const content = document.createElement('div');
  content.className = 'inspiration-banner-content';
  const logoImg = logoCell?.querySelector('img');
  if (logoImg) {
    // 300px webp: preloaded at this URL by preloadInspirationBannerLcp
    const pic = createOptimizedPicture(logoImg.src, logoImg.alt || '', true, [{ width: '300' }]);
    pic.classList.add('inspiration-banner-logo');
    const img = pic.querySelector('img');
    // reserve the logo's box (source renders it at its intrinsic 145 x 64)
    const w = logoImg.getAttribute('width');
    const h = logoImg.getAttribute('height');
    if (w && h) {
      img.width = w;
      img.height = h;
    }
    img.fetchPriority = 'high';
    content.append(pic);
  }
  const lines = titleCell
    ? [...titleCell.querySelectorAll('p')].map((p) => text(p)).filter(Boolean)
    : [];
  if (!lines.length && text(titleCell)) lines.push(text(titleCell));
  if (lines.length) {
    const h2 = document.createElement('h2');
    h2.className = 'inspiration-banner-title';
    lines.forEach((line) => {
      const span = document.createElement('span');
      span.textContent = line;
      h2.append(span);
    });
    content.append(h2);
  }
  if (text(taglineCell)) {
    const p = document.createElement('p');
    p.className = 'inspiration-banner-tagline';
    p.textContent = text(taglineCell);
    content.append(p);
  }

  // pause / play
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'inspiration-banner-toggle';
  const setState = (playing) => {
    toggle.classList.toggle('is-playing', playing);
    toggle.setAttribute('aria-label', playing ? 'Pause background video' : 'Play background video');
  };
  setState(false);

  let loaded = false;
  const load = () => {
    if (loaded) return;
    loaded = true;
    const source = document.createElement('source');
    source.src = src;
    const ext = (src.match(VIDEO_EXT) || [])[1]?.toLowerCase();
    if (TYPES[ext]) source.type = TYPES[ext];
    video.append(source);
    video.preload = 'auto';
    video.load();
  };
  video.addEventListener('play', () => setState(true));
  video.addEventListener('pause', () => setState(false));
  const play = () => {
    load();
    video.play().catch(() => setState(false));
  };
  toggle.addEventListener('click', () => {
    if (video.paused) play();
    else video.pause();
  });

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection?.saveData;
  const start = () => whenLoadedAndVisible(block, () => {
    if (reduce || saveData) {
      if (!saveData) load(); // first frame, paused
    } else {
      play();
    }
  });
  if (window.matchMedia('(max-width: 991px)').matches) whenInteracted(start);
  else start();

  if (block.classList.contains('no-toggle')) block.replaceChildren(media, content);
  else block.replaceChildren(media, content, toggle);
}
