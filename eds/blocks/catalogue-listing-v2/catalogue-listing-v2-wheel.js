/*
 * Catalogue Listing v2: the colour picker wheel (source: the colourcataloguelisting component's
 * #colour-picker canvas, its sortColoursForWheel / drawSmoothColourWheel).
 *
 * The API's shades go round the wheel (clockwise from the right) family by family in
 * FAMILY_WHEEL_ORDER (other families last), each family light to dark and back so neighbours
 * blend, and the wheel is drawn as their colours blurred along the circle. A tap, the release of
 * a drag, or Enter picks the shade at the cursor's angle; catalogue-listing-v2.js filters by it.
 * Keyboard: the wheel is a slider, arrow keys turn the cursor 3° (Page Up / Down 30°).
 *
 * Loaded by catalogue-listing-v2.js when the Colour Picker tool is first opened.
 */

const FAMILY_WHEEL_ORDER = [
  'reds', 'oranges', 'yellows', 'beiges and neutrals', 'greens', 'blues', 'greys',
  'lilacs and violets', 'pinks', 'browns', 'whites and lights',
];
// the source's blur along the circle, and the steps its colours are sampled in
const BLUR_DEGREES = 4;
const STEPS = 2048;
const TAU = Math.PI * 2;
const KEY_STEP = TAU / 120;
const PAGE_STEP = TAU / 12;
// the cursor's distance from the centre when moved by keyboard (of the radius)
const KEY_RADIUS = 0.6;

function rgb(hex) {
  let value = `${hex || ''}`.replace('#', '').trim();
  if (value.length === 3) value = value.replace(/./g, (c) => c + c);
  const channel = (at) => parseInt(value.slice(at, at + 2), 16) || 0;
  return [channel(0), channel(2), channel(4)];
}

/** hue (degrees) and lightness (%) */
function hueLightness(hex) {
  const [r, g, b] = rgb(hex).map((value) => value / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hue = 0;
  if (max !== min) {
    const d = max - min;
    if (max === r) hue = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
  }
  return { hue, lightness: ((max + min) / 2) * 100 };
}

/** light → dark on even places, then back dark → light on odd ones (the source's palindrome) */
function palindrome(shades) {
  const sorted = shades
    .map((shade) => ({ shade, ...hueLightness(shade.shadeHexCode) }))
    .sort((a, b) => (a.lightness !== b.lightness ? a.lightness - b.lightness : a.hue - b.hue))
    .map(({ shade }) => shade);
  const up = sorted.filter((_, i) => i % 2 === 0);
  const down = sorted.filter((_, i) => i % 2 === 1).reverse();
  return [...up, ...down];
}

function wheelOrder(shades) {
  const families = new Map();
  const others = [];
  shades.forEach((shade) => {
    if (!shade?.shadeHexCode) return;
    const family = `${shade.shadeFamily || ''}`.trim().toLowerCase();
    if (FAMILY_WHEEL_ORDER.includes(family)) {
      if (!families.has(family)) families.set(family, []);
      families.get(family).push(shade);
    } else {
      others.push(shade);
    }
  });
  const ordered = FAMILY_WHEEL_ORDER.flatMap((family) => (families.has(family)
    ? palindrome(families.get(family)) : []));
  return others.length ? [...ordered, ...palindrome(others)] : ordered;
}

/** STEPS colours round the circle: the shades' colours with a gaussian blur along it */
function blurredColours(entries) {
  const count = entries.length;
  const colours = entries.map((shade) => rgb(shade.shadeHexCode));
  const reach = Math.max(6, Math.round((BLUR_DEGREES / 360) * count * 4.5));
  const sigma = 0.8 * reach;
  const weights = [];
  for (let d = -reach; d <= reach; d += 1) weights.push(Math.exp(-((d / sigma) ** 2)));
  const table = new Float32Array(STEPS * 3);
  for (let step = 0; step < STEPS; step += 1) {
    const base = Math.floor((step / STEPS) * count);
    let r = 0;
    let g = 0;
    let b = 0;
    let total = 0;
    for (let d = -reach; d <= reach; d += 1) {
      const colour = colours[(((base + d) % count) + count) % count];
      const weight = weights[d + reach];
      r += colour[0] * weight;
      g += colour[1] * weight;
      b += colour[2] * weight;
      total += weight;
    }
    table[step * 3] = r / total;
    table[step * 3 + 1] = g / total;
    table[step * 3 + 2] = b / total;
  }
  return table;
}

const stepAt = (angle) => Math.floor((angle / TAU) * STEPS) % STEPS;

function paint(canvas, table) {
  const { width, height } = canvas;
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);
  const { data } = image;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(cx, cy);
  for (let y = 0; y < height; y += 1) {
    const dy = y - cy;
    for (let x = 0; x < width; x += 1) {
      const dx = x - cx;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const at = (y * width + x) * 4;
      if (distance <= radius) {
        let angle = Math.atan2(dy, dx);
        if (angle < 0) angle += TAU;
        const step = stepAt(angle) * 3;
        data[at] = table[step];
        data[at + 1] = table[step + 1];
        data[at + 2] = table[step + 2];
        // a soft 1.5px edge
        data[at + 3] = distance > radius - 1.5 ? 255 * Math.max(0, (radius - distance) / 1.5) : 255;
      }
    }
  }
  context.putImageData(image, 0, 0);
}

