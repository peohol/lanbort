import { describe, expect, it } from "vitest";
import {
  type ConversationPolicy,
  Conversation,
  approveLink,
  createAccountKey,
  createDevice,
  createKeyPackage,
  createMemoryTrustStore,
  exportAccountKey,
  exportDevice,
  exportKeyPackage,
  importAccountKey,
  importDevice,
  importKeyPackage,
  matchLinkRequest,
  normalizeLinkCode,
  observeAccountKey,
  readLinkQr,
  securityCode,
  startLink,
  verifyDeviceCertificate,
} from "./index";
import { decodeBase32 } from "./base32";
import { commit } from "./linking";
import { fromBase64, fromUtf8, toBase64, utf8 } from "./suite";

/**
 * What a device keeps between visits (ADR-0010 §10), how a new device is
 * linked (§5) and the security code contacts compare (§3).
 */

const ALICE = "account-alice";
const BOB = "account-bob";

async function twoAccounts() {
  const alice = await createAccountKey(ALICE);
  const bob = await createAccountKey(BOB);
  const policy = (): ConversationPolicy => {
    const trust = createMemoryTrustStore();
    observeAccountKey(trust, ALICE, alice.publicKey);
    observeAccountKey(trust, BOB, bob.publicKey);
    return { participants: [ALICE, BOB], trust };
  };
  return { alice, bob, policy };
}

describe("device storage", () => {
  it("restores keys and a conversation that keeps working after a restart", async () => {
    const { alice, bob, policy } = await twoAccounts();
    const aliceDevice = importDevice(
      exportDevice(await createDevice(alice)).reveal(),
    );
    const bobDevice = await createDevice(bob);
    expect(await verifyDeviceCertificate(aliceDevice.certificate)).toBe(true);

    const restoredAccount = importAccountKey(exportAccountKey(alice).reveal());
    expect(restoredAccount.publicKey).toEqual(alice.publicKey);
    expect(restoredAccount.signingKey.reveal()).toEqual(
      alice.signingKey.reveal(),
    );

    const bobBundle = importKeyPackage(
      exportKeyPackage(await createKeyPackage(bobDevice)).reveal(),
    );
    const aliceConversation = await Conversation.create(
      aliceDevice,
      "conversation-1:1",
      policy(),
    );
    const pending = await aliceConversation.add([bobBundle.published]);
    pending.accept();
    let bobConversation = await Conversation.join(
      pending.welcome!,
      bobBundle,
      policy(),
    );

    // The caller wipes the stored bytes once restored, as the app does.
    const stored = (await bobConversation.export()).reveal();
    bobConversation = Conversation.restore(stored, policy());
    stored.fill(0);
    expect(bobConversation.members()).toHaveLength(2);
    expect(bobConversation.groupId).toBe("conversation-1:1");
    expect(bobConversation.epoch).toBe(aliceConversation.epoch);

    const message = await aliceConversation.encrypt(utf8("Hei etter omstart"));
    await expect(bobConversation.receive(message)).resolves.toMatchObject({
      plaintext: utf8("Hei etter omstart"),
    });
    const reply = await bobConversation.encrypt(utf8("Hei igjen"));
    await expect(aliceConversation.receive(reply)).resolves.toMatchObject({
      plaintext: utf8("Hei igjen"),
    });
  });

  it("finds which unused key package a welcome is for", async () => {
    const { alice, bob, policy } = await twoAccounts();
    const bobDevice = await createDevice(bob);
    const unused = await createKeyPackage(bobDevice);
    const used = await createKeyPackage(bobDevice);
    const conversation = await Conversation.create(
      await createDevice(alice),
      "conversation-2:1",
      policy(),
    );
    const pending = await conversation.add([used.published]);

    await expect(
      Conversation.keyPackageFor(pending.welcome!, [unused, used]),
    ).resolves.toBe(used);
    await expect(
      Conversation.keyPackageFor(pending.welcome!, [unused]),
    ).resolves.toBeUndefined();
  });

  it("rejects stored data that is not what it claims to be", async () => {
    expect(() => importAccountKey(utf8("{}"))).toThrow();
    expect(() => importDevice(utf8('{"v":2}'))).toThrow();
    expect(() =>
      Conversation.restore(utf8("x"), {
        participants: [],
        trust: createMemoryTrustStore(),
      }),
    ).toThrow();
  });

  it("saves and restores what the device trusts", async () => {
    const { alice } = await twoAccounts();
    const trust = createMemoryTrustStore();
    observeAccountKey(trust, ALICE, alice.publicKey);
    trust.addRevocation({ accountId: ALICE, deviceId: "lost" });

    const restored = createMemoryTrustStore(
      JSON.parse(JSON.stringify(trust.snapshot())),
    );
    expect(restored.accountKey(ALICE)).toEqual(alice.publicKey);
    expect(restored.isRevoked({ accountId: ALICE, deviceId: "lost" })).toBe(
      true,
    );
    expect(restored.isRevoked({ accountId: ALICE, deviceId: "other" })).toBe(
      false,
    );
  });
});

