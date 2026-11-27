import { loadScript } from '../../scripts/aem.js';

/**
 * budget-calculator PDF: the source's pbcPDFDownload — its template and CSS
 * (unchanged) rendered off-screen at 595px, captured with html2canvas
 * (the source's options) and sliced over A4 pages with jsPDF. Loaded only when
 * "Download Estimate" is pressed.
 */

// the source's PDF template CSS (budgetcalculatorrevamp clientlib), unchanged
const PDF_CSS = `
  /* the source renders this inside its page, whose global styles supply these:
     no body margin (the 595px width html2canvas captures), border-box sizing and
     the base text; without them the layout is narrower and taller than the source's */
  body {
      margin: 0;
      font-size: 14px;
      line-height: 22px;
      color: #222;
  }

  *,
  *::before,
  *::after {
      box-sizing: border-box;
  }

  p {
      letter-spacing: 0.5px;
  }

  /* Set core body defaults */
  body {
      font-family: Manrope;
      min-height: 100vh;
      scroll-behavior: smooth;
      text-rendering: optimizeSpeed;
  }

  /* Remove all animations and transitions for people that prefer not to see them */
  @media (prefers-reduced-motion: reduce) {
      * {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
          scroll-behavior: auto !important;
      }
  }
 .pbc-revamp-pdf-container {
     position: relative;
}
.pbc-revamp-pdf-container .landing-bg-image .disclaimer-section {
    font-weight: 500;
    font-size: 10px;
    line-height: 16px;
    letter-spacing: 0;
    color: #8C8E90;
    display: grid;
    grid-auto-flow: row;
    justify-content: start;
    padding: 6px 15px;
    background: #D5DDE066;
}
.pbc-revamp-pdf-container .landing-bg-image .disclaimer-section .astr {
    color: #ED1C24;
    font-size: 10px;
    line-height: 11px;
    font-weight: 600;
}
.pbc-revamp-pdf-container .product-types-container {
    padding: 15px;
}
 .pbc-revamp-pdf-container img {
     width: 100%;
     height: auto;
     object-fit: cover;
}
 .pbc-revamp-pdf-container .bg-purple-200 {
     background-color: #af9dca;
}
 .pbc-revamp-pdf-container .bg-purple-80 {
     background-color: #dbd3e7;
}
 .pbc-revamp-pdf-container .bg-purple-50 {
     background-color: #eeeaf3;
}
 .pbc-revamp-pdf-container .bg-grey {
     background-color: #eef1f3;
}
 .pbc-revamp-pdf-container .bg-indigo-200 {
     background-color: #8093b3;
}
 .pbc-revamp-pdf-container .bg-solitude {
     background-color: #dfe7f5;
}
 .pbc-revamp-pdf-container .bg-blue-gray {
     background-color: #8093b3;
}
 .pbc-revamp-pdf-container .bg-indigo-50 {
     background-color: #eceff4;
}
 .pbc-revamp-pdf-container .bg-beige {
     background-color: #cdc0a0;
}
 .pbc-revamp-pdf-container .bg-beige-400 {
     background-color: #ece5d7;
}
 .pbc-revamp-pdf-container .bg-beige-200 {
     background-color: #faf6ef;
}
 .pbc-revamp-pdf-container .text-center {
     text-align: center;
}
 .pbc-revamp-pdf-container .title-tile {
         border-radius: 6px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    justify-content: space-between;
    padding: 8px;
    margin-bottom: 10px;
    gap: 100px;
}
 .pbc-revamp-pdf-container .title-tile .title {
    display: flex;
    align-items: center;
    font-weight: 700;
    font-size: 32px;
    line-height: 36.4px;
}
 .pbc-revamp-pdf-container .title-tile .title .sq-divider-wrapper {
     position: absolute;
    left: 200px;
    display: flex;
    align-items: center;
    gap: 12px;
}
 .pbc-revamp-pdf-container .title-tile .title .sq-divider-wrapper .divider {
     height: 28px;
     width: 1px;
     display: block;
}
 .pbc-revamp-pdf-container .title-tile .title .sq-divider-wrapper .area {
     font-weight: 700;
     font-size: 16px;
     line-height: 24px;
     letter-spacing: 0;
}

.pbc-revamp-pdf-container .title-tile .title .sq-divider-wrapper .area span {
     font-weight: 400;
     font-size: 12px;
     line-height: 16.8px;
     letter-spacing: 0;
}
 .pbc-revamp-pdf-container .title-tile .note {
         letter-spacing: 0;
    text-align: right;
    color: #fff;
    font-weight: 400;
    font-size: 12px;
    line-height: 16px;
}
 .pbc-revamp-pdf-container .grid {
     display: grid;
}
 .pbc-revamp-pdf-container .grid .astr {
     color: #ed1c24;
     font-size: 14px;
     line-height: 21px;
     font-weight: 500;
}
 .pbc-revamp-pdf-container .grid .tr-row {
    display: grid;
    grid-template-columns: 24% 56% 20%;
    column-gap: 5px;
    text-align: center;
    margin-bottom: 1px;
    font-weight: 600;
    font-size: 10px;
    line-height: 16.8px;
    letter-spacing: 0;
    color: #75787B;
}
 .pbc-revamp-pdf-container .grid .tr-row .top-coat-col,
 .pbc-revamp-pdf-container .grid .tr-row .undercoats-col,
 .pbc-revamp-pdf-container .grid .tr-row .total-price-col {
     text-transform: uppercase;
     text-align: center;
 }
 .pbc-revamp-pdf-container .grid .pr-row {
     display: grid;
    grid-template-columns: 24% 56% 20%;
    column-gap: 5px;
    width: calc(100% - 10px);
    margin-bottom: 2px;
    max-height: 208px;
    height: 208px;
}

 .pbc-revamp-pdf-container .wood .grid .pr-row {
    max-height: 304px;
    height: 304px;
}

 .pbc-revamp-pdf-container .grid .pr-row .pr-card {
     display: grid;
     grid-template-columns: 1fr;
     padding: 10px 10px 20px;
     border-radius: 10px;
}
 .pbc-revamp-pdf-container .grid .pr-row .pr-card .item {
     display: flex;
     width: 100%;
     flex-direction: column;
     align-items: flex-start;
     text-align: left;
     position: relative;
}
 .pbc-revamp-pdf-container .product-types-container .side-walls .grid .pr-row .pr-card.undercoat .item,
 .pbc-revamp-pdf-container .product-types-container .ceiling .grid .pr-row .pr-card.undercoat .item,
 .pbc-revamp-pdf-container .product-types-container .metal .grid .pr-row .pr-card.undercoat .item {
    max-height: 168px;
 }
 .pbc-revamp-pdf-container .grid .pr-row .pr-card .item .img-box {
     width: 100%;
     max-width: 65px;
     position: unset;
     margin-bottom: 2px;
}
 .pbc-revamp-pdf-container .grid .pr-row .pr-card .item .chevron-icon-section {
    position: absolute;
    top: 0;
    right: -16px;
    transform: translateY(-20px);
    width: 48px;
    height: 59px;
 }
 .pbc-revamp-pdf-container .grid .pr-row .pr-card.undercoat .item .chevron-icon-section {
    width: 39px;
    height: 48px;
    right: unset;
    left: 0;
 }
.pbc-revamp-pdf-container .wood .grid .pr-row .pr-card .item .chevron-icon-section {
    display: none;
}
 .pbc-revamp-pdf-container .grid .pr-row .pr-card .item .img-box .qty {
    font-size: 14px;
    font-weight: 500;
    color: #fff;
    padding: 10px 0;
    line-height: 14.8px;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    text-align: center;
}

.pbc-revamp-pdf-container .grid .pr-row .pr-card .item .img-box .qty .ltr {
    font-weight: 400;
    font-size: 10px;
    letter-spacing: 0;
    margin-top: -5px;
    display: inline-block;
    width: 100%;
}

.pbc-revamp-pdf-container .grid .pr-row .pr-card.undercoat .item .img-box .qty .ltr {
    margin-top: 0;
}

 .pbc-revamp-pdf-container .grid .pr-row .pr-card .item .title {
     color: #2e2f32;
    font-size: 12px;
    font-weight: 400;
    line-height: 16.8px;
    margin-bottom: auto;
}
 .pbc-revamp-pdf-container .grid .pr-row .pr-card .item .price {
     display: flex;
     align-items: center;
}
 .pbc-revamp-pdf-container .grid .pr-row .pr-card .item .price .currency {
     font-weight: 400;
     font-size: 12px;
     line-height: 16.8px;
     color: #8c8e90;
}
 .pbc-revamp-pdf-container .grid .pr-row .pr-card .item .price .cost {
     font-weight: 700;
     font-size: 14px;
     line-height: 21px;
     color: #654D8A;
}
 .pbc-revamp-pdf-container .grid .pr-row .pr-card .item .price .unit {
    font-weight: 400;
     font-size: 12px;
     line-height: 16.8px;
     color: #8c8e90;
}
 .pbc-revamp-pdf-container .grid .pr-row .pr-card .item .note {
     color: #8c8e90;
     font-weight: 400;
     font-size: 10px;
     line-height: 16.8px;
}
.pbc-revamp-pdf-container .grid .pr-row .pr-card.main-coat {
    padding: 20px 16px 10px;
}
.pbc-revamp-pdf-container .grid .pr-row .pr-card.main-coat .item .price .unit {
    margin-top: 1px;
}
 .pbc-revamp-pdf-container .grid .pr-row .pr-card.undercoat {
    display: grid;
    grid-template-columns: repeat(3, 90px);
    justify-content: space-between;
    padding: 20px 16px;
}
 .pbc-revamp-pdf-container .grid .pr-row .pr-card.undercoat .item .img-box {
     max-width: 39px;
     margin-bottom: 8px;
     margin-top: 30px;
}
 .pbc-revamp-pdf-container .grid .pr-row .pr-card.undercoat .item .img-box .qty {
    line-height: 12.8px;
    padding: 8px 0;
}
 .pbc-revamp-pdf-container .grid .pr-row .pr-card.undercoat .item .title {
     margin-bottom: auto;
     width: 80%;
}
 .pbc-revamp-pdf-container .grid .pr-row .pr-card.undercoat .item .bottom .cost {
    font-size: 12px;
    line-height: 16.8px;
}
 .pbc-revamp-pdf-container .grid .pr-row .pr-card.undercoat .item .bottom .note {
    line-height: 100%;
}
.pbc-revamp-pdf-container .grid .pr-row .pr-card.total-price {
    padding: 12px;
    place-content: center;
}
 .pbc-revamp-pdf-container .grid .pr-card.total-price .title {
     display: flex;
     color: #22123a;
     align-items: center;
}
 .pbc-revamp-pdf-container .grid .pr-card.total-price .title .currency {
     color: #232426;
     font-size: 12px;
     line-height: 16.8px;
     font-weight: 400;
}
 .pbc-revamp-pdf-container .grid .pr-card.total-price .title .amount {
    font-weight: 700;
    font-size: 16px;
    line-height: 24px;
    color: #22123A;
}
 .pbc-revamp-pdf-container .grid .pr-card.total-price .note {
    font-size: 12px;
    line-height: 16.8px;
    color: #8C8E90;
}

.pbc-revamp-pdf-container .wood .grid .pr-card.undercoat {
     grid-template-columns: 1fr;
}

 .pbc-revamp-pdf-container .wood .text-wrapper {
     width: 100%;
     display: flex;
     flex-direction: column;
     align-items: center;
     justify-content: flex-end;
     text-align: center;
     padding: 0 1rem;
     position: relative;
     color: #2e2f32;
}

 .pbc-revamp-pdf-container .wood .text-wrapper .title-text {
     font-weight: 700;
     font-size: 14px;
     line-height: 21px;
     margin-bottom: 6px;
}

 .pbc-revamp-pdf-container .wood .text-wrapper .desc-text {
     font-weight: 500;
     font-size: 14px;
     line-height: 21px;
     margin-bottom: 60px;
}

 .pbc-revamp-pdf-container .wood .text-wrapper .bottom-text {
     font-weight: 700;
     font-size: 12px;
     line-height: 16.8px;
     letter-spacing: 0;
}

.pbc-revamp-pdf-container .product-types-container .pr-type-section:first-child .grid .pr-row-container .pr-row:nth-child(1):last-child {
   margin-bottom: 390px;
}
.pbc-revamp-pdf-container .product-types-container .pr-type-section:first-child .grid .pr-row-container .pr-row:nth-child(2) {
    margin-bottom: 180px;
}
.pbc-revamp-pdf-container .product-types-container .pr-type-section:first-child .grid .pr-row-container .pr-row:nth-child(n+4):nth-child(even) {
    margin-bottom: 425px;
}
.pbc-revamp-pdf-container .product-types-container .pr-type-section:first-child .grid .pr-row-container .pr-row:nth-child(n+3):nth-child(odd):last-child {
   margin-bottom: 630px;
}

.pbc-revamp-pdf-container .product-types-container .ceiling.pr-type-section:not(:first-child) .grid .pr-row-container .pr-row:nth-child(1):last-child,
.pbc-revamp-pdf-container .product-types-container .metal.pr-type-section:not(:first-child) .grid .pr-row-container .pr-row:nth-child(1):last-child {
    margin-bottom: 550px;
}
.pbc-revamp-pdf-container .product-types-container .ceiling.pr-type-section:not(:first-child) .grid .pr-row-container .pr-row:nth-child(2),
.pbc-revamp-pdf-container .product-types-container .metal.pr-type-section:not(:first-child) .grid .pr-row-container .pr-row:nth-child(2) {
    margin-bottom: 335px;
}
.pbc-revamp-pdf-container .product-types-container .ceiling.pr-type-section:not(:first-child) .grid .pr-row-container .pr-row:nth-child(n+4):nth-child(even),
.pbc-revamp-pdf-container .product-types-container .metal.pr-type-section:not(:first-child) .grid .pr-row-container .pr-row:nth-child(n+4):nth-child(even) {
    margin-bottom: 425px;
}
.pbc-revamp-pdf-container .product-types-container .ceiling.pr-type-section:not(:first-child) .grid .pr-row-container .pr-row:nth-child(n+3):nth-child(odd):last-child,
.pbc-revamp-pdf-container .product-types-container .metal.pr-type-section:not(:first-child) .grid .pr-row-container .pr-row:nth-child(n+3):nth-child(odd):last-child {
   margin-bottom: 640px;
}


.pbc-revamp-pdf-container .product-types-container .wood.pr-type-section:first-child .grid .pr-row-container .pr-row:nth-child(1) {
    margin-bottom: 295px;
}
.pbc-revamp-pdf-container .product-types-container .wood.pr-type-section .grid .pr-row-container .pr-row:nth-child(n+2):nth-child(even) {
    margin-bottom: 540px;
}
.pbc-revamp-pdf-container .product-types-container .wood.pr-type-section .grid .pr-row-container .pr-row:nth-child(n+2):nth-child(odd) {
    margin-bottom: 535px;
}
.pbc-revamp-pdf-container .product-types-container .wood.pr-type-section:first-child .grid .pr-row-container .pr-row:nth-child(n+2):last-child {
    margin-bottom: 525px;
}
.pbc-revamp-pdf-container .product-types-container .wood.pr-type-section:not(:first-child) .grid .pr-row-container .pr-row:nth-child(1) {
    margin-bottom: 450px;
}

.pbc-revamp-pdf-container .pr-type-section:last-child .grid .pr-row-container .pr-row:last-child {
    margin-bottom: 0 !important;
}

/* ===== FIX PDF SIZES AS ON THE SOURCE : START ===== */
/* the source page's own overrides for its PDF (the source renders the PDF inside the page, so its
   page styles apply too): banner 253px tall (a block, no gap below), a smaller disclaimer strip,
   smaller asterisks */
.pbc-revamp-pdf-container .landing-bg-image .disclaimer-section {
    font-weight: 500 !important;
    font-size: 9px !important;
    line-height: 12px !important;
    grid-auto-flow: row !important;
    row-gap: 5px !important;
    justify-content: left !important;
}
.pbc-revamp-pdf-container .landing-bg-image .disclaimer-section .astr {
    font-size: 9px !important;
}
.pbc-revamp-pdf-container .landing-bg-image img {
    display: block;
    height: 253px !important;
}
.pbc-revamp-pdf-container .grid .astr {
    font-size: 10px !important;
    line-height: 16.8px !important;
    font-weight: 600 !important;
}
/* ===== FIX PDF SIZES AS ON THE SOURCE : END ===== */
`;

