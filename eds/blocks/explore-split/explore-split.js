import { triggerCTAClickWithLinkAndTitle } from '../../scripts/analytics_1.js';

/**
 * Returns the section-level title (h2 in the .section wrapper) for the
 * "Explore Beyond Colours" banner, falling back to the nearest h3 inside
 * the block (i.e. "Textures" / "Wallpapers") when no section h2 exists.
 */
function getSectionOrNearestHeadingTitle(cta, block) {
  // 1. Prefer an h2 in the enclosing .section (e.g. "Explore Beyond Colours")
  const section = cta.closest('.section');
  if (section) {
    const sectionH2 = section.querySelector(':scope > h2, :scope > .default-content-wrapper h2');
    if (sectionH2?.textContent?.trim()) return sectionH2.textContent.trim();
  }

  // 2. Walk up to block boundary looking for a direct-child h3
  let scope = cta.parentElement;
  while (scope && scope !== block) {
    const scopedHeading = scope.querySelector(':scope > h3');
    if (scopedHeading?.textContent?.trim()) {
      return scopedHeading.textContent.trim();
    }
    scope = scope.parentElement;
  }

  // 3. Nearest preceding h3 in the block
  const headings = [...block.querySelectorAll('h3')].reverse();
  const nearest = headings.find((heading) => {
    const relation = heading.compareDocumentPosition(cta);
    // eslint-disable-next-line no-bitwise -- compareDocumentPosition returns a bitmask
    return (relation & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  });
  return nearest?.textContent?.trim() || 'Explore Split';
}

function getExploreSplitParentTitle(cta, block) {
  const splitColumn = cta.closest('.textures-desktop, .textures-mobile, .wallpapers-desktop, .wallpapers-mobile');
  if (splitColumn) {
    const columnHeading = splitColumn.querySelector(':scope > h3');
    const headingId = (columnHeading?.id || '').trim().toLowerCase();
    const headingText = (columnHeading?.textContent || '').trim().toLowerCase();

    if (headingId.includes('texture') || headingText.includes('texture')) return 'textures';
    if (headingId.includes('wallpaper') || headingText.includes('wallpaper')) return 'wallpapers';
  }

  const fallbackTitle = getSectionOrNearestHeadingTitle(cta, block);
  const normalized = fallbackTitle.toLowerCase();
  if (normalized.includes('texture')) return 'textures';
  if (normalized.includes('wallpaper')) return 'wallpapers';
  return fallbackTitle;
}

function bindViewAllTracking(block) {
  block.querySelectorAll('.button-container a.button').forEach((cta) => {
    if (cta.dataset.exploreSplitAnalyticsBound === 'true') return;

    const buttonText = (cta.textContent || '').trim().toLowerCase();
    if (!buttonText.startsWith('view all')) return;

    cta.dataset.exploreSplitAnalyticsBound = 'true';
    cta.dataset.analyticsBound = 'true';
    cta.addEventListener('click', () => {
      const ctaLink = cta.getAttribute('href') || '';
      // eVar45 (cta_): use the actual button text ("View All"), not the heading id slug
      const btnTitle = cta.textContent.trim();
      // eVar67 (parentTitle): derive from the clicked split column context.
      const parentTitle = getExploreSplitParentTitle(cta, block);

      triggerCTAClickWithLinkAndTitle(ctaLink, btnTitle, parentTitle);
    });
  });
}

/**
 * Mobile mosaic: tags the first four images (in authored order) as tiles 1-4,
 * which CSS places in fixed slots. Empty authored paragraphs and extra images
 * are skipped so they can't take a slot. The heading (cloned into the tabs)
 * and the "View all" link are left as is.
 */
function prepareMosaic(col) {
  let tiles = 0;
  [...col.children].forEach((el) => {
    if (el.matches('h1, h2, h3, h4, h5, h6')) return;
    if (el.matches('picture, img') || el.querySelector('picture, img')) {
      tiles += 1;
      if (tiles <= 4) {
        el.classList.add('explore-tile', `explore-tile-${tiles}`);
        return;
      }
    } else if (el.querySelector('a')) {
      return;
    }
    el.classList.add('explore-skip');
  });
}

export default function decorate(block) {
  bindViewAllTracking(block);

  const section = block.closest('.section');
  if (section) section.classList.add('explore-split-wrapper');

  const rows = [...block.children];
  if (rows.length < 1) return;

  const desktopRow = rows[0] || null;
  const mobileRow = rows[1] || null;

  const isDesktop = window.matchMedia('(min-width: 992px)').matches;
  const isMobile = window.matchMedia('(max-width: 991px)').matches;

  /* ---------------- DESKTOP ---------------- */

  if (isDesktop && desktopRow) {
    const desktopCols = [...desktopRow.children];
    if (desktopCols.length < 2) return;

    const texturesHeadingCol = desktopCols[0];
    const texturesImagesCol = desktopCols[1];

    desktopRow.classList.add('explore-split-desktop');
    texturesHeadingCol.classList.add('textures-desktop');
    texturesImagesCol.classList.add('wallpapers-desktop');

    const paragraphs = texturesHeadingCol.querySelectorAll('p');
    paragraphs.forEach((p, index) => {
      p.classList.add(`img-${index + 1}`);
    });

    if (mobileRow) mobileRow.remove();
  }

  /* ---------------- MOBILE ---------------- */

  if (isMobile && mobileRow) {
    const mobileCols = [...mobileRow.children];
    if (mobileCols.length < 2) return;

    const texturesCol = mobileCols[0];
    const wallpapersCol = mobileCols[1];

    mobileRow.classList.add('explore-split-mobile');
    texturesCol.classList.add('textures-mobile');
    wallpapersCol.classList.add('wallpapers-mobile');
    prepareMosaic(texturesCol);
    prepareMosaic(wallpapersCol);

    const texturesTab = texturesCol.querySelector('h3');
    const wallpapersTab = wallpapersCol.querySelector('h3');
    if (!texturesTab || !wallpapersTab) return;

    /* Tabs (the mosaic layout itself is pure CSS, see explore-split.css) */
    const tabsNav = document.createElement('div');
    tabsNav.className = 'explore-mobile-tabs';

    const texturesTabClone = texturesTab.cloneNode(true);
    const wallpapersTabClone = wallpapersTab.cloneNode(true);

    tabsNav.append(texturesTabClone, wallpapersTabClone);
    mobileRow.insertBefore(tabsNav, mobileRow.firstChild);

    const showTab = (showTextures) => {
      texturesCol.style.display = showTextures ? '' : 'none';
      wallpapersCol.style.display = showTextures ? 'none' : '';
      texturesTabClone.classList.toggle('active', showTextures);
      wallpapersTabClone.classList.toggle('active', !showTextures);
    };

    texturesTabClone.addEventListener('click', () => showTab(true));
    wallpapersTabClone.addEventListener('click', () => showTab(false));
    showTab(true);

    if (desktopRow) desktopRow.remove();
  }
}
