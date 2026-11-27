/*
 * Popular This Week
 * EDS version of the AEM component "popularthisweek"
 * (com.ap.v2.apcolourcatalogue.core.components.content.popularthisweek.PopularThisWeekComponent):
 * a title, a "view more" link and a list of blog cards (thumbnail, tags, title).
 *
 * Authoring (rows recognised by their first cell, all optional):
 *   | Title           | e.g. POPULAR THIS WEEK                                  |
 *   | View More       | link, e.g. VIEW MORE -> /blogs (opens in a new tab)     |
 *   | View More Text  | text (alternative to the link text)                     |
 *   | View More Link  | link / URL (alternative to the View More link)          |
 *   | <card rows>     | image | tags (one per line or comma separated) | title link |
 * A card row is any other row: the image, the tags and the linked title can also share one cell
 * (the link is the title, the other lines are the tags). Cards without a link are not clickable.
 *
 * START FIX AUTHOR LABELS: author-friendly labels, named like the AEM dialog (preferred):
 *   | Title                      | e.g. POPULAR THIS WEEK                        |
 *   | View More Link Text        | e.g. VIEW MORE                                |
 *   | View More Link Redirection | link / URL (opens in a new tab)               |
 *   | Blog Image                 | picture                                       |
 *   | Blog Tags                  | one tag per line, or comma separated          |
 *   | Blog Title                 | text                                          |
 *   | Blog Link                  | link / URL of the blog page                   |
 * Repeat the four Blog rows for every card: a card starts again when a Blog label repeats.
 * END FIX AUTHOR LABELS
 */
