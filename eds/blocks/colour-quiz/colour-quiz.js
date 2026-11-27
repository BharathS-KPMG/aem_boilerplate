import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  readLeadRow, emptyLead, leadSubmitted, buildLeadForm, recordAnswer, quizRequest, completeLead,
} from './lead-form.js';
import { fetchRecommendations, track } from './lead-api.js';

/**
 * colour-quiz — step-by-step colour quiz with branching questions; results
 * come from the source's recommendation API, or from an authored
 * spreadsheet (DA sheet served as JSON) when the API is not reachable.
 *
 * Authoring model: see README.md. Label | value rows (FIELDS) for the
 * single-value fields, then four repeating sections, each a header row + one
 * row per item (SECTIONS): questions, options (linked to their question by
 * id), form fields and form choices. Results sheet: one column per question id
 * (blank or `*` = any) plus shade / texture columns (see results.js
 * fromSheet); the most specific matching row wins.
 *
 * Tables authored earlier with keyword rows are still read:
 *   background | mobile image | desktop image
 *   results    | link to results sheet (.json) | heading | restart label
 *   question   | id | step label | display text (optional) | show if | flags
 *   option     | label | image(s) | value (optional, defaults to label)
 *   form / field / choice / consent  (lead form, see lead-form.js)
 *   config     | key | value   (endpoints, lead and PDF settings, labels)
 */

const text = (el) => (el?.textContent || '').trim();
const norm = (s) => String(s || '').trim().toLowerCase();
const key = (s) => norm(s).replace(/[^a-z0-9]/g, '');

// accessible names of icon-only / number-only controls (authorable, see FIELDS)
const A11Y = {
  'preview label': 'Preview {option} image',
  'close preview label': 'Close preview',
  'previous image label': 'Previous image',
  'next image label': 'Next image',
  'change step label': 'Change step {step}, {question} (answered {answer})',
};
const fill = (pattern, values) => pattern.replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));

let uid = 0;

const DESKTOP_MEDIA = '(min-width: 992px)';

/**
 * Preview picture: mobile image for small screens plus desktop <source>s at
 * >= 992px when a desktop image is authored; otherwise one image for all sizes.
 */
function buildZoomPicture(mobile, desktop, alt) {
  const pic = createOptimizedPicture(mobile.src, alt, true, desktop
    ? [{ width: '750' }]
    : [{ media: '(min-width: 600px)', width: '2000' }, { width: '750' }]);
  if (desktop) {
    const desk = createOptimizedPicture(desktop.src, alt, true, [{ width: '2000' }]);
    [...desk.querySelectorAll('source')].reverse().forEach((source) => {
      source.setAttribute('media', DESKTOP_MEDIA);
      pic.prepend(source);
    });
  }
  return pic;
}

/** URL of an optimized rendition of an authored image. */
function bgSrc(img, width) {
  const url = new URL(img.src, window.location.href);
  return `${url.origin}${url.pathname}?width=${width}&format=webply&optimize=medium`;
}

/**
 * The panel artwork is a CSS background and the page's LCP image: preload it
 * (for the matching viewport only) so the download starts when the block is
 * decorated, not when its background style is first applied.
 */
function preloadArtwork(href, media) {
  if (document.head.querySelector(`link[rel="preload"][href="${href}"]`)) return;
  const link = document.createElement('link');
  Object.assign(link, {
    rel: 'preload', as: 'image', href, media, fetchPriority: 'high',
  });
  document.head.append(link);
}

function parseCondition(raw) {
  return raw.split(';').map((part) => part.split('=').map((s) => norm(s))).filter(([k, v]) => k && v);
}

