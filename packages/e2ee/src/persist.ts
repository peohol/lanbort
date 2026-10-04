import { decodeMlsMessage } from "ts-mls";
import { z } from "zod";
import type { KeyPackageBundle } from "./conversation";
import {
  type AccountKey,
  type Device,
  decodeCertificate,
  encodeCertificate,
} from "./identity";
import { Secret } from "./secret";
import { fromBase64, fromUtf8, toBase64, utf8 } from "./suite";

/**
 * Turns key material into bytes for the device's encrypted storage (ADR-0010
 * §10) and back. Everything that holds a private key comes out as a
 * `Secret`, so it is only ever handed to the storage layer that encrypts it.
 */

const bytes = z.string().transform((value, ctx) => {
  try {
    return fromBase64(value);
  } catch {
    ctx.addIssue({ code: "custom", message: "invalid base64" });
    return z.NEVER;
  }
});

const parse = <T>(schema: z.ZodType<T>, encoded: Uint8Array): T =>
  schema.parse(JSON.parse(fromUtf8(encoded)));

const accountKeySchema = z.strictObject({
  v: z.literal(1),
  accountId: z.string(),
  publicKey: bytes,
  signingKey: bytes,
});

export const exportAccountKey = (account: AccountKey): Secret<Uint8Array> =>
  new Secret(
    utf8(
      JSON.stringify({
        v: 1,
        accountId: account.accountId,
        publicKey: toBase64(account.publicKey),
        signingKey: toBase64(account.signingKey.reveal()),
      }),
    ),
  );

export function importAccountKey(encoded: Uint8Array): AccountKey {
  const { accountId, publicKey, signingKey } = parse(accountKeySchema, encoded);
  return { accountId, publicKey, signingKey: new Secret(signingKey) };
}

const deviceSchema = z.strictObject({
  v: z.literal(1),
  certificate: z.string(),
  signingKey: bytes,
});

export const exportDevice = (device: Device): Secret<Uint8Array> =>
  new Secret(
    utf8(
      JSON.stringify({
        v: 1,
        certificate: fromUtf8(encodeCertificate(device.certificate)),
        signingKey: toBase64(device.signingKey.reveal()),
      }),
    ),
  );

export function importDevice(encoded: Uint8Array): Device {
  const { certificate, signingKey } = parse(deviceSchema, encoded);
  const decoded = decodeCertificate(utf8(certificate));
  if (!decoded) throw new Error("invalid device certificate");
  return { certificate: decoded, signingKey: new Secret(signingKey) };
}

const keyPackageSchema = z.strictObject({
  v: z.literal(1),
  published: bytes,
  initPrivateKey: bytes,
  hpkePrivateKey: bytes,
  signaturePrivateKey: bytes,
});

export function exportKeyPackage(bundle: KeyPackageBundle): Secret<Uint8Array> {
  const { privatePackage } = bundle.secret.reveal();
  return new Secret(
    utf8(
      JSON.stringify({
        v: 1,
        published: toBase64(bundle.published),
        initPrivateKey: toBase64(privatePackage.initPrivateKey),
        hpkePrivateKey: toBase64(privatePackage.hpkePrivateKey),
        signaturePrivateKey: toBase64(privatePackage.signaturePrivateKey),
      }),
    ),
  );
}

export function importKeyPackage(encoded: Uint8Array): KeyPackageBundle {
  const { published, initPrivateKey, hpkePrivateKey, signaturePrivateKey } =
    parse(keyPackageSchema, encoded);
  const privatePackage = {
    initPrivateKey,
    hpkePrivateKey,
    signaturePrivateKey,
  };
  const [message] = decodeMlsMessage(published, 0) ?? [];
  if (message?.wireformat !== "mls_key_package") {
    throw new Error("expected mls_key_package");
  }
  return {
    published,
    secret: new Secret({ publicPackage: message.keyPackage, privatePackage }),
  };
}
