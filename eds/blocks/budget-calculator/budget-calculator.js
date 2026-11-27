import { createOptimizedPicture, getMetadata } from '../../scripts/aem.js';
import { pushAdobeCtaClickEvent, pushAdobeCalculatorEvents } from '../../scripts/analytics_1.js';
import {
  loadProducts, TIERS, STEPS, parseStep, unitWord, MULTIPLIER,
} from './budget-data.js';

/**
 * budget-calculator — the Paint Budget Calculator: choose a space and a need,
 * tick surfaces and enter areas, then either choose products surface by
 * surface (walls, ceilings, wood, metal) or skip to the recommended set, and
 * get the estimate (top coat, preparation undercoats, quantities, prices) with
 * a PDF download. Source: asianpaints.com/resources/tools/paint-budget-calculator
 * (section "budgetcalculatorrevamp"). Authoring, data and deviations: README.md.
 *
 * Authoring (DA table): label | value rows (all optional; the source's text is
 * the default), then two repeating sections, each starting with a header row:
 *   Space | Value | Image
 *   Need | Value | Image
 * Products and prices come from the source's endpoint; where it can't be
 * reached they come from the authored snapshot sheet (budget-data.js).
 */

// The source opens its exit-intent lead form (a dark backdrop, "Let our experts help you!") from
// "Get in touch" and, once, before the PDF download. Here that is the site's own lead-form modal
// (blocks/modal): the form page of the header CTA (data-modal-path), else the "site-visit-modal"
// page metadata, else the stg form page.
const DEFAULT_LEAD_MODAL = '/eds/forms/book-free-site-visit';
const PDF_FORM_KEY = 'pbcRevampPdfFormSubmitted';

/**
 * Opens the lead form in the site's modal and tells how it ended.
 * @returns {Promise<'done'|'closed'|'error'>} done = the form was submitted (thank-you shown),
 *   closed = dismissed, error = no modal could be opened
 */
async function openLeadPopup() {
  const modalPath = document.querySelector('.trigger-book-free-site-visit-modal[data-modal-path]')?.dataset.modalPath
    || getMetadata('site-visit-modal') || DEFAULT_LEAD_MODAL;
  try {
    const { openModal } = await import('../modal/modal.js');
    await openModal(modalPath);
  } catch (e) {
    return 'error';
  }
  // the lead-form dialog (the site's splash pop-up can be open as well)
  const dialog = [...document.querySelectorAll('dialog[open]')].filter((d) => d.querySelector('form')).pop();
  if (!dialog) return 'error';
  dialog.classList.add('bc-lead-dialog');
  return new Promise((resolve) => {
    let observer;
    let settled = false;
    const submitted = () => dialog.classList.contains('modal-success-active')
      || !!dialog.querySelector('.form-popup-overlay--success');
    const finish = (result) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      // success: drop the 504px form sizing so the site's own thank-you pop-up shows at full size
      if (result === 'done') dialog.classList.remove('bc-lead-dialog');
      resolve(result);
    };
    observer = new MutationObserver(() => { if (submitted()) finish('done'); });
    observer.observe(dialog, {
      subtree: true, childList: true, attributes: true, attributeFilter: ['class'],
    });
    dialog.addEventListener('close', () => finish(submitted() ? 'done' : 'closed'), { once: true });
  });
}

const DEFAULTS = {
  title: 'Paint Budget',
  titleAccent: 'Calculator',
  description: 'Get a quick estimate of quantity and price of products required for your project.',
  spaceTitle: 'Select Your Space',
  needTitle: 'Select Your Need',
  surfacesTitle: 'Select Your Surfaces and Paintable Area',
  wallsLabel: 'Walls & Ceilings',
  wallsExteriorLabel: 'Walls',
  wallsPlaceholder: 'Carpet area in Sq.Ft.',
  woodLabel: 'Wood Surfaces',
  woodPlaceholder: 'Paintable area in Sq.Ft.',
  metalLabel: 'Metal Surfaces',
  metalPlaceholder: 'Paintable area in Sq.Ft.',
  areaError: 'Please enter area to proceed.',
  paintingNote: '*The painting area is estimated by multiplying the carpet area by 2.5',
  ceilingNote: '*The ceiling area is estimated to be equivalent to the carpet area.',
  expertLabel: 'Get expert recommendations',
  chooseLabel: 'Choose products',
  orLabel: 'OR',
  touchLabel: 'Get in touch',
  touchLink: '',
  backLabel: 'Back',
  modifyLabel: 'Modify my selections',
  forLabel: 'For:',
  wallsStep: 'Select Products for Walls',
  ceilingsStep: 'Select Products for Ceilings',
  woodStep: 'Select Products for Wood',
  metalStep: 'Select Products for Metal',
  sqftLabel: 'Sq.Ft',
  skippedLabel: 'Skipped',
  proceedLabel: 'Proceed',
  selectNote: 'Select one or more products to proceed',
  skipText: 'By skipping product selection, the estimate will contain prices for recommended set of products.',
  dontSkipLabel: 'Do not Skip',
  skipAnywayLabel: 'Skip anyway',
  selectLabel: 'Select',
  mrpLabel: 'MRP',
  taxLabel: '(Inclusive of all taxes) per L*',
  priceDisclaimer: '*The price per litre is calculated based on the largest available pack size. Please note that the final cost may vary depending on the chosen shade and finish.',
  loadMoreLabel: 'Load more',
  previousLabel: 'Previous products',
  nextLabel: 'Next products',
  rangeLabel: 'Product ranges',
  resultTitle: 'Your Paint\nBudget Estimation',
  quantityNote: '*The quantity may vary depending on substrate condition.',
  totalNote: '* *Total price is estimated cost of products only. Labour costs are not included. Prices may vary based on shades and volume.',
  downloadLabel: 'Download Estimate',
  againLabel: 'Calculate Again',
  wallsTitle: 'Side Walls',
  ceilingTitle: 'Ceiling',
  woodTitle: 'Wood',
  metalTitle: 'Metal',
  areaUnit: 'Sq.ft.',
  topCoatTitle: 'Top Coat',
  undercoatTitle: 'Preparation Undercoats',
  totalTitle: 'Total Price',
  taxNote: '(Inclusive of all taxes)',
  pdfTaxNote: '(Inclusive of all taxes)',
  pdfUndercoatTaxNote: '(Inc. of all taxes)',
  woodUndercoatTitle: 'The application process for the selected wood finishes product involves the use of sealer and filler in accordance with the prescribed painting system.',
  woodUndercoatText: 'These steps have been duly accounted for in the cost estimation.',
  woodUndercoatNote: 'For further details, please contact your nearest dealer or an authorized Asian Paints contractor.',
  loadingText: 'Getting your products…',
  errorText: 'Something went wrong. Please try again.',
  pdfFileName: 'Paint-budget-estimate',
  endpoint: '/apcolourcatalogue/budgetCalculatorEnhanced.json',
  newTabNote: '(opens in a new tab)',
};

