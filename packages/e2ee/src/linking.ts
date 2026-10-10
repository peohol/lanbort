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
import { decodeBase32, encodeBase32, normalizeBase32 } from "./base32";
import { Secret, wipe } from "./secret";
import { bytesEqual, fromBase64, loadSuite, toBase64, utf8 } from "./suite";

/**
 * Linking a new device to an account (ADR-0010 §5). The new device makes a
 * one-time secret and shows it on its screen, as a QR code or a 26-character
 * code. The server gets the device's public keys and a commitment to them
 * under that secret, never the secret itself. An existing device that is
 * shown the secret finds the request whose commitment it opens, certifies
 * the new device and seals the account key to the new device's one-time
 * HPKE key, inside a layer only the secret opens. So the server can neither
 * swap the new device's keys nor hand it an account key of its own.
 */

/** What the new device sends to the server: public halves and a commitment. */
export interface LinkRequestKeys {
  deviceId: string;
  deviceKey: Uint8Array;
  linkKey: Uint8Array;
  /** Binds the keys to the secret on the screen; reveals nothing of it. */
  commitment: Uint8Array;
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
const secretBytes = 16;
const qrPrefix = "LANBORT-LINK:2:";
const packageInfo = utf8("Lanbort link package v2");

/** The keys and the secret, as both devices hash and authenticate them. */
const transcript = (
  keys: Pick<LinkRequestKeys, "deviceId" | "deviceKey" | "linkKey">,
) =>
  utf8(
    JSON.stringify([
      keys.deviceId,
      toBase64(keys.deviceKey),
      toBase64(keys.linkKey),
    ]),
  );

async function hkdf(secret: Uint8Array, info: string, length: number) {
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(32),
        info: utf8(info),
      },
      await crypto.subtle.importKey(
        "raw",
        new Uint8Array(secret),
        "HKDF",
        false,
        ["deriveBits"],
      ),
      length * 8,
    ),
  );
}

/** HMAC-SHA256 under a key from the secret, over the request's keys. */
export async function commit(
  secret: Uint8Array,
  keys: Pick<LinkRequestKeys, "deviceId" | "deviceKey" | "linkKey">,
): Promise<Uint8Array> {
  const raw = await hkdf(secret, "Lanbort link commitment v2", 32);
  const key = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  wipe(raw);
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, transcript(keys)),
  );
}

/** The AES-GCM key of the package's inner layer, from the secret. */
async function packageKey(secret: Uint8Array) {
  const raw = await hkdf(secret, "Lanbort link package key v2", 32);
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  wipe(raw);
  return key;
}

/** The secret a code carries, or undefined if it is not a link code. */
function secretOf(code: string): Uint8Array | undefined {
  return decodeBase32(normalizeLinkCode(code), codeLength, secretBytes);
}

/** A typed code as the user may enter it: any case, spaces, dashes, O for 0. */
export const normalizeLinkCode = normalizeBase32;

/** What a scanned QR code says, or undefined if it is not a link code. */
export function readLinkQr(content: string): { code: string } | undefined {
  if (!content.startsWith(qrPrefix)) return undefined;
  const code = content.slice(qrPrefix.length);
  return secretOf(code) ? { code } : undefined;
}

/** Whether `code` opens the request's commitment, so its keys are the ones on the screen. */
async function opens(
  secret: Uint8Array,
  request: LinkRequestKeys,
): Promise<boolean> {
  return bytesEqual(await commit(secret, request), request.commitment);
}

/**
 * Which of the account's pending requests the screen shows: the one whose
 * commitment the code opens. None if the server's copy of the keys differs
 * from the device's own.
 */
export async function matchLinkRequest<R extends LinkRequestKeys>(
  requests: readonly R[],
  shown: { code: string },
): Promise<R | undefined> {
  const secret = secretOf(shown.code);
  if (!secret) return undefined;
  try {
    for (const request of requests) {
      if (await opens(secret, request)) return request;
    }
    return undefined;
  } finally {
    wipe(secret);
  }
}

/** Run on the new device, signed in but without chat. */
export async function startLink(
  deviceId: string = crypto.randomUUID(),
): Promise<PendingLink> {
  const { hpke } = await loadSuite();
  const deviceKey: DeviceKey = await createDeviceKey();
  const { privateKey, publicKey } = await hpke.generateKeyPair();
  const secret = crypto.getRandomValues(new Uint8Array(secretBytes));
  const shown = {
    deviceId,
    deviceKey: deviceKey.publicKey,
    linkKey: await hpke.exportPublicKey(publicKey),
  };
  const keys: LinkRequestKeys = {
    ...shown,
    commitment: await commit(secret, shown),
  };
  // 26 characters of 5 bits carry 130 bits; the top two are zero.
  const code = encodeBase32(secret, codeLength);
  const linkSecret = new Secret({ privateKey, secret });

  return {
    keys,
    code,
    qr: `${qrPrefix}${code}`,
    async open(sealed) {
      const { enc, ct } = sealedSchema.parse(
        JSON.parse(new TextDecoder().decode(sealed)),
      );
      const outer = new Uint8Array(
        await hpke.open(
          linkSecret.reveal().privateKey,
          enc,
          ct,
          packageInfo,
          transcript(shown),
        ),
      );
      let plain: Uint8Array | undefined;
      try {
        // Only a device that was shown the secret could make this layer.
        plain = new Uint8Array(
          await crypto.subtle.decrypt(
            {
              name: "AES-GCM",
              iv: outer.slice(0, 12),
              additionalData: transcript(shown),
            },
            await packageKey(linkSecret.reveal().secret),
            outer.slice(12),
          ),
        );
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
        wipe(outer, ...(plain ? [plain] : []));
      }
    },
  };
}

const bytes = z.string().transform((value) => fromBase64(value));
const sealedSchema = z.strictObject({ enc: bytes, ct: bytes });

/**
 * Run on an existing device once the user has shown it the new device's
 * code: certifies the new device and seals the account package to it. It
 * refuses a request whose commitment the code does not open.
 */
export async function approveLink(
  request: LinkRequestKeys,
  code: string,
  contents: AccountPackage,
): Promise<{ certificate: DeviceCertificate; sealed: Uint8Array }> {
  const secret = secretOf(code);
  if (!secret || !(await opens(secret, request))) {
    throw new Error("The code is not this request's");
  }
  const { hpke } = await loadSuite();
  const certificate = await certifyDevice(
    contents.account,
    request.deviceId,
    request.deviceKey,
  );
  const plain = writeAccountPackage(contents);
  let inner: Uint8Array | undefined;
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: transcript(request) },
        await packageKey(secret),
        plain,
      ),
    );
    inner = new Uint8Array(iv.length + ciphertext.length);
    inner.set(iv);
    inner.set(ciphertext, iv.length);
    const { enc, ct } = await hpke.seal(
      await hpke.importPublicKey(request.linkKey),
      inner,
      packageInfo,
      transcript(request),
    );
    return {
      certificate,
      sealed: utf8(JSON.stringify({ enc: toBase64(enc), ct: toBase64(ct) })),
    };
  } finally {
    wipe(plain, secret, ...(inner ? [inner] : []));
  }
}
