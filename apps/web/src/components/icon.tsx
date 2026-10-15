/**
 * The app's line icons (Tomat, design/README.md): one stroke on a 24-point
 * grid, the same set the prototypes use. An icon always stands beside words
 * that say what it means (UX-A11Y-005), so it says nothing to assistive
 * technology itself.
 *
 * An icon may also have flat areas under its line. `ink` is always drawn,
 * in the line's colour (a dot). The others are its filled form, shown only
 * where the icon marks the current place (globals.css): `soft` and `accent`
 * in tomat, `light` in the surface colour, so each follows the theme.
 */
export type IconTone = "ink" | "soft" | "accent" | "light";

export type IconShape =
  | string
  | {
      readonly line?: string;
      readonly fills: Readonly<Partial<Record<IconTone, string>>>;
    };

/** A circle as a path, for lines and fills alike. */
export const circle = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r}a${r} ${r} 0 1 0 0 ${2 * r}a${r} ${r} 0 1 0 0-${2 * r}`;

/** A closed outline whose whole inside takes one tone. */
const filled = (tone: IconTone, line: string): IconShape => ({
  line,
  fills: { [tone]: line },
});

const cube = {
  top: "M4 8l8-4 8 4-8 4z",
  left: "M4 8l8 4v8l-8-4z",
  right: "M20 8l-8 4v8l8-4z",
};

const bubble = "M8 5h8a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3h-6l-5 4V8a3 3 0 0 1 3-3z";

const houses = {
  front: "M3 20v-8l5-4.5 5 4.5v8z",
  back: "M11.2 10.3L16.5 5l4.5 4.5V20h-8v-8z",
};

const shapes = {
  home: filled("soft", "M4 10.5L12 4l8 6.5V20h-5v-6H9v6H4z"),
  find: {
    line: `${circle(11, 11, 6)}M20 20l-4.5-4.5`,
    fills: { light: circle(11, 11, 6) },
  },
  loans: filled("soft", "M5 8h14l-3.5-3.5M19 16H5l3.5 3.5"),
  things: {
    line: "M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8",
    fills: { light: cube.top, accent: cube.left, soft: cube.right },
  },
  conversations: filled("light", bubble),
  bell: "M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0",
  back: "M15 5l-7 7 7 7",
  chevron: "M9 5l7 7-7 7",
  close: "M6 6l12 12M18 6L6 18",
  environment: {
    line: `${houses.front}M6.5 20v-4h3v4M11.2 10.3L16.5 5l4.5 4.5V20h-8`,
    fills: { soft: houses.front, light: houses.back },
  },
  clock: "M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M12 8v4l3 2",
  check: "M5 12.5l4.5 4.5L19 7.5",
  info: "M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M12 8v4M12 15.5v.5",
  warning: "M12 4l9 16H3zM12 10v4M12 17v.5",
  lock: "M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3",
  attention: {
    line: circle(12, 12, 8),
    fills: { ink: circle(12, 12, 3) },
  },
  shield: "M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z",
  crown: "M5 17L3.5 8l4.5 3.5L12 5l4 6.5L20.5 8 19 17zM5 20h14",
  signOut: "M15 5h4v14h-4M10 8l-4 4 4 4M6 12h10",
  offline:
    "M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M19 13a10 10 0 0 0-2.4-1.8M12 20h.01",
  person:
    "M12 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 1 0 0 7M5.5 20a6.5 6.5 0 0 1 13 0",
  personAdd:
    "M10 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 1 0 0 7M3.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6",
  personRemove:
    "M10 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 1 0 0 7M3.5 20a6.5 6.5 0 0 1 13 0M16 11h6",
  personCheck:
    "M10 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 1 0 0 7M3.5 20a6.5 6.5 0 0 1 13 0M16 11l2 2 4-4",
  people:
    "M9 11a3 3 0 1 0 0-6a3 3 0 1 0 0 6M3.5 19a5.5 5.5 0 0 1 11 0M16 5.4a3 3 0 0 1 0 5.4M17.5 13.6a5.5 5.5 0 0 1 3 5.4",
  block: "M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M6.4 6.4l11.2 11.2",
  flag: "M6 21V4M6 4h11l-2 4 2 4H6",
  hidden:
    "M3 3l18 18M10.6 6.1A9 9 0 0 1 21 12a14 14 0 0 1-2.6 3.3M6.1 7.6A14 14 0 0 0 3 12c2 4 5.5 6 9 6a8.6 8.6 0 0 0 3.3-.7",
  plus: "M12 5v14M5 12h14",
  trash: "M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12",
  edit: "M5 19h4L19 9l-4-4L5 15zM13.5 6.5l4 4",
  calendar: "M5 6h14v14H5zM5 10h14M9 4v4M15 4v4",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  move: "M4 12h14M14 7l5 5-5 5",
  theme: "M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z",
  mail: "M4 6h16v12H4zM4 6l8 7 8-7",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h-3zM20 17v3h-3",
  scan: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
} satisfies Record<string, IconShape>;

export type IconName = keyof typeof shapes;

/** An icon's lines and flat areas, flats first so the line lies on top. */
export function IconSvg({
  shape,
  className = "icon",
}: {
  shape: IconShape;
  className?: string | undefined;
}) {
  const { line, fills } =
    typeof shape === "string" ? { line: shape, fills: {} } : shape;

  return (
    <svg
      className={className}
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width="24"
      height="24"
    >
      {Object.entries(fills).map(([tone, d]) => (
        <path key={tone} className={`icon-fill icon-${tone}`} d={d} />
      ))}
      {line && <path d={line} />}
    </svg>
  );
}

export function Icon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  return <IconSvg shape={shapes[name]} className={className} />;
}
