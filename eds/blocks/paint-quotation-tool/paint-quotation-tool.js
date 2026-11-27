/**
 * Paint Quotation Calculator (PQC) — a 3-screen painting quotation calculator.
 * All copy is authored in DA; recommendations come from the calculator endpoint.
 *
 * Authoring: every row is `key | value`. A single-cell marker row reading
 * "Step 1", "Step 2" or "Step 3" starts that screen's rows; rows before the
 * first marker (e.g. Background, Endpoint) are shared.
 *
 * The screens have no copy in the code: a row that is not authored renders
 * nothing (with no Endpoint the recommendations cannot load, with no Minimum
 * Area any area above 0 is accepted). Only the PDF (pdf.js) keeps defaults.
 *
 * Shared
 *   Background           | desktop image | mobile image
 *   Endpoint             | /apcolourcatalogue/paintBudgetCalculator.pbc.json
 *                          (relative = environment's site host; full URL as-is)
 *
 * Step 1 — project details
 *   Title | Painting Quotation **Calculator**   (bold run = highlight colour)
 *   Subtitle | …                    Step Indicator | Step 01 of 03
 *   Question | Select your type of project * | • Fresh Painting • Repainting
 *   Question | Select the space * | • Interior • Exterior
 *   Area Label | …   Exterior Area Label | … (shown when Exterior is picked;
 *   Area Label if not authored)   Area Placeholder | …   Minimum Area | 100
 *   Area Error | … {min} …   ({min} = the Minimum Area)
 *   CTA | Calculate now
 *   API Error | Technical error. Please try again
 *   The CTA fetches the recommendations from the endpoint before moving on;
 *   if that fails, API Error shows below the CTA and the user stays on Step 1.
 *
 * Step 2 — lead form (prefilled from the CCFormFields cookie; skipped once it
 *   has been submitted, until the page is reloaded)
 *   Title | Your estimate **is almost ready**   Subtitle | …
 *   Field | Full Name * | Your Full Name       (label | placeholder; the type is
 *                                               inferred from the label)
 *   WhatsApp | Get updates on WhatsApp
 *   Question | When do you plan to start with the painting? * | • … • …
 *   Consent | rich text with links
 *   Submit Error | …   CTA | …
 *   Required Error | Field is required   Error Title | Sorry!
 *   Error Description | …   Error Calculate Again | Calculate again
 *   Error Close Icon | image
 *   When the lead cannot be sent, the Error panel replaces the form; its close
 *   icon brings the form back and Calculate again returns to Step 1.
 *   Fields are validated with form.js's rules and messages ("Field is
 *   required", "Email is invalid", "Phone number is invalid", "Enter a valid
 *   6 digit Zip Code"), on blur and again on submit.
 *   Skip Form | true | false   (optional, default false; set on the block as
 *     data-attr-skip-form, which scripts such as Adobe Target can change to
 *     show / skip the form)
 *   Campaign ID | id     (optional fallback for the form-config block's campaign_id)
 *   Node | path          (optional fallback for the form-config block's node)
 *   The lead's campaign ID and node are read as form.js reads them, from a
 *   form-config block (row 1 = campaign_id | id, row 2 = node | path) in this
 *   block's section, or else the nearest earlier, then later, section with
 *   one. utm_campaign wins over the campaign ID; the node defaults to the
 *   page path.
 *   On submit the lead is sent like the wallpaint-tool and budget-calculator-wbc
 *   blocks' (and a BHPS form in blocks/form/form.js): submitLeadFromForm saves
 *   it to the DB, then Salesforce. Only once that succeeds do the details go
 *   to the CCFormFields cookie and Step 3 open; on failure the Submit Error
 *   message shows and the user stays on Step 2.
 *
 * Step 3 — recommendations
 *   Calculate Again | …   Title | …   Subtitle | …   Description | rich text + list
 *   Card Title | …   Cost Label | … {area} …   Painting Area Label | … {area} x {factor} …
 *   Per Sqft Label | …   View Product | …   Products Title | …   Required Label | …
 *   Disclaimer | …   PDF Text | …   PDF CTA | …   Results Error | …
 *
 * PDF — generated in the browser from the card whose Download PDF was clicked
 *   Logo | image   Greeting | Dear   Default Name | Customer   Header Text | …
 *   Mobile Label | …   Email Label | …   Badge | Recommended Solution
 *   Product Subtitle | …   Cost Label | Total cost   Steps Title | …
 *   Step Label | STEP   Quantity Label | …   Coat Labels | COAT | COATS
 *   Layer Labels | PRIMER | PUTTY | TOP COAT   Disclaimer | …   Phone | …
 *   Call Text | … {phone}   Why Title | …   How Title | …   Plans Title | …
 *   Why Item | icon | title | description   (repeat; same for How Item)
 *   Plan | icon | name | "Included" + list, "Warranty" + list   (repeat)
 *   Plans Call Text | … {phone} …   File Name | …   Systems | all (default) | selected
 *   Loading Text | …   Ready Text | …   Open Text | … (iOS)   Error Text | …
 */
import {
  pushAdobeCalculatorEvents,
  pushAdobeFormEvents,
  pushAdobeCtaClickEvent,
  trackFormError,
} from '../../scripts/analytics_1.js';
import { BETA_DOMAIN, PROD_DOMAIN, isProdDomain } from '../../scripts/environment.js';

// The calculator API, product images and product pages are on the prod domain
// only on prod; every other host (beta, EDS preview/live, localhost) uses the
// beta domain.
const SITE_HOST = `https://${isProdDomain() ? PROD_DOMAIN : BETA_DOMAIN}`;
// Fixed request parameters the calculator endpoint expects (from the live calculator).
const REQUEST_DEFAULTS = {
  surface: '', language: 'en', apltype: 'APL_WEB', multiplierValue: '1.35',
};
const STEP_KEYS = ['stepOne', 'stepTwo', 'stepThree', 'stepFour'];

// The lead script (form-submit-common.js and its aesUtil.module.js) is kept
// off the block's render path, so it cannot delay LCP: it loads on first
// use, started by "Calculate now" while the recommendations API call runs.
let leadApi = null;
function loadLeadApi() {
  if (!leadApi) {
    leadApi = import('../../scripts/form-submit-common.js').catch((err) => {
      leadApi = null;
      throw err;
    });
  }
  return leadApi;
}

let uid = 0;

function slug(text) {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Rich text from a DA cell; bold/italic runs become the highlight colour.
function highlightHTML(cell) {
  const clone = (cell.querySelector('p') || cell).cloneNode(true);
  clone.querySelectorAll('strong, b, em').forEach((b) => {
    const span = el('span', 'paint-quotation-tool-highlight');
    span.innerHTML = b.innerHTML;
    b.replaceWith(span);
  });
  return clone.innerHTML;
}

// Label text with a trailing "*" wrapped so it can be styled separately.
function labelWithMark(node, text) {
  const match = text.match(/^(.*?)\s*\*$/);
  node.textContent = match ? `${match[1]} ` : text;
  if (match) node.append(el('span', 'paint-quotation-tool-mark', '*'));
  return node;
}

function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (m, key) => (key in values ? values[key] : m));
}

