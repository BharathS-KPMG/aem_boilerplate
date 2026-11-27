import { createOptimizedPicture, toClassName } from '../../scripts/aem.js';
import { PROD_DOMAIN, STATIC_DOMAIN } from '../../scripts/environment.js';
import {
  pushAdobeCtaClickEvent,
  pushAdobeFormEvents,
  trackFormError,
  pushAdobeProductTitleClick,
} from '../../scripts/analytics_1.js';
import initWishlist from '../../scripts/wishlist.js';

/**
 * AP Blogs block: the whole Asian Paints blog details page from one block table
 * (EDS version of the AEM "asianpaints-blog-details-page-template").
 * First cell = label (case-insensitive), then the value cell(s). Every row is optional and a
 * missing or empty row renders nothing. Labels: see README.md.
 * Layout: full-width banner, then left (author, tags, related slot) | main (title ... like) |
 * right (promo, sticky form) from 992px, stacked below; full-width previous / next row.
 */

const REPEATABLE = ['colour', 'video', 'text', 'image'];
const HEADER_OFFSET = 100;
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
const OPEN_ON_LOAD = window.matchMedia('(width >= 769px)');
const SVG_NS = 'http://www.w3.org/2000/svg';
const THUMB = [
  'M3 17.5h9a1.5 1.5 0 0 1 1.5 1.5v22a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 41V19A1.5 1.5 0 0 1 3 17.5Z',
  'M13.5 20.5 16.5 17.5 18 15 19 12 19.5 5.5Q19.5 3.5 21.5 3.5 23.5 3.5 24.5 5.5L26 8Q27 9.5 27 11V17.5H39C41 17.5 41.5 18.5 41.5 20 41.5 21.8 40.5 22.7 38.5 23 40.5 23.5 41 24.5 41 26.3 41 28 40 29.2 37 29.5 38.8 30 39.5 31 39.5 32.5 39.5 34 38.7 35 36 35.5 37.7 36 38.5 37 38.5 38.5 38.5 40 37.5 41.5 36 41.5H17C15.5 41.5 14.5 40.5 13.5 39.5Z',
];
// label row key, field name, accessible label, input type, autocomplete, digits, error message
const FORM_FIELDS = [
  ['form-name', 'name', 'Name', 'text', 'name'],
  ['form-email', 'email', 'Email', 'email', 'email', 0, 'Please enter a valid email address'],
  ['form-mobile', 'mobile', 'Mobile number', 'tel', 'tel-national', 10, 'Please enter a valid 10-digit mobile number'],
  ['form-pincode', 'pincode', 'Pincode', 'text', 'postal-code', 6, 'Please enter a valid 6-digit pincode'],
].map(([key, name, label, type, autocomplete, max, message]) => ({
  key,
  name,
  label,
  type,
  autocomplete,
  max,
  message,
  pattern: max ? new RegExp(`^\\d{${max}}$`) : (message && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/),
}));

// START FIX FIELD VALIDATION: the same rules and messages as the stg form block (form.js): name =
// letters and spaces only (2+), email = name@domain.tld, mobile = 10 digits, pincode = 6 digits;
// characters that are not allowed are removed while typing
const FIELD_RULES = {
  name: {
    pattern: /^[A-Za-z ]{2,}$/, strip: /[^A-Za-z ]/g, htmlPattern: '[A-Za-z ]{2,}', message: 'Please enter a valid name (letters only)',
  },
  email: { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Email is invalid' },
  mobile: {
    pattern: /^\d{10}$/, strip: /\D/g, htmlPattern: '[0-9]{10}', message: 'Phone number is invalid',
  },
  pincode: {
    pattern: /^\d{6}$/, strip: /\D/g, htmlPattern: '[0-9]{6}', message: 'Enter a valid 6 digit Zip Code',
  },
};
const REQUIRED_MESSAGE = 'Field is required';
FORM_FIELDS.forEach((def) => Object.assign(def, FIELD_RULES[def.name]));
// END FIX FIELD VALIDATION

let instance = 0;

const text = (cell) => (cell?.textContent || '').replace(/\s+/g, ' ').trim();
const hasContent = (cell) => !!cell && (!!text(cell) || !!cell.querySelector('picture, img, a[href]'));

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

/** An optimised picture from the first image of a cell. */
function picture(cell, eager = false, widths = [{ media: '(min-width: 600px)', width: '2000' }, { width: '750' }]) {
  const img = cell?.querySelector('img');
  if (!img) return null;
  return createOptimizedPicture(img.src, img.alt, eager, widths);
}

// START FIX MOBILE IMAGES: like live (separate mobile renditions, e.g. "...-m.webp"), a second
// image in the same cell (or the image of a "... Mobile" row) is shown below `minWidth`, the first
// image from `minWidth` up; null when there is no mobile image (the caller keeps its own picture)
function mobilePicture(cell, mobileCell, minWidth, width = '1400', eager = false) {
  const [desktop, second] = cell ? [...cell.querySelectorAll('img')] : [];
  const mobile = mobileCell?.querySelector('img') || second;
  if (!desktop || !mobile) return null;
  const pic = createOptimizedPicture(mobile.src, desktop.alt || mobile.alt, eager, [{ width: '750' }]);
  const desktopPic = createOptimizedPicture(desktop.src, desktop.alt, eager, [{ media: `(min-width: ${minWidth}px)`, width }]);
  pic.prepend(...desktopPic.querySelectorAll('source[media]'));
  return pic;
}
// END FIX MOBILE IMAGES

/** The authored rich text of a cell, as a div (null when empty). */
function richText(cell, className) {
  if (!hasContent(cell)) return null;
  const div = el('div', className);
  div.append(...cell.childNodes);
  // wrap loose text (a cell without paragraphs)
  if (![...div.children].length) div.replaceChildren(el('p', '', text(cell)));
  div.querySelectorAll('picture').forEach((pic) => {
    const img = pic.querySelector('img');
    if (img) pic.replaceWith(createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]));
  });
  return div;
}

// START FIX AUTHOR LABELS: author-friendly DA field labels, named after the live blog components
// (bannercarousel, profileinfo, tableofcontent, swapimagewithcta, image + rte text, likedislike,
// ccforms ...). New label -> the field it fills; the earlier short labels keep working.
const LABEL_ALIASES = {
  'favourite-icon-link': 'favourite',
  'share-options': 'share',
  'author-label': 'author-title',
  'trending-tags-title': 'tag-title',
  'trending-tags': 'tags',
  'blog-categories': 'categories',
  'blog-title': 'title',
  'intro-text': 'intro',
  'table-of-contents-title': 'toc-title',
  'table-of-contents-headings': 'toc-headings',
  // START TOC LABELS
  'table-of-contents-labels': 'toc-labels',
  // END TOC LABELS
  // START BLOG WISHLIST
  'blog-code': 'wishlist-code',
  'wishlist-sku': 'wishlist-code',
  // END BLOG WISHLIST
  'consultation-banner-image': 'consultation-image',
  'consultation-banner-image-mobile': 'consultation-image-mobile',
  'consultation-banner-title': 'consultation-text',
  'consultation-banner-button': 'consultation-cta',
  'image-with-text': 'colour',
  'article-text': 'text',
  'article-image': 'image',
  'like-article-title': 'like-title',
  'like-article-text': 'like-text',
  'promo-tagline': 'promo-eyebrow',
  'promo-button': 'promo-cta',
  'form-description': 'form-text',
  'form-name-placeholder': 'form-name',
  'form-email-placeholder': 'form-email',
  'form-mobile-placeholder': 'form-mobile',
  'form-pincode-placeholder': 'form-pincode',
  'form-whatsapp-checkbox': 'form-whatsapp',
  'form-terms-text': 'form-consent',
  'form-button-text': 'form-button',
  'form-submit-url': 'form-action',
  'form-success-message': 'form-thank-you',
  'form-error-message': 'form-error',
  // START FIX STG LEAD SUBMIT
  campaign: 'form-campaign-id',
  'campaign-id': 'form-campaign-id',
  node: 'form-node',
  'form-resource-path': 'form-node',
  // END FIX STG LEAD SUBMIT
};
// END FIX AUTHOR LABELS

