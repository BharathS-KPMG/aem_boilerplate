/* eslint-disable -- stage site version of this block, kept as is; the colours variant is marked COLOURS VARIANT */
/*
** Authoring format **

Row 1 → Heading (h2 / h3 / h4) and an optional description paragraph
Row 2 → one cell per card (3 cards):
        image, **Title** (bold), *Description* (italic), link (button label + URL)

----------------------------------------
===== COLOURS VARIANT START =====
Variant: colours
(block authored as "interiors-shop (colours)")

Same authoring format. Cream card like the live wall coverings "Colour As A
Starting Point" row: dark text, heading top left, the three cards stepping up
from left to right on desktop; one-card slider with dots up to 768px; cards
stacked one below the other from 769px to 991px (like live).
===== COLOURS VARIANT END =====

----------------------------------------
===== SINGLE CTA VARIANT START =====
Variant: single-cta-variant
(block authored as "interiors-shop (single-cta-variant)")

Row 1 → Heading, an optional description, and one link: the block's only
        button (label + URL as authored)
Row 2 → one cell per card (3 cards): image, **Title** (bold), *Description*
        (italic). A link in a card cell makes its image clickable; cards have
        no button of their own.

Cream card. Desktop (900px and up): heading above the first card, the three
square cards stepping up from left to right, the button bottom right.
Below 900px: no slider; each card is a row (small square image left, title
and description right) and the button is full width at the bottom.
===== SINGLE CTA VARIANT END =====
*/
import { pushAdobeCtaClickEvent } from '../../scripts/analytics_1.js';

