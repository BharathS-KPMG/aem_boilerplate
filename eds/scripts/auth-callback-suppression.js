function hasAuthCallbackHashParams() {
  try {
    const { hash } = window.location;
    if (!hash || hash.length <= 1) return false;
    const params = new URLSearchParams(hash.slice(1));
    return ['state', 'session_state', 'iss', 'code', 'id_token']
      .some((key) => params.has(key));
  } catch {
    return false;
  }
}

// Evaluate once at module load so later history.replaceState calls don't
// alter suppression for this page lifecycle.
// eslint-disable-next-line import/prefer-default-export -- named import in scripts/analytics
export const SUPPRESS_ANALYTICS_FOR_THIS_PAGE = hasAuthCallbackHashParams();
