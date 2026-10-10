import { z } from "zod";
import type { AccountKey } from "./identity";
import { exportAccountKey, importAccountKey } from "./persist";
import type { RecoveryKey } from "./recovery";
import { Secret, wipe } from "./secret";
import { fromBase64, fromUtf8, toBase64, utf8 } from "./suite";

/**
 * What one of the account's devices hands another, sealed in the link
 * package (ADR-0010 §5) or in the recovery key's backup (§8): the account
 * key, a history archive's key if the history goes along, and the recovery
 * key's backup key so the device can keep the backup up to date.
 */

/** A history archive: where the server keeps it, and its key. */
export interface LinkedArchive {
  archiveId: string;
  /** How many parts it has; opening checks it. */
  parts: number;
  key: Secret<Uint8Array>;
}

export interface AccountPackage {
  account: AccountKey;
  archive?: LinkedArchive | undefined;
  recovery?: RecoveryKey | undefined;
}

const archiveSchema = z.strictObject({
  archiveId: z.string(),
  parts: z.number().int().positive(),
  key: z.string(),
});

const archiveWire = (archive: LinkedArchive) => ({
  archiveId: archive.archiveId,
  parts: archive.parts,
  key: toBase64(archive.key.reveal()),
});

const archiveOf = (wire: z.infer<typeof archiveSchema>): LinkedArchive => ({
  archiveId: wire.archiveId,
  parts: wire.parts,
  key: new Secret(fromBase64(wire.key)),
});

/**
 * An archive to fetch, for the device to keep in its own encrypted store
 * until the history is there, so a reload does not lose its key.
 */
export const exportLinkedArchive = (
  archive: LinkedArchive,
): Secret<Uint8Array> => new Secret(utf8(JSON.stringify(archiveWire(archive))));

export const importLinkedArchive = (encoded: Uint8Array): LinkedArchive =>
  archiveOf(archiveSchema.parse(JSON.parse(fromUtf8(encoded))));

const packageSchema = z.strictObject({
  v: z.literal(2),
  account: z.string(),
  archive: archiveSchema.optional(),
  recovery: z
    .strictObject({ id: z.string(), backupKey: z.string() })
    .optional(),
});

export function writeAccountPackage({
  account,
  archive,
  recovery,
}: AccountPackage): Uint8Array<ArrayBuffer> {
  const accountBytes = exportAccountKey(account).reveal();
  try {
    return utf8(
      JSON.stringify({
        v: 2,
        account: toBase64(accountBytes),
        ...(archive && { archive: archiveWire(archive) }),
        ...(recovery && {
          recovery: {
            id: toBase64(recovery.id),
            backupKey: toBase64(recovery.backupKey.reveal()),
          },
        }),
      }),
    );
  } finally {
    wipe(accountBytes);
  }
}

/**
 * Reads a package. One from before archives is the account key alone, as
 * `exportAccountKey` writes it.
 */
export function readAccountPackage(plain: Uint8Array): AccountPackage {
  const parsed = packageSchema.safeParse(
    (() => {
      try {
        return JSON.parse(fromUtf8(plain));
      } catch {
        return undefined;
      }
    })(),
  );

  if (!parsed.success) {
    return { account: importAccountKey(plain) };
  }

  const { archive, recovery } = parsed.data;
  const account = fromBase64(parsed.data.account);
  try {
    return {
      account: importAccountKey(account),
      ...(archive && { archive: archiveOf(archive) }),
      ...(recovery && {
        recovery: {
          id: fromBase64(recovery.id),
          backupKey: new Secret(fromBase64(recovery.backupKey)),
        },
      }),
    };
  } finally {
    wipe(account);
  }
}
