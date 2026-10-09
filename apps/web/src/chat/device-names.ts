import { productTimeZone } from "@lanbort/contracts";

const addedFormat = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: productTimeZone,
});

/**
 * A device is named by the start of its id (14): the browser and system
 * are not guessed, so the name says nothing that may be wrong.
 */
export const deviceName = (device: { deviceId: string }) =>
  `Enhet ${device.deviceId.slice(0, 4).toUpperCase()}`;

/** When a device was added: «3. mars 2026 kl. 12:10». */
export const addedAt = (iso: string) => addedFormat.format(new Date(iso));
