/*
 * Warranty Container
 * A "Warranty Documents" accordion of product warranties beside a promo banner with a CTA.
 * One item is open at a time. On desktop the list scrolls inside a fixed-height box.
 *
 * Authoring (Accordion convention, 2 columns: title | content), plus two optional rows
 * identified by their content, not their position:
 *   heading row   one cell with only a heading          -> list title ("Warranty Documents")
 *   banner row    an image and a link                   -> promo banner with CTA button
 *   item rows     | product name, "Label: value" lines, guide link | description |
 *
 * Warranty registration: the banner CTA opens the 3-step registration form
 * (warranty-registration.js, loaded on click) against the Asian Paints services at
 * `warranty-api-base` (default: same origin). Fields are encrypted with the project's AesUtil
 * (scripts/aesUtil.module.js).
 */
import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import { findLcpSection, useUnparsedPictureUrls } from '../../scripts/pre-load-image.js';
import { pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';

const HEADINGS = 'h1, h2, h3, h4, h5, h6';

let instances = 0;

/** Wraps bare text in a cell into a paragraph so it can be styled consistently. */
function cellChildren(cell) {
  if (!cell.children.length && cell.textContent.trim()) {
    const p = document.createElement('p');
    p.textContent = cell.textContent.trim();
    cell.replaceChildren(p);
  }
  return [...cell.children];
}

function buildBanner(row, eager) {
  const aside = document.createElement('div');
  aside.className = 'warranty-container-banner';
  moveInstrumentation(row, aside);

  const img = row.querySelector('picture img');
  if (img) {
    const picture = createOptimizedPicture(img.src, img.alt, eager, [
      { media: '(min-width: 600px)', width: '1000' },
      { width: '750' },
    ]);
    if (eager) {
      picture.querySelector('img').setAttribute('fetchpriority', 'high');
      // same URLs as preloadWarrantyContainerLcp() in pre-load-image.js
      useUnparsedPictureUrls(picture);
    }
    moveInstrumentation(img, picture.querySelector('img'));
    aside.append(picture);
  }

  const link = row.querySelector('a[href]');
  if (link) {
    // opens the registration form in place, so it is a button, not a link; the form itself says
    // when online registration is not set up (no AesUtil / CryptoJS in the project)
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'warranty-container-cta';
    button.textContent = link.textContent;
    moveInstrumentation(link, button);
    aside.append(button);
    button.addEventListener('click', async () => {
      // read before the form replaces the banner content
      const parentTitle = aside.querySelector('picture img')?.alt || '';
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      try {
        const { default: openRegistration, getRegistrationConfig } = await import('./warranty-registration.js');
        await openRegistration(aside, getRegistrationConfig());
        pushAdobeCtaClickEvent({
          event: 'custom_cta_click',
          cta: button.textContent || '',
          parentTitle,
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('warranty registration failed to load', error);
        window.location.href = link.href;
      }
    });
  }
  return aside;
}

/**
 * Turns "Performance warranty : 15 years" lines into term/value pairs.
 * Lines without a colon are kept as plain paragraphs.
 */
function buildTerms(lines) {
  const dl = document.createElement('dl');
  dl.className = 'warranty-container-terms';
  const extra = [];
  lines.forEach((line) => {
    const text = line.textContent.replace(/\s+/g, ' ').trim();
    const split = text.indexOf(':');
    if (split < 1) {
      extra.push(line);
      return;
    }
    const group = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = text.slice(0, split).trim();
    const dd = document.createElement('dd');
    dd.textContent = text.slice(split + 1).trim();
    moveInstrumentation(line, group);
    group.append(dt, dd);
    dl.append(group);
  });
  return { dl: dl.children.length ? dl : null, extra };
}

function buildItem(row, id) {
  const li = document.createElement('li');
  li.className = 'warranty-container-item';
  moveInstrumentation(row, li);

  const [summaryCell, detailCell] = [...row.children];
  const summary = summaryCell ? cellChildren(summaryCell) : [];

  const titleEl = summary.find((el) => el.matches(HEADINGS)) || summary[0];
  const linkEls = summary.filter((el) => el !== titleEl && el.querySelector('a[href]'));
  const lines = summary.filter((el) => el !== titleEl && !linkEls.includes(el));

  const heading = document.createElement('h3');
  heading.className = 'warranty-container-item-heading';
  const button = document.createElement('button');
  button.type = 'button';
  button.id = `${id}-button`;
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', `${id}-panel`);
  const name = document.createElement('span');
  name.className = 'warranty-container-item-name';
  name.textContent = titleEl?.textContent.trim() || '';
  if (titleEl) moveInstrumentation(titleEl, name);
  const icon = document.createElement('span');
  icon.className = 'warranty-container-icon';
  icon.setAttribute('aria-hidden', 'true');
  button.append(name, icon);
  heading.append(button);
  li.append(heading);

  const { dl, extra } = buildTerms(lines);
  if (dl) li.append(dl);
  li.append(...extra);

  linkEls.forEach((el) => {
    // a host project's button decoration must not restyle the guide link
    el.classList.remove('button-container');
    el.classList.add('warranty-container-guide');
    el.querySelectorAll('a[href]').forEach((original) => {
      // the clone drops the site-wide button listener that already tracks this link
      const a = original.cloneNode(true);
      original.replaceWith(a);
      a.classList.remove('button', 'primary', 'secondary', 'accent');
      // the visible text plus the hint below is the accessible name
      a.removeAttribute('aria-label');
      // guides are PDFs that open in a new tab; say so for screen reader users
      if (a.target === '_blank' || /\.pdf$/i.test(new URL(a.href).pathname)) {
        a.target = '_blank';
        a.rel = 'noopener';
        const hint = document.createElement('span');
        hint.className = 'warranty-container-sr-only';
        hint.textContent = ` for ${name.textContent} (PDF, opens in a new tab)`;
        a.append(hint);
      }
      a.addEventListener('click', () => {
        const pdfName = decodeURIComponent(new URL(a.href).pathname.split('/').pop());
        const title = name.textContent;
        pushAdobeCtaClickEvent({
          event: 'download_multiple_pdf',
          pdfName,
          title,
        });
      });
    });
    li.append(el);
  });

  const panel = document.createElement('div');
  panel.className = 'warranty-container-panel';
  panel.id = `${id}-panel`;
  panel.hidden = true;
  if (detailCell) {
    moveInstrumentation(detailCell, panel);
    panel.append(...cellChildren(detailCell));
  }
  if (panel.textContent.trim()) {
    li.append(panel);
  } else {
    // nothing to expand: render the name as a plain heading
    heading.replaceChildren(name);
  }

  return li;
}

export default function decorate(block) {
  instances += 1;
  const id = `warranty-container-${instances}`;
  const main = block.closest('main');
  const section = block.closest('.section');
  // the banner is the LCP image, also behind an image-less first section (sr-only H1)
  const eager = section === main?.querySelector('.section')
    || (!!main && section === findLcpSection(main));

  let header = null;
  let banner = null;
  const list = document.createElement('ul');
  list.className = 'warranty-container-list';

  [...block.children].forEach((row, i) => {
    const hasPicture = row.querySelector('picture');
    const hasLink = row.querySelector('a[href]');
    const isTitleRow = row.children.length === 1 && row.querySelector(HEADINGS);
    if (!header && !hasPicture && !hasLink && isTitleRow) {
      header = document.createElement('div');
      header.className = 'warranty-container-header';
      moveInstrumentation(row, header);
      header.append(...cellChildren(row.firstElementChild));
      return;
    }
    if (!banner && hasPicture) {
      banner = buildBanner(row, eager);
      return;
    }
    if (row.textContent.trim()) list.append(buildItem(row, `${id}-item-${i}`));
  });

  // banner first: it is shown first on mobile, so reading and focus order match (grid places it
  // in the right column on desktop)
  const content = banner ? [banner] : [];
  if (header) {
    const heading = header.querySelector(HEADINGS);
    heading.id = `${id}-heading`;
    list.setAttribute('aria-labelledby', heading.id);
    content.push(header);
  }
  if (list.children.length) {
    const scroller = document.createElement('div');
    scroller.className = 'warranty-container-scroller';
    scroller.append(list);
    content.push(scroller);
  }
  block.replaceChildren(...content);

  // one item open at a time, as on the source
  list.addEventListener('click', (e) => {
    const button = e.target.closest('.warranty-container-item-heading button');
    if (!button) return;
    const open = button.getAttribute('aria-expanded') !== 'true';
    list.querySelectorAll('.warranty-container-item-heading button[aria-expanded="true"]').forEach((other) => {
      other.setAttribute('aria-expanded', 'false');
      document.getElementById(other.getAttribute('aria-controls')).hidden = true;
    });
    button.setAttribute('aria-expanded', open);
    document.getElementById(button.getAttribute('aria-controls')).hidden = !open;
  });
}
