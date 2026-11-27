import { createOptimizedPicture } from '../../scripts/aem.js';
import { loadMaps, hasMapsKey, setMapsKey } from '../../scripts/google-maps.js';
import {
  SEARCH_EVENT, RESULT_EVENT, DESKTOP, text, href, key, el, fieldReader, instrumentation, cityNames,
} from '../../scripts/store-locator.js';

/**
 * store-search — the store locator's banner: breadcrumb, "Find store by city
 * or pin code" (the page's h1), the city / pincode search with suggestions,
 * and the banner picture. Source: asianpaints.com/store-locator
 * (storelocatorlepton ".store-locator-banner" and its breadcrumb).
 * Authoring and behaviour: README.md.
 *
 * A search goes to the store-finder block on the page ("store-finder:search");
 * it answers with "store-finder:result", which shows the source's
 * "Invalid location" / "No store found" under the box. Without a store-finder
 * the search opens the authored results page with ?q=<place>.
 *
 * Authoring (DA table): label | value rows, then a header row
 *   Breadcrumb | Link
 * and one row per breadcrumb item (the last, without a link, is this page).
 */

const DEFAULTS = {
  title: 'Find store by city or pin code',
  placeholder: 'Enter city or pincode',
  searchLabel: 'Search',
  invalid: 'Invalid location',
  none: 'No store found',
  empty: 'Please enter a city or pincode',
  suggestions: 'Suggestions',
  searching: 'Searching…',
  resultsPage: 'https://www.asianpaints.com/store-locator.html',
  snapshot: '/data/store-finder.json',
  breadcrumbLabel: 'Breadcrumb',
  mapsKey: '',
};

const FIELDS = {
  title: 'title',
  placeholder: 'placeholder',
  'search label': 'searchLabel',
  'desktop image': 'desktopImage',
  'mobile image': 'mobileImage',
  'invalid location text': 'invalid',
  'no store found text': 'none',
  'empty text': 'empty',
  'suggestions label': 'suggestions',
  'searching text': 'searching',
  'results page': 'resultsPage',
  snapshot: 'snapshot',
  'breadcrumb label': 'breadcrumbLabel',
  'maps api key': 'mapsKey',
};

let uid = 0;

function readModel(block) {
  const fields = {};
  const crumbs = [];
  let inCrumbs = false;
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const first = text(cells[0]).toLowerCase();
    if (!inCrumbs && first === 'breadcrumb' && cells.length > 1 && text(cells[1]).toLowerCase() === 'link') {
      inCrumbs = true;
      return;
    }
    if (inCrumbs) {
      if (text(cells[0])) crumbs.push({ row, label: text(cells[0]), link: href(cells[1]) });
      return;
    }
    if (FIELDS[first]) fields[FIELDS[first]] = { row, cell: cells[1] || null };
  });
  return { fields, crumbs };
}

/** the banner: mobile picture, desktop from 992px; eager (it is the LCP) */
function bannerPicture(mobile, desktop) {
  const base = mobile || desktop;
  if (!base) return null;
  const alt = (desktop?.getAttribute('alt') || base.getAttribute('alt') || '').trim();
  const pic = createOptimizedPicture(base.src, alt, true, [{ width: '750' }]);
  const img = pic.querySelector('img');
  img.setAttribute('fetchpriority', 'high');
  img.width = parseInt(base.getAttribute('width'), 10) || (mobile ? 360 : 1440);
  img.height = parseInt(base.getAttribute('height'), 10) || (mobile ? 200 : 340);
  if (desktop && mobile && desktop !== mobile) {
    const desk = createOptimizedPicture(desktop.src, alt, true, [{ width: '2000' }]);
    [...desk.querySelectorAll('source')].reverse().forEach((source) => {
      source.setAttribute('media', DESKTOP);
      source.setAttribute('width', desktop.getAttribute('width') || 1440);
      source.setAttribute('height', desktop.getAttribute('height') || 340);
      pic.prepend(source);
    });
  }
  return pic;
}

