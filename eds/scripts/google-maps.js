import { getMetadata } from './aem.js';

/**
 * Shared Google Maps JavaScript API loader for the store locator (store-search, store-finder
 * and its map). The key is the authored "Maps API key" of any of those blocks, else the page
 * metadata "google-maps-key"; the API loads once, with the places library the source asks for.
 */
let apiKey = '';
let loading;

/** remember a Maps key: the authored value first, else the page metadata (empty keeps the last) */
export function setMapsKey(authored) {
  apiKey = (authored || '').trim() || apiKey || getMetadata('google-maps-key') || '';
  return apiKey;
}

export function hasMapsKey() {
  return Boolean(apiKey || getMetadata('google-maps-key'));
}

/** load the Maps JavaScript API once (resolves to window.google.maps, or null) */
export function loadMaps(key = apiKey || getMetadata('google-maps-key')) {
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (!key) return Promise.resolve(null);
  if (!loading) {
    loading = new Promise((resolve) => {
      const cb = `apMapsReady${Date.now()}`;
      window[cb] = () => { delete window[cb]; resolve(window.google.maps); };
      // the key is not valid for this site
      window.gm_authFailure = () => resolve(null);
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async&callback=${cb}`;
      script.async = true;
      script.onerror = () => resolve(null);
      document.head.append(script);
    });
  }
  return loading;
}

/** a place's coordinates as the source finds them (India only), or null */
export async function geocode(address) {
  const maps = await loadMaps();
  if (!maps) return null;
  const { Geocoder } = maps.Geocoder ? maps : await maps.importLibrary('geocoding');
  return new Promise((resolve) => {
    new Geocoder().geocode({ address, componentRestrictions: { country: 'IN' } }, (res, status) => {
      const loc = status === 'OK' && res[0]?.geometry?.location;
      resolve(loc ? { lat: loc.lat(), lng: loc.lng() } : null);
    });
  });
}