// user / API values go into the template (and a same-origin frame): escape them
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let libs;
const loadLibs = () => {
  libs = libs || Promise.all([
    loadScript(`${window.hlx?.codeBasePath || ''}/scripts/vendor/html2canvas.min.js`),
    loadScript(`${window.hlx?.codeBasePath || ''}/scripts/vendor/jspdf.umd.min.js`),
  ]);
  return libs;
};

const STEPS = ['stepOne', 'stepTwo', 'stepThree', 'stepFour'];
const litre = (u) => (u || '').replace('Litres', 'Litre');

/** "3 Litres" -> ["3.0", "Litres"] (the source's bubble), "Litre" when 1 or less */
const qtyParts = (q) => {
  const raw = String(q || '').trim();
  const n = parseFloat(raw);
  let unit = raw.split(' ').pop();
  if (raw.includes('Litres') && n <= 1) unit = unit.replace('Litres', 'Litre');
  return [Number.isFinite(n) ? n.toFixed(1) : '', unit];
};

function undercoats(item, icon, note) {
  let last = -1;
  STEPS.forEach((k, i) => { if ((item[k] || '').trim()) last = i; });
  let out = '';
  for (let i = 0; i < last; i += 1) {
    const s = (item[STEPS[i]] || '').trim();
    if (s) {
      const [name, img, , , , , qty, cost] = s.split('|').map((x) => x.trim());
      const n = parseFloat(qty);
      let unit = (qty || '').split(' ')[1] || '';
      if ((qty || '').includes('Litres') && n <= 1) unit = unit.replace('Litres', 'Litre');
      const q = Number.isFinite(n) ? n.toFixed(1) : '';
      out += `<div class="item">
          <div class="img-box">
              <img src="${esc(img)}" alt="item" />
              <div class="chevron-icon-section">
                  <img src="${esc(icon)}" />
                  <span class="qty" style="${q.length >= 6 ? 'font-size:11px;' : ''}">${esc(q)} <span class="ltr">${esc(unit)}</span></span>
              </div>
          </div>
          <div class="title">${esc(name.replace(/^\d+\s*/, ''))}</div>
          <div class="bottom">
              <div class="price">
                  <span class="currency">₹</span>
                  <span class="cost">${esc(cost)}</span>
                  <span class="unit"> / ${esc(litre(unit))}</span>
              </div>
              <div class="note">${esc(note)}</div>
          </div>
      </div>`;
    }
  }
  return out;
}

