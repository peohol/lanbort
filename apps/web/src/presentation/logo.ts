/**
 * Lånbort's mark (Tomat): an «l» in tomat whose stem is also the stem of a
 * «b», with the b's bowl in the colour of the text. One stroke on a
 * 32-point grid, drawn by `Logo` in the app and by `logoSvg` for the
 * browser's tab, so both are the same shape.
 */
export const logo = {
  viewBox: "0 0 32 32",
  stroke: 4,
  stem: "M11 3.5v25",
  bowl: "M11 13.5h3.5a6.5 6.5 0 0 1 0 13H11",
} as const;

/**
 * The mark's colours outside the app, where no token reaches: the light
 * theme's tomat and text on a surface (globals.css, kept equal by
 * logo.test.ts), so it reads in a tab whatever the browser's theme.
 */
export const iconColours = {
  stem: "#b0563a",
  bowl: "#1e2733",
  background: "#ffffff",
} as const;

/**
 * The mark as an SVG file on its own background, with room around it. A
 * tab shows the background's rounded corners; a phone's home screen rounds
 * them itself and wants it square.
 */
export function logoSvg({ radius = 8 } = {}) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 -3 38 38">`,
    `<rect x="-3" y="-3" width="38" height="38" rx="${radius}" fill="${iconColours.background}"/>`,
    `<g fill="none" stroke-width="${logo.stroke}" stroke-linecap="round">`,
    `<path d="${logo.bowl}" stroke="${iconColours.bowl}" stroke-linecap="butt" stroke-linejoin="round"/>`,
    `<path d="${logo.stem}" stroke="${iconColours.stem}"/>`,
    `</g></svg>`,
  ].join("");
}
