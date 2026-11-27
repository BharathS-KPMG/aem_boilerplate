/*
** Authoring format **

Block name: cards-textures

Intro rows - two columns: label | value
Title                     → first part of the heading (e.g. "Explore")
Title in color gradiant   → gradient part of the heading (e.g. "Textures")
Description               → text under the heading
CTA                       → button label (e.g. "View all Textures")
Link                      → button link
Background colour in hex  → block background (e.g. "#FEFCF7")

Header row (skipped) - Card name | Desktop image | Mobile image | Packshot image | Description | CTA

Card rows - one row per card
Col 1 → Card name (e.g. "Stucco")
Col 2 → Desktop image - texture background (shown from 992px)
Col 3 → Mobile image - texture background below 992px (falls back to the desktop image)
Col 4 → Packshot image - paint bucket shown on hover / when expanded
Col 5 → Description
Col 6 → CTA link (link text is the label, e.g. "View Details")
*/

import { createOptimizedPicture } from '../../scripts/aem.js';
import { triggerCTAClickWithLinkAndTitle } from '../../scripts/analytics_1.js';

const MOBILE_MEDIA = '(max-width: 991px)';

function text(el) {
  return (el?.textContent || '').trim();
}

function toKey(label) {
  return label.toLowerCase().replace(/[^a-z]+/g, ' ').trim();
}

function linkOf(cell) {
  const a = cell?.querySelector('a[href]');
  if (a) return a.getAttribute('href');
  return text(cell);
}

// "FEFCF7" or "#FEFCF7" → "#FEFCF7"; invalid colours are ignored
function toColor(value) {
  const color = /^[0-9a-f]{3,8}$/i.test(value) ? `#${value}` : value;
  return color && CSS.supports('color', color) ? color : '';
}

// desktop picture with the mobile image as a source below 992px
function buildPicture(desktopImg, mobileImg, alt) {
  const picture = createOptimizedPicture(desktopImg.src, alt, false, [{ width: '750' }]);
  if (mobileImg && mobileImg.src !== desktopImg.src) {
    const mobilePicture = createOptimizedPicture(mobileImg.src, alt, false, [{ width: '750' }]);
    const webp = mobilePicture.querySelector('source[type="image/webp"]');
    if (webp) {
      webp.media = MOBILE_MEDIA;
      picture.prepend(webp);
    }
  }
  return picture;
}

function parse(block) {
  const intro = {};
  const cards = [];
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const key = toKey(text(cells[0]));

    if (cells.length > 2) {
      const desktopImg = cells[1]?.querySelector('img');
      if (key === 'card name' && !desktopImg) return;
      const link = cells[5]?.querySelector('a[href]');
      cards.push({
        name: text(cells[0]),
        desktopImg,
        mobileImg: cells[2]?.querySelector('img'),
        packshot: cells[3]?.querySelector('picture'),
        description: text(cells[4]),
        link: link ? { label: text(link), href: link.getAttribute('href') } : null,
      });
      return;
    }

    const valueCell = cells[1];
    if (key.includes('gradi')) intro.gradientTitle = text(valueCell);
    else if (key === 'title') intro.title = text(valueCell);
    else if (key === 'description') intro.description = text(valueCell);
    else if (key === 'cta') intro.ctaLabel = text(valueCell);
    else if (key === 'link') intro.ctaHref = linkOf(valueCell);
    else if (key.startsWith('background')) intro.background = toColor(text(valueCell));
  });
  return { intro, cards };
}

function buildIntro(intro) {
  const {
    title, gradientTitle, description, ctaLabel, ctaHref,
  } = intro;
  if (!title && !gradientTitle && !description && !ctaLabel) return null;

  const el = document.createElement('div');
  el.className = 'cards-textures-intro';

  if (title || gradientTitle) {
    const heading = document.createElement('h2');
    heading.className = 'cards-textures-title';
    if (title) heading.append(title);
    if (gradientTitle) {
      const gradient = document.createElement('span');
      gradient.className = 'cards-textures-title-gradient';
      gradient.textContent = gradientTitle;
      heading.append(title ? ' ' : '', gradient);
    }
    el.append(heading);
  }

  if (description) {
    const p = document.createElement('p');
    p.className = 'cards-textures-intro-description';
    p.textContent = description;
    el.append(p);
  }

  if (ctaLabel && ctaHref) {
    const a = document.createElement('a');
    a.className = 'cards-textures-cta';
    a.href = ctaHref;
    a.textContent = ctaLabel;
    a.addEventListener('click', () => {
      triggerCTAClickWithLinkAndTitle(ctaHref, ctaLabel, [title, gradientTitle].filter(Boolean).join(' '));
    });
    el.append(a);
  }

  return el;
}

