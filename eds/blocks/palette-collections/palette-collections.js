import { createOptimizedPicture } from '../../scripts/aem.js';
import { pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';

/**
 * palette-collections — gradient section title over designer palette
 * collections: name, subtitle, description, download CTA and a 2x2 image
 * collage each.
 *
 * Authoring model (see README in palette-collections.css header): label |
 * value rows, then one row per collection:
 *   Title | Read more after (characters) | Read more label  <- label | value
 *   Name | Subtitle | Description | CTA label | CTA link | Open in new tab
 *   | Images (the four collage images, in order)            <- header + rows
 *
 * As on the source: below 991px the collections become a one-per-view
 * swipeable carousel with dot indicators, and each description is cut to N
 * characters with a "Read More" that expands it. The whole section slides up
 * and fades in once its top is within 450px of the top of the viewport.
 */

const CAROUSEL_MEDIA = '(max-width: 990px)';
const REVEAL_OFFSET = 450;
const FIELDS = {
  title: 'title',
  'read more after (characters)': 'chars',
  'read more after': 'chars',
  'read more label': 'more',
};

const text = (cell) => (cell?.textContent || '').replace(/\s+/g, ' ').trim();

function readModel(block) {
  const model = { items: [] };
  let inItems = false;
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const label = text(cells[0]).toLowerCase();
    if (label === 'name' && text(cells[1]).toLowerCase() === 'subtitle') {
      inItems = true;
      return;
    }
    const key = FIELDS[label];
    if (!inItems && key && cells.length >= 2) {
      [, model[key]] = cells;
      return;
    }
    if (cells.length >= 3 && text(cells[0])) {
      const [name, subtitle, desc, ctaLabel, ctaLink, newTab, images] = cells;
      model.items.push({
        name: text(name),
        subtitle: text(subtitle),
        desc: text(desc),
        ctaLabel: text(ctaLabel),
        ctaLink: ctaLink?.querySelector('a[href]')?.href || text(ctaLink),
        newTab: /^(true|yes|1)$/i.test(text(newTab)),
        images: images ? [...images.querySelectorAll('img')] : [],
      });
    }
  });
  return model;
}

function buildItem(item, uid, index) {
  const el = document.createElement('div');
  el.className = 'palette-collections-item';

  const detail = document.createElement('div');
  detail.className = 'palette-collections-detail';
  // the source splits the name after its first word (white-space: pre-line)
  const [first, ...rest] = item.name.split(' ');
  const name = document.createElement('h3');
  name.className = 'palette-collections-name';
  name.textContent = rest.length ? `${first}\n${rest.join(' ')}` : first;
  detail.append(name);
  if (item.subtitle) {
    const sub = document.createElement('p');
    sub.className = 'palette-collections-subtitle';
    sub.textContent = item.subtitle;
    detail.append(sub);
  }
  const info = document.createElement('div');
  info.className = 'palette-collections-info';
  const desc = document.createElement('p');
  desc.className = 'palette-collections-description';
  desc.id = `${uid}-desc-${index}`;
  desc.textContent = item.desc;
  info.append(desc);
  detail.append(info);

  if (item.ctaLabel && item.ctaLink) {
    const wrap = document.createElement('p');
    wrap.className = 'palette-collections-cta-wrap';
    const a = document.createElement('a');
    a.className = 'palette-collections-cta';
    a.href = item.ctaLink;
    if (item.newTab) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    const label = document.createElement('span');
    label.textContent = item.ctaLabel;
    const icon = document.createElement('span');
    icon.className = 'palette-collections-cta-icon';
    icon.setAttribute('aria-hidden', 'true');
    a.append(label, icon);
    a.addEventListener('click', () => {
      const isPdf = /\.pdf(\?.*)?$/i.test(a.href || '');
      if (isPdf) {
        pushAdobeCtaClickEvent({
          event: 'download_form_pdf',
          title: a.href.split('/').pop(),
        });
      }
    });
    wrap.append(a);
    detail.append(wrap);
  }

  // collage: two columns of two images (source column-0 / column-1)
  const grid = document.createElement('div');
  grid.className = 'palette-collections-images';
  [item.images.slice(0, 2), item.images.slice(2, 4)].forEach((imgs) => {
    const col = document.createElement('div');
    col.className = 'palette-collections-column';
    imgs.forEach((img) => {
      const pic = createOptimizedPicture(img.src, img.alt || '', false, [{ width: '600' }]);
      const out = pic.querySelector('img');
      out.width = 295;
      out.height = 295;
      col.append(pic);
    });
    grid.append(col);
  });

  el.append(detail, grid);
  return { el, desc };
}