/** Reads the block table into single fields and the repeatable article rows. */
function readRows(block) {
  const fields = {};
  const article = [];
  [...block.children].forEach((row) => {
    const [keyCell, ...cells] = row.children;
    // START FIX AUTHOR LABELS
    const label = toClassName(text(keyCell));
    const key = LABEL_ALIASES[label] || label;
    // END FIX AUTHOR LABELS
    if (!key || !cells.some(hasContent)) return;
    if (REPEATABLE.includes(key)) article.push({ key, cells });
    else if (!fields[key]) fields[key] = cells;
  });
  return { fields, article };
}

function buildBanner(f) {
  const desktop = f['banner-image']?.[0]?.querySelector('img');
  const mobile = f['banner-image-mobile']?.[0]?.querySelector('img') || desktop;
  if (!desktop && !mobile) return null;
  const main = desktop || mobile;
  const pic = createOptimizedPicture(mobile.src, main.alt || mobile.alt, true, [{ width: '750' }]);
  const desktopPic = createOptimizedPicture(main.src, main.alt, true, [{ media: '(min-width: 992px)', width: '2000' }]);
  pic.prepend(...desktopPic.querySelectorAll('source[media]'));
  pic.querySelector('img').setAttribute('fetchpriority', 'high');
  const href = f['banner-link']?.[0]?.querySelector('a[href]')?.href;
  const banner = el(href ? 'a' : 'div', 'ap-blogs-banner');
  if (href) {
    banner.href = href;
    if (!main.alt) banner.setAttribute('aria-label', 'Banner');
  }
  banner.append(pic);
  return banner;
}

// START BANNER ICONS: favourite (heart) and share buttons on the banner, like the live sharetool
// (same icons, taken from the live sprites: blocks/ap-blogs/icons/*.png).
// Optional rows: "Favourite" (a link opened by the heart, or "none" to hide it; without it the
// heart opens the Asian Paints login and comes back to the blog, like live for visitors who are
// not logged in) and "Share" (channels, e.g. "Facebook, Twitter", or "none"; without it all live
// channels are shown: Facebook, Whatsapp (mobile), Twitter, Pinterest, Mail, SMS).

const SHARE_CHANNELS = {
  facebook: { label: 'Facebook', url: ({ url }) => `https://www.facebook.com/sharer/sharer.php?u=${url}` },
  whatsapp: { label: 'Whatsapp', url: ({ url, title }) => `https://api.whatsapp.com/send?text=${title}%20${url}`, className: 'ap-blogs-share-mobile' },
  twitter: { label: 'Twitter', url: ({ url, text: t }) => `https://twitter.com/share?url=${url}&text=${t}` },
  pinterest: { label: 'Pinterest', url: ({ url, text: t, media }) => `https://www.pinterest.com/pin/create/button/?url=${url}&media=${media}&description=${t}` },
  mail: { label: 'Mail', url: ({ url, title, description }) => `mailto:?subject=${title}&body=${description}%20${url}` },
  sms: { label: 'SMS', url: ({ url, title }) => `sms:?&body=${title}%20${url}` },
};

/** The page details used by the share links (canonical URL, title, description, banner image). */
function shareData(banner) {
  const meta = (name) => document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.content || '';
  const canonical = document.querySelector('link[rel="canonical"]')?.href;
  const title = meta('og:title') || document.title;
  const description = meta('description') || meta('og:description');
  const img = banner.querySelector('img');
  const enc = encodeURIComponent;
  return {
    url: enc(canonical || `${window.location.origin}${window.location.pathname}`),
    title: enc(title),
    description: enc(description),
    text: enc([title, description].filter(Boolean).join(' ')),
    media: enc(img ? new URL(img.currentSrc || img.src, window.location.href).href : ''),
  };
}

// START FIX LOGIN FROM HEADER: the site header owns the sign-in (per environment: betaauth on
// beta, auth on www; see header.js startLogin), so the heart uses it instead of its own login
async function headerLogin() {
  const header = await import('../header/header.js').catch(() => ({}));
  if (typeof header.startLogin === 'function') await header.startLogin(window.location.href);
}
// END FIX LOGIN FROM HEADER

function buildFavourite(cell, wishlist = {}) {
  const href = cell?.querySelector('a[href]')?.href;
  const button = el('button', 'ap-blogs-icon-button ap-blogs-favourite');
  button.type = 'button';
  button.setAttribute('aria-label', 'Favorite icon');
  // START BLOG WISHLIST: with a "Wishlist Code" row (the blog's code) the heart
  // saves the blog in the visitor's wishlist like live (type "blogs", see scripts/wishlist.js):
  // selected when saved, a click adds / removes it, signed out it opens the login
  if (wishlist.code && !href) {
    button.setAttribute('aria-pressed', 'false');
    button.dataset.attrSku = wishlist.code;
    button.dataset.pid = wishlist.pid || wishlist.code;
    button.dataset.attrAction = 'like';
    button.dataset.attrType = wishlist.type || 'blogs';
    if (wishlist.title) button.dataset.attrTitle = wishlist.title;
    // scripts/wishlist.js handles the click (and the login through the header)
    return button;
  }
  // END BLOG WISHLIST

  button.addEventListener('click', () => {
    if (href) window.location.assign(href);
    else headerLogin();
  });
  return button;
}

function buildShare(cell, banner) {
  const wanted = cell ? text(cell).toLowerCase().split(/[\s,|]+/).filter((c) => SHARE_CHANNELS[c]) : [];
  const channels = wanted.length ? [...new Set(wanted)] : Object.keys(SHARE_CHANNELS);
  const wrap = el('div', 'ap-blogs-share');
  const button = el('button', 'ap-blogs-icon-button ap-blogs-share-button');
  button.type = 'button';
  button.setAttribute('aria-label', 'Share icon');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', `ap-blogs-share-menu-${instance}`);
  const menu = el('ul', 'ap-blogs-share-menu');
  menu.id = `ap-blogs-share-menu-${instance}`;
  menu.hidden = true;
  channels.forEach((key) => {
    const channel = SHARE_CHANNELS[key];
    const li = el('li', channel.className);
    const a = el('a', `ap-blogs-share-${key}`, channel.label);
    a.href = '#';
    // the links are built on click so they use the final page title / URL
    a.addEventListener('click', (event) => {
      const href = channel.url(shareData(banner));

      pushAdobeProductTitleClick({
        event: 'share_click',
        shareType: channel.label,
        productName: document.querySelector('.ap-blogs-title')?.textContent?.trim() || '',
      });

      if (/^(mailto|sms):/.test(href)) {
        a.href = href;
        return;
      }
      event.preventDefault();
      window.open(href, '_blank', 'noopener,width=600,height=500');
    });
    li.append(a);
    menu.append(li);
  });
  const setOpen = (open) => {
    button.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
  };
  button.addEventListener('click', () => setOpen(menu.hidden));
  wrap.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) {
      setOpen(false);
      button.focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (!menu.hidden && !wrap.contains(event.target)) setOpen(false);
  });
  wrap.append(button, menu);
  return wrap;
}

