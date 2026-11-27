import { createOptimizedPicture, getMetadata } from '../../scripts/aem.js';
import {
  pushAdobeCalculatorEvents,
  pushAdobeCtaClickEvent,
  pushAdobeFormEvents,
  pushAdobeProductTitleClick,
} from '../../scripts/analytics_1.js';

/**
 * festive-palette — "Find the Diwali look for your walls": a start screen,
 * two picture questions (decor personality, festive mood), then a lead form.
 *
 * Authoring (DA table): label | value rows, then two repeating sections, each
 * starting with a header row:
 *   Personality | Value | Desktop image | Mobile image
 *   Mood | Value | Desktop image | Mobile image
 * All texts come from the table (nothing is hard-coded). Labels are matched
 * without case and without "(…)" hints, so a row can read
 * "Combination title ({n} = combination number)". Rows the block does not
 * know (e.g. the "START SCREEN" group headings) are ignored.
 *
 * Lead form: posted with the site's scripts/form-submit-common.js (its
 * saveToDB / pushToSalesforce endpoints), like the site's other lead forms.
 * "Skip form" = true leaves the form out: the last question's Next goes
 * straight to the results and no lead is posted. It is set on the block as
 * data-attr-skip-form="true|false" and read on that click, so a script such
 * as Adobe Target can change it to show / skip the form.
 *
 * Result: after the lead (or the last question when the form is skipped), the
 * "Recommendations endpoint" is called with
 * ?personality=…&mood=… (the picked values, "-" sent as "_") and every
 * RecomendationN object of the response becomes a combination card.
 */

// label | value rows (label without case and "(…)" hints -> field)
const FIELDS = {
  // start screen
  'start title': 'title',
  'start text': 'text',
  'start button label': 'startLabel',
  'desktop background image': 'bgImage',
  'mobile background image': 'bgMobileImage',
  'start screen tint': 'tintHome',
  'questions screen tint': 'tintSteps',
  'form screen tint': 'tintForm',
  'result screen tint': 'tintResult',
  // questions
  'previous button label': 'previousLabel',
  'next button label': 'nextLabel',
  'question 1 number': 'step1Number',
  'question 1 text': 'step1Question',
  'question 2 number': 'step2Number',
  'question 2 text': 'step2Question',
  'selected message': 'selectedLabel',
  'slide dot label': 'slideLabel',
  // form
  'skip form': 'skipForm',
  'form title': 'formTitle',
  'name label': 'nameLabel',
  'name placeholder': 'namePlaceholder',
  'name error': 'nameError',
  'email label': 'emailLabel',
  'email placeholder': 'emailPlaceholder',
  'email error': 'emailError',
  'mobile number label': 'mobileLabel',
  'mobile number placeholder': 'mobilePlaceholder',
  'mobile number error': 'mobileError',
  'country code': 'countryCode',
  'pin code label': 'pinLabel',
  'pin code placeholder': 'pinPlaceholder',
  'pin code error': 'pinError',
  'required field error': 'requiredError',
  'service question': 'question',
  'service question options': 'questionOptions',
  disclaimer: 'disclaimer',
  'submit button label': 'submitLabel',
  'submitting message': 'submittingText',
  'new tab note': 'newTabNote',
  // error screen
  'error title': 'errorTitle',
  'error text': 'errorText',
  'error button label': 'errorBackLabel',
  // result screen
  'restart button label': 'restartLabel',
  'result title': 'resultTitle',
  'combination title': 'combinationLabel',
  'goes well with title': 'goesWellLabel',
  'texture label': 'textureLabel',
  'wallpaper label': 'wallpaperLabel',
  'view similar shades label': 'similarShadesLabel',
  'view similar shades link': 'similarShadesLink',
  'pdf text': 'pdfText',
  'pdf button label': 'pdfLabel',
  'pdf file': 'pdfLink',
  'pdf file name': 'pdfFileName',
  'pdf greeting': 'pdfGreeting',
  'pdf title': 'pdfTitle',
  'pdf personality label': 'pdfPersonalityLabel',
  'pdf mood label': 'pdfMoodLabel',
  'pdf palette title': 'pdfPaletteTitle',
  'pdf footer logo': 'pdfFooterLogo',
  'pdf footer text': 'pdfFooterText',
  'pdf phone': 'pdfPhone',
  'pdf decoration top': 'pdfDecoTop',
  'pdf decoration right': 'pdfDecoRight',
  'pdf decoration bottom': 'pdfDecoBottom',
  'show services card': 'servicesShow',
  'services desktop image': 'servicesImage',
  'services mobile image': 'servicesMobileImage',
  'services card label': 'servicesLabel',
  'services link': 'servicesLink',
  'services popup form': 'servicesPopup',
  // lead + recommendations API
  'campaign id': 'campaignId',
  'lead node': 'leadNode',
  'recommendations endpoint': 'recommendationsEndpoint',
};

// earlier label names, still read
const ALIASES = {
  title: 'title',
  text: 'text',
  'start label': 'startLabel',
  'background image': 'bgImage',
  'previous label': 'previousLabel',
  'next label': 'nextLabel',
  'step 1 number': 'step1Number',
  'step 1 question': 'step1Question',
  'step 2 number': 'step2Number',
  'step 2 question': 'step2Question',
  'selected label': 'selectedLabel',
  'slide label': 'slideLabel',
  'mobile label': 'mobileLabel',
  'mobile placeholder': 'mobilePlaceholder',
  'mobile error': 'mobileError',
  'required error': 'requiredError',
  question: 'question',
  'question options': 'questionOptions',
  'submit label': 'submitLabel',
  'submitting text': 'submittingText',
  'error back label': 'errorBackLabel',
  'restart label': 'restartLabel',
  'combination label': 'combinationLabel',
  'goes well with label': 'goesWellLabel',
  'similar shades label': 'similarShadesLabel',
  'similar shades link': 'similarShadesLink',
  'pdf label': 'pdfLabel',
  'pdf link': 'pdfLink',
  'services button link': 'servicesLink',
  'services image': 'servicesImage',
};

// repeating sections: header row text -> list, column header -> key
const SECTIONS = {
  personality: {
    name: 'personalities',
    columns: {
      personality: 'name',
      value: 'value',
      image: 'image',
      'desktop image': 'image',
      'mobile image': 'mobile',
    },
  },
  mood: {
    name: 'moods',
    columns: {
      mood: 'name',
      value: 'value',
      image: 'image',
      'desktop image': 'image',
      'mobile image': 'mobile',
    },
  },
};

