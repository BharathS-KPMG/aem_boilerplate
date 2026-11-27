/* Click a class name to copy it, and filter the reference tables. */
const t = document.getElementById('t');
function toast(m) { t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 1100); }
document.addEventListener('click', (e) => {
  const k = e.target.closest('code.k'); if (!k) return;
  const v = k.textContent;
  const done = () => toast(`Copied ${v}`);
  if (navigator.clipboard) navigator.clipboard.writeText(v).then(done, () => { const r = document.createRange(); r.selectNodeContents(k); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast(`Selected ${v}`); });
});
document.getElementById('q').addEventListener('input', (e) => {
  const v = e.target.value.trim().toLowerCase();
  document.querySelectorAll('table.ref tbody tr').forEach((r) => { r.hidden = v && !r.textContent.toLowerCase().includes(v); });
});