/** The banner with its favourite / share buttons (the banner alone when both are set to "none"). */
function buildHero(f, banner) {
  if (!banner) return null;
  const off = (key) => /^(none|no|hide|off|false)$/i.test(text(f[key]?.[0]));
  const favouriteCell = (f.favourite || f['favourite-link'])?.[0];
  const tools = el('div', 'ap-blogs-banner-tools');
  // START BLOG WISHLIST
  const wishlist = {
    // authored rows "Data Attr Sku" / "Data Attr Pid" ("Wishlist Code" also works for the SKU)
    code: text(f['data-attr-sku']?.[0]) || text(f['wishlist-code']?.[0]),
    pid: text(f['data-attr-pid']?.[0]),
    type: text(f['wishlist-type']?.[0]),
    title: text(f.title?.[0]),
  };
  if (!off('favourite') && !off('favourite-link')) tools.append(buildFavourite(favouriteCell, wishlist));
  if (tools.querySelector('[data-attr-sku]')) initWishlist(tools);
  // END BLOG WISHLIST
  if (!off('share')) tools.append(buildShare(f.share?.[0], banner));
  if (!tools.children.length) return banner;
  const hero = el('div', 'ap-blogs-hero');
  hero.append(banner, tools);
  return hero;
}
// END BANNER ICONS

function readTags(cell) {
  if (!cell) return [];
  const items = cell.querySelectorAll('li').length ? cell.querySelectorAll('li') : cell.querySelectorAll('p');
  const parts = items.length ? [...items] : [cell];
  return parts.flatMap((part) => {
    const links = [...part.querySelectorAll('a[href]')];
    if (links.length) return links.map((a) => ({ label: text(a), href: a.href }));
    return text(part).split(',').map((label) => ({ label: label.trim() }));
  }).filter((tag) => tag.label);
}

function buildLeft(f) {
  const left = el('div', 'ap-blogs-left');
  const authorTitle = text(f['author-title']?.[0]);
  const authorName = text(f['author-name']?.[0]);
  if (authorTitle && authorName) {
    const author = el('div', 'ap-blogs-author');
    author.append(el('p', 'ap-blogs-author-title', authorTitle), el('p', 'ap-blogs-author-name', authorName));
    left.append(author);
  }
  const tagTitle = text(f['tag-title']?.[0]);
  const tags = readTags(f.tags?.[0]);
  if (tagTitle || tags.length) {
    const nav = el('nav', 'ap-blogs-tags');
    if (tagTitle) {
      const label = el('p', 'ap-blogs-tags-label', tagTitle);
      label.id = `ap-blogs-tags-${instance}`;
      nav.setAttribute('aria-labelledby', label.id);
      nav.append(label);
    } else nav.setAttribute('aria-label', 'Tags');
    const list = el('ul', 'ap-blogs-tags-list');
    tags.forEach(({ label, href }, i) => {
      if (i) list.append(' ');
      const li = el('li');
      const tag = el(href ? 'a' : 'span', 'ap-blogs-tag', label);
      if (href) tag.href = href;
      li.append(tag);
      list.append(li);
    });
    if (tags.length) nav.append(list);
    left.append(nav);
  }
  if (!left.children.length) left.classList.add('ap-blogs-left-empty');
  // Adobe Target injects "Explore related blogs" here
  left.append(el('div', 'ap-blogs-related'));
  return left;
}

function buildConsultation(f) {
  const desktop = f['consultation-image']?.[0]?.querySelector('img');
  const mobile = f['consultation-image-mobile']?.[0]?.querySelector('img') || desktop;
  const copy = text(f['consultation-text']?.[0]);
  const link = f['consultation-cta']?.[0]?.querySelector('a[href]');
  if (!mobile && !copy && !link) return null;
  const wrap = el('div', 'ap-blogs-consult');
  const inner = el('div', 'ap-blogs-consult-inner');
  if (mobile) {
    const main = desktop || mobile;
    const pic = createOptimizedPicture(mobile.src, main.alt, false, [{ width: '750' }]);
    const desktopPic = createOptimizedPicture(main.src, main.alt, false, [{ media: '(min-width: 768px)', width: '1400' }]);
    pic.prepend(...desktopPic.querySelectorAll('source[media]'));
    inner.append(pic);
  } else wrap.classList.add('ap-blogs-consult-no-image');
  const content = el('div', 'ap-blogs-consult-content');
  if (copy) {
    const column = el('div', 'ap-blogs-consult-copy');
    column.append(el('p', 'ap-blogs-consult-text', copy));
    content.append(column);
  }

  // END FIX CONSULT HEADING HOVER
  if (link) {
    const cta = el('a', 'ap-blogs-consult-cta', text(link));
    cta.href = link.href;
    if (link.href) {
      cta.addEventListener('click', () => {
        const title = wrap.closest('.block')?.querySelector('.ap-blogs-consult-text')?.textContent.trim() || '';
        const destinationUrl = link.href;
        pushAdobeCtaClickEvent({
          cta: text(link), title, destinationUrl, event: 'custom_cta_click',
        });
      });
    }
    content.append(cta);
  }
  inner.append(content);
  wrap.append(inner);
  return wrap;
}

function youtubeId(href) {
  try {
    const url = new URL(href);
    if (url.hostname.includes('youtu.be')) return url.pathname.split('/')[1] || '';
    if (url.searchParams.get('v')) return url.searchParams.get('v');
    const match = url.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/);
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

function buildVideo(cells) {
  const link = cells.map((c) => c.querySelector('a[href]')).find(Boolean);
  const id = link ? youtubeId(link.href) : '';
  if (!id) return null;
  const captionCell = cells.find((c) => !c.querySelector('a[href], picture') && text(c));
  const caption = text(captionCell);
  const wrap = el('div', 'ap-blogs-video');
  const frame = el('div', 'ap-blogs-video-frame');
  const button = el('button', 'ap-blogs-video-play');
  button.type = 'button';
  button.setAttribute('aria-label', `Play video${caption ? `: ${caption}` : ''}`);
  // START FIX MOBILE IMAGES:second image in the cell is the mobile thumbnail (live: up to 991px)
  const posterCell = cells.find((c) => c.querySelector('img'));
  const poster = mobilePicture(posterCell, null, 992) || picture(posterCell, false, [{ width: '1400' }]);
  // END FIX MOBILE IMAGES

  if (poster) button.append(poster);
  else {
    const img = el('img');
    img.src = `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
    img.alt = '';
    img.loading = 'lazy';
    button.append(img);
  }
  button.append(el('span', 'ap-blogs-video-icon'));
  button.addEventListener('click', () => {
    const iframe = el('iframe');
    iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(id)}?rel=0&autoplay=1`;
    iframe.title = caption || 'Content from YouTube';
    iframe.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
    frame.replaceChildren(iframe);
    iframe.focus();
    pushAdobeCtaClickEvent({
      event: 'video_playbotton_click',
      title: button.getAttribute('aria-label') || '',
    });
  }, { once: true });
  frame.append(button);
  wrap.append(frame);
  if (caption) wrap.append(el('p', 'ap-blogs-video-caption', caption));
  return wrap;
}

// START FIX BULLET HEADINGS: the live FAQ questions are list items inside the headings
// (<h3><ul><li>Question</li></ul></h3>, a circle bullet); the import keeps them as "- Question"

function bulletHeadings(body) {
  body?.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
    const first = h.firstChild;
    if (first?.nodeType !== Node.TEXT_NODE || !/^\s*[-–•]\s+/.test(first.textContent)) return;
    first.textContent = first.textContent.replace(/^\s*[-–•]\s+/, '');
    h.classList.add('ap-blogs-bullet');
  });
  return body;
}

// END FIX BULLET HEADINGS

