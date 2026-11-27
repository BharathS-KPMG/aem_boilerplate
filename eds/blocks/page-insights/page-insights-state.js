/* =============================================================
 * page-insights — shared state
 *
 * The data the panel has loaded so far, shared by all files.
 * resetState() runs every time the panel is built.
 * ============================================================= */

export const state = {};

export function resetState() {
  Object.assign(state, {
    /* PageSpeed request: 'idle' | 'loading' | 'done' | 'error' */
    pageSpeedStatus: 'idle',
    /* PageSpeed results per device (fields: see page-insights-api.js) */
    desktopMetrics: null,
    mobileMetrics: null,

    /* true while an analytics request is running */
    analyticsLoading: false,
    /* analytics results by "overall|start|end" / "organic|start|end",
     * so switching back to a range already loaded is instant */
    analyticsCache: {},

    /* SEO rows by month ("MMMM-YYYY") → { time, rows }, kept 5 minutes */
    seoCache: {},
    /* last SEO month shown; reloaded when the SEO screen is opened again */
    lastSeoVersion: null,
  });
}

/** PageSpeed result for 'desktop' or 'mobile' (null until loaded). */
export function getPageSpeedMetrics(device) {
  return device === 'mobile' ? state.mobileMetrics : state.desktopMetrics;
}

resetState();
