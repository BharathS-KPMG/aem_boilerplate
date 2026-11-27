// The mobile image shows below 992px, the desktop image from 992px.
// Mirrored in preloadHeroLcp() in scripts/pre-load-image.js.
const MOBILE_MEDIA = '(max-width: 991px)';

/**
 * Moves the sources of the authored mobile picture into the desktop picture,
 * scoped to MOBILE_MEDIA, so the browser fetches only the image the viewport
 * shows. The mobile image's width/height go on its sources so the box has the
 * right aspect ratio before the image loads.
 * @param {Element} desktop The desktop picture
 * @param {Element} mobile The mobile picture
 */
function mergePictures(desktop, mobile) {
  const img = mobile.querySelector('img');
  const sources = [...mobile.querySelectorAll('source')];
  sources.forEach((source) => {
    source.media = source.media ? `${source.media} and ${MOBILE_MEDIA}` : MOBILE_MEDIA;
    ['width', 'height'].forEach((attr) => {
      if (img?.hasAttribute(attr)) source.setAttribute(attr, img.getAttribute(attr));
    });
  });
  desktop.prepend(...sources);
  (mobile.closest('p') || mobile).remove();
}

export default function decorate(block) {
  const pictures = block.querySelectorAll(':scope > div:first-child picture');
  if (!pictures.length) {
    block.classList.add('no-image');
  } else if (pictures.length > 1) {
    mergePictures(pictures[0], pictures[1]);
  }
}