function toAssetUrl(path, page) {
  const clean = (path || '').trim();
  if (!clean) return '';
  if (/^https?:\/\//.test(clean)) return clean;
  // Product paths from the API sometimes omit ".html" and 404 without it.
  const withExt = page && !/\.html$/.test(clean) ? `${clean}.html` : clean;
  return SITE_HOST + withExt;
}

/* ------------------------------------------------------------ authoring */

function splitSteps(rows) {
  const groups = {
    shared: [], 1: [], 2: [], 3: [], pdf: [],
  };
  let current = 'shared';
  rows.forEach((row) => {
    const text = row.textContent.trim();
    const marker = row.children.length <= 1 && text.match(/^(?:step\s*(\d)|(pdf))$/i);
    if (marker) {
      current = marker[1] || 'pdf';
      return;
    }
    (groups[current] || groups.shared).push(row);
  });
  return groups;
}

// Reads `key | value [| value]` rows. Repeatable keys (Question, Field and
// the PDF's Why Item / How Item / Plan) are collected as lists; everything
// else keeps the last authored value.
function readRows(rows) {
  const cfg = {
    questions: [], fields: [], 'why-item': [], 'how-item': [], plan: [],
  };
  rows.forEach((row) => {
    const cells = [...row.children];
    if (cells.length < 2) return;
    const key = slug(cells[0].textContent);
    const value = cells[1];
    if (key === 'question') {
      const options = cells[2] ? [...cells[2].querySelectorAll('li')].map((li) => li.textContent.trim()) : [];
      cfg.questions.push({ label: value.textContent.trim(), options });
    } else if (key === 'field') {
      cfg.fields.push({ label: value.textContent.trim(), placeholder: cells[2] ? cells[2].textContent.trim() : '' });
    } else if (key === 'background') {
      cfg.background = cells.slice(1).map((c) => c.querySelector('img')).filter(Boolean);
    } else if (key in cfg && Array.isArray(cfg[key])) {
      // | Why Item / How Item / Plan | icon | title | description (rich) |
      cfg[key].push({
        icon: value.querySelector('img'),
        title: cells[2] ? cells[2].textContent.trim() : '',
        body: cells[3] || null,
      });
    } else {
      cfg[key] = { text: value.textContent.trim(), cell: value, cells: cells.slice(1) };
    }
  });
  return cfg;
}

// The authored text of a row ('' when the row is not authored).
const copy = (cfg, key) => (cfg[key] && cfg[key].text) || '';

/* ------------------------------------------------------------ form parts */

// Label, arrow icon and the loader shown in place of the arrow while busy.
function ctaContent(label) {
  const icon = el('span', 'paint-quotation-tool-cta-icon');
  const spinner = el('span', 'paint-quotation-tool-cta-spinner');
  spinner.textContent = '↻';
  icon.setAttribute('aria-hidden', 'true');
  spinner.setAttribute('aria-hidden', 'true');
  return [el('span', 'paint-quotation-tool-cta-label', label), icon, spinner];
}

function buildRadioGroup(question, name) {
  const group = el('fieldset', 'paint-quotation-tool-radio-group');
  group.append(labelWithMark(el('legend', 'paint-quotation-tool-radio-title'), question.label));
  const options = el('div', 'paint-quotation-tool-radio-options');
  question.options.forEach((value) => {
    uid += 1;
    const id = `pqc-${name}-${uid}`;
    const option = el('label', 'paint-quotation-tool-radio');
    option.htmlFor = id;
    const input = el('input');
    Object.assign(input, {
      type: 'radio', name, id, value, required: true,
    });
    option.append(input, el('span', 'paint-quotation-tool-radio-text', value));
    options.append(option);
  });
  group.append(options);
  return group;
}

// `strip` matches the characters removed as they are typed or pasted, as in
// form.js: digits only for the phone and pincode, letters and spaces for the
// name.
function fieldConfig(labelSlug) {
  if (labelSlug.includes('email')) {
    return { type: 'email', autocomplete: 'email' };
  }
  if (labelSlug.includes('mobile') || labelSlug.includes('phone')) {
    return {
      type: 'tel', autocomplete: 'tel-national', inputMode: 'numeric', pattern: '[0-9]{10}', maxLength: 10, prefix: '+91', strip: /\D/g,
    };
  }
  if (labelSlug.includes('pin')) {
    return {
      type: 'text', autocomplete: 'postal-code', inputMode: 'numeric', pattern: '[0-9]{6}', maxLength: 6, strip: /\D/g,
    };
  }
  return {
    type: 'text', autocomplete: 'name', pattern: '[A-Za-z ]{2,}', maxLength: 31, strip: /[^A-Za-z ]/g,
  };
}

// Validation rules and messages from form.js (getValidationMessage), keyed by
// the autocomplete hint fieldConfig() gives each lead input. The message for
// an empty field is the authored Required Error.
const FIELD_RULES = {
  email: { regex: /^\b[A-Z0-9._%-]+@[A-Z0-9.-]+\.[A-Z]{2,4}\b$/i, message: 'Email is invalid' },
  'postal-code': { regex: /^\d{6}$/, message: 'Enter a valid 6 digit Zip Code' },
  'tel-national': { regex: /^\d{10}$/, message: 'Phone number is invalid' },
};

// Names of the failed fields sent with form_error, as form.js reports them.
const FIELD_ERROR_NAMES = {
  name: 'Name',
  email: 'Email',
  'tel-national': 'MobileNumber',
  'postal-code': 'PINCode',
};

// null when the input is valid, else the message to show. The message can be
// '' (Required Error not authored), so validity is never read from its text.
function validationMessage(input, requiredMessage) {
  const value = input.value.trim();
  if (!value) return requiredMessage;
  const rule = FIELD_RULES[input.autocomplete];
  return rule && !rule.regex.test(value) ? rule.message : null;
}

// Ids for the lead inputs, keyed by the autocomplete hint fieldConfig() gives
// each one. Deliberately NOT the #enquire-* ids blocks/form uses, so a page
// holding this block and a form block never has duplicate ids; the shared
// helpers in scripts/form-submit-common.js are handed these selectors instead.
const LEAD_FIELD_IDS = {
  name: 'pqc-enquire-name',
  email: 'pqc-enquire-email',
  'tel-national': 'pqc-enquire-mobile',
  'postal-code': 'pqc-enquire-pincode',
};

const LEAD_SELECTORS = {
  name: `#${LEAD_FIELD_IDS.name}`,
  email: `#${LEAD_FIELD_IDS.email}`,
  mobile: `#${LEAD_FIELD_IDS['tel-national']}`,
  pincode: `#${LEAD_FIELD_IDS['postal-code']}`,
};

// The lead APIs only exist on the AEM site, not on EDS preview/live or the
// local `aem up` proxy, so off prod they are called on the beta domain. On
// prod the defaults (same-origin, relative paths) are used.
const LEAD_ENDPOINTS = !isProdDomain() ? {
  saveToDB: `https://${BETA_DOMAIN}/apcolourcatalogue/ccforms.saveleadform.json`,
  pushToSalesforce: `https://${BETA_DOMAIN}/apcolourcatalogue/ccforms/salesforce.leadstosalesforce.json`,
} : undefined;

const FORM_CONFIG_SELECTOR = '.form-config, .form-configs';

// As form.js finds it: the form-config block in this block's section, else
// the nearest earlier, then later, section with one (skipping form banners,
// which carry their own).
function findFormConfig(block) {
  const section = block.closest('.section');
  if (!section) return null;
  const own = section.querySelector(FORM_CONFIG_SELECTOR);
  if (own) return own;
  const inSection = (s) => (!s.classList.contains('form-banner-container')
    && s.querySelector(FORM_CONFIG_SELECTOR)) || null;
  for (let s = section.previousElementSibling; s; s = s.previousElementSibling) {
    const found = inSection(s);
    if (found) return found;
  }
  for (let s = section.nextElementSibling; s; s = s.nextElementSibling) {
    const found = inSection(s);
    if (found) return found;
  }
  return null;
}

// Reads `campaign_id | id` (row 1) and `node | path` (row 2) by position, as
// form.js does, and hides the config block (and its section, if that holds
// nothing else).
function readFormConfig(block) {
  const config = findFormConfig(block);
  if (!config) return { campaignId: '', node: '' };
  const value = (row) => {
    const cells = row ? [...row.children] : [];
    return (cells.length > 1 ? cells[1] : cells[0])?.textContent.trim() || '';
  };
  const [campaignRow, nodeRow] = [...config.children];

  config.style.display = 'none';
  const wrapper = config.closest('.form-config-wrapper, .form-configs-wrapper');
  if (wrapper) wrapper.style.display = 'none';
  const section = config.closest('.section');
  if (section && section !== block.closest('.section')
    && [...section.children].every((child) => child.contains(config))) {
    section.style.display = 'none';
  }

  return { campaignId: value(campaignRow), node: value(nodeRow) };
}

// As in form.js: "Immediate" and "Within a month" are sent as one merged
// value the backend expects.
function bhpsQuestionOneValue(value) {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'immediate' || normalized === 'within a month') {
    return 'Immediate/Within 1 Month';
  }
  return value;
}

