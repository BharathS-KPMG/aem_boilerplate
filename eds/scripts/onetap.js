/*
 * onetap.js — Google One Tap + mobile OTP sign-in for a page that uses keycloak-js.
 *
 * Usage (after keycloak.init resolves with authenticated === false):
 *   OneTap.start(keycloak, { googleClientId: "xxxx.apps.googleusercontent.com" });
 * Before keycloak.logout():
 *   OneTap.beforeLogout();
 *
 * Only the One Tap prompt is shown on the site. There is deliberately no
 * "Continue as <name>" button: users who dismiss the prompt use "Sign in with Google"
 * on the Keycloak login page instead.
 *
 * How it fits keycloak-js:
 *   keycloak.createLoginUrl() generates state, nonce and PKCE and saves them (localStorage),
 *   exactly like keycloak.login(). We POST that same request to Keycloak with google_credential
 *   (+ mobile_proof) added, so Keycloak redirects back with a code that keycloak.init() accepts.
 *   Tokens, refresh and logout (with id_token_hint) then work the same as a normal login.
 *
 * Backend: Keycloak realm resource /realms/{realm}/onetap/{status, otp/send, otp/verify}
 *          and the "Google One Tap" authenticator in the browser flow.
 *
 * Functions are declared before they are used, so the sign-in steps appear in reverse order.
 */