export default async function decorate(block) {
  const { fields, crumbs } = readModel(block);
  const moveInstrumentation = await instrumentation();
  const v = fieldReader(fields, DEFAULTS, ['resultsPage', 'snapshot']);
  // Google's place suggestions: this block's key, else the one the store-finder / page metadata has
  setMapsKey(v('mapsKey'));
  uid += 1;
  const id = `store-search-${uid}`;

  /* ---------- breadcrumb (desktop, over the banner) ---------- */
  let nav = null;
  if (crumbs.length) {
    nav = el('nav', 'store-search-breadcrumb', { 'aria-label': v('breadcrumbLabel') });
    const ol = el('ol');
    crumbs.forEach((c, i) => {
      const li = el('li');
      const last = i === crumbs.length - 1;
      const a = el('a', '', { href: c.link || (last ? window.location.pathname : null) });
      a.textContent = c.label;
      if (last) a.setAttribute('aria-current', 'page');
      moveInstrumentation(c.row, li);
      li.append(a);
      ol.append(li);
    });
    nav.append(ol);
  }

  /* ---------- banner ---------- */
  const banner = el('div', 'store-search-banner');
  const pic = bannerPicture(
    fields.mobileImage?.cell?.querySelector('img'),
    fields.desktopImage?.cell?.querySelector('img'),
  );
  const h1 = el('h1', 'store-search-title', { id: `${id}-title` });
  h1.textContent = v('title');
  if (fields.title) moveInstrumentation(fields.title.row, h1);

  const form = el('form', 'store-search-form', { role: 'search', 'aria-labelledby': h1.id });
  const field = el('div', 'store-search-field');
  const listId = `${id}-list`;
  const input = el('input', 'store-search-input', {
    id: `${id}-input`,
    type: 'text',
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': listId,
    'aria-labelledby': h1.id,
    placeholder: v('placeholder'),
    autocomplete: 'off',
    enterkeyhint: 'search',
    spellcheck: 'false',
  });
  const submit = el('button', 'store-search-submit', { type: 'submit', 'aria-label': v('searchLabel') });
  submit.append(el('span', 'store-search-submit-icon', { 'aria-hidden': 'true' }));
  const spinner = el('span', 'store-search-spinner', { 'aria-hidden': 'true' });
  spinner.textContent = '↻';
  field.append(input, submit, spinner);
  const listbox = el('ul', 'store-search-results', {
    id: listId, role: 'listbox', 'aria-label': v('suggestions'), hidden: true,
  });
  const invalid = el('p', 'store-search-error is-invalid', { id: `${id}-invalid`, hidden: true });
  invalid.textContent = v('invalid');
  const none = el('p', 'store-search-error is-none', { id: `${id}-none`, hidden: true });
  none.textContent = v('none');
  const empty = el('p', 'store-search-error is-invalid', { id: `${id}-empty`, hidden: true });
  empty.textContent = v('empty');
  form.append(field, listbox, invalid, none, empty);
  const status = el('p', 'store-search-sr-only', { role: 'status', 'aria-live': 'polite' });

  if (pic) banner.append(pic);
  banner.append(h1, form, status);
  block.replaceChildren(...[nav, banner].filter(Boolean));

  /* ---------- messages ---------- */
  const showError = (node) => {
    [invalid, none, empty].forEach((n) => { n.hidden = n !== node; });
    if (node) {
      input.setAttribute('aria-describedby', node.id);
      if (node !== none) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
      status.textContent = node.textContent;
    } else {
      input.removeAttribute('aria-describedby');
      input.removeAttribute('aria-invalid');
    }
  };
  const busy = (on) => {
    field.classList.toggle('is-busy', on);
    if (on) status.textContent = v('searching');
  };
  // the source swaps the magnifier for a chevron once there is text
  const syncIcon = () => submit.classList.toggle('has-text', input.value.trim().length > 0);

  /* ---------- suggestions (APG combobox, list autocomplete) ---------- */
  let cities = null;
  const loadCities = () => {
    if (!cities) {
      cities = cityNames(v('snapshot'));
    }
    return cities;
  };
  let options = [];
  let active = -1;
  let token = null;

  const close = () => {
    listbox.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };
  const setActive = (i) => {
    const items = [...listbox.children];
    items.forEach((li, n) => li.setAttribute('aria-selected', String(n === i)));
    active = i;
    if (i >= 0 && items[i]) {
      input.setAttribute('aria-activedescendant', items[i].id);
      items[i].scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  };
  const render = (list) => {
    options = list;
    listbox.replaceChildren(...list.map((o, i) => {
      const li = el('li', 'store-search-option', { id: `${listId}-${i}`, role: 'option', 'aria-selected': 'false' });
      li.textContent = o.label;
      // mousedown: pick before the input's blur closes the list
      li.addEventListener('mousedown', (e) => { e.preventDefault(); });
      // eslint-disable-next-line no-use-before-define
      li.addEventListener('click', () => choose(i));
      return li;
    }));
    const show = list.length > 0 && document.activeElement === input;
    listbox.hidden = !show;
    input.setAttribute('aria-expanded', String(show));
    active = -1;
    input.removeAttribute('aria-activedescendant');
  };

  // Google's place suggestions when a Maps key is authored (store-finder registers it)
  const googleSuggestions = async (query) => {
    if (!hasMapsKey()) return [];
    const maps = await loadMaps();
    const places = maps && (maps.places || (maps.importLibrary && await maps.importLibrary('places')));
    if (!places) return [];
    try {
      if (places.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
        token = token || new places.AutocompleteSessionToken();
        const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query, includedRegionCodes: ['in'], sessionToken: token,
        });
        return suggestions.filter((s) => s.placePrediction).slice(0, 5).map((s) => ({
          label: s.placePrediction.text.toString(),
          query: s.placePrediction.text.toString(),
          prediction: s.placePrediction,
        }));
      }
      if (places.AutocompleteService) {
        const service = new places.AutocompleteService();
        const res = await new Promise((resolve) => {
          service.getPlacePredictions({ input: query, componentRestrictions: { country: 'in' } }, (r) => resolve(r || []));
        });
        return res.slice(0, 5).map((p) => ({ label: p.description, query: p.description }));
      }
    } catch (e) {
      // Places is not enabled for the key: the city list still works
    }
    return [];
  };

  let typed = 0;
  const suggest = async () => {
    typed += 1;
    const mine = typed;
    const q = input.value.trim();
    if (!q) { render([]); return; }
    const local = (await loadCities())
      .filter((c) => key(c).includes(key(q)))
      .map((c) => ({ label: c, query: c }));
    if (mine !== typed) return;
    render(local);
    const remote = await googleSuggestions(q);
    if (mine !== typed || !remote.length) return;
    const seen = new Set(local.map((o) => key(o.label)));
    render([...local, ...remote.filter((o) => !seen.has(key(o.label)))]);
  };
  let timer;
  input.addEventListener('input', () => {
    syncIcon();
    showError(null);
    clearTimeout(timer);
    timer = setTimeout(suggest, 150);
  });
  input.addEventListener('focus', () => { syncIcon(); loadCities(); });
  input.addEventListener('blur', () => setTimeout(close, 100));

  /* ---------- search ---------- */
  const run = (query, at = null) => {
    close();
    const place = query.trim();
    if (!place) { showError(empty); input.focus(); return; }
    showError(null);
    busy(true);
    const handled = !document.dispatchEvent(new CustomEvent(SEARCH_EVENT, {
      // the results are right below: no scroll, focus stays in the box (as the source)
      cancelable: true,
      detail: {
        query: place, at, from: 'store-search', scroll: false,
      },
    }));
    if (!handled) {
      // no store-finder here: the results page reads ?q= (as the source)
      busy(false);
      const url = new URL(v('resultsPage'), window.location.href);
      url.searchParams.set('q', place);
      window.location.assign(url.href);
    }
  };

  async function choose(i) {
    const o = options[i];
    if (!o) return;
    input.value = o.query;
    syncIcon();
    let at = null;
    if (o.prediction?.toPlace) {
      try {
        const placeObj = o.prediction.toPlace();
        await placeObj.fetchFields({ fields: ['location'] });
        if (placeObj.location) at = { lat: placeObj.location.lat(), lng: placeObj.location.lng() };
      } catch (e) { /* geocoded from the text instead */ }
      token = null;
    }
    run(o.query, at);
  }

  input.addEventListener('keydown', (e) => {
    const open = !listbox.hidden && options.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { suggest(); return; }
      setActive(active < options.length - 1 ? active + 1 : 0);
    } else if (e.key === 'ArrowUp') {
      if (!open) return;
      e.preventDefault();
      setActive(active > 0 ? active - 1 : options.length - 1);
    } else if (e.key === 'Enter' && open && active >= 0) {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); close(); } else if (input.value) { input.value = ''; syncIcon(); }
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run(input.value);
  });

  // a city card (or another search) fills the box, as on the source
  document.addEventListener(SEARCH_EVENT, (e) => {
    if (e.detail?.from === 'store-search') return;
    // the source sets the value by script: the icon changes only on focus / typing
    input.value = e.detail?.query || '';
    submit.classList.remove('has-text');
    showError(null);
    busy(true);
  });
  // the store-finder's answer: the source's messages, and (mobile) the box moves over the map
  document.addEventListener(RESULT_EVENT, (e) => {
    e.preventDefault();
    busy(false);
    const { reason } = e.detail || {};
    if (reason === 'invalid') { showError(invalid); return; }
    block.classList.add('is-searched');
    showError(reason === 'none' ? none : null);
    // the store-finder announces the result count
    if (reason !== 'none') status.textContent = '';
  });
  const q = new URLSearchParams(window.location.search).get('q');
  if (q) input.value = q;
}