const VALID = {
  name: (v) => /^([a-zA-Z]+\s?)*[a-zA-Z]+$/.test(v.trim()),
  email: (v) => /^\b[A-Z0-9._%-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b$/i.test(v.trim()),
  mobile: (v) => /^[6-9]\d{9}$/.test(v),
  pin: (v) => /^[1-9]\d{5}$/.test(v),
};

const MOBILE = '(max-width: 899px)';
const ICON_ARROW = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_RESTART = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_DOWNLOAD = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M3 13.5h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_EXTERNAL = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><path d="M3 9l6-6M4 3h5v5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="11" fill="#fff"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#1d1d1f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let uid = 0;

const trackStart = () => {
  pushAdobeCalculatorEvents({
    event: 'calc_start',
    flowType: 'Diwali Quiz',
  });
};

const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
/** "Combination title ({n} = number)" -> "combination title" */
const labelKey = (node) => text(node)
  .replace(/\([^)]*\)/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();
const firstImg = (cell) => cell?.querySelector('img') || null;
const href = (cell) => cell?.querySelector('a[href]')?.getAttribute('href') || text(cell);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
  });
  return node;
}

function readModel(block) {
  const fields = {};
  const lists = { personalities: [], moods: [] };
  let section = null;
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const first = labelKey(cells[0]);
    const header = SECTIONS[first];
    if (header && cells.length > 1 && header.columns[labelKey(cells[1])]) {
      section = {
        ...header,
        keys: cells.map((c) => header.columns[labelKey(c)] || ''),
      };
      return;
    }
    if (!section) {
      const field = FIELDS[first] || ALIASES[first];
      if (field) fields[field] = { row, cell: cells[1] || null };
      return;
    }
    const item = { row };
    section.keys.forEach((k, i) => {
      if (k) item[k] = cells[i] || null;
    });
    if (text(item.name)) lists[section.name].push(item);
  });
  return { fields, ...lists };
}

/** "Label=value; Label" -> [{ label, value }] */
const options = (list) => list
  .split(/\s*;\s*/)
  .filter(Boolean)
  .map((part) => {
    const [label, value] = part.split('=').map((s) => s.trim());
    return { label, value: value || label };
  });

/** an authored image as a <picture>; `mobile` wins below the breakpoint */
function picture(img, { mobile, eager = false } = {}) {
  if (!img && !mobile) return null;
  const base = img || mobile;
  const pic = createOptimizedPicture(base.src, base.alt || '', eager, [
    { width: '750' },
  ]);
  if (mobile && img && mobile !== img) {
    const mob = createOptimizedPicture(mobile.src, '', eager, [
      { width: '750' },
    ]);
    [...mob.querySelectorAll('source')].reverse().forEach((source) => {
      source.setAttribute('media', MOBILE);
      pic.prepend(source);
    });
  }
  return pic;
}

/** a DA image URL at a given width (for the background layer); keeps the
 * origin, so absolute images (e.g. https://beta.asianpaints.com/content/dam/…)
 * load on any host */
const sized = (img, width) => {
  const url = new URL(img.src, window.location.href);
  return `${url.origin}${url.pathname}?width=${width}&format=webply&optimize=medium`;
};

/** a pill CTA with the arrow icon (arrow first for "previous") */
function ctaButton(
  className,
  label,
  { back = false, type = 'button', attrs = {} } = {},
) {
  const button = el('button', `festive-palette-cta ${className}`, {
    type,
    ...attrs,
  });
  const span = el('span', 'festive-palette-cta-label');
  span.textContent = label;
  const icon = el('span', `festive-palette-cta-icon${back ? ' is-back' : ''}`, {
    'aria-hidden': 'true',
  });
  icon.innerHTML = ICON_ARROW;
  if (back) button.append(icon, span);
  else button.append(span, icon);
  return button;
}

/** an authored rich-text cell as paragraphs (keeps <strong>, links…) */
function richText(cell) {
  if (!cell || !text(cell)) return [];
  const copy = cell.cloneNode(true);
  if (copy.querySelector('p')) return [...copy.children];
  const p = el('p');
  p.append(...copy.childNodes);
  return [p];
}

/* ---------- recommendations (API response) ---------- */

const str = (value) => (value === undefined || value === null ? '' : String(value).trim());

/** "#abc" / "125497" / "#125497" -> "#125497" ('' if not a colour) */
function toHex(value) {
  const m = str(value).match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return '';
  return `#${m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1]}`;
}

/** dark shades get white text */
const isDark = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
};

/**
 * { Recommendation1: {…}, Recommendation2: {…} } (also "Recomendation",
 * an array, or either under "data") -> [{ shades, texture, wallpaper }].
 * Swatch images ("/content/dam/…") are resolved against `base`, the
 * endpoint's URL, so they load on any host; the *_url page links are used
 * exactly as the response sends them.
 */
function toRecommendations(json, base = window.location.href) {
  const absolute = (value) => {
    const url = str(value);
    if (!url) return '';
    try {
      return new URL(url, base).href;
    } catch (e) {
      return url;
    }
  };
  const root = json && !Array.isArray(json) && json.data && typeof json.data === 'object'
    ? json.data
    : json;
  const list = Array.isArray(root)
    ? root
    : Object.keys(root || {})
      .map((key) => [key, key.match(/^recomm?endation\s*(\d+)$/i)])
      .filter(([, m]) => m)
      .sort((a, b) => a[1][1] - b[1][1])
      .map(([key]) => root[key]);
  const entity = (r, key) => ({
    name: str(r[`${key}_entityName`]),
    code: str(r[`${key}_entityCode`]),
    image: absolute(r[`${key}_swatchImage`]),
    url: str(r[`${key}_url`]),
  });
  return list
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({
      shades: [1, 2]
        .map((n) => ({
          ...entity(r, `shade${n}`),
          hex: toHex(r[`shade${n}_hexCode`]),
        }))
        .filter((shade) => shade.name || shade.hex),
      texture: entity(r, 'texture'),
      wallpaper: entity(r, 'wallpaper'),
    }))
    .filter((r) => r.shades.length);
}

/** the picked values as API params ("classic-host" -> "classic_host") */
const apiValue = (value) => value.replace(/-/g, '_');

/**
 * A horizontal scroller with dots (mobile): the item scrolled to the start is
 * "current"; dots scroll to an item. Hidden on desktop by CSS.
 */