const TONES = {
  walls: {
    cls: 'side-walls', tile: 'bg-purple-200', ink: '#EEEAF3', main: 'bg-purple-80', under: 'bg-purple-50',
  },
  ceilings: {
    cls: 'ceiling', tile: 'bg-purple-200', ink: '#EEEAF3', main: 'bg-purple-80', under: 'bg-purple-50',
  },
  woods: {
    cls: 'wood', tile: 'bg-beige', ink: '#FEF9F2', main: 'bg-beige-400', under: 'bg-beige-200',
  },
  metals: {
    cls: 'metal', tile: 'bg-indigo-200', ink: '#ECEFF4', main: 'bg-solitude', under: 'bg-indigo-50',
  },
};

/** the source's PDF HTML (pbcPDFDownload), unchanged apart from escaping */
export function pdfHtml(sections, o) {
  const iconFor = (key) => ({ woods: o.icons.wood, metals: o.icons.metal })[key] || o.icons.walls;
  const star = (t) => {
    const [s] = /^(\*\s?\*|\*)/.exec(t) || [''];
    return `<div><span class="astr">${esc(s.replace(/\s/g, ''))} </span>${esc(t.slice(s.length))}</div>`;
  };
  let html = `<!DOCTYPE html>
  <html lang="en" data-jump-fix>
  <head>
    <title class="remove-pdf-title"> Paint Tool PDF</title>
    <style class="remove-pdf-style">${PDF_CSS}</style>
  </head>
  <body><div class="pbc-revamp-pdf-container" id="pbc-revamp-pdf-section">
    <div class="landing-bg-image">
        <img src="${esc(o.banner)}" width="595" height="auto" />
        <div class="disclaimer-section">${star(o.quantityNote)}${star(o.totalNote)}</div>
    </div>
    <div class="product-types-container">`;
  sections.forEach((s) => {
    const t = TONES[s.key];
    const icon = iconFor(s.key);
    html += `<div class="${t.cls} pr-type-section">
        <div class="title-tile ${t.tile}">
            <div class="title" style="color: ${t.ink};">
                ${esc(s.title)}
                <span class="sq-divider-wrapper">
                    <span class="divider" style="background-color: ${t.ink};"></span>
                    <span class="area">${esc(`${s.area} ${o.areaUnit}`)}</span>
                </span>
            </div>
            ${s.note ? `<div class="note">${esc(s.note)}</div>` : ''}
        </div>
        <div class="grid">
            <div class="tr-row">
                <div class="top-coat-col">${esc(o.topCoatTitle)} <span class="astr">*</span></div>
                <div class="undercoats-col">${esc(o.undercoatTitle)} <span class="astr">*</span></div>
                <div class="total-price-col">${esc(o.totalTitle)} <span class="astr">**</span></div>
            </div>
            <div class="pr-row-container">`;
    s.items.forEach((item) => {
      const [cost, unitRaw] = String(item.mrpPerLitre || '').split(' ');
      const [q, unit] = qtyParts(item.quantityRequired);
      const under = s.key === 'woods'
        ? `<div class="text-wrapper"><div class="title-text">${esc(o.wood[0])}</div> <div class="desc-text">${esc(o.wood[1])}</div> <div class="bottom-text">${esc(o.wood[2])}</div></div>`
        : undercoats(item, icon, o.undercoatTaxNote);
      html += `<div class="pr-row">
            <div class="pr-card main-coat ${t.main}">
                <div class="item">
                    <div class="img-box">
                        <img src="${esc(item.swatchImage)}" alt="item" />
                        <div class="chevron-icon-section">
                            <img src="${esc(icon)}" alt=""/>
                            <span class="qty">${esc(q)} <span class="ltr">${esc(unit)}</span></span>
                        </div>
                    </div>
                    <div class="title">${esc(item.entityName)}</div>
                    <div class="price">
                        <span class="currency">₹</span>
                        <span class="cost">${esc(cost)}</span>
                        <span class="unit"> / ${esc(litre(unitRaw))}</span>
                    </div>
                    <div class="note">${esc(o.taxNote)}</div>
                </div>
            </div>
            <div class="pr-card ${t.under} undercoat">${under}</div>
            <div class="pr-card bg-grey total-price">
                <div class="title">
                    <span class="currency">₹ </span>
                    <div class="amount">${esc(item.mrp)}</div>
                    <span class="astr">*</span>
                </div>
                <div class="note">${esc(o.taxNote)}</div>
            </div>
        </div>`;
    });
    html += '</div></div></div>';
  });
  html += '</div></div></body></html>';
  return html;
}

