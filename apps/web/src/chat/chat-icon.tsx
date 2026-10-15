import {
  circle,
  Icon,
  type IconName,
  type IconShape,
  IconSvg,
} from "@/components/icon";

/**
 * Line icons only private chat uses, drawn like the app's `Icon` (one
 * stroke on a 24-point grid). Like those, they stand beside words that say
 * what they mean.
 */
const shapes = {
  send: "M5 12h14M13 6l6 6-6 6",
  down: "M12 5v14M6 13l6 6 6-6",
  more: {
    fills: {
      ink: `${circle(6, 12, 1.5)}${circle(12, 12, 1.5)}${circle(18, 12, 1.5)}`,
    },
  },
  // A phone's shape, with the button as a dot.
  device: {
    line: "M9 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z",
    fills: { ink: circle(12, 17.5, 1.25) },
  },
  signOut: "M10 5H5v14h5M14 8l4 4-4 4M18 12H9",
  key: "M8 10a4 4 0 1 0 0 .01M11.5 12H21v3M17 12v3",
  copy: "M9 9h11v11H9zM5 15V4h11",
} satisfies Record<string, IconShape>;

export type ChatIconName = keyof typeof shapes;

export const ChatIcon = ({ name }: { name: ChatIconName }) => (
  <IconSvg shape={shapes[name]} />
);

/** Any icon chat shows: the app's own, or one of chat's. */
export type AnyIconName = IconName | ChatIconName;

export const AnyIcon = ({ name }: { name: AnyIconName }) =>
  name in shapes ? (
    <ChatIcon name={name as ChatIconName} />
  ) : (
    <Icon name={name as IconName} />
  );
