import { chatLimits } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import {
  MAX_PINNED_ACCOUNTS,
  MAX_REVOKED_DEVICES,
  RECOVERY_KEY_LENGTH,
  Secret,
  approveLink,
  carriedTrust,
  createAccountKey,
  createRecoveryKey,
  exportRecoveryKey,
  groupRecoveryKey,
  importRecoveryKey,
  openRecoveryBackup,
  readRecoveryKey,
  sealArchive,
  sealRecoveryBackup,
  startLink,
} from "./index";
import { toBase64, utf8 } from "./suite";

/** The recovery key and its backup (ADR-0010 §8, PS-COM-019). */
describe("recovery key", () => {
  it("is 52 characters in groups of four, read back however it is typed", async () => {
    const { code, key } = await createRecoveryKey();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{52}$/);
    expect(code).toHaveLength(RECOVERY_KEY_LENGTH);
    expect(groupRecoveryKey(code)).toHaveLength(13);

    const typed = groupRecoveryKey(code.toLowerCase()).join(" - ");
    const read = await readRecoveryKey(typed);
    expect(read?.id).toEqual(key.id);
    expect(read?.backupKey.reveal()).toEqual(key.backupKey.reveal());
    expect(JSON.stringify(read)).not.toContain(
      toBase64(key.backupKey.reveal()),
    );
  });

  it("is kept on the device without the code it came from", async () => {
    const { code, key } = await createRecoveryKey();
    const kept = exportRecoveryKey(key).reveal();
    expect(Buffer.from(kept).toString("latin1")).not.toContain(code);
    const restored = importRecoveryKey(kept);
    expect(restored.id).toEqual(key.id);
    expect(restored.backupKey.reveal()).toEqual(key.backupKey.reveal());
  });

  it("refuses a code that is not one", async () => {
    const { code } = await createRecoveryKey();
    await expect(readRecoveryKey(code.slice(1))).resolves.toBeUndefined();
    await expect(readRecoveryKey(`${code}A`)).resolves.toBeUndefined();
    await expect(readRecoveryKey(`U${code.slice(1)}`)).resolves.toBeUndefined();
    // 52 characters carry 260 bits; a code with the top bits set is no key.
    await expect(readRecoveryKey(`Z${code.slice(1)}`)).resolves.toBeUndefined();
  });

  it("opens its backup, and nothing opens it without the key", async () => {
    const alice = await createAccountKey("account-alice");
    const { key } = await createRecoveryKey();
    const archive = await sealArchive(utf8("Hei"));
    const sealed = await sealRecoveryBackup(key, {
      account: alice,
      archive: { archiveId: "archive-1", parts: 1, key: archive.key },
    });
    expect(Buffer.from(sealed).toString("latin1")).not.toContain("archive-1");

    const opened = await openRecoveryBackup(key, "account-alice", sealed);
    expect(opened.account.publicKey).toEqual(alice.publicKey);
    expect(opened.archive).toMatchObject({ archiveId: "archive-1", parts: 1 });
    expect(opened.archive?.key.reveal()).toEqual(archive.key.reveal());
    expect(opened.recovery).toBe(key);

    const other = await createRecoveryKey();
    const flipped = new Uint8Array(sealed);
    flipped[20]! ^= 1;
    for (const [tried, account, bytes] of [
      [other.key, "account-alice", sealed],
      [key, "account-bob", sealed],
      [key, "account-alice", flipped],
    ] as const) {
      await expect(openRecoveryBackup(tried, account, bytes)).rejects.toThrow();
    }
  });

  it("never seals the same way twice", async () => {
    const alice = await createAccountKey("account-alice");
    const { key } = await createRecoveryKey();
    const first = await sealRecoveryBackup(key, { account: alice });
    const second = await sealRecoveryBackup(key, { account: alice });
    expect(first.subarray(0, 12)).not.toEqual(second.subarray(0, 12));
  });

  it("travels to a linked device, so it can keep the backup up to date", async () => {
    const alice = await createAccountKey("account-alice");
    const { key } = await createRecoveryKey();
    const link = await startLink();
    const { sealed } = await approveLink(link.keys, link.code, {
      account: alice,
      recovery: key,
    });
    const opened = await link.open(sealed);
    expect(opened.recovery?.id).toEqual(key.id);
    expect(opened.recovery?.backupKey).toBeInstanceOf(Secret);
    expect(opened.recovery?.backupKey.reveal()).toEqual(key.backupKey.reveal());
  });

  it("carries the pinned contact keys and revoked devices, at most a package's worth", async () => {
    const alice = await createAccountKey(
      "00000000-0000-4000-8000-a11ce0000000",
    );
    const { key } = await createRecoveryKey();
    const id = (i: number) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    const pinned = Object.fromEntries(
      Array.from({ length: MAX_PINNED_ACCOUNTS }, (_, i) => [
        id(i),
        toBase64(new Uint8Array(32).fill(i % 256)),
      ]),
    );
    const revoked = Array.from({ length: MAX_REVOKED_DEVICES }, (_, i) =>
      JSON.stringify([id(i), id(100_000 + i)]),
    );

    const backup = await sealRecoveryBackup(key, {
      account: alice,
      pinned,
      revoked,
    });
    expect(backup.length).toBeLessThanOrEqual(chatLimits.recoveryBackupBytes);
    const restored = await openRecoveryBackup(key, alice.accountId, backup);
    expect(restored.pinned).toEqual(pinned);
    expect(restored.revoked).toEqual(revoked);

    const link = await startLink();
    const { sealed } = await approveLink(link.keys, link.code, {
      account: alice,
      pinned,
      revoked,
    });
    expect(sealed.length).toBeLessThanOrEqual(chatLimits.linkPackageBytes);
    const opened = await link.open(sealed);
    expect(opened.pinned).toEqual(pinned);
    expect(opened.revoked).toEqual(revoked);

    await expect(
      sealRecoveryBackup(key, {
        account: alice,
        revoked: [...revoked, JSON.stringify([id(0), id(1)])],
      }),
    ).rejects.toThrow("Invalid revoked devices");

    await expect(
      sealRecoveryBackup(key, {
        account: alice,
        pinned: { ...pinned, extra: toBase64(new Uint8Array(32)) },
      }),
    ).rejects.toThrow("Invalid pinned account keys");
  });

  it("carries the accounts the user writes with first when it has pinned too many", () => {
    const self = "account-self";
    const key = (i: number) => toBase64(new Uint8Array(32).fill(i % 256));
    const accountKeys = Object.fromEntries(
      Array.from({ length: MAX_PINNED_ACCOUNTS + 500 }, (_, i) => [
        `account-${i}`,
        key(i),
      ]),
    );
    accountKeys[self] = key(7);
    const friend = `account-${MAX_PINNED_ACCOUNTS + 499}`;
    const revoked = [
      ...Array.from({ length: MAX_REVOKED_DEVICES + 50 }, (_, i) =>
        JSON.stringify([`account-${MAX_PINNED_ACCOUNTS + 1}`, `device-${i}`]),
      ),
      JSON.stringify([friend, "friend-phone"]),
      JSON.stringify([self, "own-phone"]),
    ];

    const carried = carriedTrust({ accountKeys, revoked }, self, [friend]);
    expect(Object.keys(carried.pinned)).toHaveLength(MAX_PINNED_ACCOUNTS);
    expect(carried.pinned[friend]).toBe(accountKeys[friend]);
    expect(carried.pinned[self]).toBeUndefined();
    expect(carried.revoked.slice(0, 2)).toEqual([
      JSON.stringify([self, "own-phone"]),
      JSON.stringify([friend, "friend-phone"]),
    ]);
    expect(carried.revoked.length).toBeLessThanOrEqual(MAX_REVOKED_DEVICES);
  });
});