import { createOptimizedPicture, toClassName } from '../../scripts/aem.js';
import { pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';

const FIELDS = ['title', 'view-more', 'view-more-text', 'view-more-link', 'view-more-redirection'];
// START FIX AUTHOR LABELS
FIELDS.push('view-more-link-text', 'view-more-link-redirection');
const CARD_FIELDS = {
  'blog-image': 'image',
  'blog-thumbnail': 'image',
  'blog-tags': 'tags',
  'blog-tag': 'tags',
  'blog-title': 'title',
  'blog-link': 'link',
  'blog-url': 'link',
};
// END FIX AUTHOR LABELS

const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

/** The tags of a card: list items, paragraphs (or lines) and comma separated values. */
function readTags(nodes) {
  return nodes.flatMap((node) => {
    const items = node.querySelectorAll('li').length ? [...node.querySelectorAll('li')] : [node];
    return items.flatMap((item) => text(item).split(','));
  }).map((tag) => tag.trim()).filter(Boolean);
}

/** One card from an authored row: image | tags | linked title (cells may be combined). */
function readCard(cells) {
  const img = cells.map((c) => c.querySelector('img')).find(Boolean);
  const link = cells.map((c) => c.querySelector('a[href]')).find(Boolean);
  const parts = cells.flatMap((cell) => {
    const blocks = [...cell.querySelectorAll(':scope > p, :scope > ul, :scope > ol, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6')];
    return blocks.length ? blocks : [cell];
  }).filter((node) => !node.querySelector('img') && text(node));
  const titleNode = link ? parts.find((node) => node.contains(link)) : parts[parts.length - 1];
  const title = link ? text(link) || text(titleNode) : text(titleNode);
  const tags = readTags(parts.filter((node) => node !== titleNode && !node.querySelector('a[href]')));
  if (!img && !title) return null;
  return {
    img, href: link?.getAttribute('href') || '', title, tags,
  };
}

function buildCard({
  img, href, title, tags,
}) {
  const li = el('li', 'popular-this-week-item');
  const card = el(href ? 'a' : 'div', 'popular-this-week-card');
  if (href) card.href = href;
  if (href) {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.popular-this-week-tag')) {
        return;
      }

      pushAdobeCtaClickEvent({
        event: 'cta_link_text',
        cta: title,
        destinationUrl: href,
        parentTitle: title,
      });
    });
  }
  if (img) {
    const media = el('div', 'popular-this-week-image');
    const pic = createOptimizedPicture(img.src, img.alt || title, false, [{ media: '(min-width: 1025px)', width: '400' }, { width: '750' }]);
    media.append(pic);
    card.append(media);
  }
  const body = el('div', 'popular-this-week-text');
  tags.forEach((tag) => {
    const tagEl = el('p', 'popular-this-week-tag', tag);

    if (href) {
      tagEl.addEventListener('click', () => {
        pushAdobeCtaClickEvent({
          event: 'blog_tag',
          category: tag,
        });
      });
    }

    body.append(tagEl);
  });
  if (title) body.append(el('p', 'popular-this-week-name', title));
  if (body.children.length) card.append(body);
  li.append(card);
  return li;
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const config = {};
  const cards = [];
  // START FIX AUTHOR LABELS: Blog Image / Tags / Title / Link rows, grouped into cards
  const groups = [];
  let group = null;
  // END FIX AUTHOR LABELS
  [...block.children].forEach((row) => {
    const [keyCell, ...cells] = row.children;
    const key = toClassName(text(keyCell));
    if (FIELDS.includes(key) && cells.length) {
      [config[key]] = cells;
    // START FIX AUTHOR LABELS
    } else if (CARD_FIELDS[key]) {
      const field = CARD_FIELDS[key];
      if (!group || group[field]) {
        group = {};
        groups.push(group);
      }
      [group[field]] = cells;
      group.order = group.order ?? cards.length;
    // END FIX AUTHOR LABELS
    } else {
      const card = readCard([...row.children]);
      if (card) cards.push(card);
    }
  });

  // START FIX AUTHOR LABELS: turn each Blog group into a card, kept in the authored order
  groups.reverse().forEach(({
    image, tags, title: titleCell, link, order,
  }) => {
    const img = image?.querySelector('img') || titleCell?.querySelector('img');
    const linkEl = link?.querySelector('a[href]') || titleCell?.querySelector('a[href]');
    const href = linkEl?.getAttribute('href') || text(link);
    const name = text(titleCell) || text(linkEl);
    const tagNodes = tags ? [...tags.querySelectorAll(':scope > p, :scope > ul, :scope > ol')] : [];
    const card = {
      img, href, title: name, tags: tags ? readTags(tagNodes.length ? tagNodes : [tags]) : [],
    };
    if (img || name) cards.splice(order, 0, card);
  });
  // END FIX AUTHOR LABELS

  const head = el('div', 'popular-this-week-head');
  const title = text(config.title);
  if (title) head.append(el('h4', 'popular-this-week-title', title));

  // START FIX AUTHOR LABELS: also read View More Link Text / View More Link Redirection
  const redirection = config['view-more-link-redirection'] || config['view-more-link'] || config['view-more-redirection'];
  const moreLink = [redirection, config['view-more']]
    .map((cell) => cell?.querySelector('a[href]')).find(Boolean);
  const moreHref = moreLink?.getAttribute('href') || text(redirection);
  const moreText = text(config['view-more-link-text']) || text(config['view-more-text'])
    || text(config['view-more']) || text(moreLink);
  // END FIX AUTHOR LABELS
  if (moreHref && moreText) {
    const more = el('a', 'popular-this-week-more', moreText);
    more.href = moreHref;
    more.target = '_blank';
    more.rel = 'noopener';
    more.addEventListener('click', () => {
      pushAdobeCtaClickEvent({
        event: 'cta_link_text',
        cta: more.textContent.trim(),
        destinationUrl: more.href,
        parentTitle: title,
      });
    });
    head.append(more);
  }

  const children = [];
  if (head.children.length) children.push(head);
  if (cards.length) {
    const list = el('ul', 'popular-this-week-list');
    cards.forEach((card) => list.append(buildCard(card)));
    children.push(list);
  }
  block.replaceChildren(...children);
}
