import { triggerCTAClickWithLinkAndTitle } from '../../scripts/analytics_1.js';

export default function decorate(block) {
  /* =========================
       STEP 1: FIND SECTION + SIBLINGS
    ========================= */

  const section = block.closest('.section');
  const iconsWrapper = block.closest('.homepage-icons-container-wrapper');
  if (!section || !iconsWrapper) return;

  const isExploreBar = block.classList.contains('explore-bar-variant');
  let rows = [...block.children];
  let parentTitle = '';

  /* =========================
       STEP 2: BUILD THE CARD
    ========================= */

  if (isExploreBar) {
    // `homepage-icons-container explore-bar-variant`: a full-width bar in the
    // page flow that holds its own title. Row 1: "Title | <title>" (the title
    // is row 1, column 2, as authored in DA). Row 2: a
    // header row (Label | Desktop image | Mobile image | Redirection link |
    // Open in new tab | Badge). Then one row per icon. The header row has no
    // links, so the item loop below skips it.
    const [titleRow, ...itemRows] = rows;
    rows = itemRows;

    const card = document.createElement('div');
    card.className = 'home-icon-content-wrapper explore-bar-variant';

    const titleCell = titleRow?.children[1];
    parentTitle = titleCell?.textContent.trim() || '';
    if (parentTitle) {
      const heading = titleCell.querySelector('h1, h2, h3, h4, h5, h6')
        || document.createElement('h2');
      if (!heading.textContent.trim()) heading.textContent = parentTitle;
      heading.classList.add('explore-bar-title');
      card.append(heading);
    }

    iconsWrapper.before(card);
    card.append(iconsWrapper);
  } else {
    // Default: the section's heading (default content) and the icons share
    // one card over the hero. The heading is optional.
    const defaultContent = section.querySelector('.default-content-wrapper');
    parentTitle = defaultContent
      ?.querySelector('h1, h2, h3, h4, h5, h6')
      ?.textContent
      ?.trim() || '';

    if (!section.querySelector('.home-icon-content-wrapper:not(.explore-bar-variant)')) {
      const parent = document.createElement('div');
      parent.className = 'home-icon-content-wrapper';

      section.insertBefore(parent, defaultContent || iconsWrapper);
      if (defaultContent) parent.appendChild(defaultContent);
      parent.appendChild(iconsWrapper);
    }
  }

  /* =========================
       STEP 3: TRANSFORM ITEMS
    ========================= */

  block.innerHTML = '';

  rows.forEach((row) => {
    const cols = [...row.children];

    // A two-line label is two paragraphs; a one-line label may be bare text
    const titleEls = cols[0]?.querySelectorAll('p') || [];
    const desktopSvg = cols[1]?.querySelector('a')?.href;
    const mobileSvg = cols[2]?.querySelector('a')?.href;
    const link = cols[3]?.querySelector('a')?.href;
    const newTab = cols[4]?.textContent.trim().toLowerCase() === 'true';
    // Optional 6th column: badge text (e.g. "Recommended"), shown as a green
    // pill above the icon. Empty or missing = no badge.
    const badgeText = cols[5]?.textContent.trim() || '';

    if (!desktopSvg || !mobileSvg || !link) return;

    const first = (titleEls.length ? titleEls[0] : cols[0])?.textContent?.trim() || '';
    const last = titleEls[1]?.textContent?.trim() || '';
    const btnTitle = [first, last].filter(Boolean).join(' ');

    /* ===== CREATE LINK ===== */

    const a = document.createElement('a');
    a.href = link;
    a.className = 'icon-item banner-icon';
    a.title = btnTitle;
    a.target = newTab ? '_blank' : '_self';
    if (newTab) a.rel = 'noopener noreferrer';
    a.addEventListener('click', () => {
      triggerCTAClickWithLinkAndTitle(link, btnTitle, parentTitle);
    });

    /* ===== FIGURE ===== */

    const figure = document.createElement('figure');

    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'icon-wrapper';

    const picture = document.createElement('picture');

    const sourceDesktop = document.createElement('source');
    sourceDesktop.media = '(min-width:992px)';
    sourceDesktop.srcset = desktopSvg;

    const sourceMobile = document.createElement('source');
    sourceMobile.media = '(min-width:320px)';
    sourceMobile.srcset = mobileSvg;

    const img = document.createElement('img');
    img.src = desktopSvg;
    img.alt = `${first}-${last}`.toLowerCase().replace(/\s+/g, '-');
    img.width = 50;
    img.height = 50;

    picture.append(sourceDesktop, sourceMobile, img);
    iconWrapper.appendChild(picture);

    /* ===== CAPTION ===== */

    const figcaption = document.createElement('figcaption');
    figcaption.innerHTML = `${first} <span class="last-word">${last}</span>`;

    /* ===== ASSEMBLE ===== */

    // The badge goes first, so the link reads "Recommended Product Finder"
    if (badgeText) {
      const badge = document.createElement('span');
      badge.className = 'icon-badge';
      badge.textContent = badgeText;
      a.appendChild(badge);
    }

    figure.appendChild(iconWrapper);
    figure.appendChild(figcaption);
    a.appendChild(figure);

    block.appendChild(a);
  });
}
