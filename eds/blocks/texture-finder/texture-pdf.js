import { loadScript } from '../../scripts/aem.js';

/**
 * texture-finder PDF: the source's textureToolPDFDownload — its template and
 * CSS (unchanged) rendered off-screen, captured with html2canvas, sliced over
 * A4 pages with jsPDF and saved. Loaded only when "Download PDF" is pressed.
 */

// the source's PDF template CSS (interiortexturetool clientlib), unchanged
const PDF_CSS = `
      /* the source renders this inside its page, which supplies these base styles
         (they set the text heights, and so where the footer lands) */
      *,
      *::before,
      *::after {
          box-sizing: border-box;
      }

      body {
          font-size: 14px;
          line-height: 22px;
          color: #222;
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
          .texture-tool-main-pdf {
            height: auto;
            max-width: 740px;
            margin: 0px auto;
            transform: scale(1.5);
            padding: 50px 50px 0;
            background: #EFEFEF;
          }

          .texture-tool-main-pdf p {
            margin: 0;
            padding: 0;
          }

          @media (min-width: 320px) and (max-width: 991px) {
          .texture-tool-main-pdf {
            width: 740px;
            transform: scale(1);
          }
        }
                    .texture-tool-main-pdf .texture-tool-pdf-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
          }

                    .texture-tool-main-pdf .texture-tool-pdf-header .customer-name {
            color: #000;
            font-size: 20px;
            font-style: normal;
            font-weight: 800;
            line-height: 27.32px;
          }

        .texture-tool-main-pdf .texture-tool-pdf-header-logo {
            width: 153px;
            height: 28px;
        }

          .texture-tool-main-pdf .texture-tool-pdf-description {
                display: flex;
                justify-content: space-between;
                margin-bottom: 30px;
          }

          .texture-tool-main-pdf .texture-tool-pdf-detail {
             width: 48%;
          }

          .texture-tool-main-pdf .contact-details {
            width: 52%;
            text-align: right;
          }

          .texture-tool-main-pdf .texture-tool-pdf-detail p {
            line-height: 15.03px;
          }
          .texture-tool-main-pdf .texture-tool-pdf-detail p,
          .texture-tool-main-pdf p.contact-details-mobileno span,
          .texture-tool-main-pdf p.contact-details-emailid span {
            color: #000;
            font-size: 11px;
            font-style: normal;
            font-weight: 400;
            width: 100%;
            opacity: 0.6;
          }

          .texture-tool-main-pdf p.contact-details-mobileno,
           .texture-tool-main-pdf p.contact-details-emailid {
            color: #000;
            font-size: 11px;
            font-style: normal;
            font-weight: 600;
            line-height: normal;
          }

          .texture-tool-main-pdf p.contact-details-mobileno span,
           .texture-tool-main-pdf p.contact-details-emailid span {
            margin-right: 4px;
          }

        .texture-tool-main-pdf .rec-texture-container-hr {
          width: 100%;
          border-top: 1px solid black;
          opacity: .2;
          margin: 0 0 16px;
        }

        .recommended-texture-section {
              width: 100%;
}

.recommended-texture-section .title {
  margin: 25px 0;
  font-size: 17px;
  font-weight: 800;
  line-height: 22.86px;
  text-align: left;
  color: #5e4f43;
}

.recommended-texture-section .image-section {
  background: #ffffff;
  border-radius: 8px;
  padding: 25px 30px;
  display: flex;
  gap: 18px;
  height: 310px;
}
.recommended-texture-section .image-section .img-left-section {
    width: 45%;
    gap: 12px;
}
.recommended-texture-section .image-section .img-right-section {
    width: 55%;
}

.recommended-texture-section .image-section .img-left-section,
.recommended-texture-section .image-section .img-right-section {
  display: flex;
  flex-direction: column;
}

.recommended-texture-section .image-section .img-left-section .texture-image {
  border-radius: 4px;
  height: 150px;
  background-size: cover;
  background-repeat: no-repeat;
}
.recommended-texture-section .image-section .img-left-section .texture-title {
  font-size: 17px;
  font-weight: 800;
  line-height: 22.86px;
  text-align: left;
  color: #292929;
}

.recommended-texture-section .image-section .img-right-section .right-title {
  margin-top: 5px;
  font-size: 17px;
  font-weight: 500;
  line-height: 22.86px;
  text-align: left;
}

.recommended-texture-section
  .image-section
  .img-right-section
  .shades-collection {
  display: flex;
  flex-direction: column;
}

.recommended-texture-section
  .image-section
  .img-right-section
  .shades-collection
  .shade-type-section {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.recommended-texture-section
  .image-section
  .img-right-section
  .shades-collection
  .shade-type-section:last-child {
  margin-bottom: 18px;
}

.recommended-texture-section
  .image-section
  .img-left-section
  .product-used-section,
.recommended-texture-section
  .image-section
  .img-right-section
  .shades-collection
  .shade-type-section
  .product-section,
.recommended-texture-section
  .image-section
  .img-right-section
  .shades-collection
  .shade-type-section
  .shade-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-grow: 1;
  flex-basis: 0;
}
.recommended-texture-section
  .image-section
  .img-left-section
  .product-used-section
  .product-name,
.recommended-texture-section
  .image-section
  .img-right-section
  .shades-collection
  .shade-type-section
  .shade-title,
.recommended-texture-section
  .image-section
  .img-right-section
  .shades-collection
  .shade-type-section
  .product-section
  .product-title {
  font-size: 13px;
  font-weight: 700;
  line-height: 15.4px;
  text-align: left;
}

.recommended-texture-section
  .image-section
  .img-left-section
  .product-used-section
  .product-used-title,
.recommended-texture-section
  .image-section
  .img-left-section
  .product-used-section
  .product-code,
.recommended-texture-section
  .image-section
  .img-right-section
  .shades-collection
  .shade-type-section
  .product-section
  .product-default-title,
.recommended-texture-section
  .image-section
  .img-right-section
  .shades-collection
  .shade-type-section
  .product-section
  .product-code,
.recommended-texture-section
  .image-section
  .img-right-section
  .shades-collection
  .shade-type-section
  .shade-section
  .shade-default-title,
.recommended-texture-section
  .image-section
  .img-right-section
  .shades-collection
  .shade-type-section
  .shade-section
  .shade-color-section {
  font-size: 11px;
  font-weight: 400;
  line-height: 10px;
  text-align: left;
}

.recommended-texture-section
  .image-section
  .img-right-section
  .shades-collection
  .shade-type-section
  .shade-title {
  color: #f47838;
}
.recommended-texture-section
  .image-section
  .img-left-section
  .product-used-section
  .product-name,
.recommended-texture-section
  .image-section
  .img-left-section
  .product-used-section
  .product-code,
.recommended-texture-section
  .image-section
  .img-right-section
  .shades-collection
  .shade-type-section
  .product-section
  .product-title,
.recommended-texture-section
  .image-section
  .img-right-section
  .shades-collection
  .shade-type-section
  .product-section
  .product-code {
  color: #000000;
}

.recommended-texture-section
  .image-section
  .img-left-section
  .texture-title,
.recommended-texture-section
  .image-section
  .img-left-section
  .product-used-section
  .product-name,
.recommended-texture-section
  .image-section
  .img-right-section
  .shades-collection
  .shade-type-section
  .product-section
  .product-title {
  text-transform: capitalize;
}

.recommended-texture-section
  .image-section
  .img-left-section
  .product-used-section
  .product-used-title,
.recommended-texture-section .image-section .img-right-section .right-title,
.recommended-texture-section
  .image-section
  .img-right-section
  .shades-collection
  .shade-type-section
  .product-section
  .product-default-title,
.recommended-texture-section
  .image-section
  .img-right-section
  .shades-collection
  .shade-type-section
  .shade-section
  .shade-default-title {
  color: #a69075;
}

.recommended-texture-section
  .image-section
  .img-right-section
  .shades-collection
  .shade-type-section
  .shade-section
  .shade-color-section {
  color: #1d1d1f;
}

.recommended-texture-section
  .image-section
  .img-right-section
  .shades-collection
  .shade-type-section
  .shade-section
  .shade-color-section {
  padding: 14px 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  border-radius: 4px;
}

.recommended-texture-section .image-section .vertical-line {
  border-left: 0.5px solid #e0e0e1;
  height: auto;
}


        .texture-tool-main-pdf .services-by-ap-container .service-heading-one-image {
          width: auto;
          height: 22px;
          margin-bottom: 12px;
        }

        .texture-tool-main-pdf .services-by-ap-container .service-heading-two {
          font-size: 14px;
          font-weight: 500;
          line-height: 18.39px;
          text-align: left;
          color: #4D4D4D;
          margin-bottom: 20px;
        }

        .texture-tool-main-pdf .services-by-ap-container .we-offer-section {
          width: 100%;
        }

        .texture-tool-main-pdf .services-by-ap-container .we-offer-section .we-offer-heading {
          font-size: 14px;
          font-weight: 700;
          line-height: 16.4px;
          color: #4D4D4D;
          margin-bottom: 12px;
        }

        .texture-tool-main-pdf .services-by-ap-container .we-offer-section ul {
          margin-left: 20px;
        }

        .texture-tool-main-pdf .services-by-ap-container .we-offer-section ul li {
          font-size: 14px;
          font-weight: 500;
          line-height: 18.39px;
          color: #4D4D4D;
          list-style-type: disc;
        }

        .texture-tool-main-pdf .footer-description {
          background: #EFEFEF;
        }

        .texture-tool-main-pdf .footer-description p {
          color: #00000099;
          text-align: center;
          width: 100%;
          font-size: 12px;
          font-weight: 400;
          line-height: 20px;
          background: #EFEFEF;
        }

        .texture-tool-main-pdf .footer-description span {
          padding: 5px;
          background-color: #00c85329;
          font-size: 12px;
          font-weight: 600;
          line-height: 28px;
          color: black;
          border-radius: 3px;
        }
`;

