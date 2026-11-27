/**
 * LCP image preloading for the eager phase. Injects
 * <link rel="preload" as="image" fetchpriority="high"> tags before block
 * decoration so the browser fetches the LCP image as early as possible.
 */

/**
 * Append a <link rel="preload" as="image" fetchpriority="high"> for an
 * image URL. Idempotent — no-op if the same href is already preloaded.
 */
function appendImagePreload(href, srcset, sizes, media) {
  if (!href) return;
  if (document.querySelector(`link[rel="preload"][as="image"][href="${CSS.escape(href)}"]`)) return;

  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = href;
  link.setAttribute('fetchpriority', 'high');
  if (srcset) link.setAttribute('imagesrcset', srcset);
  if (sizes) link.setAttribute('imagesizes', sizes);
  // A `media` attribute makes the browser preload only when it matches the
  // viewport — essential for responsive heroes with separate desktop/mobile
  // images, so a phone never wastes bandwidth on the hidden desktop image.
  if (media) link.media = media;
  document.head.appendChild(link);
}

/**
 * Preload an <img>, mirroring its <picture>'s first responsive source so the
 * browser picks the same URL it would from the markup.
 * @returns {boolean} true if the image had a src to preload
 */
function preloadImg(img, media) {
  const src = img?.getAttribute('src');
  if (!src) return false;
  const source = img.closest('picture')?.querySelector('source[srcset]');
  appendImagePreload(src, source?.getAttribute('srcset') || '', source?.getAttribute('sizes') || '', media);
  return true;
}

/**
 * Preload for the carousel-hero-banner, which authors the LCP slide as a
 * desktop image (cell 0) and a separate mobile image (cell 1), toggled at
 * 768px in the block JS. The generic first-<img> logic below always picks
 * cell 0 (desktop), leaving the mobile LCP image unpreloaded on phones —
 * exactly where LCP was swinging. Emit viewport-scoped preloads for both so
 * each device fetches only the image it will actually render.
 * @returns {boolean} true if it handled the preload (caller should stop)
 */
function preloadHeroBannerLcp(firstSection) {
  const heroBanner = firstSection.querySelector('.carousel-hero-banner');
  if (!heroBanner) return false;

  const cells = [...(heroBanner.firstElementChild?.children || [])];
  const cellImg = (cell) => cell?.querySelector('picture')?.querySelector('img');

  // Breakpoint mirrors carousel-hero-banner.js (window.innerWidth < 768).
  const desktopDone = preloadImg(cellImg(cells[0]), '(min-width: 768px)');
  const mobileDone = preloadImg(cellImg(cells[1]), '(max-width: 767px)');
  return desktopDone || mobileDone;
}

// Blocks whose first slide authors a desktop picture then a mobile picture (<768px).
const DESKTOP_MOBILE_PAIR_BLOCKS = ['.image-carousel', '.form-banner'];

/**
 * URL the browser would pick from a <picture> at the current viewport (first
 * <source> whose media matches). With `unscopedOnly` the media-less source is
 * preferred, which is the small variant the pair blocks render on phones.
 * @param {Element} picture The picture element
 * @param {boolean} unscopedOnly Prefer a source without a media query
 * @returns {string} The image URL, or '' when none is found
 */
function pickPictureUrl(picture, unscopedOnly) {
  const sources = [...picture.querySelectorAll('source[srcset]')]
    .filter((s) => !s.type || s.type === 'image/webp');
  const match = (unscopedOnly && sources.find((s) => !s.media))
    || sources.find((s) => !s.media || window.matchMedia(s.media).matches);
  const srcset = match?.getAttribute('srcset') || picture.querySelector('img')?.getAttribute('src') || '';
  return srcset.split(',')[0].trim().split(/\s+/)[0];
}

const bannerVideoWebpUrl = (img, width) => {
  const { origin, pathname } = new URL(img.src, window.location.href);
  return `${origin}${pathname}?width=${width}&format=webply&optimize=medium`;
};

