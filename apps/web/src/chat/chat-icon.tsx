import { Icon, type IconName } from "@/components/icon";

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
  signOut: "M10 5H5v14h5M14 8l4 4-4 4M18 12H9",
  key: "M8 10a4 4 0 1 0 0 .01M11.5 12H21v3M17 12v3",
  copy: "M9 9h11v11H9zM5 15V4h11",
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

/** Any icon chat shows: the app's own, or one of chat's. */
export type AnyIconName = IconName | ChatIconName;

export const AnyIcon = ({ name }: { name: AnyIconName }) =>
  name in paths ? (
    <ChatIcon name={name as ChatIconName} />
  ) : (
    <Icon name={name as IconName} />
  );