/**
 * @param {object} options
 * @param {Element} options.root the wheel (role slider, focusable), the cursor's frame
 * @param {HTMLCanvasElement} options.canvas
 * @param {Element} options.cursor
 * @param {object[]} options.shades the API's shades
 * @param {(shade: object) => string} options.describe the slider's value text for a shade
 * @param {(shade: object|null) => void} options.onPick
 * @returns {{ draw: () => void }} draw: (re)draws at the wheel's current size
 */
export default function createWheel({
  root, canvas, cursor, shades, describe, onPick,
}) {
  const entries = wheelOrder(shades);
  const table = entries.length ? blurredColours(entries) : null;
  // the cursor: angle (clockwise from the right) and distance from the centre (of the radius)
  const point = { angle: (TAU * 3) / 4, distance: KEY_RADIUS };
  let size = 0;
  let dragging = false;

  const shadeAt = (angle) => (entries.length
    ? entries[Math.min(entries.length - 1, Math.floor(angle / (TAU / entries.length)))] : null);

  const place = () => {
    if (!size || !table) return;
    const radius = size / 2;
    const x = radius + Math.cos(point.angle) * point.distance * radius;
    const y = radius + Math.sin(point.angle) * point.distance * radius;
    const step = stepAt(point.angle) * 3;
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
    cursor.style.backgroundColor = `rgb(${table[step]} ${table[step + 1]} ${table[step + 2]})`;
    root.setAttribute('aria-valuenow', `${Math.round((point.angle * 360) / TAU) % 360}`);
    root.setAttribute('aria-valuetext', describe(shadeAt(point.angle)));
  };

  const draw = () => {
    const width = canvas.clientWidth;
    if (!width || !table) return;
    const pixels = Math.round(width * Math.min(window.devicePixelRatio || 1, 2));
    if (width !== size || canvas.width !== pixels) {
      size = width;
      canvas.width = pixels;
      canvas.height = pixels;
      paint(canvas, table);
    }
    place();
  };

  /** the pointer on the wheel, in its layout pixels (the page may be zoomed) */
  const locate = (event) => {
    const rect = canvas.getBoundingClientRect();
    const scale = size / (rect.width || 1);
    const dx = (event.clientX - rect.left) * scale - size / 2;
    const dy = (event.clientY - rect.top) * scale - size / 2;
    const distance = Math.sqrt(dx * dx + dy * dy) / (size / 2);
    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += TAU;
    return { angle, distance, inside: distance <= 1 };
  };

  const moveTo = (event) => {
    const target = locate(event);
    if (!target.inside) return false;
    point.angle = target.angle;
    point.distance = target.distance;
    place();
    return true;
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !moveTo(event)) return;
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (dragging) moveTo(event);
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!dragging) return;
    dragging = false;
    moveTo(event);
    onPick(shadeAt(point.angle));
  });
  canvas.addEventListener('pointercancel', () => {
    dragging = false;
  });

  root.addEventListener('keydown', (event) => {
    const turn = {
      ArrowRight: KEY_STEP,
      ArrowUp: KEY_STEP,
      ArrowLeft: -KEY_STEP,
      ArrowDown: -KEY_STEP,
      PageUp: PAGE_STEP,
      PageDown: -PAGE_STEP,
    }[event.key];
    if (turn) {
      event.preventDefault();
      point.angle = (((point.angle + turn) % TAU) + TAU) % TAU;
      point.distance = KEY_RADIUS;
      place();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onPick(shadeAt(point.angle));
    }
  });

  return { draw };
}
