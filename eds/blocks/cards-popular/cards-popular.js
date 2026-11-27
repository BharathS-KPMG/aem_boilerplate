import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import loadProductFeed from './product-feed.js';
import { BETA_DOMAIN, PROD_DOMAIN } from '../../scripts/environment.js';
import { pushAdobeProductTitleClick } from '../../scripts/analytics_1.js';
import initWishlist, { wishlistHeart } from '../../scripts/wishlist.js';

/**
 * Popular product tiles (the source's "Popular products" row, div.interiorpopularproducts, under
 * the listing). Each tile is one link to the product: pack shot on the left, name on the right.
 * The row scrolls sideways on mobile and fits in one row on desktop.
 *
 * Authoring (DA first, the JSON is the fallback):
 *   | Cards Popular |                            |      |
 *   | Data          | /eds/products/royale.json  |      | optional: the JSON fallback
 *   | (pack shot)   | [Royale Glitz](/…/royale-glitz) | 1A29 | one row per tile: image,
 *                                                         name linked to the product, code
 * The authored tiles show when there are any; without them, the popular products of the Data file
 * (rows with a `popular` rank, see ./product-feed.js). Tiles with a product code carry a wishlist
 * heart, as on the source: the same shared wishlist as the products-listing cards
 * (scripts/wishlist.js). Without any tile the section is hidden.
 */

// links go to the live Asian Paints pages (www), and to beta only on pages served from beta
// (domains from scripts/environment.js)
const SITE_DOMAIN = window.location.hostname === BETA_DOMAIN ? BETA_DOMAIN : PROD_DOMAIN;
const ASIAN_PAINTS_HOSTS = [PROD_DOMAIN, BETA_DOMAIN, 'asianpaints.com'];
const DATA_LABELS = ['data', 'datafile', 'json', 'productfeed'];
const HEADING_LABELS = ['image', 'packshot', 'product', 'name', 'code'];
const CODE = /^[a-z0-9]{3,10}$/i;

/**
 * An Asian Paints page URL on the site's domain (SITE_DOMAIN). Site-relative links (which the
 * content sync makes of authored www links) and www/beta.asianpaints.com links get that domain,
 * with the .html the site uses; other links are kept.
 * @param {string} href The link as authored or from the API
 * @param {string} [resolved] The browser-resolved link, used for links to other sites
 */
function siteUrl(href, resolved = href) {
  const relative = href.startsWith('/') && !href.startsWith('//');
  let url;
  try {
    url = new URL(relative ? href : resolved, `https://${SITE_DOMAIN}`);
  } catch (e) {
    return resolved;
  }
  if (!relative && !ASIAN_PAINTS_HOSTS.includes(url.hostname)) return resolved;
  url.protocol = 'https:';
  url.hostname = SITE_DOMAIN;
  if (url.pathname !== '/' && !/\.[a-z0-9]+$/i.test(url.pathname)) {
    url.pathname = `${url.pathname.replace(/\/$/, '')}.html`;
  }
  return url.href;
}

const label = (cell) => (cell?.textContent || '').toLowerCase().replace(/[^a-z]/g, '');