function buildArticleRow({ key, cells }) {
  if (key === 'video') return buildVideo(cells);
  if (key === 'image') {
    const imgCell = cells.find((c) => c.querySelector('img'));
    const pic = mobilePicture(imgCell, null, 768) || picture(imgCell, false, [{ media: '(min-width: 600px)', width: '1400' }, { width: '750' }]);
    if (!pic) return null;
    const div = el('div', 'ap-blogs-image');
    div.append(pic);
    return div;
  }

  // START FIX BULLET HEADINGS

  if (key === 'text') return bulletHeadings(richText(cells.find(hasContent), 'ap-blogs-text'));
  const imgCell = cells.find((c) => c.querySelector('img'));
  const textCell = cells.find((c) => c !== imgCell && hasContent(c));
  const row = el('div', 'ap-blogs-colour');
  if (imgCell) {
    const col = el('div', 'ap-blogs-colour-img');
    col.append(mobilePicture(imgCell, null, 768, '750') || picture(imgCell, false, [{ width: '750' }]));
    row.append(col);
  }
  const body = richText(textCell, 'ap-blogs-colour-text');
  if (body) row.append(body);
  return row;
}

// START FIX LIVE MOBILE PLACEMENT: like live (clientlib-base blogDetailsItemSwitch, up to 1050px),
// the promo card is moved after the section of the 1st table of contents entry and the form after
// the section of the 2nd entry (32px above and below them); from 1051px both are back in the right
// column. A section = the blog title + intro (h1), an image-with-text text, or a heading of an
// article text with what follows it up to the next heading of the same or a higher level. The
// moved items never go inside the text (they keep their own styles): after the intro, in the row
// of an image-with-text (under its text), or after the article text (split at the next heading).
const MOVE_QUERY = window.matchMedia('(width <= 1050px)');

function placeAfterSection(heading, node) {
  const head = heading.closest('.ap-blogs-head');
  if (head && heading.matches('h1')) {
    (head.querySelector('.ap-blogs-intro') || heading).after(node);
    return;
  }
  const cell = heading.closest('.ap-blogs-colour-text, .ap-blogs-text');
  if (!cell) {
    heading.after(node);
    return;
  }
  if (cell.matches('.ap-blogs-colour-text')) {
    cell.after(node);
    return;
  }
  let top = heading;
  while (top.parentElement !== cell) top = top.parentElement;
  const level = (e) => (/^H[1-6]$/.test(e.tagName) ? Number(e.tagName[1]) : 7);
  const rank = level(top);
  let next = top.nextElementSibling;
  while (next && level(next) > rank) next = next.nextElementSibling;
  if (!next) {
    cell.after(node);
    return;
  }
  // the rest of the text (from the next heading) continues after the moved item
  const rest = el('div', 'ap-blogs-text ap-blogs-text-rest');
  while (next) {
    const following = next.nextElementSibling;
    rest.append(next);
    next = following;
  }
  cell.after(node, rest);
  node.apBlogsSplit = { cell, rest };
}

function placeRightItems(layout, items) {
  const right = layout.querySelector('.ap-blogs-right');
  const apply = () => {
    if (!MOVE_QUERY.matches) {
      // last moved first, so a text split twice is joined back in order
      items.filter((item) => item?.classList.contains('ap-blogs-moved')).reverse().forEach((item) => {
        item.classList.remove('ap-blogs-moved');
        right.prepend(item);
        if (item.apBlogsSplit) {
          const { cell, rest } = item.apBlogsSplit;
          cell.append(...rest.children);
          rest.remove();
          delete item.apBlogsSplit;
        }
      });
      return;
    }
    const targets = [...layout.querySelectorAll('.ap-blogs-toc-list a[href^="#"]')]
      .map((a) => layout.querySelector(`#${CSS.escape(a.getAttribute('href').slice(1))}`))
      .filter(Boolean)
      .slice(0, 3);
    items.forEach((item, i) => {
      if (!item || !targets[i] || item.classList.contains('ap-blogs-moved')) return;
      item.classList.add('ap-blogs-moved');
      placeAfterSection(targets[i], item);
    });
  };
  apply();
  MOVE_QUERY.addEventListener('change', apply);
}

// END FIX LIVE MOBILE PLACEMENT
function scrollToTarget(target) {
  target.scrollIntoView({ behavior: REDUCED_MOTION.matches ? 'auto' : 'smooth', block: 'start' });
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}

// START TOC HEADINGS: optional "TOC Headings" row picks the heading levels listed in the table of
// contents (e.g. "h2" or "h2, h4"; "h1" adds the blog title); without it h2/h3/h4 are listed
// START TOC LABELS: optional "Table Of Contents Labels" row - the text shown in the table of
// contents, one line (list item or paragraph) per entry in order, like live where the entries are
// typed separately from the headings; entries without a line show the heading text
function tocLabels(cell) {
  if (!cell) return [];
  const lines = cell.querySelectorAll('li');
  return [...(lines.length ? lines : cell.querySelectorAll('p'))].map(text);
}

// END TOC LABELS
function buildToc(title, article, levels = 'h2, h3, h4', titleHeading = null, labels = []) {
  const used = new Set();
  const headings = [...article.querySelectorAll(levels)];
  if (titleHeading && levels.includes('h1')) headings.unshift(titleHeading);
  // END TOC HEADINGS
  const items = headings.filter((h) => text(h)).map((h, i) => {
    if (!h.id || used.has(h.id)) {
      const base = toClassName(text(h)) || 'heading';
      let id = base;
      for (let n = 2; document.getElementById(id) || used.has(id); n += 1) id = `${base}-${n}`;
      h.id = id;
    }
    used.add(h.id);
    h.style.scrollMarginTop = `${HEADER_OFFSET}px`;
    // START TOC LABELS
    return { label: labels[i] || text(h), heading: h };
    // END TOC LABELS
  });
  if (!items.length) return null;

  const toc = el('nav', 'ap-blogs-toc');
  const titleEl = el('p', 'ap-blogs-toc-title', title);
  titleEl.id = `ap-blogs-toc-title-${instance}`;
  toc.setAttribute('aria-labelledby', titleEl.id);
  const head = el('div', 'ap-blogs-toc-head');
  const toggle = el('button', 'ap-blogs-toc-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-controls', `ap-blogs-toc-list-${instance}`);
  toggle.setAttribute('aria-describedby', titleEl.id);
  head.append(titleEl, toggle);
  const list = el('ol', 'ap-blogs-toc-list');
  list.id = `ap-blogs-toc-list-${instance}`;
  items.forEach(({ label, heading }) => {
    const li = el('li');
    const a = el('a', '', label);
    a.href = `#${heading.id}`;
    a.addEventListener('click', (event) => {
      event.preventDefault();
      scrollToTarget(heading);
      window.history.pushState(null, '', `#${heading.id}`);
    });
    li.append(a);
    list.append(li);
  });
  const setExpanded = (expanded) => {
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? 'Hide' : 'Show';
    list.hidden = !expanded;
    toc.classList.toggle('ap-blogs-toc-collapsed', !expanded);
  };
  setExpanded(OPEN_ON_LOAD.matches);
  head.addEventListener('click', () => setExpanded(toggle.getAttribute('aria-expanded') !== 'true'));
  toc.append(head, list);
  return toc;
}

