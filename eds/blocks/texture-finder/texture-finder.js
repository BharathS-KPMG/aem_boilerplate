import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  postFormUrlEncoded, buildLeadPayload, getCookieValues, markLeadFormFilled,
} from '../../scripts/form-submit-common.js';
import { getMarketingChannelDetails } from '../../scripts/marketing-channel.js';
import {
  pushAdobeCalculatorEvents, pushAdobeCtaClickEvent, pushAdobeSingleEvent, pushAdobeFormEvents,
} from '../../scripts/analytics_1.js';

/**
 * texture-finder — the Interior Texture Finder: a start screen, three
 * questions (room, natural light, theme) answered with picture cards, a lead
 * form, then texture recommendations (Non-metallic / Metallic tabs) with a
 * PDF download. Source: asianpaints.com/resources/tools/interior-texture-finder-tool
 * (section "interiortexturetool"). Authoring, data flow and deviations: README.md.
 *
 * Authoring (DA table): label | value rows (all optional, source text is the
 * default), then three repeating sections, each starting with a header row:
 *   Room | Value | Image | Low light | Medium light | High light |
 *     Low light mobile | Medium light mobile | High light mobile
 *   Light | Value
 *   Theme | Value | Image | Mobile image | Hover image
 * Recommendations come from the source's endpoint; when it can't be reached
 * (e.g. on aem.page) they come from the authored snapshot sheet.
 */

const DEFAULTS = {
  title: 'Find your perfect\ninterior texture',
  text: 'Answer a few questions to get custom texture recommendations.',
  startLabel: 'Let’s get started',
  previousLabel: 'Previous',
  nextLabel: 'Next',
  step1Number: '01',
  step1Question: 'Select a room for texture application.',
  step2Number: '02',
  step2Question: 'How much natural light is available in your room?',
  step3Number: '03',
  step3Question: 'Select your preferred theme.',
  formTitle: 'One last step before we recommend you textures.',
  formText: 'Share your details and get your personalized texture recommendations instantly!',
  nameLabel: 'Name',
  namePlaceholder: 'Your Full Name',
  emailLabel: 'Email',
  emailPlaceholder: 'Eg: myname@gmail.com',
  mobileLabel: 'Mobile',
  mobilePlaceholder: '10 digits',
  countryCode: '+91',
  pinLabel: 'PinCode',
  pinPlaceholder: '6 digit PIN code',
  requiredError: 'Field is required',
  nameError: 'Username is not valid',
  emailError: 'Email is invalid',
  mobileError: 'Phone number is invalid',
  pinError: 'Enter a valid 6 digit Zip Code',
  question1: 'Are you looking for a home painting service?',
  question1Options: 'Immediate=Immediate/Within 1 Month; Within a month=Immediate/Within 1 Month; After 1 month',
  question2: 'Is there a local painter hired?',
  question2Options: 'Yes; No',
  submitLabel: 'View recommendations',
  submittingText: 'Please wait, getting your recommendations…',
  errorBackLabel: 'Restart again',
  errorTitle: 'Sorry!',
  errorText: 'Some error occurred, please try again later.',
  closeLabel: 'Close',
  restartLabel: 'Restart',
  resultTitle: 'Top interior texture recommendations.',
  inputsTitle: 'Based on you inputs -',
  roomLabel: 'Room',
  lightLabel: 'Light',
  themeLabel: 'Theme',
  downloadText: 'Download the PDF to get more details about the {tab} Textures.',
  downloadLabel: 'Download PDF',
  downloadingText: 'Preparing your PDF…',
  productUsedLabel: 'Product used',
  shadesUsedLabel: 'Shades used',
  topCoatLabel: 'Top coat',
  baseCoatLabel: 'Base coat',
  detailsLabel: 'View texture details',
  tabsLabel: 'Texture type',
  slideLabel: 'Go to slide {n}',
  newTabNote: '(opens in a new tab)',
  pdfGreeting: 'Dear',
  pdfHeaderText: '<p>Here are the best recommended products for you. Please review and reach out to us, for any questions.</p>',
  pdfEmailLabel: 'Email',
  pdfMobileLabel: 'Mobile no',
  pdfTexturesTitle: 'Recommended Textures',
  pdfFileName: 'Interior_Texture_Recommendations',
  pdfFooterText: '<p>For painting needs call on 1800-209-5678</p>',
  pdfServicesText: '',
  endpoint: '/apcolourcatalogue/interiorTextureTool.interiorTextureToolRecomendation.json',
  snapshot: '',
  saveEndpoint: '/apcolourcatalogue/ccforms.saveleadform.json',
  salesforceEndpoint: '/apcolourcatalogue/ccforms/salesforce.leadstosalesforce.json',
  campaignId: 'SPS_Organic',
  leadNode: '',
};

// label | value rows (lower-cased label -> field)
const FIELDS = {
  title: 'title',
  text: 'text',
  'start label': 'startLabel',
  'previous label': 'previousLabel',
  'next label': 'nextLabel',
  'background image': 'bgImage',
  'mobile background image': 'bgMobileImage',
  'step 1 number': 'step1Number',
  'step 1 question': 'step1Question',
  'step 2 number': 'step2Number',
  'step 2 question': 'step2Question',
  'step 3 number': 'step3Number',
  'step 3 question': 'step3Question',
  'form title': 'formTitle',
  'form text': 'formText',
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
  'question 1': 'question1',
  'question 1 options': 'question1Options',
  'question 2': 'question2',
  'question 2 options': 'question2Options',
  disclaimer: 'disclaimer',
  'submit label': 'submitLabel',
  'submitting text': 'submittingText',
  'error back label': 'errorBackLabel',
  'error title': 'errorTitle',
  'error text': 'errorText',
  'close label': 'closeLabel',
  'restart label': 'restartLabel',
  'result title': 'resultTitle',
  'inputs title': 'inputsTitle',
  'room label': 'roomLabel',
  'light label': 'lightLabel',
  'theme label': 'themeLabel',
  'download text': 'downloadText',
  'download label': 'downloadLabel',
  'downloading text': 'downloadingText',
  'product used label': 'productUsedLabel',
  'shades used label': 'shadesUsedLabel',
  'top coat label': 'topCoatLabel',
  'base coat label': 'baseCoatLabel',
  'details link label': 'detailsLabel',
  'tabs label': 'tabsLabel',
  'slide label': 'slideLabel',
  'new tab note': 'newTabNote',
  'pdf greeting': 'pdfGreeting',
  'pdf logo': 'pdfLogo',
  'pdf header text': 'pdfHeaderText',
  'pdf email label': 'pdfEmailLabel',
  'pdf mobile label': 'pdfMobileLabel',
  'pdf textures title': 'pdfTexturesTitle',
  'pdf services image': 'pdfServicesImage',
  'pdf services text': 'pdfServicesText',
  'pdf footer text': 'pdfFooterText',
  'pdf file name': 'pdfFileName',
  endpoint: 'endpoint',
  snapshot: 'snapshot',
  'save lead endpoint': 'saveEndpoint',
  'salesforce endpoint': 'salesforceEndpoint',
  'campaign id': 'campaignId',
  'lead node': 'leadNode',
};

