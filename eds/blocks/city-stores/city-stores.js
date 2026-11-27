import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  SEARCH_EVENT, DESKTOP, text, href, el, instrumentation,
} from '../../scripts/store-locator.js';
import { pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';

/**
 * city-stores — "Explore stores by cities": a title over a grid of city cards
 * (picture and name; 5 per row from 992px, 2 below). Source:
 * asianpaints.com/store-locator (apCityCarousel "variant-three"). Authoring and
 * behaviour: README.md.
 *
 * Authoring (DA table): label | value rows (Title, New tab note), then a header
 * row
 *   Desktop image | Mobile image | City | Link | Open in new tab
 * and one row per city. A card is a link when its Link cell is filled (the
 * importer writes the source's own search URL, store-locator.html?q=<city>);
 * otherwise it is plain content. Pictures are decorative unless the author
 * gives the image alt text: the city name already names the card.
 */

const FIELDS = {
  title: 'title',
  'new tab note': 'newTabNote',
};

const COLUMNS = {
  'desktop image': 'desktop',
  'mobile image': 'mobile',
  city: 'city',
  name: 'city',
  link: 'link',
  'open in new tab': 'newTab',
};

const yes = (value) => /^(true|yes|1|on)$/i.test(value);
const firstImg = (cell) => cell?.querySelector('img') || null;

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
    if (text(card.city)) cards.push(card);
  });
  return { fields, cards };
}

/** mobile image, with the desktop image as <source>s from 992px; lazy, size reserved */
function picture(mobile, desktop) {
  const base = mobile || desktop;
  if (!base) return null;
  const alt = (base.getAttribute('alt') || desktop?.getAttribute('alt') || '').trim();
  const pic = createOptimizedPicture(base.src, alt, false, [{ width: '750' }]);
  const img = pic.querySelector('img');
  // the source's files are 458 x 420 (desktop) and 312 x 286 (mobile): the same ratio
  img.width = parseInt(base.getAttribute('width'), 10) || 458;
  img.height = parseInt(base.getAttribute('height'), 10) || 420;
  if (desktop && mobile && desktop !== mobile) {
    const desk = createOptimizedPicture(desktop.src, alt, false, [{ width: '750' }]);
    [...desk.querySelectorAll('source')].reverse().forEach((source) => {
      source.setAttribute('media', DESKTOP);
      pic.prepend(source);
    });
  }
  return pic;
}

export default async function decorate(block) {
  const { fields, cards } = readModel(block);
  const moveInstrumentation = await instrumentation();
  const value = (key) => text(fields[key]?.cell);
  const newTabNote = value('newTabNote') || '(opens in a new tab)';

  const nodes = [];
  if (value('title')) {
    const h2 = el('h2', 'city-stores-title');
    h2.textContent = value('title');
    moveInstrumentation(fields.title.row, h2);
    nodes.push(h2);
  }

  const list = el('ul', 'city-stores-list');
  cards.forEach((card) => {
    const li = el('li', 'city-stores-card');
    moveInstrumentation(card.row, li);
    const url = href(card.link);
    const body = url ? el('a', 'city-stores-link', { href: url }) : el('div', 'city-stores-link');

    const pic = picture(firstImg(card.mobile), firstImg(card.desktop));
    if (pic) {
      const media = el('span', 'city-stores-media');
      media.append(pic);
      body.append(media);
    }
    const name = el('span', 'city-stores-name');
    name.textContent = text(card.city);
    body.append(name);

    if (url && yes(text(card.newTab))) {
      body.target = '_blank';
      body.rel = 'noopener noreferrer';
      const note = el('span', 'city-stores-sr-only');
      note.textContent = ` ${newTabNote}`;
      body.append(note);
    }
    if (url) {
      // a store-finder block on this page shows the city's stores in place (as the
      // source); without one, or with a modifier key, the card stays a plain link
      body.addEventListener('click', (e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || body.target === '_blank') return;
        pushAdobeCtaClickEvent({
          event: 'custom_cta_click',
          cta: text(card.city),
          parentTitle: value('title') || '',
          destiantionUrl: url,
        });

        const handled = !document.dispatchEvent(new CustomEvent(SEARCH_EVENT, {
          cancelable: true, detail: { query: text(card.city), from: 'city-stores' },
        }));
        if (handled) e.preventDefault();
      });
    }
    li.append(body);
    list.append(li);
  });
  if (list.children.length) nodes.push(list);

  block.replaceChildren(...nodes);
}