// user and API values go into the template (and a same-origin frame): escape them
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

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

/** one recommended texture (the source's image-section markup) */
function textureHtml(t, key) {
  const coat = (name) => `
            <div class="shade-type-section">
              <div class="shade-title">${name} coat</div>
              <div style="display: flex; gap: 50px">
                <div class="product-section">
                  <div class="product-default-title">Product</div>
                  <div class="product-title">${esc(t.ProductUsed)}</div>
                  <div class="product-code">${esc(t.ProductCode)}</div>
                </div>
                <div class="shade-section">
                  <div class="shade-default-title">Shade</div>
                  <div class="shade-color-section" style="background: ${esc(t[`${name}CoatShadeHexCode`] || '#FFFFFF')};">
                    <div class="shade-color-name">${esc(t[`${name}CoatShadeName`])}</div>
                    <div class="shade-color-code">${esc(t[`${name}CoatShadeCode`])}</div>
                  </div>
                </div>
              </div>
            </div>`;
  return `
      <div class="image-section" style="margin-bottom: ${key === 'Texture2' ? '220px' : '30px'}">
        <div class="img-left-section">
          <div class="texture-image" style="background-image: url(&quot;${esc(t.listingSwatchImage)}&quot;)"></div>
          <div class="texture-title">
            ${esc(t.FinishName)}
          </div>
          <div class="product-used-section">
            <div class="product-used-title">Product used</div>
            <div class="product-name">${esc(t.ProductUsed)}</div>
            <div class="product-code">${esc(t.ProductCode)}</div>
          </div>
        </div>
        <div class="vertical-line"></div>
        <div class="img-right-section">
          <div class="right-title">Shades used</div>
          <div class="shades-collection">${coat('Top')}${coat('Base')}
          </div>
        </div>
      </div>`;
}

