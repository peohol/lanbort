"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { announce } from "@/components/announcer";
import {
  type Theme,
  themeAttribute,
  themeCookieString,
  themeLabels,
  themes,
} from "@/presentation/theme";

/** Keeps `theme` on this device and shows it on the page at once. */
function applyTheme(theme: Theme) {
  document.cookie = themeCookieString(theme, location.protocol === "https:");
  const attribute = themeAttribute(theme);
  if (attribute) document.documentElement.dataset.theme = attribute;
  else delete document.documentElement.dataset.theme;
}

/**
 * Light, dark, or as the device is set. The server reads the choice for
 * every page after, and puts it on the page before it is shown.
 */
export function ThemeChoice({ initial }: { initial: Theme }) {
  const router = useRouter();
  const [theme, setTheme] = useState(initial);

  function choose(next: Theme) {
    setTheme(next);
    applyTheme(next);
    announce("Utseendet er endret.");
    router.refresh();
  }

  return (
    <fieldset>
      <legend>Tema</legend>
      {themes.map((option) => (
        <div key={option} className="checkbox">
          <input
            id={`tema-${option}`}
            type="radio"
            name="tema"
            value={option}
            checked={theme === option}
            onChange={() => choose(option)}
          />
          <label htmlFor={`tema-${option}`}>{themeLabels[option]}</label>
        </div>
      ))}
      <p className="help">
        Valget gjelder bare denne enheten. «Følg systemet» bruker lyst eller
        mørkt slik enheten er innstilt.
      </p>
    </fieldset>
  );
}
