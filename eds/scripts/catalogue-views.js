/*
 * Catalogue | Fandeck: the two views of the colour catalogue page.
 *
 * catalogue-listing-v2 (its "Show Fandeck" row) hosts the shared top bar: breadcrumb (and the
 * fandeck's search on its right), title, the Catalogue | Fandeck toggle and the view's chips. It
 * switches the two views in place, without changing the URL. The fandeck block is the other view:
 * it hands the host its title, search and colour family chips. Either block can decorate first,
 * so they meet here.
 *
 * Both blocks also read the same shade API (~1 MB, sent with no-cache): sharedJson() makes one
 * request per URL for the page.
 */

const FETCH_TIMEOUT = 20000;
const requests = new Map();

/**
 * The JSON at a URL, requested once for the page. Resolves to null when it fails; a failed
 * request is made again on the next call.
 * @param {string} url The URL
 * @returns {Promise<object|null>} The parsed JSON
 */
export function sharedJson(url) {
  if (!url) return Promise.resolve(null);
  if (!requests.has(url)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    requests.set(url, fetch(url, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
      .then((json) => {
        clearTimeout(timer);
        if (!json) requests.delete(url);
        return json;
      }));
  }
  return requests.get(url);
}

let host = null;
let fandeck = null;

const connect = () => {
  if (!host || !fandeck) return;
  if (host.hasToggle) host.attach(fandeck);
  else fandeck.standalone();
};

/**
 * catalogue-listing-v2: `hasToggle` (its "Show Fandeck" row), and `attach(fandeck)`, which takes
 * the fandeck's parts into its bar.
 * @param {{hasToggle: boolean, attach: Function}} api The host
 */
export function registerCatalogue(api) {
  host = api;
  connect();
}

/**
 * The fandeck block: `title` (its text), `search` and `chips` (elements for the host's bar),
 * `show()`, `hide()` and `standalone()` (no host toggle: it shows itself with its own top part).
 * @param {object} api The fandeck view
 */
export function registerFandeck(api) {
  fandeck = api;
  connect();
}