/**
 * The source's PDF HTML. Authored rich text (header, services, footer) is
 * DA content and goes in as HTML; everything else is escaped.
 */
export function pdfHtml(user, opts) {
  const keys = ['Texture1', 'Texture2', 'Texture3'].filter((k) => user.textures[k]);
  const count = Object.keys(user.textures).length;
  const footerGap = ({ 1: '252px', 2: '770px' })[count] || '430px';
  return `<!DOCTYPE html>
      <html lang="en" data-jump-fix>
      <head>
        <title class="remove-pdf-title"> Interior Texture Tool PDF</title>
        <style class="remove-pdf-style">${PDF_CSS}</style>
      </head>
      <body>
          <div class="texture-tool-main-pdf" id="texture-tool-pdf">
             <div class="texture-tool-pdf-header">
                <p class="customer-name">${esc(opts.greeting)} ${esc(user.name)},</p>
                <img src="${esc(opts.logo)}" alt=""
                   class="texture-tool-pdf-header-logo">
             </div>
             <div class="texture-tool-pdf-description">
                <div class="texture-tool-pdf-detail">${opts.headerText}</div>
                <div class="contact-details">
                   <p class="contact-details-mobileno"><span>${esc(opts.mobileLabel)}:</span>${esc(user.mobile)}</p>
                   <p class="contact-details-emailid"><span>${esc(opts.emailLabel)}:</span>${esc(user.email)}</p>
                </div>
             </div>
             <hr class="rec-texture-container-hr">
             <div class="recommended-texture-section">
  <div class="title">${esc(opts.texturesTitle)}</div>
  <div class="image-container">${keys.map((k) => textureHtml(user.textures[k], k)).join('')}</div>
    </div>
    <div class="services-by-ap-container">
      <img class="service-heading-one-image" src="${esc(opts.servicesImage)}" alt=""/>
      ${opts.servicesText}
    </div>
    <div class="footer-description" style="margin-top: ${footerGap}">
      ${opts.footerText}
    </div>
  </div>
</body>
</html>`;
}

