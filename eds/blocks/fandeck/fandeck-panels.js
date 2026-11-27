/*
 * Fandeck: the shade drawer and the shortlist screen, as the source's (loaded on first use by
 * fandeck.js, which passes its helpers, labels and data in).
 *
 * Drawer: a modal sheet from the right under the site header: the shade's colour with its name
 * and code, its tags, the "Shade palette" (the other shades of its fandeck page, from the "Quick
 * view closest shade API" row), Add to / Remove from Shortlist, View full details (the shade's
 * page, new tab) and Share (the shade's page: the share sheet, else the link is copied).
 *
 * Shortlist screen: in place of the fan; the saved shades as a strip and as cards (page link,
 * hex, LRV, Remove), Share (this page), Back to Fandeck.
 */

const ADDED_TIME = 1800;
const COPIED_TIME = 4000;
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

let instanceCount = 0;

/**
 * Where the site header ends on screen now: its fixed or sticky parts stacked from the top of the
 * screen down (the brand bar, then the logo and menu rows under it).
 */
function headerBottom() {
  const header = document.querySelector('header');
  if (!header) return 0;
  const fixed = [...header.querySelectorAll('*')]
    .filter((node) => ['fixed', 'sticky'].includes(getComputedStyle(node).position));
  return (fixed.length ? fixed : [header])
    .map((node) => ({ node, rect: node.getBoundingClientRect() }))
    .filter(({ node, rect }) => rect.height > 0 && rect.bottom > 0
      && getComputedStyle(node).visibility !== 'hidden')
    .sort((a, b) => a.rect.top - b.rect.top)
    .reduce((bottom, { rect }) => (
      rect.top <= bottom + 1 ? Math.max(bottom, rect.bottom) : bottom
    ), 0);
}

/** The share sheet where there is one, else the link copied: 'shared', 'copied' or null. */
async function shareOrCopy(data) {
  if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return null;
    }
  }
  try {
    await navigator.clipboard.writeText(data.url);
    return 'copied';
  } catch (e) {
    return null;
  }
}

/**
 * @returns {{open: Function, close: Function, showShortlist: Function}} The drawer and screen
 */
