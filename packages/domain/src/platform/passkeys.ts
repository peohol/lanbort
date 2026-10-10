import { createHash, randomBytes } from "node:crypto";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import type { AuthenticationContext, AuthenticationMethod } from "../actor";
import { recentAuthenticationMaxAgeMs } from "../authorization/rules";

/**
 * Passkeys for platform stewards (ADR-0011, OD-0023). Lånbort verifies
 * WebAuthn itself on the server and keeps only public keys. The WebAuthn
 * ceremonies themselves (options, attestation and assertion checks) sit
 * behind {@link PasskeyCeremonies}, implemented in `packages/auth`, so this
 * module only decides who may do what and keeps the record.
 */

/** A passkey as stored: the authenticator's id, public key and counter. */
export interface StoredCredential {
  readonly id: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly signCount: number;
  readonly transports: readonly string[];
}

/** What a verified registration yields. */
export type NewCredential = StoredCredential;

/**
 * The WebAuthn ceremonies, with the relying party (domain and origins) fixed
 * by the server's own configuration, never by the request. Each verify
 * returns null for anything that does not check out, including a response
 * made for another domain or without user verification.
 */
export interface PasskeyCeremonies {
  registrationOptions(args: {
    challenge: Uint8Array;
    userHandle: Uint8Array;
    userName: string;
    existing: readonly StoredCredential[];
  }): Promise<object>;
  verifyRegistration(args: {
    response: unknown;
    challenge: Uint8Array;
  }): Promise<NewCredential | null>;
  confirmationOptions(args: {
    challenge: Uint8Array;
    allowed: readonly StoredCredential[];
  }): Promise<object>;
  /** The credential id a response names, before it is verified. */
  credentialIdOf(response: unknown): Uint8Array | null;
  verifyConfirmation(args: {
    response: unknown;
    challenge: Uint8Array;
    credential: StoredCredential;
  }): Promise<{ signCount: number } | null>;
}

/** A ceremony this session started, as a command locked it. */
export interface PasskeyChallenge {
  readonly id: string;
  readonly challenge: Uint8Array;
  readonly enrollment_code_id: string | null;
}

/** The method a passkey confirmation adds to the session's authentication. */
export const passkeyMethod = "steward_passkey";

/**
 * OD-0023: a steward needs at least two passkeys before the role gives
 * stronger access, so losing one never locks them out.
 */
export const minimumStewardPasskeys = 2;

/** No more than this many at once. */
export const maximumStewardPasskeys = 10;

/**
 * ADR-0011: privileged access needs a fresh confirmation, the same 10
 * minutes as a recent sign-in, measured on the passkey.
 */
export const passkeyConfirmationMaxAgeMs = recentAuthenticationMaxAgeMs;

/** How long a WebAuthn ceremony may take. */
export const passkeyChallengeTtlMs = 5 * 60 * 1000;

/** How long an enrollment code from the operational command is valid. */
export const enrollmentCodeTtlMs = 60 * 60 * 1000;

/** Crockford's base32 without I, L, O and U: easy to read out loud. */
const codeAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * A new enrollment code: 16 characters, 80 random bits, in groups of four
 * («K7QF-2M9X-PL4R-8DTW»). Read out on the phone or written down, never
 * e-mailed.
 */
export function newEnrollmentCode(): string {
  const chars = [...randomBytes(16)].map(
    (byte) => codeAlphabet[byte & 31] as string,
  );

  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

/**
 * The stored form of a code: a hash of it as typed, ignoring case, spaces
 * and dashes. The code has 80 random bits, so a plain hash is enough.
 */
export function enrollmentCodeHash(code: string): Buffer {
  const normalized = code
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");

  return createHash("sha256").update(normalized).digest();
}

export const newChallenge = () => randomBytes(32);

/** A user id as WebAuthn's opaque user handle: its 16 bytes. */
export function userHandle(userId: string): Uint8Array {
  return Buffer.from(userId.replaceAll("-", ""), "hex");
}

type Db = Kysely<Database>;

/** The steward's passkeys that count. */
export function activePasskeys(db: Db, userId: string) {
  return db
    .selectFrom("app.steward_passkeys")
    .select(["id", "credential_id", "public_key", "sign_count", "transports"])
    .where("user_id", "=", userId)
    .where("removed_at", "is", null)
    .orderBy("created_at");
}

export function toStoredCredential(row: {
  credential_id: Buffer;
  public_key: Buffer;
  sign_count: string | number | bigint;
  transports: string[];
}): StoredCredential {
  return {
    id: row.credential_id,
    publicKey: row.public_key,
    signCount: Number(row.sign_count),
    transports: row.transports,
  };
}

/** When this session was last confirmed with a passkey that still counts. */
async function sessionConfirmation(db: Db, userId: string, sessionId: string) {
  const row = await db
    .selectFrom("app.steward_passkey_challenges as challenge")
    .innerJoin(
      "app.steward_passkeys as passkey",
      "passkey.id",
      "challenge.passkey_id",
    )
    .select((eb) => [
      eb.fn.max("challenge.completed_at").as("confirmed_at"),
      eb
        .selectFrom("app.steward_passkeys as active")
        .select((count) => count.fn.countAll<string>().as("count"))
        .where("active.user_id", "=", userId)
        .where("active.removed_at", "is", null)
        .as("active_count"),
    ])
    .where("challenge.user_id", "=", userId)
    .where("challenge.session_id", "=", sessionId)
    .where("passkey.removed_at", "is", null)
    .executeTakeFirst();

  return row?.confirmed_at
    ? {
        confirmedAt: new Date(row.confirmed_at),
        activeCount: Number(row.active_count ?? 0),
      }
    : null;
}

/**
 * The session's authentication as Lånbort counts it (ADR-0011). The
 * provider's own assurance is never trusted: TOTP, phone, recovery codes or a
 * new e-mail code do not make a session stronger, whatever the provider
 * reports. Only a passkey confirmation in this very session does, and only
 * for a steward who has at least two passkeys, while the confirmation is
 * fresh. A method with Lånbort's own name from the provider is dropped.
 *
 * `enabled` is the deployment's switch (PLATFORM_STEWARDS_ENABLED); while it
 * is off, no confirmation counts and privileged access stays closed.
 */
export async function stewardAuthentication(
  db: Db,
  args: {
    userId: string;
    authentication: AuthenticationContext;
    holdsPlatformRole: boolean;
    enabled: boolean;
    now: Date;
  },
): Promise<AuthenticationContext> {
  const methods = args.authentication.methods.filter(
    ({ method }) => method !== passkeyMethod,
  );
  const base: AuthenticationContext = {
    ...args.authentication,
    assurance: "aal1",
    methods,
  };

  if (!args.enabled || !args.holdsPlatformRole) {
    return base;
  }

  const confirmation = await sessionConfirmation(
    db,
    args.userId,
    args.authentication.sessionId,
  );

  if (!confirmation) {
    return base;
  }

  const confirmed: AuthenticationMethod = {
    method: passkeyMethod,
    at: confirmation.confirmedAt,
  };
  const fresh =
    args.now.getTime() - confirmation.confirmedAt.getTime() <=
    passkeyConfirmationMaxAgeMs;

  return {
    ...base,
    assurance:
      fresh && confirmation.activeCount >= minimumStewardPasskeys
        ? "aal2"
        : "aal1",
    methods: [confirmed, ...methods],
  };
}