function buildCard(cardData, block) {
  const {
    name, desktopImg, mobileImg, packshot, description, link,
  } = cardData;
  let btn = null;

  const card = document.createElement('div');
  card.className = 'cards-textures-card';

  // Create background image container (texture image)
  if (desktopImg) {
    const bgContainer = document.createElement('div');
    bgContainer.className = 'card-background';
    bgContainer.appendChild(buildPicture(desktopImg, mobileImg, desktopImg.alt));
    card.appendChild(bgContainer);
  }

  // Create card name (always visible at bottom)
  const cardName = document.createElement('div');
  cardName.className = 'card-name';
  cardName.textContent = name;
  card.appendChild(cardName);

  // Create hover overlay content
  const hoverContent = document.createElement('div');
  hoverContent.className = 'card-hover-content';

  const isDesktop = window.matchMedia('(min-width: 992px)').matches;

  // 1. Paint bucket/packshot image should come first
  if (packshot) {
    const bucketContainer = document.createElement('div');
    bucketContainer.className = 'card-bucket';
    bucketContainer.appendChild(packshot);
    hoverContent.appendChild(bucketContainer);
  }

  // 2. Wrapper should come after card-bucket, only for desktop
  let hoverAppendTarget = hoverContent;

  if (isDesktop) {
    const hoverWrapper = document.createElement('div');
    hoverWrapper.className = 'wrapper';
    hoverContent.appendChild(hoverWrapper);

    hoverAppendTarget = hoverWrapper;
  }

  // Title in hover state
  const hoverTitle = document.createElement('h4');
  hoverTitle.className = 'card-hover-title';
  hoverTitle.textContent = name;
  hoverAppendTarget.appendChild(hoverTitle);

  // Description
  if (description) {
    const desc = document.createElement('p');
    desc.className = 'card-description';
    desc.textContent = description;
    hoverAppendTarget.appendChild(desc);
  }

  // View Details button
  if (link) {
    btn = document.createElement('a');
    btn.className = 'card-button';
    btn.href = link.href;
    btn.textContent = link.label;
    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    btn.append(' ', arrow);
    hoverAppendTarget.appendChild(btn);
  }

  card.appendChild(hoverContent);

  // Make entire card clickable / mobile expand-collapse
  if (link) {
    const ctaLink = link.href;
    const btnTitle = link.label;

    btn?.addEventListener('click', (e) => {
      e.stopPropagation();

      triggerCTAClickWithLinkAndTitle(ctaLink, btnTitle, name);
      window.location.href = ctaLink;
    });

    card.addEventListener('click', (e) => {
      const clickedCard = e.currentTarget;

      // CTA should redirect
      if (e.target.closest('.card-button')) return;

      // Mobile: card click only expands/collapses
      if (window.innerWidth < 990) {
        e.preventDefault();

        const isExpanded = clickedCard.classList.contains('child-open');

        // Close all cards first
        block.querySelectorAll('.cards-textures-card.child-open').forEach((openCard) => {
          if (openCard !== clickedCard) {
            openCard.classList.remove('child-open');
          }
        });

        // Toggle only clicked card
        clickedCard.classList.toggle('child-open', !isExpanded);
      }
    });
  }

  return card;
}

export default function decorate(block) {
  const { intro, cards } = parse(block);

  if (intro.background) block.style.backgroundColor = intro.background;

  const cardList = document.createElement('div');
  cardList.className = 'cards-textures-cards';
  cards.forEach((cardData) => cardList.append(buildCard(cardData, block)));

  block.replaceChildren(...[buildIntro(intro), cardList].filter(Boolean));

  // Open first card by default on mobile
  if (window.innerWidth < 990) {
    const firstCard = block.querySelector('.cards-textures-card');

    if (firstCard) {
      firstCard.classList.add('child-open');
    }
  }
}
