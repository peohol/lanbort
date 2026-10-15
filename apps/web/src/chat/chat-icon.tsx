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
const phone = {
  line: "M9 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z",
  fills: { ink: circle(12, 17.5, 1.25) },
};

const shapes = {
  send: "M5 12h14M13 6l6 6-6 6",
  down: "M12 5v14M6 13l6 6 6-6",
  more: {
    fills: {
      ink: `${circle(6, 12, 1.5)}${circle(12, 12, 1.5)}${circle(18, 12, 1.5)}`,
    },
  },
  // A phone's shape, with the button as a dot: devices in general.
  device: phone,
  // Each kind of device, the same way: a phone or tablet with its button.
  mobile: phone,
  tablet: {
    line: "M6 5h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z",
    fills: { ink: circle(18, 12, 1.25) },
  },
  computer: "M6.5 5h11a2 2 0 0 1 2 2v8.5h-15V7a2 2 0 0 1 2-2zM2.5 18.5h19",
  // A screen and a phone shaped like `mobile` at two thirds: a device of
  // a kind no one has said, and all of one's devices (Mine enheter).
  anyDevice: {
    line: "M12.5 15.5h-8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2H15a2 2 0 0 1 2 2v1.5M16 9h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM5.5 19.5h6",
    fills: { ink: circle(18, 18.7, 0.85) },
  },
  signOut: "M10 5H5v14h5M14 8l4 4-4 4M18 12H9",
  key: `${circle(7, 12, 4)}M11 12h10v3M17 12v3`,
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
