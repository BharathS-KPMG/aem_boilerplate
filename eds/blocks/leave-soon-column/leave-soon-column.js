export default function decorate(block) {
  const rows = [...block.children].slice(1);

  const locationWrapper = document.createElement('div');
  locationWrapper.className = 'location';

  const bannerWrapper = document.createElement('div');
  bannerWrapper.className = 'banner';

  const hero = document.createElement('div');
  hero.className = 'leave-soon-hero';

  const left = document.createElement('div');
  left.className = 'leave-soon-hero-content';

  const right = document.createElement('div');
  right.className = 'leave-soon-hero-shades';

  const titles = rows.map((row) => row.children[0]?.textContent.trim());

  left.innerHTML = `
    <p class="leave-soon-eyebrow">${titles[0] || ''}</p>

    <h2 class="leave-soon-title">
      ${titles[1] || ''}
    </h2>

    <div class="leave-soon-loaction">
      <span>${titles[2] || ''}</span>
      <a href="#">${titles[3] || ''}</a>
    </div>
  `;

  rows.forEach((row) => {
    const shade = row.children[1]?.textContent.trim();
    const hex = row.children[2]?.textContent.trim();
    const variant = row.children[3]?.textContent.trim().toLowerCase();

    if (variant === 'banner') {
      const desktopImg = row.children[1]?.querySelector('img');
      const mobileImg = row.children[2]?.querySelector('img');

      const bannerHero = document.createElement('div');
      bannerHero.className = 'leave-soon-banner';

      const picture = document.createElement('picture');

      if (mobileImg) {
        const source = document.createElement('source');
        source.media = '(max-width: 991px)';
        source.srcset = mobileImg.src;
        picture.append(source);
      }

      if (desktopImg || mobileImg) {
        const img = document.createElement('img');
        img.src = desktopImg?.src || mobileImg?.src;
        img.alt = desktopImg?.alt || mobileImg?.alt || '';
        img.loading = 'lazy';

        picture.append(img);
        bannerHero.append(picture);
        bannerWrapper.append(bannerHero);
      }

      return;
    }

    if (!shade || !hex) return;

    const card = document.createElement('div');
    card.className = 'shade-card';
    const [shadeName, shadeCode] = shade.match(/^(.*?)\((.*?)\)$/)?.slice(1) || [shade, ''];
    card.innerHTML = `
  <div
    class="shade-card-swatch"
    style="background:${hex}"
  ></div>

  <div class="shade-card-name">
    <span class="shade-name">${shadeName}</span>
    <span class="shade-code">${shadeCode}</span>
  </div>
`;

    right.append(card);
  });

  hero.append(left, right);
  locationWrapper.append(hero);

  block.textContent = '';

  block.append(
    locationWrapper,
    bannerWrapper,
  );

  const parentWrapper = block.closest('.leave-soon-column-wrapper');

  function updateView(showBanner) {
    locationWrapper.style.display = showBanner ? 'none' : 'block';
    bannerWrapper.style.display = showBanner ? 'block' : 'none';

    if (parentWrapper) {
      parentWrapper.classList.toggle('banner-view', showBanner);
      parentWrapper.classList.toggle('location-view', !showBanner);
    }

    const form = document.querySelector(
      '.leave-soon-form .lead-form-fields',
    );

    const submitText = form?.querySelector('.submit-wrapper button span');
    const submitIcon = form?.querySelector('.submit-wrapper .submit-icon');

    if (submitText) {
      submitText.textContent = showBanner
        ? form.dataset.bannerSubmitText
        : form.dataset.locationSubmitText;
    }

    if (submitIcon) {
      submitIcon.src = showBanner
        ? '/eds/icon/appointment-icon.svg'
        : '/eds/icon/download-icon.svg';
    }

    const submitWrapper = form?.querySelector('.field-wrapper.submit-wrapper');

    if (submitWrapper) {
      submitWrapper.classList.toggle('banner-submit', showBanner);
      submitWrapper.classList.toggle('location-submit', !showBanner);
    }
  }

  function initializeView(showBanner) {
    const form = document.querySelector(
      '.leave-soon-form .lead-form-fields',
    );

    if (!form) {
      setTimeout(() => initializeView(showBanner), 100);
      return;
    }

    updateView(showBanner);

    window.showLeaveSoonVariant = (variant = 'banner') => {
      updateView(variant === 'banner');
    };

    window.openLeaveSoonVariant = (variant = 'banner') => {
      updateView(variant === 'banner');

      window.leaveSoonModal?.showModal({
        trackLeaveSoonImpression: true,
      });
    };
  }

  initializeView(true);
}
