import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  postFormUrlEncoded, buildLeadPayload, checkCookieValues, setFormFieldsToCookie,
  markLeadFormFilled,
} from '../../scripts/form-submit-common.js';
import { getMarketingChannelDetails } from '../../scripts/marketing-channel.js';
import {
  dataRequest, mapData, roomList, quote,
} from './pricing.js';
import { pushAdobeFormEvents, pushAdobeCtaClickEvent, pushAdobeCalculatorEvents } from '../../scripts/analytics_1.js';

/**
 * bhs-calculator — the Interior Design Solution Cost Calculator: pick rooms
 * (with counts), pick a package, leave contact details; the lead is saved and
 * the visitor is sent to the result page (custom package: a thank-you popup).
 * Source: asianpaints.com/resources/tools/interior-design-solutions-calculator
 * (section "bhs-calculator"). Authoring, data flow and deviations: README.md.
 *
 * Authoring (DA table): label | value rows (all optional, source text is the
 * default), then a "Package | Image | Name | Text | Features" section and an
 * optional "Room" section (rooms shown only if the data endpoint can't be
 * reached; normally rooms and prices come from the endpoint, as on the source).
 */

const DEFAULTS = {
  title: 'Interior Design Solution Cost Calculator',
  finalTitle: 'One last Step!',
  step1Label: 'Step 1/3',
  step1Heading: 'Select which room(s) to makeover',
  step2Label: 'Step 2/3',
  step2Heading: 'Pick the package that suits you the best',
  step3Label: 'Step 3 /3',
  step3Heading: 'Excited to be part of your dream home journey!',
  step3Subheading: 'Your free quote is just a few details away!',
  nextLabel: 'Next',
  backLabel: 'Back',
  submitLabel: 'Submit',
  selectLabel: 'Select',
  selectedLabel: 'Selected',
  decreaseLabel: 'Decrease',
  increaseLabel: 'Increase',
  nameLabel: 'Name',
  namePlaceholder: 'Your Full Name',
  emailLabel: 'Email',
  emailPlaceholder: 'Eg: myname@gmail.com',
  mobileLabel: 'Mobile Number',
  mobilePlaceholder: '10 digits',
  countryCode: '+91',
  pinLabel: 'PIN Code',
  pinPlaceholder: '6 digit PIN code',
  requiredError: 'Field is required',
  nameError: 'Username is not valid',
  emailError: 'Email is invalid',
  mobileError: 'Phone number is invalid',
  pinError: 'Enter a valid 6 digit Zip Code',
  whatsappLabel: 'Update me on WhatsApp',
  whatsappDefault: 'true',
  whatsappOn: 'ON',
  whatsappOff: 'OFF',
  loadingText: 'Please allow us a moment as we generate an estimate for your home!',
  thankYouTitle: 'Thank you!',
  thankYouText: 'Your details for home makeover have been recorded, we will get in touch within 4 hours to create a personalised package.',
  errorTitle: 'Sorry!!!',
  errorText: 'There was some error while getting your quotation. We have recorded your details for Asian Paints Beautiful Homes Painting services. We will get in touch with you shortly.',
  popupHeading: 'Are you looking for home design inspiration?',
  popupText: 'Look at tailor-made designs from our interior design experts.',
  popupCtaLabel: 'Get home décor ideas',
  closeLabel: 'Close',
  newTabNote: '(opens in a new tab)',
  dataEndpoint: '/apcolourcatalogue/bhscalculator.json',
  dataPath: '/content/dam/Ap-Bhs/content-fragment/bhs-calculator-cf',
  saveEndpoint: '/apcolourcatalogue/ccforms.saveleadform.json',
  salesforceEndpoint: '/apcolourcatalogue/ccforms/salesforce.leadstosalesforce.json',
  pdfEndpoint: '/apcolourcatalogue/ccforms.azurePdfUpload.json',
  quotePdf: 'true',
  skipForm: 'false',
  campaignId: '',
  leadNode: '',
};

// label | value rows (lower-cased label -> field)
const FIELDS = {
  title: 'title',
  'final step title': 'finalTitle',
  'background image': 'bgImage',
  'mobile banner image': 'bannerImage',
  'step 1 label': 'step1Label',
  'step 1 heading': 'step1Heading',
  'step 2 label': 'step2Label',
  'step 2 heading': 'step2Heading',
  'step 3 label': 'step3Label',
  'step 3 heading': 'step3Heading',
  'step 3 subheading': 'step3Subheading',
  'next label': 'nextLabel',
  'back label': 'backLabel',
  'submit label': 'submitLabel',
  'select label': 'selectLabel',
  'selected label': 'selectedLabel',
  'decrease label': 'decreaseLabel',
  'increase label': 'increaseLabel',
  'name label': 'nameLabel',
  'name placeholder': 'namePlaceholder',
  'email label': 'emailLabel',
  'email placeholder': 'emailPlaceholder',
  'mobile label': 'mobileLabel',
  'mobile placeholder': 'mobilePlaceholder',
  'country code': 'countryCode',
  'pin code label': 'pinLabel',
  'pin code placeholder': 'pinPlaceholder',
  'required error': 'requiredError',
  'name error': 'nameError',
  'email error': 'emailError',
  'mobile error': 'mobileError',
  'pin code error': 'pinError',
  'whatsapp label': 'whatsappLabel',
  'whatsapp default': 'whatsappDefault',
  'whatsapp on label': 'whatsappOn',
  'whatsapp off label': 'whatsappOff',
  disclaimer: 'disclaimer',
  'disclaimer links open in new tab': 'disclaimerNewTab',
  'loading image': 'loadingImage',
  'loading text': 'loadingText',
  'thank you title': 'thankYouTitle',
  'thank you text': 'thankYouText',
  'error title': 'errorTitle',
  'error text': 'errorText',
  'popup heading': 'popupHeading',
  'popup text': 'popupText',
  'popup cta label': 'popupCtaLabel',
  'popup cta link': 'popupCtaLink',
  'popup image': 'popupImage',
  'popup mobile image': 'popupMobileImage',
  'close label': 'closeLabel',
  'data endpoint': 'dataEndpoint',
  'data path': 'dataPath',
  'result page': 'resultPage',
  'campaign id': 'campaignId',
  'lead node': 'leadNode',
  'save lead endpoint': 'saveEndpoint',
  'salesforce endpoint': 'salesforceEndpoint',
  'pdf upload endpoint': 'pdfEndpoint',
  'quote pdf': 'quotePdf',
  'skip form': 'skipForm',
  'why choose us image': 'whyChooseUsImage',
};