// label | value rows (lower-cased label -> field). `setting:` fields are read
// through config.settings under the given key; any other label is kept as a
// setting under its own name.
const FIELDS = {
  'background (mobile)': 'bgMobile',
  'background (desktop)': 'bgDesktop',
  'results sheet': 'results',
  'results heading': 'heading',
  'restart button label': 'restart',
  'form step label': 'formLabel',
  'form submit label': 'formSubmit',
  'returning visitor label': 'formReturning',
  consent: 'consent',
  'download button label': 'setting:download label',
  'share link label': 'setting:share label',
  'primary shade label': 'setting:primary label',
  'complimentary shade label': 'setting:complimentary label',
  'textures heading': 'setting:texture title',
  'textures heading (exterior)': 'setting:texture title exterior',
  'texture label': 'setting:texture label',
  'wallpaper label': 'setting:wallpaper label',
  'top coat label': 'setting:top coat label',
  'base coat label': 'setting:base coat label',
  'recommendation 1 intro': 'setting:one liner 1',
  'recommendation 2 intro': 'setting:one liner 2',
  'preview button label': 'setting:preview label',
  'close preview label': 'setting:close preview label',
  'previous image label': 'setting:previous image label',
  'next image label': 'setting:next image label',
  'change step label': 'setting:change step label',
  'room preview label': 'setting:room preview label',
  'pdf file name': 'setting:pdf name',
  'pdf logo': 'setting:pdf logo',
  'lead endpoint': 'setting:lead endpoint',
  'recommendations api': 'setting:recommendations',
  'pdf upload endpoint': 'setting:pdf upload',
  'salesforce endpoint': 'setting:salesforce',
  'node path': 'setting:node',
  'page path': 'setting:page path',
  'campaign id': 'setting:campaign id',
  'campaign name': 'setting:campaign name',
  'form name': 'setting:form name',
};

// repeating sections: a header row (plain column names, any order) then one
// row per item. `key` tells the sections apart.
const SECTIONS = {
  questions: {
    key: 'step label',
    columns: {
      'question id': 'id', 'step label': 'label', heading: 'display', 'show if': 'showIf', 'options style': 'flags',
    },
  },
  options: {
    key: 'option label',
    columns: {
      'question id': 'question',
      'option label': 'label',
      value: 'value',
      'card image': 'img',
      'preview image (mobile)': 'zoomImg',
      'preview image (desktop)': 'zoomDesktop',
    },
  },
  fields: {
    key: 'field id',
    columns: {
      'field id': 'id', 'field label': 'label', placeholder: 'placeholder', 'error message': 'error',
    },
  },
  choices: {
    key: 'choice id',
    columns: {
      'choice id': 'id', 'choice question': 'question', 'choice options': 'options', 'error message': 'error',
    },
  },
};

/** Section whose header row this is (every cell a column name of it), or null. */
function sectionOf(cells) {
  const heads = cells.map((c) => norm(text(c))).filter(Boolean);
  return Object.keys(SECTIONS).find((name) => heads.includes(SECTIONS[name].key)
    && heads.every((h) => h in SECTIONS[name].columns)) || null;
}

const firstImg = (cell) => cell?.querySelector('img') || null;
const hasText = (cell) => (cell && text(cell) ? cell : null);

/**
 * Label | value fields, then the questions, options, form fields and form
 * choices sections. Fills the same config / questions as the keyword rows.
 */