// an authored tile: | image | name (linked) | code (optional) |
function buildTile(row) {
  const cells = [...row.children];
  const imageCell = cells.find((cell) => cell.querySelector('picture, img'));
  const textCell = cells.find((cell) => cell !== imageCell && cell.textContent.trim());
  const codeCell = cells.find((cell) => cell !== imageCell && cell !== textCell
    && CODE.test(cell.textContent.trim()));
  const link = textCell?.querySelector('a[href]') || imageCell?.querySelector('a[href]');
  const name = (textCell?.querySelector('h1, h2, h3, h4, h5, h6') || textCell || link)
    ?.textContent.trim();
  if (!name) return null;

  const tile = document.createElement('li');
  tile.className = 'cards-popular-tile';
  if (codeCell) tile.dataset.productCode = codeCell.textContent.trim();
  moveInstrumentation(row, tile);

  // one link per tile, so the whole tile is the target and is read once by screen readers
  const target = document.createElement(link ? 'a' : 'div');
  target.className = 'cards-popular-link';
  if (link) {
    target.href = siteUrl(link.getAttribute('href') || '', link.href);
    moveInstrumentation(link, target);
  }

  const img = imageCell?.querySelector('img');
  if (img) {
    // the name is the tile's text, so the pack shot is decorative here
    const picture = createOptimizedPicture(img.src, '', false, [{ width: '160' }]);
    picture.classList.add('cards-popular-image');
    moveInstrumentation(img, picture.querySelector('img'));
    target.append(picture);
  }
  const text = document.createElement('span');
  text.className = 'cards-popular-name';
  text.textContent = name;
  target.append(text);

  tile.append(target);
  return tile;
}

// a tile from the feed, in the same markup as an authored tile
function feedTile(product) {
  const tile = document.createElement('li');
  tile.className = 'cards-popular-tile';
  if (product.code) tile.dataset.productCode = product.code;
  const link = document.createElement('a');
  link.className = 'cards-popular-link';
  link.href = siteUrl(product.url);
  if (product.image) {
    const picture = document.createElement('picture');
    picture.className = 'cards-popular-image';
    const img = document.createElement('img');
    img.src = product.image;
    img.alt = '';
    img.loading = 'lazy';
    img.width = 80;
    img.height = 90;
    picture.append(img);
    link.append(picture);
  }
  const name = document.createElement('span');
  name.className = 'cards-popular-name';
  name.textContent = product.name;
  link.append(name);
  tile.append(link);
  return tile;
}

// Heart beside the tile's link (a button can't sit inside a link); handled by initWishlist
function wishlistButton(code, name) {
  return wishlistHeart({ code, name, className: 'cards-popular-wishlist' });
}

// product_tile_click for every tile (authored or from the feed), with the section's title
function trackClicks(list, block) {
  list.addEventListener('click', (e) => {
    const link = e.target.closest('.cards-popular-link');
    if (!link) return;
    const tile = link.closest('.cards-popular-tile');
    const productName = tile.querySelector('.cards-popular-name')?.textContent.trim() || '';
    const parentTitle = block.closest('.section')
      ?.querySelector('.default-content-wrapper h2')?.textContent.trim() || '';
    pushAdobeProductTitleClick({
      event: 'product_tile_click',
      productSku: tile.dataset.productCode || '',
      productName,
      destinationUrl: link.href || '',
      parentTitle,
    });
  });
}

export default async function decorate(block) {
  let data = '';
  const list = document.createElement('ul');
  list.className = 'cards-popular-list';
  [...block.children].forEach((row) => {
    const [first, second] = row.children;
    const key = label(first);
    if (DATA_LABELS.includes(key) && second && !row.querySelector('picture, img')) {
      data = second.querySelector('a[href]')?.getAttribute('href') || second.textContent.trim();
      return;
    }
    // an optional column heading row (| Image | Product | Code |)
    if (HEADING_LABELS.includes(key) && !row.querySelector('picture, img, a')) return;
    const tile = buildTile(row);
    if (tile) list.append(tile);
  });
  block.replaceChildren(list);

  // DA first: the authored tiles; without them, the data's popular products (awaited, with the
  // loader's timeout, so the section shows the final tiles: no shift)
  if (!list.children.length) {
    const products = await loadProductFeed(data);
    (products || []).forEach((product) => list.append(feedTile(product)));
  }
  if (!list.children.length) {
    block.closest('.section')?.setAttribute('hidden', '');
    return;
  }
  list.querySelectorAll('.cards-popular-tile[data-product-code]').forEach((tile) => {
    const name = tile.querySelector('.cards-popular-name')?.textContent.trim() || '';
    tile.append(wishlistButton(tile.dataset.productCode, name));
  });
  trackClicks(list, block);
  initWishlist(block);
}