/* global google */
(() => {
  const DEFAULTS = {
    googleClientId: '888871988512-ap7mijitousgoo1urnkds8iss222o2gi.apps.googleusercontent.com',
    // true would silently sign users back in after they log out in another app
    autoSelect: false,
    redirectUri: null, // default: this page (same as keycloak.login())
    // called just before the POST to Keycloak (used to mark the login for analytics)
    onBeforeRedirect: null,
    log: () => {}, // optional logger, e.g. your logToTextarea
  };

  let opts = null;
  let keycloak = null;
  let apiBase = null;
  let root = null;
  let otpInputs = [];
  let verifying = false;

  const S = {
    credential: null, // Google ID token, memory only
    authUrl: null,
    authParams: null,
    mobile: null,
    otpId: null,
    proof: null,
    resendTimer: null,
    webOtpAbort: null,
    lastFocus: null,
  };

  /* --------------------------------------------------------------- helpers */

  function $(id) { return document.getElementById(id); }

  function isValidIndianMobile(d) { return /^[6-9]\d{9}$/.test(d); }

  function formatMobile(e164) {
    const d = e164.replace(/^\+91/, '');
    return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  }

  function messageFor(e) {
    const data = (e && e.data) || {};
    switch (e && e.message) {
      case 'otp_invalid': {
        const left = data.attempts_left;
        return {
          text: left > 0
            ? `That code is incorrect. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`
            : 'That code is incorrect. Request a new code.',
        };
      }
      case 'otp_expired': return { text: 'This code has expired. Request a new one.' };
      case 'sms_failed': return { text: 'We couldn\'t send the SMS. Check the number and try again.' };
      case 'invalid_mobile': return { text: 'Enter a valid Indian mobile number.' };
      case 'rate_limited': {
        const minutes = Math.ceil((data.retry_after_seconds || 800) / 60);
        return { text: `Too many attempts. Try again in ${minutes} minutes.` };
      }
      case 'mobile_linked_elsewhere':
        return {
          text: 'This number is linked to a different Google account. '
            + 'Use another number, or sign in with mobile OTP.',
        };
      case 'origin_not_allowed':
        return {
          fatal: true,
          text: 'This site isn\'t allowed to use Google sign-in yet. Contact support.',
        };
      case 'token_expired':
      case 'invalid_google_token':
        return { fatal: true, text: 'Oour Google sign-in expired. Start again to continue.' };
      default:
        return { fatal: true, text: 'Something went wrong on our side. Start again to continue.' };
    }
  }

  function decodeJwt(jwt) {
    try {
      const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const bytes = Uint8Array.from(atob(part), (c) => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return {};
    }
  }

  function api(path, body) {
    return fetch(apiBase + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(
      (res) => res.json().catch(() => ({})).then((data) => {
        if (!res.ok) {
          const err = new Error(data.error || 'server_error');
          err.data = data;
          throw err;
        }
        return data;
      }),
      () => {
        const err = new Error('network');
        err.data = {};
        throw err;
      },
    );
  }

  function ensureGoogle() {
    if (window.google?.accounts?.id) return Promise.resolve();
    if (!document.querySelector('script[src*="accounts.google.com/gsi/client"]')) {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      document.head.appendChild(s);
    }
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      const check = () => {
        if (window.google?.accounts?.id) resolve();
        else if (Date.now() - t0 > 10000) reject(new Error('Google sign-in script did not load'));
        else setTimeout(check, 100);
      };
      check();
    });
  }

  function setFieldError(fieldId, errId, text) {
    $(errId).textContent = text;
    $(fieldId).classList.toggle('is-invalid', !!text);
  }

  function setLoading(button, on, label) {
    if (on) {
      button.setAttribute('data-label', button.textContent);
      button.textContent = label;
      button.disabled = true;
    } else if (button.hasAttribute('data-label')) {
      button.textContent = button.getAttribute('data-label');
      button.removeAttribute('data-label');
      button.disabled = false;
    }
  }

  function setOtpError(text) {
    $('ot-otp-error').textContent = text;
    $('ot-otp').classList.toggle('is-invalid', !!text);
    if (text) otpInputs[0].focus();
  }

  function currentOtp() { return otpInputs.map((i) => i.value).join(''); }

  function clearOtp() {
    otpInputs.forEach((i) => { i.value = ''; });
    $('ot-verify').disabled = true;
    setOtpError('');
  }

  /* ------------------------------------------------ resend timer, Web OTP */

  function stopResendTimer() {
    clearInterval(S.resendTimer);
    S.resendTimer = null;
  }

  function startResendTimer(seconds) {
    stopResendTimer();
    const btn = $('ot-resend');
    let left = seconds;
    const tick = () => {
      if (left <= 0) {
        stopResendTimer();
        btn.disabled = false;
        btn.textContent = 'Resend code';
        return;
      }
      btn.disabled = true;
      btn.textContent = `Resend in ${left}s`;
      left -= 1;
    };
    tick();
    S.resendTimer = setInterval(tick, 1000);
  }

  function stopWebOtp() {
    if (S.webOtpAbort) S.webOtpAbort.abort();
    S.webOtpAbort = null;
  }

  /* ----------------------------------------------------------------- modal */

  function showStep(name) {
    root.querySelectorAll('.ot-step').forEach((s) => {
      s.hidden = s.getAttribute('data-step') !== name;
    });
    const step = root.querySelector(`[data-step="${name}"]`);
    const first = step.querySelector('input') || step.querySelector('button:not([disabled])');
    setTimeout(() => { if (first) first.focus(); }, 50);
  }

  function busy(title) {
    $('ot-busy-title').textContent = title;
    root.querySelector('.ot-spinner').hidden = false;
    showStep('busy');
  }

  function fatal(e) {
    opts.log(`One Tap: ${e && e.message ? e.message : 'error'}`);
    $('ot-fatal-msg').textContent = messageFor(e).text;
    showStep('error');
  }

  function trapFocus(ev) {
    const focusables = [...root.querySelectorAll('button, input')]
      .filter((el) => !el.disabled && el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  }

  function showProfile(claims) {
    $('ot-head').hidden = false;
    $('ot-name').textContent = claims.name || claims.email || '';
    $('ot-email').textContent = claims.email || '';
    const avatar = $('ot-avatar');
    const letter = (claims.given_name || claims.name || claims.email || '?')
      .trim().charAt(0).toUpperCase();
    avatar.textContent = '';
    if (claims.picture) {
      const img = document.createElement('img');
      img.src = claims.picture;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.className = 'ot-avatar';
      img.onerror = () => { img.remove(); avatar.textContent = letter; };
      avatar.appendChild(img);
    } else {
      avatar.textContent = letter;
    }
  }

  function openModal() {
    S.lastFocus = document.activeElement;
    root.hidden = false;
    requestAnimationFrame(() => { root.classList.add('is-open'); });
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    root.classList.remove('is-open');
    stopResendTimer();
    stopWebOtp();
    setTimeout(() => {
      root.hidden = true;
      document.body.style.overflow = '';
      if (S.lastFocus && S.lastFocus.focus) S.lastFocus.focus();
    }, 220);
  }

  /* ---------------------------------------------------------------- step 4 */

  function topLevelPost(url, params) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;
    form.style.display = 'none';
    Object.keys(params).forEach((name) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = params[name];
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  }

  function login() {
    busy('Signing you in…');
    stopResendTimer();
    stopWebOtp();
    const params = { ...S.authParams, google_credential: S.credential };
    if (S.proof) params.mobile_proof = S.proof;
    if (typeof opts.onBeforeRedirect === 'function') opts.onBeforeRedirect();
    // Keycloak sets the SSO cookies and redirects back to this page;
    // keycloak.init() exchanges the code
    topLevelPost(S.authUrl, params);
  }

  /* ---------------------------------------------------------------- step 8 */

  function verifyOtp(otp) {
    if (verifying) return;
    verifying = true;
    setLoading($('ot-verify'), true, 'Verifying…');
    api('/otp/verify', { credential: S.credential, otp_id: S.otpId, otp })
      .then((res) => {
        S.proof = res.mobile_proof;
        stopWebOtp();
        opts.log('One Tap: mobile verified, signing in');
        login(); // new and existing users both sign in straight away
      })
      .catch((e) => {
        const msg = messageFor(e);
        if (msg.fatal) {
          fatal(e);
        } else {
          clearOtp();
          setOtpError(msg.text);
        }
      })
      .then(() => {
        verifying = false;
        setLoading($('ot-verify'), false);
        $('ot-verify').disabled = currentOtp().length !== 6;
      });
  }

  function onOtpChanged() {
    const code = currentOtp();
    $('ot-verify').disabled = code.length !== 6;
    if (code.length === 6) verifyOtp(code); // submit as soon as the 6th digit is in
  }

  function fillOtp(digits) {
    otpInputs.forEach((el, i) => { el.value = digits[i] || ''; });
    otpInputs[Math.min(digits.length, otpInputs.length - 1)].focus();
    setOtpError('');
    onOtpChanged();
  }

  // Android Chrome reads the code from the SMS (SMS must end with "@yourdomain #128456")
  function listenForWebOtp() {
    if (!('OTPCredential' in window)) return;
    stopWebOtp();
    S.webOtpAbort = new AbortController();
    navigator.credentials
      .get({ otp: { transport: ['sms'] }, signal: S.webOtpAbort.signal })
      .then((otp) => { if (otp) fillOtp(otp.code); })
      .catch(() => {});
  }

  function onOtpSubmit(ev) {
    ev.preventDefault();
    const code = currentOtp();
    if (code.length === 6) verifyOtp(code);
  }

  function wireOtpInputs() {
    otpInputs.forEach((input, i) => {
      input.addEventListener('input', () => {
        const digits = input.value.replace(/\D/g, '');
        if (digits.length > 1) {
          fillOtp(digits); // paste or SMS autofill into one box
          return;
        }
        input.value = digits;
        setOtpError('');
        if (digits && i < otpInputs.length - 1) otpInputs[i + 1].focus();
        onOtpChanged();
      });
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Backspace' && !input.value && i > 0) {
          otpInputs[i - 1].value = '';
          otpInputs[i - 1].focus();
          onOtpChanged();
        } else if (ev.key === 'ArrowLeft' && i > 0) {
          otpInputs[i - 1].focus();
        } else if (ev.key === 'ArrowRight' && i < otpInputs.length - 1) {
          otpInputs[i + 1].focus();
        }
      });
      input.addEventListener('paste', (ev) => {
        ev.preventDefault();
        fillOtp(((ev.clipboardData && ev.clipboardData.getData('text')) || '').replace(/\D/g, ''));
      });
    });
  }

  /* ---------------------------------------------------------------- step 2 */

  function sendOtp(mobile, button) {
    setLoading(button, true, 'Sending…');
    return api('/otp/send', { credential: S.credential, mobile })
      .then((res) => {
        S.mobile = mobile;
        S.otpId = res.otp_id;
        $('ot-otp-number').textContent = formatMobile(mobile);
        clearOtp();
        showStep('otp');
        startResendTimer(res.resend_after_seconds || 80);
        listenForWebOtp();
        opts.log('One Tap: code sent');
      })
      .catch((e) => {
        if (e.message === 'already_linked') {
          login(); // linked meanwhile, e.g. another tab
          return;
        }
        const msg = messageFor(e);
        if (msg.fatal) fatal(e);
        else if (button === $('ot-send')) setFieldError('ot-mobile-field', 'ot-mobile-error', msg.text);
        else setOtpError(msg.text);
      })
      .then(() => { setLoading(button, false); });
  }

  function onMobileInput() {
    const input = $('ot-mobile');
    input.value = input.value.replace(/\D/g, '').slice(0, 10);
    setFieldError('ot-mobile-field', 'ot-mobile-error', '');
    $('ot-send').disabled = !isValidIndianMobile(input.value);
  }

  function onMobileSubmit(ev) {
    ev.preventDefault();
    const digits = $('ot-mobile').value;
    if (isValidIndianMobile(digits)) {
      sendOtp(`+91${digits}`, $('ot-send'));
    } else {
      setFieldError(
        'ot-mobile-field',
        'ot-mobile-error',
        'Enter a 10-digit mobile number starting with 6, 7, 8 or 9.',
      );
    }
  }

  /* --------------------------------------------------------- modal markup */

  const TEMPLATE = '<div class="ot-dialog" role="dialog" aria-modal="true" aria-labelledby="ot-title">'
    + '  <div class="ot-handle" aria-hidden="true"></div>'
    + '  <div class="ot-head" id="ot-head" hidden>'
    + '    <div class="ot-avatar" id="ot-avatar" aria-hidden="true"></div>'
    + '    <div class="ot-who"><div class="ot-name" id="ot-name"></div><div class="ot-email" id="ot-email"></div></div>'
    + '    <button class="ot-close" id="ot-close" type="button" aria-label="Close">&times;</button>'
    + '  </div>'
    + '  <section class="ot-step ot-center" data-step="busy" hidden>'
    + '    <div class="ot-spinner" aria-hidden="true"></div>'
    + '    <h2 id="ot-busy-title">Checking your account…</h2>'
    + '  </section>'
    + '  <section class="ot-step" data-step="mobile" hidden>'
    + '    <h2 id="ot-title">Add your mobile number</h2>'
    + '    <p class="ot-sub">We\'ll send a 6-digit code to confirm it. Oou only need to do this once.</p>'
    + '    <form id="ot-mobile-form" novalidate>'
    + '      <label class="ot-label" for="ot-mobile">Mobile number</label>'
    + '      <div class="ot-field" id="ot-mobile-field">'
    + '        <span class="ot-prefix">+91</span>'
    + '        <input class="ot-input" id="ot-mobile" type="tel" inputmode="numeric" autocomplete="tel-national"'
    + '               maxlength="10" placeholder="98765 48210" aria-describedby="ot-mobile-error">'
    + '      </div>'
    + '      <p class="ot-error" id="ot-mobile-error" role="alert"></p>'
    + '      <button class="ot-btn" id="ot-send" type="submit" disabled>Send code</button>'
    + '    </form>'
    + '  </section>'
    + '  <section class="ot-step" data-step="otp" hidden>'
    + '    <h2>Enter the code</h2>'
    + '    <p class="ot-sub">Sent by SMS to <strong id="ot-otp-number"></strong>. '
    + '      <button class="ot-link" id="ot-change" type="button">Change number</button></p>'
    + '    <form id="ot-otp-form" novalidate>'
    + '      <div class="ot-otp" id="ot-otp" role="group" aria-label="6-digit code" aria-describedby="ot-otp-error">'
    + '        <input inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="Digit 1">'
    + '        <input inputmode="numeric" maxlength="1" aria-label="Digit 2">'
    + '        <input inputmode="numeric" maxlength="1" aria-label="Digit 8">'
    + '        <input inputmode="numeric" maxlength="1" aria-label="Digit 4">'
    + '        <input inputmode="numeric" maxlength="1" aria-label="Digit 5">'
    + '        <input inputmode="numeric" maxlength="1" aria-label="Digit 6">'
    + '      </div>'
    + '      <p class="ot-error" id="ot-otp-error" role="alert"></p>'
    + '      <button class="ot-btn" id="ot-verify" type="submit" disabled>Verify</button>'
    + '    </form>'
    + '    <div class="ot-row"><span>Didn\'t get it?</span>'
    + '      <button class="ot-link" id="ot-resend" type="button" disabled>Resend code</button></div>'
    + '  </section>'
    + '  <section class="ot-step ot-center" data-step="error" hidden>'
    + '    <h2>Couldn\'t finish signing in</h2>'
    + '    <p class="ot-sub" id="ot-fatal-msg"></p>'
    + '    <button class="ot-btn" id="ot-retry" type="button">Start again</button>'
    + '  </section>'
    + '</div>';

  /** Builds the modal once. restart() runs when the user clicks "Start again". */
  function ensureModal(restart) {
    if (root) return;
    root = document.createElement('div');
    root.className = 'ot-backdrop';
    root.id = 'ot';
    root.hidden = true;
    root.innerHTML = TEMPLATE;
    document.body.appendChild(root);

    otpInputs = [...$('ot-otp').querySelectorAll('input')];
    wireOtpInputs();

    $('ot-mobile').addEventListener('input', onMobileInput);
    $('ot-mobile-form').addEventListener('submit', onMobileSubmit);
    $('ot-otp-form').addEventListener('submit', onOtpSubmit);
    $('ot-resend').addEventListener('click', () => { sendOtp(S.mobile, $('ot-resend')); });
    $('ot-change').addEventListener('click', () => {
      stopResendTimer();
      stopWebOtp();
      showStep('mobile');
    });
    $('ot-retry').addEventListener('click', () => {
      closeModal();
      // Fresh state/nonce/PKCE from keycloak-js, then ask Google again
      // eslint-disable-next-line no-console
      restart().catch((e) => { console.error('One Tap restart failed', e); });
    });
    $('ot-close').addEventListener('click', closeModal);
    root.addEventListener('click', (ev) => { if (ev.target === root) closeModal(); });
    document.addEventListener('keydown', (ev) => {
      if (root.hidden) return;
      if (ev.key === 'Escape') closeModal();
      if (ev.key === 'Tab') trapFocus(ev);
    });
  }

  /* ----------------------------------------------------------- keycloak-js */

  function prepareAuthRequest() {
    const redirectUri = opts.redirectUri || window.location.href.split('#')[0];
    // keycloak-js 22 returns a string, 26 returns a Promise; Promise.resolve handles both
    return Promise.resolve(keycloak.createLoginUrl({ redirectUri })).then((href) => {
      const url = new URL(href);
      S.authUrl = url.origin + url.pathname;
      S.authParams = {};
      url.searchParams.forEach((v, k) => { S.authParams[k] = v; });
      if (!S.authParams.nonce) {
        throw new Error('OneTap: keycloak-js did not add a nonce (useNonce must stay true)');
      }
    });
  }

  /* ---------------------------------------------------------------- step 1 */

  function onCredential(response) {
    S.credential = response.credential;
    S.proof = null;
    showProfile(decodeJwt(S.credential));
    openModal();
    busy('Checking your account…');
    opts.log('One Tap: Google account selected');
    api('/status', { credential: S.credential })
      .then((res) => {
        if (res.status === 'linked') {
          opts.log('One Tap: account linked, signing in');
          login();
        } else {
          opts.log('One Tap: mobile number needed');
          showStep('mobile');
        }
      })
      .catch(fatal);
  }

  /* ------------------------------------------------------------------ public */

  function start(kc, options) {
    keycloak = kc;
    opts = { ...DEFAULTS, ...options };
    if (!opts.googleClientId) return Promise.reject(new Error('OneTap: googleClientId is required'));
    const authServerUrl = String(kc.authServerUrl).replace(/\/+$/, '');
    apiBase = `${authServerUrl}/realms/${encodeURIComponent(kc.realm)}/onetap`;

    ensureModal(() => start(keycloak, opts));
    return ensureGoogle()
      .then(prepareAuthRequest)
      .then(() => {
        google.accounts.id.initialize({
          client_id: opts.googleClientId,
          nonce: S.authParams.nonce, // same nonce keycloak-js put in the auth request
          callback: onCredential,
          auto_select: !!opts.autoSelect,
          use_fedcm_for_prompt: true,
          itp_support: true,
          cancel_on_tap_outside: false,
          context: 'signin',
        });
        google.accounts.id.prompt((n) => {
          if (n.isNotDisplayed()) opts.log(`One Tap not shown: ${n.getNotDisplayedReason()}`);
          else if (n.isSkippedMoment()) opts.log(`One Tap skipped: ${n.getSkippedReason()}`);
          else if (n.isDismissedMoment()) opts.log(`One Tap dismissed: ${n.getDismissedReason()}`);
          else opts.log('One Tap: prompt displayed');
        });
        opts.log('One Tap: prompt requested');
      });
  }

  /** Call right before keycloak.logout(), so Google doesn't sign the user straight back in. */
  function beforeLogout() {
    try {
      if (window.google?.accounts?.id) {
        google.accounts.id.disableAutoSelect();
        google.accounts.id.cancel();
      }
    } catch { /* logout anyway */ }
  }

  /** Hide all One Tap UI (prompt and modal): user chose Login, or is now signed in. */
  function cancel() {
    try {
      if (window.google?.accounts?.id) google.accounts.id.cancel();
    } catch { /* nothing to cancel */ }
    if (root && !root.hidden) closeModal();
  }

  window.OneTap = { start, beforeLogout, cancel };
})();
