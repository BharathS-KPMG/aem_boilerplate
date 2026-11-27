import { findLcpSection, textureSwatchSources } from '../../scripts/pre-load-image.js';
import { pushAdobeCalculatorEvents, pushAdobeProductTitleClick } from '../../scripts/analytics_1.js';

/**
 * texture-listing — texture catalogue: colour-family tabs, a "Filter by"
 * panel (one option group per filter column) and a swatch grid with
 * "Load more" (source: asianpaints.com exterior-textures .plplisting).
 *
 * Authoring model (DA table; full example in texture-listing.css header):
 *   Filter label | Clear label | Apply label | Load more label |
 *   Items per page | <Group> options (optional order)     <- label | value
 *   Colour family | Colour                                <- tabs header,
 *                                                            one row per tab
 *   Image | Name | Link | Colour family | <Group> | …      <- textures header,
 *                                                            one row per texture
 * Every column after "Colour family" in the textures header is a filter
 * group (here Product, Price, Finish); a cell may hold several values
 * separated by commas. The first tab shows every texture.
 *
 * Behaviour (as on the source): a tab shows the textures of that colour
 * family and resets the filters; options are toggled in the panel, options
 * that would leave no texture are disabled, Apply (inactive until an option
 * is chosen) filters the grid (OR within a group, AND across groups), shows
 * the choices as removable pills (desktop) and closes the panel; Clear all
 * resets. Below 992px the groups are an accordion.
 */

const MOBILE = '(max-width: 991px)';
const FIELDS = {
  'filter label': 'filterLabel',
  'clear label': 'clearLabel',
  'apply label': 'applyLabel',
  'load more label': 'moreLabel',
  'items per page': 'pageSize',
};
const DEFAULTS = {
  filterLabel: 'Filter by', clearLabel: 'Clear all', applyLabel: 'Apply', moreLabel: 'Load more', pageSize: '20',
};
const EAGER = 5; // first desktop row: in view on load, the first is the LCP

let uid = 0;
const text = (cell) => (cell?.textContent || '').replace(/\s+/g, ' ').trim();
const list = (value) => value.split(',').map((v) => v.trim()).filter(Boolean);
const key = (value) => value.toLowerCase();

function readModel(block) {
  const model = {
    ...DEFAULTS, order: {}, tabs: [], groups: [], items: [],
  };
  let mode = 'fields';
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const first = key(text(cells[0]));
    const second = key(text(cells[1]));
    if (first === 'colour family' && second === 'colour') { mode = 'tabs'; return; }
    if (first === 'image' && second === 'name') {
      mode = 'items';
      // columns after "Colour family" are the filter groups
      model.groups = cells.slice(4).map(text).filter(Boolean);
      return;
    }
    if (mode === 'fields') {
      const field = FIELDS[first];
      if (field) model[field] = text(cells[1]);
      else if (first.endsWith(' options')) model.order[first.slice(0, -8)] = list(text(cells[1]));
    } else if (mode === 'tabs') {
      if (text(cells[0])) model.tabs.push({ name: text(cells[0]), colour: text(cells[1]) });
    } else if (text(cells[1])) {
      const [image, name, link, family, ...tags] = cells;
      model.items.push({
        img: image?.querySelector('img'),
        name: text(name),
        href: link?.querySelector('a[href]')?.href || text(link),
        family: key(text(family)),
        tags: model.groups.map((g, i) => list(text(tags[i]))),
      });
    }
  });
  return model;
}

/** Options per group for the given textures, in authored order or A–Z. */
function groupOptions(model, items) {
  return model.groups.map((group, g) => {
    const values = new Map();
    items.forEach((item) => item.tags[g].forEach((v) => values.set(key(v), v)));
    const order = (model.order[key(group)] || []).map(key);
    return [...values.entries()]
      .sort(([a], [b]) => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
        return a.localeCompare(b);
      })
      .map(([id, label]) => ({ id, label }));
  });
}

/** An item matches when, in every group with a choice, it has one of them. */
function matches(item, selection, skip = -1) {
  return selection.every((chosen, g) => g === skip || !chosen.size
    || item.tags[g].some((v) => chosen.has(key(v))));
}

