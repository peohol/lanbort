"use client";

import { coarseCoordinate } from "@lanbort/contracts";
import { type MouseEvent, useState, useSyncExternalStore } from "react";

const unchanging = () => () => {};

/**
 * «Finn nær meg» (WP-62): asks the browser once where the user is and
 * searches near it. The position is a search aid only (vision 08): it is made
 * coarse here, before it leaves the device, and is never stored. Shown only
 * where the browser can tell; the place field works everywhere.
 */
export function NearMeButton() {
  // Known only in the browser; the server renders no button.
  const supported = useSyncExternalStore(
    unchanging,
    () => "geolocation" in navigator,
    () => false,
  );
  const [state, setState] = useState<"idle" | "locating" | "failed">("idle");

  if (!supported) {
    return null;
  }

  const locate = (event: MouseEvent<HTMLButtonElement>) => {
    const form = event.currentTarget.form;

    if (!form) return;

    setState("locating");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const fields = {
          sted: "",
          punktsted: "",
          punkt: `${coarseCoordinate(coords.latitude)},${coarseCoordinate(coords.longitude)}`,
        };

        for (const [name, value] of Object.entries(fields)) {
          let field = form.elements.namedItem(name) as HTMLInputElement | null;

          if (!field) {
            field = document.createElement("input");
            field.type = "hidden";
            field.name = name;
            form.append(field);
          }

          field.value = value;
        }

        form.requestSubmit();
      },
      () => setState("failed"),
      { enableHighAccuracy: false, maximumAge: 10 * 60_000, timeout: 15_000 },
    );
  };

  return (
    <>
      <button type="button" onClick={locate} disabled={state === "locating"}>
        {state === "locating" ? "Finner posisjonen …" : "Bruk der jeg er"}
      </button>
      {state === "failed" && (
        <p className="error" role="alert">
          Fikk ikke vite hvor du er. Skriv inn et sted i stedet.
        </p>
      )}
    </>
  );
}
