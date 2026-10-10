import { describe, expect, it } from "vitest";
import {
  RECOVERY_KEY_LENGTH,
  Secret,
  approveLink,
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
    const { sealed } = await approveLink(link.keys, {
      account: alice,
      recovery: key,
    });
    const opened = await link.open(sealed);
    expect(opened.recovery?.id).toEqual(key.id);
    expect(opened.recovery?.backupKey).toBeInstanceOf(Secret);
    expect(opened.recovery?.backupKey.reveal()).toEqual(key.backupKey.reveal());
  });
});