// repeating sections: header row text -> section, column header -> key
const SECTIONS = {
  package: {
    name: 'packages',
    columns: {
      package: 'key', image: 'image', name: 'name', text: 'text', features: 'features',
    },
  },
  room: { name: 'rooms', columns: { room: 'name' } },
};

// the source's validators (commonheader clientlib), unchanged
const VALID = {
  name: (v) => !v.length || /^([a-zA-Z]+\s?)*[a-zA-Z]+$/.test(v.trim()),
  email: (v) => !v.length || /^\b[A-Z0-9._%-]+@[A-Z0-9.-]+\.[A-Z]{2,4}\b$/i.test(v),
  mobile: (v) => !v.length || /^[1-9]\d{9}$/i.test(v),
  pin: (v) => !v.length || /^[0-9]{6}$/.test(v),
};

let uid = 0;

const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
const yes = (value) => /^(true|yes|1|on)$/i.test(value);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== null) node.setAttribute(k, v);
  });
  return node;
}

/** "Step 1/3" -> Step 1/<span>3</span> (the source's muted total) */
function stepCount(label) {
  const p = el('p', 'bhs-calculator-step-count');
  const i = label.lastIndexOf('/');
  if (i < 0) {
    p.textContent = label;
    return p;
  }
  const total = el('span');
  total.textContent = label.slice(i + 1);
  p.append(label.slice(0, i + 1), total);
  return p;
}

/** the source's animated arrow (decorative) */
const arrow = () => el('span', 'bhs-calculator-arrow', { 'aria-hidden': 'true' });

function readModel(block) {
  const fields = {};
  const lists = { packages: [], rooms: [] };
  let section = null;
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const first = text(cells[0]).toLowerCase();
    if (SECTIONS[first]) {
      section = { ...SECTIONS[first], keys: cells.map((c) => SECTIONS[first].columns[text(c).toLowerCase()] || '') };
      return;
    }
    if (!section) {
      if (FIELDS[first]) fields[FIELDS[first]] = { row, cell: cells[1] || null };
      return;
    }
    const item = { row };
    section.keys.forEach((k, i) => { if (k) item[k] = cells[i] || null; });
    lists[section.name].push(item);
  });
  return { fields, ...lists };
}

const firstImg = (cell) => cell?.querySelector('img') || null;
const imgUrl = (cell) => firstImg(cell)?.src || '';

function picture(img, eager = false, width = '750') {
  const pic = createOptimizedPicture(img.src, img.alt || '', eager, [{ width }]);
  const w = img.getAttribute('width');
  const h = img.getAttribute('height');
  if (w && h) {
    pic.querySelector('img').setAttribute('width', w);
    pic.querySelector('img').setAttribute('height', h);
  }
  return pic;
}

const roomsFilter = (selected) => Object.entries(selected).map(([k, v]) => `${k}:${v}`).join('|');

/* ---------- lead API (the source's payloads; transport from form-submit-common) ---------- */
const urlParam = (name) => new URLSearchParams(window.location.search).get(name) || '';
const clean = (data) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v ?? '']));

function leadExtras() {
  const mc = getMarketingChannelDetails();
  return {
    source: urlParam('utm_source'),
    medium: urlParam('utm_medium'),
    utmContent: urlParam('utm_content'),
    utmId: urlParam('utm_id'),
    campaignName: urlParam('utm_campaign'),
    utmAdgroupName: urlParam('UTM_Adgroup_Name'),
    utmKeyword: urlParam('UTM_Keyword'),
    utmKeywordMatchType: urlParam('UTM_Keyword_match_type'),
    utmCampaignSource: urlParam('UTM_Campaign_Source'),
    referrerId: mc.referrerId,
    marketingChannel: mc.marketingChannel,
  };
}

const EMPTY_LEAD_FIELDS = {
  landMark: '',
  thirdAddress: '',
  buildingName: '',
  houseNo: '',
  organizationName: '',
  segment: '',
  street: '',
  designation: '',
  secondAddress: '',
  state: '',
};

function dbPayload(lead, x, campaignId) {
  return clean({
    pageUrl: lead.pageUrl,
    node: lead.node,
    ...EMPTY_LEAD_FIELDS,
    remarks: 'N',
    projectType: '',
    lName: lead.encrypted.lName,
    city: '',
    phoneNo: '',
    pinCode: lead.encrypted.pinCode,
    email: lead.encrypted.email,
    firstAddress: '',
    floorNo: '',
    salutations: '',
    mobileNo: lead.encrypted.mobileNo,
    fName: lead.encrypted.fName,
    skuChosen: '',
    measurementNeeded: '',
    dealerName: '',
    dealerCode: '',
    answer: 'N',
    sampleFinish: '',
    datePicker: '',
    customField: '',
    visitorId: lead.visitorId,
    gaId: lead.gaId,
    description: '',
    whatsAppConsent: lead.whatsAppConsent,
    source: x.source,
    medium: x.medium,
    utmContent: x.utmContent,
    utmId: x.utmId,
    campaignId,
    imageUrl: '',
    referrerId: x.referrerId,
    marketingChannel: x.marketingChannel,
    ccopdf: '',
  });
}

