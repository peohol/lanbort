/**
 * Lånbort's mark (Tomat): an «l» in tomat whose stem is also the stem of a
 * «b», with the b's bowl in the colour of the text. The stem and the bowl
 * have the size and shape of the b in Quicksand, the headings' font, at
 * weight 700 (its units, 1000 to the em), but one stroke of the same width
 * all the way round, so the mark is not the font's letter. `Brand` draws
 * it in the app and `logoSvg` for the browser's tab, so both are the same.
 */
const box = { x: -48, y: 0, size: 750 };

export const logo = {
  box,
  viewBox: `${box.x} ${box.y} ${box.size} ${box.size}`,
  stroke: 118,
  stem: "M125 60V690",
  bowl: "M129 473.5a200 216.5 0 1 0 400 0a200 216.5 0 1 0-400 0",
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
 * tab shows the background's rounded corners (`radius`, a share of its
 * side); a phone's home screen rounds them itself and wants it square.
 */
export function logoSvg({ radius = 0.2 } = {}) {
  const room = box.size * 0.12;
  const [x, y, size] = [box.x - room, box.y - room, box.size + 2 * room];

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${size} ${size}">`,
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * radius}" fill="${iconColours.background}"/>`,
    `<g fill="none" stroke-width="${logo.stroke}" stroke-linecap="round">`,
    `<path d="${logo.bowl}" stroke="${iconColours.bowl}"/>`,
    `<path d="${logo.stem}" stroke="${iconColours.stem}"/>`,
    `</g></svg>`,
  ].join("");
}