/**
 * Preload for banner-video, which builds its pictures in JS, so the poster and
 * text-overlay images are otherwise only discovered after decoration. The first
 * row names the columns and the second is the first slide. URLs and the 992px
 * breakpoint mirror buildPicture() in banner-video.js.
 * @returns {boolean} true if it handled the preload
 */
function preloadBannerVideoLcp(section) {
  const block = section.querySelector('.banner-video');
  if (!block) return false;

  const [header, firstSlide] = block.children;
  const keys = [...(header?.children || [])]
    .map((cell) => cell.textContent.toLowerCase().replace(/[^a-z]+/g, ' ').trim());
  const slide = {};
  [...(firstSlide?.children || [])].forEach((cell, i) => {
    const img = cell.querySelector('img');
    if (img && keys[i]) slide[keys[i]] = img;
  });

  let found = false;
  [['desktop image', 'mobile image'], ['text image', 'mobile text image']].forEach(([d, m]) => {
    const desktop = slide[d] || slide[m];
    if (!desktop) return;
    found = true;
    const mobile = slide[m] || desktop;
    appendImagePreload(bannerVideoWebpUrl(mobile, 750), '', '', '(max-width: 991px)');
    appendImagePreload(bannerVideoWebpUrl(desktop, 2000), '', '', '(min-width: 992px)');
  });
  return found;
}

/**
 * A media URL with its width/format query swapped (see useUnparsedPictureUrls()).
 * @param {string} url The media URL
 * @returns {string} The same image under a URL the HTML parser has not seen
 */
export const unparsedUrl = (url) => url.replace(/\?width=(\d+)&format=([\w-]+)/g, '?format=$2&width=$1');

/**
 * Chrome registers a deferred request for every loading="lazy" <img> while
 * parsing the HTML. A same-URL preload added later from JS only starts that
 * deferred request, which keeps the <img>'s "auto" priority hint and is not
 * flagged as a preload — failing both the "fetchpriority=high" and the
 * "discoverable" checks of Lighthouse's LCP request discovery audit.
 * Swapping the width/format query order gives each source a URL the parser
 * has not seen (the media service returns identical bytes), so the preload
 * starts a fresh high-priority request that the <img> then reuses.
 * Only for blocks that render the authored URLs as-is, or that call this on
 * the picture they rebuild (cwap-banner): otherwise the block would request
 * the original URL a second time.
 * @param {Element} picture The LCP picture
 */
export function useUnparsedPictureUrls(picture) {
  picture.querySelectorAll('source[srcset]').forEach((source) => {
    source.setAttribute('srcset', unparsedUrl(source.getAttribute('srcset')));
  });
  const img = picture.querySelector('img[src]');
  if (img) img.setAttribute('src', unparsedUrl(img.getAttribute('src')));
}

/**
 * Preload for cwap-banner, which rebuilds its background from a desktop and a
 * mobile image (Background row), so the generic first-<img> logic would
 * preload the desktop image on phones. URLs and the 992px breakpoint mirror
 * buildBackground() in cwap-banner.js, which also applies
 * useUnparsedPictureUrls() so its <img> reuses these preloads.
 * @returns {boolean} true if it handled the preload
 */
function preloadCwapBannerLcp(section) {
  const block = section.querySelector('img')?.closest('.cwap-banner');
  const row = block && [...block.children]
    .find((r) => r.children[0]?.textContent.trim().toLowerCase() === 'background');
  const [desktop, mobile = desktop] = row ? row.querySelectorAll('img') : [];
  if (!desktop) return false;
  appendImagePreload(unparsedUrl(bannerVideoWebpUrl(mobile, 750)), '', '', '(max-width: 991px)');
  appendImagePreload(unparsedUrl(bannerVideoWebpUrl(desktop, 2000)), '', '', '(min-width: 992px)');
  return true;
}

