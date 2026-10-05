import { describe, expect, it } from "vitest";
import { testChatAccount, testChatDevice } from "../testing/chat";
import { mlsFixtures as fx } from "./mls.fixtures";
import { certificateIsSigned, revocationIsSigned } from "./signatures";

const realCertificate = {
  v: 1 as const,
  accountId: fx.accountId,
  deviceId: fx.deviceId,
  deviceKey: fx.deviceKey,
  accountKey: fx.accountKey,
  signature: fx.certificateSignature,
};
const realRevocation = {
  v: 1 as const,
  accountId: fx.accountId,
  deviceId: fx.revokedDeviceId,
  accountKey: fx.accountKey,
  signature: fx.revocationSignature,
};

describe("device certificates and revocations (ADR-0010 §3)", () => {
  it("verifies what the client library signs", () => {
    expect(certificateIsSigned(realCertificate)).toBe(true);
    expect(revocationIsSigned(realRevocation)).toBe(true);
  });

  it("refuses any changed field", () => {
    const other = testChatAccount(fx.accountId);

    for (const changed of [
      { deviceId: fx.revokedDeviceId },
      { accountId: fx.revokedDeviceId },
      { deviceKey: fx.accountKey },
      { accountKey: other.accountKey },
    ]) {
      expect(certificateIsSigned({ ...realCertificate, ...changed })).toBe(
        false,
      );
    }
    expect(
      revocationIsSigned({ ...realRevocation, deviceId: fx.deviceId }),
    ).toBe(false);
  });

  it("never takes one purpose's signature for the other", () => {
    expect(
      revocationIsSigned({
        ...realRevocation,
        deviceId: fx.deviceId,
        signature: fx.certificateSignature,
      }),
    ).toBe(false);
  });

  it("refuses malformed keys and signatures without throwing", () => {
    expect(certificateIsSigned({ ...realCertificate, signature: "AAAA" })).toBe(
      false,
    );
    expect(
      certificateIsSigned({ ...realCertificate, accountKey: "AAAA" }),
    ).toBe(false);
  });

  it("matches the test doubles", () => {
    const account = testChatAccount(fx.accountId);
    const device = testChatDevice(account);

    expect(certificateIsSigned(device.certificate)).toBe(true);
    expect(revocationIsSigned(account.revoke(device.deviceId))).toBe(true);
  });
});