function salesforcePayload(lead, x, campaignId, rowId) {
  return clean({
    pageUrl: lead.pageUrl,
    node: lead.node,
    ...EMPTY_LEAD_FIELDS,
    remarks: 'N',
    projectType: '',
    lName: lead.encrypted.lName,
    city: '',
    phoneNo: '',
    pinCode: lead.encrypted.pinCode,
    email: lead.encrypted.email,
    firstAddress: '',
    floorNo: '',
    salutations: '',
    mobileNo: lead.encrypted.mobileNo,
    fName: lead.encrypted.fName,
    skuChosen: '',
    measurementNeeded: '',
    dealerName: '',
    dealerCode: '',
    answer: 'N',
    sampleFinish: '',
    datePicker: '',
    customField: '',
    visitorId: lead.gaId,
    description: '',
    whatsAppConsent: lead.whatsAppConsent,
    cService: 'BHS',
    source: x.source,
    medium: x.medium,
    utmContent: x.utmContent,
    utmId: x.utmId,
    campaignId,
    campaignName: x.campaignName,
    rowId,
    utmAdgroupName: x.utmAdgroupName,
    utmKeyword: x.utmKeyword,
    utmKeywordMatchType: x.utmKeywordMatchType,
    utmCampaignSource: x.utmCampaignSource,
    referrerId: x.referrerId,
    marketingChannel: x.marketingChannel,
    ccopdf: '',
  });
}