function buildField({ label, placeholder }) {
  const cfg = fieldConfig(slug(label));
  uid += 1;
  const id = LEAD_FIELD_IDS[cfg.autocomplete] || `pqc-field-${uid}`;
  const field = el('div', 'paint-quotation-tool-field');
  const control = el('div', 'paint-quotation-tool-control');
  // The label floats onto the border once the field is focused or filled.
  const floating = labelWithMark(el('label', 'paint-quotation-tool-float-label'), label);
  floating.htmlFor = id;
  if (cfg.prefix) control.append(el('span', 'paint-quotation-tool-prefix', cfg.prefix));
  const input = el('input');
  input.id = id;
  input.name = slug(label.replace('*', '')) || id;
  input.type = cfg.type;
  input.placeholder = placeholder || ' ';
  input.required = true;
  input.autocomplete = cfg.autocomplete;
  if (cfg.inputMode) input.inputMode = cfg.inputMode;
  if (cfg.pattern) input.pattern = cfg.pattern;
  if (cfg.maxLength) input.maxLength = cfg.maxLength;
  if (cfg.strip) {
    input.addEventListener('input', () => {
      const allowed = input.value.replace(cfg.strip, '');
      if (input.value !== allowed) input.value = allowed;
    });
  }
  const error = el('p', 'paint-quotation-tool-error');
  error.id = `${id}-error`;
  input.setAttribute('aria-describedby', error.id);
  control.append(input, floating);
  field.append(control, error);
  return field;
}

// Height covered at the top of the viewport by fixed or sticky elements
// (the site header and nav bars), found by probing down from the top edge
// until a point is no longer covered by one.
function pinnedBottom(y, block) {
  let bottom = 0;
  [0.1, 0.5, 0.9].forEach((x) => {
    document.elementsFromPoint(window.innerWidth * x, y).forEach((node) => {
      for (let n = node; n && n !== document.body && !n.contains(block); n = n.parentElement) {
        const { position } = getComputedStyle(n);
        if (position === 'fixed' || position === 'sticky') {
          bottom = Math.max(bottom, n.getBoundingClientRect().bottom);
          break;
        }
      }
    });
  });
  return bottom;
}

function headerOverlap(block) {
  let bottom = 0;
  for (let probe = 0; probe < 5; probe += 1) {
    const next = pinnedBottom(bottom + 1, block);
    if (next <= bottom) break;
    bottom = next;
  }
  return Math.min(bottom, window.innerHeight / 2);
}

/* -------------------------------------------------------------- screen 1 */