export default function createPanels({
  block, el, icon, inkOn, labels, shortlist, loadPalette, onPick, onClose, onBack, shadeByCode,
}) {
  instanceCount += 1;
  const uid = `fandeck-panels-${instanceCount}`;
  const { drawer: text, shortlist: listText } = labels;
  let current = null;

  /* ---------------------------------------------------------------- drawer */
  const closeButton = el('button', {
    type: 'button', className: 'fd-drawer-close', 'aria-label': text.close,
  }, icon('close'));
  const name = el('h2', { className: 'fd-drawer-name', id: `${uid}-name` });
  const code = el('p', { className: 'fd-drawer-code' });
  const added = el('p', { className: 'fd-drawer-added', hidden: true }, icon('heart', 14), text.added);
  const tags = el('ul', { className: 'fd-drawer-tags' });
  const paletteList = el('div', { className: 'fd-drawer-palette-list' });
  const palette = el(
    'section',
    { className: 'fd-drawer-palette', 'aria-labelledby': `${uid}-palette`, hidden: true },
    el('h3', { className: 'fd-drawer-palette-title', id: `${uid}-palette` }, text.palette),
    el('p', { className: 'fd-drawer-palette-hint' }, text.paletteHint),
    paletteList,
  );
  const shortlistLabel = el('span', {}, text.add);
  const shortlistButton = el('button', {
    type: 'button', className: 'fd-drawer-shortlist',
  }, icon('heart'), shortlistLabel);
  const details = el('a', {
    className: 'fd-drawer-details', target: '_blank', rel: 'noopener noreferrer',
  }, icon('external'), text.details);
  const share = el('button', { type: 'button', className: 'fd-drawer-share' });
  const status = el('p', { className: 'fd-sr-only', role: 'status' });
  const dialog = el(
    'dialog',
    { className: 'fd-drawer', 'aria-labelledby': name.id, tabindex: '-1' },
    closeButton,
    el('div', { className: 'fd-drawer-top' }, name, code, added),
    el(
      'div',
      { className: 'fd-drawer-body' },
      tags,
      palette,
      el('div', { className: 'fd-drawer-actions' }, shortlistButton, details, share),
    ),
    status,
  );
  block.append(dialog);

  const resetShare = () => {
    share.classList.remove('is-copied');
    share.replaceChildren(icon('share', 14), text.share);
  };
  resetShare();

  const syncShortlist = () => {
    const saved = Boolean(current && shortlist.has(current.code));
    shortlistButton.classList.toggle('is-saved', saved);
    shortlistLabel.textContent = saved ? text.remove : text.add;
  };

  let paletteRun = 0;
  let addedTimer = 0;
  let shareTimer = 0;
  const render = (shade) => {
    current = shade;
    dialog.style.setProperty('--fd-shade', shade.hex);
    dialog.style.setProperty('--fd-ink', inkOn(shade));
    name.textContent = shade.name;
    code.textContent = shade.code;
    tags.replaceChildren(...shade.tags.map((tag) => el('li', {}, tag)));
    tags.hidden = !shade.tags.length;
    details.hidden = !shade.pageUrl;
    if (shade.pageUrl) details.href = shade.pageUrl;
    clearTimeout(addedTimer);
    clearTimeout(shareTimer);
    added.hidden = true;
    resetShare();
    syncShortlist();
    palette.hidden = true;
    paletteList.replaceChildren();
    paletteRun += 1;
    const run = paletteRun;
    loadPalette(shade).then((shades) => {
      if (run !== paletteRun || !shades.length) return;
      paletteList.replaceChildren(...shades.map((other) => {
        const tile = el(
          'button',
          {
            type: 'button', className: 'fd-drawer-tile', 'aria-label': `${text.paletteShade} ${other.name}`,
          },
          el('span', { className: 'fd-drawer-tile-colour', style: `background-color: ${other.hex}` }),
          el('span', { className: 'fd-drawer-tile-name' }, other.name),
        );
        tile.addEventListener('click', () => {
          onPick(other);
          // eslint-disable-next-line no-use-before-define
          show(other);
        });
        return tile;
      }));
      palette.hidden = false;
    });
  };

  const show = (shade) => {
    render(shade);
    dialog.querySelector('.fd-drawer-body').scrollTop = 0;
    dialog.focus({ preventScroll: true });
  };

  const open = (shade) => {
    render(shade);
    if (dialog.open) {
      dialog.focus({ preventScroll: true });
      return;
    }
    // under the site header (in the body's zoomed pixels)
    const top = Math.round(headerBottom() / (block.currentCSSZoom || 1));
    dialog.style.setProperty('--fd-drawer-top', `${top}px`);
    document.documentElement.classList.add('fd-no-scroll');
    dialog.showModal();
    dialog.focus({ preventScroll: true });
    requestAnimationFrame(() => requestAnimationFrame(() => dialog.classList.add('is-open')));
  };

  const close = () => {
    if (!dialog.open) return;
    dialog.classList.remove('is-open');
    const done = () => {
      if (!dialog.classList.contains('is-open') && dialog.open) dialog.close();
    };
    if (REDUCED_MOTION.matches) {
      done();
      return;
    }
    dialog.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 450);
  };

  dialog.addEventListener('close', () => {
    dialog.classList.remove('is-open');
    document.documentElement.classList.remove('fd-no-scroll');
    current = null;
    onClose();
  });
  // Escape slides the sheet out too
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  closeButton.addEventListener('click', close);
  // a press on the dimmed page closes it
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) close();
  });

  shortlistButton.addEventListener('click', () => {
    if (!current) return;
    clearTimeout(addedTimer);
    if (shortlist.has(current.code)) {
      shortlist.remove(current.code);
      added.hidden = true;
      return;
    }
    shortlist.add(current.code);
    added.hidden = false;
    status.textContent = text.added;
    addedTimer = setTimeout(() => { added.hidden = true; }, ADDED_TIME);
  });

  share.addEventListener('click', async () => {
    if (!current) return;
    const shade = current;
    const result = await shareOrCopy({
      title: `${shade.name} ${text.shareTitle}`,
      text: `${text.shareText} ${shade.name} (${shade.code}) ${text.shareFrom}`,
      url: shade.pageUrl || window.location.href,
    });
    if (result !== 'copied' || current !== shade) return;
    share.classList.add('is-copied');
    share.replaceChildren(icon('check', 14), text.copied);
    status.textContent = text.copied;
    clearTimeout(shareTimer);
    shareTimer = setTimeout(resetShare, COPIED_TIME);
  });

  /* ------------------------------------------------------ shortlist screen */
  const title = el('h2', { className: 'fd-shortlist-title', id: `${uid}-shortlist`, tabindex: '-1' });
  const back = el('button', { type: 'button', className: 'fd-shortlist-back' }, icon('previous'), listText.back);
  const shareAll = el('button', { type: 'button', className: 'fd-shortlist-share' });
  const content = el('div', { className: 'fd-shortlist-content' });
  const listStatus = el('p', { className: 'fd-sr-only', role: 'status' });
  const screen = el(
    'section',
    { className: 'fd-shortlist', 'aria-labelledby': title.id, hidden: true },
    el('div', { className: 'fd-shortlist-bar' }, el('div', { className: 'fd-shortlist-bar-inner' }, back, shareAll)),
    el(
      'div',
      { className: 'fd-shortlist-inner' },
      title,
      el('p', { className: 'fd-shortlist-subtitle' }, listText.subtitle),
      content,
    ),
    listStatus,
  );
  block.insertBefore(screen, block.querySelector('.fd-shortlist-open'));

  const resetShareAll = () => {
    shareAll.classList.remove('is-copied');
    shareAll.replaceChildren(icon('share', 14), listText.share);
  };
  resetShareAll();

  const card = (shade) => {
    const remove = el(
      'button',
      {
        type: 'button',
        className: 'fd-shortlist-remove',
        'aria-label': `${listText.remove} ${shade.name} ${listText.removeShade}`,
      },
      icon('close', 14),
      listText.remove,
    );
    remove.addEventListener('click', () => {
      const index = [...content.querySelectorAll('.fd-shortlist-remove')].indexOf(remove);
      shortlist.remove(shade.code);
      // the list is rendered anew: the Remove now in its place (or the last), else the title
      const removes = content.querySelectorAll('.fd-shortlist-remove');
      (removes[Math.min(index, removes.length - 1)] || title).focus();
    });
    return el(
      'li',
      { className: 'fd-shortlist-card', style: `--fd-shade: ${shade.hex}; --fd-ink: ${inkOn(shade)}` },
      el(
        shade.pageUrl ? 'a' : 'div',
        shade.pageUrl ? {
          className: 'fd-shortlist-colour', href: shade.pageUrl, target: '_blank', rel: 'noopener noreferrer',
        } : { className: 'fd-shortlist-colour' },
        el(
          'span',
          { className: 'fd-shortlist-text' },
          el('span', { className: 'fd-shortlist-name' }, shade.name),
          el('span', { className: 'fd-shortlist-code' }, shade.code),
        ),
      ),
      el(
        'div',
        { className: 'fd-shortlist-meta' },
        el(
          'p',
          { className: 'fd-shortlist-values' },
          el('span', {}, shade.hex),
          el('span', {}, `${listText.lrv} ${shade.lrv}`),
        ),
        remove,
      ),
    );
  };

  const renderShortlist = () => {
    const shades = shortlist.codes().map(shadeByCode).filter(Boolean);
    title.replaceChildren(...[
      listText.title,
      shades.length ? ' ' : null,
      shades.length ? el('span', { className: 'fd-shortlist-total' }, `(${shades.length})`) : null,
    ].filter(Boolean));
    if (!shades.length) {
      const explore = el('button', { type: 'button', className: 'fd-shortlist-explore' }, listText.explore);
      explore.addEventListener('click', onBack);
      const heart = icon('heart', 40);
      heart.setAttribute('stroke-width', '1.5');
      content.replaceChildren(el(
        'div',
        { className: 'fd-shortlist-empty' },
        el('span', { className: 'fd-shortlist-empty-icon' }, heart),
        el('h3', { className: 'fd-shortlist-empty-title' }, listText.empty),
        el('p', { className: 'fd-shortlist-empty-hint' }, listText.emptyHint),
        explore,
      ));
      return;
    }
    content.replaceChildren(
      el('div', { className: 'fd-shortlist-strip', 'aria-hidden': 'true' }, ...shades.map((shade) => el('span', {
        title: shade.name, style: `background-color: ${shade.hex}`,
      }))),
      el('ul', { className: 'fd-shortlist-grid' }, ...shades.map(card)),
    );
  };

  shortlist.subscribe(() => {
    syncShortlist();
    if (!screen.hidden) renderShortlist();
  });
  back.addEventListener('click', onBack);
  shareAll.addEventListener('click', async () => {
    const result = await shareOrCopy({
      title: listText.shareTitle, text: listText.shareText, url: window.location.href,
    });
    if (result !== 'copied') return;
    shareAll.classList.add('is-copied');
    shareAll.replaceChildren(icon('check', 14), listText.copied);
    listStatus.textContent = listText.copied;
    setTimeout(resetShareAll, COPIED_TIME);
  });

  const showShortlist = (visible) => {
    screen.hidden = !visible;
    if (!visible) return;
    resetShareAll();
    renderShortlist();
    const { top } = screen.getBoundingClientRect();
    if (top < 0) screen.scrollIntoView({ block: 'start' });
    title.focus({ preventScroll: true });
  };

  return { open, close, showShortlist };
}
