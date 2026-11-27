import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * explore-store — "Explore Our Stores": a title and text beside a list of
 * Asian Paints store formats, each with an icon, a name, a description and a
 * coloured rule under it. Source: asianpaints.com/store-locator (whychooseus
 * ".explore-store"). Authoring and behaviour: README.md.
 *
 * Authoring (DA table): label | value rows (Title, Text, New tab note), then a
 * header row
 *   Icon | Name | Description | Accent colour | Link | Open in new tab
 * and one row per store format. Icons are decorative unless the author gives
 * them alt text. A card only becomes a link when its Link cell is filled (the
 * source's cards are anchors without an href, so they do nothing).
 */

const FIELDS = {
  title: 'title',
  text: 'text',
  'new tab note': 'newTabNote',
};

const COLUMNS = {
  icon: 'icon',
  name: 'name',
  description: 'description',
  'accent colour': 'accent',
  'accent color': 'accent',
  link: 'link',
  'open in new tab': 'newTab',
};

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
const yes = (value) => /^(true|yes|1|on)$/i.test(value);
const href = (cell) => cell?.querySelector('a[href]')?.getAttribute('href') || text(cell);

function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== null) node.setAttribute(k, v);
  });
  return node;
}

function readModel(block) {
  const fields = {};
  const cards = [];
  let columns = null;
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const first = text(cells[0]).toLowerCase();
    if (!columns && COLUMNS[first] && cells.length > 2) {
      columns = cells.map((c) => COLUMNS[text(c).toLowerCase()] || '');
      return;
    }
    if (!columns) {
      if (FIELDS[first]) fields[FIELDS[first]] = { row, cell: cells[1] || null };
      return;
    }
    const card = { row };
    columns.forEach((k, i) => { if (k) card[k] = cells[i] || null; });
    if (text(card.name)) cards.push(card);
  });
  return { fields, cards };
}

/** the 36px icon (72px source file), lazy, with its box reserved */
function icon(cell) {
  const img = cell?.querySelector('img');
  if (!img) return null;
  const alt = (img.getAttribute('alt') || '').trim();
  const pic = createOptimizedPicture(img.src, alt, false, [{ width: '72' }]);
  const out = pic.querySelector('img');
  out.width = 36;
  out.height = 36;
  const wrap = el('span', 'explore-store-icon');
  if (!alt) wrap.setAttribute('aria-hidden', 'true');
  wrap.append(pic);
  return wrap;
}

export default async function decorate(block) {
  const { fields, cards } = readModel(block);
  // Universal Editor: carry instrumentation over (a no-op with DA authoring)
  const { moveInstrumentation = () => {} } = await import('../../scripts/scripts.js');
  const value = (key) => text(fields[key]?.cell);
  const newTabNote = value('newTabNote') || '(opens in a new tab)';

  const intro = el('div', 'explore-store-intro');
  if (value('title')) {
    const h2 = el('h2', 'explore-store-title');
    h2.textContent = value('title');
    moveInstrumentation(fields.title.row, h2);
    intro.append(h2);
  }
  if (value('text')) {
    const p = el('p', 'explore-store-text');
    p.textContent = value('text');
    moveInstrumentation(fields.text.row, p);
    intro.append(p);
  }

  const list = el('ul', 'explore-store-list');
  cards.forEach((card) => {
    const li = el('li', 'explore-store-card');
    const accent = text(card.accent);
    if (HEX.test(accent)) li.style.setProperty('--explore-store-accent', accent);
    moveInstrumentation(card.row, li);

    const pic = icon(card.icon);
    if (pic) li.append(pic);

    const name = el('h3', 'explore-store-name');
    const url = href(card.link);
    if (url) {
      // the name is the link; its ::after stretches over the card
      const a = el('a', '', { href: url });
      a.textContent = text(card.name);
      if (yes(text(card.newTab))) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        const note = el('span', 'explore-store-sr-only');
        note.textContent = ` ${newTabNote}`;
        a.append(note);
      }
      name.append(a);
      li.classList.add('has-link');
    } else {
      name.textContent = text(card.name);
    }
    li.append(name);

    if (text(card.description)) {
      const desc = el('p', 'explore-store-desc');
      desc.textContent = text(card.description);
      li.append(desc);
    }
    list.append(li);
  });

  block.replaceChildren(...[intro, list].filter((n) => n.children.length));
}
