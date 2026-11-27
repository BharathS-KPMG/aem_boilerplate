import { toClassName } from '../../scripts/aem.js';
import { pushAdobeSingleEvent, pushAdobeProductTitleClick } from '../../scripts/analytics_1.js';

/**
 * Share block: the round share button of the live Asian Paints pages (sharetool) with its menu of
 * share links (Facebook, Whatsapp on mobile, Twitter, Pinterest, Mail, SMS). Works on any page
 * and on its own: every row is optional, an empty block shares the current page.
 * Rows (label | value): Share Options, Share Title, Share Description, Share Link, Share Image,
 * Button Label, Attach To, Share What, Position. Variants: (left), (center), (right is the
 * default). See README.md.
 * With "Attach To" the button sits on an image or a block above it (no change to that block):
 * "image" = the nearest image above, "previous" = the content / block just above, or a block name
 * (e.g. "cards") = the nearest block of that name above (attached once that block is loaded).
 */

const CHANNELS = {
  facebook: { label: 'Facebook', url: ({ url }) => `https://www.facebook.com/sharer/sharer.php?u=${url}` },
  whatsapp: { label: 'Whatsapp', url: ({ url, title }) => `https://api.whatsapp.com/send?text=${title}%20${url}`, mobileOnly: true },
  twitter: { label: 'Twitter', url: ({ url, text }) => `https://twitter.com/share?url=${url}&text=${text}` },
  pinterest: { label: 'Pinterest', url: ({ url, text, media }) => `https://www.pinterest.com/pin/create/button/?url=${url}&media=${media}&description=${text}` },
  mail: { label: 'Mail', url: ({ url, title, description }) => `mailto:?subject=${title}&body=${description}%20${url}` },
  sms: { label: 'SMS', url: ({ url, title }) => `sms:?&body=${title}%20${url}` },
};

// author-friendly labels -> field
const FIELDS = {
  'share-options': 'channels',
  channels: 'channels',
  share: 'channels',
  'share-title': 'title',
  title: 'title',
  'share-description': 'description',
  description: 'description',
  'share-link': 'link',
  link: 'link',
  url: 'link',
  'share-image': 'image',
  image: 'image',
  'button-label': 'label',
  label: 'label',
  'attach-to': 'attach',
  attach: 'attach',
  'share-what': 'what',
  what: 'what',
  position: 'position',
};
const POSITIONS = ['top-right', 'top-left', 'bottom-right', 'bottom-left'];

let instance = 0;

const text = (cell) => (cell?.textContent || '').replace(/\s+/g, ' ').trim();

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

function readFields(block) {
  const fields = {};
  [...block.children].forEach((row) => {
    const [keyCell, valueCell] = row.children;
    const key = FIELDS[toClassName(text(keyCell))];
    if (key && valueCell && !fields[key]) fields[key] = valueCell;
  });
  return fields;
}

/** true when `node` comes before `ref` in the page (and is not inside it) */
const before = (node, ref) => {
  if (ref.contains(node)) return false;
  const range = document.createRange();
  range.setStartBefore(ref);
  return range.comparePoint(node, 0) < 0;
};

/**
 * The element the button is attached to (above the block): "image" = the nearest picture
 * (its section first, then the page), "previous" = the element just above, a block name = the
 * nearest block of that name (the block element; attached once it is loaded).
 */
function findTarget(block, attach) {
  const anchor = block.closest('.share-wrapper') || block;
  const want = toClassName(attach);
  if (want === 'previous' || want === 'previous-block') {
    let prev = anchor.previousElementSibling;
    if (!prev) prev = anchor.closest('.section')?.previousElementSibling?.lastElementChild;
    // a block wrapper: the block itself (its own corner, without the wrapper padding)
    return prev?.querySelector(':scope > .block') || prev || null;
  }
  if (want === 'image' || want === 'picture') {
    const pick = (root) => [...root.querySelectorAll('picture')].filter((p) => before(p, anchor)).pop();
    const pic = pick(anchor.closest('.section') || document) || pick(document);
    if (!pic) return null;
    // a frame around the image (or its link) so the button sits on the image's own corner
    const host = pic.closest('a') || pic;
    if (host.parentElement?.classList.contains('share-frame')) return host.parentElement;
    const frame = el('span', 'share-frame');
    host.before(frame);
    frame.append(host);
    return frame;
  }
  const blocks = [...document.querySelectorAll(`.${CSS.escape(want)}.block`)]
    .filter((b) => b !== block && before(b, anchor));
  return blocks.pop() || null;
}