function buildScreen1(cfg) {
  let step1InteractionTracked = false;
  const screen = el('section', 'paint-quotation-tool-screen paint-quotation-tool-details');
  screen.dataset.screen = '1';

  const intro = el('div', 'paint-quotation-tool-intro');
  if (cfg.title) {
    const title = el('h2', 'paint-quotation-tool-title');
    title.innerHTML = highlightHTML(cfg.title.cell);
    title.tabIndex = -1;
    intro.append(title);
  }
  if (cfg.subtitle) intro.append(el('p', 'paint-quotation-tool-subtitle', cfg.subtitle.text));

  const form = el('form', 'paint-quotation-tool-details-form');
  form.noValidate = true;
  if (cfg['step-indicator']) form.append(el('p', 'paint-quotation-tool-step', cfg['step-indicator'].text));

  const names = ['paint', 'category'];
  cfg.questions.forEach((q, i) => form.append(buildRadioGroup(q, names[i] || `question-${i}`)));

  // the authored Minimum Area; with none, any area above 0 is accepted
  const min = Number(copy(cfg, 'minimum-area')) || 0;
  uid += 1;
  const areaId = `pqc-area-${uid}`;
  const area = el('div', 'paint-quotation-tool-area');
  const areaLabel = labelWithMark(el('label', 'paint-quotation-tool-area-label'), copy(cfg, 'area-label'));
  areaLabel.htmlFor = areaId;

  // Exterior has its own label (Exterior Area Label) when one is authored.
  const updateAreaLabel = () => {
    const selectedCategory = form.querySelector('input[name="category"]:checked')?.value;

    labelWithMark(
      areaLabel,
      (selectedCategory === 'Exterior' && copy(cfg, 'exterior-area-label'))
        || copy(cfg, 'area-label'),
    );
  };

  const areaInput = el('input', 'paint-quotation-tool-area-input');
  Object.assign(areaInput, {
    id: areaId,
    name: 'area',
    type: 'text',
    inputMode: 'numeric',
    required: true,
    placeholder: copy(cfg, 'area-placeholder'),
  });
  const areaError = el('p', 'paint-quotation-tool-error', '');
  areaError.id = `${areaId}-error`;
  areaInput.setAttribute('aria-describedby', areaError.id);
  area.append(areaLabel, areaInput, areaError);
  form.append(area);

  const cta = el('button', 'paint-quotation-tool-cta');
  cta.type = 'submit';
  cta.disabled = true;
  cta.append(...ctaContent(copy(cfg, 'cta')));

  // shown below the CTA when the recommendations could not be fetched
  const apiError = el('p', 'paint-quotation-tool-api-error', copy(cfg, 'api-error'));
  apiError.setAttribute('role', 'alert');
  apiError.hidden = true;
  form.append(cta, apiError);

  const areaValue = () => Number(areaInput.value || 0);
  const update = () => {
    updateAreaLabel();
    areaInput.value = areaInput.value.replace(/\D/g, '');
    const tooSmall = areaInput.value !== '' && areaValue() < min;
    areaError.textContent = tooSmall ? fill(copy(cfg, 'area-error'), { min }) : '';
    areaInput.setAttribute('aria-invalid', String(tooSmall));
    const answered = cfg.questions.every((q, i) => form.querySelector(`input[name="${names[i] || `question-${i}`}"]:checked`));
    cta.disabled = !(answered && areaValue() > 0 && areaValue() >= min);
  };
  updateAreaLabel();
  form.addEventListener('input', update);
  form.addEventListener('change', update);

  const answers = () => ({
    area: String(areaValue()),
    paint: form.querySelector('input[name="paint"]:checked')?.value || '',
    category: form.querySelector('input[name="category"]:checked')?.value || '',
  });

  // start Add calc_start Event

  const trackFirstInteraction = (e) => {
    if (step1InteractionTracked) return;

    const target = e.target.closest('input');
    if (!target) return;

    step1InteractionTracked = true;

    pushAdobeCalculatorEvents({ event: 'calc_start', flowType: 'pqc' });
  };

  form.addEventListener('click', trackFirstInteraction);
  form.addEventListener('focusin', trackFirstInteraction);

  // end Add calc_start Event

  screen.append(intro, form);

  const setValues = ({ project, space, area: presetArea }) => {
    const paintRadio = form.querySelector(
      `input[name="paint"][value="${project}"]`,
    );

    if (paintRadio) {
      paintRadio.checked = true;
    }

    const categoryRadio = form.querySelector(
      `input[name="category"][value="${space}"]`,
    );

    if (categoryRadio) {
      categoryRadio.checked = true;
    }

    areaInput.value = presetArea || '';

    update();
  };

  return {
    screen,
    form,
    cta,
    apiError,
    answers,
    areaInput,
    setValues,
    resetCalcStart: () => {
      step1InteractionTracked = false;
    },
  };
}

/* -------------------------------------------------------------- screen 2 */