/** Below 991px: cut each description to N characters with a "Read More". */
function setupReadMore(entries, chars, label, mq) {
  if (!(chars > 0)) return;
  const render = () => {
    entries.forEach(({ desc, full, state }) => {
      if (!mq.matches || state.open || full.length <= chars) {
        desc.textContent = full;
        return;
      }
      desc.textContent = full.substring(0, chars);
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'palette-collections-more';
      more.textContent = label;
      more.setAttribute('aria-expanded', 'false');
      more.addEventListener('click', () => {
        state.open = true;
        desc.textContent = full;
        desc.setAttribute('tabindex', '-1');
        desc.focus();
      });
      desc.append(more);
    });
  };
  render();
  mq.addEventListener('change', render);
}

/** Dot indicators follow the carousel's scroll position (as slick's dots). */
function setupDots(list, track, items, mq) {
  const dots = document.createElement('div');
  dots.className = 'palette-collections-dots';
  dots.setAttribute('aria-hidden', 'true');
  const spans = items.map(() => document.createElement('span'));
  dots.append(...spans);
  list.append(dots);
  const update = () => {
    const index = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    spans.forEach((s, i) => s.classList.toggle('is-active', i === index));
    // the track is a keyboard-scrollable region only while it is a carousel
    if (mq.matches) {
      track.setAttribute('role', 'region');
      track.tabIndex = 0;
    } else {
      track.removeAttribute('role');
      track.removeAttribute('tabindex');
    }
  };
  update();
  track.addEventListener('scroll', update, { passive: true });
  mq.addEventListener('change', update);
}

/** Section slides up and fades in once its top is within 450px of the viewport top. */
function setupReveal(target) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    target.classList.add('palette-collections-revealed', 'palette-collections-static');
    return;
  }
  target.classList.add('palette-collections-hidden');
  let io;
  const check = () => {
    const rect = target.getBoundingClientRect();
    // sections are hidden (zero size) until they finish loading
    if (!rect.height || rect.top - REVEAL_OFFSET >= 0) return;
    target.classList.add('palette-collections-revealed');
    window.removeEventListener('scroll', check);
    io?.disconnect();
  };
  window.addEventListener('scroll', check, { passive: true });
  // also check once the section is laid out / comes into view without a scroll
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(check);
    io.observe(target);
  }
}

export default function decorate(block) {
  const m = readModel(block);
  const items = m.items.filter((i) => i.name || i.desc);
  const uid = `palette-collections-${Math.random().toString(36).slice(2, 8)}`;
  const mq = window.matchMedia(CAROUSEL_MEDIA);

  const content = [];
  if (text(m.title)) {
    const h2 = document.createElement('h2');
    h2.className = 'palette-collections-heading';
    const span = document.createElement('span');
    span.textContent = text(m.title);
    h2.append(span);
    content.push(h2);
  }

  const list = document.createElement('div');
  list.className = 'palette-collections-list';
  const track = document.createElement('div');
  track.className = 'palette-collections-track';
  track.setAttribute('aria-label', text(m.title) || 'Collections');
  const built = items.map((item, i) => buildItem(item, uid, i));
  track.append(...built.map((b) => b.el));
  list.append(track);
  content.push(list);
  block.replaceChildren(...content);

  if (items.length > 1) setupDots(list, track, items, mq);
  setupReadMore(
    built.map((b, i) => ({ desc: b.desc, full: items[i].desc, state: { open: false } })),
    parseInt(text(m.chars), 10),
    text(m.more) || '... Read More',
    mq,
  );
  setupReveal(block.closest('.palette-collections-wrapper') || block);
}
