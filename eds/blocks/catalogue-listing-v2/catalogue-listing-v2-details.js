/*
 * Catalogue Listing v2: the shade details pop-up and compare (source: the colourcataloguelisting
 * component's #swatch-detail-popup and #compare-shades-modal).
 *
 * Details: a swatch opens it with the shade's name, code, wishlist heart, room photo (the shade's
 * colour shows while it loads, or when there is none), its closest shades (the shades of its page,
 * passed in by catalogue-listing-v2.js, at once or when they arrive) to switch between, the
 * compare button and Shade Details → the shade's page (its pageUrl as returned).
 * Compare: up to 4 shades, kept for the visit (not stored, as the source). The toolbar's Compare
 * Shades button shows their count and opens the compare pop-up: each shade's colour, name, code,
 * heart and room photo, and a remove button.
 *
 * Both are modal <dialog>s in the block (no dimmed backdrop, as the source); Escape, the close
 * button or a click outside closes them. Hearts are scripts/wishlist.js's (type "shades").
 * Loaded by catalogue-listing-v2.js on the first swatch click.
 */

// the room photo as a DAM rendition (as catalogue-listing): same proportions, ~75 KB, not ~250 KB
const ROOM_SHOT_RENDITION = '.transform/cc-width-720-height-540/image.jpeg';
const MESSAGE_TIME = 3000;

let dialogCount = 0;

/** a light colour (the source's getIconColor): dark text and icons on it */
function isLight(hex) {
  let value = `${hex || ''}`.replace('#', '').trim();
  if (value.length === 3) value = value.replace(/./g, (c) => c + c);
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16) || 0);
  return 0.299 * r + 0.587 * g + 0.114 * b > 186;
}

/** The room photo (the API gives DAM paths; its desktop and mobile shots are the same). */
function roomShot(shade, envUrl) {
  const shots = shade?.naturalDesktopRoomShots || shade?.naturalMobileRoomShots;
  const path = Array.isArray(shots) ? shots[0] : shots;
  return path ? envUrl(path) : '';
}

/** Shows a room photo: its rendition, else the original, else nothing (the colour shows). */
function showRoom(image, url, alt) {
  image.hidden = !url;
  image.alt = alt;
  if (!url) {
    image.removeAttribute('src');
    return;
  }
  image.dataset.original = url;
  image.src = `${url}${ROOM_SHOT_RENDITION}`;
}

function onRoomError({ target: image }) {
  const { original } = image.dataset;
  if (original && image.src !== original) image.src = original;
  else image.hidden = true;
}

/** a click outside the dialog's box closes it */
function closeOnOutsideClick(dialog, box) {
  dialog.addEventListener('click', (event) => {
    if (box.contains(event.target)) return;
    const rect = box.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) dialog.close();
  });
}

/**
 * @param {object} options
 * @param {Element} options.block
 * @param {{ heart: Function, refresh: Function }|null} options.wishlist
 * @param {object} options.labels details labels (cta, closest, compare, compareMax, added, close)
 * @param {object} options.compareLabels compare labels (title, max, remove, close)
 * @param {object} options.helpers el, titleCase, codeOf, rememberShade, envUrl
 * @param {(count: number) => void} options.onCompareChange
 * @returns {{ open: Function, openCompare: Function }}
 */