// campaignIdFor(api) gives the lead's campaign ID once the lead script has
// loaded (api is null if it failed to load).
function buildScreen2(cfg, campaignIdFor) {
  const screen = el('section', 'paint-quotation-tool-screen paint-quotation-tool-lead');
  screen.dataset.screen = '2';

  const intro = el('div', 'paint-quotation-tool-intro');
  if (cfg.title) {
    const title = el('h2', 'paint-quotation-tool-title');
    title.innerHTML = highlightHTML(cfg.title.cell);
    if (window.innerWidth < 768) {
      const highlight = title.querySelector('.paint-quotation-tool-highlight');

      if (highlight) {
        highlight.textContent = highlight.textContent.replace(/^is\s+/, '');
        title.insertBefore(document.createTextNode('is '), highlight);
      }
    }
    title.tabIndex = -1;
    intro.append(title);
  }
  if (cfg.subtitle) intro.append(el('p', 'paint-quotation-tool-subtitle', cfg.subtitle.text));

  const form = el('form', 'paint-quotation-tool-lead-form');
  form.noValidate = true;

  // Form Start Tracking Event Start
  let formStartTracked = false;

  const trackFormStart = (e) => {
    if (formStartTracked) return;

    const target = e.target.closest('input');
    if (!target) return;

    formStartTracked = true;

    loadLeadApi().catch(() => null).then((api) => {
      const campaignId = campaignIdFor(api);

      pushAdobeFormEvents({
        formCampaignId: campaignId,
        formName: cfg.title?.text || '',
        event: 'form_start',
      });
    });
  };

  form.addEventListener('focusin', trackFormStart);
  form.addEventListener('click', trackFormStart);

  const fields = el('div', 'paint-quotation-tool-fields');
  cfg.fields.forEach((f) => fields.append(buildField(f)));
  form.append(fields);

  if (cfg.whatsapp) {
    const optin = el('label', 'paint-quotation-tool-checkbox');
    const box = el('input');
    Object.assign(box, { type: 'checkbox', name: 'whatsapp-optin', checked: true });
    // initial state
    optin.classList.toggle('is-checked', box.checked);
    box.addEventListener('change', () => {
      optin.classList.toggle('is-checked', box.checked);
    });
    optin.append(box, el('span', '', cfg.whatsapp.text));
    form.append(optin);
  }

  if (cfg.questions.length) {
    const questions = el('div', 'paint-quotation-tool-lead-questions');
    cfg.questions.forEach((q, i) => {
      const group = buildRadioGroup(q, `lead-question-${i}`);
      if (i === 0) {
        group.querySelectorAll('input[type="radio"]').forEach((radio) => {
          radio.value = bhpsQuestionOneValue(radio.value);
        });
      }
      group.append(el('p', 'paint-quotation-tool-error'));
      questions.append(group);
    });
    form.append(questions);
  }

  if (cfg.consent) {
    const consent = el('p', 'paint-quotation-tool-consent');
    consent.innerHTML = (cfg.consent.cell.querySelector('p') || cfg.consent.cell).innerHTML;

    consent.querySelectorAll('a').forEach((a) => {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';

      a.addEventListener('click', () => {
        pushAdobeCtaClickEvent({
          event: 'cta_link_text',
          cta: a.textContent.trim(),
          destinationUrl: a.href,
          parentTitle: cfg.title?.text || '',
          linkUrl: a.href,
        });
      });
    });

    form.append(consent);
  }

  // shown when the lead could not be sent
  const submitError = el('p', 'paint-quotation-tool-submit-error', copy(cfg, 'submit-error'));
  submitError.setAttribute('role', 'alert');
  submitError.hidden = true;

  const cta = el('button', 'paint-quotation-tool-cta paint-quotation-tool-cta-submit');
  cta.type = 'submit';
  cta.append(...ctaContent(copy(cfg, 'cta')));
  form.append(submitError, cta);

  const requiredMessage = copy(cfg, 'required-error');

  // Shown in place of the form when the lead could not be sent.
  const failure = el('div', 'paint-quotation-tool-failure');
  failure.hidden = true;
  const again = el('button', 'paint-quotation-tool-again', '');
  again.type = 'button';
  again.append(el('span', '', copy(cfg, 'error-calculate-again')));
  const panel = el('div', 'paint-quotation-tool-failure-panel');
  panel.setAttribute('role', 'alert');
  const close = el('button', 'paint-quotation-tool-failure-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  // the authored Error Close Icon (the button stays clickable without one)
  const closeImg = cfg['error-close-icon']?.cell.querySelector('img');
  if (closeImg) {
    const icon = el('img');
    Object.assign(icon, { src: closeImg.currentSrc || closeImg.src, alt: '' });
    close.append(icon);
  }
  panel.append(close);
  const errorTitle = copy(cfg, 'error-title');
  if (errorTitle) panel.append(el('h3', 'paint-quotation-tool-failure-title', errorTitle));
  panel.append(el('p', 'paint-quotation-tool-failure-text', copy(cfg, 'error-description')));
  failure.append(again, panel);
  const showFailure = () => {
    form.hidden = true;
    failure.hidden = false;
    screen.classList.add('is-failed');
  };
  const hideFailure = () => {
    form.hidden = false;
    failure.hidden = true;
    screen.classList.remove('is-failed');
  };
  close.addEventListener('click', hideFailure);

  // `invalid` is passed separately because the message can be '' (Required
  // Error not authored) while the field is still invalid.
  const setError = (holder, message, invalid = Boolean(message)) => {
    const error = holder.querySelector(':scope > .paint-quotation-tool-error');
    if (error) error.textContent = message;
    holder.classList.toggle('is-invalid', invalid);
  };

  // Checks one text field and shows (or clears) its error in place.
  const validateField = (field) => {
    const input = field.querySelector('input');
    const message = validationMessage(input, requiredMessage);
    const invalid = message !== null;
    setError(field, message || '', invalid);
    input.setAttribute('aria-invalid', String(invalid));
    return !invalid;
  };

  // Validates every field and question, showing each error in place, and
  // returns the names of those that failed (none when the form is valid).
  const validate = () => {
    const failed = [];
    let firstInvalid = null;
    form.querySelectorAll('.paint-quotation-tool-field').forEach((field) => {
      if (validateField(field)) return;
      const input = field.querySelector('input');
      failed.push(FIELD_ERROR_NAMES[input.autocomplete] || input.name);
      firstInvalid = firstInvalid || input;
    });
    form.querySelectorAll('.paint-quotation-tool-lead-questions .paint-quotation-tool-radio-group').forEach((group) => {
      const checked = group.querySelector('input:checked');
      setError(group, checked ? '' : requiredMessage, !checked);
      if (checked) return;
      failed.push(group.querySelector('legend')?.firstChild?.textContent.trim() || 'disclaimer question');
      firstInvalid = firstInvalid || group.querySelector('input');
    });
    if (firstInvalid) firstInvalid.focus();
    return failed;
  };

  // A field is checked as soon as the user leaves it, and while it shows an
  // error it is re-checked on every keystroke, so the error clears once fixed.
  form.addEventListener('focusout', (e) => {
    const field = e.target.closest('.paint-quotation-tool-field');
    if (field) validateField(field);
  });
  form.addEventListener('input', (e) => {
    const field = e.target.closest('.paint-quotation-tool-field');
    if (field && field.classList.contains('is-invalid')) validateField(field);
  });
  form.addEventListener('change', (e) => {
    const group = e.target.closest('.paint-quotation-tool-radio-group');
    if (group) setError(group, '');
  });

  const data = () => Object.fromEntries(new FormData(form).entries());

  screen.append(intro, form, failure);
  return {
    screen,
    form,
    cta,
    submitError,
    again,
    showFailure,
    hideFailure,
    validate,
    data,
    skip: copy(cfg, 'skip-form').toLowerCase() === 'true',
  };
}

/* -------------------------------------------------------------- screen 3 */

function parseStep(raw) {
  if (!raw || !raw.trim()) return null;
  const parts = raw.split('|').map((p) => p.trim());
  const [, coats, name] = parts[0].match(/^(\d+)\s+(.*)$/) || [null, '', parts[0]];
  return {
    name,
    coats: Number(coats) || 0,
    image: toAssetUrl(parts[1]),
    link: toAssetUrl(parts[2], true),
    quantity: (parts[6] || '').replace(/\s+/g, ' '),
  };
}

function buildScreen3(cfg, onPdf, getTrackingValue) {
  const screen = el('section', 'paint-quotation-tool-screen paint-quotation-tool-results');
  screen.dataset.screen = '3';

  const again = el('button', 'paint-quotation-tool-again');
  again.type = 'button';
  again.append(el('span', '', copy(cfg, 'calculate-again')));

  const info = el('div', 'paint-quotation-tool-info');
  const titleText = copy(cfg, 'title');
  if (titleText) {
    const title = el('h2', 'paint-quotation-tool-info-title', titleText);
    title.tabIndex = -1;
    info.append(title);
  }
  if (cfg.subtitle) info.append(el('p', 'paint-quotation-tool-info-subtitle', cfg.subtitle.text));
  const description = cfg.description ? cfg.description.cell.innerHTML : '';
  if (description) {
    const desc = el('div', 'paint-quotation-tool-info-description');
    desc.innerHTML = description;
    info.append(desc);
  }

  const aside = el('div', 'paint-quotation-tool-info-column');
  aside.append(again.cloneNode(true), info);

  const carousel = el('div', 'paint-quotation-tool-carousel');
  carousel.setAttribute('aria-roledescription', 'carousel');
  const prev = el('button', 'paint-quotation-tool-nav paint-quotation-tool-nav-prev');
  prev.type = 'button';
  prev.setAttribute('aria-label', 'Previous recommendation');
  const next = el('button', 'paint-quotation-tool-nav paint-quotation-tool-nav-next');
  next.type = 'button';
  next.setAttribute('aria-label', 'Next recommendation');
  const stack = el('div', 'paint-quotation-tool-stack');
  const status = el('p', 'paint-quotation-tool-sr-only');
  status.setAttribute('aria-live', 'polite');
  const mobileNav = el('div', 'paint-quotation-tool-mobile-nav');
  mobileNav.append(again);
  carousel.append(prev, stack, next, mobileNav, status);

  screen.append(aside, carousel);

  // The card copy, as authored ('' for a row that is not). Painting Area Label
  // and Per Sqft Label are also used in the PDF.
  const L = {
    card: copy(cfg, 'card-title'),
    cost: copy(cfg, 'cost-label'),
    paintArea: copy(cfg, 'painting-area-label'),
    perSqft: copy(cfg, 'per-sqft-label'),
    view: copy(cfg, 'view-product'),
    products: copy(cfg, 'products-title'),
    required: copy(cfg, 'required-label'),
    disclaimer: copy(cfg, 'disclaimer'),
    pdfText: copy(cfg, 'pdf-text'),
    pdfCta: copy(cfg, 'pdf-cta'),
    error: copy(cfg, 'results-error'),
  };

  const viewLink = (href, productTitle) => {
    const a = el('a', 'paint-quotation-tool-view', L.view);

    a.addEventListener('click', () => {
      const trackingValue = getTrackingValue();

      pushAdobeCalculatorEvents({
        event: 'calct_product_view',
        filter: trackingValue,
        productdetails: productTitle,
        parentTitle: 'Basic',
      });
    });

    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  };

  function buildCard(system, area) {
    const card = el('article', 'paint-quotation-tool-card');
    const name = system.entityName || system.title || '';
    const cost = Number(system.bhpsCost) || 0;
    const perSqft = Number(system.totalCostPerSqFt) || 0;
    const productDetailsTrack = `${name} | Rs.${cost.toFixed(2)}* | Rs.${perSqft.toFixed(2)}`;
    const paintArea = perSqft ? Math.round(cost / perSqft) : 0;
    const factor = area ? Number((paintArea / area).toFixed(2)) : 0;

    if (L.card) card.append(el('h3', 'paint-quotation-tool-card-title', L.card));

    const media = el('div', 'paint-quotation-tool-card-media');
    if (system.swatchImage) {
      const img = el('img');
      Object.assign(img, { src: toAssetUrl(system.swatchImage), alt: name, loading: 'lazy' });
      media.append(img);
    }
    card.append(media, el('p', 'paint-quotation-tool-card-name', name));

    const prices = el('dl', 'paint-quotation-tool-prices');
    const row = (label, value, mark) => {
      const dd = el('dd', '', value);
      if (mark) dd.append(el('span', 'paint-quotation-tool-mark', '*'));
      prices.append(el('dt', '', label), dd);
    };
    row(fill(L.cost, { area }), `Rs.${cost.toFixed(2)}`, true);
    row(fill(L.paintArea, { area, factor }), `${paintArea} sqft`);
    row(L.perSqft, `Rs.${perSqft.toFixed(2)}`);
    card.append(prices);

    if (system.pageUrl) {
      card.append(viewLink(toAssetUrl(system.pageUrl, true), name));
    }

    // Painting process: each step's product, in application order.
    const steps = STEP_KEYS.map((k) => parseStep(system[k])).filter(Boolean);
    if (steps.length) {
      const products = el('div', 'paint-quotation-tool-products');
      if (L.products) products.append(el('h4', 'paint-quotation-tool-products-title', L.products));
      const list = el('ol', 'paint-quotation-tool-products-list');
      steps.forEach((step) => {
        const item = el('li', 'paint-quotation-tool-product');
        if (step.coats) item.dataset.coats = step.coats;
        item.append(el('p', 'paint-quotation-tool-product-name', step.name));
        const qty = el('div', 'paint-quotation-tool-product-qty');
        if (step.image) {
          const img = el('img');
          Object.assign(img, { src: step.image, alt: '', loading: 'lazy' });
          qty.append(img);
        }
        const amount = el('p', 'paint-quotation-tool-product-amount');
        amount.append(el('strong', '', step.quantity), el('span', '', L.required));
        qty.append(amount);
        item.append(qty);
        if (step.link) item.append(viewLink(step.link, step.name));
        list.append(item);
      });
      products.append(list);
      card.append(products);
    }

    if (L.disclaimer) {
      const disclaimer = el('p', 'paint-quotation-tool-disclaimer');
      disclaimer.append(el('span', 'paint-quotation-tool-mark', '*'), L.disclaimer);
      card.append(disclaimer);
    }

    // The Step 3 description is repeated inside the card for mobile.
    if (description) {
      const includes = el('div', 'paint-quotation-tool-card-includes');
      includes.innerHTML = description;
      card.append(includes);
    }

    // Download PDF: generates a PDF from this card's recommendation. While it
    // is prepared, a small spinner shows inside the button, next to the icon.
    const pdf = el('div', 'paint-quotation-tool-pdf');
    pdf.append(el('p', '', system.pdfText || L.pdfText));
    const pdfButton = el('button', 'paint-quotation-tool-pdf-cta');
    pdfButton.type = 'button';
    const icon = el('span', 'paint-quotation-tool-pdf-icon');
    const spinner = el('span', 'paint-quotation-tool-pdf-spinner');
    spinner.textContent = '↻';
    icon.setAttribute('aria-hidden', 'true');
    spinner.setAttribute('aria-hidden', 'true');
    pdfButton.append(
      el('span', 'paint-quotation-tool-pdf-label', system.pdfCtaText || L.pdfCta),
      icon,
      spinner,
    );

    pdfButton.addEventListener('click', () => {
      const trackingValue = getTrackingValue();

      pushAdobeCalculatorEvents({
        event: 'calct_download',
        filter: trackingValue,
        productdetails: productDetailsTrack,
      });

      onPdf(system, pdfButton);
    });
    const pdfStatus = el('p', 'paint-quotation-tool-sr-only');
    pdfStatus.setAttribute('aria-live', 'polite');
    pdf.append(pdfButton, el('p', 'paint-quotation-tool-pdf-error'), pdfStatus);
    card.append(pdf);
    return card;
  }

  let index = 0;
  let cards = [];

  // Every card is as tall as the tallest one, so moving between cards never
  // changes the layout height (which made the results screen jump).
  function normalizeHeights() {
    if (!cards.length) {
      stack.style.height = '';
      return;
    }
    stack.classList.add('is-measuring');
    const tallest = Math.max(...cards.map((card) => card.offsetHeight));
    stack.classList.remove('is-measuring');
    if (tallest) stack.style.height = `${tallest}px`;
  }

  // Re-measure when the stack's width changes: on resize, and when the
  // results screen is shown (its width goes from 0 while hidden).
  let stackWidth = -1;
  new ResizeObserver(([entry]) => {
    const { width } = entry.contentRect;
    if (width === stackWidth) return;
    stackWidth = width;
    if (width) normalizeHeights();
  }).observe(stack);
  if (document.fonts) document.fonts.ready.then(normalizeHeights);

  // Position every card relative to the active one: the two after it peek
  // out beneath it and the rest wait "out" below the stack. Moving between
  // these states is animated in CSS, so the incoming card rises from the
  // bottom of the stack. Inactive cards are inert.
  function show(i) {
    const total = cards.length;
    index = Math.max(0, Math.min(i, total - 1));
    // Behind the active card: the upcoming cards first, then earlier ones nearest-first.
    const behind = [
      ...cards.slice(index + 1),
      ...cards.slice(0, index).reverse(),
    ];
    cards.forEach((card, n) => {
      const offset = n === index ? 0 : behind.indexOf(card) + 1;
      card.dataset.position = offset < 3 ? String(offset) : 'out';
      card.inert = offset !== 0;
    });
    prev.disabled = index === 0;
    next.disabled = index >= total - 1;
    status.textContent = cards.length ? `${index + 1} of ${cards.length}` : '';
  }
  prev.addEventListener('click', () => show(index - 1));
  next.addEventListener('click', () => show(index + 1));

  // Swipe between cards on touch screens.
  let touchX = null;
  stack.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  stack.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) show(index + (dx < 0 ? 1 : -1));
    touchX = null;
  });

  function render(systems, area) {
    stack.textContent = '';
    cards = [...systems]
      .sort((a, b) => (Number(a.systemRank) || 0) - (Number(b.systemRank) || 0))
      .map((s) => buildCard(s, Number(area)));
    if (!cards.length) {
      stack.append(el('p', 'paint-quotation-tool-results-error', L.error));
    }
    stack.append(...cards);
    carousel.classList.toggle('is-single', cards.length < 2);
    show(0);
    normalizeHeights();
  }

  return {
    screen, againButtons: [again, aside.querySelector('.paint-quotation-tool-again')], render, labels: L,
  };
}

