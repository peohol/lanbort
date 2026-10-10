import { chatLimits } from "@lanbort/contracts";
import { Secret, wipe } from "./secret";
import { utf8 } from "./suite";

/**
 * The history archive (ADR-0010 §8): one mechanism for moving a device's
 * history to a linked device and for the backup the recovery key opens.
 * The history is encrypted on the device with a random 256-bit key used for
 * this archive only, in parts of AES-256-GCM, so the server only stores
 * ciphertext. Each part is bound to its place and to how many parts there
 * are, so a part cannot be moved, swapped in from another archive, or left
 * out without opening failing.
 */

const archiveInfo = "Lanbort history archive v1";

const importKey = (raw: Uint8Array<ArrayBuffer>) =>
  crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);

/** The key is fresh for each archive, so a counter is a safe nonce. */
function partNonce(index: number): Uint8Array<ArrayBuffer> {
  const iv = new Uint8Array(12);
  new DataView(iv.buffer).setUint32(8, index);
  return iv;
}

const partData = (index: number, count: number) =>
  utf8(JSON.stringify([archiveInfo, index, count]));

/** Encrypts `plaintext` under a new key, which only the caller gets. */
export async function sealArchive(
  plaintext: Uint8Array,
  partBytes: number = chatLimits.archivePartBytes,
): Promise<{ key: Secret<Uint8Array>; parts: Uint8Array[] }> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const key = await importKey(raw);
  const count = Math.max(1, Math.ceil(plaintext.length / partBytes));
  if (count > chatLimits.archiveParts) {
    throw new Error("The archive has too many parts");
  }
  const parts: Uint8Array[] = [];

  for (let index = 0; index < count; index++) {
    const slice = plaintext.slice(index * partBytes, (index + 1) * partBytes);
    parts.push(
      new Uint8Array(
        await crypto.subtle.encrypt(
          {
            name: "AES-GCM",
            iv: partNonce(index),
            additionalData: partData(index, count),
          },
          key,
          slice,
        ),
      ),
    );
  }

  return { key: new Secret(raw), parts };
}

/**
 * Opens an archive with its key. It throws if the key is wrong, or if any
 * part was changed, reordered, added or left out.
 */
export async function openArchive(
  rawKey: Uint8Array,
  parts: readonly Uint8Array[],
): Promise<Uint8Array> {
  const copy = new Uint8Array(rawKey);
  const key = await importKey(copy);
  wipe(copy);
  const opened: Uint8Array[] = [];

  for (const [index, part] of parts.entries()) {
    opened.push(
      new Uint8Array(
        await crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: partNonce(index),
            additionalData: partData(index, parts.length),
          },
          key,
          new Uint8Array(part),
        ),
      ),
    );
  }

  if (opened.length === 0) {
    throw new Error("An archive has at least one part");
  }

  const plaintext = new Uint8Array(
    opened.reduce((length, part) => length + part.length, 0),
  );
  let offset = 0;
  for (const part of opened) {
    plaintext.set(part, offset);
    offset += part.length;
  }
  return plaintext;
}
