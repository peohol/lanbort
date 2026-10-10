import {
  type AccountPackage,
  readAccountPackage,
  writeAccountPackage,
} from "./account-package";
import { decodeBase32, encodeBase32, normalizeBase32 } from "./base32";
import { Secret, wipe } from "./secret";
import { fromBase64, fromUtf8, toBase64, utf8 } from "./suite";

/**
 * The recovery key (ADR-0010 §8, PS-COM-019): 256 random bits made on the
 * device and shown once as 52 characters. Only the user has it. From it
 * come, by HKDF-SHA256, an id the server uses to tell which key a backup is
 * under, and the backup key that encrypts the account key and the key of
 * the history archive. A device keeps the backup key, never the recovery
 * key, so it can keep the backup up to date. No PIN or password is ever
 * the basis: anyone holding the ciphertext could guess those.
 */

export const RECOVERY_KEY_LENGTH = 52;
const keyBytes = 32;

export interface RecoveryKey {
  /** Public: names the key, so a backup under an older one is refused. */
  id: Uint8Array;
  backupKey: Secret<Uint8Array>;
}

const derive = async (
  raw: Uint8Array<ArrayBuffer>,
  info: string,
  bits: number,
) =>
  new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(32),
        info: utf8(info),
      },
      await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveBits"]),
      bits,
    ),
  );

async function fromRaw(raw: Uint8Array<ArrayBuffer>): Promise<RecoveryKey> {
  try {
    return {
      id: await derive(raw, "Lanbort recovery key id v1", 128),
      backupKey: new Secret(
        await derive(raw, "Lanbort recovery backup key v1", 256),
      ),
    };
  } finally {
    wipe(raw);
  }
}

/** A new recovery key: the code to show once, and what the device keeps. */
export async function createRecoveryKey(): Promise<{
  code: string;
  key: RecoveryKey;
}> {
  const raw = crypto.getRandomValues(new Uint8Array(keyBytes));
  const code = encodeBase32(raw, RECOVERY_KEY_LENGTH);
  return { code, key: await fromRaw(raw) };
}

/** The key the user typed, or undefined if it is not 52 valid characters. */
export async function readRecoveryKey(
  typed: string,
): Promise<RecoveryKey | undefined> {
  const raw = decodeBase32(
    normalizeBase32(typed),
    RECOVERY_KEY_LENGTH,
    keyBytes,
  );
  return raw && fromRaw(new Uint8Array(raw));
}

/** What a device keeps of the key, for its encrypted storage (§10). */
export const exportRecoveryKey = (key: RecoveryKey): Secret<Uint8Array> =>
  new Secret(
    utf8(
      JSON.stringify({
        v: 1,
        id: toBase64(key.id),
        backupKey: toBase64(key.backupKey.reveal()),
      }),
    ),
  );

export function importRecoveryKey(encoded: Uint8Array): RecoveryKey {
  const { id, backupKey } = JSON.parse(fromUtf8(encoded)) as {
    id: string;
    backupKey: string;
  };
  return { id: fromBase64(id), backupKey: new Secret(fromBase64(backupKey)) };
}

/** The code in groups of four, as it is shown and written down. */
export const groupRecoveryKey = (code: string) => code.match(/.{1,4}/g) ?? [];

const backupData = (accountId: string) =>
  utf8(JSON.stringify(["Lanbort recovery backup v1", accountId]));

const importBackupKey = (key: RecoveryKey) =>
  crypto.subtle.importKey(
    "raw",
    new Uint8Array(key.backupKey.reveal()),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );

/**
 * The backup the server keeps: the account key and the history archive's
 * key, under the backup key, bound to the account. The backup key stays
 * the same across backups, so each gets a random nonce.
 */
export async function sealRecoveryBackup(
  key: RecoveryKey,
  contents: Omit<AccountPackage, "recovery">,
): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = writeAccountPackage(contents);
  try {
    const sealed = new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv,
          additionalData: backupData(contents.account.accountId),
        },
        await importBackupKey(key),
        plain,
      ),
    );
    const out = new Uint8Array(iv.length + sealed.length);
    out.set(iv);
    out.set(sealed, iv.length);
    return out;
  } finally {
    wipe(plain);
  }
}

/**
 * Opens a backup with the key the user typed. It throws if the key is wrong,
 * the backup is another account's, or it was changed.
 */
export async function openRecoveryBackup(
  key: RecoveryKey,
  accountId: string,
  sealed: Uint8Array,
): Promise<AccountPackage> {
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(sealed.subarray(0, 12)),
        additionalData: backupData(accountId),
      },
      await importBackupKey(key),
      new Uint8Array(sealed.subarray(12)),
    ),
  );
  try {
    const opened = readAccountPackage(plain);
    if (opened.account.accountId !== accountId) {
      throw new Error("The backup is for another account");
    }
    return { ...opened, recovery: key };
  } finally {
    wipe(plain);
  }
}