function buildLike(f) {
  const title = text(f['like-title']?.[0]);
  const copy = text(f['like-text']?.[0]);
  if (!title && !copy) return null;
  const like = el('div', 'ap-blogs-like');
  const content = el('div', 'ap-blogs-like-content');
  if (title) content.append(el('p', 'ap-blogs-like-title', title));
  if (copy) content.append(el('p', 'ap-blogs-like-text', copy));
  const actions = el('div', 'ap-blogs-like-actions');
  actions.setAttribute('role', 'group');
  actions.setAttribute('aria-label', title || 'Rate this article');
  const key = `blog-like:${window.location.pathname}`;
  let current = '';
  try { current = window.localStorage.getItem(key) || ''; } catch { /* no storage */ }
  const buttons = [['like', 'I like this article'], ['dislike', 'I do not like this article']].map(([value, label]) => {
    const button = el('button', `ap-blogs-like-button ap-blogs-like-${value}`);
    button.type = 'button';
    button.dataset.value = value;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(current === value));
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 43 45');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    THUMB.forEach((d) => {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      svg.append(path);
    });
    button.append(svg);
    actions.append(button);
    return button;
  });
  actions.addEventListener('click', (event) => {
    const button = event.target.closest('.ap-blogs-like-button');
    if (!button) return;

    const type = button.dataset.value;
    current = current === button.dataset.value ? '' : button.dataset.value;

    if (current) {
      pushAdobeCtaClickEvent({
        event: type === 'like' ? 'article_like' : 'article_dislike',
        title: document.querySelector('.ap-blogs-title')?.textContent?.trim() || '',
      });
    }

    try {
      if (current) window.localStorage.setItem(key, current);
      else window.localStorage.removeItem(key);
    } catch { /* the choice lasts for this page view */ }
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === current)));
    like.dispatchEvent(new CustomEvent('blog-like', {
      bubbles: true,
      detail: { value: current || null, path: window.location.pathname },
    }));
  });
  like.append(content, actions);
  return like;
}

function buildPromo(f) {
  const img = f['promo-image']?.[0];
  const eyebrow = text(f['promo-eyebrow']?.[0]);
  const title = text(f['promo-title']?.[0]);
  const link = f['promo-cta']?.[0]?.querySelector('a[href]');
  const pic = picture(img, false, [{ width: '600' }]);
  if (!pic && !eyebrow && !title && !link) return null;
  const promo = el('div', 'ap-blogs-promo');
  if (pic) {
    const media = el('div', 'ap-blogs-promo-image');
    media.append(pic);
    promo.append(media);
  } else promo.classList.add('ap-blogs-promo-no-image');
  const body = el('div', 'ap-blogs-promo-body');
  if (eyebrow) body.append(el('p', 'ap-blogs-promo-eyebrow', eyebrow));
  if (title) body.append(el('p', 'ap-blogs-promo-title', title));
  if (link) {
    const p = el('p', 'ap-blogs-promo-cta-wrapper');
    const cta = el('a', 'ap-blogs-promo-cta', text(link));
    cta.href = link.href;
    cta.addEventListener('click', () => {
      pushAdobeCtaClickEvent({
        event: 'cta_link_text',
        cta: cta.textContent.trim(),
        destinationUrl: cta.href,
        parentTitle: title,
      });
    });
    p.append(cta);
    body.append(p);
  }
  promo.append(body);
  return promo;
}

/** Validates one input; returns true when valid and shows / clears its message. */
function validate(input) {
  const field = input.closest('.ap-blogs-field');
  const error = field.querySelector('.ap-blogs-field-error');
  const value = input.value.trim();
  const def = FORM_FIELDS.find((d) => d.name === input.name);
  let message = '';
  if (input.required && !value) message = REQUIRED_MESSAGE;
  else if (value && def?.pattern && !def.pattern.test(value)) ({ message } = def);
  input.setAttribute('aria-invalid', String(!!message));
  error.textContent = message;
  error.hidden = !message;
  field.classList.toggle('ap-blogs-field-invalid', !!message);
  return !message;
}

// START FIX FORM FRAGMENT: optional "Form Fragment" row = a link to a DA page (fragment) holding
// any form block (e.g. an existing stg form). It is shown in the right column (sticky on desktop)
// in place of the built-in enquiry form, even when the built-in Form rows are also there.
// START FIX FORM FRAGMENT FALLBACK: when the fragment page cannot be loaded (e.g. the link points
// to a page that does not exist on this site), the built-in form is shown instead, if configured
function buildFormFragment(f, fallback = () => null) {
  const cell = f['form-fragment']?.[0];
  if (!cell) return null;
  const holder = el('div', 'ap-blogs-form-fragment');
  const useFallback = () => {
    const builtIn = fallback();
    if (builtIn && holder.parentNode) holder.replaceWith(builtIn);
    else holder.remove();
  };

  // END FIX FORM FRAGMENT FALLBACK
  // a /fragments/ link may already have been replaced by its content (auto-blocking in
  // scripts.js): then use that content as it is
  const link = cell.querySelector('a[href]');
  if (!link && cell.querySelector('.section, .block, form')) {
    holder.append(...cell.childNodes);
    return holder;
  }
  const raw = link?.getAttribute('href') || text(cell);
  if (!raw) return null;
  const path = new URL(raw, window.location.href).pathname.replace(/(\.plain)?\.html$/, '');
  import('../fragment/fragment.js')
    .then(({ loadFragment }) => loadFragment(path))
    .then((fragment) => {
      if (fragment?.children.length) holder.append(...fragment.childNodes);
      // START FIX FORM FRAGMENT FALLBACK
      else useFallback();
    })
    .catch(useFallback);
  return holder;
}

// END FIX FORM FRAGMENT
// START FIX STG LEAD SUBMIT: like the stg form / lead-form / form-banner blocks, the built-in form
// submits through the site's scripts/form-submit-common.js (lead saved to the DB, then pushed to
// Salesforce, AES encrypted; fields prefilled from the CCFormFields cookie). Our inputs are passed
// as selectors, so their ids stay as they are. Where that script is not there (e.g. this POC) the
// form keeps its own behaviour (Form Submit URL, or the success message).
const LEAD_SELECTORS = {
  name: '[name="name"]',
  email: '[name="email"]',
  mobile: '[name="mobile"]',
  pincode: '[name="pincode"]',
  whatsappConsent: '[name="whatsapp"]',
};
let leadApi;
const loadLeadApi = () => {
  // the script is part of the stg code base (eds/scripts), not of this POC repository
  // eslint-disable-next-line import/no-unresolved
  leadApi = leadApi || import('../../scripts/form-submit-common.js').catch(() => null);
  return leadApi;
};

// END FIX STG LEAD SUBMIT
// START FIX THANK YOU SCREEN: result screens like live (blog ccforms) and the stg form block, shown
// in place of the form in its card. Success: the thank-you video with "Explore now" and "Yes, I'm
// interested" over its drawn buttons; "interested" sends the lead again with the interested
// campaign and shows the second thank-you image. Error: "Try again!" and the "Are you looking for
// home interiors?" panel. Optional rows override the live defaults (Form Thank You Video, Form
// Thank You Video Desktop, Form Thank You Image, Form Thank You Image Desktop, Form Thank You
// Link, Form Thank You CTA Label, Form Interested Campaign ID, Form
// Error Image, Form Error Link, Form Error Download). Like the stg form, a desktop video / image
// (when authored) is used from 992px, with the stg desktop positions of the clickable areas.
// START FIX DOMAINS FROM ENVIRONMENT: the live defaults are built from the site's domains
// (scripts/environment.js: STATIC_DOMAIN, PROD_DOMAIN) instead of fixed URLs
const TY_ASSETS = `https://${STATIC_DOMAIN}/content/dam/asian_paints/forms/thank-you-gif/`;
const RESULT_DEFAULTS = {
  video: `${TY_ASSETS}Thank-you-pop-up-mobile-without-x.webm`,
  image: `${TY_ASSETS}Thankyou-success-image-mobile.webp`,
  link: `https://${PROD_DOMAIN}/services/interior-design-solutions.html`,
  ctaLabel: 'Explore now',
  interestedCampaign: 'DECOR_ORGANIC_AP.com',
  errorImage: `https://${STATIC_DOMAIN}/content/dam/apcolourcatalogue/asset/ap-revamp/ccformsthankyou/SPSFormSuccessMweb.webp`,
  errorLink: `https://${PROD_DOMAIN}/services/beautiful-homes-service.html`,
  errorDownload: `https://${STATIC_DOMAIN}/content/dam/asian_paints/restricted/the-colour-book-asian-paints.pdf`,
};
const DESKTOP = window.matchMedia('(width >= 992px)');

