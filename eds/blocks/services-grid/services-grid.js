import { toClassName } from '../../scripts/aem.js';
import { ga4Implementaion, pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';

const text = (el) => el?.textContent.trim() || '';

/**
 * Reads the authored rows:
 * | Title         | Everything a home needs |
 * | Description   | One stop solution ...   |
 * | Desktop image | Mobile image | Label | Link |   (header row, skipped)
 * | <img>         | <img>        | Interior | /products/... |
 */
function readRows(rows) {
  const textCol = document.createElement('div');
  textCol.className = 'services-grid-text';
  const items = [];

  rows.forEach((row) => {
    const cells = [...row.children];
    const key = toClassName(text(cells[0]));

    if (key === 'title' && cells[1]) {
      const h2 = document.createElement('h2');
      h2.textContent = text(cells[1]);
      h2.id = toClassName(h2.textContent);
      textCol.prepend(h2);
    } else if (key === 'description' && cells[1]) {
      if (cells[1].querySelector('p')) {
        textCol.append(...cells[1].children);
      } else {
        const p = document.createElement('p');
        p.append(...cells[1].childNodes);
        textCol.append(p);
      }
    } else if (cells.length >= 4) {
      const [desktopCell, mobileCell, labelCell, linkCell] = cells;
      const desktopImg = desktopCell.querySelector('img');
      const mobileImg = mobileCell.querySelector('img');
      // the "Desktop image | Mobile image | Label | Link" header row has no images
      if (!desktopImg && !mobileImg) return;
      const link = linkCell.querySelector('a[href]');
      items.push({
        desktopImg,
        mobileImg,
        label: text(labelCell),
        href: link?.href || text(linkCell),
      });
    }
  });

  return { textCol, items };
}

function buildCard({
  desktopImg, mobileImg, label, href,
}, parentTitle) {
  const card = document.createElement('a');
  card.className = 'services-grid-card';
  if (href) card.href = href;
  card.addEventListener('click', () => {
    const param1 = card.href;
    pushAdobeCtaClickEvent({
      cta: label,
      parentTitle,
      destinationUrl: param1,
      event: 'cta_link_text',
    });

    ga4Implementaion({
      event: 'services_home_needs',
      click_text: label,
      click_category: parentTitle,
    });
  });

  const imgContainer = document.createElement('div');
  imgContainer.className = 'services-grid-card-image';

  const picture = document.createElement('picture');

  if (mobileImg?.src) {
    const mobileSource = document.createElement('source');
    mobileSource.media = '(max-width: 767px)';
    mobileSource.srcset = mobileImg.currentSrc || mobileImg.src;
    picture.appendChild(mobileSource);
  }

  if (desktopImg?.src) {
    const desktopSource = document.createElement('source');
    desktopSource.media = '(min-width: 768px)';
    desktopSource.srcset = desktopImg.currentSrc || desktopImg.src;
    picture.appendChild(desktopSource);
  }

  const sourceImg = desktopImg || mobileImg;
  const img = document.createElement('img');
  img.src = sourceImg.currentSrc || sourceImg.src;
  img.alt = label || sourceImg.alt || '';
  img.loading = 'lazy';
  if (sourceImg.width) img.width = sourceImg.width;
  if (sourceImg.height) img.height = sourceImg.height;

  picture.appendChild(img);
  imgContainer.appendChild(picture);

  const textContainer = document.createElement('div');
  textContainer.className = 'services-grid-card-text';
  const name = document.createElement('span');
  name.textContent = label;
  textContainer.appendChild(name);

  const arrow = document.createElement('div');
  arrow.className = 'services-grid-card-arrow';
  arrow.textContent = '↗';

  card.append(imgContainer, textContainer, arrow);
  return card;
}

export default function decorate(block) {
  const { textCol, items } = readRows([...block.children]);
  const parentTitle = text(textCol.querySelector('h2'));

  const gridContainer = document.createElement('div');
  gridContainer.className = 'services-grid-cards';
  items.forEach((item) => gridContainer.appendChild(buildCard(item, parentTitle)));

  const servicesCol = document.createElement('div');
  servicesCol.className = 'services-grid-images';
  servicesCol.appendChild(gridContainer);

  block.replaceChildren(textCol, servicesCol);
}