/**
 * Preload for warranty-container, which rebuilds its promo banner (first row
 * with a picture) at 1000px / 750px, so the generic first-<img> logic would
 * preload the authored 2000px source the block never renders. URLs and the
 * 600px breakpoint mirror buildBanner() in warranty-container.js, which also
 * applies useUnparsedPictureUrls() so its <img> reuses these preloads.
 * @returns {boolean} true if it handled the preload
 */
function preloadWarrantyContainerLcp(section) {
  const block = section.querySelector('img')?.closest('.warranty-container');
  const img = block && [...block.children]
    .find((r) => r.querySelector('picture'))?.querySelector('picture img');
  if (!img) return false;
  appendImagePreload(unparsedUrl(bannerVideoWebpUrl(img, 750)), '', '', '(max-width: 599px)');
  appendImagePreload(unparsedUrl(bannerVideoWebpUrl(img, 1000)), '', '', '(min-width: 600px)');
  return true;
}

/**
 * Preload for designer-collection-inspiration, which renders its cards as
 * <picture>s built in JS from the authored <img> srcs (desktop image from
 * 1024px, mobile image below), so the generic first-<picture> logic would
 * preload a 2000px desktop source the block never renders. URLs and the
 * breakpoint mirror buildPicture() in designer-collection-inspiration.js, which
 * also applies useUnparsedPictureUrls() to the first card so its <img> reuses
 * these preloads.
 * @returns {boolean} true if it handled the preload
 */
function preloadDesignerCollectionLcp(section) {
  const block = section.querySelector('img')?.closest('.designer-collection-inspiration');
  const row = block && [...block.children].find((r) => r.children[0]?.querySelector('img'));
  if (!row) return false;
  const desktop = row.children[0].querySelector('img');
  const mobile = row.children[2]?.querySelector('img') || desktop;
  if (mobile.src === desktop.src) {
    appendImagePreload(unparsedUrl(desktop.src));
  } else {
    appendImagePreload(unparsedUrl(mobile.src), '', '', '(max-width: 1023px)');
    appendImagePreload(unparsedUrl(desktop.src), '', '', '(min-width: 1024px)');
  }
  return true;
}

/**
 * Preload for pdp-banner-carousel, which rebuilds its first slide's background
 * from a desktop and an optional mobile image (first cell) at 2000px / 1200px,
 * so the generic first-<img> logic would preload the authored desktop sources
 * the block never renders on phones. URLs and the 900px breakpoint mirror
 * buildBanner() in pdp-banner-carousel.js, which also applies
 * useUnparsedPictureUrls() so its <img> reuses these preloads.
 * @returns {boolean} true if it handled the preload
 */
function preloadPdpBannerCarouselLcp(section) {
  const block = section.querySelector('img')?.closest('.pdp-banner-carousel');
  // config rows (SKU / Product ID / Product Type) are two text cells
  const row = block && [...block.children]
    .find((r) => r.children.length !== 2 || r.querySelector('img'));
  const [desktop, mobile = desktop] = row?.children[0]?.querySelectorAll('img') || [];
  if (!desktop) return false;
  appendImagePreload(unparsedUrl(bannerVideoWebpUrl(mobile, 1200)), '', '', '(max-width: 899px)');
  appendImagePreload(unparsedUrl(bannerVideoWebpUrl(desktop, 2000)), '', '', '(min-width: 900px)');
  return true;
}

const TEXTURE_SWATCH_WIDTHS = [240, 320, 480, 640];

/**
 * Responsive URLs for a texture-listing swatch. The swatch crops its image to
 * cover the slot (object-fit: cover), so the image is drawn at the larger of
 * the slot width and the slot height × the image's aspect ratio. Slots mirror
 * texture-listing.css: from 992px a fifth of the grid (max 1366px less 2 ×
 * 150px padding) less 2 × 20px margin, by 178px; from 768px 30% of the grid
 * (2 × 170px padding), by 102px; below, 30% of the grid (2 × 20px padding),
 * by 102px. The body zoom (0.7–0.9 from 992px to 1439px, styles.css) is left
 * out, so there it errs towards a sharper image. Shared by the block and
 * preloadTextureListingLcp(), so the preload is the URL the swatch <img> picks.
 * @param {HTMLImageElement} img The authored <img>
 * @returns {{src: string, srcset: string, sizes: string}} The <img> attributes
 */