export default function createDetails({
  block, wishlist, labels, compareLabels, helpers, onCompareChange,
}) {
  const {
    el, titleCase, codeOf, rememberShade, envUrl,
  } = helpers;
  dialogCount += 1;
  const id = `cl2-details-${dialogCount}`;
  const compared = [];
  let current = null; // the open shade: { card, palette, index }
  const shadeLabel = (shade) => [titleCase(shade.entityName), codeOf(shade)].filter(Boolean).join(', ');

  /* ---- details */
  const name = el('h2', { className: 'cl2-details-name', id: `${id}-name` });
  const code = el('p', { className: 'cl2-details-code' });
  const heart = wishlist ? wishlist.heart({ code: '', className: 'cl2-heart cl2-details-heart' }) : null;
  const close = el('button', { type: 'button', className: 'cl2-close', 'aria-label': labels.close });
  const image = el('img', {
    className: 'cl2-details-image', alt: '', width: '412', height: '324', decoding: 'async',
  });
  image.addEventListener('error', onRoomError);
  const media = el('div', { className: 'cl2-details-media' }, image);
  const swatches = el('div', { className: 'cl2-details-swatches', role: 'group', 'aria-labelledby': `${id}-closest` });
  const compareAdd = el('button', {
    type: 'button', className: 'cl2-compare-add', 'aria-pressed': 'false', 'aria-label': labels.compare,
  });
  const compareTip = el('span', { className: 'cl2-tip', 'aria-hidden': 'true' });
  const compareWrap = el('span', { className: 'cl2-compare-wrap' }, compareAdd, compareTip);
  const link = el('a', { className: 'cl2-details-link' }, labels.cta);
  const toast = el('p', { className: 'cl2-toast', role: 'status' });
  const status = el('p', { className: 'cl2-sr-only', role: 'status' });
  const box = el(
    'div',
    { className: 'cl2-details-box' },
    el(
      'div',
      { className: 'cl2-details-head' },
      el('div', { className: 'cl2-details-title' }, name, code),
      heart,
      close,
    ),
    media,
    el(
      'div',
      { className: 'cl2-details-closest' },
      el('p', { className: 'cl2-details-closest-title', id: `${id}-closest` }, labels.closest),
      swatches,
    ),
    el('div', { className: 'cl2-details-actions' }, compareWrap, link),
  );
  const dialog = el('dialog', {
    className: 'cl2-dialog cl2-details', 'aria-labelledby': name.id, tabindex: '-1',
  }, box, toast, status);

  /* ---- compare */
  const compareTitle = el('h2', { className: 'cl2-compare-title', id: `${id}-compare` }, compareLabels.title);
  const compareClose = el('button', { type: 'button', className: 'cl2-close', 'aria-label': compareLabels.close });
  const compareList = el('ul', { className: 'cl2-compare-list' });
  const compareBox = el(
    'div',
    { className: 'cl2-compare-box' },
    el('div', { className: 'cl2-compare-head' }, compareTitle, compareClose),
    compareList,
  );
  const compareDialog = el('dialog', {
    className: 'cl2-dialog cl2-compare', 'aria-labelledby': compareTitle.id, tabindex: '-1',
  }, compareBox);
  block.append(dialog, compareDialog);

  const timers = {};
  const flash = (node, key, text) => {
    clearTimeout(timers[key]);
    node.textContent = text;
    node.classList.add('is-shown');
    timers[key] = setTimeout(() => {
      node.classList.remove('is-shown');
      node.textContent = '';
    }, MESSAGE_TIME);
  };

  const isCompared = (shadeCode) => compared.some((item) => item.code === shadeCode);
  const selected = () => current?.palette[current.index];
  const paintCompare = () => {
    const shade = selected();
    const on = Boolean(shade) && isCompared(codeOf(shade));
    compareAdd.setAttribute('aria-pressed', `${on}`);
    compareTip.textContent = !on && compared.length >= compareLabels.max
      ? labels.compareMax : labels.compare;
  };

  const select = (index, remember) => {
    current.index = index;
    const shade = selected();
    const shadeName = shade.entityName || '';
    const shadeCode = codeOf(shade);
    name.textContent = shadeName;
    code.textContent = shadeCode;
    swatches.querySelectorAll('button').forEach((button, i) => {
      button.setAttribute('aria-pressed', `${i === index}`);
    });
    media.style.backgroundColor = shade.shadeHexCode || '';
    showRoom(image, roomShot(shade, envUrl), titleCase(shadeName));
    link.hidden = !shade.pageUrl;
    if (shade.pageUrl) link.href = shade.pageUrl;
    else link.removeAttribute('href');
    if (heart) {
      heart.hidden = !shadeCode;
      heart.dataset.attrSku = shadeCode;
      heart.dataset.pid = shadeCode;
      heart.dataset.attrTitle = titleCase(shadeName);
      heart.setAttribute('aria-label', `Wishlist: ${titleCase(shadeName) || shadeCode}`);
      wishlist.refresh();
    }
    paintCompare();
    if (remember) rememberShade(shadeCode);
  };

  const renderSwatches = () => {
    swatches.replaceChildren(...current.palette.map((shade, i) => {
      const button = el('button', {
        type: 'button',
        className: 'cl2-details-swatch',
        'aria-pressed': 'false',
        'aria-label': shadeLabel(shade),
        'data-index': `${i}`,
      });
      button.style.backgroundColor = shade.shadeHexCode || '';
      return button;
    }));
  };

  swatches.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button) select(Number(button.dataset.index), true);
  });

  compareAdd.addEventListener('click', () => {
    const shade = selected();
    const shadeCode = codeOf(shade);
    if (!shadeCode) return;
    if (isCompared(shadeCode)) {
      compared.splice(compared.findIndex((item) => item.code === shadeCode), 1);
    } else if (compared.length >= compareLabels.max) {
      compareWrap.classList.add('is-tip-shown');
      clearTimeout(timers.tip);
      timers.tip = setTimeout(() => compareWrap.classList.remove('is-tip-shown'), MESSAGE_TIME);
      flash(status, 'status', labels.compareMax);
      paintCompare();
      return;
    } else {
      compared.push({
        code: shadeCode,
        name: shade.entityName || '',
        hex: shade.shadeHexCode || '',
        room: roomShot(shade, envUrl),
      });
      flash(toast, 'toast', labels.added);
    }
    paintCompare();
    onCompareChange(compared.length);
  });

  close.addEventListener('click', () => dialog.close());
  closeOnOutsideClick(dialog, box);
  dialog.addEventListener('close', () => {
    const card = current?.card;
    current = null;
    toast.classList.remove('is-shown');
    card?.classList.remove('is-active');
    if (card?.isConnected) card.focus({ preventScroll: true });
  });

  /**
   * Opens the pop-up for a swatch's shade. `closest`: its page's shades, or a promise of them
   * (null: the shade alone).
   */
  const open = (shade, card, closest) => {
    if (current?.card && current.card !== card) current.card.classList.remove('is-active');
    const opened = { card, palette: [shade], index: 0 };
    current = opened;
    const fill = (shades) => {
      if (current !== opened || !Array.isArray(shades) || !shades.length) return;
      const at = shades.findIndex((item) => codeOf(item) === codeOf(shade));
      const hadFocus = swatches.contains(document.activeElement);
      opened.palette = at < 0 ? [shade, ...shades] : shades;
      renderSwatches();
      select(Math.max(at, 0), false);
      if (hadFocus) swatches.querySelector('[aria-pressed="true"]')?.focus();
    };
    if (Array.isArray(closest)) {
      fill(closest);
    } else {
      renderSwatches();
      select(0, false);
      closest?.then(fill);
    }
    rememberShade(codeOf(shade));
    if (!dialog.open) dialog.showModal();
    dialog.focus({ preventScroll: true });
  };

  /* ---- compare pop-up */
  const compareItem = (item) => {
    const top = el('div', { className: `cl2-compare-top${isLight(item.hex) ? ' is-light' : ''}` });
    top.style.backgroundColor = item.hex;
    const itemHeart = wishlist ? wishlist.heart({
      code: item.code, name: titleCase(item.name), className: 'cl2-heart cl2-compare-heart',
    }) : null;
    top.append(
      el('button', {
        type: 'button',
        className: 'cl2-compare-remove',
        'aria-label': `${compareLabels.remove} ${titleCase(item.name)}`.trim(),
        'data-code': item.code,
      }),
      el(
        'div',
        { className: 'cl2-compare-row' },
        el(
          'div',
          { className: 'cl2-compare-meta' },
          el('p', { className: 'cl2-compare-name' }, item.name),
          el('p', { className: 'cl2-compare-code' }, item.code),
        ),
        itemHeart,
      ),
    );
    const room = el('img', {
      className: 'cl2-compare-room', alt: '', width: '274', height: '205', loading: 'lazy',
    });
    room.addEventListener('error', onRoomError);
    const roomBox = el('div', { className: 'cl2-compare-room-box' }, room);
    roomBox.style.backgroundColor = item.hex;
    showRoom(room, item.room, '');
    return el('li', { className: 'cl2-compare-item' }, top, roomBox);
  };

  const openCompare = () => {
    if (!compared.length) return;
    compareList.replaceChildren(...compared.map(compareItem));
    wishlist?.refresh();
    if (!compareDialog.open) compareDialog.showModal();
    compareDialog.focus({ preventScroll: true });
  };

  compareList.addEventListener('click', (event) => {
    const remove = event.target.closest('.cl2-compare-remove');
    if (!remove) return;
    const at = compared.findIndex((item) => item.code === remove.dataset.code);
    if (at >= 0) compared.splice(at, 1);
    const item = remove.closest('li');
    const next = item.nextElementSibling || item.previousElementSibling;
    item.remove();
    onCompareChange(compared.length);
    if (!compared.length) compareDialog.close();
    else next?.querySelector('.cl2-compare-remove')?.focus();
  });
  compareClose.addEventListener('click', () => compareDialog.close());
  closeOnOutsideClick(compareDialog, compareBox);

  return { open, openCompare };
}
