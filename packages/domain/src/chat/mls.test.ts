import { describe, expect, it } from "vitest";
import {
  encodeKeyPackage,
  encodePrivateMessage,
  encodeWelcome,
} from "../testing/chat";
import { mlsFixtures as fx } from "./mls.fixtures";
import { readKeyPackage, readPrivateMessage, readWelcome } from "./mls";

const bytes = (value: string) => Uint8Array.from(Buffer.from(value, "base64"));
const refused = { name: "DomainError", code: "invalid_input" };

describe("MLS headers the delivery service reads (ADR-0010 §9)", () => {
  it("reads real commits and application messages from the client library", () => {
    expect(readPrivateMessage(bytes(fx.commit))).toEqual({
      groupId: fx.groupId,
      epoch: 0n,
      contentType: "commit",
    });
    expect(readPrivateMessage(bytes(fx.message))).toEqual({
      groupId: fx.groupId,
      epoch: 1n,
      contentType: "application",
    });
  });

  it("reads a real welcome and key package", () => {
    expect(() => readWelcome(bytes(fx.welcome))).not.toThrow();

    const keyPackage = readKeyPackage(bytes(fx.keyPackage));
    expect(Buffer.from(keyPackage.signatureKey).toString("base64")).toBe(
      fx.keyPackageDeviceKey,
    );
    expect(new TextDecoder().decode(keyPackage.identity)).toBe(
      fx.keyPackageIdentity,
    );
  });

  it("reads the test doubles the same way", () => {
    expect(
      readPrivateMessage(bytes(encodePrivateMessage("g:2", 2 ** 40, "commit"))),
    ).toEqual({ groupId: "g:2", epoch: 2n ** 40n, contentType: "commit" });
    expect(() => readWelcome(bytes(encodeWelcome()))).not.toThrow();
    expect(
      readKeyPackage(
        bytes(encodeKeyPackage(Uint8Array.of(1, 2), Buffer.from("x"))),
      ).identity,
    ).toEqual(Uint8Array.of(0x78));
  });

  it("refuses one kind of message passed off as another", () => {
    expect(() => readPrivateMessage(bytes(fx.welcome))).toThrow(
      expect.objectContaining(refused),
    );
    expect(() => readWelcome(bytes(fx.commit))).toThrow(
      expect.objectContaining(refused),
    );
    expect(() => readKeyPackage(bytes(fx.message))).toThrow(
      expect.objectContaining(refused),
    );
  });

  it("refuses proposals on their own", () => {
    expect(() =>
      readPrivateMessage(bytes(encodePrivateMessage("g:1", 0, "proposal"))),
    ).toThrow(expect.objectContaining(refused));
  });

  it("refuses truncated messages and trailing bytes", () => {
    const commit = bytes(fx.commit);
    const welcome = bytes(fx.welcome);

    for (const broken of [
      commit.subarray(0, commit.length - 1),
      Uint8Array.from([...commit, 0]),
      commit.subarray(0, 3),
      new Uint8Array(),
    ]) {
      expect(() => readPrivateMessage(broken)).toThrow(
        expect.objectContaining(refused),
      );
    }
    expect(() => readWelcome(Uint8Array.from([...welcome, 0]))).toThrow(
      expect.objectContaining(refused),
    );
  });

  it("refuses group ids that are not text", () => {
    const message = bytes(encodePrivateMessage("ab", 0, "application"));
    // The group id's two bytes follow the four header bytes and its length.
    message[5] = 0xff;
    message[6] = 0xfe;

    expect(() => readPrivateMessage(message)).toThrow(
      expect.objectContaining(refused),
    );
  });
});
