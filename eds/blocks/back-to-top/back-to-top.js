import { getMetadata } from '../../scripts/aem.js';
import { pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';

const SHOW_AFTER = 500;

/**
 * "Back To Top" link, as on the AEM site. Built and loaded from
 * scripts/delayed.js only on pages whose metadata has "Back To Top | true",
 * so neither this file nor its CSS is fetched anywhere else.
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'back-to-top-cta';
  button.textContent = getMetadata('back-to-top-label') || 'Back To Top';
  block.replaceChildren(button);

  // A 1px marker 500px down the page: once it has scrolled out of view above
  // the viewport, the link shows. No work runs on every scroll event.
  const marker = document.createElement('div');
  marker.className = 'back-to-top-marker';
  marker.setAttribute('aria-hidden', 'true');
  marker.style.top = `${SHOW_AFTER}px`;
  document.body.append(marker);

  new IntersectionObserver(([entry]) => {
    const past = !entry.isIntersecting && entry.boundingClientRect.top < 0;
    block.classList.toggle('is-visible', past);
  }).observe(marker);

  button.addEventListener('click', () => {
    pushAdobeCtaClickEvent({
      event: 'jumplink',
      cta: 'Back To Top',
    });
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    // Keyboard and screen reader users continue from the top of the page.
    const target = document.querySelector('header') || document.querySelector('main');
    if (target) {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  });
}
