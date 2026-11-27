import { el } from '../../scripts/store-locator.js';

/**
 * store-finder "Share > Message": the source's mobile-number dialog
 * (#ShareStoreWithNumberModal). The visitor enters a mobile number and the
 * store's details are sent to it by SMS through the source's service
 * (smsService.json: the message, and the message and number AES-encrypted
 * with the site's AesUtil passphrase, as the source does). The dialog closes
 * on submit, as on the source.
 */

// validation, as the source's form validation ("required phone")
const PHONE = /^\d{10}$/;

/**
 * @param {HTMLElement} host where the dialog lives (inside the block, so the block's zoom applies)
 * @param {object} cfg
 * @param {object} cfg.labels title, text, mobile, submit, required, invalid, close, success
 * @param {string} cfg.endpoint the SMS service
 * @param {(text: string) => void} cfg.announce tells screen readers the result
 * @returns {(message: string, opener: HTMLElement) => void} opens the dialog for one
 *   store's message
 */
export default function createShareDialog(host, { labels, endpoint, announce }) {
  const form = el('form', 'store-finder-sms-form', { novalidate: '', autocomplete: 'off' });
  const title = el('h2', 'store-finder-sms-title', { id: `${host.id || 'store-finder'}-sms-title` });
  title.textContent = labels.title;
  const text = el('p', 'store-finder-sms-text');
  text.textContent = labels.text;

  const field = el('div', 'store-finder-sms-field');
  const inputId = `${title.id}-mobile`;
  const label = el('label', 'store-finder-sms-label', { for: inputId });
  label.append(document.createTextNode(labels.mobile), el('span', 'store-finder-sms-required', { 'aria-hidden': 'true' }));
  label.lastChild.textContent = '*';
  const input = el('input', 'store-finder-sms-input', {
    id: inputId, name: 'C_MOBILE_NUMBER', type: 'tel', inputmode: 'numeric', autocomplete: 'off', required: '',
  });
  const message = el('div', 'store-finder-sms-message', { id: `${inputId}-message`, role: 'status', 'aria-live': 'polite' });
  field.append(label, input, message);

  const submit = el('button', 'store-finder-sms-submit', { type: 'submit' });
  submit.textContent = labels.submit;
  form.append(text, field, submit);

  const close = el('button', 'store-finder-sms-close', { type: 'button', 'aria-label': labels.close });
  const header = el('div', 'store-finder-sms-header');
  header.append(close);
  const body = el('div', 'store-finder-sms-body');
  body.append(title, form);
  const content = el('div', 'store-finder-sms-content');
  content.append(header, body);
  const dialog = el('dialog', 'store-finder-sms', { 'aria-labelledby': title.id });
  dialog.append(content);
  host.append(dialog);

  let pending = '';
  let opener = null;

  // the source validates a field when it loses focus and again on submit
  const check = () => {
    const value = input.value.trim();
    let error = '';
    if (!value) error = labels.required;
    else if (!PHONE.test(value)) error = labels.invalid;
    message.textContent = error;
    field.classList.toggle('has-error', !!error);
    if (error) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    input.setAttribute('aria-describedby', message.id);
    return !error;
  };
  input.addEventListener('blur', check);
  input.addEventListener('input', () => { if (field.classList.contains('has-error')) check(); });

  const closeDialog = () => {
    if (dialog.open) dialog.close();
  };
  close.addEventListener('click', closeDialog);
  // a click on the dimmed area (the dialog box itself, outside its content) closes it
  dialog.addEventListener('click', (e) => { if (e.target === dialog) closeDialog(); });
  dialog.addEventListener('close', () => {
    form.reset();
    message.textContent = '';
    field.classList.remove('has-error');
    input.removeAttribute('aria-invalid');
    opener?.focus();
  });

  // the source's AesUtil.ltyEncrypt is shared with the colour quiz
  const send = async (mobile, sms) => {
    try {
      const { ltyEncrypt } = await import('../colour-quiz/lead-api.js');
      const body2 = new URLSearchParams({
        smsId: sms,
        smsValue: await ltyEncrypt(sms),
        mobile: await ltyEncrypt(mobile),
      });
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: body2,
      });
      const json = resp.ok ? await resp.json() : null;
      if (json?.status) announce(labels.success);
    } catch (e) { /* the source ignores a failed send */ }
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!check()) { input.focus(); return; }
    const mobile = input.value.trim();
    const sms = pending;
    closeDialog();
    send(mobile, sms);
  });

  return (sms, from) => {
    pending = sms;
    opener = from;
    dialog.showModal();
    input.focus();
  };
}