// label | value rows (lower-cased label -> field)
const FIELDS = {
  title: 'title',
  'title accent': 'titleAccent',
  description: 'description',
  'background image': 'bgImage',
  'circle image': 'circleImage',
  'space title': 'spaceTitle',
  'need title': 'needTitle',
  'surfaces title': 'surfacesTitle',
  'walls label': 'wallsLabel',
  'walls exterior label': 'wallsExteriorLabel',
  'walls placeholder': 'wallsPlaceholder',
  'wood label': 'woodLabel',
  'wood placeholder': 'woodPlaceholder',
  'metal label': 'metalLabel',
  'metal placeholder': 'metalPlaceholder',
  'area error': 'areaError',
  'painting note': 'paintingNote',
  'ceiling note': 'ceilingNote',
  'expert label': 'expertLabel',
  'choose label': 'chooseLabel',
  'or label': 'orLabel',
  'touch image': 'touchImage',
  'touch label': 'touchLabel',
  'touch link': 'touchLink',
  'touch opens in new tab': 'touchNewTab',
  'back label': 'backLabel',
  'modify label': 'modifyLabel',
  'for label': 'forLabel',
  'walls step': 'wallsStep',
  'ceilings step': 'ceilingsStep',
  'wood step': 'woodStep',
  'metal step': 'metalStep',
  'sq ft label': 'sqftLabel',
  'skipped label': 'skippedLabel',
  'proceed label': 'proceedLabel',
  'select note': 'selectNote',
  'skip text': 'skipText',
  "don't skip label": 'dontSkipLabel',
  'do not skip label': 'dontSkipLabel',
  'skip anyway label': 'skipAnywayLabel',
  'panel image': 'panelImage',
  'select label': 'selectLabel',
  'mrp label': 'mrpLabel',
  'tax label': 'taxLabel',
  'price disclaimer': 'priceDisclaimer',
  'load more label': 'loadMoreLabel',
  'previous label': 'previousLabel',
  'next label': 'nextLabel',
  'range label': 'rangeLabel',
  'result title': 'resultTitle',
  'result image': 'resultImage',
  'result mobile image': 'resultMobileImage',
  'quantity note': 'quantityNote',
  'total note': 'totalNote',
  'download label': 'downloadLabel',
  'again label': 'againLabel',
  'walls title': 'wallsTitle',
  'ceiling title': 'ceilingTitle',
  'wood title': 'woodTitle',
  'metal title': 'metalTitle',
  'area unit': 'areaUnit',
  'top coat title': 'topCoatTitle',
  'undercoat title': 'undercoatTitle',
  'total title': 'totalTitle',
  'tax note': 'taxNote',
  'pdf tax note': 'pdfTaxNote',
  'pdf undercoat tax note': 'pdfUndercoatTaxNote',
  'wood undercoat title': 'woodUndercoatTitle',
  'wood undercoat text': 'woodUndercoatText',
  'wood undercoat note': 'woodUndercoatNote',
  'loading text': 'loadingText',
  'error text': 'errorText',
  'pdf banner image': 'pdfBanner',
  'pdf header image': 'pdfHeader',
  'pdf call us image': 'pdfCallUs',
  'pdf footer logo': 'pdfLogo',
  'pdf walls icon': 'pdfWallsIcon',
  'pdf wood icon': 'pdfWoodIcon',
  'pdf metal icon': 'pdfMetalIcon',
  'pdf file name': 'pdfFileName',
  endpoint: 'endpoint',
  snapshot: 'snapshot',
  'new tab note': 'newTabNote',
};

const SECTIONS = {
  space: { name: 'spaces', columns: { space: 'name', value: 'value', image: 'image' } },
  need: { name: 'needs', columns: { need: 'name', value: 'value', image: 'image' } },
};

const DESKTOP = '(min-width: 992px)';
const SURFACES = ['walls', 'ceilings', 'woods', 'metals'];
const WOOD_PAGE = 18;
const RESULT_PAGE = 2;

let uid = 0;

const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
const yes = (value) => /^(true|yes|1|on)$/i.test(value);
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
  const lists = { spaces: [], needs: [] };
  let section = null;
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const first = text(cells[0]).toLowerCase();
    const header = SECTIONS[first];
    if (header && cells.length > 1 && header.columns[text(cells[1]).toLowerCase()]) {
      section = { ...header, keys: cells.map((c) => header.columns[text(c).toLowerCase()] || '') };
      return;
    }
    if (!section) {
      if (FIELDS[first]) fields[FIELDS[first]] = { row, cell: cells[1] || null };
      return;
    }
    const item = { row };
    section.keys.forEach((k, i) => { if (k) item[k] = cells[i] || null; });
    if (text(item.name)) lists[section.name].push(item);
  });
  return { fields, ...lists };
}

function picture(img, { eager = false, width = '750' } = {}) {
  if (!img) return null;
  const pic = createOptimizedPicture(img.src, img.alt || '', eager, [{ width }]);
  const out = pic.querySelector('img');
  ['width', 'height'].forEach((a) => { if (img.getAttribute(a)) out.setAttribute(a, img.getAttribute(a)); });
  return pic;
}

/** a DA image URL at a given width (CSS backgrounds) */
const sized = (img, width) => {
  if (!img) return '';
  const url = new URL(img.src, window.location.href);
  return `${url.pathname}?width=${width}&format=webply&optimize=medium`;
};

/** the source's decorative arrow / icon spans */
const icon = (name) => el('span', `bc-icon bc-icon-${name}`, { 'aria-hidden': 'true' });

function button(className, label, iconName) {
  const b = el('button', `bc-cta ${className}`, { type: 'button' });
  const span = el('span', 'bc-cta-label');
  span.textContent = label;
  b.append(span);
  if (iconName) b.append(icon(iconName));
  b.append(el('span', 'bc-spinner', { 'aria-hidden': 'true' }));
  return b;
}

const price = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? String(v).trim() : '';
};

