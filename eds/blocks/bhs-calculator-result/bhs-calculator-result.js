import { quote } from '../bhs-calculator/pricing.js';
import { pushAdobeCalculatorEvents, pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';

/**
 * bhs-calculator-result — the result page of the Interior Design Solution Cost
 * Calculator. It draws the quote from what the calculator stored in
 * sessionStorage (bhCalculatorData, selectPackageName, stepform), so it
 * needs no API of its own. It must live on the same origin as the calculator.
 *
 * Authoring (DA table), all rows optional, label | value:
 *   Heading | Subheading | Intro | Note | Calculate label | Download label |
 *   Compare title | Show more label | Show less label | Calculator page |
 *   Banner image | Empty text
 */

const ASSET_BASE = 'https://static.asianpaints.com/content/dam/Ap-Bhs/ap-beautiful-homes/bhs-calculator/';
const PACKAGES = ['economy', 'premium', 'luxury'];
const CARD_BANNERS = {
  economy: 'Group1png.png',
  premium: 'Mask%20group2.png',
  luxury: 'Mask%20group3.png',
};

const DEFAULTS = {
  heading: 'Your estimate is ready -',
  subheading: 'The first step towards your dream home!',
  intro: 'We’re excited to be part of your dream home journey!',
  note: '*This is only an indicative price based on our clients\' average spending. The final price can be higher or lower depending on factors like material, finish, and the number of furniture. We do not undertake any civil work (false ceilings, flooring, plumbing, etc..) and the final cost estimate excludes the same. Get in touch with our customer support team and get all your queries answered!',
  calculateLabel: 'Calculate Again',
  downloadLabel: 'Download PDF',
  downloadingLabel: 'Preparing PDF...',
  compareTitle: 'Compare packages',
  showMoreLabel: 'show more',
  showLessLabel: 'show less',
  calculatorPage: '/resources/tools/interior-design-solutions-calculator',
  bannerImage: `${ASSET_BASE}unsplash_hE0nmTffKtM.png`,
  pageTitle: 'Interior Design Services Calculator Result',
  emptyText: 'We could not find your estimate. Please calculate it again.',
};

const FIELDS = {
  heading: 'heading',
  subheading: 'subheading',
  intro: 'intro',
  note: 'note',
  'calculate label': 'calculateLabel',
  'download label': 'downloadLabel',
  'compare title': 'compareTitle',
  'show more label': 'showMoreLabel',
  'show less label': 'showLessLabel',
  'calculator page': 'calculatorPage',
  'banner image': 'bannerImage',
  'empty text': 'emptyText',
  'page title': 'pageTitle',
};

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const cap = (s) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

function readConfig(block) {
  const cfg = { ...DEFAULTS };
  [...block.children].forEach((row) => {
    const [label, value] = [...row.children];
    const key = FIELDS[(label?.textContent || '').trim().toLowerCase()];
    if (!key || !value) return;
    const link = value.querySelector('a')?.getAttribute('href');
    const img = value.querySelector('img')?.getAttribute('src');
    const text = (img || link || value.textContent || '').trim();
    if (text) cfg[key] = text;
  });
  return cfg;
}

function readJson(key) {
  try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (e) { return null; }
}

const roomsFilter = (selected) => Object.entries(selected)
  .map(([k, v]) => `${k}:${v}`)
  .join('|');

/** the quote helper returns html strings of "feature-desc" rows, one card per room */
function parseCards(featureCards) {
  return featureCards.map((html) => {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    return [...doc.body.firstElementChild.querySelectorAll('.feature-desc')].map((d) => ({
      name: (d.querySelector('.feature')?.textContent || '').trim(),
      text: (d.querySelector('.description')?.textContent || '').trim(),
    }));
  });
}

function roomCard(rows) {
  const card = el('div', 'bhs-result-card');
  rows.forEach(({ name, text }) => {
    const row = el('div', 'bhs-result-row');
    row.append(el('p', 'bhs-result-label', name), el('p', 'bhs-result-text', text));
    card.append(row);
  });
  return card;
}

function compareCard(pkg, stored) {
  const { price, featureCards } = quote(stored, pkg);
  const rooms = parseCards(featureCards);
  const card = el('div', `bhs-result-compare-card is-${pkg}`);
  const banner = el('div', 'bhs-result-compare-banner');
  const img = el('img');
  img.src = `${ASSET_BASE}${CARD_BANNERS[pkg]}`;
  img.alt = '';
  img.loading = 'lazy';
  banner.append(img, el('h3', '', cap(pkg)));
  const priceBox = el('div', 'bhs-result-compare-price');
  const desc = Object.keys(stored.selectedData || {})
    .map((k) => stored[k]?.[pkg]?.packagedesc).filter(Boolean).join(' | ');
  priceBox.append(el('p', '', price), el('span', '', desc));
  const info = el('div', 'bhs-result-compare-info');
  rooms.forEach((rows) => {
    const cat = el('div', 'bhs-result-compare-room');
    const [first, ...rest] = rows;
    cat.append(el('p', '', first?.name || 'Rooms'), el('span', '', first?.text || ''));
    const list = el('ul', 'bhs-result-compare-list');
    rest.forEach(({ name, text }) => {
      const li = el('li', 'bhs-result-compare-type');
      if (name) li.append(document.createTextNode(`${name} `));
      const sub = el('ul');
      text.split(/,\s+/).filter(Boolean).forEach((part) => sub.append(el('li', '', part.trim())));
      li.append(sub);
      list.append(li);
    });
    cat.append(list);
    info.append(cat);
  });
  card.append(banner, priceBox, info);
  return card;
}

function emptyState(cfg) {
  const box = el('div', 'bhs-result-empty');
  box.append(el('p', '', cfg.emptyText));
  const a = el('a', 'bhs-result-btn bhs-result-btn-outline', cfg.calculateLabel);
  a.href = cfg.calculatorPage;
  box.append(a);
  return box;
}

async function downloadPdf(btn, cfg, stored, pkg, lead) {
  // like the source: the label stays and a spinner shows while the PDF builds
  const spinner = btn.querySelector('.bhs-result-rotating');
  btn.disabled = true;
  spinner.hidden = false;
  try {
    const { buildQuotePdf } = await import('../bhs-calculator/quote-pdf.js');
    const { price, featureCards } = quote(stored, pkg);
    const blob = await buildQuotePdf({
      name: lead?.name || '',
      number: lead?.mobileNo || '',
      mail: lead?.emailId || '',
      pkgName: pkg,
      price,
      featureCards,
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'beautiful-homes-estimate.pdf';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (e) {
    // the quote stays on screen; the visitor can try again
  } finally {
    spinner.hidden = true;
    btn.disabled = false;
  }
}

export default function decorate(block) {
  const cfg = readConfig(block);
  document.title = cfg.pageTitle;
  const stored = readJson('bhCalculatorData');
  const pkg = (sessionStorage.getItem('selectPackageName') || '').toLowerCase();
  // stepform is only set once the lead reaches Salesforce; the draft is what the form collected
  const lead = readJson('stepform') || readJson('bhLeadDraft');
  const valid = stored && PACKAGES.includes(pkg) && Object.keys(stored.selectedData || {}).length;

  block.textContent = '';
  // the photo sits behind the heading and the top of the panel, like the live page
  const top = el('div', 'bhs-result-top');
  const bg = el('img');
  bg.src = cfg.bannerImage;
  bg.alt = '';
  const hero = el('div', 'bhs-result-hero');
  hero.append(el('h1', '', cfg.heading), el('p', 'bhs-result-sub', cfg.subheading));
  const outer = el('div', 'bhs-result-outer');
  const panel = el('div', 'bhs-result-panel');
  outer.append(panel);
  top.append(bg, hero, outer);
  block.append(top);

  if (!valid) {
    panel.append(emptyState(cfg));
    return;
  }

  const { price, featureCards } = quote(stored, pkg);
  panel.append(el('p', 'bhs-result-intro', cfg.intro));

  const head = el('div', 'bhs-result-package');
  const who = el('div', 'bhs-result-package-info');
  const icon = el('img');
  icon.src = `${ASSET_BASE}${pkg}.png`;
  icon.alt = '';
  const name = el('div', 'bhs-result-package-name');
  name.append(el('p', '', `${cap(pkg)} Package`));
  const iconRow = el('div', 'bhs-result-package-head');
  iconRow.append(icon, name);
  who.append(iconRow, el('p', 'bhs-result-price', price));
  const cta = el('div', 'bhs-result-package-cta');
  const calc = el('a', 'bhs-result-btn bhs-result-btn-outline', cfg.calculateLabel);
  calc.href = cfg.calculatorPage;
  calc.append(el('span', 'bhs-result-arrow'));
  calc.addEventListener('click', () => {
    pushAdobeCalculatorEvents({
      event: 'bhs_recalculate',
    });
  });
  cta.append(calc);
  head.append(who, cta);
  panel.append(head);

  parseCards(featureCards).forEach((rows) => panel.append(roomCard(rows)));
  panel.append(el('p', 'bhs-result-note', cfg.note));

  const dl = el('button', 'bhs-result-btn bhs-result-btn-fill');
  dl.type = 'button';
  dl.append(el('span', '', cfg.downloadLabel), el('span', 'bhs-result-download-icon'));
  const spin = el('span', 'bhs-result-rotating', '\u21BB');
  spin.hidden = true;
  dl.append(spin);
  dl.addEventListener('click', () => {
    pushAdobeCalculatorEvents({
      event: 'bhs_download',
      cta: cfg.downloadLabel,
      parentTitle: cfg.heading,
      filter: roomsFilter(stored.selectedData || {}),
      selectedValue: pkg,
    });

    downloadPdf(dl, cfg, stored, pkg, lead);
  });
  panel.append(dl);

  const compare = el('div', 'bhs-result-compare');
  const title = el('div', 'bhs-result-compare-top');
  const more = el('button', 'bhs-result-more', cfg.showMoreLabel);
  more.type = 'button';
  more.setAttribute('aria-expanded', 'false');
  title.append(el('h2', '', cfg.compareTitle), more);
  const wrap = el('div', 'bhs-result-compare-cards');
  PACKAGES.forEach((p) => wrap.append(compareCard(p, stored)));
  more.addEventListener('click', () => {
    const open = wrap.classList.toggle('is-open');
    // the live page title-cases the label after the first toggle

    pushAdobeCtaClickEvent({
      event: 'cta_link_text',
      cta: open ? cfg.showMoreLabel : cfg.showLessLabel,
      parentTitle: cfg.compareTitle,
      filter: roomsFilter(stored.selectedData || {}),
      selectedValue: pkg,
    });

    const label = open ? cfg.showLessLabel : cfg.showMoreLabel;
    more.textContent = label.replace(/\b\w/g, (c) => c.toUpperCase());
    more.setAttribute('aria-expanded', String(open));
  });
  compare.append(title, wrap);
  block.append(compare);
}
