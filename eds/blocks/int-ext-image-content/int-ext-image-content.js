/**
 * Int Ext Image Content block — image on the left, title, description and
 * animated GIF feature icons on the right (desktop); stacked on mobile.
 *
 * Authoring contract (DA, all content authored, nothing hard-coded).
 * Labelled rows: the first cell names the row, so authors can see what goes where:
 *   | Int Ext Image Content |                    |       |
 *   | Desktop Image         | image              |       |
 *   | Mobile Image          | image (optional)   |       |
 *   | Title                 | title text/heading |       |
 *   | Description           | paragraphs         |       |
 *   | Feature               | GIF icon           | label |   <- one row per feature
 *
 * Rows without a known label are still recognised by what they contain:
 *   - first row with only images  -> media (1st image desktop, 2nd image mobile)
 *   - row with a heading, or text without images -> title + description
 *   - row with an image and text  -> feature (icon + label)
 */

const DESKTOP_MEDIA = '(min-width: 900px)';

/* Row labels authors type in the first cell (case-insensitive) */
const ROW_LABELS = {
  'desktop image': 'desktop',
  image: 'desktop',
  'mobile image': 'mobile',
  title: 'title',
  description: 'description',
  feature: 'feature',
  features: 'feature',
};

/**
 * Returns the row type when the first cell is a known label, and removes that cell.
 * @param {Element} row
 * @returns {string|null}
 */
function takeRowLabel(row) {
  const [first, ...rest] = [...row.children];
  if (!rest.length || first.querySelector('img')) return null;
  const type = ROW_LABELS[first.textContent.trim().toLowerCase().replace(/\s+/g, ' ')];
  if (type) first.remove();
  return type || null;
}

/**
 * Title from a labelled row: keeps an authored heading, otherwise turns the
 * text (line breaks kept) into an h2.
 * @param {Element} row
 * @returns {Element|null}
 */
function buildTitle(row) {
  const heading = row.querySelector('h1, h2, h3, h4, h5, h6');
  if (heading) return heading;
  const lines = [...row.querySelectorAll(':scope > div > *')].filter((el) => el.textContent.trim());
  if (!lines.length && !row.textContent.trim()) return null;
  const h2 = document.createElement('h2');
  if (lines.length) {
    lines.forEach((el, i) => {
      if (i) h2.append(document.createElement('br'));
      h2.append(...el.childNodes);
    });
  } else {
    h2.textContent = row.textContent.trim();
  }
  return h2;
}

function isSameOrigin(url) {
  return url.origin === window.location.origin;
}

/**
 * Same-origin raster images that are safe to request resized/converted.
 * SVG cannot be transcoded and GIF would lose its animation.
 */
function isOptimizable(url) {
  return isSameOrigin(url) && !/\.(svg|gif)$/i.test(url.pathname);
}

function getExtension(url) {
  const match = url.pathname.match(/\.(\w+)$/);
  const ext = match ? match[1].toLowerCase() : 'jpg';
  return ext === 'jpeg' ? 'jpg' : ext;
}

function sizedUrl(url, width, format) {
  return `${url.pathname}?width=${width}&format=${format}&optimize=medium`;
}

/**
 * Appends <source> elements for one image to a picture.
 * @param {HTMLPictureElement} picture
 * @param {HTMLImageElement} img authored image
 * @param {string|null} media media query, null for the default (mobile) source
 * @param {number} width requested rendition width
 */
function appendSources(picture, img, media, width) {
  const url = new URL(img.src, window.location.href);
  const candidates = isOptimizable(url)
    ? [
      { type: 'image/webp', srcset: sizedUrl(url, width, 'webply') },
      { srcset: sizedUrl(url, width, getExtension(url)) },
    ]
    : [{ srcset: img.src }];
  candidates.forEach(({ type, srcset }) => {
    const source = document.createElement('source');
    if (type) source.type = type;
    if (media) source.media = media;
    source.srcset = srcset;
    if (img.getAttribute('width')) source.setAttribute('width', img.getAttribute('width'));
    if (img.getAttribute('height')) source.setAttribute('height', img.getAttribute('height'));
    picture.append(source);
  });
}

/**
 * Builds one art-directed picture: desktop image for >= 900px,
 * mobile image as the default. Uses one image for both if only one is authored.
 */
function buildMediaPicture(desktopImg, mobileImg) {
  const picture = document.createElement('picture');
  if (desktopImg !== mobileImg) appendSources(picture, desktopImg, DESKTOP_MEDIA, 2000);
  appendSources(picture, mobileImg, null, 1200);

  const url = new URL(mobileImg.src, window.location.href);
  const img = document.createElement('img');
  img.src = isOptimizable(url) ? sizedUrl(url, 1200, getExtension(url)) : mobileImg.src;
  img.alt = desktopImg.alt || mobileImg.alt || '';
  img.loading = mobileImg.getAttribute('loading') || desktopImg.getAttribute('loading') || 'lazy';
  ['width', 'height'].forEach((attr) => {
    const value = mobileImg.getAttribute(attr) || desktopImg.getAttribute(attr);
    if (value) img.setAttribute(attr, value);
  });
  picture.append(img);
  return picture;
}

