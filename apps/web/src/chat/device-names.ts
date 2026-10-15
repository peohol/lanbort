import type {
  ChatDeviceBrowser,
  ChatDeviceDescription,
  ChatDeviceKind,
  ChatDeviceLabel,
  ChatDeviceSystem,
  ChatLinkRequest,
} from "@lanbort/contracts";
import { productTimeZone } from "@lanbort/contracts";
import type { ChatIconName } from "./chat-icon";

const addedFormat = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: productTimeZone,
});

export const deviceKindLabels: Record<ChatDeviceKind, string> = {
  mobile: "Mobil",
  tablet: "Nettbrett",
  computer: "PC",
};

const systemLabels: Record<ChatDeviceSystem, string> = {
  windows: "Windows",
  macos: "macOS",
  ios: "iOS",
  ipados: "iPadOS",
  android: "Android",
  chromeos: "ChromeOS",
  linux: "Linux",
};

const browserLabels: Record<ChatDeviceBrowser, string> = {
  chrome: "Chrome",
  edge: "Edge",
  firefox: "Firefox",
  safari: "Safari",
  opera: "Opera",
  samsung: "Samsung Internet",
  brave: "Brave",
};

/** What a kind of device is called on its own system. */
const productNames: Partial<Record<string, string>> = {
  "ios mobile": "iPhone",
  "ipados tablet": "iPad",
  "macos computer": "Mac",
  "chromeos computer": "Chromebook",
};

const kindWord = (kind: ChatDeviceKind) =>
  kind === "computer" ? "PC" : deviceKindLabels[kind].toLowerCase();

/** «iPhone», «Windows-PC», «Android-nettbrett», or just «Nettbrett». */
function deviceWord({ kind, system }: ChatDeviceDescription) {
  if (kind && system) {
    return (
      productNames[`${system} ${kind}`] ??
      `${systemLabels[system]}-${kindWord(kind)}`
    );
  }
  return kind ? deviceKindLabels[kind] : system && systemLabels[system];
}

/**
 * The name suggested from what a device is: «Windows-PC · Edge», «iPhone ·
 * Safari». Null when nothing is known, so nothing is made up.
 */
export function suggestedName(description: ChatDeviceDescription) {
  const word = deviceWord(description);
  if (!word) return null;
  return description.browser
    ? `${word} · ${browserLabels[description.browser]}`
    : word;
}

/** A device's label, or what a device waiting to be linked says it is. */
export interface Named {
  readonly deviceId: string;
  readonly label?: ChatDeviceLabel | null;
}

/** What a waiting device says it is, as a label: unconfirmed. */
export const claimed = (request: ChatLinkRequest): Named => ({
  deviceId: request.deviceId,
  label: { name: null, ...request.description },
});

/** The start of a device's id, which tells it apart from others. */
const shortId = (deviceId: string, length = 4) =>
  deviceId.slice(0, length).toUpperCase();

/** As much of the start of these ids as tells each apart, at least four. */
function distinguishingLength(ids: readonly string[]) {
  let length = 4;
  const longest = Math.max(...ids.map((id) => id.length));
  while (
    length < longest &&
    new Set(ids.map((id) => shortId(id, length))).size < ids.length
  ) {
    length += 1;
  }
  return length;
}

/**
 * What a device is called: the name its owner gave it, the one suggested
 * from what it is, or, when nothing is known, the start of its id.
 */
export const deviceName = ({ deviceId, label }: Named) =>
  label?.name ??
  (label && suggestedName(label)) ??
  `Enhet ${shortId(deviceId)}`;

/**
 * The names of the devices in one list, by id, told apart: two that would
 * be called the same, such as two windows of one browser, also show as
 * much of the start of their ids as tells them apart.
 */
export function distinctNames(devices: readonly Named[]) {
  const named = devices.map((device) => ({
    id: device.deviceId,
    name: deviceName(device),
  }));
  // Names told apart as a reader would: «Mobil» and «mobil» are the same.
  const seen = (name: string) => name.normalize("NFKC").toLocaleLowerCase();
  const alike = (name: string) =>
    named.filter((other) => seen(other.name) === seen(name));
  return new Map(
    named.map(({ id, name }) => {
      const ids = alike(name).map((other) => other.id);
      return [
        id,
        ids.length > 1
          ? `${name} (${shortId(id, distinguishingLength(ids))})`
          : name,
      ];
    }),
  );
}

/** The system and browser, when known: «iOS · Safari». */
export const deviceDetails = (label: ChatDeviceLabel | null | undefined) =>
  [
    label?.system && systemLabels[label.system],
    label?.browser && browserLabels[label.browser],
  ]
    .filter(Boolean)
    .join(" · ");

/** The kind's own icon; a kind no one has said, a neutral one. */
export const deviceIcon = (
  label: ChatDeviceLabel | null | undefined,
): ChatIconName => label?.kind ?? "anyDevice";

/**
 * How many devices can read the conversations, where Mine enheter is
 * offered: «2 enheter kan lese samtalene dine».
 */
export function readersText({
  devices,
}: {
  devices: readonly { revokedAt: string | null }[];
}) {
  const count = devices.filter((d) => d.revokedAt === null).length;

  return count === 0
    ? "Privat chat er ikke slått på"
    : `${count === 1 ? "1 enhet kan" : `${count} enheter kan`} lese samtalene dine`;
}

/** When a device was added: «3. mars 2026 kl. 12:10». */
export const addedAt = (iso: string) => addedFormat.format(new Date(iso));