/** the page's own @font-face rules (Manrope), so the frame draws the same text */
function fontFaces() {
  const out = [];
  [...document.styleSheets].forEach((sheet) => {
    let rules;
    try { rules = sheet.cssRules; } catch (e) { return; }
    [...rules].forEach((rule) => {
      if (rule instanceof CSSFontFaceRule) {
        const base = sheet.href || document.baseURI;
        out.push(rule.cssText.replace(/url\((['"]?)(?!data:|https?:|\/\/)([^'")]+)\1\)/g, (m, q, u) => `url("${new URL(u, base).href}")`));
      }
    });
  });
  return out.join('\n');
}

/** render the PDF page in a hidden 595px frame (the source's html2canvas width) */
function renderFrame(markup) {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:595px;height:842px;border:0;visibility:hidden';
    frame.addEventListener('load', () => resolve(frame), { once: true });
    frame.srcdoc = markup.replace('</head>', `<style>${fontFaces()}</style></head>`);
    document.body.append(frame);
  });
}

/**
 * Pages that require Trusted Types (this repo's head.html does) block
 * html2canvas' document.write of its empty clone document. While a render
 * runs, that clone gets a policy that lets exactly that document through.
 */
function allowCloneDocument(doc) {
  const { body } = doc;
  const append = body.appendChild;
  body.appendChild = function appendChild(node) {
    const added = append.call(this, node);
    if (node.tagName === 'IFRAME' && node.classList.contains('html2canvas-container')) {
      try {
        node.contentWindow?.trustedTypes?.createPolicy('default', {
          createHTML: (h) => (/^(<!DOCTYPE [a-z]+>)?<html><\/html>$/i.test(h) ? h : ''),
        });
      } catch (e) { /* no Trusted Types here */ }
    }
    return added;
  };
}

const settle = (doc) => Promise.all([
  doc.fonts ? doc.fonts.ready : Promise.resolve(),
  ...[...doc.images].map((img) => (img.complete ? null : new Promise((r) => {
    img.addEventListener('load', r, { once: true });
    img.addEventListener('error', r, { once: true });
  }))),
]);

/**
 * An image as a PNG data URL ('' when unreachable). jsPDF does not fetch image URLs and cannot read
 * the AVIF/WebP the site delivers, so the image is decoded by the browser and redrawn on a canvas.
 */
async function toDataUrl(url) {
  if (!url) return '';
  try {
    const src = new URL(url, window.location.href);
    if (src.searchParams.has('width')) src.searchParams.set('width', '1600');
    const resp = await fetch(src.href, { credentials: 'same-origin' });
    if (!resp.ok) return '';
    const bitmap = await createImageBitmap(await resp.blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    return canvas.toDataURL('image/png');
  } catch (e) {
    return '';
  }
}

/** a PDF image that may be unreachable (cross-origin off production) must not stop the PDF */
const addImage = (pdf, data, ...args) => {
  if (!data) return;
  try { pdf.addImage(data, ...args); } catch (e) { /* skipped */ }
};

/**
 * Build and save the source's estimate PDF: the page image sliced over A4
 * pages; the footer logo and "Page n of m" on every page; from page 2 the
 * header and call-us images.
 */
export async function downloadBudgetPdf(sections, opts) {
  await loadLibs();
  const frame = await renderFrame(pdfHtml(sections, opts));
  try {
    const doc = frame.contentDocument;
    await settle(doc);
    allowCloneDocument(doc);
    const canvas = await window.html2canvas(doc.querySelector('#pbc-revamp-pdf-section'), {
      useCORS: true, allowTaint: true, width: 595, windowWidth: 595, scale: 1.5,
    });
    let image;
    try {
      image = canvas.toDataURL('image/jpeg');
    } catch (e) {
      // a tainted canvas (cross-origin images off production): render without them
      const clean = await window.html2canvas(doc.querySelector('#pbc-revamp-pdf-section'), {
        useCORS: true, allowTaint: false, width: 595, windowWidth: 595, scale: 1.5,
      });
      image = clean.toDataURL('image/jpeg');
    }
    const [logo, header, callUs] = await Promise.all(
      [opts.logo, opts.header, opts.callUs].map(toDataUrl),
    );
    const { jsPDF: JsPdf } = window.jspdf;
    const w = 595;
    const pageH = 842;
    const imgH = (canvas.height * w) / canvas.width;
    let left = imgH;
    let pos = 0;
    let page = 1;
    const pages = Math.ceil(imgH / pageH);
    const pdf = new JsPdf('p', 1, 'a4');
    const furniture = (n) => {
      addImage(pdf, logo, 'PNG', 20, 802, 168, 32);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(140, 142, 144);
      pdf.text(`Page: ${n} of ${pages}`, 523, 822);
    };
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, w, pageH, 'F');
    pdf.addImage(image, 'JPEG', 0, pos, w, imgH);
    furniture(page);
    left -= pageH;
    while (left >= 0) {
      pos = left - imgH;
      pdf.addPage();
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, w, pageH, 'F');
      pdf.addImage(image, 'JPEG', 0, pos, w, imgH);
      addImage(pdf, header, 'PNG', 0, 0, w, 110);
      addImage(pdf, callUs, 'PNG', 20, 672, 207, 86);
      furniture(page + 1);
      left -= pageH;
      page += 1;
    }
    const name = opts.fileName || 'Paint-budget-estimate';
    pdf.save(/\.pdf$/i.test(name) ? name : `${name}.pdf`);
  } finally {
    frame.remove();
  }
}