export default async function decorate(block) {
  const { fields, spaces, needs } = readModel(block);
  // like the source, every page load asks for the lead form again before the first download
  try { sessionStorage.removeItem(PDF_FORM_KEY); } catch (e) { /* storage blocked */ }
  // Universal Editor: carry instrumentation over (a no-op with DA authoring)
  const { moveInstrumentation = () => {} } = await import('../../scripts/scripts.js');
  uid += 1;
  const id = `budget-calculator-${uid}`;
  const v = (key) => text(fields[key]?.cell) || DEFAULTS[key] || '';
  const img = (key) => firstImg(fields[key]?.cell);
  const mq = window.matchMedia(DESKTOP);
  const live = el('p', 'bc-sr-only', { role: 'status', 'aria-live': 'polite' });
  const announce = (msg) => { live.textContent = ''; window.setTimeout(() => { live.textContent = msg; }, 50); };

  /* ---------- state ---------- */
  const state = {
    space: '', need: '', walls: '', wood: '', metal: '', filter: '', started: false,
  };
  let products = null;

  /* ---------- shared parts ---------- */
  const intro = (compact) => {
    const wrap = el('div', `bc-intro${compact ? ' is-compact' : ''}`);
    const circle = el('div', 'bc-circle');
    const c = img('circleImage');
    if (c) circle.style.setProperty('--bc-circle', `url("${sized(c, 750)}")`);
    const textWrap = el('div', 'bc-intro-text');
    const h = el('h2', 'bc-title', { tabindex: compact ? '-1' : null });
    h.append(`${v('title')} `);
    const accent = el('span', 'bc-title-accent');
    accent.textContent = v('titleAccent');
    h.append(accent);
    const p = el('p', 'bc-description');
    p.textContent = v('description');
    textWrap.append(h, p);
    circle.append(textWrap);
    wrap.append(circle);
    return { wrap, heading: h };
  };

  const touchCard = (className) => {
    const t = el('div', `bc-touch ${className}`);
    const timg = img('touchImage');
    if (timg) {
      const pic = picture(timg, { width: '600' });
      pic.querySelector('img').classList.add('bc-touch-image');
      t.append(pic);
    }
    const link = href(fields.touchLink?.cell);
    // like the source, "Get in touch" opens the lead form in a pop-up with a backdrop; the authored
    // link is where it goes if the pop-up can't open
    const a = el('a', 'bc-cta bc-cta-yellow bc-touch-cta', { href: link || '#' });
    const span = el('span', 'bc-cta-label');
    span.textContent = v('touchLabel');
    a.append(span, icon('arrow'));
    if (link && yes(v('touchNewTab'))) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      const sr = el('span', 'bc-sr-only');
      sr.textContent = ` ${v('newTabNote')}`;
      a.append(sr);
    }
    a.addEventListener('click', async (e) => {
      e.preventDefault();

      pushAdobeCtaClickEvent({
        event: 'custom_cta_click',
        cta: v('touchLabel'),
        parentTitle: 'PBC Banner Icon',
      });
      /* ===== FIX GET IN TOUCH COUNTS FOR THE DOWNLOAD : START ===== */
      // as on the source: a lead form submitted from "Get in touch" also counts for the PDF
      // download, so the download does not ask for the form again in this visit
      const outcome = await openLeadPopup();
      if (outcome === 'done') {
        try { sessionStorage.setItem(PDF_FORM_KEY, 'true'); } catch (err) { /* storage blocked */ }
      }
      /* ===== FIX GET IN TOUCH COUNTS FOR THE DOWNLOAD : END ===== */
      if (outcome === 'error' && link) {
        if (a.target === '_blank') window.open(link, '_blank', 'noopener');
        else window.location.href = link;
      }
    });
    t.append(a);
    return t;
  };

  /* =================== screen 1: inputs =================== */
  const input = el('section', 'bc-screen bc-input', { 'aria-labelledby': `${id}-title` });
  const bgImg = img('bgImage');
  if (bgImg) {
    const bg = el('picture', 'bc-bg', { 'aria-hidden': 'true' });
    bg.append(el('img', '', {
      src: sized(bgImg, 750), alt: '', loading: 'eager', fetchpriority: 'high', width: bgImg.getAttribute('width'), height: bgImg.getAttribute('height'),
    }));
    input.append(bg);
  }
  const intro1 = intro(false);
  intro1.heading.id = `${id}-title`;
  intro1.heading.tabIndex = -1;
  ['title', 'titleAccent', 'description'].forEach((k) => { if (fields[k]) moveInstrumentation(fields[k].row, intro1.wrap); });
  const form = el('form', 'bc-form', { novalidate: true, 'aria-labelledby': `${id}-title` });

  const choices = el('div', 'bc-choices');
  const radioGroup = (key, title, list) => {
    const set = el('fieldset', `bc-choice is-${key}`);
    const legend = el('legend', 'bc-choice-title');
    legend.textContent = title;
    const opts = el('div', 'bc-options');
    list.forEach((item, i) => {
      const name = text(item.name);
      const value = text(item.value) || name;
      const label = el('label', 'bc-option');
      const r = el('input', 'bc-radio', {
        type: 'radio', name: `${id}-${key}`, value, checked: i === 0,
      });
      const media = el('span', 'bc-option-media');
      // the space / need options are in the first viewport, so they must not wait on lazy loading
      const pic = picture(firstImg(item.image), { width: '300', eager: true });
      if (pic) {
        // the visible name labels the option; the image is decorative
        pic.querySelector('img').alt = '';
        media.append(pic);
      }
      const tick = el('span', 'bc-tick', { 'aria-hidden': 'true' });
      tick.append(el('span', 'bc-tick-icon'));
      media.append(tick);
      const lab = el('span', 'bc-option-label');
      lab.textContent = name;
      label.append(r, media, lab);
      moveInstrumentation(item.row, label);
      opts.append(label);
    });
    set.append(legend, opts);
    return set;
  };
  const spaceSet = radioGroup('space', v('spaceTitle'), spaces);
  const needSet = radioGroup('need', v('needTitle'), needs);
  choices.append(spaceSet, needSet);

  const surfacesBox = el('fieldset', 'bc-surfaces');
  const surfacesLegend = el('legend', 'bc-surfaces-title');
  surfacesLegend.textContent = v('surfacesTitle');
  const surfaceList = el('div', 'bc-surface-list');
  const surfaceDefs = [
    { key: 'walls', label: v('wallsLabel'), placeholder: v('wallsPlaceholder') },
    { key: 'wood', label: v('woodLabel'), placeholder: v('woodPlaceholder') },
    { key: 'metal', label: v('metalLabel'), placeholder: v('metalPlaceholder') },
  ];
  const surfaceInputs = surfaceDefs.map((def) => {
    const box = el('div', `bc-surface is-${def.key}`);
    const check = el('label', 'bc-check');
    const cb = el('input', 'bc-checkbox', { type: 'checkbox', name: `${id}-${def.key}-on` });
    const mark = el('span', 'bc-checkbox-mark', { 'aria-hidden': 'true' });
    const lab = el('span', 'bc-check-label', { id: `${id}-${def.key}-label` });
    lab.textContent = def.label;
    check.append(cb, mark, lab);
    const areaId = `${id}-${def.key}-area`;
    const area = el('input', 'bc-area', {
      id: areaId,
      type: 'text',
      inputmode: 'numeric',
      pattern: '[0-9]*',
      autocomplete: 'off',
      placeholder: def.placeholder,
      disabled: true,
      'aria-labelledby': `${id}-${def.key}-label ${areaId}-hint`,
      'aria-describedby': `${areaId}-error`,
    });
    const hint = el('span', 'bc-sr-only', { id: `${areaId}-hint` });
    hint.textContent = def.placeholder;
    const err = el('p', 'bc-area-error', { id: `${areaId}-error` });
    err.textContent = v('areaError');
    const field = el('div', 'bc-area-field');
    field.append(area, hint, err);
    box.append(check, field);
    surfaceList.append(box);
    return {
      ...def, box, cb, area, err, lab,
    };
  });
  surfacesBox.append(surfacesLegend, surfaceList);

  const notes = el('div', 'bc-notes');
  const paintingNote = el('p', 'bc-note');
  const ceilingNote = el('p', 'bc-note is-ceiling');
  ceilingNote.textContent = v('ceilingNote');
  notes.append(paintingNote, ceilingNote);
  const ctaRow = el('div', 'bc-cta-row');
  const expert = button('bc-cta-step bc-expert', v('expertLabel'));
  const or = el('span', 'bc-or', { 'aria-hidden': 'true' });
  or.textContent = v('orLabel');
  const choose = button('bc-cta-step bc-choose', v('chooseLabel'));
  ctaRow.append(expert, or, choose);
  const bottom = el('div', 'bc-bottom');
  bottom.append(notes, ctaRow);
  // the notes and buttons follow the surfaces box (inside it on desktop, under it on mobile)
  form.append(choices, surfacesBox, bottom);
  input.append(intro1.wrap, form, touchCard('is-input'));

  /* =================== screen 2: product selection =================== */
  const select = el('section', 'bc-screen bc-select', { hidden: true, 'aria-labelledby': `${id}-step-title` });
  const top = el('div', 'bc-select-top');
  const intro2 = intro(true);
  const panelWrap = el('div', 'bc-panel-wrap');
  const panel = el('div', 'bc-panel');
  const bulge = img('panelImage');
  if (bulge) {
    const b = el('img', 'bc-bulge', {
      src: sized(bulge, 750), alt: '', 'aria-hidden': 'true', loading: 'lazy', width: '300', height: '235',
    });
    panel.append(b);
  }
  const inner = el('div', 'bc-panel-inner');
  const navRow = el('div', 'bc-panel-nav');
  const back = el('button', 'bc-link bc-back', { type: 'button' });
  back.append(icon('back'), v('backLabel'));
  const modify = el('button', 'bc-link bc-modify', { type: 'button' });
  modify.append(icon('edit'), v('modifyLabel'));
  navRow.append(back, modify);
  const stepDesc = el('div', 'bc-step-desc');
  const stepTitle = el('h3', 'bc-step-title', { id: `${id}-step-title`, tabindex: '-1' });
  const forLine = el('p', 'bc-for');
  const forValue = el('span', 'bc-for-value');
  forLine.append(`${v('forLabel')} `, forValue);
  stepDesc.append(stepTitle, forLine);
  const stepList = el('ol', 'bc-steps');
  const stepEls = {};
  SURFACES.forEach((key) => {
    const li = el('li', `bc-step is-${key}`, { hidden: true });
    const num = el('span', 'bc-step-num', { 'aria-hidden': 'true' });
    const name = el('span', 'bc-step-name');
    const area = el('span', 'bc-step-area');
    const skipped = el('span', 'bc-step-skipped', { hidden: true });
    skipped.textContent = v('skippedLabel');
    li.append(num, name, area, skipped);
    stepList.append(li);
    stepEls[key] = {
      li, num, name, area, skipped,
    };
  });
  stepEls.walls.name.textContent = v('wallsStep');
  stepEls.ceilings.name.textContent = v('ceilingsStep');
  stepEls.woods.name.textContent = v('woodStep');
  stepEls.metals.name.textContent = v('metalStep');
  inner.append(navRow, stepDesc, stepList);
  panel.append(inner);

  const selectActions = el('div', 'bc-select-actions');
  const skipWrap = el('div', 'bc-skip-wrap');
  const skip = button('bc-cta-outline bc-skip', v('expertLabel'));
  skip.setAttribute('aria-haspopup', 'dialog');
  skip.setAttribute('aria-expanded', 'false');
  skip.setAttribute('aria-controls', `${id}-skip`);
  const popup = el('div', 'bc-skip-popup', {
    id: `${id}-skip`, role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': `${id}-skip-text`, hidden: true,
  });
  const popupText = el('div', 'bc-skip-desc');
  popupText.append(icon('info'));
  const pt = el('p', '', { id: `${id}-skip-text` });
  pt.textContent = v('skipText');
  popupText.append(pt);
  const popupCtas = el('div', 'bc-skip-ctas');
  const dontSkip = button('bc-cta-popup bc-dont-skip', v('dontSkipLabel'));
  const skipAnyway = button('bc-cta-popup bc-skip-anyway', v('skipAnywayLabel'));
  popupCtas.append(dontSkip, skipAnyway);
  popup.append(popupText, popupCtas);
  skipWrap.append(skip, popup);
  const or2 = el('span', 'bc-or', { 'aria-hidden': 'true' });
  or2.textContent = v('orLabel');
  const proceed = button('bc-cta-step bc-proceed', v('proceedLabel'));
  proceed.setAttribute('aria-disabled', 'true');
  selectActions.append(skipWrap, or2, proceed);
  const selectNote = el('p', 'bc-select-note', { id: `${id}-select-note` });
  selectNote.textContent = v('selectNote');
  proceed.setAttribute('aria-describedby', selectNote.id);
  panelWrap.append(panel, selectActions, selectNote);
  top.append(intro2.wrap, panelWrap, touchCard('is-select'));
  const productsWrap = el('div', 'bc-products');
  select.append(top, productsWrap);
  const backdrop = el('div', 'bc-backdrop', { hidden: true, 'aria-hidden': 'true' });

  /* =================== screen 3: results =================== */
  const result = el('section', 'bc-screen bc-result', { hidden: true, 'aria-labelledby': `${id}-result-title` });
  const banner = el('div', 'bc-banner');
  const rDesk = img('resultImage');
  const rMob = img('resultMobileImage');
  if (rDesk) banner.style.setProperty('--bc-banner-desktop', `url("${sized(rDesk, 2000)}")`);
  if (rMob || rDesk) banner.style.setProperty('--bc-banner-mobile', `url("${sized(rMob || rDesk, 750)}")`);
  const bannerText = el('div', 'bc-banner-text');
  const rTitle = el('h2', 'bc-result-title', { id: `${id}-result-title`, tabindex: '-1' });
  v('resultTitle').split(/\n/).forEach((line, i) => {
    if (i) rTitle.append(el('br'));
    rTitle.append(line);
  });
  const resultTitleCell = fields.resultTitle?.cell;
  if (resultTitleCell && text(resultTitleCell)) {
    rTitle.replaceChildren();
    const p = resultTitleCell.querySelector('p') || resultTitleCell;
    [...p.childNodes].forEach((n) => rTitle.append(n.nodeName === 'BR' ? el('br') : document.createTextNode(n.textContent)));
  }
  bannerText.append(rTitle);
  const resultCtas = el('div', 'bc-result-ctas');
  const download = button('bc-cta-dark bc-download', v('downloadLabel'), 'download');
  const again = button('bc-cta-outline-dark bc-again', v('againLabel'), 'again');
  resultCtas.append(download, again);
  banner.append(bannerText, resultCtas, touchCard('is-result'));
  const mobDownload = button('bc-cta-dark bc-download is-mobile', v('downloadLabel'), 'download');
  const resultNotes = el('div', 'bc-result-notes');
  const qNote = el('p', 'bc-result-note');
  const tNote = el('p', 'bc-result-note');
  const starNote = (p, t) => {
    const [stars] = /^(\*\s?\*|\*)/.exec(t) || [];
    if (stars) {
      const s = el('span', 'bc-astr', { 'aria-hidden': 'true' });
      s.textContent = stars;
      p.append(s, t.slice(stars.length));
    } else p.textContent = t;
  };
  starNote(qNote, v('quantityNote'));
  starNote(tNote, v('totalNote'));
  resultNotes.append(qNote, tNote);
  const resultList = el('div', 'bc-results');
  const bottomCtas = el('div', 'bc-result-bottom');
  const download2 = button('bc-cta-dark bc-download', v('downloadLabel'), 'download');
  const again2 = button('bc-cta-outline-dark bc-again', v('againLabel'), 'again');
  bottomCtas.append(download2, again2);
  result.append(banner, mobDownload, resultNotes, resultList, bottomCtas);

  const mobileTouch = touchCard('is-footer');
  block.replaceChildren(input, select, result, mobileTouch, backdrop, live);

  /* =================== behaviour =================== */
  const screens = [input, select, result];
  const show = (screen, focusEl) => {
    screens.forEach((s) => { s.hidden = s !== screen; });
    const { top: y } = block.getBoundingClientRect();
    if (y < 0) block.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    if (focusEl) focusEl.focus({ preventScroll: true });
  };
  const setBusy = (b, busy) => {
    b.classList.toggle('is-busy', busy);
    if (busy) b.setAttribute('aria-busy', 'true');
    else b.removeAttribute('aria-busy');
  };
  const start = () => {
    if (state.started) return;
    state.started = true;
    pushAdobeCalculatorEvents({
      event: 'calc_start',
      flowType: 'PBC',
    });
  };

  /* --- screen 1 --- */
  const space = () => form.querySelector(`input[name="${id}-space"]:checked`)?.value || text(spaces[0]?.value) || 'Interior';
  const need = () => form.querySelector(`input[name="${id}-need"]:checked`)?.value || text(needs[0]?.value) || 'Fresh Painting';
  const syncSpace = () => {
    const exterior = space() === 'Exterior';
    surfaceInputs[0].lab.textContent = exterior ? v('wallsExteriorLabel') : v('wallsLabel');
    const note = v('paintingNote');
    paintingNote.textContent = exterior ? note.replace(/\b2\.5\b/, '1.5') : note.replace(/\b1\.5\b/, '2.5');
    ceilingNote.hidden = exterior;
  };
  syncSpace();
  form.addEventListener('change', (e) => {
    if (e.target.name === `${id}-space`) { start(); syncSpace(); }
  });
  const anyChecked = () => surfaceInputs.some((s) => s.cb.checked);
  const syncCtas = () => {
    const on = anyChecked();
    [expert, choose].forEach((b) => b.setAttribute('aria-disabled', String(!on)));
  };
  syncCtas();
  const setAreaError = (s, show2) => {
    s.box.classList.toggle('is-invalid', show2);
    if (show2) s.area.setAttribute('aria-invalid', 'true');
    else s.area.removeAttribute('aria-invalid');
  };
  surfaceInputs.forEach((s) => {
    s.cb.addEventListener('change', () => {
      start();
      s.area.disabled = !s.cb.checked;
      s.box.classList.toggle('is-on', s.cb.checked);
      setAreaError(s, false);
      if (s.cb.checked) s.area.focus();
      else s.area.value = '';
      syncCtas();
    });
    // the source only lets digits be typed (and no leading zero)
    s.area.addEventListener('keydown', (e) => {
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey) return;
      if (!/[0-9]/.test(e.key) || (e.key === '0' && !s.area.value.length)) e.preventDefault();
    });
    s.area.addEventListener('input', () => {
      const clean = s.area.value.replace(/\D/g, '').replace(/^0+/, '');
      if (clean !== s.area.value) s.area.value = clean;
      setAreaError(s, false);
    });
    s.area.addEventListener('focus', start);
  });
  const readInputs = () => {
    let ok = true;
    let firstBad = null;
    surfaceInputs.forEach((s) => {
      if (s.cb.checked && !s.area.value.trim()) {
        ok = false;
        setAreaError(s, true);
        firstBad = firstBad || s.area;
      }
    });
    if (!ok) {
      firstBad.focus();
      announce(v('areaError'));
      return false;
    }
    state.space = space();
    state.need = need();
    [state.walls, state.wood, state.metal] = surfaceInputs.map((s) => (s.cb.checked ? s.area.value.trim() : ''));
    const parts = [];
    if (state.walls) parts.push(` | Walls:${state.walls}`);
    if (state.wood) parts.push(` | Wood:${state.wood}`);
    if (state.metal) parts.push(` | Metal:${state.metal}`);
    state.filter = `${state.space}|${state.need}${parts.join('')}`;
    return true;
  };
  const ga4 = (clickText, event) => {
    try {
      if (typeof window.ccAnalytics?.ga4DataLayer !== 'function') return;
      const sq = (x) => (x ? `${x}sqft` : '');
      window.ccAnalytics.ga4DataLayer({
        event,
        click_text: clickText,
        click_category: 'Paint calculator',
        select_space: state.space,
        select_needs: state.need,
        walls: sq(state.walls),
        wood_surfaces: sq(state.wood),
        metal_surfaces: sq(state.metal),
      });
    } catch (e) { /* no analytics */ }
  };
  const fetchProducts = async () => {
    const res = await loadProducts({
      endpoint: v('endpoint'),
      snapshotUrl: href(fields.snapshot?.cell),
      space: state.space,
      need: state.need,
      walls: state.walls,
      wood: state.wood,
      metal: state.metal,
    });
    products = res.data;
    return products;
  };

  /* --- screen 2: products --- */
  const selected = new Set();
  const surfaceState = {};
  let order = [];
  let current = 0;
  let skippedSelectionHistory = '';
  const getSelectedValue = () => {
    const counts = {};
    const currentSurface = order[current];

    [...selected].forEach((k) => {
      const [surface, sku] = k.split(':');

      if (surface !== currentSurface) return;

      if (surface === 'walls') {
        const wallsProducts = products?.[state.space];

        if (!wallsProducts || Array.isArray(wallsProducts)) return;

        Object.entries(wallsProducts).forEach(([tier, items]) => {
          if (items.some((item) => item.sku === sku)) {
            counts[tier] = (counts[tier] || 0) + 1;
          }
        });
      } else {
        counts[currentSurface] = (counts[currentSurface] || 0) + 1;
      }
    });

    if (currentSurface === 'walls') {
      const value = Object.entries(counts)
        .map(([tier, count]) => `${tier}=${count}`)
        .join(', ');

      return value ? `${state.space}: ${value}` : '';
    }

    const labels = {
      ceilings: 'Ceiling',
      woods: 'Wood',
      metals: 'Metal',
    };

    const count = counts[currentSurface] || 0;

    return count ? `${state.space}: ${labels[currentSurface]}: ${count}` : '';
  };

  const addToHistory = () => {
    const currentSelection = getSelectedValue();

    if (!currentSelection) return;

    const valueWithoutSpace = currentSelection.replace(
      `${state.space}: `,
      '',
    );

    const items = skippedSelectionHistory
      ? skippedSelectionHistory.split(' | ')
      : [];

    if (!items.includes(valueWithoutSpace)) {
      items.push(valueWithoutSpace);
    }

    skippedSelectionHistory = items.join(' | ');
  };

  const getTrackingSelectedValue = () => {
    const value = [
      skippedSelectionHistory,
      getSelectedValue().replace(`${state.space}: `, ''),
    ].filter(Boolean).join(' | ');

    return value ? `${state.space}: ${value}` : '';
  };
  const card = (item, surface) => {
    const li = el('li', 'bc-card');
    const view = el('div', 'bc-card-view');
    const media = el('div', 'bc-card-media');
    const pimg = el('img', '', {
      src: item.swatchImage, alt: '', loading: 'lazy', width: '80', height: '90',
    });
    media.append(pimg);
    const name = el('h4', 'bc-card-title');
    name.textContent = item.entityName || '';
    const tags = el('ul', 'bc-card-tags');
    (item.visibleTags || []).forEach((t) => {
      const tli = el('li');
      tli.textContent = t;
      tags.append(tli);
    });
    const mrp = el('div', 'bc-card-mrp');
    const p = el('p', 'bc-card-price');
    const rs = el('span', 'bc-rs');
    rs.textContent = '₹';
    const amount = el('span', 'bc-amount');
    amount.textContent = price(String(item.mrpPerLitre || '').split(' ')[0]);
    p.append(`${v('mrpLabel')} `, rs, amount);
    const tax = el('p', 'bc-card-tax');
    const taxText = v('taxLabel');
    const star = taxText.indexOf('*');
    if (star >= 0) {
      const s = el('span', 'bc-asterisk', { 'aria-hidden': 'true' });
      s.textContent = '*';
      tax.append(taxText.slice(0, star), s, taxText.slice(star + 1));
    } else tax.textContent = taxText;
    mrp.append(p, tax);
    const pick = el('label', 'bc-pick');
    const cb = el('input', 'bc-pick-input', { type: 'checkbox', value: item.sku });
    const mark = el('span', 'bc-pick-mark', { 'aria-hidden': 'true' });
    const lab = el('span', 'bc-pick-label');
    lab.textContent = v('selectLabel');
    const sr = el('span', 'bc-sr-only');
    sr.textContent = ` ${item.entityName || ''}`;
    pick.append(cb, mark, lab, sr);
    cb.addEventListener('change', () => {
      const key = `${surface}:${item.sku}`;
      if (cb.checked) selected.add(key);
      else selected.delete(key);
      li.classList.toggle('is-selected', cb.checked);
      // eslint-disable-next-line no-use-before-define
      syncProceed();
      const parentTitle = li.closest('.bc-tier')?.querySelector('.bc-tier-title')?.textContent || '';
      pushAdobeCtaClickEvent({
        event: 'product_selected', filter: state.filter, cta: item.entityName, flowType: 'PBC', parentTitle, category: item.category,
      });
    });
    // the source's layout: the body is padded, the price sits above the pick row
    const body = el('div', 'bc-card-body');
    body.append(media, name, tags);
    const pickRow = el('div', 'bc-card-pick');
    pickRow.append(pick);
    view.append(body, mrp, pickRow);
    li.append(view);
    return li;
  };

  /**
   * A row of cards: on desktop a horizontal strip with previous / next (the
   * source's slick, used for the long tiers), on mobile pages of 2 x 2.
   */
  const pager = (list, label) => {
    const wrap = el('div', 'bc-pager');
    const prev = el('button', 'bc-pager-btn is-prev', { type: 'button', 'aria-label': `${v('previousLabel')}: ${label}`, 'aria-controls': list.id });
    const next = el('button', 'bc-pager-btn is-next', { type: 'button', 'aria-label': `${v('nextLabel')}: ${label}`, 'aria-controls': list.id });
    wrap.append(prev, list, next);
    let page = 0;
    const cards = () => [...list.children];
    // aria-disabled (not disabled) so a focused arrow keeps focus at either end
    const off = (btn, isOff) => btn.setAttribute('aria-disabled', String(isOff));
    const perPage = 4;
    // the source gives every card of a mobile row the tallest card's height
    const equalize = () => {
      const items = cards();
      items.forEach((c) => { c.hidden = false; c.style.minHeight = ''; });
      const max = Math.max(0, ...items.map((c) => c.getBoundingClientRect().height));
      items.forEach((c) => { c.style.minHeight = mq.matches ? '' : `${max}px`; });
    };
    const sync = () => {
      if (!wrap.getClientRects().length) return;
      const items = cards();
      if (!mq.matches) {
        if (!list.dataset.equalized) {
          equalize();
          list.dataset.equalized = 'true';
        }
        const pages = Math.max(1, Math.ceil(items.length / perPage));
        page = Math.min(page, pages - 1);
        items.forEach((c, i) => { c.hidden = Math.floor(i / perPage) !== page; });
        off(prev, page === 0);
        off(next, page >= pages - 1);
        wrap.classList.toggle('has-nav', pages > 1);
      } else {
        delete list.dataset.equalized;
        items.forEach((c) => { c.hidden = false; c.style.minHeight = ''; });
        const max = list.scrollWidth - list.clientWidth;
        off(prev, list.scrollLeft <= 1);
        off(next, list.scrollLeft >= max - 1);
        wrap.classList.toggle('has-nav', max > 1);
      }
    };
    const step = (dir) => {
      if ((dir < 0 ? prev : next).getAttribute('aria-disabled') === 'true') return;
      const nav = () => {
        const dirLabel = dir < 0 ? 'Previous' : 'Next';
        const surfaceKey = order[current] || '';

        pushAdobeCtaClickEvent({
          event: 'Navigation',
          cta: `Navigation Action : ${dirLabel}`,
          parentTitle: label,
          flowType: 'PBC',
          category: surfaceKey,
        });
      };
      nav();
      if (!mq.matches) {
        page += dir;
        sync();
        const first = cards()[page * perPage];
        first?.querySelector('input')?.focus({ preventScroll: true });
        return;
      }
      const w = cards()[0]?.getBoundingClientRect().width || 210;
      list.scrollBy({ left: dir * w, behavior: reducedMotion() ? 'auto' : 'smooth' });
    };
    prev.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    list.addEventListener('scroll', () => { if (mq.matches) sync(); }, { passive: true });
    return { wrap, sync };
  };

  const pagers = [];
  const tierBlock = (tierName, list, surface, { slider, idx }) => {
    const sec = el('section', 'bc-tier', { id: `${id}-${surface}-${idx}`, 'aria-labelledby': `${id}-${surface}-${idx}-title` });
    const h = el('h3', 'bc-tier-title', { id: `${id}-${surface}-${idx}-title`, tabindex: '-1' });
    h.textContent = tierName;
    const ul = el('ul', `bc-cards${slider ? ' is-slider' : ''}`, { id: `${id}-${surface}-${idx}-list` });
    list.forEach((item) => ul.append(card(item, surface)));
    sec.append(h);
    if (slider) {
      const pg = pager(ul, tierName);
      pagers.push(pg);
      sec.append(pg.wrap);
    } else sec.append(ul);
    const disc = el('p', 'bc-disclaimer');
    const d = v('priceDisclaimer');
    if (d.startsWith('*')) {
      const s = el('span', 'bc-asterisk', { 'aria-hidden': 'true' });
      s.textContent = '*';
      disc.append(s, d.slice(1));
    } else disc.textContent = d;
    sec.append(disc);
    return sec;
  };

  const short = (tier) => tier.replace(/ Products$| Exterior Emulsions$/, '');
  const buildProducts = () => {
    productsWrap.replaceChildren();
    pagers.length = 0;
    selected.clear();
    const sp = state.space;
    const groups = {
      walls: products[sp] && !Array.isArray(products[sp]) ? products[sp] : null,
      ceilings: sp === 'Interior' ? products.Ceiling : null,
      woods: products.Wood,
      metals: products.Metal,
    };
    SURFACES.forEach((surface) => {
      const box = el('div', `bc-surface-products is-${surface}`, { hidden: true });
      if (surface === 'walls' && groups.walls) {
        const tiers = (TIERS[sp] || Object.keys(groups.walls))
          .filter((t) => groups.walls[t]?.length);
        const nav = el('nav', 'bc-jump', { 'aria-label': v('rangeLabel') });
        tiers.forEach((t, i) => {
          const a = el('a', i === 0 ? 'is-active' : '', { href: `#${id}-walls-${i}` });
          a.textContent = short(t).replace(/^Super Luxury$/, 'Super Luxury');
          if (i === 0) a.setAttribute('aria-current', 'true');
          a.addEventListener('click', (e) => {
            e.preventDefault();
            nav.querySelectorAll('a').forEach((x) => { x.classList.remove('is-active'); x.removeAttribute('aria-current'); });
            a.classList.add('is-active');
            a.setAttribute('aria-current', 'true');
            pushAdobeCtaClickEvent({
              event: 'jumplink', cta: a.textContent,
            });
            const target = box.querySelector(`#${id}-walls-${i}`);
            const offset = (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-height'), 10) || 64) + nav.offsetHeight + 10;
            window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - offset, behavior: reducedMotion() ? 'auto' : 'smooth' });
            target.querySelector('.bc-tier-title').focus({ preventScroll: true });
          });
          nav.append(a);
        });
        box.append(nav);
        tiers.forEach((t, i) => {
          const list = groups.walls[t];
          // the source slides its Luxury, Premium and Economy rows (and the Exterior equivalents)
          const slider = i > 0;
          box.append(tierBlock(list[0]?.brandMapper || t, list, 'walls', { slider, idx: i }));
        });
      } else if (groups[surface]?.length) {
        const list = groups[surface];
        const sec = tierBlock(list[0]?.brandMapper || '', list, surface, { slider: false, idx: 0 });
        if (surface === 'woods') {
          // desktop: the source shows 18 wood finishes, then "Load more"
          const ul = sec.querySelector('.bc-cards');
          const more = button('bc-cta-outline-dark bc-load-more', v('loadMoreLabel'), 'down');
          let shown = 0;
          const page = () => {
            const items = [...ul.children];
            const firstNew = items[shown];
            shown += WOOD_PAGE;
            items.forEach((c, i) => c.classList.toggle('is-more', mq.matches && i >= shown));
            more.hidden = !mq.matches || shown >= items.length;
            return firstNew;
          };
          page();
          more.addEventListener('click', () => {
            const first = page();
            first?.querySelector('input')?.focus();
            pushAdobeCtaClickEvent({
              event: 'custom_cta_click',
              cta: v('loadMoreLabel'),
              parentTitle: stepTitle.textContent,
              flowType: 'PBC',
              category: order[current],
            });
          });
          mq.addEventListener('change', () => { shown = 0; page(); });
          // the source places "Load more" after the price disclaimer
          sec.append(more);
        }
        box.append(sec);
      }
      productsWrap.append(box);
      surfaceState[surface] = { box, skipped: false, done: false };
    });
  };

  const surfaceArea = (surface) => {
    const w = Number(state.walls) || 0;
    if (surface === 'walls') return w * (MULTIPLIER[state.space] || 1);
    if (surface === 'ceilings') return w;
    if (surface === 'woods') return Number(state.wood) || 0;
    return Number(state.metal) || 0;
  };
  const eligible = () => SURFACES.filter((s) => {
    if (s === 'walls') return !!state.walls;
    if (s === 'ceilings') return !!state.walls && state.space === 'Interior';
    if (s === 'woods') return !!state.wood;
    return !!state.metal;
  });
  const currentHasSelection = () => [...selected].some((k) => k.startsWith(`${order[current]}:`));
  const syncProceed = () => {
    const on = currentHasSelection();
    proceed.setAttribute('aria-disabled', String(!on));
    selectNote.hidden = false;
  };
  const showSurface = () => {
    const surface = order[current];
    SURFACES.forEach((s) => {
      surfaceState[s].box.hidden = s !== surface;
      const st = stepEls[s];
      st.li.classList.toggle('is-active', s === surface);
      if (s === surface) st.li.setAttribute('aria-current', 'step');
      else st.li.removeAttribute('aria-current');
    });
    stepTitle.textContent = stepEls[surface].name.textContent;
    syncProceed();
    pagers.forEach((pg) => pg.sync());
  };
  const startSelection = () => {
    order = eligible();
    current = 0;
    SURFACES.forEach((s) => {
      const st = stepEls[s];
      const on = order.includes(s);
      st.li.hidden = !on;
      st.li.classList.remove('is-done', 'is-skipped', 'is-active');
      st.skipped.hidden = true;
      st.area.hidden = false;
      if (on) {
        st.num.textContent = String(order.indexOf(s) + 1);
        st.area.textContent = `${surfaceArea(s)} ${v('sqftLabel')}`;
      }
      surfaceState[s].skipped = false;
    });
    forValue.textContent = `${state.space}, ${state.need}`;
    show(select, stepTitle);
    showSurface();
  };

  /* --- results --- */
  const resultRow = (item, category) => {
    const cls = { Metal: 'is-metal', Wood: 'is-wood' }[category] || 'is-walls';
    const row = el('li', `bc-row ${cls}`);
    const [unitPrice, unitRaw] = String(item.mrpPerLitre || '').split(' ');
    const main = el('div', 'bc-row-main');
    const mainTitle = el('p', 'bc-row-col-title');
    mainTitle.append(v('topCoatTitle'), el('span', 'bc-astr', { 'aria-hidden': 'true' }));
    mainTitle.lastChild.textContent = '*';
    const mi = el('div', 'bc-item is-main');
    const box = el('div', 'bc-item-media');
    box.append(el('img', '', {
      src: item.swatchImage, alt: '', loading: 'lazy', width: '132', height: '158',
    }));
    const qty = el('span', 'bc-qty');
    qty.textContent = unitWord(item.quantityRequired);
    box.append(qty);
    const name = el('p', 'bc-item-title');
    name.textContent = item.entityName || '';
    const pr = el('p', 'bc-item-price');
    const cur = el('span', 'bc-currency');
    cur.textContent = '₹';
    const unit = el('span', 'bc-unit');
    unit.textContent = ` / ${(unitRaw || '').replace('Litres', 'Litre')}`;
    pr.append(cur, ` ${price(unitPrice)} `, unit);
    const note = el('p', 'bc-item-note');
    note.textContent = v('taxNote');
    mi.append(box, name, pr, note);
    main.append(mainTitle, mi);

    const under = el('div', 'bc-row-under');
    const underTitle = el('p', 'bc-row-col-title');
    underTitle.append(v('undercoatTitle'), el('span', 'bc-astr', { 'aria-hidden': 'true' }));
    underTitle.lastChild.textContent = '*';
    const underList = el('div', 'bc-under-list');
    if (category === 'Wood') {
      const w = el('div', 'bc-wood-text');
      const a = el('p', 'bc-wood-title');
      a.textContent = v('woodUndercoatTitle');
      const b = el('p', 'bc-wood-desc');
      b.textContent = v('woodUndercoatText');
      const c = el('p', 'bc-wood-note');
      c.textContent = v('woodUndercoatNote');
      w.append(a, b, c);
      underList.append(w);
    } else {
      let last = -1;
      STEPS.forEach((k, i) => { if ((item[k] || '').trim()) last = i; });
      for (let i = 0; i < last; i += 1) {
        const s = parseStep(item[STEPS[i]]);
        if (s) {
          const ui = el('div', 'bc-item is-under');
          const ub = el('div', 'bc-item-media');
          ub.append(el('img', '', {
            src: s.image, alt: '', loading: 'lazy', width: '74', height: '88',
          }));
          const uq = el('span', 'bc-qty');
          uq.textContent = unitWord(s.qty);
          ub.append(uq);
          const ut = el('p', 'bc-item-title');
          ut.textContent = s.name;
          const ubottom = el('div', 'bc-item-bottom');
          const up = el('p', 'bc-item-price');
          const uc = el('span', 'bc-currency');
          uc.textContent = '₹';
          const uu = el('span', 'bc-unit');
          uu.textContent = ` / ${(s.qty.split(' ')[1] || '').replace('Litres', 'Litre')}`;
          up.append(uc, ` ${s.price} `, uu);
          const un = el('p', 'bc-item-note');
          un.textContent = v('taxNote');
          ubottom.append(up, un);
          ui.append(ub, ut, ubottom);
          underList.append(ui);
        }
      }
    }
    under.append(underTitle, underList);

    const total = el('div', 'bc-row-total');
    const totalTitle = el('p', 'bc-row-col-title');
    totalTitle.append(v('totalTitle'), el('span', 'bc-astr', { 'aria-hidden': 'true' }));
    totalTitle.lastChild.textContent = '* *';
    const amount = el('p', 'bc-total');
    const tc = el('span', 'bc-total-currency');
    tc.textContent = '₹ ';
    const ta = el('span', 'bc-total-amount');
    ta.textContent = String(item.mrp ?? '');
    const tst = el('span', 'bc-astr', { 'aria-hidden': 'true' });
    tst.textContent = '*';
    amount.append(tc, ta, tst);
    const tn = el('p', 'bc-item-note');
    tn.textContent = v('taxNote');
    const tbox = el('div', 'bc-total-box');
    tbox.append(amount, tn);
    total.append(totalTitle, tbox);
    row.append(main, under, total);
    return row;
  };

  const chosenFor = (surface, list) => {
    const skipped = surfaceState[surface]?.skipped;
    return list
      .filter((i) => (skipped ? i.recommended === 'Yes' : selected.has(`${surface}:${i.sku}`)))
      .sort((a, b) => Number(b.livePrice) - Number(a.livePrice));
  };
  let resultData = null;
  const buildResults = () => {
    resultList.replaceChildren();
    const sp = state.space;
    const sections = [];
    const walls = products[sp] && !Array.isArray(products[sp]) ? products[sp] : null;
    if (state.walls && walls) {
      const items = (TIERS[sp] || Object.keys(walls)).flatMap((t) => chosenFor('walls', walls[t] || []));
      const note = (sp === 'Exterior' ? v('paintingNote').replace(/\b2\.5\b/, '1.5') : v('paintingNote')).replace(/^\*/, '');
      sections.push({
        key: 'walls', title: v('wallsTitle'), area: surfaceArea('walls'), note, items, category: sp, tone: 'is-walls',
      });
    }
    if (state.walls && sp === 'Interior' && products.Ceiling) {
      sections.push({
        key: 'ceilings', title: v('ceilingTitle'), area: surfaceArea('ceilings'), note: v('ceilingNote').replace(/^\*/, ''), items: chosenFor('ceilings', products.Ceiling), category: 'Ceiling', tone: 'is-walls',
      });
    }
    if (state.wood && products.Wood) {
      sections.push({
        key: 'woods', title: v('woodTitle'), area: surfaceArea('woods'), items: chosenFor('woods', products.Wood), category: 'Wood', tone: 'is-wood',
      });
    }
    if (state.metal && products.Metal) {
      sections.push({
        key: 'metals', title: v('metalTitle'), area: surfaceArea('metals'), items: chosenFor('metals', products.Metal), category: 'Metal', tone: 'is-metal',
      });
    }
    sections.forEach((s) => {
      const sec = el('section', `bc-result-section ${s.tone}`, { 'aria-labelledby': `${id}-r-${s.key}` });
      const tile = el('div', 'bc-tile');
      const tt = el('h3', 'bc-tile-title', { id: `${id}-r-${s.key}` });
      const name = el('span', 'bc-tile-name');
      name.textContent = s.title;
      const wrap = el('span', 'bc-tile-area');
      wrap.append(el('span', 'bc-tile-divider', { 'aria-hidden': 'true' }));
      const ar = el('span', 'bc-tile-area-value');
      ar.textContent = `${s.area} ${v('areaUnit')}`;
      wrap.append(ar);
      tt.append(name, wrap);
      tile.append(tt);
      if (s.note) {
        const n = el('p', 'bc-tile-note');
        n.textContent = s.note;
        tile.append(n);
      }
      const head = el('div', 'bc-grid-head', { 'aria-hidden': 'true' });
      [['topCoatTitle', '*'], ['undercoatTitle', '*'], ['totalTitle', '* *']].forEach(([k, star]) => {
        const c = el('p');
        const st = el('span', 'bc-astr');
        st.textContent = ` ${star} `;
        c.append(v(k), st);
        head.append(c);
      });
      const rows = el('ul', 'bc-rows', { id: `${id}-rows-${s.key}` });
      s.items.forEach((item) => rows.append(resultRow(item, s.category)));
      // mobile rows scroll sideways: make the strip reachable by keyboard while it scrolls
      new ResizeObserver(() => {
        if (rows.scrollWidth > rows.clientWidth + 1) {
          rows.tabIndex = 0;
          rows.setAttribute('aria-label', s.title);
        } else {
          rows.removeAttribute('tabindex');
          rows.removeAttribute('aria-label');
        }
      }).observe(rows);
      sec.append(tile, head, rows);
      // desktop: the source shows two rows, then "Load more"
      if (s.items.length > RESULT_PAGE) {
        const more = button('bc-cta-outline-dark bc-load-more bc-load-more-result', v('loadMoreLabel'), 'down');
        more.setAttribute('aria-controls', rows.id);
        let shown = RESULT_PAGE;
        const sync = () => {
          [...rows.children].forEach((r, i) => r.classList.toggle('is-more', mq.matches && i >= shown));
          more.hidden = !mq.matches || shown >= rows.children.length;
        };
        sync();
        more.addEventListener('click', () => {
          const first = rows.children[shown];
          shown += RESULT_PAGE;
          sync();
          first?.setAttribute('tabindex', '-1');
          first?.focus();
          pushAdobeCtaClickEvent({
            event: 'custom_cta_click',
            cta: v('loadMoreLabel'),
            parentTitle: s.title,
            flowType: 'PBC',
            category: s.category,
          });
        });
        mq.addEventListener('change', sync);
        sec.append(more);
      }
      resultList.append(sec);
    });
    resultData = sections;
    const details = () => {
      const counts = {};
      [...selected].forEach((k) => {
        const [surface, sku] = k.split(':');
        const cat = {
          walls: sp, ceilings: 'Ceiling', woods: 'Wood', metals: 'Metal',
        }[surface];
        if (cat === sp && walls) {
          const tier = Object.keys(walls).find((t) => walls[t].some((i) => i.sku === sku));
          counts[cat] = counts[cat] || {};
          counts[cat][tier] = (counts[cat][tier] || 0) + 1;
        } else counts[cat] = (counts[cat] || 0) + 1;
      });
      return Object.entries(counts).map(([c, n]) => (typeof n === 'object' ? `${c}: ${Object.entries(n).map(([t, x]) => `${t}=${x}`).join(', ')}` : `${c}: ${n}`)).join(' | ');
    };
    state.details = details();
    show(result, rTitle);
    pushAdobeCalculatorEvents({
      event: 'calct_submit',
      flowType: 'PBC',
      filter: state.filter,
      productdetails: state.details,
    });
  };

  /* --- wiring --- */
  const disabled = (b) => b.getAttribute('aria-disabled') === 'true';
  const go = async (b, mode) => {
    if (disabled(b) || b.classList.contains('is-busy')) return;
    if (!readInputs()) return;
    const label = b.querySelector('.bc-cta-label').textContent;
    pushAdobeCalculatorEvents({
      event: 'calc_continue',
      flowType: 'PBC',
      cta: label,
      filter: state.filter,
    });
    if (mode === 'choose') ga4(label, 'custom_paint_calculator');
    setBusy(b, true);
    announce(v('loadingText'));
    try {
      await fetchProducts();
      buildProducts();
      if (mode === 'choose') startSelection();
      else {
        order = eligible();
        order.forEach((s) => { surfaceState[s].skipped = true; });
        buildResults();
      }
    } catch (e) {
      announce(v('errorText'));
    }
    setBusy(b, false);
  };
  choose.addEventListener('click', () => go(choose, 'choose'));
  expert.addEventListener('click', () => go(expert, 'expert'));
  form.addEventListener('submit', (e) => { e.preventDefault(); go(choose, 'choose'); });

  const resetSelection = () => {
    selected.clear();
    productsWrap.replaceChildren();
    proceed.setAttribute('aria-disabled', 'true');
  };
  const toInputs = () => {
    resetSelection();
    show(input, intro1.heading);
  };
  const ctaTitle = () => stepTitle.textContent;
  modify.addEventListener('click', () => {
    pushAdobeCtaClickEvent({
      event: 'cta_link_text', cta: v('modifyLabel'), parentTitle: ctaTitle(), flowType: 'PBC',
    });
    toInputs();
  });
  back.addEventListener('click', () => {
    pushAdobeCtaClickEvent({
      event: 'cta_link_text', cta: v('backLabel'), parentTitle: ctaTitle(), flowType: 'PBC',
    });
    if (current === 0) {
      toInputs();
      return;
    }
    current -= 1;
    const s = order[current];
    surfaceState[s].skipped = false;
    stepEls[s].li.classList.remove('is-skipped', 'is-done');
    stepEls[s].skipped.hidden = true;
    stepEls[s].area.hidden = false;
    showSurface();
    stepTitle.focus();
  });
  const advance = () => {
    const s = order[current];
    if (!surfaceState[s].skipped && currentHasSelection()) stepEls[s].li.classList.add('is-done');
    if (current < order.length - 1) {
      current += 1;
      showSurface();
      stepTitle.focus({ preventScroll: true });
      announce(stepTitle.textContent);
    } else {
      buildResults();
    }
  };
  proceed.addEventListener('click', () => {
    pushAdobeCtaClickEvent({
      event: 'custom_cta_click',
      cta: v('proceedLabel'),
      parentTitle: ctaTitle(),
      flowType: 'PBC',
      category: order[current],
      filter: state.filter,
      selectedValue: getTrackingSelectedValue(),
    });

    if (disabled(proceed)) return;

    addToHistory();

    advance();
  });

  // the skip popup (non-modal, beside its button; Esc closes)
  const closePopup = (focusBack = true) => {
    popup.hidden = true;
    backdrop.hidden = true;
    skip.setAttribute('aria-expanded', 'false');
    if (focusBack) skip.focus();
  };
  skip.addEventListener('click', () => {
    popup.hidden = false;
    backdrop.hidden = false;
    // only the popup (z-index 1052) sits above the backdrop (1040); its
    // ancestors must not form a stacking context, or they would show above it too
    skip.setAttribute('aria-expanded', 'true');
    dontSkip.focus();

    pushAdobeCtaClickEvent({
      event: 'custom_cta_click', cta: v('expertLabel'), parentTitle: ctaTitle(), flowType: 'PBC', category: order[current], filter: state.filter, selectedValue: getTrackingSelectedValue(),
    });
  });
  dontSkip.addEventListener('click', () => {
    pushAdobeCtaClickEvent({
      event: 'custom_cta_click',
      cta: v('dontSkipLabel'),
      parentTitle: ctaTitle(),
      flowType: 'PBC',
      category: order[current],
      filter: state.filter,
      selectedValue: getTrackingSelectedValue(),
    });

    closePopup();
  });
  skipAnyway.addEventListener('click', () => {
    pushAdobeCtaClickEvent({
      event: 'custom_cta_click',
      cta: v('skipAnywayLabel'),
      parentTitle: ctaTitle(),
      flowType: 'PBC',
      category: order[current],
      filter: state.filter,
      selectedValue: getTrackingSelectedValue(),
    });
    closePopup(false);
    const s = order[current];

    addToHistory();

    surfaceState[s].skipped = true;
    stepEls[s].li.classList.add('is-skipped');
    stepEls[s].skipped.hidden = false;
    if (!mq.matches) stepEls[s].area.hidden = true;
    advance();
    if (!result.hidden) return;
    skip.focus({ preventScroll: true });
  });
  popup.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closePopup(); }
  });
  popup.addEventListener('focusout', (e) => {
    const to = e.relatedTarget;
    if (!popup.hidden && to && !popup.contains(to) && to !== skip) closePopup(false);
  });
  backdrop.addEventListener('click', () => closePopup());

  // the walls range bar sticks under the header (desktop: once past the panel)
  const onScroll = () => {
    const nav = productsWrap.querySelector('.is-walls:not([hidden]) .bc-jump');
    if (!nav || select.hidden) return;
    const box = nav.parentElement.getBoundingClientRect();
    const head = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-height'), 10) || 64;
    const panelBottom = top.getBoundingClientRect().top + top.offsetHeight * 0.65;
    const stuck = mq.matches
      ? panelBottom <= 0 && box.bottom > 300
      : box.top <= head && box.bottom > 300;
    nav.classList.toggle('is-stuck', stuck);
    /* ===== FIX TAB BAR UNDER THE VISIBLE HEADER : START ===== */
    // the header shrinks on scroll (its top strip slides away), so the stuck bar goes just under
    // what is still visible of the header, as on the source (10px below it on desktop), not at
    // the full header height (--nav-height), which left a gap; without the header's sticky part
    // it stays as before
    const visibleHeader = document.querySelector('header .header-sticky');
    if (stuck && visibleHeader) {
      const headerBottom = Math.max(0, visibleHeader.getBoundingClientRect().bottom);
      const gap = mq.matches ? 10 : 0;
      nav.style.top = `${Math.round(headerBottom / (nav.currentCSSZoom || 1)) + gap}px`;
    } else {
      nav.style.removeProperty('top');
    }
    /* ===== FIX TAB BAR UNDER THE VISIBLE HEADER : END ===== */
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  // FIX TAB BAR UNDER THE VISIBLE HEADER: once more after the header's slide has finished
  let jumpSettle;
  window.addEventListener('scroll', () => {
    clearTimeout(jumpSettle);
    jumpSettle = setTimeout(onScroll, 400);
  }, { passive: true });

  /* --- results actions --- */
  const recalc = () => {
    pushAdobeCalculatorEvents({ event: 'calct_recalculate', flowType: 'PBC' });
    state.started = false;
    toInputs();
  };
  [again, again2].forEach((b) => b.addEventListener('click', recalc));
  const downloadPdf = async (b) => {
    if (b.classList.contains('is-busy') || !resultData) return;
    if (sessionStorage.getItem(PDF_FORM_KEY) !== 'true') {
      const resultTitle = rTitle.textContent.replace(/\s+/g, ' ').trim();
      pushAdobeCtaClickEvent({
        event: 'custom_cta_click',
        cta: v('downloadLabel'),
        parentTitle: resultTitle,
        flowType: 'PBC',
        filter: state.filter,
        category: order[current],
      });

      const outcome = await openLeadPopup();

      if (outcome === 'closed') return;

      if (outcome === 'done') {
        sessionStorage.setItem(PDF_FORM_KEY, 'true');
      }
    } else {
      pushAdobeCalculatorEvents({
        event: 'calct_download',
        flowType: 'PBC',
        filter: state.filter,
        productdetails: state.details,
        title: v('pdfFileName'),
      });
    }

    // like the source: the lead form first, once per visit; the PDF follows its submission
    if (sessionStorage.getItem(PDF_FORM_KEY) !== 'true') {
      const outcome = await openLeadPopup();
      if (outcome === 'closed') return;
      if (outcome === 'done') sessionStorage.setItem(PDF_FORM_KEY, 'true');
    }
    setBusy(b, true);
    try {
      const { downloadBudgetPdf } = await import('./budget-pdf.js');
      await downloadBudgetPdf(resultData, {
        topCoatTitle: v('topCoatTitle'),
        undercoatTitle: v('undercoatTitle'),
        totalTitle: v('totalTitle'),
        taxNote: v('pdfTaxNote'),
        undercoatTaxNote: v('pdfUndercoatTaxNote'),
        areaUnit: v('areaUnit'),
        quantityNote: v('quantityNote'),
        totalNote: v('totalNote'),
        wood: [v('woodUndercoatTitle'), v('woodUndercoatText'), v('woodUndercoatNote')],
        banner: img('pdfBanner')?.src || '',
        header: img('pdfHeader')?.src || '',
        callUs: img('pdfCallUs')?.src || '',
        logo: img('pdfLogo')?.src || '',
        icons: {
          walls: img('pdfWallsIcon')?.src || '',
          wood: img('pdfWoodIcon')?.src || '',
          metal: img('pdfMetalIcon')?.src || '',
        },
        fileName: v('pdfFileName'),
      });
    } catch (e) {
      announce(v('errorText'));
    }
    setBusy(b, false);
  };
  [download, mobDownload, download2].forEach((b) => b.addEventListener('click', () => downloadPdf(b)));

  mq.addEventListener('change', () => pagers.forEach((pg) => pg.sync()));
}
