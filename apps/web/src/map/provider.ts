/**
 * The map and its background (ADR-0008): MapLibre draws, Kartverket's open
 * topographic map is the background. Everything provider-specific about the
 * map is in this module, so another provider is a change here only.
 */
export const mapProvider = {
  /** The only origin the browser fetches map tiles from (CSP). */
  origin: "https://cache.kartverket.no",
  tiles:
    "https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png",
  tileSize: 256,
  maxZoom: 18,
  attribution:
    '© <a href="https://www.kartverket.no/" rel="noreferrer">Kartverket</a>',
} as const;

/**
 * MapLibre's worker, served by the app itself from the installed version
 * (`scripts/copy-map-worker.mjs`), so the CSP needs no `blob:` workers.
 */
export const mapWorkerPath = "/maplibre";

export const mapWorkerUrl = (version: string) =>
  `${mapWorkerPath}/${version}/maplibre-gl-worker.mjs`;