/** render the PDF page in a hidden frame the width of the window (the source renders in-page) */
function renderFrame(markup) {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${window.innerWidth}px;height:${window.innerHeight}px;border:0;visibility:hidden`;
    frame.addEventListener('load', () => resolve(frame), { once: true });
    frame.srcdoc = markup.replace('</head>', `<style>${fontFaces()}</style></head>`);
    document.body.append(frame);
  });
}

/**
 * Pages that require Trusted Types (this repo's head.html does) block
 * html2canvas' document.write('<!DOCTYPE html><html></html>') in the clone
 * iframe it adds. While a render runs, that clone gets a policy that lets
 * exactly that empty document through (as bhs-calculator does).
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
 * Build and save the source's PDF: the page image sliced over A4 pages on an
 * #EFEFEF fill, with its faint rule near the foot of the last page.
 * @param {{name: string, mobile: string, email: string, textures: Object}} user
 * @param {Object} opts authored labels, rich text and images
 */
export async function downloadTexturePdf(user, opts) {
  await loadLibs();
  const frame = await renderFrame(pdfHtml(user, opts));
  try {
    const doc = frame.contentDocument;
    await settle(doc);
    allowCloneDocument(doc);
    // the source passes its options to querySelector by mistake, so html2canvas
    // runs with its defaults; kept for an identical render
    const canvas = await window.html2canvas(doc.querySelector('.texture-tool-main-pdf'));
    const image = canvas.toDataURL('image/jpeg');
    const { jsPDF: JsPdf } = window.jspdf;
    const fill = [239, 239, 239];
    const imgWidth = 595;
    const pageHeight = 842;
    const imgHeight = (imgWidth * canvas.height) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;
    const pdf = new JsPdf('p', 1, 'a4');
    pdf.setFillColor(...fill);
    pdf.rect(0, 0, imgWidth, pageHeight, 'F');
    pdf.addImage(image, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.setFillColor(...fill);
      pdf.rect(0, 0, imgWidth, pageHeight, 'F');
      pdf.addImage(image, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    pdf.setFontSize(10);
    pdf.setGState(new pdf.GState({ opacity: 0.2 }));
    pdf.setTextColor(128, 128, 128);
    pdf.text('______________________________________________________________', 125, 790);
    // the source saves without an extension; ".pdf" is added so the file opens
    const name = opts.fileName || 'Interior_Texture_Recommendations';
    pdf.save(/\.pdf$/i.test(name) ? name : `${name}.pdf`);
  } finally {
    frame.remove();
  }
}