export default function decorate(block) {
  // ===== COLOURS VARIANT START =====
  const colours = block.classList.contains('colours');
  // ===== COLOURS VARIANT END =====

  // ===== SINGLE CTA VARIANT START =====
  const singleCta = block.classList.contains('single-cta-variant');
  // ===== SINGLE CTA VARIANT END =====

  // Get heading and description
  const heading = block.querySelector('h2, h3, h4');
  // ===== COLOURS VARIANT: description only from the heading row, so a card's text
  // is never picked up as the description (default variant unchanged) =====
  let description = colours ? block.querySelector(':scope > div:first-child p') : block.querySelector('p');
  // ===== SINGLE CTA VARIANT: description built below, without row 1's link =====
  if (singleCta) description = null;

  // Get all rows after header
  const rows = [...block.querySelectorAll(':scope > div')];

  // Create main grid
  const wrapper = document.createElement('div');
  wrapper.className = 'interiors-shop-grid';

  // Create left column
  const leftColumn = document.createElement('div');
  leftColumn.className = 'interiors-shop-left-column';

  // Create text container
  const textDiv = document.createElement('div');
  textDiv.className = 'interiors-shop-text';

  if (heading) {
    const headingClone = heading.cloneNode(true);
    headingClone.classList.add('interiors-shop-heading');
    textDiv.appendChild(headingClone);
  }

  if (description) {
    // keep every authored line: DA line breaks become separate <p>s (Enter)
    // or <br>s (Shift+Enter), so merge all text paragraphs in the cell
    const lines = [...description.parentElement.querySelectorAll(':scope > p')]
      .filter((p) => !p.querySelector('a, picture, img') && p.textContent.trim());
    const descriptionClone = description.cloneNode(true);
    if (lines.length) descriptionClone.innerHTML = lines.map((p) => p.innerHTML).join('<br>');
    descriptionClone.classList.add('interiors-shop-description');
    textDiv.appendChild(descriptionClone);
  }

  // ===== SINGLE CTA VARIANT START =====
  // Row 1's link is the block's button, so the description is row 1's text
  // without it, whether DA puts the link on its own line (Enter) or after a
  // line break in the description's paragraph (Shift+Enter)
  if (singleCta) {
    const isBlank = (node) => node && (node.nodeName === 'BR' || !node.textContent.trim());
    const lines = [...block.querySelectorAll(':scope > div:first-child p')]
      .map((p) => {
        const line = p.cloneNode(true);
        line.querySelectorAll('a, picture, img').forEach((el) => el.remove());
        // drop the line breaks and empty tags left where the link was
        while (isBlank(line.firstChild)) line.firstChild.remove();
        while (isBlank(line.lastChild)) line.lastChild.remove();
        return line;
      })
      .filter((line) => line.textContent.trim());
    if (lines.length) {
      const descriptionEl = document.createElement('p');
      descriptionEl.className = 'interiors-shop-description';
      descriptionEl.innerHTML = lines.map((line) => line.innerHTML).join('<br>');
      textDiv.appendChild(descriptionEl);
    }
  }
  // ===== SINGLE CTA VARIANT END =====

  leftColumn.appendChild(textDiv);

  // ===== SINGLE CTA VARIANT START =====
  // One button for the whole block, from the link in row 1
  let singleCtaButton;
  const singleCtaLink = singleCta && block.querySelector(':scope > div:first-child a');
  if (singleCtaLink) {
    const ctaText = singleCtaLink.textContent.trim();
    singleCtaButton = document.createElement('a');
    singleCtaButton.href = singleCtaLink.href;
    singleCtaButton.className = 'interiors-shop-button interiors-shop-cta';
    singleCtaButton.textContent = ctaText;
    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    singleCtaButton.append(arrow);
    singleCtaButton.addEventListener('click', () => {
      const parentTitle = heading?.textContent?.trim() || '';

      pushAdobeCtaClickEvent({
        cta: ctaText,
        parentTitle,
        destinationUrl: singleCtaButton.href,
        event: 'custom_cta_click',
      });
    });
  }
  // ===== SINGLE CTA VARIANT END =====

  // Collect all cards
  const cards = [];

  rows.slice(1).forEach((row) => {
    const cells = [...row.children];

    cells.forEach((cell) => {
      const img = cell.querySelector('img');
      const title = cell.querySelector('strong');
      const desc = cell.querySelector('em');
      const link = cell.querySelector('a');

      if (!img && !title) return;

      const card = document.createElement('div');
      card.className = 'interiors-shop-card';

      if (img) {
        const imgDiv = document.createElement('div');
        imgDiv.className = 'interiors-shop-card-image';
        const imgClone = img.cloneNode(true);
        imgDiv.appendChild(imgClone);
        if (link) {
          imgDiv.style.cursor = 'pointer';
          imgDiv.addEventListener('click', () => {
            const cardTitle = title?.textContent?.trim() || '';
 
            pushAdobeCtaClickEvent({
              cta: link.textContent?.trim() || 'Explore now',
              parentTitle: cardTitle,
              destinationUrl: link.href,
              event: 'cta_link_text',
            });
            window.location.href = link.href;
          });
        }
        card.appendChild(imgDiv);
      }

      const contentDiv = document.createElement('div');
      contentDiv.className = 'interiors-shop-card-content';

      if (title) {
        const titleEl = document.createElement('div');
        titleEl.className = 'title';
        titleEl.textContent = title.textContent.trim();
        contentDiv.appendChild(titleEl);
      }

      if (desc) {
        const descEl = document.createElement('p');
        descEl.textContent = desc.textContent.trim();
        contentDiv.appendChild(descEl);
      }

      // ===== SINGLE CTA VARIANT: no button on the cards =====
      if (link && !singleCta) {
        const btn = document.createElement('a');
        btn.href = link.href;
        btn.className = 'interiors-shop-button';
        const btnText = link.textContent?.trim() || 'Explore now';
        btn.innerHTML = `${btnText} <span class="arrow"></span>`;
        btn.addEventListener('click', () => {
          const cardTitle = title?.textContent?.trim() || '';

          pushAdobeCtaClickEvent({
            cta: btnText,
            parentTitle: cardTitle,
            destinationUrl: btn.href,
            event: 'custom_cta_click',
          });

        });
        contentDiv.appendChild(btn);
      }

      card.appendChild(contentDiv);
      cards.push(card);
    });
  });

  // Clear and rebuild block
  block.innerHTML = '';

  if (cards.length > 0) {
    cards[0].classList.add('card-left');
    leftColumn.appendChild(cards[0]);
  }

  wrapper.appendChild(leftColumn);

  if (cards.length > 1) {
    cards[1].classList.add('card-middle');
    wrapper.appendChild(cards[1]);
  }

  if (cards.length > 2) {
    cards[2].classList.add('card-right');
    wrapper.appendChild(cards[2]);
  }

  block.appendChild(wrapper);

  // ===== SINGLE CTA VARIANT START =====
  // The button goes in the grid after the cards. No slider: below 900px the
  // CSS lists the cards as rows, so Swiper is never loaded.
  if (singleCta) {
    if (singleCtaButton) wrapper.appendChild(singleCtaButton);
    return;
  }
  // ===== SINGLE CTA VARIANT END =====

  // -------------------------------
  // Swiper Logic
  // -------------------------------
  let swiperInstance;
  let paginationEl;

  // ===== COLOURS VARIANT: slider with dots up to 768px like live (default variant: below 900px) =====
  const mobileQuery = window.matchMedia(colours ? '(max-width: 768px)' : '(max-width: 899px)');

  async function initSwiper() {
    const grid = block.querySelector('.interiors-shop-grid');
    if (!grid || swiperInstance) return;

    // Swiper is only preloaded ~6s after page load, so load it on demand here
    // (otherwise the mobile layout is applied with no carousel behind it)
    if (!window.Swiper && window.loadSwiper) {
      try {
        await window.loadSwiper();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('interiors-shop: failed to load Swiper', e);
        return;
      }
    }
    // bail if Swiper is unavailable, another call already initialised it, or
    // the viewport switched back to desktop while Swiper was loading
    if (!window.Swiper || swiperInstance || !mobileQuery.matches) return;

    grid.classList.add('swiper');

    const wrapperEl = document.createElement('div');
    wrapperEl.className = 'swiper-wrapper';

    const cards = [...grid.children].filter(
      (el) => !el.classList.contains('interiors-shop-left-column')
    );

    cards.forEach((card) => {
      card.classList.add('swiper-slide');
      wrapperEl.appendChild(card);
    });

    grid.appendChild(wrapperEl);

    // 👉 Pagination OUTSIDE grid
    paginationEl = document.createElement('div');
    paginationEl.className = 'interiors-shop-pagination swiper-pagination';

    block.appendChild(paginationEl);

    swiperInstance = new window.Swiper(grid, {
      slidesPerView: 1,
      // ===== COLOURS VARIANT: 17px between cards like live (default variant: 16px) =====
      spaceBetween: colours ? 17 : 16,
      pagination: {
        el: paginationEl,
        clickable: false,
      },
    });
  }

  function destroySwiper() {
    if (!swiperInstance) return;

    swiperInstance.destroy(true, true);
    swiperInstance = null;

    const grid = block.querySelector('.interiors-shop-grid');
    if (!grid) return;

    const wrapperEl = grid.querySelector('.swiper-wrapper');
    if (!wrapperEl) return;

    const slides = [...wrapperEl.children];
    slides.forEach((slide) => {
      slide.classList.remove('swiper-slide');
      grid.appendChild(slide);
    });

    wrapperEl.remove();

    // Remove pagination outside
    if (paginationEl) {
      paginationEl.remove();
      paginationEl = null;
    }

    grid.classList.remove('swiper');
  }

  // -------------------------------
  // Mobile Layout Logic
  // -------------------------------

  function updateMobileLayout(e) {
    const isMobile = e?.matches ?? mobileQuery.matches;

    const grid = block.querySelector('.interiors-shop-grid');
    const leftCol = block.querySelector('.interiors-shop-left-column');
    const firstCard = block.querySelector('.card-left');

    if (!grid || !leftCol || !firstCard) return;

    if (isMobile) {
      // Move left column outside grid
      if (leftCol.parentElement === grid) {
        block.insertBefore(leftCol, grid);
      }

      // Move first card into grid
      if (firstCard.parentElement === leftCol) {
        grid.insertBefore(firstCard, grid.firstChild);
      }

      initSwiper();
    } else {
      // Restore desktop
      if (leftCol.parentElement === block) {
        block.insertBefore(grid, leftCol.nextSibling);
        grid.insertBefore(leftCol, grid.firstChild);
      }

      if (firstCard.parentElement === grid) {
        leftCol.appendChild(firstCard);
      }

      destroySwiper();
    }
  }

  updateMobileLayout();

  if (typeof mobileQuery.addEventListener === 'function') {
    mobileQuery.addEventListener('change', updateMobileLayout);
  } else if (typeof mobileQuery.addListener === 'function') {
    mobileQuery.addListener(updateMobileLayout);
  }
}
