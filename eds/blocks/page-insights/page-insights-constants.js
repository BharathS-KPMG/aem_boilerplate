/* =============================================================
 * page-insights — constants
 *
 * Fixed values used by the other files: image paths, icons,
 * the Core Web Vitals rows with their limits, and the page
 * checks that decide which analytics rows are shown.
 * ============================================================= */

/* Images are in ./images next to this file. The path is worked out
 * from this file's own URL, so it works wherever the code is served. */
export const IMG_BASE = new URL('./images', import.meta.url).href;

/** Full URL of an image in ./images */
export const imageUrl = (name) => `${IMG_BASE}/${name}`;

/* High / Moderate / Low icon shown under a score gauge. */
export const QUALITY_ICONS = {
  high: { src: imageUrl('High-green.svg'), alt: 'High' },
  moderate: { src: imageUrl('Moderate.svg'), alt: 'Moderate' },
  low: { src: imageUrl('Low-red.svg'), alt: 'Low' },
};

/* Good / Needs Improvement / Poor icon next to each Core Web Vital. */
export const STATUS_ICONS = {
  'metric-good': imageUrl('Good.svg'),
  'metric-moderate': imageUrl('Moderate.svg'),
  'metric-bad': imageUrl('Poor.svg'),
};

/* Rows of the Performance tab, in display order.
 * key = field name in the PageSpeed result (see page-insights-api.js). */
export const PERFORMANCE_METRICS = [
  {
    key: 'lcp',
    label: 'Largest Contentful Paint',
    short: 'LCP',
    icon: imageUrl('largest-contentful-paint.svg'),
  },
  {
    key: 'inp',
    label: 'Interaction to Next Paint',
    short: 'INP',
    icon: imageUrl('time-to-interactive.svg'),
  },
  {
    key: 'cls',
    label: 'Cumulative Layout Shift',
    short: 'CLS',
    icon: imageUrl('total-visits.svg'),
  },
  {
    key: 'fcp',
    label: 'First Contentful Paint',
    short: 'FCP',
    icon: imageUrl('first-contentful-paint.svg'),
  },
  {
    key: 'speedIndex',
    label: 'Speed Index',
    short: 'SI',
    icon: imageUrl('performance-metrics.svg'),
  },
];

/* PageSpeed gives these in milliseconds; the panel shows them in seconds. */
export const SECONDS_METRICS = ['lcp', 'fcp', 'speedIndex'];

/* Limits for each Core Web Vital (seconds for lcp/fcp/speedIndex,
 * milliseconds for inp, a plain number for cls):
 *   value <= good      → Good
 *   value <= moderate  → Needs Improvement
 *   anything higher    → Poor
 * Speed Index has different limits for desktop and mobile. */
export const METRIC_LIMITS = {
  lcp: { good: 2.5, moderate: 4.0 },
  inp: { good: 200, moderate: 500 },
  cls: { good: 0.1, moderate: 0.25 },
  fcp: { good: 1.8, moderate: 3.0 },
  speedIndex: {
    desktop: { good: 1.3, moderate: 2.3 },
    mobile: { good: 3.4, moderate: 5.8 },
  },
};

/* Page checks for the Page Analytics tab. These are the CSS classes of
 * the AEM components the original clientlib looked for; when one is on
 * the page, the matching analytics row is shown. */
export const PAGE_FEATURES = {
  /* Form Start, Form Submit and Conversion Rate rows */
  leadForm: '.ccforms',
  /* FAQ count uses the campaign FAQ metric instead of the site-wide one */
  campaignFaq: '.faq-list-container',
  /* Video's Played row */
  campaignVideo: '.video-elem__thumbnail-img',
  /* PDF's Downloaded row */
  campaignPdf: '.resource-list-container',
};