function readLabelValue(block, config, settings) {
  const questions = [];
  const options = [];
  const fields = {};
  let section = null;
  let columns = [];
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const found = sectionOf(cells);
    if (found) {
      section = found;
      columns = cells.map((c) => SECTIONS[found].columns[norm(text(c))] || '');
      return;
    }
    const label = norm(text(cells[0]));
    if (!section || FIELDS[label]) {
      if (label) fields[label] = cells[1] || document.createElement('div');
      return;
    }
    const item = {};
    columns.forEach((k, i) => { if (k) item[k] = cells[i] || null; });
    if (section === 'questions') {
      questions.push({
        id: norm(text(item.id)),
        label: text(item.label),
        display: hasText(item.display),
        showIf: parseCondition(text(item.showIf)),
        flags: norm(text(item.flags)).split(/[\s,]+/).filter(Boolean),
        options: [],
      });
    } else if (section === 'options') {
      const optionLabel = text(item.label);
      if (!optionLabel) return;
      const img = firstImg(item.img);
      options.push({
        question: norm(text(item.question)),
        label: optionLabel,
        value: text(item.value) || optionLabel,
        img,
        zoomImg: firstImg(item.zoomImg) || img,
        zoomDesktop: firstImg(item.zoomDesktop),
      });
    } else if (section === 'fields') {
      readLeadRow('field', [null, item.id, item.label, item.placeholder, item.error], config.lead);
    } else {
      readLeadRow('choice', [null, item.id, item.question, item.options, item.error], config.lead);
    }
  });
  options.forEach(({ question, ...option }) => {
    questions.find((q) => q.id === question)?.options.push(option);
  });

  Object.entries(fields).forEach(([label, cell]) => {
    const target = FIELDS[label] || `setting:${label}`;
    if (target.startsWith('setting:')) settings.set(target.slice(8), cell);
  });
  // one background image serves both sizes
  const mobile = firstImg(fields['background (mobile)']);
  const desktop = firstImg(fields['background (desktop)']);
  config.bgMobile = mobile || desktop;
  config.bgDesktop = desktop || mobile;
  const results = fields['results sheet'];
  config.results = results?.querySelector('a')?.getAttribute('href') || text(results);
  config.heading = hasText(fields['results heading']);
  config.restart = text(fields['restart button label']) || config.restart;
  // the lead form is on when it has a step label or any field or choice
  const { lead } = config;
  if (fields['form step label'] || lead.fields.length || lead.choices.length) {
    readLeadRow('form', [null, fields['form step label'], fields['form submit label'], null, fields['returning visitor label']], lead);
  }
  if (fields.consent) readLeadRow('consent', [null, fields.consent], lead);
  return questions;
}

function parse(block) {
  const settings = new Map();
  const config = {
    results: '',
    heading: null,
    restart: 'Do it again',
    bgMobile: null,
    bgDesktop: null,
    lead: emptyLead(),
    settings: {
      // a cell holding only a link is read as the link's URL
      get: (k) => {
        const cell = settings.get(k);
        const link = cell?.querySelector('a[href]');
        return link && text(link) === text(cell) ? link.getAttribute('href') : text(cell);
      },
      img: (k) => settings.get(k)?.querySelector('img') || null,
    },
  };
  // label | value model: it has at least one section header row
  if ([...block.children].some((row) => sectionOf([...row.children]))) {
    const questions = readLabelValue(block, config, settings);
    return { config, questions: questions.filter((q) => q.id && q.options.length) };
  }

  // earlier keyword rows (pages authored before the label | value model)
  const questions = [];
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const kind = norm(text(cells[0]));
    if (kind === 'question') {
      questions.push({
        id: norm(text(cells[1])),
        label: text(cells[2]),
        display: cells[3] && text(cells[3]) ? cells[3] : null,
        showIf: parseCondition(text(cells[4])),
        flags: norm(text(cells[5])).split(/[\s,]+/).filter(Boolean),
        options: [],
      });
    } else if (kind === 'option' && questions.length) {
      const label = text(cells[1]);
      if (!label) return;
      // image cell: card image, then (optional) preview image (mobile, or all
      // sizes), then (optional) preview image for desktop (>= 992px)
      const imgs = [...(cells[2]?.querySelectorAll('img') || [])];
      questions[questions.length - 1].options.push({
        label,
        value: text(cells[3]) || label,
        img: imgs[0] || null,
        zoomImg: imgs[1] || imgs[0] || null,
        zoomDesktop: imgs[2] || null,
      });
    } else if (kind === 'background') {
      const imgs = [...row.querySelectorAll('img')];
      [config.bgMobile] = imgs;
      config.bgDesktop = imgs[1] || imgs[0] || null;
    } else if (kind === 'results') {
      config.results = cells[1]?.querySelector('a')?.getAttribute('href') || text(cells[1]);
      config.heading = cells[2] && text(cells[2]) ? cells[2] : null;
      config.restart = text(cells[3]) || config.restart;
    } else if (['form', 'field', 'choice', 'consent'].includes(kind)) {
      readLeadRow(kind, cells, config.lead);
    } else if (kind === 'config' && norm(text(cells[1]))) {
      settings.set(norm(text(cells[1])), cells[2] || document.createElement('div'));
    }
  });
  return { config, questions: questions.filter((q) => q.id && q.options.length) };
}