/* ----------------------------------------------------------------- data */

// A relative endpoint (as authored) is called on the environment's site host;
// a full URL is used as-is.
function endpointUrl(endpoint) {
  return /^https?:\/\//.test(endpoint) ? endpoint : SITE_HOST + endpoint;
}

async function fetchSystems(endpoint, answers) {
  if (!endpoint) throw new Error('no "Endpoint" row authored');
  const params = new URLSearchParams({ ...REQUEST_DEFAULTS, ...answers });
  const res = await fetch(`${endpointUrl(endpoint)}?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('unexpected response');
  return data;
}

/* ----------------------------------------------------------------- block */

export default function decorate(block) {
  const groups = splitSteps([...block.children]);
  const shared = readRows(groups.shared);
  const pdfConfig = readRows(groups.pdf);
  // The lead's contact details personalise the PDF (greeting, mobile, email).
  let lead = null;
  // As in budget-calculator-wbc: once the lead form has been completed, Step 2
  // is skipped on later "Calculate now"s (e.g. after "Calculate again").
  let formCompleted = false;

  let flowType = '';
  let results = { systems: [], area: '' };

  // Helper functions for the paint quotation tool block miniform

  const isMiniFormFlow = () => new URLSearchParams(window.location.search)
    .get('source')
    ?.toLowerCase() === 'pbc_miniform';

  let trackingValue = '';
  let step3 = null;

  // Download PDF on a card: the PDF module and its libraries load on demand.
  async function onPdf(system, button) {
    const { default: downloadPdf } = await import('./pdf.js');
    downloadPdf({
      block,
      button,
      system,
      systems: results.systems,
      area: results.area,
      config: pdfConfig,
      labels: step3.labels,
      lead,
    });
  }

  // The lead's campaign ID and node come from the form-config block, falling
  // back to Step 2's Campaign ID / Node rows; as in form.js, utm_campaign
  // wins over the authored campaign ID and the node defaults to the page path.
  // utm_campaign is read with the lead script, once it has loaded (api is
  // null if it failed to load).
  const step2Config = readRows(groups[2]);
  const formConfig = readFormConfig(block);
  const authoredCampaignId = formConfig.campaignId || copy(step2Config, 'campaign-id');
  const campaignIdFor = (api) => api?.getCampaignIdFromUrl() || authoredCampaignId;
  const node = formConfig.node || copy(step2Config, 'node') || window.location.pathname;

  const step1 = buildScreen1(readRows(groups[1]));
  const step2 = buildScreen2(step2Config, campaignIdFor);
  step3 = buildScreen3(
    readRows(groups[3]),
    onPdf,
    () => trackingValue,
  );

  const endpoint = copy(shared, 'endpoint');

  // Changing screens scrolls the block's top into view, just below any
  // fixed or sticky site header, so no part of the new screen is hidden.
  const go = (n) => {
    block.dataset.screen = String(n);
    const target = block.querySelector(`.paint-quotation-tool-screen[data-screen="${n}"] [tabindex="-1"]`);
    if (target) target.focus({ preventScroll: true });
    const top = block.getBoundingClientRect().top + window.scrollY - headerOverlap(block);
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };

  // Step 1's CTA fetches the recommendations and renders them into Step 3
  // before moving on, so if the calculator API is down the API Error message
  // shows below that CTA and the user stays on Step 1. Resolves to whether
  // the recommendations loaded.
  async function loadResults() {
    const answers = step1.answers();
    const { cta, apiError } = step1;
    apiError.hidden = true;
    cta.disabled = true;
    cta.classList.add('is-loading');
    block.setAttribute('aria-busy', 'true');
    try {
      const systems = await fetchSystems(endpoint, answers);
      results = { systems, area: answers.area };
      trackingValue = [
        answers.paint,
        answers.category,
        answers.area,
      ].join('|');
      step3.render(systems, answers.area);
      return true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('paint-quotation-tool recommendations failed to load', err);
      apiError.hidden = false;
      return false;
    } finally {
      cta.disabled = false;
      cta.classList.remove('is-loading');
      block.removeAttribute('aria-busy');
    }
  }

  // The calculatorhub's answers are used once, as wbc-calculator uses them: removed once read, so
  // a reload starts on Step 1 while every new hub submission (which saves them again) is picked
  // up, also in the same tab.
  function takeMiniFormValues() {
    try {
      const values = JSON.parse(localStorage.getItem('miniFormValues') || '{}');
      localStorage.removeItem('miniFormValues');
      return values || {};
    } catch {
      return {};
    }
  }

  // Opens Step 3 with the recommendations loadResults() rendered.
  function showResults() {
    pushAdobeCalculatorEvents({
      event: 'calct_submit',
      filter: trackingValue,
      parentTitle: 'Basic',
      ...(flowType && { flowType }),
    });

    go(3);
  }

  // A visitor who already sent a lead: the apLeadFormFilled cookie is "true".
  const leadFormFilled = () => /(?:^|;\s*)apLeadFormFilled=true(?:;|$)/.test(document.cookie);

  async function handleMiniFormJourney() {
    if (!isMiniFormFlow()) return;

    flowType = 'SPS_PBC_Miniform';

    const values = takeMiniFormValues();

    if (
      !values.ProjectType
      || !values.SpaceType
      || !values.Area
    ) {
      return;
    }

    // Step 1 stays hidden behind a loader (is-handoff) until the next screen opens, so it does
    // not flash while the results load; it shows only when they fail (with the API Error).
    block.classList.add('is-handoff');
    try {
      step1.setValues({
        project: values.ProjectType,
        space: values.SpaceType,
        area: values.Area,
      });

      const loaded = await loadResults();

      if (!loaded) return;

      // With the apLeadFormFilled cookie, Step 2 is skipped: the results open directly.
      if (leadFormFilled()) {
        showResults();
        return;
      }

      const api = await loadLeadApi().catch(() => null);

      if (api) {
        api.checkCookieValues(step2.form, LEAD_SELECTORS);
      }

      go(2);
    } finally {
      block.classList.remove('is-handoff');
    }
  }

  step1.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (step1.cta.disabled) return;

    // Calc_continue Tracking event start
    const answers = step1.answers();
    const continueFilter = [
      answers.paint,
      answers.category,
      answers.area,
    ].join('|');
    pushAdobeCalculatorEvents({ event: 'calc_continue', filter: continueFilter, parentTitle: 'Basic' });
    // Calc_continue Tracking event start

    // The lead form is likely to show: load its script alongside the API call.
    if (!formCompleted && block.dataset.attrSkipForm !== 'true') loadLeadApi().catch(() => {});

    const loaded = await loadResults();
    if (!loaded) return;

    // Skip Step 2 when data-attr-skip-form is "true" (read now, not at
    // decorate, so a script such as Adobe Target can change it) or once the
    // lead form has already been completed; otherwise show the lead form.
    const skipForm = block.dataset.attrSkipForm === 'true';
    if (skipForm || formCompleted) {
      showResults();
    } else {
      // prefill from the CCFormFields cookie now (not at decorate) so details
      // saved by another form on this page since load are picked up too; the
      // lead script loaded during the API call (no prefill if it failed: the
      // submit then shows the lead error)
      const api = await loadLeadApi().catch(() => null);
      if (api) api.checkCookieValues(step2.form, LEAD_SELECTORS);
      go(2);
    }
  });

  const leadFormName = () => step2.screen
    .querySelector('.paint-quotation-tool-title')
    ?.textContent
    .trim() || '';

  // The authored label of a checked lead question (as form.js tracks it),
  // not its value, which may be the merged backend value.
  const answerLabel = (name) => step2.form
    .querySelector(`input[name="${name}"]:checked`)
    ?.closest('label')
    .textContent.trim() || '';

  function trackFormSubmit(formData, campaignId) {
    const formName = leadFormName();
    const extraData = {
      whatsappOptIn: formData['whatsapp-optin'] ? 'checked' : 'unchecked',
      dataDestination: 'both',
      contruction: answerLabel('lead-question-0'),
      localpainter: answerLabel('lead-question-1'),
    };

    pushAdobeFormEvents({
      event: 'form_submit', formName, formCampaignId: campaignId, construction: answerLabel('lead-question-0'), localPainter: answerLabel('lead-question-1'), ...extraData,
    });
  }

  step2.form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (step2.form.dataset.submitting === 'true') return;
    // As in form.js, the fields that failed are reported with form_error.
    const failed = step2.validate();
    if (failed.length) {
      const formName = leadFormName();
      loadLeadApi().catch(() => null).then((api) => {
        trackFormError({ campaignId: campaignIdFor(api), formName, formError: failed });
      });
      return;
    }

    // Send the lead exactly as wallpaint-tool / budget-calculator-wbc do for
    // a BHPS form; the two lead questions are read as its remarks and answer
    // fields. Step 3 only opens once the lead has been saved. If the lead
    // script itself fails to load, the Error panel shows as for a failed send.
    step2.form.dataset.submitting = 'true';
    step2.submitError.hidden = true;
    step2.cta.disabled = true;
    step2.cta.classList.add('is-loading');
    loadLeadApi()
      .then((api) => api.submitLeadFromForm(step2.form, {
        resourcePath: node,
        campaignId: campaignIdFor(api),
        endpoints: LEAD_ENDPOINTS,
        selectors: {
          ...LEAD_SELECTORS,
          whatsappConsent: 'input[name="whatsapp-optin"]',
          constructionWorkGoingOnRadio: '[name="lead-question-0"]:checked',
          localPainterHiredRadio: '[name="lead-question-1"]:checked',
        },
      }).then(() => api))
      .then((api) => {
        const formData = step2.data();
        api.setFormFieldsToCookie(step2.form, LEAD_SELECTORS);
        formCompleted = true;
        lead = formData;
        trackFormSubmit(formData, campaignIdFor(api));
        // Integration hook: the lead data is handed to whoever listens for it.
        block.dispatchEvent(new CustomEvent('paint-quotation-tool:lead', {
          bubbles: true, detail: { ...formData, ...step1.answers() },
        }));
        // the recommendations were already loaded by Step 1's CTA
        showResults();
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('paint-quotation-tool lead submission failed', err);
        step2.showFailure();
      })
      .finally(() => {
        step2.form.dataset.submitting = 'false';
        step2.cta.disabled = false;
        step2.cta.classList.remove('is-loading');
      });
  });

  step3.againButtons.forEach((btn) => btn.addEventListener('click', () => {
    pushAdobeCalculatorEvents({
      event: 'calct_recalculate',
    });

    flowType = ''; // add this

    step1.resetCalcStart();

    go(1);
  }));

  step2.again.addEventListener('click', () => {
    step2.hideFailure();
    go(1);
  });

  const [desktopImg, mobileImg] = shared.background || [];
  const src = (img) => (img ? (img.currentSrc || img.src).split('?')[0] : '');
  block.textContent = '';
  if (desktopImg) block.style.setProperty('--bg-image-desktop', `url("${src(desktopImg)}")`);
  if (mobileImg || desktopImg) block.style.setProperty('--bg-image-mobile', `url("${src(mobileImg || desktopImg)}")`);
  block.dataset.screen = '1';
  // The authored "Skip Form" as data-attr-skip-form="true|false" (false when
  // not authored), which is what "Calculate now" reads, so a script such as
  // Adobe Target can switch the lead form on or off by changing the
  // attribute. A value already on the block (set by a script before
  // decoration) is kept over the authored one.
  if (!block.hasAttribute('data-attr-skip-form')) {
    block.dataset.attrSkipForm = String(step2.skip);
  }
  block.append(step1.screen, step2.screen, step3.screen);
  handleMiniFormJourney();
}