// repeating sections: header row text -> list, column header -> key
const SECTIONS = {
  room: {
    name: 'rooms',
    columns: {
      room: 'name',
      value: 'value',
      image: 'image',
      'low light': 'low',
      'medium light': 'medium',
      'high light': 'high',
      'low light mobile': 'lowMobile',
      'medium light mobile': 'mediumMobile',
      'high light mobile': 'highMobile',
    },
  },
  light: { name: 'lights', columns: { light: 'name', value: 'value' } },
  theme: {
    name: 'themes',
    columns: {
      theme: 'name', value: 'value', image: 'image', 'mobile image': 'mobile', 'hover image': 'hover',
    },
  },
};

// the source's validators (commonheader clientlib), unchanged
const VALID = {
  name: (v) => !v.length || /^([a-zA-Z]+\s?)*[a-zA-Z]+$/.test(v.trim()),
  email: (v) => !v.length || /^\b[A-Z0-9._%-]+@[A-Z0-9.-]+\.[A-Z]{2,4}\b$/i.test(v),
  mobile: (v) => !v.length || /^[1-9]\d{9}$/i.test(v),
  pin: (v) => !v.length || /^[0-9]{6}$/.test(v),
};

const MOBILE = '(max-width: 991px)';
const TAB_ORDER = ['Non-metallic', 'Metallic'];
const TEXTURES = ['Texture1', 'Texture2', 'Texture3'];
const LIGHT_KEYS = ['low', 'medium', 'high'];

let uid = 0;

const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
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
  const lists = { rooms: [], lights: [], themes: [] };
  let section = null;
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const first = text(cells[0]).toLowerCase();
    const header = SECTIONS[first];
    if (header && cells.length > 1 && header.columns[text(cells[1]).toLowerCase()]) {
      section = { ...SECTIONS[first], keys: cells.map((c) => SECTIONS[first].columns[text(c).toLowerCase()] || '') };
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

/** "Label=value; Label" -> [{ label, value }] */
const options = (list) => list.split(/\s*;\s*/).filter(Boolean).map((part) => {
  const [label, value] = part.split('=').map((s) => s.trim());
  return { label, value: value || label };
});

/** an authored image as a <picture>; `mobile` (with its media) wins below the breakpoint */
function picture(img, { mobile, media = MOBILE, eager = false } = {}) {
  if (!img && !mobile) return null;
  const base = img || mobile;
  const pic = createOptimizedPicture(base.src, base.alt || '', eager, [{ width: '750' }]);
  const out = pic.querySelector('img');
  ['width', 'height'].forEach((a) => { if (base.getAttribute(a)) out.setAttribute(a, base.getAttribute(a)); });
  if (mobile && img && mobile !== img) {
    const mob = createOptimizedPicture(mobile.src, '', eager, [{ width: '750' }]);
    [...mob.querySelectorAll('source')].reverse().forEach((source) => {
      source.setAttribute('media', media);
      pic.prepend(source);
    });
  }
  return pic;
}

/** a DA image URL at a given width (for the background layer) */
const sized = (img, width) => {
  const url = new URL(img.src, window.location.href);
  return `${url.pathname}?width=${width}&format=webply&optimize=medium`;
};

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

function leadFields(lead, answers) {
  return {
    pageUrl: lead.pageUrl,
    node: lead.node,
    ...EMPTY_LEAD_FIELDS,
    remarks: answers.remarks,
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
    answer: answers.answer,
    sampleFinish: '',
    datePicker: '',
    customField: '',
  };
}

function dbPayload(lead, answers, x, campaignId) {
  return clean({
    ...leadFields(lead, answers),
    visitorId: lead.visitorId,
    gaId: lead.gaId,
    description: '',
    // the source's form has no WhatsApp toggle: the consent is sent empty
    whatsAppConsent: '',
    source: x.source,
    medium: x.medium,
    utmContent: x.utmContent,
    utmId: x.utmId,
    campaignId,
    campaignName: campaignId,
    imageUrl: '',
    referrerId: x.referrerId,
    marketingChannel: x.marketingChannel,
  });
}

function salesforcePayload(lead, answers, x, campaignId, rowId) {
  return clean({
    ...leadFields(lead, answers),
    // the source passes the GA client id as the visitor id here
    visitorId: lead.gaId,
    description: '',
    whatsAppConsent: '',
    source: x.source,
    medium: x.medium,
    utmContent: x.utmContent,
    utmId: x.utmId,
    campaignId,
    campaignName: campaignId,
    rowId,
    utmAdgroupName: x.utmAdgroupName,
    utmKeyword: x.utmKeyword,
    utmKeywordMatchType: x.utmKeywordMatchType,
    utmCampaignSource: x.utmCampaignSource,
    referrerId: x.referrerId,
    marketingChannel: x.marketingChannel,
  });
}

/* ---------- recommendations ---------- */

/** the source's product page paths (/content/ap/en/home/x.html) as site paths (/x.html) */
const pagePath = (url) => String(url || '').replace(/^\/content\/ap\/en\/home(?=\/)/, '');

async function getJson(url) {
  const resp = await fetch(url, { credentials: 'same-origin' });
  if (!resp.ok) throw new Error(`${url}: ${resp.status}`);
  return resp.json();
}

const hasTextures = (data) => data && TAB_ORDER.some((tab) => data[tab]);

/** the source's endpoint first, then the authored snapshot sheet */
async function recommendations(endpoint, snapshot, answers) {
  const query = new URLSearchParams(answers).toString();
  try {
    const data = await getJson(`${endpoint}${endpoint.includes('?') ? '&' : '?'}${query}`);
    if (hasTextures(data)) return data;
  } catch (e) { /* not reachable here: use the snapshot */ }
  if (!snapshot) throw new Error('no recommendations');
  const sheet = await getJson(snapshot);
  const rows = sheet.data || sheet[Object.keys(sheet).find((k) => sheet[k]?.data)]?.data || [];
  const row = rows.find((r) => r.space === answers.space && r.light === answers.light
    && r.theme === answers.theme);
  const data = row && JSON.parse(row.data);
  if (!hasTextures(data)) throw new Error('no recommendations');
  return data;
}

/**
 * The PDF's services copy in the source's markup: text paragraph(s), then a
 * "We offer:" heading and its list (the PDF CSS styles those classes).
 */
function servicesHtml(cell) {
  if (!cell || !text(cell)) return '';
  const list = cell.querySelector('ul, ol');
  const paras = [...cell.querySelectorAll('p')].filter((p) => text(p));
  if (!list || !paras.length) return cell.innerHTML;
  const all = [...cell.querySelectorAll('p, ul, ol')];
  const before = paras.filter((p) => all.indexOf(p) < all.indexOf(list));
  const heading = before.length > 1 ? before.pop() : null;
  const intro = before.map((p) => `<div class="service-heading-two">${p.innerHTML}</div>`).join('');
  const offer = heading ? `<div class="we-offer-heading">${heading.innerHTML}</div>` : '';
  return `${intro}<div class="we-offer-section">${offer}<ul>${list.innerHTML}</ul></div>`;
}

/** the source's arrow (decorative) */
const arrow = () => el('span', 'texture-finder-arrow', { 'aria-hidden': 'true' });

function ctaButton(className, label, attrs = {}) {
  const button = el('button', `texture-finder-cta ${className}`, { type: 'button', ...attrs });
  const span = el('span', 'texture-finder-cta-label');
  span.textContent = label;
  button.append(span, arrow());
  return button;
}

/**
 * A horizontal scroller with dots for the mobile sliders (the source's slick):
 * the item scrolled to the start is "current"; dots scroll to an item.
 */
function slider(list, items, { label, dotLabel }) {
  const dots = el('div', 'texture-finder-dots', { role: 'group', 'aria-label': label });
  const dotButtons = items.map((item, i) => {
    const dot = el('button', 'texture-finder-dot', {
      type: 'button', 'aria-label': dotLabel.replace('{n}', i + 1),
    });
    dots.append(dot);
    return dot;
  });
  let current = 0;
  const setCurrent = (i) => {
    current = i;
    items.forEach((item, j) => item.classList.toggle('is-current', j === i));
    dotButtons.forEach((dot, j) => {
      if (j === i) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  };
  const goTo = (i, smooth = true) => {
    const item = items[i];
    if (!item) return;
    const start = parseFloat(getComputedStyle(list).paddingInlineStart) || 0;
    list.scrollTo({ left: item.offsetLeft - list.offsetLeft - start, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
    setCurrent(i);
  };
  let raf = 0;
  list.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const left = list.scrollLeft;
      let best = 0;
      items.forEach((item, j) => {
        if (Math.abs(item.offsetLeft - list.offsetLeft - left)
          < Math.abs(items[best].offsetLeft - list.offsetLeft - left)) best = j;
      });
      // at the end of the track the last item is current (it can't reach the start)
      if (left + list.clientWidth >= list.scrollWidth - 2) best = items.length - 1;
      if (best !== current) setCurrent(best);
    });
  }, { passive: true });
  dotButtons.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));
  setCurrent(0);
  return {
    dots, dotButtons, goTo, get current() { return current; },
  };
}

