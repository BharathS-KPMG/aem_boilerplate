import { loadScript } from '../../scripts/aem.js';

/**
 * bhs-calculator quote PDF: the "Interior Design Quotation" the source page
 * (asianpaints.com interior-design-solutions-calculator, clientlib-bhs-calculator
 * pdfUpload) renders with html2canvas, pages into an A4 jsPDF and uploads
 * before the lead is saved. Template markup, styles, page maths and footer
 * text are the source's, unchanged.
 *
 * Deviation (no visual change to the PDF): the source appends the template
 * (with its page-wide CSS reset) to the live page while it renders; here it
 * renders in a hidden same-origin iframe of the page's width, with the page's
 * @font-face rules, so the page never reflows.
 */

// the source's template styles, verbatim
const QUOTE_CSS = `
  /* the source appends this template to its page, which supplies these base styles */
  body { font-size: 14px; line-height: 22px; color: #222; }
  p { letter-spacing: 0.5px; }
  html,
body,
div,
span,
applet,
object,
iframe,
h1,
h2,
h3,
h4,
h5,
h6,
p,
blockquote,
pre,
a,
abbr,
acronym,
address,
big,
cite,
code,
del,
dfn,
em,
img,
ins,
kbd,
q,
s,
samp,
small,
strike,
strong,
sub,
sup,
tt,
var,
b,
u,
i,
center,
dl,
dt,
dd,
ol,
ul,
li,
fieldset,
form,
label,
legend,
table,
caption,
tbody,
tfoot,
thead,
tr,
th,
td,
article,
aside,
canvas,
details,
embed,
figure,
figcaption,
footer,
header,
hgroup,
menu,
nav,
output,
ruby,
section,
summary,
time,
mark,
audio,
video {
    // margin: 0;
    // padding: 0;
    // border: 0;
    // font-size: 100%;
    // font: inherit;
    // vertical-align: baseline;

}

/* HTML5 display-role reset for older browsers */
article,
aside,
details,
figcaption,
figure,
footer,
header,
hgroup,
menu,
nav,
section {
    display: block;
}

ol,
ul {
    list-style: none;
}

blockquote,
q {
    quotes: none;
}

blockquote:before,
blockquote:after,
q:before,
q:after {
    content: '';
    content: none;
}

table {
    border-collapse: collapse;
    border-spacing: 0;
}

/* Box sizing rules */
*,
*::before,
*::after {
    -webkit-box-sizing: border-box;
    -moz-box-sizing: border-box;
    box-sizing: border-box;
}

/* Set core body defaults */
body {
    font-family: Manrope;
    min-height: 100vh;
    scroll-behavior: smooth;
    text-rendering: optimizeSpeed;
}

/* Remove list styles on ul, ol elements with a class attribute */
ul[class],
ol[class] {
    list-style: none;
}

/* A elements that don't have a class get default styles */
a:not([class]) {
    text-decoration-skip-ink: auto;
}

/* Make images easier to work with */
img {
    max-width: 100%;
    display: block;
}

/* Natural flow and rhythm in articles by default */
article>*+* {
    margin-top: 1em;
}

/* Inherit fonts for inputs and buttons */
input,
button,
textarea,
select {
    font: inherit;
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
  * {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
    .quotation {
      max-width: 740px;
      margin: 0px auto;
      transform: scale(1.5);
      padding: 0px 50px;
    }

    @media (min-width: 320px) and (max-width: 991px) {
    .quotation {
      width: 740px;
      transform: scale(1);
    }
  }

    .quotation .customer-name {
      color: #000;
      font-family: Manrope;
      font-size: 16px;
      font-style: normal;
      font-weight: 800;
      line-height: normal;
      margin-bottom: 4px;
    }

    .quotation .quotation-description {
      margin-bottom: 24px;
      position: relative;
    }

    .quotation .contact-details {
      width: 59%;
      display: inline-block;
      text-align: right;
      margin-left: 210px;
      position: absolute;
      top: 0;
      right: 0;
    }

    .quotation p.quotation-detail {
      color: #000;
      font-family: Manrope;
      font-size: 11px;
      font-style: normal;
      font-weight: 400;
      line-height: normal;
      width: 50%;
      display: inline-block;
      opacity: 0.6;
      margin-bottom: 0;
    }

    .quotation .quotation-callus{
      color: #000;
      font-family: Manrope;
      font-size: 11px;
      font-style: normal;
      font-weight: 500;
      line-height: 16px;
      width: 40%;
      display:block;
      opacity: 0.6;
      text-decoration: none;
    }

    .quotation p.contact-details-mobileno {
      color: #000;
      font-family: Manrope;
      font-size: 11px;
      font-style: normal;
      font-weight: 600;
      line-height: normal;
      text-align: end;
      margin-bottom: 0px;
    }

    .quotation p.contact-details-mobileno span {
      color: #000;
      font-family: Manrope;
      font-size: 11px;
      font-style: normal;
      font-weight: 400;
      line-height: normal;
      opacity: 0.6;
      margin-right: 4px;
      vertical-align: text-top;
    }

    .quotation p.contact-details-emailid {
      color: #000;
      font-family: Manrope;
      font-size: 11px;
      font-style: normal;
      font-weight: 600;
      line-height: normal;
      margin-bottom: 0;
    }

    .quotation p.contact-details-emailid span {
      color: #000;
      font-family: Manrope;
      font-size: 11px;
      font-style: normal;
      font-weight: 400;
      line-height: normal;
      opacity: 0.6;
      margin-right: 4px;
    }

    .quotation .economy-package {
      position: relative;
    }

    .quotation img.bgimage {
      width: 100%;
      height: 96px;
      object-fit: fill;
    }

    .quotation .package-detail {
      padding: 16px 20px;
      position: absolute;
      top: 0;
    }

    .quotation p.package-title {
      color: #FFF;
      font-family: Manrope;
      font-size: 16px;
      font-style: normal;
      font-weight: bold;
      line-height: 130%;
    }

    .quotation p.package-subtitle {
      color: #FFF;
      font-family: Manrope;
      font-size: 10px;
      font-style: normal;
      font-weight: 400;
      line-height: 16px;
      letter-spacing: -0.11px;
      margin-bottom: 8px;
    }

    .quotation p.package-price {
      color: #FFF;
      font-family: Manrope;
      font-size: 18px;
      font-style: normal;
      font-weight: 700;
      line-height: 117.2%;
    }

    .quotation .inspiration-gallery {
      border: 1px solid rgba(0, 0, 0, 0.10);
      padding-top: 13px;
      padding-left: 20px;
      padding-right: 20px;
      padding-bottom: 25px;
      margin-bottom: 16px;
    }

    .quotation p.gallery-title {
      color: #470A68;
      font-family: Manrope;
      font-size: 12px;
      font-style: normal;
      font-weight: 900;
      line-height: 16px;
      letter-spacing: 0.48px;
      text-transform: uppercase;
      margin-bottom: 20px;
    }

    .quotation .gallery-image {
      display: inline-block;
    }

    .quotation .gallery-image  img{
      max-width: 495px;
      margin-right: 8px;
      margin-bottom :4px;
       display: inline-block;
    }

    .quotation .feature-description {
      border: 1px solid #D6D6D6;
      background: #FFF;
      padding: 40px 35px;
      margin-bottom: 20px;
    }

    .quotation img.image1 {
      width: 223px;
      height: 120px;
    }

    .quotation img.image2 {
      width: 108px;
      height: 120px;
    }

    .quotation img.image3 {
      width: 108px;
      height: 120px;
    }

    .quotation img.image4{
      width: 108px;
      height: 120px;
    }

    .quotation img.image5 {
      width: 223px;
      height: 120px;
    }

    .quotation img.image6 {
      width: 108px;
      height: 120px;
    }

    .quotation .feature-desc {
      margin-bottom: 16px;
      display: flex;
      align-items: baseline;
    }

    .quotation .feature-desc:last-child {
      margin-bottom: 0;
    }

    .quotation p.feature {
      min-width: 20%;
      max-width: 20%;
      display: inline-block;
      vertical-align: top;
      color: #808080;
      font-family: Manrope;
      font-size: 11px;
      font-style: normal;
      font-weight: 400;
      line-height: normal;
      letter-spacing: -0.132px;
      padding-right: 15px;
    }

    .quotation p.description {
      /* width: 70%; */
      display: inline-block;
      color: #202020;
      font-family: Manrope;
      font-size: 12px;
      font-style: normal;
      font-weight: 500;
      line-height: normal;
      letter-spacing: -0.132px;
    }

    .quotation .gallery-details {
      row-gap: 16px;
    }

    .quotation .quotation-header {
      display: flex;
      margin-bottom: 20px;
      justify-content: space-between;
      border-bottom: 1px solid rgba(0, 0, 0, 0.2);
      padding-top: 40px;
      align-items: center;
    }

    .quotation p.header-title {
      font-family: Manrope;
      font-size: 24px;
      font-weight: 800;
      line-height: 32px;
      letter-spacing: 0.48px;
      text-transform: capitalize;
      opacity: 0.9;
      margin-bottom: 14px;
      color: #FEAA06;
      display: block;
      width:100% ;
  }

  .quotation .quotation-header-logo {
      width:152px;
      height: 36px;
  }

    .quotation p.quatation-note {
      color: #202020;
      font-family: Manrope;
      font-size: 11px;
      font-style: normal;
      font-weight: 400;
      line-height: 16px;
      padding-bottom: 15px;
      margin-top: -3px;
    }

    .quotation .inspiration-gallery.bluecolor {
      background: #EDFCFF;
    }
    .quotation .inspiration-gallery.bluecolor + div {
      background: #EDFCFF;
    }

    .quotation .inspiration-gallery.browncolor {
      background: #FFF7ED;
    }
    .quotation .inspiration-gallery.browncolor + div {
      background: #FFF7ED;
    }

    .quotation .inspiration-gallery.greencolor {

      background: #F1FFDF;
    }
    .quotation .inspiration-gallery.greencolor + div {

        background: #F1FFDF;
    }

    .quotation .galleryimage-wrapper{
      border: 1px solid #D6D6D6;
      background: #EDFCFF;
      padding:20px;
      margin-bottom:20px;
      display: none;
    }

    .quotation .ciz-redirection-heading{
      color: #431A80;
      font-size: 12px;
      font-weight: 800;
      line-height: 16px;
      letter-spacing: 0.48px;
      margin-bottom: 50px;
    }

  .quotation .callus-ribbon{
    position: relative;
    padding-bottom:20px;
    background: #F0E7FD;
    border-radius:3px;
  }

  .quotation .callus-ribbon p{
    position: relative;
    top: 9px;
    left: 18%;
    font-size: 12px;
    font-weight: 700;
    margin-top:0px;
    margin-bottom:0;
  }

  .quotation .callus-ribbon p span{
    position: absolute;
    top: -2px;
    transform: scale(0.9);
    background: #431A80;
    border-radius: 3px;
    font-size: 12px;
    font-weight: 800;
    color: white;
    padding-top:9px;
    padding-bottom:9px;
    padding-left:4px;
    padding-right:4px;
    text-decoration:underline;
    line-height:10px;
  }

  `;