export function textureSwatchSources(img) {
  const { origin, pathname } = new URL(img.src, window.location.href);
  const url = (width) => `${origin}${pathname}?width=${width}&format=webply&optimize=medium`;
  const width = Number(img.getAttribute('width'));
  const height = Number(img.getAttribute('height'));
  const aspect = width > 0 && height > 0 ? width / height : 1;
  const cover = (slot, slotHeight) => `max(${slot}, ${Math.ceil(slotHeight * aspect)}px)`;
  return {
    src: url(TEXTURE_SWATCH_WIDTHS[0]),
    srcset: TEXTURE_SWATCH_WIDTHS.map((w) => `${url(w)} ${w}w`).join(', '),
    sizes: [
      `(min-width: 992px) ${cover('calc(min(20vw, 273px) - 100px)', 178)}`,
      `(min-width: 768px) ${cover('calc(30vw - 102px)', 102)}`,
      cover('calc(30vw - 12px)', 102),
    ].join(', '),
  };
}

/**
 * Preload for texture-listing, which rebuilds its swatches from the authored
 * <img>s at ~240px (textureSwatchSources()), so the generic first-<picture>
 * logic would preload the authored 2000px / 750px source the block never
 * renders, and the LCP swatch would then be fetched a second time.
 * @returns {boolean} true if it handled the preload
 */
function preloadTextureListingLcp(section) {
  // config and tab rows hold no images: the first one is the first texture
  const img = section.querySelector('img');
  if (!img?.closest('.texture-listing')) return false;
  const { src, srcset, sizes } = textureSwatchSources(img);
  appendImagePreload(src, srcset, sizes);
  return true;
}

/**
 * Preload for hero, which authors a desktop then a mobile picture in its first
 * row and merges them in hero.js (mobile image below 992px). The generic
 * first-<img> logic would preload the desktop image on phones.
 * @returns {boolean} true if it handled the preload
 */
function preloadHeroLcp(section) {
  const pictures = section.querySelectorAll('.hero > div:first-child picture');
  if (pictures.length < 2) return false;
  // hero.js moves these sources as they are, so it requests the preloaded URL
  pictures.forEach((p) => useUnparsedPictureUrls(p));
  const isMobile = window.matchMedia('(max-width: 991px)').matches;
  const url = pickPictureUrl(pictures[isMobile ? 1 : 0], false);
  if (!url) return false;
  appendImagePreload(url);
  return true;
}

/**
 * Preload for big-heading-banner (behind the sr-only H1 / breadcrumb on texture
 * pages), which renders its slide row's mobile image (cell 1, else the desktop
 * one) at 1000px below 992px and its desktop image (cell 0) at 2000px from
 * 992px. The generic first-<picture> logic would preload the desktop image on
 * phones, at a width the block never renders, and leave the mobile LCP image to
 * be found late. URLs and the breakpoint mirror buildPicture() in
 * big-heading-banner.js, which also applies useUnparsedPictureUrls() so its
 * <img> reuses these preloads.
 * @returns {boolean} true if it handled the preload
 */
function preloadBigHeadingBannerLcp(section) {
  const block = section.querySelector('img')?.closest('.big-heading-banner');
  const row = block && [...block.children].find((r) => r.querySelector('img'));
  if (!row) return false;
  const [desktopImg, mobileImg] = [...row.children].slice(0, 2)
    .map((cell) => cell.querySelector('img'));
  const mobile = mobileImg || desktopImg;
  const desktop = desktopImg || mobileImg;
  if (!mobile) return false;
  appendImagePreload(unparsedUrl(bannerVideoWebpUrl(mobile, 1000)), '', '', '(max-width: 991px)');
  appendImagePreload(unparsedUrl(bannerVideoWebpUrl(desktop, 2000)), '', '', '(min-width: 992px)');
  return true;
}