export default async function decorate(block) {
  const {
    fields, rooms, lights, themes,
  } = readModel(block);
  // Universal Editor: carry instrumentation over (a no-op with DA authoring)
  const { moveInstrumentation = () => {} } = await import('../../scripts/scripts.js');
  uid += 1;
  const id = `texture-finder-${uid}`;
  const v = (key) => text(fields[key]?.cell) || DEFAULTS[key] || '';
  const html = (key) => {
    const cell = fields[key]?.cell;
    return cell && text(cell) ? cell.innerHTML.trim() : DEFAULTS[key] || '';
  };
  const mq = window.matchMedia(MOBILE);
  const slideLabel = v('slideLabel');
  const newTabNote = v('newTabNote');

  /* ---------- state (the source's IntTextResult) ---------- */
  const state = {
    space: 'Val1', light: 'Val2', theme: 'Val3', formPreviouslySubmitted: false, formSkipped: false,
  };
  const saveState = () => {
    try { localStorage.setItem('IntTextResult', JSON.stringify(state)); } catch (e) { /* private mode */ }
  };
  saveState();

  /* ---------- background (the source's --bg-image-desktop / --bg-image-mob) ---------- */
  const bgDesk = firstImg(fields.bgImage?.cell);
  const bgMob = firstImg(fields.bgMobileImage?.cell);
  const bg = el('div', 'texture-finder-bg', { 'aria-hidden': 'true' });
  if (bgDesk || bgMob) {
    const pic = el('picture');
    if (bgDesk && bgMob) {
      pic.append(el('source', '', { media: '(min-width: 992px)', srcset: sized(bgDesk, 2000), type: 'image/webp' }));
    }
    const img = el('img', '', {
      src: sized(bgMob || bgDesk, bgMob ? 750 : 2000), alt: '', loading: 'eager', fetchpriority: 'high',
    });
    pic.append(img);
    bg.append(pic);
  }

  const live = el('p', 'texture-finder-sr-only', { 'aria-live': 'polite', role: 'status' });
  const sections = [];
  const showSection = (section, focus = true) => {
    sections.forEach((s) => { s.hidden = s !== section; });
    if (focus) {
      const target = section.querySelector('[data-focus]');
      if (target) target.focus({ preventScroll: true });
      const { top } = block.getBoundingClientRect();
      if (top < 0) block.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }
  };

  /* ---------- start screen ---------- */
  const home = el('section', 'texture-finder-home', { 'aria-labelledby': `${id}-title` });
  const homeContent = el('div', 'texture-finder-home-content');
  const title = el('h2', 'texture-finder-title', { id: `${id}-title`, tabindex: '-1', 'data-focus': true });
  v('title').split(/\n/).forEach((line, i) => {
    if (i) title.append(el('br'));
    title.append(line);
  });
  const titleCell = fields.title?.cell;
  if (titleCell && text(titleCell)) {
    // keep the authored line break(s)
    title.replaceChildren();
    const p = titleCell.querySelector('p') || titleCell;
    [...p.childNodes].forEach((n) => title.append(n.nodeName === 'BR' ? el('br') : document.createTextNode(n.textContent)));
  }
  if (fields.title) moveInstrumentation(fields.title.row, title);
  const intro = el('p', 'texture-finder-text');
  intro.textContent = v('text');
  if (fields.text) moveInstrumentation(fields.text.row, intro);
  homeContent.append(title, intro);
  const start = ctaButton('texture-finder-cta-yellow texture-finder-start', v('startLabel'));
  home.append(homeContent, start);
  sections.push(home);

  /* ---------- question steps ---------- */
  const picks = { space: null, light: null, theme: null };
  const inputsList = {};

  const makeStep = (n, key, list, buildMedia) => {
    const section = el('section', `texture-finder-step texture-finder-step-${key}`, { 'aria-labelledby': `${id}-q${n}`, hidden: true });
    const textWrap = el('div', 'texture-finder-step-text');
    const heading = el('h2', 'texture-finder-question', { id: `${id}-q${n}`, tabindex: '-1', 'data-focus': true });
    const number = el('span', 'texture-finder-number');
    number.textContent = v(`step${n}Number`);
    const question = el('span', 'texture-finder-question-text');
    question.textContent = v(`step${n}Question`);
    heading.append(number, ' ', question);
    textWrap.append(heading);
    ['Number', 'Question'].forEach((f) => { if (fields[`step${n}${f}`]) moveInstrumentation(fields[`step${n}${f}`].row, heading); });

    const media = el('div', 'texture-finder-step-media');
    const cards = el('ul', 'texture-finder-cards', { role: 'list', 'aria-labelledby': `${id}-q${n}` });
    const items = list.map((item, i) => {
      const name = text(item.name);
      const value = text(item.value) || name;
      const li = el('li', 'texture-finder-card');
      // data-title feeds the chosen card's veil (the source's li[title]::before)
      const button = el('button', 'texture-finder-card-button', {
        type: 'button', 'aria-pressed': 'false', 'data-title': name,
      });
      const mediaWrap = el('span', 'texture-finder-card-media');
      buildMedia(mediaWrap, item, i);
      const label = el('span', 'texture-finder-card-name');
      label.textContent = name;
      button.append(mediaWrap, label);
      li.append(button);
      moveInstrumentation(item.row, li);
      cards.append(li);
      return {
        li, button, name, value, item, mediaWrap,
      };
    });

    const row = el('div', 'texture-finder-nav');
    const prev = ctaButton('texture-finder-cta-white texture-finder-prev', v('previousLabel'));
    const next = ctaButton('texture-finder-cta-white texture-finder-next', v('nextLabel'), { 'aria-disabled': 'true' });
    row.append(prev, next);
    const sl = slider(cards, items.map((it) => it.li), {
      label: question.textContent, dotLabel: slideLabel,
    });
    media.append(cards, sl.dots, row);
    section.append(textWrap, media);
    sections.push(section);
    const step = {
      n, key, section, heading, question, items, prev, next, slider: sl, cards,
    };
    inputsList[key] = step;
    return step;
  };

  const roomMedia = (wrap, item) => {
    const pic = picture(firstImg(item.image));
    if (pic) wrap.append(pic);
  };
  const lightImage = (room, key) => ({
    desk: firstImg(room?.[key]) || null,
    mob: firstImg(room?.[`${key}Mobile`]) || null,
  });
  const lightMedia = (wrap, item, i) => {
    // the source shows the chosen room's light images (living room before a choice)
    const { desk, mob } = lightImage(rooms[0], LIGHT_KEYS[i] || 'low');
    const pic = picture(desk, { mobile: mob, media: '(max-width: 575px)' });
    if (pic) wrap.append(pic);
  };
  const themeMedia = (wrap, item) => {
    const images = el('span', 'texture-finder-theme-images');
    const main = picture(firstImg(item.image), { mobile: firstImg(item.mobile) });
    if (main) {
      main.classList.add('texture-finder-theme-main');
      images.append(main);
    }
    const hoverImg = firstImg(item.hover);
    if (hoverImg) {
      const hover = picture(hoverImg);
      hover.classList.add('texture-finder-theme-hover');
      images.append(hover);
    }
    wrap.append(images);
  };

  const steps = [
    makeStep(1, 'space', rooms, roomMedia),
    makeStep(2, 'light', lights, lightMedia),
    makeStep(3, 'theme', themes, themeMedia),
  ];

  /* ---------- form ---------- */
  const formSection = el('section', 'texture-finder-form-step', { 'aria-labelledby': `${id}-form-title`, hidden: true });
  const formHeader = el('div', 'texture-finder-form-header');
  const formTitle = el('h2', 'texture-finder-form-title', { id: `${id}-form-title`, tabindex: '-1', 'data-focus': true });
  formTitle.textContent = v('formTitle');
  const formText = el('p', 'texture-finder-form-text');
  formText.textContent = v('formText');
  formHeader.append(formTitle, formText);
  const formBox = el('div', 'texture-finder-form-box');
  const form = el('form', 'texture-finder-form', { novalidate: true, 'aria-labelledby': `${id}-form-title` });

  let formStartTracked = false;

  const trackFormStart = (e) => {
    if (formStartTracked) return;

    const target = e.target.closest('input');
    if (!target) return;

    formStartTracked = true;

    pushAdobeFormEvents({
      event: 'form_start',
      formName: v('formTitle'),
      formCampaignId: urlParam('utm_campaign') || v('campaignId'),
    });
  };

  form.addEventListener('focusin', trackFormStart);
  form.addEventListener('click', trackFormStart);

  const fieldDefs = [
    {
      key: 'name', type: 'text', autocomplete: 'name', maxlength: '30', allow: /[a-zA-Z ]/,
    },
    {
      key: 'email', type: 'email', autocomplete: 'email', inputmode: 'email',
    },
    {
      key: 'mobile', type: 'tel', autocomplete: 'tel-national', inputmode: 'numeric', maxlength: '10', allow: /[0-9]/,
    },
    {
      key: 'pin', type: 'text', autocomplete: 'postal-code', inputmode: 'numeric', maxlength: '6', allow: /[0-9]/,
    },
  ];
  const inputs = {};
  const groups = {};
  const makeField = (def) => {
    const fid = `${id}-${def.key}`;
    const group = el('div', `texture-finder-field is-${def.key}`);
    const label = el('label', 'texture-finder-label', { for: fid });
    const star = el('span', 'texture-finder-required', { 'aria-hidden': 'true' });
    star.textContent = ' *';
    label.append(v(`${def.key}Label`), star);
    const input = el('input', 'texture-finder-input', {
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
    const error = el('p', 'texture-finder-error', { id: `${fid}-error` });
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
  const row1 = el('div', 'texture-finder-row');
  row1.append(makeField(fieldDefs[0]), makeField(fieldDefs[1]));
  const row2 = el('div', 'texture-finder-row');
  const phone = el('div', 'texture-finder-phone');
  const prefix = el('div', 'texture-finder-phone-prefix', { 'aria-hidden': 'true' });
  const code = el('span', 'texture-finder-phone-code');
  code.textContent = v('countryCode');
  prefix.append(el('span', 'texture-finder-phone-flag'), code, el('span', 'texture-finder-phone-divider'));
  phone.append(prefix, makeField(fieldDefs[2]));
  const codeNote = el('span', 'texture-finder-sr-only', { id: `${id}-mobile-code` });
  codeNote.textContent = v('countryCode');
  phone.append(codeNote);
  inputs.mobile.setAttribute('aria-describedby', `${id}-mobile-code ${id}-mobile-error`);
  row2.append(phone, makeField(fieldDefs[3]));

  const radios = {};
  const questions = el('div', 'texture-finder-questions');
  const makeQuestion = (n, name) => {
    const set = el('fieldset', `texture-finder-question-group is-q${n}`, { 'aria-describedby': `${id}-${name}-error` });
    const legend = el('legend', 'texture-finder-legend');
    const star = el('span', 'texture-finder-astr', { 'aria-hidden': 'true' });
    star.textContent = '*';
    legend.append(v(`question${n}`), ' ', star);
    const req = el('span', 'texture-finder-sr-only');
    req.textContent = ' (required)';
    legend.append(req);
    const opts = el('div', 'texture-finder-options');
    const list = options(v(`question${n}Options`)).map((opt, i) => {
      const label = el('label', 'texture-finder-option');
      const input = el('input', 'texture-finder-radio', {
        type: 'radio', name: `${id}-${name}`, value: opt.value, required: i === 0,
      });
      const mark = el('span', 'texture-finder-radio-mark', { 'aria-hidden': 'true' });
      const txt = el('span', 'texture-finder-option-text');
      txt.textContent = opt.label;
      label.append(input, mark, txt);
      opts.append(label);
      return input;
    });
    const error = el('p', 'texture-finder-error', { id: `${id}-${name}-error` });
    set.append(legend, opts, error);
    radios[name] = { set, list, error };
    list.forEach((input) => input.addEventListener('change', () => {
      error.textContent = '';
      set.classList.remove('is-invalid');
    }));
    return set;
  };
  questions.append(makeQuestion(1, 'remarks'), makeQuestion(2, 'answer'));

  const terms = el('div', 'texture-finder-terms');
  const disclaimerCell = fields.disclaimer?.cell;
  if (disclaimerCell && text(disclaimerCell)) {
    const copy = disclaimerCell.cloneNode(true);
    if (!copy.querySelector('p')) {
      const p = el('p');
      p.append(...copy.childNodes);
      copy.append(p);
    }
    terms.append(...copy.childNodes);
    terms.querySelectorAll('a[href]').forEach((a) => {
      // the source opens its T&C / privacy links in a new tab
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      const ctaText = a.childNodes[0]?.textContent?.trim() || a.textContent.trim();
      a.addEventListener('click', () => {
        pushAdobeCtaClickEvent({
          event: 'cta_link_text',
          cta: ctaText,
          destinationUrl: a.href,
          parentTitle: v('formTitle'),
          linkUrl: a.href,
        });
      });

      const note = el('span', 'texture-finder-sr-only');
      note.textContent = ` ${newTabNote}`;
      a.append(note);
    });
    moveInstrumentation(fields.disclaimer.row, terms);
  }
  const submitWrap = el('div', 'texture-finder-submit-wrap');
  const submit = el('button', 'texture-finder-cta texture-finder-cta-gradient texture-finder-submit', { type: 'submit' });
  const submitLabel = el('span', 'texture-finder-cta-label');
  submitLabel.textContent = v('submitLabel');
  const spinner = el('span', 'texture-finder-spinner', { 'aria-hidden': 'true' });
  submit.append(submitLabel, arrow(), spinner);
  submitWrap.append(submit);
  form.append(row1, row2, questions, terms, submitWrap);
  formBox.append(form);

  // the source's error panel (shown when the lead or the recommendations fail)
  const errorPanel = el('div', 'texture-finder-form-error', { hidden: true });
  const errorBack = el('button', 'texture-finder-restart texture-finder-error-back', { type: 'button' });
  errorBack.textContent = v('errorBackLabel');
  const errorSlide = el('div', 'texture-finder-error-slide');
  const errorMsg = el('div', 'texture-finder-error-msg');
  const errorTitle = el('p', 'texture-finder-error-title', { tabindex: '-1' });
  errorTitle.textContent = v('errorTitle');
  const errorText = el('p', 'texture-finder-error-text');
  errorText.textContent = v('errorText');
  errorMsg.append(errorTitle, errorText);
  const errorClose = el('button', 'texture-finder-error-close', { type: 'button', 'aria-label': v('closeLabel') });
  errorSlide.append(errorMsg, errorClose);
  errorPanel.append(errorBack, errorSlide);

  const formContainer = el('div', 'texture-finder-form-container');
  formContainer.append(formBox, errorPanel);
  formSection.append(formHeader, formContainer);
  sections.push(formSection);

  /* ---------- results ---------- */
  const result = el('section', 'texture-finder-result', { 'aria-labelledby': `${id}-result-title`, hidden: true });
  const resultText = el('div', 'texture-finder-result-text');
  const restart = el('button', 'texture-finder-restart', { type: 'button' });
  restart.textContent = v('restartLabel');
  const resultContent = el('div', 'texture-finder-result-content');
  const resultTitle = el('h2', 'texture-finder-result-title', { id: `${id}-result-title`, tabindex: '-1', 'data-focus': true });
  resultTitle.textContent = v('resultTitle');
  const summary = el('div', 'texture-finder-summary');
  const summaryTitle = el('p', 'texture-finder-summary-title');
  summaryTitle.textContent = v('inputsTitle');
  const summaryList = el('ul', 'texture-finder-summary-list');
  const chosen = {};
  [['space', 'roomLabel'], ['light', 'lightLabel'], ['theme', 'themeLabel']].forEach(([key, labelKey]) => {
    const li = el('li');
    const value = el('span', 'texture-finder-summary-value');
    chosen[key] = value;
    li.append(`${v(labelKey)} - `, value);
    summaryList.append(li);
  });
  summary.append(summaryTitle, summaryList);
  const notes = el('div', 'texture-finder-notes');
  const notesText = el('p', 'texture-finder-notes-text');
  const tabName = el('span', 'texture-finder-notes-tab');
  const [beforeTab, afterTab = ''] = v('downloadText').split('{tab}');
  notesText.append(beforeTab, tabName, afterTab);
  const pdfButton = el('button', 'texture-finder-cta texture-finder-cta-download texture-finder-pdf', { type: 'button' });
  const pdfLabel = el('span', 'texture-finder-cta-label');
  pdfLabel.textContent = v('downloadLabel');
  pdfButton.append(pdfLabel, el('span', 'texture-finder-download-icon', { 'aria-hidden': 'true' }), el('span', 'texture-finder-spinner', { 'aria-hidden': 'true' }));
  notes.append(notesText, pdfButton);
  resultContent.append(resultTitle, summary, notes);
  resultText.append(restart, resultContent);

  const cardsWrap = el('div', 'texture-finder-result-cards');
  const mobileTitle = el('p', 'texture-finder-result-title-mobile', { 'aria-hidden': 'true' });
  mobileTitle.textContent = v('resultTitle');
  const tablist = el('div', 'texture-finder-tabs', { role: 'tablist', 'aria-label': v('tabsLabel') });
  const panels = el('div', 'texture-finder-panels');
  cardsWrap.append(mobileTitle, tablist, panels);
  result.append(resultText, cardsWrap);
  sections.push(result);

  block.replaceChildren(bg, ...sections, live);

  /* ---------- shared helpers ---------- */
  const setNext = (step, enabled) => {
    step.next.setAttribute('aria-disabled', String(!enabled));
  };
  const resetSliders = () => steps.forEach((s) => s.slider.goTo(0, false));
  const setBusy = (button, busy) => {
    button.classList.toggle('is-busy', busy);
    if (busy) {
      button.setAttribute('aria-disabled', 'true');
      button.setAttribute('aria-busy', 'true');
    } else {
      button.removeAttribute('aria-disabled');
      button.removeAttribute('aria-busy');
    }
  };
  const showFormError = () => {
    setBusy(submit, false);
    formBox.hidden = true;
    errorPanel.hidden = false;
    showSection(formSection, false);
    errorTitle.focus({ preventScroll: true });
  };
  const hideFormError = () => {
    errorPanel.hidden = true;
    formBox.hidden = false;
  };

  /* ---------- results ---------- */
  let data = null;
  let activeTab = '';
  let tabs = [];
  const filterOf = () => `${state.space}|${state.light}|${state.theme}`;

  const card = (t) => {
    const li = el('li', 'texture-finder-texture');
    const body = el('div', 'texture-finder-texture-body');
    const imgSec = el('div', 'texture-finder-texture-image');
    // the source's image tag (49 x 55 attributes; the card sizes it)
    const img = el('img', '', {
      src: t.listingSwatchImage, alt: '', loading: 'lazy', width: '49', height: '55',
    });
    const name = el('h3', 'texture-finder-texture-name');
    name.textContent = t.FinishName || '';
    imgSec.append(img, name);
    const product = el('div', 'texture-finder-product');
    const used = el('div', 'texture-finder-product-used');
    const usedTitle = el('h4', 'texture-finder-small-title');
    usedTitle.textContent = v('productUsedLabel');
    const pName = el('span', 'texture-finder-product-name');
    pName.textContent = t.ProductUsed || '';
    const pNum = el('span', 'texture-finder-product-num');
    pNum.textContent = t.ProductCode || '';
    used.append(usedTitle, pName, pNum);
    product.append(used);
    const shades = el('div', 'texture-finder-shades');
    const shadesTitle = el('h4', 'texture-finder-shades-title');
    shadesTitle.textContent = v('shadesUsedLabel');
    const shadeRow = el('div', 'texture-finder-shade-row');
    [['Top', 'topCoatLabel'], ['Base', 'baseCoatLabel']].forEach(([coat, labelKey]) => {
      const wrap = el('div', 'texture-finder-shade');
      const label = el('span', 'texture-finder-shade-label');
      label.textContent = v(labelKey);
      const chip = el('div', 'texture-finder-shade-chip');
      chip.style.setProperty('--texture-finder-chip', t[`${coat}CoatShadeHexCode`] || 'transparent');
      const sName = el('span', 'texture-finder-shade-name');
      sName.textContent = t[`${coat}CoatShadeName`] || '';
      const sCode = el('span', 'texture-finder-shade-code');
      sCode.textContent = t[`${coat}CoatShadeCode`] || '';
      chip.append(sName, sCode);
      wrap.append(label, chip);
      shadeRow.append(wrap);
    });
    shades.append(shadesTitle, shadeRow);
    const linkWrap = el('div', 'texture-finder-texture-link');
    const a = el('a', '', { href: pagePath(t.pageUrl), target: '_blank', rel: 'noopener noreferrer' });
    a.textContent = v('detailsLabel');
    const sr = el('span', 'texture-finder-sr-only');
    sr.textContent = ` ${t.FinishName || ''} ${newTabNote}`;
    a.append(sr);
    a.addEventListener('click', () => {
      const details = `${pName.textContent.trim()}|${pNum.textContent.trim()}`;
      pushAdobeCalculatorEvents({
        event: 'calct_product_view', filter: filterOf(), productdetails: details, category: activeTab,
      });
    });
    linkWrap.append(a);
    body.append(imgSec, product, shades, linkWrap);
    li.append(body);
    return li;
  };

  const selectTab = (tab, focus = false) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.button.setAttribute('aria-selected', String(on));
      t.button.tabIndex = on ? 0 : -1;
      t.panel.hidden = !on;
    });
    activeTab = tab.name;
    tabName.textContent = tab.name;
    // mobile: each tab's slider starts at its first card (the source's slickGoTo(0))
    tab.slider.goTo(0, false);
    if (focus) tab.button.focus();
  };

  const renderResults = (resp) => {
    data = resp;
    tablist.replaceChildren();
    panels.replaceChildren();
    tabs = TAB_ORDER.filter((name) => data[name]).map((name, i) => {
      const n = i + 1;
      const button = el('button', 'texture-finder-tab', {
        type: 'button', role: 'tab', id: `${id}-tab${n}`, 'aria-controls': `${id}-panel${n}`,
      });
      button.textContent = name;
      const panel = el('div', 'texture-finder-panel', {
        role: 'tabpanel', id: `${id}-panel${n}`, 'aria-labelledby': `${id}-tab${n}`, tabindex: '0',
      });
      const list = el('ul', 'texture-finder-textures', { role: 'list' });
      const items = TEXTURES.filter((key) => data[name][key]).map((key) => card(data[name][key]));
      list.append(...items);
      const sl = slider(list, items, { label: name, dotLabel: slideLabel });
      panel.append(list, sl.dots);
      tablist.append(button);
      panels.append(panel);
      return {
        name, button, panel, slider: sl,
      };
    });
    tabs.forEach((tab, i) => {
      tab.button.addEventListener('click', () => selectTab(tab));
      tab.button.addEventListener('keydown', (e) => {
        const keys = {
          ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1,
        };
        if (!(e.key in keys)) return;
        e.preventDefault();
        selectTab(tabs[(keys[e.key] + tabs.length) % tabs.length], true);
      });
    });
    showSection(result);
    if (tabs.length) selectTab(tabs[0]);
    setBusy(submit, false);
  };

  const loadResults = async () => {
    const answers = { space: state.space, light: state.light, theme: state.theme };
    renderResults(await recommendations(v('endpoint'), href(fields.snapshot?.cell), answers));
    pushAdobeCalculatorEvents({ event: 'Texturetool_submit', filter: filterOf(), flowType: 'Texture tool' });
  };

  /* ---------- steps ---------- */
  const lightPictures = (room) => {
    steps[1].items.forEach((it, i) => {
      const { desk, mob } = lightImage(room, LIGHT_KEYS[i] || 'low');
      const pic = picture(desk, { mobile: mob, media: '(max-width: 575px)' });
      if (pic) it.mediaWrap.replaceChildren(pic);
    });
  };
  const select = (step, entry) => {
    const was = entry.li.classList.contains('is-selected');
    step.items.forEach((it) => {
      it.li.classList.remove('is-selected');
      it.button.setAttribute('aria-pressed', 'false');
    });
    state[step.key] = entry.value;
    saveState();
    if (!was) {
      entry.li.classList.add('is-selected');
      entry.button.setAttribute('aria-pressed', 'true');
      picks[step.key] = entry;
      // mobile: the chosen card slides to the front (the source's focusOnSelect)
      if (mq.matches) step.slider.goTo(step.items.indexOf(entry));
    } else {
      picks[step.key] = null;
    }
    setNext(step, !was);
    chosen[step.key].textContent = entry.name;
    if (step.key === 'space') lightPictures(entry.item);
  };
  steps.forEach((step) => {
    step.items.forEach((entry) => entry.button.addEventListener('click', () => select(step, entry)));
  });

  const stepFilter = (step) => `${step.question.textContent}|${picks[step.key]?.value || ''}`;
  let restartFlag = true;
  let startOnNext = false;
  const trackStart = () => {
    pushAdobeSingleEvent('Texturetool_start');
  };

  start.addEventListener('click', () => {
    trackStart();
    resetSliders();
    showSection(steps[0].section);
  });

  steps.forEach((step, i) => {
    step.prev.addEventListener('click', () => {
      const parentTitle = step.question.textContent;
      pushAdobeCtaClickEvent({ event: 'custom_cta_click', cta: v('previousLabel'), parentTitle });
      resetSliders();
      showSection(i === 0 ? home : steps[i - 1].section);
    });
    step.next.addEventListener('click', async () => {
      // nothing happens until a card is chosen (as on the source)
      if (step.next.getAttribute('aria-disabled') === 'true') return;
      // after a restart the source also counts step 1's Next as a start
      if (i === 0 && startOnNext) trackStart();
      const event = `tool_step${step.n}`;
      pushAdobeCalculatorEvents({
        event, filter: stepFilter(step), flowType: 'Interior Texture Tool',
      });
      resetSliders();
      if (i < steps.length - 1) {
        showSection(steps[i + 1].section);
        return;
      }
      // theme step: straight to the results after a lead this visit, else the form;
      // data-attr-skip-form="true" (visitors who already sent a lead, form-removal.js) skips it
      if (!state.formPreviouslySubmitted && !state.formSkipped
        && block.dataset.attrSkipForm !== 'true') {
        showSection(formSection);
        return;
      }
      setBusy(step.next, true);
      try {
        await loadResults();
      } catch (e) {
        showFormError();
      }
      setBusy(step.next, false);
      setNext(step, !!picks[step.key]);
    });
  });

  /* ---------- form ---------- */
  const float = (key) => groups[key].classList.add('is-floating');
  const setError = (key, message) => {
    const group = groups[key];
    const input = inputs[key];
    group.classList.toggle('is-invalid', !!message);
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    group.querySelector('.texture-finder-error').textContent = message || '';
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
  const validateRadios = (name) => {
    const r = radios[name];
    const ok = r.list.some((input) => input.checked);
    r.error.textContent = ok ? '' : v('requiredError');
    r.set.classList.toggle('is-invalid', !ok);
    return ok;
  };
  Object.entries(inputs).forEach(([key, input]) => {
    input.addEventListener('focus', () => {
      float(key);
      if (key === 'mobile') phone.classList.add('is-focused');
    });
    input.addEventListener('blur', () => validate(key));
    input.addEventListener('input', () => setError(key, ''));
  });
  // the source pre-fills from its ITFormFields cookie
  const cookie = decodeURIComponent(getCookieValues('ITFormFields') || '');
  if (cookie.includes('|')) {
    cookie.split('|').slice(0, 4).forEach((value, i) => {
      const key = ['name', 'email', 'mobile', 'pin'][i];
      if (value && value.trim() && value !== 'undefined') {
        inputs[key].value = value.trim();
        float(key);
        if (key === 'mobile') phone.classList.add('is-focused');
      }
    });
  }

  const resetForm = () => {
    form.reset();
    Object.keys(inputs).forEach((key) => {
      setError(key, '');
      groups[key].classList.remove('is-floating');
    });
    phone.classList.remove('is-focused');
    Object.values(radios).forEach((r) => {
      r.error.textContent = '';
      r.set.classList.remove('is-invalid');
    });
  };

  const pushLead = async () => {
    const x = leadExtras();
    const campaignId = urlParam('utm_campaign') || v('campaignId');
    const selectors = {
      name: `#${id}-name`, email: `#${id}-email`, mobile: `#${id}-mobile`, pincode: `#${id}-pin`,
    };
    const lead = buildLeadPayload(form, {
      selectors, campaignId, resourcePath: v('leadNode') || window.location.pathname, pageUrl: window.location.href,
    });
    const answers = {
      remarks: radios.remarks.list.find((r) => r.checked)?.value || '',
      answer: radios.answer.list.find((r) => r.checked)?.value || '',
    };
    // the source's cookie: "first name |email|mobile|pin", 30 days
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `ITFormFields=${lead.fName} |${lead.email}|${lead.mobileNo}|${lead.pinCode};expires=${expires};path=/`;
    const db = await postFormUrlEncoded(v('saveEndpoint'), dbPayload(lead, answers, x, campaignId));
    let rowId;
    if (db?.Status === 'SUCCESS') {
      rowId = db.rowID;
    } else if (String(lead.node).includes('/en/')) {
      // not saved: the source still pushes /en/ leads to Salesforce
      rowId = `${Date.now()}-nondblead`;
    }
    if (!rowId) return false;
    let sfFlag = false;
    try {
      const sf = await postFormUrlEncoded(v('salesforceEndpoint'), salesforcePayload(lead, answers, x, campaignId, rowId));
      sfFlag = Number(JSON.parse(JSON.stringify(sf))?.returnCode) === 201;
    } catch (e) {
      sfFlag = false;
    }
    if (sfFlag) {
      markLeadFormFilled({
        name: `${lead.fName} ${lead.lName}`,
        email: lead.email,
        mobile: lead.mobileNo,
        pincode: lead.pinCode,
        campaignId,
      });
    }
    // if (!sfFlag) track.cc('formFailure', form);
    // else track.cc('FormSubmitENSite', form, dbFlag, sfFlag);
    if (sfFlag) {
      pushAdobeFormEvents({
        event: 'form_submit',
        formName: v('formTitle'),
        formCampaignId: campaignId,
        construction: radios.remarks.list.find((r) => r.checked)?.value || '',
        localPainter: radios.answer.list.find((r) => r.checked)?.value || '',
        dataDestination: 'both',
      });
      state.formPreviouslySubmitted = true;
      state.formSkipped = false;
      saveState();
    }
    return sfFlag;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submit.classList.contains('is-busy')) return;
    const invalid = Object.keys(inputs).filter((key) => !validate(key));
    const badGroups = ['remarks', 'answer'].filter((name) => !validateRadios(name));
    if (invalid.length || badGroups.length) {
      pushAdobeFormEvents({
        event: 'form_error',
        formName: v('formTitle'),
        formCampaignId: urlParam('utm_campaign') || v('campaignId'),
        formError: [...invalid, ...badGroups],
      });
      if (invalid.length) inputs[invalid[0]].focus();
      else radios[badGroups[0]].list[0].focus();
      return;
    }
    setBusy(submit, true);
    live.textContent = v('submittingText');
    let ok = false;
    try {
      ok = await pushLead();
    } catch (err) {
      ok = false;
    }
    try {
      if (!ok) throw new Error('lead not saved');
      await loadResults();
      live.textContent = '';
    } catch (err) {
      live.textContent = '';
      showFormError();
    }
  });

  errorBack.addEventListener('click', () => {
    resetForm();
    hideFormError();
    showSection(home);
  });
  errorClose.addEventListener('click', () => {
    hideFormError();
    if (state.formPreviouslySubmitted) {
      showSection(home);
      return;
    }
    resetForm();
    showSection(formSection);
  });

  /* ---------- results actions ---------- */
  restart.addEventListener('click', () => {
    steps.forEach((step) => {
      step.items.forEach((it) => {
        it.li.classList.remove('is-selected');
        it.button.setAttribute('aria-pressed', 'false');
      });
      picks[step.key] = null;
      setNext(step, false);
    });
    // the source removes step 1's Previous button after a restart
    steps[0].prev.hidden = true;
    resetSliders();
    showSection(steps[0].section);
    if (restartFlag) {
      pushAdobeSingleEvent('Texturetool_recalculate');
      startOnNext = true;
      restartFlag = false;
    }
  });

  pdfButton.addEventListener('click', async () => {
    if (pdfButton.classList.contains('is-busy') || !data?.[activeTab]) return;
    pushAdobeCalculatorEvents({ event: 'calct_download', filter: filterOf(), category: activeTab });
    setBusy(pdfButton, true);
    live.textContent = v('downloadingText');
    try {
      const { downloadTexturePdf } = await import('./texture-pdf.js');
      await downloadTexturePdf({
        name: inputs.name.value,
        mobile: inputs.mobile.value,
        email: inputs.email.value,
        textures: data[activeTab],
      }, {
        greeting: v('pdfGreeting'),
        logo: firstImg(fields.pdfLogo?.cell)?.src || '',
        headerText: html('pdfHeaderText'),
        emailLabel: v('pdfEmailLabel'),
        mobileLabel: v('pdfMobileLabel'),
        texturesTitle: v('pdfTexturesTitle'),
        servicesImage: firstImg(fields.pdfServicesImage?.cell)?.src || '',
        servicesText: servicesHtml(fields.pdfServicesText?.cell),
        footerText: html('pdfFooterText'),
        fileName: v('pdfFileName'),
      });
      live.textContent = '';
    } catch (err) {
      live.textContent = v('errorText');
    }
    setBusy(pdfButton, false);
  });

  // a breakpoint change re-aligns the sliders
  mq.addEventListener('change', resetSliders);
}
