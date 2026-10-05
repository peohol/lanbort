import { z } from "zod";
import { Secret } from "./secret";
import {
  fromBase64,
  fromUtf8,
  loadSuite,
  signFor,
  toBase64,
  utf8,
  verifyFor,
} from "./suite";

/**
 * An account's identity key (ADR-0010). It never leaves the account's own
 * authorized devices except encrypted under a key only the user holds. It
 * signs the account's device certificates and revocations, and its public
 * half is what contacts pin and compare as the security code.
 */
export interface AccountKey {
  accountId: string;
  publicKey: Uint8Array;
  signingKey: Secret<Uint8Array>;
}

/** One device's MLS signature key pair. The private half stays on the device. */
export interface DeviceKey {
  publicKey: Uint8Array;
  signingKey: Secret<Uint8Array>;
}

/** States that a device signature key belongs to an account. */
export interface DeviceCertificate {
  accountId: string;
  deviceId: string;
  deviceKey: Uint8Array;
  accountKey: Uint8Array;
  signature: Uint8Array;
}

/** States that a device no longer belongs to the account. */
export interface DeviceRevocation {
  accountId: string;
  deviceId: string;
  accountKey: Uint8Array;
  signature: Uint8Array;
}

export interface Device {
  certificate: DeviceCertificate;
  signingKey: Secret<Uint8Array>;
}

/** Identifies one device in a conversation. */
export interface DeviceRef {
  accountId: string;
  deviceId: string;
}

async function generateKeyPair() {
  const { signature } = await loadSuite();
  const { publicKey, signKey } = await signature.keygen();
  return { publicKey, signingKey: new Secret(signKey) };
}

export async function createAccountKey(accountId: string): Promise<AccountKey> {
  return { accountId, ...(await generateKeyPair()) };
}

/** Run on a new device; only the public half is sent for certification. */
export const createDeviceKey = (): Promise<DeviceKey> => generateKeyPair();

const certificateBody = (
  c: Pick<
    DeviceCertificate,
    "accountId" | "deviceId" | "deviceKey" | "accountKey"
  >,
) =>
  utf8(
    JSON.stringify([
      c.accountId,
      c.deviceId,
      toBase64(c.deviceKey),
      toBase64(c.accountKey),
    ]),
  );

const revocationBody = (
  r: Pick<DeviceRevocation, "accountId" | "deviceId" | "accountKey">,
) => utf8(JSON.stringify([r.accountId, r.deviceId, toBase64(r.accountKey)]));

/** Run on a device that already holds the account key. */
export async function certifyDevice(
  account: AccountKey,
  deviceId: string,
  deviceKey: Uint8Array,
): Promise<DeviceCertificate> {
  const body = {
    accountId: account.accountId,
    deviceId,
    deviceKey,
    accountKey: account.publicKey,
  };
  return {
    ...body,
    signature: await signFor(
      "device-certificate",
      account.signingKey.reveal(),
      certificateBody(body),
    ),
  };
}

export const verifyDeviceCertificate = (c: DeviceCertificate) =>
  verifyFor(
    "device-certificate",
    c.accountKey,
    certificateBody(c),
    c.signature,
  );

/** The first device of an account, or any device the account key is on. */
export async function createDevice(
  account: AccountKey,
  deviceId: string = crypto.randomUUID(),
): Promise<Device> {
  const key = await createDeviceKey();
  return {
    certificate: await certifyDevice(account, deviceId, key.publicKey),
    signingKey: key.signingKey,
  };
}

export async function revokeDevice(
  account: AccountKey,
  deviceId: string,
): Promise<DeviceRevocation> {
  const body = {
    accountId: account.accountId,
    deviceId,
    accountKey: account.publicKey,
  };
  return {
    ...body,
    signature: await signFor(
      "device-revocation",
      account.signingKey.reveal(),
      revocationBody(body),
    ),
  };
}

export const verifyDeviceRevocation = (r: DeviceRevocation) =>
  verifyFor("device-revocation", r.accountKey, revocationBody(r), r.signature);

const id = z.string().min(1).max(128);
const bytes = z
  .string()
  .max(1024)
  .transform((value, ctx) => {
    try {
      return fromBase64(value);
    } catch {
      ctx.addIssue({ code: "custom", message: "invalid base64" });
      return z.NEVER;
    }
  });

const certificateSchema = z.strictObject({
  v: z.literal(1),
  accountId: id,
  deviceId: id,
  deviceKey: bytes,
  accountKey: bytes,
  signature: bytes,
});

const revocationSchema = z.strictObject({
  v: z.literal(1),
  accountId: id,
  deviceId: id,
  accountKey: bytes,
  signature: bytes,
});

/** Certificates travel as the identity of an MLS basic credential. */
export const encodeCertificate = (c: DeviceCertificate): Uint8Array =>
  utf8(
    JSON.stringify({
      v: 1,
      accountId: c.accountId,
      deviceId: c.deviceId,
      deviceKey: toBase64(c.deviceKey),
      accountKey: toBase64(c.accountKey),
      signature: toBase64(c.signature),
    }),
  );

export const encodeRevocation = (r: DeviceRevocation): Uint8Array =>
  utf8(
    JSON.stringify({
      v: 1,
      accountId: r.accountId,
      deviceId: r.deviceId,
      accountKey: toBase64(r.accountKey),
      signature: toBase64(r.signature),
    }),
  );

const decodeWith =
  <T>(schema: z.ZodType<{ v: 1 } & T>) =>
  (encoded: Uint8Array): T | undefined => {
    try {
      const parsed = schema.safeParse(JSON.parse(fromUtf8(encoded)));
      if (!parsed.success) return undefined;
      const value: Partial<{ v: 1 }> & T = parsed.data;
      delete value.v;
      return value;
    } catch {
      return undefined;
    }
  };

export const decodeCertificate =
  decodeWith<DeviceCertificate>(certificateSchema);
export const decodeRevocation = decodeWith<DeviceRevocation>(revocationSchema);
