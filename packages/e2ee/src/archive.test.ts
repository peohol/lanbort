import { chatLimits } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import {
  approveLink,
  createAccountKey,
  exportLinkedArchive,
  importLinkedArchive,
  openArchive,
  sealArchive,
  Secret,
  startLink,
} from "./index";
import { fromUtf8, utf8 } from "./suite";

/**
 * The history archive (ADR-0010 §5, §8): what moves history to a linked
 * device, and later the backup. The server keeps only its parts.
 */
describe("history archive", () => {
  const history = utf8("Hei Bo, kan jeg låne stigen? ".repeat(100));

  it("opens with its key, in parts the server cannot read", async () => {
    const { key, parts } = await sealArchive(history, 1000);
    expect(parts.length).toBe(3);
    for (const part of parts) {
      expect(Buffer.from(part).toString("latin1")).not.toContain("stigen");
    }
    expect(await openArchive(key.reveal(), parts)).toEqual(history);
  });

  it("refuses more parts than the server keeps", async () => {
    await expect(
      sealArchive(new Uint8Array(chatLimits.archiveParts + 1), 1),
    ).rejects.toThrow();
  });

  it("is kept on the device until its history is there", async () => {
    const { key, parts } = await sealArchive(history);
    const kept = importLinkedArchive(
      exportLinkedArchive({
        archiveId: "a1",
        parts: parts.length,
        key,
      }).reveal(),
    );

    expect(kept).toMatchObject({ archiveId: "a1", parts: parts.length });
    expect(fromUtf8(await openArchive(kept.key.reveal(), parts))).toBe(
      fromUtf8(history),
    );
    expect(() => importLinkedArchive(utf8('{"archiveId":"a1"}'))).toThrow();
  });

  it("is one part when empty", async () => {
    const { key, parts } = await sealArchive(new Uint8Array(0));
    expect(parts.length).toBe(1);
    expect(await openArchive(key.reveal(), parts)).toEqual(new Uint8Array(0));
  });

  it("does not open with another key, or with parts changed, moved or missing", async () => {
    const { key, parts } = await sealArchive(history, 1000);
    const other = await sealArchive(history, 1000);
    const changed = parts.map((part) => new Uint8Array(part));
    changed[1]![0]! ^= 1;

    for (const [rawKey, tried] of [
      [other.key.reveal(), parts],
      [key.reveal(), changed],
      [key.reveal(), [parts[1]!, parts[0]!, parts[2]!]],
      [key.reveal(), parts.slice(0, 2)],
      [key.reveal(), [...parts, parts[2]!]],
      [key.reveal(), [parts[0]!, other.parts[1]!, parts[2]!]],
      [key.reveal(), []],
    ] as const) {
      await expect(openArchive(rawKey, tried)).rejects.toThrow();
    }
  });

  it("travels to a linked device inside the sealed package", async () => {
    const alice = await createAccountKey("account-alice");
    const link = await startLink();
    const { key, parts } = await sealArchive(history);
    const archive = { archiveId: "archive-1", parts: parts.length, key };

    const { sealed } = await approveLink(link.keys, {
      account: alice,
      archive,
    });
    expect(fromUtf8(sealed)).not.toContain("archive-1");
    const opened = await link.open(sealed);
    expect(opened.account.publicKey).toEqual(alice.publicKey);
    expect(opened.archive).toMatchObject({
      archiveId: "archive-1",
      parts: parts.length,
    });
    expect(opened.archive?.key.reveal()).toEqual(key.reveal());
    expect(JSON.stringify(opened.archive)).not.toContain(
      Buffer.from(key.reveal()).toString("base64"),
    );
    expect(opened.archive?.key).toBeInstanceOf(Secret);

    // Without history, the package holds the account key alone.
    const plain = await link.open(
      (await approveLink(link.keys, { account: alice })).sealed,
    );
    expect(plain.archive).toBeUndefined();
  });
});
