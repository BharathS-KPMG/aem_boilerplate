import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * text-with-icon — a row of icons with short uppercase labels (source:
 * Asian Paints "textwithicon", e.g. nilaya-arc-inspiration).
 *
 * Authoring (DA table; full example in README.md): one row per item,
 *   | icon image | label |
 * An optional first row "Icon | Label" is ignored. A row needs an icon or a
 * label. Icons are decorative (the label next to them says what they mean).
 */

const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();

export default function decorate(block) {
  const list = document.createElement('ul');
  list.className = 'text-with-icon-list';

  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const img = row.querySelector('img');
    const label = text(cells.find((c) => !c.querySelector('img') && text(c)));
    if (!img && (!label || /^icon$/i.test(text(cells[0])))) return;

    const item = document.createElement('li');
    item.className = 'text-with-icon-item';
    if (img) {
      const icon = document.createElement('div');
      icon.className = 'text-with-icon-icon';
      const pic = createOptimizedPicture(img.src, '', false, [{ width: '120' }]);
      // the authored size reserves the icon's height before it loads (no CLS)
      const w = img.getAttribute('width');
      const h = img.getAttribute('height');
      if (w && h) {
        pic.querySelector('img').setAttribute('width', w);
        pic.querySelector('img').setAttribute('height', h);
      }
      icon.append(pic);
      item.append(icon);
    }
    if (label) {
      const p = document.createElement('p');
      p.className = 'text-with-icon-label';
      p.textContent = label;
      item.append(p);
    }
    list.append(item);
  });

  block.replaceChildren(list);
}
