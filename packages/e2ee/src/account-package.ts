import { z } from "zod";
import type { AccountKey } from "./identity";
import { exportAccountKey, importAccountKey } from "./persist";
import type { RecoveryKey } from "./recovery";
import { Secret, wipe } from "./secret";
import { fromBase64, fromUtf8, toBase64, utf8 } from "./suite";
import { type TrustSnapshot, revokedDeviceOf } from "./trust";

/**
 * What one of the account's devices hands another, sealed in the link
 * package (ADR-0010 §5) or in the recovery key's backup (§8): the account
 * key, a history archive's key if the history goes along, the recovery
 * key's backup key so the device can keep the backup up to date, the
 * contacts' account keys the device has pinned, and the devices it knows
 * were revoked. With those, a new device trusts the keys its account
 * already trusted, instead of trusting whatever the server shows it first
 * (§3), and never trusts a device the account already stopped trusting
 * (§7). The backup key opens the backup and the history it points to, so
 * a linked device gets it only along with the history (§5).
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
  /** Pinned account keys by account id, base64, as a trust snapshot holds them. */
  pinned?: Record<string, string> | undefined;
  /** Revoked devices, as a trust snapshot holds them. */
  revoked?: string[] | undefined;
}

/** The most pinned account keys a package carries. */
export const MAX_PINNED_ACCOUNTS = 1000;
/** The most revoked devices a package carries. */
export const MAX_REVOKED_DEVICES = 300;

/**
 * What of a trust snapshot a package carries: when it holds more than
 * fits, the accounts first in `ranked` (the ones the user writes with),
 * and the revocations of the account itself and of those accounts. Never
 * nothing: a device given no pinned keys would trust whatever the server
 * shows it first, and a server can make a device pin as many accounts as
 * it likes.
 */
export function carriedTrust(
  snapshot: TrustSnapshot,
  self: string,
  ranked: readonly string[],
): { pinned: Record<string, string>; revoked: string[] } {
  const order = [...new Set([...ranked, ...Object.keys(snapshot.accountKeys)])]
    .filter((id) => id !== self && snapshot.accountKeys[id] !== undefined)
    .slice(0, MAX_PINNED_ACCOUNTS);
  const rank = new Map([self, ...order].map((id, index) => [id, index]));
  const revoked = snapshot.revoked
    .flatMap((ref) => {
      const position = rank.get(revokedDeviceOf(ref)?.accountId ?? "");
      return position === undefined ? [] : [{ ref, position }];
    })
    .sort((a, b) => a.position - b.position)
    .slice(0, MAX_REVOKED_DEVICES)
    .map(({ ref }) => ref);
  return {
    pinned: Object.fromEntries(
      order.map((id) => [id, snapshot.accountKeys[id]!]),
    ),
    revoked,
  };
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

const pinnedSchema = z
  .record(z.string().min(1).max(128), z.string().regex(/^[A-Za-z0-9+/]{43}=$/))
  .refine(
    (pinned) => Object.keys(pinned).length <= MAX_PINNED_ACCOUNTS,
    "too many pinned accounts",
  );

const revokedSchema = z
  .array(
    z
      .string()
      .max(300)
      .refine((ref) => revokedDeviceOf(ref) !== undefined),
  )
  .max(MAX_REVOKED_DEVICES);

const packageSchema = z.strictObject({
  v: z.union([z.literal(2), z.literal(3)]),
  pinned: pinnedSchema.optional(),
  revoked: revokedSchema.optional(),
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
  pinned,
  revoked,
}: AccountPackage): Uint8Array<ArrayBuffer> {
  if (pinned && pinnedSchema.safeParse(pinned).success === false) {
    throw new Error("Invalid pinned account keys");
  }
  if (revoked && revokedSchema.safeParse(revoked).success === false) {
    throw new Error("Invalid revoked devices");
  }
  const accountBytes = exportAccountKey(account).reveal();
  try {
    return utf8(
      JSON.stringify({
        v: 3,
        account: toBase64(accountBytes),
        ...(pinned && { pinned }),
        ...(revoked && { revoked }),
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

  const { archive, recovery, pinned, revoked } = parsed.data;
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
      ...(pinned && { pinned }),
      ...(revoked && { revoked }),
    };
  } finally {
    wipe(account);
  }
}
