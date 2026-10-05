import { describe, expect, it } from "vitest";
import {
  createAccountKey,
  createDevice,
  decodeCertificate,
  decodeRevocation,
  encodeCertificate,
  encodeRevocation,
  revokeDevice,
  verifyDeviceCertificate,
  verifyDeviceRevocation,
} from "./identity";
import { signFor, utf8, verifyFor } from "./suite";

describe("device certificates and revocations (ADR-0010)", () => {
  it("round-trips a certificate and verifies it against the account key", async () => {
    const account = await createAccountKey("account-1");
    const device = await createDevice(account, "device-1");
    const decoded = decodeCertificate(encodeCertificate(device.certificate));

    expect(decoded).toEqual(device.certificate);
    expect(await verifyDeviceCertificate(decoded!)).toBe(true);
  });

  it("rejects a certificate whose device key, account or device id was changed", async () => {
    const account = await createAccountKey("account-1");
    const { certificate } = await createDevice(account, "device-1");
    const other = await createDevice(account, "device-2");

    for (const forged of [
      { ...certificate, deviceKey: other.certificate.deviceKey },
      { ...certificate, accountId: "account-2" },
      { ...certificate, deviceId: "device-2" },
      { ...certificate, accountKey: (await createAccountKey("x")).publicKey },
    ]) {
      expect(await verifyDeviceCertificate(forged)).toBe(false);
    }
  });

  it("round-trips a revocation, and a forged one does not verify", async () => {
    const account = await createAccountKey("account-1");
    const revocation = await revokeDevice(account, "device-1");

    expect(decodeRevocation(encodeRevocation(revocation))).toEqual(revocation);
    expect(await verifyDeviceRevocation(revocation)).toBe(true);
    expect(
      await verifyDeviceRevocation({ ...revocation, deviceId: "device-2" }),
    ).toBe(false);
  });

  it("never accepts a signature made for another purpose", async () => {
    const account = await createAccountKey("account-1");
    const content = utf8("same bytes");
    const signature = await signFor(
      "device-revocation",
      account.signingKey.reveal(),
      content,
    );

    expect(
      await verifyFor(
        "device-revocation",
        account.publicKey,
        content,
        signature,
      ),
    ).toBe(true);
    expect(
      await verifyFor(
        "device-certificate",
        account.publicKey,
        content,
        signature,
      ),
    ).toBe(false);
  });

  it("decodes nothing that is malformed or carries extra fields", async () => {
    const account = await createAccountKey("account-1");
    const { certificate } = await createDevice(account, "device-1");
    const valid = JSON.parse(
      new TextDecoder().decode(encodeCertificate(certificate)),
    ) as Record<string, unknown>;

    for (const input of [
      "not json",
      JSON.stringify({ ...valid, v: 2 }),
      JSON.stringify({ ...valid, extra: "field" }),
      JSON.stringify({ ...valid, deviceKey: "%%%" }),
      JSON.stringify({ ...valid, accountId: "" }),
    ]) {
      expect(decodeCertificate(utf8(input))).toBeUndefined();
    }
    expect(decodeCertificate(Uint8Array.of(0xff, 0xfe))).toBeUndefined();
  });
});