const cellUrl = (cell) => cell?.querySelector('a[href]')?.getAttribute('href')
  || cell?.querySelector('img')?.getAttribute('src') || text(cell);

function buildResultScreens(f, card, { onClose, onInterested, formName }) {
  const opt = (key, fallback) => cellUrl(f[key]?.[0]) || fallback;
  const conf = {
    video: opt('form-thank-you-video', RESULT_DEFAULTS.video),
    videoDesktop: opt('form-thank-you-video-desktop', ''),
    image: opt('form-thank-you-image', RESULT_DEFAULTS.image),
    imageDesktop: opt('form-thank-you-image-desktop', ''),
    link: opt('form-thank-you-link', RESULT_DEFAULTS.link),
    ctaLabel: text(f['form-thank-you-cta-label']?.[0]) || RESULT_DEFAULTS.ctaLabel,
    errorImage: opt('form-error-image', RESULT_DEFAULTS.errorImage),
    errorLink: opt('form-error-link', RESULT_DEFAULTS.errorLink),
    errorDownload: opt('form-error-download', RESULT_DEFAULTS.errorDownload),
  };
  const screen = el('div', 'ap-blogs-form-result');
  screen.hidden = true;
  screen.tabIndex = -1;
  screen.setAttribute('aria-live', 'polite');
  const close = el('button', 'ap-blogs-result-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  const body = el('div', 'ap-blogs-result-body');
  screen.append(close, body);
  card.append(screen);
  let current = '';

  const open = (type, nodes, desktop = false) => {
    current = type;
    body.replaceChildren(...nodes);
    screen.className = `ap-blogs-form-result ap-blogs-result-${type}${desktop ? ' ap-blogs-result-desktop' : ''}`;
    screen.hidden = false;
    card.classList.add('ap-blogs-form-done');
    screen.focus({ preventScroll: true });
  };
  close.addEventListener('click', () => {
    body.querySelector('video')?.pause();
    body.replaceChildren();
    screen.hidden = true;
    card.classList.remove('ap-blogs-form-done');
    onClose?.(current);
    card.querySelector('.ap-blogs-input')?.focus();
  });
  const explore = () => {
    const a = el('a', 'ap-blogs-result-explore', conf.ctaLabel);

    a.href = conf.link;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', conf.ctaLabel);

    a.addEventListener('click', () => {
      pushAdobeCtaClickEvent({
        event: 'custom_cta_click',
        cta: conf.ctaLabel,
        parentTitle: formName,
        destinationUrl: conf.link,
      });
    });

    return a;
  };
  const hiddenText = (message) => {
    const p = el('div', 'ap-blogs-result-message');
    if (message) p.append(...message.cloneNode(true).childNodes);
    return p;
  };

  return {
    success(message) {
      const desktop = DESKTOP.matches && !!conf.videoDesktop;
      const video = document.createElement('video');
      video.className = 'ap-blogs-result-media';
      video.muted = true;
      video.autoplay = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('aria-hidden', 'true');
      video.src = desktop ? conf.videoDesktop : conf.video;
      video.addEventListener('ended', () => video.pause());
      const interested = el('button', 'ap-blogs-result-interested', 'Yes, I\'m interested');
      interested.type = 'button';
      interested.addEventListener('click', () => {
        pushAdobeFormEvents({
          event: 'Form_thank_you_pop_up',
          formName,
        });

        onInterested?.();
        const desktopImage = DESKTOP.matches && !!conf.imageDesktop;
        const img = el('img', 'ap-blogs-result-media');
        img.src = desktopImage ? conf.imageDesktop : conf.image;
        img.alt = 'Our team will reach out soon! Your response has been recorded.';
        open('success ap-blogs-result-interested-done', [img, explore()], desktopImage);
      });
      open('success', [video, explore(), interested, hiddenText(message)], desktop);
      video.play?.()?.catch?.(() => {});
    },
    error(message) {
      const copy = el('div', 'ap-blogs-result-copy');
      const msg = text(message) || 'Try again! Oops! Something went wrong. We couldn\'t process your request. Please try again?';
      const [, heading, rest] = msg.match(/^([^.!?]*!)\s*(.*)$/) || [null, '', msg];
      if (heading) copy.append(el('h3', 'ap-blogs-result-title', heading));
      if (rest) copy.append(el('p', 'ap-blogs-result-text', rest));
      const panel = el('div', 'ap-blogs-result-panel');
      panel.style.setProperty('--ap-blogs-result-image', `url("${conf.errorImage}")`);
      const panelTitle = 'Are you looking for home interiors?';
      const cta = el('a', 'ap-blogs-result-cta', 'Get FREE Design Consultation');
      cta.href = conf.errorLink;
      cta.target = '_self';

      cta.addEventListener('click', () => {
        pushAdobeCtaClickEvent({
          event: 'custom_cta_click',
          cta: cta.textContent.trim(),
          parentTitle: panelTitle,
          destinationUrl: conf.errorLink,
        });
      });

      // like the stg form: a download link (no new tab)
      const download = el('a', 'ap-blogs-result-download', 'Download the asianpaints colour books');
      download.href = conf.errorDownload;
      download.setAttribute('download', '');
      download.addEventListener('click', () => {
        const pdfName = conf.errorDownload
          .split('/')
          .pop()
          .replace(/\.[^.]+$/, '');
        pushAdobeCtaClickEvent({
          event: 'download_form_pdf',
          cta: download.textContent.trim(),
          destinationUrl: conf.errorDownload,
          title: pdfName,
        });
      });
      panel.append(
        el('p', 'ap-blogs-result-panel-title', panelTitle),
        el('p', 'ap-blogs-result-panel-text', 'Get expert execution for your dream home from Beautiful Homes Interior Design service by asian paints.'),
        cta,
        download,
      );
      open('error', [copy, panel]);
    },
  };
}

// END FIX THANK YOU SCREEN

function buildForm(f, block) {
  const present = FORM_FIELDS.filter((d) => f[d.key]);
  const whatsapp = f['form-whatsapp'];
  if (!present.length && !whatsapp) return null;
  const card = el('div', 'ap-blogs-form-card');
  const title = text(f['form-title']?.[0]);
  const intro = text(f['form-text']?.[0]);

  const formName = title || 'Blog Form';
  let formStarted = false;

  if (title) card.append(el('h2', 'ap-blogs-form-title', title));
  if (intro) card.append(el('p', 'ap-blogs-form-text', intro));

  const form = el('form', 'ap-blogs-form');
  form.noValidate = true;
  const fields = el('div', 'ap-blogs-fields');
  present.forEach((def) => {
    const id = `ap-blogs-${instance}-${def.name}`;
    const wrapper = el('div', `ap-blogs-field ap-blogs-field-${def.name}`);
    const label = el('label', 'ap-blogs-field-label', def.label);
    label.htmlFor = id;
    const input = el('input', 'ap-blogs-input');
    Object.assign(input, {
      id, name: def.name, type: def.type, required: true, autocomplete: def.autocomplete,
    });
    input.placeholder = text(f[def.key][0]) || def.label;
    // START FIX FIELD VALIDATION
    if (def.htmlPattern) input.pattern = def.htmlPattern;
    // END FIX FIELD VALIDATION
    if (def.max) {
      input.inputMode = 'numeric';
      input.maxLength = def.max;
    }
    const error = el('p', 'ap-blogs-field-error');
    error.id = `${id}-error`;
    error.hidden = true;
    input.setAttribute('aria-describedby', error.id);
    wrapper.append(label, input, error);
    fields.append(wrapper);
  });
  if (whatsapp) {
    const id = `ap-blogs-${instance}-whatsapp`;
    const wrapper = el('div', 'ap-blogs-field ap-blogs-field-checkbox');
    const input = el('input', 'ap-blogs-input');
    Object.assign(input, {
      id, name: 'whatsapp', type: 'checkbox', value: 'yes',
    });
    input.defaultChecked = /^(checked|yes|true)$/i.test(text(whatsapp[1]));
    input.checked = input.defaultChecked;
    const label = el('label', 'ap-blogs-field-label', text(whatsapp[0]) || 'Get updates on WhatsApp');
    label.htmlFor = id;
    wrapper.append(input, label);
    fields.append(wrapper);
  }
  form.append(fields);
  const consent = richText(f['form-consent']?.[0], 'ap-blogs-consent');
  if (consent) form.append(consent);
  consent?.querySelectorAll('a[href]').forEach((a) => {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

    a.addEventListener('click', () => {
      pushAdobeCtaClickEvent({
        event: 'cta_link_text',
        cta: a.textContent.trim(),
        parentTitle: formName,
        destinationUrl: a.href,
      });
    });
  });
  const submit = el('button', 'ap-blogs-submit', text(f['form-button']?.[0]) || 'Enquire now');
  submit.type = 'submit';
  const status = el('div', 'ap-blogs-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  form.append(submit, status);

  const messages = {
    thanks: richText(f['form-thank-you']?.[0]) || el('p', '', 'Thank you! We will get in touch with you shortly.'),
    error: richText(f['form-error']?.[0]) || el('p', '', 'Something went wrong. Please try again.'),
  };

  // START FIX THANK YOU SCREEN: like live, the result screen replaces the form in its card; closing
  // the success screen clears the form, closing the error screen keeps the values for a retry
  let interestedLead = null;
  const screens = buildResultScreens(f, card, {
    formName,
    onClose: (type) => {
      if (type.startsWith('success')) form.reset();
      interestedLead = null;
    },
    onInterested: () => interestedLead?.(),
  });
  const show = (type) => {
    status.hidden = true;
    if (type === 'error') screens.error(messages.error);
    else screens.success(messages.thanks);
  };

  // END FIX THANK YOU SCREEN
  const actionCell = f['form-action']?.[0];
  const action = actionCell?.querySelector('a[href]')?.href || text(actionCell);
  // START FIX STG LEAD SUBMIT: prefill from the CCFormFields cookie (like the stg forms) and the
  // optional campaign id sent with the lead
  // the page's form-configs block (row "campaign_id" and row "node"), read when needed so it is
  // found whatever the section order; rows are matched by label, else by position like form.js
  // nearest config first (this section, earlier sections, later sections, then anywhere, e.g. a
  // header / footer fragment); the first non-empty value wins
  const formConfigs = () => {
    const all = [...document.querySelectorAll('.form-config, .form-configs')];
    const section = block.closest('.section');
    const rank = (config) => {
      const own = config.closest('.section');
      if (!section || !own) return 3;
      if (own === section) return 0;
      // eslint-disable-next-line no-bitwise
      return own.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : 2;
    };
    return all.map((config, i) => ({ config, i, r: rank(config) }))
      .sort((a, b) => a.r - b.r || (a.r === 1 ? b.i - a.i : a.i - b.i))
      .map(({ config }) => config);
  };
  const cellValue = (row) => {
    const cells = row ? [...row.children] : [];
    return text(cells.length > 1 ? cells[1] : cells[0]);
  };
  const formConfig = (key, index) => {
    const configs = formConfigs();
    const byLabel = configs.flatMap((c) => [...c.children])
      .filter((r) => toClassName(text(r.children[0])) === toClassName(key))
      .map(cellValue).find(Boolean);
    return byLabel || configs.map((c) => cellValue(c.children[index])).find(Boolean) || '';
  };
  const getCampaignId = () => formConfig('campaign_id', 0) || text(f['form-campaign-id']?.[0]);
  const getResourcePath = () => formConfig('node', 1) || text(f['form-node']?.[0])
    || window.location.pathname;
  // read on first use (form start / submit), not at decoration: the form-configs block may not be
  // in the page yet when this block is decorated
  let campaignId = '';
  // START FIX THANK YOU SCREEN: campaign of the "Yes, I'm interested" lead (live / stg default)
  const interestedCampaignId = text(f['form-interested-campaign-id']?.[0])
    || RESULT_DEFAULTS.interestedCampaign;
  // END FIX THANK YOU SCREEN
  // optional Form Node: the lead's "node" (like the stg form-configs node row, or the AEM path of
  // the live ccforms component); without it the page path is sent, like the stg form

  const trackFormSubmission = () => {
    const whatsappOptIn = form.querySelector('[name="whatsapp"]')?.checked;

    pushAdobeFormEvents({
      formCampaignId: campaignId,
      formName,
      event: 'form_submit',
      whatsappOptIn: whatsappOptIn ? 'checked' : 'unchecked',
      language: 'en',
    });
  };

  if (!action) loadLeadApi().then((api) => api?.checkCookieValues?.(form, LEAD_SELECTORS));
  // END FIX STG LEAD SUBMIT

  form.addEventListener('click', () => {
    if (!formStarted) {
      formStarted = true;
      campaignId = getCampaignId();

      pushAdobeFormEvents({
        formCampaignId: campaignId,
        formName,
        event: 'form_start',
      });
    }
  });

  form.addEventListener('focusin', ({ target }) => {
    if (!formStarted && target.matches('.ap-blogs-input')) {
      formStarted = true;
      campaignId = getCampaignId();

      pushAdobeFormEvents({
        formCampaignId: campaignId,
        formName,
        event: 'form_start',
      });
    }
  });

  form.addEventListener('input', ({ target }) => {
    if (target.inputMode === 'numeric') target.value = target.value.replace(/\D/g, '');
    // START FIX FIELD VALIDATION: letters and spaces only in the name
    const rule = FIELD_RULES[target.name];
    const cleaned = rule?.strip ? target.value.replace(rule.strip, '') : target.value;
    if (cleaned !== target.value) target.value = cleaned;
    // END FIX FIELD VALIDATION
    if (target.getAttribute('aria-invalid') === 'true') validate(target);
  });
  form.addEventListener('focusout', ({ target }) => {
    // START FIX FIELD VALIDATION: like the stg form, every field is checked when it is left
    // (an empty field shows "Field is required")
    if (target.matches('.ap-blogs-input:not([type="checkbox"])')) validate(target);
    // END FIX FIELD VALIDATION
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const inputs = [...form.querySelectorAll('.ap-blogs-input:not([type="checkbox"])')];
    const invalid = inputs.filter((input) => !validate(input));
    if (invalid.length) {
      campaignId = getCampaignId();
      const failedFields = invalid.map((input) => input.name);

      trackFormError({
        campaignId,
        formName,
        formError: failedFields,
      });

      invalid[0].focus();
      return;
    }
    const values = {};
    form.querySelectorAll('.ap-blogs-input').forEach((input) => {
      values[input.name] = input.type === 'checkbox' ? input.checked : input.value.trim();
    });
    block.dispatchEvent(new CustomEvent('form-submit', { bubbles: true, detail: { values, action: action || null } }));
    if (!action) {
      // START FIX STG LEAD SUBMIT: the site lead API (stg), same call and options as the stg form
      const api = await loadLeadApi();
      if (api?.submitLeadFromForm) {
        submit.disabled = true;
        campaignId = getCampaignId();
        const resourcePath = getResourcePath();
        try {
          await api.submitLeadFromForm(form, {
            resourcePath,
            campaignId,
            selectors: LEAD_SELECTORS,
          });
          api.setFormFieldsToCookie?.(form, LEAD_SELECTORS);
          // START FIX THANK YOU SCREEN: the fields stay filled for the "interested" lead (like the
          // stg form); the form is cleared when the thank-you screen is closed
          interestedLead = () => api.submitLeadFromForm(form, {
            resourcePath,
            campaignId: interestedCampaignId,
            selectors: LEAD_SELECTORS,
          }).catch(() => {});
          trackFormSubmission();
          show('thanks');
          // END FIX THANK YOU SCREEN
        } catch {
          show('error');
        } finally {
          submit.disabled = false;
        }
        return;
      }
      // END FIX STG LEAD SUBMIT
      form.reset();
      trackFormSubmission();
      show('thanks');
      return;
    }
    submit.disabled = true;
    try {
      const response = await fetch(action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: values }),
      });
      if (!response.ok) throw new Error(response.status);
      form.reset();
      trackFormSubmission();
      show('thanks');
    } catch {
      show('error');
    } finally {
      submit.disabled = false;
    }
  });
  card.append(form);
  return card;
}

