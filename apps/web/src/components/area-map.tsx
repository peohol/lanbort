"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoArea } from "@lanbort/contracts";
import { useEffect, useRef, useState } from "react";
import { boundsOf, circle } from "@/map/geometry";
import { mapProvider, mapWorkerUrl } from "@/map/provider";
import styles from "./area-map.module.css";

export interface MappedArea {
  readonly id: string;
  readonly name: string;
  readonly area: GeoArea;
}

/** MapLibre's own words for the parts of the map shown here. */
const locale = {
  "Map.Title": "Kart over omtrentlige områder",
  "AttributionControl.ToggleAttribution": "Vis hvem kartet er fra",
  "NavigationControl.ZoomIn": "Zoom inn",
  "NavigationControl.ZoomOut": "Zoom ut",
  "NavigationControl.ResetBearing": "Pek kartet mot nord",
  "CooperativeGesturesHandler.WindowsHelpText":
    "Hold Ctrl nede og rull for å zoome kartet",
  "CooperativeGesturesHandler.MacHelpText":
    "Hold ⌘ nede og rull for å zoome kartet",
  "CooperativeGesturesHandler.MobileHelpText":
    "Bruk to fingre for å flytte kartet",
};

const featureOf = (area: GeoArea, properties: object) => ({
  type: "Feature" as const,
  properties,
  geometry: { type: "Polygon" as const, coordinates: [circle(area)] },
});

/**
 * The approximate areas of environments on a map (WP-62), and the
 * area searched as a dashed ring. Only areas, never points: they are as
 * coarse as stored (PS-NFR-008). The list beside it says everything the
 * map shows, so a browser that cannot draw maps simply shows no map.
 */
export function AreaMap({
  areas,
  searched,
  caption = searched
    ? "Omtrentlige områder for miljøene i treffene. Den stiplede ringen er området du søkte i."
    : "Omtrentlige områder for miljøene i treffene.",
}: {
  areas: readonly MappedArea[];
  searched: GeoArea | null;
  /** What the map shows, when it is not the environments found in Finn. */
  caption?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const shown = JSON.stringify({ areas, searched });

  useEffect(() => {
    const { areas, searched } = JSON.parse(shown) as {
      areas: MappedArea[];
      searched: GeoArea | null;
    };
    const bounds = boundsOf([
      ...areas.map(({ area }) => area),
      ...(searched ? [searched] : []),
    ]);
    let map: { remove(): void } | undefined;
    let observer: ResizeObserver | undefined;
    let cancelled = false;

    if (!bounds) return;

    import("maplibre-gl")
      .then((maplibre) => {
        if (cancelled || !container.current) return;

        maplibre.setWorkerUrl(mapWorkerUrl(maplibre.getVersion()));
        const fit = { padding: 24, maxZoom: 14 };
        const created = new maplibre.Map({
          container: container.current,
          bounds,
          fitBoundsOptions: fit,
          cooperativeGestures: true,
          attributionControl: { compact: true },
          locale,
          style: {
            version: 8,
            sources: {
              background: {
                type: "raster",
                tiles: [mapProvider.tiles],
                tileSize: mapProvider.tileSize,
                maxzoom: mapProvider.maxZoom,
                attribution: mapProvider.attribution,
              },
              areas: {
                type: "geojson",
                data: {
                  type: "FeatureCollection",
                  features: areas.map(({ id, name, area }) =>
                    featureOf(area, { id, name }),
                  ),
                },
              },
              searched: {
                type: "geojson",
                data: {
                  type: "FeatureCollection",
                  features: searched ? [featureOf(searched, {})] : [],
                },
              },
            },
            layers: [
              { id: "background", type: "raster", source: "background" },
              {
                id: "areas",
                type: "fill",
                source: "areas",
                paint: { "fill-color": "#1d4ed8", "fill-opacity": 0.15 },
              },
              {
                id: "area-edges",
                type: "line",
                source: "areas",
                paint: { "line-color": "#1d4ed8", "line-width": 2 },
              },
              {
                id: "searched",
                type: "line",
                source: "searched",
                paint: {
                  "line-color": "#9a3412",
                  "line-width": 2,
                  "line-dasharray": [2, 2],
                },
              },
            ],
          },
        });
        created.addControl(
          new maplibre.NavigationControl({ showCompass: false }),
        );

        // The page may settle its width after the map is made, as when a
        // column narrows: the map follows its box, and until the user has
        // moved it, it shows the areas in the middle again.
        let moved = false;
        created.on("movestart", (event) => {
          if (event.originalEvent) moved = true;
        });
        observer = new ResizeObserver(() => {
          created.resize();
          if (!moved) created.fitBounds(bounds, { ...fit, animate: false });
        });
        observer.observe(container.current);
        map = created;
      })
      // No WebGL, or the library could not load: the list still says it all.
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
      observer?.disconnect();
      map?.remove();
    };
  }, [shown]);

  if (failed || (areas.length === 0 && !searched)) {
    return null;
  }

  return (
    <figure className={styles.figure}>
      <div ref={container} className={styles.map} />
      <figcaption className="quiet">{caption}</figcaption>
    </figure>
  );
}
