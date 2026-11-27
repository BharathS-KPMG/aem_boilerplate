/**
 * PDF download for the wbc-calculator block, as on the AEM tool: the hidden
 * .parent-container-budget-cal-pdf page is drawn to a canvas with
 * html2canvas, and the image is cut into A4 pages (595 x 842 pt) with jsPDF.
 * The libraries load on the first download only.
 */
import { loadScript } from '../../scripts/aem.js';

const VENDOR = `${window.hlx.codeBasePath}/scripts/vendor`;
// Desktop width the PDF page is laid out at, on every device. 1440px is
// prod's unzoomed desktop range, so no laptop or mobile CSS applies.
const CAPTURE_WINDOW_WIDTH = 1440;
// iOS Safari refuses canvases above ~16.7M pixels (the PDF would come out
// blank), so iOS draws at 1x: the desktop PDF size, ~1400 x 7700px.
// iPadOS reports itself as a Mac with touch.
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function captureScale() {
  if (isIOS()) return 1;
  // Capped at 2x: a 3x phone would need a ~4200 x 23000px canvas, more
  // than some phones can hold (the drawing then comes out partly blank).
  return Math.min(window.devicePixelRatio || 1, 2);
}
let libraries = null;
let busy = false;

function loadLibraries() {
  if (!libraries) {
    libraries = Promise.all([
      loadScript(`${VENDOR}/html2canvas.min.js`),
      loadScript(`${VENDOR}/jspdf.umd.min.js`),
    ]).catch((err) => {
      libraries = null;
      throw err;
    });
  }
  return libraries;
}

// The PDF page sits off-screen, so its lazy images would never load: they
// are switched to eager first, and the wait is capped so a slow or broken
// image cannot block the download.
const imagesLoaded = (root, timeout = 5000) => {
  const pending = [...root.querySelectorAll('img')].map((img) => {
    img.loading = 'eager';
    return img.complete ? null : new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
  });
  return Promise.race([
    Promise.all(pending),
    new Promise((resolve) => { setTimeout(resolve, timeout); }),
  ]);
};

/**
 * A copy of the PDF page, drawn instead of the original:
 * - it sits directly in <body> at zoom 1, without the PDF page's
 *   counter-zoom (html2canvas-pro misplaces content under CSS zoom);
 * - it is wrapped in .wbc-calculator > .budgetcalculator, so the same CSS
 *   applies;
 * - it is never seen: it sits in a fixed, zero-size box that clips it
 *   (html2canvas draws the copy itself, not that box). Being fixed and
 *   clipped, it also cannot widen a phone's layout viewport, which made the
 *   drawing come out shifted with overlapping words.
 */
function captureCopy(container) {
  const host = document.createElement('div');
  host.className = 'wbc-calculator';
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '0',
    height: '0',
    overflow: 'hidden',
    zIndex: '-1',
    zoom: '1',
    pointerEvents: 'none',
  });
  const wrap = document.createElement('div');
  wrap.className = 'budgetcalculator';
  const page = container.cloneNode(true);
  page.classList.remove('d-none');
  page.style.zoom = '1';
  wrap.append(page);
  host.append(wrap);
  document.body.append(host);
  return { host, page };
}

export default async function downloadPdf({ container, spinners, fileName }) {
  if (busy) return;
  busy = true;
  spinners.forEach((s) => s.classList.remove('d-none'));
  let copy = null;
  try {
    await loadLibraries();
    // AEM waits 200ms before drawing, so the page settles first.
    await new Promise((resolve) => { setTimeout(resolve, 200); });
    copy = captureCopy(container);
    await imagesLoaded(copy.page);
    if (document.fonts) await document.fonts.ready;
    // html2canvas lays the copy out again in a hidden frame, by default as
    // wide as the screen. On phones that frame is ~400px for a 1400px page,
    // so the browser boosts the text (font autosizing) and it overflows and
    // gets clipped. A desktop-width frame gives every device the desktop PDF.
    const canvas = await window.html2canvas(copy.page, {
      useCORS: true,
      scale: captureScale(),
      logging: false,
      windowWidth: CAPTURE_WINDOW_WIDTH,
      windowHeight: Math.max(copy.page.scrollHeight, window.innerHeight),
    });
    const image = canvas.toDataURL('image/jpeg');
    const PdfDocument = window.jspdf.jsPDF;
    const doc = new PdfDocument('p', 'pt', 'a4');
    const imageHeight = (595 * canvas.height) / canvas.width;
    let remaining = imageHeight;
    let offset = 0;
    doc.addImage(image, 'JPEG', 0, offset, 595, imageHeight);
    remaining -= 842;
    while (remaining >= 0) {
      offset = remaining - imageHeight;
      doc.addPage();
      doc.addImage(image, 'JPEG', 0, offset, 595, imageHeight);
      remaining -= 842;
    }
    doc.save(fileName);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('wbc-calculator: PDF generation failed', err);
  } finally {
    copy?.host.remove();
    spinners.forEach((s) => s.classList.add('d-none'));
    busy = false;
  }
}