function buildArrow(direction) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 25 13');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('ap-blogs-next-arrow');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', direction === 'next' ? 'M.5 6.5h24m-6-6 6 6-6 6' : 'M24.5 6.5H.5m6-6-6 6 6 6');
  svg.append(path);
  return svg;
}

function buildNextRow(f, current) {
  const items = ['previous', 'next'].map((direction) => {
    const cells = f[`${direction}-article`];
    const link = cells?.[0]?.querySelector('a[href]') || cells?.[1]?.querySelector('a[href]');
    if (!link) return null;
    const meta = text(cells.find((c) => !c.contains(link) && text(c)));
    return {
      direction, title: text(link), href: link.href, meta,
    };
  }).filter(Boolean);
  if (!items.length) return null;

  const nav = el('nav', `ap-blogs-next ap-blogs-next-${items.length > 1 ? 'both' : 'single'}`);
  nav.setAttribute('aria-label', 'More articles');
  const currentEl = current ? el('p', 'ap-blogs-next-current', current) : null;
  items.forEach(({
    direction, title, href, meta,
  }) => {
    if (direction === 'next' && currentEl) nav.append(currentEl);
    const a = el('a', `ap-blogs-next-item ap-blogs-next-${direction}`);
    a.href = href;

    a.addEventListener('click', () => {
      pushAdobeCtaClickEvent({
        event: 'prev_click',
        title,
        destinationUrl: href,
      });
    });

    a.setAttribute('aria-label', `${direction === 'next' ? 'Next' : 'Previous'} article: ${title}`);
    const body = el('span', 'ap-blogs-next-text');
    body.append(el('span', 'ap-blogs-next-title', title));
    if (meta) {
      // 'Author | 29 SEP 2025': bold author, then the separator and the date (like live)
      const metaEl = el('span', 'ap-blogs-next-meta');
      const sep = meta.lastIndexOf('|');
      const author = sep > -1 ? meta.slice(0, sep).trim() : '';
      const date = el('span', 'ap-blogs-next-date', (sep > -1 ? meta.slice(sep + 1) : meta).trim());
      if (author) {
        metaEl.append(el('span', 'ap-blogs-next-author', author), ' ');
        const bar = el('span', '', '| ');
        bar.setAttribute('aria-hidden', 'true');
        date.prepend(bar);
      }
      metaEl.append(date);
      body.append(metaEl);
    }
    a.append(buildArrow(direction), body);
    nav.append(a);
  });
  if (currentEl && !currentEl.parentNode) nav.append(currentEl);
  return nav;
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  instance += 1;
  // undo the global button decoration on the authored links
  block.querySelectorAll('a.button').forEach((a) => a.classList.remove('button', 'primary', 'secondary', 'accent'));
  block.querySelectorAll('p.button-wrapper, p.button-container').forEach((p) => p.removeAttribute('class'));

  const { fields: f, article: rows } = readRows(block);

  const layout = el('div', 'ap-blogs-layout');
  const left = buildLeft(f);
  const main = el('div', 'ap-blogs-main');
  const right = el('div', 'ap-blogs-right');
  layout.append(left, main, right);

  // main, top part (fixed order)
  const head = el('div', 'ap-blogs-head');
  const title = text(f.title?.[0]);
  if (title) head.append(el('h1', 'ap-blogs-title', title));
  const intro = richText(f.intro?.[0], 'ap-blogs-intro');
  if (intro) head.append(intro);
  const introPic = mobilePicture(f['intro-image']?.[0], f['intro-image-mobile']?.[0], 768)
    || picture(f['intro-image']?.[0], false, [{ media: '(min-width: 600px)', width: '1400' }, { width: '750' }]);
  // END FIX MOBILE IMAGES

  if (introPic) {
    const div = el('div', 'ap-blogs-intro-image');
    div.append(introPic);
    head.append(div);
  }

  const article = el('div', 'ap-blogs-article');
  rows.forEach((row) => {
    const node = buildArticleRow(row);
    if (node) article.append(node);
  });
  const tocTitle = text(f['toc-title']?.[0]);
  // START TOC HEADINGS: e.g. "h2, h4" ("TOC Levels" works too)
  const tocLevels = [...new Set(text((f['toc-headings'] || f['toc-levels'])?.[0]).toLowerCase().match(/h[1-6]/g) || [])].join(', ');
  // START TOC LABELS (5th argument: the "Table Of Contents Labels" row)
  const toc = tocTitle ? buildToc(tocTitle, article, tocLevels || undefined, head.querySelector('h1'), tocLabels(f['toc-labels']?.[0])) : null;
  // END TOC LABELS

  // END TOC HEADINGS
  if (toc) head.append(toc);
  const consultation = buildConsultation(f);
  if (consultation) head.append(consultation);
  const like = buildLike(f);
  if (like) article.append(like);
  if (head.children.length) main.append(head);
  if (article.children.length) main.append(article);

  const promo = buildPromo(f);
  if (promo) right.append(promo);
  // START FIX FORM FRAGMENT: a configured Form Fragment wins (it brings its own form code and
  // configuration); the built-in form is used only when there is no Form Fragment; both optional
  // START FIX BUILT-IN FORM FIRST: when both are configured the built-in form is used; the Form
  // Fragment is shown (and loaded) only when there are no built-in Form rows
  const form = buildForm(f, block) || buildFormFragment(f);
  // END FIX BUILT-IN FORM FIRST
  // END FIX FORM FRAGMENT
  if (form) right.append(form);

  placeRightItems(layout, [promo, form]);

  // START FIX LIVE SPACING: optional rows for the spacing the live authors add with empty lines
  // (empty paragraphs do not survive Document Authoring): "Intro Spacing: yes" = an empty line
  // above and below the intro text (live 5-wall-colours page); "Image With Text Spacing: none" =
  // no empty line after the image-with-text texts (live wooden-door page; default: one line)
  const yes = (key) => /^(yes|true|on|1)$/i.test(text(f[key]?.[0]));
  const no = (key) => /^(none|no|false|off|0)$/i.test(text(f[key]?.[0]));
  block.classList.toggle('ap-blogs-intro-spaced', yes('intro-spacing'));
  block.classList.toggle('ap-blogs-colour-tight', no('image-with-text-spacing'));
  const children = [buildHero(f, buildBanner(f)), layout, buildNextRow(f, title)].filter(Boolean);
  const categories = text(f.categories?.[0]);
  if (categories) block.dataset.attrBlogcategories = categories;
  block.replaceChildren(...children);
}
