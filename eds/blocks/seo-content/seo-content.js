/*
** Authoring format **

Default: the block is left as authored.

Variants: table-style, table-style-2
(block authored as "seo-content (table-style)" / "seo-content (table-style-2)")
Each row → one table row; the first row becomes the table header (<thead>), the rest the body.
Add fit-content to table-style-2 ("seo-content (table-style-2, fit-content)") to size the table
to its content instead of the full width.

Variant: side-by-side
(block authored as "seo-content (side-by-side)")
Each row → one titled text section
Col 1 → Section title (e.g. "Waterproofing")
Col 2 → Description (rich text, links allowed)
Mobile shows one column; desktop flows the sections into two columns
(top-to-bottom, then the next column), in authored order.
*/

function decorateSideBySide(block) {
  const list = document.createElement('div');
  list.className = 'seo-content-list';

  [...block.children].forEach((row) => {
    const [titleCell, descCell] = row.children;
    const title = titleCell?.textContent.trim();
    if (!title && !descCell?.textContent.trim()) return;

    const item = document.createElement('section');
    item.className = 'seo-content-item';

    if (title) {
      const heading = document.createElement('h3');
      heading.className = 'seo-content-title';
      heading.textContent = title;
      item.append(heading);
    }

    if (descCell) {
      const desc = document.createElement('div');
      desc.className = 'seo-content-desc';
      // keep authored markup (paragraphs, links) but drop the wrapper cell
      desc.append(...descCell.childNodes);
      item.append(desc);
    }

    list.append(item);
  });

  block.replaceChildren(list);
}

function decorateTable(block) {
  const rows = [...block.children];
  if (!rows.length) return;

  const table = document.createElement('table');
  table.className = 'seo-content__table';
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  rows.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    const isHeader = rowIndex === 0;

    [...row.children].forEach((col) => {
      const cell = document.createElement(isHeader ? 'th' : 'td');
      if (isHeader) cell.scope = 'col';
      cell.append(...col.childNodes);
      tr.append(cell);
    });

    (isHeader ? thead : tbody).append(tr);
  });

  table.append(thead, tbody);
  block.replaceChildren(table);
}

export default function decorate(block) {
  if (block.classList.contains('side-by-side')) {
    decorateSideBySide(block);
    return;
  }

  // Only the table variants expect the structure below, otherwise the block is left as is
  if (block.classList.contains('table-style') || block.classList.contains('table-style-2')) {
    decorateTable(block);
  }
}