export default async function decorate(block) {
  const { fields, packages, rooms: fallbackRooms } = readModel(block);
  // Universal Editor: carry instrumentation over (a no-op with DA authoring)
  const { moveInstrumentation = () => {} } = await import('../../scripts/scripts.js');
  uid += 1;
  const id = `bhs-calculator-${uid}`;
  const v = (key) => text(fields[key]?.cell) || DEFAULTS[key] || '';
  const inst = (key, node) => { if (fields[key]) moveInstrumentation(fields[key].row, node); };

  /* ---------- shell ---------- */
  const shell = el('div', 'bhs-calculator-shell');
  const bg = imgUrl(fields.bgImage?.cell);
  if (bg) shell.style.setProperty('--bhs-calculator-bg-image', `url("${bg}")`);
  const container = el('div', 'bhs-calculator-container');
  const banner = el('div', 'bhs-calculator-banner');
  const bannerUrl = imgUrl(fields.bannerImage?.cell);
  if (bannerUrl) banner.style.setProperty('--bhs-calculator-banner-image', `url("${bannerUrl}")`);
  const title = el('h2', 'bhs-calculator-title', { id: `${id}-title` });
  title.textContent = v('title');
  inst('title', title);
  banner.append(title);
  const panel = el('div', 'bhs-calculator-panel');
  container.append(banner, panel);
  shell.append(container);

  const makeStep = (n, labelKey, headingKey) => {
    const step = el('div', 'bhs-calculator-step', { 'data-step': n });
    const heading = el('h3', 'bhs-calculator-step-heading', { id: `${id}-step${n}`, tabindex: '-1' });
    heading.textContent = v(headingKey);
    inst(headingKey, heading);
    step.append(stepCount(v(labelKey)), heading);
    return { step, heading };
  };

  /* ---------- step 1: rooms ---------- */
  const s1 = makeStep(1, 'step1Label', 'step1Heading');
  const roomsWrap = el('div', 'bhs-calculator-rooms', { role: 'group', 'aria-labelledby': s1.heading.id });
  const next1 = el('button', 'bhs-calculator-next bhs-calculator-cta', { type: 'button', disabled: '' });
  next1.append(v('nextLabel'), arrow());
  const actions1 = el('div', 'bhs-calculator-actions');
  actions1.append(next1);
  roomsWrap.append(actions1);
  s1.step.append(roomsWrap);

  /* ---------- step 2: packages ---------- */
  const s2 = makeStep(2, 'step2Label', 'step2Heading');
  s2.step.hidden = true;
  const cardList = el('ul', 'bhs-calculator-packages', { 'aria-labelledby': s2.heading.id });
  const selectButtons = [];
  packages.forEach((pkg, i) => {
    const key = (text(pkg.key) || text(pkg.name) || `package-${i + 1}`).toLowerCase();
    const features = pkg.features ? [...pkg.features.querySelectorAll('li')].map(text).filter(Boolean) : [];
    if (pkg.features && !features.length) {
      text(pkg.features).split(/\s*[;\n]\s*/).filter(Boolean).forEach((f) => features.push(f));
    }
    const custom = key === 'custom' || !features.length;
    const card = el('li', `bhs-calculator-package${custom ? ' is-custom' : ''}`, { 'data-package': key });
    const name = el('h4', 'bhs-calculator-package-name', { id: `${id}-pkg${i}` });
    name.textContent = text(pkg.name);
    const img = firstImg(pkg.image);
    const btn = el('button', 'bhs-calculator-select', {
      type: 'button', 'aria-pressed': 'false', 'aria-describedby': name.id, 'data-package': text(pkg.key) || text(pkg.name),
    });
    const btnLabel = el('span', 'bhs-calculator-select-label');
    btnLabel.textContent = v('selectLabel');
    btn.append(btnLabel, arrow());
    if (custom) {
      if (img) card.append(picture(img));
      const body = el('div', 'bhs-calculator-package-body');
      body.append(name);
      if (text(pkg.text)) {
        const p = el('p', 'bhs-calculator-package-text');
        p.textContent = text(pkg.text);
        body.append(p);
      }
      body.append(btn);
      card.append(body);
    } else {
      const media = el('div', 'bhs-calculator-package-media');
      if (img) media.append(picture(img));
      media.append(name);
      const body = el('div', 'bhs-calculator-package-body');
      const ul = el('ul', 'bhs-calculator-package-features');
      features.forEach((f) => {
        const li = el('li');
        li.textContent = f;
        ul.append(li);
      });
      body.append(ul, btn);
      card.append(media, body);
    }
    moveInstrumentation(pkg.row, card);
    cardList.append(card);
    selectButtons.push(btn);
  });
  const buttons2 = el('div', 'bhs-calculator-buttons');
  const back2 = el('button', 'bhs-calculator-back', { type: 'button' });
  back2.append(arrow(), v('backLabel'));
  const next2 = el('button', 'bhs-calculator-next bhs-calculator-cta', { type: 'button', disabled: '' });
  next2.append(v('nextLabel'), arrow());
  buttons2.append(back2, next2);
  s2.step.append(cardList, buttons2);

  /* ---------- step 3: lead form ---------- */
  const s3 = makeStep(3, 'step3Label', 'step3Heading');
  s3.step.hidden = true;
  const sub = el('p', 'bhs-calculator-step-subheading');
  sub.textContent = v('step3Subheading');
  inst('step3Subheading', sub);
  const formShell = el('div', 'bhs-calculator-form-shell');
  const form = el('form', 'bhs-calculator-form', { novalidate: '', 'aria-labelledby': s3.heading.id });
  const fieldDefs = [
    {
      key: 'name', type: 'text', autocomplete: 'name', maxlength: '30', allow: /[a-z, ]/i,
    },
    {
      key: 'email', type: 'email', autocomplete: 'email', inputmode: 'email',
    },
    {
      key: 'mobile', type: 'tel', autocomplete: 'tel-national', inputmode: 'numeric', allow: /[0-9]/,
    },
    {
      key: 'pin', type: 'text', autocomplete: 'postal-code', inputmode: 'numeric', maxlength: '6', allow: /[0-9]/,
    },
  ];
  const inputs = {};
  const groups = {};
  const makeField = (def) => {
    const fid = `${id}-${def.key}`;
    const group = el('div', `bhs-calculator-field is-${def.key}`);
    const label = el('label', 'bhs-calculator-field-label', { for: fid });
    const star = el('span', 'bhs-calculator-required', { 'aria-hidden': 'true' });
    star.textContent = '*';
    label.append(v(`${def.key}Label`), ' ', star);
    const input = el('input', 'bhs-calculator-input', {
      id: fid,
      name: def.key,
      type: def.type,
      autocomplete: def.autocomplete,
      inputmode: def.inputmode,
      maxlength: def.maxlength,
      placeholder: v(`${def.key}Placeholder`),
      required: '',
      'aria-describedby': `${fid}-error`,
    });
    const error = el('p', 'bhs-calculator-field-error', { id: `${fid}-error`, 'aria-live': 'polite' });
    group.append(label, input, error);
    inputs[def.key] = input;
    groups[def.key] = group;
    // the source only lets letters / digits be typed into these fields
    if (def.allow) {
      input.addEventListener('keydown', (e) => {
        const typed = e.key.length === 1 && !e.ctrlKey && !e.metaKey;
        if (typed && !def.allow.test(e.key)) e.preventDefault();
      });
    }
    return group;
  };
  const row1 = el('div', 'bhs-calculator-row');
  row1.append(makeField(fieldDefs[0]), makeField(fieldDefs[1]));
  const row2 = el('div', 'bhs-calculator-row');
  const phone = el('div', 'bhs-calculator-phone');
  const prefix = el('div', 'bhs-calculator-phone-prefix', { 'aria-hidden': 'true' });
  const code = el('span', 'bhs-calculator-phone-code');
  code.textContent = v('countryCode');
  prefix.append(el('span', 'bhs-calculator-phone-flag'), code, el('span', 'bhs-calculator-phone-divider'));
  phone.append(prefix, makeField(fieldDefs[2]));
  row2.append(phone, makeField(fieldDefs[3]));
  const fieldsWrap = el('div', 'bhs-calculator-fields');
  fieldsWrap.append(row1, row2);
  // the country code is part of the accessible description of the mobile field
  const codeNote = el('span', 'bhs-calculator-sr-only', { id: `${id}-mobile-code` });
  codeNote.textContent = `${v('countryCode')}`;
  phone.append(codeNote);
  inputs.mobile.setAttribute('aria-describedby', `${id}-mobile-code ${id}-mobile-error`);

  const wa = el('label', 'bhs-calculator-whatsapp');
  const waText = el('span', 'bhs-calculator-whatsapp-text');
  waText.textContent = v('whatsappLabel');
  const waInput = el('input', 'bhs-calculator-whatsapp-input', { type: 'checkbox', role: 'switch', name: 'whatsapp' });
  waInput.checked = !/^(false|no|0|off)$/i.test(v('whatsappDefault'));
  const waToggle = el('span', 'bhs-calculator-whatsapp-toggle', { 'aria-hidden': 'true' });
  const waState = el('span', 'bhs-calculator-whatsapp-state');
  const syncWa = () => { waState.textContent = waInput.checked ? v('whatsappOn') : v('whatsappOff'); };
  syncWa();
  waToggle.append(waState);
  wa.append(waText, waInput, waToggle);
  waInput.addEventListener('change', syncWa);
  // the source toggles on Enter too
  waInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); waInput.click(); } });

  const disclaimer = el('div', 'bhs-calculator-disclaimer');
  if (fields.disclaimer?.cell) {
    disclaimer.append(...[...fields.disclaimer.cell.childNodes].map((n) => n.cloneNode(true)));
    if (!disclaimer.querySelector('p')) {
      const p = el('p');
      p.append(...disclaimer.childNodes);
      disclaimer.append(p);
    }
    if (yes(v('disclaimerNewTab'))) {
      disclaimer.querySelectorAll('a[href]').forEach((a) => {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';

        a.addEventListener('click', () => {
          pushAdobeCtaClickEvent({
            event: 'cta_link_text',
            cta: a.childNodes[0]?.textContent.trim(),
            destinationUrl: a.href,
            parentTitle: s3.heading.textContent.trim(),
            linkUrl: a.href,
          });
        });

        const note = el('span', 'bhs-calculator-sr-only');
        note.textContent = ` ${v('newTabNote')}`;
        a.append(note);
      });
    }
    inst('disclaimer', disclaimer);
  }

  const formActions = el('div', 'bhs-calculator-form-actions');
  const back3 = el('button', 'bhs-calculator-back', { type: 'button' });
  back3.append(arrow(), v('backLabel'));
  const submit = el('button', 'bhs-calculator-submit bhs-calculator-cta', { type: 'submit' });
  submit.append(v('submitLabel'), arrow());
  // the inline space the source leaves between the two buttons
  formActions.append(back3, ' ', submit);
  form.append(fieldsWrap, wa, disclaimer, formActions);
  formShell.append(form);
  s3.step.append(sub, formShell);

  /* ---------- loading ---------- */
  const loading = el('div', 'bhs-calculator-loading', { role: 'status' });
  loading.hidden = true;
  const gifBox = el('div', 'bhs-calculator-loading-image');
  const gif = firstImg(fields.loadingImage?.cell);
  // the original animated GIF (the media bus would make it a still WebP);
  // its src is set when the form step opens, so it is not fetched up front
  const gifImg = gif ? el('img', '', { alt: gif.alt || '', width: '172', height: '171' }) : null;
  if (gifImg) gifBox.append(gifImg);
  const primeGif = () => {
    if (gifImg && !gifImg.src) [gifImg.src] = gif.src.split('?');
  };
  const loadingText = el('p', 'bhs-calculator-loading-text');
  loadingText.textContent = v('loadingText');
  loading.append(gifBox, loadingText);

  panel.append(s1.step, s2.step, s3.step, loading);

  /* ---------- popups ---------- */
  const popupBg = {
    desk: imgUrl(fields.popupImage?.cell),
    mob: imgUrl(fields.popupMobileImage?.cell) || imgUrl(fields.popupImage?.cell),
  };
  const makeDialog = (kind, titleKey, textKey) => {
    const dialog = el('dialog', `bhs-calculator-dialog is-${kind}`, { 'aria-labelledby': `${id}-${kind}-title` });
    const box = el('div', 'bhs-calculator-dialog-box');
    const content = el('div', 'bhs-calculator-dialog-content');
    const header = el('div', 'bhs-calculator-dialog-header');
    const h = el('h3', 'bhs-calculator-dialog-title', { id: `${id}-${kind}-title` });
    h.textContent = v(titleKey);
    const close = el('button', 'bhs-calculator-dialog-close', { type: 'button', 'aria-label': v('closeLabel') });
    close.textContent = 'X';
    header.append(h, close);
    const body = el('div', 'bhs-calculator-dialog-text');
    const p = el('p');
    p.textContent = v(textKey);
    body.append(p);
    const promo = el('div', 'bhs-calculator-dialog-promo');
    if (popupBg.desk) promo.style.setProperty('--bhs-calculator-popup-desk', `url("${popupBg.desk}")`);
    if (popupBg.mob) promo.style.setProperty('--bhs-calculator-popup-mob', `url("${popupBg.mob}")`);
    const promoInner = el('div', 'bhs-calculator-dialog-promo-content');
    const ph = el('p', 'bhs-calculator-dialog-promo-heading');
    ph.textContent = v('popupHeading');
    const pt = el('p', 'bhs-calculator-dialog-promo-text');
    pt.textContent = v('popupText');
    promoInner.append(ph, pt);
    const ctaHref = fields.popupCtaLink?.cell?.querySelector('a')?.getAttribute('href') || text(fields.popupCtaLink?.cell);
    if (ctaHref) {
      const a = el('a', 'bhs-calculator-dialog-cta bhs-calculator-cta', { href: ctaHref });
      a.append(v('popupCtaLabel'), arrow());
      promoInner.append(a);
    }
    promo.append(promoInner);
    content.append(header, body, promo);
    box.append(content);
    dialog.append(box);
    return { dialog, close, content };
  };
  const thanks = makeDialog('thank-you', 'thankYouTitle', 'thankYouText');
  const failed = makeDialog('error', 'errorTitle', 'errorText');
  block.replaceChildren(shell, thanks.dialog, failed.dialog);
  const openDialog = ({ dialog }) => {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  };

  /* ---------- state ---------- */
  const dataMapping = {};
  let selectedData = {};
  let dataReady = false;

  const scrollToBlock = () => {
    const top = block.getBoundingClientRect().top + window.scrollY - 150;
    window.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' });
  };
  const show = (step) => {
    [s1.step, s2.step, s3.step, loading].forEach((s) => { s.hidden = s !== step; });
  };
  const goTo = (s) => {
    show(s.step);
    s.heading.focus({ preventScroll: true });
    scrollToBlock();
  };

  /* step 1: room list (the source's renderBHInteriorCalculator) */
  const setNext1 = () => {
    next1.disabled = !roomsWrap.querySelector('.bhs-calculator-room-input:checked');
  };
  const renderRooms = (list) => {
    roomsWrap.querySelectorAll('.bhs-calculator-room').forEach((r) => r.remove());
    list.forEach(({ key, text: label, row }) => {
      const rid = `${id}-room-${key.replace(/\W+/g, '_')}`;
      const item = el('div', 'bhs-calculator-room');
      const labelWrap = el('div', 'bhs-calculator-room-label');
      const input = el('input', 'bhs-calculator-room-input', {
        id: rid, type: 'checkbox', name: 'room-type', value: key,
      });
      const lab = el('label', '', { for: rid });
      lab.textContent = label;
      // the space the source's markup leaves between the box and the label
      labelWrap.append(input, ' ', lab);
      const counter = el('div', 'bhs-calculator-counter');
      counter.hidden = true;
      const minus = el('button', 'bhs-calculator-count-minus', {
        type: 'button', 'aria-label': `${v('decreaseLabel')} ${label}`, disabled: '',
      });
      const count = el('output', 'bhs-calculator-count', { 'aria-live': 'polite', 'aria-label': label });
      count.textContent = '01';
      const plus = el('button', 'bhs-calculator-count-plus', { type: 'button', 'aria-label': `${v('increaseLabel')} ${label}` });
      counter.append(minus, count, plus);
      item.append(labelWrap, counter);
      if (row) moveInstrumentation(row, item);
      actions1.before(item);

      input.addEventListener('change', () => {
        if (input.checked) {
          selectedData[key] = '01';
          count.textContent = '01';
          minus.disabled = true;
          counter.hidden = false;
        } else {
          delete selectedData[key];
          counter.hidden = true;
        }
        setNext1();
      });
      // the source toggles a room on Enter too
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.click(); } });
      // ++ / -- as on the source: "01" becomes the number 2 / 0
      plus.addEventListener('click', () => {
        selectedData[key] = Number(selectedData[key]) + 1;
        count.textContent = String(selectedData[key]).padStart(2, '0');
        minus.disabled = false;
      });
      minus.addEventListener('click', () => {
        selectedData[key] = Number(selectedData[key]) - 1;
        const dec = selectedData[key];
        if (dec <= 0) selectedData[key] = 1;
        if (selectedData[key] <= 1) {
          minus.disabled = true;
          plus.focus();
        }
        count.textContent = String(selectedData[key]).padStart(2, '0');
      });
    });
    setNext1();
  };

  const showRooms = () => {
    if (dataReady) {
      renderRooms(roomList(dataMapping));
      return;
    }
    // fallback rooms (endpoint unreachable): same keys as the endpoint's
    const list = fallbackRooms
      .map((r) => ({ key: text(r.name).toLowerCase(), text: text(r.name), row: r.row }))
      .filter((r) => r.key);
    list.forEach((r, i) => {
      dataMapping[r.key] = dataMapping[r.key] || { text: r.text, numbering: i + 1 };
    });
    renderRooms(list);
  };

  next1.addEventListener('click', () => {
    if (next1.disabled) return;
    dataMapping.selectedData = selectedData;
    sessionStorage.setItem('bhCalculatorData', JSON.stringify(dataMapping));
    const filter = roomsFilter(selectedData);
    pushAdobeCalculatorEvents({
      event: 'bhs_start',
      filter,
    });
    goTo(s2);
  });

  /* step 2: packages */
  let chosen = null;
  selectButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      chosen = btn;
      selectButtons.forEach((b) => {
        const on = b === btn;
        b.setAttribute('aria-pressed', String(on));
        b.closest('.bhs-calculator-package').classList.toggle('is-selected', on);
        b.querySelector('.bhs-calculator-select-label').textContent = on ? v('selectedLabel') : v('selectLabel');
      });
      if ((btn.dataset.package || '').toLowerCase() === 'custom') sessionStorage.setItem('selectPackageName', 'custom');
      next2.disabled = false;
    });
  });
  const resultUrl = () => fields.resultPage?.cell?.querySelector('a')?.getAttribute('href') || text(fields.resultPage?.cell);
  const redirect = () => {
    const url = resultUrl();
    // give the bhs_submit analytics beacon up to 1s to go out before the page unloads
    if (url) setTimeout(() => { window.location.href = url; }, 1000);
  };
  const ctaTitle = (heading) => heading.textContent.trim();
  back2.addEventListener('click', () => {
    pushAdobeCtaClickEvent({
      event: 'custom_cta_click',
      cta: v('backLabel'),
      parentTitle: ctaTitle(s2.heading),
    });
    goTo(s1);
  });
  next2.addEventListener('click', () => {
    if (!chosen) return;
    const pkg = (chosen.dataset.package || '').toLowerCase();
    sessionStorage.setItem('selectPackageName', pkg);
    pushAdobeCalculatorEvents({
      event: 'bhs_continue',
      filter: roomsFilter(selectedData),
      selectedValue: chosen.dataset.package,
    });
    title.textContent = v('finalTitle');
    // "Skip form" = true sends every visitor to the result page without the form
    // (the custom package still needs it: it ends in the thank-you popup); so does
    // data-attr-skip-form="true" (set for visitors who already sent a lead, form-removal.js)
    const skipForm = (yes(v('skipForm')) || block.dataset.attrSkipForm === 'true')
      && pkg !== 'custom';
    const known = sessionStorage.getItem('stepform') !== null
      || sessionStorage.getItem('bhLeadDone') === 'true';
    if (known && pkg === 'custom') {
      // already submitted in this tab: the custom package thanks the visitor again,
      // no form, no result page
      primeGif();
      goTo(s3);
      show(s3.step);
      openDialog(thanks);
    } else if (!known && !skipForm) {
      primeGif();
      goTo(s3);
    } else {
      const stored = JSON.parse(sessionStorage.getItem('bhCalculatorData') || '{}');
      pushAdobeCalculatorEvents({
        event: 'bhs_submit',
        filter: roomsFilter(stored.selectedData || {}),
        selectedValue: sessionStorage.getItem('selectPackageName'),
      });
      redirect();
    }
  });

  /* step 3: form */
  const selectors = {
    name: `#${id}-name`, email: `#${id}-email`, mobile: `#${id}-mobile`, pincode: `#${id}-pin`, whatsappConsent: '.bhs-calculator-whatsapp-input',
  };
  const float = (key) => groups[key].classList.add('is-floating');
  const setError = (key, message) => {
    const group = groups[key];
    const input = inputs[key];
    group.classList.toggle('is-invalid', !!message);
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    group.querySelector('.bhs-calculator-field-error').textContent = message || '';
    if (key === 'mobile') phone.classList.toggle('is-invalid', !!message);
  };
  const validate = (key) => {
    const { value } = inputs[key];
    let message = '';
    if (!value.length) message = v('requiredError');
    else if (!VALID[key](value)) message = v(`${key}Error`);
    setError(key, message);
    return !message;
  };
  Object.entries(inputs).forEach(([key, input]) => {
    input.addEventListener('focus', () => {
      float(key);
      if (key === 'mobile') phone.classList.add('is-focused');
    });
    input.addEventListener('blur', () => {
      validate(key);
      if (key === 'mobile') phone.classList.toggle('is-focused', !!input.value);
    });
    input.addEventListener('keydown', () => setError(key, ''));
  });
  checkCookieValues(form, selectors);

  let formStartTracked = false;

  const trackFormStart = (e) => {
    if (formStartTracked) return;

    if (!e.target.closest('input')) return;

    formStartTracked = true;

    pushAdobeFormEvents({
      event: 'form_start',
      formName: s3.heading.textContent.trim(),
      formCampaignId: urlParam('utm_campaign') || v('campaignId'),
    });
  };

  form.addEventListener('focusin', trackFormStart);
  form.addEventListener('click', trackFormStart);

  Object.entries(inputs).forEach(([key, input]) => {
    if (input.value) {
      float(key);
      if (key === 'mobile') phone.classList.add('is-focused');
    }
  });

  back3.addEventListener('click', () => {
    pushAdobeCtaClickEvent({
      event: 'custom_cta_click',
      cta: v('backLabel'),
      parentTitle: ctaTitle(s3.heading),
    });
    title.textContent = v('title');
    goTo(s2);
  });

  /* reset after a popup (the source's bhsCloseThankYou) */
  const reset = () => {
    selectedData = {};
    chosen = null;
    title.textContent = v('title');
    selectButtons.forEach((b) => {
      b.setAttribute('aria-pressed', 'false');
      b.closest('.bhs-calculator-package').classList.remove('is-selected');
      b.querySelector('.bhs-calculator-select-label').textContent = v('selectLabel');
    });
    next2.disabled = true;
    submit.disabled = false;
    showRooms();
    goTo(s1);
  };
  [thanks, failed].forEach(({ dialog, close, content }) => {
    close.addEventListener('click', () => dialog.close());
    // a click outside the popup closes it, as on the source
    dialog.addEventListener('click', (e) => { if (!content.contains(e.target)) dialog.close(); });
    dialog.addEventListener('close', reset);
  });

  const finishWithError = () => {
    submit.disabled = false;
    show(s3.step);
    openDialog(failed);
  };

  const pushToSalesforce = async (lead, x, campaignId, rowId) => {
    submit.disabled = true;
    try {
      const resp = await postFormUrlEncoded(v('salesforceEndpoint'), salesforcePayload(lead, x, campaignId, rowId));
      if (Number(resp?.statusCode) === 200) {
        markLeadFormFilled({
          name: `${lead.fName} ${lead.lName}`,
          email: lead.email,
          mobile: lead.mobileNo,
          pincode: lead.pinCode,
          campaignId,
        });
        pushAdobeFormEvents({
          event: 'form_submit',
          formName: s3.heading.textContent.trim(),
          formCampaignId: campaignId,
          whatsappOptIn: lead.whatsAppConsent ? 'checked' : 'unchecked',
          dataDestination: 'both',
        });

        sessionStorage.setItem('stepform', JSON.stringify({
          name: `${lead.fName || ''}${lead.lName != null ? ` ${lead.lName}` : ''}`,
          mobileNo: lead.mobileNo,
          emailId: lead.email,
          pinCode: lead.pinCode,
          leadId: '123456',
          Whatsapp_Consent: lead.whatsAppConsent,
          Revised_LOB: resp.Revised_LOB ?? null,
          CRMleadId: resp.CRMleadId ?? null,
        }));
        const stored = JSON.parse(sessionStorage.getItem('bhCalculatorData') || '{}');

        pushAdobeCalculatorEvents({
          event: 'bhs_submit',
          filter: roomsFilter(stored.selectedData || {}),
          selectedValue: sessionStorage.getItem('selectPackageName'),
        });
      }
    } catch (e) {
      // a failed lead post still continues to the thank-you popup / result page
    }
    if (sessionStorage.getItem('selectPackageName') !== null) {
      // the lead was sent from this tab, whichever package: the form is not asked again
      sessionStorage.setItem('bhLeadDone', 'true');
      if (sessionStorage.getItem('selectPackageName') === 'custom') {
        show(s3.step);
        openDialog(thanks);
      } else {
        redirect();
      }
    }
  };

  const uploadPdf = async (blob) => {
    const body = new FormData();
    body.append('blob', blob);
    try {
      await fetch(v('pdfEndpoint'), { method: 'POST', body, credentials: 'same-origin' });
    } catch (e) {
      // the source ignores upload errors and saves the lead anyway
    }
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const invalid = Object.keys(inputs).filter((key) => !validate(key));
    if (invalid.length) {
      pushAdobeFormEvents({
        event: 'form_error',
        formName: s3.heading.textContent.trim(),
        formCampaignId: urlParam('utm_campaign') || v('campaignId'),
        formError: invalid,
      });
      Object.keys(inputs).forEach(float);
      inputs[invalid[0]].focus();
      return;
    }
    submit.disabled = true;
    const x = leadExtras();
    const campaignId = urlParam('utm_campaign') || v('campaignId');
    const lead = buildLeadPayload(form, {
      selectors, campaignId, resourcePath: v('leadNode') || window.location.pathname, pageUrl: window.location.href,
    });
    setFormFieldsToCookie(form, selectors);
    // what the visitor typed, for the result page's PDF; the source's stepform is only
    // stored after Salesforce answers 201, and it also decides whether the form is skipped
    sessionStorage.setItem('bhLeadDraft', JSON.stringify({
      name: `${lead.fName || ''}${lead.lName != null ? ` ${lead.lName}` : ''}`,
      mobileNo: lead.mobileNo,
      emailId: lead.email,
    }));
    show(loading);
    scrollToBlock();
    const pkg = sessionStorage.getItem('selectPackageName');
    try {
      if (yes(v('quotePdf')) && pkg && pkg !== 'custom') {
        const { buildQuotePdf } = await import('./quote-pdf.js');
        const stored = JSON.parse(sessionStorage.getItem('bhCalculatorData') || '{}');
        const { price, featureCards } = quote(stored, pkg);
        const pdf = await buildQuotePdf({
          name: lead.fName,
          number: lead.mobileNo,
          mail: lead.email,
          pkgName: pkg,
          price,
          featureCards,
        }, { whyChooseUsImg: imgUrl(fields.whyChooseUsImage?.cell) });
        await uploadPdf(pdf);
      }
    } catch (err) {
      // a PDF failure must not lose the lead
    }
    let db;
    try {
      db = await postFormUrlEncoded(v('saveEndpoint'), dbPayload(lead, x, campaignId));
    } catch (err) {
      finishWithError();
      return;
    }
    if (db?.Status === 'SUCCESS') {
      if (['en', 'null', '', undefined, null].includes(db.language)) await pushToSalesforce(lead, x, campaignId, db.rowID);
      return;
    }
    // not saved: the source still pushes the lead to Salesforce for /en/ pages
    // (then redirects, or thanks a custom-package visitor)
    if (String(lead.node).includes('/en/')) {
      await pushToSalesforce(lead, x, campaignId, `${Date.now()}-nondblead`);
      return;
    }
    finishWithError();
  });

  /* ---------- data (the source's apiBHInteriorCalculator) ---------- */
  sessionStorage.removeItem('Calculateagin');
  const load = postFormUrlEncoded(v('dataEndpoint'), { data: dataRequest(v('dataPath')) })
    .then((resp) => {
      mapData(resp, dataMapping);
      dataReady = roomList(dataMapping).length > 0;
    })
    .catch(() => { dataReady = false; });

  // the source's chatbot hand-off: ?fromChatbot&userName=…&package=…&kitchen=… stores
  // the journey for the result page
  const params = new URLSearchParams(window.location.search);
  if (params.has('fromChatbot')) {
    window.history.pushState({}, 'result screen', window.location.href.split('?')[0]);
    sessionStorage.setItem('stepform', JSON.stringify({
      name: params.get('userName') || '',
      mobileNo: params.get('userMobile') || '',
      emailId: params.get('userEmail') || '',
      pinCode: 'FromChatBot',
      leadId: '123456',
      Whatsapp_Consent: 'FromChatBot',
      Revised_LOB: 'FromChatBot',
      CRMleadId: 'FromChatBot',
    }));
    load.then(() => {
      const count = (name) => `0${parseInt((params.get(name) || '').replace(/\s/g, ''), 10)}`;
      dataMapping.selectedData = {
        bathroom: count('bathroom'),
        'guest bedroom': count('guestbedroom'),
        'kids room': count('kidsroom'),
        kitchen: count('kitchen'),
        'living room': count('livingroom'),
        'master bedroom': count('masterbedroom'),
        'pooja room': count('poojaroom'),
        'study room': count('studyroom'),
      };
      sessionStorage.setItem('bhCalculatorData', JSON.stringify(dataMapping));
      sessionStorage.setItem('selectPackageName', (params.get('package') || '').replace(/\s/g, '').toLowerCase());
    });
  }

  // rooms render when the data arrives (the box keeps its height meanwhile)
  load.then(showRooms);
}