/** Find the most specific results row matching the answers (blank/* = any). */
function findRow(rows, answers, ids) {
  let best = null;
  let bestScore = -1;
  rows.forEach((row) => {
    const cols = Object.fromEntries(Object.entries(row).map(([k, v]) => [key(k), String(v ?? '').trim()]));
    let score = 0;
    const ok = ids.every((id) => {
      const want = norm(cols[key(id)]);
      if (!want || want === '*') return true;
      if (!(id in answers) || want !== norm(answers[id])) return false;
      score += 1;
      return true;
    });
    if (ok && score > bestScore) { best = cols; bestScore = score; }
  });
  return best;
}

export default function decorate(block) {
  uid += 1;
  const { config, questions } = parse(block);
  if (!questions.length) return;

  if (config.bgDesktop) {
    const src = bgSrc(config.bgDesktop, 1600);
    preloadArtwork(src, DESKTOP_MEDIA);
    block.style.setProperty('--colour-quiz-bg-desktop', `url("${src}")`);
  }
  if (config.bgMobile) {
    const src = bgSrc(config.bgMobile, 750);
    preloadArtwork(src, '(max-width: 991px)');
    block.style.setProperty('--colour-quiz-bg-mobile', `url("${src}")`);
  }

  const answers = {};
  let resultsPromise = null;
  const loadResults = () => {
    if (!resultsPromise) {
      resultsPromise = config.results
        ? fetch(config.results)
          .then((r) => (r.ok ? r.json() : { data: [] }))
          .then((j) => j.data || [])
          .catch(() => [])
        : Promise.resolve([]);
    }
    return resultsPromise;
  };

  const visible = () => questions.filter((q) => q.showIf
    .every(([id, value]) => norm(answers[id]) === value));
  const current = () => visible().find((q) => !(q.id in answers));

  // --- static scaffolding ---
  const panel = document.createElement('div');
  panel.className = 'colour-quiz-panel';
  const stepsNav = document.createElement('div');
  stepsNav.className = 'colour-quiz-questions';
  const optionsList = document.createElement('ul');
  optionsList.className = 'colour-quiz-options';
  const formSlot = document.createElement('div');
  formSlot.className = 'colour-quiz-form-slot';
  formSlot.hidden = true;
  panel.append(stepsNav, optionsList, formSlot);

  const status = document.createElement('p');
  status.className = 'colour-quiz-status';
  status.setAttribute('aria-live', 'polite');

  // image preview (zoom) dialog: full-width panel at the top of the viewport
  // with prev/next through the current question's options, as on the source
  const zoom = document.createElement('dialog');
  zoom.className = 'colour-quiz-zoom';
  zoom.setAttribute('aria-labelledby', `colour-quiz-${uid}-zoom-title`);
  zoom.innerHTML = `<p class="colour-quiz-zoom-title" id="colour-quiz-${uid}-zoom-title" aria-live="polite"></p>
    <div class="colour-quiz-zoom-media"></div>
    <button type="button" class="colour-quiz-zoom-close">X</button>
    <button type="button" class="colour-quiz-zoom-prev"></button>
    <button type="button" class="colour-quiz-zoom-next"></button>`;
  const a11y = (k) => config.settings.get(k) || A11Y[k];
  [['close', 'close preview label'], ['prev', 'previous image label'], ['next', 'next image label']]
    .forEach(([name, k]) => zoom.querySelector(`.colour-quiz-zoom-${name}`).setAttribute('aria-label', a11y(k)));
  let zoomReturn = null;
  let zoomSet = [];
  let zoomIndex = 0;
  const showZoom = (i) => {
    zoomIndex = (i + zoomSet.length) % zoomSet.length;
    const option = zoomSet[zoomIndex];
    zoom.querySelector('.colour-quiz-zoom-title').textContent = option.label;
    zoom.querySelector('.colour-quiz-zoom-media').replaceChildren(buildZoomPicture(
      option.zoomImg,
      option.zoomDesktop,
      option.zoomImg.alt || option.zoomDesktop?.alt || option.img?.alt || option.label,
    ));
  };
  const closeZoom = () => {
    zoom.close();
    document.body.style.removeProperty('overflow');
    zoomReturn?.focus();
  };
  zoom.querySelector('.colour-quiz-zoom-close').addEventListener('click', closeZoom);
  zoom.querySelector('.colour-quiz-zoom-prev').addEventListener('click', () => showZoom(zoomIndex - 1));
  zoom.querySelector('.colour-quiz-zoom-next').addEventListener('click', () => showZoom(zoomIndex + 1));
  zoom.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') showZoom(zoomIndex - 1);
    if (e.key === 'ArrowRight') showZoom(zoomIndex + 1);
  });
  // a click on the backdrop (outside the panel) closes it
  zoom.addEventListener('click', (e) => {
    const r = zoom.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right
      && e.clientY >= r.top && e.clientY <= r.bottom;
    if (e.target === zoom && !inside) closeZoom();
  });
  zoom.addEventListener('cancel', (e) => { e.preventDefault(); closeZoom(); });
  const openZoom = (option, trigger, options) => {
    zoomReturn = trigger;
    zoomSet = options.filter((o) => o.zoomImg);
    zoom.classList.toggle('colour-quiz-zoom-single', zoomSet.length < 2);
    showZoom(zoomSet.indexOf(option));
    document.body.style.overflow = 'hidden';
    zoom.showModal();
  };

  // results view
  const results = document.createElement('section');
  results.className = 'colour-quiz-results';
  results.hidden = true;
  const resultsHeader = document.createElement('div');
  resultsHeader.className = 'colour-quiz-results-header';
  const resultsHeading = document.createElement('h2');
  resultsHeading.tabIndex = -1;
  if (config.heading) {
    const only = config.heading.children.length === 1 && config.heading.firstElementChild;
    resultsHeading.innerHTML = only ? only.innerHTML : config.heading.innerHTML;
  } else {
    resultsHeading.textContent = 'Our expert recommendation of colours based on your personality and preferences!';
  }
  // "Do it again" appears twice, as on the source: a pill in the header and a
  // button below the shades
  const restartButton = (className) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = config.restart;
    return btn;
  };
  const { settings } = config;
  const headerCta = document.createElement('div');
  headerCta.className = 'colour-quiz-results-actions';
  // "Share on WhatsApp" (mobile only, as on the source)
  const share = document.createElement('a');
  share.className = 'colour-quiz-share';
  share.href = '#';
  share.target = '_blank';
  share.rel = 'noopener noreferrer';
  share.textContent = settings.get('share label') || 'Share on WhatsApp';
  headerCta.append(restartButton('colour-quiz-restart-pill'), share);
  resultsHeader.append(resultsHeading, headerCta);
  const recsSlot = document.createElement('div');
  recsSlot.className = 'colour-quiz-recs-slot';
  const resultsCta = document.createElement('div');
  resultsCta.className = 'colour-quiz-results-cta';
  const download = document.createElement('button');
  download.type = 'button';
  download.className = 'colour-quiz-download';
  download.innerHTML = '<span class="colour-quiz-submit-label"></span><span class="colour-quiz-spinner" aria-hidden="true"></span>';
  download.firstChild.textContent = settings.get('download label') || 'Download (PDF)';
  resultsCta.append(restartButton('colour-quiz-restart'), download);
  const rule = document.createElement('hr');
  rule.className = 'colour-quiz-results-rule';
  results.append(resultsHeader, recsSlot, resultsCta, rule);

  // results view + PDF code (results.js) is loaded when results are first shown
  let view = null; // { module, pdf } once loaded
  let viewLoading = null;
  const loadView = () => {
    viewLoading = viewLoading || import('./results.js').then((module) => {
      view = { module, pdf: module.pdfController(block, settings) };
      return view;
    });
    return viewLoading;
  };
  download.addEventListener('click', async () => {
    if (download.getAttribute('aria-busy') === 'true') return;
    download.setAttribute('aria-busy', 'true');
    try {
      await (await loadView()).pdf.download();
    } catch (e) {
      status.textContent = 'The PDF could not be created. Please try again.';
    } finally {
      download.removeAttribute('aria-busy');
    }
  });

  // --- rendering ---
  let render;
  let resultsShown = Promise.resolve();
  // lead form: passed once per quiz run (submitted, or skipped for a
  // visitor who already submitted on this page view)
  const { lead } = config;
  let formCleared = false;
  let leadForm = null;
  const getLeadForm = () => {
    if (!leadForm) {
      leadForm = buildLeadForm(lead, {
        uid,
        settings,
        onDone: () => { formCleared = true; render(true); return resultsShown; },
      });
    }
    return leadForm;
  };

  const answer = (question, option) => {
    formCleared = false;
    answers[question.id] = option.value;
    recordAnswer(question.id, option.value);
    // drop answers to questions that are no longer reachable on this branch
    const reachable = new Set(visible().map((q) => q.id));
    Object.keys(answers).forEach((id) => { if (!reachable.has(id)) delete answers[id]; });
    render(true);
  };

  const goBack = (question) => {
    formCleared = false;
    const order = visible().map((q) => q.id);
    const from = order.indexOf(question.id);
    order.slice(from).forEach((id) => delete answers[id]);
    render(true);
  };

  /**
   * Source order: recommendation API -> results -> PDF made and uploaded ->
   * Salesforce with the PDF link. If the API fails, Salesforce gets the lead
   * without a PDF and the authored sheet is used instead.
   */
  const renderResults = async (moveFocus) => {
    const {
      module: { fromApi, fromSheet, buildRecommendations },
      pdf,
    } = await loadView();
    const request = quizRequest();
    let recs = [];
    let fromService = false;
    const api = settings.get('recommendations');
    const json = api ? await fetchRecommendations(api, request, settings.get('page path')) : null;
    if (json) {
      recs = fromApi(json);
      fromService = recs.some((r) => r.visible);
    } else {
      completeLead(settings, '');
    }
    if (!fromService) {
      const row = findRow(await loadResults(), answers, questions.map((q) => q.id));
      recs = row ? fromSheet(row) : [];
    }
    const requestType = json?.requestType || request.requestType;
    const recsView = buildRecommendations(recs, { settings, requestType });

    panel.hidden = true;
    results.hidden = false;
    recsSlot.replaceChildren(recsView || '');
    download.hidden = !recsView;
    pdf.reset(recsView ? {
      heading: resultsHeading, recs, settings, requestType,
    } : null);
    const count = recsView ? recsView.children.length : 0;
    status.textContent = count
      ? `${count} recommendation${count > 1 ? 's' : ''}`
      : 'No recommendation found';
    if (moveFocus) resultsHeading.focus();
    if (fromService) {
      // no PDF (render failed) means no Salesforce call, as on the source
      pdf.upload().then((link) => completeLead(settings, link)).catch(() => {});
    }
  };

  render = (moveFocus = false) => {
    const q = current();
    // data-attr-skip-form="true": no lead step (visitors who already sent a lead, form-removal.js)
    const formStep = !q && lead.enabled && !formCleared && block.dataset.attrSkipForm !== 'true';
    if (!q && !formStep) { resultsShown = renderResults(moveFocus); return; }
    panel.hidden = false;
    results.hidden = true;
    // the source lays the exterior path out differently from the interior one
    panel.dataset.path = norm(answers[questions[0]?.id]);

    const steps = visible();
    const index = formStep ? steps.length : steps.indexOf(q);
    const done = steps.slice(0, index);
    const returning = formStep && leadSubmitted();
    let stepLabel = formStep ? lead.label : q.label;
    if (returning && lead.returning) stepLabel = lead.returning;

    // step list: answered steps are buttons (go back), current step is the heading
    const list = document.createElement('ol');
    list.className = 'colour-quiz-steps';
    list.style.setProperty('--colour-quiz-done', done.length);
    done.forEach((step, i) => {
      const li = document.createElement('li');
      li.className = 'colour-quiz-step-done';
      const btn = document.createElement('button');
      btn.type = 'button';
      const chosen = step.options.find((o) => o.value === answers[step.id]);
      btn.setAttribute('aria-label', fill(a11y('change step label'), {
        step: i + 1, question: step.label, answer: chosen ? chosen.label : answers[step.id],
      }));
      btn.innerHTML = '<span class="colour-quiz-num" aria-hidden="true"></span><span class="colour-quiz-step-text"></span>';
      btn.querySelector('.colour-quiz-num').textContent = i + 1;
      btn.querySelector('.colour-quiz-step-text').textContent = step.label;
      btn.addEventListener('click', () => goBack(step));
      li.append(btn);
      list.append(li);
    });

    const currentLi = document.createElement('li');
    currentLi.className = 'colour-quiz-step-current';
    const heading = document.createElement('h2');
    heading.tabIndex = -1;
    heading.id = `colour-quiz-${uid}-q`;
    const num = document.createElement('span');
    num.className = 'colour-quiz-num';
    num.textContent = index + 1;
    const title = document.createElement('span');
    title.className = 'colour-quiz-title';
    const paras = q?.display ? [...q.display.children].filter((c) => text(c)) : [];
    if (paras.length > 1) {
      const kicker = document.createElement('span');
      kicker.className = 'colour-quiz-kicker';
      kicker.innerHTML = paras[0].innerHTML;
      const headline = document.createElement('span');
      headline.className = 'colour-quiz-headline';
      headline.innerHTML = paras.slice(1).map((p) => p.innerHTML).join(' ');
      title.append(kicker, headline);
    } else {
      const headline = document.createElement('span');
      headline.className = 'colour-quiz-headline';
      if (paras.length === 1) headline.innerHTML = paras[0].innerHTML;
      else headline.textContent = q?.display ? text(q.display) : stepLabel;
      title.append(headline);
    }
    heading.append(num, title);
    currentLi.append(heading);
    list.append(currentLi);
    stepsNav.replaceChildren(list);

    panel.classList.toggle('colour-quiz-panel-form', formStep);
    optionsList.hidden = formStep;
    formSlot.hidden = !formStep;
    if (formStep) {
      const { card, returningCard } = getLeadForm();
      formSlot.replaceChildren(returning ? returningCard : card);
      optionsList.replaceChildren();
      if (moveFocus) {
        status.textContent = `Step ${index + 1}: ${stepLabel}`;
        heading.focus();
      }
      return;
    }

    // options
    optionsList.className = `colour-quiz-options${q.flags.includes('icons') ? ' colour-quiz-options-icons' : ''}`;
    optionsList.setAttribute('aria-labelledby', heading.id);
    optionsList.replaceChildren(...q.options.map((option) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'colour-quiz-option';
      btn.setAttribute('aria-pressed', String(answers[q.id] === option.value));
      if (option.img) {
        const pic = createOptimizedPicture(option.img.src, '', false, [{ width: q.flags.includes('icons') ? '100' : '300' }]);
        pic.classList.add('colour-quiz-option-media');
        btn.append(pic);
      }
      const label = document.createElement('span');
      label.className = 'colour-quiz-option-label';
      label.textContent = option.label;
      btn.append(label);
      btn.addEventListener('click', () => answer(q, option));
      li.append(btn);
      if (q.flags.includes('zoom') && option.img) {
        const z = document.createElement('button');
        z.type = 'button';
        z.className = 'colour-quiz-zoom-button';
        z.setAttribute('aria-label', fill(a11y('preview label'), { option: option.label }));
        z.addEventListener('click', () => openZoom(option, z, q.options));
        li.append(z);
      }
      return li;
    }));

    // announce only after a user action, not on page load
    if (moveFocus) {
      // no "of N": the total depends on answers not given yet
      status.textContent = `Step ${index + 1}: ${q.label}`;
      heading.focus();
    }
  };

  const restart = () => {
    formCleared = false;
    Object.keys(answers).forEach((id) => delete answers[id]);
    view?.pdf.reset(null);
    track('HCG_doitagain');
    render(true);
  };
  results.querySelectorAll('.colour-quiz-restart, .colour-quiz-restart-pill').forEach((btn) => {
    btn.addEventListener('click', restart);
  });
  // source: sharing opens WhatsApp in a new tab and restarts the quiz
  share.addEventListener('click', () => {
    // results (and so results.js) are on screen whenever the share link is
    if (view) share.href = view.module.whatsappHref();
    track('tools_share', { shareType: 'whatsapp' });
    setTimeout(restart);
  });

  block.replaceChildren(panel, results, status, zoom);
  render(false);
}