/**
 * Preload for blocks that author a desktop and a mobile picture in their first
 * slide. The generic first-<img> logic would preload the desktop image (and its
 * 2000px source) on phones and leave the real mobile LCP image to be found late.
 * @returns {boolean} true if it handled the preload
 */
function preloadPairBlockLcp(section) {
  if (preloadBannerVideoLcp(section) || preloadCwapBannerLcp(section)
    || preloadWarrantyContainerLcp(section) || preloadDesignerCollectionLcp(section)
    || preloadPdpBannerCarouselLcp(section) || preloadTextureListingLcp(section)
    || preloadHeroLcp(section) || preloadBigHeadingBannerLcp(section)) return true;
  const block = section.querySelector(DESKTOP_MOBILE_PAIR_BLOCKS.join(','));
  const row = block && [...block.children].find((r) => r.querySelector('picture'));
  const pictures = row ? [...row.querySelectorAll('picture')] : [];
  if (!pictures.length) return false;

  // Both pair blocks copy the authored srcset/src into the slide they render
  pictures.forEach((p) => useUnparsedPictureUrls(p));

  const isMobile = window.matchMedia('(max-width: 767px)').matches;
  const picture = (isMobile && pictures[1]) || pictures[0];
  const url = pickPictureUrl(picture, isMobile && !!pictures[1]);
  if (!url) return false;
  appendImagePreload(url);
  return true;
}

/**
 * Preload for collection-listing, which builds its cards (and so the LCP image)
 * from its data and the wishlist script: fetch both in the eager phase alongside
 * the block's JS, not once the block has run. The data URL mirrors decorate() in
 * collection-listing.js: a Data (or API) row, else the page metadata
 * collection-listing-api, else the default workbook.
 * @returns {boolean} true if the section holds the block
 */
function preloadCollectionListingData(section) {
  const block = section.querySelector('.collection-listing');
  if (!block) return false;
  const row = [...block.children]
    .filter((r) => ['data', 'api'].includes(r.children[0]?.textContent.trim().toLowerCase()))
    .pop();
  const authored = row && (row.querySelector('a[href]')?.href
    || row.children[2]?.textContent.trim() || row.children[1]?.textContent.trim());
  const href = authored
    || document.head.querySelector('meta[name="collection-listing-api"]')?.content;
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'fetch';
  link.href = href;
  // fetch() requests are CORS-mode: without this the preload would not be reused
  link.crossOrigin = 'anonymous';
  link.setAttribute('fetchpriority', 'high');
  const wishlist = document.createElement('link');
  wishlist.rel = 'modulepreload';
  wishlist.href = `${window.hlx.codeBasePath}/scripts/wishlist.js`;
  document.head.append(link, wishlist);
  return true;
}

/**
 * Preload for catalogue-listing, which builds its grid from the shade API. From 900px its shell
 * (catalogue-listing.js) shows the help card, the LCP there, in the grid's 2nd row at 400px; on
 * phones the shell has no image (the title is the LCP), so nothing is preloaded. The generic
 * first-<picture> logic would preload the help card's authored 2000px / 750px source, a URL the
 * block never requests. The URL mirrors createOptimizedPicture() in aem.js at 400px.
 * @returns {boolean} true if the section holds the block
 */
function preloadCatalogueListingLcp(section) {
  const block = section.querySelector('.catalogue-listing');
  if (!block) return false;
  const row = [...block.children].find((r) => r.children[0]?.textContent
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === 'help card');
  const src = row?.querySelector('img')?.getAttribute('src');
  if (src) {
    const { origin, pathname } = new URL(src, window.location.href);
    appendImagePreload(`${origin}${pathname}?width=400&format=webply&optimize=medium`, '', '', '(min-width: 900px)');
  }
  return true;
}

/**
 * catalogue-listing-v2 builds its LCP image (the first top filter chip) in its JS. Its authored
 * pictures (the floating "colour of the year" badge and card) are rebuilt small by the block, the
 * card only on first open, so the generic first-<picture> logic must not preload them.
 * @returns {boolean} true if the section holds the block
 */
