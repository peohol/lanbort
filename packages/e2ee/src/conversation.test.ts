import { inspect } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type AccountKey,
  type ConversationPolicy,
  type Device,
  type DeviceRef,
  type KeyPackageBundle,
  type TrustStore,
  Conversation,
  acceptChangedAccountKey,
  applyRevocation,
  conversationAuthenticator,
  createAccountKey,
  createDevice,
  createKeyPackage,
  createMemoryTrustStore,
  encodeCertificate,
  observeAccountKey,
  revokeDevice,
} from "./index";
import { utf8 } from "./suite";

/**
 * Everything the server would store or relay. Tests assert that plaintext
 * never appears in it: the server is a delivery service, not a reader.
 */
const serverSaw: Uint8Array[] = [];
const relay = (bytes: Uint8Array) => {
  serverSaw.push(bytes);
  return bytes;
};

const containsBytes = (haystack: Uint8Array, needle: Uint8Array) => {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
};

interface Client {
  device: Device;
  ref: DeviceRef;
  trust: TrustStore;
  policy: ConversationPolicy;
  conversation?: Conversation;
}

const accounts = new Map<string, AccountKey>();

async function newClient(
  accountId: string,
  participants: readonly string[],
): Promise<Client> {
  let account = accounts.get(accountId);
  if (!account) {
    account = await createAccountKey(accountId);
    accounts.set(accountId, account);
  }
  const device = await createDevice(account);
  const trust = createMemoryTrustStore();
  // What a device does with the account keys the server's directory returns.
  for (const [id, key] of accounts) observeAccountKey(trust, id, key.publicKey);
  return {
    device,
    ref: { accountId, deviceId: device.certificate.deviceId },
    trust,
    policy: { participants, trust },
  };
}

const conversationOf = (client: Client) => {
  if (!client.conversation) throw new Error("not in the conversation");
  return client.conversation;
};

async function publishKeyPackage(client: Client) {
  const bundle = await createKeyPackage(client.device);
  relay(bundle.published);
  return bundle;
}

/** Adds clients through `by`, as the server would order and fan out. */
async function addToConversation(by: Client, joiners: Client[]) {
  const bundles: KeyPackageBundle[] = [];
  for (const joiner of joiners) bundles.push(await publishKeyPackage(joiner));
  const pending = await conversationOf(by).add(bundles.map((b) => b.published));
  pending.accept();
  relay(pending.commit);
  return { pending, bundles };
}

async function send(from: Client, text: string) {
  return relay(await conversationOf(from).encrypt(utf8(text)));
}

const ALICE = "account-alice";
const BOB = "account-bob";
const EVE = "account-eve";
const participants = [ALICE, BOB];
const CREDENTIAL_REJECTED = "Could not validate credential";