export default function decorate(block) {
  const model = readModel(block);
  if (!model.items.length) return;
  uid += 1;
  const id = `texture-listing-${uid}`;
  const pageSize = Math.max(1, parseInt(model.pageSize, 10) || 20);
  if (!model.tabs.length) model.tabs.push({ name: 'All', colour: '#fff' });
  const mq = window.matchMedia(MOBILE);
  // the swatches hold the LCP image when the block opens the page, also
  // behind an image-less first section (sr-only H1)
  const main = block.closest('main');
  const section = block.closest('.section');
  const lcp = !!main && (section === main.querySelector('.section')
    || section === findLcpSection(main));

  const state = {
    tab: 0, shown: pageSize, open: false, applied: [], pending: [], expanded: 0,
  };
  const blankSelection = () => model.groups.map(() => new Set());
  state.applied = blankSelection();
  state.pending = blankSelection();
  const tabItems = () => (state.tab === 0 ? model.items
    : model.items.filter((item) => item.family === key(model.tabs[state.tab].name)));

  // --- tabs ---
  const tabsBar = document.createElement('div');
  tabsBar.className = 'texture-listing-tabs';
  const tablist = document.createElement('div');
  tablist.className = 'texture-listing-tablist';
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', 'Colour family');
  const tabs = model.tabs.map((tab, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'texture-listing-tab';
    btn.id = `${id}-tab-${i}`;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', `${id}-panel`);
    // the label is hidden below 992px (dots only), so name the tab explicitly
    btn.setAttribute('aria-label', tab.name);
    const dot = document.createElement('span');
    dot.className = 'texture-listing-dot';
    dot.setAttribute('aria-hidden', 'true');
    if (tab.colour) dot.style.backgroundColor = tab.colour;
    const label = document.createElement('span');
    label.className = 'texture-listing-tab-label';
    label.textContent = tab.name;
    btn.append(dot, label);
    tablist.append(btn);
    return btn;
  });
  tabsBar.append(tablist);

  // --- panel: family heading, filters, grid, load more ---
  const panel = document.createElement('div');
  panel.className = 'texture-listing-panel';
  panel.id = `${id}-panel`;
  panel.setAttribute('role', 'tabpanel');

  const heading = document.createElement('h2');
  heading.className = 'texture-listing-family';

  const filters = document.createElement('div');
  filters.className = 'texture-listing-filters';
  const bar = document.createElement('div');
  bar.className = 'texture-listing-filter-bar';
  const pills = document.createElement('ul');
  pills.className = 'texture-listing-pills';
  pills.setAttribute('aria-label', 'Applied filters');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'texture-listing-filter-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', `${id}-filter-panel`);
  toggle.innerHTML = '<span class="texture-listing-filter-label"></span><span class="texture-listing-chevron" aria-hidden="true"></span>';
  toggle.querySelector('.texture-listing-filter-label').textContent = model.filterLabel;
  bar.append(pills, toggle);

  const filterPanel = document.createElement('div');
  filterPanel.className = 'texture-listing-filter-panel';
  filterPanel.id = `${id}-filter-panel`;
  filterPanel.hidden = true;
  const groupsEl = document.createElement('div');
  groupsEl.className = 'texture-listing-groups';
  const actions = document.createElement('div');
  actions.className = 'texture-listing-actions';
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'texture-listing-clear';
  clear.textContent = model.clearLabel;
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.className = 'texture-listing-apply';
  apply.textContent = model.applyLabel;
  actions.append(clear, apply);
  filterPanel.append(groupsEl, actions);
  filters.append(bar, filterPanel);

  const grid = document.createElement('ul');
  grid.className = 'texture-listing-grid';
  grid.setAttribute('aria-label', 'Textures');
  const cards = model.items.map((item, i) => {
    const li = document.createElement('li');
    li.className = 'texture-listing-item';
    const a = document.createElement('a');
    a.href = item.href || '#';
    a.addEventListener('click', () => {
      pushAdobeProductTitleClick({
        productName: item.name || '',
        destinationUrl: item.href || '',
        event: 'product_tile_click',
      });
    });
    const swatch = document.createElement('span');
    swatch.className = 'texture-listing-swatch';
    if (item.img) {
      // sized to the swatch; same URLs as preloadTextureListingLcp() in
      // pre-load-image.js, so the LCP swatch reuses that preload
      const { src, srcset, sizes } = textureSwatchSources(item.img);
      const img = document.createElement('img');
      img.loading = lcp && i < EAGER ? 'eager' : 'lazy';
      if (lcp && i === 0) img.setAttribute('fetchpriority', 'high');
      img.alt = ''; // decorative: the texture name is the link text
      img.width = 178;
      img.height = 178;
      img.sizes = sizes;
      img.srcset = srcset;
      img.src = src;
      swatch.append(img);
    }
    const name = document.createElement('h3');
    name.className = 'texture-listing-name';
    name.textContent = item.name;
    name.title = item.name;
    a.append(swatch, name);
    li.append(a);
    return li;
  });

  const more = document.createElement('div');
  more.className = 'texture-listing-more';
  const moreBtn = document.createElement('button');
  moreBtn.type = 'button';
  moreBtn.textContent = model.moreLabel;
  more.append(moreBtn);

  const status = document.createElement('p');
  status.className = 'texture-listing-status';
  status.setAttribute('aria-live', 'polite');

  panel.append(heading, filters, grid, more, status);

  // --- rendering ---
  let optionButtons = [];
  const renderGroups = () => {
    const options = groupOptions(model, tabItems());
    groupsEl.replaceChildren();
    optionButtons = [];
    model.groups.forEach((group, g) => {
      if (!options[g].length) return;
      const wrap = document.createElement('div');
      wrap.className = 'texture-listing-group';
      wrap.setAttribute('role', 'group');
      wrap.setAttribute('aria-labelledby', `${id}-group-${g}`);
      wrap.classList.toggle('is-expanded', state.expanded === g);
      const head = document.createElement('div');
      head.className = 'texture-listing-group-head';
      const label = document.createElement('span');
      label.className = 'texture-listing-group-label';
      label.id = `${id}-group-${g}`;
      label.textContent = group;
      const acc = document.createElement('button');
      acc.type = 'button';
      acc.className = 'texture-listing-group-toggle';
      acc.setAttribute('aria-expanded', String(state.expanded === g));
      acc.setAttribute('aria-controls', `${id}-options-${g}`);
      acc.setAttribute('aria-label', `${group} options`);
      acc.addEventListener('click', () => {
        state.expanded = state.expanded === g ? -1 : g;
        renderGroups();
        groupsEl.querySelectorAll('.texture-listing-group-toggle')[g]?.focus();
      });
      head.append(label, acc);
      const opts = document.createElement('div');
      opts.className = 'texture-listing-options';
      opts.id = `${id}-options-${g}`;
      options[g].forEach((opt) => {
        const optWrap = document.createElement('div');
        optWrap.className = 'texture-listing-option-wrap';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'texture-listing-option';
        btn.innerHTML = '<span class="texture-listing-option-label"></span><span class="texture-listing-check" aria-hidden="true"></span>';
        btn.querySelector('.texture-listing-option-label').textContent = opt.label;
        btn.addEventListener('click', () => {
          const chosen = state.pending[g];
          if (chosen.has(opt.id)) chosen.delete(opt.id); else chosen.add(opt.id);
          // eslint-disable-next-line no-use-before-define
          updateOptions();
        });
        optWrap.append(btn);
        opts.append(optWrap);
        optionButtons.push({
          g, opt, btn, optWrap,
        });
      });
      wrap.append(head, opts);
      groupsEl.append(wrap);
    });
    // eslint-disable-next-line no-use-before-define
    updateOptions();
  };

  /** Selected state, and disable options that would leave no texture. */
  function updateOptions() {
    const items = tabItems();
    optionButtons.forEach(({
      g, opt, btn, optWrap,
    }) => {
      const selected = state.pending[g].has(opt.id);
      const possible = selected || items.some((item) => matches(item, state.pending, g)
        && item.tags[g].some((v) => key(v) === opt.id));
      btn.setAttribute('aria-pressed', String(selected));
      btn.disabled = !possible;
      optWrap.classList.toggle('is-selected', selected);
      optWrap.classList.toggle('is-disabled', !possible);
    });
    // source (.btn-disabled): Apply stays inactive until an option is chosen;
    // it keeps its focus stop, so it is aria-disabled rather than disabled
    apply.setAttribute('aria-disabled', String(state.pending.every((chosen) => !chosen.size)));
  }

  const renderPills = () => {
    pills.replaceChildren();
    const options = groupOptions(model, tabItems());
    state.applied.forEach((chosen, g) => {
      options[g].filter((o) => chosen.has(o.id)).forEach((opt) => {
        const li = document.createElement('li');
        li.className = 'texture-listing-pill';
        const label = document.createElement('span');
        label.textContent = opt.label;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'texture-listing-pill-remove';
        remove.setAttribute('aria-label', `Remove filter ${opt.label}`);
        remove.addEventListener('click', () => {
          state.applied[g].delete(opt.id);
          state.pending[g].delete(opt.id);
          state.shown = pageSize;
          // eslint-disable-next-line no-use-before-define
          renderGrid(true);
          renderPills();
          updateOptions();
          toggle.focus();
        });
        li.append(label, remove);
        pills.append(li);
      });
    });
  };

  function renderGrid(announce) {
    const visible = tabItems().filter((item) => matches(item, state.applied));
    const page = visible.slice(0, state.shown);
    grid.replaceChildren(...page.map((item) => cards[model.items.indexOf(item)]));
    more.hidden = visible.length <= state.shown;
    if (announce) status.textContent = `${visible.length} texture${visible.length === 1 ? '' : 's'}`;
  }

  const setOpen = (open) => {
    state.open = open;
    filters.classList.toggle('is-open', open);
    filterPanel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };

  const selectTab = (i, focus) => {
    state.tab = i;
    tabs.forEach((t, n) => {
      t.setAttribute('aria-selected', String(n === i));
      t.tabIndex = n === i ? 0 : -1;
      t.classList.toggle('is-active', n === i);
    });
    panel.setAttribute('aria-labelledby', tabs[i].id);
    heading.textContent = model.tabs[i].name;
    // a new colour family starts unfiltered (the source's per-tab filter list)
    state.applied = blankSelection();
    state.pending = blankSelection();
    state.shown = pageSize;
    state.expanded = 0;
    renderGroups();
    renderPills();
    renderGrid(focus);
    if (focus) tabs[i].focus();
  };

  // --- events ---
  tabs.forEach((t, i) => t.addEventListener('click', () => {
    pushAdobeCalculatorEvents({
      filter: model.tabs[i].name,
      event: 'filter_click',
    });
    selectTab(i, false);
  }));
  tablist.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    let next;
    if (step) next = (state.tab + step + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    selectTab(next, true);
  });

  toggle.addEventListener('click', () => {
    if (!state.open) {
      // reopening starts from what is applied
      state.pending = state.applied.map((s) => new Set(s));
      updateOptions();
    }
    setOpen(!state.open);
  });
  filterPanel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { setOpen(false); toggle.focus(); }
  });
  apply.addEventListener('click', () => {
    if (apply.getAttribute('aria-disabled') === 'true') return;
    const selectedFilters = model.groups
      .map((group, index) => {
        const values = [...state.pending[index]];
        if (!values.length) return null;

        return `${group}: ${values.join(', ')}`;
      })
      .filter(Boolean)
      .join(' | ');

    pushAdobeCalculatorEvents({
      filter: selectedFilters,
      event: 'filter_click',
    });

    state.applied = state.pending.map((s) => new Set(s));
    state.shown = pageSize;
    renderGrid(true);
    renderPills();
    setOpen(false);
    toggle.focus();
  });
  clear.addEventListener('click', () => {
    state.pending = blankSelection();
    state.applied = blankSelection();
    state.shown = pageSize;
    updateOptions();
    renderGrid(true);
    renderPills();
  });
  moreBtn.addEventListener('click', () => {
    const first = state.shown;
    state.shown += pageSize;
    renderGrid(true);
    grid.children[first]?.querySelector('a')?.focus();
  });
  // the accordion only applies below 992px: rebuild when crossing it
  mq.addEventListener('change', () => renderGroups());

  block.replaceChildren(tabsBar, panel);
  selectTab(0, false);
}