const preloadCatalogueListingV2Lcp = (section) => !!section.querySelector('.catalogue-listing-v2');

// Blocks that build their images from data (no <img> in the authored markup).
// catalogue-listing-v2: its JS adds the top filter chips (the LCP image) to its shell.
const DATA_IMAGE_BLOCKS = ['.collection-listing', '.wallpaper-collection', '.catalogue-listing-v2'];
const LCP_SECTION_SELECTOR = ['img', '.hero', '.hero-form', '.carousel-hero-banner', ...DATA_IMAGE_BLOCKS].join(', ');

/**
 * Pages often open with image-less sections (sr-only H1, breadcrumb), so the
 * real LCP sits in a later section that is neither preloaded nor decorated
 * until the lazy phase. Find the first section with an image within the first
 * three; null when the first section already holds it. Otherwise the eager
 * phase paints nothing, and the lazy phase only starts once waitForFirstPaint()
 * in scripts.js times out (3 s).
 * @param {Element} main The main element
 * @returns {Element|null} The LCP section when it is not the first one
 */
export function findLcpSection(main) {
  const sections = [...main.querySelectorAll(':scope > div')].slice(0, 3);
  const index = sections.findIndex((s) => s.querySelector(LCP_SECTION_SELECTOR));
  return index > 0 ? sections[index] : null;
}

/**
 * Starts fetching a block's JS and CSS without decorating it, so loadBlock()
 * finds them in cache. CSS is warmed with fetch() rather than a <link>,
 * because loadCSS() skips any href already in <head>.
 * @param {string} name The block name
 * @param {string} priority The fetch priority ('high' or 'low')
 */
export function warmBlockAssets(name, priority) {
  const base = window.hlx.codeBasePath;
  const js = document.createElement('link');
  js.rel = 'modulepreload';
  js.href = `${base}/blocks/${name}/${name}.js`;
  js.setAttribute('fetchpriority', priority);
  document.head.appendChild(js);
  fetch(`${base}/blocks/${name}/${name}.css`, { priority }).catch(() => {});
}

/**
 * The LCP section's blocks (e.g. contact-get-in-touch behind an sr-only H1)
 * would otherwise only start fetching once the first section has loaded — a
 * full round trip of render delay. Fetch them up front at high priority.
 * @param {Element|null} section The section from findLcpSection
 */
export function preloadLcpSectionBlocks(section) {
  section?.querySelectorAll('div.block').forEach(({ dataset }) => {
    if (dataset.blockName) warmBlockAssets(dataset.blockName, 'high');
  });
}

/**
 * Preload for paint-quotation-tool, which draws its Background row (a desktop
 * image, then a mobile one) as a CSS background, from each image's URL without
 * its query, switching at 900px (paint-quotation-tool.js / .css). The generic
 * first-<img> logic would preload the desktop image's 2000px source on phones,
 * a URL the block never requests. Also warms the section's other blocks (its
 * form-config): loadSection() only requests them once this block has
 * decorated, and the section stays hidden until they load. Runs before
 * decoration, so the raw markup is read.
 * @returns {boolean} true if it handled the preload
 */
function preloadPaintQuotationToolLcp(section) {
  const block = section.querySelector('.paint-quotation-tool');
  if (!block) return false;
  const row = [...block.children]
    .find((r) => r.children[0]?.textContent.trim().toLowerCase() === 'background');
  const [desktop, mobile = desktop] = row ? row.querySelectorAll('img') : [];
  const bare = (img) => img?.src.split('?')[0];
  const mobileUrl = bare(mobile);
  const desktopUrl = bare(desktop);
  if (!desktopUrl) return false;
  appendImagePreload(mobileUrl, '', '', '(max-width: 899px)');
  appendImagePreload(desktopUrl, '', '', '(min-width: 900px)');
  section.querySelectorAll(':scope > div[class]').forEach(({ classList: [name] }) => {
    if (name !== 'paint-quotation-tool' && name !== 'section-metadata') warmBlockAssets(name, 'high');
  });
  return true;
}

