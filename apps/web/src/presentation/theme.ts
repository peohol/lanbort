/**
 * The app's colours: light or dark as the device is set, or the one the
 * user chose under Konto › Utseende. The choice belongs to the device, so
 * it holds before signing in, and the server puts it on the page so the
 * page never flashes in the other theme.
 */
export const themes = ["system", "light", "dark"] as const;

export type Theme = (typeof themes)[number];

export const themeLabels: Record<Theme, string> = {
  system: "Følg systemet",
  light: "Lyst",
  dark: "Mørkt",
};

/** The cookie that keeps a chosen theme; without it the device decides. */
export const themeCookie = "lanbort-tema";

/** A year: a choice stays until it is changed. */
const keepFor = 365 * 24 * 60 * 60;

export const parseTheme = (value: string | undefined): Theme =>
  themes.find((theme) => theme === value) ?? "system";

/** `data-theme` on `<html>`, read by globals.css; none follows the device. */
export const themeAttribute = (theme: Theme) =>
  theme === "system" ? undefined : theme;

/** The cookie that keeps `theme` on this device, or clears it. */
export const themeCookieString = (theme: Theme, secure: boolean) =>
  [
    `${themeCookie}=${theme === "system" ? "" : theme}`,
    "Path=/",
    `Max-Age=${theme === "system" ? 0 : keepFor}`,
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
