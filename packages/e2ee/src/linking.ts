import { z } from "zod";
import {
  type Device,
  type DeviceCertificate,
  type DeviceKey,
  certifyDevice,
  createDeviceKey,
} from "./identity";
import {
  type AccountPackage,
  readAccountPackage,
  writeAccountPackage,
} from "./account-package";
import { encodeBase32, normalizeBase32 } from "./base32";
import { Secret, wipe } from "./secret";
import { bytesEqual, fromBase64, loadSuite, toBase64, utf8 } from "./suite";

/**
 * Linking a new device to an account (ADR-0010 §5). The new device shows
 * its one-time HPKE key and a checksum of its keys on the screen, as a QR
 * code or a 26-character code. An existing device compares them with the
 * request the server passes on, certifies the new device and seals the
 * account key to the HPKE key. The server only ever sees the sealed package,
 * and cannot swap a key without the checksum on the screen giving it away.
 */

/** What the new device sends to the server and shows on its screen. */
export interface LinkRequestKeys {
  deviceId: string;
  deviceKey: Uint8Array;
  linkKey: Uint8Array;
}

/** The new device's side of a link while it waits for approval. */
export interface PendingLink {
  keys: LinkRequestKeys;
  /** 26 characters, for typing on the existing device. */
  code: string;
  /** The QR code's content. */
  qr: string;
  /** Opens the package the existing device sealed, once it is there. */
  open(sealed: Uint8Array): Promise<OpenedLink>;
}

export interface OpenedLink extends AccountPackage {
  device: Device;
}

const codeLength = 26;
const qrPrefix = "LANBORT-LINK:1:";
const packageInfo = utf8("Lanbort link package v1");

/** 128 bits of SHA-256 over the request's keys, in Crockford base32. */
export async function linkCode(keys: LinkRequestKeys): Promise<string> {
  const material = utf8(
    JSON.stringify([
      "Lanbort link code v1",
      keys.deviceId,
      toBase64(keys.deviceKey),
      toBase64(keys.linkKey),
    ]),
  );
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", material),
  ).subarray(0, 16);
  // 26 characters of 5 bits carry 130 bits; the top two are zero.
  return encodeBase32(digest, codeLength);
}

/** A typed code as the user may enter it: any case, spaces, dashes, O for 0. */
export const normalizeLinkCode = normalizeBase32;

const toBase64Url = (bytes: Uint8Array) =>
  toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (text: string) =>
  fromBase64(text.replace(/-/g, "+").replace(/_/g, "/"));

/** What a scanned QR code says, or undefined if it is not a link code. */
export function readLinkQr(
  content: string,
): { linkKey: Uint8Array; code: string } | undefined {
  if (!content.startsWith(qrPrefix)) return undefined;
  const [key, code] = content.slice(qrPrefix.length).split(":");
  try {
    return key && code?.length === codeLength
      ? { linkKey: fromBase64Url(key), code }
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Which of the account's pending requests the screen shows: the one whose
 * keys give the code (and, from a QR code, whose link key it is). None if
 * the server's copy differs from the screen.
 */
export async function matchLinkRequest<R extends LinkRequestKeys>(
  requests: readonly R[],
  shown: { code: string; linkKey?: Uint8Array },
): Promise<R | undefined> {
  const code = normalizeLinkCode(shown.code);
  for (const request of requests) {
    if (
      (await linkCode(request)) === code &&
      (shown.linkKey === undefined ||
        bytesEqual(shown.linkKey, request.linkKey))
    ) {
      return request;
    }
  }
  return undefined;
}

/** Run on the new device, signed in but without chat. */
export async function startLink(
  deviceId: string = crypto.randomUUID(),
): Promise<PendingLink> {
  const { hpke } = await loadSuite();
  const deviceKey: DeviceKey = await createDeviceKey();
  const { privateKey, publicKey } = await hpke.generateKeyPair();
  const keys: LinkRequestKeys = {
    deviceId,
    deviceKey: deviceKey.publicKey,
    linkKey: await hpke.exportPublicKey(publicKey),
  };
  const code = await linkCode(keys);
  const linkSecret = new Secret(privateKey);

  return {
    keys,
    code,
    qr: `${qrPrefix}${toBase64Url(keys.linkKey)}:${code}`,
    async open(sealed) {
      const { enc, ct } = sealedSchema.parse(
        JSON.parse(new TextDecoder().decode(sealed)),
      );
      const plain = await hpke.open(
        linkSecret.reveal(),
        enc,
        ct,
        packageInfo,
        utf8(deviceId),
      );
      try {
        const opened = readAccountPackage(plain);
        const { account } = opened;
        return {
          ...opened,
          // Ed25519 signatures are deterministic: this is the very
          // certificate the approving device signed.
          device: {
            certificate: await certifyDevice(
              account,
              deviceId,
              deviceKey.publicKey,
            ),
            signingKey: deviceKey.signingKey,
          },
        };
      } finally {
        wipe(plain);
      }
    },
  };
}

const bytes = z.string().transform((value) => fromBase64(value));
const sealedSchema = z.strictObject({ enc: bytes, ct: bytes });

/**
 * Run on an existing device once the user has compared the code: certifies
 * the new device and seals the account key to it, with the key of the
 * history archive when the user chose to move the history, and the
 * recovery key's backup key when there is one.
 */
export async function approveLink(
  request: LinkRequestKeys,
  contents: AccountPackage,
): Promise<{ certificate: DeviceCertificate; sealed: Uint8Array }> {
  const { hpke } = await loadSuite();
  const certificate = await certifyDevice(
    contents.account,
    request.deviceId,
    request.deviceKey,
  );
  const plain = writeAccountPackage(contents);
  try {
    const { enc, ct } = await hpke.seal(
      await hpke.importPublicKey(request.linkKey),
      plain,
      packageInfo,
      utf8(request.deviceId),
    );
    return {
      certificate,
      sealed: utf8(JSON.stringify({ enc: toBase64(enc), ct: toBase64(ct) })),
    };
  } finally {
    wipe(plain);
  }
}