/**
 * Preload for inspiration-banner. Its section opens with an sr-only H1 block,
 * so loadSection() only requests the banner's JS and CSS after that block's
 * round trip; the logo (rebuilt at 300px, so the generic first-<img> logic
 * would preload the authored 2000px source the block never renders) and the
 * next section, which holds the LCP and is started by the banner's
 * decorate(), only after the banner decorates. Start all of them now. The
 * logo URL mirrors decorate() in inspiration-banner.js. Runs before
 * decoration, so block names are read from the raw markup.
 * @returns {boolean} true if it handled the preload
 */
function preloadInspirationBannerLcp(section) {
  const block = section.querySelector('.inspiration-banner');
  if (!block) return false;
  const logo = block.querySelector('img');
  if (logo) appendImagePreload(bannerVideoWebpUrl(logo, 300));
  const nextBlocks = section.nextElementSibling?.querySelectorAll(':scope > div[class]') || [];
  [block, ...nextBlocks].forEach(({ classList: [name] }) => {
    if (name !== 'section-metadata') warmBlockAssets(name, 'high');
  });
  return true;
}

/**
 * Preload for cards-inspiration (colour inspiration listing pages). Its section comes after the
 * sr-only, breadcrumb and color-inspiration-listing sections, and the block rebuilds every card
 * <picture> at 750px, so the generic first-<img> logic would boost the authored (min-width:
 * 600px) source: a 2000px image the block never renders. Preload the first row's 750px images
 * instead (one card below 992px, four from 992px: the ones the block makes eager), and warm the
 * blocks of the sections up to the cards, which loadSection() would otherwise request one
 * section after another. URLs mirror buildPicture() in cards-inspiration.js, unparsed (see
 * useUnparsedPictureUrls(): below 600px the authored lazy <img> has the same 750px URL). Runs
 * before decoration, so the raw markup is read.
 * @returns {boolean} true if it handled the preload
 */
function preloadCardsInspirationLcp(section) {
  const block = section.querySelector('.cards-inspiration');
  if (!block) return false;
  const isLocal = (img) => new URL(img.src, window.location.href).origin === window.location.origin;
  [...block.children].slice(0, 4).forEach((row, i) => {
    const imageCell = [...row.children].find((cell) => cell.querySelector('img'));
    const images = [...(imageCell?.querySelectorAll('img') || [])].slice(0, 2);
    if (!images.length) return;
    const local = images.every(isLocal);
    const [desktop, mobile = desktop] = images
      .map((img) => unparsedUrl(local ? bannerVideoWebpUrl(img, 750) : img.src));
    if (i > 0) {
      appendImagePreload(desktop, '', '', '(min-width: 992px)');
    } else if (mobile !== desktop) {
      appendImagePreload(desktop, '', '', '(min-width: 768px)');
      appendImagePreload(mobile, '', '', '(max-width: 767px)');
    } else {
      appendImagePreload(desktop);
    }
  });
  const sections = [...section.parentElement.children];
  sections.slice(0, sections.indexOf(section) + 1).forEach((part) => {
    part.querySelectorAll(':scope > div[class]').forEach(({ classList: [name] }) => {
      if (name !== 'section-metadata') warmBlockAssets(name, 'high');
    });
  });
  return true;
}

// Blocks that render the authored <picture> as-is (no createOptimizedPicture
// rebuild), so its URLs can safely be rewritten before the block decorates.
const AUTHORED_PICTURE_BLOCKS = ['.contact-get-in-touch'];

/**
 * Preload the first image of a (non-first) LCP section.
 * @param {Element} section The section from findLcpSection
 */