function slider(list, items, { label, dotLabel }) {
  const dots = el('div', 'festive-palette-dots', {
    role: 'group',
    'aria-label': label,
  });
  const dotButtons = items.map((item, i) => {
    const dot = el('button', 'festive-palette-dot', {
      type: 'button',
      'aria-label': dotLabel.replace('{n}', i + 1),
    });
    dots.append(dot);
    return dot;
  });
  let current = 0;
  const setCurrent = (i) => {
    current = i;
    // the current card is the large one on mobile (CSS)
    items.forEach((item, j) => item.classList.toggle('is-current', j === i));
    dotButtons.forEach((dot, j) => {
      if (j === i) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  };
  // the item nearest the start of the track is current
  const update = () => {
    const left = list.scrollLeft;
    let best = 0;
    items.forEach((item, j) => {
      if (
        Math.abs(item.offsetLeft - list.offsetLeft - left)
        < Math.abs(items[best].offsetLeft - list.offsetLeft - left)
      ) best = j;
    });
    if (left + list.clientWidth >= list.scrollWidth - 2) best = items.length - 1;
    if (best !== current) setCurrent(best);
  };
  // while goTo() scrolls, its target stays current (no flicker of the cards
  // passed on the way); released once the scrolling has settled
  let locked = false;
  let settle = 0;
  const release = () => {
    clearTimeout(settle);
    settle = setTimeout(() => {
      locked = false;
      update();
    }, 150);
  };
  const goTo = (i, smooth = true) => {
    const item = items[i];
    if (!item) return;
    const pad = parseFloat(getComputedStyle(list).paddingInlineStart) || 0;
    locked = true;
    setCurrent(i);
    list.scrollTo({
      left: item.offsetLeft - list.offsetLeft - pad,
      behavior: smooth && !reducedMotion() ? 'smooth' : 'auto',
    });
    release();
  };
  let raf = 0;
  list.addEventListener(
    'scroll',
    () => {
      if (locked) {
        release();
        return;
      }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    },
    { passive: true },
  );
  dotButtons.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));
  setCurrent(0);
  return { dots, goTo };
}

/* ---------- lead API: the site's scripts/form-submit-common.js ---------- */

/**
 * The lead is posted with the site's form-submit-common.js (saveToDB, then
 * pushToSalesforce), like the site's other lead forms, so its endpoints are
 * the ones defined there. Loaded on demand; if it cannot load, submitting
 * shows the error screen (and the console says why).
 */
async function loadLeadApi() {
  try {
    const forms = await import('../../scripts/form-submit-common.js');
    const {
      buildLeadPayload,
      saveToDB,
      pushToSalesforce,
      checkCookieValues,
      setFormFieldsToCookie,
    } = forms;
    if (buildLeadPayload && saveToDB && pushToSalesforce) {
      return {
        buildLeadPayload,
        saveToDB,
        pushToSalesforce,
        checkCookieValues,
        setFormFieldsToCookie,
      };
    }
    throw new Error(
      'buildLeadPayload, saveToDB or pushToSalesforce is missing',
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      'festive-palette: scripts/form-submit-common.js could not be loaded, the lead cannot be posted',
      e,
    );
    return null;
  }
}

