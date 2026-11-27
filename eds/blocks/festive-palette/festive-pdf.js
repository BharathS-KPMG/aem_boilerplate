import { loadScript } from '../../scripts/aem.js';

/*
 * festive-palette PDF ("Here's the festive palette for your walls"): the
 * template below is laid out at A4 width (595 CSS px = 595 pt) in a hidden
 * frame, captured with html2canvas and saved with jsPDF on one A4 page (also
 * on iOS), like the texture finder's PDF. Loaded only when "Download PDF" is
 * pressed.
 * Texts and images come from the DA table (opts), the name / picks /
 * combinations from the user's run (data). Links stay clickable in the PDF.
 */

const PAGE_W = 595;
const PAGE_H = 842;
// 2x for sharp text; the canvas stays small enough for iOS (1190 x 1684 per A4)
const SCALE = 2;

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${PAGE_W}px; background: #fcfaf7; }
  html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
  body {
    font-family: Manrope, festive-palette-manrope, Arial, sans-serif;
    color: #2f2f2f;
    -webkit-font-smoothing: antialiased;
  }
  .fp-pdf {
    position: relative;
    display: flex;
    flex-direction: column;
    width: ${PAGE_W}px;
    min-height: ${PAGE_H}px;
    padding: 34px 30px 0;
    overflow: hidden;
    background: #fcfaf7;
  }
  /* the page clips the mandalas: the right one shows its left half at the
     right edge, the bottom one a quarter in the bottom-left corner (Figma) */
  .fp-pdf-deco { position: absolute; display: block; height: auto; }
  .fp-pdf-deco-top { top: 0; right: 14px; width: 69px; }
  .fp-pdf-deco-right { top: 152px; right: -86px; width: 158px; }
  .fp-pdf-deco-bottom { bottom: -78px; left: -58px; width: 160px; }
  .fp-pdf-greeting { font-size: 15px; line-height: 20px; }
  .fp-pdf-name { margin-top: 4px; font-size: 18px; font-weight: 600; line-height: 24px; }
  .fp-pdf-rule { width: 478px; height: 1px; margin: 10px 0 18px; background: #dcdcdc; }
  .fp-pdf-title {
    max-width: 370px;
    margin-bottom: 20px;
    font-size: 29px;
    font-weight: 600;
    line-height: 33px;
    color: #f47838;
  }
  .fp-pdf-pick { margin-bottom: 9px; font-size: 13px; line-height: 19px; color: #4a4a4a; }
  .fp-pdf-pick strong { font-weight: 700; color: #1d1d1f; }
  .fp-pdf-palette { margin: 16px 0 18px; font-size: 19px; font-weight: 600; line-height: 24px; }
  .fp-pdf-row { display: flex; gap: 13px; margin-bottom: 22px; }
  .fp-pdf-combo { width: 261px; }
  .fp-pdf-combo-title { margin-bottom: 8px; font-size: 12px; font-weight: 600; line-height: 16px; }
  .fp-pdf-card { overflow: hidden; border-radius: 6px; background: #fff; }
  .fp-pdf-shade {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    height: 118px;
    padding: 10px;
    font-size: 11px;
    line-height: 16px;
    color: #1d1d1f;
    text-transform: capitalize;
  }
  .fp-pdf-shade.is-dark { color: #fff; }
  .fp-pdf-goes { padding: 14px 10px 18px; }
  .fp-pdf-goes-title { margin-bottom: 12px; font-size: 11px; font-weight: 600; line-height: 14px; }
  .fp-pdf-goes-items { display: flex; gap: 20px; }
  .fp-pdf-goes-item { width: 106px; }
  .fp-pdf-goes-label { margin-bottom: 5px; font-size: 10px; line-height: 13px; color: #8a8a8a; }
  .fp-pdf-goes-media {
    width: 106px;
    height: 62px;
    border-radius: 3px;
    background-color: #d9d9d9;
    background-position: center;
    background-size: cover;
  }
  .fp-pdf-goes-caption {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 6px;
    margin-top: 6px;
    font-size: 9px;
    line-height: 11px;
  }
  .fp-pdf-goes-name { max-height: 22px; overflow: hidden; overflow-wrap: anywhere; }
  .fp-pdf-arrow { flex: none; width: 10px; height: 10px; }
  .fp-pdf-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin: auto 0 0 82px;
    padding: 16px 0 14px;
    border-top: 1px solid #dcdcdc;
  }
  .fp-pdf-footer-logo { display: block; width: auto; height: 32px; }
  .fp-pdf-footer.is-image .fp-pdf-footer-logo { height: 40px; }
  .fp-pdf-footer-text { font-size: 10px; line-height: 13px; color: #8a8a8a; }
  .fp-pdf-footer-text p { margin: 0; }
  .fp-pdf-phone { font-size: 18px; font-weight: 700; line-height: 24px; color: #f47838; }
`;

// user and API values go into the template (a same-origin frame): escape them
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const ARROW = '<svg class="fp-pdf-arrow" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 9l6-6M4 3h5v5" fill="none" stroke="#2f2f2f" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let libs;
const loadLibs = () => {
  libs = libs || Promise.all([
    loadScript(`${window.hlx?.codeBasePath || ''}/scripts/vendor/html2canvas.min.js`),
    loadScript(`${window.hlx?.codeBasePath || ''}/scripts/vendor/jspdf.umd.min.js`),
  ]);
  return libs;
};

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

const img = (src, className) => (src ? `<img class="${className}" src="${esc(src)}" alt="" crossorigin="anonymous">` : '');

/** a texture / wallpaper tile */
function tileHtml(item, label) {
  if (!item || !(item.name || item.image || item.url)) return '';
  const media = item.image ? ` style="background-image: url(&quot;${esc(item.image)}&quot;)"` : '';
  return `
    <div class="fp-pdf-goes-item"${item.url ? ` data-href="${esc(item.url)}"` : ''}>
      <p class="fp-pdf-goes-label">${esc(label)}</p>
      <div class="fp-pdf-goes-media"${media}></div>
      <div class="fp-pdf-goes-caption"><span class="fp-pdf-goes-name">${esc(item.name)}</span>${ARROW}</div>
    </div>`;
}

/** one combination card */
function comboHtml(rec, i, opts) {
  const shades = rec.shades.map((shade) => {
    const dark = shade.dark ? ' is-dark' : '';
    const link = shade.url ? ` data-href="${esc(shade.url)}"` : '';
    return `
      <div class="fp-pdf-shade${dark}" style="background: ${esc(shade.hex || '#ddd')}"${link}>
        <span>${esc(shade.name)}</span><span>${esc(shade.code)}</span>
      </div>`;
  }).join('');
  const tiles = tileHtml(rec.texture, opts.textureLabel)
    + tileHtml(rec.wallpaper, opts.wallpaperLabel);
  const goes = tiles ? `
      <div class="fp-pdf-goes">
        <p class="fp-pdf-goes-title">${esc(opts.goesWellLabel)}</p>
        <div class="fp-pdf-goes-items">${tiles}</div>
      </div>` : '';
  return `
    <div class="fp-pdf-combo">
      <p class="fp-pdf-combo-title">${esc(String(opts.combinationLabel || '').replace('{n}', i + 1))}</p>
      <div class="fp-pdf-card">${shades}${goes}</div>
    </div>`;
}

/**
 * The footer: the authored logo image alone (its picture carries the text
 * and the number; the phone only makes it a tap-to-call link). Without a
 * logo, the footer text and the phone as text.
 */
function footerHtml(opts, phoneHref) {
  const link = phoneHref ? ` data-href="${esc(phoneHref)}"` : '';
  if (opts.footerLogo) {
    return `
    <div class="fp-pdf-footer is-image">
      <img class="fp-pdf-footer-logo" src="${esc(opts.footerLogo)}" alt="" crossorigin="anonymous"${link}>
    </div>`;
  }
  const probe = document.createElement('div');
  probe.innerHTML = opts.footerText || '';
  if (!probe.textContent.trim() && !opts.phone) return '';
  return `
    <div class="fp-pdf-footer">
      <div>
        <div class="fp-pdf-footer-text">${opts.footerText || ''}</div>
        ${opts.phone ? `<p class="fp-pdf-phone"${link}>${esc(opts.phone)}</p>` : ''}
      </div>
    </div>`;
}

/**
 * The PDF page. Authored rich text (footer text) is DA content and goes in as
 * HTML; everything else is escaped.
 * @param {{name: string, personality: string, mood: string, recommendations: Array}} data
 * @param {Object} opts authored labels and images
 */
export function pdfHtml(data, opts) {
  const rows = [];
  for (let i = 0; i < data.recommendations.length; i += 2) {
    rows.push(`<div class="fp-pdf-row">${data.recommendations.slice(i, i + 2)
      .map((rec, j) => comboHtml(rec, i + j, opts)).join('')}</div>`);
  }
  const pick = (label, value) => (label || value
    ? `<p class="fp-pdf-pick">${esc(label)}${label && value ? ' : ' : ''}<strong>${esc(value)}</strong></p>` : '');
  const phoneHref = opts.phone ? `tel:${String(opts.phone).replace(/[^\d+]/g, '')}` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=${PAGE_W}, initial-scale=1"><title>${esc(opts.title)}</title><style>${CSS}</style></head>
<body>
  <div class="fp-pdf">
    ${img(opts.decoTop, 'fp-pdf-deco fp-pdf-deco-top')}
    ${img(opts.decoRight, 'fp-pdf-deco fp-pdf-deco-right')}
    ${img(opts.decoBottom, 'fp-pdf-deco fp-pdf-deco-bottom')}
    <p class="fp-pdf-greeting">${esc(opts.greeting)}</p>
    <p class="fp-pdf-name">${esc(data.name)}${data.name ? ',' : ''}</p>
    <div class="fp-pdf-rule"></div>
    <h1 class="fp-pdf-title">${esc(opts.title)}</h1>
    ${pick(opts.personalityLabel, data.personality)}
    ${pick(opts.moodLabel, data.mood)}
    <h2 class="fp-pdf-palette">${esc(opts.paletteTitle)}</h2>
    <div class="fp-pdf-combos">${rows.join('')}</div>
    ${footerHtml(opts, phoneHref)}
  </div>
</body>
</html>`;
}

/** the PDF page in a hidden frame at A4 width */
function renderFrame(markup) {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_W}px;height:${PAGE_H}px;border:0;visibility:hidden`;
    frame.addEventListener('load', () => resolve(frame), { once: true });
    frame.srcdoc = markup.replace('</head>', `<style>${fontFaces()}</style></head>`);
    document.body.append(frame);
  });
}

/**
 * Pages that require Trusted Types block html2canvas'
 * document.write('<!DOCTYPE html><html></html>') in the clone frame it adds;
 * while a render runs, that clone gets a policy for exactly that empty page
 * (as the texture finder's PDF does).
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
  ...[...doc.images].map((image) => (image.complete ? null : new Promise((r) => {
    image.addEventListener('load', r, { once: true });
    image.addEventListener('error', r, { once: true });
  }))),
  // the swatches are CSS backgrounds: wait for those pictures too
  ...[...doc.querySelectorAll('.fp-pdf-goes-media[style]')].map((el) => new Promise((r) => {
    const src = (el.style.backgroundImage.match(/url\("?(.*?)"?\)/) || [])[1];
    if (!src) { r(); return; }
    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.onload = r;
    probe.onerror = r;
    probe.src = src;
  })),
]);

/** texture / wallpaper names: two lines at most, then "…" (as the design) */
function fitNames(doc) {
  doc.querySelectorAll('.fp-pdf-goes-name').forEach((el) => {
    const full = el.textContent;
    if (el.scrollHeight <= el.clientHeight + 1) return;
    let len = full.length;
    while (len > 1 && el.scrollHeight > el.clientHeight + 1) {
      len -= 1;
      el.textContent = `${full.slice(0, len).trimEnd()}…`;
    }
  });
}

/**
 * The PDF is one A4 page: the page is at least A4 high (the footer sits at
 * its foot) and grows when the content is taller; that taller page is then
 * scaled down to fit (see downloadFestivePdf). The decorations hang off the
 * page (clipped) and don't count.
 */
function pageHeight(doc) {
  const root = doc.querySelector('.fp-pdf');
  const decos = [...doc.querySelectorAll('.fp-pdf-deco')];
  decos.forEach((d) => { d.style.display = 'none'; });
  root.style.minHeight = `${PAGE_H}px`;
  const height = Math.max(PAGE_H, Math.ceil(root.scrollHeight));
  decos.forEach((d) => { d.style.display = ''; });
  root.style.height = `${height}px`;
  return height;
}

/**
 * The footer logo as its own lossless layer: the original picture (PNG, at
 * its own pixels) goes into the PDF over the page image, instead of being
 * resampled into the JPEG capture, which blurs its small text. Left in the
 * capture when its pixels can't be read (no CORS).
 */
function logoLayer(doc) {
  const logo = doc.querySelector('.fp-pdf-footer-logo');
  if (!logo?.naturalWidth) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = logo.naturalWidth;
    canvas.height = logo.naturalHeight;
    canvas.getContext('2d').drawImage(logo, 0, 0);
    const data = canvas.toDataURL('image/png');
    const origin = doc.querySelector('.fp-pdf').getBoundingClientRect();
    const r = logo.getBoundingClientRect();
    logo.style.visibility = 'hidden';
    return {
      data, x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height,
    };
  } catch (e) {
    return null;
  }
}

/** the links of the page, in PDF points */
function links(doc) {
  const origin = doc.querySelector('.fp-pdf').getBoundingClientRect();
  return [...doc.querySelectorAll('[data-href]')].map((el) => {
    const r = el.getBoundingClientRect();
    return {
      url: new URL(el.dataset.href, window.location.href).href,
      x: r.left - origin.left,
      y: r.top - origin.top,
      w: r.width,
      h: r.height,
    };
  });
}

/**
 * Build and download the PDF.
 * @param {{name: string, personality: string, mood: string, recommendations: Array}} data
 * @param {Object} opts authored labels, rich text and images
 */
export async function downloadFestivePdf(data, opts) {
  await loadLibs();
  const frame = await renderFrame(pdfHtml(data, opts));
  try {
    const doc = frame.contentDocument;
    await settle(doc);
    fitNames(doc);
    const contentHeight = pageHeight(doc);
    frame.style.height = `${contentHeight}px`;
    const logo = logoLayer(doc);
    allowCloneDocument(doc);
    const canvas = await window.html2canvas(doc.querySelector('.fp-pdf'), {
      scale: SCALE,
      useCORS: true,
      backgroundColor: '#fcfaf7',
      logging: false,
      windowWidth: PAGE_W,
    });
    const image = canvas.toDataURL('image/jpeg', 0.92);
    const { jsPDF: JsPdf } = window.jspdf;
    const pdf = new JsPdf({ orientation: 'p', unit: 'pt', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    // the whole page image on the one A4 page: 1:1 when it is A4 high, else
    // scaled down to the page height and centred, on the page colour
    const scale = Math.min(pageW / PAGE_W, pageH / contentHeight);
    const offsetX = (pageW - PAGE_W * scale) / 2;
    const place = (x, y, w, h) => [offsetX + x * scale, y * scale, w * scale, h * scale];
    pdf.setFillColor(252, 250, 247);
    pdf.rect(0, 0, pageW, pageH, 'F');
    pdf.addImage(image, 'JPEG', ...place(0, 0, PAGE_W, contentHeight));
    if (logo) pdf.addImage(logo.data, 'PNG', ...place(logo.x, logo.y, logo.w, logo.h));
    links(doc).forEach((m) => pdf.link(...place(m.x, m.y, m.w, m.h), { url: m.url }));
    const name = opts.fileName || 'Festive_Palette';
    // jsPDF's save handles the browsers' download quirks (iOS Safari / Chrome,
    // Android Chrome); ".pdf" is added so the file opens everywhere
    pdf.save(/\.pdf$/i.test(name) ? name : `${name}.pdf`);
  } finally {
    frame.remove();
  }
}
