/**
 * The app's line icons (Tomat, design/README.md): one stroke on a 24-point
 * grid, the same set the prototypes use. An icon always stands beside words
 * that say what it means (UX-A11Y-005), so it says nothing to assistive
 * technology itself.
 */
const paths = {
  home: "M4 10.5L12 4l8 6.5V20h-5v-6H9v6H4z",
  find: "M11 5a6 6 0 1 0 0 12a6 6 0 1 0 0-12M20 20l-4.5-4.5",
  loans: "M5 8h14l-3.5-3.5M19 16H5l3.5 3.5",
  things: "M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8",
  conversations: "M5 5h14v10h-9l-5 4z",
  bell: "M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0",
  back: "M15 5l-7 7 7 7",
  chevron: "M9 5l7 7-7 7",
  close: "M6 6l12 12M18 6L6 18",
  environment: "M4 20V9.5L12 4l8 5.5V20zM10 20v-5h4v5",
  clock: "M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M12 8v4l3 2",
  check: "M5 12.5l4.5 4.5L19 7.5",
  info: "M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M12 8v4M12 15.5v.5",
  warning: "M12 4l9 16H3zM12 10v4M12 17v.5",
  lock: "M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3",
  attention: "M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16",
  shield: "M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z",
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
} as const;

export type IconName = keyof typeof paths;

/** Icons whose middle is a filled dot: the mark for «Venter på deg». */
const dotted: ReadonlySet<IconName> = new Set(["attention"]);

export function Icon({
  name,
  className = "icon",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      className={className}
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width="24"
      height="24"
    >
      <path d={paths[name]} />
      {dotted.has(name) && (
        <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
      )}
    </svg>
  );
}
