/**
 * Line icons only private chat uses, drawn like the app's `Icon` (one
 * stroke on a 24-point grid). Like those, they stand beside words that say
 * what they mean.
 */
const paths = {
  send: "M5 12h14M13 6l6 6-6 6",
  down: "M12 5v14M6 13l6 6 6-6",
  more: "M6 12h.01M12 12h.01M18 12h.01",
  device: "M8 3h8v18H8zM11 18h2",
  scan: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
} as const;

export type ChatIconName = keyof typeof paths;

export function ChatIcon({ name }: { name: ChatIconName }) {
  return (
    <svg
      className="icon"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      // Dots are drawn as round line ends, so they need a heavier line.
      style={name === "more" ? { strokeWidth: 3 } : undefined}
    >
      <path d={paths[name]} />
    </svg>
  );
}