describe("linking a device", () => {
  it("gives the new device the account key once the code on its screen is confirmed", async () => {
    const alice = await createAccountKey(ALICE);
    const link = await startLink();
    expect(link.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    // The server gets the keys and the commitment, never the code.
    expect(JSON.stringify(Object.values(link.keys).map(String))).not.toContain(
      link.code,
    );

    // The existing device reads the QR code and finds the matching request
    // among the ones the server lists.
    const other = await startLink();
    const shown = readLinkQr(link.qr)!;
    const request = await matchLinkRequest([other.keys, link.keys], shown);
    expect(request).toBe(link.keys);

    const { certificate, sealed } = await approveLink(request!, shown.code, {
      account: alice,
    });
    expect(await verifyDeviceCertificate(certificate)).toBe(true);
    const { account, device } = await link.open(sealed);
    expect(account.publicKey).toEqual(alice.publicKey);
    expect(device.certificate).toEqual(certificate);
    expect(device.certificate.deviceId).toBe(link.keys.deviceId);
  });

  it("accepts the code typed loosely", async () => {
    const link = await startLink();
    const typed = `${link.code.slice(0, 5).toLowerCase()} - ${link.code.slice(5)}`;
    expect(normalizeLinkCode(typed)).toBe(link.code);
    expect(normalizeLinkCode("o0il")).toBe("0011");
    await expect(matchLinkRequest([link.keys], { code: typed })).resolves.toBe(
      link.keys,
    );
  });

  it("finds no request when the server swapped a key", async () => {
    const link = await startLink();
    const attacker = await startLink(link.keys.deviceId);
    const forgeries = [
      { ...link.keys, linkKey: attacker.keys.linkKey },
      { ...link.keys, deviceKey: attacker.keys.deviceKey },
      // The server cannot make a commitment of its own: it lacks the code.
      { ...attacker.keys, commitment: link.keys.commitment },
      attacker.keys,
    ];

    for (const forged of forgeries) {
      await expect(
        matchLinkRequest([forged], { code: link.code }),
      ).resolves.toBeUndefined();
      await expect(
        approveLink(forged, link.code, {
          account: await createAccountKey(ALICE),
        }),
      ).rejects.toThrow("The code is not this request's");
    }
  });

  it("does not let another device open the sealed package", async () => {
    const alice = await createAccountKey(ALICE);
    const link = await startLink();
    const eavesdropper = await startLink(link.keys.deviceId);
    const { sealed } = await approveLink(link.keys, link.code, {
      account: alice,
    });
    await expect(eavesdropper.open(sealed)).rejects.toThrow();

    const { enc, ct } = JSON.parse(fromUtf8(sealed)) as {
      enc: string;
      ct: string;
    };
    const flipped = fromBase64(ct);
    flipped[0]! ^= 0x01;
    const tampered = utf8(JSON.stringify({ enc, ct: toBase64(flipped) }));
    await expect(link.open(tampered)).rejects.toThrow();
  });

  it("refuses a package from a device that was never shown the code", async () => {
    // The server knows the new device's keys, so it can seal an account key
    // of its own to them under a secret it picked. The new device's own
    // secret then does not open the inner layer.
    const link = await startLink();
    const serverAccount = await createAccountKey(ALICE);
    const serverCode = (await startLink()).code;
    const serverSecret = decodeBase32(serverCode, 26, 16)!;
    const forged = {
      ...link.keys,
      commitment: await commit(serverSecret, link.keys),
    };
    const { sealed } = await approveLink(forged, serverCode, {
      account: serverAccount,
    });
    await expect(link.open(sealed)).rejects.toThrow();
  });

  it("ignores QR codes that are not link codes", () => {
    expect(readLinkQr("https://example.com")).toBeUndefined();
    expect(readLinkQr("LANBORT-LINK:1:abc:short")).toBeUndefined();
    expect(readLinkQr("LANBORT-LINK:2:short")).toBeUndefined();
    // 26 characters whose top bits are not zero carry no 128-bit secret.
    expect(readLinkQr(`LANBORT-LINK:2:Z${"0".repeat(25)}`)).toBeUndefined();
  });
});

describe("security code", () => {
  it("is the same for both contacts and changes with an account key", async () => {
    const { alice, bob } = await twoAccounts();
    const a = { accountId: ALICE, accountKey: alice.publicKey };
    const b = { accountId: BOB, accountKey: bob.publicKey };

    const code = await securityCode(a, b);
    expect(code).toHaveLength(12);
    for (const group of code) expect(group).toMatch(/^\d{5}$/);
    expect(await securityCode(b, a)).toEqual(code);

    const reset = await createAccountKey(BOB);
    expect(
      await securityCode(a, { accountId: BOB, accountKey: reset.publicKey }),
    ).not.toEqual(code);
  });
});