describe("private chat over MLS (ADR-0010)", () => {
  let alice1: Client;
  let alice2: Client;
  let bob1: Client;
  let bob2: Client;
  let members: Client[];

  beforeAll(async () => {
    alice1 = await newClient(ALICE, participants);
    alice2 = await newClient(ALICE, participants);
    bob1 = await newClient(BOB, participants);
    bob2 = await newClient(BOB, participants);
    // Eve exists and everyone knows her key, but she is not a participant.
    await newClient(EVE, [EVE]);
    for (const client of [alice1, alice2, bob1, bob2]) {
      for (const [id, key] of accounts) {
        observeAccountKey(client.trust, id, key.publicKey);
      }
    }

    alice1.conversation = await Conversation.create(
      alice1.device,
      "conversation-1",
      alice1.policy,
    );
    const joiners = [alice2, bob1, bob2];
    const { pending, bundles } = await addToConversation(alice1, joiners);
    for (const [i, joiner] of joiners.entries()) {
      joiner.conversation = await Conversation.join(
        relay(pending.welcome!),
        bundles[i]!,
        joiner.policy,
      );
    }
    members = [alice1, alice2, bob1, bob2];
  });

  it("lets every device of both accounts read a message, and tells who sent it", async () => {
    const message = await send(bob2, "Kan jeg hente drillen i morgen kl. 18?");

    for (const reader of [alice1, alice2, bob1]) {
      const received = await conversationOf(reader).receive(message);
      expect(received).toEqual({
        kind: "message",
        sender: bob2.ref,
        plaintext: utf8("Kan jeg hente drillen i morgen kl. 18?"),
      });
    }
    expect(conversationOf(alice1).members()).toEqual(members.map((m) => m.ref));
  });

  it("never gives the server the plaintext, and hides short message lengths", async () => {
    const short = await send(alice1, "Ja");
    const longer = await send(alice1, "Ja, men ring på døren to ganger.");
    for (const reader of [alice2, bob1, bob2]) {
      await conversationOf(reader).receive(short);
      await conversationOf(reader).receive(longer);
    }

    for (const text of ["Ja, men ring", "drillen", "kl. 18"]) {
      expect(serverSaw.some((b) => containsBytes(b, utf8(text)))).toBe(false);
    }
    expect(short.length).toBe(longer.length);
  });

  it("rejects a message that was altered on the way", async () => {
    const message = await send(alice2, "Hei");
    const tampered = Uint8Array.from(message);
    tampered[tampered.length - 20]! ^= 0x01;

    await expect(conversationOf(bob1).receive(tampered)).rejects.toThrow();
    // The genuine message still decrypts afterwards.
    await expect(conversationOf(bob1).receive(message)).resolves.toMatchObject({
      kind: "message",
    });
    await conversationOf(alice1).receive(message);
    await conversationOf(bob2).receive(message);
  });

  it("does not let a newly added device read anything sent before it joined", async () => {
    const before = await send(alice1, "Koden til boden er 4711");
    for (const reader of [alice2, bob1, bob2]) {
      await conversationOf(reader).receive(before);
    }

    const bob3 = await newClient(BOB, participants);
    const { pending, bundles } = await addToConversation(bob1, [bob3]);
    for (const member of [alice1, alice2, bob2]) {
      await conversationOf(member).receive(pending.commit);
    }
    bob3.conversation = await Conversation.join(
      pending.welcome!,
      bundles[0]!,
      bob3.policy,
    );

    await expect(conversationOf(bob3).receive(before)).rejects.toThrow(
      "epoch too old",
    );

    const after = await send(alice1, "Velkommen, ny enhet");
    await expect(conversationOf(bob3).receive(after)).resolves.toMatchObject({
      plaintext: utf8("Velkommen, ny enhet"),
    });
    members.push(bob3);
    for (const member of [alice2, bob1, bob2]) {
      await conversationOf(member).receive(after);
    }
  });

  it("locks out a lost device once it is revoked and removed", async () => {
    const lost = bob2;
    const revocation = await revokeDevice(
      accounts.get(BOB)!,
      lost.ref.deviceId,
    );
    const remaining = members.filter((m) => m !== lost);
    for (const member of remaining) {
      expect(await applyRevocation(member.trust, revocation)).toBe(true);
    }

    const pending = await conversationOf(alice1).remove([lost.ref]);
    pending.accept();
    for (const member of remaining.filter((m) => m !== alice1)) {
      await conversationOf(member).receive(relay(pending.commit));
    }
    await conversationOf(lost)
      .receive(pending.commit)
      .catch(() => undefined);

    const secret = await send(bob1, "Ny avtale: vi møtes ved butikken");
    await expect(conversationOf(lost).receive(secret)).rejects.toThrow();
    for (const member of remaining.filter((m) => m !== bob1)) {
      await expect(
        conversationOf(member).receive(secret),
      ).resolves.toMatchObject({ sender: bob1.ref });
    }
    members.splice(members.indexOf(lost), 1);

    // A revoked device cannot be added back from an old key package.
    await expect(
      conversationOf(alice1).add([
        (await createKeyPackage(lost.device)).published,
      ]),
    ).rejects.toThrow(CREDENTIAL_REJECTED);
  });

  it("rotates a device's keys without interrupting the conversation", async () => {
    const before = conversationOf(alice2).epoch;
    const pending = await conversationOf(alice2).rotateKeys();
    pending.accept();
    for (const member of members.filter((m) => m !== alice2)) {
      await conversationOf(member).receive(relay(pending.commit));
    }

    expect(conversationOf(alice2).epoch).toBe(before + 1n);
    const message = await send(alice2, "Nye nøkler");
    for (const member of members.filter((m) => m !== alice2)) {
      await expect(
        conversationOf(member).receive(message),
      ).resolves.toMatchObject({ sender: alice2.ref });
    }
  });

  it("lets only one of two concurrent commits take effect", async () => {
    const first = await conversationOf(alice1).rotateKeys();
    const second = await conversationOf(bob1).rotateKeys();
    // The server accepted `first` for this epoch and rejects `second`.
    first.accept();
    // Bob's device processes nothing until it has settled its own commit.
    await expect(conversationOf(bob1).receive(first.commit)).rejects.toThrow(
      "commit pending",
    );
    second.discard();
    expect(() => second.accept()).toThrow("commit no longer pending");
    for (const member of members.filter((m) => m !== alice1)) {
      await conversationOf(member).receive(relay(first.commit));
    }
    await expect(
      conversationOf(alice1).receive(second.commit),
    ).rejects.toThrow();

    const epochs = new Set(members.map((m) => conversationOf(m).epoch));
    expect(epochs.size).toBe(1);
  });

  it("keeps a pending commit valid while traffic waits for the server", async () => {
    const pending = await conversationOf(bob1).rotateKeys();
    await expect(
      conversationOf(bob1).encrypt(utf8("for tidlig")),
    ).rejects.toThrow("commit pending");
    await expect(conversationOf(bob1).rotateKeys()).rejects.toThrow(
      "commit pending",
    );

    pending.accept();
    for (const member of members.filter((m) => m !== bob1)) {
      await conversationOf(member).receive(relay(pending.commit));
    }
    const message = await send(bob1, "Etter commit");
    for (const member of members.filter((m) => m !== bob1)) {
      await expect(
        conversationOf(member).receive(message),
      ).resolves.toMatchObject({ sender: bob1.ref });
    }
  });

  it("handles overlapping calls on one device one at a time", async () => {
    const [one, two] = await Promise.all([
      conversationOf(alice1).encrypt(utf8("én")),
      conversationOf(alice1).encrypt(utf8("to")),
    ]);
    for (const member of members.filter((m) => m !== alice1)) {
      const [a, b] = await Promise.all([
        conversationOf(member).receive(relay(one!)),
        conversationOf(member).receive(relay(two!)),
      ]);
      expect([a, b]).toMatchObject([
        { plaintext: utf8("én") },
        { plaintext: utf8("to") },
      ]);
    }
  });

  it("refuses an expired key package, and tolerates a little clock skew", async () => {
    const device = await newClient(ALICE, participants);
    const day = 24 * 60 * 60 * 1000;
    const expired = await createKeyPackage(
      device.device,
      new Date(Date.now() - 30 * day),
    );
    await expect(
      conversationOf(alice1).add([expired.published]),
    ).rejects.toThrow("Current time not within Lifetime");

    // Made on a device whose clock runs ten minutes fast; never accepted here.
    const ahead = await createKeyPackage(
      device.device,
      new Date(Date.now() + 10 * 60 * 1000),
    );
    const pending = await conversationOf(alice1).add([ahead.published]);
    expect(pending.welcome).toBeDefined();
    pending.discard();
  });

  it("refuses a device that the server presents under a key the account never had", async () => {
    // The server invents a "Bob" device with an account key of its own.
    const forgedAccount = await createAccountKey(BOB);
    const ghost = await createDevice(forgedAccount);
    const ghostPackage = relay((await createKeyPackage(ghost)).published);

    await expect(conversationOf(alice1).add([ghostPackage])).rejects.toThrow(
      CREDENTIAL_REJECTED,
    );

    const authenticator = conversationAuthenticator(alice1.policy);
    await expect(
      authenticator.validateCredential(
        {
          credentialType: "basic",
          identity: encodeCertificate(ghost.certificate),
        },
        ghost.certificate.deviceKey,
      ),
    ).resolves.toBe(false);
  });

  it("refuses a commit from a member that adds a device the others do not trust", async () => {
    // Bob's device is tricked into trusting a forged key for Alice's account.
    const forgedAlice = await createAccountKey(ALICE);
    const ghost = await createDevice(forgedAlice);
    const ghostClient: Client = {
      device: ghost,
      ref: { accountId: ALICE, deviceId: ghost.certificate.deviceId },
      trust: createMemoryTrustStore(),
      policy: alice1.policy,
    };
    bob1.trust.setAccountKey(ALICE, forgedAlice.publicKey);
    try {
      const pending = await conversationOf(bob1).add([
        (await publishKeyPackage(ghostClient)).published,
      ]);
      for (const member of members.filter((m) => m !== bob1)) {
        await expect(
          conversationOf(member).receive(pending.commit),
        ).rejects.toThrow(CREDENTIAL_REJECTED);
      }
      pending.discard();
    } finally {
      bob1.trust.setAccountKey(ALICE, accounts.get(ALICE)!.publicKey);
    }
  });

  it("refuses devices of an account that is not a participant", async () => {
    const eve = await newClient(EVE, [EVE]);
    await expect(
      conversationOf(alice1).add([(await publishKeyPackage(eve)).published]),
    ).rejects.toThrow(CREDENTIAL_REJECTED);
  });

  it("reports a changed account key instead of trusting it", async () => {
    const trust = createMemoryTrustStore();
    const original = accounts.get(BOB)!;
    const replacement = await createAccountKey(BOB);
    expect(observeAccountKey(trust, BOB, original.publicKey)).toBe("pinned");
    expect(observeAccountKey(trust, BOB, original.publicKey)).toBe("unchanged");
    expect(observeAccountKey(trust, BOB, replacement.publicKey)).toBe(
      "changed",
    );

    const newDevice = await createDevice(replacement);
    const authenticator = conversationAuthenticator({ participants, trust });
    const credential = {
      credentialType: "basic" as const,
      identity: encodeCertificate(newDevice.certificate),
    };
    await expect(
      authenticator.validateCredential(
        credential,
        newDevice.certificate.deviceKey,
      ),
    ).resolves.toBe(false);

    // Only after the user has been told does the new key count.
    acceptChangedAccountKey(trust, BOB, replacement.publicKey);
    await expect(
      authenticator.validateCredential(
        credential,
        newDevice.certificate.deviceKey,
      ),
    ).resolves.toBe(true);
  });

  it("ignores a revocation not signed by the pinned account key", async () => {
    const forged = await revokeDevice(
      await createAccountKey(ALICE),
      alice2.ref.deviceId,
    );
    expect(await applyRevocation(bob1.trust, forged)).toBe(false);
    expect(bob1.trust.isRevoked(alice2.ref)).toBe(false);
  });

  // Last: Bob's device is left distrusting Alice's second device.
  it("does not let one participant remove another's device without a revocation", async () => {
    await expect(conversationOf(bob1).remove([alice2.ref])).rejects.toThrow(
      "device is still trusted",
    );

    // A tampered client on Bob's device treats Alice's device as revoked
    // without any revocation signed by Alice's account key.
    bob1.trust.addRevocation(alice2.ref);
    const pending = await conversationOf(bob1).remove([alice2.ref]);
    for (const member of members.filter((m) => m !== bob1)) {
      await expect(
        conversationOf(member).receive(relay(pending.commit)),
      ).rejects.toThrow("rejected membership change");
    }
    pending.discard();

    const message = await send(alice1, "Fortsatt med");
    await expect(
      conversationOf(alice2).receive(message),
    ).resolves.toMatchObject({ sender: alice1.ref });
  });

  it("keeps key material out of logs, JSON and copies", async () => {
    const bundle = await createKeyPackage(alice1.device);
    const signingKey = alice1.device.signingKey.reveal();
    const rendered = [
      JSON.stringify(alice1.device),
      JSON.stringify(bundle),
      JSON.stringify(accounts.get(ALICE)),
      JSON.stringify(alice1.conversation),
      inspect(alice1.device, { depth: 10, showHidden: true }),
      inspect(bundle, { depth: 10, showHidden: true }),
      inspect(alice1.conversation, { depth: 10, showHidden: true }),
      String(alice1.device.signingKey),
    ];

    for (const text of rendered) {
      expect(text).not.toMatch(/initPrivateKey|hpkePrivateKey|signKey/);
      expect(text).not.toContain(Array.from(signingKey).join(","));
    }
    expect(JSON.stringify(alice1.device)).toContain(
      '"signingKey":"[redacted]"',
    );
    expect(structuredClone(alice1.device.signingKey)).toEqual({});
    expect(Object.keys(alice1.device.signingKey)).toEqual([]);
    expect(containsBytes(bundle.published, signingKey)).toBe(false);
  });
});
