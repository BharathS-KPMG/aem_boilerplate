/* Authoring reference: blocks, pages, previews. Reads blocks.json and the site's own content. */
/* ---- Blocks: inventory from blocks.json, usage from site content, live previews ---- */
(() => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const SKIP = new Set(['section-metadata', 'metadata']);
  const state = {
    blocks: [], byPage: [], usage: new Map(), pages: 0, filter: 'all', scanned: false,
  };
  const open = new Set();
  // token of the block shown in the preview drawer (null while it is closed)
  let cur = null;

  async function getJSON(url) {
    // revalidate every time: a cached blocks.json would hide a block or variant that was just added
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${url} ${r.status}`);
    return r.json();
  }

  /* ---------- usage scan ---------- */
  function parseBlocks(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const found = [];
    [...doc.body.children].forEach((section) => {
      [...section.children].forEach((c) => {
        if (c.tagName !== 'DIV' || !c.className.trim()) return;
        const [name, ...variants] = c.className.trim().split(/\s+/);
        if (!SKIP.has(name)) found.push([name, variants]);
      });
    });
    return found;
  }

  // eslint-disable-next-line no-bitwise -- >>> 0 keeps the hash an unsigned 32-bit integer
  const hash = (s) => [...s].reduce((h, ch) => ((h * 31) + ch.charCodeAt(0)) >>> 0, 7);

  async function listPages() {
    let all = [];
    let offset = 0;
    let total = 1;
    while (offset < total) {
      // eslint-disable-next-line no-await-in-loop
      const j = await getJSON(`/query-index.json?limit=500&offset=${offset}`);
      all = all.concat(j.data);
      total = j.total;
      offset += j.data.length || total;
    }
    return all.filter((p) => !p.path.endsWith('.json'));
  }

  async function scan() {
    const pages = await listPages();
    const sig = hash(pages.map((p) => `${p.path}${p.lastModified}`).join('|'));
    const key = `apref-usage-v1:${window.location.origin}`;
    let items;
    try {
      const c = JSON.parse(sessionStorage.getItem(key));
      if (c && c.sig === sig) items = c.items;
    } catch (e) { /* no cache */ }
    if (!items) {
      items = [];
      let i = 0;
      let done = 0;
      const worker = async () => {
        while (i < pages.length) {
          const p = pages[i]; i += 1;
          try {
            // eslint-disable-next-line no-await-in-loop
            const r = await fetch(`${p.path === '/' ? '/index' : p.path}.plain.html`);
            // eslint-disable-next-line no-await-in-loop
            if (r.ok) items.push([p.path, parseBlocks(await r.text())]);
          } catch (e) { /* skip page */ }
          done += 1;
          $('bstatus').textContent = `Scanning pages ${done} of ${pages.length}...`;
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
      items.sort((a, b) => a[0].localeCompare(b[0]));
      try {
        sessionStorage.setItem(key, JSON.stringify({ sig, items }));
      } catch (e) { /* ignore */ }
    }
    state.pages = pages.length;
    state.byPage = items;
    state.usage = new Map();
    items.forEach(([path, blocks]) => {
      const nth = {};
      blocks.forEach(([name, variants]) => {
        nth[name] = (nth[name] || 0) + 1;
        if (!state.usage.has(name)) state.usage.set(name, []);
        state.usage.get(name).push({ path, variants, nth: nth[name] - 1 });
      });
    });
    state.scanned = true;
  }

  /* ---------- content model (what an author builds in DA) ---------- */
  function daBase() {
    // <ref>--<site>--<org>.aem.page|live  ->  da.live/edit#/<org>/<site>
    const m = window.location.hostname.match(/^(?:[^.]+--)?([^.]+)--([^.]+)\.aem\.(?:page|live)$/);
    return m ? { org: m[2], site: m[1] } : { org: 'aemedsap', site: 'edspoc-stg' };
  }

  function daLink(path) {
    const { org, site } = daBase();
    const p = path === '/' ? '/index' : path.replace(/\.html$/, '');
    return `https://da.live/edit#/${org}/${site}${p}`;
  }

  const modelCache = new Map();

  async function loadModel(use, block) {
    const key = `${use.path}|${block}|${use.nth}`;
    if (modelCache.has(key)) return modelCache.get(key);
    const r = await fetch(`${use.path === '/' ? '/index' : use.path}.plain.html`);
    if (!r.ok) throw new Error(`${use.path} ${r.status}`);
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    const hits = [...doc.body.querySelectorAll(':scope > div > div')]
      .filter((d) => d.className.trim().split(/\s+/)[0] === block);
    const node = hits[use.nth];
    if (!node) throw new Error('Block not found on that page');
    const abs = (u) => {
      try { return new URL(u, window.location.origin).href; } catch (e) { return u; }
    };
    const rows = [...node.children].map((row) => [...row.children].map((cell) => {
      cell.querySelectorAll('img').forEach((i) => { i.setAttribute('src', abs(i.getAttribute('src'))); i.removeAttribute('srcset'); i.removeAttribute('loading'); });
      cell.querySelectorAll('picture').forEach((p) => { const i = p.querySelector('img'); if (i) p.replaceWith(i); });
      cell.querySelectorAll('a[href]').forEach((a) => a.setAttribute('href', abs(a.getAttribute('href'))));
      return cell.innerHTML.trim();
    }));
    const model = { name: block, variants: node.className.trim().split(/\s+/).slice(1), rows };
    modelCache.set(key, model);
    return model;
  }

  const textOf = (html) => {
    const d = document.createElement('div');
    d.innerHTML = html;
    d.querySelectorAll('img').forEach((i) => i.replaceWith(`[image: ${decodeURIComponent((i.getAttribute('src') || '').split('?')[0].split('/').pop())}]`));
    return d.textContent.replace(/\s+/g, ' ').trim();
  };

  // header row + rows, as a DA block table. skeleton=true swaps the content for labels.
  function modelTable(m, skeleton) {
    const cols = Math.max(1, ...m.rows.map((r) => r.length));
    const t = document.createElement('table');
    const head = t.createTHead().insertRow();
    const th = document.createElement('th');
    th.colSpan = cols;
    th.textContent = m.variants.length ? `${m.name} (${m.variants.join(', ')})` : m.name;
    head.append(th);
    const tb = t.createTBody();
    m.rows.forEach((r, ri) => {
      const tr = tb.insertRow();
      // a row with one cell spans every column, as DA shows it
      const span = r.length === 1 && cols > 1;
      for (let ci = 0; ci < (span ? 1 : cols); ci += 1) {
        const td = tr.insertCell();
        if (span) td.colSpan = cols;
        if (ci >= r.length) td.textContent = '';
        else if (skeleton) td.textContent = `Row ${ri + 1}, col ${ci + 1}`;
        else td.innerHTML = r[ci];
      }
    });
    return t;
  }

  async function copy(html, text, btn) {
    const old = btn.textContent;
    try {
      if (window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        })]);
      } else await navigator.clipboard.writeText(text);
      btn.textContent = 'Copied';
    } catch (e) { btn.textContent = 'Copy blocked'; }
    setTimeout(() => { btn.textContent = old; }, 1600);
  }

  async function renderModel(body, use, block, token) {
    body.replaceChildren(el('p', 'sub', 'Reading the block from the page...'));
    let m;
    try { m = await loadModel(use, block); } catch (e) { body.replaceChildren(el('p', 'sub', `Could not read the block: ${e.message}`)); return; }
    if (cur !== token) return;
    let skeleton = false;
    const bar = el('div', 'mbar');
    const view = el('div', 'tw model');
    const note = el('p', 'desc');
    const draw = () => {
      view.replaceChildren(modelTable(m, skeleton));
      note.textContent = skeleton
        ? 'Empty structure: the same rows and columns, with a label in each cell.'
        : `Real content from ${use.path}. Replace it with your own.`;
    };
    const mkTab = (label, sk) => {
      const b = el('button', 'btn', label);
      b.type = 'button';
      b.disabled = skeleton === sk;
      b.addEventListener('click', () => { skeleton = sk; bar.querySelectorAll('.t').forEach((x) => { x.disabled = (x.dataset.sk === '1') === skeleton; }); draw(); });
      b.classList.add('t');
      b.dataset.sk = sk ? '1' : '0';
      return b;
    };
    bar.append(mkTab('With content', false), mkTab('Empty structure', true));
    const cp = el('button', 'btn pri', 'Copy for DA');
    cp.type = 'button';
    cp.title = 'Copies the table. In DA, click into the page and paste.';
    cp.addEventListener('click', () => {
      const t = modelTable(m, skeleton);
      const text = [...t.rows].map((r) => [...r.cells].map((c) => textOf(c.innerHTML)).join('\t')).join('\n');
      copy(`<table>${t.innerHTML}</table>`, text, cp);
    });
    const ct = el('button', 'btn', 'Copy as text');
    ct.type = 'button';
    ct.addEventListener('click', () => {
      const t = modelTable(m, skeleton);
      const lines = [...t.rows].map((r) => `| ${[...r.cells].map((c) => textOf(c.innerHTML).replace(/\|/g, '\\|')).join(' | ')} |`);
      const txt = lines.join('\n');
      copy(`<pre>${txt.replace(/</g, '&lt;')}</pre>`, txt, ct);
    });
    const da = el('a', 'btn', 'Open page in DA');
    da.href = daLink(use.path);
    da.target = '_blank';
    da.rel = 'noopener';
    const sp = el('span', 'sp');
    sp.append(cp, ct, da);
    bar.append(sp);
    body.replaceChildren(bar, note, view);
    body.append(el('p', 'sub', 'In DA: open your page, put the cursor where the block goes, then paste. DA turns the table into the block. The first row is the block name, with the variants in brackets.'));
    draw();
  }

  /* ---------- preview drawer (slides in from the right) ---------- */
  const drawer = $('drawer');
  const scrim = $('scrim');
  let lastFocus = null;

  function closePanel() {
    drawer.classList.remove('on');
    scrim.classList.remove('on');
    drawer.setAttribute('aria-hidden', 'true');
    $('dbody').replaceChildren();
    cur = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function openPanel(block, idx, mode, zoom) {
    const uses = state.usage.get(block) || [];
    const use = uses[idx];
    if (!use) return;
    if (!cur) lastFocus = document.activeElement;
    const token = {
      block, idx, mode, zoom,
    };
    cur = token;
    $('dt').textContent = block;
    $('dm').textContent = `${use.path} · instance ${use.nth + 1} · variants: ${use.variants.length ? use.variants.join(', ') : 'none'}`;

    const ctl = $('dctl');
    ctl.replaceChildren();
    const mk = (label, active, fn) => {
      const b = el('button', 'btn', label);
      b.type = 'button';
      b.disabled = active;
      b.addEventListener('click', fn);
      ctl.append(b);
    };
    mk('Content model', mode === 'model', () => openPanel(block, idx, 'model', 'fit'));
    mk('Desktop fit', mode === 'desktop' && zoom === 'fit', () => openPanel(block, idx, 'desktop', 'fit'));
    mk('Desktop 100%', mode === 'desktop' && zoom === 'full', () => openPanel(block, idx, 'desktop', 'full'));
    mk('Mobile 390', mode === 'mobile', () => openPanel(block, idx, 'mobile', 'full'));
    const sp = el('span', 'sp');
    if (uses.length > 1) {
      const prev = el('button', 'btn', '‹');
      prev.type = 'button';
      prev.setAttribute('aria-label', 'Previous instance');
      prev.addEventListener('click', () => openPanel(block, (idx + uses.length - 1) % uses.length, mode, zoom));
      const next = el('button', 'btn', '›');
      next.type = 'button';
      next.setAttribute('aria-label', 'Next instance');
      next.addEventListener('click', () => openPanel(block, (idx + 1) % uses.length, mode, zoom));
      sp.append(prev, el('span', 'tag', `${idx + 1} of ${uses.length}`), next);
    }
    const openLink = el('a', 'btn', 'Open page');
    openLink.href = use.path;
    openLink.target = '_blank';
    openLink.rel = 'noopener';
    sp.append(openLink);
    ctl.append(sp);

    drawer.classList.add('on');
    scrim.classList.add('on');
    drawer.setAttribute('aria-hidden', 'false');
    if (!lastFocus || !drawer.contains(document.activeElement)) $('dx').focus();

    const body = $('dbody');
    body.replaceChildren();
    if (mode === 'model') { renderModel(body, use, block, token); return; }
    const frame = el('div', 'frame');
    const stage = el('div', 'stage');
    frame.append(stage);
    body.append(frame);
    const width = mode === 'mobile' ? 390 : 1440;
    const avail = (frame.clientWidth || 600) - 22;
    const scale = mode === 'desktop' && zoom === 'fit' ? Math.min(1, avail / width) : 1;
    stage.style.width = `${width * scale}px`;
    stage.style.height = '80px';
    stage.append(el('p', 'sub', 'Loading preview...'));

    const f = document.createElement('iframe');
    f.title = `Preview of ${block}`;
    f.style.width = `${width}px`;
    f.style.height = '900px';
    f.style.transform = `scale(${scale})`;
    f.addEventListener('load', async () => {
      const doc = f.contentDocument;
      const pick = () => doc.querySelectorAll(`main .${CSS.escape(block)}`)[use.nth];
      let node = pick();
      for (let t = 0; t < 30 && (!node || node.dataset.blockStatus !== 'loaded'); t += 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => { setTimeout(r, 300); });
        if (cur !== token) return;
        node = pick();
      }
      if (cur !== token) return;
      if (!node) { stage.textContent = 'Block not found on that page.'; return; }
      const place = () => {
        if (cur !== token) return;
        // A block with no visible height of its own (a hidden or empty breadcrumb, say)
        // would be cropped to a sliver, so show the section that holds it instead.
        const own = node.getBoundingClientRect();
        const box = own.height >= 24 ? node : (node.closest('.section') || node.parentElement || node);
        if (box !== node && !frame.querySelector('.hint')) {
          frame.prepend(el('p', 'sub hint', 'This block has no visible height of its own on this page, so its whole section is shown.'));
        }
        const q = box.getBoundingClientRect();
        const top = q.top + f.contentWindow.scrollY;
        // fill the drawer: the block sits at the top and the page continues below it,
        // so a short or still-loading block is never shown as a thin strip
        const fill = Math.max(240, body.clientHeight - 24);
        f.style.height = `${Math.max(900, Math.ceil(top + q.height + 60), Math.ceil(top + fill / scale + 20))}px`;
        stage.style.height = `${Math.max(40, q.height * scale, fill)}px`;
        // highlight the block itself (dashed when only its section could be measured)
        let hl = stage.querySelector('.hl');
        if (!hl) { hl = el('div', 'hl'); hl.append(el('span', '', block)); stage.append(hl); }
        hl.classList.toggle('sec', box !== node);
        hl.style.height = `${Math.max(8, q.height * scale)}px`;
        f.style.top = `${-top * scale}px`;
      };
      place();
      // The block keeps growing after it loads (images, accordions, fonts), so keep
      // re-measuring: on any size change of the block, and on a short timer as a fallback.
      if (f.contentWindow.ResizeObserver) {
        let n = 0;
        const ro = new f.contentWindow.ResizeObserver(() => {
          n += 1; // cap, in case the block's height depends on the frame height
          if (n > 30) ro.disconnect(); else place();
        });
        ro.observe(node);
        ro.observe(doc.body);
      }
      for (let t = 0; t < 16 && cur === token; t += 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => { setTimeout(r, 500); });
        place();
      }
    });
    f.src = use.path;
    stage.replaceChildren(f);
  }

  $('dx').addEventListener('click', closePanel);
  scrim.addEventListener('click', closePanel);
  document.addEventListener('keydown', (e) => {
    if (!cur) return;
    if (e.key === 'Escape') { closePanel(); return; }
    if (e.key !== 'Tab') return;
    const f = [...drawer.querySelectorAll('button:not(:disabled), a[href]')];
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  /* ---------- render ---------- */
  function fillBody(det, b) {
    const body = det.querySelector('.body');
    if (body.dataset.ready) return;
    body.dataset.ready = '1';
    const uses = state.usage.get(b.name) || [];
    const seen = new Set(uses.flatMap((u) => u.variants));
    if (b.description) body.append(el('p', 'desc', b.description));
    const vars = el('div', 'vars');
    const firstWith = (name) => uses.findIndex((u) => u.variants.includes(name));
    const wire = (c, name) => {
      const i = firstWith(name);
      if (i < 0) return;
      c.tabIndex = 0;
      c.setAttribute('role', 'button');
      const go = () => openPanel(b.name, i, 'desktop', 'fit');
      c.addEventListener('click', go);
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    };
    b.variants.forEach((v) => {
      const c = el('code', `var${seen.has(v.name) ? ' seen' : ''}`, v.name);
      c.title = `${v.css ? 'CSS' : ''}${v.css && v.js ? ' + ' : ''}${v.js ? 'JS' : ''}${seen.has(v.name) ? ' · used on a page, click to preview' : ''}`;
      wire(c, v.name);
      vars.append(c);
    });
    const known = new Set(b.variants.map((v) => v.name));
    [...seen].filter((v) => !known.has(v)).forEach((v) => {
      const c = el('code', 'var seen', v);
      c.title = 'Used on a page, not found as a variant in code. Click to preview';
      wire(c, v);
      vars.append(c);
    });
    body.append(el('b', '', `Variants (${vars.children.length})`));
    body.append(vars.children.length ? vars : el('p', 'desc', 'No variants. Use the block name on its own.'));
    if (!uses.length) {
      body.append(el('p', 'desc', state.scanned ? 'Not used on any page.' : 'Page usage is not available.'));
      return;
    }
    body.append(el('b', '', `Used on ${new Set(uses.map((u) => u.path)).size} page(s), ${uses.length} instance(s)`));
    const wrap = el('div', 'tw');
    wrap.style.maxHeight = '320px';
    const t = el('table', 'pg');
    t.innerHTML = '<thead><tr><th>Page</th><th>#</th><th>Variants on that page</th><th></th></tr></thead>';
    const tb = el('tbody');
    uses.forEach((u) => {
      const tr = el('tr');
      const td = el('td');
      const a = el('a', '', u.path);
      a.href = u.path;
      a.target = '_blank';
      a.rel = 'noopener';
      td.append(a);
      const tv = el('td', '', u.variants.length ? u.variants.join(', ') : 'none');
      const act = el('td');
      const bt = el('button', 'btn', 'Preview');
      bt.type = 'button';
      bt.addEventListener('click', () => openPanel(b.name, uses.indexOf(u), 'desktop', 'fit'));
      act.append(bt);
      tr.append(td, el('td', '', String(u.nth + 1)), tv, act);
      tb.append(tr);
    });
    t.append(tb);
    wrap.append(t);
    const real = uses.findIndex((u) => !/^\/(nav|footer|eds|d-testing)\b/.test(u.path));
    const go = el('button', 'btn pri', 'Preview this block');
    go.type = 'button';
    go.addEventListener('click', () => openPanel(b.name, real < 0 ? 0 : real, 'desktop', 'fit'));
    const cm = el('button', 'btn', 'Content model');
    cm.type = 'button';
    cm.title = 'See and copy the table an author builds in DA';
    cm.addEventListener('click', () => openPanel(b.name, real < 0 ? 0 : real, 'model', 'fit'));
    body.append(go, cm, wrap);
  }

  function render() {
    const list = $('bl');
    list.replaceChildren();
    state.blocks.forEach((b) => {
      const uses = state.usage.get(b.name) || [];
      const det = el('details', 'blk');
      det.dataset.name = b.name;
      det.dataset.used = uses.length ? '1' : '0';
      det.dataset.vars = b.variants.length ? '1' : '0';
      det.dataset.text = `${b.name} ${b.description} ${b.variants.map((v) => v.name).join(' ')}`.toLowerCase();
      const sum = el('summary');
      sum.append(el('span', 'nm', b.name));
      const meta = el('span', 'meta');
      meta.append(el('span', 'tag', `${b.variants.length} variant${b.variants.length === 1 ? '' : 's'}`));
      const pages = new Set(uses.map((u) => u.path)).size;
      let pagesLabel = '...';
      if (state.scanned) {
        pagesLabel = pages ? `${pages} page${pages === 1 ? '' : 's'}` : 'not on any page';
      }
      meta.append(el('span', 'tag', pagesLabel));
      sum.append(meta);
      det.append(sum, el('div', 'body'));
      det.addEventListener('toggle', () => {
        if (det.open) { open.add(b.name); fillBody(det, b); } else open.delete(b.name);
      });
      if (open.has(b.name)) { det.open = true; fillBody(det, b); }
      list.append(det);
    });
    $('n-blocks').textContent = state.blocks.length;
    {
      const LIMIT = 100;
      const total = state.blocks.length;
      const g = $('bgrow');
      const lines = [
        'The block shelf is getting crowded. Before building another, see if an existing block or a new variant already does the job.',
        'Block count keeps climbing. Reuse a block, add a variant, or retire one. Your future self (and the bundle size) will say thanks.',
        'Fewer, smarter blocks beat a shelf of near-duplicates. Reuse first, build second.',
      ];
      if (total >= LIMIT) {
        const pct = Math.min(100, Math.round((total / (LIMIT * 1.5)) * 100));
        g.innerHTML = `<span class="ic" aria-hidden="true">\uD83D\uDCE6</span><div class="tx"><p class="hd">Block count is rising <em>${total} / ${LIMIT} watch line</em></p><p class="ms"></p><div class="mt" aria-hidden="true"><i style="width:${pct}%"></i></div></div>`;
        g.querySelector('.ms').textContent = lines[total % lines.length];
        g.hidden = false;
      } else { g.hidden = true; }
    }
    $('n-variants').textContent = state.blocks.reduce((n, b) => n + b.variants.length, 0);
    $('n-used').textContent = state.scanned ? state.blocks.filter((b) => state.usage.has(b.name)).length : '–';
    $('n-pages').textContent = state.scanned ? state.pages : '–';
    // eslint-disable-next-line no-use-before-define -- hoisted function declaration below
    applyFilter();
  }

  function applyFilter() {
    const q = ($('q').value || '').trim().toLowerCase();
    $('bl').querySelectorAll('.blk').forEach((d) => {
      const f = state.filter;
      const ok = (f === 'all')
        || (f === 'used' && d.dataset.used === '1')
        || (f === 'unused' && d.dataset.used === '0')
        || (f === 'variants' && d.dataset.vars === '1');
      d.hidden = !(ok && (!q || d.dataset.text.includes(q)));
    });
  }

  document.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c));
    state.filter = c.dataset.f;
    applyFilter();
  }));
  $('q').addEventListener('input', applyFilter);

  /* ---------- pages view: blocks used on each page ---------- */
  function renderPages() {
    const list = $('pglist');
    if (!state.scanned) { $('pgstatus').textContent = 'Page usage could not be read.'; return; }
    const q = $('pgq').value.trim().toLowerCase();
    const rows = state.byPage.map(([path, blocks]) => {
      const tally = new Map();
      blocks.forEach(([name, variants]) => {
        if (!tally.has(name)) tally.set(name, { n: 0, v: new Set() });
        const t = tally.get(name); t.n += 1; variants.forEach((x) => t.v.add(x));
      });
      return { path, total: blocks.length, tally };
    });
    const withBlocks = rows.filter((r) => r.total);
    $('pg-n').textContent = rows.length;
    $('pg-avg').textContent = rows.length ? (rows.reduce((a, r) => a + r.total, 0) / rows.length).toFixed(1) : '0';
    $('pg-max').textContent = Math.max(0, ...rows.map((r) => r.total));
    const sort = $('pgs').value;
    const matches = (r) => !q || r.path.toLowerCase().includes(q)
      || [...r.tally.keys()].some((k) => k.includes(q));
    const byOrder = (a, b) => {
      if (sort === 'path') return a.path.localeCompare(b.path);
      if (sort === 'fewest') return a.total - b.total || a.path.localeCompare(b.path);
      return b.total - a.total || a.path.localeCompare(b.path);
    };
    const out = rows.filter(matches).sort(byOrder);
    list.textContent = '';
    out.forEach((r) => {
      const d = el('details', 'pg');
      const sm = el('summary');
      sm.append(
        el('span', 'pth', r.path),
        el('span', 'cnt', `${r.total} block${r.total === 1 ? '' : 's'}`),
        el('span', 'cnt u', `${r.tally.size} unique`),
      );
      const body = el('div', 'pgb');
      const ul = el('ul');
      const byCount = (a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]);
      [...r.tally].sort(byCount).forEach(([name, t]) => {
        const li = el('li');
        li.append(el('b', '', name));
        if (t.n > 1) li.append(el('small', '', `\u00D7${t.n}`));
        if (t.v.size) li.append(el('small', '', `(${[...t.v].join(', ')})`));
        ul.append(li);
      });
      body.append(ul);
      const { org, site } = daBase();
      const openLink = el('a', '', 'Open page');
      openLink.href = r.path; openLink.target = '_blank'; openLink.rel = 'noopener';
      const da = el('a', '', 'Edit in DA');
      da.href = `https://da.live/edit#/${org}/${site}${r.path === '/' ? '/index' : r.path}`; da.target = '_blank'; da.rel = 'noopener';
      body.append(openLink, da);
      d.append(sm, body);
      list.append(d);
    });
    $('pgstatus').textContent = `Showing ${out.length} of ${rows.length} pages. ${withBlocks.length} contain blocks.`;
  }
  $('pgq').addEventListener('input', renderPages);
  $('pgs').addEventListener('change', renderPages);

  (async () => {
    try {
      const inv = await getJSON('blocks.json');
      state.blocks = inv.blocks;
      render();
    } catch (e) {
      $('bstatus').textContent = 'Could not load blocks.json. Run npm run reference:build and commit the file.';
      return;
    }
    try {
      await scan();
      $('bstatus').textContent = `Usage read from ${state.pages} pages on this site.`;
      const known = new Set(state.blocks.map((b) => b.name));
      const missing = [...state.usage.keys()].filter((n) => !known.has(n));
      if (missing.length) {
        const n = $('bnew');
        n.hidden = false;
        n.textContent = `Used on pages but no matching block in blocks.json: ${missing.join(', ')}. Each is a typo or alias in the page, or a new block. For a new block run npm run reference:build.`;
      }
    } catch (e) {
      $('bstatus').textContent = 'Page usage could not be read (query-index.json unavailable).';
    }
    render();
    renderPages();
  })();
})();