// source assets (relative, as on the source: they resolve on the production host)
const ASSETS = {
  logo: '/content/dam/apcolourcatalogue/asset/ap-revamp/homepage/asian-paints-BH-Logo.jpg',
  packageBg: (color) => `/content/dam/Ap-Bhs/ap-beautiful-homes/bhs-calculator/pdf_${color}.png`,
  whyChooseUs: '/content/dam/apcolourcatalogue/asset/ap-revamp/homepage/whyChooseUsBHS.png',
};

const COLORS = { economy: 'greencolor', premium: 'bluecolor', luxury: 'browncolor' };

// user input goes into the template (and a same-origin frame): escape it
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let libs;
const loadLibs = () => {
  libs = libs || Promise.all([
    loadScript(`${window.hlx?.codeBasePath || ''}/scripts/vendor/html2canvas.min.js`),
    loadScript(`${window.hlx?.codeBasePath || ''}/scripts/vendor/jspdf.umd.min.js`),
  ]);
  return libs;
};

/** the page's own @font-face rules (Manrope), so the iframe draws the same text */
function fontFaces() {
  const out = [];
  [...document.styleSheets].forEach((sheet) => {
    let rules;
    try { rules = sheet.cssRules; } catch (e) { return; }
    [...rules].forEach((rule) => {
      if (rule instanceof CSSFontFaceRule) {
        // resolve relative src URLs against the stylesheet
        const base = sheet.href || document.baseURI;
        out.push(rule.cssText.replace(/url\((['"]?)(?!data:|https?:|\/\/)([^'")]+)\1\)/g, (m, q, u) => `url("${new URL(u, base).href}")`));
      }
    });
  });
  return out.join('\n');
}

/**
 * The source's quotation HTML (pdfUpload), unchanged.
 * @param {{name: string, number: string, mail: string, pkgName: string,
 *   price: string, featureCards: string[]}} data
 */
export function quoteHtml({
  name: rawName, number: rawNumber, mail: rawMail, pkgName, price, featureCards,
}) {
  const [name, number, mail] = [rawName, rawNumber, rawMail].map(esc);
  const selectedData = `${pkgName[0].toUpperCase()}${pkgName.slice(1)} Package`;
  const color = COLORS[pkgName] || '';
  let html = `<!DOCTYPE html>
<html lang="en" data-jump-fix>
<head>
  <title class="remove-pdf-title">${name} Budget Calculator</title>
  <style class="remove-pdf-style">${QUOTE_CSS}</style>

</head>

<body>

  <div class="quotation" id="bhsPdf">
    <div class="quotation-header">
      <p class="header-title">Interior Design Quotation</p>
      <img src="${ASSETS.logo}"  class="quotation-header-logo">

    </div>
    <p class="customer-name">Dear ${name},</p>
    <div class="quotation-description">
      <p class="quotation-detail">Here is the quote that you requested. Please review and reach out to us, for any
        questions.</p>
      <div class="contact-details">
        <p class="contact-details-mobileno"><span>Mobile no:</span>${number}</p>
        <p class="contact-details-emailid"><span>Email:</span>${mail}</p>
      </div>
    </div>
    <div class="economy-package">
      <img src="${ASSETS.packageBg(color)}" class="bgimage">
      <div class="package-detail">
        <p class="package-title">${selectedData}</p>
        <p class="package-price">${price}</p>
      </div>
    </div>
    <div class="inspiration-gallery ${color}">
     `;
  if (featureCards.length) html += `<div class="gallery-details">${featureCards[0]}</div>`;
  html += `
      </div>`;
  featureCards.slice(1).forEach((card) => {
    html += `
                <div class="inspiration-gallery ${color}"> <div class="gallery-details">${card}</div></div>`;
  });
  html += `  <p class="quatation-note">
                  *This is only an indicative price based on our clients' average spending. The final price can be higher or lower depending on factors like material, finish, and the number of furniture. We do not undertake any civil work (false ceilings, flooring, plumbing, etc..) and the final cost estimate excludes the same. Get in touch with our customer support team and get all your queries answered!
                </p>
    <div class="callus-ribbon"><p>For end-to-end interior design services call us on <span>1800-266-2090</span></p></div>
    </div>
  </div>
</body>
</html>`;
  return html;
}

/**
 * An image as a data URL (jsPDF 4 does not fetch image URLs itself). The site's own /content/dam
 * path is tried first; hosts that do not serve it (preview, local) fall back to the static host,
 * which allows cross-origin reads. Throws when neither answers.
 */
async function toDataUrl(url) {
  const candidates = url.startsWith('/') ? [url, `https://static.asianpaints.com${url}`] : [url];
  let blob;
  for (let i = 0; i < candidates.length && !blob; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const resp = await fetch(candidates[i], { credentials: i === 0 ? 'same-origin' : 'omit' });
      // eslint-disable-next-line no-await-in-loop
      if (resp.ok && /^image\//.test(resp.headers.get('content-type') || '')) blob = await resp.blob();
    } catch (e) { /* try the next host */ }
  }
  if (!blob) throw new Error(`${url}: unreachable`);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** render the quotation in a hidden iframe the width of the page */
function renderFrame(html) {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${window.innerWidth}px;height:${window.innerHeight}px;border:0;visibility:hidden`;
    frame.addEventListener('load', () => resolve(frame), { once: true });
    frame.srcdoc = html.replace('</head>', `<style>${fontFaces()}</style></head>`);
    document.body.append(frame);
  });
}

/**
 * Pages that require Trusted Types (this repo's head.html does) block
 * html2canvas' document.write('<!DOCTYPE html><html></html>') in the clone
 * iframe it adds to the quote frame. While a render runs, that clone gets a
 * policy that lets exactly that empty document through (as colour-quiz does).
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
 * Build the source's PDF: one image of the quotation sliced over A4 pages,
 * the call-us footer on each page, then the "why choose us" image.
 * @returns {Promise<Blob>} "beautiful-homes-estimate.pdf"
 */
export async function buildQuotePdf(data, { whyChooseUsImg } = {}) {
  await loadLibs();
  const frame = await renderFrame(quoteHtml(data));
  try {
    const doc = frame.contentDocument;
    // the logo and the package banner come from /content/dam:
    // inline them so they render on any host
    await Promise.all([...doc.querySelectorAll('.quotation-header-logo, .bgimage')].map(async (img) => {
      try { img.src = await toDataUrl(img.getAttribute('src')); } catch (e) { /* left as is */ }
    }));
    await settle(doc);
    allowCloneDocument(doc);
    // the source's spacing for page breaks
    const galleries = doc.querySelectorAll('.inspiration-gallery');
    if (galleries.length > 3) galleries[2].style.marginBottom = '290px';
    if (galleries.length > 7) galleries[6].style.marginBottom = '360px';
    // the source passes its options to querySelector by mistake, so html2canvas
    // runs with its defaults; kept for an identical render
    const canvas = await window.html2canvas(doc.querySelector('.quotation'));
    const base64stringpdf = canvas.toDataURL('image/jpeg');
    const { jsPDF: JsPdf } = window.jspdf;
    const imgWidth = 595;
    const pageHeight = 842;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    const pdf = new JsPdf('p', 1, 'a4');
    let position = 0;
    pdf.addImage(base64stringpdf, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    const pdfFooter = () => {
      pdf.setFontSize(10);
      pdf.setTextColor(128, 128, 128);
      pdf.text('For home decor needs call on', 185, 820);
      pdf.setTextColor(47, 47, 47);
      pdf.setFillColor(214, 246, 227);
      pdf.rect(319, 810, 70, 12, 'F');
      pdf.text('1800-209-5678', 320, 820);
      pdf.setTextColor(47, 47, 47);
      pdf.text('____________', 320, 819);
      pdf.setTextColor(128, 128, 128);
      pdf.text('____________________________________________', 165, 800);
    };
    pdfFooter();
    const imageUrl = whyChooseUsImg || ASSETS.whyChooseUs;
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(base64stringpdf, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      pdfFooter();
    }
    try {
      const whyImage = await toDataUrl(imageUrl);
      if (heightLeft <= -400) {
        pdf.addImage(whyImage, 'PNG', 40, pageHeight + heightLeft + 10, 515, 365);
      } else {
        pdf.addPage();
        pdf.addImage(whyImage, 'PNG', 40, 40, 515, 365);
        pdfFooter();
      }
    } catch (e) {
      // the image is unreachable off the production host; the quote still uploads
    }
    return pdf.output('blob', 'beautiful-homes-estimate.pdf');
  } finally {
    frame.remove();
  }
}