function preloadSectionLcp(section) {
  if (preloadHeroBannerLcp(section) || preloadPaintQuotationToolLcp(section)
    || preloadPairBlockLcp(section) || preloadCardsInspirationLcp(section)
    || preloadCollectionListingData(section) || preloadCatalogueListingLcp(section)
    || preloadCatalogueListingV2Lcp(section)) return;
  const picture = section.querySelector('picture');
  if (picture?.closest(AUTHORED_PICTURE_BLOCKS.join(','))) useUnparsedPictureUrls(picture);
  const url = picture ? pickPictureUrl(picture, false) : section.querySelector('img')?.getAttribute('src');
  if (url) appendImagePreload(url);
}

/**
 * Preload a section's first <img>. With `boost` the <img> itself is also made
 * eager / high priority (used by the .get-inspired walk).
 * @returns {boolean} true if it handled the preload
 */
function preloadFirstImg(section, boost) {
  const img = section.querySelector('img');
  if (!img?.getAttribute('src')) return false;
  if (boost) {
    img.setAttribute('loading', 'eager');
    img.setAttribute('fetchpriority', 'high');
  }
  return preloadImg(img);
}

const HERO_BG_KEYS = ['hero-bg-desktop', 'hero-background-desktop'];

/**
 * Preload the desktop background URL that hero / hero-form author as text in a
 * "Hero BG Desktop" row (no <img> in the markup).
 * @returns {boolean} true if it handled the preload
 */
function preloadHeroBackground(section) {
  const rows = section.querySelector('.hero-form, .hero')?.querySelectorAll(':scope > div') || [];
  return [...rows].some((row) => {
    const key = (row.children[0]?.textContent || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
    const url = (row.children[1]?.textContent || '').trim();
    if (!HERO_BG_KEYS.includes(key) || !/^(http|\/|\.)/.test(url)) return false;
    appendImagePreload(url);
    return true;
  });
}

/**
 * Preload the LCP image in the eager phase, before block decoration. Hero
 * <img>s only get fetchpriority="high" once their block decorates, after the
 * preload scanner has missed them — failing Lighthouse's "LCP request
 * discovery" audit and costing 200–500 ms of LCP on cold-cache runs. A
 * <link rel="preload" fetchpriority="high"> here lets the browser dedupe the
 * <img> fetch at high priority.
 *
 * An author <meta name="lcp-image" content="<url>"> wins; otherwise the
 * block-specific handlers above, then the first <img>, then a hero background.
 * preloadInspirationBannerLcp() also warms the banner's and the next
 * section's block assets.
 * @param {Document} doc The document
 */
export function preloadLcpImage(doc) {
  const metaHint = doc.querySelector('meta[name="lcp-image"]')?.content?.trim();
  if (metaHint) {
    appendImagePreload(metaHint);
    return;
  }

  const firstSection = doc.querySelector('main > div:first-child');
  if (!firstSection) return;

  // Section walking is scoped to .get-inspired pages: that block stays
  // `visibility: hidden` until decorate() and usually sits after sr-only /
  // breadcrumb sections. Applied globally it regressed CLS (e.g. image-carousel
  // <img>s without width/height were pulled into the CLS window), so other
  // pages inspect only the first section, then the findLcpSection() one.
  // Colour inspiration listing pages walk too, as loadEager() in scripts.js
  // loads them section by section.
  if (!doc.querySelector('main .get-inspired, main .color-inspiration-listing')) {
    if (preloadHeroBannerLcp(firstSection) || preloadInspirationBannerLcp(firstSection)
      || preloadPaintQuotationToolLcp(firstSection) || preloadPairBlockLcp(firstSection)
      || preloadCatalogueListingLcp(firstSection) || preloadCatalogueListingV2Lcp(firstSection)
      || preloadFirstImg(firstSection)
      || preloadHeroBackground(firstSection) || preloadCollectionListingData(firstSection)) return;
    const lcpSection = findLcpSection(doc.querySelector('main'));
    if (lcpSection) preloadSectionLcp(lcpSection);
    return;
  }

  [...doc.querySelectorAll('main > div')].some((section) => preloadHeroBannerLcp(section)
    || preloadCardsInspirationLcp(section) || preloadFirstImg(section, true)
    || preloadHeroBackground(section));
}