export default async function decorate(block) {
  const { fields, personalities, moods } = readModel(block);
  uid += 1;
  const id = `festive-palette-${uid}`;
  // authored text of a row ('' when the row is missing)
  const v = (key) => text(fields[key]?.cell);
  const newTabNote = v('newTabNote');
  // data-attr-skip-form (set below from "Skip form") is read when it is needed,
  // not now, so a script such as Adobe Target can change it
  const skipForm = () => block.dataset.attrSkipForm === 'true';
  // the lead script: loaded once, on first use (not on the render path)
  let leadApiLoad;
  const getLeadApi = () => {
    if (!leadApiLoad) leadApiLoad = loadLeadApi();
    return leadApiLoad;
  };

  /* ---------- background ---------- */
  const bgDesk = firstImg(fields.bgImage?.cell);
  const bgMob = firstImg(fields.bgMobileImage?.cell);
  const bg = el('div', 'festive-palette-bg', { 'aria-hidden': 'true' });
  if (bgDesk || bgMob) {
    const pic = el('picture');
    if (bgDesk && bgMob) {
      pic.append(
        el('source', '', {
          media: '(min-width: 900px)',
          srcset: sized(bgDesk, 2000),
          type: 'image/webp',
        }),
      );
    }
    pic.append(
      el('img', '', {
        src: sized(bgMob || bgDesk, bgMob ? 750 : 2000),
        alt: '',
        loading: 'eager',
        fetchpriority: 'high',
      }),
    );
    bg.append(pic);
  }

  const live = el('p', 'festive-palette-sr-only', {
    'aria-live': 'polite',
    role: 'status',
  });
  const sections = [];
  // each screen's authored tint over the background (a colour such as
  // #33050480, or a gradient); values that are not valid CSS are ignored
  const tint = (key) => {
    const value = v(key);
    return value && window.CSS?.supports?.('background', value) ? value : '';
  };
  const tints = {
    home: tint('tintHome'),
    'step-1': tint('tintSteps'),
    'step-2': tint('tintSteps'),
    form: tint('tintForm'),
    result: tint('tintResult'),
  };
  const setTint = (screen) => {
    if (tints[screen]) block.style.setProperty('--festive-palette-tint', tints[screen]);
    else block.style.removeProperty('--festive-palette-tint');
  };

  let placeServices = () => {};
  const showSection = (section, focus = true) => {
    sections.forEach((s) => {
      s.hidden = s !== section;
    });
    block.dataset.screen = section.dataset.screen;
    setTint(section.dataset.screen);
    placeServices();
    if (focus) {
      section.querySelector('[data-focus]')?.focus({ preventScroll: true });
      if (block.getBoundingClientRect().top < 0) {
        block.scrollIntoView({
          behavior: reducedMotion() ? 'auto' : 'smooth',
          block: 'start',
        });
      }
    }
  };

  /* ---------- start screen ---------- */
  const home = el('section', 'festive-palette-home', {
    'aria-labelledby': `${id}-title`,
    'data-screen': 'home',
  });
  const title = el('h2', 'festive-palette-title', {
    id: `${id}-title`,
    tabindex: '-1',
    'data-focus': true,
  });
  const titleCell = fields.title?.cell;
  if (titleCell && text(titleCell)) {
    // keep the authored line break(s)
    const p = titleCell.querySelector('p') || titleCell;
    // a space goes with each break, for mobile, where the breaks are not shown
    [...p.childNodes].forEach((n) => (n.nodeName === 'BR'
      ? title.append(' ', el('br'))
      : title.append(document.createTextNode(n.textContent))));
  }
  const intro = el('p', 'festive-palette-text');
  intro.textContent = v('text');
  const start = ctaButton(
    'festive-palette-cta-white festive-palette-start',
    v('startLabel'),
  );
  home.append(title, intro, start);
  sections.push(home);

  /* ---------- question steps ---------- */
  const makeStep = (n, key, list) => {
    const section = el(
      'section',
      `festive-palette-step festive-palette-step-${key}`,
      {
        'aria-labelledby': `${id}-q${n}`,
        hidden: true,
        'data-screen': `step-${n}`,
      },
    );
    const heading = el('h2', 'festive-palette-question', {
      id: `${id}-q${n}`,
      tabindex: '-1',
      'data-focus': true,
    });
    const number = el('span', 'festive-palette-number');
    number.textContent = v(`step${n}Number`);
    const question = el('span', 'festive-palette-question-text');
    question.textContent = v(`step${n}Question`);
    heading.append(number, ' ', question);

    const cards = el('ul', 'festive-palette-cards', {
      'aria-labelledby': `${id}-q${n}`,
    });
    const items = list.map((item, i) => {
      const name = text(item.name);
      const value = text(item.value) || name;
      const li = el('li', 'festive-palette-card');
      const button = el('button', 'festive-palette-card-button', {
        type: 'button',
        'aria-pressed': 'false',
      });
      const media = el('span', 'festive-palette-card-media');
      const pic = picture(firstImg(item.image), {
        mobile: firstImg(item.mobile),
        eager: n === 1 && i < 3,
      });
      if (pic) {
        // the option name labels the card; its picture is decorative
        pic.querySelector('img').alt = '';
        media.append(pic);
      }
      const check = el('span', 'festive-palette-card-check', {
        'aria-hidden': 'true',
      });
      check.innerHTML = ICON_CHECK;
      media.append(check);
      const label = el('span', 'festive-palette-card-name');
      label.textContent = name;
      button.append(media, label);
      li.append(button);
      cards.append(li);
      return {
        li,
        button,
        name,
        value,
      };
    });

    const nav = el('div', 'festive-palette-nav');
    const prev = ctaButton(
      'festive-palette-cta-white festive-palette-prev',
      v('previousLabel'),
      { back: true },
    );
    const next = ctaButton(
      'festive-palette-cta-white festive-palette-next',
      v('nextLabel'),
      { attrs: { 'aria-disabled': 'true' } },
    );
    nav.append(prev, next);
    const sl = slider(
      cards,
      items.map((it) => it.li),
      { label: question.textContent, dotLabel: v('slideLabel') },
    );
    const media = el('div', 'festive-palette-step-media');
    media.append(cards, sl.dots, nav);
    section.append(heading, media);
    sections.push(section);
    return {
      n,
      key,
      section,
      items,
      prev,
      next,
      slider: sl,
    };
  };

  const steps = [
    makeStep(1, 'personality', personalities),
    makeStep(2, 'mood', moods),
  ];

  /* ---------- form ---------- */
  const formSection = el('section', 'festive-palette-form-step', {
    'aria-labelledby': `${id}-form-title`,
    hidden: true,
    'data-screen': 'form',
  });
  const formTitle = el('h2', 'festive-palette-form-title', {
    id: `${id}-form-title`,
    tabindex: '-1',
    'data-focus': true,
  });
  formTitle.textContent = v('formTitle');
  const form = el('form', 'festive-palette-form', {
    novalidate: true,
    'aria-labelledby': `${id}-form-title`,
  });

  let formStartTracked = false;

  const trackFormStart = (e) => {
    if (formStartTracked) return;

    const target = e.target.closest('input');
    if (!target) return;

    formStartTracked = true;

    pushAdobeFormEvents({
      event: 'form_start',
      formName: v('formTitle'),
      formCampaignId: v('campaignId'),
    });
  };

  form.addEventListener('focusin', trackFormStart);
  form.addEventListener('click', trackFormStart);

  const inputs = {};
  const groups = {};
  const makeField = (def) => {
    const fid = `${id}-${def.key}`;
    const group = el('div', `festive-palette-field is-${def.key}`);
    const label = el('label', 'festive-palette-label', { for: fid });
    const star = el('span', 'festive-palette-required', {
      'aria-hidden': 'true',
    });
    star.textContent = '*';
    label.append(v(`${def.key}Label`), star);
    const input = el('input', 'festive-palette-input', {
      id: fid,
      name: def.key,
      type: def.type,
      autocomplete: def.autocomplete,
      inputmode: def.inputmode,
      maxlength: def.maxlength,
      placeholder: v(`${def.key}Placeholder`),
      required: true,
      'aria-describedby': `${fid}-error`,
    });
    const error = el('p', 'festive-palette-error', { id: `${fid}-error` });
    if (def.key === 'mobile') {
      const phone = el('div', 'festive-palette-phone');
      const prefix = el('span', 'festive-palette-phone-prefix');
      prefix.append(
        el('span', 'festive-palette-flag', { 'aria-hidden': 'true' }),
        v('countryCode'),
      );
      phone.append(prefix, input);
      group.append(label, phone, error);
    } else {
      group.append(label, input, error);
    }
    if (def.allow) {
      input.addEventListener('keydown', (e) => {
        const typed = e.key.length === 1 && !e.ctrlKey && !e.metaKey;
        if (typed && !def.allow.test(e.key)) e.preventDefault();
      });
    }
    inputs[def.key] = input;
    groups[def.key] = group;
    return group;
  };
  const pair = el('div', 'festive-palette-row');
  pair.append(
    makeField({
      key: 'mobile',
      type: 'tel',
      autocomplete: 'tel-national',
      inputmode: 'numeric',
      maxlength: '10',
      allow: /[0-9]/,
    }),
    makeField({
      key: 'pin',
      type: 'text',
      autocomplete: 'postal-code',
      inputmode: 'numeric',
      maxlength: '6',
      allow: /[0-9]/,
    }),
  );

  // a radiogroup, not a fieldset: iOS Safari always draws a legend on the
  // fieldset's border, so the question can't sit beside the pills there
  const choice = el('div', 'festive-palette-choice', {
    role: 'radiogroup',
    'aria-labelledby': `${id}-choice-legend`,
    'aria-describedby': `${id}-choice-error`,
  });
  const legend = el('span', 'festive-palette-choice-legend', {
    id: `${id}-choice-legend`,
  });
  legend.textContent = v('question');
  const choiceOptions = el('div', 'festive-palette-choice-options');
  const radios = options(v('questionOptions')).map((opt, i) => {
    const label = el('label', 'festive-palette-pill');
    const input = el('input', 'festive-palette-pill-input', {
      type: 'radio',
      name: `${id}-service`,
      value: opt.value,
      required: i === 0,
    });
    const span = el('span', 'festive-palette-pill-text');
    span.textContent = opt.label;
    label.append(input, span);
    choiceOptions.append(label);
    return input;
  });
  const choiceError = el('p', 'festive-palette-error', {
    id: `${id}-choice-error`,
  });
  choice.append(legend, choiceOptions, choiceError);
  choice.hidden = !radios.length;
  radios.forEach((r) => r.addEventListener('change', () => {
    choiceError.textContent = '';
    choice.classList.remove('is-invalid');
  }));

  const submit = ctaButton(
    'festive-palette-cta-gradient festive-palette-submit',
    v('submitLabel'),
    { type: 'submit' },
  );
  submit.append(
    el('span', 'festive-palette-spinner', { 'aria-hidden': 'true' }),
  );
  form.append(
    makeField({
      key: 'name',
      type: 'text',
      autocomplete: 'name',
      maxlength: '30',
      allow: /[a-zA-Z ]/,
    }),
    makeField({
      key: 'email',
      type: 'email',
      autocomplete: 'email',
      inputmode: 'email',
    }),
    pair,
    choice,
    submit,
  );
  const formBox = el('div', 'festive-palette-form-box');
  formBox.append(form);

  const terms = el('div', 'festive-palette-terms');
  const disclaimerCell = fields.disclaimer?.cell;
  if (disclaimerCell && text(disclaimerCell)) {
    const copy = disclaimerCell.cloneNode(true);
    terms.append(
      ...(copy.querySelector('p')
        ? copy.childNodes
        : [Object.assign(el('p'), { textContent: text(copy) })]),
    );
    terms.querySelectorAll('a[href]').forEach((a) => {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      const note = el('span', 'festive-palette-sr-only');
      note.textContent = ` ${newTabNote}`;
      a.addEventListener('click', () => {
        const ctaText = a.cloneNode(true);
        ctaText.querySelectorAll('.festive-palette-sr-only').forEach((n) => n.remove());
        pushAdobeCtaClickEvent({
          event: 'cta_link_text',
          destinationUrl: a.href,
          cta: ctaText.textContent.trim(),
          parentTitle: v('formTitle'),
        });
      });
      a.append(note);
    });
  }

  // error panel (lead failed)
  const errorPanel = el('div', 'festive-palette-form-error', { hidden: true });
  const errorTitle = el('p', 'festive-palette-error-title', { tabindex: '-1' });
  errorTitle.textContent = v('errorTitle');
  const errorText = el('p', 'festive-palette-error-text');
  errorText.textContent = v('errorText');
  const errorBack = ctaButton(
    'festive-palette-cta-white festive-palette-error-back',
    v('errorBackLabel'),
    { back: true },
  );
  errorPanel.append(errorTitle, errorText, errorBack);

  formSection.append(formTitle, formBox, errorPanel, terms);
  sections.push(formSection);

  /* ---------- result ---------- */
  const result = el('section', 'festive-palette-result', {
    'aria-labelledby': `${id}-result-title`,
    hidden: true,
    'data-screen': 'result',
  });
  const restart = el('button', 'festive-palette-restart', { type: 'button' });
  const restartIcon = el('span', 'festive-palette-restart-icon', {
    'aria-hidden': 'true',
  });
  restartIcon.innerHTML = ICON_RESTART;
  const restartLabel = el('span', 'festive-palette-restart-label');
  restartLabel.textContent = v('restartLabel');
  restart.append(restartIcon, restartLabel);
  const resultTitle = el('h2', 'festive-palette-result-title', {
    id: `${id}-result-title`,
    tabindex: '-1',
    'data-focus': true,
  });
  resultTitle.textContent = v('resultTitle');
  const combos = el('ul', 'festive-palette-combos', {
    'aria-labelledby': `${id}-result-title`,
  });
  result.append(restart, resultTitle, combos);

  // picked values, by step key (personality, mood), and the shades of the
  // shown result (analytics of the PDF download)
  const picks = {};
  const pickNames = {};
  let downloadShadeDetails = '';

  // "Download the PDF…": shown when its text or button label is authored; the
  // button builds the PDF of this result (festive-pdf.js), or downloads the
  // authored PDF file when one is set
  let pdfButton = null;
  if (text(fields.pdfText?.cell) || v('pdfLabel')) {
    const pdf = el('div', 'festive-palette-pdf');
    const pdfText = el('div', 'festive-palette-pdf-text');
    pdfText.append(...richText(fields.pdfText?.cell));
    const pdfLink = href(fields.pdfLink?.cell);
    const pdfCta = pdfLink
      ? el(
        'a',
        'festive-palette-cta festive-palette-cta-outline festive-palette-pdf-link',
        {
          href: pdfLink,
          target: '_blank',
          rel: 'noopener noreferrer',
          download: '',
        },
      )
      : el(
        'button',
        'festive-palette-cta festive-palette-cta-outline festive-palette-pdf-link',
        { type: 'button' },
      );
    const pdfLabel = el('span', 'festive-palette-cta-label');
    pdfLabel.textContent = v('pdfLabel');
    pdfCta.append(pdfLabel);
    if (pdfLink) {
      const pdfNote = el('span', 'festive-palette-sr-only');
      pdfNote.textContent = ` ${newTabNote}`;
      pdfCta.append(pdfNote);
    }
    const pdfIcon = el('span', 'festive-palette-cta-icon', {
      'aria-hidden': 'true',
    });
    pdfIcon.innerHTML = ICON_DOWNLOAD;
    pdfCta.append(pdfIcon);
    if (!pdfLink) {
      pdfCta.append(
        el('span', 'festive-palette-spinner', { 'aria-hidden': 'true' }),
      );
      pdfButton = pdfCta;
    }
    pdfCta.addEventListener('click', () => {
      pushAdobeCalculatorEvents({
        event: 'calct_download',
        filter: `${picks.personality || ''}|${picks.mood || ''}`,
        flowType: 'Diwali Quiz',
        productdetails: downloadShadeDetails,
      });
    });

    pdf.append(pdfText, pdfCta);
    result.append(pdf);
  }

  // painting services card: the authored image (its text is part of the
  // picture) as one link that opens the "Book a FREE Site Visit" pop-up, as
  // catalogue-listing's aside card does; shown when "Show services card"
  // is not "hide"/"false"/"no". On mobile it sits below the tool.
  // desktop image, and its mobile version below 900px (either one is enough)
  const servicesImg = firstImg(fields.servicesImage?.cell);
  const servicesMobileImg = firstImg(fields.servicesMobileImage?.cell);
  const servicesShown = !/^(hide|false|no|off)$/i.test(v('servicesShow'));
  let services = null;
  if ((servicesImg || servicesMobileImg) && servicesShown) {
    const servicesLink = href(fields.servicesLink?.cell);
    services = el(servicesLink ? 'a' : 'button', 'festive-palette-services', {
      href: servicesLink || undefined,
      type: servicesLink ? undefined : 'button',
      'aria-haspopup': 'dialog',
      'aria-label': v('servicesLabel') || undefined,
    });
    const servicesPic = picture(servicesImg, { mobile: servicesMobileImg });
    servicesPic.querySelector('img').alt = '';
    services.append(servicesPic);
    services.addEventListener('click', (e) => {
      // the site's exit-intent pop-up (delayed.js); without it, the link's page
      pushAdobeCtaClickEvent({
        event: 'custom_cta_click',
        cta: v('servicesLabel') || '',
        destinationUrl: servicesLink || '',
      });
      if (typeof window.triggerExitIntentModal !== 'function') return;
      e.preventDefault();
      // the authored form page, else the header CTA's, else the page metadata,
      // else the site's own exit-intent form
      const modalPath = href(fields.servicesPopup?.cell)
        || document.querySelector(
          '.trigger-book-free-site-visit-modal[data-modal-path]',
        )?.dataset.modalPath
        || getMetadata('site-visit-modal')
        || undefined;
      window.triggerExitIntentModal(modalPath);
    });
    result.append(services);
  }
  sections.push(result);

  /** the response's page links open in a new tab, as on the texture finder */
  const newTab = (a) => {
    if (!a.hasAttribute('href')) return a;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    const note = el('span', 'festive-palette-sr-only');
    note.textContent = ` ${newTabNote}`;
    a.append(note);
    return a;
  };

  /** a texture / wallpaper tile of a combination */
  const goesItem = (key, item, comboTitle = '') => {
    const wrap = el('div', `festive-palette-goes-item is-${key}`);
    const label = el('p', 'festive-palette-goes-label');
    label.textContent = v(`${key}Label`);
    // always a link; its href comes with the response's <key>_url
    const link = el('a', 'festive-palette-goes-link', {
      href: item.url || undefined,
    });

    link.addEventListener('click', () => {
      pushAdobeProductTitleClick({
        event: 'product_tile_click',
        productSku: item.code || '',
        productName: item.name || '',
        destinationUrl: item.url
          ? new URL(item.url, window.location.origin).href
          : '',
        parentTitle: label.textContent || '',
        title: comboTitle,
      });
    });
    const media = el('span', 'festive-palette-goes-media');
    if (item.image) {
      const img = el('img', '', { src: item.image, alt: '', loading: 'lazy' });
      // a missing swatch leaves the grey tile
      img.addEventListener('error', () => img.remove());
      media.append(img);
    }
    const caption = el('span', 'festive-palette-goes-caption');
    const name = el('span', 'festive-palette-goes-name');
    name.textContent = item.name;
    const arrow = el('span', 'festive-palette-goes-arrow', {
      'aria-hidden': 'true',
    });
    arrow.innerHTML = ICON_EXTERNAL;
    caption.append(name, arrow);
    link.append(media, caption);
    wrap.append(label, newTab(link));
    return wrap;
  };

  const similarShadesLink = href(fields.similarShadesLink?.cell);
  let shown = [];
  const renderCombos = (recommendations) => {
    shown = recommendations;
    // the shades of this result, for the PDF download analytics
    downloadShadeDetails = recommendations
      .map((rec) => rec.shades.map((shade) => `${shade.name} | ${shade.code}`).join(' | '))
      .join(' || ');
    combos.replaceChildren(
      ...recommendations.map((rec, i) => {
        const li = el('li', 'festive-palette-combo');
        const heading = el('h3', 'festive-palette-combo-title');
        heading.textContent = v('combinationLabel').replace('{n}', i + 1);
        const card = el('div', 'festive-palette-combo-card');
        const shades = el('div', 'festive-palette-shades');
        rec.shades.forEach((shade) => {
          const node = el(shade.url ? 'a' : 'div', 'festive-palette-shade', {
            href: shade.url || undefined,
          });
          if (shade.url) {
            node.addEventListener('click', () => {
              pushAdobeCalculatorEvents({
                event: 'calct_product_view',
                filter: `${picks.personality || ''}|${picks.mood || ''}`,
                flowType: 'Diwali Quiz',
                productdetails: `${shade.name} | ${shade.code}`,
                title: heading.textContent,
              });
            });
          }

          if (shade.hex) {
            node.style.setProperty('--festive-palette-shade', shade.hex);
            node.classList.toggle('is-dark', isDark(shade.hex));
          }
          const name = el('span', 'festive-palette-shade-name');
          name.textContent = shade.name;
          const code = el('span', 'festive-palette-shade-code');
          code.textContent = shade.code;
          node.append(name, code);
          shades.append(shade.url ? newTab(node) : node);
        });
        card.append(shades);

        const goes = [
          ['texture', rec.texture],
          ['wallpaper', rec.wallpaper],
        ].filter(([, item]) => item.name || item.image || item.url);
        if (goes.length) {
          const panel = el('div', 'festive-palette-goes');
          const goesTitle = el('p', 'festive-palette-goes-title');
          goesTitle.textContent = v('goesWellLabel');
          const items = el('div', 'festive-palette-goes-items');
          items.append(
            ...goes.map(([key, item]) => goesItem(key, item, heading.textContent)),
          );
          panel.append(goesTitle, items);
          card.append(panel);
        }
        // only the authored link (not the response); {code} / {name} = the first shade
        const first = rec.shades[0];
        const similarUrl = similarShadesLink
          .replace(/\{code\}|%7Bcode%7D/gi, encodeURIComponent(first.code))
          .replace(/\{name\}|%7Bname%7D/gi, encodeURIComponent(first.name));
        // on every card; the href is added once the link is authored
        if (v('similarShadesLabel')) {
          const similar = el('a', 'festive-palette-similar', {
            href: similarUrl || undefined,
          });
          similar.textContent = v('similarShadesLabel');
          similar.addEventListener('click', () => {
            pushAdobeCtaClickEvent({
              event: 'custom_cta_click',
              destinationUrl: similarUrl || '',
              cta: v('similarShadesLabel') || '',
              title: heading.textContent,
            });
          });
          card.append(newTab(similar));
        }
        li.append(heading, card);
        return li;
      }),
    );
    combos.scrollLeft = 0;
  };

  const loadRecommendations = async () => {
    const endpoint = href(fields.recommendationsEndpoint?.cell);
    if (!endpoint) return [];
    const url = new URL(endpoint, window.location.href);
    Object.entries(picks).forEach(([key, value]) => url.searchParams.set(key, apiValue(value)));
    const resp = await fetch(url.href);
    if (!resp.ok) return [];
    return toRecommendations(await resp.json(), url.href);
  };

  block.replaceChildren(bg, ...sections, live);
  block.dataset.screen = 'home';
  setTint('home');
  // the authored "Skip form" as data-attr-skip-form="true|false" (false when
  // not authored), which the last question's Next reads, so a script such as
  // Adobe Target can switch the form on or off; a value already on the block
  // (set by a script before decoration) is kept over the authored one
  if (!block.hasAttribute('data-attr-skip-form')) {
    block.dataset.attrSkipForm = String(v('skipForm').toLowerCase() === 'true');
  }

  placeServices = () => {
    if (!services) return;
    if (window.matchMedia(MOBILE).matches) {
      if (services.previousElementSibling !== block) block.after(services);
    } else if (services.parentElement !== result) {
      result.append(services);
    }
    services.hidden = block.dataset.screen !== 'result';
  };
  placeServices();
  window.matchMedia(MOBILE).addEventListener('change', () => placeServices());

  /* ---------- step wiring (the texture finder's flow) ---------- */
  const setNext = (step, enabled) => step.next.setAttribute('aria-disabled', String(!enabled));
  const resetSliders = () => steps.forEach((s) => s.slider.goTo(0, false));
  const setBusy = (button, busy) => {
    button.classList.toggle('is-busy', busy);
    if (busy) button.setAttribute('aria-busy', 'true');
    else button.removeAttribute('aria-busy');
  };
  // a lead was sent in this visit: the last Next goes straight to the results
  let formPreviouslySubmitted = false;
  // the name sent with that lead: Restart clears the form, the PDF still greets them
  let submittedName = '';

  // tapping a card selects it; tapping the selected card again clears it
  const select = (step, item) => {
    const was = item.li.classList.contains('is-selected');
    step.items.forEach((other) => {
      other.li.classList.remove('is-selected');
      other.button.setAttribute('aria-pressed', 'false');
    });
    if (was) {
      delete picks[step.key];
    } else {
      item.li.classList.add('is-selected');
      item.button.setAttribute('aria-pressed', 'true');
      picks[step.key] = item.value;
      pickNames[step.key] = item.name;
      // mobile: the tapped card slides to the front and becomes the current one
      if (window.matchMedia(MOBILE).matches) step.slider.goTo(step.items.indexOf(item));
      live.textContent = `${v('selectedLabel')}: ${item.name}`;
    }
    setNext(step, !was);
  };

  /* ---------- form wiring ---------- */
  const setError = (key, message) => {
    groups[key].classList.toggle('is-invalid', !!message);
    if (message) inputs[key].setAttribute('aria-invalid', 'true');
    else inputs[key].removeAttribute('aria-invalid');
    groups[key].querySelector('.festive-palette-error').textContent = message || '';
  };
  const validate = (key) => {
    const { value } = inputs[key];
    let message = '';
    if (!value.trim()) message = v('requiredError');
    else if (!VALID[key](value)) message = v(`${key}Error`);
    setError(key, message);
    return !message;
  };
  Object.entries(inputs).forEach(([key, input]) => {
    input.addEventListener('blur', () => {
      if (input.value) validate(key);
    });
    input.addEventListener('input', () => setError(key, ''));
  });

  const selectors = {
    name: `#${id}-name`,
    email: `#${id}-email`,
    mobile: `#${id}-mobile`,
    pincode: `#${id}-pin`,
  };
  const resetForm = () => {
    form.reset();
    Object.keys(inputs).forEach((key) => setError(key, ''));
    choiceError.textContent = '';
    choice.classList.remove('is-invalid');
  };
  // the form's title and disclaimer; left out of the error screen when the
  // form was skipped
  const showFormTexts = (show) => {
    formTitle.hidden = !show;
    terms.hidden = !show;
    if (show) formSection.setAttribute('aria-labelledby', `${id}-form-title`);
    else formSection.removeAttribute('aria-labelledby');
  };
  const showFormError = (withFormTexts = true) => {
    showFormTexts(withFormTexts);
    // the disclaimer belongs to the form: never on the error screen
    terms.hidden = true;
    formBox.hidden = true;
    errorPanel.hidden = false;
    showSection(formSection, false);
    errorTitle.focus({ preventScroll: true });
  };
  const hideFormError = () => {
    showFormTexts(true);
    errorPanel.hidden = true;
    formBox.hidden = false;
  };
  // the form will show after the last question (it may still be switched off
  // by data-attr-skip-form before then)
  const formAhead = () => !skipForm() && !formPreviouslySubmitted;

  /** the recommendations for the picks, as the result screen (throws when there are none) */
  const showResults = async () => {
    const recommendations = await loadRecommendations();

    if (!recommendations.length) {
      throw new Error('no recommendations');
    }

    // renders first so downloadShadeDetails is set
    renderCombos(recommendations);

    pushAdobeCalculatorEvents({
      event: 'calct_submit',
      filter: `${picks.personality || ''}|${picks.mood || ''}`,
      flowType: 'Diwali Quiz',
      productdetails: downloadShadeDetails,
    });

    showSection(result);
  };

  /** posts the lead; true once both calls succeeded */
  const pushLead = async (remarks) => {
    const leadApi = await getLeadApi();
    if (!leadApi) return false;
    leadApi.setFormFieldsToCookie?.(form, selectors);
    const lead = {
      ...leadApi.buildLeadPayload(form, {
        selectors,
        // utm_campaign in the URL wins (form-submit-common), then the authored id
        campaignId: v('campaignId'),
        resourcePath: v('leadNode') || window.location.pathname,
        pageUrl: window.location.href,
      }),
      // the service question's answer; saveToDB / pushToSalesforce send it as "remarks"
      constructionWorkGoingOn: remarks,
    };
    const db = await leadApi.saveToDB(lead);
    let rowId;
    if (db?.Status === 'SUCCESS') rowId = db.rowID;
    else if (String(lead.node).includes('/en/')) rowId = `${Date.now()}-nondblead`;
    if (!rowId) return false;
    let sent = false;
    try {
      const sf = await leadApi.pushToSalesforce(lead, rowId);
      sent = Number(sf?.returnCode) === 201;
    } catch (err) {
      sent = false;
    }
    if (sent) {
      pushAdobeFormEvents({
        event: 'form_submit',
        formName: v('formTitle'),
        formCampaignId: v('campaignId'),
        dataDestination: 'both',
        construction: remarks || '',
      });

      formPreviouslySubmitted = true;
      submittedName = inputs.name.value.trim();
    }

    return sent;
  };

  steps.forEach((step, i) => {
    step.items.forEach((item) => item.button.addEventListener('click', () => select(step, item)));
    step.prev.addEventListener('click', () => {
      pushAdobeCtaClickEvent({
        event: 'custom_cta_click',
        cta: v('previousLabel'),
        parentTitle:
          step.section.querySelector('.festive-palette-question-text')
            ?.textContent || '',
      });

      resetSliders();
      showSection(i === 0 ? home : steps[i - 1].section);
    });
    step.next.addEventListener('click', async () => {
      // nothing happens until a card is chosen
      if (
        step.next.getAttribute('aria-disabled') === 'true'
        || step.next.classList.contains('is-busy')
      ) return;

      pushAdobeCalculatorEvents({
        event: `tool_step${step.n}`,
        filter: `${v(`step${step.n}Question`)}|${picks[step.key] || ''}`,
        flowType: 'Diwali Quiz',
      });

      resetSliders();
      if (i < steps.length - 1) {
        // the form is likely next: load its script while the last question shows
        if (i + 1 === steps.length - 1 && formAhead()) getLeadApi();
        showSection(steps[i + 1].section);
        return;
      }
      // last question: the form, or straight to the results when
      // data-attr-skip-form is "true" (read now) or a lead was already sent
      // this visit
      const skipped = skipForm();
      setBusy(step.next, true);
      if (!skipped && !formPreviouslySubmitted) {
        // pre-filled from the site's lead cookie (CCFormFields) each time it
        // shows, like the other lead forms (no prefill if the script failed:
        // submitting then shows the error screen)
        (await getLeadApi())?.checkCookieValues?.(form, selectors);
        setBusy(step.next, false);
        showSection(formSection);
        return;
      }
      try {
        await showResults();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          'festive-palette: loading the recommendations failed',
          err,
        );
        showFormError(!skipped);
      }
      setBusy(step.next, false);
    });
  });

  start.addEventListener('click', () => {
    trackStart();
    resetSliders();
    showSection(steps[0].section);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submit.classList.contains('is-busy')) return;
    const invalid = ['name', 'email', 'mobile', 'pin'].filter(
      (key) => !validate(key),
    );
    const picked = radios.find((r) => r.checked);
    const choiceMissing = radios.length > 0 && !picked;
    if (choiceMissing) {
      choiceError.textContent = v('requiredError');
      choice.classList.add('is-invalid');
    }
    if (invalid.length || choiceMissing) {
      pushAdobeFormEvents({
        event: 'form_error',
        formName: v('formTitle'),
        formCampaignId: v('campaignId'),
        formError: [...invalid, ...(choiceMissing ? ['serviceQuestion'] : [])],
      });

      if (invalid.length) inputs[invalid[0]].focus();
      else radios[0].focus();
      return;
    }
    setBusy(submit, true);
    live.textContent = v('submittingText');
    try {
      if (!(await pushLead(picked?.value || ''))) throw new Error('lead not saved');
      await showResults();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('festive-palette: submitting failed', err);
      showFormError();
    }
    live.textContent = '';
    setBusy(submit, false);
  });

  // Restart (result screen) and "Restart again" (error screen): question 1
  // again, nothing picked; like the texture finder, step 1 then has no
  // Previous button
  const restartQuestions = () => {
    pushAdobeCalculatorEvents({
      event: 'calct_recalculate',
      flowType: 'Diwali Quiz',
    });
    resetForm();
    hideFormError();
    steps.forEach((step) => {
      step.items.forEach((item) => {
        item.li.classList.remove('is-selected');
        item.button.setAttribute('aria-pressed', 'false');
      });
      delete picks[step.key];
      setNext(step, false);
    });
    steps[0].prev.hidden = true;
    resetSliders();
    showSection(steps[0].section);
  };
  restart.addEventListener('click', restartQuestions);
  errorBack.addEventListener('click', restartQuestions);

  /* ---------- PDF of the result ---------- */
  const imgSrc = (key) => firstImg(fields[key]?.cell)?.src || '';
  pdfButton?.addEventListener('click', async () => {
    if (pdfButton.classList.contains('is-busy') || !shown.length) return;
    setBusy(pdfButton, true);
    try {
      const { downloadFestivePdf } = await import('./festive-pdf.js');
      await downloadFestivePdf(
        {
          name: inputs.name.value.trim() || submittedName,
          personality: pickNames.personality || '',
          mood: pickNames.mood || '',
          recommendations: shown.map((rec) => ({
            ...rec,
            shades: rec.shades.map((shade) => ({
              ...shade,
              dark: !!shade.hex && isDark(shade.hex),
            })),
          })),
        },
        {
          fileName: v('pdfFileName'),
          greeting: v('pdfGreeting'),
          title: v('pdfTitle'),
          personalityLabel: v('pdfPersonalityLabel'),
          moodLabel: v('pdfMoodLabel'),
          paletteTitle: v('pdfPaletteTitle'),
          combinationLabel: v('combinationLabel'),
          goesWellLabel: v('goesWellLabel'),
          textureLabel: v('textureLabel'),
          wallpaperLabel: v('wallpaperLabel'),
          footerLogo: imgSrc('pdfFooterLogo'),
          footerText: richText(fields.pdfFooterText?.cell)
            .map((p) => p.outerHTML)
            .join(''),
          phone: v('pdfPhone'),
          decoTop: imgSrc('pdfDecoTop'),
          decoRight: imgSrc('pdfDecoRight'),
          decoBottom: imgSrc('pdfDecoBottom'),
        },
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('festive-palette: the PDF could not be made', err);
      live.textContent = v('errorText');
    }
    setBusy(pdfButton, false);
  });

  window.matchMedia(MOBILE).addEventListener('change', resetSliders);
}
