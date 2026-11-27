import { loadMaps } from '../../scripts/google-maps.js';
/**
 * store-finder map: Google Maps with the source's dark theme, a pin per store
 * (the source's marker.svg / marker-active.svg) and its info window (name,
 * address, phone, Directions). Loaded only when a Maps API key is authored.
 */

// the source's MapApp.StoreMapTheme
const STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#193b70' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#ffffff' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#406080' }] },
  { featureType: 'landscape', stylers: [{ color: '#0f1e40' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#183058' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#284a7d' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0d2545' }] },
  { featureType: 'transit', stylers: [{ color: '#1c3b64' }] },
  { featureType: 'water', stylers: [{ color: '#0b2e60' }] },
];

// the source's default centre (India) and zoom levels
const INDIA = { lat: 22.9734, lng: 78.6569 };

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/**
 * @param {HTMLElement} el the map box
 * @param {{apiKey: string, icons: string, labels: object}} opts
 * @returns {Promise<null|{show: Function, open: Function}>}
 */
export default async function createMap(el, { apiKey, icons, labels }) {
  const maps = await loadMaps(apiKey);
  if (!maps) return null;
  const map = new maps.Map(el, {
    zoom: 8,
    center: INDIA,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    styles: STYLES,
  });
  const info = new maps.InfoWindow();
  const pin = `${icons}/marker.svg`;
  const pinActive = `${icons}/marker-active.svg`;
  let markers = [];
  let active = null;
  let onPick = () => {};

  const card = (s) => `<div class="store-finder-info">
      <h3 class="store-finder-info-name">${esc(s.name)}</h3>
      <p class="store-finder-info-line"><img src="${icons}/map.svg" alt="" width="16" height="16">${esc(s.address)}</p>
      <p class="store-finder-info-line"><img src="${icons}/mob.svg" alt="" width="16" height="16">${esc(labels.phone)} ${esc(s.phoneText)}</p>
      <a class="store-finder-info-directions" href="${esc(s.directions)}" target="_blank" rel="noopener noreferrer"><img src="${icons}/direction.svg" alt="" width="16" height="16">${esc(labels.directions)}<span class="store-finder-sr-only"> ${esc(labels.newTab)}</span></a>
    </div>`;

  const open = (index) => {
    const m = markers[index];
    if (!m) return;
    if (active && active !== m.marker) active.setIcon(pin);
    m.marker.setIcon(pinActive);
    active = m.marker;
    info.setContent(card(m.store));
    info.open({ map, anchor: m.marker });
  };
  info.addListener('closeclick', () => { active?.setIcon(pin); active = null; });

  return {
    /** replace the pins with these stores and fit them */
    show(stores, centre, pick) {
      onPick = pick || onPick;
      info.close();
      markers.forEach((m) => m.marker.setMap(null));
      active = null;
      const bounds = new maps.LatLngBounds();
      markers = stores.map((store, i) => {
        const position = { lat: store.latitude, lng: store.longitude };
        const marker = new maps.Marker({
          position, map, icon: pin, title: store.name,
        });
        marker.addListener('click', () => { open(i); onPick(i); });
        bounds.extend(position);
        return { marker, store };
      });
      if (stores.length) map.fitBounds(bounds);
      else if (centre) { map.setCenter(centre); map.setZoom(12); }
    },
    open,
  };
}