/** The share details: authored values, then the attached image / block, then the page. */
function shareData(f, target) {
  const meta = (name) => document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.content || '';
  const absolute = (href) => (href ? new URL(href, window.location.href).href : '');
  const canonical = document.querySelector('link[rel="canonical"]')?.href;
  const page = canonical || `${window.location.origin}${window.location.pathname}`;
  const targetImg = target?.querySelector('img');
  const imgSrc = (img) => img && (img.currentSrc || img.src);
  const title = text(f.title) || meta('og:title') || document.title;
  const description = text(f.description) || meta('description') || meta('og:description');
  const media = imgSrc(f.image?.querySelector('img')) || f.image?.querySelector('a[href]')?.href
    || imgSrc(targetImg) || meta('og:image');
  const what = toClassName(text(f.what));
  let link = f.link?.querySelector('a[href]')?.href || text(f.link);
  if (!link && what === 'image') link = imgSrc(targetImg) || media;
  if (!link && what === 'link') link = target?.querySelector('a[href]')?.href;
  const enc = encodeURIComponent;
  return {
    url: enc(absolute(link) || page),
    title: enc(title),
    description: enc(description),
    text: enc([title, description].filter(Boolean).join(' ')),
    media: enc(absolute(media)),
  };
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  instance += 1;
  const f = readFields(block);
  const wanted = text(f.channels).toLowerCase().split(/[\s,|]+/).filter((c) => CHANNELS[c]);
  const channels = wanted.length ? [...new Set(wanted)] : Object.keys(CHANNELS);
  const label = text(f.label) || 'Share';
  const target = text(f.attach) ? findTarget(block, text(f.attach)) : null;

  const wrap = el('div', 'share-wrap');
  const button = el('button', 'share-button');
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', `share-menu-${instance}`);
  const menu = el('ul', 'share-menu');
  menu.id = `share-menu-${instance}`;
  menu.hidden = true;

  channels.forEach((key) => {
    const channel = CHANNELS[key];
    const li = el('li', channel.mobileOnly ? 'share-mobile-only' : '');
    const a = el('a', `share-link share-${key}`, channel.label);
    a.href = '#';
    // built on click, so the final page title / URL / image are used
    a.addEventListener('click', (event) => {
      const href = channel.url(shareData(f, target));

      const heart = document.querySelector('[data-attr-sku][data-attr-title]');
      const productName = heart?.dataset.attrTitle || '';
      const productSku = heart?.dataset.attrSku || '';

      pushAdobeProductTitleClick({
        event: 'share_click',
        shareType: channel.label,
        productName,
        productSku,
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
  button.addEventListener('click', (event) => {
    // an attached button sits on an image or block that may be clickable itself
    event.preventDefault();
    event.stopPropagation();
    setOpen(menu.hidden);
    pushAdobeSingleEvent('share_product');
  });
  wrap.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) {
      setOpen(false);
      button.focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (!menu.hidden && !wrap.contains(event.target)) setOpen(false);
  });
  wrap.addEventListener('focusout', (event) => {
    if (!menu.hidden && event.relatedTarget && !wrap.contains(event.relatedTarget)) setOpen(false);
  });
  wrap.append(button, menu);

  if (target) {
    // the button on the image / block (its corner), the block's own place stays empty
    const position = POSITIONS.find((p) => p === toClassName(text(f.position))) || 'top-right';
    wrap.classList.add('share-attached', `share-${position}`);
    // a block still loading rebuilds its content: attach when it is loaded
    const attach = () => {
      target.classList.add('share-target');
      target.append(wrap);
    };
    if (target.matches('.block') && target.dataset.blockStatus !== 'loaded') {
      const observer = new MutationObserver(() => {
        if (target.dataset.blockStatus !== 'loaded') return;
        observer.disconnect();
        attach();
      });
      observer.observe(target, { attributes: true, attributeFilter: ['data-block-status'] });
    } else attach();
    block.replaceChildren();
    block.closest('.share-wrapper')?.classList.add('share-wrapper-attached');
    return;
  }
  block.replaceChildren(wrap);
}