/**
 * Returns a plain <img> for a feature icon. GIFs keep the original file so
 * the animation plays (no format conversion through <picture> sources).
 */
function buildIcon(authoredImg, label) {
  const url = new URL(authoredImg.src, window.location.href);
  const img = document.createElement('img');
  img.src = isSameOrigin(url) && /\.gif$/i.test(url.pathname) ? url.pathname : authoredImg.src;
  // decorative next to its visible label, unless the author gave meaningful alt text
  const alt = (authoredImg.alt || '').trim();
  img.alt = alt && alt.toLowerCase() !== label.toLowerCase() ? alt : '';
  img.loading = 'lazy';
  ['width', 'height'].forEach((attr) => {
    const value = authoredImg.getAttribute(attr);
    if (value) img.setAttribute(attr, value);
  });
  return img;
}

/** Removes an image plus any wrapper (picture, p) it leaves empty. */
function detachImage(img) {
  let node = img.closest('picture') || img;
  while (node.parentElement && node.parentElement.tagName === 'P'
    && node.parentElement.textContent.trim() === ''
    && node.parentElement.querySelectorAll('img').length <= 1) {
    node = node.parentElement;
  }
  node.remove();
}

function buildFeature(row) {
  const authoredImg = row.querySelector('img');
  detachImage(authoredImg);

  const label = document.createElement('p');
  label.className = 'int-ext-image-content-feature-label';
  const blocks = [...row.querySelectorAll(':scope > div > *')].filter((el) => el.textContent.trim());
  if (blocks.length === 1 && blocks[0].tagName === 'P') {
    label.append(...blocks[0].childNodes);
  } else if (blocks.length) {
    label.append(...blocks.flatMap((el, i) => (i ? [document.createElement('br'), ...el.childNodes] : [...el.childNodes])));
  } else {
    label.textContent = row.textContent.trim();
  }

  const li = document.createElement('li');
  li.className = 'int-ext-image-content-feature';
  const icon = document.createElement('span');
  icon.className = 'int-ext-image-content-feature-icon';
  icon.append(buildIcon(authoredImg, label.textContent.trim()));
  li.append(icon, label);
  return li;
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const rows = [...block.children];
  let desktopImg = null;
  let mobileImg = null;
  let title = null;
  const contentNodes = [];
  const features = [];

  rows.forEach((row) => {
    const type = takeRowLabel(row);
    const images = [...row.querySelectorAll('img')];
    const hasText = row.textContent.trim() !== '';

    // labelled rows
    if (type === 'desktop' || type === 'mobile') {
      if (type === 'desktop' && images[0]) [desktopImg] = images;
      if (type === 'mobile' && images[0]) [mobileImg] = images;
      return;
    }
    if (type === 'title') {
      title = title || buildTitle(row);
      return;
    }
    if (type === 'description') {
      row.querySelectorAll(':scope > div').forEach((cell) => contentNodes.push(...cell.childNodes));
      return;
    }
    if (type === 'feature') {
      if (images.length) features.push(buildFeature(row));
      return;
    }

    // unlabelled rows: recognised by what they contain
    const hasHeading = !!row.querySelector('h1, h2, h3, h4, h5, h6');
    if (images.length && !hasText && !desktopImg) {
      [desktopImg, mobileImg = mobileImg] = images;
    } else if (hasHeading || (hasText && !images.length)) {
      row.querySelectorAll(':scope > div').forEach((cell) => contentNodes.push(...cell.childNodes));
    } else if (images.length && hasText) {
      features.push(buildFeature(row));
    }
  });

  if (!title) {
    title = contentNodes.find((node) => node.nodeType === Node.ELEMENT_NODE && /^H[1-6]$/.test(node.tagName)) || null;
  }

  const children = [];

  if (title) {
    title.classList.add('int-ext-image-content-title');
    children.push(title);
  }

  // one image is used for both sizes when only one is authored
  desktopImg = desktopImg || mobileImg;
  mobileImg = mobileImg || desktopImg;
  if (desktopImg) {
    const media = document.createElement('div');
    media.className = 'int-ext-image-content-media';
    media.append(buildMediaPicture(desktopImg, mobileImg));
    children.push(media);
  } else {
    block.classList.add('no-media');
  }

  const descriptionNodes = contentNodes.filter((node) => node !== title
    && !(node.nodeType === Node.TEXT_NODE && !node.textContent.trim()));
  if (descriptionNodes.length) {
    const description = document.createElement('div');
    description.className = 'int-ext-image-content-description';
    description.append(...descriptionNodes);
    children.push(description);
  }

  if (features.length) {
    const list = document.createElement('ul');
    list.className = 'int-ext-image-content-features';
    list.append(...features);
    children.push(list);
  }

  block.replaceChildren(...children);
}
